/**
 * XP-01 / TASK-XP-008 — Bun install-cache warming YAML gate.
 *
 * Every job step that runs `bun install` (across `ci.yml`, `coverage.yml`,
 * `publish.yml`) must be immediately preceded, in the same job's step list,
 * by an `actions/cache@v4` step whose `with.path` is exactly
 * `~/.bun/install/cache` — the shape design.md C3 specifies verbatim. This
 * mechanizes spec AC XP-01 AC-4 (deterministic YAML-parse assertion, no real
 * CI run required to catch a removed cache step).
 *
 * `needles-gate.yml` is a **named, not silent** exception (design.md C3): its
 * lone `bun install --frozen-lockfile --ignore-scripts` step is
 * `workflow_dispatch`-only and `continue-on-error`, so warming it buys
 * nothing worth the extra cache slot. The exception is asserted for real
 * below (the live file's install step has NO preceding cache step) so the
 * exclusion cannot silently become vacuous if the workflow is ever edited to
 * add one anyway.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.join(import.meta.dir, "..", "..");
const WORKFLOWS_DIR = path.join(REPO_ROOT, ".github", "workflows");

const CACHE_PATH = "~/.bun/install/cache";

/** Named, disclosed exception — see module docblock. */
export const CACHE_WARMING_EXEMPT: Record<string, string> = {
  "needles-gate.yml": "workflow_dispatch-only + continue-on-error retrieval benchmark (never blocks a merge); --ignore-scripts install never touches the native-grammar race this cache exists for.",
};

interface Step {
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
}

function isBunInstall(run: unknown): run is string {
  return typeof run === "string" && run.includes("bun install");
}

function isCacheStepForPath(step: Step | undefined, cachePath: string): boolean {
  if (!step) return false;
  if (typeof step.uses !== "string" || !step.uses.startsWith("actions/cache@")) return false;
  return step.with?.path === cachePath;
}

export interface InstallSiteResult {
  jobId: string;
  stepIndex: number;
  stepName: string;
  precededByCache: boolean;
}

/** Every `bun install`-running step in every job, with whether it's immediately
 *  preceded (same job, same step list) by an `actions/cache@v4` step for CACHE_PATH. */
export function findInstallSites(workflow: Record<string, any>): InstallSiteResult[] {
  const jobs = workflow.jobs ?? {};
  const results: InstallSiteResult[] = [];
  for (const [jobId, job] of Object.entries<any>(jobs)) {
    const steps: Step[] = job?.steps ?? [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      if (!isBunInstall(step.run)) continue;
      results.push({
        jobId,
        stepIndex: i,
        stepName: step.name ?? "(unnamed step)",
        precededByCache: isCacheStepForPath(steps[i - 1], CACHE_PATH),
      });
    }
  }
  return results;
}

export interface CheckResult {
  workflow: string;
  installSites: InstallSiteResult[];
  violations: InstallSiteResult[]; // install sites missing the preceding cache step, not exempt
}

export function checkWorkflow(workflowFile: string, workflow: Record<string, any>): CheckResult {
  const exempt = workflowFile in CACHE_WARMING_EXEMPT;
  const installSites = findInstallSites(workflow);
  const violations = exempt ? [] : installSites.filter((s) => !s.precededByCache);
  return { workflow: workflowFile, installSites, violations };
}

function parseWorkflow(file: string): Record<string, any> {
  return Bun.YAML.parse(readFileSync(path.join(WORKFLOWS_DIR, file), "utf8")) as Record<string, any>;
}

// ── fixture-level: findInstallSites / isCacheStepForPath ────────────────────

