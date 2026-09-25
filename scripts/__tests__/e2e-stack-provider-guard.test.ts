import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const SCRIPT = path.resolve(import.meta.dir, "../e2e-stack.sh");
const stateDir = mkdtempSync(path.join(tmpdir(), "e2e-stack-provider-guard-"));
writeFileSync(path.join(stateDir, "state.env"), "provider=lmstudio\nprofile=default\napi_key=k\n");

afterAll(() => rmSync(stateDir, { recursive: true, force: true }));

function run(command: string, provider?: string) {
  const env: Record<string, string | undefined> = { ...process.env, MASSA_AI_E2E_STATE_DIR: stateDir };
  delete env.MASSA_AI_E2E_PROVIDER;
  delete env.MASSA_AI_E2E_LMSTUDIO_URL;
  if (provider) env.MASSA_AI_E2E_PROVIDER = provider;
  const proc = Bun.spawnSync(["bash", SCRIPT, command], { env: env as Record<string, string> });
  return { code: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

describe("e2e-stack.sh keeps the provider `up` recorded", () => {
  test("env follows the recorded provider", () => {
    const res = run("env");
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("export EMBEDDING_PROVIDER=lmstudio");
  });

  test("env refuses a different provider", () => {
    const res = run("env", "ollama");
    expect(res.code).toBe(2);
    expect(res.stdout).toBe("");
    expect(res.stderr).toContain("switching to ollama needs `up`");
  });

  test("restart-api refuses a different provider before touching any process", () => {
    const res = run("restart-api", "ollama");
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("switching to ollama needs `up`");
    expect(res.stderr).not.toContain("shared stack before");
  });
});
