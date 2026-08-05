# Untracked Generated Bundles Design

**Spec**: `.specs/features/untracked-generated-bundles/spec.md`
**Status**: Draft (pending user approach confirmation)

---

## Design Summary

Generated plugin bundles (~1,155 tracked files) become gitignored build output. One root entrypoint (`bun run generate:artifacts`) runs both generators; generation is chained in front of every consumer: Bun pre-scripts for local/CI test runs (measured working on Bun 1.3.14: `pretest:x` runs before `test:x`), an explicit CI build-job step, an explicit `publish.yml` build-job step before `Upload build artifacts` (publish jobs have no checkout — this is the only placement that works), and a checkout-detected generation step at the top of each plugin `install.sh`. Both generators gain prune-before-emit so stale artifacts cannot linger once git no longer tracks deletions.

## Approach Exploration (Large — recommendation first)

| | Approach | Verdict |
| --- | --- | --- |
| **A (recommended)** | Root `generate:artifacts` + Bun pre-scripts + CI/publish build-job steps + checkout-detected `install.sh` generation + prune-before-emit | Single generation contract reused by every consumer; no lifecycle-script magic in publish; smallest diff to public surfaces |
| B | Per-plugin `prepack` lifecycle scripts | **Rejected**: `publish.yml` publish jobs run `npm publish` against the uploaded artifact only — generator sources (`skills/`, `scripts/lib/`) are not in the artifact, so `prepack` cannot see them. Shipping sources in the artifact widens it for no gain |
| C | Relocate bundles to a gitignored `build/` tree and repoint consumers | **Rejected**: repoints marketplace `source` paths, plugin manifests, `files` fields, artifact lists, and every `install.sh` copy path — maximum blast radius for the same outcome |

## Requirements Traceability

| REQ | Design element |
| --- | --- |
| UGB-01 | `.gitignore` root-precise entries + scripted `git rm -r --cached` from `git ls-files` enumeration |
| UGB-02 | Root script `generate:artifacts` |
| UGB-03 | Existing `--check` after emit (determinism gate, unchanged semantics) |
| UGB-04 | Prune-before-emit in both generators |
| UGB-05/06/07 | `install.sh` checkout detection + fail-loud prerequisite check |
| UGB-08 | `install-harness.sh` generates once; `MASSA_AI_SKIP_ARTIFACT_GENERATION=1` handed to plugin installers |
| UGB-09 | No change to `EXPECTED_PACKAGES` / `files` fields; generation precedes staging |
| UGB-10 | `ci.yml` build-job "Generate plugin bundles" step after install, before build/verify/check/test steps |
| UGB-11 | `publish.yml` build-job generation step before `Upload build artifacts`; artifact path list unchanged |
| UGB-12 | `pretest:scripts` / `pretest:plugins` pre-scripts |
| UGB-13 | Parity tests gain a `beforeAll` bundle-presence guard with actionable message |
| UGB-14/15/16 | README marketplace section, CLAUDE.md/CONTRIBUTING.md updates, CHANGELOG entry |
| UGB-17 | Root `pretest:coverage` + `apps/opencode-plugin` package-level `pretest` (pre-mortem critical + high findings) |

## Current Codebase Evidence (inspected this session)

