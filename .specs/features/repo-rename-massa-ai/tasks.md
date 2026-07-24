# Repository Rename — Tasks

Slug: `repo-rename-massa-ai`. 13 tasks across 6 phases. One atomic commit per task.

## Gate Check Commands (run after every task unless noted)

```bash
# lightweight residual scan (fast)
rg 'massa-th0th|massa_th0th|MassaTh0th|MASSA_TH0TH|massaTh0th' --hidden -g '!node_modules' -g '!.git' -g '!dist' -g '!build' -g '!bun.lock' -g '!.specs/archive/*' -c
# build gate (after content-complete phases)
bun run type-check && bun run build
# test gate (after test-updating phases)
bun test
# name-bearing path scan
/usr/bin/find . -name '*massa-th0th*' -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/build/*'
```

## Test Coverage Matrix (AC → task → check)

| AC | Task | Deterministic Check |
|---|---|---|
| AC-R8 | T1 | `test -d skills/massa-ai && test -d skills/massa-ai-memory && ! test -d skills/massa-th0th` |
| AC-R2 (file) | T2 | `test -f packages/shared/src/config/massa-ai-config.ts && ! test -f packages/shared/src/config/massa-th0th-config.ts` |
| AC-R9 | T2 | `/usr/bin/find apps -name 'massa-th0th-*'` → 0; `massa-ai-*` present |
| AC-R10 | T2 | `/usr/bin/find apps -name 'massa-th0th-hook*'` → 0; `massa-ai-hook*` present |
| AC-R14 (docs) | T2 | `ls docs/massa-ai-*.md` present; `docs/massa-th0th-*.md` gone |
| AC-R1 | T3 | `rg '"name": "massa-th0th"' package.json apps/*/package.json packages/*/package.json` → 0 |
| AC-R2 | T3 | `rg 'MassaTh0thConfig' --hidden -g '!node_modules' -g '!.git' -g '!dist'` → 0 |
| AC-R3 | T3 | `rg 'MASSA_TH0TH' --hidden -g '!node_modules' -g '!.git' -g '!dist' -g '!bun.lock' -g '!.specs/archive/*'` → 0 |
| AC-R4 | T3 | `rg '\.massa-th0th' install.sh scripts/setup-local-first.sh packages/shared/src/config/config-loader.ts` → 0 |
| AC-R5 | T4 | `rg 'massa_th0th' .github/workflows/ci.yml docker-compose.yml` → 0; `rg 'pg_isready -U massa_th0th' .github/workflows/ci.yml` → 0 |
| AC-R6 | T4 | `rg 'search: "th0th_search"' packages/core/src/services/hooks/observation-extractor.ts` → 0 (map renamed); `rg '"th0th_search"' packages/core/src/services/hooks/observation-extractor.ts` → ≥1 (alias case arm kept) |
| AC-R6-CS | T4 | `rg -i 'defaultmassaai|massaai-th0th|massa-ai-th0th' -g '!node_modules' -g '!.git' -g '!dist'` → 0 |
| AC-R7 | T4 | `rg 'e2e-th0th' packages/core/src` → 0 (active); `e2e-ai-shared` present |
| AC-R16 | T5 | `bun test` exit 0 |
| AC-R17 | T6 | `bun run type-check && bun run build` exit 0; `rg '"@massa-th0th/' package.json apps/*/package.json packages/*/package.json` → 0; `bun.lock` no `@massa-th0th/` entries |
| AC-R11 | T5 | `rg 'massa_th0th|massa-th0th' .github/workflows/` → 0 |
| AC-R12 | T3 | `rg 'luizgmassa/massa-th0th' install.sh README.md .github docs` → 0 |
| AC-R13 | T3 | `rg 'massa/massa-th0th' Dockerfile docker-compose.yml .env.example` → 0 |
| AC-R14 | T5 | `rg '^# massa-ai$' README.md` → match; `rg 'massa-th0th' README.md FEATURES.md` → 0 |
| AC-R15 | T5 | `.specs/project/STATE.md` `projectId: massa-ai` |
| AC-R9 (nav) | T6 | `find apps/opencode-plugin/agents apps/codex-plugin/agents -name '*navigator*'` → 0; claude/cursor → 2 |

