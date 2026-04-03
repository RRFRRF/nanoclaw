export enum CompactMode {
  RULE = 'rule',
  NATIVE_LLM = 'native_llm',
  FALLBACK_RULE = 'fallback_rule',
}

export interface PromptPreparationMetadata {
  compactMode: CompactMode;
  requestedNativeCompact: boolean;
}

export interface NativeCompactRequest {
  enabled: boolean;
  sessionId?: string;
  metadata: PromptPreparationMetadata;
}

export interface NativeCompactOutcome {
  attempted: boolean;
  succeeded: boolean;
  fallbackToRuleCompact: boolean;
  reason?: string;
}
