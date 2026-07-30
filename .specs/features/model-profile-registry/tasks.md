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
| T7 | Docs: `FEATURES.md`, `CLAUDE.md`, `CHANGELOG.md` + doc-drift test | 3 + 1 | none | **TODO** |
| T8 | `turbo.json` passThroughEnv += `MASSA_AI_MODEL_PROFILE` (D6) | 1 | none | **DONE** `0be5a30` |
| T9 | Independent validation (verification-agent) | +1 | none | **TODO** |

## Remaining work — T7 and T9 only

### T7 scope, precisely

1. **`FEATURES.md` §"Model pinning" (currently lines ~357-460)** — delete the four 15-row
   per-host tables **and all four rationale columns** (`design.md` §7 explains why they are
   deleted rather than consolidated). Replace with: one role→tier table generated from the
   charters; one tier→model table per profile; the per-host key/format/effort reference from
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
role→tier table, a tier→model table per profile, the per-host key/format/effort reference with
source URLs, and the Cursor `inherit` limitation. `CLAUDE.md`: registry pointer +
`CLAUDE_CODE_SUBAGENT_MODEL` caveat. `CHANGELOG.md`: `### Changed` naming all **three** defect
classes (`design.md` §7). Add the doc-drift test.

**Gate** doc-drift test passes; `bun run test:scripts`.

## T8 — turbo passThroughEnv

`turbo.json` → `tasks.test.passThroughEnv` += `MASSA_AI_MODEL_PROFILE`.

**Gate** a selection test reading the env var passes under `bun run test`, not just `bun test`.

## T9 — Independent validation

Dispatch `massa-ai-verification-agent` (author ≠ verifier). Writes `validation.md`.

---

## Test Coverage Matrix

| Req | Test | Kind |
| --- | --- | --- |
| MPR-R1 | scripted model-token scan; 0 hits outside registry/generated/history | gate script |
| MPR-R2 | fact count = 39; registry has no agent list | unit |
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
bun run test:scripts        # 832 pass / 0 fail, exit 0
bun run test:plugins        # 96 pass / 0 fail, exit 0
bun run lint                # oxlint, exit 0
bun run verify:model-ids    # advisory; opencode 11/11, codex SKIPPED
```

Last measured green at `ce326be` (T6) with all five packages built.

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
