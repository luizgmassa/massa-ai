# Bootstrap File And Rule Toggles Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `massa-ai` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/bootstrap-file-and-rule-toggles/design.md`
**Spec**: `.specs/features/bootstrap-file-and-rule-toggles/spec.md`
**Status**: In Progress

## Execution Log

| Phase | Tasks | Status | Commits | Notes |
| --- | --- | --- | --- | --- |
| 1 | T1, T2 | Complete | `0491fcb3`, `46fa6d8a`, `4b63251f`, `2582cc8d` | Two extra commits beyond the two planned tasks. Orchestrator review found a defect the planned sensor could not see: the activation stack named all three of `caveman`, `massa-ai` and `persona-router` from outside every rule span, so a disabled rule's section vanished while the contract still instructed the agent to activate it — the same class the design solved for `code-comments` with an off-text, never generalized. `4b63251f` widened the sensor and was observed red (`idLeaks` returned `["caveman", "persona-router"]`); `2582cc8d` rewrote the intro to enumerate nothing. The sensor is deliberately scoped to the residue outside *every* span rather than per-rule, because distinguishing a load-bearing cross-rule instruction from incidental same-domain prose is not mechanically expressible from the markup; that narrowing is documented inline in the test. |
| 2 | T3, T4 | Complete | `1eebd587`, `aeca60dd`, `a3ba8a6e` | One extra commit. Adding `bootstrap` to `MassaAiConfig` fired two pre-existing enforced contracts the design had not surfaced: `apps/web-ui/src/static/views/config-sections.ts` declares its section map as a mapped type over every `ConfigSectionKey`, and `installer-config-template.test.ts` requires a matching installer-template entry. What shipped is one read-only `json` field, not a per-rule toggle UI — recorded as spec assumption A12 with the reason, and the out-of-scope row narrowed to "a Web UI **toggle** surface" rather than left contradicting the artifact. Both-directions evidence for T3 is structural, not just a differing return value: `loadConfig` is proven to reach its catch-and-degrade branch via a `console.error` spy that actually fires, while `readRawConfigStrict` on the identical malformed file throws `ConfigParseError` and never calls it. Measured independently: `packages/shared` 281 pass / 0 fail across 15 files. |
| 3 | T5, T6 | Complete | `ca526646`, `5bd748cb` | Two commits, one per task. T5 widened `ignoredStateKeys` beyond the one member BST-10 AC-12 names: a known id holding a non-boolean value falls back to its default and is named there, as does a `bootstrap`/`bootstrap.rules` value that is not a plain object. `BootstrapReport` carries no second channel for either, and coercing `"false"` or `0` would disable rules the user never disabled. T6 had to decide blank-line handling, which no artifact specified — the source spaces spans inconsistently (`skills/AGENTS.md:48-49` adjacent, `:112-114` separated), so a rule's rendered whitespace would otherwise depend on its neighbours' states; runs collapse and one blank line precedes each heading, fence-aware so the four fenced policy blocks pass through byte-for-byte. Both tasks were re-measured by the parent rather than taken from the implementing agent's report: `packages/shared` 740 pass / 0 fail across 33 files, oxlint exit 0, and the rendered output inspected directly (0 surviving markers, 0 `rtk`, 7-line pointer, all-off header carrying the recovery command). 15 discrimination mutations across the two tasks, all killed; both restored from `/tmp` copies and hash-verified, because `git checkout` on an untracked new file deletes it rather than restoring it. |
| 4 | T7, T8 | Complete | `0316ad84`, `0a0ceb78` | Two commits, one per task, both implemented by a delegated builder and re-measured by the parent rather than taken from its report. Four additions beyond the literal task text, each because the stated contract made a required behavior unreachable: `buildBootstrapReport` (T7), because "restartRequired is true only for a non-dry-run with at least one written row" is otherwise a comment on a field and any test of it would assert its own construction; and `source?`/`sourcePath?`/`onWarning?` (T8), because `{targetHome, dryRun?}` cannot reach the marked-up source at all and `BootstrapReport` has no warnings channel for AC-10b. `skipped` had no defined trigger and now means a byte-identical re-apply whose wiring is present. **`defaultStatePath` does not exist where `design.md:455` says it does** — it is private and duplicated at `profile-switch/engine.ts:60` and `variant-sync.ts:70`, exported from neither, verified absent from `state.ts`; the path is derived from `path.dirname(bootstrapStateFilePath(targetHome))` instead. Gates: `packages/shared` 815 pass / 0 fail across 35 files, oxlint exit 0, and the real home verified untouched by hand (no `MASSA-AI.md` under `~/.claude`, `~/.codex`, `~/.cursor`, `~/.config/opencode`; `~/.config/massa-ai/config.json` still at its 2026-08-18 mtime). 16 discrimination mutations across the two tasks, all killed, all anchor-counted before replacement, all restored from `/tmp` copies and hash-verified. |
| 5 | T9, T10, T11 | Complete | `f9d8bbea`, `c0599829`, `34158aa5`, `efe9876c`, `fed7becb` | Five commits for three tasks. T9 is committed **red on purpose** (22 passed / 39 failed) — a green red-first sensor would mean it asserts what the installer already does. It immediately found a defect in already-merged code: `MASSA-AI.md` had two writers disagreeing byte-for-byte, `engine.ts:310` writing the raw body while `bootstrap_op` writes the marker pair, breaking `spec.md:96`, `design.md:475` (the pair *is* the ownership proof) and `spec.md:118`. Fixed in `c0599829` by wrapping at the writer, verified against the installer's own extract/plan heredocs sliced verbatim out of `install-skills.sh`; the pre-fix state made `extract` exit 2, "Bootstrap block not found". The engine fix is one variable, not one call site — `document` feeds both the write and the up-to-date comparison, and fixing only the write would have made every host report `written` on an unchanged pass. T10 took the sensor to 26/35 and scoped rather than inverted `is_owned_target`'s symlink comment (different subjects: `rm -rf` of a node under `skills/` versus write-through into a file's bytes). Two of T10's five behaviours had **no committed sensor** — the symlink refusal and temp-file atomicity survived the whole suite untouched — closed in `efe9876c`, +16 assertions, 121 insertions and 0 deletions, sensor 42/35 with the failed count unmoved. T11's plan mode senses **absence of an fs call**, not absence of a change: a read-only compare-then-skip leaves bytes identical and passes a bytes-after sensor, so the test wraps all 96 writable function properties of the `fs` namespace with a delegating counter. Two design clauses could not be implemented literally and are commented at their call sites: `design.md:449` (`writeConfig` itself gaining the mode contract — impossible, a zero-contact plan needs the current document and both live call sites pass only the desired one) and `design.md:272` (the superseded compare-then-skip, overturned by `:449` and `:477`). 25 mutations across the three tasks, all killed. Gates: artifact drift `--check` exit 0 under a scratch `XDG_CONFIG_HOME`, mirror byte-identical, oxlint 0, installer siblings rc=0. **`bun run test:scripts` cannot reach any `.sh` suite** — `package.json:38` chains `bun test … && for f in …`, and two pre-existing `pyts golden: lessons` failures abort the bun phase first, so the whole shell battery is unreachable through the documented command and was run directly. |
| 6–11 | T12–T25 | Pending | — | Plan Challenge run before the first Phase 6 mutation — see below. |

**Plan Challenge, Phases 6–11 (2026-09-07).** A read-only `massa-ai-plan-critic` pass was run
against T12–T25 before any Phase 6 edit, then every finding was re-measured at its own line by
the orchestrator rather than accepted from the report. Six blocking findings, all confirmed,
all now amended into the task bodies as `PC-*` bullets: **PC-B1** the bootstrap module is not
exported at all (`packages/shared/package.json:11-28` closes `exports` to four subpaths, root
`index.ts` names no bootstrap symbol, `dist/index.js` holds 0 occurrences) — invisible to every
gate because all six suites import relatively and the shell suite imports the absolute source
path; **PC-B2** T14's anchor named a `return` that does not exist in `check_platform`
(`:924-1031`, zero returns) and its literal reading would have shipped an inverted guard;
**PC-B3** T13's destination map cited a helper with zero uses in this script that disagrees with
the real one on Codex home resolution; **PC-B4** the Cursor-warning cite drifted `:673-677` →
`:800-808`; **PC-B5** `design.md:449`'s contract would have had T13 pass a third argument to a
two-parameter `writeConfig`, silently defeating T11's plan mode; **PC-B6** T25 declared
completion before the mandatory verification gate that writes `validation.md`, and its own
`check_specs_delivered.ts` gate cannot catch that because `validation.md` is in
`FEATURE_OPTIONAL` (`:47`).

The generalizable rule the pass found: **every stale cite lands in one of the two files Phases
1–5 rewrote** (`scripts/install-skills.sh`, `scripts/lib/opencode-config.cjs`); every cite into a
file those phases did not touch is still exact. Re-verify cites by file, not by artifact.

No done-when outcome was weakened by these amendments; each corrects an anchor, a citation, or
an ordering the workflow contract already required. Hand every `PC-*` bullet to the verifier as
a question.

---

## Project Testing Guidelines Scan

Sources read, with the rule each one contributes:

| Source | Rule taken |
| --- | --- |
| `CONTRIBUTING.md` Step 7 | Tests must discriminate — "if you changed one line of the component, would the test catch it?" |
| `CONTRIBUTING.md` Step 6 | Retiring a compatibility boundary asserts **both** directions: the new path works AND the old one has zero effect |
| `CONTRIBUTING.md` § CHANGELOG authoring | An entry under `[Unreleased]` picks the version; the CI merge gate fails a PR without one unless labelled |
| `CLAUDE.md` § Running tests | `packages/shared` and `apps/opencode-plugin` run plain `bun test`; `apps/mcp-client` runs `bun scripts/run-tests-isolated.ts` |
| `CLAUDE.md` § Running tests | `bunfig.toml` sets a 5 s per-test timeout; raise per-test with a third `test()` arg, never globally |
| `CLAUDE.md` § Running tests | `bun run test` does not reach `scripts/`; `bun run test:scripts` is a separate runner |
| `CLAUDE.md` § Agent-harness surface | `bun run test:plugins` is a **third** runner, wired into the CI build job only |
| `.github/workflows/coverage.yml` | 90%-per-file floor, blocking |
| `package.json:38` | `test:scripts` runs `bun test scripts/__tests__ scripts/tests/*.test.ts` then loops every `scripts/tests/*.sh` — a new `.sh` suite is auto-discovered |
| `scripts/tests/lib/installer-test-helpers.sh` | Shell suites source one helper: `assert_*`, `tree_fingerprint`, `make_mock_agents`, `summary` |

Guidelines were found, so the Coverage Expectation below conforms to them rather than to a default.

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `CONTRIBUTING.md`, `CLAUDE.md`, `.github/workflows/coverage.yml`, `package.json`, `scripts/tests/lib/installer-test-helpers.sh`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| `packages/shared` domain module (registry, state, render, engine, report, format) | unit | All branches; 1:1 to spec ACs; every listed edge case; ≥90% per file | `packages/shared/src/bootstrap/__tests__/*.test.ts` | `cd packages/shared && bun test src/bootstrap` |
| `packages/shared` config seam (strict read/write) | unit | Both directions per CONTRIBUTING Step 6: the strict path throws on malformed input AND the old permissive composition is not reachable from the toggle path | `packages/shared/src/config/__tests__/*.test.ts` | `cd packages/shared && bun test src/config` |
| Published CLI subcommand | unit | Dispatch, argument validation, unknown-id error, persistence, `--target`, `--dry-run` | `apps/<app>/src/__tests__/config-cli-bootstrap.test.ts` | `cd apps/mcp-client && bun scripts/run-tests-isolated.ts --filter='config-cli-bootstrap'` |
| Repo script (`scripts/*.ts`) | unit | All branches of the resolution ladder and the degrade-to-defaults path | `scripts/__tests__/*.test.ts` | `bun test scripts/__tests__/<file>` |
| Bash installer behaviour | shell suite | One scenario per acceptance criterion in BST-01..BST-05, plus the no-write proof against deliberate drift | `scripts/tests/test-*.sh` | `bash scripts/tests/<file>.sh` |
| Harness source content (`skills/**/*.md`) | contract | Guarded by a scripted source-contract assertion, never by review | `scripts/__tests__/*.test.ts` | `bun test scripts/__tests__/<file>` |
| Generated plugin bundles | contract | Byte-identity across all four hosts + `--check` drift detection | `scripts/__tests__/skill-artifact-parity.test.ts`, `apps/*-plugin/__tests__/` | `bun run test:scripts`, `bun run test:plugins` |

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After a task whose tests are a single unit or contract file | `bun test <the task's named test file>` |
| Full | After a task touching the installer, the generator, or a plugin bundle | `bun run test:scripts && bun run test:plugins` |
| Build | After phase completion | `bun run lint && bunx turbo run type-check --force && bun run build && bun run test:scripts && bun run test:plugins` |

**The artifact gate is `bun scripts/generate-skill-artifacts.ts --check`, never `bun run generate:artifacts --check`.** `package.json:31` is an `&&` chain, so the flag reaches only the second generator while the first runs in write mode and repairs the drift it should report. CI uses the direct form (`.github/workflows/ci.yml:238`).

**Baseline to beat, measured at `09e9a597` after `bun run build`:** `test:scripts` 1821 pass / 2 fail across 81 files. The two failures are `pyts golden: lessons > list --status all …` and `… list --query filter …`, and both reproduce at `origin/main` — they are pre-existing and out of scope. Any third failure is this feature's.

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Source contract, red first

T1 → T2

### Phase 2: Strict config seam and rule registry

T3 → T4

### Phase 3: State and renderer

T5 → T6

### Phase 4: Report and engine

T7 → T8

### Phase 5: Installer safety, red first

T9 → T10 → T11

### Phase 6: Render entry point and per-host delivery

T12 → T13

### Phase 7: Drift branch and harness build

T14 → T15

### Phase 8: Shared formatting and the two CLIs

T16 → T17 → T18

### Phase 9: Skill, generator, parity

T19 → T20 → T21

### Phase 10: Reference alignment

T22 → T23

### Phase 11: Changelog and close-out

T24 → T25

---

## Task Breakdown

### T1: Bootstrap source contract sensor

**Task ID**: TASK-001

**What**: A scripted assertion that `skills/AGENTS.md` carries exactly 9 well-formed rule marker pairs with the registry's ids, carries the `code-comments` off-span, and contains no occurrence of `rtk`.
**Where**: `scripts/__tests__/bootstrap-source-contract.test.ts`
**Depends on**: None
**Reuses**: `scripts/__tests__/skills-harness-integrity.test.ts:272-286` (locates the bootstrap markers in `skills/AGENTS.md` and asserts a key appears exactly once inside the block)
**Requirement**: BST-06, BST-09

**Tools**: MCP: NONE (server is down). Skill: NONE.

**Done when**:
- [ ] The suite reads the whole file, not line by line — the `rtk` and marker assertions must survive a claim spanning a newline
- [ ] **Observed RED before T2**, with the failure naming the missing marker ids, and that red output is quoted in the task report
- [ ] Test count recorded (no silent deletions)

**Tests**: contract
**Gate**: quick — `bun test scripts/__tests__/bootstrap-source-contract.test.ts`
**Commit**: `test(bootstrap): add the source contract sensor for the rule markers`

---

### T2: Mark up the bootstrap source, drop RTK, add the two new rules

**Task ID**: TASK-002

**What**: Wrap each of the 7 existing rules in `<!-- massa-ai:rule:<id>:start|end -->`, delete `### Conditional RTK Rules`, and add the `english-code` and `code-comments` sections including the `code-comments` off-span.
**Where**: `skills/AGENTS.md`
**Depends on**: T1
**Reuses**: the existing `<!-- massa-ai:bootstrap:start|end -->` marker convention (`scripts/install-skills.sh:74-75`)
**Requirement**: BST-06, BST-07, BST-08, BST-09

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] `Contract Ownership`, `Runtime Contract Pointer` and the `massa-ai` bullet of `Skill Summary` sit inside the `massa-ai-router` span (assumption A9)
- [ ] The `english-code` rule states that it does **not** change the language of conversational replies
- [ ] The `code-comments` off-span explicitly overrides `references/code-annotation.md` §1 and §2 and says nothing about §3
- [ ] T1 goes green, with its previously-red assertions named
- [ ] `bun test scripts/__tests__/skills-harness-integrity.test.ts` still passes

