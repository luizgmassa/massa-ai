# Changelog

All notable changes to massa-ai are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **The persona layer and the sub-agent layer now have a stated contract.** Auditing
  `skills/persona-router/SKILL.md` against the 15 charters in `skills/agents/*/SKILL.md`
  found five boundaries that were never written down. None was a runtime bug; each let a
  reader draw a wrong conclusion with no gate to catch it.
  - The **Capability Packet** gains an optional `persona` field, declared identically in
    all three of its definitions (`skills/AGENTS.md`, `references/agent-orchestration.md`,
    `references/subagent-design.md`). It carries the cataloged persona **id only**, never
    the persona prompt, as advisory framing that never overrides an agent's charter
    Restrictions, scope, or permissions. Absent is the valid default — no workflow emits
    it yet.
  - **All 15 charters** gain two adjacent Restrictions lines: a supplied persona shapes
    emphasis only and the charter's Restrictions win on conflict; and the self-routing ban
    now covers `persona-router` and reading a `personas/` prompt file, not just the
    `massa-ai` router. Together they mean an agent may *receive* a persona and may never
    *select* or *expand* one — the second half closes a path by which an agent handed a
    bare id could have opened a persona prompt claiming implementation ownership.
  - **`persona-router` Stop Conditions are scoped.** The clause forbidding subagents and
    subprocess orchestration was written unscoped and could be read as disabling the whole
    16-agent dispatch layer during a persona session. It now bounds the routing step only
    and says workflow-mandated dispatch is unaffected.
  - **A new Persona And Sub-Agents section** states that a persona grants no tool access,
    no write scope, and no permission, never authorizes inline implementation in place of
    a dispatch, and never widens a builder's disjoint write set — and that a persona route
    is not a specialist consultation, naming the four persona↔agent pairs that overlap
    (`senior-mobile-engineer`↔`mobile-specialist`,
    `senior-mobile-qa-automation-engineer`↔`test-engineer`,
    `context-skill-harness-engineer-architect`↔`architecture-specialist`,
    `product-manager`↔`requirements-analyst`).
  - **Nine discriminating tests** land as defect class 7 in
    `scripts/__tests__/skills-harness-integrity.test.ts`. Charter cases enumerate
    `skills/agents/*/` from disk and are scoped to the `## Restrictions` span, so a charter
    added later cannot skip the rules and a line landing in the wrong section still fails.
    Two cases assert *absence* (the superseded charter sentence, the unscoped
    persona-router clause), because presence alone would pass if the old text were
    re-added alongside the new.
  - Charter bodies feed **two** generators — `generate-skill-artifacts.ts` (raw copy into
    `apps/*/skills/agents/`) and `generate-subagent-artifacts.ts`, which embeds the body
    verbatim into `apps/*/agents/massa-ai-*.{md,toml}`. Both mirrors are regenerated and
    both `--check` gates are clean.
- **Workflows now emit the `persona` field the Capability Packet defines.** The prior entry
  defined the field but deferred populating it; all 24 `Dispatch: massa-ai-*` blocks across
  the 16 workflow files carry it now, uniformly — no allowlist. The field stays optional
  (absent is valid), carries the cataloged persona **id only**, never the persona prompt,
  and never overrides the receiving charter's Restrictions.
  - The persona-router boundary's three presence-only assertions for persona-router prose
    (Stop Conditions scoping; grants-no-authority; not-a-specialist-consultation) are now
    section-scoped to the exact heading each rule lives under.
  - **All five presence-only assertions are closed, and the detection method changed to
    close them.** A phrase list (`persona may grant`, `grant authority to the persona`)
    killed the two mutations it was written against and nothing else — `a persona is
    permitted to write` and `personas hold write access` both passed it. Enumeration
    cannot win, since the ways to write "persona has power" are unbounded, and each
    pattern added to chase them raises false-failure risk. The scan now inverts the test:
    every sentence mentioning a persona alongside an authority term must carry a negator.
    Real rules already do ("grants **no** tool access", "**never** overrides"), so correct
    prose passes while an affirmative grant fails however it is phrased. Coverage extends
    beyond `persona-router/SKILL.md` to all three packet definitions — the worst place for
    a contradicting sentence, and previously unguarded.
  - A new discriminating test enumerates every `Dispatch:` block on disk (no hardcoded
    roster) and fails if any one lacks the persona line; the existing packet-definition
    uniqueness test is scoped to definitions only so dispatch-block *uses* of the same
    canonical clause no longer collide with it.

## [1.6.0] - 2026-07-26

### Added

- **All four host plugins now publish to npm and GitHub Packages.**
  `@massa-ai/claude-plugin`, `@massa-ai/codex-plugin`, and `@massa-ai/cursor-plugin` join
  `@massa-ai/opencode-plugin` as real workspace packages, each installable from a registry
  tarball with no repo checkout present. None declares a `test` script, so turbo's `test`
  task never double-runs `apps/*/__tests__` alongside the existing `bun run test:plugins`.
- **`scripts/generate-skill-artifacts.ts` bundles `skills/` into every plugin.** Emits real,
  byte-identical files (never symlinks — `npm pack` silently drops them) for
  `skills/massa-ai/`, `skills/persona-router/`, and every `skills/agents/<name>/SKILL.md`
  charter into `apps/<host>-plugin/skills/` for all four hosts, plus
  `apps/opencode-plugin/lib/opencode-config.cjs` and the codex/cursor
  `hooks/massa-ai-hook` binary. `--check` diffs full directory inventories per managed
  subtree, catching both a changed source file and a stale bundle entry left behind after
  a source deletion.
- **Version-manifest equality gate (discovery-based, not a hardcoded list).**
  `scripts/version-manifest-equality.ts` globs every `package.json` under `packages/*` /
  `apps/*` plus any `apps/*/.<host>-plugin/plugin.json` dotdir manifest and asserts each
  equals the root version — closing the gap that let
  `apps/cursor-plugin/.cursor-plugin/plugin.json` drift to `1.0.0` five minors behind root
  with `version-sync.ts`'s hardcoded `EXTRA_VERSIONED_MANIFESTS` never erroring on the
  omission.

### Changed

- **`install-skills.sh` copies instead of symlinking.** Nothing it installs depends on
  this repo checkout staying at the path it was installed from. Ownership between the
  repo installer and each plugin's own `install.sh` is coordinated the same way MCP
  registration is: a per-host `skillsOwner: "repo" | "plugin"` field in
  `install-state.json` (v2), with an explicit repo `--apply` always taking precedence
  over a prior plugin install.
- **`publish.yml`'s build-output artifact list, GitHub Packages rescope list, and
  `verify-package-contents.ts`'s expected-manifest gate all extended from 5 to 8
  packages** to cover the three new plugins, whose entire publishable surface is static
  source (no `dist/`).

## [1.5.0] - 2026-07-26

### Added

- **Publish-artifact package-contents gate.** `scripts/verify-package-contents.ts` stages a
  scratch copy limited to exactly the paths `publish.yml`'s artifact step declares, packs it,
  and diffs the tarball inventory against a committed manifest. It reproduces the
  no-`actions/checkout` condition the publish jobs actually run under, so a package's `files`
  field can no longer promise content the artifact never uploaded. Wired into CI as a
  blocking step and mutation-verified in both directions.
- **JSONC support for OpenCode config.** `scripts/lib/opencode-config.cjs` (vendored
  byte-identically into `apps/opencode-plugin/lib/`) resolves the config path, parses with a
  state-machine comment stripper that leaves `https://` values intact, and backs up before
  every write.

### Changed

- **OpenCode installers edit the config file you actually have.** Both writers previously
  hardcoded `opencode.json` and parsed it with bare `JSON.parse`, so a `opencode.jsonc` user
  got a second competing file and a commented config aborted the install outright. Resolution
  is now `opencode.jsonc` → `opencode.json` → create `opencode.jsonc`, with a warning when
  both exist because OpenCode merges `.json` over `.jsonc`. A fresh install now creates
  `opencode.jsonc`.

### Removed

- **The `qwen-profile.json` content-hash fixture and its whole maintenance tax.** Editing any
  tracked file — including `README.md` or a workspace `package.json` — used to break two
  tests until the manifest was refreshed, and 35 of its 71 entries were already stale. Gone
  with it: `qwen-fixture.ts`, two test files, `prepare-qwen-e2e-fixture.ts`, the
  `update-qwen-hashes` script, `release-version.ts`'s `repinFixtureHashes`, and the release
  workflow's fixture pathspec. The shared E2E index identity now derives from the resolved
  embedding config plus the commit SHA, so per-profile isolation survives the removal.
- **CHANGELOG authoring rules in `skills/AGENTS.md`.** The rules lived in three files naming
  three different canonical sources. `CONTRIBUTING.md` is now the only copy; `CLAUDE.md`
  links to it and keeps the release mechanics; the harness bootstrap block drops the section
  entirely. A single-source test asserts the heading-to-bump table appears exactly once.

