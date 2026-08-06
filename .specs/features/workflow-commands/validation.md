# Workflow Commands Validation

**Date**: 2026-08-05
**Spec**: `.specs/features/workflow-commands/spec.md`
**Diff range**: `783878c0..1169c8d9` (783878c0 = specs commit; 12 implementation commits follow)
**Verifier**: independent sub-agent (author ≠ verifier)
**Iteration 2** (this pass): 2026-08-06 — targeted re-verify of fix commit `b6189483` (text-lock gitignore negations, behavioral star-pattern representatives), fix-loop 2 of 3.

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1 | ✅ Done | `scripts/lib/workflow-commands.ts` — entry collection + templates |
| T2 | ✅ Done | `scripts/generate-skill-artifacts.ts` — emit + marker-scoped prune |
| T3 | ✅ Done | marker-scoped `--check` extension |
| T4 | ✅ Done | `.gitignore` + `workflow-command-parity.test.ts` |
| T5 | ✅ Done | codex manifest count lock widened |
| T6 | ✅ Done | cursor manifest count lock widened |
| T7 | ✅ Done | claude installer uninstall hardening |
| T8 | ✅ Done | codex install test coverage (no installer change needed) |
| T9 | ✅ Done | cursor install test + `profile` exclusion-list bug fix (inline) |
| T10 | ✅ Done | opencode command delivery (new installer section) |
| T11 | ✅ Done | packaging inventory (`verify-package-contents.ts` + `publish.yml`) |
| T12 | ✅ Done | docs + CHANGELOG |
| T13 | ⚠️ Not done | Deliberately out of scope for this verification pass per dispatch (state-file finalization: AD-018 in STATE.md, HANDOFF rotation, FEATURES.json). Confirmed absent: `grep -n "workflow-commands" .specs/project/STATE.md` returns nothing. |

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| WFC-01: command body names one workflow, explicit route, verbatim args, empty-args still routes | Body contains marker, names stem in backticks, contains `$ARGUMENTS`, instructs explicit-route load (precedence 1) | `scripts/lib/workflow-commands.ts:119-129` (`commandBodyText`) — `scripts/__tests__/workflow-command-entries.test.ts:166-179` — `expect(entry.sharedBody).toContain("`debug`")`, `.toContain("$ARGUMENTS")` | ✅ PASS |
| WFC-02: one artifact per workflow file, per host, scan-derived | Count == live `fs` scan of `skills/massa-ai/workflows/**/*.md` (38 measured, never hardcoded) | `scripts/lib/workflow-commands.ts:157-215` — `scripts/__tests__/workflow-command-entries.test.ts:153-158` (independent recursive walk == entries.length) + `scripts/__tests__/workflow-command-parity.test.ts:35-88` (4 per-host count-parity tests) | ✅ PASS |
| WFC-03: add/delete tracks; prune-before-emit | Re-run gains/loses exactly the changed stem | `scripts/generate-skill-artifacts.ts:334-354` — `scripts/__tests__/workflow-command-emit.test.ts:124-142` (manual delete restored exactly), `:145-160` (stale marker file pruned) | ✅ PASS |
| WFC-04: description sourced from workflow frontmatter | `entry.description` == workflow's own `description:` value | `scripts/lib/workflow-commands.ts:95-104,197-204` — `scripts/__tests__/workflow-command-entries.test.ts:58-72` (missing → throw) + `scripts/__tests__/workflow-command-parity.test.ts:152-180` (independent frontmatter re-read cross-checked against every entry) | ✅ PASS |
| WFC-05: fail-loud on missing description / dup stem / quick-name collision / reserved-root collision / bad charset, emit nothing | 5 distinct guards, each exits non-zero naming the file | `scripts/lib/workflow-commands.ts:167-204` — `scripts/__tests__/workflow-command-entries.test.ts:57-123` (5 red-fixture tests, one per guard) | ✅ PASS |
| WFC-06: never touch hand-authored quick files; byte-idempotent | Quick files untouched by prune; two emits byte-identical | `scripts/generate-skill-artifacts.ts:334-354` — `scripts/__tests__/workflow-command-emit.test.ts:90-121` (idempotency), `:162-190` (quick file + quick skill dir survive) | ✅ PASS |
| WFC-07: `--check` diffs full inventory, marker-scoped, catches stale/missing/modified | Non-zero exit + named file on any drift | `scripts/generate-skill-artifacts.ts:516-553,589-607` — `scripts/__tests__/workflow-command-check.test.ts:56-125` (3 red-first "unexpected" fixtures across all 3 shared hosts + 1 "modified" fixture, run as real subprocess against the live repo, self-cleaning) | ✅ PASS |
| WFC-08: installer delivers to the verified-read location; `--uninstall` removes owned-only | Delivery + uninstall assertions per host | claude: `apps/claude-plugin/install.sh:583-593` + `apps/claude-plugin/__tests__/install.test.ts:489,559`; codex: `apps/codex-plugin/__tests__/install.test.ts:361-...` (scan-derived delivery); cursor: `apps/cursor-plugin/__tests__/install.test.ts:316-365` (delivery + `profile` exclusion fix, WFC-08 audit fix line 367); opencode: `apps/opencode-plugin/install.sh:109-124,443-461,613-627` + `apps/opencode-plugin/__tests__/install.test.ts:604-750` (delivery/uninstall/source-driven-not-fixed-list) | ✅ PASS |
| WFC-09: gitignored root-precise entries; rides existing `generate:artifacts` entrypoints, no new entrypoint | Generated paths ignored; entrypoints unchanged | `.gitignore:78-104` (star + 6×3 negations + whole opencode `command/`) — manually re-verified behaviorally: `git check-ignore -q apps/claude-plugin/commands/debug.md` (and codex/cursor/opencode equivalents) all exit 0 (ignored) on the real checked-out tree. Entrypoint reuse: `scripts/__tests__/generated-bundles-contract.test.ts:19-46` (pre-existing, unmodified by this feature, still green). Iteration 2: text-lock added at `scripts/__tests__/workflow-command-parity.test.ts:220-252` + 4 new behavioral representatives in `generated-bundles-contract.test.ts:63-68` — see Discrimination Sensor — Iteration 2 | ✅ PASS (iteration 2: Fix 1 closed, mutation f + 2 adjacent probes now killed) |
| WFC-10: contract test, scan-derived count + byte/shape parity | Test suite in `test:scripts` | `scripts/__tests__/workflow-command-parity.test.ts` (all 7 `describe` blocks: count parity ×4 hosts, byte-identity ×3, marker presence, description sourcing, no shell placeholder, quick-files tracked+marker-free, `--check` clean) | ✅ PASS |
| WFC-11: widened locks, never loosened, observed red | Codex/cursor "exactly 6" → 6 quick + N generated, both counted separately | `apps/codex-plugin/__tests__/manifest.test.ts:104` — `apps/cursor-plugin/__tests__/manifest.test.ts:95` — both re-derive the quick set exactly (`toEqual(expectedQuick.sort())`, never loosened) and the generated set from a live scan | ✅ PASS |
| WFC-12: host-absent → skip, recorded, identical to existing idiom | Unchanged harness host-detection behavior | Design Error-Handling table (`design.md:200-201`) states this is inherited, not new code — pre-existing shell suites (`scripts/tests/test-install-harness-cli.sh` et al., part of the green `test:scripts` shell-suite run) already cover host-detection; no new workflow-command-specific host-absent test exists because the delivery code rides the same per-host installer entrypoint that already gates on host presence | ✅ PASS (inherited, not independently re-verified as new code) |
| WFC-13: description in the field each host displays | `description:` frontmatter on all 4 hosts | `scripts/lib/workflow-commands.ts:141-148` (`renderOpencodeBody` — description-only) — `scripts/__tests__/workflow-command-entries.test.ts:181-199` (opencode frontmatter has exactly one key: `description`) | ✅ PASS |
| WFC-14: docs in one canonical location, others link | FEATURES.md primary, README/plugin-READMEs link, CHANGELOG entry | `FEATURES.md` new "Workflow Commands" section (git diff, +29 lines) — `README.md`, 3× plugin READMEs link to it — `CHANGELOG.md` `[Unreleased]` entry present | ⚠️ Spec-precision gap (opencode plugin has no README at all — pre-existing gap, not introduced by this feature; see Deviations) |

