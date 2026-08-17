# Installer Prune and Test-Scoping — Design

Contract: `spec.md`. Tasks: `tasks.md`.

## D1 — Copy-then-prune, not prune-then-copy

The only in-repo precedent (`cursor/install.sh:625`) prunes first. This design
inverts that order everywhere it adds the behaviour.

Both orders reach the same end state. They differ only when the run does not
finish, and the difference is one-directional: prune-then-copy's failure mode is
*losing live specialists*, copy-then-prune's is *keeping a dead one one run
longer*. The second is the pre-fix status quo, so copy-then-prune is
monotonically non-worse than shipping nothing, which prune-then-copy is not.

`set -euo pipefail` is in force in all four installers, so any mid-loop `cp`
failure aborts the script outright.

```bash
# copy the current set first — an interrupted run leaves the user no worse off
for src in "$SRC/"massa-ai-*.md; do
  [[ -f "$src" ]] || continue
  cp "$src" "$DEST/$(basename "$src")"
done

# then shed owned members the bundle no longer ships
for f in "$DEST/"massa-ai-*.md; do
  [[ -f "$f" ]] || continue
  [[ -f "$SRC/$(basename "$f")" ]] && continue   # keep-list: still shipped
  is_owned "$f" || continue                      # per-host, see D3
  rm -f "$f"
done
```

## D2 — One rule for all seven sites

> **The removal population is the destination directory. The bundle supplies
> only a keep-predicate.**

Every defect in this feature is a violation of one half of that sentence:

| Site class | Violation |
| --- | --- |
| 1–5 (install) | no removal at all — the population was empty |
| 6–7 (removal) | population taken from the **bundle**, so anything not in the bundle is unreachable, and an absent bundle makes the population empty |

Stating it as one rule is what stops the fix for sites 6–7 from reintroducing
the bug while fixing it: the natural way to write "remove what the bundle no
longer has" is to loop over the bundle, which is exactly wrong. Loop over the
destination; consult the bundle only to decide whether to keep.

For sites 6 and 7 the keep-list is empty (uninstall and route-switch remove
everything owned), which is the same rule with a degenerate predicate — not a
special case.

## D3 — Per-host ownership tests, adopted verbatim

Not interchangeable. Each is taken from that host's own uninstall path, which is
the only place the project has already committed to an answer. Both plan critics
verified this table against source independently.

| Site | Ownership test | Adopted from |
| --- | --- | --- |
| claude agents | `massa-ai-` name prefix | `claude/install.sh:775-777` |
| claude commands | `massa-ai-` name prefix | `claude/install.sh:765` |
| codex agents | first line is exactly `# massa-ai-owned` | `codex/install.sh:578-585` |
| opencode agents | entry is a symlink (`[[ -L ]]`) | `opencode/install.sh:602-609` |
| opencode commands | `massa-ai-` name prefix | `opencode/install.sh:445-456` |

Two are **not** a bare name prefix, and a uniform `rm -f massa-ai-*` would be a
data-loss bug at both:

- **codex** shares `~/.codex/agents/` with user-authored agents; the marker, not
  the name, is ownership. An unmarked `massa-ai-mine.toml` is the user's.
- **opencode** installs symlinks and its own copy loop at `:604` *refuses to
  clobber a regular file*. A prune that deleted a regular file would contradict
  a protection in the same loop.

`is_owned` is therefore per-site, not shared. Unifying these is IPT-F1 and is
explicitly out of scope: a unification error deletes user files on four hosts at
once.

## D4 — IPT-01: an allowlist helper, and deleting the seam

Replace the monkey-patch with a positive filter applied at each assertion:

```ts
const TEST_PREFIX  = "pg-scheduler-test-";
const PROBE_PREFIX = "pg-scheduler-probe-";   // AC-01.4, named not literal

/** Ids this suite created. Everything else in a shared table is not ours. */
const own = (entries: ScheduledJob[]) =>
  entries.filter((e) => e.id.startsWith(TEST_PREFIX)).map((e) => e.id);
```

Applied to **both** accessors, which is the whole point — the seam guarded
`listAll` and the suite fails on `listEnabled`:

```ts
expect(own(storeB.listAll())).toEqual([cronId, intervalId]);
expect(own(storeB.listEnabled())).toEqual([intervalId]);
```

Deleted: `installScheduledFilterSeam`, `restoreSeam`, `seamStore`,
`seamOriginalListAll`, the `afterEach` restore call, and the seam-restoration
test at `:147`. That test's one durable assertion — cleanup leaves no
test-prefixed row — survives as a plain assertion.

`cleanup()` extends to both prefixes. It already runs in `beforeAll` as well as
`afterEach`, so a crash between the probe's insert and delete self-heals on the
next run of this file; that dual role is what bounds the leak.

Order stability is not accidental and was verified: `listAll` sorts by
`nextRunAt` (`scheduler-store-pg.ts:253`), `cronId` carries 1500 and `intervalId`
2000, so the keys are distinct and filtering a stably-sorted array cannot
reorder the two survivors regardless of what else is present. The absent
secondary sort key is recorded as IPT-F4.

## D5 — IPT-04: the gate before the loop

`apply_platform()` gains the stale-removal loop **and** the platform-owner gate
that precedes it in `uninstall_platform()`:

```bash
if [ "$owner" != "plugin" ]; then
  # ... stale removal, honouring DRY_RUN with record "would-change"
fi
```

