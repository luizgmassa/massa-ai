# Spec — Skills / Workflows Updates

- projectId: `massa-ai`
- workflowSessionId: `spec-skills-workflows-updates`
- workflow: spec-driven (Medium — Specify + Tasks + Execute; Design inline)
- feature: `skills-workflows-updates`
- base: `origin/main` @ `ce26f28` (v1.9.1). Branch `feat/skills-workflows-updates` cut from it in a new worktree (`../massa-ai-wt-skills-workflows-updates`).
- scope: 6 requirements (SWU-01..06) tightening the implementation, spec-driven, ticket, and commit workflows.

## Background

The user asked for three groups of changes to the shipped skills:

1. **All implementation workflows** — (a) do not create unit tests for models; (b) mandatory worktree creation.
2. **spec-driven workflow** — enforce that implementation follows the repository's rules defined in `.claude/`, `.cursor/`, and the repo/module implementation pattern (including unit-test and testing-area conventions).
3. **Jira task creation** — tasks created by Phase/Wave; sub-tasks by Task inside each Phase/Wave; branch naming per Phase/Wave; each Task = one commit prefixed with its Jira sub-task key `[XXX-YYYY]`; each PR/MR carries the Phase/Wave Jira key prefix (= branch naming).

massa-ai is a skill shipped to many repos. `.claude/` and `.cursor/` do not exist inside this repo; enforcement is therefore **conditional on the target repo**, applied wherever spec-driven runs.

## Resolved decisions (Specify)

- **D1 — "models" = data/domain models only.** ORM/persistence entities, DB-schema-mapped classes, repository entities, and DDD value objects / anemic domain models. Excludes ML/AI model artifacts and ViewModels/presentation state holders. Rationale: pure data containers and behaviorless value objects have no contract worth a unit test; behavior is tested at the repository/service seam. Applies to every language the workflows touch (TS, Kotlin, Swift, Java, Python, Go, Rust, C#, Ruby, PHP, SQL).
- **D2 — "implementation workflows" = the 16 write/code workflows that already load `references/implementation-delivery.md` + `references/code-annotation.md`.** These are: `feature`, `debug`, `refactor`, `spec-driven`, `general`, `design`, `maestro/maestro`, `implementation/implementation-fix`, `bugs/bugs-fix`, `security/security-fix`, `code-quality/code-quality-fix`, `requirements/requirements-fix`, `architecture/architecture-fix`, `mobile-figma/mobile-figma-fix`, `maestro/maestro-fix`, `tests/tests-fix`. **`tdd` is excluded** — it produces a design document and routes implementation to `spec-driven`; it does not mutate source. Read-only workflows (`*-audit`, `exploration`, `the-fool`) are excluded by definition.
- **D3 — single source of truth per obligation.** Both new impl-workflow obligations ride the two references every impl workflow already loads at its identical line 7: `references/code-annotation.md` (no-tests-for-models rule) and `references/implementation-delivery.md` (mandatory worktree). No per-workflow prose duplication (matches WHO D4: one reference + one load line, never inlined copies). This means **zero edits to the 16 workflow bodies for SWU-01/SWU-02** — the obligation is inherited through the existing load line.
- **D4 — `.claude/` / `.cursor/` enforcement is conditional and generic.** A new reference `references/repo-rules-discovery.md` defines how to discover and load a target repo's AI-harness rule files (`.claude/CLAUDE.md`, `.claude/rules/**`, `.cursor/rules/*.mdc`, `.cursorrules`, and the repo's own module / unit-test / testing-area conventions). spec-driven loads it before implementation and enforces conformance. When none are present, the workflow records `repo-rules: none present` and continues — it never fabricates rules and never creates these directories in a repo that lacks them.
- **D5 — Jira phase mapping reuses the existing `tickets-subtasks` hierarchy mode.** Phase/Wave → one standard Jira **Task**; each Task inside the phase → one Jira **sub-task** under that Task. The Epic layer is optional and unchanged. Driven by a phased `tasks.md` (spec-driven) or a TDD PR-group table.
- **D6 — branch, commit, and PR prefixes are owned in three places, cross-linked, not duplicated.** Branch naming for phased work lives in `references/implementation-delivery.md` Stage 1 (it already owns the worktree branch command). Per-task commit prefixing lives in `workflows/commit.md` (it already owns commit messages and the Jira-key extraction regex). PR title/body prefixing lives in `references/implementation-delivery.md` Stage 4 (it already owns `gh pr create`). `workflows/ticket.md` owns only the Epic/Task/sub-task creation hierarchy and emits the keys the other two consume.

## Requirements

### SWU-01 — No unit tests for data/domain models (all impl workflows)

**Behavior:** When an implementation workflow creates or updates a data model or anemic domain model, it must **not** generate unit tests for that model. Tests are written at the repository, service, or use-case boundary that exercises the model's behavior, not against the model's fields, getters, setters, or constructors.

