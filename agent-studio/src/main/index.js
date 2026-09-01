import { app, shell, BrowserWindow, ipcMain, dialog } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  scanAgents,
  writeAgent,
  deleteAgent,
  agentExists,
  validateName,
  globalDir,
  projectDirFor,
  KNOWN_TOOLS,
  MODELS,
  PERMISSION_MODES,
} from "./agents.js";
import {
  initHistory,
  recordRun,
  appendOutput,
  recordSummary,
  finishRun,
  listHistory,
  getRun,
  clearHistory,
  historyTotals,
} from "./history.js";
import { createStreamParser } from "./stream.js";
import {
  gitAvailable,
  isRepo,
  initRepo,
  commitChange,
  fileHistory,
  fileDiff,
  revertFile,
} from "./versioning.js";

let mainWindow = null;

const MAX_RECENT_PROJECTS = 6;

// ── tiny settings store (project folder + recent folders) ───────────────────

const DEFAULT_SETTINGS = { projectRoot: null, recentProjects: [] };

function settingsPath() {
  return path.join(app.getPath("userData"), "studio-settings.json");
}

function loadSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      recentProjects: Array.isArray(parsed.recentProjects)
        ? parsed.recentProjects
        : [],
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(next) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** Most-recent-first, de-duplicated, dropping folders that no longer exist. */
function withRecent(current, root) {
  const next = [root, ...current.filter((p) => p !== root)]
    .filter((p) => fs.existsSync(p))
    .slice(0, MAX_RECENT_PROJECTS);
  return next;
}

function selectProject(root) {
  settings = saveSettings({
    ...settings,
    projectRoot: root,
    recentProjects: withRecent(settings.recentProjects, root),
  });
  return settings.projectRoot;
}

let settings = { ...DEFAULT_SETTINGS };

// ── claude CLI preflight ───────────────────────────────────────────────────

let claudeStatus = { checked: false, available: false, version: null };

/**
 * Delegation is the one feature that depends on something outside the app, so
 * probe for it up front rather than surfacing ENOENT after a task is typed.
 */
