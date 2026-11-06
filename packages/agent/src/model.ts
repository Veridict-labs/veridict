export type AgentErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_AUTH_FAILED'
  | 'AI_ACCESS_DENIED'
  | 'AI_QUOTA_EXHAUSTED'
  | 'AI_RATE_LIMITED'
  | 'AI_MODEL_UNAVAILABLE'
  | 'AI_REQUEST_REJECTED'
  | 'AI_UNAVAILABLE'
  | 'AI_INVALID_RESPONSE'
  | 'AI_INVALID_TOOL_CALL'
  | 'AI_UNSEEN_EVIDENCE'
  | 'AI_BUDGET_EXCEEDED';

export class AgentError extends Error {
  constructor(public readonly code: AgentErrorCode) {
    super(code);
    this.name = 'AgentError';
  }
}

export type GoogleSignature = {
  google: { thought_signature: string };
};
export type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
  extra_content?: GoogleSignature;
};
export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  extra_content?: GoogleSignature;
};
export type ModelTool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};
export interface AgentModel {
  complete(messages: ChatMessage[], tools: ModelTool[]): Promise<ChatMessage>;
}
