# Validation — plugin-auto-install

- **Feature**: `plugin-auto-install`
- **Branch**: `feat/plugin-auto-install`, cut from `origin/main` @ `ce26f28`
- **Worktree**: `/Users/luizmassa/Projects/massa-ai-wt-plugin-auto-install`
- **Commit range**: `ce26f28..HEAD` — T1 `41bfda3`, T2 `c2ee9b0`, T3 `9c68012`,
  T4 `bb42849`, T5 `f9fbc81`, T6 `cc132bc`, validation-loop fixes `ad9232b`
  (AC-13 reword) and `5438037` (README/CHANGELOG `k)` correction)
- **Verifier**: fresh `massa-ai-verification-agent` (author ≠ verifier), 2026-07-29.
  **Provenance note**: the verifier session had no shell-exec or file-write tool,
  so it performed full static verification (every implementation grep
  worktree-path-explicit) and delivered this report inline; the main agent
  persisted it and independently re-ran every gate in tracked state (counts
  below). Fix→re-verify loop: 1 iteration used (of 3).
- **Date**: 2026-07-29

## Gate results — re-run in tracked state @ `5438037` (main agent, two full runs: @ `f9fbc81` pre-sensors and @ `5438037` final; identical counts)

| Gate | Result |
| --- | --- |
| `bun run lint` | clean |
| `bun run type-check` | 6/6 tsc projects |
| `bun run test:scripts` (TS) | 637 pass + 3 fail — all 3 in `scripts/tests/verify-tree-sitter-grammars.test.ts` (native tree-sitter suites), **pre-existing environment failures verified red at HEAD `ce26f28` via stash in T2**; recorded, not fixed |
| shell loop `for f in scripts/tests/*.sh; do bash "$f" \|\| exit 1; done` (run separately because the `&&` chain short-circuits on the TS failures) | 21/21 green |
| `bun run test:plugins` | 96/96 (695 assertions) |

The verifier statically cross-checked these counts for internal consistency
(21 `scripts/tests/test-*.sh` suites exist by glob, including the new
`test-plugin-auto-install.sh`); it could not execute them itself.

## Requirement verdicts (independent verifier, static, file:line evidence)

| Req | Verdict | Evidence |
| --- | --- | --- |
| PAI-01 | **VERIFIED** | `installer_host_config_dir` `installer-shared.sh:192-200` (claude→`.claude`, codex→`.codex`, cursor→`.cursor`, opencode→`.config/opencode`, unknown→rc 2); `installer_host_binaries:207-215` mirrors `platform_executables` exactly (cursor→`cursor-agent cursor`); `installer_host_detected:225-241` returns 0+`dir`/`binary`, 1 on neither, never fabricates a home. Tests: `test-plugin-auto-install.sh` 1.1 (:50-55), 1.2 (:59-64), 1.3 detection matrix (:67-101), 2.1 (:200-208), 2.2 (:211-216). |
| PAI-02 | **VERIFIED** | `install-harness.sh:213-216` skip-absent → `:278 info "skip <host>: host not detected"`, no installer call → no writes. Test 2.3 (:219-226): exit 0, skip line per absent host, `assert_no_file` for their config dirs. |
| PAI-03 | **VERIFIED** | `record_plugin_version` writes `platforms[host].plugin = {version, installedAt}` — claude `install.sh:382-405` (call :618), codex :386-409 (call :619), cursor :336-359 (call :504), opencode :266-... (call :490); ISO-8601 UTC via `date -u`. Version read from the plugin-local `package.json`; PAI-03's literal "repo root" is bridged by the version-equality parity invariant (R5/F): `install-state-plugin-version.test.ts:65-72` asserts root + all four plugin versions equal (verified 1.9.1). Tests: 3.x(a) (:440-448). |
| PAI-04 | **VERIFIED** | Harness `:223` compare → `-1` → upgrade; `:289` logs `upgrade <host>: <rec> → <bundle>`. Tests 2.6 (:255-265), 3.x(c) (:457-463). |
| PAI-05 | **VERIFIED** | Harness `:220` skip-current; `:279` log. Tests 2.4 (:229-239), 3.x(b) (:450-455) — host config dir `tree_fingerprint` unchanged on same-version re-run (stronger than mtime). |
| PAI-06 | **VERIFIED** | Tolerant plugin reader `installer_plugin_versions:256-284` (missing→empty+rc0; corrupt→warn+empty+rc0); strict skills reader untouched (`install-skills.sh:340-378` still exit 2). Round-trip: TSV fields 5-6 `:365-368`, `state_replace` preserves `:403-409`, write heredoc re-attaches only a complete record `:803-805` (absent stays absent). Tests: TS suite (:65-199), plugin suite 1.5 (:113-140), 3.2 (:500-508). |
| PAI-07 | **VERIFIED** | AC-15 uninstall blocks — claude `:340-357`, codex `:344-360`, cursor `:294-310`, opencode `:224-240`. Harness `--uninstall` ungated (`:206-210`, `:254-295`). Tests: 3.x(d) (:465-470), 3.x(e) (:472-486), 3.3 (:510-518), 2.11 (:330-336); opencode `__tests__/install.test.ts:485-536`. |
| PAI-08 | **VERIFIED** | Detection + gating live in one shared place (`installer-shared.sh` C1/C2 + `install-harness.sh` C3). Harness routes: `setup-local-first.sh:540` (`--all`), root `k)` menu → `install_harness_menu` (`install.sh:671-699`), direct `--plugins`. Pinned menu strings unchanged (`root-install-menu.test.ts:17-85`). Note: `p)` does not route through the harness — see AC-13. |
| PAI-09 | **VERIFIED** | Harness `:236-252` dry-run reports per-host decision and stops. Test 2.8 (:276-297): decision lines, `called_hosts` empty, HOME fingerprint unchanged, no marketplace dir. |
| PAI-10 | **VERIFIED** | `note_failure` `:134-138` first-code-wins; loop continues `:291-306`; `exit "$STATUS"` :322. Tests 2.9 (:300-307, RC=first failing code, both hosts processed), 2.10 (:312-328). Failed host records nothing (AC-16). |

