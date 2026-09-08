# Validation — Bootstrap File And Rule Toggles (final gate, iteration 5)

- **Feature:** `bootstrap-file-and-rule-toggles`
- **Workflow / session:** `spec-driven` · `spec-bootstrap-file-and-rule-toggles`
- **Verifier:** `massa-ai-verification-agent` (author ≠ verifier)
- **Worktree:** `/Users/luizmassa/Projects/massa-ai-wt-bootstrap-toggles`
- **Branch / HEAD:** `feat/bootstrap-file-and-rule-toggles` @ `ca15dcb9`
- **Commit range:** `d32fce58..HEAD`
- **Date:** 2026-09-07

This replaces the iteration-1 FAIL committed at `57559ef4`.

---

## Status: **FAIL**

The feature's **behaviour** is correct everywhere it could be measured: all 45 of the
46 acceptance criteria outside `BST-12 AC-2` are matched with evidence, every gate is
green at the orchestrator's stated figures, and no iteration introduced a regression.

The single failing criterion is **BST-12 AC-2** — the shell suite's completeness as a
sensor. Two independent mutations that break shipped behaviour survive **every gate in
the repository**: all 38 shell suites and all 1918 `test:scripts` tests return
byte-identical results with and without them. Nothing here is a defect in what ships;
both are holes in what guards it.

### Ranked gaps

#### 1. The pointer property check still passes authored, contract-inverting policy — BST-12 AC-2 (sensor for BST-04 AC-7)

`scripts/tests/test-install-skills-bootstrap-file.sh:234-294` (`pointer_violations`).

T32's two named bypasses are **genuinely closed** — I re-ran both as controls and both
are caught. But the property admits two further classes, and I confirmed the first of
each end-to-end by editing the shipped template at
`packages/shared/src/bootstrap/render.ts:540-549` and running the real suites.

**Class A — policy written entirely inside `POINTER_LEXICON`.** The 32 whitelisted words
(`sh:260-265`) are themselves sufficient to author a directive. Appending to the
path-naming sentence keeps sentence count at 2, keeps `naming.length` at 1, trips no
`MODAL`, and yields zero foreign words:

    with your Read tool and follow no massa-ai rule in it.

The rendered Codex/Cursor pointer then tells the agent to read the contract and follow
**none** of it. Measured at HEAD with only that line changed:

| Gate | Result |
| --- | --- |
| `test-install-skills-bootstrap-file.sh` | **124 passed, 0 failed**, exit 0 |
| `packages/shared/src/bootstrap/__tests__/` | **370 pass, 0 fail** |
| `scripts/__tests__/{render-bootstrap,bootstrap-source-contract,bootstrap-skill-contract}` | **49 pass, 0 fail** |

An affirmative variant (`and follow only the massa-ai install rule in it`) passes
identically.

**Class B — policy in any non-Latin script, with no vocabulary restriction at all.**
`foreignWords` (`sh:266-271`) tokenises with `/[a-z0-9][a-z0-9-]*/g` after
`.toLowerCase()`. Text in Chinese, Japanese, Korean, Cyrillic, Arabic or Hebrew produces
**no tokens**, so `foreign` is empty for arbitrary content. `MODAL` likewise cannot match
it. Confirmed end-to-end with a Chinese policy sentence appended to the path sentence:
shell **124/0 exit 0**, and **409 pass / 0 fail** across the shared + scripts bootstrap
suites.

The same text placed in the single permitted heading also passes, because headings are
checked only for `MODAL` and foreign words — the topic check at `sh:280` applies to
sentences only, never to headings.

**Fixes, in order of value.** Class B is one character class:

    /[\p{L}\p{N}][\p{L}\p{N}-]*/gu

which makes every non-ASCII word a foreign word and closes both of its shapes. Class A is
inherent to a whitelist whose vocabulary is drawn from the pointer's own domain; closing
it needs the path-naming sentence pinned to a template rather than merely budgeted.
Accepting Class A as a documented limit is defensible — accepting Class B is not, because
it costs one regex and admits unlimited content.

#### 2. Uninstall can leave Codex's `AGENTS.md` pointer block behind, unsensed — BST-12 AC-2 (sensor for BST-05 AC-9)

