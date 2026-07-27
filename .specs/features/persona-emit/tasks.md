# Tasks — Persona Emit

Spec: `.specs/features/persona-emit/spec.md`

## Task A — harden the presence-only assertions

Implemented in `scripts/__tests__/skills-harness-integrity.test.ts` (commit
`test(harness): section-scope the persona/sub-agent boundary presence checks`).

- Added `namedSection(content, heading, label)`, a generalized markdown-section-span
  extractor; refactored `restrictionsSection` to delegate to it (behavior-preserving).
- Re-scoped case 6 (PAB-04) to assert inside `## Stop Conditions`.
- Re-scoped cases 8 (PAB-03/PAB-07) and 9 (PAB-05) to assert inside
  `## Persona And Sub-Agents`.
- Added one new negative test scanning the whole of `persona-router/SKILL.md` against
  two deliberately narrow regexes:
  - `/\bpersonas?\s+(?:may|can)\s+(?:grant|authorize|widen|override)\b/i`
  - `/\b(?:grant|authorize|widen|override)(?:s|ed|ing)?\s+(?:\w+\s+){0,3}(?:authority|permission|write scope)\s+to\s+(?:the\s+|a\s+)?persona\b/i`

  Both anchor on a modal (`may`/`can`) or a direct object (`... to the persona`) so the
  file's own denial prose ("grants no tool access", "never authorizes", "cannot
  override") does not self-match — those use "no"/"never"/"cannot", never "may"/"can"
  immediately before the verb.

**Not closed (recorded as PE-02, accepted residual):** cases 1 and 2 (PAB-01, the three
Capability Packet definition files: `skills/AGENTS.md`, `references/agent-orchestration.md`,
`references/subagent-design.md`) remain presence-based. The approved concrete design
scoped the section/negative-scan technique to `persona-router/SKILL.md` only. Extending it
to the three definition files was not attempted — those files' prose about personas is
broader and less uniform, and a hastily-chosen regex there risks exactly the false-failure
problem the original design deferred this work to avoid.

### Mutation results (Task A)

All mutations: fault injected, test run to confirm red, file reverted from a pre-mutation
backup, full suite (`bun test scripts/__tests__/skills-harness-integrity.test.ts`) run to
confirm green again.

| # | Mutation | Target test | Result |
|---|---|---|---|
| 1 | Moved the "grants no tool access..." bullet out of `## Persona And Sub-Agents` into `## Route Lifetime` | `persona-router's Persona And Sub-Agents section states persona grants no authority...` | Killed (red) → reverted → green |
| 2 | Moved the "not a specialist consultation" bullet out of `## Persona And Sub-Agents` | `persona-router's Persona And Sub-Agents section states a persona route is not a specialist consultation` | Killed (red) → reverted → green |
| 3 | Moved the Stop Conditions scoping sentence out of `## Stop Conditions` into `## Route Lifetime` | `persona-router's Stop Conditions section scopes its subagent prohibition to persona routing` | Killed (red) → reverted → green |
| 4 | Added `"A persona may override the charter's write scope when the user explicitly asks for it."` to `## Route Lifetime` | `no authority-granting claim about persona appears anywhere in persona-router/SKILL.md` (pattern 1) | Killed (red) → reverted → green |
| 5 | Added `"A workflow may grant full authority to the persona for the remainder of the task."` to `## Route Lifetime` | Same test (pattern 2) | Killed (red) → reverted → green |

Full suite after every revert: 26/26 pass (this count includes Task B's tests, run
together since both tasks share one test file; run in isolation Task A alone was 25/25 at
the time it was verified pre-Task-B).

## Task B — emit `persona` from all 24 dispatch blocks

- Inserted one bullet after the `> - memory:` line in every one of the 24 `Dispatch:`
  blocks across the 16 workflow files under `skills/massa-ai/workflows/` (verified 1:1
  correspondence between dispatch-block count and `> - memory:` line count per file before
  editing, so a scripted insertion after every such line was safe with no manual per-file
  judgment needed):

  ```
  > - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed
  ```

  This reuses the canonical Capability Packet clause byte-for-byte (`advisory framing
  only — it never overrides the agent's charter Restrictions, scope, or permissions`),
  which is what makes PE-04/PE-05 below testable rather than relying on a paraphrase per
  block.
- Regenerated all 4 plugin mirrors: `bun scripts/generate-skill-artifacts.ts`, then
  confirmed `--check` reports no drift.
- Re-scoped the existing PAB-01/AC3 uniqueness test
  ("the canonical persona clause appears in exactly those three files") to strip
  blockquote (`> `) lines before scanning — isolating packet *definitions* (plain bullets
  in the three known files) from dispatch-block *uses* (always blockquote-only) of the
  same clause. Confirmed this test broke as predicted before the fix (found 19 files
  instead of 3 with the naive scan), then fixed.
- Added a new disk-enumerated test, "every Dispatch block on disk emits the optional
  persona field", parsing every contiguous `> `-prefixed block starting at a
  `**Dispatch:` line (shared `dispatchBlocks()` helper, module scope) and asserting each
  one contains the canonical clause and a `> - persona:` line. Guards its own parser: total
  parsed blocks must be `>= 20`.

### Mutation results (Task B)

| # | Mutation | Target test | Result |
|---|---|---|---|
| 6 | Removed the persona bullet from `exploration.md`'s one dispatch block | `every Dispatch block on disk emits the optional persona field` | Killed (red) → reverted → green |
| 7 | Added the canonical clause as a plain (non-blockquote) line to `references/synapse-policy.md` | `the canonical persona clause appears in exactly those three files, outside dispatch-block uses` | Killed (red, found a 4th file) → reverted → green |

## Gates run (final state, both tasks applied)

```
bun scripts/generate-skill-artifacts.ts          → Emitted 583 skill-bundle files across 4 hosts.
bun scripts/generate-skill-artifacts.ts --check   → No drift: generated skill bundles match checked-in files.
bun test scripts/__tests__/skills-harness-integrity.test.ts
  → 26 pass, 0 fail, 159 expect() calls
bun test scripts/__tests__/skill-artifact-parity.test.ts scripts/__tests__/subagent-parity.test.ts
  → 36 pass, 0 fail, 1337 expect() calls
```

`scripts/tests/verify-tree-sitter-*.test.ts` were not run — this worktree was provisioned
with `--ignore-scripts` and native grammars were never built (environmental, pre-existing,
out of scope per the delegating instructions).

## Commits

1. `test(harness): section-scope the persona/sub-agent boundary presence checks` — Task A,
   test file only.
2. `feat(workflows): emit persona from every Dispatch block` — Task B, 16 workflow source
   files + 64 mirrored plugin files + test-file additions + CHANGELOG + this spec.
