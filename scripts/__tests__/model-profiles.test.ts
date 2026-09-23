/**
 * Model profile registry v2 — resolver + validation tests.
 *
 * Covers the registry v2 shape from .specs/features/model-catalog-revamp/spec.md: a
 * `models` catalog (dropdown options only, D4) plus `profiles`, each with a per-host
 * default cell and optional per-agent overrides, resolved override-first (`resolveAgent`).
 *
 * Discrimination intent: every validation case asserts the error NAME (and, where it matters,
 * the offending key path) rather than merely "it threw". A test that only asserts `toThrow()`
 * passes when the code throws the wrong error for the wrong reason, which is exactly the
 * failure mode a fail-loud resolver must not have.
 */

import { describe, test, expect } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import {
  HOSTS,
  HOST_EFFORT_ENUM,
  PROFILE_ENV_VAR,
  RegistryValidationError,
  backupV1Overlay,
  effortViolation,
  hostsSupportedBy,
  isV1Shaped,
  loadRegistry,
  loadEffectiveRegistry,
  mergeOverlay,
  profileFlagFrom,
  resolveAgent,
  resolvedModelString,
  selectProfile,
  validateRegistry,
  type Host,
  type OverlayData,
  type Registry,
} from "../lib/model-profiles.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const REGISTRY_PATH = path.join(REPO_ROOT, "skills", "model-profiles.json");

/** A minimal, deliberately VALID v2 registry. Each negative test mutates one field of a deep
 *  clone, so a case can only fail for the reason it names. */
