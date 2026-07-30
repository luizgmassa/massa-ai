# Model Profile Registry — Tasks

Companion to `spec.md` / `design.md` / `fool.md`. One atomic commit per task. A task is done
only when its gate passes — the runner decides, not self-assessment.

---

## Ordering constraint that shapes this breakdown

Three things are mutually entangled and cannot be separated into smaller green steps:

1. `emitCursor` is the only consumer of the charter's `model_hint`, so the charter rename
   cannot precede the Cursor emitter rewrite.
2. `subagent-parity.test.ts` hard-codes the four model tables. A registry-derived rewrite of
   that test **cannot** be green against today's artifacts, because 3 of 15 roles hold
   contradictory tiers across hosts (`spec.md` §1 P1) — one tier per role is exactly what the
   rewrite asserts.
3. Therefore the tier normalization, the emitter rewrites, and the parity-test rewrite land in
   **one** commit (T3). Splitting them would require leaving a test red or weakening it, and
   neither is permitted.

T2 exists purely to make T3 smaller: it adds `model_tier` additively so T3 changes behaviour
only, not schema.

## Task list

| # | Task | Files | Behaviour change | Status |
| --- | --- | --- | --- | --- |
| T1 | Registry + resolver + resolver unit tests | +3 | none (no consumer) | **DONE** `d256d09` |
| T2 | Charters gain `metadata.model_tier` additively | 15 + 1 + 1 | none | **DONE** `f9944d9` |
| T3 | All four emitters resolve from registry; Cursor + OpenCode conformance; parity test rewritten | ~6 + 60 regenerated | **yes — the whole of `spec.md` §4** | **DONE** `17102f2` |
| T4 | Remove now-unused `model_hint`; tighten validators | 15 + 3 + 60 regenerated | none | **DONE** `e714fe9` |
| T5 | OpenCode `config-cli` uninstall coverage (D8/D9) | 1 | none | **DONE** `0be5a30` |
| T6 | `scripts/verify-model-ids.ts` (MPR-R12) | +2 | none | **DONE** `ce326be` |
| T7 | Docs: `FEATURES.md`, `CLAUDE.md`, `CHANGELOG.md` + doc-drift test | 3 + 1 | none | **DONE** `cb56fd0` |
| T8 | `turbo.json` passThroughEnv += `MASSA_AI_MODEL_PROFILE` (D6) | 1 | none | **DONE** `0be5a30` |
| T9 | Independent validation (verification-agent) | +1 | none | **DONE — FAIL (3 gaps) → PASS @ `af79151`** |
| T10 | MPR-R1 model-token scan + its unit test (T9 gap 1) | +2 + 2 | none | **DONE** `611f29e` |
| T11 | `loadCharter` throw tests exercise `loadCharter` (T9 gap 2) | 2 | none | **DONE** `412c076` |
| T12 | Amend `design.md`/`tasks.md` for the 7-profile registry (T9 gap 3) | 2 | none | **DONE** `fdbc8eb` |
| T13 | Scan matches across a line wrap + separator swap (T9 iteration-1 residual) | 2 | none | **DONE** `af79151` |

## Amendments during Execute

Recorded rather than silently applied. Each is a place where the plan and the shipped
result diverged, with the reason.

| # | Where | Amendment |
| --- | --- | --- |
| A1 | `spec.md` MPR-R11 (see `spec.md` §9) | "one small table per profile" withdrawn — it enumerates profile names, which MPR-R3's ACs forbid. `FEATURES.md` names no profile and points at the registry. |
| A2 | `design.md` §2 invariant 2 | "every profile defines all four hosts" relaxed: a profile may define a subset, and an unsupported (profile, host) pair is `MissingHostError` at resolve time. The original rule would have forbidden the two genuinely OpenCode-only profiles. |
| A3 | `design.md` §2.1 fact count, §6 test row, this file's MPR-R2 row | 39 / two profiles was the design-time figure; 81 / seven profiles ships. The test asserts the factored *shape* against the live registry rather than a frozen literal, which is why it never went red on the change. |
| A4 | `design.md` "Why two seeded profiles" | A `heavy` profile ships after all. Safe because MPR-R12's `verify-model-ids.ts` — itself added by the Plan Challenge — lets a tier be pointed at a probed id instead of a guessed one. |
| A5 | T7 scope, item 1 | Consequence of A1. |
| A6 | `spec.md` §4.1 (new), CHANGELOG merge note | `main` merged `judge-with-debate` and released v1.13.0 mid-review. Merging it in raises every 15 to 17 and moves **two more OpenCode pins** (`judge` and `meta-judge` → `opencode-go/minimax-m3`), which §4's tables cannot show because neither role existed at the frozen commit. Both are the MPR-R8 treatment applied to charters carrying the same cross-host drift. Disclosed rather than folded in silently — §4 claims completeness, so it needed the caveat. |

