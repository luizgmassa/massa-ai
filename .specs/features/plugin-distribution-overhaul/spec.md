# Plugin Distribution Overhaul — Specification

- **Slug**: `plugin-distribution-overhaul`
- **projectId**: `massa-ai`
- **workflowSessionId**: `spec-plugin-distribution-overhaul`
- **Workflow**: spec-driven (Large — Specify + Design + Tasks + full Plan Challenge + Execute)
- **Persona**: AI Engineer (agent context / skill / harness architecture)

## Problem Statement

The four host plugins are not independently distributable. Only
`apps/opencode-plugin/` has a `package.json`, so Claude/Codex/Cursor cannot be
installed from a registry at all; and even where a plugin *is* published, the
skills it depends on never travel with it — `scripts/install-skills.sh:464-487`
symlinks `~/<host>/skills/<name>` back into `$REPO_ROOT/skills/`, so every host
silently depends on a local checkout staying in place. Separately, the OpenCode
installers only ever open the literal `opencode.json` and parse it with bare
`JSON.parse`, so a user whose config is `opencode.jsonc` (or who has comments in
it) gets either a second competing config file or an aborted install. Finally,
two maintenance taxes are due: the `qwen-profile.json` content-hash fixture
breaks tests on unrelated file edits (35 of its 71 entries are already stale on
`main`), and the CHANGELOG authoring rules are restated in full in three files
that name three different "canonical" sources.

## Goals

- [ ] Each of the four plugins installs and functions from a registry tarball with no repo checkout present.
- [ ] OpenCode installers edit the config file the user actually has, and never abort on a commented one.
- [ ] `bun run test` / `test:scripts` / `test:plugins` stay green with zero references to `qwen-profile.json`.
- [ ] The CHANGELOG heading→bump table exists in exactly one file, asserted by a test.

## Out of Scope

| Item | Reason |
| --- | --- |
| Unifying the 6 command skills (`def`/`find`/`graph`/`index`/`map`/`status`) across hosts | Real duplication, but a separate host-command-surface change; user selected the bundle scope that excludes it. Tracked as a follow-up. |
| Publishing `@massa-ai/web-ui` | Stays `private: true`; it is served by `tools-api`, not consumed standalone. |
| Docker image publishing changes | `publish-docker` remains `continue-on-error` and credential-gated. |
| Major version bump | Automation never bumps major; this ships as a minor. |
| Comment-preserving JSONC writes | Explicitly rejected in favor of backup-then-restringify (Assumption A1). |
| Rewriting `.specs/features/auto-release-versioning/*` history | Historical record; annotated, not rewritten (Assumption A6). |
| Root `AGENTS.md:22-44` roster consolidation | Unguarded duplicate found during investigation, but out of the four asks. Tracked as a follow-up. |

---

## Assumptions & Open Questions

| # | Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- | --- |
| A1 | OpenCode config resolution | Probe `opencode.jsonc`, then `opencode.json`; edit whichever exists; create `opencode.jsonc` only when neither does. JSONC-tolerant parse, `JSON.stringify` write, backup before write. | User-selected. Avoids creating a second competing file, and avoids the split-brain where OpenCode core merges `opencode.json` *over* `opencode.jsonc`. | **y** |
| A2 | Skills delivery mechanism | Generator emits real, checked-in `apps/<host>-plugin/skills/` trees from `skills/`, with a `--check` drift gate wired into CI. | User-selected. Mirrors the existing `generate-subagent-artifacts.ts` pattern already guarded by `subagent-parity.test.ts`. | **y** |
| A3 | Bundle scope | `skills/massa-ai/`, `skills/persona-router/`, **and** `skills/agents/*/SKILL.md` raw charters. | User-selected ("Everything under skills/"). Charters therefore ship twice per plugin — raw under `skills/agents/`, generated under `agents/` — accepted for self-containment. | **y** |
| A4 | qwen removal depth | Full removal, including `repinFixtureHashes`, `update-qwen-hashes`, and `release.yml`'s `git add` line; `_helpers.ts` shared identity reworked; `22.path-identity.test.ts` rewritten. | User-selected. | **y** |
| A5 | New package names | `@massa-ai/claude-plugin`, `@massa-ai/codex-plugin`, `@massa-ai/cursor-plugin`. | Matches the existing `@massa-ai/opencode-plugin` convention and the `@luizgmassa/*` GitHub Packages rescope rule (`publish.yml:246`). | n — accepted default |
| A6 | Shipped spec history referencing ARV-R13 | Left intact; a one-line supersession note is appended to `.specs/project/STATE.md`. | Rewriting a validated feature's trail destroys the audit record. | n — accepted default |
| A7 | Post-qwen shared E2E identity | `resolveSharedProfileIdentity()` sources provider/model/dimensions from the **embeddings config resolver** (`packages/core/src/services/embeddings/config.ts`), never from raw `process.env` with no fallback. `manifestHash` is **removed** from the `SharedFixtureProfile` interface and from `deriveSharedProfileIdentity`'s completeness check; the commit SHA carries that role alone. | Today `_helpers.ts:159-163` uses the manifest purely as a `??` default when `EMBEDDING_PROVIDER` / `OLLAMA_EMBEDDING_MODEL` / `OLLAMA_EMBEDDING_DIMENSIONS` are unset. Reading env directly with no fallback would make `deriveSharedProfileIdentity` throw at import time (`:117-126`), which nulls `SHARED_PID` and reintroduces the per-file indexing OOM that `_helpers.ts:405-410` documents the shared PID as the fix for. | **y — revised after Plan Challenge** |
| A8 | Symlinked hook binaries in codex/cursor | Replaced by generated real files, since npm tarball symlink handling is not a contract we control. | Required by the "installs from a registry" goal; a dangling symlink in a tarball is a silent runtime failure. | n — accepted default |
| A9 | Two skill writers per host | `install-skills.sh` remains the single writer when a checkout is present; a plugin's `install.sh` installs its bundled skills only when `install-skills.sh` did not. | Mirrors the existing MCP single-writer invariant (`test-mcp-single-writer.sh`) and its OpenCode skip-then-uninstall precedent. | n — accepted default |
| A10 | Merge sequencing | **Two PRs.** PR1 = workstreams 1 (OpenCode `.jsonc`), 4 (qwen), 5 (docs) **plus the new tarball-inventory CI gate**. PR2 = workstreams 2 (skills bundling) + 3 (publishing). Each cuts its own release. | User-selected after Plan Challenge. The publish surface's first live-fire run must not be the merge that also creates the irreversible tag. Landing the gate first means it is proven against a real defect (A11) before anything depends on it. | **y** |
| A11 | Tarball-inventory gate scope | The gate runs `npm pack` per publishable package, extracts, and asserts the file inventory against an expected manifest. It is CI-blocking, added in PR1 against the **current 5** packages, and extended to 8 in PR2. | Verified this session: `@massa-ai/opencode-plugin@1.3.1` ships **only** `dist/` + `package.json`, though its `files` is `["dist","agents/*.md"]` — the 15 agent charters are missing from every published release, because `publish-apps` has no `actions/checkout` and `publish.yml:93-94` uploads only `dist` + `package.json`. The gate fails on this on day one, which is the point. | **y — new after Plan Challenge** |

**Open questions:** none — all resolved or logged above.

### Plan Challenge record

Full The Fool gate, `pre_mortem` mode, dispatched to `massa-ai-plan-critic`. Four findings
(2 critical, 2 high), all accepted and incorporated per `serious_findings: revise_plan`:

| Finding | Severity | Incorporated as |
| --- | --- | --- |
| `scripts/version-sync.ts` never named as a touch point; `apps/cursor-plugin/.cursor-plugin/plugin.json` is pinned at `1.0.0` vs root `1.4.0` and is absent from `EXTRA_VERSIONED_MANIFESTS` (`:67-70`) | critical | PDO-24 |
| Publish jobs have **no `actions/checkout`**; every publishable file must be enumerated in the `build-output` artifact list, and the three new plugins are 100% static source with no `dist/`. Confirmed as an already-shipped defect. | critical | PDO-25, PDO-26, A11 |
| A7's replacement identity had no named default-source; raw `process.env` would throw at import and regress the documented shared-PID OOM fix | high | A7 revised |
| All-or-nothing merge: the new publish path's first real run would also be the irreversible release | high | A10 |

---

## User Stories

### P1: OpenCode config is edited where the user actually keeps it ⭐ MVP