describe("findInstallSites", () => {
  test("a bun install step immediately preceded by the correct cache step is recognized", () => {
    const workflow = {
      jobs: {
        build: {
          steps: [
            { name: "Restore Bun install cache", uses: "actions/cache@v4", with: { path: CACHE_PATH } },
            { name: "Install dependencies", run: "bun install --frozen-lockfile" },
          ],
        },
      },
    };
    const sites = findInstallSites(workflow);
    expect(sites.length).toBe(1);
    expect(sites[0]!.precededByCache).toBe(true);
  });

  test("RED (observed): a bun install step with the cache step removed is unpreceded", () => {
    const workflow = {
      jobs: {
        build: {
          steps: [
            { name: "Setup Bun", uses: "oven-sh/setup-bun@v2" },
            { name: "Install dependencies", run: "bun install --frozen-lockfile" },
          ],
        },
      },
    };
    const sites = findInstallSites(workflow);
    expect(sites.length).toBe(1);
    expect(sites[0]!.precededByCache).toBe(false);
  });

  test("a cache step for a different path does not count", () => {
    const workflow = {
      jobs: {
        build: {
          steps: [
            { name: "Cache node_modules", uses: "actions/cache@v4", with: { path: "node_modules" } },
            { name: "Install dependencies", run: "bun install --frozen-lockfile" },
          ],
        },
      },
    };
    expect(findInstallSites(workflow)[0]!.precededByCache).toBe(false);
  });

  test("a cache step present but NOT immediately preceding (a step sits between) does not count", () => {
    const workflow = {
      jobs: {
        build: {
          steps: [
            { name: "Restore Bun install cache", uses: "actions/cache@v4", with: { path: CACHE_PATH } },
            { name: "Setup Node", uses: "actions/setup-node@v4" },
            { name: "Install dependencies", run: "bun install --frozen-lockfile" },
          ],
        },
      },
    };
    expect(findInstallSites(workflow)[0]!.precededByCache).toBe(false);
  });

  test("a step whose run text does not mention bun install is ignored", () => {
    const workflow = { jobs: { build: { steps: [{ name: "Build", run: "bun run build" }] } } };
    expect(findInstallSites(workflow)).toEqual([]);
  });

  test("multiple jobs are scanned independently — a cache step in one job never covers another job's install", () => {
    const workflow = {
      jobs: {
        a: {
          steps: [
            { name: "Restore Bun install cache", uses: "actions/cache@v4", with: { path: CACHE_PATH } },
            { name: "Install", run: "bun install --frozen-lockfile" },
          ],
        },
        b: {
          steps: [{ name: "Install", run: "bun install --frozen-lockfile" }],
        },
      },
    };
    const sites = findInstallSites(workflow);
    expect(sites.find((s) => s.jobId === "a")!.precededByCache).toBe(true);
    expect(sites.find((s) => s.jobId === "b")!.precededByCache).toBe(false);
  });
});

// ── checkWorkflow — exemption handling ───────────────────────────────────────

describe("checkWorkflow", () => {
  test("RED: a non-exempt workflow with an unpreceded install is a violation", () => {
    const workflow = { jobs: { build: { steps: [{ name: "Install", run: "bun install --frozen-lockfile" }] } } };
    const result = checkWorkflow("some-workflow.yml", workflow);
    expect(result.violations.length).toBe(1);
  });

  test("GREEN: the same shape, but the file is in the named exemption table, produces no violation", () => {
    const workflow = { jobs: { build: { steps: [{ name: "Install", run: "bun install --ignore-scripts" }] } } };
    const result = checkWorkflow("needles-gate.yml", workflow);
    expect(result.violations).toEqual([]);
    // The exemption doesn't erase the finding — it just doesn't fail on it.
    expect(result.installSites[0]!.precededByCache).toBe(false);
  });
});

// ── live tree ────────────────────────────────────────────────────────────────

describe("live tree — ci.yml", () => {
  const workflow = parseWorkflow("ci.yml");
  const result = checkWorkflow("ci.yml", workflow);

  test("every bun-install-running job (build, structural-native, structural-native-linux) is scanned", () => {
    expect(result.installSites.length).toBe(3);
    const jobIds = result.installSites.map((s) => s.jobId).sort();
    expect(jobIds).toEqual(["build", "structural-native", "structural-native-linux"]);
  });

  test("PASS: every install site is preceded by the cache step", () => {
    if (result.violations.length > 0) {
      // eslint-disable-next-line no-console
      console.error(result.violations.map((v) => `${v.jobId}:${v.stepName}`).join("\n"));
    }
    expect(result.violations).toEqual([]);
  });
});

describe("live tree — coverage.yml", () => {
  const workflow = parseWorkflow("coverage.yml");
  const result = checkWorkflow("coverage.yml", workflow);

  test("its one install site is preceded by the cache step", () => {
    expect(result.installSites.length).toBe(1);
    expect(result.violations).toEqual([]);
  });
});

describe("live tree — publish.yml", () => {
  const workflow = parseWorkflow("publish.yml");
  const result = checkWorkflow("publish.yml", workflow);

  test("its one install site (build job) is preceded by the cache step", () => {
    expect(result.installSites.length).toBe(1);
    expect(result.violations).toEqual([]);
  });
});

describe("live tree — needles-gate.yml (named exception)", () => {
  const workflow = parseWorkflow("needles-gate.yml");
  const result = checkWorkflow("needles-gate.yml", workflow);

  test("its install step genuinely has no preceding cache step — the exception is real, not vacuous", () => {
    expect(result.installSites.length).toBe(1);
    expect(result.installSites[0]!.precededByCache).toBe(false);
  });

  test("but checkWorkflow reports no violation, because it is named in CACHE_WARMING_EXEMPT", () => {
    expect(result.violations).toEqual([]);
    expect("needles-gate.yml" in CACHE_WARMING_EXEMPT).toBe(true);
  });
});

describe("live tree — every workflow's bun-install jobs (repo-wide sweep)", () => {
  test("no workflow outside the named exemption table has an unpreceded bun install step", () => {
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const files = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
    const allViolations: string[] = [];
    for (const file of files) {
      const wf = parseWorkflow(file);
      const result = checkWorkflow(file, wf);
      for (const v of result.violations) allViolations.push(`${file}:${v.jobId}:${v.stepName}`);
    }
    expect(allViolations).toEqual([]);
  });
});
