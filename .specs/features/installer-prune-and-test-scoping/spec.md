# Installer Prune and Test-Scoping — Specification

Feature id: `installer-prune-and-test-scoping`
Branch: `fix/installer-prune-and-test-scoping`, branched from `main` at `89909051`.
Requirement family: **IPT** (Installer Prune and Test-scoping).

Independent of PR #107 (`fix/sse-heartbeat-idle-timeout`) and of
`feat/portal-handoff-proposal-crud`. Touches no file either of those touches.
See "Merge sequencing" for the one shared file.

## Problem

Two defects were briefed as a pair. Both are the same underlying mistake —
**an operation that never established which members it owns** — and measurement
found each to be wider than its brief.

### Defect A — a test that asserts over rows it did not create

`packages/core/src/__tests__/scheduler-store-pg.test.ts` asserts an exact
`listAll()` result against a **shared** database. To survive that, it installs a
seam (the `M35` block at `:12-35`, applied at `:137`) that monkey-patches
`listAll` on one store instance to filter out ids beginning `scheduled-`, plus a
second test at `:147` whose entire purpose is to prove the seam restores.

That is a **denylist**, and it is coupled to a naming convention it does not
own. `Scheduler.registerJob` (`scheduler.ts:178`) accepts an arbitrary `id`; only
the five boot defaults in `scheduler-defaults.ts:66-102` happen to use the
`scheduled-` prefix.

**The seam does not even work, and the suite is red today.** The seam patches
`listAll` at `:137`. The assertion on the **next line**, `:139`, calls
`listEnabled()` — a sibling method the seam never patched. Measured against the
shared developer database at `:5432` on 2026-08-17, on `main` at `89909051`,
with no modification of any kind:

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
- Expected  - 0
+ Received  + 5
  at .../scheduler-store-pg.test.ts:139:59

 5 pass
 1 fail
