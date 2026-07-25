/**
 * verify-tree-sitter-package-artifact.ts — pure-helper coverage.
 *
 * The package verifier's end-to-end path (npm pack + bun install + native
 * addon) is build/platform-gated and lives outside this unit suite. These
 * tests cover the pure decision helpers that ARE unit-testable:
 * parsePackedResult (every invariant branch) and the tarball readers
 * (tarEntries / tarManifest) against a real throwaway tarball.
 */
import { describe, test, expect } from "bun:test";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

import {
  parsePackedResult,
  tarEntries,
  tarManifest,
} from "../verify-tree-sitter-package-artifact.ts";
import {
  PACKED_CONSUMER_RESULT_PREFIX,
  EXPECTED_BUN_VERSION,
  EXPECTED_NATIVE_MODULE_COUNT,
  MINIMAL_PARSE_CASES,
  TRUSTED_NATIVE_PACKAGES,
} from "../verify-tree-sitter-grammars.ts";

function validResultLine(over: Record<string, unknown> = {}): string {
  const payload = {
    status: "PASS",
    consumer: "packed",
    bun: EXPECTED_BUN_VERSION,
    resolvable: TRUSTED_NATIVE_PACKAGES.length,
    parses: MINIMAL_PARSE_CASES.length,
    nativeModules: EXPECTED_NATIVE_MODULE_COUNT,
    nativePackagePaths: TRUSTED_NATIVE_PACKAGES.length,
    behaviorSensors: 10,
    ...over,
  };
  return `${PACKED_CONSUMER_RESULT_PREFIX}${JSON.stringify(payload)}`;
}

describe("parsePackedResult", () => {
  test("accepts a fully-valid packed-consumer record", () => {
    const r = parsePackedResult(`noise\n${validResultLine()}\nmore noise`);
    expect(r.status).toBe("PASS");
    expect(r.consumer).toBe("packed");
    expect(r.bun).toBe(EXPECTED_BUN_VERSION);
    expect(r.behaviorSensors).toBe(10);
  });

  test("uses the LAST result line when several are present", () => {
    const stdout = `${validResultLine({ behaviorSensors: 5 })}\n${validResultLine({ behaviorSensors: 10 })}`;
    expect(parsePackedResult(stdout).behaviorSensors).toBe(10);
  });

  test("throws when no result line is present", () => {
    expect(() => parsePackedResult("just noise, no marker")).toThrow(/did not emit a result record/);
  });

  test("throws when status is not PASS", () => {
    expect(() => parsePackedResult(validResultLine({ status: "FAIL" }))).toThrow(/packed consumer failed/);
  });

  test("throws when consumer is not 'packed'", () => {
    expect(() => parsePackedResult(validResultLine({ consumer: "source" }))).toThrow(/packed consumer failed/);
  });

  test("throws on a bun-version mismatch", () => {
    expect(() => parsePackedResult(validResultLine({ bun: "0.0.0" }))).toThrow(/packed consumer used Bun/);
  });

  test("throws when resolvable count is wrong", () => {
    expect(() => parsePackedResult(validResultLine({ resolvable: 1 }))).toThrow(/resolved 1/);
  });

  test("throws when parses count is wrong", () => {
    expect(() => parsePackedResult(validResultLine({ parses: 1 }))).toThrow(/parsed 1/);
  });

  test("throws when nativeModules count is wrong", () => {
    expect(() => parsePackedResult(validResultLine({ nativeModules: 1 }))).toThrow(/loaded 1/);
  });

  test("throws when nativePackagePaths count is wrong", () => {
    expect(() => parsePackedResult(validResultLine({ nativePackagePaths: 1 }))).toThrow(/native inventory/);
  });

  test("throws when behaviorSensors is not 10", () => {
    expect(() => parsePackedResult(validResultLine({ behaviorSensors: 9 }))).toThrow(/lifetime sensors/);
  });
});

describe("tarEntries + tarManifest", () => {
  let tmp: string;

  test("lists entries and extracts package/package.json from a real tarball", () => {
    tmp = mkdtempSync(join(tmpdir(), "massa-ai-tar-"));
    try {
      const staging = join(tmp, "pkg");
      mkdirSync(staging, { recursive: true });
      const manifest = { name: "@massa-ai/x", version: "1.2.3" };
      writeFileSync(join(staging, "package.json"), JSON.stringify(manifest));
      writeFileSync(join(staging, "index.js"), "module.exports = 1;\n");
      // tar requires the archive's top dir be named "package"
      const pkgDir = join(tmp, "package");
      rmSync(pkgDir, { recursive: true, force: true });
      execSync(`cp -R ${JSON.stringify(staging)} ${JSON.stringify(pkgDir)}`);
      const tarball = join(tmp, "x.tgz");
      execSync(`tar -czf ${JSON.stringify(tarball)} -C ${JSON.stringify(tmp)} package`);

      const entries = tarEntries(tarball);
      expect(entries).toContain("package/package.json");
      expect(entries).toContain("package/index.js");

      const m = tarManifest(tarball);
      expect(m.name).toBe("@massa-ai/x");
      expect(m.version).toBe("1.2.3");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
