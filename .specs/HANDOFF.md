# Handoff — subagent-tool-inheritance (VALIDATED 2026-08-11 — 12 commits, 4 batch workers plus an independent verification pass; every gate green; unpushed, push/PR = user decision)

Session `spec-subagent-tool-inheritance` · workflow **spec-driven** · persona pin
`context-skill-harness-engineer-architect` · branch `fix/subagent-tool-inheritance`
from `origin/main` @ `c32b8a22`, worktree
`/Users/luizmassa/Projects/massa-ai-wt-subagent-tool-inheritance`. Range
`c32b8a22..<this commit>` (12 commits: 1 spec+design + 9 task commits across 4
sequential batch workers + 1 out-of-scope test repair + this close-out. Sections below
marked "written by Batch Worker 4" predate the verification pass; the Gates, Next Step
and Blockers sections have been updated to the final state).

## Objective

Claude sub-agents (all but `navigator`) could reach no MCP tool the parent session had
active, because `emitClaude` emitted a `tools:` allowlist that excludes MCP tools by
omission — `designer`'s charter mandates reading Figma through MCP and
`context-curator`'s mandates calling `recall`, both structurally impossible on Claude.
Folded in: retiring the "Never spawn subagents" blanket prohibition (18 charters + 4
reference lines), and a dispatch-time model/effort announcement contract. Contract:
`.specs/features/subagent-tool-inheritance/{spec,design,tasks}.md`.

## State

10 commits: `f5dc2637` spec+design → `5dd7c006` T1 `claudeToolPolicyFor`/`emitClaude` →
`5f3f8ba3` T2 `subagent-parity.test.ts` rewrite + per-host MCP-blocking sensor →
`de57344e` T3 retire the spawn prohibition from 18 charters → `b9a79e07` T4 retire it
from 4 shared reference lines → `fad0bc82` T5 dispatch announcement contract →
`e162b4ba` T6 guard sensors S8/S9 → `4f82e1d3` T7 `toolGating` capability field →
`43580e32` T8 CLAUDE.md + CHANGELOG → this commit T9 close-out.

## Completed

- T1/T2 (STI-01/02/03): `claudeToolPolicyFor` replaces `toolsFor`; `emitClaude` emits
  `disallowedTools: Write, Edit, NotebookEdit` for read-only charters, neither key for
  write charters, `navigator`'s allowlist unchanged. Cursor/Codex/OpenCode untouched; a
  new sensor fails on a future MCP-blocking construct on those hosts.
