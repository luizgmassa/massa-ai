import { describe, test, expect } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * APR spec R1 — the flush-before-stop race is untestable with stubbed seams
 * by construction (the stubs never stop a real listener). This spawns a real
 * child server with REAL lifecycle seams (supervised mode: drain + exit 0),
 * fires a real HTTP restart, and asserts the client received the complete
 * JSON body + content-type (AC-8) before the child died — under artificial
 * event-loop load, three iterations.
 *
 * The probe lives under node_modules/.massa-restart-e2e-* so its bare
 * `elysia` import resolves against the repo tree (Bun resolves specifiers
 * from the script's location, not the cwd).
 */
const REPO_ROOT = path.resolve(import.meta.dir, "../../../..");

const PROBE = `
import { Elysia } from "elysia";
import { node } from "@elysiajs/node";
import { restartRoutes } from ${JSON.stringify(path.join(REPO_ROOT, "apps/tools-api/src/routes/restart.ts"))};
import { setServerStopper } from ${JSON.stringify(path.join(REPO_ROOT, "apps/tools-api/src/lifecycle.ts"))};

process.env.MASSA_AI_SUPERVISED = "1";
delete process.env.MASSA_AI_DEV_WATCH;

// Parent picks the port (env) — the node adapter echoes 0 for ephemeral
// binds instead of the real port, so listen(0) is not discoverable here.
// The stopper is the callback server's stop(): app.stop() throws under the
// node adapter (dispatches to web-standard's stop).
const app = new Elysia({ adapter: node() }).use(restartRoutes);
app.listen(Number(process.env.PROBE_PORT), (server) => {
  setServerStopper(() => void server.stop());
  console.log("READY");
});
// Artificial event-loop load: the race is only visible under congestion.
setInterval(() => { for (let i = 0; i < 1e5; i++); }, 1);
`;

describe("restart flush-before-stop (real process, real socket)", () => {
  test("client holds the full JSON body before the supervised exit lands", async () => {
    const dir = await fs.mkdtemp(path.join(REPO_ROOT, "node_modules", ".massa-restart-e2e-"));
    const probePath = path.join(dir, "probe.ts");
    await fs.writeFile(probePath, PROBE);

    try {
      for (let i = 0; i < 3; i++) {
        const port = 34100 + Math.floor(Math.random() * 400) + i;
        const proc = Bun.spawn([process.execPath, probePath], {
          cwd: REPO_ROOT,
          env: { ...process.env, PROBE_PORT: String(port) },
          stdout: "pipe",
          stderr: "pipe",
        });
        try {
          const reader = proc.stdout.getReader();
          const { value } = await reader.read();
          reader.releaseLock();
          expect(new TextDecoder().decode(value)).toContain("READY");

          const res = await fetch(`http://localhost:${port}/api/v1/system/restart`, {
            method: "POST",
          });
          expect(res.status).toBe(200);
          expect(res.headers.get("content-type") ?? "").toContain("application/json");
          // .json() throws on a truncated body — this IS the race assertion.
          const body = (await res.json()) as Record<string, unknown>;
          expect(body).toEqual({ success: true, restarting: true, mode: "supervised" });

          const exitCode = await proc.exited;
          expect(exitCode).toBe(0);
        } finally {
          // A mid-iteration assertion failure must not leave a port-bound,
          // busy-looping child behind (the dangling-process flake class).
          proc.kill();
        }
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