**Open follow-up, deliberately not closed by this feature.** `workflows/judge-with-debate.md`
holds per-slot model literals (lines 52, 53, 64) that `verify-model-tokens.ts` does not see:
MPR-R1 enumerates four surfaces and workflow markdown is not one, and §5/MPR-R7 deliberately
kept model information out of workflows. Pointing the scan's own matcher at the file confirms
**3 lines would be flagged** if the surface were covered. Widening it is not a scan setting —
it would go red on `main`'s content immediately, and whether per-slot diversity belongs in the
registry is a `judge-with-debate` design decision. A three-tier registry cannot currently
express "same capability, different model".

## Fix tasks from T9 — closed

T9's first verdict was **FAIL** with three gaps; iteration 1 passed with one non-blocking
residual, which T13 closed; iteration 2 is the final **PASS** at `af79151`. Two of the three
fix loops the workflow allows were used. `validation.md` is the single record — it replaces
the two earlier reports rather than appending to them, and carries the full sensor history.

**Known limitation, accepted with a recorded reason.** `verify-model-tokens.ts` can false-fire
on ordinary English use of the three bare Claude aliases (they are two poetry forms and the
Latin for "a great work"). No charter triggers it today. The suggested narrowing — requiring
those tokens to sit beside a `model` context word — was **declined**: it would trade a loud,
five-second-to-diagnose false positive for a silent false *negative* on a real duplicated
fact written without a context word. Recorded in the script's own docblock so the next person
to hit it rewords the sentence instead of weakening the gate.

### T7 scope, precisely

1. **`FEATURES.md` §"Model pinning" (currently lines ~357-460)** — delete the four 15-row
   per-host tables **and all four rationale columns** (`design.md` §7 explains why they are
   deleted rather than consolidated). Replace with: one role→tier table generated from the
   charters; ~~one tier→model table per profile~~ (**amendment A1** — withdrawn, it would
   break MPR-R3; a registry pointer instead); the per-host key/format/effort reference from
   `spec.md` §7 with its source URLs; the Cursor `inherit` limitation and the
   `cursor-agent models` discovery path.
   Also update `FEATURES.md:351` and `:353`, which still describe the OLD per-host
   frontmatter key lists (`:353` still names `metadata` for OpenCode).
2. **`subagent-parity.test.ts` lines ~450-470** — the pre-existing DOC-06 test asserts
   `FEATURES.md` contains literal model names (`haiku`, `gpt-5.6-terra`,
   `model_reasoning_effort = "high"`). It must become the MPR-R11 doc-drift test: assert the
   generated role→tier table matches the charters, and that it is the file's only
   role-keyed model table. These are the last model literals outside the registry and the
   frozen fixture.
3. **`CLAUDE.md`** — registry pointer in the agent-harness section, plus the
   `CLAUDE_CODE_SUBAGENT_MODEL` caveat from `spec.md` §5 (setting it to a real model
   silently defeats every registry pin on Claude, because it outranks frontmatter).
4. **`CHANGELOG.md`** `[Unreleased]` → `### Changed` (minor bump). Must name **three**
   defect classes, per `design.md` §7 — the third (OpenCode forwarding `name`/`metadata` to
   the provider as model options) is easy to under-report as hygiene.