### Fixed

- **Published `@massa-ai/opencode-plugin` tarballs were missing their 15 agent charters.**
  The manifest declared `files: ["dist", "agents/*.md"]`, but the publish jobs have no
  `actions/checkout` and the build artifact uploaded only `dist` and `package.json`, so
  `agents/` was never present to include. Shipped broken since the package was first
  published; caught by the new gate on its first run.

## [1.4.0] - 2026-07-26

### Removed

- **The chat-restart and context-handoff surface is gone.** `restart-save`, `restart-load`,
  and `agent-handoff` were three workflows encoding a manual save/resume protocol that
  duplicated `.specs/` artifact state and the host's own compaction — three router rows and
  two references the agent paid for on every routing decision, to re-derive state that was
  already canonical on disk. Deleted with them: `references/restart-state.md`,
  `references/handoff-package.md`, and the `handoff-writer` specialist, whose only callers
  were those workflows.

  The specialist roster drops **16 → 15**, so each host now installs 15 agents (60
  artifacts, not 64). Registries, the generator, both shell installers, `README.md`,
  `FEATURES.md`, and every guard test moved in the same commit — a partial removal fails
  `skills-harness-integrity`, which rejects any dangling harness path.

  Surviving deliberately: `workflows/long-session.md`, now the sole owner of the Session
  Guide, and the MCP `handoff_begin`/`handoff_accept`/`handoff_cancel`/`handoff_list_pending`
  tools, which are published product surface rather than harness routing. The new contract
  suite asserts their survival as a negative control, so a future blunt sweep for "handoff"
  cannot take them out.

### Added

- **Implementation workflows now deliver, not just commit.**
  `references/implementation-delivery.md` defines the chain that was missing after "one
  atomic commit per task": worktree isolation → push → PR via `gh` → CI watch → bounded
  repair loop → **stop and ask before merging**. Two rules are stated rather than left to
  judgment. Worktree isolation has **no size exemption** — a one-line fix is isolated like a
  twelve-file feature, because "too small to isolate" is exactly the call that strands
  half-finished work on a shared branch; only two skip reasons are legal (not a repository,
  or the user declined). And merge is **never** automatic: green CI is the precondition for
  asking, not the approval, which matters in a repo where merging to `main` auto-cuts a
  release. Missing `gh`, missing remote, or absent CI each downgrade the chain and record
  the skip instead of silently reporting success.

- **A circuit breaker for agents going in circles.**
  `references/root-cause-scripts.md` fires after **two** consecutive failed fix attempts on
  one symptom — two, not three, because the second failure is where writing a probe becomes
  cheaper than another guess. Its value is the forbidden list: reading more source,
  re-reasoning about the code, adding a defensive guard, or rerunning the same command
  uninstrumented are all explicitly not progress. The only legal next action is an
  executable probe emitting **real runtime data**, held to a six-point contract
  (deterministic, prints observed beside expected, exits non-zero while the bug is present,
  probes exactly one hypothesis, never touches production state, and is either deleted or
  promoted to a regression test). An unbuildable probe means `Blocked`, not a return to
  guessing.

- **Doc blocks, rationale comments, and tests are now obligations, not habits.**
  `references/code-annotation.md` maps 12 languages to their native doc syntax and requires
  a block on every *created or updated* public unit — updated included, since a doc
  describing behavior that has since changed is worse than none. Alongside it, a
  three-field rationale comment (`Why:` / `Impacts:` / `Test:`) records why the change
  exists, what feature it serves, and the exact command that exercises it. Test coverage is
  specified per change shape, and the bug-fix rule is the sharp one: a regression test must
  be run against the *unfixed* code first, because a test that has never been red proves
  nothing.

- **Every workflow now reads the project before acting.**
  `references/project-context.md` defines a five-tier intake sweep — agent contract
  (`AGENTS.md`/`CLAUDE.md`, nearest ancestor wins), host config (`.claude/`, `.cursor/`,
  `.github/`), product docs (`README.md`, `CONTRIBUTING.md`, `docs/`), delivery config (CI
  workflows, toolchain pins, `CHANGELOG.md`), and live `.specs/` state — with an explicit
  precedence order for conflicts and a once-per-session dedupe guard. All 35 workflows load
  it; the 16 that mutate the repository additionally load the three references above, and
  the 19 read-only ones provably do not.

- **`scripts/__tests__/workflow-harness-contract.test.ts`** — 46 assertions that make the
  above a gate rather than a convention. The workflow set is walked off disk, so a workflow
  added later is force-enrolled instead of silently exempt; scope is asserted in both
  directions, catching an audit workflow that quietly gains mutation permissions as well as
  an implementation workflow that loses them; and invariants are checked **by value**, so a
  reference shipping the wrong circling threshold or dropping the merge-approval sentence
  fails even though every file still exists.

## [1.3.1] - 2026-07-26

### Fixed

- **v1.3.0 was tagged and released on GitHub but published no packages.** Two independent
  defects, in sequence.

  The merge of #29 never triggered `release.yml` at all. Its commit body *explained* the
  skip-ci marker and quoted it verbatim, and GitHub scans the **entire** commit message for
  that marker, not just the subject — so CI was skipped on the merge commit, and with no
  completed `CI` run there was no `workflow_run` event for `release.yml` to fire on. The
  chain was never wrong; nothing pulled the trigger. Recorded in `CONTRIBUTING.md` and
  `CLAUDE.md`. No test can guard this one: CI is the thing that gets skipped.

  Once dispatched manually, the `release` job succeeded — tag, GitHub Release and the
  deploy-key push all worked — and `publish` then failed on
  `bun install --frozen-lockfile`: `lockfile had changes, but lockfile is frozen`.
  `version:sync` rewrote `version` fields only, but `packages/core` pins
  `@massa-ai/shared` to the **exact** root version rather than `workspace:*` — a contract
  `verifyStaticContract` in `scripts/verify-tree-sitter-grammars.ts` asserts. So the bump
  left that pin at `1.2.1` while `shared` became `1.3.0`, the workspace copy stopped
  satisfying it, and bun resolved `@massa-ai/shared` from the **registry** instead. A
  successful install would have been worse than the failure: `publish.yml`'s resolve step
  only rewrites the literal `"workspace:*"`, so `@massa-ai/core@1.3.0` would have shipped
  declaring a hard dependency on `@massa-ai/shared@1.2.1`, violating ARV-R7. The same drift
  had already broken `bun run test:scripts` on `main`, via that static contract — a gate
  the skipped CI run would otherwise have caught before publish ever started.

  `scripts/version-sync.ts` now realigns every non-`workspace:` `@massa-ai/*` dependency
  spec to the version it is syncing, in the one place both `release.yml` and `publish.yml`
  bump versions. Two guards were added: a `syncVersions` unit test for the realignment, and
  `scripts/__tests__/workspace-dependency-pinning.test.ts`, which fails on any
  cross-package spec that is neither `workspace:*` nor the current root version, and on any
  `bun.lock` entry resolving a `@massa-ai/*` package off-workspace. `bun.lock`'s
  `workspaces[*].version` fields are *not* validated by bun, so their staleness is
  cosmetic and was never the cause.

## [1.3.0] - 2026-07-26

### Added

- **Releases are now automatic.** Merging a PR into `main` with a green CI run derives the
  next version from this file, tags it, publishes a GitHub Release, and pushes the packages
  to npmjs.org **and** GitHub Packages. New `.github/workflows/release.yml` owns the chain;
  `publish.yml` became a reusable workflow (`workflow_call` + `workflow_dispatch`, both
  requiring an explicit `ref`) with no triggers of its own.

  The bump comes from the `[Unreleased]` headings, via the new, unit-tested
  `scripts/release-version.ts`: a non-empty `### Added`/`### Changed`/`### Removed`/
  `### Deprecated` is a **minor** bump, only `### Fixed`/`### Security` is a **patch**, and
  nothing releasable means **no release** — the run ends green with no tag. A heading with
  no bullets is ignored, so a stray empty `### Added` cannot force a minor. Major is never
  auto-incremented.

  The chain is sequenced with `workflow_call` rather than events on purpose: a tag or
  release created with `GITHUB_TOKEN` raises **no event**, so the intuitive
  `push tag → release → publish` wiring is dead at every arrow. That same recursion guard
  is what keeps the bump commit from starting another CI run, and so another release — no
  PAT is needed anywhere.

