/**
 * T4 — PostgreSQL acceptance for hook attribution persistence (M45/HAR-05/06/07).
 *
 * Scope (T4): durable persistence of agent_id + attribution_source; canonical
 * mirror keying after an alias rename (HAR-07); honest-absence agentId → NULL.
 * Repair-migration coverage (HAR-08) is added in T7.
 *
 * Gate: runs only with HOOK_ATTRIBUTION_ACCEPTANCE_DATABASE_URL pointing at an
 * OWNED database (`massa_th0th_hook_attribution`) with all migrations applied.
 * Skipped otherwise — recorded in validation.md, never weakened. The suite
 * points the shared pg/prisma singletons at the owned URL via process.env so
 * the real PgObservationStore + AttributionResolver exercise true integration.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Pool } from "pg";

const URL = process.env.HOOK_ATTRIBUTION_ACCEPTANCE_DATABASE_URL;

// Env override MUST run before any pg/prisma singleton initializes. Bun loads
// .env first; we overwrite DATABASE_URL to the owned URL at module eval so the
// lazy singletons (getPrismaClient / getPgPool) connect to the owned DB.
if (URL) {
  process.env.DATABASE_URL = URL;
}

import { getHookService, resetHookService } from "../services/hooks/hook-service.js";
import { resetAttributionResolver, setAttributionResolverForTests, type AttributionResolverLike } from "../services/hooks/attribution-resolver.js";
import { getObservationStore } from "../data/memory/observation-repository.js";
import { resetProjectIdentityAliasResolver, setProjectIdentityAliasResolverForTests } from "../services/project-identity/alias-resolver.js";
import { _resetPrismaForTesting } from "../services/query/prisma-client.js";
import { closeConnections } from "../data/db-connection.js";

type Row = Record<string, unknown>;

let pool: Pool;

/** Wait long enough for the fire-and-forget persist IIFE to commit. */
async function settle(): Promise<void> {
  await getObservationStore().__drain();
  await new Promise((r) => setTimeout(r, 120));
}

const VERBATIM: AttributionResolverLike = {
  resolve: async (input) =>
    ({ projectId: input.callerProjectId, source: "verbatim" as const }),
  pinSession: () => {},
};

const run = URL ? describe : describe.skip;

