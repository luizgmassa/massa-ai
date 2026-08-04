/**
 * Discriminating tests for the ported TLC 3.3.0 spec-driven validator scripts
 * under `skills/massa-ai/scripts/`. Pure Bun.spawnSync(["python3", ...]) against
 * fixture `.specs/` trees built in `mkdtemp` temp dirs — no PostgreSQL, no
 * Ollama, deterministic (D2). Runs from `bun run test:scripts` / directly via
 * `bun test scripts/__tests__/spec-driven-validators.test.ts`.
 */
import { describe, expect, test, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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

function runPy(scriptRelPath: string, args: string[], cwd: string = REPO_ROOT): PyResult {
  const proc = Bun.spawnSync(["python3", join(REPO_ROOT, scriptRelPath), ...args], {
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

const VALIDATE_SPEC = "skills/massa-ai/scripts/validate_spec.py";

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
