/**
 * Bootstrap rule state unit tests (T5 / TASK-005, BST-10).
 *
 * Uses the same `spyOn(fs, ...)` virtual-store harness as
 * `config/__tests__/config-strict-io.test.ts`, and for the same reason:
 * `CONFIG_DIR`/`CONFIG_FILE` in `config-loader.ts` freeze at module-eval time
 * to the real XDG path, so setting `XDG_CONFIG_HOME` from a test that already
 * shares a process with an earlier importer is a no-op. `packages/shared` runs
 * a plain `bun test` over every file in one process, so that sharing is the
 * normal case here, not an edge one — intercepting the fs primitives on the
 * frozen path is what keeps this suite off the developer's real
 * `~/.config/massa-ai/config.json`.
 *
 * `unlinkSync` is stubbed alongside the five primitives the write path uses on
 * its success route. It is only reached from `writeFileAtomically`'s failure
 * cleanup, which these tests never trigger — but an unstubbed fs call on a
 * real path is exactly the escape that stays invisible on a green run.
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import fs from "fs";

import { getConfigPath, ConfigParseError } from "../../config/config-loader";
import { BOOTSTRAP_RULE_IDS, bootstrapRuleDefaults, type BootstrapRuleId } from "../rules";
import {
  BOOTSTRAP_STATE_KEY,
  BOOTSTRAP_STATE_PATH,
  resolveBootstrapState,
  setBootstrapRuleEnabled,
} from "../state";

const CONFIG_PATH = getConfigPath();

let vfs: Map<string, string> = new Map();
let existing: Set<string> = new Set();
let spies: ReturnType<typeof spyOn>[] = [];

function enoent(key: string): Error {
  const e = new Error(`ENOENT: ${key}`);
  (e as any).code = "ENOENT";
  return e;
}

function installSpies() {
  spies = [
    spyOn(fs, "existsSync").mockImplementation((p: any) => existing.has(String(p))),
    spyOn(fs, "readFileSync").mockImplementation((p: any) => {
      const key = String(p);
      if (!existing.has(key)) throw enoent(key);
      return vfs.get(key) ?? "";
    }),
    spyOn(fs, "writeFileSync").mockImplementation((p: any, data: any) => {
      const key = String(p);
      vfs.set(key, String(data));
      existing.add(key);
    }),
    spyOn(fs, "mkdirSync").mockImplementation((p: any) => {
      existing.add(String(p));
      return String(p);
    }),
    spyOn(fs, "chmodSync").mockImplementation((p: any) => {
      if (!existing.has(String(p))) throw enoent(String(p));
    }),
    spyOn(fs, "renameSync").mockImplementation((from: any, to: any) => {
      const fromKey = String(from);
      const toKey = String(to);
      if (!existing.has(fromKey)) throw enoent(fromKey);
      existing.delete(fromKey);
      existing.add(toKey);
      const val = vfs.get(fromKey);
      vfs.delete(fromKey);
      if (val !== undefined) vfs.set(toKey, val);
    }),
    spyOn(fs, "unlinkSync").mockImplementation((p: any) => {
      const key = String(p);
      existing.delete(key);
      vfs.delete(key);
    }),
  ];
}

/** Seed `config.json` with exact bytes (not a re-serialization). */
function seedRaw(text: string) {
  vfs.set(CONFIG_PATH, text);
  existing.add(CONFIG_PATH);
}

function seed(doc: Record<string, unknown>) {
  seedRaw(JSON.stringify(doc, null, 2));
}

function onDisk(): Record<string, unknown> {
  return JSON.parse(vfs.get(CONFIG_PATH) ?? "{}") as Record<string, unknown>;
}

beforeEach(() => {
  vfs = new Map();
  existing = new Set();
  installSpies();
});

afterEach(() => {
  for (const s of spies) s.mockRestore();
  spies = [];
});

describe("resolveBootstrapState — defaults and merge", () => {
  test("an empty document resolves to the registry defaults, with nothing ignored", () => {
    const { state, ignoredStateKeys } = resolveBootstrapState({});
    expect(state).toEqual(bootstrapRuleDefaults());
    expect(ignoredStateKeys).toEqual([]);
  });

  test("every registry id is present in the resolved state, as a set", () => {
    const { state } = resolveBootstrapState({});
    // Set-shaped, not count-shaped: swapping one id for another must redden.
    expect(Object.keys(state).sort()).toEqual([...BOOTSTRAP_RULE_IDS].sort());
  });

  test("a persisted entry overrides its default, and only that entry", () => {
    const defaults = bootstrapRuleDefaults();
    const { state } = resolveBootstrapState({
      bootstrap: { rules: { "code-comments": true } },
    });
    expect(state["code-comments"]).toBe(true);
    expect(defaults["code-comments"]).toBe(false); // the default it overrode
    for (const id of BOOTSTRAP_RULE_IDS) {
      if (id === "code-comments") continue;
      expect(state[id]).toBe(defaults[id]);
    }
  });

  test("every one of the nine ids is overridable in both directions", () => {
    // BST-09 AC-3: no protected subset. Each id is driven to the opposite of
    // its own default and asserted, so a rule that silently ignored its
    // persisted value would redden here rather than hide behind a default that
    // happens to match.
    for (const id of BOOTSTRAP_RULE_IDS) {
      const def = bootstrapRuleDefaults()[id];
      const flipped = resolveBootstrapState({ bootstrap: { rules: { [id]: !def } } });
      expect(flipped.state[id]).toBe(!def);
      const same = resolveBootstrapState({ bootstrap: { rules: { [id]: def } } });
      expect(same.state[id]).toBe(def);
    }
  });

  test("an absent bootstrap key, and an absent rules key, both resolve to defaults", () => {
    expect(resolveBootstrapState({ other: 1 }).state).toEqual(bootstrapRuleDefaults());
    expect(resolveBootstrapState({ bootstrap: {} }).state).toEqual(bootstrapRuleDefaults());
    expect(resolveBootstrapState({ bootstrap: {} }).ignoredStateKeys).toEqual([]);
  });
});

