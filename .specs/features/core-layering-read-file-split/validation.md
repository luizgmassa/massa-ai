# Core Layering — `read_file.ts` Split (PR-D) — Validation

- **Slug**: `core-layering-read-file-split` · **PR-D** · task **T25**
- **Branch**: `spec/pr-d-read-file-split`, range `f06b01d..0f63079` — **58 commits**
  (`git rev-list --count main..HEAD`, cross-checked after this session observed a plain
  `git log | wc -l` pipe return 50 and 58 for the identical command — see §6.1)
- **Date**: 2026-08-03
- **Author ≠ verifier**: this pass ran in a **fresh conversation** carrying no context beyond the
  `.specs/` artifacts and `~/prd-exec-instruments/` — the shape the user chose on 2026-08-03
  (HANDOFF ## Active tail), **rejecting**: a verifier agent dispatched from the authoring session
  (the author would frame the verification), manual verification by the user, and deferral. Every
  §10.x record in `tasks.md` was treated as a claim to re-verify from raw data; no figure below is
  inherited from it. Precedents: PR-C's T18, PR-B's T20.
- **Method**: full Plan Challenge gate on the verification plan itself, two modes (evidence audit:
  10 of 12 premises reproduced, 1 partial, 1 methodology finding; red team: 8 attacks, 5 adopted
  into the plan — the critical one being that a file-organized `0 of 30` is not a per-clause
  reading, which R-40 already sent T25 to take and the first plan draft missed). Host load 2.06 at
  the readings. The massa-ai MCP server was not used; `.specs/` files are the state.

## VERDICT: **PASS**

All criteria in scope hold on the shipped tree — **GMS-02 AC-1 and the GMS-02 headline**,
**RFS-01 AC-1–AC-6**, **RFS-02 AC-1–AC-4**, **RFS-06 AC-1–AC-3**, **RFS-03 AC-1–AC-3**,
**RFS-04 AC-1–AC-3**, **RFS-05 AC-1–AC-5**, and GMS-05's four inherited criteria to the depth
stated in their rows. **No surviving mutant** across the ten verifier-chosen faults (§4). The two
open criteria questions are both answered **in favour of the author's amendments**, from executed
evidence (§3). Residual findings in §6; none blocks.

---

## 1. Criteria

| AC | Verdict | Evidence produced during validation | Happened, or nothing broke? |
| --- | --- | --- | --- |
| **GMS-02 AC-1** — `read_file.ts` sheds non-schema, non-delegation logic | **PASS** | `wc -l`: **707 at `f06b01d` → 124 at HEAD** (≤ N=125, not below ~100 — R-30's band). File read whole: 1 export (`ReadFileTool`), **0** private method bodies, **0** `Map`/`Set` fields, `inputSchema` `:23-84`, `handle()` = options-read + delegate + serialize + catch. Gate `--json`: `read_file.ts` bodies 0 / raw 0 / state 0 / `handle()` 27. Six modules exist under `services/file-read/` and module 7 imports 2–6 (`read-file.service.ts:47-54`); `services/cache/lru-evict.ts` exists. **Schema byte-identity measured, not diffed by eye**: the `inputSchema` block extracted by brace-matching at `f06b01d` and HEAD is **62 lines, byte-identical** (diff exit 0); `git diff --quiet f06b01d..HEAD` over `apps/tools-api/src/routes/file.ts`, `apps/mcp-client/src/tool-defs/` and the whole `apps/mcp-client/` all exit **0** | **Happened** — 707→124 with the schema block bit-stable is the move itself, not its absence |
| **GMS-02 headline** — no `tools/` file holds orchestration or domain logic | **PASS** | RFS-01's gate at HEAD: `PASS — 0 of 30 file(s) over the rule; 27 declare an IToolHandler, 3 do not; 398 members examined`, exit 0 — **and per clause** (red team's fix, from `--json`): clause 1 (bodies) **0**, clause 2 (state) **0**, clause 3 (`handle()` > 120) **0**. `index_project.ts` reads 0/0/0 with `handle()` 106 | **Happened** — the same gate read **2 of 30** (per clause 2/1/2) on the pre-extraction tree in my worktree re-take |
| **RFS-01 AC-1** — gate exits 0, prints population, runs in CI's `build` | **PASS** | Exit 0 + population print above. `ci.yml:167-168` step inside the `build` job (job starts `:19`, next job `:223`), between `check-core-layering` (`:153`) and stale-pointers (`:176`), **no `if:`, no `continue-on-error`**. Live ruleset re-queried: `gh api repos/luizgmassa/massa-ai/rules/branches/main` → contexts `["build","mcp","validate","Structural native tests (darwin-arm64)","Structural native tests (linux-x64)","coverage"]` — **`build` present** | **Happened** — wired and merge-blocking by the live repository setting, not the workflow file alone |
| **RFS-01 AC-2** — zero allowlist, no exemption parameter, no suppression flag | **PASS** | Source read: argv surface is exactly `--repo` and `--json`; docblock `:121-126` states no exemption table / parameter / flag; a token sweep over both gates found only the docblock disclaimers and the **rule's own** by-name/by-kind exemptions (`handle()`, constructor), which are the predicate, not an allowlist | Happened |
| **RFS-01 AC-3** — frozen base `2 of 30` taken before the first extraction commit | **PASS** | History re-derived: `git merge-base --is-ancestor` proves `180f7d2` (gate) → `e0ebf17` → `9adee57` (T5 record) → `bb59c99` (T6, first structural commit); the only commit in `9adee57..bb59c99` touching `packages/core/src/` is `bb59c99` itself. `git show 9adee57:…tasks.md` carries the per-member record (`2 of 30`, 224 members, `read_file.ts` 13/17/2/175). **Re-taken, not inherited**: the T5-tree worktree run of that commit's own gate reproduces `FAIL — 2 of 30`, per clause **2 / 1 / 2**, `read_file.ts` **13 maximal / 17 raw / 2 state / handle() 175**, `index_project.ts` **3 / 3 / 0 / 128** — every headline figure of the frozen base, from my own run | **Happened** — and it is a claim about history; the branch is unpushed and unsquashed, so ancestry is intact (R-27 stays live until the merge button honours `--no-ff`) |
| **RFS-01 AC-4** — both directions observed red + inert control | **PASS** | Unit suite: **97 pass / 0 fail / 262 expect()** (`scripts/__tests__/check-tools-thin.test.ts`, runs inside `test:scripts` which CI's `build` executes). Re-observed live by the verifier on the real tree: M1 (Map field) and M2 (private method) both `FAIL — 1 of 30`, exit 1; M3 (comment-only) left the report **byte-identical** (§4) | Happened |
| **RFS-01 AC-5** — evasion shapes covered | **PASS** | The suite's shape roster read and exercised (object-literal handler, constructor-body closure, getter/setter, `static`, `#private`, arrow property, module-level `Map`, brace-in-string ceiling case, alias import) — 97 green cases; the object-literal widening is in the shipped gate (`aliasedInterface` field live in `--json`) | Happened |
| **RFS-01 AC-6** — docblock names what it does not certify | **PASS** | `check-tools-thin.ts:130-145` read: names the delegate-correctness blind spot (C28 one level down) and the non-handler scope cost with `serialize.ts` quantified (438 lines, 11 bodies) | Happened |
| **RFS-02 AC-1** — four-site characterization before the move, unmodified after (byte-identity, comments stripped — C56) | **PASS** | Both T1 files added at `d0fbc92` (`git log --diff-filter=A`), before `bb59c99`. `t8b-comment-only-proof.ts d0fbc92 <both files>`: **COMMENT-ONLY, code lines 190→190 and 141→141** — the assertion text is bit-stable across the entire branch. Suites at HEAD: **5 pass / 0 fail / 3115 expect()** and **2 pass / 0 fail / 23 expect()**. *Scope note (evidence audit P3): AC-1's own prose names the four-site characterization; the rename-pin file is AC-4's subject and is held to the same comments-stripped identity by the T1 task grouping — stated here so the inference is visible rather than read as spec text* | **Happened** — identity plus green is the pair; green alone would prove nothing about weakening |
| **RFS-02 AC-2** — an eviction function, not a cache class; no site's TTL/promotion moves | **PASS** | `lru-evict.ts` read: one exported function `evictOldest(cache, maxRetained)`, post-call bound, `while (size > maxRetained)`. All **five** production call sites read: pre-insert sites pass `CAP - 1` (`file-content-cache.ts:134`, `project-root-cache.ts:54,:71`, `symbol-graph.service.ts:820`), post-insert pass `CAP` (`web-controller.ts:142`, `file-filter-cache.ts:172` at 50) — TTL and promotion all site-local. M10 proved the site's cap wiring is sensed (§4) | Happened |
| **RFS-02 AC-3** — module imports nothing; asserted by its own unit test | **PASS** | `lru-evict.ts` contains **zero** import statements of any shape. `lru-evict.test.ts:185-242`: an AST walk over ImportDeclaration / ImportEquals / re-export / dynamic `import()` / `require`, **with a five-shape self-test fixture** so a walk that matches nothing cannot read as clean. Suite **15 pass / 0 fail / 43 expect()** | Happened |
| **RFS-02 AC-4** — `projectRootCache` rename behaviour pinned before the move; stale read logged, not fixed | **PASS** | Pin suite added at `d0fbc92`, green at HEAD (2p/0f). `project-root-cache.ts:15-21` carries the defect forward **stated** (`ROOT_CACHE_TTL` declared, read nowhere); both comment sites corrected to the measured truth and both cite **the pin test** as authority (`production-wiring.ts:58-80`, `invalidator-registry.ts:28-43`); no invalidator id matching `/read[-_]?file/i` was added on the branch | **Happened** — the pin exists, the defect is characterized, and nothing on the branch silently fixed it |
| **RFS-06 AC-1** — three containment shapes pass against pre-extraction code, unmodified (comments aside) after | **PASS** | Suite added at `ee578b2` (T2, against the unmodified tree); `t8b-comment-only-proof.ts ee578b2`: **COMMENT-ONLY, code lines 193→193**. At HEAD: **6 pass / 0 fail / 31 expect()**. Shapes (a)/(b)/(c) re-observed red under M5/M7 and the AC-2 case under M6 (§4) — a sensor is quotable only after failing on purpose, and all three failed on purpose **on the shipped tree** | Happened |
| **RFS-06 AC-2** — teaching error unchanged; roots only, never a host path | **PASS** | Error builder read at `path-containment.ts:122-128`: same three-line shape + `  - ` root list as `f06b01d:read_file.ts:443-447`; enumerates project root + cwd + env roots and nothing else. The **set-equality** case (suite `:304-348`) asserts the enumerated set exactly and that no line escapes the `  - ` shape — and M6 proved it discriminates where the presence/absence pair does not (§3.2, §4) | Happened |
| **RFS-06 AC-3** — env allowlist read at call time | **PASS** | Call-time read at `path-containment.ts:103-106` with the comment (`:101-102`, docblock `:82-84`); shape (b) drives one instance across set→unset→set on the same tool. M7 (construction-time hoist) read **5p/1f at exactly shape (b)** | Happened |
| **RFS-03 AC-1** — layering gate exits 0 after every structural commit, `edgesExamined` recorded per commit | **PASS** | **Re-taken via detached worktrees**: that commit's own gate run at the base and at all 17 branch commits touching `packages/core/src/**` — exit **0 at every one**, series `965/896 → 965/898 → 965/899 → 965/900 → 965/904 → 969/904 → 969/904 → 969/904 → 973/908 → 977/912 → 978/914 → 980/916 → 983/918 → 985/920 → 986/922 → 986/922 → 982/920 → 982/920` (§2.2). Every recorded milestone reproduces. One apparent mismatch dissolved by reading the gate: its population is **repo-wide tracked code files** (`trackedFiles()` = `git ls-files` + CODE filter), so T4a/T4b's `scripts/` additions explain 900→902 between my T3 and T6 rows | **Happened** — the numbers moved exactly with the extraction, and the gate was green at every step, not only at the ends |
| **RFS-03 AC-2** — no `services/file-read/` (or sibling new module) imports `tools/` | **PASS** | `git grep` over `services/{file-read,indexing,project-identity}/` for any `tools/`-shaped specifier: **0 production hits**; corroborated by the layering gate (982 edges, 0 violations), and M4 proved that exact edge class turns the gate red with the violation named (§4) | Happened |
| **RFS-03 AC-3** — allowlist stays empty (satisfied by construction; verifier check owned by §5's header) | **PASS** | `check-core-layering.ts` read at HEAD: argv = `--repo`/`--json` only, no `ALLOWLIST`/exemption/suppression anywhere (`:47-51` states it); the gate is **byte-unchanged on the whole branch** (`git log main..HEAD -- scripts/check-core-layering.ts` is empty — red team's evidence) | Happened by construction, and the construction was re-read |
| **RFS-04 AC-1** — removals verified against a cache-forced `npm pack --dry-run` | **PASS** | Re-taken: `rm -rf packages/{core,shared}/dist` → `npx turbo run build --force` (**5/5, Cached: 0**) → `npm pack --dry-run` per package. Core tarball `dist/data/vector/`: **exactly 8 files — `base-vector-store.{d.ts,d.ts.map,js,js.map}` + `postgres-vector-store.{…}`**, zero `hybrid-search.*`/`index.*`. `BatchCommand` **0** in fresh `dist/tools/index.d.ts` and `batch_execute.d.ts`; `IHybridSearch` **0** in fresh shared `dist/types/interfaces.d.ts` and `dist/index.d.ts` | **Happened** — a replayed stale dist would have restored 16 files; the fresh tree holds 8 |
| **RFS-04 AC-2** — CHANGELOG heading chosen deliberately before merge, per item | **PASS** | `[Unreleased]` carries `### Changed` (3 entries) **and** `### Removed` (1 entry) with the per-item reachability pricing in the entry text (reachable-zero-consumers vs zero-reachability; live file exempted **by name**; pack verification named). "Before merge" holds trivially — no PR exists. The skip-ci token: **0 occurrences** across all 58 commit messages (`git log --format=%B` to file, then `grep -c`) | Happened |
| **RFS-04 AC-3** — `hybrid-search.ts` collision resolved by full path in every figure | **PASS** | `t19-importer-sweep.ts` re-run per full path: `data/vector/index.ts` → **0 files / 0 lines**; `data/vector/hybrid-search.ts` → **0 / 0**; `services/search/hybrid-search.ts` (LIVE) → **3 files / 5 specifier lines** (1 production import + 2 test `require` + 2 `mock.module`), and that file is **zero-diff against `f06b01d`** | Happened |
| **RFS-05 AC-1** — the record is true at merge time | **PASS** | State files read at HEAD: `FEATURES.json` PR-D `complete`/all phases true **with the notes tail stating "T25 … PENDING … validation.md does not exist yet"** (true when written — this file now closes it), parent `complete` with the same frame; `active_feature` = `skills-directive-dedup`, untouched (fifth verification of that check) | Happened |
| **RFS-05 AC-2** — C28 amended into the parent in place AND indexed | **PASS** | Parent `spec.md:142` — *"Design and Execute corrections (C28–C33) — applied at PR-D's T20"*, six rows; AS-06's own row (`:304`) struck-and-annotated in place; GMS-02 AC-1's parenthetical carries the C28 replacement | Happened |
| **RFS-05 AC-3** — parent layer figures corrected with method named | **PASS** | Parent `spec.md:545`: three frames (`a6216cd` 31/6/208/41 → `d7091ac` 30/0/208/39+11 → T20 tree 30/0/218/37+11) with the `find … | wc -l` method named and the "unchanged, confirmed" durability claim struck; `~390/55%` → **490 of 707 (69.3%)** at `:557` with its derivation | Happened |
| **RFS-05 AC-4** — the dangling exclusion closed, class addressed in the gate's test | **PASS** | `EXCLUSIONS` at HEAD: **8 entries, all 8 exist on disk** (probe script over the parsed array). The class sensor is live: M8 re-added the deleted `services/query/prisma-client.ts` entry and the suite read **22p/1f at "every excluded path exists on disk"** (§4) | Happened |
| **RFS-05 AC-5** — CLAUDE.md figures + deferral marker | **PASS** | `CLAUDE.md:43-44`: 23 migrations **with the metric named** (24th entry = `migration_lock.toml`); `:572`: eight publishable / five at `v1.3.1`, both frames; `:238-241`: the **three**-directory trap naming `data/symbol/`. `docs/ONBOARDING.md:83-87`: regeneration "its own follow-up change after PR-D merges", citing spec §4.4 | Happened |
| **GMS-05 AC-1** (characterization first) | **PASS** | The three instrument suites all predate the first structural commit by ancestry (above); Phase-0 ordering re-derived from the commit graph, not the record | Happened |
| **GMS-05 AC-2** (per-file 90% floor, no new exclusion) | **PASS** (scoped) | **Re-derived for all ten new modules**: each suite run standalone with `--coverage` — all ten read **100.00% funcs / 100.00% lines** (196 pass / 0 fail across the ten). `EXCLUSIONS` gained no entry (8, all pre-existing subjects). The full-repo floor remains `coverage.yml`'s, which needs the dedicated `127.0.0.1:5433` database + `RUN_POSTGRES_TESTS=1` — not runnable here and listed in §7 | Happened for every file PR-D created |
| **GMS-05 AC-3** (no test weakened, skipped or deleted) | **PASS** | The comments-stripped byte-identity results above are the strong form for the three instrument suites; repointed suites (`read-file.test.ts` and siblings) pass inside the full aggregate below | Nothing broke, plus identity where identity was promised |
| **GMS-05 AC-4** (six gates green) | **PASS** | §5 table — all six plus both structural gates, first-run green | Nothing broke |

---

## 2. The re-takes T25 was required to run rather than inherit

### 2.1 T5's frozen reading, against the shipped tree — per clause and per member

`bun scripts/check-tools-thin.ts --json` at HEAD, clause counts derived from the per-file
readings (the default report is file-organized; the per-clause reading **is not derivable from
it** — R-40's point, and the red team caught that my first plan draft would have missed it):

```
HEAD:      clause 1 (bodies) = 0 files   clause 2 (state) = 0 files   clause 3 (handle>120) = 0 files
           read_file.ts      0 / 0 / 0 / handle 27      index_project.ts  0 / 0 / 0 / handle 106
T5 tree:   clause 1 = 2 {read_file, index_project}   clause 2 = 1 {read_file}   clause 3 = 2
           read_file.ts     13 / 17 / 2 / handle 175   index_project.ts  3 / 3 / 0 / handle 128
```

The T5 row was produced by running **that commit's own gate** in a detached worktree at
`9adee57` — the frozen base reproduces from raw data, per clause (C42's 2/1/2) and per member.

### 2.2 `edgesExamined` per structural commit — worktree re-take

That commit's own `check-core-layering.ts` (byte-unchanged all branch) and, where present, its
own `check-tools-thin.ts`, run in a detached worktree per commit touching `packages/core/src/**`
(node_modules symlinked; `check-core-layering` needs none, `check-tools-thin` imports
`typescript`):

| commit | task | layering (edges/files, all exit 0) | tools-thin |
| --- | --- | --- | --- |
| `f06b01d` | base | 965 / 896 | (not yet present) |
| `d0fbc92` | T1 | 965 / 898 | — |
| `ee578b2` | T2 | 965 / 899 | — |
| `f2222d3` | T3 | 965 / 900 | — |
| `bb59c99` | T6 | 965 / 904 | FAIL 2 of 30 · 224 members |
| `ea59b04` | T7 | **969** / 904 | FAIL 2 of 30 · 224 |
| `887350c` | T8 | 969 / 904 | FAIL 2 of 30 · 224 |
| `38fdc52` | T8b | 969 / 904 | FAIL 2 of 30 · 224 |
| `5fb88fd` | T9 | **973 / 908** | FAIL 2 of 30 · 221 |
| `f1413b6` | T10 | **977 / 912** | FAIL 2 of 30 · 215 |
| `834f00a` | T11 | **978 / 914** | FAIL 2 of 30 · **415** |
| `83922db` | T12 | **980 / 916** | **FAIL 1 of 30** · 404 |
| `f56e03e` | T13 | **983 / 918** | FAIL 1 of 30 · 403 |
| `7d4fc22` | T14b | **985 / 920** | FAIL 1 of 30 · 402 |
| `6af528e` | T14 | **986 / 922** | **PASS 0 of 30** · 399 |
| `ef5f837` | T16+T17 | 986 / 922 | PASS 0 of 30 · 399 |
| `40103b6` | T19 | **982 / 920** | PASS 0 of 30 · 398 |
| `644f190` | T21 | 982 / 920 | PASS 0 of 30 · 398 |

Frames, stated: the tools-thin **members** column changes meaning at T11 — C69's counter fix
recalibrated 215 → 419 on the same tree, so pre-`834f00a` members are old-counter figures and the
column must not be read as one scale (the gate itself changed at `180f7d2`/`e0ebf17`/`5fb88fd`/
`f1413b6`/`834f00a`; each row is that commit's own gate). The **verdict** column is
scale-independent: `2 of 30` → `1 of 30` at T12 → `0 of 30` at T14, exactly the recorded
trajectory. Every recorded layering milestone (965/896 base, 969 at T7, 986/922 at T14,
count-identical rename, 982/920 after T19) reproduces from my runs. The 900→904 step is the gate's
repo-wide population absorbing T4a/T4b's two `scripts/` files — checked against `trackedFiles()`
in the gate source rather than waved off.

### 2.3 Phase 6's resolver sweep — both directions

`t16-resolver-sweep.ts` (population printed first: 908 tracked code files, 908 parsed):

- `packages/core/src/services/graph` (old path): **RAW 0 files / 0 specifier lines**, members 0,
  external 0, mock.module 0, non-relative control 0, **UNRESOLVABLE 0**.
- `packages/core/src/services/memory-graph` (new path): **RAW 25 files / 45 specifier lines** —
  members 6/17, external **19 files / 28 lines** (7 production / 12 + 12 test / 16),
  **mock.module 6 in 6 files** — the exact mirror of the premeasured baseline.

Discrimination (M9, §4): one production specifier reverted to `./graph/…` reads **RAW 1/1,
UNRESOLVABLE 1** — the sweep cannot report a reintroduced old-path edge as clean.

### 2.4 The pack reading — §1 RFS-04 AC-1 row; sequence `rm -rf dist` → forced build (Cached: 0) → pack.

---

## 3. The two open criteria questions — answered, not inherited

### 3.1 Q1 — C37's replacement predicate for RFS-06 shape (c): **the right reading. Agreed.**

The struck clause (*"assert the returned `absolutePath` carries no literal `..` segment"*) is
**vacuous on the shipped tree, re-proven by execution here**: `resolveFilePath`'s only two
non-null exits are `path.resolve(...)` (`path-containment.ts:52`, `:61`), and a probe written to
the clause's letter **passed under the very mutation it exists to catch** — with `sanitizeFilePath`
dropped (M5), the resolution moved **outside the root** (`escapes-root: true`) while carrying
**zero** literal `..` segments (probe exit 0 both sides). A criterion that cannot fail is not a
criterion; striking it was correct.

The replacement is faithful to *"independent of containment"* in the only non-vacuous sense
available: the escaped directory is placed on `MASSA_AI_READ_FILE_ROOTS` so containment permits
**both** candidate resolutions (the companion case proves the allowlist really admits the escaped
file), leaving resolution locus — `sanitizeFilePath`'s sole observable effect — as the only
discriminator. Under M5 it reads **5p/1f at exactly shape (c)**.

One scoping note, from the red team, worth keeping with the answer: the replacement exercises the
containment-**allow** branch only. A "deny-branch" reading of independence is **structurally
uninstantiable** — the projectId branch sanitizes before resolving, so its resolutions always land
under the root and containment (with the root present) always allows them; there is no input on
which "containment denies AND the sanitize call's effect is observable". The allow-branch
construction is therefore not a compromise; it is the whole testable content of the clause.

### 3.2 Q2 — the enumerated-**set** assertion for AC-2: **what the criterion requires. Agreed.**

*"Roots only, never a host path"* is a universal negative over the enumerated list, and a
universal negative is only falsifiable by **bounding the set**. Measured both ways (M6): with
`$HOME` leaked into the teaching error's enumeration, the pre-existing presence/absence pair
(each root present, `/etc/passwd` absent — `read-file-containment.test.ts`) stays **7p/0f green**,
while the set-equality case reads **5p/1f red**. The presence/absence shape cannot see an extra
entry by construction; the set assertion is the minimal predicate that can.

The answer is scoped to the current construction, and the construction was read whole rather than
assumed: `checkPathContainment` builds its list from exactly three sources (workspace-resolved
project root, `process.cwd()`, the env allowlist — `path-containment.ts:95-109`), and
`ProjectRootCache.getProjectRoot` (read in full) draws only on the `indexing:started` event payload
and `workspaceManager.getWorkspace(...).project_path` — no env- or host-derived fourth source
exists to escape the enumeration.

---

## 4. Discrimination sensor — ten faults on the real tree

Each subject backed up to a scratch copy and restored from it, SHA-256 byte-identity asserted
after every restore; **never `git checkout`** (it restores to HEAD, not to pre-mutation state —
PR-C's T8b scar). Every observation via **direct** invocation (`bun test <file>` or the raw gate
script), never through turbo (red team attack 7: turbo's cached `build` upstream of `test` could
serve pre-mutation output). Sequential; no critic ran concurrently with any mutation.

| # | Subject | Mutation | Expected | Observed | Restore |
| --- | --- | --- | --- | --- | --- |
| M1 | `tools/batch_execute.ts` | `Map` field added to a green handler | tools-thin FAIL, members +1 | **FAIL — 1 of 30, exit 1, members 398 → 399**, state finding named | SHA-OK |
| M2 | `tools/batch_execute.ts` | private method with body | FAIL | **FAIL — 1 of 30, exit 1**, violation named | SHA-OK |
| M3 | `tools/read_file.ts` | comment-only, line-neutral edit (inert control) | report unchanged | exit 0, report **byte-identical** to baseline | SHA-OK |
| M4 | `services/file-read/file-metadata.ts` | `import … "../../tools/serialize.js"` | layering FAIL | **FAIL, exit 1**: `services -> tools` violation at `:29`, edges 982 → 983 | SHA-OK |
| M5 | `path-containment.ts:60-61` | `sanitizeFilePath` dropped (P3) | shape (c) red; literal-`..` probe green | suite **5p/1f at shape (c)**; probe **passed** while `escapes-root` flipped true (§3.1) | SHA-OK |
| M6 | `path-containment.ts:122` | `$HOME` appended to the teaching error's enumeration only (P4) | AC-2 set case red; presence/absence pair green | shapes **5p/1f at the AC-2 set case**; pre-existing suite **7p/0f** (§3.2) | SHA-OK |
| M7 | `path-containment.ts` | env allowlist hoisted to a construction-time field (P2) | shape (b) red | **5p/1f at exactly shape (b)** | SHA-OK |
| M8 | `scripts/check-coverage.ts` | the T21-deleted dangling `EXCLUSIONS` entry restored | existence pin red | **22p/1f at "every excluded path exists on disk"** | SHA-OK |
| M9 | `services/index.ts:127` | one production specifier reverted to `./graph/…` | old-path sweep ≠ clean | sweep reads **RAW 1/1 + UNRESOLVABLE 1** | SHA-OK |
| M10 | `file-content-cache.ts:134` | eviction bound `CAP - 1` → `CAP` (off-by-one; distinct from the accepted `CAP = 0` gap, `tasks.md` §10.8 region) | module cap case red | module suite **19p/1f at the cap case**; `lru-eviction-characterization` **5p/0f — green** (recorded honestly: the characterization oracle drives the method with its own caps and does not sense this site's constant; the module suite is that site's sensor, consistent with the feature's own C45/C49 record) | SHA-OK |

**No surviving mutant** — every fault was caught by the gate or suite named for it. Post-restore:
tree clean (`git status --porcelain` = only the untracked `.specs/reports/`), both structural
gates re-read green, tools-thin report byte-identical to the session baseline.

---

## 5. Gate state at validation (all first-run, host load 2.06–2.11)

| gate | reading |
| --- | --- |
| `lint` (oxlint) | exit 0 |
| `type-check` | 6/6, `--force`, **0 cached** |
| `build` | 5/5, `--force`, **0 cached**, after `rm -rf` of core+shared `dist/` |
| `bun run test` | **11/11 tasks, exit 0, first run** — 2 cached, both `:build`; core `[test-isolation] PASS: all 151 group(s)` |
| `test:scripts` | **1116 pass / 0 fail across 49 files** + shell suites (11 + 8) |
| `test:plugins` | **96 pass / 0 fail across 8 files** |
| `check-core-layering` | PASS — 0 violations, **982 edges / 920 files** |
| `check-tools-thin` | PASS — **0 of 30**, 27/3 split, **398 members**; per clause 0/0/0 |
| `npm pack --dry-run` | core: `dist/data/vector/` = 8 files (the two live stores only); shared: no `IHybridSearch` |
| ten new modules' coverage | 100% funcs / 100% lines each, suites standalone |

The known `mcp-client` 5001 ms class did not fire this session; no re-run under a scratch
`XDG_CONFIG_HOME` was needed (the protocol was armed).

---

## 6. Residual findings — ranked

### 6.1 The session's own evidence pipeline corrupted a count once — method hazard, not PR-D's

The evidence-audit critic observed plain `git log --oneline main..HEAD | wc -l` return **50** and
**58** for the identical command in one session (hook-level pipe mangling; `rtk` is the local
proxy). `git rev-list --count`, `rtk proxy` capture, and an out-of-band subprocess all agree on
**58**. Every count in this document was captured via redirect-to-file, `--quiet` exit codes, or
`rtk proxy` — none via a bare pipe. Recorded because a validation whose method is "re-derive from
raw data" is only as good as its capture path.

### 6.2 The characterization oracle does not sense per-site cap constants (M10's green half)

Deleting nothing and changing one site's bound by one, the T1 characterization suite stays green;
the module suite catches it. This reproduces the feature's own C45/C49/T10-column-B findings and
is why T8/T9/T10 added call-site sensors. Not a gap in any criterion — RFS-02 AC-1 promises
byte-identity and greenness of the pre-move suites, which hold — but a verifier after the next
refactor should reach for the **module** suites, not the characterization ones, as the cap
sensors.

### 6.3 First live run of the new CI step still pends the PR (T15's residual, unchanged)

`Bun.YAML`/local parse and my step-position read are proxies for GitHub's server-side validator;
the CHANGELOG merge gate is `pull_request`-only and no PR exists. Both fire on PR open. The
branch is also unpushed — R-04/R-27 (squash destroys RFS-01 AC-3's ancestry evidence) stay live
until the merge is performed `--no-ff`.

### 6.4 Carried operational residuals, unchanged from the record

A populated local pgvector index keys embeddings by pre-rename paths (git rename does not
re-index); `.ua/`'s ~200 stale references regenerate after PR-D (spec §4.4); the cross-drive
`path.isAbsolute(rel)` branch stays dead on POSIX CI (logged in RFS-06). None is a gate's concern.

---

## 7. What was NOT verified

- **`coverage.yml`'s full-repo per-file floor.** Needs the dedicated `127.0.0.1:5433` database
  and `RUN_POSTGRES_TESTS=1`; without them the gate reports phantom below-floor files. The ten
  files PR-D created were measured individually (all 100/100); the repo-wide floor is CI's own
  required check (`coverage` is in the live ruleset, re-queried this session).
- **The E2E suites and the needles retrieval gate** — outside every criterion in scope; needles is
  `workflow_dispatch`-only and non-blocking by design.
- **The live GitHub-side execution of the new `build` step** — impossible before a PR exists
  (§6.3).
- **C1–C33's figures not directly implicated by the criteria above** — they belong to the tasks
  that produced them; where one was implicated (C37, C41's consequence in AC-4, C42's per-clause
  reading, C44's call-position contract, C55/C56's identity predicate, C69's counter) it was
  re-measured here.
- **`apps/opencode-plugin/dist/index.js`'s bundled schema copy** — investigated by the red team
  and ruled out: git-ignored build output, not a tracked schema surface (recorded so it is not
  re-chased).

---

## 8. Outcome

**PR-D is validated: PASS.** GMS-02 AC-1 and the headline, RFS-01 through RFS-06, and GMS-05's
inherited criteria all hold, re-derived from raw data by a fresh-conversation verifier under the
recorded authorship decision. Both open criteria questions close in favour of the author's
amendments, each on executed two-sided evidence. No fix tasks were generated; the fix → re-verify
loop was not entered. The umbrella's remaining steps — push, PR, `--no-ff` merge — are the user's.
