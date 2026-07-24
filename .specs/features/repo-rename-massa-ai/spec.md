# Repository Rename: massa-th0th → massa-ai — Specification

Slug: `repo-rename-massa-ai`. Workflow: spec-driven (Large/Complex).
Source: user request to rename the entire repo from `massa-th0th` to `massa-ai`.

## Intent

Rename every project-identity surface from `massa-th0th` to `massa-ai`:
folder names, file names, file contents, package scope, config types, env vars,
DB identifiers, user-facing install/data paths, CI workflows, GitHub URL refs,
docs, skills, subagents, plugins, hooks, install scripts, tests, and the legacy
`th0th_*` MCP tool wire-prefix. The on-disk repo folder itself is NOT renamed
(this session); the user will `mv` it separately after content changes land.

## Scope — In

### Identifier variants renamed (all occurrences)
- `massa-th0th` → `massa-ai` (kebab: project name, file/dir names, URLs, package display)
- `massa_th0th` → `massa_ai` (snake: DB user/db, CI env values, bun lock keys)
- `MassaTh0th` → `MassaAi` (Pascal: config type `MassaAiConfig`)
- `MASSA_TH0TH` → `MASSA_AI` (screaming-snake: env vars `MASSA_AI_*`)
- `massaTh0th` → `massaAi` (camel: any camelCase usages)
- `th0th_*` MCP tool wire-prefix → un-prefixed (per user choice: `th0th_search`→`search`, `th0th_recall`→`recall`, `th0th_store`→`store_memory`, `th0th_read_file`→`read_file`, `th0th_search_def`→`search_definitions`, `th0th_get_refs`→`get_references`, `th0th_compact_snapshot`→`compact_snapshot`)
- `e2e-th0th-*` E2E fixture project ids → `e2e-ai-*` (e.g. `e2e-th0th-shared`→`e2e-ai-shared`)
- Egyptian-deity "Thoth" cultural/prose references in docs/README → generic or dropped per design decision
- `@massa-th0th/*` npm scope → `@massa-ai/*`
- User paths: `~/.massa-th0th` → `~/.massa-ai`; `.massa-th0th-data` → `.massa-ai-data`; `.massa-th0th-src` → `.massa-ai-src` if present
- Backup suffix `.massa-th0th.bak` → `.massa-ai.bak`
- `~/.config/massa-th0th/` XDG config → `~/.config/massa-ai/`
- GitHub URL refs `luizgmassa/massa-th0th` → `luizgmassa/massa-ai`
- Docker image refs `massa/massa-th0th:api-latest`, `massa/massa-th0th:mcp-latest` → `massa/massa-ai:*`

### Files/dirs renamed (71 name-bearing paths)
- `skills/massa-th0th/` → `skills/massa-ai/` (dir, ~150 files inside)
- `skills/massa-th0th-memory/` → `skills/massa-ai-memory/` (dir)
- `packages/shared/src/config/massa-th0th-config.ts` → `massa-ai-config.ts`
- `apps/{claude,codex,cursor,opencode}-plugin/agents/massa-th0th-*.md|toml` → `massa-ai-*.md|toml` (12 agents × 4 hosts = 48 files)
- `apps/claude-plugin/hooks/massa-th0th-hook.ts` → `massa-ai-hook.ts`
- `apps/claude-plugin/hooks/__tests__/massa-th0th-hook.test.ts` → `massa-ai-hook.test.ts`
- `apps/codex-plugin/hooks/massa-th0th-hook` → `massa-ai-hook` (no extension)
- `apps/cursor-plugin/hooks/massa-th0th-hook` → `massa-ai-hook`
- `docs/massa-th0th-{commit,maestro,mobile-figma,rfc,spec-driven,tdd,ticket}.md` → `massa-ai-*.md` (7 docs)
- `benchmarks/needles/fixtures/massa-th0th.json` → `massa-ai.json`
- `benchmarks/needles/reports/massa-th0th-*results.json` → `massa-ai-*results.json` (7 reports)
- `apps/cursor-plugin/agents/massa-th0th-navigator.md` → `massa-ai-navigator.md` (claude + cursor host navigator special case; opencode/codex have no navigator)

