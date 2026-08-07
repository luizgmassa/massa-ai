# Changelog

All notable changes to massa-ai are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **`AttributionResolver.resolve()`'s fail-open catch now scrubs the error message
  instead of dropping it** — the last hand-rolled "(sanitized)" log site left behind
  by the `safeErrorSummary` adoption (which converted `kernel/alias-resolver.ts` and
  `PgWorkspaceRootProvider.listRoots`). The warn now carries the credential-scrubbed
  `{name, message}` summary, so attribution failures keep their debugging signal
  without risking a credential leak.

## [1.40.0] - 2026-08-07

### Added

- **Mandatory pre-implementation reuse scan across the 16 implementation
  workflows** (`references/code-reuse-scan.md`) — every workflow that plans or
  writes new implementation code now directs a mandatory reuse scan, run in
  separate read-only investigator-class subagents, before that code is
  written; the scan's reuse map (candidate element -> location ->
  use/extend/new decision) is consumed rather than skipped, with an
  evidence-or-zero empty result and a recorded inline-fallback reason when
  subagent spawning is unavailable. In `spec-driven`, the scan lands after
  Specify closes and before Design/Tasks.
- **English-only naming rule** (`references/naming-standards.md`) — a new
  `## Language` rule block requires new or renamed identifiers, classes,
  methods, screens, components, attributes, and implementation-facing
  artifact names to be in English, converting any non-English source term
  (Portuguese as the primary case) before implementing, while preserving
  existing public contracts and persisted names. All 16 implementation
  workflows now load this reference.
- **Figma node-id wiring for `spec-driven` and `feature`**
  (`references/figma-wiring.md`) — WHERE one or more Figma links or node IDs
  are supplied (any platform), the workflow creates one figma file per
  supplied link under `.specs/<type>/<slug>/figma/NN-<link-slug>.md` with a
  13-category wiring table (Number, Figma node id(s), Category, Spec(s) ID,
  Task(s) ID, Design(s) ID, Explanation, Notes); specs wire high-level
  categories (Structure, Behavior / Prototype, Flows) and tasks/designs wire
  the remaining low-level categories to concrete codebase elements. Any
  unwired Number stops the workflow and asks the user for direction before
  Execute. `references/figma-pre-analysis.md`'s two-stage protocol gained
  conditional pointers for per-link file creation (Stage 1) and wiring-table
  population (Stage 2); `spec-driven`'s specify/design/tasks/execute phase
  guides gained matching wiring hooks, and Execute retrieves each task's
  wired node IDs through Figma MCP before implementing.
- **Design-workflow direction abstraction** (`references/design-implementation.md`)
  — the design workflow's implementation directions (Target Surface Packet,
  Figma Evidence / Screenshot Context Packet, Design-To-Code Mapping Matrix,
  coherent-slice implementation rules, per-slice verification) moved into a
  shared reference that `workflows/design.md` still loads for its direct
  route (behavior unchanged) and that `spec-driven`/`feature` also load,
  lazily, under Figma ingestion — one normative copy instead of a second one
  duplicated into the implementation workflows.
- **`skills/massa-ai/scripts/validate_figma_wiring.ts`** — deterministic
  backing for the Figma wiring unused-Number stop rule: parses every wiring
  table under `.specs/<type>/<slug>/figma/*.md` for a given slug, always
  prints the parsed population (files scanned, rows parsed) beside the
  verdict, and exits non-zero when any Number row is unwired or when the
  figma directory exists but zero rows were parsed.

## [1.39.0] - 2026-08-07

### Added

- **`scripts/reembed-stale-memories.ts`** — one-off backfill that re-embeds
  `memories` rows whose stored embedding no longer matches the configured
  embedding dimensions (`embedding.byteLength / 4 !== dimensions`, since
  embeddings are stored as raw Float32 bytes). Needed after the dimension-pin
  fix below: rows embedded before the fix stay at their old dimensionality
  until re-embedded, and are invisible to cosine search against the new one
  until then. `--dry-run`, `--batch-size`, and `--dimensions` (override
  auto-detection) flags; the row-selection predicate
  (`isEmbeddingStale`/`selectStaleMemoryRows`) is exported and unit-tested
  independently of the database and the embedding provider.

### Fixed

- **Embedding provider selection silently degraded to the 384d
  transformers.js fallback on a dimension mismatch instead of failing loudly.**
  `AISDKEmbeddingProvider.isAvailable()` treated "model responded with the
  wrong dimension count" (a stale `embedding.dimensions` beside a re-pulled
  model, e.g. `qwen3-embedding:4b` at 2560d configured as 4096d) the same as
  any other health-check failure and fell through the priority chain — for
  the *configured* provider, that fallthrough silently landed on the 384d
  local MiniLM provider, producing real-looking embeddings at the wrong
  dimensionality with nothing in the logs naming the cause. `provider.ts` now
  tags this failure class distinctly (`DimensionMismatchError`, carried on
  `EmbeddingProvider.lastDimensionMismatch`); `services/embeddings/index.ts`'s
  selection chain (`createEmbeddingProvider`) logs an ERROR with remediation
  text and refuses to fall through to another provider when the *configured*
  (priority-1) provider hits this failure class — an unreachable service or a
  missing API key still falls back exactly as before. `createAllProviders`
  (a diagnostic/benchmarking enumeration, not the production selection chain)
  intentionally keeps enumerating every provider rather than aborting on one
  mismatch. Regression tests: `embeddings-provider.test.ts` (mismatch tagging,
  cleared-on-recovery, not tagged for unreachable failures) and the new
  `embeddings-selection-chain.test.ts` (observed RED against the pre-fix
  selection-chain logic — it silently resolved to the transformers.js
  fallback instead of throwing — before the fix; a same-priority-1
  fallback-provider mismatch does not abort the chain).
- **Missing real migration for `vector_documents_2560d`** (the
  qwen3-embedding:4b table) — only the on-demand `createFallbackTable` safety
  net existed. New migration `20260806120000_add_vector_2560_bq` mirrors
  `20260413200000_add_vector_4096_bq` (binary-quantized `embedding_bq bit(2560)`
  column + HNSW `bit_hamming_ops` index, since 2560 > pgvector's 2000-dim
  float HNSW limit) and a matching `VectorDocument2560` Prisma model. PG-gated
  integration test (`vector-2560-migration-pg.test.ts`, throwaway-database
  pattern) asserts the table, both column types, the project-id index, and
  the HNSW index all exist after applying every migration in order.

## [1.38.0] - 2026-08-07

### Added

- **Checkpoint-purge default scheduled job.** Wires the existing
  `PgCheckpointStore.purgeExpired()` (already-expired `task_checkpoints` rows
  only) into `services/scheduler/scheduler-defaults.ts` as job kind
  `checkpoint-purge`. Default-disabled, following the same per-kind
  enable/interval env pattern as the sibling default jobs:
  `MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_ENABLED` (master switch still applies)
  and `MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_INTERVAL_MS` (default 1 hour). No
  behavior changes for a deployment that does not opt in.

### Fixed

- **`managed_runs` was unregistered in the project-identity registry,
  hard-breaking rename/merge (`PROJECT_IDENTITY_UNKNOWN_STORAGE`) for any
  indexed project with managed_runs rows.** `packages/core/src/kernel/registry.ts`
  `STATIC_DIRECT_STORES` now carries a `managed_runs` entry
  (`identityColumn: "project_id"`, `mutable: true`), so
  `directStorePolicy`/`isKnownRegistryTable` — and therefore the rename/merge
  rewrite path and the identity-guard trigger installer — cover the table like
  every other project-scoped store. The frozen `EXPECTED_GUARDED_TABLES` list
  in `project-identity-guard-invalidator.test.ts` is updated accordingly (an
  intentional forcing function, not derived from the registry). A new
  schema-vs-registry completeness test
  (`project-identity-registry-schema-completeness.test.ts`) regexes
  `prisma/schema.prisma` for every model carrying a `@map("project_id")`
  column and asserts each resolved table is known to the registry or on an
  explicit exclusion list, so the next new project-scoped table cannot
  silently repeat this gap.

## [1.37.0] - 2026-08-07

### Added

- **Opt-in logger file sink.** `packages/shared/src/utils/logger.ts` now
  additionally appends every log line to a file when `MASSA_AI_LOG_FILE` (env,
  wins) or config `logging.file` is set — stderr behavior is unchanged either
  way, and stdout is never touched (the stdio MCP protocol invariant). Sync
  append, no rotation (v1). `MASSA_AI_LOG_FILE` is added to `turbo.json`'s
  `passThroughEnv` (AD-010).

### Fixed

- **Tools-api error responses carried no HTTP status signal for three failure
  classes.** `apps/tools-api/src/middleware/error.ts` now maps an unmatched
  route (`code === "NOT_FOUND"`) to 404 instead of falling through to 500, and
  a search against an unindexed project now throws a typed
  `SearchServiceError` (`PROJECT_NOT_INDEXED`, new
  `packages/core/src/kernel/search-diagnostics.ts` factory
  `projectNotIndexed`) that the middleware's existing `instanceof
  SearchServiceError` branch maps to 404 with the original actionable message
  — previously a plain `Error`, silently swallowed into a 200 `{success:false}`
  tool envelope. `apps/tools-api/src/routes/file.ts`'s `/read` route now sets
  404 for ENOENT/no-such-file failures and 400 for ambiguous-path,
  containment-violation, and other failures, instead of always returning 200.
  The error-log line also now carries `path`, `method`, and a credential-scrubbed
  message (new `packages/core/src/kernel/sanitize/safe-error-summary.ts`,
  reusing `credential-scrub.ts`) via the shared logger instead of
  `console.error`; the same helper replaces two hand-rolled
  `(sanitized)`-suffixed log lines in `kernel/alias-resolver.ts` and
  `services/hooks/attribution-resolver.ts` that previously dropped the error
  message entirely rather than scrubbing it.

## [1.36.0] - 2026-08-07

### Changed

- **Per-file load errors no longer fail an index run — the ETL completes with
  warnings.** Previously any per-file Load failure aborted the whole run after
  all the work was done (`ETL completed with N file errors`), leaving the
  workspace in `error` even though the surviving files were fully indexed. The
  pipeline now logs a warning, proceeds to graph activation, marks the job
  `completed`, and surfaces the failures: `LoadResult.fileErrors` (capped at
  50 entries; `errors` remains the true total) is threaded into the job
  result, and the `indexing:completed` event payload gains an `errors` field.
  **Consumers that inferred success from the absence of `indexing:failed`
  should now read `errors` on the completed event/job result.** Hard parse
  failures are unaffected — the `graph_generation_incomplete` activation gate
  still blocks activation independently.

### Fixed

- **File content containing NUL bytes (`0x00`) broke indexing writes.**
  PostgreSQL text/jsonb columns reject NUL, so a single binary-ish source file
  failed its Load write. New kernel leaf
  `packages/core/src/kernel/sanitize/strip-nul.ts` strips NULs at the single
  ETL read site (discover, before content-hashing, so stored hashes match
  stored content). Deliberately not `shared/utils/sanitizer.ts`, which strips
  the whole control-char range including newlines/tabs. Also rewrites the 19
  literal NUL bytes in `scripts/synapse-bench-analyze-v2.ts` to `\x00`
  escapes (byte-identical runtime strings).

## [1.35.1] - 2026-08-07

### Fixed

- **Full-repository indexing deadlocked against its own lease heartbeat
  (SQLSTATE 40P01).** Every `symbol_*` table FKs to `workspaces(project_id)`,
  so a per-file generation write holds `FOR UPDATE` on its `graph_generations`
  row and then takes an implicit `FOR KEY SHARE` on the `workspaces` row when
  its inserts fire — generation → workspace order. The lease methods
  (`heartbeat`/`complete`/`activate`/`abort`) locked workspace-first, forming
  an AB-BA cycle with any in-flight file writer; on a 679-file index the 30 s
  heartbeat racing 10-wide load batches aborted 2 of 3 runs mid-flight. The
  four lease methods now lock generation-first to match the writers' implicit
  order; `begin()` keeps workspace-first (it must read the pending pointer
  before knowing which generation to lock — a narrow, documented residual
  window) and the coordinator now wraps `begin`/`complete`/`activate`/`abort`
  in `withDeadlockRetry` (all idempotent-on-retry) with heartbeat retries
  raised 3 → 5. Reproduction suite:
  `packages/core/src/__tests__/graph-generation-deadlock-pg.test.ts`
  (`RUN_GRAPH_GENERATION_DEADLOCK=1`, dedicated-database gated like its
  lifecycle sibling) hammers a continuous heartbeat against 10-wide
  `writeFileGeneration` batches on a real PostgreSQL — observed red with 9
  deadlocks in ~2 s on the pre-fix lock order, green 3/3 after.

- **`setup-local-first.sh` skipped pulling a requested Ollama model whenever a
  sibling tag was installed.** `ollama_model_exists` stripped the tag before
  matching (`search="${1%%:*}"`), so an installed `qwen3-embedding:8b` made
  `qwen3-embedding:4b` read "already available" and the pull was silently
  skipped — in all three detection branches (CLI list, python3 JSON parse, grep
  fallback). Matching is now exact on `name:tag`, with a bare name normalizing
  to `:latest` (mirroring Ollama itself), so the wizard actually downloads the
  configured `OLLAMA_EMBEDDING_MODEL`, `MASSA_AI_LLM_MODEL`, and
  `MASSA_AI_LLM_CODE_MODEL` tags. Regression suite:
  `scripts/tests/test-setup-ollama-model-exists.sh` runs the extracted function
  against stubbed `ollama`/`curl`/`python3` binaries, one sibling-tag,
  name-prefix, and bare-name case per branch (observed red 6 of 13 cases on
  the old implementation). The identical defect shape in
  `scripts/validate-vscode-integration.sh` (tag-stripped substring match in
  its embedding-model check) is fixed the same way, and both python3 checks
  now pass the model via `argv` instead of interpolating it into the code
  string.

## [1.35.0] - 2026-08-06

### Added

- **Explicit Isolation Gate line in all 16 implementation workflows.** Each
  workflow that mutates the repository (`feature`, `debug`, `refactor`,
  `general`, `design`, `maestro`, `spec-driven`, and the nine `*-fix`
  workflows) now carries one identical action line directly after its
  delivery-clause paragraph: execute `references/implementation-delivery.md`
  Stage 0–1 (create the worktree + branch) **before the first file edit** and
  record the worktree path + branch — or one of Stage 1's two legal skip
  reasons, verbatim. Policy text stays single-sourced in the reference, which
  additionally gains the cross-session rule: record isolation evidence
  immediately after creation and never switch branches in a checkout another
  session may share (motivated by the recorded 2026-08-05 shared-checkout
  incident; distinct from `agent-orchestration.md`'s cross-subagent git-safety
  rule). `workflow-harness-contract.test.ts` enforces per-file presence,
  absence from read-only workflows, and byte-identical wording naming the
  mechanism. Hook-level blocking was evaluated and deferred: the hook binary's
  contract is observation-only ("never blocks the agent").

## [1.34.0] - 2026-08-06

### Added

- **Spec-driven parity across the 13 other implementation workflows.** The 8
  harness capabilities that existed only in `spec-driven.md` — canonical
  artifact persistence, mandatory independent verification (author ≠ verifier),
  the discrimination sensor, deterministic delivery gates, blast-radius
  authority scoping, the Knowledge Verification Chain, the brownfield
  onboarding minimum bar, and the bounded 3-iteration fix→re-verify loop — now
  reach all 9 `*-fix` workflows plus `debug`/`feature`/`general`/`refactor`
  (each bumped to 1.2.0). Mechanics live in shared references, not restated
  per workflow: new `references/{knowledge-verification-chain,
  discrimination-sensor,artifact-persistence}.md`, a relocated
  `references/brownfield-mapping.md` with an anchored Minimum Bar,
  `verification-ladder.md`'s tier-gated Independent Verification Mandate
  (security-fix unconditional) + Bounded Fix→Re-verify Loop, and
  `audit-report-io.md`'s Fix Closure Report Contract
  (`audits/<family>/<YYYY-MM-DD <family>-fix-closure>.md`, excluded from
  latest-report selection). Two deterministic gates back it:
  `skills/massa-ai/scripts/check_fix_closure.ts` (new; every selected finding
  needs a terminal-status closure row with real evidence) and
  `check_specs_delivered.ts --kind feature|quick|debug|refactor` (default
  byte-identical to the old behavior — the pyts-golden corpus is unchanged).
- **Generated workflow slash commands (40 at merge), one per `skills/massa-ai/workflows/**/*.md`,
  across all four plugins.** Every massa-ai workflow is now directly invocable —
  `/massa-ai:debug` / `/massa-ai-debug` (Claude Code marketplace / file route),
  `$debug` (Codex), an auto-loaded `skills/debug/SKILL.md` (Cursor), and
  `/massa-ai-debug` (OpenCode) — instead of only the 6 hand-authored quick
  commands (`map`/`index`/`find`/`def`/`graph`/`status`). Generated alongside
  those quick commands by the existing `bun run generate:artifacts`
  entrypoint, gitignored build output (AD-016) carrying a body ownership
  marker (`<!-- massa-ai:generated workflow-command -->`) so prune and
  `--check` can share Claude's `commands/` and Codex/Cursor's `skills/`
  directories with hand-authored files safely. OpenCode gains a new
  `command/` managed root and a dedicated installer delivery + owned-prefix
  uninstall section. Claude's file-route uninstall is hardened to glob the
  installed directory by the `massa-ai-` prefix rather than deriving removals
  from the source bundle, which previously left owned commands behind
  whenever the bundle was absent or stale at uninstall time. See
  [Workflow Commands](./FEATURES.md#workflow-commands-generated-slash-commands)
  for the full per-host reference.

## [1.33.0] - 2026-08-06

### Changed

- **Default embedding model: `qwen3-embedding:8b` → `qwen3-embedding:4b`, with
  a bounded runner footprint** — the 8b default at its full 40960 context makes
  Ollama size the runner at ~10 GiB, which cannot stay resident beside a
  ~6 GiB chat model on a 24 GB host: the two evict each other on every
  embed↔chat alternation (545 evict/reload cycles measured in one server log
  over 9 days) and the resulting queueing blows the 90 s LLM client timeout.
  The 4b model (2.5 GB download, 2560 dims) embeds the full needle fixture
  ~5-10× faster on constrained hardware, and every native Ollama embed call now
  sends `options.num_ctx` (default 8192, `OLLAMA_EMBEDDING_NUM_CTX` to
  override) so the runner loads at ~5 GB and coexists with a chat model —
  inputs are truncated to ≤8000 chars (~2k tokens) long before that limit
  matters. Swept across code defaults, `.env.example`, docker-compose,
  installers, WSL setup, diagnose, config CLI, needles harness, and docs.
  Dimension change means existing indexes re-embed on next reindex (the
  pgvector table is per-dimension, no migration needed). Measured on the
  14-needle fixture: hit@1 42.9%, MRR 0.595; the needle-gate floors, set in
  the 8b era, are recalibrated 0.5/0.65 → 0.4/0.55 to sit just under the new
  default's measured baseline (gate re-run: PASS).

### Fixed

- **config.json `embedding` block is now wired into the provider factory** —
  it was typed, documented, and silently dead: `services/embeddings/config.ts`
  read only env vars, so a user setting `embedding.provider`/`model`/
  `dimensions` in `~/.config/massa-ai/config.json` kept running the Ollama
  default (`getConfigForEnv`, the half-built bridge, had zero production
  callers). The block now supplies the middle layer of the documented
  env > config.json > defaults precedence: its fields overlay the provider
  entry it names, `EMBEDDING_PROVIDER` env still wins provider selection, and
  explicit env vars still win every field they set. An `openai` provider entry
  now exists (the block's provider union always named it while no runtime
  entry did), a config naming a provider with no runtime entry warns instead
  of silently falling through, and the stale shared default
  (`nomic-embed-text:latest`/768) is aligned to the factory's real default so
  the merge is behavior-neutral when the block is absent. Guarded by a
  subprocess-isolated suite (`embeddings-config-file-layer.test.ts`) that pins
  the precedence chain.
- **LLM abort/timeout no longer logs the misleading reasoning-recovery pair** —
  `llmObject`'s catch attempted reasoning-channel recovery on *every* error,
  so each client-side timeout (`AbortSignal.timeout`, 90 s default) emitted
  `llm reasoning-recovery empty` — the "#7 safety net" that exists to flag
  thinking-model shape shifts — followed by the real degradation warning. A
  timed-out call carries no model response, so there is nothing to recover:
  abort/timeout errors (name or `cause`-chain `TimeoutError`/`AbortError`, or
  the equivalent message text from SDK retry wrappers) now skip recovery and
  the safety net, keeping only the honest `llmObject failed — degrading`
  signal. Non-timeout errors still reach the safety net unchanged.
- **Needles gate no longer false-positives on agent worktrees** — anchor
  resolution walked `.claude/worktrees/`, whose sibling checkouts are full
  repo copies, so every anchored needle resolved to N locations and the gate
  died with `NEEDLE_ANCHOR_AMBIGUOUS` on any machine with an active agent
  worktree. `.claude` joins `IGNORED_DIRECTORIES`, which already excludes run
  artifacts by intent.

## [1.32.0] - 2026-08-06

### Added

- **`lessons.ts` review-feedback trust ramp and metric-snapshot trend
  commands.** `review add --category --feedback none|minor|major --source`
  appends to `data.reviews`; `trust status` derives a per-category trailing
  streak (`trusted` at `trust_threshold`, default 30, comparison `>=`; a
  `major` record resets the streak to 0 and demotes) via lazy
  `ensureRampFields`, never touched by `load()`, so legacy stores load clean
  with an empty trust view. `metrics add` (enum + non-negative-integer
  validated) appends a `PASS|FAIL` + `fix-iterations` + `surviving-mutants` +
  `acs-total`/`acs-covered` snapshot to `data.metrics`; `metrics trend`
  compares the last two snapshots on a scalar score
  (`FAIL*100 + mutants*10 + fixIters + uncoveredACs`) and reports
  improving/stable/degrading, or `insufficient data` under two snapshots.
  Both surfaces are documented in `references/lessons.md`; the human-review
  stage of `references/implementation-delivery.md` reports the change's
  category trust status as advisory reading-depth context only — the per-PR
  merge-approval clause is unchanged.
- **`massa-ai-reviewer` dispatch wired into 14 workflows.** `feature.md`,
  `spec-driven.md` (Execute step 6, before the verification-agent dispatch),
  `general.md`, `debug.md`, `refactor.md`, and the 9 `*-fix.md` workflows
  each gain a post-implementation, pre-verification read-only reviewer
  dispatch block (fallback: standalone fresh-eyes review when the subagent
  is unavailable) per `references/agent-orchestration.md`'s format; existing
  verification gates are unchanged.
- **Tests lens on `audit-specialist` and a five-gate error-class model in
  `tests-audit.md`.** The audit-specialist lens table gains a `tests` row
  (coverage, regression protection, assertion quality, variation) routing to
  `workflows/tests/tests-audit.md`; `tests-audit.md` gains a five-row
  gate/error-class table (unit→logic, coverage→holes, variation→brittleness,
  AC-mapping→wrong-thing, trend→drift), a variation sensor (flags
  single-fixture-example coverage), and a trend sensor reading
  `lessons.ts metrics trend`; the dispatch lens `performance` no longer
  files coverage findings — they route to `tests`. `tests-fix.md` gains a
  matching variation fix method (varied-input cases, never a second copy of
  the fixture example) and `test-engineer`'s charter mission now names the
  five error classes plus variation/property-style test design.
- **Feature-workflow AC anchor.** `feature.md` gains a pre-implementation
  step capturing 1-5 testable acceptance criteria (or referencing an
  existing spec artifact), and its verification step checks outcomes
  against those captured ACs instead of only a generic verification recipe.
- **Metric-snapshot recording in the validate reference.** `references/spec-driven/validate.md`
  gains a mandatory post-validation step recording the run's snapshot via
  `lessons.ts metrics add`.

### Changed

- **Code-quality and refactor split/extraction guidance rewritten to be
  agent-read-aware.** `code-quality-audit.md` and `code-quality-fix.md`
  replace the split-on-"does more than one thing"/size-alone lead with a
  discoverability-or-change-risk criterion (split only when the result
  yields an externally-findable named unit or measurably reduces change
  risk); static leads in `code-quality-audit.md` gain multi-subject-file and
  >~600-line flags with an explicit no-flag-below-bound guard.
  `refactor.md` step 8 now names extract-for-findability (an
  externally-searchable named unit) as the primary extraction payoff.
- **`coding-guidelines.md` gains a "File shape for agent readers" section**
  stating the read-mechanics guidance explicitly (one-subject files up to
  ~500 lines are fine, over ~600 must be flagged for splitting — a
  working-context-headroom bound, amended by user from the initial
  ~1000/~2000 — one subject split
  across N files costs N reads with per-hop loss) and framing it as read
  mechanics, not module depth, citing `architecture-deepening-lens.md`'s
  Rejected Framings rather than restating them.

## [1.31.0] - 2026-08-06

### Added

- **`discovery` workflow** — product brainstorming / problem-space thinking
  partner, adapted from the `product-brainstorming` skill in
  `anthropics/knowledge-work-plugins` (Apache-2.0, attributed). Four
  brainstorming modes (problem exploration, solution ideation, assumption
  testing, strategy exploration), seven frameworks-as-tools (HMW, JTBD,
  Opportunity Solution Trees, first principles, SCAMPER, OODA, reverse
  brainstorming), the Frame → Diverge → Provoke → Converge → Capture session
  rhythm, and a thinking-partner conduct contract with six named
  anti-patterns. Binds to the massa-ai runtime (budgeted `recall` at start,
  durable `decision`/`pattern` memories at Capture, graceful degradation) and
  ends every session with a mandatory offer to synthesize the conversation
  into a PRD via the existing `to-prd` workflow — acceptance is the explicit
  request `to-prd` requires. Registered in the router (tier-4 primary-verb
  precedence; codebase understanding stays `exploration`); read-only
  complement grows 23 → 24, workflow population 39 → 40; the workflow
  frontmatter license allowlist gains Apache-2.0.

## [1.30.0] - 2026-08-06

### Added

- **`pr-review` workflow** — six-dimension hosted code review for GitHub Pull
  Requests (`gh`) and GitLab Merge Requests (`glab`), adapted from the TLC
  `pr-review` skill (CC-BY-4.0, github.com/augusto-dmh). One host command map
  (identity, metadata/`diff_refs`, diff, changed files, paginated discussion
  inventory, added-line-anchored inline comments, thread replies, summary) with
  every GitLab command verified against official CLI/API documentation; the
  stable `glab api` Discussions/Notes endpoints are the contract (the
  experimental `glab mr note` inline flags are noted only as an alternative).
  Review dimensions run as read-only massa-ai roster dispatches in two waves
  (`massa-ai-audit-specialist` lenses security/requirements/architecture/
  performance + a coverage-scoped performance dispatch, `massa-ai-reviewer` for
  regression/hallucination); subagents never touch the host — the orchestrator
  posts, dedupes (±3 lines), replies `[RESOLVED]`, and assembles one
  consolidated summary. Integrates budgeted `recall`, freshness-gated index
  retrieval (`project_map`/`get_architecture`/`impact_analysis`), and
  `.specs/` acceptance criteria as a requirements source. Registered in the
  router (table row + target-type precedence clause); workflow count locks move
  38 → 39, read-only complement 22 → 23. Comment-only by contract: approve/
  request-changes/merge commands on both hosts are named forbidden.
### Changed

- **AD-017: plugins deliver, MCP serves tools, hooks observe.** The OpenCode
  installer no longer removes its own MCP entry as "redundant" — it delegates
  registration to `scripts/install-agents.sh --agent opencode` on every
  install, the same single-writer pattern Codex already used, so OpenCode
  users get all 54 MCP tools instead of the 14 the plugin used to expose
  in-process. Uninstalling the plugin (`apps/opencode-plugin/install.sh
  --uninstall`) now leaves the MCP entry in place — plugin lifecycle is
  independent of MCP tool-surface lifecycle; remove the entry separately with
  `bash scripts/install-agents.sh --agent opencode --uninstall` if wanted. See
  `docs/adr/0002-plugins-deliver-mcp-serves-tools-hooks-observe.md`.
- **The harness plugin phase no longer trusts a version record it never
  verified against disk.** `skip-current` now requires an on-disk per-host
  sentinel (flat agent files, a plugin file, or a registry entry, depending on
  host) in addition to a matching recorded version; an external wipe of
  installed artifacts (observed live 2026-08-05 against this machine's
  `~/.cursor`) now triggers a self-healing reinstall — logged by name — instead
  of reporting `skip-current` forever against zero artifacts. `--dry-run`
  reports the would-be reinstall without writing; `skip-newer`, `skip-absent`,
  and `--uninstall` are unchanged.
- **Cursor no longer loads massa-ai twice.** Cursor 3.14 bridges the Claude
  marketplace plugin from `~/.claude` in addition to loading a local plugin
  copy from `~/.cursor/plugins/local/massa-ai/`, risking double hook firing.
  The Cursor installer now detects an installed-and-enabled Claude massa-ai
  plugin and prefers that bridge — skipping the local plugin copy and its hook
  wiring, and removing a pre-existing local copy + its owned hook entries so a
  double-installed machine converges to a single load on the next run. No
  bridge detected → local install as before (fallback, unchanged behavior).
  Flat subagents and MCP registration are written in both branches. The
  installed route is recorded as `installRoute: "bridge" | "local"` in
  `install-state.json`.

### Removed

- **The OpenCode plugin's 14 in-process tools.** (`search`, `remember`,
  `recall`, `index`, `compress`, `optimized_context`, `read`, `index_status`,
  `analytics`, `list_projects`, `search_definitions`, `get_references`,
  `go_to_definition`, `profile`) `apps/opencode-plugin/src/index.ts` is now
  hooks-only — event handlers (`session.created`, `tool.execute.after`,
  `experimental.session.compacting`, `shell.env`, `event`, `dispose`) are
  unchanged. **Breaking** for anyone invoking these tool names bare (without
  the MCP client's naming). The massa-ai MCP server serves the equivalent (and
  40 more) tools under the same names — 54 total — registered alongside the
  plugin as of the `### Changed` entry above (AD-017).

