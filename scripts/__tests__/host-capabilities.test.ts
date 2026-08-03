/**
 * scripts/lib/host-capabilities.ts — unit tests (XP-06 / TASK-XP-009).
 *
 * T9 scope: shape, frozen/no-mutation, and per-host expected values only.
 * Fixture-host discrimination through the generators' hosts seam is added by
 * T12 (see the "fixture 5th host" describe block appended below it).
 */
import { describe, expect, test } from "bun:test";
import { HOST_CAPABILITIES, HOSTS, capabilitiesFor, type Host, type HostCapabilities } from "../lib/host-capabilities.ts";
import { HOSTS as MODEL_PROFILES_HOSTS } from "../lib/model-profiles.ts";

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