Scenario 6 (`sh:458-489`) fingerprints `$H6/.claude` and sweeps `$H6/.cursor` with
`residue_files`, but **no assertion covers `$H6/.codex/AGENTS.md`**. Cursor has the
equivalent check; Codex does not.

Mutation: guard the `AGENTS.md` removal in `scripts/install-skills.sh:1130` with
`&& [ "$p" != "codex" ]`. Observed behaviour after `--apply` then `--uninstall` on a
scratch home:

    .codex/AGENTS.md   STILL EXISTS, 8 lines, marker pairs: 1
    .cursor/AGENTS.md  removed

so the mutation is live and observable — a stale pointer block naming a `MASSA-AI.md`
that uninstall has just deleted. Detection, measured:

| Population | Baseline | Mutated |
| --- | --- | --- |
| all 38 `scripts/tests/*.sh` | 3 known failures | **identical, same 3** |
| `bun run test:scripts` | 1916 pass / 2 fail / 85 files | **1916 pass / 2 fail / 85 files** |

`diff` of the two 38-line exit-code tables is empty. **Fix:** fingerprint `$H6/.codex`
in scenario 6 the way `.cursor` already is.

---

## Spec-anchored check: **45 / 46 ACs matched, 1 gap**

Both amended criteria were re-derived against their amended text.

### BST-12 AC-1 — both drift-check forms discriminate (amended)

`package.json:31` is now
`sh -c 'bun scripts/generate-skill-artifacts.ts "$@" && bun scripts/generate-subagent-artifacts.ts "$@"' --`.
Measured under a scratch `XDG_CONFIG_HOME`, against two drift shapes:

| Drift | `bun scripts/generate-skill-artifacts.ts --check` | `bun run generate:artifacts --check` |
| --- | --- | --- |
| none (baseline) | exit 0 | exit 0 |
| edited `skills/bootstrap/SKILL.md` | **exit 1** | **exit 1** |
| unmanaged `skills/bootstrap/STRAY.md` | **exit 1** | **exit 1** |

Critically, the named form **no longer repairs the drift it reports**: the bundle copy's
sha was byte-identical before and after that run. The no-flag regenerate path exits 0 and
leaves `--check` clean. **AC-1 met.**

### BST-12 AC-3 — five subjects, both real homes (amended)

| Subject | Sensor |
| --- | --- |
| rule set | `packages/shared/src/bootstrap/__tests__/rules.test.ts:40,53` — `expect(new Set(BOOTSTRAP_RULE_IDS)).toEqual(new Set(EXPECTED_IDS));` |
| defaults | `rules.test.ts:97,108` — `expect(disabled).toEqual(["code-comments"]);` |
| determinism | `render.test.ts:210-211,225` — `expect(second.contract).toBe(first.contract);` with a non-triviality guard |
| unknown-id handling | `rules.test.ts:192` `expect(err.unknownIds).toEqual(["typo-one","typo-two"]);`; `state.test.ts:159`; `render.test.ts:784` |
| `code-comments` negative directive | `render.test.ts:239-241` — `expect(contract).toContain("overriding §1 (API Doc Block) and §2 (Rationale Comment)");` on rendered output |

**AC-3 met** as amended.

### Remaining criteria

BST-01 (AC-1,2,10), BST-02 (AC-3,4), BST-03 (AC-5,11), BST-04 (AC-6,7), BST-05
(AC-8,9,9a,9b,9c), BST-06 (AC-1,2), BST-07 (AC-3,4,6), BST-08 (AC-2,5,6 + the
`code-annotation.md` clause), BST-09 (AC-1,3,8), BST-10 (AC-4,7,9,10,10a,10b,11,12),
BST-11 (AC-1..7), BST-12 (AC-1,3,4,5) — **all matched with `file:line` evidence.**

Three worth naming because they were previously contested:

- **BST-03 AC-11** is asserted against the **shipped installer**, not a re-implementation:
  `sh:910-911` runs `bash "$INSTALLER" --apply --platform all --target "$H15" …` and
  asserts the named error, the non-zero exit, the config's byte-identity, and that no
  backup was written.
- **BST-05 AC-9c** asserts the backup is **named in the report** — both the console text
  (`test-install-skills-uninstall.sh:186`) and the JSON report (`:196`) — plus the
  negative direction, so an unconditional "retained:" line cannot satisfy it.
