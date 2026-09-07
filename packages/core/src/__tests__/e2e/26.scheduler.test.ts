/**
 * T1.2 — In-process scheduler (E2E, live stack).
 *
 * The scheduler has zero E2E coverage today. Its only black-box surface is the
 * read-only snapshot at `GET /api/v1/scheduler/status`
 * (apps/tools-api/src/routes/dashboard.ts:24); everything else — `tick()`,
 * `registerJob`, `setEnabled`, `catchUpMissedJobs` — is in-process only
 * (packages/core/src/services/scheduler/scheduler.ts:392, :178, :245, :339).
 * That asymmetry is what decides which scenarios below are assertions and
 * which are declared skips.
 *
 * ── Scenario IDs covered ────────────────────────────────────────────────────
 *   EB-SCH-1  The master switch. Positive: with the scheduler enabled the
 *             surface responds un-degraded and reports running=true. Negative
 *             control: under every OTHER profile the same endpoint reports
 *             running=false with no job firing. Tier A is a profile matrix
 *             (FR-10), so both halves are executed by the matrix, one per run.
 *   EB-SCH-2  SAFE_DEFAULTS: the preset enables consolidation + decay and
 *             leaves auto-improve, observation-bridge and checkpoint-purge off.
 *   EB-SCH-3  The concurrency cap.        (profile `scheduler-fast` — see below)
 *   EB-SCH-3b A product defect that profile exposed.   (FIXED 2026-09-07 — see below)
 *   EB-SCH-4  Catch-up is bounded to a single tick.        (partial — see below)
 *   EB-SCH-5  The scheduler never triggers an index.
 *   EB-SCH-6  nextRunAt survives an API restart.
 *
 * ── Stack profiles required — this file is a TWO-profile matrix ─────────────
 *   `bash scripts/e2e-stack.sh up --profile scheduler-on`    (EB-SCH-1/2/4/5/6)
 *   `bash scripts/e2e-stack.sh up --profile scheduler-fast`  (EB-SCH-1/3/3b/5)
 *   Neither run alone covers the file. `scheduler-fast` is the ADDITIVE profile
 *   added for EB-SCH-3; `scheduler-on` keeps the production-shaped preset and
 *   is the only profile under which EB-SCH-2 and the restart block may run.
 *
 *   `bash scripts/e2e-stack.sh up --profile scheduler-on`
 *   That profile sets MASSA_AI_SCHEDULER_ENABLED=true and
 *   MASSA_AI_SCHEDULER_SAFE_DEFAULTS=true on the Tools API
 *   (scripts/e2e-stack.sh:166-168), overriding the common
 *   MASSA_AI_SCHEDULER_ENABLED=false at scripts/e2e-stack.sh:191.
 *
 * ── Gate variables ──────────────────────────────────────────────────────────
 *   RUN_E2E=1                    (E2E_ENABLED — the whole file self-skips otherwise)
 *   MASSA_AI_API_URL / MASSA_AI_DEDICATED / MASSA_AI_E2E_PROJECT_PATH / DATABASE_URL
 *                                (the four pins `e2e-stack.sh env` emits together)
 *   MASSA_AI_API_KEY             (auth is mandatory under AD-011)
 *   MASSA_AI_E2E_STATE_DIR       (optional; only used to locate the stack's
 *                                 state.env for the EB-SCH-6 restart pre-check)
 *   The scheduler profile is NOT read from this process's environment — the
 *   stack exports no MASSA_AI_SCHEDULER_* pin (scripts/e2e-stack.sh:483-500).
 *   It is DETECTED from the product's own surface instead.
 *
 * ── Declared skips (AC-05: a skip is a declared, reasoned line) ─────────────
 *   1. WHOLE FILE — skipped with a printed reason when RUN_E2E != 1 or the
 *      Tools API is not answering /health at MASSA_AI_API_URL.
 *   2. EB-SCH-2, EB-SCH-3, EB-SCH-4, EB-SCH-5, EB-SCH-6 — skipped with a
 *      printed reason when the live `GET /api/v1/scheduler/status` reports
 *      running=false, i.e. the stack is not on the `scheduler-on` profile.
 *      EB-SCH-1's negative control runs in exactly that case instead.
 *   3. EB-SCH-2, interval half — NOT ASSERTED. `applySafeDefaults`
 *      (scheduler-defaults.ts:189-219) also pins consolidation to >= 30 min and
 *      decay to >= 60 min, but the dashboard route projects no schedule shape:
 *      id/name/jobKind/enabled/nextRunAt/lastRunAt/due/currentlyRunning, plus
 *      the four health fields added with the EB-SCH-3b fix — and still no
 *      `schedule`/`intervalMs` on any HTTP surface, so the magnitude of the
 *      interval has no black-box sensor.
 *      The enable pattern, which is the half the preset exists for, IS asserted.
 *   4. EB-SCH-3 — CLOSED (was `describe.skipIf(true)`, a hardcoded permanent
 *      skip). The old reason said the guard needed either an on-demand fire
 *      surface or "a stack profile that sets
 *      MASSA_AI_SCHEDULER_CONSOLIDATION_INTERVAL_MS to a few seconds", and
 *      concluded "neither exists today". The first half is still true; the
 *      second was wrong about the product. That env var exists and is the TOP
 *      of the precedence chain (`envNum(def.intervalEnvVar, …)`,
 *      scheduler-defaults.ts:297-301), outranking both config.json and the
 *      >=30 min clamp in `applySafeDefaults` — the clamp only supplies the
 *      fallback. The stated objection (running real memory consolidation
 *      against the acceptance database) was sound, and is answered by choosing
 *      DIFFERENT kinds rather than by giving up: the new `scheduler-fast`
 *      profile fires `checkpoint-purge` (a bounded DELETE of already-expired
 *      rows) and `observation-bridge` (an immediate no-op while the LLM is
 *      off) at 5 s on a 1 s tick, and leaves consolidation and decay OFF.
 *      What the block asserts, and why `currentlyRunning` is NOT the sensor,
 *      is documented at the block itself.
 *   5. EB-SCH-4, missed-job half — STILL A SKIP, but its recorded blocker is
 *      GONE and the reason has narrowed twice.
 *
 *      The ORIGINAL reason said producing a past-due nextRunAt "requires a >30
 *      minute wait or a write surface for nextRunAt". `scheduler-fast` cut the
 *      wait to 15 seconds, so that stopped being true.
 *
 *      The SECOND reason blamed the EB-SCH-6 product defect: every job's
 *      nextRunAt was recomputed from `now` on each boot, so nothing could ever
 *      be past-due. Measured 2026-09-07 on `scheduler-fast` (tick 1 s, interval
 *      5 s), stopping the scheduler for 15 s and restarting:
 *          before  checkpoint-purge nextRunAt=1788787618332
 *          frozen  checkpoint-purge nextRunAt=1788787622743  (= boot + 5000)
 *          after   checkpoint-purge nextRunAt=1788787639376  (= boot + 5000)
 *      with zero "catch-up" lines in `/tmp/massa-ai-e2e-stack/logs/api.log`
 *      across all three boots. That reason is now FALSE: EB-SCH-6 was fixed in
 *      `a83e4f5d`. `apps/tools-api/src/index.ts` awaits the store's hydration
 *      before `registerDefaultJobs`, and `registerOrResumeJob`
 *      (scheduler.ts:216-229) preserves a past-due nextRunAt deliberately so
 *      `catchUpMissedJobs` (scheduler.ts:339-368) can identify what was missed.
 *
 *      WHAT IS ACTUALLY LEFT is only the setup cost: producing a genuinely
 *      past-due PERSISTED job across a restart needs the API down for longer
 *      than the job's interval, and no current profile makes that cheap — the
 *      restart itself is faster than the shortest interval on offer.
 *      WHAT IS ASSERTED instead is the same predicate's other branch: across a
 *      real restart, catch-up fires ZERO ticks for jobs that were not missed.
 *   6. EB-SCH-6 — skipped with a printed reason when the stack's own state file
 *      does not attest that THIS script started the API under the
 *      `scheduler-on` profile. Without that attestation `restart-api` either
 *      refuses (e2e-stack.sh:387-389) or silently no-ops via the
 *      "api already up" early return (e2e-stack.sh:314), and a no-op restart
 *      would make a nextRunAt-preservation assertion pass vacuously.
 *
 * ── Warning: this file restarts the dedicated API ───────────────────────────
 *   EB-SCH-6 runs `bash scripts/e2e-stack.sh restart-api` against :3334. It
 *   must not run while another suite is issuing requests. The uptime
 *   discriminator below turns a no-op restart into a failure rather than a
 *   vacuous pass.
 *
 * ── Row-leak trap respected ─────────────────────────────────────────────────
 *   `scheduler_jobs` rows persist in `massa_ai_test` across runs. Every
 *   assertion below is scoped by looking rows up BY ID rather than by array
 *   position or array length, and the boot path overwrites `enabled` on every
 *   row it owns (`registerOrResumeJob`, scheduler.ts:201-233), so a stale row
 *   cannot make an enable assertion pass or fail by accident.
 *
 * Read-only against the product: no production source, schema or dist changes.
 * No mocks, no stubs, no `mock.module` — this is the live-stack tier.
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  API,
  API_KEY,
  E2E_ENABLED,
  httpGet,
  httpRaw,
  pollUntil,
  probeAvailability,
} from "./_helpers";

const execFileAsync = promisify(execFile);

// ── Paths (resolved from this module, never from process.cwd()) ─────────────
const REPO_ROOT = path.resolve(import.meta.dir, "../../../../../");
const STACK_SCRIPT = path.join(REPO_ROOT, "scripts/e2e-stack.sh");
/** scripts/e2e-stack.sh:44 and :49 — same default, same override variable. */
const STATE_DIR = process.env.MASSA_AI_E2E_STATE_DIR ?? "/tmp/massa-ai-e2e-stack";
const STATE_FILE = path.join(STATE_DIR, "state.env");