**Tests**: contract
**Gate**: quick — `bun test scripts/__tests__/bootstrap-source-contract.test.ts scripts/__tests__/skills-harness-integrity.test.ts`
**Commit**: `feat(bootstrap): mark the rule spans, drop RTK, add the english-code and code-comments rules`

---

### T3: Strict config read and write seam

**Task ID**: TASK-003

**What**: `readRawConfigStrict()` that throws a named parse error and returns the literal document, and `writeRawConfig(doc, {expectedBytes})` that performs the compare-and-swap write; both exported from the package barrel.
**Where**: `packages/shared/src/config/config-loader.ts`
**Depends on**: None
**Reuses**: `writeFileAtomically` (`packages/shared/src/config/config-loader.ts:247`), which is not exported from either barrel today
**Requirement**: BST-10

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] A malformed `config.json` makes `readRawConfigStrict` throw naming the file and the parse failure, and writes nothing
- [ ] The both-directions assertion per CONTRIBUTING Step 6: the strict read throws **and** a test proves the toggle path does not reach `loadConfig`'s defaults-on-parse-failure branch
- [ ] Compare-and-swap: a test mutates the file between read and write and asserts one re-apply, then a loud failure on a second race
- [ ] Unknown top-level keys survive a read-modify-write round trip
- [ ] `writeFileAtomically`, `readRawConfigStrict`, `writeRawConfig` are reachable from `@massa-ai/shared/config`
- [ ] Tests co-located at `packages/shared/src/config/__tests__/config-strict-io.test.ts`

