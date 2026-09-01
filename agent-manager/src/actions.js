import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import {
  select,
  input,
  confirm,
  checkbox,
  editor,
} from "@inquirer/prompts";
import {
  SCOPES,
  KNOWN_TOOLS,
  MODELS,
  validateName,
  scanAgents,
  writeAgent,
  deleteAgent,
  agentExists,
  agentPath,
} from "./agents.js";
import { agentCard, agentChoiceLabel, say, scopeBadge } from "./ui.js";

const PERSONA_SCAFFOLD = `You are <identity — who this agent is and what experience it brings>.

## What you do
- <primary responsibility>

## What you never do
- <hard boundary>

## How you report
- <output format: bullets? file:line refs? fixes or findings only?>
`;

/** Shared agent picker. Returns null if the user backs out. */
async function pickAgent(agents, message) {
  if (!agents.length) {
    say.warn("No agents yet — create one first.");
    return null;
  }
  return select({
    message,
    pageSize: 12,
    choices: [
      ...agents.map((a) => ({ name: agentChoiceLabel(a), value: a })),
      { name: chalk.dim("← back"), value: null },
    ],
  });
}

// ── list ───────────────────────────────────────────────────────────────────

export async function listAgents(agents) {
  if (!agents.length) {
    say.warn("No subagents found in either scope.");
    say.dim(`  global:  ${SCOPES.user.dir()}`);
    say.dim(`  project: ${SCOPES.project.dir()}`);
    return;
  }
  say.title(`Your subagents (${agents.length})`);
  for (const agent of agents) {
    console.log(agentCard(agent));
    if (agent.broken) say.err(`  ${agent.filePath} failed to parse`);
  }
}

// ── create ─────────────────────────────────────────────────────────────────

export async function createAgent() {
  say.title("Create a subagent");

  const scope = await select({
    message: "Where should this agent live?",
    choices: Object.values(SCOPES).map((s) => ({
      name: `${s.icon} ${s.label} — ${chalk.dim(s.hint)}`,
      value: s.key,
    })),
  });

  const name = await input({
    message: "Agent name (kebab-case):",
    validate: (v) => {
      const err = validateName(v);
      if (err !== true) return err;
      if (agentExists(scope, v.trim())) return "An agent with that name already exists here";
      return true;
    },
  });

  say.dim("  Tip: phrase this as \"use when …\" — it's the routing signal.");
  const description = await input({
    message: "Description (when should it be used?):",
    validate: (v) => (v.trim() ? true : "A description is required for routing"),
  });

  const allTools = await confirm({
    message: "Grant all tools?",
    default: false,
  });

  let tools = null;
  if (!allTools) {
    tools = await checkbox({
      message: "Select tools (space to toggle):",
      pageSize: 12,
      choices: KNOWN_TOOLS.map((t) => ({ name: t, value: t })),
    });
  }

  const model = await select({
    message: "Model:",
    choices: MODELS.map((m) => ({
      name: m === "inherit" ? `${m} ${chalk.dim("(use parent session's model)")}` : m,
      value: m,
    })),
  });

  const start = await select({
    message: "Persona starting point:",
    choices: [
      { name: `scaffold ${chalk.dim("(section headings for you to fill in)")}`, value: "scaffold" },
      { name: `blank ${chalk.dim("(write from scratch)")}`, value: "blank" },
    ],
  });

  const body = await editor({
    message: "Write the persona (saves & closes your editor to continue):",
    default: start === "scaffold" ? PERSONA_SCAFFOLD : "",
    waitForUseInput: false,
  });

  if (!body.trim()) {
    say.err("Empty persona — aborted.");
    return;
  }

  const file = writeAgent({ scope, name: name.trim(), description, tools, model, body });
  say.ok(`Created ${chalk.bold(name.trim())} ${scopeBadge(scope)}`);
  say.dim(`  ${file}`);

  if (await confirm({ message: "Delegate a task to it right now?", default: false })) {
    await delegateTask(scanAgents(), name.trim());
  }
}

// ── edit ───────────────────────────────────────────────────────────────────

