import { afterEach, describe, expect, test } from "bun:test";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildQwenFixture,
  loadQwenFixtureManifest,
  validateQwenFixtureManifest,
  type QwenFixtureManifest,
} from "./e2e/qwen-fixture.js";
import { resolveE2EProjectPath } from "./e2e/_helpers.js";

const REPOSITORY_ROOT = path.resolve(import.meta.dir, "../../../..");
const temporaryRoots: string[] = [];

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })));
});

describe("commit-locked qwen E2E fixture", () => {
  test("manifest contains five unique needle targets and twenty tracked distractors", async () => {
    const manifest = await loadQwenFixtureManifest();
    const files = await validateQwenFixtureManifest(REPOSITORY_ROOT, manifest);
    const dataset = JSON.parse(await readFile(
      path.join(REPOSITORY_ROOT, "benchmarks/needles/fixtures/massa-th0th.json"),
      "utf8",
    )) as { needles: Array<{ expected: { filePath: string } }> };
    const datasetTargets = [...new Set(
      dataset.needles.map((needle) => needle.expected.filePath),
    )].sort();

    expect(manifest.needleTargets.map((entry) => entry.path).sort()).toEqual(datasetTargets);
    expect(manifest.distractors).toHaveLength(20);
    expect(files).toHaveLength(
      manifest.needleTargets.length +
      manifest.distractors.length +
      manifest.supportFiles.length,
    );
  });

  test("local sparse clone matches tested HEAD and supports an omitted-target negative profile", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "massa-th0th-qwen-fixture-"));
    temporaryRoots.push(parent);
    const manifest = await loadQwenFixtureManifest();
    const positive = await buildQwenFixture({
      sourceRoot: REPOSITORY_ROOT,
      destination: path.join(parent, "positive"),
      manifest,
    });

    expect(positive.files).toHaveLength(
      manifest.needleTargets.length +
      manifest.distractors.length +
      manifest.supportFiles.length,
    );
    expect(await exists(path.join(positive.destination, ".git"))).toBe(true);

    const omittedPath = manifest.needleTargets[0].path;
    const negative = await buildQwenFixture({
      sourceRoot: REPOSITORY_ROOT,
      destination: path.join(parent, "negative"),
      manifest,
      omitPaths: [omittedPath],
    });
    expect(negative.head).toBe(positive.head);
    expect(negative.files).toHaveLength(positive.files.length - 1);
    expect(await exists(path.join(negative.destination, omittedPath))).toBe(false);
  });

  test("rejects changed hashes and forbidden paths before cloning", async () => {
    const manifest = await loadQwenFixtureManifest();
    const changed = structuredClone(manifest) as QwenFixtureManifest;
    changed.supportFiles[0].sha256 = "0".repeat(64);
    await expect(
      validateQwenFixtureManifest(REPOSITORY_ROOT, changed),
    ).rejects.toThrow("hash mismatch");

    const forbidden = structuredClone(manifest) as QwenFixtureManifest;
    forbidden.supportFiles[0].path = ".env.production";
    await expect(
      validateQwenFixtureManifest(REPOSITORY_ROOT, forbidden),
    ).rejects.toThrow("forbidden path");
  });

  test("explicit fixture path is selected only for a dedicated run", () => {
    const fallback = "/repository/default";
    expect(resolveE2EProjectPath(fallback, {
      MASSA_TH0TH_DEDICATED: "1",
      MASSA_TH0TH_E2E_PROJECT_PATH: "/tmp/explicit-fixture",
    })).toBe("/tmp/explicit-fixture");
    expect(resolveE2EProjectPath(fallback, {
      MASSA_TH0TH_DEDICATED: "0",
      MASSA_TH0TH_E2E_PROJECT_PATH: "/tmp/ignored-fixture",
    })).toBe(fallback);
    expect(resolveE2EProjectPath(fallback, {
      MASSA_TH0TH_DEDICATED: "1",
    })).toBe(fallback);
  });
});
