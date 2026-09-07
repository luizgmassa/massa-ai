/**
 * T1.4 — Hooks / Handoffs / Auto-improvement proposals (E2E, live stack).
 *
 * Spec: `.specs/features/e2e-feature-battery/tasks.md:26`
 * (`28.hooks-handoffs-proposals.test.ts`, `EB-HOOK-1..3`, `EB-HO-1..3`,
 * `EB-AI-1..3`, "profile `hooks-off` for the 423 cases").
 *
 * ── Required stack profiles ───────────────────────────────────────────────
 * This file spans TWO stack states on purpose, and each 423 block declares the
 * one it needs. Nothing here mutates global state at runtime to fake a profile.
 *
 *   A. UNLOCKED (hooks/handoffs/auto-improve all enabled — the `default`
 *      profile, `scripts/e2e-stack.sh:151-153`):
 *          bash scripts/e2e-stack.sh up --profile default
 *      Covers EB-HOOK-2, EB-HOOK-3a, EB-HO-1, EB-HO-3, EB-AI-2, EB-AI-3.
 *
 *   B. LOCKED (the 423 cases). `e2e-stack.sh`'s `hooks-off` profile
 *      (`scripts/e2e-stack.sh:163-165`) sets ONLY `HOOKS_ENABLED=false`, so
 *      the hook 423s need:
 *          bash scripts/e2e-stack.sh restart-api --profile hooks-off
 *      and the handoff / proposal 423s need two further env overrides the
 *      profile does not carry (`HANDOFFS_ENABLED` — config/index.ts:868;
 *      `AUTO_IMPROVE_ENABLED` — config/index.ts:788-791):
 *          bash scripts/e2e-stack.sh restart-api --profile hooks-off \
 *               --env HANDOFFS_ENABLED=false --env AUTO_IMPROVE_ENABLED=false
 *      Covers EB-HOOK-1, EB-HOOK-3b, EB-HO-2, EB-AI-2b.
 *
 * Which state the running API is in is *probed*, once, at gate time — never
 * assumed and never forced. Whichever half does not apply prints a declared,
 * reasoned skip line naming the command that would enable it (AC-05).
 *
 * ── Gate variables ────────────────────────────────────────────────────────
 *   RUN_E2E=1                  (whole file; `_helpers.E2E_ENABLED`)
 *   the four fail-closed pins `e2e-stack.sh env` emits together
 *   MASSA_AI_API_KEY           (auth is mandatory under every profile, AD-011)
 *   No Ollama requirement: every surface here is LLM-free and embedding-free
 *   (hook ingestion is LLM-free by contract, `hook-service.ts:14-15`; the
 *   handoff dual-write is looked up by its deterministic id, not by search).
 *
 * ── Not duplicated (existing coverage, extended rather than restated) ─────
 *   - the 6 lifecycle kinds admitted → `11.lifecycle.test.ts:385` (F86b).
 *     EB-HOOK-1 extends it to the *locked* state, per kind.
 *   - >64 KiB payload rejected → `11.lifecycle.test.ts:333` (F89) and
 *     `15.nfr.test.ts:870` (N20, the cap). Not repeated here.
 *   - handoff begin/accept/cancel/list happy paths → `11.lifecycle.test.ts:473`
 *     (F90–F94). EB-HO-1 extends to the post-transition `list` state; EB-HO-3
 *     covers PATCH/DELETE, which have no live-stack coverage at all.
 *   - proposal list/approve-missing/reject-missing → `11.lifecycle.test.ts:669`
 *     (F95–F97), all negative-path. EB-AI-2/3 add the first end-to-end
 *     create → approve → applied and create → reject → not-applied pair.
 *
 * ── Declared skips (AC-05: a skip is a declared, reasoned line) ───────────
 *  1. EB-HOOK-2b — *forcing* writer-queue saturation. `WriterQueue.enqueue`
 *     admits and drains on the same promise chain, decrementing `pending` one
 *     admission per microtask turn (`services/hooks/writer-queue.ts:47-63`),
 *     and the persist itself is a synchronous insert (`hook-service.ts:266`).
 *     The original reason stopped at "no HTTP client can guarantee
 *     `pending >= 256`", which invited the obvious rebuttal: lower the
 *     threshold. That was tried and it does not work, so the finding is
 *     recorded here rather than left to be re-derived. `HOOKS_QUEUE_MAX_PENDING`
 *     (`packages/shared/src/config/index.ts:840-843`) is a real env knob, and
 *     at 1 it is verifiably in effect — `GET /api/v1/hooks/queue-status`
 *     answered `{"pendingCount":0,"maxPending":1,"saturated":false}`. Against
 *     that boot, measured 2026-09-07:
 *         POST /api/v1/hook/batch with 2, 10 and 50 events → 202, 202, 202
 *         400 concurrent POST /api/v1/hook                 → 202 x400, 429 x0
 *     So saturation is unreachable from the HTTP surface at ANY threshold, not
 *     merely at the default one, and the 429 branches (`routes/hooks.ts:58-62`,
 *     `:103-107`) have no live-stack sensor at all — only the unit tier's
 *     injected throw (`apps/tools-api/src/routes/hooks.test.ts:74`, `:131`).
 *     `11.lifecycle.test.ts` F87 carries the same finding. EB-HOOK-2 therefore
 *     asserts the two contracts that ARE deterministic — every response is 202
 *     or 429, never 5xx — and asserts the full 429 envelope (`Retry-After` +
 *     body) on every 429 actually observed, printing the count either way.
 *  2. EB-AI-1 — "at least 8 observations generate a proposal". NOT reachable
 *     over HTTP, and the reason below replaces an earlier one that has since
 *     become false. `AutoImproveJob.maybeRun` (`auto-improve-job.ts:95`) has no
 *     production call site — the hook bridge is wired to
 *     `ObservationConsolidationJob`, not to auto-improve
 *     (`hook-service.ts:336-352`) — and the only production trigger for
 *     `runOnce` is the scheduler's `auto-improve` job kind
 *     (`services/scheduler/scheduler-defaults.ts:255-260`).
 *     The old reason said that trigger "needs the `scheduler-on` profile", and
 *     that is no longer a blocker: `scripts/e2e-stack.sh`'s `scheduler-fast`
 *     profile now fires real scheduled jobs inside a suite run, and
 *     `MASSA_AI_SCHEDULER_AUTO_IMPROVE_ENABLED` +
 *     `MASSA_AI_SCHEDULER_AUTO_IMPROVE_INTERVAL_MS` would enable this kind the
 *     same way. The REAL blocker is the job's target: the handler resolves
 *     `(job.payload?.projectId as string) ?? "default"`
 *     (`scheduler-defaults.ts:257-258`), `registerDefaultJobs` registers the
 *     job with NO payload, and the scheduler exposes no write surface — the
 *     only HTTP endpoint it has is the read-only snapshot at
 *     `GET /api/v1/scheduler/status` (`routes/dashboard.ts:24`). So a fired
 *     auto-improve job always targets the literal project `"default"` and can
 *     never be pointed at an `e2e-ai-`-prefixed project this suite seeded with
 *     the 8 observations `minObservations` requires
 *     (`auto-improve-config.ts:20`). WHAT IT NEEDS: a payload or projectId
 *     write surface on the scheduler, or a non-scheduler trigger for
 *     `runOnce`. Neither exists; this is a product gap, not a stack one.
 *  3. EB-AI-2a — `REVIEW_GATE=true` holding a proposal. `reviewGate()` is read
 *     only inside `runOnce` (`auto-improve-ops.ts:69`), the same unreachable
 *     path as skip 2, so the gate has no HTTP-observable effect. Setting
 *     `AUTO_IMPROVE_REVIEW_GATE=true` (config/index.ts:792-795) without the
 *     scheduler changes nothing observable. Same owner as skip 2.
 *  4. EB-HOOK-3c — running the real hook binary
 *     (`apps/claude-plugin/hooks/massa-ai-hook.ts:305-330`) end to end. That
 *     is Tier B (harness) work, tasks.md:36-39. EB-HOOK-3 asserts the
 *     *server-side* contract of the pair of endpoints the binary POSTs to.
 *
 * No mocks, no stubs, no `mock.module`. Every projectId starts with `e2e-ai-`
 * and every row this file creates is deleted in `afterAll`.
 */
