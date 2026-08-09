/**
 * Unit coverage for the deployment-root resolver itself (design D-2, APCR-07).
 * Route-level coverage (the resolver wired into 501 responses) lives in
 * model-registry.test.ts and model-registry-stream.test.ts.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";

import {
  findDeploymentRoot,
  getDeploymentRoot,
  deploymentUnavailableMessage,
  __resetDeploymentRootCacheForTests,
} from "./model-registry-deployment.js";

beforeEach(() => {
  __resetDeploymentRootCacheForTests();
});

describe("findDeploymentRoot — bounded upward marker search", () => {
  test("finds the marker from the source-tree position (4 levels up)", () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-deploy-root-src-"));
    try {
      fs.mkdirSync(path.join(scratch, "scripts"), { recursive: true });
      fs.writeFileSync(path.join(scratch, "scripts", "generate-subagent-artifacts.ts"), "// marker");
      const start = path.join(scratch, "apps", "tools-api", "src", "routes");
      fs.mkdirSync(start, { recursive: true });

      expect(findDeploymentRoot(start)).toBe(scratch);
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });

  test("finds the marker from a simulated bundled dist/ position (3 levels up)", () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-deploy-root-dist-"));
    try {
      fs.mkdirSync(path.join(scratch, "scripts"), { recursive: true });
      fs.writeFileSync(path.join(scratch, "scripts", "generate-subagent-artifacts.ts"), "// marker");
      const start = path.join(scratch, "apps", "tools-api", "dist");
      fs.mkdirSync(start, { recursive: true });

      expect(findDeploymentRoot(start)).toBe(scratch);
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });

  test("never throws — an unresolvable position (no marker within the bounded walk) resolves to null", () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-deploy-root-none-"));
    try {
      const start = path.join(scratch, "a", "b", "c", "d", "e", "f", "g");
      fs.mkdirSync(start, { recursive: true });
      expect(() => findDeploymentRoot(start)).not.toThrow();
      expect(findDeploymentRoot(start)).toBeNull();
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });

  test("walking to the real filesystem root never throws (Docker/npm-package shape)", () => {
    // A position with genuinely nothing above it up to "/" — the Docker image
    // and published-npm-package cases design.md's table documents as `null`.
    const start = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-deploy-root-fsroot-"));
    try {
      expect(() => findDeploymentRoot(start)).not.toThrow();
    } finally {
      fs.rmSync(start, { recursive: true, force: true });
    }
  });
});

describe("getDeploymentRoot — memoized per process", () => {
  test("resolves once and memoizes (repeat calls return the identical value)", () => {
    const first = getDeploymentRoot();
    const second = getDeploymentRoot();
    expect(second).toBe(first);
  });

  test("finds the real repo root from this module's own position", () => {
    const root = getDeploymentRoot();
    expect(root).not.toBeNull();
    expect(fs.existsSync(path.join(root!, "scripts", "generate-subagent-artifacts.ts"))).toBe(true);
  });
});

describe("deploymentUnavailableMessage — one 501 shape", () => {
  test("names the missing artifact and states the source-checkout requirement", () => {
    const msg = deploymentUnavailableMessage("scripts/generate-subagent-artifacts.ts");
    expect(msg).toContain("model-registry is unavailable in this deployment");
    expect(msg).toContain("scripts/generate-subagent-artifacts.ts");
    expect(msg).toContain("massa-ai source checkout");
  });
});
