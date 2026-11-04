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
  process.env.MCP_PUBLIC_URL = `${url}/mcp`;
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

test('approved policy supersession resolves current and historical rules deterministically', async () => {
  const old = await request('/v1/policies', admin, {
    evidence_chunk_id: document.chunks[0].chunk_id,
    domain: 'fuel',
    predicate: {},
    result: 'Rp500000',
    authority: 'HR',
    valid_from: '2026-01-01T00:00:00Z',
  });
  assert.equal(old.status, 201, JSON.stringify(old.body));
  const me = await request('/v1/auth/me', admin);
  const newer = await ingest({
    type: 'CHAT',
    title: 'Approved HR fuel update',
    state: 'APPROVED',
    issuer_id: me.body.id,
    version: 2,
    supersedes_id: document.source_id,
    valid_from: '2026-02-01T00:00:00Z',
    records: [{ text: 'Fuel allowance is Rp750000.' }],
    permissions: [{ subject_type: 'ORGANIZATION', subject_id: orgId }],
  });
  assert.equal(
    (
      await request('/v1/policies', admin, {
        evidence_chunk_id: newer.chunks[0].chunk_id,
        domain: 'fuel',
        predicate: {},
        result: 'Rp750000',
        authority: 'HR',
        valid_from: '2026-02-01T00:00:00Z',
        supersedes_id: old.body.claim_id,
      })
    ).status,
    201,
  );
  const current = await request('/v1/policies/resolve', employee, {
    domain: 'fuel',
    context: {},
    as_of: '2026-03-01T00:00:00Z',
  });
  assert.equal(current.body.status, 'SUPPORTED');
  assert.equal(current.body.applicable[0].result, 'Rp750000');
  assert.ok(
    current.body.rejected.some((c) => c.reason === 'EXPLICITLY_SUPERSEDED'),
  );
  const historical = await request('/v1/policies/resolve', employee, {
    domain: 'fuel',
    context: {},
    as_of: '2026-01-15T00:00:00Z',
  });
  assert.equal(historical.body.applicable[0].result, 'Rp500000');
  assert.equal(
    (
      await request('/v1/policies', employee, {
        evidence_chunk_id: newer.chunks[0].chunk_id,
        domain: 'fuel',
        predicate: {},
        result: 'Rp750000',
        authority: 'HR',
        valid_from: '2026-02-01T00:00:00Z',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/v1/policies', admin, {
        evidence_chunk_id: newer.chunks[0].chunk_id,
        domain: 'fuel',
        predicate: {},
        result: 'Fabricated amount',
        authority: 'HR',
        valid_from: '2026-02-01T00:00:00Z',
      })
    ).status,
    400,
  );
});

