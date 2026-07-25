/**
 * version-sync.ts — unit tests for syncVersions().
 *
 * syncVersions is a pure(ish) filesystem function: given a root dir it reads
 * the root package.json version, walks packages/ and apps/, and rewrites every
 * child package.json's version. We exercise it against a throwaway temp tree
 * so no real workspace file is touched.
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

    const synced = syncVersions(tmp);

    expect(synced.length).toBe(2);
    expect(synced.every((s) => !s.skipped)).toBe(true);
    expect(synced.map((s) => s.version)).toEqual(["9.9.9", "9.9.9"]);

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

    const synced = syncVersions(tmp);
    expect(synced.length).toBe(1);
    expect(synced[0]!.version).toBe("3.1.0");
  });

  test("handles a missing apps/ dir (catch branch) and still syncs packages/", async () => {
    await writePkg(path.join(tmp, "package.json"), { name: "root", version: "3.2.0" });
    await writePkg(path.join(tmp, "packages", "p", "package.json"), {
      name: "p",
      version: "0.0.1",
    });

    const synced = syncVersions(tmp);
    expect(synced.length).toBe(1);
    expect(synced[0]!.version).toBe("3.2.0");
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
