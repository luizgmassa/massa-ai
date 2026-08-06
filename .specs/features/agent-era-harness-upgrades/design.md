# Agent-Era Harness Upgrades Design

**Spec**: `.specs/features/agent-era-harness-upgrades/spec.md`
**Status**: Draft

---

## Design Summary

Three delivery surfaces: (1) prose edits across 24 skills files replacing size-dogma with
agent-read-cost rationale, adding the five-gate error-class model to testing surfaces, and
wiring a `massa-ai-reviewer` dispatch block into all 14 implementing workflows; (2) an
additive extension of `skills/massa-ai/scripts/lessons.ts` with `review add` / `trust
status` / `metrics add` / `metrics trend` commands over two new append-only arrays in
`.specs/lessons.json`, streaks and verdicts derived on read; (3) discriminating tests — a
unit suite for the lessons.ts extension (mutation-verified) plus a content-sensor suite
asserting the load-bearing prose landed, both under `scripts/__tests__/` where
`bun run test:scripts` already reaches. Generated plugin bundles are regenerated, never
hand-edited (AD-016).

## Requirements Traceability

| Req | Component |
| --- | --------- |
| AEH-01 | Prose: `code-quality-audit.md` L87/L94 leads, `code-quality-fix.md` L51-52, `refactor.md` step 8 |
| AEH-02 | Prose: `coding-guidelines.md` new "File shape for agent readers" section; `code-quality-audit.md` static leads; framing note beside `architecture-deepening-lens.md` Rejected Framings |
| AEH-03 | lessons.ts `review add` + `trust status`; `references/lessons.md` policy section; `implementation-delivery.md` advisory line |
| AEH-04 | Prose: `tests-audit.md` variation sensor, `tests-fix.md` variation fix method, `test-engineer/SKILL.md` responsibility |
| AEH-05 | lessons.ts `metrics add` + `metrics trend`; `validate.md` recording instruction; `tests-audit.md` trend sensor |
| AEH-06 | Reviewer dispatch block template instantiated in 14 workflow files |
| AEH-07 | Prose: `feature.md` AC-capture step + AC-anchored verification step |
| AEH-08 | Prose: `audit-specialist/SKILL.md` lens table `tests` row; `tests-audit.md` dispatch lens |
| AEH-09 | Prose: `tests-audit.md` gate table; `test-engineer/SKILL.md` mission |
| AEH-10 | Tests: `scripts/__tests__/lessons-trust-metrics.test.ts`, `scripts/__tests__/agent-era-guidance-content.test.ts`; regeneration + parity gates |

## Current Codebase Evidence

- `skills/massa-ai/scripts/lessons.ts` (908 lines, read in full): schema-1 store
  `{schema, promote_threshold, window_days, quarantine_threshold, next_id, lessons[]}`;
  `load()` applies `pySetDefault` for legacy fields; `save()` writes via
  `pyJsonStringify`; flag parser `parseFlags` with `choices` validation; exit codes 0/2.
- `scripts/__tests__/pyts-golden.test.ts` pins Python-parity behavior of existing
  commands; `spec-driven-validators.test.ts` exercises validators.
- Dispatch-block format: `workflows/spec-driven.md:113-122` (verification-agent block) is
  the canonical shape; `agent-orchestration.md` referenced by it.
- Reviewer charter `skills/agents/reviewer/SKILL.md:3` already names the exact trigger
  ("after a builder completes a task and before the verification gate") — unwired today
  (grep over `workflows/` hits only `judge-with-debate.md`).
- Audit-specialist lens table (`skills/agents/audit-specialist/SKILL.md:35-38`) has 6
  lenses; `tests-audit.md:49` files coverage under `performance`.
- Anti-dogma guardrail that must survive: `architecture-deepening-lens.md:100-102`
  ("Depth is NOT a lines-of-code ratio"), KISS leads in both code-quality files.
- AD-016: bundles are generated on demand; `bun run generate:artifacts` is chained by
  `pretest:scripts`; no new consumer entry points are added by this feature.

