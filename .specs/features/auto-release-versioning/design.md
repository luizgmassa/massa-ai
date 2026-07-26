# Design — Auto Release Versioning

Covers ARV-R1..R12. Design is required: this changes a public compatibility surface
(published package identity, release triggers), performs irreversible actions (tag push,
release publish, registry publish), and introduces a new registry.

## Chain

```
human merges PR  ──▶  push: main  ──▶  CI (ci.yml)
                                          │ conclusion == success
                                          ▼
                              release.yml  (workflow_run: [CI], main)
                                          │
                    ┌─────────────────────┴──────────────────────┐
                    │ job: release                                │
                    │   bun scripts/release-version.ts            │
                    │     next==null ─▶ skip remaining steps ─▶ ⏹ │
                    │   notes.md written from result.notes        │
                    │   fetch --tags; fail if vX.Y.Z exists       │
                    │   commit, annotated tag, push --atomic      │
                    │   released=true  (only after push returns 0)│
                    │   gh release create vX.Y.Z --notes-file     │
                    └─────────────────────┬──────────────────────┘
                                          ▼
                    ┌────────────────────────────────────────────┐
                    │ job: publish   (if released)                │
                    │   uses: ./.github/workflows/publish.yml     │
                    │   with: ref=vX.Y.Z    secrets: inherit      │
                    └────────────────────────────────────────────┘
                                          │
        ┌─────────────────┬───────────────┴───────────────┐
        ▼                 ▼                               ▼
   build (artifact)  publish-npm ─▶ publish-apps    publish-github-packages
                     registry.npmjs.org             npm.pkg.github.com
                     @massa-ai/*  --tag latest      @luizgmassa/*
                                                    (fresh artifact download)
                                          │
                                   publish-docker (continue-on-error)
```

The bump commit is pushed with `GITHUB_TOKEN`, so it starts no CI run — that is ARV-R12,
and it is why `release.yml` can safely trigger off CI on `main`.

## Component 1 — `scripts/release-version.ts`

Follows the established `scripts/version-sync.ts` shape: pure exported functions plus an
`import.meta.main` CLI, unit-tested from `scripts/__tests__/`. Pure functions carry the
whole ARV-R1..R4 decision surface, so the workflow stays declarative and the logic is
testable without GitHub.

### Exported surface

```ts
export type Bump = "minor" | "patch" | null;

/** Slice CHANGELOG.md from `## [Unreleased]` to the next `## [` (exclusive). */
export function extractUnreleased(changelog: string): string;

/** Headings with >=1 non-blank content line, deduped, lowercased. */
export function unreleasedHeadings(section: string): string[];

/** minor-class wins over patch-class; no qualifying heading => null. */
export function decideBump(headings: string[]): Bump;

/** Never touches X. Throws on a non-semver `current`. */
export function nextVersion(current: string, bump: Exclude<Bump, null>): string;

/** Insert an empty [Unreleased] and promote the old body under [version] - date. */
export function promoteChangelog(changelog: string, version: string, isoDate: string): string;

/**
 * Re-pin qwen-profile.json sha256 for EXACTLY `changedPaths`. Every other manifest
 * entry must be byte-identical afterwards. Returns the repo-relative paths re-pinned.
 */
export function repinFixtureHashes(rootDir: string, changedPaths: string[]): string[];

/** Orchestrates the above against a repo root. `dryRun` suppresses all writes. */
export function deriveRelease(rootDir: string, opts?: { dryRun?: boolean; today?: string }): {
  current: string; next: string | null; bump: Bump; notes: string; repinned: string[];
};
```

### `repinFixtureHashes` — why selective, not `update-qwen-hashes` (ARV-R13)

`packages/core/src/__tests__/e2e/fixtures/qwen-profile.json` pins a `sha256` per tracked
file and `qwen-fixture.ts:148` throws on any mismatch. The bump rewrites 5 tracked
`package.json` files, so without this the e2e suite breaks on **every** release.

The documented remedy, `bun run update-qwen-hashes`, refreshes the *entire* manifest.
That is wrong here: **35 of 71 entries are already stale on `main`** (`fool.md` F8), so a
full refresh inside an unattended bot commit would silently re-pin 30 unrelated files —
laundering a pre-existing benchmark regression through a release commit.

`repinFixtureHashes` therefore updates only the entries whose `path` is in `changedPaths`,
computing `createHash("sha256").update(readFileSync(p))` — byte-identical to both
`qwen-fixture.ts:80` and `update-fixture-hashes.py:59`. Every release's fixture diff is
exactly 5 lines. It lives in the script, not in YAML, because `syncVersions` already
returns the precise list of files it rewrote.

### Classification table (ARV-R1, ARV-R4/D4)

| Heading | Class |
| --- | --- |
| `### Added`, `### Changed`, `### Removed`, `### Deprecated` | minor |
| `### Fixed`, `### Security` | patch |
| anything else | ignored |

