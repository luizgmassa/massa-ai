# M40 — Summary

## Changed files

- `packages/core/src/services/jobs/auto-improve-job.ts`
  - `MemoryApplySeam` + default lazy seam: added `getById` read seam.
  - `applyProposal`: `memory.update` / `memory.tag` now read the target via
    `readTargetForApply` BEFORE any mutation; pinned / unreadable targets throw
    `ApplyRejection`; `memory.create` payload + the update-patch builder are
    validated fail-closed.
  - `approve()`: surfaces `ApplyRejection.reason` verbatim.
  - New module-level exports: `ApplyRejection`, `ApplyRejectionReason`.
  - New module-level helpers: `validateCreatePayload`, `buildUpdatePatch`.
- `packages/core/src/__tests__/auto-improve-pinned-invariant.test.ts` (new)
  - 10 DB-free tests covering pinned / unreadable / readable / malformed.

## Pinned truthy check used

Identical to `decay.ts` (`packages/core/src/services/memory/decay.ts:76`):

```ts
const pinned = row.pinned as unknown as number | boolean;
if (pinned === 1 || pinned === true) { /* reject */ }
```

`MemoryRow.pinned` is typed `number`, so the value is cast through `unknown`
to the `number | boolean` union `DecayMemory` uses; the runtime comparison is
byte-identical to decay's exemption.

## Proposal-field validation changes

| Field | Before | After |
|---|---|---|
| `memory.create` `type` | `(p.type as MemoryType) ?? PATTERN` (silent coerce) | present-but-not-a-valid-enum -> reject `malformed-payload`; absent -> `PATTERN` default kept |
| `memory.create` `importance` | `typeof === "number" ? : 0.7` | present-but-not-finite-in-[0,1] -> reject; absent -> `0.7` default kept |
| `memory.create` `tags` | `Array.isArray ? : ["auto-improve"]` | present-but-not-string[] -> reject; absent -> default kept |
| `memory.update` patch | built with per-field `typeof` guards (silent skip on bad shape) | present-but-invalid field -> reject `malformed-payload`; absent -> skipped (behavior-preserving) |
| `memory.tag` `tags` | `Array.isArray ? : []` (silent empty) | non-array -> reject `malformed-payload`; empty-array still allowed |

Genuinely-optional-absent fields keep their defaults (behavior-preserving for
the common well-formed case).

## Gate evidence

- `bunx tsc --noEmit` (packages/core): clean (EXIT=0).
- `bun test src/__tests__/auto-improve-pinned-invariant.test.ts`: **10 pass /
  0 fail** in 63ms (no network / no DB).
- `bun test src/__tests__/auto-improve-job.test.ts`: **21 pass / 2 fail** --
  both failures are PRE-EXISTING and env-flaky (they hit the real default LLM
  surface when no `llm` is injected, asserting `source === "rule-based"` but
  receiving `"llm"` when the network responds). Confirmed identical failures
  on `git stash` (pristine) for `P5-AUTOAPPROVE-01`; `P5-DETECT-01` flakes
  between timeout and pass on pristine. NOT caused by this change; NOT in
  scope for M40.

## Residual risk

- `ApproveRejectResult.reason` remains a free string (no literal union). New
  reasons (`pinned`, `unreadable_target`, `malformed-payload`) are additive;
  consumers that pattern-match on `reason` should be audited if they default
  to "treat unknown reason as retry-able" -- a pinned rejection must NOT be
  retried. (Current callers log + skip; no retry observed.)
- The read-then-write window in `memory.update` / `memory.tag` is unchanged
  (best-effort, mirrors bootstrap/handoff); a concurrent pin between read and
  write is not re-checked. Accepted -- same contention posture as the existing
  tag-merge comment in the original code.
- `memory.create` still uses silent defaults for absent optionals; only
  PRESENT-but-invalid fields are rejected. This is the intended fail-closed
  posture (default legitimate optionality, reject malformed).
