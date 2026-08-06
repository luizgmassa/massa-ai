/**
 * Behavioral suite for skills/massa-ai/scripts/check_fix_closure.ts — the
 * fix-family closure gate (audit-report-io.md, Fix Closure Report Contract).
 *
 * Deliberately NOT part of the frozen pyts-golden corpus: this script has no
 * python twin and its contract is behavioral (git state + markdown shape),
 * so it gets a live scratch-repo suite in the check_specs_delivered style.
 */

import { describe, test, expect } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
const CLI = join(REPO_ROOT, "skills", "massa-ai", "scripts", "check_fix_closure.ts");

interface Run {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function run(args: string[], cwd: string = REPO_ROOT): Run {
  const proc = Bun.spawnSync(["bun", CLI, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  return { exitCode: proc.exitCode ?? -1, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

function git(args: string[], cwd: string): void {
  const proc = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if ((proc.exitCode ?? -1) !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${proc.stderr.toString()}`);
  }
}

function initRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "fix-closure-"));
  git(["init", "-q", "-b", "main"], root);
  git(["config", "user.email", "test@example.com"], root);
  git(["config", "user.name", "Test"], root);
  git(["config", "commit.gpgsign", "false"], root);
  return root;
}

function write(root: string, rel: string, content: string): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, "utf-8");
}

function commitAll(root: string): void {
  git(["add", "-A"], root);
  git(["commit", "-q", "-m", "commit"], root);
}

const SOURCE_REPORT = `# Security Audit

Date: 2026-08-06
Workflow: security-audit
ProjectId: p
WorkflowSessionId: s
Target: t
Target Focus: f
Scope: modified files
Git Base: n/a
Git Head: n/a
Source Evidence Timestamp: 2026-08-06 10:00
Requirements Source: n/a

## Findings

### SEC-1: hardcoded token

Severity: high
Confidence: high
Location: src/a.ts:1
Evidence: e
Impact: i
Simplest Fix Direction: d
Verification Suggestion: v

### SEC-2: missing auth check

Severity: high
Confidence: high
Location: src/b.ts:1
Evidence: e
Impact: i
Simplest Fix Direction: d
Verification Suggestion: v
`;

const REPORT_REL = "audits/security/2026-08-06 security-audit.md";
const CLOSURE_REL = "audits/security/2026-08-06 security-fix-closure.md";

function closureBody(rows: string[]): string {
  return [
    "# Security Fix Closure",
    "",
    "Date: 2026-08-06",
    "Workflow: security-fix",
    "ProjectId: p",
    "WorkflowSessionId: s",
    `Source Report: ${REPORT_REL}`,
    "Finding Selector: all",
    "",
    "## Closure Matrix",
    "",
    "| Finding ID | Status | Changed Files | Command/Artifact | Result | Skipped Reason | Discrimination Sensor | Independent Verifier | Ladder Level | Validation Assets Protected | Residual Risk | Next Step |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

const ROW_SEC1_FIXED =
  "| SEC-1 | fixed | src/a.ts | `bun test src/a.test.ts` | 4 pass, 0 fail | none | 2/2 killed | PASS (massa-ai-verification-agent) | 3 | tests | none | - |";
const ROW_SEC2_FIXED =
  "| SEC-2 | fixed | src/b.ts | `bun test src/b.test.ts` | 6 pass, 0 fail | none | 1/1 killed | PASS (massa-ai-verification-agent) | 3 | tests | none | - |";

describe("check_fix_closure.ts", () => {
  test("complete committed closure exits 0 and prints the selected population", () => {
    const root = initRepo();
    write(root, REPORT_REL, SOURCE_REPORT);
    write(root, CLOSURE_REL, closureBody([ROW_SEC1_FIXED, ROW_SEC2_FIXED]));
    commitAll(root);
    const r = run([CLOSURE_REL, "--family", "security", "--root", root]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("checked 2 selected finding(s)");
    expect(r.stdout).toContain("SEC-1");
    expect(r.stdout).toContain("SEC-2");
    expect(r.stdout).toContain("0 error(s)");
  });

  test("a selected finding with no closure row exits 1 and names the ID", () => {
    const root = initRepo();
    write(root, REPORT_REL, SOURCE_REPORT);
    write(root, CLOSURE_REL, closureBody([ROW_SEC1_FIXED])); // SEC-2 missing
    commitAll(root);
    const r = run([CLOSURE_REL, "--family", "security", "--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("selected finding has no Closure Matrix row: SEC-2");
  });

  test("a fixed row with placeholder Command/Artifact exits 1", () => {
    const root = initRepo();
    write(root, REPORT_REL, SOURCE_REPORT);
    const placeholderRow =
      "| SEC-2 | fixed | src/b.ts | <command> | <result> | none | 1/1 killed | PASS | 3 | tests | none | - |";
    write(root, CLOSURE_REL, closureBody([ROW_SEC1_FIXED, placeholderRow]));
    commitAll(root);
    const r = run([CLOSURE_REL, "--family", "security", "--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("placeholder Command/Artifact cell");
    expect(r.stdout).toContain("placeholder Result cell");
  });

  test("a non-terminal status exits 1", () => {
    const root = initRepo();
    write(root, REPORT_REL, SOURCE_REPORT);
    const inProgressRow =
      "| SEC-2 | in-progress | src/b.ts | `bun test` | pending | none | - | - | - | - | - | - |";
    write(root, CLOSURE_REL, closureBody([ROW_SEC1_FIXED, inProgressRow]));
    commitAll(root);
    const r = run([CLOSURE_REL, "--family", "security", "--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("non-terminal status 'in-progress'");
  });

  test("an untracked closure file exits 1", () => {
    const root = initRepo();
    write(root, REPORT_REL, SOURCE_REPORT);
    commitAll(root);
    write(root, CLOSURE_REL, closureBody([ROW_SEC1_FIXED, ROW_SEC2_FIXED])); // never committed
    const r = run([CLOSURE_REL, "--family", "security", "--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("not tracked on HEAD");
  });

  test("a closure modified after commit exits 1", () => {
    const root = initRepo();
    write(root, REPORT_REL, SOURCE_REPORT);
    write(root, CLOSURE_REL, closureBody([ROW_SEC1_FIXED, ROW_SEC2_FIXED]));
    commitAll(root);
    write(root, CLOSURE_REL, closureBody([ROW_SEC1_FIXED, ROW_SEC2_FIXED]) + "\nEdited.\n");
    const r = run([CLOSURE_REL, "--family", "security", "--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("uncommitted/modified");
  });

  test("--findings restricts the selected set", () => {
    const root = initRepo();
    write(root, REPORT_REL, SOURCE_REPORT);
    write(root, CLOSURE_REL, closureBody([ROW_SEC1_FIXED])); // SEC-2 absent, but not selected
    commitAll(root);
    const r = run([CLOSURE_REL, "--family", "security", "--findings", "SEC-1", "--root", root]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("checked 1 selected finding(s)");
  });

  test("family-specific extra columns appended after the standard set still parse", () => {
    const root = initRepo();
    const reqReport = SOURCE_REPORT.replaceAll("SEC-", "REQ-").replace(
      "Workflow: security-audit",
      "Workflow: requirements-audit",
    );
    const reqReportRel = "audits/requirements/2026-08-06 requirements-audit.md";
    const reqClosureRel = "audits/requirements/2026-08-06 requirements-fix-closure.md";
    write(root, reqReportRel, reqReport);
    const body = [
      "# Requirements Fix Closure",
      "",
      "Date: 2026-08-06",
      "Workflow: requirements-fix",
      "ProjectId: p",
      "WorkflowSessionId: s",
      `Source Report: ${reqReportRel}`,
      "Finding Selector: all",
      "",
      "## Closure Matrix",
      "",
      "| Finding ID | Status | Changed Files | Command/Artifact | Result | Skipped Reason | Discrimination Sensor | Independent Verifier | Ladder Level | Validation Assets Protected | Residual Risk | Next Step | Linked .specs/ Requirement ID |",
      "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
      "| REQ-1 | fixed | src/a.ts | `bun test` | pass | none | 1/1 killed | PASS | 3 | tests | none | - | AUTH-01 |",
      "| REQ-2 | deferred | - | - | - | outside-scope | not available — deferred | - | 1 | none | tracked | reopen next sprint | AUTH-02 |",
      "",
    ].join("\n");
    write(root, reqClosureRel, body);
    commitAll(root);
    const r = run([reqClosureRel, "--family", "requirements", "--root", root]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("checked 2 selected finding(s)");
  });

  test("a missing Closure Matrix section exits 1", () => {
    const root = initRepo();
    write(root, REPORT_REL, SOURCE_REPORT);
    write(root, CLOSURE_REL, "# Security Fix Closure\n\nSource Report: " + REPORT_REL + "\n");
    commitAll(root);
    const r = run([CLOSURE_REL, "--family", "security", "--root", root]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("no '## Closure Matrix' table found");
  });

  test("an unknown family is a usage error (exit 2)", () => {
    const r = run(["whatever.md", "--family", "nonsense"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("unknown family 'nonsense'");
  });

  test("a missing closure path is a usage-level error (exit 2), not a gate failure", () => {
    const root = initRepo();
    const r = run(["audits/security/absent.md", "--family", "security", "--root", root]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("closure report not found");
  });
});
