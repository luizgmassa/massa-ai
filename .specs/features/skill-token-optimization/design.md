# Skill Token Optimization Design

Slug: `skill-token-optimization` · Session: `spec-skill-token-optimization`

## Design Summary

Three change families on the skill surface, then a compression pass, all inside
the isolated worktree `.claude/worktrees/skill-token-optimization` (branch
`spec/skill-token-optimization` from `main` @ `41daeb68`):

1. **Lazy-load extractions** — conditional blocks >3 lines move from workflow
   bodies into references loaded only when their trigger holds. Each move
   leaves a ≤3-line inline pointer naming the trigger; the trigger detection
   itself always stays inline (condition-detection-is-the-content rule).
2. **Validator top pack** — two new deterministic scripts replace inline
   model-run checklists: `validate_audit_report.ts` (schema, Area↔Prefix
   table, finding-ID format/uniqueness/sequencing — parameterized by prefix)
   and `validate_design.ts` (spec-driven design.md required sections +
   non-empty mitigation check). Nine `*-fix.md` workflows and the spec-driven
   design step call the scripts instead of restating the checks.
3. **Caveman compression** — prose-only compression of 36 workflows, 87
   references, 17 agent charters. Code blocks, commands, YAML/policy blocks,
   dispatch blocks, tables, file paths, finding-ID grammars, and protected
   literals are byte-preserved. No `*.original.md` backups (git is history).

Deterministic guard tooling ships first (T1) so every later task is
falsifiable: a reference-path resolver (every relative `references/…` /
`workflows/…` citation must exist) and a protected-literal inventory (literals
that content-coupled tests assert against skill files; compression must not
alter those spans).

## Tech Decisions

| # | Decision | Choice | Rejected |
| --- | --- | --- | --- |
| D1 | SonarQube home | New `references/sonarqube-mcp.md` (detection, firewall, normalization, ID mapping, skip reasons) | Folding into `audit-report-io.md` — that file is report-format-scoped and already large |
| D2 | Mobile/Figma intake gate home | New section in existing `references/mobile-context.md`; `figma-pre-analysis.md` untouched | New standalone reference — adds a file to 4 host bundles for content sharing mobile-context's trigger |
| D3 | Extraction threshold | >3 lines moves; ≤3 stays inline compressed | Move-everything — pointer ≈ clause cost below threshold |
| D4 | Audit-scope dedupe direction | `references/audit-scope.md` becomes the single home of the 5 scope-resolution branches; 6 audit workflows keep branch names + pointer | Keeping both (status quo) — strongest measured duplication in scan |
| D5 | SKILL.md graceful-degradation | Table moves to new `references/graceful-degradation.md`; SKILL.md keeps a 2-line load-on-failure rule | Full retention — table is reactive-only content billed every session |
| D6 | Protected spans | Scripted inventory from `scripts/__tests__/*.ts`, `scripts/*.ts` generators/hooks, and `skills/massa-ai/scripts/*.ts` literals cross-matched against skill files; embedded in worker packets; enforced by re-running the coupled tests per task | Eyeballing — the exact defect class the repo's lessons warn about |
| D7 | Worker topology | 2 sequential `massa-ai-builder` Phase workers (T2–T7, T8–T11) operating in this worktree; main agent does T1 first, then T12 + verification. Workers run branch-check (`git rev-parse --abbrev-ref HEAD` = `spec/skill-token-optimization`) before every commit | Parallel workers — same-file write sets collide; a shared checkout's branch can move under a running agent |
| D8 | Bundle regen cadence | `bun scripts/generate-skill-artifacts.ts` inside every task that touches `skills/`, same commit | End-of-phase regen — leaves intermediate commits failing `--check` |
| D9 | Validator placement | `skills/massa-ai/scripts/` beside `validate_spec.ts`; tests appended to `scripts/__tests__/spec-driven-validators.test.ts` pattern (new file `audit-report-validators.test.ts` for the audit one) | `scripts/` root — these are skill-runtime contracts, shipped with the skill |
| D10 | Compression batches | Workflows / references-top / references-subdirs / agents as 4 tasks, committed per task | One mega-task — unreviewable diff, no bisection |

## Risks & Concerns

| Risk | Mitigation |
| --- | --- |
| Compression breaks a literal a test/generator/validator matches | T1 inventory + per-task run of the coupled test set; `--check` regen in-commit |
| A moved rule silently drops or duplicates | Per-move diff discipline: extracted section reviewed against source block; verification-agent re-derives rule survival evidence-or-zero |
| Pointer loses the trigger (agent never loads the reference) | Trigger sentence always stays inline; only the conditional *body* moves |
| `workflow-metadata-headers` uncommitted tree collides | This worktree never touches the main checkout; user sequenced this feature first |
| main moved during the session (model-profile-switching landed; generator now covers `skills/profile/`) | Delivery task rebases onto `origin/main` before PR; regen re-runs post-rebase |
| Worker weakens a gate to pass | Charter forbids; verification-agent discrimination sensor; protected validation assets listed in worker packets |
| validate_audit_report false-positives on the 9 existing report formats | Red-first tests include fixture reports (valid + each violation class) before wiring workflows |

## Verification Recipe

Per task: targeted coupled tests + `bun scripts/generate-skill-artifacts.ts`
(regen, then `--check` → 0) + path resolver green. Final (T12):
`bun run test:scripts`, `bun run lint`, `--check` 0, scripted before/after
byte measurement from git states, `check_specs_delivered.ts`.
