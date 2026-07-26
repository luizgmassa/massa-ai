# Spec — Auto Release Versioning

- projectId: `massa-ai`
- workflowSessionId: `spec-auto-release-versioning`
- workflow: spec-driven (Large — Specify + Design + Tasks + Execute)
- slug: `auto-release-versioning`
- status: Specify complete

## Problem

Releases are manual and the version never advances automatically. The repo has
**zero git tags** at `1.2.1`, so no `vX.Y.Z` tag exists, no GitHub Release has ever been
cut, and `publish.yml` only ever fires the `next` prerelease path on green CI. There is
no path from "PR merged" to "released version".

Three secondary defects ride along:

1. `publish.yml` pins three jobs to `environment: DEPLOY`, which writes a GitHub
   **Deployment** record per publish. npm packages are *released*, not *deployed* — the
   Deployments tab is the wrong ledger for this artifact.
2. Packages publish to npmjs.org only; GitHub Packages is unused.
3. The `workflow_run` auto-`next` publish becomes redundant once every merge cuts a real
   version.

## Goal

A PR merged to `main` with a green CI run automatically derives the next version from
`CHANGELOG.md`, bumps it, tags it, publishes a GitHub Release, and pushes the packages to
both npmjs.org and GitHub Packages — with no human step and no new repository secret.

## Requirements

| ID | Requirement | Acceptance criteria |
| --- | --- | --- |
| **ARV-R1** | Derive the bump level from the `[Unreleased]` section of `CHANGELOG.md`. | Given an `[Unreleased]` section containing at least one non-empty `### Added`, `### Changed`, `### Removed`, or `### Deprecated` heading, the derived bump is `minor`. Given only non-empty `### Fixed` and/or `### Security`, the bump is `patch`. Given a minor-class and a patch-class heading together, `minor` wins. Given no heading with at least one content line, the bump is `null`. |
| **ARV-R2** | The major component is never auto-incremented. | For every input, the derived next version has the same `X` as the current version. No code path produces `X+1`. |
| **ARV-R3** | An empty `[Unreleased]` produces no release. | Bump `null` ⇒ no version write, no commit, no tag, no GitHub Release, no publish. The workflow run ends green. |
| **ARV-R4** | Bump root `package.json`, sync every workspace package, and promote the changelog section. | After a `minor` bump from `1.2.1`: root version is `1.3.0`; all 5 publishable `package.json` versions equal `1.3.0`; `CHANGELOG.md` contains a new empty `## [Unreleased]` at the top followed by `## [1.3.0] - <UTC date>` holding the previously-unreleased content verbatim. |
| **ARV-R5** | Commit and tag the release on `main`. | One commit `chore(release): vX.Y.Z [skip ci]` containing only version + changelog files, plus one annotated tag `vX.Y.Z` on that commit, both present on `origin/main`. |
| **ARV-R6** | Publish a GitHub Release for the tag. | A published (non-draft, non-prerelease) GitHub Release named `vX.Y.Z` exists, targeting tag `vX.Y.Z`, whose body is the promoted changelog section body. |
| **ARV-R7** | Publish all 5 packages to npmjs.org under the `latest` dist-tag. | `@massa-ai/{shared,core,tools-api,mcp-client,opencode-plugin}@X.Y.Z` resolve on registry.npmjs.org with `latest` pointing at `X.Y.Z`, and their inter-package deps pin `^X.Y.Z` (no `workspace:*`). |
| **ARV-R8** | Publish the same 5 packages to GitHub Packages under the `@luizgmassa` scope. | `@luizgmassa/{shared,core,tools-api,mcp-client,opencode-plugin}@X.Y.Z` resolve on npm.pkg.github.com. Their `name`, inter-package dependency names, and `repository.url` are rewritten for that registry only; the npmjs.org artifacts are byte-identical to ARV-R7 and still carry `@massa-ai/*`. |
| **ARV-R9** | Remove the GitHub Deployment surface. | No job in `.github/workflows/` declares `environment:`. A publish run creates zero Deployment records. |
| **ARV-R10** | Remove the `next` prerelease channel. | `publish.yml` no longer declares a `workflow_run`, `release`, or `push: tags` trigger, and no step passes `--tag next`. Its triggers are `workflow_call` and `workflow_dispatch` only. |
| **ARV-R11** | ~~The release chain must not depend on a new secret.~~ **AMENDED — see A1.** | Superseded. The chain now requires `RELEASE_SSH_KEY`. |
| **ARV-R12** | The release chain must not recurse. **Mechanism amended — see A1.** | Two independent runs of `release.yml` from one merge never both produce a tag. Originally satisfied by GitHub's `GITHUB_TOKEN` recursion guard; now satisfied by `[skip ci]` in the release commit subject, with the emptied `[Unreleased]` as a second layer. |
| **ARV-R13** | The release commit keeps the qwen e2e fixture self-consistent, without laundering unrelated drift. | `packages/core/src/__tests__/e2e/fixtures/qwen-profile.json` is staged into the release commit with the `sha256` of exactly the entries the bump rewrote (the 5 workspace `package.json` files) re-pinned. Every other entry in the manifest is byte-identical before and after. |

