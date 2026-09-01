import { useCallback, useEffect, useState } from "react";

function when(ts) {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VersionPanel({ agent, onClose, onReverted }) {
  const [commits, setCommits] = useState(null);
  const [selected, setSelected] = useState(null);
  const [diff, setDiff] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setCommits(await window.studio.vcsLog(agent.filePath));
  }, [agent.filePath]);

  useEffect(() => {
    load();
  }, [load]);

  async function show(commit) {
    setSelected(commit.hash);
    setDiff(await window.studio.vcsDiff(agent.filePath, commit.hash));
  }

  async function revert() {
    setBusy(true);
    setError(null);
    try {
      await window.studio.vcsRevert(agent.filePath, selected);
      await onReverted();
      onClose();
    } catch (err) {
      setError(err.message ?? String(err));
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pane" style={{ maxWidth: 860 }}>
        <div className="pane-head">
          <div className="pane-title">Versions · {agent.name}</div>
          <button className="ghost" onClick={onClose}>✕</button>
        </div>

        <div className="pane-body">
          {error && <div className="error">{error}</div>}

          {commits === null ? (
            <div className="hint">Reading git history…</div>
          ) : commits.length === 0 ? (
            <div className="hint">
              No commits touch this file yet. It will get one the next time you
              save it.
            </div>
          ) : (
            <>
              <div className="field">
                <span className="label">Commits</span>
                <div className="history">
                  {commits.map((c, i) => (
                    <div
                      key={c.hash}
                      className={`history-item ${selected === c.hash ? "on" : ""}`}
                      onClick={() => show(c)}
                    >
                      <span className="history-task">{c.subject}</span>
                      <span className="history-meta">
                        {i === 0 ? "current · " : ""}
                        {c.hash.slice(0, 7)} · {when(c.at)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {selected && (
                <div className="field">
                  <span className="label">Diff</span>
                  <div className="console" style={{ height: 260 }}>
                    {diff.split("\n").map((line, i) => (
                      <span
                        key={i}
                        className={
                          line.startsWith("+") && !line.startsWith("+++")
                            ? "add"
                            : line.startsWith("-") && !line.startsWith("---")
                              ? "del"
                              : "sys"
                        }
                      >
                        {line + "\n"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="pane-foot">
          <div style={{ flex: 1 }} />
          <button onClick={onClose}>Close</button>
          <button
            className="primary"
            disabled={!selected || busy || commits?.[0]?.hash === selected}
            onClick={revert}
            title={
              commits?.[0]?.hash === selected
                ? "This is already the current version"
                : undefined
            }
          >
            {busy ? "Reverting…" : "Revert to this"}
          </button>
        </div>
      </div>
    </div>
  );
}