**Tests**: unit
**Gate**: quick — `cd packages/shared && bun test src/config`
**Commit**: `feat(config): add a strict read and compare-and-swap write seam`

---

### T4: Rule registry

**Task ID**: TASK-004

**What**: `BOOTSTRAP_RULES` — 9 ids in fixed render order with defaults and descriptions — plus `UnknownRuleError(id, known)` and a validator that reports every violation in one throw.
**Where**: `packages/shared/src/bootstrap/rules.ts`
**Depends on**: None
**Reuses**: `SCHEDULER_JOB_KINDS` as-const id list (`packages/shared/src/config/massa-ai-config.ts:7-13`) for shape; `scripts/lib/model-profiles.ts:167-314` for the accumulate-then-throw idiom and `UnknownProfileError(name, known)` for the error shape — the module itself is unreachable from a published CLI
**Requirement**: BST-08, BST-09

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] Exactly 9 ids, asserted as a set, so adding or removing one reddens
- [ ] Every rule defaults enabled except `code-comments`, asserted per id rather than by count
- [ ] `UnknownRuleError` names the bad id and lists all 9 valid ones
- [ ] Both `enable` and `disable` accept every id — no protected id (BST-09 AC-3)
- [ ] Tests co-located at `packages/shared/src/bootstrap/__tests__/rules.test.ts`

**Tests**: unit
**Gate**: quick — `cd packages/shared && bun test src/bootstrap`
**Commit**: `feat(bootstrap): add the rule registry`

---

### T5: Rule state resolution and persistence

**Task ID**: TASK-005

**What**: `resolveBootstrapState()` merging persisted `bootstrap.rules` over registry defaults, and the writer that persists a single rule flip through the T3 seam.
**Where**: `packages/shared/src/bootstrap/state.ts`
**Depends on**: T3, T4
**Reuses**: `readRawConfigStrict` / `writeRawConfig` from T3
**Requirement**: BST-10

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] A persisted id absent from the registry lands in `ignoredStateKeys` and is reported once, never fatal (BST-10 AC-12)
- [ ] Only the `bootstrap` subtree is written; sibling keys are byte-identical after a flip
- [ ] An absent `config.json` is created holding the `bootstrap` key
- [ ] Tests co-located at `packages/shared/src/bootstrap/__tests__/state.test.ts`

**Tests**: unit
**Gate**: quick — `cd packages/shared && bun test src/bootstrap`
**Commit**: `feat(bootstrap): resolve and persist rule state`

---

### T6: Renderer

**Task ID**: TASK-006

