# M19 — Installer Race Safety Tasks

## Execution Plan

### TASK-M19-1 — Transactional `.env` publisher

- Files: `scripts/lib/installer-env-transaction.sh`, `scripts/setup-local-first.sh`, `scripts/tests/test-installer-env-race-safety.sh`
- Implement: candidate-before-lock, typed snapshot/revalidation, owner-proven lock/reclaim, atomic verified backup and publish, owner-scoped cleanup.
- Done when: AC1–AC6 pass in focused shell harness; existing setup-wizard test remains green.
- Gate: `bash scripts/tests/test-installer-env-race-safety.sh && bash scripts/tests/test-setup-wizard-db-selection.sh && bash -n scripts/setup-local-first.sh`
- Commit: `fix(installer): make env publication race safe`

### TASK-M19-2 — Independent cross-platform validation

- Files: `.specs/features/installer-race-safety/validation.md`, project state files only.
- Done when: independent verifier maps AC1–AC7 to evidence, runs a reversible discrimination sensor, and records PASS or Blocked.
- Gate: focused gate plus available macOS/Debian execution.
- Commit: `docs(specs): validate installer race safety`

## Test Coverage Matrix

| AC | Sensor |
| --- | --- |
| AC1 | concurrent publishers with distinct candidates |
| AC2 | edit and inode-swap hooks before revalidation |
| AC3 | initial and swapped symlink/non-regular targets |
| AC4 | live owner timeout; killed owner reclaim |
| AC5 | old/new/backup digest assertions |
| AC6 | TERM cleanup and foreign-lock preservation |
| AC7 | OS-labelled focused gate |

## Gate Commands

- Quick/Full: `bash scripts/tests/test-installer-env-race-safety.sh`
- Build: `bash scripts/tests/test-installer-env-race-safety.sh && bash scripts/tests/test-setup-wizard-db-selection.sh && bash -n scripts/setup-local-first.sh`
