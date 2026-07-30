# Judge With Debate Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `massa-ai` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/judge-with-debate/design.md`
**Status**: Draft (awaiting user approval)

---

## Project Testing Guidelines Scan

Guidelines found: repo `AGENTS.md` (Tech Stack: `bun test`, `bun run test:scripts`, `bun run type-check`, `bun run lint`); `skills/AGENTS.md` → *How to Add an Agent* steps 4-5 (generator + parity enforcement); STATE.md SWU precedent (harness-text feature gates: integrity suite + both generators `--check` + `test:scripts` zero new failures vs baseline). Harness-text feature: the "product code" is Markdown charters/workflow/registry text plus generator name/model tables; the enforcing test suites already exist and are extended in-task (test co-location = roster/count edits inside the same task as the registration edits).

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `AGENTS.md`, `skills/AGENTS.md`, STATE.md SWU precedent.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Charter/workflow/registry Markdown | integrity (structural) | Persona-boundary lines verbatim, charter sections, dispatch-name resolution, agent count 17 | `scripts/__tests__/skills-harness-integrity.test.ts` | `bun run test:scripts` |
| Generator name/model tables | parity (generated-artifact) | 17 × 4 hosts emitted, per-host model pins mirrored in spec tables, no drift | `scripts/__tests__/subagent-parity.test.ts` | `bun run test:scripts` |
| Workflow prose contract | content (structural markers) | Load-bearing markers present: thresholds 0.5/1.0, ≤3 rounds, `DIVERSITY DEGRADED` + capability probe, two-stage YAML validation, reply-block schema, firewall rule, append-only, no-consensus path, `audits/judge/` naming, prefixed dispatch names | `scripts/__tests__/judge-with-debate-workflow.test.ts` | `bun run test:scripts` |
| Generated host bundles | drift check | Both generators `--check` = No drift | `apps/{opencode,claude,codex,cursor}-plugin/**` | `bun scripts/generate-subagent-artifacts.ts --check`; `bun scripts/generate-skill-artifacts.ts --check` |
| Spec/plan artifacts (`.specs/`) | none | Review + independent validation | — | — |

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After each task | `bun test scripts/__tests__/skills-harness-integrity.test.ts scripts/__tests__/subagent-parity.test.ts` |
| Full | After T9 (pre-close) | `bun run test:scripts` |
| Build | T10 close-out | `bun run lint && bun run type-check && bun run test:scripts && bun scripts/generate-subagent-artifacts.ts --check && bun scripts/generate-skill-artifacts.ts --check` |

Baseline (captured T0, 2026-07-29, worktree `../massa-ai-wt-judge-with-debate` @ origin/main + planning commit `1eb314f`, tracked state):

- `bun run lint`: 0 errors
- `bun run type-check`: 6/6 successful
- `bun scripts/generate-subagent-artifacts.ts --check`: No drift
- `bun scripts/generate-skill-artifacts.ts --check`: No drift
- `bun run test:scripts`: **737 pass / 1 fail across 40 files** — the 1 fail is the pre-existing
  environmental `__zzz_crash_signal_probe` crash suite (documented environmental in STATE.md);
  zero other failures. Zero-new-failures rule is measured against this.

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 0: Baseline

T0

### Phase 1: Charters

T1 → T2

### Phase 2: Registration

T3 → T4 → T5 → T6

### Phase 3: Workflow + Reports

T7 → T8 → T9

### Phase 4: Close-out

T10 → T11

---

## Task Breakdown

### T0: Capture pre-feature baseline

- **What**: Record baseline gate evidence into this file: `bun run test:scripts` pass/fail counts, both generators `--check`, `bun run lint`, `bun run type-check`.
- **Where**: `.specs/features/judge-with-debate/tasks.md` (append baseline block)
- **Depends on**: None
- **Requirement**: verification foundation (JD-11 precedent: zero-new-failures rule needs a baseline)
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: baseline block written with exact counts from the worktree (tracked state — SWU lesson: verify in the state it ships in)
- **Tests**: none (matrix: `.specs/` layer) — **Gate**: none (evidence capture)
- **MCP/skill question**: none material. **Validation command**: n/a (artifact check: block exists with 5 numbers)

### T1: Create `meta-judge` charter