**Scope:** All 16 workflows listed in D2, inherited through `references/code-annotation.md` §3.

**Acceptance criteria:**

- AC-1: `references/code-annotation.md` §3 (Tests) contains an explicit exception stating that data models and anemic domain models (ORM/persistence entities, schema-mapped classes, repository entities, behaviorless value objects) are **not** unit-tested, and that behavior is tested at the repository/service seam instead.
- AC-2: The exception names the excluded kinds (data models, domain models, persistence entities, value objects with no behavior) and the languages it covers, so a reader cannot mistake it for "skip tests on anything called a model".
- AC-3: The exception does **not** weaken the existing "test every changed code path" rule for code that has behavior; it scopes the exclusion to behaviorless models only.
- AC-4: The 16 impl-workflow bodies are not edited for this requirement (single-source inheritance via the existing load line). A grep confirms none of them inlines a contradicting "test all models" instruction.

### SWU-02 — Mandatory worktree creation (all impl workflows)

**Behavior:** Every implementation task runs in its own git worktree before the first repository mutation. No size exemption.

**Scope:** All 16 workflows listed in D2, inherited through `references/implementation-delivery.md`.

**Note:** This rule **already exists** as Stage 1 of `references/implementation-delivery.md` ("worktree isolation is mandatory ... no size exemption"). This requirement makes the obligation explicit and unmissable in the single source rather than adding per-workflow prose.

**Acceptance criteria:**

- AC-1: `references/implementation-delivery.md` Stage 1 explicitly states worktree creation is **mandatory** for every implementation task, with no size exemption, and the heading/wording contains the phrase "mandatory worktree" so the rule is greppable.
- AC-2: The two legal skip reasons (not a git repository; user explicitly declined) remain the only allowed exceptions, recorded verbatim in the completion report.
- AC-3: The 16 impl-workflow load lines still point at `references/implementation-delivery.md` for worktree isolation (no regression).
- AC-4: No read-only workflow (`*-audit`, `exploration`, `the-fool`) loads `implementation-delivery.md` (the existing "Read-only workflows never load this file" sentence is preserved).

### SWU-03 — spec-driven enforces the target repo's rules (.claude/, .cursor/, module + test patterns)

**Behavior:** Before implementation, spec-driven discovers and loads the target repository's AI-harness rule files (`.claude/`, `.cursor/`, `.cursorrules`) and the repo's own module / unit-test / testing-area conventions, then enforces that the implementation follows them. When none are present, it records that fact and continues.

**Scope:** `workflows/spec-driven.md` + new `references/repo-rules-discovery.md`.

**Acceptance criteria:**

- AC-1: A new reference `references/repo-rules-discovery.md` exists and defines, in one place, how to discover and load a target repo's harness rules: `.claude/CLAUDE.md`, `.claude/rules/**`, `.cursor/rules/*.mdc`, `.cursorrules`, plus the repo's module-layout, unit-test, and testing-area conventions. It states that absence is valid and never fabricated.
- AC-2: `workflows/spec-driven.md` loads `references/repo-rules-discovery.md` before the first repository mutation and adds an enforcement clause: implementation must conform to the discovered repo rules; deviations require an explicit recorded reason.
- AC-3: The reference is listed in `skills/massa-ai/SKILL.md` Shared References table (keeps the router-table <-> disk integrity test green and discoverability honest).
- AC-4: spec-driven records `repo-rules: <list or none present>` in its completion evidence so the verifier can confirm the discovery ran.
- AC-5: This repo (`massa-ai`) has no `.claude/` and no `.cursor/`; spec-driven run here must report `repo-rules: none present`, not error and not create the directories.

### SWU-04 — ticket.md creates Jira tasks by Phase/Wave and sub-tasks by Task

**Behavior:** When ticket creation is driven by a phased plan (spec-driven `tasks.md` with Phases/Waves, or a TDD PR-group table), the workflow creates one standard Jira Task per Phase/Wave and one Jira sub-task per Task inside that phase.

**Scope:** `workflows/ticket.md` + `references/ticket/templates-and-quality.md` (+ intake note in `references/ticket/intake-and-sources.md`).

**Acceptance criteria:**

- AC-1: `workflows/ticket.md` documents the phased-decomposition mapping: Phase/Wave → one standard Jira Task; each Task inside the phase → one sub-task under that Task.
- AC-2: `references/ticket/templates-and-quality.md` Decomposition Rules describe the Phase→Task / Task→sub-task mapping and state that branch naming follows the Phase/Wave key (cross-linking `references/implementation-delivery.md`, not restating the branch command).
- AC-3: The mapping is optional and triggered by a phased source; non-phased ticket requests keep the existing `epic-tickets` / `epic-tickets-subtasks` / `tickets-subtasks` behavior unchanged.
- AC-4: ticket.md emits each created Jira key (phase Task keys + task sub-task keys) back to the caller so `commit.md` and `implementation-delivery.md` can consume them.
- AC-5: No new issue type is invented; the mapping reuses the project's existing standard Task and sub-task issue types.