- **BST-01 AC-10** is non-vacuous: `sh:692-696` proves `--check` can go red on contract
  drift, `:730` on wiring drift, `:738` on the `instructions` array.

---

## Prior findings, adjudicated

| # | Finding | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Codex `.codex` vs `.config/codex` | **closed** | Applied to a home with only `~/.config/codex`; contract written there, none at `~/.codex`, and the pointer names `<home>/.config/codex/MASSA-AI.md` |
| 2 | `generate:artifacts --check` non-discriminating | **closed** | Both forms exit 1 on two drift shapes; named form no longer repairs; no-flag path clean (table above) |
| 3 | Pointer sensed copying, not authoring | **OPEN** | T32's two shapes are closed; two new classes survive — ranked gap 1 |
| 4 | BST-05 AC-9a unsensed | **closed** | `sh:880-889` asserts the precondition (`outside_block` is empty) *before* asserting the unlink, so it cannot pass for the wrong reason |
| 5 | BST-03 AC-11 against a re-implementation | **closed** | `sh:910-911` runs the shipped installer |
| 6 | BST-07 AC-3/AC-4 body unsensed (iteration 2) | **closed** | Gutting the rule body in `skills/AGENTS.md` reddens **2 named tests** — `BST-07 AC-3: names every English-only subject…` and `BST-07 AC-4: states that it does not change the agent's conversational replies` |
| 7 | BST-05 AC-9 `instructions` removal unsensed (iteration 2) | **closed** | Disabling the removal branch reddens **2 named assertions** — `uninstall removed the contract from instructions (BST-05 AC-9)` got `1` want `0`, and `the emptied instructions array is deleted, not left as [] (BST-05 AC-9)` |

---

## New attacks on the pointer check