**User Story**: As an OpenCode user whose config is `opencode.jsonc` with comments, I want the massa-ai installers to edit that file so that I do not end up with a second, competing `opencode.json` or a failed install.

**Why P1**: Today this is a silent correctness bug — `scripts/install-agents.sh:161` and `apps/opencode-plugin/install.sh:61` hardcode `opencode.json`, so a pre-existing `.jsonc` reads as ENOENT and a fresh `.json` is created beside it.

**Acceptance Criteria**:

1. WHEN only `opencode.jsonc` exists THEN the installer SHALL edit `opencode.jsonc` and SHALL NOT create `opencode.json`.
2. WHEN only `opencode.json` exists THEN the installer SHALL edit `opencode.json` and SHALL NOT create `opencode.jsonc`.
3. WHEN neither exists THEN the installer SHALL create `opencode.jsonc`.
4. WHEN both exist THEN the installer SHALL edit `opencode.json` and SHALL emit a warning naming both files, because OpenCode core merges `.json` over `.jsonc`.
5. WHEN the target file contains `//` or `/* */` comments or trailing commas THEN the installer SHALL parse it successfully and SHALL NOT abort.
6. WHEN the target file is genuinely malformed (not merely commented) THEN the installer SHALL refuse to overwrite and SHALL exit non-zero with the existing "not valid JSON" class of message naming the file.
7. WHEN any write occurs THEN a backup SHALL be created at `<file>.massa-ai.bak-<ts>` before the write, and the emitted message SHALL name the backup path.
8. WHEN uninstall runs THEN it SHALL remove the entry from whichever file holds it and SHALL NOT create the other filename.

**Independent Test**: `scripts/tests/test-install-agents-json.sh` + `apps/opencode-plugin/__tests__/install.test.ts` fixtures for each of the four existence combinations.

---

### P1: Each plugin ships its own skills ⭐ MVP

**User Story**: As a user who installed a massa-ai plugin from npm, I want the skills to be present inside the package so that the harness works without a repo checkout on my machine.

**Why P1**: This is the blocking defect behind "make all four plugins available at npm" — publishing a plugin whose skills resolve to `$REPO_ROOT/skills/` ships a guaranteed dangling reference.

**Acceptance Criteria**:

1. WHEN the generator runs THEN it SHALL write real files (no symlinks) under `apps/<host>-plugin/skills/` for all four hosts, from `skills/massa-ai/`, `skills/persona-router/`, and `skills/agents/*/SKILL.md`.
2. WHEN a source file under `skills/` changes without regenerating THEN `--check` SHALL exit non-zero and name the drifted paths.
3. WHEN CI runs THEN the `--check` gate SHALL execute, in the same job that already guards the agent artifacts.
4. WHEN a plugin is installed from a registry tarball with no repo present THEN the host's skills directory SHALL contain real files and SHALL contain no path resolving into a repo checkout.
5. WHEN `install-skills.sh --apply` has already installed skills for a host THEN that host's plugin `install.sh` SHALL NOT install a second copy, and SHALL say so.
6. WHEN `install-skills.sh --uninstall` runs THEN it SHALL remove what it installed and SHALL NOT remove a plugin-installed bundle it does not own.
7. WHEN the bundled tree is compared to `skills/` THEN `SKILL.md` frontmatter SHALL be byte-identical, so `skills.yml` frontmatter validation holds for both copies.

**Independent Test**: run the generator into a tmp dir, diff against the checked-in trees; then install a `npm pack` tarball into a scratch HOME with the repo path made unreadable.

---

### P1: All four plugins publish to npm and GitHub Packages ⭐ MVP

**User Story**: As a user on any of the four hosts, I want to install the plugin from a registry so that I do not have to clone the repo.

**Acceptance Criteria**:

