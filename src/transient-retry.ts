export interface RetryDecisionInput {
  attempt: number;
  maxAttempts: number;
  error?: string | null;
  sentVisibleResult?: boolean;
  observedCompletion?: boolean;
}

export function isTransientProviderError(error?: string | null): boolean {
  if (!error) return false;
  return /(?:\b429\b|rate limit|too many requests|temporarily unavailable|upstream service temporarily unavailable|暂不可用|\b5\d\d\b|bad gateway|gateway timeout|service unavailable|timeout|timed out|econnreset|socket hang up|connection reset|connection aborted|etimedout)/i.test(
    error,
  );
}

export function shouldRetryTransientAttempt({
  attempt,
  maxAttempts,
  error,
  sentVisibleResult = false,
  observedCompletion = false,
}: RetryDecisionInput): boolean {
  return (
    attempt < maxAttempts &&
    !sentVisibleResult &&
    !observedCompletion &&
    isTransientProviderError(error)
  );
}
