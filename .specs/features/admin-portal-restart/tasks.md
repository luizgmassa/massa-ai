# Tasks — admin-portal-restart

2 Phases = 6 Tasks. Phase 1 (server): B-T1→B-T3 sequential. Phase 2 (UI +
release): B-T4→B-T6, B-T4 depends on B-T2/B-T3 response shapes.

## Phase 1 — server

### B-T1 — lifecycle module (APR-02/03)
- `apps/tools-api/src/lifecycle.ts` + `lifecycle.test.ts`: `detectRestartMode`
  (pure matrix), `setServerStopper`, `shutdownAndRestart` with injectable
  seams; refactor index.ts SIGTERM/SIGINT to the shared drain; `dev` script
  gains `MASSA_AI_DEV_WATCH=1`; turbo passThroughEnv += `MASSA_AI_SUPERVISED`,
  `MASSA_AI_DEV_WATCH`.
- Gate: `bun test apps/tools-api/src/lifecycle.test.ts`;
  `bun test scripts/__tests__/turbo-passthrough-env.test.ts`.

### B-T2 — restart route (APR-01/06/07, AC-1/2/3/7/8)
- `apps/tools-api/src/routes/restart.ts` + `restart.test.ts`; register in
  index.ts; Swagger `system` tag; real-HTTP content-type assertion; parity
  suite untouched-green proof.
- Gate: route tests + `cd apps/mcp-client && bun run test` (parity).

### B-T3 — diff-based restart sections (APR-05 server half, AC-4)
- `changedRestartSections` in config-writer.ts + unit tests (changed /
  identical / masked-placeholder cases); PUT route returns it.
- Gate: `cd packages/shared && bun test src/config/__tests__` + tools-api
  config route tests.

## Phase 2 — UI + release

### B-T4 — UI restart button + poll recovery (APR-04, AC-5)
- app.js button, confirm, POST, /health poll states; 409 reason verbatim.
- Gate: `cd apps/web-ui && bun test` (new handler/render tests; span sensors,
  not fake-DOM-click vacuity — seed dataset per fake-DOM lesson).

### B-T5 — restart proposal banner (APR-05 UI half, AC-6)
- Save handler consumes diff list → banner + reuse restart action; twin
  sensors: banner on non-empty, absent on empty.
- Gate: web-ui suite.

### B-T6 — CHANGELOG (APR-09)
- `### Added` bullet.

## Test Coverage Matrix

| AC | Sensor |
|----|--------|
| AC-1 | restart.test.ts auth 401 + 200 shape + seam-called-once |
| AC-2 | lifecycle.test.ts mode matrix + restart.test.ts 409 dev-watch |
| AC-3 | lifecycle.test.ts seam-order assertion (stop before spawn) + argv capture |
| AC-4 | config-writer diff tests ×3 + config route PUT test |
| AC-5 | web-ui button render/gate/confirm/poll tests |
| AC-6 | web-ui banner twin tests (non-empty/empty) |
| AC-7 | mcp-client parity suite green, no tool-def diff |
| AC-8 | real-HTTP content-type test |
| AC-9 | CHANGELOG diff |

## Gate Check Commands

```bash
bun test apps/tools-api/src/lifecycle.test.ts apps/tools-api/src/routes/restart.test.ts
cd apps/tools-api && bun run test          # package isolated runner
cd apps/web-ui && bun test
cd apps/mcp-client && bun run test
bun test scripts/__tests__/turbo-passthrough-env.test.ts
bun run lint && bun run type-check
```
