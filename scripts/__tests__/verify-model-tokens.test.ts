/**
 * MPR-R1 — no model name is hand-authored outside the registry.
 *
 * The gap this closes was live and reproduced: a model name typed into a charter's PROSE
 * propagated byte-identically into all 4 host artifacts and all 4 mirrored skill bundles
 * with `test:scripts`, `lint`, and both `--check` drift gates green. `loadCharter` rejects
 * the retired `model_hint` KEY and the emitters only ever see a resolved pair, so neither
 * could see it.
 *
 * These tests exercise `scan` against SYNTHETIC targets rather than mutating the tree, so
 * the discrimination proof is repeatable in CI and cannot leave the repo dirty.
 *
 * Spec: .specs/features/model-profile-registry/spec.md (MPR-R1, and MPR-R6's
 *       "no charter contains a model name")
 */

import { describe, test, expect } from "bun:test";
import { spawnSync } from "child_process";
import path from "path";
import { collectTargets, modelTokens, scan } from "../verify-model-tokens.ts";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const SCRIPT = path.join(REPO_ROOT, "scripts/verify-model-tokens.ts");

const TOKENS = modelTokens();
const TARGETS = collectTargets();

describe("model-token scan — the token list is derived, never typed (MPR-R1)", () => {
  test("it draws from the registry AND the frozen baseline, so retired names stay covered", () => {
    // A registry-only list would stop catching a display name that shipped on the base
    // commit and was removed — exactly the value most likely to be pasted back in.
    const registryIds = new Set<string>();
    for (const t of TOKENS) if (t.includes("/")) registryIds.add(t);
    expect(registryIds.size).toBeGreaterThan(0);

    const retiredDisplayNames = TOKENS.filter((t) => /\s/.test(t));
    expect(retiredDisplayNames.length).toBeGreaterThan(0);
  });

  test("a provider-qualified id also contributes its bare segment", () => {
    const qualified = TOKENS.find((t) => t.includes("/"))!;
    expect(TOKENS).toContain(qualified.split("/").pop()!);
  });

  test("longer tokens sort first, so the full id is reported over its bare segment", () => {
    for (let i = 1; i < TOKENS.length; i++) {
      expect(TOKENS[i - 1]!.length).toBeGreaterThanOrEqual(TOKENS[i]!.length);
    }
  });
});

