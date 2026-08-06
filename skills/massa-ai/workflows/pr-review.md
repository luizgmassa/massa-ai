---
name: pr-review
description: "Explicit-route workflow to review a hosted GitHub Pull Request or GitLab Merge Request across six dimensions — security, requirements, test coverage, architecture, regression, performance — using massa-ai roster subagents, then post inline comments plus one consolidated summary through the host CLI (gh or glab). Use when the user says review PR 128, review this MR, or code review this pull request. Do NOT use for local working-diff review (audit workflows), creating PRs, replying to review comments, or fixing CI."
license: CC-BY-4.0
metadata:
  version: "1.0.0"
---

Attribution: adapted from the `pr-review` skill by github.com/augusto-dmh
(TLC skills catalog), licensed CC-BY-4.0. Host abstraction (GitLab support),
massa-ai roster dispatches, memory/index/`.specs/` integration, and channel
discipline are this repository's additions; repository contracts win on any
conflict with the base.

### PR Review

Use when the user explicitly asks to review a hosted PR (Pull Request, GitHub) or
MR (Merge Request, GitLab) — "review PR 128", "review this MR", "check pull request
42". Explicit route only: never auto-trigger during coding. Local working-tree diff
review stays with the audit workflows and `massa-ai-reviewer`; this workflow exists
to **post findings back to the host**.

Load `references/project-context.md` (intake sweep) before the first substantive
read. Resolve `projectId` and `workflowSessionId` = `pr-review-<number>` per the
Core Contract, and run a budgeted `recall` (limit ≤ 3, minImportance ≥ 0.7) for
prior review conventions and known regression patterns.

## Execution Contract (non-negotiable)

1. **Orchestration-only.** The main agent never authors a review finding. It
   gathers context, dispatches the review subagents, dedupes their returned
   findings, and posts. Doing the review inline — even for a small diff — is a
   failure of this workflow.
2. **Comment-only, never destructive.** Forbidden in every circumstance:
   `gh pr review --approve`, `gh pr review --request-changes`, `gh pr merge`,
   `glab mr approve`, `glab mr revoke`, `glab mr merge`, and the raw
   `POST …/approve` / `POST …/unapprove` endpoints. Posting notes or discussions
   never approves — keep it that way. Never modify repository files.
3. **Subagents never touch the host.** Review subagents are read-only and
   host-agnostic: they receive the diff and context in their packet and return
   findings in their reply block. Only the orchestrator executes `gh`/`glab`.
4. **File-body posting.** Every multiline body is written to a temp file and
   posted with the host's file-body mechanism (`--body-file` / `-F body=@file`).
   Inlining a multiline `--body` string is the protocol's most common failure.
5. **Ask, never guess.** No PR/MR reference in the request → ask for it. Host CLI
   cannot resolve the reference → stop and surface the CLI error output.

## Step 1 — Initialize

### 1a. Resolve the host

Order: explicit user statement > CLI probe > git remote host. Probe with
`gh repo view` / `glab repo view` **exit status** (glab's no-remote error text is
not a documented stable string — never match on the message). Both probes fail →
stop and report which CLI is missing or unauthenticated (`gh auth status` /
`glab auth status`). Both succeed (mirrored repo) → ask the user which host to
review on; a posted comment is outward-facing. Record `HOST ∈ {github, gitlab}`.

### 1b. PR/MR context (via the command map below)

Resolve repository identity, then fetch: title + body/description + source
branch, the head anchor (`{SHA}` on GitHub; the full `diff_refs`
`{base_sha, head_sha, start_sha}` triple on GitLab), the full diff, and the
changed-file list. Then load the existing inline-comment inventory as
`{id, path, line, body}` records — **page to completion** (GitLab discussions
default to 20 per page; pin `per_page=100` and loop) — used for dedupe,
`[RESOLVED]` replies, and threading.

### 1c. Project discovery (the adaptive spine)

Probe the repository once and record a DISCOVERY MAP passed verbatim to every
subagent. Prefer evidence the project states over guesses; mark absences `none`.

```
TEST:          <command CI actually runs> | globs: <...> | unit vs e2e: <split | none>
REQS:          tracker=<GH #42 | Jira KEY-123 | GitLab #42 | none> ; specs=<paths | none>
CONVENTIONS:   <doc/skill paths that state rules | none-found>
REVIEW_SKILLS: <project-local review skill paths | none>
INDEX:         <massa-ai retrieval state: fresh | stale | unavailable — CLI fallback>
```

