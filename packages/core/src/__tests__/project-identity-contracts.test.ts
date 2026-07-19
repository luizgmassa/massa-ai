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
    expect(() => canonicalProjectIdentityJson(new Date())).toThrow(TypeError);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalProjectIdentityJson(cyclic)).toThrow(TypeError);
  });
});
