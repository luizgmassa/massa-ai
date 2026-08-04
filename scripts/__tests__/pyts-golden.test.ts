/**
 * Golden regression suite for the ported `.ts` scripts (design D3, Plan
 * Challenge F3, T11).
 *
 * The dual-run harness (`scripts/pyts-dual-run.ts`, PTS-06) proved
 * .py<->.ts parity per invocation at each port task (T4-T9) and is deleted
 * in this same commit — its oracle role (a fixed corpus of invocation ->
 * expected {stdout, exitCode}) now lives here as a permanent, python-free
 * regression fixture, replayed only against the `.ts` scripts.
 *
 * Fixture trees are the SAME recipes the harness used (constants and
 * builder functions copied verbatim from the deleted `pyts-dual-run.ts`,
 * `REGISTRY`), rebuilt fresh in a new `mkdtemp` root on every test run so
 * this suite has no dependency on the harness file or on any prior run's
 * scratch state. Expected `{stdout, exitCode}` pairs live in
 * `fixtures/pyts-golden/<script>.json`, captured while the dual-run
 * harness's own py<->ts comparison for that invocation was green. Any
 * captured stdout that embedded the scratch root's absolute mkdtemp path
 * (validate_spec, validate_tasks print the resolved spec/tasks path in
 * their summary line) was normalized to the placeholder `<ROOT>` at capture
 * time and is substituted back to the freshly-built root's real path before
 * comparison here — the literal ephemeral path from capture time is
 * meaningless after that mkdtemp directory is gone.
 *
 * Excluded from this permanent corpus, on purpose: every "live dogfood"
 * invocation the harness also ran (against this feature's own evolving
 * `spec.md`/`tasks.md`, or real `git status` against this repo). Those
 * exercised a real production tree DURING the migration's transitional
 * dual-run window and were already parity-proven per-commit at T4-T9; their
 * expected output is inherently time-variable (this feature's own tasks.md
 * changes with every task in this very sequence; `validate_state`'s
 * dogfood depends on whether `validation.md` exists, which it does not yet
 * at this stage; `check_specs_delivered`'s dogfood depends on live
 * `git status`, which is never stable mid-task) — freezing any of them as a
 * "golden" constant would make this suite flake or need re-capture on every
 * future commit to this repo, defeating the point of a permanent fixture.
 * Each excluded invocation is functionally redundant with a still-included
 * self-contained sibling exercising the identical code path:
 *   - check_specs_delivered "live dogfood": same code path as the included
 *     "clean + tracked" fixture (both exercise the porcelain-clean +
 *     fully-tracked pass case).
 *   - validate_state "live dogfood": at capture time this feature has no
 *     `validation.md`, the same code path as the included
 *     "missing validation.md" fixture.
 *   - validate_spec "feature-name resolution with default root='.'" and
 *     "live dogfood: this feature's own spec.md": both read this feature's
 *     own (fully-filled) spec.md, the same code path as the included
 *     "filled fixture".
 *   - validate_tasks "live dogfood: this feature's own tasks.md": reads a
 *     well-formed, in-progress tasks.md, the same code path as the included
 *     "well-formed fixture" / "FT-prefixed header backward dep OK".
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import goldenCheckCommit from "./fixtures/pyts-golden/check_commit.json" with { type: "json" };
import goldenCheckSpecsDelivered from "./fixtures/pyts-golden/check_specs_delivered.json" with { type: "json" };
import goldenValidateState from "./fixtures/pyts-golden/validate_state.json" with { type: "json" };
import goldenValidateSpec from "./fixtures/pyts-golden/validate_spec.json" with { type: "json" };
import goldenValidateTasks from "./fixtures/pyts-golden/validate_tasks.json" with { type: "json" };
import goldenLessons from "./fixtures/pyts-golden/lessons.json" with { type: "json" };
import lessonsStoreSnapshotRaw from "./fixtures/pyts-golden/lessons-store-snapshot.json" with { type: "text" };

const REPO_ROOT = resolve(import.meta.dir, "..", "..");

interface GoldenEntry {
  label: string;
  args: string[];
  exitCode: number;
  stdout: string;
}

const cleanupDirs: string[] = [];

afterEach(() => {
  while (cleanupDirs.length) {
    const dir = cleanupDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempRoot(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  cleanupDirs.push(dir);
  return dir;
}

/** Create `<root>/.specs/features/<slug>/` and write `filename` with `content` inside it. */
function writeFeatureFile(root: string, slug: string, filename: string, content: string): string {
  const featureDir = join(root, ".specs", "features", slug);
  mkdirSync(featureDir, { recursive: true });
  const filePath = join(featureDir, filename);
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

function runBun(tsRel: string, args: string[], cwd?: string): { exitCode: number; stdout: string } {
  const proc = Bun.spawnSync(["bun", join(REPO_ROOT, tsRel), ...args], {
    cwd: cwd ?? REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { exitCode: proc.exitCode ?? -1, stdout: proc.stdout.toString() };
}

/** Substitutes the `<ROOT>` placeholder in a golden entry's args/stdout for a freshly built root. */
function resolveGolden(entry: GoldenEntry, root: string): { args: string[]; exitCode: number; stdout: string } {
  return {
    args: entry.args.map((a) => (a === "<ROOT>" ? root : a)),
    exitCode: entry.exitCode,
    stdout: entry.stdout.split("<ROOT>").join(root),
  };
}

function runGolden(tsRel: string, entry: GoldenEntry, root: string): void {
  const expected = resolveGolden(entry, root);
  const cwd = entry.args.includes("<ROOT>") ? root : undefined;
  const result = runBun(tsRel, expected.args, cwd);
  expect(result.exitCode).toBe(expected.exitCode);
  expect(result.stdout).toBe(expected.stdout);
}

// ---------------------------------------------------------------------------
// check_commit — message-only invocations, no filesystem/root dependency.
// ---------------------------------------------------------------------------

describe("pyts golden: check_commit", () => {
  for (const entry of goldenCheckCommit as GoldenEntry[]) {
    test(entry.label, () => {
      const result = runBun("skills/massa-ai/scripts/check_commit.ts", entry.args);
      expect(result.exitCode).toBe(entry.exitCode);
      expect(result.stdout).toBe(entry.stdout);
    });
  }
});

// ---------------------------------------------------------------------------
// check_specs_delivered — scratch git repos (recipes copied from the
// deleted scripts/pyts-dual-run.ts REGISTRY).
// ---------------------------------------------------------------------------

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

function buildCheckSpecsDeliveredRoot(label: string): string {
  switch (label) {
    case "clean + tracked": {
      const root = makeTempRoot("golden-delivered-clean");
      writeFeatureFile(root, "my-feature", "spec.md", "# Spec\n");
      initGitRepo(root);
      writeStateFiles(root);
      commitAll(root, "init");
      return root;
    }
    case "dirty modified-but-uncommitted": {
      const root = makeTempRoot("golden-delivered-dirty");
      const specPath = writeFeatureFile(root, "my-feature", "spec.md", "# Spec\n");
      initGitRepo(root);
      writeStateFiles(root);
      commitAll(root, "init");
      writeFileSync(specPath, "# Spec\n\nModified after commit, not re-committed.\n", "utf-8");
      return root;
    }
    case "untracked file under .specs/": {
      const root = makeTempRoot("golden-delivered-untracked");
      writeFeatureFile(root, "my-feature", "spec.md", "# Spec\n");
      initGitRepo(root);
      writeStateFiles(root);
      commitAll(root, "init");
      writeFeatureFile(root, "my-feature", "design.md", "# Design\n"); // never `git add`ed
      return root;
    }
    case "required artifact never written (absent, not dirty)": {
      const root = makeTempRoot("golden-delivered-absent");
      writeFeatureFile(root, "my-feature", "spec.md", "# Spec\n");
      initGitRepo(root);
      mkdirSync(join(root, ".specs", "project"), { recursive: true });
      writeFileSync(join(root, ".specs", "project", "STATE.md"), "# State\n", "utf-8");
      writeFileSync(join(root, ".specs", "HANDOFF.md"), "# Handoff\n", "utf-8");
      commitAll(root, "init"); // FEATURES.json never written - porcelain-clean but absent
      return root;
    }
    case "optional artifacts present": {
      const root = makeTempRoot("golden-delivered-optional");
      writeFeatureFile(root, "my-feature", "spec.md", "# Spec\n");
      writeFeatureFile(root, "my-feature", "tasks.md", "# Tasks\n");
      initGitRepo(root);
      writeStateFiles(root);
      commitAll(root, "init");
      return root;
    }
    default:
      throw new Error(`unknown check_specs_delivered golden label: ${label}`);
  }
}

describe("pyts golden: check_specs_delivered", () => {
  for (const entry of goldenCheckSpecsDelivered as GoldenEntry[]) {
    test(entry.label, () => {
      const root = buildCheckSpecsDeliveredRoot(entry.label);
      runGolden("skills/massa-ai/scripts/check_specs_delivered.ts", entry, root);
    });
  }
});

// ---------------------------------------------------------------------------
// validate_state — feature validation.md/tasks.md fixture trees.
// ---------------------------------------------------------------------------

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

const FAIL_MD = ["# Feature Validation", "", "## Summary", "", "**Result**: FAIL", "", "**Issues found**: gap in coverage", ""].join("\n");

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

function buildValidateStateRoot(label: string): string {
  switch (label) {
    case "missing validation.md": {
      const root = makeTempRoot("golden-state-missing");
      writeFeatureFile(root, "my-feature", "tasks.md", DONE_TASKS_MD);
      return root;
    }
    case "FAIL verdict": {
      const root = makeTempRoot("golden-state-fail");
      writeFeatureFile(root, "my-feature", "tasks.md", DONE_TASKS_MD);
      writeFeatureFile(root, "my-feature", "validation.md", FAIL_MD);
      return root;
    }
    case "diverging sensor PASS sub-line (FT2)": {
      const root = makeTempRoot("golden-state-diverging");
      writeFeatureFile(root, "my-feature", "tasks.md", DONE_TASKS_MD);
      writeFeatureFile(root, "my-feature", "validation.md", DIVERGING_MD);
      return root;
    }
    case "unfilled template placeholder": {
      const root = makeTempRoot("golden-state-unfilled");
      writeFeatureFile(root, "my-feature", "tasks.md", DONE_TASKS_MD);
      writeFeatureFile(root, "my-feature", "validation.md", UNFILLED_MD);
      return root;
    }
    case "PASS with no evidence": {
      const root = makeTempRoot("golden-state-no-evidence");
      writeFeatureFile(root, "my-feature", "tasks.md", DONE_TASKS_MD);
      writeFeatureFile(root, "my-feature", "validation.md", NO_EVIDENCE_MD);
      return root;
    }
    case "PASS with evidence": {
      const root = makeTempRoot("golden-state-pass");
      writeFeatureFile(root, "my-feature", "tasks.md", DONE_TASKS_MD);
      writeFeatureFile(root, "my-feature", "validation.md", PASS_MD);
      return root;
    }
    case "legacy-shaped feature (no crash, R2)": {
      const root = makeTempRoot("golden-state-legacy");
      writeFeatureFile(root, "legacy-feature", "spec.md", "# Legacy Feature\n");
      writeFeatureFile(root, "done-feature", "tasks.md", DONE_TASKS_MD);
      writeFeatureFile(root, "done-feature", "validation.md", PASS_MD);
      return root;
    }
    case "explicit feature name resolves": {
      const root = makeTempRoot("golden-state-named");
      writeFeatureFile(root, "feature-a", "tasks.md", DONE_TASKS_MD);
      writeFeatureFile(root, "feature-a", "validation.md", PASS_MD);
      writeFeatureFile(root, "feature-b", "tasks.md", DONE_TASKS_MD);
      writeFeatureFile(root, "feature-b", "validation.md", FAIL_MD);
      return root;
    }
    default:
      throw new Error(`unknown validate_state golden label: ${label}`);
  }
}

describe("pyts golden: validate_state", () => {
  for (const entry of goldenValidateState as GoldenEntry[]) {
    test(entry.label, () => {
      const root = buildValidateStateRoot(entry.label);
      runGolden("skills/massa-ai/scripts/validate_state.ts", entry, root);
    });
  }
});

// ---------------------------------------------------------------------------
// validate_spec — spec.md fixture trees.
// ---------------------------------------------------------------------------

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

function buildValidateSpecRoot(label: string): string {
  switch (label) {
    case "filled fixture": {
      const root = makeTempRoot("golden-spec-filled");
      writeFeatureFile(root, "auth-feature", "spec.md", FILLED_SPEC);
      return root;
    }
    case "missing required section": {
      const root = makeTempRoot("golden-spec-missing-section");
      writeFeatureFile(root, "auth-feature", "spec.md", WITHOUT_OUT_OF_SCOPE);
      return root;
    }
    case "SHALL-less acceptance criterion": {
      const root = makeTempRoot("golden-spec-no-shall");
      writeFeatureFile(root, "auth-feature", "spec.md", NO_SHALL);
      return root;
    }
    case "auto-detect sole feature": {
      const root = makeTempRoot("golden-spec-autodetect");
      writeFeatureFile(root, "only-feature", "spec.md", FILLED_SPEC);
      return root;
    }
    case "ambiguous multiple features": {
      const root = makeTempRoot("golden-spec-ambiguous");
      writeFeatureFile(root, "feature-a", "spec.md", FILLED_SPEC);
      writeFeatureFile(root, "feature-b", "spec.md", FILLED_SPEC);
      return root;
    }
    default:
      throw new Error(`unknown validate_spec golden label: ${label}`);
  }
}

describe("pyts golden: validate_spec", () => {
  for (const entry of goldenValidateSpec as GoldenEntry[]) {
    test(entry.label, () => {
      const root = buildValidateSpecRoot(entry.label);
      runGolden("skills/massa-ai/scripts/validate_spec.ts", entry, root);
    });
  }
});

// ---------------------------------------------------------------------------
// validate_tasks — tasks.md fixture trees.
// ---------------------------------------------------------------------------

function minimalTasksMd(taskBreakdown: string, executionPlan: string): string {
  return `# Test Feature Tasks

## Test Coverage Matrix

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Service | unit | all branches | \`src/**/*.test.ts\` | \`bun test\` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | after unit-only tasks | \`bun test\` |

## Execution Plan

${executionPlan}

## Task Breakdown

${taskBreakdown}
`;
}

const execPlanSimple = `### Phase 1: Foundation

\`\`\`
T1 → T2
\`\`\`
`;
const tbWellFormed = `### T1: Create thing
**What**: thing
**Where**: \`src/thing.ts\`
**Depends on**: None
**Tests**: unit
**Gate**: quick

### T2: Use thing
**What**: thing2
**Where**: \`src/thing2.ts\`
**Depends on**: T1
**Tests**: unit
**Gate**: quick
`;
const tbMissingGate = `### T1: Create thing
**What**: thing
**Where**: \`src/thing.ts\`
**Depends on**: None
**Tests**: unit
**Gate**: quick

### T2: Use thing
**What**: thing2
**Where**: \`src/thing2.ts\`
**Depends on**: T1
**Tests**: unit
`;
const execPlanTwoPhases = `### Phase 1: Foundation

\`\`\`
T1
\`\`\`

### Phase 2: Next

\`\`\`
T2
\`\`\`
`;
const tbForwardDep = `### T1: Create thing
**What**: thing
**Where**: \`src/thing.ts\`
**Depends on**: T2
**Tests**: unit
**Gate**: quick

### T2: Use thing
**What**: thing2
**Where**: \`src/thing2.ts\`
**Depends on**: None
**Tests**: unit
**Gate**: quick
`;
const tbDiagramOrder = `### T1: Create thing
**What**: thing
**Where**: \`src/thing.ts\`
**Depends on**: T2
**Tests**: unit
**Gate**: quick

### T2: Use thing
**What**: thing2
**Where**: \`src/thing2.ts\`
**Depends on**: None
**Tests**: unit
**Gate**: quick
`;
const execPlanUnfenced = `### Phase 1: Foundation

T1 → T2
`;

const FT_TASKS_MD = [
  "# Tasks",
  "",
  "## Execution Plan",
  "",
  "### Phase Execution Map",
  "",
  "```",
  "Phase 1: T1 ──→ T2",
  "Phase 2: FT1",
  "```",
  "",
  "## Test Coverage Matrix",
  "",
  "| Task | Requirement | Test |",
  "|---|---|---|",
  "| T1 | R-01 | t |",
  "",
  "## Gate Check Commands",
  "",
  "- `true`",
  "",
  "## Task Breakdown",
  "",
  "### Phase 1: Work",
  "",
  "### T1: Do the thing",
  "**Where**: `a.ts`",
  "**Depends on**: none",
  "**Tests**: t",
  "**Gate**: g",
  "**Status**: [x]",
  "",
  "### T2: Extend the thing",
  "**Where**: `b.ts`",
  "**Depends on**: T1",
  "**Tests**: t",
  "**Gate**: g",
  "**Status**: [x]",
  "",
  "### Phase 2: Fixes",
  "",
  "### FT1: Fix the thing",
  "**Where**: `a.ts`",
  "**Depends on**: T2",
  "**Tests**: t",
  "**Gate**: g",
  "**Status**: [x]",
  "",
].join("\n");

const FT_TASKS_MD_NO_GATE = FT_TASKS_MD.replace(
  "### FT1: Fix the thing\n**Where**: `a.ts`\n**Depends on**: T2\n**Tests**: t\n**Gate**: g",
  "### FT1: Fix the thing\n**Where**: `a.ts`\n**Depends on**: T2\n**Tests**: t",
);

function buildValidateTasksRoot(label: string): string {
  switch (label) {
    case "well-formed fixture": {
      const root = makeTempRoot("golden-tasks-well-formed");
      writeFeatureFile(root, "task-feature", "tasks.md", minimalTasksMd(tbWellFormed, execPlanSimple));
      return root;
    }
    case "missing Gate field": {
      const root = makeTempRoot("golden-tasks-missing-gate");
      writeFeatureFile(root, "task-feature", "tasks.md", minimalTasksMd(tbMissingGate, execPlanSimple));
      return root;
    }
    case "forward-phase dependency": {
      const root = makeTempRoot("golden-tasks-forward-dep");
      writeFeatureFile(root, "task-feature", "tasks.md", minimalTasksMd(tbForwardDep, execPlanTwoPhases));
      return root;
    }
    case "diagram-order violation": {
      const root = makeTempRoot("golden-tasks-diagram-order");
      writeFeatureFile(root, "task-feature", "tasks.md", minimalTasksMd(tbDiagramOrder, execPlanSimple));
      return root;
    }
    case "unfenced diagram (warn only)": {
      const root = makeTempRoot("golden-tasks-unfenced");
      writeFeatureFile(root, "task-feature", "tasks.md", minimalTasksMd(tbWellFormed, execPlanUnfenced));
      return root;
    }
    case "FT-prefixed header backward dep OK": {
      const root = makeTempRoot("golden-tasks-ft-ok");
      writeFeatureFile(root, "my-feature", "tasks.md", FT_TASKS_MD);
      return root;
    }
    case "FT task missing Gate reported against FT1": {
      const root = makeTempRoot("golden-tasks-ft-gate");
      writeFeatureFile(root, "my-feature", "tasks.md", FT_TASKS_MD_NO_GATE);
      return root;
    }
    default:
      throw new Error(`unknown validate_tasks golden label: ${label}`);
  }
}

describe("pyts golden: validate_tasks", () => {
  for (const entry of goldenValidateTasks as GoldenEntry[]) {
    test(entry.label, () => {
      const root = buildValidateTasksRoot(entry.label);
      runGolden("skills/massa-ai/scripts/validate_tasks.ts", entry, root);
    });
  }
});

// ---------------------------------------------------------------------------
// lessons — empty store + a frozen snapshot of .specs/lessons.json (captured
// at T11 materialization time, never re-read live: the real store keeps
// growing as agents record new lessons, so a "live copy" invocation must be
// replayed against a fixed snapshot to stay a permanent golden fixture).
//
// Exception to the otherwise read-only lessons corpus (validation FT1, Plan
// Challenge F1): two entries exercise the mutating `add` path at the one
// reachable confidence value that lands on a rounding boundary — recurrence 1
// + scope under default thresholds computes exactly 0.625, which Python's
// round-half-to-even (and lessons.ts's roundHalfEven2) stores as 0.62 while
// naive JS rounding stores 0.63. They stay deterministic because each replay
// seeds a fresh empty store and no asserted line carries a timestamp.
// ---------------------------------------------------------------------------

const BOUNDARY_ADD_ARGS = [
  "add",
  "--signal",
  "surviving_mutant",
  "--text",
  "Boundary-rounding sensor lesson for F1 golden.",
  "--scope",
  "test-strength",
  "--feature",
  "fixture-feature",
  "--source",
  "fixture.ts:1 (golden)",
];

function buildLessonsRoot(label: string): string | undefined {
  switch (label) {
    case "selftest":
      return undefined; // no --root arg, no filesystem dependency
    case "status on empty store":
    case "list on empty store":
      return makeTempRoot("golden-lessons-empty");
    case "add at the 0.625 confidence boundary (round-half-even, F1)":
      return makeTempRoot("golden-lessons-boundary-add");
    case "list after the boundary add shows conf=0.62 (F1)": {
      const root = makeTempRoot("golden-lessons-boundary-list");
      const seeded = runBun("skills/massa-ai/scripts/lessons.ts", ["--root", root, ...BOUNDARY_ADD_ARGS]);
      if (seeded.exitCode !== 0) throw new Error(`boundary seed add failed (${seeded.exitCode}): ${seeded.stdout}`);
      return root;
    }
    case "status over live .specs/lessons.json copy (all 15 lessons)":
    case "list --status all over live .specs/lessons.json copy (key/confidence parity)":
    case "list --query filter over live .specs/lessons.json copy":
    case "export stdout over live .specs/lessons.json copy": {
      const root = makeTempRoot("golden-lessons-snapshot");
      mkdirSync(join(root, ".specs"), { recursive: true });
      writeFileSync(join(root, ".specs", "lessons.json"), lessonsStoreSnapshotRaw, "utf-8");
      return root;
    }
    default:
      throw new Error(`unknown lessons golden label: ${label}`);
  }
}

describe("pyts golden: lessons", () => {
  for (const entry of goldenLessons as GoldenEntry[]) {
    test(entry.label, () => {
      const root = buildLessonsRoot(entry.label);
      runGolden("skills/massa-ai/scripts/lessons.ts", entry, root ?? REPO_ROOT);
    });
  }
});
