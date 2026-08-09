/**
 * findRepoRootWithMarker unit tests — the generic bounded-walk `apps/
 * tools-api/src/routes/model-registry-deployment.ts`'s findDeploymentRoot
 * now delegates to (see repo-root.ts's module docblock). Mirrors that
 * module's own findDeploymentRoot test shapes, generalized to an arbitrary
 * marker/level budget.
 */
import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { findRepoRootWithMarker } from "../repo-root.js";

describe("findRepoRootWithMarker — bounded upward marker search", () => {
  test("finds the marker N levels up", () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-repo-root-"));
    try {
      fs.writeFileSync(path.join(scratch, "MARKER.txt"), "// marker");
      const start = path.join(scratch, "a", "b", "c");
      fs.mkdirSync(start, { recursive: true });

      expect(findRepoRootWithMarker(start, "MARKER.txt", 6)).toBe(scratch);
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });

  test("resolves to null, never throws, when the marker is outside the level budget", () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-repo-root-budget-"));
    try {
      fs.writeFileSync(path.join(scratch, "MARKER.txt"), "// marker");
      const start = path.join(scratch, "a", "b", "c", "d", "e");
      fs.mkdirSync(start, { recursive: true });

      // scratch is 5 levels up from `start`; a budget of 2 cannot reach it.
      expect(() => findRepoRootWithMarker(start, "MARKER.txt", 2)).not.toThrow();
      expect(findRepoRootWithMarker(start, "MARKER.txt", 2)).toBeNull();
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });

  test("walking to the real filesystem root never throws", () => {
    const start = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-repo-root-fsroot-"));
    try {
      expect(() => findRepoRootWithMarker(start, "NEVER-EXISTS.marker", 50)).not.toThrow();
      expect(findRepoRootWithMarker(start, "NEVER-EXISTS.marker", 50)).toBeNull();
    } finally {
      fs.rmSync(start, { recursive: true, force: true });
    }
  });
});