### SWU-05 — Each Task = one commit prefixed with its Jira sub-task key `[XXX-YYYY]`

**Behavior:** For phased work, each Task inside a Phase/Wave produces exactly one atomic commit, and that commit's subject is prefixed with the Task's Jira sub-task key as `[XXX-YYYY]`.

**Scope:** `workflows/commit.md`.

**Acceptance criteria:**

- AC-1: `workflows/commit.md` states that for phased work each Task is one atomic commit (never batched), and the commit subject is prefixed with that Task's Jira sub-task key as `[XXX-YYYY]`.
- AC-2: The existing branch-key extraction regex remains the fallback when no explicit task key is supplied; the explicit task key (from ticket.md or the user) takes precedence.
- AC-3: The `[XXX-YYYY]` prefix format is shown by example and is consistent with the existing `[<KEY>] ` prefix rule already in commit.md.
- AC-4: commit.md cross-links `workflows/ticket.md` as the source of task keys and `references/implementation-delivery.md` for the one-commit-per-task cadence, without restating either.

### SWU-06 — Branch per Phase/Wave; PR/MR carries the Phase/Wave Jira key prefix

**Behavior:** For phased work, the git branch is named per Phase/Wave (carrying the phase's Jira key), and each PR/MR title and body includes that Phase/Wave Jira key prefix (which equals the branch naming).

**Scope:** `references/implementation-delivery.md` Stages 1 and 4.

**Acceptance criteria:**

- AC-1: `references/implementation-delivery.md` Stage 1 (Isolate) documents that for phased work the branch is named per Phase/Wave and carries the phase's Jira key (e.g. `feat/<PHASE-KEY>-<slug>`), sourcing the key from ticket.md or the user.
- AC-2: Stage 4 (Propose) documents that the PR/MR title and body include the Phase/Wave Jira key prefix (matching the branch naming), sourcing it from the branch.
- AC-3: The non-phased branch naming (`<type>/<slug>`) and the existing degraded paths remain unchanged.
- AC-4: The branch-key and PR-key rules cross-link `workflows/ticket.md` (key source) and `workflows/commit.md` (per-task commit prefix) without duplicating their contracts.

## Out of scope

- Editing the 16 implementation-workflow bodies to inline the two new impl obligations (handled by single-source references — D3).
- Creating `.claude/` or `.cursor/` directories inside this repo.
- Adding `tdd` to the impl-workflow set (it is a design-doc producer).
- Changing the Atlassian MCP contract, issue-type schema, or adding new MCP tools.
- Rewriting the existing Plan Challenge, persona-router, or conversation-feedback policies.
- **Repo-rules enforcement scope is `spec-driven` only (Plan Challenge F3).** SWU-03 wires `references/repo-rules-discovery.md` into `workflows/spec-driven.md` alone. The other 15 write/code workflows do **not** load it after this change, so a user running `feature`/`debug`/`refactor` directly gets no `.claude/`/`.cursor/` enforcement. This is intentional (spec-driven is the requirements-through-verification path where rule conformance is enforceable); widening to all 15 is a tracked follow-up, not part of this feature. `rg "repo-rules-discovery" skills/massa-ai/workflows/` must match only `spec-driven.md` after Execute.

## Test Coverage Matrix

| Requirement | Evidence |
| --- | --- |
| SWU-01 | `code-annotation.md` §3 contains the no-model-tests exception; `skills-harness-integrity` reference-integrity test stays green; manual read confirms the 16 workflows inherit it via their load line. |
| SWU-02 | `implementation-delivery.md` Stage 1 contains "mandatory worktree"; the 16 load lines unchanged; read-only workflows still do not load it. |
| SWU-03 | `references/repo-rules-discovery.md` exists; spec-driven.md loads it; SKILL.md Shared References lists it; router/reference-integrity tests green. |
| SWU-04 | ticket.md + templates-and-quality.md describe Phase→Task / Task→sub-task; existing hierarchy modes preserved. |
| SWU-05 | commit.md states one-commit-per-task with `[XXX-YYYY]` sub-task prefix; example present; cross-links present. |
| SWU-06 | implementation-delivery.md Stage 1 + Stage 4 describe phase branch + PR prefix; non-phased path unchanged; cross-links present. |

## Gate Check Commands

```bash
bun run test:scripts     # skills-harness-integrity (reference integrity, router<->disk, policy single-source)
bun run type-check       # 6 tsc projects (unchanged surface, but must stay green)
```

`test:scripts` is the authoritative gate: it enforces that every referenced `references/*.md` / `workflows/*.md` resolves on disk, that the router table matches the tree, and that no policy block drifts. A new reference file must both exist and be listed in the router's Shared References to stay green.
