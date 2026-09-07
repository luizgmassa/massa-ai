/**
 * Cross-CLI `profile` + `bootstrap` subcommand parity
 * (T13 / TASK-013, MPS-06 AC4; T19 / TASK-019, BST-11, BST-12).
 *
 * `apps/mcp-client/src/config-cli.ts` and `apps/opencode-plugin/src/config-cli.ts`
 * are two independent implementations of the same `massa-ai-config` surface
 * (design Risk: "Two `config-cli.ts` implementations drift"). This asserts
 * both expose the identical subcommand sets with the same validation
 * behaviour, delegating to the same `@massa-ai/shared` engines rather than
 * diverging.
 *
 * The `profile` block below exercises argument-validation paths only (missing
 * name, invalid host, unknown subcommand) — none reach the real switch engine,
 * which defaults to `os.homedir()` and must never be invoked un-mocked from a
 * test (would risk mutating installed host plugins on the machine running the
 * suite).
 *
 * T19 widens that to the `bootstrap` block, and widens it past text. Source
 * identity is not behavioural parity: the two `case "bootstrap"` blocks are
 * byte-identical today apart from their `import.meta.dirname` / `__dirname`
 * line, but a line-count-plus-diff assertion over that span would pass over
 * two CLIs whose shared callee behaves differently per caller, and would go on
 * passing if one CLI stopped calling the persistence writer at all. So the
 * guard here reaches **persistence**: `setBootstrapRuleEnabled` is the only
 * writer of `~/.config/massa-ai/config.json` and `applyBootstrapState` the
 * only writer of any `MASSA-AI.md`, and every case below compares the exact
 * arguments each CLI hands them, per CLI, for the same argv.
 *
 * Both writers — and the `resolveBootstrapState` reader — are mocked, and that
 * is a safety requirement, not a style choice. `setBootstrapRuleEnabled` takes
 * no path and writes `getConfigPath()`, frozen at module-eval time, so
 * `--target` cannot redirect it; an un-mocked `bootstrap enable` from this
 * suite would rewrite the developer's real `config.json` (the file holding
 * `security.apiKey` and `database.url`) and render four `MASSA-AI.md` files
 * into their real home. The mock shape mirrors
 * `apps/mcp-client/src/__tests__/config-cli-bootstrap.test.ts:26-52`.
 *
 * Both CLIs import the three seams from the `@massa-ai/shared` root barrel
 * (`config-cli.ts:11-30` in each), which resolves to one module, so a single
 * `mock.module` registration intercepts both. Everything else in the barrel
 * stays real via the spread: `assertKnownRuleId`, `formatBootstrapInventory`,
 * `formatBootstrapReport` and `bootstrapReportSucceeded` are what the parity
 * claims are about, and mocking them would leave this suite asserting its own
 * fixtures. `getConfigPath` arrives through `@massa-ai/shared/config`, a
 * different specifier, and is untouched here.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

const resolveBootstrapState = mock((..._args: unknown[]): unknown => ({
  state: {},
  ignoredStateKeys: [],
}));
const setBootstrapRuleEnabled = mock((..._args: unknown[]): unknown => ({
  id: "caveman",
  enabled: false,
  changed: true,
  state: {},
  ignoredStateKeys: [],
}));
const applyBootstrapState = mock((..._args: unknown[]): unknown => ({
  rows: [{ host: "claude", status: "written" }],
  restartRequired: true,
  dryRun: false,
  ignoredStateKeys: [],
}));

// Pre-resolved BEFORE registering the mock — a `require()` inside the factory
// recurses and silently drops exports (config-cli-profile.test.ts:29-31).
const actualShared = require("@massa-ai/shared");
mock.module("@massa-ai/shared", () => ({
  ...actualShared,
  resolveBootstrapState: (...args: unknown[]) => resolveBootstrapState(...args),
  setBootstrapRuleEnabled: (...args: unknown[]) => setBootstrapRuleEnabled(...args),
  applyBootstrapState: (...args: unknown[]) => applyBootstrapState(...args),
}));

// Dynamic, and after the registration above: a static import hoists past
// `mock.module` and would bind both CLIs to the real writers.
const { runCli: mcpRunCli } = await import("../../apps/mcp-client/src/config-cli.js");
const { runCli: ocRunCli } = await import("../../apps/opencode-plugin/src/config-cli.js");

const CLIS = [
  ["mcp-client", mcpRunCli],
  ["opencode-plugin", ocRunCli],
] as const;

const RULE_IDS: readonly string[] = actualShared.BOOTSTRAP_RULE_IDS;

function captureConsole(fn: () => Promise<number>): Promise<{ code: number; out: string; err: string }> {
  let out = "";
  let err = "";
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a: unknown[]) => { out += a.join(" ") + "\n"; };
  console.error = (...a: unknown[]) => { err += a.join(" ") + "\n"; };
  return fn().then(
    (code) => { console.log = origLog; console.error = origErr; return { code, out, err }; },
    (e) => { console.log = origLog; console.error = origErr; throw e; },
  );
}

beforeEach(() => {
  resolveBootstrapState.mockClear();
  setBootstrapRuleEnabled.mockClear();
  applyBootstrapState.mockClear();
});

describe("profile subcommand — cross-CLI parity", () => {
  test.each(CLIS)("%s: --help advertises profile list|show|set", async (_name, runCli) => {
    const r = await captureConsole(() => runCli(["--help"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("profile list");
    expect(r.out).toContain("profile show");
    expect(r.out).toContain("profile set");
    expect(r.out).toMatch(/--host/);
    expect(r.out).toMatch(/--dry-run/);
  });

  test.each(CLIS)("%s: profile set with no name → exit 1, usage error", async (_name, runCli) => {
    const r = await captureConsole(() => runCli(["profile", "set"]));
    expect(r.code).toBe(1);
    expect(r.err).toContain("profile set <name>");
  });

  test.each(CLIS)("%s: profile set with an unknown host → exit 1, no engine call", async (_name, runCli) => {
    const r = await captureConsole(() => runCli(["profile", "set", "work", "--host", "nonesuch"]));
    expect(r.code).toBe(1);
    expect(r.err).toContain('unknown host "nonesuch"');
  });

  test.each(CLIS)("%s: profile with an unknown subcommand → exit 1, usage error", async (_name, runCli) => {
    const r = await captureConsole(() => runCli(["profile", "bogus"]));
    expect(r.code).toBe(1);
    expect(r.err).toContain("profile <list|show|set>");
  });

  test("both CLIs produce byte-identical usage errors for the same invalid input (drift guard)", async () => {
    const [mcp, oc] = await Promise.all([
      captureConsole(() => mcpRunCli(["profile", "set", "work", "--host", "nonesuch"])),
      captureConsole(() => ocRunCli(["profile", "set", "work", "--host", "nonesuch"])),
    ]);
    expect(mcp.code).toBe(oc.code);
    expect(mcp.err).toBe(oc.err);
  });
});

// ── T19: the bootstrap subcommand, sensed at the persistence seam ───────────

/** One CLI's whole observable footprint for a single argv: what it printed,
 *  what it exited with, and — the part `--help` and argument-validation
 *  assertions cannot see — every argument it handed the two writers. */
