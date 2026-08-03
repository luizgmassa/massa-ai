/**
 * XP-04 AC-2/3 / TASK-XP-006 — the workflow venue-parity gate's own unit
 * suite. Fixture YAML strings only (never a live-tree count baked in here —
 * a live-tree assertion belongs in the "live tree" describe block below,
 * where it re-derives PASS from the real files rather than a frozen number).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  EXCEPTIONS_PATH,
  EXEMPT_WORKFLOWS,
  REPO_ROOT,
  check,
  parseExceptions,
  testInvokingSteps,
  venueFor,
} from "../check-workflow-venue-parity.ts";

// ── venueFor / testInvokingSteps — fixture parsing ──────────────────────────

describe("testInvokingSteps", () => {
  test("finds a bun run test step and merges workflow/job/step env", () => {
    const workflow = {
      env: { A: "workflow" },
      jobs: {
        build: {
          "runs-on": "ubuntu-latest",
          env: { B: "job" },
          steps: [
            { name: "Checkout", uses: "actions/checkout@v4" },
            { name: "Test", run: "bun run test", env: { C: "step" } },
          ],
        },
      },
    };
    const steps = testInvokingSteps(workflow);
    expect(steps.length).toBe(1);
    expect(steps[0]!.effectiveEnv).toEqual({ A: "workflow", B: "job", C: "step" });
  });

  test("later steps' env wins over earlier steps' env for the same key when merged into a venue", () => {
    const workflow = {
      jobs: {
        build: {
          "runs-on": "ubuntu-latest",
          steps: [
            { name: "Test", run: "bun run test", env: { X: "first" } },
            { name: "Test scripts", run: "bun run test:scripts", env: { X: "second" } },
          ],
        },
      },
    };
    const venue = venueFor("f.yml", workflow)!;
    expect(venue).not.toBeNull();
    // X is not a semantic key, but the merge order is exercised through
    // DATABASE_URL below in a dedicated case; this asserts step order here.
    expect(venue.steps.map((s) => s.stepName)).toEqual(["Test", "Test scripts"]);
  });

  test("a step whose run text does not match any invocation pattern is ignored", () => {
    const workflow = {
      jobs: { build: { "runs-on": "ubuntu-latest", steps: [{ name: "Build", run: "bun run build" }] } },
    };
    expect(testInvokingSteps(workflow)).toEqual([]);
  });

  test("bare 'bun test' also counts as an invocation", () => {
    const workflow = {
      jobs: { build: { "runs-on": "ubuntu-latest", steps: [{ name: "Direct", run: "bun test src/x.test.ts" }] } },
    };
    expect(testInvokingSteps(workflow).length).toBe(1);
  });
});

describe("venueFor", () => {
  test("a workflow with no test-invoking step has no venue", () => {
    const workflow = { jobs: { build: { "runs-on": "ubuntu-latest", steps: [{ run: "bun run build" }] } } };
    expect(venueFor("f.yml", workflow)).toBeNull();
  });

  test("semantic keys project onto the venue, missing keys read undefined", () => {
    const workflow = {
      jobs: {
        build: {
          "runs-on": "ubuntu-latest",
          env: { DATABASE_URL: "postgresql://x", MASSA_AI_DEDICATED: "1" },
          steps: [{ name: "Test", run: "bun run test" }],
        },
      },
    };
    const venue = venueFor("f.yml", workflow)!;
    expect(venue.values.DATABASE_URL).toBe("postgresql://x");
    expect(venue.values.MASSA_AI_DEDICATED).toBe("1");
    expect(venue.values.RUN_POSTGRES_TESTS).toBeUndefined();
  });
});

// ── parseExceptions ───────────────────────────────────────────────────────

describe("parseExceptions", () => {
  test("parses a well-formed file, ignoring comments and blank lines", () => {
    const text = ["# comment", "", "cls|a.yml|b.yml|DATABASE_URL|because reasons"].join("\n");
    const entries = parseExceptions(text);
    expect(entries).toEqual([
      { cls: "cls", workflowA: "a.yml", workflowB: "b.yml", key: "DATABASE_URL", justification: "because reasons", lineNo: 3 },
    ]);
  });

  test("throws naming the line on a malformed field count", () => {
    expect(() => parseExceptions("cls|a.yml|b.yml|DATABASE_URL\n")).toThrow(/line 1|:1:/);
  });
});

// ── check() — the full gate over synthetic fixture YAML ─────────────────────

const CLEAN_TEST_WORKFLOW = `
name: A
on: { push: {} }
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: postgresql://same
      MASSA_AI_EXECUTOR_SANDBOX: "none"
    steps:
      - name: Test
        run: bun run test
`;

/** Same env as CLEAN_TEST_WORKFLOW, same invocation too — a fully matching venue. */
const IDENTICAL_TEST_WORKFLOW_B = `
name: B-identical
on: { push: {} }
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: postgresql://same
      MASSA_AI_EXECUTOR_SANDBOX: "none"
    steps:
      - name: Test
        run: bun run test
`;

