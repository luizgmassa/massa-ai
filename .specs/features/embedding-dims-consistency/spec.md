# Spec — Embedding dims consistency sweep (EDC)

**Feature slug:** `embedding-dims-consistency`
**Workflow:** spec-driven (Small→Medium) · session `spec-installer-marketplace-update`
**Status:** Specify draft (pending plan-challenge gate)

## Premise correction (measured 2026-08-09)

The user's brief — "make embedding dimensions default to 2560
(qwen3-embedding:4b)" — is **already the shipped default** since v1.33.0
(2026-08-06): `packages/shared/src/config/massa-ai-config.ts:225-230` and
`packages/core/src/services/embeddings/config.ts:230-239` both default
`qwen3-embedding:4b` / 2560, swept across README/.env.example/compose/
diagnose by commit `ceaa275d`. What remains is the sweep's stragglers —
surfaces still writing internally inconsistent model/dims pairs, which since
v1.39.0's `refuseOnDimensionMismatch` (throws instead of silently degrading
to MiniLM-384d) make a fresh install **fail loudly at first embed**.
Line numbers below re-verified against the worktree before each edit
(delegated figures re-measured — subagent-numbers rule).

## Requirements

- **EDC-01:** `Dockerfile` env pair `OLLAMA_EMBEDDING_MODEL=qwen3-embedding:8b`
  / `OLLAMA_EMBEDDING_DIMENSIONS=4096` (≈:86-87) → `qwen3-embedding:4b` /
  `2560` (matches docker-compose.yml:60-61, which already defaults 4b/2560).
- **EDC-02:** root `install.sh` (≈:375-376): model already 4b, dims literal
  `4096` → `2560` (this pair is a live mismatch — fresh install trips
  `refuseOnDimensionMismatch`).
- **EDC-03:** `apps/mcp-client/src/config-cli.ts` `use ollama` default
  `dimensions: 768` (≈:235) → `2560` beside its `qwen3-embedding:4b` default
  model. Explicit `--dimensions` flag behavior unchanged.
- **EDC-04:** `apps/web-ui/src/static/app.js` embedding-dimensions field
  guide (≈:708) says "4096 for qwen3-embedding:4b" → "2560 for
  qwen3-embedding:4b".
- **EDC-05:** stale prose: `packages/core/src/__tests__/embedding-service.test.ts`
  comment (≈:145-148, claims default 4096) and `FEATURES.md` example
  (≈:1282, `--config-set embedding.dimensions 4096` beside a qwen3 switch
  example) → aligned to 2560.
- **EDC-06 (durable sensor):** new `scripts/__tests__/embedding-defaults-parity.test.ts`
  — extracts the `OLLAMA_EMBEDDING_MODEL`/`OLLAMA_EMBEDDING_DIMENSIONS`
  defaults from `Dockerfile`, root `install.sh`, `docker-compose.yml`, and
  `.env.example`, plus config-cli's ollama default pair, and asserts every
  named model maps to the dimension the runtime table in
  `packages/core/src/services/embeddings/config.ts` assigns it (4b→2560,
  8b-vercel→4096, 0.6b→1024). This is the gate the `ceaa275d` sweep lacked —
  it kills the "sweep missed a surface" defect class, not just these
  instances.
- **EDC-07:** CHANGELOG `### Fixed` bullets.
- **EDC-08 (critic finding, 2026-08-09):** `apps/tools-api/setup-ollama-wsl.sh`
  (≈:93-94) writes `.env` with `qwen3-embedding:4b` + `4096` — same live
  mismatch class as EDC-02. Fix to 2560 and include in EDC-06's scan set.

## Plan-challenge revisions (critic verdict: revise → applied 2026-08-09)

- EDC-06 must use **per-dialect extractors** (`ENV KEY=VALUE` for Dockerfile,
  line-anchored non-commented `KEY=VALUE` for install.sh/.env.example/
  setup-ollama-wsl.sh, `${VAR:-default}` for docker-compose.yml) and assert
  **exactly one active pair extracted per surface** (not 0, not >1) as a
  self-check — kills both the parse-0-subjects trap and the
  commented-alternatives (.env.example:165-168) false-match trap.
- AC-2's population print runs the full-repo `OLLAMA_EMBEDDING` grep
  (26 files at spec time), not just the named surfaces.
- New AC-6: mcp-client test asserts `use ollama` (no --dimensions flag)
  writes `dimensions: 2560` — runtime sensor, not just the file literal
  (config-cli.test.ts has no assertion on the old 768, so nothing else
  senses this).

## Invariants

- I1: no runtime default changes — `massa-ai-config.ts` / `embeddings/config.ts`
  untouched (they are already correct; EDC-06 asserts against them as the
  reference, never edits them).
- I2: no schema/migration changes — `vector_documents_2560d` exists
  (migration `20260806120000_add_vector_2560_bq`).
- I3: user-facing behavior of explicit flags/env overrides unchanged.

## Out of scope

- Reindex tooling / orphaned-chunk automation (existing warn-only
  `detectOrphanedChunks` behavior stands).
- The user's own machine `~/.config/massa-ai/config.json` embedding block —
  machine state, checked in the HANDOFF runbook (a stale file `dimensions`
  overrides the default via env > file > defaults precedence).

## Acceptance criteria

- AC-1: EDC-06 parity test **observed red** against pre-fix tree (it must
  name Dockerfile 4096 + config-cli 768 as violations), green after
  EDC-01..03.
- AC-2: grep across the four env surfaces + config-cli finds no
  4b-adjacent dims literal other than 2560 (population printed beside
  verdict).
- AC-3: web-ui guide text + FEATURES.md example + test comment show 2560;
  web-ui suite green.
- AC-4: `bun run test:plugins`, mcp-client suite, and
  `bun run test:scripts` green.
- AC-5: CHANGELOG `### Fixed` bullets present.
