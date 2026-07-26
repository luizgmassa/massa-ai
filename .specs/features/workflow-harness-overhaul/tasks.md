# Tasks — Workflow Harness Overhaul

Ordering is dependency-driven: removals first (they shrink the surface the
additions must cover), then the four new references, then the wiring sweep, then
the contract test that locks all of it, then the CHANGELOG.

One atomic commit per task. Gate must pass before the commit.

## Test Coverage Matrix

| Task | Requirements | Gate |
| --- | --- | --- |
| T1 | WHO-R1, R5 (partial) | `bun test scripts/__tests__/validate-repository.test.ts` |
| T2 | WHO-R2, R3, R4, R5 | `bun run test:scripts` |
| T3 | WHO-R5, R23 (existing suites) | `bun run test:scripts` + `bun run test:plugins` |
| T4 | WHO-R18, R20 | contract test (added T9) — manual read until then |
| T5 | WHO-R9, R10, R11, R12 | contract test (added T9) |
| T6 | WHO-R14, R15, R16 | contract test (added T9) |
| T7 | WHO-R7 | contract test (added T9) |
| T8 | WHO-R8, R13, R17, R19, R21, R22 | `bun run test:scripts` |
| T9 | WHO-R6, R23 + re-asserts R1–R21 | `bun test scripts/__tests__/workflow-harness-contract.test.ts` |
| T10 | WHO-R24 | CI CHANGELOG merge gate |

## Gate Check Commands

```bash
bun run test:scripts                      # scripts/__tests__ + scripts/tests
bun run test:plugins                      # 4 plugin bundles (invisible to turbo)
bun test scripts/__tests__/workflow-harness-contract.test.ts
bun run type-check                        # only if a .ts file changed (T3, T9, T2 generator)
```

`bun run lint` is a documented no-op in this repo — not a gate.

---

## T1 — Remove the chat-restart routes

**Delete**
- `skills/massa-ai/workflows/restart-save.md`
- `skills/massa-ai/workflows/restart-load.md`
- `skills/massa-ai/references/restart-state.md`

**Cut inbound edges**
- `skills/massa-ai/SKILL.md` — 2 router rows; routing precedence clauses 1, 2, 4;
  shared-reference list row; the `Never use recall as an artifact loader` sentence
  that names restart state
- `skills/massa-ai/workflows/spec-driven.md` — step 8 (restart split-chat routing)
- `skills/massa-ai/workflows/long-session.md` — restart handoff prose
- `skills/massa-ai/references/memory-policy.md`
- `skills/massa-ai/references/hook-enforcement.md`
- `skills/massa-ai/references/spec-driven/memory.md`
- `skills/massa-ai/personas/context-skill-harness-engineer-architect.md`
- `docs/massa-ai-spec-driven.md`
- `FEATURES.md` (MCP tool → workflow mapping rows)

**Commit**: `feat(skills)!: remove restart-save and restart-load workflows`

---

## T2 — Remove the agent-handoff route and the handoff-writer specialist

**Delete**
- `skills/massa-ai/workflows/agent-handoff.md`
- `skills/massa-ai/references/handoff-package.md`
- `skills/agents/handoff-writer/` (whole dir)
- `apps/claude-plugin/agents/massa-ai-handoff-writer.md`
- `apps/codex-plugin/agents/massa-ai-handoff-writer.toml`
- `apps/cursor-plugin/agents/massa-ai-handoff-writer.md`
- `apps/opencode-plugin/agents/massa-ai-handoff-writer.md`

**Edit**
- `scripts/generate-subagent-artifacts.ts` — drop `handoff-writer` from the roster
  array and the 3 model-hint maps
- `skills/AGENTS.md` — registry roster 16 → 15, drop the handoff-writer entry
- `skills/massa-ai/SKILL.md` — router row, precedence clause 2, reference-list row
- `skills/massa-ai/references/agent-orchestration.md`
- `AGENTS.md` (root) — roster line + `handoff-writer/` bullet
- `README.md`, `FEATURES.md` — roster prose, 4 model-hint tables, MCP mapping rows
- `install.sh` (6 strings), `scripts/install-agents.sh` (5 strings) — 16 → 15

**Verify**: `grep -rn "16 subagent\|16 [Ss]pecialist"` over tracked sources → 0 hits.

**Commit**: `feat(skills)!: remove agent-handoff workflow and handoff-writer specialist`

---

## T3 — Realign the guard tests to the 15-specialist roster

**Edit**
- `scripts/__tests__/subagent-parity.test.ts` — roster array + 4 model-hint maps,
  `toBe(16)` → `toBe(15)` (4 sites), header comment, FEATURES.md section-title assertion
- `scripts/__tests__/validate-repository.test.ts` — drop the 3 workflow paths from
  the required-file list, drop `handoff-writer` from the roster assertion, drop the
  `restart` reference assertions
