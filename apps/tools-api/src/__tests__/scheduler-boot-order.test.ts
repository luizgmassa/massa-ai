/**
 * Boot-order call site for EB-SCH-6.
 *
 * `packages/core`'s `scheduler-boot-hydration.test.ts` proves that
 * `Scheduler.ready()` preserves a persisted schedule and that skipping it
 * resets one. That is a method test, and a method test cannot see whether the
 * boot sequence actually calls it — deleting the `await` in `index.ts` leaves
 * every core case green while restoring the defect in full.
 *
 * This file asserts the call site, and asserts it by ORDER: `ready()` must be
 * awaited *before* `registerDefaultJobs`, because registration is what reads
 * the store synchronously. A test that only checked both strings were present
 * would pass with them in the wrong order, which is the entire bug.
 *
 * `index.ts` boots a server on import, so it is read as source rather than
 * imported — the same approach `web-ui-trust.test.ts` takes for its own
 * module-level constants.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import path from "path";

const INDEX = path.resolve(import.meta.dir, "..", "index.ts");
const src = readFileSync(INDEX, "utf8");

describe("scheduler boot order (EB-SCH-6)", () => {
  test("index.ts awaits scheduler.ready() before registering default jobs", () => {
    const ready = src.indexOf("await scheduler.ready()");
    const register = src.indexOf("registerDefaultJobs(scheduler)");

    expect(ready).toBeGreaterThan(-1);
    expect(register).toBeGreaterThan(-1);
    expect(ready).toBeLessThan(register);
  });

  test("the await is inside the guarded block, so a hydration failure cannot kill boot", () => {
    // `ready()` is documented best-effort and must not reject, but the boot
    // sequence should not depend on that promise: an unguarded top-level await
    // would take the whole process down instead of logging "[scheduler] init
    // error" and serving requests without a scheduler.
    const tryIdx = src.indexOf("const scheduler = getScheduler();");
    const ready = src.indexOf("await scheduler.ready()");
    const catchIdx = src.indexOf("[scheduler] init error");

    expect(tryIdx).toBeGreaterThan(-1);
    expect(catchIdx).toBeGreaterThan(-1);
    expect(ready).toBeGreaterThan(tryIdx);
    expect(ready).toBeLessThan(catchIdx);
  });

  test("catch-up still runs after registration, not before", () => {
    // FR-13 ordering, unchanged by this fix and easy to break while editing
    // the same block: catchUpMissedJobs reads the schedules registration just
    // wrote, and start() takes over only afterwards.
    const register = src.indexOf("registerDefaultJobs(scheduler)");
    const catchUp = src.indexOf("scheduler.catchUpMissedJobs()");
    const start = src.indexOf("scheduler.start()");

    expect(register).toBeLessThan(catchUp);
    expect(catchUp).toBeLessThan(start);
  });
});
