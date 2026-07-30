# Design — skills/ directive dedup

Design is required here because the change touches a **public compatibility surface**:
every file under `skills/` is copied byte-identically into four `apps/*-plugin/skills/`
bundles (~580 files) and published to npm.

## D1 — The single-source rule this feature applies, and its one exception

The repository's stated principle is that each rule lives in exactly one authoritative
location and other documents link to it. This feature applies it — except where a file
must be **independently loadable**.

That exception is not a compromise; it is the harness's actual architecture, and
`skills-harness-integrity.test.ts` encodes it in three places. A subagent receives only
its charter. A `Dispatch:` block fires in workflows that load
`agent-orchestration.md` only conditionally. The three Capability Packet definitions are
each loadable alone. In all three cases a pointer would resolve to a file that is not in
context, so the *duplicate is the contract* and the test asserts it byte-identical —
`skills-harness-integrity.test.ts:447-450` states the reason directly: "Uniform text is
what makes a substring gate meaningful — a per-file paraphrase cannot be distinguished
from a weakened one."

**The operative test for every edit in this feature:** replace a restatement with a
pointer *only when the file already carries a load instruction for the owner*. Verified
per target (§D3, §D4); the one target that failed this test drove D2.

## D2 — The Knowledge Verification Chain gets its own reference file

Options considered:

| Option | Verdict |
| --- | --- |
| Fold into `references/codebase-investigation.md` | **Rejected.** `exploration.md` loads it, but `spec-driven.md` does not (measured). Pointing spec-driven at a rule inside a file it never loads reproduces the exact defect being fixed. |
| Leave both copies, reconcile the drift only | Rejected. Two copies with identical text drift again; that is how they got here. |
| New `references/knowledge-verification-chain.md` | **Chosen.** |

Both workflows gain an explicit load line. `references/spec-driven/design.md:44`'s
pointer — which today names `SKILL.md`, a file that has never contained the chain — is
repointed at the new file, and its third re-inlined copy at `:44-52` is removed.

Drift reconciliation (AC-8): the surviving closing rule is spec-driven's longer form,
because it states a consequence (`invented APIs/patterns cause cascading failures across
design → tasks → implementation`) that exploration's `"I don't know" beats invention`
does not. Keeping the stronger claim is the rule; keeping the shorter text would lose a
constraint under cover of deduplication.

One reference file is added. That is legal: `skills-harness-integrity.test.ts:352-364`
asserts every reference the router *lists* exists, not that every reference on disk is
listed — the router's list is a load menu, not an inventory.

## D3 — Pointer replacements (SDD-05), each with its verified loader

| # | Restatement removed | Owner it points to | Loader verified at |
| --- | --- | --- | --- |
| P1 | `workflows/exploration.md:7-17` Golden Rules | `references/codebase-investigation.md` § Golden Rules | `exploration.md:40` "always" |
| P2 | `workflows/the-fool.md:55-63` critique fields | `references/agent-orchestration.md:186-194` | `the-fool.md:49` |
| P3 | `references/spec-driven/sub-agents.md:135-143` chat template | `references/spec-driven/validate.md:240-248` | `sub-agents.md:119,121` |
| P4 | `SKILL.md:247-250` memory tags/types | `references/memory-policy.md:14,44-54` | `SKILL.md:75` |
| ~~P5~~ | ~~`SKILL.md:221-224` retrieval steps 7-10~~ | ~~`references/mcp-tools.md:151-154`~~ | **withdrawn — see below** |
| P6 | `workflows/debug.md:68-74` Output Contract | `references/debug-diagnosis-loop.md:122-131` | `debug.md:12` |

P6 carries the SDD-04 reconciliation: `debug.md`'s seventh bullet (`For mobile bugs: …`)
moves **into** the reference. Deleting the copy without moving that bullet would delete a
rule, and the seven-vs-six divergence is the whole reason this pair is a defect rather
than a cost.

P4 must not touch `SKILL.md:60-62` — `validate-repository.test.ts:191-193` asserts that
sentence and it is a different one from the tags list. (The memory *types* sit at
`:251-252`, one line past the cited range; the replacement covers both.)

**P5 is withdrawn as originally scoped** (amendment A6). It proposed extracting items
7-10 of `SKILL.md`'s eleven-item retrieval procedure because those four are the only
ones the window=4 metric can prove byte-identical to `mcp-tools.md`. Items 1-6 and 11 of
the *same numbered list* are paraphrase-duplicates between the *same two files* — which
shingling cannot see, by construction.

Taking the visible four would have split one numbered procedure across two files,
renumbered the remainder, and left the larger duplicate untouched: optimizing for what
the instrument detects rather than for the defect. §1 of `spec.md` states that
limitation and this design then failed to apply it to itself.

T7 must therefore choose explicitly and record the choice:

- **extract the whole procedure** — `mcp-tools.md` owns retrieval order end to end, and
  `SKILL.md` keeps a single load-and-follow line; or
