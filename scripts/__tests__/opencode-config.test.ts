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
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolveConfigPath, parseJsonc, writeConfig } = require("../lib/opencode-config.cjs") as {
  resolveConfigPath: (dir: string) => { path: string; created: boolean; both: boolean };
  parseJsonc: (text: string) => unknown;
  writeConfig: (targetPath: string, cfg: unknown) => string;
};

function withTmpDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "massa-ai-opencode-config-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
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