## Acceptance-criterion verdicts (independent verifier, static, file:line evidence)

| AC | Verdict | Evidence |
| --- | --- | --- |
| 1 | **VERIFIED** | Per-host detect+decision `install-harness.sh:212-233`; `:278` skip line. Tests 2.1 (:200-208) dir-only ×4, 2.3 (:219-226). |
| 2 | **VERIFIED** | `installer_host_detected:233-239` `command -v` → detected without config dir. Tests 1.3 (:76-85), 2.2 (:211-216). |
| 3 | **VERIFIED** | Record path (PAI-03). Test 3.x(a) (:442-448): version == root `REAL_VERSION` + ISO-8601 regex. |
| 4 | **VERIFIED** | Harness `:220`/`:279`. Test 3.x(b) (:450-455): unchanged tree fingerprint + skip line. |
| 5 | **VERIFIED** | Harness `:223`/`:229-230`. Test 3.x(c) (:457-463): seed 0.0.1 → upgrade + record updated. |
| 6 | **VERIFIED** | Compare → `1` → skip-newer `:280`. Test 2.5 (:242-252) seeded 9.9.9 → installer NOT run. Pre-release compare row (`1.9.1-rc1` vs `1.9.1` → `-1`) at test 1.6 (:149). |
| 7 | **VERIFIED** | `installer_plugin_versions` treats no-`plugin` as unknown; `record_plugin_version` reuses the existing record (claude `:398-401`, siblings identical) so `skillsOwner` and unrelated platforms survive. Tests: TS `:121-148` (untouched platform byte-identical), `:152-166` (pre-feature file round-trips absent). Note: no dedicated test seeds a pre-feature *repo-owned* record then harness-installs; evidence rests on code-path inspection + the absent-stays-absent round-trip. |
| 8 | **VERIFIED** | Reader try/catch → warn + empty + rc0 `:262-270`; record path rewrites a valid file. Tests 1.5 (:127-140), 3.2 (:500-508). |
| 9 | **VERIFIED** | `note_failure:134-138` + loop `:275-310`. Test 2.9 (:300-309). |
| 10 | **VERIFIED** | `:236-252`. Test 2.8 (:280-297): decision lines + no installer calls + HOME fingerprint unchanged. |
| 11 | **VERIFIED** | Uninstall deletes `rec.plugin` (PAI-07). Tests 3.3 (:510-518), 3.x(d), 2.11 (:331-336). |
| 12 | **VERIFIED** | `apps/opencode-plugin/install.sh:104-108` build guard → documented error + `exit 1` before any write/record; opencode last in loop order (`:207`, `:212`). Tests 2.10 (:312-328); `apps/opencode-plugin/__tests__/install.test.ts:228-238`. |
| 13 | **VERIFIED** (as reworded) | Original text ("`k)`/`p)` menus … reach the plugin phase") conflicted with PAI-08 (pinned menu strings) and goal 3 (manual per-host surface unchanged): `p)` invokes the per-host installers directly and is deliberately un-gated (`install.sh:706-810`, pinned by `root-install-menu.test.ts:20-63`). **Spec corrected 2026-07-29 (`ad9232b`)**: AC-13 now enumerates the harness routes (`k)` menu, `setup-local-first.sh:540`, direct `--plugins`) and records `p)` as the un-gated manual surface by design. All harness routes verified to share `installer-shared.sh` + `install-harness.sh`. |
| 14 | **VERIFIED** | `root-install-menu.test.ts` 14/14 green with menu strings unchanged; `test-mcp-single-writer.sh` green in the 21/21 shell loop; plugin `__tests__` 96/96 (opencode gained PAI-03/07/AC-15 cases, prior suite shape preserved); `test-install-harness-cli.sh` green unchanged. |
| 15 | **VERIFIED** | Plugin-owned → whole-record delete (claude `:347-348`, codex `:351-353`, cursor `:301-303`, opencode `:231-233`); otherwise `delete rec.plugin` only (claude `:350-352`, codex `:354-356`, cursor `:304-306`, opencode `:234-236`). Tests 3.x(d) (:465-470), 3.x(e) (:472-486), opencode `install.test.ts:485-536`, TS `:168-184`. |
| 16 | **VERIFIED** | `record_plugin_version` is the final statement of each install path (claude `:618`, codex `:619`, cursor `:504`, opencode `:490`), after every fallible step; record-write failure is warn-only. Test 3.x(f) (:488-496): forced hooks-merge failure → non-zero exit → no record. T6 sensor 2 confirms this test kills the record-before-hooks-merge mutant. |

