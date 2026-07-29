# Plugin Auto-Install Tasks

**Design**: `.specs/features/plugin-auto-install/design.md`
**Status**: Approved 2026-07-29 (post–Plan Challenge)

## Execution Protocol (MANDATORY — do not skip)

Implement these tasks with the `massa-ai` skill: follow its Execute flow and
Critical Rules (tests derive from spec ACs; gate passes before task done; one
atomic commit per task; fresh verification-agent after the last task).

This change touches the managed harness surface (installers) —
`CONTRIBUTING.md`'s 7-step managed-harness protocol applies to every task:
contract → register → preserve argv → read-only export → deliver-before-ack →
invariants → discriminating tests.

---

## Project Testing Guidelines Scan

Guidelines found: `CLAUDE.md` (Commands / Running tests / CI gates),
`CONTRIBUTING.md` (managed-harness protocol, CHANGELOG authoring),
`AGENTS.md` (test runner, gates). Conventions sampled:

- Bash installer suites: `scripts/tests/test-*.sh`, sourced harness
  `scripts/tests/lib/installer-test-helpers.sh` (assert helpers, scratch root
  with EXIT cleanup, **mock agent binaries for deterministic PATH detection**).
- TS root suites: `scripts/__tests__/*.test.ts`, run by `bun run test:scripts`
  together with every `scripts/tests/*.sh` (package.json:33).
- Plugin suites: `apps/<host>-plugin/__tests__/`, run by `bun run test:plugins`
  (package.json:34) — the single runner; plugin package.json files declare no
  `test` script on purpose.
- Menu strings in `install.sh` are grep-pinned by
  `scripts/__tests__/root-install-menu.test.ts` — additive only, never reworded.

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirmed at task approval.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Bash helpers + harness gate (domain logic: detection, version gate, decisions) | shell integration | All branches 1:1 to spec ACs 1–13; detection matrix (dir-only/binary-only/both/neither); every listed edge case | `scripts/tests/test-plugin-auto-install.sh` | `bun run test:scripts` |
| State-file extension (v2 compat, TSV round-trip, version compare, ×4-host parity) | TS integration (drives real scripts) | PAI-06 round-trip; corrupt/missing tolerant read; compare table (equal/older/newer/empty/non-numeric); record shape identical ×4 hosts | `scripts/__tests__/install-state-plugin-version.test.ts` | `bun run test:scripts` |
| Plugin installer bundles (record/preserve/uninstall) | shell integration (real installers, scratch HOME) + existing plugin suites | PAI-03 record after real install; PAI-07 uninstall delete; existing `__tests__` green unchanged | `scripts/tests/test-plugin-auto-install.sh`; `apps/*-plugin/__tests__/` | `bun run test:scripts` + `bun run test:plugins` |
| Docs / CHANGELOG | none (artifact check) | CHANGELOG `[Unreleased] ### Added` entry; README/CLAUDE.md behavior paragraphs | — | CI changelog gate (diff present) |

## Gate Check Commands

> Generated from codebase — confirmed at task approval.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | after T1, T2 | `bash scripts/tests/test-plugin-auto-install.sh 2>/dev/null || true` (suite may not exist before T3 — T1 quick = `bash -n scripts/lib/installer-shared.sh` + focused helper assertions inline); T2 quick = `bun test scripts/__tests__/install-state-plugin-version.test.ts` |
| Full | after T3, T4 | `bun run test:scripts` |
| Build | after T5, T6 (phase completion) | `bun run lint && bun run type-check && bun run test:scripts && bun run test:plugins` |

---

## Execution Plan

### Phase 1: Foundation (helpers + state compat)

T1 → T2 (independent of each other; both precede T3)

### Phase 2: Gate + recorders

T3 → T4

### Phase 3: Docs + aggregate

T5 → T6

6 tasks ≤ 8 → single batch, inline execution, no sub-agent offer.

---

## Task Breakdown

### T1 (TASK-001): Host detection + version helpers in installer-shared.sh

- **What**: add `installer_host_config_dir`, `installer_host_binaries`,
  `installer_host_detected`, `installer_bundle_version`,
  `installer_plugin_versions`, `installer_compare_versions` per design C1/C2.
  Bash 3.2-compatible, function-only, no source-time side effects.
- **Where**: `scripts/lib/installer-shared.sh`
- **Depends on**: none
- **Reuses**: `installer_require_runner`, heredoc pattern (`:101-106`),
  `installer_host_cli_supports` probe precedent;
  `install-skills.sh:165-172` `platform_executables` name list
- **Requirement**: PAI-01, PAI-06 (reader), AC-6/AC-8 support
- **Scope/non-goals**: no harness changes (T3); no state writes.
- **MCP/skill question**: massa-ai MCP unregistered this session (skipped);
  no external library → Context7 skipped. Answer: NONE/NONE.
