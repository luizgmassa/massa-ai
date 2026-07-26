# Spec — Workflow Harness Overhaul

- projectId: `massa-ai`
- workflowSessionId: `spec-workflow-harness-overhaul`
- workflow: spec-driven (Large — Specify + Design + Tasks + Execute)
- branch: `feat/workflow-harness-overhaul`
- worktree: `/Users/luizmassa/Projects/massa-ai-wt-harness`
- base: `origin/main` @ `fd35379` (v1.3.1)

## Problem

Four gaps in the massa-ai agent harness:

1. Three workflows (`restart-save`, `restart-load`, `agent-handoff`) plus the
   `handoff-writer` specialist encode a manual chat-restart / context-handoff
   protocol that duplicates `.specs/` artifact state and the host's own
   compaction. They are dead weight in the router and cost context on every
   route decision.
2. When a builder/fixer agent loops on the same failing hypothesis, nothing in
   the harness forces it out of read-and-guess mode into producing real evidence.
3. Implementation workflows stop at "commit". Nothing enforces branch isolation,
   PR creation, CI observation, or merge — so verified work sits unmerged and
   uncontested by CI.
4. Nothing requires API doc comments, tests for changed code, or rationale
   comments; and no workflow is required to read the host/project context files
   (`.claude/`, `.cursor/`, `AGENTS.md`, `CLAUDE.md`, `README.md`) before acting.

## Requirements

### Removal — chat-restart and context-handoff surface

| ID | Requirement | Acceptance |
| --- | --- | --- |
| WHO-R1 | `workflows/restart-save.md` and `workflows/restart-load.md` are deleted, with `references/restart-state.md` | The three files do not exist; `git log` shows the deletion in one atomic commit |
| WHO-R2 | The `agent-handoff` workflow, the `handoff-writer` specialist charter, and `references/handoff-package.md` are deleted | `skills/massa-ai/workflows/agent-handoff.md`, `skills/agents/handoff-writer/`, `skills/massa-ai/references/handoff-package.md` do not exist |
| WHO-R3 | The four generated `massa-ai-handoff-writer.*` host artifacts are deleted and the generator no longer emits them | `apps/{claude,codex,cursor,opencode}-plugin/agents/massa-ai-handoff-writer.*` absent; `generate-subagent-artifacts.ts` has no `handoff-writer` key |
| WHO-R4 | The specialist roster is 15, not 16, in every registry, doc, installer string, and test | `grep -rn "16 subagent\|16 [Ss]pecialist"` over tracked sources returns no hit |
| WHO-R5 | No tracked source file outside `.specs/` history and `CHANGELOG.md` references the removed routes | `grep -rn "restart-save\|restart-load\|agent-handoff\|handoff-writer\|handoff-package\|restart-state"` returns hits only in `.specs/features/*` history and the `CHANGELOG.md` removal entry |
| WHO-R6 | `workflows/long-session.md` and the MCP `handoff_*` tools survive | `workflows/long-session.md` exists; `references/mcp-tools.md` still documents `handoff_begin`/`handoff_accept`/`handoff_cancel`/`handoff_list_pending` |

**Out of scope:** `packages/core` handoff/checkpoint product code, the REST/MCP
`handoff_*` endpoints, `.specs/HANDOFF.md` as an artifact, and historical
`.specs/features/*` documents. Those are product surface or history.

### Addition — root-cause proof scripts (anti-circling)

| ID | Requirement | Acceptance |
| --- | --- | --- |
| WHO-R7 | A new `references/root-cause-scripts.md` defines a circling detector with an explicit numeric trigger, and mandates writing an executable probe that produces real runtime data instead of further code reading | The reference exists and states the trigger threshold, the probe contract, and the escalation path |
| WHO-R8 | Every implementation workflow and every write-permitted agent charter loads that reference when its trigger fires | Each implementation workflow names `references/root-cause-scripts.md`; `builder` and `test-engineer` charters name it |

### Addition — implementation delivery protocol

