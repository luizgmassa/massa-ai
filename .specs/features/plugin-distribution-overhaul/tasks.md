# Plugin Distribution Overhaul — Tasks

Spec: `spec.md` (26 requirements). Design: `design.md`. Sequencing: A10 — two PRs.
One atomic commit per task. Gate must pass before a task is done.

## PR1 — gate first, no publish-surface risk

Branch: `feat/plugin-harness-gate-and-cleanup`

| # | Task | Reqs | Gate |
| --- | --- | --- | --- |
| T1 | `scripts/verify-package-contents.ts` — `npm pack` → extract → assert inventory per package, with expected manifests. Wire into `ci.yml`. **Mutation-verify both directions before proceeding.** | PDO-26 | new test + deliberate artifact-list removal fails it |
| T2 | Fix the confirmed live defect: add `apps/opencode-plugin/agents` to `publish.yml`'s `build-output` list so `files: ["dist","agents/*.md"]` becomes true. T1 goes green. | PDO-26 | T1 gate passes |
| T3 | `scripts/lib/opencode-config.cjs` — `resolveConfigPath` / `parseJsonc` / `writeConfig`. State-machine comment stripper. Tests incl. an all-URL-values fixture and a BOM fixture. | PDO-02 | `bun test scripts/__tests__/opencode-config.test.ts` |
| T4 | `scripts/install-agents.sh` — resolve via T3 helper; `agent_config_path opencode` returns the resolved path; `opencode_plugin_present` checks the resolved file; both-exist warning. | PDO-01, 04, 05 | `test-install-agents-{json,cli,uninstall,mcp-source}.sh`, `test-mcp-single-writer.sh` |
| T5 | `apps/opencode-plugin/install.sh` — same resolution; backup message names the path. Vendored `lib/opencode-config.cjs` copy (hand-added here; generator adopts it in T11). | PDO-01, 03, 04 | `bun test apps/opencode-plugin/__tests__` |
| T6 | Delete `fixtures/qwen-profile.json`, `e2e/qwen-fixture.ts`, `e2e/21.qwen-fixture.test.ts`, `__tests__/qwen-e2e-fixture.test.ts`, `core/scripts/prepare-qwen-e2e-fixture.ts`. | PDO-16, 17 | `bun run test` (core) |
| T7 | `_helpers.ts` — drop `manifestHash` from `SharedFixtureProfile`; source provider/model/dimensions from the embeddings config resolver. Rewrite `e2e/22.path-identity.test.ts`. | PDO-18 | core e2e; `SHARED_PID` non-null with env unset |
| T8 | Remove `repinFixtureHashes` + `FIXTURE_REL_PATH` from `release-version.ts` and its tests; drop `QwenFixtureHandler` from `update-fixture-hashes.py`; drop `update-qwen-hashes` from `package.json`; drop `release.yml:111-112` pathspec. | PDO-19 | `bun run test:scripts`; `rg 'qwen-profile\|qwen-fixture\|update-qwen-hashes' --glob '!.specs/**'` empty |
| T9 | Delete `skills/AGENTS.md:230-244`. Replace `CLAUDE.md`'s `#### How to write CHANGELOG entries` with a link to `CONTRIBUTING.md`. Remove `CONTRIBUTING.md:151-153`. Extend `POLICY_KEYS` in `skills-harness-integrity.test.ts` to cover the heading→bump table. | PDO-20, 21, 22 | `test-install-skills-apply.sh`; harness-integrity test; mutation check |
| T10 | Fix stale counts: `validate-repository.test.ts:110` title, `generate-subagent-artifacts.ts:9` docstring. | PDO-23 | `bun run test:scripts` |

**PR1 exit gate:** `bun run build` · `bun run type-check` · `bun run test` · `bun run test:scripts` · `bun run test:plugins` · T1 gate green · zero qwen refs.

## PR2 — publish surface, on a guarded pipeline

Branch: `feat/plugin-skills-bundling-and-publishing`

| # | Task | Reqs | Gate |
| --- | --- | --- | --- |
| T11 | `scripts/generate-skill-artifacts.ts` + `--check` with full-inventory comparison (detects extras, not just changes). Adopts T5's vendored `lib/` copy as a generated artifact. | PDO-06, 07 | `--check` clean; drift + extra-file cases fail it |
| T12 | Run the generator; commit the four `apps/*-plugin/skills/` trees (~5 MB / 580 files). Wire `--check` into CI beside the agent-artifact gate. | PDO-06, 07 | `--check` in CI |
| T13 | `install-skills.sh`: `ln -s` → copy; `install-state.json` v2 gains `skillsOwner`; generalize the non-symlink pre-pass to state-based ownership. Plugin `install.sh` files skip when repo-owned. | PDO-08, 09 | install-skills shell suite; scratch-HOME tarball install |
| T14 | Add `package.json` to `apps/{claude,codex,cursor}-plugin` (`@massa-ai/<host>-plugin`, no `test` script). Replace the two `hooks/massa-ai-hook` symlinks with generated real files. | PDO-10, 14 | `npm pack` shows no symlink and no missing entry |
| T15 | Add `apps/cursor-plugin/.cursor-plugin/plugin.json` to `EXTRA_VERSIONED_MANIFESTS`; new test asserting all three host manifests **equal** the root version. | PDO-24 | `version:sync` + new assertion |
| T16 | `publish.yml`: derive `build-output` paths from each package's `files`; add three npm publish steps with the already-published guard; extend the GH-Packages rescope list and loop to 8. | PDO-11, 15, 25 | workflow lint; guard rehearsal against a published tag |
| T17 | Extend T1's expected manifests from 5 to 8 packages. | PDO-26 | gate green on all 8 |
| T18 | Confirm turbo does not double-run plugin suites; update `CLAUDE.md` (four plugin dirs are now workspace packages; `test:plugins` remains the single plugin runner). | PDO-13 | each suite runs exactly once |

**PR2 exit gate:** PR1 gates · `--check` clean · all 8 tarballs pass inventory · scratch-HOME install with the repo path unreadable.

## Test Coverage Matrix

| Requirement group | New/changed tests |
| --- | --- |
| PDO-01..05 | `scripts/__tests__/opencode-config.test.ts` (new); 4 install-agents shell suites extended with `.jsonc`-only / `.json`-only / both / neither / commented fixtures |
| PDO-06..09 | generator `--check` drift + extra-file cases; scratch-HOME tarball install |
| PDO-10..15, 24..26 | `scripts/verify-package-contents.ts` (new gate); host-manifest version equality (new) |
| PDO-16..19 | deletions verified by absence-grep; `SHARED_PID` non-null with env unset |
| PDO-20..23 | `skills-harness-integrity.test.ts` `POLICY_KEYS` extended; mutation check |

## Gate Check Commands

```bash
bun run build && bun run type-check
bun run test
bun run test:scripts
bun run test:plugins
bun scripts/verify-package-contents.ts          # PR1 onward
bun scripts/generate-skill-artifacts.ts --check # PR2 onward
rg -n 'qwen-profile|qwen-fixture|update-qwen-hashes' --glob '!.specs/**'   # must be empty
```

## Notes

- T1 before T2 is deliberate: the gate must be observed failing on a real defect before
  anything depends on it.
- T3 before T4/T5: both installers consume the same helper.
- T6 before T7: deleting the fixture is what forces the identity rework.
- T5's vendored copy is hand-added, then adopted by the generator in T11 — so PR1 does not
  depend on PR2's generator existing.
- Every CHANGELOG entry lands under `### Added` / `### Changed` / `### Fixed` as
  appropriate; both PRs cut a release.
