import fs from "node:fs";
import path from "node:path";

const MAX_RUNS = 60;
/** Output is kept for re-reading, not archival — a runaway agent can emit megabytes. */
const MAX_OUTPUT_CHARS = 80_000;

let filePath = null;
let runs = [];

export function initHistory(userDataDir) {
  filePath = path.join(userDataDir, "run-history.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    runs = Array.isArray(parsed) ? parsed : [];
  } catch {
    runs = [];
  }
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(runs), "utf8");
  } catch {
    /* history is a convenience — never break a run over it */
  }
}

export function recordRun({ runId, agentName, task, cwd, mode }) {
  runs.unshift({
    runId,
    agentName,
    task,
    cwd,
    mode,
    startedAt: Date.now(),
    finishedAt: null,
    exitCode: null,
    output: "",
    truncated: false,
    summary: null,
  });
  runs = runs.slice(0, MAX_RUNS);
}

/** Cost and token usage, reported once per run in the CLI's final event. */
export function recordSummary(runId, summary) {
  const run = runs.find((r) => r.runId === runId);
  if (!run) return;
  run.summary = summary;
}

export function appendOutput(runId, chunk) {
  const run = runs.find((r) => r.runId === runId);
  if (!run) return;
  if (run.output.length >= MAX_OUTPUT_CHARS) {
    run.truncated = true;
    return;
  }
  run.output += chunk;
  if (run.output.length > MAX_OUTPUT_CHARS) {
    run.output = run.output.slice(0, MAX_OUTPUT_CHARS);
    run.truncated = true;
  }
}

export function finishRun(runId, exitCode) {
  const run = runs.find((r) => r.runId === runId);
  if (!run) return;
  run.exitCode = exitCode;
  run.finishedAt = Date.now();
  persist();
}

export function listHistory(agentName) {
  const scoped = agentName ? runs.filter((r) => r.agentName === agentName) : runs;
  return scoped.map(({ output, ...meta }) => meta);
}

export function getRun(runId) {
  return runs.find((r) => r.runId === runId) ?? null;
}

/** Rolled-up spend, so the cost of a habit is visible and not just per-run. */
export function historyTotals(agentName) {
  const scoped = agentName ? runs.filter((r) => r.agentName === agentName) : runs;
  const priced = scoped.filter((r) => r.summary?.costUsd != null);
  return {
    runs: scoped.length,
    pricedRuns: priced.length,
    costUsd: priced.reduce((sum, r) => sum + r.summary.costUsd, 0),
    inputTokens: priced.reduce((sum, r) => sum + (r.summary.usage?.input ?? 0), 0),
    outputTokens: priced.reduce((sum, r) => sum + (r.summary.usage?.output ?? 0), 0),
  };
}

export function clearHistory(agentName) {
  runs = agentName ? runs.filter((r) => r.agentName !== agentName) : [];
  persist();
  return true;
}
