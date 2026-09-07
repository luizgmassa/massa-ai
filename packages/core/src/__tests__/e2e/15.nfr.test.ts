/**
 * T9 — Non-functional: concurrency + PG integrity + auth (E2E, live stack).
 *
 * Domain: NFR. Read-only: no production source / schema / route edits and no
 * DB schema changes. Requested runs require the owned macOS arm64 stack.
 *
 * OOM GUARD: NEVER index the full repo here. Concurrency tests use the TINY
 * polyglot fixture (33 small files at fixtures/polyglot/) or a throwaway
 * 2-3 file project, all into throwaway `e2e-ai-nfr-*` projectIds.
 * Concurrent parallelism is capped at 3. The full repository is never indexed.
 *
 * Scenarios (prefix-isolatable NFR only — destructive/shared-infra ones
 * SKIP+REASON, deferred to T13):
 *   Concurrency: N5, N6, N7, N8
 *   PG integrity: N14, N15, N16, N17
 *   Auth:         N18 (skip+reason), N19, N20
 */
import { describe, test, expect, afterAll } from "bun:test";
import path from "node:path";
import { Pool } from "pg";
import {
  E2E_ENABLED,
  probeAvailability,
  assertE2ePrefix,
  httpGet,
  httpPost,
  httpRaw,
  pollUntil,
  resetProject,
  RUN_STAMP,
  PREFIX,
  POLY_FIXTURE_PATH,
  type Availability,
} from "./_helpers";
import { inspectPolyglotFixture } from "./polyglot-fixture.js";

// ── Gating ─────────────────────────────────────────────────────────────────
let READY = false;
if (E2E_ENABLED) {
  const isDarwinArm64 = process.platform === "darwin" && process.arch === "arm64";
  const isLinuxX64 = process.platform === "linux" && process.arch === "x64";
  if (!isDarwinArm64 && !isLinuxX64) {
    throw new Error("NFR E2E is frozen to macOS arm64 or Linux glibc x64");
  }
  const availability = await probeAvailability();
  if (!availability.API_UP || !availability.OLLAMA_UP || availability.BACKEND !== "postgres") {
    throw new Error(`owned PostgreSQL E2E stack is not ready: ${JSON.stringify(availability)}`);
  }
  READY = true;
}

let AVAIL: Availability | null = null;

// ── Long-timeout POST (shared helper caps at 120s; index embeds can exceed) ─
async function postLong(
  endpoint: string,
  body?: unknown,
  timeoutMs = 300_000,
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const key = process.env.MASSA_AI_API_KEY ?? "";
  if (key) headers["x-api-key"] = key;
  const api = process.env.MASSA_AI_API_URL ?? "http://localhost:3333";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${api}${endpoint}`, {
      method: "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { _raw: text };
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

async function getLong(endpoint: string, timeoutMs = 60_000): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  const key = process.env.MASSA_AI_API_KEY ?? "";
  if (key) headers["x-api-key"] = key;
  const api = process.env.MASSA_AI_API_URL ?? "http://localhost:3333";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${api}${endpoint}`, { headers, signal: ctrl.signal });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { _raw: text };
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

/** Poll until isSearchable, with a generous timeout for tiny fixture embeds. */
async function pollSearchable(pid: string, query: string, timeoutMs = 600_000): Promise<boolean> {
  return pollUntil(
    async () => {
      try {
        const r = await httpPost<any>("/api/v1/search/project", {
          query,
          projectId: pid,
          maxResults: 1,
          minScore: 0.05,
          format: "json",
        });
        return (r?.data?.results?.length ?? 0) > 0;
      } catch {
        return false;
      }
    },
    { timeoutMs, intervalMs: 4_000 },
  );
}

/**
 * Fire an index for a TINY fixture and poll the JOB STATUS to "completed"
 * (the definitive settle signal for small fixtures — reaches completed once
 * all files are embedded). Returns the final status. More reliable than
 * search-based polling when Ollama is under load.
 */