## Phases & Tasks

### Phase 1 — Filesystem paths (git mv)

#### T1 — Rename skills dirs + benchmarks fixtures
Rename: `skills/massa-th0th/` → `skills/massa-ai/`; `skills/massa-th0th-memory/` → `skills/massa-ai-memory/`; `benchmarks/needles/fixtures/massa-th0th.json` → `massa-ai.json`; `benchmarks/needles/reports/massa-th0th-*results.json` → `massa-ai-*results.json` (7 files).
- Deps: none.
- Gate: `test -d skills/massa-ai && test -d skills/massa-ai-memory && ! test -d skills/massa-th0th && ! test -d skills/massa-th0th-memory`; `find benchmarks -name '*massa-th0th*'` → 0.
- Commit: `refactor(rename): git mv skills/massa-th0th → skills/massa-ai, massa-th0th-memory → massa-ai-memory, benchmark fixtures`
- NOTE: content inside these dirs is updated in T3.

#### T2 — Rename config file + agent files + hook files + docs + ref docs
Rename (via git mv):
- `packages/shared/src/config/massa-th0th-config.ts` → `massa-ai-config.ts`
- `apps/{claude,codex,cursor,opencode}-plugin/agents/massa-th0th-*.md|toml` → `massa-ai-*` (48 files; claude+cursor have navigator, opencode+codex do NOT — do not synthesize navigator)
- `apps/claude-plugin/hooks/massa-th0th-hook.ts` → `massa-ai-hook.ts`; `apps/claude-plugin/hooks/__tests__/massa-th0th-hook.test.ts` → `massa-ai-hook.test.ts`
- `apps/codex-plugin/hooks/massa-th0th-hook` → `massa-ai-hook`; `apps/cursor-plugin/hooks/massa-th0th-hook` → `massa-ai-hook`
- `docs/massa-th0th-{commit,maestro,mobile-figma,rfc,spec-driven,tdd,ticket}.md` → `massa-ai-*.md` (7 files)
- `skills/massa-ai/references/th0th-tools.md` → `skills/massa-ai/references/mcp-tools.md`
- `skills/massa-ai/references/th0th-installation.md` → `skills/massa-ai/references/installation.md`
- Deps: T1 (skills dirs already renamed so `skills/massa-ai/...` paths resolve).
- Gate: `find apps -name 'massa-th0th-*'` → 0; `find . -name 'th0th-tools.md' -o -name 'th0th-installation.md'` (excl .git/node_modules) → 0; `find apps/opencode-plugin/agents apps/codex-plugin/agents -name '*navigator*'` → 0 (verify no phantom); claude+cursor navigator → `massa-ai-navigator*`.
- Commit: `refactor(rename): git mv config, agents (48), hooks, docs, reference docs to massa-ai`
- NOTE: content inside renamed files updated in T3/T4. Only paths move here.

### Phase 2 — Content rename (mechanical, case-sensitive, longest-first)