**What**: `renderBootstrap({source, state, host, targetHome})` returning `{contract, pointer}` — disabled spans removed, off-text inserted, markers stripped, always-rendered header region emitted.
**Where**: `packages/shared/src/bootstrap/render.ts`
**Depends on**: T4, T5
**Reuses**: the marker convention from T2
**Requirement**: BST-01, BST-04, BST-06, BST-07, BST-08, BST-10

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] Determinism: the same state renders byte-identical output twice (BST-10 AC-7)
- [ ] `code-comments` disabled emits the negative directive; both toggle states leave the §3 tests sentence untouched (BST-08 AC-5, AC-6)
- [ ] `rtk` count is 0 in every toggle state (BST-06 AC-2)
- [ ] The all-off render still produces a body stating every rule is disabled **and** carries the always-rendered header with the recovery command and the state file path (BST-10 AC-9)
- [ ] The pointer template is at most 10 lines and carries no policy text (BST-04 AC-6, AC-7)
- [ ] Tests co-located at `packages/shared/src/bootstrap/__tests__/render.test.ts`

**Tests**: unit
**Gate**: quick — `cd packages/shared && bun test src/bootstrap`
**Commit**: `feat(bootstrap): render the contract from source and rule state`

---

### T7: Report types and exit-code predicate

**Task ID**: TASK-007

**What**: `BootstrapRenderResult` with the four-value status union including `written-not-wired`, `BootstrapReport`, and a `bootstrapReportSucceeded` predicate.
**Where**: `packages/shared/src/bootstrap/report.ts`
**Depends on**: T4
**Reuses**: the `{host, status, reason?}` convention and `restartRequired` derivation from `packages/shared/src/profile-switch/report.ts:29-44` — a sibling type, not a reuse of `HostSwitchResult`, whose union carries a variant-availability concept and a required `profile` field
**Requirement**: BST-10, BST-11

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] `written-not-wired` is a distinct status that the predicate does not treat as a clean success
- [ ] `restartRequired` is true only for a non-dry-run with at least one written row
- [ ] Tests co-located at `packages/shared/src/bootstrap/__tests__/report.test.ts`

**Tests**: unit
**Gate**: quick — `cd packages/shared && bun test src/bootstrap`
**Commit**: `feat(bootstrap): add the per-host report types`

---

### T8: Apply engine with the wiring probe

**Task ID**: TASK-008

**What**: `applyBootstrapState({targetHome, dryRun})` — iterate every host recorded in `install-state.json`, render, write, probe the wiring artifact, and return the report.
**Where**: `packages/shared/src/bootstrap/engine.ts`
**Depends on**: T5, T6, T7
**Reuses**: `readInstallState` (`packages/shared/src/profile-switch/state.ts:105`), `HOSTS`/`isHost` (`hosts.ts:16-21`), and the fixed-order per-host loop shape from `profile-switch/engine.ts:445-506`. **Not** `resolveHostLayout` — it returns `route: "skip"` for cursor unconditionally (`hosts.ts:89-90`), and Cursor is a first-class target here
**Requirement**: BST-10, BST-11

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] `targetHome` is threaded to both the install-state path and the config path; nothing resolves the real home internally
- [ ] A host whose contract was written but whose wiring artifact is absent reports `written-not-wired` and names `scripts/install-skills.sh --apply` (BST-10 AC-10a)
- [ ] No host recorded → empty report, exit 0, "no host installed" (BST-11 AC-6)
- [ ] `dryRun` writes nothing, proven by a fingerprint over the scratch home
- [ ] Rows are emitted in registry host order, so the report is deterministic
- [ ] Tests co-located at `packages/shared/src/bootstrap/__tests__/engine.test.ts`

**Tests**: unit
**Gate**: quick — `cd packages/shared && bun test src/bootstrap`
**Commit**: `feat(bootstrap): apply rule state across every installed host`

---

### T9: Installer delivery shell suite, red first

**Task ID**: TASK-009

**What**: A scratch-home shell suite asserting the per-host delivery shape, the byte-identical uninstall round trip, the unlink-not-empty rule, and that `--check`/`--dry-run` write nothing against deliberate OpenCode drift.
**Where**: `scripts/tests/test-install-skills-bootstrap-file.sh`
**Depends on**: None
**Reuses**: `scripts/tests/lib/installer-test-helpers.sh` (`tree_fingerprint`, `make_mock_agents`, `assert_*`, `summary`); `test-install-skills-check.sh:32-45` for the fingerprint-around-`--check` shape; `test-install-skills-state.sh:26-37` `state_json` verbatim for reading the OpenCode `instructions` array
**Requirement**: BST-01, BST-02, BST-03, BST-04, BST-05, BST-12

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] The runner function is named `run_check`, never `check` — `test-install-skills-check.sh:33` shadows the helper's assertion function with an installer runner, and repeating that name here would silently invoke the installer instead of asserting
- [ ] Round-trip fixture includes a file with **leading and trailing blank lines** and a host directory that did not exist pre-install
- [ ] The fingerprint excludes `*.massa-ai.bak-*` and nothing else — the list frozen in `design.md`
- [ ] A scenario seeds `install-state.json` with a host that has no wiring artifact
- [ ] **Observed RED before T10/T11**, and the red output is quoted in the task report naming which assertions fail and why
- [ ] Auto-discovered by `package.json:38`'s `for f in scripts/tests/*.sh` loop; the helper stays under `lib/`

**Tests**: shell suite
**Gate**: quick — `bash scripts/tests/test-install-skills-bootstrap-file.sh`
**Commit**: `test(installer): add the bootstrap delivery and no-write suite`

---

### T10: Make the marker engine byte-preserving, deletable, symlink-safe and atomic

**Task ID**: TASK-010

**What**: `bootstrap_op` takes the block body as a third argument, preserves surrounding bytes exactly, gains a delete mode, refuses write-through on an unowned symlink, and writes through a temp file plus rename.
**Where**: `scripts/install-skills.sh`
**Depends on**: T9
**Reuses**: the existing four-mode contract and duplicate-marker abort (`scripts/install-skills.sh:460-530`); `installer_backup_file` (`scripts/lib/installer-shared.sh:56`), which has **zero production call sites** today — this is a new call site to write, not an existing one to reuse
**Requirement**: BST-01, BST-02, BST-05

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] `removeBlock`'s `.trim()` (`:496`) and the append path's `.trimEnd()` (`:486`) no longer alter surrounding text
- [ ] A removal that empties a whole-file artifact, or an installer-created wiring file, unlinks it instead of writing `""` (BST-05 AC-9a, AC-9b)
- [ ] Write-through is refused on any symlink whose resolved target is not already recorded as massa-ai-owned; the check lives **inside** `bootstrap_op`, not in the caller
- [ ] `is_owned_target`'s "a symlink is always ours to replace" comment (`:549-557`) is reconciled or scoped in the same change, so two contradictory symlink policies do not ship in one file
- [ ] Writes go through temp file plus rename, so an interrupted write cannot leave a start marker with no end marker
- [ ] `installer_backup_file` is called before any `MASSA-AI.md` overwrite where the content differs
- [ ] The T9 assertions covering these behaviours turn green, named individually

