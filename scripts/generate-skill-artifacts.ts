#!/usr/bin/env bun
/**
 * massa-ai skill-bundle generator (PDO-06, PDO-07).
 *
 * Modeled on scripts/generate-subagent-artifacts.ts: same CLI shape
 * (no args = emit, `--check` = drift gate), same exit-code contract (0 clean,
 * 1 drift/error). Where it differs: this generator does not re-serialize
 * anything. It copies BYTES from skills/ into each host plugin's skills/ tree,
 * because skills.yml validates SKILL.md frontmatter and the source and all
 * four copies must validate identically (PDO-06 AC7).
 *
 * Source -> destination (design.md D2):
 *
 *   skills/massa-ai/**            -> apps/<host>-plugin/skills/massa-ai/**
 *   skills/persona-router/**      -> apps/<host>-plugin/skills/persona-router/**
 *   skills/profile/**             -> apps/<host>-plugin/skills/profile/**
 *     (model-profile-switching T15 — a whole-directory bundle, same as massa-ai/
 *     and persona-router/, not an agents/<n>/SKILL.md charter)
 *   skills/agents/<n>/SKILL.md    -> apps/<host>-plugin/skills/agents/<n>/SKILL.md
 *   scripts/lib/opencode-config.cjs -> apps/opencode-plugin/lib/opencode-config.cjs
 *   apps/claude-plugin/hooks/massa-ai-hook.ts -> apps/{codex,cursor}-plugin/hooks/massa-ai-hook
 *     (real, executable file — `npm pack` silently drops symlinks, verified
 *     empirically this session: both apps/{codex,cursor}-plugin/hooks/massa-ai-hook
 *     were symlinks to this file, and neither the link nor its target directory
 *     made it into the published tarball)
 *
 * `skills/agents/<name>/SKILL.md` bundles the raw charter (A3) — a second copy of
 * each charter beside the per-host generated agent file
 * (apps/<host>-plugin/agents/massa-ai-<n>.{md,toml}), which is intentional:
 * self-containment over de-duplication.
 *
 * `--check` compares FULL DIRECTORY INVENTORIES of every managed subtree, not
 * just the paths this generator happens to know about today. A source file
 * deleted from skills/ without regenerating leaves a stale bundle entry behind
 * — that is drift a "diff known paths" check would miss, and a directory walk
 * of both sides does not.
 *
 *   bun run scripts/generate-skill-artifacts.ts          # emit real files
 *   bun run scripts/generate-skill-artifacts.ts --check  # drift gate
 */

import { promises as fs } from "fs";
import path from "path";
import { tmpdir } from "os";
import { HOSTS, capabilitiesFor, type Host, type HostCapabilities } from "./lib/host-capabilities.ts";
import {
  collectWorkflowCommandEntries,
  WORKFLOW_COMMAND_MARKER,
  type WorkflowCommandEntry,
} from "./lib/workflow-commands.ts";

export { HOSTS, type Host };
export { collectWorkflowCommandEntries, WORKFLOW_COMMAND_MARKER };

// ── Paths ───────────────────────────────────────────────────────────────────
const ROOT = path.resolve(import.meta.dirname, "..");
const SKILLS_DIR = path.join(ROOT, "skills");
const APPS_DIR = path.join(ROOT, "apps");
const OPENCODE_CONFIG_LIB_SOURCE = path.join(ROOT, "scripts", "lib", "opencode-config.cjs");
const HOOK_BINARY_SOURCE = path.join(APPS_DIR, "claude-plugin", "hooks", "massa-ai-hook.ts");
const HOOK_BINARY_MODE = 0o755; // invoked directly (no "bun run" prefix), so it must be executable.

/** A capability lookup, injectable so a fixture-host test (T12) can drive
 *  hookBinaryHosts()/managedRootsFor() for a host that never ships. Production
 *  always defaults to the real capabilitiesFor(). */
export type CapsLookup = (host: string) => HostCapabilities | undefined;
const REAL_CAPS_LOOKUP: CapsLookup = (host) => capabilitiesFor(host as Host);

