/**
 * Static-dir resolution against the REAL filesystem.
 *
 * web-ui-errors.test.ts mocks fs/promises so every candidate "exists" — it
 * cannot catch a candidate that points at a path which is simply wrong. These
 * tests stat real directories and drive the route from a cwd outside the repo,
 * which is the shape that produced `{"status":500,"error":"web ui static dir
 * not found"}` in a running server.
 */

import { describe, test, expect } from "bun:test";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { buildStaticDirCandidates } from "./web-ui.js";

// apps/tools-api/src/routes -> repo root
const REPO_ROOT = path.resolve(import.meta.dir, "../../../..");
const STATIC_DIR = path.join(REPO_ROOT, "apps/web-ui/src/static");

async function firstExisting(candidates: string[]): Promise<string | null> {
  for (const dir of candidates) {
    try {
      if ((await fs.stat(dir)).isDirectory()) return dir;
    } catch {
      /* try next */
    }
  }
  return null;
}

describe("buildStaticDirCandidates", () => {
  test("the web-ui static dir is actually present in the repo", async () => {
    const st = await fs.stat(STATIC_DIR);
    expect(st.isDirectory()).toBe(true);
    await fs.stat(path.join(STATIC_DIR, "index.html"));
  });

  test("resolves from the src layout with cwd outside the repo", async () => {
    const candidates = buildStaticDirCandidates(
      path.join(REPO_ROOT, "apps/tools-api/src/routes"),
      os.tmpdir(),
    );
    expect(await firstExisting(candidates)).toBe(STATIC_DIR);
  });

  test("resolves from the dist layout with cwd outside the repo", async () => {
    const candidates = buildStaticDirCandidates(
      path.join(REPO_ROOT, "apps/tools-api/dist"),
      os.tmpdir(),
    );
    expect(await firstExisting(candidates)).toBe(STATIC_DIR);
  });

  test("resolves from cwd alone when the module dir is unhelpful", async () => {
    const candidates = buildStaticDirCandidates("/nonexistent/module/dir", REPO_ROOT);
    expect(await firstExisting(candidates)).toBe(STATIC_DIR);
  });

  test("resolves when cwd is the tools-api package dir (turbo layout)", async () => {
    const candidates = buildStaticDirCandidates(
      path.join(REPO_ROOT, "apps/tools-api/src/routes"),
      path.join(REPO_ROOT, "apps/tools-api"),
    );
    expect(await firstExisting(candidates)).toBe(STATIC_DIR);
  });

  test("returns no existing dir when nothing is on disk", async () => {
    const candidates = buildStaticDirCandidates("/nonexistent/a/b", "/nonexistent/c/d");
    expect(candidates.length).toBeGreaterThan(0);
    expect(await firstExisting(candidates)).toBeNull();
  });

  test("candidate list is deduped", () => {
    const dir = path.join(REPO_ROOT, "apps/tools-api");
    const candidates = buildStaticDirCandidates(dir, dir);
    expect(new Set(candidates).size).toBe(candidates.length);
  });
});

describe("GET /ui from a cwd outside the repo", () => {
  test("serves the index.html shell (real fs, child process)", async () => {
    const routeModule = path.join(REPO_ROOT, "apps/tools-api/src/routes/web-ui.ts");
    // The probe imports the route module by absolute path (so its own "elysia"
    // import resolves against the repo's node_modules) and drives the Elysia
    // instance directly — the probe file itself lives outside the repo and has
    // no importable dependencies of its own.
    const script = `
      const { webUiRoutes } = await import(${JSON.stringify(routeModule)});
      const res = await webUiRoutes.handle(new Request("http://localhost/ui"));
      const body = await res.text();
      console.log(JSON.stringify({ status: res.status, body: body.slice(0, 120) }));
    `;
    const scriptPath = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), "web-ui-cwd-")),
      "probe.ts",
    );
    await fs.writeFile(scriptPath, script);

    // cwd deliberately outside the repo: the cwd walk cannot help here, so this
    // only passes if resolution works from the module's own directory.
    const proc = Bun.spawn([process.execPath, scriptPath], {
      cwd: os.tmpdir(),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;

    const line = stdout.trim().split("\n").at(-1) ?? "";
    expect(line, `stdout=${stdout}\nstderr=${stderr}`).toContain('"status":200');
    const parsed = JSON.parse(line);
    expect(parsed.status).toBe(200);
    expect(parsed.body).toContain("<!DOCTYPE html>");
  }, 30_000);
});
