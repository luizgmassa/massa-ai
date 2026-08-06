/**
 * Workflow-command entry collection + templates (T1, WFC-01/04/05/13).
 *
 * Scans `skills/massa-ai/workflows/**\/*.md` and turns each workflow file
 * into a `WorkflowCommandEntry` — the stem (filename sans `.md`) plus a
 * fully-rendered per-surface command body. Consumed by
 * `scripts/generate-skill-artifacts.ts` (T2) to emit host-native command
 * artifacts on Claude, Codex, Cursor (shared template) and OpenCode (its own
 * minimal-frontmatter variant).
 *
 * Guards are fail-loud and emit nothing for the whole run on the first
 * violation (WFC-05): missing `description:`, a duplicate stem, a stem
 * colliding with a hand-authored quick-command name or a reserved bundle
 * root, or a stem outside the command-name charset. Subdirectory
 * organization under `workflows/` is never part of a command's identity —
 * only the file's basename is (spec: "Command name = workflow file stem").
 */

import { promises as fs } from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

/** Injectable so tests can point at a scratch fixture tree; production
 *  always scans the real workflow inventory. */
export const WORKFLOWS_DIR = path.join(ROOT, "skills", "massa-ai", "workflows");

/** Hand-authored quick-command names — a workflow stem may never collide
 *  with one of these (they are separate, stable, per-host files this
 *  generator must never create/modify/delete). Sensor-locked. */
export const QUICK_COMMAND_NAMES = ["def", "find", "graph", "index", "map", "status"] as const;

/** Reserved skill-bundle root names. A stem colliding with one of these
 *  would, on Cursor, land inside a directory-root-pruned managed path
 *  (`skills/<name>/...`) — two prune mechanisms aimed at one path (critic
 *  F3). Sensor-locked. */
export const RESERVED_BUNDLE_ROOTS = ["massa-ai", "persona-router", "profile", "agents"] as const;

/** Command-name charset (WFC-05 Edge Case): lowercase kebab-case, must not
 *  start with a hyphen. */
export const STEM_CHARSET = /^[a-z0-9][a-z0-9-]*$/;

/** Body ownership marker for generated command files that share a directory
 *  with hand-authored files (Claude `commands/`, Codex/Cursor `skills/`).
 *  Never present in a hand-authored file — that absence is what makes prune
 *  and `--check` marker-scoping safe with no allowlist to drift. */
export const WORKFLOW_COMMAND_MARKER = "<!-- massa-ai:generated workflow-command -->";

export interface WorkflowCommandEntry {
  /** Command name — the workflow file's basename without `.md`. */
  stem: string;
  /** Sourced from the workflow's frontmatter `description:` (WFC-04). */
  description: string;
  /** Rendered body shared byte-for-byte by Claude/Codex/Cursor. */
  sharedBody: string;
  /** Rendered body for OpenCode (minimal frontmatter — see module docblock
   *  in generate-skill-artifacts.ts for why: unknown-frontmatter forwarding
   *  risk on that host). */
  opencodeBody: string;
}

/** Recursively lists every `*.md` file under `dir`, absolute paths, sorted —
 *  deterministic scan order so duplicate-stem detection is order-independent
 *  in its error message only, never in which fixture triggers it. */
async function walkMarkdownFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return out;
    throw err;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkMarkdownFiles(abs)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(abs);
    }
  }
  return out.sort();
}

