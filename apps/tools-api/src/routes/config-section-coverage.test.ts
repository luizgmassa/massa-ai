/**
 * Every section the Admin Portal's Config tab renders must resolve to a value.
 *
 * `config.test.ts` mocks `loadConfig`, so it proves the route's shape and can
 * see nothing about the merge underneath it. That is exactly where this
 * defect lived: `GET /api/v1/config` returned fourteen of the portal's sixteen
 * sections, and the Scheduler and Capture Policy tabs rendered with no fields
 * while both were in force at runtime.
 *
 * The population comes from `app.js` — the artifact being audited — not from a
 * list written here. A section added to the portal with no default therefore
 * fails this gate on the commit that adds it, instead of shipping as a blank
 * tab.
 *
 * The child process is not ceremony: `CONFIG_DIR` is a module-level const in
 * `config-loader.ts`, frozen at import, so `loadConfig()` in this process
 * would read the developer's real ~/.config/massa-ai/config.json and report
 * whatever they happen to have configured.
 */

import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "../../../..");
/** `CONFIG_SECTIONS` moved out of app.js into the Config tab's own module when
 *  the web UI bundle was split; app.js is now a barrel and carries no section
 *  table. Only the path changed — the regex and the assertions are unchanged. */
const CONFIG_VIEW_JS = path.join(REPO_ROOT, "apps/web-ui/src/static/views/config.js");

/** The `key:` of every entry in the portal's Config-tab section table. */
function portalSectionKeys(): string[] {
  const source = fs.readFileSync(CONFIG_VIEW_JS, "utf8");
  const keys = [...source.matchAll(/^\s*key:\s*"([^"]+)",/gm)].map((m) => m[1]);
  return [...new Set(keys)];
}

/** `loadConfig()` under a scratch XDG home, with no config.json at all. */
function loadConfigInScratchHome(configJson?: string): Record<string, unknown> {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "massa-cfg-cov-"));
  try {
    if (configJson !== undefined) {
      const dir = path.join(scratch, "massa-ai");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "config.json"), configJson);
    }
    const script = path.join(scratch, "dump.ts");
    fs.writeFileSync(
      script,
      `const { loadConfig } = await import(${JSON.stringify(path.join(REPO_ROOT, "packages/shared/src/config/config-loader.ts"))});\n` +
        `process.stdout.write(JSON.stringify(loadConfig()));\n`,
    );
    const proc = Bun.spawnSync(["bun", script], {
      cwd: REPO_ROOT,
      env: { ...process.env, XDG_CONFIG_HOME: scratch },
    });
    expect(proc.stderr.toString()).not.toContain("error:");
    expect(proc.exitCode).toBe(0);
    return JSON.parse(proc.stdout.toString()) as Record<string, unknown>;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

describe("Admin Portal config sections all resolve", () => {
  test("the section list is non-trivial", () => {
    // A regex that silently stopped matching would make every assertion below
    // pass over an empty population.
    const keys = portalSectionKeys();
    console.log(`[config-coverage] portal sections: ${keys.length} — ${keys.join(", ")}`);
    expect(keys.length).toBeGreaterThanOrEqual(16);
    expect(keys).toContain("scheduler");
    expect(keys).toContain("capturePolicy");
  });

  test("no portal section resolves to undefined on a fresh install", () => {
    const config = loadConfigInScratchHome();
    const missing = portalSectionKeys().filter((key) => config[key] === undefined);
    expect(missing).toEqual([]);
  });

  test("no portal section resolves to undefined against a real installer config", () => {
    // The installer writes a subset of sections; the defaults have to fill the
    // rest. This is the shape that actually shipped and produced the bug.
    const installerish = JSON.stringify({
      database: { url: "postgresql://massa_ai:massa_ai_password@localhost:5432/massa_ai" },
      security: { apiKey: "0".repeat(64) },
      embedding: { provider: "ollama", model: "qwen3-embedding:4b", dimensions: 2560 },
      llm: { enabled: true, model: "qwen2.5:7b-instruct" },
      hooks: { enabled: true },
    });
    const config = loadConfigInScratchHome(installerish);
    const missing = portalSectionKeys().filter((key) => config[key] === undefined);
    expect(missing).toEqual([]);
  });
});