## Out of scope

- Major (`X`) bumps, automatic or otherwise — explicitly excluded by ARV-R2. Cutting a
  `2.0.0` stays a manual `package.json` edit.
- Changing the npmjs.org package names. `@massa-ai/*` is the public contract there.
- Moving the Docker images to ghcr.io. DockerHub publishing keeps its current behavior
  minus `environment: DEPLOY`.
- Creating a `massa-ai` GitHub organization or transferring the repository.
- Conventional-commit-based versioning. `CHANGELOG.md` is the single input, which the
  existing CI CHANGELOG merge gate already forces every PR to maintain.
- Backfilling tags or releases for `1.2.0` / `1.2.1` / the legacy `Wave N` entries.
- **Repairing the 35 pre-existing stale entries in `qwen-profile.json`** (see `fool.md` F8).
  That drift exists on `main` today, predates this work, and spans 24 `packages/core/src/**`
  sources plus 4 needle targets. Re-pinning it rewrites a retrieval benchmark and needs its
  own `bench:needles:gate` evidence. ARV-R13 is deliberately scoped to touch only the
  entries this feature itself dirties.

## Decisions closed with the user

| ID | Decision | Rationale |
| --- | --- | --- |
| **D1** | GitHub Packages publishes under `@luizgmassa/*`, rewritten at publish time. | GitHub Packages resolves an npm scope to a GitHub owner; `@massa-ai` is not an owner (the repo is `luizgmassa/massa-ai`), so `@massa-ai/core` would fail with `403 Permission not_found: owner not found`. Rewriting at publish time avoids creating an org and transferring the repo, and leaves the npmjs.org names untouched. |
| **D2** | One `release.yml` runs bump → tag → release, then calls `publish.yml` as a reusable workflow. | A tag pushed or a release created with `GITHUB_TOKEN` does **not** start another workflow — GitHub's documented recursion guard. The user's literal `tag → release → publish` event chain would break at every arrow. `workflow_call` sequences the same steps without a PAT (ARV-R11), and the same guard gives ARV-R12 for free. |
| **D3** | The `next` prerelease channel is removed. | Every merge now cuts a real `vX.Y.Z` on `latest`; keeping `next` would double the publish volume per merge with the same version. |
| **D4** | `Added`/`Changed`/`Removed`/`Deprecated` ⇒ minor; `Fixed`/`Security` ⇒ patch; empty ⇒ no release. | Matches the user's rule (features/improvements/refactors bump `Y`, bugs bump `Z`). `Removed`/`Deprecated` are contract changes, so minor — never major, per ARV-R2. An empty `[Unreleased]` means a docs/chore-only merge (the `no-changelog` label path), which should not cut an empty version. |

