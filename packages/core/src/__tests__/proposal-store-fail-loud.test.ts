import { describe, expect, test } from "bun:test";
import {
  MemoryProposalStore,
  type ProposalRecord,
} from "../data/proposal/proposal-contract.js";
import { PgProposalStore } from "../data/proposal/proposal-repository-pg.js";
import {
  assertValidProposalPayload,
  isValidProposalPayload,
  ProposalPayloadValidationError,
} from "../data/proposal/proposal-payload-validation.js";
import { SearchServiceError } from "../kernel/search-diagnostics.js";

function proposal(overrides: Partial<ProposalRecord> = {}): ProposalRecord {
  return {
    id: "proposal-1",
    projectId: "project-1",
    kind: "memory.create",
    targetMemoryId: null,
    payload: { content: "hello" },
    rationale: "because",
    status: "pending",
    createdAt: 1_000,
    decidedAt: null,
    ...overrides,
  };
}

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "proposal-1",
    project_id: "project-1",
    kind: "memory.create",
    target_memory_id: null,
    payload_json: JSON.stringify({ content: "hello" }),
    rationale: "because",
    status: "pending",
    created_at: new Date(1_000),
    decided_at: null,
    ...overrides,
  };
}

function client(query: () => Promise<unknown>, execute = async () => 1): any {
  return { $queryRaw: query, $executeRaw: execute };
}