- **TEST**: the CI workflow config is authoritative; manifests are fallback.
- **REQS Track A (tracker)**: ticket key from branch name or PR/MR body —
  `gh issue view {N} --json title,body` / `glab issue view {N} --output json`;
  Jira only through an already-configured Atlassian MCP (never invent a host).
- **REQS Track B (in-repo)**: `.specs/project/FEATURES.json` and
  `.specs/features/<slug>/{spec,tasks}.md` acceptance criteria matched by branch,
  ticket, or feature stem; then `docs/`, ADR/RFC directories, `*-spec.md`.
- **CONVENTIONS/REVIEW_SKILLS**: `CONTRIBUTING*`, `ARCHITECTURE*`, `AGENTS.md`,
  `CLAUDE.md`, `docs/**` convention files, `.claude/skills/`, `.cursor/skills/`.
- **INDEX**: `list_projects` freshness first; when fresh, `project_map` or
  `get_architecture` for orientation and `impact_analysis` over the PR/MR diff
  for centrality-ranked hotspots; `search` under `references/synapse-policy.md`
  when two or more related searches are planned. Index results are leads until
  confirmed against the diff — never evidence on their own. Server or index
  unavailable → record it and continue per `references/graceful-degradation.md`.

## Host Command Map

The orchestrator reads every host operation from this table. `{REPO}`/`{PR}` are
GitHub coordinates; `{MR}` is the GitLab IID; `:id` is glab's project placeholder
(resolved from the current repo's remote — 8 placeholders are documented:
`:branch :fullpath :group :id :namespace :repo :user :username`).

| Operation | GitHub (`gh`) | GitLab (`glab`) |
| --- | --- | --- |
| Identity | `gh repo view --json nameWithOwner -q .nameWithOwner` → `{REPO}` | `glab repo view --output json --jq .path_with_namespace` (project id: `--jq .id`) |
| Metadata | `gh pr view {PR} --json title,body,headRefName,headRefOid` → `{SHA}` | `glab mr view {MR} --output json` → `title`, `description`, `source_branch`, `sha`, `diff_refs.{base_sha,head_sha,start_sha}` |
| Full diff | `gh pr diff {PR}` | `glab mr diff {MR} --raw` |
| Changed files | `gh pr diff {PR} --name-only` | `glab api "projects/:id/merge_requests/{MR}/diffs?per_page=100&page={N}"` → `new_path`/`old_path`, page to completion |
| Existing comments | `gh api repos/{REPO}/pulls/{PR}/comments` | `glab api "projects/:id/merge_requests/{MR}/discussions?per_page=100&page={N}"` → note `id`, `position.new_path`, `position.new_line`, `body` |
| Inline comment | `gh api repos/{REPO}/pulls/{PR}/comments -F body=@body.md -f commit_id={SHA} -f path={path} -F line={N} -f side=RIGHT` | `glab api --method POST "projects/:id/merge_requests/{MR}/discussions" -F body=@body.md -f "position[position_type]=text" -f "position[base_sha]={base}" -f "position[head_sha]={head}" -f "position[start_sha]={start}" -f "position[new_path]={path}" -f "position[old_path]={old}" -F "position[new_line]={N}"` |
| Thread reply | `gh api repos/{REPO}/pulls/{PR}/comments/{COMMENT_ID}/replies -F body=@body.md` | `glab api --method POST "projects/:id/merge_requests/{MR}/discussions/{DISCUSSION_ID}/notes" -F body=@body.md` |
| Summary | `gh pr review {PR} --comment --body-file summary.md` | `glab api --method POST "projects/:id/merge_requests/{MR}/notes" -F body=@summary.md` |

Anchoring and flag semantics (load-bearing, verified against official docs):

- **GitHub `line={N}`** is the 1-based line number in the **head file** on side
  `RIGHT` — count from the hunk header across added and context lines. A
  diff-relative offset returns 422 or lands on the wrong line.
- **GitLab added line** ⇒ send `position[new_line]` and **omit** `old_line`
  (removed line: the reverse; context line: both). `new_path` **and** `old_path`
  are both required for `position_type=text` — take `old_path` from the `/diffs`
  inventory, never assume it equals `new_path` (renames break that).
