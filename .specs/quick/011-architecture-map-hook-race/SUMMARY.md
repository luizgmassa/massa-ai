# Quick 011 — Summary

**Result**: Done. `architecture-map.test.ts` and `trace-path.test.ts` hooks now
await `clearProject` — the only `DELETE FROM workspaces` writer in the call
graph — instead of firing it as a floating promise from sync arrow hooks. The
floating DELETE was landing between the next case's workspace upsert and
`begin()`'s `lockWorkspace` SELECT on loaded Coverage runners
(`graph_generation_workspace_missing:p4d4-arch-map`, run 31193777485, twice).

- Mechanism verified first-hand: code reads of the hook shape, the DELETE, and
  `lockWorkspace`; raw CI attempt-1 log timeline; a demo pair proving bun runs
  the body while a sync hook's floating promise is pending and awaits an async
  hook.
- The fix also revives the hooks' previously-dead `try/catch` (best-effort
  semantics restored).
- Gate: architecture-map ×15 green / zero workspace_missing; trace-path green
  (one unrelated pre-existing cold-path stall documented in TASK.md); core
  build + lint exit 0. No committed regression test — a timing sensor would be
  nondeterministic; reasoning recorded in TASK.md.
- CHANGELOG: `### Fixed` entry under `[Unreleased]` (patch bump).