- `scripts/generate-skill-artifacts.ts:210-279` — `managedRootsFor` = `skills/{massa-ai,persona-router,profile,agents}` + capability-driven `lib` (opencode) and hook-binary copies (codex/cursor); `emitAll` copies bytes, **never prunes**; `--check` full-inventory diffs detect `unexpected` files.
- `scripts/generate-subagent-artifacts.ts:686-706` — `main()` emits active `agents/` + all `agent-profiles/` variants; `--profile` flag; `staleVariantDirs` detection exists in `--check` only.
- Import closure of both generators: node builtins + `scripts/lib/{host-capabilities,model-profiles}.ts` only — **no `node_modules` dependency**; generation works on bare Bun without `bun install`.
- `apps/{codex,cursor}-plugin/skills/{def,find,graph,index,map,status}` — **hand-authored sources, outside managed roots** (authored PR #12, not touched by any generator). Must stay tracked. This is why counts differ (180 vs 174).
- `apps/claude-plugin/hooks/massa-ai-hook.ts` — real source, stays tracked; only codex/cursor `hooks/massa-ai-hook` copies are generated; `hooks.json` beside them is tracked source.
- `publish.yml:108-151` — `Upload build artifacts` enumerates bundle dirs literally; publish jobs have no checkout. `npm publish` runs without `--ignore-scripts` but lifecycle scripts are unusable (no sources in artifact).
- `ci.yml:163-271` — build → verify-package-contents (172) → skill-artifacts `--check` (229) → test:scripts / test:plugins (270).
- Bun pre-script behavior: measured this session — `bun run test:x` executes `pretest:x` first (Bun 1.3.14).
- Consumers reading bundles from disk: both parity tests, `apps/*-plugin/__tests__/install.test.ts` (run real `install.sh` from `$SCRIPT_DIR`), `scripts/tests/test-model-profile-installer-*.sh`, `verify-package-contents.ts` staging invariant.
- `.specs/project/STATE.md` Decisions: AD-001..015 reviewed; none constrains bundle storage. AD-010 (single `MASSA_AI_*` env prefix) applies to the new skip variable name.

## Components

### 1. Prune-before-emit (both generators)

- **Purpose**: managed roots exactly equal fresh generator output; stale files from deleted sources vanish (UGB-04).
- **Location**: `scripts/generate-skill-artifacts.ts` (`emitAll`), `scripts/generate-subagent-artifacts.ts` (`emitAll`/`emitVariants`).
- **Behavior**: `fs.rm(root, {recursive, force})` per managed root (skill gen: the four skill roots + `lib` + hook-binary file; subagent gen: `agents/`, `agent-profiles/`) before copy. Never touches anything outside the enumerated roots — codex/cursor quick skills live beside, not inside, managed roots.
- **Reuses**: existing `managedRootsFor` / `HOST_DIRS` tables — prune list is derived, never a second literal list.

### 2. Root entrypoint + pre-scripts

- **Location**: root `package.json` + `apps/opencode-plugin/package.json`.
- `"generate:artifacts": "bun scripts/generate-skill-artifacts.ts && bun scripts/generate-subagent-artifacts.ts"`
- Root pre-scripts: `"pretest:scripts"`, `"pretest:plugins"`, **and `"pretest:coverage"`** → `bun run generate:artifacts`. The coverage pre-script closes the pre-mortem's critical finding: `coverage.yml` (blocking merge check) runs `bun run test:coverage` → `check-coverage.ts` → direct `bun test` over `apps/opencode-plugin`, whose `agents-install.test.ts` reads generated `agents/` off disk — a path neither `test:scripts` nor `test:plugins` chaining reaches.
- **Correction from pre-mortem**: "plugin dirs declare no `test` script" holds for only 3 of 4 — `apps/opencode-plugin` declares `test` and is turbo-reached. It gets a package-level `"pretest": "bun ../../scripts/generate-skill-artifacts.ts && bun ../../scripts/generate-subagent-artifacts.ts"` so turbo-dispatched `bun run test` is safe by construction, not by job step-ordering coincidence.
- Residual accepted exposure (same class as direct `bun test` on a parity file): invoking `bun scripts/check-coverage.ts` directly bypasses the pre-script; parity/e2e guards fail loudly, not vacuously.

### 3. `.gitignore` + untrack (root-precise)

```gitignore
apps/*-plugin/skills/massa-ai/
apps/*-plugin/skills/persona-router/
apps/*-plugin/skills/profile/
apps/*-plugin/skills/agents/
apps/*-plugin/agents/
apps/*-plugin/agent-profiles/
apps/codex-plugin/hooks/massa-ai-hook
apps/cursor-plugin/hooks/massa-ai-hook
apps/opencode-plugin/lib/opencode-config.cjs
```

Untrack via scripted `git rm -r --cached` over `git ls-files` enumeration of exactly these paths (memory: pathspec `*` crosses `/` — enumerate, then remove; diff the count against the tracked-file census before committing).

### 4. `install.sh` generation step (×4 + harness)

- Detection: `REPO_CHECKOUT` iff `$PLUGIN_SOURCE_ROOT/scripts/generate-skill-artifacts.ts` exists (claude/codex already resolve `PLUGIN_SOURCE_ROOT`; cursor/opencode use `$SCRIPT_DIR/../..` equivalent).
- Checkout + `MASSA_AI_SKIP_ARTIFACT_GENERATION` unset → run both generators via bun; bun missing → `exit 3`-style loud failure (matches existing installer runtime-missing convention) **before any host-config mutation**.
- Tarball (sources absent) → skip generation entirely.
- Post-step invariant (all contexts): bundle sentinel exists (`$SCRIPT_DIR/skills/massa-ai/SKILL.md` and `$SCRIPT_DIR/agents/` non-empty) else exit non-zero naming the missing artifact (UGB-07).
- `install-harness.sh`: runs `generate:artifacts` once up front, exports `MASSA_AI_SKIP_ARTIFACT_GENERATION=1` for the plugin phase (UGB-08). AD-010 conformant name; not read via `process.env` in `packages/`+`apps/` TS, so `turbo.json` passThroughEnv is untouched (the mechanized `turbo-passthrough-env.test.ts` will confirm).

### 5. CI + publish wiring

- `ci.yml` build job: `bun run generate:artifacts` step immediately after `bun install`, before build/verify-package-contents; existing `--check` step retained (now proves determinism + prune correctness on a fresh emit).
- `publish.yml` build job: same step after `bun install`, before `version-sync`/`Upload build artifacts`. Artifact list unchanged.

### 6. Parity-test presence guards

- `skill-artifact-parity.test.ts` / `subagent-parity.test.ts`: `beforeAll` asserts bundle sentinels exist with message `run 'bun run generate:artifacts' first` (UGB-13). All other assertions unchanged — they keep reading disk, which the pre-script freshly generated.

### 7. Documentation

- README marketplace section: generation prerequisite before `marketplace add`, post-pull regeneration, opt-in post-merge hook snippet (`bun run generate:artifacts`), never auto-installed.
- CLAUDE.md: "checked in" bundle claims (~5 MB/580 files, regenerate-and-commit guidance) → generated-on-demand contract.
- CONTRIBUTING.md: managed-harness protocol references to committed bundles, if present (verify during Execute with scripted sweep).
- CHANGELOG `[Unreleased]`: `### Changed` entry.

## Error Handling Strategy

| Error Scenario | Handling | User Impact |
| --- | --- | --- |
| bun missing in checkout install | Loud exit before host-config mutation, names prerequisite | Clear failure, nothing half-installed |
| Generation fails mid-install | Sentinel check exits non-zero | Same |
| Parity test without generation | beforeAll guard message | Actionable, not vacuous ENOENT |
| Marketplace add on ungenerated checkout | Documented prerequisite (no code gate possible — Claude reads dir directly) | README-covered |
| Standalone `massa-ai-config agents install` in ungenerated checkout | Accepted risk, folded into marketplace-staleness framing; README names this CLI path. Tarball installs unaffected (ship pre-generated). No repo-only logic added to the published CLI | Crash with ENOENT until `generate:artifacts` runs; documented |
| Publish artifact missing bundles | verify-package-contents in CI + artifact staging invariant | Release blocked before tag |

## Risks & Concerns

| Concern | Location | Impact | Mitigation |
| --- | --- | --- | --- |
| Prune deletes hand-authored files if root list drifts | `apps/{codex,cursor}-plugin/skills/*.md` | Source loss | Prune list derived from `managedRootsFor`/`HOST_DIRS` only; new test asserts quick skills survive emit; files stay tracked so git catches deletion |
| `git rm --cached` over/under-shoot | untrack commit | Wrong tracked set | Scripted enumeration from `git ls-files`, count diffed against census (1,150 + 2 hooks + 1 lib + agent totals) before commit |
| Publish ships empty plugins if step misordered | `publish.yml` | Broken release (irreversible npm publish) | Step before Upload; CI verify-package-contents; rehearse via local artifact staging |
| Marketplace staleness after pull | user checkout | Stale served plugin | Documented + opt-in hook; user-accepted 2026-08-05 |
| Direct `bun test` on install e2e without generation | `apps/*-plugin/__tests__/install.test.ts` | Confusing failure | install.sh itself generates in checkout context (UGB-05) — self-healing |
| `--check` semantics with prune | both generators | False drift reports | `--check` already emits to temp dirs; prune applies to real emit targets only — temp-dir path reviewed in Execute |

## Tech Decisions (feature-local)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Local test-time generation | Bun pre-scripts | Measured working; zero duplication in script bodies |
| Skip-generation signal | `MASSA_AI_SKIP_ARTIFACT_GENERATION=1` env | AD-010 single-prefix; bash-only consumer |
| Hook snippet | Docs-only, opt-in | Memory: installer side effects reverse user decisions |
| Prune scope | Derived from existing root tables | No second literal list to drift |

**Project-level decision to append on Execute** (next free ID, currently AD-016): "Generated plugin bundles are untracked build output; generation-on-demand is the contract; any new consumer of `apps/*-plugin` generated subtrees must chain `generate:artifacts` in front of itself."

## Verification Design

- UGB-01: scripted `git ls-files | wc -l` per subtree = 0 (print population beside verdict).
- UGB-03/04: emit → `--check` clean; delete a scratch source file → emit → artifact gone (discriminating, run in scratch worktree with sensor-presence check first).
- UGB-05/06/07/08: `test:plugins` e2e (checkout mode) + a staged tarball-shaped dir (no `scripts/`) exercising skip branch + a PATH-stripped run exercising loud failure.
- UGB-09/10/11: CI green; `verify-package-contents.ts` locally after fresh emit; grep step order in both workflows.
- UGB-12/13: fresh-clone simulation (clean scratch worktree): `bun install` → `bun run test:scripts` / `test:plugins` green; guard red observed by deleting one generated dir first (a new sensor needs an observed red).
- UGB-17: same fresh-clone simulation runs `bun run test:coverage` opencode unit and turbo `bun run test` — the pre-mortem proved the previous recipe's blind spot was congruent with the design's blind spot (both stopped at the two workflows being edited); every `.github/workflows/*.yml` that executes tests is now enumerated in the consumer inventory.
- UGB-14/15/16: scripted stale-claim sweep over README/CLAUDE.md/CONTRIBUTING.md; CHANGELOG diff.