**Tests**: shell suite
**Gate**: full — `bun run test:scripts && bun run test:plugins`
**Commit**: `fix(installer): make the managed-block engine byte-preserving, deletable and symlink-safe`

---

### T11: Give the OpenCode config writer a real plan mode

**Task ID**: TASK-011

**What**: A four-mode contract on the OpenCode config write — `plan`, `apply`, `remove-plan`, `remove-apply` — with no filesystem contact in either plan mode, plus idempotent `instructions` add and remove.
**Where**: `scripts/lib/opencode-config.cjs`
**Depends on**: T9
**Reuses**: `resolveConfigPath` / `parseJsonc` (`:26`, `:59`) unchanged; the array push-if-absent and filter-then-delete-when-empty shape from `apps/opencode-plugin/install.sh:554-575` and `:488-495`
**Requirement**: BST-03, BST-05

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] `plan` and `remove-plan` touch the filesystem not at all — not a compare-then-skip guard, which writes in exactly the drift state `--check` exists to find
- [ ] Re-running `apply` adds no duplicate `instructions` entry and creates no second backup
- [ ] An unparseable config throws the existing named error; the caller records it and returns, never `exit`, so sibling hosts still run (BST-03 AC-11)
- [ ] Uninstall removes the exact absolute path and deletes the array when it empties; the orphan-entry limitation is stated in the uninstall report
- [ ] The vendored `apps/opencode-plugin/lib/opencode-config.cjs` mirror stays byte-identical — `bun scripts/generate-skill-artifacts.ts --check` passes
- [ ] The T9 no-write-against-drift assertion turns green

**Tests**: shell suite
**Gate**: full — `bun run test:scripts && bun run test:plugins`
**Commit**: `fix(opencode-config): add a real plan mode and idempotent instructions editing`

---

### T12: Render entry point for the installer

**Task ID**: TASK-012

**What**: A bun entry point that resolves rule state, renders per host, and degrades to registry defaults with a named warning when the state cannot be read.
**Where**: `scripts/render-bootstrap.ts`, `packages/shared/src/bootstrap/index.ts`, `packages/shared/src/index.ts`
**Depends on**: T6, T8
**Reuses**: `renderBootstrap` and `resolveBootstrapState` from `packages/shared/src/bootstrap/`
**Requirement**: BST-01, BST-10

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [x] The ladder is keyed on `command -v bun`, never on `installer_detect_runner` — that helper returns `node` first (`scripts/lib/installer-shared.sh:25-33`) and node is always present here as the node-gyp helper, so a `$RUNNER`-keyed ladder would take the bun branch on no machine
- [x] An unreadable `config.json` renders defaults, emits a warning naming the file and the parse error, and writes nothing to `config.json` (BST-10 AC-10b)
- [x] Neither bun nor a build reachable → a named error quoting `bun run build`, never a default render
- [x] Tests at `scripts/__tests__/render-bootstrap.test.ts` cover all three ladder branches and the degrade path
- [x] **PC-B1 — the module is exported before its first consumer.** `packages/shared/src/bootstrap/index.ts` does not exist and `packages/shared/src/index.ts` names no bootstrap symbol; `packages/shared/package.json:11-28` closes `exports` to `.`, `./types`, `./utils`, `./config`, so a `@massa-ai/shared/bootstrap` deep specifier is blocked too. Measured: `dist/index.js` holds 0 occurrences of `bootstrap`. Add the barrel `design.md:142` already names, and re-export it from the root `index.ts` the way `profile-switch/` is exported (root re-export, **no** new subpath — that is the in-repo precedent and what T17/T18 will import). Every existing bootstrap suite imports relatively (`../engine`, `../render`, …) and the shell suite imports the absolute *source* path, which is why `packages/shared` 815/0 and the 42/35 shell suite both pass with the export surface entirely absent
- [x] **PC-Q2 — the parse warning reaches a channel a caller can surface.** T8 added `onWarning?` to `applyBootstrapState` (log `:22`); the design had no warnings channel. Route AC-10b's warning through it, not a bare stderr write — T16's formatter and T17's CLI can only surface what the callback carries

**Tests**: unit
**Gate**: quick — `bun test scripts/__tests__/render-bootstrap.test.ts`
**Commit**: `feat(installer): add the bootstrap render entry point`

---

### T13: Per-host delivery, migration and uninstall

**Task ID**: TASK-013

**What**: Rewrite `apply_platform` and `uninstall_platform` to write `MASSA-AI.md` plus each host's own load wiring, migrate the old block out of `AGENTS.md`, and reverse all of it on uninstall.
**Where**: `scripts/install-skills.sh`
**Depends on**: T10, T11, T12
**Reuses**: `platform_root` (`scripts/install-skills.sh:147-154`) as the destination map — see PC-B3; the foreign-conflict per-host abort shape (`scripts/install-skills.sh:571-579`)
**Requirement**: BST-01, BST-02, BST-03, BST-04, BST-05

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] Claude gets a managed block holding `@MASSA-AI.md` in `~/.claude/CLAUDE.md`, created when absent, with all content outside the markers byte-identical (BST-02)
- [ ] OpenCode gets the absolute path in `instructions`; Codex and Cursor get the pointer block (BST-03, BST-04)
- [ ] Migration leaves no bootstrap marker pair holding policy text in `AGENTS.md` on claude or opencode (BST-05 AC-8)
- [ ] The Cursor warning is reworded to name `MASSA-AI.md` — it is at `scripts/install-skills.sh:800-808` (comment `:800-804`, the three `warn` lines `:806-808`), **not** the `:673-677` this task and `design.md:211` originally cited; that span drifted across the Phase 1–5 commits and now sits between `skill_marker_path` (`:661`) and `is_owned_target` (`:681`). Locate it by content, never by the old line number (PC-B4)
- [ ] Every remaining T9 assertion turns green, and the full suite shows no third failure beyond the two documented pre-existing ones

**Amendments after the Phase 6 Plan Challenge** (anchors only — no done-when outcome is weakened):

- **PC-B3 — the destination map is `platform_root`, not `installer_host_config_dir`.** `git grep -c installer_host_config_dir -- scripts/install-skills.sh` returns **zero uses**; this script has always had its own map. The two disagree on Codex: `installer-shared.sh:195` hardcodes a home-relative `.codex`, while `platform_root` (`:150`) returns the absolute `$CODEX_HOME` resolved at `:139-145`, which prefers `~/.codex` but falls back to `~/.config/codex`. Following the original cite writes `MASSA-AI.md` to `~/.codex/` on a `~/.config/codex` machine — a silently unwired host, exactly the `written-not-wired` class this feature exists to detect.
- **PC-B5 — wire OpenCode's `instructions` through `instructionsOp`, never `writeConfig`.** `design.md:449` describes `writeConfig` itself gaining the four-mode contract. T11 could not implement that literally (log `:23`) and layered it instead: `instructionsOp(mode, targetPath, cfg, entry)` at `scripts/lib/opencode-config.cjs:268`. `writeConfig` at `:174` still takes exactly `(targetPath, cfg)` — a third `mode` argument is silently ignored by JS and the config is written unconditionally, defeating T11's plan mode with every gate green.