## Approach (Large — explored, recommendation first)

**A. Derived state (recommended).** `review`/`metrics` records are append-only events;
streaks, trusted flags, and trend verdicts are computed at read time from the event log.
No cached state, no invalidation, demotion is emergent (a `major` record caps the streak
window). Chosen: fewest invariants, every AC testable as pure function of the log.

**B. Cached state on write.** Store `streak`/`trusted` per category, update on each
`review add`. Rejected: two sources for one fact (the registry-named defect class per
AD-015 rationale); demotion/reset becomes a write-path invariant needing its own tests.

**C. Separate trust.ts + trust.json.** Rejected by user decision (storage question).

## Components

### 1. lessons.ts extension

- **Purpose**: append-only review-feedback + metric-snapshot records with derived views.
- **Location**: `skills/massa-ai/scripts/lessons.ts` (same file — the script is the
  single owner of `.specs/lessons.json` mechanics).
- **Interfaces** (CLI, two-token subcommands following existing single-word dispatch):
  - `review add --category <kebab> --feedback none|minor|major --source <ref> [--project ...]` → appends `{category, feedback, source, recordedAt}` to `data.reviews`; prints `REVIEW <category> (streak=N, trusted=bool)`.
  - `trust status [--category <kebab>]` → per category: `<category>: streak=N/threshold total=M trusted=yes|no`; empty store → `(no review records)`, exit 0.
  - `metrics add --feature <slug> --result PASS|FAIL --fix-iterations <n> --surviving-mutants <n> --acs-total <n> --acs-covered <n>` → appends snapshot to `data.metrics`.
  - `metrics trend` → prints snapshots oldest-first + `trend: improving|stable|degrading`; <2 snapshots → `trend: insufficient data`, exit 0.
- **Data model** (additive; schema stays 1):

```typescript
interface ReviewRecord { category: string; feedback: "none" | "minor" | "major"; source: string; recordedAt: string; }
interface MetricSnapshot { feature: string; result: "PASS" | "FAIL"; fixLoopIterations: number; survivingMutants: number; acsTotal: number; acsCovered: number; recordedAt: string; }
// Store gains: trust_threshold: number (default 30), reviews?: ReviewRecord[], metrics?: MetricSnapshot[]
```

- **Derivations**: `streak(category)` = count of trailing `none|minor` records for that
  category (scan from newest until a `major`); `trusted` = `streak >= trust_threshold`.
  Trend score per snapshot = `(result==="FAIL"?100:0) + survivingMutants*10 +
  fixLoopIterations + (acsTotal-acsCovered)`; verdict compares last vs previous score
  (lower = better): `< improving`, `> degrading`, `=== stable`.
- **Golden-parity protection**: `load()` does NOT setdefault `reviews`/`metrics`/
  `trust_threshold`; a lazy `ensureRampFields(data)` runs only inside the four new
  commands. Legacy commands leave the store byte-identical to today — the pyts-golden
  suite must pass unmodified.
- **Reuses**: `parseFlags` (choices give AEH edge-case enum errors for free), `now()`,
  `save()`/`load()`, exit-code contract.

### 2. Reviewer dispatch block (template)

Instantiated per workflow with scope wording adapted (feature diff / fix diff / task diff):

```markdown
> **Dispatch: `massa-ai-reviewer`** (role: `reviewer`) — charter `skills/agents/reviewer/SKILL.md`
> - trigger: implementation complete, before the verification gate — never optional
> - scope: the change's diff surface and its task/AC context
> - permissions: read-only
> - inputs: diff, acceptance context, recalled code-quality conventions
> - sensors: bugs, regressions, missing edge cases, smells introduced by the diff
> - output: ranked findings, blocking vs advisory; blocking findings become fix items before verification runs
> - firewall: summarized findings only, never raw diff dumps
> - memory: suggest-only; main agent persists
> - fallback: if the subagent is unavailable, run a standalone fresh-eyes review against this output contract and record the skipped-delegation reason
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed
```

