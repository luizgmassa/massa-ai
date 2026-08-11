# Sub-Agent Delegation

Use during Execute when formal task planning has more than 3 tasks, when the user explicitly asks for delegation, or when final validation needs an independent verifier. Full mechanics for phase-batch workers and the Verifier sub-agent used during Execute.

## Phase-Batch Workers

**Two layers — keep them distinct:**

- **Phase** = the semantic / dependency unit (Foundation → Core → Integration), authored during Tasks. Indivisible.
- **Batch** = the execution / logistics unit — one or more *consecutive whole phases* assigned to a single worker.

Conflating the two (one worker per phase) is what fragments execution: a feature's dependency-layer count has nothing to do with the ideal per-worker workload. Batching by task budget separates the two concerns without breaking phases.

**Trigger:** Count total tasks across all phases. If the feature has **more than 3 tasks**, offer the user phase-batch sub-agents before starting Execute — under the **max 3 tasks per worker, ideal 2** budget, a triggered feature always packs into at least two workers, so the offer is never for a single batch. If the feature has 3 or fewer tasks, execute inline in the main window — no sub-agents spawned, no offer made.

**Batching algorithm (task budget: max 3 tasks per worker, ideal 2, phase-aligned):**

Pack whole phases into that budget, greedily, in phase order:

1. Count total tasks `T`.
2. If `T ≤ 3` → inline, no sub-agents, no offer.
3. Otherwise offer sub-agents and walk phases **in order**, accumulating whole phases into the current batch. When adding the next phase would push the batch's running task count above 3 **and** phases remain, close the batch and start the next with that phase.
4. **Never split a phase** across workers — the cut only ever lands on a phase boundary. This preserves dependency ordering and keeps a phase's tasks + shared context in one worker.
5. A trailing batch under budget is expected and correct — it is not folded into the previous batch when that would push the previous batch over 3.

Result: at least `ceil(T / 3)` workers, ~`T / 2` typical once phases are sized to the ideal of 2. Unevenness is absorbed by greedy packing — phases never need to divide evenly. Example: 20 tasks → roughly 7–10 workers, depending on phase sizes. Worked examples:

- Phases `[2,2,3]` → `{P1=2}, {P2=2}, {P3=3}` = **3 workers** (no neighbor has budget room left to combine into)
- Phases `[3,3,3,3]` → `{P1=3}, {P2=3}, {P3=3}, {P4=3}` = **4 workers** (every phase already sits at the budget)
- Phases `[1,2,2]` → `{P1+P2=3}, {P3=2}` = **2 workers** (small phases combine up to the budget)

A phase larger than 3 tasks is a Tasks-authoring defect — split it during Tasks, never at dispatch time.

**Offer-then-confirm (never auto-spawn):**

> "This feature has [T] tasks across [N] phases. I can pack them into [K] sub-agents (2–3 tasks each, whole phases per worker) — every worker runs its phases in order, reports a compact summary, and the orchestrator advances to the next batch. This keeps the main window lean without over-fragmenting. Want to proceed that way?"

The user must explicitly accept. If they decline, execute inline instead of dispatching sub-agents.

**Execution model — one worker per task-budgeted batch, sequential:**

```
Phase 1 (3 tasks)  ──→ Batch Worker 1 ──→ compact summary ──→ orchestrator updates tasks.md
Phase 2 (2 tasks)  ──→ Batch Worker 2 ──→ compact summary ──→ orchestrator updates tasks.md
Phase 3 (3 tasks)  ──→ Batch Worker 3 ──→ compact summary ──→ orchestrator updates tasks.md
...
```

Batches run strictly sequentially: a batch never starts until the previous batch's summary shows all its tasks complete.

**What a batch worker receives:**

- The task definitions for **every** phase in its batch (from `.specs/features/<slug>/tasks.md`)
- The Test Coverage Matrix and Gate Check Commands (from `.specs/features/<slug>/tasks.md`)
- `references/spec-driven/coding-principles.md`
- Relevant `spec.md`, `context.md`, and `design.md` sections for the feature (not all specs)

This worker payload is a specialization of the canonical Capability Packet in
`references/agent-orchestration.md`: the task definitions and spec/design sections are
its `scope` + `inputs`, the Gate Check Commands are its `sensors`, the structured
return contract below is its `output`, and write permission is scoped to the batch's
disjoint task files. Workers inherit nothing from the parent session — every needed
reference is listed above by path. Inside a worker, repository-wide git operations
(`git stash`, shared-state `git checkout`/`switch`, `git reset`, `git clean`) are
prohibited; the only git surface a worker touches is the defined task cycle's atomic
commits in the feature worktree.

**What a batch worker does:**

Executes ALL tasks in its assigned batch **in order** — finishing every task in one phase before starting the next phase in the batch — following the `references/spec-driven/execute.md` cycle for each task (implement → gate → atomic commit). After completing all tasks in the batch, the worker reports a **compact summary** to the orchestrator using the structured return contract:

