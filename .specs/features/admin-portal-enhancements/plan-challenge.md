# Plan Challenge Record — admin-portal-enhancements (full gate, standalone fresh-eyes)

Plan Challenge full gate run (spec-driven + >5 files). The
`massa-ai-plan-critic` subagent was unavailable (model lookup failed:
"Model not found: opencode-go/minimax-m3"). Per policy, a strict
standalone fresh-eyes critique was run against the same output contract.
Seven findings, all folded.

Source verification performed before critique (not trust-by-reading):
- Confirmed 21 `data-action` attrs emitted by `renderConfig`,
  `renderProfiles`, `renderModelRegistry` in `app.js`; confirmed 0 of
  `config-save`, `config-reveal`, `profile-switch`, `registry-*` are
  wired in `wireViewHandlers()` (grep for these actions outside
  renderer emission lines returned empty).
- Confirmed `styles.css` defines 0 of `.config-section`, `.save-btn`,
  `.profile-card`, `.registry-grid`, `.badge`, `.tab-switcher`,
  `.regenerate-log`, `.index-progress`, `.success`.
- Confirmed `events.ts` streams SSE via `new Response(new ReadableStream({start, cancel}), {headers})` — Elysia passes the Response through for any method, so a POST streaming response works the same way.
- Confirmed existing blocking `/regenerate` uses `spawnSync` at `model-registry.ts:115`.
- Confirmed `GET /api/v1/project/index/status/:jobId` exists at `project.ts:397`.
- Confirmed `/api/v1/events` supports `?jobId=` filter (events.ts:8,26-27).

---

## F1 (critical) — Elysia POST streaming response: handler must return `Response`, not use `set`

**Assumption most likely to fail:** The design says "Set
`Content-Type: text/event-stream` + `X-Accel-Buffering: no`" and spawn the
child. But Elysia's streaming pattern (verified in `events.ts`) does NOT
use `set.headers` for the streaming response — it returns
`new Response(stream, { headers })` directly. If the new route sets
`set.headers` and returns a string or relies on Elysia's default JSON
serialization, the stream will be buffered/JSON-wrapped and the client's
`ReadableStream` reader will get a single chunk, not live lines.

**Deterministic falsifier:** Write the route using `set.headers["Content-Type"]
= "text/event-stream"` + returning a `ReadableStream` (without wrapping in
`new Response()`). Run `model-registry-stream.test.ts` — if the response
body arrives as a single buffered chunk instead of line-by-line SSE chunks,
the pattern is wrong.

**Fold:** T1 must follow the exact `events.ts` pattern: build a
`ReadableStream({ start, cancel })`, then `return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no" } })`. Do not use `set.headers` for streaming responses — `set` is for Elysia's built-in serialization path; returning a `Response` bypasses it. The `cancel` hook must kill the child process (`child.kill()`) so a client disconnect does not orphan the spawn. Added to T1 task checklist.

---

## F2 (critical) — In-memory overlay state lost on page reload: "unsaved indicator" warns but does not block

**Assumption most likely to fail:** `state.registryOverlay` lives in JS
memory. REG-WIRE-13 adds an "unsaved changes" indicator, but the spec
explicitly says "V1: indicator only, no blocking prompt" (design Risks
table). A user who edits 10 cells, then clicks a nav link (which calls
`render()` — a full `root.innerHTML` replacement), loses all in-memory
overlay state because `state.registryOverlay` is re-initialized from
`source.overlay` on every registry view render. The indicator does not
prevent this — it only shows after the damage is done.

**Deterministic falsifier:** In a test, set `state.registryOverlay` with a
cell edit (dirty=true), simulate a nav click to another view, then back to
the registry. Assert `state.registryOverlay` — if it reset to the
on-disk overlay (losing the unsaved cell edit), the indicator-only approach
leaks data.

**Fold:** Two changes: (1) `state.registryOverlay` must NOT be
re-initialized from `source.overlay` on every render — only on first load
or after a successful Save/Clear. Add a `state.registryLoaded` guard so
`render()` only re-initializes when the overlay is not already loaded. (2)
Add a `beforeunload` handler when `state.registryDirty` is true that
prompts "You have unsaved registry changes. Leave anyway?" — this is a
browser-native guard against accidental tab close / navigation. Both
added to T6 checklist. The spec assumption "indicator only, no blocking
prompt" is superseded: `beforeunload` is a guard, not an in-app prompt.

---

## F3 — Confirm-on-all-edits for config Save (non-destructive, auto-backup): document the tradeoff, do not remove

**Assumption most likely to fail:** The user explicitly requested
confirmation on every editing action. But config Save creates a backup
(`config.json.bak.<timestamp>`) and is reversible. A `confirm()` on every
section save (15 sections) could cause prompt fatigue — the user clicks
through without reading.

**Deterministic falsifier:** N/A — this is a UX tradeoff, not a correctness
risk. The user explicitly chose "Confirm all edits" in the scoping
question.

