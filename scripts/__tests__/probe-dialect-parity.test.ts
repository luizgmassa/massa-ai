/**
 * LIP-03 (bash half) — the shell probes must agree with `probeProvider`.
 *
 * The defect this closes: every installer probe used to read the HTTP *status*
 * (`curl -sf .../api/tags`, and at validate-vscode-integration.sh not even
 * `-f`), while LM Studio answers **200** with `{"error":"Unexpected endpoint or
 * method. (GET /api/tags)"}` for every endpoint it does not implement. A
 * status-only probe therefore reports a healthy Ollama on a machine that is
 * running LM Studio.
 *
 * Why the bash function exists at all, rather than a `bun` call: `install.sh`
 * runs under `curl | bash` with **no checkout** — `install_docker()` probes
 * after only `preflight_docker`, so there is no `scripts/` tree and no
 * `node_modules` to import `packages/core/src/kernel/inference-probe.ts` from.
 * Bash cannot import the TypeScript, so the discrimination rule is mirrored,
 * and this file is the gate that keeps the mirror honest.
 *
 * Three tiers:
 *
 *  Tier 1 (identity)   — the function is present in all four scripts and every
 *                        copy is byte-identical, so a fix applied to one copy
 *                        cannot silently leave the other three behind.
 *  Tier 2 (verdicts)   — the same recorded fixture bodies are served to
 *                        `probeProvider` and to the bash function over one real
 *                        HTTP server, and the two verdicts must match.
 *  Tier 3 (endpoints)  — the model-listing path is `inference-probe.ts`'s
 *                        private concern (`LIST_MODELS_PATH`, unexported). The
 *                        bash literal is never compared against a second copy
 *                        of that map; it is compared against the path the
 *                        probe **actually requests**, observed on the server.
 *                        A drift in either direction is red.
 *
 *  Tier 4 (completeness) — no `/api/tags` may appear in an `if`/`while`/`elif`
 *                        condition in the four scripts: that shape *is* the
 *                        status-trusting probe, and a sixth one added later
 *                        must fail here rather than ship.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INFERENCE_PROVIDERS } from "@massa-ai/shared/inference-providers";
import { probeProvider } from "../../packages/core/src/kernel/inference-probe.js";
import fixtures from "../../packages/core/src/__tests__/fixtures/inference-probe-bodies.json";

const ROOT = join(import.meta.dir, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const SCRIPTS = [
  "install.sh",
  "scripts/setup-local-first.sh",
  "scripts/ensure-ollama.sh",
  "scripts/validate-vscode-integration.sh",
] as const;

const FUNC_RE = /^massa_ai_probe_provider\(\) \{\n[\s\S]*?^\}$/m;

function extractFunction(file: string): string {
  const match = FUNC_RE.exec(read(file));
  if (!match) {
    throw new Error(
      `${file}: massa_ai_probe_provider not found — the probe was removed or ` +
        "its column-0 shape changed, which also breaks the copy-identity check",
    );
  }
  return match[0];
}

/** One HTTP server standing in for a provider, recording what was requested. */
function serveBody(body: string, status: number) {
  const seen: string[] = [];
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      seen.push(new URL(req.url).pathname);
      return new Response(body, {
        status,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return { server, seen, port: server.port };
}

// Async on purpose: `Bun.spawnSync` blocks the event loop, so the in-process
// `Bun.serve` above could never answer the curl the child makes — every case
// would read "unreachable" on the bash side and the parity check would be
// measuring a deadlock rather than the probe.
async function runBash(
  func: string,
  baseUrl: string,
  provider: string,
): Promise<boolean> {
  const proc = Bun.spawn(
    ["bash", "-c", `${func}\nmassa_ai_probe_provider "$1" "$2"`, "_", baseUrl, provider],
    { stdout: "ignore", stderr: "ignore" },
  );
  return (await proc.exited) === 0;
}

describe("probe dialect parity — bash mirrors probeProvider", () => {
  test("Tier 1: every copy of massa_ai_probe_provider is byte-identical", () => {
    const bodies = SCRIPTS.map((f) => [f, extractFunction(f)] as const);
    console.log(
      `[parity] copies found: ${bodies.length} (${bodies.map(([f]) => f).join(", ")})`,
    );
    expect(bodies.length).toBe(4);
    const reference = bodies[0]![1];
    for (const [file, body] of bodies) {
      expect(`${file}: ${body}`).toBe(`${file}: ${reference}`);
    }
  });

  test("Tier 1: the extracted function is valid bash on its own", () => {
    for (const file of SCRIPTS) {
      const proc = Bun.spawnSync(["bash", "-n"], {
        stdin: Buffer.from(extractFunction(file)),
      });
      expect(`${file} exit ${proc.exitCode}`).toBe(`${file} exit 0`);
    }
  });

  // status is part of the case on purpose: probeProvider never reads it, so a
  // `-f` reintroduced into the bash copy turns row 5 and 6 red.
  const cases: Array<{
    name: string;
    body: unknown;
    status: number;
    provider: "ollama" | "lmstudio";
    expected: boolean;
  }> = [
    {
      name: "LM Studio's 200 error body against the ollama probe",
      body: fixtures.lmStudioUnknownEndpointError,
      status: 200,
      provider: "ollama",
      expected: false,
    },
    {
      name: "LM Studio's 200 error body against the lmstudio probe",
      body: fixtures.lmStudioUnknownEndpointError,
      status: 200,
      provider: "lmstudio",
      expected: false,
    },
    {
      name: "the lmstudio probe accepts {data:[...]}",
      body: fixtures.lmStudioModelList,
      status: 200,
      provider: "lmstudio",
      expected: true,
    },
    {
      name: "the lmstudio probe rejects the ollama {models:[...]} shape",
      body: fixtures.ollamaModelList,
      status: 200,
      provider: "lmstudio",
      expected: false,
    },
    {
      name: "the ollama probe accepts {models:[...]}",
      body: fixtures.ollamaModelList,
      status: 200,
      provider: "ollama",
      expected: true,
    },
    {
      name: "the ollama probe rejects the lmstudio {data:[...]} shape",
      body: fixtures.lmStudioModelList,
      status: 200,
      provider: "ollama",
      expected: false,
    },
    {
      name: "an empty model list is still reachable",
      body: { models: [] },
      status: 200,
      provider: "ollama",
      expected: true,
    },
    {
      name: "a 500 carrying a valid model list is reachable (status is not read)",
      body: fixtures.ollamaModelList,
      status: 500,
      provider: "ollama",
      expected: true,
    },
    {
      name: "a non-JSON body is not reachable",
      body: "<html>not json</html>",
      status: 200,
      provider: "ollama",
      expected: false,
    },
  ];

  for (const c of cases) {
    test(`Tier 2: ${c.name}`, async () => {
      const raw = typeof c.body === "string" ? c.body : JSON.stringify(c.body);
      const { server, seen, port } = serveBody(raw, c.status);
      try {
        const spec = INFERENCE_PROVIDERS[c.provider];
        // Same base URL both halves; the lmstudio default carries a `/v1`
        // prefix that `new URL(absolute, base)` discards, so the bash side has
        // to discard it too or it would request /v1/v1/models.
        const baseUrl =
          c.provider === "lmstudio"
            ? `http://localhost:${port}/v1`
            : `http://localhost:${port}`;

        const ts = await probeProvider(spec, baseUrl);
        const tsSeen = [...seen];
        seen.length = 0;
        const sh = await runBash(extractFunction(SCRIPTS[0]), baseUrl, c.provider);

        expect(`ts=${ts.reachable} bash=${sh}`).toBe(
          `ts=${c.expected} bash=${c.expected}`,
        );
        // Tier 3, per case: both halves asked the same server for the same path.
        expect(`bash ${seen.join(",")}`).toBe(`bash ${tsSeen.join(",")}`);
      } finally {
        server.stop(true);
      }
    });
  }

  test("Tier 3: the bash endpoint literals equal the paths probeProvider requests", async () => {
    const func = extractFunction(SCRIPTS[0]);
    const observed: Record<string, { ts: string[]; bash: string[] }> = {};
    for (const provider of ["ollama", "lmstudio"] as const) {
      const { server, seen, port } = serveBody(
        JSON.stringify(fixtures.ollamaModelList),
        200,
      );
      try {
        const baseUrl =
          provider === "lmstudio"
            ? `http://localhost:${port}/v1`
            : `http://localhost:${port}`;
        await probeProvider(INFERENCE_PROVIDERS[provider], baseUrl);
        const ts = [...seen];
        seen.length = 0;
        await runBash(func, baseUrl, provider);
        observed[provider] = { ts, bash: [...seen] };
      } finally {
        server.stop(true);
      }
    }
    console.log(`[parity] requested paths: ${JSON.stringify(observed)}`);
    expect(observed.ollama!.bash).toEqual(observed.ollama!.ts);
    expect(observed.lmstudio!.bash).toEqual(observed.lmstudio!.ts);
    // A probe that requested nothing would make the two sides agree vacuously.
    expect(observed.ollama!.ts.length).toBe(1);
    expect(observed.lmstudio!.ts.length).toBe(1);
    expect(observed.ollama!.ts[0]).not.toBe(observed.lmstudio!.ts[0]);
  });

  test("Tier 2: an unreachable endpoint is false on both sides", async () => {
    // Port 1 is reserved and never listening; both halves must report failure
    // rather than hang or throw.
    const baseUrl = "http://127.0.0.1:1";
    const ts = await probeProvider(INFERENCE_PROVIDERS.ollama, baseUrl, 2000);
    const sh = await runBash(extractFunction(SCRIPTS[0]), baseUrl, "ollama");
    expect(`ts=${ts.reachable} bash=${sh}`).toBe("ts=false bash=false");
  }, 15_000);

  test("Tier 4: no /api/tags is left inside an if/while/elif condition", () => {
    const offenders: string[] = [];
    for (const file of SCRIPTS) {
      read(file)
        .split("\n")
        .forEach((line, i) => {
          if (/^\s*(?:if|elif|while)\s+curl\b[^\n]*\/api\/tags/.test(line)) {
            offenders.push(`${file}:${i + 1}: ${line.trim()}`);
          }
        });
    }
    console.log(
      `[parity] scanned ${SCRIPTS.length} scripts for status-trusting probes; ` +
        `offenders: ${offenders.length}`,
    );
    expect(offenders).toEqual([]);
  });
});