async function indexTinyAndWait(
  pid: string,
  projectPath: string = POLY_FIXTURE_PATH,
  timeoutMs = 300_000,
): Promise<{ jobId: string | null; status: string; raw: any }> {
  assertE2ePrefix(pid);
  const start = await postLong("/api/v1/project/index", {
    projectPath,
    projectId: pid,
    forceReindex: true,
  });
  const jobId: string | null = start.json?.data?.jobId ?? start.json?.jobId ?? null;
  if (!jobId) {
    return { jobId: null, status: start.json?.data?.status ?? "completed", raw: start.json };
  }
  const done = await pollUntil(
    async () => {
      try {
        const s = await getLong(`/api/v1/project/index/status/${jobId}`);
        const st = s.json?.data?.status;
        return st === "completed" || st === "indexed" || st === "failed";
      } catch {
        return false;
      }
    },
    { timeoutMs, intervalMs: 3_000 },
  );
  const final = await getLong(`/api/v1/project/index/status/${jobId}`);
  if (!done) {
    console.log(`[indexTinyAndWait] ${pid} job ${jobId} did not reach completed: ${JSON.stringify(final.json?.data).slice(0, 200)}`);
  }
  return { jobId, status: final.json?.data?.status ?? "unknown", raw: final.json };
}

// Track throwaway projectIds for cleanup in afterAll.
const throwaway: string[] = [];
function makePid(n: number, suffix?: string): string {
  const id = `${PREFIX}nfr-${RUN_STAMP}-${n}${suffix ? `-${suffix}` : ""}`;
  assertE2ePrefix(id);
  throwaway.push(id);
  return id;
}

// ═══════════════════════════════════════════════════════════════════════════
// Concurrency
// ═══════════════════════════════════════════════════════════════════════════

describe.skipIf(!READY)("T9 N5 — concurrent index SAME projectId is lease-guarded", () => {
  const pid = makePid(5);

  afterAll(async () => {
    await resetProject(pid);
  });

  test(
    "3 concurrent index() calls on the SAME projectId: one wins the lease, the rest are refused busy",
    async () => {
      // The contract changed and this test did not follow it. It used to assert
      // that all three calls reach `completed`, citing "the queue mutex
      // (contextual-search-rlm.ts#indexProject) chains them: A → B → C". That
      // mutex was superseded by a `managed_runs` lease on
      // `(projectId, "indexing")` — FR-09 / AC-7, see `EtlPipelineBusyError` in
      // `services/etl/pipeline.ts:47-62` — which *refuses* a second concurrent
      // run with `indexing_busy:<activeRunId>` rather than queueing it, so the
      // caller can poll the active run instead. Measured here before the
      // repair: `failed, completed, failed`.
      //
      // The load-bearing property is unchanged and still asserted: exactly one
      // run mutates the project, and the final state is coherent and
      // searchable. What changed is that the losers are refused rather than
      // chained — and refusing must be visible, not silent.
      const fires = Array.from({ length: 3 }, () =>
        postLong("/api/v1/project/index", {
          projectPath: POLY_FIXTURE_PATH,
          projectId: pid,
          forceReindex: true,
        }).catch((e) => ({ status: 0, json: { _error: String(e?.message ?? e) } })),
      );
      const starts = await Promise.all(fires);

      // None of the kick-off calls should hard-error at the API level.
      for (let i = 0; i < starts.length; i++) {
        const r = starts[i];
        if (r.status >= 500 || r.json?._error) {
          console.log(`[N5] index call ${i} errored on kick-off: status=${r.status} ${JSON.stringify(r.json).slice(0,150)}`);
        }
        expect(r.status).toBeLessThan(500);
        expect(r.json?._error ?? null).toBeNull();
      }

      const jobIds = starts.map((s) => s.json?.data?.jobId ?? null).filter(Boolean) as string[];
      expect(jobIds).toHaveLength(3);
      // Poll each job to a terminal status.
      const finals = await Promise.all(
        jobIds.map((jid) =>
          pollUntil(
            async () => {
              try {
                const s = await getLong(`/api/v1/project/index/status/${jid}`);
                const st = s.json?.data?.status;
                return st === "completed" || st === "indexed" || st === "failed";
              } catch {
                return false;
              }
            },
            { timeoutMs: 300_000, intervalMs: 3_000 },
          ).then(async (ok) => {
            const s = await getLong(`/api/v1/project/index/status/${jid}`);
            // `data.error` is the terminal failure reason (a string, e.g.
            // "indexing_busy:31"). `data.result.errors` is a *count* of
            // per-file errors on a successful run — a different subject with a
            // near-identical name, and reading it here made a refused job look
            // reasonless.
            return {
              ok,
              status: s.json?.data?.status ?? "unknown",
              error: s.json?.data?.error ?? null,
            };
          }),
        ),
      );
      console.log(
        `[N5] ${jobIds.length} jobs fired; final statuses: ` +
          finals.map((f) => `${f.status}${f.error ? `(${f.error})` : ""}`).join(", "),
      );

      // Every job must reach a terminal status — a lease refusal that leaves a
      // job non-terminal forever is the failure mode `acquire-indexing-lease.ts`
      // exists to prevent.
      for (const f of finals) expect(f.ok).toBe(true);

      const winners = finals.filter((f) => f.status === "completed" || f.status === "indexed");
      const refused = finals.filter((f) => f.status === "failed");
      expect(winners.length + refused.length).toBe(finals.length);

      // Exactly one run may mutate the project. Two winners would mean two
      // concurrent pipelines wrote the same project — the corruption the lease
      // exists to prevent, and the one outcome this test must never accept.
      expect(winners).toHaveLength(1);

      // Every loser must be refused *for the documented reason*. Without this,
      // the test would pass on a run that failed for any reason at all.
      for (const f of refused) {
        expect(String(f.error ?? "")).toContain("indexing_busy");
      }

      // Data-plane: the surviving run leaves a coherent, searchable index.
      const ok = await pollSearchable(pid, "polyglot", 120_000);
      console.log(
        `[N5] winners=${winners.length} refused-busy=${refused.length} → final searchable: ${ok}`,
      );
      expect(ok).toBe(true);
    },
    900_000,
  );
});

