const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  splitContent,
  normalize,
  maskPII,
} = require('../dist/knowledge/content');

test('chunk spans reproduce persisted content including Unicode and overlaps', () => {
  const content = 'Office policy 😀\n'.repeat(500);
  const chunks = splitContent(content);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.equal(chunk.content, content.slice(chunk.spanStart, chunk.spanEnd));
    assert.ok(chunk.content.length <= 1600);
    assert.ok(!/^[\uDC00-\uDFFF]/.test(chunk.content));
    assert.ok(!/[\uD800-\uDBFF]$/.test(chunk.content));
  }
  assert.equal(chunks.at(-1).spanEnd, content.length);
});
test('chat exports retain record provenance and default masking hides NIK and phone', () => {
  assert.match(
    normalize({
      type: 'CHAT',
      records: [{ text: 'policy', reference: 'message-1' }],
    }),
    /Reference: message-1/,
  );
  assert.equal(
    maskPII('NIK 1234567890123456; phone +62 812-3456-7890'),
    'NIK [REDACTED_NIK]; phone [REDACTED_PHONE]',
  );
  assert.equal(maskPII('Budget Rp180000000'), 'Budget Rp180000000');
});

test('automatic patterns protect email and labelled identifiers; NIK cannot become a phone', () => {
  const { personalDataSpans } = require('../dist/knowledge/content');
  const text =
    'Email person@example.test; DOB: 1995-03-14; Bank account: 000111222333; NIK 0812345678901234';
  const spans = personalDataSpans(text);
  assert.ok(spans.some((s) => s.field_type === 'EMAIL'));
  assert.ok(spans.some((s) => s.field_type === 'DATE_OF_BIRTH'));
  assert.ok(spans.some((s) => s.field_type === 'BANK_ACCOUNT'));
  assert.ok(
    !spans.some(
      (s) => s.field_type === 'PHONE' && s.value === '0812345678901234',
    ),
  );
  assert.doesNotMatch(
    maskPII(text),
    /person@example.test|1995-03-14|000111222333|0812345678901234/,
  );
});

test('shared UI answer mocks conform to the real answer contract', () => {
  const { answerInput } = require('@veridict/contracts');
  const mocks = require('../fixtures/ui-answers.json');
  assert.equal(mocks.synthetic, true);
  assert.equal(mocks.live, false);
  for (const answer of Object.values(mocks.answers))
    assert.equal(answerInput.safeParse(answer).success, true);
});