#### T3 — Mechanical identifier substitution across all source/config/scripts/docs
Apply the 32-row longest-first substitution table (design.md) across all non-archival, non-historical files. CASE-SENSITIVE, tiered (kebab → snake → Pascal → scream → camel). Never `rg -i` for identifiers.
- Scope: root docs (README, FEATURES, CHANGELOG [carefully — historical entries preserved], CONTRIBUTING, TODO, AGENTS, plan-multi-language); configs (package.json ×7, tsconfig, turbo.json, bunfig.toml, .env.example, Dockerfile, docker-compose.yml, docker-compose.test.yml, .dockerignore, install.sh, mise.toml); CI (.github/workflows/*); scripts (scripts/*.ts, *.sh, __tests__, lib, tests); source (packages/shared/src/**, packages/core/src/** EXCEPT observation-extractor handled in T4, apps/mcp-client/src/**, apps/opencode-plugin/src/**, apps/tools-api/src/**, apps/web-ui/**); plugins (apps/*-plugin/** content); skills content (skills/massa-ai/**, skills/massa-ai-memory/**, skills/AGENTS.md, skills/persona-router/**, skills/synapse-usage/**); specs (.specs/project/STATE.md, FEATURES.json, HANDOFF.md, LESSONS.md, lessons.json, features/** — update current-identity refs only, preserve history).
- Special handling: README/FEATURES deity prose → rewrite to neutral (manual edit, not mechanical); CHANGELOG historical entries quoting `massa-th0th` in past-tense rename context → KEEP (append-only); prior `.specs/features/project-identity-rename/` → update current-identity lines to `massa-ai`, preserve `th0th → massa-th0th` history narrative.
- Deps: T1, T2 (paths renamed so content edits target new paths).
- Gate: residual scan → only historical-exempt files remain (CHANGELOG pre-rename entries, .specs/archive, project-identity-rename historical quotes). AC-R1, R2, R3, R4, R12, R13, R14(partial), R15 pass.
- Commit: `refactor(rename): substitute massa-th0th → massa-ai identifiers across source, configs, scripts, docs`
- This is the largest task; consider splitting if >200 file edits. If splitting: T3a (package.json + configs + CI), T3b (source), T3c (docs + specs + skills content).

#### T4 — observation-extractor.ts canonical map + E2E fixture ids
- Rename canonical-name MAP (lines ~49-55): `search: "th0th_search"` → `search: "search"`; `recall: "th0th_recall"` → `recall: "recall"`; `store_memory: "th0th_store"` → `store_memory: "store_memory"`; `search_definitions: "th0th_search_def"` → `search_definitions: "search_definitions"`; `get_references: "th0th_get_refs"` → `get_references: "get_references"`; `compact_snapshot: "th0th_compact_snapshot"` → `compact_snapshot: "compact_snapshot"`.
- Add canonical `case` arms: `case "search":`, `case "search_definitions":`, `case "get_references":`, `case "recall":`, `case "store_memory":`, `case "compact_snapshot":`, `case "read_file":` — each with the same body as its `th0th_*` counterpart.
- KEEP legacy `case "th0th_search":` etc. as FALL-THROUGH aliases (e.g. `case "th0th_search": case "search": <body>` or a shared handler). Do NOT delete the `th0th_*` case labels (F3 mitigation — existing DB rows).
- Update guard `toolName !== "Read" && toolName !== "th0th_read_file"` → `toolName !== "Read" && (toolName !== "read_file" && toolName !== "th0th_read_file")`.
- E2E fixture ids: `e2e-th0th-shared` → `e2e-ai-shared` in source/tests (prefix only; preserve hash suffix `-b4c0f19595b437ab` verbatim). `/tmp/massa-th0th-*` spec temp paths → `/tmp/massa-ai-*`.
- Test names: `etl-pipeline-lease.test.ts` "concurrent th0th_index" → "concurrent index" (description only). `observation-extractor-seam.test.ts` comment `"search" → "th0th_search"` → `"search" → "search"`.
- Deps: T3.
- Gate: AC-R6 (map renamed, aliases retained), AC-R6-CS (case-drift 0), AC-R7 (e2e-th0th → 0 in active).
- Commit: `refactor(rename): observation-extractor canonical map un-prefixed + th0th_* aliases retained; e2e fixture ids e2e-ai-*`

### Phase 3 — Lockfile + build regen

#### T5 — bun install + type-check + build gate
- Pre-gate: `rg '"@massa-th0th/' package.json apps/*/package.json packages/*/package.json` → 0 (F5 precondition).
- Run `bun install` to regenerate `bun.lock` (do NOT hand-edit).
- Run `bun run type-check` (6 tsc projects).
- Run `bun run build` (turbo, 5 packages).
- Fix any breakages (likely: residual import path to `./massa-th0th-config`, or a `@massa-th0th/*` dep reference missed in T3). Fix via targeted `edit`, not global re-pass.
- Deps: T3, T4 (all content renamed).
- Gate: `bun run type-check && bun run build` exit 0; `bun.lock` contains no `@massa-th0th/` workspace entries (`rg '@massa-th0th' bun.lock` → 0).
- Commit: `fix(rename): regenerate bun.lock + resolve post-rename build/type errors`
- NOTE: if `bun install` produces mixed `@massa-th0th/`+`@massa-ai/` lockfile entries, `rm bun.lock && bun install`.

### Phase 4 — Tests + CI

#### T6 — Update test expectations + run bun test
- Update test assertions referencing old strings: `scripts/__tests__/install-agents.test.ts` (`[mcp_servers.massa-th0th]` → `[mcp_servers.massa-ai]`, `.massa-th0th.bak` → `.massa-ai.bak`, navigator exclusion `massa-th0th-navigator.md` → `massa-ai-navigator.md`).
- `apps/*-plugin/__tests__/*.test.ts`: plugin manifest name, agent filenames, hook filenames.
- `packages/core/src/__tests__/**`: observation-extractor expectations (canonical map now `search` not `th0th_search`; but alias case still matches `th0th_search` input — verify tests assert BOTH canonical and alias paths), etl-pipeline-lease test name, e2e fixture id expectations.
- `benchmarks/**`: `run.ts`/`scorer.ts` refs to renamed fixture file `massa-ai.json`.
- Run `bun test`. Fix residuals.
- Deps: T5 (build must pass first; type errors would mask test errors).
- Gate: `bun test` exit 0.
- Commit: `test(rename): update assertions for massa-ai identifiers; all tests pass`

#### T7 — CI workflow update (atomic postgres block)
- `.github/workflows/ci.yml`: edit the ENTIRE postgres service block in ONE atomic `edit` call — `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, AND `pg_isready -U <user>` all rename `massa_th0th` → `massa_ai` together (F2 mitigation).
- `.github/workflows/ci.yml`: `MASSA_TH0TH_EXECUTOR_SANDBOX` → `MASSA_AI_EXECUTOR_SANDBOX` (line ~90).
- `.github/workflows/publish.yml`: npm publish scope refs if any → `@massa-ai/*`; any `massa-th0th` refs → `massa-ai`.
- `.github/workflows/needles-gate.yml`, `skills.yml`: content refs if any.
- Deps: T6.
- Gate: AC-R5, AC-R11. `rg 'massa_th0th|massa-th0th' .github/workflows/` → 0; `rg 'pg_isready -U massa_th0th' .github/workflows/ci.yml` → 0.
- Commit: `ci(rename): update postgres creds + env to massa-ai (atomic block)`

### Phase 5 — Docs + specs prose pass

#### T8 — README, FEATURES.md, CHANGELOG, AGENTS.md prose
- `README.md`: title `# massa-ai`; rewrite deity-prose opening to neutral technical ("massa-ai is a local-first MCP server..."); update install commands (`curl ... luizgmassa/massa-ai/...`); update all `massa-th0th` → `massa-ai`.
- `FEATURES.md`: title, TOC, every section; `massa-th0th` → `massa-ai`; deity refs neutral.
- `CHANGELOG.md`: append a new entry at top describing the `massa-th0th → massa-ai` rename; KEEP all historical entries (they quote `massa-th0th` as past-tense history — DO NOT rewrite them).
- `CONTRIBUTING.md`, `TODO.md`, `AGENTS.md`, `plan-multi-language.md`: content refs.
- `.specs/features/project-identity-rename/` (prior rename feature): update lines describing *current* identity to `massa-ai`; preserve the `th0th → massa-th0th` historical narrative.
- Deps: T7.
- Gate: AC-R14. `rg '^# massa-ai$' README.md` → match; `rg 'massa-th0th' README.md FEATURES.md` → 0 (excluding CHANGELOG historical entries).
- Commit: `docs(rename): README/FEATURES/CHANGELOG/AGENTS to massa-ai; preserve historical entries`

#### T9 — .specs artifacts (STATE, FEATURES.json, HANDOFF, LESSONS)
- `.specs/project/STATE.md`: `projectId: massa-th0th` → `massa-ai`; update all current-identity refs; preserve completed-feature history (WTA, subagent-parity etc. can keep their `massa-th0th` mentions as quoted record OR update to `massa-ai` — decision: update to `massa-ai` for current-identity consistency, since these features describe the same project now renamed).
- `.specs/project/FEATURES.json`: feature titles/descriptions `massa-th0th` → `massa-ai`; add this feature (`repo-rename-massa-ai`) to registry as `in_progress` then `complete`.
- `.specs/HANDOFF.md`, `.specs/LESSONS.md`, `.specs/lessons.json`: content updated.
- Historical feature docs under `.specs/features/**`: update current-identity refs to `massa-ai` (content; file slugs unchanged unless bearing `massa-th0th` — none do).
- Deps: T8.
- Gate: AC-R15. `.specs/project/STATE.md` `projectId: massa-ai`; `rg 'massa-th0th' .specs/project/STATE.md .specs/project/FEATURES.json` → 0 (current-identity lines).
- Commit: `specs(rename): STATE/FEATURES/HANDOFF/LESSONS + historical feature docs to massa-ai`

### Phase 6 — Residual scan + final gate

#### T10 — Full residual scan + enumerate exemptions
- Run the full residual scan: `rg 'massa-th0th|massa_th0th|MassaTh0th|MASSA_TH0TH|massaTh0th' --hidden -g '!node_modules' -g '!.git' -g '!dist' -g '!build' -g '!bun.lock'`.
- Enumerate every remaining match and classify: (a) historical-exempt (CHANGELOG pre-rename entries, .specs/archive, project-identity-rename historical narrative) — KEEP; (b) residual — FIX.
- Fix any residuals via targeted `edit`.
- Deps: T9.
- Gate: residual matches ONLY in enumerated historical-exempt files; active-code count 0.
- Commit: `fix(rename): clear residual massa-th0th identifiers from active code`

#### T11 — Final build + test + type-check gate
- Run `bun run type-check && bun run build && bun test` sequentially.
- Run `/usr/bin/find . -name '*massa-th0th*' -not -path '*/.git/*' -not -path '*/node_modules/*'` → 0 name-bearing paths.
- Run all AC grep checks (AC-R1..R17) and record evidence in validation.md.
- Deps: T10.
- Gate: all ACs pass; build+test+type-check green.
- Commit: none (validation-only; or amend prior commit if a fix was needed).

#### T12 — Validation report (independent verifier)
- Write `.specs/features/repo-rename-massa-ai/validation.md` (PASS/FAIL, per-AC evidence, discrimination sensor result, diff range).
- Discrimination sensor: in `observation-extractor.ts`, flip `search: "search"` back to `search: "th0th_search"` in the canonical map; run the observation-extractor test; confirm it FAILS (the test should assert the un-prefixed canonical); revert. Also: flip a canonical `case "search":` arm to remove the `th0th_search` alias; run the backward-compat test (if none exists, note as a gap); revert.
- Verifier must be independent (author ≠ verifier) — spawn a separate reviewer subagent or run the standalone fresh-eyes fallback.
- Deps: T11.
- Gate: validation.md PASS.
- Commit: `docs(rename): validation report — repo rename massa-th0th → massa-ai PASS`

## Sub-Agent Offer

This tasks.md packs into 12 tasks (~2 batches of ~7). Per `references/spec-driven/sub-agents.md`, offer sub-agent execution. BUT: the subagent model (`cavecrew-builder`) was unavailable in the pre-mortem step. If still unavailable, execute sequentially in the main thread. Offer-then-confirm — never auto-spawn. Given the high coupling (content edits depend on path renames; tests depend on content; CI depends on tests), sequential single-thread execution is safer than parallel batches here. Recommend: execute sequentially in main thread; do not spawn workers.

## Notes

- One atomic commit per task. Never batch.
- `git mv` for renames; `edit`/`write` for content.
- If a skipped phase becomes necessary, stop, create/revise it, resume.
- Historical preservation (CHANGELOG, .specs/archive, prior-rename feature) is non-negotiable.
- The `th0th_*` alias retention in observation-extractor (F3) is a hard requirement, not optional.