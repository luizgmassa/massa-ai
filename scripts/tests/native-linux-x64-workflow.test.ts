import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { EXPECTED_BUN_VERSION } from "../verify-tree-sitter-grammars.ts";

const ROOT = resolve(import.meta.dir, "../..");
const CI_PATH = resolve(ROOT, ".github/workflows/ci.yml");

// M21 T4 + native-runtime-rebaseline follow-up: the structural-native-linux
// CI job is additive. This test asserts the Linux job pins the exact runtime,
// runs the frozen verifier, and uploads provenance. The former M21 non-touch
// guard (checking the diff against the M21 baseline did not touch forbidden
// pre-existing files) was removed when M21 completed and the follow-up
// feature legitimately fixes native-macos-arm64-workflow.test.ts; the content
// assertions below are the durable contract.
describe("native linux x64 CI job", () => {
  function readCi(): string {
    return readFileSync(CI_PATH, "utf8");
  }

  test("structural-native-linux job pins Bun 1.3.14 and targets ubuntu-latest", () => {
    const yaml = readCi();
    expect(yaml).toContain("structural-native-linux:");
    expect(yaml).toContain("runs-on: ubuntu-latest");
    expect(yaml).toContain(`bun-version: ${EXPECTED_BUN_VERSION}`);
  });

  test("pins Node 25.9.0 as the build helper", () => {
    const yaml = readCi();
    expect(yaml).toContain("node-version: '25.9.0'");
  });

  test("runs the frozen native verifier and native-structural unit tests", () => {
    const yaml = readCi();
    expect(yaml).toContain("bun install --frozen-lockfile");
    expect(yaml).toContain("bun run build");
    expect(yaml).toContain("bun run verify:tree-sitter-native");
    expect(yaml).toContain("run-tests-isolated.ts --unit --filter='structural|parse-long-class'");
  });

  test("uploads provenance artifact with if-no-files-found: error", () => {
    const yaml = readCi();
    expect(yaml).toContain("native-linux-x64-verification.log");
    expect(yaml).toContain("actions/upload-artifact@v4");
    expect(yaml).toContain("if-no-files-found: error");
    expect(yaml).toContain("if: always()");
  });

  test("pre-existing macOS structural-native job remains unchanged in ci.yml", () => {
    const yaml = readCi();
    expect(yaml).toContain("structural-native:");
    expect(yaml).toContain("name: Structural native tests (darwin-arm64)");
    expect(yaml).toContain("runs-on: macos-14");
    expect(yaml).toContain("node-version: '22'");
  });
});