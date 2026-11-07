const { before, beforeEach, after, test } = require('node:test');
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
beforeEach(() => {
  // Each scenario gets its own request budget; the real guard stays enabled.
  const { ThrottlerStorage } = require('@nestjs/throttler');
  app.get(ThrottlerStorage).onApplicationShutdown();
});
async function request(
  route,
  token,
  body,
  method = body === undefined ? 'GET' : 'POST',
  extraHeaders = {},
) {
  const response = await fetch(`${url}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...extraHeaders,
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
    assert.equal(listed.tools.length, 9);
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

test('inquiry-bound MCP sessions correlate tool activity and reject a different inquiry', async () => {
  const source = await ingest({
    type: 'DOCUMENT',
    title: 'Trace fixture',
    content: 'Tracealpha decision evidence.',
    permissions: [{ subject_type: 'USER', subject_id: employeeId }],
  });
  const inquiry = await request('/v1/inquiries', employee, {
    question: 'Explain Tracealpha',
  });
  const other = await request('/v1/inquiries', employee, {
    question: 'Another question',
  });
  const key = inquiry.body.inquiry_id;
  const token = (
    await request('/v1/auth/tool-token', employee, { inquiry_id: key })
  ).body.access_token;
  const {
    Client: McpClient,
  } = require('@modelcontextprotocol/sdk/client/index.js');
  const {
    StreamableHTTPClientTransport,
  } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const client = new McpClient({
    name: 'inquiry-trace-test',
    version: '1.0.0',
  });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    assert.ok(
      !(
        await client.callTool({
          name: 'search_authorized_knowledge',
          arguments: { query: 'Tracealpha' },
        })
      ).isError,
    );
    const denied = await client.callTool({
      name: 'get_evidence',
      arguments: {
        source_id: secret.source_id,
        chunk_id: secret.chunks[0].chunk_id,
      },
    });
    assert.equal(denied.isError, true);
    const wrong = await client.callTool({
      name: 'search_authorized_knowledge',
      arguments: { query: 'Tracealpha', inquiry_id: other.body.inquiry_id },
    });
    assert.equal(wrong.isError, true);
    const answer = await client.callTool({
      name: 'complete_inquiry',
      arguments: {
        inquiry_id: key,
        status: 'ANSWERED',
        answer: 'The cited decision is Tracealpha.',
        citations: [
          { source_id: source.source_id, chunk_id: source.chunks[0].chunk_id },
        ],
      },
    });
    assert.ok(!answer.isError, JSON.stringify(answer));
  } finally {
    await client.close();
  }
  const trace = await request(`/v1/inquiries/${key}/trace?limit=100`, employee);
  assert.equal(trace.status, 200, JSON.stringify(trace.body));
  const events = trace.body.results;
  assert.ok(events.some((e) => e.event_type === 'INQUIRY_CREATED'));
  assert.ok(events.some((e) => e.event_type === 'INQUIRY_ANSWERED'));
  assert.ok(
    events.some(
      (e) =>
        e.event_type === 'KNOWLEDGE_SEARCH' &&
        e.resource_refs.includes(source.source_id),
    ),
  );
  assert.ok(events.some((e) => e.event_type === 'MCP_TOOL_DENIED'));
  for (const start of events.filter((e) => e.event_type === 'MCP_TOOL_STARTED'))
    assert.ok(
      events.some(
        (e) =>
          e.tool_call_id === start.tool_call_id &&
          ['MCP_TOOL_COMPLETED', 'MCP_TOOL_DENIED'].includes(e.event_type),
      ),
    );
  assert.doesNotMatch(JSON.stringify(events), new RegExp(secret.source_id));
  assert.equal(
    (await request(`/v1/inquiries/${key}/trace`, outsider)).status,
    404,
  );
  assert.equal(
    (await request('/v1/auth/tool-token', reviewer, { inquiry_id: key }))
      .status,
    404,
  );
  const audit = await request(`/v1/audit?inquiry_id=${key}&limit=100`, admin);
  assert.ok(audit.body.results.every((e) => e.inquiryId === key));
});

test('REST inquiry context is owner-checked and trace references are reauthorized', async () => {
  const inquiry = await request('/v1/inquiries', employee, {
    question: 'Pending trace question',
  });
  const key = inquiry.body.inquiry_id;
  const source = await ingest({
    type: 'DOCUMENT',
    title: 'Trace revocation fixture',
    content: 'Tracebeta record.',
    permissions: [{ subject_type: 'USER', subject_id: employeeId }],
  });
  assert.equal(
    (
      await request(
        '/v1/knowledge/search',
        employee,
        { query: 'Tracebeta' },
        'POST',
        { 'X-Inquiry-ID': key },
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await request(
        '/v1/knowledge/search',
        outsider,
        { query: 'Tracebeta' },
        'POST',
        { 'X-Inquiry-ID': key },
      )
    ).status,
    404,
  );
  const before = await request(`/v1/inquiries/${key}/trace`, employee);
  assert.match(JSON.stringify(before.body), new RegExp(source.source_id));
  await request(
    `/v1/sources/${source.source_id}/permissions`,
    admin,
    { permissions: [] },
    'PUT',
  );
  const after = await request(`/v1/inquiries/${key}/trace`, employee);
  assert.equal(after.status, 200);
  assert.doesNotMatch(JSON.stringify(after.body), new RegExp(source.source_id));
});

test('personal-data disclosure requires original intent, READ and a category/purpose grant', async () => {
  const phone = '+62 812-3456-7890';
  const nik = '1234567890123456';
  const source = await ingest({
    type: 'DOCUMENT',
    title: 'Private contact fixture',
    content: `Contact phone: ${phone}. NIK ${nik}. Email: private.person@example.test`,
    permissions: [{ subject_type: 'USER', subject_id: employeeId }],
  });
  const target = {
    source_id: source.source_id,
    chunk_id: source.chunks[0].chunk_id,
  };
  const personal = {
    ...target,
    field_type: 'PHONE',
    purpose: 'CONTACT_PERSON',
  };
  assert.equal(
    (
      await request('/v1/inquiries', employee, {
        question: 'Explain reimbursement policy',
        personal_data_request: personal,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/v1/inquiries', employee, {
        question: 'Jangan tampilkan nomor telepon',
        personal_data_request: personal,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/v1/inquiries', employee, {
        question: 'Berapa nomor telepon PIC?',
        personal_data_request: { ...personal, purpose: 'VERIFY_IDENTITY' },
      })
    ).status,
    400,
  );
  const inquiry = await request('/v1/inquiries', employee, {
    question: 'Berapa nomor telepon PIC untuk saya hubungi?',
    personal_data_request: personal,
  });
  const key = inquiry.body.inquiry_id;
  assert.equal(inquiry.status, 201, JSON.stringify(inquiry.body));
  const path = `/v1/sources/${source.source_id}/personal-data`;
  const body = { inquiry_id: key, chunk_id: target.chunk_id };
  assert.equal((await request(path, employee, body)).status, 404);
  const grants = [
    {
      field_type: 'PHONE',
      purpose: 'CONTACT_PERSON',
      subject_type: 'USER',
      subject_id: employeeId,
    },
  ];
  assert.equal(
    (
      await request(
        `/v1/sources/${source.source_id}/personal-data-grants`,
        employee,
        { grants },
        'PUT',
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/v1/sources/${source.source_id}/personal-data-grants`,
        admin,
        { grants },
        'PUT',
      )
    ).status,
    200,
  );
  const value = await request(path, employee, body);
  assert.equal(value.body.value, phone);
  assert.doesNotMatch(JSON.stringify(value.body), new RegExp(nik));
  const normal = await request(
    `/v1/sources/${source.source_id}/evidence?chunk_id=${target.chunk_id}`,
    employee,
  );
  assert.doesNotMatch(
    JSON.stringify(normal.body),
    /812-3456|1234567890123456|private.person@example.test/,
  );
  const token = (
    await request('/v1/auth/tool-token', employee, { inquiry_id: key })
  ).body.access_token;
  const {
    Client: McpClient,
  } = require('@modelcontextprotocol/sdk/client/index.js');
  const {
    StreamableHTTPClientTransport,
  } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const client = new McpClient({
    name: 'personal-data-test',
    version: '1.0.0',
  });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    const result = await client.callTool({
      name: 'get_personal_data',
      arguments: { inquiry_id: key, ...target },
    });
    assert.equal(JSON.parse(result.content[0].text).value, phone);
  } finally {
    await client.close();
  }
  const answer = await request(`/v1/inquiries/${key}/answer`, token, {
    status: 'ANSWERED',
    answer: `Phone: ${phone}. NIK: ${nik}.`,
    citations: [target],
  });
  assert.equal(answer.status, 201, JSON.stringify(answer.body));
  const displayed = await request(`/v1/inquiries/${key}`, employee);
  assert.match(displayed.body.answer, /812-3456-7890/);
  assert.doesNotMatch(displayed.body.answer, new RegExp(nik));
  await request(
    `/v1/sources/${source.source_id}/personal-data-grants`,
    admin,
    { grants: [] },
    'PUT',
  );
  assert.equal((await request(path, employee, body)).status, 404);
  assert.doesNotMatch(
    (await request(`/v1/inquiries/${key}`, employee)).body.answer,
    /812-3456-7890/,
  );
  const logs = await db.auditEvent.findMany({ where: { inquiryId: key } });
  assert.ok(logs.some((e) => e.eventType === 'PERSONAL_DATA_DISCLOSED'));
  assert.doesNotMatch(
    JSON.stringify(logs),
    /812-3456-7890|1234567890123456|private.person@example.test/,
  );
});

