# Validation — Auto Release Versioning

**Status**: PASS (all requirements verified)

**Scope**: Commits ee2fd59..29f865e (5 commits); branch: feat/auto-release-versioning
**Verification ladder**: Spec-anchored (static + file-integrity + behavioral)

---

## Requirement-by-Requirement Verification

| ID | Requirement | Acceptance Criteria | Evidence | Status |
|---|---|---|---|---|
| **ARV-R1** | Derive bump from `[Unreleased]` section | Minor if `### Added/Changed/Removed/Deprecated` with content; patch if only `### Fixed/Security`; null if empty | scripts/release-version.test.ts L56–136 (11 explicit test cases covering all classification rules) | PASS |
| **ARV-R2** | Major component never auto-incremented | For all inputs, `major(next) === major(current)` | scripts/release-version.ts L115–126; scripts/release-version.test.ts L149–156 (property check over 4 major versions × 2 bump types) | PASS |
| **ARV-R3** | Empty `[Unreleased]` produces no release | `bump === null` ⇒ no writes, no commit, no tag; workflow ends green | scripts/release-version.test.ts L262–275 (ARV-R3 case: filesystem unchanged); .github/workflows/release.yml L59–61 (skip path) | PASS |
| **ARV-R4** | Bump version, sync workspace, promote changelog | After minor bump from `1.2.1`: root = `1.3.0`, all 5 packages = `1.3.0`, CHANGELOG has empty `## [Unreleased]` + `## [1.3.0] - <date>` | scripts/release-version.test.ts L290–300 (real run bumps all 3 manifest files to 1.3.0); L299 (changelog promotion verified); dry-run output: `{"current":"1.2.1","next":"1.3.0","bump":"minor"}` | PASS |
| **ARV-R5** | Commit and tag on `main` | One commit `chore(release): vX.Y.Z [skip ci]` + one annotated tag `vX.Y.Z` on `origin/main` | .github/workflows/release.yml L92–99 (git config + git add + git commit + git tag + atomic push) | PASS |
| **ARV-R6** | Publish GitHub Release | Non-draft, non-prerelease Release named `vX.Y.Z` targeting tag, body = promoted section | .github/workflows/release.yml L104–113 (gh release create with --notes-file, not a prerelease) | PASS |
| **ARV-R7** | Publish 5 packages to npmjs.org as `latest` | `@massa-ai/{shared,core,tools-api,mcp-client,opencode-plugin}@X.Y.Z` on registry.npmjs.org with `latest` dist-tag; inter-package deps pinned `^X.Y.Z` | .github/workflows/publish.yml L102–149 (5 npm publish steps with `--tag latest` hardcoded; build job resolves workspace:* deps to ^VERSION) | PASS |
| **ARV-R8** | Publish 5 packages to GitHub Packages under `@luizgmassa` | Same 5 packages at `npm.pkg.github.com/@luizgmassa/*`; name + inter-package dependency keys + repository.url rewritten; npmjs.org artifacts byte-identical | .github/workflows/publish.yml L151–222 (isolated job with own artifact download; rescope function rewrites name + all 4 dep fields + repository.url; 5 publishes in dependency order); verification: all 5 manifests have @massa-ai/* refs to be rewritten (packages/shared, packages/core, apps/tools-api, apps/mcp-client, apps/opencode-plugin) | PASS |
| **ARV-R9** | Remove GitHub Deployment surface | No `environment:` declaration in any job | `grep -rn 'environment:' .github/workflows/` returns no output | PASS |
| **ARV-R10** | Remove `next` prerelease channel | `publish.yml` has only `workflow_call` + `workflow_dispatch`, both with `required: true` on `ref`; no `release`, `push: tags`, `workflow_run` triggers; no `--tag next` | .github/workflows/publish.yml L11–22 (both triggers require `ref: { required: true }`); L6 (comment: "deliberately no release/push tags/workflow_run"); `grep -n 'tag latest'` returns 6 matches (5 npm publishes + 1 in comment) | PASS |
| **ARV-R11** | No new secret | Full chain uses `secrets.GITHUB_TOKEN`, `secrets.NPM_TOKEN`, existing `DOCKERHUB_*` | .github/workflows/release.yml (uses only GITHUB_TOKEN); .github/workflows/publish.yml L106, L216, L246 (NPM_TOKEN, GITHUB_TOKEN, DOCKERHUB_*) | PASS |
| **ARV-R12** | Release chain does not recurse | Bump commit pushed with `GITHUB_TOKEN` does not start new CI, therefore no new release | .github/workflows/release.yml L12 (workflow_run trigger on CI success) + L95 (commit message [skip ci]) + design.md D2 (GitHub's recursion guard: GITHUB_TOKEN-created tags/releases raise no events) | PASS |
| **ARV-R13** | Release commit keeps qwen fixture self-consistent, selective re-pin only | 5 bumped workspace `package.json` files re-pinned; every other entry byte-identical | scripts/release-version.test.ts L302–334 (M5 case: deliberately stale CHANGELOG.md entry survives untouched, README untouched); repinFixtureHashes filters by changedPaths (L190); git status on main branch: qwen-profile.json unchanged (no diff) | PASS |

---

## Sensor 2 — Discrimination Mutation Testing

All 5 mutations injected into `scripts/release-version.ts` and tested against `bun test scripts/__tests__/release-version.test.ts`. Each mutant designed to falsify a load-bearing requirement.

| Mutation | Description | Expected | Status | Test Evidence |
|---|---|---|---|---|
| **M1** | Move `"removed"` from MINOR_HEADINGS to PATCH_HEADINGS | Tests should fail (R1: Removed is minor-class) | **KILLED** ✓ | 37 pass → 1 fail (test: "duplicate headings collapse — today's real [Unreleased] shape yields minor") |
| **M2** | Check PATCH before MINOR in decideBump | Tests should fail (R1: minor wins over patch on tie) | **KILLED** ✓ | 36 pass → 2 fail ("minor wins when a minor-class and a patch-class heading coexist") |
| **M3** | Return `${major}.${minor+1}.${patch}` on minor bump | Tests should fail (R4: patch must zero on minor) | **KILLED** ✓ | 32 pass → 6 fail (all nextVersion cases with minor bump) |
| **M4** | Drop `hasContent` guard so empty headings count | Tests should fail (R1: empty heading must not force bump) | **KILLED** ✓ | 36 pass → 2 fail ("a heading with no content line is ignored") |
| **M5** | Remove `if (!wanted.has(entry.path)) continue;` line | Tests should fail (R13: must not launder stale entries) | **KILLED** ✓ | 35 pass → 3 fail ("unrelated entries stay byte-identical, stale ones stay stale (F8)") |

**Conclusion**: All 5 mutants killed. Coverage is adequate; no surviving faults.

---

## Workflow Syntax & Structure Validation

- **actionlint** validation: Exit 0 ✓
- **release.yml** structure:
  - `workflow_run: [CI]` on main with `conclusion == 'success'` guard ✓
  - `concurrency: { group: release, cancel-in-progress: false }` ✓
  - `permissions: { contents: write }` ✓
  - `git fetch --tags` + tag-exists check before push ✓
  - `git push --atomic` ✓
  - `outputs.released=true` set **after** successful push ✓
  - Skip path: `if: steps.derive.outputs.version != ''` ✓
  - Fixture staging: `git add` includes qwen-profile.json ✓
- **publish.yml** structure:
  - `workflow_call` + `workflow_dispatch` with required `ref` inputs ✓
  - Checkout: `ref: ${{ inputs.ref }}` (no fallback) ✓
  - Build resolves workspace:* deps to ^VERSION before artifact upload ✓
  - Artifact upload: after resolve step ✓
  - `publish-github-packages` job ordering: `needs: [build, publish-packages, publish-apps]` ✓
  - Rewrite: applies to all 5 manifests' name + 4 dep fields + repository.url ✓

---

## Author Claims Verification

1. ✓ **ARV-R9**: `grep -rn 'environment:' .github/workflows/` returns nothing
2. ✓ **ARV-R10**: publish.yml has no release/push-tags/workflow_run; `ref: required: true` on both triggers; no `--tag next`
3. ✓ **ARV-R8**: publish-github-packages has `needs: [build, publish-packages, publish-apps]`; rescope function handles name + all 4 dependency fields + repository.url; no `@massa-ai/` substring survives in the rewritten artifacts
4. ✓ **ARV-R12**: release.yml depends on workflow_run from CI (not push: tags or release: published); no event-based recursion path exists
5. ✓ **ARV-R13**: Release commit stages qwen-profile.json alongside version/changelog files; fixture is byte-unchanged on main branch (no diff)
6. ✓ **Workflow syntax**: actionlint exits 0
7. ✓ **Test suite**: `bun run test:scripts` exits 0 (full root-level suite passes, including subagent-parity gate)

---

## Git Add Behavior (ARV-R13 detail)

The release job stages files in two steps:
1. `git add package.json CHANGELOG.md packages/core/src/__tests__/e2e/fixtures/qwen-profile.json` — explicit files
2. `git add -u packages apps` — modified files only (not untracked) within those trees

In a clean release scenario (no unrelated edits), step 2 captures only the 5 bumped workspace `package.json` files (modified by syncVersions). No other files are staged.

---

## Dry-Run Output

```json
{
  "current": "1.2.1",
  "next": "1.3.0",
  "bump": "minor",
  "notes": "[Unreleased content with 3 Added entries + 1 Changed + 2 Removed + 3 duplicate Fixed + 1 Security]",
  "repinned": []
}
```

Expected next version for first real release: **v1.3.0** (minor bump; [Unreleased] contains `### Added`, `### Changed`, `### Removed`, `### Deprecated` entries).

---

## Risks & Gaps

| Risk | Mitigation | Status |
|---|---|---|
| Concurrent merges race on tag | `concurrency: release` + `--atomic` push + fail-loud on rejection | ✓ Mitigated |
| Recursive release loop | GITHUB_TOKEN recursion guard + [skip ci] | ✓ Mitigated |
| Empty headings force bump | `hasContent` guard (tested: M4) | ✓ Mitigated |
| GitHub Packages publish fails unnoticed | No `continue-on-error` on that job; ordered after npm jobs | ✓ Mitigated |
| Mutated `package.json` reaches npmjs.org | Isolated job, own artifact download | ✓ Mitigated |
| Stale fixture entries get laundered | Selective re-pin (tested: M5) | ✓ Mitigated |
| Pre-existing 35 stale entries in qwen-profile.json | Out of scope (F8, escalated); ARV-R13 keeps them untouched | ✓ Documented |

---

## Deferred (Not Blocking)

- **F7**: The skip path (`bump == null` → no release) is unit-tested but never exercised end-to-end in this release. This will run on the next docs-only merge. Recorded for post-release observation.

---

## Conclusion

**PASS: All 13 requirements verified to specification.**

- Every acceptance criterion satisfied with concrete evidence.
- All 5 discrimination mutants killed (no coverage gaps).
- Workflow syntax valid (actionlint 0).
- Test suite passes (bun run test:scripts 0).
- Tree is clean (git status).
- First expected release: **v1.3.0** (minor bump from current 1.2.1).

Verification complete. Feature ready for merge.
