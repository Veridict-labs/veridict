const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { evaluateContext } = require('../dist/policy/policy.service');
const { policyInput } = require('@veridict/contracts');

for (const [context, matches, missing] of [
  [{}, true, ['amount', 'type']],
  [{ amount: 100 }, true, ['type']],
  [{ amount: '150', type: 'saas' }, true, ['amount']],
  [{ amount: 150, type: false }, true, ['type']],
  [{ amount: 99, type: 'saas' }, false, []],
  [{ amount: 100, type: 'saas' }, true, []],
  [{ amount: 200, type: 'saas' }, true, []],
  [{ amount: 201, type: 'saas' }, false, []],
  [{ amount: 150, type: 'other' }, false, []],
  [{ type: 'other' }, false, []],
]) test(`predicate context is deterministic: ${JSON.stringify(context)}`, () => {
  assert.deepEqual(evaluateContext({ amount_min: 100, amount_max: 200, type: 'saas' }, context), { matches, missing });
});

test('zero and false are supplied values and inherited fields are not user context', () => {
  assert.deepEqual(evaluateContext({ amount_min: 0, enabled: false }, { amount: 0, enabled: false }), { matches: true, missing: [] });
  assert.deepEqual(evaluateContext({ enabled: false }, Object.create({ enabled: false })), { matches: true, missing: ['enabled'] });
});

test('invalid predicate operators, contradictory ranges, and empty keys are rejected before persistence', () => {
  const base = { evidence_chunk_id: randomUUID(), domain: 'test', result: 'Rule', authority: 'HR', valid_from: '2026-01-01T00:00:00Z' };
  for (const predicate of [{ amount_min: '100' }, { amount_min: 200, amount_max: 100 }, { '': 1 }, { _min: 0 }, { amount: 50, amount_min: 100 }, { amount: '100', amount_max: 200 }])
    assert.equal(policyInput.safeParse({ ...base, predicate }).success, false, JSON.stringify(predicate));
  assert.equal(policyInput.safeParse({ ...base, predicate: { amount_min: 100, amount_max: 100 } }).success, true);
});