1. WHEN the release chain runs THEN `@massa-ai/claude-plugin`, `@massa-ai/codex-plugin`, `@massa-ai/cursor-plugin`, and `@massa-ai/opencode-plugin` SHALL each publish to npmjs.org.
2. WHEN the GitHub Packages job runs THEN the same four SHALL publish rescoped to `@luizgmassa/*`, after the npm jobs succeed.
3. WHEN a version is already present on a registry THEN that package's publish step SHALL skip with an "already on npm — skipping" style message and SHALL NOT fail the job.
4. WHEN `bun run version:sync` runs THEN all four plugin `package.json` files, the root, every workspace package, and the three host manifests (`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `.cursor-plugin/plugin.json`) SHALL carry the root version.
5. WHEN the three new `package.json` files join the `apps/*` workspace glob THEN `bun install --frozen-lockfile`, `bun run build`, `bun run type-check`, and `bun run test` SHALL all still succeed.
6. WHEN a published tarball is inspected THEN it SHALL contain no symlink and no dangling path — specifically `codex`/`cursor` `hooks/massa-ai-hook` SHALL be a real file.
7. WHEN `test:plugins` and turbo `test` both exist THEN plugin `__tests__` SHALL run exactly once per CI job, with no double execution and no silently dropped suite.
8. **(PDO-24)** WHEN `bun run version:sync` runs THEN `apps/cursor-plugin/.cursor-plugin/plugin.json` SHALL be updated too, and a test SHALL assert all three host manifests **equal** the root version — not merely that `version:sync` exited zero.
9. **(PDO-25)** WHEN `publish.yml`'s `build-output` artifact is uploaded THEN it SHALL enumerate, per plugin, every directory named by that package's `files` field — because `publish-packages`, `publish-apps`, and `publish-github-packages` have **no `actions/checkout`** and can only see artifact contents. The three new plugins have no `dist/`; their entire publishable surface is static source (`agents/`, `commands/`, `hooks/`, `skills/`, `install.sh`, `README.md`, `.<host>-plugin/plugin.json`).
10. **(PDO-26)** WHEN the tarball-inventory gate runs THEN it SHALL `npm pack` each publishable package, extract it, and assert the file inventory against an expected manifest, failing CI on any missing or unexpected entry. It SHALL be added in PR1 against the current 5 packages — where it is expected to **fail immediately** on `@massa-ai/opencode-plugin`'s missing `agents/*.md` — and extended to 8 packages in PR2.
11. **(PDO-26)** WHEN `@massa-ai/opencode-plugin` is published after PR1 THEN its tarball SHALL contain the 15 `agents/massa-ai-*.md` charters its `files` field has always declared.

**Independent Test**: `npm pack` each package, extract to a scratch dir, assert file inventory and absence of symlinks; dry-run the publish guard against an already-published version. Mutation check: remove one directory from the artifact list and confirm the gate fails.

---

### P2: `qwen-profile.json` and its hash tax are gone

**User Story**: As a contributor, I want editing `README.md` or a `package.json` to not break the e2e suite so that routine changes do not require a fixture-hash refresh.

**Why P2**: Not blocking distribution, but it is a live tax — and it directly collides with this feature, which adds three new `package.json` files.

**Acceptance Criteria**:

1. WHEN the repo is grepped for `qwen-profile`, `qwen-fixture`, or `update-qwen-hashes` THEN there SHALL be zero hits outside `.specs/` history.
2. WHEN `bun run test`, `bun run test:scripts`, and `bun run test:plugins` run THEN all SHALL pass with no fixture-hash assertion remaining.
3. WHEN a dedicated-fixture E2E run resolves `SHARED_PID` THEN it SHALL derive a stable identity without reading any manifest file, and the 10 consuming e2e files SHALL still isolate per embedding profile.
4. WHEN the release workflow commits a bump THEN it SHALL NOT reference `qwen-profile.json`, and `release-version.ts` SHALL contain no `repinFixtureHashes`.
5. WHEN `scripts/update-fixture-hashes.py` runs without `--manifest` THEN the `corpus` handler SHALL still work, and the `qwen` handler SHALL be absent.
6. WHEN `scripts/__tests__/release-version.test.ts` runs THEN it SHALL still assert version derivation, changelog promotion, and workspace sync, with the fixture-repin cases removed rather than skipped.

**Independent Test**: `rg -n 'qwen-profile|qwen-fixture|update-qwen-hashes' --glob '!.specs/**'` returns nothing; full suite green.

---

### P2: CHANGELOG authoring lives in exactly one file

**User Story**: As a contributor, I want one authoritative CHANGELOG rule set so that I do not follow a stale copy and cut the wrong version.

**Acceptance Criteria**:

1. WHEN `skills/AGENTS.md` is read THEN it SHALL contain no CHANGELOG section and no CHANGELOG reference of any kind.
2. WHEN `CLAUDE.md` is read THEN the heading→bump rules SHALL be replaced by a link to `CONTRIBUTING.md`, while release *mechanics* (skip-ci marker, deploy key, cross-package pinning, half-release recovery) SHALL remain in `CLAUDE.md`.
3. WHEN `CONTRIBUTING.md` is read THEN it SHALL remain the single source, with its `qwen-profile.json` paragraph removed.
4. WHEN the repo is scanned by a test THEN the heading→bump table SHALL appear in exactly one file, and that file SHALL be `CONTRIBUTING.md`.
5. WHEN the bootstrap block is re-extracted THEN removal of the CHANGELOG section SHALL NOT break the marker contract or any existing `install-skills.sh` shell test.

**Independent Test**: new discriminating test in `scripts/__tests__/`; mutate a second copy back in and confirm it fails.

---

### P3: Stale registry counts corrected

**Acceptance Criteria**:

1. WHEN `validate-repository.test.ts` is read THEN its sub-agent test title SHALL state the same count it asserts (15).
2. WHEN `generate-subagent-artifacts.ts`'s docstring is read THEN its file-count claim SHALL match what it emits (60 = 15 × 4).
3. WHEN `skills/AGENTS.md` is read THEN the Sub-Agent Registry SHALL remain **outside** the bootstrap markers — repo-internal contribution machinery is not host-portable policy.

---

## Edge Cases

- WHEN both `opencode.jsonc` and `opencode.json` exist THEN warn and prefer `.json` (it wins OpenCode's merge).
- WHEN a `.jsonc` has a UTF-8 BOM THEN the parser SHALL strip it rather than throw (documented OpenCode failure mode).
- WHEN neither `node` nor `bun` is on PATH THEN the installers SHALL keep the existing `exit 3` contract.
- WHEN the generator runs on a tree where `apps/<host>-plugin/skills/` contains an unmanaged extra file THEN `--check` SHALL report it rather than silently leaving it.
- WHEN `skills/` contains a file too large or binary THEN the generator SHALL fail loudly rather than emit a partial bundle.
- WHEN a plugin tarball is installed over an older symlink-based install THEN the installer SHALL refuse to clobber a non-symlink/non-owned path, preserving the existing pre-pass abort (`install-skills.sh:452-461`).
- WHEN `release.yml` stages the bump commit after qwen removal THEN a stale `git add` pathspec SHALL NOT remain.

---

## Implicit-Requirement Sweep (Large — every dimension resolved)

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | JSONC parse must accept comments/trailing commas/BOM and still reject genuinely malformed input (P1-1 AC5, AC6). Generator rejects binary/oversized sources. |
| Failure / partial-failure states | Publish guard makes a partial publish resumable (P1-3 AC3). Installer backups precede every write (P1-1 AC7). Generator is all-or-nothing per host. |
| Idempotency / retry / duplicate handling | Re-running any installer is a no-op (existing contract, preserved). Re-dispatching `publish.yml` at a tag skips what landed. Generator is deterministic — byte-identical output on re-run. |
| Auth boundaries & rate limits | `NPM_TOKEN` stays repository-scoped (no `environment:` on any job). GitHub Packages uses `GITHUB_TOKEN` with `packages: write`. No new secret. |
| Concurrency / ordering | `publish-github-packages` keeps `needs: [build, publish-packages, publish-apps]` so registries cannot diverge. Skills → MCP → plugins harness order preserved; A9 keeps a single skills writer. |
| Data lifecycle / expiry | User config backups accumulate as `<file>.massa-ai.bak-<ts>` — existing behavior, unchanged, not pruned. |
| Observability | Every installer decision (which config file chosen, why a skills install was skipped) is logged at the existing verbosity level. |
| External-dependency failure | `npm view` failure reads as "not published" and then fails loudly on the real conflict — existing deliberate behavior, preserved. |
| State-transition integrity | `install-state.json` (v2) must record plugin-bundled vs repo-symlinked skills so uninstall removes only what it owns (P1-2 AC6). |

---

## Requirement Traceability

| ID | Story | Phase | Status |
| --- | --- | --- | --- |
| PDO-01 | P1 OpenCode config | Design | Pending |
| PDO-02 | P1 OpenCode config | Design | Pending |
| PDO-03 | P1 OpenCode config | Design | Pending |
| PDO-04 | P1 OpenCode config | Design | Pending |
| PDO-05 | P1 OpenCode config | Design | Pending |
| PDO-06 | P1 Skills bundling | Design | Pending |
| PDO-07 | P1 Skills bundling | Design | Pending |
| PDO-08 | P1 Skills bundling | Design | Pending |
| PDO-09 | P1 Skills bundling | Design | Pending |
| PDO-10 | P1 Publishing | Design | Pending |
| PDO-11 | P1 Publishing | Design | Pending |
| PDO-12 | P1 Publishing | Design | Pending |
| PDO-13 | P1 Publishing | Design | Pending |
| PDO-14 | P1 Publishing | Design | Pending |
| PDO-15 | P1 Publishing | Design | Pending |
| PDO-16 | P2 qwen removal | Design | Pending |
| PDO-17 | P2 qwen removal | Design | Pending |
| PDO-18 | P2 qwen removal | Design | Pending |
| PDO-19 | P2 qwen removal | Design | Pending |
| PDO-20 | P2 CHANGELOG ownership | Tasks | Pending |
| PDO-21 | P2 CHANGELOG ownership | Tasks | Pending |
| PDO-22 | P2 CHANGELOG ownership | Tasks | Pending |
| PDO-23 | P3 Registry counts | Tasks | Pending |
| PDO-24 | P1 Publishing (Fool #1) | Design | Pending |
| PDO-25 | P1 Publishing (Fool #2) | Design | Pending |
| PDO-26 | P1 Publishing (Fool #2) | Design | Pending |

**Coverage:** 26 total, 0 mapped to tasks yet.

### PR allocation (A10)

| PR | Requirements | Release risk |
| --- | --- | --- |
| PR1 | PDO-01..05 (OpenCode `.jsonc`), PDO-16..19 (qwen), PDO-20..23 (docs), **PDO-26** (gate + the defect it catches) | Low — no publish-surface change |
| PR2 | PDO-06..09 (skills bundling), PDO-10..15 (publishing), PDO-24, PDO-25 | Guarded — gate already live from PR1 |

---

## Verification Approach

| Requirement group | Deterministic gate |
| --- | --- |
| OpenCode config | `bash scripts/tests/test-install-agents-json.sh`, `test-install-agents-cli.sh`, `test-install-agents-uninstall.sh`, `test-install-agents-mcp-source.sh`, `bun test apps/opencode-plugin/__tests__` |
| Skills bundling | new `bun scripts/generate-skill-artifacts.ts --check`; `bun run test:scripts`; tarball-extraction test in a scratch HOME |
| Publishing | **CI-blocking tarball-inventory gate** (`npm pack` → extract → assert inventory, PDO-26) — not a manual step; `bun run build`; `bun run type-check`; `bun run test`; `bun scripts/version-sync.ts` + a new all-three-host-manifests-equal-root assertion (PDO-24) |
| qwen removal | `rg -n 'qwen-profile\|qwen-fixture\|update-qwen-hashes' --glob '!.specs/**'` → empty; `bun run test`; `bun run test:scripts` |
| Doc ownership | new single-source test in `scripts/__tests__/`; `bash scripts/tests/test-install-skills-apply.sh`; `bun test scripts/__tests__/skills-harness-integrity.test.ts` |

**Discrimination requirement**: every new test must be mutation-verified in both directions — re-introduce the defect and confirm the test fails.

## Success Criteria

- [ ] Four registry tarballs, each installable into a scratch HOME with the repo checkout unreadable.
- [ ] Zero `qwen-*` references outside `.specs/` history; full suite green.
- [ ] CHANGELOG heading→bump table in exactly one file, guarded by a mutation-verified test.
- [ ] `skills/AGENTS.md` bootstrap markers unchanged in position semantics; Sub-Agent Registry still outside.
- [ ] The tarball-inventory gate is CI-blocking and demonstrably caught the pre-existing `opencode-plugin` `agents/*.md` omission in PR1.
- [ ] All three host plugin manifests report the root version after `version:sync` (cursor's `1.0.0` drift closed).