Porting the loop without the gate is the specification-level data-loss bug
described in AC-04.4: `--apply` would delete a plugin tarball's skill
directories. `apply_platform()` currently computes no `owner` variable at all,
so the gate is an addition, not a move.

## D6 — IPT-05: three names, from the generator

The list is **not** derived by scanning the bundle. Measured, that rule installs
49 skills on cursor, whose bundle ships every workflow skill as its own
directory while codex ships the same content as 46 loose files.

`install_bundled_skills` installs *harness* skills. The authoritative set is the
generator's own constant — `generate-skill-artifacts.ts:138` and
`managedRootsFor():216-220`, both naming `massa-ai`, `persona-router`,
`profile`. `install-skills.sh` reaches the same three independently by
discovering `skills/*/SKILL.md` **in the repo**, which is why the repo route
already ships `profile` and the tarball route does not.

Two guards, deliberately of different kinds:

- **behavioural** (AC-05.3) — run each `install.sh` against a scratch `HOME`,
  assert the three directories land. Lives in `apps/<host>-plugin/__tests__/`,
  runs under `bun run test:plugins`, the runner that executes the bash.
- **static** (AC-05.3a) — assert each installer's literal list equals the
  generator's constant, so a future fourth harness skill fails in four places
  rather than shipping on one route.

The static one alone would be the "read the list rather than run it" shortcut
the spec rejects elsewhere; the behavioural one alone would not notice a fourth
skill nobody wired up.

## D7 — IPT-06: widen the existing gate, do not add one

`workflow-harness-contract.test.ts:399` already asserts exactly the required
property, with a `HISTORICAL` allowlist, a `git ls-files` population, and a
guard against vacuous passes. It is green today with the defect present because
its scan is line-oriented (`:471`) and `CLAUDE.md` splits the claim across a
newline.

A new sweep would have been a second gate blind in the same way. The change is
to `COUNT_CLAIM`/the scan so number and noun may be separated by one newline,
bounded to a single intervening newline rather than made unbounded.

Sequencing is a hard constraint: **amend the gate, observe it fail naming
`CLAUDE.md`, then fix `CLAUDE.md`.** Fixing the doc first makes the RED
unobtainable without a revert, and a gate first observed green is not evidence
it can see anything.

## D8 — Partition by file, not by requirement

IPT-02, IPT-03 and IPT-05 all edit three of the four `install.sh` files.
Partitioning workers by requirement would put two writers on each. Partitioning
by file gives one owner per script, each landing every requirement that touches
it. `tasks.md` encodes this and must not be re-cut by requirement.

New shell suites need no registration — `test:scripts` globs
`scripts/tests/*.sh` and `test:plugins` globs the four `__tests__` directories —
so per-worker test files are collision-free. Each worker writes its own suite
file rather than extending a shared one.

## D9 — What the Plan Challenge Gate changed

Two critics ran on different lenses (red-team on the destructive prune,
pre-mortem on everything else) and returned 14 findings. One escalated to full.
Four changed the design materially rather than annotating it:

1. **Copy-then-prune (D1).** The plan was prune-then-copy, copying the one
   in-repo precedent. The interruption window makes an aborted upgrade *lose*
   specialists. Would have replicated a latent bug at four more sites.
2. **The IPT-04 owner gate (D5).** The spec cited `install-skills.sh:668-698`
   for the ownership test. The gate that makes removal safe is at `:665`, one
   line earlier. A literal port of the cited range would have made `--apply`
   delete plugin-owned skill trees — a data-loss bug introduced by a citation
   being three lines too narrow.
3. **The IPT-05 derivation rule (D6).** "Derive the skill list from the bundle"
   was wrong, and review's proposed correction ("exclude `agents/`") was wrong
   in the same direction. Measurement settled it: 49 skills on cursor either
   way. The generator's constant is the authority.
4. **The file-collision partition (D8).** The spec's risk section asserted the
   sites were "disjoint by file, which is what makes parallel execution safe".
   True of IPT-02's sites among themselves, false for the feature, and the
   sentence invited the wrong partition.

Findings 2 and 3 are worth separating from the rest: both were **defects in the
specification** rather than risks in the plan, and both would have shipped as
working-looking code. Neither was reachable by reading the spec — each needed
the source read back.

Independently, the critics verified and I re-verified: the D3 ownership table
byte-for-byte, all nine site line-citations, claude's marketplace and file
routes being mutually exclusive (so `remove_file_route_artifacts` can never run
after the file-route copy), `install_variant_tree` running at most once per
invocation, and the assertion-order stability in D4.

## Risks

| Risk | Mitigation |
| --- | --- |
| A wrong ownership test deletes user files | D3 adopts each host's own committed answer; AC-02.5 plants a user-owned member per non-prefix host and asserts it survives |
| Copy-then-prune still leaves a stale member if interrupted mid-prune | Accepted — equals the pre-fix status quo, cleared by the next run |
| Widening the roster matcher floods the gate with false positives | AC-06.5 diffs the offender list before and after; only `CLAUDE.md` may change |
| A test row on the shared database is dispatchable by a live scheduler | AC-01.4a forces `enabled: false`; scheduler defaults off; hydration is once-per-instance |
| Five installers edited in parallel | D8 partitions by file; each worker owns one script and its own new test suite |
