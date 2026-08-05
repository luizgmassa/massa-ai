/**
 * Discriminating tests for `skills/massa-ai/scripts/validate_audit_report.ts`
 * (STO-9 top validator pack, T6). Pure Bun.spawnSync against fixture markdown
 * files written to `mkdtemp` temp dirs — no PostgreSQL, no Ollama,
 * deterministic. No real historical `audits/**` artifacts exist anywhere in
 * this repo's git history (checked via `git log --all -- 'audits/**'` before
 * authoring), so every fixture below is hand-authored per Plan Challenge F4;
 * the vacuous-fixture guard is the explicit `findingCount` assertion on every
 * fixture (parsed finding population > 0).
 */
import { describe, expect, test, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
const SCRIPT = join(REPO_ROOT, "skills/massa-ai/scripts/validate_audit_report.ts");

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

function writeReport(root: string, filename: string, content: string): string {
  mkdirSync(root, { recursive: true });
  const filePath = join(root, filename);
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function run(reportPath: string, extraArgs: string[] = []): RunResult {
  const proc = Bun.spawnSync(["bun", SCRIPT, reportPath, ...extraArgs], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: proc.exitCode ?? -1,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

interface FindingSpec {
  id: string;
  title: string;
}

function findingsBlock(findings: FindingSpec[]): string {
  return findings
    .map(
      (f) => `### ${f.id}: ${f.title}

Severity: medium
Confidence: high
Location: src/example.ts:10
Evidence: concrete source evidence for ${f.id}
Impact: some risk
Simplest Fix Direction: smallest sufficient change
Verification Suggestion: \`bun test\`
`,
    )
    .join("\n");
}

const CHECKLIST = `## Verification/Test Fidelity Checklist

| Item | Evidence |
|---|---|
| Deterministic sensor | \`bun test\` |
| Result | pass |
| Coverage target | all findings above |
| Validation assets protected | tests |
| Skipped-check reason | none |
| Execution handoff | \`bun test\` |

## Execution Handoff

Fix findings in order, then re-run \`bun test\`.
`;

function singleLensFixture(
  title: string,
  workflow: string,
  findings: FindingSpec[],
  extraMeta: Record<string, string> = {},
): string {
  const extraLines = Object.entries(extraMeta)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `# ${title}

Date: 2026-08-05
Workflow: ${workflow}
ProjectId: massa-ai
WorkflowSessionId: ${workflow}-test
Target: src/example
Target Focus: src/example.ts
Scope: modified files
Git Base: main
Git Head: working-tree
Source Evidence Timestamp: 2026-08-05 10:00 local time
${extraLines ? `${extraLines}\n` : ""}Requirements Source: n/a

## Findings

${findingsBlock(findings)}
## Ruled-Out Candidates

None

## Scope And Evidence

Modified files: src/example.ts

${CHECKLIST}`;
}

// ---------------------------------------------------------------------------
// One valid fixture per report family
// ---------------------------------------------------------------------------

describe("validate_audit_report.ts — valid fixture per family", () => {
  const cases: Array<{ family: string; title: string; workflow: string; findings: FindingSpec[]; extraMeta?: Record<string, string> }> = [
    { family: "architecture", title: "Architecture Audit", workflow: "architecture-audit", findings: [{ id: "ARCH-1", title: "Layering leak" }, { id: "ARCH-2", title: "Cycle in module graph" }] },
    { family: "bugs", title: "Bugs Audit", workflow: "bugs-audit", findings: [{ id: "BUG-1", title: "Off-by-one" }, { id: "BUG-2", title: "Missing null check" }] },
    { family: "code-quality", title: "Code Quality Audit", workflow: "code-quality-audit", findings: [{ id: "CQ-1", title: "Duplicated literal" }] },
    { family: "security", title: "Security Audit", workflow: "security-audit", findings: [{ id: "SEC-1", title: "Missing authz check" }, { id: "SEC-2", title: "Secret in log line" }] },
    { family: "requirements", title: "Requirements Audit", workflow: "requirements-audit", findings: [{ id: "REQ-1", title: "Missing edge case" }] },
    { family: "tests", title: "Tests Audit", workflow: "tests-audit", findings: [{ id: "TST-1", title: "No coverage for error path" }] },
    {
      family: "maestro",
      title: "Maestro Audit",
      workflow: "maestro-audit",
      findings: [{ id: "MST-1", title: "Flaky checkout flow" }],
      extraMeta: {
        "Scenario Source": "local file",
        "Maestro CLI": "1.39.0",
        "Device/Emulator Readiness": "emulator-5554 ready",
      },
    },
    {
      family: "mobile-figma",
      title: "Mobile Figma Audit",
      workflow: "mobile-figma-audit",
      findings: [{ id: "MFM-1", title: "Wrong corner radius" }, { id: "MFM-2", title: "Missing content description" }],
      extraMeta: {
        "Repository Classification": "Android",
        "Figma Source": "https://figma.example/file/abc",
        "Figma Evidence Timestamp": "2026-08-05 09:00 local time",
      },
    },
  ];

  for (const c of cases) {
    test(`${c.family} valid fixture exits 0`, () => {
      const root = makeTempRoot(`audit-report-${c.family}`);
      const content = singleLensFixture(c.title, c.workflow, c.findings, c.extraMeta ?? {});
      const path = writeReport(root, "report.md", content);
      const r = run(path, ["--family", c.family]);
      expect(r.stdout).toContain("0 error(s)");
      expect(r.exitCode).toBe(0);
      // Vacuous-fixture guard (Plan Challenge F4): the parser must have seen
      // a non-zero finding population, not silently passed on an empty file.
      const findingsMatch = /findings=(\d+)/.exec(r.stdout);
      expect(findingsMatch).not.toBeNull();
      expect(Number(findingsMatch![1])).toBeGreaterThan(0);
    });
  }

  test("implementation composite valid fixture exits 0", () => {
    const root = makeTempRoot("audit-report-implementation");
    const content = `# Implementation Audit

Date: 2026-08-05
Workflow: implementation-audit
ProjectId: massa-ai
WorkflowSessionId: implementation-audit-test
Target: src/example
Target Focus: src/example.ts
Scope: modified files
Git Base: main
Git Head: working-tree
Source Evidence Timestamp: 2026-08-05 10:00 local time
Requirements Source: n/a

## Lens Coverage Matrix

| Lens | Status | Scope Checked | Evidence | Skipped Check Reason |
|---|---|---|---|---|
| Correctness | run | src/example.ts | see findings | none |
| Architecture | run | src/example.ts | see findings | none |

## Findings

### Correctness/BUG-1: Off-by-one

Severity: high
Confidence: high
Source Lens: Correctness
Original Finding ID: BUG-1
Location: src/example.ts:10
Evidence: concrete source evidence
Impact: some risk
Simplest Fix Direction: smallest sufficient change
Verification Suggestion: \`bun test\`

### Architecture/ARCH-1: Layering leak

Severity: medium
Confidence: high
Source Lens: Architecture
Original Finding ID: ARCH-1
Location: src/example.ts:20
Evidence: concrete source evidence
Impact: some risk
Simplest Fix Direction: smallest sufficient change
Verification Suggestion: \`bun test\`

## Ruled-Out Candidates

None

## Scope And Evidence

Modified files: src/example.ts

${CHECKLIST}`;
    const path = writeReport(root, "report.md", content);
    const r = run(path, ["--family", "implementation"]);
    expect(r.stdout).toContain("0 error(s)");
    expect(r.exitCode).toBe(0);
    const findingsMatch = /findings=(\d+)/.exec(r.stdout);
    expect(findingsMatch).not.toBeNull();
    expect(Number(findingsMatch![1])).toBeGreaterThan(0);
  });

  test("family auto-detected from Workflow: field when --family omitted", () => {
    const root = makeTempRoot("audit-report-autodetect");
    const content = singleLensFixture("Bugs Audit", "bugs-audit", [{ id: "BUG-1", title: "Off-by-one" }]);
    const path = writeReport(root, "report.md", content);
    const r = run(path); // no --family
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("family=bugs");
  });
});

// ---------------------------------------------------------------------------
// One fixture per violation class (Plan Challenge F4 + red-first below)
// ---------------------------------------------------------------------------

describe("validate_audit_report.ts — violation classes", () => {
  test("missing required metadata field (Git Base) exits 1", () => {
    const root = makeTempRoot("audit-report-missing-meta");
    const content = `# Bugs Audit

Date: 2026-08-05
Workflow: bugs-audit
ProjectId: massa-ai
WorkflowSessionId: bugs-audit-test
Target: src/example
Target Focus: src/example.ts
Scope: modified files
Git Head: working-tree
Source Evidence Timestamp: 2026-08-05 10:00 local time
Requirements Source: n/a

## Findings

${findingsBlock([{ id: "BUG-1", title: "Off-by-one" }])}
${CHECKLIST}`;
    const path = writeReport(root, "report.md", content);
    const r = run(path, ["--family", "bugs"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("missing required metadata field: Git Base");
    const findingsMatch = /findings=(\d+)/.exec(r.stdout);
    expect(Number(findingsMatch![1])).toBeGreaterThan(0);
  });

  test("malformed finding id (no dash-number) exits 1", () => {
    const root = makeTempRoot("audit-report-malformed-id");
    const content = singleLensFixture("Bugs Audit", "bugs-audit", [{ id: "BUG1", title: "Off-by-one" }]);
    const path = writeReport(root, "report.md", content);
    const r = run(path, ["--family", "bugs"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("not in the expected format");
    const findingsMatch = /findings=(\d+)/.exec(r.stdout);
    expect(Number(findingsMatch![1])).toBeGreaterThan(0);
  });

  test("duplicate finding id exits 1", () => {
    const root = makeTempRoot("audit-report-duplicate-id");
    const content = singleLensFixture("Bugs Audit", "bugs-audit", [
      { id: "BUG-1", title: "Off-by-one" },
      { id: "BUG-1", title: "Duplicate of the above" },
    ]);
    const path = writeReport(root, "report.md", content);
    const r = run(path, ["--family", "bugs"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("duplicate finding id 'BUG-1'");
  });

  test("gap in per-prefix sequencing (BUG-1, BUG-3) exits 1", () => {
    const root = makeTempRoot("audit-report-gap-sequencing");
    const content = singleLensFixture("Bugs Audit", "bugs-audit", [
      { id: "BUG-1", title: "Off-by-one" },
      { id: "BUG-3", title: "Skips BUG-2" },
    ]);
    const path = writeReport(root, "report.md", content);
    const r = run(path, ["--family", "bugs"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("missing BUG-2");
  });

  test("wrong prefix for family (ARCH-1 in a bugs report) exits 1", () => {
    const root = makeTempRoot("audit-report-wrong-prefix");
    const content = singleLensFixture("Bugs Audit", "bugs-audit", [{ id: "ARCH-1", title: "Wrong prefix" }]);
    const path = writeReport(root, "report.md", content);
    const r = run(path, ["--family", "bugs"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("expected 'BUG-N'");
  });

  test("unrecognized Area in implementation composite report exits 1", () => {
    const root = makeTempRoot("audit-report-unknown-area");
    const content = `# Implementation Audit

Date: 2026-08-05
Workflow: implementation-audit
ProjectId: massa-ai
WorkflowSessionId: implementation-audit-test
Target: src/example
Target Focus: src/example.ts
Scope: modified files
Git Base: main
Git Head: working-tree
Source Evidence Timestamp: 2026-08-05 10:00 local time
Requirements Source: n/a

## Findings

### Performance/PERF-1: Slow query

Severity: medium
Confidence: high
Source Lens: Performance
Original Finding ID: PERF-1
Location: src/example.ts:10
Evidence: concrete source evidence
Impact: some risk
Simplest Fix Direction: smallest sufficient change
Verification Suggestion: \`bun test\`

${CHECKLIST}`;
    const path = writeReport(root, "report.md", content);
    const r = run(path, ["--family", "implementation"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("is not a recognized Area");
  });

  test("Area/Prefix mismatch in implementation composite report exits 1", () => {
    const root = makeTempRoot("audit-report-area-prefix-mismatch");
    const content = `# Implementation Audit

Date: 2026-08-05
Workflow: implementation-audit
ProjectId: massa-ai
WorkflowSessionId: implementation-audit-test
Target: src/example
Target Focus: src/example.ts
Scope: modified files
Git Base: main
Git Head: working-tree
Source Evidence Timestamp: 2026-08-05 10:00 local time
Requirements Source: n/a

## Findings

### Security/BUG-1: Mislabeled area

Severity: high
Confidence: high
Source Lens: Security
Original Finding ID: BUG-1
Location: src/example.ts:10
Evidence: concrete source evidence
Impact: some risk
Simplest Fix Direction: smallest sufficient change
Verification Suggestion: \`bun test\`

${CHECKLIST}`;
    const path = writeReport(root, "report.md", content);
    const r = run(path, ["--family", "implementation"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("mixes Area 'Security' with prefix 'BUG'");
  });

  test("raw SONAR-* id in implementation composite report exits 1", () => {
    const root = makeTempRoot("audit-report-raw-sonar");
    const content = `# Implementation Audit

Date: 2026-08-05
Workflow: implementation-audit
ProjectId: massa-ai
WorkflowSessionId: implementation-audit-test
Target: src/example
Target Focus: src/example.ts
Scope: modified files
Git Base: main
Git Head: working-tree
Source Evidence Timestamp: 2026-08-05 10:00 local time
Requirements Source: n/a

## Findings

### Correctness/SONAR-4: Raw Sonar id used directly

Severity: high
Confidence: high
Source Lens: Correctness
Original Finding ID: SONAR-4
Location: src/example.ts:10
Evidence: concrete source evidence
Impact: some risk
Simplest Fix Direction: smallest sufficient change
Verification Suggestion: \`bun test\`

${CHECKLIST}`;
    const path = writeReport(root, "report.md", content);
    const r = run(path, ["--family", "implementation"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("is not an executable finding id");
  });

  test("unfilled template metadata value exits 1", () => {
    const root = makeTempRoot("audit-report-template-value");
    const content = singleLensFixture("Bugs Audit", "bugs-audit", [{ id: "BUG-1", title: "Off-by-one" }]).replace(
      "Git Base: main",
      "Git Base: <sha/ref or n/a>",
    );
    const path = writeReport(root, "report.md", content);
    const r = run(path, ["--family", "bugs"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("unfilled template value");
  });
});
