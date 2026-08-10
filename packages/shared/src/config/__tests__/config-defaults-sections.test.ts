/**
 * `scheduler` and `capturePolicy` defaults.
 *
 * These were the only two of the Admin Portal's sixteen Config sections that
 * `GET /api/v1/config` returned as `undefined`: `defaultMassaAiConfig` carried
 * neither, so the Scheduler tab rendered with no fields and the Capture Policy
 * tab said "not configured" while thirty Drop rules were dropping files from
 * every index.
 *
 * Every case runs in a subprocess with its own XDG_CONFIG_HOME — `CONFIG_DIR`
 * is a module-level const frozen at import, so an in-process assignment loses
 * to whichever sibling suite imported `config-loader` first, and the test
 * would write into the developer's real ~/.config/massa-ai/.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";

import {
  CONFIG_TYPES,
  LOADER,
  makeIsolatedConfigHome,
  removeIsolatedConfigHome,
  runIsolated,
  type IsolatedConfigHome,
} from "./isolated-config";

let home: IsolatedConfigHome;

beforeEach(() => {
  home = makeIsolatedConfigHome();
});

afterEach(() => {
  removeIsolatedConfigHome(home);
});

/** Prints `loadConfig()` as JSON so the parent asserts on the real merge. */
const DUMP = `
import { loadConfig } from ${JSON.stringify(LOADER)};
process.stdout.write(JSON.stringify(loadConfig()));
`;

function loadIn(configJson: string | null): Record<string, unknown> {
  if (configJson !== null) {
    fs.mkdirSync(home.configDir, { recursive: true });
    fs.writeFileSync(home.configPath, configJson);
  }
  const run = runIsolated(home, "dump", DUMP);
  expect(run.exitCode).toBe(0);
  return JSON.parse(run.stdout) as Record<string, unknown>;
}

/**
 * Frozen copy of the thirty patterns core's `DEFAULT_POLICY` carried before
 * the declaration moved into `shared`. Written out literally on purpose: a
 * baseline that re-reads the live module would agree with any edit to it,
 * including one that silently changed what gets indexed.
 */
const PRE_MOVE_DROP_PATTERNS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  ".env",
  ".env.*",
  "**/generated/**",
  "**/*.generated.*",
  "**/*.d.ts",
  "**/__tests__/**",
  "**/tests/**",
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.test.js",
  "**/*.test.jsx",
  "**/*.spec.ts",
  "**/*.spec.tsx",
  "**/*.spec.js",
  "**/*.spec.jsx",
  "**/benchmarks/**",
  "**/fixtures/**",
  "**/*.wasm*",
  "**/*.min.*",
  "**/*.map",
  "**/lock.yaml",
  "**/pnpm-lock.yaml",
  "**/package-lock.json",
  "**/bun.lockb",
  "**/yarn.lock",
];

interface SchedulerShape {
  enabled?: boolean;
  tickMs?: number;
  maxConcurrent?: number;
  jobs?: Record<string, { enabled?: boolean; intervalMs?: number }>;
}

interface PolicyShape {
  rules?: Array<{ pattern: string; disposition: string }>;
  maxMatchWork?: number;
  maxIgnorePatterns?: number;
}

