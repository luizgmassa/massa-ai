import { TEST_CONFIG_HOME } from "./env-setup.js"; // FIRST import — freezes scratch XDG_CONFIG_HOME before ../config-cli.js pins CONFIG_DIR
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { getConfigPath } from "@massa-ai/shared/config";
import { INFERENCE_PROVIDERS } from "@massa-ai/shared/inference-providers";
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

  test("init --lmstudio → lmstudio config", async () => {
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
    // process-wide (see env-setup.js), so this suite's config.json is shared
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

  test("use ollama --base-url writes an ollama-shaped embedding/llm base pair (G2)", async () => {
    // Ollama's two declared base URLs differ by `/v1`: an explicit
    // --base-url must reach embedding.baseURL unchanged and reach
    // llm.baseUrl with that same `/v1` suffix re-applied — not the raw flag
    // value copied onto both fields (the round-2 regression).
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() =>
      runCli(["use", "ollama", "--base-url", "http://h:11434"]),
    );
    expect(r.code).toBe(0);
    const show = await captureConsole(() => runCli(["show"]));
    const config = JSON.parse(show.out);
    expect(config.embedding.baseURL).toBe("http://h:11434");
    expect(config.llm.baseUrl).toBe("http://h:11434/v1");
  });

  test("use ollama defaults write the provider's embedding pair (EDC-03, PDM-02 AC-2)", async () => {
    // The written pair must match the default model's real output width —
    // a mismatched pair shipped a config that refuseOnDimensionMismatch
    // rejects at first embed.
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

  test("use ollama after init --lmstudio writes the ollama instruct/coding trio, not LM Studio's (G0/PDM-02 AC-2)", async () => {
    // The switch-away case that exposed G0: a fresh `use ollama` on an
    // already-ollama config can't observe the defect, since the trio was
    // already ollama's. Start from an lmstudio config and switch to ollama.
    rmSync(getConfigPath(), { force: true });
    await captureConsole(() => runCli(["init", "--lmstudio"]));
    const r = await captureConsole(() => runCli(["use", "ollama"]));
    expect(r.code).toBe(0);
    const show = await captureConsole(() => runCli(["show"]));
    const config = JSON.parse(show.out);
    expect(config.llm.baseUrl).toBe(INFERENCE_PROVIDERS.ollama.defaultLlmBaseUrl);
    expect(config.llm.model).toBe(INFERENCE_PROVIDERS.ollama.defaultModels.instruct);
    expect(config.llm.codeModel).toBe(INFERENCE_PROVIDERS.ollama.defaultModels.coding);
    expect(config.llm.model).not.toBe(INFERENCE_PROVIDERS.lmstudio.defaultModels.instruct);
    expect(config.llm.codeModel).not.toBe(INFERENCE_PROVIDERS.lmstudio.defaultModels.coding);
    expect(config.llm.baseUrl).not.toBe(INFERENCE_PROVIDERS.lmstudio.defaultLlmBaseUrl);
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

  test("use lmstudio with model + base-url", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() =>
      runCli(["use", "lmstudio", "--model", "custom-model", "--base-url", "http://x:1234/v1"]),
    );
    expect(r.code).toBe(0);
    expect(r.out).toContain("custom-model");
  });

  test("use lmstudio --base-url writes an identical embedding/llm base pair (G2)", async () => {
    // LM Studio's two declared base URLs are byte-identical: an explicit
    // --base-url must reach both fields unchanged, with no suffix added.
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() =>
      runCli(["use", "lmstudio", "--base-url", "http://h:1234/v1"]),
    );
    expect(r.code).toBe(0);
    const show = await captureConsole(() => runCli(["show"]));
    const config = JSON.parse(show.out);
    expect(config.embedding.baseURL).toBe("http://h:1234/v1");
    expect(config.llm.baseUrl).toBe("http://h:1234/v1");
  });

  test("use google without api-key → exit 1", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "google"]));
    expect(r.code).toBe(1);
  });

  test("use google with api-key", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "google", "--api-key", "k"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("google");
  });

  test("use cohere without api-key → exit 1", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "cohere"]));
    expect(r.code).toBe(1);
  });

  test("use cohere with api-key", async () => {
    await captureConsole(() => runCli(["init"]));
    const r = await captureConsole(() => runCli(["use", "cohere", "--api-key", "k"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("cohere");
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

/**
 * Neither fact below is implied by the rest of this suite passing: before
 * ./env-setup.js existed, every case above was green while `runCli` wrote the
 * developer's real ~/.config/massa-ai/config.json. The `beforeEach` scratch dir
 * is set after the CONFIG_DIR freeze, so it redirects nothing.
 */
describe("env-setup import guard", () => {
  test("the pinned config path is env-setup's scratch dir, not the real home", () => {
    expect(getConfigPath()).toBe(path.join(TEST_CONFIG_HOME, "massa-ai", "config.json"));
  });

  test("./env-setup.js is this file's first import", () => {
    const source = readFileSync(import.meta.path, "utf8");
    const firstImportAt = source.search(/^import\b/m);
    const firstSpecifier = source.slice(firstImportAt).match(/["']([^"']+)["']/)?.[1];
    expect(firstSpecifier).toBe("./env-setup.js");
  });
});
