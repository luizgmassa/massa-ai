# Lessons

Use when loading confirmed project lessons during startup, or recording grounded reusable failures after verification, across any workflow that produces verifiable outcomes.

## Artifacts

- `.specs/lessons.json` — canonical machine-owned lesson state, the single lessons store. Read it; do not hand-edit.
- `skills/massa-ai/scripts/lessons.ts` — deterministic bookkeeping script; `lessons list` is the on-demand view.

## Lesson Signal Table

| Signal | Use When | Do Not Use For |
|---|---|---|
| `ac_gap` | Acceptance criterion was too vague, missing, or not testable. | One-off user clarification already captured in a spec. |
| `surviving_mutant` | A discrimination sensor or mutation-style check survived. | A mutation could not run for environmental reasons. |
| `spec_precision_gap` | Validation could not identify the exact expected value or state. | Implementation bug with a precise existing criterion. |
| `spec_deviation` | Implementation intentionally diverged from approved spec and needs future prevention. | Unapproved scope expansion that should be reverted now. |
| `gate_fail` | A deterministic gate failed because the workflow missed a reusable convention. | Transient tool, network, credential, or sandbox failure. |

## Capture

After a workflow's verification step finds a concrete reusable signal, record it:

```bash
bun skills/massa-ai/scripts/lessons.ts --root . add \
  --feature "<feature-slug>" \
  --signal "<ac_gap|surviving_mutant|spec_precision_gap|spec_deviation|gate_fail>" \
  --source "<validation.md source, AC id, file:line, mutant id, or SPEC_DEVIATION ref>" \
  --text "<one terse reusable lesson>" \
  --scope "<optional path/layer/tag>" \
  --project "<projectId>" --session "<workflowSessionId>" \
  --workflow "<active workflow type>" --entity "<entity>"
```

`--project`/`--session`/`--workflow`/`--entity` carry the active massa-ai
context onto the lesson so the file store and massa-ai memory stay in the same
recall namespace. They are optional for manual runs but supplied by the
continuous-learning hook loop.

Do not record one-off tool failures, transient environment issues, methodology opinions, or chat summaries as lessons.

## Distill

The script owns IDs, recurrence, candidate promotion, pruning, quarantine, and rendering. Lessons promote only after repeated distinct-feature evidence (default: 2 distinct features). A clean `Pass` with no signal records nothing.

Run this self-check after verification: if a failed acceptance criterion, surviving mutant, spec-precision gap, `SPEC_DEVIATION`, or gate failure was found but no lesson was recorded, state the skipped reason.

## Loading

During startup of any applicable workflow, load confirmed lessons when `.specs/lessons.json` exists:

```bash
bun skills/massa-ai/scripts/lessons.ts --root . list --status confirmed [--scope <relevant>]
```

- Use `--scope` or `--query` to keep the loaded set small.
- Do not load `candidate` or `quarantined` lessons as guidance.
- Keep lesson content compact; do not turn it into a parallel memory system.

## Promotion Lifecycle

| Status | Condition |
|---|---|
| `candidate` | Recorded once from one feature's verification |
| `confirmed` | Same normalized lesson seen across ≥`promote_threshold` (default 2) distinct features |
| `quarantined` | A confirmed lesson penalized ≥`quarantine_threshold` times (failed when applied) |
| **pruned** | A `candidate` that never recurred within `window_days` (default 45) |

## Trust Ramp and Quality-Metric Trend (Advisory)

Two additional append-only record kinds accumulate in `.specs/lessons.json` beside
lessons: reviewer-feedback records (`data.reviews`) and quality-metric snapshots
(`data.metrics`). Both are derived state — `lessons.ts` computes streaks, trusted
flags, and trend verdicts at read time from the event log; there is no cached
`streak`/`trusted` flag anywhere in the store, so there is no invalidation step,
and demotion is emergent: a `major` record simply caps the trailing streak window
the next time the log is read.

### Categories

A review category is a free-form kebab-case label supplied at record time (e.g.
`installer`, `admin-ui`) — the same convention as the existing `--scope` flag.
There is no fixed taxonomy; the label is whatever the recording agent or user
chooses.

