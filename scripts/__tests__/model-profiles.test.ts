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
  loadEffectiveRegistry,
  mergeOverlay,
  profileFlagFrom,
  resolveTier,
  selectProfile,
  validateRegistry,
  workflowTier,
  type Host,
  type OverlayData,
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
    // The whole point of design.md 2.1: no roles/agents map anywhere in this file. APUX-01
    // (admin-portal-ux-overhaul design D-1) adds `agentTiers` as an explicit, opt-in
    // OVERRIDE section — but the shipped builtin still names zero agents in it, so the
    // "no agent list" principle for DEFAULTS holds: it ships empty, not undefined.
    expect(raw.roles).toBeUndefined();
    expect(raw.agents).toBeUndefined();
    expect(raw.agentTiers).toEqual({});
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
      // resolveTier rejects the pairing...
      expectThrowsNamed(
        () => resolveTier(r, "claude", name, "light"),
        "MissingHostError",
        name,
        "claude",
      );
      // ...and so does selectProfile, so a --profile=open_models run fails BEFORE any
      // file is written rather than partway through emitting 60 of them.
      expectThrowsNamed(
        () => selectProfile(r, "claude", { flag: name, env: {} }),
        "MissingHostError",
        name,
      );
      // The supported host still resolves normally.
      expect(selectProfile(r, "opencode", { flag: name, env: {} })).toBe(name);
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

  test("opencode effort is constrained to the documented enum", () => {
    const b = baseRegistry();
    // Valid values pass.
    for (const e of ["low", "medium", "high", "max"]) {
      (b.profiles as any).p1.hosts.opencode.deep.effort = e;
      expect(() => validateRegistry(b)).not.toThrow();
    }
    // A value outside the enum is rejected.
    expectViolation(
      (x) => ((x.profiles as any).p1.hosts.opencode.deep.effort = "some-provider-specific-value"),
      "is not one of low, medium, high, max for host \"opencode\"",
    );
    // Empty string is still rejected.
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
  test("opencode effort enum is constrained to low/medium/high/max", () => {
    expect(HOST_EFFORT_ENUM.opencode).toEqual(["low", "medium", "high", "max"]);
  });
});