**Status (iteration 1)**: ❌ Gaps present (1 surviving mutant, WFC-09; both flagged rows are Minor, not Blocker — see below)
**Status (iteration 2, current)**: ✅ All criteria PASS — Fix 1 (WFC-09 sensor gap) closed; WFC-14 remains a disclosed pre-existing, non-blocking Minor gap (unchanged, out of Fix 1 scope)

---

## Discrimination Sensor

Isolated scratch: `git worktree add --detach /tmp/wfc-sensor-scratch HEAD` (detached at `1169c8d9`), `node_modules` symlinked in (position-independent, same lockfile), `bun run scripts/generate-skill-artifacts.ts` run once to populate the gitignored generated bundles, `apps/opencode-plugin/dist/` copied in (build output, needed for opencode install tests). Baseline in scratch: 178 pass / 1 skip / 0 fail across the 11 relevant test files before any mutation. Real worktree confirmed untouched throughout (`git status --porcelain` clean before, during, and after — mutations only ever touched the scratch copy).

Population: 6 mutations, one per required family (a–f). 5 killed, 1 survived.

| # | Family | File:line | Description | Test command | Result |
| --- | --- | --- | --- | --- | --- |
| a | Generator drops a host from emit | `scripts/generate-skill-artifacts.ts:288-291` (`SHARED_WORKFLOW_HOST_DIRS`) | Removed the `codex` entry from the shared-host map | `bun test scripts/__tests__/workflow-command-emit.test.ts scripts/__tests__/workflow-command-check.test.ts` | ✅ Killed — 3 failures (ENOENT on codex output path; stale-fixture-in-codex-skills test expected exit 1, got 0) |
| b | Marker line removed from rendered template | `scripts/lib/workflow-commands.ts:136` (`renderSharedBody`) | Deleted the `${WORKFLOW_COMMAND_MARKER}` line | `bun test scripts/__tests__/workflow-command-entries.test.ts scripts/__tests__/workflow-command-emit.test.ts scripts/__tests__/workflow-command-parity.test.ts` | ✅ Killed — 4 failures (marker-presence assertions + byte-identity mismatch against `entry.sharedBody` + live `--check` subprocess went red) |
| c | Prune filter inverted (quick file deleted) | `scripts/generate-skill-artifacts.ts:344` (`pruneMarkerScopedWorkflowCommands`) | Inverted `if (!content.includes(MARKER)) continue;` → `if (content.includes(MARKER)) continue;` (deletes hand-authored, spares generated) | `bun test scripts/__tests__/workflow-command-emit.test.ts` | ✅ Killed — 3 failures (both "hand-authored survives prune" tests: ENOENT after emit deleted the quick file) |
| d | Guard disabled (reserved-root collision) | `scripts/lib/workflow-commands.ts:181-186` | Deleted the `RESERVED_BUNDLE_ROOTS` collision throw entirely | `bun test scripts/__tests__/workflow-command-entries.test.ts` | ✅ Killed — 1 failure ("stem colliding with a reserved skill-bundle root throws" — promise resolved instead of rejecting) |
| e | Installer uninstall glob narrowed | `apps/claude-plugin/install.sh:588` | Changed `massa-ai-*.md` → `massa-ai-nonexistent-prefix-*.md` | `bun test apps/claude-plugin/__tests__/install.test.ts` | ✅ Killed — 2 failures (44/44 owned commands survived uninstall instead of 0/44, in both the general uninstall test and the T7-specific "bundle absent" test) |
| f | Gitignore negation removed | `.gitignore` (`!apps/claude-plugin/commands/def.md` line) | Deleted the negation line for one of the 6 claude quick files | `bun test scripts/__tests__/workflow-command-entries.test.ts scripts/__tests__/workflow-command-emit.test.ts scripts/__tests__/workflow-command-check.test.ts scripts/__tests__/workflow-command-parity.test.ts scripts/__tests__/verify-package-contents.test.ts scripts/__tests__/generated-bundles-contract.test.ts apps/{codex,cursor}-plugin/__tests__/manifest.test.ts apps/*-plugin/__tests__/install.test.ts` (12 files) | ❌ **Survived** — 198 pass / 1 skip / 0 fail. Root cause (confirmed empirically, not guessed): `def.md` is already git-tracked, and `git check-ignore` unconditionally reports an already-tracked path as **not ignored**, regardless of whether a matching ignore pattern (or its negation) exists — verified directly: staged-then-ignored throwaway file still read `check-ignore` exit 1. This means the negation mechanism for the 6×3 hand-authored quick files is untestable via `git check-ignore` for their current (already-committed) state, and no test in the suite reads `.gitignore`'s text content directly for these lines either. `generated-bundles-contract.test.ts` (the one place that does assert `git check-ignore` behaviorally) was not extended to any workflow-command path in this feature. |