- **What**: `skills/agents/meta-judge/SKILL.md` per design C1: eval-spec YAML generation contract, once-per-evaluation semantics, read-only, `model_hint: kimi-k3`, persona-boundary lines verbatim (gate-enforced).
- **Where**: `skills/agents/meta-judge/SKILL.md`
- **Depends on**: T0
- **Reuses**: `skills/agents/plan-critic/SKILL.md` (template)
- **Requirement**: JD-01, JD-10
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: file exists with all template sections; both persona-boundary lines verbatim; frontmatter `name`, `description`, `metadata.model_hint`, `metadata.permission: read-only`; output contract = YAML-only artifact + standard wrapper
- **Tests**: integrity (structural) — **Gate**: quick (may stay red on count/dispatch checks until T5/T6 — record interim state)
- **Validation command**: `bun test scripts/__tests__/skills-harness-integrity.test.ts` (observe, record)
- **Commit**: `feat(harness): add meta-judge sub-agent charter`

### T2: Create `judge` charter

- **What**: `skills/agents/judge/SKILL.md` per design C2: evidence-quoted scoring, debate behavior, append-only restriction, anti-sycophancy, per-slot model diversity hint text, read-only.
- **Where**: `skills/agents/judge/SKILL.md`
- **Depends on**: T1
- **Reuses**: T1 charter shape
- **Requirement**: JD-02, JD-03, JD-10
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: as T1 + Restrictions include append-only, revision-requires-quoted-evidence, never-create-fresh-file-in-debate; `metadata.model_hint` is the **single token** `deepseek-v4-pro` (Plan Challenge C2 — Cursor emitter + parity assert the hint verbatim); per-slot diversity text (J1 deepseek-v4-pro / J2 minimax-m3 / J3 GLM-5.2) appears in the **body** Model Hint section only, never in frontmatter
- **Tests**: integrity (structural) — **Gate**: quick (interim state recorded)
- **Validation command**: `bun test scripts/__tests__/skills-harness-integrity.test.ts`
- **Commit**: `feat(harness): add judge sub-agent charter`

### T3: Register agents in generator + regenerate bundles

- **What**: Add `meta-judge`, `judge` to `SPECIALIST_NAMES` and per-host model tables in `scripts/generate-subagent-artifacts.ts` (Claude: opus/opus; Codex: gpt-5.6-sol/gpt-5.6-sol; OpenCode: opencode-go/kimi-k3, opencode-go/deepseek-v4-pro). Run `bun scripts/generate-subagent-artifacts.ts` to emit 4-host artifacts. This is the charters' DI/wiring — same task, per DI-01.
- **Where**: `scripts/generate-subagent-artifacts.ts`; regenerated `apps/{opencode,claude,codex,cursor}-plugin/agents/massa-ai-{meta-judge,judge}.*`
- **Depends on**: T2 (generator reads charters from disk for metadata)
- **Requirement**: JD-08 (generator pins), JD-11
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: generator emits 68 agent files (17 × 4); `--check` reports No drift for subagent artifacts; new files carry correct per-host model pins
- **Tests**: parity (generated-artifact; red until T4 mirrors tables — record interim) — **Gate**: quick
- **Validation command**: `bun scripts/generate-subagent-artifacts.ts --check`
- **Commit**: `feat(harness): register judge agents in subagent generator + regenerate bundles`

### T4: Mirror agents in parity suite

- **What**: Add both names to parity test `SPECIALIST_NAMES`, the PINNED model spec tables (CLAUDE/CODEX/OPENCODE mirrors), and `CHARTER_MODEL_HINTS` (`kimi-k3` / `deepseek-v4-pro` single tokens). Update hardcoded per-host count assertions (e.g. line ~195 `"cursor: exactly 15 specialist .md files"` and any sibling host counts) 15 → 17. `WRITE_AGENTS` untouched (both read-only).
- **Where**: `scripts/__tests__/subagent-parity.test.ts`
- **Depends on**: T3
- **Requirement**: JD-11
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: parity suite green at 17 × 4 with count assertions updated; zero remaining `"exactly 15"` strings in the file
- **Tests**: parity — **Gate**: quick → expect parity green; integrity may still flag registry/dispatch rows until T5/T6
- **Validation command**: `bun test scripts/__tests__/subagent-parity.test.ts` (17 agents, pass)
- **Commit**: `test(harness): mirror judge agents in subagent parity spec`

### T5: Register agents in `skills/AGENTS.md`

