# Agent Studio

A desktop app for managing Claude Code subagents. Dark, dot-matrix, one card per agent.

## Running it

```
npm run dev     # live-reload development
npm start       # run the production build
npm run dist    # build the Windows installer + portable exe into dist/
```

`dist/Agent Studio Setup 1.0.0.exe` installs per-user and creates desktop and Start
Menu shortcuts. `dist/Agent Studio 1.0.0 portable.exe` is a single file that runs
without installing, as does `dist/win-unpacked/Agent Studio.exe`.

## What it does

- **Browse** — every agent as its own card, with a stable accent colour and initial
  mark derived from its name, so the same agent always looks the same
- **Search / filter** — over name, description, tag, tool, model, and scope, with
  clickable tag chips
- **Create / edit** — name, description, tags, scope, model, tool allowlist, and
  persona, with live lint warnings for the things that quietly stop an agent
  being selected
- **Run** — delegates a task via `claude --agent <name> -p`, with a native folder
  picker, permission-mode selector, and output streaming live into the console
- **Cost and tokens per run** — USD cost, input/output/cached tokens, duration and
  turn count, plus a running total per agent
- **History** — the last 60 runs are kept; selecting one restores its task, folder,
  mode, cost, and captured output so it can be inspected or run again
- **Versions** — optional git tracking of the agents folder, with per-agent commit
  log, diff, and revert
- **Delete** — with confirmation showing the exact file being removed

Agents with no description or an empty persona are flagged in red, since a vague
description is the main reason an agent silently never gets picked.

## Scopes

- **global** — `~/.claude/agents/` — available in every project
- **project** — `<selected folder>/.claude/agents/` — only in that repo

Unlike the CLI, project scope here is a folder you pick in the app. The current
folder and the last six used are remembered between launches in
`studio-settings.json` under Electron's userData directory, alongside
`run-history.json`.

## Versioning

Versioning is opt-in and local. Pressing **Track** runs `git init` in the agents
folder, writes a `.gitignore` limiting history to `*.md`, and commits what is
there. After that, every save and delete auto-commits, and each card gets a **⟲**
button showing that file's commit log with diffs and a revert.

Nothing is pushed anywhere — there is no remote unless you add one yourself. If
git is not installed the offer never appears, and commit failures are swallowed
deliberately: versioning must never be the reason an agent fails to save.

## Cost tracking

Delegation runs with `--output-format stream-json --verbose` rather than plain
text, because the stream's final `result` event is the only place the CLI reports
`total_cost_usd` and token usage. `src/main/stream.js` reassembles readable text
from the event stream and pulls the cost out of that last event.

Consequences worth knowing:

- **Thinking blocks are dropped** from the console — they are long and bury the
  answer. Tool calls show as `⚙ ToolName` instead.
- **The `result` event repeats the final message**, so it is only printed when
  nothing was streamed. Emitting both prints the answer twice — this happened,
  and is what the end-to-end check now guards against.
- **Cost is null for runs that never reach a `result` event** (killed with Stop,
  or a crash), so the UI shows `—` rather than `$0.00`.

## Architecture

| Layer | Role |
| --- | --- |
| `src/main/` | Owns the filesystem and spawns `claude`. Node, full privileges. |
| `src/preload/` | `contextBridge` exposing a narrow API — no `fs`, no `child_process`, no `ipcRenderer` |
| `src/renderer/` | React UI. No Node access (`contextIsolation: true`, `nodeIntegration: false`) |
| `src/main/stream.js` | Parses the CLI's stream-json events into console text + cost |
| `src/main/history.js` | Persisted run log, capped at 60 runs / 80k chars each |
| `src/main/versioning.js` | Thin git wrapper — init, commit, log, diff, revert |
| `../agent-core/` | Tool list, model list, permission modes, name rules, lint — shared with the `agent-manager` CLI |

## Packaging and code signing

The Windows build is **unsigned**. electron-builder will happily produce the
installer without a certificate, but SmartScreen shows a "Windows protected your
PC" prompt on any machine that has not run it before — *More info → Run anyway*
gets past it. This is expected for a personal tool and is not a sign of a broken
build.

To ship it signed, supply a real Authenticode certificate through the environment
and rebuild — no config change is needed:

```
$env:CSC_LINK = "C:\path\to\cert.pfx"
$env:CSC_KEY_PASSWORD = "…"
npm run dist
```

Only the `win` target is configured. macOS and Linux builds would need `mac`/`linux`
blocks in `electron-builder.yml` and a matching host to build on — neither has been
tried here.

## Notes worth keeping

- **Frontmatter stays compatible with the `agent-manager` CLI** — both write `tools`
  and `model` by *omitting* them when set to "all tools" / "inherit", which is how
  Claude Code reads those defaults. Both import the same `agent-core` package, so the
  tool and model lists cannot drift apart.
- **`agent-core` is bundled, not externalized.** It is a `file:` dependency, so
  `externalizeDepsPlugin` excludes it deliberately — otherwise the packaged app would
  depend on an npm symlink surviving into `node_modules`.
- **Task text goes over stdin, not argv.** On Windows `claude` is a `.cmd` shim
  requiring `shell: true`, and that path does not quote arguments — a task containing
  spaces or `& | < >` would otherwise break the command line. Verified with those
  characters.
- **`--model` is deliberately not passed when delegating.** `--agent` already applies
  the model from the agent's own frontmatter; passing both would override it.
- **Run ids carry a timestamp** because history outlives the process — a per-launch
  counter would collide with runs already on disk.
- **History output is capped** at 80k characters per run and 60 runs, since a runaway
  agent can emit megabytes.
- **`tags` is our own frontmatter key.** Claude Code ignores frontmatter it does not
  recognise, so tagging is free — but it also means tags are invisible to the router
  and have no effect on agent selection.
- **stdout is decoded as utf8 on the stream**, not per chunk, so multi-byte characters
  cannot be split across a chunk boundary and arrive as replacement characters.
  Verified with `héllo — smoke ✓` and shell metacharacters in the task text.
- `@noble/hashes` is pinned via `overrides` to a CJS-compatible v1: electron-builder 26
  needs `require(ESM)`, which only works on Node ≥ 20.19.
