/**
 * scripts/lib/opencode-config.cjs — PDO-02 coverage.
 *
 * parseJsonc is the highest-risk piece (spec: "the single most likely correctness bug
 * in the workstream"): a naive regex comment-stripper corrupts string values containing
 * "//" (a URL) or a comment containing a quote character. Every fixture below is chosen
 * to make that class of bug fail loudly rather than silently produce a subtly-wrong
 * object.
 */
import { describe, test, expect } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type ConfigDoc = Record<string, unknown>;
type OpResult = { result: string; backupPath: string | null; notes: string[] };

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CONFIG_LIB = require("../lib/opencode-config.cjs") as {
  resolveConfigPath: (dir: string) => { path: string; created: boolean; both: boolean };
  parseJsonc: (text: string) => unknown;
  writeConfig: (targetPath: string, cfg: unknown) => string;
  instructionsOp: (mode: string, targetPath: string, cfg: ConfigDoc, entry: string) => OpResult;
  ORPHAN_LIMITATION_NOTE: string;
};
const { resolveConfigPath, parseJsonc, writeConfig, instructionsOp, ORPHAN_LIMITATION_NOTE } =
  CONFIG_LIB;

function withTmpDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "massa-ai-opencode-config-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function backupsIn(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.includes(".massa-ai.bak-"));
}

// ── The plan-mode sensor ─────────────────────────────────────────────────────
// design.md:449 and :477 make "no filesystem contact" the contract, deliberately
// stronger than "no net change": a compare-then-skip guard leaves the bytes alone
// only when the config already agrees, and writes in exactly the drift state
// `--check` exists to report. A sensor that reads the file afterwards and finds it
// unchanged passes that mutation. So this one counts the module's own fs calls.
//
// It works because scripts/lib/opencode-config.cjs holds `const fs = require("fs")`
// and then calls `fs.readFileSync(...)` — a property lookup on the shared builtin
// namespace object at call time, so wrapping the properties of that same object
// observes the module's calls. The `writeConfig` case in this block is the
// recorder's own calibration: it asserts a known-writing path is really seen, so a
// zero from a plan mode means silence rather than a mis-wired probe.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const FS_OBJECT = require("node:fs") as Record<string, unknown>;

function recordFsCalls<T>(fn: () => T): { value: T; calls: string[] } {
  const calls: string[] = [];
  const originals = new Map<string, unknown>();
  for (const name of Object.getOwnPropertyNames(FS_OBJECT)) {
    const descriptor = Object.getOwnPropertyDescriptor(FS_OBJECT, name);
    if (!descriptor || typeof descriptor.value !== "function") continue;
    if (!descriptor.writable || !descriptor.configurable) continue;
    const real = descriptor.value as (...args: unknown[]) => unknown;
    originals.set(name, real);
    FS_OBJECT[name] = (...args: unknown[]) => {
      calls.push(name);
      return real(...args);
    };
  }
  try {
    return { value: fn(), calls };
  } finally {
    for (const [name, real] of originals) FS_OBJECT[name] = real;
  }
}

// ── resolveConfigPath — all four existence combinations ──────────────────────

describe("resolveConfigPath", () => {
  test("neither exists: resolves to opencode.jsonc and reports created", () => {
    withTmpDir((dir) => {
      const result = resolveConfigPath(dir);
      expect(result.path).toBe(join(dir, "opencode.jsonc"));
      expect(result.created).toBe(true);
      expect(result.both).toBe(false);
    });
  });

  test(".jsonc only: resolves to opencode.jsonc", () => {
    withTmpDir((dir) => {
      writeFileSync(join(dir, "opencode.jsonc"), "{}\n");
      const result = resolveConfigPath(dir);
      expect(result.path).toBe(join(dir, "opencode.jsonc"));
      expect(result.created).toBe(false);
      expect(result.both).toBe(false);
    });
  });

  test(".json only: resolves to opencode.json", () => {
    withTmpDir((dir) => {
      writeFileSync(join(dir, "opencode.json"), "{}\n");
      const result = resolveConfigPath(dir);
      expect(result.path).toBe(join(dir, "opencode.json"));
      expect(result.created).toBe(false);
      expect(result.both).toBe(false);
    });
  });

  test("both exist: resolves to opencode.json (the merge winner) and reports both", () => {
    withTmpDir((dir) => {
      writeFileSync(join(dir, "opencode.jsonc"), "{}\n");
      writeFileSync(join(dir, "opencode.json"), "{}\n");
      const result = resolveConfigPath(dir);
      expect(result.path).toBe(join(dir, "opencode.json"));
      expect(result.created).toBe(false);
      expect(result.both).toBe(true);
    });
  });

  test("does not touch the filesystem itself (no directory or file created)", () => {
    withTmpDir((dir) => {
      const target = join(dir, "nested", "opencode");
      const result = resolveConfigPath(target);
      expect(existsSync(target)).toBe(false);
      expect(result.created).toBe(true);
    });
  });
});

