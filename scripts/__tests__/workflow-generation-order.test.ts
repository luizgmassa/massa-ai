/**
 * Workflow generation-order sensor (T10/T11, UGB-10/UGB-11).
 *
 * Generated apps/*-plugin bundles are gitignored build output (UGB-01) — every
 * CI/publish step that reads them (build, verify-package-contents, the
 * skill-artifact drift check, the test suites, the upload of build artifacts)
 * needs a fresh emit to have already happened in the SAME job, because none of
 * these workflows checks out or restores the bundles from anywhere else.
 *
 * This is a plain line-scan over the workflow YAML text, not a general parser —
 * same precedent as `verify-package-contents.ts`'s `extractArtifactPaths` and
 * `generate-subagent-artifacts.ts`'s `parseSimpleYaml`: a small indentation/
 * literal-based scanner is safer than adding a YAML dependency neither workspace
 * manifest declares, for a fixed, self-owned step-name shape this repo controls.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import path from "path";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const CI_WORKFLOW = path.join(REPO_ROOT, ".github/workflows/ci.yml");

/**
 * Index of a `- name: <label>` step line, or -1 if absent. Matches the exact
 * trimmed step-name line, mirroring `extractArtifactPaths`'s convention.
 */
function stepIndex(lines: string[], label: string): number {
  return lines.findIndex((line) => line.trim() === `- name: ${label}`);
}

describe("workflow generation order (T10, UGB-10)", () => {
  test("ci.yml build job: 'Generate plugin bundles' precedes 'Verify package contents (publish artifact parity)'", () => {
    const text = readFileSync(CI_WORKFLOW, "utf8");
    const lines = text.split("\n");

    const genIndex = stepIndex(lines, "Generate plugin bundles");
    expect(genIndex).toBeGreaterThan(-1);

    const verifyIndex = stepIndex(lines, "Verify package contents (publish artifact parity)");
    expect(verifyIndex).toBeGreaterThan(-1);

    expect(genIndex).toBeLessThan(verifyIndex);
  });

  test("ci.yml build job: 'Generate plugin bundles' precedes the skill-artifact drift gate", () => {
    const text = readFileSync(CI_WORKFLOW, "utf8");
    const lines = text.split("\n");

    const genIndex = stepIndex(lines, "Generate plugin bundles");
    const driftIndex = stepIndex(lines, "Verify skill-bundle artifacts (drift gate)");
    expect(driftIndex).toBeGreaterThan(-1);

    expect(genIndex).toBeLessThan(driftIndex);
  });

  test("ci.yml build job: 'Generate plugin bundles' precedes 'Test plugin installers'", () => {
    const text = readFileSync(CI_WORKFLOW, "utf8");
    const lines = text.split("\n");

    const genIndex = stepIndex(lines, "Generate plugin bundles");
    const testPluginsIndex = stepIndex(lines, "Test plugin installers");
    expect(testPluginsIndex).toBeGreaterThan(-1);

    expect(genIndex).toBeLessThan(testPluginsIndex);
  });
});
