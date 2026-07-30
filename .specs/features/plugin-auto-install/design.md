# Plugin Auto-Install Design

**Spec**: `.specs/features/plugin-auto-install/spec.md`
**Status**: Approved (approach A confirmed by user 2026-07-29)

## Architecture Overview

Approach **A — Harness-gated**. One gate, two recording points:

```
install-harness.sh (plugin phase)
  ├─ installer_host_detected <host> <home>     (installer-shared.sh; dir OR PATH binary)
  ├─ installer_plugin_versions <runner> <state> (installer-shared.sh; tolerant heredoc read)
  ├─ installer_compare_versions <a> <b>         (installer-shared.sh; heredoc -1|0|1)
  └─ per host: install | upgrade | skip-current | skip-absent | skip-downgrade
        └─ apps/<host>-plugin/install.sh --user   (only when install/upgrade)
              └─ records platforms[host].plugin = {version, installedAt}  (last write)
install-skills.sh
  └─ TSV intermediate extended 4 → 6 fields so its state rewrite round-trips `plugin`
```

The harness is the only place that decides **whether** a host's installer runs.
Each plugin installer is the only place that **records** its own successful
install, so direct `apps/<host>-plugin/install.sh --user` runs keep working
unchanged apart from the version record (spec goal 3).

## Current codebase evidence

| Evidence | Location |
| --- | --- |
| Blind 4-host loop, dry-run skips whole phase | `scripts/install-harness.sh:172-206` |
| Shared lib, bash 3.2, function-only, runner/backup/consent helpers | `scripts/lib/installer-shared.sh` |
| State parsed to TSV (platform, root, skills, owner), rewritten from TSV | `scripts/install-skills.sh:280-397, 778` |
| Malformed state = hard fail (exit 2 → integration_error) in skills path | `scripts/install-skills.sh:296-306, 364-366` |
| Plugin installers self-contained (no installer-shared.sh sourcing), inline node/bun heredocs | `apps/cursor-plugin/install.sh:188-296` (pattern repeated in claude/codex/opencode) |
| Whole-record replace drops unknown fields | `apps/cursor-plugin/install.sh:250` |
| Uninstall deletes whole record only when `skillsOwner == "plugin"` | `apps/cursor-plugin/install.sh:285-296` |
| Menu strings pinned by tests | `install.sh:663` NOTE, `scripts/__tests__/root-install-menu.test.ts` |
| Version sync root ↔ workspace packages is a tested contract | `scripts/__tests__/workspace-dependency-pinning.test.ts`, `version:sync` |
| Host CLI probing precedent (binary on PATH + `--help` works) | `installer_host_cli_supports`, `installer-shared.sh:101-106` |

## Components

### C1 — Host detection (`installer-shared.sh`)

- `installer_host_config_dir <host>` — echoes the host's user config dir
  relative to home: `claude→.claude`, `codex→.codex`, `cursor→.cursor`,
  `opencode→.config/opencode`. Unknown host → return 2.
- `installer_host_binaries <host>` — echoes the binary name(s) to probe,
  mirroring `install-skills.sh:165-172` `platform_executables` **exactly**:
  `cursor→"cursor-agent cursor"`, all others single-name. Detection and the
  existing skills detection must never disagree about the same machine
  (Plan Challenge C-2).
- `installer_host_detected <host> <target_home>` — returns 0 and echoes the
  signal (`dir` or `binary`) when `<target_home>/<config_dir>` exists OR any
  name from `installer_host_binaries` is on `PATH`; else returns 1, echoes
  nothing. Binary probe is bare `command -v` (no `--help`): detection must be
  side-effect-free and sub-second; `installer_host_cli_supports` stays the
  install-time probe.

### C2 — Version helpers (`installer-shared.sh`)

- `installer_bundle_version <package_json>` — `sed` extraction of the top-level
  `"version"` from a package.json (no runner needed).
- `installer_plugin_versions <runner> <state_file>` — heredoc, **tolerant**:
  emits `<host>\t<version>` per platform with a `plugin.version`; missing file
  → empty output, exit 0; unparseable file → one stderr warning + empty output,
  exit 0 (spec AC-8: plugin path self-heals; the strict skills reader is
  untouched — see R4).
