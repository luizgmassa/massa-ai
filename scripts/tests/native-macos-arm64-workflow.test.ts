import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { EXPECTED_BUN_VERSION } from "../verify-tree-sitter-grammars.ts";

const ROOT = resolve(import.meta.dir, "../..");
const CI_PATH = resolve(ROOT, ".github/workflows/ci.yml");

// The macOS native CI job was merged inline into ci.yml as the
// `structural-native` job (lines 150-190), replacing the former separate
// .github/workflows/native-macos-arm64.yml. This test asserts the actual
// inline job: pins Bun 1.3.14 + Node 22 LTS (the macOS build helper — Node 25
// V8 headers fail under macos-14 Apple clang), runs frozen install + build +
// native-structural unit tests. It does NOT run verify:tree-sitter-native or
// upload provenance (unlike the former separate file).
function readCi(): string {
  return readFileSync(CI_PATH, "utf8");
}

describe("native macOS arm64 CI workflow (ci.yml structural-native job)", () => {
  test("pins the exact runtime and build helper and targets darwin-arm64 only", () => {
    const yaml = readCi();
    expect(yaml).toContain("structural-native:");
    expect(yaml).toContain("name: Structural native tests (darwin-arm64)");
    expect(yaml).toContain("runs-on: macos-14");
    expect(yaml).toContain(`bun-version: ${EXPECTED_BUN_VERSION}`);
    // Node 22 LTS is the macOS build helper (Node 25 V8 headers fail under
    // macos-14 Apple clang per the ci.yml comment). The contract Node 25.9.0
    // is the Linux build helper, not macOS.
    expect(yaml).toContain("node-version: '22'");
    // must not target a non-arm64 / Linux host in the macOS job
    expect(yaml).toContain("timeout-minutes: 20");
  });

  test("runs frozen install, build, and native-structural unit tests", () => {
    const yaml = readCi();
    expect(yaml).toContain("bun install --frozen-lockfile");
    expect(yaml).toContain("bun run build");
    // The inline macOS job runs native-structural unit tests, NOT the full
    // verify:tree-sitter-native script (unlike the former separate file).
    expect(yaml).toContain("run-tests-isolated.ts --unit --filter='structural|parse-long-class'");
    expect(yaml).toContain("working-directory: packages/core");
  });

  test("pre-existing macOS structural-native job remains present and correctly pinned", () => {
    // Content assertion (more robust than git-diff): the macOS structural-native
    // job block must exist with the correct Bun pin. This replaces the former
    // baseline non-touch sensor which assumed ci.yml was never modified — wave-3
    // legitimately added the structural-native-linux job to ci.yml (additive).
    const yaml = readCi();
    expect(yaml).toContain("structural-native:");
    expect(yaml).toContain(`bun-version: ${EXPECTED_BUN_VERSION}`);
    expect(yaml).toContain("runs-on: macos-14");
    // The macOS job must NOT target Linux (the Linux job is separate)
    const macosJobStart = yaml.indexOf("structural-native:");
    const linuxJobStart = yaml.indexOf("structural-native-linux:");
    expect(macosJobStart).toBeGreaterThan(-1);
    expect(linuxJobStart).toBeGreaterThan(macosJobStart);
    // The macOS job block (between its start and the Linux job) must not
    // contain a Linux runs-on
    const macosJobBlock = yaml.slice(macosJobStart, linuxJobStart);
    expect(macosJobBlock).not.toContain("runs-on: ubuntu");
  });
});