test('annotation-based categories remain masked and can be disclosed independently', async () => {
  const records = [
    [
      'EMAIL',
      'CONTACT_PERSON',
      'What is the email address?',
      'private.employee@example.test',
    ],
    [
      'ADDRESS',
      'FULFILL_SERVICE',
      'Tampilkan alamat untuk layanan pengiriman',
      'Jalan Contoh 123',
    ],
    [
      'DATE_OF_BIRTH',
      'VERIFY_IDENTITY',
      'What is the date of birth?',
      '1995-03-14',
    ],
    [
      'BANK_ACCOUNT',
      'PROCESS_REIMBURSEMENT',
      'Berapa nomor rekening untuk reimbursement?',
      '000111222333',
    ],
    [
      'NAME',
      'IDENTIFY_PERSON',
      'Tampilkan nama lengkap pegawai',
      'Demo Private Person',
    ],
    [
      'NPWP',
      'TAX_ADMINISTRATION',
      'Berapa NPWP untuk administrasi pajak?',
      '00.000.000.0-000.000',
    ],
    [
      'PASSPORT_NUMBER',
      'VERIFY_IDENTITY',
      'What is the passport number?',
      'A1234567',
    ],
    [
      'SALARY',
      'PAYROLL_ADMINISTRATION',
      'Tampilkan gaji untuk administrasi payroll',
      'Rp12.000.000',
    ],
    [
      'HEALTH_INFORMATION',
      'BENEFITS_ADMINISTRATION',
      'Tampilkan informasi kesehatan untuk benefit',
      'Synthetic confidential health detail',
    ],
  ];
  for (const [field_type, purpose, question, value] of records) {
    const content = `Private fixture: ${value}`;
    const source = await ingest({
      type: 'DOCUMENT',
      title: `${field_type} fixture`,
      content,
      personal_data_annotations: [
        { field_type, start: content.indexOf(value), end: content.length },
      ],
      permissions: [{ subject_type: 'USER', subject_id: employeeId }],
    });
    const target = {
      source_id: source.source_id,
      chunk_id: source.chunks[0].chunk_id,
    };
    assert.ok(
      !(
        await request(
          `/v1/sources/${target.source_id}/evidence?chunk_id=${target.chunk_id}`,
          employee,
        )
      ).body.excerpt.includes(value),
    );
    const inquiry = await request('/v1/inquiries', employee, {
      question,
      personal_data_request: { ...target, field_type, purpose },
    });
    assert.equal(inquiry.status, 201, JSON.stringify(inquiry.body));
    const key = inquiry.body.inquiry_id;
    await request(
      `/v1/sources/${target.source_id}/personal-data-grants`,
      admin,
      {
        grants: [
          { field_type, purpose, subject_type: 'USER', subject_id: employeeId },
        ],
      },
      'PUT',
    );
    const result = await request(
      `/v1/sources/${target.source_id}/personal-data`,
      employee,
      { inquiry_id: key, chunk_id: target.chunk_id },
    );
    assert.equal(result.body.value, value, JSON.stringify(result.body));
    assert.equal(
      (
        await request(
          `/v1/sources/${target.source_id}/personal-data`,
          outsider,
          { inquiry_id: key, chunk_id: target.chunk_id },
        )
      ).status,
      404,
    );
    if (field_type === 'NAME') {
      const token = (
        await request('/v1/auth/tool-token', employee, { inquiry_id: key })
      ).body.access_token;
      await request(`/v1/inquiries/${key}/answer`, token, {
        status: 'ANSWERED',
        answer: value,
        citations: [target],
      });
      assert.equal(
        (await request(`/v1/inquiries/${key}`, employee)).body.answer,
        value,
      );
      await request(
        `/v1/sources/${target.source_id}/personal-data-grants`,
        admin,
        { grants: [] },
        'PUT',
      );
      assert.ok(
        !(await request(`/v1/inquiries/${key}`, employee)).body.answer.includes(
          value,
        ),
      );
    }
  }
});