describe.skipIf(!READY)("T9 N6 — concurrent index DIFFERENT projectIds parallelize", () => {
  const pidA = makePid(6, "a");
  const pidB = makePid(6, "b");
  const pidC = makePid(6, "c");

  afterAll(async () => {
    await Promise.all([resetProject(pidA), resetProject(pidB), resetProject(pidC)]);
  });

  test(
    "3 concurrent index() calls on DIFFERENT projectIds all reach searchable with sane results",
    async () => {
      const fires = [
        postLong("/api/v1/project/index", {
          projectPath: POLY_FIXTURE_PATH,
          projectId: pidA,
          forceReindex: true,
        }).catch((e) => ({ status: 0, json: { _error: String(e?.message ?? e) } })),
        postLong("/api/v1/project/index", {
          projectPath: POLY_FIXTURE_PATH,
          projectId: pidB,
          forceReindex: true,
        }).catch((e) => ({ status: 0, json: { _error: String(e?.message ?? e) } })),
        postLong("/api/v1/project/index", {
          projectPath: POLY_FIXTURE_PATH,
          projectId: pidC,
          forceReindex: true,
        }).catch((e) => ({ status: 0, json: { _error: String(e?.message ?? e) } })),
      ];
      const starts = await Promise.all(fires);
      for (let i = 0; i < starts.length; i++) {
        expect(starts[i].status).toBeLessThan(500);
        expect(starts[i].json?._error ?? null).toBeNull();
      }

      const jobIds = starts.map((s) => s.json?.data?.jobId ?? null).filter(Boolean) as string[];
      expect(jobIds).toHaveLength(3);
      const finals = await Promise.all(
        jobIds.map((jid) =>
          pollUntil(
            async () => {
              try {
                const s = await getLong(`/api/v1/project/index/status/${jid}`);
                const st = s.json?.data?.status;
                return st === "completed" || st === "indexed" || st === "failed";
              } catch {
                return false;
              }
            },
            { timeoutMs: 300_000, intervalMs: 3_000 },
          ).then(async (ok) => {
            const s = await getLong(`/api/v1/project/index/status/${jid}`);
            return { ok, status: s.json?.data?.status ?? "unknown", errors: s.json?.data?.errors };
          }),
        ),
      );
      console.log(`[N6] ${jobIds.length} jobs fired; statuses: ${finals.map((f) => f.status).join(", ")}`);
      for (const f of finals) {
        expect(f.ok).toBe(true);
        expect(f.status).toBe("completed");
      }

      // Each project must be independently searchable (no cross-project
      // corruption). Generic probe covers the whole polyglot fixture.
      const oks = await Promise.all([
        pollSearchable(pidA, "polyglot", 120_000),
        pollSearchable(pidB, "polyglot", 120_000),
        pollSearchable(pidC, "polyglot", 120_000),
      ]);
      console.log(`[N6] per-project searchable: A=${oks[0]} B=${oks[1]} C=${oks[2]}`);
      expect(oks.every(Boolean)).toBe(true);

      // Sane results: each project returns hits whose filePaths come from the
      // polyglot fixture (no cross-project corruption). The search response
      // returns basenames or relative paths; sanity-check against the known
      // polyglot fixture filenames.
      const polyFiles = [...(await inspectPolyglotFixture()).files];
      const probes = await Promise.all(
        [pidA, pidB, pidC].map((p) =>
          httpPost<any>("/api/v1/search/project", {
            query: "polyglot",
            projectId: p,
            maxResults: 3,
            minScore: 0.05,
            format: "json",
          }),
        ),
      );
      for (let i = 0; i < probes.length; i++) {
        const hits = probes[i]?.data?.results ?? [];
        expect(hits.length).toBeGreaterThan(0);
        for (const h of hits) {
          // Every hit must come from the polyglot fixture.
          const fp = String(h.filePath ?? h.file ?? "");
          const base = fp.split("/").pop() ?? fp;
          expect(polyFiles.some((pf) => base === pf || fp.includes(pf))).toBe(true);
        }
      }
    },
    900_000,
  );
});

