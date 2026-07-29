/**
 * `security.allowedExtensions` is a user-settable override, not a constant.
 *
 * `DEFAULT_ALLOWED_EXTENSIONS`' doc comment has always claimed that "User
 * config (`security.allowedExtensions`) overrides this at runtime". It did
 * not. The assembled `security` block hardcoded `[...DEFAULT_ALLOWED_EXTENSIONS]`
 * and never consulted `fileConfig`, and the user-facing `MassaAiConfig.security`
 * type did not declare the field at all — so a value set in `config.json` was
 * parsed by `loadConfigSafe`, then dropped on the floor. `discover.ts` reads the
 * assembled value, so the entire override path was inert: the knob accepted
 * input and enforced nothing.
 *
 * The first test is the discriminating one — it is red on the old assembly and
 * green on the new. The default-fallback test is what stops the fix from being
 * "always read the file", which would break every install that omits the key.
 *
 * Resolution happens in a module-level object literal (`config/index.ts`), so
 * an in-process write lands after the value is frozen. Each case runs in a
 * subprocess via the established `isolated-config` harness.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import {
  makeIsolatedConfigHome,
  removeIsolatedConfigHome,
  runIsolated,
  type IsolatedConfigHome,
} from "./isolated-config";
import { DEFAULT_ALLOWED_EXTENSIONS } from "../index";

const CONFIG_INDEX = path.join(import.meta.dir, "..", "index.ts");

const CHILD = `
import { config } from ${JSON.stringify(CONFIG_INDEX)};
console.log(JSON.stringify(config.get("security").allowedExtensions));
`;

/** Write a `config.json` whose `security` block carries the given override. */
function writeConfig(home: IsolatedConfigHome, security: Record<string, unknown>): void {
  fs.mkdirSync(home.configDir, { recursive: true });
  fs.writeFileSync(home.configPath, JSON.stringify({ security }, null, 2));
}

function resolve(home: IsolatedConfigHome, name: string): string[] {
  const res = runIsolated(home, name, CHILD);
  expect(res.exitCode, `child failed:\n${res.stderr}`).toBe(0);
  return JSON.parse(res.stdout.trim().split("\n").pop() ?? "null") as string[];
}

describe("security.allowedExtensions reaches the assembled config", () => {
  let home: IsolatedConfigHome;

  beforeEach(() => {
    home = makeIsolatedConfigHome("massa-ai-allowed-ext-");
  });

  afterEach(() => {
    removeIsolatedConfigHome(home);
  });

  test("a config.json override replaces the default list", () => {
    writeConfig(home, { allowedExtensions: [".ts", ".kt"] });
    expect(resolve(home, "override")).toEqual([".ts", ".kt"]);
  }, 30_000);

  test("omitting the key falls back to DEFAULT_ALLOWED_EXTENSIONS", () => {
    writeConfig(home, { corsOrigins: [] });
    expect(resolve(home, "fallback")).toEqual([...DEFAULT_ALLOWED_EXTENSIONS]);
  }, 30_000);

  test("no config.json at all still yields the defaults", () => {
    expect(resolve(home, "no-file")).toEqual([...DEFAULT_ALLOWED_EXTENSIONS]);
  }, 30_000);

  /**
   * An empty allow-list is syntactically valid and semantically catastrophic:
   * the discovery glob would match nothing and indexing would report success
   * over zero files. Honouring it would rebuild the silent-zero failure one
   * layer up, inside the fix meant to remove it.
   */
  test("an empty array is refused at load time, not honoured", () => {
    writeConfig(home, { allowedExtensions: [] });
    const res = runIsolated(home, "empty", CHILD);
    expect(res.exitCode).not.toBe(0);
    expect(res.stderr).toContain("must not be empty");
  }, 30_000);

  test("an entry without a leading dot is refused at load time", () => {
    writeConfig(home, { allowedExtensions: ["ts"] });
    const res = runIsolated(home, "no-dot", CHILD);
    expect(res.exitCode).not.toBe(0);
    expect(res.stderr).toContain("dot-prefixed");
  }, 30_000);

  test("a non-array value is refused at load time", () => {
    writeConfig(home, { allowedExtensions: ".ts" });
    const res = runIsolated(home, "not-array", CHILD);
    expect(res.exitCode).not.toBe(0);
    expect(res.stderr).toContain("must be an array");
  }, 30_000);
});
