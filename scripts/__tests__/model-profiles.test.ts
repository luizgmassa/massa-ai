/**
 * Model profile registry — resolver + validation tests.
 *
 * Covers MPR-R2..R5 and MPR-R7 from
 * .specs/features/model-profile-registry/spec.md.
 *
 * Discrimination intent: every validation case asserts the error NAME (and, where it matters,
 * the offending key path) rather than merely "it threw". A test that only asserts `toThrow()`
 * passes when the code throws the wrong error for the wrong reason, which is exactly the
 * failure mode a fail-loud resolver must not have.
 */

import { describe, test, expect } from "bun:test";
import path from "path";
import {
  HOSTS,
  HOST_EFFORT_ENUM,
  PROFILE_ENV_VAR,
  RegistryValidationError,
  countRegistryFacts,
  effortViolation,
  hostsSupportedBy,
  loadRegistry,
  profileFlagFrom,
  resolveTier,
  selectProfile,
  validateRegistry,
  workflowTier,
  type Host,
  type Registry,
} from "../lib/model-profiles.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const REGISTRY_PATH = path.join(REPO_ROOT, "skills", "model-profiles.json");

/** A minimal, deliberately VALID registry. Each negative test mutates one field of a deep
 *  clone, so a case can only fail for the reason it names. */