describe("resolveBootstrapState — ignored entries (BST-10 AC-12)", () => {
  test("an id absent from the registry is ignored, reported once, and not fatal", () => {
    const { state, ignoredStateKeys } = resolveBootstrapState({
      bootstrap: { rules: { "no-such-rule": false, caveman: false } },
    });
    expect(ignoredStateKeys).toEqual(["no-such-rule"]);
    // "once", not "repeatedly" — a duplicate would show as length 2.
    expect(ignoredStateKeys.filter((k) => k === "no-such-rule")).toHaveLength(1);
    // Not fatal, and the sibling known entry still applied.
    expect(state.caveman).toBe(false);
    expect(state).toEqual({ ...bootstrapRuleDefaults(), caveman: false });
  });

  test("a known id with a non-boolean value falls back to its default and is named", () => {
    const defaults = bootstrapRuleDefaults();
    const { state, ignoredStateKeys } = resolveBootstrapState({
      bootstrap: { rules: { caveman: "false", "plan-challenge": 0, "english-code": null } },
    });
    // Coercion would invent a preference: "false" and 0 are both falsy, and
    // reading them as `false` would disable two rules the user never disabled.
    expect(state.caveman).toBe(defaults.caveman);
    expect(state["plan-challenge"]).toBe(defaults["plan-challenge"]);
    expect(state["english-code"]).toBe(defaults["english-code"]);
    expect(ignoredStateKeys).toEqual(["caveman", "english-code", "plan-challenge"]);
  });

  test("ignored keys are sorted, so the same document reports them identically twice", () => {
    const doc = { bootstrap: { rules: { zulu: true, alpha: true, mike: true } } };
    const first = resolveBootstrapState(doc).ignoredStateKeys;
    const second = resolveBootstrapState(doc).ignoredStateKeys;
    expect(first).toEqual(["alpha", "mike", "zulu"]);
    expect(second).toEqual(first);
  });

  test("a non-object bootstrap or rules value is reported by path, never thrown", () => {
    expect(resolveBootstrapState({ bootstrap: "on" }).ignoredStateKeys).toEqual([
      BOOTSTRAP_STATE_KEY,
    ]);
    expect(resolveBootstrapState({ bootstrap: [] }).ignoredStateKeys).toEqual([
      BOOTSTRAP_STATE_KEY,
    ]);
    expect(resolveBootstrapState({ bootstrap: { rules: [] } }).ignoredStateKeys).toEqual([
      BOOTSTRAP_STATE_PATH,
    ]);
    expect(resolveBootstrapState({ bootstrap: { rules: "all" } }).state).toEqual(
      bootstrapRuleDefaults(),
    );
  });
});

describe("resolveBootstrapState — reading through the strict seam", () => {
  test("with no argument it reads config.json and applies what it finds", () => {
    seed({ bootstrap: { rules: { "code-comments": true } } });
    expect(resolveBootstrapState().state["code-comments"]).toBe(true);
  });

  test("an absent config.json resolves to defaults rather than throwing", () => {
    expect(resolveBootstrapState().state).toEqual(bootstrapRuleDefaults());
  });

  test("a malformed config.json throws ConfigParseError rather than reading as empty", () => {
    // The whole point of the T3 seam: "malformed" must never be silently
    // treated as "nothing configured", because the caller composing that with
    // a write would erase the file.
    seedRaw("{ not json");
    expect(() => resolveBootstrapState()).toThrow(ConfigParseError);
  });
});