interface Footprint {
  code: number;
  out: string;
  err: string;
  /** Every `setBootstrapRuleEnabled(id, enabled)` call, in order. This is the
   *  persistence channel: `config.json` is written here and nowhere else. */
  persistCalls: unknown[][];
  /** Every `applyBootstrapState(options)` call, in order — the `MASSA-AI.md`
   *  delivery channel. */
  applyCalls: unknown[][];
}

async function footprint(runCli: (argv: string[]) => Promise<number>, argv: string[]): Promise<Footprint> {
  resolveBootstrapState.mockClear();
  setBootstrapRuleEnabled.mockClear();
  applyBootstrapState.mockClear();
  const r = await captureConsole(() => runCli(argv));
  return {
    ...r,
    persistCalls: setBootstrapRuleEnabled.mock.calls.map((c) => [...(c as unknown[])]),
    applyCalls: applyBootstrapState.mock.calls.map((c) => [...(c as unknown[])]),
  };
}

/** Runs `argv` through both CLIs, sequentially — the mocks are shared module
 *  state, so a `Promise.all` here would interleave the two call logs. */
async function bothFootprints(argv: string[]): Promise<{ mcp: Footprint; oc: Footprint }> {
  const mcp = await footprint(mcpRunCli, argv);
  const oc = await footprint(ocRunCli, argv);
  return { mcp, oc };
}

