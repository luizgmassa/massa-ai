/**
 * Bootstrap renderer unit tests (T6 / TASK-006, BST-01, BST-04, BST-06,
 * BST-07, BST-08, BST-10).
 *
 * Two fixture families, deliberately:
 *
 *   - **The real `skills/AGENTS.md`.** The spec's own sensor for BST-06 AC-2
 *     is "`grep -ci rtk` over `skills/AGENTS.md` and over the rendered
 *     contract, asserted at 0 in the renderer suite" (spec.md Verification
 *     Approach), and the §1/§2/§3 and per-rule assertions are only meaningful
 *     against the text that actually ships. The path is resolved from
 *     `import.meta.dir` and its absence throws by name rather than skipping —
 *     a suite that silently stops asserting when its fixture moves is worth
 *     less than no suite.
 *   - **Synthetic sources built from the registry.** A property the real
 *     source cannot exercise — that a *disabled* span's text is gone, `rtk`
 *     included — needs a source that carries the text in the first place. The
 *     synthetic builder plants it and both directions are asserted, so a
 *     renderer that stopped removing spans reddens here instead of passing on
 *     an input where the property is vacuous.
 *
 * Assertions are set- and content-shaped rather than count-shaped, matching
 * `rules.test.ts` and `state.test.ts`: the per-rule cases are generated from
 * `BOOTSTRAP_RULES`, and the "which lines belong to which rule" table is
 * derived from the source itself, so swapping one id for another reddens
 * instead of keeping a count intact.
 *
 * This suite installs no `spyOn` — the renderer is pure and takes its source
 * as a string, so nothing here can leak an fs stub into a sibling file of the
 * one `bun test` process `packages/shared` runs.
 */

import { describe, test, expect } from "bun:test";
import fs from "fs";
import path from "path";

import { HOSTS, type Host } from "../../profile-switch/hosts";
import {
  BOOTSTRAP_RULES,
  BOOTSTRAP_RULE_IDS,
  bootstrapRuleDefaults,
  type BootstrapRuleId,
} from "../rules";
import { BOOTSTRAP_STATE_PATH, type BootstrapState } from "../state";
import {
  BOOTSTRAP_BLOCK_END,
  BOOTSTRAP_BLOCK_START,
  BootstrapRenderError,
  bootstrapContractPath,
  bootstrapStateFilePath,
  renderBootstrap,
  ruleMarker,
} from "../render";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** `packages/shared/src/bootstrap/__tests__` → repository root. */
const REPO_ROOT = path.resolve(import.meta.dir, "../../../../..");
const SOURCE_PATH = path.join(REPO_ROOT, "skills", "AGENTS.md");

function readRealSource(): string {
  if (!fs.existsSync(SOURCE_PATH)) {
    throw new Error(
      `bootstrap source fixture not found at ${SOURCE_PATH} — this suite asserts against the real skills/AGENTS.md and must not pass without it`,
    );
  }
  return fs.readFileSync(SOURCE_PATH, "utf-8");
}

const REAL_SOURCE = readRealSource();

/** An absolute path that is never created: the renderer performs no I/O. */
const TARGET_HOME = "/tmp/massa-ai-render-suite-home";

function stateOf(value: boolean, overrides: Partial<Record<BootstrapRuleId, boolean>> = {}) {
  const state = {} as Record<BootstrapRuleId, boolean>;
  for (const rule of BOOTSTRAP_RULES) state[rule.id] = value;
  return { ...state, ...overrides } as BootstrapState;
}

const ALL_ON = stateOf(true);
const ALL_OFF = stateOf(false);
const DEFAULTS = bootstrapRuleDefaults() as BootstrapState;

/** Every toggle state BST-06 AC-2 and the marker sweep are asserted over. */
const STATE_MATRIX: readonly (readonly [string, BootstrapState])[] = [
  ["defaults", DEFAULTS],
  ["all enabled", ALL_ON],
  ["all disabled", ALL_OFF],
  ...BOOTSTRAP_RULES.map(
    (rule) => [`only ${rule.id} disabled`, stateOf(true, { [rule.id]: false })] as const,
  ),
  ...BOOTSTRAP_RULES.map(
    (rule) => [`only ${rule.id} enabled`, stateOf(false, { [rule.id]: true })] as const,
  ),
];