### Fixed

- **Cursor subagents now install where Cursor actually reads them.** The
  Cursor plugin installer copied the 17 specialists into
  `~/.cursor/plugins/local/massa-ai/agents/`; Cursor 3.x discovers subagents
  only from the flat `~/.cursor/agents/*.md` (or project `.cursor/agents/`)
  directory — a plugin's `agents/` subtree is never scanned for subagents,
  even though Cursor 3.14 does load `plugins/local/<name>/` as a user-local
  plugin (and separately bridges Claude marketplace plugins from `~/.claude`).
  Install now writes real copies to `~/.cursor/agents/` (prefix-owned
  `massa-ai-*.md`, prune-then-copy on upgrade, uninstall leaves user agents
  untouched) and removes the pre-fix in-plugin copy on upgrade.
- **`install-skills.sh` now says loudly that Cursor reads no global rules
  file.** The cursor platform wrote the bootstrap block to
  `~/.cursor/AGENTS.md` and reported success, but Cursor has no global
  AGENTS.md surface (open Cursor feature request) — global rules exist only
  as Cursor Settings → Rules, and AGENTS.md is read per project root. The
  file is still written for forward-compatibility; the installer now prints
  the manual step instead of implying the bootstrap took effect.
- **OpenCode plugin is now a real copy, not a symlink into the checkout.**
  `~/.config/opencode/plugins/massa-ai/index.js` was a symlink to the repo's
  gitignored `apps/opencode-plugin/dist/index.js`; whenever that build output
  vanished (rebuild, worktree deletion, bundle regeneration) the link went
  dead and OpenCode skipped the plugin with no log line — losing all 14
  in-process tools *and* the MCP entry the installer had already withdrawn by
  design (single-writer; the plugin registers tools in-process). The
  installer now copies the built bundle (both scopes), replaces a pre-fix
  symlink on upgrade, and refreshes a stale copy on re-run. Re-run the
  installer (or harness) after `bun run build` to pick up a new build.

## [1.29.0] - 2026-08-05

### Changed

- **Generated plugin bundles are no longer checked in.** The `skills/`,
  `agents/`, and `agent-profiles/` trees under every `apps/*-plugin/`
  directory (~1,141 files, plus the generated `hooks/massa-ai-hook` copies and
  the `opencode-config.cjs` mirror) are now gitignored build output;
  `bun run generate:artifacts` is the on-demand generation contract, chained
  ahead of every consumer (test entry points via Bun pre-scripts, CI/publish
  build-job steps, and a checkout-detected step in every `install.sh`). Both
  generators now prune each managed root before emit so stale files cannot
  linger. Published npm/tarball installs are unaffected — they still ship the
  bundles pre-generated. **Install-surface note**: a checkout-based
  `/plugin marketplace add` or standalone `massa-ai-config agents install`
  against an ungenerated checkout now needs `bun run generate:artifacts` run
  first (any installer runs it automatically); see README's Plugin Bundles
  section for the opt-in `post-merge` regeneration hook. AD-016 records the
  decision.

## [1.28.0] - 2026-08-05

### Added

- **Three skills imported into the massa-ai router** (from the
  Useful-Agent-Skills checkout; sources untouched). `coding-guidelines` →
  `skills/massa-ai/references/coding-guidelines.md`, loaded lazily before
  implementation edits via a Core Contract bullet (dropped from the bootstrap
  activation stack, which is now 3 items); `to-prd` →
  `skills/massa-ai/workflows/to-prd.md` (explicit-request-only route: synthesize
  a PRD from the current conversation; refining an existing PRD stays
  `furps-refinement`); `skill-architect` →
  `skills/massa-ai/workflows/skill-architect.md` +
  `references/skill-architect/{examples,patterns,quality-checklist}.md` +
  `scripts/validate_skill.ts` (TypeScript port of the source's Python
  validator, parsing frontmatter with `Bun.YAML`; the Python original is not
  shipped), kept `license: CC-BY-4.0` with attribution
  (author Felipe Rodrigues) — the workflow-metadata-headers gate's license
  assertion widened to the `["MIT", "CC-BY-4.0"]` allowlist and its
  `EXPECTED_WORKFLOW_COUNT` population lock bumped 36 → 38.

### Changed

- **`skills/AGENTS.md` registry cleanup.** Deleted the partial Orchestration
  Model diagram, the stale Future Integration section, and both false
  "symlinked" claims; the Capability Packet and Output Contract sections are
  now pointers to the canonical
  `skills/massa-ai/references/agent-orchestration.md` (mirror deleted, reversing
  ORC-06/ORC-08 — the mirror's stated rationale was wrong: the installer copies
  only the bootstrap block, so the registry never reaches hosts);
  `capability-packet-parity.test.ts` retired with its subject;
  `skills-harness-integrity.test.ts` keeps `AGENTS.md` under the
  persona-authority prose scanner via a direct `AUTHORITY_SCANNED_FILES` entry.
  Bootstrap ignore list now carves out `!.env.example` (the annotated env
  reference stays indexable).

### Fixed

- **Judge agent could not write the report file its own charter mandates.**
  `skills/agents/judge/SKILL.md` now declares `permission: write` (v1.2.0) and
  judge joined `WRITE_AGENTS` in the generator and parity roster, so generated
  artifacts ship Write/Edit tools (Claude), `workspace-write` sandbox (Codex),
  no `readonly` pin (Cursor), and `edit: allow` (OpenCode). The Agent Table row
  reads `read-only (report-write, own file only)`; charter Restrictions still
  bound writes to the agent's own judge-N report.

## [1.27.0] - 2026-08-05

### Added

- **Lazy-loaded conditional skill definitions + guard tooling.** SonarQube MCP
  protocol moved from `implementation-audit.md`/`implementation-fix.md` inline
  bodies into new `skills/massa-ai/references/sonarqube-mcp.md`; the mobile/Figma
  design-source intake gate moved from `feature.md`/`spec-driven.md` into
  `references/mobile-context.md` (new "Design-Source Intake Gate" section); the 5
  audit scope-resolution branches deduped from the 6 `*-audit.md` workflows into
  `references/audit-scope.md` as the single home; the router SKILL.md
  Graceful-Degradation table extracted to new `references/graceful-degradation.md`;
  the spec-driven brownfield 7-doc table to new
  `references/spec-driven/brownfield-mapping.md`; plus judge/meta-judge model-hint,
  stacked-branch, and sub-agent-offer dedupes. Trigger sentences stay inline;
  only conditional bodies moved. Two new guard scripts enforce the surface:
  `scripts/check-skill-doc-paths.ts` (every relative `references/…`/`workflows/…`
  citation must resolve, own-skill-first) and `scripts/skill-protected-literals.ts`
  (string AND regex-literal anchors that content-coupled tests assert against
  skill files; `--verify` mode detects paraphrase losses), with
  `scripts/__tests__/skill-doc-paths.test.ts` in `bun run test:scripts`.
- **Deterministic audit-report and design validators.**
  `skills/massa-ai/scripts/validate_audit_report.ts` (metadata, Area↔Prefix
  membership, `PREFIX-N` format/uniqueness/gap-free sequencing, parameterized by
  report family) and `skills/massa-ai/scripts/validate_design.ts` (required
  sections + non-empty mitigations) replace the inline model-run checklists in
  `references/audit-report-io.md`, all 9 `*-fix.md` workflows, and the
  spec-driven design step; red-first tests in
  `scripts/__tests__/audit-report-validators.test.ts` and
  `spec-driven-validators.test.ts`.

### Changed

