# agent-manager

An interactive terminal dashboard for your Claude Code subagents.

```
agent-manager
```

Linked globally via `npm link`, so it runs from any directory. The directory you
launch it from matters: project-scope agents and delegated tasks resolve against it.

## What it does

| Action | What happens |
| --- | --- |
| 📋 Browse agents | Boxed cards for every agent across both scopes, flagging missing descriptions and empty personas |
| ✨ Create an agent | Guided prompts for scope, name, description, tools, model, then your `$EDITOR` for the persona |
| 🛠 Modify an agent | Change any single field, edit the raw `.md`, or move an agent between global and project scope |
| 🚀 Delegate a task | Runs `claude --agent <name> -p` in a directory and permission mode you pick, streaming output live |
| 🗑 Delete an agent | Confirms, then removes the file |
| 📂 Show agent folders | Prints both scope paths |

## Scopes

- **🌍 global** — `~/.claude/agents/` — available in every project
- **📁 project** — `<cwd>/.claude/agents/` — only in that repo

A project agent shadows a global one of the same name.

## Notes

- Agent names are validated as kebab-case, since the name doubles as the `subagent_type`.
- The tool list, model list, and name rules come from the shared `agent-core` package,
  so this CLI and the Agent Studio desktop app cannot drift apart.
- `tools` is omitted from frontmatter when you grant all tools; `model` is omitted when set to `inherit`.
- Delegation sends the task over **stdin**, not argv — on Windows `claude` is a `.cmd`
  shim that needs `shell: true`, and that path does not quote arguments, so a prompt
  containing spaces or `& | < >` would otherwise break.
- `--model` is deliberately not passed when delegating: `--agent` already applies the
  model from the agent's own frontmatter.