test('policy-practice reconciliation retains Director authority despite 23 VP precedents', async () => {
  const me = await request('/v1/auth/me', admin);
  const source = await ingest({
    type: 'DOCUMENT',
    title: 'Procurement policy and synthetic case ledger',
    state: 'APPROVED',
    issuer_id: me.body.id,
    content:
      'Director approval is required for SaaS renewal above Rp100M. Synthetic ledger: 23 VP approvals and 3 Director approvals.',
    permissions: [{ subject_type: 'ORGANIZATION', subject_id: orgId }],
  });
  const policy = await request('/v1/policies', admin, {
    evidence_chunk_id: source.chunks[0].chunk_id,
    domain: 'procurement',
    predicate: { amount_min: 100000001, type: 'saas' },
    result: 'Director approval is required',
    authority: 'Director',
    valid_from: '2026-01-01T00:00:00Z',
  });
  assert.equal(policy.status, 201, JSON.stringify(policy.body));
  for (let i = 0; i < 26; i++) {
    const result = await request('/v1/cases', admin, {
      domain: 'procurement',
      context: { type: 'saas', amount: 180000000 },
      outcome: 'Approved',
      authority: i < 23 ? 'VP' : 'Director',
      evidence_chunk_ids: [source.chunks[0].chunk_id],
    });
    assert.equal(result.status, 201, JSON.stringify(result.body));
  }
  const result = await request('/v1/truth/reconcile', employee, {
    domain: 'procurement',
    context: { type: 'saas', amount: 180000000 },
    max_results: 30,
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.official_truth.applicable[0].authority, 'Director');
  assert.equal(result.body.gap_flag, true);
  assert.equal(result.body.operational_truth.comparable_sample_size, 26);
  assert.equal(
    result.body.operational_truth.authority_pattern.find(
      (p) => p.authority === 'VP',
    ).count,
    23,
  );
  const outsiderCases = await request('/v1/cases/search', outsider, {
    domain: 'procurement',
    context: {},
  });
  assert.deepEqual(outsiderCases.body.results, []);
  await request(
    `/v1/sources/${source.source_id}/permissions`,
    admin,
    { permissions: [] },
    'PUT',
  );
  assert.deepEqual(
    (
      await request('/v1/cases/search', employee, {
        domain: 'procurement',
        context: {},
      })
    ).body.results,
    [],
  );
  assert.equal(
    (
      await request('/v1/policies/resolve', employee, {
        domain: 'procurement',
        context: { type: 'saas', amount: 180000000 },
      })
    ).body.status,
    'INSUFFICIENT_EVIDENCE',
  );
});

test('equally applicable conflicting approved claims require review', async () => {
  const me = await request('/v1/auth/me', admin);
  for (const result of ['Rule A', 'Rule B']) {
    const source = await ingest({
      type: 'DOCUMENT',
      title: result,
      state: 'APPROVED',
      issuer_id: me.body.id,
      content: result,
      permissions: [{ subject_type: 'ORGANIZATION', subject_id: orgId }],
    });
    assert.equal(
      (
        await request('/v1/policies', admin, {
          evidence_chunk_id: source.chunks[0].chunk_id,
          domain: 'conflict',
          predicate: {},
          result,
          authority: 'HR',
          valid_from: '2026-01-01T00:00:00Z',
        })
      ).status,
      201,
    );
  }
  const result = await request('/v1/policies/resolve', employee, {
    domain: 'conflict',
    context: {},
  });
  assert.equal(result.body.status, 'NEEDS_REVIEW');
  assert.equal(result.body.applicable.length, 2);
});

let historySource, inquiryId, agent, feedbackId;
test('inquiries wait for the external agent and validate citation identities before completion', async () => {
  historySource = await ingest({
    type: 'DOCUMENT',
    title: 'Inquiry evidence',
    content: 'Fuel approval was observed in a historical case.',
    permissions: [
      { subject_type: 'ORGANIZATION', subject_id: orgId },
      { subject_type: 'USER', subject_id: reviewerId, action: 'REVIEW' },
    ],
  });
  const inquiry = await request('/v1/inquiries', employee, {
    question: 'What happened in the fuel approval case?',
  });
  assert.equal(inquiry.status, 201, JSON.stringify(inquiry.body));
  assert.equal(inquiry.body.orchestration, 'AWAITING_AGENT');
  inquiryId = inquiry.body.inquiry_id;
  agent = (await request('/v1/auth/tool-token', employee, {})).body
    .access_token;
  const answer = {
    status: 'ANSWERED',
    answer: 'An approval was observed.',
    citations: [
      {
        source_id: historySource.source_id,
        chunk_id: historySource.chunks[0].chunk_id,
      },
    ],
  };
  assert.equal(
    (await request(`/v1/inquiries/${inquiryId}/answer`, employee, answer))
      .status,
    403,
  );
  assert.equal(
    (
      await request(`/v1/inquiries/${inquiryId}/answer`, agent, {
        ...answer,
        citations: [],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/v1/inquiries/${inquiryId}/answer`, agent, {
        ...answer,
        citations: [
          {
            source_id: randomUUID(),
            chunk_id: historySource.chunks[0].chunk_id,
          },
        ],
      })
    ).status,
    404,
  );
  assert.equal(
    (await request(`/v1/inquiries/${inquiryId}/answer`, agent, answer)).status,
    201,
  );
  assert.equal(
    (await request(`/v1/inquiries/${inquiryId}/answer`, agent, answer)).status,
    409,
  );
  assert.equal(
    (await request(`/v1/inquiries/${inquiryId}`, employee)).body.citations[0]
      .source_id,
    historySource.source_id,
  );
  assert.equal(
    (await request(`/v1/inquiries/${inquiryId}`, outsider)).status,
    404,
  );
  assert.equal(
    (await request(`/v1/inquiries/${inquiryId}`, admin)).status,
    404,
  );
});
test('feedback stays pending until an independent domain-authorized human reviewer validates it', async () => {
  const result = await request('/v1/feedback', employee, {
    inquiry_id: inquiryId,
    domain: 'fuel',
    action: 'CONFIRM',
    reason: 'Checked against the cited record.',
    proposed_case: {
      domain: 'fuel',
      context: { type: 'fuel' },
      outcome: 'Approval observed',
      authority: 'HR',
      evidence_chunk_ids: [historySource.chunks[0].chunk_id],
    },
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  feedbackId = result.body.feedback_id;
  assert.equal(result.body.status, 'PENDING_REVIEW');
  assert.equal(
    (
      await request('/v1/cases/search', employee, {
        domain: 'fuel',
        context: { type: 'fuel' },
      })
    ).body.results.length,
    0,
  );
  assert.equal(
    (
      await request(`/v1/feedback/${feedbackId}/validate`, employee, {
        decision: 'VALIDATED',
        reason: 'Self approval',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/v1/feedback/${feedbackId}/validate`, agent, {
        decision: 'VALIDATED',
        reason: 'Agent approval',
      })
    ).status,
    403,
  );
  const pending = await request('/v1/feedback?domain=fuel', reviewer);
  assert.ok(pending.body.results.some((r) => r.feedback_id === feedbackId));
  const detail = await request(`/v1/feedback/${feedbackId}`, reviewer);
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.equal(detail.body.proposed_case.authority, 'HR');
  assert.ok(detail.body.evidence.length > 0);
  const approved = await request(
    `/v1/feedback/${feedbackId}/validate`,
    reviewer,
    {
      decision: 'VALIDATED',
      reason: 'Source and context independently checked.',
    },
  );
  assert.equal(approved.status, 201, JSON.stringify(approved.body));
  assert.ok(approved.body.case_id);
  assert.equal(
    (
      await request(`/v1/feedback/${feedbackId}/validate`, reviewer, {
        decision: 'VALIDATED',
        reason: 'Duplicate',
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request('/v1/cases/search', employee, {
        domain: 'fuel',
        context: { type: 'fuel' },
      })
    ).body.results.length,
    1,
  );
});
test('revocation hides stored answer text, inquiry history, feedback and precedents', async () => {
  const revoke = await request(
    `/v1/sources/${historySource.source_id}/permissions`,
    admin,
    {
      permissions: [
        {
          subject_type: 'USER',
          subject_id: (await request('/v1/auth/me', admin)).body.id,
          action: 'READ',
        },
      ],
    },
    'PUT',
  );
  assert.equal(revoke.status, 200);
  assert.equal(
    (await request(`/v1/inquiries/${inquiryId}`, employee)).status,
    404,
  );
  assert.ok(
    !(await request('/v1/inquiries', employee)).body.results.some(
      (r) => r.inquiry_id === inquiryId,
    ),
  );
  assert.equal(
    (
      await request('/v1/cases/search', employee, {
        domain: 'fuel',
        context: {},
      })
    ).body.results.length,
    0,
  );
  assert.equal(
    (
      await request('/v1/feedback', employee, {
        inquiry_id: inquiryId,
        domain: 'fuel',
        action: 'COMMENT',
        reason: 'Stale reference',
      })
    ).status,
    404,
  );
});

test('structured answer and decision trail evidence participate in revocation checks', async () => {
  const source = await ingest({
    type: 'DOCUMENT',
    title: 'Trail-only source',
    content: 'A supporting operational record.',
    permissions: [{ subject_type: 'USER', subject_id: employeeId }],
  });
  const inquiry = await request('/v1/inquiries', employee, {
    question: 'Compare the records',
  });
  const key = inquiry.body.inquiry_id;
  const result = await request(`/v1/inquiries/${key}/answer`, agent, {
    status: 'ANSWERED',
    answer: 'A supported comparison.',
    citations: [
      { source_id: document.source_id, chunk_id: document.chunks[0].chunk_id },
    ],
    operational_truth: {
      statement: 'Operational record',
      evidence: [
        { source_id: source.source_id, chunk_id: source.chunks[0].chunk_id },
      ],
    },
    decision_trail: [
      {
        label: 'Inspect operational evidence',
        evidence: [
          { source_id: source.source_id, chunk_id: source.chunks[0].chunk_id },
        ],
      },
    ],
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(
    (await request(`/v1/inquiries/${key}`, employee)).body.decision_trail
      .length,
    1,
  );
  await request(
    `/v1/sources/${source.source_id}/permissions`,
    admin,
    { permissions: [] },
    'PUT',
  );
  assert.equal((await request(`/v1/inquiries/${key}`, employee)).status, 404);
});

test('real MCP clients discover tools and remain isolated by the bearer token subject', async () => {
  const {
    Client: McpClient,
  } = require('@modelcontextprotocol/sdk/client/index.js');
  const {
    StreamableHTTPClientTransport,
  } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const first = new McpClient({ name: 'employee-test', version: '1.0.0' });
  const second = new McpClient({ name: 'outsider-test', version: '1.0.0' });
  try {
    await first.connect(
      new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${agent}` } },
      }),
    );
    await second.connect(
      new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${outsider}` } },
      }),
    );
    const listed = await first.listTools();
    assert.equal(listed.tools.length, 8);
    assert.ok(
      listed.tools.some((t) => t.name === 'search_authorized_knowledge'),
    );
    const found = await first.callTool({
      name: 'search_authorized_knowledge',
      arguments: { query: 'fuel' },
    });
    assert.ok(JSON.parse(found.content[0].text).results.length > 0);
    const denied = await second.callTool({
      name: 'search_authorized_knowledge',
      arguments: { query: 'fuel' },
    });
    assert.deepEqual(JSON.parse(denied.content[0].text).results, []);
    const restricted = await first.callTool({
      name: 'get_evidence',
      arguments: {
        source_id: secret.source_id,
        chunk_id: secret.chunks[0].chunk_id,
      },
    });
    const missing = await first.callTool({
      name: 'get_evidence',
      arguments: { source_id: randomUUID(), chunk_id: randomUUID() },
    });
    assert.equal(restricted.isError, true);
    assert.deepEqual(restricted.content, missing.content);
    const spoofed = await first.callTool({
      name: 'search_authorized_knowledge',
      arguments: {
        query: 'Kenari',
        user_id: (await request('/v1/auth/me', admin)).body.id,
      },
    });
    assert.equal(spoofed.isError, true);
  } finally {
    await first.close();
    await second.close();
  }
});
test('MCP rejects untrusted origins and unauthenticated requests', async () => {
  const result = await fetch(`${url}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${employee}`,
      Origin: 'https://untrusted.example',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 }),
  });
  assert.equal(result.status, 403);
  assert.equal((await request('/mcp', null, {})).status, 401);
});

