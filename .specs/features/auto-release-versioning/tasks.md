# Tasks — Auto Release Versioning

8 tasks, one atomic commit each. Below the ~8-task sub-agent offer threshold, so this
executes in the main agent.

## Dependency order

```
T0 (probe DEPLOY env) ──────────────┐
T1 (script) ──▶ T2 (tests) ──┐      │
                             ▼      ▼
                        T3 (release.yml)
                             │
                             ▼
                   T4 (publish triggers) ──▶ T5 (drop environment:) ──▶ T6 (gh packages job)
                                                                            │
                                                                            ▼
                                                                    T7 (docs) ──▶ T8 (validate)
```

T0 is independent and must complete before T5 lands.

## Tasks

### T0 — Probe the `DEPLOY` environment before removing it

Blocking pre-check for ARV-R9. Determine whether `DEPLOY` carries protection rules or
**environment-scoped** secrets. If `NPM_TOKEN` or `DOCKERHUB_*` are environment-scoped,
removing `environment: DEPLOY` unbinds them and every publish silently 401s.

```bash
gh api repos/luizgmassa/massa-ai/environments --jq '.environments[].name'
gh api repos/luizgmassa/massa-ai/environments/DEPLOY/secrets --jq '.secrets[].name'
gh secret list --repo luizgmassa/massa-ai
```

- **Gate:** the repo-scope secret list contains `NPM_TOKEN`, `DOCKERHUB_USERNAME`,
  `DOCKERHUB_TOKEN`. If any are environment-only, stop and re-add them at repo scope
  **before** T5; record the action in `validation.md`.
- **Files:** none (investigation). Findings recorded in `validation.md`.

### T1 — `scripts/release-version.ts`

Implement the exported surface from `design.md` § Component 1: `extractUnreleased`,
`unreleasedHeadings`, `decideBump`, `nextVersion`, `promoteChangelog`,
`repinFixtureHashes`, `deriveRelease`, plus the `import.meta.main` CLI with `--dry-run`.
JSON to stdout, diagnostics to stderr. Reuses `syncVersions` from `version-sync.ts` rather
than reimplementing the sync, and feeds its returned path list straight into
`repinFixtureHashes` (ARV-R13).

Date is `new Date().toISOString().slice(0, 10)` (UTC), overridable via `opts.today` so T2
can assert it without freezing the clock (F5).

- **Gate:** `bun scripts/release-version.ts --dry-run` exits 0 and prints
  `{"current":"1.2.1","next":"1.3.0","bump":"minor",...}`.
- **Files:** `scripts/release-version.ts`, `package.json` (add `release:version` script).

### T2 — `scripts/__tests__/release-version.test.ts`

Tests derive from spec acceptance criteria, not from the implementation. Coverage matrix
below. Uses a temp-dir fixture repo, never the real `CHANGELOG.md`.

- **Gate:** `bun test scripts/__tests__/release-version.test.ts` — all pass.
- **Files:** `scripts/__tests__/release-version.test.ts`.

### T3 — `.github/workflows/release.yml`

New workflow per `design.md` § Component 2: `workflow_run`[CI, main] + `workflow_dispatch`,
`concurrency: release`, success guard, `ref: main` + `fetch-depth: 0` checkout, bot
identity, skip path via `outputs.released`, `--atomic` push, `gh release create --notes-file`,
then the `publish.yml` call with `secrets: inherit`.

Per F4: `git fetch --tags origin` and an explicit "tag already exists" failure *before* the
push; `outputs.released=true` set only after the push returns 0.

Per ARV-R13: stage `packages/core/src/__tests__/e2e/fixtures/qwen-profile.json` alongside
the version and changelog files in the single release commit.

- **Gate:** `actionlint .github/workflows/release.yml` (or `bunx yaml` parse if actionlint
  is unavailable); `grep -c 'workflow_run' ` confirms the CI gate; manual read-through
  against ARV-R3/R5/R6/R12.
- **Files:** `.github/workflows/release.yml`.

### T4 — `publish.yml`: triggers and dist-tag (ARV-R10)

Replace `release` / `push: tags` / `workflow_run` triggers with `workflow_call` +
`workflow_dispatch`, **both declaring `inputs.ref: { required: true }`** (F3). Delete
`env.NPM_TAG`. Hardcode `--tag latest` on all 5 npm publish steps. Checkout becomes
`ref: ${{ inputs.ref }}` — the `github.event.workflow_run.head_sha || github.ref` fallback
at `publish.yml:35` is deleted, not adapted.

- **Gate:** `grep -n 'NPM_TAG\|workflow_run\|head_sha\|tag next' .github/workflows/publish.yml`
  returns nothing; `grep -c 'tag latest'` returns 5; `required: true` appears for both
  `ref` inputs.
- **Files:** `.github/workflows/publish.yml`.

### T5 — `publish.yml`: remove `environment: DEPLOY` (ARV-R9)

Depends on T0 passing.

- **Gate:** `grep -rn 'environment:' .github/workflows/` returns nothing.
- **Files:** `.github/workflows/publish.yml`.

### T6 — `publish.yml`: `publish-github-packages` job (ARV-R8)

New isolated job per `design.md` § Component 3, with
`needs: [build, publish-packages, publish-apps]` (F2 — it must not race the npm jobs):
own artifact download, `packages: write`,
`setup-node` with `registry-url: https://npm.pkg.github.com` and `scope: '@luizgmassa'`,
inline `node -e` rewrite of `name` + `@massa-ai/*` dependency keys + `repository.url` +
`publishConfig.registry`, then 5 publishes in dependency order. Runs after the npm jobs;
no `continue-on-error`.

