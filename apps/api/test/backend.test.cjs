const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { Client } = require('pg');

let container,
  app,
  db,
  url,
  admin,
  employee,
  outsider,
  reviewer,
  orgId,
  employeeId,
  reviewerId;
let document, secret, hybrid, taskSource;
const password = 'Test-only-password-2026!';
const docker = (...args) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60000,
  }).trim();
async function request(
  route,
  token,
  body,
  method = body === undefined ? 'GET' : 'POST',
) {
  const response = await fetch(`${url}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    body: await response.json(),
    headers: response.headers,
  };
}
async function login(email, slug = 'test-org') {
  const response = await request('/v1/auth/login', null, {
    org_slug: slug,
    email,
    password,
  });
  assert.equal(response.status, 201);
  return response.body.access_token;
}
async function ingest(input) {
  const response = await request('/v1/knowledge/ingest', admin, input);
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body;
}
before(async () => {
  container = `veridict-test-${process.pid}-${randomUUID().slice(0, 8)}`;
  docker(
    'run',
    '--rm',
    '-d',
    '--name',
    container,
    '-e',
    'POSTGRES_USER=test',
    '-e',
    'POSTGRES_PASSWORD=test',
    '-e',
    'POSTGRES_DB=veridict_test',
    '-p',
    '127.0.0.1::5432',
    'pgvector/pgvector:pg17',
  );
  const port = docker('port', container, '5432/tcp').split(':').at(-1);
  process.env.DATABASE_URL = `postgresql://test:test@127.0.0.1:${port}/veridict_test`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    const probe = new Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 500,
    });
    try {
      await probe.connect();
      await probe.query('SELECT 1');
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    } finally {
      await probe.end().catch(() => {});
    }
  }
  assert.ok(ready, 'Isolated PostgreSQL must be ready');
  execFileSync(
    process.execPath,
    [
      path.resolve(__dirname, '../../../node_modules/prisma/build/index.js'),
      'migrate',
      'deploy',
    ],
    {
      cwd: path.resolve(__dirname, '..'),
      env: process.env,
      stdio: 'pipe',
      timeout: 60000,
    },
  );
  const { createApplication } = require('../dist/application');
  const { DatabaseService } = require('../dist/database/database.service');
  const { hashPassword } = require('../dist/auth/password');
  app = await createApplication(false);
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
  db = app.get(DatabaseService);
  const org = await db.organization.create({
    data: { slug: 'test-org', name: 'Test organization' },
  });
  orgId = org.id;
  const secondOrg = await db.organization.create({
    data: { slug: 'other-org', name: 'Other organization' },
  });
  const passwordHash = await hashPassword(password);
  await db.user.create({
    data: {
      orgId,
      email: 'admin@example.test',
      name: 'Admin',
      passwordHash,
      department: 'HR',
      role: 'ADMIN',
    },
  });
  const employeeRow = await db.user.create({
    data: {
      orgId,
      email: 'employee@example.test',
      name: 'Employee',
      passwordHash,
      department: 'Operations',
    },
  });
  employeeId = employeeRow.id;
  const reviewerRow = await db.user.create({
    data: {
      orgId,
      email: 'reviewer@example.test',
      name: 'Reviewer',
      passwordHash,
      department: 'HR',
      role: 'REVIEWER',
      reviewDomains: ['fuel', 'procurement'],
    },
  });
  reviewerId = reviewerRow.id;
  await db.user.create({
    data: {
      orgId: secondOrg.id,
      email: 'outsider@example.test',
      name: 'Outsider',
      passwordHash,
      department: 'Operations',
    },
  });
  admin = await login('admin@example.test');
  employee = await login('employee@example.test');
  reviewer = await login('reviewer@example.test');
  outsider = await login('outsider@example.test', 'other-org');
  const me = await request('/v1/auth/me', admin);
  document = await ingest({
    type: 'DOCUMENT',
    title: 'Fuel policy',
    content:
      'Fuel allowance reimbursement Rp500000. NIK 1234567890123456; phone +62 812-3456-7890.',
    state: 'APPROVED',
    issuer_id: me.body.id,
    permissions: [
      { subject_type: 'ORGANIZATION', subject_id: orgId, action: 'READ' },
      { subject_type: 'USER', subject_id: reviewerId, action: 'REVIEW' },
    ],
  });
  secret = await ingest({
    type: 'CHAT',
    title: 'Kenari confidential',
    records: [
      {
        text: 'Kenari secret budget',
        author: 'Director',
        reference: 'kenari-message-1',
      },
    ],
  });
  hybrid = await ingest({
    type: 'DOCUMENT',
    title: 'Vector fixture',
    content: 'Automobile mileage allowance',
    embedding_model: 'test-fixture-v1',
    embeddings: [[1, 0, 0]],
    permissions: [{ subject_type: 'USER', subject_id: employeeId }],
  });
  taskSource = await ingest({
    type: 'TASK',
    title: 'Onboarding task',
    records: [{ text: 'Submit reimbursement form', reference: 'task-1' }],
    permissions: [{ subject_type: 'DEPARTMENT', subject_id: 'Operations' }],
  });
});
after(async () => {
  if (app) await app.close();
  if (container) {
    try {
      docker('rm', '-f', container);
    } catch {
      /* Already removed. */
    }
  }
});