function render(state: BootstrapState, host: Host = "codex", source: string = REAL_SOURCE) {
  return renderBootstrap({ source, state, host, targetHome: TARGET_HOME });
}

// ---------------------------------------------------------------------------
// Source-derived per-rule signature lines
// ---------------------------------------------------------------------------

/**
 * The lines of one rule's span in the real source, split into the text
 * rendered while the rule is enabled and the text rendered while it is
 * disabled. Parsed with the module's own `ruleMarker` so the suite cannot
 * drift from the format the renderer matches.
 */
function spanLines(id: BootstrapRuleId): { on: string[]; off: string[] } {
  const lines = REAL_SOURCE.split("\n");
  const at = (marker: string) => lines.findIndex((line) => line.trim() === marker);
  const start = at(ruleMarker(id, "start"));
  const end = at(ruleMarker(id, "end"));
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  const inner = lines.slice(start + 1, end);
  const offStart = inner.findIndex((line) => line.trim() === ruleMarker(id, "off"));
  const offEnd = inner.findIndex((line) => line.trim() === ruleMarker(id, "off-end"));
  if (offStart === -1) return { on: inner, off: [] };
  return {
    on: [...inner.slice(0, offStart), ...inner.slice(offEnd + 1)],
    off: inner.slice(offStart + 1, offEnd),
  };
}

/** How often a trimmed line occurs across the whole source. */
const LINE_FREQUENCY = ((): Map<string, number> => {
  const freq = new Map<string, number>();
  for (const line of REAL_SOURCE.split("\n")) {
    const key = line.trim();
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  return freq;
})();

/**
 * Lines that identify one rule's span and no other text in the source: long
 * enough not to collide by accident, unique in the file, and outside fenced
 * blocks (a fence's contents are indentation-sensitive data, not prose).
 *
 * Deriving these from the source rather than hardcoding a phrase per rule is
 * what makes the per-rule cases below survive a wording change while still
 * failing when a span stops being removed.
 */
function signatureLines(lines: readonly string[]): string[] {
  const signatures: string[] = [];
  let inFence = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence || line.length < 30) continue;
    if (LINE_FREQUENCY.get(line) === 1) signatures.push(line);
  }
  return signatures;
}

const RULE_SIGNATURES: ReadonlyMap<BootstrapRuleId, readonly string[]> = new Map(
  BOOTSTRAP_RULES.map((rule) => [rule.id, signatureLines(spanLines(rule.id).on)] as const),
);

// ---------------------------------------------------------------------------
// Synthetic sources
// ---------------------------------------------------------------------------

/**
 * A source carrying one well-formed span per registry rule, so a test can
 * plant text the real source deliberately does not have.
 */