### Content renamed (~653 files contain `massa-th0th`)
Root docs: `README.md`, `FEATURES.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `TODO.md`, `AGENTS.md`, `plan-multi-language.md`.
Configs: `package.json` (root + 6 workspaces), `tsconfig.json`, `turbo.json`, `bunfig.toml`, `.env.example`, `Dockerfile`, `docker-compose.yml`, `docker-compose.test.yml`, `.dockerignore`, `install.sh`, `mise.toml`, `.tool-versions`, `.node-version`.
CI: `.github/workflows/{ci,publish,needles-gate,skills}.yml`.
Scripts: `scripts/install-skills.ts`, `scripts/install-agents.ts`, `scripts/generate-subagent-artifacts.ts`, `scripts/setup-local-first.sh`, `scripts/version-sync.ts`, etc.
Source: `packages/shared/src/config/*`, `packages/core/src/services/hooks/observation-extractor.ts`, `packages/core/src/__tests__/**`, `apps/mcp-client/src/*`, `apps/opencode-plugin/src/*`, `apps/tools-api/src/*`, `apps/web-ui/*`.
Skills: `skills/massa-th0th/**`, `skills/massa-th0th-memory/**`, `skills/AGENTS.md`, `skills/persona-router/**` (refs), `skills/synapse-usage/**` (refs).
Specs: `.specs/project/{STATE.md,FEATURES.json}`, `.specs/HANDOFF.md`, `.specs/LESSONS.md`, `.specs/lessons.json`, `.specs/features/**` (historical feature docs referencing `massa-th0th`).
Plugins: `apps/{claude,codex,cursor,opencode}-plugin/**` (manifests, skills, hooks, agents, install.sh, README, tests).

## Scope — Out

- On-disk repo folder rename (`mv /Users/luizmassa/Personal Projects/massa-th0th .../massa-ai`) — user does manually post-rename.
- GitHub repo rename on github.com (only URL refs in code/docs updated).
- npm registry republish under new scope (only local package.json names updated).
- Existing-user data migration (old `~/.massa-th0th-data` left in place; legacy migration code in `config-loader.ts` is updated to reference `.massa-ai-data` going forward — old `.massa-th0th-data` is NOT auto-migrated to preserve existing users' data).
- `RLM_LLM_*` subsystem env namespace (intentional compatibility boundary; unchanged).
- The historical `.specs/features/project-identity-rename/` feature docs (record of the prior th0th→massa-th0th rename) — preserved as historical record but its content references updated to the new name where they describe current identity.
- Tree-sitter grammar patches, `patches/` content (unrelated).

## Requirements

### R1 — Package identity
- **R1.1** Root `package.json` `name` = `"massa-ai"`.
- **R1.2** All workspace `package.json` `name` = `@massa-ai/{core,shared,mcp-client,tools-api,web-ui,opencode-plugin}`.
- **R1.3** All `package.json` `description` fields referencing `massa-th0th` reference `massa-ai`.
- **R1.4** All `package.json` `bin` entries `massa-th0th*` → `massa-ai*` (e.g. `massa-th0th`→`massa-ai`, `massa-th0th-config`→`massa-ai-config`, `massa-th0th-api`→`massa-ai-api`).
- **R1.5** Inter-package deps `@massa-th0th/*` → `@massa-ai/*` in all `package.json` `dependencies`/`devDependencies`.
- **R1.6** Root `package.json` `keywords` array `massa-th0th` → `massa-ai`; `thoth` keyword removed or replaced with `ai`.
- **R1.7** `package.json` `author` unchanged (`luizgmassa`).

### R2 — Config type & loader
- **R2.1** `packages/shared/src/config/massa-th0th-config.ts` file renamed to `massa-ai-config.ts`.
- **R2.2** `MassaTh0thConfig` type → `MassaAiConfig` everywhere (type, interface, vars).
- **R2.3** `defaultMassaTh0thConfig` → `defaultMassaAiConfig`.
- **R2.4** `loadConfig(): MassaTh0thConfig` → `loadConfig(): MassaAiConfig`.
- **R2.5** Import paths `./massa-th0th-config` → `./massa-ai-config` in `config-loader.ts`, `index.ts`, and any re-exports.

### R3 — Environment variables
- **R3.1** All `MASSA_TH0TH_*` env vars → `MASSA_AI_*` across `.env.example`, `.env`, `.env.bak`, install.sh, setup-local-first.sh, config-loader, CI workflows, source, tests, specs, docs.
- **R3.2** Default install dir env `MASSA_TH0TH_DIR` (default `~/.massa-th0th`) → `MASSA_AI_DIR` (default `~/.massa-ai`).
- **R3.3** Image env `MASSA_TH0TH_API_IMAGE=massa/massa-th0th:api-latest` → `MASSA_AI_API_IMAGE=massa/massa-ai:api-latest`; same for MCP image.
- **R3.4** `RLM_LLM_*` env vars unchanged (out of scope).

### R4 — User-facing paths
- **R4.1** Install dir default `~/.massa-th0th` → `~/.massa-ai` in install.sh, scripts, docs.
- **R4.2** Data dir `.massa-th0th-data` → `.massa-ai-data` in config-loader legacy migration, setup-local-first.sh, tests, docs.
- **R4.3** XDG config `~/.config/massa-th0th/` → `~/.config/massa-ai/` in config-loader, setup-local-first.sh, docs.
- **R4.4** Backup suffix `.massa-th0th.bak` → `.massa-ai.bak` in install-agents.ts, install-skills.ts, tests.
- **R4.5** `[mcp_servers.massa-th0th]` table key in agent installer → `[mcp_servers.massa-ai]` in install-agents.ts and tests.

### R5 — Database
- **R5.1** CI postgres `POSTGRES_USER=massa_th0th` → `massa_ai`; `POSTGRES_PASSWORD=massa_th0th_password` → `massa_ai_password`; `POSTGRES_DB=massa_th0th` → `massa_ai`. The ci.yml postgres service block (user, password, db, `DATABASE_URL`, `pg_isready -U <user>`) MUST be edited in a single atomic `edit` call to prevent drift (pre-mortem F2 mitigation).
- **R5.2** `DATABASE_URL=postgresql://massa_th0th:massa_th0th_password@localhost:5432/massa_th0th` → `postgresql://massa_ai:massa_ai_password@localhost:5432/massa_ai` in CI, .env.example, docker-compose.
- **R5.3** Prisma schema default DB name if present → `massa_ai`.
- **R5.4** `POSTGRES_PASSWORD` default `massa_th0th_password` in install.sh → `massa_ai_password`.

### R6 — MCP tool wire-prefix removal
- **R6.1** `packages/core/src/services/hooks/observation-extractor.ts` canonical-name map `search: "th0th_search"` → `search: "search"`; `recall: "th0th_recall"` → `recall: "recall"`; `store_memory: "th0th_store"` → `store_memory: "store_memory"`; `search_definitions: "th0th_search_def"` → `search_definitions: "search_definitions"`; `get_references: "th0th_get_refs"` → `get_references: "get_references"`; `compact_snapshot: "th0th_compact_snapshot"` → `compact_snapshot: "compact_snapshot"`.
- **R6.2** Add canonical `case "read_file"`/`"search"`/`"search_definitions"`/`"get_references"`/`"recall"`/`"store_memory"`/`"compact_snapshot"` switch arms. KEEP the legacy `case "th0th_read_file"`/`"th0th_search"`/`"th0th_search_def"`/`"th0th_get_refs"`/`"th0th_recall"`/`"th0th_store"`/`"th0th_compact_snapshot"` arms as **fall-through aliases** to the canonical arms (do NOT delete them) — existing DB rows store the `th0th_*` wire-name and must still match on read (pre-mortem F3 mitigation).
- **R6.3** Guard `toolName !== "Read" && toolName !== "th0th_read_file"` → `toolName !== "Read" && toolName !== "read_file"` (and keep `th0th_read_file` as an OR-clause alias for the same backward-compat reason).
- **R6.4** Test `packages/core/src/__tests__/etl-pipeline-lease.test.ts` "concurrent th0th_index" description → "concurrent index" (test name only; behavior unchanged).
- **R6.5** `packages/core/src/__tests__/test-seam/observation-extractor-seam.test.ts` comment `"search" → "th0th_search" → "searches"` → `"search" → "search" → "searches"` (comment only).

### R7 — E2E fixture ids
- **R7.1** E2E project id `e2e-th0th-shared` → `e2e-ai-shared` in source, tests, specs, gate manifests.
- **R7.2** Derived id `e2e-th0th-shared-b4c0f19595b437ab` and similar hashes → `e2e-ai-shared-*` (prefix only; hash suffix unchanged to keep DB bindings stable).
- **R7.3** `/tmp/massa-th0th-g10-review-*` temp paths in specs → `/tmp/massa-ai-g10-review-*` (spec records only; no runtime effect).

### R8 — Skills
- **R8.1** `skills/massa-th0th/` dir renamed to `skills/massa-ai/` (git mv).
- **R8.2** `skills/massa-th0th-memory/` dir renamed to `skills/massa-ai-memory/` (git mv).
- **R8.3** All internal `skills/massa-th0th/...` path references in `SKILL.md`, workflows, references, scripts → `skills/massa-ai/...`.
- **R8.4** `skills/massa-th0th/scripts/lessons.py` path refs in spec-driven workflow (`python3 skills/massa-th0th/scripts/lessons.py`) → `python3 skills/massa-ai/scripts/lessons.py`.
- **R8.5** `skills/AGENTS.md` sub-agent registry `skills/massa-th0th-memory/`, `skills/massa-th0th/` refs → `skills/massa-ai-memory/`, `skills/massa-ai/`.
- **R8.6** Skill `SKILL.md` `name:` frontmatter if present → updated.

### R9 — Subagents (48 files across 4 hosts)
- **R9.1** `apps/{claude,codex,cursor,opencode}-plugin/agents/massa-th0th-*.md|toml` file names → `massa-ai-*`.
- **R9.2** Content `massa-th0th-owned` ownership markers → `massa-ai-owned`.
- **R9.3** `massa-th0th-navigator` (claude+cursor only) → `massa-ai-navigator`.
- **R9.4** `generate-subagent-artifacts.ts` source/output paths `massa-th0th` → `massa-ai`.
- **R9.5** Subagent parity test assertions updated to expect `massa-ai-*` file names.

### R10 — Plugins & hooks
- **R10.1** Plugin manifests `apps/*/plugin.json` `name`/`description` `massa-th0th` → `massa-ai`.
- **R10.2** `apps/claude-plugin/hooks/massa-th0th-hook.ts` → `massa-ai-hook.ts`; `__tests__/massa-th0th-hook.test.ts` → `massa-ai-hook.test.ts`.
- **R10.3** `apps/{codex,cursor}-plugin/hooks/massa-th0th-hook` (no ext) → `massa-ai-hook`.
- **R10.4** Hook uninstall exclusion by name `massa-th0th-navigator.md` → `massa-ai-navigator.md` in install-agents.ts, plugin manifests, tests.
- **R10.5** `apps/cursor-plugin/hooks/hooks.json` content refs updated.
- **R10.6** `apps/cursor-plugin/install.sh` content refs updated.

### R11 — CI workflows
- **R11.1** `.github/workflows/ci.yml` postgres service env `massa_th0th` → `massa_ai` (user, password, db, health-cmd, DATABASE_URL).
- **R11.2** `.github/workflows/ci.yml` `MASSA_TH0TH_EXECUTOR_SANDBOX` → `MASSA_AI_EXECUTOR_SANDBOX`.
- **R11.3** `.github/workflows/publish.yml` npm publish scope refs if any → `@massa-ai/*`.
- **R11.4** `.github/workflows/needles-gate.yml`, `skills.yml` content refs updated if any.
- **R11.5** CI `skills/**` path trigger unchanged (dir name changes but glob still valid).

### R12 — Install scripts
- **R12.1** `install.sh` banner ASCII (Thoth glyph) replaced with neutral AI glyph or removed; comment header `massa-th0th - Installer` → `massa-ai - Installer`; URL `luizgmassa/massa-th0th` → `luizgmassa/massa-ai`.
- **R12.2** `install.sh` `_MASSA_TH0TH_INSTALLER_VERSION` var → `_MASSA_AI_INSTALLER_VERSION`.
- **R12.3** `install.sh` constants `INSTALL_DIR`, `GITHUB_REPO` default `luizgmassa/massa-th0th` → `luizgmassa/massa-ai`.
- **R12.4** `apps/cursor-plugin/install.sh` content refs updated.
- **R12.5** `scripts/setup-local-first.sh` legacy `~/.massa-th0th-data` → `~/.massa-ai-data`; `LEGACY_DATA_DIR` updated; XDG `~/.config/massa-th0th/` → `~/.config/massa-ai/`.

### R13 — Docker
- **R13.1** `Dockerfile` image refs, labels, comments `massa-th0th` → `massa-ai`.
- **R13.2** `docker-compose.yml` service names, image names, env `massa-th0th` → `massa-ai`; postgres user/db/password `massa_th0th` → `massa_ai`.
- **R13.3** `docker-compose.test.yml` same.
- **R13.4** `docker/entrypoint.sh` content refs updated.
- **R13.5** `.dockerignore` if refs present updated.

### R14 — Docs
- **R14.1** `README.md` title `# massa-th0th` → `# massa-ai`; prose, install commands, URLs updated.
- **R14.2** `FEATURES.md` title, TOC, every feature section `massa-th0th` → `massa-ai`.
- **R14.3** `CHANGELOG.md` historical entries: prior `th0th→massa-th0th` rename entries preserved but described; new `massa-th0th→massa-ai` context noted. Existing `massa-th0th` refs in historical entries remain as historical record (append-only convention).
- **R14.4** `CONTRIBUTING.md`, `TODO.md`, `AGENTS.md`, `plan-multi-language.md` content updated.
- **R14.5** `docs/massa-th0th-*.md` (7 files) renamed to `massa-ai-*.md`; internal refs updated.
- **R14.6** `docs/` internal cross-refs to renamed docs updated.
- **R14.7** Egyptian-deity "Thoth" prose/cultural refs in docs/README → generic "the project" or removed per design.

### R15 — Specs
- **R15.1** `.specs/project/STATE.md` `projectId: massa-th0th` → `massa-ai`; all `massa-th0th` refs updated.
- **R15.2** `.specs/project/FEATURES.json` feature titles/descriptions `massa-th0th` → `massa-ai`.
- **R15.3** `.specs/HANDOFF.md`, `.specs/LESSONS.md`, `.specs/lessons.json` content updated.
- **R15.4** Historical feature docs under `.specs/features/**` referencing `massa-th0th` updated to `massa-ai` (content; file names unchanged unless they bear `massa-th0th` in slug — none do).
- **R15.5** This feature's own artifacts (spec.md, design.md, tasks.md, validation.md) use `massa-ai` as the target; preserve `massa-th0th` only when quoting the old name.

### R16 — Tests
- **R16.1** All test files asserting `massa-th0th` strings assert `massa-ai` instead.
- **R16.2** `scripts/__tests__/install-agents.test.ts` `[mcp_servers.massa-th0th]` → `[mcp_servers.massa-ai]`; backup suffix asserts; navigator exclusion asserts.
- **R16.3** `apps/*-plugin/__tests__/*.test.ts` plugin manifest/agent/install asserts updated.
- **R16.4** `packages/core/src/__tests__/**` observation-extractor, etl-pipeline, e2e fixture ids updated.
- **R16.5** `benchmarks/**` fixture file renamed; run.ts/scorer.ts refs updated.

### R17 — Build & type-check gate
- **R17.1** `bun run type-check` passes (6 tsc projects) after rename.
- **R17.2** `bun run build` passes (turbo build, 5 packages) after rename.
- **R17.3** `bun test` passes (test suite green) after rename.
- **R17.4** No residual `massa-th0th`, `massa_th0th`, `MassaTh0th`, `MASSA_TH0TH`, or `massaTh0th` identifier in any non-archival, non-historical source file (grep count 0 for active code; historical CHANGELOG/.specs entries quoting the old name are exempted and documented).
- **R17.5** No residual `th0th_` MCP-tool wire-prefix in source/tests (grep 0 in `packages/core/src` and `apps`).

## Edge Cases

- **E1** Case-sensitive variants: ensure `massa-th0th` (kebab) vs `massa_th0th` (snake) vs `MassaTh0th` (Pascal) vs `MASSA_TH0TH` (scream) vs `massaTh0th` (camel) all replaced with correct target case.
- **E2** Substring traps: `massa-th0th` appears inside `massa-th0th-memory`, `massa-th0th-config`, `massa-th0th-hook`, `massa-th0th-navigator`, `massa-th0th-owned`. Rename must handle longest-first ordering to avoid partial replacement (e.g. `massa-th0th-memory`→`massa-ai-memory` not `massa-ai-th0th-memory`).
- **E3** Backup suffix `.massa-th0th.bak` must become `.massa-ai.bak` — the leading `.` is a hidden-file marker, not part of the name.
- **E4** E2E fixture id hashes (`e2e-th0th-shared-b4c0f19595b437ab`): only prefix renamed; hash suffix preserved to avoid invalidating DB-bound fixtures mid-test.
- **E5** CHANGELOG historical entries: the prior `th0th → massa-th0th` rename commits (`09713f4`, `346f718`) are historical record; their commit messages and the entries describing them keep `massa-th0th` as quoted history. New `massa-th0th → massa-ai` entries describe the current rename.
- **E6** `.specs/features/project-identity-rename/` (the prior rename feature) describes the OLD rename; its content references current identity as `massa-th0th` — update to `massa-ai` only where it describes current state, preserve `th0th → massa-th0th` history.
- **E7** `bun.lock` contains `@massa-th0th/*` workspace package keys — regenerated by `bun install` after `package.json` rename; do NOT hand-edit `bun.lock`.
- **E8** `.env` and `.env.bak` (gitignored but present) contain real secrets — rename env var keys but preserve values; these are local-only.
- **E9** Git history: `git mv` for renamed dirs/files preserves rename detection; content edits via `edit`/`write` for content. Commit per task.
- **E10** `RTK` wrapper may suppress `find` output for paths matching certain patterns — use raw `/usr/bin/find` for filesystem rename verification.
- **E11** `massa-th0th-navigator.md` exists only in claude + cursor plugins (13 agents elsewhere); opencode + codex plugins have 12 agents (no navigator). Rename must not create phantom navigator files in opencode/codex.
- **E12** Standalone `th0th` in `references/th0th-tools.md` filename — user wants tools un-prefixed; rename file to `references/ai-tools.md` or `references/mcp-tools.md` per design decision; update all refs.

## Acceptance Criteria (testable)

- **AC-R1** `rg '"name": "massa-th0th"' package.json apps/*/package.json packages/*/package.json` → 0 matches; `rg '@massa-th0th/' --hidden -g '!node_modules' -g '!.git' -g '!bun.lock'` → 0.
- **AC-R2** `rg 'MassaTh0thConfig' --hidden -g '!node_modules' -g '!.git' -g '!dist'` → 0; file `packages/shared/src/config/massa-ai-config.ts` exists; `massa-th0th-config.ts` does not.
- **AC-R3** `rg 'MASSA_TH0TH' --hidden -g '!node_modules' -g '!.git' -g '!dist' -g '!bun.lock' -g '!*.specs/archive/*'` → 0 (archive exempted).
- **AC-R4** `rg '\.massa-th0th' install.sh scripts/setup-local-first.sh packages/shared/src/config/config-loader.ts` → 0; `rg '\.massa-ai' install.sh` → matches.
- **AC-R5** `rg 'massa_th0th' .github/workflows/ci.yml docker-compose.yml .env.example` → 0; `rg 'massa_ai' .github/workflows/ci.yml` → matches; `rg 'pg_isready -U massa_th0th' .github/workflows/ci.yml` → 0 (F2).
- **AC-R6** `rg 'th0th_(search|recall|store|read_file|search_def|get_refs|compact_snapshot)' packages/core/src apps/*/src` → 0 in the canonical-name MAP (lines ~49-55); the `case` arms keep `th0th_*` as fall-through aliases (backward-compat, F3). `rg '"th0th_search"' packages/core/src/services/hooks/observation-extractor.ts` → ≥1 (alias retained); canonical arm `case "search":` present.
- **AC-R6-CS** `rg -i 'defaultmassaai|massaai-th0th|massa-ai-th0th|massaai_th0th' --no-ignore-vcs -g '!node_modules' -g '!.git' -g '!dist'` → 0 (case-drift + partial-mangle guard, F1 mitigation).
- **AC-R7** `rg 'e2e-th0th' packages/core/src __tests__ .specs` → 0 (except historical archive quoting); `e2e-ai-shared` present.
- **AC-R8** `test -d skills/massa-ai && test -d skills/massa-ai-memory && ! test -d skills/massa-th0th && ! test -d skills/massa-th0th-memory` → true.
- **AC-R9** `find apps -name 'massa-th0th-*' | wc -l` → 0; `find apps -name 'massa-ai-*' | wc -l` → 48 (12 agents × 4 hosts incl. 2 navigators). Host-specific: `find apps/claude-plugin/agents apps/cursor-plugin/agents -name 'massa-ai-navigator*'` → 2; `find apps/opencode-plugin/agents apps/codex-plugin/agents -name '*navigator*'` → 0 (F4 mitigation — no phantom navigator in opencode/codex).
- **AC-R10** `find apps -name 'massa-th0th-hook*' | wc -l` → 0; `massa-ai-hook*` present in claude/codex/cursor plugins.
- **AC-R11** `rg 'massa_th0th|massa-th0th' .github/workflows/` → 0; `rg 'massa_ai|massa-ai' .github/workflows/ci.yml` → matches.
- **AC-R12** `rg 'luizgmassa/massa-th0th' install.sh README.md docs .github` → 0; `luizgmassa/massa-ai` present.
- **AC-R13** `rg 'massa/massa-th0th' Dockerfile docker-compose.yml .env.example` → 0; `massa/massa-ai` present.
- **AC-R14** `rg 'massa-th0th' README.md FEATURES.md` → 0 (title + body); `rg '^# massa-ai$' README.md` → match.
- **AC-R15** `.specs/project/STATE.md` `projectId: massa-ai`; FEATURES.json no `massa-th0th` in active descriptions.
- **AC-R16** `bun test` exit 0; subagent parity test passes expecting `massa-ai-*` files; install-agents test expects `[mcp_servers.massa-ai]`.
- **AC-R17** `bun run type-check` exit 0 (6 projects); `bun run build` exit 0 (5 packages); `rg 'massa-th0th|massa_th0th|MassaTh0th|MASSA_TH0TH|massaTh0th' --hidden -g '!node_modules' -g '!.git' -g '!dist' -g '!build' -g '!bun.lock'` → 0 in active code (CHANGELOG/.specs historical quotes exempted and enumerated). `rg '"@massa-th0th/' package.json apps/*/package.json packages/*/package.json` → 0 (F5 lockfile gate precondition); `bun.lock` contains no `@massa-th0th/` workspace entries.

## Verification Approach

- Per-requirement AC grep checks (deterministic, file:line evidence).
- Build gate: `bun run type-check && bun run build`.
- Test gate: `bun test` (or `turbo run test`).
- Discrimination sensor: mutation test on `observation-extractor.ts` — flip one canonical name back to `th0th_*`; confirm a hook-extractor test fails; revert.
- Residual scan: zero `massa-th0th`-family identifiers in active code; enumerated exemptions in CHANGELOG/specs archive.
- Filesystem check: all 71 name-bearing paths renamed via `git mv`; `find -name '*massa-th0th*'` → 0 (excluding `.git`).

## Dependencies / Preconditions

- Clean working tree (confirmed: `git status --porcelain` empty on `fix/skills-and-install-drift` branch).
- `rtk` available (confirmed) — but use raw `/usr/bin/find` for rename verification due to RTK filtering.
- Bun 1.3.14 + Node 25.9 installed (`.tool-versions`).

## Risks (elaborated in design.md)

- Identifier substring ordering (E2) — longest-first rename to avoid partial mangling.
- `bun.lock` regeneration (E7) — must `bun install` after package.json rename.
- Historical record preservation (E5/E6) — CHANGELOG + prior-rename feature keep quoted `massa-th0th`.
- Cross-file import paths (R2.5, R8.3) — TS path resolution breaks if a renamed file's importers aren't updated in lockstep.
- Test expectations (R16) — tests asserting old strings fail silently if missed.