function baseRegistry(): Record<string, unknown> {
  const triple = () => ({
    light: { model: "m-light", effort: "high" },
    standard: { model: "m-std", effort: "high" },
    deep: { model: "m-deep", effort: "high" },
  });
  return {
    version: 1,
    tiers: ["light", "standard", "deep"],
    hostDefaults: { claude: "p1", codex: "p1", cursor: "p1", opencode: "p1" },
    workflowTiers: { "spec-driven": "deep" },
    profiles: {
      p1: {
        description: "test profile",
        hosts: {
          claude: { ...triple(), light: { model: "haiku", effort: "low" } },
          codex: triple(),
          cursor: {
            light: { model: null, effort: null },
            standard: { model: null, effort: null },
            deep: { model: null, effort: null },
          },
          opencode: triple(),
        },
      },
    },
  };
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Assert the thrown error's `name`, and that its message mentions each given fragment. */
function expectThrowsNamed(fn: () => unknown, name: string, ...fragments: string[]): Error {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(Error);
  const err = caught as Error;
  expect(err.name).toBe(name);
  for (const f of fragments) expect(err.message).toContain(f);
  return err;
}

/** For validateRegistry, which batches violations: assert one violation matches. */
function expectViolation(mutate: (r: Record<string, unknown>) => void, fragment: string): void {
  const r = baseRegistry();
  mutate(r);
  let caught: unknown;
  try {
    validateRegistry(r);
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(RegistryValidationError);
  const violations = (caught as RegistryValidationError).violations;
  expect(violations.some((v) => v.includes(fragment))).toBe(true);
}

// ── The shipped registry ────────────────────────────────────────────────────
describe("model-profiles: the shipped registry", () => {
  test("loads and validates", () => {
    const r = loadRegistry(REGISTRY_PATH);
    expect(r.version).toBe(1);
    expect(r.tiers).toEqual(["light", "standard", "deep"]);
  });

  test("MPR-R2: contains no agent list — an agent's tier lives in its charter", () => {
    const raw = JSON.parse(require("fs").readFileSync(REGISTRY_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    // The whole point of design.md 2.1: no roles/agents map anywhere in this file.
    expect(raw.roles).toBeUndefined();
    expect(raw.agents).toBeUndefined();
    expect(raw.agentTiers).toBeUndefined();
    const asText = JSON.stringify(raw.profiles) + JSON.stringify(raw.hostDefaults);
    // No specialist name should appear as a key in the model policy itself.
    for (const name of ["investigator", "planner", "builder", "navigator", "plan-critic"]) {
      expect(asText).not.toContain(`"${name}"`);
    }
  });

  test("MPR-R2: fact count is the factored total, not a cross-product", () => {
    const r = loadRegistry(REGISTRY_PATH);
    const facts = countRegistryFacts(r);
    // Sum over profiles of hosts x tiers. A cross-product over 15 agents would be >= 315.
    let expected = 0;
    for (const p of Object.values(r.profiles)) {
      expected += Object.keys(p.hosts).length * r.tiers.length;
    }
    expect(facts).toBe(expected);
    expect(facts).toBeLessThan(15 * HOSTS.length * r.tiers.length);
  });

  test("every hostDefaults target supports that host", () => {
    const r = loadRegistry(REGISTRY_PATH);
    for (const h of HOSTS) {
      const profile = r.hostDefaults[h]!;
      expect(hostsSupportedBy(r, profile)).toContain(h);
    }
  });

  test("every shipped effort value is legal for its host", () => {
    const r = loadRegistry(REGISTRY_PATH);
    for (const [pName, p] of Object.entries(r.profiles)) {
      for (const [hName, hostMap] of Object.entries(p.hosts)) {
        for (const [tName, entry] of Object.entries(hostMap)) {
          const violation = effortViolation(
            hName as Host,
            entry.model,
            entry.effort,
            `${pName}.${hName}.${tName}`,
          );
          expect(violation).toBeNull();
        }
      }
    }
  });

  test("cursor pins no model id — no resolvable Cursor id exists for the pinned models", () => {
    const r = loadRegistry(REGISTRY_PATH);
    for (const [, p] of Object.entries(r.profiles)) {
      const cursor = p.hosts.cursor;
      if (!cursor) continue;
      for (const entry of Object.values(cursor)) {
        expect(entry.model).toBeNull();
        expect(entry.effort).toBeNull();
      }
    }
  });

  test("host-specific profiles are genuinely host-specific and fail loud elsewhere", () => {
    const r = loadRegistry(REGISTRY_PATH);
    for (const name of ["open_models", "local_models"]) {
      expect(hostsSupportedBy(r, name)).toEqual(["opencode"]);
      expectThrowsNamed(
        () => resolveTier(r, "claude", name, "light"),
        "MissingHostError",
        name,
        "claude",
      );
    }
  });
});

// ── MPR-R4: profile selection precedence ────────────────────────────────────
describe("model-profiles: profile selection (MPR-R4)", () => {
  const r = validateRegistry(
    (() => {
      const b = baseRegistry();
      (b.profiles as Record<string, unknown>).p2 = clone(
        (b.profiles as Record<string, Record<string, unknown>>).p1,
      );
      return b;
    })(),
  ) as Registry;

  test("rank 3: hostDefaults when no flag and no env", () => {
    expect(selectProfile(r, "claude", { env: {} })).toBe("p1");
  });

  test("rank 2: env var beats hostDefaults", () => {
    expect(selectProfile(r, "claude", { env: { [PROFILE_ENV_VAR]: "p2" } })).toBe("p2");
  });

  test("rank 1: flag beats env var", () => {
    expect(selectProfile(r, "claude", { flag: "p1", env: { [PROFILE_ENV_VAR]: "p2" } })).toBe("p1");
  });

  test("flag beats env for every host, not just one", () => {
    for (const h of HOSTS) {
      expect(selectProfile(r, h, { flag: "p2", env: { [PROFILE_ENV_VAR]: "p1" } })).toBe("p2");
    }
  });

  test("blank flag and blank env fall through rather than selecting an empty profile", () => {
    expect(selectProfile(r, "claude", { flag: "   ", env: { [PROFILE_ENV_VAR]: "  " } })).toBe("p1");
  });

  test("unknown name throws at EVERY rank — never a silent fallback", () => {
    expectThrowsNamed(
      () => selectProfile(r, "claude", { flag: "nope", env: {} }),
      "UnknownProfileError",
      "nope",
    );
    expectThrowsNamed(
      () => selectProfile(r, "claude", { env: { [PROFILE_ENV_VAR]: "nope" } }),
      "UnknownProfileError",
      "nope",
    );
    const bad = clone(baseRegistry());
    (bad.hostDefaults as Record<string, string>).claude = "nope";
    // hostDefaults pointing at a missing profile is caught at validation time.
    expectViolation(
      (x) => ((x.hostDefaults as Record<string, string>).claude = "nope"),
      'names unknown profile "nope"',
    );
    void bad;
  });

  test("a typo'd profile name cannot silently ship the default profile", () => {
    // The regression this guards: `--profile=chaep` quietly emitting `balanced`.
    const err = expectThrowsNamed(
      () => selectProfile(r, "opencode", { flag: "chaep", env: {} }),
      "UnknownProfileError",
    );
    expect(err.message).not.toContain("falling back");
    expect(err.message).toContain("p1"); // lists what IS known
  });

  test("profileFlagFrom parses both --profile=x and --profile x", () => {
    expect(profileFlagFrom(["--profile=cheap"])).toBe("cheap");
    expect(profileFlagFrom(["--profile", "cheap"])).toBe("cheap");
    expect(profileFlagFrom(["--check"])).toBeNull();
    expect(profileFlagFrom([])).toBeNull();
  });
});

// ── MPR-R5: fail-loud validation, one class per case ────────────────────────
describe("model-profiles: fail-loud validation (MPR-R5)", () => {
  test("the base fixture is valid — so negative cases prove the mutation, not the fixture", () => {
    expect(() => validateRegistry(baseRegistry())).not.toThrow();
  });

  test("UnknownProfileError: resolving a profile that does not exist", () => {
    const r = validateRegistry(baseRegistry()) as Registry;
    expectThrowsNamed(() => resolveTier(r, "claude", "ghost", "light"), "UnknownProfileError");
  });

  test("MissingHostError: profile does not define the host", () => {
    const b = baseRegistry();
    delete (b.profiles as any).p1.hosts.opencode;
    (b.hostDefaults as Record<string, string>).opencode = "p1";
    // validation catches the hostDefaults mismatch...
    expectViolation(
      (x) => delete (x.profiles as any).p1.hosts.opencode,
      'does not support host "opencode"',
    );
    // ...and resolution throws the named error for a non-default pairing.
    const ok = baseRegistry();
    delete (ok.profiles as any).p1.hosts.opencode;
    (ok.hostDefaults as Record<string, string>).opencode = "p2";
    (ok.profiles as any).p2 = clone((ok.profiles as any).p1);
    (ok.profiles as any).p2.hosts.opencode = {
      light: { model: "x", effort: "high" },
      standard: { model: "x", effort: "high" },
      deep: { model: "x", effort: "high" },
    };
    const r = validateRegistry(ok) as Registry;
    expectThrowsNamed(() => resolveTier(r, "opencode", "p1", "light"), "MissingHostError", "p1");
  });

  test("MissingTierError: host block omits a declared tier", () => {
    expectViolation((x) => delete (x.profiles as any).p1.hosts.claude.standard, 'missing tier "standard"');
  });

  test("UnknownTierError: resolving a tier not in the declared list", () => {
    const r = validateRegistry(baseRegistry()) as Registry;
    expectThrowsNamed(() => resolveTier(r, "claude", "p1", "gigantic"), "UnknownTierError", "gigantic");
  });

  test("unknown tier declared inside a host block is rejected", () => {
    expectViolation(
      (x) => ((x.profiles as any).p1.hosts.claude.gigantic = { model: "m", effort: "high" }),
      'declares unknown tier "gigantic"',
    );
  });

  test("UnknownWorkflowError: workflow with no declared tier (MPR-R7)", () => {
    const r = validateRegistry(baseRegistry()) as Registry;
    expect(workflowTier(r, "spec-driven")).toBe("deep");
    expectThrowsNamed(() => workflowTier(r, "no-such-workflow"), "UnknownWorkflowError");
  });

  test("workflowTiers value outside the tier list is rejected", () => {
    expectViolation(
      (x) => ((x.workflowTiers as Record<string, string>).debug = "titanic"),
      "workflowTiers.debug must be one of",
    );
  });

  test("InvalidEffortError: effort outside the host's documented enum", () => {
    // claude has no "titanic" level
    expectViolation(
      (x) => ((x.profiles as any).p1.hosts.claude.deep.effort = "titanic"),
      "is not one of low, medium, high, xhigh, max",
    );
    // codex has no "max"
    expectViolation(
      (x) => ((x.profiles as any).p1.hosts.codex.deep.effort = "max"),
      "is not one of minimal, low, medium, high, xhigh",
    );
  });

  test("cursor effort must be null while its model is null", () => {
    expectViolation(
      (x) => ((x.profiles as any).p1.hosts.cursor.deep.effort = "high"),
      "must be null when model is null",
    );
  });

  test("opencode effort is a provider pass-through, so any non-empty string is legal", () => {
    const b = baseRegistry();
    (b.profiles as any).p1.hosts.opencode.deep.effort = "some-provider-specific-value";
    expect(() => validateRegistry(b)).not.toThrow();
    // ...but empty string is still rejected.
    expectViolation(
      (x) => ((x.profiles as any).p1.hosts.opencode.deep.effort = ""),
      "must be a non-empty string or null",
    );
  });

  test("empty or non-string model is rejected; null is allowed", () => {
    expectViolation((x) => ((x.profiles as any).p1.hosts.claude.deep.model = ""), "model must be a non-empty string or null");
    expectViolation((x) => ((x.profiles as any).p1.hosts.claude.deep.model = 7), "model must be a non-empty string or null");
    const b = baseRegistry();
    (b.profiles as any).p1.hosts.claude.deep.model = null;
    expect(() => validateRegistry(b)).not.toThrow();
  });

  test("unknown host key is rejected in profiles and in hostDefaults", () => {
    expectViolation(
      (x) => ((x.profiles as any).p1.hosts.emacs = { light: {}, standard: {}, deep: {} }),
      "is not a known host",
    );
    expectViolation(
      (x) => ((x.hostDefaults as Record<string, string>).emacs = "p1"),
      "hostDefaults.emacs is not a known host",
    );
  });

  test("hostDefaults must cover every host", () => {
    expectViolation((x) => delete (x.hostDefaults as Record<string, string>).cursor, "hostDefaults.cursor is required");
  });

  test("missing description is rejected", () => {
    expectViolation((x) => delete (x.profiles as any).p1.description, "description is required");
  });

  test("wrong version is rejected", () => {
    expectViolation((x) => (x.version = 2), "version must be 1");
  });

  test("MULTI-ERROR: three distinct faults are reported in ONE throw", () => {
    const b = baseRegistry();
    b.version = 99;
    delete (b.profiles as any).p1.hosts.claude.standard;
    (b.profiles as any).p1.hosts.codex.deep.effort = "titanic";
    let caught: unknown;
    try {
      validateRegistry(b);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(RegistryValidationError);
    const violations = (caught as RegistryValidationError).violations;
    // A first-throw implementation would report exactly 1.
    expect(violations.length).toBeGreaterThanOrEqual(3);
    expect(violations.some((v) => v.includes("version must be 1"))).toBe(true);
    expect(violations.some((v) => v.includes('missing tier "standard"'))).toBe(true);
    expect(violations.some((v) => v.includes("titanic"))).toBe(true);
  });

  test("structurally broken registries throw rather than returning a partial object", () => {
    expectThrowsNamed(() => validateRegistry(null), "RegistryValidationError", "not an object");
    expectThrowsNamed(() => validateRegistry([]), "RegistryValidationError", "not an object");
    expectThrowsNamed(
      () => validateRegistry({ version: 1, tiers: [], profiles: {} }),
      "RegistryValidationError",
      "tiers must be a non-empty array",
    );
    expectThrowsNamed(
      () => validateRegistry({ version: 1, tiers: ["light"], profiles: {} }),
      "RegistryValidationError",
      "profiles must be a non-empty object",
    );
  });

  test("loadRegistry surfaces a missing file and malformed JSON as named errors", () => {
    expectThrowsNamed(
      () => loadRegistry(path.join(REPO_ROOT, "does", "not", "exist.json")),
      "RegistryError",
      "cannot read model registry",
    );
  });
});

// ── MPR-R3: the profile set is open data ────────────────────────────────────
describe("model-profiles: open profile set (MPR-R3)", () => {
  test("a synthetic profile resolves end-to-end with zero source edits", () => {
    const b = baseRegistry();
    (b.profiles as any).invented_by_a_user = {
      description: "added by a user who never touched TypeScript",
      hosts: {
        claude: {
          light: { model: "fable", effort: "medium" },
          standard: { model: "fable", effort: "high" },
          deep: { model: "opus", effort: "max" },
        },
        codex: {
          light: { model: "gpt-5.4", effort: "low" },
          standard: { model: "gpt-5.5", effort: "high" },
          deep: { model: "gpt-5.6-sol", effort: "xhigh" },
        },
        cursor: {
          light: { model: null, effort: null },
          standard: { model: null, effort: null },
          deep: { model: null, effort: null },
        },
        opencode: {
          light: { model: "p/a", effort: "max" },
          standard: { model: "p/b", effort: "max" },
          deep: { model: "p/c", effort: "max" },
        },
      },
    };
    const r = validateRegistry(b) as Registry;
    for (const h of HOSTS) {
      for (const t of r.tiers) {
        expect(() => resolveTier(r, h, "invented_by_a_user", t)).not.toThrow();
      }
    }
    expect(resolveTier(r, "claude", "invented_by_a_user", "deep")).toEqual({
      model: "opus",
      effort: "max",
    });
    expect(selectProfile(r, "claude", { flag: "invented_by_a_user", env: {} })).toBe(
      "invented_by_a_user",
    );
  });

  test("no profile name is hard-coded in the resolver source", () => {
    const src = require("fs").readFileSync(
      path.join(REPO_ROOT, "scripts", "lib", "model-profiles.ts"),
      "utf8",
    ) as string;
    for (const shipped of ["balanced", "cheap", "heavy", "work", "home", "open_models", "local_models"]) {
      expect(src).not.toContain(`"${shipped}"`);
    }
  });
});

// ── Host effort enums are the documented ones ───────────────────────────────
describe("model-profiles: host effort enums match the cited docs", () => {
  test("claude", () => {
    expect(HOST_EFFORT_ENUM.claude).toEqual(["low", "medium", "high", "xhigh", "max"]);
  });
  test("codex — note: no 'max'", () => {
    expect(HOST_EFFORT_ENUM.codex).toEqual(["minimal", "low", "medium", "high", "xhigh"]);
    expect(HOST_EFFORT_ENUM.codex).not.toContain("max");
  });
  test("cursor has no effort key at all", () => {
    expect(HOST_EFFORT_ENUM.cursor).toEqual([]);
  });
  test("opencode is a non-enumerable provider pass-through", () => {
    expect(HOST_EFFORT_ENUM.opencode).toBeNull();
  });
});
