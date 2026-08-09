# Tasks — claude-marketplace-cache-refresh

1 Phase = 4 Tasks. Sequential (T1→T4): T1..T2 edit one file
(`apps/claude-plugin/install.sh`), T3 senses them, T4 is release bookkeeping.
No disjoint write sets → no batch-worker split.

## T1 — cache refresh on version mismatch (CMR-01/04/05)

- Add `claude_served_plugin_version()` + `refresh_marketplace_cache()` to
  `apps/claude-plugin/install.sh`; call after `PLUGIN_ROUTE=1` in the install
  flow. Design flow table is the contract.
- Gate: `bash -n apps/claude-plugin/install.sh` (syntax);
  existing suites green: `bash scripts/tests/test-plugin-registry-registration.sh`,
  `bash scripts/tests/test-install-agents-claude-hooks.sh` (I3 sensors).

## T2 — truthful version recording (CMR-02/03)

- `record_plugin_version`: marketplace route records
  `$PLUGIN_SERVED_VERSION`; empty → warn + omit `plugin.version`
  (preserve prior), still write `installRoute`. File route untouched.
- Gate: `bash scripts/tests/test-plugin-auto-install.sh` green (file-route
  recording unchanged, I3).

## T3 — discriminating mock-CLI suite (CMR-06, AC-1..5)

- New `scripts/tests/test-plugin-marketplace-cache-refresh.sh` per design
  harness section. Scenario matrix AC-1..5 + update-unsupported variant.
- Observed-red discipline: after green, revert the T1 mismatch branch in a
  scratch copy and confirm AC-1 fails (sensor kills the mutation); record the
  red output in validation evidence.
- Gate: suite exits 0 run directly; `bun run test:scripts` reaches it.

## T4 — CHANGELOG (CMR-07)

- `### Fixed` bullet under `[Unreleased]`.
- Gate: CI changelog merge gate satisfied by the diff itself.

## Test Coverage Matrix

| AC | Sensor |
|----|--------|
| AC-1 | T3 scenario "stale served" — update log count == 1, recorded == post-update served |
| AC-2 | T3 scenario "equal" — update log count == 0 |
| AC-3 | T3 scenario "served newer" — update log count == 0, recorded == served |
| AC-4 | T3 scenario "update fails" — exit 0, stderr warning, recorded == stale served |
| AC-5 | T3 scenario "registry unreadable" — exit 0, stderr warning, `plugin.version` absent |
| AC-6 | existing 3 installer suites, unmodified, green |
| AC-7 | CHANGELOG diff |

## Gate Check Commands

```bash
bash -n apps/claude-plugin/install.sh
bash scripts/tests/test-plugin-marketplace-cache-refresh.sh
bash scripts/tests/test-plugin-auto-install.sh
bash scripts/tests/test-plugin-registry-registration.sh
bash scripts/tests/test-install-agents-claude-hooks.sh
bash scripts/tests/test-model-profile-installer-reapply.sh
bun run test:plugins   # critic R4 — install.test.ts interplay
bun run lint
```
