/**
 * Streaming Types for NanoClaw
 * Host-side type definitions for stream events
 */

// Stream Event Types
export type StreamEventType =
  | 'thinking'
  | 'plan'
  | 'plan_step'
  | 'tool_start'
  | 'tool_progress'
  | 'tool_complete'
  | 'decision'
  | 'content'
  | 'complete'
  | 'error';

// Step status
export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

// Plan Step interface
export interface PlanStep {
  id: string;
  description: string;
  status: StepStatus;
  tool?: string;
  progress?: number;
  message?: string;
}

// Stream Event interface
export interface StreamEvent {
  type: StreamEventType;
  timestamp: string;
  sessionId?: string;
  data: unknown;
}

// Thinking event data
export interface ThinkingEventData {
  content: string;
}

// Plan event data
export interface PlanEventData {
  steps: PlanStep[];
}

// Plan step update event data
export interface PlanStepEventData {
  stepId: string;
  status: StepStatus;
  progress?: number;
  plan: PlanStep[];
}

// Tool start event data
export interface ToolStartEventData {
  toolId: string;
  name: string;
  input: unknown;
}

// Tool progress event data
export interface ToolProgressEventData {
  toolId: string;
  name: string;
  message: string;
  percent?: number;
}

// Tool complete event data
export interface ToolCompleteEventData {
  toolId: string;
  name: string;
  duration: number;
  result: unknown;
}

// Decision event data
export interface DecisionEventData {
  description: string;
  choice: string;
}

// Content event data
export interface ContentEventData {
  text: string;
}

// Error event data
export interface ErrorEventData {
  message: string;
  details?: unknown;
}

// Stream markers (must match container/agent-runner/src/streaming-output.ts)
export const STREAM_MARKERS = {
  THINKING_START: '<<<THINKING>>>',
  THINKING_END: '<<<THINKING_END>>>',
  PLAN_START: '<<<PLAN>>>',
  PLAN_END: '<<<PLAN_END>>>',
  PLAN_STEP: '<<<STEP:',
  TOOL_START: '<<<TOOL:',
  TOOL_PROGRESS: '<<<PROGRESS:',
  TOOL_COMPLETE: '<<<TOOL_COMPLETE>>>',
  DECISION: '<<<DECISION>>>',
  CONTENT_START: '<<<CONTENT>>>',
  CONTENT_END: '<<<CONTENT_END>>>',
  COMPLETE: '<<<COMPLETE>>>',
  ERROR: '<<<ERROR>>>',
} as const;

// Legacy markers for backward compatibility
export const LEGACY_MARKERS = {
  OUTPUT_START: '---NANOCLAW_OUTPUT_START---',
  OUTPUT_END: '---NANOCLAW_OUTPUT_END---',
} as const;

// Type guards
export function isThinkingEvent(event: StreamEvent): boolean {
  return event.type === 'thinking';
}

export function isPlanEvent(event: StreamEvent): boolean {
  return event.type === 'plan';
}

export function isPlanStepEvent(event: StreamEvent): boolean {
  return event.type === 'plan_step';
}

export function isToolStartEvent(event: StreamEvent): boolean {
  return event.type === 'tool_start';
}

export function isToolProgressEvent(event: StreamEvent): boolean {
  return event.type === 'tool_progress';
}

export function isToolCompleteEvent(event: StreamEvent): boolean {
  return event.type === 'tool_complete';
}

export function isDecisionEvent(event: StreamEvent): boolean {
  return event.type === 'decision';
}

export function isContentEvent(event: StreamEvent): boolean {
  return event.type === 'content';
}

export function isCompleteEvent(event: StreamEvent): boolean {
  return event.type === 'complete';
}

export function isErrorEvent(event: StreamEvent): boolean {
  return event.type === 'error';
}
