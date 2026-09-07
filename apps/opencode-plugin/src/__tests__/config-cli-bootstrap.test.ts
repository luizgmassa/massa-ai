/**
 * `massa-ai-config bootstrap list|show|enable <id>|disable <id>`
 * (T18 / TASK-018, BST-09 AC-3/AC-8, BST-10 AC-10a/AC-12, BST-11 AC-2..AC-6).
 *
 * The twin of `apps/mcp-client/src/__tests__/config-cli-bootstrap.test.ts`,
 * case for case: T18's contract is that the two CLIs behave identically apart
 * from the single `__dirname` / `import.meta.dirname` line, so the suites that
 * prove it have to ask the same questions. The one addition is the
 * `./env-setup` import below, which this package requires and the mcp-client
 * package does not.
 *
 * Only the three seams that touch disk are mocked — `resolveBootstrapState`
 * (reads `config.json`), `setBootstrapRuleEnabled` (writes it) and
 * `applyBootstrapState` (writes a `MASSA-AI.md` per recorded host). Everything
 * else in `@massa-ai/shared` stays real on purpose: `assertKnownRuleId`
 * produces the BST-09 AC-8 message, `formatBootstrapInventory` /
 * `formatBootstrapReport` produce the text the ACs are about, and
 * `bootstrapReportSucceeded` decides the exit code. Mocking those would leave
 * this suite asserting its own fixtures rather than the shipped behaviour.
 *
 * Mocking the two writers is not stylistic either: `applyBootstrapState`
 * defaults to no home at all and the CLI defaults `--target` to
 * `os.homedir()`, so an un-mocked call from a test would render
 * `~/.claude/MASSA-AI.md`, `~/.codex/MASSA-AI.md`, `~/.cursor/MASSA-AI.md` and
 * `~/.config/opencode/MASSA-AI.md` on the machine running the suite, and
 * `setBootstrapRuleEnabled` would rewrite that developer's real
 * `~/.config/massa-ai/config.json` — the file holding `security.apiKey` and
 * `database.url`.
 */

import "./env-setup"; // FIRST import — freezes scratch XDG_CONFIG_HOME before require("@massa-ai/shared") pins CONFIG_DIR
import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

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
  rows: [],
  restartRequired: false,
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

const { runCli } = await import("../config-cli.js");

const RULE_IDS: readonly string[] = actualShared.BOOTSTRAP_RULE_IDS;

/** A resolved state — every registry id present, which is what the real
 *  `resolveBootstrapState` guarantees its callers. */
function fullState(overrides: Record<string, boolean> = {}): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  for (const rule of actualShared.BOOTSTRAP_RULES) state[rule.id] = rule.defaultEnabled;
  return { ...state, ...overrides };
}

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

/** The last options object `applyBootstrapState` was called with. */
function lastApplyOptions(): Record<string, unknown> | undefined {
  return (applyBootstrapState.mock.calls.at(-1) as unknown[] | undefined)?.[0] as
    | Record<string, unknown>
    | undefined;
}

beforeEach(() => {
  resolveBootstrapState.mockClear();
  setBootstrapRuleEnabled.mockClear();
  applyBootstrapState.mockClear();
});

describe("bootstrap list / bootstrap show (BST-11 AC-2, AC-3)", () => {
  test("names every rule id, its current state, its default and a description", async () => {
    resolveBootstrapState.mockImplementationOnce(() => ({
      state: fullState({ "plan-challenge": false, "code-comments": true }),
      ignoredStateKeys: [],
    }));
    const r = await captureConsole(() => runCli(["bootstrap", "list"]));
    expect(r.code).toBe(0);
    for (const id of RULE_IDS) expect(r.out).toContain(`  ${id}: `);
    // A rule switched off against an on default, and one switched on against
    // the off default (BST-08 AC-2) — both columns are read, not just one.
    expect(r.out).toContain(
      "  plan-challenge: disabled (default: enabled) — Run The Fool as a post-plan challenge gate per the configured policy.",
    );
    expect(r.out).toContain(
      "  code-comments: enabled (default: disabled) — Require API doc blocks and rationale comments on generated code, per code-annotation.md §1/§2.",
    );
  });

  test("bootstrap show prints the same inventory as bootstrap list", async () => {
    resolveBootstrapState.mockImplementationOnce(() => ({ state: fullState(), ignoredStateKeys: [] }));
    const list = await captureConsole(() => runCli(["bootstrap", "list"]));
    resolveBootstrapState.mockImplementationOnce(() => ({ state: fullState(), ignoredStateKeys: [] }));
    const show = await captureConsole(() => runCli(["bootstrap", "show"]));
    expect(show.code).toBe(0);
    expect(show.out).toBe(list.out);
  });

  test("an unreadable config.json exits 1 and names the parse failure", async () => {
    resolveBootstrapState.mockImplementationOnce(() => {
      throw new actualShared.ConfigParseError("/tmp/config.json", new Error("Unexpected token }"));
    });
    const r = await captureConsole(() => runCli(["bootstrap", "list"]));
    expect(r.code).toBe(1);
    expect(r.err).toContain("Failed to parse /tmp/config.json: Unexpected token }");
  });
});