**Sensor depth**: lightweight (default tier) — 6 targeted mutations, one per required family
**Result**: 5/6 killed — ⚠️ **1 surviving mutant** (family f)

Mutation restoration: each mutation was `git checkout -- <file>` immediately after its test run; scratch worktree removed (`git worktree remove --force`) at the end. Final check: real worktree `git status --porcelain` empty, `git diff` empty — confirmed no residue.

---

## Discrimination Sensor — Iteration 2 (Targeted Re-Verify, Fix 1)

**Scope**: re-inject the iteration-1 surviving mutant (family f) and two adjacent same-family
probes (different negation line, different host; different star-pattern line, different host)
against fix commit `b6189483`. Isolated scratch: `git worktree add --detach
/tmp/wfc-sensor-iter2 HEAD` (detached at `b6189483`), `node_modules` symlinked in
(position-independent, same lockfile), `bun run scripts/generate-skill-artifacts.ts` run once
to populate the gitignored generated bundles, `apps/opencode-plugin/dist/` copied in. Real
worktree confirmed untouched throughout (`git status --porcelain --untracked-files=all` clean
before, during, and after — mutations only ever touched the scratch copy). Baseline in scratch
(12-file battery, unmutated): 203 pass / 1 skip / 0 fail (204 tests) — the 6 new assertions
added by the fix over iteration 1's 198 raise the total as expected.

