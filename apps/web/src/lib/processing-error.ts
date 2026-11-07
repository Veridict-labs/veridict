import { ApiError } from './api';

export function processingErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'The agent could not finish. Try again later.';
  if (error.code === 'AI_RATE_LIMITED')
    return 'The AI service has reached a request or quota limit. Try later or contact your workspace administrator.';
  if (error.code === 'REQUEST_RATE_LIMITED')
    return error.retryAfterSeconds
      ? `Too many requests to Veridict. Try again in ${error.retryAfterSeconds} seconds.`
      : 'Too many requests to Veridict. Try again shortly.';
  if (error.code === 'AI_BUSY') return 'Veridict is busy. Try again shortly.';
  if (['AI_NOT_CONFIGURED', 'AI_AUTH_FAILED', 'AI_ACCESS_DENIED', 'AI_MODEL_UNAVAILABLE', 'AI_QUOTA_EXHAUSTED'].includes(error.code ?? ''))
    return 'AI processing is unavailable for this workspace. Contact your workspace administrator.';
  if (error.code === 'AI_BUDGET_EXCEEDED')
    return 'The question could not be completed within the processing limit. Narrow the question or provide more specific context.';
  if (error.status === 401) return 'Your session has expired. Sign in again.';
  if (error.status === 404) return 'This question is not available.';
  if (error.status === 409) return 'The question or its evidence changed. Refresh and run it again.';
  return 'The agent could not finish. Try again later.';
}