```

So the workaround reproduces, in miniature, the very defect it was written to
paper over: it enumerated one call site and missed its sibling. An earlier draft
of this spec claimed the suite "passes today by coincidence of naming." That was
wrong, and it was wrong in the safer-sounding direction — this is an active
failure on any developer machine whose `DATABASE_URL` points at a database
holding enabled scheduled jobs, not a latent one.

Two consequences for scope. The fix must cover **every** set-valued accessor the
suite asserts on, not just `listAll`. And the suite is provably safe to run
against the shared database: every write in `scheduler-store-pg.ts` is
single-id — one upsert at `:206`, one delete at `:268`, both parameterized by a
lone `id` — with no bulk path. Verified empirically: the shared database held
exactly the same five rows before and after the run above.

The five rows, measured on 2026-08-17:

```
id                              job_kind               enabled
scheduled-auto-improve          auto-improve           1
scheduled-checkpoint-purge      checkpoint-purge       1
scheduled-decay-sweep           decay-sweep            1
scheduled-memory-consolidation  memory-consolidation   1
scheduled-observation-bridge    observation-bridge     1
```

Five rows, all matching the seam's denylist — and the suite fails anyway,
because the seam guards the wrong accessor.

The file already contains the correct pattern: `cleanup()` at `:62` deletes
`WHERE id LIKE 'pg-scheduler-test-%'` — scoped positively to what the test
created. Only the assertions were never given the same treatment.

### Defect B — installers that never shed a retired member

`skills/agents/handoff-writer/SKILL.md` was retired in `93c1ee1c`. On any machine
installed before that commit, `massa-ai-handoff-writer` is still installed and
still offered to the user as a specialist, because no install path removes it.

Exactly one site does this correctly, and states the reason:

> `apps/cursor-plugin/install.sh:620` — *"Prune-then-copy so a specialist deleted
> from the bundle cannot linger installed."*

The decision never reached the sibling sites. Enumerated across all four plugin
installers and `scripts/install-skills.sh`:

| # | Site | Namespace | Prunes on install? |
| --- | --- | --- | --- |
| 1 | `apps/claude-plugin/install.sh:853` | `~/.claude/agents/massa-ai-*.md` | no |
| 2 | `apps/claude-plugin/install.sh:819` | `~/.claude/commands/massa-ai-*.md` | no |
| 3 | `apps/codex-plugin/install.sh:681` | `~/.codex/agents/massa-ai-*.toml` | no |
| 4 | `apps/opencode-plugin/install.sh:598` | opencode agents (**symlinks**) | no |
| 5 | `apps/opencode-plugin/install.sh:624` | opencode workflow commands | no |
| — | `apps/cursor-plugin/install.sh:625` | `~/.cursor/agents/massa-ai-*.md` | **yes — the model** |
| — | `install_variant_tree`, all 4 hosts | `agent-profiles/` tree | yes (`rm -rf` then copy) |

A second, distinct class turned up in the same sweep: **removal loops that
derive their population from the source bundle instead of the installed
directory.**

| # | Site | Effect |
| --- | --- | --- |
| 6 | `apps/claude-plugin/install.sh:738` (`remove_file_route_artifacts`, commands) | switching to the marketplace route leaves a retired command's file-route copy behind |
| 7 | `apps/opencode-plugin/install.sh:433` (**uninstall**, agents) | a retired agent survives `--uninstall`; with the bundle absent, **no** agent symlink is removed at all |

Both are self-refuting against comments already in the same files:

- `claude-plugin/install.sh:762` — *"Prefix-glob against the INSTALLED directory,
  not the source bundle: deriving removals from `$SCRIPT_DIR/commands/*.md`
  misses installed copies whenever the bundle is absent or stale at uninstall
  time (normal under AD-016 — generated artifacts are untracked)."* Site 6 is in
  the same file and derives from the source.
- `opencode-plugin/install.sh:445` — the same paragraph, cross-referencing *"the
  claude-plugin uninstall hardening (T7)"*. Site 7 is the block **immediately
  above** it, in the same file, still source-derived.

Under AD-016 the bundles are gitignored and generated on demand, so "the bundle
is absent" is the normal state, not an edge case.

### Two adjacent findings, folded in by user decision

- **IPT-05.** `skills/profile/` is generated into all four bundles
  (`apps/*/plugin/skills/profile/` verified present) but **no plugin installer
  installs it**: all four hardcode `for name in massa-ai persona-router`
  (`claude:312,388`, `codex:310,384`, `cursor:328,403`, `opencode:211,285`).
  `scripts/install-skills.sh` discovers skills dynamically — any directory under
  `skills/` containing a `SKILL.md` (`:204-210`) — so the repo route ships the
  skill and the registry-tarball route silently does not. Same root class as the
  prune gap: a hardcoded list that cannot track its source.
- **IPT-06.** `CLAUDE.md:331` claims the plugins ship *"those same 17"*
  specialists. There are **18** (`skills/agents/` directory count), and
  `CLAUDE.md:326`, `FEATURES.md:370`, and `docs/ONBOARDING.md:340` all say 18.

## Requirements

### IPT-01 — the scheduler store test asserts only over rows it created

- **AC-01.1** Every set-valued assertion in `scheduler-store-pg.test.ts` is
  restricted to ids carrying the test's own prefix, by an allowlist. No
  assertion may name, filter on, or otherwise depend on the `scheduled-`
  string.
- **AC-01.2** The `M35` seam (`installScheduledFilterSeam`, `restoreSeam`,
  the module-level `seamStore`/`seamOriginalListAll` pair, and the `afterEach`
  call to `restoreSeam`) is **deleted**, not disabled. `listAll` is never
  reassigned on any instance.
- **AC-01.3** The `M35` seam-restoration test at `:147` is deleted. Its one
  durable assertion — that `cleanup()` leaves no test-prefixed row behind —
  survives as a plain assertion; nothing else in that test outlives the seam.
- **AC-01.4** A discriminating sensor exists: the suite inserts a row whose id
  does **not** match the test prefix and does **not** begin `scheduled-`,
  asserts the scoped assertions still hold, and removes it. The suite's
  `cleanup()` covers this second prefix too, so the test owns every row it
  creates. The second prefix is a named constant beside `TEST_PREFIX`, never a
  literal at the insertion site.
- **AC-01.4a** The probe row is inserted with `enabled: false`. It must be
  invisible to `Scheduler.start()`, which seeds its tick loop from
  `listEnabled()` — see the corresponding entry under "Risks accepted". Note
  this makes the probe exercise `listAll` scoping directly and `listEnabled`
  scoping only via its absence; AC-01.7's coverage of `listEnabled` comes from
  the real production rows on the shared database, which is where that assertion
  actually fails today.
- **AC-01.5** Two REDs are persisted verbatim in `validation.md`, not one:
  1. The **unmodified tree** against the shared database, already captured
     above (`5 pass / 1 fail` at `:139`). This is the defect itself, not a
     mutation, and it is the primary evidence.
  2. AC-01.4's foreign-row sensor against the **dedicated** database, where the
     pre-fix assertions fail on a row matching neither prefix. Measured on the
     pre-fix tree: `5 pass / 1 fail` with a `cron-probe` row present, versus
     `6 pass / 0 fail` with the table empty.
- **AC-01.6** The suite passes against **both** the shared developer database
  (`:5432/massa_ai`, five enabled production rows) and the dedicated test
  database (`:5433/massa_ai_test`, empty). Both runs are recorded with their
  pass counts. A run against only the dedicated database does not satisfy this
  AC and never could: measured pre-fix it reports `6 pass / 0 fail` there, so
  **the dedicated database cannot observe this defect at all**.
- **AC-01.7** The fix covers every set-valued accessor the suite asserts on —
  at minimum `listAll` **and** `listEnabled`. Scoping only the accessor named in
  the original seam reproduces the original mistake; `listEnabled` at `:139` is
  where the suite actually fails today. A post-fix run must be shown to pass
  that specific line against the shared database.
- **AC-01.8** Any row the suite creates outside its primary prefix (AC-01.4's
  foreign probe) is removed by `cleanup()`, and the suite asserts the table is
  free of **both** its prefixes at teardown. A probe row surviving a crash would
  be indistinguishable from a production row to the next reader.

### IPT-02 — every install-path copy sheds retired members

- **AC-02.1** Sites 1–5 in the table above shed retired members, in the order
  **copy-then-prune**: the copy loop writes the current set first, and only then
  are owned destination members absent from that set removed.

  This deliberately inverts cursor's prune-then-copy. Both orders converge on
  the same end state; they differ only under interruption, and that difference
  is one-directional:

  | Interrupted at | prune-then-copy | copy-then-prune |
  | --- | --- | --- |
  | mid-copy | destination is **empty or partial** — live specialists lost | every previously-installed member still present, some not yet refreshed |
  | mid-prune | n/a | a retired member lingers one run longer |

  `set -euo pipefail` is in force in all four installers, so a mid-loop `cp`
  failure aborts the script; under prune-then-copy that abort leaves the user
  with fewer agents than before they upgraded, and a `SIGKILL` or OOM produces
  no stderr at all. Copy-then-prune's worst case is the pre-fix status quo — a
  stale file — which is the defect this feature already tolerates.
- **AC-02.1a** The removal population is the **destination directory**; the
  current bundle supplies only the keep-predicate. These are separate roles and
  conflating them reintroduces IPT-03's defect: iterating the bundle to decide
  removals is precisely what sites 6 and 7 do wrong. Concretely, the shape is
  "for each owned entry in the destination, remove it if the bundle has no
  member of that name" — never "for each bundle member, remove …".
- **AC-02.2** Each prune uses **that host's own documented ownership test**, not
  a uniform rule. The tests are not interchangeable and a uniform `rm -f` over a
  name prefix is wrong for at least two of the five sites:

  | Site | Ownership test | Established by |
  | --- | --- | --- |
  | claude agents | `massa-ai-` name prefix | `install.sh:775-777` — *"the massa-ai- name prefix is the ownership marker"* |
  | claude commands | `massa-ai-` name prefix | `install.sh:765` — *"The massa-ai- prefix is the ownership marker, same as the agents loop below"* |
  | codex agents | first line is exactly `# massa-ai-owned` | `install.sh:578-585` — *"R3: shared agents dir, user agents preserved"* |
  | opencode agents | entry is a **symlink** | `install.sh:604-609` install-path pre-flight refuses to clobber a regular file |
  | opencode commands | `massa-ai-` name prefix | `install.sh:445-456` |

