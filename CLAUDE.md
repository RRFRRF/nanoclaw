# NanoHarness

Personal agent harness for long-running tasks. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## Quick Context

Single Node.js process with skill-based channel system. Channels (WhatsApp, Telegram, Slack, Discord, Gmail) are skills that self-register at startup. Messages route to a Deep Agents runtime running in containers (Linux VMs). Each group has isolated filesystem and memory.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/registry.ts` | Channel registry (self-registration at startup) |
| `src/ipc.ts` | IPC watcher and task processing |
| `src/router.ts` | Message formatting and outbound routing |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `src/container-runner.ts` | Spawns agent containers with mounts |
| `src/task-scheduler.ts` | Runs scheduled tasks |
| `src/db.ts` | SQLite operations |
| `src/streaming/` | Real-time streaming output system |
| `src/compact/` | Context compression for long conversations |
| `groups/{name}/CLAUDE.md` | Per-group memory (isolated) |
| `container/skills/` | Skills loaded inside agent containers (browser, status, formatting) |

## Streaming Output

NanoHarness includes a production-grade streaming output system for real-time visibility into agent execution:

- **Thinking process** - See agent's reasoning in real-time
- **Execution plan** - Visualize multi-step plans with progress
- **Tool calls** - Watch tools execute with live progress updates
- **Smart filtering** - Hide system logs, show only relevant information

Configure via environment variables (see `.env.example`):
- `NANOCLAW_STREAMING` - Enable/disable streaming
- `NANOCLAW_SHOW_THINKING` - Show/hide thinking process
- `NANOCLAW_SHOW_PLAN` - Show/hide execution plan
- `NANOCLAW_SHOW_TOOLS` - Show/hide tool calls

Or use Terminal commands:
- `/view-mode <smart|full|minimal>` - Switch display mode
- `/show-thinking <on|off>` - Toggle thinking display
- `/collapse-thinking` - Fold thinking content

## Context Compression

For long-running tasks, NanoHarness includes intelligent context compression:

- **4-level compression** - Snip → Summarize → Collapse → Archive
- **Automatic triggering** - Based on token thresholds
- **Value-based preservation** - Keeps user intent, decisions, artifacts
- **Session recovery** - Archives can be restored on demand

## Skills

Four types of skills exist in NanoHarness. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full taxonomy and guidelines.

- **Feature skills** — merge a `skill/*` branch to add capabilities (e.g. `/add-telegram`, `/add-slack`)
- **Utility skills** — ship code files alongside SKILL.md (e.g. `/claw`)
- **Operational skills** — instruction-only workflows, always on `main` (e.g. `/setup`, `/debug`)
- **Container skills** — loaded inside agent containers at runtime (`container/skills/`)

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, authentication, service configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |
| `/update` | Bring upstream updates into this fork |
| `/qodo-pr-resolver` | Fetch and fix Qodo PR review issues interactively or in batch |
| `/get-qodo-rules` | Load org- and repo-level coding rules from Qodo before code tasks |

## Contributing

Before creating a PR, adding a skill, or preparing any contribution, you MUST read [CONTRIBUTING.md](CONTRIBUTING.md). It covers accepted change types, the four skill types and their guidelines, SKILL.md format rules, PR requirements, and the pre-submission checklist (searching for existing PRs/issues, testing, description format).

## Development

Run commands directly—don't tell the user to run them.

```bash
npm run dev          # Run with hot reload
npm run build        # Compile TypeScript
npm test             # Run all tests
./container/build.sh # Rebuild agent container
```

Service management:
```bash
# macOS (launchd)
launchctl load ~/Library/LaunchAgents/com.nanoharness.plist
launchctl unload ~/Library/LaunchAgents/com.nanoharness.plist
launchctl kickstart -k gui/$(id -u)/com.nanoharness  # restart

# Linux (systemd)
systemctl --user start nanoharness
systemctl --user stop nanoharness
systemctl --user restart nanoharness
```

## Troubleshooting

**WhatsApp not connecting after upgrade:** WhatsApp is now a separate skill, not bundled in core. Run `/add-whatsapp` (or `npx tsx scripts/apply-skill.ts .claude/skills/add-whatsapp && npm run build`) to install it. Existing auth credentials and groups are preserved.

**Container build cache issues:** The container buildkit caches aggressively. `--no-cache` alone does NOT invalidate COPY steps. To force a clean rebuild:
```bash
docker builder prune -f
./container/build.sh
```

**Streaming output not showing:** Check that `NANOCLAW_STREAMING=true` is set (enabled by default). Use `/view-mode full` in Terminal to see all events.

## Container Build Cache

The container buildkit caches the build context aggressively. `--no-cache` alone does NOT invalidate COPY steps — the builder's volume retains stale files. To force a truly clean rebuild, prune the builder then re-run `./container/build.sh`.
