/**
 * T4 tests — write-seam alias resolution (spec req 3). Discrimination for the
 * adapter-resolution wiring: a mutant that deletes the seam `resolve()` call
 * fails these tests because the retired id would reach the SQL verbatim.
 */

import { afterEach, describe, expect, test } from "bun:test";

import { PgHandoffStore } from "../data/handoff/handoff-repository-pg.js";
import type { HandoffRecord } from "../data/handoff/handoff-contract.js";
import {
  ProjectIdentityAliasResolver,
  setProjectIdentityAliasResolverForTests,
  type AliasResolverQuerier,
} from "../services/project-identity/index.js";

function handoff(overrides: Partial<HandoffRecord> = {}): HandoffRecord {
  return {
    id: "handoff-1",
    projectId: "retired-project",
    sourceSessionId: null,
    targetAgent: null,
    summary: "summary",
    openQuestions: [],
    nextSteps: [],
    files: [],
    status: "open",
    createdAt: 1_000,
    acceptedAt: null,
    ...overrides,
  };
}

function mappingQuerier(mapping: Record<string, string>): AliasResolverQuerier {
  return {
    async query<Row = Record<string, unknown>>(
      _text: string,
      values: readonly unknown[] = [],
    ): Promise<{ rows: Row[] }> {
      const id = values[0] as string;
      return {
        rows: [{ project_identity_resolve: mapping[id] ?? id }] as unknown as Row[],
      };
    },
  };
}

/** Capturing Prisma stand-in: tagged-template $executeRaw → [strings, ...values]. */
function capturingClient() {
  const executions: unknown[][] = [];
  const client = {
    $queryRaw: async () => [],
    $executeRaw: async (...args: unknown[]) => {
      executions.push(args.slice(1));
      return 1;
    },
  };
  // PgHandoffStore accepts an injected client (see handoff-store-fail-loud tests).
  return { client: client as never, executions };
}

describe("project identity write seams", () => {
  afterEach(() => {
    setProjectIdentityAliasResolverForTests(null);
  });

  test("PgHandoffStore.insert persists the canonical target id, not the retired id", async () => {
    setProjectIdentityAliasResolverForTests(new ProjectIdentityAliasResolver({
      querier: mappingQuerier({ "retired-project": "canonical-target" }),
    }));
    const { client, executions } = capturingClient();
    const store = new PgHandoffStore(client);

    await store.insert(handoff({ projectId: "retired-project" }));

    expect(executions.length).toBeGreaterThan(0);
    // INSERT VALUES order: id, project_id, source_session_id, ...
    expect(executions[0]![0]).toBe("handoff-1");
    expect(executions[0]![1]).toBe("canonical-target");
  });

  test("PgHandoffStore.insert with a live id passes through unchanged", async () => {
    setProjectIdentityAliasResolverForTests(new ProjectIdentityAliasResolver({
      querier: mappingQuerier({}),
    }));
    const { client, executions } = capturingClient();
    const store = new PgHandoffStore(client);

    await store.insert(handoff({ projectId: "live-project" }));

    expect(executions[0]![1]).toBe("live-project");
  });
});