// ── The default job table the boot wiring registers ─────────────────────────
//
// DEFAULT_SCHEDULED_JOBS — packages/core/src/services/scheduler/scheduler-defaults.ts:64-110.
// Registered unconditionally at boot (apps/tools-api/src/index.ts:288), so the
// rows exist under every profile; only `enabled` and `running` differ.
//
// `safeDefaultEnabled` is the state the SAFE_DEFAULTS preset produces
// (applySafeDefaults, scheduler-defaults.ts:189-219) given no per-kind env var
// and no `scheduler.jobs` block in config.json — and `e2e-stack.sh`'s scratch
// config writes neither (scripts/e2e-stack.sh:211-219). It is written out
// literally rather than recomputed from the product, so this is a contract
// assertion and not a restatement of the implementation.
interface ExpectedJob {
  id: string;
  jobKind: string;
  safeDefaultEnabled: boolean;
}
const EXPECTED_JOBS: readonly ExpectedJob[] = [
  { id: "scheduled-memory-consolidation", jobKind: "memory-consolidation", safeDefaultEnabled: true },
  { id: "scheduled-decay-sweep", jobKind: "decay-sweep", safeDefaultEnabled: true },
  { id: "scheduled-auto-improve", jobKind: "auto-improve", safeDefaultEnabled: false },
  { id: "scheduled-observation-bridge", jobKind: "observation-bridge", safeDefaultEnabled: false },
  { id: "scheduled-checkpoint-purge", jobKind: "checkpoint-purge", safeDefaultEnabled: false },
] as const;

const EXPECTED_KINDS = new Set(EXPECTED_JOBS.map((job) => job.jobKind));

// ── Types mirroring the route's projection (dashboard.ts:29-44) ─────────────
interface SchedulerStatusJob {
  id: string;
  name: string;
  jobKind: string;
  enabled: boolean;
  nextRunAt: number;
  lastRunAt: number;
  lastSuccessAt: number | null;
  consecutiveFailures: number;
  due: boolean;
  currentlyRunning: boolean;
}
interface SchedulerStatusBody {
  running: boolean;
  tickIntervalMs: number;
  jobs: SchedulerStatusJob[];
  unavailable?: boolean;
  error?: string;
}

/** GET /api/v1/scheduler/status — apps/tools-api/src/routes/dashboard.ts:24 */
async function readSchedulerStatus(): Promise<{
  status: number;
  contentType: string | null;
  body: SchedulerStatusBody;
}> {
  const res = await httpRaw("/api/v1/scheduler/status");
  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    body: (await res.json()) as SchedulerStatusBody,
  };
}

function jobById(body: SchedulerStatusBody, id: string): SchedulerStatusJob | undefined {
  return body.jobs.find((job) => job.id === id);
}