test('personal-data disclosure rejects ambiguous values and foreign grants', async () => {
  const source = await ingest({
    type: 'DOCUMENT',
    title: 'Ambiguous contact fixture',
    content: 'First +62 812-3456-7890. Second +62 813-2222-3333.',
    permissions: [{ subject_type: 'USER', subject_id: employeeId }],
  });
  const target = {
    source_id: source.source_id,
    chunk_id: source.chunks[0].chunk_id,
  };
  const inquiry = await request('/v1/inquiries', employee, {
    question: 'What is the phone number?',
    personal_data_request: {
      ...target,
      field_type: 'PHONE',
      purpose: 'CONTACT_PERSON',
    },
  });
  const foreign = (await request('/v1/auth/me', outsider)).body.id;
  assert.equal(
    (
      await request(
        `/v1/sources/${target.source_id}/personal-data-grants`,
        admin,
        {
          grants: [
            {
              field_type: 'PHONE',
              purpose: 'CONTACT_PERSON',
              subject_type: 'USER',
              subject_id: foreign,
            },
          ],
        },
        'PUT',
      )
    ).status,
    400,
  );
  await request(
    `/v1/sources/${target.source_id}/personal-data-grants`,
    admin,
    {
      grants: [
        {
          field_type: 'PHONE',
          purpose: 'CONTACT_PERSON',
          subject_type: 'USER',
          subject_id: employeeId,
        },
      ],
    },
    'PUT',
  );
  assert.equal(
    (
      await request(`/v1/sources/${target.source_id}/personal-data`, employee, {
        inquiry_id: inquiry.body.inquiry_id,
        chunk_id: target.chunk_id,
      })
    ).status,
    404,
  );
});

