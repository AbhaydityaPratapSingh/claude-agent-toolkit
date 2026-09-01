# Claude Agent Toolkit

Tools for managing Claude Code subagents — a shared vocabulary package, a terminal
dashboard, and a desktop app, all reading and writing the same `.claude/agents/`
files.

## Packages

| Package | What it is |
| --- | --- |
| [`agent-core`](./agent-core) | Shared vocabulary — tool list, model list, permission modes, name rules, lint. Used by both apps below so they can't drift apart. |
| [`agent-manager`](./agent-manager) | An interactive terminal dashboard for browsing, creating, editing, and delegating to subagents. Linked globally via `npm link`. |
| [`agent-studio`](./agent-studio) | A desktop app (Electron) for the same job — one card per agent, live delegation with streamed output, cost/token tracking per run, and optional git-backed versioning of the agents folder. |

Both `agent-manager` and `agent-studio` depend on `agent-core` as a local
`file:` dependency, so agent definitions, tool/model lists, and validation stay
in sync between the CLI and the desktop app.

See each package's own README for setup, usage, and architecture notes.