// ── Gating ──────────────────────────────────────────────────────────────────
let SKIP_REASON = "";
let SCHEDULER_SKIP_REASON = "";

const READY = await (async () => {
  if (!E2E_ENABLED) {
    SKIP_REASON = "RUN_E2E != 1";
    return false;
  }
  const a = await probeAvailability();
  if (!a.API_UP) {
    SKIP_REASON = `Tools API not up at ${API}`;
    return false;
  }
  return true;
})();

/**
 * Profile detection through the product's own surface. The stack exports no
 * MASSA_AI_SCHEDULER_* variable into the test process (e2e-stack.sh:483-500),
 * so `running` from the live snapshot is the only honest signal for which
 * profile the API was started under.
 */
const SCHEDULER_ON = await (async () => {
  if (!READY) return false;
  try {
    const snapshot = await readSchedulerStatus();
    if (snapshot.body?.running === true) return true;
    SCHEDULER_SKIP_REASON =
      `GET /api/v1/scheduler/status reported running=${String(snapshot.body?.running)}` +
      (snapshot.body?.unavailable ? " (route degraded)" : "") +
      " — the stack is not on the `scheduler-on` profile";
    return false;
  } catch (error) {
    SCHEDULER_SKIP_REASON =
      `GET /api/v1/scheduler/status did not answer: ${String((error as Error)?.message ?? error).slice(0, 160)}`;
    return false;
  }
})();

/** Parse the stack's `key=value` state file (e2e-stack.sh:130-138). */
function readStackState(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(STATE_FILE, "utf8").split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0) out[line.slice(0, eq)] = line.slice(eq + 1);
    }
  } catch {
    /* no state file — treated as "this script did not start the API" */
  }
  return out;
}

/**
 * Which stack profile the API was started under, read from the stack's own
 * state file. `SCHEDULER_ON` above is deliberately derived from the PRODUCT's
 * surface, not from this — but two profiles now report `running=true`
 * (`scheduler-on` and `scheduler-fast`) and they configure DIFFERENT job tables
 * and a different tick, so the profile name is needed to pick the right
 * expected values. Reading it is not a substitute for the product probe: a
 * block gated on the name still also requires `SCHEDULER_ON`.
 */
const STACK_PROFILE = readStackState().profile ?? "";

/** `scheduler-on`: SAFE_DEFAULTS preset, 60 s tick, production intervals. */
const PRESET_ON = SCHEDULER_ON && STACK_PROFILE === "scheduler-on";

/**
 * `scheduler-fast` (scripts/e2e-stack.sh): 1 s tick, MAX_CONCURRENT=1 and two
 * side-effect-safe kinds on a 5 s interval, so jobs REALLY FIRE inside a run.
 * This is what makes EB-SCH-3 assertable; see the block itself for the
 * measurement that motivated the profile.
 */
const SCHEDULER_FAST = SCHEDULER_ON && STACK_PROFILE === "scheduler-fast";

/** The tick each profile pins, stated as a contract rather than read back from
 *  the response it is asserting. `scheduler-on` sets no MASSA_AI_SCHEDULER_TICK_MS
 *  so it gets DEFAULTS.tickMs = 60_000 (scheduler.ts:74-77); `scheduler-fast`
 *  pins 1_000 unless MASSA_AI_E2E_SCHED_TICK_MS overrides it. */
const EXPECTED_TICK_MS: Record<string, number> = {
  "scheduler-on": 60_000,
  "scheduler-fast": Number(process.env.MASSA_AI_E2E_SCHED_TICK_MS ?? 1000),
};

/** The per-job interval `scheduler-fast` pins for its two enabled kinds. */
const FAST_INTERVAL_MS = Number(process.env.MASSA_AI_E2E_SCHED_INTERVAL_MS ?? 5000);

/** The two kinds `scheduler-fast` enables, in no particular order. */
const FAST_KIND_IDS = ["scheduled-checkpoint-purge", "scheduled-observation-bridge"] as const;

let RESTART_SKIP_REASON = "";
const RESTART_READY = (() => {
  if (!SCHEDULER_ON) {
    RESTART_SKIP_REASON = SCHEDULER_SKIP_REASON || SKIP_REASON;
    return false;
  }
  if (!existsSync(STACK_SCRIPT)) {
    RESTART_SKIP_REASON = `${STACK_SCRIPT} is absent from this checkout`;
    return false;
  }
  const state = readStackState();
  if (!state.api_pid) {
    RESTART_SKIP_REASON =
      `${STATE_FILE} records no api_pid — the API on ${API} was not started by ` +
      `e2e-stack.sh, so \`restart-api\` would hit the "api already up" early ` +
      `return (e2e-stack.sh:314) and no-op`;
    return false;
  }
  if (state.profile !== "scheduler-on") {
    RESTART_SKIP_REASON =
      `${STATE_FILE} records profile="${state.profile ?? ""}" — \`restart-api\` ` +
      `re-derives the profile from that field (e2e-stack.sh:465), so restarting ` +
      `now could bring the API back under a DIFFERENT profile`;
    return false;
  }
  return true;
})();

// ── Local SSE reader (no shared-helper edits; `_helpers.ts` has no SSE seam) ──
interface SseWindow {
  status: number;
  contentType: string | null;
  text: string;
  elapsedMs: number;
}

/** Hold `/api/v1/events` open for `windowMs` and return every frame received. */
async function collectSseWindow(endpoint: string, windowMs: number): Promise<SseWindow> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), windowMs);
  let text = "";
  let status = 0;
  let contentType: string | null = null;
  try {
    const res = await fetch(`${API}${endpoint}`, {
      headers: API_KEY ? { "x-api-key": API_KEY } : {},
      signal: controller.signal,
    });
    status = res.status;
    contentType = res.headers.get("content-type");
    const reader = res.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
    }
  } catch {
    // Expected: the window closes by aborting the request.
  } finally {
    clearTimeout(timer);
  }
  return { status, contentType, text, elapsedMs: Date.now() - started };
}