5. Regenerate both artifact sets if any charter changes; re-run the gates below.

### T9 scope

Dispatch `massa-ai-verification-agent` (author ≠ verifier) per `references/agent-orchestration.md`
and `references/spec-driven/validate.md`. Writes `validation.md`. Verify against `spec.md`
MPR-R1..R12 acceptance criteria and the `spec.md` §4 enumerated change list.

**Sub-agent offer (spec-driven §95):** 9 tasks exceeds the ~8-task single-batch budget, so the
offer applies. Recommendation is to decline: T3 is the bulk of the risk and is one indivisible
commit that must be authored with full context of T1/T2, and T9 requires author ≠ verifier
regardless. A batch split would put the boundary in the worst place.

---

## T1 — Registry + resolver

**Create**
- `skills/model-profiles.json` — `version`, `tiers`, `hostDefaults`, `workflowTiers` (empty),
  `profiles.balanced`, `profiles.frugal`. No agent list (`design.md` §2.1).
- `scripts/lib/model-profiles.ts` — `loadRegistry`, `validateRegistry`, `selectProfile`,
  `resolveTier`, `workflowTier`, host effort enums. No dep outside `node:fs`/`node:path`.
- `scripts/__tests__/model-profiles.test.ts`.

**Seeded values** — `balanced` reproduces today's per-tier values; `frugal` uses only IDs
verified to exist (`spec.md` §7). Cursor is `inherit` in both.

**Gate**
```bash
bun test scripts/__tests__/model-profiles.test.ts
bun run scripts/generate-subagent-artifacts.ts --check   # must still say "No drift"
bun run lint
```

## T2 — Charters declare a tier (additive)

**Edit** 15 × `skills/agents/<n>/SKILL.md`: add `metadata.model_tier` beside the existing
`model_hint`. Tiers per `spec.md` §4 normalization — `navigator: light`,
`requirements-analyst: standard`, `planner: deep`, rest unchanged from their Claude tier.

**Edit** `scripts/generate-subagent-artifacts.ts` → `loadCharter` returns `modelTier` as well
as `modelHint`; throws when `model_tier` is absent.
**Edit** `.github/workflows/skills.yml` → also require `^  model_tier:`.

**Gate** — artifacts must not move; the tier is not yet consumed.
```bash
bun run scripts/generate-subagent-artifacts.ts --check   # "No drift"
bun run scripts/generate-skill-artifacts.ts              # 60 mirrored charters change
bun run scripts/generate-skill-artifacts.ts --check      # "No drift"
bun run test:scripts                                     # no new failures vs 733/1/4
```

## T3 — Emitters resolve from the registry  ⚠ the behaviour-change commit

**Edit** `scripts/generate-subagent-artifacts.ts`
- delete `AGENT_MODELS_CLAUDE`, `AGENT_MODELS_CODEX`, `AGENT_MODELS_OPENCODE`;
- each emitter calls `resolveTier(registry, host, profile, charter.modelTier)`;
- `emitClaude` / `emitCodex` — values only;
- `emitCursor` — drop `tools` and `reasoningEffort`; add `readonly: true` for the 12 read-only
  charters (omit for the 3 writers); `model` from registry;
- `emitOpenCode` — drop `name`; drop `metadata`; emit `<!-- massa-ai-owned: true -->` as the
  first body line;
- `main()` accepts `--profile=<name>`; `selectProfile` wired per host.

**Edit** `scripts/__tests__/subagent-parity.test.ts` — delete all four hard-coded tables;
derive expectations from registry + charter tiers; add a per-host allowed-key assertion with
the source URL cited per host; change the OpenCode marker assertion from `fm.metadata` to
"body marker present **and** `metadata` absent from frontmatter".

**Add** the frozen-fixture regression test against `fixtures/baseline-main.json`, asserting the
diff is **exactly** the `spec.md` §4 rows.

**Regenerate** 60 agent artifacts.