Matching is case-insensitive on the heading text and tolerates trailing whitespace.
Duplicates collapse. A heading with no non-blank line before the next `### ` or `## `
does not count — this is what stops a stray empty `### Added` from forcing a minor bump.

### Boundary rules

- `extractUnreleased` anchors on `^## \[Unreleased\]` and stops at the next `^## \[`.
  Legacy `## [Wave N]` headings sit below `## [1.2.1]` and are therefore never read.
- `nextVersion("1.2.1","minor") === "1.3.0"`; `nextVersion("1.2.1","patch") === "1.2.2"`.
  A minor bump zeroes the patch component. `X` is copied verbatim (ARV-R2).
- `promoteChangelog` writes the date as UTC `YYYY-MM-DD`, matching the existing
  `## [1.2.1] - 2026-07-24` format.
- The CLI prints a single JSON object to stdout and all diagnostics to stderr, so the
  workflow can consume it with `bun scripts/release-version.ts --dry-run | jq`.

**Why a TS script and not inline bash:** the ARV-R1 classification rules are the only real
logic in this feature. Inline in YAML they would be untestable and unreviewable; the repo
already proves the pattern with `version-sync.ts` + `scripts/__tests__/version-sync.test.ts`.

## Component 2 — `.github/workflows/release.yml` (new)

```yaml
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]
  workflow_dispatch:

concurrency:
  group: release
  cancel-in-progress: false      # never abandon a half-pushed tag
```

`permissions: { contents: write }` at the `version` and `release` jobs.

**Guard:** `if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'`
— a `completed` `workflow_run` can be a failure, and a failed CI must not release. This
mirrors the guard `publish.yml` already carries today.

**Checkout:** `ref: main`, `fetch-depth: 0` — the job must commit *on top of* current
`main`, not on the historical `head_sha`, or the push is guaranteed to be rejected. The
concurrency group serializes runs; the push is `git push --atomic origin main vX.Y.Z` so
commit and tag land together or not at all. A rejected push fails the job loudly — the
next merge re-derives from the then-current `CHANGELOG.md`, which is correct behavior.

**Push ordering (F4).** GitHub Actions' default shell is `bash --noprofile --norc -eo pipefail`,
so a non-zero `git push` already fails the step, fails the job, and skips every dependent
`needs:` job — there is no silent half-release. Two cheap hardenings on top: a pre-push
`git fetch --tags origin` plus an explicit "tag `vX.Y.Z` already exists" check that fails
with a named error rather than an opaque git rejection, and `outputs.released=true` written
only on the line *after* the push returns 0.

**Release commit contents (ARV-R13).** Exactly: `package.json`, the 5 workspace
`package.json` files, `CHANGELOG.md`, and
`packages/core/src/__tests__/e2e/fixtures/qwen-profile.json`. The fixture is staged from
`repinFixtureHashes`, so the tagged tree and the manifest agree at every release.

**Identity:** `github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>`.

**Skip path (ARV-R3):** when `bump == null` the job sets `released=false` and returns
success. Downstream jobs are `if: needs.version.outputs.released == 'true'`, so they are
skipped, not failed.