Plan Challenge (pre-mortem) finding: the `persona:` bullet is mandatory on every
dispatch block in `skills/` — `scripts/__tests__/skills-harness-integrity.test.ts`
("dispatch persona emission", 32/32 green pre-feature) fails any block without it.
That suite is a named Quick-gate command for T15–T17.

Placement per file: after the implementation step, before the verification/evidence-gate
step. 14 targets: `feature.md`, `spec-driven.md` (Execute step 6, before verification-
agent), `general.md`, `debug.md`, `refactor.md`, and the 9 `*-fix` workflows
(`bugs`, `code-quality`, `architecture`, `security`, `requirements`, `tests`,
`implementation`, `maestro`, `mobile-figma`). Existing verification gates untouched
(AEH-06 AC3).

### 3. Prose edit map (guidance + testing surfaces)

| File | Edit |
| --- | --- |
| `workflows/code-quality/code-quality-audit.md` | L94 split lead → "recommend splitting only when the split yields an externally-findable named unit (search/grep from outside the file) or reduces change risk; never on size or 'more than one thing' alone"; static leads gain multi-subject-file + >2000-line flags with the SHALL-NOT-flag-below-bound guard |
| `workflows/code-quality/code-quality-fix.md` | L51-52 same criterion on the fix side |
| `workflows/refactor.md` | Step 8 names extract-for-findability as the primary extraction payoff |
| `references/coding-guidelines.md` | New "File shape for agent readers" section: ~1000-line one-subject file fine; >2000 exceeds one read; one subject split across N files = N reads with per-hop loss; explicitly framed as read mechanics, not depth (cites deepening-lens rejected framing) |
| `workflows/tests/tests-audit.md` | Gate/error-class table (5 rows); variation sensor; trend sensor (reads `metrics trend`); dispatch lens `performance` → `tests` |
| `workflows/tests/tests-fix.md` | Variation fix method (varied-input cases, not fixture copies) |
| `agents/test-engineer/SKILL.md` | Mission names 5 error classes; responsibilities gain variation/property-style design (library-neutral) |
| `agents/audit-specialist/SKILL.md` | Lens table gains `tests` row (coverage, regression, assertion quality, variation) routing to `workflows/tests/tests-audit.md` |
| `workflows/feature.md` | AC-capture step before implementation; verification step checks captured ACs |
| `references/lessons.md` | Trust-ramp + metrics policy section (categories, levels, threshold, advisory meaning, commands) |
| `references/implementation-delivery.md` | Human-review stage gains advisory trust-status line; merge clause verbatim-untouched |
| `references/spec-driven/validate.md` | Post-validation step: record `metrics add` snapshot |

### 4. Tests

- `scripts/__tests__/lessons-trust-metrics.test.ts`: temp-dir stores; cases — streak
  accumulation, threshold boundary (30 trusted / 29 not), `minor` extends, `major`
  resets+demotes, legacy-store loads clean with empty views, enum rejection exit 2,
  insufficient-data trend, improving/degrading/stable verdicts, legacy-command
  byte-stability (run `list` on a fixture store, assert file unchanged).
- `scripts/__tests__/agent-era-guidance-content.test.ts`: asserts per-AC load-bearing
  literals in the edited sources (e.g. dispatch block present in each of the 14
  workflows, gate table rows in tests-audit, no remaining split-on-"and"-alone lead).
  Authored AFTER prose lands; each assertion observed red via deliberate mutation before
  the suite is trusted (sensor-before-subject drift is a recorded defect class).

## Error Handling Strategy

| Error Scenario | Handling | User Impact |
| -------------- | -------- | ----------- |
| Unknown `--feedback`/`--result` value | `parseFlags` choices → usage error, exit 2 | Message names accepted values |
| Store absent on `trust status`/`metrics trend` | In-memory default store, empty views | `(no review records)` / `insufficient data`, exit 0 |
| Legacy store (no new arrays) | Lazy init only in new commands | Legacy commands byte-identical; new commands see empty logs |
| Reviewer subagent unavailable | Standalone fresh-eyes fallback per template | Skipped-delegation reason recorded |
| Non-numeric `--fix-iterations` etc. | Parse with `Number()`, reject NaN/negative, exit 2 | Message names the offending flag |

