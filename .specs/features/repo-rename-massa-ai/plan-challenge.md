# Pre-Mortem: Repository Rename massa-th0th → massa-ai

**Timeframe:** 1 month post-rename
**Mode:** pre-mortem (standalone fresh-eyes local critique — subagent model unavailable; delegation skipped per `the-fool.md:48` fallback)

## Failure Narratives

### 1. Compound-Name Mangle: `massa-th0th-memory` survives as `massa-ai-th0th-memory` — Likelihood: Medium | Impact: High

It's 1 month from now. The mechanical substitution ran table entry #8 (`massa-th0th`→`massa-ai`) BEFORE entry #1 (`massa-th0th-memory`→`massa-ai-memory`) in some files because a `sed`/`rg --replace` pass applied entries top-to-bottom but a second tool (the `edit` calls for nuanced prose) re-introduced `massa-th0th` in a README sentence that was later caught by the global `massa-th0th`→`massa-ai` pass, producing `massa-ai-memory` correctly there — BUT a `skills/massa-th0th-memory/SKILL.md` internal cross-ref to `skills/massa-ai/` (already renamed in Phase 1) landed as `skills/massa-ai-memory/` in the dir rename yet the SKILL.md content still said `skills/massa-th0th-memory/` because Phase 1 (git mv) ran before Phase 2 (content), and the content pass missed the `massa-th0th-memory` compound in favor of the base `massa-th0th`→`massa-ai` match, yielding `skills/massa-ai-memory/` in the dir but a lingering `massa-th0th` substring inside. Wait — that's actually fine. The real mangle: a `rg --replace 'massa-th0th/massa-ai'` ordering bug where `massa-th0th-memory` → base pass `massa-th0th`→`massa-ai` → `massa-ai-memory` is correct, BUT `defaultMassaTh0thConfig` (camel) was matched by a case-insensitive `rg -i` pass that hit `massa-th0th` inside it as `massa-th0th`→`massa-ai`, producing `defaultMassaaiConfig` (lowercased) in 3 files, breaking TS type resolution.

**Consequence chain:**
- 1st order: `bun run type-check` fails on `packages/shared/src/index.ts:36` — `defaultMassaAiConfig` export missing (it's now `defaultMassaaiConfig`).
- 2nd order: Phase 3 build gate red; engineer greps for the mangle, finds 3 files, fixes them manually; time cost ~20 min.
- 3rd order: Confidence in mechanical pass drops; full re-scan of all 653 files required to find other case-mangles; rename slips by half a day.

**Early warning sign:** `bun run type-check` failure citing a renamed symbol that doesn't match the intended PascalCase/camelCase target.

**Mitigation:** Enforce case-sensitive substitution; NEVER use `rg -i` for the identifier pass. Run substitution in strict case tiers: kebab-only pass, snake-only pass, Pascal-only pass, scream-only pass, camel-only pass — each with its own case-anchored regex. Verify with `rg 'defaultMassaaiConfig|defaultmassaaiConfig|MassaAiConfig' --no-ignore-vcs` catching any case drift. Effort: Med. Reduces risk by: 80%.

### 2. CI Postgres Credential Drift: health-cmd user ≠ DATABASE_URL user — Likelihood: High | Impact: Critical

It's 1 month from now. The next PR triggers CI. `.github/workflows/ci.yml` postgres service env was renamed: `POSTGRES_USER: massa_ai`, `POSTGRES_PASSWORD: massa_ai_password`, `POSTGRES_DB: massa_ai`, and `DATABASE_URL=postgresql://massa_ai:massa_ai_password@localhost:5432/massa_ai`. BUT the `pg_isready -U massa_th0th` health-cmd was missed (it's on a separate line under `options:`) and still says `-U massa_th0th`. The postgres service never becomes healthy (pg_isready checks a nonexistent role), the job hangs at "Setup Postgres" for the 10 retries, then fails. Every PR CI is red for a week before someone greps the workflow.

**Consequence chain:**
- 1st order: CI `build` job fails at the postgres service health check; no test runs.
- 2nd order: PR merges blocked or bypassed; CI trust erodes.
- 3rd order: Team disables the postgres job to unblock, a real regression slips.

**Early warning sign:** CI job stuck at "Waiting for postgres to be ready" / `pg_isready` timeout.

**Mitigation:** Treat the CI postgres block as ONE atomic unit: user, password, db, `DATABASE_URL`, AND `pg_isready -U <user>` must all rename in a single `edit` call. Add an AC: `rg 'pg_isready -U massa_th0th' .github/workflows/ci.yml` → 0. Add a lint-style grep gate to ci.yml review. Effort: Low. Reduces risk by: 95%.

### 3. th0th_ Wire-Map Persistence Break: existing DB hook observations orphaned — Likelihood: Medium | Impact: High

It's 1 month from now. An existing user upgrades to the renamed build. Their `~/.massa-th0th-data` (NOT migrated, per R3.4 out-of-scope) still has the old DB with hook observations whose `tool_name` column stores `th0th_search`, `th0th_recall` etc. (wire-names persisted at capture time). The renamed `observation-extractor.ts` now canonicalizes to `search`, `recall` (un-prefixed). The extractor's `case` arms no longer match `th0th_search`, so historical observations read back with a `tool_name` that the new display/recall logic ignores — the user's passive-capture memory silently stops surfacing old observations. The user reports "my memory is gone."

