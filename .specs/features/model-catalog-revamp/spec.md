# Spec — Model Catalog revamp (models replace tiers)

- projectId: `massa-ai` · workflowSessionId: `feature-model-catalog-revamp`
- Workflow: feature (explicit route). By the ladder this is Spec-driven size: about 60
  files, a public registry format, and an overlay change. The user asked for it to stay
  contained in the feature workflow.
- Branch: `feat/model-catalog-revamp` (worktree `/Users/luizmassa/Projects/massa-ai-wt-catalog`,
  base origin/main @ v1.60.1). The branch is one PR (user, 2026-09-22) carrying:
  - `a075e1bb`, the agent-runtime-drift follow-ups T1/T2 moved over from the main
    checkout;
  - `.specs/features/api-log-clarity/`;
  - this feature.

## Problem

The Web UI Model Catalog (`/ui#/profiles` → Model Catalog) is hard to use:

- Every profile cell is a free-text provider/model pair, repeated for each tier (`light`,
  `standard`, `deep`).
- Default Profile per Tool (`hostDefaults`) adds indirection on top.
- Per-Workflow Tier Overrides (`workflowTiers`) is dead data: `workflowTier()` has no
  production caller.
- Per-Agent Tier Overrides (`agentTiers`) is another tier indirection.

The user wants profiles to be the only lever, with each model picked from a typed catalog.

## Decisions (user, 2026-09-22)

- **D1: agent models are set per profile, seeded.** Each profile has one default model per
  tool plus optional per-agent overrides. Built-in profiles ship overrides that reproduce
  today's spread:
  - 14 deep agents use the profile default;
  - builder, designer and test-engineer use the standard model;
  - documentation-agent uses the light model.
- **D2: each catalog model belongs to one tool** (`claude|codex|cursor|opencode`).
  Dropdowns list only that tool's models. The 1M-context flag is valid only for Claude
  Code.
- **D3: keep the aliases.** The catalog seeds pinned Haiku 4.5, Sonnet 5, Opus 5.5 and
  Fable 5.1, **and** the `haiku`/`sonnet`/`opus` aliases. Built-in profiles keep using the
  aliases.
- **D4: cells store the resolved model string** (e.g. `claude-sonnet-5[1m]`), not a
  catalog id. The catalog only supplies dropdown options. So references can never dangle,
  and no model id is a public contract.
- **D5: a v1 overlay is backed up, not migrated.**
- **D6: one PR.** It carries the drift follow-ups, the logging work and this feature.

## Registry v2 shape (`skills/model-profiles.json`, `version: 2`)

```jsonc
{
  "version": 2,
  "models": {                           // keyed by id: overlay merge key only
    "claude-sonnet-5":     { "name": "Sonnet 5", "host": "claude", "provider": "", "model": "claude-sonnet-5", "context1m": false },
    "claude-alias-opus":   { "name": "Opus (latest)", "host": "claude", "provider": "", "model": "opus" },
    "opencode-go-glm-5-2": { "name": "GLM 5.2", "host": "opencode", "provider": "opencode-go", "model": "glm-5.2" }
  },
  "profiles": {
    "balanced": {
      "description": "…",
      "hosts":  { "claude": { "model": "opus", "effort": "high" },
                  "cursor": { "model": null, "effort": null } },     // null = inherit
      "agents": { "builder": { "claude": { "model": "sonnet", "effort": "high" } } }
    }
  }
}
```

- **Resolved model string.** A catalog entry resolves to
  `(provider ? provider + "/" : "") + model + (context1m ? "[1m]" : "")`. One function
  builds this string, and the server and the UI both call it.
- **Resolution** for an agent on a tool: `profile.agents[agent][host]` first, then
  `profile.hosts[host]`.
- **Deleted:**
  - `resolveTier`, `workflowTier`;
  - the registry keys `tiers`, `hostDefaults`, `workflowTiers`, `agentTiers`;
  - charter `metadata.model_tier`;
  - the generator's `SPECIALIST_NAMES`. The inventory becomes a `skills/agents/*/SKILL.md`
    directory scan, the same way `generate-skill-artifacts.ts:155-166` already scans.
- **Selection:** `--profile` > `MASSA_AI_MODEL_PROFILE` > install-state `modelProfile` >
  `"balanced"`. The validator requires `profiles.balanced` to exist.
