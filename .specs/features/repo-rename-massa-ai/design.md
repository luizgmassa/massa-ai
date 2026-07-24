# Repository Rename — Design

Slug: `repo-rename-massa-ai`. Approach: **A — single-pass mechanical rename with longest-first identifier substitution + git mv for paths + bun install lockfile regen + per-phase build gate**.

## Identifier Mapping (longest-first substitution order)

Substitution MUST be applied in this exact order to avoid partial mangling (E2). Within a file, replace longest tokens first; compound names before their base.

| # | Find (regex/literal) | Replace | Case | Notes |
|---|---|---|---|---|
| 1 | `massa-th0th-memory` | `massa-ai-memory` | kebab | compound: skill dir + refs |
| 2 | `massa-th0th-config` | `massa-ai-config` | kebab | compound: config file + import path |
| 3 | `massa-th0th-hook` | `massa-ai-hook` | kebab | compound: hook files |
| 4 | `massa-th0th-navigator` | `massa-ai-navigator` | kebab | compound: navigator agent |
| 5 | `massa-th0th-owned` | `massa-ai-owned` | kebab | ownership marker |
| 6 | `massa-th0th-data` | `massa-ai-data` | kebab | data dir (with leading `.`) |
| 7 | `massa-th0th-src` | `massa-ai-src` | kebab | install src dir (if present) |
| 8 | `massa-th0th` | `massa-ai` | kebab | base project name, URLs, display |
| 9 | `massa_th0th_password` | `massa_ai_password` | snake | DB password default |
| 10 | `massa_th0th` | `massa_ai` | snake | DB user/db, env values, lock keys |
| 11 | `defaultMassaTh0thConfig` | `defaultMassaAiConfig` | camel→camel | compound identifier (longest) |
| 12 | `MassaTh0thConfig` | `MassaAiConfig` | Pascal | config type |
| 13 | `MASSA_TH0TH` | `MASSA_AI` | scream | env var prefix |
| 14 | `massaTh0th` | `massaAi` | camel | any camelCase usage |
| 15 | `th0th_compact_snapshot` | `compact_snapshot` | un-prefix | MCP tool wire (longest th0th_ tool) |
| 16 | `th0th_search_def` | `search_definitions` | un-prefix | (note: → `search_definitions` not `search_def`) |
| 17 | `th0th_get_refs` | `get_references` | un-prefix | (→ `get_references` not `get_refs`) |
| 18 | `th0th_search_definitions` | `search_definitions` | un-prefix | if any long form exists |
| 19 | `th0th_read_file` | `read_file` | un-prefix | |
| 20 | `th0th_store` | `store_memory` | un-prefix | (→ `store_memory` not `store`) |
| 21 | `th0th_search` | `search` | un-prefix | |
| 22 | `th0th_recall` | `recall` | un-prefix | |
| 23 | `th0th_index` | `index` | un-prefix | (test name quote only) |
| 24 | `e2e-th0th-shared` | `e2e-ai-shared` | kebab | E2E fixture id (longest e2e-th0th) |
| 25 | `e2e-th0th` | `e2e-ai` | kebab | E2E fixture prefix |
| 26 | `th0th-tools.md` / `references/th0th-tools` | `mcp-tools.md` / `references/mcp-tools` | path | ref file rename + all `th0th-tools` path refs |
| 27 | `th0th-installation.md` / `references/th0th-installation` | `installation.md` / `references/installation` | path | ref file rename + path refs |
| 28 | `luizgmassa/massa-th0th` | `luizgmassa/massa-ai` | URL | GitHub repo URL |
| 29 | `massa/massa-th0th` | `massa/massa-ai` | URL | Docker image |
| 30 | `.massa-th0th.bak` | `.massa-ai.bak` | suffix | backup marker (leading `.` kept) |
| 31 | `mcp_servers.massa-th0th` | `mcp_servers.massa-ai` | TOML key | agent installer table key |
| 32 | `[massa-th0th]` | `[massa-ai]` | TOML section | if any bare section header |

