/**
 * ignore-patterns extended unit tests.
 *
 * Covers applyCapturePolicy, _resetCapturePolicyCacheForTesting,
 * getActivePolicy (config-present path), and loadProjectIgnore edge cases
 * (no .gitignore, comments, blank lines).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { config } from "@massa-ai/shared";
import {
  loadProjectIgnore,
  applyCapturePolicy,
  DEFAULT_IGNORES,
  DEFAULT_EXTENSIONS,
  _resetCapturePolicyCacheForTesting,
} from "../services/search/ignore-patterns.js";

let fixtureDir: string;

beforeAll(async () => {
  fixtureDir = await mkdtemp(path.join(tmpdir(), "ignore-ext-"));
  await mkdir(path.join(fixtureDir, "src"), { recursive: true });
  await writeFile(path.join(fixtureDir, "src", "index.ts"), "// index");
});

afterAll(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
});

describe("ignore-patterns — applyCapturePolicy", () => {
  test("drops node_modules path", () => {
    expect(applyCapturePolicy("node_modules/foo/bar.js")).toBe("Drop");
  });

  test("keeps a source file", () => {
    expect(applyCapturePolicy("src/index.ts")).toBe("Keep");
  });

  test("drops test files", () => {
    expect(applyCapturePolicy("src/foo.test.ts")).toBe("Drop");
    expect(applyCapturePolicy("src/__tests__/bar.test.ts")).toBe("Drop");
  });

  test("drops .env files", () => {
    expect(applyCapturePolicy(".env")).toBe("Drop");
    expect(applyCapturePolicy(".env.local")).toBe("Drop");
  });

  test("drops lock files", () => {
    expect(applyCapturePolicy("pnpm-lock.yaml")).toBe("Drop");
    expect(applyCapturePolicy("package-lock.json")).toBe("Drop");
  });

  test("keeps markdown docs", () => {
    expect(applyCapturePolicy("docs/README.md")).toBe("Keep");
  });
});

describe("ignore-patterns — _resetCapturePolicyCacheForTesting", () => {
  test("is callable and does not throw", () => {
    expect(() => _resetCapturePolicyCacheForTesting()).not.toThrow();
  });

  test("after reset, applyCapturePolicy still works (re-reads config)", () => {
    _resetCapturePolicyCacheForTesting();
    expect(applyCapturePolicy("node_modules/x.js")).toBe("Drop");
    expect(applyCapturePolicy("src/index.ts")).toBe("Keep");
  });
});

describe("ignore-patterns — loadProjectIgnore edge cases", () => {
  test("no .gitignore → uses defaults only", async () => {
    const ig = await loadProjectIgnore(fixtureDir);
    // src/index.ts is not in DEFAULT_IGNORES → not ignored
    expect(ig.ignores("src/index.ts")).toBe(false);
    // node_modules is in DEFAULT_IGNORES
    expect(ig.ignores("node_modules/foo.js")).toBe(true);
  });

  test(".gitignore with comments and blank lines → parsed correctly", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ignore-comments-"));
    await writeFile(
      path.join(dir, ".gitignore"),
      ["# comment line", "", "*.log", "", "# another comment", "dist/"].join("\n"),
    );
    try {
      const ig = await loadProjectIgnore(dir);
      expect(ig.ignores("app.log")).toBe(true);
      expect(ig.ignores("dist/bundle.js")).toBe(true);
      expect(ig.ignores("src/index.ts")).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test(".gitignore rules merge with DEFAULT_IGNORES", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ignore-merge-"));
    await writeFile(path.join(dir, ".gitignore"), "*.tmp\n");
    try {
      const ig = await loadProjectIgnore(dir);
      // Custom rule
      expect(ig.ignores("cache.tmp")).toBe(true);
      // Default rule still applies
      expect(ig.ignores("node_modules/x.js")).toBe(true);
      expect(ig.ignores("dist/out.js")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("ignore-patterns — exported constants", () => {
  test("DEFAULT_IGNORES is non-empty and contains common dirs", () => {
    expect(DEFAULT_IGNORES.length).toBeGreaterThan(0);
    expect(DEFAULT_IGNORES).toContain("**/node_modules/**");
    expect(DEFAULT_IGNORES).toContain("**/dist/**");
    expect(DEFAULT_IGNORES).toContain("**/*.test.ts");
  });

  test("DEFAULT_EXTENSIONS contains common code extensions", () => {
    expect(DEFAULT_EXTENSIONS).toContain(".ts");
    expect(DEFAULT_EXTENSIONS).toContain(".js");
    expect(DEFAULT_EXTENSIONS).toContain(".py");
    expect(DEFAULT_EXTENSIONS).toContain(".kt");
  });
});

describe("ignore-patterns — getActivePolicy with config-present path", () => {
  const ORIGINAL_CONFIG = config.get("capturePolicy");

  test("custom capturePolicy from config is validated and used", () => {
    const customPolicy = {
      rules: [{ pattern: "**/*.log", disposition: "Drop" as const }],
      maxMatchWork: 100_000,
      maxIgnorePatterns: 1_024,
    };
    config.set("capturePolicy", customPolicy);
    _resetCapturePolicyCacheForTesting();
    // The custom policy only drops *.log; everything else is Keep (no default rules)
    expect(applyCapturePolicy("app.log")).toBe("Drop");
    expect(applyCapturePolicy("src/index.ts")).toBe("Keep");
    // node_modules would be dropped by DEFAULT_POLICY, but the custom policy
    // replaces it entirely — node_modules is NOT dropped.
    expect(applyCapturePolicy("node_modules/x.js")).toBe("Keep");

    // Restore
    config.set("capturePolicy", ORIGINAL_CONFIG);
    _resetCapturePolicyCacheForTesting();
  });

  test("invalid capturePolicy from config throws on validation", () => {
    config.set("capturePolicy", {
      rules: [],
      bogusField: true,
    });
    _resetCapturePolicyCacheForTesting();
    expect(() => applyCapturePolicy("src/x.ts")).toThrow(/unknown field/);
    // Restore
    config.set("capturePolicy", ORIGINAL_CONFIG);
    _resetCapturePolicyCacheForTesting();
  });
});