**Fold:** Keep confirm-on-all-edits (user decision). Document the tradeoff
in the CHANGELOG and the spec assumption table (already done: "User
explicitly requested confirmation on every editing action"). The confirm
message names the section + the backup-creation note so the user has
context. No plan change.

---

## F4 — Polling fallback `setInterval` orphan risk on view navigation

**Assumption most likely to fail:** T8 starts a `setInterval(2000)` for
index status polling when SSE is unavailable. If the user navigates away
from the Projects view, the interval keeps running, calling the status
endpoint for a jobId the user no longer cares about. Over a long session
this accumulates orphan intervals (one per index trigger).

**Deterministic falsifier:** In a test, trigger an index (start polling),
simulate a nav click to Memory view, wait 6s, assert no status poll calls
after the navigation. If polls continue, the interval is orphaned.

**Fold:** Store the interval ID in `state.indexPollInterval`. Clear it in
two places: (1) on terminal status (`completed`/`failed`/cap-reached);
(2) at the top of `render()` when `state.view !== "projects"` (clear
before rendering the new view). Also clear on `beforeunload`. Added to T8
checklist.

---

## F5 — `color-mix` CSS fallback: `--accent-tint` must be defined, not just mentioned

**Assumption most likely to fail:** The design says "Provide a
`--accent-tint` fallback variable with a static rgba." But the tasks.md
T3 checklist says "Provide `--accent-tint` fallback for `color-mix`" —
if the fallback is only mentioned in the checklist but not actually
defined in `:root` and `[data-theme="dark"]`, the `.overlay-sourced`
tint will be transparent (no background) in browsers without
`color-mix` support, making overlay cells indistinguishable from builtin
cells.

**Deterministic falsifier:** Open the registry view in a browser without
`color-mix` (or simulate by disabling the rule). Assert `.overlay-sourced`
cells have a visible tint. If the background is transparent, the fallback
is missing.

**Fold:** T3 must define `--accent-tint: rgba(37, 99, 235, 0.08)` in
`:root` and `--accent-tint: rgba(96, 165, 250, 0.12)` in
`[data-theme="dark"]`, then use `background: var(--accent-tint)` (not
`color-mix(...)`) as the primary rule, with `color-mix` as a progressive
enhancement override if desired. The static rgba is the baseline; the
fallback IS the rule. Added to T3 checklist.

---

## F6 — Task granularity: T6 (registry CRUD + save + clear + in-memory state) is large

**Assumption most likely to fail:** T6 wires cell edits, hostDefaults,
workflowTiers, add, duplicate, delete, restore, save overlay, clear
overlay, and the unsaved indicator — 13 ACs (REG-WIRE-01..13). This is
the largest single task. The risk is that the in-memory state management
(cell edit → dirty → indicator → save → reset) has hidden coupling that a
single task commits atomically without intermediate verification.

**Deterministic falsifier:** If T6's test file (`admin-handlers.test.ts`)
has a test that fails because the state management logic was written in
the wrong order (e.g., dirty flag set after re-render instead of before),
the single-task granularity hid the coupling.

**Fold:** Keep T6 as one task (it is one cohesive feature — the in-memory
overlay state is the shared coupling, splitting it would create two
tasks that each need the state). But add an intermediate gate: after
wiring cell edits + add/duplicate/delete/restore (the in-memory
mutations), run `bun test admin-handlers.test.ts` for those cases BEFORE
wiring save/clear. This gives a checkpoint within the task. Added to T6
checklist as a mid-task gate.

---

## F7 — Plan touches 10+ files; no security/irreversible concern, but confirm the file list

**Assumption most likely to fail:** The plan touches: `app.js`,
`styles.css`, `model-registry-stream.ts` (new),
`model-registry-stream.test.ts` (new), `admin-handlers.test.ts` (new),
`apps/tools-api/src/index.ts`, `STATE.md`, `FEATURES.json`, `HANDOFF.md`,
`CHANGELOG.md` = 10 files. The >5-file threshold triggered the full gate.
No file is in a high-risk domain (security, auth, migration,
irreversible). The new route spawns a child process that writes to
installed agent dirs — but the existing blocking `/regenerate` route
already does this, and the new route is additive (not replacing).

**Deterministic falsifier:** Confirm no file outside the listed set is
mutated. `git diff --stat` after Execute must show exactly these files.

**Fold:** Record the file list in the spec Further Notes (already done
implicitly via the tasks.md `Where` fields). No high-risk escalation needed
— the child-process spawn is an existing capability, not a new
irreversible operation. The `beforeunload` guard (F2 fold) is a new
browser-native prompt, not a server-side mutation.

---

## Summary

Seven findings. Two critical (F1 Elysia streaming pattern, F2 in-memory
state preservation), five medium/low. All folded into the task
checklists. No plan restructuring needed — the folds are checklist
additions and one spec-assumption supersession (F2: `beforeunload` guard
added). The plan is approved for Execute with the folds applied.