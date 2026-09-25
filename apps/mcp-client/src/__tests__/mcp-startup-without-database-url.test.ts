import { describe, test, expect } from "bun:test";
import { spawn } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const MCP_BIN = path.resolve(import.meta.dir, "../../dist/index.js");

const INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "startup-probe", version: "0" } },
});

function initializeWithoutDatabaseUrl(): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const home = mkdtempSync(path.join(tmpdir(), "massa-ai-mcp-no-db-"));
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, ".config") };
    delete env.DATABASE_URL;
    const proc = spawn("bun", [MCP_BIN], { stdio: ["pipe", "pipe", "pipe"], env });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      proc.kill();
      rmSync(home, { recursive: true, force: true });
      resolve({ stdout, stderr });
    };
    const timer = setTimeout(finish, 8000);

    proc.stdout?.on("data", (d) => {
      stdout += d.toString();
      if (stdout.includes("\n")) finish();
    });
    proc.stderr?.on("data", (d) => (stderr += d.toString()));
    proc.on("close", finish);
    proc.on("error", (err) => {
      settled = true;
      clearTimeout(timer);
      rmSync(home, { recursive: true, force: true });
      reject(err);
    });

    proc.stdin?.write(`${INITIALIZE}\n`);
  });
}

describe("MCP startup without DATABASE_URL", () => {
  test("answers initialize instead of crashing at module load", async () => {
    const { stdout, stderr } = await initializeWithoutDatabaseUrl();

    expect(stderr).not.toContain("DATABASE_URL is required");
    const firstLine = stdout.split("\n")[0] ?? "";
    expect(firstLine.length).toBeGreaterThan(0);
    const reply = JSON.parse(firstLine);
    expect(reply.id).toBe(1);
    expect(reply.result?.serverInfo?.name).toBe("massa-ai");
  }, 15_000);
});