- **AC-02.3** No prune removes a path the host's own installer already protects.
  Specifically: the codex prune must not remove an unmarked `massa-ai-*.toml`
  authored by the user, and the opencode agent prune must not remove a **regular
  file** — the copy loop at `:604` explicitly refuses to overwrite one, so a
  prune that deletes it would contradict a protection in its own loop.
- **AC-02.4** For each of the five sites, a test proves the behaviour by
  planting a retired member in the destination, running the installer against a
  scratch `HOME`, and asserting the retired member is gone **and** the current
  set is present. A test that only asserts the current set is present passes
  identically before and after the fix and does not satisfy this AC.
- **AC-02.4a** Each planted fixture must satisfy **that site's own AC-02.2
  ownership test**, or the test proves nothing: a codex fixture needs the exact
  first line `# massa-ai-owned` (the generator writes it at
  `generate-subagent-artifacts.ts:382-385`; the installer greps for it at
  `codex/install.sh:584`), and an opencode agent fixture must be planted as a
  real **symlink**, since the ownership test there is `[[ -L ]]`.
- **AC-02.5** For each of the two ownership tests that are not a bare name
  prefix (codex marker, opencode symlink-ness), a test plants a **user-owned**
  member that the ownership test must reject — an unmarked `massa-ai-*.toml`,
  and a regular file at an opencode agent path — and asserts it survives the
  install. This is the AC that catches a uniform `rm -f`.
