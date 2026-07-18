# 007 — Audit-Log Attribution for Destructive Ops (M8)

## Goal
Record destructive operations (who / when / what / scope / result) in an
`operation_log` table so every delete/purge entry point has an audit trail.
Today `reset_project` and other destructive routes mutate with no attribution.

## Scope (Wave 2 — M8)
- Additive + reversible migration: `operation_log` table.
- `OperationLogRepository` (pg, raw SQL) + `recordOperation` helper.
- Fail-safe: a logging failure MUST NOT break the destructive op.
- Actor seam: `ActorContext` derived from the API key today, stable
  interface so richer identity plugs in later without rewriting call sites.
- Wire `reset_project` (primary) — op="project_reset" with scope/counts/result.
- Tests: fail-safe (DB-free, always runs) + PG round-trip (gated) +
  reset_project calls recordOperation (mocked repo).

## Out of scope (follow-up)
- Wiring the remaining destructive sites (memory purge by id, keyword
  truncate, symbol workspace delete at the repo layer, graph-generation
  nuke). reset_project already covers the user-facing path; the per-repo
  methods are reachable only through reset_project today, so wiring them
  individually is a defensive follow-up, not required for attribution.
- A read/admin UI for operation_log (list endpoint exists on the repo; no
  HTTP surface yet).
- User/JWT identity — seam is in place; swapping `deriveActor` is the work.

## Constraints
- Additive + reversible migration only. No backfill. No existing column changes.
- Best-effort logging: NEVER block or break a destructive op.
- Match existing migration naming + raw-SQL convention (single `migration.sql`).