describe("unknown rule id (BST-09 AC-8)", () => {
  test.each(["enable", "disable"])(
    "bootstrap %s <unknown> exits non-zero, names the id, lists the nine valid ids and changes no state",
    async (verb) => {
      const r = await captureConsole(() => runCli(["bootstrap", verb, "not-a-rule"]));
      expect(r.code).not.toBe(0);
      expect(r.err).toContain('unknown bootstrap rule "not-a-rule"');
      expect(r.err).toContain(`valid ids: ${RULE_IDS.join(", ")}`);
      // The "changing no state" half. An exit-code-only assertion would pass
      // over a CLI that persisted the flag and failed afterwards, so both
      // mutating seams are asserted untouched: `setBootstrapRuleEnabled` is
      // the only writer of config.json and `applyBootstrapState` the only
      // writer of any MASSA-AI.md.
      expect(setBootstrapRuleEnabled.mock.calls.length).toBe(0);
      expect(applyBootstrapState.mock.calls.length).toBe(0);
    },
  );

  test("the listed ids are exactly the nine in the registry", async () => {
    const r = await captureConsole(() => runCli(["bootstrap", "enable", "nope"]));
    const listed = (r.err.split("valid ids: ")[1] ?? "").trim().split(", ");
    expect(listed).toEqual([...RULE_IDS]);
    expect(listed.length).toBe(9);
  });
});