test('annotated personal values stay masked in policies, cases and reviewer metadata', async () => {
  const value = 'Example Confidential Name';
  const me = (await request('/v1/auth/me', admin)).body;
  const source = await ingest({
    type: 'DOCUMENT',
    title: 'Private metadata fixture',
    state: 'APPROVED',
    issuer_id: me.id,
    content: value,
    personal_data_annotations: [
      { field_type: 'NAME', start: 0, end: value.length },
    ],
    permissions: [
      { subject_type: 'ORGANIZATION', subject_id: orgId },
      { subject_type: 'USER', subject_id: reviewerId, action: 'REVIEW' },
    ],
  });
  const target = {
    source_id: source.source_id,
    chunk_id: source.chunks[0].chunk_id,
  };
  await request('/v1/policies', admin, {
    evidence_chunk_id: target.chunk_id,
    domain: 'private-metadata',
    predicate: { person: value },
    result: value,
    authority: value,
    valid_from: '2026-01-01T00:00:00Z',
  });
  const policy = await request('/v1/policies/resolve', employee, {
    domain: 'private-metadata',
    context: { person: value },
  });
  assert.equal(policy.body.status, 'SUPPORTED');
  assert.ok(!JSON.stringify(policy.body).includes(value));
  await request('/v1/cases', admin, {
    domain: 'private-metadata',
    context: { type: 'fixture' },
    outcome: value,
    authority: value,
    evidence_chunk_ids: [target.chunk_id],
  });
  const cases = await request('/v1/cases/search', employee, {
    domain: 'private-metadata',
    context: { type: 'fixture' },
  });
  assert.ok(!JSON.stringify(cases.body).includes(value));
  const inquiry = await request('/v1/inquiries', employee, {
    question: 'Explain the fixture metadata',
  });
  const key = inquiry.body.inquiry_id;
  await request(`/v1/inquiries/${key}/answer`, agent, {
    status: 'ANSWERED',
    answer: value,
    citations: [target],
  });
  assert.ok(
    !(await request(`/v1/inquiries/${key}`, employee)).body.answer.includes(
      value,
    ),
  );
  const feedback = await request('/v1/feedback', employee, {
    inquiry_id: key,
    domain: 'fuel',
    action: 'COMMENT',
    reason: value,
    proposed_case: {
      domain: 'fuel',
      context: { person: value },
      outcome: value,
      authority: value,
      evidence_chunk_ids: [target.chunk_id],
    },
  });
  const detail = await request(
    `/v1/feedback/${feedback.body.feedback_id}`,
    reviewer,
  );
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.ok(!JSON.stringify(detail.body).includes(value));
  const pending = await request('/v1/feedback?domain=fuel', reviewer);
  assert.ok(!JSON.stringify(pending.body).includes(value));
});

test('personal-data annotations are masked across overlapping chunk boundaries', async () => {
  const value = 'PRIVATE_ADDRESS_VALUE_WITH_SPACES';
  const content = 'a'.repeat(1590) + value + 'b'.repeat(400);
  const source = await ingest({
    type: 'DOCUMENT',
    title: 'Split private field',
    content,
    personal_data_annotations: [
      { field_type: 'ADDRESS', start: 1590, end: 1590 + value.length },
    ],
    permissions: [{ subject_type: 'USER', subject_id: employeeId }],
  });
  for (const chunk of source.chunks) {
    const result = await request(
      `/v1/sources/${source.source_id}/evidence?chunk_id=${chunk.chunk_id}`,
      employee,
    );
    assert.equal(result.status, 200);
    assert.ok(!result.body.excerpt.includes(value));
    if (chunk.span_start <= 1590 && chunk.span_end > 1590)
      assert.match(result.body.excerpt, /REDACTED_ADDRESS/);
  }
  assert.equal(
    (
      await request('/v1/knowledge/ingest', admin, {
        type: 'DOCUMENT',
        title: 'Invalid annotations',
        content: 'short',
        personal_data_annotations: [{ field_type: 'NAME', start: 0, end: 100 }],
      })
    ).status,
    400,
  );
});

test('shared demo fixtures seed reproducible policies, permissions and privacy scenarios', async () => {
  const { seedDemo } = require('../dist/demo/seed-demo');
  const seeded = await seedDemo(app, { slug: 'shared-demo-test', password });
  assert.equal(seeded.synthetic, true);
  assert.equal(seeded.scenarios.length, 7);
  const demoEmployee = await login('employee@example.test', seeded.org_slug);
  assert.deepEqual(
    (await request('/v1/knowledge/search', demoEmployee, { query: 'Kenari' }))
      .body.results,
    [],
  );
  const fuel = await request('/v1/policies/resolve', demoEmployee, {
    domain: 'fuel',
    context: {},
  });
  assert.equal(fuel.body.applicable[0].result, 'Rp750000');
  const history = await request('/v1/truth/reconcile', demoEmployee, {
    domain: 'procurement',
    context: { type: 'saas', amount: 180000000 },
    max_results: 30,
  });
  assert.equal(history.body.operational_truth.comparable_sample_size, 26);
  assert.equal(
    history.body.operational_truth.authority_pattern.find(
      (p) => p.authority === 'VP',
    ).count,
    23,
  );
  assert.equal(history.body.gap_flag, true);
  const types = new Set(
    (
      await request('/v1/knowledge/search', demoEmployee, {
        query: 'onboarding',
      })
    ).body.results.map((r) => r.source_type),
  );
  assert.equal(types.size, 3);
  assert.equal(
    (await request('/v1/escalations/resolve', demoEmployee, { domain: 'fuel' }))
      .body.status,
    'AVAILABLE',
  );
  for (const key of ['phone_allowed', 'nik_denied']) {
    const scenario = seeded.scenarios.find((s) => s.key === key);
    const inquiry = await request('/v1/inquiries', demoEmployee, {
      question: scenario.question,
      personal_data_request: scenario.personal_data_request,
    });
    assert.equal(inquiry.status, 201, JSON.stringify(inquiry.body));
    const target = scenario.personal_data_request;
    const result = await request(
      `/v1/sources/${target.source_id}/personal-data`,
      demoEmployee,
      { inquiry_id: inquiry.body.inquiry_id, chunk_id: target.chunk_id },
    );
    assert.equal(
      result.status,
      key === 'phone_allowed' ? 201 : 404,
      JSON.stringify(result.body),
    );
  }
  await assert.rejects(() =>
    seedDemo(app, { slug: seeded.org_slug, password }),
  );
  assert.equal(
    await db.organization.count({ where: { slug: seeded.org_slug } }),
    1,
  );
});

