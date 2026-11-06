const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ModelProvider } = require('../dist/agent/model.provider');
const { GeminiModel, HuggingFaceModel } = require('@veridict/agent');

test('provider selection defaults to Gemini and never silently falls back to an available HF token', () => {
  const names = [
    'AI_PROVIDER',
    'GEMINI_API_KEY',
    'GEMINI_MODEL',
    'HF_TOKEN',
    'HF_MODEL',
  ];
  const original = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  try {
    delete process.env.AI_PROVIDER;
    delete process.env.GEMINI_MODEL;
    process.env.GEMINI_API_KEY = 'synthetic_gemini_key_for_tests_only';
    process.env.HF_TOKEN = 'hf_syntheticTokenForUnitTestsOnly';
    process.env.HF_MODEL = 'test/synthetic';
    const provider = new ModelProvider();
    const gemini = provider.create();
    assert.equal(gemini.provider, 'gemini');
    assert.equal(gemini.modelId, 'gemini-3.5-flash');
    assert.ok(gemini.model instanceof GeminiModel);
    delete process.env.GEMINI_API_KEY;
    assert.throws(
      () => provider.create(),
      (error) => error.code === 'AI_NOT_CONFIGURED',
    );
    process.env.AI_PROVIDER = 'huggingface';
    assert.ok(provider.create().model instanceof HuggingFaceModel);
    process.env.AI_PROVIDER = 'unknown';
    assert.throws(
      () => provider.create(),
      (error) => error.code === 'AI_NOT_CONFIGURED',
    );
  } finally {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