**Consequence chain:**
- 1st order: Historical hook observations (`tool_name LIKE 'th0th_%'`) no longer match the canonical map; display/recall filters drop them.
- 2nd order: User perceives memory loss; trust in the tool drops.
- 3rd order: User rolls back; rename earns a reputation for data loss.

**Early warning sign:** User report of "missing memories" post-upgrade; DB query `SELECT DISTINCT tool_name FROM observations WHERE tool_name LIKE 'th0th_%'` returns rows on upgraded installs.

**Mitigation:** Two options — (a) keep `th0th_*` as ALIASES in the `case` arms (fall-through to the new canonical) for backward-compat reading, removing the alias only on a future schema migration; OR (b) add a one-time SQL migration `UPDATE observations SET tool_name = REGEXP_REPLACE(tool_name, '^th0th_', '') WHERE tool_name LIKE 'th0th_%'` on startup, idempotent. Recommend (a) for this rename (lowest risk, no DB write). Add AC: `observation-extractor.ts` `case "th0th_search":` arm falls through to `case "search":`. Effort: Low. Reduces risk by: 90%. Note: this REVERSES part of R6.2 — the `th0th_*` case arms must stay as aliases, not be deleted.

### 4. Subagent Parity Test Phantom Navigator — Likelihood: Medium | Impact: Medium

It's 1 month from now. The subagent parity test (`generate-subagent-artifacts.ts --check` + parity test) was updated to expect `massa-ai-*` files. But the test's agent-count assertion was left at 13 for all 4 hosts (claude, codex, cursor, opencode). opencode and codex only have 12 agents (no navigator). The rename created a phantom `massa-ai-navigator.md` in opencode/codex to satisfy the count-13 assertion, OR the assertion was correctly 12 but the test file wasn't updated and now expects 13 `massa-ai-*` files in opencode but finds 12 — parity test fails. Engineer "fixes" by adding a navigator that shouldn't exist, polluting the opencode/codex plugin.

**Consequence chain:**
- 1st order: Parity test red; or navigator synthesized where it shouldn't be.
- 2nd order: opencode/codex plugin ships a navigator subagent that has no matching skill, confusing users.
- 3rd order: Plugin parity drift between hosts; the generator's single-source-of-truth contract breaks.

**Early warning sign:** `bun test` parity suite failure citing agent count mismatch; `find apps/opencode-plugin/agents -name '*navigator*'` returns a file.

**Mitigation:** Verify navigator exists ONLY in claude + cursor before renaming; assert `find apps/opencode-plugin/agents apps/codex-plugin/agents -name '*navigator*'` → 0 both before and after. The parity test must encode host-specific counts (13 for claude/cursor, 12 for opencode/codex). Effort: Low. Reduces risk by: 85%. Add AC: no navigator file in opencode/codex post-rename.

### 5. bun.lock Workspace Resolution Failure — Likelihood: Medium | Impact: High

It's 1 month from now. All `package.json` `name` fields renamed to `@massa-ai/*` and inter-deps to `@massa-ai/*`. `bun install` was run and regenerated `bun.lock`. BUT `bun install` was run BEFORE all the `package.json` edits completed (Phase 3 started mid-Phase-2), so `bun.lock` has a mix of `@massa-th0th/*` and `@massa-ai/*` workspace entries. The lockfile resolves half the workspace under the old name. `bun run build` fails because `@massa-ai/core` (new name) isn't in the lock, but `@massa-th0th/core` (old, now missing from package.json) is. Build red. Engineer re-runs `bun install`, but the partial lockfile confuses bun's resolution cache, requiring `rm -rf node_modules bun.lock && bun install` to recover — 8 min lost, plus risk of leaving the repo in a worse state.

**Consequence chain:**
- 1st order: `bun run build` fails resolving `@massa-ai/core`.
- 2nd order: `rm -rf node_modules bun.lock && bun install` recovery; 8 min.
- 3rd order: If committed by mistake, the mixed lockfile breaks CI for everyone.

**Early warning sign:** `bun.lock` contains both `@massa-th0th/` and `@massa-ai/` workspace entries simultaneously.

**Mitigation:** Phase 3 (`bun install`) must run ONLY after ALL `package.json` edits in Phase 2 are complete and verified. Add a pre-gate: `rg '"@massa-th0th/' **/package.json package.json` → 0 BEFORE running `bun install`. If `bun.lock` shows mixed entries after install, `rm bun.lock && bun install` and re-verify. Effort: Low. Reduces risk by: 90%.

## Ranked Findings