- **Gate:** the rewrite snippet is exercised against the 5 real `package.json` files in a
  throwaway copy — asserts no `@massa-ai/` substring survives in `name` or dependency keys
  and that `repository.url` ends `.git`.
- **Files:** `.github/workflows/publish.yml`.

### T7 — Documentation

- `CHANGELOG.md` — entry under `[Unreleased]` (required by the CI merge gate).
- `README.md` — replace any manual-release instructions; document the two install scopes
  (`@massa-ai/*` from npmjs.org, `@luizgmassa/*` from GitHub Packages, with the `.npmrc`
  line consumers need).
- `CLAUDE.md` — the CI-gates section states `publish.yml` "fires on green `main`"; that is
  now `release.yml`. Correct it and describe the bump rules.
- `CONTRIBUTING.md` — state that the `[Unreleased]` headings a PR writes now decide the
  version bump, so the choice of `### Added` vs `### Fixed` is load-bearing.

`README.md` is tracked by `qwen-profile.json`, but its pin is **already stale on `main`**
(one of the 35 in `fool.md` F8). Re-pinning that one entry would not make the e2e suite
pass and would start dissolving F8 into an unrelated PR, so this task leaves the fixture
untouched: the repo is no more and no less drifted than before. F8 stays a single
reviewable follow-up.

That is not a contradiction of ARV-R13. ARV-R13 governs the **unattended release path**,
which must keep each tagged commit self-consistent with no human present. A human PR
editing `README.md` is covered by the existing documented remedy
(`bun run update-qwen-hashes`, run with review) — which is exactly what the F8 follow-up
will do for all 35 entries at once.

- **Gate:** `bun run test:scripts` (covers `validate-repository.test.ts`, which pins doc
  invariants); `grep -n 'fires on green' CLAUDE.md` returns nothing;
  `git diff --stat -- packages/core/src/__tests__/e2e/fixtures/qwen-profile.json` is empty.
- **Files:** `CHANGELOG.md`, `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`.

### T8 — Validation

Dispatch `massa-ai-verification-agent` (author ≠ verifier) per `references/spec-driven/validate.md`.
Writes `.specs/features/auto-release-versioning/validation.md`.

## Test coverage matrix

| AC | Test |
| --- | --- |
| ARV-R1 minor | `### Added` w/ content ⇒ `minor`; same for `Changed`, `Removed`, `Deprecated` |
| ARV-R1 patch | only `### Fixed` w/ content ⇒ `patch`; only `### Security` ⇒ `patch` |
| ARV-R1 precedence | `### Fixed` + `### Added` ⇒ `minor` |
| ARV-R1 duplicates | `### Fixed` ×3 + `### Added` + `### Removed` + `### Changed` (today's real shape) ⇒ `minor` |
| ARV-R1 empty heading | `### Added` with no content lines ⇒ ignored; `### Added` empty + `### Fixed` w/ content ⇒ `patch` |
| ARV-R1 unknown heading | `### Notes` w/ content ⇒ ignored ⇒ `null` |
| ARV-R2 | property check: for every `(version, bump)` pair, `major(next) === major(current)` |
| ARV-R3 | empty `[Unreleased]` ⇒ `bump === null`, `next === null`, and `deriveRelease` writes zero files |
| ARV-R4 version | `1.2.1` + minor ⇒ `1.3.0`; `1.2.1` + patch ⇒ `1.2.2`; `1.9.9` + minor ⇒ `1.10.0` |
| ARV-R4 sync | after a non-dry run all 5 workspace `package.json` versions equal `next` |
| ARV-R4 changelog | promoted file starts with an empty `## [Unreleased]`, then `## [X.Y.Z] - <date>` holding the old body verbatim; legacy `## [Wave N]` blocks unchanged |
| ARV-R4 boundary | content below the next `## [` heading is never absorbed into the release notes |
| ARV-R6 notes | `deriveRelease().notes` equals the promoted section body, excluding the heading |
| ARV-R6 fidelity (F6) | a body containing backticks, `$VAR`, `**bold**`, and blank lines survives verbatim |
| ARV-R13 repin | after a bump, the 5 bumped `package.json` entries' `sha256` match their new bytes |
| ARV-R13 isolation | **all other manifest entries are byte-identical** — a fixture with deliberately stale unrelated entries stays stale (proves F8 is not laundered) |
| ARV-R13 method | `repinFixtureHashes` output matches `hashlib.sha256` over raw bytes (parity with `qwen-fixture.ts:80` / `update-fixture-hashes.py:59`) |
| F5 date | `opts.today` is honored; default is UTC `YYYY-MM-DD` |
| — malformed | non-semver root version throws; missing `## [Unreleased]` throws a named error, not a silent `null` |

## Gate check commands

```bash
bun test scripts/__tests__/release-version.test.ts
bun run test:scripts
bun run type-check
bun scripts/release-version.ts --dry-run
grep -rn 'environment:' .github/workflows/            # expect: no output
grep -rn 'NPM_TAG\|--tag next' .github/workflows/     # expect: no output
```

## MCP / skill question

No MCP tool changes. This touches no `tool-defs`, no tools-api route, and no embedded
client mapping, so the three-place tool contract is not in play. `gh` CLI is used inside
Actions only.