// ── Lifecycle ───────────────────────────────────────────────────────────────
beforeAll(() => {
  if (!READY) {
    console.log(`[EB-SCH:SKIP] whole file skipped — ${SKIP_REASON}`);
    return;
  }
  if (!SCHEDULER_ON) {
    console.log(
      `[EB-SCH-2..6:SKIP] ${SCHEDULER_SKIP_REASON}. ` +
        `Bring the stack up with: bash scripts/e2e-stack.sh up --profile scheduler-on`,
    );
  }
  if (!SCHEDULER_FAST) {
    console.log(
      "[EB-SCH-3/EB-SCH-3b:SKIP] declared skip — the concurrency cap needs jobs that " +
        `actually fire, which only the \`scheduler-fast\` profile produces. Stack profile is ` +
        `"${STACK_PROFILE || "unknown"}". Enable with: ` +
        "bash scripts/e2e-stack.sh up --profile scheduler-fast",
    );
  }
  console.log(
    "[EB-SCH-4:PARTIAL] the missed-job branch of catch-up is still not asserted, but its " +
      "recorded blocker is GONE as of 2026-09-07 (`a83e4f5d`) and this reason is now the " +
      "narrower one. The old text said a past-due job could not exist at boot by " +
      "construction, because every nextRunAt was recomputed from `now` — that was the " +
      "EB-SCH-6 defect, and it is fixed: index.ts awaits the store's hydration before " +
      "registering, and scheduler.ts preserves a past-due nextRunAt deliberately so " +
      "catch-up can identify which jobs were missed. What is still missing is only the " +
      "setup: producing a genuinely past-due persisted job across a restart needs an " +
      "outage longer than the job's interval, which no current profile makes cheap. " +
      "The not-missed bound (catch-up fires zero ticks) IS asserted across a real restart.",
  );
  if (SCHEDULER_ON && !RESTART_READY) {
    console.log(`[EB-SCH-4/EB-SCH-6:SKIP] ${RESTART_SKIP_REASON}`);
  }
});

// ── EB-SCH-1 — the master switch ────────────────────────────────────────────
describe.skipIf(!READY)("EB-SCH-1 scheduler master switch", () => {
  test(
    "EB-SCH-1: the scheduler surface responds and is not the degraded branch",
    async () => {
      // GET /api/v1/scheduler/status — apps/tools-api/src/routes/dashboard.ts:24
      const snapshot = await readSchedulerStatus();

      expect(snapshot.status).toBe(200);
      expect(snapshot.contentType).toContain("application/json");

      // The route swallows a scheduler failure into a degraded payload carrying
      // `unavailable: true` (dashboard.ts:45-54). That payload also has
      // running=false and jobs=[], so a test that only checked those two fields
      // could not tell "scheduler off" from "scheduler broken". This is the
      // discriminator.
      expect(snapshot.body.unavailable).toBeUndefined();
      expect(snapshot.body.error).toBeUndefined();

      expect(typeof snapshot.body.running).toBe("boolean");
      expect(Number.isInteger(snapshot.body.tickIntervalMs)).toBe(true);
      expect(snapshot.body.tickIntervalMs).toBeGreaterThan(0);
      expect(Array.isArray(snapshot.body.jobs)).toBe(true);

      // registerDefaultJobs runs unconditionally at boot (index.ts:288), so all
      // five rows exist under every profile. Looked up BY ID, never by index —
      // stale `scheduler_jobs` rows from an earlier run must not shift this.
      for (const expected of EXPECTED_JOBS) {
        const job = jobById(snapshot.body, expected.id);
        if (!job) {
          throw new Error(
            `EB-SCH-1: default job "${expected.id}" is absent. ` +
              `Rows present: ${JSON.stringify(snapshot.body.jobs.map((j) => j.id))}`,
          );
        }
        expect(job.jobKind).toBe(expected.jobKind);
        expect(typeof job.name).toBe("string");
        expect(typeof job.enabled).toBe("boolean");
        expect(Number.isFinite(job.nextRunAt)).toBe(true);
        expect(Number.isFinite(job.lastRunAt)).toBe(true);
        expect(typeof job.due).toBe("boolean");
        expect(typeof job.currentlyRunning).toBe("boolean");
      }
    },
    30_000,
  );

  test.skipIf(!SCHEDULER_ON)(
    "EB-SCH-1: with MASSA_AI_SCHEDULER_ENABLED=true the scheduler reports running",
    async () => {
      // Positive half. `running` is `started && timer !== null`
      // (scheduler.ts:382-384); `start()` returns without arming the timer when
      // the master switch is off (:299-302).
      const snapshot = await readSchedulerStatus();
      expect(snapshot.body.running).toBe(true);
      // The tick is profile-specific and is asserted EXACTLY, per profile —
      // `scheduler-on` sets no MASSA_AI_SCHEDULER_TICK_MS so it gets
      // DEFAULTS.tickMs = 60_000 (scheduler.ts:74-77), while `scheduler-fast`
      // pins its own. Reading the expectation from a table keyed on the stack's
      // recorded profile keeps this an exact-value assertion rather than
      // relaxing it to a range; an unknown profile is a failure, not a pass.
      const expectedTick = EXPECTED_TICK_MS[STACK_PROFILE];
      if (expectedTick === undefined) {
        throw new Error(
          `EB-SCH-1: the scheduler reports running=true under stack profile ` +
            `"${STACK_PROFILE}", which has no pinned tick in EXPECTED_TICK_MS ` +
            `(${JSON.stringify(Object.keys(EXPECTED_TICK_MS))}). A new ` +
            `scheduler-enabling profile must declare its tick here.`,
        );
      }
      expect(snapshot.body.tickIntervalMs).toBe(expectedTick);
    },
    30_000,
  );

  test.skipIf(SCHEDULER_ON)(
    "EB-SCH-1: negative control — off the scheduler-on profile nothing runs",
    async () => {
      // The other side of the matrix. Under `default` / `auth` / `hooks-off` /
      // `llm-on` the API inherits MASSA_AI_SCHEDULER_ENABLED=false
      // (e2e-stack.sh:191), so the rows still exist but the clock is disarmed
      // and no job can be firing.
      const snapshot = await readSchedulerStatus();
      expect(snapshot.body.unavailable).toBeUndefined();
      expect(snapshot.body.running).toBe(false);
      for (const job of snapshot.body.jobs) {
        expect(job.currentlyRunning).toBe(false);
      }
      // Rows are still registered even with the switch off (index.ts:288).
      expect(snapshot.body.jobs.length).toBeGreaterThan(0);
    },
    30_000,
  );
});