- `installer_compare_versions <runner> <a> <b>` — heredoc, echoes `-1|0|1`.
  Numeric dotted compare; empty/non-numeric segment → not equal → `-1` (treat
  unknown as older → upgrade once, then recorded; spec assumptions). A
  pre-release suffix (`1.9.1-rc1`) contains a non-numeric segment and therefore
  compares older than the plain release — which matches semver ordering for
  this project's release-only tags; the compare table pins this row.

### C3 — Harness plugin phase (`install-harness.sh`)

Rewritten block (`:172-206`), order preserved after skills and MCP:

1. `runner="$(installer_require_runner "plugin version gating")"` (exit 3 when
   absent — plugin installers cannot record without node/bun either).
2. `bundle_version="$(installer_bundle_version "$REPO_ROOT/package.json")"`.
3. `recorded="$(installer_plugin_versions "$runner" "$TARGET_HOME/.config/massa-ai/install-state.json")"`.
4. Marketplace source resolution (`installer_plugin_source_*`) runs **only
   when ≥1 host will install/upgrade** — an explicit gate, not a code move:
   dry-run and all-skip/all-absent runs must not materialise the copy (it is a
   write). When it does run, the copy remains the **full four-bundle set**
   (spec assumption: marketplace manifests enumerate all four plugins; a
   per-host partial copy risks a registered marketplace referencing missing
   dirs — Plan Challenge C-3 accepted-risk framing).
5. Per host in `claude codex cursor opencode`:
   - not detected → `info` one line: `skip <host>: host not detected` — no writes, exit unaffected (PAI-02).
   - detected, recorded == bundle → `skip <host>: already at <version>` (PAI-05).
   - detected, compare(recorded, bundle) == 1 → `skip <host>: installed <recorded> newer than bundle <bundle>` (AC-6).
   - else (empty/older) → run installer; log `install <host>@<bundle>` or `upgrade <host>: <recorded> → <bundle>`.
6. `--dry-run`: steps 1–3 run (read-only), then one line per host with the
   would-be action; no marketplace copy, no installer calls (PAI-09).
7. `--uninstall`: detection gate does **not** apply — all four installers run
   `--uninstall` as today (harmless no-op on absent hosts, covers
   host-removed-after-install); each installer removes its own version record.
8. `note_failure` semantics unchanged (PAI-10).

### C4 — Plugin installers ×4 (`apps/{claude,codex,cursor,opencode}-plugin/install.sh`)

- **Record on success only** (new): the `plugin` subfield write does **not**
  live inside `install_bundled_skills` — that function returns before the
  hooks merge and MCP delegation, so a later-step failure would leave a
  "successfully installed" record on a broken install (Plan Challenge C-1;
  verified cursor `:384→:405→:418` and the identical sibling orderings).
  Instead each installer gains `record_plugin_version`, invoked only when the
  install path is about to exit 0 (final step, or an `EXIT` trap gated on
  `rc=0`): heredoc read-modify-write preserving every unrelated field —
  `platforms[host].plugin = { version, installedAt }` where `version` comes
  from the plugin's own `package.json` (sed extraction, no new shared-helper
  dependency — C5/Plan Challenge C-5; claude/codex already source
  `installer-shared.sh` in a checkout, cursor/opencode do not, and none may
  gain a NEW source requirement) and `installedAt` is ISO-8601 UTC.
  Tolerant of a corrupt/missing state file (rewrites a minimal valid one).
  Record failure → warn, **not** install failure (next run treats the host as
  unknown-version and reinstalls).
- **Preserve on replace**: the bundled-skills state write (cursor pattern
  `:250`, `data.platforms[host] = { root, skillsOwner, skills }` — verified
  identical at claude `:294`, codex `:300`, opencode `:180`) first captures
  any existing `platforms[host].plugin` and re-attaches it.