- **Done when**:
  - [x] `installer_host_binaries` mirrors `platform_executables` exactly:
        cursor → `cursor-agent cursor`; claude/codex/opencode → single name
        (Plan Challenge C-2)
  - [x] `installer_host_detected` returns 0+signal for dir-only, binary-only
        (incl. cursor via `cursor-agent` only on PATH), both; 1+empty for
        neither; unknown host → config-dir helper returns 2
  - [x] `installer_plugin_versions` emits `host⇥version` on valid state; empty+exit 0 on missing file; one stderr warning+empty+exit 0 on corrupt JSON
  - [x] `installer_compare_versions` table: equal→0, older→-1, newer→1,
        empty/non-numeric→-1, pre-release row (`1.9.1-rc1` vs `1.9.1` → -1)
  - [x] `bash -n` clean; focused assertions pass (inline in T3's suite file scaffold or a scratch assertion block executed in the task)
- **Tests**: shell integration (helpers exercised through assertions; full branch coverage lands with T3's suite — helpers have no harness to call them before T3, so T1 ships focused assertions for every branch)
- **Gate**: quick
- **Commit**: `feat(installer): host detection + version gate helpers`

### T2 (TASK-002): install-skills.sh state round-trip preserves `plugin` field

- **What**: extend the TSV intermediate 4→6 fields (plugin version,
  installedAt), `state_replace` preserves fields 5–6, write heredoc re-attaches
  `platforms[p].plugin`. Plus TS suite `install-state-plugin-version.test.ts`:
  round-trip through real `install-skills.sh --apply/--uninstall`, pre-feature
  v2 file compat, corrupt-file strictness unchanged (skills reader still
  hard-fails).
- **Where**: `scripts/install-skills.sh` (`:290-362`, `:383-397`, `:778`);
  `scripts/__tests__/install-state-plugin-version.test.ts` (new)
- **Depends on**: none (TS suite grows compare/parity cases in T4 — file
  created here with round-trip cases)
- **Reuses**: `skillsOwner` optional-field precedent (`:350-354`)
- **Requirement**: PAI-06, AC-7
- **Scope/non-goals**: no plugin-field *writes* from skills (pass-through only);
  no plugin installers (T4).
- **MCP/skill question**: NONE/NONE (same skipped sensors as T1).
- **Done when**:
  - [x] seeded state with `plugin` subfield survives `install-skills.sh --apply` and `--uninstall` byte-identical in that subfield
  - [x] pre-feature v2 file (no `plugin`) round-trips unchanged — absent
        subfield stays absent, never `{version: "", installedAt: ""}`
        (Plan Challenge inversion E)
  - [x] corrupt file still exits 2 with integration error (strictness preserved)
  - [x] existing suites `test-install-skills-*.sh` green
  - [x] Gate: `bun test scripts/__tests__/install-state-plugin-version.test.ts` — N tests pass (record count)
- **Tests**: TS integration (matrix row 2)
- **Gate**: quick → full (`bun run test:scripts` before commit)
- **Commit**: `feat(installer): install-state v2 round-trips plugin version records`

### T3 (TASK-003): Harness plugin phase — detection, version gate, dry-run

- **What**: rewrite `install-harness.sh:172-206` per design C3 (runner resolve,
  bundle version, tolerant recorded-version read, per-host decision, marketplace
  resolution behind the decision, per-host dry-run report, ungated uninstall).
  Plus `scripts/tests/test-plugin-auto-install.sh`: detection matrix ×4 hosts,
  absent skip (log + zero writes + exit 0), skip-current (seeded equal version),
  downgrade skip (seeded newer), dry-run (decision lines + nothing written),
  failure isolation (opencode detected + `dist/` missing → failure, others
  processed, first exit code propagates), `--uninstall` ungated.
- **Where**: `scripts/install-harness.sh`; `scripts/tests/test-plugin-auto-install.sh` (new)
- **Depends on**: T1
- **Reuses**: `installer-test-helpers.sh` mock agent binaries; `note_failure`;
  `installer_plugin_source_*`
- **Requirement**: PAI-01, PAI-02, PAI-04 (gate side), PAI-05, PAI-08, PAI-09,
  PAI-10, AC-12
- **Scope/non-goals**: version *recording* is T4 — upgrade assertions here use
  seeded state only; no plugin installer edits.
- **MCP/skill question**: NONE/NONE.
- **Done when**:
  - [x] every matrix branch above asserts green in the new suite — including
        the cursor binary-only branch run against the existing
        `installer-test-helpers.sh` mock (`cursor-agent`, Plan Challenge C-2)
  - [x] marketplace resolution runs only when ≥1 host installs/upgrades;
        harness with 0 detected hosts creates no
        `.config/massa-ai/marketplace/` directory (Plan Challenge C-3)
  - [x] `test-install-harness-cli.sh` and `root-install-menu.test.ts` green unchanged
  - [x] Gate: `bun run test:scripts` — full suite green, record pass counts
- **Tests**: shell integration (matrix row 1)
- **Gate**: full
- **Commit**: `feat(installer): harness plugin phase detects hosts and gates on bundle version`

### T4 (TASK-004): Plugin installers record/preserve/remove version ×4

- **What**: per design C4 — each of `apps/{claude,codex,cursor,opencode}-plugin/install.sh`:
  `record_plugin_version` writes `platforms[host].plugin = {version, installedAt}`
  **only on a successful exit** (final install step or EXIT trap on rc=0 —
  never inside `install_bundled_skills`, which returns before the hooks merge
  and MCP delegation; Plan Challenge C-1); preserve existing `plugin` subfield
  in whole-record-replace writes (`:250` pattern — verified at claude `:294`,
  codex `:300`, opencode `:180`); uninstall per spec AC-15 —
  `skillsOwner=="plugin"` keeps today's whole-record delete, otherwise delete
  only the `plugin` subfield (all four uninstall blocks change, opencode
  `:215-226` included).
  Extend `test-plugin-auto-install.sh` with the real-install e2e chain
  (install→record→skip-current→seed-older→upgrade→uninstall→record gone) for
  claude/codex/cursor; opencode happy path verified where its dist fixture
  lives — **gap check**: if `apps/opencode-plugin/__tests__` has no installer
  state-record case, add one there. Add ×4-host record-shape parity cases and
  the root↔plugins version-equality assertion to
  `install-state-plugin-version.test.ts`.
- **Where**: four `install.sh` files; `scripts/tests/test-plugin-auto-install.sh`;
  `scripts/__tests__/install-state-plugin-version.test.ts`;
  maybe `apps/opencode-plugin/__tests__/`
- **Depends on**: T3
- **Reuses**: existing per-installer heredoc pattern (cursor `:237-253`)
- **Requirement**: PAI-03, PAI-04 (record side), PAI-05, PAI-07, AC-15, AC-16
- **Scope/non-goals**: no bundle-content changes; no MCP path changes; no new
  `source installer-shared.sh` line in cursor/opencode, and no new
  shared-helper requirement in claude/codex (record is an inline heredoc ×4 —
  Plan Challenge C-5).
- **MCP/skill question**: NONE/NONE.
- **Done when**:
  - [x] e2e chain green for claude/codex/cursor; opencode record asserted in its own suite (or justified absence recorded)
  - [x] record shape identical across ×4 hosts (parity test); root + four
        plugin `package.json` versions asserted equal (closes latent F — no
        PR gate runs `version:sync`)
  - [x] forced hooks-merge failure after `install_bundled_skills` → no
        `plugin` subfield written (AC-16)
  - [x] uninstall: `skillsOwner=="plugin"` → whole record gone (unchanged);
        otherwise `plugin` subfield gone, skills fields intact (AC-15)
  - [x] record-write failure warns but does not fail the install
  - [x] Gate: `bun run test:scripts && bun run test:plugins` green, pass counts recorded
- **Tests**: shell integration + TS parity (matrix rows 1–3)
- **Gate**: full
- **Commit**: `feat(installer): plugin installers record bundle version on success and remove it on uninstall`

### T5 (TASK-005): Docs + CHANGELOG

- **What**: README Integration section gains the auto-detect/version-gate
  behavior note; CLAUDE.md agent-harness paragraph gains one sentence (plugin
  phase is host-detected and version-gated; state carries per-platform
  `plugin` records); CHANGELOG `[Unreleased] → ### Added` entry.
- **Where**: `README.md`, `CLAUDE.md`, `CHANGELOG.md`
- **Depends on**: T3, T4 (documents final behavior)
- **Requirement**: all (user-visible behavior change); CHANGELOG merge gate
- **MCP/skill question**: NONE/NONE.
- **Done when**:
  - [ ] entries accurate against implemented behavior (no overclaim)
  - [ ] Gate: build (`lint && type-check && test:scripts && test:plugins`)
- **Tests**: none (artifact check)
- **Gate**: build
- **Commit**: `docs(installer): plugin auto-install behavior + changelog`

### T6 (TASK-006): Aggregate gate + discrimination sensors

- **What**: run the full build gate in the worktree's tracked state; execute
  the four design discrimination sensors, each in scratch state, reverted
  after observation: (1) delete the C4 record call → PAI-03 test red; (2)
  force a hooks-merge failure after `install_bundled_skills` → no `plugin`
  subfield written (R8/AC-16); (3) drop C5 write-side re-attach → round-trip
  red; (4) harness with 0 detected hosts → no `.config/massa-ai/marketplace/`
  directory (R6).
- **Where**: no new files; evidence appended to `tasks.md` + STATE.md
- **Depends on**: T5
- **Requirement**: validation prep for the independent verification-agent
- **MCP/skill question**: NONE/NONE.
- **Done when**:
  - [ ] `bun run lint && bun run type-check && bun run test:scripts && bun run test:plugins` all green in tracked state, pass counts recorded
  - [ ] 4/4 mutants killed, evidence recorded
- **Tests**: none (sensor execution)
- **Gate**: build
- **Commit**: `test(installer): discrimination sensor evidence for plugin auto-install` (or fold into T5 commit if evidence-only — decide at Execute)

---

## Phase Execution Map

```
Phase 1:  T1 ──→ T2
Phase 2:  T3 ──→ T4
Phase 3:  T5 ──→ T6

T3 depends on T1. T4 depends on T3. T5 depends on T3,T4. T6 depends on T5.
T1 and T2 are mutually independent but sequenced T1 → T2 (single agent).
```

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 helpers | 5 functions, 1 file | ✅ granular |
| T2 state round-trip | 1 file + 1 suite | ✅ granular |
| T3 harness phase | 1 block + 1 suite | ✅ granular |
| T4 plugin recorders | 4 files, one identical change each + tests | ✅ granular (⚠ 4 files accepted: same atomic contract ×4, split would leave hosts inconsistent) |
| T5 docs | 3 doc files | ✅ granular |
| T6 sensors | evidence only | ✅ granular |

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | none | none | ✅ |
| T2 | none | none | ✅ |
| T3 | T1 | T1→T3 | ✅ |
| T4 | T3 | T3→T4 | ✅ |
| T5 | T3, T4 | T3,T4→T5 | ✅ |
| T6 | T5 | T5→T6 | ✅ |

## Test Co-location Validation

| Task | Layer | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | bash helpers | shell integration | shell integration (focused branch assertions) | ✅ |
| T2 | state extension | TS integration | TS integration, co-located new suite | ✅ |
| T3 | harness gate | shell integration | shell integration, `scripts/tests/` | ✅ |
| T4 | plugin installers | shell + TS parity | same-file suites extended | ✅ |
| T5 | docs | none (artifact) | none | ✅ |
| T6 | evidence | none | none | ✅ |

## Plan Challenge — tasks

Full gate, mode `pre_mortem`, `massa-ai-plan-critic`, 2026-07-29. Policy
`serious_findings: revise_plan` — all four must-fix findings verified against
source by the main agent and incorporated:

1. **C-1 (high)** — all four installers write state inside
   `install_bundled_skills`, before the hooks merge and MCP delegation
   (cursor `:384→:405→:418`; siblings identical). A late failure would have
   left a "current" record on a broken install and a permanent skip-current.
   → record moved to exit-0-only (`record_plugin_version`, final step / EXIT
   trap); new spec AC-16; T6 sensor 2.
2. **C-2 (medium)** — `install-skills.sh:165-172` probes `cursor-agent cursor`
   for cursor; the design probed only `cursor`, and the test mock provides
   `cursor-agent`. → `installer_host_binaries` mirrors the existing list
   exactly; T1/T3 updated.
3. **C-3 (medium)** — marketplace copy happened unconditionally before the
   loop. → explicit gate: resolution only when ≥1 host installs/upgrades;
   T6 sensor 4. Per-host copy scoping **rejected** (accepted risk): marketplace
   manifests enumerate all four plugins; partial copy risks a registered
   marketplace referencing missing dirs. Recorded as a spec assumption.
4. **C-4 (medium)** — "delete `plugin` subfield unconditionally" would have
   dropped today's clean-slate semantics (`skillsOwner=="plugin"` →
   whole-record delete, all four installers). → spec AC-15: whole-record
   delete preserved for plugin-owned platforms; subfield-only delete
   otherwise. All four uninstall blocks change.

Also incorporated: **inversion E** (absent `plugin` must round-trip absent,
never an empty-literal object — T2), **H** (pre-release compare row — T1),
**F** (no PR gate runs `version:sync` → root↔plugins version-equality
assertion added to T4's parity suite), **C-5** (claude/codex source
`installer-shared.sh` today; new record code adds no new shared-helper
dependency — T4 scope note; the pre-existing tarball fragility is reported as
side finding R9, out of scope).

Not accepted: per-host marketplace copy scoping (see C-3 above).

## Artifact-store evidence

- tasks written: `.specs/features/plugin-auto-install/tasks.md` (this file), v1, 2026-07-29.