describe("bootstrap subcommand — cross-CLI parity (T19, BST-11/BST-12)", () => {
  test.each(CLIS)("%s: --help advertises bootstrap list|show|enable|disable", async (_name, runCli) => {
    const r = await captureConsole(() => runCli(["--help"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("bootstrap list");
    expect(r.out).toContain("bootstrap show");
    expect(r.out).toContain("bootstrap enable <rule-id>");
    expect(r.out).toContain("bootstrap disable <rule-id>");
  });

  test("enable persists identically in both CLIs — same id, same value, exactly once", async () => {
    const { mcp, oc } = await bothFootprints(["bootstrap", "enable", "code-comments"]);

    // The done-when this test exists for: "an `enable` that persists in one
    // CLI and not the other". A CLI that never reached `setBootstrapRuleEnabled`
    // has an empty log here while still printing the same report and exiting 0,
    // so the exit-code and stdout comparisons below cannot see it — only this
    // can.
    expect(mcp.persistCalls).toEqual([["code-comments", true]]);
    expect(oc.persistCalls).toEqual(mcp.persistCalls);

    expect(mcp.code).toBe(0);
    expect(oc.code).toBe(mcp.code);
    expect(oc.out).toBe(mcp.out);
    expect(oc.err).toBe(mcp.err);
  });

  test("disable persists identically in both CLIs — the false value, not just the id", async () => {
    const { mcp, oc } = await bothFootprints(["bootstrap", "disable", "massa-ai-router"]);
    // Both halves of the boolean matter: a CLI hard-coding `true` would still
    // call the writer once with the right id.
    expect(mcp.persistCalls).toEqual([["massa-ai-router", false]]);
    expect(oc.persistCalls).toEqual(mcp.persistCalls);
    expect(oc.code).toBe(mcp.code);
    expect(oc.out).toBe(mcp.out);
  });

  test("every registry id persists identically through both CLIs", async () => {
    expect(RULE_IDS.length).toBe(9);
    for (const id of RULE_IDS) {
      const { mcp, oc } = await bothFootprints(["bootstrap", "enable", id]);
      expect(mcp.persistCalls).toEqual([[id, true]]);
      expect(oc.persistCalls).toEqual(mcp.persistCalls);
    }
  });

  test("both CLIs hand the delivery engine the same options for the same argv", async () => {
    const { mcp, oc } = await bothFootprints(["bootstrap", "enable", "caveman"]);
    expect(mcp.applyCalls.length).toBe(1);
    expect(oc.applyCalls.length).toBe(1);

    const mcpOpts = mcp.applyCalls[0]![0] as Record<string, unknown>;
    const ocOpts = oc.applyCalls[0]![0] as Record<string, unknown>;
    expect(ocOpts).toEqual(mcpOpts);
    // The two blocks differ on exactly one source line — `import.meta.dirname`
    // vs `__dirname` — and this is the assertion that says that divergence
    // must not reach the engine: both walks must land on the same checkout.
    expect(String(mcpOpts.sourcePath)).toEndWith("/skills/AGENTS.md");
    expect(ocOpts.sourcePath).toBe(mcpOpts.sourcePath);
  });

  test("--dry-run persists nothing in BOTH CLIs, and still plans the same delivery", async () => {
    const { mcp, oc } = await bothFootprints(["bootstrap", "enable", "caveman", "--dry-run"]);
    // The inverse direction of the persistence assertion: a CLI that dropped
    // the dry-run guard writes `config.json` here while its exit code and
    // report stay identical to the compliant one.
    expect(mcp.persistCalls).toEqual([]);
    expect(oc.persistCalls).toEqual([]);
    expect((mcp.applyCalls[0]![0] as Record<string, unknown>).dryRun).toBe(true);
    expect((oc.applyCalls[0]![0] as Record<string, unknown>).dryRun).toBe(true);
    expect(oc.code).toBe(mcp.code);
  });

  test("an unknown rule id reaches neither writer, in either CLI (BST-09 AC-8)", async () => {
    const { mcp, oc } = await bothFootprints(["bootstrap", "enable", "not-a-rule"]);
    for (const f of [mcp, oc]) {
      expect(f.code).not.toBe(0);
      expect(f.persistCalls).toEqual([]);
      expect(f.applyCalls).toEqual([]);
      expect(f.err).toContain('unknown bootstrap rule "not-a-rule"');
      expect(f.err).toContain(`valid ids: ${RULE_IDS.join(", ")}`);
    }
    expect(oc.err).toBe(mcp.err);
  });

  test("a redirected --target without --yes reaches neither writer, in either CLI", async () => {
    const { mcp, oc } = await bothFootprints([
      "bootstrap", "disable", "caveman", "--target", "/tmp/massa-ai-parity-scratch-home",
    ]);
    for (const f of [mcp, oc]) {
      expect(f.code).toBe(1);
      expect(f.persistCalls).toEqual([]);
      expect(f.applyCalls).toEqual([]);
      expect(f.err).toContain("--yes");
    }
    expect(oc.err).toBe(mcp.err);
  });

  test("a redirected --target with --yes scopes delivery identically in both CLIs", async () => {
    const { mcp, oc } = await bothFootprints([
      "bootstrap", "disable", "caveman", "--target", "/tmp/massa-ai-parity-scratch-home", "--yes",
    ]);
    for (const f of [mcp, oc]) {
      expect(f.persistCalls).toEqual([["caveman", false]]);
      expect((f.applyCalls[0]![0] as Record<string, unknown>).targetHome).toBe(
        "/tmp/massa-ai-parity-scratch-home",
      );
    }
    expect(oc.code).toBe(mcp.code);
    expect(oc.err).toBe(mcp.err);
  });

  test("bootstrap list reads the same state seam and prints the same inventory in both CLIs", async () => {
    const fullState: Record<string, boolean> = {};
    for (const rule of actualShared.BOOTSTRAP_RULES) fullState[rule.id] = rule.defaultEnabled;

    resolveBootstrapState.mockImplementation(() => ({ state: fullState, ignoredStateKeys: [] }));
    try {
      const { mcp, oc } = await bothFootprints(["bootstrap", "list"]);
      expect(mcp.code).toBe(0);
      expect(oc.code).toBe(0);
      expect(oc.out).toBe(mcp.out);
      // A read path must not reach either writer.
      expect(mcp.persistCalls).toEqual([]);
      expect(oc.persistCalls).toEqual([]);
      expect(mcp.applyCalls).toEqual([]);
      expect(oc.applyCalls).toEqual([]);
      for (const id of RULE_IDS) expect(mcp.out).toContain(`  ${id}: `);
    } finally {
      resolveBootstrapState.mockReset();
      resolveBootstrapState.mockImplementation(() => ({ state: {}, ignoredStateKeys: [] }));
    }
  });

  test("both CLIs produce byte-identical usage errors for an unknown bootstrap subcommand", async () => {
    const { mcp, oc } = await bothFootprints(["bootstrap", "bogus"]);
    expect(mcp.code).toBe(1);
    expect(oc.code).toBe(mcp.code);
    expect(oc.err).toBe(mcp.err);
    expect(mcp.err).toContain("Usage: massa-ai-config bootstrap <list|show|enable|disable>");
  });
});