// ── parseJsonc — comments, trailing commas, BOM, and the string-safety fixtures ──

describe("parseJsonc", () => {
  test("parses plain JSON unchanged", () => {
    expect(parseJsonc('{"a": 1, "b": [1, 2, 3]}')).toEqual({ a: 1, b: [1, 2, 3] });
  });

  test("strips // line comments", () => {
    const text = [
      "{",
      '  // this is a comment',
      '  "a": 1',
      "}",
    ].join("\n");
    expect(parseJsonc(text)).toEqual({ a: 1 });
  });

  test("strips /* */ block comments, including multi-line ones", () => {
    const text = [
      "{",
      "  /* block",
      "     comment */",
      '  "a": 1',
      "}",
    ].join("\n");
    expect(parseJsonc(text)).toEqual({ a: 1 });
  });

  test("strips trailing commas in objects and arrays", () => {
    const text = '{\n  "a": 1,\n  "b": [1, 2, 3,],\n}\n';
    expect(parseJsonc(text)).toEqual({ a: 1, b: [1, 2, 3] });
  });

  test("strips a UTF-8 BOM rather than throwing", () => {
    const withBom = "﻿" + '{"a": 1}';
    expect(parseJsonc(withBom)).toEqual({ a: 1 });
  });

  // The single most likely correctness bug in the workstream (design.md D1): a naive
  // regex stripper would treat "//" inside a URL string as the start of a comment and
  // truncate the value. Every value below is a URL, specifically to catch that.
  test("does not corrupt string values that are URLs (all-URL-values fixture)", () => {
    const text = [
      "{",
      '  "homepage": "https://example.com/path?query=1&x=2",',
      '  "mcp": {',
      '    "massa-ai": {',
      '      "environment": {',
      '        "MASSA_AI_API_URL": "http://localhost:3333"',
      "      }",
      "    }",
      "  },",
      '  "mirrors": ["https://a.example.com", "https://b.example.com//double-slash"]',
      "}",
    ].join("\n");
    expect(parseJsonc(text)).toEqual({
      homepage: "https://example.com/path?query=1&x=2",
      mcp: { "massa-ai": { environment: { MASSA_AI_API_URL: "http://localhost:3333" } } },
      mirrors: ["https://a.example.com", "https://b.example.com//double-slash"],
    });
  });

  test("does not corrupt a comment containing a quote character", () => {
    // The comment text itself contains a double quote. A stripper that mis-tracks
    // string state after seeing it would either swallow real content or leave comment
    // debris in the output.
    const text = [
      "{",
      '  // note: the user\'s "home" directory is not touched',
      '  "a": 1',
      "}",
    ].join("\n");
    expect(parseJsonc(text)).toEqual({ a: 1 });
  });

  test("does not corrupt a string containing a literal comma before a closing brace", () => {
    // Regression guard for a trailing-comma stripper implemented as a post-hoc regex:
    // this string's content looks exactly like a trailing comma followed by "}" if you
    // are not tracking string state.
    const text = '{"weird": ",  }", "a": 1}';
    expect(parseJsonc(text)).toEqual({ weird: ",  }", a: 1 });
  });

  test("throws on genuinely malformed content (not merely commented)", () => {
    expect(() => parseJsonc("{ this is not json")).toThrow();
  });

  test("throws with a message a caller can wrap with the file's own name", () => {
    try {
      parseJsonc("{ broken");
      throw new Error("expected parseJsonc to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toMatch(/not valid JSON/);
    }
  });

  test("handles an empty object/array with only comments inside", () => {
    expect(parseJsonc("{\n  // nothing here yet\n}\n")).toEqual({});
    expect(parseJsonc("[\n  // nothing here yet\n]\n")).toEqual([]);
  });

  test("real-world fixture: comments, trailing commas, and URLs together", () => {
    const text = [
      "// massa-ai OpenCode config",
      "{",
      '  "mcp": {',
      "    // massa-ai MCP server entry",
      '    "massa-ai": {',
      '      "type": "local",',
      '      "command": ["bunx", "-p", "@massa-ai/mcp-client", "massa-ai"],',
      '      "environment": {',
      '        "MASSA_AI_API_URL": "http://localhost:3333", // trailing comment',
      "      },",
      '      "enabled": true,',
      "    },",
      "  },",
      "}",
      "",
    ].join("\n");
    expect(parseJsonc(text)).toEqual({
      mcp: {
        "massa-ai": {
          type: "local",
          command: ["bunx", "-p", "@massa-ai/mcp-client", "massa-ai"],
          environment: { MASSA_AI_API_URL: "http://localhost:3333" },
          enabled: true,
        },
      },
    });
  });
});

// ── writeConfig — backup-before-write, byte contract ──────────────────────────

describe("writeConfig", () => {
  test("creates a backup before writing, and writes pretty JSON with a trailing newline", () => {
    withTmpDir((dir) => {
      const target = join(dir, "opencode.jsonc");
      writeFileSync(target, '{"old": true}');

      const backupPath = writeConfig(target, { new: true });

      expect(existsSync(backupPath)).toBe(true);
      expect(readFileSync(backupPath, "utf8")).toBe('{"old": true}');
      expect(backupPath).toMatch(/\.massa-ai\.bak-/);
      expect(readFileSync(target, "utf8")).toBe('{\n  "new": true\n}\n');
    });
  });

  test("reserves an empty backup marker when writing a brand-new file", () => {
    withTmpDir((dir) => {
      const target = join(dir, "sub", "opencode.jsonc");
      const backupPath = writeConfig(target, { fresh: true });

      expect(readFileSync(backupPath, "utf8")).toBe("");
      expect(readFileSync(target, "utf8")).toBe('{\n  "fresh": true\n}\n');
    });
  });

  test("creates parent directories as needed", () => {
    withTmpDir((dir) => {
      const target = join(dir, "a", "b", "c", "opencode.jsonc");
      writeConfig(target, {});
      expect(existsSync(target)).toBe(true);
    });
  });

  test("round-trips through parseJsonc", () => {
    withTmpDir((dir) => {
      const target = join(dir, "opencode.jsonc");
      writeConfig(target, { a: 1, nested: { b: [1, 2, 3] } });
      const parsed = parseJsonc(readFileSync(target, "utf8"));
      expect(parsed).toEqual({ a: 1, nested: { b: [1, 2, 3] } });
    });
  });
});

// ── The module aborts a host, never the run ─────────────────────────────────

// Deliberately ordered ahead of every instructionsOp block. BST-03 AC-11 makes the
// module's failure mode a throw the caller records before moving to the next host; a
// `process.exit` would instead take the caller down — and, in this suite, the test
// runner itself, mid-run and before any later assertion could report. Running this
// check first keeps that mutation attributable to a named test rather than to a bare
// exit code with no summary.
describe("module-level failure contract", () => {
  test("the module never calls process.exit, so a caller can record and continue", () => {
    const source = readFileSync(join(import.meta.dir, "../lib/opencode-config.cjs"), "utf8");
    // Counted, not `.not.toMatch`: a failing toMatch prints the whole module as the
    // received value, which buries the finding under 200 lines of source.
    expect([...source.matchAll(/process\.exit/g)]).toHaveLength(0);
  });
});

// ── instructionsOp — plan/remove-plan make no filesystem call at all ─────────

describe("instructionsOp plan modes", () => {
  const ENTRY = "/home/u/.config/opencode/MASSA-AI.md";

  test("the fs recorder really observes this module's calls (calibration)", () => {
    withTmpDir((dir) => {
      const { calls } = recordFsCalls(() => writeConfig(join(dir, "opencode.jsonc"), { a: 1 }));
      expect(calls).toContain("writeFileSync");
      expect(calls).toContain("existsSync");
    });
  });

  test("plan against drift reports change and makes zero fs calls", () => {
    // The drift state: the config exists and its instructions array lacks the
    // contract path. A compare-then-skip guard writes here (design.md:449).
    const cfg: ConfigDoc = { instructions: ["~/my-notes.md"] };
    const { value, calls } = recordFsCalls(() =>
      instructionsOp("plan", "/nonexistent/opencode.jsonc", cfg, ENTRY),
    );
    expect(value.result).toBe("change");
    expect(value.backupPath).toBeNull();
    expect(calls).toEqual([]);
  });

  test("plan against an already-wired config reports nochange and makes zero fs calls", () => {
    const cfg: ConfigDoc = { instructions: [ENTRY] };
    const { value, calls } = recordFsCalls(() =>
      instructionsOp("plan", "/nonexistent/opencode.jsonc", cfg, ENTRY),
    );
    expect(value.result).toBe("nochange");
    expect(calls).toEqual([]);
  });

  test("remove-plan reports change against a present entry and makes zero fs calls", () => {
    const cfg: ConfigDoc = { instructions: [ENTRY] };
    const { value, calls } = recordFsCalls(() =>
      instructionsOp("remove-plan", "/nonexistent/opencode.jsonc", cfg, ENTRY),
    );
    expect(value.result).toBe("change");
    expect(calls).toEqual([]);
  });

  test("remove-plan reports nochange against an absent entry and makes zero fs calls", () => {
    const cfg: ConfigDoc = {};
    const { value, calls } = recordFsCalls(() =>
      instructionsOp("remove-plan", "/nonexistent/opencode.jsonc", cfg, ENTRY),
    );
    expect(value.result).toBe("nochange");
    expect(calls).toEqual([]);
  });

  test("a plan mode leaves no file and no backup on a real, writable directory", () => {
    // The zero-call assertions above are the contract; this one states the
    // consequence a user would see, against a path the module could have written.
    withTmpDir((dir) => {
      const target = join(dir, "opencode.jsonc");
      writeFileSync(target, '{\n  // keep me\n  "instructions": ["~/notes.md"]\n}\n');
      const before = readFileSync(target, "utf8");

      expect(instructionsOp("plan", target, { instructions: ["~/notes.md"] }, ENTRY).result).toBe(
        "change",
      );

      expect(readFileSync(target, "utf8")).toBe(before);
      expect(backupsIn(dir)).toEqual([]);
    });
  });

  test("a plan mode does not mutate the caller's parsed document", () => {
    const cfg: ConfigDoc = { instructions: ["~/my-notes.md"] };
    instructionsOp("plan", "/nonexistent/opencode.jsonc", cfg, ENTRY);
    instructionsOp("remove-plan", "/nonexistent/opencode.jsonc", cfg, "~/my-notes.md");
    expect(cfg).toEqual({ instructions: ["~/my-notes.md"] });
  });

  test("an unknown mode throws rather than defaulting to a write", () => {
    expect(() => instructionsOp("check", "/nonexistent/opencode.jsonc", {}, ENTRY)).toThrow(
      /unknown mode: check/,
    );
  });
});

// ── instructionsOp apply — idempotent add, one backup ────────────────────────

describe("instructionsOp apply", () => {
  test("adds the instructions array when absent, preserving every other key", () => {
    withTmpDir((dir) => {
      const target = join(dir, "opencode.jsonc");
      const entry = join(dir, "MASSA-AI.md");
      writeFileSync(target, '{"$schema": "https://opencode.ai/config.json"}\n');

      const out = instructionsOp("apply", target, { $schema: "https://opencode.ai/config.json" }, entry);

      expect(out.result).toBe("change");
      expect(parseJsonc(readFileSync(target, "utf8"))).toEqual({
        $schema: "https://opencode.ai/config.json",
        instructions: [entry],
      });
    });
  });

  test("appends to an existing array, keeping the user's own entries", () => {
    withTmpDir((dir) => {
      const target = join(dir, "opencode.json");
      const entry = join(dir, "MASSA-AI.md");
      writeFileSync(target, '{"instructions": ["~/notes.md"]}\n');

      instructionsOp("apply", target, { instructions: ["~/notes.md"] }, entry);

      expect(parseJsonc(readFileSync(target, "utf8"))).toEqual({
        instructions: ["~/notes.md", entry],
      });
    });
  });

  test("re-applying adds no duplicate entry and creates no second backup", () => {
    withTmpDir((dir) => {
      const target = join(dir, "opencode.jsonc");
      const entry = join(dir, "MASSA-AI.md");
      writeFileSync(target, "{}\n");

      const first = instructionsOp("apply", target, {}, entry);
      expect(first.result).toBe("change");
      expect(first.backupPath).not.toBeNull();
      expect(backupsIn(dir)).toHaveLength(1);

      const afterFirst = readFileSync(target, "utf8");
      const reparsed = parseJsonc(afterFirst) as ConfigDoc;

      const second = instructionsOp("apply", target, reparsed, entry);
      expect(second.result).toBe("nochange");
      expect(second.backupPath).toBeNull();
      expect(backupsIn(dir)).toHaveLength(1);
      expect(readFileSync(target, "utf8")).toBe(afterFirst);
      expect((parseJsonc(afterFirst) as { instructions: string[] }).instructions).toEqual([entry]);
    });
  });

  test("a non-array instructions value is replaced, matching the plugin call site", () => {
    // apps/opencode-plugin/install.sh:566 does the same for `plugin`; OpenCode types
    // this field string[], so any other value is already an invalid document.
    withTmpDir((dir) => {
      const target = join(dir, "opencode.jsonc");
      const entry = join(dir, "MASSA-AI.md");
      writeFileSync(target, '{"instructions": "oops"}\n');

      instructionsOp("apply", target, { instructions: "oops" }, entry);

      expect(parseJsonc(readFileSync(target, "utf8"))).toEqual({ instructions: [entry] });
    });
  });
});

// ── BST-03 AC-11 — an unparseable config aborts its host, not the run ────────

describe("instructionsOp and an unparseable config", () => {
  test("a bad host is recorded and skipped while the sibling host is still wired", () => {
    withTmpDir((dir) => {
      const badDir = join(dir, "bad");
      const goodDir = join(dir, "good");
      mkdirSync(badDir);
      mkdirSync(goodDir);
      writeFileSync(join(badDir, "opencode.jsonc"), "{ this is not json\n");
      writeFileSync(join(goodDir, "opencode.jsonc"), "{}\n");
      const badBefore = readFileSync(join(badDir, "opencode.jsonc"), "utf8");

      // The caller loop BST-03 AC-11 describes: record the named error, `continue`.
      const errors: string[] = [];
      for (const hostDir of [badDir, goodDir]) {
        const resolved = resolveConfigPath(hostDir);
        let cfg: ConfigDoc = {};
        try {
          const raw = readFileSync(resolved.path, "utf8");
          if (raw.trim()) cfg = parseJsonc(raw) as ConfigDoc;
        } catch (e) {
          errors.push(`${resolved.path}: ${(e as Error).message}`);
          continue;
        }
        instructionsOp("apply", resolved.path, cfg, join(hostDir, "MASSA-AI.md"));
      }

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/not valid JSON/);
      expect(readFileSync(join(badDir, "opencode.jsonc"), "utf8")).toBe(badBefore);
      expect(backupsIn(badDir)).toEqual([]);
      expect(parseJsonc(readFileSync(join(goodDir, "opencode.jsonc"), "utf8"))).toEqual({
        instructions: [join(goodDir, "MASSA-AI.md")],
      });
    });
  });
});