## Risks & Concerns

| Concern | Location (file:line) | Impact | Mitigation |
| ------- | -------------------- | ------ | ---------- |
| pyts-golden pins whole-store serialization; eager setdefault of new fields would rewrite stores under legacy commands | `scripts/__tests__/pyts-golden.test.ts`; `lessons.ts:244-250` | Golden suite red; silent store churn | Lazy `ensureRampFields` only in new commands; byte-stability test case; run pyts-golden first in Execute |
| New discoverability rule could contradict KISS inlining leads in the same files | `code-quality-audit.md:100`, `code-quality-fix.md:53` | Self-contradicting workflow | Single criterion sentence used in both places: split when findable-from-outside or change-risk; inline when neither — KISS lead cross-references it |
| File-size guidance read as a depth metric | `architecture-deepening-lens.md:100-102` | Violates lens's rejected framing | Guidance text names the rejected framing and self-scopes to read mechanics (AEH-02 AC6 sensor asserts the phrase) |
| Worktree lacks `node_modules`; native-grammar suites unrelated to this feature fail on fresh provision | `CLAUDE.md` provisioning trap | False-red test runs | Run targeted suites (`lessons-trust-metrics`, `agent-era-guidance-content`, `pyts-golden`, parity) not full `test:scripts`; provision via `bun install` + addon copy from main checkout only if a needed suite requires it |
| Dispatch block in 14 files drifts from generated bundles | `apps/*-plugin/skills/` (gitignored) | Parity failure | `bun run generate:artifacts` after prose lands; `--check` + parity suite as gate |
| Artifact size budgets for `.specs/` files | `references/spec-driven/context-limits.md:23-29` | Oversized spec/design | Both artifacts kept under limits (spec ~3.4k tokens, this design ~2.5k) |

## Tech Decisions (only non-obvious ones)

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Streak/trusted state | Derived on read from append-only log | Fewest invariants; demotion emergent; every AC a pure function of the log (approach A) |
| Trend verdict | Scalar score `FAIL*100 + mutants*10 + fixIters + uncoveredACs`, compare last two | Deterministic, documented, no thresholds to tune; direction only, not magnitude |
| CLI shape | Two-token subcommands (`review add`, `trust status`, `metrics add/trend`) | Matches spec ACs; existing dispatch switch extends without breaking single-word commands |
| `trust_threshold` location | Top-level store field beside `promote_threshold`, default 30, lazy-init | Mirrors existing config pattern; per-project override by editing the machine-owned field via the script only |
| New-field write discipline | No setdefault in `load()`; `ensureRampFields` in new commands only | Protects pyts-golden byte-parity of legacy commands |
| Python parity scope | New commands are TS-only, documented in lessons.ts header | The Python original predates the ramp; parity contract covers ported commands only |
| Content sensors as a test file | `agent-era-guidance-content.test.ts` in `scripts/__tests__/` | Prose regressions (a later edit deleting the dispatch block) become deterministic failures, not review hopes |

## Verification Design

- AEH-03/05: unit suite above; mutation pass flips `>=` to `>` at the threshold, drops
  the `major` reset, and swaps trend comparison direction — each must go red.
- AEH-01/02/04/06/07/08/09: content-sensor suite, one assertion per AC-critical literal,
  each observed red once via deliberate source mutation during Execute.
- AEH-10: `bun run generate:artifacts --check` exit 0; `bun test
  scripts/__tests__/skill-artifact-parity.test.ts` and `subagent-parity.test.ts` pass;
  `validate_skill.ts` clean on edited SKILL.md files.
- Final gate: fresh verification-agent, spec-anchored, evidence-or-zero.