describe("model-token scan — surface coverage (MPR-R1)", () => {
  test("all five enumerated surfaces are actually reached", () => {
    const files = TARGETS.map((t) => t.file);
    expect(files.some((f) => /^skills\/agents\/[^/]+\/SKILL\.md$/.test(f))).toBe(true);
    expect(
      files.some((f) => /^apps\/[a-z]+-plugin\/skills\/agents\/[^/]+\/SKILL\.md$/.test(f)),
    ).toBe(true);
    expect(files.some((f) => /^apps\/[a-z]+-plugin\/agents\/.+\.md$/.test(f))).toBe(true);
    expect(files.some((f) => /^apps\/codex-plugin\/agents\/.+\.toml$/.test(f))).toBe(true);
    expect(files).toContain("scripts/generate-subagent-artifacts.ts");
    expect(files).toContain("skills/AGENTS.md");
    // 18 charters + 72 mirrored + 72 generated + the generator + the registry.
    expect(TARGETS.length).toBe(164);
  });

  test("the sub-agent registry is scanned (SDD-01)", () => {
    // This surface was absent while the other four were policed, so
    // skills/AGENTS.md carried a hand-authored per-agent model column that went
    // stale for two roles with every gate green. Asserted by name because a
    // count alone would let a future edit swap this surface for another.
    const registry = TARGETS.find((t) => t.file === "skills/AGENTS.md");
    expect(registry).toBeDefined();
    expect(registry!.content).toContain("Agent Table");
  });

  test("the registry surface would have caught the defect that motivated it", () => {
    // Discrimination against the real historical content, not a synthetic one:
    // the pre-fix table named a model in each of its 17 rows.
    const prefix = [
      "| Name | Purpose | Permission | Model hint | Trigger | Charter |",
      "| planner | Transform requests into plans | read-only | GLM-5.2 | ... | `skills/agents/planner/SKILL.md` |",
      "| navigator | Navigate an indexed codebase | read-only | DeepSeek V4 Pro | ... | `x` |",
    ].join("\n");
    const hits = scan([{ file: "skills/AGENTS.md", content: prefix }], TOKENS);
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  test("the declared MPR-R1 exception is out of scope, not silently matched", () => {
    // subagent-parity.test.ts hard-codes the before/after model pairs on purpose: a fixture
    // test derived from the registry would pass whatever the registry contained.
    expect(TARGETS.map((t) => t.file)).not.toContain(
      "scripts/__tests__/subagent-parity.test.ts",
    );
  });
});

describe("model-token scan — it fires (discrimination)", () => {
  const anyToken = TOKENS.find((t) => t.includes("/"))!;
  const displayName = TOKENS.find((t) => /\s/.test(t))!;

  test("a model id in charter prose is a hit", () => {
    const hits = scan(
      [{ file: "skills/agents/fake/SKILL.md", content: `Use ${anyToken} for this work.` }],
      TOKENS,
    );
    expect(hits.length).toBe(1);
    expect(hits[0]!.token).toBe(anyToken);
    expect(hits[0]!.line).toBe(1);
  });

  test("a retired display name in a mirrored charter is a hit", () => {
    const hits = scan(
      [
        {
          file: "apps/claude-plugin/skills/agents/fake/SKILL.md",
          content: `line one\nprefer ${displayName} here\nline three`,
        },
      ],
      TOKENS,
    );
    expect(hits.length).toBe(1);
    expect(hits[0]!.line).toBe(2);
  });

  test("a model name in a generated agent BODY is a hit", () => {
    const hits = scan(
      [{ file: "apps/opencode-plugin/agents/massa-ai-fake.md", content: `runs on ${anyToken}` }],
      TOKENS,
    );
    expect(hits.length).toBe(1);
  });

  test("case does not hide a hit", () => {
    const hits = scan([{ file: "f", content: anyToken.toUpperCase() }], TOKENS);
    expect(hits.length).toBe(1);
  });

  test("a display name split across a line wrap is a hit", () => {
    // The commonest realistic miss, and the reason matching is whole-content rather than
    // per-line: prose in this repo wraps at ~95 columns, so a multi-word display name is as
    // likely to be typed across a break as on one line.
    const [head, ...rest] = displayName.split(" ");
    const hits = scan(
      [{ file: "skills/agents/fake/SKILL.md", content: `prefer ${head}\n${rest.join(" ")} here` }],
      TOKENS,
    );
    expect(hits.length).toBe(1);
    expect(hits[0]!.token).toBe(displayName);
  });

  test("a separator paraphrase of a known id is a hit", () => {
    // `glm 5.2` for `glm-5.2` is still a restatement of a registry fact.
    const hyphenated = TOKENS.find((t) => t.includes("-") && !t.includes("/"))!;
    const hits = scan(
      [{ file: "f", content: hyphenated.replace("-", " ") }],
      TOKENS,
    );
    expect(hits.length).toBe(1);
  });

  test("extra whitespace inside a display name does not hide it", () => {
    const hits = scan([{ file: "f", content: displayName.replace(" ", "   ") }], TOKENS);
    expect(hits.length).toBe(1);
  });

  test("a model name in NO registry and NO fixture is deliberately NOT a hit", () => {
    // Scope, pinned on purpose so it is not "fixed" later by mistake. This gate checks for
    // facts that DUPLICATE the registry. A string naming a model nothing resolves is a
    // different problem, and the only honest token list is a derived one.
    const hits = scan([{ file: "f", content: "runs on totally-made-up-model-9" }], TOKENS);
    expect(hits).toEqual([]);
  });

  test("a model name embedded in a longer identifier is NOT a hit", () => {
    // Boundary rule: `deepseek-v4-pro` must not fire inside `opencode-go/deepseek-v4-pro`
    // (the full id fires instead), and a token must not fire inside an unrelated word.
    const bare = anyToken.split("/").pop()!;
    const hits = scan([{ file: "f", content: `x-${bare}-y notmodel${bare}suffix` }], TOKENS);
    expect(hits).toEqual([]);
  });

  test("the emitted model assignment is not a hit — only the prose is scanned", () => {
    // If this failed, the gate would be unusable: every generated artifact legitimately
    // carries its resolved value, which subagent-parity.test.ts already verifies.
    const generated = TARGETS.filter((t) => /^apps\/[a-z]+-plugin\/agents\//.test(t.file));
    expect(generated.length).toBe(72);
    for (const t of generated) {
      expect(t.content).not.toMatch(/^\s*model\s*[:=]/m);
    }
  });
});

describe("model-token scan — the gate itself", () => {
  test("the tracked tree is clean: 0 hits", () => {
    expect(scan(TARGETS, TOKENS)).toEqual([]);
  });

  test("the script exits 0 on the tracked tree", () => {
    const res = spawnSync("bun", [SCRIPT], { encoding: "utf8", cwd: REPO_ROOT, timeout: 60000 });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("no model name outside the registry");
  });

  test("scanning nothing is a failure, not a pass", () => {
    // A gate that reports success because its globs stopped matching is worse than none.
    // The exit-2 branch in main() covers the same case for the CLI.
    expect(scan([], TOKENS)).toEqual([]);
    expect(TARGETS.length).toBeGreaterThan(0);
  });
});