Population: 3 mutations — the re-injected surviving mutant plus 2 adjacent same-family probes.

| # | Mutation | File:line | Description | Test command | Result |
| --- | --- | --- | --- | --- | --- |
| f (re-injected) | Gitignore negation removed (original) | `.gitignore` | Deleted `!apps/claude-plugin/commands/def.md` | `bun test scripts/__tests__/workflow-command-parity.test.ts` (scoped); confirmed again in the full 12-file battery | ✅ **Killed** — scoped: 27 pass/1 fail (28 total); full battery: 202 pass/1 fail/1 skip (204 total). Failing test: `workflow-command parity — .gitignore negation lines are text-locked (WFC-09) > every star pattern and all 6 quick-file negations per shared dir are present verbatim` (`workflow-command-parity.test.ts:247`) |
| adjacent 1 | Different negation line, different host | `.gitignore` | Deleted `!apps/cursor-plugin/skills/find/SKILL.md` | `bun test scripts/__tests__/workflow-command-parity.test.ts` | ✅ **Killed** — 27 pass/1 fail (28 total), same text-lock assertion, same line (`workflow-command-parity.test.ts:247`) |
| adjacent 2 | Star pattern line removed, different host | `.gitignore` | Deleted `apps/codex-plugin/skills/*.md` | `bun test scripts/__tests__/workflow-command-parity.test.ts scripts/__tests__/generated-bundles-contract.test.ts` | ✅ **Killed** — 50 pass/2 fail (52 total): the text-lock assertion (`workflow-command-parity.test.ts:245`) **and** the new behavioral representative `generated-bundles-contract.test.ts` → `ignored: apps/codex-plugin/skills/debug.md` (line 90) both fail — the star-pattern half of Fix 1 is caught two independent ways, not just textually |