- **AC-02.6** `apps/cursor-plugin/install.sh:625` **is** converted to
  copy-then-prune, making it site 6 of 6. Scope the reason precisely: cursor is
  verified correct on the **ownership-test** dimension (prefix-glob, matching
  its own uninstall at `:505-509`) and was the model for that. It is not correct
  on the interruption dimension — it carries exactly the prune-then-copy window
  AC-02.1 rejects, and no test in this repository exercises its agent-prune loop
  at all (measured: zero prune/retired/stale fixtures against that loop in
  `apps/cursor-plugin/__tests__/install.test.ts`).

  Leaving cursor alone would make it the sole host on the order this feature
  documents as unsafe, while every sibling moved. The before/after reference
  point it was preserved for is no longer needed: both plan critics verified the
  ownership table against source independently, which is stronger evidence than
  an unmodified example.
- **AC-02.6a** Cursor's prune loop gains the AC-02.4 retired-member test it
  currently lacks. Converting an untested destructive loop without first giving
  it a sensor would be the one change in this feature with no way to tell
  whether it worked.

### IPT-03 — removal loops read the installed directory, never the bundle

- **AC-03.1** Sites 6 and 7 derive their removal population from the installed
  destination directory.
- **AC-03.2** Site 7 keeps its symlink-only ownership test (`[[ -L ... ]]`)
  while changing the population it iterates. Widening the population and
  loosening the ownership test are separate changes; only the former is in scope.
- **AC-03.3** A test proves each fix with the source bundle **absent** — the
  normal state under AD-016 — asserting that installed members are still
  removed. With the bundle present and complete, the pre-fix and post-fix
  behaviour coincide, so a bundle-present test does not discriminate.
- **AC-03.3a** That test must set `MASSA_AI_SKIP_ARTIFACT_GENERATION=1`. All
  four installers regenerate the bundle at the top of the script whenever
  `scripts/generate-skill-artifacts.ts` is reachable and that variable is not
  `1` (`opencode/install.sh:75-87`, same pattern on the other three). A test run
  by `bun run test:scripts` executes inside the repo checkout, where the
  generator **is** reachable — so without the variable the harness silently
  restores the bundle before the removal loop runs, and the AC's stated
  precondition never holds. The test would still pass for this particular
  defect, which is worse: it would be green for the wrong reason.
- **AC-03.4** A scripted sweep enumerates every removal loop in all four plugin
  installers and `scripts/install-skills.sh`, classifies each as
  destination-derived or source-derived, prints the total population beside the
  verdict, and asserts zero source-derived loops remain. The sweep is committed
  and runs in `bun run test:scripts`. A one-time manual grep does not satisfy
  this AC.

### IPT-04 — `install-skills.sh --apply` removes a stale skill

- **AC-04.1** A skill recorded in `install-state.json` for a host, no longer
  present in `skills/`, and still massa-ai-owned by the existing ownership test
  (repo-resolving symlink, or copy plus its `.massa-ai-owned-<name>` marker) is
  **removed** on `--apply`, not merely reported.
- **AC-04.2** `--check` behaviour is unchanged: it continues to report the same
  stale entries as drift without mutating anything.
- **AC-04.3** `--dry-run` reports the removal as `would-change` and removes
  nothing. This is asserted by a test that checks the target still exists after
  the dry run.
