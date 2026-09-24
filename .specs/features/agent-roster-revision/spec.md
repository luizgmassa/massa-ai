# Agent Roster Revision Specification

- Feature slug: `agent-roster-revision`
- workflowSessionId: `feature-agent-roster-revision`
- projectId: `massa-ai`
- Workflow: `feature` (explicit route), Spec-driven tier artifacts
- Branch / worktree: `feat/agent-roster-revision` @ `origin/main` `11fb8bb1`, `~/Projects/massa-ai-feat-agent-roster-revision`

## Problem Statement

The seven-agent roster shipped by `agent-roster-consolidation` carries modes no workflow
dispatches (`code-reviewer guide`, `code-explorer lookup`, `product-manager requirements`,
`test-engineer plan`), two near-duplicate mode pairs (`code-reviewer review`/`audit`,
`product-manager requirements`/`audit`), charters whose every dispatch pays for mode
contracts it never runs (`judge`, `designer`, `test-engineer`), a `profile` skill the owner
no longer wants, and a 20 KB router that restates guidance owned by references and by the
`skills/AGENTS.md` bootstrap block.

## Decisions (owner, 2026-09-23)

| # | Question | Decision |
|---|---|---|
| D1 | Lens for merged diff review | New `code-reviewer` `audit` lens `diff` |
| D2 | Lazy-load transport | Mode contracts live at `skills/massa-ai/references/agent-modes/<agent>/<mode>.md`; the dispatching main agent reads the file and inlines it into the packet as `mode_contract` |
| D3 | Home of `guide` responsibilities | Dropped. Architecture findings → `audit` `lens: architecture`; mobile guidance → main agent loads `references/mobile-context.md` |
| D4 | product-manager in spec-driven | `audit` dispatch runs in **every** Specify phase, over the drafted `spec.md` |

Assumptions (stated, not asked):

- A1 "judge: lazy load all four modes" = four contract files `judge/spec-author.md`, `judge/scorer.md`, `judge/plan-critique-lite.md`, `judge/plan-critique-full.md`; the packet `mode` stays `plan-critique` and `depth` selects the lite or full file.
- A2 "Remove the profile skill" = `skills/profile/` only. The switch engine, MCP `profile_list`/`profile_set`, and `massa-ai-config profile` CLIs stay.
- A3 `code-explorer` keeps `trace` as its only mode (dispatch blocks keep `mode: trace`; the dispatch-mapping test requires a mode heading); missing mode defaults to `trace`.
- A4 `test-engineer` `mode` becomes required (its default was `plan`).

## Requirements

### REN — builder → senior-engineer
- REN-01 `skills/agents/builder/` is renamed to `skills/agents/senior-engineer/`; frontmatter `name: senior-engineer`.
- REN-02 Every dispatch block, registry row, model-profile override key, generator constant (`WRITE_AGENTS`), charter cross-reference, and doc naming the agent uses `senior-engineer`.
- REN-03 `skills/AGENTS.md` retired-agent mapping gains `builder → senior-engineer`; `docs/removed-features.md` records the rename.
- REN-04 Legacy prefixed-name lists (`massa-ai-builder`) are unchanged; installers prune an installed owned `builder.*` on reinstall (existing prune loop).
- REN-05 A user registry overlay keyed `builder` keeps applying: overlay loading maps the renamed key to `senior-engineer` (plan-critique challenge 4; `resolveAgent` never validates names, so an unmapped key would silently stop applying).

### PRO — profile skill removal
- PRO-01 `skills/profile/` is deleted; no generator, installer, or harness verifier ships or expects it.
- PRO-02 `profile` joins `RETIRED_BUNDLE_ROOTS` and `RETIRED_SKILL_NAMES` so stale bundles and installed copies are pruned.
- PRO-03 The MCP tools and CLIs are untouched; docs stop advertising a `/profile` skill.

### REV — code-reviewer
- REV-01 `guide` mode is deleted; every route to it is repointed per D3.
- REV-02 `review` merges into `audit`; `audit` gains lens `diff` (bugs, regressions, smells, missing edge cases over a diff; ranked findings, blocking vs advisory).
- REV-03 All 13 former `review` dispatch blocks become `mode: audit` with `lens: diff`; the review Role Default and the verification-ladder intentional-cost sentence follow.

### EXP — code-explorer
- EXP-01 `lookup` mode is deleted; `trace` is the sole mode and the default.

### DES — designer
- DES-01 New read-only `trace` mode: design-source investigation (Figma MCP composition, product context, partition proposal).
- DES-02 `audit`, `implement`, `trace` contracts are lazy-loaded per D2.
- DES-03 `references/figma-pre-analysis.md` Stage 1 dispatches `designer` in `trace` mode instead of `code-explorer`.

### JDG — judge
- JDG-01 `spec-author`, `scorer`, `plan-critique` lite, `plan-critique` full contracts are lazy-loaded per D2 and A1.

### PMG — product-manager
- PMG-01 `requirements` merges into `audit`: one requirements lens over either a requirement set/spec or an implementation target.
- PMG-02 spec-driven Specify dispatches `product-manager` `audit` every run over the drafted `spec.md` (D4); `references/spec-driven/sub-agents.md` records the read-only carve-out from "Planning: do not delegate".

### TST — test-engineer
- TST-01 `plan` mode is deleted; `mode` is required.
- TST-02 `audit` and `fix` contracts are lazy-loaded per D2.

