# Spec — Admin portal restart button + restart-required proposal (APR)

**Feature slug:** `admin-portal-restart`
**Workflow:** spec-driven (Large) · session `spec-installer-marketplace-update`
**Status:** Specify draft (pending plan-challenge gate)
**User decision (2026-08-09):** Hybrid restart mode — supervised: exit &
let supervisor respawn; unsupervised: self-respawn; dev-watch: refuse with
explanation.

## Problem

Boot-only config is frozen at process start: `packages/shared/src/config/index.ts:523`
loads `config.json` once at module import; `env.ts:44-80` seeds env once;
`initAuth()` runs once (`apps/tools-api/src/index.ts:150`); Prisma client and
vector store are module-level singletons. `PUT /api/v1/config` already
computes `restartNeededSections` (`packages/shared/src/config/config-writer.ts:7,28-36`,
`RESTART_SECTIONS = ["database","embedding","llm","security"]`) and the UI
badges it — but nothing is wired to any action, and detection is
presence-based (submitting an unchanged value still claims restart needed).
No route calls `process.exit` or stops the Elysia server; `index.ts` exports
only `export type App`, not the instance.

## Requirements

- **APR-01 (restart endpoint):** `POST /api/v1/system/restart` (auth
  mandatory, NOT in `PUBLIC_PATHS`). Response first —
  `{ restarting: true, mode: "supervised" | "respawn" }` — then graceful
  drain (stop accepting, stop job reaper + scheduler, `disconnectPrisma()`,
  mirroring the SIGTERM path `index.ts:252-263`), then mode action.
- **APR-02 (mode selection):** `supervised` when `MASSA_AI_SUPERVISED=1` or
  `/.dockerenv` exists → drain + `process.exit(0)` (Docker Compose
  `restart: unless-stopped` respawns). Otherwise `respawn` → spawn detached
  replacement (same argv/env/cwd, stdio inherit) **after** the listener is
  stopped (no port race), then exit 0. Dev watcher (`MASSA_AI_DEV_WATCH=1`,
  set by the `dev` script) → `409 { error, reason: "dev watcher active" }`,
  no drain, no exit.
- **APR-03 (testable lifecycle seam):** drain/exit/spawn live behind an
  injectable lifecycle module — route tests assert the seam is invoked with
  the right mode and NEVER actually exit or spawn in tests.
- **APR-04 (UI restart button):** Config view gains a Restart Server button
  (write-mode gated, confirm dialog). On accept: POST restart → poll
  `GET /health` until the server answers again (bounded retries, visible
  status: restarting… / back at <version> / gave up after N s). On 409 show
  the reason verbatim.
- **APR-05 (diff-based restart proposal):** `PUT /api/v1/config` response's
  restart list becomes **diff-based**: a section is reported only when its
  merged value tree actually changed inside `RESTART_SECTIONS` (deep compare
  before vs after; masked-secret placeholder writes that change nothing do
  not count). After a save with a non-empty list, the UI shows a proposal
  banner — "Restart required to apply: <sections>. [Restart now]" — wired to
  the same APR-04 action. Empty list → no banner.
- **APR-06 (MCP surface exclusion):** the restart endpoint is Web-UI-only —
  NOT added to mcp-client tool-defs or the embedded endpoint map (same class
  as `model-registry-stream`). Embedded mode has no tools-api process; a
  restart tool would target the MCP host itself. The endpoint-parity contract
  must stay green without it.
- **APR-07 (Swagger):** route documented under a `system` tag with the mode
  semantics in `description`.
- **APR-08 (tests):** tools-api route tests (mode matrix: supervised env,
  dockerenv, respawn, dev-watch 409, auth 401); config-writer diff tests
  (changed vs unchanged vs masked-secret no-op); web-ui tests (button render
  write-mode gating, confirm flow, banner render on non-empty list, absent on
  empty, poll-recovery rendering). Real-HTTP assertion for the restart route
  response shape (bare-string/text-plain gotcha).
- **APR-09 (release):** CHANGELOG `### Added` (button + proposal) — minor.

## Edge cases

- Respawn child dies instantly (port taken by something else): parent already
  exited — UI poll gives "gave up" after bound; document in button help text.
- Two rapid restart clicks: second request lands after listener stop →
  connection refused → UI treats as restart-in-progress (poll path), not
  error.
- `MASSA_AI_SUPERVISED=1` under bare terminal (user error): exit with no
  respawn — documented knob semantics; the knob is explicit opt-in.
- Masked secrets: config GET masks sensitive values; a PUT echoing masks back
  must not count as a `security`/`database` change (APR-05 deep-compare runs
  on post-unmask merged values — reuse existing save-path semantics).

## Out of scope

- Restarting the MCP stdio server or host CLI sessions (existing
  `RESTART_SENTENCE` flow unchanged).
- Hot-reload of frozen config without restart (rejected: needs reset paths
  through config/prisma/vector/auth singletons — larger feature, wrong
  risk/benefit for an admin button).
- Env-only knobs (`MASSA_AI_API_PORT`, `MASSA_AI_EMBEDDED`) in the proposal
  banner — they have no config.json section to diff.

## Acceptance criteria

- AC-1: POST /api/v1/system/restart without key → 401; with key → 200
  `{restarting: true, mode}` and lifecycle seam called once with that mode.
- AC-2: mode matrix — `MASSA_AI_SUPERVISED=1` → supervised; `/.dockerenv`
  (seam-stubbed) → supervised; neither → respawn; `MASSA_AI_DEV_WATCH=1` →
  409 and seam NOT called.
- AC-3: respawn seam receives argv/cwd capture equal to the running
  process's; spawn ordered after listener-stop in the seam call sequence.
- AC-4: PUT /api/v1/config with a changed `embedding.dimensions` →
  restart list contains `embedding`; PUT re-sending identical values →
  empty list; PUT with only masked placeholders → empty list.
- AC-5: UI: write-mode off → no Restart button; on → button renders,
  confirm → POST → poll states render (restarting → recovered/gave-up).
- AC-6: UI: save response with `["embedding"]` → banner with section name +
  Restart now button; empty list → no banner.
- AC-7: endpoint absent from tool-defs and embedded map; parity suite green.
- AC-8: real-HTTP test asserts JSON content-type on the restart response.
- AC-9: CHANGELOG `### Added` bullet.