- **Uninstall** (spec AC-15): (a) when `skillsOwner == "plugin"`, today's
  whole-record delete is **unchanged** (clean-slate semantics preserved);
  (b) otherwise the installer deletes only `platforms[host].plugin`,
  preserving `root`/`skills`/`skillsOwner`. All four installers' uninstall
  blocks change (opencode `:215-226` and siblings still carry the old single
  branch — Plan Challenge C-4/G).

### C5 — `install-skills.sh` round-trip

- Parse heredoc (`:290-362`): emit TSV fields 5 (`plugin.version`) and 6
  (`plugin.installedAt`), empty when absent. Validation of fields 1–4 unchanged.
- `state_replace`: preserves fields 5–6 already in `STATE_OUT` for that
  platform (skills runs never touch plugin records).
- Write heredoc (`:778`): re-attaches `plugin = {version, installedAt}` to each
  platform record when fields 5–6 are non-empty. Output shape otherwise
  unchanged (`version: 2`, no schema bump — optional field, exactly the
  `skillsOwner` precedent at `:350-354`). An **absent** `plugin` subfield must
  round-trip as absent — never as `{version: "", installedAt: ""}` (Plan
  Challenge inversion E); the TS suite asserts this explicitly.

## Data model

`~/.config/massa-ai/install-state.json` (v2, extended — no version bump):

```json
{
  "version": 2,
  "repository": "/path/to/checkout",
  "platforms": {
    "cursor": {
      "root": "/Users/x/.cursor",
      "skills": ["massa-ai", "persona-router"],
      "skillsOwner": "repo",
      "plugin": { "version": "1.9.1", "installedAt": "2026-07-29T12:00:00Z" }
    }
  }
}
```

- `plugin` optional; absent = unknown version (pre-feature installs, AC-7).
- Writers: plugin installers (record/delete), `install-skills.sh`
  (pass-through), harness (read-only).
- Readers: harness gate (C2 tolerant reader), future runs.

## Requirements traceability

| Req | Component | Verification |
| --- | --- | --- |
| PAI-01 detection | C1, C3 | shell suite: dir-only / binary-only / both / neither ×4 hosts |
| PAI-02 absent skip | C3.5 | assert log line + zero writes + exit 0 |
| PAI-03 version record | C4 | state file asserted after real install into scratch HOME |
| PAI-04 upgrade | C3.5 | seed older version → installer re-runs (mtime/log evidence) |
| PAI-05 same-version no-op | C3.5 | run twice; second run logs skip, config-dir mtimes unchanged |
| PAI-06 state compat | C2, C5 | TS suite: pre-feature v2 file → upgrade → fields intact; install-skills round-trip preserves `plugin` |
| PAI-07 uninstall | C4 | plugin field absent after `--uninstall`, skills fields intact |
| PAI-08 single path | C1–C3 (shared lib + harness) | root `install.sh`/`setup-local-first.sh` call harness unchanged; menu-pin suite untouched |
| PAI-09 dry-run | C3.6 | per-host decision lines; assert nothing written under scratch HOME |
| PAI-10 failure isolation | C3.8 | OpenCode detected + `dist/` missing → failure; other hosts still processed; exit code = first failure |

## Verification design

- **`scripts/tests/test-plugin-auto-install.sh`** (new bash suite, scratch
  `--target` HOME, fake `bin/` stubs on PATH for host-binary detection): the
  full matrix above with the **real** claude/codex/cursor installers against
  the scratch HOME. OpenCode: detection, absent-skip, and the build-missing
  failure-isolation path (AC-12); its happy path stays with the plugin's own
  `__tests__` (dist fixture) — gap check is a task.
- **`scripts/__tests__/install-state-plugin-version.test.ts`** (new TS suite):
  v2-extension round-trip through `install-skills.sh --apply/--uninstall`,
  tolerant reader on corrupt/missing state, `installer_compare_versions`
  table (equal/older/newer/empty/non-numeric), downgrade skip.
- **Existing gates, unchanged expectations**: `root-install-menu` (strings
  pinned), `test-mcp-single-writer.sh`, plugin `__tests__`
  (`bun run test:plugins`), install shell suites, `lint`, `type-check`.