import { describe, test, expect, afterAll } from "bun:test";
import {
  API,
  E2E_ENABLED,
  PREFIX,
  RUN_STAMP,
  assertE2ePrefix,
  httpPost,
  httpRaw,
  pollUntil,
  probeAvailability,
  resetProject,
} from "./_helpers";

// ── Project + session identity (e2e-prefixed; reset in afterAll) ───────────
const PID = `${PREFIX}hhp-${RUN_STAMP}`;
const OTHER_PID = `${PREFIX}hhp-other-${RUN_STAMP}`;
assertE2ePrefix(PID);
assertE2ePrefix(OTHER_PID);

const SESSION = `eb-hhp-${RUN_STAMP}`;

/** packages/core/src/data/memory/observation-contract.ts:3 */
const LIFECYCLE_KINDS = [
  "session-start",
  "user-prompt",
  "pre-tool-use",
  "post-tool-use",
  "pre-compact",
  "session-end",
] as const;

// ── Gating ──────────────────────────────────────────────────────────────────

let SKIP_REASON = "";
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

function minimalEvent(kind: string, projectId = PID) {
  return {
    event: kind,
    projectId,
    sessionId: SESSION,
    payload: { probe: `eb-hhp-${RUN_STAMP}` },
  };
}

async function statusOf(endpoint: string, body: unknown): Promise<number> {
  const res = await httpRaw(endpoint, { method: "POST", body: JSON.stringify(body) });
  // Drain the body so the socket is released before the next probe.
  await res.text();
  return res.status;
}

/**
 * Probe each feature flag's HTTP-observable state ONCE. Each route answers 423
 * when its config flag is false:
 *   hooks        → routes/hooks.ts:49      (config `hooks.enabled`)
 *   handoffs     → routes/handoff.ts:71    (config `handoffs.enabled`)
 *   auto-improve → routes/proposals.ts:107 (config `memory.autoImprove.enabled`)
 * The handoff and proposal probes are read-only `list` calls. The hook probe
 * ingests one observation when hooks are enabled; it lands under PID and is
 * cleaned up in afterAll.
 */
const HOOKS_LOCKED = READY ? (await statusOf("/api/v1/hook", minimalEvent("session-start"))) === 423 : false;
const HANDOFFS_LOCKED = READY
  ? (await statusOf("/api/v1/handoff/list", { projectId: PID })) === 423
  : false;
const AUTO_IMPROVE_LOCKED = READY
  ? (await statusOf("/api/v1/proposal/list", { projectId: PID })) === 423
  : false;

if (!READY) {
  console.log(`[28.hooks-handoffs-proposals:SKIP] declared skip — ${SKIP_REASON}`);
} else {
  console.log(
    `[28] probed feature state: hooksLocked=${HOOKS_LOCKED} handoffsLocked=${HANDOFFS_LOCKED} ` +
      `autoImproveLocked=${AUTO_IMPROVE_LOCKED}`,
  );
  if (!HOOKS_LOCKED) {
    console.log(
      "[EB-HOOK-1] declared skip — the running API has hooks ENABLED, so the 423 cases " +
        "cannot be observed. Enable them with: bash scripts/e2e-stack.sh restart-api --profile hooks-off",
    );
  } else {
    console.log(
      "[EB-HOOK-2/EB-HOOK-3a] declared skip — the running API has hooks DISABLED, so " +
        "ingestion, saturation and a populated compaction snapshot cannot be observed. " +
        "Run this file again under: bash scripts/e2e-stack.sh restart-api --profile default",
    );
  }
  if (!HANDOFFS_LOCKED) {
    console.log(
      "[EB-HO-2] declared skip — handoffs are ENABLED on the running API. The 423 cases need: " +
        "bash scripts/e2e-stack.sh restart-api --profile hooks-off --env HANDOFFS_ENABLED=false " +
        "(the hooks-off profile itself does not set it — e2e-stack.sh:163-165).",
    );
  } else {
    console.log(
      "[EB-HO-1/EB-HO-3] declared skip — handoffs are DISABLED on the running API, so the " +
        "begin/accept/cancel/update/delete lifecycle cannot run. Re-run under --profile default.",
    );
  }
  if (!AUTO_IMPROVE_LOCKED) {
    console.log(
      "[EB-AI-2b] declared skip — auto-improve is ENABLED on the running API. The 423 cases need: " +
        "bash scripts/e2e-stack.sh restart-api --profile hooks-off --env AUTO_IMPROVE_ENABLED=false.",
    );
  } else {
    console.log(
      "[EB-AI-2/EB-AI-3] declared skip — auto-improve is DISABLED on the running API, so " +
        "proposal create/approve/reject/CRUD cannot run. Re-run under --profile default.",
    );
  }
  console.log(
    "[EB-AI-1] declared skip — no HTTP route triggers AutoImproveJob.runOnce. The only " +
      "production trigger is the scheduler's `auto-improve` job kind " +
      "(services/scheduler/scheduler-defaults.ts:255-260), and firing it is no longer the " +
      "blocker (the `scheduler-fast` profile fires real jobs inside a run). The blocker is " +
      "that the handler targets `job.payload?.projectId ?? \"default\"`, registerDefaultJobs " +
      "registers no payload, and the scheduler's only HTTP surface is the READ-ONLY " +
      "GET /api/v1/scheduler/status — so the job can never be pointed at an e2e-ai- project " +
      "carrying the 8 observations minObservations needs. Needs a product write surface; " +
      "see declared skip 2 in the header.",
  );
}

