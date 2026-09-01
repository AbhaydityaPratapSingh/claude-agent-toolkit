#!/usr/bin/env node
import chalk from "chalk";
import { run } from "../src/menu.js";

// The editor prompts fall back to this when the user has no EDITOR configured,
// which is the common case on Windows.
if (!process.env.EDITOR && !process.env.VISUAL) {
  process.env.EDITOR = process.platform === "win32" ? "notepad" : "nano";
}

try {
  await run();
} catch (err) {
  // Ctrl+C / Esc out of a prompt is a normal exit, not a crash.
  if (err?.name === "ExitPromptError") {
    console.log(chalk.dim("\nbye 👋\n"));
    process.exit(0);
  }
  console.error(chalk.red(`\n✖ ${err?.message ?? err}\n`));
  process.exit(1);
}