```
Batch (phases [N]–[M]) return:
- Status: Complete | Blocked | Partial
- Tasks done: [list with commit hashes]
- Tests: [N passed, 0 failed]
- SPEC_DEVIATION: [none | <task-id>: <what diverged from spec/tasks.md and why>]
```

**Return contract fields:**

- **Status** — `Complete` (all batch tasks done, gate green), `Blocked` (a task could not proceed; worker stopped), or `Partial` (some tasks done, remaining tasks deferred with reason). The orchestrator advances only on `Complete`.
- **SPEC_DEVIATION** — any divergence from the approved `spec.md`/`tasks.md`: a skipped test, a changed interface, an added dependency, an out-of-scope edit. `none` is the only silent value; every real deviation is named with its task id and reason so the orchestrator can decide accept/fix/escalate before the next batch.

No raw logs, no full test output — only the above fields keep the main context clean.

**Sequential execution:** Batch workers execute their tasks themselves. Execution is strictly sequential within and across batches — there is no intra-phase or intra-batch parallelism.

**Orchestrator context discipline:** the orchestrator consumes only the compact
summary above. It must never read a worker's transcript, JSONL, or intermediate
reasoning, and must never poll a running worker for status — the summary at batch
completion is the only channel back (see `references/agent-orchestration.md`,
Orchestrator Working Memory).

## Delegation Activity Table

The batching trigger above governs **when** batch workers are offered. This table governs **what** may be delegated at all. Delegation is activity-scoped, not blanket.

| Activity | Delegate? | Notes |
| --- | --- | --- |
| Research / codebase investigation | Yes | Read-only gatherer; returns compact findings, never decisions |
| Implementation of an approved task | Yes (batch worker) | Task + gate already defined in `tasks.md`; worker executes the defined cycle |
| Planning (Specify / Design / Tasks authoring) | **Do not delegate** | Planning owns the contract; delegation fragments accountability |
| Task creation / task-list authoring | **Do not delegate** | The orchestrator owns `tasks.md` integrity and ordering |
| Validation (Verifier role) | **Do not delegate to a batch worker** | Use the dedicated Verifier sub-agent; author ≠ verifier is the gate's trust basis |

Delegated work returns through the compact summary contract above. Planning, task-creation, and validation never enter that return path — they stay with the orchestrator or the dedicated Verifier.

**The orchestrating agent's role during Execute:**

1. Count total tasks and pack phases into task-budgeted batches (max 3 tasks each, ideal 2) — offer batch sub-agents and wait for the user to accept
2. Dispatch the next batch to a worker (or execute inline if not using sub-agents)
3. Receive the compact summary
4. Update `.specs/features/<slug>/tasks.md` with results
5. If all tasks in the summary show complete: dispatch the next batch
6. If a task failed: the worker has already stopped; decide fix/escalate before dispatching the next batch

**Failure handling:** If a task in a batch fails (gate does not pass, blocker hit), the worker stops and includes the failure in its summary. The next batch does not start until the current batch's summary shows all tasks complete. The orchestrator decides: fix and re-run, or escalate to the user.

**Context sizing signal:** If a batch's task list would likely push the worker's context beyond ~40k tokens, close the batch at an earlier phase boundary (fewer phases per worker). If a *single* phase alone would blow the budget, that phase is too coarse — split it during Tasks per the granularity guidance in `references/spec-driven/tasks.md`.

---

## Verifier Sub-Agent

**Always-on, never prompted — one per feature completion.** The Verifier is a separate role from the batch worker. It runs once — after the last task of the feature is committed — as an independent quality gate, dispatched automatically by the orchestrator. It is **not** gated behind the batching offer; it always runs. Do NOT ask the user whether to run validation; it is mandatory.

**Author ≠ verifier:** The agent (or batch worker) that wrote the code and tests is the author. The Verifier is a fresh sub-agent dispatched by the orchestrator after the final commit. It does not inherit the author's context, mental model, or assumptions. This separation is what makes the gate trustworthy.

**What the Verifier receives:**

- `spec.md` for the feature (ACs = source of truth)
- The git diff surface for the feature (scoped to the feature branch or commit range)
- The test files in scope
- `references/spec-driven/validate.md` as its operating checklist

This payload is a specialization of the canonical Capability Packet
(`references/agent-orchestration.md`): spec + diff + tests are its `scope`/`inputs`,
`validate.md` is its `sensors` source, the compact verdict + `validation.md` report
below are its dual-channel `output`, and `permissions` are read-only outside the
scratch sensor state.

**What the Verifier does (full process in `validate.md`):**

