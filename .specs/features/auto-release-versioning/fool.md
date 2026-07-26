# Plan Challenge — Auto Release Versioning

- gate: **full** (spec-driven + public compatibility surface + irreversible actions + 6 files)
- mode: pre-mortem
- critic: `massa-ai-audit-specialist` (lens: requirements + architecture), read-only,
  independent context. `plan-critic` is not registered on this host — delegation reason
  recorded per `references/agent-orchestration.md` § Name Resolution.
- 12 findings returned; 7 accepted, 4 rejected, 1 superseded.

## Accepted — plan revised

### F1 — BLOCKER · ARV-R4 · the release commit invalidates the qwen fixture

`packages/core/src/__tests__/e2e/fixtures/qwen-profile.json` pins a `sha256` per tracked
file and `qwen-fixture.ts:148-151` **hard-throws** on any mismatch. `supportFiles` tracks
`README.md`, root `package.json`, `packages/core/package.json`,
`packages/shared/package.json`, `apps/tools-api/package.json`, and
`apps/mcp-client/package.json`.

The version bump rewrites **5 of those 6**. So the first automated release lands a commit
whose content contradicts the manifest, and the e2e suite fails from then until a human
runs `bun run update-qwen-hashes` — on **every release, forever**.

- evidence: `packages/core/src/__tests__/e2e/qwen-fixture.ts:148`
  (`if (actual !== entry.sha256) throw new Error(...)`); fixture `supportFiles[0,1,4,5,6,7]`
- failure: merge PR → release.yml bumps `1.2.1` → `1.3.0` → commit lands → next e2e run
  throws `qwen fixture hash mismatch for package.json` → 2 tests red on `main`
- **revision:** `scripts/release-version.ts` gains `repinFixtureHashes(rootDir, paths)`,
  which re-pins the `sha256` of **only** the entries it just rewrote and leaves every
  other entry byte-identical. release.yml stages `qwen-profile.json` into the same release
  commit. T7 uses the same function for its `README.md` edit.
- **rejected mechanism:** `bun run update-qwen-hashes` (the documented remedy) refreshes
  the *whole* manifest. Given F8 below, that would sweep 35 unreviewed entries into a bot
  commit — a silent benchmark-fixture rewrite. Selective re-pinning keeps every release's
  fixture diff to exactly 5 lines and reviewable.
- note: the critic guessed `CHANGELOG.md` was the tracked file. It is not — the real
  culprits are `README.md` and the 5 `package.json` files. Verified, not assumed.

### F8 — out of scope, escalated to the user · pre-existing fixture drift on `main`

Found while verifying F1's falsifier. **35 of 71** entries in `qwen-profile.json` already
mismatch their tracked file on a clean `main` — including all 6 files F1 is about, plus 24
`packages/core/src/**` sources and 4 needle targets.

```
total=71  ok=36  stale=35  missing=0
```

- evidence: sha256 of each `needleTargets`/`distractors`/`supportFiles` entry recomputed
  with the same method as `qwen-fixture.ts:80` and `update-fixture-hashes.py:59`
  (`hashlib.sha256` over raw bytes) against a clean worktree
- implication: the e2e suite reading this fixture cannot currently pass — it is presumably
  never reached in CI's default `bun run test` path, since core's `test` script omits
  `RUN_E2E=1`. So the drift has gone unobserved.
- **not fixed here.** Re-pinning 35 entries rewrites a retrieval-benchmark fixture, which
  needs its own review and its own `bench:needles:gate` evidence. Folding it into a release
  -automation PR would launder an unrelated regression.
- consequence for this feature: F1's selective re-pin is what keeps these two concerns
  separate. Reported to the user for a follow-up decision.

### F2 — HIGH · ARV-R8 · `publish-github-packages` ordering not pinned

`design.md` said "runs after the npm jobs" but `tasks.md` T6 did not pin the `needs:` list.
With only `needs: build` it races the npm jobs; if npm publishes `shared`+`core` then fails
on `tools-api`, GitHub Packages still publishes all 5 and the registries diverge.