/**
 * Hosts whose hooks/massa-ai-hook was a symlink to HOOK_BINARY_SOURCE and is
 * now a generated real file (T14/PDO-14). claude-plugin IS the source
 * (hookBinaryDelivery: "source"), and opencode-plugin has no shared hook
 * binary (hookBinaryDelivery: "none" — its plugin entry is src/index.ts).
 * Exported as a pure function of (hosts, capsLookup) so XP-06 AC-2's
 * fixture-host test can prove the capability table — not a hardcoded list —
 * is what drives which hosts get a hook-binary copy.
 */
export function hookBinaryHosts(
  hosts: readonly string[] = HOSTS,
  capsLookup: CapsLookup = REAL_CAPS_LOOKUP,
): string[] {
  return hosts.filter((h) => capsLookup(h)?.hookBinaryDelivery === "real-copy");
}

const HOOK_BINARY_HOSTS: readonly Host[] = hookBinaryHosts() as Host[];

export function pluginRoot(host: Host): string {
  return path.join(APPS_DIR, `${host}-plugin`);
}

// A source file this large is almost certainly not a skill asset this
// generator should be copying byte-for-byte; fail loudly rather than emit a
// silently-truncated or partial bundle (Edge Cases: "too large or binary").
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

// ── Managed-file discovery ───────────────────────────────────────────────────
export interface ManagedEntry {
  /** Path relative to the managed root it belongs to (POSIX separators). */
  relPath: string;
  /** Absolute path to the canonical source file. */
  sourceAbsPath: string;
}

/** Recursively list every file under `dir`, relative to `dir` (POSIX separators). */
async function walkFiles(dir: string): Promise<string[]> {
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
      // Python bytecode caches are ephemeral interpreter output, never bundle
      // content — a stray one must not read as source drift in --check.
      if (entry.name === "__pycache__") continue;
      const nested = await walkFiles(abs);
      for (const rel of nested) out.push(path.posix.join(entry.name, rel));
    } else if (entry.isFile()) {
      out.push(entry.name);
    }
  }
  return out;
}

/**
 * Every file this generator owns under `apps/<host>-plugin/skills/`, for all
 * four hosts: skills/massa-ai/**, skills/persona-router/**, and one SKILL.md
 * per skills/agents/<name>/ directory. `relPath` is relative to the plugin's
 * `skills/` directory.
 */