async function policyFixture(domain, predicate = {}) {
  const me = (await request('/v1/auth/me', admin)).body;
  const source = await ingest({
    type: 'DOCUMENT', title: domain, state: 'APPROVED', issuer_id: me.id,
    content: `${domain} Benefit Rp750000. Alternative Rp990000. Manager approval. Director approval.`,
    permissions: [{ subject_type: 'ORGANIZATION', subject_id: orgId }],
  });
  const input = { evidence_chunk_id: source.chunks[0].chunk_id, domain, predicate,
    result: 'Rp750000', authority: 'HR', valid_from: '2020-01-01T00:00:00Z' };
  const created = await request('/v1/policies', admin, input);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return { source, input, claim: created.body.claim_id };
}

async function runPolicyFixture(fixture, beforeVerdict, scope) {
  const { ModelProvider } = require('../dist/agent/model.provider');
  const provider = app.get(ModelProvider), original = provider.create;
  provider.create = () => {
    let calls = 0;
    return { provider: 'gemini', modelId: 'test/synthetic-policy', model: { complete: async () => {
      calls++;
      if (calls === 1) return hfTool('search_authorized_knowledge', { query: fixture.input.domain });
      if (scope && calls === 2) return hfTool('resolve_policy_claims', { domain: fixture.input.domain, context: {}, ...scope });
      if (calls === (scope ? 3 : 2)) return hfTool('complete_inquiry', {
        status: 'ANSWERED', answer: 'The wrong allowance is Rp500000.',
        citations: [{ source_id: fixture.source.source_id, chunk_id: fixture.source.chunks[0].chunk_id }],
      });
      if (beforeVerdict) await beforeVerdict();
      return { role: 'assistant', content: '{"supported":true,"reason_code":"SUPPORTED"}' };
    } } };
  };
  try {
    const created = await request('/v1/inquiries', reviewer, { question: `Berapa tunjangan ${fixture.input.domain}${scope?.as_of ? ` per ${scope.as_of}` : ''}?` });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.inquiry_id;
    return { id, result: await request(`/v1/inquiries/${id}/run`, reviewer, {}) };
  } finally { provider.create = original; }
}

test('policy hints are ACL-scoped, and the runtime cannot override a validated amount', async () => {
  const fixture = await policyFixture('policyproofalpha');
  const target = `/v1/sources/${fixture.source.source_id}/evidence?chunk_id=${fixture.source.chunks[0].chunk_id}`;
  assert.deepEqual((await request(target, reviewer)).body.policy_domains, ['policyproofalpha']);
  assert.equal((await request(target, outsider)).status, 404);
  assert.deepEqual((await request('/v1/knowledge/search', outsider, { query: 'policyproofalpha' })).body.results, []);
  const { id, result } = await runPolicyFixture(fixture);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const opened = (await request(`/v1/inquiries/${id}`, reviewer)).body;
  assert.equal(opened.status, 'ANSWERED');
  assert.match(opened.answer, /^Aturan resmi: Rp750000/);
  assert.doesNotMatch(opened.answer, /Rp500000/);
  assert.doesNotMatch(JSON.stringify(opened), /_policy_checks/);
  const trace = (await request(`/v1/inquiries/${id}/trace?limit=100`, reviewer)).body.results;
  assert.ok(trace.some((e) => e.event_type === 'POLICY_RESOLVED'));
  assert.ok(trace.some((e) => e.event_type === 'AI_RUN_COMPLETED' && e.metadata.grounding_reason === 'SUPPORTED' && e.metadata.policy_checks === 1));
  const changed = await request('/v1/policies', admin, { ...fixture.input, result: 'Rp990000' });
  assert.equal(changed.status, 201, JSON.stringify(changed.body));
  const stale = (await request(`/v1/inquiries/${id}`, reviewer)).body;
  assert.equal(stale.status, 'NEEDS_REVALIDATION');
  assert.equal(stale.answer, null);
  assert.deepEqual(stale.citations, []);
  const rerun = await runPolicyFixture(fixture);
  assert.equal(rerun.result.status, 201, JSON.stringify(rerun.result.body));
  assert.equal(rerun.result.body.status, 'INSUFFICIENT_EVIDENCE');
});

test('a policy changed during support verification cannot be persisted', async () => {
  const fixture = await policyFixture('policyproofbeta');
  const { id, result } = await runPolicyFixture(fixture, async () => {
    const changed = await request('/v1/policies', admin, { ...fixture.input, result: 'Rp990000' });
    assert.equal(changed.status, 201);
  });
  assert.equal(result.status, 409, JSON.stringify(result.body));
  const row = await db.inquiry.findUniqueOrThrow({ where: { id } });
  assert.equal(row.status, 'PENDING');
  assert.equal(row.answer, null);
  assert.equal(row.structuredAnswer, null);
  assert.equal(await db.session.count({ where: { userId: reviewerId, inquiryId: id, kind: 'AGENT' } }), 0);
});

test('partial and wrongly typed context cannot fall back to a less specific policy', async () => {
  const fixture = await policyFixture('policyproofcontext');
  const specific = await request('/v1/policies', admin, {
    ...fixture.input, predicate: { amount_min: 100, amount_max: 200, type: 'saas' },
    result: 'Director approval', authority: 'Director', supersedes_id: fixture.claim,
  });
  assert.equal(specific.status, 201, JSON.stringify(specific.body));
  for (const [context, status, missing] of [
    [{}, 'NEEDS_CLARIFICATION', ['amount', 'type']],
    [{ amount: 150 }, 'NEEDS_CLARIFICATION', ['type']],
    [{ amount: '150', type: 'saas' }, 'NEEDS_CLARIFICATION', ['amount']],
    [{ amount: 100, type: 'saas' }, 'SUPPORTED', []],
    [{ amount: 200, type: 'saas' }, 'SUPPORTED', []],
    [{ amount: 99, type: 'saas' }, 'SUPPORTED', []],
    [{ amount: 201, type: 'saas' }, 'SUPPORTED', []],
  ]) {
    const r = await request('/v1/policies/resolve', reviewer, { domain: fixture.input.domain, context });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.status, status, JSON.stringify(context));
    assert.deepEqual(r.body.required_context, missing);
    if (status === 'SUPPORTED') assert.equal(r.body.applicable[0].authority, context.amount >= 100 && context.amount <= 200 ? 'Director' : 'HR');
  }
  const run = await runPolicyFixture(fixture);
  assert.equal(run.result.body.status, 'NEEDS_CLARIFICATION');
});