describe.skipIf(!READY)("T9 N7 — active-generation visibility during reindex and failure", () => {
  const pid = makePid(7);

  afterAll(async () => {
    await resetProject(pid);
  });

  test(
    "readers observe the old generation until one atomic switch to the new generation",
    async () => {
      const initial = await indexTinyAndWait(pid, POLY_FIXTURE_PATH, 600_000);
      expect(initial.status).toBe("completed");
      const before = await httpGet<any>(`/api/v1/workspace/${pid}/map`);
      const oldGeneration = before.data.activatedGraphGenerationId;
      expect(oldGeneration).toEqual(expect.any(String));

      const start = await postLong("/api/v1/project/index", {
        projectPath: POLY_FIXTURE_PATH,
        projectId: pid,
        forceReindex: true,
      });
      expect(start.json?.success).toBe(true);
      const jobId = start.json?.data?.jobId;
      expect(jobId).toEqual(expect.any(String));

      const observed = [oldGeneration];
      const completed = await pollUntil(async () => {
        const [status, map] = await Promise.all([
          getLong(`/api/v1/project/index/status/${jobId}`),
          httpGet<any>(`/api/v1/workspace/${pid}/map`),
        ]);
        observed.push(map.data.activatedGraphGenerationId);
        return status.json?.data?.status === "completed";
      }, { timeoutMs: 600_000, intervalMs: 25 });
      expect(completed).toBe(true);
      const after = await httpGet<any>(`/api/v1/workspace/${pid}/map`);
      const newGeneration = after.data.activatedGraphGenerationId;
      observed.push(newGeneration);
      expect(newGeneration).toEqual(expect.any(String));
      expect(newGeneration).not.toBe(oldGeneration);
      expect(observed.every((value) => value === oldGeneration || value === newGeneration)).toBe(true);
      const firstNew = observed.indexOf(newGeneration);
      expect(firstNew).toBeGreaterThan(0);
      for (const generation of observed.slice(firstNew)) {
        expect(generation).toBe(newGeneration);
      }
    },
    900_000,
  );

  test(
    "a failed reindex leaves the previous generation and definitions visible",
    async () => {
      const before = await httpGet<any>(`/api/v1/workspace/${pid}/map`);
      const generation = before.data.activatedGraphGenerationId;
      const failedStart = await postLong("/api/v1/project/index", {
        projectPath: path.join(POLY_FIXTURE_PATH, "does-not-exist"),
        projectId: pid,
        forceReindex: true,
      });
      expect(failedStart.status).toBeLessThan(500);
      const jobId = failedStart.json?.data?.jobId;
      if (jobId) {
        const terminal = await pollUntil(async () => {
          const status = await getLong(`/api/v1/project/index/status/${jobId}`);
          return status.json?.data?.status === "failed";
        }, { timeoutMs: 120_000, intervalMs: 250 });
        expect(terminal).toBe(true);
      } else {
        expect(failedStart.json?.success).toBe(false);
      }
      const after = await httpGet<any>(`/api/v1/workspace/${pid}/map`);
      expect(after.data.activatedGraphGenerationId).toBe(generation);
      const definition = await httpGet<any>("/api/v1/symbol/definitions", {
        projectId: pid,
        search: "PolyRoot",
        file: "decorator-heavy.ts",
        kind: "class",
        limit: 5,
      });
      expect(definition.data.definitions).toHaveLength(1);
    },
    180_000,
  );
});