| ID | Requirement | Acceptance |
| --- | --- | --- |
| WHO-R9 | A new `references/implementation-delivery.md` defines the mandatory chain: git worktree → atomic commit per task → push → PR via `gh` → CI/test watch → fix failures → **ask the user before merging** | The reference exists and each stage has a command, a failure branch, and a skip-reason enum |
| WHO-R10 | Worktree isolation applies to **every** implementation task with no size exemption | The reference states no Quick/Small exemption and names the only two legal skip reasons (no git repo; user declined) |
| WHO-R11 | Merge is never automatic — the workflow stops and asks after CI is green | The reference forbids `gh pr merge` without a recorded user approval in the same session |
| WHO-R12 | When `gh` is absent the chain degrades to worktree + atomic commits + push, and records the skipped PR stage | The reference has a `gh` availability preflight and a documented degraded path |
| WHO-R13 | All 16 implementation workflows load `references/implementation-delivery.md` before their first mutation step | Each of the 16 files names the reference |

### Addition — code documentation, tests, and rationale comments

| ID | Requirement | Acceptance |
| --- | --- | --- |
| WHO-R14 | A new `references/code-annotation.md` requires a language-native API doc block (JavaDoc/KDoc/TSDoc/docstring/rustdoc) on every created or updated public method, class, and exported function | The reference maps language → doc syntax and states the "created or updated" trigger |
| WHO-R15 | The same reference requires a rationale comment stating **why** the method/class was added or changed, **which feature/requirement** it serves, and **how to test it** | The reference gives the three required fields and a concrete example |
| WHO-R16 | The same reference requires tests covering every created or updated code path, called out explicitly for debug/`*-fix` workflows | The reference states the coverage obligation and the debug-specific regression-seam rule |
| WHO-R17 | All 16 implementation workflows load `references/code-annotation.md` | Each of the 16 files names the reference |

### Addition — project context intake

| ID | Requirement | Acceptance |
| --- | --- | --- |
| WHO-R18 | A new `references/project-context.md` defines the intake sweep: `AGENTS.md`, `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `.claude/`, `.cursor/`, `.github/`, `docs/`, and nearest-ancestor overrides, with precedence and a dedupe guard | The reference exists, orders precedence, and forbids re-reading within a session |
| WHO-R19 | **Every** workflow (all 35 after removal) loads `references/project-context.md` as an early step | All 35 workflow files name the reference |
| WHO-R20 | The intake respects the global ignore list and the Context Firewall thresholds | The reference defers size handling to `references/context-firewall.md` and names the ignore-path contract |

### Harness integrity

| ID | Requirement | Acceptance |
| --- | --- | --- |
| WHO-R21 | `skills/massa-ai/SKILL.md` router table, routing precedence, and shared-reference list reflect the removals and the three additions | Router has no removed row; precedence clause 1/2/4 drop restart wording; reference list has the 3 new files, not the 2 removed |
| WHO-R22 | `skills/AGENTS.md` registry lists 15 specialists and no handoff-writer | Registry count and roster updated |
| WHO-R23 | Discriminating tests assert every invariant above and fail if any single workflow file is missed | New test file fails when one workflow reference line is removed |
| WHO-R24 | `CHANGELOG.md` `[Unreleased]` gets `### Removed` and `### Added` entries | Both headings present with bullets |

## Edge cases

- A workflow that already loads a reference must not gain a duplicate line.
- Audit-only workflows (`*-audit`) must get project-context intake (WHO-R19) but
  **must not** get the delivery or annotation references — they never mutate.
- `commit.md` stays the single owner of commit message/staging rules; the
  delivery reference delegates to it rather than restating it.
- `exploration.md` and `the-fool.md` are read-only: intake only.
- The 4 host plugin bundles are generated; the generator is the source of truth,
  and the parity test must be updated in the same commit as the generator.
- `install.sh` / `install-agents.sh` print the roster count in user-facing
  strings; those are public compatibility surface and must move 16 → 15.

## Out of scope

- Any change to `packages/core`, `apps/tools-api`, or `apps/mcp-client` product code.
- Renaming or restructuring existing workflows beyond the removals.
- Enforcing the delivery protocol via a hook (documentation-level contract only).
