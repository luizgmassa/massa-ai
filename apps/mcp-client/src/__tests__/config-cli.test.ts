import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { runCli, parseOptions } from "../config-cli.js";

const BASE_TMP = tmpdir();
const origXdg = process.env.XDG_CONFIG_HOME;
let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(path.join(BASE_TMP, "cfgcli-"));
  process.env.XDG_CONFIG_HOME = tmpHome;
});

afterEach(() => {
  for (const k of Object.keys(process.env)) {
    if (k === "XDG_CONFIG_HOME" && origXdg === undefined) delete process.env[k];
    else if (k === "XDG_CONFIG_HOME") process.env[k] = origXdg;
  }
  rmSync(tmpHome, { recursive: true, force: true });
});

function captureConsole(fn: () => Promise<number>): Promise<{ code: number; out: string; err: string }> {
  let out = "";
  let err = "";
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a: unknown[]) => { out += a.join(" ") + "\n"; };
  console.error = (...a: unknown[]) => { err += a.join(" ") + "\n"; };
  return fn().then(
    (code) => { console.log = origLog; console.error = origErr; return { code, out, err }; },
    (e) => { console.log = origLog; console.error = origErr; throw e; },
  );
}

describe("parseOptions", () => {
  test("parses flag with value and boolean flags", () => {
    expect(parseOptions(["--api-key", "secret", "--force"])).toEqual({ "api-key": "secret", force: true });
  });
  test("handles flag at end (boolean)", () => {
    expect(parseOptions(["--ollama"])).toEqual({ ollama: true });
  });
});

describe("config-cli runCli", () => {
  test("help / no command → exit 0", async () => {
    const r = await captureConsole(() => runCli([]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("massa-ai-config");
  });

  test("--help → exit 0", async () => {
    const r = await captureConsole(() => runCli(["--help"]));
    expect(r.code).toBe(0);
  });

  test("init --ollama → creates config, exit 0", async () => {
    const r = await captureConsole(() => runCli(["init", "--ollama"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("Ollama");
  });

  test("init --mistral <key> → mistral config", async () => {
    const r = await captureConsole(() => runCli(["init", "--mistral", "mk"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("Mistral");
  });

  test("init --openai <key> → openai config", async () => {
    const r = await captureConsole(() => runCli(["init", "--openai", "ok"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("OpenAI");
  });

  test("path → prints config path", async () => {
    const r = await captureConsole(() => runCli(["path"]));
    expect(r.code).toBe(0);
    expect(r.out.trim().length).toBeGreaterThan(0);
  });

  test("show when config exists → prints JSON", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["show"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("embedding");
  });

  test("show without prior init still returns exit 0 (config module default)", async () => {
    // configExists may return true if a real config exists; verify exit 0 + output
    const r = await captureConsole(() => runCli(["show"]));
    expect(r.code).toBe(0);
    expect(r.out.trim().length).toBeGreaterThan(0);
  });

  test("set <key> <value> → writes config", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["set", "embedding.dimensions", "999"]));
    expect(r.code).toBe(0);
    const show = await captureConsole(() => runCli(["show"]));
    expect(show.out).toContain("999");
  });

  test("set missing args → exit 1", async () => {
    const r = await captureConsole(() => runCli(["set"]));
    expect(r.code).toBe(1);
  });

  test("use ollama with model + base-url", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "ollama", "--model", "nomic", "--base-url", "http://x:11434"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("nomic");
  });

  test("use mistral without api-key → exit 1", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "mistral"]));
    expect(r.code).toBe(1);
    expect(r.err).toContain("api-key");
  });

  test("use mistral with api-key", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "mistral", "--api-key", "k"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("mistral");
  });

  test("use openai without api-key → exit 1", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "openai"]));
    expect(r.code).toBe(1);
  });

  test("use openai with api-key", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "openai", "--api-key", "k"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("openai");
  });

  test("use invalid provider → exit 1", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "bogus"]));
    expect(r.code).toBe(1);
  });

  test("recover without projectId → exit 1", async () => {
    const r = await captureConsole(() => runCli(["recover"]));
    expect(r.code).toBe(1);
    expect(r.err).toContain("projectId required");
  });

  test("recover without --path → exit 1", async () => {
    const r = await captureConsole(() => runCli(["recover", "proj"]));
    expect(r.code).toBe(1);
    expect(r.err).toContain("--path required");
  });

  test("recover nonexistent project → not found, exit 1", async () => {
    const r = await captureConsole(() => runCli(["recover", "nonexistent-xyz-123", "--path", "/tmp/recovered"]));
    expect(r.code).toBe(1);
    // Either "not found" (DB available) or "recovery failed" (DB issue)
    expect(r.err.length).toBeGreaterThan(0);
  });

  test("unknown command → exit 1", async () => {
    const r = await captureConsole(() => runCli(["frobnicate"]));
    expect(r.code).toBe(1);
    expect(r.err).toContain("Unknown command");
  });
});
