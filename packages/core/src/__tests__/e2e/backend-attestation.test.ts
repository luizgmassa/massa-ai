import { describe, expect, test } from "bun:test";
import { resolveBackendAttestation } from "./_helpers";

describe("E2E backend attestation", () => {
  test("dedicated PostgreSQL declaration overrides local SQLite cache files", () => {
    expect(
      resolveBackendAttestation(true, "postgres", {
        "search-cache.db": "16 KB",
        "embedding-cache.db": "32 KB",
      }),
    ).toBe("postgres");
  });

  test("dedicated SQLite declaration remains authoritative", () => {
    expect(resolveBackendAttestation(true, "sqlite", {})).toBe("sqlite");
  });

  test("non-dedicated runs do not trust a local declaration for a remote API", () => {
    expect(
      resolveBackendAttestation(false, "postgres", { "search-cache.db": "16 KB" }),
    ).toBe("sqlite");
  });

  test("returns unknown without an authoritative declaration or cache evidence", () => {
    expect(resolveBackendAttestation(true, "invalid", {})).toBe("unknown");
    expect(resolveBackendAttestation(false, undefined, undefined)).toBe("unknown");
  });
});
