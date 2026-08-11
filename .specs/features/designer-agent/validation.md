# Designer Agent + ADR Plan-Challenge Gate Validation

- Feature slug: `designer-agent`
- Branch `feat/designer-agent`, worktree `/Users/luizmassa/Projects/massa-ai-wt-designer-agent`
- Base `origin/main` @ `f8427283`; commit range `f8427283..e51d3297` (11 commits, T1-T13)
- Date: 2026-08-11

## Verdict

**PASS WITH ONE DISCLOSED LIMITATION.** 13 of 13 requirement IDs satisfied. Every
deterministic gate green. The limitation is DSG-08's portal half — see the AC table.

**Independence: NOT satisfied.** The author-vs-verifier split the spec-driven Execute gate
requires was not achieved: the `massa-ai-verification-agent` dispatch was skipped because
platform policy for this session forbids spawning subagents, and the standalone fresh-eyes
fallback was run by the same agent that wrote the code. That is a real weakening of this
verdict, recorded here rather than papered over. Every claim below is backed by a command
whose output was read in-session, so the evidence is reproducible even where the
independence is not.

## Gate results

| Gate | Command | Result |
| --- | --- | --- |
| Lint | `bun run lint` (oxlint) | 0 errors |
| Type-check | `bun run type-check` | 6/6 tasks successful |
| Generator drift | `bun run generate:artifacts --check` | `No drift: generated files match checked-in files` |
| Scripts suite | `bun run test:scripts` | **1777 pass / 0 fail across 80 files**, 41.6 s |
| Plugin suites | `bun run test:plugins` | **135 pass / 0 fail across 8 files**, 90.6 s |
| OpenCode agents-install (outside `test:plugins`) | `bun test src/__tests__/agents-install.test.ts` | 7 pass / 0 fail |

Baseline for comparison (T0, pre-change, same worktree): 259 pass / 0 fail over the 4
suites then in scope. The first full `test:scripts` run reported 1769 tests / 10 fail; 4 of
those failures were an unprovisioned worktree (missing `packages/core/dist` and a
never-generated Prisma client), cleared by `bun run build` and
`bunx prisma generate` — **not** dismissed as pre-existing. The remaining 6 were real and
are closed below.

## Per-requirement evidence

| ID | Verdict | Evidence |
| --- | --- | --- |
| ADRG-01 | SATISFIED | `workflows/adr.md` step 7, before the save step; numbering contiguous 1-10. `workflows/refactor.md` step 13 — a **second** instance the sensor found, fixed rather than excluded |
| ADRG-02 | SATISFIED | New group 11 in `workflow-harness-contract.test.ts`. Parses the list from the policy sentence in `skills/AGENTS.md`. Mutation-proved: baseline GREEN → remove adr step RED (1 fail) → remove refactor step RED (1 fail) → reword the policy sentence RED (3 fail, the vacuous-parse guard) → restore GREEN. Each restore from an in-memory copy and SHA-256-verified, never `git checkout` |
| DSG-01 | SATISFIED | `skills/agents/designer/SKILL.md`; `model_tier: standard`, `permission: write`; both persona-boundary lines verbatim — enforced by `skills-harness-integrity.test.ts`, green |
| DSG-02 | SATISFIED | Charter `## Restrictions` states the UI-layer write scope, the Figma MCP path, and the boundaries against `mobile-specialist` and `builder` |
| DSG-03 | SATISFIED | `skills/AGENTS.md` Agent Table row, Mapping row, `17` → `18`, anchor `18 agents` |
| DSG-04 | SATISFIED | `SPECIALIST_NAMES` + `WRITE_AGENTS`; regeneration emits 18/host |
| DSG-05 | SATISFIED | 7 `**Dispatch: \`massa-ai-designer\`**` blocks, 1 per file, each with all 8 packet body fields + `persona`. Integrity dispatch-resolution green (expect() calls 214 → 221) |
| DSG-06 | SATISFIED | `grep -lF` on the shared trigger sentence returns **exactly 7** workflow files — the design's named drift risk, closed by emitting all 7 from one authored text |
| DSG-07 | SATISFIED | Screen Implementation Exception in `agent-orchestration.md`; `charterPaths).toEqual([])` and "carries no second roster" both still green |
| DSG-08 | **SATISFIED (partial method)** | Bundles: 18 files/host × 4 = 72; 396 variants; `--check` no drift. Portal: `loadAllCharters()` executed → 18 charters, `{"name":"designer","charterTier":"standard"}`. **Limitation:** that is the loader `model-registry.ts`'s `loadAgentsInventory` calls and the same `{name, charterTier}` mapping, executed directly. The HTTP route itself was **not** exercised (it needs a running server and an API key), so the JSON wire shape is inferred from one line of source, not measured |
| DSG-09 | SATISFIED | 7 generator-side suites + 5 install-path suites + config-CLI + both shell installers. Duplication ceiling 483 → 498, raised with the differential measurement its own comment demands |
| DSG-10 | SATISFIED | Roster gate offender list **empty**. That gate reads `git ls-files` with no path filter and is the acceptance authority, not a hand list |
| DSG-11 | SATISFIED | New "Scoped writer" row in `references/spec-driven/sub-agents.md`; `designer` deliberately **not** added to the read-only row, so the deep-tier rule does not misapply |

## What the process caught that a targeted run would not

1. **The Plan Challenge Gate found the largest defect in the plan.** Simulating the roster
   gate at `ROSTER = 18` returned **58 offenders across 19 files** where the ad-hoc sweep had
   found 26 — three classes (`marketplace.json` ×2, root `install.sh`, `.ua/knowledge-graph.json`)
   sat outside every path filter the sweep used. It also found that the 5 `pyts-golden`
   fixture lines are frozen test inputs that cannot be edited, requiring the gate's own
   `HISTORICAL` allowlist instead.
2. **The full `test:scripts` run found two gates both count sweeps were blind to.**
   `validate-repository.test.ts` asserts a hardcoded `EXPECTED_AGENTS` name array with no
   count literal, and `verify-model-tokens.test.ts` pins a derived total (`155`). The
   Plan Challenge had predicted this class and widened T9's gate from 5 named files to the
   full suite, which is the only reason they were seen locally rather than in CI.
3. **The new sensor found a second instance of the defect it was written for.** `refactor.md`
   was in the full-gate set with no gate step. Closed, not allowlisted.
4. **A sweep returned 0 matches on a subject that has 9.** `git grep -E '\b(17|68)\b'`
   matches nothing in this git build — its ERE engine does not honour `\b`, while BRE and
   `-P` both return 9 on `README.md`. Every sweep in this feature uses `-P`.

## Residual risk

- **No independent verifier** (stated above). The strongest compensating evidence is that
  every acceptance claim is a command result, and that three of the six real failures were
  found by gates rather than by the author's own reading.
- **`mobile-figma-audit` is the first findings-only workflow to dispatch a write-permitted
  charter.** Accepted risk, `spec.md` A8. No host enforces the packet's `read-only` line;
  the constraint is the packet plus the charter's Restrictions (which win on conflict). The
  same property already holds for `test-engineer` and `documentation-agent`.
- **The designer dispatch is prose, not an executable gate.** No CI sensor can prove an
  orchestrator actually dispatched it on a screen task; the sensors prove the blocks exist,
  resolve to a shipped artifact on all 4 hosts, and are worded identically.
- **DSG-08's HTTP layer** — see the AC table.
- **Live behavior of the charter is unexercised.** No screen was implemented by `designer`
  in this session; the charter is validated structurally.