test('all business routes require authentication; health stays public', async () => {
  assert.equal(
    (await request('/v1/knowledge/search', null, { query: 'fuel' })).status,
    401,
  );
  assert.equal((await fetch(`${url}/health`)).status, 200);
  assert.equal((await request('/v1/auth/me', reviewer)).body.role, 'REVIEWER');
});
test('strict contracts reject model-supplied identity and invalid input', async () => {
  assert.equal(
    (
      await request('/v1/knowledge/search', employee, {
        query: 'fuel',
        user_id: employeeId,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/v1/knowledge/search', employee, {
        query: 'fuel',
        limit: 10000,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/v1/knowledge/ingest', employee, {
        type: 'DOCUMENT',
        title: 'x',
        content: 'x',
      })
    ).status,
    403,
  );
});
test('lexical retrieval returns only visible evidence and masks personal data', async () => {
  const response = await request('/v1/knowledge/search', employee, {
    query: 'fuel',
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.equal(response.body.results[0].source_id, document.source_id);
  assert.doesNotMatch(
    JSON.stringify(response.body),
    /1234567890123456|812-3456/,
  );
  assert.equal(response.body.results[0].redacted, true);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('restricted and nonexistent search results are indistinguishable', async () => {
  const authorized = await request('/v1/knowledge/search', admin, {
    query: 'Kenari',
  });
  assert.equal(authorized.body.results[0].source_id, secret.source_id);
  const denied = await request('/v1/knowledge/search', employee, {
    query: 'Kenari',
  });
  const missing = await request('/v1/knowledge/search', employee, {
    query: 'nonexistentfoobar',
  });
  assert.equal(denied.status, missing.status);
  assert.deepEqual(denied.body, missing.body);
});
test('cross-organization retrieval and evidence are denied without existence hints', async () => {
  const result = await request('/v1/knowledge/search', outsider, {
    query: 'fuel',
  });
  assert.deepEqual(result.body.results, []);
  const denied = await request(
    `/v1/sources/${document.source_id}/evidence?chunk_id=${document.chunks[0].chunk_id}`,
    outsider,
  );
  const missing = await request(
    `/v1/sources/${randomUUID()}/evidence?chunk_id=${randomUUID()}`,
    outsider,
  );
  assert.equal(denied.status, 404);
  assert.deepEqual(denied.body, missing.body);
});
test('hybrid search uses model-matched vectors, never arbitrary mismatched dimensions', async () => {
  const result = await request('/v1/knowledge/search', employee, {
    query: 'transportation',
    embedding: [1, 0, 0],
    embedding_model: 'test-fixture-v1',
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.mode, 'HYBRID');
  assert.equal(result.body.results[0].source_id, hybrid.source_id);
  const wrong = await request('/v1/knowledge/search', employee, {
    query: 'transportation',
    embedding: [1, 0],
    embedding_model: 'test-fixture-v1',
  });
  assert.equal(wrong.status, 201, JSON.stringify(wrong.body));
  assert.deepEqual(wrong.body.results, []);
});
test('department ACL permits task retrieval and SQL injection remains plain input', async () => {
  const result = await request('/v1/knowledge/search', employee, {
    query: 'reimbursement',
  });
  assert.ok(
    result.body.results.some((r) => r.source_id === taskSource.source_id),
  );
  const injection = await request('/v1/knowledge/search', employee, {
    query: '\'); DROP TABLE "User"; --',
  });
  assert.equal(injection.status, 201);
  assert.ok((await db.user.count()) >= 4);
});
test('permission revocation affects the next query and a previously opened citation', async () => {
  const evidencePath = `/v1/sources/${hybrid.source_id}/evidence?chunk_id=${hybrid.chunks[0].chunk_id}`;
  assert.equal((await request(evidencePath, employee)).status, 200);
  assert.equal(
    (
      await request(
        `/v1/sources/${hybrid.source_id}/permissions`,
        admin,
        { permissions: [] },
        'PUT',
      )
    ).status,
    200,
  );
  assert.equal((await request(evidencePath, employee)).status, 404);
  const result = await request('/v1/knowledge/search', employee, {
    query: 'mileage',
    embedding: [1, 0, 0],
    embedding_model: 'test-fixture-v1',
  });
  assert.deepEqual(result.body.results, []);
});
test('audit data is tenant-scoped and contains no raw search content', async () => {
  const event = await db.auditEvent.findFirst({
    where: { eventType: 'KNOWLEDGE_SEARCH', actorId: employeeId },
  });
  assert.equal(event.orgId, orgId);
  assert.equal(typeof event.metadata.query_hash, 'string');
  assert.ok(!('query' in event.metadata));
});
test('delegated tool sessions cannot create users or issue more tool sessions', async () => {
  const result = await request('/v1/auth/tool-token', employee, {});
  assert.equal(result.status, 201);
  const token = result.body.access_token;
  assert.equal((await request('/v1/users', token, {})).status, 403);
  assert.equal((await request('/v1/auth/tool-token', token, {})).status, 401);
  assert.equal(
    (await request('/v1/knowledge/search', token, { query: 'fuel' })).status,
    201,
  );
  assert.equal((await request('/v1/auth/logout', token, {})).status, 201);
  assert.equal((await request('/v1/auth/me', token)).status, 401);
});
