/**
 * compact_snapshot attribution (M45/HAR-01, plan-critic C4): the tool persists
 * outside HookService, so its persist seam must route through the attribution
 * resolver. DB-free: injected MemoryObservationStore + fake resolver.
 */
import { describe, expect, test } from "bun:test";
import { CompactSnapshotTool } from "../tools/compact_snapshot.js";
import {
  MemoryObservationStore,
  type InsertableObservation,
} from "../data/memory/observation-repository.js";
import type {
  AttributionInput,
  AttributionResult,
  AttributionResolverLike,
} from "../services/hooks/attribution-resolver.js";
import { scrubCredentials } from "../kernel/sanitize/credential-scrub.js";

class FakeResolver implements AttributionResolverLike {
  calls: AttributionInput[] = [];
  pins: Array<{ sessionId: string; projectId: string; source: string }> = [];
  constructor(private readonly result: AttributionResult) {}
  async resolve(input: AttributionInput): Promise<AttributionResult> {
    this.calls.push(input);
    return this.result;
  }
  pinSession(sessionId: string | null | undefined, projectId: string, source: AttributionResult["source"]): void {
    if (!sessionId) return;
    this.pins.push({ sessionId, projectId, source });
  }
}

function seededStore(): MemoryObservationStore {
  const store = new MemoryObservationStore();
  // XP-02: routed through scrubCredentials — store.insert() requires
  // InsertableObservation (branded payloadJson).
  store.insert({
    id: "obs-seed-1",
    projectId: "anything",
    sessionId: "s1",
    source: "user-prompt",
    category: "user-prompts",
    payloadJson: scrubCredentials(JSON.stringify({ prompt: "hello" })).sanitized,
    importance: 0.5,
    createdAt: Date.now(),
  });
  return store;
}

describe("CompactSnapshotTool attribution seam", () => {
  test("persist=true routes through the resolver with wire cwd and stamps provenance", async () => {
    const store = seededStore();
    const resolver = new FakeResolver({ projectId: "resolved-proj", source: "containment" });
    const tool = new CompactSnapshotTool({ store, resolver });
    const out = await tool.handle({
      sessionId: "s1",
      projectId: "junk",
      persist: true,
      cwd: "/repo/sub",
    });
    expect(out.success).toBe(true);
    expect(resolver.calls).toEqual([
      { callerProjectId: "junk", sessionId: "s1", cwd: "/repo/sub" },
    ]);
    const rows = store.listRecent("resolved-proj", 10);
    expect(rows.length).toBe(1);
    expect(rows[0].category).toBe("compaction-snapshots");
    expect(rows[0].attributionSource).toBe("containment");
    expect(store.countByProject("junk")).toBe(0);
  });

  test("persist without cwd resolves with undefined cwd", async () => {
    const store = seededStore();
    const resolver = new FakeResolver({ projectId: "junk", source: "verbatim" });
    const tool = new CompactSnapshotTool({ store, resolver });
    const out = await tool.handle({ sessionId: "s1", projectId: "junk", persist: true });
    expect(out.success).toBe(true);
    expect(resolver.calls[0].cwd).toBeUndefined();
    const rows = store.listRecent("junk", 10);
    expect(rows.some((r) => r.category === "compaction-snapshots")).toBe(true);
    expect(rows.find((r) => r.category === "compaction-snapshots")?.attributionSource).toBe("verbatim");
  });

  test("persist=false never resolves and never inserts", async () => {
    const store = seededStore();
    const resolver = new FakeResolver({ projectId: "resolved-proj", source: "containment" });
    const tool = new CompactSnapshotTool({ store, resolver });
    const out = await tool.handle({ sessionId: "s1", projectId: "junk", persist: false, cwd: "/repo" });
    expect(out.success).toBe(true);
    expect(resolver.calls.length).toBe(0);
    expect(store.rows.length).toBe(1); // seed only
  });

  test("eventCount=0 skips persist entirely", async () => {
    const store = new MemoryObservationStore(); // empty
    const resolver = new FakeResolver({ projectId: "resolved-proj", source: "containment" });
    const tool = new CompactSnapshotTool({ store, resolver });
    const out = await tool.handle({ sessionId: "ghost", projectId: "junk", persist: true, cwd: "/repo" });
    expect(out.success).toBe(true);
    expect(resolver.calls.length).toBe(0);
    expect(store.rows.length).toBe(0);
  });
});

describe("CompactSnapshotTool XP-02 credential redaction (independent HookService bypass)", () => {
  test("a credential surfaced into the snapshot summary is redacted in the tool's own persisted row", async () => {
    const secret = "AKIAABCDEFGHIJKLMNOP";
    const store = new MemoryObservationStore();
    // Simulates a pre-existing row written before this feature shipped (spec.md's
    // documented accepted limitation: "Pre-existing rows stay unsanitized").
    // compact_snapshot.ts persists independently of HookService (M45/HAR-01),
    // so its own scrub-before-persist boundary must catch a secret even when
    // it originates from upstream content this seam does not control.
    const legacyRow = {
      id: "obs-legacy-1",
      projectId: "anything",
      sessionId: "s1",
      source: "user-prompt",
      category: "user-prompts",
      payloadJson: JSON.stringify({ prompt: secret }),
      importance: 0.5,
      createdAt: Date.now(),
    } as unknown as InsertableObservation;
    store.insert(legacyRow);

    const resolver = new FakeResolver({ projectId: "resolved-proj", source: "containment" });
    const tool = new CompactSnapshotTool({ store, resolver });
    const out = await tool.handle({ sessionId: "s1", projectId: "junk", persist: true });
    expect(out.success).toBe(true);

    const snapshotRow = store
      .listRecent("resolved-proj", 10)
      .find((r) => r.category === "compaction-snapshots");
    expect(snapshotRow).toBeDefined();
    // The secret did surface into the human-readable snapshot xml...
    expect(out.data?.snapshot as string).toContain(secret);
    // ...but the tool's OWN persisted payloadJson (built independently from
    // scrub.sanitized, not from out.data.snapshot) must never carry it.
    expect(snapshotRow?.payloadJson).toContain("[REDACTED:aws-key]");
    expect(snapshotRow?.payloadJson).not.toContain(secret);
  });
});