- **Caveman compression pass over the skill surface.** Prose-only compression of
  all 36 workflows, 90 references, and 17 agent charters, with code blocks,
  commands, YAML, dispatch blocks, tables, and protected literals
  byte-preserved; plus a boilerplate pass tightening the two per-file workflow
  preamble sentences and deduplicating the Synapse lifecycle sentence to
  `references/synapse-policy.md`. Net vs pre-feature main: workflows −7.4%
  (348,591 → 322,689 B); total skill surface −11,405 B. The feature's ≥20%
  total-byte goal was missed (recorded in the feature's validation report) —
  the corpus is contract/table-dense; the win is structural (conditional bodies
  now load only on trigger). Three stale predecessor-repo hook citations in
  `hook-enforcement.md`/`lessons.md` repointed to `apps/claude-plugin/hooks/`.
  All 36 edited workflows and the 3 body-changed agent charters
  (judge, meta-judge, navigator) bumped to frontmatter
  `metadata.version: "1.1.0"` (body changed ⇒ version bumps — lesson L-018).

## [1.26.0] - 2026-08-05

### Added

- **Agent Skills metadata frontmatter on every workflow file.** All 36
  `skills/massa-ai/workflows/**/*.md` files now open with YAML frontmatter modeled on the
  Agent Skills specification (agentskills.io): `name` (file stem), a hand-authored
  double-quoted `description` (what the workflow does + when to route to it),
  `license: MIT`, and `metadata.version: "1.0.0"`. Prepend-only — every body is
  byte-identical after stripping the block. A new gate,
  `scripts/__tests__/workflow-metadata-headers.test.ts` (in `bun run test:scripts`),
  parses each block with a real YAML parser (`Bun.YAML.parse`, never regex key-presence),
  locks the 36-file population with a printed roster, and validates name charset/stem
  match, description length 20–1024, semver `metadata.version`, and license. This test is
  the sole backstop for workflow frontmatter — `skills.yml` CI validates `SKILL.md` files
  only, and `generate-skill-artifacts.ts` byte-copies workflows into all four host
  bundles, so an invalid block would otherwise ship unseen. The
  `skills-duplication-metric` ceiling moved 331 → 471 with an in-file reason: the excess
  is the mandated frontmatter uniformity itself (the same four structural lines × 36
  files), not prose drift.

- **Model-profile switching: switch installed agents to a registry profile without a
  repo checkout.** One switch engine (`@massa-ai/shared`'s `packages/shared/src/profile-switch/`)
  fronted by three surfaces — MCP tools (`profile_list`, `profile_set`), a `profile
  list|show|set <name> [--host h] [--dry-run]` subcommand in both `massa-ai-config` CLIs
  (mcp-client, opencode-plugin), and an OpenCode in-process `profile` tool — plus a Claude
  skill (`/massa-ai:profile`, `skills/profile/`). Every registry profile now ships
  pre-rendered inside each plugin bundle (`agent-profiles/<profile>/`, sibling of
  `agents/`); switching copies the chosen profile's already-built files over the
  installed active agent set, offline, on an npm-only install — no resolver, no repo
  checkout, no network. The chosen profile is recorded per host in
  `install-state.json` (`platforms[host].modelProfile`) and survives plugin upgrades; a
  new `installRoute` field (installer-owned) lets the switch engine refuse loud on a
  marketplace-route Claude/Codex install rather than risk dirtying a checkout. A host
  session restart is required for a switch to take effect — no host supports per-agent
  runtime indirection; this is switch-time re-render between sessions, not live
  in-session switching (see the amended non-goal in
  `.specs/features/model-profile-registry/spec.md`).

## [1.25.0] - 2026-08-05

### Changed

- **Persona routing chain cut from ~8k to ~2k tokens on a pinned project.**
  `skills/persona-router/SKILL.md` slimmed 13,316 → 5,484 B with two new fast paths — a
  project `AGENTS.md` `persona_pin` line (valid pin reads only the pinned prompt;
  `no_persona` completes silently; invalid pin reports once and falls back) and a recalled
  `persona-route:<projectId>` pattern memory that skips doc inspection and classification.
  Moved detail lives in `skills/persona-router/references/routing-details.md` with explicit
  load conditions. `skills/massa-ai/personas/catalog.json` is now a schema_version 2
  two-tier index (8,871 → ≤2,500 B): entries carry only id/display_name/aliases/summary/
  prompt_path/signals_path, with the routing-signal arrays moved verbatim into per-persona
  `personas/signals/<id>.json` files loaded only when classification actually runs. All
  five persona prompts compressed to ≤4,500 B with their original top-level themes
  retained. The `persona_pin` policy is documented in the `skills/AGENTS.md` bootstrap
  block, and this repo pins `context-skill-harness-engineer-architect`. Host skill bundles
  regenerated for all four plugins.

### Added

- **Skill size-budget gate.** `scripts/__tests__/skill-size-budgets.test.ts` fails
  `bun run test:scripts` when persona-router artifacts regrow past their byte budgets
  (SKILL.md 5,500; catalog.json 2,500; prompts 4,500; references 8,000; signals 2,500) or
  `skills/massa-ai/SKILL.md` exceeds its 21,000 B freeze ceiling. Prints the resolved file
  population beside verdicts and fails on an empty glob, so a moved subject cannot pass
  vacuously.
- **`install-skills.sh --check` double-surface probe.** On the claude platform, when
  `install-state.json` records `skillsOwner: "repo"` and `~/.claude/settings.json` enables
  the `massa-ai@massa-ai` plugin, `--check` now reports the double registration surface
  (naming both files) and exits non-zero. Missing state file or missing `enabledPlugins`
  key stays exit 0. Covered by `scripts/tests/test-skills-check-double-surface.sh`.

## [1.24.0] - 2026-08-05

### Added

- **Orchestrator working-memory contract for sub-agent dispatch (ORC-01..09).** The
  dispatch-mechanics references now encode the orchestrator-tax findings: never poll a
  running subagent or ingest its transcript/JSONL (the returned output contract is the
  only channel back), a wave cap of 4 concurrent subagents with a recorded
  consolidation check before larger fan-outs, an explicit cognitive-locality
  consolidation signal covering read-only agents, a repository-wide git-operation
  prohibition for concurrent workers, an explicit subagent non-inheritance rule, and a
  default 40-line return bound with a dual-channel rule for report-writing dispatches.
  The Capability Packet now has a single canonical definition in
  `references/agent-orchestration.md` (13 fields, incl. the conditional
  `audit-specialist` `lens` and `next_use`, renamed from the input-side "exact next
  step" bullet); `references/subagent-design.md` defers to it and the self-contained
  `skills/AGENTS.md` mirror is guarded by the new
  `scripts/__tests__/capability-packet-parity.test.ts`. `judge-with-debate` and
  `furps-refinement` now carry standard 9-field dispatch blocks (dispatch-block census
  24 → 27), and the FURPS six-dimension fan-out runs in waves of at most 4. Host skill
  bundles regenerated for all four plugins.

## [1.23.0] - 2026-08-05

### Added

- **Five harness-wide workflow policies (WFP-01..05).** Implementation workflows now
  require `@Preview` composables for every created or updated screen-level composable on
  Android Jetpack Compose / KMP Compose Multiplatform (normative rule in
  `references/mobile-context.md`, debug-path pointer in `mobile-diagnosis.md`), and must
  keep the PR description current after each requested push, before merging
  (`references/implementation-delivery.md`, with a stale-description merge anti-pattern).
  Figma-consuming workflows (`design`, `mobile-figma-audit`, `mobile-figma-fix`,
  `feature`, `spec-driven`) gain a new `references/figma-pre-analysis.md` protocol: one
  read-only pre-analysis subagent maps the provided Figma links and proposes a retrieval
  partition (by size, coupling, feature flow), then the main agent dispatches retrieval
  subagents strictly sequentially — never in parallel. All workflows now expand
  abbreviations on first use and use one batching vocabulary (Task = atomic unit,
  Phase = ordered group of Tasks, sizes reported as `1 Phase = X Tasks` /
  `Y Phases = Z Tasks`); the spec-driven sub-agent offer was reworded from "batch" to
  Phase-group terms. Host skill bundles regenerated for all four plugins.

## [1.22.0] - 2026-08-04

### Changed

- **All 8 harness/repo Python scripts ported to TypeScript under Bun; lessons store is
  single-file.** `check_commit`, `check_specs_delivered`, `validate_spec`, `validate_state`,
  `validate_tasks`, and `lessons` (under `skills/massa-ai/scripts/`), plus
  `scripts/update-fixture-hashes` and `scripts/synapse-bench-analyze-v2`, are now `.ts`
  invoked as `bun <script>.ts`; every `.py` original is deleted and `package.json:42`'s
  `update-fixture-hashes` script no longer assumes a `python3` runtime. CLI surface (flags,
  positionals, exit codes 0/1/2, asserted output) is preserved byte-for-byte, proven per
  script by a temporary dual-run characterization harness before each `.py` deletion, then
  materialized as a permanent `bun test`-only golden regression suite
  (`scripts/__tests__/pyts-golden.test.ts`) once the harness itself was removed. `lessons.json`
  is now the only lessons artifact — the rendered `.specs/LESSONS.md` playbook and its
  render path are gone; `lessons list` is the on-demand replacement view. Every `python3`
  invocation and `.py` basename reference under `skills/` and `apps/*/skills/` is repointed
  or removed (sweep-verified, zero remaining). **Operator note:** if you installed the
  `check_commit.py` git `commit-msg` hook via the old `ln -sf … check_commit.py
  .git/hooks/commit-msg` recipe, that symlink now targets a deleted file — re-create it
  against `check_commit.ts` (`ln -sf skills/massa-ai/scripts/check_commit.ts
  .git/hooks/commit-msg && chmod +x .git/hooks/commit-msg`, the same recipe now in
  `references/spec-driven/execute.md`).

## [1.21.0] - 2026-08-04

### Changed

- **TLC spec-driven harness synced to 3.3.0.** Four new deterministic validator scripts
  (`validate_spec.py`, `validate_tasks.py`, `check_commit.py`, `validate_state.py`) plus
  `check_specs_delivered.py`, wired as "run it, do not eyeball it" gates from
  `specify.md`/`tasks.md`/`execute.md`/`validate.md`/`sub-agents.md` and
  `workflows/spec-driven.md`; `specify.md` gains EARS-shaped acceptance criteria and a
  discuss-pace system (Quick/Guided/Detailed); `validate.md` forbids `git stash` and adds a
  porcelain baseline for the discrimination sensor; `execute.md` reorders status-before-commit
  into the same step. The batch sub-agent offer trigger drops from `>~8` to `>3` tasks
  everywhere it is stated. `implementation-delivery.md` gains a new "deliver specs before PR"
  gate — stage 3.5 running `check_specs_delivered.py` between Push and Propose, with a
  blast-radius delivery-authorization sentence naming exactly what one Execute approval
  covers. `verification-agent`'s charter is pinned to the `deep` model tier (verification
  subagents always run the heaviest available model), regenerated across all four host
  bundles. `lessons.py`'s dedup normalizer now strips Unicode combining marks (NFD) instead
  of matching only ASCII, with a `selftest` subcommand.
- **ALL-workflows evidence rules + read-only tier pins.** The massa-ai router's Core
  Contract gains two universal rules: verify-don't-assume (documentation of any kind —
  README, docs/, comments, `.specs` prose — is a lead to verify against current source,
  never a trustable source of truth by itself) and ask-when-in-doubt (facts are looked up,
  decisions are asked); the Knowledge Verification Chain's "Project docs" step carries the
  leads-not-truth qualifier at all four sites. All read-only specialist charters now pin
  `model_tier: deep` (8 bumped: audit-specialist, context-curator, furps-analyst,
  investigator, mobile-specialist, navigator, requirements-analyst, reviewer — read-only
  and verification subagents always run the heaviest model), regenerated across all four
  host bundles. New planned feature spec `python-to-typescript-scripts` registered:
  migrate all 8 Python scripts (including `lessons.py`) to Bun TypeScript with dual-run
  characterization parity.

## [1.20.0] - 2026-08-04

### Added

- **LLM test seams on the core barrel.** `_setLlmEnabledForTesting` and
  `_setJsonSchemaSupportedForTesting` are exported from `@massa-ai/core`, so an `apps/` suite
  can pin the LLM gate for direct `bun test <file>` runs the same way the isolated runner's
  `buildChildEnv` (SEN-03) pins it for every wrapper child.
- **UNION GUARD wiring sensor.** A `_PARALLEL_DROP_RESULT` test seam in
  `scripts/run-tests-parallel.ts` drops one assembled result pre-guard, making the
  missing-suite branch's call-site wiring (exit 1 + `UNION GUARD FAIL` naming the id)
  end-to-end testable; the upgraded suite replaces the previous source-text assertion.
  Deleting the branch's `return 1` was measured invisible to every pre-existing test and is
  killed by the new drop test (closes lesson L-001, now confirmed).
- **`CONTRIBUTING.md` § Measurement discipline.** Six rules for figures quoted as evidence —
  tracked-state instrument verification, pass/fail split over pass count, cached / replayed /
  pipe-wrapped results are not measurements, population beside verdict, corrections recomputed
  from inputs, carried-forward staleness — each citing a recorded instance.

### Fixed

- **The `embedded-api-client-endpoints` "known outstanding case" is closed.** The suite sets a
  scratch `XDG_CONFIG_HOME` before any core-reaching import (static imports hoist, so the core
  imports are dynamic) and pins the exported LLM seam: direct runs under a real user config
  went 93 pass / 2 fail cold (44.96 s) to 95 / 0 in ~5.8 s. The standing diagnosis named the
  unexported LLM seam as the blocker; the failing search routes actually reach live
  embedding-provider auto-selection, a second mechanism the seam never gated — `CLAUDE.md`'s
  paragraph now records the two-mechanism post-mortem.
- **`FEATURES.json` registry truth for `subagent-skills-plugin-parity`.** The entry sat
  `in_progress` with design/tasks/execute `"pending"` while the feature's own `validation.md`
  records an independent PASS dated 2026-07-23; now `complete` with the evidence cited.
- **Two stale carried-forward STATE notes annotated.** `includePersistent` "inert" (fixed by
  BEH-01 in v1.9.1) and the `@massa-ai/shared` runner-isolation gap (fixed by SEN-03 in
  v1.10.0 at the hermetic-child-env surface); both struck in place with their evidence chains.
- **Worktree-provisioning rule for native grammars documented.** `bun install` exits 0 on
  macOS arm64 + Node 25 while node-gyp silently fails; `CLAUDE.md` now names the failure
  signature, the two repairs, and the verify command (measured 1227/3 → 9/0 this session).

## [1.19.0] - 2026-08-03

### Added

- **A type-enforced sanitization boundary on Observation persistence.** `kernel/sanitize/`'s
  `scrubCredentials` redacts seven credential shapes (PEM blocks, JWTs, AWS key ids, `sk-` keys,
  GitHub tokens, bearer tokens) both directions (near-miss content passes through byte-identical),
  and a branded `SanitizedPayloadJson` type at `ObservationStore.insert` makes a bare-string
  payload a compile error — enforced by an in-process `ts.createProgram` compile-fixture gate,
  since `packages/core/tsconfig.json` excludes `src/__tests__` from every other type-check. Both
  the hook-ingestion and `compact_snapshot` call sites are wired through the boundary.
- **`scripts/check-security-allowlist.ts`, a count-bounded CI gate for dangerous primitives.**
  AST-based (TypeScript compiler API, not regex) matching of `exec`/`spawn`/raw-SQL/`eval` call
  sites; a new or removed call site outside the reviewed allowlist fails the build naming
  file:line. Runs in CI's `build` job beside oxlint.
- **`scripts/check-workflow-venue-parity.ts`, a CI gate closing the two-workflow divergence
  class.** Compares each workflow's test-invocation environment against a declared semantic key
  set (with an explicit, justified exception list) and fails naming the file + key on an
  unclassified or undeclared divergence.
- **Bun install-cache warming across every install-bearing CI job.** An `actions/cache@v4` step
  keyed on `hashFiles('bun.lock')` (with an os/arch-scoped restore-key fallback) now precedes
  `bun install` in `ci.yml` (×3 jobs), `coverage.yml`, and `publish.yml`; the existing
  purge-and-retry fallback is unchanged and still runs on a cache-independent failure.
- **`ci.yml`'s blocking `build` job now runs the DEDICATED_DB-gated test suites.** The job's
  Postgres service and `DATABASE_URL` match `isDedicatedDatabase()`'s literal shape
  (`127.0.0.1:5433/massa_ai_test`) and sets `RUN_POSTGRES_TESTS=1`, so the suites that previously
  skipped silently under the required check now execute there.
- **`scripts/lib/host-capabilities.ts`, an explicit per-host capability table** driving both the
  subagent and skill generators (byte-identical output for all four existing hosts), proven
  load-bearing by a test-only fixture fifth host, plus `docs/adding-a-host.md` documenting the
  capability contract a new host must declare.
- **A shared RSS-delta test helper** (`packages/core/src/__tests__/helpers/rss-delta.ts`) so
  `cycle-detection.test.ts` and `structural-runtime.test.ts` no longer each reimplement the
  baseline/measure/median idiom; thresholds and comparison semantics are unchanged.

### Fixed

- CLAUDE.md's "Running tests" section described the three per-package isolated-test runners as
  "separate, divergent copies" with stale line counts; they are thin wrappers over the shared
  `scripts/lib/run-tests-isolated.ts`, and both the runner-architecture description and the
  `test:scripts` pass/file/shell-suite counts are corrected to figures re-measured at HEAD.
- `check-coverage.ts`'s stale "50 suites" comment is replaced with the re-measured population.
- `turbo.json`'s `tasks.test.passThroughEnv` was missing 27 read `MASSA_AI_*` vars plus
  `RUN_POSTGRES_TESTS`; both are added, and a new drift test
  (`scripts/__tests__/turbo-passthrough-env.test.ts`) mechanically re-derives the read-set on
  every `test:scripts` run so the gap cannot silently reopen.
- `FEATURES.json`'s `workflow-harness-overhaul` entry used the hyphenated `"in-progress"` spelling
  against every other entry's `"in_progress"`; normalized.

## [1.18.0] - 2026-08-03

### Changed

- **`tools/read_file.ts` is a thin handler now — 490 of its 707 lines (69.3%) moved into
  `services/`, and a new CI gate keeps every handler that way.** The path-containment security
  rules, project-root cache, file-content cache, metadata extraction, line-range math and the
  read orchestration live in `services/file-read/` (six modules); the shared LRU eviction landed
  in `services/cache/lru-evict.ts` and five formerly copy-pasted cache sites delegate to it.
  `index_project.ts` shed `executeIndexing`, the project-identity helpers and the managed-run
  lease acquisition the same way. **Behavior is preserved and proven, not argued**: the
  characterization suites written before anything moved pass unmodified across every extraction,
  and the MCP `read_file` `inputSchema` and REST `/file` response shape are byte-identical.
  `scripts/check-tools-thin.ts` — a TypeScript-AST rule with **zero allowlist entries** — now runs
  in CI's required `build` job and reads `PASS — 0 of 30`.

- **`services/graph/` is renamed `services/memory-graph/`** so the memory-relation graph stops
  sharing a bare name with the symbol graph (`services/symbol/`) and the symbol repository
  (`data/symbol/`). Internal layout only: `@massa-ai/core`'s `exports` map (`.`, `./tools`,
  `./services`) never exposed the old directory path, and every exported symbol name is unchanged.

- **The coverage gate can now see a dangling exclusion.** The stale `EXCLUSIONS` entry for a file
  that moved to `kernel/` a release ago (and has been at 100% since) is deleted, and the gate's
  test gains an existence assertion resolving every entry against the real repo root — the prior
  pin was a pure string-shape check that a `git mv` could never fail.

### Removed

- **`IHybridSearch`** from `@massa-ai/shared`, **`BatchCommand`** from `@massa-ai/core/tools`,
  and core's unshipped `data/vector/{index,hybrid-search}.ts` pair. Priced per item rather than as
  one blanket removal: the two interfaces **were reachable** from published entry points
  (`@massa-ai/shared`'s `.`/`./types`; `@massa-ai/core`'s `./tools`) and measured **zero
  consumers by every method tried** — static import, dynamic `import()`, `mock.module`,
  string-built specifier, both transports; the `data/vector/` barrel and its dead `HybridSearch`
  class had **zero reachability** on top of zero consumers (`@massa-ai/core` exposes no `./data`
  subpath), making that half of the removal invisible to any package consumer. The live hybrid
  search — `services/search/hybrid-search.ts` — is untouched. Verified against a cache-forced
  `npm pack --dry-run` from a clean rebuild, not a stale `dist/`.

## [1.17.0] - 2026-07-31

### Changed

- **`@massa-ai/core` no longer publishes a `./controllers` subpath, and `./services` now carries
  the 17 symbols it used to.** `packages/core/src/controllers/` is retired: the five orchestrators
  move into the `services/` subdirectory that already held each one's collaborators —
  `MemoryController` → `services/memory/`, `SearchController` → `services/search/`,
  `ContextController` → `services/context/`, `ExecutorController` → `services/executor/`,
  `GraphController` → `services/symbol/` — **keeping every exported symbol name**.

  Two published-surface changes, and only one of them is a removal. The
  `@massa-ai/core/controllers` subpath is **gone**; it had **zero** consumers, in this repository
  and in both transports, which import these classes from the root barrel instead. In exchange
  `@massa-ai/core/services` **gains 17 symbols** — the five classes plus twelve of their input and
  result types — because the old `controllers/index.ts` barrel was the only route by which they
  reached `@massa-ai/core`'s root export, and deleting it without replacing that route would have
  dropped published symbols silently. **Importing from the package root is unaffected**: all five
  classes and all twelve types resolve exactly as before, verified against the built `dist/` rather
  than against the source.

  If you import from `@massa-ai/core/controllers`, switch to `@massa-ai/core` or
  `@massa-ai/core/services`. Nothing else moves, and no behaviour changes: each module's code is
  byte-identical across its move apart from its own import paths.

  Note for readers of the tree rather than the package: `services/graph/` is the **memory-relation**
  graph. The **symbol** graph, and the orchestrator fronting it, are in `services/symbol/`.

- **`packages/core` gains a `kernel/` tier, and the layer contract is now enforced instead of
  asserted.** Cross-cutting leaves move to `packages/core/src/kernel/` — `db-connection`,
  `prisma-client`, `fqn-codec`, `alias-resolver`, `identity-guard-installer`, `search-diagnostics`,
  `lexical-search`, `enum-validation` and three supporting modules, 11 in all. Membership is the
  path prefix, granted by moving the file; **there is no allowlist**, deliberately, because an
  allowlisted exception is indistinguishable from a new violation.

  The contract is `tools → services → data` with `kernel/` off the axis, and
  `scripts/check-core-layering.ts` now fails the build on any backward edge — `data → services`,
  `data → tools`, `services → tools`, or a `kernel/` file importing any tier. It runs in CI. On the
  released tree it reports **0 violations across 965 tier-to-tier edges in 895 tracked files**;
  `data → services` was **26** before this work and `services → tools` **4**, both closed by moving
  modules rather than by recording exceptions.

  `ToolError` and `validateEnum` therefore no longer live in `tools/enum-validation.ts` — they are
  in `kernel/enum-validation.ts`. Both are reachable from the package root as before.

- **`BaseVectorStore` takes an embedding-provider factory instead of selecting one itself.** It is
  an optional constructor option, and `getVectorStore()` — the only production construction site —
  supplies `() => createEmbeddingProvider({ cache: true })`, so nothing changes for callers using
  the factory.

  What changes is the failure mode when it is *absent*. Provider selection stays lazy and memoised,
  exactly as before — construction still does no work — but the first call to
  `getEmbeddingProvider()` on a store built without a factory now **throws a named error** instead
  of quietly auto-selecting a live provider. The practical effect is on tests that construct a
  store directly and then embed: they fail immediately and say why, rather than hanging on a cold
  model load.

## [1.16.0] - 2026-07-31

### Changed

- **The graph-neighbor search stream is now a standalone capability module.** `buildGraphStream`
  moves out of `rlm-synapse.ts` into `graph-stream.ts` and drops the facade parameter it never
  used. It was the one delegate that already read zero members off `ContextualSearchRLM`, so the
  parameter was pure ceremony from the earlier split — carrying it forward is what made the file
  look like a rename rather than an extraction. The body moved byte-identical; the only behavioural
  surface that changes is the argument list, and the module no longer references the search facade
  at all. Functions in the search directory that still take the facade drop from **14 to 13**.

  Deepest foreign reach stays at **14** and the hub gate still fails, both expected and unchanged
  from the previous release: the maximum is set by `rlm-search.ts` and cannot move until that file
  is split. The count of modules reading the facade also stays at **5** — `rlm-synapse.ts` keeps
  two members through its remaining two functions, and only sheds the last of them two extractions
  from now.

- **Synapse session biasing is now a standalone capability module with an injectable dependency
  record.** `applySynapseState` moves out of `rlm-synapse.ts` into `session-bias.ts` and trades the
  search facade for `SessionBiasDeps` — the two collaborators it actually reads, `sessionRegistry`
  and `synapseManager`, and nothing else. The practical gain is that the behaviour is now unit
  testable from an object literal: reaching this body previously meant constructing the whole
  search service, which intercepts seven factory modules before the first assertion runs. Functions
  in the search directory that still take the facade drop from **13 to 12**, and the module reads
  **zero** facade members.

  Behaviour is unchanged, including one detail that is easy to lose in a move like this: the two
  collaborators still fall back to their process factories *inside* the module rather than being
  resolved by the caller, so a search with no session still touches neither factory. Resolving them
  eagerly would have been the one way this extraction stopped being behaviour-preserving.

  Deepest foreign reach stays at **14**, the hub gate still fails, and the number of modules reading
  the facade stays at **5** — all three expected and all three unchanged, for the same reason as
  above. What does move is `rlm-synapse.ts`, from two facade members to one.

- **Fuzzy query correction moves into the hybrid-search module, and the Synapse delegate file is
  gone.** `correctQuery` leaves `rlm-synapse.ts` for the new `hybrid-search.ts` and trades the search
  facade for `HybridSearchDeps` — at this stage the one collaborator it reads, the keyword store. It
  was never Synapse code: it corrects query typos against the keyword store's vocabulary and its only
  caller is the search path, so it sat beside the session delegates purely by accident of an earlier
  split. With it gone `rlm-synapse.ts` has no exports left and is **deleted**. The three functions
  that shared that file shared no state at all, which is why it decomposed into three modules rather
  than moving as one.

  Behaviour is unchanged, including the case where the keyword store is missing: the dependency
  record carries the live field rather than a pre-resolved copy, so an unconfigured store still fails
  exactly where it did before. Functions in the search directory that still take the facade drop from
  **12 to 11**.

  **The number of modules reading the search facade finally drops, 5 to 4.** This is the extraction
  where the last outside reader of that file's facade state goes away. Deepest foreign reach stays at
  **14** and the hub gate still fails — both are set by `rlm-search.ts`, and neither can move until
  that file is split, which is the last step of this work.

  Query correction also gained a regression test for a property subtler than the move itself. The
  facade builds each capability module's dependency record **per call**, which is what lets a test
  replace a collaborator after construction and have it honoured. Memoising that record would leave
  every existing test green while silently ignoring the replacement, because every test to date sets
  its collaborator up before the first call. There is now a test that swaps a collaborator *between*
  two calls and asserts each call saw its own — the one shape the previous suites could not
  distinguish.

- **Project indexing is now a standalone capability module, and lazy initialisation moved into the
  search service itself.** `rlm-indexing.ts` is gone. Its six indexing surfaces — full project index,
  single-file index, freshness check, search-admission preflight, gitignore loading and the
  per-project mutex — live in `project-indexer.ts` and take `IndexerDeps`, the five stores they
  actually read plus the two operations they re-enter, instead of the whole search facade. The
  seventh export, lazy initialisation, could not move anywhere: it reads eight members off the
  service, so any capability module holding it would fail the coupling gate permanently. It is now
  the body of `ContextualSearchRLM.ensureInitialized()`, which is why the old module could be deleted
  outright rather than left behind as a single-function file. Functions in the search directory that
  still take the facade drop from **11 to 6**, and the lines they cover from **1108 to 626** — the
  largest single step of this work.

  **Modules reading the search facade drop from 4 to 3.** Deepest foreign reach stays at **14** and
  the gate still fails, both expected and unchanged: the maximum is set by `rlm-search.ts` and cannot
  move until that file is split, which is the next-to-last step. Initialisation timing, ordering and
  observable behaviour are unchanged — each public method still awaits initialisation first and only
  then assembles its dependency record, so the fields the module reads are populated exactly as
  before. Single-file indexing deliberately still does *not* initialise, because it never did; its
  callers do.

  Two properties are now pinned by tests that did not exist before, both of which the previous suites
  could not distinguish from correct code. The dependency record is rebuilt on **every** call, so a
  test that replaces a collaborator after construction is still honoured — and the two re-entrant
  operations resolve through the live service on every invocation rather than being bound once, so
  replacing one of *those* between calls is honoured too. The richest existing indexing suite, which
  carries more than half of all such replacements in the codebase, stays green under a memoised
  record; that is why the new test exists rather than relying on it.

  One coupling measurement is worth recording because it is a property of the measurement rather than
  of the code: typing a dependency-record field with a class declared in the same directory made the
  gate attribute that module's method calls to the class, reporting a second violation where the
  codebase has one. The field now names only the four methods it uses, which is both the accurate
  type and the reading the gate intends.

- **The project index manager can now be supplied from outside the search service.** It was the one
  collaborator with no injection point at all: every other dependency either arrives from a process
  factory the service can be told to skip, or is handed in at construction, while the index manager was
  built by direct construction inside lazy initialisation, with no field able to override it. Callers and
  tests can now pass one in alongside the stores. Nothing else changes — supply no index manager and the
  service constructs exactly what it constructed before, over the same vector store, at the same point in
  initialisation. A service that has already initialised is left alone, as it was before.

  This is the only dependency in this work that gains a *new* seam rather than having an existing one
  moved, and it is the last piece of the service's own state that could be reached only by patching the
  object after the fact.

  The seam is pinned by a test asserting that a supplied index manager is the one actually used, not
  merely that initialisation still succeeds. That distinction is the whole risk in a change like this: a
  seam can be declared, typed and wired and still never be consulted, and a test exercising only the
  default path passes either way. The default path is pinned separately, including which vector store the
  constructed manager ends up holding — an ordering mistake would leave it holding nothing while still
  producing an object of the right class.

  Coupling measurements are unchanged in every direction: the same single violation, the same deepest
  reach, the same set of functions taking the facade. This adds a field and moves no code. Worth saying
  explicitly, because the previous step showed that a dependency field typed with a class from the same
  directory can move those numbers by itself; this field is optional, and that is what keeps it outside
  what the measurement looks at.