// ── instructionsOp remove-apply — exact path, empty array deleted ────────────

describe("instructionsOp remove-apply", () => {
  test("removes the exact absolute path and deletes the array when it empties", () => {
    withTmpDir((dir) => {
      const target = join(dir, "opencode.jsonc");
      const entry = join(dir, "MASSA-AI.md");
      writeFileSync(target, `{"$schema": "s", "instructions": ${JSON.stringify([entry])}}\n`);

      const out = instructionsOp("remove-apply", target, { $schema: "s", instructions: [entry] }, entry);

      expect(out.result).toBe("change");
      expect(parseJsonc(readFileSync(target, "utf8"))).toEqual({ $schema: "s" });
    });
  });

  test("keeps the array when other entries remain", () => {
    withTmpDir((dir) => {
      const target = join(dir, "opencode.jsonc");
      const entry = join(dir, "MASSA-AI.md");
      writeFileSync(target, "{}\n");

      instructionsOp("remove-apply", target, { instructions: ["~/notes.md", entry] }, entry);

      expect(parseJsonc(readFileSync(target, "utf8"))).toEqual({ instructions: ["~/notes.md"] });
    });
  });

  test("removes a duplicate entry left by an earlier run in one pass", () => {
    withTmpDir((dir) => {
      const target = join(dir, "opencode.jsonc");
      const entry = join(dir, "MASSA-AI.md");
      writeFileSync(target, "{}\n");

      instructionsOp("remove-apply", target, { instructions: [entry, entry] }, entry);

      expect(parseJsonc(readFileSync(target, "utf8"))).toEqual({});
    });
  });

  test("an absent entry is nochange, writing nothing and leaving no backup", () => {
    withTmpDir((dir) => {
      const target = join(dir, "opencode.jsonc");
      writeFileSync(target, '{"instructions": ["~/notes.md"]}\n');
      const before = readFileSync(target, "utf8");

      const out = instructionsOp("remove-apply", target, { instructions: ["~/notes.md"] }, join(dir, "MASSA-AI.md"));

      expect(out.result).toBe("nochange");
      expect(out.backupPath).toBeNull();
      expect(readFileSync(target, "utf8")).toBe(before);
      expect(backupsIn(dir)).toEqual([]);
    });
  });

  test("both remove modes state the orphan-entry limitation for the uninstall report", () => {
    const entry = "/home/u/.config/opencode/MASSA-AI.md";
    for (const mode of ["remove-plan", "remove-apply"]) {
      const out = instructionsOp(mode, "/nonexistent/opencode.jsonc", {}, entry);
      expect(out.notes[0]).toBe(ORPHAN_LIMITATION_NOTE);
      expect(out.notes[0]).toMatch(/no ownership marker/);
      expect(out.notes[0]).toMatch(/exact path/);
      expect(out.notes[0]).toMatch(/different --target/);
    }
  });

  test("names a contract entry it declined to remove instead of leaving it silent", () => {
    // design.md:440 — a path from an older home or another --target is
    // indistinguishable from a user's own entry, so it is reported, not removed.
    const entry = "/home/new/.config/opencode/MASSA-AI.md";
    const stale = "/home/old/.config/opencode/MASSA-AI.md";
    const out = instructionsOp("remove-plan", "/nonexistent/opencode.jsonc", {
      instructions: [stale, entry, "~/notes.md"],
    }, entry);

    expect(out.notes).toContain(`orphan instructions entry left in place: ${stale}`);
    expect(out.notes.join("\n")).not.toContain("~/notes.md");
  });

  test("removal matches the exact path, so a stale contract entry survives on disk", () => {
    // The other half of design.md:440: reporting the orphan is only honest if the
    // removal really did leave it alone. A basename or suffix match would take both.
    withTmpDir((dir) => {
      const target = join(dir, "opencode.jsonc");
      const entry = join(dir, "new", "MASSA-AI.md");
      const stale = join(dir, "old", "MASSA-AI.md");
      writeFileSync(target, "{}\n");

      instructionsOp("remove-apply", target, { instructions: [stale, entry] }, entry);

      expect(parseJsonc(readFileSync(target, "utf8"))).toEqual({ instructions: [stale] });
    });
  });
});
