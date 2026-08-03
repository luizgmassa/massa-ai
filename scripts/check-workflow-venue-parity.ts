#!/usr/bin/env bun
/**
 * XP-04 AC-2/3 / TASK-XP-006 — workflow venue-parity gate.
 *
 * `ci.yml`'s blocking test job and `coverage.yml`'s blocking coverage job are
 * meant to exercise the same suites against the same kind of database — that
 * is the whole point of XP-04's `ci.yml` flip (T7). This gate is what keeps
 * that true going forward: it fails the moment any test-running workflow's
 * env for its test invocation diverges from another's, unless the divergence
 * is named in an explicit, justified exception.
 *
 * ## Classification (spec edge case: no silent empty comparison)
 *
 * Every `.github/workflows/*.yml` file is either **test-running** (at least
 * one step anywhere in it runs `bun run test`, `bun run test:coverage`,
 * `bun run test:scripts`, `bun run test:plugins`, or bare `bun test`) or it
 * must appear in {@link EXEMPT_WORKFLOWS} with a reason. An unclassified
 * workflow — test-running by inspection but missing here, or present in
 * neither set — is itself a failure: a check that silently produces an empty
 * comparison reads exactly like a clean one.
 *
 * ## Effective env (design.md C4)
 *
 * For a test-running workflow, every qualifying step's effective env is
 * `workflow env ∪ job env ∪ step env` (later wins), and those per-step envs
 * are merged again across every qualifying step in document order (later
 * wins) into one **venue env** for the whole workflow — the workflow's test
 * invocation is one venue, not one venue per step. That venue env is
 * projected onto a declared **semantic key set**:
 * `DATABASE_URL, MASSA_AI_DEDICATED, RUN_POSTGRES_TESTS,
 * MASSA_AI_EXECUTOR_SANDBOX, RUN_E2E, RUN_E2E_DESTRUCTIVE`, plus the venue's
 * runner OS (`runs-on` of the last qualifying step's job) and its invocation
 * summary (the sorted, deduped set of matched `run:` command strings) as two
 * more compared keys. Comparing "all env" would be permanent noise (job
 * tokens, unrelated knobs); this declared set is what stays auditable
 * (design.md Tech Decisions).
 *
 * ## Exceptions (`scripts/workflow-venue-parity-exceptions.txt`)
 *
 * `class|workflowA|workflowB|key|justification`, `#` comments, workflow
 * names normalized to a canonical (alphabetical) pair order so an exception
 * is written once, not twice. `class` is a free-form short label (this gate
 * has no fixed enum of divergence classes, unlike XP-03's security
 * allowlist) — it exists for readability, grouping WHY a divergence is
 * accepted (e.g. a temporary one pending a later task vs. a permanent one).
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

export const REPO_ROOT = path.join(import.meta.dir, "..");
export const WORKFLOWS_DIR = path.join(REPO_ROOT, ".github", "workflows");
export const EXCEPTIONS_PATH = path.join(import.meta.dir, "workflow-venue-parity-exceptions.txt");

/** The declared semantic key set (design.md C4), plus two synthetic keys. */
export const SEMANTIC_KEYS = [
  "DATABASE_URL",
  "MASSA_AI_DEDICATED",
  "RUN_POSTGRES_TESTS",
  "MASSA_AI_EXECUTOR_SANDBOX",
  "RUN_E2E",
  "RUN_E2E_DESTRUCTIVE",
] as const;

export const RUNNER_OS_KEY = "__runnerOS__";
export const INVOCATION_KEY = "__invocation__";
export const ALL_KEYS = [...SEMANTIC_KEYS, RUNNER_OS_KEY, INVOCATION_KEY] as const;
export type VenueKey = (typeof ALL_KEYS)[number];

/**
 * Workflows that legitimately never invoke the test suite, with why. Every
 * workflow under `.github/workflows/` must appear either here or in the
 * test-running set the scan produces — never in neither.
 */
export const EXEMPT_WORKFLOWS: Record<string, string> = {
  "publish.yml": "reusable publish workflow — builds and publishes packages (bun run build, version-sync, npm publish); never runs the test suite itself.",
  "release.yml": "orchestrates the release chain (derive bump, commit, tag, call publish.yml); never runs the test suite itself.",
  "needles-gate.yml": "retrieval-quality benchmark (bench:needles:gate), not the unit/integration suite; workflow_dispatch-only and continue-on-error, never blocks a merge.",
  "skills.yml": "validates SKILL.md frontmatter only via checkout + greps; runs no tests (CLAUDE.md 'skills.yml' note).",
};

function isTestInvocation(run: string): boolean {
  return run.includes("bun run test") || run.includes("bun test");
}

