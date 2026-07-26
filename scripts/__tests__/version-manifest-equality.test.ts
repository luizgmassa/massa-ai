/**
 * version-manifest-equality.ts — PDO-24 coverage.
 *
 * Two layers:
 *  1. Temp-tree unit tests that mutation-verify the discovery + comparison logic
 *     itself, in both directions (aligned tree -> no mismatches; one manifest
 *     deliberately set to a wrong version -> exactly that manifest reported).
 *  2. A live assertion against THIS repo's actual manifests — the real gate. It
 *     fails the moment any workspace package or dotdir host-plugin manifest drifts
 *     from the root version, which is what closed the `apps/cursor-plugin/
 *     .cursor-plugin/plugin.json` gap (`1.0.0` against root `1.4.0`, silently absent
 *     from `EXTRA_VERSIONED_MANIFESTS`).
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { discoverVersionedManifests, findVersionMismatches } from "../version-manifest-equality";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");

async function writeJson(file: string, doc: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(doc, null, 2) + "\n", "utf8");
}

describe("discoverVersionedManifests (temp tree)", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-manifest-equality-"));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test("finds root + packages/* + apps/* + dotdir host-plugin manifests, by globbing, not a fixed list", async () => {
    await writeJson(path.join(tmp, "package.json"), { name: "root", version: "1.0.0" });
    await writeJson(path.join(tmp, "packages/alpha/package.json"), { name: "alpha", version: "1.0.0" });
    await writeJson(path.join(tmp, "apps/beta/package.json"), { name: "beta", version: "1.0.0" });
    // A host-plugin dotdir manifest that no hardcoded list in this test names —
    // the point of globbing is that this generalizes to a host invented tomorrow.
    await writeJson(path.join(tmp, "apps/beta/.future-host-plugin/plugin.json"), {
      name: "future",
      version: "1.0.0",
    });
    // A non-plugin dotdir must NOT be swept in (name does not end in "-plugin").
    await writeJson(path.join(tmp, "apps/beta/.decoy-cache/plugin.json"), {
      name: "decoy",
      version: "9.9.9",
    });

    const found = discoverVersionedManifests(tmp);
    expect(found).toContain(path.join(tmp, "package.json"));
    expect(found).toContain(path.join(tmp, "packages/alpha/package.json"));
    expect(found).toContain(path.join(tmp, "apps/beta/package.json"));
    expect(found).toContain(path.join(tmp, "apps/beta/.future-host-plugin/plugin.json"));
    expect(found).not.toContain(path.join(tmp, "apps/beta/.decoy-cache/plugin.json"));
  });
});

describe("findVersionMismatches (temp tree, mutation-verified)", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-manifest-equality-"));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test("a fully aligned tree reports zero mismatches", async () => {
    await writeJson(path.join(tmp, "package.json"), { name: "root", version: "2.3.4" });
    await writeJson(path.join(tmp, "packages/core/package.json"), { name: "core", version: "2.3.4" });
    await writeJson(path.join(tmp, "apps/cli/.cli-plugin/plugin.json"), { name: "cli", version: "2.3.4" });

    expect(findVersionMismatches(tmp)).toEqual([]);
  });

  test("mutation: setting one manifest to a wrong version makes the check fail", async () => {
    await writeJson(path.join(tmp, "package.json"), { name: "root", version: "2.3.4" });
    await writeJson(path.join(tmp, "packages/core/package.json"), { name: "core", version: "2.3.4" });
    const driftedPath = path.join(tmp, "apps/cli/.cli-plugin/plugin.json");
    await writeJson(driftedPath, { name: "cli", version: "1.0.0" }); // <-- deliberate mutation

    const mismatches = findVersionMismatches(tmp);
    expect(mismatches).toEqual([{ path: driftedPath, version: "1.0.0" }]);

    // Reverting the mutation must go green again — proves the gate discriminates
    // in both directions, not just "always red" or "always green".
    await writeJson(driftedPath, { name: "cli", version: "2.3.4" });
    expect(findVersionMismatches(tmp)).toEqual([]);
  });

  test("a manifest with no version field is not flagged (matches syncVersions' skip behavior)", async () => {
    await writeJson(path.join(tmp, "package.json"), { name: "root", version: "2.3.4" });
    await writeJson(path.join(tmp, "packages/noversion/package.json"), { name: "noversion" });

    expect(findVersionMismatches(tmp)).toEqual([]);
  });
});

describe("live repo — every versioned manifest equals the root version (PDO-24 gate)", () => {
  test("no manifest has drifted from package.json's version", () => {
    const mismatches = findVersionMismatches(REPO_ROOT);
    expect(mismatches).toEqual([]);
  });

  test("sanity: the discovery actually reaches all three host-plugin dotdir manifests", () => {
    const found = discoverVersionedManifests(REPO_ROOT);
    expect(found).toContain(path.join(REPO_ROOT, "apps/claude-plugin/.claude-plugin/plugin.json"));
    expect(found).toContain(path.join(REPO_ROOT, "apps/codex-plugin/.codex-plugin/plugin.json"));
    expect(found).toContain(path.join(REPO_ROOT, "apps/cursor-plugin/.cursor-plugin/plugin.json"));
  });

  test("sanity: the discovery reaches every apps/* and packages/* package.json", () => {
    const found = discoverVersionedManifests(REPO_ROOT);
    // At minimum: the 2 packages/*, the 3 pre-existing buildable apps, and the 4
    // plugin apps (3 new + opencode). A future workspace member is caught for free.
    expect(found.length).toBeGreaterThanOrEqual(1 + 2 + 7);
  });
});