- **Discrimination sensors**: (1) delete the C4 record call → PAI-03 test must
  fail; (2) force a hooks-merge failure after `install_bundled_skills` → no
  `plugin` subfield may be written (R8); (3) drop C5 write-side re-attach →
  round-trip test fails; (4) harness with 0 detected hosts → no
  `.config/massa-ai/marketplace/` directory created (R6).

## Error handling

| Scenario | Handling | User sees |
| --- | --- | --- |
| Host absent | skip, exit unaffected | `skip <host>: host not detected` |
| Corrupt state (plugin reader) | warn, treat unknown, self-heal on next success | one warning line |
| Corrupt state (skills reader) | unchanged hard fail | existing integration error |
| Runner absent | exit 3 before any plugin write | `node or bun required … plugin version gating` |
| Installer fails | no version recorded; remaining hosts continue; first code propagates | existing `note_failure` line |
| Record write fails | warn only | warning; next run reinstalls (unknown version) |
| Downgrade | skip | `skip <host>: installed <a> newer than bundle <b>` |

## Risks & Concerns

| # | Concern | Location | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | State rewrite from TSV drops unknown fields | `install-skills.sh:778` | version records silently lost on next skills install | C5 6-field TSV + round-trip test (discrimination sensor 3) |
| R2 | Whole-record replace drops `plugin` | `apps/cursor-plugin/install.sh:250` (+ siblings) | version lost when bundled-skills path re-writes | C4 preserve-on-replace; record is the last write of every install run |
| R3 | PATH false positive (unrelated `cursor` binary) | C1 | bundle installed for a host the user doesn't use | verbose log names the signal; cheap probe chosen deliberately over `--help` (side-effect-free); accepted in spec assumptions |
| R4 | Strict-vs-tolerant split on corrupt state | skills `:296-306` vs C2 | two behaviors for one file could confuse | documented split: skills owns skills fields and stays strict; plugin reader is additive and self-heals (AC-8 scoped to plugin path) |
| R5 | Version skew root vs plugin package.json | C3.2 vs C4 | permanent upgrade loop | `version:sync` keeps them equal but runs only in `publish.yml` — no PR gate (Plan Challenge fact-check F). TS parity suite asserts root + all four plugin `package.json` versions are equal in the checkout |
| R6 | Marketplace copy is a write | `installer_plugin_source_root` | dry-run/all-skip runs would still mutate `$HOME` | C3.4 explicit gate: resolution only when ≥1 host installs/upgrades; sensor: 0 detected hosts → no marketplace dir |
| R7 | Four near-identical heredoc edits | C4 | drift between hosts | per-host parity assertions in the TS suite (same record shape ×4) |
| R8 | Record written before a later step fails | C4, installer main flows | "successfully installed" record on a broken install → perpetual skip-current | record runs only on exit-0 (final step / EXIT trap); sensor: forced hooks-merge failure → no `plugin` subfield (Plan Challenge C-1) |
| R9 | claude/codex installers source `installer-shared.sh` via `$REPO_ROOT`; a published tarball lacking `scripts/` would crash them | `apps/claude-plugin/install.sh:42-43`, `apps/codex-plugin/install.sh:41-42` | pre-existing fragility, not introduced here | out of scope: new record code adds **no** new shared-helper dependency in any of the four; reported as a side finding for the plugin-distribution surface |

## Tech decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Gate placement | harness only (approach A) | single code path (PAI-08); direct installs unchanged; dry-run trivial |
| State schema | extend v2, no bump | optional field; `skillsOwner` precedent; zero reader breakage |
| Version source | root `package.json` at gate, plugin's own at record | same synced value; each side reads its nearest canonical file |
| Detection probe | bare `command -v`, not `--help` | detection must be side-effect-free; install-time probing already exists |
| Uninstall gating | ungated | covers host-removed-after-install; uninstallers are no-op safe |
| Record failure | warn, not fail | plugin IS installed; self-heals next run |

No `AD-NNN` supersession: conforms to AD-010 (no new env knob — detection has
none), AD-011/012/013 untouched. Feature-local decisions only.

## Artifact-store evidence

- design written: `.specs/features/plugin-auto-install/design.md` (this file), v1, 2026-07-29.
