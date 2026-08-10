import { describe, test, expect } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Port exclusivity — `@elysiajs/node` defaults `reusePort` to TRUE, so a bare
 * `app.listen(PORT, cb)` binds a SECOND process over a live server with no
 * error: both listen callbacks fire, both PIDs show in `lsof -iTCP:<port>`,
 * and macOS routes every request to the FIRST-bound socket. A restarted API
 * then serves nothing while a stale process answers forever.
 *
 * That is untestable in-process (one process cannot race its own bind the way
 * two do), so this spawns two real children against one real port. The probe
 * lives under node_modules/.massa-port-excl-* so its bare `elysia` import
 * resolves against the repo tree — Bun resolves specifiers from the script's
 * location, not the cwd.
 */
const REPO_ROOT = path.resolve(import.meta.dir, "../../..");

/** `OPTS` is interpolated so both arms run the SAME probe, differing only in
 *  the listen options — that is the discrimination sensor for this fix. */
const probeSource = (opts: string) => `
import { Elysia } from "elysia";
import { node } from "@elysiajs/node";

const TAG = process.env.PROBE_TAG;
const app = new Elysia({ adapter: node() }).get("/who", () => TAG);
try {
  app.listen(${opts}, () => console.log("LISTENING"));
} catch (error) {
  console.log("FAILED:" + (error?.code ?? String(error)));
  process.exit(9);
}
process.on("uncaughtException", (error) => {
  console.log("FAILED:" + (error?.code ?? error.message));
  process.exit(9);
});
setTimeout(() => process.exit(0), 15_000);
`;

interface ProbeRun {
  readonly first: string;
  readonly second: string;
  readonly secondExit: number;
  readonly who: string | null;
}

/** Boots two children on one port and reports what each did. */
async function raceTwoBinds(opts: string, port: number): Promise<ProbeRun> {
  const dir = await fs.mkdtemp(path.join(REPO_ROOT, "node_modules", ".massa-port-excl-"));
  const probePath = path.join(dir, "probe.ts");
  await fs.writeFile(probePath, probeSource(opts.replace("__PORT__", String(port))));

  const spawn = (tag: string) =>
    Bun.spawn([process.execPath, probePath], {
      cwd: REPO_ROOT,
      env: { ...process.env, PROBE_TAG: tag },
      stdout: "pipe",
      stderr: "pipe",
    });

  const readLine = async (proc: Bun.Subprocess): Promise<string> => {
    const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
    const { value } = await reader.read();
    reader.releaseLock();
    return new TextDecoder().decode(value ?? new Uint8Array()).trim();
  };

  const a = spawn("A");
  try {
    const first = await readLine(a);
    const b = spawn("B");
    try {
      const second = await readLine(b);
      const secondExit = second.startsWith("FAILED") ? await b.exited : -1;
      let who: string | null = null;
      try {
        who = await (await fetch(`http://localhost:${port}/who`)).text();
      } catch {
        who = null;
      }
      return { first, second, secondExit, who };
    } finally {
      b.kill();
    }
  } finally {
    // A mid-test assertion failure must not leave a port-bound child behind
    // (the dangling-process flake class).
    a.kill();
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("port exclusivity (two real processes, one real port)", () => {
  test("reusePort:false makes the second bind fail EADDRINUSE", async () => {
    const port = 34600 + Math.floor(Math.random() * 300);
    const run = await raceTwoBinds(`{ port: __PORT__, reusePort: false }`, port);

    expect(run.first).toBe("LISTENING");
    expect(run.second).toBe("FAILED:EADDRINUSE");
    expect(run.secondExit).toBe(9);
    // The survivor is the original server, still serving.
    expect(run.who).toBe("A");
  }, 60_000);

  test("without the option the adapter permits a silent duplicate bind", async () => {
    // Characterization of the defect this fix works around. A RED here is
    // informative, not a regression: it means @elysiajs/node changed its
    // `reusePort` default and the workaround above can be reconsidered.
    const port = 34950 + Math.floor(Math.random() * 300);
    const run = await raceTwoBinds(`__PORT__`, port);

    expect(run.first).toBe("LISTENING");
    expect(run.second).toBe("LISTENING");
  }, 60_000);

  test("index.ts passes reusePort:false at its listen call site", async () => {
    // A method-level proof says nothing about the wiring: the two tests above
    // pass even if index.ts never adopts the option.
    const source = await fs.readFile(path.join(REPO_ROOT, "apps/tools-api/src/index.ts"), "utf8");
    // `[^}]` not `[^)]`: the options object contains `Number(PORT)`, so a
    // paren-terminated match ends before ever reaching `reusePort`.
    const call = source.match(/app\.listen\((\{[^}]*\})/s);
    expect(call).not.toBeNull();
    expect(call?.[1]).toContain("reusePort: false");
  });
});