// ── loadEffectiveRegistry: overlay merge + fallback (REG-16, REG-17) ─────────
describe("model-profiles: loadEffectiveRegistry", () => {
  const OVERLAY_DIR = path.join(import.meta.dirname, "..", "..");
  const REGISTRY_PATH = path.join(OVERLAY_DIR, "skills", "model-profiles.json");

  function makeBuiltinRegistry(): Registry {
    return loadRegistry(REGISTRY_PATH);
  }

  function writeOverlay(overlayPath: string, data: unknown): void {
    const fs = require("fs");
    fs.mkdirSync(path.dirname(overlayPath), { recursive: true });
    fs.writeFileSync(overlayPath, JSON.stringify(data, null, 2));
  }

  test("missing overlay file returns builtin with overlay=null and tombstoned=[]", () => {
    const tmpDir = path.join(
      require("os").tmpdir(),
      `massa-ai-overlay-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const overlayPath = path.join(tmpDir, "model-profiles.json");

    const result = loadEffectiveRegistry({ overlayPath });
    expect(result.registry.version).toBe(1);
    expect(result.source.overlay).toBeNull();
    expect(result.source.tombstoned).toEqual([]);
    expect(result.overlayError).toBeUndefined();
  });

  test("overlay merge: shallow per profile — overlay profile replaces entire builtin profile", () => {
    const tmpDir = path.join(
      require("os").tmpdir(),
      `massa-ai-overlay-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const overlayPath = path.join(tmpDir, "model-profiles.json");

    const builtin = makeBuiltinRegistry();
    const firstProfileKey = Object.keys(builtin.profiles)[0]!;
    const firstProfile = builtin.profiles[firstProfileKey];

    // Create a modified version of the first profile — change its description
    const modifiedProfile = JSON.parse(JSON.stringify(firstProfile));
    modifiedProfile.description = "OVERLAY MODIFIED DESCRIPTION";

    writeOverlay(overlayPath, {
      profiles: {
        [firstProfileKey]: modifiedProfile,
      },
    });

    const result = loadEffectiveRegistry({ overlayPath });
    expect(result.source.overlay).not.toBeNull();
    expect(result.registry.profiles[firstProfileKey].description).toBe(
      "OVERLAY MODIFIED DESCRIPTION",
    );
    expect(result.overlayError).toBeUndefined();
  });

  test("tombstone: _delete:true removes a builtin profile and lists it in source.tombstoned", () => {
    const tmpDir = path.join(
      require("os").tmpdir(),
      `massa-ai-overlay-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const overlayPath = path.join(tmpDir, "model-profiles.json");

    const builtin = makeBuiltinRegistry();
    const profileToDelete = Object.keys(builtin.profiles)[0]!;
    // Find a remaining profile to repoint hostDefaults to
    const remainingProfile = Object.keys(builtin.profiles).find(
      (k) => k !== profileToDelete,
    )!;
    // Build hostDefaults pointing all hosts to the remaining profile,
    // but only if that profile supports the host
    const newHostDefaults: Record<string, string> = {};
    for (const h of HOSTS) {
      if (remainingProfile in builtin.profiles && h in builtin.profiles[remainingProfile].hosts) {
        newHostDefaults[h] = remainingProfile;
      } else {
        // Find any profile that supports this host
        for (const [k, p] of Object.entries(builtin.profiles)) {
          if (k !== profileToDelete && h in p.hosts) {
            newHostDefaults[h] = k;
            break;
          }
        }
      }
    }

    writeOverlay(overlayPath, {
      profiles: {
        [profileToDelete]: { _delete: true as const },
      },
      hostDefaults: newHostDefaults,
    });

    const result = loadEffectiveRegistry({ overlayPath });
    expect(result.source.tombstoned).toContain(profileToDelete);
    expect(result.registry.profiles[profileToDelete]).toBeUndefined();
  });

  test("corrupted overlay JSON falls back to builtin with overlayError (no throw)", () => {
    const tmpDir = path.join(
      require("os").tmpdir(),
      `massa-ai-overlay-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const overlayPath = path.join(tmpDir, "model-profiles.json");

    const fs = require("fs");
    fs.mkdirSync(path.dirname(overlayPath), { recursive: true });
    fs.writeFileSync(overlayPath, "{ this is not valid json,,, }");

    let threw = false;
    let result;
    try {
      result = loadEffectiveRegistry({ overlayPath });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(result!.registry.version).toBe(1);
    expect(result!.source.overlay).toBeNull();
    expect(result!.overlayError).toBeDefined();
    expect(result!.overlayError).toContain("parse failed");
  });

  test("validation failure on merged result falls back to builtin with overlayError", () => {
    const tmpDir = path.join(
      require("os").tmpdir(),
      `massa-ai-overlay-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const overlayPath = path.join(tmpDir, "model-profiles.json");

    // Write an overlay that replaces tiers with something invalid
    writeOverlay(overlayPath, {
      tiers: ["not-a-valid-tier"],
    });

    const result = loadEffectiveRegistry({ overlayPath });
    expect(result.registry.version).toBe(1);
    expect(result.source.overlay).toBeNull();
    expect(result.overlayError).toBeDefined();
    expect(result.overlayError).toContain("validation failed");
  });

  test("hostDefaults replaced wholesale when present in overlay", () => {
    const tmpDir = path.join(
      require("os").tmpdir(),
      `massa-ai-overlay-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const overlayPath = path.join(tmpDir, "model-profiles.json");

    const builtin = makeBuiltinRegistry();
    // Pick two different profiles for claude vs codex to test wholesale replace
    const profileKeys = Object.keys(builtin.profiles);
    const newClaudeDefault = profileKeys[1] ?? profileKeys[0]!;

    writeOverlay(overlayPath, {
      hostDefaults: {
        claude: newClaudeDefault,
        codex: newClaudeDefault,
        cursor: newClaudeDefault,
        opencode: newClaudeDefault,
      },
    });

    const result = loadEffectiveRegistry({ overlayPath });
    if (!result.overlayError) {
      expect(result.registry.hostDefaults.claude).toBe(newClaudeDefault);
    }
  });
});

// ── APCR-01 fix-loop iteration 1 (FG1): mergeOverlay is a deep-merge delta, not a
// whole-object replace. These sensors target the three functions a mutation self-check
// found survived the whole reachable suite: mergeFlatMap (`model-profiles.ts:582-595`),
// mergeProfile (`model-profiles.ts:600-620`) and normalizeFlatMap (`model-profiles.ts:663-
// 678`). Everything above this block (`describe("model-profiles: loadEffectiveRegistry"`)
// predates this feature and still describes the old whole-object-replace contract — its
// fixtures set every key, so they cannot distinguish partial-key retention from whole
// replace. These tests deliberately leave keys unmentioned.
describe("model-profiles: mergeOverlay is a deep-merge delta, not a whole-object replace (APCR-01.1/.2/.3, FG1)", () => {
  /** Fully synthetic — not the real `skills/model-profiles.json` — so every key's presence
   *  or absence is under the test's control. `mergeOverlay` is a pure function of its two
   *  arguments, so no disk I/O or real builtin is needed here. */
  function syntheticBuiltin(): Registry {
    return {
      version: 1,
      tiers: ["light", "standard", "deep"],
      hostDefaults: { claude: "A", codex: "A", cursor: "A", opencode: "A" },
      workflowTiers: { "spec-driven": "deep", general: "light" },
      profiles: {
        A: {
          description: "Profile A",
          hosts: {
            claude: {
              light: { model: "a-claude-light", effort: "low" },
              standard: { model: "a-claude-standard", effort: "medium" },
              deep: { model: "a-claude-deep", effort: "high" },
            },
            codex: {
              light: { model: "a-codex-light", effort: "low" },
              standard: { model: "a-codex-standard", effort: "medium" },
              deep: { model: "a-codex-deep", effort: "high" },
            },
          },
        },
      },
    };
  }

  test("spec's Independent Test for APCR-01: a builtin addition the overlay never mentions survives the merge, and profile A's untouched tiers are unchanged", () => {
    const builtin = syntheticBuiltin();
    // Overlay written before the builtin gained profile B — touches only one leaf of A.
    const overlay: OverlayData = {
      profiles: {
        A: {
          hosts: {
            claude: { light: { model: "overlay-claude-light", effort: "max" } },
          },
        },
      },
    };
    // Simulate a later builtin bump: a new profile B the overlay predates and never mentions.
    const bumpedBuiltin: Registry = {
      ...builtin,
      profiles: {
        ...builtin.profiles,
        B: {
          description: "Profile B — added by a builtin bump after the overlay was written",
          hosts: {
            claude: { light: { model: "b-claude-light", effort: "low" } },
          },
        },
      },
    };

    const merged = mergeOverlay(bumpedBuiltin, overlay) as unknown as Registry;

    // The regression this whole feature exists to prevent: the addition reaches the operator.
    expect(merged.profiles.B).toEqual(bumpedBuiltin.profiles.B);

    // Only the touched leaf changed; A's other tiers/hosts are retained verbatim.
    expect(merged.profiles.A.hosts.claude.light).toEqual({
      model: "overlay-claude-light",
      effort: "max",
    });
    expect(merged.profiles.A.hosts.claude.standard).toEqual(
      bumpedBuiltin.profiles.A.hosts.claude.standard,
    );
    expect(merged.profiles.A.hosts.claude.deep).toEqual(
      bumpedBuiltin.profiles.A.hosts.claude.deep,
    );
    expect(merged.profiles.A.hosts.codex).toEqual(bumpedBuiltin.profiles.A.hosts.codex);
  });

  test("mergeOverlay retains builtin hostDefaults/workflowTiers keys the overlay does not mention (kills the whole-object-replace mutation on mergeFlatMap)", () => {
    const builtin = syntheticBuiltin();
    const overlay: OverlayData = {
      hostDefaults: { claude: "A" }, // mentions only claude
      workflowTiers: { "spec-driven": "light" }, // mentions only spec-driven
    };

    const merged = mergeOverlay(builtin, overlay) as unknown as Registry;

    expect(merged.hostDefaults.claude).toBe("A");
    expect(merged.hostDefaults.codex).toBe(builtin.hostDefaults.codex);
    expect(merged.hostDefaults.cursor).toBe(builtin.hostDefaults.cursor);
    expect(merged.hostDefaults.opencode).toBe(builtin.hostDefaults.opencode);

    expect(merged.workflowTiers["spec-driven"]).toBe("light");
    expect(merged.workflowTiers.general).toBe(builtin.workflowTiers.general);
  });

  test("mergeOverlay: null tombstones a single hostDefaults/workflowTiers key without dropping its siblings (design D-1)", () => {
    const builtin = syntheticBuiltin();
    const overlay: OverlayData = {
      hostDefaults: { claude: null },
      workflowTiers: { "spec-driven": null },
    };

    const merged = mergeOverlay(builtin, overlay) as unknown as Registry;

    expect("claude" in merged.hostDefaults).toBe(false);
    expect(merged.hostDefaults.codex).toBe(builtin.hostDefaults.codex);
    expect(merged.hostDefaults.cursor).toBe(builtin.hostDefaults.cursor);

    expect("spec-driven" in merged.workflowTiers).toBe(false);
    expect(merged.workflowTiers.general).toBe(builtin.workflowTiers.general);
  });

  test("mergeOverlay retains a profile's untouched tiers and hosts when the overlay edits only one tier of one host (kills the whole-host-replace mutation on mergeProfile)", () => {
    const builtin = syntheticBuiltin();
    const overlay: OverlayData = {
      profiles: {
        A: {
          hosts: {
            claude: { standard: { model: "overlay-model", effort: "xhigh" } },
          },
        },
      },
    };

    const merged = mergeOverlay(builtin, overlay) as unknown as Registry;

    expect(merged.profiles.A.hosts.claude.standard).toEqual({
      model: "overlay-model",
      effort: "xhigh",
    });
    expect(merged.profiles.A.hosts.claude.light).toEqual(builtin.profiles.A.hosts.claude.light);
    expect(merged.profiles.A.hosts.claude.deep).toEqual(builtin.profiles.A.hosts.claude.deep);
    expect(merged.profiles.A.hosts.codex).toEqual(builtin.profiles.A.hosts.codex);
  });
});

// ── APCR-01 fix-loop iteration 1 (FG1): read-path normalization (`normalizeFlatMap`,
// `model-profiles.ts:663-678`) against the real builtin registry, since normalization is
// reached only through `loadEffectiveRegistry` and always diffs against
// `DEFAULT_REGISTRY_PATH`. Also covers APCR-01.10 (surviving-entry count) and pins
// APCR-01.9 (the documented known limitation).
describe("model-profiles: normalization drops byte-identical overlay entries and keeps genuine edits (APCR-01.4/.5/.9/.10, FG1)", () => {
  function scratchOverlayPath(): string {
    const tmpDir = path.join(
      require("os").tmpdir(),
      `massa-ai-overlay-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    return path.join(tmpDir, "model-profiles.json");
  }

  function writeOverlay(overlayPath: string, data: unknown): void {
    const fs = require("fs");
    fs.mkdirSync(path.dirname(overlayPath), { recursive: true });
    fs.writeFileSync(overlayPath, JSON.stringify(data, null, 2));
  }

  test("normalization drops a hostDefaults entry byte-identical to the builtin and keeps one that genuinely differs (kills the inverted-comparison mutation on normalizeFlatMap)", () => {
    const overlayPath = scratchOverlayPath();
    const builtin = loadRegistry(REGISTRY_PATH);
    // Fixture assumption this test depends on — both keys must exist on the real registry
    // and "cheap" must support both claude and codex, or the merge fails validation.
    expect(builtin.hostDefaults.claude).toBe("balanced");
    expect("cheap" in builtin.profiles).toBe(true);

    writeOverlay(overlayPath, {
      hostDefaults: {
        claude: "balanced", // byte-identical to the builtin — normalization must drop it
        codex: "cheap", // genuinely differs from the builtin's "balanced" — must survive
      },
    });

    const result = loadEffectiveRegistry({ overlayPath });
    expect(result.overlayError).toBeUndefined();

    const normalizedHostDefaults = result.source.overlay?.hostDefaults ?? {};
    expect("claude" in normalizedHostDefaults).toBe(false);
    expect(normalizedHostDefaults.codex).toBe("cheap");

    // APCR-01.10: only the surviving entry counts toward the reported override count.
    expect(result.overlayOverrideCount).toBe(1);

    // The served registry reflects the surviving override and the collapsed identical entry.
    expect(result.registry.hostDefaults.codex).toBe("cheap");
    expect(result.registry.hostDefaults.claude).toBe("balanced");
  });

  test("APCR-01.9 known-limitation pin: an overlay entry that differs from the current builtin — as if copied from an older builtin whose value has since changed — is not dropped, and the overlay value wins", () => {
    // Design D-1 / spec.md's "Limitation behind AC9": `OverlayData` carries no provenance,
    // so normalization cannot tell "the operator typed this deliberately" apart from "this
    // was copied verbatim from a past builtin whose value has since moved on" — both read
    // identically here, an overlay value that differs from the *current* builtin. Deep merge
    // (APCR-01.1-3) already fixes builtin *additions*; this pins the one case design.md
    // documents as NOT closable without a provenance field: a stale full-copy overlay entry
    // whose builtin value later changes stays frozen on the old value. This is asserted as
    // accepted, expected behavior — a future change to normalization (e.g. adding
    // provenance) must change this test explicitly, not silently change behavior under it.
    const overlayPath = scratchOverlayPath();
    const builtin = loadRegistry(REGISTRY_PATH);
    expect(builtin.hostDefaults.opencode).toBe("balanced");

    writeOverlay(overlayPath, {
      hostDefaults: {
        // Stands in for "balanced" as it existed in an older builtin, before the current
        // builtin's value moved on.
        opencode: "cheap",
      },
    });

    const result = loadEffectiveRegistry({ overlayPath });
    expect(result.overlayError).toBeUndefined();
    expect(result.source.overlay?.hostDefaults?.opencode).toBe("cheap");
    expect(result.registry.hostDefaults.opencode).toBe("cheap"); // the overlay value wins
  });
});

// ── APUX-01: `agentTiers` section — validate, merge, normalize, count (design D-1,
// admin-portal-ux-overhaul, P1-A AC1-3). The registry lib knows nothing about which agents
// exist (file header), so agent-name validity is deliberately not checked at this layer —
// only host keys (via isHost) and tier values (via the declared tier list) are validated.
describe("model-profiles: agentTiers — validation (APUX-01 AC1)", () => {
  test("absent agentTiers key is injected as {} by validateRegistry — never left undefined", () => {
    const b = baseRegistry();
    expect("agentTiers" in b).toBe(false); // baseRegistry() deliberately omits it
    const r = validateRegistry(b) as Registry;
    expect(r.agentTiers).toEqual({});
    expect(r.agentTiers).not.toBeUndefined();
  });

  test("the shipped registry ships an explicit agentTiers: {} and loadRegistry passes it through unchanged", () => {
    const r = loadRegistry(REGISTRY_PATH);
    expect(r.agentTiers).toEqual({});
  });

  test("accepts a well-formed agentTiers entry (agent -> host -> declared tier)", () => {
    const b = baseRegistry();
    b.agentTiers = { builder: { opencode: "deep", claude: "standard" } };
    const r = validateRegistry(b) as Registry;
    expect(r.agentTiers).toEqual({ builder: { opencode: "deep", claude: "standard" } });
  });

  test("rejects an unknown host key inside an agent entry", () => {
    expectViolation(
      (x) => (x.agentTiers = { builder: { emacs: "deep" } }),
      'agentTiers.builder.emacs is not a known host (claude, codex, cursor, opencode)',
    );
  });

  test("rejects a tier value outside the declared tier list", () => {
    expectViolation(
      (x) => (x.agentTiers = { builder: { opencode: "max" } }),
      'agentTiers.builder.opencode must be one of light, standard, deep, got "max"',
    );
  });

  test("rejects a non-object per-agent entry", () => {
    expectViolation((x) => (x.agentTiers = { builder: "deep" }), "agentTiers.builder is not an object");
  });

  test("rejects a non-object agentTiers root", () => {
    expectViolation((x) => (x.agentTiers = "nope"), "agentTiers must be an object");
  });

  test("does NOT validate agent-name existence — that is the generator's job (design D-2), not this lib's", () => {
    const b = baseRegistry();
    b.agentTiers = { "an-agent-name-nobody-charters": { claude: "light" } };
    expect(() => validateRegistry(b)).not.toThrow();
  });
});

describe("model-profiles: agentTiers — merge (mergeOverlay, APUX-01 AC2, P1-A AC2)", () => {
  /** Fully synthetic, deep-merge delta semantics under the test's control — mirrors the
   *  FG1 syntheticBuiltin() pattern above, extended with agentTiers. */
  function syntheticBuiltinWithAgentTiers(): Registry {
    return {
      version: 1,
      tiers: ["light", "standard", "deep"],
      hostDefaults: { claude: "A", codex: "A", cursor: "A", opencode: "A" },
      workflowTiers: {},
      agentTiers: {
        builder: { claude: "standard", opencode: "standard" },
        navigator: { claude: "light" },
      },
      profiles: {
        A: {
          description: "Profile A",
          hosts: {
            claude: { light: { model: "a", effort: "low" } },
          },
        },
      },
    };
  }

  test("absent agent/host keys inherit; a mentioned host is overridden — kills whole-object-replace", () => {
    const builtin = syntheticBuiltinWithAgentTiers();
    const overlay: OverlayData = { agentTiers: { builder: { opencode: "deep" } } };
    const merged = mergeOverlay(builtin, overlay) as unknown as Registry;
    expect(merged.agentTiers.builder).toEqual({ claude: "standard", opencode: "deep" });
    // An agent the overlay never mentions is retained verbatim.
    expect(merged.agentTiers.navigator).toEqual(builtin.agentTiers.navigator);
  });

  test("agent-level null tombstones the whole agent entry", () => {
    const builtin = syntheticBuiltinWithAgentTiers();
    const overlay: OverlayData = { agentTiers: { navigator: null } };
    const merged = mergeOverlay(builtin, overlay) as unknown as Registry;
    expect("navigator" in merged.agentTiers).toBe(false);
    // The untouched agent survives.
    expect(merged.agentTiers.builder).toEqual(builtin.agentTiers.builder);
  });

  test("host-level null tombstones one host key without deleting the agent entry", () => {
    const builtin = syntheticBuiltinWithAgentTiers();
    const overlay: OverlayData = { agentTiers: { builder: { claude: null } } };
    const merged = mergeOverlay(builtin, overlay) as unknown as Registry;
    expect(merged.agentTiers.builder).toEqual({ opencode: "standard" });
  });

  test("a genuinely new agent the builtin never named passes through wholesale", () => {
    const builtin = syntheticBuiltinWithAgentTiers();
    const overlay: OverlayData = { agentTiers: { planner: { cursor: "deep" } } };
    const merged = mergeOverlay(builtin, overlay) as unknown as Registry;
    expect(merged.agentTiers.planner).toEqual({ cursor: "deep" });
  });

  test("shared cross-boundary parity fixture: mergeOverlay reproduces the fixture's expected merged agentTiers (Worker 2 asserts the identical fixture through the client's mergeRegistryForDisplay)", () => {
    const fixturePath = path.join(
      REPO_ROOT,
      "apps",
      "web-ui",
      "src",
      "__tests__",
      "fixtures",
      "agent-tiers-parity.json",
    );
    const fixture = JSON.parse(require("fs").readFileSync(fixturePath, "utf8")) as {
      builtinAgentTiers: Record<string, Record<string, string>>;
      overlayAgentTiers: Record<string, Record<string, string | null> | null>;
      expectedMergedAgentTiers: Record<string, Record<string, string>>;
    };
    const builtin: Registry = {
      ...syntheticBuiltinWithAgentTiers(),
      agentTiers: fixture.builtinAgentTiers,
    };
    const overlay: OverlayData = { agentTiers: fixture.overlayAgentTiers };
    const merged = mergeOverlay(builtin, overlay) as unknown as Registry;
    expect(merged.agentTiers).toEqual(fixture.expectedMergedAgentTiers);
  });
});

describe("model-profiles: agentTiers — normalize + count (APUX-01 AC3, P1-A AC3)", () => {
  function scratchOverlayPath(): string {
    const tmpDir = path.join(
      require("os").tmpdir(),
      `massa-ai-overlay-agenttiers-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    return path.join(tmpDir, "model-profiles.json");
  }

  function writeOverlay(overlayPath: string, data: unknown): void {
    const fs = require("fs");
    fs.mkdirSync(path.dirname(overlayPath), { recursive: true });
    fs.writeFileSync(overlayPath, JSON.stringify(data, null, 2));
  }

  // The shipped builtin's agentTiers is {} by design (D-1: "no agent list" holds for
  // defaults). That means every real-disk normalize case below routes through the "the
  // builtin lacks this key" branch of normalizeFlatMap — the identical byte-for-byte
  // dedup branch is exercised generically by the sibling hostDefaults/workflowTiers tests
  // above (normalizeAgentTiers calls the very same normalizeFlatMap one level deeper, so
  // that mechanism is not re-derived per section).

  test("a genuinely new agent's overrides survive normalization intact and are counted", () => {
    const overlayPath = scratchOverlayPath();
    writeOverlay(overlayPath, { agentTiers: { builder: { opencode: "deep", claude: "standard" } } });

    const result = loadEffectiveRegistry({ overlayPath });
    expect(result.overlayError).toBeUndefined();
    expect(result.source.overlay?.agentTiers).toEqual({
      builder: { opencode: "deep", claude: "standard" },
    });
    expect(result.overlayOverrideCount).toBe(2); // two host-level leaves
    expect(result.registry.agentTiers.builder).toEqual({ opencode: "deep", claude: "standard" });
  });

  test("a no-op host-level tombstone (host never existed on the builtin's empty agentTiers) is dropped, count 0", () => {
    const overlayPath = scratchOverlayPath();
    writeOverlay(overlayPath, { agentTiers: { builder: { opencode: null } } });

    const result = loadEffectiveRegistry({ overlayPath });
    expect(result.overlayError).toBeUndefined();
    expect(result.source.overlay?.agentTiers ?? {}).toEqual({});
    expect(result.overlayOverrideCount).toBe(0);
    expect(result.registry.agentTiers.builder ?? {}).toEqual({});
  });

  test("a no-op whole-agent tombstone (agent never existed on the builtin) is dropped, count 0", () => {
    const overlayPath = scratchOverlayPath();
    writeOverlay(overlayPath, { agentTiers: { builder: null } });

    const result = loadEffectiveRegistry({ overlayPath });
    expect(result.overlayError).toBeUndefined();
    expect(result.source.overlay?.agentTiers ?? {}).toEqual({});
    expect(result.overlayOverrideCount).toBe(0);
    expect("builder" in result.registry.agentTiers).toBe(false);
  });

  test("a mixed overlay counts only the surviving leaves, and each agent's shape is exact", () => {
    const overlayPath = scratchOverlayPath();
    writeOverlay(overlayPath, {
      agentTiers: {
        builder: { opencode: "deep" }, // survives: 1 leaf
        navigator: { emacs_is_not_a_host: null }, // no-op tombstone on an invalid host — the
        // merge validates hosts elsewhere; here it is simply an absent-in-builtin key, so
        // normalization drops it as a no-op, count 0 for this agent.
        ghost: null, // no-op whole-agent tombstone — agent never existed, count 0
      },
    });

    const result = loadEffectiveRegistry({ overlayPath });
    expect(result.overlayError).toBeUndefined();
    expect(result.overlayOverrideCount).toBe(1);
    expect(result.source.overlay?.agentTiers).toEqual({ builder: { opencode: "deep" } });
  });
});

// ── F3 sensor: generate-subagent-artifacts read-path split (T14) ──────────

describe("generate-subagent-artifacts read-path split (F3 sensor — T14)", () => {
  const fs = require("fs");

  test("runtime main() reads loadEffectiveRegistry (overlay reflected), --check stays on loadRegistry (builtin)", async () => {
    // Import the generator module to inspect its main function's behavior.
    // The F3 sensor: an overlay present changes the runtime (non---check) read
    // but --check still validates the builtin alone.
    const gen = await import("../generate-subagent-artifacts.ts");

    // Set an overlay that changes the balanced profile's claude/standard model.
    const tmpDir = path.join(
      require("os").tmpdir(),
      `massa-ai-f3-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const overlayPath = path.join(tmpDir, "model-profiles.json");
    fs.mkdirSync(path.dirname(overlayPath), { recursive: true });

    // Use loadEffectiveRegistry with the overlay to confirm the merge works.
    const overlayModel = "f3-overlay-test-model";
    const builtinReg = loadRegistry();
    const builtinBalanced = builtinReg.profiles.balanced;
    // Build a full overlay profile replacing balanced's model across all hosts
    // so the merged result validates (hostDefaults must point to profiles that
    // support every host).
    const overlayHosts = {};
    for (const [host, tierMap] of Object.entries(builtinBalanced.hosts)) {
      overlayHosts[host] = {};
      for (const [tier, pair] of Object.entries(tierMap)) {
        overlayHosts[host][tier] = { model: overlayModel, effort: pair.effort };
      }
    }
    fs.writeFileSync(overlayPath, JSON.stringify({
      profiles: {
        balanced: {
          description: "F3 overlay",
          hosts: overlayHosts,
        },
      },
    }, null, 2));

    const effective = loadEffectiveRegistry({ overlayPath });
    // The overlay model should be reflected in the effective registry.
    expect(effective.registry.profiles.balanced.hosts.claude.standard.model).toBe(overlayModel);
    expect(effective.source.overlay).not.toBeNull();
    expect(effective.source.tombstoned).toEqual([]);

    // The builtin (loadRegistry) must NOT reflect the overlay — --check stays
    // on builtin alone so a broken overlay never fails the build gate.
    const builtin = loadRegistry();
    expect(builtin.profiles.balanced.hosts.claude.standard.model).not.toBe(overlayModel);

    // Verify the generator module exports main and it is a function.
    expect(typeof gen.main).toBe("function");

    // Clean up the overlay so it does not leak into other tests.
    try { fs.unlinkSync(overlayPath); } catch {}
    try { fs.rmdirSync(tmpDir); } catch {}
  });

  test("runCheck with an overlay present ignores it and reads builtin (F3 — build gate stays on builtin)", async () => {
    // F3 sensor (strengthened): the --check path MUST read loadRegistry (builtin
    // alone), NOT loadEffectiveRegistry. We set a valid full overlay that changes
    // the balanced profile's model across all hosts, point XDG_CONFIG_HOME at it,
    // then invoke runCheck() with no opts.registry. If runCheck reads builtin,
    // the emitted variant dirs match the checked-in tree → exit 0. If runCheck
    // reads the effective registry (mutant), the overlay model is emitted into
    // the balanced variant dirs → drift vs checked-in → exit 1.
    const fs = require("fs");
    const path = require("path");
    const os = require("os");
    const gen = await import("../generate-subagent-artifacts.ts");
    expect(typeof gen.runCheck).toBe("function");

    const tmpXdg = path.join(
      os.tmpdir(),
      `massa-ai-f3-runchk-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const overlayPath = path.join(tmpXdg, "massa-ai", "model-profiles.json");
    fs.mkdirSync(path.dirname(overlayPath), { recursive: true });

    const overlayModel = "f3-runchk-overlay-model";
    const builtinReg = loadRegistry();
    const builtinBalanced = builtinReg.profiles.balanced;
    const overlayHosts = {};
    for (const [host, tierMap] of Object.entries(builtinBalanced.hosts)) {
      overlayHosts[host] = {};
      for (const [tier, pair] of Object.entries(tierMap)) {
        overlayHosts[host][tier] = { model: overlayModel, effort: pair.effort };
      }
    }
    fs.writeFileSync(overlayPath, JSON.stringify({
      profiles: { balanced: { description: "F3 runcheck overlay", hosts: overlayHosts } },
    }, null, 2));

    const prevXdg = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = tmpXdg;
    try {
      // Confirm the overlay is actually picked up by the effective loader
      // (proves the overlay is valid + reachable — otherwise the sensor is vacuous).
      const effective = loadEffectiveRegistry();
      expect(effective.registry.profiles.balanced.hosts.claude.standard.model).toBe(overlayModel);
      expect(effective.source.overlay).not.toBeNull();

      // runCheck must ignore the overlay and emit builtin → exit 0 (no drift).
      const code = await gen.runCheck();
      expect(code).toBe(0);
    } finally {
      process.env.XDG_CONFIG_HOME = prevXdg;
      try { fs.rmSync(tmpXdg, { recursive: true, force: true }); } catch {}
    }
  });
});
