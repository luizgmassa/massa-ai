# Persona Router Token Optimization — Design

Spec: `./spec.md` (PRT-01..09). Sizing: Large. AD-007..014 reviewed — none
constrain this surface; no supersession needed.

## Approach

Single approach with two internal forks resolved here (macro forks — scope,
dedupe direction, two-tier vs trim-in-place — were user-decided at Specify):

- **Signals layout fork:** per-persona `signals/<id>.json` files (chosen) vs one
  `signals.json`. Per-persona wins: classification loads only surviving
  candidates' signals (typically 1–2 files ≈ 1–2 KB) instead of re-loading a
  6 KB monolith — the single-file option recreates the problem being fixed.
- **Pin syntax fork:** `persona_pin: <id>` data line in project `AGENTS.md`
  (chosen) vs extending the `persona_router:` policy block per project.
  The policy-block option is structurally forbidden:
  `skills-harness-integrity.test.ts:244-259` fails any line-start
  `persona_router:` outside the bootstrap block. A distinct `persona_pin:` key
  does not match that gate and is per-project data, not policy restatement.

## Gate-anchored content constraints (measured 2026-08-04)

The slim `SKILL.md` MUST retain, verbatim, in named sections — asserted by
`scripts/__tests__/skills-harness-integrity.test.ts:637-676`:

- `## Persona And Sub-Agents`: "grants no tool access, no write scope, and no
  permission"; "the persona is never authority"; "carries the persona **id
  only**, never the persona prompt"; "A persona route is not a specialist
  consultation".
- `## Stop Conditions`: "Persona routing itself stays inline";
  "workflow-mandated agent dispatch is unaffected by an active persona route".
- Anywhere: literal `massa-ai/personas/catalog.json`
  (`validate-repository.test.ts:379`), frontmatter `name: persona-router`
  (`:374`), no `th0th_`-prefixed tool names (`:1149`).
- The `authorityGrants` prose scanner runs over `AUTHORITY_SCANNED_FILES`; the
  new reference file is added to that list (widening verified by a deliberate
  red: temporarily seeding a grant sentence in the new file must fail the test
  before the addition is kept — memory lesson: a widened subject list can be a
  no-op).

## Components

**C1 — `skills/persona-router/SKILL.md` rewrite (≤ 5,000 B).** Keeps
frontmatter description byte-identical (it is the routing contract). Body:
Startup Contract (compressed), Sources (persona-library root + workspace root,
catalog `schema_version: 2` validation, progressive-disclosure rule), Instruction
Precedence (pin inserted between explicit user choice and policy), **Fast
Paths** (new): (a) valid `persona_pin` → read pinned prompt only, skip recall /
doc inspection / classification; `no_persona` pin → silent completion, zero
reads; invalid pin → one-line report, normal flow; (b) recalled
`persona-route:<projectId>` pattern memory whose id validates against the index
→ skip doc inspection + classification (PRT-06); write-back contract after a
successful inferred route; silent skip when MCP unavailable. Then: compressed
routing workflow (explicit choice → evidence reuse → docs → classify-with-
signals → ambiguity/no-match policy hooks → apply & announce), Persona And
Sub-Agents (anchored sentences + overlap-table pointer), Route Lifetime
(2 lines + pointer), Failure Handling (table pointer + catalog/schema lines
kept inline), Stop Conditions (anchored sentences). Reference load conditions
named per pointer.

**C2 — `skills/persona-router/references/routing-details.md` (new, ≤ 8,000 B).**
Receives: persona↔agent overlap table, routing-examples table, full failure-
handling table, route-lifetime detail, ambiguity/no-match elaboration,
multi-persona request handling. Load conditions: ambiguity requiring a user
question, failure reporting, mid-conversation reroute doubt, explicit
multi-persona request.

**C3 — `skills/massa-ai/personas/catalog.json` v2 (≤ 2,500 B).**
`{schema_version: 2, personas: [{id, display_name, aliases, summary,
prompt_path, signals_path}]}`. Membership and `summary`/`aliases` text
unchanged from v1.