**Gate**
```bash
bun run scripts/generate-subagent-artifacts.ts           # regenerate
bun run scripts/generate-subagent-artifacts.ts --check   # "No drift"
bun test scripts/__tests__/subagent-parity.test.ts
bun test scripts/__tests__/generate-subagent-artifacts.test.ts
bun run test:scripts                                     # no new failures vs 733/1/4
```
Plus: fixture diff prints exactly 5 model rows + the Cursor/OpenCode key-set rows, nothing else.

## T4 — Retire `model_hint`

**Edit** 15 charters (remove `model_hint`), `loadCharter` (drop `modelHint` from `Charter`),
`.github/workflows/skills.yml` (drop the `model_hint` requirement),
`scripts/__tests__/skills-harness-integrity.test.ts` (assert `model_tier` ∈ registry tiers).
**Regenerate** skill bundles.

**Gate** — both `--check` green; `git grep -c model_hint` over tracked non-CHANGELOG/.specs
files returns 0; `test:scripts` no new failures.

## T5 — OpenCode uninstall coverage (D8/D9)

**Edit** `apps/opencode-plugin/src/__tests__/agents-install.test.ts`:
- install via `config-cli` → uninstall → assert 15 removed, seeded user agent survives;
- seed one **old-form** file (marker in frontmatter) + one new-form → assert both removed.

**Gate** `bun run test:plugins`.

## T6 — `scripts/verify-model-ids.ts` (MPR-R12)

Probe each installed harness CLI; per-ID resolve/miss; non-zero on miss; **skip an absent CLI
with a named reason**. Advisory, not in the blocking CI gate.

**Gate** `bun scripts/verify-model-ids.ts` (opencode resolves 3/3; cursor reports
skipped-no-cursor-agent) + its unit test.

## T7 — Documentation

`FEATURES.md`: delete the four 15-row tables and all four rationale columns; add the generated
role→tier table, a registry pointer for the tier→model mapping (**amendment A1**), the per-host
key/format/effort reference with source URLs, and the Cursor `inherit` limitation. `CLAUDE.md`:
registry pointer + `CLAUDE_CODE_SUBAGENT_MODEL` caveat. `CHANGELOG.md`: `### Changed` naming all
**three** defect classes (`design.md` §7). Add the doc-drift test.

**Gate** doc-drift test passes; `bun run test:scripts`.

## T8 — turbo passThroughEnv

`turbo.json` → `tasks.test.passThroughEnv` += `MASSA_AI_MODEL_PROFILE`.

**Gate** a selection test reading the env var passes under `bun run test`, not just `bun test`.

## T9 — Independent validation

Dispatch `massa-ai-verification-agent` (author ≠ verifier). Writes `validation.md`.

## T10 — MPR-R1 model-token scan

`scripts/verify-model-tokens.ts` + `scripts/__tests__/verify-model-tokens.test.ts`. The token
list is derived from the registry ∪ the frozen fixture, never typed. Only the BODY of a
generated artifact is scanned — its emitted `model` assignment is the legitimate value.
Scanning zero files exits 2, not 0.

**Gate** `bun scripts/verify-model-tokens.ts` exit 0 on a clean tree, exit 1 with a model name
in charter prose (both measured); `bun run test:scripts`.

## T11 — Repair the decorative `loadCharter` tests

`loadCharter` gains an optional charters-dir parameter so its throws can be exercised against
the real function. Three error classes gain real coverage: missing `model_tier`, a reappearing
`model_hint`, and a missing description. A harness self-check loads an unmodified charter
first, so a broken harness cannot make the throw-assertions pass for the wrong reason.

**Gate** the mutation `?? ""` → `?? "standard"` must turn the test red (measured; it was green
before this task); `bun run test:scripts`.

## T12 — Amend the plan documents