- **AC-04.4** The ownership test for removal is the one already used by
  `--uninstall`, and the citation is **`install-skills.sh:665-698`** — the whole
  gated block, not `:668-698`. An earlier draft of this spec cited the narrower
  range and that was a latent data-loss bug in the specification itself.

  Line `:665` is `if [ "$owner" != "plugin" ]; then`, guarding the entire
  removal loop, with this comment immediately above it:

  > *"D3/PDO-09: a `plugin`-owned record means a plugin tarball install claimed
  > this platform's skills directory, not this repo installer — never remove or
  > otherwise touch what we do not own, and never drop that record either."*

  `apply_platform()` computes **no `owner` variable at all** (verified: zero
  occurrences of `owner` in that function). An implementer porting only
  `:668-698` into the apply path would therefore wire stale-removal in with no
  ownership gate, and `--apply` would delete a plugin tarball's skill
  directories the moment a name left `SKILL_NAMES` — destroying exactly the
  single-writer coordination the file's own header exists to protect.
- **AC-04.4a** `apply_platform()` computes `owner` and skips stale-removal
  entirely when it is `"plugin"`. A skill directory without its marker is never
  removed.
- **AC-04.4b** A discriminating test plants a **plugin-owned** stale skill —
  `skillsOwner: "plugin"` recorded in `install-state.json` — and asserts
  `--apply` leaves it untouched. Without this case the blocker above ships
  green, because every other AC-04 test uses a repo-owned fixture where the
  gate's presence makes no difference.
- **AC-04.5** The state record is updated so a second `--apply` is a no-op and
  reports nothing.

### IPT-05 — plugin installers install every skill the bundle ships

- **AC-05.1** All four plugin installers install `profile` in addition to
  `massa-ai` and `persona-router`, in `install_bundled_skills`.
- **AC-05.2** The installed set is **not** derived by scanning the bundle's
  `skills/` directory. That rule was drafted here, independently proposed as the
  correction by review, and is wrong in both forms — measured per host:

  | host | dirs under bundle `skills/` | with a root `SKILL.md` | loose `.md` |
  | --- | --- | --- | --- |
  | claude | 4 | 3 | 0 |
  | codex | 4 | 3 | 46 |
  | **cursor** | **51** | **49** | 0 |
  | opencode | 4 | 3 | 0 |

  "Every directory containing a `SKILL.md`" installs **49** skills on cursor,
  because cursor's bundle ships each workflow skill as its own directory while
  codex ships the same content as 46 loose `.md` files. Excluding `agents/`, the
  refinement review proposed, moves 49 to 49. `install_bundled_skills` installs
  **harness** skills into `$HARNESS_SKILLS_DIR`; workflow skills reach the user
  by a different path entirely, and conflating them would be a far larger
  regression than the gap being fixed.
- **AC-05.2a** The authoritative list is the generator's, which names three:
  `generate-skill-artifacts.ts:138`
  (`for (const bundleName of ["massa-ai", "persona-router", "profile"] as const)`)
  and `managedRootsFor():216-220`. `scripts/install-skills.sh` independently
  arrives at the same three by discovering `skills/*/SKILL.md` **in the repo**
  (not the bundle), which is why the repo route already ships `profile`. The
  four installers are brought into agreement with that list.
- **AC-05.3** A **behavioural** guard per host asserts that running `install.sh`
  against a scratch `HOME` lands exactly the three harness skill directories.
  It lives in `apps/<host>-plugin/__tests__/` and runs under
  `bun run test:plugins` — the runner that actually executes the bash, and the
  one `bun run test` never reaches. It must not be a static parse of the
  `for name in …` literal: that is the same "read the list rather than run it"
  shortcut AC-03.4 rejects for the sibling requirement.
- **AC-05.3a** A cheap static cross-check additionally asserts each installer's
  hardcoded list equals the generator's `["massa-ai","persona-router","profile"]`
  constant, so adding a fourth harness skill fails loudly in four places rather
  than silently shipping on one route. This supplements AC-05.3, never replaces
  it.
- **AC-05.4** `skillsOwner` coordination is unchanged: a plugin still installs
  its bundled skills only when `install-state.json` does not record
  `skillsOwner: "repo"` for that host.

### IPT-06 — a roster gate that is blind to line breaks

**The gate already exists, and it is green while the defect is live.** This
requirement is not "fix a doc typo and add a sweep" — writing a new sweep would
have produced a second gate beside a working one, both blind in the same way.

`scripts/__tests__/workflow-harness-contract.test.ts:399` is
`describe("roster: nothing advertises a specialist count other than 18")`. It
holds `ROSTER = 18`, enumerates its file list from `git ls-files`, carries a
`HISTORICAL` allowlist for past-tense narration, and guards itself against a
vacuous pass ("the roster scan reads a real file list", `:481`). It runs inside
`bun run test:scripts`, measured on this branch's baseline at **1810 pass / 0
fail** — with `CLAUDE.md:331` reading 17 the whole time.