test('an inaccessible replacement cannot cause fallback to an obsolete official rule', async () => {
  const me = await request('/v1/auth/me', admin);
  const old = await ingest({
    type: 'DOCUMENT',
    title: 'Old scoped rule',
    state: 'APPROVED',
    issuer_id: me.body.id,
    valid_from: '2026-01-01T00:00:00Z',
    content: 'Old rule',
    permissions: [{ subject_type: 'ORGANIZATION', subject_id: orgId }],
  });
  await request('/v1/policies', admin, {
    evidence_chunk_id: old.chunks[0].chunk_id,
    domain: 'hidden-successor',
    predicate: {},
    result: 'Old rule',
    authority: 'HR',
    valid_from: '2026-01-01T00:00:00Z',
  });
  const successor = await ingest({
    type: 'DOCUMENT',
    title: 'Private replacement',
    state: 'APPROVED',
    issuer_id: me.body.id,
    version: 2,
    supersedes_id: old.source_id,
    valid_from: '2026-02-01T00:00:00Z',
    content: 'Private rule',
  });
  const result = await request('/v1/policies/resolve', employee, {
    domain: 'hidden-successor',
    context: {},
  });
  assert.equal(result.body.status, 'INSUFFICIENT_EVIDENCE');
  assert.doesNotMatch(
    JSON.stringify(result.body),
    new RegExp(successor.source_id),
  );
  assert.doesNotMatch(JSON.stringify(result.body), /Private/);
  const historical = await request('/v1/policies/resolve', employee, {
    domain: 'hidden-successor',
    context: {},
    as_of: '2026-01-15T00:00:00Z',
  });
  assert.equal(historical.body.applicable[0].result, 'Old rule');
});
test('audit access is admin-only, tenant-scoped, and records denied evidence reads', async () => {
  assert.equal((await request('/v1/audit', employee)).status, 403);
  const events = await request('/v1/audit?limit=100', admin);
  assert.equal(events.status, 200, JSON.stringify(events.body));
  assert.ok(events.body.results.length > 0);
  assert.ok(events.body.results.every((e) => e.orgId === orgId));
  assert.ok(events.body.results.some((e) => e.eventType === 'REQUEST_DENIED'));
  assert.doesNotMatch(
    JSON.stringify(events.body),
    /Test-only-password|1234567890123456/,
  );
});
test('grant validation rejects foreign users and malformed UUIDs atomically', async () => {
  const foreign = await request('/v1/auth/me', outsider);
  assert.equal(
    (
      await request(
        `/v1/sources/${document.source_id}/permissions`,
        admin,
        {
          permissions: [{ subject_type: 'USER', subject_id: foreign.body.id }],
        },
        'PUT',
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        `/v1/sources/${document.source_id}/permissions`,
        admin,
        { permissions: [{ subject_type: 'USER', subject_id: 'not-a-uuid' }] },
        'PUT',
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        `/v1/sources/${document.source_id}/evidence?chunk_id=${document.chunks[0].chunk_id}`,
        employee,
      )
    ).status,
    200,
  );
});
test('large text ingestion respects the documented body limit', async () => {
  const source = await ingest({
    type: 'DOCUMENT',
    title: 'Large text',
    content: 'Retrieval fixture. '.repeat(8000),
  });
  assert.ok(source.chunks.length > 50);
});
test('preview provides stable masked chunks for embedding without persisting a source', async () => {
  const input = {
    type: 'DOCUMENT',
    title: 'Preview',
    content: 'NIK 1234567890123456. '.repeat(120),
  };
  const count = await db.knowledgeSource.count();
  const preview = await request('/v1/knowledge/preview', admin, input);
  assert.equal(preview.status, 201, JSON.stringify(preview.body));
  assert.doesNotMatch(JSON.stringify(preview.body), /1234567890123456/);
  assert.equal(await db.knowledgeSource.count(), count);
  const stored = await ingest({
    ...input,
    embedding_model: 'preview-fixture',
    embeddings: preview.body.chunks.map(() => [1, 0, 0]),
  });
  assert.equal(stored.chunks.length, preview.body.chunks.length);
});
test('domain-owner escalation respects source ACL and is attached to insufficient answers', async () => {
  const source = await ingest({
    type: 'DOCUMENT',
    title: 'HR contact directory',
    content: 'Fuel questions: contact the HR reviewer.',
    permissions: [{ subject_type: 'USER', subject_id: employeeId }],
  });
  const body = {
    owner_id: reviewerId,
    evidence_chunk_id: source.chunks[0].chunk_id,
    contact_email: 'fuel-owner@example.test',
  };
  assert.equal(
    (await request('/v1/domains/fuel/owner', employee, body, 'PUT')).status,
    403,
  );
  assert.equal(
    (await request('/v1/domains/fuel/owner', admin, body, 'PUT')).status,
    200,
  );
  const found = await request('/v1/escalations/resolve', employee, {
    domain: 'fuel',
  });
  assert.equal(found.body.owner.contact_email, body.contact_email);
  const denied = await request('/v1/escalations/resolve', outsider, {
    domain: 'fuel',
  });
  const absent = await request('/v1/escalations/resolve', outsider, {
    domain: 'missing',
  });
  assert.deepEqual(denied.body, absent.body);
  const inquiry = await request('/v1/inquiries', employee, {
    question: 'What is the new allowance for a missing category?',
  });
  const key = inquiry.body.inquiry_id;
  assert.equal(
    (
      await request(`/v1/inquiries/${key}/answer`, agent, {
        status: 'INSUFFICIENT_EVIDENCE',
        answer: 'I do not have enough evidence. Contact the authorized owner.',
        citations: [],
        escalation_domain: 'fuel',
      })
    ).status,
    201,
  );
  assert.equal(
    (await request(`/v1/inquiries/${key}`, employee)).body.escalation.status,
    'AVAILABLE',
  );
  await request(
    `/v1/sources/${source.source_id}/permissions`,
    admin,
    { permissions: [] },
    'PUT',
  );
  assert.equal(
    (await request('/v1/escalations/resolve', employee, { domain: 'fuel' }))
      .body.status,
    'UNAVAILABLE',
  );
  assert.equal((await request(`/v1/inquiries/${key}`, employee)).status, 404);
});