- **Validator rules:**
  - A model's `host` must be a known tool.
  - `model` must be non-empty.
  - `context1m` is allowed only when `host = claude`.
  - A cell is `{model: string|null, effort}` and the effort follows that tool's enum.
  - An agent override's host must be a known tool.
  - Cells are never cross-checked against the catalog (D4).
- **Overlay** `~/.config/massa-ai/model-profiles.json` stays a delta:
  - A `models.<id>` entry is replaced whole; a `null` value tombstones it.
  - A profile merges per `hosts.<host>` leaf and per `agents.<agent>.<host>` leaf. A
    `null` leaf is a tombstone, and `_delete: true` tombstones the whole profile.
  - Reuse `mergeFlatMap` and `normalizeFlatMap` (`model-profiles.ts:648,756`).
  - Upgrades replace only the built-in file, so the overlay survives both restart and
    upgrade.
- **v1 overlay (D5).**
  - It is detected by any of the keys `tiers|hostDefaults|workflowTiers|agentTiers`, or by
    a `hosts.<host>` value that has no `model` key (a tier map).
  - On load it is renamed to `model-profiles.v1.json`, or to `model-profiles.v1.<epoch>.json`
    if that name is taken. The loader logs one warning naming the backup path and uses the
    built-ins.
  - This is the only mutation on the read path, and it happens once.
- **UI edit semantics (D4).**
  - Editing a catalog model rewrites the cells whose tool matches and whose string equals
    the model's old resolved string, in the unsaved overlay state.
  - Deleting a model always succeeds. Cells that still hold its string show it as
    `custom: <string>` in the dropdown.
- **ALLWF-03**, "the verifier and read-only agents run the strongest model"
  (`skills/massa-ai/references/spec-driven/sub-agents.md:198-199`).
  - The rule becomes: in built-in profiles, read-only agents carry no override, so they
    resolve to the profile default. By convention the default is the profile's strongest
    model.
  - `subagent-parity.test.ts` (~`:870,:976`) asserts this over the built-in profiles.
  - **Accepted risk:** a user overlay can choose a weaker default. The UI help text says so.

## Acceptance Criteria

- **AC1: tiers are gone.** No `tiers`, `hostDefaults`, `workflowTiers`, `agentTiers`,
  `model_tier` or `resolveTier` remains in any of these places:
  - the registry JSON, `scripts/lib/model-profiles.ts` and the generator;
  - `scripts/verify-model-tokens.ts` and `scripts/verify-model-ids.ts`, which now walk v2
    cells and agent overrides and collect resolved strings;
  - the tools-api routes and the Web UI;
  - the 18 charters, including the Model Hint text in judge and meta-judge;
  - `skills.yml` (its model_tier check is removed), `packages/shared/src/profile-switch/`,
    and the docs listed in T4.

  Sensor: `git grep -nE 'model_tier|workflowTiers|agentTiers|hostDefaults|resolveTier|charterTier'`
  outside `.specs/` and `CHANGELOG.md` history returns only the v1-detection literal and
  its test.
- **AC2: generation is byte-identical except for the judge Model Hint.** With a scratch
  `XDG_CONFIG_HOME` and a fixed install-state, run `bun run generate:artifacts` at
  `a075e1bb` and on the branch tip. The `apps/*-plugin/agents/**` and
  `apps/*-plugin/agent-profiles/**` trees are identical, with two allowed exceptions:
  - the Model Hint hunk in the `judge` and `meta-judge` files, for every tool and profile;
  - the `model_tier` line removed from the charter copies under `apps/*-plugin/skills/agents/`.

  Sensor: a recursive `diff -r` whose remaining hunks are listed in `validation.md`.
- **AC3: the catalog is seeded.** The built-in `models` contains:
  - Haiku 4.5 `claude-haiku-4-5`, Sonnet 5 `claude-sonnet-5`, Opus 5.5 `claude-opus-5-5`
    and Fable 5.1 `claude-fable-5-1`;
  - the `haiku`, `sonnet` and `opus` aliases;
  - every codex and opencode model string that the v1 built-in profiles reference.

  Sensor: every non-null model string in every built-in cell and override is a
  catalog-resolved string for that tool.
- **AC4: Models CRUD.** The Model Catalog tab has a Models section.
  - The add form has Name, Tool, Provider (optional), Model, and a 1M context checkbox.
    The checkbox renders only when Tool is Claude Code, and it appends `[1m]`.
  - Every row has Edit and Delete. Edit rewrites the matching cells (D4).
  - Save & Apply persists the catalog to the overlay.
  - A round-trip test covers the sequence: write, then reload, then replace the built-in
    JSON; the user models are still present.
