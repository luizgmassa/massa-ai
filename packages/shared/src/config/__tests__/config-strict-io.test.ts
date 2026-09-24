/**
 * `readRawConfigStrict` / `writeRawConfig` unit tests (T3 / TASK-003, BST-10).
 *
 * Uses the same `spyOn(fs, ...)` virtual-store technique as
 * `config-loader.test.ts`: `CONFIG_DIR`/`CONFIG_FILE` freeze at module-eval
 * time to the real XDG path, so every fs primitive on that fixed path is
 * intercepted rather than the developer's real `~/.config/massa-ai/`
 * touched. This is deliberately NOT the `isolated-config.ts` subprocess
 * harness: the compare-and-swap tests below need to control exactly what two
 * *successive* `readFileSync` calls inside one `writeRawConfig` invocation
 * return, which a subprocess (one real filesystem, no call-count control)
 * cannot give us. The malformed-file and round-trip cases don't need
 * cross-process isolation at all — they never call `loadConfig`/`saveConfig`
 * against a real path outside this spied one.
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import fs from "fs";
import path from "path";

import {
  getConfigDir,
  getConfigPath,
  loadConfig,
  writeFileAtomically,
  readRawConfigStrict,
  writeRawConfig,
  ConfigParseError,
  ConfigWriteConflictError,
} from "../config-loader";
import { defaultMassaAiConfig } from "../massa-ai-config";

// Barrel-reachability check (T3 "Done when": writeFileAtomically,
// readRawConfigStrict, writeRawConfig reachable from @massa-ai/shared/config).
// A plain named import that resolves to `undefined` at runtime would still
// "succeed" as an ESM import under bun's loose module resolution, so the
// assertions below on `typeof` are load-bearing, not decorative.
import * as configBarrel from "../index";
import * as rootBarrel from "../../index";

const CONFIG_PATH = getConfigPath();
const CONFIG_DIR = getConfigDir();

let existsSpy: ReturnType<typeof spyOn>;
let readSpy: ReturnType<typeof spyOn>;
let writeSpy: ReturnType<typeof spyOn>;
let mkdirSpy: ReturnType<typeof spyOn>;
let renameSpy: ReturnType<typeof spyOn>;
let chmodSpy: ReturnType<typeof spyOn>;

// In-memory virtual file store keyed by absolute path — identical shape to
// config-loader.test.ts's vfs, kept local so this file has no cross-file
// mutable-state coupling to a sibling suite.
let vfs: Map<string, string> = new Map();
let existing: Set<string> = new Set();

function resetVfs() {
  vfs = new Map();
  existing = new Set();
}

function installSpies() {
  existsSpy = spyOn(fs, "existsSync").mockImplementation((p: any) => existing.has(String(p)));
  readSpy = spyOn(fs, "readFileSync").mockImplementation((p: any) => {
    const key = String(p);
    if (!existing.has(key)) {
      const e = new Error(`ENOENT: ${key}`);
      (e as any).code = "ENOENT";
      throw e;
    }
    return vfs.get(key) ?? "";
  });
  writeSpy = spyOn(fs, "writeFileSync").mockImplementation((p: any, data: any) => {
    const key = String(p);
    vfs.set(key, String(data));
    existing.add(key);
  });
  mkdirSpy = spyOn(fs, "mkdirSync").mockImplementation((p: any) => {
    existing.add(String(p));
    return String(p);
  });
  chmodSpy = spyOn(fs, "chmodSync").mockImplementation((p: any) => {
    const key = String(p);
    if (!existing.has(key)) {
      const e = new Error(`ENOENT: ${key}`);
      (e as any).code = "ENOENT";
      throw e;
    }
  });
  renameSpy = spyOn(fs, "renameSync").mockImplementation((from: any, to: any) => {
    const fromKey = String(from);
    const toKey = String(to);
    if (!existing.has(fromKey)) {
      const e = new Error(`ENOENT: ${fromKey}`);
      (e as any).code = "ENOENT";
      throw e;
    }
    existing.delete(fromKey);
    existing.add(toKey);
    const val = vfs.get(fromKey);
    vfs.delete(fromKey);
    if (val !== undefined) vfs.set(toKey, val);
  });
}

beforeEach(() => {
  resetVfs();
  installSpies();
});

afterEach(() => {
  existsSpy.mockRestore();
  readSpy.mockRestore();
  writeSpy.mockRestore();
  mkdirSpy.mockRestore();
  renameSpy.mockRestore();
  chmodSpy.mockRestore();
});

function seed(doc: Record<string, unknown>) {
  vfs.set(CONFIG_PATH, JSON.stringify(doc, null, 2));
  existing.add(CONFIG_PATH);
  existing.add(CONFIG_DIR);
}

describe("barrel reachability", () => {
  test("writeFileAtomically, readRawConfigStrict, writeRawConfig are exported from the config barrel", () => {
    expect(typeof configBarrel.writeFileAtomically).toBe("function");
    expect(typeof configBarrel.readRawConfigStrict).toBe("function");
    expect(typeof configBarrel.writeRawConfig).toBe("function");
  });

  test("the same three functions are exported from the package root barrel", () => {
    expect(typeof rootBarrel.writeFileAtomically).toBe("function");
    expect(typeof rootBarrel.readRawConfigStrict).toBe("function");
    expect(typeof rootBarrel.writeRawConfig).toBe("function");
  });
});

describe("readRawConfigStrict", () => {
  test("returns {} when config.json does not exist", () => {
    expect(readRawConfigStrict()).toEqual({});
  });

  test("returns the literal document with no defaults merged in", () => {
    seed({ security: { apiKey: "hand-written" } });
    const doc = readRawConfigStrict();
    expect(doc).toEqual({ security: { apiKey: "hand-written" } });
    // Confirms no default-merging: an untouched section stays absent, unlike
    // loadConfig()'s merged result.
    expect((doc as any).embedding).toBeUndefined();
  });

  test("a malformed config.json throws ConfigParseError naming the file and the parse failure, and writes nothing", () => {
    vfs.set(CONFIG_PATH, "{ this is not json");
    existing.add(CONFIG_PATH);

    let caught: unknown;
    try {
      readRawConfigStrict();
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ConfigParseError);
    expect((caught as Error).name).toBe("ConfigParseError");
    expect((caught as Error).message).toContain(CONFIG_PATH);
    // Names the underlying JSON.parse failure, not just "failed".
    expect((caught as Error).message.toLowerCase()).toMatch(/json|unexpected|position/);

    expect(writeSpy).not.toHaveBeenCalled();
    expect(renameSpy).not.toHaveBeenCalled();
    // The file on disk is exactly what it was before the failed read.
    expect(vfs.get(CONFIG_PATH)).toBe("{ this is not json");
  });

  test("a config.json holding a JSON array throws ConfigParseError rather than being treated as an object", () => {
    vfs.set(CONFIG_PATH, JSON.stringify([1, 2, 3]));
    existing.add(CONFIG_PATH);

    expect(() => readRawConfigStrict()).toThrow(ConfigParseError);
  });
});

describe("both-directions: the toggle path never reaches loadConfig's defaults-on-parse-failure branch", () => {
  test("loadConfig swallows the same malformed file and returns defaults (the pre-existing, unchanged behavior)", () => {
    vfs.set(CONFIG_PATH, "{ this is not json");
    existing.add(CONFIG_PATH);

    const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      const loaded = loadConfig();
      expect(loaded).toEqual(defaultMassaAiConfig);
      // This is the mechanism the toggle path must never reach: loadConfig's
      // catch block reports via console.error and degrades to defaults.
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  test("readRawConfigStrict throws on the identical malformed file instead of degrading, and never logs loadConfig's defaults-branch message", () => {
    vfs.set(CONFIG_PATH, "{ this is not json");
    existing.add(CONFIG_PATH);

    const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => readRawConfigStrict()).toThrow(ConfigParseError);
      // readRawConfigStrict's own error path never calls console.error — the
      // caller receives a thrown error instead, proving this is a genuinely
      // different code path from loadConfig's catch-and-log-and-degrade.
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});

describe("writeRawConfig — fast path (no race)", () => {
  test("writes doc verbatim when the file still matches expectedBytes", () => {
    seed({ greeting: "hi" });
    const expectedBytes = vfs.get(CONFIG_PATH)!;

    writeRawConfig({ greeting: "changed" }, { expectedBytes });

    expect(JSON.parse(vfs.get(CONFIG_PATH)!)).toEqual({ greeting: "changed" });
  });

  test("expectedBytes of \"\" matches a config.json that does not exist yet, creating it", () => {
    writeRawConfig({ bootstrap: { rules: { "code-comments": true } } }, { expectedBytes: "" });

    expect(existing.has(CONFIG_PATH)).toBe(true);
    expect(JSON.parse(vfs.get(CONFIG_PATH)!)).toEqual({
      bootstrap: { rules: { "code-comments": true } },
    });
  });

  test("unknown top-level keys survive a read-modify-write round trip", () => {
    const initial = {
      greeting: "hi",
      customUserKey: { nested: [1, 2, 3], flag: true },
    };
    seed(initial);
    const expectedBytes = vfs.get(CONFIG_PATH)!;

    const doc = readRawConfigStrict();
    const updated = { ...doc, greeting: "changed" };
    writeRawConfig(updated, { expectedBytes });

    const final = JSON.parse(vfs.get(CONFIG_PATH)!);
    expect(final.customUserKey).toEqual(initial.customUserKey);
    expect(final.greeting).toBe("changed");
  });
});

describe("writeRawConfig — compare-and-swap under a race", () => {
  test("a single concurrent write between read and write is re-applied onto the current document exactly once", () => {
    const v0 = { greeting: "hi", untouched: { n: 1 } };
    seed(v0);
    const expectedBytes = vfs.get(CONFIG_PATH)!;

    // Simulate a concurrent writer landing after the caller's read.
    vfs.set(CONFIG_PATH, JSON.stringify({ ...v0, addedByOther: "first-race" }, null, 2));

    const doc = { ...v0, greeting: "changed-by-caller" };
    writeRawConfig(doc, { expectedBytes });

    const final = JSON.parse(vfs.get(CONFIG_PATH)!);
    // The caller's intended change landed...
    expect(final.greeting).toBe("changed-by-caller");
    // ...without clobbering the concurrent writer's addition...
    expect(final.addedByOther).toBe("first-race");
    // ...or the field neither side touched.
    expect(final.untouched).toEqual({ n: 1 });
  });

  test("a key the caller removed is removed even through a re-apply", () => {
    const v0 = { greeting: "hi", stale: "drop-me", untouched: 1 };
    seed(v0);
    const expectedBytes = vfs.get(CONFIG_PATH)!;

    vfs.set(CONFIG_PATH, JSON.stringify({ ...v0, addedByOther: true }, null, 2));

    const { stale: _drop, ...doc } = v0;
    writeRawConfig(doc, { expectedBytes });

    const final = JSON.parse(vfs.get(CONFIG_PATH)!);
    expect(final.stale).toBeUndefined();
    expect(final.addedByOther).toBe(true);
    expect(final.untouched).toBe(1);
  });

  test("a second concurrent write while re-applying throws ConfigWriteConflictError and writes nothing", () => {
    const v0 = { greeting: "hi", untouched: { n: 1 } };
    const v1 = { greeting: "hi", untouched: { n: 1 }, addedByOther: "first-race" };
    const v2 = { greeting: "hi", untouched: { n: 1 }, addedByOther: "second-race" };
    const expectedBytes = JSON.stringify(v0, null, 2);
    const doc = { ...v0, greeting: "changed-by-caller" };

    // writeRawConfig's race path reads the file twice: once to detect the
    // first race, once immediately before writing to detect a second one.
    // Return v1 on the first read and v2 on the second, so the immediate
    // pre-write re-read observes a further change.
    const queue = [JSON.stringify(v1, null, 2), JSON.stringify(v2, null, 2)];
    readSpy.mockImplementation((p: any) => {
      const key = String(p);
      if (key === CONFIG_PATH && queue.length > 0) return queue.shift()!;
      if (!existing.has(key)) {
        const e = new Error(`ENOENT: ${key}`);
        (e as any).code = "ENOENT";
        throw e;
      }
      return vfs.get(key) ?? "";
    });
    existing.add(CONFIG_PATH);

    let caught: unknown;
    try {
      writeRawConfig(doc, { expectedBytes });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ConfigWriteConflictError);
    expect((caught as Error).name).toBe("ConfigWriteConflictError");
    expect((caught as Error).message).toContain(CONFIG_PATH);
    expect(writeSpy).not.toHaveBeenCalled();
    expect(renameSpy).not.toHaveBeenCalled();
  });
});

describe("writeFileAtomically re-export sanity", () => {
  test("still writes through a temp file plus rename (unchanged behavior, now reachable from the barrel)", () => {
    writeFileAtomically(path.join(CONFIG_DIR, "probe.json"), "{}");
    expect(renameSpy).toHaveBeenCalled();
    expect(vfs.get(path.join(CONFIG_DIR, "probe.json"))).toBe("{}");
  });
});
