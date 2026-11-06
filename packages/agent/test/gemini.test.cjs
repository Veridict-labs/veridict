const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GeminiModel, geminiChatEndpoint } = require('../dist');
const apiKey = 'synthetic.gemini:key_for_tests_only';
const model = 'gemini-3.5-flash-lite';
const completion = (message, finish_reason = 'stop') =>
  new Response(
    JSON.stringify({
      choices: [
        {
          message: { role: 'assistant', content: null, ...message },
          finish_reason,
        },
      ],
    }),
  );

test('Gemini uses the fixed Google endpoint, bounded output, and no tools on support checks', async () => {
  let received;
  const client = new GeminiModel({
    apiKey,
    model,
    fetch: async (url, init) => {
      received = { url, init };
      return completion({ content: '{"supported":true}' });
    },
  });
  await client.complete([{ role: 'user', content: 'Synthetic' }], []);
  assert.equal(received.url, geminiChatEndpoint);
  assert.equal(received.init.redirect, 'error');
  assert.equal(received.init.headers.Authorization, `Bearer ${apiKey}`);
  const body = JSON.parse(received.init.body);
  assert.equal(body.model, model);
  assert.equal(body.max_tokens, 2048);
  assert.equal(body.reasoning_effort, 'low');
  assert.equal(body.tools, undefined);
  assert.equal(body.tool_choice, undefined);
});

test('Gemini preserves opaque tool signatures across turns without carrying arbitrary provider fields', async () => {
  const call = {
    id: 'call_synthetic',
    type: 'function',
    function: { name: 'get_evidence', arguments: '{}' },
    extra_content: {
      google: {
        thought_signature: 'opaque-synthetic-signature',
        private_field: 'discard',
      },
    },
    private_field: 'discard',
  };
  let requests = 0;
  let body;
  const client = new GeminiModel({
    apiKey,
    model,
    fetch: async (_url, init) => {
      requests++;
      body = JSON.parse(init.body);
      return requests === 1
        ? completion({ content: undefined, tool_calls: [call] }, 'tool_calls')
        : completion({ content: 'done' });
    },
  });
  const reply = await client.complete(
    [],
    [
      {
        type: 'function',
        function: {
          name: 'get_evidence',
          description: 'Read',
          parameters: { type: 'object' },
        },
      },
    ],
  );
  await client.complete(
    [reply, { role: 'tool', tool_call_id: call.id, content: '{}' }],
    [],
  );
  assert.deepEqual(body.messages[0].tool_calls[0].extra_content, {
    google: { thought_signature: 'opaque-synthetic-signature' },
  });
  assert.equal(body.messages[0].tool_calls[0].private_field, undefined);
  assert.equal(requests, 2);
});

test('Gemini errors are safe and do not retry or fall back to HF', async () => {
  for (const [status, code] of [
    [400, 'AI_REQUEST_REJECTED'],
    [401, 'AI_AUTH_FAILED'],
    [403, 'AI_ACCESS_DENIED'],
    [404, 'AI_MODEL_UNAVAILABLE'],
    [429, 'AI_RATE_LIMITED'],
    [500, 'AI_UNAVAILABLE'],
  ]) {
    let requests = 0;
    const client = new GeminiModel({
      apiKey,
      model,
      fetch: async () => {
        requests++;
        return new Response(`private ${apiKey}`, { status });
      },
    });
    await assert.rejects(
      client.complete([], []),
      (error) => error.code === code && error.message === code,
    );
    assert.equal(requests, 1);
  }
  const client = new GeminiModel({
    apiKey,
    model,
    fetch: async () => {
      throw new Error(apiKey);
    },
  });
  await assert.rejects(
    client.complete([], []),
    (error) =>
      error.code === 'AI_UNAVAILABLE' && error.message === 'AI_UNAVAILABLE',
  );
});

test('Gemini rejects truncated, oversized, malformed output and invalid signatures', async () => {
  for (const response of [
    new Response('invalid'),
    new Response('x'.repeat(256001)),
    completion({ content: 'cut' }, 'length'),
    completion({
      content: 'x',
      extra_content: { google: { thought_signature: 4 } },
    }),
    completion(
      {
        tool_calls: [
          {
            id: 'x',
            type: 'function',
            function: { name: 'x', arguments: 'x'.repeat(30001) },
          },
        ],
      },
      'tool_calls',
    ),
  ]) {
    const client = new GeminiModel({
      apiKey,
      model,
      fetch: async () => response,
    });
    await assert.rejects(
      client.complete([], []),
      (error) => error.code === 'AI_INVALID_RESPONSE',
    );
  }
});

test('Gemini rejects empty credentials and untrusted endpoint/model configuration locally', () => {
  for (const input of [
    { apiKey: '', model },
    { apiKey, model: 'https://example.test' },
    { apiKey: apiKey + '\r\n', model },
  ])
    assert.throws(
      () => new GeminiModel(input),
      (error) => error.code === 'AI_NOT_CONFIGURED',
    );
});