- `apps/{claude,codex,cursor}-plugin/__tests__/install.test.ts` — roster + counts + stdout string
- `apps/opencode-plugin/src/__tests__/agents-install.test.ts` — same

**Gate**: `bun run test:scripts && bun run test:plugins` both green.

**Commit**: `test(harness): realign specialist guards to the 15-agent roster`

---

## T4 — Add `references/project-context.md`

Intake sweep, precedence order, dedupe guard, ignore-path contract, Context
Firewall delegation. (WHO-R18, R20)

**Commit**: `feat(skills): add project-context intake reference`

---

## T5 — Add `references/implementation-delivery.md`

7-stage chain (preflight → isolate → implement → push → propose → watch → repair →
ASK), per-stage command + failure branch + skip-reason enum, no size exemption,
merge-gate sentence, `gh`-absent degraded path, 3-iteration repair cap.
(WHO-R9, R10, R11, R12)

**Commit**: `feat(skills): add implementation delivery protocol reference`

---

## T6 — Add `references/code-annotation.md`

Language → doc-syntax table, created-or-updated trigger, the three-field rationale
template (Why / Impacts / Test), test-coverage obligation with the debug
regression-seam rule. (WHO-R14, R15, R16)

**Commit**: `feat(skills): add code annotation and test coverage reference`

---

## T7 — Add `references/root-cause-scripts.md`

Circling detector (≥2 failed attempts on one symptom, or a re-tested ruled-out
hypothesis), forbidden next actions, probe contract, escalation on unbuildable
probe. (WHO-R7)

**Commit**: `feat(skills): add root-cause proof script reference`

---

## T8 — Wire the four references into the harness

- All 35 workflows gain a `references/project-context.md` load line as an early step.
- The 16 implementation workflows additionally gain `references/implementation-delivery.md`,
  `references/code-annotation.md`, `references/root-cause-scripts.md`.
- The 19 non-implementation workflows gain **only** project-context.
- `skills/agents/builder/SKILL.md` and `skills/agents/test-engineer/SKILL.md` gain
  the root-cause reference; regenerate host artifacts if the generator embeds charter bodies.
- `skills/massa-ai/SKILL.md` shared-reference list gains the 4 new entries.

(WHO-R8, R13, R17, R19, R21, R22)

**Commit**: `feat(skills): wire context, delivery, annotation and root-cause references into all workflows`

---

## T9 — Add the harness contract test

`scripts/__tests__/workflow-harness-contract.test.ts` — 7 assertion groups from
`design.md` § Test design, deriving the workflow set from the filesystem.
Includes the negative control (long-session + `handoff_*` MCP tools survive).

Plus the two groups added by the Plan Challenge gate (`fool.md` findings 4 and 5):

8. **Invariant correctness, not just presence** — assert the *encoded decision
   values*: the circling threshold is literally two consecutive failed attempts;
   `implementation-delivery.md` forbids merging without user approval and states
   no size exemption; `code-annotation.md` maps every language it claims to map
   and lists all three rationale fields; `project-context.md` orders precedence
   with the nearest-ancestor rule above the repo root. A reference that ships the
   wrong threshold must fail.
9. **Roster-count regression guard** — repo-wide assertion that no tracked
   source, doc, or shell installer says `16 subagent` / `16 specialist`, covering
   `install.sh` and `scripts/install-agents.sh`, which have no existing gate.

**Gate**: suite green; then delete one load line locally, confirm exactly one
assertion fails (mutation check), restore. Repeat the mutation against the
circling threshold value to prove group 8 discriminates.

**Commit**: `test(skills): add discriminating workflow harness contract suite`

---

## T10 — CHANGELOG

`### Removed` (3 workflows, 1 specialist, 2 references) + `### Added` (4 references,
delivery protocol, contract suite) under `[Unreleased]`. Minor bump.

**Commit**: `docs(changelog): record harness overhaul`

---

## Delivery (per the protocol this feature adds — dogfooded)

1. Worktree `/Users/luizmassa/Projects/massa-ai-wt-harness` on
   `feat/workflow-harness-overhaul` from `origin/main` — **done**.
2. Atomic commit per task above.
3. `git push -u origin feat/workflow-harness-overhaul`.
4. `gh pr create --fill --base main`.
5. `gh pr checks --watch`.
6. Fix failing checks on the branch; cap 3 iterations.
7. **Stop and ask before merging.** No auto-merge.

## Sub-agent offer

10 tasks exceeds the ~8-task batch budget, so the offer fires. **Recommendation:
decline.** T1/T2/T3/T8 all write `SKILL.md`, `README.md`, `FEATURES.md`, and the
guard tests — the write sets are not disjoint, which is the precondition for
batch workers. Parallel workers would conflict on every shared registry file.
