import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import matter from "gray-matter";

export {
  KNOWN_TOOLS,
  MODELS,
  PERMISSION_MODES,
  validateName,
  lintAgent,
} from "agent-core";

export function globalDir() {
  return path.join(os.homedir(), ".claude", "agents");
}

export function projectDirFor(projectRoot) {
  return projectRoot ? path.join(projectRoot, ".claude", "agents") : null;
}

function readAgentFile(filePath, scope) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = matter(raw);
  const fm = parsed.data ?? {};

  const csv = (value) =>
    typeof value === "string"
      ? value.split(",").map((t) => t.trim()).filter(Boolean)
      : value;

  const tools = csv(fm.tools);
  const tags = csv(fm.tags);

  return {
    name: fm.name || path.basename(filePath, ".md"),
    description: fm.description || "",
    tools: Array.isArray(tools) ? tools : null,
    tags: Array.isArray(tags) ? tags : [],
    model: fm.model || "inherit",
    body: parsed.content.trim(),
    filePath,
    scope,
  };
}

function scanDir(dir, scope) {
  if (!dir || !fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith(".md")) continue;
    const filePath = path.join(dir, entry);
    try {
      out.push(readAgentFile(filePath, scope));
    } catch (err) {
      out.push({
        name: path.basename(entry, ".md"),
        description: "",
        tools: null,
        tags: [],
        model: "inherit",
        body: "",
        filePath,
        scope,
        broken: err.message,
      });
    }
  }
  return out;
}

export function scanAgents(projectRoot) {
  return [
    ...scanDir(globalDir(), "user"),
    ...scanDir(projectDirFor(projectRoot), "project"),
  ].sort((a, b) => a.name.localeCompare(b.name));
}

function dirForScope(scope, projectRoot) {
  if (scope === "user") return globalDir();
  if (!projectRoot) throw new Error("No project folder selected");
  return projectDirFor(projectRoot);
}

export function agentExists(scope, name, projectRoot) {
  return fs.existsSync(path.join(dirForScope(scope, projectRoot), `${name}.md`));
}

/**
 * `tools: null` and `model: "inherit"` are written by *omitting* those keys —
 * that is how Claude Code reads "all tools" and "inherit the parent model".
 * Keep this in sync with the agent-manager CLI so both write identical files.
 */
export function writeAgent(agent, projectRoot) {
  const dir = dirForScope(agent.scope, projectRoot);
  fs.mkdirSync(dir, { recursive: true });

  const data = { name: agent.name, description: agent.description };
  if (Array.isArray(agent.tools) && agent.tools.length) {
    data.tools = agent.tools.join(", ");
  }
  // `tags` is ours, not part of the Claude Code schema — unknown frontmatter
  // keys are ignored by the runtime, so this stays safe to write.
  if (Array.isArray(agent.tags) && agent.tags.length) {
    data.tags = agent.tags.join(", ");
  }
  if (agent.model && agent.model !== "inherit") data.model = agent.model;

  const filePath = path.join(dir, `${agent.name}.md`);
  fs.writeFileSync(
    filePath,
    matter.stringify(`\n${(agent.body || "").trim()}\n`, data),
    "utf8"
  );

  // A rename or scope move leaves the old file behind; clean it up.
  if (agent.originalPath && agent.originalPath !== filePath) {
    try {
      fs.unlinkSync(agent.originalPath);
    } catch {
      /* already gone */
    }
  }
  return filePath;
}

export function deleteAgent(filePath) {
  fs.unlinkSync(filePath);
}