### Out-of-order caution
- `Thoth` / `thoth` (Egyptian deity, not `th0th`) — handled per-prose in docs only; NOT a mechanical replace. Design decision: replace deity prose with neutral "the project"/"the system" or drop; ASCII glyph in `install.sh` replaced with neutral AI glyph.
- `RLM_LLM_*` — explicitly excluded; no substitution.
- Historical `th0th → massa-th0th` CHANGELOG/spec archive quotes — preserve verbatim; they describe the old name in past tense.

## Architecture Decisions

### AD1: Single-pass mechanical rename (Approach A)
Chosen over staged/feature-flag rename. Rationale: identity rename is atomic by nature; partial renames leave a half-broken repo that can't build or type-check. One pass, then build gate, then fix residuals. Prior `project-identity-rename` feature used this approach successfully.

### AD2: git mv for filesystem, edit for content
- `git mv` for the 71 name-bearing paths (dirs + files) preserves rename detection in `git log --follow`.
- Content edits via `edit`/`write` for the ~653 files with string content.
- Order: content first OR paths first? **Paths first** is safer because `edit` tool matches file paths; if we rename a file then edit its content, the edit targets the new path. If we edit content then rename, an intervening grep might surface stale paths. Decision: **rename paths first (Phase 1), then content (Phase 2)**, because content edits to import paths must reflect the new file locations.

### AD3: bun.lock regeneration
Do NOT hand-edit `bun.lock`. After all `package.json` `name`/`@massa-th0th/*` deps renamed, run `bun install` to regenerate. The lockfile is a build artifact.

### AD4: Historical preservation
- `CHANGELOG.md`: existing entries keep `massa-th0th` as quoted history; add a new entry describing the `massa-th0th → massa-ai` rename.
- `.specs/features/project-identity-rename/` (prior rename feature): update only the lines describing *current* identity to say `massa-ai`; preserve the `th0th → massa-th0th` historical narrative.
- `.specs/archive/`: exempt from active-code residual scan (AC-R3 exempts `.specs/archive/*`).

### AD5: Deity prose handling
README/docs open with "massa-th0th is a local-first MCP server..." — rephrase to "massa-ai is a local-first MCP server...". Any sentence invoking the Egyptian scribe deity as metaphor is dropped or rewritten to plain technical prose. The ASCII art glyph in `install.sh` (Thoth hieroglyph block) is replaced with a neutral `massa-ai` text banner or a simple AI glyph.

### AD6: MCP tool canonical names
`observation-extractor.ts` maps tool-family → wire-name. Current wire-names are `th0th_*` even though the public tool surface is un-prefixed (prior `workflow-tools-adaptation` removed `th0th_` from public names but left the hook-extractor wire-map). User choice: drop the `th0th_` from the wire-map too, aligning hook extraction with the public un-prefixed names. Risk: if any persisted hook observation in the DB stored the `th0th_` wire-name, historical observations won't match the new un-prefixed map. Mitigation: the extractor matches on the tool family key (`search`, `recall`) first and falls back to the wire-name `case`; renaming the wire-name to match the public name is internally consistent. Existing DB rows store the tool family, not the wire string, per `observation-extractor.ts:266` guard logic — verify in execute.

### AD7: File rename for reference docs
- `skills/massa-th0th/references/th0th-tools.md` → `skills/massa-ai/references/mcp-tools.md` (neutral; avoids `ai-tools` collision with future generic AI tools).
- `skills/massa-th0th/references/th0th-installation.md` → `skills/massa-ai/references/installation.md`.
- All `th0th-tools` / `th0th-installation` path refs in workflows/references updated.

## Risk Surface