## Gray areas resolved during Specify

- **Duplicate headings.** The current `[Unreleased]` holds `### Fixed` three times plus
  `### Added`, `### Removed`, `### Changed`. The parser must accept repeated headings and
  classify on the union of them. With today's content the derived bump is `minor` and the
  first automated release is **`v1.3.0`**.
- **Empty-but-present headings.** A `### Added` with no content lines beneath it must not
  force a minor bump; a heading only counts when it holds at least one non-blank line.
- **Legacy `## [Wave N]` headings.** Pre-semver entries below `## [1.2.1]`. The parser
  only reads from `## [Unreleased]` to the next `## [`, so they are inert.
- **A version bump is not side-effect-free.** `qwen-profile.json` content-hash-pins the 5
  workspace `package.json` files, and `qwen-fixture.ts:148` hard-throws on a mismatch, so
  the bump alone would break the e2e suite on every release. Closed by ARV-R13.
- **Concurrent merges.** Two merges landing close together must not race on the tag. The
  release workflow is serialized by a `concurrency` group and its push is atomic; a losing
  run fails loudly rather than force-pushing, and the next merge picks the work up.

## Amendments

### A1 — deploy-key push (post-merge, 2026-07-26)

Discovered by the first real release run, which failed at "Commit, tag and push":

```
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: - Changes must be made through a pull request.
remote: - 5 of 5 required status checks are expected.
```

A branch ruleset was added to `main` between spec approval and merge. `release.yml` pushes
the bump commit directly to `main`, which the ruleset forbids. **ARV-R5 was never
achievable as specified under that ruleset** — the spec assumed an unprotected `main`.

`--atomic` rejected the tag with the commit, so the failure was clean: no tag, no Release,
npm still `1.2.1`, `publish` skipped. ARV-R5's atomicity clause held; only the pushing
identity was wrong.

**Resolution.** The ruleset's bypass list is the only route, and GitHub Actions cannot be a
bypass actor on a user-owned repository (API: `must be part of the ruleset source or owner
organization`; also absent from the UI bypass list — verified by the user). The push now
uses a write-enabled deploy key, the narrowest identity that can be a bypass actor:
repo-scoped, git-only, no API access, no expiry.

**ARV-R11 is withdrawn.** The chain now requires one new secret, `RELEASE_SSH_KEY`. The
options that preserved R11 were all dead ends: GitHub Actions bypass is unavailable here; a
bot-opened PR gets no CI checks (`GITHUB_TOKEN`-created PRs raise no events) so its 5
required checks never report; and a tag-only release cannot promote the changelog or bump
`package.json` on `main`. Rejected alternatives with wider blast radius: a PAT (expires,
needs rotation, broader scope) and repository-admin bypass (applies to every admin).

**ARV-R12's mechanism changed.** A deploy-key push *does* raise events, unlike
`GITHUB_TOKEN`. Loop safety now rests on `[skip ci]` in the release commit subject, backed
by a second run finding an emptied `[Unreleased]` and deriving no bump. The requirement
still holds; the reason it holds is different, and the workflow comments were corrected so
they do not credit a guard that no longer applies.

**New operational prerequisite:** `Deploy keys` must be in the ruleset's bypass list.
Without it the release fails at the same step. This is repo configuration, not code, so no
test can assert it — it is recorded in `CLAUDE.md` and `.specs/project/STATE.md`.

## Verification recipe

```bash
bun test scripts/__tests__/release-version.test.ts   # ARV-R1..R4 unit surface
bun run test:scripts                                 # full root-level suite incl. above
bun scripts/release-version.ts --dry-run             # prints derived {current,next,bump}
actionlint .github/workflows/*.yml                   # workflow syntax (if available)
grep -rn 'environment:' .github/workflows/           # ARV-R9 — must return nothing
```