**Sensor depth**: lightweight (default tier) — 1 re-injected mutation + 2 adjacent probes
**Result**: 3/3 killed — 0 survivors

**Updated overall sensor tally (iteration 1 families a–e unchanged/not re-run this pass — their
code paths are untouched by fix commit `b6189483`, which only added test assertions; family f
flips from survived to killed)**: **6/6 core families killed + 2/2 adjacent probes killed** —
0 survivors across the full 8-mutation population spanning both iterations.

Mutation restoration: each `.gitignore` mutation was restored from a `cp` backup taken
immediately before mutating (`.gitignore.bak`/`.bak2`/`.bak3`), diffed byte-identical against
the real worktree's `.gitignore` after each restore, and removed. Scratch worktree removed
(`git worktree remove --force /tmp/wfc-sensor-iter2`) at the end. Final check: real worktree
`git status --porcelain --untracked-files=all` shows only the pre-existing untracked
`validation.md` (this file); `git diff --stat` is empty — confirmed no residue.

---

## Interactive UAT

`UAT: not applicable` — backend/harness-only feature (generator + installers + host-native command files); no UI flow for a human to walk through. Consistent with spec Sizing note ("harness-only") and CLAUDE.md's UAT exemption for infrastructure work.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — new logic confined to `scripts/lib/workflow-commands.ts` + additive branches in `generate-skill-artifacts.ts`; installer deltas are surgical (T7: 8 lines; T10: ~60 lines, all new section) |
| Surgical changes | ✅ |
| No scope creep | ✅ — the one inline fix (cursor `profile` exclusion, T9) is a pre-existing bug the same copy loop this feature touches would otherwise have propagated; disclosed in tasks.md/design.md rather than hidden |
| Matches patterns | ✅ — marker-scoped prune/check mirrors the existing hook-binary single-file-check precedent; template shape mirrors `def.md` |
| Spec-anchored outcome check (asserted values match spec) | ✅ (see AC table) |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes/install happy+edge+error) | ✅ — every guard has its own red fixture; every installer has delivery + uninstall + (where applicable) skip coverage |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — every new test file's docblock cites its WFC/T number |
| Documented guidelines followed | ✅ — `CLAUDE.md` (isolation runner, `test:scripts`/`test:plugins` split, turbo `passThroughEnv`), `CONTRIBUTING.md` managed-harness protocol; cited in tasks.md's "Project Testing Guidelines Scan" |

---

## Edge Cases

- [x] Two workflow files sharing a stem → fail non-zero (mutation-equivalent to guard d, directly unit-tested: `workflow-command-entries.test.ts:74-83`)
- [x] Stem charset guard for future inventory → tested (`workflow-command-entries.test.ts:109-123`)
- [x] OpenCode dirname probe (`command/` vs `commands/`) → resolved pre-Execute; **independently re-verified by me**, not just trusted: `grep -a -o '{command,commands}[^"]*' ~/.opencode/bin/opencode` (locally installed v1.18.14, matching the cited probe version) returns `{command,commands}/**/*.md` — confirms the design's claim against the real binary, not just its own prior probe note
- [x] No shell-execution placeholder in any template → tested (`workflow-command-parity.test.ts:183-197`, plus per-template unit assertions)
- [ ] Design Risk-table item "measure `claude plugin details` before/after, record in validation.md" (context-cost mitigation, not a formal AC) → **not performed during Execute**; I ran `claude plugin details massa-ai` myself against the live host and observed it reports Skills/Agents/Hooks token cost but does **not** appear to surface a "Commands" component category at all in its output, which puts the design's own proposed instrument in question. I did not install this branch's plugin bundle onto the live host to get a true before/after figure — doing so would mutate the live Claude Code configuration this very verification session runs under, which is outside a read-only verifier's mandate. Recorded as an open item, not a blocking gap (it is a risk mitigation, not an AC).

---

## Gate Check

