/**
 * Discriminating tests for the ported TLC 3.3.0 spec-driven validator scripts
 * under `skills/massa-ai/scripts/`. Pure Bun.spawnSync(["python3", ...]) against
 * fixture `.specs/` trees built in `mkdtemp` temp dirs — no PostgreSQL, no
 * Ollama, deterministic (D2). Runs from `bun run test:scripts` / directly via
 * `bun test scripts/__tests__/spec-driven-validators.test.ts`.
 */
import { describe, expect, test, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { norm as lessonsNorm } from "../../skills/massa-ai/scripts/lessons.ts";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");

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

interface PyResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

type ScriptRuntime = "python" | "bun";

// Per-script runtime resolution (PTS-05/D3 suite rewire mechanics): each port
// task (T4-T9) flips exactly one basename from "python" to "bun" as its `.ts`
// twin lands; after T9 every entry resolves to "bun".
const SCRIPT_RUNTIME: Record<string, ScriptRuntime> = {
  validate_spec: "bun",
  validate_tasks: "bun",
  check_commit: "bun",
  validate_state: "bun",
  lessons: "bun",
  check_specs_delivered: "bun",
  validate_design: "bun",
};

// -B: never write __pycache__ into the source tree — skill-artifact --check
// diffs full directory inventories and would flag the .pyc files as drift.
// scriptBaseRelPath is extension-less; the current entry point (`.py` under
// `python3 -B`, or `.ts` under `bun`) is resolved by basename via SCRIPT_RUNTIME.
function runPy(scriptBaseRelPath: string, args: string[], cwd: string = REPO_ROOT): PyResult {
  const basename = scriptBaseRelPath.split("/").pop()!;
  const runtime = SCRIPT_RUNTIME[basename] ?? "python";
  const scriptPath =
    runtime === "bun" ? join(REPO_ROOT, `${scriptBaseRelPath}.ts`) : join(REPO_ROOT, `${scriptBaseRelPath}.py`);
  const cmd = runtime === "bun" ? ["bun", scriptPath, ...args] : ["python3", "-B", scriptPath, ...args];
  const proc = Bun.spawnSync(cmd, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: proc.exitCode ?? -1,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

const VALIDATE_SPEC = "skills/massa-ai/scripts/validate_spec";
const VALIDATE_DESIGN = "skills/massa-ai/scripts/validate_design";
const VALIDATE_TASKS = "skills/massa-ai/scripts/validate_tasks";
const CHECK_COMMIT = "skills/massa-ai/scripts/check_commit";
const VALIDATE_STATE = "skills/massa-ai/scripts/validate_state";
const LESSONS_PY = "skills/massa-ai/scripts/lessons";
const CHECK_SPECS_DELIVERED = "skills/massa-ai/scripts/check_specs_delivered";

// ---------------------------------------------------------------------------
// T1: validate_spec.py (SYNC-01 AC1)
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

describe("validate_spec.py (T1, SYNC-01 AC1)", () => {
  test("filled fixture exits 0", () => {
    const root = makeTempRoot("validate-spec-filled");
    writeFeatureFile(root, "auth-feature", "spec.md", FILLED_SPEC);
    const r = runPy(VALIDATE_SPEC, ["--root", root]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("0 error(s)");
  });

  test("missing required section exits 1", () => {
    const root = makeTempRoot("validate-spec-missing-section");
    const withoutOutOfScope = FILLED_SPEC.replace(
      /## Out of Scope[\s\S]*?\n\n(?=## Assumptions)/,
      "",
    );
    expect(withoutOutOfScope).not.toContain("## Out of Scope");
    writeFeatureFile(root, "auth-feature", "spec.md", withoutOutOfScope);
    const r = runPy(VALIDATE_SPEC, ["--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("missing required section: ## Out of Scope");
  });

  test("SHALL-less acceptance criterion exits 1", () => {
    const root = makeTempRoot("validate-spec-no-shall");
    const noShall = FILLED_SPEC.replace(
      "1. WHEN the user submits valid credentials THEN the system SHALL authenticate the user.",
      "1. WHEN the user submits valid credentials THEN the system logs the user in.",
    );
    writeFeatureFile(root, "auth-feature", "spec.md", noShall);
    const r = runPy(VALIDATE_SPEC, ["--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("no SHALL");
  });

  test("auto-detects the sole feature under <root>/.specs/features/", () => {
    const root = makeTempRoot("validate-spec-autodetect");
    writeFeatureFile(root, "only-feature", "spec.md", FILLED_SPEC);
    const r = runPy(VALIDATE_SPEC, ["--root", root]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain(join("only-feature", "spec.md"));
  });

  test("multiple features under auto-detect are refused, not guessed", () => {
    const root = makeTempRoot("validate-spec-ambiguous");
    writeFeatureFile(root, "feature-a", "spec.md", FILLED_SPEC);
    writeFeatureFile(root, "feature-b", "spec.md", FILLED_SPEC);
    const r = runPy(VALIDATE_SPEC, ["--root", root]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr + r.stdout).toContain("multiple features found");
  });
});

// ---------------------------------------------------------------------------
// T2: validate_tasks.py (SYNC-01 AC2)
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

describe("validate_tasks.py (T2, SYNC-01 AC2)", () => {
  test("live fixture: this feature's own tasks.md exits 0 (dogfood)", () => {
    const r = runPy(VALIDATE_TASKS, ["tlc-330-harness-update", "--root", "."]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("0 error(s)");
  });

  test("well-formed fixture exits 0", () => {
    const root = makeTempRoot("validate-tasks-filled");
    const executionPlan = `### Phase 1: Foundation

\`\`\`
T1 → T2
\`\`\`
`;
    const taskBreakdown = `### T1: Create thing
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
    writeFeatureFile(root, "task-feature", "tasks.md", minimalTasksMd(taskBreakdown, executionPlan));
    const r = runPy(VALIDATE_TASKS, ["--root", root]);
    expect(r.exitCode).toBe(0);
  });

  test("missing Gate field exits 1, names the task", () => {
    const root = makeTempRoot("validate-tasks-missing-gate");
    const executionPlan = `### Phase 1: Foundation

\`\`\`
T1 → T2
\`\`\`
`;
    const taskBreakdown = `### T1: Create thing
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
    writeFeatureFile(root, "task-feature", "tasks.md", minimalTasksMd(taskBreakdown, executionPlan));
    const r = runPy(VALIDATE_TASKS, ["--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("T2: missing `Gate` field");
  });

  test("dependency on a later phase exits 1, names the task", () => {
    const root = makeTempRoot("validate-tasks-forward-dep");
    const executionPlan = `### Phase 1: Foundation

\`\`\`
T1
\`\`\`

### Phase 2: Next

\`\`\`
T2
\`\`\`
`;
    const taskBreakdown = `### T1: Create thing
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
    writeFeatureFile(root, "task-feature", "tasks.md", minimalTasksMd(taskBreakdown, executionPlan));
    const r = runPy(VALIDATE_TASKS, ["--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("T1 (phase 1) depends on T2 (phase 2)");
  });

  test("diagram-order violation (dep placed after the dependent task) exits 1, names the task", () => {
    const root = makeTempRoot("validate-tasks-diagram-order");
    const executionPlan = `### Phase 1: Foundation

\`\`\`
T1 → T2
\`\`\`
`;
    const taskBreakdown = `### T1: Create thing
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
    writeFeatureFile(root, "task-feature", "tasks.md", minimalTasksMd(taskBreakdown, executionPlan));
    const r = runPy(VALIDATE_TASKS, ["--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("T1 declares `Depends on: T2`");
  });

  test("unfenced diagram (unparseable) only warns, does not fail an otherwise valid fixture", () => {
    const root = makeTempRoot("validate-tasks-no-fence");
    const executionPlan = `### Phase 1: Foundation

T1 → T2
`;
    const taskBreakdown = `### T1: Create thing
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
    writeFeatureFile(root, "task-feature", "tasks.md", minimalTasksMd(taskBreakdown, executionPlan));
    const r = runPy(VALIDATE_TASKS, ["--root", root]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("diagram arrows not parsed confidently");
  });
});

// ---------------------------------------------------------------------------
// T3: check_commit.py (SYNC-01 AC3)
// ---------------------------------------------------------------------------

function runCheckCommit(message: string): PyResult {
  return runPy(CHECK_COMMIT, ["--message", message]);
}

describe("check_commit.py (T3, SYNC-01 AC3)", () => {
  test("valid Conventional Commits header exits 0", () => {
    const r = runCheckCommit("feat(auth): add email validation");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("check_commit: OK");
  });

  test("valid massa-ai [KEY] feat(x): y prefixed header exits 0", () => {
    const r = runCheckCommit("[SA-142] feat(auth): reject expired tokens");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("check_commit: OK");
  });

  test("valid [KEY] prefixed header from spec's own example exits 0", () => {
    const r = runCheckCommit("[SA-142] fix(auth): reject expired tokens");
    expect(r.exitCode).toBe(0);
  });

  test("non-Conventional-Commit header exits 1", () => {
    const r = runCheckCommit("updated the auth module");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("does not match");
  });

  test("disallowed type exits 1", () => {
    const r = runCheckCommit("feature(auth): add email validation");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("is not one of");
  });

  test("uppercase description start exits 1", () => {
    const r = runCheckCommit("feat(auth): Add email validation");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("should start lowercase");
  });

  test("description ending with a period exits 1", () => {
    const r = runCheckCommit("feat(auth): add email validation.");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("should not end with a period");
  });

  test("breaking marker without BREAKING CHANGE footer exits 1", () => {
    const r = runCheckCommit("feat(auth)!: change token format");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("BREAKING CHANGE");
  });

  test("breaking marker with BREAKING CHANGE footer exits 0", () => {
    const r = runCheckCommit("feat(auth)!: change token format\n\nBREAKING CHANGE: tokens are now opaque");
    expect(r.exitCode).toBe(0);
  });

  test("empty message exits 2 (usage error)", () => {
    const r = runCheckCommit("");
    expect(r.exitCode).toBe(2);
  });

  test("header over 72 chars only warns, does not fail an otherwise-valid header", () => {
    const longDesc = "a".repeat(70);
    const r = runCheckCommit(`feat(auth): ${longDesc}`);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("WARN");
  });
});

// ---------------------------------------------------------------------------
// T4: validate_state.py (SYNC-01 AC4)
// ---------------------------------------------------------------------------

const DONE_TASKS_MD = `## Test Coverage Matrix

## Gate Check Commands

## Execution Plan

### Phase 1: Foundation

\`\`\`
T1
\`\`\`

## Task Breakdown

### T1: Do the thing
**What**: thing
**Where**: \`src/thing.ts\`
**Depends on**: None
**Tests**: unit
**Gate**: quick

- [x] done
`;

const PASS_VALIDATION_MD = `# Feature Validation

## Summary

**Overall**: ✅ Ready

**Result**: PASS

**Evidence**: \`src/thing.ts:42\` — \`expect(result).toBe(true)\`
`;

const FAIL_VALIDATION_MD = `# Feature Validation

## Summary

**Result**: FAIL

**Issues found**: gap in coverage
`;

const UNFILLED_VALIDATION_MD = `# Feature Validation

## Summary

**Overall**: ✅ Ready | ⚠️ Issues | ❌ Not Ready

**Result**: [PASS | FAIL]
`;

const NO_EVIDENCE_VALIDATION_MD = `# Feature Validation

## Summary

**Result**: PASS

**What works**: everything, allegedly
`;

describe("validate_state.py (T4, SYNC-01 AC4)", () => {
  test("missing validation.md exits 1", () => {
    const root = makeTempRoot("validate-state-missing");
    writeFeatureFile(root, "my-feature", "tasks.md", DONE_TASKS_MD);
    const r = runPy(VALIDATE_STATE, ["--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("no validation.md");
  });

  test("FAIL verdict exits 1", () => {
    const root = makeTempRoot("validate-state-fail");
    writeFeatureFile(root, "my-feature", "tasks.md", DONE_TASKS_MD);
    writeFeatureFile(root, "my-feature", "validation.md", FAIL_VALIDATION_MD);
    const r = runPy(VALIDATE_STATE, ["--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("verdict is FAIL");
  });

  test("Summary FAIL with a diverging sensor PASS sub-line reads as FAIL, not unfilled (FT2)", () => {
    const root = makeTempRoot("validate-state-diverging");
    writeFeatureFile(root, "my-feature", "tasks.md", DONE_TASKS_MD);
    // Realistic report shape: overall verdict FAIL for a gap unrelated to the
    // sensor, while the Discrimination Sensor's own Result sub-line says PASS.
    // An unscoped whole-document scan sees both words and misreads this as an
    // unfilled "[PASS | FAIL]" template placeholder.
    writeFeatureFile(
      root,
      "my-feature",
      "validation.md",
      [
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
      ].join("\n"),
    );
    const r = runPy(VALIDATE_STATE, ["--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("verdict is FAIL");
    expect(r.stdout).not.toContain("template placeholder");
  });

  test("unfilled template placeholder verdict exits 1", () => {
    const root = makeTempRoot("validate-state-unfilled");
    writeFeatureFile(root, "my-feature", "tasks.md", DONE_TASKS_MD);
    writeFeatureFile(root, "my-feature", "validation.md", UNFILLED_VALIDATION_MD);
    const r = runPy(VALIDATE_STATE, ["--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("template placeholder");
  });

  test("PASS with no file:line evidence exits 1", () => {
    const root = makeTempRoot("validate-state-no-evidence");
    writeFeatureFile(root, "my-feature", "tasks.md", DONE_TASKS_MD);
    writeFeatureFile(root, "my-feature", "validation.md", NO_EVIDENCE_VALIDATION_MD);
    const r = runPy(VALIDATE_STATE, ["--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("cites no file:line evidence");
  });

  test("PASS with file:line evidence exits 0", () => {
    const root = makeTempRoot("validate-state-pass");
    writeFeatureFile(root, "my-feature", "tasks.md", DONE_TASKS_MD);
    writeFeatureFile(root, "my-feature", "validation.md", PASS_VALIDATION_MD);
    const r = runPy(VALIDATE_STATE, ["--root", root]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("0 error(s)");
  });

  test("legacy-shaped feature (no tasks.md, no validation.md) does not crash (R2)", () => {
    const root = makeTempRoot("validate-state-legacy");
    // Legacy feature: only a spec.md, predating tasks.md/validation.md convention.
    writeFeatureFile(root, "legacy-feature", "spec.md", "# Legacy Feature\n");
    // A second, properly completed feature so cross-check mode (>1 feature dir) runs.
    writeFeatureFile(root, "done-feature", "tasks.md", DONE_TASKS_MD);
    writeFeatureFile(root, "done-feature", "validation.md", PASS_VALIDATION_MD);
    const r = runPy(VALIDATE_STATE, ["--root", root]);
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toBe("");
    // The legacy dir never "appears complete" (no tasks.md) so it's excluded,
    // not flagged - cross-check mode only gates features that look done.
    expect(r.stdout).not.toContain("legacy-feature");
  });

  test("explicit feature name resolves under <root>/.specs/features/<name>/", () => {
    const root = makeTempRoot("validate-state-named");
    writeFeatureFile(root, "feature-a", "tasks.md", DONE_TASKS_MD);
    writeFeatureFile(root, "feature-a", "validation.md", PASS_VALIDATION_MD);
    writeFeatureFile(root, "feature-b", "tasks.md", DONE_TASKS_MD);
    writeFeatureFile(root, "feature-b", "validation.md", FAIL_VALIDATION_MD);
    const r = runPy(VALIDATE_STATE, ["feature-b", "--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("feature-b");
    expect(r.stdout).not.toContain("verdict is FAIL across [feature-a");
  });
});

// ---------------------------------------------------------------------------
// T5: lessons.py Unicode _norm + selftest (SYNC-10 AC1)
// ---------------------------------------------------------------------------

describe("lessons.py selftest (T5, SYNC-10 AC1)", () => {
  test("selftest subcommand exits 0", () => {
    const r = runPy(LESSONS_PY, ["selftest"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("selftest_norm: ok");
  });

  // lessons.ts exports `norm` directly (D2/T9) - no need to spawn a subprocess
  // and import a module by path the way the Python original required.
  function normOf(text: string): string {
    return lessonsNorm(text);
  }

  test("diacritic merge: Portuguese text with/without diacritics normalizes to the same key", () => {
    const withDiacritics = normOf("Não use datas locais");
    const withoutDiacritics = normOf("Nao use datas locais");
    expect(withDiacritics).toBe(withoutDiacritics);
    expect(withDiacritics).toBe("nao use datas locais");
  });

  test("non-Latin merge: café/cafe collapse to the same key (ASCII-only regex could not do this)", () => {
    expect(normOf("café")).toBe(normOf("cafe"));
    expect(normOf("café")).toBe("cafe");
  });

  test("non-collision: distinct Japanese sentences normalize to distinct, non-empty keys", () => {
    const jp1 = normOf("日本語の文です");
    const jp2 = normOf("別の日本語文");
    expect(jp1).not.toBe("");
    expect(jp2).not.toBe("");
    expect(jp1).not.toBe(jp2);
  });
});

// ---------------------------------------------------------------------------
// C5 (Plan Challenge, GEN-02 AC2): template-conformance tests. Extract each
// validator's required-section/field expectations and assert the live
// template blocks in specify.md/tasks.md/validate.md still satisfy them, so a
// future edit to those templates that breaks a validator's structural
// assumptions fails HERE in test:scripts instead of silently drifting.
// ---------------------------------------------------------------------------

/** Extract the fenced ```markdown block that follows the first line containing `headingMarker`. */
function extractFencedMarkdownBlock(fileContent: string, headingMarker: string): string {
  const lines = fileContent.split("\n");
  const headingIdx = lines.findIndex((l) => l.includes(headingMarker));
  if (headingIdx === -1) {
    throw new Error(`heading marker not found: ${headingMarker}`);
  }
  const fenceStart = lines.findIndex((l, i) => i > headingIdx && l.trim() === "```markdown");
  if (fenceStart === -1) {
    throw new Error(`no \`\`\`markdown fence found after heading: ${headingMarker}`);
  }
  const fenceEnd = lines.findIndex((l, i) => i > fenceStart && l.trim() === "```");
  if (fenceEnd === -1) {
    throw new Error(`unterminated \`\`\`markdown fence after heading: ${headingMarker}`);
  }
  return lines.slice(fenceStart + 1, fenceEnd).join("\n");
}

const SPECIFY_MD = readFileSync(join(REPO_ROOT, "skills/massa-ai/references/spec-driven/specify.md"), "utf-8");
const TASKS_REF_MD = readFileSync(join(REPO_ROOT, "skills/massa-ai/references/spec-driven/tasks.md"), "utf-8");
const VALIDATE_REF_MD = readFileSync(join(REPO_ROOT, "skills/massa-ai/references/spec-driven/validate.md"), "utf-8");

// Mirrors validate_spec.py's REQUIRED_SECTIONS / validate_tasks.py's REQUIRED_SECTIONS.
// Kept literal (not re-parsed from the .py source) so a future validator edit that
// silently drops a required section is also visible in this test's own diff.
const VALIDATE_SPEC_REQUIRED_SECTIONS = [
  "Problem Statement",
  "Out of Scope",
  "Assumptions & Open Questions",
  "User Stories",
  "Requirement Traceability",
];
const VALIDATE_TASKS_REQUIRED_SECTIONS = ["Test Coverage Matrix", "Gate Check Commands", "Execution Plan", "Task Breakdown"];

describe("template-conformance (C5, GEN-02 AC2)", () => {
  test("specify.md's spec.md template block satisfies validate_spec.py's REQUIRED_SECTIONS", () => {
    const template = extractFencedMarkdownBlock(SPECIFY_MD, "## Template: `.specs/features/<slug>/spec.md`");
    for (const section of VALIDATE_SPEC_REQUIRED_SECTIONS) {
      expect(template).toContain(`## ${section}`);
    }
    // Run the real validator against the extracted template as a fixture and
    // assert none of validate_spec.py's "missing required section" errors fire.
    const root = makeTempRoot("c5-spec-template");
    writeFeatureFile(root, "template-feature", "spec.md", template);
    const r = runPy(VALIDATE_SPEC, ["--root", root]);
    expect(r.stdout).not.toContain("missing required section");
  });

  test("tasks.md's tasks.md template block satisfies validate_tasks.py's REQUIRED_SECTIONS", () => {
    const template = extractFencedMarkdownBlock(TASKS_REF_MD, "## Template: `.specs/features/<slug>/tasks.md`");
    for (const section of VALIDATE_TASKS_REQUIRED_SECTIONS) {
      expect(template).toMatch(new RegExp(`#{1,4}\\s+${section}\\b`));
    }
    const root = makeTempRoot("c5-tasks-template");
    writeFeatureFile(root, "template-feature", "tasks.md", template);
    const r = runPy(VALIDATE_TASKS, ["--root", root]);
    expect(r.stdout).not.toContain("missing required section");
  });

  test("validate.md's validation.md report template satisfies validate_state.py's verdict + evidence detection", () => {
    const template = extractFencedMarkdownBlock(VALIDATE_REF_MD, "## Validation Report Template (`.specs/features/<slug>/validation.md`)");
    // validate_state.py's _verdict() only scans lines matching either the
    // '## Validation' heading shape or a '**Result**:' line.
    const verdictCandidateRe = /^#{1,4}\s*validation\b/im;
    const resultLineRe = /\*{0,2}result\*{0,2}\s*:/im;
    expect(verdictCandidateRe.test(template) || resultLineRe.test(template)).toBe(true);
    // EVIDENCE_RE: a file:line citation must be structurally representable in the template.
    const evidenceRe = /[\w./-]+\.[A-Za-z0-9]+:\d+/;
    expect(evidenceRe.test(template)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T6: check_specs_delivered.py (GATE-02 AC1-2)
// ---------------------------------------------------------------------------

function git(args: string[], cwd: string): PyResult {
  const proc = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  return {
    exitCode: proc.exitCode ?? -1,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

function initGitRepo(root: string): void {
  git(["init", "-q", "-b", "main"], root);
  git(["config", "user.email", "test@example.com"], root);
  git(["config", "user.name", "Test"], root);
  git(["config", "commit.gpgsign", "false"], root);
}

function commitAll(root: string, message: string): void {
  git(["add", "-A"], root);
  git(["commit", "-q", "-m", message], root);
}

const CLEAN_STATE_FILES: Record<string, string> = {
  [join(".specs", "project", "STATE.md")]: "# State\n",
  [join(".specs", "HANDOFF.md")]: "# Handoff\n",
  [join(".specs", "project", "FEATURES.json")]: "{}\n",
};

function writeStateFiles(root: string): void {
  for (const [rel, content] of Object.entries(CLEAN_STATE_FILES)) {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf-8");
  }
}

describe("check_specs_delivered.py (T6, GATE-02 AC1-2)", () => {
  test("clean + tracked exits 0, prints the checked population", () => {
    const root = makeTempRoot("delivered-clean");
    initGitRepo(root);
    writeFeatureFile(root, "my-feature", "spec.md", "# Spec\n");
    writeStateFiles(root);
    commitAll(root, "init");
    const r = runPy(CHECK_SPECS_DELIVERED, ["my-feature", "--root", root]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("0 error(s)");
    expect(r.stdout).toContain("checked 4 path(s)");
    expect(r.stdout).toContain("my-feature/spec.md");
    expect(r.stdout).toContain(".specs/project/STATE.md");
    expect(r.stdout).toContain(".specs/HANDOFF.md");
    expect(r.stdout).toContain(".specs/project/FEATURES.json");
  });

  test("dirty (modified-but-uncommitted) under .specs/ exits 1, names the path", () => {
    const root = makeTempRoot("delivered-dirty");
    initGitRepo(root);
    const specPath = writeFeatureFile(root, "my-feature", "spec.md", "# Spec\n");
    writeStateFiles(root);
    commitAll(root, "init");
    writeFileSync(specPath, "# Spec\n\nModified after commit, not re-committed.\n", "utf-8");
    const r = runPy(CHECK_SPECS_DELIVERED, ["my-feature", "--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("uncommitted/untracked under .specs/");
    expect(r.stdout).toContain("my-feature/spec.md");
  });

  test("untracked file under .specs/ exits 1, names the path", () => {
    const root = makeTempRoot("delivered-untracked");
    initGitRepo(root);
    writeFeatureFile(root, "my-feature", "spec.md", "# Spec\n");
    writeStateFiles(root);
    commitAll(root, "init");
    writeFeatureFile(root, "my-feature", "design.md", "# Design\n"); // never `git add`ed
    const r = runPy(CHECK_SPECS_DELIVERED, ["my-feature", "--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("uncommitted/untracked under .specs/");
    expect(r.stdout).toContain("design.md");
  });

  test("required artifact never written (absent, not dirty) exits 1, names the path (edge case)", () => {
    const root = makeTempRoot("delivered-absent");
    initGitRepo(root);
    writeFeatureFile(root, "my-feature", "spec.md", "# Spec\n");
    // Only two of the three state files are ever written - FEATURES.json never existed.
    const stateDir = join(root, ".specs", "project");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, "STATE.md"), "# State\n", "utf-8");
    writeFileSync(join(root, ".specs", "HANDOFF.md"), "# Handoff\n", "utf-8");
    commitAll(root, "init");
    // .specs/ is fully porcelain-clean here - the absence must still fail.
    const status = git(["status", "--porcelain", "--", ".specs/"], root);
    expect(status.stdout.trim()).toBe("");
    const r = runPy(CHECK_SPECS_DELIVERED, ["my-feature", "--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("not tracked on HEAD");
    expect(r.stdout).toContain("FEATURES.json");
  });

  test("optional feature artifacts (context/design/tasks/validation) are required only when present on disk", () => {
    const root = makeTempRoot("delivered-optional");
    initGitRepo(root);
    writeFeatureFile(root, "my-feature", "spec.md", "# Spec\n");
    writeFeatureFile(root, "my-feature", "tasks.md", "# Tasks\n");
    writeStateFiles(root);
    commitAll(root, "init");
    const r = runPy(CHECK_SPECS_DELIVERED, ["my-feature", "--root", root]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("checked 5 path(s)"); // spec + tasks + 3 state files
    expect(r.stdout).toContain("my-feature/tasks.md");
    expect(r.stdout).not.toContain("my-feature/design.md");
  });
});

// ---------------------------------------------------------------------------
// FT4: validate_tasks.py parses letter-prefixed task ids (IT2-01 closure)
// ---------------------------------------------------------------------------

describe("validate_tasks.py fix-task headers (FT4, IT2-01)", () => {
  // Defect shape from the live contract (iteration-4 sensor finding): the FT
  // task sits in a LATER phase and depends on the last task of the previous
  // phase. An unrecognized `### FT1:` header folds its `Depends on: T2` line
  // into T2's own record, which the ordering check reports as T2 depending on
  // itself — the exact false ERROR observed on this feature's tasks.md.
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

  test("FT-prefixed header is its own task: backward dep on T2 passes, no self-dep false positive", () => {
    const root = makeTempRoot("validate-tasks-ft-ok");
    writeFeatureFile(root, "my-feature", "tasks.md", FT_TASKS_MD);
    const r = runPy(VALIDATE_TASKS, ["--root", root]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).not.toContain("declares `Depends on`");
  });

  test("FT task missing Gate is reported against FT1, not folded into T1", () => {
    const root = makeTempRoot("validate-tasks-ft-gate");
    writeFeatureFile(
      root,
      "my-feature",
      "tasks.md",
      FT_TASKS_MD.replace("### FT1: Fix the thing\n**Where**: `a.ts`\n**Depends on**: T2\n**Tests**: t\n**Gate**: g", "### FT1: Fix the thing\n**Where**: `a.ts`\n**Depends on**: T2\n**Tests**: t"),
    );
    const r = runPy(VALIDATE_TASKS, ["--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("FT1");
  });
});

// ---------------------------------------------------------------------------
// T7: validate_design.ts (STO-9 top validator pack)
// ---------------------------------------------------------------------------

const FILLED_DESIGN = `# Test Feature Design

**Spec**: \`.specs/features/test-feature/spec.md\`
**Status**: Draft

## Design Summary

One paragraph describing the approach: extract the shared validator into a
new script and wire it into the two workflows that currently restate its
checklist inline.

## Risks & Concerns

| Concern | Location (file:line) | Impact | Mitigation |
| ------- | -------------------- | ------ | ---------- |
| Tight coupling between parser and CLI | \`src/tool.ts:42\` | harder to unit test | extract the parser into its own pure function |

## Tech Decisions (only non-obvious ones)

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Validator placement | \`skills/massa-ai/scripts/\` | ships with the skill, beside validate_spec.ts |
`;

describe("validate_design.ts (T7, STO-9)", () => {
  test("filled fixture exits 0", () => {
    const root = makeTempRoot("validate-design-filled");
    writeFeatureFile(root, "test-feature", "design.md", FILLED_DESIGN);
    const r = runPy(VALIDATE_DESIGN, ["--root", root]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("0 error(s)");
  });

  test("missing Design Summary section exits 1", () => {
    const root = makeTempRoot("validate-design-missing-summary");
    const withoutSummary = FILLED_DESIGN.replace(
      /## Design Summary[\s\S]*?\n\n(?=## Risks)/,
      "",
    );
    expect(withoutSummary).not.toContain("## Design Summary");
    writeFeatureFile(root, "test-feature", "design.md", withoutSummary);
    const r = runPy(VALIDATE_DESIGN, ["--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("missing required section: ## Design Summary");
  });

  test("missing Risks & Concerns section exits 1", () => {
    const root = makeTempRoot("validate-design-missing-risks");
    const withoutRisks = FILLED_DESIGN.replace(
      /## Risks & Concerns[\s\S]*?\n\n(?=## Tech Decisions)/,
      "",
    );
    expect(withoutRisks).not.toContain("## Risks & Concerns");
    writeFeatureFile(root, "test-feature", "design.md", withoutRisks);
    const r = runPy(VALIDATE_DESIGN, ["--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("missing required section: ## Risks & Concerns");
  });

  test("missing Tech Decisions section exits 1", () => {
    const root = makeTempRoot("validate-design-missing-tech-decisions");
    const withoutTechDecisions = FILLED_DESIGN.replace(/## Tech Decisions[\s\S]*$/, "");
    expect(withoutTechDecisions).not.toContain("## Tech Decisions");
    writeFeatureFile(root, "test-feature", "design.md", withoutTechDecisions);
    const r = runPy(VALIDATE_DESIGN, ["--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("missing required section: ## Tech Decisions");
  });

  test("empty mitigation cell in Risks & Concerns exits 1", () => {
    const root = makeTempRoot("validate-design-empty-mitigation");
    const emptyMitigation = FILLED_DESIGN.replace(
      "| Tight coupling between parser and CLI | `src/tool.ts:42` | harder to unit test | extract the parser into its own pure function |",
      "| Tight coupling between parser and CLI | `src/tool.ts:42` | harder to unit test | |",
    );
    writeFeatureFile(root, "test-feature", "design.md", emptyMitigation);
    const r = runPy(VALIDATE_DESIGN, ["--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("empty or unfilled Mitigation cell");
  });

  test("placeholder mitigation cell in Risks & Concerns exits 1", () => {
    const root = makeTempRoot("validate-design-placeholder-mitigation");
    const placeholderMitigation = FILLED_DESIGN.replace(
      "| Tight coupling between parser and CLI | `src/tool.ts:42` | harder to unit test | extract the parser into its own pure function |",
      "| Tight coupling between parser and CLI | `src/tool.ts:42` | harder to unit test | [TODO] |",
    );
    writeFeatureFile(root, "test-feature", "design.md", placeholderMitigation);
    const r = runPy(VALIDATE_DESIGN, ["--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("empty or unfilled Mitigation cell");
  });

  test("'None found' Risks & Concerns with zero rows is a valid entry (exits 0)", () => {
    const root = makeTempRoot("validate-design-none-found");
    const noneFound = FILLED_DESIGN.replace(
      /## Risks & Concerns[\s\S]*?\n\n(?=## Tech Decisions)/,
      "## Risks & Concerns\n\n> None found — is a valid entry.\n\n",
    );
    writeFeatureFile(root, "test-feature", "design.md", noneFound);
    const r = runPy(VALIDATE_DESIGN, ["--root", root]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("0 error(s)");
  });

  test("empty Risks & Concerns with no 'None found' marker warns, does not error", () => {
    const root = makeTempRoot("validate-design-ambiguous-empty");
    const ambiguousEmpty = FILLED_DESIGN.replace(
      /## Risks & Concerns[\s\S]*?\n\n(?=## Tech Decisions)/,
      "## Risks & Concerns\n\n",
    );
    writeFeatureFile(root, "test-feature", "design.md", ambiguousEmpty);
    const r = runPy(VALIDATE_DESIGN, ["--root", root]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("0 error(s)");
    expect(r.stdout).toContain("ambiguous");
  });

  test("auto-detects the sole feature under <root>/.specs/features/", () => {
    const root = makeTempRoot("validate-design-autodetect");
    writeFeatureFile(root, "only-feature", "design.md", FILLED_DESIGN);
    const r = runPy(VALIDATE_DESIGN, ["--root", root]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain(join("only-feature", "design.md"));
  });
});
