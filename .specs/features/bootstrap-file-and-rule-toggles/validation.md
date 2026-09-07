# Validation — Bootstrap File And Rule Toggles (re-verification, iteration 2)

- **Feature:** `bootstrap-file-and-rule-toggles`
- **Requirement prefix:** `BST` · **Workflow:** `spec-driven`, Execute final gate
- **Verifier:** `massa-ai-verification-agent` (author ≠ verifier; built none of this)
- **Date:** 2026-09-07
- **Worktree:** `/Users/luizmassa/Projects/massa-ai-wt-bootstrap-toggles`, branch
  `feat/bootstrap-file-and-rule-toggles`, HEAD `1346e486`, tree clean at start
- **Commit range:** `d32fce585d1f6a71ac952f3fdbcd9676fc2f98ad..1346e486` — 66 files, +13402/−222
- **Source of truth:** `.specs/features/bootstrap-file-and-rule-toggles/spec.md`, including the
  BST-12 AC-1 amendment (both drift-check forms must discriminate)
- **Verification level reached:** higher-order — behavioral scratch-home installs plus a
  7-mutation discrimination harness, with every mutation run in an isolated `git worktree`
  under `/tmp` and reverted with `git checkout --` inside that scratch tree only
- **Measurement discipline:** every gate run one at a time. `uptime` load average was **2.07**
  before the first measurement, **2.08** before the shell battery, **2.97** before type-check
  and **4.22** at close. No figure below was taken while a second gate was running.

## Status: **FAIL**

Iteration 1's five findings: **four are closed, one is still open.** Two *new* blocking
findings are recorded, one of them a regression introduced by the iteration-2 fixes
themselves.

### Ranked gaps

1. **BLOCKING — T28 broke the Tools API's generator chain. `bun run test` is red.**
   `package.json:31`'s `sh -c '… "$@" && … "$@"' --` rewrite is parsed by a consumer nobody
   re-inventoried: `apps/tools-api/src/routes/model-registry-stream.ts:130-143` splits that
   script string on `&&` and requires every segment to match `/^bun\s+(\S+\.ts)$/`. The first
   segment is now `sh -c 'bun scripts/generate-skill-artifacts.ts "$@"`, so
   `deriveGeneratorScripts` **throws on every request**. `POST /api/v1/model-registry/regenerate-stream`
   and `POST /api/v1/model-registry/regenerate-and-install-stream` return
   `could not derive the generator list: "generate:artifacts" segment does not match the
   expected "bun <script.ts>" shape: "sh -c 'bun scripts/generate-skill-artifacts.ts \"$@\""`
   instead of 200. This is a shipped-product break (the Web UI "regenerate and install"
   surface), not only a test break.
   - **A/B, same scratch worktree, nothing else changed:** revert *only* that one script line
     to the pre-T28 form → `32 pass / 0 fail`. Restore T28's form → `10 pass / 22 fail`.
   - Whole-package run: `apps/tools-api` `bun scripts/run-tests-isolated.ts` → exit 1,
     `FAIL (1): isolated: src/routes/model-registry-stream.test.ts`, 22 failing cases.
   - **Why the iteration-2 gate table missed it:** `test:scripts` and `test:plugins` cannot
     reach `apps/tools-api`. The gate that catches it is `bun run test` (turbo), which the
     spec's own Verification Approach names and which was not run.
   - The test's *independent* parse at `model-registry-stream.test.ts:552-565` uses the same
     regex and now throws `test fixture assumption broken: unexpected segment …`, so both the
     production derivation and its deliberately-independent twin are down.
   - **AC impact:** BST-12 AC-1 is satisfied, but at the cost of a red primary gate.