describe("setBootstrapRuleEnabled — persistence", () => {
  test("an absent config.json is created holding the bootstrap key", () => {
    expect(existing.has(CONFIG_PATH)).toBe(false);
    const result = setBootstrapRuleEnabled("code-comments", true);
    expect(existing.has(CONFIG_PATH)).toBe(true);
    expect(onDisk()).toEqual({ bootstrap: { rules: { "code-comments": true } } });
    expect(result.state["code-comments"]).toBe(true);
  });

  test("only the bootstrap subtree changes — every sibling key stays byte-identical", () => {
    const siblings = {
      database: { url: "postgresql://user:pw@localhost:5432/db" },
      security: { apiKey: "sk-do-not-lose-me" },
      llm: { enabled: true, model: "qwen2.5:7b-instruct" },
      unknownFutureKey: { nested: [1, 2, { deep: "value" }] },
    };
    seed({ ...siblings, bootstrap: { rules: { caveman: false } } });

    const before = onDisk();
    setBootstrapRuleEnabled("plan-challenge", false);
    const after = onDisk();

    for (const key of Object.keys(siblings)) {
      // Byte-level, not deep-equal: a re-serialization that reordered nested
      // keys would pass toEqual and still rewrite the user's file.
      expect(JSON.stringify(after[key])).toBe(JSON.stringify(before[key]));
    }
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  });

  test("a sibling key under bootstrap, and a sibling rule, both survive a flip", () => {
    seed({
      bootstrap: { somethingElse: { keep: true }, rules: { caveman: false } },
    });
    setBootstrapRuleEnabled("code-comments", true);
    const bootstrap = onDisk().bootstrap as Record<string, unknown>;
    expect(bootstrap.somethingElse).toEqual({ keep: true });
    expect(bootstrap.rules).toEqual({ caveman: false, "code-comments": true });
  });

  test("a flip round-trips: what was written resolves back to what was asked", () => {
    setBootstrapRuleEnabled("massa-ai-router", false);
    expect(resolveBootstrapState().state["massa-ai-router"]).toBe(false);
    setBootstrapRuleEnabled("massa-ai-router", true);
    expect(resolveBootstrapState().state["massa-ai-router"]).toBe(true);
  });

  test("changed reports whether the resolved value moved, and the key is written either way", () => {
    // Writing a value equal to the registry default still materializes the
    // key: an implicit preference is not a recorded one, and the next default
    // change would silently move it.
    const same = setBootstrapRuleEnabled("caveman", bootstrapRuleDefaults().caveman);
    expect(same.changed).toBe(false);
    expect((onDisk().bootstrap as any).rules.caveman).toBe(bootstrapRuleDefaults().caveman);

    const moved = setBootstrapRuleEnabled("caveman", !bootstrapRuleDefaults().caveman);
    expect(moved.changed).toBe(true);
  });

  test("the returned state and ignoredStateKeys describe the document after the write", () => {
    seed({ bootstrap: { rules: { "no-such-rule": true } } });
    const result = setBootstrapRuleEnabled("code-comments", true);
    expect(result.state["code-comments"]).toBe(true);
    expect(result.ignoredStateKeys).toEqual(["no-such-rule"]);
    // The unknown entry is preserved on disk, not silently pruned — this
    // module ignores what it does not know, it does not delete it.
    expect((onDisk().bootstrap as any).rules["no-such-rule"]).toBe(true);
  });
});

describe("setBootstrapRuleEnabled — refusals happen before any write", () => {
  test("an unknown id throws UnknownRuleError and leaves config.json untouched", () => {
    seed({ database: { url: "keep" } });
    const before = vfs.get(CONFIG_PATH);

    let thrown: any;
    try {
      setBootstrapRuleEnabled("not-a-rule", true);
    } catch (error) {
      thrown = error;
    }
    expect(thrown?.name).toBe("UnknownRuleError");
    expect(String(thrown?.message)).toContain("not-a-rule");
    // Lists all nine valid ids (BST-09 AC-8).
    for (const id of BOOTSTRAP_RULE_IDS) expect(String(thrown?.message)).toContain(id);
    // Byte-identical: the file was never opened for writing.
    expect(vfs.get(CONFIG_PATH)).toBe(before);
  });

  test("an unknown id on an absent config.json does not create the file", () => {
    expect(() => setBootstrapRuleEnabled("not-a-rule", true)).toThrow();
    expect(existing.has(CONFIG_PATH)).toBe(false);
  });

  test("a malformed config.json throws ConfigParseError and writes nothing", () => {
    seedRaw("{ broken");
    expect(() => setBootstrapRuleEnabled("caveman", false)).toThrow(ConfigParseError);
    expect(vfs.get(CONFIG_PATH)).toBe("{ broken");
  });

  test("a config.json holding a JSON array is refused, not spread into an object", () => {
    seedRaw("[1, 2, 3]");
    expect(() => setBootstrapRuleEnabled("caveman", false)).toThrow(ConfigParseError);
    expect(vfs.get(CONFIG_PATH)).toBe("[1, 2, 3]");
  });
});

describe("every registry id is individually persistable (BST-09 AC-3)", () => {
  test("each of the nine ids writes and reads back, in both directions", () => {
    for (const id of BOOTSTRAP_RULE_IDS as readonly BootstrapRuleId[]) {
      vfs = new Map();
      existing = new Set();
      setBootstrapRuleEnabled(id, false);
      expect(resolveBootstrapState().state[id]).toBe(false);
      setBootstrapRuleEnabled(id, true);
      expect(resolveBootstrapState().state[id]).toBe(true);
    }
  });
});
