# PostgreSQL-Only Storage Tasks

## Coverage Matrix

| Task | Requirements | Scope | Gate |
| --- | --- | --- | --- |
| TASK-001 | SQLR-001, SQLR-002, SQLR-007 | configuration, dependency manifest/lockfile, installer and setup validation | targeted config/installer tests plus forbidden-env scan |
| TASK-002 | SQLR-003, SQLR-004 | core persistence factories, contracts, Pg implementations, SQLite deletions, PostgreSQL parity tests | core type-check and targeted PostgreSQL/in-memory tests |
| TASK-003 | SQLR-005, SQLR-006 | Docker, API health/system endpoints, CI, E2E attestation, scripts, docs | endpoint/E2E tests plus active-reference scan |
| TASK-004 | SQLR-001–007 | independent verification and discrimination sensors | isolated PostgreSQL migrations, build/type-check/tests/E2E/static scan |

## Dependencies

- TASK-001 provides mandatory URL behavior consumed by TASK-002 and TASK-003.
- TASK-002 and TASK-003 may proceed in parallel only with disjoint write sets.
- TASK-004 starts after all implementation tracks finish.

## Gate Commands

- `bun run type-check`
- `bun run build`
- `bun test`/workspace-targeted suites as supported by package scripts
- `docker compose -f docker-compose.test.yml up -d postgres`, Prisma migration deploy, PostgreSQL integration/E2E commands
- `rg` forbidden-token scan excluding `.specs/` and immutable Prisma migrations

## Execution Constraints

- No test weakening, skips, or deletion solely to pass a gate.
- Agents own disjoint write sets; only verifier runs cross-cutting checks.
- Atomic commits are attempted only after each task gate passes; no commits without user request if worktree provenance is uncertain.

Artifact-store evidence: task plan created 2026-07-13.
