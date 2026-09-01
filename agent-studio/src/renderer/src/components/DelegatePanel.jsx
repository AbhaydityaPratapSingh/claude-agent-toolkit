import { useCallback, useEffect, useRef, useState } from "react";
import { accentFor } from "../accent.js";

/** Sub-cent runs are common, so never round a real cost down to "$0.00". */
export function money(usd) {
  if (usd == null) return "—";
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function tokens(n) {
  if (n == null) return "—";
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
}

function secs(ms) {
  return ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`;
}

function when(ts) {
  const d = new Date(ts);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function DelegatePanel({ agent, meta, onClose }) {
  const MODES = meta.permissionModes;
  const [task, setTask] = useState("");
  const [cwd, setCwd] = useState(meta.projectRoot ?? "");
  const [mode, setMode] = useState("default");
  const [lines, setLines] = useState([]);
  const [runId, setRunId] = useState(null);
  const [exitCode, setExitCode] = useState(null);
  const [history, setHistory] = useState([]);
  const [totals, setTotals] = useState(null);
  const [summary, setSummary] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const consoleRef = useRef(null);
  const runIdRef = useRef(null);

  const running = runId !== null && exitCode === null;
  const accent = accentFor(agent.name);
  const activeMode = MODES.find((m) => m.id === mode);
  const claudeMissing = meta.claude?.checked && !meta.claude.available;

  const loadHistory = useCallback(async () => {
    const [entries, sums] = await Promise.all([
      window.studio.listHistory(agent.name),
      window.studio.historyTotals(agent.name),
    ]);
    setHistory(entries);
    setTotals(sums);
  }, [agent.name]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const offData = window.studio.onDelegateData((p) => {
      if (p.runId !== runIdRef.current) return;
      setLines((prev) => [
        ...prev,
        { text: p.chunk, stderr: p.stderr, notice: p.notice },
      ]);
    });
    const offSummary = window.studio.onDelegateSummary((p) => {
      if (p.runId !== runIdRef.current) return;
      setSummary(p);
    });
    const offEnd = window.studio.onDelegateEnd((p) => {
      if (p.runId !== runIdRef.current) return;
      setExitCode(p.code);
      loadHistory();
    });
    return () => {
      offData();
      offSummary();
      offEnd();
    };
  }, [loadHistory]);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [lines, exitCode]);

  /** Load a past run back into the form and console, without re-running it. */
  async function replay(entry) {
    const full = await window.studio.getRun(entry.runId);
    setShowHistory(false);
    setTask(entry.task);
    setCwd(entry.cwd);
    setMode(entry.mode);
    runIdRef.current = null;
    setRunId(null);
    setExitCode(null);
    setSummary(full?.summary ?? null);
    setLines([
      {
        text: `▸ replay of ${when(entry.startedAt)} · exit ${entry.exitCode}\n\n`,
        sys: true,
      },
      ...(full?.output ? [{ text: full.output }] : []),
      ...(full?.truncated
        ? [{ text: "\n── output truncated in history\n", sys: true }]
        : []),
    ]);
  }

  async function clearHistory() {
    await window.studio.clearHistory(agent.name);
    setShowHistory(false);
    loadHistory();
  }

  async function start() {
    if (!task.trim() || !cwd.trim()) return;
    setLines([{ text: `▸ ${agent.name} · ${cwd} · [${mode}]\n\n`, sys: true }]);
    setExitCode(null);
    setSummary(null);
    const id = await window.studio.startDelegation({
      agentName: agent.name,
      task: task.trim(),
      cwd: cwd.trim(),
      mode,
    });
    runIdRef.current = id;
    setRunId(id);
  }

  async function stop() {
    if (runId) await window.studio.stopDelegation(runId);
  }

  async function browse() {
    const picked = await window.studio.pickDirectory(cwd || undefined);
    if (picked) setCwd(picked);
  }

  function close() {
    if (running) stop();
    onClose();
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="pane" style={{ maxWidth: 860 }}>
        <div className="pane-head">
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: accent,
              boxShadow: `0 0 10px ${accent}`,
            }}
          />
          <div className="pane-title">Run · {agent.name}</div>
          {history.length > 0 && (
            <button onClick={() => setShowHistory((v) => !v)}>
              History · {history.length}
            </button>
          )}
          <button className="ghost" onClick={close}>✕</button>
        </div>

        <div className="pane-body">
          {claudeMissing && (
            <div className="error">
              The <code>claude</code> CLI was not found on your PATH, so this run
              will fail immediately.
            </div>
          )}

          {showHistory && (
            <div className="field">
              <span className="label">Past runs</span>
              <div className="history">
                {history.map((h) => (
                  <div
                    key={h.runId}
                    className="history-item"
                    onClick={() => replay(h)}
                  >
                    <span
                      className={`dotmark ${h.exitCode === 0 ? "ok" : "bad"}`}
                    />
                    <span className="history-task" title={h.task}>
                      {h.task}
                    </span>
                    <span className="history-meta">
                      {money(h.summary?.costUsd)} · {h.mode} · {when(h.startedAt)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="hint">
                Selecting a run restores its task, folder, mode, and output —
                press Run to execute it again.
                {totals?.pricedRuns > 0 && (
                  <>
                    {" "}
                    This agent has cost <b>{money(totals.costUsd)}</b> across{" "}
                    {totals.pricedRuns} priced run
                    {totals.pricedRuns === 1 ? "" : "s"}.
                  </>
                )}
              </div>
              <button
                className="ghost"
                style={{ marginTop: 8 }}
                onClick={clearHistory}
              >
                Clear history for this agent
              </button>
            </div>
          )}

          <div className="field">
            <span className="label">Task</span>
            <textarea
              rows={3}
              value={task}
              disabled={running}
              placeholder="Review the auth middleware for missing authorization checks."
              onChange={(e) => setTask(e.target.value)}
              style={{ fontFamily: "var(--font-body)", fontSize: 14 }}
            />
          </div>

          <div className="field">
            <span className="label">Working directory</span>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={cwd}
                disabled={running}
                placeholder="C:\\Users\\you\\projects\\my-app"
                onChange={(e) => setCwd(e.target.value)}
              />
              <button onClick={browse} disabled={running}>Browse</button>
            </div>
            <div className="hint">The agent reads and writes files relative to this folder.</div>
          </div>

          <div className="field">
            <span className="label">Permission mode</span>
            <div className="segment">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  className={`${mode === m.id ? "on" : ""} ${m.danger ? "risky" : ""}`}
                  disabled={running}
                  onClick={() => setMode(m.id)}
                >
                  {m.id}
                </button>
              ))}
            </div>
            {activeMode.danger ? (
              <div className="warn danger">
                <div className="warn-head">No prompts — nothing to stop it</div>
                {activeMode.note} Only use this in a folder whose contents you are
                willing to have changed without review.
              </div>
            ) : (
              <div className="hint">{activeMode.note}</div>
            )}
          </div>

          <div className="field">
            <span className="label">Output</span>
            <div className="console" ref={consoleRef}>
              {lines.length === 0 ? (
                <span className="sys">Idle — describe a task and press Run.</span>
              ) : (
                lines.map((l, i) => (
                  <span
                    key={i}
                    className={
                      l.stderr
                        ? "stderr"
                        : l.notice
                          ? "notice"
                          : l.sys
                            ? "sys"
                            : ""
                    }
                  >
                    {l.text}
                  </span>
                ))
              )}
              {exitCode !== null && (
                <span className="sys">
                  {"\n"}── exited with code {exitCode}
                </span>
              )}
            </div>

            {summary && (
              <div className="meter">
                <div className="meter-cell">
                  <b>{money(summary.costUsd)}</b>
                  <span className="label">cost</span>
                </div>
                <div className="meter-cell">
                  <b>{tokens(summary.usage?.input)}</b>
                  <span className="label">in</span>
                </div>
                <div className="meter-cell">
                  <b>{tokens(summary.usage?.output)}</b>
                  <span className="label">out</span>
                </div>
                <div className="meter-cell">
                  <b>{tokens(summary.usage?.cacheRead)}</b>
                  <span className="label">cached</span>
                </div>
                <div className="meter-cell">
                  <b>{secs(summary.durationMs)}</b>
                  <span className="label">took</span>
                </div>
                <div className="meter-cell">
                  <b>{summary.numTurns ?? "—"}</b>
                  <span className="label">turns</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="pane-foot">
          {running && (
            <div className="status" style={{ marginRight: "auto" }}>
              <span className="pulse" />
              running
            </div>
          )}
          {running ? (
            <button className="danger" onClick={stop}>Stop</button>
          ) : (
            <button onClick={close}>Close</button>
          )}
          <button
            className="primary"
            disabled={running || !task.trim() || !cwd.trim()}
            onClick={start}
          >
            {exitCode !== null ? "Run again" : "Run"}
          </button>
        </div>
      </div>
    </div>
  );
}
