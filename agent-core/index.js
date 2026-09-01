/**
 * Shared between agent-studio (Electron) and agent-manager (CLI) so both write
 * identical frontmatter and agree on what a well-formed agent looks like.
 */

export const KNOWN_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "Bash",
  "WebFetch",
  "WebSearch",
  "NotebookEdit",
  "Agent",
  "Skill",
];

export const MODELS = ["inherit", "opus", "sonnet", "haiku", "fable"];

export const PERMISSION_MODES = [
  { id: "default", note: "Prompts before acting", danger: false },
  { id: "plan", note: "Read-only, produces a plan", danger: false },
  { id: "acceptEdits", note: "Auto-accepts file edits", danger: false },
  {
    id: "bypassPermissions",
    note: "Runs every tool call — including Bash and file writes — with no prompt and no chance to intervene.",
    danger: true,
  },
];

/** Names double as the subagent_type, so they must be kebab-case. */
export function validateName(name) {
  if (!name || !name.trim()) return "Name is required";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name.trim())) {
    return "Use lowercase kebab-case only (e.g. api-guardian)";
  }
  return null;
}

/**
 * Non-blocking quality checks. These are warnings, never errors: an agent that
 * trips every one of them still works, it just tends to get passed over by the
 * router in favour of a general-purpose agent.
 */
export function lintAgent(agent) {
  const warnings = [];
  const description = (agent.description ?? "").trim();
  const body = (agent.body ?? "").trim();

  if (description && description.length < 25) {
    warnings.push(
      "Description is very short. The router matches on this text — a few more words about *when* to pick this agent measurably improves selection."
    );
  }

  if (description && !/\buse\s+(this\s+)?when\b/i.test(description)) {
    warnings.push(
      'Description does not say when to use the agent. Phrasing it as "Use when …" is what turns it into a routing signal rather than a label.'
    );
  }

  if (!body) {
    warnings.push(
      "Persona is empty, so the agent runs with no system prompt and behaves like a generic assistant."
    );
  } else if (/<[^<>\n]{3,}>/.test(body)) {
    warnings.push(
      "Persona still contains <angle-bracket placeholders> from the scaffold. Those get sent to the model verbatim."
    );
  }

  if (Array.isArray(agent.tools) && agent.tools.length === 0) {
    warnings.push(
      "Tools are restricted to an empty list, which leaves the agent unable to do anything. Pick at least one tool, or switch back to all tools."
    );
  }

  return warnings;
}
