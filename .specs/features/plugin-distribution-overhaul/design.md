# Plugin Distribution Overhaul — Design

Spec: `.specs/features/plugin-distribution-overhaul/spec.md` (26 requirements, Plan
Challenge complete). This document records approach decisions and their tradeoffs; it
does not restate requirements.

## D1 — OpenCode config resolution (PDO-01..05)

**Problem.** Two independent writers hardcode `opencode.json` and parse with bare
`JSON.parse`: `scripts/install-agents.sh:161,198-207` and
`apps/opencode-plugin/install.sh:61,118-137,198-219`. Neither tolerates comments.

**Chosen approach.** A single resolution+parse helper, `scripts/lib/opencode-config.cjs`,
exposing three functions:

```
resolveConfigPath(dir) -> { path, created: bool, both: bool }
parseJsonc(text)       -> object            (strips // and /* */, trailing commas, BOM)
writeConfig(path, cfg) -> void              (backup first, JSON.stringify(cfg,null,2)+"\n")
```

Resolution order per A1: `opencode.jsonc` → `opencode.json` → create `opencode.jsonc`.
When both exist, return `opencode.json` with `both: true`, and the caller warns — OpenCode
core merges `.json` over `.jsonc`, so editing the losing file would be a silent no-op.

**Distribution tradeoff (decided).** `apps/opencode-plugin/install.sh` ships inside the npm
tarball, where `scripts/lib/` does not exist. Three options were considered:

| Option | Rejected because |
| --- | --- |
| Hand-duplicate the helper in both heredocs | This repo already has three divergent copies of `run-tests-isolated.ts` (236/124/141 lines). Hand-duplication is how that happened. |
| Have the plugin shell out to the repo copy | Reintroduces the repo-checkout dependency this feature exists to remove. |
| **Generate `apps/opencode-plugin/lib/opencode-config.cjs` from the canonical file, `--check`-gated** | **Chosen.** Same generator and same drift gate as the skills bundle (D2), so divergence is impossible rather than merely discouraged. |

**Parse strictness.** Comment-stripping must not corrupt string literals containing `//`
(e.g. a `"https://..."` value). The stripper is a small state machine that tracks
in-string/in-escape state, not a regex. This is the single most likely correctness bug in
the workstream and gets dedicated tests, including a config whose every value is a URL.

**Preserved invariants.** `install-agents.sh` remains the only writer of host MCP config
(`test-mcp-single-writer.sh`). The OpenCode skip-when-plugin-present check
(`install-agents.sh:549-561`) now runs against the resolved path, so a plugin listed in
`opencode.jsonc` is detected — today it is not, which means a `.jsonc` user gets a
redundant MCP registration.

## D2 — Skills bundling (PDO-06..09)

**Chosen approach.** New `scripts/generate-skill-artifacts.ts`, modeled on
`generate-subagent-artifacts.ts` (same CLI shape, same `--check` semantics, same
exit codes). Source → destination:

```
skills/massa-ai/**            -> apps/<host>-plugin/skills/massa-ai/**
skills/persona-router/**      -> apps/<host>-plugin/skills/persona-router/**
skills/agents/<n>/SKILL.md    -> apps/<host>-plugin/skills/agents/<n>/SKILL.md
scripts/lib/opencode-config.cjs -> apps/opencode-plugin/lib/opencode-config.cjs   (D1)
```

Real files only — no symlinks, per the empirical finding that **`npm pack` silently drops
symlink entries** (verified this session: a symlinked file and its containing directory
were both absent from the tarball, with no pack-time error).

**Cost, stated plainly.** `skills/` is 1.3 MB / 145 files. Checked in ×4 that is ~5 MB and
~580 tracked files, and every future `skills/` edit produces a 5× diff. This was the
accepted tradeoff of A2; the `--check` gate is what converts that cost into a guarantee
rather than a liability. If the diff noise becomes intolerable, the escape hatch is A2's
rejected option 2 (pack-time generation) — recorded here so a future reader does not have
to re-derive it.

**`--check` must detect extra files, not just changed ones.** A stale bundle entry left
behind after a source file is deleted is exactly the drift that a naive "regenerate and
diff known paths" check misses. The check compares full directory inventories.

**Frontmatter identity (PDO-06 AC7).** `skills.yml` validates `SKILL.md` frontmatter. The
copies must be byte-identical so both the source and the four bundles validate under the
same rule; the generator therefore copies bytes, it does not re-serialize.

## D3 — Two skills writers, one owner (A9, PDO-08)

`install-skills.sh` (repo path) and each plugin's `install.sh` (tarball path) can both
target `~/<host>/skills/`. This mirrors the MCP single-writer problem already solved in
this repo, so it reuses that solution shape:

- `install-skills.sh` keeps ownership when a checkout is present, and switches from
  `ln -s` to a copy so nothing resolves into `$REPO_ROOT`.
- A plugin's `install.sh` installs its bundled skills **only** when the install-state file
  does not record a repo-owned install for that host.
- `~/.config/massa-ai/install-state.json` (v2) gains a per-host `skillsOwner:
  "repo" | "plugin"` field so uninstall removes only what it owns.

The existing pre-pass that aborts when a non-symlink occupies a target path
(`install-skills.sh:452-461`) must be generalized — after this change the repo installer
writes real directories, so "is it a symlink" is no longer the ownership test.
Ownership comes from the state file, with the path check kept as a safety net.

