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
  check_specs_delivered: {
    pyRel: "skills/massa-ai/scripts/check_specs_delivered.py",
    tsRel: "skills/massa-ai/scripts/check_specs_delivered.ts",
    invocations: () => {
      function initGitRepo(root: string): void {
        Bun.spawnSync(["git", "init", "-q", "-b", "main"], { cwd: root });
        Bun.spawnSync(["git", "config", "user.email", "test@example.com"], { cwd: root });
        Bun.spawnSync(["git", "config", "user.name", "Test"], { cwd: root });
        Bun.spawnSync(["git", "config", "commit.gpgsign", "false"], { cwd: root });
      }

      function commitAll(root: string, message: string): void {
        Bun.spawnSync(["git", "add", "-A"], { cwd: root });
        Bun.spawnSync(["git", "commit", "-q", "-m", message], { cwd: root });
      }

      function writeStateFiles(root: string): void {
        mkdirSync(join(root, ".specs", "project"), { recursive: true });
        writeFileSync(join(root, ".specs", "project", "STATE.md"), "# State\n", "utf-8");
        writeFileSync(join(root, ".specs", "HANDOFF.md"), "# Handoff\n", "utf-8");
        writeFileSync(join(root, ".specs", "project", "FEATURES.json"), "{}\n", "utf-8");
      }

      const cleanRoot = makeTempRoot("dual-run-delivered-clean");
      writeFeatureFile(cleanRoot, "my-feature", "spec.md", "# Spec\n");
      initGitRepo(cleanRoot);
      writeStateFiles(cleanRoot);
      commitAll(cleanRoot, "init");

      const dirtyRoot = makeTempRoot("dual-run-delivered-dirty");
      const specPath = writeFeatureFile(dirtyRoot, "my-feature", "spec.md", "# Spec\n");
      initGitRepo(dirtyRoot);
      writeStateFiles(dirtyRoot);
      commitAll(dirtyRoot, "init");
      writeFileSync(specPath, "# Spec\n\nModified after commit, not re-committed.\n", "utf-8");

      const untrackedRoot = makeTempRoot("dual-run-delivered-untracked");
      writeFeatureFile(untrackedRoot, "my-feature", "spec.md", "# Spec\n");
      initGitRepo(untrackedRoot);
      writeStateFiles(untrackedRoot);
      commitAll(untrackedRoot, "init");
      writeFeatureFile(untrackedRoot, "my-feature", "design.md", "# Design\n"); // never `git add`ed

      const absentRoot = makeTempRoot("dual-run-delivered-absent");
      writeFeatureFile(absentRoot, "my-feature", "spec.md", "# Spec\n");
      initGitRepo(absentRoot);
      mkdirSync(join(absentRoot, ".specs", "project"), { recursive: true });
      writeFileSync(join(absentRoot, ".specs", "project", "STATE.md"), "# State\n", "utf-8");
      writeFileSync(join(absentRoot, ".specs", "HANDOFF.md"), "# Handoff\n", "utf-8");
      commitAll(absentRoot, "init"); // FEATURES.json never written - porcelain-clean but absent

      const optionalRoot = makeTempRoot("dual-run-delivered-optional");
      writeFeatureFile(optionalRoot, "my-feature", "spec.md", "# Spec\n");
      writeFeatureFile(optionalRoot, "my-feature", "tasks.md", "# Tasks\n");
      initGitRepo(optionalRoot);
      writeStateFiles(optionalRoot);
      commitAll(optionalRoot, "init");

      return [
        { label: "clean + tracked", args: ["my-feature", "--root", cleanRoot], cwd: cleanRoot },
        { label: "dirty modified-but-uncommitted", args: ["my-feature", "--root", dirtyRoot], cwd: dirtyRoot },
        {
          label: "untracked file under .specs/",
          args: ["my-feature", "--root", untrackedRoot],
          cwd: untrackedRoot,
        },
        {
          label: "required artifact never written (absent, not dirty)",
          args: ["my-feature", "--root", absentRoot],
          cwd: absentRoot,
        },
        { label: "optional artifacts present", args: ["my-feature", "--root", optionalRoot], cwd: optionalRoot },
        {
          label: "live dogfood: python-to-typescript-scripts",
          args: ["python-to-typescript-scripts", "--root", "."],
          cwd: REPO_ROOT,
        },
      ];
    },
  },
  validate_state: {
    pyRel: "skills/massa-ai/scripts/validate_state.py",
    tsRel: "skills/massa-ai/scripts/validate_state.ts",
    invocations: () => {
      const DONE_TASKS_MD = [
        "## Test Coverage Matrix",
        "",
        "## Gate Check Commands",
        "",
        "## Execution Plan",
        "",
        "### Phase 1: Foundation",
        "",
        "```",
        "T1",
        "```",
        "",
        "## Task Breakdown",
        "",
        "### T1: Do the thing",
        "**What**: thing",
        "**Where**: `src/thing.ts`",
        "**Depends on**: None",
        "**Tests**: unit",
        "**Gate**: quick",
        "",
        "- [x] done",
        "",
      ].join("\n");

      const PASS_MD = [
        "# Feature Validation",
        "",
        "## Summary",
        "",
        "**Overall**: ✅ Ready",
        "",
        "**Result**: PASS",
        "",
        "**Evidence**: `src/thing.ts:42` — `expect(result).toBe(true)`",
        "",
      ].join("\n");

      const FAIL_MD = ["# Feature Validation", "", "## Summary", "", "**Result**: FAIL", "", "**Issues found**: gap in coverage", ""].join(
        "\n",
      );

      const UNFILLED_MD = [
        "# Feature Validation",
        "",
        "## Summary",
        "",
        "**Overall**: ✅ Ready | ⚠️ Issues | ❌ Not Ready",
        "",
        "**Result**: [PASS | FAIL]",
        "",
      ].join("\n");

      const NO_EVIDENCE_MD = [
        "# Feature Validation",
        "",
        "## Summary",
        "",
        "**Result**: PASS",
        "",
        "**What works**: everything, allegedly",
        "",
      ].join("\n");

      const DIVERGING_MD = [
        "# My Feature Validation",
        "",
        "## Summary",
        "",
        "**Result**: FAIL",
        "",
        "## Discrimination Sensor",
        "",
        "**Result**: 3/3 killed — PASS ✅",
        "",
        "Evidence: src/thing.ts:42",
        "",
      ].join("\n");

      const missingRoot = makeTempRoot("dual-run-state-missing");
      writeFeatureFile(missingRoot, "my-feature", "tasks.md", DONE_TASKS_MD);

      const failRoot = makeTempRoot("dual-run-state-fail");
      writeFeatureFile(failRoot, "my-feature", "tasks.md", DONE_TASKS_MD);
      writeFeatureFile(failRoot, "my-feature", "validation.md", FAIL_MD);

      const divergingRoot = makeTempRoot("dual-run-state-diverging");
      writeFeatureFile(divergingRoot, "my-feature", "tasks.md", DONE_TASKS_MD);
      writeFeatureFile(divergingRoot, "my-feature", "validation.md", DIVERGING_MD);

      const unfilledRoot = makeTempRoot("dual-run-state-unfilled");
      writeFeatureFile(unfilledRoot, "my-feature", "tasks.md", DONE_TASKS_MD);
      writeFeatureFile(unfilledRoot, "my-feature", "validation.md", UNFILLED_MD);

      const noEvidenceRoot = makeTempRoot("dual-run-state-no-evidence");
      writeFeatureFile(noEvidenceRoot, "my-feature", "tasks.md", DONE_TASKS_MD);
      writeFeatureFile(noEvidenceRoot, "my-feature", "validation.md", NO_EVIDENCE_MD);

      const passRoot = makeTempRoot("dual-run-state-pass");
      writeFeatureFile(passRoot, "my-feature", "tasks.md", DONE_TASKS_MD);
      writeFeatureFile(passRoot, "my-feature", "validation.md", PASS_MD);

      const legacyRoot = makeTempRoot("dual-run-state-legacy");
      writeFeatureFile(legacyRoot, "legacy-feature", "spec.md", "# Legacy Feature\n");
      writeFeatureFile(legacyRoot, "done-feature", "tasks.md", DONE_TASKS_MD);
      writeFeatureFile(legacyRoot, "done-feature", "validation.md", PASS_MD);

      const namedRoot = makeTempRoot("dual-run-state-named");
      writeFeatureFile(namedRoot, "feature-a", "tasks.md", DONE_TASKS_MD);
      writeFeatureFile(namedRoot, "feature-a", "validation.md", PASS_MD);
      writeFeatureFile(namedRoot, "feature-b", "tasks.md", DONE_TASKS_MD);
      writeFeatureFile(namedRoot, "feature-b", "validation.md", FAIL_MD);

      return [
        { label: "missing validation.md", args: ["--root", missingRoot], cwd: missingRoot },
        { label: "FAIL verdict", args: ["--root", failRoot], cwd: failRoot },
        { label: "diverging sensor PASS sub-line (FT2)", args: ["--root", divergingRoot], cwd: divergingRoot },
        { label: "unfilled template placeholder", args: ["--root", unfilledRoot], cwd: unfilledRoot },
        { label: "PASS with no evidence", args: ["--root", noEvidenceRoot], cwd: noEvidenceRoot },
        { label: "PASS with evidence", args: ["--root", passRoot], cwd: passRoot },
        { label: "legacy-shaped feature (no crash, R2)", args: ["--root", legacyRoot], cwd: legacyRoot },
        {
          label: "explicit feature name resolves",
          args: ["feature-b", "--root", namedRoot],
          cwd: namedRoot,
        },
        {
          label: "live dogfood: python-to-typescript-scripts",
          args: ["python-to-typescript-scripts", "--root", "."],
          cwd: REPO_ROOT,
        },
      ];
    },
  },
  validate_spec: {
    pyRel: "skills/massa-ai/scripts/validate_spec.py",
    tsRel: "skills/massa-ai/scripts/validate_spec.ts",
    invocations: () => {
      const FILLED_SPEC = `# Test Feature Specification

## Problem Statement

Users need to authenticate. This solves a security gap by adding login.

## Out of Scope

| Feature | Reason |
| --- | --- |
| SSO | not needed for v1 |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Session length | 30 minutes | Matches existing services | y |

**Open questions:** none — all resolved or logged above.

## User Stories

### P1: Login ⭐ MVP

**User Story**: As a user, I want to log in so that I can access my account.

**Acceptance Criteria**:

1. WHEN the user submits valid credentials THEN the system SHALL authenticate the user.
2. WHEN the user submits invalid credentials THEN the system SHALL reject the login.

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| AUTH-01 | P1: Login | Design | Pending |
`;

      const WITHOUT_OUT_OF_SCOPE = FILLED_SPEC.replace(/## Out of Scope[\s\S]*?\n\n(?=## Assumptions)/, "");
      const NO_SHALL = FILLED_SPEC.replace(
        "1. WHEN the user submits valid credentials THEN the system SHALL authenticate the user.",
        "1. WHEN the user submits valid credentials THEN the system logs the user in.",
      );

      const filledRoot = makeTempRoot("dual-run-spec-filled");
      writeFeatureFile(filledRoot, "auth-feature", "spec.md", FILLED_SPEC);

      const missingSectionRoot = makeTempRoot("dual-run-spec-missing-section");
      writeFeatureFile(missingSectionRoot, "auth-feature", "spec.md", WITHOUT_OUT_OF_SCOPE);

      const noShallRoot = makeTempRoot("dual-run-spec-no-shall");
      writeFeatureFile(noShallRoot, "auth-feature", "spec.md", NO_SHALL);

      const autodetectRoot = makeTempRoot("dual-run-spec-autodetect");
      writeFeatureFile(autodetectRoot, "only-feature", "spec.md", FILLED_SPEC);

      const ambiguousRoot = makeTempRoot("dual-run-spec-ambiguous");
      writeFeatureFile(ambiguousRoot, "feature-a", "spec.md", FILLED_SPEC);
      writeFeatureFile(ambiguousRoot, "feature-b", "spec.md", FILLED_SPEC);

      return [
        { label: "filled fixture", args: ["--root", filledRoot], cwd: filledRoot },
        { label: "missing required section", args: ["--root", missingSectionRoot], cwd: missingSectionRoot },
        { label: "SHALL-less acceptance criterion", args: ["--root", noShallRoot], cwd: noShallRoot },
        { label: "auto-detect sole feature", args: ["--root", autodetectRoot], cwd: autodetectRoot },
        { label: "ambiguous multiple features", args: ["--root", ambiguousRoot], cwd: ambiguousRoot },
        {
          label: "feature-name resolution with default root='.' (path-join dialect sensor)",
          args: ["python-to-typescript-scripts", "--root", "."],
          cwd: REPO_ROOT,
        },
        {
          label: "live dogfood: this feature's own spec.md",
          args: [".specs/features/python-to-typescript-scripts/spec.md"],
          cwd: REPO_ROOT,
        },
      ];
    },
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