interface StepEnv {
  jobId: string;
  runsOn: string;
  stepName: string;
  run: string;
  effectiveEnv: Record<string, string>;
}

function toEnvRecord(env: unknown): Record<string, string> {
  if (!env || typeof env !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env as Record<string, unknown>)) {
    if (v !== undefined && v !== null) out[k] = String(v);
  }
  return out;
}

/** Every step across every job whose `run:` matches a test invocation. */
export function testInvokingSteps(workflow: Record<string, any>): StepEnv[] {
  const workflowEnv = toEnvRecord(workflow.env);
  const jobs = workflow.jobs ?? {};
  const results: StepEnv[] = [];
  for (const [jobId, job] of Object.entries<any>(jobs)) {
    const jobEnv = toEnvRecord(job?.env);
    const runsOn = typeof job?.["runs-on"] === "string" ? job["runs-on"] : JSON.stringify(job?.["runs-on"] ?? "");
    for (const step of job?.steps ?? []) {
      if (typeof step?.run !== "string") continue;
      if (!isTestInvocation(step.run)) continue;
      const stepEnv = toEnvRecord(step.env);
      results.push({
        jobId,
        runsOn,
        stepName: step.name ?? "(unnamed step)",
        run: step.run,
        effectiveEnv: { ...workflowEnv, ...jobEnv, ...stepEnv },
      });
    }
  }
  return results;
}

export interface Venue {
  workflow: string; // filename, e.g. "ci.yml"
  values: Record<VenueKey, string | undefined>;
  steps: StepEnv[]; // for diagnostics
}

/** Build the merged venue for a test-running workflow, or null if none. */
export function venueFor(workflowFile: string, workflow: Record<string, any>): Venue | null {
  const steps = testInvokingSteps(workflow);
  if (steps.length === 0) return null;

  const merged: Record<string, string> = {};
  for (const s of steps) Object.assign(merged, s.effectiveEnv);

  const values = {} as Record<VenueKey, string | undefined>;
  for (const key of SEMANTIC_KEYS) values[key] = merged[key];
  values[RUNNER_OS_KEY] = steps[steps.length - 1]!.runsOn;
  values[INVOCATION_KEY] = [...new Set(steps.map((s) => s.run))].sort().join(" && ");

  return { workflow: workflowFile, values, steps };
}

export interface ExceptionEntry {
  cls: string;
  workflowA: string;
  workflowB: string;
  key: string;
  justification: string;
  lineNo: number;
}

/** Canonical alphabetical pair order, so an exception is written once. */
function pairKey(a: string, b: string, key: string): string {
  const [x, y] = [a, b].sort();
  return `${x}|${y}|${key}`;
}

export function parseExceptions(text: string): ExceptionEntry[] {
  const entries: ExceptionEntry[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("|");
    if (parts.length !== 5) {
      throw new Error(
        `workflow-venue-parity-exceptions.txt:${i + 1}: expected 5 '|'-separated fields, got ${parts.length}: ${raw}`,
      );
    }
    const [cls, workflowA, workflowB, key, justification] = parts as [string, string, string, string, string];
    entries.push({ cls, workflowA, workflowB, key, justification, lineNo: i + 1 });
  }
  return entries;
}

export interface Divergence {
  workflowA: string;
  workflowB: string;
  key: string;
  valueA: string | undefined;
  valueB: string | undefined;
}

export interface Classification {
  testRunning: string[]; // filenames
  exempt: string[]; // filenames
  unclassified: string[]; // present in neither set — a violation
}

export interface CheckResult {
  workflowsScanned: number;
  venues: Venue[];
  classification: Classification;
  exceptions: ExceptionEntry[];
  divergences: Divergence[]; // divergences NOT covered by an exception
  staleExceptions: ExceptionEntry[]; // exception entries whose pair no longer diverges
}

function listWorkflowFiles(dir: string = WORKFLOWS_DIR): string[] {
  const tracked = execSync("git ls-files -z", { cwd: REPO_ROOT, maxBuffer: 1 << 24 })
    .toString()
    .split("\0")
    .filter((p) => p.length > 0);
  const relDir = path.relative(REPO_ROOT, dir).replace(/\\/g, "/");
  return tracked
    .filter((p) => p.startsWith(`${relDir}/`))
    .filter((p) => p.endsWith(".yml") || p.endsWith(".yaml"))
    .sort();
}

/**
 * Run the gate. `exceptionsText` is injectable for fixture tests; production
 * reads the real file. `files` (repo-relative, under `.github/workflows/`)
 * is injectable too, for fixture tests that construct a whole tree.
 */