**Tests**: shell suite
**Gate**: full — `bun run test:scripts && bun run test:plugins`
**Commit**: `feat(installer): deliver MASSA-AI.md and per-host load wiring`

---

### T14: Bootstrap drift branch in `--check`

**Task ID**: TASK-014

**What**: A drift branch in `check_platform` covering `MASSA-AI.md` and each host's wiring artifact.
**Where**: `scripts/install-skills.sh`
**Depends on**: T13
**Reuses**: the existing drift-record conventions in `check_platform` (`:924-1031`)
**Requirement**: BST-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] **Observed RED first** by mutating a written `MASSA-AI.md` in the scratch home and confirming the branch reports drift — `check_platform` contains zero references to `bootstrap_op` today, so BST-01 AC-10 would otherwise pass vacuously
- [ ] **PC-B2 — placed INSIDE the plugin-owned guard, before its `fi`, not after it.** The original wording ("after the plugin-owned early return (`:792-803`)") is wrong twice and its literal reading inverts the intent. `check_platform` is `scripts/install-skills.sh:924-1031` and contains **zero `return` statements**; `:792-803` is inside `apply_platform`, a different function. The plugin-owned guard is a wrapping conditional, `if [ "$owner" != "plugin" ]; then … fi` at `:935-987`. "After the early return" therefore resolves to "after the `fi` at `:987`", which runs the bootstrap drift check **for plugin-owned platforms** — the opposite of what `design.md:255-258` states. Place the branch before `:987`, so the plugin-owned case stays covered by the engine's wiring probe as designed
- [ ] `--check` still writes nothing, proven by the T9 fingerprint assertion
- [ ] Exit 0 after a clean `--apply` with no source change (BST-01 AC-10)

**Tests**: shell suite
**Gate**: full — `bun run test:scripts && bun run test:plugins`
**Commit**: `feat(installer): report bootstrap drift in --check`

---

### T15: Build step in the harness installer

**Task ID**: TASK-015

**What**: Add the `bun run build` step so the render ladder's dist branch is reachable from a fresh clone driven through the harness installer.
**Where**: `scripts/install-harness.sh`
**Depends on**: T12
**Reuses**: the equivalent step at `install.sh:1026`
**Requirement**: BST-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] A fresh clone with no build reaches a successful render, or fails with the named `bun run build` message — never a default render
- [ ] The step is skipped when `bun` is absent, matching the ladder's own branch order
- [ ] Covered by a scenario in `scripts/tests/test-install-skills-bootstrap-file.sh`

**Tests**: shell suite
**Gate**: full — `bun run test:scripts && bun run test:plugins`
**Commit**: `fix(installer): build before rendering the bootstrap contract`

---

### T16: Shared CLI formatters

**Task ID**: TASK-016

**What**: `formatBootstrapInventory` and `formatBootstrapReport`, so both CLIs call one implementation instead of duplicating ~106 lines each.
**Where**: `packages/shared/src/bootstrap/format.ts`
**Depends on**: T7
**Reuses**: the output conventions of `formatProfileInventory` / `formatSwitchReport`, which are byte-identical across the two CLIs today and are exactly the duplication this task refuses to repeat
**Requirement**: BST-11

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] `list` output names every rule id, its default, its current state, and a one-line description (BST-11 AC-3)
- [ ] The report formatter renders `written-not-wired` distinctly and prints the restart notice when required (BST-11 AC-5)
- [ ] **PC-Q2 — all four statuses are rendered, not two.** `BootstrapRenderResult.status` is `written | written-not-wired | skipped | failed` (`design.md:331`), and T7 gave `skipped` a definition the design lacked: a byte-identical re-apply whose wiring is present (log `:22`). The original done-when named only `written-not-wired`, leaving `skipped` and `failed`-with-reason unspecified for the formatter. Cover every arm, and render `failed`'s and `skipped`'s `reason` — BST-10 AC-10 requires each host's outcome to be reported with its reason
- [ ] Tests co-located at `packages/shared/src/bootstrap/__tests__/format.test.ts`

**Tests**: unit
**Gate**: quick — `cd packages/shared && bun test src/bootstrap`
**Commit**: `feat(bootstrap): add shared CLI formatters`

---

### T17: `bootstrap` subcommand in the mcp-client CLI

**Task ID**: TASK-017

**What**: `massa-ai-config bootstrap list|show|enable <id>|disable <id>` with `--target` and `--dry-run`.
**Where**: `apps/mcp-client/src/config-cli.ts`
**Depends on**: T8, T16
**Reuses**: the `case "profile"` dispatch shape at `:300-350` and `parseOptions` at `:87`; `reportSucceeded`'s exit-code role at `:341`
**Requirement**: BST-11

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] An unknown rule id exits non-zero, names the id, lists the nine valid ones, and changes no state (BST-09 AC-8)
- [ ] The command works with the massa-ai MCP server unreachable (BST-11 AC-4) — asserted, since this is the recovery path when `massa-ai-router` is disabled
- [ ] `--target` is honoured so the suite never writes the developer's real home. **PC-Q2 — derive the state path the way T8 did**, `path.dirname(bootstrapStateFilePath(targetHome))`: `design.md:455` cites a `defaultStatePath` in `state.ts` that does not exist there — it is private and duplicated at `profile-switch/engine.ts:60` and `variant-sync.ts:70`, exported from neither (log `:22`). T18 inherits the same correction
- [ ] Help text and examples list the new subcommand
- [ ] Tests at `apps/mcp-client/src/__tests__/config-cli-bootstrap.test.ts`, following the `config-cli-profile.test.ts` seam order: pre-resolve `require("@massa-ai/shared")` before `mock.module`, then `await import("../config-cli.js")`

**Tests**: unit
**Gate**: quick — `cd apps/mcp-client && bun scripts/run-tests-isolated.ts --filter='config-cli-bootstrap'`
**Commit**: `feat(cli): add the bootstrap subcommand to massa-ai-config`

---

### T18: `bootstrap` subcommand in the opencode-plugin CLI

**Task ID**: TASK-018

**What**: The same subcommand in the twin CLI, calling the same engine and the same formatters.
**Where**: `apps/opencode-plugin/src/config-cli.ts`
**Depends on**: T17
**Reuses**: T16's formatters and T8's engine; the `case "profile"` block at `:337-387`, which differs from its twin by exactly one line (`__dirname` versus `import.meta.dirname`)
**Requirement**: BST-11

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] Behaviour is identical to T17 except the documented `__dirname` difference
- [ ] Tests at `apps/opencode-plugin/src/__tests__/config-cli-bootstrap.test.ts`
- [ ] `cd apps/opencode-plugin && bun test` passes

**Tests**: unit
**Gate**: quick — `cd apps/opencode-plugin && bun test src/__tests__/config-cli-bootstrap.test.ts`
**Commit**: `feat(cli): add the bootstrap subcommand to the opencode config CLI`