test('last admin protection and deactivation revoke user and agent sessions immediately', async () => {
  const current = await request('/v1/auth/me', admin);
  assert.equal(
    (
      await request(
        `/v1/users/${current.body.id}`,
        admin,
        { active: false },
        'PATCH',
      )
    ).status,
    403,
  );
  const {
    Client: McpClient,
  } = require('@modelcontextprotocol/sdk/client/index.js');
  const {
    StreamableHTTPClientTransport,
  } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const client = new McpClient({ name: 'revocation-test', version: '1.0.0' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${agent}` } },
      }),
    );
    assert.equal(
      (
        await request(
          `/v1/users/${employeeId}`,
          admin,
          { active: false },
          'PATCH',
        )
      ).status,
      200,
    );
    assert.equal((await request('/v1/auth/me', employee)).status, 401);
    assert.equal((await request('/v1/auth/me', agent)).status, 401);
    await assert.rejects(() =>
      client.callTool({
        name: 'search_authorized_knowledge',
        arguments: { query: 'fuel' },
      }),
    );
  } finally {
    await client.close();
  }
});

test('future-effective source replacement invalidates an existing answer when it becomes active', async () => {
  const adminMe = await request('/v1/auth/me', admin);
  const source = await ingest({
    type: 'DOCUMENT',
    title: 'Scheduled policy',
    state: 'APPROVED',
    issuer_id: adminMe.body.id,
    content: 'Original scheduled rule',
    permissions: [{ subject_type: 'ORGANIZATION', subject_id: orgId }],
  });
  const inquiry = await request('/v1/inquiries', reviewer, {
    question: 'What is the scheduled rule?',
  });
  const key = inquiry.body.inquiry_id;
  const token = (await request('/v1/auth/tool-token', reviewer, {})).body
    .access_token;
  assert.equal(
    (
      await request(`/v1/inquiries/${key}/answer`, token, {
        status: 'ANSWERED',
        answer: 'Original scheduled rule',
        citations: [
          { source_id: source.source_id, chunk_id: source.chunks[0].chunk_id },
        ],
      })
    ).status,
    201,
  );
  const effectiveAt = Date.now() + 1500;
  await ingest({
    type: 'DOCUMENT',
    title: 'Scheduled replacement',
    state: 'APPROVED',
    issuer_id: adminMe.body.id,
    content: 'Replacement scheduled rule',
    version: 2,
    supersedes_id: source.source_id,
    valid_from: new Date(effectiveAt).toISOString(),
  });
  const before = await request(`/v1/inquiries/${key}`, reviewer);
  if (Date.now() < effectiveAt) assert.equal(before.body.status, 'ANSWERED');
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, effectiveAt - Date.now()) + 30),
  );
  const stale = await request(`/v1/inquiries/${key}`, reviewer);
  assert.equal(stale.body.status, 'NEEDS_REVALIDATION');
  assert.equal(stale.body.answer, null);
});

test('bootstrap CLI creates an administrator once and rejects a duplicate organization', async () => {
  const env = {
    ...process.env,
    BOOTSTRAP_ORG_SLUG: 'bootstrap-fixture',
    BOOTSTRAP_EMAIL: 'bootstrap@example.test',
    BOOTSTRAP_PASSWORD: password,
  };
  const args = [path.resolve(__dirname, '../dist/scripts/bootstrap-admin.js')];
  const options = {
    cwd: path.resolve(__dirname, '..'),
    env,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 15000,
  };
  const result = JSON.parse(execFileSync(process.execPath, args, options));
  const user = await db.user.findUniqueOrThrow({
    where: { id: result.user_id },
  });
  assert.equal(user.role, 'ADMIN');
  assert.notEqual(user.passwordHash, password);
  assert.throws(() => execFileSync(process.execPath, args, options));
  assert.equal(await db.user.count({ where: { orgId: result.org_id } }), 1);
});
