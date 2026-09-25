import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const SERVER = join(import.meta.dir, "..", "mlx-embedding-server.py");

const PRELUDE = `
import importlib.util, json, sys, threading, time, types

state = {"active": 0, "peak": 0, "chunks": [], "cleared": 0, "metal_cleared": 0}
lock = threading.Lock()

class _Result:
    def __init__(self, n):
        self.text_embeds = types.SimpleNamespace(tolist=lambda: [[0.0]] * n)

def _generate(model, tokenizer, texts):
    with lock:
        state["active"] += 1
        state["peak"] = max(state["peak"], state["active"])
        state["chunks"].append(len(texts))
    time.sleep(0.02)
    with lock:
        state["active"] -= 1
    return _Result(len(texts))

def _clear():
    state["cleared"] += 1

def _metal_clear():
    state["metal_cleared"] += 1

mlx = types.ModuleType("mlx")
core = types.ModuleType("mlx.core")
core.metal = types.SimpleNamespace(clear_cache=_metal_clear)
if WITH_TOP_LEVEL_CLEAR:
    core.clear_cache = _clear
mlx.core = core
emb = types.ModuleType("mlx_embeddings")
emb.generate = _generate
emb.load = lambda weights: ("model", "tokenizer")
sys.modules.update({"mlx": mlx, "mlx.core": core, "mlx_embeddings": emb})

spec = importlib.util.spec_from_file_location("mlx_embedding_server", SERVER)
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
`;

function runPython(body: string, opts: { topLevelClear?: boolean; env?: Record<string, string> } = {}) {
  const script = [
    `SERVER = ${JSON.stringify(SERVER)}`,
    `WITH_TOP_LEVEL_CLEAR = ${opts.topLevelClear === false ? "False" : "True"}`,
    PRELUDE,
    body,
  ].join("\n");
  const env: Record<string, string> = { ...(process.env as Record<string, string>), ...opts.env };
  if (!opts.env?.MASSA_AI_MLX_EMBED_MAX_TEXTS) delete env.MASSA_AI_MLX_EMBED_MAX_TEXTS;
  delete env.MASSA_AI_MLX_EMBED_CHUNK;
  const proc = Bun.spawnSync(["python3", "-c", script], { env });
  const stderr = proc.stderr.toString();
  expect({ exitCode: proc.exitCode, stderr: proc.exitCode === 0 ? "" : stderr }).toEqual({
    exitCode: 0,
    stderr: "",
  });
  return JSON.parse(proc.stdout.toString().trim().split("\n").pop()!);
}

describe("mlx-embedding-server", () => {
  test("embed chunks by CHUNK and releases the Metal cache once per call", () => {
    const out = runPython(`
vectors = server.embed(["t"] * 70)
print(json.dumps({"n": len(vectors), "chunks": state["chunks"], "cleared": state["cleared"], "metal": state["metal_cleared"]}))
`);
    expect(out).toEqual({ n: 70, chunks: [32, 32, 6], cleared: 1, metal: 0 });
  });

  test("falls back to mx.metal.clear_cache on MLX builds without mx.clear_cache", () => {
    const out = runPython(
      `
server.embed(["a", "b"])
print(json.dumps({"cleared": state["cleared"], "metal": state["metal_cleared"]}))
`,
      { topLevelClear: false },
    );
    expect(out).toEqual({ cleared: 0, metal: 1 });
  });

  test("concurrent embed calls never run generate() in parallel", () => {
    const out = runPython(`
threads = [threading.Thread(target=server.embed, args=(["t"] * 40,)) for _ in range(4)]
for t in threads: t.start()
for t in threads: t.join()
print(json.dumps({"peak": state["peak"], "calls": len(state["chunks"])}))
`);
    expect(out).toEqual({ peak: 1, calls: 8 });
  });

  const HTTP_PROBE = `
import http.client
from http.server import ThreadingHTTPServer
httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
def post(n):
    conn = http.client.HTTPConnection("127.0.0.1", httpd.server_address[1])
    conn.request("POST", "/v1/embeddings", json.dumps({"input": ["t"] * n}), {"Content-Type": "application/json"})
    resp = conn.getresponse()
    body = json.loads(resp.read())
    conn.close()
    return {"status": resp.status, "error": body.get("error", {}).get("message"), "embedded": len(state["chunks"]) > 0}
`;

  test("rejects requests above MAX_TEXTS before running inference", () => {
    const out = runPython(
      `${HTTP_PROBE}
over = post(4)
at = post(3)
httpd.shutdown()
print(json.dumps({"over": over, "at": at}))
`,
      { env: { MASSA_AI_MLX_EMBED_MAX_TEXTS: "3" } },
    );
    expect(out.over).toEqual({ status: 400, error: "`input` accepts at most 3 texts, got 4", embedded: false });
    expect(out.at).toEqual({ status: 200, error: null, embedded: true });
  });

  test("MAX_TEXTS defaults to 256", () => {
    const out = runPython(`print(json.dumps({"max": server.MAX_TEXTS}))`);
    expect(out).toEqual({ max: 256 });
  });
});
