/**
 * version-sync.ts — unit tests for syncVersions().
 *
 * syncVersions is a pure(ish) filesystem function: given a root dir it reads
 * the root package.json version, walks packages/ and apps/, and rewrites every
 * child package.json's version. It additionally targets a fixed list of host
 * plugin manifests that live in dotdirs and so cannot be globbed. We exercise
 * it against a throwaway temp tree so no real workspace file is touched.
 *
 * The temp trees below have no plugin manifests, so those fixed targets always
 * report `skipped` — assertions count synced entries rather than raw length.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { syncVersions, type SyncedPackage } from "../version-sync";

async function writePkg(file: string, pkg: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(pkg, null, 2) + "\n", "utf8");
}

async function readPkg(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

describe("syncVersions", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-version-sync-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test("rewrites packages/ and apps/ versions to match the root", async () => {
    await writePkg(path.join(tmp, "package.json"), { name: "root", version: "9.9.9" });
    await writePkg(path.join(tmp, "packages", "alpha", "package.json"), {
      name: "@massa-ai/alpha",
      version: "0.0.1",
    });
    await writePkg(path.join(tmp, "apps", "beta", "package.json"), {
      name: "beta",
      version: "1.2.3",
    });

    const written = syncVersions(tmp).filter((s) => !s.skipped);

    expect(written.length).toBe(2);
    expect(written.map((s) => s.version)).toEqual(["9.9.9", "9.9.9"]);

    expect((await readPkg(path.join(tmp, "packages", "alpha", "package.json"))).version).toBe("9.9.9");
    expect((await readPkg(path.join(tmp, "apps", "beta", "package.json"))).version).toBe("9.9.9");
  });

  test("skips child manifests that have no version field (reports null)", async () => {
    await writePkg(path.join(tmp, "package.json"), { name: "root", version: "2.0.0" });
    await writePkg(path.join(tmp, "packages", "noversion", "package.json"), {
      name: "noversion",
    });
    await writePkg(path.join(tmp, "apps", "withver", "package.json"), {
      name: "withver",
      version: "0.0.0",
    });

    const synced = syncVersions(tmp);
    const noVer = synced.find((s) => s.path.endsWith("packages/noversion/package.json"))!;
    const withVer = synced.find((s) => s.path.endsWith("apps/withver/package.json"))!;

    expect(noVer.skipped).toBe(true);
    expect(noVer.version).toBeNull();
    expect(withVer.skipped).toBe(false);
    expect(withVer.version).toBe("2.0.0");
    // unchanged on disk
    expect((await readPkg(path.join(tmp, "packages", "noversion", "package.json"))).version).toBeUndefined();
  });

  test("handles a missing packages/ dir (catch branch) and still syncs apps/", async () => {
    await writePkg(path.join(tmp, "package.json"), { name: "root", version: "3.1.0" });
    // only apps/, no packages/
    await writePkg(path.join(tmp, "apps", "only", "package.json"), {
      name: "only",
      version: "0.0.1",
    });

    const written = syncVersions(tmp).filter((s) => !s.skipped);
    expect(written.length).toBe(1);
    expect(written[0]!.version).toBe("3.1.0");
  });

  test("handles a missing apps/ dir (catch branch) and still syncs packages/", async () => {
    await writePkg(path.join(tmp, "package.json"), { name: "root", version: "3.2.0" });
    await writePkg(path.join(tmp, "packages", "p", "package.json"), {
      name: "p",
      version: "0.0.1",
    });

    const written = syncVersions(tmp).filter((s) => !s.skipped);
    expect(written.length).toBe(1);
    expect(written[0]!.version).toBe("3.2.0");
  });

  test("reaches host plugin manifests in dotdirs, which no glob can find", async () => {
    // A marketplace shows the manifest version, so drift there is user-visible.
    // The packages/* + apps/* discovery walks one level and matches only
    // package.json, so both of these need an explicit target entry.
    const manifests = [
      "apps/claude-plugin/.claude-plugin/plugin.json",
      "apps/codex-plugin/.codex-plugin/plugin.json",
      "apps/cursor-plugin/.cursor-plugin/plugin.json",
    ];
    await writePkg(path.join(tmp, "package.json"), { name: "root", version: "5.0.0" });
    for (const rel of manifests) {
      await writePkg(path.join(tmp, rel), { name: "massa-ai", version: "0.0.1" });
    }

    const synced = syncVersions(tmp);

    for (const rel of manifests) {
      const entry = synced.find((s) => s.path === path.join(tmp, rel));
      expect(entry).toBeDefined();
      expect(entry!.skipped).toBe(false);
      expect((await readPkg(path.join(tmp, rel))).version).toBe("5.0.0");
    }
  });

  test("realigns exact cross-package pins, leaving workspace:* alone", async () => {
    // The v1.3.0 regression: bumping `version` fields without moving an exact
    // cross-package pin leaves it naming the previous release, so the workspace
    // copy stops satisfying it and bun resolves that dependency from the
    // registry — `bun install --frozen-lockfile` then fails outright.
    await writePkg(path.join(tmp, "package.json"), { name: "root", version: "1.3.0" });
    await writePkg(path.join(tmp, "packages", "core", "package.json"), {
      name: "@massa-ai/core",
      version: "1.2.1",
      dependencies: { "@massa-ai/shared": "1.2.1", "some-dep": "^1.0.0" },
      devDependencies: { "@massa-ai/tooling": "1.2.1" },
    });
    await writePkg(path.join(tmp, "apps", "api", "package.json"), {
      name: "@massa-ai/api",
      version: "1.2.1",
      dependencies: { "@massa-ai/core": "workspace:*" },
    });

    const synced = syncVersions(tmp);

    const core = await readPkg(path.join(tmp, "packages", "core", "package.json"));
    expect((core.dependencies as Record<string, string>)["@massa-ai/shared"]).toBe("1.3.0");
    expect((core.devDependencies as Record<string, string>)["@massa-ai/tooling"]).toBe("1.3.0");
    // third-party specs are never touched
    expect((core.dependencies as Record<string, string>)["some-dep"]).toBe("^1.0.0");
    // workspace:* is version-independent; publish.yml resolves it later
    const api = await readPkg(path.join(tmp, "apps", "api", "package.json"));
    expect((api.dependencies as Record<string, string>)["@massa-ai/core"]).toBe("workspace:*");

    const coreEntry = synced.find((s) => s.path.endsWith("packages/core/package.json"))!;
    expect(coreEntry.repinned).toEqual([
      "dependencies.@massa-ai/shared",
      "devDependencies.@massa-ai/tooling",
    ]);
    const apiEntry = synced.find((s) => s.path.endsWith("apps/api/package.json"))!;
    expect(apiEntry.repinned).toEqual([]);
  });

  test("skips unreadable/malformed child manifest (catch branch reports skipped)", async () => {
    await writePkg(path.join(tmp, "package.json"), { name: "root", version: "4.0.0" });
    // malformed JSON
    const bad = path.join(tmp, "packages", "bad", "package.json");
    await fs.mkdir(path.dirname(bad), { recursive: true });
    await fs.writeFile(bad, "{ not valid json", "utf8");

    const synced: SyncedPackage[] = syncVersions(tmp);
    const badEntry = synced.find((s) => s.path === bad)!;
    expect(badEntry.skipped).toBe(true);
    expect(badEntry.version).toBeNull();
  });
});