export async function editAgent(agents) {
  const agent = await pickAgent(agents, "Which agent do you want to modify?");
  if (!agent) return;

  let current = agent;

  for (;;) {
    console.log(agentCard(current));

    const field = await select({
      message: `Editing ${chalk.bold(current.name)} — what should change?`,
      choices: [
        { name: "description", value: "description" },
        { name: "tools", value: "tools" },
        { name: "model", value: "model" },
        { name: "persona", value: "persona" },
        { name: `open raw .md in $EDITOR`, value: "raw" },
        { name: `move scope ${chalk.dim("(global ⇄ project)")}`, value: "scope" },
        { name: chalk.dim("← done"), value: null },
      ],
    });

    if (!field) return;

    if (field === "raw") {
      const edited = await editor({
        message: "Edit the raw file:",
        default: fs.readFileSync(current.filePath, "utf8"),
        postfix: ".md",
        waitForUseInput: false,
      });
      fs.writeFileSync(current.filePath, edited, "utf8");
      say.ok("Saved raw file.");
      current = scanAgents().find((a) => a.filePath === current.filePath) ?? current;
      continue;
    }

    const next = {
      scope: current.scope,
      name: current.name,
      description: current.description,
      tools: current.tools,
      model: current.model ?? "inherit",
      body: current.body,
    };

    if (field === "description") {
      next.description = await input({
        message: "New description:",
        default: current.description,
        validate: (v) => (v.trim() ? true : "Required"),
      });
    }

    if (field === "tools") {
      const allTools = await confirm({
        message: "Grant all tools?",
        default: !current.tools,
      });
      next.tools = allTools
        ? null
        : await checkbox({
            message: "Select tools:",
            pageSize: 12,
            choices: KNOWN_TOOLS.map((t) => ({
              name: t,
              value: t,
              checked: current.tools?.includes(t) ?? false,
            })),
          });
    }

    if (field === "model") {
      next.model = await select({
        message: "Model:",
        choices: MODELS.map((m) => ({ name: m, value: m })),
        default: current.model ?? "inherit",
      });
    }

    if (field === "persona") {
      next.body = await editor({
        message: "Edit persona:",
        default: current.body,
        postfix: ".md",
        waitForUseInput: false,
      });
    }

    if (field === "scope") {
      const target = current.scope === "user" ? "project" : "user";
      if (agentExists(target, current.name)) {
        say.err(`An agent named ${current.name} already exists in ${target} scope.`);
        continue;
      }
      next.scope = target;
    }

    const movedFrom = next.scope !== current.scope ? current.filePath : null;
    writeAgent(next);
    if (movedFrom) fs.unlinkSync(movedFrom);

    say.ok(`Updated ${chalk.bold(next.name)}.`);
    current =
      scanAgents().find((a) => a.name === next.name && a.scope === next.scope) ?? current;
  }
}

// ── delete ─────────────────────────────────────────────────────────────────

export async function removeAgent(agents) {
  const agent = await pickAgent(agents, "Which agent should be deleted?");
  if (!agent) return;

  console.log(agentCard(agent));
  const sure = await confirm({
    message: `Permanently delete ${chalk.bold.red(agent.name)}?`,
    default: false,
  });
  if (!sure) return say.info("Kept.");

  deleteAgent(agent);
  say.ok(`Deleted ${agent.name}.`);
  say.dim(`  removed ${agent.filePath}`);
}

// ── delegate ───────────────────────────────────────────────────────────────

export async function delegateTask(agents, presetName) {
  const agent = presetName
    ? agents.find((a) => a.name === presetName)
    : await pickAgent(agents, "Which agent should run the task?");
  if (!agent) return;

  const task = await input({
    message: `Task for ${chalk.bold(agent.name)}:`,
    validate: (v) => (v.trim() ? true : "Describe the task"),
  });

  const cwd = await input({
    message: "Run in which directory?",
    default: process.cwd(),
    validate: (v) =>
      fs.existsSync(v.trim()) ? true : "That directory doesn't exist",
  });

  const mode = await select({
    message: "Permission mode:",
    choices: [
      { name: `default ${chalk.dim("(prompts before acting)")}`, value: "default" },
      { name: `plan ${chalk.dim("(read-only, produces a plan)")}`, value: "plan" },
      { name: `acceptEdits ${chalk.dim("(auto-accepts file edits)")}`, value: "acceptEdits" },
      {
        name: `bypassPermissions ${chalk.red("(no prompts at all — careful)")}`,
        value: "bypassPermissions",
      },
    ],
  });

  if (mode === "bypassPermissions") {
    const sure = await confirm({
      message: chalk.red("bypassPermissions lets the agent act with no confirmation. Continue?"),
      default: false,
    });
    if (!sure) return say.info("Cancelled.");
  }

  // No --model here: --agent already applies the model from the agent's
  // frontmatter, and passing both would override the agent's own choice.
  const args = ["--agent", agent.name, "--permission-mode", mode, "-p"];

  console.log(
    `\n${chalk.dim("▸")} ${chalk.bold(agent.name)} ${chalk.dim("in")} ${cwd.trim()} ${chalk.dim(`[${mode}]`)}\n`
  );

  const code = await runClaude(args, task, cwd.trim());
  console.log();
  if (code === 0) say.ok(`${agent.name} finished.`);
  else say.err(`${agent.name} exited with code ${code}.`);
}

/**
 * The prompt goes in via stdin rather than argv — on Windows `claude` is a .cmd
 * shim that needs shell:true, and shell:true does not quote args, so any prompt
 * containing spaces or cmd metacharacters would break.
 */
function runClaude(args, prompt, cwd) {
  return new Promise((resolve) => {
    const child = spawn("claude", args, {
      cwd,
      shell: true,
      stdio: ["pipe", "inherit", "inherit"],
    });
    child.on("error", (err) => {
      say.err(`Could not launch claude: ${err.message}`);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 0));
    child.stdin.write(prompt);
    child.stdin.end();
  });
}