describe("async proposal stores", () => {
  test("memory store exposes awaited clone-safe operations", async () => {
    const store = new MemoryProposalStore();
    const record = proposal();
    const insertion = store.insert(record);
    expect(insertion).toBeInstanceOf(Promise);
    await insertion;
    const loaded = await store.getById(record.id);
    expect(loaded).toEqual(record);
    (loaded!.payload as { content: string }).content = "mutated";
    expect((await store.getById(record.id))!.payload).toEqual({ content: "hello" });
    expect(await store.journalMode()).toBe("memory");
  });

  test("reads wait for hydration before observing the mirror", async () => {
    let resolveRows!: (rows: unknown[]) => void;
    const rows = new Promise<unknown[]>((resolve) => {
      resolveRows = resolve;
    });
    const store = new PgProposalStore(client(() => rows));
    let settled = false;
    const pending = store.getById("proposal-1").then((value) => {
      settled = true;
      return value;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    resolveRows([row()]);
    expect(await pending).toEqual(proposal());
  });

  test.each([
    ["invalid syntax", "{", "memory.create"],
    ["array payload", "[]", "memory.create"],
    ["missing create content", "{}", "memory.create"],
    ["empty update", "{}", "memory.update"],
    ["invalid update tags", JSON.stringify({ tags: [1] }), "memory.update"],
    ["invalid tag payload", JSON.stringify({ content: "x" }), "memory.tag"],
  ])("surfaces %s in stored payload", async (_label, raw, kind) => {
    const store = new PgProposalStore(
      client(async () => [row({ payload_json: raw, kind })]),
    );
    await expect(store.listPending("project-1")).rejects.toMatchObject({
      code: "STORE_CORRUPTION",
      component: "proposal.payload_json",
    });
  });

  test.each([
    ["kind", { kind: "unknown" }, "proposal.kind"],
    ["status", { status: "unknown" }, "proposal.status"],
    ["created date", { created_at: new Date(Number.NaN) }, "proposal.created_at"],
    ["decided date", { status: "approved", decided_at: "bad" }, "proposal.decided_at"],
    ["pending decision", { decided_at: new Date(2_000) }, "proposal.decided_at"],
    ["missing decision", { status: "approved" }, "proposal.decided_at"],
  ])("surfaces invalid %s", async (_label, overrides, component) => {
    const store = new PgProposalStore(client(async () => [row(overrides)]));
    await expect(store.getById("proposal-1")).rejects.toMatchObject({
      code: "STORE_CORRUPTION",
      component,
    });
  });

  test("failed hydration is a sanitized backend failure", async () => {
    const store = new PgProposalStore(
      client(async () => {
        throw new Error("database detail");
      }),
    );
    try {
      await store.getById("proposal-1");
      throw new Error("expected backend error");
    } catch (error) {
      expect(error).toBeInstanceOf(SearchServiceError);
      expect((error as SearchServiceError).code).toBe("SEARCH_BACKEND_UNAVAILABLE");
      expect((error as SearchServiceError).component).toBe("proposal_store");
      expect((error as Error).message).not.toContain("database detail");
    }
  });

  test("failed durable insert leaves the mirror unchanged", async () => {
    const store = new PgProposalStore(
      client(async () => [], async () => {
        throw new Error("database detail");
      }),
    );
    await expect(store.insert(proposal())).rejects.toMatchObject({
      code: "SEARCH_BACKEND_UNAVAILABLE",
      component: "proposal_store",
    });
    expect(await store.getById("proposal-1")).toBeNull();
  });
});

describe("shared per-kind payload validation (D4, AC-02.2)", () => {
  // One table, two callers: these are the *write-side* cases, and they are
  // the mirror image of the read-side `storeCorruption` cases above — same
  // table, different wrapper error, so a payload accepted here is guaranteed
  // not to blow up the next `getById`/`listPending`/`approve` on that row.
  test.each([
    ["memory.create", { content: "hello", tags: ["t"] }],
    ["memory.update", { content: "edited" }],
    ["memory.tag", { tags: ["a", "b"] }],
  ] as const)("accepts a valid %s payload", (kind, payload) => {
    expect(isValidProposalPayload(kind, payload)).toBe(true);
    expect(() => assertValidProposalPayload(kind, payload)).not.toThrow();
  });

  test.each([
    ["memory.create", {}, "missing required content"],
    ["memory.create", { content: "x", extra: true }, "unknown key"],
    ["memory.update", {}, "empty patch"],
    ["memory.update", { tags: [1] }, "wrong tags element type"],
    ["memory.tag", { content: "x" }, "missing required tags"],
    ["memory.tag", {}, "missing required tags"],
  ] as const)(
    "refuses an invalid %s payload at write time with a 400-shaped error (%s)",
    (kind, payload) => {
      expect(isValidProposalPayload(kind, payload)).toBe(false);
      expect(() => assertValidProposalPayload(kind, payload)).toThrow(
        ProposalPayloadValidationError,
      );
      try {
        assertValidProposalPayload(kind, payload);
        throw new Error("expected assertValidProposalPayload to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(ProposalPayloadValidationError);
        expect((error as ProposalPayloadValidationError).statusCode).toBe(400);
        expect((error as ProposalPayloadValidationError).kind).toBe(kind);
      }
    },
  );

  test("refuses a non-object payload at write time", () => {
    expect(() => assertValidProposalPayload("memory.tag", ["not", "an", "object"])).toThrow(
      ProposalPayloadValidationError,
    );
    expect(() => assertValidProposalPayload("memory.tag", "a string")).toThrow(
      ProposalPayloadValidationError,
    );
    expect(() => assertValidProposalPayload("memory.tag", null)).toThrow(
      ProposalPayloadValidationError,
    );
  });
});

describe("MemoryProposalStore branch coverage", () => {
  test("listPending filters + orders; setStatus on pending/non-pending/missing", async () => {
    const store = new MemoryProposalStore();
    await store.insert(proposal({ id: "p-a", createdAt: 2_000 }));
    await store.insert(proposal({ id: "p-b", createdAt: 1_000, projectId: "other" }));
    await store.insert(proposal({ id: "p-c", createdAt: 3_000 }));

    // Only project-1 pending rows, ordered by createdAt.
    expect((await store.listPending("project-1")).map((r) => r.id)).toEqual(["p-a", "p-c"]);
    expect((await store.listPending("other")).map((r) => r.id)).toEqual(["p-b"]);

    // setStatus on a non-pending row returns a clone with status unchanged.
    const decided = await store.setStatus("p-a", "approved", 9_000);
    expect(decided).toMatchObject({ id: "p-a", status: "approved", decidedAt: 9_000 });
    const reDecide = await store.setStatus("p-a", "rejected");
    expect(reDecide).toMatchObject({ id: "p-a", status: "approved", decidedAt: 9_000 });

    // setStatus on pending stamps decidedAt when omitted.
    const before = Date.now();
    const stamped = await store.setStatus("p-c", "rejected");
    expect(stamped!.decidedAt).toBeGreaterThanOrEqual(before);

    // Missing row → null; getById miss → null.
    expect(await store.setStatus("missing", "approved")).toBeNull();
    expect(await store.getById("missing")).toBeNull();
  });

  test("create stamps pending/decidedAt-null and validates payload; update writes only rationale/payload; delete hard-deletes", async () => {
    const store = new MemoryProposalStore();
    const created = await store.create({
      id: "p-created",
      projectId: "project-1",
      kind: "memory.tag",
      payload: { tags: ["a"] },
    });
    expect(created).toMatchObject({
      rationale: "",
      targetMemoryId: null,
      status: "pending",
      decidedAt: null,
    });

    await expect(
      store.create({
        id: "p-invalid",
        projectId: "project-1",
        kind: "memory.tag",
        payload: { content: "not a tag payload" } as any,
      }),
    ).rejects.toBeInstanceOf(ProposalPayloadValidationError);
    expect(await store.getById("p-invalid")).toBeNull();

    await store.setStatus(created.id, "approved", 4242);
    const updated = await store.update(created.id, {
      rationale: "revised",
      payload: { tags: ["b", "c"] },
    });
    // Paired-field guard: update never touches status/decidedAt.
    expect(updated).toMatchObject({
      rationale: "revised",
      payload: { tags: ["b", "c"] },
      status: "approved",
      decidedAt: 4242,
    });

    await expect(
      store.update(created.id, { payload: { content: "wrong kind" } as any }),
    ).rejects.toBeInstanceOf(ProposalPayloadValidationError);
    expect(await store.update("missing", { rationale: "x" })).toBeNull();

    expect(await store.delete(created.id)).toBe(created.id);
    expect(await store.getById(created.id)).toBeNull();
    expect(await store.delete(created.id)).toBeNull();
  });
});