run("Hook attribution PG acceptance (T4)", () => {
  let counter = 0;

  beforeAll(async () => {
    pool = new Pool({ connectionString: URL });
    // Reset singletons so they re-initialize against the owned DB.
    await closeConnections();
    _resetPrismaForTesting();
  });

  afterAll(async () => {
    await pool.end();
    await closeConnections();
    _resetPrismaForTesting();
  });

  beforeEach(async () => {
    counter++;
    // Isolate state: clear the rows we own (obs ids are random; clean by the
    // acc- prefixes we control on project_id / session_id) + reset caches.
    await pool.query("DELETE FROM observations WHERE project_id LIKE 'acc-%' OR session_id LIKE 'acc-%'");
    await pool.query("DELETE FROM workspaces WHERE project_id LIKE 'acc-%'");
    await pool.query("DELETE FROM project_identity_aliases WHERE retired_project_id LIKE 'acc-%' OR target_project_id LIKE 'acc-%'");
    resetHookService();
    resetAttributionResolver();
    resetProjectIdentityAliasResolver();
    _resetPrismaForTesting();
  });

  test("HAR-05/06: durable row carries resolved id + attribution_source + agent_id", async () => {
    const cwd = `/acc/repo/${counter}`;
    await pool.query(
      "INSERT INTO workspaces (project_id, project_path, display_name, status) VALUES ($1, $2, $3, 'active') ON CONFLICT DO NOTHING",
      ["acc-repo", cwd, "acc-repo"],
    );
    // Use the REAL resolver + REAL PgObservationStore against the owned DB.
    setAttributionResolverForTests(null); // force production resolver
    const svc = getHookService();
    const obs = await svc.ingestOne({
      event: "user-prompt",
      projectId: "acc-junk-caller",
      sessionId: "acc-session-1",
      payload: { prompt: "hi", cwd },
      agentId: "acc-agent",
      ts: Date.now(),
    });
    expect(obs).toBeTruthy();
    await settle();
    const { rows } = await pool.query<Row>(
      "SELECT project_id, attribution_source, agent_id FROM observations WHERE id = $1",
      [obs],
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.project_id).toBe("acc-repo");
    expect(rows[0]!.attribution_source).toBe("containment");
    expect(rows[0]!.agent_id).toBe("acc-agent");
  });

  test("HAR-06: absent agentId persists as NULL (honest absence)", async () => {
    const cwd = `/acc/repo2/${counter}`;
    await pool.query(
      "INSERT INTO workspaces (project_id, project_path, display_name, status) VALUES ($1, $2, $3, 'active') ON CONFLICT DO NOTHING",
      ["acc-repo2", cwd, "acc-repo2"],
    );
    setAttributionResolverForTests(null);
    const svc = getHookService();
    const obs = await svc.ingestOne({
      event: "user-prompt",
      projectId: "acc-junk-2",
      sessionId: "acc-session-2",
      payload: { prompt: "hi", cwd },
      ts: Date.now(),
    });
    await settle();
    const { rows } = await pool.query<Row>(
      "SELECT agent_id FROM observations WHERE id = $1",
      [obs],
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.agent_id).toBeNull();
  });

  test("HAR-07: mirror keyed by canonical id after alias rename (no read/write split)", async () => {
    const cwd = `/acc/repo3/${counter}`;
    await pool.query(
      "INSERT INTO workspaces (project_id, project_path, display_name, status) VALUES ($1, $2, $3, 'active') ON CONFLICT DO NOTHING",
      ["acc-live", cwd, "acc-live"],
    );
    // Inject a fake alias resolver so acc-retired canonicalizes to acc-live at
    // the repo persist seam — avoids the full project_identity_operations FK
    // machinery while exercising the real PgObservationStore mirror fix.
    setProjectIdentityAliasResolverForTests({
      resolve: async (id: string) => (id === "acc-retired" ? "acc-live" : id),
    } as never);
    // Verbatim hook resolver returns the caller id; the store's alias resolver
    // canonicalizes retired → live at persist.
    setAttributionResolverForTests(VERBATIM);
    const svc = getHookService();
    const obs = await svc.ingestOne({
      event: "user-prompt",
      projectId: "acc-retired",
      sessionId: "acc-session-3",
      payload: { prompt: "hi" },
      ts: Date.now(),
    });
    await settle();
    // Durable row is canonicalized.
    const { rows } = await pool.query<Row>(
      "SELECT project_id FROM observations WHERE id = $1",
      [obs],
    );
    expect(rows[0]!.project_id).toBe("acc-live");
    // Mirror converged to canonical — sync read with the live id finds it,
    // and the retired id finds nothing (no split).
    const store = getObservationStore();
    await store.__hydrate();
    expect(store.countByProject("acc-live")).toBeGreaterThanOrEqual(1);
    expect(store.countByProject("acc-retired")).toBe(0);
  });

  test("HAR-01: verbatim fail-open persists caller id when no workspace matches", async () => {
    setAttributionResolverForTests(null);
    const svc = getHookService();
    const obs = await svc.ingestOne({
      event: "user-prompt",
      projectId: "acc-unregistered",
      sessionId: "acc-session-4",
      payload: { prompt: "hi", cwd: `/totally/elsewhere/${counter}` },
      ts: Date.now(),
    });
    await settle();
    const { rows } = await pool.query<Row>(
      "SELECT project_id, attribution_source FROM observations WHERE id = $1",
      [obs],
    );
    expect(rows[0]!.project_id).toBe("acc-unregistered");
    expect(rows[0]!.attribution_source).toBe("verbatim");
  });
});