---

### T19: Cross-CLI parity guard for the subcommand

**Task ID**: TASK-019

**What**: Extend the existing parity guard so a `bootstrap` behaviour that diverges between the two CLIs reddens.
**Where**: `scripts/__tests__/profile-cli-parity.test.ts`
**Depends on**: T18
**Reuses**: its own `test.each(CLIS)` shape
**Requirement**: BST-11, BST-12

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] The guard reaches persistence, not only `--help` text and argument validation — the existing suite would not catch an `enable` that persists in one CLI and not the other
- [ ] Observed red by deliberately diverging one CLI, then reverted
- [ ] Test count recorded

**Tests**: unit
**Gate**: quick — `bun test scripts/__tests__/profile-cli-parity.test.ts`
**Commit**: `test(cli): extend the parity guard to the bootstrap subcommand`

---

### T20: The `bootstrap` skill

**Task ID**: TASK-020

**What**: A skill charter driving the one toggle engine and relaying its per-host report.
**Where**: `skills/bootstrap/SKILL.md`
**Depends on**: T17
**Reuses**: `skills/profile/SKILL.md` as the template — its Mission, "Relaying The Result" and Restrictions sections
**Requirement**: BST-11

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] It names the CLI as its only front. `skills/profile/SKILL.md:23`'s "prefer MCP when connected" clause is **not** copied — no `bootstrap_*` MCP tool exists, and BST-11.5 requires the surface to work with MCP unreachable
- [ ] It relays `written-not-wired` verbatim in substance, with the `--apply` remedy
- [ ] It states the host restart requirement and never claims a toggle is live before it
- [ ] A scripted assertion forbids an MCP-tool reference in this file, and asserts its documented rule-id list equals the registry's nine (BST-12 AC-4)
- [ ] `skills.yml` frontmatter validation passes
- [ ] `scripts/install-skills.sh` picks it up with no installer edit (discovery is dynamic at `:200-206`) — asserted in the shell suite

**Tests**: contract
**Gate**: full — `bun run test:scripts && bun run test:plugins`
**Commit**: `feat(skills): add the bootstrap toggle skill`

---

### T21: Ship the skill to all four plugin bundles

**Task ID**: TASK-021

**What**: Register `skills/bootstrap/` in both hardcoded generator lists and add the gitignore entries.
**Where**: `scripts/generate-skill-artifacts.ts`
**Depends on**: T20
**Reuses**: the existing `"profile"` entries at `:138` (emit loop) and `:216-222` (`managedRootsFor`)
**Requirement**: BST-12

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] **Both** lists are edited. `:138` alone makes emit work while `--check` never inspects the subtree and prune leaves stale files forever
- [ ] `.gitignore` gains the root-precise entry beside the `profile` one at `:79-82` (AD-016)
- [ ] `scripts/__tests__/skill-artifact-parity.test.ts` and `generated-bundles-contract.test.ts` gain their per-bundle cases
- [ ] Observed red: touch a file in the emitted bundle and confirm `bun scripts/generate-skill-artifacts.ts --check` exits non-zero — **not** `bun run generate:artifacts --check`, which cannot fail
- [ ] `bun run test:plugins` passes; it is a separate runner a `test:scripts`-only gate would miss

**Tests**: contract
**Gate**: full — `bun run test:scripts && bun run test:plugins && bun scripts/generate-skill-artifacts.ts --check`
**Commit**: `feat(build): ship the bootstrap skill to all four plugin bundles`

---

### T22: Gate the annotation reference on the toggle

**Task ID**: TASK-022

**What**: State that §1 and §2 apply only while `code-comments` is enabled, and that §3 applies unconditionally.
**Where**: `skills/massa-ai/references/code-annotation.md`
**Depends on**: T2
**Reuses**: the reference's existing section structure
**Requirement**: BST-08

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] The gating sentence names the rule id and the default (off)
- [ ] §3 is explicitly excluded from the gate
- [ ] A scripted assertion in the source-contract suite covers both statements, so the wording cannot drift out
- [ ] Regenerated bundles stay in sync — `bun scripts/generate-skill-artifacts.ts --check` passes

**Tests**: contract
**Gate**: full — `bun run test:scripts && bun run test:plugins`
**Commit**: `docs(references): gate doc blocks and rationale comments on the code-comments rule`

---

### T23: Point the naming reference at the wider English rule

**Task ID**: TASK-023

**What**: Have §Language cite the `english-code` rule as the wider contract instead of restating it.
**Where**: `skills/massa-ai/references/naming-standards.md`
**Depends on**: T2
**Reuses**: the existing §Language section (`:31-39`)
**Requirement**: BST-07

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] §Language stays normative for identifier naming and cites the bootstrap rule for the wider class, per AD-019's one-normative-reference discipline
- [ ] No sentence is duplicated between the two
- [ ] Covered by the source-contract assertion

**Tests**: contract
**Gate**: full — `bun run test:scripts && bun run test:plugins`
**Commit**: `docs(references): cite the english-code rule from naming standards`

---

### T24: CHANGELOG entry

**Task ID**: TASK-024

**What**: An `[Unreleased]` entry describing the delivery change and the two behaviour changes.
**Where**: `CHANGELOG.md`
**Depends on**: T13, T21
**Reuses**: the Keep a Changelog headings already in the file
**Requirement**: BST-12

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] Filed under `### Changed` and `### Added`, so the release derives a minor bump
- [ ] Names the Claude fix explicitly — the contract has never loaded on Claude
- [ ] Names the `code-comments` default-off behaviour change
- [ ] The skip-ci marker is never written literally anywhere in the entry, the commit body, or the PR body

**Tests**: none — the coverage matrix assigns no test type to a changelog entry; the CI merge gate is the sensor
**Gate**: build
**Commit**: `docs(changelog): record the bootstrap file and rule toggles`

---

### T25: Close out the spec artifacts

**Task ID**: TASK-025

**What**: Update and commit `STATE.md`, `HANDOFF.md` and `FEATURES.json` on the branch before any push.
**Where**: `.specs/project/STATE.md`
**Depends on**: T24
**Reuses**: the existing STATE Current/Previous rotation and the `HANDOFF.md` rotation contract
**Requirement**: BST-12

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] `HANDOFF.md` is **rotated**, not replaced: rename the current section to Previous first, then prepend, then assert the section count grew. Note the current `HANDOFF.md` body is still `installer-prune-and-test-scoping` (2026-08-17) — this feature has never appeared in it
- [ ] `FEATURES.json` records the feature complete with all four phases true. **PC-A1 — three of those fields have been wrong for the feature's whole life**: `:1454-1457` still reads `design: false, tasks: false, execute: false` while both artifacts are written and 13 commits have landed
- [ ] `.specs/project/STATE.md` gains this feature's entry — it currently has **zero** occurrences of the slug across 4320 lines, so the feature is invisible to a resume that reads state from `.specs/` as the workflow requires
- [ ] `bun skills/massa-ai/scripts/check_specs_delivered.ts bootstrap-file-and-rule-toggles --root .` exits 0
- [ ] **PC-B6 — the order is T24 → independent verification → T25, and this task commits `validation.md` with the rest.** The original "No commit lands between this one and PR creation" contradicted the workflow's own mandatory final gate: `workflows/spec-driven.md:117` has the verification-agent always run automatically at the end of Execute and write `.specs/features/<slug>/validation.md`, i.e. after T24. T25 must therefore land last, carrying that report. `FEATURES.json:1465` already declares a `validation.md` path for a file that does not exist, and **T25's own gate cannot catch it** — `check_specs_delivered.ts:47` lists `validation.md` in `FEATURE_OPTIONAL`, so the gate exits 0 with the file absent. Verify the file exists by reading it, not by the gate's exit code
- [ ] No commit lands between this one and PR creation. Any fix task the verifier's ranked gaps produce lands **before** T25, and T25 is then re-run

