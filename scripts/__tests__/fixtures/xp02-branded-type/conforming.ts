/**
 * XP-02 compile-fixture (GREEN): the same insert() call as violating.ts, but
 * routed through scrubCredentials() — the only way to produce the branded
 * SanitizedPayloadJson value InsertableObservation.insert requires. This
 * file is never executed — it exists only to be type-checked by
 * scripts/__tests__/xp02-branded-type.test.ts, which asserts this produces
 * zero diagnostics.
 */
import { MemoryObservationStore } from "../../../../packages/core/src/data/memory/observation-contract.js";
import { scrubCredentials } from "../../../../packages/core/src/kernel/sanitize/credential-scrub.js";

const store = new MemoryObservationStore();

store.insert({
  id: "obs-1",
  projectId: "p",
  sessionId: null,
  source: "user-prompt",
  payloadJson: scrubCredentials(JSON.stringify({ prompt: "hello" })).sanitized,
  importance: 0.5,
  createdAt: Date.now(),
});
