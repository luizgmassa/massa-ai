# Agent Roster Consolidation Validation

**Date**: 2026-09-23
**Spec**: `.specs/features/agent-roster-consolidation/spec.md` (as amended in `6a78d0c0`)
**Diff range**: `7651e168..738010a8` (branch `feat/agent-roster-consolidation`). Fix-loop delta for this iteration: `6a78d0c0..738010a8` = `738010a8` only (4 files, +6/−6: three prose repoints plus the widened sweep in `workflow-dispatch-mapping.test.ts`).
**Verifier**: independent sub-agent, fix→re-verify iteration 2 of 3 (author ≠ verifier). The evidence was re-derived at `738010a8`. The iteration-1 report was read only for its gap and its mutation list, so the mutations in this report are new.
**Verdict**: **PASS**. 49/49 ACs are met. The ROS AC-7 gap is closed. Every planted mutation was killed. Three sensor blind spots remain and are listed under Risks; none of them is a live violation.

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1–T13 | ✅ Done | Fix 1 from iteration 1 is fully applied. (a) `figma-pre-analysis.md:22` now reads "`code-explorer`, `trace` mode". (b) `skills/AGENTS.md:146` now reads "Judge (plan-critique mode)". (c) `agent-orchestration.md:175` now reads "`product-manager` FURPS dispatch". (d) The sweep regex at `workflow-dispatch-mapping.test.ts:267-268` is now case-insensitive, accepts a hyphen or a space, allows suffixes, and excludes `code[-\s]`. |

---

## Gate Check (verifier-run, foreground, real worktree at `738010a8`, `XDG_CONFIG_HOME=$(mktemp -d)`)

| Gate | Result |
| --- | --- |
| `bun run generate:artifacts --check` | exit 0 |
| `bun run lint` | exit 0 |
| `bun scripts/check-stale-pointers.ts` | exit 0. PASS: 0 broken, and the historical count is exactly at its pin of 28 |
| `bun run test:scripts` | exit 0. Bun: **2177 pass / 0 fail**, 94 files. Shell: **41 of 41** suites |
| `bun run test:plugins` | exit 0, **183 pass / 0 fail**, 11 files |
| `packages/shared` `bun test` | exit 0, **976 / 0**, 40 files |
| `workflow-dispatch-mapping.test.ts` (alone) | **59 / 0** |

**Not re-run at this iteration**: `build`, `type-check`, `opencode-plugin`, `web-ui`, and the per-file core and mcp-client suites. The delta since iteration 1 changes one test regex and three markdown lines, and it touches no TS source, no plugin code, and no web-ui or core file. Iteration 1 ran all of these at `6a78d0c0` with 0 failures. The turbo whole-package runs of core and mcp-client are also skipped, because of the known Bun napi SIGTRAP on this host.

**Test integrity**: there are 8803 static `test(`/`it(` sites at `6a78d0c0` and 8803 at `738010a8`. No test file or shell suite is deleted anywhere in `7651e168..738010a8`. The sweep regex is strictly wider than before: it adds `i`, `[-\s]`, and a `(?!\w)` tail where the old tail was `(?![\w-])`. Its only new exclusion is `(?<!code[-\s])`, for the roster name. The one new allowlist alternative, `reviewer-feedback records` in `lessons.md`, describes human reviewer feedback.

**Real worktree** `git status --porcelain` after all gates and the mutation run shows only `?? .specs/features/agent-roster-consolidation/validation.md`.

---

## Spec-Anchored Acceptance Criteria

The two sources of evidence are on-disk checks re-derived at `738010a8` and the sensors cited below. Those sensors ran green inside the gates above.

### P1: Personas removed