describe.skipIf(!READY)("T9 N8 — concurrent Synapse access (HTTP-direct, bounded history)", () => {
  // NOTE: MCP synapse_access is broken (BUG-SYN-4). Use HTTP-direct
  // /api/v1/synapse/session/:id/access here, as instructed.
  const sessionIds: string[] = [];

  afterAll(async () => {
    await Promise.all(
      sessionIds.map((id) =>
        httpRaw(`/api/v1/synapse/session/${id}`, { method: "DELETE" }).catch(() => {}),
      ),
    );
  });

  test(
    "several concurrent access() calls keep accessHistorySize bounded (≤1000) and don't crash",
    async () => {
      // Create a session. agentId is required by the route schema.
      const created = await httpPost<any>("/api/v1/synapse/session", {
        agentId: "t9-nfr-test",
        workspaceId: PREFIX,
        taskContext: "T9 N8 concurrent access test",
        ttlMs: 60_000,
      });
      const sid = created?.data?.sessionId ?? created?.sessionId;
      expect(typeof sid).toBe("string");
      sessionIds.push(sid);

      // Fire several concurrent access calls with distinct memoryIds.
      const memoryIds = Array.from({ length: 8 }, (_, i) => `n8-mem-${i}-${RUN_STAMP}`);
      const accessFires = memoryIds.map((mid) =>
        postLong(`/api/v1/synapse/session/${sid}/access`, { memoryId: mid }, 30_000).catch((e) => ({
          status: 0,
          json: { _error: String(e?.message ?? e) },
        })),
      );
      const responses = await Promise.all(accessFires);

      for (let i = 0; i < responses.length; i++) {
        const r = responses[i];
        // No 5xx crash. (4xx for a known reason is allowed but documented.)
        if (r.status >= 500) {
          console.log(`[N8] access ${i} returned ${r.status}: ${JSON.stringify(r.json)}`);
        }
        expect(r.status).toBeLessThan(500);
      }

      // Inspect session state: accessHistorySize must be bounded (≤1000 hard cap).
      const inspect = await httpGet<any>(`/api/v1/synapse/session/${sid}`);
      const size = inspect?.data?.accessHistorySize ?? inspect?.accessHistorySize ?? 0;
      console.log(`[N8] ${memoryIds.length} concurrent access calls → accessHistorySize=${size}`);
      expect(size).toBeLessThanOrEqual(1000);
      expect(size).toBeGreaterThan(0);
    },
    120_000,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// PG data integrity (backend is PostgreSQL — high-value)
// ═══════════════════════════════════════════════════════════════════════════

describe.skipIf(!READY)("T9 N14 — unresolved-target refs retained (PostgreSQL parity)", () => {
  const pid = makePid(14);

  afterAll(async () => {
    await resetProject(pid);
  });

  test(
    "indexing a fixture with an unresolvable import retains the null-target reference row on PG",
    async () => {
      // The polyglot fixture's decorator-heavy.ts imports `ghost` from
      // "./does-not-exist"; the call inside `usesGhost` has no resolved target.
      // Previously the PG repository dropped these refs entirely
      // (guard `if (!ref.target_fqn) continue;` + NOT NULL column). After the
      // fix (NOT NULL dropped + guards removed), the null-target reference row
      // is retained, matching the PostgreSQL backend which stores ref.target_fqn ?? null.
      const ir = await indexTinyAndWait(pid);
      console.log(`[N14] fixture with unresolvable import indexed → job status: ${ir.status}`);
      expect(ir.status).toBe("completed");

      // Symbol tools must not 500 (the NOT-NULL violation is gone).
      const checks: { label: string; status: number; json: any }[] = [];
      let r = await getLong(`/api/v1/symbol/definitions?projectId=${encodeURIComponent(pid)}&search=usesGhost`);
      checks.push({ label: "search_definitions", status: r.status, json: r.json });
      r = await getLong(`/api/v1/symbol/references?projectId=${encodeURIComponent(pid)}&symbolName=${encodeURIComponent("usesGhost")}`);
      checks.push({ label: "get_references (usesGhost)", status: r.status, json: r.json });
      // `ghost` is the unresolved-target call site — its reference row was
      // previously dropped; it must now be retained.
      const ghostRefs = await getLong(`/api/v1/symbol/references?projectId=${encodeURIComponent(pid)}&symbolName=${encodeURIComponent("ghost")}`);
      checks.push({ label: "get_references (ghost)", status: ghostRefs.status, json: ghostRefs.json });

      for (const c of checks) {
        console.log(`[N14] ${c.label}: status=${c.status}`);
        expect(c.status).toBe(200);
      }

      // The null-target reference to `ghost` must now be present (previously
      // silently dropped). get_references matches on symbol_name OR target_fqn,
      // so the call-site row with symbol_name="ghost" surfaces here.
      const ghostRefRows = ghostRefs.json?.data?.references ?? [];
      const unresolved = ghostRefRows.filter((reference: any) =>
        reference.fromFile === "decorator-heavy.ts" &&
        reference.symbolName === "ghost" &&
        reference.refKind === "call" &&
        (reference.targetFqn ?? null) === null
      );
      expect(unresolved).toHaveLength(1);
    },
    600_000,
  );
});

describe.skipIf(!READY)("T9 N15 — vector dimension and index integrity", () => {
  const pid = makePid(15);

  afterAll(async () => {
    await resetProject(pid);
  });

  test(
    "indexed vectors live in exactly one dimension table, with binary HNSW and valid distance operators",
    async () => {
      const ir = await indexTinyAndWait(pid);
      expect(ir.status).toBe("completed");
      const ok = await pollSearchable(pid, "polyglot", 120_000);
      expect(ok).toBe(true);

      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      try {
        // The dimension is a property of the configured embedding provider, not
        // a constant. This test used to name `vector_documents_4096d` directly
        // and so passed only under qwen3-embedding:8b; under any other profile
        // it read an empty table and failed on row count, which reads like a
        // vector-integrity regression rather than a hardcoded assumption.
        //
        // Discovering the table instead makes the assertion strictly stronger:
        // "exactly one dimension table holds this project" also catches a
        // project whose rows are split across two profiles, which naming one
        // table could never see.
        const tables = await pool.query<{ table_name: string; rows: string }>(
          `SELECT c.relname AS table_name,
                  (SELECT count(*) FROM pg_catalog.pg_class WHERE oid = c.oid) AS rows
             FROM pg_catalog.pg_class c
             JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relkind = 'r'
              AND c.relname ~ '^vector_documents_[0-9]+d$'`,
        );

        const occupied: { table: string; dimensions: number; count: number }[] = [];
        for (const row of tables.rows) {
          const dimensions = Number(/^vector_documents_(\d+)d$/.exec(row.table_name)![1]);
          const counted = await pool.query<{ n: string }>(
            `SELECT count(*)::text AS n FROM ${row.table_name} WHERE project_id = $1`,
            [pid],
          );
          const count = Number(counted.rows[0]!.n);
          if (count > 0) occupied.push({ table: row.table_name, dimensions, count });
        }

        console.log(
          `[N15] dimension tables present: ${tables.rows.length}; occupied by ${pid}: ` +
            (occupied.map((o) => `${o.table}(${o.count})`).join(", ") || "none"),
        );
        expect(occupied).toHaveLength(1);

        const { table, dimensions } = occupied[0]!;

        // Every indexed project carries exactly one `_metadata:<projectId>` row
        // in this table. It is a sentinel, not a document: its embedding is a
        // zero vector, so `embedding <=> embedding` is NaN for it and any
        // whole-project cosine assertion fails on that row alone. Separate the
        // two populations rather than loosening the assertion.
        const vectors = await pool.query<{
          id: string;
          dimensions: number;
          binary_dimensions: number;
          cosine_self_distance: number;
          hamming_self_distance: number;
        }>(
          `SELECT id,
                  vector_dims(embedding)::int AS dimensions,
                  bit_length(embedding_bq)::int AS binary_dimensions,
                  (embedding <=> embedding)::float8 AS cosine_self_distance,
                  (embedding_bq <~> embedding_bq)::float8 AS hamming_self_distance
             FROM ${table}
            WHERE project_id = $1`,
          [pid],
        );

        const sentinelId = `_metadata:${pid}`;
        const sentinels = vectors.rows.filter((row) => row.id === sentinelId);
        const documents = vectors.rows.filter((row) => row.id !== sentinelId);
        console.log(
          `[N15] ${table}: ${documents.length} document row(s), ${sentinels.length} metadata sentinel(s)`,
        );
        expect(sentinels).toHaveLength(1);
        expect(documents.length).toBeGreaterThan(0);

        // Every document row's real width must equal the width its table name
        // claims — the cross-check the hardcoded constant used to stand in for.
        const offenders = documents.filter((row) =>
          row.dimensions !== dimensions ||
          row.binary_dimensions !== dimensions ||
          row.cosine_self_distance !== 0 ||
          row.hamming_self_distance !== 0
        );
        if (offenders.length > 0) {
          console.log(`[N15] offending rows: ${JSON.stringify(offenders.slice(0, 3))}`);
        }
        expect(offenders).toHaveLength(0);

        // The sentinel's own contract: right width, but a zero vector, which is
        // why it cannot be asserted alongside the documents.
        expect(sentinels[0]!.dimensions).toBe(dimensions);
        expect(sentinels[0]!.binary_dimensions).toBe(dimensions);

        const index = await pool.query<{ indexdef: string }>(
          `SELECT indexdef
             FROM pg_indexes
            WHERE tablename = $1
              AND indexname = $2`,
          [table, `idx_${table}_embedding_bq`],
        );
        expect(index.rows).toHaveLength(1);
        expect(index.rows[0]!.indexdef).toContain("USING hnsw");
        expect(index.rows[0]!.indexdef).toContain("bit_hamming_ops");
      } finally {
        await pool.end();
      }
    },
    600_000,
  );
});

describe.skipIf(!READY)("T9 N16 — symbol referential integrity", () => {
  const pid = makePid(16);

  afterAll(async () => {
    await resetProject(pid);
  });

  test(
    "the known unresolved call is retained exactly without an invented target",
    async () => {
      const ir = await indexTinyAndWait(pid);
      expect(ir.status).toBe("completed");
      const response = await getLong(
        `/api/v1/symbol/references?projectId=${encodeURIComponent(pid)}&symbolName=ghost&limit=20`,
      );
      expect(response.status).toBe(200);
      const references = response.json?.data?.references ?? [];
      const unresolved = references.filter((reference: any) =>
        reference.fromFile === "decorator-heavy.ts" &&
        reference.symbolName === "ghost" &&
        reference.refKind === "call",
      );
      expect(unresolved).toHaveLength(1);
      expect(unresolved[0].targetFqn ?? null).toBeNull();
    },
    600_000,
  );
});

describe.skipIf(!READY)("T9 N17 — memory hard-delete leaves no tombstone", () => {
  const createdMemoryIds: string[] = [];

  afterAll(async () => {
    // Best-effort cleanup of any leftover.
    for (const id of createdMemoryIds) {
      await httpPost<any>("/api/v1/memory/delete", { id }).catch(() => {});
    }
  });

  test(
    "store → delete → recall yields not-found and no deleted_at tombstone via memory_list",
    async () => {
      // Store a memory. Request JSON format so data.memoryId is structured.
      const store = await httpPost<any>("/api/v1/memory/store", {
        content: `T9-N17 hard-delete probe ${RUN_STAMP}`,
        type: "conversation",
        importance: 0.3,
        tags: ["t9-n17", PREFIX],
        format: "json",
      });
      const id = store?.data?.memoryId ?? store?.data?.id ?? store?.id;
      expect(typeof id).toBe("string");
      createdMemoryIds.push(id);

      // Hard-delete it.
      const del = await httpPost<any>("/api/v1/memory/delete", { id });
      expect(del?.success ?? del?.data?.success ?? true).toBe(true);

      // recall must not find it.
      const recall = await httpPost<any>("/api/v1/memory/search", {
        query: `T9-N17 hard-delete probe ${RUN_STAMP}`,
        limit: 10,
      });
      const hits = recall?.data?.results ?? recall?.results ?? [];
      const stillThere = hits.filter((h: any) => h?.id === id || h?.memoryId === id);
      console.log(`[N17] after delete, recall returned ${stillThere.length} matches for the deleted id`);
      expect(stillThere.length).toBe(0);

      // memory_list must not surface it (no tombstone leak). The /list route
      // has no tags filter, so list conversation memories and filter by the
      // unique RUN_STAMP baked into the stored content.
      const list = await httpPost<any>("/api/v1/memory/list", {
        type: "conversation",
        limit: 500,
      });
      const items = list?.data?.memories ?? list?.data ?? list?.memories ?? [];
      const arr: any[] = Array.isArray(items) ? items : [];
      const mine = arr.filter(
        (m: any) =>
          typeof m?.content === "string" &&
          m.content.includes(`T9-N17 hard-delete probe ${RUN_STAMP}`),
      );
      const leaked = mine.filter((m: any) => m?.id === id || m?.memoryId === id);
      console.log(
        `[N17] memory_list returned ${arr.length} conversation items; ${mine.length} matched this probe; ` +
          `leaked tombstones: ${leaked.length}`,
      );
      expect(leaked.length).toBe(0);
    },
    120_000,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Auth. AD-011 made the key mandatory and deleted the no-key pass-through; it
// is not configurable, and the API provisions a key on first start when none
// exists. These two cases used to encode the opposite world: N18 was a static
// skip whose text said exercising 401 "would require restarting tools-api with
// a key (destructive — deferred to T13)", and N19 asserted AUTH_REQUIRED ===
// false. Both were unreachable-by-construction rather than true: no supported
// configuration produces an open API, so N19 could only pass against a server
// running deleted behaviour. Restarting with a key is also no longer
// destructive — `scripts/e2e-stack.sh restart-api` owns that.
// ═══════════════════════════════════════════════════════════════════════════

describe.skipIf(!READY)("T9 N18 — auth is mandatory: no key is 401", () => {
  test("GET /api/v1/workspace/list with NO x-api-key is rejected", async () => {
    AVAIL = AVAIL ?? (await probeAvailability());
    expect(AVAIL.AUTH_REQUIRED).toBe(true);

    // httpRaw attaches the configured key, so the unauthenticated request is
    // issued directly. A bare fetch is the only way to observe the header's
    // absence on the wire.
    const api = process.env.MASSA_AI_API_URL ?? "http://localhost:3333";
    const res = await fetch(`${api}/api/v1/workspace/list`, {
      method: "GET",
      signal: AbortSignal.timeout(30_000),
    });
    console.log(`[N18] GET /workspace/list with no key → ${res.status} (expect 401)`);
    expect(res.status).toBe(401);
  });

  test("a whitespace-only key is treated as absent, not as a key", async () => {
    // HTTP strips whitespace from header values, so "   " arrives as "". The
    // guard must not read that as a supplied credential.
    const api = process.env.MASSA_AI_API_URL ?? "http://localhost:3333";
    const res = await fetch(`${api}/api/v1/workspace/list`, {
      method: "GET",
      headers: { "x-api-key": "   " },
      signal: AbortSignal.timeout(30_000),
    });
    console.log(`[N18] GET /workspace/list with a blank key → ${res.status} (expect 401)`);
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!READY)("T9 N19 — the configured key is accepted, and /health stays public", () => {
  test("GET /api/v1/workspace/list WITH the configured key returns 200", async () => {
    const key = process.env.MASSA_AI_API_KEY ?? "";
    expect(key.length).toBeGreaterThan(0);
    const res = await httpRaw("/api/v1/workspace/list", { method: "GET" });
    console.log(`[N19] GET /workspace/list with the configured key → ${res.status}`);
    expect(res.status).toBe(200);
  });

  test("GET /health needs no key — it is in PUBLIC_PATHS", async () => {
    const api = process.env.MASSA_AI_API_URL ?? "http://localhost:3333";
    const res = await fetch(`${api}/health`, { signal: AbortSignal.timeout(30_000) });
    console.log(`[N19] GET /health with no key → ${res.status} (expect 200)`);
    expect(res.status).toBe(200);
  });
});

describe.skipIf(!READY)("T9 N20 — hook payload cap (>65536 bytes rejected)", () => {
  test("POST /api/v1/hook/batch with an oversized payload (>64KiB) is rejected, no crash, no ids persisted", async () => {
    // Build an oversized event payload. Each event has a `payload` object; we
    // make the cumulative JSON body well over HOOKS_MAX_PAYLOAD_BYTES (65536).
    const big = "x".repeat(70_000); // single field > 64KiB
    const events = [
      {
        event: "user-prompt",
        projectId: PREFIX,
        timestamp: new Date().toISOString(),
        payload: { big },
      },
    ];

    const headers: Record<string, string> = { "content-type": "application/json" };
    const key = process.env.MASSA_AI_API_KEY ?? "";
    if (key) headers["x-api-key"] = key;
    const api = process.env.MASSA_AI_API_URL ?? "http://localhost:3333";
    const body = JSON.stringify({ events });
    const bodyBytes = Buffer.byteLength(body);
    console.log(`[N20] oversized hook batch body = ${bodyBytes} bytes (>65536 cap)`);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    let res: Response;
    try {
      res = await fetch(`${api}/api/v1/hook/batch`, {
        method: "POST",
        headers,
        body,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { _raw: text };
    }

    console.log(`[N20] response status=${res.status} body=${JSON.stringify(json).slice(0, 200)}`);

    // Contract: rejected (413/400/422) with {success:false} or error; no crash
    // (no 5xx); and no `ids` persisted (success path returns ids).
    expect(res.status).toBeLessThan(500); // no server crash
    const ids = json?.ids ?? json?.data?.ids;
    const success = json?.success ?? json?.data?.success;
    if (ids && Array.isArray(ids) && ids.length > 0) {
      console.log(`[N20] BUG: oversized payload was accepted and ingested (ids returned): ${JSON.stringify(ids)}`);
    }
    // Either rejected via status code, or the JSON signals failure.
    const rejected = res.status === 413 || res.status === 400 || res.status === 422 || success === false;
    expect(rejected).toBe(true);
    // And no ids persisted.
    expect(Array.isArray(ids) ? ids.length : 0).toBe(0);
  });
});

// afterAll fallback: reset ALL throwaway projectIds (defensive — each describe
// already resets its own, but this guards against mid-test failures leaking).
afterAll(async () => {
  if (!READY) return;
  await Promise.all(
    throwaway.map((id) =>
      resetProject(id).catch((e) => console.log(`[T9] cleanup failed for ${id}: ${String(e?.message ?? e)}`)),
    ),
  );
});
