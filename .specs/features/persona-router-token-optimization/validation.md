# Validation — persona-router-token-optimization

Status: **PASS**
Verifier: massa-ai-verification-agent (author != verifier)
Date: 2026-08-04 · Diff range: `git diff origin/main...HEAD` (8 commits,
`ee5df5c8`..`9ac8e326`) plus live user-machine mutation evidence (T7, no repo
commit — captured 2026-08-05T02:12-02:14Z, after the last docs commit).

## Gate commands (all green)

| Command | Result |
| --- | --- |
| `bun test scripts/__tests__/skill-size-budgets.test.ts` | 6 pass / 0 fail |
| `bun test scripts/__tests__/skills-harness-integrity.test.ts` | 32 pass / 0 fail |
| `bun test scripts/__tests__/validate-repository.test.ts` | 183 pass / 0 fail |
| `bun test scripts/__tests__/skill-artifact-parity.test.ts` | 19 pass / 0 fail |
| `bash scripts/tests/test-skills-check-double-surface.sh` | 14 pass / 0 fail |
| `bun scripts/generate-skill-artifacts.ts --check` | No drift |
| `bun run lint` | 0 violations |

## Per-AC findings

### PRT-01 — Single registration surface (machine dedupe, T7)

Evidence: `/tmp/prt01-evidence.md` (BEFORE / AFTER / AFTER-FINAL), redacted to
`enabledPlugins`/`hooks` per AC5. Captured after `9ac8e326` — HANDOFF.md/STATE.md
predate this completion and record it as "T7 partially blocked"; this is a stale
record, not a contradiction — completion happened live in this session per the
capability packet, no repo commit expected (tasks.md T7 spec).

- AC1 PASS. `enabledPlugins["massa-ai@massa-ai"]` BEFORE `true` -> AFTER-FINAL
  `false`. `hooks` block byte-identical across BEFORE/AFTER/AFTER-FINAL (all six
  hook types still point at `apps/claude-plugin/hooks/massa-ai-hook.ts`).
  `installed_plugins.json` carries no enablement field (verified no-op per Plan
  Challenge F5) — resolution is governed solely by `enabledPlugins`, now `false`,
  so it no longer resolves as an enabled surface.
- AC2 PASS. AFTER-FINAL: 17-agent roster (`judge`, `meta-judge` present,
  `handoff-writer` absent — BEFORE had 16 with `handoff-writer` present, no
  judge/meta-judge). 6 `massa-ai-*.md` commands present, unchanged count
  before/after.
- AC3 PASS. AFTER-FINAL skills entries: `massa-ai persona-router` only — the two
  broken symlinks (`massa-ai-memory`, `synapse-usage`) present BEFORE are gone.
- AC4 PASS per session record: installer invocations ran with
  `MASSA_AI_SKIP_PLUGIN_REGISTRY=1`; disable step ran LAST; a falsifying re-check
  after the last installer invocation caught and fixed a stale `handoff-writer`
  (user-approved removal, recorded in the capability packet). Not independently
  re-executed by this verifier (would re-mutate the live machine) — accepted as
  documented author evidence per the packet's explicit "already executed" framing.
- AC5 PASS. Evidence file quotes only `enabledPlugins`/`hooks`; no raw dump. This
  verifier did not read `~/.claude/settings.json` beyond that recorded evidence.

### PRT-02 — Pinned-project routing fast path

- AC1-3 (live routing walkthrough): **pending-restart** (Plan Challenge F6) — this
  session predates the slimmed skills; a same-session walkthrough would read stale
  in-memory instructions. Documented-contract check substituted: SKILL.md lines
  22, 30 state the pin fast path exactly as specced (valid pin -> pinned prompt
  only; `no_persona` -> silent zero-read completion; invalid pin -> one-line report
  + normal fallback).
- AC4 PASS. Root `AGENTS.md:118` carries `persona_pin:
  context-skill-harness-engineer-architect`; `skills-harness-integrity.test.ts`
  32/0 green (includes policy single-source assertions).
- AC5 PASS (amended). `SKILL.md` = 5,494 B <= 5,500 B (amended ceiling, reason
  recorded in spec.md PRT-02 AC5); `catalog.json` = 2,385 B <= 2,500 B.

### PRT-03/04/05 — Slim SKILL.md, two-tier catalog, prompt compression

- PRT-04 AC1 PASS. `catalog.json` schema_version 2; every entry has exactly
  `id, display_name, prompt_path, signals_path, summary, aliases` (verified by
  reading the file and by `validate-repository.test.ts`, which explicitly asserts
  `persona.primary_signals` etc. are `undefined` on the index — mutation-tested,
  see Discrimination Sensor).
- PRT-04 AC2 PASS (documented contract; SKILL.md routing workflow loads
  `signals_path` only during classification — not independently exercised live,
  same restart-gating as PRT-02).
- PRT-04 AC3 PASS. `validate-repository.test.ts` asserts `schema_version === 2`
  with a found-vs-supported failure path.
- PRT-03/05 AC (byte budgets) PASS via `skill-size-budgets.test.ts` (population
  printed, all under ceiling: prompts 4,485-4,498 B, references 5,362 B).
- PRT-03 reference-integrity (C2) PASS. `references/routing-details.md` exists;
  `skills-harness-integrity.test.ts` reference-integrity assertions green.

