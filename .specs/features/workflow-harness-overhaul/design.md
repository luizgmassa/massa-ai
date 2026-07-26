# Design — Workflow Harness Overhaul

## Approach

The harness is a documentation-shaped system: `SKILL.md` routes, `workflows/*.md`
are numbered step lists, `references/*.md` are loaded on demand, `skills/agents/*`
are charters, and `scripts/generate-subagent-artifacts.ts` projects charters into
4 host bundles guarded by parity tests.

So every new obligation is a **reference file + one load line per workflow**, not
inline prose duplicated 35 times. That preserves the router's progressive-disclosure
contract (`Load only the missing minimum context`) and keeps each rule in exactly
one place, matching the repo's stated docs-layering rule.

### Considered and rejected

| Option | Why rejected |
| --- | --- |
| Inline the rules in each workflow | 35× duplication; violates the router's "keep each rule in one place"; every future edit becomes a 35-file change |
| One mega-reference `implementation-standards.md` | Couples three independent load triggers (always / on-mutation / on-circling). Audit workflows would pull delivery rules they must never apply |
| Enforce delivery via a `hooks` PreToolUse gate | Out of scope per spec; hooks cannot see workflow intent, and a blocking hook on `git commit` breaks every non-massa-ai session |
| Keep `handoff-writer` but drop its workflows | An agent with no calling workflow is dead registry weight and still costs 4 generated files + parity assertions |

### Reference split — three files, three triggers

| New reference | Load trigger | Loaded by |
| --- | --- | --- |
| `references/project-context.md` | always, once per session, before the first substantive read | all 35 workflows |
| `references/implementation-delivery.md` | before the first repository mutation | 16 implementation workflows |
| `references/code-annotation.md` | before writing or editing source | 16 implementation workflows |
| `references/root-cause-scripts.md` | on circling detection (≥2 failed fix attempts on one symptom) | 16 implementation workflows + `builder` + `test-engineer` charters |

`root-cause-scripts.md` is separate from `debug-diagnosis-loop.md`: the existing
one is a *reproduction* ladder used at diagnosis start; the new one is a *circuit
breaker* that fires mid-implementation in any workflow, including `feature` and
`*-fix`, where no diagnosis loop was ever opened.

### Workflow classification (post-removal: 35 files)

**Implementation — 16** (get delivery + annotation + root-cause + context):
`feature`, `debug`, `refactor`, `spec-driven`, `design`, `general`, `maestro/maestro`,
`architecture/architecture-fix`, `bugs/bugs-fix`, `code-quality/code-quality-fix`,
`implementation/implementation-fix`, `maestro/maestro-fix`,
`mobile-figma/mobile-figma-fix`, `requirements/requirements-fix`,
`security/security-fix`, `tests/tests-fix`.

**Non-implementation — 19** (get context intake only):
`adr`, `rfc`, `tdd`, `ticket`, `commit`, `exploration`, `onboarding`, `the-fool`,
`long-session`, `refinement/furps-refinement`, and the 9 `*-audit` workflows.

`commit.md` is classified non-implementation on purpose: it is the commit-message
authority invoked *by* implementation workflows, and giving it the delivery
reference would create a load cycle.

## Removal graph

Deleting a route means cutting every inbound edge in the same commit, or the
`validate-repository` guard fails.

```
workflows/restart-save.md ─┐
workflows/restart-load.md ─┼─> SKILL.md router table (3 rows)
workflows/agent-handoff.md ┘   SKILL.md routing precedence (clauses 1, 2, 4)
                               SKILL.md shared-reference list (2 rows)
references/restart-state.md ──> memory-policy.md, hook-enforcement.md,
                                spec-driven/memory.md, personas/context-skill-*.md
references/handoff-package.md ─> agent-orchestration.md, handoff-writer/SKILL.md
skills/agents/handoff-writer/ ─> skills/AGENTS.md registry, generate-subagent-artifacts.ts
                                 (4 maps), 4 generated host files, parity test (5 maps),
                                 4 plugin install tests, validate-repository test
roster count 16 ──────────────> install.sh (6 strings), install-agents.sh (5 strings),
                                README.md, FEATURES.md, AGENTS.md (root), parity test
inbound prose ────────────────> workflows/long-session.md, workflows/spec-driven.md (step 8),
                                docs/massa-ai-spec-driven.md, README.md, FEATURES.md
```

## Delivery protocol design

`references/implementation-delivery.md` encodes a 7-stage chain. Each stage names
its command, its failure branch, and its legal skip reason.