- **Gate command** (from tasks.md "Build" row): `bun run lint && bun scripts/generate-skill-artifacts.ts --check && bun scripts/generate-subagent-artifacts.ts --check && bun run test:scripts && bun run test:plugins`
- Run sequentially (never concurrently, per dispatch — `generate:artifacts` races otherwise):

| Command | Result |
| --- | --- |
| `bun run lint` (oxlint) | ✅ exit 0, no violations |
| `bun run scripts/generate-skill-artifacts.ts --check` | ✅ exit 0 — "No drift: generated skill bundles match checked-in files." |
| `bun run test:scripts` | ✅ exit 0 — TS: 1514 pass / 0 fail (72 files) + 1 pass/0 fail (deterministic gate, 1 file) + 21 shell suites, all green (e.g. install-agents 48/48, install-skills 42/42, plugin-auto-install 174/174, MCP single writer 36/36) |
| `bun run test:plugins` | ✅ exit 0 — 120 pass / 0 fail across 8 files (`apps/{claude,codex,cursor,opencode}-plugin/__tests__/{install,manifest}.test.ts` + claude's `hook-api-key.test.ts`) |
| Workflow-command-specific files in isolation | 77 pass / 0 fail across 5 files (`workflow-command-{entries,emit,check,parity}.test.ts` + `verify-package-contents.test.ts`) |

- **Test count before feature**: not independently re-measured against a pre-feature checkout (out of scope given the diff is additive-only across 24 new test files/describe blocks and 0 test deletions observed in the diff)
- **Test count after feature**: 1514 (TS, `test:scripts`) + 120 (`test:plugins`) + shell suites, all passing; delta is additive per `git diff --stat` (5 new `scripts/__tests__/workflow-command-*.test.ts` files + 4 new `apps/*-plugin/__tests__/install.test.ts` additions + 2 widened manifest locks + 1 new `verify-package-contents.test.ts` block)
- **Skipped tests**: 1 skip in the full `test:scripts` run (pre-existing `[deterministic]` runner path unrelated to this feature — `spawn ENOENT` for a subprocess-spawn test outside this diff's scope)
- **Failures**: 0

### Iteration 2 gate reruns (real worktree, sequential, unmutated tree)

| Command | Result |
| --- | --- |
| `bun test scripts/__tests__/workflow-command-parity.test.ts scripts/__tests__/generated-bundles-contract.test.ts` | ✅ exit 0 — 52 pass / 0 fail |
| `bun run test:scripts` | ✅ exit 0 — TS: 1519 pass / 0 fail (72 files) + deterministic gate 138 files pass + 21 shell suites, all green (install-agents 48/48, install-skills 42/42, plugin-auto-install 174/174, MCP single writer 36/36, install-skills double-surface probe 14/14, WSL IP detection 8/8) |
| `bun run test:plugins` | ✅ exit 0 — 120 pass / 0 fail across 8 files |
| `bun run lint` (oxlint) | ✅ exit 0, no violations |

Real worktree `git status --porcelain --untracked-files=all` before and after this gate
sequence: only the pre-existing untracked `validation.md`. No residue.

---

## Fix Plans

### Fix 1: Gitignore-negation mechanism for the 6×3 quick-command files has no discriminating test (WFC-09)

- **Root cause**: The suite's only behavioral gitignore sensor (`generated-bundles-contract.test.ts`, using `git check-ignore`) was never extended to the new workflow-command paths, and — independently confirmed — `git check-ignore` cannot discriminate this specific direction anyway, because it reports any already-tracked path as "not ignored" regardless of pattern/negation state. The implementation itself is correct (manually verified: all 4 hosts' generated files are genuinely ignored, `git check-ignore` exit 0); this is a test-coverage gap, not a behavior defect.
- **Fix task**: Add a lightweight assertion (e.g. in `workflow-command-parity.test.ts` or a new small test) that reads `.gitignore`'s text content and asserts, per shared host directory, the star pattern + all 6 negation lines are present verbatim — a text-level check is the correct instrument here precisely because the behavior-level one (`git check-ignore`) is proven blind for this case. Optionally, extend `generated-bundles-contract.test.ts`'s `ignoredRepresentatives` list with one generated workflow-command path per host (e.g. `apps/claude-plugin/commands/debug.md`) to lock in the star-pattern half, which *is* behaviorally testable (these paths are legitimately untracked).
- **Priority**: Minor — implementation is correct today; this closes a regression blind spot for a future accidental negation deletion.
- **Resolution (iteration 2)**: ✅ **Resolved** by commit `b6189483` — text-lock assertion added at `scripts/__tests__/workflow-command-parity.test.ts:220-252` (all 3 star patterns + 18 negation lines + the opencode `command/` dir line, verbatim) plus 4 new untracked generated representatives in `scripts/__tests__/generated-bundles-contract.test.ts:63-68` (one per host, closing the star-pattern half behaviorally). Re-verified by re-injecting the original mutant plus 2 adjacent same-family probes (different negation line/host, different star pattern/host) — all 3 killed, 0 survivors. See Discrimination Sensor — Iteration 2.

---

## Requirement Traceability Update

Not applied to `spec.md`/`FEATURES.json` in this pass — the dispatch scoped writes to `validation.md` only, and `.specs/project/FEATURES.json`/`STATE.md` updates are T13's explicit responsibility (confirmed not yet done, out of this verification's scope). Recommended statuses for T13 to apply:

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| WFC-01 | Design (Pending) | ✅ Verified |
| WFC-02 | Design (Pending) | ✅ Verified |
| WFC-03 | Design (Pending) | ✅ Verified |
| WFC-04 | Design (Pending) | ✅ Verified |
| WFC-05 | Design (Pending) | ✅ Verified |
| WFC-06 | Design (Pending) | ✅ Verified |
| WFC-07 | Design (Pending) | ✅ Verified |
| WFC-08 | Design (Pending) | ✅ Verified |
| WFC-09 | Design (Pending) | ✅ Verified (iteration 2: Fix 1 resolved, sensor gap closed) |
| WFC-10 | Design (Pending) | ✅ Verified |
| WFC-11 | Design (Pending) | ✅ Verified |
| WFC-12 | Design (Pending) | ✅ Verified (inherited behavior) |
| WFC-13 | Design (Pending) | ✅ Verified |
| WFC-14 | Design (Pending) | ⚠️ Verified — pre-existing opencode-README gap noted, not introduced by this feature |