- **What**: Agent Table +2 rows (`meta-judge`, `judge`), Mapping table +2 rows (new capabilities), prose "15" → "17", validator anchors line updated.
- **Where**: `skills/AGENTS.md`
- **Depends on**: T2
- **Requirement**: JD-11
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: both rows present with dispatch names, permissions, model hints, triggers, charter paths; counts coherent
- **Tests**: integrity — **Gate**: quick
- **Validation command**: `bun test scripts/__tests__/skills-harness-integrity.test.ts` (registry checks pass)
- **Commit**: `docs(harness): register judge agents in sub-agent registry`

### T6: Update integrity suite agent count

- **What**: Update "15" references to 17 in `scripts/__tests__/skills-harness-integrity.test.ts` (line ~19 comment, line ~431 comment, any count assertions found at Execute).
- **Where**: `scripts/__tests__/skills-harness-integrity.test.ts`
- **Depends on**: T5
- **Requirement**: JD-11
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: integrity suite fully green with 17 agents
- **Tests**: integrity — **Gate**: quick → both suites green
- **Validation command**: `bun test scripts/__tests__/skills-harness-integrity.test.ts scripts/__tests__/subagent-parity.test.ts` (all pass)
- **Commit**: `test(harness): update integrity suite agent count to 17`

### T7: Create `judge-with-debate` workflow + co-located content test

- **What**: (a) `skills/massa-ai/workflows/judge-with-debate.md` per design C3: input validation, per-invocation host capability probe (JD-08 AC-4), meta-judge dispatch + two-stage YAML validation with enumerated defect names, Phase 1 parallel dispatches with per-slot model requests, stepwise consensus arithmetic, debate loop ≤3, Phase 3 synthesis-from-replies, no-consensus path, report naming + collision suffix, feedback labels, Name Resolution fallback, pitfalls section (base-skill documented pitfalls encoded), reply-block schema, report schemas (pointer to audit-report-io). (b) Co-located content test `scripts/__tests__/judge-with-debate-workflow.test.ts` asserting the load-bearing markers from the design Verification Design section (Plan Challenge C3). Note: T7 is the feature's largest artifact (~400+ lines prose) — single task kept because one prose contract must stay coherent; review attention highest here (Plan Challenge planning-fallacy note).
- **Where**: `skills/massa-ai/workflows/judge-with-debate.md`; `scripts/__tests__/judge-with-debate-workflow.test.ts`
- **Depends on**: T2
- **Reuses**: base skill @ `555b952` (protocol), `references/agent-orchestration.md` (packet + fallback)
- **Requirement**: JD-01..JD-09, JD-12
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: workflow covers every phase of the design mermaid; dispatch blocks carry prefixed names `massa-ai-meta-judge`/`massa-ai-judge` inline; `DIVERSITY DEGRADED` + capability-probe rule present; orchestrator-never-reads-judge-files rule present; new content test green; mutation spot-check: temporarily corrupting one marker (e.g. delete `DIVERSITY DEGRADED`) turns the new test red, then revert
- **Tests**: integrity (dispatch-resolution against shipped artifacts from T3) + content (new test, co-located per matrix) — **Gate**: quick
- **Validation command**: `bun test scripts/__tests__/skills-harness-integrity.test.ts scripts/__tests__/judge-with-debate-workflow.test.ts`
- **Commit**: `feat(harness): add judge-with-debate workflow + contract content test`

### T8: Add router entry

- **What**: Router table row in `skills/massa-ai/SKILL.md`: `judge-with-debate | standalone multi-judge debate evaluation of user-supplied artifacts | workflows/judge-with-debate.md`. DI of the workflow — same task as its registration point (workflow file landed T7; router is its only wiring).
- **Where**: `skills/massa-ai/SKILL.md`
- **Depends on**: T7
- **Requirement**: JD-12
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: row present; regenerated skill bundles still No drift (`generate-skill-artifacts.ts --check`)
- **Tests**: integrity — **Gate**: quick
- **Validation command**: `bun scripts/generate-skill-artifacts.ts --check`
- **Commit**: `feat(harness): route judge-with-debate in workflow router`

### T9: Add `audits/judge/` family to audit-report-io

