import { describe, expect, it, beforeAll, afterAll, afterEach } from "bun:test";
import fs from "fs/promises";
import os from "os";
import path from "path";

const NONEXISTENT_DIR = path.join(os.tmpdir(), "__massa_ai_nonexistent_dir_xyz__");
import { collectFiles } from "./file-collector.js";

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-collector-test-"));

  // Supported files
  await fs.writeFile(path.join(tmpDir, "index.ts"), 'export const x = 1;');
  await fs.writeFile(path.join(tmpDir, "app.js"), 'console.log("hello")');
  await fs.writeFile(path.join(tmpDir, "component.tsx"), 'export default () => null;');

  // Unsupported file (should be ignored)
  await fs.writeFile(path.join(tmpDir, "style.css"), 'body {}');

  // .md is now in the shared canonical allow-list → collected (was excluded under the old 8-ext gate)
  await fs.writeFile(path.join(tmpDir, "README.md"), '# readme');

  // Additional canonical-list languages (beyond the old 8-ext gate)
  await fs.writeFile(path.join(tmpDir, "main.go"), 'package main');
  await fs.writeFile(path.join(tmpDir, "lib.rs"), 'pub fn x() {}');

  // Nested supported file
  await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
  await fs.writeFile(path.join(tmpDir, "src", "utils.ts"), 'export function noop() {}');

  // node_modules directory (should be skipped)
  await fs.mkdir(path.join(tmpDir, "node_modules", "pkg"), { recursive: true });
  await fs.writeFile(path.join(tmpDir, "node_modules", "pkg", "index.ts"), 'export {}');

  // dist directory (should be skipped)
  await fs.mkdir(path.join(tmpDir, "dist"), { recursive: true });
  await fs.writeFile(path.join(tmpDir, "dist", "bundle.js"), 'var x=1;');
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("collectFiles", () => {
  it("collects supported file types", async () => {
    const files = await collectFiles(tmpDir);
    const paths = files.map((f) => f.relativePath);
    expect(paths).toContain("index.ts");
    expect(paths).toContain("app.js");
    expect(paths).toContain("component.tsx");
    expect(paths).toContain(path.join("src", "utils.ts"));
  });

  it("excludes unsupported extensions", async () => {
    const files = await collectFiles(tmpDir);
    const paths = files.map((f) => f.relativePath);
    expect(paths).not.toContain("style.css");
  });

  it("collects the full shared canonical extension list (md/go/rs)", async () => {
    const files = await collectFiles(tmpDir);
    const paths = files.map((f) => f.relativePath);
    // .md, .go, .rs are in the shared canonical list; the old 8-ext gate dropped them.
    expect(paths).toContain("README.md");
    expect(paths).toContain("main.go");
    expect(paths).toContain("lib.rs");
  });

  it("skips node_modules and dist", async () => {
    const files = await collectFiles(tmpDir);
    const paths = files.map((f) => f.relativePath);
    expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
    expect(paths.some((p) => p.includes("dist"))).toBe(false);
  });

  it("includes file content", async () => {
    const files = await collectFiles(tmpDir);
    const indexFile = files.find((f) => f.relativePath === "index.ts");
    expect(indexFile).toBeDefined();
    expect(indexFile!.content).toBe('export const x = 1;');
  });

  it("returns empty array for non-existent directory", async () => {
    const files = await collectFiles(NONEXISTENT_DIR);
    expect(files).toEqual([]);
  });

  it("skips CocoaPods checkouts at any depth", async () => {
    const podsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-collector-pods-"));
    try {
      await fs.mkdir(path.join(podsRoot, "ios", "Pods", "Alamofire"), { recursive: true });
      await fs.writeFile(path.join(podsRoot, "ios", "Pods", "Alamofire", "Session.swift"), "class Session {}");
      await fs.mkdir(path.join(podsRoot, "Pods"), { recursive: true });
      await fs.writeFile(path.join(podsRoot, "Pods", "LICENSE.md"), "# license");
      await fs.writeFile(path.join(podsRoot, "ios", "App.swift"), "struct App {}");

      const paths = (await collectFiles(podsRoot)).map((f) => f.relativePath);
      expect(paths).toEqual(["ios/App.swift"]);
    } finally {
      await fs.rm(podsRoot, { recursive: true, force: true });
    }
  });
});

describe("collectFiles — MASSA_AI_INDEX_INCLUDE", () => {
  let includeRoot: string;
  const saved = process.env.MASSA_AI_INDEX_INCLUDE;

  beforeAll(async () => {
    includeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-collector-include-"));
    await fs.writeFile(path.join(includeRoot, "root.ts"), "export const root = 1;");
    await fs.mkdir(path.join(includeRoot, "app", "src"), { recursive: true });
    await fs.writeFile(path.join(includeRoot, "app", "src", "main.kt"), "fun main() {}");
    await fs.mkdir(path.join(includeRoot, "features", "promotion"), { recursive: true });
    await fs.writeFile(path.join(includeRoot, "features", "promotion", "promo.kt"), "class Promo");
    await fs.mkdir(path.join(includeRoot, "features", "other"), { recursive: true });
    await fs.writeFile(path.join(includeRoot, "features", "other", "other.kt"), "class Other");
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.MASSA_AI_INDEX_INCLUDE;
    else process.env.MASSA_AI_INDEX_INCLUDE = saved;
  });

  afterAll(async () => {
    await fs.rm(includeRoot, { recursive: true, force: true });
  });

  it("walks the whole tree when unset", async () => {
    delete process.env.MASSA_AI_INDEX_INCLUDE;
    const paths = (await collectFiles(includeRoot)).map((f) => f.relativePath).sort();
    expect(paths).toEqual(["app/src/main.kt", "features/other/other.kt", "features/promotion/promo.kt", "root.ts"]);
  });

  it("walks the whole tree when set to an empty list", async () => {
    process.env.MASSA_AI_INDEX_INCLUDE = " , ,";
    const paths = (await collectFiles(includeRoot)).map((f) => f.relativePath).sort();
    expect(paths).toEqual(["app/src/main.kt", "features/other/other.kt", "features/promotion/promo.kt", "root.ts"]);
  });

  it("walks only the listed dirs, keeping paths relative to the project root", async () => {
    process.env.MASSA_AI_INDEX_INCLUDE = " /app/ ,features/promotion";
    const paths = (await collectFiles(includeRoot)).map((f) => f.relativePath).sort();
    expect(paths).toEqual(["app/src/main.kt", "features/promotion/promo.kt"]);
  });

  it("ignores listed dirs that do not exist", async () => {
    process.env.MASSA_AI_INDEX_INCLUDE = "missing,app";
    const paths = (await collectFiles(includeRoot)).map((f) => f.relativePath);
    expect(paths).toEqual(["app/src/main.kt"]);
  });
});
