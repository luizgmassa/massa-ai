/**
 * state.ts unit tests — typed read/validate/merge-write of install-state.json.
 * Covers: MPS-03 (round-trip), MPS-09 (corrupt/unwritable named errors).
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  readInstallState,
  writeInstallState,
  updatePlatform,
  type InstallState,
} from "../state.js";

let dir: string;
let statePath: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-state-"));
  statePath = path.join(dir, "install-state.json");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("readInstallState", () => {
  test("returns a default v2 state when the file is missing", () => {
    const state = readInstallState(statePath);
    expect(state.version).toBe(2);
    expect(state.platforms).toEqual({});
  });

  test("throws a named CorruptInstallStateError on invalid JSON (deliberate fault)", () => {
    fs.writeFileSync(statePath, "{ not valid json ");
    expect(() => readInstallState(statePath)).toThrow();
    try {
      readInstallState(statePath);
      throw new Error("expected readInstallState to throw");
    } catch (err) {
      expect((err as Error).name).toBe("CorruptInstallStateError");
    }
  });

  test("throws a named CorruptInstallStateError when the root is not an object", () => {
    fs.writeFileSync(statePath, JSON.stringify(["not", "an", "object"]));
    try {
      readInstallState(statePath);
      throw new Error("expected readInstallState to throw");
    } catch (err) {
      expect((err as Error).name).toBe("CorruptInstallStateError");
    }
  });

  test("throws a named CorruptInstallStateError when platforms is present but not an object", () => {
    fs.writeFileSync(statePath, JSON.stringify({ version: 2, platforms: "nope" }));
    try {
      readInstallState(statePath);
      throw new Error("expected readInstallState to throw");
    } catch (err) {
      expect((err as Error).name).toBe("CorruptInstallStateError");
    }
  });
});

describe("round-trip", () => {
  test("preserves every existing v2 field, including unknown ones, byte-for-byte", () => {
    const fixture = {
      version: 2,
      extraTopLevelField: "keep-me",
      platforms: {
        claude: {
          root: "/home/u/.claude",
          skills: ["massa-ai", "persona-router"],
          skillsOwner: "repo",
          plugin: { version: "1.23.0", installedAt: "2026-01-01T00:00:00Z" },
          installRoute: "file",
          modelProfile: { profile: "work", switchedAt: "2026-01-02T00:00:00Z" },
          unknownPlatformField: 42,
        },
        codex: {
          root: "/home/u/.codex",
          skills: ["massa-ai"],
          skillsOwner: "plugin",
        },
      },
    };
    fs.writeFileSync(statePath, JSON.stringify(fixture, null, 2) + "\n");

    const state = readInstallState(statePath);
    writeInstallState(statePath, state);

    const roundTripped = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(roundTripped).toEqual(fixture);
  });
});

describe("updatePlatform", () => {
  test("merges a patch into an existing platform record, preserving unrelated fields", () => {
    const fixture: InstallState = {
      version: 2,
      platforms: {
        claude: {
          root: "/home/u/.claude",
          skills: ["massa-ai"],
          skillsOwner: "repo",
          plugin: { version: "1.23.0", installedAt: "2026-01-01T00:00:00Z" },
        },
        codex: {
          root: "/home/u/.codex",
          skills: ["massa-ai"],
          skillsOwner: "plugin",
        },
      },
    };
    fs.writeFileSync(statePath, JSON.stringify(fixture, null, 2) + "\n");

    const result = updatePlatform(statePath, "claude", {
      modelProfile: { profile: "home", switchedAt: "2026-02-01T00:00:00Z" },
    });

    expect(result.platforms.claude.modelProfile).toEqual({
      profile: "home",
      switchedAt: "2026-02-01T00:00:00Z",
    });
    // Unrelated existing fields survive.
    expect(result.platforms.claude.root).toBe("/home/u/.claude");
    expect(result.platforms.claude.plugin).toEqual({ version: "1.23.0", installedAt: "2026-01-01T00:00:00Z" });
    // Sibling platform untouched.
    expect(result.platforms.codex).toEqual(fixture.platforms.codex);

    const onDisk = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(onDisk.platforms.claude.modelProfile.profile).toBe("home");
  });

  test("creates a minimal platform record when none exists yet", () => {
    fs.writeFileSync(statePath, JSON.stringify({ version: 2, platforms: {} }));
    const result = updatePlatform(statePath, "opencode", {
      installRoute: "file",
    });
    expect(result.platforms.opencode.installRoute).toBe("file");
  });
});

describe("writeInstallState — no writes on validation failure", () => {
  test("throws a named CorruptInstallStateError and leaves the existing file untouched", () => {
    const original = { version: 2, platforms: { claude: { root: "/x", skills: [], skillsOwner: "repo" } } };
    fs.writeFileSync(statePath, JSON.stringify(original, null, 2) + "\n");
    const before = fs.readFileSync(statePath, "utf-8");

    const invalid = { version: 2, platforms: "not-an-object" } as unknown as InstallState;
    expect(() => writeInstallState(statePath, invalid)).toThrow();
    try {
      writeInstallState(statePath, invalid);
    } catch (err) {
      expect((err as Error).name).toBe("CorruptInstallStateError");
    }

    const after = fs.readFileSync(statePath, "utf-8");
    expect(after).toBe(before);
  });
});

describe("writeInstallState — UnwritableInstallStateError", () => {
  test("throws a named error when the parent path cannot be created (a file occupies it)", () => {
    const blockerFile = path.join(dir, "blocker");
    fs.writeFileSync(blockerFile, "not a directory");
    const unwritablePath = path.join(blockerFile, "nested", "install-state.json");

    try {
      writeInstallState(unwritablePath, { version: 2, platforms: {} });
      throw new Error("expected writeInstallState to throw");
    } catch (err) {
      expect((err as Error).name).toBe("UnwritableInstallStateError");
    }
  });
});
