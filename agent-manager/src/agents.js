import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import matter from "gray-matter";
import { validateName as checkName } from "agent-core";

export { KNOWN_TOOLS, MODELS, lintAgent } from "agent-core";

export const SCOPES = {
  user: {
    key: "user",
    label: "global",
    icon: "🌍",
    hint: "available in every project",
    dir: () => path.join(os.homedir(), ".claude", "agents"),
  },
  project: {
    key: "project",
    label: "project",
    icon: "📁",
    hint: "only in this repo",
    dir: () => path.join(process.cwd(), ".claude", "agents"),
  },
};

/** Inquirer wants `true` for a valid answer, where agent-core returns null. */
export function validateName(name) {
  return checkName(name) ?? true;
}

function readAgentFile(filePath, scopeKey) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = matter(raw);
  const fm = parsed.data ?? {};

  let tools = fm.tools;
  if (typeof tools === "string") {
    tools = tools
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  return {
    name: fm.name || path.basename(filePath, ".md"),
    description: fm.description || "",
    tools: Array.isArray(tools) ? tools : null,
    model: fm.model || null,
    body: parsed.content.trim(),
    frontmatter: fm,
    filePath,
    scope: scopeKey,
  };
}

/** Scan both scopes. Missing directories are simply empty, not an error. */
export function scanAgents() {
  const found = [];
  for (const scope of Object.values(SCOPES)) {
    const dir = scope.dir();
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith(".md")) continue;
      const filePath = path.join(dir, entry);
      try {
        found.push(readAgentFile(filePath, scope.key));
      } catch {
        found.push({
          name: path.basename(entry, ".md"),
          description: "",
          tools: null,
          model: null,
          body: "",
          frontmatter: {},
          filePath,
          scope: scope.key,
          broken: true,
        });
      }
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

export function agentPath(scopeKey, name) {
  return path.join(SCOPES[scopeKey].dir(), `${name}.md`);
}

export function agentExists(scopeKey, name) {
  return fs.existsSync(agentPath(scopeKey, name));
}

/**
 * Write an agent file. `tools` of null and `model` of "inherit" are omitted
 * from the frontmatter entirely — that's how Claude Code reads "all tools" and
 * "inherit the parent model".
 */
export function writeAgent({ scope, name, description, tools, model, body }) {
  const dir = SCOPES[scope].dir();
  fs.mkdirSync(dir, { recursive: true });

  const data = { name, description };
  if (Array.isArray(tools) && tools.length) data.tools = tools.join(", ");
  if (model && model !== "inherit") data.model = model;

  const file = agentPath(scope, name);
  fs.writeFileSync(file, matter.stringify(`\n${body.trim()}\n`, data), "utf8");
  return file;
}

export function deleteAgent(agent) {
  fs.unlinkSync(agent.filePath);
}
