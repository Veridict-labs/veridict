const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const {
  StreamableHTTPServerTransport,
} = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const {
  CheckpointError,
  requiredTools,
  runMcpSmoke,
} = require('../dist/index');

const token = 'a'.repeat(64);
const query = 'confidential smoke question';

async function fixture(t, options = {}) {
  const actor = {
    id: randomUUID(),
    org_id: randomUUID(),
    session_kind: 'AGENT',
  };
  const calls = [];
  const protocols = [];
  const server = http.createServer(async (request, response) => {
    try {
      assert.equal(request.headers.authorization, `Bearer ${token}`);
      if (request.url === '/v1/auth/me') {
        if (options.redirect) {
          response.writeHead(302, { Location: '/trap' }).end();
          return;
        }
        response.writeHead(options.authStatus ?? 200, {
          'Content-Type': 'application/json',
        });
        response.end(
          JSON.stringify({ ...actor, session_kind: options.kind ?? 'AGENT' }),
        );
        return;
      }
      if (request.url === '/trap') {
        calls.push('redirect-trap');
        response.writeHead(200).end('{}');
        return;
      }
      assert.equal(request.url, '/mcp');
      if (options.mcpRedirect) {
        response.writeHead(302, { Location: '/trap' }).end();
        return;
      }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const protocol = new Server(
        { name: 'fixture', version: '1.0.0' },
        { capabilities: { tools: {} } },
      );
      protocol.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: (options.tools ?? requiredTools).map((name) => ({
          name,
          inputSchema: { type: 'object' },
        })),
      }));
      protocol.setRequestHandler(CallToolRequestSchema, async (call) => {
        calls.push(call.params);
        return (
          options.result ?? {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  mode: 'LEXICAL',
                  results: options.empty
                    ? []
                    : [
                        {
                          source_id: randomUUID(),
                          chunk_id: randomUUID(),
                          excerpt: 'private fixture excerpt',
                        },
                      ],
                }),
              },
            ],
          }
        );
      });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      protocols.push(protocol);
      response.on('close', () => {
        void transport.close();
      });
      await protocol.connect(transport);
      await transport.handleRequest(request, response, body);
    } catch {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await Promise.all(protocols.map((protocol) => protocol.close()));
    await new Promise((resolve) => server.close(resolve));
  });
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, actor, calls };
}

function hasCode(code) {
  return (error) =>
    error instanceof CheckpointError &&
    error.code === code &&
    error.message === code;
}

test('rejects unsafe URLs and credentials before making a request', async () => {
  for (const baseUrl of [
    'http://example.com',
    'https://user:secret@example.com',
    'https://example.com?token=x',
    'https://example.com/v1',
  ]) {
    await assert.rejects(
      runMcpSmoke({ baseUrl, token, query }),
      hasCode('INVALID_CONFIGURATION'),
    );
  }
  await assert.rejects(
    runMcpSmoke({
      baseUrl: 'http://localhost:3001',
      token: 'not-a-token',
      query,
    }),
    hasCode('INVALID_CONFIGURATION'),
  );
});

test('verifies delegated identity and MCP search without completing inquiries or exposing evidence', async (t) => {
  const backend = await fixture(t);
  const report = await runMcpSmoke({ ...backend, token, query });
  assert.deepEqual(report.actor, backend.actor);
  assert.equal(report.workbuddy_verified, false);
  assert.equal(report.kind, 'MCP_CLIENT_SMOKE');
  assert.equal(report.retrieval.result_count, 1);
  assert.match(report.retrieval.query_hash, /^[a-f0-9]{64}$/);
  assert.deepEqual(report.tools, [...requiredTools].sort());
  assert.deepEqual(backend.calls, [
    { name: 'search_authorized_knowledge', arguments: { query, limit: 1 } },
  ]);
  const output = JSON.stringify(report);
  assert.ok(!output.includes(query));
  assert.ok(!output.includes(token));
  assert.ok(!output.includes('private fixture excerpt'));
});

test('a valid empty search passes without implying restricted data exists', async (t) => {
  const backend = await fixture(t, { empty: true });
  const report = await runMcpSmoke({ ...backend, token, query });
  assert.equal(report.retrieval.result_count, 0);
});

test('rejects user sessions before making MCP calls', async (t) => {
  const backend = await fixture(t, { kind: 'USER' });
  await assert.rejects(
    runMcpSmoke({ ...backend, token, query }),
    hasCode('DELEGATED_SESSION_REQUIRED'),
  );
  assert.deepEqual(backend.calls, []);
});

test('expired authentication returns a fixed error without leaking upstream content', async (t) => {
  const backend = await fixture(t, { authStatus: 401 });
  await assert.rejects(
    runMcpSmoke({ ...backend, token, query }),
    hasCode('AUTH_UNAVAILABLE'),
  );
  assert.deepEqual(backend.calls, []);
});

test('does not forward bearer credentials through authentication redirects', async (t) => {
  const backend = await fixture(t, { redirect: true });
  await assert.rejects(
    runMcpSmoke({ ...backend, token, query }),
    hasCode('AUTH_UNAVAILABLE'),
  );
  assert.deepEqual(backend.calls, []);
});

test('does not forward delegated credentials through MCP redirects', async (t) => {
  const backend = await fixture(t, { mcpRedirect: true });
  await assert.rejects(
    runMcpSmoke({ ...backend, token, query }),
    hasCode('MCP_UNAVAILABLE'),
  );
  assert.deepEqual(backend.calls, []);
});

test('missing integration tools fail before retrieval', async (t) => {
  const backend = await fixture(t, { tools: ['search_authorized_knowledge'] });
  await assert.rejects(
    runMcpSmoke({ ...backend, token, query }),
    hasCode('TOOLS_MISSING'),
  );
  assert.deepEqual(backend.calls, []);
});

test('denied tools have a fixed non-disclosing error', async (t) => {
  const backend = await fixture(t, {
    result: {
      isError: true,
      content: [{ type: 'text', text: 'secret upstream error' }],
    },
  });
  await assert.rejects(
    runMcpSmoke({ ...backend, token, query }),
    hasCode('TOOL_UNAVAILABLE'),
  );
});

test('malformed JSON and evidence shapes cannot be reported as a successful search', async (t) => {
  for (const text of [
    'not JSON',
    JSON.stringify({
      mode: 'LEXICAL',
      results: [{ source_id: 'made-up', chunk_id: 'made-up', excerpt: 'x' }],
    }),
  ]) {
    const backend = await fixture(t, {
      result: { content: [{ type: 'text', text }] },
    });
    await assert.rejects(
      runMcpSmoke({ ...backend, token, query }),
      hasCode('INVALID_TOOL_RESULT'),
    );
  }
});
