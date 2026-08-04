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

export { HOSTS, type Host };

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

  for (const bundleName of ["massa-ai", "persona-router"] as const) {
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
 * `hosts` (default `HOSTS`) and `capsLookup` (default the real
 * capabilitiesFor()) are the seam XP-06 AC-2's fixture-host test drives:
 * injecting an extra host + a fixture capability record proves the "lib"
 * root and the hook-binary copy are both decided from the table, not from a
 * literal host-name comparison. Only 2 production call sites (main, runCheck
 * below), both in this file — no external call-site contract to preserve.
 */
export async function emitAll(
  targetRoots: Record<string, string>,
  hosts: readonly string[] = HOSTS,
  capsLookup: CapsLookup = REAL_CAPS_LOOKUP,
): Promise<number> {
  const skillEntries = await collectSkillEntries();
  const opencodeLibEntries = await collectOpencodeLibEntries();
  const hookBinaryEntries = await collectHookBinaryEntries();
  const hookHosts = hookBinaryHosts(hosts, capsLookup);

  let total = 0;
  for (const host of hosts) {
    const skillsDest = path.join(targetRoots[host]!, "skills");
    await copyEntries(skillEntries, skillsDest);
    total += skillEntries.length;

    // "lib" is opencode's vendored opencode-config.cjs copy today; whether a
    // host gets it is now table-driven (extraManagedRoots), not a literal
    // `host === "opencode"` check.
    if (capsLookup(host)?.extraManagedRoots.includes("lib")) {
      const libDest = path.join(targetRoots[host]!, "lib");
      await copyEntries(opencodeLibEntries, libDest);
      total += opencodeLibEntries.length;
    }

    if (hookHosts.includes(host)) {
      const hooksDest = path.join(targetRoots[host]!, "hooks");
      await copyEntries(hookBinaryEntries, hooksDest);
      for (const entry of hookBinaryEntries) {
        await fs.chmod(path.join(hooksDest, ...entry.relPath.split("/")), HOOK_BINARY_MODE);
      }
      total += hookBinaryEntries.length;
    }
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
  const total = await emitAll(targetRoots);
  console.log(`Emitted ${total} skill-bundle files across ${HOSTS.length} hosts.`);
  return 0;
}

if (import.meta.main) {
  const code = await main();
  if (code !== 0) {
    process.exit(code);
  }
}