**Release notes (ARV-R6):** the `notes` value is written to a file rather than passed
through a shell variable — changelog bodies here contain backticks, `$`, and newlines, and
would be mangled by interpolation. `gh release create "v$VERSION" --title "v$VERSION" --notes-file notes.md --verify-tag`
using `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.

**Two jobs, not three (implementation note).** Bump/tag and release-creation were
originally drawn as separate jobs. They are one `release` job because `notes.md` is
produced by the bump step and consumed by the release step: splitting them means either
threading a multi-line changelog body through `$GITHUB_OUTPUT` with a delimiter heredoc,
or an upload/download-artifact round trip, purely to move a file between two steps that
have no other reason to be apart. Failure attribution is unchanged — the step names carry
it — and the skip path is one `if` per step rather than one per job.

## Component 3 — `.github/workflows/publish.yml` (converted)

### Trigger change (ARV-R10)

| Before | After |
| --- | --- |
| `release: [published]` | removed |
| `push: tags: ['v*']` | removed |
| `workflow_run: [CI]` (auto-`next`) | removed |
| `workflow_dispatch` | kept, now with a **required** `ref` input |
| — | `workflow_call` with a **required** `ref` input |

**F3 — `ref` must be `required: true`.** `workflow_call` inputs default to *optional*.
Left optional, a manual dispatch with no `ref` falls through the surviving expression
`${{ github.event.workflow_run.head_sha || github.ref }}` to the tip of `main` and
publishes an untagged, unreleased commit as `latest`. That fallback expression is also
deleted — its `workflow_run` trigger no longer exists, so it is dead code preserving only
the footgun. Checkout becomes `ref: ${{ inputs.ref }}`.

Every removed trigger is either dead under D2 (GITHUB_TOKEN-created tags and releases
raise no events) or intentionally retired under D3. Keeping `push: tags` would create a
second, divergent publish path for a human-pushed tag; a manual release goes through
`release.yml`'s `workflow_dispatch` instead, so there is exactly one path.

`env.NPM_TAG` is deleted; the npm steps hardcode `--tag latest`.

### Deployment removal (ARV-R9)

`environment: DEPLOY` is deleted from `publish-packages`, `publish-apps`, and
`publish-docker`. Nothing else references the environment.

> **Risk:** if the `DEPLOY` environment carries protection rules or environment-scoped
> secrets, removing it removes that gate and may unbind `NPM_TOKEN`/`DOCKERHUB_*`. This is
> checked before the edit lands (task T6) and the secrets are moved to repository scope if
> they are environment-scoped.

### New job — `publish-github-packages` (ARV-R8)

A **separate job** downloading its own copy of the build artifact. It must not reuse the
npm jobs' checkout: it mutates `package.json`, and a mutated file must never reach
npmjs.org (ARV-R8 requires the two registries' artifacts to differ only as specified).

```yaml
needs: [build, publish-packages, publish-apps]   # F2 — must not race the npm jobs
permissions: { contents: read, packages: write }
```

**F2 — the `needs:` list is load-bearing.** With only `needs: build` this job runs in
parallel with the npm publishes. If npm publishes `shared` + `core` and then fails on
`tools-api`, GitHub Packages would still publish all 5 and the two registries diverge at
the same version number.

Steps:

1. `actions/setup-node` with `registry-url: https://npm.pkg.github.com` and
   `scope: '@luizgmassa'`.
2. Rewrite every publishable `package.json` via an inline `node -e` heredoc — the repo's
   established JSON-edit idiom (no `jq` in this repo):
   - `name`: `@massa-ai/x` → `@luizgmassa/x`
   - every key in `dependencies` / `devDependencies` / `peerDependencies` /
     `optionalDependencies` starting `@massa-ai/` → `@luizgmassa/`, values untouched
     (already resolved to `^X.Y.Z` by the `build` job)
   - `repository`: `{ type: "git", url: "https://github.com/luizgmassa/massa-ai.git" }`
     — GitHub Packages routes a package to a repository by this URL
   - `publishConfig.registry`: `https://npm.pkg.github.com`
3. Publish the 5 packages in dependency order (`shared` → `core` → the 3 apps) with
   `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.

The dependency-name rewrite is not cosmetic: without it `@luizgmassa/tools-api` would
declare a dependency on `@massa-ai/core`, which does not exist on npm.pkg.github.com, and
the install would fail for every consumer.

## Rejected alternatives

| Alternative | Rejected because |
| --- | --- |
| PAT (`RELEASE_TOKEN`) so `push: tags` → `release: published` fires literally | Violates ARV-R11; a PAT cannot be scoped narrowly, expires, and needs rotation. `workflow_call` achieves the same order with zero secrets. |
| Publish `@massa-ai/*` to GitHub Packages directly | `403 Permission not_found: owner not found` — the scope must resolve to a GitHub owner. |
| Create a `massa-ai` GitHub org and transfer the repo | Out of repo scope; breaks the SSH remote, README URLs, badges, and requires re-adding every secret. |
| Derive the bump from Conventional Commits | The CHANGELOG merge gate already forces a per-PR entry, so the changelog is the higher-signal and already-enforced input. Commit subjects on `main` are squash titles and not gated. |
| Inline the bump logic in YAML | Untestable; the classification rules are the whole feature. |
| One job doing bump + release + publish | Loses the skip path's clean job-level `if`, and re-couples the manually-dispatchable publish surface to the release surface. |

## Risk register

| Risk | Mitigation |
| --- | --- |
| Concurrent merges race on tag/push | `concurrency: release`, `--atomic` push, fail-loud on rejection |
| Recursive release loop | `GITHUB_TOKEN` push raises no event (documented); `[skip ci]` in the subject as a second layer |
| `DEPLOY` environment held the secrets | Verified before edit (T6); moved to repo scope if so |
| Mutated `package.json` leaks to npmjs.org | GitHub Packages runs in an isolated job with its own artifact download |
| GitHub Packages publish fails and blocks the npm release | Ordered after the npm jobs; `continue-on-error` is **not** applied — a silent half-release is worse than a loud failure. Re-runnable via `workflow_dispatch`. |
| First real run cuts an unexpected version | `--dry-run` is executed and its output recorded in `validation.md` before merge (expected: `1.2.1` → `1.3.0`, minor) |
