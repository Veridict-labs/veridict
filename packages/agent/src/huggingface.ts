import {
  AgentError,
  type AgentModel,
  type ChatMessage,
  type ModelTool,
  type ToolCall,
} from './model';

export const hfChatEndpoint =
  'https://router.huggingface.co/v1/chat/completions';

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class HuggingFaceModel implements AgentModel {
  readonly model: string;
  private readonly token: string;
  private readonly billTo?: string;
  private readonly request: typeof fetch;

  constructor(input: {
    token: string;
    model: string;
    billTo?: string;
    fetch?: typeof fetch;
  }) {
    if (
      !/^hf_[A-Za-z0-9]{10,}$/.test(input.token) ||
      !new RegExp(
        '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?::[A-Za-z0-9_.-]+)?$',
      ).test(input.model) ||
      input.model.length > 250 ||
      (input.billTo !== undefined &&
        !/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(input.billTo))
    )
      throw new AgentError('AI_NOT_CONFIGURED');
    this.token = input.token;
    this.model = input.model;
    this.billTo = input.billTo;
    this.request = input.fetch ?? fetch;
  }

  async complete(
    messages: ChatMessage[],
    tools: ModelTool[],
  ): Promise<ChatMessage> {
    // No retry or provider fallback: failed calls must not silently consume more credits.
    let response: Response;
    try {
      response = await this.request(hfChatEndpoint, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          ...(this.billTo ? { 'X-HF-Bill-To': this.billTo } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          tools,
          tool_choice: 'auto',
          temperature: 0,
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
    if (
      message.role !== 'assistant' ||
      (message.content !== null && typeof message.content !== 'string')
    )
      throw new AgentError('AI_INVALID_RESPONSE');
    const calls = message.tool_calls;
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
      content: message.content as string | null,
      ...(calls ? { tool_calls: calls as ToolCall[] } : {}),
    };
  }
}