```
0. preflight   git rev-parse --is-inside-work-tree ; command -v gh
1. isolate     git worktree add -b <type>/<slug> <path> origin/<base>
2. implement   one task → gate → git commit   (message rules delegate to workflows/commit.md)
3. push        git push -u origin <branch>
4. propose     gh pr create --fill --base <base>
5. watch       gh pr checks --watch  (or gh run watch)
6. repair      failing check → fix on the branch → amend-free follow-up commit → back to 5
7. ASK         report green CI + PR URL, then stop. Merge only on explicit user approval.
```

Stage 7 is the hard stop (WHO-R11). Stage 4-7 degrade to "record skipped" when
`gh` is missing or unauthenticated (WHO-R12). Stage 1 has exactly two legal skip
reasons: not a git repository, or the user explicitly declined isolation.

The repair loop reuses the existing 3-iteration cap convention from
`spec-driven.md` so a red CI cannot spin forever.

## Code annotation design

`references/code-annotation.md` carries two tables and one comment template.

Language → doc syntax: Java/Kotlin → JavaDoc/KDoc `/** */`; TypeScript/JavaScript
→ TSDoc `/** */`; Python → docstring; Swift → `///`; Rust → `///`; Go → `// Name ...`;
Bash → header comment block.

Rationale comment template (the WHO-R15 three fields):

```
// Why: <the problem this solves / the bug it fixes>
// Impacts: <feature or requirement ID it serves>
// Test: <exact command or test name that exercises it>
```

Placed once at the changed unit, not on every line. Docs describe *contract*;
the rationale block describes *change motivation* — they are complementary, and
the reference says so to stop agents from writing one and skipping the other.

## Root-cause script design

Circling detector: **two** consecutive failed fix attempts against the same
symptom, or the same hypothesis re-tested after being ruled out. On trigger, the
agent must stop editing and produce an executable probe that emits real runtime
data — a script, a failing test, a logged trace, or an instrumented run. Reading
more source, re-reading the same file, or reasoning about the code is explicitly
not an acceptable next action.

Probe contract: deterministic command; prints observed vs expected; exits non-zero
on the failure; lives in a scratch path or a real test file; never mutates
production state. Escalation: if the probe cannot be built, record the blocked
reason and stop rather than continue guessing.

## Test design

One new discriminating suite, `scripts/__tests__/workflow-harness-contract.test.ts`,
run by `bun run test:scripts`. It derives its expectations from the filesystem so a
newly added workflow cannot silently skip the contract:

1. Enumerate `skills/massa-ai/workflows/**/*.md` → assert exactly 35 files.
2. Every enumerated workflow contains `references/project-context.md` (WHO-R19).
3. A hardcoded 16-name implementation set contains all four references; its
   complement (19 names) contains project-context and **not** implementation-delivery
   (WHO-R13/R17, plus the audit-must-not-mutate edge case).
4. Removed paths do not exist (WHO-R1/R2/R3).
5. No tracked source outside `.specs/` + `CHANGELOG.md` matches the removed-route
   regex (WHO-R5).
6. `references/mcp-tools.md` still documents all four `handoff_*` tools and
   `workflows/long-session.md` still exists (WHO-R6 — the negative control that
   proves the removal was surgical).
7. The 4 new references each assert their load-bearing content: the merge-gate
   sentence, the no-exemption sentence, the circling threshold, the three
   rationale fields, the precedence order.

Point 3's complement check is the mutation-killer: deleting one load line from any
single workflow flips exactly one assertion.

Existing suites updated in the same commits as their subject: `subagent-parity`
(16→15, drop handoff-writer from 5 maps), `validate-repository` (drop the three
workflow paths and the handoff-writer roster entry), and the 4 plugin install tests.

## Risks

| Risk | Mitigation |
| --- | --- |
| A missed inbound reference leaves a dangling link | WHO-R5 grep assertion in the new suite is repo-wide, not a spot check |
| Roster count drifts between installer strings and tests | Single commit moves all 16→15 sites; parity test enumerates real files |
| 35 workflow edits are mechanical and error-prone | Contract test derives the 35 from the filesystem, so a miss fails loudly |
| CHANGELOG heading picks the wrong bump | `### Removed` + `### Added` → minor bump, which is correct for a breaking harness change |
| Merge-gate rule is prose an agent can ignore | Test asserts the exact sentence exists; enforcement beyond that needs a hook (out of scope) |
