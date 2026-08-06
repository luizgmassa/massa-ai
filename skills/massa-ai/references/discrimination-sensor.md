# Discrimination Sensor

Use when a workflow must prove its validation can actually detect wrong behavior — the empirical guarantee that tests discriminate, not merely pass. The sensor injects behavior-level faults in an isolated scratch state and confirms the covering tests kill them. The real working tree is never modified.

## Mutation Target

The mutation target is always **the code under the claim being verified** — a correctness requirement, not a style choice:

| Claim being verified | What to mutate |
|---|---|
| New behavior matches spec/ACs (spec-driven, feature) | The new code introduced by the change |
| Behavior preservation (refactor, code-quality) | The *moved or transformed* code — the pre-existing behavior the characterization tests must protect, not new code |
| A guard blocks the exploit (security) | The specific guard just added — invert it and confirm the negative test kills it |
| A new or repaired test catches its bug (tests family) | The new/repaired test's subject code |

## How It Works

1. **Prepare an isolated scratch.** Never mutate the real worktree. Choose one:
   - Preferred: a temporary git worktree (`git worktree add <scratch-path> HEAD`), mutate and run tests there, then `git worktree remove --force <scratch-path>`. Name the scratch `<worktree>-sensor-<finding-id>` (or `<worktree>-sensor-<slug>`) so it never collides with the delivery worktree.
   - Fallback (no git / worktree unavailable): copy only the affected file(s) to a temp directory, mutate the copies, point the test runner at those copies (or restore originals from the copies' backups), then delete the temp directory.
   - **Forbidden:** `git stash` / `git stash pop`. A stash records state *before* the mutation; popping it does not reverse a mutation applied afterward, and on a clean tree `git stash` creates no entry at all — so the fault is left in the real worktree.
2. **Capture a baseline.** Record `git status --porcelain` (or equivalent) of the real worktree *before* any sensor work. It must be unchanged after cleanup.
3. **Inject a behavior-level fault** into the scratch copy of the target code. Choose a mutation proportional to the code's risk:
   - Flip a boolean condition (`if (x)` → `if (!x)`, `>` → `>=`)
   - Change a return value (return a wrong status code, wrong field, zero instead of a computed value)
   - Off-by-one (shift a loop bound, change a slice index)
   - Remove a required side effect (delete a method call that the spec requires)
4. **Run the tests** that cover the mutated code (against the scratch), using the workflow's gate command.
5. **Confirm the mutant is killed** (tests FAIL). Discard the scratch (remove worktree or delete temp copies).
6. **Verify isolation.** Re-run `git status --porcelain` on the real worktree and confirm it matches the baseline from step 2. If it differs, STOP — restore the real tree before continuing, and treat the sensor run as invalid.
7. **If a mutant survives** (tests still pass after the fault), the tests are not discriminating for that behavior. Consequence by workflow family: spec-driven/feature create a **fix task** to strengthen the assertion; fix workflows record the finding's closure row as **`blocked`** (unproven verification) and emit the `surviving_mutant` lessons signal.

## Tiering (proportional, not optional)

| Context | Sensor depth |
| ------- | ------------ |
| Default | Lightweight fault-injection: 1–3 targeted behavior-level mutations, focused on the highest-risk target code |
| P0 / critical paths (payment, auth, data integrity) | Full mutation run: use language-appropriate mutation tooling if available (e.g., Stryker, mutmut, cargo-mutants, pitest); otherwise increase the number of manual fault-injection mutations to ≥5 covering all branches |

**Stack-agnostic:** the sensor targets behavior-level semantics (what the code does), not a specific tool. Any language, any framework.

**Report:** record killed/survived for each mutation attempt, plus the sensor depth used. If a safe reversible mutant cannot be made, record why and mark the claim `Blocked` unless equivalent existing deterministic mutation evidence proves discrimination.
