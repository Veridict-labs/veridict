import {
  AgentError,
  type AgentModel,
  type ChatMessage,
  type ModelTool,
  type ToolCall,
  type GoogleSignature,
} from './model';

export const geminiChatEndpoint =
  'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class GeminiModel implements AgentModel {
  readonly model: string;
  private readonly apiKey: string;
  private readonly request: typeof fetch;

  constructor(input: { apiKey: string; model: string; fetch?: typeof fetch }) {
    if (
      !/^[\x21-\x7e]{20,256}$/.test(input.apiKey) ||
      !/^gemini-[A-Za-z0-9._-]{1,100}$/.test(input.model)
    )
      throw new AgentError('AI_NOT_CONFIGURED');
    this.apiKey = input.apiKey;
    this.model = input.model;
    this.request = input.fetch ?? fetch;
  }

  async complete(
    messages: ChatMessage[],
    tools: ModelTool[],
  ): Promise<ChatMessage> {
    // No retry or provider fallback: failed calls must not silently consume more credits.
    let response: Response;
    try {
      response = await this.request(geminiChatEndpoint, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
          temperature: 0,
          reasoning_effort: this.model.startsWith('gemini-2.5-')
            ? 'none'
            : 'low',
          max_tokens: 2048,
          stream: false,
        }),
      });
    } catch {
      throw new AgentError('AI_UNAVAILABLE');
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      const code = (
        {
          400: 'AI_REQUEST_REJECTED',
          401: 'AI_AUTH_FAILED',
          403: 'AI_ACCESS_DENIED',
          402: 'AI_QUOTA_EXHAUSTED',
          429: 'AI_RATE_LIMITED',
          404: 'AI_MODEL_UNAVAILABLE',
        } as const
      )[response.status];
      throw new AgentError(code ?? 'AI_UNAVAILABLE');
    }
    let payload: unknown;
    try {
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > 256000) {
            await reader.cancel();
            throw new Error();
          }
          chunks.push(next.value);
        }
      } finally {
        reader.releaseLock();
      }
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new AgentError('AI_INVALID_RESPONSE');
    }
    if (
      !object(payload) ||
      !Array.isArray(payload.choices) ||
      payload.choices.length !== 1
    )
      throw new AgentError('AI_INVALID_RESPONSE');
    const choice = payload.choices[0];
    if (
      !object(choice) ||
      !object(choice.message) ||
      !['stop', 'tool_calls'].includes(String(choice.finish_reason))
    )
      throw new AgentError('AI_INVALID_RESPONSE');
    const message = choice.message;
    const calls = message.tool_calls;
    if (
      message.role !== 'assistant' ||
      (message.content !== null &&
        typeof message.content !== 'string' &&
        !(
          message.content === undefined &&
          Array.isArray(calls) &&
          calls.length > 0
        ))
    )
      throw new AgentError('AI_INVALID_RESPONSE');
    if (
      calls !== undefined &&
      (!Array.isArray(calls) ||
        calls.length > 4 ||
        calls.some(
          (call) =>
            !object(call) ||
            call.type !== 'function' ||
            typeof call.id !== 'string' ||
            !/^[A-Za-z0-9_-]{1,120}$/.test(call.id) ||
            !object(call.function) ||
            typeof call.function.name !== 'string' ||
            typeof call.function.arguments !== 'string' ||
            call.function.arguments.length > 30000,
        ))
    )
      throw new AgentError('AI_INVALID_RESPONSE');
    return {
      role: 'assistant',
      content: (message.content ?? null) as string | null,
      ...signature(message),
      ...(calls
        ? {
            tool_calls: (calls as Record<string, unknown>[]).map((call) => ({
              id: call.id as string,
              type: 'function' as const,
              function: {
                name: (call.function as ToolCall['function']).name,
                arguments: (call.function as ToolCall['function']).arguments,
              },
              ...signature(call),
            })),
          }
        : {}),
    };
  }
}

// Keep only the opaque provider signature needed for subsequent tool turns.
// It stays in request memory; never expose it in answer, trace, or audit data.
function signature(value: Record<string, unknown>): {
  extra_content?: GoogleSignature;
} {
  if (value.extra_content === undefined) return {};
  const extra = value.extra_content;
  if (
    !object(extra) ||
    !object(extra.google) ||
    typeof extra.google.thought_signature !== 'string' ||
    extra.google.thought_signature.length > 64000
  )
    throw new AgentError('AI_INVALID_RESPONSE');
  return {
    extra_content: {
      google: { thought_signature: extra.google.thought_signature },
    },
  };
}
