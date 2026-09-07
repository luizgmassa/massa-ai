/**
 * The ETL pipeline must establish the `workspaces` row before it opens a graph
 * generation, because `lockWorkspace` throws when that row is absent.
 *
 * Why this is a structural sensor rather than a behavioural one. The failure is
 * a lost race, not a branch: `WorkspaceManager.markIndexing` runs from an
 * unawaited `indexing:started` subscriber and costs two round-trips (a read,
 * then an upsert), while `EtlPipeline` reaches `graphGenerations.begin()` as
 * soon as Discover returns. On a small fixture Discover finishes in under 10 ms
 * and the upsert has not committed, so `lockWorkspace`'s
 * `SELECT … FROM workspaces WHERE project_id = $1 FOR UPDATE` finds nothing and
 * the run dies with `graph_generation_workspace_missing:<projectId>`. Measured:
 * the failing runs died at durationMs 9 and 14, and three distinct projects hit
 * it in one loaded sequential E2E run — while eight concurrent fresh projects
 * on an idle stack hit it zero times. A test that reproduces the race would be
 * a flake in both directions, and `EtlPipeline` exposes no seam for a fake
 * coordinator: `graphGenerations` is a private field assigned at construction
 * and the class is a private-constructor singleton. Adding that seam would be
 * more production surface than the guarantee it verifies.
 *
 * So this asserts the ordering directly in the source, and — the part that
 * makes it more than a grep — it also asserts that the CAUSE still exists. If
 * someone later makes the subscriber awaited, the second case fails and says
 * the pipeline's guard may now be redundant, instead of passing silently and
 * leaving a guard nobody can explain.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CORE_SRC = join(import.meta.dir, "..");
const PIPELINE = join(CORE_SRC, "services/etl/pipeline.ts");
const WORKSPACE_MANAGER = join(CORE_SRC, "services/workspace/workspace-manager.ts");

describe("ETL pipeline establishes the workspaces row before opening a graph generation", () => {
  const pipeline = readFileSync(PIPELINE, "utf8");

  test("the pipeline awaits markIndexing, and does so before graphGenerations.begin()", () => {
    const guard = pipeline.indexOf("await workspaceManager.markIndexing(");
    const begin = pipeline.indexOf("this.graphGenerations.begin(");

    expect(begin).toBeGreaterThan(-1);
    // A bare `workspaceManager.markIndexing(` without `await` would leave the
    // same race in place while looking like a fix, so the awaited form is what
    // is searched for.
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(begin);
  });

  test("the pipeline imports the workspace manager it depends on", () => {
    expect(pipeline).toContain('from "../workspace/workspace-manager.js"');
  });

  test("the cause still holds: markIndexing is invoked unawaited from the event subscriber", () => {
    const manager = readFileSync(WORKSPACE_MANAGER, "utf8");
    const subscription = manager.slice(manager.indexOf('eventBus.subscribe("indexing:started"'));
    expect(subscription.length).toBeGreaterThan(0);

    // Fire-and-forget shape: the call is chained to `.catch(` rather than
    // awaited. If this stops being true the pipeline's guard is no longer
    // load-bearing and should be reconsidered rather than kept on faith.
    const handler = subscription.slice(0, subscription.indexOf("});"));
    expect(handler).toContain("this.markIndexing(");
    expect(handler).toContain(".catch(");
    expect(handler).not.toContain("await this.markIndexing(");
  });

  test("markIndexing still costs a read before its upsert — the window this guards", () => {
    const manager = readFileSync(WORKSPACE_MANAGER, "utf8");
    const body = manager.slice(
      manager.indexOf("async markIndexing("),
      manager.indexOf("eventBus.publish(\"workspace:updated\""),
    );
    const read = body.indexOf("repo.getWorkspace(");
    const write = body.indexOf("repo.upsertWorkspace(");
    expect(read).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(read);
  });
});
