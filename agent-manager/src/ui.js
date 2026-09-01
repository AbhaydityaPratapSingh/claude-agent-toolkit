import chalk from "chalk";
import boxen from "boxen";
import { SCOPES } from "./agents.js";

const ART = [
  "  ▄▀█ █▀▀ █▀▀ █▄░█ ▀█▀   █▀▄▀█ █▀▀ █▀█",
  "  █▀█ █▄█ ██▄ █░▀█ ░█░   █░▀░█ █▄█ █▀▄",
];

const GRADIENT = [chalk.cyan, chalk.magenta];

export function banner(agents) {
  const art = ART.map((line, i) => GRADIENT[i](line)).join("\n");
  const global = agents.filter((a) => a.scope === "user").length;
  const project = agents.filter((a) => a.scope === "project").length;

  const stats = [
    `${SCOPES.user.icon} ${chalk.bold(global)} global`,
    `${SCOPES.project.icon} ${chalk.bold(project)} project`,
  ].join(chalk.dim("  ·  "));

  return boxen(`${art}\n\n  ${chalk.dim("your subagent command center")}\n  ${stats}`, {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderStyle: "round",
    borderColor: "cyan",
  });
}

export function scopeBadge(scopeKey) {
  const scope = SCOPES[scopeKey];
  const color = scopeKey === "user" ? chalk.bgCyan.black : chalk.bgMagenta.black;
  return color(` ${scope.icon} ${scope.label} `);
}

export function modelBadge(model) {
  if (!model) return chalk.dim("model:inherit");
  return chalk.yellow(`model:${model}`);
}

export function toolsBadge(tools) {
  if (!tools || !tools.length) return chalk.green("tools: all");
  return chalk.blue(`tools: ${tools.join(", ")}`);
}

/** A single agent rendered as a boxed card. */
export function agentCard(agent) {
  const header = `${chalk.bold.white(agent.name)}  ${scopeBadge(agent.scope)}`;
  const meta = `${modelBadge(agent.model)}   ${toolsBadge(agent.tools)}`;
  const desc = agent.description
    ? chalk.dim(wrap(agent.description, 66))
    : chalk.red.dim("(no description — this agent may never be auto-selected)");

  const preview = agent.body
    ? chalk.dim.italic(truncate(firstLines(agent.body, 2), 60))
    : chalk.red.dim("(empty persona)");

  return boxen(`${header}\n${meta}\n\n${desc}\n\n${chalk.dim("persona ▸")} ${preview}`, {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderStyle: "round",
    borderColor: agent.broken ? "red" : agent.scope === "user" ? "cyan" : "magenta",
    width: 76,
  });
}

/** Compact one-liner used in select menus. */
export function agentChoiceLabel(agent) {
  const scope = SCOPES[agent.scope];
  const desc = agent.description
    ? chalk.dim(` — ${truncate(agent.description, 44)}`)
    : chalk.red.dim(" — no description");
  return `${scope.icon} ${chalk.bold(agent.name)}${desc}`;
}

function firstLines(text, n) {
  return text.split("\n").slice(0, n).join(" ").trim();
}

function truncate(text, max) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function wrap(text, width) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + word).length > width) {
      lines.push(line.trim());
      line = "";
    }
    line += `${word} `;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join("\n");
}

export const say = {
  ok: (m) => console.log(chalk.green(`✔ ${m}`)),
  err: (m) => console.log(chalk.red(`✖ ${m}`)),
  info: (m) => console.log(chalk.cyan(`ℹ ${m}`)),
  warn: (m) => console.log(chalk.yellow(`▲ ${m}`)),
  dim: (m) => console.log(chalk.dim(m)),
  title: (m) => console.log(`\n${chalk.bold.underline(m)}\n`),
};

export function clear() {
  console.clear();
}