- **AC5: the profile grid uses dropdowns.**
  - Rows are tools and columns are profiles.
  - Each cell is a model `<select>` listing that tool's catalog models, plus `Inherit`
    (null), plus `custom: <string>` when needed, with the existing effort control next to
    it.
  - There are no tier rows, no Default Profile per Tool section, and no Per-Workflow
    section.
  - Profile add, duplicate, delete and restore still work.
- **AC6: per-agent model overrides.**
  - The section has a profile selector.
  - Its rows are the agents the server reports (`payload.agents`, from the directory scan).
  - Its cells use the same dropdown, whose first option is `Profile default`, plus effort.
  - The generator resolves an agent's override before the profile default. A test proves
    it: an override on one agent changes only that agent's emitted file.
- **AC7: v1 overlays are backed up.** A fixture v1 overlay gets renamed to
  `model-profiles.v1.json` exactly once, the loader logs one warning, and the registry
  equals the built-ins. A v2 overlay is never renamed.
- **AC8: selection and switching are unchanged.**
  - `profile_list`, `profile_set`, the `massa-ai-config profile` and `doctor` CLIs, and
    the Active Profile sub-tab keep their current tests green.
  - Where `hostDefaults` used to be the fallback, the active label now falls back to
    `balanced`.
- **AC9: gates.** All of these pass in the worktree:
  - `bun run build`, `type-check`, `lint`, `test`;
  - `test:scripts`, `test:plugins`;
  - `generate:artifacts --check`.

  The CHANGELOG `[Unreleased]` has a **Changed** entry that names the removed registry
  keys and the v1-overlay backup behavior.

## Tasks (1 commit each)

- **T1 Data layer.**
  - `model-profiles.ts`: v2 types, validator, merge/normalize/count (breakdown
    `{models, profiles}`), `resolveAgent`, selection fallback, v1 detection and backup,
    and the shared `resolvedModelString`.
  - The seeded JSON and the 18 charters, including the judge and meta-judge Model Hint.
  - The generator: directory-scan inventory and override-first resolution.
  - `verify-model-tokens.ts`, `verify-model-ids.ts`, `skills.yml`, and the frontmatter.ts
    comment.
  - Scripts tests, including subagent-parity `:118-126`, `:307-310` and ALLWF-03.
  - Gate: the AC2 diff and `test:scripts`.
- **T2 API and switch.**
  - tools-api `model-registry.ts`, `model-registry-stream.ts` (`:264`) and `profiles.ts`:
    payload `agents: [{name}]` and breakdown `{models, profiles}`.
  - The `profile-switch/engine.ts` fallback.
  - Both `config-cli.ts` comments.
  - Tests.
  - Gate: tools-api and shared tests.
- **T3 Web UI.**
  - `registry.ts`, `registry-state.ts`, `wire-view-handlers.ts` and `styles.css`.
  - Extract `renderEffortControl` (from `registry.ts:371-383`) and a model-select renderer.
  - Reuse `collectFormData` and the `registry-form-*` pattern.
  - Update the tests and fixtures `render-golden.json` and `agent-tiers-parity.json`.
  - Gate: web-ui tests and type-check.
- **T4 Docs and close-out.**
  - Docs: `CLAUDE.md` (model-profiles paragraph), `skills/AGENTS.md` (add-an-agent
    procedure `:383-386`), `skills/massa-ai/references/agent-orchestration.md` (Model
    Diversity Fallback), `references/spec-driven/sub-agents.md:181,198-199`,
    `docs/CHEATSHEET.md:187,199`, `docs/adding-a-host.md:105-110`, `FEATURES.md`.
  - `CHANGELOG.md`, the `.specs` STATE/FEATURES/HANDOFF, and `validation.md`.

## Out of scope

- Runtime per-workflow model routing. `workflowTiers` was never consumed, so removing it
  loses nothing.
- Discovering models from the host tools. The catalog is typed by hand, as requested.

## Risks

- **R1: the agent list may change.** The `feat/agent-roster-consolidation` worktree may
  change the agent list. The directory scan and the dynamic UI absorb that. Only the
  parity test's expected list and the built-in `agents` overrides need a rebase touch.
- **R2: the public format changes.** Third-party readers of v1 `skills/model-profiles.json`
  break, and v1 overlays are backed up rather than applied. The CHANGELOG calls out both.
- **R3: ALLWF-03 becomes convention-only for user overlays.** This is accepted and
  documented.