- **Packages are mirrored to GitHub Packages** under `@luizgmassa/*`. GitHub Packages
  resolves an npm scope to a GitHub *owner*, and `@massa-ai` is not one (the repo is
  `luizgmassa/massa-ai`), so publishing `@massa-ai/core` there fails with
  `403 Permission not_found: owner not found`. An isolated `publish-github-packages` job
  downloads its own copy of the build artifact and rewrites `name`, the `@massa-ai/*`
  dependency **keys**, `repository.url`, and `publishConfig.registry` before publishing —
  the npmjs.org artifact is never touched. The dependency-key rewrite is not cosmetic:
  without it `@luizgmassa/tools-api` would depend on `@massa-ai/core`, which does not exist
  on that registry. It runs `needs: [build, publish-packages, publish-apps]` so it can
  never race the npm jobs and leave the two registries divergent at one version.

### Removed

- **The GitHub Deployment surface.** `environment: DEPLOY` is gone from every job — that
  declaration is what wrote a Deployment record per publish (22 had accumulated). npm
  packages are released, not deployed. The environment carried no protection rules, so no
  approval gate is lost. **`NPM_TOKEN` must be re-created at repository scope**, since it
  lived only inside that environment.
- **The `next` prerelease channel.** The `workflow_run` auto-publish and `env.NPM_TAG` are
  removed; every merge now cuts a real `vX.Y.Z` on `latest`, which made `next` a duplicate
  publish of the same version.
- The `workflow_run.head_sha || github.ref` checkout fallback in `publish.yml`. With `ref`
  optional, a manual dispatch silently published the tip of `main` as `latest`; `ref` is
  now `required: true` on both triggers.

### Fixed

- **The first automated release could not push, because branch protection blocked its own
  release bot.** `release.yml` pushes the version-bump commit straight to `main`, and the
  branch ruleset there requires a pull request plus 5 status checks, so the push was
  rejected with `GH013: Repository rule violations found`. `--atomic` rejected the tag
  along with the commit, so nothing partial landed — no tag, no GitHub Release, npm still
  on 1.2.1, and the `publish` job skipped rather than running against a phantom ref. The
  atomicity design held; only the identity was wrong.

  The ruleset's bypass list is the only way through, and **GitHub Actions cannot be a
  bypass actor on a user-owned repository** — the API rejects it with `must be part of the
  ruleset source or owner organization`, and it is absent from the UI bypass list. The push
  now uses a write-enabled **deploy key** (`RELEASE_SSH_KEY`), which is the narrowest
  identity that *can* be a bypass actor: repo-scoped, git-only, no API access, no expiry.

  One behavioural consequence: unlike `GITHUB_TOKEN`, a deploy-key push **does** raise
  events, so ARV-R12 loop safety no longer comes from GitHub's recursion guard. The
  `[skip ci]` in the release commit subject is now load-bearing, backed by the fact that a
  second run finds an emptied `[Unreleased]` and derives no bump. The workflow comments
  that credited the old guard were corrected rather than left to mislead.

- **A path-filtered required status check deadlocked every PR that did not touch
  `skills/`.** `skills.yml` was filtered to `paths: ['skills/**']`, but its `validate` job
  is a required check in the `main` branch ruleset. A required check that never *runs* never
  *reports*, so the PR sits indefinitely on "Expected — waiting for status to be reported"
  rather than failing — it cannot be merged and there is nothing to re-run. The `paths:`
  filter is removed from the `pull_request` trigger (kept on `push`, where nothing requires
  it); the job is checkout plus frontmatter greps, ~8s, so running it on every PR is free.

  The trap is that this looks fine until the first PR that misses the filter. Audited the
  other four required checks — `build`, `mcp`, and both `Structural native tests` jobs are
  in `ci.yml`, which has no `paths:` filter and no job-level `if:`, so they always report.

- **skills.yml shellcheck issues.** Fixed 7 unquoted variables (SC2086) and 1 redirect
  style issue (SC2129). Behavior is identical; the script now passes `actionlint`.
- **The MCP server wrote 68 bytes to stdout on first run, breaking the stdio JSON-RPC handshake.** `initConfig()` in `packages/shared/src/config/config-loader.ts` announced `Created default config at <path>` on **stdout** via `console.log`. That branch fires only when `~/.config/massa-ai/config.json` does not exist yet — so it never fired on a machine that had already run massa-ai once, and always fired on a genuinely fresh install. Per this repo's own contract, a stdio MCP server's stdout carries nothing but protocol; one stray byte produces `connection closed: initialize response`. Now `console.error`. It deliberately does not use the shared logger: the logger reads config, so importing it here would be circular.

  This is the same bug class as the logger fix in the previous release, which moved every log level to stderr but left this one direct `console.log` behind.

  It had been failing CI on `main` for three consecutive commits (`26433af`, `4fa589b`, `85f1ad3`) and was misread as a flaky test. It was never flaky — it reproduced 3 of 3 times, and the byte count was the tell: `"Created default config at "` (26) + `"/home/runner/.config/massa-ai/config.json"` (41) + newline = exactly the 68 bytes asserted against.

  **The test was the deeper problem.** `mcp-stdout-clean.test.ts` inherited the developer's `HOME`, so the first-run branch it exists to guard never executed locally — it passed on every workstation while failing CI, which boots with a fresh `HOME`. It now spawns the server under a throwaway `HOME`/`XDG_CONFIG_HOME`, making the first-run path the path under test everywhere. Confirmed discriminating by reverting the fix and watching it fail locally, which it previously could not do.

- **massa-ai was invisible to every host's plugin manager, and its OpenCode specialists could not be selected by hand.** Three independent root causes, each confirmed by probing the installed host rather than reading the repo.

  1. **Claude Code: massa-ai was never a plugin.** `apps/claude-plugin/` had no `.claude-plugin/plugin.json` — the only host dir without a manifest — and the repo had no marketplace. `install.sh` copied commands and agents into `~/.claude/` and wired hooks, which works, but leaves the result permanently absent from `/plugin`: `~/.claude/plugins/installed_plugins.json` listed only unrelated plugins while all 13 massa-ai agents, 6 commands and 5 hooks were installed and firing. Added the manifest, `hooks/hooks.json` (addressed via `${CLAUDE_PLUGIN_ROOT}` — Claude Code copies the plugin dir on install, so an absolute repo path would break for everyone else), and `.claude-plugin/marketplace.json` at the repo root. `install.sh` still works unchanged.

     Since the plugin now ships hooks, installing both ways would ingest every lifecycle event twice. `install.sh` now skips its hook merge when `installed_plugins.json` holds a `massa-ai@*` key. The guard fails open — absent registry proceeds (the fresh-install case), malformed registry warns and proceeds — and resolves from `$HOME` rather than the install scope, because Claude Code records plugin installs at user scope even for `--project`. Verified at 5 / 0 / 5 owned entries across the absent, installed and malformed cases.

  2. **Codex: two separate bugs, one per symptom.** massa-ai had no `[marketplaces.*]` and no `[plugins."massa-ai@…"]` entry in `~/.codex/config.toml`, and `install.sh` wrote a flat `~/.codex/plugins/massa-ai/` rather than the `plugins/cache/<marketplace>/<plugin>/<version>/` layout Codex actually scans — so it could not appear in `/plugins`. Its manifest also diverged from all 203 installed Codex manifests: `skills` as an array instead of the string `"./skills/"`, no `interface` block (which is what the plugin UI renders), and a `hooks` key no other manifest has. Fixed the manifest and added `.agents/plugins/marketplace.json`; `codex plugin marketplace add` + `codex plugin add massa-ai@massa-ai` now yields `installed, enabled`.

     Separately, **`/hooks` showed no massa-ai hooks at all**, because the installer wrote flat entries (`{ type, command }`) where Codex requires a matcher-group whose `hooks` is an array. Codex addresses hook state as `"<file>:<event>:<group>:<hook>"`, so a flat entry has no `:<hook>` index, is never enumerated, cannot be trusted, and never fires — `[hooks.state]` held only the two group-0 entries belonging to other tools. `apps/claude-plugin/install.sh` already had the nested shape right; the Codex installer was a divergent copy that lost it. Both `hooks/hooks.json` and the installer now emit the nested form, and an install **migrates** owned flat entries rather than letting the idempotency check mistake them for correct wiring. Verified against a temp `HOME`: fresh install 6 nested / 0 flat, upgrade from flat 6 nested / 0 flat with user entries preserved, re-run still 6.

  3. **OpenCode: the 12 specialists were loaded but unreachable from Tab.** `scripts/generate-subagent-artifacts.ts` emitted `mode: subagent`, and OpenCode's Tab switcher lists `primary` and `all` agents only — `opencode agent list` showed every massa-ai agent as `(subagent)`. Now `mode: all`, which adds manual selection while keeping auto-delegation and `@`-mention.

     Same emitter, second bug: `model` was the charter's human-readable `metadata.model_hint` (`DeepSeek V4 Pro`), but OpenCode resolves only `provider/model-id` and silently falls back to the invoking agent's model otherwise — so none of the model pinning had ever taken effect. Added an `AGENT_MODELS_OPENCODE` table alongside the existing Claude and Codex tables, preserving the charter tier split. Cursor still uses the verbatim hint; it resolves models by alias.

     **User-visible:** OpenCode's Tab switcher gains 16 entries.