- **Index administration is now a standalone capability module, and the admin delegate file is gone.**
  Clearing a project's index, reading its statistics, warming the search cache and reaching the
  analytics instance move out of `rlm-admin.ts` into the new `index-admin.ts` and trade the search
  facade for `IndexAdminDeps` — the three stores they actually read, the file-filter cache, the
  analytics instance, and a callback back into search. With them gone `rlm-admin.ts` has no exports
  left and is **deleted**. Functions in the search directory that still take the facade drop from
  **6 to 2**, and the amount of code inside that boundary drops from **626 to 524** lines.

  Behaviour is unchanged, including the two details easiest to lose in a move like this. Lazy
  initialisation still runs first for the three surfaces that always ran it, in the same order — it is
  now the first statement of the service method instead of the first statement of the delegate, so the
  fields the module reads are populated exactly as before. And the analytics accessor still does *not*
  initialise, which is what it has always done; adding an await there would have been a behaviour
  change dressed as a tidy-up.

  Cache warmup is the first extracted surface that calls **back** into search, so its dependency record
  carries a callback rather than a captured reference, and the callback re-reads the method each time it
  runs. That is not a style preference: it is what keeps a substituted search implementation effective,
  and the difference is invisible to every pre-existing test, because all of them substitute before they
  call rather than between two calls. A test that swaps the implementation mid-flight now pins it.

  The number of modules reading the search facade drops from **3 to 2**. Deepest foreign reach stays at
  **14** and the hub gate still fails — both set by `rlm-search.ts`, and neither moves until that file
  is split, which is the next step. One measurement note, because the previous two releases each carried
  one and this one corrects them: the earlier finding that a dependency field typed with a class from the
  same directory can move the gate by itself does **not** apply to either nominal field here. One of them
  is not a distinct type at all but an alias re-export, so the measurement never sees it; and its value is
  handed back through a public accessor, so narrowing it would break the published return type. Both were
  measured rather than assumed, in both directions.

- **Hybrid search is now a standalone capability module, the last search delegate file is gone, and the
  coupling gate passes.** The search entry point itself — 455 lines and the widest of them all — moves out
  of `rlm-search.ts` into `hybrid-search.ts`, along with result-context hydration, preview extraction,
  average scoring and glob filtering. All five trade the search facade for `HybridSearchDeps`: the five
  stores they read, plus three callbacks back into the service. With them gone `rlm-search.ts` has no
  exports left and is **deleted**, and with it the last of the five delegate files the earlier split
  produced. Functions in the search directory that still take the facade drop from **2 to 0**, and the
  amount of code inside that boundary drops from **524 lines to none**.

  **This is the step the whole series was for.** Deepest foreign reach — how many members of the search
  service any one other module reaches into — drops from **14 to 1**, and the coupling gate goes from
  failing to **passing**: no type in the directory is now read more than the ceiling of three members
  deep. Both numbers were pinned by `rlm-search.ts` and could not move until it was split, which is why
  every earlier step reported them unchanged.

  Behaviour is unchanged, including three details that are easy to lose in a move this size. Lazy
  initialisation still runs first, still converts a failure into the same service error and still records
  it — the wrapper moved along with the call rather than being dropped for a bare await, which would have
  surfaced a raw factory error instead. Result-context hydration and the graph-neighbour stream are
  reached through callbacks that re-read the method each time they run, not through captured references,
  which is what keeps a substituted implementation effective. And the query-understanding collaborator is
  typed to the single method it uses, which is both the honest type and what keeps it out of the coupling
  measurement.

  Two files in the directory now sit close to the size ceiling the same gate enforces — 697 and 686 lines
  against a limit of 700 — because this series has been moving code out of the delegate files and into
  these two. The reasoning behind each decision lives in the project's own records rather than in the
  source, for that reason.

- **The search service's own notes on why its surface is public are now accurate.** Ten comments inside
  the service still explained nine public methods and one public field as a concession to a delegate file
  that no longer exists — the previous step in this series deleted it. They are replaced by the two
  reasons that actually hold: the class keeps its published method surface for the twenty-four modules
  that import it, and the query-understanding field additionally has a live production reader, the one
  that resolves cache-invalidation targets after a rename.

  No behaviour, signature or exported name changes, and nothing leaves the public surface. It is worth a
  line rather than silence because the two reasons are not interchangeable: tightening the nine methods
  back to private is caught by no automated check in this repository, while tightening the field is a
  compile error. Anyone later deciding whether a modifier can be narrowed needs to know which of the two
  they are holding.

- **The four search test suites are renamed after what they test, and stale documentation that pointed at
  deleted files is corrected.** `rlm-admin`, `rlm-indexing`, `rlm-search` and `rlm-synapse` become
  `search-facade-admin`, `search-facade-indexing`, `search-facade-hybrid` and `search-facade-synapse`.
  They drive the search facade rather than the capability modules the old names implied, and no file in
  the package is named after a delegate that no longer exists. The onboarding guide's description of the
  search layer was also several steps out of date — it described modules taking the facade instance as
  their first argument, which this series replaced with narrow dependency records — and the coverage
  suite's header cited a line range that had drifted by about a hundred and eighty lines.

  No test was added, removed, skipped or relaxed: every suite runs the same case and assertion counts as
  before, verified per file rather than in aggregate. Comments recording where a body originally moved
  from are kept deliberately; they name deleted files on purpose, and a new check now fails if one of
  them is removed as well as if a live reference goes stale.

- **Two structural checks that existed but enforced nothing now run in CI.** The search-facade hub
  metric and the stale-pointer check were both written with unit suites and both passed on demand,
  but neither ran against the repository in any workflow, so a violation could merge unnoticed. Both
  are now steps in the `build` job, beside the existing package-contents and skill-bundle gates.
  `build` was already a required status check, so they enforce from the moment they land — no branch
  protection change was needed, and that was measured rather than assumed.

  Two other checks in the same family, the frozen-anchor and characterization guards, turned out to
  be enforced already: their unit suites run the real script against the real tree, and that suite
  runs in CI. They needed no wiring. The distinction is worth recording because "has a test" and
  "gates the repository" looked identical from the outside and were not.

  The checkout step for that job now fetches full history. The stale-pointer check separates a
  deliberate historical reference from a broken one by asking whether git ever recorded the path, and
  the default single-commit checkout cannot answer that: measured at the same commit, a shallow
  checkout reports 28 broken pointers and no historical ones, where full history reports none broken
  and the historical count exactly on its pin. It would have failed every run on a clean tree.

- **Retrieval quality is unchanged by this refactor, and proving it needed a new instrument because
  the existing comparison cannot separate a rename from a regression.** The needle benchmark clears
  both of its floors — hit@1 64.3% against a floor of 50%, MRR 0.745 against 0.65, the latter up from
  0.7357 — but the per-needle comparison reports one needle moving from rank 5 to rank 6, which the
  comparison tool treats as a regression and which it is not.

  The cause is that the chunker writes the file's path into every chunk before that chunk is
  embedded, along with the name of the enclosing symbol. Both are there to help retrieval and both
  work. But it means renaming a file, or renaming a function inside it, changes the text being
  embedded and therefore every similarity score in that file — without changing what the code does.
  Two chunks that were 0.0134 apart ended up 0.0030 apart the other way, and swapped places. The
  affected needle's own score did not move at all; something else moved past it.

  So `needles-diff` reports a regression whenever a release renames a file the benchmark covers, and
  will do so again for the next stage of this work. Rather than relax it — a comparison that tolerates
  a rank drop stops detecting the thing it exists for — there is now a second tool that re-runs the
  benchmark twice, changing only the path each file is labelled with, so the rename can be held
  constant while everything else stays as shipped. Under it all fourteen needles sit at their original
  rank. It refuses to report at all unless its first pass reproduces the real benchmark run exactly,
  because a second implementation that can silently disagree with the tool it stands in for would be
  worse than having none.

  This runs locally against an embedding model and is not part of CI, for the same reason the needle
  benchmark itself is not. The measurement covers the eight files the needles point into rather than a
  full index, so it is evidence that this refactor changed no ranking, not a statement about retrieval
  quality overall.

- **The web UI's edit and delete dialogs are now covered by tests, and the coverage gate no longer
  hangs.** Running the coverage gate would stop dead and never return. The cause was a browser dialog:
  the web UI asks for confirmation before editing or deleting a memory, and one test fires every click
  handler the app registers — including those two. Outside a browser those dialog calls read from
  standard input, so the gate sat waiting for a keypress that was never coming. Under continuous
  integration input is closed, the dialog returns nothing at all, and the handler gave up one line
  later, so nobody ever saw either the hang or the gap it was hiding.

  The tests now supply their own answers to those dialogs, which both removes the dependency on
  standard input and, for the first time, exercises what happens *after* someone confirms — the update
  and delete requests the app sends. That code had never run under test in any environment. Line
  coverage of the web UI's application script rises from **93.56% to 95.34%**, and the suite that used
  to hang indefinitely now finishes in about a second.

  Every source file this work touches is at or above the 90% coverage floor, with no new exemption
  added: the lowest is the project-indexing module at **94.57%**, and the six other modules extracted
  over this series sit between 95.54% and 100%.

## [1.15.0] - 2026-07-30

### Added

- **`skills/` duplication and reachability now ship as a committed regression gate.**
  `scripts/skills-duplication-metric.ts` measures shingled line duplication across every
  `skills/` Markdown file (`duplicatedLines` is the total footprint, `excessLines` is the
  removable figure — `length × (copies - 1)` — and the two are now reported and tested
  separately after an earlier draft conflated them) and `scripts/skills-reference-graph.ts`
  resolves every `skills/` file against the rest of the repository to flag orphaned or
  weakly-referenced files. Both ship with unit tests reached by `bun run test:scripts`, and
  `excessLines` carries a ceiling assertion so future duplication growth fails the gate
  instead of accumulating silently; a snapshot-equality assertion was rejected because it
  would go red on any unrelated edit.

### Fixed

- **`skills/AGENTS.md`'s Agent Table hand-named a model per specialist in a second location**,
  already stale for two roles and unresolvable or profile-ambiguous for two more —
  `skills/model-profiles.json` is the only place that should name a model or effort level
  for any agent on any host. The "Model hint" column is removed in favor of a pointer to the
  charter's own `metadata.model_tier`, and a scripted, mutation-demonstrated scan now bans
  any model display name or model ID from that file.