export async function collectSkillEntries(): Promise<ManagedEntry[]> {
  const entries: ManagedEntry[] = [];

  for (const bundleName of ["massa-ai", "persona-router", "profile"] as const) {
    const sourceDir = path.join(SKILLS_DIR, bundleName);
    const files = await walkFiles(sourceDir);
    for (const rel of files) {
      entries.push({
        relPath: path.posix.join(bundleName, rel),
        sourceAbsPath: path.join(sourceDir, ...rel.split("/")),
      });
    }
  }

  const agentsDir = path.join(SKILLS_DIR, "agents");
  let agentDirNames: string[] = [];
  try {
    agentDirNames = (await fs.readdir(agentsDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  for (const name of agentDirNames) {
    const source = path.join(agentsDir, name, "SKILL.md");
    try {
      await fs.access(source);
    } catch {
      continue; // agent dir with no charter is not this generator's problem
    }
    entries.push({
      relPath: path.posix.join("agents", name, "SKILL.md"),
      sourceAbsPath: source,
    });
  }

  return entries;
}

/**
 * OpenCode-only: the vendored `lib/opencode-config.cjs` copy (D1), relative to
 * the plugin's `lib/` directory. A single-entry list kept in the same shape as
 * `collectSkillEntries` so both flow through the same copy/diff machinery.
 */
export async function collectOpencodeLibEntries(): Promise<ManagedEntry[]> {
  await fs.access(OPENCODE_CONFIG_LIB_SOURCE);
  return [{ relPath: "opencode-config.cjs", sourceAbsPath: OPENCODE_CONFIG_LIB_SOURCE }];
}

/**
 * codex/cursor-only: the real-file replacement for the old
 * `hooks/massa-ai-hook -> ../../claude-plugin/hooks/massa-ai-hook.ts` symlink
 * (T14/PDO-14/D2). Single-entry list, same shape as the others.
 */
export async function collectHookBinaryEntries(): Promise<ManagedEntry[]> {
  await fs.access(HOOK_BINARY_SOURCE);
  return [{ relPath: "massa-ai-hook", sourceAbsPath: HOOK_BINARY_SOURCE }];
}

async function assertCopyable(entry: ManagedEntry): Promise<void> {
  const stat = await fs.stat(entry.sourceAbsPath);
  if (stat.size > MAX_SOURCE_BYTES) {
    throw new Error(
      `${entry.sourceAbsPath} is ${stat.size} bytes, over the ${MAX_SOURCE_BYTES}-byte generator ` +
        `limit — refusing to emit a partial bundle. If this file legitimately belongs in the ` +
        `skill bundle, raise MAX_SOURCE_BYTES deliberately.`,
    );
  }
}

// ── Managed roots (used by both emit and --check) ───────────────────────────
// Every subtree this generator owns, relative to a plugin root. `--check`
// walks each of these on both sides (freshly generated vs checked-in) so an
// unmanaged extra file inside one of them is caught, not just a changed one.
//
// The opencode-only "lib" root now comes from capabilitiesFor(host).
// extraManagedRoots rather than a hardcoded `host === "opencode"` branch.
// `capsLookup` is injectable so XP-06 AC-2's fixture-host test can prove an
// arbitrary capability combination drives this list (production always uses
// the real capabilitiesFor()).
export function managedRootsFor(host: string, capsLookup: CapsLookup = REAL_CAPS_LOOKUP): string[] {
  const common = [
    path.join("skills", "massa-ai"),
    path.join("skills", "persona-router"),
    path.join("skills", "profile"),
    path.join("skills", "agents"),
  ];
  const extra = capsLookup(host)?.extraManagedRoots ?? [];
  return [...common, ...extra];
}

// ── Emit ─────────────────────────────────────────────────────────────────────
async function copyEntries(
  entries: ManagedEntry[],
  destRoot: string,
): Promise<void> {
  for (const entry of entries) {
    await assertCopyable(entry);
    const dest = path.join(destRoot, ...entry.relPath.split("/"));
    await fs.mkdir(path.dirname(dest), { recursive: true });
    // Copy bytes, never re-serialize — SKILL.md frontmatter must validate
    // identically in the source and every bundle copy (PDO-06 AC7).
    await fs.copyFile(entry.sourceAbsPath, dest);
  }
}

/**
 * Removes a host's prior managed-root contents (and its hook-binary file, if
 * it is a hookBinaryHosts() member) before emit copies anything back in.
 *
 * Why: git no longer tracks deletions once these bundles are gitignored
 * (UGB-04) — a source file removed from `skills/` must not leave a stale
 * copy behind in every plugin forever. Removal targets come only from
 * `managedRootsFor()` (the same table `--check` walks) and
 * `hookBinaryHosts()`; there is no second literal list to drift, so a
 * hand-authored file living beside a managed root (a codex/cursor quick
 * skill under `skills/`, `hooks.json` beside `hooks/massa-ai-hook`) is never
 * a prune candidate — it is not enumerated by either table.
 * Impacts: UGB-03/04, T1.
 * Test: bun test scripts/__tests__/generate-skill-artifacts-prune.test.ts
 */
async function pruneManagedRoots(
  targetRoot: string,
  host: string,
  hookBinaryEntries: ManagedEntry[],
  capsLookup: CapsLookup,
): Promise<void> {
  for (const managedRel of managedRootsFor(host, capsLookup)) {
    await fs.rm(path.join(targetRoot, managedRel), { recursive: true, force: true });
  }
  // Pruned unconditionally on host, not gated on current hookBinaryHosts()
  // membership — a host whose capability entry just flipped away from
  // "real-copy" must still lose the file it emitted while it held that
  // capability, or that flip could never observably prune anything.
  for (const entry of hookBinaryEntries) {
    await fs.rm(path.join(targetRoot, "hooks", ...entry.relPath.split("/")), { force: true });
  }
}

// ── Workflow commands (T2, WFC-01..06) ──────────────────────────────────────
//
// Claude/Codex/Cursor emit generated commands into a directory that ALSO
// holds hand-authored quick-command files (commands/ or skills/), so their
// ownership boundary is the body marker, not directory-root membership —
// managedRootsFor()/pruneManagedRoots() must never own these paths (a
// reserved-root collision on the stem itself is already ruled out by T1's
// collectWorkflowCommandEntries() guard). OpenCode's command/ directory has
// no hand-authored siblings at all, so it rides the ordinary
// extraManagedRoots directory-root mechanism instead (see host-capabilities.ts).
type MarkerScopedShape = "flat-md" | "subdir-skill-md";

const SHARED_WORKFLOW_HOST_DIRS: Partial<Record<Host, { rel: string; shape: MarkerScopedShape }>> = {
  claude: { rel: "commands", shape: "flat-md" },
  codex: { rel: "skills", shape: "flat-md" },
  cursor: { rel: "skills", shape: "subdir-skill-md" },
};

/** Marker-scoped prune candidates directly inside `dirAbs` — one level only,
 *  never recursive, so a managed subdirectory sibling (skills/massa-ai/) is
 *  structurally out of reach regardless of its own content. */
async function markerScopedCandidates(
  dirAbs: string,
  shape: MarkerScopedShape,
): Promise<{ relPath: string; absPath: string }[]> {
  let entries;
  try {
    entries = await fs.readdir(dirAbs, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const candidates: { relPath: string; absPath: string }[] = [];
  if (shape === "flat-md") {
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        candidates.push({ relPath: entry.name, absPath: path.join(dirAbs, entry.name) });
      }
    }
  } else {
    for (const entry of entries) {
      if (entry.isDirectory()) {
        candidates.push({
          relPath: path.posix.join(entry.name, "SKILL.md"),
          absPath: path.join(dirAbs, entry.name, "SKILL.md"),
        });
      }
    }
  }
  return candidates;
}

/**
 * Deletes every candidate under `dirAbs` whose content carries
 * WORKFLOW_COMMAND_MARKER — a stale artifact of a since-deleted workflow.
 * Hand-authored files (def.md, skills/def/SKILL.md, ...) never carry the
 * marker and are structurally unprunable by this function.
 * Test: bun test scripts/__tests__/workflow-command-emit.test.ts
 */
async function pruneMarkerScopedWorkflowCommands(dirAbs: string, shape: MarkerScopedShape): Promise<void> {
  const candidates = await markerScopedCandidates(dirAbs, shape);
  for (const candidate of candidates) {
    let content: string;
    try {
      content = await fs.readFile(candidate.absPath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    if (!content.includes(WORKFLOW_COMMAND_MARKER)) continue;
    await fs.rm(candidate.absPath, { force: true });
    if (shape === "subdir-skill-md") {
      // skills/<stem>/ becomes empty once its only file (SKILL.md) is gone —
      // remove the now-empty stem directory too.
      const stemDir = path.dirname(candidate.absPath);
      const remaining = await fs.readdir(stemDir).catch(() => ["non-empty-sentinel"]);
      if (remaining.length === 0) await fs.rmdir(stemDir).catch(() => undefined);
    }
  }
}

/** Writes one generated command file per workflow entry for a shared-dir
 *  host (claude/codex/cursor); returns the count emitted. Marker-scoped
 *  prune runs first so a deleted workflow's stale artifact never survives. */
async function emitSharedWorkflowCommands(
  host: Host,
  targetRoot: string,
  entries: readonly WorkflowCommandEntry[],
): Promise<number> {
  const target = SHARED_WORKFLOW_HOST_DIRS[host];
  if (!target) return 0;
  const dirAbs = path.join(targetRoot, target.rel);
  await pruneMarkerScopedWorkflowCommands(dirAbs, target.shape);

  for (const entry of entries) {
    const destPath =
      target.shape === "subdir-skill-md"
        ? path.join(dirAbs, entry.stem, "SKILL.md")
        : path.join(dirAbs, `${entry.stem}.md`);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, entry.sharedBody);
  }
  return entries.length;
}

/** Writes OpenCode's `command/massa-ai-<stem>.md` variant. The directory
 *  itself was already wholesale-pruned by pruneManagedRoots() above (via
 *  extraManagedRoots) — no marker scoping needed on this host. */
async function emitOpencodeWorkflowCommands(
  targetRoot: string,
  entries: readonly WorkflowCommandEntry[],
): Promise<number> {
  const dirAbs = path.join(targetRoot, "command");
  for (const entry of entries) {
    const destPath = path.join(dirAbs, `massa-ai-${entry.stem}.md`);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, entry.opencodeBody);
  }
  return entries.length;
}

/**
 * `hosts` (default `HOSTS`) and `capsLookup` (default the real
 * capabilitiesFor()) are the seam XP-06 AC-2's fixture-host test drives:
 * injecting an extra host + a fixture capability record proves the "lib"
 * root and the hook-binary copy are both decided from the table, not from a
 * literal host-name comparison. Only 2 production call sites (main, runCheck
 * below), both in this file — no external call-site contract to preserve.
 *
 * `onHostEmitted`, if supplied, is invoked once per host with that host's own
 * emitted-file count (T2, print-population-per-host) — kept as a callback
 * rather than widening the return type so every existing call site (tests
 * included) that reads emitAll()'s resolved value as a bare total keeps working.
 */
export async function emitAll(
  targetRoots: Record<string, string>,
  hosts: readonly string[] = HOSTS,
  capsLookup: CapsLookup = REAL_CAPS_LOOKUP,
  onHostEmitted?: (host: string, count: number) => void,
): Promise<number> {
  const skillEntries = await collectSkillEntries();
  const opencodeLibEntries = await collectOpencodeLibEntries();
  const hookBinaryEntries = await collectHookBinaryEntries();
  const hookHosts = hookBinaryHosts(hosts, capsLookup);
  const workflowCommandEntries = await collectWorkflowCommandEntries();

  let total = 0;
  for (const host of hosts) {
    let hostTotal = 0;
    // Prune-before-emit (UGB-04): must run before any copy below so a stale
    // file from a deleted source never survives regeneration.
    await pruneManagedRoots(targetRoots[host]!, host, hookBinaryEntries, capsLookup);

    const skillsDest = path.join(targetRoots[host]!, "skills");
    await copyEntries(skillEntries, skillsDest);
    total += skillEntries.length;
    hostTotal += skillEntries.length;

    // "lib" is opencode's vendored opencode-config.cjs copy today; whether a
    // host gets it is now table-driven (extraManagedRoots), not a literal
    // `host === "opencode"` check.
    if (capsLookup(host)?.extraManagedRoots.includes("lib")) {
      const libDest = path.join(targetRoots[host]!, "lib");
      await copyEntries(opencodeLibEntries, libDest);
      total += opencodeLibEntries.length;
      hostTotal += opencodeLibEntries.length;
    }

    if (hookHosts.includes(host)) {
      const hooksDest = path.join(targetRoots[host]!, "hooks");
      await copyEntries(hookBinaryEntries, hooksDest);
      for (const entry of hookBinaryEntries) {
        await fs.chmod(path.join(hooksDest, ...entry.relPath.split("/")), HOOK_BINARY_MODE);
      }
      total += hookBinaryEntries.length;
      hostTotal += hookBinaryEntries.length;
    }

    if (host in SHARED_WORKFLOW_HOST_DIRS) {
      const count = await emitSharedWorkflowCommands(host as Host, targetRoots[host]!, workflowCommandEntries);
      total += count;
      hostTotal += count;
    } else if (capsLookup(host)?.extraManagedRoots.includes("command")) {
      const count = await emitOpencodeWorkflowCommands(targetRoots[host]!, workflowCommandEntries);
      total += count;
      hostTotal += count;
    }

    onHostEmitted?.(host, hostTotal);
  }
  return total;
}

// ── Diff (full directory inventory, not just known paths) ──────────────────
interface RootDiff {
  root: string;
  missing: string[]; // present in generated, absent from checked-in
  unexpected: string[]; // present in checked-in, absent from generated
  modified: string[]; // present in both, byte-different
}

async function diffManagedRoot(
  generatedRoot: string,
  checkedInRoot: string,
  label: string,
): Promise<RootDiff> {
  const [generatedFiles, checkedInFiles] = await Promise.all([
    walkFiles(generatedRoot),
    walkFiles(checkedInRoot),
  ]);
  const generatedSet = new Set(generatedFiles);
  const checkedInSet = new Set(checkedInFiles);

  const missing = generatedFiles.filter((f) => !checkedInSet.has(f)).sort();
  const unexpected = checkedInFiles.filter((f) => !generatedSet.has(f)).sort();

  const modified: string[] = [];
  for (const rel of generatedFiles) {
    if (!checkedInSet.has(rel)) continue;
    const [gBuf, cBuf] = await Promise.all([
      fs.readFile(path.join(generatedRoot, ...rel.split("/"))),
      fs.readFile(path.join(checkedInRoot, ...rel.split("/"))),
    ]);
    if (!gBuf.equals(cBuf)) modified.push(rel);
  }
  modified.sort();

  return { root: label, missing, unexpected, modified };
}

/**
 * Marker-scoped counterpart to diffManagedRoot() (T3, WFC-07): the
 * checked-in side is filtered to marker-bearing candidates only, so the
 * hand-authored quick-command siblings living in the same directory
 * (def.md, skills/def/SKILL.md, ...) never register as `unexpected`. The
 * generated side needs no filtering — everything emitSharedWorkflowCommands()
 * writes already carries the marker (T2) — but is filtered anyway,
 * defensively, so this function's correctness never depends on that
 * invariant holding in the caller.
 * Test: bun test scripts/__tests__/workflow-command-check.test.ts
 */
async function diffMarkerScopedWorkflowCommands(
  generatedRoot: string,
  checkedInRoot: string,
  shape: MarkerScopedShape,
  label: string,
): Promise<RootDiff> {
  async function markerScopedInventory(dirAbs: string): Promise<Map<string, Buffer>> {
    const out = new Map<string, Buffer>();
    for (const candidate of await markerScopedCandidates(dirAbs, shape)) {
      let buf: Buffer;
      try {
        buf = await fs.readFile(candidate.absPath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw err;
      }
      if (!buf.toString("utf8").includes(WORKFLOW_COMMAND_MARKER)) continue;
      out.set(candidate.relPath, buf);
    }
    return out;
  }

  const [generated, checkedIn] = await Promise.all([
    markerScopedInventory(generatedRoot),
    markerScopedInventory(checkedInRoot),
  ]);

  const missing = [...generated.keys()].filter((r) => !checkedIn.has(r)).sort();
  const unexpected = [...checkedIn.keys()].filter((r) => !generated.has(r)).sort();
  const modified: string[] = [];
  for (const [rel, gBuf] of generated) {
    const cBuf = checkedIn.get(rel);
    if (cBuf && !gBuf.equals(cBuf)) modified.push(rel);
  }
  modified.sort();

  return { root: label, missing, unexpected, modified };
}

export async function runCheck(): Promise<number> {
  const tmp = await fs.mkdtemp(path.join(tmpdir(), "massa-ai-skill-gen-"));
  try {
    const tmpRoots: Record<Host, string> = {
      claude: path.join(tmp, "claude"),
      codex: path.join(tmp, "codex"),
      cursor: path.join(tmp, "cursor"),
      opencode: path.join(tmp, "opencode"),
    };
    await emitAll(tmpRoots);

    let drift = false;
    for (const host of HOSTS) {
      for (const managedRel of managedRootsFor(host)) {
        const generatedRoot = path.join(tmpRoots[host], managedRel);
        const checkedInRoot = path.join(pluginRoot(host), managedRel);
        const label = `${host}-plugin/${managedRel}`;
        const diff = await diffManagedRoot(generatedRoot, checkedInRoot, label);
        if (diff.missing.length === 0 && diff.unexpected.length === 0 && diff.modified.length === 0) {
          continue;
        }
        drift = true;
        console.error(`[${label}] drift detected:`);
        for (const f of diff.missing) console.error(`  + ${f} (missing — regenerate and commit)`);
        for (const f of diff.unexpected) console.error(`  - ${f} (unexpected — stale file, source was likely deleted)`);
        for (const f of diff.modified) console.error(`  M ${f} (content differs from source)`);
      }

      // Workflow commands (T3, WFC-07): marker-scoped, not a directory-root
      // walk — commands/ (claude) and skills/ (codex, cursor) also hold the
      // 6 hand-authored quick-command files, which a plain diffManagedRoot()
      // would wrongly flag as `unexpected`. OpenCode's command/ root has no
      // hand-authored siblings and already flows through the managedRootsFor
      // loop above via extraManagedRoots.
      const workflowTarget = SHARED_WORKFLOW_HOST_DIRS[host];
      if (workflowTarget) {
        const generatedRoot = path.join(tmpRoots[host], workflowTarget.rel);
        const checkedInRoot = path.join(pluginRoot(host), workflowTarget.rel);
        const label = `${host}-plugin/${workflowTarget.rel} (workflow commands)`;
        const diff = await diffMarkerScopedWorkflowCommands(
          generatedRoot,
          checkedInRoot,
          workflowTarget.shape,
          label,
        );
        if (diff.missing.length > 0 || diff.unexpected.length > 0 || diff.modified.length > 0) {
          drift = true;
          console.error(`[${label}] drift detected:`);
          for (const f of diff.missing) console.error(`  + ${f} (missing — regenerate and commit)`);
          for (const f of diff.unexpected) console.error(`  - ${f} (unexpected — stale file, source was likely deleted)`);
          for (const f of diff.modified) console.error(`  M ${f} (content differs from source)`);
        }
      }

      // hooks/massa-ai-hook lives beside hand-maintained hooks.json, so this is
      // a single-file check, not a managed-root directory walk (a directory
      // walk would wrongly flag hooks.json as an unmanaged extra).
      if (HOOK_BINARY_HOSTS.includes(host)) {
        const rel = path.join("hooks", "massa-ai-hook");
        const generatedFile = path.join(tmpRoots[host], rel);
        const checkedInFile = path.join(pluginRoot(host), rel);
        const label = `${host}-plugin/${rel}`;
        const lst = await fs.lstat(checkedInFile).catch(() => null);
        if (!lst) {
          drift = true;
          console.error(`[${label}] drift detected:\n  + massa-ai-hook (missing — regenerate and commit)`);
        } else if (lst.isSymbolicLink()) {
          drift = true;
          console.error(`[${label}] drift detected:\n  M massa-ai-hook (is a symlink — npm pack drops symlinks; regenerate as a real file)`);
        } else {
          const [gBuf, cBuf] = await Promise.all([fs.readFile(generatedFile), fs.readFile(checkedInFile)]);
          if (!gBuf.equals(cBuf)) {
            drift = true;
            console.error(`[${label}] drift detected:\n  M massa-ai-hook (content differs from source)`);
          }
        }
      }
    }

    if (drift) {
      console.error(
        "\nDrift detected. Re-run `bun run scripts/generate-skill-artifacts.ts` and commit the output.",
      );
      return 1;
    }
    console.log("No drift: generated skill bundles match checked-in files.");
    return 0;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  if (argv.includes("--check")) {
    return runCheck();
  }
  const targetRoots = Object.fromEntries(HOSTS.map((h) => [h, pluginRoot(h)])) as Record<Host, string>;
  const perHost: Record<string, number> = {};
  const total = await emitAll(targetRoots, HOSTS, REAL_CAPS_LOOKUP, (host, count) => {
    perHost[host] = count;
  });
  console.log(`Emitted ${total} skill-bundle files across ${HOSTS.length} hosts.`);
  for (const host of HOSTS) {
    console.log(`  ${host}: ${perHost[host] ?? 0} files (incl. workflow commands)`);
  }
  return 0;
}

if (import.meta.main) {
  const code = await main();
  if (code !== 0) {
    process.exit(code);
  }
}
