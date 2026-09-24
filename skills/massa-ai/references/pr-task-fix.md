# PR Task Fix

Load from `workflows/feature.md` and `workflows/refactor.md` before non-trivial implementation or refactor execution that can be decomposed into reviewable task groups.

## ADR/TDD Input Gate

Before decomposition, inspect the first user prompt, current prompt context, explicitly attached or readable local files, and any already supplied Atlassian MCP source pointers.

If there is no ADR or TDD plain text, no attached/readable ADR or TDD file, and no already-supplied Atlassian ADR/TDD source, ask whether the user wants to provide an ADR or TDD through Atlassian MCP. Do not ask again once the user has already supplied, declined, or made Atlassian unavailable for this run.

Use ADR/TDD input as implementation context, not as permission to bypass the active workflow's scope, source verification, or verification recipe. If the ADR/TDD conflicts with current source or project instructions, surface the conflict and resolve it before implementation.

## PR Task Grouping

Decompose work into reviewable PR groups before editing. Reuse the TDD
task-planning contract in `references/create-tdd/document-contract.md`
§Implementation Task Table for the PR-size bands (Small/Medium/Large) and the
layer order (Data, then Domain, then Presentation/Navigation, mapped to
repository terms when boundaries differ).

Every PR group must be independently buildable and testable. It must not leave an intermediate state that breaks tests, UI, migrations, public contracts, required runtime behavior, or the active workflow's verification recipe.

If a group is too large, split it into two or more groups. If tasks are too small, merge related small work only when the merged group remains independent, reviewable, buildable, and testable.

## Commit Per Group

For each PR group:

1. Implement only that group's scoped work.
2. Run the active workflow's verification recipe for that group.
3. Invoke `workflows/commit.md` to draft or create the commit.

Do not duplicate raw commit-message, staging, audit-file exclusion, or Jira-prefix rules here. The commit workflow remains authoritative for commit safety and message generation.

If stacked branching is declined, unavailable, or not applicable, continue sequentially on the current branch and still use the commit workflow after each verified group.

## Jira-Key Stacked Branches

After the PR groups are stable, inspect their Jira keys. Offer stacked branch automation only when every PR group has a confirmed Jira key. Do not create Jira tickets from this reference; ticket creation remains owned by `workflows/create-ticket.md`.

If every group has a Jira key, ask whether the user wants to automatically create separate stacked branches for each Jira task. If the user accepts, ask for:

- the base branch to branch off for the first task
- a branch name pattern containing the exact token `<jira-task-key>`, for example `features/<jira-task-key>`

Normalize Jira keys with the commit workflow regex semantics before substitution, preserving uppercase keys unless the user explicitly supplies a lowercase pattern rule. Reject a branch pattern that omits `<jira-task-key>`.

Before creating branches:

- Verify the working tree is in a safe state for branch creation.
- Resolve the base branch and fail early if it is missing.
- Derive all branch names and check for duplicates or existing local branch name collisions.
- Do not push any branch.

Create branches as a stack:

1. Create the first task branch from the user-selected base branch.
2. Implement, validate, and commit the first PR group through `workflows/commit.md`.
3. Create the second task branch from the first task branch, not from the original base.
4. Repeat until every task branch has its implementation, verification, and commit.

If a branch creation, implementation, verification, or commit fails, stop at that branch, report completed branches and commits, and leave the next exact resume step. Do not skip ahead to later branches.

## Completion Report

At completion, report:

- ADR/TDD source outcome: supplied, Atlassian provided, declined, unavailable, or not needed.
- PR groups in execution order, with layer, size, Jira key, verification result, and commit result.
- All created branches and commits in the order they should be pushed.
- Explicit `No branches were pushed`.
- Skipped checks, residual risks, memory outcome, and active workflow Evidence Gate status.