- **What**: New section `## Judge With Debate Report Contracts` in `skills/massa-ai/references/audit-report-io.md`, implementing the design Data Models contract verbatim: `audits/judge/` path family (with recorded deviation from the `<...-audit>` suffix convention), per-judge report contract (freshness header, judge/model line, embedded eval-spec, per-criterion scores with quoted evidence, weighted overall, strengths/weaknesses, fidelity checklist, append-only debate-round sections), consensus/no-consensus report contract (score table, debate summary, final recommendation, diversity/local-fallback marks, fidelity checklist), explicit note that the family is evaluation-scored (no Findings section, finding-prefix table N/A, execution-input selection N/A).
- **Where**: `skills/massa-ai/references/audit-report-io.md`
- **Depends on**: T7 (workflow points at it)
- **Requirement**: JD-09
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: section present with all fields from the design contract; deviations recorded; `--check` No drift
- **Tests**: integrity (skill-artifact parity across bundles) — **Gate**: full (`bun run test:scripts`)
- **Validation command**: `bun run test:scripts` (zero new failures vs T0 baseline)
- **Commit**: `docs(harness): add audits/judge report family to audit-report-io`

### T10: Close-out gates + CHANGELOG

- **What**: Run full Build gate; add `[Unreleased]` CHANGELOG entry (harness contract text is shipped product — PAB D5 precedent); update STATE.md/HANDOFF.md/FEATURES.json progress.
- **Where**: `CHANGELOG.md`, `.specs/project/{STATE.md,FEATURES.json}`, `.specs/HANDOFF.md`
- **Depends on**: T8, T9
- **Requirement**: JD-11 (evidence), release hygiene
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: Build gate green end-to-end; baseline-vs-final counts recorded in tasks.md; CHANGELOG entry under `[Unreleased]`
- **Tests**: none new — **Gate**: build
- **Validation command**: `bun run lint && bun run type-check && bun run test:scripts && bun scripts/generate-subagent-artifacts.ts --check && bun scripts/generate-skill-artifacts.ts --check`
- **Commit**: `docs(harness): changelog + spec state for judge-with-debate`

### T11: Independent validation

- **What**: Dispatch `massa-ai-verification-agent` (author ≠ verifier): per-AC evidence for JD-01..12, discrimination sensors per design (a: roster removal → parity red; b: persona-line strip → integrity red; c: router-row removal → dispatch-resolution red; d: corrupt/delete a load-bearing workflow marker, e.g. `DIVERSITY DEGRADED` or the `0.5` threshold → new content test red). If the user declined the live protocol smoke run, record a candidate lesson via `lessons.py` marking protocol behavior as user-gated-smoke-only (Plan Challenge C3 residual). Writes `.specs/features/judge-with-debate/validation.md`.
- **Where**: `.specs/features/judge-with-debate/validation.md`
- **Depends on**: T10
- **Requirement**: all (spec-driven mandatory final gate)
- **Tools**: MCP: NONE. Skill: `massa-ai-verification-agent` dispatch
- **Done when**: validation.md carries PASS/FAIL verdict + per-AC evidence + sensor results; fix loop ≤3 or Blocked
- **Tests**: n/a — **Gate**: verdict artifact
- **Validation command**: verifier-chosen sensors per design Verification Design

---