// ── EB-SCH-2 — SAFE_DEFAULTS ────────────────────────────────────────────────
// Gated on the `scheduler-on` profile SPECIFICALLY, not merely on
// running=true. `scheduler-fast` also reports running=true but deliberately
// does not set MASSA_AI_SCHEDULER_SAFE_DEFAULTS and enables a different pair of
// kinds, so running this block there would assert the preset's table against a
// stack that never applied the preset.
describe.skipIf(!PRESET_ON)("EB-SCH-2 SAFE_DEFAULTS preset", () => {
  test(
    "EB-SCH-2: the preset enables consolidation + decay and nothing else",
    async () => {
      // MASSA_AI_SCHEDULER_SAFE_DEFAULTS=true is set by the scheduler-on
      // profile (scripts/e2e-stack.sh:167). applySafeDefaults
      // (scheduler-defaults.ts:189-219) flips defaultEnabled for
      // memory-consolidation and decay-sweep only, and the docblock at :149-176
      // records the defect where a resolved-config read made the preset a
      // silent no-op with the variable still set. This is the sensor for that.
      const snapshot = await readSchedulerStatus();
      expect(snapshot.body.unavailable).toBeUndefined();

      const observed: Record<string, boolean> = {};
      for (const expected of EXPECTED_JOBS) {
        const job = jobById(snapshot.body, expected.id);
        if (!job) {
          throw new Error(
            `EB-SCH-2: default job "${expected.id}" is absent. ` +
              `Rows present: ${JSON.stringify(snapshot.body.jobs.map((j) => j.id))}`,
          );
        }
        observed[expected.id] = job.enabled;
      }

      const expectedTable = Object.fromEntries(
        EXPECTED_JOBS.map((job) => [job.id, job.safeDefaultEnabled]),
      );
      // Whole-table equality, not per-row: a preset that enabled a sixth thing
      // or silently disabled one of the two would otherwise slip through.
      expect(observed).toEqual(expectedTable);

      // The preset is explicitly documented NOT to enable auto-improve
      // (scheduler-defaults.ts:182-183, :217). Stated separately because it is
      // the one row a "safe defaults" preset is most likely to get wrong.
      expect(jobById(snapshot.body, "scheduled-auto-improve")!.enabled).toBe(false);
    },
    30_000,
  );

  test(
    "EB-SCH-2: every preset-enabled job has a future next run and has not fired",
    async () => {
      // The conservative-interval half of the preset has no HTTP sensor (see
      // declared skip 3 in the header). What IS observable is that a
      // freshly-registered enabled job is scheduled forward rather than left
      // due — `registerOrResumeJob` computes nextRunAt from now for a new row
      // (scheduler.ts:210-212) and `setEnabled` reschedules a past-due row on
      // re-enable (:252-255).
      const snapshot = await readSchedulerStatus();
      const now = Date.now();

      const enabledIds = EXPECTED_JOBS.filter((job) => job.safeDefaultEnabled).map((j) => j.id);
      expect(enabledIds.length).toBeGreaterThan(0);

      for (const id of enabledIds) {
        const job = jobById(snapshot.body, id)!;
        expect(job.enabled).toBe(true);
        // `due` is `enabled && nextRunAt <= now` computed server-side
        // (scheduler.ts:532). A conservative preset must not leave a job due
        // the moment it is registered.
        expect(job.nextRunAt).toBeGreaterThan(now - snapshot.body.tickIntervalMs);
      }
    },
    30_000,
  );
});

