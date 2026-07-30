/**
 * verify-model-ids.ts — MPR-R12.
 *
 * The property that matters is DISCRIMINATION: a bogus model id must be reported MISSING
 * and exit non-zero, and an absent CLI must be reported SKIPPED rather than passing. A
 * verifier that always says OK is worse than none, so every case here mutates the input
 * and asserts the verdict changes.
 *
 * No test invokes a real harness CLI: the probe results are driven by synthetic registries
 * so the suite is deterministic on a machine with no harness installed.
 */

import { describe, test, expect } from "bun:test";
import { exitCodeFor, idsForHost, verifyHost, which, type HostResult } from "../verify-model-ids.ts";
import { loadRegistry, validateRegistry, type Registry } from "../lib/model-profiles.ts";

function registryWith(hostBlocks: Record<string, Record<string, { model: string | null; effort: string | null }>>): Registry {
  return validateRegistry({
    version: 1,
    tiers: ["light", "standard", "deep"],
    hostDefaults: { claude: "p", codex: "p", cursor: "p", opencode: "p" },
    workflowTiers: {},
    profiles: { p: { description: "t", hosts: hostBlocks } },
  });
}

const triple = (model: string | null, effort: string | null) => ({
  light: { model, effort },
  standard: { model, effort },
  deep: { model, effort },
});

const ALL_HOSTS = () => ({
  claude: triple("haiku", "high"),
  codex: triple("gpt-5.4-mini", "high"),
  cursor: triple(null, null),
  opencode: triple("opencode-go/glm-5.2", "max"),
});

describe("idsForHost", () => {
  test("collects distinct non-null ids across every profile", () => {
    const r = loadRegistry();
    const ids = idsForHost(r, "opencode");
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length); // deduped
    expect(ids).toEqual([...ids].sort()); // stable order
    for (const id of ids) expect(id).toContain("/");
  });

  test("returns nothing for a host that pins no model", () => {
    // Cursor is `inherit` in every shipped profile.
    expect(idsForHost(loadRegistry(), "cursor")).toEqual([]);
  });
});

describe("claude alias checking (no CLI exists to probe)", () => {
  const probe = { host: "claude" as const, command: null, reason: "n/a" };

  test("documented aliases pass", () => {
    for (const alias of ["haiku", "sonnet", "opus", "fable"]) {
      const r = verifyHost(registryWith({ ...ALL_HOSTS(), claude: triple(alias, "high") }), probe);
      expect(r.verdict).toBe("ok");
    }
  });

  test("a non-alias is UNKNOWN, not OK — a full model id cannot be checked offline", () => {
    const r = verifyHost(
      registryWith({ ...ALL_HOSTS(), claude: triple("claude-opus-4-8", "high") }),
      probe,
    );
    expect(r.verdict).toBe("unverifiable");
    expect(r.reason).toContain("cannot be checked offline");
  });

  test("a typo'd alias is UNKNOWN rather than silently accepted", () => {
    const r = verifyHost(registryWith({ ...ALL_HOSTS(), claude: triple("haiky", "high") }), probe);
    expect(r.verdict).not.toBe("ok");
  });
});

describe("a host with no pinned model is trivially ok", () => {
  test("cursor with model: null reports ok with a reason, and probes nothing", () => {
    const r = verifyHost(registryWith(ALL_HOSTS()), {
      host: "cursor",
      command: ["definitely-not-a-real-binary-xyz", "models"],
    });
    expect(r.verdict).toBe("ok");
    expect(r.reason).toContain("inherit");
    expect(r.ids).toEqual([]);
  });
});

describe("an absent CLI is SKIPPED, never a pass", () => {
  test("missing binary yields skipped + the binary name as the reason", () => {
    const r = verifyHost(registryWith(ALL_HOSTS()), {
      host: "opencode",
      command: ["definitely-not-a-real-binary-xyz", "models"],
    });
    expect(r.verdict).toBe("skipped");
    expect(r.reason).toContain("definitely-not-a-real-binary-xyz");
    expect(r.reason).toContain("not installed");
    // The ids are still listed, marked unverified rather than dropped.
    expect(r.ids.length).toBe(1);
    expect(r.ids[0]!.ok).toBe(false);
  });

  test("a host with no probe command yields skipped with its documented reason", () => {
    const r = verifyHost(registryWith(ALL_HOSTS()), {
      host: "codex",
      command: null,
      reason: "docs only, no machine-readable listing",
    });
    expect(r.verdict).toBe("skipped");
    expect(r.reason).toBe("docs only, no machine-readable listing");
  });
});

describe("probing a real listing command", () => {
  // `echo` stands in for a harness CLI: it prints a model list on stdout, exactly the
  // contract verifyHost consumes. This keeps the discrimination test hermetic.
  const listing = (ids: string[]) => ({
    host: "opencode" as const,
    command: ["printf", `${ids.join("\\n")}\\n`],
  });

  test("every pinned id present in the listing -> ok", () => {
    const r = verifyHost(
      registryWith({ ...ALL_HOSTS(), opencode: triple("opencode-go/glm-5.2", "max") }),
      listing(["opencode-go/glm-5.2", "opencode-go/other"]),
    );
    expect(r.verdict).toBe("ok");
    expect(r.ids.every((i) => i.ok)).toBe(true);
  });

  test("a pinned id ABSENT from the listing -> missing (the discriminating case)", () => {
    const r = verifyHost(
      registryWith({ ...ALL_HOSTS(), opencode: triple("opencode-go/ghost-model", "max") }),
      listing(["opencode-go/glm-5.2"]),
    );
    expect(r.verdict).toBe("missing");
    expect(r.ids[0]!.ok).toBe(false);
  });

  test("matching is exact, not substring — a prefix must not satisfy a longer id", () => {
    const r = verifyHost(
      registryWith({ ...ALL_HOSTS(), opencode: triple("opencode-go/glm-5.2-turbo", "max") }),
      listing(["opencode-go/glm-5.2"]),
    );
    expect(r.verdict).toBe("missing");
  });

  test("a failing probe command is skipped, not treated as an empty listing", () => {
    // An empty listing would wrongly report every id MISSING; a broken probe must skip.
    const r = verifyHost(registryWith(ALL_HOSTS()), {
      host: "opencode",
      command: ["sh", "-c", "exit 3"],
    });
    expect(r.verdict).toBe("skipped");
    expect(r.reason).toContain("exited 3");
  });
});

describe("exitCodeFor", () => {
  const mk = (verdict: HostResult["verdict"]): HostResult => ({ host: "opencode", verdict, ids: [] });

  test("non-zero ONLY on a real miss", () => {
    expect(exitCodeFor([mk("ok")])).toBe(0);
    expect(exitCodeFor([mk("skipped")])).toBe(0);
    expect(exitCodeFor([mk("unverifiable")])).toBe(0);
    expect(exitCodeFor([mk("missing")])).toBe(1);
    expect(exitCodeFor([mk("ok"), mk("missing")])).toBe(1);
  });
});

describe("which", () => {
  test("finds a binary that exists and rejects one that does not", () => {
    expect(which("sh")).toBe(true);
    expect(which("definitely-not-a-real-binary-xyz")).toBe(false);
  });
});

describe("the SHIPPED registry", () => {
  test("no host pins an id this verifier would call malformed", () => {
    const r = loadRegistry();
    for (const id of idsForHost(r, "opencode")) {
      expect(id).toMatch(/^[a-z0-9-]+\/[a-z0-9.:-]+$/);
    }
  });
});
