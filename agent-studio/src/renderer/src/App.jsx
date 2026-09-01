import { useCallback, useEffect, useState } from "react";
import AgentCard from "./components/AgentCard.jsx";
import AgentEditor from "./components/AgentEditor.jsx";
import DelegatePanel from "./components/DelegatePanel.jsx";
import VersionPanel from "./components/VersionPanel.jsx";

export default function App() {
  const [meta, setMeta] = useState(null);
  const [agents, setAgents] = useState([]);
  const [editing, setEditing] = useState(null); // { agent, isNew }
  const [delegating, setDelegating] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [showRecent, setShowRecent] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState(null);
  const [vcs, setVcs] = useState(null);
  const [versioning, setVersioning] = useState(null);

  const refresh = useCallback(async () => {
    const [nextMeta, nextAgents, nextVcs] = await Promise.all([
      window.studio.getMeta(),
      window.studio.listAgents(),
      window.studio.vcsStatus(),
    ]);
    setMeta(nextMeta);
    setAgents(nextAgents);
    setVcs(nextVcs);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // The startup probe finishes after the first paint, so take the pushed result.
  useEffect(
    () =>
      window.studio.onClaudeStatus((status) =>
        setMeta((m) => (m ? { ...m, claude: status } : m))
      ),
    []
  );

  if (!meta) return null;

  const globalCount = agents.filter((a) => a.scope === "user").length;
  const projectCount = agents.filter((a) => a.scope === "project").length;

  async function handleSave(draft) {
    await window.studio.saveAgent(draft);
    setEditing(null);
    await refresh();
  }

  async function handleDelete(agent) {
    await window.studio.deleteAgent(agent.filePath);
    setConfirming(null);
    setEditing(null);
    await refresh();
  }

  async function pickProject() {
    await window.studio.pickProject();
    setShowRecent(false);
    await refresh();
  }

  async function useProject(root) {
    setShowRecent(false);
    try {
      await window.studio.useProject(root);
    } catch {
      /* the folder is gone; main has already dropped it from the list */
    }
    await refresh();
  }

  async function clearProject() {
    await window.studio.clearProject();
    await refresh();
  }

  async function recheckClaude() {
    setRechecking(true);
    const status = await window.studio.recheckClaude();
    setMeta((m) => ({ ...m, claude: status }));
    setRechecking(false);
  }

  const claudeMissing = meta.claude?.checked && !meta.claude.available;
  const otherRecents = (meta.recentProjects ?? []).filter(
    (p) => p !== meta.projectRoot
  );

  const allTags = [...new Set(agents.flatMap((a) => a.tags ?? []))].sort();

  const q = query.trim().toLowerCase();
  const visible = agents.filter((a) => {
    if (tagFilter && !(a.tags ?? []).includes(tagFilter)) return false;
    if (!q) return true;
    return [
      a.name,
      a.description,
      a.model,
      a.scope === "user" ? "global" : "project",
      ...(a.tags ?? []),
      ...(a.tools ?? []),
    ]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const filtering = Boolean(q || tagFilter);

  async function initVcs(scope) {
    await window.studio.vcsInit(scope);
    await refresh();
  }

  /** Versioning is per-folder, so a scope is only offered when it has agents. */
  const trackable = [
    { scope: "user", label: "global", tracked: vcs?.user, has: globalCount > 0 },
    {
      scope: "project",
      label: "project",
      tracked: vcs?.project,
      has: projectCount > 0 && Boolean(meta.projectRoot),
    },
  ].filter((s) => s.has);
  const untracked = trackable.filter((s) => !s.tracked);

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          Agent Studio
        </div>
        <div className="topbar-spacer" />
        <div className="counts">
          <div className="count">
            <b>{globalCount}</b>
            <span className="label">global</span>
          </div>
          <div className="count">
            <b>{projectCount}</b>
            <span className="label">project</span>
          </div>
        </div>
        <button onClick={refresh}>Refresh</button>
        <button
          className="primary"
          onClick={() => setEditing({ agent: null, isNew: true })}
        >
          + New
        </button>
      </div>

      <div className="body">
        {claudeMissing && (
          <div className="banner danger">
            <div>
              <b>The `claude` CLI was not found on your PATH.</b> Agents can still
              be created and edited, but Run will fail until it is installed and
              this app is restarted from a shell that can see it.
            </div>
            <button disabled={rechecking} onClick={recheckClaude}>
              {rechecking ? "Checking…" : "Re-check"}
            </button>
          </div>
        )}

        <div className="projectbar">
          <span className="label">Project</span>
          <span className="path">
            {meta.projectRoot ?? "none selected — only global agents are shown"}
          </span>
          {otherRecents.length > 0 && (
            <div className="recent-wrap">
              <button onClick={() => setShowRecent((v) => !v)}>
                Recent ▾
              </button>
              {showRecent && (
                <>
                  <div
                    className="recent-scrim"
                    onClick={() => setShowRecent(false)}
                  />
                  <div className="recent-menu">
                    {otherRecents.map((p) => (
                      <div
                        key={p}
                        className="recent-item"
                        title={p}
                        onClick={() => useProject(p)}
                      >
                        {p}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <button onClick={pickProject}>
            {meta.projectRoot ? "Change" : "Pick folder"}
          </button>
          {meta.projectRoot && (
            <button className="ghost" onClick={clearProject}>Clear</button>
          )}
        </div>

        {vcs?.git && untracked.length > 0 && (
          <div className="banner subtle">
            <div>
              Version your agents with git to get diff and revert for free —
              nothing leaves your machine, it just runs <code>git init</code> in
              the agents folder.
            </div>
            {untracked.map((s) => (
              <button key={s.scope} onClick={() => initVcs(s.scope)}>
                Track {s.label}
              </button>
            ))}
          </div>
        )}

        {agents.length > 0 && (
          <div className="filterbar">
            <input
              type="text"
              className="search"
              value={query}
              placeholder="Search name, description, tag, tool, model…"
              onChange={(e) => setQuery(e.target.value)}
            />
            {allTags.length > 0 && (
              <div className="tagrow">
                {allTags.map((t) => (
                  <span
                    key={t}
                    className={`chip tag ${tagFilter === t ? "on" : ""}`}
                    onClick={() => setTagFilter(tagFilter === t ? null : t)}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            {filtering && (
              <button
                className="ghost"
                onClick={() => {
                  setQuery("");
                  setTagFilter(null);
                }}
              >
                Clear
              </button>
            )}
          </div>
        )}

        {agents.length === 0 ? (
          <div className="empty">
            <h2>No agents yet</h2>
            <p>
              Subagents are plain markdown files. Create one here, or drop a
              <code> name.md </code> into the agents folder and hit refresh — either
              way it works in every Claude Code session immediately.
            </p>
            <p className="label" style={{ letterSpacing: "0.1em" }}>
              {meta.globalDir}
            </p>
            <button
              className="primary"
              onClick={() => setEditing({ agent: null, isNew: true })}
            >
              Create your first agent
            </button>
          </div>
        ) : (
          <div className="grid">
            {visible.map((agent) => (
              <AgentCard
                key={agent.filePath}
                agent={agent}
                onEdit={(a) => setEditing({ agent: a, isNew: false })}
                onDelegate={(a) => setDelegating(a)}
                onReveal={(a) => window.studio.revealAgent(a.filePath)}
                onTag={(t) => setTagFilter(t)}
                onVersions={
                  (agent.scope === "user" ? vcs?.user : vcs?.project)
                    ? (a) => setVersioning(a)
                    : null
                }
              />
            ))}
            {visible.length === 0 ? (
              <div className="card card-new" style={{ cursor: "default" }}>
                nothing matches
              </div>
            ) : (
              <div
                className="card card-new"
                onClick={() => setEditing({ agent: null, isNew: true })}
              >
                <span className="plus">+</span>
                New agent
              </div>
            )}
          </div>
        )}
      </div>

      {editing && (
        <AgentEditor
          agent={editing.agent}
          meta={meta}
          isNew={editing.isNew}
          onSave={handleSave}
          onDelete={(a) => setConfirming(a)}
          onClose={() => setEditing(null)}
        />
      )}

      {versioning && (
        <VersionPanel
          agent={versioning}
          onClose={() => setVersioning(null)}
          onReverted={refresh}
        />
      )}

      {delegating && (
        <DelegatePanel
          agent={delegating}
          meta={meta}
          onClose={() => setDelegating(null)}
        />
      )}

      {confirming && (
        <div className="overlay">
          <div className="pane" style={{ maxWidth: 460 }}>
            <div className="pane-head">
              <div className="pane-title">Delete agent</div>
            </div>
            <div className="pane-body">
              <p style={{ lineHeight: 1.6 }}>
                Permanently delete <b>{confirming.name}</b>?
              </p>
              <div className="hint" style={{ marginTop: 12 }}>
                {confirming.filePath}
              </div>
            </div>
            <div className="pane-foot">
              <button onClick={() => setConfirming(null)}>Cancel</button>
              <button className="danger" onClick={() => handleDelete(confirming)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