- **`-F`/`--field` expands `@file` and infers types on both CLIs; `-f`/
  `--raw-field` does neither** — `-f body=@body.md` posts the literal string
  `@body.md`. Use `-F` for bodies and line numbers, `-f` for plain strings.
  glab's `-F` also switches the default method to POST.
- `glab mr note create` has experimental inline flags (`--file`, `--line`,
  `--reply`) — GitLab marks them "might be unstable or removed at any time"; the
  stable `glab api` paths above are the contract. A plain summary may also use
  `glab mr note create {MR} < summary.md` (body from stdin).

## Step 2 — Dispatch the review (two waves)

Six dimensions run as read-only roster dispatches under
`references/agent-orchestration.md` (wave cap 4 → wave 1 = rows 1–4, wave 2 =
rows 5–6). Each packet carries: the dimension row below, the DISCOVERY MAP, the
PR/MR intent (title/body/branch), the existing-comment inventory, the diff
trimmed to hunks relevant to the dimension per `references/context-firewall.md`,
the severity labels, and the reply contract.

| # | Dimension | Agent | Packet delta (lens / scope) | Marker `{type}` |
| --- | --- | --- | --- | --- |
| 1 | Security | `massa-ai-audit-specialist` | `lens: security` — secrets, authn/authz on new endpoints, injection, unsafe deserialization, PII in logs, permissive CORS, leaking payload fields | `security` |
| 2 | Requirements & DoD (Definition of Done) | `massa-ai-audit-specialist` | `lens: requirements` — score merged Track A + Track B criteria against the diff, evidence-or-zero: ✅ implemented (`path:line`) / 🟡 partial / ❌ missing; no source ⇒ report "requirements verification skipped" | `requirements` |
| 3 | Architecture & conventions | `massa-ai-audit-specialist` | `lens: architecture` — extract every explicit rule from the profile's CONVENTIONS/REVIEW_SKILLS docs into a numbered matrix, grade each changed file PASS/VIOLATION/N/A; no docs ⇒ minimal generic boundary sweep, stated | `architecture` |
| 4 | Performance | `massa-ai-audit-specialist` | `lens: performance` — only issues clearly visible in the diff: N+1 queries, unbounded fetches, per-row lazy I/O, sequential awaits of independent calls, loop-invariant recomputation, unbatched writes | `performance` |
| 5 | Test coverage | `massa-ai-audit-specialist` | `lens: performance`, scope: test coverage (the charter's lens set has no `tests` lens; `tests-audit.md` precedent) — new/changed behavior with no test, wrong level (unit vs integration), placement/naming vs profile TEST row, missing negative case, assertions that exercise but never assert | `tests` |
| 6 | Regression & hallucination | `massa-ai-reviewer` | diff review — unrelated deletions, references to symbols absent from the repo, wrong signature/arity, duplicated existing logic, weakened error handling or assertions, leftover TODO/stub, dead code | `regression` |

Consolidation check (≥ 5 subagents): recorded in the feature design — rows 4 and 5
share only the lens label, not a knowledge domain; they stay separate dispatches.

> **Dispatch: `massa-ai-audit-specialist`** (role: `audit-specialist`) — charter `skills/agents/audit-specialist/SKILL.md`
> - trigger: pr-review Step 2, dimension rows 1–5 (one dispatch per row)
> - scope: the PR/MR diff and surrounding context for one dimension row; never the whole repository
> - permissions: read-only; no host CLI calls, no posting
> - inputs: exact `projectId`, parent `workflowSessionId`, dimension row (lens + scope), DISCOVERY MAP, PR/MR intent, trimmed diff, existing-comment inventory, severity labels, reply contract
> - sensors: second-pass sweep — re-read the full trimmed diff, list every file/hunk not commented on, and state per file why it is clean for this dimension before returning
> - output: structured reply block — findings rows `{path, head-line, severity, marker type, title, body ≤ 6 lines, recommendation}` + exactly one positive highlight + files-swept-clean list; when uncertain a finding is real, withhold it (the source protocol's high-confidence bar, applied qualitatively)
> - firewall: raw diff/log/search output summarized, never returned raw
> - memory: suggest-only; the main agent persists durable outcomes
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed

> **Dispatch: `massa-ai-reviewer`** (role: `reviewer`) — charter `skills/agents/reviewer/SKILL.md`
> - trigger: pr-review Step 2, dimension row 6 (regression & hallucination)
> - scope: the full PR/MR diff against the repository's real symbol surface
> - permissions: read-only; no host CLI calls, no posting
> - inputs: exact `projectId`, parent `workflowSessionId`, dimension row 6, DISCOVERY MAP, PR/MR intent, full diff, existing-comment inventory, severity labels, reply contract
> - sensors: verify referenced symbols exist (`search_definitions`/`get_references` when INDEX is fresh, else grep); second-pass sweep as above
> - output: structured reply block — findings rows tagged `{unrelated-deletion | phantom-reference | wrong-signature | duplicate | weakened-check | dead-code}` + one positive highlight + files-swept-clean list; withhold uncertain findings
> - firewall: raw diff/log/search output summarized, never returned raw
> - memory: suggest-only; the main agent persists durable outcomes
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed

Severity labels (all dimensions): 🚨 Critical (bugs/logic errors that will fail) ·
🔒 Security · ⚡ Performance · ⚠️ Warning (smells/maintainability) ·
💡 Suggestion. A failed or unavailable dispatch is reported in the summary as a
skipped dimension with its reason — never silently dropped.

## Step 3 — Post inline findings (orchestrator only)

For every returned finding, in order:

1. **Dedupe**: drop it when an existing comment sits within ±3 lines of the same
   path/line (inventory from 1b) or another dimension already produced the same
   `{path, line}` finding (keep the higher severity; note both markers).
2. **Resolve check**: when an existing comment's issue is fixed by this diff,
   reply `[RESOLVED] This appears resolved by the recent changes.` on that thread
   via the reply command (GitHub: the comment's `id`; GitLab: its
   `discussion_id`).
3. **Anchor**: only added (`+`) diff lines on the head revision, per the
   anchoring semantics above. A finding with no `+` line to stand on goes to the
   summary instead.
4. **Body**: temp file, starting with the invisible marker
   `<!-- pr-review:{type} -->`, then `[severity emoji] — [short title]`, the
   evidence-grounded body, and a `**Recommendation:**` line. No AI/assistant/
   tool attribution anywhere — write as a reviewer. Specific, actionable,
   collegial; always explain why.
5. **Post** with the inline-comment command for `HOST`.

## Step 4 — Consolidated summary

Assemble from the reply blocks (no extra subagent) and post one summary via the
summary command:

```markdown
## 📋 PR Review Summary

| | |
|---|---|
| **Host / target** | {github PR #N | gitlab MR !N} @ {head sha} |
| **Dimensions** | 6 (Security · Requirements & DoD · Tests · Architecture · Regression · Performance) |
| **Detected runner** | {TEST row | none found} |
| **Requirements source** | {tracker / spec paths / none} |
| **Project refs loaded** | {CONVENTIONS + REVIEW_SKILLS rows} |
| **Findings** | {N} across {M} files |

### 🔒 Security ({N}) / 🚨 Critical ({N}) / ⚡ Performance ({N}) / ⚠️ Warnings ({N}) / 💡 Suggestions ({N})
- [`path/file:L42`] Finding title — one line each, grouped by severity

### 📋 Requirements
{✅/🟡/❌ rows from dimension 2, with `path:line` evidence}

### 🔍 Files with no findings
- `path` — swept clean by {dimensions} (omit section when every logic file got a comment; config/lock/declaration files excluded)

### ✅ Highlights
- one per dimension

> See inline comments for details. {Skipped dimensions/sensors with reasons, if any.}
```

Zero findings overall → post "✅ No issues found across all review dimensions."
with the metadata table intact.

## Completion

- Emit Conversation Feedback status updates at wave boundaries when that policy
  is active; expand every abbreviation on first use in user-facing output.
- Persist durable outcomes only (recurring review pattern, confirmed project
  convention) with the required memory tags; do not fabricate memories.
- Close with `references/evidence-gate.md`: counts posted vs deduped vs withheld,
  skipped dimensions/sensors with reasons, and the summary URL/reference.
<!-- validator anchors: comment-only | added (+) diff lines | page to completion | two waves -->