function baseRegistry(): Record<string, unknown> {
  return {
    version: 2,
    models: {
      "m-deep": { name: "Deep", host: "claude", provider: "", model: "m-deep" },
      "m-std": { name: "Std", host: "claude", provider: "", model: "m-std" },
    },
    profiles: {
      balanced: {
        description: "test profile",
        hosts: {
          claude: { model: "m-deep", effort: "high" },
          codex: { model: "m-deep", effort: "high" },
          cursor: { model: null, effort: null },
          opencode: { model: "m-deep", effort: "high" },
        },
        agents: {
          builder: {
            claude: { model: "m-std", effort: "high" },
          },
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
    expect(() => loadRegistry()).not.toThrow();
    const r = loadRegistry();
    expect(r.version).toBe(2);
    expect(Object.keys(r.profiles)).toContain("balanced");
  });

  test("AC3: every non-null model string in every built-in cell/override is a catalog-resolved string for that host", () => {
    const r = loadRegistry();
    const byHost = new Map<Host, Set<string>>();
    for (const h of HOSTS) byHost.set(h, new Set());
    for (const entry of Object.values(r.models)) {
      byHost.get(entry.host)!.add(resolvedModelString(entry));
    }
    const missing: string[] = [];
    for (const [pName, profile] of Object.entries(r.profiles)) {
      for (const [hName, cell] of Object.entries(profile.hosts)) {
        if (cell.model !== null && !byHost.get(hName as Host)!.has(cell.model)) {
          missing.push(`profiles.${pName}.hosts.${hName} = ${cell.model}`);
        }
      }
      for (const [aName, hostMap] of Object.entries(profile.agents ?? {})) {
        for (const [hName, cell] of Object.entries(hostMap)) {
          if (cell.model !== null && !byHost.get(hName as Host)!.has(cell.model)) {
            missing.push(`profiles.${pName}.agents.${aName}.${hName} = ${cell.model}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  test("AC3: the seeded aliases and pinned Claude models are present", () => {
    const r = loadRegistry();
    const claudeResolved = new Set(
      Object.values(r.models)
        .filter((m) => m.host === "claude")
        .map((m) => resolvedModelString(m)),
    );
    for (const expected of ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5-5", "claude-fable-5-1", "haiku", "sonnet", "opus"]) {
      expect(claudeResolved.has(expected)).toBe(true);
    }
  });

  test("every shipped effort value is legal for its host", () => {
    const r = loadRegistry();
    for (const [pName, profile] of Object.entries(r.profiles)) {
      for (const [hName, cell] of Object.entries(profile.hosts)) {
        const err = effortViolation(hName as Host, cell.model, cell.effort, `profiles.${pName}.hosts.${hName}`);
        expect(err).toBeNull();
      }
    }
  });

  test("cursor pins no model id in any profile — no resolvable Cursor id exists for a pinned entry", () => {
    const r = loadRegistry();
    for (const profile of Object.values(r.profiles)) {
      expect(profile.hosts.cursor?.model ?? null).toBeNull();
    }
  });

  test("host-specific profiles are genuinely host-specific and fail loud elsewhere", () => {
    const r = loadRegistry();
    expect(hostsSupportedBy(r, "open_models")).toEqual(["opencode"]);
    expect(hostsSupportedBy(r, "local_models")).toEqual(["opencode"]);
    expectThrowsNamed(
      () => selectProfile(r, "claude", { flag: "open_models" }),
      "MissingHostError",
      'does not support host "claude"',
    );
  });
});

// ── Profile selection ────────────────────────────────────────────────────────
describe("model-profiles: profile selection", () => {
  test("rank 4 (default): \"balanced\" when no flag, no env, no recorded state profile", () => {
    const r = loadRegistry();
    expect(selectProfile(r, "claude", { env: {} })).toBe("balanced");
  });

  test("rank 3: install-state's recorded profile beats the default", () => {
    const r = loadRegistry();
    expect(selectProfile(r, "claude", { env: {}, stateProfile: "cheap" })).toBe("cheap");
  });

  test("an unknown recorded state profile throws — never a silent fallback", () => {
    const r = loadRegistry();
    expectThrowsNamed(
      () => selectProfile(r, "claude", { env: {}, stateProfile: "ghost" }),
      "UnknownProfileError",
    );
  });

  test("rank 2: env var beats the recorded state profile", () => {
    const r = loadRegistry();
    expect(
      selectProfile(r, "claude", { env: { [PROFILE_ENV_VAR]: "heavy" }, stateProfile: "cheap" }),
    ).toBe("heavy");
  });

  test("rank 1: flag beats env var and the recorded state profile", () => {
    const r = loadRegistry();
    expect(
      selectProfile(r, "claude", {
        flag: "work",
        env: { [PROFILE_ENV_VAR]: "heavy" },
        stateProfile: "cheap",
      }),
    ).toBe("work");
  });

  test("blank flag and blank env fall through to the recorded state profile, not \"balanced\"", () => {
    const r = loadRegistry();
    expect(selectProfile(r, "claude", { flag: "  ", env: { [PROFILE_ENV_VAR]: "" }, stateProfile: "home" })).toBe(
      "home",
    );
  });

  test("a typo'd profile name cannot silently ship \"balanced\"", () => {
    const r = loadRegistry();
    expectThrowsNamed(() => selectProfile(r, "claude", { flag: "balancd", env: {} }), "UnknownProfileError");
  });

  test("selection also verifies the profile supports the host", () => {
    const r = loadRegistry();
    expectThrowsNamed(
      () => selectProfile(r, "cursor", { flag: "local_models", env: {} }),
      "MissingHostError",
    );
  });

  test("profileFlagFrom parses both --profile=x and --profile x", () => {
    expect(profileFlagFrom(["--profile=cheap"])).toBe("cheap");
    expect(profileFlagFrom(["--profile", "cheap"])).toBe("cheap");
    expect(profileFlagFrom(["--other"])).toBeNull();
  });
});

// ── Fail-loud validation ─────────────────────────────────────────────────────
describe("model-profiles: fail-loud validation", () => {
  test("the base fixture is valid — so negative cases prove the mutation, not the fixture", () => {
    expect(() => validateRegistry(baseRegistry())).not.toThrow();
  });

  test("version must be 2", () => {
    expectViolation((x) => (x.version = 1), "version must be 2");
  });

  test("profiles.balanced is required", () => {
    expectViolation((x) => {
      // A second profile keeps `profiles` non-empty after deleting balanced, so the
      // dedicated "balanced is required" check fires instead of the earlier
      // "profiles must be a non-empty object" throw.
      (x.profiles as Record<string, unknown>).other = clone((x.profiles as any).balanced);
      delete (x.profiles as Record<string, unknown>).balanced;
    }, "profiles.balanced is required");
  });

  test("UnknownProfileError: resolving a profile that does not exist", () => {
    const r = validateRegistry(baseRegistry()) as Registry;
    expectThrowsNamed(() => resolveAgent(r, "claude", "ghost", "builder"), "UnknownProfileError");
  });

  test("MissingHostError: profile does not define the host", () => {
    const b = baseRegistry();
    delete (b.profiles as Record<string, any>).balanced.hosts.opencode;
    const r2 = validateRegistry(b) as Registry;
    expectThrowsNamed(() => resolveAgent(r2, "opencode", "balanced", "builder"), "MissingHostError", "balanced");
  });

  test("a profile's hosts must be a non-empty object", () => {
    expectViolation((x) => ((x.profiles as any).balanced.hosts = {}), "hosts must be a non-empty object");
  });

  test("a host key must be a known host", () => {
    expectViolation(
      (x) => ((x.profiles as any).balanced.hosts.notahost = { model: "m", effort: null }),
      "is not a known host",
    );
  });

  test("a cell's model must be a non-empty string or null", () => {
    expectViolation((x) => ((x.profiles as any).balanced.hosts.claude.model = ""), "model must be a non-empty string or null");
  });

  test("a cell's effort must be a non-empty string or null", () => {
    expectViolation((x) => ((x.profiles as any).balanced.hosts.claude.effort = ""), "effort must be a non-empty string or null");
  });

  test("InvalidEffortError-shaped violation: an effort outside the host's enum", () => {
    expectViolation(
      (x) => ((x.profiles as any).balanced.hosts.claude.effort = "not-a-real-effort"),
      "is not one of",
    );
  });

  test("cursor: an effort alongside a null model is rejected (no effort key to hold it)", () => {
    expectViolation(
      (x) => ((x.profiles as any).balanced.hosts.cursor.effort = "high"),
      "effort must be null when model is null",
    );
  });

  test("an agent override's host must be a known host", () => {
    expectViolation(
      (x) => ((x.profiles as any).balanced.agents.builder.notahost = { model: "m", effort: null }),
      "is not a known host",
    );
  });

  test("an agent override cell is validated the same way as a host default cell", () => {
    expectViolation(
      (x) => ((x.profiles as any).balanced.agents.builder.claude.effort = "not-a-real-effort"),
      "is not one of",
    );
  });

  test("models.<id>.host must be a known host", () => {
    expectViolation((x) => ((x.models as any)["m-deep"].host = "notahost"), "is not a known host");
  });

  test("models.<id>.model must be a non-empty string", () => {
    expectViolation((x) => ((x.models as any)["m-deep"].model = ""), "model must be a non-empty string");
  });

  test("models.<id>.name is required", () => {
    expectViolation((x) => ((x.models as any)["m-deep"].name = ""), "name is required");
  });

  test("context1m is allowed only when host is claude", () => {
    expectViolation((x) => {
      (x.models as any)["m-deep"].host = "codex";
      (x.models as any)["m-deep"].context1m = true;
    }, 'context1m is only allowed when host is "claude"');
  });

  test("context1m: true is fine on a claude model", () => {
    const b = baseRegistry();
    (b.models as any)["m-deep"].context1m = true;
    expect(() => validateRegistry(b)).not.toThrow();
  });

  test("cells are never cross-checked against the catalog (D4) — an unlisted model string is valid", () => {
    const b = baseRegistry();
    (b.profiles as any).balanced.hosts.claude.model = "some-model-with-no-catalog-entry";
    expect(() => validateRegistry(b)).not.toThrow();
  });
});

// ── resolveAgent: override-first resolution ─────────────────────────────────
describe("model-profiles: resolveAgent (override-first, D1)", () => {
  test("an agent with an override on a host resolves to the override, not the host default", () => {
    const r = validateRegistry(baseRegistry()) as Registry;
    expect(resolveAgent(r, "claude", "balanced", "builder")).toEqual({ model: "m-std", effort: "high" });
  });

  test("an agent with no override resolves to the profile's host default", () => {
    const r = validateRegistry(baseRegistry()) as Registry;
    expect(resolveAgent(r, "claude", "balanced", "investigator")).toEqual({ model: "m-deep", effort: "high" });
  });

  test("an override on one host does not affect the same agent on another host", () => {
    const r = validateRegistry(baseRegistry()) as Registry;
    expect(resolveAgent(r, "codex", "balanced", "builder")).toEqual({ model: "m-deep", effort: "high" });
  });

  test("resolving an unknown profile throws UnknownProfileError", () => {
    const r = validateRegistry(baseRegistry()) as Registry;
    expectThrowsNamed(() => resolveAgent(r, "claude", "ghost", "builder"), "UnknownProfileError");
  });

  test("resolving a host the profile does not support throws MissingHostError", () => {
    const b = baseRegistry();
    delete (b.profiles as any).balanced.hosts.opencode;
    const r = validateRegistry(b) as Registry;
    expectThrowsNamed(() => resolveAgent(r, "opencode", "balanced", "builder"), "MissingHostError");
  });
});

// ── resolvedModelString ──────────────────────────────────────────────────────
describe("model-profiles: resolvedModelString", () => {
  test("no provider, no context1m", () => {
    expect(resolvedModelString({ provider: "", model: "claude-sonnet-5" })).toBe("claude-sonnet-5");
  });

  test("with a provider prefix", () => {
    expect(resolvedModelString({ provider: "opencode-go", model: "glm-5.2" })).toBe("opencode-go/glm-5.2");
  });

  test("with context1m", () => {
    expect(resolvedModelString({ provider: "", model: "claude-sonnet-5", context1m: true })).toBe(
      "claude-sonnet-5[1m]",
    );
  });

  test("context1m: false renders the same as omitted", () => {
    expect(resolvedModelString({ provider: "", model: "claude-sonnet-5", context1m: false })).toBe(
      "claude-sonnet-5",
    );
  });
});

// ── Overlay: merge / normalize / count ───────────────────────────────────────
describe("model-profiles: overlay merge (models + profiles)", () => {
  function tmpOverlayDir(): { dir: string; overlayPath: string } {
    const dir = mkdtempSync(path.join(os.tmpdir(), "massa-ai-overlay-"));
    return { dir, overlayPath: path.join(dir, "model-profiles.json") };
  }

  test("models.<id> is replaced whole by the overlay", () => {
    const builtin = loadRegistry();
    const overlay: OverlayData = {
      models: { "claude-alias-opus": { name: "Opus (custom)", host: "claude", provider: "", model: "opus" } },
    };
    const merged = mergeOverlay(builtin, overlay) as Registry;
    expect((merged.models as any)["claude-alias-opus"].name).toBe("Opus (custom)");
  });

  test("models.<id> = null tombstones the catalog entry", () => {
    const builtin = loadRegistry();
    const overlay: OverlayData = { models: { "claude-alias-opus": null } };
    const merged = mergeOverlay(builtin, overlay) as Registry;
    expect("claude-alias-opus" in (merged.models as object)).toBe(false);
  });

  test("a profile's hosts.<host> leaf merges, and an unmentioned host is retained from the builtin", () => {
    const builtin = loadRegistry();
    const overlay: OverlayData = {
      profiles: { balanced: { hosts: { claude: { model: "opus", effort: "max" } } } },
    };
    const merged = mergeOverlay(builtin, overlay) as Registry;
    expect(merged.profiles.balanced.hosts.claude).toEqual({ model: "opus", effort: "max" });
    expect(merged.profiles.balanced.hosts.codex).toEqual(builtin.profiles.balanced.hosts.codex);
  });

  test("a profile's hosts.<host> = null tombstones that host", () => {
    const builtin = loadRegistry();
    const overlay: OverlayData = { profiles: { balanced: { hosts: { cursor: null } } } };
    const merged = mergeOverlay(builtin, overlay) as Registry;
    expect("cursor" in merged.profiles.balanced.hosts).toBe(false);
  });

  test("a profile's agents.<agent>.<host> leaf merges, and other host keys for that agent are retained", () => {
    const builtin = loadRegistry();
    const overlay: OverlayData = {
      profiles: { balanced: { agents: { builder: { claude: { model: "opus", effort: "max" } } } } },
    };
    const merged = mergeOverlay(builtin, overlay) as Registry;
    expect(merged.profiles.balanced.agents!.builder!.claude).toEqual({ model: "opus", effort: "max" });
    expect(merged.profiles.balanced.agents!.builder!.codex).toEqual(builtin.profiles.balanced.agents!.builder!.codex);
  });

  test("agents.<agent> = null tombstones the whole agent's overrides", () => {
    const builtin = loadRegistry();
    const overlay: OverlayData = { profiles: { balanced: { agents: { builder: null } } } };
    const merged = mergeOverlay(builtin, overlay) as Registry;
    expect("builder" in (merged.profiles.balanced.agents ?? {})).toBe(false);
  });

  test("a profile's _delete: true tombstones the whole profile", () => {
    const builtin = loadRegistry();
    const overlay: OverlayData = { profiles: { cheap: { _delete: true } } };
    const merged = mergeOverlay(builtin, overlay) as Registry;
    expect("cheap" in merged.profiles).toBe(false);
  });

  test("loadEffectiveRegistry: end-to-end overlay application, and the count/breakdown reflects only surviving entries", () => {
    const { dir, overlayPath } = tmpOverlayDir();
    try {
      const overlay: OverlayData = {
        profiles: { balanced: { hosts: { claude: { model: "opus", effort: "max" } } } },
      };
      writeFileSync(overlayPath, JSON.stringify(overlay));
      const result = loadEffectiveRegistry({ overlayPath });
      expect(result.registry.profiles.balanced.hosts.claude).toEqual({ model: "opus", effort: "max" });
      expect(result.overlayOverrideBreakdown).toEqual({ models: 0, profiles: 1 });
      expect(result.overlayOverrideCount).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("normalization drops an overlay entry byte-identical to the current builtin", () => {
    const { dir, overlayPath } = tmpOverlayDir();
    try {
      const builtin = loadRegistry();
      const overlay: OverlayData = {
        profiles: { balanced: { hosts: { claude: { ...builtin.profiles.balanced.hosts.claude } } } },
      };
      writeFileSync(overlayPath, JSON.stringify(overlay));
      const result = loadEffectiveRegistry({ overlayPath });
      expect(result.overlayOverrideCount).toBe(0);
      expect(result.source.overlay).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("no overlay file present -> builtin only, zero breakdown", () => {
    const { dir, overlayPath } = tmpOverlayDir();
    try {
      const result = loadEffectiveRegistry({ overlayPath });
      expect(result.source.overlay).toBeNull();
      expect(result.overlayOverrideBreakdown).toEqual({ models: 0, profiles: 0 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── v1 overlay backup (D5, AC7) ──────────────────────────────────────────────
describe("model-profiles: v1 overlay detection and backup (D5, AC7)", () => {
  function tmpDir(): string {
    return mkdtempSync(path.join(os.tmpdir(), "massa-ai-v1-"));
  }

  test("isV1Shaped: true for each retired top-level key", () => {
    for (const key of ["tiers", "hostDefaults", "workflowTiers", "agentTiers"]) {
      expect(isV1Shaped({ [key]: {} })).toBe(true);
    }
  });

  test("isV1Shaped: true for a hosts.<host> leaf shaped like a tier map (no `model` key)", () => {
    expect(
      isV1Shaped({
        profiles: { balanced: { hosts: { claude: { light: { model: "x", effort: null } } } } },
      }),
    ).toBe(true);
  });

  test("isV1Shaped: false for a genuine v2 overlay", () => {
    expect(isV1Shaped({ profiles: { balanced: { hosts: { claude: { model: "opus", effort: "high" } } } } })).toBe(
      false,
    );
  });

  test("isV1Shaped: false for a non-object", () => {
    expect(isV1Shaped(null)).toBe(false);
    expect(isV1Shaped("nope")).toBe(false);
  });

  test("backupV1Overlay renames to model-profiles.v1.json, once", () => {
    const dir = tmpDir();
    try {
      const overlayPath = path.join(dir, "model-profiles.json");
      writeFileSync(overlayPath, JSON.stringify({ tiers: ["light"] }));
      const backupPath = backupV1Overlay(overlayPath);
      expect(backupPath).toBe(path.join(dir, "model-profiles.v1.json"));
      expect(existsSync(overlayPath)).toBe(false);
      expect(existsSync(backupPath)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("backupV1Overlay falls back to a timestamped name when model-profiles.v1.json already exists", () => {
    const dir = tmpDir();
    try {
      writeFileSync(path.join(dir, "model-profiles.v1.json"), "{}");
      const overlayPath = path.join(dir, "model-profiles.json");
      writeFileSync(overlayPath, JSON.stringify({ tiers: ["light"] }));
      const backupPath = backupV1Overlay(overlayPath);
      expect(backupPath).not.toBe(path.join(dir, "model-profiles.v1.json"));
      expect(backupPath).toMatch(/model-profiles\.v1\.\d+\.json$/);
      expect(existsSync(backupPath)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("loadEffectiveRegistry: a v1-shaped overlay is renamed exactly once, warns once, and the registry equals the builtin", () => {
    const dir = tmpDir();
    try {
      const overlayPath = path.join(dir, "model-profiles.json");
      writeFileSync(
        overlayPath,
        JSON.stringify({ hostDefaults: { claude: "balanced" }, profiles: {} }),
      );
      const warnCalls: unknown[][] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        warnCalls.push(args);
      };
      try {
        const result = loadEffectiveRegistry({ overlayPath });
        expect(result.v1BackupPath).toBe(path.join(dir, "model-profiles.v1.json"));
        expect(existsSync(overlayPath)).toBe(false);
        expect(existsSync(result.v1BackupPath!)).toBe(true);
        expect(JSON.stringify(result.registry)).toBe(JSON.stringify(loadRegistry()));
        const v1WarnCalls = warnCalls.filter((args) => String(args[0] ?? "").includes("v1"));
        expect(v1WarnCalls.length).toBe(1);
      } finally {
        console.warn = originalWarn;
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("loadEffectiveRegistry: a v2 overlay is never renamed", () => {
    const dir = tmpDir();
    try {
      const overlayPath = path.join(dir, "model-profiles.json");
      const overlay: OverlayData = {
        profiles: { balanced: { hosts: { claude: { model: "opus", effort: "max" } } } },
      };
      writeFileSync(overlayPath, JSON.stringify(overlay));
      const result = loadEffectiveRegistry({ overlayPath });
      expect(result.v1BackupPath).toBeUndefined();
      expect(existsSync(overlayPath)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── HOST_EFFORT_ENUM sanity ──────────────────────────────────────────────────
describe("model-profiles: HOST_EFFORT_ENUM", () => {
  test("every host in HOSTS has an enum entry (possibly empty)", () => {
    for (const h of HOSTS) {
      expect(HOST_EFFORT_ENUM[h]).toBeDefined();
    }
  });

  test("cursor's enum is empty — it has no effort key", () => {
    expect(HOST_EFFORT_ENUM.cursor).toEqual([]);
  });
});

// ── registry file sanity ─────────────────────────────────────────────────────
describe("model-profiles: registry file", () => {
  test("the shipped registry file parses as JSON and round-trips through loadRegistry", () => {
    const raw = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
    expect(raw.version).toBe(2);
    expect(() => loadRegistry(REGISTRY_PATH)).not.toThrow();
  });
});
