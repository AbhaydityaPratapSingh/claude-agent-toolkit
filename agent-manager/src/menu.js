import chalk from "chalk";
import { select, input } from "@inquirer/prompts";
import { scanAgents, SCOPES } from "./agents.js";
import { banner, say, clear } from "./ui.js";
import {
  listAgents,
  createAgent,
  editAgent,
  removeAgent,
  delegateTask,
} from "./actions.js";

const ACTIONS = [
  { name: "📋  Browse agents", value: "list" },
  { name: "✨  Create an agent", value: "create" },
  { name: "🛠   Modify an agent", value: "edit" },
  { name: "🚀  Delegate a task", value: "delegate" },
  { name: "🗑   Delete an agent", value: "delete" },
  { name: "📂  Show agent folders", value: "paths" },
];

async function pause() {
  await input({ message: chalk.dim("press enter to continue") });
}

function showPaths() {
  say.title("Where agents live");
  for (const scope of Object.values(SCOPES)) {
    console.log(`${scope.icon} ${chalk.bold(scope.label)}  ${chalk.dim(scope.hint)}`);
    console.log(`   ${chalk.cyan(scope.dir())}\n`);
  }
  say.dim("Drop a <name>.md file in either folder and it's live immediately.");
}

export async function run() {
  for (;;) {
    const agents = scanAgents();

    clear();
    console.log(banner(agents));

    const action = await select({
      message: "What do you want to do?",
      pageSize: 10,
      choices: [...ACTIONS, { name: chalk.dim("👋  Exit"), value: "exit" }],
    });

    if (action === "exit") {
      say.dim("\nbye 👋\n");
      return;
    }

    console.log();

    if (action === "list") await listAgents(agents);
    if (action === "create") await createAgent();
    if (action === "edit") await editAgent(agents);
    if (action === "delete") await removeAgent(agents);
    if (action === "delegate") await delegateTask(agents);
    if (action === "paths") showPaths();

    console.log();
    await pause();
  }
}