// ── EB-SCH-3 — the concurrency cap, on the `scheduler-fast` profile ─────────
//
// This was `describe.skipIf(true)` — a hardcoded permanent skip whose stated
// reason was "no HTTP surface fires a scheduled job on demand and the
// scheduler-on profile configures no interval shorter than 30 minutes". The
// first half is still true. The second half was a statement about the PROFILE,
// not about the product, and it was wrong about the product: the per-job
// interval env var is real and is the TOP of the precedence chain —
// `registerDefaultJobs` resolves `envNum(def.intervalEnvVar, fileJob?.intervalMs,
// def.schedule.intervalMs)` (scheduler-defaults.ts:297-301), so it outranks both
// config.json and the >=30 min clamp `applySafeDefaults` writes (:195-216),
// which only supplies the fallback. `scripts/e2e-stack.sh`'s new
// `scheduler-fast` profile uses it, on the two kinds whose handlers are
// side-effect-safe (see the profile's own comment for why NOT consolidation or
// decay).
//
// ── What is asserted, and what is NOT ───────────────────────────────────────
// NOT asserted: `currentlyRunning === true`. That was the sensor the old skip
// reason named, and it is unusable — measured 2026-09-07 over a 20 s window at
// a 150 ms poll on this exact profile: 132 samples, ZERO with any job
// `currentlyRunning`, because both handlers complete in well under one poll.
// An assertion built on it would be vacuously green. Its invariant half ("never
// more than maxConcurrent at once") IS still asserted below, but as a bound,
// never as the proof that anything ran.
//
// Asserted instead, and it is deterministic rather than racy: `fireJob` adds to
// `running` SYNCHRONOUSLY (scheduler.ts:460) and the tick loop never awaits
// between jobs, so when two jobs come due in the same tick and
// maxConcurrent === 1, the second hits the cap at :429-432 and is skipped
// WITHOUT its nextRunAt advancing — it fires on the NEXT tick instead. Both
// jobs are registered at boot with the same interval, so `registerOrResumeJob`
// gives them the same nextRunAt and they DO collide on their first tick. The
// cap therefore leaves a permanent, measurable stagger of exactly one tick
// between the two kinds' `lastRunAt`.
//
// That stagger is the sensor, and it is causal, not incidental. Measured on
// this stack:
//   MAX_CONCURRENT=1 → lastRunAt deltas 1001, 1001, 1001, 1001 ms (tick 1000)
//   MAX_CONCURRENT=2 → lastRunAt deltas 0, 0, 0 — byte-identical timestamps,
//                      because `tick(now)` passes the same `now` to every
//                      `fireJob` it makes in that pass (:435, :446, :502).
describe.skipIf(!SCHEDULER_FAST)("EB-SCH-3 concurrency cap", () => {
  interface Sample {
    atMs: number;
    tickIntervalMs: number;
    /** id → lastRunAt, for the profile's two enabled kinds only. */
    lastRunAt: Record<string, number>;
    runningCount: number;
  }

  let samples: Sample[] = [];
  let collectError: Error | null = null;

  beforeAll(async () => {
    if (!SCHEDULER_FAST) return;
    try {
      // Span four whole intervals, plus a tick of slack at each end. Three was
      // measurably too tight: run immediately after a restart the follower kind
      // reported only 2 distinct lastRunAt values against a floor of 2, because
      // its FIRST post-boot fire advances nextRunAt while lastRunAt stays 0
      // (observed on this stack — `observation-bridge last=0 next=…688438`,
      // where next had already moved 6001 ms). The extra interval is margin for
      // that, not a relaxation of the floor.
      const windowMs = FAST_INTERVAL_MS * 4 + EXPECTED_TICK_MS["scheduler-fast"] * 2;
      const started = Date.now();
      const collected: Sample[] = [];
      while (Date.now() - started < windowMs) {
        const snapshot = await readSchedulerStatus();
        const body = snapshot.body;
        const lastRunAt: Record<string, number> = {};
        for (const id of FAST_KIND_IDS) {
          const job = jobById(body, id);
          if (job) lastRunAt[id] = job.lastRunAt;
        }
        collected.push({
          atMs: Date.now() - started,
          tickIntervalMs: body.tickIntervalMs,
          lastRunAt,
          runningCount: body.jobs.filter((j) => j.currentlyRunning).length,
        });
        await new Promise((r) => setTimeout(r, 120));
      }
      samples = collected;
    } catch (error) {
      collectError = error as Error;
    }
  }, 120_000);

  test(
    "EB-SCH-3: the profile really fires jobs — without this the rest is vacuous",
    () => {
      if (collectError) throw collectError;
      expect(samples.length).toBeGreaterThan(20);
      expect(samples[0]!.tickIntervalMs).toBe(EXPECTED_TICK_MS["scheduler-fast"]);

      for (const id of FAST_KIND_IDS) {
        const distinct = [...new Set(samples.map((s) => s.lastRunAt[id]).filter((v) => v && v > 0))];
        console.log(`[EB-SCH-3] ${id}: ${distinct.length} distinct lastRunAt over the window`);
        // Three whole intervals were polled, so at least two fires must land in
        // the window. One would be consistent with a job that fired once at
        // boot and then stopped.
        expect(distinct.length).toBeGreaterThanOrEqual(2);
        // …and they must be moving FORWARD at the pinned interval, not jittering.
        const sorted = [...distinct].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) {
          const gap = sorted[i]! - sorted[i - 1]!;
          expect(gap).toBeGreaterThanOrEqual(FAST_INTERVAL_MS - 500);
          expect(gap).toBeLessThanOrEqual(FAST_INTERVAL_MS + 1500);
        }
      }
    },
    180_000,
  );

  test(
    "EB-SCH-3: with maxConcurrent=1 two jobs due in the same tick never fire in the same tick",
    () => {
      if (collectError) throw collectError;
      const tick = EXPECTED_TICK_MS["scheduler-fast"];
      const [a, b] = FAST_KIND_IDS;

      // Only samples in which BOTH kinds have already fired at least once can
      // carry the comparison; a `lastRunAt` of 0 is "never fired", not a time.
      const comparable = samples.filter(
        (s) => (s.lastRunAt[a] ?? 0) > 0 && (s.lastRunAt[b] ?? 0) > 0,
      );
      const deltas = [...new Set(comparable.map((s) => Math.abs(s.lastRunAt[a]! - s.lastRunAt[b]!)))];
      console.log(
        `[EB-SCH-3] comparable samples=${comparable.length}/${samples.length}, ` +
          `distinct |lastRunAt| deltas = ${JSON.stringify(deltas)} (tick ${tick} ms)`,
      );

      // Non-vacuity: there must BE something to compare.
      expect(comparable.length).toBeGreaterThan(5);

      // The cap's signature. A delta of exactly 0 is the uncapped behaviour —
      // `tick(now)` stamps every job it fires in one pass with the same `now`,
      // so two jobs firing in one tick are byte-identical, not merely close.
      expect(deltas).not.toContain(0);

      // A one-tick stagger presents as exactly TWO values, depending on which
      // side of the cycle the poll landed on. With the leader at L and the
      // capped follower one tick behind:
      //   polled after the follower fired  → |Δ| = tick
      //   polled after the leader fired    → |Δ| = interval - tick
      // Measured 2026-09-07 (tick 1000, interval 5000): {1001, 1002, 4003,
      // 4009, 4011} — the two clusters and nothing between them. Asserting
      // membership in those two clusters is STRICTER than a range, and it is
      // what excludes an unrelated 2500 ms drift as well as the uncapped 0.
      const tolerance = Math.max(250, tick / 2);
      const permitted = [tick, FAST_INTERVAL_MS - tick];
      for (const delta of deltas) {
        const nearest = permitted.reduce((best, p) =>
          Math.abs(delta - p) < Math.abs(delta - best) ? p : best,
        );
        if (Math.abs(delta - nearest) > tolerance) {
          throw new Error(
            `EB-SCH-3: |lastRunAt| delta ${delta} ms matches neither phase of a ` +
              `one-tick stagger (expected ~${permitted.join(" ms or ~")} ms, ` +
              `tolerance ${tolerance} ms). Observed deltas: ${JSON.stringify(deltas)}. ` +
              `A delta of 0 would mean the cap at scheduler.ts:429-432 did not skip ` +
              `the second job; anything else means the schedule is not what this ` +
              `profile pins.`,
          );
        }
      }
    },
    180_000,
  );

  test(
    "EB-SCH-3: no sample ever shows more concurrently-running jobs than the cap",
    () => {
      if (collectError) throw collectError;
      // The bound half of the guard (scheduler.ts:429-432, surfaced as
      // `currentlyRunning` at :533). Reported with the observed maximum so a
      // future reader can see whether it was exercised — on this profile the
      // handlers are far too fast for a 120 ms poll to catch one mid-flight,
      // which is exactly why the case above, and not this one, is what proves
      // the cap works.
      const maxSeen = Math.max(...samples.map((s) => s.runningCount));
      console.log(`[EB-SCH-3] max concurrently-running jobs observed = ${maxSeen} (cap 1)`);
      expect(maxSeen).toBeLessThanOrEqual(1);
    },
    180_000,
  );
});

