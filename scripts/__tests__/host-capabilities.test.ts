/**
 * scripts/lib/host-capabilities.ts — unit tests (XP-06 / TASK-XP-009).
 *
 * T9 scope: shape, frozen/no-mutation, and per-host expected values only.
 * Fixture-host discrimination through the generators' hosts seam is added by
 * T12 (see the "fixture 5th host" describe block appended below it).
 */
import { describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { HOST_CAPABILITIES, HOSTS, capabilitiesFor, type Host, type HostCapabilities } from "../lib/host-capabilities.ts";
import { HOSTS as MODEL_PROFILES_HOSTS } from "../lib/model-profiles.ts";
import {
  emitAll as emitAllSkills,
  hookBinaryHosts,
  managedRootsFor,
  type CapsLookup,
} from "../generate-skill-artifacts.ts";

describe("HOSTS / Host re-export", () => {
  test("HOSTS is re-exported from model-profiles.ts verbatim (single enumeration, no duplicate array)", () => {
    expect(HOSTS).toBe(MODEL_PROFILES_HOSTS);
  });

  test("HOSTS has exactly the 4 known hosts", () => {
    expect([...HOSTS].sort()).toEqual(["claude", "codex", "cursor", "opencode"]);
  });
});

describe("HOST_CAPABILITIES shape", () => {
  test("has exactly one entry per host, no extras", () => {
    expect(Object.keys(HOST_CAPABILITIES).sort()).toEqual([...HOSTS].sort());
  });

  const REQUIRED_FIELDS: (keyof HostCapabilities)[] = [
    "artifactExtension",
    "agentIdentity",
    "ownershipMarker",
    "forwardsUnknownFrontmatter",
    "hookBinaryDelivery",
    "extraManagedRoots",
    "sessionStartStdoutDelivered",
    "handoffInjectionPoint",
  ];

  test.each(HOSTS)("%s declares every HostCapabilities field", (host) => {
    const caps = capabilitiesFor(host as Host);
    for (const field of REQUIRED_FIELDS) {
      expect(caps).toHaveProperty(field);
    }
  });

  test.each(HOSTS)("%s: artifactExtension is 'md' or 'toml'", (host) => {
    expect(["md", "toml"]).toContain(capabilitiesFor(host as Host).artifactExtension);
  });

  test.each(HOSTS)("%s: ownershipMarker is one of the three known mechanisms", (host) => {
    expect(["frontmatter", "body", "filename"]).toContain(capabilitiesFor(host as Host).ownershipMarker);
  });
});

describe("HOST_CAPABILITIES is frozen — no-mutation invariant (7-step Step 4)", () => {
  test("the top-level record is frozen", () => {
    expect(Object.isFrozen(HOST_CAPABILITIES)).toBe(true);
  });

  test("each per-host entry is frozen", () => {
    for (const host of HOSTS) {
      expect(Object.isFrozen(capabilitiesFor(host))).toBe(true);
    }
  });

  test("extraManagedRoots arrays are frozen", () => {
    for (const host of HOSTS) {
      expect(Object.isFrozen(capabilitiesFor(host).extraManagedRoots)).toBe(true);
    }
  });

  test("mutating a field on a returned capabilities object throws in strict mode", () => {
    "use strict";
    const caps = capabilitiesFor("claude");
    expect(() => {
      // @ts-expect-error — intentionally violating the readonly contract to prove it's enforced at runtime, not just compile time
      caps.artifactExtension = "toml";
    }).toThrow();
  });

  test("capabilitiesFor returns the SAME frozen object on repeated calls (no copy-on-read escape hatch)", () => {
    expect(capabilitiesFor("claude")).toBe(capabilitiesFor("claude"));
  });
});

// ── Per-host expected values (measured facts — see host-capabilities.ts docblocks) ──

describe("per-host expected capability values", () => {
  test("claude: md, frontmatter-name identity, filename-scoped ownership, source hook delivery", () => {
    const c = capabilitiesFor("claude");
    expect(c.artifactExtension).toBe("md");
    expect(c.agentIdentity).toBe("frontmatter-name");
    expect(c.ownershipMarker).toBe("filename");
    expect(c.forwardsUnknownFrontmatter).toBe(false);
    expect(c.hookBinaryDelivery).toBe("source");
    expect(c.extraManagedRoots).toEqual([]);
    expect(c.handoffInjectionPoint).toBeNull();
  });

  test("codex: toml, frontmatter-name identity, frontmatter (top-comment) ownership, real-copy hook delivery", () => {
    const c = capabilitiesFor("codex");
    expect(c.artifactExtension).toBe("toml");
    expect(c.agentIdentity).toBe("frontmatter-name");
    expect(c.ownershipMarker).toBe("frontmatter");
    expect(c.forwardsUnknownFrontmatter).toBe(false);
    expect(c.hookBinaryDelivery).toBe("real-copy");
    expect(c.extraManagedRoots).toEqual([]);
    expect(c.sessionStartStdoutDelivered).toBe(true);
    expect(c.handoffInjectionPoint).toBe("session-start");
  });

  test("cursor: md, frontmatter-name identity, filename-scoped ownership, real-copy hook delivery", () => {
    const c = capabilitiesFor("cursor");
    expect(c.artifactExtension).toBe("md");
    expect(c.agentIdentity).toBe("frontmatter-name");
    expect(c.ownershipMarker).toBe("filename");
    expect(c.hookBinaryDelivery).toBe("real-copy");
    expect(c.extraManagedRoots).toEqual([]);
    expect(c.sessionStartStdoutDelivered).toBe(true);
    expect(c.handoffInjectionPoint).toBe("session-start");
  });

  test("opencode: md, filename identity (no name key), body-scoped ownership, forwards unknown frontmatter, no hook binary, extra 'lib' root", () => {
    const c = capabilitiesFor("opencode");
    expect(c.artifactExtension).toBe("md");
    expect(c.agentIdentity).toBe("filename");
    expect(c.ownershipMarker).toBe("body");
    expect(c.forwardsUnknownFrontmatter).toBe(true);
    expect(c.hookBinaryDelivery).toBe("none");
    expect(c.extraManagedRoots).toEqual(["lib"]);
    expect(c.handoffInjectionPoint).toBeNull();
  });

  test("only opencode forwards unknown frontmatter keys (the sole reason its ownershipMarker is body, not frontmatter)", () => {
    for (const host of HOSTS) {
      const c = capabilitiesFor(host);
      expect(c.forwardsUnknownFrontmatter).toBe(host === "opencode");
    }
  });

  test("exactly claude and cursor scope ownership by filename (the SPEC_DEVIATION third value)", () => {
    const byFilename = HOSTS.filter((h) => capabilitiesFor(h).ownershipMarker === "filename").sort();
    expect(byFilename).toEqual(["claude", "cursor"]);
  });

  test("exactly codex and cursor deliver the hook binary as a real copy; claude is the source; opencode has none", () => {
    expect(capabilitiesFor("claude").hookBinaryDelivery).toBe("source");
    expect(capabilitiesFor("codex").hookBinaryDelivery).toBe("real-copy");
    expect(capabilitiesFor("cursor").hookBinaryDelivery).toBe("real-copy");
    expect(capabilitiesFor("opencode").hookBinaryDelivery).toBe("none");
  });
});

// ── T12: fixture 5th host — proves the capability table is load-bearing ────
//
// XP-06 AC-2 / spec edge case: "WHEN a fixture 5th host declares a capability
// combination no real host has THEN emitters SHALL follow the predicate
// table, proving the table is load-bearing (not a naming exercise)." This
// fixture host is declared HERE ONLY — it is never added to HOSTS or
// HOST_CAPABILITIES, so it never ships (asserted for real via `git status
// --short apps/` in the task's own verification, and structurally: nothing
// in this describe block ever writes outside a temp directory).
//
// The capability combination deliberately mixes traits no real host pairs:
// codex's TOML extension with opencode's forced-body ownership marker, real
// hook-binary delivery (like codex/cursor), AND an extra managed root (like
// opencode) — a combination that only a genuinely table-driven generator
// could honor correctly.
describe("fixture 5th host — driven through emitAll's hosts seam (T12)", () => {
  const FIXTURE_HOST = "fixturehost";

  const FIXTURE_CAPS: HostCapabilities = {
    artifactExtension: "toml",
    agentIdentity: "filename",
    ownershipMarker: "body",
    forwardsUnknownFrontmatter: true,
    hookBinaryDelivery: "real-copy",
    extraManagedRoots: ["lib"],
    sessionStartStdoutDelivered: null,
    handoffInjectionPoint: null,
  };

  /** Real hosts resolve through the real table; the fixture host resolves to
   *  FIXTURE_CAPS only for THIS lookup function — HOST_CAPABILITIES itself is
   *  never touched. */
  const fixtureCapsLookup: CapsLookup = (host) =>
    host === FIXTURE_HOST ? FIXTURE_CAPS : capabilitiesFor(host as Host);

  test("hookBinaryHosts(): the fixture host is included because its table entry says hookBinaryDelivery is real-copy — a name-based check could never do this", () => {
    const hosts = [...HOSTS, FIXTURE_HOST];
    const result = hookBinaryHosts(hosts, fixtureCapsLookup);
    expect(result).toContain(FIXTURE_HOST);
    // Real hosts unaffected: still exactly codex + cursor.
    expect(result.filter((h) => h !== FIXTURE_HOST).sort()).toEqual(["codex", "cursor"]);
  });

  test("hookBinaryHosts(): with the REAL capabilitiesFor (no fixture lookup), an unregistered host is excluded — the table, not the string, decides", () => {
    const hosts = [...HOSTS, FIXTURE_HOST];
    const result = hookBinaryHosts(hosts); // default capsLookup = real capabilitiesFor
    expect(result).not.toContain(FIXTURE_HOST);
  });

  test("managedRootsFor(): the fixture host gets the extra 'lib' root from its own table entry", () => {
    const roots = managedRootsFor(FIXTURE_HOST, fixtureCapsLookup);
    expect(roots).toContain("lib");
  });

  test("managedRootsFor(): a real host (claude, no extraManagedRoots) does not get 'lib'", () => {
    expect(managedRootsFor("claude")).not.toContain("lib");
  });

  test("emitAll(): the fixture host actually receives a hook-binary copy AND a lib copy, written to a temp dir only — real emitter behavior, not just a data-table read", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-fixture-host-"));
    try {
      const hosts = [...HOSTS, FIXTURE_HOST];
      const targetRoots: Record<string, string> = Object.fromEntries(
        hosts.map((h) => [h, path.join(tmp, h)]),
      );
      const total = await emitAllSkills(targetRoots, hosts, fixtureCapsLookup);
      expect(total).toBeGreaterThan(0);

      // Real behavior difference #1: hook binary copied for the fixture host.
      const fixtureHook = path.join(targetRoots[FIXTURE_HOST]!, "hooks", "massa-ai-hook");
      const hookStat = await fs.stat(fixtureHook);
      expect(hookStat.isFile()).toBe(true);

      // Real behavior difference #2: lib copy present for the fixture host.
      const fixtureLib = path.join(targetRoots[FIXTURE_HOST]!, "lib", "opencode-config.cjs");
      const libStat = await fs.stat(fixtureLib);
      expect(libStat.isFile()).toBe(true);

      // Control: claude gets neither (source hookBinaryDelivery, no extraManagedRoots).
      await expect(
        fs.stat(path.join(targetRoots.claude!, "hooks", "massa-ai-hook")),
      ).rejects.toThrow();
      await expect(fs.stat(path.join(targetRoots.claude!, "lib"))).rejects.toThrow();
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  test("the fixture host is declared nowhere in the shipped table — HOST_CAPABILITIES stays exactly the 4 real hosts", () => {
    expect(Object.keys(HOST_CAPABILITIES)).not.toContain(FIXTURE_HOST);
    expect(HOSTS as readonly string[]).not.toContain(FIXTURE_HOST);
  });
});