- **revision:** T6 now requires `needs: [build, publish-packages, publish-apps]`.

### F3 — HIGH · ARV-R10 · `ref` input is optional, so a manual dispatch republishes `main`

`workflow_call` inputs default to optional. Combined with the surviving checkout
expression `${{ github.event.workflow_run.head_sha || github.ref }}`, a `workflow_dispatch`
of `publish.yml` with no `ref` silently falls back to the tip of `main` and publishes an
untagged, unreleased commit as `latest`.

- evidence: `.github/workflows/publish.yml:35`
- **revision:** T4 declares `inputs.ref: { required: true }` for **both** `workflow_call`
  and `workflow_dispatch`, and deletes the `workflow_run.head_sha` fallback — that trigger
  no longer exists, so the expression is dead code that only preserves the footgun.

### F4 — MED · ARV-R5 · `released` output ordering on a rejected push

The critic claimed a rejected `git push` continues silently. That is wrong — GitHub
Actions' default shell is `bash --noprofile --norc -eo pipefail`, so a non-zero `git push`
already fails the step, fails the job, and skips every `needs:` dependent. The underlying
concern is still worth closing cheaply.

- **revision:** T3 sets `outputs.released=true` only on the line *after* a successful
  push, and adds a pre-push `git fetch --tags origin` plus an explicit
  "tag `vX.Y.Z` already exists" check that fails with a named error instead of a bare
  git rejection.

### F5 — LOW · ARV-R4 · changelog date must be pinned to UTC

- **revision:** T1 fixes the date to `new Date().toISOString().slice(0, 10)` and takes it
  as an injectable parameter so T2 can assert it without freezing the clock.

### F6 — LOW · ARV-R6 · release-notes fidelity is claimed but untested

`design.md` correctly writes notes to a file rather than a shell variable, but nothing
asserted it. This repo's changelog bodies are dense with backticks, `$`, and `**`.

- **revision:** T2 adds a case asserting a body containing backticks, `$VAR`, and blank
  lines survives verbatim through `deriveRelease().notes`.

### F7 — LOW · ARV-R3 · the skip path is unit-tested but never exercised end-to-end

The first real run takes the *release* path. The `bump == null` path only runs when a
later docs-only PR merges.

- **revision:** recorded in `validation.md` as a deferred post-release observation, not a
  blocking gate. Unit coverage (T2) stands as the primary evidence.

## Rejected

| Critic finding | Rejected because |
| --- | --- |
| BLOCKER "CI never validates the release commit" | Self-refuted in its own text ("Do not fix. Mark as design intent"). This *is* ARV-R12 — the documented `GITHUB_TOKEN` recursion guard is what prevents the release loop. Trading it away means adopting a PAT, which ARV-R11 forbids. |
| MED "the workspace:* rewrite mutates the uploaded artifact" | Factually wrong. `publish.yml:52-62` rewrites **before** `upload-artifact` at line 64. The artifact is *supposed* to carry resolved `^X.Y.Z` — that is the whole point of the step. No mutation escapes, and nothing reaches npmjs.org unresolved. |
| MED "qwen fixture tracks CHANGELOG.md" | Wrong file. `CHANGELOG.md` is absent from the manifest. Superseded by F1, which identifies the actual tracked set. |
| BLOCKER "git push --atomic has no error handling" | Wrong mechanism — see F4. The default `-e` shell already fails the step. Kept only the ordering hardening. |

## Gate outcome

`serious_findings: revise_plan` → **plan revised**, not merely annotated. F1 adds a task
and a requirement clause; F2/F3 tighten two workflow contracts.

- **top assumption most likely to fail:** that a version bump is a safe, side-effect-free
  edit. It is not — 5 bumped `package.json` files are content-hash-pinned by an e2e
  fixture (F1).
- **deterministic check that would falsify success:**
  `bun run update-qwen-hashes && git diff --stat -- packages/core/src/__tests__/e2e/fixtures/qwen-profile.json`
  run immediately after a simulated bump. A non-empty diff proves the release commit must
  carry the refreshed manifest; an empty diff would disprove F1.