describe("scheduler + capturePolicy reach loadConfig()", () => {
  test("a config.json naming neither still resolves both", () => {
    const config = loadIn(JSON.stringify({ dataDir: "/tmp/x" }));

    const scheduler = config.scheduler as SchedulerShape | undefined;
    expect(scheduler).toBeDefined();
    expect(scheduler?.enabled).toBe(false);
    expect(scheduler?.tickMs).toBe(60_000);
    expect(scheduler?.maxConcurrent).toBe(2);
    expect(Object.keys(scheduler?.jobs ?? {}).sort()).toEqual([
      "auto-improve",
      "checkpoint-purge",
      "decay-sweep",
      "memory-consolidation",
      "observation-bridge",
    ]);

    const policy = config.capturePolicy as PolicyShape | undefined;
    expect(policy).toBeDefined();
    expect(policy?.rules?.map((r) => r.pattern)).toEqual(PRE_MOVE_DROP_PATTERNS);
    expect(policy?.rules?.every((r) => r.disposition === "Drop")).toBe(true);
    expect(policy?.maxMatchWork).toBe(100_000);
    expect(policy?.maxIgnorePatterns).toBe(1_024);
  });

  test("an absent config.json resolves both from the defaults", () => {
    const config = loadIn(null);
    expect((config.scheduler as SchedulerShape | undefined)?.tickMs).toBe(60_000);
    expect((config.capturePolicy as PolicyShape | undefined)?.rules).toHaveLength(30);
  });

  test("a partial scheduler block keeps the fields it did not name", () => {
    // The whole reason `scheduler` needs its own merge level: the top-level
    // `...userConfig` spread would replace the block, leaving a Scheduler tab
    // with exactly one field on it.
    const config = loadIn(JSON.stringify({ scheduler: { enabled: true } }));
    const scheduler = config.scheduler as SchedulerShape;

    expect(scheduler.enabled).toBe(true);
    expect(scheduler.tickMs).toBe(60_000);
    expect(scheduler.maxConcurrent).toBe(2);
    expect(Object.keys(scheduler.jobs ?? {})).toHaveLength(5);
  });

  test("a partial job row keeps its default interval", () => {
    const config = loadIn(JSON.stringify({ scheduler: { jobs: { "decay-sweep": { enabled: true } } } }));
    const jobs = (config.scheduler as SchedulerShape).jobs ?? {};

    expect(jobs["decay-sweep"]).toEqual({ enabled: true, intervalMs: 3_600_000 });
    // Untouched siblings survive the partial write.
    expect(jobs["memory-consolidation"]).toEqual({ enabled: false, intervalMs: 1_800_000 });
  });

  test("a configured capturePolicy replaces the default instead of merging", () => {
    // Rule order is the policy: first match wins. Appending defaults behind a
    // user's rules would quietly change which disposition a path resolves to.
    const config = loadIn(
      JSON.stringify({ capturePolicy: { rules: [{ pattern: "**/vendor/**", disposition: "Drop" }] } }),
    );
    const policy = config.capturePolicy as PolicyShape;

    expect(policy.rules).toEqual([{ pattern: "**/vendor/**", disposition: "Drop" }]);
  });

  test("core's DEFAULT_POLICY is the shared default, not a second copy of it", async () => {
    // Reference identity is not assertable here: this file imports the shared
    // module by source path while core imports the built `@massa-ai/shared`,
    // so the two are equal-but-distinct instances by construction.
    const shared = (await import("../massa-ai-config")).DEFAULT_CAPTURE_POLICY;
    const core = (await import("../../../../core/src/services/search/capture-policy.js")).DEFAULT_POLICY;
    expect(core).toEqual(shared);

    // The load-bearing half: two declarations of the same thirty rules is what
    // produced the split-brain, so core's module must contain no rule literal
    // of its own. Content equality alone would pass against a fresh copy.
    const coreSource = fs.readFileSync(
      new URL("../../../../core/src/services/search/capture-policy.ts", import.meta.url),
      "utf8",
    );
    expect(coreSource).not.toMatch(/pattern:\s*"/);
  });

  test("saving one scheduler field does not erase the rest of the section", () => {
    // `savePartialConfig` replaces a top-level section wholesale, so the
    // Admin Portal ticking "Enabled" used to write `{"enabled":true}` over a
    // block holding a hand-tuned decay interval — and the interval was gone
    // from config.json. It also made the restart banner fire on every save,
    // because the stored value it compared against had been filled in by
    // `loadConfig` while the freshly-written one had not.
    fs.mkdirSync(home.configDir, { recursive: true });
    fs.writeFileSync(
      home.configPath,
      JSON.stringify({
        scheduler: {
          enabled: false,
          tickMs: 45_000,
          jobs: { "decay-sweep": { enabled: true, intervalMs: 7_200_000 } },
        },
      }),
    );

    const writer = path.join(import.meta.dir, "..", "config-writer.ts");
    const run = runIsolated(
      home,
      "partial-scheduler-save",
      `
      import { savePartialConfig } from ${JSON.stringify(writer)};
      const first = savePartialConfig({ scheduler: { enabled: true } });
      const resave = savePartialConfig({ scheduler: { enabled: true } });
      process.stdout.write(JSON.stringify({
        changedOnResave: resave.success && resave.changedRestartSections,
        ok: first.success,
      }));
      `,
    );
    expect(run.exitCode).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({ changedOnResave: [], ok: true });

    const stored = JSON.parse(fs.readFileSync(home.configPath, "utf8")) as {
      scheduler: SchedulerShape;
    };
    expect(stored.scheduler.enabled).toBe(true);
    expect(stored.scheduler.tickMs).toBe(45_000);
    expect(stored.scheduler.jobs?.["decay-sweep"]).toEqual({
      enabled: true,
      intervalMs: 7_200_000,
    });
  });

  test("defaultMassaAiConfig itself carries both sections", () => {
    const run = runIsolated(
      home,
      "defaults",
      `
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};
      process.stdout.write(JSON.stringify({
        scheduler: defaultMassaAiConfig.scheduler !== undefined,
        capturePolicy: defaultMassaAiConfig.capturePolicy !== undefined,
      }));
      `,
    );
    expect(run.exitCode).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({ scheduler: true, capturePolicy: true });
  });
});

/**
 * `loadRawUserConfig` vs `loadConfig` — the distinction between "the user wrote
 * false" and "the user wrote nothing".
 *
 * Giving `scheduler` real defaults is what made this contract load-bearing, and
 * it broke a caller the same commit: `scheduler-defaults.ts` resolves
 * `env > config.json > its own preset-adjusted literal`, so a middle layer that
 * can never say "absent" makes the third layer dead code. Its safe-defaults
 * preset stopped enabling anything while `MASSA_AI_SCHEDULER_SAFE_DEFAULTS=true`
 * was still set.
 *
 * These cases pin the property at the layer that owns it, not only at the one
 * caller that noticed — the scheduler's own suite mocks this reader out, so it
 * cannot see a regression here.
 */
describe("loadRawUserConfig — the file layer can say 'absent'", () => {
  /** Both readers from ONE subprocess, so no ordering or freezing difference
   *  between them can be mistaken for the behaviour under test. */
  const BOTH = `
import { loadConfig, loadRawUserConfig } from ${JSON.stringify(LOADER)};
const raw = loadRawUserConfig();
process.stdout.write(JSON.stringify({
  rawScheduler: raw.scheduler ?? null,
  rawKeys: Object.keys(raw).sort(),
  resolvedConsolidation: loadConfig().scheduler?.jobs?.["memory-consolidation"] ?? null,
}));
`;

  function readBoth(configJson: string | null): {
    rawScheduler: Record<string, unknown> | null;
    rawKeys: string[];
    resolvedConsolidation: Record<string, unknown> | null;
  } {
    if (configJson !== null) {
      fs.mkdirSync(home.configDir, { recursive: true });
      fs.writeFileSync(home.configPath, configJson);
    }
    const run = runIsolated(home, "raw-vs-resolved", BOTH);
    expect(run.exitCode).toBe(0);
    return JSON.parse(run.stdout);
  }

  test("no config.json at all: raw is empty, resolved carries the default", () => {
    const { rawScheduler, rawKeys, resolvedConsolidation } = readBoth(null);
    expect(rawScheduler).toBeNull();
    expect(rawKeys).toEqual([]);
    // The defined `false` that made the caller's own fallback unreachable.
    expect(resolvedConsolidation).toEqual({ enabled: false, intervalMs: 1_800_000 });
  });

  test("config.json without a scheduler section: raw still says absent", () => {
    const { rawScheduler, rawKeys, resolvedConsolidation } = readBoth(
      JSON.stringify({ logging: { level: "debug" } }),
    );
    expect(rawScheduler).toBeNull();
    expect(rawKeys).toEqual(["logging"]);
    expect(resolvedConsolidation).toEqual({ enabled: false, intervalMs: 1_800_000 });
  });

  test("one configured job does not fill in its four siblings", () => {
    // The exact key set, not a count: a reader that helpfully merged the other
    // four registered kinds in would still report one *configured* job while
    // silently answering for kinds the user never mentioned.
    const { rawScheduler } = readBoth(
      JSON.stringify({ scheduler: { jobs: { "auto-improve": { enabled: true } } } }),
    );
    expect(rawScheduler).not.toBeNull();
    const jobs = (rawScheduler as { jobs: Record<string, unknown> }).jobs;
    expect(Object.keys(jobs)).toEqual(["auto-improve"]);
    expect(rawScheduler).toEqual({ jobs: { "auto-improve": { enabled: true } } });
  });

  test("an explicit false survives: it is a value, not an absence", () => {
    const { rawScheduler } = readBoth(
      JSON.stringify({ scheduler: { jobs: { "decay-sweep": { enabled: false } } } }),
    );
    // The whole point of the raw read: this `false` must still beat the
    // safe-defaults preset, while the merged default `false` must not.
    expect(rawScheduler).toEqual({ jobs: { "decay-sweep": { enabled: false } } });
  });

  test("malformed and non-object config.json return {} rather than throwing", () => {
    for (const bad of ["{ not json", '"a string"', "[1,2,3]", "null"]) {
      fs.mkdirSync(home.configDir, { recursive: true });
      fs.writeFileSync(home.configPath, bad);
      const run = runIsolated(
        home,
        "raw-bad",
        `
import { loadRawUserConfig } from ${JSON.stringify(LOADER)};
process.stdout.write(JSON.stringify(loadRawUserConfig()));
`,
      );
      expect(run.exitCode).toBe(0);
      expect(JSON.parse(run.stdout)).toEqual({});
    }
  });
});
