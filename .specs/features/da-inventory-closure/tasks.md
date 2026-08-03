# DA Inventory Closure — Tasks

One atomic commit per task. Full battery on behavior-changing commits (T1, T3); docs/registry
commits run lint + the artifact's own checks. Order fixed; T10 is last-before-validation by
user instruction.

## Task table

| # | Task | Req | Write set | Gate |
|---|---|---|---|---|
| T1 | Export LLM seam from services barrel; pin embedded suite; measure direct-run green under real config (cold baseline 93/2 recorded) | DI-01 AC-1..3 | `packages/core/src/services/index.ts`, `apps/mcp-client/src/__tests__/embedded-api-client-endpoints.test.ts` | full battery + direct `bun test` on the suite under real config + wrapper run |
| T2 | Rewrite CLAUDE.md "Known outstanding case" paragraph (seam exported; wrapper hermetic since SEN-03/v1.10.0; workaround sentence retired) | DI-01 AC-4 | `CLAUDE.md` | lint; prose cites re-measured figures only |
| T3 | UNION GUARD wiring seam + end-to-end drop test + control; observed red on the `return 1` mutation, SHA-verified restore, record below | DI-02 AC-1..3 | `scripts/run-tests-parallel.ts`, `scripts/__tests__/run-tests-parallel.test.ts` | full battery; discrimination record in §Execution |
| T4 | FEATURES.json: `subagent-skills-plugin-parity` → complete, phases true, validation-citing note; diff additive-only | DI-03 | `.specs/project/FEATURES.json` | json round-trip parse + git diff review |
| T5 | STATE.md:2308 strike-and-annotate both stale clauses (BEH-01 cites; SEN-03 cites) | DI-04 | `.specs/project/STATE.md` | anchors exact-match; diff review |
| T6 | CLAUDE.md worktree-provisioning paragraph (failure signature verbatim, silent-install trap, two repairs, verify command) | DI-06 | `CLAUDE.md` | lint; signature grep-able |
| T7 | CONTRIBUTING "## Measurement discipline" + CLAUDE.md link line | DI-07 | `CONTRIBUTING.md`, `CLAUDE.md` | section present; single-source link |
| T8 | Lessons via lessons.py (read CLI contract first; L-001 closure/recurrence; tool-shaped diff only) | DI-08 | `.specs/lessons.json`, `.specs/LESSONS.md` | `git diff` shape check; `lessons.py status` |
| T9 | Commit .ua data files copied from main checkout (4 tracked mods + diff-overlay.json); token + trash excluded with reason in commit body | DI-09 | `.ua/*` | `git status` clean for included set |
| T10 | reports/ content sweep (`git grep "\.specs/reports/"` = 0 unannotated) then `git rm -r .specs/reports/` | DI-10 | `.specs/reports/` + citing sites | sweep printed population + verdict |
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

## Execution record

(filled per task)
