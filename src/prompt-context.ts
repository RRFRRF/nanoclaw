import type { CompactMessage, CompactResult } from './compact/types.js';

export interface PreparedPromptMessages {
  messages: CompactMessage[];
  compactResult: CompactResult | null;
}

export function preparePromptMessages(
  messages: CompactMessage[],
  _sessionId?: string,
): PreparedPromptMessages {
  return {
    messages,
    compactResult: null,
  };
}
