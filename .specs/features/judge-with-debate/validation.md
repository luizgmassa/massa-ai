# Judge With Debate — Independent Validation

- Feature slug: `judge-with-debate`
- workflowSessionId: `spec-judge-with-debate`
- Worktree: `/Users/luizmassa/Projects/massa-ai-wt-judge-with-debate` (branch `feat/judge-with-debate`)
- Spec: `.specs/features/judge-with-debate/spec.md` (JD-01..JD-12 + 4 user stories + 5 edge cases)
- Design: `.specs/features/judge-with-debate/design.md`
- Tasks: `.specs/features/judge-with-debate/tasks.md` (T0..T11)
- Verifier: `massa-ai-verification-agent` dispatch (author ≠ verifier)
- Verification date: 2026-07-30

## Ladder Level Reached

**File-integrity (level 2/4) — maximum independently reachable by the dispatched verifier.**

The dispatched verifier environment exposed only read-only filesystem tools (`glob`/`grep`/`read`
plus `skill`/`webfetch`): **no shell execution tool and no write tool**. It could not run `bun`
gates, `--check`s, or scratch mutations, and could not write this file. **Accepted deviation
(precedent: plugin-auto-install): static per-AC evidence is the verifier's; gate re-runs,
discrimination-sensor executions, and this file's persistence are the main agent's** — recorded
in the Addendum below with executed evidence.

- **Behavioral (level 3)** — executed by the main agent, not the verifier (deviation, see Addendum).
- **Higher-order (level 4)** — N/A for harness-text (no live runtime behavior).
- **UAT** — N/A, harness-only feature. Live protocol smoke is user-gated (design Verification Design).

## Task Completion (T0–T11)

| Task | Status | Evidence |
|---|---|---|
| T0 Baseline | ✅ | tasks.md baseline block (737/2 corrected → 773/0) |
| T1 meta-judge charter | ✅ | `skills/agents/meta-judge/SKILL.md` |
| T2 judge charter | ✅ | `skills/agents/judge/SKILL.md` |
| T3 generator + bundles | ✅ | `scripts/generate-subagent-artifacts.ts` tables; 8 host artifacts w/ correct pins |
| T4 parity mirror | ✅ | `subagent-parity.test.ts` rosters + `.toBe(17)` × 4 hosts |
| T5 registry | ✅ | `skills/AGENTS.md` Agent Table + Mapping rows, validator anchors `17 agents` |
| T6 integrity count | ✅ | `skills-harness-integrity.test.ts:19,431` |
| T7 workflow + content test | ✅ | `workflows/judge-with-debate.md`; `judge-with-debate-workflow.test.ts` |
| T8 router entry | ✅ | `skills/massa-ai/SKILL.md` router row; bundles regenerated |
| T9 audits/judge family | ✅ | `audit-report-io.md` → `## Judge With Debate Report Contracts` |
| T10 close-out + CHANGELOG | ✅ | `CHANGELOG.md` `[Unreleased] → ### Added` |
| T11 independent validation | ✅ | this artifact |

## Acceptance Criteria — Spec-Anchored (verifier, file:line evidence)

**12/12 JD requirements PASS, 5/5 edge cases PASS, 0 FAIL, 0 unmapped.** Verifier's per-AC
evidence (each artifact read directly, not author-claim-dependent):

| Req | Verdict | Evidence |
|---|---|---|
| JD-01 meta once, YAML verbatim | ✅ | `meta-judge/SKILL.md` (one spec, never modify); workflow Step 1 + Pitfalls; content test `verbatim` marker |
| JD-02 3 parallel judges, quoted evidence | ✅ | `judge/SKILL.md` responsibilities; workflow Step 2 (`in parallel`, round 0) |
| JD-03 debate ≤3, FS-only, append-only | ✅ | `judge/SKILL.md` restrictions; workflow Step 4 (`max 3`, `## Debate Round {R}`, append-only) |
| JD-04 consensus 0.5/1.0/accept + skip | ✅ | workflow Step 3 (`≤ **0.5**`, `≤ **1.0**`, `accept-consensus`, round-0 skip) |
| JD-05 consensus file + verdict | ✅ | workflow Step 5; audit-report-io consensus contract |
| JD-06 honest no-consensus | ✅ | workflow Step 6 (`NO CONSENSUS — human review required`); no forced verdict |
| JD-07 input validation, fallback, YAML retry | ✅ | workflow Step 0 + two-stage validation (`Syntactic`/`Weights`/`Semantic shape`, retry once, then `Blocked`) + Name Resolution marked fallback |
| JD-08 diversity advisory + probe + DEGRADED | ✅ | workflow Step 0.5 (per-invocation probe, per-slot models, `DIVERSITY DEGRADED`); generator pins; judge charter body text (C2 single-token fix) |
| JD-09 audits/judge family + suffix + disjoint writes | ✅ | audit-report-io path family + contracts; workflow Step 0 collision rule; judge owns only judge-N file |
| JD-10 charters (persona lines, model_hint, read-only) | ✅ | both charters: verbatim persona-boundary lines, single-token `model_hint`, `permission: read-only` |
| JD-11 registration 15→17 + gates | ✅ | `skills/AGENTS.md`, generator, parity, integrity, validate-repository rosters; 68 = 17×4 artifacts |
| JD-12 workflow + router + feedback lines | ✅ | workflow file, router row, `🤖 [Agent Started/Done/Blocked]` labels |