| # | Finding | Severity | Affected Section | Required Action |
|---|---|---|---|---|
| F1 | Case-insensitive substitution mangles camelCase/PascalCase identifiers | High | design.md substitution table | Revise: enforce case-sensitive, case-tiered substitution; never `rg -i` for identifiers; add case-drift grep AC |
| F2 | CI postgres health-cmd user drifts from DATABASE_URL user | Critical | R5.1, ci.yml | Revise: treat ci.yml postgres block as atomic single-edit; add `pg_isready -U massa_th0th` → 0 AC |
| F3 | `th0th_*` wire-map deletion orphans existing DB hook observations | High | R6.2, AD6 | Revise: keep `th0th_*` as fall-through ALIASES in observation-extractor case arms (do NOT delete them); add backward-compat AC |
| F4 | Subagent parity test count assertion creates phantom navigator in opencode/codex | Medium | R9, F8/F12 | Revise: verify host-specific counts (13 claude/cursor, 12 opencode/codex); add no-navigator-in-opencode AC |
| F5 | bun.lock mixed workspace entries from premature install | High | Phase 3 ordering, E7 | Revise: gate `bun install` behind `rg '"@massa-th0th/' package.json` → 0; add mixed-lockfile AC |

## Inversion Check

**What would guarantee failure:**
1. Running `rg -i` for the identifier substitution (guarantees case-mangles per F1).
2. Splitting the ci.yml postgres block across multiple non-atomic edits (guarantees F2).
3. Deleting the `th0th_*` case arms in observation-extractor without an alias fall-through (guarantees F3 for existing users).
4. Running `bun install` before all package.json renames done (guarantees F5).

**Do any exist now?** The plan as written:
- F1: design.md does NOT explicitly forbid `rg -i`; risk exists. → REVISE.
- F2: R5.1 lists the fields but doesn't mandate atomic single-edit. → REVISE.
- F3: R6.2 says `case "th0th_*"` → un-prefixed (implying replacement/deletion). AD6 notes the risk but the spec doesn't mandate aliasing. → REVISE.
- F5: Phase 3 ordering implies post-Phase-2 but no explicit gate. → REVISE.

## Assumption Most Likely To Make This Fail

That a mechanical longest-first substitution pass is sufficient. The plan under-specifies case sensitivity (F1) and persistence backward-compat (F3). A mechanical pass with `rg -i` or a naive `sed` will mangle camelCase identifiers, and deleting `th0th_*` case arms without aliases will orphan existing user data.

## Deterministic Check That Would Falsify Success Earliest

`bun run type-check` after Phase 3. A case-mangled `defaultMassaAiConfig` or a broken import path fails here within seconds, before any slower test. F1, F2 (via import), F5 surface here. F3 (persistence) only surfaces in integration/e2e or user reports — slower.

## High-Risk Domain / >5 Files Confirmation

Confirmed: touches >5 files (653+), touches public npm package scope (R1 — cross-service contract for any consumer), touches CI credentials (R5), touches DB schema-adjacent persistence (R6/F3), touches user-facing install paths (R4 — breaking for existing users). Full gate justified.

## escalate_to_full: true (already running full mode per policy)

## Required Plan Revisions (serious_findings: revise_plan)

1. **R6.2 / AD6 — Alias, don't delete, `th0th_*` case arms.** Change R6.2 from "replace `case "th0th_search"` with `case "search"`" to "add `case "search":` canonical arm AND keep `case "th0th_search":` as an alias falling through to the canonical". The canonical-name MAP (lines 49-55) changes `search: "th0th_search"` → `search: "search"` (new writes use un-prefixed), but the switch-case READ path keeps `th0th_*` as aliases for legacy DB rows. Add AC: `observation-extractor.ts` contains both `case "search":` and `case "th0th_search":` (fall-through) post-rename.

2. **design.md substitution table — enforce case-sensitive tiers.** Add a rule: "All identifier substitution is case-sensitive and runs in 5 tiers (kebab, snake, Pascal, scream, camel) with case-anchored regex; `rg -i` is forbidden for identifier passes." Add AC: `rg -i 'defaultmassaai|massaai-th0th|massa-ai-th0th' --no-ignore-vcs -g '!node_modules' -g '!.git'` → 0 (catches case drift + partial mangles).

3. **R5.1 / ci.yml — atomic postgres block edit.** Add note to R5: "The ci.yml postgres service block (user, password, db, DATABASE_URL, pg_isready -U) MUST be edited in a single atomic `edit` call to prevent drift." Add AC: `rg 'pg_isready -U massa_th0th' .github/workflows/ci.yml` → 0.

4. **Phase 3 ordering — gate bun install.** Add to design.md Phase 3 precondition: "`rg '"@massa-th0th/' package.json apps/*/package.json packages/*/package.json` → 0 BEFORE running `bun install`." Add AC: `bun.lock` contains no `@massa-th0th/` workspace entries.

5. **R9 / F12 — host-specific navigator counts.** Add AC: `find apps/opencode-plugin/agents apps/codex-plugin/agents -name '*navigator*'` → 0; `find apps/claude-plugin/agents apps/cursor-plugin/agents -name '*navigator*'` → 2 (one each).

## Confidence Impact

Pre-mortem reduced confidence from "high (mechanical rename is straightforward)" to "medium-high (mechanical rename is straightforward ONLY if case-sensitivity, persistence aliases, CI atomicity, and lockfile gating are enforced)". The 5 revisions above restore the confidence floor.