- **The agent harness was broken at its two load-bearing seams, and nothing tested either.** Full evidence with base-commit line numbers in `.specs/features/skills-harness-audit/audit-report.md`.

  1. **No workflow dispatch resolved on any host.** All 24 `Dispatch:` blocks across 16 workflow files named a bare role (`investigator`), while every host registers the prefixed name (`massa-ai-investigator`) — the prefix `scripts/generate-subagent-artifacts.ts` has always emitted. `subagent_type: "investigator"` matches nothing, so every delegating workflow — audits, `*-fix`, spec-driven validation — failed at dispatch or silently degraded to in-main-agent work with no record. Blocks now carry the host-resolvable name inline (`> **Dispatch: \`massa-ai-builder\`** (role: \`builder\`) — charter …`), so dispatch never depends on a reference file the router's own dedupe rules say may be skipped. `references/agent-orchestration.md` gained a **Name Resolution** section plus the degradation rule that was missing: if the named agent is unavailable *for any reason* — not registered, plugin not installed, spawning forbidden, unknown `subagent_type` — run the scope locally against the same output contract and report the skipped delegation; never retry under a guessed name. The prior prose covered only platform refusal, leaving "the agent does not exist" undefined.

  2. **`plan-critic`, `furps-analyst` and `handoff-writer` were phantoms.** `references/agent-orchestration.md` mandated "Always attempt a read-only `plan-critic` for both `depth: lite` and `depth: full`" while listing its Charter as "role-based (no charter)". There was no `skills/agents/plan-critic/`, no artifact on any host, and no registry row — so the Plan Challenge gate, which the startup contract runs on *every* plan, dispatched a name that could not exist. Same for the six-way `furps-analyst` fan-out in `furps-refinement`. All three are now real charters, sourced from the contracts that already existed (`agent-orchestration.md`'s Plan-Critic Contract, `references/furps/analyst-role.md`, `references/handoff-package.md`) rather than invented.

  3. **The Plan Challenge Policy shipped in two contradicting copies.** `skills/AGENTS.md`'s bootstrap block routed `feature`/`refactor` to the **lite** gate first, listed `design` under the full gate, and **delegated** lite to a subagent. Root `AGENTS.md` routed the same two workflows to the **full** gate, omitted `design`, and ran lite **inline**. Both were reachable through one instruction, because `[\`AGENTS.md\`](../../AGENTS.md)` resolves to the repo file from a checkout and to the installed host file from `~/.claude/skills/massa-ai/` — so the gate an agent applied depended on its vantage point. The bootstrap block is now the single source; root `AGENTS.md` carries a pointer instead of a policy body, and the four vantage-dependent links (`massa-ai/SKILL.md`, `workflows/the-fool.md`, `references/agent-orchestration.md`, `references/conversation-feedback.md`) name the installed bootstrap block explicitly. The substantive conflict is resolved in favor of the bootstrap block, which is what the router's own Plan Challenge Gate section already implemented.

  4. **`test-engineer` and `documentation-agent` charters claimed `read-only` while shipping `Write`/`Edit`.** The generator hardcoded both into `WRITE_AGENTS` and its comment stated the divergence as intent. Both charters now declare `permission: write`; their bodies already described the scoped write set (test files / doc files, disjoint). A new assertion ties charter permission to Claude `tools` and Codex `sandbox_mode` for all 16 charters.

  5. **Non-deterministic instructions.** The Knowledge Verification Chain in `exploration.md` and `spec-driven.md` said "never skip steps" with Context7 MCP as step 3 and no rule for Context7 being absent; an unavailable step is now recorded as a skipped sensor with its reason, never silently treated as answered. Dropped the "CodeNavi-style local notebooks" residual, which named nothing in this repo. The no-recursive-spawning rule existed only as orchestrator-side prose in `references/spec-driven/sub-agents.md`, so nothing constrained a subagent reading only its own charter — all 16 charters now carry it.

- **Three bugs that only surfaced once the installers actually ran.** The fix above made the plugin installers and MCP writer execute for the first time; all three of these were latent behind that no-op and broke real tools on first contact.

  1. **Codex refused to start: `failed to parse hooks config … unknown field 'SessionStart', expected 'description' or 'hooks'`.** `apps/codex-plugin/install.sh` wrote each hook event as a **top-level** key (`cfg[evt]`), but Codex accepts only `description` and `hooks` at the top level and requires events nested under `hooks` (`cfg.hooks[evt]`) — the shape `apps/cursor-plugin/install.sh` already used. The shipped placeholder `apps/codex-plugin/hooks/hooks.json` had the same flat shape. Both corrected, and an install now **migrates** an already-broken file: a top-level event key holding only `_massaAiOwned` entries is removed and re-written nested, backed up first; a top-level key containing unmarked user entries is left alone with a warning. Verified against the real `codex` 0.145.0 binary with a discriminating control — the old shape reproduces the error verbatim, the new and the migrated shapes parse silently — and a user's own matcher-group entries survive with their `matcher` and `statusMessage` intact. Note `codex doctor` does *not* read `hooks.json`; `codex exec` is what loads it, so `doctor` is useless as a gate here.

  2. **`npx @massa-ai/mcp-client` was not a runnable command, on any host.** `npm error could not determine executable to run` — the published package declares two bins (`massa-ai`, `massa-ai-config`) and neither matches the package name's last segment, so npx cannot infer one. MCP registration had therefore **never** worked through npx; the earlier "wrong file, wrong shape" bug had merely hidden it. Now `npx -y -p @massa-ai/mcp-client massa-ai` in both the JSON and TOML writers, with `-y` so npx never blocks on a prompt an MCP host cannot answer. A test pins the explicit bin name so the bare form cannot regress in.

  3. **The MCP server printed log lines on stdout, corrupting the JSON-RPC handshake.** This was the second, independent cause of Codex's `handshaking with MCP server failed: connection closed: initialize response`, and the source of OpenCode's `injected env (1) from .env` banner on every start. Two contributors: dotenv's banner (now `quiet: true` in `packages/shared/src/env.ts`) and — the larger one — `packages/shared/src/utils/logger.ts`, whose `write()` sent DEBUG/INFO to `console.log`. Every `logger.info()` anywhere in core landed on stdout: a freshly built server emitted 250 bytes of `[INFO] …` before any request. **All log levels now go to stderr**, which is the convention for stdio MCP servers and leaves stdout carrying nothing but protocol. A real `initialize` request now gets a valid JSON-RPC reply. New regression test `apps/mcp-client/src/__tests__/mcp-stdout-clean.test.ts` asserts stdout is byte-empty and logs land on stderr; it was confirmed discriminating by reverting the logger, rebuilding, and watching 2 of its 3 cases fail.

  Because `apps/opencode-plugin/install.sh` symlinks `dist/index.js`, a stale bundle silently keeps bug 3 — `bun run build` is part of the fix, not an afterthought.

### Added

- **Four new sub-agent charters, and the harness now guards its own contracts.** `skills/agents/` goes 12 -> 16: `plan-critic`, `furps-analyst`, `handoff-writer` (previously charter-less roles the workflows already dispatched) and `navigator`, which had shipped to Claude and Cursor only, with no charter, no registry row, and an explicit exemption from the generator's drift check. All four are generated for all four hosts, so each host installs 16 agents (64 artifacts) instead of 12-13. `scripts/generate-subagent-artifacts.ts` gained per-agent tool and OpenCode-bash overrides so `navigator` keeps its index-first surface (`mcp__massa-ai__*`, `Read`, `Grep`, `Glob`, `Bash(pwd)`; OpenCode `bash: { "pwd": "allow", "*": "deny" }`) instead of the default read-only set, and its drift exemption is gone. The Claude and Cursor installers no longer special-case navigator: the `massa-ai-` prefix is the single ownership marker, so an uninstall removes it like any other generated agent while a non-prefixed user agent is left untouched.

- **`scripts/__tests__/skills-harness-integrity.test.ts`** — 14 assertions in 6 groups, one group per defect class above: every `Dispatch:` block resolves to an artifact present in all four host dirs (and none uses a bare name); every role in the orchestration Roles table has a charter at the path it advertises, and no role is documented as charter-less; each agent policy is declared exactly once, inside `skills/AGENTS.md`'s bootstrap block, with no `../../AGENTS.md` pointer left anywhere under `skills/`; every relative `references/` / `workflows/` / `skills/agents/` path mentioned under `skills/` resolves on disk; the router's workflow table and the `workflows/` tree are mutually exhaustive; charter permission matches the shipped artifact and every charter forbids recursive spawning. Proven discriminating by re-injecting a bare dispatch name, a `role-based (no charter)` cell, and a `plan_challenge:` block into root `AGENTS.md` — exactly the three matching assertions fail. `.github/workflows/skills.yml` now validates `skills/agents/*/SKILL.md` too, including `metadata.model_hint` and `metadata.permission`, which it had never read.

### Removed

- **`skills/massa-ai-memory/` and `skills/synapse-usage/`** — ~95% duplication of `references/{mcp-tools,synapse-policy,installation}.md`, and wrong where they diverged. `massa-ai-memory` ranked only **21 of the 52** tools, and put destructive `reset_project` at "Priority 9" inside that preference-ordered list — above `remember`/`recall`, with no confirmation guard — while `references/mcp-tools.md` requires explicit user intent and forbids it as reindex preparation. It also told agents to reach for `Glob/Grep/Read` only "when massa-ai doesn't find what you need", with no index-staleness escape, contradicting the router's freshness gating; claimed `compress` reaches "70-98%" against its own table's 80-95% ceiling; and branched on `ScheduleWakeup`, a Claude-Code-only tool, inside a host-agnostic skill. `synapse-usage` taught the whole lifecycle as unauthenticated `curl` piped through `jq` — which this repo does not have — while the router mandates MCP-first, never used the `synapse_task_begin`/`synapse_task_end` envelope the router requires, and linked two files that do not exist.

  Migrated first, in one commit before the deletion: the compression-strategy table into `references/mcp-tools.md`, which named no strategy at all; and the Synapse pipeline-diagnostics signal table, the `queryClass` gate thresholds, the config knobs (`SYNAPSE_ATTENTION_ENABLED` defaults **false** — the attention re-ranker is off), the 20-entry buffer bound, the 1h TTL, and the anti-patterns into `references/synapse-policy.md`, whose lifecycle also gained the two missing task-envelope steps. `scripts/install-skills.sh` globs the skill set, so it needed no change.

- **`scripts/install-agents.sh --mcp-source <local|npx|auto>`** (also `MASSA_AI_MCP_SOURCE`; the flag wins), forwarded by `scripts/install-harness.sh` and exported so the plugin installers' delegated calls inherit it. `scripts/setup-local-first.sh` passes `local`, the root `install.sh` passes `npx`, and `auto` — the default for a direct invocation — picks `local` when `apps/mcp-client/src/index.ts` exists. Switching sources rewrites the entry in place, so there is never more than one.

  `local` writes `bun run <repo>/apps/mcp-client/src/index.ts` for all four hosts (OpenCode keeps its array-`command` + `type: "local"` form). This exists because the npx path is not viable for a checkout: it runs the published package, and it resolves `@massa-ai/core`, which **compiles native tree-sitter grammars on first run** — 60 s was not enough, and an MCP host times out during the handshake well before that. The published 1.2.1 bundle additionally crashes under `bunx` (`var fs = __require("fs")`).

  Two launcher details worth not rediscovering: `-p` is mandatory because the package's bin is named `massa-ai`, not `mcp-client`; and `bunx` accepts `-p` but has **no** `-y` (its flags are `--bun`, `-p/--package`, `--no-install`, `--verbose`, `--silent`), so the OpenCode form is `bunx -p @massa-ai/mcp-client massa-ai`. The corresponding assertions now compare the whole argv rather than checking positions one index at a time, which is how a stray `-y` had slipped between two passing index checks.

- **The documented install path registered no MCP server for Claude Code and installed no plugin bundles at all.** Four independent defects, each confirmed against a real machine's on-disk state before the fix (`~/.claude/agents/` empty, `~/.claude/commands/` empty, `~/.cursor/plugins/massa-ai/` absent, and `~/.claude.json` holding no `massa-ai` entry) and each now covered by a discriminating test.

  1. **Claude Code MCP registration was written to a file Claude Code does not read, in a shape it would reject.** `scripts/install-agents.sh` mapped `claude-code` to `~/.claude/settings.json`, which holds only MCP *approval* controls (`allowedMcpServers`, `enabledMcpjsonServers`, `disabledMcpServers`) plus `hooks` — server *definitions* live in `~/.claude.json`. Compounding it, `ownedEntry()` generalised OpenCode's entry shape to every JSON host, emitting `"command": ["npx","@massa-ai/mcp-client"]` with `"type": "local"`; Claude Code and Cursor require a **string** `command` plus a separate `args` array, and `"local"` is OpenCode-only vocabulary. So the write landed in an ignored file *and* was malformed. Entry shape is now per-host via a new `agent_entry_style()` helper — claude-code gets `type: "stdio"` + string `command` + `args`, claude-desktop/cursor the same without `type`, opencode unchanged. Codex (TOML) was already correct and is untouched. On apply, a stale `_massaAiOwned` entry left in `settings.json` by the old writer is migrated away (backed up first); a hand-written `massa-ai` entry there, and the `hooks` block, are preserved.

  2. **Nothing ever passed `--plugins`.** `scripts/setup-local-first.sh` step 6 — the only automatic harness call in the entire install flow — ran `--skills --agents`, and in `install.sh` the plugin bundles sat behind interactive menu option `p)`, unreachable in a non-interactive or `NO_START=1` run and deliberately excluded from option `k)`. Step 6 now runs `--all`; `MASSA_AI_INSTALL_PLUGINS=0` opts back out. Menu option `k)` and the harness submenu's "Both" become "skills + MCP + plugin bundles" and call `--all`. Docker mode, whose back-fetch pulls only `scripts/*`, now says plainly that plugin bundles need source mode instead of warning "installer not found".

  3. **OpenCode had no installer, so it was never installed locally.** New `apps/opencode-plugin/install.sh` brings it to parity with the other three (`--user` / `--project` / `--uninstall` / `--quiet` / `--verbose`): it symlinks `~/.config/opencode/plugins/massa-ai/index.js` at the repo's `dist/index.js` (symlink, not copy, so `bun run build` keeps it current), adds `"./plugins/massa-ai/index.js"` to the `plugin` array of `opencode.json` idempotently with a `.massa-ai.bak-<ts>` backup, and symlinks the 12 specialists into `~/.config/opencode/agents/`. It refuses to clobber a regular file at any symlink target, and exits non-zero with a `bun run build` hint when `dist/index.js` is absent. `scripts/install-harness.sh`'s plugin loop now covers all four hosts and the printed npm fallback is gone; npm remains a documented alternative. **Ordering trap fixed at both ends:** the harness runs skills → MCP → plugins, so at MCP time the plugin is not yet registered and `install-agents.sh` writes an OpenCode `mcp` entry, which would duplicate all 14 in-process tools. `opencode_plugin_present()` now recognises the local path and bare-dir registration forms in addition to the npm package name, and the OpenCode installer withdraws the redundant entry by delegating to `install-agents.sh --agent opencode --uninstall` — so `install-agents.sh` remains the single writer and `scripts/tests/test-mcp-single-writer.sh` stays green.

  4. **A full install printed 72 lines and the banner four times.** `scripts/banner.sh` gains the shared verbosity contract — `MASSA_AI_VERBOSE`, `vinfo()`, `vecho()` — and `massa_ai_banner()` self-guards on `MASSA_AI_BANNER_SHOWN`, so nesting the plugin installers under the harness prints the glyph once instead of four times. `--quiet` (default) and `--verbose` are now accepted by `install-harness.sh`, `install-skills.sh`, `install-agents.sh` and all four plugin installers, forwarded from the harness to every child; `--dry-run` and `--check` force verbose, since the detail is the whole point of those modes. Quiet mode prints one line per changed thing plus a summary; per-file symlink chatter, serialized JSON entry diffs, specialist hints, and the output of delegated `install-agents.sh` calls move behind `--verbose`. **Errors and warnings are never gated** — including the notice that a stale plugin-local `.mcp.json` was deleted from the user's home, which reports a mutation rather than progress.

  Also corrected: `apps/claude-plugin/install.sh` told users MCP was registered in `~/.claude/settings.json`, which is exactly the wrong path this change fixes.

  **Tests.** `scripts/tests/test-banner-glyph-divergence.sh` is new and pins the two duplicated banner copies byte-identical — `install.sh` must keep its own inline glyph because it runs before any clone exists. `apps/opencode-plugin/__tests__/install.test.ts` is new (9 tests). The `install-agents`, `install-skills`, `install-harness` and mcp-single-writer suites gained cases for the corrected claude-code path and per-host entry shapes, the legacy-`settings.json` migration, local-form OpenCode plugin detection, four-host plugin fan-out, `MASSA_AI_INSTALL_PLUGINS=0`, and quiet-vs-verbose output.

  **`apps/*-plugin/__tests__/` now runs in CI.** Three of the four plugin dirs are not workspace packages, so turbo's `test` never reached them — 41 assertions across the Claude, Codex and Cursor installers had no gate at all. New root script `test:plugins` covers all four (50 tests) and the CI `build` job runs it after `test:scripts`. It is included in `bun run test` only by way of that new step, not via turbo.

### Changed

- **Installers migrated from TypeScript to bash, MCP gains a single writer, and the harness is wired into both entry points (install-harness-migration).** Three parts, all on `.specs/features/install-harness-migration/`:

  1. **`scripts/install-skills.ts` → `scripts/install-skills.sh`** and **`scripts/install-agents.ts` → `scripts/install-agents.sh`** (1,637 lines of TS removed). They now follow the pattern every other installer in the repo already used — bash orchestration with an inline `node`/`bun` heredoc for JSON/TOML edits, no `jq`, `exit 3` when neither runtime is present. The CLI contract is unchanged: same flags, same exit codes (`install-skills` 0/1/2, `install-agents` 0/1/2/13), same `<!-- massa-ai:bootstrap:* -->` markers, same `_massaAiOwned` ownership marker, same `<config>.massa-ai.bak-<ts>` backups, same v1→v2 `install-state.json` migration. New helper `scripts/lib/installer-shared.sh` holds runner detection, the consent gate, and the backup convention. New `scripts/install-harness.sh` orchestrates skills + MCP + plugin bundles.

  2. **`scripts/install-agents.sh` is now the only writer of host MCP config.** The Claude/Codex/Cursor plugin installers call it (`--agent claude-code` / `codex` / `cursor`) instead of shipping their own MCP file. `apps/codex-plugin/.mcp.json` and `apps/cursor-plugin/mcp.json` are deleted, along with the `mcp` pointer in the Codex plugin manifest. `scripts/tests/test-mcp-single-writer.sh` is the regression guard.

  3. **Skills and MCP registration are reachable from the documented install path.** `install.sh` gains post-install menu option `k` (`c` and `p` are untouched — `root-install-menu.test.ts` pins their strings) and its docker-mode back-fetch now pulls the harness scripts, or the option would be dead in that mode. `scripts/setup-local-first.sh` gains step `[6/6]`, honouring `MASSA_AI_INSTALL_HARNESS=1|0` for non-interactive runs.

  **Behaviour changes worth calling out** (installers are a public compatibility surface): plugin installers now write host MCP config, which they previously did not; `~/.codex/plugins/massa-ai/.mcp.json` and `~/.cursor/plugins/massa-ai/mcp.json` are gone, and a plugin reinstall removes the stale file so upgraders converge; `install-agents.sh --uninstall` now removes **only** entries carrying `_massaAiOwned: true`, so a hand-written `massa-ai` entry survives where the TypeScript version would have deleted it; the OpenCode MCP entry is skipped when `opencode.json` lists `@massa-ai/opencode-plugin` (which registers 14 tools in-process), and still written for everyone else.

  **Corrected documentation.** Three installers told users to "skip MCP — the plugin already registers it", and `apps/claude-plugin/install.sh` contradicted itself within four lines. The plugin-local files those messages referred to were copied into `~/.codex/plugins/` and `~/.cursor/plugins/`, which are not host MCP read paths; a user who followed the advice likely ended up with **no** MCP registration at all. `scripts/setup-local-first.sh` also printed an OpenCode snippet using `mcpServers`/`env`/`npx` where OpenCode reads `mcp`/`environment`/`bunx`.

  **Tests.** The four TypeScript installer suites (1,976 lines) are replaced by 12 plain-bash suites in `scripts/tests/` totalling 296 assertions, run by `bun run test:scripts` — which CI already executes, so the replacement gate is real. Read-only claims (`--check`, `--dry-run`) are proven with a recursive checksum of the fake home taken before and after, not just an exit code. `scripts/__tests__/validate-repository.test.ts` now greps the bootstrap markers out of the bash installer instead of importing them, keeping one source of truth. Coverage percentages move: the bash suites run outside `bunfig.toml`'s instrumentation.

- **Unit-test coverage >90% across monorepo (coverage-90pct)**: raised per-file line coverage to >90% across all packages. `packages/core` 76→124 unit test groups (0 fail); `packages/shared` 27→176 pass; `apps/tools-api` 5→23 groups; `apps/mcp-client` fixed module-state collision via isolation runner (2 fail→0); `apps/opencode-plugin` 35→101; `apps/web-ui` 19→95; claude/codex/cursor plugins 27→59/16/15; `scripts/__tests__` 319→506; `scripts/tests` 10 fail→0 (docs-drift, RSS, manifest fixes). 233/242 core source files ≥90% line (9 documented exclusions: tree-sitter native internals, ONNX, barrel re-export, e2e-gated health, env-boilerplate). Batches A–L partitioned across parallel subagents with disjoint write sets (R10). Spec: `.specs/features/coverage-90pct/`.

### Fixed

- **Web UI at `/ui` returned `{"status":500,"error":"web ui static dir not found"}`**: two independent defects. (1) Both module-relative candidates in `apps/tools-api/src/routes/web-ui.ts` were off by one directory — from `src/routes/` they resolved to `apps/tools-api/web-ui/src/static` and `apps/tools-api/src/web-ui/src/static`, neither of which exists — so resolution silently depended on the cwd walk, and the API 500s whenever it is started from a cwd outside the repo (reproduced: `cd /tmp && bun apps/tools-api/src/index.ts` → 500). Replaced with `buildStaticDirCandidates(moduleDir, cwd)`, which walks up from the module's own directory *and* cwd, checking both `apps/web-ui/src/static` and the sibling `web-ui/src/static` at each level — correct for the src, dist, package-dir, and repo-root layouts alike. (2) The `Dockerfile` never `COPY`d `apps/web-ui` despite a comment claiming "web-ui is served by tools-api", so `/ui` was 500 in the `api` image regardless of path math; added the COPY to the `base` and `api` stages (`mcp` inherits via `COPY --from=base /app`). The existing route tests mock `fs/promises` so every candidate "exists", which is why neither defect was caught; added `web-ui-static-dir.test.ts` (8 tests, real filesystem) including a child-process probe that drives `GET /ui` from a cwd outside the repo. CI's Docker smoke only checked `/health` and `/swagger` — added a `/ui` + `/ui/app.js` assertion so the image regression cannot recur.
- **~646 tests were never executed by any gate**: the `coverage-90pct` work (3acf3ae) added test files that no runner reached. `apps/web-ui` had 4 suites (95 tests) but no `test` script, so turbo skipped the package; `scripts/__tests__` (16 files) and `scripts/tests` (6 TS + 3 shell files) sit outside the `packages/*` / `apps/*` workspace globs, so nothing ran them — including `subagent-parity.test.ts`, the guard for the generated Claude/Codex/Cursor/OpenCode plugin artifacts. Added `test` to `apps/web-ui/package.json`, extended root `test:scripts` to run the TS suites plus every `scripts/tests/*.sh`, and wired `bun run test:scripts` into the CI `build` job. Now green: 95 (web-ui) + 551 (root TS) + 41 (shell) tests.
- **`executor-extra.test.ts` Rust compile test broke CI on `main`**: "compiles and runs a simple Rust program" was killed by the global 5 s `bunfig.toml` timeout — a cold `rustc` compile takes ~6 s on ubuntu runners, and the test hands the executor a 30 s budget of its own. Added the repo's per-test timeout idiom (`}, 60_000)`) to both Rust cases. Not a product bug and not a missing toolchain guard: `describe.skipIf(!HAS_RUST)` already gates correctly and Rust is preinstalled on the runners. Introduced by 3acf3ae, which left `main` red.
- **`test-setup-wizard-db-selection.sh` false negative**: the "migrations fail closed" assertion was a single-line `grep` against `bunx prisma migrate deploy || die`, which `setup-local-first.sh:526` splits over a `\` continuation. The safety property held; the assertion did not. Added a continuation-folding matcher so the check tests behaviour rather than formatting (11/11 pass).
- **root `bench:fixture` script pointed at a nonexistent target**: the repo rename mangled both halves of `"bench:fixture:sicad": "... bench:fixture:sicad"`, leaving `bench:fixture` delegating to `bench:fixture:massa-ai`, which does not exist. Restored the `:sicad` target (Sicad is the external benchmark corpus, not a rename residual).
- **`graph-queries.ts` pinned column cast**: `pinned::integer` replaced with `CASE WHEN pinned THEN 1 ELSE 0 END` for compatibility with non-integer `pinned` columns.
- **`memory-repository-pg.ts` metadata double-encode + pagination determinism**: metadata was double-encoded on write; pagination ordering was non-deterministic. Both fixed with asserting tests.
- **`events.ts` SSE leak**: server-sent events stream leak fixed in tools-api routes.
- **`config-loader.ts` migrateDataDirOnce isolation**: data-dir migration isolation fix in shared config.
- **mcp-client module-state collision**: `buildPrefetchPlan` not found when tests run in one process — fixed by adding an isolation runner (`scripts/run-tests-isolated.ts`).

- **E2E coverage expansion**: live E2E suite widened to the 52-tool roster and post-baseline feature surfaces. `00.harness.smoke.test.ts` `EXPECTED_TOOLS` 47→52 (matches `CANONICAL_ORDER` in `tool-definitions.ts`); `10.synapse.test.ts` adds TE1-TE5 for the `synapse_task_begin`/`synapse_task_end` task-envelope lifecycle; `20.new-features.test.ts` SG1 gap probe replaced with real assertions of `/api/v1/scheduler/status` + `/api/v1/hooks/queue-status`; new `24.dashboard-architecture.test.ts` covers DB1-5 (dashboard routes + graceful degradation), AR1-5 (`get_architecture` MCP+HTTP parity, cycles aspect, teaching error, `_aspects` list), and RN1-5 (`rename_project`/`merge_projects` dryRun preview only). `_helpers.ts` `resolveBackendAttestation` widened to trust the API's self-reported `databases.backend` (destructive suites remain guarded by `assertSafeE2eEnvironment`). `COVERAGE.md` suite map updated. 53 pass / 0 fail / 1 deliberate skip against the live dev stack; type-check 6/6. Spec: `.specs/features/e2e-feature-coverage-expansion/`.

### Fixed

- **`packages/core` `@massa-ai/shared` dependency**: was `workspace:*`, which fails the `verifyStaticContract` gate (requires the declared version to `===` the root version exactly). Set to `1.2.1` (matches root + the local workspace package version, so it still resolves locally with no `bun install` 404 and no lockfile change).

## [1.2.1] - 2026-07-24

### Changed

- **Repository rename part 2 (residual `th0th`/`massa-th0th` cleanup)**: removed all residual identity references missed by the v1.2.0 rename (PR #18). `observation-extractor.ts` `th0th_*` legacy case arms and `th0th_read_file` guard clause removed (canonical un-prefixed arms only; **breaking**: existing DB `hook_observations` rows storing `th0th_*` wire-names no longer match on read — no DB migration performed). `architecture.ts` comment; `ensure-ollama.sh` temp log path (`ollama-th0th.log` → `ollama-massa-ai.log`); `apps/opencode-plugin/src/index.ts` internal helpers (`th0thFetch`/`th0thGet`/`th0thGetWithQuery` → `massaAi*`). `skills/` (~58 files: SKILL.md, AGENTS.md, 12 agent charters, ~46 massa-ai references/workflows/scripts) — `th0th`/`Th0th`/`TH0TH_` concept refs → `massa-ai`/`Massa-ai`/`MASSA_AI_`; `installation.md` upstream corrected from stale `S1LV4/th0th`/`@th0th-ai/*`/`TH0TH_*` to `luizgmassa/massa-ai`/`@massa-ai/*`/`MASSA_AI_*`. 48 plugin agent files regenerated (`Th0th Memory` → `Massa-ai Memory`); drift gate passes. `docs/massa-ai-spec-driven.md`, `docs/massa-ai-tdd.md` concept refs. `.specs/` concept refs in 6 completed-feature docs. `CHANGELOG.md` historical `massa-th0th` entries rewritten to `massa-ai`. `README.md`/`FEATURES.md` non-credit refs updated; Credits `[th0th](S1LV4/th0th)` line preserved as external upstream acknowledgment. `bun.lock` regenerated.

### Fixed

- **Broken plugin hook symlinks**: `apps/cursor-plugin/hooks/massa-ai-hook` and `apps/codex-plugin/hooks/massa-ai-hook` pointed to stale `../../claude-plugin/hooks/massa-th0th-hook.ts` (renamed to `massa-ai-hook.ts` in v1.2.0 but symlink targets not updated) — recreated to point to `massa-ai-hook.ts`.
- **`packages/core` hard version pin**: `@massa-ai/shared` declared as `"1.2.0"` (npm fetch) instead of `"workspace:*"` (local workspace link) — caused `bun install` 404 on fresh install. Converted to `workspace:*` (matches the other inter-package deps).
- **`apps/web-ui` missing `@types/bun` devDep**: web-ui had no `devDependencies` and relied on `@types/bun` being hoisted to root `node_modules` by accident; `bun.lock` regen changed hoisting and type-check failed (`Cannot find module 'bun:test'`). Added `@types/bun: ^1.3.9` devDep.
- **Root missing `toml` devDep**: `scripts/__tests__/subagent-parity.test.ts` imports `toml` to parse Codex `.toml` agent files, but no package declared it as a direct dep (only a transitive dep of `effect`); lockfile regen stopped hoisting it to root. Added `toml: ^4.3.0` to root devDependencies.

## [1.2.0] - 2026-07-23

### Changed

- **Project renamed `massa-th0th` → `massa-ai`**: repository-wide identity rename. Package scope `@massa-th0th/*` → `@massa-ai/*` (core, shared, mcp-client, tools-api, web-ui, opencode-plugin); config type `MassaTh0thConfig` → `MassaAiConfig`; env vars `MASSA_TH0TH_*` → `MASSA_AI_*`; DB user/db/password `massa_th0th` → `massa_ai`; user paths `~/.massa-th0th` → `~/.massa-ai`, `.massa-th0th-data` → `.massa-ai-data`; npm bin `massa-th0th`/`massa-th0th-config`/`massa-th0th-api` → `massa-ai`/`massa-ai-config`/`massa-ai-api`; GitHub URL refs `luizgmassa/massa-th0th` → `luizgmassa/massa-ai`; Docker images `massa/massa-th0th` → `massa/massa-ai`; skills dirs `skills/massa-th0th/` → `skills/massa-ai/`, `skills/massa-th0th-memory/` → `skills/massa-ai-memory/`; 48 subagent files `massa-th0th-*` → `massa-ai-*` across 4 host plugins (13 claude/cursor incl navigator, 12 codex/opencode); 7 docs `docs/massa-th0th-*` → `docs/massa-ai-*`; ref docs `th0th-tools.md` → `mcp-tools.md`, `th0th-installation.md` → `installation.md`. MCP tool wire-prefix `th0th_*` dropped from the observation-extractor canonical map (un-prefixed); legacy `th0th_*` case arms retained as read-side aliases for existing DB hook observations (backward-compatible). E2E fixture ids `e2e-th0th-*` → `e2e-ai-*` (hash suffixes preserved). CI postgres block renamed atomically (user, password, db, DATABASE_URL, `pg_isready -U`). Egyptian-deity prose references neutralized in README/FEATURES. `bun.lock` regenerated. Type-check 6/6, build 5/5, unit suites green. Spec: `.specs/features/repo-rename-massa-ai/`. Follow-up (part 2) removed residual `th0th`/`Th0th` concept references across skills, plugin agents, docs, and `.specs/`, dropped the `th0th_*` observation-extractor aliases, and rewrote prior changelog entries to the `massa-ai` identity.

### Added

- Bootstrap contract merged into `skills/AGENTS.md` (`massa-ai:bootstrap` markers) with 12-agent sub-agent registry; `UAS_` env vars adapted to `MASSA_AI_`
- Unified TypeScript symlink skills installer (`scripts/install-skills.ts`) for all 4 tools (Claude/Codex/Cursor/OpenCode) with `--apply/--uninstall/--dry-run/--check`, state v1→v2 migration, conflict abort, idempotent
- 8 workflow guide docs migrated to `docs/` (spec-driven, tdd, rfc, commit, ticket, maestro, mobile-figma, context-slices)
- Persona-router skill and 5-persona catalog migrated to `skills/persona-router/` + `skills/massa-ai/personas/` (filename-only `prompt_path`)
- 296 tests ported to bun test (185 `validate-repository.test.ts` + 39 `install-skills.test.ts` + 56 `install-agents.test.ts` + 16 `subagent-parity.test.ts`)
- `install:skills` / `uninstall:skills` npm scripts
- AGENTS.md at repo root for agent startup contract routing
- `.tool-versions` and `mise.toml` pinning Bun 1.3.14 + Node 25.9.0
- `CHANGELOG.md` with `[Unreleased]` section and CI merge gate
- ADR closing D5 Cypher subset deferral (`docs/adr/0001-remove-d5-cypher-subset.md`)
- `docs/removed-features.md` documenting intentionally removed features (commit 5547afc)
- OS-level sandbox wrapper for executor (macOS seatbelt + Linux Docker, default `auto`)
- `format: json_schema` constrained decoding for Ollama structured LLM calls
- Web UI write mode (memory edit/delete + proposal approve/reject, gated by `MASSA_AI_WEB_WRITE_MODE=true`)
- Web UI markdown rendering (`marked` + `DOMPurify` with XSS prevention)
- Web UI SSE real-time updates for dashboard + memory list
- Hook deadline breadcrumb-on-fire observability in `massa-ai-hook`
- Native Codex plugin bundle (`apps/codex-plugin/`) with manifest, skills, hooks, MCP, and idempotent installer
- Native Cursor plugin bundle (`apps/cursor-plugin/`) with manifest, skills, hooks, MCP, agents, and idempotent installer
- `pre-tool-use` event added to shared hook binary `EVENT_MAP` for Codex/Cursor parity
- Claude Code `install.sh` hooks auto-write (array-append, idempotent)
- Root `install.sh` plugin menu extended to all four tools (Claude, Codex, Cursor, OpenCode)
- `FEATURES.md` — complete feature reference (23 features, 52-tool roster, config tables, structural indexing detail)
- Deconfliction hints in `install-agents.ts` for Claude, Codex, Cursor, and OpenCode
- 12 subagent specialists (investigator, planner, builder, reviewer, context-curator, verification-agent, requirements-analyst, architecture-specialist, test-engineer, documentation-agent, audit-specialist, mobile-specialist) emitted across all four host plugins (Claude `.md`, Codex `.toml`, Cursor bundled, OpenCode `agents install`), with parity tests (drift, pinning, collision, exact-12) and a `generate-subagent-artifacts.ts` drift gate
- massa-ai workflow skill (router + 38 workflows + 80 references + `lessons.py`) copied into `skills/massa-ai/` (123 files)

### Changed

- 12 agent charters relocated from `skills/<name>/` to `skills/agents/<name>/`; `generate-subagent-artifacts.ts` and `skills/AGENTS.md` registry updated (meta-skills `massa-ai-memory` + `synapse-usage` stay at `skills/` top level)
- 14 audit/fix workflows + spec-driven + exploration rewritten to use 24 named dispatch blocks (9-field capability-packet schema) instead of duplicated inline dispatch prose; old role names mapped (`implementer`→`builder`, `verifier`→`verification-agent`, `domain-mapper`+`coupling-auditor`+`deepening-architect`→`architecture-specialist`)
- README consolidated: removed VSCode section, merged 4 plugin sections into one table, replaced duplicated tables with links to FEATURES.md
- TODO.md updated: multi-language tree-sitter marked COMPLETE, json_schema marked shipped, Codex+Cursor plugin parity added
- Architecture tree tool count corrected 47 → 52

- `local-health-checker.ts` now reads `config.get("embedding").model` instead of hardcoding `nomic-embed-text:latest`
- Executor sandbox defaults to `auto` (uses sandbox if available, falls back to best-effort)

### Removed

- Stale `compression.llm` deprecated alias reference from README.md (code already dropped in `da4c60f`)

### Fixed

- LLM/embedding model defaults now consistent across config, health-checker, and docs
- **OpenCode MCP writer bug (CRIT)**: `install-agents.ts` `OpenCodeWriter` now writes under the `mcp` key (not `mcpServers`) with the OpenCode-specific entry shape (`type: "local"`, `command: ["bunx", ...]`, `environment` not `env`, `enabled: true`) per FEATURES.md — OpenCode host now discovers the massa-ai MCP server; shared `JsonMcpWriter` parameterized via `serversKey()` so claude-code/cursor/claude-desktop remain unchanged
- **Stale `th0th_*`-prefixed tool names removed** from `skills/agents/investigator/SKILL.md` (`th0th_search`→`search`, `th0th_get_references`→`get_references`), `skills/agents/context-curator/SKILL.md` (`th0th_recall`→`recall`, `th0th_search`→`search`), and `skills/persona-router/SKILL.md` (`th0th_recall`→`recall`) — canonical un-prefixed names per FEATURES.md; 8 generated agent files regenerated for parity
- **Broken `ai-context-handoff` repo xref** in `agent-handoff.md` reworded to "host-installed, not repo-local" (the skill lives in `~/.config/opencode/skills/`, not the repo)
- **`synapse-usage/SKILL.md` stale intro** rewritten: now MCP-first (10 Synapse tools) with REST as fallback; endpoint count corrected 6→8
- **`.specs/` path prefix drift** fixed in `agent-handoff.md`, `long-session.md`, `references/spec-driven/artifact-store.md` (canonical paths: `.specs/project/FEATURES.json`, `.specs/project/STATE.md`, `.specs/HANDOFF.md`, `.specs/features/<slug>/`)
- **`_th0th_remember_best_effort`** renamed to `_remember_best_effort` in `skills/massa-ai/scripts/lessons.py` (4 sites) — no `th0th_`-prefixed symbols remain in skills/
- **`OLAMA_VERSION` typo** in `validate-vscode-integration.sh` fixed (variable was `OLLAMA_VERSION`, printed as `${OLAMA_VERSION}` — Ollama version was always blank)
- **`install.sh` docker-fetch operator-precedence bug** fixed: `[ -f "$s" ] || need_fetch=true && break` → `[ -f "$s" ] || { need_fetch=true; break; }` (`&&` bound tighter than `||`, inverting the missing-script detection)
- **Stale "5 shell scripts" text** in `install.sh` updated to reference the shared `massa-ai-hook.ts` Bun binary (Codex/Cursor symlink to it)
- **`Bun.file().toString()` bug** in `diagnose.ts` fixed: `ollamaCandidates` is now async and reads `/etc/resolv.conf` via `await Bun.file(...).text()` (`.toString()` returned `[object BunFile]`, silently breaking WSL2 nameserver detection)
- **`validate-vscode-integration.sh` bunx branch** now mirrors the npx branch's `tools/list` success/failure check (bunx users previously got no MCP tool-count validation)
- **`setup-local-first.sh` search-quality prompt idempotency**: the interactive query-understanding/rerank prompt now only runs on first run (when `.env` doesn't exist), not on every re-run
- **`ClaudeCodeWriter` plugin-hooks coordination**: `install-agents.ts` now detects massa-ai plugin hooks (`_massaAiOwned` markers) in `~/.claude/settings.json` and confirms the MCP entry merged alongside (plugin hooks preserved by `deepMerge`); new tests prove coexistence
- **FEATURES.md roster gap**: `rename_project` + `merge_projects` added to the 52-tool roster table (both already in `CANONICAL_ORDER` and `mcp-tools.md` but missing from the FEATURES.md table)
- **Validator test coverage**: `validate-repository.test.ts` expanded from 34 → 185 scenarios, porting ~150 missing contract checks from the legacy Python `test_validate_repository.py` (persona catalog deep validation, hook-enforcement contract, lessons dual-write, harness state path migration, context slices, agents harness routing, RFC/TDD/ticket/commit workflow contracts, deterministic router precedence, verification ladder, spec-driven phase gates, audit-report-IO, evidence gate, context firewall, synapse policy, mcp-tools matrix, canonical tool naming, docs guides)

## [Wave 6] - 2026-07-22

### Added

- N31: God-file decomposition (symbol-repository-pg, tool-definitions, auto-improve-job, smart-chunker) behind byte-identical facades
- N32: Embedded MCP mode (`MASSA_AI_EMBEDDED=true` routes direct to core services)
- N30: Single `massa-ai-hook` Bun binary replacing 7 shell scripts
- N20: Parallel test runner with ZERO-LOSS UNION GUARD
- N28: Dashboard route + scheduler/status + hooks/queue-status routes
- N29: `MASSA_AI_SCHEDULER_SAFE_DEFAULTS=true` scheduler preset

## [Wave 5] - 2026-07-22

### Added

- N2: Cycle detection (iterative Tarjan SCC) in architecture
- N3: Multi-source BFS CTE for impact analysis
- N5: Grouped prefix-factored tree output format
- N11: Lease-based single-writer for indexing
- N12: Idempotent incremental import
- N13: Capture-policy module (bounded pure module)
- N14: Persisted maintenance scheduler
- N26: Synapse UX compression (`synapse_task_begin`/`synapse_task_end`)
- N27: SSE/WebSocket push for `index_status`

## [Wave 4] - 2026-07-21

### Added

- N1: Generation-based cursor staleness (412 teaching error)
- N4: `*_total`/`*_omitted` invariant on all clamped lists
- N6: Enum teaching errors across 11 tool handlers
- N7: Three-source git diff + secrets denylist
- N8: Shell-arg validation for git refs
- N9: `read_file` 500-line cap + `source_clipped` flag
- N10: SQL bounds regression test

### Changed

- N25: Spec docs reconciled with reality (PG parity migrations exist)
- N33: Dead code sweep (all `catch{}` replaced with `logger.warn`)
- N36: `xdg.ts` extraction (unified config systems)
- M29: `sqlite-removal` closed; `sqlite-removal-followup` split