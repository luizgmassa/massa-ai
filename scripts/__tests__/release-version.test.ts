/**
 * release-version.ts — unit tests derived from spec ARV-R1..R6 and ARV-R13.
 *
 * Assertions come from `.specs/features/auto-release-versioning/spec.md` acceptance
 * criteria, not from the implementation. Filesystem cases run against a throwaway temp
 * tree so no real workspace file is touched; the one case that runs the real CLI uses
 * `--dry-run`, which writes nothing.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import {
  FIXTURE_REL_PATH,
  decideBump,
  deriveRelease,
  extractUnreleased,
  nextVersion,
  promoteChangelog,
  repinFixtureHashes,
  unreleasedHeadings,
  unreleasedNotes,
  utcToday,
} from "../release-version";

/** Build a CHANGELOG whose [Unreleased] holds `section`, followed by a real release. */
function changelogWith(section: string): string {
  return [
    "# Changelog",
    "",
    "## [Unreleased]",
    "",
    section,
    "",
    "## [1.2.1] - 2026-07-24",
    "",
    "### Fixed",
    "",
    "- an older fix",
    "",
    "## [Wave 4] - 2026-07-21",
    "",
    "### Added",
    "",
    "- legacy pre-semver entry",
    "",
  ].join("\n");
}

function bumpOf(section: string) {
  return decideBump(unreleasedHeadings(extractUnreleased(changelogWith(section))));
}

describe("ARV-R1 — bump derivation from [Unreleased]", () => {
  test.each([["Added"], ["Changed"], ["Removed"], ["Deprecated"]])(
    "### %s with content is a minor bump",
    (heading) => {
      expect(bumpOf(`### ${heading}\n\n- something`)).toBe("minor");
    },
  );

  test.each([["Fixed"], ["Security"]])(
    "### %s with content is a patch bump",
    (heading) => {
      expect(bumpOf(`### ${heading}\n\n- something`)).toBe("patch");
    },
  );

  test("minor wins when a minor-class and a patch-class heading coexist", () => {
    expect(bumpOf("### Fixed\n\n- a bug\n\n### Added\n\n- a feature")).toBe("minor");
  });

  test("headings are matched case-insensitively", () => {
    expect(bumpOf("### added\n\n- lowercase heading")).toBe("minor");
  });

  test("duplicate headings collapse — today's real [Unreleased] shape yields minor", () => {
    const real = [
      "### Fixed",
      "",
      "- one",
      "",
      "### Added",
      "",
      "- two",
      "",
      "### Removed",
      "",
      "- three",
      "",
      "### Changed",
      "",
      "- four",
      "",
      "### Fixed",
      "",
      "- five",
      "",
      "### Fixed",
      "",
      "- six",
    ].join("\n");
    expect(bumpOf(real)).toBe("minor");
  });

  test("a heading with no content line is ignored", () => {
    expect(bumpOf("### Added\n\n### Fixed\n\n- only this has content")).toBe("patch");
  });

  test("only empty headings yields no bump", () => {
    expect(bumpOf("### Added\n\n### Fixed\n")).toBeNull();
  });

  test("unrecognised headings are ignored", () => {
    expect(bumpOf("### Notes\n\n- housekeeping")).toBeNull();
  });

  test("an entirely empty [Unreleased] yields no bump (ARV-R3)", () => {
    expect(bumpOf("")).toBeNull();
  });

  test("content below the next `## [` heading is never absorbed", () => {
    // The `### Added` under `## [Wave 4]` must not leak into the Unreleased section.
    expect(bumpOf("### Fixed\n\n- only a bug")).toBe("patch");
    expect(extractUnreleased(changelogWith("### Fixed\n\n- only a bug"))).not.toContain(
      "legacy pre-semver entry",
    );
  });

  test("a CHANGELOG with no [Unreleased] heading throws a named error", () => {
    expect(() => extractUnreleased("# Changelog\n\n## [1.0.0] - 2026-01-01\n")).toThrow(
      /no `## \[Unreleased\]` heading/,
    );
  });
});

describe("ARV-R2 / ARV-R4 — version arithmetic", () => {
  test.each([
    ["1.2.1", "minor", "1.3.0"],
    ["1.2.1", "patch", "1.2.2"],
    ["1.9.9", "minor", "1.10.0"],
    ["0.0.1", "patch", "0.0.2"],
    ["2.10.4", "minor", "2.11.0"],
  ])("%s + %s = %s", (current, bump, expected) => {
    expect(nextVersion(current, bump as "minor" | "patch")).toBe(expected);
  });

  test("ARV-R2 — the major component is never incremented", () => {
    for (const current of ["0.0.0", "1.2.3", "9.99.99", "12.0.7"]) {
      for (const bump of ["minor", "patch"] as const) {
        const major = (v: string) => v.split(".")[0];
        expect(major(nextVersion(current, bump))).toBe(major(current));
      }
    }
  });

  test("a non-semver current version throws rather than guessing", () => {
    for (const bad of ["1.2", "v1.2.3", "1.2.3-beta.1", "", "next"]) {
      expect(() => nextVersion(bad, "patch")).toThrow(/not X\.Y\.Z semver/);
    }
  });
});

