const { test } = require('node:test');
const assert = require('node:assert/strict');
const { noAiQuery, noAiAnswer } = require('../dist/agent/no-ai');
const { randomUUID } = require('node:crypto');

test('AI-off search extracts bounded literal keywords from natural-language questions', () => {
  assert.equal(
    noAiQuery('Berapa tunjangan bensin saya?'),
    '"tunjangan" OR "bensin"',
  );
  assert.equal(
    noAiQuery('What is the fuel allowance?'),
    '"fuel" OR "allowance"',
  );
  assert.equal(noAiQuery('apa saya???'), null);
  assert.equal(noAiQuery('fuel OR "fuel" -budget'), '"fuel" OR "budget"');
  assert.ok(noAiQuery('a'.repeat(4000)).length < 2000);
});

test('AI off returns source text with citations without treating matching text as policy', () => {
  const evidence = {
    source_id: randomUUID(),
    chunk_id: randomUUID(),
    title: 'Fuel memo',
    source_state: 'SUPERSEDED',
    excerpt: 'Fuel Rp300000. [REDACTED_NIK]',
  };
  const result = noAiAnswer('Berapa bensin saya?', [evidence]);
  assert.equal(result.status, 'ANSWERED');
  assert.match(result.answer, /Fuel Rp300000\. \[REDACTED_NIK\]/);
  assert.match(result.answer, /SUPERSEDED/);
  assert.match(result.answer, /belum menentukan aturan/);
  assert.deepEqual(result.citations, [
    { source_id: evidence.source_id, chunk_id: evidence.chunk_id },
  ]);
  assert.equal(result.official_truth, null);
  assert.equal(result.operational_truth, null);
  assert.deepEqual(result.conflicts, []);
  assert.match(result.limitations[0], /Tidak memahami sinonim/);
});

test('AI off abstains without evidence and bounds large source output', () => {
  const missing = noAiAnswer('What is nonexistent?', []);
  assert.equal(missing.status, 'INSUFFICIENT_EVIDENCE');
  assert.deepEqual(missing.citations, []);
  assert.match(missing.answer, /No accessible sources/);
  const large = Array.from({ length: 30 }, () => ({
    source_id: randomUUID(),
    chunk_id: randomUUID(),
    title: 'x'.repeat(4000),
    source_state: 'DRAFT',
    excerpt: 'y'.repeat(20000),
  }));
  const bounded = noAiAnswer('fuel', large);
  assert.equal(bounded.citations.length, 5);
  assert.ok(bounded.answer.length < 20000);
});
