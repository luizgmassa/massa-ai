# Validation — claude-marketplace-cache-refresh (CMR)

**Verdict: PASS**

Commit range: `main..HEAD` (6c438a98..7e29edfe, 9 commits), branch
`spec/installer-restart-embedding`, worktree
`/Users/luizmassa/Projects/massa-ai-wt-installer-restart-embedding`. Verifier is
independent of the author (author != verifier gate).

## Per-AC evidence

| AC | Requirement | Sensor | Result |
|----|---|---|---|
| AC-1 | served older than bundle → one update, records post-update served | `scripts/tests/test-plugin-marketplace-cache-refresh.sh` Scenario 1 | PASS — `bash scripts/tests/test-plugin-marketplace-cache-refresh.sh` re-run direct: 24/24 assertions, incl. this scenario's 5 |
| AC-2 | served == bundle → zero updates | Scenario 2 | PASS |
| AC-3 | served > bundle → zero updates, no downgrade, truthful record | Scenario 3 | PASS |
| AC-4 | update fails / unsupported → warn, exit 0, stale served recorded | Scenario 4 + 4b | PASS (both sub-scenarios) |
| AC-5 | registry unreadable → warn, exit 0, no version claim | Scenario 5 | PASS |
| AC-6 | existing installer shell suites pass unmodified (I3) | `test-plugin-auto-install.sh` (201/0), `test-install-agents-claude-hooks.sh` (15/0), `test-model-profile-installer-reapply.sh` (32/0), all re-run with `XDG_CONFIG_HOME` scratched | PASS — the specific "harness --uninstall → exit 0" case named in the brief as pre-existing-red-then-fixed is green in this run (`apps/opencode-plugin/dist/{index,config-cli}.js` present, confirming `bun run build` provisioned it) |
| AC-7 | CHANGELOG `### Fixed` bullet under `[Unreleased]` | `git diff main..HEAD -- CHANGELOG.md` | PASS — one `### Fixed` bullet titled "Marketplace-route Claude installs now pick up new bundle versions." (shares the entry with EDC's bullet, both under one `### Fixed` heading, both present) |

Full re-run of the CMR mock-CLI suite (all 5 scenarios, direct invocation, not
inherited from author):

```
plugin marketplace cache refresh: 24 passed, 0 failed (24 total)
```

## Invariants

- I1 (no hard-fail on registry/update failure): AC-4/AC-4b/AC-5 all exit 0 with
  a stderr warning — confirmed.
- I2 (recorded version == served at record time): AC-1/AC-3/AC-4 recorded
  values checked field-by-field against the mock registry state — confirmed.
- I3 (file-route byte-identical): the three named suites re-run green,
  unmodified per `git diff main..HEAD` (no changes to those three files).
- I4 (never downgrade): AC-3 — served (99.0.0) > bundle → zero update calls,
  confirmed by log line count.

## Discrimination sensor (mutation)

**Mutation: invert the served-vs-bundle compare** in
`apps/claude-plugin/install.sh` (`refresh_marketplace_cache`), changing the
trigger condition from `== "-1"` (served < bundle) to `== "1"` (served >
bundle) — the classic invariant-inversion mutant, turning the "never
downgrade" guard into the exact opposite (update fires only when it would be a
downgrade).

- Original byte content saved to a temp file before mutation; restored by
  writing those saved bytes back (no `git checkout` used — everything on this
  branch is committed and the mutation harness must not risk it).
- **Population: 24 assertions.** Verdict before mutation: 24/24 pass. Verdict
  under mutation: **16/24 pass, 8/24 fail** — killed. Failing assertions
  span AC-1 (no update fires when it should), AC-3 (update *does* fire,
  violating never-downgrade), and AC-4/AC-4b (stderr warning text absent
  because the failure path is never reached).
- Restore verified: `md5` of `install.sh` after restore == `md5` before
  mutation (`add3cf02693e5b829cf859505a3b4bb8`); re-run confirms 24/24 pass
  and `git status --porcelain` is clean.

## Residual risks / advisories

- **R1 (real-CLI cache-refresh behavior) is an author claim not
  independently re-verified against the real `claude` CLI in this session.**
  The mock CLI in `test-plugin-marketplace-cache-refresh.sh` encodes the
  behavior the spec's R1 revision describes (plugin update re-materializes a
  directory-source marketplace's version-pinned cache) as ground truth; a real
  `claude` binary is present on this machine (`/opt/homebrew/bin/claude`,
  2.1.220) but exercising it against a scratch `HOME`/`CLAUDE_CONFIG_DIR` was
  not attempted this pass — doing so touches real marketplace-cache
  materialization semantics outside the mock, and the existing mock-based
  AC-1..5 sensors already give full coverage of the installer's own logic.
  Flagged as a residual risk, not a gap: the installer's behavior is fully
  spec-anchored and mutation-tested against the mock; only the mock's fidelity
  to the real CLI is unverified in this pass.
- **R2 (post-merge skip-current gate)** is an accepted risk per the spec (a
  machine whose `install-state.json` record already says "bundle version" but
  serves older self-heals only on the *next* bundle version bump). No code
  change was expected here; confirmed no state-repair code was added, matching
  the spec's stated scope.

## Command evidence (raw exit codes captured directly, no pipe-swallowed codes)

```
$ bash scripts/tests/test-plugin-marketplace-cache-refresh.sh; echo EXIT:$?
... plugin marketplace cache refresh: 24 passed, 0 failed (24 total)
EXIT:0

$ XDG_CONFIG_HOME=<scratch> bash scripts/tests/test-plugin-auto-install.sh; echo EXIT:$?
... plugin-auto-install: 201 passed, 0 failed (201 total)
EXIT:0

$ XDG_CONFIG_HOME=<scratch> bash scripts/tests/test-install-agents-claude-hooks.sh; echo EXIT:$?
... install-agents claude-code hooks coexistence: 15 passed, 0 failed (15 total)
EXIT:0

$ XDG_CONFIG_HOME=<scratch> bash scripts/tests/test-model-profile-installer-reapply.sh; echo EXIT:$?
... model-profile-installer-reapply: 32 passed, 0 failed (32 total)
EXIT:0
```
