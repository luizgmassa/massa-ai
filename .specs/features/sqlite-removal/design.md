# PostgreSQL-Only Storage Design

## Approach

Centralize URL validation in shared configuration and invoke it at every startup/store boundary. Retain neutral interfaces and factory entry points while removing backend branching: each factory instantiates its existing `Pg*` implementation. Move any shared contracts out of SQLite-named modules before deleting those modules. Port raw SQL consumers to PostgreSQL parameterized queries and asynchronous calls.

Operational paths validate before invoking Prisma migrations, then report PostgreSQL connectivity, pgvector readiness, and redacted database metadata. Installer setup can provision native or Docker PostgreSQL only and must fail closed when it cannot supply a usable URL.

## Components

| Layer | Change |
| --- | --- |
| Configuration | `requirePostgresDatabaseUrl()` validates `DATABASE_URL`; remove alternate runtime variables. |
| Persistence | Neutral factories call Pg stores; contracts move to neutral modules; delete SQLite stores/caches/adapters/scripts after parity confirmation. |
| Runtime/API | Startup, entrypoint, health, system info/status, and E2E attest PostgreSQL/pgvector rather than local files. |
| Tooling | Required `pg` dependency, PostgreSQL CI service/migrations, installer native/docker only, documentation and tests updated. |

## Safety Decisions

- Validation precedes any API or store initialization, so failures do not create local fallback databases.
- Existing SQLite user files are neither imported nor deleted.
- Tests preserve domain-only checks with injected in-memory fakes; persistence behavior uses isolated PostgreSQL.
- Deletion of `packages/core/migrations` happens only after schema/migration inventory confirms active Pg coverage.

## Plan Challenge Revision

Full pre-mortem is pending independent critic feedback. Before deletion, execution must inventory import/export edges, prove every required Prisma model/index exists, and run a negative missing/non-PG URL startup/E2E sensor.

Artifact-store evidence: design created 2026-07-13.