test('historical snapshot stays historical and future-effective claim changes stale a current answer', async () => {
  const fixture = await policyFixture('policyprooftemporal');
  const future = await request('/v1/policies', admin, {
    ...fixture.input, result: 'Rp990000', valid_from: '2099-01-01T00:00:00Z', supersedes_id: fixture.claim,
  });
  assert.equal(future.status, 201);
  const { id, result } = await runPolicyFixture(fixture);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal((await request(`/v1/inquiries/${id}`, reviewer)).body.status, 'ANSWERED');
  const historical = await runPolicyFixture(fixture, undefined, { as_of: '2020-06-01T00:00:00Z' });
  assert.equal(historical.result.status, 201, JSON.stringify(historical.result.body));
  const { Clock } = require('../dist/common/clock');
  const clock = app.get(Clock), actualNow = clock.now;
  try {
    clock.now = () => new Date('2099-01-01T00:00:00Z');
    assert.equal((await request(`/v1/inquiries/${id}`, reviewer)).body.status, 'NEEDS_REVALIDATION');
    const pinned = (await request(`/v1/inquiries/${historical.id}`, reviewer)).body;
    assert.equal(pinned.status, 'ANSWERED');
    assert.match(pinned.answer, /Rp750000/);
  } finally { clock.now = actualNow; }
});

test('policy evidence revocation during verification aborts the complete pipeline', async () => {
  const fixture = await policyFixture('policyproofrevocation');
  const { id, result } = await runPolicyFixture(fixture, async () => {
    await request(`/v1/sources/${fixture.source.source_id}/permissions`, admin, { permissions: [] }, 'PUT');
  });
  assert.ok([404, 409].includes(result.status), JSON.stringify(result.body));
  assert.equal((await db.inquiry.findUniqueOrThrow({ where: { id } })).answer, null);
});