// ── EB-SCH-3b — a product defect the `scheduler-fast` profile exposed ───────
//
// WAS KNOWN RED — FIXED 2026-09-07 in `8710e568`. Kept as a regression sensor,
// with the history, because the defect is the kind that reads as reasonable in
// review. It became findable only once jobs actually fired: before
// `scheduler-fast` no scheduled job had ever executed on any E2E profile, so no
// health field had a value to be wrong about.
//
// MECHANISM (historical): apps/tools-api/src/routes/dashboard.ts wrote
// `lastSuccessAt: null` and `consecutiveFailures: 0` as LITERALS into every job
// of the `/api/v1/scheduler/status` payload. It had nothing else to write —
// `Scheduler.status()` did not project either field, though both were
// maintained and persisted by `fireJob` (scheduler.ts:489-500).
//
// MEASURED 2026-09-07 on the `scheduler-fast` profile, before the fix, same
// instant, both kinds having fired successfully several times:
//   HTTP  GET /api/v1/scheduler/status → "lastSuccessAt":null, "consecutiveFailures":0
//   SQL   SELECT last_run_at, last_success_at FROM scheduled_jobs
//         scheduled-checkpoint-purge   → 1788787737541, 1788787737541
//         scheduled-observation-bridge → 1788787738542, 1788787738542
//
// IMPACT, which is why it was worth a product change rather than a skip: the
// only black-box health surface the scheduler has reported every job as
// never-succeeded and never-failed. A job failing on every single tick was
// indistinguishable over HTTP from a perfectly healthy one — the exact
// discrimination `consecutiveFailures` exists to provide.
//
// THE FIX: `Scheduler.status()` now projects lastSuccessAt, lastFailureAt,
// consecutiveFailures and lastError, and the route passes them through instead
// of writing constants. On the snapshot they are required rather than optional,
// so a consumer never has to tell "field absent" from "never succeeded" — that
// ambiguity is what let the literals read as reasonable in the first place.
describe.skipIf(!SCHEDULER_FAST)("EB-SCH-3b scheduler health fields are reported", () => {
  test(
    "EB-SCH-3b: a job that has succeeded reports a non-null lastSuccessAt",
    async () => {
      // Give the profile's interval a chance to produce at least one success.
      let job: SchedulerStatusJob | undefined;
      const deadline = Date.now() + FAST_INTERVAL_MS * 3;
      while (Date.now() < deadline) {
        const snapshot = await readSchedulerStatus();
        const found = jobById(snapshot.body, "scheduled-checkpoint-purge");
        if (found && found.lastRunAt > 0) {
          job = found;
          break;
        }
        await new Promise((r) => setTimeout(r, 250));
      }

      expect(job).toBeDefined();
      expect(job!.lastRunAt).toBeGreaterThan(0);
      console.log(
        `[EB-SCH-3b] lastRunAt=${job!.lastRunAt} lastSuccessAt=${String(job!.lastSuccessAt)} ` +
          `consecutiveFailures=${String(job!.consecutiveFailures)}`,
      );

      // The claim: a job the same payload says ran, and that the database
      // records as having succeeded, must not be reported as never-succeeded.
      expect(job!.lastSuccessAt).not.toBeNull();
    },
    120_000,
  );
});