## Phase Execution Map

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 0:  T0
Phase 1:  T1 ──→ T2
Phase 2:  T3 ──→ T4 ──→ T5 ──→ T6
Phase 3:  T7 ──→ T8 ──→ T9
Phase 4:  T10 ──→ T11
```

11 tasks total > 8 → at Execute, present the sub-agent batch offer (offer-then-confirm). Natural packing: Batch 1 = Phases 0-2 (T0-T6, 7 tasks), Batch 2 = Phase 3 (T7-T9, 3 tasks), validation T11 always by the verification-agent dispatch. Sequential regardless.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T0 | 1 artifact block | ✅ |
| T1 | 1 file | ✅ |
| T2 | 1 file | ✅ |
| T3 | 1 table edit + regeneration (DI co-located per DI-01) | ✅ |
| T4 | 1 test-file mirror | ✅ |
| T5 | 1 doc edit | ✅ |
| T6 | 1 test-file count edit | ✅ |
| T7 | 1 file | ✅ |
| T8 | 1 row + drift check | ✅ |
| T9 | 1 reference section | ✅ |
| T10 | gate run + changelog + state | ✅ |
| T11 | 1 validation artifact | ✅ |

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T0 | None | none | ✅ |
| T1 | T0 | P0→P1 | ✅ |
| T2 | T1 | T1→T2 | ✅ |
| T3 | T2 | T2→T3 | ✅ |
| T4 | T3 | T3→T4 | ✅ |
| T5 | T2 (shown after T4 in chain; body says T2 — diagram chain T3→T4→T5 implies T5 after T4) | T4→T5 | ⚠️ body T2 vs chain position — sequential execution makes T5 run after T4 regardless; dependency is genuinely T2 (registry rows need charters, not parity). Keep; chain order is execution order, not a dependency claim. ✅ |
| T6 | T5 | T5→T6 | ✅ |
| T7 | T2 (runs after T6 in chain; genuine dep is T2) | T6→T7 | ✅ (same reasoning) |
| T8 | T7 | T7→T8 | ✅ |
| T9 | T7 | T8→T9 (chain) | ✅ (genuine dep T7; chain order fine) |
| T10 | T8, T9 | T9→T10 | ✅ |
| T11 | T10 | T10→T11 | ✅ |

## Test Co-location Validation

| Task | Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T0 | `.specs/` artifact | none | none | ✅ |
| T1 | Charter Markdown | integrity | integrity | ✅ |
| T2 | Charter Markdown | integrity | integrity | ✅ |
| T3 | Generator tables + bundles | parity + drift | parity + `--check` | ✅ |
| T4 | Parity suite | parity | parity | ✅ |
| T5 | Registry Markdown | integrity | integrity | ✅ |
| T6 | Integrity suite | integrity | integrity | ✅ |
| T7 | Workflow Markdown | integrity (dispatch resolution) | integrity | ✅ |
| T8 | Router row | drift check | drift check | ✅ |
| T9 | Reference Markdown | full suite | full | ✅ |
| T10 | Changelog/state | build gate | build | ✅ |
| T11 | Validation artifact | verdict | verdict | ✅ |

**Requirement coverage**: JD-01 (T1,T7), JD-02 (T2,T7), JD-03 (T2,T7), JD-04 (T7), JD-05 (T7,T9), JD-06 (T7), JD-07 (T7), JD-08 (T3,T7), JD-09 (T7,T9), JD-10 (T1,T2), JD-11 (T3-T6,T10), JD-12 (T7,T8). 12/12 mapped.

---

## Plan Challenge — tasks

Full The Fool gate, mode `pre_mortem`, `massa-ai-plan-critic` subagent, `serious_findings: revise_plan`.
5 findings — 2 critical, 2 high, 1 medium — all independently verified against source by the main
agent before incorporation; **all 5 incorporated**:

1. **C1 (critical)** — `DIVERSITY DEGRADED` would be structurally always-on (normalization of
   deviance). Verified: no host has dispatch-time model selection. **Fixed**: per-invocation
   capability probe (spec A2 amended + JD-08 AC-4); the mark is per-run, reactivation automatic.
2. **C2 (critical)** — judge charter `model_hint` multi-slot text would break the Cursor artifact
   (`fm.model === CHARTER_MODEL_HINTS[name]` verbatim assertion, parity test). Verified at
   `subagent-parity.test.ts:85,312` + generator `emitCursor`. **Fixed**: single-token
   `metadata.model_hint` (`deepseek-v4-pro` / `kimi-k3`); per-slot text in charter body only.
3. **C3 (high)** — protocol logic shipped with zero automated sensors; the 3 planned discrimination
   mutations regressed *past* defects only (survivorship bias). **Fixed**: co-located content test
   `judge-with-debate-workflow.test.ts` asserting load-bearing prose markers (T7 + matrix row +
   4th T11 sensor); live LLM-judge smoke remains user-gated with a candidate-lesson fallback.
4. **C4 (high)** — `audits/judge/` contract was underspecified (findings-shaped template doesn't
   fit evaluation-scored reports). **Fixed**: full field-level contract in design Data Models
   (`## Judge With Debate Report Contracts`): required fields, checklist applicability (both
   files), path-shape deviation recorded, execution-input selection N/A.
5. **C5 (medium)** — meta-judge retry defect-naming unstated; syntactic vs semantic validation not
   distinguished. **Fixed**: two-stage validation + enumerated defect names in design §C3, wired
   into T7.

Bias observations recorded: planning fallacy in T7 sizing (accepted — one prose contract stays in
one task; flagged for review attention); overconfidence in the degradation mark (closed by C1 fix).

Early warning signs carried into Execute: stray `"15"` strings (parity line ~195 + integrity
comments); bare-role-name or prefix-typo dispatch blocks in T7; T11 PASS without the 4th sensor.
