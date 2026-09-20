import "./env-setup"; // FIRST import — freezes scratch XDG_CONFIG_HOME before ../config-cli pins CONFIG_DIR
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readdirSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { getConfigPath } from "@massa-ai/shared/config";
import { INFERENCE_PROVIDERS } from "@massa-ai/shared/inference-providers";
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

  test("init --lmstudio", async () => {
    const r = await captureConsole(() => runCli(["init", "--lmstudio"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("LM Studio");
    const show = await captureConsole(() => runCli(["show"]));
    expect(show.out).toContain("lmstudio");
    const config = JSON.parse(show.out);
    expect(config.embedding.model).toBe(INFERENCE_PROVIDERS.lmstudio.defaultModels.embedding);
    expect(config.embedding.dimensions).toBe(
      INFERENCE_PROVIDERS.lmstudio.knownDimensions[INFERENCE_PROVIDERS.lmstudio.defaultModels.embedding],
    );
    // LIP-09/G4: init must also point llm.baseUrl at LM Studio, not Ollama.
    expect(config.llm.baseUrl).toBe("http://localhost:1234/v1");
  });

  test("init --lmstudio writes the LM Studio embedding id and width, not Ollama's (PDM-02 AC-2)", async () => {
    rmSync(getConfigPath(), { force: true });
    const r = await captureConsole(() => runCli(["init", "--lmstudio"]));
    expect(r.code).toBe(0);
    const show = await captureConsole(() => runCli(["show"]));
    const config = JSON.parse(show.out);
    expect(config.embedding.model).toBe(INFERENCE_PROVIDERS.lmstudio.defaultModels.embedding);
    expect(config.embedding.dimensions).toBe(
      INFERENCE_PROVIDERS.lmstudio.knownDimensions[INFERENCE_PROVIDERS.lmstudio.defaultModels.embedding],
    );
    expect(config.embedding.model).not.toBe(INFERENCE_PROVIDERS.ollama.defaultModels.embedding);
  });

  test("init --lmstudio writes the LM Studio instruct/coding trio, not Ollama's (PDM-02 AC-2)", async () => {
    // The live defect measured on 8ea21839: init --lmstudio wrote an LM
    // Studio baseUrl next to Ollama's model/codeModel tags. baseUrl, model,
    // and codeModel must all name the same provider. CONFIG_DIR is frozen
    // process-wide (see env-setup.ts), so this suite's config.json is shared
    // across every test — remove it first so this assertion is not
    // satisfied by a leftover write from an earlier test.
    rmSync(getConfigPath(), { force: true });
    const r = await captureConsole(() => runCli(["init", "--lmstudio"]));
    expect(r.code).toBe(0);
    const show = await captureConsole(() => runCli(["show"]));
    const config = JSON.parse(show.out);
    expect(config.llm.baseUrl).toBe(INFERENCE_PROVIDERS.lmstudio.defaultLlmBaseUrl);
    expect(config.llm.model).toBe(INFERENCE_PROVIDERS.lmstudio.defaultModels.instruct);
    expect(config.llm.codeModel).toBe(INFERENCE_PROVIDERS.lmstudio.defaultModels.coding);
    expect(config.llm.model).not.toBe(INFERENCE_PROVIDERS.ollama.defaultModels.instruct);
    expect(config.llm.codeModel).not.toBe(INFERENCE_PROVIDERS.ollama.defaultModels.coding);
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

  test("use ollama defaults write the provider's embedding pair (PDM-02 AC-2)", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "ollama"]));
    expect(r.code).toBe(0);
    const show = await captureConsole(() => runCli(["show"]));
    const config = JSON.parse(show.out);
    expect(config.embedding.model).toBe(INFERENCE_PROVIDERS.ollama.defaultModels.embedding);
    expect(config.embedding.dimensions).toBe(
      INFERENCE_PROVIDERS.ollama.knownDimensions[INFERENCE_PROVIDERS.ollama.defaultModels.embedding],
    );
    expect(config.embedding.model).not.toBe(INFERENCE_PROVIDERS.lmstudio.defaultModels.embedding);
  });

  test("use lmstudio defaults write the provider's embedding pair (PDM-02 AC-2)", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "lmstudio"]));
    expect(r.code).toBe(0);
    const show = await captureConsole(() => runCli(["show"]));
    const config = JSON.parse(show.out);
    expect(config.embedding.model).toBe(INFERENCE_PROVIDERS.lmstudio.defaultModels.embedding);
    expect(config.embedding.dimensions).toBe(
      INFERENCE_PROVIDERS.lmstudio.knownDimensions[INFERENCE_PROVIDERS.lmstudio.defaultModels.embedding],
    );
    expect(config.embedding.model).not.toBe(INFERENCE_PROVIDERS.ollama.defaultModels.embedding);
    // Assert the llm.baseUrl FIELD, not a substring of the whole `show`
    // output — embedding.baseURL alone already contains this URL, so a
    // substring check here would pass even if llm.baseUrl still pointed at
    // Ollama's :11434 (LIP-09/G4).
    expect(config.llm.baseUrl).toBe("http://localhost:1234/v1");
  });

  test("use lmstudio writes the LM Studio instruct/coding trio, not Ollama's (PDM-02 AC-2)", async () => {
    // Reset to a fresh, ollama-derived config first (see the init test above
    // for why the reset is required) so this test proves the "use" branch
    // itself writes the trio, not a leftover value from an earlier test.
    rmSync(getConfigPath(), { force: true });
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "lmstudio"]));
    expect(r.code).toBe(0);
    const show = await captureConsole(() => runCli(["show"]));
    const config = JSON.parse(show.out);
    expect(config.llm.baseUrl).toBe(INFERENCE_PROVIDERS.lmstudio.defaultLlmBaseUrl);
    expect(config.llm.model).toBe(INFERENCE_PROVIDERS.lmstudio.defaultModels.instruct);
    expect(config.llm.codeModel).toBe(INFERENCE_PROVIDERS.lmstudio.defaultModels.coding);
    expect(config.llm.model).not.toBe(INFERENCE_PROVIDERS.ollama.defaultModels.instruct);
    expect(config.llm.codeModel).not.toBe(INFERENCE_PROVIDERS.ollama.defaultModels.coding);
  });

  test("use google with api-key", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "google", "--api-key", "k"]));
    expect(r.code).toBe(0);
  });

  test("use google without api-key → exit 1", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "google"]));
    expect(r.code).toBe(1);
  });

  test("use cohere with api-key", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "cohere", "--api-key", "k"]));
    expect(r.code).toBe(0);
  });

  test("use cohere without api-key → exit 1", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "cohere"]));
    expect(r.code).toBe(1);
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