**C4 — `skills/massa-ai/personas/signals/<id>.json` ×5 (≤ 2,500 B each).**
`{primary_signals, negative_signals, secondary_lens_signals}` — v1 arrays moved
verbatim, zero content loss.

**C5 — Prompt compression (≤ 4,500 B per `personas/*.md`).** Five prompts
rewritten dense (README already 3,547 B, passes untouched). Every original
top-level theme retained: stance, expertise domains, strategy rules,
response shape, do-nots. Compression removes redundant elaboration, not rules.

**C6 — `skills/AGENTS.md` bootstrap block.** Persona Router Policy section
gains: `persona_pin` documentation (supported values: catalog id or
`no_persona`; one line in a project `AGENTS.md`; precedence: explicit prompt
choice > pin > automatic inference), and the route-memory fast-path note.
`persona_router:` still declared exactly once inside the bootstrap block.

**C7 — Root `AGENTS.md` (this repo).** Adds `## Persona Pin` +
`persona_pin: context-skill-harness-engineer-architect`. Integrity test
unaffected (different key).

**C8 — `scripts/__tests__/skill-size-budgets.test.ts` (new).** Literal budget
map: persona-router SKILL.md 5,000; routing-details.md (and any
persona-router/references/*.md) 8,000; catalog.json 2,500; personas/*.md 4,500;
signals/*.json 2,500; massa-ai SKILL.md 21,000 (freeze). Prints the resolved
file population beside verdicts and fails on an empty glob (dead-subject
guard). Red-first ordering enforced in tasks: test lands before slimming and is
observed red against the pre-slim tree.

**C9 — `scripts/install-skills.sh` double-surface probe +
`scripts/tests/test-skills-check-double-surface.sh` (new).** In `check` action
for the claude platform: read `install-state.json` (`STATE_PATH`, v2) and
`$TARGET_HOME/.claude/settings.json`; when `skillsOwner === "repo"` AND
`enabledPlugins["massa-ai@massa-ai"] === true`, emit a drift row naming both
surfaces → existing drift aggregation exits 1 (`install-skills.sh:862`).
Missing `enabledPlugins` key or missing state file → no drift (spec edge
cases). Implementation via the repo's inline-bun-heredoc pattern; `--apply`
and `--dry-run` behavior untouched (7-step protocol: argv preserved, read-only
export unchanged, state round-trip untouched). Shell test drives fixture
`TARGET_HOME`s: both-surfaces → exit 1 + named surfaces; single-surface and
missing-key fixtures → exit 0.

**C10 — Bundle regeneration.** `bun scripts/generate-skill-artifacts.ts` after
every skills/ edit; `--check` green; `skill-artifact-parity.test.ts` green
(byte-identical per host, new files included in inventory diff).

**C11 — User-machine dedupe (Execute tail, no repo commit). Order is
load-bearing (Plan Challenge F1):** `apps/claude-plugin/install.sh` (reached
via `install-harness.sh:282`) actively re-registers the plugin by default and,
on its plugin route, `remove_file_route_artifacts()` deletes the loose
`~/.claude/{commands,agents}/massa-ai-*.md` files. Therefore:
(1) Refresh user-level installs FIRST, with registration suppressed:
`MASSA_AI_SKIP_PLUGIN_REGISTRY=1` on every installer invocation → 17-agent
roster + `massa-ai-*.md` commands current. (2) `rm` the two broken symlinks.
(3) LAST: read `~/.claude/settings.json` (read-before-write; quote only
`enabledPlugins`/`hooks` in evidence — the file carries a live OAuth token,
F4), disable `massa-ai@massa-ai` in `enabledPlugins`, and align
`~/.claude/plugins/installed_plugins.json` enablement.
(4) Falsifying re-check after everything: `settings.json` disabled +
`installed_plugins.json` not enabled + loose commands/agents files present with
current content. Stale plugin cache (`1.2.1`) left in place — inert once
disabled (F5, accepted). All steps reversible.

**C12 — CHANGELOG.** `### Changed` (catalog v2, slim router, prompt
compression, pin fast path) + `### Added` (size-budget gate, double-surface
probe) under `[Unreleased]`.

**C13 — `scripts/__tests__/validate-repository.test.ts` v2 alignment (Plan
Challenge F3).** Lines ~317–428 hard-assert `schema_version === 1` (twice) and
require `primary_signals`/`negative_signals`/`secondary_lens_signals` as
top-level catalog entry fields. Update to assert `schema_version === 2`, the
new entry field list (`id, display_name, aliases, summary, prompt_path,
signals_path`), existence of each `signals_path` file, and the three signal
arrays inside each signals file. This is a gate repoint (moved subject), not a
weakening: every v1 assertion keeps an equivalent v2 assertion.

## Reuse

- Drift aggregation + `RESULTS_FILE` pattern in `install-skills.sh` (C9 emits a
  row, no new exit machinery).
- Inline bun-heredoc JSON reads (installer house pattern; no jq).
- `namedSection` helper in `skills-harness-integrity.test.ts` if section-scoped
  assertions are added; existing test untouched otherwise.
- `generate-skill-artifacts.ts` inventory diffing — new files need no generator
  change (verify at first regeneration).
- v1 signal arrays and summaries copied, not rewritten.

## Risks & Concerns

| Risk | Mitigation |
| --- | --- |
| Slimming deletes a gate-anchored sentence | Anchors enumerated above; task checklist quotes them; integrity suite runs per task |
| Hidden consumer of catalog v1 shape | Sweep at execute: `grep -rn "primary_signals\|schema_version" skills/ scripts/ apps/*-plugin/skills/` before C3 lands; bundles regenerate |
| `authorityGrants` widening is a no-op on the new file | Deliberate seeded-red before keeping the widened list |
| Installer edit breaks `--apply`/state round-trip | Probe is read-only, scoped to `check` action; shell suite covers both fixture polarities; existing installer tests must stay green |
| Prompt compression drops persona substance | Per-prompt theme checklist (section themes present) in tasks; byte ceiling is the only hard gate, themes reviewed in validation |
| User-level agents installer provenance unclear (which script writes `~/.claude/agents/`) | Execute verifies by reading `install-harness.sh`/plugin `install.sh` before running; evidence-or-block |
| Stale `~/.claude/AGENTS.md` bootstrap block after C6 | `install-skills.sh --apply` recopies the block; diff recorded |
| Installer re-registers plugin / deletes loose artifacts (F1) | C11 order: refresh-with-suppression first, disable last, falsifying 3-file re-check after |
| Secret leakage into git-tracked validation evidence (F4) | settings.json quoted only for `enabledPlugins`/`hooks`; no raw dumps of user config |
| Stale plugin cache serves year-old skills if re-enabled (F5) | Disabled + re-verified last; cache inert; noted in validation |
| Same-session walkthrough reads stale skills (F6) | PRT-02 walkthrough restart-gated; recorded as such in validation.md |

## Verification map (PRT → deterministic check)

| PRT | Check |
| --- | --- |
| 01 | settings.json content + `ls ~/.claude/agents` = 17 roster + symlinks absent |
| 02 | pin line present; integrity test green; routing walkthrough (validation) |
| 03/04/05 | `skill-size-budgets.test.ts` green after observed red; signals files diff-equal to v1 arrays |
| 06 | SKILL.md contract text present (fast path b); graceful-skip line present |
| 07 | gate red-first evidence + population print |
| 08 | shell suite: exit 1 both-surfaces, exit 0 otherwise |
| 09 | `generate-skill-artifacts.ts --check`, `bun run test:scripts`, `bun run lint`, CHANGELOG diff |
