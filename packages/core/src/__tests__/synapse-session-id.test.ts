/**
 * SEC-2 regression tests — CodeQL js/insecure-randomness (alerts #10-#12).
 *
 * Synapse session IDs were previously `syn_<timestamp36>_<Math.random()>`:
 * the timestamp narrowed the guess window and Math.random() is a predictable
 * PRNG, so an authenticated caller could guess another agent's sessionId and
 * access its working-memory buffer. The fix centralizes generation in
 * newSynapseSessionId(), backed by crypto.randomUUID() (CSPRNG).
 */

import { describe, expect, it } from "bun:test";
import { newSynapseSessionId } from "../services/synapse/session/index.js";

const UUID_V4_RE =
  /^syn_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newSynapseSessionId", () => {
  it("returns a syn_-prefixed RFC 4122 version-4 UUID", () => {
    expect(newSynapseSessionId()).toMatch(UUID_V4_RE);
  });

  it("never contains timestamp or base36 Math.random segments", () => {
    // Old format: syn_<base36 timestamp>_<8 base36 chars> — two underscores,
    // short segments. The new format must not be parseable as that shape.
    const id = newSynapseSessionId();
    expect(id.split("_")).toHaveLength(2);
    expect(id).not.toMatch(/^syn_[a-z0-9]+_[a-z0-9]{8}$/);
  });

  it("generates unique IDs across a large batch", () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => newSynapseSessionId()));
    expect(ids.size).toBe(10_000);
  });

  it("carries the full UUID entropy (36-char suffix)", () => {
    const suffix = newSynapseSessionId().slice("syn_".length);
    expect(suffix).toHaveLength(36);
  });
});