### PRT-06 — Cross-session route memory

Documented-contract only, per spec Assumptions ("MCP unreachable this session").
SKILL.md:31 states the `persona-route:<projectId>` recall/write-back/silent-skip
contract as specced. Not live-verified — consistent with the packet's firewall
(massa-ai MCP assumed unreachable).

### PRT-07 — Size-budget gate

- AC1 PASS. Budget map in `skill-size-budgets.test.ts` matches spec numbers
  exactly: SKILL.md 5,500; references 8,000; catalog.json 2,500; prompts 4,500;
  signals 2,500; massa-ai SKILL.md 21,000 (freeze).
- AC2 PASS. Red-first evidence recorded in HANDOFF.md Deviations #2 (pre-slim
  figures: SKILL.md 13,316 > 5,000; catalog 8,871 > 2,500; five prompts over
  4,500; two empty-glob failures) — not re-seeded per instructions. Discrimination
  sensor below re-confirms the empty-glob guard fires live.

### PRT-08 — Double-surface check

- AC3/AC4 PASS. Shell suite 14/14: both-surfaces exits 1 naming both files
  (`install-state.json`, `settings.json`, `massa-ai@massa-ai`); single-surface,
  missing-`enabledPlugins`-key, missing-settings.json, and missing-state-file all
  exit 0 with no drift row (edge cases from spec.md honored).

### PRT-09 — Parity and delivery

- AC1 PASS. `generate-skill-artifacts.ts --check` reports no drift across all
  four host bundles.
- AC2 PASS. `CHANGELOG.md` `[Unreleased]` carries Changed (routing chain cut,
  catalog v2, prompt compression, pin) + Added (size-budget gate, double-surface
  probe) entries with the correct byte figures.
- AC3 PASS for the six task-listed gate commands + `bun run lint` (0 violations).
  Full `bun run test:scripts` aggregate was not re-run in this pass (large,
  ~1230 tests); HANDOFF.md records 223/0 at the last merge point and the
  six targeted suites covering every changed subject are green here. Recorded as
  a scoped skip, not silent — reason: redundant with per-file gates already run
  and the packet's evidence-gate preference for the cheapest sufficient evidence.

## Discrimination sensor (scratch-copy mutations, population = 5)

Full worktree copied to `/tmp/prt-verify-scratch/worktree` (byte-verified via
`sha256sum` on `scripts/install-skills.sh` before/after one in-place mutation);
all mutations run and reverted in the scratch copy except one polarity flip run
directly against a scratch copy of `install-skills.sh` with a pre/post hash
check confirming the real worktree file was never touched. Real worktree
`git status` clean before and after this sensor.

| # | Mutation | Gate | Verdict |
| --- | --- | --- | --- |
| 1 | Grow `SKILL.md` +100 B past 5,500 | `skill-size-budgets.test.ts` | Killed (1 fail: SKILL.md 5594B > 5500B) |
| 2 | Empty `personas/signals/*.json` glob | `skill-size-budgets.test.ts` | Killed (dead-subject guard: `expect(files.length).toBeGreaterThan(0)` failed) |
| 3 | Inject inline `primary_signals` array into catalog v2 entry | `validate-repository.test.ts` | Killed (`toBeUndefined()` assertion failed) |
| 4 | Invert double-surface probe polarity (`=== true` -> `!== true`) | `test-skills-check-double-surface.sh` | Killed (7/14 failed — scenario 1 stopped reporting drift, scenario 2 started false-reporting) |
| 5 | Remove gate-anchored sentence ("the persona is never authority") from SKILL.md | `skills-harness-integrity.test.ts` | Killed (1 fail: anchor text assertion) |

5/5 mutations killed. 0 equivalent/surviving mutants.

## Skipped checks (with reasons)

- Live PRT-02 AC1-3 routing walkthrough: restart-gated (Plan Challenge F6),
  pending-restart — same-session read would test stale in-memory instructions,
  not the shipped artifacts.
- PRT-06 live recall/write-back round trip: massa-ai MCP unreachable this
  session (firewall + spec Assumptions); verified as documented contract text
  only.
- PRT-01 AC4 re-execution: not independently re-run to avoid a second live
  mutation of the user's real `~/.claude`; accepted as author-supplied evidence
  per the packet's explicit "already executed, do not re-seed" framing.
- Full `bun run test:scripts` (1230 tests) aggregate: not re-run in this pass;
  the six task-listed gate commands cover every changed subject and were run
  individually, green.

## Highest ladder level reached

Behavioral (discrimination sensor with scratch-copy mutation testing) for the
five delivered gates; static/file-integrity for byte budgets and catalog shape;
documented-contract review for the two restart/MCP-gated ACs (PRT-02 walkthrough,
PRT-06 round trip).

## Validation assets confirmed not weakened

`skill-size-budgets.test.ts` retains its dead-subject guard (mutation-confirmed
live). `validate-repository.test.ts` v2 assertions are a repoint with an
equivalent v2 assertion for every v1 one (per design.md C13), confirmed by
mutation 3. `skills-harness-integrity.test.ts` gate-anchored sentence assertions
confirmed live via mutation 5. No test file's assertions were loosened relative
to design.md's C8/C13 specification.