### Feedback levels

- `none` — no reviewer feedback; extends the category's streak.
- `minor` — a small correction; also extends the streak.
- `major` — resets the category's streak to 0 and demotes a trusted category
  back to untrusted.

### Trust threshold

`trust_threshold` (default 30) is the number of consecutive `none`/`minor`
records a category needs before `trust status` marks it `trusted`. The
comparison is `>=`: a streak sitting exactly at the threshold is trusted.

### Advisory-only scope

Trust status governs reading depth only — how closely a human scrutinizes a
diff before approving it. It never governs, gates, or substitutes for per-PR
merge approval: `references/implementation-delivery.md`'s "Approval for one PR
does not carry to the next" clause is unaffected by any trust state.

### Commands

```bash
bun skills/massa-ai/scripts/lessons.ts --root . review add --category <kebab> --feedback none|minor|major --source <ref>
bun skills/massa-ai/scripts/lessons.ts --root . trust status [--category <kebab>]
bun skills/massa-ai/scripts/lessons.ts --root . metrics add --feature <slug> --result PASS|FAIL --fix-iterations <n> --surviving-mutants <n> --acs-total <n> --acs-covered <n>
bun skills/massa-ai/scripts/lessons.ts --root . metrics trend
```

`trust status` with no `--category` lists every category with its streak,
total review count, and trusted state; an empty store reports
`(no review records)`, exit 0. `metrics trend` prints every snapshot
oldest-first followed by `trend: improving|stable|degrading`, or
`trend: insufficient data` when fewer than two snapshots exist — both exit 0.

## No-Script Fallback

If `lessons.ts` is unavailable or cannot run, record `Lessons: skipped - script unavailable` in the validation report or evidence gate, keep the raw signal in the report, and do not hand-edit `lessons.json`. A future run with the script can import the validated signal.

## Continuous-Learning Loop (hook-fed)

The lessons layer is a closed loop, not manual-only. Two runtime hooks
(`apps/claude-plugin/hooks/`, installed for Claude Code by the plugin installer) feed it:

1. **observe** — `observe_runner.py` (PostToolUse) captures raw tool-use
   observations into the gitignored `.specs/observations.json` buffer. Grounding
   is NOT assigned here.
2. **evaluate** — `continuous_learning_evaluate.py` (Stop) reads the active
   massa-ai context from `.specs/project/STATE.md` and the observations
   buffer. For each observation that already carries grounded fields
   (`signal`, `text`, `source`, `feature`), it calls `lessons.ts add` with the
   `--project`/`--session`/`--workflow`/`--entity` context. Ungrounded
   observations are left in the buffer for agent input and logged as skipped.

### massa-ai Dual-Write

`lessons.ts add` and `import` best-effort write massa-ai memory so the file store
and durable memory stay consistent:

- **type** is always `pattern` (lessons are procedural knowledge). `procedural`
  is a **tag**, never a type (references/mcp-tools.md).
- **tags** carry the full massa-ai persistence contract: `project:<id>`,
  `session:<workflowSessionId>`, `workflow:<type>`, `entity:<name>`,
  `memory:procedural`. This puts lessons in the same recall namespace as
  massa-ai decisions/patterns, so future `recall` surfaces them at
  Specify/Design.
- massa-ai MCP is agent-side only; the hook/CLI subprocess writes via REST
  (`MASSA_AI_API_URL`). When REST is unavailable, the lesson still lands in
  `lessons.json` and the skipped memory write is logged (graceful degradation).

### Round-Trip

```bash
bun skills/massa-ai/scripts/lessons.ts --root . export --out lessons.export.json
bun skills/massa-ai/scripts/lessons.ts --root . import --in lessons.export.json
```

`export`/`import` round-trip the file store; `import` re-emits massa-ai memory
best-effort. An ungrounded lesson is refused by both `add` and the massa-ai write.

### Self-Check

After verification: if a reusable signal was found but no lesson was recorded,
state the skipped reason. Nothing else records it — the hook loop keeps no skip
log on disk, so your stated reason is the only record.
