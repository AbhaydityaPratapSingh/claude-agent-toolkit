import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Optional git versioning for an agents folder. This is deliberately thin: git
 * already does diff/revert well, so the app only needs to init a repo, commit
 * after each change, and read history back.
 *
 * Everything here is best-effort — a failure to commit must never stop an agent
 * from being saved.
 */

function git(dir, args) {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", dir, ...args],
      { windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: stdout?.toString() ?? "",
          stderr: stderr?.toString() ?? "",
        });
      }
    );
  });
}

export async function gitAvailable() {
  const res = await new Promise((resolve) =>
    execFile("git", ["--version"], { windowsHide: true }, (err, stdout) =>
      resolve({ ok: !err, stdout: stdout?.toString() ?? "" })
    )
  );
  return res.ok ? res.stdout.trim() : null;
}

export function isRepo(dir) {
  return Boolean(dir) && fs.existsSync(path.join(dir, ".git"));
}

export async function initRepo(dir) {
  if (!dir) throw new Error("No agents folder for that scope");
  fs.mkdirSync(dir, { recursive: true });
  if (isRepo(dir)) return { alreadyInitialised: true };

  const init = await git(dir, ["init"]);
  if (!init.ok) throw new Error(init.stderr.trim() || "git init failed");

  // Agent folders can pick up editor cruft; keep the history to .md files.
  const ignore = path.join(dir, ".gitignore");
  if (!fs.existsSync(ignore)) {
    fs.writeFileSync(ignore, "*\n!*.md\n!.gitignore\n", "utf8");
  }

  await git(dir, ["add", "-A"]);
  await git(dir, [
    "-c",
    "user.name=Agent Studio",
    "-c",
    "user.email=agent-studio@localhost",
    "commit",
    "-m",
    "Track agents with Agent Studio",
  ]);
  return { alreadyInitialised: false };
}

/**
 * Commit whatever changed. Called after save and delete; silently does nothing
 * when the folder is not a repo, so versioning stays opt-in.
 */
export async function commitChange(dir, message) {
  if (!isRepo(dir)) return false;
  await git(dir, ["add", "-A"]);
  const status = await git(dir, ["status", "--porcelain"]);
  if (status.ok && !status.stdout.trim()) return false; // nothing staged
  const res = await git(dir, [
    "-c",
    "user.name=Agent Studio",
    "-c",
    "user.email=agent-studio@localhost",
    "commit",
    "-m",
    message,
  ]);
  return res.ok;
}

const SEP = "";

/** Commits touching one agent file, newest first. */
export async function fileHistory(dir, fileName) {
  if (!isRepo(dir)) return [];
  const res = await git(dir, [
    "log",
    `--format=%H${SEP}%at${SEP}%s`,
    "--follow",
    "--",
    fileName,
  ]);
  if (!res.ok) return [];
  return res.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, at, subject] = line.split(SEP);
      return { hash, at: Number(at) * 1000, subject };
    });
}

export async function fileDiff(dir, fileName, hash) {
  if (!isRepo(dir)) return "";
  const res = await git(dir, ["show", `${hash}`, "--", fileName]);
  return res.ok ? res.stdout : res.stderr;
}

export async function fileAt(dir, fileName, hash) {
  if (!isRepo(dir)) return null;
  const res = await git(dir, ["show", `${hash}:${fileName}`]);
  return res.ok ? res.stdout : null;
}

/** Restore one file to an older commit, then commit the restoration. */
export async function revertFile(dir, fileName, hash) {
  const content = await fileAt(dir, fileName, hash);
  if (content == null) throw new Error("That version no longer exists");
  fs.writeFileSync(path.join(dir, fileName), content, "utf8");
  await commitChange(dir, `Revert ${fileName} to ${hash.slice(0, 7)}`);
  return true;
}