test('history titles are redacted on the server and removed after READ revocation', async () => {
  const value = 'Synthetic Private Employee';
  const source = await ingest({
    type: 'DOCUMENT', title: 'Private name fixture', content: value,
    personal_data_annotations: [{ field_type: 'NAME', start: 0, end: value.length }],
    permissions: [{ subject_type: 'USER', subject_id: employeeId }],
  });
  const created = await request('/v1/inquiries', employee, {
    question: `Tampilkan nama ${value}, email private@fixture.invalid`,
    personal_data_request: {
      source_id: source.source_id, chunk_id: source.chunks[0].chunk_id,
      field_type: 'NAME', purpose: 'IDENTIFY_PERSON',
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const key = created.body.inquiry_id;
  const list = await request('/v1/inquiries?limit=100', employee);
  assert.equal(list.status, 200);
  const row = list.body.results.find((r) => r.inquiry_id === key);
  assert.ok(row, JSON.stringify(list.body));
  assert.match(row.question, /REDACTED_NAME/);
  assert.doesNotMatch(row.question, /Synthetic Private Employee|private@fixture.invalid/);
  const opened = await request(`/v1/inquiries/${key}`, employee);
  assert.equal(opened.body.question, row.question);
  await db.permission.deleteMany({ where: { sourceId: source.source_id } });
  assert.equal((await request(`/v1/inquiries/${key}`, employee)).status, 404);
  assert.ok(!(await request('/v1/inquiries?limit=100', employee)).body.results.some((r) => r.inquiry_id === key));
});

test('inquiry run releases only a permitted personal value without calling a cloud model', async () => {
  const { ModelProvider } = require('../dist/agent/model.provider');
  const provider = app.get(ModelProvider);
  const original = provider.create;
  let calls = 0;
  provider.create = () => { calls++; throw new Error('Personal data must not enter a cloud run'); };
  try {
    const phone = '+62 812-4444-5555';
    const nik = '1234567890123456';
    const source = await ingest({
      type: 'DOCUMENT', title: 'Scoped contact', content: `Phone: ${phone}. NIK ${nik}.`,
      permissions: [{ subject_type: 'USER', subject_id: employeeId }],
    });
    const target = { source_id: source.source_id, chunk_id: source.chunks[0].chunk_id };
    const personal = { ...target, field_type: 'PHONE', purpose: 'CONTACT_PERSON' };
    const create = async () => {
      const r = await request('/v1/inquiries', employee, {
        question: 'Can you tell me the mobile number?', personal_data_request: personal,
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      return r.body.inquiry_id;
    };
    const deniedId = await create();
    const denied = await request(`/v1/inquiries/${deniedId}/run`, employee, {});
    assert.equal(denied.status, 201, JSON.stringify(denied.body));
    assert.equal(denied.body.status, 'INSUFFICIENT_EVIDENCE');
    assert.doesNotMatch(JSON.stringify((await request(`/v1/inquiries/${deniedId}`, employee)).body), /4444-5555|1234567890123456/);
    await request(`/v1/sources/${source.source_id}/personal-data-grants`, admin, {
      grants: [{ field_type: 'PHONE', purpose: 'CONTACT_PERSON', subject_type: 'USER', subject_id: employeeId }],
    }, 'PUT');
    const key = await create();
    assert.equal((await request(`/v1/inquiries/${key}/run`, outsider, {})).status, 404);
    const token = (await request('/v1/auth/tool-token', employee, { inquiry_id: key })).body.access_token;
    assert.equal((await request(`/v1/inquiries/${key}/run`, token, {})).status, 403);
    const result = await request(`/v1/inquiries/${key}/run`, employee, {});
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(result.body.status, 'ANSWERED');
    assert.equal(result.body.model_calls, 0);
    const opened = (await request(`/v1/inquiries/${key}`, employee)).body;
    assert.equal(opened.answer, phone);
    assert.deepEqual(opened.personal_data_request, personal);
    assert.doesNotMatch(JSON.stringify(opened.citations), /4444-5555|1234567890123456/);
    assert.equal((await request(`/v1/inquiries/${key}/run`, employee, {})).status, 409);
    await request(`/v1/sources/${source.source_id}/personal-data-grants`, admin, { grants: [] }, 'PUT');
    assert.doesNotMatch((await request(`/v1/inquiries/${key}`, employee)).body.answer, /4444-5555/);
    const logs = await db.auditEvent.findMany({ where: { inquiryId: key } });
    assert.ok(logs.some((e) => e.eventType === 'PERSONAL_DATA_DISCLOSED' && e.toolCallId));
    assert.doesNotMatch(JSON.stringify(logs), /4444-5555|1234567890123456/);
    assert.equal(calls, 0);
    await db.permission.deleteMany({ where: { sourceId: source.source_id } });
    assert.equal((await request(`/v1/inquiries/${key}`, employee)).status, 404);
  } finally { provider.create = original; }
});

test('inquiry run never releases an ambiguous personal value even with a grant', async () => {
  const source = await ingest({
    type: 'DOCUMENT', title: 'Ambiguous contact',
    content: 'Contact +62 812-3333-4444 or +62 813-5555-6666.',
    permissions: [{ subject_type: 'USER', subject_id: employeeId }],
  });
  await request(`/v1/sources/${source.source_id}/personal-data-grants`, admin, {
    grants: [{ field_type: 'PHONE', purpose: 'CONTACT_PERSON', subject_type: 'USER', subject_id: employeeId }],
  }, 'PUT');
  const created = await request('/v1/inquiries', employee, {
    question: 'Tampilkan nomor telepon PIC',
    personal_data_request: { source_id: source.source_id, chunk_id: source.chunks[0].chunk_id, field_type: 'PHONE', purpose: 'CONTACT_PERSON' },
  });
  const key = created.body.inquiry_id;
  const result = await request(`/v1/inquiries/${key}/run`, employee, {});
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.status, 'INSUFFICIENT_EVIDENCE');
  assert.doesNotMatch(JSON.stringify((await request(`/v1/inquiries/${key}`, employee)).body), /3333-4444|5555-6666/);
});

test('inquiry run keeps the production request limit enabled', async () => {
  const created = await request('/v1/inquiries', employee, { question: 'Rate limit fixture' });
  assert.equal(created.status, 201);
  const route = `/v1/inquiries/${created.body.inquiry_id}/run`;
  for (let attempt = 0; attempt < 10; attempt++)
    assert.equal((await request(route, outsider, {})).status, 404);
  assert.equal((await request(route, outsider, {})).status, 429);
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
  const { Clock } = require('../dist/common/clock');
  const clock = app.get(Clock), actualNow = clock.now;
  const effectiveAt = actualNow().getTime() + 60000;
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
  try {
    clock.now = () => new Date(effectiveAt - 1);
    assert.equal((await request(`/v1/inquiries/${key}`, reviewer)).body.status, 'ANSWERED');
    clock.now = () => new Date(effectiveAt);
    const stale = await request(`/v1/inquiries/${key}`, reviewer);
    assert.equal(stale.body.status, 'NEEDS_REVALIDATION');
    assert.equal(stale.body.answer, null);
    clock.now = () => new Date(effectiveAt + 1);
    assert.equal((await request(`/v1/inquiries/${key}`, reviewer)).body.status, 'NEEDS_REVALIDATION');
  } finally { clock.now = actualNow; }
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

function hfTool(name, args) {
  return {
    role: 'assistant',
    content: null,
    tool_calls: [
      {
        id: randomUUID(),
        type: 'function',
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  };
}

test('HF runtime completes an owner inquiry with correlated tools and revokes all exposed context', async () => {
  const { ModelProvider } = require('../dist/agent/model.provider');
  const provider = app.get(ModelProvider);
  const original = provider.create;
  let modelCalls = 0;
  const primary = await ingest({
    type: 'DOCUMENT',
    title: 'HF primary fixture',
    content: 'hfcheckpoint Fuel allowance is Rp750000.',
    permissions: [{ subject_type: 'ORGANIZATION', subject_id: orgId }],
  });
  const secondary = await ingest({
    type: 'DOCUMENT',
    title: 'HF secondary fixture',
    content: 'hfcheckpoint Another accessible record.',
    permissions: [{ subject_type: 'ORGANIZATION', subject_id: orgId }],
  });
  const inquiry = (
    await request('/v1/inquiries', reviewer, {
      question: 'Berapa tunjangan bensin hfcheckpoint?',
    })
  ).body.inquiry_id;
  const citation = {
    source_id: primary.source_id,
    chunk_id: primary.chunks[0].chunk_id,
  };
  provider.create = () => ({
    provider: 'gemini',
    modelId: 'test/synthetic',
    model: {
      complete: async () => {
        modelCalls++;
        if (modelCalls === 1)
          return hfTool('search_authorized_knowledge', {
            query: 'hfcheckpoint',
            limit: 2,
          });
        if (modelCalls === 2)
          return hfTool('complete_inquiry', {
            status: 'ANSWERED',
            answer: 'Tunjangan bensin Rp750000.',
            citations: [citation],
          });
        return { role: 'assistant', content: '{"supported":true}' };
      },
    },
  });
  try {
    assert.equal(
      (await request(`/v1/inquiries/${inquiry}/run`, outsider, {})).status,
      404,
    );
    assert.equal(
      (await request(`/v1/inquiries/${inquiry}/run`, admin, {})).status,
      404,
    );
    const delegated = (
      await request('/v1/auth/tool-token', reviewer, { inquiry_id: inquiry })
    ).body.access_token;
    assert.equal(
      (await request(`/v1/inquiries/${inquiry}/run`, delegated, {})).status,
      403,
    );
    assert.equal(
      (
        await request(`/v1/inquiries/${inquiry}/run`, reviewer, {
          user_id: reviewerId,
        })
      ).status,
      400,
    );
    assert.equal(modelCalls, 0);
    const result = await request(`/v1/inquiries/${inquiry}/run`, reviewer, {});
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(result.body.status, 'ANSWERED');
    assert.equal(result.body.model_calls, 3);
    const stored = await request(`/v1/inquiries/${inquiry}`, reviewer);
    assert.equal(stored.body.citations.length, 2);
    const trace = await request(
      `/v1/inquiries/${inquiry}/trace?limit=100`,
      reviewer,
    );
    assert.ok(
      trace.body.results.some(
        (e) => e.event_type === 'AI_TOOL_STARTED' && e.tool_call_id,
      ),
    );
    assert.ok(
      trace.body.results.some((e) => e.event_type === 'AI_RUN_COMPLETED'),
    );
    assert.equal(
      await db.session.count({
        where: { userId: reviewerId, kind: 'AGENT', inquiryId: inquiry },
      }),
      1,
      'Only the explicitly created external delegated token remains',
    );
    assert.equal(
      (await request(`/v1/inquiries/${inquiry}/run`, reviewer, {})).status,
      409,
    );
    assert.equal(modelCalls, 3);
    await db.permission.deleteMany({
      where: { sourceId: secondary.source_id },
    });
    assert.equal(
      (await request(`/v1/inquiries/${inquiry}`, reviewer)).status,
      404,
      'Even context omitted from the final citation list is reauthorized',
    );
  } finally {
    provider.create = original;
  }
});

test('HF quota failure leaves the inquiry pending, releases the session and returns a safe error', async () => {
  const { ModelProvider } = require('../dist/agent/model.provider');
  const { AgentError } = require('@veridict/agent');
  const provider = app.get(ModelProvider);
  const original = provider.create;
  const inquiry = (
    await request('/v1/inquiries', reviewer, {
      question: 'Synthetic quota check',
    })
  ).body.inquiry_id;
  provider.create = () => ({
    provider: 'gemini',
    modelId: 'test/synthetic',
    model: {
      complete: async () => {
        throw new AgentError('AI_QUOTA_EXHAUSTED');
      },
    },
  });
  try {
    const result = await request(`/v1/inquiries/${inquiry}/run`, reviewer, {});
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'AI_QUOTA_EXHAUSTED');
    assert.equal(
      (await request(`/v1/inquiries/${inquiry}`, reviewer)).body.status,
      'PENDING',
    );
    assert.equal(
      await db.session.count({
        where: { userId: reviewerId, kind: 'AGENT', inquiryId: inquiry },
      }),
      0,
    );
  } finally {
    provider.create = original;
  }
});

test('HF completion rechecks ACL after a model response and never stores a revoked answer', async () => {
  const { ModelProvider } = require('../dist/agent/model.provider');
  const provider = app.get(ModelProvider);
  const original = provider.create;
  const source = await ingest({
    type: 'DOCUMENT',
    title: 'HF revocation fixture',
    content: 'hfrevocation The amount is Rp750000.',
    permissions: [{ subject_type: 'ORGANIZATION', subject_id: orgId }],
  });
  const inquiry = (
    await request('/v1/inquiries', reviewer, {
      question: 'Berapa jumlah hfrevocation?',
    })
  ).body.inquiry_id;
  let calls = 0;
  provider.create = () => ({
    provider: 'gemini',
    modelId: 'test/synthetic',
    model: {
      complete: async () => {
        calls++;
        if (calls === 1)
          return hfTool('search_authorized_knowledge', {
            query: 'hfrevocation',
          });
        await db.permission.deleteMany({
          where: { sourceId: source.source_id },
        });
        return hfTool('complete_inquiry', {
          status: 'ANSWERED',
          answer: 'Rp750000',
          citations: [
            {
              source_id: source.source_id,
              chunk_id: source.chunks[0].chunk_id,
            },
          ],
        });
      },
    },
  });
  try {
    assert.equal(
      (await request(`/v1/inquiries/${inquiry}/run`, reviewer, {})).status,
      404,
    );
    const row = await db.inquiry.findUniqueOrThrow({ where: { id: inquiry } });
    assert.equal(row.status, 'PENDING');
    assert.equal(row.answer, null);
    assert.equal(calls, 2);
    assert.equal(
      await db.session.count({
        where: { userId: reviewerId, kind: 'AGENT', inquiryId: inquiry },
      }),
      0,
    );
  } finally {
    provider.create = original;
  }
});