export function check(root: string = REPO_ROOT, exceptionsText?: string, files?: string[]): CheckResult {
  const relFiles = files ?? listWorkflowFiles(path.join(root, ".github", "workflows"));

  const venues: Venue[] = [];
  const testRunning: string[] = [];
  const exempt: string[] = [];
  const unclassified: string[] = [];

  for (const rel of relFiles) {
    const base = path.basename(rel);
    const abs = path.join(root, rel);
    let text: string;
    try {
      text = readFileSync(abs, "utf8");
    } catch (e) {
      throw new Error(`failed to read ${rel}: ${(e as Error).message}`);
    }
    let parsed: Record<string, any>;
    try {
      parsed = Bun.YAML.parse(text) as Record<string, any>;
    } catch (e) {
      throw new Error(`failed to parse ${rel} as YAML: ${(e as Error).message}`);
    }
    const venue = venueFor(base, parsed);
    if (venue) {
      venues.push(venue);
      testRunning.push(base);
      if (base in EXEMPT_WORKFLOWS) {
        // Contradiction: a workflow that DOES invoke tests must not also be
        // declared exempt — that would silently drop it from comparison.
        unclassified.push(base);
      }
    } else if (base in EXEMPT_WORKFLOWS) {
      exempt.push(base);
    } else {
      unclassified.push(base);
    }
  }

  const rawExceptions =
    exceptionsText ?? (existsSync(EXCEPTIONS_PATH) ? readFileSync(EXCEPTIONS_PATH, "utf8") : "");
  const exceptions = parseExceptions(rawExceptions);
  const exceptionByPairKey = new Map<string, ExceptionEntry>();
  for (const e of exceptions) exceptionByPairKey.set(pairKey(e.workflowA, e.workflowB, e.key), e);

  const divergences: Divergence[] = [];
  const seenPairKeys = new Set<string>();
  for (let i = 0; i < venues.length; i++) {
    for (let j = i + 1; j < venues.length; j++) {
      const a = venues[i]!;
      const b = venues[j]!;
      for (const key of ALL_KEYS) {
        const valueA = a.values[key];
        const valueB = b.values[key];
        if (valueA === valueB) continue;
        const pk = pairKey(a.workflow, b.workflow, key);
        seenPairKeys.add(pk);
        if (exceptionByPairKey.has(pk)) continue;
        divergences.push({ workflowA: a.workflow, workflowB: b.workflow, key, valueA, valueB });
      }
    }
  }

  // A stale exception: named a pair+key that no longer diverges (spec's own
  // "drift in either direction is a defect" discipline, mirrored from XP-03).
  const staleExceptions = exceptions.filter((e) => !seenPairKeys.has(pairKey(e.workflowA, e.workflowB, e.key)));

  return {
    workflowsScanned: relFiles.length,
    venues,
    classification: { testRunning, exempt, unclassified },
    exceptions,
    divergences,
    staleExceptions,
  };
}

export function report(result: CheckResult): boolean {
  for (const w of result.classification.unclassified) {
    console.log(`VIOLATION [unclassified] ${w} is neither test-running-with-a-venue nor in EXEMPT_WORKFLOWS`);
  }
  for (const d of result.divergences) {
    console.log(
      `VIOLATION [divergence] ${d.workflowA} vs ${d.workflowB} on ${d.key}: ` +
        `${JSON.stringify(d.valueA)} != ${JSON.stringify(d.valueB)} (not in workflow-venue-parity-exceptions.txt)`,
    );
  }
  for (const e of result.staleExceptions) {
    console.log(
      `VIOLATION [stale-exception] workflow-venue-parity-exceptions.txt:${e.lineNo}: ` +
        `${e.workflowA} vs ${e.workflowB} on ${e.key} no longer diverges — remove the entry`,
    );
  }

  const ok =
    result.classification.unclassified.length === 0 &&
    result.divergences.length === 0 &&
    result.staleExceptions.length === 0;

  // Population always printed — an empty comparison must never read as clean.
  console.log(
    `\n[workflow-venue-parity] scanned ${result.workflowsScanned} workflow(s): ` +
      `${result.classification.testRunning.length} test-running (${result.classification.testRunning.join(", ") || "none"}), ` +
      `${result.classification.exempt.length} exempt (${result.classification.exempt.join(", ") || "none"}), ` +
      `${result.classification.unclassified.length} unclassified`,
  );
  console.log(
    `[workflow-venue-parity] ${result.exceptions.length} exception(s) declared, ` +
      `${result.divergences.length} unexcepted divergence(s), ${result.staleExceptions.length} stale exception(s)`,
  );
  console.log(`[workflow-venue-parity] ${ok ? "PASS" : "FAIL"}`);
  return ok;
}

if (import.meta.main) {
  const result = check();
  process.exit(report(result) ? 0 : 1);
}
