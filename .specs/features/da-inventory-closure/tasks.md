# DA Inventory Closure — Tasks

One atomic commit per task. Full battery on behavior-changing commits (T1, T3); docs/registry
commits run lint + the artifact's own checks. Order fixed; T10 is last-before-validation by
user instruction.

## Task table

| # | Task | Req | Write set | Gate |
|---|---|---|---|---|
| T1 | Export LLM seam from services barrel; suite gets pre-import scratch `XDG_CONFIG_HOME` + dynamic core import (design D1 REVISED — the seam alone provably does not gate the embedding path) + seam pin as the second gate; measure direct-run green under real config in the empty-config duration band; grep shipped `.d.ts` for both seam names (accepted exposure recorded); capture direct and wrapper counts separately | DI-01 AC-1..3 | `packages/core/src/services/index.ts`, `apps/mcp-client/src/__tests__/embedded-api-client-endpoints.test.ts` | full battery + direct `bun test` under real config + wrapper run, both counts recorded |
| T2 | Rewrite CLAUDE.md "Known outstanding case" paragraph (seam exported; wrapper hermetic since SEN-03/v1.10.0; workaround sentence retired) | DI-01 AC-4 | `CLAUDE.md` | lint; prose cites re-measured figures only |
| T3 | UNION GUARD wiring seam + end-to-end drop test + control; observed red on the `return 1` mutation, SHA-verified restore, record below | DI-02 AC-1..3 | `scripts/run-tests-parallel.ts`, `scripts/__tests__/run-tests-parallel.test.ts` | full battery; discrimination record in §Execution |
| T4 | FEATURES.json: `subagent-skills-plugin-parity` → complete, phases true, validation-citing note; diff additive-only | DI-03 | `.specs/project/FEATURES.json` | json round-trip parse + git diff review |
| T5 | STATE.md:2308 strike-and-annotate both stale clauses (BEH-01 cites; SEN-03 cites) | DI-04 | `.specs/project/STATE.md` | anchors exact-match; diff review |
| T6 | CLAUDE.md worktree-provisioning paragraph (failure signature verbatim, silent-install trap, two repairs, verify command) | DI-06 | `CLAUDE.md` | lint; signature grep-able |
| T7 | CONTRIBUTING "## Measurement discipline" + CLAUDE.md link line | DI-07 | `CONTRIBUTING.md`, `CLAUDE.md` | section present; single-source link |
| T8 | Lessons via lessons.py (read CLI contract first; L-001 closure/recurrence; tool-shaped diff only) | DI-08 | `.specs/lessons.json`, `.specs/LESSONS.md` | `git diff` shape check; `lessons.py status` |
| T9 | Commit .ua data files copied from main checkout (4 tracked mods + diff-overlay.json); token + trash excluded with reason in commit body; `git status --porcelain .ua/` captured immediately before AND after (gate finding 8 — a live dashboard can rewrite mid-window) | DI-09 | `.ua/*` | porcelain before/after both recorded |
| T10 | reports/ sweep per design D3's REVISED three-class disposition rule (measured population at gate time: **13 tracked files**, incl. sealed validation artifacts — left untouched by rule — and `docs/adding-a-host.md`); printed population must equal the live `git grep -l` count, 0 files without a disposition; then `git rm -r .specs/reports/` in the same commit as class-2 annotations; verify step re-greps post-commit | DI-10 | `.specs/reports/` + class-2 citing sites only | population==grep count; disposition list complete; post-commit re-grep |
| T11 | CHANGELOG entries (Added: wiring sensor; Fixed: seam export/known-outstanding closure, registry truth, STATE annotations, provisioning + measurement docs) | DI-11 | `CHANGELOG.md` | CONTRIBUTING heading→bump table respected (minor) |

Then: independent validation (verification-agent, author ≠ verifier) → `validation.md`.

## Test Coverage Matrix

| AC | Test |
|---|---|
| DI-01 AC-1 | import from `@massa-ai/core` compiles in the suite (build gate) |
| DI-01 AC-2 | direct `bun test embedded-api-client-endpoints.test.ts` under real config: 95 pass / 0 fail (was 93/2 cold) |
| DI-01 AC-3 | afterAll restores null (code review + no cross-suite failure in wrapper run) |
| DI-02 AC-1 | new test: drop probe id → exit 1 + `UNION GUARD FAIL` + id |
| DI-02 AC-2 | control: env unset → exit 0, byte-identical behavior |
| DI-02 AC-3 | mutation session: delete missing-branch `return 1` → new test red, all pre-existing green; restore SHA-verified |
| DI-03..DI-07, DI-09..DI-11 | artifact-level checks per task gate column |

## Gate Check Commands

```bash
bun run lint
bun run type-check
bun run build
bun run test                      # dedicated-DB triple + RUN_POSTGRES_TESTS per HANDOFF env facts
bun run test:scripts
bun run test:plugins
bun scripts/run-deterministic.ts
bun scripts/check-core-layering.ts
bun scripts/check-security-allowlist.ts
bun scripts/check-workflow-venue-parity.ts
```

Worktree note: native grammars were provisioned by copying `build/` dirs from the main
checkout (see HANDOFF Active); `verify-tree-sitter-grammars.test.ts` measured 9/0 after.

## Plan Challenge record (full gate, pre-mortem — run before Execute)

Verdict: **escalate_to_full: true — plan revised before Execute** (policy
`serious_findings: revise_plan`). Eight findings, three acted on structurally:

1. **critical, D1 mechanism** — `_setLlmEnabledForTesting` never gates
   `getVectorStore()`; `ensureInitialized` (`contextual-search-rlm.ts:209,244`) reaches the
   live `embeddingProviderFactory` (`vector-store-factory.ts:56`) unconditionally on both
   failing endpoints. **D1 rewritten**: pre-import scratch `XDG_CONFIG_HOME` + dynamic core
   import is the fix; the seam ships as the documented second gate, not the cure. The prior
   CLAUDE.md triage named the wrong single cause — recorded for the T2 rewrite.
2. **high, D1 fallback** — a `beforeAll` env pin arrives after the eager module-level config
   read; superseded by the pre-import dynamic-import shape (finding absorbed into 1).
3. **high, DI-10 population** — measured 13 tracked citing files vs the design's 3 named
   classes; two are sealed validation artifacts, one a published doc. **D3 rewritten** with the
   three-class disposition rule; T10's gate is population==grep count + 0 undispositioned.
4. **medium** — sweep self-reference ambiguity: closed by the written rule (classes 1-3).
5. **medium** — D2's mutation line cited `:315-318`; live tree has the missing-branch
   `return 1` at `:316`. Execution record will cite the live line measured at mutation time.
6. **medium** — seam names land in the published `.d.ts`: T1 greps the built `.d.ts` and
   records the exposure as accepted.
7. **low** — T1 records direct-run and wrapper-run counts separately.
8. **low** — T9 captures `.ua` porcelain before and after the commit.

## Execution record

(filled per task)
