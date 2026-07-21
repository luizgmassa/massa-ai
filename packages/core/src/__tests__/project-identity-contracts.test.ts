import { describe, expect, test } from "bun:test";

import {
  PROJECT_IDENTITY_PLAN_VERSION,
  ProjectIdentityError,
  canonicalProjectIdentityJson,
  hashProjectIdentityPlan,
  parseProjectIdentityApplyRequest,
  parseProjectIdentityPreviewRequest,
  type ProjectIdentityPlanMaterial,
} from "../services/project-identity/index.js";

const plan: ProjectIdentityPlanMaterial = {
  planVersion: PROJECT_IDENTITY_PLAN_VERSION,
  mode: "rename",
  sourceProjectId: "old-project",
  targetProjectId: "new-project",
  sourceCanonicalRoot: "/repo",
  targetCanonicalRoot: null,
  stores: [
    { storeId: "memories", directCount: 3, adaptedCount: 1 },
    { storeId: "workspaces", directCount: 1, adaptedCount: 0 },
  ],
  conflicts: [],
  unknownStores: [],
};

describe("project identity request contracts", () => {
  test("preview defaults dryRun to true and trims IDs", () => {
    expect(parseProjectIdentityPreviewRequest({
      mode: "rename",
      sourceProjectId: " old-project ",
      targetProjectId: " new-project ",
    })).toEqual({
      mode: "rename",
      sourceProjectId: "old-project",
      targetProjectId: "new-project",
      dryRun: true,
    });
  });

  test("apply requires false dryRun, an operation ID, and a lowercase SHA-256 hash", () => {
    const parsed = parseProjectIdentityApplyRequest({
      mode: "merge",
      sourceProjectId: "source",
      targetProjectId: "target",
      dryRun: false,
      operationId: "deploy:2026-07-19.1",
      expectedPlanHash: "a".repeat(64),
    });
    expect(parsed.operationId).toBe("deploy:2026-07-19.1");

    for (const input of [
      { ...parsed, dryRun: true },
      { ...parsed, operationId: "bad operation" },
      { ...parsed, expectedPlanHash: "A".repeat(64) },
      { ...parsed, targetProjectId: "source" },
    ]) {
      expect(() => parseProjectIdentityApplyRequest(input)).toThrow(ProjectIdentityError);
    }
  });

  test("rejects unknown request fields without exposing validation internals", () => {
    try {
      parseProjectIdentityPreviewRequest({
        mode: "rename",
        sourceProjectId: "source",
        targetProjectId: "target",
        sql: "SELECT secret",
      });
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectIdentityError);
      expect((error as ProjectIdentityError).code).toBe("INVALID_PROJECT_IDENTITY_REQUEST");
      expect((error as Error).message).toBe("The project identity request is invalid");
      expect((error as Error).message).not.toContain("sql");
    }
  });
});

describe("project identity canonical hashing", () => {
  test("sorts object keys recursively while preserving array order", () => {
    expect(canonicalProjectIdentityJson({ z: 1, nested: { b: 2, a: 1 } }))
      .toBe('{"nested":{"a":1,"b":2},"z":1}');
    expect(canonicalProjectIdentityJson({ a: [2, 1] }))
      .not.toBe(canonicalProjectIdentityJson({ a: [1, 2] }));
  });

  test("produces a deterministic version-bound SHA-256 plan hash", () => {
    const hash = hashProjectIdentityPlan(plan);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashProjectIdentityPlan({ ...plan })).toBe(hash);
    expect(hashProjectIdentityPlan({
      ...plan,
      stores: [...plan.stores].reverse(),
    })).toBe(hash);
    expect(hashProjectIdentityPlan({
      ...plan,
      stores: [{ ...plan.stores[0]!, directCount: 4 }, plan.stores[1]!],
    })).not.toBe(hash);
  });

  test("rejects values JSON would silently coerce", () => {
    expect(() => canonicalProjectIdentityJson({ bad: undefined })).toThrow(TypeError);
    expect(() => canonicalProjectIdentityJson({ bad: Number.NaN })).toThrow(TypeError);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalProjectIdentityJson(cyclic)).toThrow(TypeError);
    // NOTE (T6 correction): Date/bytea/bigint are NOT rejected — real
    // PostgreSQL row material carries timestamp/bytea columns, and the plan
    // fingerprint must canonicalize them (tagged forms, see below). The prior
    // Date-throws assertion was written against plain-JSON fakes and was
    // falsified by the owned-PG acceptance gate.
  });
});

describe("canonical JSON — PostgreSQL driver values (T6 finding)", () => {
  test("Date, bytea, and bigint canonicalize to tagged unambiguous forms", () => {
    const date = new Date("2026-07-20T12:00:00.000Z");
    const bytes = Buffer.from("hello", "utf8");
    expect(canonicalProjectIdentityJson({ d: date })).toBe('{"d":"date:2026-07-20T12:00:00.000Z"}');
    expect(canonicalProjectIdentityJson({ b: bytes })).toBe(`{"b":"bytes:${bytes.toString("base64")}"}`);
    expect(canonicalProjectIdentityJson({ n: BigInt(42) })).toBe('{"n":"bigint:42"}');
    // Tagged forms never collide with plain text holding the same characters.
    expect(canonicalProjectIdentityJson({ n: "42" })).not.toBe(canonicalProjectIdentityJson({ n: BigInt(42) }));
    expect(canonicalProjectIdentityJson({ d: "2026-07-20T12:00:00.000Z" })).not.toBe(
      canonicalProjectIdentityJson({ d: date }),
    );
    // Uint8Array (non-Buffer) takes the same bytea path.
    expect(canonicalProjectIdentityJson({ b: new Uint8Array([104, 105]) })).toBe(
      canonicalProjectIdentityJson({ b: Buffer.from("hi", "utf8") }),
    );
  });
});