**Tests**: none — the coverage matrix assigns no test type to spec artifacts; `check_specs_delivered.ts` is the sensor
**Gate**: build
**Commit**: `docs(specs): close out bootstrap-file-and-rule-toggles`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 10 → Phase 11

Phase 1:   T1 ──→ T2
Phase 2:   T3 ──→ T4
Phase 3:   T5 ──→ T6
Phase 4:   T7 ──→ T8
Phase 5:   T9 ──→ T10 ──→ T11
Phase 6:   T12 ──→ T13
Phase 7:   T14 ──→ T15
Phase 8:   T16 ──→ T17 ──→ T18
Phase 9:   T19 ──→ T20 ──→ T21
Phase 10:  T22 ──→ T23
Phase 11:  T24 ──→ T25
```

Execution is strictly sequential — there is no intra-phase parallelism.

**Ordering rationale.** Phase 1 and Phase 5 lead with a sensor that must be observed red. Writing the renderer and the engine before the installer's byte-preservation, delete mode and drift branch is the ordering that leaves a working-looking wrong state: the shell suite would pass against a scratch home with fresh directories, mocked binaries and pre-trimmed fixtures, the toggle would demo correctly, and the 0-byte `MASSA-AI.md` and the unwired-host defects would ship undetected.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 test file | ✅ Granular |
| T2 | 1 source file | ✅ Granular |
| T3 | 1 module + its barrel export | ✅ Granular |
| T4 | 1 module | ✅ Granular |
| T5 | 1 module | ✅ Granular |
| T6 | 1 module | ✅ Granular |
| T7 | 1 module | ✅ Granular |
| T8 | 1 module | ✅ Granular |
| T9 | 1 shell suite | ✅ Granular |
| T10 | 1 function in 1 file | ✅ Granular |
| T11 | 1 module | ✅ Granular |
| T12 | 1 script | ✅ Granular |
| T13 | 2 functions in 1 file, one concern | ✅ Granular |
| T14 | 1 function in 1 file | ✅ Granular |
| T15 | 1 step in 1 file | ✅ Granular |
| T16 | 1 module | ✅ Granular |
| T17 | 1 subcommand in 1 file | ✅ Granular |
| T18 | 1 subcommand in 1 file | ✅ Granular |
| T19 | 1 test file | ✅ Granular |
| T20 | 1 charter | ✅ Granular |
| T21 | 2 list entries in 1 file + gitignore | ✅ Granular |
| T22 | 1 reference | ✅ Granular |
| T23 | 1 reference | ✅ Granular |
| T24 | 1 file | ✅ Granular |
| T25 | 1 close-out | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | phase head | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | None | phase head | ✅ Match |
| T4 | None | T3 → T4 (order, not dependency) | ✅ Match — sequential within phase |
| T5 | T3, T4 | prior phases | ✅ Match |
| T6 | T4, T5 | T5 → T6 | ✅ Match |
| T7 | T4 | prior phase | ✅ Match |
| T8 | T5, T6, T7 | T7 → T8 | ✅ Match |
| T9 | None | phase head | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T9 | T10 → T11 (order) | ✅ Match |
| T12 | T6, T8 | prior phases | ✅ Match |
| T13 | T10, T11, T12 | T12 → T13 | ✅ Match |
| T14 | T13 | prior phase | ✅ Match |
| T15 | T12 | prior phase | ✅ Match |
| T16 | T7 | prior phase | ✅ Match |
| T17 | T8, T16 | T16 → T17 | ✅ Match |
| T18 | T17 | T17 → T18 | ✅ Match |
| T19 | T18 | prior phase | ✅ Match |
| T20 | T17 | prior phase | ✅ Match |
| T21 | T20 | T20 → T21 | ✅ Match |
| T22 | T2 | prior phase | ✅ Match |
| T23 | T2 | prior phase | ✅ Match |
| T24 | T13, T21 | prior phases | ✅ Match |
| T25 | T24 | T24 → T25 | ✅ Match |

No dependency points forward into a later phase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Repo script (test) | unit/contract | contract | ✅ OK |
| T2 | Harness source content | contract | contract | ✅ OK |
| T3 | shared config seam | unit | unit | ✅ OK |
| T4 | shared domain module | unit | unit | ✅ OK |
| T5 | shared domain module | unit | unit | ✅ OK |
| T6 | shared domain module | unit | unit | ✅ OK |
| T7 | shared domain module | unit | unit | ✅ OK |
| T8 | shared domain module | unit | unit | ✅ OK |
| T9 | Bash installer behaviour | shell suite | shell suite | ✅ OK |
| T10 | Bash installer behaviour | shell suite | shell suite | ✅ OK |
| T11 | Bash installer behaviour | shell suite | shell suite | ✅ OK |
| T12 | Repo script | unit | unit | ✅ OK |
| T13 | Bash installer behaviour | shell suite | shell suite | ✅ OK |
| T14 | Bash installer behaviour | shell suite | shell suite | ✅ OK |
| T15 | Bash installer behaviour | shell suite | shell suite | ✅ OK |
| T16 | shared domain module | unit | unit | ✅ OK |
| T17 | Published CLI subcommand | unit | unit | ✅ OK |
| T18 | Published CLI subcommand | unit | unit | ✅ OK |
| T19 | Repo script (test) | unit | unit | ✅ OK |
| T20 | Harness source content | contract | contract | ✅ OK |
| T21 | Generated plugin bundles | contract | contract | ✅ OK |
| T22 | Harness source content | contract | contract | ✅ OK |
| T23 | Harness source content | contract | contract | ✅ OK |
| T24 | Changelog | none | none | ✅ OK |
| T25 | Spec artifacts | none | none | ✅ OK |

`Tests: none` appears only where the matrix assigns no test type, and each such row names its non-test sensor.

---

## Artifact-Store Evidence

- **Active artifact key:** `.specs/features/bootstrap-file-and-rule-toggles/tasks.md`
- **Version:** 1 (initial write)
- **Checksum:** recorded in the Tasks completion report after write (`shasum -a 256`).