const HOOKS_ON = READY && !HOOKS_LOCKED;
const HANDOFFS_ON = READY && !HANDOFFS_LOCKED;
const AUTO_IMPROVE_ON = READY && !AUTO_IMPROVE_LOCKED;

// ── Rows this file created, torn down in afterAll ───────────────────────────
const createdHandoffIds: string[] = [];
const createdProposalIds: string[] = [];

afterAll(async () => {
  if (!READY) return;
  for (const id of createdHandoffIds) {
    await httpRaw(`/api/v1/handoff/${encodeURIComponent(id)}`, { method: "DELETE" })
      .then((r) => r.text())
      .catch(() => {});
  }
  for (const id of createdProposalIds) {
    await httpRaw(`/api/v1/proposal/${encodeURIComponent(id)}`, { method: "DELETE" })
      .then((r) => r.text())
      .catch(() => {});
  }
  for (const pid of [PID, OTHER_PID]) {
    await resetProject(pid).catch((e) =>
      console.log(`[28] cleanup failed for ${pid}: ${String(e?.message ?? e)}`),
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EB-HOOK — passive lifecycle capture.
// ═══════════════════════════════════════════════════════════════════════════

describe.skipIf(!READY || !HOOKS_LOCKED)(
  "EB-HOOK-1 — hooks disabled → 423 Locked (profile: hooks-off)",
  () => {
    test(
      // POST /api/v1/hook — apps/tools-api/src/routes/hooks.ts:46
      "every one of the 6 lifecycle kinds is refused with 423, not silently dropped",
      async () => {
        for (const kind of LIFECYCLE_KINDS) {
          const res = await httpRaw("/api/v1/hook", {
            method: "POST",
            body: JSON.stringify(minimalEvent(kind)),
          });
          const body = await res.json().catch(() => ({}));
          console.log(`[EB-HOOK-1] POST /hook ${kind} → ${res.status}`);
          // routes/hooks.ts:49-52
          expect(res.status).toBe(423);
          expect(body?.status).toBe(423);
          expect(body?.error).toBe("hooks disabled");
          // A refusal must not hand back an id — nothing was admitted.
          expect(body?.id).toBeUndefined();
        }
      },
      60_000,
    );

    test(
      // POST /api/v1/hook/batch — apps/tools-api/src/routes/hooks.ts:91
      "the batch route is refused the same way, and returns no ids",
      async () => {
        const res = await httpRaw("/api/v1/hook/batch", {
          method: "POST",
          body: JSON.stringify({ events: LIFECYCLE_KINDS.map((k) => minimalEvent(k)) }),
        });
        const body = await res.json().catch(() => ({}));
        console.log(`[EB-HOOK-1] POST /hook/batch (6 events) → ${res.status}`);
        // routes/hooks.ts:94-97
        expect(res.status).toBe(423);
        expect(body?.error).toBe("hooks disabled");
        expect(body?.ids).toBeUndefined();
      },
      30_000,
    );

    test(
      // POST /api/v1/hook/compact-snapshot — apps/tools-api/src/routes/hooks.ts:140
      "compact-snapshot is NOT behind the hooks lock — it has no hooksDisabled() guard",
      async () => {
        // hooks.ts:140-144 is the only route in the plugin with no
        // `if (hooksDisabled())` prologue. That asymmetry is the contract:
        // a session can still be summarised while ingestion is off.
        const res = await httpRaw("/api/v1/hook/compact-snapshot", {
          method: "POST",
          body: JSON.stringify({ sessionId: `${SESSION}-locked`, projectId: PID, persist: true }),
        });
        const body = await res.json().catch(() => ({}));
        console.log(
          `[EB-HOOK-3b] compact-snapshot under the hooks lock → ${res.status} ` +
            `eventCount=${body?.data?.eventCount} persistedId=${body?.data?.persistedId}`,
        );
        expect(res.status).toBe(200);
        expect(body?.success).toBe(true);
        expect(typeof body?.data?.snapshot).toBe("string");
        // No events could have been ingested for this session, and persist is
        // gated on eventCount > 0 (tools/compact_snapshot.ts:106).
        expect(body?.data?.eventCount).toBe(0);
        expect(body?.data?.persistedId).toBeUndefined();
      },
      30_000,
    );
  },
);

describe.skipIf(!HOOKS_ON)("EB-HOOK-2 — admission under load never 5xxs, and a 429 carries its full envelope", () => {
  test(
    "300 concurrent single-event POSTs: every response is 202 or 429, and each 429 is well-formed",
    async () => {
      const N = 300;
      const responses = await Promise.all(
        Array.from({ length: N }, (_, i) =>
          httpRaw("/api/v1/hook", {
            method: "POST",
            body: JSON.stringify({
              ...minimalEvent("user-prompt"),
              payload: { probe: `eb-hook-2-${RUN_STAMP}`, seq: i },
            }),
          }),
        ),
      );

      const statuses = responses.map((r) => r.status);
      const accepted = statuses.filter((s) => s === 202).length;
      const saturated = responses.filter((r) => r.status === 429);
      console.log(
        `[EB-HOOK-2] ${N} concurrent admissions → 202=${accepted} 429=${saturated.length} ` +
          `other=${statuses.filter((s) => s !== 202 && s !== 429).length}`,
      );

      // Deterministic half: the writer queue refuses, it never crashes.
      for (const s of statuses) {
        expect(s).toBeLessThan(500);
        expect([202, 429]).toContain(s);
      }
      expect(accepted).toBeGreaterThan(0);

      // Conditional half, asserted on every 429 actually observed. Zero 429s is
      // the documented, expected outcome on a machine fast enough to drain
      // between admissions — see declared skip 1 in the header.
      for (const res of saturated) {
        const body = await res.json().catch(() => ({}));
        // routes/hooks.ts:58-62
        expect(res.headers.get("retry-after")).toBe("1");
        expect(body?.error).toBe("writer queue saturated");
        expect(body?.retryAfter).toBe(1);
        expect(body?.id).toBeUndefined();
      }
      if (saturated.length === 0) {
        console.log(
          "[EB-HOOK-2] no 429 observed at this concurrency — the queue drained faster than " +
            "admissions arrived. The 429 envelope assertions did not execute; see declared skip 1.",
        );
      }

      // Drain the 202 bodies so no socket is left open into the next test.
      await Promise.all(responses.filter((r) => r.status === 202).map((r) => r.text()));
    },
    120_000,
  );
});

describe.skipIf(!HOOKS_ON)("EB-HOOK-3a — the pre-compact pair, and a snapshot built from real hook events", () => {
  const snapSession = `${SESSION}-precompact`;

  test(
    "the two POSTs the hook binary issues for pre-compact both succeed, and the snapshot sees the events",
    async () => {
      // The binary does exactly two POSTs for `pre-compact`
      // (apps/claude-plugin/hooks/massa-ai-hook.ts:305-330): the observation to
      // /api/v1/hook, and the snapshot to /api/v1/hook/compact-snapshot. This
      // test asserts the SERVER contract of that pair; running the binary
      // itself is Tier B (declared skip 4).

      // Seed the session with real ingested events so the snapshot has content.
      const seeded = await httpRaw("/api/v1/hook/batch", {
        method: "POST",
        body: JSON.stringify({
          events: [
            { ...minimalEvent("session-start"), sessionId: snapSession },
            { ...minimalEvent("user-prompt"), sessionId: snapSession },
            { ...minimalEvent("post-tool-use"), sessionId: snapSession },
          ],
        }),
      });
      const seedBody = await seeded.json().catch(() => ({}));
      console.log(`[EB-HOOK-3a] seed batch → ${seeded.status} ids=${(seedBody?.ids ?? []).length}`);
      // routes/hooks.ts:99-101
      expect(seeded.status).toBe(202);
      expect(Array.isArray(seedBody?.ids)).toBe(true);
      expect(seedBody.ids).toHaveLength(3);

      // POST 1 of the pair: the pre-compact observation itself.
      const obs = await httpRaw("/api/v1/hook", {
        method: "POST",
        body: JSON.stringify({ ...minimalEvent("pre-compact"), sessionId: snapSession }),
      });
      const obsBody = await obs.json().catch(() => ({}));
      console.log(`[EB-HOOK-3a] POST 1 (observation) → ${obs.status}`);
      expect(obs.status).toBe(202);
      expect(typeof obsBody?.id).toBe("string");

      // Persistence is fire-and-forget on the writer turn
      // (hook-service.ts:240-283), so poll the snapshot until the events land.
      let last: any = null;
      const settled = await pollUntil(
        async () => {
          const res = await httpRaw("/api/v1/hook/compact-snapshot", {
            method: "POST",
            body: JSON.stringify({ sessionId: snapSession, projectId: PID, persist: false }),
          });
          last = await res.json().catch(() => ({}));
          return (last?.data?.eventCount ?? 0) >= 4;
        },
        { timeoutMs: 60_000, intervalMs: 2_000 },
      );
      console.log(`[EB-HOOK-3a] snapshot eventCount=${last?.data?.eventCount} settled=${settled}`);
      expect(settled).toBe(true);

      // POST 2 of the pair: the snapshot, with persist:true exactly as the
      // binary sends it (massa-ai-hook.ts:319-324).
      const snap = await httpRaw("/api/v1/hook/compact-snapshot", {
        method: "POST",
        body: JSON.stringify({ sessionId: snapSession, projectId: PID, persist: true }),
      });
      const snapBody = await snap.json().catch(() => ({}));
      console.log(
        `[EB-HOOK-3a] POST 2 (snapshot, persist) → ${snap.status} ` +
          `eventCount=${snapBody?.data?.eventCount} persistedId=${snapBody?.data?.persistedId}`,
      );
      expect(snap.status).toBe(200);
      expect(snapBody?.success).toBe(true);
      // tools/compact_snapshot.ts:160-179
      expect(typeof snapBody?.data?.snapshot).toBe("string");
      expect(snapBody?.data?.eventCount).toBeGreaterThanOrEqual(4);
      expect(snapBody?.data?.sectionCount).toBeGreaterThan(0);
      expect(Array.isArray(snapBody?.data?.sections)).toBe(true);
      // persist is honoured only when eventCount > 0 (compact_snapshot.ts:106).
      expect(typeof snapBody?.data?.persistedId).toBe("string");
    },
    180_000,
  );

  test(
    "a session with no events yields a valid empty snapshot and persists nothing",
    async () => {
      const res = await httpRaw("/api/v1/hook/compact-snapshot", {
        method: "POST",
        body: JSON.stringify({
          sessionId: `${SESSION}-empty`,
          projectId: PID,
          persist: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      console.log(
        `[EB-HOOK-3a] empty session → ${res.status} eventCount=${body?.data?.eventCount} ` +
          `persistedId=${body?.data?.persistedId}`,
      );
      expect(res.status).toBe(200);
      expect(body?.success).toBe(true);
      expect(body?.data?.eventCount).toBe(0);
      expect(body?.data?.persistedId).toBeUndefined();
    },
    30_000,
  );

  test(
    "sessionId is required — the snapshot route refuses without inventing one",
    async () => {
      const res = await httpRaw("/api/v1/hook/compact-snapshot", {
        method: "POST",
        body: JSON.stringify({ projectId: PID }),
      });
      const body = await res.json().catch(() => ({}));
      console.log(`[EB-HOOK-3a] snapshot with no sessionId → ${res.status}`);
      // Elysia's body schema (routes/hooks.ts:146-147) makes sessionId
      // mandatory; the tool has its own guard at compact_snapshot.ts:89-91.
      // Either layer may answer first, so assert the refusal, not the layer.
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(body?.data?.persistedId).toBeUndefined();
    },
    30_000,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// EB-HO — cross-session handoffs.
// ═══════════════════════════════════════════════════════════════════════════

/** The dual-written memory row's id is deterministic:
 *  `handoff-mem-<handoffId>` — services/handoff/handoff-service.ts:338-340. */
function dualWriteMemoryId(handoffId: string): string {
  return `handoff-mem-${handoffId}`;
}

/** Read the dual-written memory row by its deterministic id. Uses
 *  POST /api/v1/memory/list (routes/memory.ts:243), which filters structurally
 *  rather than by embedding — so this never depends on Ollama or on FTS lag. */
async function findDualWriteMemory(projectId: string, handoffId: string): Promise<any | null> {
  const list = await httpPost<any>("/api/v1/memory/list", {
    projectId,
    // buildHandoffMemoryInput pins the type — handoff-service.ts:350
    type: "conversation",
    limit: 500,
  });
  const rows: any[] = list?.data?.memories ?? [];
  return rows.find((r) => r?.id === dualWriteMemoryId(handoffId)) ?? null;
}

async function beginHandoff(summary: string, extra: Record<string, unknown> = {}): Promise<string> {
  // POST /api/v1/handoff/begin — apps/tools-api/src/routes/handoff.ts:68
  const r = await httpPost<any>("/api/v1/handoff/begin", { projectId: PID, summary, ...extra });
  expect(r?.success).toBe(true);
  expect(r?.data?.ok).toBe(true);
  const id: string = r.data.id;
  expect(typeof id).toBe("string");
  createdHandoffIds.push(id);
  return id;
}

async function pendingIds(projectId = PID): Promise<string[]> {
  // POST /api/v1/handoff/list — apps/tools-api/src/routes/handoff.ts:200
  const r = await httpPost<any>("/api/v1/handoff/list", { projectId });
  expect(r?.success).toBe(true);
  return (r?.data?.pending ?? []).map((h: any) => h?.id);
}

describe.skipIf(!HANDOFFS_ON)("EB-HO-1 — begin→accept and begin→cancel both leave the pending list", () => {
  test(
    "an accepted handoff disappears from list, and a second accept is refused with a reason",
    async () => {
      const id = await beginHandoff(`EB-HO-1 accept path ${RUN_STAMP}`);
      expect(await pendingIds()).toContain(id);

      // POST /api/v1/handoff/accept — apps/tools-api/src/routes/handoff.ts:126
      const accept = await httpPost<any>("/api/v1/handoff/accept", { id, projectId: PID });
      console.log(`[EB-HO-1] accept ${id} → ok=${accept?.data?.ok}`);
      expect(accept?.success).toBe(true);
      expect(accept?.data?.ok).toBe(true);

      // `listPending` is open-only (handoff.ts:213), so accepted rows leave it.
      const after = await pendingIds();
      console.log(`[EB-HO-1] pending after accept contains the id: ${after.includes(id)}`);
      expect(after).not.toContain(id);

      const again = await httpRaw("/api/v1/handoff/accept", {
        method: "POST",
        body: JSON.stringify({ id, projectId: PID }),
      });
      const againBody = await again.json().catch(() => ({}));
      console.log(`[EB-HO-1] second accept → ${again.status} reason=${againBody?.data?.reason}`);
      // handoff.ts:140 — a domain rejection is HTTP 400 with {ok:false, reason}
      expect(again.status).toBe(400);
      expect(againBody?.data?.ok).toBe(false);
      expect(typeof againBody?.data?.reason).toBe("string");
    },
    90_000,
  );

  test(
    "a cancelled handoff leaves the pending list and can no longer be accepted",
    async () => {
      const id = await beginHandoff(`EB-HO-1 cancel path ${RUN_STAMP}`);
      expect(await pendingIds()).toContain(id);

      // POST /api/v1/handoff/cancel — apps/tools-api/src/routes/handoff.ts:163
      const cancel = await httpPost<any>("/api/v1/handoff/cancel", { id, projectId: PID });
      console.log(`[EB-HO-1] cancel ${id} → ok=${cancel?.data?.ok}`);
      expect(cancel?.success).toBe(true);
      expect(cancel?.data?.ok).toBe(true);
      expect(await pendingIds()).not.toContain(id);

      // open→expired is terminal for accept (handoff.ts:196 documents the
      // shared failure semantics with accept).
      const accept = await httpRaw("/api/v1/handoff/accept", {
        method: "POST",
        body: JSON.stringify({ id, projectId: PID }),
      });
      const acceptBody = await accept.json().catch(() => ({}));
      console.log(`[EB-HO-1] accept after cancel → ${accept.status} reason=${acceptBody?.data?.reason}`);
      expect(accept.status).toBe(400);
      expect(acceptBody?.data?.ok).toBe(false);
    },
    90_000,
  );

  test(
    "a handoff belonging to another project is invisible to this project's list",
    async () => {
      const mine = await beginHandoff(`EB-HO-1 scoping ${RUN_STAMP}`);
      const theirs = await httpPost<any>("/api/v1/handoff/begin", {
        projectId: OTHER_PID,
        summary: `EB-HO-1 other-project ${RUN_STAMP}`,
      });
      expect(theirs?.data?.ok).toBe(true);
      createdHandoffIds.push(theirs.data.id);

      const here = await pendingIds(PID);
      const there = await pendingIds(OTHER_PID);
      console.log(`[EB-HO-1] scoping: mine-in-here=${here.includes(mine)} theirs-in-here=${here.includes(theirs.data.id)}`);
      expect(here).toContain(mine);
      expect(here).not.toContain(theirs.data.id);
      expect(there).toContain(theirs.data.id);
      expect(there).not.toContain(mine);
    },
    90_000,
  );
});

describe.skipIf(!READY || !HANDOFFS_LOCKED)(
  "EB-HO-2 — handoffs disabled → 423 on every handoff route",
  () => {
    test(
      "all six routes answer 423 with {error:'handoffs disabled'} and mutate nothing",
      async () => {
        const cases: Array<{ label: string; endpoint: string; method: string; body?: unknown; line: string }> = [
          { label: "begin", endpoint: "/api/v1/handoff/begin", method: "POST", body: { projectId: PID, summary: "x" }, line: "routes/handoff.ts:71" },
          { label: "accept", endpoint: "/api/v1/handoff/accept", method: "POST", body: { id: "nope" }, line: "routes/handoff.ts:129" },
          { label: "cancel", endpoint: "/api/v1/handoff/cancel", method: "POST", body: { id: "nope" }, line: "routes/handoff.ts:166" },
          { label: "list", endpoint: "/api/v1/handoff/list", method: "POST", body: { projectId: PID }, line: "routes/handoff.ts:203" },
          { label: "update", endpoint: "/api/v1/handoff/nope", method: "PATCH", body: { summary: "x" }, line: "routes/handoff.ts:243" },
          { label: "delete", endpoint: "/api/v1/handoff/nope", method: "DELETE", line: "routes/handoff.ts:351" },
        ];

        for (const c of cases) {
          const res = await httpRaw(c.endpoint, {
            method: c.method,
            ...(c.body === undefined ? {} : { body: JSON.stringify(c.body) }),
          });
          const body = await res.json().catch(() => ({}));
          console.log(`[EB-HO-2] ${c.label} (${c.line}) → ${res.status}`);
          expect(res.status).toBe(423);
          expect(body?.error).toBe("handoffs disabled");
        }
      },
      60_000,
    );
  },
);

describe.skipIf(!HANDOFFS_ON)("EB-HO-3 — update and delete, and the dual-written memory", () => {
  test(
    "begin dual-writes a memory at its deterministic id, and a summary PATCH refreshes that row",
    async () => {
      const original = `EB-HO-3 original summary ${RUN_STAMP}`;
      const id = await beginHandoff(original, { openQuestions: ["q1"], nextSteps: ["s1"] });

      // The dual-write is best-effort inside begin (handoff-service.ts:183),
      // so poll rather than assume it landed synchronously.
      const appeared = await pollUntil(async () => (await findDualWriteMemory(PID, id)) !== null, {
        timeoutMs: 60_000,
        intervalMs: 2_000,
      });
      const before = await findDualWriteMemory(PID, id);
      console.log(`[EB-HO-3] dual-write memory ${dualWriteMemoryId(id)} present=${appeared}`);
      expect(appeared).toBe(true);
      // formatMemoryContent — handoff-service.ts:366-367
      expect(String(before?.content)).toContain(original);

      // PATCH /api/v1/handoff/:id — apps/tools-api/src/routes/handoff.ts:240
      const edited = `EB-HO-3 edited summary ${RUN_STAMP}`;
      const patch = await httpRaw(`/api/v1/handoff/${encodeURIComponent(id)}?projectId=${encodeURIComponent(PID)}`, {
        method: "PATCH",
        body: JSON.stringify({ summary: edited }),
      });
      const patchBody = await patch.json().catch(() => ({}));
      console.log(`[EB-HO-3] PATCH summary → ${patch.status}`);
      expect(patch.status).toBe(200);
      expect(patchBody?.success).toBe(true);
      expect(patchBody?.data?.summary).toBe(edited);

      // AC-01.8 — a summary edit must re-run formatMemoryContent and push the
      // new content into the memory row (handoff-service.ts:278-285).
      const refreshed = await pollUntil(
        async () => String((await findDualWriteMemory(PID, id))?.content ?? "").includes(edited),
        { timeoutMs: 60_000, intervalMs: 2_000 },
      );
      const after = await findDualWriteMemory(PID, id);
      console.log(`[EB-HO-3] memory content refreshed=${refreshed}`);
      expect(refreshed).toBe(true);
      expect(String(after?.content)).toContain(edited);
      expect(String(after?.content)).not.toContain(original);
    },
    240_000,
  );

  test(
    "PATCH is an allowlist: a non-editable field is rejected by name, and the row is unchanged",
    async () => {
      const id = await beginHandoff(`EB-HO-3 allowlist ${RUN_STAMP}`);
      for (const forbidden of ["status", "projectId", "id", "acceptedAt", "sourceSessionId"]) {
        const res = await httpRaw(`/api/v1/handoff/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ [forbidden]: "whatever" }),
        });
        const body = await res.json().catch(() => ({}));
        console.log(`[EB-HO-3] PATCH {${forbidden}} → ${res.status} ${body?.error}`);
        // routes/handoff.ts:250-256 — rejected BY NAME
        expect(res.status).toBe(400);
        expect(String(body?.error)).toContain("field not allowed");
        expect(String(body?.error)).toContain(forbidden);
      }
      // The handoff is still open and still listed — nothing was applied.
      expect(await pendingIds()).toContain(id);
    },
    120_000,
  );

  test(
    "PATCH/DELETE with a mismatched projectId is a real 404, not a 200 carrying success:false",
    async () => {
      const id = await beginHandoff(`EB-HO-3 mismatch ${RUN_STAMP}`);

      const patch = await httpRaw(
        `/api/v1/handoff/${encodeURIComponent(id)}?projectId=${encodeURIComponent(OTHER_PID)}`,
        { method: "PATCH", body: JSON.stringify({ summary: "should not apply" }) },
      );
      const patchBody = await patch.json().catch(() => ({}));
      console.log(`[EB-HO-3] PATCH with a foreign projectId → ${patch.status} ${patchBody?.error}`);
      // routes/handoff.ts:314-317
      expect(patch.status).toBe(404);
      expect(patchBody?.error).toBe("project-mismatch");

      const del = await httpRaw(
        `/api/v1/handoff/${encodeURIComponent(id)}?projectId=${encodeURIComponent(OTHER_PID)}`,
        { method: "DELETE" },
      );
      const delBody = await del.json().catch(() => ({}));
      console.log(`[EB-HO-3] DELETE with a foreign projectId → ${del.status} ${delBody?.error}`);
      // routes/handoff.ts:357-360
      expect(del.status).toBe(404);
      expect(delBody?.error).toBe("project-mismatch");

      // Still there, untouched.
      expect(await pendingIds()).toContain(id);
    },
    120_000,
  );

  test(
    "DELETE removes an OPEN handoff and deliberately leaves its dual-written memory behind",
    async () => {
      const marker = `EB-HO-3 delete path ${RUN_STAMP}`;
      const id = await beginHandoff(marker);
      await pollUntil(async () => (await findDualWriteMemory(PID, id)) !== null, {
        timeoutMs: 60_000,
        intervalMs: 2_000,
      });
      expect(await findDualWriteMemory(PID, id)).not.toBeNull();

      // DELETE /api/v1/handoff/:id — apps/tools-api/src/routes/handoff.ts:348
      const del = await httpRaw(`/api/v1/handoff/${encodeURIComponent(id)}`, { method: "DELETE" });
      const delBody = await del.json().catch(() => ({}));
      console.log(`[EB-HO-3] DELETE open handoff → ${del.status} id=${delBody?.data?.id}`);
      // routes/handoff.ts:361-362 — permitted in any status, including open.
      expect(del.status).toBe(200);
      expect(delBody?.success).toBe(true);
      expect(delBody?.data?.id).toBe(id);
      expect(await pendingIds()).not.toContain(id);

      // AC-01.5 — the memory row survives with a dangling metadata.handoffId.
      // This is documented behaviour (handoff-service.ts:305-309), so assert it
      // rather than treating it as an integrity break.
      const orphan = await findDualWriteMemory(PID, id);
      console.log(`[EB-HO-3] dual-write memory after delete: ${orphan ? "retained" : "gone"}`);
      expect(orphan).not.toBeNull();
      expect(String(orphan?.content)).toContain(marker);

      // A second DELETE is a real 404.
      const again = await httpRaw(`/api/v1/handoff/${encodeURIComponent(id)}`, { method: "DELETE" });
      const againBody = await again.json().catch(() => ({}));
      console.log(`[EB-HO-3] second DELETE → ${again.status} ${againBody?.error}`);
      expect(again.status).toBe(404);
      expect(againBody?.error).toBe("not-found");
    },
    240_000,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// EB-AI — auto-improvement proposals.
// ═══════════════════════════════════════════════════════════════════════════

async function createProposal(payload: Record<string, unknown>, rationale: string): Promise<string> {
  // POST /api/v1/proposal/create — apps/tools-api/src/routes/proposals.ts:219
  const r = await httpPost<any>("/api/v1/proposal/create", {
    projectId: PID,
    kind: "memory.create",
    payload,
    rationale,
  });
  expect(r?.success).toBe(true);
  const id: string = r?.data?.id;
  expect(typeof id).toBe("string");
  createdProposalIds.push(id);
  return id;
}

async function listPendingProposalIds(projectId = PID): Promise<string[]> {
  // POST /api/v1/proposal/list — apps/tools-api/src/routes/proposals.ts:104
  const r = await httpPost<any>("/api/v1/proposal/list", { projectId });
  expect(r?.success).toBe(true);
  return (r?.data?.pending ?? []).map((p: any) => p?.id);
}

async function findMemoryByContent(projectId: string, needle: string): Promise<any | null> {
  const list = await httpPost<any>("/api/v1/memory/list", { projectId, type: "pattern", limit: 500 });
  const rows: any[] = list?.data?.memories ?? [];
  return rows.find((r) => typeof r?.content === "string" && r.content.includes(needle)) ?? null;
}

describe.skipIf(!AUTO_IMPROVE_ON)("EB-AI-2 — approve applies the proposed edit; reject does not", () => {
  test(
    "approve: pending→approved, the memory is created, and the proposal leaves the pending list",
    async () => {
      const marker = `EB-AI-2 approved content ${RUN_STAMP}`;
      const id = await createProposal(
        { content: marker, type: "pattern", importance: 0.6, tags: ["eb-ai-2", "approved"] },
        "EB-AI-2 approve path",
      );
      expect(await listPendingProposalIds()).toContain(id);

      // POST /api/v1/proposal/approve — apps/tools-api/src/routes/proposals.ts:143
      const approve = await httpPost<any>("/api/v1/proposal/approve", { id, projectId: PID });
      console.log(`[EB-AI-2] approve ${id} → ok=${approve?.data?.ok} target=${approve?.data?.proposal?.targetMemoryId}`);
      expect(approve?.success).toBe(true);
      // services/jobs/auto-improve-ops.ts:91-141
      expect(approve?.data?.ok).toBe(true);
      expect(approve?.data?.proposal?.status).toBe("approved");
      const memId: string = approve?.data?.proposal?.targetMemoryId;
      // applyProposal mints `proposal-mem-<proposalId>-<uuid8>` when the
      // proposal has no target — auto-improve-apply.ts:106-108.
      expect(typeof memId).toBe("string");
      expect(memId.startsWith(`proposal-mem-${id}-`)).toBe(true);

      expect(await listPendingProposalIds()).not.toContain(id);

      // The applied edit really landed as a memory row.
      const applied = await pollUntil(async () => (await findMemoryByContent(PID, marker)) !== null, {
        timeoutMs: 60_000,
        intervalMs: 2_000,
      });
      const row = await findMemoryByContent(PID, marker);
      console.log(`[EB-AI-2] applied memory present=${applied} id=${row?.id}`);
      expect(applied).toBe(true);
      expect(row?.id).toBe(memId);

      // Approving twice is refused for the documented reason, not re-applied.
      const again = await httpRaw("/api/v1/proposal/approve", {
        method: "POST",
        body: JSON.stringify({ id, projectId: PID }),
      });
      const againBody = await again.json().catch(() => ({}));
      console.log(`[EB-AI-2] second approve → ${again.status} reason=${againBody?.data?.reason}`);
      // auto-improve-ops.ts:109 → routes/proposals.ts:157
      expect(again.status).toBe(400);
      expect(againBody?.data?.ok).toBe(false);
      expect(againBody?.data?.reason).toBe("not-pending");
    },
    180_000,
  );

  test(
    "reject: pending→rejected, NO memory is created, and the proposal leaves the pending list",
    async () => {
      const marker = `EB-AI-2 rejected content ${RUN_STAMP}`;
      const id = await createProposal(
        { content: marker, type: "pattern", tags: ["eb-ai-2", "rejected"] },
        "EB-AI-2 reject path",
      );
      expect(await listPendingProposalIds()).toContain(id);

      // POST /api/v1/proposal/reject — apps/tools-api/src/routes/proposals.ts:181
      const reject = await httpPost<any>("/api/v1/proposal/reject", {
        id,
        projectId: PID,
        reason: "EB-AI-2 negative control",
      });
      console.log(`[EB-AI-2] reject ${id} → ok=${reject?.data?.ok}`);
      expect(reject?.success).toBe(true);
      expect(reject?.data?.ok).toBe(true);
      expect(await listPendingProposalIds()).not.toContain(id);

      // routes/proposals.ts:213-215 — "no apply, no event". The negative is
      // the point of this case, so give the applier the same wall-clock budget
      // the approve path needed before concluding nothing was written.
      const leaked = await pollUntil(async () => (await findMemoryByContent(PID, marker)) !== null, {
        timeoutMs: 20_000,
        intervalMs: 2_000,
      });
      console.log(`[EB-AI-2] memory created by a REJECTED proposal: ${leaked}`);
      expect(leaked).toBe(false);
      expect(await findMemoryByContent(PID, marker)).toBeNull();
    },
    180_000,
  );
});

describe.skipIf(!READY || !AUTO_IMPROVE_LOCKED)(
  "EB-AI-2b — auto-improve disabled → 423 on every proposal route",
  () => {
    test(
      "all six routes answer 423 with {error:'auto-improve disabled'}",
      async () => {
        const cases: Array<{ label: string; endpoint: string; method: string; body?: unknown; line: string }> = [
          { label: "list", endpoint: "/api/v1/proposal/list", method: "POST", body: { projectId: PID }, line: "routes/proposals.ts:107" },
          { label: "approve", endpoint: "/api/v1/proposal/approve", method: "POST", body: { id: "nope" }, line: "routes/proposals.ts:146" },
          { label: "reject", endpoint: "/api/v1/proposal/reject", method: "POST", body: { id: "nope" }, line: "routes/proposals.ts:184" },
          { label: "create", endpoint: "/api/v1/proposal/create", method: "POST", body: { projectId: PID, kind: "memory.create", payload: { content: "x" } }, line: "routes/proposals.ts:222" },
          { label: "update", endpoint: "/api/v1/proposal/nope", method: "PATCH", body: { rationale: "x" }, line: "routes/proposals.ts:299" },
          { label: "delete", endpoint: "/api/v1/proposal/nope", method: "DELETE", line: "routes/proposals.ts:394" },
        ];

        for (const c of cases) {
          const res = await httpRaw(c.endpoint, {
            method: c.method,
            ...(c.body === undefined ? {} : { body: JSON.stringify(c.body) }),
          });
          const body = await res.json().catch(() => ({}));
          console.log(`[EB-AI-2b] ${c.label} (${c.line}) → ${res.status}`);
          expect(res.status).toBe(423);
          expect(body?.error).toBe("auto-improve disabled");
        }
      },
      60_000,
    );
  },
);

describe.skipIf(!AUTO_IMPROVE_ON)("EB-AI-3 — manual proposal CRUD", () => {
  test(
    "create validates kind and payload against the same table the reader enforces",
    async () => {
      // routes/proposals.ts:233-235 — kind must be one of PROPOSAL_KINDS.
      const badKind = await httpRaw("/api/v1/proposal/create", {
        method: "POST",
        body: JSON.stringify({ projectId: PID, kind: "memory.obliterate", payload: { content: "x" } }),
      });
      const badKindBody = await badKind.json().catch(() => ({}));
      console.log(`[EB-AI-3] create with an unknown kind → ${badKind.status}`);
      expect(badKind.status).toBe(400);
      expect(String(badKindBody?.error)).toContain("kind must be one of");

      // data/proposal/proposal-payload-validation.ts:51-60 — `memory.create`
      // requires `content` and allows no key outside its own list. The store
      // applies this on write so a row the reader would reject cannot be
      // written (AC-02.2).
      const badPayload = await httpRaw("/api/v1/proposal/create", {
        method: "POST",
        body: JSON.stringify({
          projectId: PID,
          kind: "memory.create",
          payload: { notAField: "x" },
        }),
      });
      const badPayloadBody = await badPayload.json().catch(() => ({}));
      console.log(`[EB-AI-3] create with an invalid payload → ${badPayload.status}`);
      // ProposalPayloadValidationError.statusCode is 400
      // (proposal-payload-validation.ts:106) and routes/proposals.ts:271-275
      // maps it through.
      expect(badPayload.status).toBe(400);
      expect(String(badPayloadBody?.error)).toContain("invalid for kind");

      const missingProject = await httpRaw("/api/v1/proposal/create", {
        method: "POST",
        body: JSON.stringify({ kind: "memory.create", payload: { content: "x" } }),
      });
      const missingBody = await missingProject.json().catch(() => ({}));
      console.log(`[EB-AI-3] create with no projectId → ${missingProject.status}`);
      // routes/proposals.ts:229-232
      expect(missingProject.status).toBe(400);
      expect(missingBody?.error).toBe("projectId required");
    },
    90_000,
  );

  test(
    "PATCH is an allowlist over rationale/payload; anything else is a 400 naming it",
    async () => {
      const id = await createProposal(
        { content: `EB-AI-3 patch subject ${RUN_STAMP}`, type: "pattern" },
        "EB-AI-3 original rationale",
      );

      for (const forbidden of ["kind", "targetMemoryId", "status", "projectId", "decidedAt"]) {
        const res = await httpRaw(`/api/v1/proposal/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ [forbidden]: "whatever" }),
        });
        const body = await res.json().catch(() => ({}));
        console.log(`[EB-AI-3] PATCH {${forbidden}} → ${res.status} ${body?.error}`);
        // routes/proposals.ts:306-312
        expect(res.status).toBe(400);
        expect(String(body?.error)).toContain("field not allowed");
        expect(String(body?.error)).toContain(forbidden);
      }

      // The editable pair really does apply.
      const edited = `EB-AI-3 edited rationale ${RUN_STAMP}`;
      const ok = await httpRaw(`/api/v1/proposal/${encodeURIComponent(id)}?projectId=${encodeURIComponent(PID)}`, {
        method: "PATCH",
        body: JSON.stringify({ rationale: edited }),
      });
      const okBody = await ok.json().catch(() => ({}));
      console.log(`[EB-AI-3] PATCH {rationale} → ${ok.status}`);
      expect(ok.status).toBe(200);
      expect(okBody?.success).toBe(true);
      expect(okBody?.data?.rationale).toBe(edited);
      expect(okBody?.data?.kind).toBe("memory.create");

      // A payload edit re-validates against the row's existing kind (AC-02.3).
      const badPatch = await httpRaw(`/api/v1/proposal/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ payload: { notAField: 1 } }),
      });
      const badPatchBody = await badPatch.json().catch(() => ({}));
      console.log(`[EB-AI-3] PATCH an invalid payload → ${badPatch.status}`);
      expect(badPatch.status).toBe(400);
      expect(String(badPatchBody?.error)).toContain("invalid for kind");
    },
    120_000,
  );

  test(
    "PATCH/DELETE on an unknown id, and on a foreign projectId, are real 404s",
    async () => {
      const ghost = `eb-ai-3-ghost-${RUN_STAMP}`;
      const patchGhost = await httpRaw(`/api/v1/proposal/${encodeURIComponent(ghost)}`, {
        method: "PATCH",
        body: JSON.stringify({ rationale: "x" }),
      });
      const patchGhostBody = await patchGhost.json().catch(() => ({}));
      console.log(`[EB-AI-3] PATCH unknown id → ${patchGhost.status} ${patchGhostBody?.error}`);
      // routes/proposals.ts:337-341
      expect(patchGhost.status).toBe(404);
      expect(patchGhostBody?.error).toBe("not-found");

      const delGhost = await httpRaw(`/api/v1/proposal/${encodeURIComponent(ghost)}`, { method: "DELETE" });
      const delGhostBody = await delGhost.json().catch(() => ({}));
      console.log(`[EB-AI-3] DELETE unknown id → ${delGhost.status} ${delGhostBody?.error}`);
      // routes/proposals.ts:399-403
      expect(delGhost.status).toBe(404);
      expect(delGhostBody?.error).toBe("not-found");

      const id = await createProposal(
        { content: `EB-AI-3 scoping subject ${RUN_STAMP}`, type: "pattern" },
        "EB-AI-3 scoping",
      );
      const foreign = await httpRaw(
        `/api/v1/proposal/${encodeURIComponent(id)}?projectId=${encodeURIComponent(OTHER_PID)}`,
        { method: "DELETE" },
      );
      const foreignBody = await foreign.json().catch(() => ({}));
      console.log(`[EB-AI-3] DELETE with a foreign projectId → ${foreign.status} ${foreignBody?.error}`);
      // routes/proposals.ts:404-407
      expect(foreign.status).toBe(404);
      expect(foreignBody?.error).toBe("project-mismatch");
      expect(await listPendingProposalIds()).toContain(id);
    },
    120_000,
  );

  test(
    "deleting an APPROVED proposal says, in the response, that the applied edit was not reversed",
    async () => {
      const marker = `EB-AI-3 approved-then-deleted ${RUN_STAMP}`;
      const id = await createProposal({ content: marker, type: "pattern" }, "EB-AI-3 delete-after-approve");
      const approve = await httpPost<any>("/api/v1/proposal/approve", { id, projectId: PID });
      expect(approve?.data?.ok).toBe(true);

      const del = await httpRaw(`/api/v1/proposal/${encodeURIComponent(id)}`, { method: "DELETE" });
      const delBody = await del.json().catch(() => ({}));
      console.log(`[EB-AI-3] DELETE approved proposal → ${del.status} note=${delBody?.data?.note}`);
      expect(del.status).toBe(200);
      expect(delBody?.success).toBe(true);
      expect(delBody?.data?.id).toBe(id);
      // routes/proposals.ts:419-421 — AC-02.5, stated in the response body.
      expect(delBody?.data?.note).toBe("approved proposal's applied memory edit was not reversed");

      // And it really was not reversed: the memory is still there.
      const still = await findMemoryByContent(PID, marker);
      console.log(`[EB-AI-3] applied memory after proposal delete: ${still ? "retained" : "gone"}`);
      expect(still).not.toBeNull();
    },
    180_000,
  );
});
