/**
 * XP-02 compile-fixture (RED): constructs an insert() call with a bare-string
 * payloadJson instead of routing it through scrubCredentials(). This file is
 * never executed — it exists only to be type-checked by
 * scripts/__tests__/xp02-branded-type.test.ts, which asserts this produces a
 * type diagnostic (InsertableObservation.payloadJson requires the branded
 * SanitizedPayloadJson type; a plain string is not assignable to it).
 */
import { MemoryObservationStore } from "../../../../packages/core/src/data/memory/observation-contract.js";

const store = new MemoryObservationStore();

store.insert({
  id: "obs-1",
  projectId: "p",
  sessionId: null,
  source: "user-prompt",
  payloadJson: JSON.stringify({ prompt: "hello" }), // bare string — must be rejected
  importance: 0.5,
  createdAt: Date.now(),
});