## Test adequacy / discrimination sensors (T6, executed by the main agent in scratch state, each reverted after observation; verifier sanity-checked the permanent tests exist and assert the claims)

| Sensor | Mutant | Result |
| --- | --- | --- |
| 1 | Delete C4 `record_plugin_version` call (claude `:618`) | Suite red RC=1 — exactly the 6 claude PAI-03 record assertions; codex/cursor chains green. Reverted. |
| 2 | Record call moved to just after `install_bundled_skills`, before the hooks merge (C-1 shape) | Suite red RC=1 — exactly 3.x(f) `claude failed install records no plugin version` (got `1.9.1`, want empty). Reverted. |
| 3 | Drop C5 write-side re-attach (`install-skills.sh:803-805`) | `install-state-plugin-version.test.ts` red — 2 round-trip cases (`--apply` preserves subfield; `--uninstall` keeps byte-identical), both `Received: undefined`. Reverted. |
| 4 | Ungated marketplace resolution (plan-grep removed, `install-harness.sh:267`) | Suite red RC=1 — exactly 2.12 `0 detected hosts → no marketplace dir`. Reverted. |

Post-revert: `git status` clean; `test-plugin-auto-install.sh` RC=0; TS round-trip
suite 6/6. **4/4 mutants killed.**

## Documentation-accuracy findings

| Doc | Verdict | Note |
| --- | --- | --- |
| `README.md` Integration auto-install paragraph (:208-219) | ACCURATE | Matches C3/PAI-01/02/03/04/05/09 + goal 3. Dry-run label list omits `skip-newer` — under-listing conforming to AC-10's own enumeration, not overclaim. |
| `README.md` `p)`/`k)` summary (:204-206 and :640-643) | **FIXED** (`5438037`) | Verifier found the pre-existing (commit `26433aff`, not T5-introduced) sentence "`k` … installs skills and MCP registration without any plugin bundle" inaccurate — `k)` opens `install_harness_menu` whose option 3 runs `--all` including gated plugin bundles (`install.sh:638,671-699`). Both copies corrected; the T5 paragraph's "the root `install.sh` menus" tightened to "`k)` harness menu". |
| `CLAUDE.md` agent-harness paragraph (:309-314) | ACCURATE | Host-detected, version-gated, record shape, v2 round-trip-never-writes — all match the implementation. |
| `CHANGELOG.md` `[Unreleased] → ### Added` (:8-26) | ACCURATE | All claims match implemented behavior; harness route wording tightened with the README fix. |

## Residual risk / notes

1. **Verifier could not execute gates or write this file** (no shell/write tools in
   its session). Gates were re-run by the main agent in tracked state (counts
   above, two runs, identical); the verifier's contribution is the independent
   per-AC/per-PAI static evidence. Recorded as an accepted deviation from the
   ideal author≠verifier gate re-run.
2. **Marketplace gate `grep '|install\||upgrade'`** (`install-harness.sh:267`)
   relies on BRE `\|` alternation — supported by this platform's BSD libc regex
   and discriminated by mutually-exclusive tests 2.12a/2.12b; a strict-POSIX
   `grep` would silently break the gate. Low risk on the documented dev/CI
   platform.
3. **Version-source literal mismatch (bridged)** — the record reads the
   plugin-local `package.json`; PAI-03 says "repo root". The R5/F parity test
   (root + four plugin versions equal) is the load-bearing guard — no PR gate
   runs `version:sync`, so keep that test green.
4. **AC-7 repo-owned pre-feature seed** is evidenced by code-path inspection plus
   the round-trip suite, not by a dedicated harness-install test. Accepted.
5. Pre-existing load-flake class noted in STATE.md history
   (`test-setup-wizard-db-selection.sh` flaked once under the full loop, green
   standalone) — not chased, per policy.

## Verdict

**PASS.** PAI-01..PAI-10 VERIFIED; AC-1..AC-16 VERIFIED (AC-13 under its
corrected text, `ad9232b`); 4/4 discrimination mutants killed; aggregate gate
green in tracked state (lint clean, type-check 6/6, TS 637 pass + 3 pre-existing
env failures red at HEAD, shell 21/21, plugins 96/96); docs accurate after one
fix iteration (`5438037`). Fix→re-verify loop: 1 of 3 iterations used.