The blind spot is at `:471`: the scan iterates **lines**, and applies
`COUNT_CLAIM.exec(line)` to each. `CLAUDE.md` splits the claim across a newline:

```
CLAUDE.md:331  … ship those same 17
CLAUDE.md:332  specialists plus hooks per host, generated by
```

No line contains both the number and the noun, so no line matches. This was
found independently, from the other side: a hand-written line-based sweep over a
scoped file set returned **0 matches**, a clean report with the defect present;
the same set under a `perl -0777` slurp returned 5 matches across 3 files. Two
independent line-oriented instruments, the same false clean.

The gate's own docblock at `:408-417` already records a near-miss of this exact
shape — `docs/ONBOARDING.md` sitting at "16 sub-agent specialists" with "the
word 'specialist' forty lines later".

- **AC-06.1** The **existing** gate is made whitespace-tolerant across line
  breaks so `COUNT_CLAIM` matches a number and noun separated by a newline. No
  second sweep is written.
- **AC-06.2** The change is proven by an observed RED **before** `CLAUDE.md` is
  edited: the amended gate, run against the current tree, must fail naming
  `CLAUDE.md` and the value 17. A gate first observed green is not evidence that
  it can see anything. This ordering is mandatory — fixing the doc first makes
  the RED unobtainable without reverting.
- **AC-06.3** `CLAUDE.md:331` then reads 18, and the gate returns green.
- **AC-06.4** The existing `HISTORICAL` allowlist (`:429-444`) is reused, not
  replaced. It **already** covers `FEATURES.md`'s *"made the 12 specialists
  impossible to select by hand"* and three further past-tense entries. An
  earlier draft of this spec proposed rewording that `FEATURES.md` sentence;
  that would have been wrong — it is correct as written and already exempted by
  the mechanism designed for it (designer-agent D-8).
- **AC-06.5** Widening the matcher must not turn any existing allowlisted or
  currently-passing statement into an offender. The gate is run before and after
  with the offender list printed both times, and the only difference is
  `CLAUDE.md`. A widened matcher that reports 30 new offenders has not been
  validated by "it still passes after I fixed them all".
- **AC-06.6** If newline tolerance proves to admit false positives across
  paragraph or sentence boundaries, the matcher is bounded to a small window
  (a single intervening newline, no blank line) rather than made unbounded. The
  measured target spans exactly one newline.

## Non-goals

- Changing which agents exist, or retiring any agent. This feature makes
  retirement propagate; it retires nothing.
- Changing any host's ownership model. Each documented ownership test is
  adopted as-is; none is widened, narrowed, or unified. Unifying them is a
  plausible follow-up and is explicitly **not** attempted here, because a
  unification error deletes user files on four hosts at once.
- Changing MCP registration, hook installation, `install_variant_tree`, or the
  marketplace-vs-file route decision.
- Reconciling the two `scheduled_jobs` cleanup questions carried from earlier
  work. The five production rows in the developer database are the user's data
  and are not touched.
- Repairing the `workflow-command-check` flake recorded during Feature 3.

## Risks accepted

- **A prune is destructive and runs on every install.** This is the whole risk
  surface of the feature. It is contained by AC-02.2 (per-host ownership test
  taken verbatim from that host's own uninstall path), AC-02.3 (no prune removes
  what the same installer protects), and AC-02.5 (a user-owned member must
  survive). A wrong ownership test here deletes user files silently, and the
  user would first notice it as a missing agent.
- **The five install sites are edited in four separate scripts.** No single test
  exercises all five, so AC-02.4 requires a per-site test rather than one
  aggregate.
