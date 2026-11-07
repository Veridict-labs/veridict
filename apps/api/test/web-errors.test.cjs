const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function clientFixture(status, body, retryAfter) {
  const context = vm.createContext({
    process: { env: { NEXT_PUBLIC_API_URL: 'http://fixture.invalid' } },
    fetch: async () => ({ ok: false, status, json: async () => body, headers: { get: () => retryAfter ?? null } }),
  });
  function load(file, resolve) {
    const filename = path.resolve(__dirname, '../../web/src/lib', file);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText;
    const module = { exports: {} };
    vm.runInContext(`(function(exports,require,module){${code}\n})`, context)(module.exports, resolve, module);
    return module.exports;
  }
  const api = load('api.ts', (name) => { assert.equal(name, './demo-data'); return {}; });
  const errors = load('processing-error.ts', (name) => { assert.equal(name, './api'); return api; });
  return { api, errors };
}

for (const [status, code, expectedCode, pattern, retry] of [
  [429, 'AI_RATE_LIMITED', 'AI_RATE_LIMITED', /AI service.*quota/, undefined],
  [429, 'Too Many Requests', 'REQUEST_RATE_LIMITED', /requests to Veridict.*12 seconds/, '12'],
  [503, 'AI_BUSY', 'AI_BUSY', /Veridict is busy/, undefined],
  [503, 'AI_AUTH_FAILED', 'AI_AUTH_FAILED', /administrator/, undefined],
  [503, 'AI_BUDGET_EXCEEDED', 'AI_BUDGET_EXCEEDED', /processing limit/, undefined],
  [401, 'UNAUTHORIZED', 'UNAUTHORIZED', /session has expired/, undefined],
  [409, 'CONFLICT', 'CONFLICT', /evidence changed/, undefined],
  [502, 'INTERNAL_ERROR', 'INTERNAL_ERROR', /could not finish/, undefined],
]) test(`frontend classifies ${status}/${code} without exposing provider error text`, async () => {
  const { api, errors } = clientFixture(status, { error: code, message: 'synthetic_private_provider_detail' }, retry);
  await assert.rejects(api.liveClient('synthetic_token').run('synthetic_inquiry'), (e) => {
    assert.equal(e.code, expectedCode);
    assert.match(errors.processingErrorMessage(e), pattern);
    assert.doesNotMatch(errors.processingErrorMessage(e), /synthetic_private_provider_detail/);
    return true;
  });
});

test('untrusted or unbounded Retry-After values do not become a retry instruction', async () => {
  for (const retry of ['-1', 'Infinity', '900719925474099999', 'tomorrow', '86401']) {
    const { api } = clientFixture(429, {}, retry);
    await assert.rejects(api.liveClient('synthetic').run('fixture'), (e) => e.retryAfterSeconds === undefined);
  }
});
