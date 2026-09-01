import { useState } from "react";
import { lintAgent } from "agent-core";

const SCAFFOLD = `You are <identity — who this agent is and what experience it brings>.

## What you do
- <primary responsibility>

## What you never do
- <hard boundary>

## How you report
- <output format: bullets? file:line refs? findings only, no fixes?>
`;

export default function AgentEditor({
  agent,
  meta,
  isNew,
  onSave,
  onDelete,
  onClose,
}) {
  const [draft, setDraft] = useState(() => ({
    name: agent?.name ?? "",
    description: agent?.description ?? "",
    scope: agent?.scope ?? "user",
    model: agent?.model ?? "inherit",
    tools: agent?.tools ?? null,
    tags: agent?.tags ?? [],
    body: agent?.body ?? SCAFFOLD,
    originalPath: agent?.filePath ?? null,
  }));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const allTools = draft.tools === null;
  const warnings = lintAgent(draft);

  function toggleTool(tool) {
    const current = draft.tools ?? [];
    set({
      tools: current.includes(tool)
        ? current.filter((t) => t !== tool)
        : [...current, tool],
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave(draft);
    } catch (err) {
      setError(err.message ?? String(err));
      setBusy(false);
    }
  }

  const projectDisabled = !meta.projectRoot;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pane">
        <div className="pane-head">
          <div className="pane-title">{isNew ? "New agent" : draft.name}</div>
          <button className="ghost" onClick={onClose}>✕</button>
        </div>

        <div className="pane-body">
          {error && <div className="error">{error}</div>}

          {warnings.length > 0 && (
            <div className="warn">
              <div className="warn-head">
                {warnings.length} thing{warnings.length > 1 ? "s" : ""} worth
                fixing — you can still save
              </div>
              <ul>
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="field">
            <span className="label">Name</span>
            <input
              type="text"
              value={draft.name}
              placeholder="api-guardian"
              onChange={(e) => set({ name: e.target.value })}
            />
            <div className="hint">
              Lowercase kebab-case. This doubles as the subagent_type used to invoke it.
            </div>
          </div>

          <div className="field">
            <span className="label">Description</span>
            <input
              type="text"
              value={draft.description}
              placeholder="Use when reviewing API routes for auth gaps before merge."
              onChange={(e) => set({ description: e.target.value })}
            />
            <div className="hint">
              This is the routing signal — phrase it as “use when …”. Vague descriptions
              get skipped in favour of a general-purpose agent.
            </div>
          </div>

          <div className="field">
            <span className="label">Tags</span>
            <input
              type="text"
              value={draft.tags.join(", ")}
              placeholder="review, security, backend"
              onChange={(e) =>
                set({
                  tags: e.target.value
                    .split(",")
                    .map((t) => t.trim().toLowerCase())
                    .filter(Boolean),
                })
              }
            />
            <div className="hint">
              Comma-separated, for filtering in the grid. Claude Code ignores this
              field, so it has no effect on how the agent runs.
            </div>
          </div>

          <div className="field">
            <span className="label">Scope</span>
            <div className="segment">
              <button
                className={draft.scope === "user" ? "on" : ""}
                onClick={() => set({ scope: "user" })}
              >
                Global
              </button>
              <button
                className={draft.scope === "project" ? "on" : ""}
                disabled={projectDisabled}
                onClick={() => set({ scope: "project" })}
              >
                Project
              </button>
            </div>
            <div className="hint">
              {projectDisabled
                ? "Pick a project folder in the bar above to enable project scope."
                : draft.scope === "user"
                  ? "Available in every project on this machine."
                  : "Only available inside the selected project folder."}
            </div>
          </div>

          <div className="field">
            <span className="label">Model</span>
            <div className="segment">
              {meta.models.map((m) => (
                <button
                  key={m}
                  className={draft.model === m ? "on" : ""}
                  onClick={() => set({ model: m })}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="label">Tools</span>
            <div className="segment" style={{ marginBottom: 10 }}>
              <button
                className={allTools ? "on" : ""}
                onClick={() => set({ tools: null })}
              >
                All tools
              </button>
              <button
                className={!allTools ? "on" : ""}
                onClick={() => set({ tools: draft.tools ?? [] })}
              >
                Restrict
              </button>
            </div>
            {!allTools && (
              <div className="toolgrid">
                {meta.tools.map((tool) => (
                  <div
                    key={tool}
                    className={`tool ${draft.tools?.includes(tool) ? "on" : ""}`}
                    onClick={() => toggleTool(tool)}
                  >
                    {tool}
                  </div>
                ))}
              </div>
            )}
            <div className="hint">
              Restricting tools enforces the persona: a reviewer with no Edit or Write
              simply cannot modify code, whatever it is asked to do.
            </div>
          </div>

          <div className="field">
            <span className="label">Persona</span>
            <textarea
              rows={14}
              value={draft.body}
              onChange={(e) => set({ body: e.target.value })}
            />
            <div className="hint">
              This becomes the agent’s system prompt — identity, priorities, hard
              boundaries, and how it should report back.
            </div>
          </div>
        </div>

        <div className="pane-foot">
          {!isNew && (
            <button className="danger" onClick={() => onDelete(agent)}>
              Delete
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
