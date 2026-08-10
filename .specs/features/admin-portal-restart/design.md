# Design — admin-portal-restart

## Components

1. **`apps/tools-api/src/lifecycle.ts` (new).** Owns shutdown orchestration +
   restart-mode policy. Exports:
   - `detectRestartMode(env, fsProbe)` → `"supervised" | "respawn" | "dev-watch"`
     — pure, fully parameterized (env record + `/.dockerenv` probe fn) for
     tests.
   - `setServerStopper(fn)` — `index.ts` registers `() => app.stop()` after
     `listen()`; lifecycle never imports the app (avoids the index-exports-
     only-a-type constraint without circular imports).
   - `shutdownAndRestart(mode, seams)` — sequence: stop listener → stop
     reaper/scheduler → `disconnectPrisma()` → (`respawn`: spawn detached
     child) → `exit(0)`. `seams = { spawn, exit, stopJobs }` injectable;
     production defaults `Bun.spawn` / `process.exit`.
   - SIGTERM/SIGINT handlers in `index.ts:252-263` refactored to call the
     same drain path (one shutdown implementation, CONTRIBUTING step-6: one
     invariant surface).
2. **`apps/tools-api/src/routes/restart.ts` (new) + `restart.test.ts`.**
   Elysia route `POST /api/v1/system/restart`. Responds, then
   `setTimeout(→ shutdownAndRestart(mode), 50)` so the response flushes
   before the listener stops (deliver-before-ack, CONTRIBUTING step 5; the
   timer handle is the seam boundary in tests). 409 on dev-watch, no
   side effects.
3. **`packages/shared/src/config/config-writer.ts`.** `savePartialConfig`
   already holds before+after trees; add
   `changedRestartSections(before, after): string[]` (deep-equal per
   RESTART_SECTIONS subtree, post-unmask merge) and return it from the save
   result. Presence-based `restartNeededSections` stays exported (other
   callers/UI badges keep semantics until swapped at the call site in the PUT
   route). Twin-contract discipline: server change + Web UI display change
   land in the same task with sensors on both sides (delta-contract-twin
   lesson).
4. **`apps/web-ui/src/static/app.js`.** (a) Restart button in the Config view
   header (write-mode gated, `data-action="server-restart"`), confirm via
   existing confirm pattern; handler POSTs, then polls `GET /health` (1 s
   interval, 30 s bound) rendering restarting/recovered/gave-up states.
   (b) Save handler (`handleConfigSave`, app.js:1707-1725) reads the new
   diff-based list from the PUT response → renders proposal banner with
   `data-action="server-restart"` reuse. (c) 409 body reason shown verbatim
   (preserve-specific-diagnostics lesson from APUX fix-loop 1).
5. **`apps/tools-api/package.json`** `dev` script gains `MASSA_AI_DEV_WATCH=1`
   (deterministic watcher detection — no argv sniffing).

## Mode policy (locked by user decision)

| Condition (first match) | Mode |
|---|---|
| `MASSA_AI_DEV_WATCH=1` | 409 dev-watch refusal |
| `MASSA_AI_SUPERVISED=1` or `/.dockerenv` present | supervised: drain + exit 0 |
| otherwise | respawn: drain + spawn detached same-argv child + exit 0 |

Respawn spawn args: `[process.execPath, ...process.argv.slice(1)]`, cwd
`process.cwd()`, env passthrough, `stdio: ["ignore","inherit","inherit"]`,
detached. Spawn strictly after listener stop — port free before child binds.

## Rejected alternatives

- **In-process soft restart (stop + re-listen):** frozen singletons (config
  at `packages/shared/src/config/index.ts:523,1089`, prisma, vector store,
  `configuredApiKey`) have no reset path; wiring one through every module is
  a larger, riskier feature for the same user outcome.
- **Argv sniffing for watch mode:** Bun's watcher argv is not a stable
  contract; an env var set by the repo's own `dev` script is.
- **MCP tool for restart:** embedded mode has no tools-api process; the tool
  would kill the MCP host mid-handshake. Excluded (APR-06).
- **Presence-based proposal (status quo):** re-saving an unchanged form would
  nag for restarts forever; diff-based is the only honest proposal trigger.

## Turbo/env notes

`MASSA_AI_SUPERVISED` + `MASSA_AI_DEV_WATCH` are new `MASSA_AI_*` env reads →
must be added to `turbo.json` `tasks.test.passThroughEnv` (AD-010;
`turbo-passthrough-env.test.ts` enforces — it will go red and name them if
forgotten, which is the observed-red for that sensor).