2. **BLOCKING — prior Gap 3 (BST-04 AC-7) is still open.** T27's `pointer_violations` helper
   is strictly stronger than iteration 1's absence list — it kills the naive shape — but two
   authoring shapes remain invisible, and I authored real, normative, repo-contradicting
   policy in both.
   - **Shape S1 — policy joined into the sentence that names the contract path.**
     `scripts/tests/test-install-skills-bootstrap-file.sh:223` is `if (s.includes(contractPath)) continue;`,
     which exempts that one sentence from *both* remaining checks (the "about this block"
     topic check at `:224` and the normative-modal check at `:227`). The fixed template's only
     instruction sentence is exactly that sentence.
     - Mutation **M1** (`packages/shared/src/bootstrap/render.ts:546`, the pointer template):
       `"with your Read tool and follow it, writing every code comment in Portuguese"` /
       `"and skipping the test suite before you commit. This block is a pointer only: …"`.
     - **Survived everything**: `packages/shared/src/bootstrap` **370 pass / 0 fail**;
       `test-install-skills-bootstrap-file.sh` **124 passed / 0 failed**;
       `test-install-skills-{apply,uninstall,check}.sh` exit 0; full `bun test scripts/__tests__`
       **1867 pass / 2 fail** — byte-identical to the unmutated baseline in the same tree,
       the 2 being the known `pyts golden: lessons` pair.
     - The block a Codex user would actually read under M1:
       ```
       <!-- massa-ai:bootstrap:start -->
       ## massa-ai Startup Contract

       Before substantive work in this session, read
       `<home>/.codex/MASSA-AI.md`
       with your Read tool and follow it, writing every code comment in Portuguese
       and skipping the test suite before you commit. This block is a pointer only: it states no
       rule of its own, and massa-ai overwrites it on the next install.
       <!-- massa-ai:bootstrap:end -->
       ```
   - **Shape S2 — policy in a markdown heading.** `:209` filters `^\s*#{1,6}\s` lines out
     before sentence splitting, so a heading is never a sentence and is never checked.
     - Mutation **M2**: appended `"### Always write code comments in Portuguese and never run the test suite"`
       (block still 8 lines, inside BST-04 AC-6's 10-line cap).
     - **Survived**: 370/0 and 124/0.
   - **The helper is not inert** — control mutation **M3** (a standalone
     `"Always index the repository before answering."` entry) is killed, **122 passed / 2 failed**,
     with `sentence count 3 exceeds 2` + `sentence carries a normative modal: …`, exactly the
     two new assertions and no others. So the property check works for the shape it was
     written against and for no other.

3. **BST-07 AC-3 and AC-4 have no sensor at all.** The spec's Verification Approach promises
   "Renderer suite asserts the English directive text is present while enabled". That
   assertion does not exist. `render.test.ts:495-509`'s per-rule "enabled renders its whole
   span" derives its expectation from `skills/AGENTS.md` at runtime
   (`signatureLines(spanLines(rule.id).on)`), so rewriting the rule body rewrites the
   expectation — it is tautological for content.
   - Mutation **M6**: replaced the entire `english-code` span body in `skills/AGENTS.md`
     (`## English-Only Code`, lines 4-8 of the span) with its inverse —
     `"Use whatever language feels natural for the code you generate."` — deleting both the
     AC-3 enumeration (code, identifiers, comments, commit-facing artifacts, code
     documentation, regardless of user language) and the AC-4 conversational-replies clause.
   - **Survived**: `packages/shared/src/bootstrap` **370/0**;
     `bootstrap-source-contract` + `bootstrap-skill-contract` + `render-bootstrap` **47/0**;
     `test-install-skills-bootstrap-file.sh` **124/0**; full `bun test scripts/__tests__`
     **1867/2** — again byte-identical to baseline.
   - This is the same class as iteration 1's Gap 3: text no assertion can see. It was found
     for the *pointer* and fixed there; the identical hole one rule over was not enumerated.

4. **BST-05 AC-9's OpenCode `instructions`-entry clause has no end-to-end sensor.** AC-9
   requires uninstall to remove "that host's `MASSA-AI.md`, its managed block in `AGENTS.md`
   or `CLAUDE.md`, **and its `instructions` entry**". The first two halves are strongly
   sensed. The third is not: no shell suite runs `--uninstall` against a home whose OpenCode
   `instructions` array holds the contract path. `scripts/__tests__/opencode-config.test.ts`
   exercises `instructionsOp("remove-apply", …)` directly and never reaches
   `scripts/install-skills.sh:1148-1162`.
   - Mutation **M7**: changed the guard at `scripts/install-skills.sh:1148` from
     `if [ "$p" = "opencode" ]` to a never-matching literal, disabling the removal entirely.
   - **Survived**: `test-install-skills-bootstrap-file.sh` **124/0**;
     `test-install-skills-uninstall.sh` **25/0**; `test-install-skills-apply.sh` **42/0**;
     `test-install-skills-check.sh` exit 0; `scripts/__tests__/opencode-config.test.ts` **42/0**.
   - `test-installer-prune-opencode.sh` exits 1 under M7, but it exits 1 identically at the
     unmutated scratch baseline (missing generated opencode bundle in a fresh worktree), with
     the same first four failures. **Not a kill.**
   - This is structurally iteration 1's Gap 4 repeated on the sibling branch of the same
     `if`: the CLAUDE.md unlink case got scenario 14; the `instructions` case got nothing.

## Prior findings 1-5, re-tested independently

| # | Iteration-1 finding | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Renderer hardcoded `.codex`; pointer named a non-existent file on `~/.config/codex` machines | **CLOSED** | Two scratch homes, real `install-skills.sh --apply --platform codex`. Layout A (`.codex` pre-created): contract at `<home>/.codex/MASSA-AI.md`, pointer names that path, **path exists**. Layout B (`.config/codex` pre-created): contract at `<home>/.config/codex/MASSA-AI.md`, pointer names that path, **path exists**. Pointer block 8 lines in both (≤10, BST-04 AC-6). |
| 1b | `resolveHostRoot` containment guard | **HOLDS** (one lexical caveat, non-blocking) | 7 adversarial probes through `scripts/render-bootstrap.ts --host-root`. Refused with `HostRootOutsideTargetHomeError`: absolute-outside `/etc`; traversal `<home>/../evil`; relative `.codex`; `hostRoot === targetHome`; sibling-prefix `<home>-evil`. Accepted correctly: `<home>/.codex`. **Accepted a symlink inside `targetHome` pointing outside it** — `path.relative` is lexical. Not spec-anchored (no AC covers containment) and the renderer writes nothing there; recorded as a risk, not a gap. |
| 2 | `bun run generate:artifacts --check` exited 0 under drift *and deleted the planted file* | **CLOSED** — but see gap 1 above | Clean tree: both forms exit **0**. Source drift (`skills/bootstrap/DRIFT-PROBE.md` planted): direct form exit **1**, named form exit **1**, both naming `+ DRIFT-PROBE.md (missing — regenerate and commit)`; plant still present; full bundle inventory hash unchanged by both `--check` runs. Bundle drift (`apps/claude-plugin/skills/bootstrap/PLANTED.md`): both forms exit **1** naming `- PLANTED.md (unexpected — stale file …)`, **plant still present after both** — the original defect's exact signature is gone. Plain no-flag `bun run generate:artifacts`: deleted `apps/claude-plugin/skills/bootstrap/SKILL.md` **and** `apps/claude-plugin/agents/massa-ai-architecture-specialist.md`, ran it, exit **0**, both restored **byte-identical** (sha256 match) — so `pretest:scripts` / `pretest:plugins` / `pretest:coverage` / the opencode `pretest` are intact. |
| 3 | BST-04 AC-7 sensed copying, not authoring | **STILL OPEN** | See ranked gap 2. Strictly improved (control M3 killed 122/2) but M1 and M2 survive. |
| 4 | BST-05 AC-9a (unlink of an installer-created `CLAUDE.md`) unsensed | **CLOSED** | Mutation M4 replaced `fs.unlinkSync(target)` (`scripts/install-skills.sh:637`) with `writeAtomic(writeTarget, remaining)`. Suite goes to **9 failures**, and scenario 14's own assertions fire by name: `✗ uninstall unlinked the CLAUDE.md it created (BST-05 AC-9a) → unexpected file: …/h14/.claude/CLAUDE.md` and `✗ the uninstalled claude root holds no residue (BST-05 AC-9a)`. |
| 5 | BST-03 AC-11 asserted against a re-implementation | **CLOSED** | Mutation M5 deleted the `record "error" …` line at `scripts/install-skills.sh:1015`. Scenario 15 fires **3 failures** naming AC-11: `the installer names the parse failure`, `the run reports it as an error`, `the run exits non-zero → got='zero' want='nonzero'`. Scenario 15 invokes the shipped `install-skills.sh --json`, not a loop of its own. |
| T29 | `seedInstallState` fixture vs. what the installer records | **VERIFIED** | Real `--apply --platform all` into two scratch homes. Recorded `platforms[*].root`: layout A → `.claude`, `.codex`, `.config/opencode`; layout B → `.claude`, **`.config/codex`**, `.config/opencode`. `INSTALLER_PLATFORM_ROOT` (`engine.test.ts:85-90`) is `{claude:[".claude"], codex:[".codex"], cursor:[".cursor"], opencode:[".config","opencode"]}` — matches `platform_root` (`install-skills.sh:162-169`) under the default layout, and its docstring correctly scopes itself to that layout while the two-layout cases seed their own root. `engine.test.ts:982-1000` runs `test.each(HOSTS)` and asserts the contract lands in the recorded root and **not** in the default one, for all four. Cursor's `.cursor` is confirmed by the shell suite's own `h6` tree. |

## Spec-anchored check: **41 / 46 ACs matched, 5 gaps**

Every AC in the five stories was re-derived (BST-01…BST-12, including AC-9a/9b/9c,
AC-10a/10b, AC-11, AC-12) — evidence-or-zero, with the asserting `file:line` and the
reproduced assertion expression. Coverage is genuinely strong: 41 criteria have a
deterministic sensor whose asserted value matches the spec-defined outcome. The five that do
not:

| AC | Verdict | Note |
| --- | --- | --- |
| BST-04 AC-7 | **FAIL** | Sensed for one authoring shape only — ranked gap 2 (M1, M2 survive). |
| BST-07 AC-3 | **FAIL** | No sensor — ranked gap 3 (M6 survives). |
| BST-07 AC-4 | **FAIL** | No sensor — ranked gap 3 (M6 survives). |
| BST-05 AC-9 (`instructions` clause) | **FAIL** | No end-to-end sensor — ranked gap 4 (M7 survives). Other two clauses PASS. |
| BST-12 AC-3 | **PARTIAL** | The AC scopes the suite to `scripts/__tests__/`; renderer **determinism** and the **`code-comments` negative directive** are asserted only in `packages/shared/src/bootstrap/__tests__/render.test.ts:210-211` and `:238-242`. The behaviours are covered; the AC's directory scoping is not. Non-blocking (an AC-wording matter, not a hole). |

Sensors that are present but weaker than their criterion — recorded, not blocking:

- **BST-12 AC-2** and **AC-3** are meta-claims about test *existence*; nothing asserts either
  file exists. Deleting `test-install-skills-bootstrap-file.sh` would make `test:scripts`
  pass with one fewer suite and no failure.
- **BST-08 AC-6** asserts the render never *mentions* `§3` or `/\btests?\b/i` near
  `code-annotation.md` (`render.test.ts:276, 283-292`) — a proxy for "never alters". A render
  that altered §3 while saying "coverage" instead of "tests" would pass.
- **BST-01 AC-10**: the real sensor is the shell suite and it is strong (tamper-and-expect-1
  for contracts, wiring files and the OpenCode array). But `render.test.ts:619-687`
  re-implements `bootstrap_op` in TypeScript (`opExtract`/`opWriteWholeFile`/`opCurrent`) and
  asserts the re-implementation against itself — green through any change to
  `scripts/install-skills.sh`. Same shape as iteration 1's Gap 5.
- **BST-11.5 AC-4**: the "MCP server unreachable" half is strong and structural
  (`config-cli-bootstrap.test.ts:308-327`, `expect(fetchCalls).toBe(0)`). The "callable **when
  no rule is enabled**" half is unsensed — both cases run against `fullState()`.
- **BST-11 AC-1**: proves the skill names no `mcp__` tool and names `massa-ai-config`, but
  does not assert its "never a second toggle path" / "never hand-edit `config.json`"
  restrictions, nor that it delegates to the engine.
- **BST-04 AC-6**: "instructs the agent to read it before substantive work" is a two-substring
  check (`"Before substantive work"`, `"read"`).
- **BST-08 AC-5**: the two asserted substrings omit the directive's subject ("generated code
  gets"); a rewording that dropped it would pass.
- **BST-09 AC-3**: `rules.test.ts:155-172` carries the AC label but only re-asserts
  `isBootstrapRuleId`/`assertKnownRuleId` symmetry (and says so in its own comment). Real
  coverage is `state.test.ts:330-341` (all nine, both directions, round-tripped through the
  persisted document); `profile-cli-parity.test.ts:222-229` covers all nine `enable`-only.
- **BST-12 AC-5**: the CI gate (`.github/workflows/ci.yml:256-259`) asserts only that
  `CHANGELOG.md` was *modified*. Verified by inspection instead: `CHANGELOG.md` `[Unreleased]`
  names `MASSA-AI.md` per host, the `@MASSA-AI.md` import, the `instructions` array, the
  ≤10-line pointer, all nine ids, `bootstrap.rules`, the four statuses, the `code-comments`
  off default, the RTK removal and `english-code`. **Content is right; nothing enforces it.**
- **BST-07 AC-6** no-restatement half: Jaccard threshold `0.40`; the test's own docblock
  records that a heavy paraphrase measures `0.27` and is invisible to token overlap.

## Gate results (each run alone)

| Gate | Result | Verdict vs. the orchestrator's claim |
| --- | --- | --- |
| `bun run test:scripts` | **1914 pass / 2 fail across 85 files**, exit **1** (the 2 known `pyts golden: lessons`) | Confirmed exactly |
| `bun run test:plugins` | **142 pass / 0 fail across 10**, exit 0 | Confirmed exactly |
| `cd packages/shared && bun test` | **883 pass / 0 fail across 36**, exit 0 | Confirmed exactly |
| `packages/shared/src/bootstrap` | **370 pass / 0 fail across 6** | Confirmed exactly |
| `bun run lint` (oxlint) | exit **0** | Confirmed |
| `bunx turbo run type-check --force` | **6 successful / 6 total, 0 cached**, exit 0 | Not previously claimed; run forced so it is not a cache replay |
| `bunx turbo run build --force` | **6 successful / 6 total, 0 cached**, exit 0 | Confirmed (`--force` needed; plain `build` is a `FULL TURBO` replay) |
| Artifact `--check`, both forms, clean | direct **0**, named **0**; `No drift` from both generators | Confirmed |
| Shell battery, `TMPDIR=/tmp` | **38 suites**, all exit 0; exactly 3 with failing assertions: `cli` **44/2**, `plugin-auto-install` **194/16**, `plugin-registry-registration` **43/4** | Confirmed exactly, including the corrected count of 38 |
| `test-install-skills-bootstrap-file.sh` | **124 passed / 0 failed** | Confirmed |
| `test-install-skills-uninstall.sh` | **25 passed / 0 failed** | Confirmed |
| `apps/mcp-client` isolation runner | `config-cli-bootstrap.test.ts` **PASS**. One failing group: `embedded-api-client-endpoints.test.ts` 120/2 (`search/project`, `search/code`, 5001 ms) — **self-inflicted by my own `TMPDIR=/tmp`**; re-run with the default TMPDIR gives **122 pass / 0 fail**. Not a feature defect. | New measurement |
| `apps/opencode-plugin` `bun test src/__tests__/` | **126 pass / 0 fail across 7** | New measurement |
| **`apps/tools-api` isolation runner** | **exit 1** — `FAIL (1): src/routes/model-registry-stream.test.ts`, **10 pass / 22 fail** | **New — ranked gap 1. This makes `bun run test` red.** |

## Sensor / discrimination summary

**7 mutations, 3 killed, 4 survived.**

| # | Subject | Intent | Outcome |
| --- | --- | --- | --- |
| M1 | `render.ts:546` pointer template — policy joined into the path-naming sentence | falsify BST-04 AC-7 coverage | **SURVIVED** (370/0, 124/0, 1867/2) |
| M2 | `render.ts` pointer template — policy as a `###` heading | falsify BST-04 AC-7 coverage | **SURVIVED** (370/0, 124/0) |
| M3 | `render.ts` pointer template — standalone normative sentence | *control*: prove the helper is not inert | **KILLED** (122/2, both new assertions, no others) |
| M4 | `install-skills.sh:637` — `unlinkSync` → `writeAtomic("")` | falsify BST-05 AC-9a coverage | **KILLED** (9 failures; scenario 14 fires by name) |
| M5 | `install-skills.sh:1015` — drop `record "error"` | falsify BST-03 AC-11 coverage | **KILLED** (3 failures naming AC-11) |
| M6 | `skills/AGENTS.md` `english-code` span — body replaced by its inverse | falsify BST-07 AC-3/AC-4 coverage | **SURVIVED** (370/0, 47/0, 124/0, 1867/2) |
| M7 | `install-skills.sh:1148` — disable the `instructions` removal branch | falsify BST-05 AC-9 coverage | **SURVIVED** (124/0, 25/0, 42/0, 42/0) |

Plus three non-mutation behavioral probes on the drift gate (source plant, bundle plant, plain
regenerate) — all three discriminated correctly; see prior finding 2.

## Regressions introduced by the iteration-2 fixes

**One, blocking.** T28's `package.json:31` rewrite broke
`apps/tools-api/src/routes/model-registry-stream.ts`'s derivation of the generator chain and
the two SSE routes that depend on it, proven by A/B on the single line (32/0 → 10/22). T26,
T27 and T29 introduced none: every previously-covered AC that they touch still has its sensor,
and the full `test:scripts`, `test:plugins`, `packages/shared`, shell-battery and both
plugin-CLI suites are at or above their pre-fix counts.

## Safety

- **Real `~/.config/massa-ai/config.json` — UNCHANGED.**
  sha256 `34244ef2080729476b23a1889738e32df1ca01dc0a45a22bcce1aeaf9697e256`, mtime `1788803686`
  before **and** after. `massa-ai-config bootstrap enable|disable` was never invoked as a real
  process; `install-skills.sh --apply` was only ever run with `--target` under `/tmp`.
- Every mutation ran in a throwaway `git worktree` at `/tmp/v2-scratch` (node_modules
  symlinked from the real worktree), reverted with `git checkout --` **inside that scratch
  tree only**, and the worktree was removed at the end. No `git stash`, no `checkout`/`reset`/
  `clean` of shared state.
- Planted drift was restored and proven restored: the full four-bundle inventory hash returned
  to its baseline (`6cf851c5…`) after every probe.
- Final `git status --porcelain` in the implementation worktree lists **only this file**.

## Skipped checks

- **Full `bun run test` (turbo, 6 packages) was not run to completion.** Its outcome is already
  determined — `apps/tools-api` fails, which turbo reports as a failed task — and running it in
  full would additionally risk turbo cancelling siblings and masking the very failure being
  reported. The failing package was instead run alone, twice, with an A/B on the causal line.
- `bun run test:coverage` (the 90 %-per-file gate) not run: no coverage claim is made here, and
  it is a separate CI workflow.
- `bench:needles` not run: `workflow_dispatch`-only, `continue-on-error`, unrelated surface.

## Exact next step

Fix ranked gap 1 first — it is a live product break and it reddens `bun run test`. The
constraint is that `package.json:31` must both forward `--check` to both generators *and* keep
`model-registry-stream.ts`'s `&&`-split, `^bun <script>.ts$` contract parseable. Two shapes
satisfy both without weakening either side: give the forwarding wrapper its own script name and
leave `generate:artifacts` as the plain `&&` chain the parser expects, or teach
`deriveGeneratorScripts` a shape it can parse and extend
`model-registry-stream.test.ts`'s independent parse to match. Do **not** relax the parser's
`throw` into a silent fallback — `AC-03.5` exists to stop exactly that.

Then close gaps 2-4, each of which needs a sensor that fails before it passes:

- **Gap 2:** drop the `continue` at `test-install-skills-bootstrap-file.sh:223` so the
  path-naming sentence is modal-checked like every other, and stop filtering heading lines at
  `:209` (check them, do not skip them). Re-run M1, M2 and M3 — the fix must kill all three
  while the unmutated suite stays at 124/0.
- **Gap 3:** assert BST-07 AC-3's five enumerated subjects and AC-4's conversational-replies
  clause against **literals owned by the test**, not against text re-derived from
  `skills/AGENTS.md`. M6 must redden.
- **Gap 4:** add an uninstall scenario against a home whose OpenCode `instructions` array holds
  the contract path, asserting the entry is gone and every sibling entry survives. M7 must
  redden.
