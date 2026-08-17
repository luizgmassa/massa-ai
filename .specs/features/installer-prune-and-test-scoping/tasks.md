# Installer Prune and Test-Scoping — Tasks

Contract: `spec.md`. Design: `design.md`.

**4 Phases = 9 Tasks.** Partitioned **by file**, per D8 — never by requirement.

## Phase 1 — implementation (7 Tasks, fully parallel)

Every Task below owns a disjoint write set. All seven may run concurrently.

| Task | Owns (write set) | Requirements | Gate |
| --- | --- | --- | --- |
| **T1** | `packages/core/src/__tests__/scheduler-store-pg.test.ts` | IPT-01 | both DBs, see below |
| **T2** | `apps/claude-plugin/install.sh`, `scripts/tests/test-installer-prune-claude.sh` (new), `apps/claude-plugin/__tests__/` | IPT-02 sites 1–2, IPT-03 site 6, IPT-05 | `bash scripts/tests/test-installer-prune-claude.sh`; `bun run test:plugins` |
| **T3** | `apps/codex-plugin/install.sh`, `scripts/tests/test-installer-prune-codex.sh` (new), `apps/codex-plugin/__tests__/` | IPT-02 site 3, IPT-05 | `bash scripts/tests/test-installer-prune-codex.sh`; `bun run test:plugins` |
| **T4** | `apps/opencode-plugin/install.sh`, `scripts/tests/test-installer-prune-opencode.sh` (new), `apps/opencode-plugin/__tests__/` | IPT-02 sites 4–5, IPT-03 site 7, IPT-05 | `bash scripts/tests/test-installer-prune-opencode.sh`; `bun run test:plugins` |
| **T5** | `apps/cursor-plugin/install.sh`, `apps/cursor-plugin/__tests__/` | IPT-05 only (AC-02.6: prune loop untouched) | `bun run test:plugins` |
| **T6** | `scripts/install-skills.sh`, `scripts/tests/test-install-skills-stale-apply.sh` (new) | IPT-04 | `bash scripts/tests/test-install-skills-stale-apply.sh` + the 5 existing `test-install-skills-*.sh` |
| **T7** | `scripts/__tests__/workflow-harness-contract.test.ts`, `CLAUDE.md` | IPT-06 | `bun test scripts/__tests__/workflow-harness-contract.test.ts` |

### Per-Task notes that are easy to get wrong

**T1** — the fix must cover `listAll` **and** `listEnabled` (AC-01.7); the suite
fails on the latter today. Probe row `enabled: false` (AC-01.4a). Gate is both
databases (AC-01.6); the dedicated one alone reports 6/0 pre-fix and cannot
observe the defect:

```bash
DATABASE_URL="postgresql://massa_ai:massa_ai_password@127.0.0.1:5433/massa_ai_test" \
  bun test packages/core/src/__tests__/scheduler-store-pg.test.ts
DATABASE_URL="postgresql://massa_ai:massa_ai_password@localhost:5432/massa_ai" \
  bun test packages/core/src/__tests__/scheduler-store-pg.test.ts
```

**T2/T3/T4** — copy-then-prune (D1), removal population from the destination and
keep-list from the bundle (D2), ownership test per D3. T3's fixture needs the
literal first line `# massa-ai-owned`; T4's agent fixture must be a real
symlink, and T4 must not delete a regular file (AC-02.3, AC-02.4a). AC-03.3a:
the bundle-absent test sets `MASSA_AI_SKIP_ARTIFACT_GENERATION=1`, or the
installer regenerates the bundle before the removal loop and the test is green
for the wrong reason.

**T5** — cursor's agent prune at `:625` is **not** touched (AC-02.6). T5 adds
`profile` to `install_bundled_skills` and its behavioural guard, nothing else.

**T6** — port `install-skills.sh:665-698`, the **gated** block. `:665` is the
`owner != "plugin"` guard; `apply_platform()` has no `owner` variable today, so
it is an addition. AC-04.4b's plugin-owned fixture is the case that catches
omitting it.

**T7** — mandatory ordering: amend the matcher, observe RED naming `CLAUDE.md`
and 17, capture it verbatim, **then** edit `CLAUDE.md`. Reuse the existing
`HISTORICAL` allowlist; do not touch `FEATURES.md`, whose "12 specialists" is
already exempted there.

## Phase 2 — cross-cutting sensors (1 Task)

| Task | Depends on | Owns | Requirements |
| --- | --- | --- | --- |
| **T8** | T2, T3, T4, T5 | `scripts/tests/test-installer-removal-derivation.sh` (new), `scripts/__tests__/` static cross-check | AC-03.4, AC-05.3a |

T8 cannot run earlier: AC-03.4 asserts **zero** source-derived removal loops
remain, which is false until T2 and T4 land. It must print the enumerated
population beside the verdict — a sweep that resolves to zero subjects reads
identically to a sweep that found no violations.

## Phase 3 — verification (1 Task)

| Task | Depends on | Scope |
| --- | --- | --- |
| **T9** | T1–T8 | Independent verification by an agent that built none of it |

Re-derive every figure; reproduce at least these mutations by hand, without
`git checkout`/`restore`/`stash`:

1. Delete the prune loop from one host → its AC-02.4 test must go red.
2. Replace one host's ownership test with a bare `rm -f massa-ai-*` → AC-02.5's
   user-owned fixture must go red.
3. Revert `apply_platform`'s `owner != "plugin"` gate → AC-04.4b must go red.
4. Revert the roster matcher widening → T7's RED must reappear.
5. Re-scope T1's assertions to `listAll` only → the shared-DB run must go red at
   `:139`.

## Phase 4 — close-out (1 Task)

| Task | Scope |
| --- | --- |
| **T10** | `validation.md`, `FEATURES.json`, `STATE.md`, `HANDOFF.md`, `CHANGELOG.md` |

`CHANGELOG.md` is written **once, here** — no Phase 1 Task appends to
`[Unreleased]`, or seven workers conflict on one file. Note in the entry that
opencode `--uninstall` changes behaviour (site 7): it removes installed agent
symlinks it previously left when the bundle was absent.

## Gate commands

```bash
# per-Task, above. Full gates before close-out:
XDG_CONFIG_HOME=$(mktemp -d) bun run test:scripts     # scratch config is mandatory
XDG_CONFIG_HOME=$(mktemp -d) bun run test:plugins     # a second runner test never reaches
bun run lint
bun run type-check
```

**Baselines measured on this branch at `89909051`, before any change:**

| Gate | Baseline |
| --- | --- |
| `test:scripts` | `REAL_EXIT=0`, 1810 pass / 0 fail |
| `test:plugins` | `REAL_EXIT=0`, 135 pass / 0 fail |
| `scheduler-store-pg` on `:5433` | 6 pass / 0 fail |
| `scheduler-store-pg` on `:5432` | **5 pass / 1 fail** — the defect |
| tree-sitter grammar contract | 9 pass / 0 fail |

Capture the gate's own exit code explicitly. A background wrapper reports its
own, and piping through `tail` reports the pipe's.

## Dependencies

```
T1 ─┐
T2 ─┤
T3 ─┤
T4 ─┼─→ T8 ─→ T9 ─→ T10
T5 ─┤
T6 ─┤
T7 ─┘
```

T1–T7 are mutually independent by construction (disjoint write sets, D8).