function syntheticSource(
  bodies: Partial<Record<BootstrapRuleId, readonly string[]>> = {},
  extra: { readonly offText?: Partial<Record<BootstrapRuleId, readonly string[]>> } = {},
): string {
  const out: string[] = [BOOTSTRAP_BLOCK_START, "# Intro", "", "Intro paragraph.", ""];
  for (const rule of BOOTSTRAP_RULES) {
    out.push(ruleMarker(rule.id, "start"));
    out.push(...(bodies[rule.id] ?? [`## Section ${rule.id}`, "", `Body text for ${rule.id}.`]));
    const off = extra.offText?.[rule.id];
    if (off) {
      out.push(ruleMarker(rule.id, "off"), ...off, ruleMarker(rule.id, "off-end"));
    }
    out.push(ruleMarker(rule.id, "end"), "");
  }
  out.push(BOOTSTRAP_BLOCK_END, "", "# Text outside the block", "");
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// AC-1 — determinism (BST-10 AC-7)
// ---------------------------------------------------------------------------

describe("determinism (BST-10 AC-7)", () => {
  for (const [label, state] of [
    ["defaults", DEFAULTS],
    ["all enabled", ALL_ON],
    ["all disabled", ALL_OFF],
  ] as const) {
    test(`renders byte-identical output twice — ${label}`, () => {
      const first = render(state);
      const second = render(state);
      expect(second.contract).toBe(first.contract);
      expect(second.pointer).toBe(first.pointer);
    });
  }

  test("output does not depend on the state object's key order", () => {
    // The design's determinism clause is specifically "iterating BOOTSTRAP_RULES
    // in registry order and never from object key order" (design.md:199-200).
    // An equal state built back-to-front is the input that tells the two apart.
    const reversed = {} as Record<BootstrapRuleId, boolean>;
    for (const rule of [...BOOTSTRAP_RULES].reverse()) reversed[rule.id] = DEFAULTS[rule.id];
    expect(render(reversed as BootstrapState).contract).toBe(render(DEFAULTS).contract);
  });

  test("distinct states render distinct contracts, so identity is not trivial", () => {
    expect(render(ALL_ON).contract).not.toBe(render(ALL_OFF).contract);
  });
});

// ---------------------------------------------------------------------------
// AC-2 — code-comments off-text and the untouched §3 (BST-08 AC-5, AC-6)
// ---------------------------------------------------------------------------

describe("code-comments off-text (BST-08 AC-5)", () => {
  const negative = "no API doc blocks and no";
  const positive = "While `code-comments` is enabled";

  test("disabled emits the negative directive and drops the rest of the span", () => {
    const { contract } = render(stateOf(true, { "code-comments": false }));
    expect(contract).toContain(negative);
    expect(contract).toContain("overriding §1 (API Doc Block) and §2 (Rationale Comment)");
    expect(contract).not.toContain(positive);
  });

  test("enabled emits the span without the off-text", () => {
    const { contract } = render(stateOf(true, { "code-comments": true }));
    expect(contract).toContain(positive);
    expect(contract).not.toContain(negative);
  });

  test("the registry default (disabled) renders the negative directive", () => {
    expect(DEFAULTS["code-comments"]).toBe(false);
    expect(render(DEFAULTS).contract).toContain(negative);
  });

  test("no other rule carries an off-text, so no other span survives its own disable", () => {
    // Guards the generalisation: the mechanism keys on the markers, so a
    // second off-span added to the source would be picked up here.
    const withOffText = BOOTSTRAP_RULES.filter((rule) => spanLines(rule.id).off.length > 0).map(
      (rule) => rule.id,
    );
    expect(withOffText).toEqual(["code-comments"]);
  });
});

describe("§3 of code-annotation.md is untouched in both states (BST-08 AC-6)", () => {
  for (const [label, state] of [
    ["code-comments enabled", stateOf(true, { "code-comments": true })],
    ["code-comments disabled", stateOf(true, { "code-comments": false })],
    ["every rule disabled", ALL_OFF],
  ] as const) {
    test(`names only §1 and §2 — ${label}`, () => {
      const { contract } = render(state);
      // Set-shaped over every section reference in the render: a directive
      // that grew to cover §3 changes this set, where a "does it contain §1"
      // check would not.
      expect(new Set(contract.match(/§\d+/g) ?? [])).toEqual(new Set(["§1", "§2"]));
    });

    test(`every code-annotation paragraph is §1/§2-scoped — ${label}`, () => {
      // Paragraph-scoped, not line-scoped: the source's own reference spans a
      // newline ("…§2 (Rationale Comment)\nof `…code-annotation.md`"), and a
      // line-oriented check could not see a claim written across one.
      const paragraphs = render(state)
        .contract.split(/\n\s*\n/)
        .filter((p) => p.includes("code-annotation.md"));
      expect(paragraphs.length).toBeGreaterThan(0);
      for (const paragraph of paragraphs) {
        expect(paragraph).toContain("§1");
        expect(paragraph).toContain("§2");
        expect(paragraph).not.toContain("§3");
        expect(paragraph).not.toMatch(/\btests?\b/i);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// AC-3 — no `rtk` in any toggle state (BST-06 AC-2)
// ---------------------------------------------------------------------------

describe("rtk count is 0 in every toggle state (BST-06 AC-2)", () => {
  for (const [label, state] of STATE_MATRIX) {
    test(`no case-insensitive "rtk" — ${label}`, () => {
      const { contract, pointer } = render(state);
      expect(contract.toLowerCase()).not.toContain("rtk");
      expect(pointer.toLowerCase()).not.toContain("rtk");
    });
  }

  test("a disabled span carrying rtk leaves nothing behind", () => {
    // The real source has no `rtk` at all, so the assertions above hold for a
    // renderer that removes nothing. This one plants the literal inside a span
    // and asserts both directions, which that renderer fails.
    const source = syntheticSource({
      "plan-challenge": ["## Conditional RTK Rules", "", "Prefix shell commands with `rtk`."],
    });
    expect(
      render(stateOf(true, { "plan-challenge": false }), "codex", source).contract.toLowerCase(),
    ).not.toContain("rtk");
    expect(render(ALL_ON, "codex", source).contract.toLowerCase()).toContain("rtk");
  });
});

// ---------------------------------------------------------------------------
// AC-4 — always-rendered header region and the all-off body (BST-10 AC-9)
// ---------------------------------------------------------------------------

describe("always-rendered header region (BST-10 AC-9, spec Edge Cases)", () => {
  for (const [label, state] of STATE_MATRIX) {
    test(`names the state file, the key, and the recovery command — ${label}`, () => {
      const { contract } = render(state);
      expect(contract).toContain(bootstrapStateFilePath(TARGET_HOME));
      expect(contract).toContain(BOOTSTRAP_STATE_PATH);
      expect(contract).toContain("massa-ai-config bootstrap list");
      expect(contract).toContain("massa-ai-config bootstrap enable <rule-id>");
      // The one state where this file is the user's only remaining
      // instruction is `massa-ai-router` off, so the id is named literally.
      expect(contract).toContain("massa-ai-config bootstrap enable massa-ai-router");
    });
  }

  test("the header survives with massa-ai-router itself disabled", () => {
    const { contract } = render(stateOf(true, { "massa-ai-router": false }));
    for (const line of RULE_SIGNATURES.get("massa-ai-router") ?? []) {
      expect(contract).not.toContain(line);
    }
    expect(contract).toContain("massa-ai-config bootstrap enable massa-ai-router");
  });

  test("the all-off render states that every rule is disabled", () => {
    expect(render(ALL_OFF).contract).toContain("Every massa-ai bootstrap rule is disabled");
  });

  test("that statement is absent whenever any rule is enabled", () => {
    for (const rule of BOOTSTRAP_RULES) {
      const contract = render(stateOf(false, { [rule.id]: true })).contract;
      expect(contract).not.toContain("Every massa-ai bootstrap rule is disabled");
    }
  });

  test("the header carries no timestamp, version, or host name", () => {
    // Any of the three would make a re-render differ and would report as
    // permanent installer drift rather than as a failure.
    const perHost = HOSTS.map((host) => render(DEFAULTS, host).contract);
    for (const contract of perHost) expect(contract).toBe(perHost[0]);
  });
});

// ---------------------------------------------------------------------------
// AC-5 — the pointer template (BST-04 AC-6, AC-7)
// ---------------------------------------------------------------------------

describe("pointer template (BST-04 AC-6, AC-7)", () => {
  const EXPECTED_CONTRACT_PATH: Readonly<Record<Host, string>> = {
    claude: `${TARGET_HOME}/.claude/MASSA-AI.md`,
    codex: `${TARGET_HOME}/.codex/MASSA-AI.md`,
    cursor: `${TARGET_HOME}/.cursor/MASSA-AI.md`,
    opencode: `${TARGET_HOME}/.config/opencode/MASSA-AI.md`,
  };

  for (const host of HOSTS) {
    test(`names ${host}'s absolute MASSA-AI.md path`, () => {
      expect(bootstrapContractPath(host, TARGET_HOME)).toBe(EXPECTED_CONTRACT_PATH[host]);
      expect(render(DEFAULTS, host).pointer).toContain(EXPECTED_CONTRACT_PATH[host]);
    });

    test(`instructs the agent to read it before substantive work — ${host}`, () => {
      const { pointer } = render(DEFAULTS, host);
      expect(pointer).toContain("Before substantive work");
      expect(pointer).toContain("read");
    });
  }

  for (const [label, state] of STATE_MATRIX) {
    test(`is at most 10 lines — ${label}`, () => {
      for (const host of HOSTS) {
        expect(render(state, host).pointer.trimEnd().split("\n").length).toBeLessThanOrEqual(10);
      }
    });
  }

  test("carries no policy text: no rule's own lines appear in it", () => {
    // Derived from the artifact rather than from a hand-picked banned-phrase
    // list, so a policy paragraph pasted in from any of the nine spans is
    // caught, not just the ones someone thought to name.
    const pointer = render(ALL_ON, "cursor").pointer;
    for (const [id, lines] of RULE_SIGNATURES) {
      for (const line of lines) {
        expect(`${id}: ${pointer}`).not.toContain(line);
      }
    }
  });

  test("is state-independent, so no toggle can leak into it", () => {
    for (const host of HOSTS) {
      const base = render(ALL_ON, host).pointer;
      for (const [, state] of STATE_MATRIX) {
        expect(render(state, host).pointer).toBe(base);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// AC-6 — all nine rules switchable both ways (BST-10 AC-4, BST-09 AC-3)
// ---------------------------------------------------------------------------

describe("every rule is individually switchable in both directions (BST-10 AC-4)", () => {
  test("every rule has at least one source-unique signature line to assert on", () => {
    // Without this the per-rule cases below could pass vacuously on an empty
    // signature list — the "a mutation resolving to nothing reads as a gate
    // catching nothing" failure.
    const empty = [...RULE_SIGNATURES.entries()].filter(([, lines]) => lines.length === 0);
    expect(empty.map(([id]) => id)).toEqual([]);
    expect(new Set(RULE_SIGNATURES.keys())).toEqual(new Set(BOOTSTRAP_RULE_IDS));
  });

  for (const rule of BOOTSTRAP_RULES) {
    const signatures = () => RULE_SIGNATURES.get(rule.id) ?? [];

    test(`"${rule.id}" enabled renders its whole span`, () => {
      const { contract } = render(stateOf(true, { [rule.id]: true }));
      for (const line of signatures()) expect(contract).toContain(line);
    });

    test(`"${rule.id}" disabled removes its whole span, leaving the others`, () => {
      const { contract } = render(stateOf(true, { [rule.id]: false }));
      for (const line of signatures()) expect(contract).not.toContain(line);

      for (const other of BOOTSTRAP_RULES) {
        if (other.id === rule.id) continue;
        for (const line of RULE_SIGNATURES.get(other.id) ?? []) {
          expect(`${other.id}: ${contract}`).toContain(line);
        }
      }
    });

    test(`"${rule.id}" round-trips off then on to the same bytes`, () => {
      expect(render(stateOf(true, { [rule.id]: false })).contract).not.toBe(render(ALL_ON).contract);
      expect(render(stateOf(true, { [rule.id]: true })).contract).toBe(render(ALL_ON).contract);
    });
  }

  test("the all-off contract retains no rule's span", () => {
    const { contract } = render(ALL_OFF);
    for (const [, lines] of RULE_SIGNATURES) {
      for (const line of lines) expect(contract).not.toContain(line);
    }
  });
});

// ---------------------------------------------------------------------------
// AC-7 — no marker comment survives the render
// ---------------------------------------------------------------------------

describe("no marker comment survives into the render", () => {
  const SUFFIXES = ["start", "end", "off", "off-end"] as const;

  for (const [label, state] of STATE_MATRIX) {
    test(`contract and pointer carry no massa-ai marker — ${label}`, () => {
      const { contract, pointer } = render(state);
      for (const text of [contract, pointer]) {
        expect(text).not.toContain("massa-ai:rule:");
        expect(text).not.toContain("massa-ai:bootstrap:");
        expect(text).not.toContain(BOOTSTRAP_BLOCK_START);
        expect(text).not.toContain(BOOTSTRAP_BLOCK_END);
      }
    });
  }

  test("no individual marker literal survives, for any id or suffix", () => {
    const { contract, pointer } = render(DEFAULTS);
    for (const id of BOOTSTRAP_RULE_IDS) {
      for (const suffix of SUFFIXES) {
        expect(contract).not.toContain(ruleMarker(id, suffix));
        expect(pointer).not.toContain(ruleMarker(id, suffix));
      }
    }
  });

  test("text outside the bootstrap block is not rendered", () => {
    const { contract } = render(ALL_ON, "codex", syntheticSource());
    expect(contract).not.toContain("Text outside the block");
    expect(contract).toContain("Intro paragraph.");
  });
});

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

describe("output shape", () => {
  for (const [label, state] of [
    ["defaults", DEFAULTS],
    ["all enabled", ALL_ON],
    ["all disabled", ALL_OFF],
  ] as const) {
    test(`ends with exactly one newline and starts with the header — ${label}`, () => {
      const { contract } = render(state);
      expect(contract.endsWith("\n")).toBe(true);
      expect(contract.endsWith("\n\n")).toBe(false);
      expect(contract.startsWith("> Generated by massa-ai")).toBe(true);
    });

    test(`never runs two blank lines together outside a fence — ${label}`, () => {
      const lines = render(state).contract.split("\n");
      let inFence = false;
      for (let i = 1; i < lines.length; i++) {
        if (lines[i]?.trimStart().startsWith("```")) inFence = !inFence;
        if (inFence) continue;
        expect(`${i}: ${lines[i - 1]}|${lines[i]}`).not.toBe(`${i}: |`);
      }
    });
  }

  test("fenced block contents are passed through byte-for-byte", () => {
    // The source's four fences carry policy data (three yaml, one path list);
    // a layout normalizer that reformatted them would be editing the contract.
    const fence = REAL_SOURCE.slice(
      REAL_SOURCE.indexOf("```yaml\npersona_router:"),
      REAL_SOURCE.indexOf("```", REAL_SOURCE.indexOf("```yaml\npersona_router:") + 8) + 3,
    );
    expect(fence.length).toBeGreaterThan(20);
    expect(render(ALL_ON).contract).toContain(fence);
  });
});

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

describe("refusals", () => {
  function caught(fn: () => unknown): BootstrapRenderError {
    try {
      fn();
    } catch (error) {
      return error as BootstrapRenderError;
    }
    throw new Error("expected a BootstrapRenderError, none was thrown");
  }

  test("a relative targetHome is refused by name", () => {
    const error = caught(() =>
      renderBootstrap({
        source: REAL_SOURCE,
        state: DEFAULTS,
        host: "codex",
        targetHome: "relative/home",
      }),
    );
    expect(error.name).toBe("TargetHomeNotAbsoluteError");
    expect(error.message).toContain("relative/home");
  });

  test("a state missing a registry id is refused, naming every missing id", () => {
    const partial = { ...DEFAULTS } as Record<string, boolean>;
    delete partial["plan-challenge"];
    delete partial["english-code"];
    const error = caught(() => render(partial as BootstrapState));
    expect(error.name).toBe("IncompleteBootstrapStateError");
    expect(new Set(error.details)).toEqual(new Set(["plan-challenge", "english-code"]));
  });

  test("a source with no bootstrap block is refused", () => {
    const error = caught(() => render(DEFAULTS, "codex", "# no markers here\n"));
    expect(error.name).toBe("BootstrapSourceError");
  });

  test("a source with duplicated bootstrap markers is refused", () => {
    const error = caught(() => render(DEFAULTS, "codex", syntheticSource() + syntheticSource()));
    expect(error.name).toBe("BootstrapSourceError");
  });

  test("a registry rule with no span in the source is refused, naming it", () => {
    const source = syntheticSource().replace(`${ruleMarker("caveman", "start")}\n`, "");
    const error = caught(() => render(DEFAULTS, "codex", source));
    expect(error.name).toBe("MissingRuleSpanError");
    expect(error.details).toEqual(["caveman"]);
  });

  test("a marker for an id the registry does not carry is refused, not stripped", () => {
    const source = syntheticSource().replace(
      ruleMarker("caveman", "start"),
      `${ruleMarker("caveman", "start")}\n${ruleMarker("not-a-rule", "start")}`,
    );
    const error = caught(() => render(DEFAULTS, "codex", source));
    expect(error.name).toBe("UnknownRuleMarkerError");
    expect(error.details).toEqual([ruleMarker("not-a-rule", "start")]);
  });

  test("an off-span with no closing marker is refused", () => {
    const source = syntheticSource({}, { offText: { caveman: ["off text"] } }).replace(
      `${ruleMarker("caveman", "off-end")}\n`,
      "",
    );
    const error = caught(() => render(DEFAULTS, "codex", source));
    expect(error.name).toBe("MalformedOffSpanError");
    expect(error.details).toEqual(["caveman"]);
  });

  test("bootstrapContractPath and bootstrapStateFilePath refuse a relative home too", () => {
    expect(caught(() => bootstrapContractPath("claude", "home")).name).toBe(
      "TargetHomeNotAbsoluteError",
    );
    expect(caught(() => bootstrapStateFilePath("home")).name).toBe("TargetHomeNotAbsoluteError");
  });
});
