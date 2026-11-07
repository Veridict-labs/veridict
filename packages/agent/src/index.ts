import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { searchInput } from '@veridict/contracts';
import { createHash } from 'node:crypto';

export * from './model';
export * from './huggingface';
export * from './grounded-agent';
export * from './policy-guard';

export const requiredTools = [
  'search_authorized_knowledge',
  'resolve_policy_claims',
  'find_validated_precedents',
  'reconcile_truth',
  'get_evidence',
  'submit_feedback',
  'complete_inquiry',
] as const;

export type CheckpointErrorCode =
  | 'INVALID_CONFIGURATION'
  | 'AUTH_UNAVAILABLE'
  | 'DELEGATED_SESSION_REQUIRED'
  | 'MCP_UNAVAILABLE'
  | 'TOOLS_MISSING'
  | 'TOOL_UNAVAILABLE'
  | 'INVALID_TOOL_RESULT';

export class CheckpointError extends Error {
  constructor(public readonly code: CheckpointErrorCode) {
    // Never propagate upstream responses, URLs with credentials, or SDK errors.
    super(code);
    this.name = 'CheckpointError';
  }
}

export type SmokeReport = {
  kind: 'MCP_CLIENT_SMOKE';
  workbuddy_verified: false;
  checked_at: string;
  actor: { id: string; org_id: string; session_kind: 'AGENT' };
  tools: string[];
  retrieval: { mode: 'LEXICAL'; result_count: number; query_hash: string };
};

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function configuration(baseUrl: string, token: string) {
  try {
    const url = new URL(baseUrl);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      !/^[a-f0-9]{64}$/.test(token)
    )
      throw new Error();
    return url;
  } catch {
    throw new CheckpointError('INVALID_CONFIGURATION');
  }
}

/** Tests an authenticated MCP endpoint, without generating or storing an answer. */
export async function runMcpSmoke(input: {
  baseUrl: string;
  token: string;
  query: string;
}): Promise<SmokeReport> {
  const base = configuration(input.baseUrl, input.token);
  const search = searchInput.safeParse({ query: input.query, limit: 1 });
  if (!search.success) throw new CheckpointError('INVALID_CONFIGURATION');

  let actor: unknown;
  try {
    const response = await fetch(new URL('/v1/auth/me', base), {
      headers: { Authorization: `Bearer ${input.token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error();
    actor = await response.json();
  } catch {
    throw new CheckpointError('AUTH_UNAVAILABLE');
  }
  if (!object(actor) || !uuid(actor.id) || !uuid(actor.org_id))
    throw new CheckpointError('AUTH_UNAVAILABLE');
  if (actor.session_kind !== 'AGENT')
    throw new CheckpointError('DELEGATED_SESSION_REQUIRED');

  const client = new Client({
    name: 'veridict-person-1-smoke',
    version: '0.1.0',
  });
  const transport = new StreamableHTTPClientTransport(new URL('/mcp', base), {
    requestInit: {
      headers: { Authorization: `Bearer ${input.token}` },
      redirect: 'error',
    },
    // A short-lived delegated bearer token is supplied by the operator.
    reconnectionOptions: {
      maxRetries: 0,
      initialReconnectionDelay: 1000,
      maxReconnectionDelay: 1000,
      reconnectionDelayGrowFactor: 1,
    },
  });
  try {
    await client.connect(transport, { timeout: 15000 });
    const discovered: string[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : {}, {
        timeout: 15000,
      });
      discovered.push(...page.tools.map((tool) => tool.name));
      cursor = page.nextCursor;
      if (cursor && (cursors.has(cursor) || cursors.size >= 20))
        throw new CheckpointError('INVALID_TOOL_RESULT');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    if (requiredTools.some((name) => !discovered.includes(name)))
      throw new CheckpointError('TOOLS_MISSING');

    const result = await client.callTool(
      {
        name: 'search_authorized_knowledge',
        arguments: search.data,
      },
      undefined,
      { timeout: 15000 },
    );
    if (result.isError) throw new CheckpointError('TOOL_UNAVAILABLE');
    if (!Array.isArray(result.content) || result.content.length !== 1)
      throw new CheckpointError('INVALID_TOOL_RESULT');
    const block = result.content[0];
    if (
      !object(block) ||
      block.type !== 'text' ||
      typeof block.text !== 'string'
    )
      throw new CheckpointError('INVALID_TOOL_RESULT');
    let payload: unknown;
    try {
      payload = JSON.parse(block.text);
    } catch {
      throw new CheckpointError('INVALID_TOOL_RESULT');
    }
    if (
      !object(payload) ||
      payload.mode !== 'LEXICAL' ||
      !Array.isArray(payload.results) ||
      payload.results.length > search.data.limit ||
      payload.results.some(
        (item) =>
          !object(item) ||
          !uuid(item.source_id) ||
          !uuid(item.chunk_id) ||
          typeof item.excerpt !== 'string',
      )
    )
      throw new CheckpointError('INVALID_TOOL_RESULT');

    return {
      kind: 'MCP_CLIENT_SMOKE',
      workbuddy_verified: false,
      checked_at: new Date().toISOString(),
      actor: { id: actor.id, org_id: actor.org_id, session_kind: 'AGENT' },
      tools: [...new Set(discovered)].sort(),
      retrieval: {
        mode: 'LEXICAL',
        result_count: payload.results.length,
        query_hash: createHash('sha256')
          .update(search.data.query)
          .digest('hex'),
      },
    };
  } catch (error) {
    if (error instanceof CheckpointError) throw error;
    throw new CheckpointError('MCP_UNAVAILABLE');
  } finally {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  }
}

export * from './gemini';