/**
 * Same env as CLEAN_TEST_WORKFLOW, but a DIFFERENT invocation command — this
 * mirrors the real ci.yml/coverage.yml shape (coverage runs a different,
 * heavier command on purpose), so tests using this fixture always carry a
 * permanent __invocation__ divergence alongside whatever else they inject.
 */
const DIFFERENT_INVOCATION_WORKFLOW = `
name: B
on: { push: {} }
jobs:
  coverage:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: postgresql://same
      MASSA_AI_EXECUTOR_SANDBOX: "none"
    steps:
      - name: Coverage
        run: bun run test:coverage
`;

/** Kept for tests that don't care about the invocation-shape difference and
 * only want the semantic-env comparison exercised. */
const MATCHING_COVERAGE_WORKFLOW = DIFFERENT_INVOCATION_WORKFLOW;
const INVOCATION_EXCEPTION = "cls|a.yml|b.yml|__invocation__|different command on purpose for this fixture\n";

const NON_TEST_WORKFLOW = `
name: C
on: { workflow_dispatch: {} }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Build only
        run: bun run build
`;

describe("check — read failure", () => {
  test("a file listed but absent from disk fails loudly, naming the file", () => {
    expect(() =>
      check(REPO_ROOT, "", [".github/workflows/definitely-does-not-exist.yml"]),
    ).toThrow(/definitely-does-not-exist\.yml/);
  });
});

function writeFixtures(files: Record<string, string>): { dir: string; cleanup: () => void; wf: (...names: string[]) => string[] } {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs") as typeof import("node:fs");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "venue-parity-"));
  mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, ".github", "workflows", name), content);
  }
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
    // `check()`'s `files` param mirrors listWorkflowFiles()'s output shape —
    // repo-root-relative paths (as `git ls-files` would report them), not
    // bare basenames — so fixture-file lists must carry the same prefix.
    wf: (...names: string[]) => names.map((n) => `.github/workflows/${n}`),
  };
}

