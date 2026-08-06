# PR Review Workflow — Design

Feature slug `pr-review-workflow` · route `pr-review` · spec: `spec.md` (PRW-01..10).

## Design Summary

One new harness prose file, `skills/massa-ai/workflows/pr-review.md`, adapted from the
TLC `pr-review` skill (CC-BY-4.0, github.com/augusto-dmh), restructured around three
massa-ai contracts the source does not have:

1. **Host adapter (PRW-03/04).** The orchestrator resolves `HOST ∈ {github, gitlab}`
   once, then reads every host operation from a single two-column command map. Review
   subagents never see a host command — they receive diff + intent + profile +
   existing-comment inventory in their capability packets and return findings as
   structured reply blocks. Only the orchestrator executes `gh`/`glab`.
2. **Roster dispatch (PRW-05).** Six dimensions run as canonical capability-packet
   dispatches in two waves (wave cap 4): wave 1 = `massa-ai-audit-specialist` ×4
   (lenses security, requirements, architecture, performance); wave 2 =
   `massa-ai-audit-specialist` (lens performance, scope: test coverage — the
   `tests-audit.md` precedent) + `massa-ai-reviewer` (regression/hallucination).
3. **Platform integration (PRW-07).** Budgeted `recall`, `.specs/` as requirements
   Track B, massa-ai retrieval (freshness-gated `project_map`/`get_architecture`/
   `search`/`impact_analysis`) ahead of shell discovery, graceful degradation when
   the server is down.

Registration is one router-table row plus one target-type precedence clause in
`skills/massa-ai/SKILL.md`; gate edits move `EXPECTED_WORKFLOW_COUNT` 38→39 (two
files) and the read-only complement 22→23; bundles regenerate via
`bun run generate:artifacts`.

## Tech Decisions

### D1 — GitLab command surface: stable REST via `glab api`, not the experimental note flags

Every glab fact below was verified against official sources on 2026-08-05 (Knowledge
Verification Chain steps 3–4; full citations in the table). `glab mr note create`'s
native inline flags (`--file/--line/--reply`) are documented **EXPERIMENTAL** — the
workflow uses the stable Discussions/Notes REST endpoints through `glab api` for
inline comments, replies, and the summary; `glab mr note` appears only as a noted
alternative.

**Host command map (rendered into the workflow verbatim):**

| Operation | GitHub (`gh`) | GitLab (`glab`) |
| --- | --- | --- |
| Auth/identity probe | `gh repo view --json nameWithOwner -q .nameWithOwner` | `glab repo view --output json --jq .path_with_namespace` (also `.id`); `glab auth status` |
| PR/MR metadata | `gh pr view {PR} --json title,body,headRefName,headRefOid` | `glab mr view {MR} --output json` → `title`, `description`, `source_branch`, `sha`, `diff_refs.{base_sha,head_sha,start_sha}` |
| Full diff | `gh pr diff {PR}` | `glab mr diff {MR} --raw` |
| Changed-file list | `gh pr diff {PR} --name-only` | `glab api "projects/:id/merge_requests/{MR}/diffs?per_page=100&page={N}"` → `new_path`/`old_path` (page to completion) |
| Existing inline comments | `gh api repos/{REPO}/pulls/{PR}/comments` → `{id,path,line,body}` | `glab api "projects/:id/merge_requests/{MR}/discussions?per_page=100&page={N}"` → per-note `id`, `position.new_path`, `position.new_line`, `body` (page to completion; default page size is 20) |
| Inline comment on added line | `gh api repos/{REPO}/pulls/{PR}/comments -F body=@body.md -f commit_id={SHA} -f path={path} -F line={N} -f side=RIGHT` | `glab api --method POST "projects/:id/merge_requests/{MR}/discussions" -F body=@body.md -f "position[position_type]=text" -f "position[base_sha]={base}" -f "position[head_sha]={head}" -f "position[start_sha]={start}" -f "position[new_path]={path}" -f "position[old_path]={old_path}" -F "position[new_line]={N}"` (added line ⇒ `new_line` only, never `old_line`) |
| Thread reply ([RESOLVED]) | `gh api repos/{REPO}/pulls/{PR}/comments/{COMMENT_ID}/replies -F body=@body.md` | `glab api --method POST "projects/:id/merge_requests/{MR}/discussions/{DISCUSSION_ID}/notes" -F body=@body.md` |
| Summary post | `gh pr review {PR} --comment --body-file summary.md` | `glab api --method POST "projects/:id/merge_requests/{MR}/notes" -F body=@summary.md` |
| Forbidden (comment-only rule) | `gh pr review --approve`, `--request-changes`, `gh pr merge` | `glab mr approve`, `glab mr revoke`, `glab mr merge`, raw `POST …/approve`/`…/unapprove` |