### LZY — lazy-load mechanism
- LZY-01 The inline rule is stated once in the router Core Contract (the only file every dispatching session loads); `references/agent-orchestration.md` defines the `mode_contract` packet field; dispatch blocks do not restate the rule. The router's Plan Challenge Gate names `judge/plan-critique-lite.md` and `judge/plan-critique-full.md`.
- LZY-02 A lazy charter keeps one `### Mode: \`<name>\`` stub per mode naming exactly its own contract file; a packet without `mode_contract` for a lazy mode returns `Blocked`.

### RTR — router slim
- RTR-01 `skills/massa-ai/SKILL.md` drops content owned elsewhere: Dedupe Guard (bootstrap block), tool inventory (`mcp-tools.md`), plan-challenge detail (policy + `the-fool.md`), retrieval sequence (`mcp-tools.md`/`codebase-investigation.md`), memory tag detail (`memory-policy.md`), the Shared References list; single statement of the freshness and recall-budget rules.
- RTR-02 Workflow table and deterministic precedence stay intact.
- RTR-03 `skill-size-budgets.test.ts` ceiling for the router drops to the new size plus a small margin.

## Acceptance Criteria

- AC1 `bun run generate:artifacts -- --check` exits 0; every host `agents/` ships exactly 7 agents including `senior-engineer` and no `builder`; no host bundle contains `skills/profile/`.
- AC2 `git grep -nE "mode: \`(guide|lookup|requirements|plan|review)\`"` over `skills/` returns nothing, and no charter declares those modes.
- AC3 Every lazy mode (designer ×3, judge ×4 files, test-engineer ×2) has a contract file under `skills/massa-ai/references/agent-modes/`, a stub in its charter citing exactly that file, and the contract-preservation fixture fields for that mode resolve inside that same file. Observed red: swapping two stub paths fails the test.
- AC3b The router Core Contract carries the inline rule and the Plan Challenge Gate names both judge plan-critique files; a sweep printing every lazy-mode dispatch site (designer, judge, test-engineer) shows each is reachable from the router rule.
- AC4 spec-driven Specify contains a `product-manager` `audit` dispatch block; `figma-pre-analysis.md` Stage 1 names `designer` `trace`.
- AC5 Router `SKILL.md` ≤ 13,000 B (from 20,254 B), with the workflow table and six precedence rules byte-identical to before. Section budget: frontmatter+intro 1.3 KB, Core Contract 2.4 KB, Session 0.9 KB, Workflow Router 6.8 KB (frozen), Plan Challenge 0.9 KB, Retrieval/Persistence/Degradation/Completion 0.7 KB.
- AC6 `bun run lint`, `bun run type-check`, `bun run test`, `bun run test:scripts`, and `bun run test:plugins` pass, run in the foreground.
- AC7 `git grep -nw builder -- ':!.specs' ':!CHANGELOG.md'` prints its full match list and every hit is on an allowlist: legacy `massa-ai-builder` names, the retired-agent mapping row, `removed-features.md`, the REN-05 alias, and unrelated uses ("query builder", test data).

## Out of Scope

- Renaming `.specs/` historical records (frozen).
- Changing the profile-switch engine's no-delete behavior (a pre-reinstall `profile set` can leave a stale `builder.md`; the next install prunes it).
- Lazy-loading `code-reviewer`, `product-manager`, `code-explorer`, or `senior-engineer` contracts.

## Plan

`3 Phases = 12 Tasks`

- **Phase 1 — Rename and removal** (`1 Phase = 2 Tasks`)
  - T1 builder → senior-engineer (REN-01..04)
  - T2 remove the profile skill (PRO-01..03)
- **Phase 2 — Router slim, lazy-load mechanism, mode edits** (`1 Phase = 8 Tasks`)
  - T3 router slim + budget ceiling (RTR-01..03) — first, so later tasks edit the slimmed text once
  - T3b lazy-load mechanism (LZY-01..02) + stub-to-file binding test (AC3, AC3b)
  - T4 code-reviewer (REV-01..03)
  - T5 code-explorer (EXP-01)
  - T6 product-manager + spec-driven wiring (PMG-01..02)
  - T7 test-engineer (TST-01..02)
  - T8 designer + figma-pre-analysis (DES-01..03)
  - T9 judge (JDG-01)
- **Phase 3 — Close-out** (`1 Phase = 2 Tasks`)
  - T11 docs, CHANGELOG `[Unreleased]`, regenerated artifacts, full gates
  - T12 independent verification (`code-reviewer` `verify`), `validation.md`, PR

Each task = one commit after its gate (targeted suites + `generate:artifacts --check`). T1's gate is widened (plan-critique challenge 3): `test:scripts`, `test:plugins`, the web-ui suite, and the AC7 grep, in the foreground.

## Plan Challenge (full, `pre_mortem`, 2026-09-23)

Fresh-eyes critic (general-purpose sub-agent under the `judge` `plan-critique` contract; `judge` itself is absent from this session's installed, pre-consolidation plugin). 3 high + 2 medium findings, all revised in: AC5 re-budgeted to a measured 13,000 B; inline rule moved to the router (AC3b) with judge file names fixed; T1 gate widened + AC7; REN-05 overlay alias; stub-to-file binding with an observed red. Accepted risk: a plugin update that ships stub charters before the repo-route `skills/massa-ai` has `agent-modes/` yields a loud `Blocked`, not a silent pass.