- T3/T4 (STI-04): nesting prohibition removed from 18 charters + 4 reference lines (the
  true count — the spec's first sweep undercounted at 3); the sequential-execution rule
  for batch workers restated separately from the sentence that carried it.
- T5/T6 (STI-05): every massa-ai roster dispatch announces model/effort read from the
  installed agent file; S8/S9 guard the contract and its path table against drift.
- T7 (STI-15): `scripts/lib/host-capabilities.ts` gained `toolGating`
  (`"denylist" | "none" | "sandbox" | "permission-map"`), one value per host with the
  verbatim documentation citation that established it — documentation-bearing only, no
  emitter reads it. Updated the two fixture-host `HostCapabilities` literals the new
  required field obliges.
- T8 (STI-15): `CLAUDE.md`'s agent-harness section states the per-host tool-gating
  contract (Claude denylist so MCP inherits, `navigator` the deliberate allowlist
  exception, the other three hosts have no allowlist to maintain). `CHANGELOG.md`
  gained `### Fixed` / `### Changed` / `### Added` under `[Unreleased]` — `Added`'s
  presence carries a **minor** bump per CONTRIBUTING's table, and this does change
  generated plugin artifacts across all four host bundles (a public compatibility
  surface), matching that judgment.
- T9 (this commit): `.specs/project/STATE.md` and `.specs/HANDOFF.md` rotated (prior
  Current/top section renamed to Previous, then the new section prepended — section
  counts 49→50 and 6→7 respectively, verified, not just asserted);
  `.specs/project/FEATURES.json` gained a `subagent-tool-inheritance` entry with all
  four phase flags `true`.

## A real regression the T9 build gate found, outside this batch's write set — FIXED by `c6495d73`

**Resolved.** `bun run test:plugins` is now **135 pass / 0 fail**. Before fixing, the
class was enumerated across all four plugin suites rather than only the named instance:
exactly 1 offender. The `allowed-tools:` hits in the Codex and Cursor manifest tests
are slash-command frontmatter, not agent tool gating. The repair mirrors T2's rewrite —
both halves assert the **presence** of the expected gating key, so neither can pass on
an empty line, which is how the original passed vacuously for read-only agents while
failing outright for write agents. Mutation-proved: reverting `emitClaude`'s denylist
branch to the old allowlist reddens it with `Expected: "disallowedTools: Write, Edit,
NotebookEdit"` / `Received: null`.

The original finding, kept because the *why* is the reusable part:

`bun run test:plugins` → **134 pass / 1 fail**. The failure is
`apps/claude-plugin/__tests__/install.test.ts` → "CLA-02: read-only agents lack
Write/Edit; write agents include them". It asserts the **pre-fix allowlist contract**
against the real installed bundle (`tools:` line must contain `Write`/`Edit` for the 5
write agents) — after T1's change, write agents carry no `tools:` line at all, so the
assertion reddens. This is the identical vacuous-then-broken shape `design.md`'s Risks
table already named and closed for `scripts/__tests__/subagent-parity.test.ts` (T2's
scope, S3), but `apps/claude-plugin/__tests__/install.test.ts` is a **separate file**
none of T1-T8 touched (`git log` confirms zero commits on this branch touch it). It
stayed invisible through T1-T8 because none of those tasks' gates ran `test:plugins` —
per `tasks.md`'s Gate Check Commands table, only the **build** gate does, and T9 is the
first task that runs it.

**Not fixed here.** This batch's capability packet scoped writes to
`scripts/lib/host-capabilities.ts`, `CLAUDE.md`, `CHANGELOG.md`, and the three
`.specs/` state artifacts only — `apps/claude-plugin/__tests__/install.test.ts` is
outside that write set, and the Builder charter forbids writing outside the assigned
set. Reported here rather than silently patched or the test weakened. The fix is
mechanical and the same shape T2 already applied: rewrite the assertion to check for
the presence of the exact `disallowedTools: Write, Edit, NotebookEdit` line (read-only)
and the absence of any `tools:`/`disallowedTools:` line (write agents), instead of
substring-matching an empty `tools:` line.

## STI-14 — NOT RUN (recorded as a skipped sensor, not as passed)

The live-host MCP behavioral check (a dispatched sub-agent successfully calling a real
MCP tool) has **not been run**. It requires a host session with an MCP server active
and a real dispatch, which is not reachable from this batch-worker worktree. **Do not
read this feature as behaviorally verified.** The `disallowedTools`-honoured-on-plugin-
sub-agents assumption (`spec.md` § Assumptions & Open Questions) stays evidence-grade
**B**: two independent prose supports (the plugin field-restriction is a closed
three-field enumeration that excludes `disallowedTools`; the nesting section cites
`disallowedTools` as a working sub-agent control with no plugin caveat), neither a
behavioral observation. STI-14 is the only thing that closes it to grade A. Per
`design.md`'s Risks table: if `disallowedTools` turns out ignored for plugin
sub-agents, read-only agents silently gain `Write`/`Edit`, and this feature is
**Blocked**, not shipped with a caveat.

## Gates (measured 2026-08-11, this worktree)

| Gate | Result |
| --- | --- |
| `bun run lint` | 0 errors |
| `bun run type-check` | 6/6 tasks successful |
| `XDG_CONFIG_HOME=$(mktemp -d) bun scripts/generate-subagent-artifacts.ts --check` | no drift |
| `bun run test:scripts` | **1804 pass / 0 fail** (80 TS files; baseline at HEAD 1803/0, +1 new `toolGating` test from T7) |
| `bun run test:plugins` | **135 pass / 0 fail** after `c6495d73` |

Per-task counts: after T7, `test:scripts` 1804/0 (baseline 1803/0). After T8,
`test:scripts` 1804/0 (docs-only, no test delta).

Shell-suite count correction: `CLAUDE.md` says `test:scripts` covers 21 shell suites;
the verifier measured **29**. A stale figure inherited from the docs, not a regression
from this feature. Not fixed here, to keep the diff scoped.

## Independent verification — PASS

`massa-ai-verification-agent`, author ≠ verifier, report at
`.specs/features/subagent-tool-inheritance/validation.md`.

It re-derived every count instead of trusting the author's: **0** spawn prohibitions
across charters, references, and all **72** generated host files — a population the
author never swept; **18/18** retained router/persona clauses; **108/108** generated
Claude files carrying the correct gating key for their class (18 agents × 6
directories). Every sweep was run in two grep dialects, because this repo's git build
silently drops `\b` under `-E` and has previously returned a false clean.

Discrimination sensor: **6/6 mutations killed, 0 survived**, across the inherit branch,
the denylist branch, the navigator allowlist, the charter clause (×2), and the
reference sequential-execution rule. Each was mutated in place and restored by text
edit — never `git checkout` — with a porcelain-clean check after every restore.

Three gaps were raised and all three are closed on this commit:

1. These state artifacts were stale, still reporting the 134/1 regression.
2. STI-03.1 demanded byte-identical artifacts, which STI-04's charter-body edits make
   structurally unachievable — the spec contradicted its own design and the design was
   right. Amended to "the emitters carry zero diff lines", now measured: `emitCursor`
   **0**, `emitCodex` **0**, `emitOpenCode` **0**.
3. S5 and S6 named the offending file but not the line, which STI-04.5 requires. Both
   now emit `path:line: <matching line>`, mutation-proved RED before being trusted.

## Next Step

1. **Run STI-14** — the only thing that closes the one open assumption. Dispatch any
   massa-ai sub-agent from a host session with an MCP server active and confirm it can
   call that server's tool. Note the check is behavioural: the generated file will
   contain **no** MCP tool names, because the fix works by removing the allowlist.
2. Push and open a PR — the user's decision, not taken unattended.
3. Optional follow-up: correct `CLAUDE.md`'s 21-vs-29 shell-suite count.

## Blockers

- None blocking. STI-14 remains **open, not failed**: it needs a live host session with
  an active MCP server, which is not reachable from this worktree. Until it runs, the
  `disallowedTools`-honoured-on-plugin-sub-agents assumption stays evidence-grade **B**
  — supported by a closed three-field enumeration of what plugin sub-agents ignore, and
  by a documentation line citing `disallowedTools` as a sub-agent control with no
  plugin caveat, but not by an observation.

## Uncommitted Files

- None at T9 commit time (all staged + committed).

## Branch

`fix/subagent-tool-inheritance`, 10 commits ahead of `origin/main` @ `c32b8a22`.
Unpushed.

## Previous handoff — designer-agent (VALIDATED 2026-08-11 — 11 commits, gates green; unpushed, push/PR = user decision)

Session `spec-designer-agent` · workflow **spec-driven** · persona pin
`context-skill-harness-engineer-architect` · branch `feat/designer-agent` from
`origin/main` @ `f8427283`, worktree `/Users/luizmassa/Projects/massa-ai-wt-designer-agent`.
Range `f8427283..e51d3297`.

Two deliverables, disjoint commits.

1. **ADR/refactor Plan Challenge Gate (T1-T2, commits `28fefc94`, `8dc274dc`).**
   `skills/AGENTS.md` named six workflows in the full-gate set; `adr.md` and
   `refactor.md` carried no gate step. Both now run it inline. The recurrence
   sensor (`workflow-harness-contract.test.ts` group 11) **parses** the workflow
   list out of the policy sentence rather than hardcoding it, and found
   `refactor.md` on its first run. Mutation-proved GREEN → RED(1) / RED(1) /
   RED(3) → GREEN with SHA-verified in-memory restores.

2. **`designer` sub-agent, the 18th specialist (T3-T13, 9 commits).** Charter at
   `skills/agents/designer/SKILL.md`, tier `standard`, `permission: write`
   narrowed to the UI layer. Dispatched from 7 screen-capable workflows under a
   new Screen Implementation Exception; the dispatch is mandatory once the task
   touches a screen and silent otherwise. Full 4-host parity: 72 agent files
   (was 68), 396 variants (was 374), every installer/gate/doc/marketplace moved
   17 → 18.

**Gates (all green, 2026-08-11):** lint 0 errors · type-check 6/6 ·
`generate:artifacts --check` no drift · `test:scripts` **1777 pass / 0 fail** ·
`test:plugins` **135 pass / 0 fail** · opencode `agents-install` 7/0.

**Read `.specs/features/designer-agent/validation.md` before merging.** Its verdict
is PASS **with independence NOT satisfied** — the `verification-agent` dispatch was
skipped (platform policy forbade spawning subagents this session) and the fresh-eyes
fallback was run by the author. An independent verification pass is the single
highest-value thing a next session can add.

**Worktree provisioning note:** this worktree needed `bun install`, `bun run build`
**and** `bunx prisma generate` before `test:scripts` could go green. Four of the
first run's ten failures were that, not code — do not read them as regressions.

**Next step:** push `feat/designer-agent` and open the PR (not yet authorized), or
run an independent verification pass first.

## Previous handoff — admin-portal-config-installer-defaults (GATES GREEN 2026-08-10 — push/PR pending, DO NOT MERGE)

Session `debug-admin-portal-config-installer-defaults` · workflow **debug** · branch
`fix/admin-portal-config-installer-defaults` from `origin/main` @ `398dc647` (v1.47.0) ·
worktree `/Users/luizmassa/Projects/massa-ai-wt-admin-config-defaults`.
Report: `.specs/debug/admin-portal-config-installer-defaults/REPORT.md`.

## State

7 commits. Five reported symptoms → four root causes (two symptoms shared one), plus
three defects found while fixing and one regression this branch introduced and then
fixed. All gates green with real exit codes — see the report's verification table.

**Do not merge.** Merging `main` auto-cuts a release and that go-ahead was explicitly
withheld. CHANGELOG carries `### Added` + `### Fixed` under `[Unreleased]` → **minor**
bump on merge.

## Decision correction to surface at review

The installer's scheduler option was chosen from a preview showing
`checkpoint-purge: true`, but the same option's description said it mirrors the existing
`MASSA_AI_SCHEDULER_SAFE_DEFAULTS` preset — and `applySafeDefaults` enables only
`memory-consolidation` + `decay-sweep`. The **named mechanism won**: checkpoint-purge
ships off. If the preview was the intent rather than the description, that is a one-line
change to the installer's preset and needs saying now.

## Two operational items for the user, outside this PR

1. **Restart the `:3333` API after this merges.** The process currently serving it is one
   this session started from the repo source (PID 72647); the stale duplicate (PID 81182,
   started 2026-08-09 22:40) was killed. Only a restart puts the new fail-loud bind in
   effect — until then a duplicate bind is still silent.
2. **Unrelated runaway: PID 75218**, `bun test src/__tests__/rlm-admin.te…`, running since
   30 Jul at ~99% CPU, ~15690 CPU-minutes. It is a standing source of test-timeout noise
   on this host. **Not killed** — that is the user's call.

## Environmental traps when re-running the gates

- Scratch `XDG_CONFIG_HOME` on **every** run: a real `~/.config/massa-ai/config.json`
  has `llm.enabled: true` and breaks drift gates and LLM-reaching suites.
- `bun run test` under turbo cancels sibling tasks when one fails, so a real failure in a
  later package can be hidden entirely by an unrelated flake in an earlier one. That is
  how the scheduler regression stayed invisible for a full aggregate run. When a package
  fails, re-run before believing the failure list is complete.
- `mcp-client` `embedded-api-client-endpoints.test.ts` is contention-sensitive here: 4
  timeouts at 5001 ms inside a 10-way turbo run, 97/0 in 923 ms standalone.

## Next Step

Push, `gh pr create`, `gh pr checks --watch`, then hand to Luiz. No self-merge.

## Previous handoff — admin-portal-ops-suite (MERGED 2026-08-10 as PR #101, released v1.47.0)

Session `spec-admin-portal-ops-suite` · workflow spec-driven · branch
`spec/admin-portal-ops-suite` from `origin/main` @ `c82d8f92` (v1.46.0) ·
worktree `/Users/luizmassa/Projects/massa-ai-wt-admin-portal-ops-suite`.
Contract: `.specs/features/admin-portal-ops-suite/{spec,design,tasks,context,validation}.md`.

## State

Execute complete: **22 commits** — T1–T20 across 7 sequential phase workers
(one `massa-ai-builder` per phase, single shared worktree, one atomic commit per
task), plus 2 post-verification repairs, plus this close-out. Validation PASS
WITH FINDINGS by an independent `massa-ai-verification-agent` that authored none
of the implementation; both of its actionable findings are now **closed**, and
the third (T21 close-out never run) is closed by this commit.

**33/33 requirement IDs SATISFIED. 7/7 pre-mortem findings conformed. 7/7
mutations killed.** Remaining: push the branch, open the PR, drive CI green,
hand to Luiz. **Do not merge** — merging `main` auto-cuts a release, and that
go-ahead was explicitly withheld. CHANGELOG carries `### Added` + `### Fixed`
under `[Unreleased]` → a **minor** bump cuts on merge.

## MANDATORY acceptance step — cannot be closed by CI (CPP slice)

Claude's plugin-cache refresh cadence is **not verifiable from this repository**.
The only evidence is that `installed_plugins.json`'s `lastUpdated` moved with the
installer's own `claude plugin update` and with none of the 189 recorded session
startups — suggestive, not proof. So after merging and installing:

1. Switch Claude to a non-default profile (Models tab, or `POST /api/v1/profiles/switch`).
2. **Fully restart the Claude Code session** — not a new tab, a full restart.
3. Re-read `<installPath>/agents/massa-ai-builder.md` and check its model line.

If it still carries the switched profile, CPP is validated end-to-end. **If it
reverted to the bundle default, report the reversion — do not report the switch
as effective.** The recorded `platforms.claude.modelProfile` stays authoritative
and the CPP-07 installer re-apply (proven by
`scripts/tests/test-plugin-marketplace-cache-refresh.sh` scenarios 6–7) is the
supported recovery path. Resolve `<installPath>` from
`~/.claude/plugins/installed_plugins.json`; it is version-pinned and moves on
every plugin update, which is exactly why nothing caches it.

## What the verifier caught that the green suites could not

Both gaps sat behind fully green gates — which is the point of the independent pass:

- **MBD-06/07** — `tasks.md`'s Test Coverage Matrix and `design.md`'s
  Verification Design table both promised a `routes/project.test.ts` extension
  asserting the memories-only scope; it was never written, and every pre-existing
  reset case posts a bare `{projectId}` taking the full-scope defaults. Closed in
  `b47b8de4`; mutating `if (clearVectors)` → `if (true)` turns it RED (16/2).
- **Pre-mortem #6** — `design.md` recorded the tombstone disclosure as an
  *applied* revision; it was never coded. Closed in `cfe09133`; dropping the note
  turns the new case RED (521/1).

Both were proven by an observed red before commit, and both restores used file
copies — never `git checkout`, which restores to HEAD rather than to the
pre-mutation state.

## Note for whoever next appends a decision to STATE.md

`.specs/project/STATE.md` has **two** `## Decisions` headings — **L3735**
(AD-007..AD-015) and **L3845** (AD-001..AD-006 plus AD-016..AD-019). No single
table holds "AD-007..AD-019", so an instruction phrased that way is ambiguous.
**AD-020 was appended after AD-019 in the L3845 table**, with an inline HTML
comment recording why, so the numeric sequence stays contiguous and findable.
The duplicate heading is a pre-existing rotation defect, recorded in this
feature's design Risks table; repairing it is its own task and was left alone.

## Residual risks (accepted, recorded in validation.md)

- **LOG-14/15 are proven at data level, not DOM/platform level.** The live
  `tbody.innerHTML` append path is asserted only through the `state.logsEntries`
  accumulator, and the abort-vs-genuine-failure branch through a hand-rolled
  `FakeAbortController`, not the platform global. Production paths are simple by
  inspection; closing these needs a seeded-DOM harness the suite doesn't have.
- **The empty-state → first-live-entry DOM transition is unasserted.** With no
  `table.logs-table` rendered yet, the first live entry lands in
  `state.logsEntries` but is not patched into the DOM until the next apply.
- **The project-select-closes-open-form edge case has no dedicated test.** The
  behavior lives inline in `startApp()`'s `projectSelect` change listener; making
  it unit-testable means extracting it the way `handleMemoryDeleteProjectCancel`
  already is.
- **Sink-directory-creation failure → `source:"buffer"` is structurally correct
  but not integration-tested.** It holds because a failed `mkdirSync` means the
  file never exists, so `logs.ts`'s `files.length === 0` check falls through.
- **Rotation across processes is best-effort.** Every massa-ai process appends to
  one sink with `O_APPEND` (so no line is truncated), but a rotation race can
  misfile a few lines. Documented in the spec, not engineered around.
- **Pre-existing, out of scope:** `apps/tools-api/src/routes/project.test.ts`'s
  header comment names `project-reset.test.ts` and `project-identity.test.ts` as
  siblings; neither exists. Zero diff in this branch — worth a follow-up.

## Environmental traps when re-running the gates

`bun run test:scripts` fails exactly 2 tests in
`scripts/__tests__/generate-subagent-artifacts.test.ts`
(`opencode/agent-profiles/local_models drift detected`) on a machine whose real
`~/.config/massa-ai/model-profiles.json` defines a `local_models` overlay —
`generate:artifacts` reads the effective registry while `--check` compares
against builtin-only output. Under `XDG_CONFIG_HOME=$(mktemp -d)` that file is
53 pass / 0 fail. CI has no config file and never sees it. This sandbox also has
no `DATABASE_URL` exported; prefix Postgres-touching runs with
`postgresql://massa_ai:massa_ai_password@localhost:5432/massa_ai`. **Any figure
quoted from those suites must name which config state it was measured in.**

## Gates at delivery (exit codes captured, not eyeballed)

| Gate | Exit | Result |
| --- | --- | --- |
| `bun run lint` | 0 | clean |
| `bun run type-check` | 0 | 6/6 tasks |
| `bun run test` | 0 | 11/11 tasks, 157 isolation groups |
| `bun run test:scripts` (scratch `XDG_CONFIG_HOME`) | 0 | 1739 pass / 0 fail |
| `bun run test:plugins` | 0 | 135 pass / 0 fail |
| `cd apps/web-ui && bun test` | 0 | 522 pass / 0 fail |
| `bun test apps/tools-api/src/routes/project.test.ts` | 0 | 18 pass / 0 fail |
| `check_specs_delivered.ts admin-portal-ops-suite` | 0 | 0 errors |

Note `check_specs_delivered.ts` checks file **presence and tracked status**, not
content — it reported 0 errors while the entire close-out was still missing. It
is not a substitute for reading the artifacts.

## Next Step

Push `spec/admin-portal-ops-suite`, `gh pr create`, `gh pr checks --watch`, up to
3 repair iterations if CI goes red, then stop and hand over. No self-merge.

## Previous handoff — installer/restart/dims batch (MERGED 2026-08-09 as PR #100)

Session `spec-installer-marketplace-update` · workflow spec-driven · branch
`spec/installer-restart-embedding` from `main` @ `6c438a98` (v1.44.0) ·
worktree `/Users/luizmassa/Projects/massa-ai-wt-installer-restart-embedding`.
Contracts: `.specs/features/{claude-marketplace-cache-refresh,
embedding-dims-consistency,admin-portal-restart}/` (spec + validation each;
all three PASS, verifier independent, 4/4 mutations killed).

## State

Implementation, review (no blocking findings, 6 advisories applied or
accepted), and validation complete. Remaining: push branch, open PR, hand to
Luiz for review/merge (no self-merge). CHANGELOG carries Added + Fixed under
[Unreleased] → minor release cuts on merge.

## Machine runbook — migrate Claude host to file route (user-run, one-time)

Why: the marketplace route serves a version-pinned cache (currently 1.28.0
while the repo is at 1.44.0) and refuses profile switching by design. File
route gives automatic profile switching (parity with codex/opencode) and
removes the stale-cache class permanently. Reverses the earlier deliberate
marketplace-route dedupe decision — Luiz's call, staged not executed
(permission classifier blocks live ~/.claude writes from the agent).

```bash
# 1. Remove the marketplace-served plugin (routes are mutually exclusive;
#    skipping this duplicates hooks + commands):
claude plugin uninstall massa-ai@massa-ai
# 2. Reinstall on the file route from the repo checkout:
MASSA_AI_SKIP_PLUGIN_REGISTRY=1 bash apps/claude-plugin/install.sh
# 3. Optional: drop the dangling marketplace entry:
claude plugin marketplace remove massa-ai
# 4. Restart the Claude Code session.
# Verify: ~/.claude/massa-ai/agent-profiles/ lists profiles;
#   install-state.json claude installRoute == "file";
#   Web UI Profiles tab shows Switch buttons for claude.
```

Alternative (stay on marketplace): `claude plugin update massa-ai@massa-ai`
after every release; post-merge the installer does this automatically from
the NEXT version bump onward (CMR fix; the current poisoned record is why
one manual update or the migration above is still needed once).

Embedding config on this machine: already `qwen3-embedding:4b`/2560 in
`~/.config/massa-ai/config.json` — no action.

## Residual risks (accepted, recorded in validation.md files)

- Respawn-rebind timing proven at seam-order level; supervised-mode flush
  proven by real-process e2e; a real respawn+rebind e2e is a candidate
  follow-up.
- Signal-path drain has unit coverage only.
- Local gates on this machine need scratch XDG_CONFIG_HOME (profile overlay)
  and a warm Ollama (embedded-endpoints suite); CI is unaffected by both.

## Previous handoff — workflow-interaction-policies (EXECUTE COMPLETE 2026-08-09 — T1-T9, 10 commits, four batch workers; validation pending; push/PR = user decision)

Session `spec-workflow-interaction-policies` · workflow spec-driven · branch
`spec/workflow-interaction-policies` from `main` · worktree
`/Users/luizmassa/Projects/massa-ai-wt-workflow-interaction-policies` (isolated).
Four batch workers split the 9 tasks across 4 phases (`4 Phases = 9 Tasks`,
phases sized to the new rule: max 3 tasks each); this handoff is written by
Batch Worker 4 (T7, T9, T8, the close-out). Contract:
`.specs/features/workflow-interaction-policies/{spec,design,tasks}.md`.

## Objective — workflow-interaction-policies

Implement the operator's spec-driven/TDD/design workflow-interaction-policy
directives: cap spec-driven batch workers at max 3 tasks/worker (ideal 2),
size phases to the same budget with an ERROR-level `validate_tasks.ts` gate,
remove every numeric per-turn question cap in spec-driven/TDD/design in favor
of an ask-first-for-important-decisions stance, and add a pre-implementation
change-summary stage (Stage 1.5 — Summarize) to `implementation-delivery.md`.

## State — workflow-interaction-policies

- 10 commits on `spec/workflow-interaction-policies`: `af1b24d7`
  spec+design+tasks → `99aed979` T1 sub-agents.md packing budget max 3/ideal 2
  → `79752fdd` T2 tasks.md phase-granularity rule + packing mirrors →
  `f0caf90b` T3 execute.md budget mirrors + over-sized-phase valve + summary
  hook → `68137985` T4 workflows/spec-driven.md mirrors + summary mention +
  version 1.4.0 → `987207fc` T5 implementation-delivery.md Stage 1.5 —
  Summarize (+ six-workflow pause audit) → `fed3d175` T6 discuss.md/specify.md
  question policy → `ecc2096b` T6 follow-up (sibling numeric caps in discuss
  Guided algorithm) → `c9400ae9` T7 tdd + workflows/design.md question policy
  → `0bcd2063` T9 validate_tasks.ts per-phase max-3 error + sensors → this
  commit T8 close-out (CHANGELOG, artifact regeneration, parity gates,
  `.specs` rotation).

## Completed

- T7: tdd's Clarification Policy and `workflows/tdd.md` step 4 replaced the
  `at most three` cap with cap-free ask-first-when-in-doubt guidance
  (`metadata.version` 1.1.0 → 1.2.0); `workflows/design.md` step 4 rewrote its
  narrow `Ask only when` list to ask whenever any important decision remains
  ambiguous after source inspection (`metadata.version` 1.3.0 → 1.4.0).
- T9: `validate_tasks.ts` gained `countTasksPerPhase()`, scoped to the Task
  Breakdown section, reporting `Phase N has K tasks (max 3 per phase, ideal
  2)` as an ERROR for any phase exceeding 3 tasks (D14). Observed-red 4-task
  fixture confirmed by stashing the script change and re-running (exit 1 →
  0); green 3-task and phase-less fixtures added. `pyts-golden/
  validate_tasks.json` inspected: every fixture holds phases of at most 2
  tasks, so no golden entry fires the new check — none re-recorded. The
  pre-existing "dogfood" test was repointed off the historical
  `tlc-330-harness-update` fixture (predates the rule, now legitimately trips
  it with 6/9/4-task phases) onto this feature's own live tasks.md.
- T8 (this commit): CHANGELOG `[Unreleased]` → `### Changed` entry for the
  whole feature (batch-worker cap + validator enforcement, question-cap
  removal, Stage 1.5); `bun run generate:artifacts` + `--check` both exit 0
  when isolated from this machine's local `~/.config/massa-ai/model-
  profiles.json` overlay (`XDG_CONFIG_HOME=$(mktemp -d)` — the overlay
  legitimately diverges plain-generate output from `--check`'s builtin-only
  comparison, REG-13/REG-18, unrelated to this feature); subagent-parity,
  skill-artifact-parity, skills-harness-integrity suites all green;
  `.specs/project/STATE.md` and `.specs/HANDOFF.md` rotated (prior
  Current/top section renamed to Previous, new section prepended);
  `.specs/project/FEATURES.json` gained a `workflow-interaction-policies`
  entry (`status: "in_progress"`) and `active_feature` updated.

## Gates (measured 2026-08-09, this worktree)

- `bun test scripts/__tests__/spec-driven-validators.test.ts` → 66 pass / 0
  fail.
- `bun test scripts/__tests__/pyts-golden.test.ts` → 46 pass / 0 fail.
- `bun run lint` (oxlint) → exit 0.
- `XDG_CONFIG_HOME=$(mktemp -d) bun run generate:artifacts` → exit 0.
- `XDG_CONFIG_HOME=$(mktemp -d) bun run generate:artifacts --check` → no
  drift (plain `--check` on this machine reports drift in
  `opencode/agent-profiles/local_models` — a local model-profiles.json
  overlay effect per REG-13/REG-18, not a defect in this feature).
- `bun test scripts/__tests__/subagent-parity.test.ts` → 65 pass / 0 fail.
- `bun test scripts/__tests__/skill-artifact-parity.test.ts` → 23 pass / 0
  fail.
- `bun test scripts/__tests__/skills-harness-integrity.test.ts` → 32 pass /
  0 fail.
- Repo-wide literal sweep over `skills/` (T8 gate) found 3 residual hits:
  two `sweet spot` hits in `references/pr-task-fix.md` and
  `references/tdd/document-contract.md` are an unrelated PR-line-count
  sizing convention (matches spec.md's Out of Scope "Re-benchmarking worker
  sizes" / "Broader single-sourcing of spec-driven packing prose" rows, and
  the tasks.md coverage matrix's own "(packing contexts)" qualifier on this
  literal); the one genuine `at most three` cap the sweep surfaced
  (`skills/massa-ai/references/ticket/intake-and-sources.md:19`) was closed
  by follow-up commit `61434ca` immediately after close-out; the sweep now
  returns no question-cap hits anywhere under `skills/`.
- `bun skills/massa-ai/scripts/validate_state.ts --root .` → does not exist
  in this checkout; skipped per instruction.
- `bun skills/massa-ai/scripts/check_specs_delivered.ts
  workflow-interaction-policies --root .` → see Next Step (run after this
  commit lands, since the artifacts it checks must be committed first).

## Next Step

Execute is **done** (T1-T9 + T8 close-out); validation has not run.

1. Dispatch an independent verifier (author ≠ verifier) with spec.md's WF-01
   through WF-16 requirements, the git diff surface (10 commits from
   `af1b24d7`), the touched files, and the coverage matrix in tasks.md.
   The `ticket/intake-and-sources.md` straggler is already closed
   (`61434ca`) — the verifier confirms the fix rather than dispositioning an
   open question.
2. If PASS: write
   `.specs/features/workflow-interaction-policies/validation.md`, flip
   `FEATURES.json`'s status to `"complete"`, re-run `check_specs_delivered`
   and `validate_state.ts --root .` (if present).
3. If FAIL: route gaps to fix tasks, re-verify.
4. Push/PR/merge remain the user's decision.

## Blockers

- None blocking this close-out. The `ticket/intake-and-sources.md`
  straggler was closed by `61434ca`; no open residual remains.

## Uncommitted Files

- None at T8 commit time (all staged + committed).

## Branch

`spec/workflow-interaction-policies`, 10 commits ahead of `main`. Unpushed.

## Previous — admin-portal-ux-overhaul (EXECUTE COMPLETE 2026-08-09 — T1-T15, 16 commits, five batch workers; validation pending; push/PR authorized)

Session `spec-admin-portal-ux-overhaul` · workflow spec-driven (Large) ·
branch `spec/admin-portal-ux-overhaul` from `main` @ `b1831197` (v1.43.0) ·
worktree `/Users/luizmassa/Projects/massa-ai-wt-admin-portal-ux-overhaul`
(isolated). Five batch workers split the 15 tasks across 3 phases; this
handoff is written by Batch Worker 5 (T13-T15, the close-out). Contract:
`.specs/features/admin-portal-ux-overhaul/{spec,design,tasks}.md`.

## Objective — admin-portal-ux-overhaul

Overhaul the admin portal (apps/web-ui): per-agent per-tool capability tier
overrides (the only genuinely new capability — 17 agent rows × 4 tool
columns), a Model Catalog grid restructure (Tool + Tier leading columns,
Provider/Model split fields), a single Save & Apply action replacing Save
Overlay + Regenerate Artifacts, plain-English Scheme A nomenclature (no
user-visible "overlay"/"tombstoned"/"registry"/"host" in the Models tab),
`prompt()`/`alert()` replaced by inline dropdown forms, and a five-tab
(Projects/Checkpoints/Dashboard/Config/Models) styling + help-card pass.

## State — admin-portal-ux-overhaul

- 16 commits on `spec/admin-portal-ux-overhaul`: `6770a092` spec+design+tasks
  → `dfac0271` T1 agentTiers schema/merge/normalize → `7c50b70d` T2 generator
  resolution + stale-agent warn → `cd3a2cbf` T3 `agents` array in the GET
  route (+ unmocked round-trip sensor) → `9fc5117c` T4 Tool/Tier leading grid
  columns → `c93dfa9b` T5 Provider/Model split fields + hints → `9efe1599`
  T6 Per-Agent Tier Overrides table → `4591a493` T7 inline dropdown forms
  replace prompt()/alert() → `0fcb7d4d` T8 unified Save & Apply →
  `10a6db1f` T9 Scheme A nomenclature + 3-word negative-vocabulary sensor →
  `2857a7d3` T10 Projects Delete button + Files header → `59cb95db` T11
  shared button/form-grid/help-card/code CSS system → `765cc689` T12 Config +
  Checkpoints polish → `04ef9045` T13 Dashboard stat cards → `469ab106` T14
  plain-English help cards on all five tabs + extended the T9 sensor to the
  4th word ("registry") → this commit T15 close-out.

## Completed

- T13: `apps/web-ui/src/static/dashboard.js` section renderers restyled into
  `.stat-card`/`.stat-grid` cards (Title Case labels, `toLocaleString("en-US")`
  numbers, ids wrapped in `<code>`); `.stat-card`/`.stat-grid`/
  `.dashboard-table` rules added to styles.css. Web-ui 444 → 448 pass.
- T14: bare "?" `.registry-help` toggle replaced by `.help-card` titled
  collapsibles ("About this tab") on Projects, Checkpoints, Dashboard,
  Config, and the Model Catalog, rewritten in plain English with the Scheme A
  nomenclature (what indexing does / what Delete removes, what a checkpoint
  is, per-section Config saves + restart badges, what a profile is +
  Light/Standard/Deep tiers + Per-Workflow/Per-Agent Tier Overrides + the
  Save & Apply CLI-restart consequence + Discard All Overrides + Removed
  Profiles). Eliminated the remaining user-visible "registry" prose in the
  Models tab (help text, catalog-empty/error messages, the Discard All
  Overrides confirm/success text) and extended the P2-D AC1
  negative-vocabulary sensor to all four banned words. Config's existing
  per-section "Field guide" toggle kept its `config-field-guide` class
  untouched — `config-forms.test.ts` (out of this task's write set) asserts
  that class literally 15 times; the new Config-tab prose instead landed as
  a separate top-level help card. Web-ui 448 → 456 pass.
- T15 (this commit): CHANGELOG `[Unreleased]` Added/Changed entries for the
  whole feature; `.specs/project/STATE.md` and `.specs/HANDOFF.md` rotated
  (prior Current renamed to Previous, new Current/top section prepended);
  `.specs/project/FEATURES.json` gained an `admin-portal-ux-overhaul` entry
  (`status: "in_progress"`, matching this schema's two-value enum since
  validation has not run) and `active_feature` updated. Full gate sweep
  below.

## Gates (measured 2026-08-09, this worktree)

- `cd apps/web-ui && bun test` → 456 pass / 0 fail.
- `bun test scripts/__tests__/model-profiles.test.ts
  scripts/__tests__/generate-subagent-artifacts.test.ts` → 124 pass / 0 fail.
- `bun test apps/tools-api/src/routes/model-registry.test.ts
  apps/tools-api/src/routes/model-registry-round-trip.test.ts` → 23 pass /
  0 fail.
- `bun run type-check` → 6/6 successful (turbo).
- `bun run lint` (oxlint) → exit 0.
- `bun run generate:artifacts --check` → no drift.
- `bun skills/massa-ai/scripts/check_specs_delivered.ts
  admin-portal-ux-overhaul --root .` → exit 0 (after this commit).
- Full `test:scripts` / tools-api isolated-runner / core suites were **not**
  run in this worktree — no live PostgreSQL here (stated constraint for this
  batch). Those, plus `validate_state.ts`, are the verification agent's
  gates.

## Next Step

Execute is **done**; validation has not run.

1. Dispatch `massa-ai-verification-agent` (author ≠ verifier) with spec.md's
   14 APUX requirements, the git diff surface (16 commits from `b1831197`),
   the touched test files, and the coverage matrix in tasks.md.
2. If PASS: write `.specs/features/admin-portal-ux-overhaul/validation.md`,
   flip `FEATURES.json`'s status to `"complete"`, re-run
   `check_specs_delivered` and `validate_state.ts --root .`.
3. If FAIL (≤3 iterations): route gaps to fix tasks, re-verify.
4. Push/PR is **authorized** by this batch's instructions (unlike the prior
   admin-portal-correctness-repair handoff, where push/PR was left as a pure
   user decision) — still confirm the CHANGELOG-derived release bump
   (`release-version.ts --dry-run`) before merging, since a merge to `main`
   with green CI cuts a release.

## Blockers

- None.

## Uncommitted Files

- None at T15 commit time (all staged + committed).

## Branch

`spec/admin-portal-ux-overhaul`, 16 commits ahead of `main` @ `b1831197`
(1 spec + 15 task commits). Unpushed.

## Previous — admin-portal-correctness-repair (**VALIDATED PASS 2026-08-08** — T1-T11 + 1 fix loop, 19 commits, two batch workers; unpushed; push/PR = user decision)

Session `spec-admin-portal-correctness-repair` · workflow spec-driven (Large) ·
branch `fix/admin-portal-correctness-repair` from `main` @ `69c0632c` (v1.42.0)
· worktree `/Users/luizmassa/Projects/massa-ai-wt-admin-portal-correctness-repair`
(isolated). Two batch workers split the 11 tasks: Batch Worker 1 delivered the
spec/design/tasks plus T1-T8 (Phases 1-2); Batch Worker 2 delivered T9-T11
(Phase 3), this handoff. Contract:
`.specs/features/admin-portal-correctness-repair/{spec,design,tasks}.md`.

## Objective — admin-portal-correctness-repair

Repair 8 correctness defects (F1-F8), 2 security issues (S1-S2), 1 quality
issue (Q1 — duplicate SSE handler), and 4 spec/state drifts (D1-D4) found by a
prior 66-commit audit spanning releases v1.41.0 and v1.42.0. Phase 1 (P0):
overlay deep-merge with `null` tombstones, project-list loud failure, one
connection pool per vector store, schema-qualified table enumeration, mask
sentinel never persisted, install status derived from the switch report.
Phase 2 (P1): the model-registry routes 501-degrade off-checkout instead of
throwing, secret files are owner-only and their backups bounded. Phase 3
(P2): one SSE handler behind two routes (T9), `.specs/` state truth restored
(T10), the carried admin-portal work (D5/APCR-11) closed out with a
CHANGELOG entry and the APCR-11.5/11.6 amendment T11 covers.

## State — admin-portal-correctness-repair

- Batch Worker 1: spec/design/tasks + T1-T8, 11 commits — see
  `.specs/features/admin-portal-correctness-repair/tasks.md` for the full
  execution plan, dependency graph, and gate-check commands.
- Batch Worker 2 (this handoff): T9 `f6a11d1e` (SSE handler factory) → T10
  `ea463c3a` (state-truth corrections) → T11 this commit (CHANGELOG,
  APCR-11.5/11.6, close-out). All 11 tasks landed, 15 commits total on the
  branch.

## Completed

- T9: extracted `createRegenerateStreamHandler()` — one implementation
  behind `POST /regenerate-and-install-stream` and the deprecated
  `POST /regenerate-stream` alias (called once per route, so the two never
  share `child`/`closedRef` state). Added a same-fixture,
  identical-frame-sequence test. Gate:
  `bun test src/routes/model-registry-stream.test.ts` 21/0,
  `npx oxlint --quiet` exit 0, `bun run type-check --force` 6/6.
- T10: `.specs/HANDOFF.md` rotated (prior Active block renamed to Previous,
  then that block prepended); `FEATURES.json`'s `admin-portal-enhancements`
  normalized `"execute-complete"` → `"complete"` with corrected notes;
  `STATE.md`'s "tools-api 25 fails pre-existing on base" corrected to the
  measured 0 fails / 29 groups, dated 2026-08-08; `validate_state.ts:270`
  now prints the **failing** feature set instead of the scanned population,
  with no bracket printed at zero errors; the 4
  `apps/*-plugin/skills/massa-ai/scripts/validate_state.ts` copies
  regenerated via `bun run generate:artifacts`.
- T11: APCR-11.5 — `handleRegistryDuplicateProfile`/`handleRegistryDeleteProfile`
  now read the display registry (`mergeRegistryForDisplay(state.registryServerData,
  state.registryOverlay)`, cached at render time) instead of the raw overlay,
  so both pickers list every effective-registry profile even when the
  overlay-only seed (APCR-01.8) is empty. APCR-11.6 —
  `handleRegistryCellEdit`'s create-on-demand path now writes `{hosts: {}}`
  without a `description` key, so `mergeProfile()` still inherits the
  builtin's real description on the first edit. APCR-11.3 — confirmed
  `handleRegistryRegenerate`'s `fetch` already sent `x-api-key` (existing
  test `REGEN-SEC`); no code gap. `CHANGELOG.md` `[Unreleased]` gained
  Changed/Fixed/Security entries covering all 11 tasks, including the two
  operator-visible behavior changes (`config.json`/backups now `0600`; the
  overlay is now a deep-merged delta). 5 new web-ui tests
  (1 CellEdit + 4 Duplicate/Delete going through `initRegistryOverlay`, per
  the coverage-matrix note that every prior test built `registryOverlay` by
  hand and couldn't see this regression).

## Validation — PASS

39/39 ACs evidenced, 5/5 mutations killed, 0 survivors. Report:
`.specs/features/admin-portal-correctness-repair/validation.md`.

Validation ran **twice**. Iteration 1 returned FAIL: three mutations survived on
APCR-01 — the P0 finding this whole feature exists to close — because
`scripts/__tests__/model-profiles.test.ts` was never extended, so the new
`mergeFlatMap` / `mergeProfile` / `normalizeFlatMap` had no direct sensor and
the pre-existing fixtures specified every key, making partial-retention
indistinguishable from whole-replace. APCR-01.10's `overlayOverrideCount` was
also computed but never returned by the route — a code gap, not a test gap.
Fix loop 1 (`6192212a` sensors, `019f8da8` APCR-01.10, `fdc55203` gate-command
docs) closed both; the re-verify killed all three prior survivors plus two fresh
mutations against the new code.

One methodology note worth carrying forward: a scratch `git worktree add` has no
`node_modules`, so `model-profiles.test.ts` reports 53p/1f there and 54p/0f in a
provisioned tree. The failing case shells out to the generator. Mutation verdicts
read in an unprovisioned scratch are unreliable for any test that shells out.

## Next Step

Execute and validation are **done**. Delivery is the user's decision and was not
taken unattended.

1. `git push -u origin fix/admin-portal-correctness-repair` — **not run.**
2. PR against `main`. The CHANGELOG merge gate is satisfied; `release-version.ts
   --dry-run` derives **1.42.0 → 1.43.0 (minor)**. Merging to `main` with green
   CI cuts a release, so approving that merge is approving a publish to
   npmjs.org and GitHub Packages, not just a merge.
3. Reviewer context: the diff touches `skills/massa-ai/scripts/validate_state.ts`
   (a managed harness surface) and `packages/shared/src/config/config-loader.ts`
   (a `0600` change that can break a `config.json` bind-mount read by another
   UID after the next save).
4. `/Users/luizmassa/Projects/massa-ai` (the `debug/registry-editor-fixes`
   checkout) still holds the 4 originally-uncommitted files. They were copied
   here byte-identical and are commit `b8eb8ace` on this branch. Nothing was
   deleted there; cleaning it up is the user's call.

## Blockers

- None.

## Uncommitted Files

- None.

## Branch

`fix/admin-portal-correctness-repair`, 19 commits ahead of `main` @ `69c0632c`
(spec/design/tasks, the carried admin-portal work, T1-T11, 1 oxlint fixup,
1 spec amendment, 3 fix-loop commits, this close-out). Unpushed.

## Previous — admin-portal-enhancements (EXECUTE COMPLETE 2026-08-08 — T1-T9, 9 commits; validation pending; push/PR = user decision)

Session `spec-admin-portal-enhancements` · workflow spec-driven (Medium) ·
branch `spec/admin-portal-enhancements` from main @ `cb2ca3d9` (PR #92 merge)
· worktree `/Users/luizmassa/Projects/massa-ai-wt-admin-portal-enhancements`
(isolated). massa-ai MCP not used this session (sub-agents unavailable — host
caches frontmatter at session start); `.specs/` files canonical. Contract:
`.specs/features/admin-portal-enhancements/{spec,design,tasks,plan-challenge}.md`.

## Objective — admin-portal-enhancements

Wire the event handlers the prior `admin-portal` feature (PR #92) left dead,
style the ~20 new CSS classes, add confirm-on-all-edits (config/profile/registry),
success/failure banners, real-time progress (SSE for regenerate, SSE+poll for
index), and surface the registry editor as a Profiles sub-tab. One new backend
route (`POST /api/v1/model-registry/regenerate-stream`); rest is frontend
(app.js, styles.css) + tests.

## State — admin-portal-enhancements

- 2 planning commits + 9 task commits on `spec/admin-portal-enhancements`:
  `cef2e736` spec+design+tasks → `2dc5dfab` plan-challenge →
  `d5ff1e7` T1 stream route → `edbb984` T2 register → `bca9b29` T3 CSS →
  `0b3e2b5` T4 banner+config handlers → `0e14cde` T5 tab+switch →
  `3469e3b` T6 registry CRUD → `6269814` T7 regenerate streaming →
  `84ff10a` T8 index progress → T9 this commit (close-out).

## Completed

- T1: New `model-registry-stream.ts` route — `POST /regenerate-stream` spawns
  `generate-subagent-artifacts.ts` with `child_process.spawn` (non-blocking),
  pipes stdout/stderr as SSE line events, terminal `done` event with exit code.
  F1 fold: follows `events.ts` `new Response(ReadableStream, {headers})` pattern.
  Test: 7/0 (SSE line emission, non-zero exit, spawn failure, blocking route
  unchanged, auth gate).
- T2: Registered route in `apps/tools-api/src/index.ts`. type-check 6/6, test:plugins 135/0.
- T3: CSS design system extension — ~20 new classes (DS-01..07) using existing
  CSS variables. F5 fold: `--accent-tint` static rgba in `:root` + dark as
  baseline for `.overlay-sourced`. 220/0 web-ui.
- T4: `showBanner` helper (clears prior, `.success`/`.error`, auto-hide 6s) +
  `handleConfigSave` (confirm names section, PUT, 400 details banner, render)
  + `handleConfigReveal` (toggle input type). 231/0 web-ui (11 new tests).
- T5: `renderProfilesView` tab switcher (Switch Profile / Edit Registry) +
  `handleProfilesTabSwitch` (persist localStorage) + `handleProfileSwitch`
  (confirm, POST, per-host results banner). 243/0 web-ui (12 new tests).
- T6: Registry in-memory overlay state (`registryOverlay`, `registryDirty`,
  `registryLoaded` guard — F2 fold) + CRUD handlers (cell edit, hostDefault,
  workflowTier, add/dup/delete/restore) + save/clear (confirm, PUT/DELETE, dirty
  reset). `beforeunload` guard when dirty. F6 mid-task gate 35/0. 263/0 web-ui
  (20 new tests).
- T7: `handleRegistryRegenerate` — confirm, fetch POST regenerate-stream,
  ReadableStream reader, parse SSE frames, success/failure banner on done,
  `regenerating` guard. 270/0 web-ui (7 new tests).
- T8: Index progress — `handleProjectIndex` sets jobId + status (replaces
  alert), `renderProjects` emits `.index-progress` line, SSE `onmessage` tracks
  matching jobId, polling fallback (2s, cap 150). F4 fold: `indexPollInterval`
  cleared on terminal + view change + beforeunload. 278/0 web-ui (8 new tests).
- T9: Full gate matrix — test:scripts 1697/4 (4 pre-existing on base, not from
  this feature), lint 0, type-check 6/6, test:plugins 135/0,
  check_specs_delivered 0. State artifacts + CHANGELOG updated.

## In Progress

- Feature-level validation: dispatch verification-agent (author ≠ verifier) to
  write `.specs/features/admin-portal-enhancements/validation.md`.

## Next Step

1. Dispatch `massa-ai-verification-agent` sub-agent with spec.md ACs + git diff
   surface + test files + validate.md checklist.
2. If PASS: `validate_state.ts admin-portal-enhancements --root .` exit 0.
3. If FAIL (≤3 iterations): route gaps to fix tasks, re-verify.
4. Push/PR = user decision (not taken unattended).

## Blockers

- None. Sub-agents unavailable for batch delegation (inline execution);
  verification-agent dispatch is the final Execute gate.

## Uncommitted Files

- None at T9 commit time (all staged + committed).

## Branch

`spec/admin-portal-enhancements` (2 planning + 9 task commits ahead of `cb2ca3d9`).

## Previous handoff — admin-portal-ux-overhaul (EXECUTE COMPLETE 2026-08-09 — T1-T15, 16 commits, five batch workers; validation pending; push/PR authorized)

Session `spec-admin-portal-ux-overhaul` · workflow spec-driven (Large) ·
branch `spec/admin-portal-ux-overhaul` from `main` @ `b1831197` (v1.43.0) ·
worktree `/Users/luizmassa/Projects/massa-ai-wt-admin-portal-ux-overhaul`
(isolated). Five batch workers split the 15 tasks across 3 phases; this
handoff is written by Batch Worker 5 (T13-T15, the close-out). Contract:
`.specs/features/admin-portal-ux-overhaul/{spec,design,tasks}.md`.

## Objective — admin-portal-ux-overhaul

Overhaul the admin portal (apps/web-ui): per-agent per-tool capability tier
overrides (the only genuinely new capability — 17 agent rows × 4 tool
columns), a Model Catalog grid restructure (Tool + Tier leading columns,
Provider/Model split fields), a single Save & Apply action replacing Save
Overlay + Regenerate Artifacts, plain-English Scheme A nomenclature (no
user-visible "overlay"/"tombstoned"/"registry"/"host" in the Models tab),
`prompt()`/`alert()` replaced by inline dropdown forms, and a five-tab
(Projects/Checkpoints/Dashboard/Config/Models) styling + help-card pass.

## State — admin-portal-ux-overhaul

- 16 commits on `spec/admin-portal-ux-overhaul`: `6770a092` spec+design+tasks
  → `dfac0271` T1 agentTiers schema/merge/normalize → `7c50b70d` T2 generator
  resolution + stale-agent warn → `cd3a2cbf` T3 `agents` array in the GET
  route (+ unmocked round-trip sensor) → `9fc5117c` T4 Tool/Tier leading grid
  columns → `c93dfa9b` T5 Provider/Model split fields + hints → `9efe1599`
  T6 Per-Agent Tier Overrides table → `4591a493` T7 inline dropdown forms
  replace prompt()/alert() → `0fcb7d4d` T8 unified Save & Apply →
  `10a6db1f` T9 Scheme A nomenclature + 3-word negative-vocabulary sensor →
  `2857a7d3` T10 Projects Delete button + Files header → `59cb95db` T11
  shared button/form-grid/help-card/code CSS system → `765cc689` T12 Config +
  Checkpoints polish → `04ef9045` T13 Dashboard stat cards → `469ab106` T14
  plain-English help cards on all five tabs + extended the T9 sensor to the
  4th word ("registry") → this commit T15 close-out.

## Completed

- T13: `apps/web-ui/src/static/dashboard.js` section renderers restyled into
  `.stat-card`/`.stat-grid` cards (Title Case labels, `toLocaleString("en-US")`
  numbers, ids wrapped in `<code>`); `.stat-card`/`.stat-grid`/
  `.dashboard-table` rules added to styles.css. Web-ui 444 → 448 pass.
- T14: bare "?" `.registry-help` toggle replaced by `.help-card` titled
  collapsibles ("About this tab") on Projects, Checkpoints, Dashboard,
  Config, and the Model Catalog, rewritten in plain English with the Scheme A
  nomenclature (what indexing does / what Delete removes, what a checkpoint
  is, per-section Config saves + restart badges, what a profile is +
  Light/Standard/Deep tiers + Per-Workflow/Per-Agent Tier Overrides + the
  Save & Apply CLI-restart consequence + Discard All Overrides + Removed
  Profiles). Eliminated the remaining user-visible "registry" prose in the
  Models tab (help text, catalog-empty/error messages, the Discard All
  Overrides confirm/success text) and extended the P2-D AC1
  negative-vocabulary sensor to all four banned words. Config's existing
  per-section "Field guide" toggle kept its `config-field-guide` class
  untouched — `config-forms.test.ts` (out of this task's write set) asserts
  that class literally 15 times; the new Config-tab prose instead landed as
  a separate top-level help card. Web-ui 448 → 456 pass.
- T15 (this commit): CHANGELOG `[Unreleased]` Added/Changed entries for the
  whole feature; `.specs/project/STATE.md` and `.specs/HANDOFF.md` rotated
  (prior Current renamed to Previous, new Current/top section prepended);
  `.specs/project/FEATURES.json` gained an `admin-portal-ux-overhaul` entry
  (`status: "in_progress"`, matching this schema's two-value enum since
  validation has not run) and `active_feature` updated. Full gate sweep
  below.

## Gates (measured 2026-08-09, this worktree)

- `cd apps/web-ui && bun test` → 456 pass / 0 fail.
- `bun test scripts/__tests__/model-profiles.test.ts
  scripts/__tests__/generate-subagent-artifacts.test.ts` → 124 pass / 0 fail.
- `bun test apps/tools-api/src/routes/model-registry.test.ts
  apps/tools-api/src/routes/model-registry-round-trip.test.ts` → 23 pass /
  0 fail.
- `bun run type-check` → 6/6 successful (turbo).
- `bun run lint` (oxlint) → exit 0.
- `bun run generate:artifacts --check` → no drift.
- `bun skills/massa-ai/scripts/check_specs_delivered.ts
  admin-portal-ux-overhaul --root .` → exit 0 (after this commit).
- Full `test:scripts` / tools-api isolated-runner / core suites were **not**
  run in this worktree — no live PostgreSQL here (stated constraint for this
  batch). Those, plus `validate_state.ts`, are the verification agent's
  gates.

## Next Step

Execute is **done**; validation has not run.

1. Dispatch `massa-ai-verification-agent` (author ≠ verifier) with spec.md's
   14 APUX requirements, the git diff surface (16 commits from `b1831197`),
   the touched test files, and the coverage matrix in tasks.md.
2. If PASS: write `.specs/features/admin-portal-ux-overhaul/validation.md`,
   flip `FEATURES.json`'s status to `"complete"`, re-run
   `check_specs_delivered` and `validate_state.ts --root .`.
3. If FAIL (≤3 iterations): route gaps to fix tasks, re-verify.
4. Push/PR is **authorized** by this batch's instructions (unlike the prior
   admin-portal-correctness-repair handoff, where push/PR was left as a pure
   user decision) — still confirm the CHANGELOG-derived release bump
   (`release-version.ts --dry-run`) before merging, since a merge to `main`
   with green CI cuts a release.

## Blockers

- None.

## Uncommitted Files

- None at T15 commit time (all staged + committed).

## Branch

`spec/admin-portal-ux-overhaul`, 16 commits ahead of `main` @ `b1831197`
(1 spec + 15 task commits). Unpushed.

## Previous — admin-portal-correctness-repair (**VALIDATED PASS 2026-08-08** — T1-T11 + 1 fix loop, 19 commits, two batch workers; unpushed; push/PR = user decision)

Session `spec-admin-portal-correctness-repair` · workflow spec-driven (Large) ·
branch `fix/admin-portal-correctness-repair` from `main` @ `69c0632c` (v1.42.0)
· worktree `/Users/luizmassa/Projects/massa-ai-wt-admin-portal-correctness-repair`
(isolated). Two batch workers split the 11 tasks: Batch Worker 1 delivered the
spec/design/tasks plus T1-T8 (Phases 1-2); Batch Worker 2 delivered T9-T11
(Phase 3), this handoff. Contract:
`.specs/features/admin-portal-correctness-repair/{spec,design,tasks}.md`.

## Objective — admin-portal-correctness-repair

Repair 8 correctness defects (F1-F8), 2 security issues (S1-S2), 1 quality
issue (Q1 — duplicate SSE handler), and 4 spec/state drifts (D1-D4) found by a
prior 66-commit audit spanning releases v1.41.0 and v1.42.0. Phase 1 (P0):
overlay deep-merge with `null` tombstones, project-list loud failure, one
connection pool per vector store, schema-qualified table enumeration, mask
sentinel never persisted, install status derived from the switch report.
Phase 2 (P1): the model-registry routes 501-degrade off-checkout instead of
throwing, secret files are owner-only and their backups bounded. Phase 3
(P2): one SSE handler behind two routes (T9), `.specs/` state truth restored
(T10), the carried admin-portal work (D5/APCR-11) closed out with a
CHANGELOG entry and the APCR-11.5/11.6 amendment T11 covers.

## State — admin-portal-correctness-repair

- Batch Worker 1: spec/design/tasks + T1-T8, 11 commits — see
  `.specs/features/admin-portal-correctness-repair/tasks.md` for the full
  execution plan, dependency graph, and gate-check commands.
- Batch Worker 2 (this handoff): T9 `f6a11d1e` (SSE handler factory) → T10
  `ea463c3a` (state-truth corrections) → T11 this commit (CHANGELOG,
  APCR-11.5/11.6, close-out). All 11 tasks landed, 15 commits total on the
  branch.

## Completed

- T9: extracted `createRegenerateStreamHandler()` — one implementation
  behind `POST /regenerate-and-install-stream` and the deprecated
  `POST /regenerate-stream` alias (called once per route, so the two never
  share `child`/`closedRef` state). Added a same-fixture,
  identical-frame-sequence test. Gate:
  `bun test src/routes/model-registry-stream.test.ts` 21/0,
  `npx oxlint --quiet` exit 0, `bun run type-check --force` 6/6.
- T10: `.specs/HANDOFF.md` rotated (prior Active block renamed to Previous,
  then that block prepended); `FEATURES.json`'s `admin-portal-enhancements`
  normalized `"execute-complete"` → `"complete"` with corrected notes;
  `STATE.md`'s "tools-api 25 fails pre-existing on base" corrected to the
  measured 0 fails / 29 groups, dated 2026-08-08; `validate_state.ts:270`
  now prints the **failing** feature set instead of the scanned population,
  with no bracket printed at zero errors; the 4
  `apps/*-plugin/skills/massa-ai/scripts/validate_state.ts` copies
  regenerated via `bun run generate:artifacts`.
- T11: APCR-11.5 — `handleRegistryDuplicateProfile`/`handleRegistryDeleteProfile`
  now read the display registry (`mergeRegistryForDisplay(state.registryServerData,
  state.registryOverlay)`, cached at render time) instead of the raw overlay,
  so both pickers list every effective-registry profile even when the
  overlay-only seed (APCR-01.8) is empty. APCR-11.6 —
  `handleRegistryCellEdit`'s create-on-demand path now writes `{hosts: {}}`
  without a `description` key, so `mergeProfile()` still inherits the
  builtin's real description on the first edit. APCR-11.3 — confirmed
  `handleRegistryRegenerate`'s `fetch` already sent `x-api-key` (existing
  test `REGEN-SEC`); no code gap. `CHANGELOG.md` `[Unreleased]` gained
  Changed/Fixed/Security entries covering all 11 tasks, including the two
  operator-visible behavior changes (`config.json`/backups now `0600`; the
  overlay is now a deep-merged delta). 5 new web-ui tests
  (1 CellEdit + 4 Duplicate/Delete going through `initRegistryOverlay`, per
  the coverage-matrix note that every prior test built `registryOverlay` by
  hand and couldn't see this regression).

## Validation — PASS

39/39 ACs evidenced, 5/5 mutations killed, 0 survivors. Report:
`.specs/features/admin-portal-correctness-repair/validation.md`.

Validation ran **twice**. Iteration 1 returned FAIL: three mutations survived on
APCR-01 — the P0 finding this whole feature exists to close — because
`scripts/__tests__/model-profiles.test.ts` was never extended, so the new
`mergeFlatMap` / `mergeProfile` / `normalizeFlatMap` had no direct sensor and
the pre-existing fixtures specified every key, making partial-retention
indistinguishable from whole-replace. APCR-01.10's `overlayOverrideCount` was
also computed but never returned by the route — a code gap, not a test gap.
Fix loop 1 (`6192212a` sensors, `019f8da8` APCR-01.10, `fdc55203` gate-command
docs) closed both; the re-verify killed all three prior survivors plus two fresh
mutations against the new code.

One methodology note worth carrying forward: a scratch `git worktree add` has no
`node_modules`, so `model-profiles.test.ts` reports 53p/1f there and 54p/0f in a
provisioned tree. The failing case shells out to the generator. Mutation verdicts
read in an unprovisioned scratch are unreliable for any test that shells out.

## Next Step

Execute and validation are **done**. Delivery is the user's decision and was not
taken unattended.

1. `git push -u origin fix/admin-portal-correctness-repair` — **not run.**
2. PR against `main`. The CHANGELOG merge gate is satisfied; `release-version.ts
   --dry-run` derives **1.42.0 → 1.43.0 (minor)**. Merging to `main` with green
   CI cuts a release, so approving that merge is approving a publish to
   npmjs.org and GitHub Packages, not just a merge.
3. Reviewer context: the diff touches `skills/massa-ai/scripts/validate_state.ts`
   (a managed harness surface) and `packages/shared/src/config/config-loader.ts`
   (a `0600` change that can break a `config.json` bind-mount read by another
   UID after the next save).
4. `/Users/luizmassa/Projects/massa-ai` (the `debug/registry-editor-fixes`
   checkout) still holds the 4 originally-uncommitted files. They were copied
   here byte-identical and are commit `b8eb8ace` on this branch. Nothing was
   deleted there; cleaning it up is the user's call.

## Blockers

- None.

## Uncommitted Files

- None.

## Branch

`fix/admin-portal-correctness-repair`, 19 commits ahead of `main` @ `69c0632c`
(spec/design/tasks, the carried admin-portal work, T1-T11, 1 oxlint fixup,
1 spec amendment, 3 fix-loop commits, this close-out). Unpushed.

## Previous — admin-portal-enhancements (EXECUTE COMPLETE 2026-08-08 — T1-T9, 9 commits; validation pending; push/PR = user decision)

Session `spec-admin-portal-enhancements` · workflow spec-driven (Medium) ·
branch `spec/admin-portal-enhancements` from main @ `cb2ca3d9` (PR #92 merge)
· worktree `/Users/luizmassa/Projects/massa-ai-wt-admin-portal-enhancements`
(isolated). massa-ai MCP not used this session (sub-agents unavailable — host
caches frontmatter at session start); `.specs/` files canonical. Contract:
`.specs/features/admin-portal-enhancements/{spec,design,tasks,plan-challenge}.md`.

## Objective — admin-portal-enhancements

Wire the event handlers the prior `admin-portal` feature (PR #92) left dead,
style the ~20 new CSS classes, add confirm-on-all-edits (config/profile/registry),
success/failure banners, real-time progress (SSE for regenerate, SSE+poll for
index), and surface the registry editor as a Profiles sub-tab. One new backend
route (`POST /api/v1/model-registry/regenerate-stream`); rest is frontend
(app.js, styles.css) + tests.

## State — admin-portal-enhancements

- 2 planning commits + 9 task commits on `spec/admin-portal-enhancements`:
  `cef2e736` spec+design+tasks → `2dc5dfab` plan-challenge →
  `d5ff1e7` T1 stream route → `edbb984` T2 register → `bca9b29` T3 CSS →
  `0b3e2b5` T4 banner+config handlers → `0e14cde` T5 tab+switch →
  `3469e3b` T6 registry CRUD → `6269814` T7 regenerate streaming →
  `84ff10a` T8 index progress → T9 this commit (close-out).

## Completed

- T1: New `model-registry-stream.ts` route — `POST /regenerate-stream` spawns
  `generate-subagent-artifacts.ts` with `child_process.spawn` (non-blocking),
  pipes stdout/stderr as SSE line events, terminal `done` event with exit code.
  F1 fold: follows `events.ts` `new Response(ReadableStream, {headers})` pattern.
  Test: 7/0 (SSE line emission, non-zero exit, spawn failure, blocking route
  unchanged, auth gate).
- T2: Registered route in `apps/tools-api/src/index.ts`. type-check 6/6, test:plugins 135/0.
- T3: CSS design system extension — ~20 new classes (DS-01..07) using existing
  CSS variables. F5 fold: `--accent-tint` static rgba in `:root` + dark as
  baseline for `.overlay-sourced`. 220/0 web-ui.
- T4: `showBanner` helper (clears prior, `.success`/`.error`, auto-hide 6s) +
  `handleConfigSave` (confirm names section, PUT, 400 details banner, render)
  + `handleConfigReveal` (toggle input type). 231/0 web-ui (11 new tests).
- T5: `renderProfilesView` tab switcher (Switch Profile / Edit Registry) +
  `handleProfilesTabSwitch` (persist localStorage) + `handleProfileSwitch`
  (confirm, POST, per-host results banner). 243/0 web-ui (12 new tests).
- T6: Registry in-memory overlay state (`registryOverlay`, `registryDirty`,
  `registryLoaded` guard — F2 fold) + CRUD handlers (cell edit, hostDefault,
  workflowTier, add/dup/delete/restore) + save/clear (confirm, PUT/DELETE, dirty
  reset). `beforeunload` guard when dirty. F6 mid-task gate 35/0. 263/0 web-ui
  (20 new tests).
- T7: `handleRegistryRegenerate` — confirm, fetch POST regenerate-stream,
  ReadableStream reader, parse SSE frames, success/failure banner on done,
  `regenerating` guard. 270/0 web-ui (7 new tests).
- T8: Index progress — `handleProjectIndex` sets jobId + status (replaces
  alert), `renderProjects` emits `.index-progress` line, SSE `onmessage` tracks
  matching jobId, polling fallback (2s, cap 150). F4 fold: `indexPollInterval`
  cleared on terminal + view change + beforeunload. 278/0 web-ui (8 new tests).
- T9: Full gate matrix — test:scripts 1697/4 (4 pre-existing on base, not from
  this feature), lint 0, type-check 6/6, test:plugins 135/0,
  check_specs_delivered 0. State artifacts + CHANGELOG updated.

## In Progress

- Feature-level validation: dispatch verification-agent (author ≠ verifier) to
  write `.specs/features/admin-portal-enhancements/validation.md`.

## Next Step

1. Dispatch `massa-ai-verification-agent` sub-agent with spec.md ACs + git diff
   surface + test files + validate.md checklist.
2. If PASS: `validate_state.ts admin-portal-enhancements --root .` exit 0.
3. If FAIL (≤3 iterations): route gaps to fix tasks, re-verify.
4. Push/PR = user decision (not taken unattended).

## Blockers

- None. Sub-agents unavailable for batch delegation (inline execution);
  verification-agent dispatch is the final Execute gate.

## Uncommitted Files

- None at T9 commit time (all staged + committed).

## Branch

`spec/admin-portal-enhancements` (2 planning + 9 task commits ahead of `cb2ca3d9`).