Field-flag semantics carried into the workflow: for **both** CLIs `-F`/`--field` does
`@file` expansion and type inference while `-f`/`--raw-field` does not — `-f body=@file`
posts the literal string. glab `-F` additionally switches the default method to POST and
substitutes `:id`-style placeholders (8 documented: `:branch :fullpath :group :id
:namespace :repo :user :username`) resolved from the current repo's remotes.

Citations (recorded per PRW-04b): `gitlab.com/gitlab-org/cli` doc sources
`docs/source/{api/_index,repo/view,mr/view,mr/diff,mr/note/create,auth/status,mr/approve,mr/revoke}.md`;
`docs.gitlab.com/api/discussions/` ("To create a thread on an added line … use
`position[new_line]` and don't include `position[old_line]`"; required position fields
`base_sha`/`head_sha`/`start_sha`/`position_type`/`new_path`/`old_path`; "By default,
GET requests return 20 results at a time"); `docs.gitlab.com/api/merge_requests/`
(`diff_refs` object; `/diffs` endpoint, `/changes` deprecated 15.7);
`docs.gitlab.com/api/draft_notes/` (bulk_publish `reviewer_state` "Does not record a
formal approval").

Rejected: GitLab Draft Notes API (draft → `bulk_publish`) as the review vehicle —
closer analog to a GitHub pending review, but adds a second posting state machine for
no reviewer-visible gain and its `reviewer_state` param is irrelevant to a
comment-only flow. Rejected: `glab mr note create --file/--line` as primary inline
path — EXPERIMENTAL marker ("might be unstable or removed at any time").

### D2 — Host detection order (PRW-03)

`explicit user statement > CLI probe > git remote host`. The probe is
`gh repo view` / `glab repo view` exit status (glab's no-remote error text is
source-level Go errors, not a documented stable string — never match on message).
When both probes fail: stop, report which CLI is missing/unauthenticated
(`gh auth status` / `glab auth status`). When both succeed (mirrored repo), ask the
user which host to review on — a posted comment is outward-facing.

### D2b — Consolidation check (agent-orchestration.md, ≥5 subagents; Plan Challenge F1)

Recorded outcome: **not merged — six dispatches stand.** The two performance-lens
dispatches share only the lens *label* (an artifact of the charter's six-lens taxonomy,
which has no `tests` lens), not a knowledge domain: the coverage packet reasons about
test placement, levels, and assertion quality against the discovered runner/layout; the
performance packet reasons about N+1/unbounded-fetch/sequential-await patterns in
runtime code. Checklists are disjoint, marker families differ (`tests` vs
`performance`), and the source protocol keeps them as separate dimensions with separate
summary sections. Merging would widen one packet past the context-firewall budget
while saving no wall-clock (both sit in wave 2 regardless).

### D3 — Channel discipline: subagents find, orchestrator posts

Source skill has each generic subagent post its own comments. Here the roster review
agents are charter **read-only** and the reply-block contract (≤40 lines,
`references/agent-orchestration.md`) is the massa-ai channel. So: packets carry
`{diff (firewall-trimmed per dimension), PR/MR intent, DISCOVERY MAP, existing-comment
inventory, marker type, severity labels, confidence gate}`; replies carry findings as
structured rows `{path, head-line, severity, marker type, title, body ≤6 lines,
confidence}` plus one positive highlight; the orchestrator dedupes (±3 vs existing
inventory and across dimensions), writes each body to a temp file, and posts. The
orchestrator never authors findings (source rule preserved); it transports them.
Consolidation is orchestrator work from reply blocks — no 7th subagent
(judge-with-debate precedent).

### D4 — Requirements sources (dimension 2)

Track A (tracker): branch/PR-body reference → `gh issue view` / `glab issue view
--output json`; Jira key → Atlassian MCP only when already configured (never invent a
host — `ticket` workflow precedent). Track B (in-repo): `.specs/project/FEATURES.json`
+ `.specs/features/<slug>/{spec,tasks}.md` acceptance criteria matched by branch/
ticket/feature stem, then generic `docs/`/ADR/RFC fallback. Both tracks merge; no
evidence ⇒ not implemented (evidence-or-zero, matching the verification ladder).

### D5 — Discovery profile (PRW-07b)

The DISCOVERY MAP keeps the source's four rows (TEST/REQS/CONVENTIONS/REVIEW_SKILLS)
plus a fifth, `INDEX`, recording massa-ai retrieval state: `list_projects` freshness,
`project_map`/`get_architecture` availability, `impact_analysis` over the PR/MR diff
(fresh index only), else `stale/unavailable — CLI fallback`. Subagents treat INDEX
rows as leads, never as evidence (Core Contract verbatim).

### D6 — File/registration layout

- `skills/massa-ai/workflows/pr-review.md` — the whole protocol, inline command map
  (no new references dir; single-file mirrors source; workflows have no per-file
  byte budget — only SKILL.md's 21,000 B ceiling binds).
- Router: one table row after `judge-with-debate`; one precedence clause in tier 3
  (target type): hosted PR/MR reference → `pr-review`; local working diff stays with
  the audit routes. Router byte cost ≈ 300 B against ~1,150 B headroom.
- Frontmatter: `name: pr-review`, quoted single-line description,
  `license: CC-BY-4.0`, `metadata.version: "1.0.0"`; body attribution line.

### D7 — Gates touched

| File | Edit |
| --- | --- |
| `scripts/__tests__/workflow-harness-contract.test.ts` | `EXPECTED_WORKFLOW_COUNT` 38→39; complement literal 22→23 |
| `scripts/__tests__/workflow-metadata-headers.test.ts` | `EXPECTED_WORKFLOW_COUNT` 38→39 |
| `CHANGELOG.md` | `[Unreleased]` → `### Added` entry (minor) |
| bundles | `bun run generate:artifacts`; parity/integrity/size/duplication suites re-run |

No edits to `IMPLEMENTATION_WORKFLOWS` (read-only classification) and no
`skills/AGENTS.md` roster change (no new agents).

## Risks & Concerns

| Risk | Impact | Mitigation |
| --- | --- | --- |
| glab experimental note flags change/vanish | Broken examples in shipped prose | Primary path is stable REST via `glab api`; experimental flags mentioned only as a labeled alternative |
| GitLab `old_path` omitted on renamed files → 400 on discussion POST | Inline post fails on renamed-file findings | Command map requires `old_path` from the `/diffs` inventory (`old_path` field), never assumed equal to `new_path` |
| Discussions pagination (20/page) truncates the dedupe inventory | Duplicate comments posted | Map pins `per_page=100` + page-to-completion loop; edge case recorded in spec |
| Six dispatches breach the wave cap | Orchestration-contract violation flagged by review | Two waves (4+2) written into the workflow steps (PRW-05c) |
| Dispatch blocks fail integrity gates (parse/persona/resolution) | `test:scripts` red | Blocks copied structurally from `tests-audit.md`; both target agents exist in all 4 host bundles; gates run locally before commit |
| SKILL.md crosses 21,000 B | size-budget gate red | Measured before commit (`wc -c`); row + clause budgeted ≈ 300 B against 1,157 B headroom |
| Complement/count locks drift with a concurrent branch | Merge conflict in gate literals | Single-integer edits; trivially re-resolvable; branch cut from current origin/main |
| Marker regex `<!-- pr-review:{type} -->` colliding with harness scanners | A repo scanner matching the literal flags the workflow | Repo sweep for the literal before commit (`git grep "pr-review:"`) — claim-of-absence lesson applied |
| Duplication ceiling (≤471) trips on ported prose | duplication-metric gate red | New content is largely novel (command map, dispatches); suite run locally before commit; if tripped, dedupe prose rather than raise the ceiling (fix the subject, not the gate) |

## Validation Hooks

- Deterministic: the seven suites named in D7 + `generate:artifacts --check` +
  `validate_spec/design/tasks` + `wc -c` on SKILL.md.
- **Live read-only dry run (Plan Challenge F2):** execute the map's read-only GitHub
  operations against a real PR of this repository (repo identity, PR metadata, diff,
  changed files, existing-comment inventory) and attach the evidence to
  `validation.md`. GitLab side: execute when an authenticated `glab` + reachable MR
  exists in the environment; otherwise record the skipped sensor with reason
  (doc-verified only) — graceful-degradation rule, plus the critic's residual
  suggestion of a follow-up evidence audit once a live GitLab environment exists.
  Posting operations are never dry-run (outward-facing).
- Prose ACs: verification-agent reads shipped workflow text against PRW-03..08/10
  clause by clause (workflow-policy-updates precedent).
- Discrimination candidates for the verifier: revert one count lock (38), drop the
  persona line from one dispatch block, remove the intake line, un-quote the
  frontmatter description — each must turn exactly one named gate red.
