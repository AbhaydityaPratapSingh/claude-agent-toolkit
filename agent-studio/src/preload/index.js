import { contextBridge, ipcRenderer } from "electron";

/**
 * The renderer gets exactly these calls and nothing else — no fs, no
 * child_process, no ipcRenderer itself.
 */
const api = {
  getMeta: () => ipcRenderer.invoke("meta:get"),

  listAgents: () => ipcRenderer.invoke("agents:list"),
  saveAgent: (agent) => ipcRenderer.invoke("agents:save", agent),
  deleteAgent: (filePath) => ipcRenderer.invoke("agents:delete", filePath),
  revealAgent: (filePath) => ipcRenderer.invoke("agents:reveal", filePath),

  pickProject: () => ipcRenderer.invoke("project:pick"),
  useProject: (root) => ipcRenderer.invoke("project:use", root),
  clearProject: () => ipcRenderer.invoke("project:clear"),
  pickDirectory: (defaultPath) => ipcRenderer.invoke("dir:pick", defaultPath),

  recheckClaude: () => ipcRenderer.invoke("claude:recheck"),

  listHistory: (agentName) => ipcRenderer.invoke("history:list", agentName),
  getRun: (runId) => ipcRenderer.invoke("history:get", runId),
  clearHistory: (agentName) => ipcRenderer.invoke("history:clear", agentName),
  historyTotals: (agentName) => ipcRenderer.invoke("history:totals", agentName),

  vcsStatus: () => ipcRenderer.invoke("vcs:status"),
  vcsInit: (scope) => ipcRenderer.invoke("vcs:init", scope),
  vcsLog: (filePath) => ipcRenderer.invoke("vcs:log", filePath),
  vcsDiff: (filePath, hash) => ipcRenderer.invoke("vcs:diff", filePath, hash),
  vcsRevert: (filePath, hash) => ipcRenderer.invoke("vcs:revert", filePath, hash),

  startDelegation: (opts) => ipcRenderer.invoke("delegate:start", opts),
  stopDelegation: (runId) => ipcRenderer.invoke("delegate:stop", runId),

  /** Returns an unsubscribe fn so React effects can clean up. */
  onDelegateData: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("delegate:data", handler);
    return () => ipcRenderer.removeListener("delegate:data", handler);
  },
  onDelegateEnd: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("delegate:end", handler);
    return () => ipcRenderer.removeListener("delegate:end", handler);
  },
  onDelegateSummary: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("delegate:summary", handler);
    return () => ipcRenderer.removeListener("delegate:summary", handler);
  },
  onClaudeStatus: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("claude:status", handler);
    return () => ipcRenderer.removeListener("claude:status", handler);
  },
};

contextBridge.exposeInMainWorld("studio", api);
