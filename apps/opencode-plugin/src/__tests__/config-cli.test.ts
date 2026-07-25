import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { runCli, parseOptions } from "../config-cli";

const BASE_TMP = tmpdir();
const origXdg = process.env.XDG_CONFIG_HOME;
let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(path.join(BASE_TMP, "opccfg-"));
  process.env.XDG_CONFIG_HOME = tmpHome;
});

afterEach(() => {
  if (origXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = origXdg;
  rmSync(tmpHome, { recursive: true, force: true });
});

function captureConsole(fn: () => Promise<number>): { code: number; out: string; err: string } {
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

describe("parseOptions (opencode)", () => {
  test("parses value flag + boolean flag", () => {
    expect(parseOptions(["--model", "x", "--project"])).toEqual({ model: "x", project: true });
  });
});

describe("opencode config-cli runCli", () => {
  test("help / no command → exit 0", async () => {
    const r = await captureConsole(() => runCli([]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("massa-ai-config");
  });

  test("init --ollama", async () => {
    const r = await captureConsole(() => runCli(["init", "--ollama"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("Ollama");
  });

  test("init --mistral <key>", async () => {
    const r = await captureConsole(() => runCli(["init", "--mistral", "mk"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("Mistral");
  });

  test("init --openai <key>", async () => {
    const r = await captureConsole(() => runCli(["init", "--openai", "ok"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("OpenAI");
  });

  test("path", async () => {
    const r = await captureConsole(() => runCli(["path"]));
    expect(r.code).toBe(0);
  });

  test("show after init", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["show"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("embedding");
  });

  test("set", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["set", "embedding.dimensions", "999"]));
    expect(r.code).toBe(0);
  });

  test("set missing args → exit 1", async () => {
    const r = await captureConsole(() => runCli(["set"]));
    expect(r.code).toBe(1);
  });

  test("use ollama --model", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "ollama", "--model", "nomic"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("nomic");
  });

  test("use mistral --api-key", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "mistral", "--api-key", "k"]));
    expect(r.code).toBe(0);
  });

  test("use mistral without api-key → exit 1", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "mistral"]));
    expect(r.code).toBe(1);
  });

  test("use openai --api-key", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "openai", "--api-key", "k"]));
    expect(r.code).toBe(0);
  });

  test("use openai without api-key → exit 1", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "openai"]));
    expect(r.code).toBe(1);
  });

  test("use invalid provider → exit 1", async () => {
    const r = await captureConsole(() => runCli(["use", "bogus"]));
    expect(r.code).toBe(1);
  });

  test("agents install --user copies massa-ai agents", async () => {
    const r = await captureConsole(() => runCli(["agents", "install", "--user"]));
    expect(r.code).toBe(0);
    // Agents written to XDG_CONFIG_HOME/opencode/agents/
    const agentsDir = path.join(tmpHome, "opencode", "agents");
    const files = readdirSync(agentsDir).filter((f) => f.startsWith("massa-ai-"));
    expect(files.length).toBeGreaterThan(0);
  });

  test("agents install --project copies to ./.opencode/agents", async () => {
    const projectTmp = mkdtempSync(path.join(BASE_TMP, "proj-"));
    const prevCwd = process.cwd();
    process.chdir(projectTmp);
    try {
      const r = await captureConsole(() => runCli(["agents", "install", "--project"]));
      expect(r.code).toBe(0);
      const agentsDir = path.join(projectTmp, ".opencode", "agents");
      const files = readdirSync(agentsDir).filter((f) => f.startsWith("massa-ai-"));
      expect(files.length).toBeGreaterThan(0);
    } finally {
      process.chdir(prevCwd);
      rmSync(projectTmp, { recursive: true, force: true });
    }
  });

  test("agents uninstall removes owned files + tolerates missing dir", async () => {
    // First install
    await captureConsole(() => runCli(["agents", "install", "--user"]));
    // Then uninstall
    const r = await captureConsole(() => runCli(["agents", "uninstall", "--user"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("removed");
  });

  test("agents uninstall on nonexistent dir (ENOENT tolerated) → exit 0", async () => {
    const r = await captureConsole(() => runCli(["agents", "uninstall", "--user"]));
    expect(r.code).toBe(0);
  });

  test("agents with invalid subcommand → exit 1", async () => {
    const r = await captureConsole(() => runCli(["agents", "bogus"]));
    expect(r.code).toBe(1);
  });

  test("unknown command → exit 1", async () => {
    const r = await captureConsole(() => runCli(["frobnicate"]));
    expect(r.code).toBe(1);
    expect(r.err).toContain("Unknown command");
  });
});