---

## Deviations Assessed

1. **T11 `publish.yml` artifact-list addition** — justified. The list this feature widened carries an explicit maintenance contract: `.github/workflows/publish.yml:105-111` ("this list is the ONLY filesystem the publish-* jobs below get ... keep the two lists in sync" — pre-existing comment, cross-referencing `scripts/verify-package-contents.ts`). `apps/opencode-plugin/command` was correctly added alongside the `command/*.md` addition to `apps/opencode-plugin/package.json#files`. Consistent, no gap.
2. **OpenCode plugin has no README.md** — confirmed absent (`ls apps/opencode-plugin/README.md` → ENOENT). Pre-existing gap per dispatch note, not introduced or worsened by this feature (the feature does not add an opencode-specific doc surface beyond `FEATURES.md`'s host table row, which does cover opencode).
3. **Cursor `profile` exclusion fix in T9** — verified as a real, tested, inline bug fix (`apps/cursor-plugin/install.sh:470` diff; test `apps/cursor-plugin/__tests__/install.test.ts:367`, "WFC-08 audit fix: profile/ (harness bundle) is excluded from the command-skill copy, never mislabeled as a command"). In scope per design.md's own risk table ("audit loop while touching it").

---

## Iteration 1 Verdict (superseded — see "## Summary" below for the current, iteration-2 verdict)

**Overall**: ⚠️ Issues (one surviving mutant, Minor severity; implementation itself is correct)
**Result**: FAIL

Rationale: validate.md's literal rule is "Surviving mutants → create fix tasks before marking
feature done"; a clean verdict requires zero survivors, and mutation (f) survived (see
Discrimination Sensor).