function unquoteScalar(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/** Extracts the single-line `description:` frontmatter value, or null if the
 *  file has no frontmatter block or no `description:` key. Minimal by
 *  design — workflow frontmatter never uses a folded/multi-line description. */
function extractDescription(raw: string): string | null {
  const block = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(raw);
  if (!block) return null;
  const yamlText = block[1] ?? "";
  for (const line of yamlText.split(/\r?\n/)) {
    const m = /^description:\s*(.*)$/.exec(line);
    if (m) return unquoteScalar((m[1] ?? "").trim());
  }
  return null;
}

/** Escapes a value for embedding inside a double-quoted YAML scalar
 *  (`description: "..."`). skill-architect.md's own description contains
 *  literal double quotes, so this is not a theoretical case. */
function escapeYamlDoubleQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function commandDescriptionField(stem: string, description: string): string {
  return escapeYamlDoubleQuoted(`${description} — explicit massa-ai '${stem}' workflow`);
}

/** Shared body text (identical across all templates) — explicit-route
 *  dispatch only, no shell-execution placeholders (Edge Cases). */
function commandBodyText(stem: string): string {
  return `Explicit massa-ai workflow invocation: \`${stem}\`.

Load the massa-ai router skill if not already loaded (dedupe guard), then
route to workflow \`${stem}\` under routing precedence 1 (explicit route) —
do not reclassify. Pass the following as the task description; if empty,
the workflow's own intake gathers it.

$ARGUMENTS
`;
}

function renderSharedBody(stem: string, description: string): string {
  return `---
description: "${commandDescriptionField(stem, description)}"
argument-hint: "[task description]"
---
${WORKFLOW_COMMAND_MARKER}

${commandBodyText(stem)}`;
}

function renderOpencodeBody(stem: string, description: string): string {
  return `---
description: "${commandDescriptionField(stem, description)}"
---
${WORKFLOW_COMMAND_MARKER}

${commandBodyText(stem)}`;
}

/**
 * Scans `workflowsDir` (default: the real `skills/massa-ai/workflows/`) and
 * returns one `WorkflowCommandEntry` per workflow file, or throws naming the
 * offending file/stem and emits nothing for the whole run (WFC-05).
 * `workflowsDir` is injectable so fixture-based guard tests never touch the
 * real inventory.
 */
export async function collectWorkflowCommandEntries(
  workflowsDir: string = WORKFLOWS_DIR,
): Promise<WorkflowCommandEntry[]> {
  const files = await walkMarkdownFiles(workflowsDir);
  const seenStems = new Map<string, string>();
  const entries: WorkflowCommandEntry[] = [];

  for (const file of files) {
    const stem = path.basename(file, ".md");

    if (!STEM_CHARSET.test(stem)) {
      throw new Error(
        `workflow-command generator: stem "${stem}" (from ${file}) fails the command-name charset ` +
          `${STEM_CHARSET.source} — rename the workflow file.`,
      );
    }

    if ((QUICK_COMMAND_NAMES as readonly string[]).includes(stem)) {
      throw new Error(
        `workflow-command generator: stem "${stem}" (from ${file}) collides with a hand-authored ` +
          `quick-command name (${QUICK_COMMAND_NAMES.join(", ")}) — rename the workflow file.`,
      );
    }

    if ((RESERVED_BUNDLE_ROOTS as readonly string[]).includes(stem)) {
      throw new Error(
        `workflow-command generator: stem "${stem}" (from ${file}) collides with a reserved skill-bundle ` +
          `root (${RESERVED_BUNDLE_ROOTS.join(", ")}) — rename the workflow file.`,
      );
    }

    const priorFile = seenStems.get(stem);
    if (priorFile) {
      throw new Error(
        `workflow-command generator: duplicate stem "${stem}" — ${priorFile} and ${file} both resolve ` +
          `to the same command name. Subdirectory organization never disambiguates a command name.`,
      );
    }
    seenStems.set(stem, file);

    const raw = await fs.readFile(file, "utf8");
    const description = extractDescription(raw);
    if (!description) {
      throw new Error(
        `workflow-command generator: ${file} is missing frontmatter description: — every workflow ` +
          `must carry one to source a command description from.`,
      );
    }

    entries.push({
      stem,
      description,
      sharedBody: renderSharedBody(stem, description),
      opencodeBody: renderOpencodeBody(stem, description),
    });
  }

  return entries;
}