| Risk | Severity | Mitigation |
|---|---|---|
| F1 — Partial substitution mangles compound names (e.g. `massa-ai-th0th-memory`) | High | Longest-first table above; verify with `rg 'massa-ai-th0th|massa-th0th-ai'` → 0 |
| F2 — TS import path breaks after file rename (config-loader imports `./massa-th0th-config`) | High | Rename file + update importer in same task; `bun run type-check` gates |
| F3 — `bun.lock` stale after package.json rename | Medium | `bun install` regen; do not hand-edit |
| F4 — Test asserting old string fails silently (string mismatch, not import error) | High | Run `bun test` after each phase; grep test files for residual `massa-th0th` |
| F5 — git mv loses untracked file inside renamed dir | Low | Working tree clean (confirmed); no untracked files in rename targets |
| F6 — E2E fixture hash suffix disturbed | Medium | Only rename `e2e-th0th` prefix; preserve `-b4c0f19595b437ab` suffix verbatim |
| F7 — CI postgres health-cmd breaks (`pg_isready -U massa_th0th` → `-U massa_ai`) | High | Rename user/password/db together in ci.yml service + DATABASE_URL + health-cmd |
| F8 — Subagent parity test expects old `massa-th0th-*` filenames | High | Update test expectations in same phase as file rename |
| F9 — `skills/massa-th0th/scripts/lessons.py` path in spec-driven workflow breaks | Medium | Update `skills/massa-th0th/scripts/lessons.py` refs → `skills/massa-ai/scripts/lessons.py` in workflow files |
| F10 — ASCII art / banner in install.sh references old name visually | Low | Replace banner; visual-only |
| F11 — `.env` / `.env.bak` local secrets disturbed | Low | Rename env var *keys* only, preserve values; files are gitignored |
| F12 — Navigator agent phantom in opencode/codex | Medium | Only 12 agents in opencode/codex (no navigator); claude/cursor have 13 (incl navigator). Rename must not synthesize navigator where absent. |
| F13 — `th0th_` wire-map rename breaks persisted hook observations | Medium | Verify DB stores tool family not wire-name; if stored, add migration note (out of scope per R3.4) |

## Execution Order (informs tasks.md)

1. **Phase 1 — Filesystem paths (git mv)**: rename the 71 name-bearing paths first. No content edits yet.
2. **Phase 2 — Content rename (mechanical)**: longest-first substitution across all files in the repo. Scripted where safe (`sed`/`rg --replace`), manual `edit` for nuanced prose (README, deity refs, CHANGELOG historical boundary).
3. **Phase 3 — Lockfile + build regen**: `bun install` → `bun run type-check` → `bun run build`. Fix any breakages (likely import paths from Phase 1).
4. **Phase 4 — Tests + CI**: update test expectations, run `bun test`, update CI yaml. Fix residuals.
5. **Phase 5 — Docs + specs**: README, FEATURES.md, CHANGELOG entry, .specs artifacts. Prose pass for deity refs.
6. **Phase 6 — Residual scan + gate**: zero-residual grep across all active code; enumerate historical exemptions; final build+test+type-check gate.

## Tradeoffs Considered

- **Staged feature-flag rename** (Approach B): alias both names, migrate over time. Rejected — identity rename doesn't benefit from gradualism; adds dual-name complexity and test surface.
- **Path-first vs content-first**: path-first chosen (AD2) because content edits to import paths must reflect new locations; editing imports to new path before the file moves would break the build mid-pass.
- **Hand-edit bun.lock vs regen**: regen chosen (AD3) — lockfile is derived; hand-editing risks subtle drift.

## Verification Hooks

- After Phase 1: `find -name '*massa-th0th*'` (excluding .git) → 0 name-bearing paths; new `*massa-ai*` paths present.
- After Phase 2: `rg 'massa-th0th|massa_th0th|MassaTh0th|MASSA_TH0TH|massaTh0th' --hidden -g '!node_modules' -g '!.git' -g '!dist' -g '!build' -g '!bun.lock'` → only historical-exempt files (CHANGELOG prior entries, .specs/archive, prior-rename feature quoting old name).
- After Phase 3: `bun run type-check` exit 0; `bun run build` exit 0.
- After Phase 4: `bun test` exit 0.
- After Phase 6: full AC matrix grep checks pass.