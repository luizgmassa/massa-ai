#!/usr/bin/env bun
/**
 * Dual-run characterization harness (PTS-06, design D3).
 *
 * Executes a ported script's `.py` and `.ts` twins over the same fixture
 * invocations, diffing full stdout + exit code. Any divergence is a gate
 * failure, named by invocation — never adjusted by relaxing the fixture
 * (PTS-06 AC1).
 *
 * Temporary: removed at T11 once the last script is ported and the passing
 * fixture+output pairs are materialized as permanent golden tests.
 *
 * Usage:
 *   bun scripts/pyts-dual-run.ts --script <name>   # dual-run parity for a registered script
 *   bun scripts/pyts-dual-run.ts --selftest        # self-test the harness (no real scripts)
 *
 * Per-script invocation lists live in `REGISTRY` below and are extended by
 * each port task (T4-T10) as its `.ts` twin lands. At harness-introduction
 * time (T3) no `.ts` twins exist yet, so `--script <name>` against an
 * unregistered or not-yet-ported name is a usage error, not a divergence.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");

// ---------------------------------------------------------------------------
// Fixture helpers (mirrors scripts/__tests__/spec-driven-validators.test.ts's
// mkdtemp fixture approach so port tasks can reuse the same shape).
// ---------------------------------------------------------------------------

/** Create a fresh temp directory; caller is responsible for cleanup via cleanupRoot(). */
export function makeTempRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

