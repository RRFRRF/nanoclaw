# NanoHarness Runtime Optimization Plan

## Background

NanoHarness is a fork of NanoClaw that already replaced the container-side Claude Agent SDK execution path with Deep Agents. The target product direction is:

- users manage agents through the TUI
- users dispatch tasks to those agents
- agents execute long-running workflows inside containers
- workflows may run for hours
- tasks should survive transient provider failures where possible
- the runtime should evolve from a NanoClaw-specific tool shim toward a more general MCP-capable harness

This document tracks the next optimization tranche focused on three areas:

1. host-side retry for scheduled tasks on transient provider errors
2. configurable auto-continue, including scheduled tasks
3. a generic MCP backend integration layer in the Deep Agents runtime

## Current State Summary

### What already works

- TUI agent creation, switching, deletion, and direct message dispatch
- per-group container isolation
- Deep Agents execution inside the container
- session + checkpoint persistence
- live status streaming from the container
- live stream log files on the host
- NanoClaw-specific orchestration tools exposed in the runtime as `mcp__nanoclaw__*`

### Gaps to close

- scheduled tasks do not retry transient upstream failures at the host layer
- auto-continue is hard-coded and disabled for scheduled tasks
- generic MCP servers are not wired into Deep Agents yet; only NanoClaw-specific tool adapters exist

## Optimization Goals

### Goal 1: Scheduled Task Reliability

Add a host-side retry loop for scheduled tasks when the failure is likely transient:

- HTTP 429 / rate limit
- upstream 5xx
- temporarily unavailable
- timeout / connection reset / gateway errors

Constraints:

- avoid infinite retry loops
- preserve task logs and visibility
- do not duplicate user-facing messages on partial success

### Goal 2: Configurable Auto-Continue

Replace the hard-coded auto-continue behavior with configuration:

- `NANOCLAW_AUTO_CONTINUE_LIMIT`
- `NANOCLAW_AUTO_CONTINUE_SCHEDULED`

Desired behavior:

- normal chat turns keep current auto-continue semantics by default
- scheduled tasks can opt into the same continuation loop
- the continuation limit is explicit and easy to reason about

### Goal 3: Generic MCP Backend Layer

Introduce a reusable MCP client layer for Deep Agents:

- support stdio MCP servers
- dynamically discover tools via `listTools`
- expose them as Deep Agents tools alongside existing NanoClaw tools
- preserve `mcp__nanoclaw__*` for backwards compatibility

Constraints:

- do not break the existing runtime
- keep tool naming stable and explicit
- log tool-loading failures clearly

## Delivery Plan

### Phase 1: Reliability primitives

- add scheduled task transient error classification
- add retry configuration and bounded backoff
- ensure retries happen before final task failure is recorded

### Phase 2: Continuation controls

- make auto-continue configurable via env
- enable scheduled-task participation when configured
- cover behavior with focused tests

### Phase 3: Generic MCP integration

- add MCP client transport bootstrap code
- load configured stdio servers
- translate MCP tools into Deep Agents-compatible tool wrappers
- keep existing NanoClaw tools registered in parallel

### Phase 4: Verification

- build
- targeted runtime tests
- scheduler tests
- regression tests for existing host/container flow

## Implementation Notes

### Scheduled task retry model

Proposed default policy:

- retry count: 3
- base backoff: 10 seconds
- exponential backoff
- retry only when no successful completion marker has been observed

### Auto-continue configuration

Proposed defaults:

- `NANOCLAW_AUTO_CONTINUE_LIMIT=6`
- `NANOCLAW_AUTO_CONTINUE_SCHEDULED=0`

### MCP configuration model

Initial transport scope:

- stdio only

Proposed env payload:

- `NANOCLAW_MCP_SERVERS_JSON`

Shape:

```json
[
  {
    "name": "playwright",
    "command": "node",
    "args": ["./mcp/playwright-server.js"],
    "cwd": "/workspace/group",
    "env": {
      "FOO": "bar"
    }
  }
]
```

Tool exposure model:

- tool names become `mcp__<server_name>__<tool_name>`
- existing `mcp__nanoclaw__*` tools remain first-party runtime tools

## Risks

### Risk 1: Duplicate scheduled task output

If a provider error occurs after a partial streamed result, a retry could duplicate outward messages.

Mitigation:

- only host-retry when no completed result has been emitted
- track whether a user-visible result was already sent during the attempt

### Risk 2: MCP schema mismatch

MCP tools expose JSON Schema, while Deep Agents tool wrappers want Zod schemas.

Mitigation:

- implement a bounded JSON-Schema-to-Zod converter for common scalar/object/array types
- fall back to a generic JSON object schema when exact conversion is not possible

### Risk 3: Additional runtime complexity

The container runtime is already carrying compatibility logic.

Mitigation:

- isolate new MCP code into helper functions
- preserve existing behavior when no MCP config is present

## Test Plan

### Scheduled task retry

- retries on 429
- retries on 502 / temporarily unavailable
- does not retry on deterministic invalid input
- stops after configured retry budget

### Auto-continue

- honors env-based limit
- skips scheduled tasks by default
- includes scheduled tasks when enabled

### MCP

- parses configured stdio servers
- lists tools and registers wrappers
- gracefully ignores failed MCP server startup

## Progress

- [x] Scope review completed
- [x] Plan/progress document written
- [x] Scheduled task retry implemented
- [x] Configurable auto-continue implemented
- [x] Generic MCP backend layer implemented
- [x] Build and tests passed

## Progress Log

### 2026-04-01

- Reviewed host message loop, queueing, container execution, runtime prompt injection, scheduler flow, and current Deep Agents integration.
- Confirmed that Deep Agents is the active container execution engine, but MCP support is still NanoClaw-specific rather than generic.
- Identified the three priority improvements captured in this document.
- Added host-side transient error classification and bounded retry/backoff for scheduled tasks in the scheduler.
- Extended the same transient provider retry policy to normal interactive container turns on the host side.
- Added env-driven auto-continue controls via `NANOCLAW_AUTO_CONTINUE_LIMIT` and `NANOCLAW_AUTO_CONTINUE_SCHEDULED`, and passed them from host to container.
- Added generic stdio MCP bootstrap in the container runtime via `NANOCLAW_MCP_SERVERS_JSON`, while preserving first-party `mcp__nanoclaw__*` tools.
- Added explicit provider template support for `MODEL_API_FORMAT=anthropic|openai-responses|openai-compatible` in env configuration.
- Added focused runtime and scheduler tests for auto-continue config, MCP config parsing, and scheduled-task retry behavior.
- Verified root `npm run build` and `npm test` both pass after the changes.
- Verified `npm run smoke:container-build` passes and the rebuilt `nanoharness-agent:latest` image compiles inside Docker.
- `npm run smoke:container-agent` is still blocked by repeated upstream provider `502` responses on April 1, 2026 rather than by a local compile/runtime wiring failure.