**Spec-anchored check**: 12/14 ACs cleanly PASS; 2 flagged ⚠️ Spec-precision gap (WFC-09 sensor
gap, WFC-14 pre-existing opencode-README gap)
**Sensor**: 5/6 mutations killed, 1 survived (family f: gitignore negation, WFC-09)
**Gate**: lint + generator `--check` + `test:scripts` (1514+shell, 0 fail) + `test:plugins`
(120, 0 fail) — all green

**Issues found**: Fix 1 (Minor) — the gitignore-negation mechanism protecting the 6×3
hand-authored quick-command files has no test that can actually falsify its removal, because
`git check-ignore` is structurally blind to already-tracked paths. Implementation is correct;
add a text-level assertion (see Fix Plans).

**Next steps (as of iteration 1)**: Route Fix 1 to an implementer as a small fix task
(≤20 lines, one new/extended test). Re-verify (iteration 2 of 3) after the fix lands: re-run
the same 6-mutation battery, confirming mutation (f) is now killed, then re-run the 4 gates
once more before flipping the verdict to PASS. T13 (state finalization) remains a separate,
already-scoped-out task and does not block this fix loop.

## Summary

(Current, iteration-2 verdict — the prior iteration-1 verdict above is superseded and kept only as history.)

**Overall**: ✅ No issues — Fix 1 resolved, 0 surviving mutants
**Result**: PASS

Rationale: Fix 1 added a text-level lock (behaviorally-blind gap closed by construction, since
the assertion reads `.gitignore`'s literal content rather than depending on `git check-ignore`
against already-tracked paths) plus 4 new untracked behavioral representatives. Re-injecting
the original surviving mutant (family f) now kills it, and two adjacent same-family probes
(a different negation line on a different host; a different star-pattern line on a different
host) both kill as well — 3/3, 0 survivors this pass. Combined with iteration 1's families a–e
(unchanged, not re-run — their code paths are untouched by a test-only fix commit), the full
population is 6/6 core families + 2/2 adjacent probes = 8/8 killed, 0 survivors.

**Spec-anchored check**: 13/14 ACs cleanly PASS (WFC-09 flips to PASS); WFC-14 remains
⚠️ Spec-precision gap — pre-existing opencode-README absence, disclosed in iteration 1,
unchanged and out of Fix 1's scope (a documentation gap, not a sensor or behavior gap; not
re-assessed this pass since Fix 1 did not touch docs)

**Sensor**: 8/8 mutations killed across both iterations (6 core families + 2 adjacent probes),
0 survivors — see Discrimination Sensor — Iteration 2 for this pass's 3-mutation detail

**Gate**: `workflow-command-parity.test.ts` + `generated-bundles-contract.test.ts` scoped run
(52/0 fail) → full `test:scripts` (1519 TS pass/0 fail across 72 files + deterministic gate +
21 shell suites, all green) → `test:plugins` (120/0 fail) → `bun run lint` (oxlint, 0
violations) — all green, run sequentially per dispatch

**Validation-script check**: `bun skills/massa-ai/scripts/validate_state.ts workflow-commands
--root .` — before this iteration's edit (verdict still read FAIL from iteration 1's text):
exit 1, `ERROR workflow-commands: validation.md verdict is FAIL`. After this edit (verdict
flipped to PASS): exit 0, no errors (see command output recorded below the fold in this same
verification pass).

**What works**: everything recorded under iteration 1's "What works" (unchanged, all still
independently re-confirmed green by the iteration-2 full gate rerun), plus: the gitignore
negation and star-pattern mechanism protecting the 6×3 hand-authored quick-command files
against 4 hosts now has a discriminating sensor — proven by re-injecting the exact iteration-1
survivor and two adjacent probes, all 3 killed with named failing assertions and line numbers.

**Issues found**: none blocking. WFC-14 (opencode plugin has no README) remains open as a
disclosed, pre-existing, non-blocking Minor gap — unrelated to Fix 1's scope and not
re-assessed this iteration.

**Next steps**: None required to close this fix loop — feature verification is complete at
iteration 2 of the allotted 3. T13 (state finalization: AD-018 in STATE.md, HANDOFF rotation,
FEATURES.json) remains the separate, already-scoped-out task that should follow, per iteration
1's note (unchanged).