describe("bootstrap enable / disable (BST-09 AC-3, BST-11 AC-5)", () => {
  test("disable massa-ai-router is accepted — no id is protected", async () => {
    applyBootstrapState.mockImplementationOnce(() => ({
      rows: [{ host: "claude", status: "written" }],
      restartRequired: true,
      dryRun: false,
      ignoredStateKeys: [],
    }));
    const r = await captureConsole(() => runCli(["bootstrap", "disable", "massa-ai-router"]));
    expect(r.code).toBe(0);
    expect(setBootstrapRuleEnabled.mock.calls.at(-1)).toEqual(["massa-ai-router", false]);
  });

  test("enable passes true to the writer and reports the restart requirement", async () => {
    applyBootstrapState.mockImplementationOnce(() => ({
      rows: [{ host: "claude", status: "written" }],
      restartRequired: true,
      dryRun: false,
      ignoredStateKeys: [],
    }));
    const r = await captureConsole(() => runCli(["bootstrap", "enable", "code-comments"]));
    expect(r.code).toBe(0);
    expect(setBootstrapRuleEnabled.mock.calls.at(-1)).toEqual(["code-comments", true]);
    expect(r.out).toContain("  claude: written");
    expect(r.out).toContain("A host session restart is required for the change to take effect.");
  });

  test("a written-not-wired host exits 1 and carries the --apply remedy (BST-10 AC-10a)", async () => {
    applyBootstrapState.mockImplementationOnce(() => ({
      rows: [
        { host: "claude", status: "written" },
        {
          host: "codex",
          status: "written-not-wired",
          reason: "nothing loads it — run scripts/install-skills.sh --apply",
        },
      ],
      restartRequired: true,
      dryRun: false,
      ignoredStateKeys: [],
    }));
    const r = await captureConsole(() => runCli(["bootstrap", "disable", "caveman"]));
    expect(r.code).toBe(1);
    expect(r.out).toContain(
      "  codex: written-not-wired: nothing loads it — run scripts/install-skills.sh --apply",
    );
  });

  test("no host recorded reports it and exits 0 (BST-11 AC-6)", async () => {
    applyBootstrapState.mockImplementationOnce(() => ({
      rows: [],
      restartRequired: false,
      dryRun: false,
      ignoredStateKeys: [],
    }));
    const r = await captureConsole(() => runCli(["bootstrap", "enable", "caveman"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("bootstrap: no host installed");
    expect(r.out).not.toContain("restart is required");
  });

  test("an unregistered persisted key is reported once (BST-10 AC-12)", async () => {
    applyBootstrapState.mockImplementationOnce(() => ({
      rows: [{ host: "claude", status: "written" }],
      restartRequired: true,
      dryRun: false,
      ignoredStateKeys: ["rtk", "legacy-rule"],
    }));
    const r = await captureConsole(() => runCli(["bootstrap", "enable", "caveman"]));
    expect(r.out).toContain(
      "Ignored persisted rule state: rtk, legacy-rule — not a known rule id with a boolean value.",
    );
  });

  test("an engine failure is relayed and exits 1", async () => {
    applyBootstrapState.mockImplementationOnce(() => {
      throw new Error("no bootstrap source given — pass `source` or `sourcePath`");
    });
    const r = await captureConsole(() => runCli(["bootstrap", "enable", "caveman"]));
    expect(r.code).toBe(1);
    expect(r.err).toContain("no bootstrap source given");
  });

  test("the engine is handed the marked-up source in the checkout", async () => {
    await captureConsole(() => runCli(["bootstrap", "enable", "caveman"]));
    expect(String(lastApplyOptions()?.sourcePath)).toEndWith("/skills/AGENTS.md");
  });
});

describe("--target and --dry-run", () => {
  test("--target with --yes scopes the render, leaving the real home untouched", async () => {
    const r = await captureConsole(() =>
      runCli(["bootstrap", "disable", "caveman", "--target", "/tmp/massa-ai-scratch-home", "--yes"]),
    );
    expect(r.code).toBe(0);
    expect(lastApplyOptions()).toMatchObject({
      targetHome: "/tmp/massa-ai-scratch-home",
      dryRun: false,
    });
  });

  test("--target without --yes changes no state (consent gate, design.md:358-363)", async () => {
    const r = await captureConsole(() =>
      runCli(["bootstrap", "disable", "caveman", "--target", "/tmp/massa-ai-scratch-home"]),
    );
    expect(r.code).toBe(1);
    expect(r.err).toContain("--yes");
    expect(setBootstrapRuleEnabled.mock.calls.length).toBe(0);
    expect(applyBootstrapState.mock.calls.length).toBe(0);
  });

  test("--target names both state paths when the persisted file is not the rendered one", async () => {
    const r = await captureConsole(() =>
      runCli(["bootstrap", "enable", "caveman", "--target", "/tmp/massa-ai-scratch-home", "--yes"]),
    );
    expect(r.err).toContain("/tmp/massa-ai-scratch-home/.config/massa-ai/config.json");
    expect(r.err).toContain(actualShared_getConfigPath());
  });

  test("--dry-run persists nothing and plans the render", async () => {
    applyBootstrapState.mockImplementationOnce(() => ({
      rows: [{ host: "claude", status: "written" }],
      restartRequired: false,
      dryRun: true,
      ignoredStateKeys: [],
    }));
    const r = await captureConsole(() => runCli(["bootstrap", "enable", "caveman", "--dry-run"]));
    expect(r.code).toBe(0);
    expect(setBootstrapRuleEnabled.mock.calls.length).toBe(0);
    expect(lastApplyOptions()).toMatchObject({ dryRun: true });
    expect(r.out).toContain("dry run — ");
    expect(r.out).toContain("was not written");
    expect(r.out).not.toContain("restart is required");
  });
});

describe("the CLI works with the massa-ai MCP server unreachable (BST-11 AC-4 / BST-11.5)", () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  beforeEach(() => {
    fetchCalls = 0;
    globalThis.fetch = (async (...args: unknown[]) => {
      fetchCalls += 1;
      throw new Error(`connect ECONNREFUSED — ${String(args[0])}`);
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("list succeeds with every outbound request failing", async () => {
    resolveBootstrapState.mockImplementationOnce(() => ({ state: fullState(), ignoredStateKeys: [] }));
    const r = await captureConsole(() => runCli(["bootstrap", "list"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("  massa-ai-router: enabled");
    expect(fetchCalls).toBe(0);
  });

  test("re-enabling massa-ai-router succeeds with every outbound request failing", async () => {
    applyBootstrapState.mockImplementationOnce(() => ({
      rows: [{ host: "claude", status: "written" }],
      restartRequired: true,
      dryRun: false,
      ignoredStateKeys: [],
    }));
    const r = await captureConsole(() => runCli(["bootstrap", "enable", "massa-ai-router"]));
    expect(r.code).toBe(0);
    expect(setBootstrapRuleEnabled.mock.calls.at(-1)).toEqual(["massa-ai-router", true]);
    expect(fetchCalls).toBe(0);
  });
});

describe("dispatch, help and argument validation", () => {
  test("--help advertises the bootstrap subcommand surface (BST-11 AC-2)", async () => {
    const r = await captureConsole(() => runCli(["--help"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("bootstrap list");
    expect(r.out).toContain("bootstrap show");
    expect(r.out).toContain("bootstrap enable <rule-id>");
    expect(r.out).toContain("bootstrap disable <rule-id>");
    expect(r.out).toContain("--target");
    expect(r.out).toContain("massa-ai-config bootstrap disable caveman");
  });

  test("an unknown bootstrap subcommand exits 1 with the usage line", async () => {
    const r = await captureConsole(() => runCli(["bootstrap", "bogus"]));
    expect(r.code).toBe(1);
    expect(r.err).toContain("Usage: massa-ai-config bootstrap <list|show|enable|disable>");
    expect(setBootstrapRuleEnabled.mock.calls.length).toBe(0);
    expect(applyBootstrapState.mock.calls.length).toBe(0);
  });

  test("enable with no rule id exits 1 and changes no state", async () => {
    const r = await captureConsole(() => runCli(["bootstrap", "enable"]));
    expect(r.code).toBe(1);
    expect(r.err).toContain("bootstrap <enable|disable> <rule-id>");
    expect(setBootstrapRuleEnabled.mock.calls.length).toBe(0);
    expect(applyBootstrapState.mock.calls.length).toBe(0);
  });
});

/** `getConfigPath` reaches the CLI through `@massa-ai/shared/config`, a
 *  different specifier from the mocked root barrel, so it is the real one on
 *  both sides of the assertion. */
function actualShared_getConfigPath(): string {
  return (require("@massa-ai/shared/config") as { getConfigPath(): string }).getConfigPath();
}