function checkClaude() {
  return new Promise((resolve) => {
    let stdout = "";
    const child = spawn("claude", ["--version"], {
      shell: true,
      windowsHide: true,
    });
    const done = (available, version) => {
      claudeStatus = { checked: true, available, version };
      resolve(claudeStatus);
    };
    const timer = setTimeout(() => {
      child.kill();
      done(false, null);
    }, 8000);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.on("error", () => {
      clearTimeout(timer);
      done(false, null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done(code === 0, stdout.trim() || null);
    });
  });
}

// ── delegation ─────────────────────────────────────────────────────────────

const runs = new Map();
let runSeq = 0;

/**
 * The task text is written to the child's stdin rather than passed as an argv
 * entry: on Windows `claude` is a .cmd shim, which requires shell:true, and
 * that path does not quote arguments — so any prompt containing spaces or
 * & | < > would otherwise break the command line.
 */
function startDelegation({ agentName, task, cwd, mode }) {
  // History outlives the process, so ids must not restart at 1 on each launch.
  const runId = `run-${Date.now()}-${++runSeq}`;
  const args = [
    "--agent",
    agentName,
    "--permission-mode",
    mode,
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
  ];

  recordRun({ runId, agentName, task, cwd, mode });

  const child = spawn("claude", args, {
    cwd,
    shell: true,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  const send = (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, { runId, ...payload });
    }
  };

  const emit = (chunk, kind) => {
    appendOutput(runId, chunk);
    send("delegate:data", { chunk, stderr: kind === "stderr", notice: kind === "notice" });
  };

  const parser = createStreamParser({
    onText: (text) => emit(text, "text"),
    onNotice: (text) => emit(`${text}\n`, "notice"),
    onResult: (summary) => {
      recordSummary(runId, summary);
      send("delegate:summary", summary);
    },
  });

  // Decoding as utf8 on the stream keeps multi-byte characters from being
  // split across chunk boundaries and arriving as replacement characters.
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  child.stdout.on("data", (d) => parser.push(d));
  child.stderr.on("data", (d) => emit(d, "stderr"));
  child.on("error", (err) => {
    emit(`Failed to launch claude: ${err.message}\n`, "stderr");
    finishRun(runId, 1);
    send("delegate:end", { code: 1 });
    runs.delete(runId);
  });
  child.on("close", (code) => {
    parser.end();
    finishRun(runId, code ?? 0);
    send("delegate:end", { code: code ?? 0 });
    runs.delete(runId);
  });

  child.stdin.write(task);
  child.stdin.end();

  runs.set(runId, child);
  return runId;
}

// ── ipc ────────────────────────────────────────────────────────────────────

function registerIpc() {
  ipcMain.handle("meta:get", () => ({
    tools: KNOWN_TOOLS,
    models: MODELS,
    permissionModes: PERMISSION_MODES,
    globalDir: globalDir(),
    projectRoot: settings.projectRoot,
    projectDir: projectDirFor(settings.projectRoot),
    recentProjects: settings.recentProjects,
    claude: claudeStatus,
  }));

  ipcMain.handle("claude:recheck", () => checkClaude());

  ipcMain.handle("agents:list", () => scanAgents(settings.projectRoot));

  ipcMain.handle("agents:save", async (_e, agent) => {
    const nameError = validateName(agent.name);
    if (nameError) throw new Error(nameError);
    if (!agent.description?.trim()) {
      throw new Error("Description is required — it is the routing signal");
    }
    const filePath = path.join(
      agent.scope === "user" ? globalDir() : projectDirFor(settings.projectRoot) ?? "",
      `${agent.name}.md`
    );
    if (filePath !== agent.originalPath && agentExists(agent.scope, agent.name, settings.projectRoot)) {
      throw new Error(`An agent named "${agent.name}" already exists in that scope`);
    }
    const written = writeAgent(agent, settings.projectRoot);
    await commitChange(
      path.dirname(written),
      `${agent.originalPath ? "Update" : "Add"} ${agent.name}`
    );
    // A rename leaves a deletion in the old folder when scope changed.
    if (agent.originalPath && path.dirname(agent.originalPath) !== path.dirname(written)) {
      await commitChange(path.dirname(agent.originalPath), `Move ${agent.name} out of this scope`);
    }
    return written;
  });

  ipcMain.handle("agents:delete", async (_e, filePath) => {
    deleteAgent(filePath);
    await commitChange(path.dirname(filePath), `Delete ${path.basename(filePath, ".md")}`);
    return true;
  });

  ipcMain.handle("agents:reveal", (_e, filePath) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle("project:pick", async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: "Select a project folder",
      properties: ["openDirectory"],
    });
    if (res.canceled || !res.filePaths[0]) return settings.projectRoot;
    return selectProject(res.filePaths[0]);
  });

  ipcMain.handle("project:use", (_e, root) => {
    if (!root || !fs.existsSync(root)) {
      settings = saveSettings({
        ...settings,
        recentProjects: settings.recentProjects.filter((p) => p !== root),
      });
      throw new Error(`That folder no longer exists: ${root}`);
    }
    return selectProject(root);
  });

  ipcMain.handle("project:clear", () => {
    settings = saveSettings({ ...settings, projectRoot: null });
    return null;
  });

  ipcMain.handle("history:list", (_e, agentName) => listHistory(agentName));
  ipcMain.handle("history:get", (_e, runId) => getRun(runId));
  ipcMain.handle("history:clear", (_e, agentName) => clearHistory(agentName));
  ipcMain.handle("history:totals", (_e, agentName) => historyTotals(agentName));

  // ── versioning ───────────────────────────────────────────────────────────

  const dirForScopeKey = (scope) =>
    scope === "user" ? globalDir() : projectDirFor(settings.projectRoot);

  ipcMain.handle("vcs:status", async () => ({
    git: await gitAvailable(),
    user: isRepo(globalDir()),
    project: isRepo(projectDirFor(settings.projectRoot)),
  }));

  ipcMain.handle("vcs:init", (_e, scope) => initRepo(dirForScopeKey(scope)));

  ipcMain.handle("vcs:log", (_e, filePath) =>
    fileHistory(path.dirname(filePath), path.basename(filePath))
  );

  ipcMain.handle("vcs:diff", (_e, filePath, hash) =>
    fileDiff(path.dirname(filePath), path.basename(filePath), hash)
  );

  ipcMain.handle("vcs:revert", (_e, filePath, hash) =>
    revertFile(path.dirname(filePath), path.basename(filePath), hash)
  );

  ipcMain.handle("dir:pick", async (_e, defaultPath) => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: "Run the task in…",
      defaultPath: defaultPath || undefined,
      properties: ["openDirectory"],
    });
    return res.canceled ? null : res.filePaths[0];
  });

  ipcMain.handle("delegate:start", (_e, opts) => startDelegation(opts));

  ipcMain.handle("delegate:stop", (_e, runId) => {
    const child = runs.get(runId);
    if (!child) return false;
    child.kill();
    runs.delete(runId);
    return true;
  });
}

// ── window ─────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 940,
    minHeight: 640,
    show: false,
    backgroundColor: "#0a0a0a",
    title: "Agent Studio",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  settings = loadSettings();
  initHistory(app.getPath("userData"));
  registerIpc();
  createWindow();

  checkClaude().then((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("claude:status", status);
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  for (const child of runs.values()) child.kill();
  if (process.platform !== "darwin") app.quit();
});