| # | Shape | Outcome |
| --- | --- | --- |
| B | plain English policy appended to the path sentence (T32's S1) | **caught** — 1 violation, names the foreign words |
| C | policy as a second markdown heading (T32's S2) | **caught** — 3 violations, first is `heading count 2 exceeds 1` |
| D | lexicon-only negation appended to the path sentence | **passes** — confirmed end-to-end |
| E | lexicon-only affirmative policy appended | **passes** |
| F | non-ASCII policy appended to the path sentence | **passes** — confirmed end-to-end |
| G | non-ASCII policy inside the single allowed heading | **passes** |

The two controls were run through the sensor's node script extracted byte-identically
from the suite (`sed -n '236,292p'`), and D and F were additionally confirmed by editing
`render.ts` and running the real suites.

---

## Gate results

Every figure below was taken with the tree clean, one gate at a time.

| Gate | Result | Matches orchestrator |
| --- | --- | --- |
| `bunx turbo run test --force` (sandbox=none, DATABASE_URL, scratch XDG) | **exit 0 · 12 successful / 12 total · 0 cached · 0 `(fail)`** | yes |
| `bun run test:scripts` | 1916 pass / 2 fail / 85 files (exit 1, the 2 known `pyts golden: lessons`) | yes |
| `bun run test:plugins` | 142 / 0 across 10 | yes |
| `cd apps/web-ui && bun test` | 778 / 0 across 15 | yes |
| `cd packages/shared && bun test` | 883 / 0 across 36 | yes |
| `bun run lint` | exit 0 | yes |
| `bun scripts/generate-skill-artifacts.ts --check` | exit 0 | yes |
| shell battery, all 38 suites, `TMPDIR=/tmp` | 3 known pre-existing failures only | yes |
| `test-install-skills-bootstrap-file.sh` | 124 / 0 | yes |
| `test-install-skills-uninstall.sh` | 31 / 0 | yes |
| `test-install-skills-apply.sh` | 42 / 0 | yes |

**One correction to the record, and it is about measurement, not code.** My first
`turbo run test --force` returned **exit 1, 8/12, 6 `(fail)`** — three
`EmbeddedApiClient POST endpoints` cases at exactly 5001.0 ms, each printed twice. That
reading was **load, not code**: `apps/mcp-client/src/__tests__/embedded-api-client-endpoints.test.ts`
is untouched by this feature (`git log d32fce58..HEAD --` on it is empty) and already
carries both documented seams — a scratch `XDG_CONFIG_HOME` at line 28 set before the
dynamic core import at line 32, and `_setLlmEnabledForTesting(false)` at line 37. Run
alone it is **122 pass / 0 fail in 1266 ms**. Re-run on a quiet host, the full gate is
exit 0 / 12 of 12. Quoted figures are from the quiet-host run.

---

## Sensor / discrimination summary

**11 mutations · 6 killed · 5 survived.**

Killed: plain-English pointer policy; heading pointer policy; gutted `english-code` body;
disabled `instructions` removal; `SKILL.md` drift (both `--check` forms); unmanaged
planted file (both `--check` forms).

Survived: pointer classes A and B (4 shapes, ranked gap 1) and the Codex `AGENTS.md`
uninstall skip (ranked gap 2).

---

## Regressions introduced by any iteration: none

Iteration 3's two regressions are fixed and hold: `apps/web-ui` is back to **778/0**, and
`apps/tools-api` passes inside the green 12-of-12 turbo run. I audited every non-test
source file the range touches outside `packages/shared/src/bootstrap/` and `scripts/`;
each has a mechanical reason tied to this feature, and **no assertion was deleted or
loosened in a way that costs detection**. The one helper rewrite in
`model-registry-stream.test.ts:566-574` replaces a per-segment `throw` with a
zero-population guard while adding 6 net-new negative rows — the parser change itself is
strictly widening and stays anchored.

---

## Observation (not a gap, no AC): the portal's new `bootstrap` section is writable

`apps/web-ui/src/static/views/config-sections.ts:233-242` documents the field as
"read-only inspection of the persisted override map", but the config UI has **no
read-only mechanism at all** — the field-type union (`:23`) has no such flag and `json`
renders as a plain `<textarea>` (`config.ts:114`). `bootstrap` is also the only new config
subtree with no branch in `validatePartial`
(`packages/shared/src/config/config-writer.ts`, 13 branches, none for `bootstrap`).

A portal write therefore persists `bootstrap.rules` without re-rendering any host — a
second mutation path that spec assumption A12 did not intend. Blast radius is bounded:
`resolveBootstrapState` reports-and-ignores non-boolean entries. No AC covers this, so it
does not affect the verdict; recommended as a follow-up (validator branch, and either a
`readonly` field flag or an honest guide sentence).

---

## Safety

- Real config `~/.config/massa-ai/config.json` — sha
  `34244ef2080729476b23a1889738e32df1ca01dc0a45a22bcce1aeaf9697e256`, mtime `1788803686`,
  **before and after: SAME**.
- No `massa-ai-config bootstrap enable|disable` was ever run as a real process; every
  installer run used `--target` under `/tmp`.
- Every mutation was backed up to `/tmp` first and restored by `cp`, never by git. All
  four restored files hash-verified against their backups; `git status --porcelain` holds
  only this file.
- The suite's own scenario 9 (`the developer's real home was never touched`) passed in
  every run.

---

## Skipped checks

- `bun run type-check` — subsumed: `turbo run build --force` performs a real `tsc` emit
  for `packages/core` and `packages/shared`, and the 12-of-12 turbo run is green.
- `bun run test:coverage` — not a gate for this feature and not in the artifact's gate
  table; it is a separate blocking workflow on its own dedicated database.
- Live-API integration suites — opt-in, never in the default aggregate.

---

## Exact next step

Two edits, both local, then re-run this gate:

1. **`scripts/tests/test-install-skills-bootstrap-file.sh:268`** — change the tokeniser in
   `foreignWords` to `/[\p{L}\p{N}][\p{L}\p{N}-]*/gu`, closing pointer class B. Record the
   Class A lexicon limit in the function's header comment as a known, accepted bound, or
   pin the path-naming sentence to a template to close it too.
2. **`scripts/tests/test-install-skills-bootstrap-file.sh`, scenario 6** — add a
   `residue_files "$H6/.codex"` (or a `tree_fingerprint_no_backups` of `$H6/.codex`)
   assertion so the Codex `AGENTS.md` pointer removal is covered as Cursor's already is.

Each fix has an observed-red available: re-apply the mutation described in its gap and
confirm the suite now fails naming it.