1. **Spec-anchored coverage check** — re-derives coverage evidence-or-zero: every AC traced to `file:line` + assertion expression. For each covered criterion, confirms the test's asserted value matches the **spec-defined expected outcome** (not just that an assertion exists). Where the spec does not define a precise outcome, flags a **spec-precision gap** rather than passing silently.
2. **Discrimination sensor** — injects a small behavior-level fault (flip a condition, change a return value, off-by-one, remove a required side effect) in an **isolated scratch** (temporary `git worktree` or temp file copies — never `git stash`), runs the relevant tests there, confirms they FAIL (kill the mutant), discards the scratch, and verifies the real worktree's `git status --porcelain` matches the pre-sensor baseline. Tiered by risk: lightweight (1–3 mutations) for standard features; expanded (≥5 mutations or full mutation tooling) for P0/critical paths. Surviving mutants become fix tasks.
3. Applies the **payload/conjunction rule**: checks payload fields are asserted on value/state, not just that the call occurred.
4. **Writes the persisted report** to `.specs/features/<slug>/validation.md` — PASS/FAIL, per-AC evidence (`file:line` + assertion + spec outcome), sensor result (killed/survived per mutation), gate exit results, diff/commit range.
5. **Returns a compact verdict in chat** to the orchestrator.
6. Does **NOT** write, modify, or fix any code or tests — the real working tree is never mutated (sensor mutations run in scratch state only).

**What the Verifier reports back (compact chat format):**

```
## Validation: [feature name] — [PASS ✅ | FAIL ❌]

**Spec-anchored check**: [N/N ACs matched spec outcome | M spec-precision gaps flagged]
**Gate**: [X passed, 0 failed]
**Sensor**: [N mutations injected, N killed, N survived]
**Report**: `.specs/features/<slug>/validation.md`

**Ranked gaps** (if FAIL):
1. [Gap description] — [AC or criterion] — [file:line or "no evidence"]
2. ...
```

**Failure handling:** The orchestrator routes the ranked gaps to an implementer as fix tasks, then re-dispatches the Verifier. This fix→re-verify loop is bounded to a maximum of **3 iterations**. If gaps remain after 3 iterations, escalate to the user.

---

## Standalone Fallback

When sub-agents are unavailable (a single agent executing the full feature), use the standalone fresh-eyes fallback: run `references/spec-driven/validate.md` as a standalone pass — clear implementation assumptions, re-read `spec.md` and the diff from scratch, apply evidence-or-zero, run the spec-anchored coverage check and discrimination sensor, and write `.specs/features/<slug>/validation.md`. **Deterministic backing (run it, do not eyeball it):** `bun skills/massa-ai/scripts/validate_state.ts <feature> [--root .]` confirms the report is a real PASS before the feature is marked done. If no code-execution tool is available, run the same checks by reading the artifact (graceful degradation preserved).

---

## Model Tier per Role

**Applies only if the harness can assign a model per sub-agent.** If it cannot, ignore this section and run everything on the default model — the workflow is correct either way. The point is to spend high-reasoning capacity where ambiguity and consequence are high, and a faster tier where the work is mechanical, instead of paying top-tier cost uniformly.

massa-ai resolves the actual model per agent through `metadata.model_tier` (`light` / `standard` / `deep`) in each sub-agent's charter (`skills/agents/<name>/SKILL.md`), combined with the host and the active profile in `skills/model-profiles.json` (see `CLAUDE.md` § Agent-harness surface). This section maps role/work characteristics onto that mechanism — it is not a separate free-floating table.

Judge the tier by the work in front of the role, not by the role's title:

| Role / work | Characteristic | Suggested tier |
| ----------- | -------------- | -------------- |
| Design phase | High ambiguity, hard-to-reverse structural decisions | `deep` |
| Batch worker — core-domain or high-ambiguity phase | Non-obvious logic, tricky edge cases, novel integration | `deep` |
| Batch worker — mechanical phase | Entities, DTOs, config, wiring, straightforward CRUD against a settled pattern | `light` / `standard` |
| Verifier | Adversarial reasoning: designs mutations, re-derives coverage, judges outcome precision | `deep` (always — per the Rules of thumb below) |
| Specify / Tasks authoring | Structured but judgment-heavy | `standard` / `deep` |
| Read-only specialist (audit-specialist, context-curator, furps-analyst, investigator, mobile-specialist, navigator, requirements-analyst, reviewer) | No write access — findings, investigation, or review quality is the entire deliverable, with no implementation pass downstream to catch a missed nuance | `deep` (always — per the Rules of thumb below) |
| Scoped writer (designer, documentation-agent, judge, test-engineer) | `permission: write`, narrowed by the charter's own Restrictions to one file class — UI-layer / doc / the agent's own report / test files — each with a disjoint write set. Not read-only, so the deep-tier rule below does **not** reach them | per the work, not per the permission |

**Rules of thumb:**

- When unsure, size up, not down. An under-powered worker on ambiguous logic produces gaps the Verifier then has to catch — more expensive than paying for reasoning once.
- **The Verifier always runs on the deepest tier** — per project rule, `skills/agents/verification-agent/SKILL.md` pins `metadata.model_tier: deep`, structurally, not just as advisory guidance here. A weak Verifier defeats the author ≠ verifier gate.
- **Read-only specialists always run on the deepest tier** — this generalizes the Verifier rule: every findings-only or investigation-only charter (`permission: read-only`) pins `metadata.model_tier: deep` structurally, because there is no later implementation pass to catch what a weaker read-only pass missed.
- Set the tier per batch, from that batch's phases. A feature can mix tiers across batches.
- Outside the Verifier's and read-only specialists' structural pins, this table is advisory metadata only — no gate, commit, or verification step depends on it.
