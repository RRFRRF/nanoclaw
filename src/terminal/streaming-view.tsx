/**
 * Streaming View for Terminal UI
 * Real-time display of agent execution with thinking, plans, and tools
 */

import React, { useMemo } from 'react';
import { Box, Text, useStdout } from 'ink';
import {
  StreamEvent,
  PlanStep,
  StepStatus,
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
} from '../streaming/index.js';

// View options
export interface StreamViewOptions {
  showThinking: boolean;
  thinkingCollapsed: boolean;
  showPlan: boolean;
  showTools: boolean;
  maxContentHeight: number;
}

// Default options
export const DEFAULT_VIEW_OPTIONS: StreamViewOptions = {
  showThinking: true,
  thinkingCollapsed: false,
  showPlan: true,
  showTools: true,
  maxContentHeight: 20,
};

// Props for streaming view
export interface StreamingViewProps {
  events: StreamEvent[];
  options: StreamViewOptions;
}

// Helper to get color for step status
function getStatusColor(status: StepStatus): string {
  switch (status) {
    case 'pending':
      return 'gray';
    case 'in_progress':
      return 'yellow';
    case 'completed':
      return 'green';
    case 'failed':
      return 'red';
    default:
      return 'white';
  }
}

// Helper to get icon for step status
function getStatusIcon(status: StepStatus): string {
  switch (status) {
    case 'pending':
      return '○';
    case 'in_progress':
      return '◐';
    case 'completed':
      return '●';
    case 'failed':
      return '✗';
    default:
      return '?';
  }
}

// Thinking panel component
export function ThinkingPanel({
  content,
  collapsed,
}: {
  content: string;
  collapsed: boolean;
}): React.ReactElement {
  if (collapsed) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color="gray" dimColor>
          💭 Thinking... (collapsed)
        </Text>
      </Box>
    );
  }

  const lines = content.split('\n').slice(0, 10);
  const hasMore = content.split('\n').length > 10;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="gray" bold>
        💭 Thinking:
      </Text>
      <Box paddingLeft={2} flexDirection="column">
        {lines.map((line, i) => (
          <Text key={i} color="gray" dimColor>
            {line.slice(0, 100)}
            {line.length > 100 ? '...' : ''}
          </Text>
        ))}
        {hasMore && <Text color="gray" dimColor>...</Text>}
      </Box>
    </Box>
  );
}