describe("check — full gate over a fixture tree", () => {
  test("a matching pair with no exceptions needed passes; an unnamed non-test workflow is flagged unclassified", () => {
    const { dir, cleanup, wf } = writeFixtures({
      "a.yml": CLEAN_TEST_WORKFLOW,
      "b.yml": IDENTICAL_TEST_WORKFLOW_B,
      "c.yml": NON_TEST_WORKFLOW,
    });
    try {
      const result = check(dir, "", wf("a.yml", "b.yml", "c.yml"));
      // c.yml is not in EXEMPT_WORKFLOWS (a fixture-only name), so it's
      // correctly flagged — proving the "must be named or it fails" rule.
      expect(result.classification.unclassified).toEqual(["c.yml"]);
      expect(result.divergences).toEqual([]);
    } finally {
      cleanup();
    }
  });

  test("RED: an injected divergence (different DATABASE_URL) fails with no exception on file", () => {
    const diverging = CLEAN_TEST_WORKFLOW.replace("postgresql://same", "postgresql://different");
    const { dir, cleanup, wf } = writeFixtures({ "a.yml": diverging, "b.yml": MATCHING_COVERAGE_WORKFLOW });
    try {
      const result = check(dir, "", wf("a.yml", "b.yml"));
      expect(result.divergences.length).toBeGreaterThan(0);
      expect(result.divergences.some((d) => d.key === "DATABASE_URL")).toBe(true);
    } finally {
      cleanup();
    }
  });

  test("GREEN: the same divergence passes once declared in an exception", () => {
    const diverging = CLEAN_TEST_WORKFLOW.replace("postgresql://same", "postgresql://different");
    const { dir, cleanup, wf } = writeFixtures({ "a.yml": diverging, "b.yml": MATCHING_COVERAGE_WORKFLOW });
    try {
      const result = check(
        dir,
        `cls|a.yml|b.yml|DATABASE_URL|intentional for this fixture\n${INVOCATION_EXCEPTION}`,
        wf("a.yml", "b.yml"),
      );
      expect(result.divergences).toEqual([]);
      expect(result.staleExceptions).toEqual([]);
    } finally {
      cleanup();
    }
  });

  test("exception order is normalized — declaring b.yml|a.yml resolves the same pair", () => {
    const diverging = CLEAN_TEST_WORKFLOW.replace("postgresql://same", "postgresql://different");
    const { dir, cleanup, wf } = writeFixtures({ "a.yml": diverging, "b.yml": MATCHING_COVERAGE_WORKFLOW });
    try {
      const result = check(
        dir,
        `cls|b.yml|a.yml|DATABASE_URL|reversed order still resolves\n${INVOCATION_EXCEPTION}`,
        wf("a.yml", "b.yml"),
      );
      expect(result.divergences).toEqual([]);
    } finally {
      cleanup();
    }
  });

  test("RED: a stale exception (declared divergence no longer exists) fails", () => {
    const { dir, cleanup, wf } = writeFixtures({ "a.yml": CLEAN_TEST_WORKFLOW, "b.yml": MATCHING_COVERAGE_WORKFLOW });
    try {
      const result = check(
        dir,
        `cls|a.yml|b.yml|DATABASE_URL|no longer true\n${INVOCATION_EXCEPTION}`,
        wf("a.yml", "b.yml"),
      );
      expect(result.staleExceptions.length).toBe(1);
      expect(result.staleExceptions[0]!.key).toBe("DATABASE_URL");
    } finally {
      cleanup();
    }
  });

  test("RED: an unclassified workflow (neither test-running nor exempt) fails", () => {
    const { dir, cleanup, wf } = writeFixtures({ "a.yml": CLEAN_TEST_WORKFLOW, "unknown-shape.yml": NON_TEST_WORKFLOW });
    try {
      const result = check(dir, "", wf("a.yml", "unknown-shape.yml"));
      expect(result.classification.unclassified).toEqual(["unknown-shape.yml"]);
    } finally {
      cleanup();
    }
  });

  test("a workflow with no test invocation and no jobs at all is exempt-eligible (no venue, no crash)", () => {
    const empty = `name: Empty\non: { workflow_dispatch: {} }\njobs: {}\n`;
    const { dir, cleanup, wf } = writeFixtures({ "empty.yml": empty });
    try {
      const result = check(dir, "", wf("empty.yml"));
      expect(result.venues).toEqual([]);
      expect(result.classification.unclassified).toEqual(["empty.yml"]);
    } finally {
      cleanup();
    }
  });

  test("a file that fails to parse as YAML fails loudly, naming the file", () => {
    const { dir, cleanup, wf } = writeFixtures({ "bad.yml": "not: [valid: yaml: at: all: :::\n" });
    try {
      expect(() => check(dir, "", wf("bad.yml"))).toThrow(/bad\.yml/);
    } finally {
      cleanup();
    }
  });
});

// ── live tree ────────────────────────────────────────────────────────────

describe("live tree", () => {
  test("the real repo passes through the shipped exceptions file", () => {
    const result = check(REPO_ROOT);
    if (result.divergences.length > 0 || result.classification.unclassified.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        [
          ...result.divergences.map((d) => `divergence: ${d.workflowA} vs ${d.workflowB} on ${d.key}`),
          ...result.classification.unclassified.map((w) => `unclassified: ${w}`),
        ].join("\n"),
      );
    }
    expect(result.divergences).toEqual([]);
    expect(result.classification.unclassified).toEqual([]);
    expect(result.staleExceptions).toEqual([]);
    expect(result.workflowsScanned).toBeGreaterThan(0);
  });

  test("every real workflow file is classified: test-running or in EXEMPT_WORKFLOWS", () => {
    const result = check(REPO_ROOT);
    const named = new Set([...result.classification.testRunning, ...result.classification.exempt]);
    expect(named.size).toBe(result.workflowsScanned);
  });

  test("scripts/workflow-venue-parity-exceptions.txt on disk parses", () => {
    const text = readFileSync(EXCEPTIONS_PATH, "utf8");
    expect(() => parseExceptions(text)).not.toThrow();
  });

  test("EXEMPT_WORKFLOWS names only workflows that actually exist and have no venue", () => {
    const result = check(REPO_ROOT);
    for (const name of Object.keys(EXEMPT_WORKFLOWS)) {
      expect(result.classification.exempt).toContain(name);
    }
  });
});