/** Create `<root>/.specs/features/<slug>/` and write `filename` with `content` inside it. */
export function writeFeatureFile(root: string, slug: string, filename: string, content: string): string {
  const featureDir = join(root, ".specs", "features", slug);
  mkdirSync(featureDir, { recursive: true });
  const filePath = join(featureDir, filename);
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

export function cleanupRoot(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Invocation {
  /** Human-readable label naming this invocation in divergence output. */
  label: string;
  args: string[];
  cwd?: string;
  stdin?: string;
}

export interface ScriptEntry {
  /** Path to the Python twin, relative to repo root. */
  pyRel: string;
  /** Path to the TypeScript twin, relative to repo root. */
  tsRel: string;
  /** Lazily builds the invocation list (so fixtures are created fresh per run). */
  invocations: () => Invocation[];
}

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface DualRunOutcome {
  ok: boolean;
  divergences: string[];
}

// ---------------------------------------------------------------------------
// Registry — extended by each port task (T4-T10). Empty at T3: no .ts twin
// exists yet for any of the 8 target scripts.
// ---------------------------------------------------------------------------

export const REGISTRY: Record<string, ScriptEntry> = {
  check_commit: {
    pyRel: "skills/massa-ai/scripts/check_commit.py",
    tsRel: "skills/massa-ai/scripts/check_commit.ts",
    invocations: () => [
      { label: "valid conventional commit", args: ["--message", "feat(auth): add email validation"] },
      {
        label: "valid jira-prefixed feat",
        args: ["--message", "[SA-142] feat(auth): reject expired tokens"],
      },
      {
        label: "valid jira-prefixed fix (spec example)",
        args: ["--message", "[SA-142] fix(auth): reject expired tokens"],
      },
      { label: "non-conventional header", args: ["--message", "updated the auth module"] },
      { label: "disallowed type", args: ["--message", "feature(auth): add email validation"] },
      { label: "uppercase description", args: ["--message", "feat(auth): Add email validation"] },
      { label: "period-ending description", args: ["--message", "feat(auth): add email validation."] },
      { label: "breaking marker without footer", args: ["--message", "feat(auth)!: change token format"] },
      {
        label: "breaking marker with footer",
        args: ["--message", "feat(auth)!: change token format\n\nBREAKING CHANGE: tokens are now opaque"],
      },
      { label: "empty message (usage error)", args: ["--message", ""] },
      { label: "header over 72 chars (warn only)", args: ["--message", `feat(auth): ${"a".repeat(70)}`] },
      { label: "no args, no stdin (usage error)", args: [] },
    ],
  },
};

// ---------------------------------------------------------------------------
// Process execution
// ---------------------------------------------------------------------------

function runPython(pyPath: string, inv: Invocation): RunResult {
  const proc = Bun.spawnSync(["python3", "-B", pyPath, ...inv.args], {
    cwd: inv.cwd ?? REPO_ROOT,
    stdin: inv.stdin !== undefined ? Buffer.from(inv.stdin) : undefined,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { exitCode: proc.exitCode ?? -1, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

function runBun(tsPath: string, inv: Invocation): RunResult {
  const proc = Bun.spawnSync(["bun", tsPath, ...inv.args], {
    cwd: inv.cwd ?? REPO_ROOT,
    stdin: inv.stdin !== undefined ? Buffer.from(inv.stdin) : undefined,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { exitCode: proc.exitCode ?? -1, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

/** Runs both twins over every invocation, diffing full stdout + exit code. */
function compareTwins(pyPath: string, tsPath: string, invocations: Invocation[]): DualRunOutcome {
  const divergences: string[] = [];
  for (const inv of invocations) {
    const py = runPython(pyPath, inv);
    const ts = runBun(tsPath, inv);
    const exitDiverges = py.exitCode !== ts.exitCode;
    const stdoutDiverges = py.stdout !== ts.stdout;
    if (exitDiverges || stdoutDiverges) {
      const parts = [`invocation "${inv.label}"`];
      if (exitDiverges) parts.push(`exit: py=${py.exitCode} ts=${ts.exitCode}`);
      if (stdoutDiverges) {
        parts.push(`stdout differs (py ${py.stdout.length} chars vs ts ${ts.stdout.length} chars)`);
        parts.push(`--- py stdout ---\n${py.stdout}\n--- ts stdout ---\n${ts.stdout}`);
      }
      divergences.push(parts.join(" | "));
    }
  }
  return { ok: divergences.length === 0, divergences };
}

// ---------------------------------------------------------------------------
// --script <name>
// ---------------------------------------------------------------------------

function runScriptDualRun(name: string): { ok: boolean; usageError: boolean } {
  const entry = REGISTRY[name];
  if (!entry) {
    const known = Object.keys(REGISTRY);
    console.error(
      `ERROR: unknown script '${name}'. Registered scripts: ${known.length ? known.join(", ") : "(none registered yet)"}`,
    );
    return { ok: false, usageError: true };
  }
  const pyPath = join(REPO_ROOT, entry.pyRel);
  const tsPath = join(REPO_ROOT, entry.tsRel);
  if (!existsSync(pyPath)) {
    console.error(`ERROR: py twin missing for '${name}' at ${entry.pyRel}.`);
    return { ok: false, usageError: true };
  }
  if (!existsSync(tsPath)) {
    console.error(
      `ERROR: ts twin missing for '${name}' at ${entry.tsRel} — dual-run requires both twins to exist.`,
    );
    return { ok: false, usageError: true };
  }

  const invocations = entry.invocations();
  const outcome = compareTwins(pyPath, tsPath, invocations);
  if (outcome.ok) {
    console.log(`OK [${name}]: ${invocations.length} invocation(s) matched (stdout + exit code).`);
    return { ok: true, usageError: false };
  }
  console.error(`DIVERGENCE [${name}]: ${outcome.divergences.length}/${invocations.length} invocation(s) diverged.`);
  for (const d of outcome.divergences) {
    console.error(`  ${d}`);
  }
  return { ok: false, usageError: false };
}

// ---------------------------------------------------------------------------
// --selftest — proves the comparison path itself: a seeded divergence must be
// observed red, and an identity pair must be observed green (a new sensor
// needs an observed red). Never touches the real 8 scripts.
// ---------------------------------------------------------------------------

function selftest(): boolean {
  const scratchDir = makeTempRoot("pyts-dual-run-selftest");
  try {
    // --- RED: a deliberately divergent twin pair ---
    const redPy = join(scratchDir, "divergent.py");
    const redTs = join(scratchDir, "divergent.ts");
    writeFileSync(redPy, "#!/usr/bin/env python3\nprint('py-output')\n", "utf-8");
    writeFileSync(redTs, "#!/usr/bin/env bun\nconsole.log('ts-output');\n", "utf-8");

    const redOutcome = compareTwins(redPy, redTs, [{ label: "no-args", args: [] }]);
    if (redOutcome.ok) {
      console.error("SELFTEST FAIL: seeded divergence was not detected (expected red, observed green).");
      return false;
    }

    // --- GREEN: an identity twin pair ---
    const greenPy = join(scratchDir, "identical.py");
    const greenTs = join(scratchDir, "identical.ts");
    writeFileSync(greenPy, "#!/usr/bin/env python3\nprint('identical-output')\n", "utf-8");
    writeFileSync(greenTs, "#!/usr/bin/env bun\nconsole.log('identical-output');\n", "utf-8");

    const greenOutcome = compareTwins(greenPy, greenTs, [{ label: "no-args", args: [] }]);
    if (!greenOutcome.ok) {
      console.error("SELFTEST FAIL: identity pair reported a divergence (expected green).");
      for (const d of greenOutcome.divergences) console.error(`  ${d}`);
      return false;
    }

    console.log("SELFTEST: seeded divergence observed red; identity pair observed green.");
    return true;
  } finally {
    cleanupRoot(scratchDir);
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(): number {
  const argv = process.argv.slice(2);

  if (argv.includes("--selftest")) {
    return selftest() ? 0 : 1;
  }

  const scriptIdx = argv.indexOf("--script");
  if (scriptIdx !== -1) {
    const name = argv[scriptIdx + 1];
    if (!name) {
      console.error("Usage: bun scripts/pyts-dual-run.ts --script <name>");
      return 2;
    }
    const result = runScriptDualRun(name);
    if (result.usageError) return 2;
    return result.ok ? 0 : 1;
  }

  console.error("Usage: bun scripts/pyts-dual-run.ts --script <name> | --selftest");
  return 2;
}

if (import.meta.main) {
  process.exit(main());
}