// Plan panel component
export function PlanPanel({
  steps,
  currentStepId,
}: {
  steps: PlanStep[];
  currentStepId?: string;
}): React.ReactElement {
  if (steps.length === 0) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color="gray">📋 No plan yet</Text>
      </Box>
    );
  }

  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const progress = Math.round((completedCount / steps.length) * 100);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="blue" bold>
        📋 Plan ({completedCount}/{steps.length} - {progress}%)
      </Text>
      <Box paddingLeft={2} flexDirection="column">
        {steps.map((step, index) => (
          <Box key={step.id}>
            <Text color={getStatusColor(step.status)}>
              {getStatusIcon(step.status)} {index + 1}. {step.description}
            </Text>
            {step.progress !== undefined && step.status === 'in_progress' && (
              <Text color="yellow"> ({step.progress}%)</Text>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// Tool panel component
export function ToolPanel({
  name,
  status,
  result,
}: {
  name: string;
  status: string;
  result?: unknown;
}): React.ReactElement {
  const statusColor =
    status === 'running'
      ? 'yellow'
      : status === 'completed'
        ? 'green'
        : 'red';

  const hasResult = result !== undefined && result !== null;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={statusColor}>
        🔧 {name} - {status}
      </Text>
      {hasResult && typeof result === 'object' && (
        <Box paddingLeft={2}>
          <Text color="gray" dimColor>
            Result: {String(JSON.stringify(result)).slice(0, 50)}...
          </Text>
        </Box>
      )}
    </Box>
  );
}

// Content panel component
export function ContentPanel({ content }: { content: string }): React.ReactElement {
  const lines = content.split('\n');
  const displayLines = lines.slice(0, 15);
  const hasMore = lines.length > 15;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="green" bold>
        📝 Response:
      </Text>
      <Box paddingLeft={2} flexDirection="column">
        {displayLines.map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
        {hasMore && (
          <Text color="gray" dimColor>
            ... ({lines.length - 15} more lines)
          </Text>
        )}
      </Box>
    </Box>
  );
}

// Main streaming view component
export function StreamingView({ events, options }: StreamingViewProps): React.ReactElement {
  const { stdout } = useStdout();
  const height = stdout?.rows || 24;

  // Extract current state from events
  const { thinking, plan, tools, content, isComplete, error } = useMemo(() => {
    let thinking = '';
    const plan: PlanStep[] = [];
    const tools: Array<{ id: string; name: string; status: string }> = [];
    let content = '';
    let isComplete = false;
    let error: string | null = null;

    // Process events in order
    for (const event of events) {
      if (isThinkingEvent(event)) {
        const data = event.data as { content: string };
        thinking = data.content;
      } else if (isPlanEvent(event)) {
        const data = event.data as { steps: PlanStep[] };
        plan.length = 0;
        plan.push(...data.steps);
      } else if (isPlanStepEvent(event)) {
        const data = event.data as { stepId: string; status: StepStatus };
        const step = plan.find((s) => s.id === data.stepId);
        if (step) {
          step.status = data.status;
        }
      } else if (isToolStartEvent(event)) {
        const data = event.data as { toolId: string; name: string };
        tools.push({ id: data.toolId, name: data.name, status: 'running' });
      } else if (isToolCompleteEvent(event)) {
        const data = event.data as { toolId: string; result: unknown };
        const tool = tools.find((t) => t.id === data.toolId);
        if (tool) {
          tool.status = 'completed';
        }
      } else if (isContentEvent(event)) {
        const data = event.data as { text: string };
        content = data.text;
      } else if (isCompleteEvent(event)) {
        isComplete = true;
      } else if (isErrorEvent(event)) {
        const data = event.data as { message: string };
        error = data.message;
      }
    }

    return { thinking, plan, tools, content, isComplete, error };
  }, [events]);

  // Calculate available height for content
  const headerHeight = 2; // Status line + separator
  const planHeight = options.showPlan && plan.length > 0 ? plan.length + 3 : 0;
  const toolsHeight =
    options.showTools && tools.length > 0 ? tools.filter((t) => t.status === 'running').length + 2 : 0;
  const thinkingHeight = options.showThinking && thinking ? 5 : 0;
  const availableHeight =
    height - headerHeight - planHeight - toolsHeight - thinkingHeight - 5;

  return (
    <Box flexDirection="column" height={Math.min(height, options.maxContentHeight)}>
      {/* Status header */}
      <Box marginBottom={1}>
        <Text color={isComplete ? 'green' : error ? 'red' : 'yellow'} bold>
          {isComplete ? ' ✅ Complete' : error ? ' ❌ Error' : ' ⏳ Running...'}
        </Text>
        <Text color="gray"> ({events.length} events)</Text>
      </Box>

      {/* Error display */}
      {error && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {/* Thinking section */}
      {options.showThinking && thinking && (
        <ThinkingPanel content={thinking} collapsed={options.thinkingCollapsed} />
      )}

      {/* Plan section */}
      {options.showPlan && plan.length > 0 && (
        <PlanPanel steps={plan} />
      )}

      {/* Active tools section */}
      {options.showTools && tools.filter((t) => t.status === 'running').length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="yellow" bold>
            🔧 Active Tools:
          </Text>
          {tools
            .filter((t) => t.status === 'running')
            .map((tool) => (
              <Box key={tool.id} paddingLeft={2}>
                <Text color="yellow">◐ {tool.name}</Text>
              </Box>
            ))}
        </Box>
      )}

      {/* Content section */}
      {content && (
        <Box flexDirection="column">
          <ContentPanel content={content} />
        </Box>
      )}
    </Box>
  );
}

// Export helper to format streaming events for display
export function formatStreamingEvents(events: StreamEvent[]): string {
  if (events.length === 0) return 'No events yet';

  const lines: string[] = [];
  let currentPlan: PlanStep[] = [];

  for (const event of events) {
    switch (event.type) {
      case 'thinking':
        lines.push('💭 Thinking...');
        break;
      case 'plan': {
        const data = event.data as { steps: PlanStep[] };
        currentPlan = data.steps;
        lines.push(`📋 Plan created: ${data.steps.length} steps`);
        break;
      }
      case 'plan_step': {
        const data = event.data as { stepId: string; status: StepStatus };
        const step = currentPlan.find((s) => s.id === data.stepId);
        if (step) {
          lines.push(`  ${getStatusIcon(data.status)} ${step.description}`);
        }
        break;
      }
      case 'tool_start': {
        const data = event.data as { name: string };
        lines.push(`🔧 Starting: ${data.name}`);
        break;
      }
      case 'tool_complete': {
        const data = event.data as { name: string; duration: number };
        lines.push(`✓ ${data.name} (${data.duration}ms)`);
        break;
      }
      case 'error': {
        const data = event.data as { message: string };
        lines.push(`❌ Error: ${data.message.slice(0, 100)}`);
        break;
      }
      case 'complete':
        lines.push('✅ Complete');
        break;
    }
  }

  return lines.slice(-20).join('\n');
}

// Default export
export default StreamingView;