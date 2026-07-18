# M40 — Pinned-Memory Invariant + Fail-Closed Proposal Validation

Intent: the auto-improve apply path (`applyProposal`, reached via `approve()`)
must NEVER rewrite a pinned memory, and must FAIL CLOSED (not silently coerce)
on unreadable/missing targets and malformed proposal payloads. Today
`applyProposal` mutates target memories via `memoryRepo.update` with NO pinned
check, and auto-approve is on by default — so a background job can silently
overwrite a user-immutable pinned memory. Consolidation already honors `pinned`
(the reference correct pattern); auto-improve did not. Mirrors the improvement
over ai-memory's `unwrap_or(false)`, which defaulted past malformed inputs.

## Acceptance

- `MemoryApplySeam` gains a read seam `getById(id): MemoryRow | null | Promise<…>`
  so `applyProposal` can inspect the target before mutating. Default lazy seam
  wires it to `getMemoryRepository().getById(id)`.
- `applyProposal` `memory.update` / `memory.tag` branches read the target row
  BEFORE any `update()` call:
  - missing/unreadable target → throw `ApplyRejection("unreadable_target")`,
    NO mutation (fail-closed, not silent coerce).
  - pinned target → throw `ApplyRejection("pinned")`, NO mutation. Pinned
    truthy check is identical to `decay.ts`: `pinned === 1 || pinned === true`
    (cast through `unknown` to keep both comparison arms without TS narrowing).
  - unpinned + readable → apply as before (behavior-preserving).
- `approve()` surfaces `ApplyRejection.reason` verbatim (`pinned` /
  `unreadable_target` / `malformed-payload`); non-ApplyRejection throws still
  collapse to `apply-failed`. `ApproveRejectResult.reason` stays a free string
  (no literal union to extend).
- Payload hardening (fail-closed, not silent default): a PRESENT-but-invalid
  required field is rejected; a genuinely-optional-absent field keeps its
  default. Covers `memory.create` `type` (must be a valid `MemoryType` enum
  value), `importance` (number ∈ [0,1]), `tags` (string[]); and the
  `memory.update` patch builder rejects the same invalid shapes.
- `memory.tag` with a non-array `tags` payload is rejected `malformed-payload`.
- DB-free deterministic tests for all branches (pinned / unreadable / readable /
  malformed) with a fake memoryRepo exposing `getById`/`update`/`insert`.

## Out of scope (explicit)

- Pinnable auto-create: `memory.create` is a fresh row with `pinned: false` —
  the invariant only constrains rewriting EXISTING targets, so create needs no
  pinned read. (Validated fail-closed on bad payload, though.)
- Extending `ApproveRejectResult.reason` to a string-literal union: callers
  treat it as a free string; adding literals would be a wider API change.
- PG-backed integration coverage: the existing auto-improve tests that hit the
  real LLM surface (`P5-DETECT-01`, `P5-AUTOAPPROVE-01`) are env-flaky and out
  of scope; the M40 invariant is fully covered DB-free.