- **IPT-02, IPT-03 and IPT-05 collide on three of the four `install.sh` files.**
  An earlier draft of this section claimed the sites were "disjoint by file,
  which is what makes parallel execution safe". That was true only of IPT-02's
  five sites among themselves, and the sentence invited exactly the wrong
  inference for the feature as a whole. Measured overlap:

  | file | IPT-02 | IPT-03 | IPT-05 |
  | --- | --- | --- | --- |
  | `apps/claude-plugin/install.sh` | `:853`, `:819` | `:738` | `:312`, `:388` |
  | `apps/codex-plugin/install.sh` | `:681` | — | `:310`, `:384` |
  | `apps/opencode-plugin/install.sh` | `:598`, `:624` | `:433` | `:211`, `:285` |
  | `apps/cursor-plugin/install.sh` | — (AC-02.6) | — | `:328`, `:403` |

  Only cursor is exclusive to one requirement. Dispatching IPT-02/03 and IPT-05
  as separate parallel workers would put two writers on three files. The plan
  therefore partitions **by file, not by requirement**: one worker owns one
  `install.sh` and lands every requirement touching it. `tasks.md` is
  authoritative for this and must not be re-partitioned by requirement.
- **Copy-then-prune still has an interruption window, just a benign one.** A run
  interrupted mid-prune leaves a retired member installed — the pre-fix status
  quo — and the next successful install clears it. This is accepted rather than
  eliminated; making it atomic would mean a temp-directory-and-rename rewrite of
  five loops on a public compatibility surface, which is disproportionate to the
  harm.
- **Rows this suite creates are schema-indistinguishable from real jobs.**
  `ensureHydrated()` runs an unscoped `SELECT * FROM scheduled_jobs`
  (`scheduler-store-pg.ts:109-111`) and `Scheduler.start()` seeds its tick loop
  from `listEnabled()`. The `job()` fixture defaults to `enabled: true` with a
  real dispatchable `jobKind`. A scheduler-enabled process hydrating for the
  first time inside the narrow window a test row exists could treat it as live.
  Contained by three things: `MASSA_AI_SCHEDULER_ENABLED` defaults to `false`,
  each store instance hydrates once, and AC-01.4's foreign probe row is required
  to be `enabled: false`. Named here because it is not otherwise obvious that a
  test row in a shared table is dispatchable.
- **`CHANGELOG.md` is shared across this feature's own phases**, not only across
  branches. Every phase appending to `[Unreleased]` concurrently will conflict;
  the entry is written once, at close-out, by a single owner.
- **Site 7's fix changes `--uninstall` behaviour on opencode.** Today, with a
  bundle absent, it removes nothing; after the fix it removes every installed
  massa-ai agent symlink. That is the documented intent of `--uninstall`, but it
  is a behaviour change on a public compatibility surface and is called out in
  `CHANGELOG.md` as such.
- **AC-01.6 requires the shared developer database.** That database carries the
  five production rows the defect is about, so the dedicated test database alone
  cannot demonstrate the fix. The run is read-plus-own-rows only: the suite
  writes and deletes exclusively its own two prefixes.

## Follow-ups recorded, not built

- **IPT-F1** — unify the four per-host ownership tests behind one documented
  helper. Deliberately deferred; see non-goals.
- **IPT-F4** — `listAll`/`listEnabled` sort by `nextRunAt` with **no secondary
  key**, and hydration issues `SELECT *` with no `ORDER BY`
  (`scheduler-store-pg.ts:109-111`, `:253`). This feature's assertions are safe
  because their two rows carry distinct `nextRunAt` values (1500 vs 2000), and
  filtering a stably-sorted array preserves the relative order of what it keeps.
  A future order-sensitive test reusing the `job()` fixture's default
  `nextRunAt: 2_000` for two rows would tie on the sort key and fall back to
  unspecified row-scan order. Recorded so it is not rediscovered as a new flake.
- ~~**IPT-F5**~~ — cursor's conversion to copy-then-prune was folded into scope
  by user decision on 2026-08-17; see AC-02.6/AC-02.6a. Kept as a struck entry
  so the earlier reference in `design.md` D1 is not read as an open item.
- **IPT-F2** — `install-skills.sh --check` reports stale skills as `drift`. After
  IPT-04, `--apply` fixes them. Whether `--check` should exit non-zero on stale
  drift in CI is unresolved and unchanged here.
- **IPT-F3** — carried from Feature 3, unchanged: AC-03.3c (analytics and
  `file/read` over-blocked under read-only mode), HPC-06 (audit reach vs
  docblock), HPC-07 (four fail-open config gates).

## Merge sequencing

This branch is off `main` at `89909051` and shares **no source file** with
PR #107 or `feat/portal-handoff-proposal-crud`. The one shared file is
`CHANGELOG.md` under `[Unreleased]`, and `.specs/project/FEATURES.json` /
`STATE.md` at close-out. Whichever lands second resolves those by merge, never
rebase. This branch may merge before or after either of the others.
