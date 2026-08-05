# Root-Cause Proof Scripts

Use the moment an implementation or fix stops converging. It is a
circuit breaker, not a diagnosis method: it fires mid-implementation in any
workflow — `feature`, `debug`, `refactor`, `spec-driven`, any `*-fix` — including
the ones that never opened a reproduction loop.

`references/debug-diagnosis-loop.md` is where a `debug` investigation *starts*.
This file is where any implementation *stops guessing*.

## Principle

An agent that has failed twice on the same symptom does not have a code-reading
problem — it has a data problem. Reading the same source a third time produces a
third theory with the same evidence base as the first two. The only way out is
to make the program tell you what it is actually doing.

## Trigger

The circuit breaks when **any** of these holds:

1. **Two consecutive failed fix attempts** against the same symptom. Attempt
   three does not begin until a probe has run.
2. A hypothesis already ruled out is being re-tested without new evidence.
3. Three or more edits have been made to the same file without the symptom
   changing.
4. The explanation for the failure has changed twice while the observed failure
   has not changed at all.

Two is the threshold, not three. The second failure is where the cost of a probe
first drops below the cost of another guess.

## Forbidden Next Actions

Once the circuit breaks, these do **not** count as progress and must not be the
next action:

- Reading more source files, or re-reading a file already read this session.
- Reasoning about what the code "should" do.
- Another speculative edit "to see if it helps".
- Adding a defensive guard, try/catch, or null check that hides the symptom.
- Asking the user what is wrong before producing any observation.
- Rerunning the identical failing command with no added instrumentation.

## Required Next Action — Build The Probe

Write and run an executable artifact that emits **real runtime data** from the
failing path. Acceptable forms, cheapest first:

| Form | Use when |
| --- | --- |
| A failing test at the suspected seam | The seam is reachable from the existing test harness |
| A standalone script (`bun`/`node`/`python`/shell) | The path needs setup the test harness does not provide |
| Instrumented run with structured logging at the divergence point | The failure only reproduces in the full system |
| A one-shot query against the real data store | The hypothesis is about persisted state, not control flow |
| Recorded request/response or device trace | The boundary is a network or platform call |

### Probe contract

A probe is valid only if all of these hold:

1. **Deterministic** — same input, same output, runnable twice with the same result.
2. **Observational** — prints the *observed* value beside the *expected* value.
   "It printed something" is not an observation; the comparison is.
3. **Signalling** — exits non-zero (or fails) while the bug is present.
4. **Narrow** — probes exactly one hypothesis. A probe that answers three
   questions answers none of them cleanly.
5. **Non-destructive** — never mutates production data or shared state. Scratch
   paths, temp databases, and fixtures only.
6. **Disposable or promoted** — either delete it when the bug is closed, or
   promote it into a real regression test under
   `references/code-annotation.md`. Do not leave orphan scripts in the tree.

Record the probe's output as evidence. The output — not the reasoning about it —
is what closes the hypothesis.

## After The Probe

| Probe result | Next action |
| --- | --- |
| Confirms the hypothesis | Fix the divergence point the probe located, then rerun the probe to prove the fix |
| Refutes the hypothesis | Record it as ruled out with the observed data, and probe the next-ranked hypothesis |
| Inconclusive | Narrow the probe. An inconclusive probe was too broad, not the wrong idea |
| Cannot be built | Stop. Report `Blocked`, name the specific obstacle (no test seam, no access, no reproduction), and ask for direction. Do not resume guessing |

## Escalation

If two probes both come back inconclusive, the problem is scoped wrong, not
understood wrong. Stop, report what the probes did observe, and re-scope with the
user before writing a third.

## Delegation Note

A subagent dispatched to implement or fix inherits this contract. Its capability
packet states the trigger and the probe requirement, and its report must include
either "no circling" or the probe output that broke the loop. A subagent that
returns a third theory with no runtime data has not completed its task.
