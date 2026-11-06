const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  HuggingFaceModel,
  AgentError,
  hfChatEndpoint,
} = require('../dist/index');

const token = 'hf_syntheticTokenForUnitTestsOnly';
const model = 'meta-llama/Llama-3.1-8B-Instruct';
const completion = (message, finish_reason = 'stop') =>
  new Response(
    JSON.stringify({
      choices: [{ message: { role: 'assistant', ...message }, finish_reason }],
    }),
  );

test('HF adapter uses the router, disables redirects, and bounds output without an OpenAI key', async () => {
  let received;
  const provider = new HuggingFaceModel({
    token,
    model,
    fetch: async (url, init) => {
      received = { url, init };
      return completion({ content: 'Synthetic reply' });
    },
  });
  const result = await provider.complete(
    [{ role: 'user', content: 'Synthetic question' }],
    [],
  );
  assert.equal(received.url, hfChatEndpoint);
  assert.equal(
    received.url,
    'https://router.huggingface.co/v1/chat/completions',
  );
  assert.equal(received.init.headers.Authorization, `Bearer ${token}`);
  assert.equal(received.init.redirect, 'error');
  const body = JSON.parse(received.init.body);
  assert.equal(body.model, model);
  assert.equal(body.max_tokens, 2048);
  assert.equal(body.stream, false);
  assert.equal(result.content, 'Synthetic reply');
  assert.ok(!JSON.stringify(result).includes(token));
});

test('HF configuration rejects missing credentials or malformed model IDs before a request', () => {
  for (const input of [
    { token: '', model },
    { token, model: 'https://untrusted.example' },
    { token, model: '' },
  ]) {
    assert.throws(
      () => new HuggingFaceModel(input),
      (error) =>
        error instanceof AgentError && error.code === 'AI_NOT_CONFIGURED',
    );
  }
});

test('HF failure codes are actionable and contain no upstream body or token, with no retry', async () => {
  for (const [status, code] of [
    [401, 'AI_AUTH_FAILED'],
    [403, 'AI_ACCESS_DENIED'],
    [402, 'AI_QUOTA_EXHAUSTED'],
    [429, 'AI_RATE_LIMITED'],
    [404, 'AI_MODEL_UNAVAILABLE'],
    [500, 'AI_UNAVAILABLE'],
  ]) {
    let requests = 0;
    const provider = new HuggingFaceModel({
      token,
      model,
      fetch: async () => {
        requests++;
        return new Response(`private upstream body ${token}`, { status });
      },
    });
    await assert.rejects(
      provider.complete([], []),
      (error) => error.code === code && error.message === code,
    );
    assert.equal(requests, 1);
  }
});

test('HF transport failures cannot expose credentials or switch providers', async () => {
  let requests = 0;
  const provider = new HuggingFaceModel({
    token,
    model,
    fetch: async () => {
      requests++;
      throw new Error(`upstream detail ${token}`);
    },
  });
  await assert.rejects(
    provider.complete([], []),
    (error) =>
      error.code === 'AI_UNAVAILABLE' && error.message === 'AI_UNAVAILABLE',
  );
  assert.equal(requests, 1);
});

test('HF rejects malformed, oversized, or truncated output', async () => {
  for (const response of [
    new Response('not JSON'),
    new Response('x'.repeat(256001)),
    completion({ content: 'incomplete answer' }, 'length'),
    completion(
      {
        content: null,
        tool_calls: [
          {
            id: 'x',
            type: 'function',
            function: { name: 'tool', arguments: 'x'.repeat(30001) },
          },
        ],
      },
      'tool_calls',
    ),
  ]) {
    const provider = new HuggingFaceModel({
      token,
      model,
      fetch: async () => response,
    });
    await assert.rejects(
      provider.complete([], []),
      (error) => error.code === 'AI_INVALID_RESPONSE',
    );
  }
});

test('HF preserves structured tool calls for the server-owned dispatcher', async () => {
  const call = {
    id: 'call_1',
    type: 'function',
    function: {
      name: 'search_authorized_knowledge',
      arguments: '{"query":"fuel"}',
    },
  };
  const provider = new HuggingFaceModel({
    token,
    model,
    fetch: async () =>
      completion({ content: null, tool_calls: [call] }, 'tool_calls'),
  });
  assert.deepEqual((await provider.complete([], [])).tool_calls, [call]);
});

test('HF organization billing is opt-in and cannot inject additional headers', async () => {
  let headers;
  const provider = new HuggingFaceModel({
    token,
    model,
    billTo: 'synthetic-team',
    fetch: async (_url, init) => {
      headers = init.headers;
      return completion({ content: 'Synthetic reply' });
    },
  });
  await provider.complete([], []);
  assert.equal(headers['X-HF-Bill-To'], 'synthetic-team');
  assert.throws(
    () =>
      new HuggingFaceModel({
        token,
        model,
        billTo: 'team\r\nAuthorization: malicious',
      }),
    (error) => error.code === 'AI_NOT_CONFIGURED',
  );
});