- **keep it inline and delete `mcp-tools.md`'s copy** — the router's stated scope
  already includes retrieval, and it is always loaded while `mcp-tools.md` is not.

The second is likelier correct on progressive-disclosure grounds, since a rule the
router needs on every task should not sit behind a conditional load. Either way the
eleven items end up in one place. Four of eleven is not an option.

## D4 — Audit-family extraction (SDD-06) extends `audit-scope.md`, adds no file

All six `*-audit.md` already load `references/audit-scope.md` at step 2 (verified, 6/6),
and the reference already owns the relevant sections. Each target lands in the section
that already covers its subject:

| Extracted from 6 workflows | Lands in `audit-scope.md` § |
| --- | --- |
| commit-range resolution, 5 bullets (author identity via `git config user.email`, branch-base fallback order, "commits made by me", ask-if-unresolvable) | Branch, Commit, And PR Diff Resolution *(owns base-fallback already; author-identity rules are new content)* |
| scope-packet field restatement | Scope Packets *(already the canonical template)* |
| staged/unstaged + generated-path exclusion bullets | File Inclusion *(near-verbatim already)* |
| "ask for the target area" bullet | Target Intake Rules *(already at `:28`)* |
| false-positive opening bullet | new § False-Positive Pass |
| severity-rule header clause | new § Severity Rules |

**Not extracted, deliberately:** the findings-only gate at each `*-audit.md:9`. It sits
above step 1, before any reference load executes. Moving it would convert a
zero-dependency instruction into one that depends on a later load — strictly worse for
6 lines. Recorded as AC-14 so a future pass does not "finish the job".

Untouched per AC-13: lens definitions, per-lens finding taxonomy, severity qualitative
clauses, investigation sensors, and every `*-fix.md` remediation-method section. These
are what distinguish the six workflows; the router's one-row-per-workflow shape and
`EXPECTED_WORKFLOW_COUNT = 36` are unaffected.

## D5 — `skills/AGENTS.md` Model hint column is deleted, not converted

AC-1 permits either deleting the column or replacing its values with
`metadata.model_tier`. **Delete** is chosen: converting to tier keeps a second copy of a
fact the charter owns, so it can still drift — quietly, since tier drift is less visible
than a wrong model name. A one-line pointer to `metadata.model_tier` costs nothing and
has no drift surface.

`skills-harness-integrity.test.ts:193-203` requires only that the registry contain the
literal `skills/agents/<name>/SKILL.md` (the Charter column). The Purpose/Trigger/Model
columns are unasserted, so the Model column is removable without touching a guard.

## D6 — New sensors, and why each is a scan rather than a fixed list

Three of the four defects this feature fixes were invisible to a passing suite. Each new
gate therefore enumerates from disk instead of hardcoding the instances found today.

| Gate | Shape | Why not the narrow form |
| --- | --- | --- |
| No model name in `skills/AGENTS.md` (AC-2/3) | scan file against the registry's model IDs **and** display-name spellings | `subagent-parity.test.ts:455-542` already does this — for `FEATURES.md` only. The defect was a file that scan did not cover. |
| No `/Users/` or `/home/` path under `skills/` (AC-4) | scan all 152 files | fixing 3 known sites leaves the 4th |
| Roles table covers every charter (AC-16) | enumerate `skills/agents/*/` and require each in `agent-orchestration.md` | the existing guard checks mentioned paths resolve, which is the opposite direction and is why `judge`/`meta-judge` were invisible |
| Roster count (AC-17) | reject any count ≠ 17 in the "N specialists" shape | `workflow-harness-contract.test.ts:348-371` bans the literal "16", so "15" in `CLAUDE.md` passed |
| Duplication ceiling (AC-19) | `excessLines` at window=4 ≤ post-cleanup value | a snapshot equality goes red on any unrelated edit |

The ceiling is set to the exact post-cleanup measurement with no headroom. Headroom is
what makes a ceiling report without enforcing; raising it is a deliberate edit with a
reason, which is the intended friction.

## D7 — Regeneration is part of the change, not follow-up

`skills/` sources and `apps/*-plugin/skills/` bundles are byte-identical by contract.
`scripts/generate-skill-artifacts.ts --check` diffs full directory inventories, so a
stale bundle entry fails it. Regeneration runs in the same task as the source edit that
causes it; `--check` reporting `No drift` is the per-task gate, not a final step.

## D8 — Risks

| Risk | Control |
| --- | --- |
| A pointer replaces a rule in a file whose loader is conditional, so the rule vanishes at runtime | every replacement's loader verified and recorded in D3; the one that failed drove D2 |
| Extraction weakens a per-lens distinction | AC-13 enumerates what stays; the six lens sections are not opened |
| Reconciling drift silently drops the weaker copy's content | AC-8 and AC-9 require the stronger claim to survive, and both merges are named explicitly |
| A guard-mandated duplicate gets "cleaned" | spec §3 lists all eight with their enforcing test; SDD-10 pins the four counts |
| Bundle drift | D7 |