| AC | Evidence | Result |
| --- | --- | --- |
| PER-1 | `skills/persona-router` and `skills/massa-ai/personas` are both absent (`ls` → ENOENT). `validate-repository.test.ts:310-311` asserts the absence | ✅ PASS |
| PER-2 | `BOOTSTRAP_RULE_IDS` (`packages/shared/src/bootstrap/rules.ts:36-43`) holds 8 ids, none of them `persona-router`, and `RETIRED_RULE_IDS = ["persona-router"]` (`:53`). A grep of `skills/AGENTS.md` for `persona_router\|persona_pin\|massa-ai:rule:persona-router` returns 0. Sensors: `rules.test.ts:40,61`, `bootstrap-source-contract.test.ts:92`, and the new mutant B4 | ✅ PASS |
| PER-3 | `generate-skill-artifacts.ts:258` sets `RETIRED_BUNDLE_ROOTS = ["persona-router"]`, which is pruned at `:286-287`. Sensor: `generate-skill-artifacts-prune.test.ts:78-85` (mutant B5 killed) | ✅ PASS |
| PER-4 | Per-host exact-set assertions: claude `install.test.ts:373`, codex `:319`, cursor `skills-bundling-harness-set.test.ts:29`, opencode `harness-skills-and-prune.test.ts:57`. All are green in test:plugins | ✅ PASS |
| PER-5 | Install and uninstall both prune a plugin-owned recorded `persona-router`. The uninstall path is at `apps/opencode-plugin/install.sh:330`, and mutant B2 on it was killed by `…uninstall removes a recorded persona-router skill` | ✅ PASS |
| PER-6 | `engine.test.ts:638-639` asserts no "Ignored persisted rule state" line. Mutant B4 was killed (`…renders the 8-rule contract with no ignored-state line (PER AC-6)`) | ✅ PASS |
| PER-7 | `git grep -i persona` over `skills/**/*.md`, excluding the-fool, finds only "personal data" and "permission" English words. Sensor: `skills-harness-integrity.test.ts:556-575` | ✅ PASS |
| PER-8 | `observation-extractor.test.ts:161-162`. This file is unchanged since iteration 1, where it ran 66/0 | ✅ PASS |

### P1: Seven-agent roster

| AC | Evidence | Result |
| --- | --- | --- |
| ROS-1 | `ls skills/agents` returns exactly the 7 names, and a loop comparing frontmatter `name` to the directory finds 0 mismatches. Sensor: `validate-repository.test.ts:564-571` | ✅ PASS |
| ROS-2 | `code-explorer/SKILL.md` defines `lookup` and `trace` modes (`:29,38`) and uses the read-only denylist. Sensors: `generate-subagent-artifacts.test.ts:120`, `subagent-parity.test.ts:450` | ✅ PASS |
| ROS-3 | The `judge` charter has three modes, including `escalate_to_full`. Sensor: `charter-contract-preservation.test.ts` (fixture pinned at `f582b602`) | ✅ PASS |
| ROS-4 | The `product-manager` charter covers `furps` (`FR-<letter>-<N>`) and `requirements`, and is read-only. Sensor: the contract fixture | ✅ PASS |
| ROS-5 | The `code-reviewer` charter covers review, verify, audit (5 lenses), and guide, and is read-only. Sensor: the dispatch-mapping lens-set check | ✅ PASS |
| ROS-6 | The `designer` charter covers both reading and writing UI (`designer/SKILL.md:3,18,40,51`) | ✅ PASS |
| **ROS-7** | **Independent repo-wide sweep**, described in its own section below. **0 live agent references remain.** Every residual falls into an amended AC-7 exception or is non-agent English. The three iteration-1 sites are repointed. The widened sweep kills all 4 new spelling plants (S1–S4) | ✅ PASS (gap closed) |
| ROS-8 | `workflow-harness-contract.test.ts:400,464-512` (`ROSTER = 7`, repo-wide count-claim scan), green in test:scripts | ✅ PASS |
| ROS-9 | `charter-contract-preservation.test.ts:81` (`sourceRef` `f582b602`) and `:101+`, green | ✅ PASS |

#### ROS AC-7 independent sweep

**Command**: `git grep -nIiP '(?<![\w])(?<!code[-\s])(?<!code_)(planner|context[-\s_]curator|documentation[-\s_]agent|investigator|navigator|meta[-\s_]judge|plan[-\s_]critic|furps[-\s_]analyst|requirements[-\s_]analyst|verification[-\s_]agent|mobile[-\s_]specialist|architecture[-\s_]specialist|audit[-\s_]specialist|reviewer)' -- . ':!.specs' ':!.ua' ':!CHANGELOG.md'`

The command covers every tracked file, not only `skills/`. It matches any case, hyphen, space, or underscore separators, prefixed forms such as `massa-ai-reviewer`, and suffixed or plural forms, because it has no trailing boundary.

- **Population**: 273 hits in 64 files. A second sweep for camelCase and joined forms (`planCritic`, `metaJudge`, …) returned 0.
- **Every hit was classified**:

| Class (amended AC-7 exception) | Sites |
| --- | --- |
| Single mapping table | `skills/AGENTS.md:282-295` (14 rows) |
| Historical record (DOC AC-2) | `docs/removed-features.md:56,79-85` |
| Historical review-finding ids | "plan-critic C1/C3/C4/F1/F3/F4/blocking finding #1/#2" in `attribution-resolver.ts:14`, `_pin.sh:4`, `serialize.ts:8`, `engine.ts:126`, `generate-subagent-artifacts.ts:354,468,695`, and test headers (`serialize.test.ts`, `tool-definitions-fields-flow.test.ts`, `model-registry*.test.ts`, `hook-compact-snapshot-route.test.ts`, `compact-snapshot-attribution.test.ts`, `embedding-defaults-parity.test.ts`, `workflow-harness-contract.test.ts:635`) |
| A17 legacy-name lists | `MASSA_AI_LEGACY_AGENT_NAMES` in 4 plugin `install.sh` and `scripts/lib/installer-shared.sh:386`, plus `packages/shared/src/profile-switch/ownership.ts:20-37` |
| Absence, retirement, or successor tests and frozen fixtures | `subagent-parity.test.ts` (`BASELINE_SUCCESSOR` map, frozen baseline allow-list, successor lookups), `charter-contract-preservation.test.ts` (frozen `f582b602` list), `generate-subagent-artifacts.test.ts` (A9 retirement), `skills-harness-integrity.test.ts:10,195`, `workflow-dispatch-mapping.test.ts` (the sweep's own regexes and allowlist), ownership and legacy-prune fixtures (`ownership.test.ts`, `agent-ownership-parity.test.ts`, `engine.test.ts:808,819`, `agents-install.test.ts:150-153,266`, `test-installer-agent-ownership.sh`), `verify-model-tokens.test.ts:82-83` (a synthetic parser fixture), `pyts-golden/*.json` (frozen lessons snapshots) |
| Historical rationale comments | `skills-duplication-metric.test.ts:60-111` (dated metric history), `agent-era-guidance-content.test.ts:271` ("retired audit-specialist lens table") |
| Non-agent English or identifiers | the human reviewer (`check-tools-thin.ts:161,363`, `lessons.md:72,88`, `lessons.ts:26,76`, `pr-review.md:215`, `create-rfc/quality-and-lifecycle.md:75`, `implementation-delivery.md:151`, `validate.md:183`, `sse-keepalive-contract.test.ts`, `config-forms.test.ts`, `bootstrap-skill-contract.test.ts`), navigation state (`mobile-diagnosis.md:60`), query/identity planner (`docs/adr/0001…:25`, `packages/core/src/services/project-identity/*`, `project-identity-*.test.ts`), the `REVIEWER_DISPATCH_HEADER` identifier whose value is `code-reviewer` (`agent-era-guidance-content.test.ts:399+`), `reviewerRowIdx` for the `code-reviewer` row (`registry-editor.test.ts:250`), the "act as a reviewer" prompt (`observation-extractor.test.ts:157`) |
| Opaque handoff fixture data (predates the feature) | `targetAgent: "reviewer"` in `handoff-proposal-pg.test.ts`, `handoff-store-fail-loud.test.ts`, `e2e/11.lifecycle.test.ts:588-613` |

**Live agent references: 0.**

### P1: Workflow dispatch mapping

| AC | Evidence | Result |
| --- | --- | --- |
| Dispatch-1..8 | `workflow-dispatch-mapping.test.ts` exact per-workflow sets (`:36-214`), 59/0 at HEAD. The iteration-1 mutants F4 and F5 on this surface were killed | ✅ PASS (8 ACs) |
| Dispatch-9 | On disk there are 58 `**Dispatch: \`<name>\`**` blocks: builder 8, code-explorer 2, code-reviewer 32, designer 6, judge 2, product-manager 4, test-engineer 4. All are unprefixed roster names, and each exists in all 4 bundles (7 files in each of the 26 agent dirs). Sensor: `skills-harness-integrity.test.ts:148,162` | ✅ PASS |

### P1: Workflow inventory

| AC | Evidence | Result |
| --- | --- | --- |
| Inv-1 | `git ls-files` finds 36 workflow `.md` files, with 0 `general.md` or `maestro` paths | ✅ PASS |
| Inv-2 | `workflow-metadata-headers.test.ts:164-200` is green | ✅ PASS |
| Inv-3 | The `\bMST\b` / `\bmaestro\b` word count in `audit-report-io.md` is 0, and in `validate_audit_report.ts` it is 0. The five remaining case-insensitive `Maestro` hits (`audit-report-io.md:303,315,321,330,454`) name the Maestro E2E *tool* inside the MFM template. They are neither the retired family nor the `MST` prefix | ✅ PASS |
| Inv-4..9 | The cited sensors (`validate-repository.test.ts:850`, `workflow-harness-contract.test.ts:770`, `workflow-command-entries.test.ts:168`, `registry-editor.test.ts:948`, stale-pointers PASS) are green. The web-ui suite was not re-run, and its subject is unchanged since the 786/0 run in iteration 1 | ✅ PASS (6 ACs) |

### P1: Unprefixed names with marker ownership

| AC | Evidence | Result |
| --- | --- | --- |
| NAM-1, NAM-2 | A verifier walk over all 182 generated agents (140 `.md` + 42 `.toml`, in `agents/` and every `agent-profiles/<p>/`) found 0 bad entries. Each `.md` has the marker `<!-- massa-ai-owned: true -->` as its first body line. Each Claude and Cursor `name:` equals its basename. Each `.toml` starts with `# massa-ai-owned` and carries `name = "<basename>"` | ✅ PASS |
| NAM-3, NAM-4, NAM-5 | `test-installer-agent-ownership.sh` is 80/80. Mutant B1 (the legacy list drops `reviewer`) was killed | ✅ PASS |
| NAM-6, NAM-11 | Shared profile-switch is 138/0. Mutant B3 (the marker is accepted on any body line) was killed | ✅ PASS |
| NAM-7..10 | The sentinel-classes shell suite passes 39/39. `verify-harness-install.test.ts`, `hook-doctor.test.ts:153`, `subagent-parity.test.ts:181,343+`, and `skills-harness-integrity.test.ts:177-185` are all green | ✅ PASS (4 ACs) |

### P2: Docs and records

| AC | Evidence | Result |
| --- | --- | --- |
| DOC-1 | `workflow-harness-contract.test.ts`, the repo-wide count-claim scan, is green. The sweep above finds 0 `persona router` hits in the listed docs. Since iteration 1 the only doc edit is `skills/AGENTS.md:146`, and it changes no count | ✅ PASS |
| DOC-2 | `docs/removed-features.md:50-97` | ✅ PASS |
| DOC-3 | `CHANGELOG.md` `[Unreleased]` has `### Removed` + `### Changed` | ✅ PASS |

**Status**: 49/49 ACs matched, 0 gaps, 0 open spec-precision gaps.

---

## Discrimination Sensor

**Setup**: a scratch worktree was created with `git worktree add --detach /tmp/roster-verify 738010a8`. The root and `apps/opencode-plugin` `node_modules` were symlinked from the roster worktree. `apps/opencode-plugin/dist` and `packages/core/src/generated` were copied. `XDG_CONFIG_HOME=$(mktemp -d) bun run generate:artifacts` exited 0.

**Scratch baseline** (before any mutation):
- The scripts bun suites ran 2172 pass / 4 fail. The 4 failures are the native Tree-sitter `dist`/packed-artifact provisioning cases, the same set that iteration 1 saw.
- Every targeted suite was green: dispatch-mapping 59/0, ownership shell 80/80, opencode `install.test` 40/0, shared profile-switch 138/0, ownership-parity 5/0, bootstrap engine 72/0, skill-artifacts prune 8/0.

**Procedure**:
- Each mutation was applied with `perl` and confirmed as non-empty by `cmp`/`diff` against the real worktree before its suite ran.
- Each was restored with `cp` from the real worktree, never git, and then `cmp`-verified ("restored ok" ×15).
- After all mutations, the scratch porcelain showed only the two `node_modules` symlinks. The symlinks were removed and then the scratch worktree was removed.

| # | Target | Mutation | Suite | Result |
| --- | --- | --- | --- | --- |
| S1 | `skills/massa-ai/workflows/judge-with-debate.md` | plant "The **Meta Judge** writes the rubric once." | dispatch-mapping | ✅ Killed: `:9` listed as an offender |
| S2 | `skills/massa-ai/references/agent-orchestration.md` | plant "Ask the **context curator** for the packet." | dispatch-mapping | ✅ Killed: `:175` |
| S3 | `skills/agents/code-reviewer/SKILL.md` | plant "An **Audit-Specialist-led** pass comes first." | dispatch-mapping | ✅ Killed: `:12` |
| S4 | `skills/massa-ai/references/figma-pre-analysis.md` | plant "The **PLANNER** helps here." | dispatch-mapping | ✅ Killed: `:22` |
| B1 | `apps/claude-plugin/install.sh:884` (installer ownership) | the A17 legacy list drops `reviewer` | ownership shell | ✅ Killed: 2 ✗ (`claude: legacy massa-ai-reviewer.md is pruned`, `only the three user entries remain`) |
| B2 | `apps/opencode-plugin/install.sh:330` (retired-skill prune, uninstall path) | delete `remove_retired_skills "$record"` | opencode install.test | ✅ Killed: `uninstall removes a recorded persona-router skill` |
| B3 | `packages/shared/src/profile-switch/ownership.ts:52` (profile-switch ownership) | the `.md` marker is accepted on any body line (`lines.slice(close+1).includes`) | shared profile-switch + ownership parity | ✅ Killed: 2 fail (`hasOwnedMarker > only the first body line…`, the bash==TS pinned-verdict parity) |
| B4 | `packages/shared/src/bootstrap/rules.ts:53` (bootstrap retired id) | `RETIRED_RULE_IDS = []` | shared bootstrap | ✅ Killed: 4 fail (incl. PER AC-6 no-ignored-state line) |
| B5 | `scripts/generate-skill-artifacts.ts:258` (retired bundle prune) | `RETIRED_BUNDLE_ROOTS = []` | skill-artifacts prune | ✅ Killed: 2 fail (PER AC-3 vanish, install-skills list parity) |

**Sensor depth**: P0-full, because installers and profile-switch write into users' home directories.
**Result**: **9 mutations, 9 killed, 0 survived.** This counts 4 retired-name spellings the fix did not name and 5 fresh behavior mutations on installer ownership, retired-skill prune, profile-switch ownership, bootstrap retired-id, and generator prune.

**Blind-spot probes**: these are not counted as mutants. Each planted a spelling that is absent from the repo and ran the full `./scripts/__tests__` bun suite.

| Probe | Planted in `figma-pre-analysis.md` | Result |
| --- | --- | --- |
| P1 | "Dispatch massa-ai-planner for this stage.", also with the name in backticks | Survives every content sensor. The only failure is the unrelated bundle-drift check, because the bundles were not regenerated. The sweep's `(?<![\w-])` lookbehind rejects a hyphen-prefixed name |
| P2 | "Dispatch the requirements_analyst here." | Survives. The separator class is `[-\s]` and has no `_` |
| P3 | "The navigators trace the flow." | Survives. The `(?!\w)` tail rejects plurals, which is deliberate so that "reviewers" can stay a human word |

---

## Risks and Skipped Checks

1. **Sweep blind spot, prefixed legacy names (non-blocking)**. A prose `massa-ai-<retired>` in `skills/` (probe P1) is not caught by any content sensor. That form would point a dispatch at an agent that is no longer generated. It is absent today, per the repo-wide sweep. The fix would be to drop `-` from the leading lookbehind and allowlist the prefixed fixture sites, or to add a `massa-ai-(<14 names>)` sweep over `skills/`.
2. **Sweep blind spot, underscore and plural forms (non-blocking)**. P2 and P3 survive. Both forms are unlikely in prose, and none exists today.
3. **Skipped at this iteration**: build, type-check, web-ui, opencode `src`, and the per-file core and mcp-client runs. The reason is given under Gate Check: the delta touches no source they cover. Turbo whole-package core and mcp-client runs are skipped because of the Bun napi SIGTRAP.
4. The Figma pre-analysis dispatch now names `code-explorer` `trace` mode. That mode is defined for code flow tracing, and Stage 1 reads Figma through MCP. Figma MCP is reachable, because the Claude denylist leaves MCP intact, so this is a semantic stretch rather than a contract break. The owner may prefer `designer` `audit` mode.

---

## Requirement Traceability Update

| Requirement | Previous | New |
| --- | --- | --- |
| ROS-02 | ❌ Needs Fix (iteration 1) | ✅ Verified |
| PER-01..04, ROS-01, ROS-03, WFL-01..04, NAM-01..03, DOC-01 | ✅ Verified | ✅ Verified (re-run) |

The verifier wrote only this file. It did not touch `spec.md`, `FEATURES.json`, `lessons.json`, or the metric store.

**Suggested reusable lesson**: when a retired-name sweep excludes a hyphen before the name (`(?<![\w-])`) so that it does not match compound words, it also stops seeing the *prefixed* legacy form (`massa-ai-<name>`). That prefixed form is the exact shape a rename leaves behind. Probe a prefixed plant separately.

---

## Summary

**Overall**: ✅ Complete
**Result**: PASS

- **Spec-anchored check**: 49/49 ACs matched, 0 spec-precision gaps.
- **Sensor**: 9/9 mutations killed: 4 unnamed retired-name spellings and 5 fresh P0 behavior mutations. 3 blind-spot probes survive and are reported as non-blocking risks.
- **Gate**: generate `--check` 0, lint 0, stale-pointers PASS, scripts 2177/0 plus shell 41/41, plugins 183/0, shared 976/0.
- **Next step**: the feature can proceed to PR. Optionally, close Risk 1 by adding the prefixed `massa-ai-<retired>` form to the `skills/` sweep before merge.
