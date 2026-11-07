const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { runGroundedAgent, policyFingerprint, policyScope } = require('../dist');

const evidence = (excerpt, domains) => ({ source_id: randomUUID(), chunk_id: randomUUID(), excerpt,
  ...(domains ? { policy_domains: domains } : {}) });
const cite = (e) => ({ source_id: e.source_id, chunk_id: e.chunk_id });
const tool = (name, args) => ({ role: 'assistant', content: null, tool_calls: [{ id: randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
const draft = (e, answer = 'Wrong model claim: Rp500000; VP approval is sufficient.') => ({ status: 'ANSWERED', answer, citations: [cite(e)] });
const verdict = (supported = true, reason_code) => ({ role: 'assistant', content: JSON.stringify({ supported, ...(reason_code ? { reason_code } : {}) }) });
function scenario(question, replies, execute, reauthorize = async () => {}) {
  const requests = [], dispatched = [];
  return { requests, dispatched, input: { question, referenceTime: '2026-11-07T00:00:00.000Z', reauthorize,
    model: { async complete(messages, tools) { requests.push({ messages: structuredClone(messages), tools }); assert.ok(replies.length, 'Unexpected inference'); return replies.shift(); } },
    execute: async (name, args) => { dispatched.push({ name, args }); return execute(name, args); },
  } };
}
function policy(e, result = 'Rp750000', status = 'SUPPORTED') {
  return { status, applicable: [{ claim_id: randomUUID(), result, authority: 'HR', evidence: e }], rejected: [], as_of: '2026-11-07T00:00:00.000Z' };
}

for (const question of ['Berapa tunjangan bensin?', 'What is the fuel allowance?', 'Berapa current fuel allowance?']) {
  test(`policy result and citations remain deterministic despite a wrong draft: ${question}`, async () => {
    const old = evidence('Old allowance Rp500000.', ['fuel']);
    const current = evidence('Approved allowance Rp750000.', ['fuel']);
    const result = policy(current);
    result.rejected = [{ claim_id: randomUUID(), reason: 'EXPLICITLY_SUPERSEDED', result: 'Rp500000', evidence: old }];
    let expected;
    for (let iteration = 0; iteration < 3; iteration++) {
      const run = scenario(question, [tool('search_authorized_knowledge', { query: 'fuel' }), tool('complete_inquiry', draft(old)), verdict()],
        (name) => name === 'search_authorized_knowledge' ? { results: [old, current] } : result);
      const actual = await runGroundedAgent(run.input);
      assert.equal(actual.answer.status, 'ANSWERED');
      assert.match(actual.answer.answer, /^Aturan resmi: Rp750000|^Official policy: Rp750000/);
      assert.doesNotMatch(actual.answer.answer, /VP approval is sufficient/);
      assert.deepEqual(actual.answer.official_truth.evidence, [cite(current)]);
      assert.deepEqual(actual.answer.conflicts[0].evidence, [cite(old)]);
      assert.equal(actual.policyChecks.length, 1);
      assert.equal(actual.groundingReason, 'SUPPORTED');
      assert.deepEqual(run.dispatched.map((c) => c.name), ['search_authorized_knowledge', 'resolve_policy_claims']);
      const verification = JSON.parse(run.requests.at(-1).messages[1].content);
      assert.equal(verification.question, question);
      assert.equal(verification.reference_time, run.input.referenceTime);
      if (expected) assert.deepEqual(actual.answer, expected);
      expected = actual.answer;
    }
  });
}

for (const [status, applicable, expected] of [
  ['INSUFFICIENT_EVIDENCE', false, 'INSUFFICIENT_EVIDENCE'],
  ['NEEDS_REVIEW', true, 'INSUFFICIENT_EVIDENCE'],
  ['NEEDS_CLARIFICATION', true, 'NEEDS_CLARIFICATION'],
  ['SUPPORTED', false, 'INSUFFICIENT_EVIDENCE'],
]) test(`policy gate fails closed for ${status}, applicable=${applicable}`, async () => {
  const e = evidence('A policy claim.', ['policy']);
  const p = policy(e, 'A policy claim.', status);
  if (!applicable) p.applicable = [];
  const run = scenario('What is the policy?', [tool('get_evidence', cite(e)), tool('complete_inquiry', draft(e))],
    (name) => name === 'get_evidence' ? e : name === 'resolve_policy_claims' ? p : { status: 'UNAVAILABLE' });
  const result = await runGroundedAgent(run.input);
  assert.equal(result.answer.status, expected);
  assert.equal(run.requests.length, 2);
  assert.equal(result.answer.official_truth, null);
});

test('omitting the policy source from draft citations cannot bypass its observed domain gate', async () => {
  const e = evidence('Policy', ['policy']), other = evidence('Unrelated record');
  const run = scenario('What is the policy?', [tool('search_authorized_knowledge', { query: 'policy' }), tool('complete_inquiry', draft(other))],
    (name) => name === 'search_authorized_knowledge' ? { results: [e, other] } : { status: name === 'resolve_policy_claims' ? 'NEEDS_REVIEW' : 'UNAVAILABLE', applicable: [] });
  assert.equal((await runGroundedAgent(run.input)).answer.status, 'INSUFFICIENT_EVIDENCE');
});

test('one verified owner is retained when an abstaining draft omits its escalation field', async () => {
  const e = evidence('Published directory');
  const run = scenario('Who handles this?', [tool('resolve_domain_owner', { domain: 'hr' }), tool('complete_inquiry', { status: 'INSUFFICIENT_EVIDENCE', answer: 'Unknown', citations: [] })],
    () => ({ status: 'AVAILABLE', evidence: e }));
  assert.equal((await runGroundedAgent(run.input)).answer.escalation_domain, 'hr');
});

test('latest unavailable owner, ambiguous owners, and evidence-free owners are never selected automatically', async () => {
  for (const mode of ['removed', 'ambiguous', 'no_evidence']) {
    const e = evidence('Directory');
    const replies = [tool('resolve_domain_owner', { domain: 'hr' })];
    if (mode !== 'no_evidence') replies.push(tool('resolve_domain_owner', { domain: mode === 'ambiguous' ? 'finance' : 'hr' }));
    replies.push(tool('complete_inquiry', { status: 'INSUFFICIENT_EVIDENCE', answer: 'Unknown', citations: [] }));
    let calls = 0;
    const run = scenario('Who handles this?', replies, () => {
      calls++;
      return mode === 'no_evidence' ? { status: 'AVAILABLE' }
        : mode === 'removed' && calls === 2 ? { status: 'UNAVAILABLE' } : { status: 'AVAILABLE', evidence: e };
    });
    assert.equal((await runGroundedAgent(run.input)).answer.escalation_domain, undefined, mode);
  }
});

test('an abstention can resolve an owner only from one observed backend domain, not an empty search', async () => {
  for (const hasDomain of [true, false]) {
    const e = evidence('Policy', ['hr']), directory = evidence('Directory');
    const run = scenario('Unknown policy?', [tool('search_authorized_knowledge', { query: 'unknown' }), tool('complete_inquiry', { status: 'INSUFFICIENT_EVIDENCE', answer: 'Unknown', citations: [] })],
      (name) => name === 'search_authorized_knowledge' ? { results: hasDomain ? [e] : [] } : { status: 'AVAILABLE', evidence: directory });
    assert.equal((await runGroundedAgent(run.input)).answer.escalation_domain, hasDomain ? 'hr' : undefined);
    assert.equal(run.dispatched.length, hasDomain ? 2 : 1);
  }
});

test('inconsistent context or historical time for the same domain requires clarification', async () => {
  const e = evidence('Policy', ['fuel']);
  const run = scenario('What is the policy?', [
    tool('resolve_policy_claims', { domain: 'fuel', context: { amount: 0 } }),
    tool('resolve_policy_claims', { domain: 'fuel', context: { amount: 1 }, as_of: '2026-01-01T00:00:00Z' }),
    tool('complete_inquiry', draft(e)),
  ], () => policy(e));
  const result = await runGroundedAgent(run.input);
  assert.equal(result.answer.status, 'NEEDS_CLARIFICATION');
  assert.equal(result.groundingReason, 'POLICY_CONTEXT_REQUIRED');
  assert.equal(run.requests.length, 3);
});

test('canonical reconciliation preserves Director authority and recomputes nonbinding VP sample counts', async () => {
  const e = evidence('Director approval is required.', ['procurement']), history = evidence('Case ledger');
  const official = policy(e, 'Director approval is required.');
  official.applicable[0].authority = 'Director';
  const result = { official_truth: official, gap_flag: true, operational_truth: {
    results: Array.from({ length: 26 }, (_, i) => ({ case_id: randomUUID(), authority: i < 23 ? 'VP' : 'Director', comparable: true, evidence: [history] })),
    authority_pattern: [{ authority: 'VP', count: 999999 }], comparable_sample_size: 999999,
  } };
  const run = scenario('Compare policy and precedent', [tool('reconcile_truth', { domain: 'procurement', context: { type: 'saas', amount: 180000000 } }), tool('complete_inquiry', draft(e)), verdict()], () => result);
  const actual = await runGroundedAgent(run.input);
  assert.match(actual.answer.official_truth.statement, /Director/);
  assert.match(actual.answer.operational_truth.statement, /26.*Director: 3; VP: 23/);
  assert.doesNotMatch(actual.answer.answer, /999999|VP approval is sufficient/);
  assert.match(actual.answer.limitations[0], /does not change formal/);
  assert.ok(actual.answer.conflicts.some((c) => /Historical practice differs/.test(c.statement)));
});

test('separate precedent and policy tools retain scoped operational evidence', async () => {
  const e = evidence('Director approval required', ['procurement']), history = evidence('Validated VP case');
  const run = scenario('Compare policy and precedent', [
    tool('find_validated_precedents', { domain: 'procurement', context: { amount: 180000000, type: 'saas' } }),
    tool('complete_inquiry', draft(history)), verdict(),
  ], (name) => name === 'find_validated_precedents'
    ? { results: [{ case_id: randomUUID(), authority: 'VP', comparable: true, evidence: [e, history] }] }
    : policy(e, 'Director approval required'));
  const result = await runGroundedAgent(run.input);
  assert.equal(result.answer.status, 'ANSWERED');
  assert.match(result.answer.operational_truth.statement, /VP: 1/);
  assert.deepEqual(run.dispatched.at(-1).args.context, { amount: 180000000, type: 'saas' });
});

test('unresolved formal conflict quotes both authorized alternatives without declaring a winner', async () => {
  const a = evidence('Rule A', ['policy']), b = evidence('Rule B', ['policy']);
  const p = policy(a, 'Rule A', 'NEEDS_REVIEW');
  p.applicable.push({ ...policy(b, 'Rule B').applicable[0] });
  const run = scenario('What is the policy?', [tool('get_evidence', cite(a)), tool('complete_inquiry', draft(a))],
    (name) => name === 'get_evidence' ? a : name === 'resolve_policy_claims' ? p : { status: 'UNAVAILABLE' });
  const result = await runGroundedAgent(run.input);
  assert.equal(result.answer.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(result.answer.official_truth, null);
  assert.equal(result.answer.conflicts.length, 2);
  assert.match(result.answer.answer, /Rule A.*\nRule B/s);
  assert.equal(run.requests.length, 2);
});

test('material policy facts affect snapshots; object key order and observation clock do not', () => {
  assert.equal(policyFingerprint({ as_of: 'old', status: 'SUPPORTED', applicable: [] }), policyFingerprint({ applicable: [], status: 'SUPPORTED', as_of: 'new' }));
  assert.notEqual(policyFingerprint({ status: 'SUPPORTED', applicable: [] }), policyFingerprint({ status: 'NEEDS_REVIEW', applicable: [] }));
  assert.equal(policyScope({ domain: 'x', context: { b: false, a: 0 } }), policyScope({ context: { a: 0, b: false }, domain: 'x' }));
  assert.notEqual(policyScope({ domain: 'x', context: { a: 0 } }), policyScope({ domain: 'x', context: { a: 1 } }));
});

test('unsupported, contradictory, and malformed verifier reasons fail closed', async () => {
  for (const reply of [verdict(false, 'WRONG_SCOPE'), verdict(true, 'WRONG_DATE'), { role: 'assistant', content: '{"supported":true,"reason_code":"invented"}' }]) {
    const e = evidence('Ordinary fact');
    const run = scenario('A question?', [tool('get_evidence', cite(e)), tool('complete_inquiry', draft(e)), reply], () => e);
    const result = await runGroundedAgent(run.input);
    assert.equal(result.answer.status, 'INSUFFICIENT_EVIDENCE');
    assert.notEqual(result.groundingReason, 'SUPPORTED');
  }
});

test('automatic policy calls retain budgets and reauthorize before executing', async () => {
  const e = evidence('Policy', ['fuel']);
  const run = scenario('What is the policy?', [tool('get_evidence', cite(e)), tool('complete_inquiry', draft(e))], () => e,
    async (refs) => { if (refs.length) throw new Error('revoked before policy call'); });
  await assert.rejects(runGroundedAgent(run.input), /revoked/);
  assert.equal(run.dispatched.length, 1);
  const many = evidence('Too many policy domains', Array.from({ length: 31 }, (_, i) => `domain${i}`));
  const bounded = scenario('What is the policy?', [tool('get_evidence', cite(many))], () => many);
  await assert.rejects(runGroundedAgent(bounded.input), (e) => e.code === 'AI_BUDGET_EXCEEDED');
});

test('a later mutation of a tool object cannot rewrite the retained policy snapshot', async () => {
  const e = evidence('Rp750000', ['fuel']), p = policy(e);
  const run = scenario('Berapa tunjangan?', [tool('get_evidence', cite(e)), tool('complete_inquiry', draft(e)), verdict()],
    (name) => name === 'get_evidence' ? e : p);
  const complete = run.input.model.complete;
  run.input.model.complete = async (...args) => {
    const reply = await complete(...args);
    if (run.requests.length === 3) p.applicable[0].result = 'Changed by a shared mutable object';
    return reply;
  };
  const result = await runGroundedAgent(run.input);
  assert.equal(result.policyChecks[0].result.applicable[0].result, 'Rp750000');
  assert.match(result.answer.answer, /^Aturan resmi: Rp750000/);
});

test('automatic policy and owner lookups share the same twelve-tool budget', async () => {
  const e = evidence('Rp750000', ['fuel']);
  const batch = (count) => {
    const reply = tool('search_authorized_knowledge', { query: 'fuel' });
    for (let i = 1; i < count; i++) reply.tool_calls.push(...tool('search_authorized_knowledge', { query: 'fuel' }).tool_calls);
    return reply;
  };
  const run = scenario('What is the policy?', [batch(4), batch(4), batch(2), tool('complete_inquiry', draft(e)), verdict(false)],
    (name) => name === 'search_authorized_knowledge' ? { results: [e] } : policy(e));
  await assert.rejects(runGroundedAgent(run.input), (e) => e.code === 'AI_BUDGET_EXCEEDED');
  assert.equal(run.dispatched.length, 11);
  assert.ok(!run.dispatched.some((c) => c.name === 'resolve_domain_owner'));
  assert.equal(run.requests.length, 5);
});

test('one verified owner is not selected automatically when the observed subject has multiple domains', async () => {
  const source = evidence('Two domain policies', ['hr', 'finance']), directory = evidence('HR directory');
  const run = scenario('What is missing?', [tool('get_evidence', cite(source)), tool('resolve_domain_owner', { domain: 'hr' }),
    tool('complete_inquiry', { status: 'INSUFFICIENT_EVIDENCE', answer: 'Unknown', citations: [] })],
    (name) => name === 'get_evidence' ? source : { status: 'AVAILABLE', evidence: directory });
  assert.equal((await runGroundedAgent(run.input)).answer.escalation_domain, undefined);
});
