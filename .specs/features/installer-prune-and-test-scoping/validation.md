# Installer Prune and Test-Scoping — Validation

Contract: `spec.md` · Design: `design.md` · Tasks: `tasks.md`.
Branch `fix/installer-prune-and-test-scoping`, 13 commits on `main@89909051`.

**Verdict: PASS.** Verified independently by an agent that built none of it. It
re-derived every figure, reproduced all five required mutations by hand, and
added two of its own. It read the diff at every site rather than trusting the
comments in it.

## Figures — measured at close-out, twice, by different parties

| Gate | Baseline (`main`) | After | Verifier's own measurement |
| --- | --- | --- | --- |
| `test:scripts` | 1810 / 0 | **1820 / 0** | 1820 / 0, `REAL_EXIT=0` |
| `test:plugins` | 135 / 0 | **141 / 0** | 141 / 0, `REAL_EXIT=0` |
| 4 prune suites | — | **182 / 0** (13+60+9+100) | 182 / 0 |
| scheduler `:5432` (shared) | **5 / 1** | **6 / 0** | 6 / 0, `rows:5` |
| scheduler `:5433` (dedicated) | 6 / 0 | 6 / 0 | 6 / 0 |
| `bun run test` | — | 12 / 12 tasks | 12 / 12 |
| `lint` · `type-check` | clean · 6/6 | clean · 6/6 | clean · 6/6 (re-run `--force`) |

Two measurement traps were hit and corrected rather than absorbed:

- **A cache replay is not a measurement.** `bun run test` reported `Cached: 3 of
  12`; the three were **build** tasks, and all six `test` tasks executed. The
  verifier independently caught a cached `type-check` on its first pass and
  re-ran with `--force`.
- **Measuring during the batch is not measuring.** A mid-run reading of
  `apps/codex-plugin/__tests__` gave 28 / 4 while three sibling workers were
  live. `generate:artifacts` prunes and rewrites **all four** hosts' bundles in
  one invocation, so any worker's generation corrupts every other worker's
  bundle-reading test. The quiet-tree rerun gave 32 / 0. Two workers diagnosed
  the same mechanism independently via `ps aux`. File-partitioning isolated the
  *sources*; it could not isolate the *generated bundles*, which are shared.

## The defect, as measured on an unmodified tree

Not a mutation — this is `main` at `89909051` with nothing changed:

```
138 |     expect(storeB.listAll().map((entry) => entry.id)).toEqual([cronId, intervalId]);
139 |     expect(storeB.listEnabled().map((entry) => entry.id)).toEqual([intervalId]);
                                                                ^
error: expect(received).toEqual(expected)
@@ -2,3 +2,7 @@
    "pg-scheduler-test-c20a6514-d84c-4b2a-aafb-6a7c8328983f",
+   "scheduled-memory-consolidation",
+   "scheduled-auto-improve",
+   "scheduled-observation-bridge",
+   "scheduled-decay-sweep",
+   "scheduled-checkpoint-purge",
  ]
 5 pass
 1 fail
```

The M35 seam patched `listAll` at `:137`; the assertion at `:139` calls
`listEnabled`, which it never patched. **The workaround reproduced in miniature
the defect it was written to paper over** — it enumerated one call site and
missed its sibling.

An earlier draft of `spec.md` claimed the suite "passes today by coincidence of
naming." That was wrong, and wrong in the reassuring direction. It is an active
failure on any developer machine whose `DATABASE_URL` holds enabled scheduled
jobs.

The dedicated test database reports **6 / 0 pre-fix** and therefore cannot
observe this defect at all — which is why AC-01.6 requires both databases and
why a green CI run never caught it.

## Mutations reproduced by the verifier

Each applied by hand, observed red, restored and confirmed byte-identical with
`diff -q`. No `git checkout` / `restore` / `stash` at any point.

| # | Mutation | Result |
| --- | --- | --- |
| 1 | Delete claude's agent prune loop | RED — retired specialist survives; installed count 19 vs expected 18 |
| 2 | Codex marker test → bare `rm -f massa-ai-*.toml` | RED — the unmarked user-owned `massa-ai-mine.toml` is deleted (4 assertions) |
| 3 | Revert `apply_platform`'s `owner != "plugin"` gate | RED — the plugin-owned `ghost-plugin` skill tree is deleted |
| 4 | Roster gate scan loop → per-line, `CLAUDE.md` → 17 | **falsely GREEN**, 125/0 — the blindness reproduced directly |
| 5 | Unscope the `listEnabled` assertion | RED on `:5432`, 5/1, the original defect byte-for-byte |
| +1 | Opencode `[[ -L ]]` symlink test → no-op | RED — the regular-file fixture is deleted |
| +2 | Revert one opencode prune to `$SCRIPT_DIR` | RED — T8's sweep names the exact file:line |

Mutation 4 is the one worth keeping. The verifier isolated the two halves and
confirmed that reverting **only the regex** does not reproduce the blindness:
JavaScript's `\s` already matches a newline, so the original pattern would have
matched across the break had it ever been shown one. The per-line `split` was
the structural cause. `tasks.md`'s original wording for this mutation was
ambiguous and would have led a verifier to conclude the gate was fine.