`design.md` and this file carried the design-time figures (39 facts, two profiles, "every
profile defines all four hosts") against a shipped seven-profile registry. Amendments A1–A5
above; no code or test change.

**Gate** documentation only — `bun run test:scripts` must be unchanged.

---

## Test Coverage Matrix

| Req | Test | Kind |
| --- | --- | --- |
| MPR-R1 | scripted model-token scan; 0 hits outside registry/generated/history | gate script |
| MPR-R2 | fact count is factored not cross-product, asserted against the live registry; registry has no agent list | unit |
| MPR-R3 | synthetic profile resolves end-to-end, zero source edits | unit |
| MPR-R4 | precedence table: flag / env / both / neither / unknown at each rank | unit |
| MPR-R5 | one case per error class in `design.md` §3 + multi-error single throw | unit |
| MPR-R6 | charter tier ∈ registry tiers; missing tier throws; no model name in any charter | unit + CI shell |
| MPR-R7 | `workflowTier` resolves; `git diff --stat skills/massa-ai/workflows/` empty | unit + gate |
| MPR-R8 | frozen-fixture diff == exactly the §4 rows | regression |
| MPR-R9 | per-host allowed-key subset assertion, source URL cited | parity |
| MPR-R10 | effort renders per host syntax; value ∈ host enum | parity |
| MPR-R11 | doc-drift: generated role→tier table matches charters; sole role-keyed table | unit |
| MPR-R12 | `verify-model-ids.ts`: resolve/miss/skip-with-reason | unit + manual probe |
| D1 | every OpenCode filename stem == `massa-ai-<charter name>` | parity |
| D8/D9 | install→uninstall, 15 removed, user agent survives, both marker forms | plugin |

## Gate Check Commands

**Build first, or every reading is wrong.** See `spec.md` §8 — an unbuilt worktree reports 4
failures in `test:scripts` and 26 in `test:plugins`, none of them real, and a *partial* build
moves the failure rather than reducing it (4 → 5 meant progress).

```bash
# one-time per worktree; five packages
for p in packages/shared packages/core apps/tools-api apps/mcp-client apps/opencode-plugin; do
  (cd "$p" && bun run build) || break
done

bun run scripts/generate-subagent-artifacts.ts --check   # "No drift"
bun run scripts/generate-skill-artifacts.ts --check      # "No drift"
bun run test:scripts        # 857 pass / 0 fail, exit 0
bun run test:plugins        # 96 pass / 0 fail, exit 0
bun run lint                # oxlint, exit 0
bun run verify:model-tokens # MPR-R1 gate; 136 files, 29 tokens, 0 hits, exit 0
bun run verify:model-ids    # advisory; opencode 11/11, claude 3/3, codex SKIPPED
```

Last measured green at `af79151` (T13) with all five packages built. The `test:scripts` count
moved 832 → 836 (T7's doc-drift tests) → 850 (T10) → 853 (T11) → 857 (T13); each step is accounted for in
its own commit body. `verify:model-tokens` also runs inside `test:scripts` via its unit test,
so it is a real gate without a new CI job — a new job under the `CI` workflow name would
extend the `workflow_run` chain that cuts a release.

`bun run type-check` and root `bun run build` are not gates here: no `packages/*` or `apps/*`
source type surface changes except `apps/opencode-plugin` tests, which `test:plugins` covers.

## Verification notes carried forward

- Never trust a pipeline's `$?` — `cmd | tail; echo $?` reports `tail`'s status. Redirect to a
  file and check the exit code directly. This produced one false "lint passed" during Execute.
- `git grep` reads the **index**, so unstaged edits are invisible to it. `git add` before
  citing any grep count as evidence. This produced one false "15 charters still name a model".
- Prove a guard fires before trusting its silence. oxlint prints nothing on success, which is
  indistinguishable from not running; a deliberate duplicate-declaration probe confirmed it
  reports and exits 1.
- The `skills.yml` tier check must not use `sed -n '/"tiers"/,/]/p'` (the range swallows 165
  lines of profile bodies) or `grep -q <(...)` (silently no-match under zsh). Committed form
  is a POSIX two-stage pipeline over the single `"tiers"` line, failing closed.

## MCP / skill question (spec-driven §94)

No MCP tool is required. The massa-ai MCP server is **not registered in this session**, so
`recall`/`search` were unavailable throughout and all state came from `.specs/` files and
source reads — recorded as a skipped sensor, not silently treated as answered. Tool choice does
not affect correctness or verification here: every gate is a local deterministic command.