## D4 — Publishing (PDO-10..15, PDO-24..26)

**The load-bearing fact.** `publish-packages`, `publish-apps`, and
`publish-github-packages` have **no `actions/checkout`**. Their entire filesystem is the
`build-output` artifact. A `files` field cannot include what was never uploaded — which is
why `@massa-ai/opencode-plugin@1.3.1` ships without the `agents/*.md` its manifest
declares.

**Chosen approach.** Rather than hand-maintaining two lists that must agree (the `files`
field and the artifact list), derive the artifact paths from each package's `files` field
in the `build` job, and assert equality in the gate. The three new plugins have no build
step, so their content is static source; `files` is the only declaration, and the gate is
what makes it true.

**PDO-26 gate design.** A script that, for each publishable package: `npm pack`, extract,
compare the inventory against an expected manifest committed alongside. Two properties
make it worth having rather than ceremonial:

1. It runs **before** merge, so it is not gated on a release happening.
2. It is mutation-verified in both directions — removing a directory from the artifact
   list must fail it. A gate that has never been observed failing is not evidence.

It is introduced in PR1 against the current 5 packages, where its first run is expected to
go red on the opencode `agents/` omission. Fixing that defect in PR1 is the gate's
acceptance test.

**Workspace membership.** Adding `package.json` to three `apps/*` dirs makes them workspace
members, so turbo discovers them. They must **not** declare a `test` script, or their
`__tests__` would run twice (once via turbo `test`, once via the root `test:plugins`).
Root `test:plugins` remains the single runner for plugin suites; this is a deliberate
asymmetry and is recorded in `CLAUDE.md`.

**`version:sync`.** `apps/cursor-plugin/.cursor-plugin/plugin.json` joins
`EXTRA_VERSIONED_MANIFESTS` (`version-sync.ts:67-70`). Its current `1.0.0` against a root
of `1.4.0` proves the existing list is a silent-drift surface: `syncVersions` treats an
unlisted path the same as a missing one. The new test asserts manifest values **equal** the
root version, which is what the old implicit check never did.

## D5 — qwen removal (PDO-16..19)

Deletions are mechanical and listed in the spec. The one non-mechanical piece is
`_helpers.ts`:

```
SharedFixtureProfile:  { commit, manifestHash, provider, model, dimensions }
                    -> { commit, provider, model, dimensions }
```

`manifestHash` disappears with the fixture; the commit SHA already encodes "which files
are at this revision", so the identity keeps its discriminating power. Per revised A7,
provider/model/dimensions come from the embeddings config resolver
(`packages/core/src/services/embeddings/config.ts`), not raw `process.env` — otherwise
`deriveSharedProfileIdentity`'s completeness check (`:117-126`) throws at import, `SHARED_PID`
nulls, and the 10 consuming e2e files each index independently, reintroducing the OOM that
`_helpers.ts:405-410` documents this scheme as fixing.

`22.path-identity.test.ts` loses its manifest-containment assertions and keeps its
identity-shape and wrong-root assertions, rebuilt against the fixture-free identity.

`release-version.ts` loses `FIXTURE_REL_PATH` and `repinFixtureHashes` entirely. Note it
already fails soft on a missing fixture (`:175-180`), so removal cannot break the release
chain — but leaving it would be dead code whose doc comments lie.

## D6 — Doc ownership (PDO-20..23)

`CONTRIBUTING.md:115-159` already declares itself the single source. The work is making
that true:

- Delete `skills/AGENTS.md:230-244` outright — no replacement pointer, per the request.
  It sits inside the bootstrap block, so removal shrinks what every host loads at session
  start. Marker positions are unaffected.
- Replace `CLAUDE.md`'s `#### How to write CHANGELOG entries` with a link. Release
  *mechanics* (skip-ci marker, deploy key, cross-package pinning, half-release recovery)
  stay — they are genuinely CLAUDE.md's subject and are not duplicated anywhere.
- Remove `CONTRIBUTING.md:151-153` (the qwen paragraph) as part of D5.

**Guard.** `skills-harness-integrity.test.ts:189-203` already asserts single-sourcing for
three policy keys via a `POLICY_KEYS` list. The CHANGELOG table gets the same treatment
rather than a bespoke test — one mechanism, one place to extend. The heading→bump table is
matched by a distinctive substring, asserted to occur exactly once repo-wide, in
`CONTRIBUTING.md`.

**Sub-Agent Registry stays outside the bootstrap block.** The boundary is host-portable
policy vs repo-internal contribution machinery; the registry names repo scripts that do not
exist on a host. Two stale counts are corrected: `validate-repository.test.ts:110` titled
"16 agents" while asserting 15, and `generate-subagent-artifacts.ts:9` claiming "64 files
(16 x 4 hosts)" while emitting 60.

## Risks carried into Execute

| Risk | Mitigation |
| --- | --- |
| JSONC comment-stripper corrupts URL values | State-machine stripper, dedicated all-URLs test fixture |
| 5 MB / 580-file bundle makes future `skills/` diffs unreadable | Accepted (A2); escape hatch recorded in D2 |
| Generated `lib/opencode-config.cjs` drifts from canonical | Same `--check` gate as the skills bundle |
| Turbo double-runs plugin tests | New plugin packages declare no `test` script; asserted |
| Gate passes vacuously | Mutation-verified in both directions before PR1 merges |