describe("ARV-R4 / ARV-R6 — changelog promotion and notes", () => {
  const changelog = changelogWith("### Added\n\n- a feature\n\n### Fixed\n\n- a bug");

  test("promotion inserts an empty [Unreleased] above the new version section", () => {
    const out = promoteChangelog(changelog, "1.3.0", "2026-07-26");
    expect(out).toContain("## [Unreleased]\n\n## [1.3.0] - 2026-07-26\n");
  });

  test("the promoted body is preserved verbatim", () => {
    const out = promoteChangelog(changelog, "1.3.0", "2026-07-26");
    const promoted = out.slice(out.indexOf("## [1.3.0]"), out.indexOf("## [1.2.1]"));
    expect(promoted).toContain("- a feature");
    expect(promoted).toContain("- a bug");
  });

  test("prior sections, including legacy `## [Wave N]`, are untouched", () => {
    const out = promoteChangelog(changelog, "1.3.0", "2026-07-26");
    expect(out).toContain("## [1.2.1] - 2026-07-24");
    expect(out).toContain("## [Wave 4] - 2026-07-21");
    expect(out).toContain("- legacy pre-semver entry");
  });

  test("promotion is not re-entrant — a promoted changelog then derives no bump", () => {
    const out = promoteChangelog(changelog, "1.3.0", "2026-07-26");
    expect(decideBump(unreleasedHeadings(extractUnreleased(out)))).toBeNull();
  });

  test("ARV-R6 — notes are the section body without the heading or blank padding", () => {
    const notes = unreleasedNotes(changelog);
    expect(notes.startsWith("### Added")).toBe(true);
    expect(notes.endsWith("- a bug")).toBe(true);
  });

  test("F6 — backticks, $VAR, and blank lines survive verbatim into the notes", () => {
    const tricky = "### Added\n\n- `bun run x` sets `$HOME` and **bold**\n\n- second bullet";
    const notes = unreleasedNotes(changelogWith(tricky));
    expect(notes).toContain("`bun run x` sets `$HOME` and **bold**");
    expect(notes).toContain("\n\n- second bullet");
  });

  test("F5 — the default date is UTC YYYY-MM-DD", () => {
    expect(utcToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(utcToday()).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe("filesystem behaviour", () => {
  let tmp: string;

  const sha = (buf: string | Buffer) => createHash("sha256").update(buf).digest("hex");

  async function write(rel: string, contents: string): Promise<void> {
    const file = path.join(tmp, rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, contents, "utf8");
  }

  async function read(rel: string): Promise<string> {
    return fs.readFile(path.join(tmp, rel), "utf8");
  }

  /** A workspace with a root manifest, two packages, and a qwen fixture. */
  async function scaffold(version: string, unreleased: string): Promise<void> {
    await write("package.json", JSON.stringify({ name: "root", version }, null, 2) + "\n");
    await write(
      "packages/core/package.json",
      JSON.stringify({ name: "@massa-ai/core", version }, null, 2) + "\n",
    );
    await write(
      "apps/tools-api/package.json",
      JSON.stringify({ name: "@massa-ai/tools-api", version }, null, 2) + "\n",
    );
    await write("CHANGELOG.md", changelogWith(unreleased));
    await write("README.md", "# readme\n");

    const manifest = {
      version: 1,
      supportFiles: [
        { path: "package.json", sha256: sha(await read("package.json")) },
        { path: "packages/core/package.json", sha256: sha(await read("packages/core/package.json")) },
        { path: "README.md", sha256: sha(await read("README.md")) },
        // Deliberately stale and unrelated — stands in for the 35 pre-existing stale
        // entries on main. It must survive untouched (fool.md F8).
        { path: "CHANGELOG.md", sha256: "0".repeat(64) },
      ],
    };
    await write(FIXTURE_REL_PATH, JSON.stringify(manifest, null, 2) + "\n");
  }

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "release-version-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test("ARV-R3 — a null bump writes nothing at all", async () => {
    await scaffold("1.2.1", "### Notes\n\n- housekeeping");
    const before = await read("package.json");
    const fixtureBefore = await read(FIXTURE_REL_PATH);
    const changelogBefore = await read("CHANGELOG.md");

    const result = deriveRelease(tmp);

    expect(result).toMatchObject({ current: "1.2.1", next: null, bump: null, notes: "" });
    expect(result.repinned).toEqual([]);
    expect(await read("package.json")).toBe(before);
    expect(await read("CHANGELOG.md")).toBe(changelogBefore);
    expect(await read(FIXTURE_REL_PATH)).toBe(fixtureBefore);
  });

  test("a dry run derives the version but writes nothing", async () => {
    await scaffold("1.2.1", "### Added\n\n- a feature");
    const before = await read("package.json");
    const fixtureBefore = await read(FIXTURE_REL_PATH);

    const result = deriveRelease(tmp, { dryRun: true });

    expect(result).toMatchObject({ current: "1.2.1", next: "1.3.0", bump: "minor" });
    expect(result.repinned).toEqual([]);
    expect(await read("package.json")).toBe(before);
    expect(await read(FIXTURE_REL_PATH)).toBe(fixtureBefore);
  });

  test("ARV-R4 — a real run bumps the root and every workspace manifest", async () => {
    await scaffold("1.2.1", "### Added\n\n- a feature");

    const result = deriveRelease(tmp, { today: "2026-07-26" });

    expect(result.next).toBe("1.3.0");
    expect(JSON.parse(await read("package.json")).version).toBe("1.3.0");
    expect(JSON.parse(await read("packages/core/package.json")).version).toBe("1.3.0");
    expect(JSON.parse(await read("apps/tools-api/package.json")).version).toBe("1.3.0");
    expect(await read("CHANGELOG.md")).toContain("## [1.3.0] - 2026-07-26");
  });

  test("ARV-R13 — the bumped manifests are re-pinned to their new bytes", async () => {
    await scaffold("1.2.1", "### Added\n\n- a feature");

    const result = deriveRelease(tmp, { today: "2026-07-26" });

    expect(result.repinned.sort()).toEqual(["package.json", "packages/core/package.json"]);

    const manifest = JSON.parse(await read(FIXTURE_REL_PATH));
    const pinned = Object.fromEntries(
      manifest.supportFiles.map((e: { path: string; sha256: string }) => [e.path, e.sha256]),
    );
    expect(pinned["package.json"]).toBe(sha(await read("package.json")));
    expect(pinned["packages/core/package.json"]).toBe(
      sha(await read("packages/core/package.json")),
    );
  });

  test("ARV-R13 — unrelated entries stay byte-identical, stale ones stay stale (F8)", async () => {
    await scaffold("1.2.1", "### Added\n\n- a feature");
    const readmeBefore = sha(await read("README.md"));

    deriveRelease(tmp, { today: "2026-07-26" });

    const manifest = JSON.parse(await read(FIXTURE_REL_PATH));
    const pinned = Object.fromEntries(
      manifest.supportFiles.map((e: { path: string; sha256: string }) => [e.path, e.sha256]),
    );
    // README was never rewritten, so its (correct) pin is unchanged...
    expect(pinned["README.md"]).toBe(readmeBefore);
    // ...and the deliberately stale CHANGELOG pin is NOT laundered, even though
    // promoteChangelog just rewrote that file.
    expect(pinned["CHANGELOG.md"]).toBe("0".repeat(64));
  });

  test("ARV-R13 — repin targets only the requested paths", async () => {
    await scaffold("1.2.1", "### Added\n\n- a feature");
    await write("README.md", "# changed readme\n");

    const repinned = repinFixtureHashes(tmp, ["package.json"]);

    expect(repinned).toEqual([]); // package.json is unchanged, so nothing to re-pin
    const manifest = JSON.parse(await read(FIXTURE_REL_PATH));
    const readmeEntry = manifest.supportFiles.find(
      (e: { path: string }) => e.path === "README.md",
    );
    expect(readmeEntry.sha256).not.toBe(sha(await read("README.md")));
  });

  test("ARV-R13 — hashing matches sha256 over raw bytes", async () => {
    await scaffold("1.2.1", "### Added\n\n- a feature");
    await write("README.md", "# changed readme\n");

    repinFixtureHashes(tmp, ["README.md"]);

    const manifest = JSON.parse(await read(FIXTURE_REL_PATH));
    const entry = manifest.supportFiles.find((e: { path: string }) => e.path === "README.md");
    expect(entry.sha256).toBe(sha(await fs.readFile(path.join(tmp, "README.md"))));
  });

  test("a missing fixture is tolerated rather than fatal", async () => {
    await scaffold("1.2.1", "### Added\n\n- a feature");
    await fs.rm(path.join(tmp, FIXTURE_REL_PATH));

    expect(() => deriveRelease(tmp, { today: "2026-07-26" })).not.toThrow();
    expect(JSON.parse(await read("package.json")).version).toBe("1.3.0");
  });
});

describe("CLI contract", () => {
  test("--dry-run prints exactly one JSON object on stdout and writes nothing", async () => {
    const repoRoot = path.resolve(import.meta.dir, "..", "..");
    const proc = Bun.spawn(["bun", "scripts/release-version.ts", "--dry-run"], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);

    // A stray console.log from syncVersions would break this parse.
    const parsed = JSON.parse(stdout);
    expect(stdout.trimEnd().split("\n")).toHaveLength(1);
    expect(parsed).toHaveProperty("current");
    expect(parsed).toHaveProperty("bump");
    expect(parsed.repinned).toEqual([]);
  }, 30_000);
});