## What review changed before a line was written

Two critics, 14 findings, four material. Two were defects in the
**specification**, and both would have shipped as working-looking code:

1. **AC-04.4 cited `install-skills.sh:668-698`** for the ownership test to
   port. The gate that makes removal safe is at `:665` — `if [ "$owner" !=
   "plugin" ]`. Three lines too narrow, and a literal port would have made
   `--apply` delete plugin-owned skill trees. Mutation 3 is the sensor that
   now catches it.
2. **"Derive the skill list from the bundle"** installs **49** skills on cursor,
   whose bundle ships every workflow skill as its own directory. Review's
   proposed correction — exclude `agents/` — moves 49 to 49. Measurement
   settled it; the generator's own three-name constant is the authority.

The other two: prune-then-copy loses live specialists when a run is interrupted
(all six sites now copy-then-prune), and the spec's own risk section asserted
the work was "disjoint by file" when IPT-05 collided with IPT-02/03 on three of
four installers — which is why execution partitioned by file, not requirement.

## Findings that emerged during execution

- **T8's sweep was wrong on its first run, and that is what made it right.** It
  flagged nine legitimate loops, forcing a distinction absent from the design: a
  *refresh* (`rm` then copy the same member straight back) is not a *prune* and
  legitimately iterates the install list. Splitting them left 20 prune loops,
  all destination- or state-derived.
- **IPT-F6**, surfaced by that split: four `uninstall_bundled_skills` loops are
  prunes keyed on a hardcoded name list, so retiring a harness skill would leave
  it installed. Out of scope (uninstall paths), pinned by file so the class
  cannot grow unnoticed.
- **AC-03.3 was unsatisfiable as written.** Every installer runs a sentinel that
  exits 1 before the uninstall branch, so "bundle absent" is unreachable. The
  reachable equivalent — bundle missing exactly one installed member — is
  equally discriminating. Spec amended (AC-03.3b) rather than left aspirational.
- **A green suite went red on commit.** T5's fixture was named
  `massa-ai-handoff-writer` — the genuine specialist retired in `93c1ee1c`, and
  a forbidden removed-route token. `git grep` only reads tracked files, so the
  suite passed while untracked and failed the moment it was committed, exactly
  as that gate's own comment warns. Renamed rather than allowlisted.
- **Plan-vs-delivery mismatch, recorded not retitled:** `tasks.md` named T8's
  artifact `scripts/tests/test-installer-removal-derivation.sh`; the delivered
  file is `scripts/__tests__/installer-removal-derivation.test.ts`. It satisfies
  both AC-03.4 and AC-05.3a, and TypeScript was the right choice for a parser,
  but the plan says otherwise and the plan was not quietly edited to match.

## Coverage

| Requirement | Sensor | Status |
| --- | --- | --- |
| IPT-01 | `scheduler-store-pg.test.ts`, both databases; probe row at `:125` | verified |
| IPT-02 | 4 prune suites, 182/0; per-host ownership mutations 1, 2, +1 | verified |
| IPT-03 | `installer-removal-derivation.test.ts`; opencode bundle-missing-one fixture | verified |
| IPT-04 | `test-install-skills-stale-apply.sh` 25/0 + 5 existing suites 133/0; mutation 3 | verified |
| IPT-05 | behavioural guard per host under `test:plugins` (real `spawnSync`, not a static parse) + generator-constant cross-check | verified |
| IPT-06 | existing roster gate, widened; RED observed before the doc was fixed | verified |

## Open, recorded, not built

- **IPT-F1** — unify the four per-host ownership tests. Deliberately deferred: a
  unification error deletes user files on four hosts at once.
- **IPT-F4** — `listAll`/`listEnabled` have no secondary sort key and hydration
  has no `ORDER BY`. Safe here (distinct `nextRunAt`), a latent flake for a
  future order-sensitive test reusing the fixture default.
- **IPT-F6** — the four literal-keyed uninstall prunes, above.
- **IPT-F7** — copy-then-prune still leaves a stale member if interrupted
  mid-prune. Accepted: it equals the pre-fix status quo and clears on the next
  run. Making it atomic means a temp-and-rename rewrite of six loops on a public
  compatibility surface.
- Carried from Feature 3, unchanged: AC-03.3c, HPC-06, HPC-07.

## Merge sequencing

Branched from `main@89909051`. Shares **no source file** with PR #107 or
`feat/portal-handoff-proposal-crud`; may merge before or after either. The only
shared files are `CHANGELOG.md` (`[Unreleased]` is empty on `main`, so this
branch's entry lands clean) and the `.specs/project/` state files, resolved by
**merge, never rebase**.

`STATE.md` on `main` carries **two** `## Current` headings — the second, at
~`:3980`, is a long-finished `spec-multi-language` section below the archive
separator. It is already fixed on `feat/portal-handoff-proposal-crud` and is
deliberately **not** touched here, so that branch's fix does not conflict.