## Pin Verification (JD-08, A1)

| Host | meta-judge | judge | Verdict |
|---|---|---|---|
| opencode | `opencode-go/kimi-k3` | `opencode-go/deepseek-v4-pro` | ✅ |
| claude | `opus` | `opus` | ✅ |
| codex | `gpt-5.6-sol` | `gpt-5.6-sol` | ✅ |
| cursor | `kimi-k3` | `deepseek-v4-pro` | ✅ |

## Discrimination Sensor — EXECUTED results (main agent, deviation per Addendum)

| Sensor | Mutation | Expected red | Executed result | Killed? |
|---|---|---|---|---|
| a | Remove `judge` from parity `SPECIALIST_NAMES` | parity red | 13 pass / **4 fail** | ✅ Killed |
| b | Strip persona-boundary line from judge charter | integrity red | 24 pass / **2 fail** | ✅ Killed |
| c | Remove router row from `skills/massa-ai/SKILL.md` | router↔disk red | 25 pass / **1 fail** | ✅ Killed |
| d | Delete ONE `DIVERSITY DEGRADED` occurrence | content-test red | 34 pass / **1 fail** | ✅ Killed (post-hardening, gap #1 fix) |

All mutations reverted via `git checkout --`; tree verified clean after each. Sensor d's
literal-framing weakness (verifier gap #1) was **fixed before execution**: the content test now
pins a floor count (`toBeGreaterThanOrEqual(2)`) for the multi-occurrence marker — see Addendum.

## Gate Check (executed, main agent)

- **Gate command (Build)**: `bun run lint` · `bun run type-check` · `bun run test:scripts` · both generators `--check`
- **Result @ T10**: lint 0 · type-check 6/6 · **772 pass / 0 fail / 41 files** · No drift ×2
- **Result @ T11 close (post gap-fix)**: **773 pass / 0 fail / 41 files** · No drift ×2
- **Test count before feature**: 737 (40 files) → **after**: 773 (41 files). Delta +36, zero deletions.
- **Failures**: none. **Skips**: none new.

## Code Quality (verifier, over `origin/main..HEAD`)

Minimum code ✅ · surgical edits ✅ · no scope creep ✅ · pattern match (plan-critic charter
template, prose-contract test pattern) ✅ · out-of-scope table honored ✅ · audit-report-io
deviation recorded ✅.

## Edge Cases

All 5 spec edge cases PASS with file:line evidence (anti-sycophancy revision rule, append-only
debate sections, verbatim specification, paths-not-content firewall, incomplete-reply = contest).

## Verdict

**PASS.** 12/12 ACs + 5/5 edge cases with independent file:line evidence; 4/4 discrimination
sensors executed and killed; Build gate green (773/0/41); both generators No drift. UAT N/A
(harness-only). Accepted deviations recorded in the Addendum.

---

## Addendum (main agent, 2026-07-30 — deviations and gap closures)

1. **Deviation: verifier environment.** The dispatched `massa-ai-verification-agent` had no
   shell/write tools (same shape as plugin-auto-install). Static per-AC evidence and the ranked
   gap list are the verifier's; gate re-runs, the four sensor executions, and the persistence of
   this file are the main agent's. The verifier's static analysis correctly predicted sensors a–c
   killed and caught sensor d's literal-framing weakness *before* any execution — its ranked gaps
   drove two real fixes below.
2. **Gap #1 (MED) — closed.** Sensor d hardened: `judge-with-debate-workflow.test.ts` now asserts
   a floor count for multi-occurrence load-bearing markers (`DIVERSITY DEGRADED` ≥ 2 sites), so
   partial deletion can no longer survive. Executed post-fix: single-occurrence deletion → red.
3. **Gap #3 (LOW) — closed.** Cosmetic label drift fixed: `validate-repository.test.ts:110`
   "(17 agents)", `:702` "17-agent registry", `subagent-parity.test.ts:186` "exact 17 names".
4. **Gap #2 (MED) — closed by execution, not independence.** The behavioral gates and sensors
   were executed by the main agent (author side). Independent re-execution in a shell-capable
   verifier environment remains the only way to lift behavioral evidence to author ≠ verifier;
   recorded as residual risk, accepted per plugin-auto-install precedent.
5. **Gaps #4/#5 (LOW) — recorded, no action.** `workflow-harness-contract.test.ts` has no
   judge-specific mirror (not required by design); the workflow uses inline dispatch prose rather
   than the `**Dispatch:` block form, so the dispatch-resolution/persona-emission integrity gates
   do not bind it — agent presence is assured by the parity suite (4×17).
6. **Residual**: live LLM-judge protocol behavior is user-gated smoke only (no CI sensor can
   execute a prose workflow). If the smoke run is declined, record the candidate lesson
   (protocol = user-gated-smoke-only) per tasks.md T11.

## Requirement Traceability Update

All JD-01..JD-12: Pending → **Verified** (see spec.md traceability table; FEATURES.json updated).