- **Three citations across two shipped Maestro reference files pointed at one developer's
  home directory** (`references/maestro.md`, `references/maestro/fact-ledger.md`, one
  instance named as a tier of the fact ledger's evidence taxonomy), unreachable for any
  other developer, CI runner, or session, and copied verbatim into all four
  `apps/*-plugin/skills/` bundles. The coverage-checklist rule is rewritten to a reachable
  location instead of being dropped, and a repo-wide scan now fails on any `/Users/` or
  `/home/` path under `skills/`.
- **`references/agent-orchestration.md`'s Roles table omitted `judge` and `meta-judge`**
  for a full release cycle, invisible to the existing guard because it validated only the
  charter paths already mentioned there. Both charters are now documented, and a new
  coverage test asserts every directory under `skills/agents/` has a Roles table entry.
- **The sub-agent roster guard could not match the string it existed to ban.** It rejected
  the literal patterns `16 subagent`, `16 [Ss]pecialist`, and `16 reusable sub-agent`, but
  the hyphenated `16 sub-agent specialists` in `docs/ONBOARDING.md` defeated all three while
  `CLAUDE.md` separately still read "15" — both passed the guard. It now rejects any count
  other than 17 in that shape, with an explicit historical allowlist for legitimate
  past-tense narration, and all four stale counts found by scanning
  (`CLAUDE.md`, `docs/ONBOARDING.md`, `FEATURES.md`, `.claude-plugin/marketplace.json`) are
  corrected.

## [1.14.0] - 2026-07-30

### Changed

- **Model and effort for the 17 subagent specialists now resolve from one registry, and
  three separate defects closed with it.** `skills/model-profiles.json` is the only
  hand-authored place that names a model or an effort level for any agent on any host;
  each charter declares a `metadata.model_tier` (replacing `metadata.model_hint`) and
  `scripts/lib/model-profiles.ts` resolves `tier + host + profile → {model, effort}` at
  generate time. Before this, 184 of 304 model facts were hand-copied across six surfaces,
  and the four per-host tables in `generate-subagent-artifacts.ts`,
  `subagent-parity.test.ts` and `FEATURES.md` could — and did — disagree.

  Three shipping defects, not one cleanup:

  1. **Cross-host tier drift on three roles, changing five shipped pins.** `navigator`,
     `requirements-analyst` and `planner` each carried contradictory tiers across hosts.
     The sharpest proof was inside `FEATURES.md` itself: `navigator`'s Claude and Codex
     rationale cells held the *same sentence* — "no frontier reasoning needed" — beside a
     standard-tier model on one host and a light-tier one on the other. Normalized to one
     tier per role, so `navigator` drops to the light tier on Claude, `requirements-analyst`
     rises to standard on OpenCode, and `planner` rises to deep on OpenCode.
  2. **The Cursor emitter had never produced a valid agent file.** It emitted `tools` and
     `reasoningEffort` — neither is a Cursor frontmatter key — plus a human-readable
     display name in `model:` where Cursor requires a model **ID**, and no `readonly`, which
     is Cursor's only documented permission mechanism. All 17 Cursor agents now emit only
     Cursor's documented fields, with `readonly: true` on the 14 read-only charters.
     `model:` is `inherit` on every tier: Cursor publishes no display-name→ID mapping and
     its catalog lists no entry for two of the three models previously pinned there, so
     `inherit` is the documented default rather than a guessed ID. `cursor-agent models` is
     the discovery path, and restoring differentiation is a registry-only change.
  3. **OpenCode was sending `name` and `metadata` to the model provider as bogus model
     options on every subagent invocation.** OpenCode's documented rule forwards
     unrecognized frontmatter keys to the provider as model options, so these were not
     inert — this was live behaviour, not hygiene. `name:` is gone (OpenCode takes the agent
     name from the filename, which already yields `massa-ai-<n>`), and the
     `massa-ai-owned: true` ownership marker **moves** from frontmatter `metadata:` to a
     `<!-- massa-ai-owned: true -->` body comment. It moves rather than being deleted
     because `massa-ai-config agents uninstall` scopes by that literal substring: removing
     it would have matched zero files, printed `removed 0`, and orphaned 17 installed
     agents. The substring is unchanged, so uninstall also still matches agent files an
     older version installed in the frontmatter form.

  Profiles are open data: adding, renaming or removing one is a registry edit with no
  TypeScript type, enum, or doc table to update. Selection is `--profile=<name>` >
  `MASSA_AI_MODEL_PROFILE` > registry `hostDefaults[host]`, with no fourth rank — an
  unknown name at any rank is a named error, never a silent fallback to a default model —
  and `validateRegistry` reports every violation in one throw instead of one per run.
  Resolution is build-time because no host resolves a per-agent model from an env var;
  switching profiles means regenerating. One consequence is documented rather than worked
  around: `CLAUDE_CODE_SUBAGENT_MODEL` set to a real model silently defeats every registry
  pin on Claude, because it overrides frontmatter. `FEATURES.md` loses its four 17-row
  per-host tables and all four rationale columns in favour of one role→tier table, guarded
  by a doc-drift test; `bun run verify:model-ids` probes the installed harness CLIs for
  unresolvable IDs and skips an absent CLI with a named reason instead of passing vacuously.

  **Merge note:** `main` gained the `judge` and `meta-judge` charters (2 more specialists,
  17 total) from a concurrently-merged PR while this branch was in review. Both still
  declared `metadata.model_hint` under the retired convention; merging this branch onto
  that state migrates them to `metadata.model_tier: deep` — matching their original
  Claude/Codex pins (`opus` / `gpt-5.6-sol`, both this registry's `deep` tier) — and their
  Cursor/OpenCode output now goes through the same emitter fixes as the other 15 (Cursor
  `inherit` instead of the raw charter hint; OpenCode drops `name`/`metadata`).

  That normalization **moves two more shipped model pins**, which is a behaviour change and not
  bookkeeping: on OpenCode `judge` goes `opencode-go/deepseek-v4-pro` → `opencode-go/minimax-m3`
  and `meta-judge` goes `opencode-go/kimi-k3` → `opencode-go/minimax-m3`. Both had the same
  cross-host drift this release removes — `judge` shipped deep on Claude and Codex but light on
  OpenCode. Note the side effect: `judge-with-debate` wants per-slot model *diversity*, and one
  tier resolves to one model per host, so the two charter defaults now coincide on OpenCode.
  That affects the **fallback** only — the workflow requests per-slot models at dispatch time
  where the host supports it, and names the degraded case `DIVERSITY DEGRADED` per its own
  contract.

## [1.13.0] - 2026-07-30

### Added

- **`judge-with-debate` workflow + `meta-judge` and `judge` sub-agents (17 specialists).** A new
  standalone workflow evaluates a user-supplied artifact through multi-agent debate: a meta-judge
  authors a tailored evaluation specification once (two-stage syntactic/semantic validation with a
  single named retry), three independent judges score it with quoted evidence, and the panel
  debates disagreements over up to 3 rounds until consensus (overall gap ≤ 0.5, every criterion
  gap ≤ 1.0, explicit accept) or reports an honest no-consensus — never a forced verdict. Judges
  communicate through the filesystem only; the orchestrator computes consensus from structured
  reply blocks and never opens judge report files. Reports persist under the new
  `audits/judge/` family in `audit-report-io.md` (per-judge + consensus contracts, fidelity
  checklists). Per-slot model diversity (meta `kimi-k3`, J1 `deepseek-v4-pro`, J2 `minimax-m3`,
  J3 `GLM-5.2`) is requested per dispatch; hosts without dispatch-time model selection run charter
  defaults and the verdict is marked `DIVERSITY DEGRADED`, with a per-invocation capability probe
  so diversity activates automatically when a host gains the capability. Both charters are
  registered across all four plugin bundles (Claude `opus`, Codex `gpt-5.6-sol`, Cursor charter
  hint, OpenCode `opencode-go/kimi-k3` + `opencode-go/deepseek-v4-pro`), enforced by a new
  workflow prose-contract test and the existing integrity/parity/validate-repository gates.

## [1.12.1] - 2026-07-30

### Security

- **CodeQL code-scanning close-out (SEC-1..SEC-6).** All GitHub workflows now declare
  least-privilege `GITHUB_TOKEN` permissions (`contents: read` baseline; publish jobs keep
  their elevated per-job grants). Synapse session IDs are generated by a single shared
  `newSynapseSessionId()` helper backed by `crypto.randomUUID()` instead of the duplicated,
  guessable `Math.random()` template. The code chunker's inline block-comment stripping is
  a linear single-pass scan, removing a quadratic-regex indexing stall on minified or
  adversarial single-line files. `sanitizeFilePath` removes `../` traversal tokens to a
  fixpoint so overlapping tokens like `....//` can no longer smuggle a live traversal
  segment through a single pass. The unused `isValidEmail` export (quadratic regex, no
  production callers) was deleted. Compaction snapshot retrieval calls now interpolate
  values via `JSON.stringify`, closing a backslash-quote escape gap.

## [1.12.0] - 2026-07-29

### Added

- **Plugin bundles now auto-detect hosts and upgrade only on version change.** The
  harness plugin phase (the root `install.sh` `k)` harness menu,
  `scripts/setup-local-first.sh`, `scripts/install-harness.sh --plugins`) detects each agent host — its config dir
  exists or its binary is on `PATH` — and installs only detected hosts; absent hosts
  produce one skip log line and no filesystem writes. Every successful plugin install
  records the bundle version and an ISO-8601 timestamp in
  `~/.config/massa-ai/install-state.json` (a v2-compatible extension that
  `install-skills.sh` round-trips but never writes): re-runs at the same version are
  no-ops, older recorded versions upgrade automatically, newer ones are never
  downgraded, and a host whose installer fails records nothing and never aborts the
  remaining hosts. `--dry-run` reports the per-host decision (install / upgrade /
  skip-current / skip-absent) without writing anything, and `--uninstall` removes the
  version record while keeping its existing semantics (whole-record delete only for
  plugin-owned platforms). Direct `apps/<host>-plugin/install.sh --user` installs
  behave exactly as before, plus the same version recording.

## [1.11.0] - 2026-07-29

### Changed

- **The search subsystem's first capability module is extracted, and the split is now measured rather than asserted.**
  `rlm-fusion.ts` becomes `result-fusion.ts`: `fuseResults` and `generateScoreExplanation` take no
  dependency record at all. The only facade member either ever read was `RRF_K`, the literal `60`,
  now a module constant — so the module has never heard of `ContextualSearchRLM`, which is the
  property `scripts/search-hub-metric.ts` measures. Foreign modules reading the facade drop from
  **6 to 5**. Deepest foreign reach stays at **14** and the gate still fails, both expected: the
  maximum is set by `rlm-search.ts` and cannot move until that file is split. Three of the four
  frozen needle anchors live in this file and travelled byte-identical — resolution is by content,
  so moving an anchor is safe and reflowing one is a hard gate failure.

- **Before-baselines are frozen to committed fixtures instead of measured against the working tree.**
  The previous sensors recorded their before-state as unit tests that scan the live directory, which
  holds only until the refactor those baselines exist to police begins — one extraction reddened five
  of them, and at the target state the scanned set is empty by design. Updating the pins per task
  would have turned a before-record into an after-record tracking whatever the change produced,
  leaving the final comparison with no referent. `scripts/capture-facade-baseline.ts` writes the
  matrix, fan-in/fan-out and anchor records once and refuses to run when the measured subject has
  moved; the suites assert that attestation, so a silent re-capture fails loudly instead of
  relocating the reference. Scoped to the nine figures that actually change — assertions about
  untouched directories, and those written as floors rather than pins, still measure the live tree.

- **The frozen-anchor check now pins anchor text, not anchor paths.** It asserted that four needles
  resolved to two named files, which is the opposite of the constraint it enforces: anchors are
  resolved by content, so moving one between files is explicitly legal and only reformatting is
  not. The path pin therefore failed on the permitted operation and caught nothing the uniqueness
  check above it did not already catch.

## [1.10.0] - 2026-07-29

### Changed

- **The shipped skills now carry their implementation obligations in the references every workflow already loads, instead of re-stating them per workflow.** Six updates (SWU-01..06) consolidate onto the two load-line references, so the rules cannot drift out of sync with the workflows that inherit them. `references/code-annotation.md` §3 now excludes data/domain models — ORM and persistence entities, schema-mapped classes, repository entities, and behaviorless value objects — from unit testing, because their behavior lives at the repository/service seam, not in the fields; the exclusion is named by kind and language so it cannot be read as "skip tests on anything called a model" and does not weaken test-every-changed-path for code that has behavior. `references/implementation-delivery.md` makes worktree isolation mandatory for every implementation task with no size exemption. The commit, spec-driven, and ticket workflows were tightened so a Jira Phase/Wave maps to one Task with per-Task sub-tasks, branch names follow the Phase/Wave, and each Task is one `[KEY]`-prefixed commit, with the three prefix sites (branch, commit, PR) cross-linked rather than duplicated.

- **spec-driven now enforces the target repository's own rules and requires dependency injection per task and per phase.** A new `references/repo-rules-discovery.md` defines how the workflow discovers and loads a target repo's AI-harness rule files (`.claude/`, `.cursor/`, `.cursorrules`, and the repo's module/unit-test/testing-area conventions) before implementation, enforces conformance, and records `repo-rules: none present` rather than fabricating rules when none exist. Independently (DI-01), `references/spec-driven/tasks.md` and `references/spec-driven/execute.md` now require dependency injection at both the per-task and per-phase granularity. Both are inherited through the existing load lines; no workflow body was duplicated, and the four host skill bundles (claude, codex, cursor, opencode) were regenerated from the single source.

## [1.9.2] - 2026-07-29

### Fixed

- **A structural refactor of the search subsystem is now measurable, not asserted.** `contextual-search-rlm.ts`
  was split once before, in M14, and the split moved code without moving responsibility: the host
  file went from 1668 to 463 lines while every extracted delegate took the class straight back as
  its first parameter. Lines-per-file — the only metric anyone watched — reported that as a
  success. `scripts/search-hub-metric.ts` measures what it missed. For every `class`, `interface`
  and `type` declared in a directory it counts `maxForeignReach`: the most distinct members any
  single *other* module reads off a binding of that type. Run across M14, the numbers invert the
  verdict — deepest foreign reach went **1 → 14** while the member count stayed flat (**26 → 24**).
  M14 did not widen the type; it multiplied who reaches into it.

  The script takes no type name, deliberately. An earlier version audited one hardcoded name and
  was evaded two ways: renaming the class produced a vacuous `0/0` pass, and moving the same state
  onto a differently-named aggregate record made the identical hub invisible. Enumerating every
  declaration closes both, and each has a regression test. One evasion is documented as surviving —
  passing collaborators as N individual parameters drives reach to 0 with coupling unchanged — so
  the gate is stated as necessary, not sufficient.

  It ships with 13 unit tests, one per defect found while building it. That is not ceremony: the
  measurement method was wrong **four** separate times, and two of the defects pushed in opposite
  directions, so the reported figure was stable across runs and commits and still incorrect. The
  worst of them stripped string literals, which pairs quotes across unrelated apostrophes and
  deleted real code — under-reporting by 42% on one commit and 0% on the others, which is exactly
  the shape that survives cross-commit comparison. Stability is evidence of determinism, not of
  correctness.

- **Four more sensors, so the refactor's before/after can be taken at all.**
  `scripts/search-facade-matrix.ts` rebuilds the facade's member→consumer matrix from source;
  `scripts/search-facade-metrics.ts` measures fan-in and fan-out over `git ls-files`;
  `scripts/check-frozen-anchors.ts` verifies every needle anchor still resolves to exactly one
  location, in under a second, instead of only at the Ollama-backed retrieval gate; and
  `scripts/check-characterization.ts` pins the three behaviors that have exactly one real test
  each, by assertion count rather than by the presence of a `describe` name a hollowed block
  keeps.

  `benchmarks/needles/run.ts` now records each needle's rank and its resolved target into the
  report. Both were computed and then dropped on write, which made a report uncomparable across
  exactly the kind of change it exists to measure: recomputing an old report's rank against a
  renamed tree resolves the anchor to its new home, matches nothing in the old hit list, and
  reads as a miss on every needle — a total collapse manufactured by the measurement rather than
  observed by it.

  The recurring lesson, hit three times while building these: a reading can be an artifact of the
  state it was taken in. One suite was green at 17 pass / 0 fail while its own files were
  untracked, and it enumerates `git ls-files` — so it was blind to itself, and tracking it moved
  the number it reported.

## [1.9.1] - 2026-07-29

### Fixed

- **Indexing no longer aborts when one file declares the same name twice with different
  kinds.** `let total` in one block and `const total` in another — or `class X` alongside
  `interface X`, which is ordinary TypeScript declaration merging — made the whole index
  fail with `fqn_identity_collision`, discarding every file in the run. Measured on this
  repository: the abort came after all 1219 files had been discovered and parsed, roughly
  four seconds in, so the visible symptom was a project that simply never became
  searchable. The uniqueness check that decides whether a symbol gets the simple
  `file#name` identity or a disambiguated one was counting names per `(file, name, kind)`
  while the identity it protects is keyed on `(file, name)` alone; two declarations
  differing only in kind therefore each believed themselves unique and both claimed the
  same identity. Same-name/same-kind declarations were already disambiguated correctly and
  are unaffected. Symbols that do not share a name keep the identity they had.

- **An allow-list with exactly one file extension no longer matches nothing.** The three
  file scanners built a single combined glob, `**/*{.ts,.js,…}`. A brace expansion with one
  alternative is not an alternation — it is matched literally — so a one-extension allow-list
  found zero files and indexing reported success over an empty corpus. Measured: a bounded
  index completed in 181 ms over 0 files. This was unreachable while the extension list was
  always the 33 built-in defaults, and became reachable with the `security.allowedExtensions`
  fix below; a single-language project is exactly the case where someone sets one extension.

- **`capturePolicy` in `config.json` now actually reaches indexing.** The block was parsed,
  bounds-checked and `denyUnknownFields`-validated at config load, and then never consulted:
  `applyCapturePolicy` had no caller anywhere in the product, so a configured policy narrowed
  nothing. Discovery now applies it after the `.gitignore` merge, which is the composition
  `ignore-patterns.ts` has documented since the policy was introduced. With no policy
  configured the built-in `DEFAULT_POLICY` applies and its `Drop` set mirrors the default
  ignores, so a default install discovers exactly the same files as before. `Keep` cannot
  resurrect a path `.gitignore` excludes — the two layers compose with AND, and the ignore
  layer runs first. Only `Drop` excludes; `MetadataOnly` files are still discovered.

- **`security.allowedExtensions` in `config.json` now actually narrows what gets indexed.**
  Setting the key had no effect whatsoever: the assembled config hardcoded the built-in
  default list and never read the value, and the user-facing config type did not declare
  the field at all — so the value was parsed, then discarded. The indexer, the search index
  scanner and the MCP upload collector all read the assembled value, so every consumer saw
  the defaults no matter what the file said. Omitting the key still yields the same 33
  default extensions, so installs that never set it are unaffected. An **empty array is now
  rejected at config load** rather than honoured: it would match no files, and indexing
  would report success over an empty corpus. Entries must be dot-prefixed (`.ts`, not `ts`).

- **`search_memories` honours `includePersistent`.** The option has been advertised in the
  published MCP tool schema — and forwarded from the tool to the controller — while
  nothing ever read it, so a caller passing `false` silently received persistent memories
  anyway. It now excludes L0 (`MemoryLevel.PERSISTENT`) memories: the level assigned to
  orchestrator decisions and criticals, and the one the bootstrap seed writes. The
  published schema is unchanged; this makes the existing advertisement true rather than
  altering it. **Callers passing `includePersistent: false` today will see a smaller
  result set.** The default remains `true`, so callers that omit it are unaffected.

## [1.9.0] - 2026-07-28

### Changed

- **BREAKING — the ten `RLM_LLM_*` environment variables are renamed to `MASSA_AI_LLM_*`.
  The old names no longer do anything.** There is no dual-read and no deprecation window:
  an unrenamed variable is silently ignored, and the setting falls back to its default —
  which for `RLM_LLM_ENABLED` means every LLM-driven feature degrades to its rule-based
  path. `RLM_` was the last surviving prefix from the pre-rename project identity, kept as
  a compatibility boundary by two earlier renames; that boundary is now retired
  (`AD-010`). Update any `.env`, shell profile, CI secret, compose file, or systemd unit:

  | Retired | Replacement |
  |---|---|
  | `RLM_LLM_ENABLED` | `MASSA_AI_LLM_ENABLED` |
  | `RLM_LLM_BASE_URL` | `MASSA_AI_LLM_BASE_URL` |
  | `RLM_LLM_API_KEY` | `MASSA_AI_LLM_API_KEY` |
  | `RLM_LLM_MODEL` | `MASSA_AI_LLM_MODEL` |
  | `RLM_LLM_CODE_MODEL` | `MASSA_AI_LLM_CODE_MODEL` |
  | `RLM_LLM_TEMPERATURE` | `MASSA_AI_LLM_TEMPERATURE` |
  | `RLM_LLM_MAX_OUTPUT_TOKENS` | `MASSA_AI_LLM_MAX_OUTPUT_TOKENS` |
  | `RLM_LLM_TIMEOUT_MS` | `MASSA_AI_LLM_TIMEOUT_MS` |
  | `RLM_LLM_DISABLE_THINK` | `MASSA_AI_LLM_DISABLE_THINK` |
  | `RLM_LLM_PROMPT` | `MASSA_AI_LLM_PROMPT` |

  **`config.json` is unaffected** — its keys were already prefix-free, so there is no
  config migration and no file to edit. Only environment variables change.

  The rename also fixed a bug it would otherwise have carried under a new name: only four
  of the ten were listed in `turbo.json`'s `passThroughEnv`, so the other six arrived
  `undefined` in any test run under `bun run test` while working fine when `bun test` was
  invoked directly. All ten are listed now.

- **Coverage is no longer computed on every `bun test`.** `bunfig.toml` set
  `coverage = true`, so every invocation — including a single-file run in a debug loop —
  paid to instrument and report coverage, and nothing ever failed on the result: the cost
  of a gate without the gate. Coverage is now opt-in (`--coverage`) and enforced by the
  new explicit gate below.

- **The three divergent copies of `run-tests-isolated.ts` are one shared module.**
  `packages/core`, `apps/tools-api` and `apps/mcp-client` each carried their own copy
  (236 / 124 / 141 lines) which had drifted apart; they now share
  `scripts/lib/run-tests-isolated.ts` and supply only their own isolation predicate.
  Observable behaviour is deliberately unchanged, including each package's distinct log
  wording and its exit code for unknown arguments.

### Added

- **`bun run lint` is a real gate.** It was declared in `turbo.json` but implemented by no
  package, so it printed "No tasks were executed" and passed unconditionally. It now runs
  oxlint (pinned exactly to `1.76.0`) with the `correctness` category on and every other
  category off. Adoption surfaced 337 violations; all 337 were fixed rather than
  downgraded, so every correctness rule ships at `error` rather than `warn`. It runs over
  the whole repository rather than per package, because turbo dispatches only to workspace
  packages and `scripts/` and `benchmarks/` — which held 21 of the 337 — are neither. CI
  runs it in the `build` job. **No formatter was added and nothing was reformatted.**

- **`bun run test:coverage` enforces a coverage floor.** 90% line coverage per file, with
  nine documented exclusions, each carrying the justification that earned it. Both the
  floor and the exclusions live in `scripts/check-coverage.ts` as executable data rather
  than as prose in a scratch file that gets rewritten. The gate refuses to run unless the
  dedicated test database is configured, because 50 core suites are gated behind
  `describe.skipIf(!DEDICATED_DB)` and would otherwise report near-zero coverage for
  subjects whose own tests are sitting skipped beside them. It also runs the suites against
  a scratch `XDG_CONFIG_HOME`, so the numbers are a property of the tree rather than of
  whatever is in the developer's `~/.config/massa-ai/config.json`.

### Fixed

- **Unit tests no longer make live LLM calls against the developer's own configuration.**
  `CodeCompressor` resolves `llm.enabled` from `~/.config/massa-ai/config.json`, so on a
  machine with a local Ollama configured, tests that construct it without pinning the
  test seam issued real network requests — measured at 42 s on a cold model load against
  a 5 s per-test budget, and 0.7 s once warm. That is why they looked flaky rather than
  broken, and why CI, which has no configuration file, never saw it. The affected tests
  now inject the seam their subject already exposes.

## [1.8.0] - 2026-07-28

### Security

- **The Tools API no longer serves anonymous requests.** `authMiddleware` contained
  `if (!apiKey) return;` — and no key was configured on any documented install path, so
  every route was open, including the three `POST /api/v1/executor/*` routes that run
  commands. The bypass is deleted. **A key is now required on every non-public route**;
  `/health`, `/swagger`, `/swagger/json`, `/ui` and `/ui/` stay public (the Docker
  healthcheck depends on `/health`, and `/ui` serves only a static shell whose every data
  call is still authenticated).
- **A key is auto-provisioned on first start, so existing installs keep working.** The
  precedence chain is the documented one: `MASSA_AI_API_KEY` env > `security.apiKey` in
  `~/.config/massa-ai/config.json` > a freshly generated 32-byte hex key persisted there.
  The path is logged once at startup; **the value never is**. The API refuses to start only
  when no key exists *and* the config file cannot be written. Concurrent cold starts elect
  a single writer through an atomic exclusive-create lock, so every process agrees on the
  key that is actually on disk — re-reading after a write was implemented first and proven
  insufficient, since any read-then-return is invalidated by a later writer.
- **CORS is an explicit allowlist instead of a wildcard.** `.use(cors())` accepted every
  origin. Origins now come from `MASSA_AI_API_CORS_ORIGINS` / `security.corsOrigins`;
  unset means `{ origin: false, credentials: false }`, and `*` combined with credentials is
  rejected at startup rather than served.
- **The Web UI authenticates itself without a new login surface.** `/ui` receives the key
  in a `<meta name="massa-ai-api-key">` tag only when the request's remote address is
  loopback; other callers get the shell plus a configure-access state. Loopback has three
  spellings on this stack (`127.0.0.0/8`, `::1`, `::ffff:127.0.0.1`) and all three are
  accepted. **Known limitation:** a reverse proxy terminating on loopback appears local.
  See `docs/web-ui-access.md`.
- **Every documented install path now provisions a key**, including the lifecycle hook
  binary, which reads `config.json` directly rather than importing `@massa-ai/shared` (it
  is fire-and-forget and silent-degrading, so a 401 would have stopped observation capture
  with no visible symptom). Two further defects surfaced here: `setup-local-first.sh`
  regenerated `config.json` wholesale and so silently *rotated* the credential on every
  re-run, and the compose `mcp` service had neither a volume nor a key, so on a default
  `docker compose up` it could not learn the key the `api` service provisioned. Both images
  now set `XDG_CONFIG_HOME=/data` so `config.json` lands inside the mounted volume.
- **The inert admin-preservation middleware is removed.** It gated six endpoints on a user
  count that was always zero, so it never denied anything. Those endpoints are protected by
  the mandatory key like every other route, and a parameterised test asserts 401 for each.

### Changed

- **BREAKING — embedding failures now throw instead of returning random vectors.** With no
  reachable provider, `EmbeddingService` returned `Math.random()` vectors under a
  `NODE_ENV` check, and `getDimensions()` fell back to 384. Those vectors were stored and
  searched as if they were real, so retrieval silently returned nonsense. Both branches now
  throw; `store_memory` and `update_memory` return `{ success: false }`, and HyDE degrades
  through the existing `QUERY_UNDERSTANDING_UNAVAILABLE` signal.

  **Action required if you ever ran without a reachable embedding provider.** A 384-d
  random vector is indistinguishable from a real embedding after the fact, so there is no
  detector and no repair: **re-index affected projects** (`reindex` with `force: true`) to
  overwrite them. Memories stored during such a window cannot be recovered by re-indexing
  and need to be re-created.
- **Executor responses report the sandbox mode that was actually used.**
  `MASSA_AI_EXECUTOR_SANDBOX=auto` silently degrades to `none` when no sandbox tool is
  present, and nothing in the response said so. Every `execute`, `execute_file` and
  `batch_execute` result now carries `sandboxMode`, and one warning per process names the
  missing tool when `auto` resolves to `none`. An explicit `none` warns nothing. The `auto`
  default and its best-effort fallback are unchanged (AD-007).

### Fixed

- **Graph-neighbor search results are scoped to the searched project.** `memory_edges` has
  no `project_id`, so BFS walks edges globally; the graph stream checked only `deleted_at`
  before pushing a neighbor's content into the result set, letting a single cross-project
  edge surface another project's memory. The read seam now filters by project, using the
  caller's id unresolved and skipping when it is absent — the exact scope semantics of
  every other read seam the search fuses.
- **A stale-generation retry no longer leaks its managed-run heartbeat.** The retry
  returned from inside the `try`, reaching none of the three teardown sites, so each
  abandoned attempt left a loop renewing a lease its run no longer owned for the life of
  the process. Exhausting all three retries leaked three loops.
- **Namespace-imported callees resolve against their own module first.** The resolver's
  documented order was inverted, so `import * as Utils from './utils'; Utils.parse(x)`
  bound to whichever *other* file in the project happened to export a top-level `parse`.
- **Centrality is loaded under the canonical project id.** Indexing with a retired project
  alias queried centrality for a project that owns no symbols, so every chunk was written
  with `centralityScore: 0` — silently, because 0 is also the legitimate "not computed yet"
  value. Both load sites are fixed, including the incremental reindex path that
  auto-reindex actually takes.
- **An observation written under a retired alias is findable by its canonical id in the
  same tick.** The synchronous mirror was keyed on the caller's id until the asynchronous
  persist resolved the alias a tick later, so a reader holding the post-rename id missed a
  write that had already returned. A bounded residual remains for an alias this process has
  never resolved — nothing can consult the database synchronously — and it is documented at
  the call site and pinned by a test rather than left implicit.
- **Plugin bundles never appeared in any host's plugins screen.** The installers wrote
  MCP entries, hooks, skills and agent files, but no host *plugin registry* — the thing
  `/plugin` (Claude Code), `/plugins` (Codex) and Cursor's plugin list actually read. All
  four hosts reported `✓ installed` while showing nothing. `apps/claude-plugin/install.sh`
  and `apps/codex-plugin/install.sh` now delegate registration to `claude plugin
  marketplace add` + `claude plugin install` and `codex plugin marketplace add` + `codex
  plugin add` respectively, guarded by a capability probe so a missing or older CLI falls
  back to the previous file-only behaviour and prints the manual command instead of
  failing.
- **Cursor plugin installed to a path Cursor does not scan.** The bundle went to
  `~/.cursor/plugins/massa-ai/`; Cursor discovers local plugins under
  `~/.cursor/plugins/local/<name>/`. Installing now targets the correct directory and
  removes a pre-fix copy so the two cannot both be discovered and double-register hooks.
  This path is derived from Cursor's plugin documentation and is **not verified against a
  running Cursor.app** — unlike the Claude and Codex routes, which were verified
  end-to-end. Please report if Cursor still does not list the plugin.
- **Codex plugin registration escaped a sandboxed install via `CODEX_HOME`.** The Codex
  app exports `CODEX_HOME` into every shell it spawns, and the `codex` CLI prefers it over
  `$HOME`. `apps/codex-plugin/install.sh` resolves its own paths from `$HOME` alone, so an
  install run against an overridden `$HOME` (tests, `--target`) wrote files into the
  sandbox while registering the marketplace into the real `~/.codex` — and an
  `--uninstall` in a test suite silently removed a live `[marketplaces.massa-ai]` table.
  The CLI is now pinned to the same root the installer writes. Note the pre-existing
  divergence left in place: the file-copy half still ignores `CODEX_HOME` entirely.
- **Claude file-route artifacts survived an upgrade.** A user who had installed via the
  old file route kept their loose `~/.claude/commands/massa-ai-*.md`, subagent files and
  merged `settings.json` hooks after upgrading, while the newly-registered plugin supplied
  the same three — double-firing every lifecycle event. The installer now removes those
  artifacts when it takes the plugin route.

### Added

- **`--plugin-source local|copy|auto`** on `scripts/install-harness.sh`, mirroring
  `--mcp-source`. A host plugin registry stores the marketplace *root path*, so
  registering a live checkout makes the install die when that checkout moves — measured:
  Claude reports `failed to load: cache-miss`, and `codex plugin list` then errors for
  **every** configured marketplace, not just massa-ai. `copy` materialises a stable
  marketplace root under `~/.config/massa-ai/marketplace`; `auto` picks `local` in a
  checkout and `copy` otherwise (npx / published installs). The OpenCode plugin symlink
  honours the same root.
- Root `.cursor-plugin/marketplace.json`, the Cursor counterpart to the existing
  `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`.
- `MASSA_AI_SKIP_PLUGIN_REGISTRY=1` opt-out, which also pins the file-route test suites so
  their outcome no longer depends on whether the machine running them has the host CLI
  installed.
- `scripts/tests/test-plugin-registry-registration.sh` (45 assertions). The CLI-dependent
  scenarios **skip** rather than fail when `claude`/`codex` are absent, which is the case
  on every CI runner — that surface is covered by the capability probe and by manual
  verification, not by CI.

## [1.7.1] - 2026-07-27

### Fixed

- **Web UI Checkpoints view was permanently empty.** `POST /api/v1/checkpoints/list`
  defaults to `format: "toon"`, whose `data` is a formatted *string* while `success` stays
  `true`, so no error path fires. The view omitted `format`, and `extractCheckpointRows`
  collapsed the unreadable payload to `[]` — rendering "No checkpoints" against a database
  holding 458 of them. The request now sends `format: "json"` via the exported
  `CHECKPOINTS_LIST_BODY`, and a non-array payload surfaces an error block instead of
  masquerading as an empty state.
- **Checkpoint rows rendered a blank `type` column.** The list route emits `type`
  (`list_checkpoints.ts` maps `type: cp.checkpointType`); the renderer read
  `checkpointType`, which no response has ever carried.
- **Web UI Proposals view could never show data.** `POST /api/v1/proposal/list` returns
  `{ pending, count }`; the renderer read `payload.proposals`. It now reads `pending`, with
  `proposals` kept as a legacy alias. Note that pending proposals are only persisted when
  `AUTO_IMPROVE_REVIEW_GATE=true` — the default auto-approves silently.
- **Renderer tests could not have caught any of the three.** They passed hand-written
  fixtures whose shape no endpoint emits. A golden response captured from the live API
  (`apps/web-ui/src/__tests__/fixtures/checkpoints-list.json`) is now read by both sides:
  `apps/web-ui/src/__tests__/route-contract.test.ts` asserts the renderer consumes it, and
  `apps/tools-api/src/routes/web-ui-contract.test.ts` asserts the route still produces it.
  The fixture is read with `fs` rather than imported, because `apps/tools-api` sets
  `rootDir: ./src` with no `allowJs` and a cross-package module import would break
  `type-check`.

## [1.7.0] - 2026-07-27

### Changed

- **The persona layer and the sub-agent layer now have a stated contract.** Auditing
  `skills/persona-router/SKILL.md` against the 15 charters in `skills/agents/*/SKILL.md`
  found five boundaries that were never written down. None was a runtime bug; each let a
  reader draw a wrong conclusion with no gate to catch it.
  - The **Capability Packet** gains an optional `persona` field, declared identically in
    all three of its definitions (`skills/AGENTS.md`, `references/agent-orchestration.md`,
    `references/subagent-design.md`). It carries the cataloged persona **id only**, never
    the persona prompt, as advisory framing that never overrides an agent's charter
    Restrictions, scope, or permissions. Absent is the valid default — no workflow emits
    it yet.
  - **All 15 charters** gain two adjacent Restrictions lines: a supplied persona shapes
    emphasis only and the charter's Restrictions win on conflict; and the self-routing ban
    now covers `persona-router` and reading a `personas/` prompt file, not just the
    `massa-ai` router. Together they mean an agent may *receive* a persona and may never
    *select* or *expand* one — the second half closes a path by which an agent handed a
    bare id could have opened a persona prompt claiming implementation ownership.
  - **`persona-router` Stop Conditions are scoped.** The clause forbidding subagents and
    subprocess orchestration was written unscoped and could be read as disabling the whole
    16-agent dispatch layer during a persona session. It now bounds the routing step only
    and says workflow-mandated dispatch is unaffected.
  - **A new Persona And Sub-Agents section** states that a persona grants no tool access,
    no write scope, and no permission, never authorizes inline implementation in place of
    a dispatch, and never widens a builder's disjoint write set — and that a persona route
    is not a specialist consultation, naming the four persona↔agent pairs that overlap
    (`senior-mobile-engineer`↔`mobile-specialist`,
    `senior-mobile-qa-automation-engineer`↔`test-engineer`,
    `context-skill-harness-engineer-architect`↔`architecture-specialist`,
    `product-manager`↔`requirements-analyst`).
  - **Nine discriminating tests** land as defect class 7 in
    `scripts/__tests__/skills-harness-integrity.test.ts`. Charter cases enumerate
    `skills/agents/*/` from disk and are scoped to the `## Restrictions` span, so a charter
    added later cannot skip the rules and a line landing in the wrong section still fails.
    Two cases assert *absence* (the superseded charter sentence, the unscoped
    persona-router clause), because presence alone would pass if the old text were
    re-added alongside the new.
  - Charter bodies feed **two** generators — `generate-skill-artifacts.ts` (raw copy into
    `apps/*/skills/agents/`) and `generate-subagent-artifacts.ts`, which embeds the body
    verbatim into `apps/*/agents/massa-ai-*.{md,toml}`. Both mirrors are regenerated and
    both `--check` gates are clean.
- **Workflows now emit the `persona` field the Capability Packet defines.** The prior entry
  defined the field but deferred populating it; all 24 `Dispatch: massa-ai-*` blocks across
  the 16 workflow files carry it now, uniformly — no allowlist. The field stays optional
  (absent is valid), carries the cataloged persona **id only**, never the persona prompt,
  and never overrides the receiving charter's Restrictions.
  - The persona-router boundary's three presence-only assertions for persona-router prose
    (Stop Conditions scoping; grants-no-authority; not-a-specialist-consultation) are now
    section-scoped to the exact heading each rule lives under.
  - **All five presence-only assertions are closed, and the detection method changed to
    close them.** A phrase list (`persona may grant`, `grant authority to the persona`)
    killed the two mutations it was written against and nothing else — `a persona is
    permitted to write` and `personas hold write access` both passed it. Enumeration
    cannot win, since the ways to write "persona has power" are unbounded, and each
    pattern added to chase them raises false-failure risk. The scan now inverts the test:
    every sentence mentioning a persona alongside an authority term must carry a negator.
    Real rules already do ("grants **no** tool access", "**never** overrides"), so correct
    prose passes while an affirmative grant fails however it is phrased. Coverage extends
    beyond `persona-router/SKILL.md` to all three packet definitions — the worst place for
    a contradicting sentence, and previously unguarded.
  - A new discriminating test enumerates every `Dispatch:` block on disk (no hardcoded
    roster) and fails if any one lacks the persona line; the existing packet-definition
    uniqueness test is scoped to definitions only so dispatch-block *uses* of the same
    canonical clause no longer collide with it.

## [1.6.0] - 2026-07-26

### Added

- **All four host plugins now publish to npm and GitHub Packages.**
  `@massa-ai/claude-plugin`, `@massa-ai/codex-plugin`, and `@massa-ai/cursor-plugin` join
  `@massa-ai/opencode-plugin` as real workspace packages, each installable from a registry
  tarball with no repo checkout present. None declares a `test` script, so turbo's `test`
  task never double-runs `apps/*/__tests__` alongside the existing `bun run test:plugins`.
- **`scripts/generate-skill-artifacts.ts` bundles `skills/` into every plugin.** Emits real,
  byte-identical files (never symlinks — `npm pack` silently drops them) for
  `skills/massa-ai/`, `skills/persona-router/`, and every `skills/agents/<name>/SKILL.md`
  charter into `apps/<host>-plugin/skills/` for all four hosts, plus
  `apps/opencode-plugin/lib/opencode-config.cjs` and the codex/cursor
  `hooks/massa-ai-hook` binary. `--check` diffs full directory inventories per managed
  subtree, catching both a changed source file and a stale bundle entry left behind after
  a source deletion.
- **Version-manifest equality gate (discovery-based, not a hardcoded list).**
  `scripts/version-manifest-equality.ts` globs every `package.json` under `packages/*` /
  `apps/*` plus any `apps/*/.<host>-plugin/plugin.json` dotdir manifest and asserts each
  equals the root version — closing the gap that let
  `apps/cursor-plugin/.cursor-plugin/plugin.json` drift to `1.0.0` five minors behind root
  with `version-sync.ts`'s hardcoded `EXTRA_VERSIONED_MANIFESTS` never erroring on the
  omission.

### Changed

- **`install-skills.sh` copies instead of symlinking.** Nothing it installs depends on
  this repo checkout staying at the path it was installed from. Ownership between the
  repo installer and each plugin's own `install.sh` is coordinated the same way MCP
  registration is: a per-host `skillsOwner: "repo" | "plugin"` field in
  `install-state.json` (v2), with an explicit repo `--apply` always taking precedence
  over a prior plugin install.
- **`publish.yml`'s build-output artifact list, GitHub Packages rescope list, and
  `verify-package-contents.ts`'s expected-manifest gate all extended from 5 to 8
  packages** to cover the three new plugins, whose entire publishable surface is static
  source (no `dist/`).

## [1.5.0] - 2026-07-26

### Added

- **Publish-artifact package-contents gate.** `scripts/verify-package-contents.ts` stages a
  scratch copy limited to exactly the paths `publish.yml`'s artifact step declares, packs it,
  and diffs the tarball inventory against a committed manifest. It reproduces the
  no-`actions/checkout` condition the publish jobs actually run under, so a package's `files`
  field can no longer promise content the artifact never uploaded. Wired into CI as a
  blocking step and mutation-verified in both directions.
- **JSONC support for OpenCode config.** `scripts/lib/opencode-config.cjs` (vendored
  byte-identically into `apps/opencode-plugin/lib/`) resolves the config path, parses with a
  state-machine comment stripper that leaves `https://` values intact, and backs up before
  every write.

### Changed

- **OpenCode installers edit the config file you actually have.** Both writers previously
  hardcoded `opencode.json` and parsed it with bare `JSON.parse`, so a `opencode.jsonc` user
  got a second competing file and a commented config aborted the install outright. Resolution
  is now `opencode.jsonc` → `opencode.json` → create `opencode.jsonc`, with a warning when
  both exist because OpenCode merges `.json` over `.jsonc`. A fresh install now creates
  `opencode.jsonc`.

### Removed

- **The `qwen-profile.json` content-hash fixture and its whole maintenance tax.** Editing any
  tracked file — including `README.md` or a workspace `package.json` — used to break two
  tests until the manifest was refreshed, and 35 of its 71 entries were already stale. Gone
  with it: `qwen-fixture.ts`, two test files, `prepare-qwen-e2e-fixture.ts`, the
  `update-qwen-hashes` script, `release-version.ts`'s `repinFixtureHashes`, and the release
  workflow's fixture pathspec. The shared E2E index identity now derives from the resolved
  embedding config plus the commit SHA, so per-profile isolation survives the removal.
- **CHANGELOG authoring rules in `skills/AGENTS.md`.** The rules lived in three files naming
  three different canonical sources. `CONTRIBUTING.md` is now the only copy; `CLAUDE.md`
  links to it and keeps the release mechanics; the harness bootstrap block drops the section
  entirely. A single-source test asserts the heading-to-bump table appears exactly once.

### Fixed

- **Published `@massa-ai/opencode-plugin` tarballs were missing their 15 agent charters.**
  The manifest declared `files: ["dist", "agents/*.md"]`, but the publish jobs have no
  `actions/checkout` and the build artifact uploaded only `dist` and `package.json`, so
  `agents/` was never present to include. Shipped broken since the package was first
  published; caught by the new gate on its first run.

## [1.4.0] - 2026-07-26

### Removed

- **The chat-restart and context-handoff surface is gone.** `restart-save`, `restart-load`,
  and `agent-handoff` were three workflows encoding a manual save/resume protocol that
  duplicated `.specs/` artifact state and the host's own compaction — three router rows and
  two references the agent paid for on every routing decision, to re-derive state that was
  already canonical on disk. Deleted with them: `references/restart-state.md`,
  `references/handoff-package.md`, and the `handoff-writer` specialist, whose only callers
  were those workflows.

  The specialist roster drops **16 → 15**, so each host now installs 15 agents (60
  artifacts, not 64). Registries, the generator, both shell installers, `README.md`,
  `FEATURES.md`, and every guard test moved in the same commit — a partial removal fails
  `skills-harness-integrity`, which rejects any dangling harness path.

  Surviving deliberately: `workflows/long-session.md`, now the sole owner of the Session
  Guide, and the MCP `handoff_begin`/`handoff_accept`/`handoff_cancel`/`handoff_list_pending`
  tools, which are published product surface rather than harness routing. The new contract
  suite asserts their survival as a negative control, so a future blunt sweep for "handoff"
  cannot take them out.

### Added

- **Implementation workflows now deliver, not just commit.**
  `references/implementation-delivery.md` defines the chain that was missing after "one
  atomic commit per task": worktree isolation → push → PR via `gh` → CI watch → bounded
  repair loop → **stop and ask before merging**. Two rules are stated rather than left to
  judgment. Worktree isolation has **no size exemption** — a one-line fix is isolated like a
  twelve-file feature, because "too small to isolate" is exactly the call that strands
  half-finished work on a shared branch; only two skip reasons are legal (not a repository,
  or the user declined). And merge is **never** automatic: green CI is the precondition for
  asking, not the approval, which matters in a repo where merging to `main` auto-cuts a
  release. Missing `gh`, missing remote, or absent CI each downgrade the chain and record
  the skip instead of silently reporting success.

- **A circuit breaker for agents going in circles.**
  `references/root-cause-scripts.md` fires after **two** consecutive failed fix attempts on
  one symptom — two, not three, because the second failure is where writing a probe becomes
  cheaper than another guess. Its value is the forbidden list: reading more source,
  re-reasoning about the code, adding a defensive guard, or rerunning the same command
  uninstrumented are all explicitly not progress. The only legal next action is an
  executable probe emitting **real runtime data**, held to a six-point contract
  (deterministic, prints observed beside expected, exits non-zero while the bug is present,
  probes exactly one hypothesis, never touches production state, and is either deleted or
  promoted to a regression test). An unbuildable probe means `Blocked`, not a return to
  guessing.

- **Doc blocks, rationale comments, and tests are now obligations, not habits.**
  `references/code-annotation.md` maps 12 languages to their native doc syntax and requires
  a block on every *created or updated* public unit — updated included, since a doc
  describing behavior that has since changed is worse than none. Alongside it, a
  three-field rationale comment (`Why:` / `Impacts:` / `Test:`) records why the change
  exists, what feature it serves, and the exact command that exercises it. Test coverage is
  specified per change shape, and the bug-fix rule is the sharp one: a regression test must
  be run against the *unfixed* code first, because a test that has never been red proves
  nothing.

- **Every workflow now reads the project before acting.**
  `references/project-context.md` defines a five-tier intake sweep — agent contract
  (`AGENTS.md`/`CLAUDE.md`, nearest ancestor wins), host config (`.claude/`, `.cursor/`,
  `.github/`), product docs (`README.md`, `CONTRIBUTING.md`, `docs/`), delivery config (CI
  workflows, toolchain pins, `CHANGELOG.md`), and live `.specs/` state — with an explicit
  precedence order for conflicts and a once-per-session dedupe guard. All 35 workflows load
  it; the 16 that mutate the repository additionally load the three references above, and
  the 19 read-only ones provably do not.

- **`scripts/__tests__/workflow-harness-contract.test.ts`** — 46 assertions that make the
  above a gate rather than a convention. The workflow set is walked off disk, so a workflow
  added later is force-enrolled instead of silently exempt; scope is asserted in both
  directions, catching an audit workflow that quietly gains mutation permissions as well as
  an implementation workflow that loses them; and invariants are checked **by value**, so a
  reference shipping the wrong circling threshold or dropping the merge-approval sentence
  fails even though every file still exists.

## [1.3.1] - 2026-07-26

### Fixed

- **v1.3.0 was tagged and released on GitHub but published no packages.** Two independent
  defects, in sequence.

  The merge of #29 never triggered `release.yml` at all. Its commit body *explained* the
  skip-ci marker and quoted it verbatim, and GitHub scans the **entire** commit message for
  that marker, not just the subject — so CI was skipped on the merge commit, and with no
  completed `CI` run there was no `workflow_run` event for `release.yml` to fire on. The
  chain was never wrong; nothing pulled the trigger. Recorded in `CONTRIBUTING.md` and
  `CLAUDE.md`. No test can guard this one: CI is the thing that gets skipped.

  Once dispatched manually, the `release` job succeeded — tag, GitHub Release and the
  deploy-key push all worked — and `publish` then failed on
  `bun install --frozen-lockfile`: `lockfile had changes, but lockfile is frozen`.
  `version:sync` rewrote `version` fields only, but `packages/core` pins
  `@massa-ai/shared` to the **exact** root version rather than `workspace:*` — a contract
  `verifyStaticContract` in `scripts/verify-tree-sitter-grammars.ts` asserts. So the bump
  left that pin at `1.2.1` while `shared` became `1.3.0`, the workspace copy stopped
  satisfying it, and bun resolved `@massa-ai/shared` from the **registry** instead. A
  successful install would have been worse than the failure: `publish.yml`'s resolve step
  only rewrites the literal `"workspace:*"`, so `@massa-ai/core@1.3.0` would have shipped
  declaring a hard dependency on `@massa-ai/shared@1.2.1`, violating ARV-R7. The same drift
  had already broken `bun run test:scripts` on `main`, via that static contract — a gate
  the skipped CI run would otherwise have caught before publish ever started.

  `scripts/version-sync.ts` now realigns every non-`workspace:` `@massa-ai/*` dependency
  spec to the version it is syncing, in the one place both `release.yml` and `publish.yml`
  bump versions. Two guards were added: a `syncVersions` unit test for the realignment, and
  `scripts/__tests__/workspace-dependency-pinning.test.ts`, which fails on any
  cross-package spec that is neither `workspace:*` nor the current root version, and on any
  `bun.lock` entry resolving a `@massa-ai/*` package off-workspace. `bun.lock`'s
  `workspaces[*].version` fields are *not* validated by bun, so their staleness is
  cosmetic and was never the cause.

## [1.3.0] - 2026-07-26

### Added

- **Releases are now automatic.** Merging a PR into `main` with a green CI run derives the
  next version from this file, tags it, publishes a GitHub Release, and pushes the packages
  to npmjs.org **and** GitHub Packages. New `.github/workflows/release.yml` owns the chain;
  `publish.yml` became a reusable workflow (`workflow_call` + `workflow_dispatch`, both
  requiring an explicit `ref`) with no triggers of its own.

  The bump comes from the `[Unreleased]` headings, via the new, unit-tested
  `scripts/release-version.ts`: a non-empty `### Added`/`### Changed`/`### Removed`/
  `### Deprecated` is a **minor** bump, only `### Fixed`/`### Security` is a **patch**, and
  nothing releasable means **no release** — the run ends green with no tag. A heading with
  no bullets is ignored, so a stray empty `### Added` cannot force a minor. Major is never
  auto-incremented.

  The chain is sequenced with `workflow_call` rather than events on purpose: a tag or
  release created with `GITHUB_TOKEN` raises **no event**, so the intuitive
  `push tag → release → publish` wiring is dead at every arrow. That same recursion guard
  is what keeps the bump commit from starting another CI run, and so another release — no
  PAT is needed anywhere.

- **Packages are mirrored to GitHub Packages** under `@luizgmassa/*`. GitHub Packages
  resolves an npm scope to a GitHub *owner*, and `@massa-ai` is not one (the repo is
  `luizgmassa/massa-ai`), so publishing `@massa-ai/core` there fails with
  `403 Permission not_found: owner not found`. An isolated `publish-github-packages` job
  downloads its own copy of the build artifact and rewrites `name`, the `@massa-ai/*`
  dependency **keys**, `repository.url`, and `publishConfig.registry` before publishing —
  the npmjs.org artifact is never touched. The dependency-key rewrite is not cosmetic:
  without it `@luizgmassa/tools-api` would depend on `@massa-ai/core`, which does not exist
  on that registry. It runs `needs: [build, publish-packages, publish-apps]` so it can
  never race the npm jobs and leave the two registries divergent at one version.

### Removed

- **The GitHub Deployment surface.** `environment: DEPLOY` is gone from every job — that
  declaration is what wrote a Deployment record per publish (22 had accumulated). npm
  packages are released, not deployed. The environment carried no protection rules, so no
  approval gate is lost. **`NPM_TOKEN` must be re-created at repository scope**, since it
  lived only inside that environment.
- **The `next` prerelease channel.** The `workflow_run` auto-publish and `env.NPM_TAG` are
  removed; every merge now cuts a real `vX.Y.Z` on `latest`, which made `next` a duplicate
  publish of the same version.
- The `workflow_run.head_sha || github.ref` checkout fallback in `publish.yml`. With `ref`
  optional, a manual dispatch silently published the tip of `main` as `latest`; `ref` is
  now `required: true` on both triggers.

### Fixed

- **The first automated release could not push, because branch protection blocked its own
  release bot.** `release.yml` pushes the version-bump commit straight to `main`, and the
  branch ruleset there requires a pull request plus 5 status checks, so the push was
  rejected with `GH013: Repository rule violations found`. `--atomic` rejected the tag
  along with the commit, so nothing partial landed — no tag, no GitHub Release, npm still
  on 1.2.1, and the `publish` job skipped rather than running against a phantom ref. The
  atomicity design held; only the identity was wrong.

  The ruleset's bypass list is the only way through, and **GitHub Actions cannot be a
  bypass actor on a user-owned repository** — the API rejects it with `must be part of the
  ruleset source or owner organization`, and it is absent from the UI bypass list. The push
  now uses a write-enabled **deploy key** (`RELEASE_SSH_KEY`), which is the narrowest
  identity that *can* be a bypass actor: repo-scoped, git-only, no API access, no expiry.

  One behavioural consequence: unlike `GITHUB_TOKEN`, a deploy-key push **does** raise
  events, so ARV-R12 loop safety no longer comes from GitHub's recursion guard. The
  `[skip ci]` in the release commit subject is now load-bearing, backed by the fact that a
  second run finds an emptied `[Unreleased]` and derives no bump. The workflow comments
  that credited the old guard were corrected rather than left to mislead.

- **A path-filtered required status check deadlocked every PR that did not touch
  `skills/`.** `skills.yml` was filtered to `paths: ['skills/**']`, but its `validate` job
  is a required check in the `main` branch ruleset. A required check that never *runs* never
  *reports*, so the PR sits indefinitely on "Expected — waiting for status to be reported"
  rather than failing — it cannot be merged and there is nothing to re-run. The `paths:`
  filter is removed from the `pull_request` trigger (kept on `push`, where nothing requires
  it); the job is checkout plus frontmatter greps, ~8s, so running it on every PR is free.

  The trap is that this looks fine until the first PR that misses the filter. Audited the
  other four required checks — `build`, `mcp`, and both `Structural native tests` jobs are
  in `ci.yml`, which has no `paths:` filter and no job-level `if:`, so they always report.

- **skills.yml shellcheck issues.** Fixed 7 unquoted variables (SC2086) and 1 redirect
  style issue (SC2129). Behavior is identical; the script now passes `actionlint`.
- **The MCP server wrote 68 bytes to stdout on first run, breaking the stdio JSON-RPC handshake.** `initConfig()` in `packages/shared/src/config/config-loader.ts` announced `Created default config at <path>` on **stdout** via `console.log`. That branch fires only when `~/.config/massa-ai/config.json` does not exist yet — so it never fired on a machine that had already run massa-ai once, and always fired on a genuinely fresh install. Per this repo's own contract, a stdio MCP server's stdout carries nothing but protocol; one stray byte produces `connection closed: initialize response`. Now `console.error`. It deliberately does not use the shared logger: the logger reads config, so importing it here would be circular.

  This is the same bug class as the logger fix in the previous release, which moved every log level to stderr but left this one direct `console.log` behind.

  It had been failing CI on `main` for three consecutive commits (`26433af`, `4fa589b`, `85f1ad3`) and was misread as a flaky test. It was never flaky — it reproduced 3 of 3 times, and the byte count was the tell: `"Created default config at "` (26) + `"/home/runner/.config/massa-ai/config.json"` (41) + newline = exactly the 68 bytes asserted against.

  **The test was the deeper problem.** `mcp-stdout-clean.test.ts` inherited the developer's `HOME`, so the first-run branch it exists to guard never executed locally — it passed on every workstation while failing CI, which boots with a fresh `HOME`. It now spawns the server under a throwaway `HOME`/`XDG_CONFIG_HOME`, making the first-run path the path under test everywhere. Confirmed discriminating by reverting the fix and watching it fail locally, which it previously could not do.

- **massa-ai was invisible to every host's plugin manager, and its OpenCode specialists could not be selected by hand.** Three independent root causes, each confirmed by probing the installed host rather than reading the repo.

  1. **Claude Code: massa-ai was never a plugin.** `apps/claude-plugin/` had no `.claude-plugin/plugin.json` — the only host dir without a manifest — and the repo had no marketplace. `install.sh` copied commands and agents into `~/.claude/` and wired hooks, which works, but leaves the result permanently absent from `/plugin`: `~/.claude/plugins/installed_plugins.json` listed only unrelated plugins while all 13 massa-ai agents, 6 commands and 5 hooks were installed and firing. Added the manifest, `hooks/hooks.json` (addressed via `${CLAUDE_PLUGIN_ROOT}` — Claude Code copies the plugin dir on install, so an absolute repo path would break for everyone else), and `.claude-plugin/marketplace.json` at the repo root. `install.sh` still works unchanged.

     Since the plugin now ships hooks, installing both ways would ingest every lifecycle event twice. `install.sh` now skips its hook merge when `installed_plugins.json` holds a `massa-ai@*` key. The guard fails open — absent registry proceeds (the fresh-install case), malformed registry warns and proceeds — and resolves from `$HOME` rather than the install scope, because Claude Code records plugin installs at user scope even for `--project`. Verified at 5 / 0 / 5 owned entries across the absent, installed and malformed cases.

  2. **Codex: two separate bugs, one per symptom.** massa-ai had no `[marketplaces.*]` and no `[plugins."massa-ai@…"]` entry in `~/.codex/config.toml`, and `install.sh` wrote a flat `~/.codex/plugins/massa-ai/` rather than the `plugins/cache/<marketplace>/<plugin>/<version>/` layout Codex actually scans — so it could not appear in `/plugins`. Its manifest also diverged from all 203 installed Codex manifests: `skills` as an array instead of the string `"./skills/"`, no `interface` block (which is what the plugin UI renders), and a `hooks` key no other manifest has. Fixed the manifest and added `.agents/plugins/marketplace.json`; `codex plugin marketplace add` + `codex plugin add massa-ai@massa-ai` now yields `installed, enabled`.

     Separately, **`/hooks` showed no massa-ai hooks at all**, because the installer wrote flat entries (`{ type, command }`) where Codex requires a matcher-group whose `hooks` is an array. Codex addresses hook state as `"<file>:<event>:<group>:<hook>"`, so a flat entry has no `:<hook>` index, is never enumerated, cannot be trusted, and never fires — `[hooks.state]` held only the two group-0 entries belonging to other tools. `apps/claude-plugin/install.sh` already had the nested shape right; the Codex installer was a divergent copy that lost it. Both `hooks/hooks.json` and the installer now emit the nested form, and an install **migrates** owned flat entries rather than letting the idempotency check mistake them for correct wiring. Verified against a temp `HOME`: fresh install 6 nested / 0 flat, upgrade from flat 6 nested / 0 flat with user entries preserved, re-run still 6.

  3. **OpenCode: the 12 specialists were loaded but unreachable from Tab.** `scripts/generate-subagent-artifacts.ts` emitted `mode: subagent`, and OpenCode's Tab switcher lists `primary` and `all` agents only — `opencode agent list` showed every massa-ai agent as `(subagent)`. Now `mode: all`, which adds manual selection while keeping auto-delegation and `@`-mention.

     Same emitter, second bug: `model` was the charter's human-readable `metadata.model_hint` (`DeepSeek V4 Pro`), but OpenCode resolves only `provider/model-id` and silently falls back to the invoking agent's model otherwise — so none of the model pinning had ever taken effect. Added an `AGENT_MODELS_OPENCODE` table alongside the existing Claude and Codex tables, preserving the charter tier split. Cursor still uses the verbatim hint; it resolves models by alias.

     **User-visible:** OpenCode's Tab switcher gains 16 entries.
- **The agent harness was broken at its two load-bearing seams, and nothing tested either.** Full evidence with base-commit line numbers in `.specs/features/skills-harness-audit/audit-report.md`.

  1. **No workflow dispatch resolved on any host.** All 24 `Dispatch:` blocks across 16 workflow files named a bare role (`investigator`), while every host registers the prefixed name (`massa-ai-investigator`) — the prefix `scripts/generate-subagent-artifacts.ts` has always emitted. `subagent_type: "investigator"` matches nothing, so every delegating workflow — audits, `*-fix`, spec-driven validation — failed at dispatch or silently degraded to in-main-agent work with no record. Blocks now carry the host-resolvable name inline (`> **Dispatch: \`massa-ai-builder\`** (role: \`builder\`) — charter …`), so dispatch never depends on a reference file the router's own dedupe rules say may be skipped. `references/agent-orchestration.md` gained a **Name Resolution** section plus the degradation rule that was missing: if the named agent is unavailable *for any reason* — not registered, plugin not installed, spawning forbidden, unknown `subagent_type` — run the scope locally against the same output contract and report the skipped delegation; never retry under a guessed name. The prior prose covered only platform refusal, leaving "the agent does not exist" undefined.

  2. **`plan-critic`, `furps-analyst` and `handoff-writer` were phantoms.** `references/agent-orchestration.md` mandated "Always attempt a read-only `plan-critic` for both `depth: lite` and `depth: full`" while listing its Charter as "role-based (no charter)". There was no `skills/agents/plan-critic/`, no artifact on any host, and no registry row — so the Plan Challenge gate, which the startup contract runs on *every* plan, dispatched a name that could not exist. Same for the six-way `furps-analyst` fan-out in `furps-refinement`. All three are now real charters, sourced from the contracts that already existed (`agent-orchestration.md`'s Plan-Critic Contract, `references/furps/analyst-role.md`, `references/handoff-package.md`) rather than invented.

  3. **The Plan Challenge Policy shipped in two contradicting copies.** `skills/AGENTS.md`'s bootstrap block routed `feature`/`refactor` to the **lite** gate first, listed `design` under the full gate, and **delegated** lite to a subagent. Root `AGENTS.md` routed the same two workflows to the **full** gate, omitted `design`, and ran lite **inline**. Both were reachable through one instruction, because `[\`AGENTS.md\`](../../AGENTS.md)` resolves to the repo file from a checkout and to the installed host file from `~/.claude/skills/massa-ai/` — so the gate an agent applied depended on its vantage point. The bootstrap block is now the single source; root `AGENTS.md` carries a pointer instead of a policy body, and the four vantage-dependent links (`massa-ai/SKILL.md`, `workflows/the-fool.md`, `references/agent-orchestration.md`, `references/conversation-feedback.md`) name the installed bootstrap block explicitly. The substantive conflict is resolved in favor of the bootstrap block, which is what the router's own Plan Challenge Gate section already implemented.

  4. **`test-engineer` and `documentation-agent` charters claimed `read-only` while shipping `Write`/`Edit`.** The generator hardcoded both into `WRITE_AGENTS` and its comment stated the divergence as intent. Both charters now declare `permission: write`; their bodies already described the scoped write set (test files / doc files, disjoint). A new assertion ties charter permission to Claude `tools` and Codex `sandbox_mode` for all 16 charters.

  5. **Non-deterministic instructions.** The Knowledge Verification Chain in `exploration.md` and `spec-driven.md` said "never skip steps" with Context7 MCP as step 3 and no rule for Context7 being absent; an unavailable step is now recorded as a skipped sensor with its reason, never silently treated as answered. Dropped the "CodeNavi-style local notebooks" residual, which named nothing in this repo. The no-recursive-spawning rule existed only as orchestrator-side prose in `references/spec-driven/sub-agents.md`, so nothing constrained a subagent reading only its own charter — all 16 charters now carry it.

- **Three bugs that only surfaced once the installers actually ran.** The fix above made the plugin installers and MCP writer execute for the first time; all three of these were latent behind that no-op and broke real tools on first contact.

  1. **Codex refused to start: `failed to parse hooks config … unknown field 'SessionStart', expected 'description' or 'hooks'`.** `apps/codex-plugin/install.sh` wrote each hook event as a **top-level** key (`cfg[evt]`), but Codex accepts only `description` and `hooks` at the top level and requires events nested under `hooks` (`cfg.hooks[evt]`) — the shape `apps/cursor-plugin/install.sh` already used. The shipped placeholder `apps/codex-plugin/hooks/hooks.json` had the same flat shape. Both corrected, and an install now **migrates** an already-broken file: a top-level event key holding only `_massaAiOwned` entries is removed and re-written nested, backed up first; a top-level key containing unmarked user entries is left alone with a warning. Verified against the real `codex` 0.145.0 binary with a discriminating control — the old shape reproduces the error verbatim, the new and the migrated shapes parse silently — and a user's own matcher-group entries survive with their `matcher` and `statusMessage` intact. Note `codex doctor` does *not* read `hooks.json`; `codex exec` is what loads it, so `doctor` is useless as a gate here.

  2. **`npx @massa-ai/mcp-client` was not a runnable command, on any host.** `npm error could not determine executable to run` — the published package declares two bins (`massa-ai`, `massa-ai-config`) and neither matches the package name's last segment, so npx cannot infer one. MCP registration had therefore **never** worked through npx; the earlier "wrong file, wrong shape" bug had merely hidden it. Now `npx -y -p @massa-ai/mcp-client massa-ai` in both the JSON and TOML writers, with `-y` so npx never blocks on a prompt an MCP host cannot answer. A test pins the explicit bin name so the bare form cannot regress in.

  3. **The MCP server printed log lines on stdout, corrupting the JSON-RPC handshake.** This was the second, independent cause of Codex's `handshaking with MCP server failed: connection closed: initialize response`, and the source of OpenCode's `injected env (1) from .env` banner on every start. Two contributors: dotenv's banner (now `quiet: true` in `packages/shared/src/env.ts`) and — the larger one — `packages/shared/src/utils/logger.ts`, whose `write()` sent DEBUG/INFO to `console.log`. Every `logger.info()` anywhere in core landed on stdout: a freshly built server emitted 250 bytes of `[INFO] …` before any request. **All log levels now go to stderr**, which is the convention for stdio MCP servers and leaves stdout carrying nothing but protocol. A real `initialize` request now gets a valid JSON-RPC reply. New regression test `apps/mcp-client/src/__tests__/mcp-stdout-clean.test.ts` asserts stdout is byte-empty and logs land on stderr; it was confirmed discriminating by reverting the logger, rebuilding, and watching 2 of its 3 cases fail.

  Because `apps/opencode-plugin/install.sh` symlinks `dist/index.js`, a stale bundle silently keeps bug 3 — `bun run build` is part of the fix, not an afterthought.

### Added

- **Four new sub-agent charters, and the harness now guards its own contracts.** `skills/agents/` goes 12 -> 16: `plan-critic`, `furps-analyst`, `handoff-writer` (previously charter-less roles the workflows already dispatched) and `navigator`, which had shipped to Claude and Cursor only, with no charter, no registry row, and an explicit exemption from the generator's drift check. All four are generated for all four hosts, so each host installs 16 agents (64 artifacts) instead of 12-13. `scripts/generate-subagent-artifacts.ts` gained per-agent tool and OpenCode-bash overrides so `navigator` keeps its index-first surface (`mcp__massa-ai__*`, `Read`, `Grep`, `Glob`, `Bash(pwd)`; OpenCode `bash: { "pwd": "allow", "*": "deny" }`) instead of the default read-only set, and its drift exemption is gone. The Claude and Cursor installers no longer special-case navigator: the `massa-ai-` prefix is the single ownership marker, so an uninstall removes it like any other generated agent while a non-prefixed user agent is left untouched.

- **`scripts/__tests__/skills-harness-integrity.test.ts`** — 14 assertions in 6 groups, one group per defect class above: every `Dispatch:` block resolves to an artifact present in all four host dirs (and none uses a bare name); every role in the orchestration Roles table has a charter at the path it advertises, and no role is documented as charter-less; each agent policy is declared exactly once, inside `skills/AGENTS.md`'s bootstrap block, with no `../../AGENTS.md` pointer left anywhere under `skills/`; every relative `references/` / `workflows/` / `skills/agents/` path mentioned under `skills/` resolves on disk; the router's workflow table and the `workflows/` tree are mutually exhaustive; charter permission matches the shipped artifact and every charter forbids recursive spawning. Proven discriminating by re-injecting a bare dispatch name, a `role-based (no charter)` cell, and a `plan_challenge:` block into root `AGENTS.md` — exactly the three matching assertions fail. `.github/workflows/skills.yml` now validates `skills/agents/*/SKILL.md` too, including `metadata.model_hint` and `metadata.permission`, which it had never read.

### Removed

- **`skills/massa-ai-memory/` and `skills/synapse-usage/`** — ~95% duplication of `references/{mcp-tools,synapse-policy,installation}.md`, and wrong where they diverged. `massa-ai-memory` ranked only **21 of the 52** tools, and put destructive `reset_project` at "Priority 9" inside that preference-ordered list — above `remember`/`recall`, with no confirmation guard — while `references/mcp-tools.md` requires explicit user intent and forbids it as reindex preparation. It also told agents to reach for `Glob/Grep/Read` only "when massa-ai doesn't find what you need", with no index-staleness escape, contradicting the router's freshness gating; claimed `compress` reaches "70-98%" against its own table's 80-95% ceiling; and branched on `ScheduleWakeup`, a Claude-Code-only tool, inside a host-agnostic skill. `synapse-usage` taught the whole lifecycle as unauthenticated `curl` piped through `jq` — which this repo does not have — while the router mandates MCP-first, never used the `synapse_task_begin`/`synapse_task_end` envelope the router requires, and linked two files that do not exist.

  Migrated first, in one commit before the deletion: the compression-strategy table into `references/mcp-tools.md`, which named no strategy at all; and the Synapse pipeline-diagnostics signal table, the `queryClass` gate thresholds, the config knobs (`SYNAPSE_ATTENTION_ENABLED` defaults **false** — the attention re-ranker is off), the 20-entry buffer bound, the 1h TTL, and the anti-patterns into `references/synapse-policy.md`, whose lifecycle also gained the two missing task-envelope steps. `scripts/install-skills.sh` globs the skill set, so it needed no change.

- **`scripts/install-agents.sh --mcp-source <local|npx|auto>`** (also `MASSA_AI_MCP_SOURCE`; the flag wins), forwarded by `scripts/install-harness.sh` and exported so the plugin installers' delegated calls inherit it. `scripts/setup-local-first.sh` passes `local`, the root `install.sh` passes `npx`, and `auto` — the default for a direct invocation — picks `local` when `apps/mcp-client/src/index.ts` exists. Switching sources rewrites the entry in place, so there is never more than one.

  `local` writes `bun run <repo>/apps/mcp-client/src/index.ts` for all four hosts (OpenCode keeps its array-`command` + `type: "local"` form). This exists because the npx path is not viable for a checkout: it runs the published package, and it resolves `@massa-ai/core`, which **compiles native tree-sitter grammars on first run** — 60 s was not enough, and an MCP host times out during the handshake well before that. The published 1.2.1 bundle additionally crashes under `bunx` (`var fs = __require("fs")`).

  Two launcher details worth not rediscovering: `-p` is mandatory because the package's bin is named `massa-ai`, not `mcp-client`; and `bunx` accepts `-p` but has **no** `-y` (its flags are `--bun`, `-p/--package`, `--no-install`, `--verbose`, `--silent`), so the OpenCode form is `bunx -p @massa-ai/mcp-client massa-ai`. The corresponding assertions now compare the whole argv rather than checking positions one index at a time, which is how a stray `-y` had slipped between two passing index checks.

- **The documented install path registered no MCP server for Claude Code and installed no plugin bundles at all.** Four independent defects, each confirmed against a real machine's on-disk state before the fix (`~/.claude/agents/` empty, `~/.claude/commands/` empty, `~/.cursor/plugins/massa-ai/` absent, and `~/.claude.json` holding no `massa-ai` entry) and each now covered by a discriminating test.

  1. **Claude Code MCP registration was written to a file Claude Code does not read, in a shape it would reject.** `scripts/install-agents.sh` mapped `claude-code` to `~/.claude/settings.json`, which holds only MCP *approval* controls (`allowedMcpServers`, `enabledMcpjsonServers`, `disabledMcpServers`) plus `hooks` — server *definitions* live in `~/.claude.json`. Compounding it, `ownedEntry()` generalised OpenCode's entry shape to every JSON host, emitting `"command": ["npx","@massa-ai/mcp-client"]` with `"type": "local"`; Claude Code and Cursor require a **string** `command` plus a separate `args` array, and `"local"` is OpenCode-only vocabulary. So the write landed in an ignored file *and* was malformed. Entry shape is now per-host via a new `agent_entry_style()` helper — claude-code gets `type: "stdio"` + string `command` + `args`, claude-desktop/cursor the same without `type`, opencode unchanged. Codex (TOML) was already correct and is untouched. On apply, a stale `_massaAiOwned` entry left in `settings.json` by the old writer is migrated away (backed up first); a hand-written `massa-ai` entry there, and the `hooks` block, are preserved.

  2. **Nothing ever passed `--plugins`.** `scripts/setup-local-first.sh` step 6 — the only automatic harness call in the entire install flow — ran `--skills --agents`, and in `install.sh` the plugin bundles sat behind interactive menu option `p)`, unreachable in a non-interactive or `NO_START=1` run and deliberately excluded from option `k)`. Step 6 now runs `--all`; `MASSA_AI_INSTALL_PLUGINS=0` opts back out. Menu option `k)` and the harness submenu's "Both" become "skills + MCP + plugin bundles" and call `--all`. Docker mode, whose back-fetch pulls only `scripts/*`, now says plainly that plugin bundles need source mode instead of warning "installer not found".

  3. **OpenCode had no installer, so it was never installed locally.** New `apps/opencode-plugin/install.sh` brings it to parity with the other three (`--user` / `--project` / `--uninstall` / `--quiet` / `--verbose`): it symlinks `~/.config/opencode/plugins/massa-ai/index.js` at the repo's `dist/index.js` (symlink, not copy, so `bun run build` keeps it current), adds `"./plugins/massa-ai/index.js"` to the `plugin` array of `opencode.json` idempotently with a `.massa-ai.bak-<ts>` backup, and symlinks the 12 specialists into `~/.config/opencode/agents/`. It refuses to clobber a regular file at any symlink target, and exits non-zero with a `bun run build` hint when `dist/index.js` is absent. `scripts/install-harness.sh`'s plugin loop now covers all four hosts and the printed npm fallback is gone; npm remains a documented alternative. **Ordering trap fixed at both ends:** the harness runs skills → MCP → plugins, so at MCP time the plugin is not yet registered and `install-agents.sh` writes an OpenCode `mcp` entry, which would duplicate all 14 in-process tools. `opencode_plugin_present()` now recognises the local path and bare-dir registration forms in addition to the npm package name, and the OpenCode installer withdraws the redundant entry by delegating to `install-agents.sh --agent opencode --uninstall` — so `install-agents.sh` remains the single writer and `scripts/tests/test-mcp-single-writer.sh` stays green.

  4. **A full install printed 72 lines and the banner four times.** `scripts/banner.sh` gains the shared verbosity contract — `MASSA_AI_VERBOSE`, `vinfo()`, `vecho()` — and `massa_ai_banner()` self-guards on `MASSA_AI_BANNER_SHOWN`, so nesting the plugin installers under the harness prints the glyph once instead of four times. `--quiet` (default) and `--verbose` are now accepted by `install-harness.sh`, `install-skills.sh`, `install-agents.sh` and all four plugin installers, forwarded from the harness to every child; `--dry-run` and `--check` force verbose, since the detail is the whole point of those modes. Quiet mode prints one line per changed thing plus a summary; per-file symlink chatter, serialized JSON entry diffs, specialist hints, and the output of delegated `install-agents.sh` calls move behind `--verbose`. **Errors and warnings are never gated** — including the notice that a stale plugin-local `.mcp.json` was deleted from the user's home, which reports a mutation rather than progress.

  Also corrected: `apps/claude-plugin/install.sh` told users MCP was registered in `~/.claude/settings.json`, which is exactly the wrong path this change fixes.

  **Tests.** `scripts/tests/test-banner-glyph-divergence.sh` is new and pins the two duplicated banner copies byte-identical — `install.sh` must keep its own inline glyph because it runs before any clone exists. `apps/opencode-plugin/__tests__/install.test.ts` is new (9 tests). The `install-agents`, `install-skills`, `install-harness` and mcp-single-writer suites gained cases for the corrected claude-code path and per-host entry shapes, the legacy-`settings.json` migration, local-form OpenCode plugin detection, four-host plugin fan-out, `MASSA_AI_INSTALL_PLUGINS=0`, and quiet-vs-verbose output.

  **`apps/*-plugin/__tests__/` now runs in CI.** Three of the four plugin dirs are not workspace packages, so turbo's `test` never reached them — 41 assertions across the Claude, Codex and Cursor installers had no gate at all. New root script `test:plugins` covers all four (50 tests) and the CI `build` job runs it after `test:scripts`. It is included in `bun run test` only by way of that new step, not via turbo.

### Changed

- **Installers migrated from TypeScript to bash, MCP gains a single writer, and the harness is wired into both entry points (install-harness-migration).** Three parts, all on `.specs/features/install-harness-migration/`:

  1. **`scripts/install-skills.ts` → `scripts/install-skills.sh`** and **`scripts/install-agents.ts` → `scripts/install-agents.sh`** (1,637 lines of TS removed). They now follow the pattern every other installer in the repo already used — bash orchestration with an inline `node`/`bun` heredoc for JSON/TOML edits, no `jq`, `exit 3` when neither runtime is present. The CLI contract is unchanged: same flags, same exit codes (`install-skills` 0/1/2, `install-agents` 0/1/2/13), same `<!-- massa-ai:bootstrap:* -->` markers, same `_massaAiOwned` ownership marker, same `<config>.massa-ai.bak-<ts>` backups, same v1→v2 `install-state.json` migration. New helper `scripts/lib/installer-shared.sh` holds runner detection, the consent gate, and the backup convention. New `scripts/install-harness.sh` orchestrates skills + MCP + plugin bundles.

  2. **`scripts/install-agents.sh` is now the only writer of host MCP config.** The Claude/Codex/Cursor plugin installers call it (`--agent claude-code` / `codex` / `cursor`) instead of shipping their own MCP file. `apps/codex-plugin/.mcp.json` and `apps/cursor-plugin/mcp.json` are deleted, along with the `mcp` pointer in the Codex plugin manifest. `scripts/tests/test-mcp-single-writer.sh` is the regression guard.

  3. **Skills and MCP registration are reachable from the documented install path.** `install.sh` gains post-install menu option `k` (`c` and `p` are untouched — `root-install-menu.test.ts` pins their strings) and its docker-mode back-fetch now pulls the harness scripts, or the option would be dead in that mode. `scripts/setup-local-first.sh` gains step `[6/6]`, honouring `MASSA_AI_INSTALL_HARNESS=1|0` for non-interactive runs.

  **Behaviour changes worth calling out** (installers are a public compatibility surface): plugin installers now write host MCP config, which they previously did not; `~/.codex/plugins/massa-ai/.mcp.json` and `~/.cursor/plugins/massa-ai/mcp.json` are gone, and a plugin reinstall removes the stale file so upgraders converge; `install-agents.sh --uninstall` now removes **only** entries carrying `_massaAiOwned: true`, so a hand-written `massa-ai` entry survives where the TypeScript version would have deleted it; the OpenCode MCP entry is skipped when `opencode.json` lists `@massa-ai/opencode-plugin` (which registers 14 tools in-process), and still written for everyone else.

  **Corrected documentation.** Three installers told users to "skip MCP — the plugin already registers it", and `apps/claude-plugin/install.sh` contradicted itself within four lines. The plugin-local files those messages referred to were copied into `~/.codex/plugins/` and `~/.cursor/plugins/`, which are not host MCP read paths; a user who followed the advice likely ended up with **no** MCP registration at all. `scripts/setup-local-first.sh` also printed an OpenCode snippet using `mcpServers`/`env`/`npx` where OpenCode reads `mcp`/`environment`/`bunx`.

  **Tests.** The four TypeScript installer suites (1,976 lines) are replaced by 12 plain-bash suites in `scripts/tests/` totalling 296 assertions, run by `bun run test:scripts` — which CI already executes, so the replacement gate is real. Read-only claims (`--check`, `--dry-run`) are proven with a recursive checksum of the fake home taken before and after, not just an exit code. `scripts/__tests__/validate-repository.test.ts` now greps the bootstrap markers out of the bash installer instead of importing them, keeping one source of truth. Coverage percentages move: the bash suites run outside `bunfig.toml`'s instrumentation.

- **Unit-test coverage >90% across monorepo (coverage-90pct)**: raised per-file line coverage to >90% across all packages. `packages/core` 76→124 unit test groups (0 fail); `packages/shared` 27→176 pass; `apps/tools-api` 5→23 groups; `apps/mcp-client` fixed module-state collision via isolation runner (2 fail→0); `apps/opencode-plugin` 35→101; `apps/web-ui` 19→95; claude/codex/cursor plugins 27→59/16/15; `scripts/__tests__` 319→506; `scripts/tests` 10 fail→0 (docs-drift, RSS, manifest fixes). 233/242 core source files ≥90% line (9 documented exclusions: tree-sitter native internals, ONNX, barrel re-export, e2e-gated health, env-boilerplate). Batches A–L partitioned across parallel subagents with disjoint write sets (R10). Spec: `.specs/features/coverage-90pct/`.

### Fixed

- **Web UI at `/ui` returned `{"status":500,"error":"web ui static dir not found"}`**: two independent defects. (1) Both module-relative candidates in `apps/tools-api/src/routes/web-ui.ts` were off by one directory — from `src/routes/` they resolved to `apps/tools-api/web-ui/src/static` and `apps/tools-api/src/web-ui/src/static`, neither of which exists — so resolution silently depended on the cwd walk, and the API 500s whenever it is started from a cwd outside the repo (reproduced: `cd /tmp && bun apps/tools-api/src/index.ts` → 500). Replaced with `buildStaticDirCandidates(moduleDir, cwd)`, which walks up from the module's own directory *and* cwd, checking both `apps/web-ui/src/static` and the sibling `web-ui/src/static` at each level — correct for the src, dist, package-dir, and repo-root layouts alike. (2) The `Dockerfile` never `COPY`d `apps/web-ui` despite a comment claiming "web-ui is served by tools-api", so `/ui` was 500 in the `api` image regardless of path math; added the COPY to the `base` and `api` stages (`mcp` inherits via `COPY --from=base /app`). The existing route tests mock `fs/promises` so every candidate "exists", which is why neither defect was caught; added `web-ui-static-dir.test.ts` (8 tests, real filesystem) including a child-process probe that drives `GET /ui` from a cwd outside the repo. CI's Docker smoke only checked `/health` and `/swagger` — added a `/ui` + `/ui/app.js` assertion so the image regression cannot recur.
- **~646 tests were never executed by any gate**: the `coverage-90pct` work (3acf3ae) added test files that no runner reached. `apps/web-ui` had 4 suites (95 tests) but no `test` script, so turbo skipped the package; `scripts/__tests__` (16 files) and `scripts/tests` (6 TS + 3 shell files) sit outside the `packages/*` / `apps/*` workspace globs, so nothing ran them — including `subagent-parity.test.ts`, the guard for the generated Claude/Codex/Cursor/OpenCode plugin artifacts. Added `test` to `apps/web-ui/package.json`, extended root `test:scripts` to run the TS suites plus every `scripts/tests/*.sh`, and wired `bun run test:scripts` into the CI `build` job. Now green: 95 (web-ui) + 551 (root TS) + 41 (shell) tests.
- **`executor-extra.test.ts` Rust compile test broke CI on `main`**: "compiles and runs a simple Rust program" was killed by the global 5 s `bunfig.toml` timeout — a cold `rustc` compile takes ~6 s on ubuntu runners, and the test hands the executor a 30 s budget of its own. Added the repo's per-test timeout idiom (`}, 60_000)`) to both Rust cases. Not a product bug and not a missing toolchain guard: `describe.skipIf(!HAS_RUST)` already gates correctly and Rust is preinstalled on the runners. Introduced by 3acf3ae, which left `main` red.
- **`test-setup-wizard-db-selection.sh` false negative**: the "migrations fail closed" assertion was a single-line `grep` against `bunx prisma migrate deploy || die`, which `setup-local-first.sh:526` splits over a `\` continuation. The safety property held; the assertion did not. Added a continuation-folding matcher so the check tests behaviour rather than formatting (11/11 pass).
- **root `bench:fixture` script pointed at a nonexistent target**: the repo rename mangled both halves of `"bench:fixture:sicad": "... bench:fixture:sicad"`, leaving `bench:fixture` delegating to `bench:fixture:massa-ai`, which does not exist. Restored the `:sicad` target (Sicad is the external benchmark corpus, not a rename residual).
- **`graph-queries.ts` pinned column cast**: `pinned::integer` replaced with `CASE WHEN pinned THEN 1 ELSE 0 END` for compatibility with non-integer `pinned` columns.
- **`memory-repository-pg.ts` metadata double-encode + pagination determinism**: metadata was double-encoded on write; pagination ordering was non-deterministic. Both fixed with asserting tests.
- **`events.ts` SSE leak**: server-sent events stream leak fixed in tools-api routes.
- **`config-loader.ts` migrateDataDirOnce isolation**: data-dir migration isolation fix in shared config.
- **mcp-client module-state collision**: `buildPrefetchPlan` not found when tests run in one process — fixed by adding an isolation runner (`scripts/run-tests-isolated.ts`).

- **E2E coverage expansion**: live E2E suite widened to the 52-tool roster and post-baseline feature surfaces. `00.harness.smoke.test.ts` `EXPECTED_TOOLS` 47→52 (matches `CANONICAL_ORDER` in `tool-definitions.ts`); `10.synapse.test.ts` adds TE1-TE5 for the `synapse_task_begin`/`synapse_task_end` task-envelope lifecycle; `20.new-features.test.ts` SG1 gap probe replaced with real assertions of `/api/v1/scheduler/status` + `/api/v1/hooks/queue-status`; new `24.dashboard-architecture.test.ts` covers DB1-5 (dashboard routes + graceful degradation), AR1-5 (`get_architecture` MCP+HTTP parity, cycles aspect, teaching error, `_aspects` list), and RN1-5 (`rename_project`/`merge_projects` dryRun preview only). `_helpers.ts` `resolveBackendAttestation` widened to trust the API's self-reported `databases.backend` (destructive suites remain guarded by `assertSafeE2eEnvironment`). `COVERAGE.md` suite map updated. 53 pass / 0 fail / 1 deliberate skip against the live dev stack; type-check 6/6. Spec: `.specs/features/e2e-feature-coverage-expansion/`.

### Fixed

- **`packages/core` `@massa-ai/shared` dependency**: was `workspace:*`, which fails the `verifyStaticContract` gate (requires the declared version to `===` the root version exactly). Set to `1.2.1` (matches root + the local workspace package version, so it still resolves locally with no `bun install` 404 and no lockfile change).

## [1.2.1] - 2026-07-24

### Changed

- **Repository rename part 2 (residual `th0th`/`massa-th0th` cleanup)**: removed all residual identity references missed by the v1.2.0 rename (PR #18). `observation-extractor.ts` `th0th_*` legacy case arms and `th0th_read_file` guard clause removed (canonical un-prefixed arms only; **breaking**: existing DB `hook_observations` rows storing `th0th_*` wire-names no longer match on read — no DB migration performed). `architecture.ts` comment; `ensure-ollama.sh` temp log path (`ollama-th0th.log` → `ollama-massa-ai.log`); `apps/opencode-plugin/src/index.ts` internal helpers (`th0thFetch`/`th0thGet`/`th0thGetWithQuery` → `massaAi*`). `skills/` (~58 files: SKILL.md, AGENTS.md, 12 agent charters, ~46 massa-ai references/workflows/scripts) — `th0th`/`Th0th`/`TH0TH_` concept refs → `massa-ai`/`Massa-ai`/`MASSA_AI_`; `installation.md` upstream corrected from stale `S1LV4/th0th`/`@th0th-ai/*`/`TH0TH_*` to `luizgmassa/massa-ai`/`@massa-ai/*`/`MASSA_AI_*`. 48 plugin agent files regenerated (`Th0th Memory` → `Massa-ai Memory`); drift gate passes. `docs/massa-ai-spec-driven.md`, `docs/massa-ai-tdd.md` concept refs. `.specs/` concept refs in 6 completed-feature docs. `CHANGELOG.md` historical `massa-th0th` entries rewritten to `massa-ai`. `README.md`/`FEATURES.md` non-credit refs updated; Credits `[th0th](S1LV4/th0th)` line preserved as external upstream acknowledgment. `bun.lock` regenerated.

### Fixed

- **Broken plugin hook symlinks**: `apps/cursor-plugin/hooks/massa-ai-hook` and `apps/codex-plugin/hooks/massa-ai-hook` pointed to stale `../../claude-plugin/hooks/massa-th0th-hook.ts` (renamed to `massa-ai-hook.ts` in v1.2.0 but symlink targets not updated) — recreated to point to `massa-ai-hook.ts`.
- **`packages/core` hard version pin**: `@massa-ai/shared` declared as `"1.2.0"` (npm fetch) instead of `"workspace:*"` (local workspace link) — caused `bun install` 404 on fresh install. Converted to `workspace:*` (matches the other inter-package deps).
- **`apps/web-ui` missing `@types/bun` devDep**: web-ui had no `devDependencies` and relied on `@types/bun` being hoisted to root `node_modules` by accident; `bun.lock` regen changed hoisting and type-check failed (`Cannot find module 'bun:test'`). Added `@types/bun: ^1.3.9` devDep.
- **Root missing `toml` devDep**: `scripts/__tests__/subagent-parity.test.ts` imports `toml` to parse Codex `.toml` agent files, but no package declared it as a direct dep (only a transitive dep of `effect`); lockfile regen stopped hoisting it to root. Added `toml: ^4.3.0` to root devDependencies.

## [1.2.0] - 2026-07-23

### Changed

- **Project renamed `massa-th0th` → `massa-ai`**: repository-wide identity rename. Package scope `@massa-th0th/*` → `@massa-ai/*` (core, shared, mcp-client, tools-api, web-ui, opencode-plugin); config type `MassaTh0thConfig` → `MassaAiConfig`; env vars `MASSA_TH0TH_*` → `MASSA_AI_*`; DB user/db/password `massa_th0th` → `massa_ai`; user paths `~/.massa-th0th` → `~/.massa-ai`, `.massa-th0th-data` → `.massa-ai-data`; npm bin `massa-th0th`/`massa-th0th-config`/`massa-th0th-api` → `massa-ai`/`massa-ai-config`/`massa-ai-api`; GitHub URL refs `luizgmassa/massa-th0th` → `luizgmassa/massa-ai`; Docker images `massa/massa-th0th` → `massa/massa-ai`; skills dirs `skills/massa-th0th/` → `skills/massa-ai/`, `skills/massa-th0th-memory/` → `skills/massa-ai-memory/`; 48 subagent files `massa-th0th-*` → `massa-ai-*` across 4 host plugins (13 claude/cursor incl navigator, 12 codex/opencode); 7 docs `docs/massa-th0th-*` → `docs/massa-ai-*`; ref docs `th0th-tools.md` → `mcp-tools.md`, `th0th-installation.md` → `installation.md`. MCP tool wire-prefix `th0th_*` dropped from the observation-extractor canonical map (un-prefixed); legacy `th0th_*` case arms retained as read-side aliases for existing DB hook observations (backward-compatible). E2E fixture ids `e2e-th0th-*` → `e2e-ai-*` (hash suffixes preserved). CI postgres block renamed atomically (user, password, db, DATABASE_URL, `pg_isready -U`). Egyptian-deity prose references neutralized in README/FEATURES. `bun.lock` regenerated. Type-check 6/6, build 5/5, unit suites green. Spec: `.specs/features/repo-rename-massa-ai/`. Follow-up (part 2) removed residual `th0th`/`Th0th` concept references across skills, plugin agents, docs, and `.specs/`, dropped the `th0th_*` observation-extractor aliases, and rewrote prior changelog entries to the `massa-ai` identity.

### Added

- Bootstrap contract merged into `skills/AGENTS.md` (`massa-ai:bootstrap` markers) with 12-agent sub-agent registry; `UAS_` env vars adapted to `MASSA_AI_`
- Unified TypeScript symlink skills installer (`scripts/install-skills.ts`) for all 4 tools (Claude/Codex/Cursor/OpenCode) with `--apply/--uninstall/--dry-run/--check`, state v1→v2 migration, conflict abort, idempotent
- 8 workflow guide docs migrated to `docs/` (spec-driven, tdd, rfc, commit, ticket, maestro, mobile-figma, context-slices)
- Persona-router skill and 5-persona catalog migrated to `skills/persona-router/` + `skills/massa-ai/personas/` (filename-only `prompt_path`)
- 296 tests ported to bun test (185 `validate-repository.test.ts` + 39 `install-skills.test.ts` + 56 `install-agents.test.ts` + 16 `subagent-parity.test.ts`)
- `install:skills` / `uninstall:skills` npm scripts
- AGENTS.md at repo root for agent startup contract routing
- `.tool-versions` and `mise.toml` pinning Bun 1.3.14 + Node 25.9.0
- `CHANGELOG.md` with `[Unreleased]` section and CI merge gate
- ADR closing D5 Cypher subset deferral (`docs/adr/0001-remove-d5-cypher-subset.md`)
- `docs/removed-features.md` documenting intentionally removed features (commit 5547afc)
- OS-level sandbox wrapper for executor (macOS seatbelt + Linux Docker, default `auto`)
- `format: json_schema` constrained decoding for Ollama structured LLM calls
- Web UI write mode (memory edit/delete + proposal approve/reject, gated by `MASSA_AI_WEB_WRITE_MODE=true`)
- Web UI markdown rendering (`marked` + `DOMPurify` with XSS prevention)
- Web UI SSE real-time updates for dashboard + memory list
- Hook deadline breadcrumb-on-fire observability in `massa-ai-hook`
- Native Codex plugin bundle (`apps/codex-plugin/`) with manifest, skills, hooks, MCP, and idempotent installer
- Native Cursor plugin bundle (`apps/cursor-plugin/`) with manifest, skills, hooks, MCP, agents, and idempotent installer
- `pre-tool-use` event added to shared hook binary `EVENT_MAP` for Codex/Cursor parity
- Claude Code `install.sh` hooks auto-write (array-append, idempotent)
- Root `install.sh` plugin menu extended to all four tools (Claude, Codex, Cursor, OpenCode)
- `FEATURES.md` — complete feature reference (23 features, 52-tool roster, config tables, structural indexing detail)
- Deconfliction hints in `install-agents.ts` for Claude, Codex, Cursor, and OpenCode
- 12 subagent specialists (investigator, planner, builder, reviewer, context-curator, verification-agent, requirements-analyst, architecture-specialist, test-engineer, documentation-agent, audit-specialist, mobile-specialist) emitted across all four host plugins (Claude `.md`, Codex `.toml`, Cursor bundled, OpenCode `agents install`), with parity tests (drift, pinning, collision, exact-12) and a `generate-subagent-artifacts.ts` drift gate
- massa-ai workflow skill (router + 38 workflows + 80 references + `lessons.py`) copied into `skills/massa-ai/` (123 files)

### Changed

- 12 agent charters relocated from `skills/<name>/` to `skills/agents/<name>/`; `generate-subagent-artifacts.ts` and `skills/AGENTS.md` registry updated (meta-skills `massa-ai-memory` + `synapse-usage` stay at `skills/` top level)
- 14 audit/fix workflows + spec-driven + exploration rewritten to use 24 named dispatch blocks (9-field capability-packet schema) instead of duplicated inline dispatch prose; old role names mapped (`implementer`→`builder`, `verifier`→`verification-agent`, `domain-mapper`+`coupling-auditor`+`deepening-architect`→`architecture-specialist`)
- README consolidated: removed VSCode section, merged 4 plugin sections into one table, replaced duplicated tables with links to FEATURES.md
- TODO.md updated: multi-language tree-sitter marked COMPLETE, json_schema marked shipped, Codex+Cursor plugin parity added
- Architecture tree tool count corrected 47 → 52

- `local-health-checker.ts` now reads `config.get("embedding").model` instead of hardcoding `nomic-embed-text:latest`
- Executor sandbox defaults to `auto` (uses sandbox if available, falls back to best-effort)

### Removed

- Stale `compression.llm` deprecated alias reference from README.md (code already dropped in `da4c60f`)

### Fixed

- LLM/embedding model defaults now consistent across config, health-checker, and docs
- **OpenCode MCP writer bug (CRIT)**: `install-agents.ts` `OpenCodeWriter` now writes under the `mcp` key (not `mcpServers`) with the OpenCode-specific entry shape (`type: "local"`, `command: ["bunx", ...]`, `environment` not `env`, `enabled: true`) per FEATURES.md — OpenCode host now discovers the massa-ai MCP server; shared `JsonMcpWriter` parameterized via `serversKey()` so claude-code/cursor/claude-desktop remain unchanged
- **Stale `th0th_*`-prefixed tool names removed** from `skills/agents/investigator/SKILL.md` (`th0th_search`→`search`, `th0th_get_references`→`get_references`), `skills/agents/context-curator/SKILL.md` (`th0th_recall`→`recall`, `th0th_search`→`search`), and `skills/persona-router/SKILL.md` (`th0th_recall`→`recall`) — canonical un-prefixed names per FEATURES.md; 8 generated agent files regenerated for parity
- **Broken `ai-context-handoff` repo xref** in `agent-handoff.md` reworded to "host-installed, not repo-local" (the skill lives in `~/.config/opencode/skills/`, not the repo)
- **`synapse-usage/SKILL.md` stale intro** rewritten: now MCP-first (10 Synapse tools) with REST as fallback; endpoint count corrected 6→8
- **`.specs/` path prefix drift** fixed in `agent-handoff.md`, `long-session.md`, `references/spec-driven/artifact-store.md` (canonical paths: `.specs/project/FEATURES.json`, `.specs/project/STATE.md`, `.specs/HANDOFF.md`, `.specs/features/<slug>/`)
- **`_th0th_remember_best_effort`** renamed to `_remember_best_effort` in `skills/massa-ai/scripts/lessons.py` (4 sites) — no `th0th_`-prefixed symbols remain in skills/
- **`OLAMA_VERSION` typo** in `validate-vscode-integration.sh` fixed (variable was `OLLAMA_VERSION`, printed as `${OLAMA_VERSION}` — Ollama version was always blank)
- **`install.sh` docker-fetch operator-precedence bug** fixed: `[ -f "$s" ] || need_fetch=true && break` → `[ -f "$s" ] || { need_fetch=true; break; }` (`&&` bound tighter than `||`, inverting the missing-script detection)
- **Stale "5 shell scripts" text** in `install.sh` updated to reference the shared `massa-ai-hook.ts` Bun binary (Codex/Cursor symlink to it)
- **`Bun.file().toString()` bug** in `diagnose.ts` fixed: `ollamaCandidates` is now async and reads `/etc/resolv.conf` via `await Bun.file(...).text()` (`.toString()` returned `[object BunFile]`, silently breaking WSL2 nameserver detection)
- **`validate-vscode-integration.sh` bunx branch** now mirrors the npx branch's `tools/list` success/failure check (bunx users previously got no MCP tool-count validation)
- **`setup-local-first.sh` search-quality prompt idempotency**: the interactive query-understanding/rerank prompt now only runs on first run (when `.env` doesn't exist), not on every re-run
- **`ClaudeCodeWriter` plugin-hooks coordination**: `install-agents.ts` now detects massa-ai plugin hooks (`_massaAiOwned` markers) in `~/.claude/settings.json` and confirms the MCP entry merged alongside (plugin hooks preserved by `deepMerge`); new tests prove coexistence
- **FEATURES.md roster gap**: `rename_project` + `merge_projects` added to the 52-tool roster table (both already in `CANONICAL_ORDER` and `mcp-tools.md` but missing from the FEATURES.md table)
- **Validator test coverage**: `validate-repository.test.ts` expanded from 34 → 185 scenarios, porting ~150 missing contract checks from the legacy Python `test_validate_repository.py` (persona catalog deep validation, hook-enforcement contract, lessons dual-write, harness state path migration, context slices, agents harness routing, RFC/TDD/ticket/commit workflow contracts, deterministic router precedence, verification ladder, spec-driven phase gates, audit-report-IO, evidence gate, context firewall, synapse policy, mcp-tools matrix, canonical tool naming, docs guides)

## [Wave 6] - 2026-07-22

### Added

- N31: God-file decomposition (symbol-repository-pg, tool-definitions, auto-improve-job, smart-chunker) behind byte-identical facades
- N32: Embedded MCP mode (`MASSA_AI_EMBEDDED=true` routes direct to core services)
- N30: Single `massa-ai-hook` Bun binary replacing 7 shell scripts
- N20: Parallel test runner with ZERO-LOSS UNION GUARD
- N28: Dashboard route + scheduler/status + hooks/queue-status routes
- N29: `MASSA_AI_SCHEDULER_SAFE_DEFAULTS=true` scheduler preset

## [Wave 5] - 2026-07-22

### Added

- N2: Cycle detection (iterative Tarjan SCC) in architecture
- N3: Multi-source BFS CTE for impact analysis
- N5: Grouped prefix-factored tree output format
- N11: Lease-based single-writer for indexing
- N12: Idempotent incremental import
- N13: Capture-policy module (bounded pure module)
- N14: Persisted maintenance scheduler
- N26: Synapse UX compression (`synapse_task_begin`/`synapse_task_end`)
- N27: SSE/WebSocket push for `index_status`

## [Wave 4] - 2026-07-21

### Added

- N1: Generation-based cursor staleness (412 teaching error)
- N4: `*_total`/`*_omitted` invariant on all clamped lists
- N6: Enum teaching errors across 11 tool handlers
- N7: Three-source git diff + secrets denylist
- N8: Shell-arg validation for git refs
- N9: `read_file` 500-line cap + `source_clipped` flag
- N10: SQL bounds regression test

### Changed

- N25: Spec docs reconciled with reality (PG parity migrations exist)
- N33: Dead code sweep (all `catch{}` replaced with `logger.warn`)
- N36: `xdg.ts` extraction (unified config systems)
- M29: `sqlite-removal` closed; `sqlite-removal-followup` split