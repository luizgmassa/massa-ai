/**
 * Discriminating tests for the `lessons.ts` trust-ramp (AEH-03) and
 * quality-metric trend (AEH-05) extensions, added T1/T2. Pure
 * Bun.spawnSync(["bun", "lessons.ts", ...]) against fixture `.specs/` trees
 * built in `mkdtemp` temp dirs — no PostgreSQL, no Ollama, deterministic.
 * Fixture pattern copied from `scripts/__tests__/spec-driven-validators.test.ts`.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
const LESSONS_TS = join(REPO_ROOT, "skills", "massa-ai", "scripts", "lessons.ts");

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

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function run(root: string, args: string[]): RunResult {
  const proc = Bun.spawnSync(["bun", LESSONS_TS, "--root", root, ...args], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { exitCode: proc.exitCode ?? -1, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

function reviewAdd(root: string, category: string, feedback: string, source = "test:1"): RunResult {
  return run(root, ["review", "add", "--category", category, "--feedback", feedback, "--source", source]);
}

function trustStatus(root: string, category?: string): RunResult {
  return category ? run(root, ["trust", "status", "--category", category]) : run(root, ["trust", "status"]);
}

// ---------------------------------------------------------------------------
// AEH-03: review add + trust status (T1)
// ---------------------------------------------------------------------------

describe("lessons.ts trust ramp (AEH-03)", () => {
  test("review add appends a record and trust status reflects it", () => {
    const root = makeTempRoot("trust-basic");
    const add = reviewAdd(root, "installer", "none");
    expect(add.exitCode).toBe(0);
    expect(add.stdout).toContain("REVIEW installer");
    const status = trustStatus(root);
    expect(status.exitCode).toBe(0);
    expect(status.stdout).toBe("installer: streak=1/30 total=1 trusted=no\n");
  });

  test("29 consecutive none records: not trusted (lower boundary)", () => {
    const root = makeTempRoot("trust-29");
    for (let i = 0; i < 29; i++) {
      expect(reviewAdd(root, "admin-ui", "none").exitCode).toBe(0);
    }
    const status = trustStatus(root, "admin-ui");
    expect(status.stdout).toContain("streak=29/30 total=29 trusted=no");
  });

  test("30 consecutive none records: trusted (boundary, >=)", () => {
    const root = makeTempRoot("trust-30");
    for (let i = 0; i < 30; i++) {
      expect(reviewAdd(root, "admin-ui", "none").exitCode).toBe(0);
    }
    const status = trustStatus(root, "admin-ui");
    expect(status.stdout).toContain("streak=30/30 total=30 trusted=yes");
  });

  test("minor feedback extends the streak the same as none", () => {
    const root = makeTempRoot("trust-minor");
    for (let i = 0; i < 15; i++) reviewAdd(root, "cat", "none");
    for (let i = 0; i < 15; i++) reviewAdd(root, "cat", "minor");
    const status = trustStatus(root, "cat");
    expect(status.stdout).toContain("streak=30/30 total=30 trusted=yes");
  });

  test("major feedback resets a trusted category's streak to 0 and demotes it", () => {
    const root = makeTempRoot("trust-demote");
    for (let i = 0; i < 30; i++) reviewAdd(root, "cat", "none");
    expect(trustStatus(root, "cat").stdout).toContain("trusted=yes");
    reviewAdd(root, "cat", "major");
    const status = trustStatus(root, "cat");
    expect(status.stdout).toContain("streak=0/30 total=31 trusted=no");
  });

  test("streak counts only trailing records after the last major", () => {
    const root = makeTempRoot("trust-trailing");
    for (let i = 0; i < 5; i++) reviewAdd(root, "cat", "none");
    reviewAdd(root, "cat", "major");
    for (let i = 0; i < 3; i++) reviewAdd(root, "cat", "none");
    const status = trustStatus(root, "cat");
    expect(status.stdout).toContain("streak=3/30 total=9 trusted=no");
  });

  test("legacy store (no ramp fields) loads clean; trust status reports empty, exit 0", () => {
    const root = makeTempRoot("trust-legacy");
    mkdirSync(join(root, ".specs"), { recursive: true });
    const legacyStore = {
      schema: 1,
      promote_threshold: 2,
      window_days: 45,
      quarantine_threshold: 2,
      next_id: 1,
      lessons: [],
    };
    writeFileSync(join(root, ".specs", "lessons.json"), `${JSON.stringify(legacyStore, null, 2)}\n`, "utf-8");
    const status = trustStatus(root);
    expect(status.exitCode).toBe(0);
    expect(status.stdout).toBe("(no review records)\n");
  });

  test("trust status against a store with only legacy lesson records: zero categories, exit 0", () => {
    const root = makeTempRoot("trust-legacy-lessons");
    const add = run(root, [
      "add",
      "--feature",
      "f",
      "--signal",
      "ac_gap",
      "--source",
      "x:1",
      "--text",
      "Some real lesson text here.",
    ]);
    expect(add.exitCode).toBe(0);
    const status = trustStatus(root);
    expect(status.exitCode).toBe(0);
    expect(status.stdout).toBe("(no review records)\n");
  });

  test("unknown --feedback value exits 2 naming the accepted values", () => {
    const root = makeTempRoot("trust-bad-feedback");
    const result = reviewAdd(root, "cat", "catastrophic");
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("none");
    expect(result.stderr).toContain("minor");
    expect(result.stderr).toContain("major");
  });

  test("top-level usage/invalid-choice list includes review, trust, metrics", () => {
    const root = makeTempRoot("trust-usage");
    const result = run(root, ["bogus-command"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("review");
    expect(result.stderr).toContain("trust");
    expect(result.stderr).toContain("metrics");
  });

  test("review with an unrecognized sub-command exits 2", () => {
    const root = makeTempRoot("trust-review-subcmd");
    const result = run(root, ["review", "bogus"]);
    expect(result.exitCode).toBe(2);
  });

  test("trust with an unrecognized sub-command exits 2", () => {
    const root = makeTempRoot("trust-trust-subcmd");
    const result = run(root, ["trust", "bogus"]);
    expect(result.exitCode).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// AEH-05: metrics add + metrics trend (T2)
// ---------------------------------------------------------------------------

interface MetricsAddOpts {
  feature: string;
  result: string;
  fixIterations: string;
  survivingMutants: string;
  acsTotal: string;
  acsCovered: string;
}

function metricsAdd(root: string, opts: MetricsAddOpts): RunResult {
  return run(root, [
    "metrics",
    "add",
    "--feature",
    opts.feature,
    "--result",
    opts.result,
    "--fix-iterations",
    opts.fixIterations,
    "--surviving-mutants",
    opts.survivingMutants,
    "--acs-total",
    opts.acsTotal,
    "--acs-covered",
    opts.acsCovered,
  ]);
}

function metricsTrend(root: string): RunResult {
  return run(root, ["metrics", "trend"]);
}

describe("lessons.ts quality-metric trend (AEH-05)", () => {
  test("metrics add appends a snapshot", () => {
    const root = makeTempRoot("metrics-add");
    const result = metricsAdd(root, {
      feature: "f1",
      result: "PASS",
      fixIterations: "0",
      survivingMutants: "0",
      acsTotal: "5",
      acsCovered: "5",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("METRICS f1");
  });

  test("single snapshot: insufficient data, exit 0", () => {
    const root = makeTempRoot("metrics-single");
    metricsAdd(root, {
      feature: "f1",
      result: "PASS",
      fixIterations: "0",
      survivingMutants: "0",
      acsTotal: "5",
      acsCovered: "5",
    });
    const trend = metricsTrend(root);
    expect(trend.exitCode).toBe(0);
    expect(trend.stdout).toContain("trend: insufficient data");
  });

  test("zero snapshots: insufficient data, exit 0", () => {
    const root = makeTempRoot("metrics-zero");
    const trend = metricsTrend(root);
    expect(trend.exitCode).toBe(0);
    expect(trend.stdout).toBe("trend: insufficient data\n");
  });

  test("improving verdict: PASS with no mutants beats a prior FAIL", () => {
    const root = makeTempRoot("metrics-improving");
    metricsAdd(root, {
      feature: "f1",
      result: "FAIL",
      fixIterations: "3",
      survivingMutants: "5",
      acsTotal: "10",
      acsCovered: "8",
    });
    metricsAdd(root, {
      feature: "f1",
      result: "PASS",
      fixIterations: "0",
      survivingMutants: "0",
      acsTotal: "10",
      acsCovered: "10",
    });
    const trend = metricsTrend(root);
    expect(trend.exitCode).toBe(0);
    expect(trend.stdout).toContain("trend: improving");
  });

  test("degrading verdict: more surviving mutants than the prior pass", () => {
    const root = makeTempRoot("metrics-degrading");
    metricsAdd(root, {
      feature: "f1",
      result: "PASS",
      fixIterations: "0",
      survivingMutants: "0",
      acsTotal: "10",
      acsCovered: "10",
    });
    metricsAdd(root, {
      feature: "f1",
      result: "PASS",
      fixIterations: "0",
      survivingMutants: "3",
      acsTotal: "10",
      acsCovered: "10",
    });
    const trend = metricsTrend(root);
    expect(trend.exitCode).toBe(0);
    expect(trend.stdout).toContain("trend: degrading");
  });

  test("stable verdict: identical scores across snapshots", () => {
    const root = makeTempRoot("metrics-stable");
    metricsAdd(root, {
      feature: "f1",
      result: "PASS",
      fixIterations: "1",
      survivingMutants: "0",
      acsTotal: "10",
      acsCovered: "9",
    });
    metricsAdd(root, {
      feature: "f1",
      result: "PASS",
      fixIterations: "1",
      survivingMutants: "0",
      acsTotal: "10",
      acsCovered: "9",
    });
    const trend = metricsTrend(root);
    expect(trend.exitCode).toBe(0);
    expect(trend.stdout).toContain("trend: stable");
  });

  test("non-numeric --surviving-mutants exits 2 naming the flag", () => {
    const root = makeTempRoot("metrics-nan");
    const result = metricsAdd(root, {
      feature: "f1",
      result: "PASS",
      fixIterations: "0",
      survivingMutants: "abc",
      acsTotal: "5",
      acsCovered: "5",
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--surviving-mutants");
  });

  test("negative --fix-iterations exits 2 naming the flag", () => {
    const root = makeTempRoot("metrics-negative");
    const result = metricsAdd(root, {
      feature: "f1",
      result: "PASS",
      fixIterations: "-1",
      survivingMutants: "0",
      acsTotal: "5",
      acsCovered: "5",
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--fix-iterations");
  });

  test("unknown --result value exits 2 naming the accepted values", () => {
    const root = makeTempRoot("metrics-bad-result");
    const result = metricsAdd(root, {
      feature: "f1",
      result: "MAYBE",
      fixIterations: "0",
      survivingMutants: "0",
      acsTotal: "5",
      acsCovered: "5",
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("PASS");
    expect(result.stderr).toContain("FAIL");
  });

  test("legacy-command byte-stability: list leaves the store file byte-identical", () => {
    const root = makeTempRoot("metrics-byte-stability");
    mkdirSync(join(root, ".specs"), { recursive: true });
    const legacyStore = {
      schema: 1,
      promote_threshold: 2,
      window_days: 45,
      quarantine_threshold: 2,
      next_id: 2,
      lessons: [
        {
          id: "L-001",
          key: "ac_gap::x",
          text: "Some pre-existing lesson text for the fixture.",
          signal: "ac_gap",
          scope: "",
          status: "confirmed",
          features: ["f1", "f2"],
          recurrence: 2,
          harmful: 0,
          evidence: ["x:1"],
          created: "2026-01-01T00:00:00Z",
          last_seen: "2026-01-01T00:00:00Z",
          confidence: 1.0,
        },
      ],
    };
    const storePath = join(root, ".specs", "lessons.json");
    const content = `${JSON.stringify(legacyStore, null, 2)}\n`;
    writeFileSync(storePath, content, "utf-8");
    const before = readFileSync(storePath, "utf-8");
    const result = run(root, ["list", "--status", "all"]);
    expect(result.exitCode).toBe(0);
    const after = readFileSync(storePath, "utf-8");
    expect(after).toBe(before);
  });
});
