/**
 * Streaming Module for NanoClaw
 * Unified exports for stream processing
 */

// Types
export {
  StreamEvent,
  StreamEventType,
  PlanStep,
  StepStatus,
  ThinkingEventData,
  PlanEventData,
  PlanStepEventData,
  ToolStartEventData,
  ToolProgressEventData,
  ToolCompleteEventData,
  DecisionEventData,
  ContentEventData,
  ErrorEventData,
  STREAM_MARKERS,
  LEGACY_MARKERS,
} from './types.js';

// Processor types (defined in processor.ts)
export {
  ProcessOptions,
  ExecutionStatus,
  ProcessorStats,
} from './processor.js';

// Type guards
export {
  isThinkingEvent,
  isPlanEvent,
  isPlanStepEvent,
  isToolStartEvent,
  isToolProgressEvent,
  isToolCompleteEvent,
  isDecisionEvent,
  isContentEvent,
  isCompleteEvent,
  isErrorEvent,
} from './types.js';

// Parser
export { StreamParser } from './parser.js';

// Processor
export { StreamProcessor } from './processor.js';
