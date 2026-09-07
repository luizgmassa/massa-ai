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
 *   EB-SCH-3  The concurrency guard.                       (DECLARED SKIP — see below)
 *   EB-SCH-4  Catch-up is bounded to a single tick.        (partial — see below)
 *   EB-SCH-5  The scheduler never triggers an index.
 *   EB-SCH-6  nextRunAt survives an API restart.
 *
 * ── Stack profile required ──────────────────────────────────────────────────
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
 *      decay to >= 60 min, but the dashboard route projects only
 *      id/name/jobKind/enabled/nextRunAt/lastRunAt/due/currentlyRunning
 *      (dashboard.ts:32-43) — there is no `schedule`/`intervalMs` field on any
 *      HTTP surface, so the magnitude of the interval has no black-box sensor.
 *      The enable pattern, which is the half the preset exists for, IS asserted.
 *   4. EB-SCH-3 — DECLARED SKIP, printed at run time. Observing the guard needs
 *      a job that is actually executing (`running: Set<JobKind>`,
 *      scheduler.ts:116, surfaced as `currentlyRunning` at :533). Nothing on the
 *      HTTP surface fires a job on demand, and the `scheduler-on` profile
 *      configures no interval shorter than 30 minutes
 *      (scheduler-defaults.ts:69, :78), so no job fires inside a suite run.
 *      WHAT IT NEEDS: either a write surface that triggers one tick, or a stack
 *      profile that sets MASSA_AI_SCHEDULER_CONSOLIDATION_INTERVAL_MS to a
 *      few seconds so a real fire can be polled for. Neither exists today, and
 *      inventing one would mean running real memory consolidation against the
 *      acceptance database as a side effect of a status assertion.
 *   5. EB-SCH-4, missed-job half — DECLARED SKIP, printed at run time. The
 *      bound "one tick per missed job, never a stampede" needs a job whose
 *      persisted nextRunAt is already in the past by more than one tick
 *      (scheduler.ts:350-356). Producing one requires a >30 minute wait or a
 *      write surface for nextRunAt; neither exists. WHAT IS ASSERTED instead is
 *      the same predicate's other branch, which IS reachable: across a real API
 *      restart, catch-up fires ZERO ticks for jobs that were not missed, so
 *      lastRunAt does not move. That is a genuine bound, not a placeholder, but
 *      it is half of the scenario and is reported as such.
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
  console.log(
    "[EB-SCH-3:SKIP] concurrency guard not asserted — no HTTP surface fires a " +
      "scheduled job on demand and the scheduler-on profile configures no " +
      "interval shorter than 30 minutes, so no job executes inside a suite run.",
  );
  console.log(
    "[EB-SCH-4:PARTIAL] the missed-job branch of catch-up is not asserted — " +
      "producing a past-due nextRunAt needs a >30 minute wait or a write " +
      "surface for nextRunAt. The not-missed bound (catch-up fires zero ticks) " +
      "IS asserted across a real restart.",
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
      // DEFAULTS.tickMs = 60_000 (scheduler.ts:74-77); the scheduler-on profile
      // sets no MASSA_AI_SCHEDULER_TICK_MS override (e2e-stack.sh:166-168).
      expect(snapshot.body.tickIntervalMs).toBe(60_000);
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
describe.skipIf(!SCHEDULER_ON)("EB-SCH-2 SAFE_DEFAULTS preset", () => {
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

// ── EB-SCH-3 — concurrency guard (declared skip) ────────────────────────────
describe.skipIf(true)("EB-SCH-3 concurrency guard", () => {
  // DECLARED SKIP. See header declared-skip 4 for the full reason and for what
  // this scenario would need. The body is intentionally left unwritten rather
  // than filled with an assertion that cannot discriminate: with five distinct
  // jobKinds and no job ever executing during a run, "no two rows of the same
  // kind are currentlyRunning" (scheduler.ts:400-404, :429-432) is vacuously
  // true and would report coverage the suite does not have.
  test("EB-SCH-3: not asserted — no on-demand fire surface", () => {
    throw new Error("EB-SCH-3 is a declared skip; this body must never execute");
  });
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
        // KNOWN RED — this reports a product defect, not a test defect, and is
        // left failing for the same reason N6 was in Phase 0: it is telling the
        // truth. Measured on the dedicated stack, nextRunAt moved by exactly the
        // restart duration (1788749118946 -> 1788749139648, 20702 ms), i.e. it
        // was recomputed as now + intervalMs. Root cause, read from source:
        // `PgScheduledJobStore.get()` is synchronous and answers from an
        // in-memory mirror, firing `void this.ensureHydrated()` fire-and-forget
        // (scheduler-store-pg.ts:246-247). `registerDefaultJobs` runs
        // synchronously at boot (apps/tools-api/src/index.ts:288), before that
        // hydration can resolve, so `existing` is null for every job and
        // registerOrResumeJob takes its "New job" branch (scheduler.ts:210-212).
        // Hydration's own overlay then keeps the local value over the DB row
        // (scheduler-store-pg.ts:118-125), discarding what was persisted.
        //
        // Two consequences beyond this assertion: the documented "resume on
        // restart" contract is unreachable from the only path that calls it, and
        // `catchUpMissedJobs()` (Wave 5 FR-13) can never observe a missed job,
        // because every nextRunAt was just set to now + interval. A process that
        // restarts more often than a job's interval — 30 min for consolidation,
        // 60 min for decay — never fires that job at all.
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