// ── EB-SCH-5 — the scheduler never triggers an index ────────────────────────
describe.skipIf(!SCHEDULER_ON)("EB-SCH-5 scheduler never indexes", () => {
  test(
    "EB-SCH-5: every registered job kind is a non-indexing kind",
    async () => {
      // The rule is stated at scheduler-defaults.ts:26-29 ("the scheduler must
      // NEVER trigger indexing jobs (OOM risk)") and at
      // apps/tools-api/src/index.ts:283-284. This is the closed allowlist that
      // enforces it: a new job kind appearing here is meant to fail this test
      // so a human decides whether it can reach the indexer.
      const snapshot = await readSchedulerStatus();
      expect(snapshot.body.unavailable).toBeUndefined();
      expect(snapshot.body.jobs.length).toBeGreaterThan(0);

      const unexpected = snapshot.body.jobs.filter((job) => !EXPECTED_KINDS.has(job.jobKind));
      if (unexpected.length > 0) {
        throw new Error(
          `EB-SCH-5: ${unexpected.length} of ${snapshot.body.jobs.length} scheduled ` +
            `job(s) carry a kind outside the reviewed allowlist ` +
            `${JSON.stringify([...EXPECTED_KINDS])}: ` +
            JSON.stringify(unexpected.map((j) => ({ id: j.id, jobKind: j.jobKind }))),
        );
      }

      for (const job of snapshot.body.jobs) {
        expect(job.jobKind).not.toMatch(/index/i);
        expect(job.id).not.toMatch(/index/i);
      }
    },
    30_000,
  );

  test(
    "EB-SCH-5: no indexing event is emitted while the scheduler ticks",
    async () => {
      // GET /api/v1/events — apps/tools-api/src/routes/events.ts:19-20. The
      // stream carries indexing:started / :progress / :file / :completed /
      // :failed (events.ts:92-99), so an index triggered by anything in the
      // server shows up here.
      //
      // Bounded negative control, and stated as such: the window spans several
      // heartbeats, not a full 30-minute interval. It requires no other suite
      // or session to be indexing against this stack concurrently — the same
      // condition the whole live-stack tier already runs under.
      const windowMs = 12_000;
      const observed = await collectSseWindow("/api/v1/events", windowMs);

      expect(observed.status).toBe(200);
      expect(observed.contentType).toContain("text/event-stream");
      // Proof the stream was actually alive for the window rather than closing
      // immediately — otherwise "no indexing event" would be meaningless.
      expect(observed.text).toContain('"event":"connected"');
      expect(observed.text).toContain(": heartbeat");

      const indexingFrames = observed.text
        .split("\n")
        .filter((line) => line.startsWith("data: ") && /"event":"indexing:/.test(line));
      if (indexingFrames.length > 0) {
        throw new Error(
          `EB-SCH-5: ${indexingFrames.length} indexing event(s) arrived during a ` +
            `${windowMs} ms scheduler window: ${JSON.stringify(indexingFrames.slice(0, 3))}`,
        );
      }
      expect(indexingFrames.length).toBe(0);
    },
    120_000,
  );
});

// ── EB-SCH-4 + EB-SCH-6 — one real API restart, two properties ──────────────
describe.skipIf(!RESTART_READY)("EB-SCH-4/EB-SCH-6 restart survival", () => {
  let capturedAt = 0;
  let before: SchedulerStatusBody | null = null;
  let after: SchedulerStatusBody | null = null;
  let uptimeBefore = 0;
  let uptimeAfter = 0;
  let restartError: Error | null = null;

  beforeAll(async () => {
    if (!RESTART_READY) return;
    try {
      capturedAt = Date.now();
      before = (await readSchedulerStatus()).body;
      // GET /api/v1/system/info — apps/tools-api/src/routes/system.ts:58;
      // `uptime` is process.uptime() at :69.
      uptimeBefore = (await httpGet<any>("/api/v1/system/info"))?.uptime ?? 0;

      // `restart-api` re-derives the profile from the stack's own state file
      // (e2e-stack.sh:464-481) — RESTART_READY already asserted it says
      // "scheduler-on", so no --profile flag is passed and none is guessed.
      await execFileAsync("bash", [STACK_SCRIPT, "restart-api"], {
        cwd: REPO_ROOT,
        timeout: 240_000,
        encoding: "utf8",
      });

      const back = await pollUntil(
        async () =>
          (await fetch(`${API}/health`, { signal: AbortSignal.timeout(3_000) })).ok,
        { timeoutMs: 180_000, intervalMs: 2_000 },
      );
      if (!back) {
        throw new Error(`the API at ${API} did not answer /health after restart-api`);
      }

      uptimeAfter = (await httpGet<any>("/api/v1/system/info"))?.uptime ?? 0;
      after = (await readSchedulerStatus()).body;
    } catch (error) {
      restartError = error as Error;
    }
  }, 300_000);

  /** Jobs that were enabled and comfortably not-due when we captured them. */
  function survivalPopulation(): SchedulerStatusJob[] {
    const FIVE_MIN = 5 * 60 * 1000;
    return (before?.jobs ?? []).filter(
      (job) => job.enabled && job.nextRunAt > capturedAt + FIVE_MIN,
    );
  }

  test(
    "EB-SCH-6: the restart really replaced the process (no silent no-op)",
    () => {
      if (restartError) throw restartError;
      expect(before).not.toBeNull();
      expect(after).not.toBeNull();
      // `stop_one` returns early when the state file holds no api_pid, and
      // `start_api` then takes the "api already up" branch (e2e-stack.sh:314)
      // — leaving the ORIGINAL process running with everything preserved and a
      // nextRunAt assertion passing for the wrong reason. A monotonically
      // increasing process.uptime() is what makes that indistinguishable case
      // distinguishable.
      expect(uptimeBefore).toBeGreaterThan(0);
      if (!(uptimeAfter < uptimeBefore)) {
        throw new Error(
          `EB-SCH-6: process.uptime() did not reset (before=${uptimeBefore}s, ` +
            `after=${uptimeAfter}s) — restart-api did not replace the API process, ` +
            `so nothing below would be a real restart test`,
        );
      }
      expect(uptimeAfter).toBeLessThan(uptimeBefore);
    },
    30_000,
  );

  test(
    "EB-SCH-6: nextRunAt survives the restart for every not-due enabled job",
    () => {
      if (restartError) throw restartError;
      const population = survivalPopulation();
      // Print the population beside the verdict: an empty one would make the
      // loop below pass while proving nothing.
      if (population.length === 0) {
        throw new Error(
          `EB-SCH-6: no enabled job was more than 5 minutes from its next run at ` +
            `capture time, so there is nothing whose preservation could be observed. ` +
            `Rows seen: ${JSON.stringify(
              (before?.jobs ?? []).map((j) => ({
                id: j.id,
                enabled: j.enabled,
                inMs: j.nextRunAt - capturedAt,
              })),
            )}`,
        );
      }

      for (const job of population) {
        const resumed = jobById(after!, job.id);
        if (!resumed) {
          throw new Error(`EB-SCH-6: job "${job.id}" vanished across the restart`);
        }
        // registerOrResumeJob preserves the PERSISTED nextRunAt when the
        // schedule is unchanged (scheduler.ts:216-229); the row itself lives in
        // PostgreSQL via PgScheduledJobStore (scheduler-store-factory.ts:16-22),
        // which is what makes the value survive a process replacement at all.
        //
        // WAS KNOWN RED — FIXED 2026-09-07 in `a83e4f5d`. Kept as a regression
        // sensor, and the history kept with it, because the mechanism is subtle
        // enough for a plausible refactor to reintroduce it.
        //
        // Measured before the fix: nextRunAt moved by exactly the restart
        // duration (1788749118946 -> 1788749139648, 20702 ms), i.e. recomputed
        // as now + intervalMs. `PgScheduledJobStore.get()` is synchronous and
        // answers from an in-memory mirror, firing `void this.ensureHydrated()`
        // fire-and-forget (scheduler-store-pg.ts:262-265). `registerDefaultJobs`
        // ran at boot before that hydration could resolve, so `existing` was
        // null for every job and registerOrResumeJob took its "New job" branch.
        // Hydration's overlay then kept the local value over the DB row
        // (scheduler-store-pg.ts:118-125), discarding what was persisted.
        //
        // The repair is an optional `ready()` on the store contract, implemented
        // only by the PostgreSQL backend and awaited once in
        // `apps/tools-api/src/index.ts` before `registerDefaultJobs`. Reads stay
        // synchronous — the tick loop must not await inside a scheduling
        // decision — so deleting that one await restores the defect in full
        // while every unit test stays green. `scheduler-boot-order.test.ts`
        // guards the call site by ORDER for exactly that reason.
        expect(resumed.nextRunAt).toBe(job.nextRunAt);
        expect(resumed.enabled).toBe(job.enabled);
        expect(resumed.jobKind).toBe(job.jobKind);
      }

      // And the scheduler is running again after the restart, on the same profile.
      expect(after!.running).toBe(true);
      expect(after!.unavailable).toBeUndefined();
    },
    30_000,
  );

  test(
    "EB-SCH-4: boot catch-up fires ZERO ticks for jobs that were not missed",
    () => {
      if (restartError) throw restartError;
      const population = survivalPopulation();
      expect(population.length).toBeGreaterThan(0);

      // catchUpMissedJobs skips any job whose overdue margin is within one tick
      // (scheduler.ts:352-356) — "not a full backfill, exactly one tick per
      // missed job" (:329-338). None of these jobs was missed, so catch-up must
      // have fired none of them: lastRunAt is untouched and nothing is running.
      for (const job of population) {
        const resumed = jobById(after!, job.id)!;
        expect(resumed.lastRunAt).toBe(job.lastRunAt);
        expect(resumed.currentlyRunning).toBe(false);
      }

      // The missed-job branch of the same bound is a declared skip; see header
      // declared-skip 5 for exactly what it would need.
    },
    30_000,
  );
});
