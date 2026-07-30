/**
 * SEC-6 regression tests — CodeQL js/incomplete-sanitization (alerts #15-#17).
 *
 * buildRetrievalCall interpolated summary tokens into a code-like snippet with
 * `.replace(/"/g, '\\"')` — escaping double quotes but not backslashes. A
 * token containing `\"` broke out of the intended quoting and injected extra
 * text into the snapshot an agent reads on resume. The fix uses
 * JSON.stringify for every interpolated value.
 */

import { describe, expect, it } from "bun:test";
import { CompactionSnapshotService } from "../services/hooks/compaction-snapshot-service.js";
import type {
  Observation,
  ObservationStore,
} from "../data/memory/observation-repository.js";

function stubStore(observations: Partial<Observation>[]): ObservationStore {
  return {
    listBySession: () => observations as Observation[],
  } as unknown as ObservationStore;
}

describe("CompactionSnapshotService retrieval-call escaping", () => {
  it("JSON-escapes backslash-quote tokens in the retrieval call", () => {
    const malicious = 'a\\"; injected';
    const store = stubStore([
      {
        id: "obs-1",
        category: "tool-calls",
        payloadJson: JSON.stringify({ tool_name: malicious }),
      },
    ]);
    const snapshot = new CompactionSnapshotService(store).build({
      sessionId: "sess-1",
      projectId: "proj-1",
    });

    expect(snapshot.sections).toHaveLength(1);
    const call = snapshot.sections[0].retrievalCall;
    // The token must appear exactly as JSON.stringify would quote it — the
    // old manual escaping produced a different, break-out-able shape.
    expect(call).toContain(JSON.stringify(malicious));
    expect(call).not.toContain('"a\\"; injected"');
  });

  it("quotes projectId and sessionId as JSON strings", () => {
    const store = stubStore([
      {
        id: "obs-2",
        category: "tool-calls",
        payloadJson: JSON.stringify({ tool_name: "read_file" }),
      },
    ]);
    const snapshot = new CompactionSnapshotService(store).build({
      sessionId: "s",
      projectId: "p",
    });
    const call = snapshot.sections[0].retrievalCall;
    expect(call).toContain(`projectId: ${JSON.stringify("p")}`);
    expect(call).toContain(`sessionId: ${JSON.stringify("s")}`);
  });

  it("keeps ordinary tokens readable", () => {
    const store = stubStore([
      {
        id: "obs-3",
        category: "tool-calls",
        payloadJson: JSON.stringify({ tool_name: "read_file" }),
      },
    ]);
    const snapshot = new CompactionSnapshotService(store).build({
      sessionId: "sess-1",
      projectId: "proj-1",
    });
    expect(snapshot.sections[0].retrievalCall).toContain('"read_file"');
  });
});
