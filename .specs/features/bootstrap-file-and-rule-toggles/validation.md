# Validation — Bootstrap File And Rule Toggles

- **Feature:** `bootstrap-file-and-rule-toggles`
- **Requirement prefix:** `BST` · **Workflow:** `spec-driven`, Execute final gate
- **Verifier:** `massa-ai-verification-agent` (author ≠ verifier)
- **Date:** 2026-09-07
- **Worktree:** `/Users/luizmassa/Projects/massa-ai-wt-bootstrap-toggles`, branch `feat/bootstrap-file-and-rule-toggles`
- **Commit range:** `d32fce585d1f6a71ac952f3fdbcd9676fc2f98ad..ca132b91701ba2be269ad4c944e30ea5bf46589f` — 50 commits, 62 files, +12049/−221
- **Source of truth:** `.specs/features/bootstrap-file-and-rule-toggles/spec.md`
- **Verification level reached:** behavioral + higher-order (scratch-home end-to-end installs, discrimination mutation sensor)

## Status: **FAIL**

Two findings block a clean pass. Neither is a test-quality nit; both are reproduced end to end.

1. **BST-04 AC-6 and BST-10 AC-10 fail on the supported `~/.config/codex` layout.** The
   contract file lands in the right place, but the pointer block written into
   `~/.config/codex/AGENTS.md` names `~/.codex/MASSA-AI.md` — a file that does not exist —
   and the toggle engine writes and probes the same wrong path. Every gate stays green.
2. **BST-12 AC-1's named command does not discriminate.** `bun run generate:artifacts --check`
   exits **0** in exactly the drift state the criterion says must exit non-zero.

Everything else in the spec is covered by located, value-matching, discriminating evidence.
The feature's engineering quality is high — 7 of 9 injected faults were killed, several by
sensors that only exist because this feature added them.

---

## Real-config integrity

Standing safety rule 3. `~/.config/massa-ai/config.json`:

| | sha256 | mtime |
| --- | --- | --- |
| Before | `34244ef2080729476b23a1889738e32df1ca01dc0a45a22bcce1aeaf9697e256` | `1788803686` |
| After | `34244ef2080729476b23a1889738e32df1ca01dc0a45a22bcce1aeaf9697e256` | `1788803686` |

**UNCHANGED.** `massa-ai-config bootstrap enable|disable` was never invoked as a real
process. Every installer run used `--target` under `/tmp`. Every mutation was restored from
a `/tmp` copy and hash-verified; `git status --porcelain` was empty before the sensor and is
empty after it.

---

## Gate results (re-measured by the verifier, not inherited)

| Gate | Verifier result | Orchestrator baseline | Verdict |
| --- | --- | --- | --- |
| `bun run test:scripts` | 1909 pass / 2 fail across 84 files, exit 1 | 1909/2, 84 files | **matches** |
| `bun run test:plugins` | 142 / 0 across 10 files, exit 0 | 142/0, 10 files | **matches** |
| `bun run lint` (oxlint) | exit 0 | exit 0 | **matches** |
| `bunx turbo run type-check --force` | 6 successful / 6 total, 0 cached, exit 0 | 6/6 | **matches** |
| `bunx turbo run build --force` | 6 successful / 6 total, **0 cached**, exit 0 | 6/6 | **matches** (re-run forced: the unforced run replays FULL TURBO from cache and is not a measurement) |
| `packages/shared` → `bun test` | 860 / 0 across 36 files | 860/0, 36 files | **matches** |
| `apps/opencode-plugin` → `bun test src/__tests__/` | 126 / 0 across 7 files | 126/0, 7 files | **matches** |
| `apps/mcp-client` isolation runner | **exit 1**, 2 failed groups with the real config; **13/13 groups, exit 0** only under a scratch `XDG_CONFIG_HOME` | "13 groups, exit 0" | **baseline understated the environment** — see below |
| `bun scripts/generate-skill-artifacts.ts --check` (scratch `XDG_CONFIG_HOME`) | exit 0, "No drift" | exit 0 | **matches** |
| Full shell battery, `TMPDIR=/tmp` | **38** suites, 3 failures — `test-install-skills-cli.sh`, `test-plugin-auto-install.sh`, `test-plugin-registry-registration.sh` | "39-suite battery", same 3 failures | **failures match; the count is 38, not 39** |

The 2 `pyts golden: lessons` failures and the 3 shell failures are the known-and-accepted
pre-existing set and are not counted against this feature.

### mcp-client runner — correction to the baseline environment

The baseline table names only `DATABASE_URL`. That is not sufficient on a machine with a real
`~/.config/massa-ai/config.json`. Measured here:

- with `DATABASE_URL` alone → **exit 1**, 2 failed groups
  (`embedded-api-client-endpoints.test.ts`, `index.test.ts`), 8 failures, every one a 5001 ms
  / 15003 ms timeout — the documented live-provider class in `CLAUDE.md`;
- adding `XDG_CONFIG_HOME=$(mktemp -d)` → **13/13 groups, exit 0**.

Both failing files are **byte-identical to the base commit** (`git diff --quiet <base>..HEAD`
over both paths returns clean), so the failures are environmental and pre-existing, not this
feature's residue. Recorded because the baseline as written would have a later reader believe
the runner is green on this machine without the scratch config dir; it is not.

### Shell suite count

`ls scripts/tests/*.sh | wc -l` returns **38** at HEAD and **37** at the base commit
(`git ls-tree <base> scripts/tests/ --name-only | grep -c '\.sh$'`). This feature adds exactly
one (`test-install-skills-bootstrap-file.sh`). The "39" in the baseline is off by one.

---

## Spec-anchored coverage — evidence or zero

All paths relative to the worktree root. "Value match" means the asserted *value* was checked
against the spec-defined outcome, not merely that an assertion exists.

### P1 — Contract lives in MASSA-AI.md and each host loads it (BST-01..BST-05)

| AC | Requirement | Evidence | Value match |
| --- | --- | --- | --- |
| 1 | `MASSA-AI.md` written per host | `scripts/tests/test-install-skills-bootstrap-file.sh:230` — `assert_file "$HOST MASSA-AI.md written (BST-01 AC-1)" "$CONTRACT"`, looped over all four hosts (`:225-237`) | PASS |
| 2 | Delimited by the existing marker pair | `…bootstrap-file.sh:231-234` — `assert_eq … "$(head -n1 "$CONTRACT")" "$BOOTSTRAP_START"` / `"$(tail -n1 …)" "$BOOTSTRAP_END"`; markers read from the installer's own literals (`:46-47`). Corroborated `scripts/__tests__/render-bootstrap.test.ts:286-288` | PASS |
| 3 | `@MASSA-AI.md` block into `~/.claude/CLAUDE.md`, created when absent | `…bootstrap-file.sh:244-246` — `assert_file "CLAUDE.md created when absent"` + `assert_contains "$(managed_block …)" "@MASSA-AI.md"` | PASS |
| 4 | Content outside the markers byte-identical | `…bootstrap-file.sh:252-260`. Fixture is `printf '\n\n# My memory\n\nBe brief.\n\n\n'` — **leading and trailing blank lines** — compared by `sha_prefix` rather than `cat` (command substitution would strip the trailing newlines this AC is about) | PASS |
| 5 | OpenCode `instructions` entry, no duplicate on re-run | `…bootstrap-file.sh:274-280` — filter-count asserted `1` before and `1` after a second apply; the user's own entry asserted surviving | PASS |
| 6 | Pointer block ≤10 lines naming that host's `MASSA-AI.md` | `…bootstrap-file.sh:287-290`; `scripts/__tests__/render-bootstrap.test.ts:302-304` | **FAIL on the `~/.config/codex` layout — see Finding 1** |
| 7 | Pointer carries no policy text of its own | `…bootstrap-file.sh:294-299` — three `assert_not_contains` on named policy headings; `render-bootstrap.test.ts:305`; `packages/shared/src/bootstrap/__tests__/render.test.ts:406-409` asserts no source rule-signature line appears in the pointer | PARTIAL — see mutation M4 |
| 8 | Migration: no marker pair holding policy text left in `AGENTS.md` on claude/opencode | `…bootstrap-file.sh:315-319` — `assert_not_contains … "$BOOTSTRAP_START"` plus a `sha_prefix` user-bytes check, run for both named hosts | PASS |
| 9 | Uninstall removes every artifact, leaves every other line unchanged | `…bootstrap-file.sh:336-341` — whole-tree fingerprint plus per-file sha256 on `AGENTS.md` and `CLAUDE.md`, fixture with leading and trailing blank lines | PASS |
| 9a | Unlink rather than leave an empty file | `…bootstrap-file.sh:349-353` — `residue_files` empty + a `-size -1c` sweep across all four host roots | PASS behaviorally; **sensor gap** — see Gap 3 |
| 9b | `MASSA-AI.md` unlinked, never written empty | `…bootstrap-file.sh:345-348` — `assert_no_file` for all four hosts | PASS |
| 9c | Backup left in place **and** named in the report | `scripts/tests/test-install-skills-uninstall.sh:152-166` — `assert_file` on the backup, byte-identity of its contents, `assert_contains "$OUT9" "$BAK9"` on stdout **and** `assert_contains "$JSON9" "$BAK9"` on `--json`, plus a negative-direction guard at `:170-188` | PASS, both halves |
| 10 | `--check` exits 0 after a clean `--apply` | `…bootstrap-file.sh:546-549` — `assert_eq … "$RC12" "0"`, with the negative direction at `:551-626` | PASS |
| 11 | Unparseable OpenCode config: named error, no partial write | `scripts/__tests__/opencode-config.test.ts:491-524` — `expect(errors[0]).toMatch(/not valid JSON/)`, full-content equality `readFileSync(bad) === badBefore`, and `expect(backupsIn(badDir)).toEqual([])` | PASS at the unit layer; see Gap 4 |

The round-trip fingerprint excludes exactly `*.massa-ai.bak-*` and nothing else
(`…bootstrap-file.sh:72-84`, `find … -name '*.massa-ai.bak-*' -prune -o -print`), matching the
spec's own Success Criterion verbatim.

### P1 — Every bootstrap rule is individually switchable (BST-08..BST-10)

| AC | Evidence | Value match |
| --- | --- | --- |
| 1 — exactly 9 ids | `packages/shared/src/bootstrap/__tests__/rules.test.ts:39-41` — `expect(new Set(BOOTSTRAP_RULE_IDS)).toEqual(new Set(EXPECTED_IDS))`, set-shaped, not a count | PASS |
| 2 — all default on except `code-comments` | `rules.test.ts:95-100` per-id table + `:106-109` `expect(disabled).toEqual(["code-comments"])` | PASS |
| 3 — every id switchable both ways, none protected | `rules.test.ts:160-171` (per id) and `state.test.ts:138-144` (driven both directions per id) | PASS |
| 4 — disabled rule's block omitted | `render.test.ts:441-456`, looped over all 9 rules against source-derived signature lines | PASS |
| 5 — negative directive when `code-comments` off | `render.test.ts:233-263` — asserts `"no API doc blocks and no"` and `"overriding §1 (API Doc Block) and §2 (Rationale Comment)"` present, and the positive text absent. Source at `skills/AGENTS.md:300-302` | PASS |
| 6 — §3 test-coverage requirement never altered | `render.test.ts:265-295`, asserted in **three** states (on, off, all-off): `expect(new Set(contract.match(/§\d+/g))).toEqual(new Set(["§1","§2"]))` and paragraph-scoped `expect(paragraph).not.toMatch(/\btests?\b/i)` | PASS (exceeds the AC) |
| 7 — byte-identical re-render | `render.test.ts:207-213` — `expect(second.contract).toBe(first.contract)` across defaults/all-on/all-off | PASS |
| 8 — unknown id: non-zero, names id, lists valid ids, no state change | `rules.test.ts:124-131`; `state.test.ts:294-310` — `expect(vfs.get(CONFIG_PATH)).toBe(before)`; CLI layer `apps/mcp-client/src/__tests__/config-cli-bootstrap.test.ts:143-144` (both mutating seams at zero calls) | PASS |
| 9 — all-off body states every rule disabled | `render.test.ts:350-352`. Verifier re-render confirms: all-off contract is 1474 chars and contains `Every massa-ai bootstrap rule is disabled` | PASS |
| 10 — every recorded host re-rendered, four outcome classes | `report.test.ts:37-39` (status set equality); `engine.test.ts:276-296` looped over all 4 hosts | **FAIL on the `~/.config/codex` layout — see Finding 1** |
| 10a — `written-not-wired` names the `--apply` remedy | `engine.test.ts:286-296` + `format.test.ts:91-102` — `expect(lines.some(l => l.endsWith(": written"))).toBe(false)` | PASS |
| 10b — unreadable state: defaults, named warning, `config.json` **not** written | `engine.test.ts:496-534` — `expect(fs.readFileSync(bootstrapStateFilePath(home),"utf-8")).toBe(malformed)`; CLI layer `render-bootstrap.test.ts:203-215` | PASS |
| 11 — state under `bootstrap.rules` | `state.test.ts:224-230` — `expect(onDisk()).toEqual({ bootstrap: { rules: { "code-comments": true } } })` | PASS |
| 12 — unknown persisted id ignored, reported once | `state.test.ts:155-165` — `expect(ignoredStateKeys.filter(k => k === "no-such-rule")).toHaveLength(1)`; engine `:576-587`; formatter `format.test.ts:186-206` | PASS |

### P1 — RTK out, English-only and comment rules in (BST-06, BST-07, BST-08)

| AC | Evidence | Value match |
| --- | --- | --- |
| 1 — source carries no RTK section or command | `scripts/__tests__/bootstrap-source-contract.test.ts:168-176` — `expect(contexts).toEqual([])` over `/rtk/gi`. Verifier re-measured independently: `perl -ne '$c++ while /rtk/gi'` over `skills/AGENTS.md` returns **0** | PASS |
| 2 — rendered contract has zero `rtk` in every toggle state | `render.test.ts:301-322`, 21 generated states, case-insensitive. Verifier re-rendered defaults / all-on / all-off directly: **0, 0, 0** | PASS (see note) |
| 3/4 — English-only directive + the "does not change replies" sentence | `skills/AGENTS.md:282-290`; asserted indirectly through the per-rule signature mechanism (`render.test.ts:438-461`), not by literal spec-wording match | PASS, indirect |
| 5 — `code-annotation.md` gates §1/§2, §3 unconditional | `bootstrap-source-contract.test.ts:267-309` — sentence-scan requiring one sentence containing `§1`, `§2`, `` `code-comments` ``, `enabled`, `off`, and a second containing `§3`, `outside`, `unconditional` | PASS |
| 6 — `naming-standards.md` §Language cites, does not restate | `bootstrap-source-contract.test.ts:393-406` (citation substring + still-normative check) and `:408-436` (pairwise Jaccard, threshold `0.40`) | PASS |

**Note on AC-2.** The 21-state loop is vacuous against the real source, which has zero `rtk`
occurrences to begin with; the removal *mechanism* is proven separately by
`render.test.ts:310-321`, which plants a literal `rtk` inside a synthetic disabled span and
asserts both directions. The criterion is met and the mechanism is sensed — just not by the
loop that appears to sense it.

**On T23's Jaccard question.** The ownership half is carried by the citation assertion
(`:393-406`), which is a literal-substring plus still-normative check, not by the similarity
score. That is adequate: the failure mode the AC guards ("restates the wider contract") is
caught by the threshold for near-copies, and the "cites" half is caught by the substring. The
docblock's own admission — a 0.27 heavy paraphrase is invisible — is a real residual risk but
it is a risk to *style*, not to the criterion as written.

### P1 — A host command drives the toggles (BST-11, BST-11.5)

| AC | Evidence | Value match |
| --- | --- | --- |
| 1 — the skill drives the one engine, no second path | `scripts/__tests__/bootstrap-skill-contract.test.ts:78-105` — the skill names no MCP-tool-shaped identifier and states positively that none exists; both CLIs are thin fronts over `@massa-ai/shared` (`apps/mcp-client/src/config-cli.ts:391-486`) | PASS |
| 2 — `list`, `show`, `enable <id>`, `disable <id>` | `bootstrap-skill-contract.test.ts:107`; `config-cli-bootstrap.test.ts:92`, `:156`, `:331` | PASS |
| 3 — `list` names id, default, state, description | `packages/shared/src/bootstrap/format.ts:56-62` renders all four fields per row from `BOOTSTRAP_RULES` in registry order; `format.test.ts` + `config-cli-bootstrap.test.ts:92-155` | PASS |
| 4 — CLI works with no rule enabled and the MCP server unreachable | `config-cli-bootstrap.test.ts:292-330`; nothing on the `case "bootstrap"` path opens a socket | PASS |
| 5 — restart notice | `config-cli-bootstrap.test.ts:180` — `expect(r.out).toContain("A host session restart is required for the change to take effect.")`; derived, never caller-set (`report.ts:127-140`) | PASS |
| 6 — no host installed → report and exit 0, no `MASSA-AI.md` | `config-cli-bootstrap.test.ts:204-214` — `expect(r.out).toContain("bootstrap: no host installed")` and `not.toContain("restart is required")`; engine returns before it even needs a source (`engine.ts:176-178`) | PASS |
| 7 — `bootstrap` skill in all four plugin bundles | Verified on disk: `apps/{claude,codex,cursor,opencode}-plugin/skills/bootstrap/SKILL.md` all present. `scripts/__tests__/skill-artifact-parity.test.ts:109-125` — byte-identity per host **and** membership in the generator's managed roots, not only its emit list | PASS |

### P2 — The new surfaces are guarded (BST-12)

| AC | Evidence | Value match |
| --- | --- | --- |
| 1 — `bun run generate:artifacts --check` non-zero until regenerated | **FAILS as written** — mutation M1 below | **FAIL** |
| 2 — shell suite in `scripts/tests/` for BST-01..04 + BST-05 reversal | `scripts/tests/test-install-skills-bootstrap-file.sh`, 729 lines, **108 assertions, 108 passed** | PASS |
| 3 — `scripts/__tests__/` suite for rule set, defaults, determinism, unknown id, negative directive | `scripts/__tests__/render-bootstrap.test.ts`, `bootstrap-source-contract.test.ts`, `bootstrap-skill-contract.test.ts` + the six `packages/shared/src/bootstrap/__tests__/` suites | PASS |
| 4 — registry/skill id divergence reddens naming the ids | Killed in **both** directions — mutations M2 and M3 below | PASS |
| 5 — `CHANGELOG.md` `[Unreleased]` entry | Present, three `### Added` bullets plus `### Changed`, describing the delivery change | PASS |

---

## Discrimination sensor

9 behaviour-level faults injected in the real tree, each restored from a `/tmp` copy and
sha256-verified; `git status --porcelain` empty before and after. `git checkout`, `git stash`,
`git reset` and `git clean` were never used.

| # | Fault injected | Target AC | Suite run | Verdict |
| --- | --- | --- | --- | --- |
| M1 | Appended an unmanaged line to `skills/bootstrap/SKILL.md` | BST-12 AC-1 | `bun scripts/generate-skill-artifacts.ts --check` → **exit 1** ("Drift detected"); `bun run generate:artifacts --check` → **exit 0** | **SPLIT — corrected form killed, spec-named form SURVIVED** |
| M2 | Deleted the `english-code` bullet from the skill's documented id list | BST-12 AC-4 | `scripts/__tests__/bootstrap-skill-contract.test.ts` → 8 pass / **2 fail**, output names `english-code` | KILLED |
| M3 | Removed `english-code` from `BOOTSTRAP_RULE_IDS` and `BOOTSTRAP_RULES` | BST-12 AC-4 | same suite → 8 pass / **2 fail**, names `english-code` | KILLED |
| M4 | Inserted a policy sentence ("Always run the plan-challenge gate before coding.") into `renderPointer` | BST-04 AC-7 | `packages/shared` render 175/0; `scripts/__tests__` 35/0; shell suite **108/0** | **SURVIVED** |
| M5 | `isWired()` → `return true` | BST-10 AC-10a | `packages/shared/src/bootstrap/__tests__/` → 338 pass / **9 fail** | KILLED |
| M6 | Removed `instructionsOp`'s push-if-absent guard | BST-03 AC-5 | `opencode-config.test.ts` 40/**2 fail**; shell suite **exit 1** (`a clean --apply leaves --check at exit 0` → got 1 want 0) | KILLED at both layers |
| M7 | Dropped `record "retained"` — backup still left in place, no longer named | BST-05 AC-9c | `test-install-skills-bootstrap-file.sh` → **108/0, survived**; `test-install-skills-uninstall.sh` → **exit 1**, both stdout and `--json` assertions fire | KILLED (by the uninstall suite, not the new one) |
| M8 | Disabled the unlink branch so `removeBlock`'s `""` is written | BST-05 AC-9a/9b | shell suite **exit 1**, residue sweep names four leftover files | KILLED |
| M9 | Reintroduced `appendBlock`'s blank separator line | T13 SPEC_DEVIATION / BST-05 AC-9 | shell suite **exit 1** on both the tree fingerprint and the `CLAUDE.md` sha | KILLED |

**9 injected · 7 killed · 2 survived** (M1's spec-named form, M4).

M9 is the decisive one for the recorded SPEC_DEVIATION: dropping the blank separator to make
the marker pair exactly invertible is **validated**, and the sensor that proves it fires on a
fixture with both leading and trailing blank lines.

M7 is worth recording for a maintainer: AC-9c lives in `test-install-skills-uninstall.sh`, not
in the new `test-install-skills-bootstrap-file.sh`. A future edit that runs only the new suite
would not see an AC-9c regression.

Two further behaviour probes, not mutations:

- **P1 — `~/.config/codex` end-to-end install.** Reproduced Finding 1 (below).
- **P2 — AC-9a for an installer-created `CLAUDE.md`.** Fresh scratch home, `--apply --platform
  claude`, then `--uninstall`: both `CLAUDE.md` and `MASSA-AI.md` are unlinked and no 0-byte
  file remains. The **behaviour is correct**; no fixture in the suite exercises this specific
  file, so it is unguarded (Gap 3).

---

## Findings

### Finding 1 — BLOCKING. The renderer hardcodes `.codex`, so the Codex fallback layout ships a pointer to a file that does not exist

`packages/shared/src/bootstrap/render.ts:135-140`:

```ts
const HOST_CONFIG_DIR: Readonly<Record<Host, readonly string[]>> = {
  claude: [".claude"],
  codex: [".codex"],
  cursor: [".cursor"],
  opencode: [".config", "opencode"],
};
```

Its own docblock says this map mirrors `installer_host_config_dir` — **the map PC-B3 rejected
by name**, for exactly the reason that materialises here. `scripts/install-skills.sh:153-169`
resolves `CODEX_HOME` as `~/.codex` when it exists, else `~/.config/codex`, and
`contract_path()` (`:705`) uses `platform_root`. So the contract file goes to the right place
while the pointer text and the toggle engine both go to `.codex` unconditionally.

**Reproduced.** Scratch home with `.config/codex` present and no `.codex`, then
`bash scripts/install-skills.sh --apply --platform codex --target <scratch> --yes`:

```
/tmp/v-codex-fallback/home/.config/codex/MASSA-AI.md      <- contract, correct
/tmp/v-codex-fallback/home/.config/codex/AGENTS.md        <- pointer, wrong content:

  Before substantive work in this session, read
  `/tmp/v-codex-fallback/home/.codex/MASSA-AI.md`
```

That path does not exist. **BST-04 AC-6** requires the pointer to name "the absolute path of
that host's `MASSA-AI.md`".

The toggle engine has the same defect, and it is worse there because it also writes:
`applyBootstrapState({ targetHome: <scratch>, dryRun: true })` against the same home reports

```
codex: written-not-wired: contract written, but codex has no artifact that loads it —
expected /tmp/v-codex-fallback/home/.codex/MASSA-AI.md in
/tmp/v-codex-fallback/home/.codex/AGENTS.md; run scripts/install-skills.sh --apply
```

In a non-dry run that writes a stray `~/.codex/MASSA-AI.md`, never updates the contract the
host actually loads, and exits non-zero (`written-not-wired` is not in `CLEAN_STATUSES`). So
on this layout **every toggle is a no-op that reports failure** — breaking **BST-10 AC-10**
and the story's own Independent Test.

`install-state.json` records the correct root (`platforms.codex.root =
"<home>/.config/codex"`) and `PlatformRecord.root` is part of the type
(`packages/shared/src/profile-switch/state.ts:34-35`), but
`packages/shared/src/bootstrap/engine.ts` never reads it — it derives every path from
`targetHome` plus the hardcoded map.

**Why no gate catches it.** `--apply` and `--check` both render through the same function, so
they agree with each other and disagree only with reality: `bash scripts/install-skills.sh
--check --platform codex --target /tmp/v-codex-fallback/home` exits **0**. A pre-existing
sensor for this exact layout exists — `scripts/tests/test-install-skills-cli.sh:137-141`,
"Scenario 10: `~/.config/codex` is used when `~/.codex` is absent" — but it asserts only that
`AGENTS.md` exists in the fallback root and not in the primary one. It was never extended to
the pointer's *contents* or to `MASSA-AI.md`'s location, so it stays green over this defect.

No test anywhere exercises the fallback layout against the new criteria: `grep -rln
"config/codex"` over `scripts/tests/`, `scripts/__tests__/`, `packages/shared/src` and every
`__tests__` directory under `apps/` returns exactly one file, that pre-existing scenario.

**Remedy (not applied — verification is read-only).** Either thread the per-host root through
`renderBootstrap`/`applyBootstrapState` (the installer already knows it; the engine can read
`platforms[host].root`), or replicate the `~/.codex` → `~/.config/codex` resolution in
`HOST_CONFIG_DIR`. Extend `test-install-skills-cli.sh:137-141` to assert the pointer names the
fallback path, and add an engine case for a `.config/codex` home.

### Finding 2 — BLOCKING (spec-precision). BST-12 AC-1 names a command that cannot fail

`package.json:31` defines `generate:artifacts` as
`bun scripts/generate-skill-artifacts.ts && bun scripts/generate-subagent-artifacts.ts`, so
`bun run generate:artifacts --check` appends the flag to the **end of the chain**: the first
generator runs *without* `--check` and repairs the drift, and only the second one checks.

Measured under mutation M1 (an unmanaged line appended to `skills/bootstrap/SKILL.md`):

| Command | Exit |
| --- | --- |
| `bun scripts/generate-skill-artifacts.ts --check` | **1** — "Drift detected" |
| `bun run generate:artifacts --check` | **0** — "No drift" |

BST-12 AC-1 says the second form "SHALL exit non-zero until the bundles are regenerated". It
exits 0 in exactly that state. The spec's own Verification Approach table repeats the same
command. The underlying `&&`-chain is pre-existing, but this feature adopted the broken form as
an acceptance criterion; the criterion is therefore unsatisfiable as written, and the guarantee
it claims does not exist for anyone who follows it.

The **substance** of the guarantee is delivered — the direct generator invocation kills M1, and
`scripts/__tests__/skill-artifact-parity.test.ts:60-125` (reached by `bun run test:scripts`,
which CI runs) covers `skills/bootstrap/` including a stale-extra-file case. Only the named
command is wrong. Fix by amending the AC to `bun scripts/generate-skill-artifacts.ts --check`,
or by making `generate:artifacts` forward its arguments to both generators.

### Gap 3 — non-blocking. No fixture guards the installer-created `CLAUDE.md` unlink

AC-9a's "a file this installer created, whose managed block was its only content" is proven for
`MASSA-AI.md` (AC-9b, all four hosts) and, incidentally, for the codex/cursor `AGENTS.md`
through the `-size -1c` sweep. The `CLAUDE.md` case has no fixture: the only scenario that
creates `CLAUDE.md` from absent (`…bootstrap-file.sh:244-246`) never uninstalls, and the
scenario that uninstalls (`H6`) gives `CLAUDE.md` pre-existing content, so it is never empty
after removal. Verified by hand that the behaviour is correct; it is simply unsensed.

### Gap 4 — non-blocking. BST-03 AC-11's multi-host continuation is proven only against a re-implementation

`scripts/__tests__/opencode-config.test.ts:502-514` proves the named error and the no-partial-
write half rigorously, but it does so with a hand-written `try/catch/continue` loop calling
`resolveConfigPath`/`parseJsonc`/`instructionsOp` directly. It never runs the shipped caller at
`scripts/install-skills.sh:1003-1011`, and `grep -rn "could not be parsed" scripts/tests/*.sh
scripts/__tests__/*.ts` returns zero. So "sibling hosts still run" is asserted about a copy of
the intended shape rather than about the bash that ships.

### Gap 5 — non-blocking. BST-04 AC-7 senses copying, not authoring

Mutation M4 added a genuine policy sentence to the pointer template and 318 assertions across
three suites stayed green. The existing sensors check that the pointer contains none of three
named policy headings and no source rule-signature line, and that it stays within 10 lines —
i.e. they detect *duplication of the contract*, which is AC-7's stated rationale. They do not
detect *newly authored* policy. Defensible as a reading of the AC; recorded so it is a
decision rather than an assumption.

---

## PC-* adjudications

| Marker | Claim | Verdict |
| --- | --- | --- |
| **PC-B1** | The module had no export surface; T12 added a barrel plus a root re-export with no new `exports` subpath | **UPHELD.** All 8 bootstrap symbols both CLIs import (`applyBootstrapState`, `assertKnownRuleId`, `bootstrapReportSucceeded`, `bootstrapStateFilePath`, `formatBootstrapInventory`, `formatBootstrapReport`, `resolveBootstrapState`, `setBootstrapRuleEnabled`) are present in `packages/shared/src/index.ts:121-165`, and a runtime import of the **built** `packages/shared/dist/index.js` resolves every one (`missing: []`). `@massa-ai/shared/config` still resolves `getConfigPath` and `ConfigParseError`. |
| **PC-B2** | T14's drift branch placed *inside* the plugin-owned guard | **UPHELD.** The branch sits at `scripts/install-skills.sh:1274-1328`, inside `if [ "$owner" != "plugin" ]` (opened at `:1221`, closed at `:1329`). Its premise — no `apps/*/install.sh` writes a bootstrap block — survives T21: the four installer diffs add only the `bootstrap` **skill** to their copy/state/removal lists and touch no marker pair. A host with no state record has `owner=""`, so it is still checked, matching the pre-existing skill-drift branch's polarity. |
| **PC-B3** | `platform_root` over `installer_host_config_dir`, because the latter hardcodes `.codex` | **UPHELD FOR THE INSTALLER, OVERTURNED FOR THE FEATURE.** `contract_path` (`:705`) correctly honours the `~/.config/codex` fallback. But `packages/shared/src/bootstrap/render.ts:135-140` adopts the rejected hardcoded map, and it is what produces the pointer text and every toggle-engine path. The exact failure PC-B3 names — "a silently unwired host" — ships, one layer over. See Finding 1. |
| **PC-B5** | OpenCode wiring via `instructionsOp`, not `writeConfig`; plan modes non-writing | **UPHELD.** `scripts/lib/opencode-config.cjs:290` returns `{result:"change", backupPath:null, notes}` before the `writeConfig` call at `:292`, and `nextDocument` never mutates `cfg`. `writeConfig` at `:174` does take exactly two parameters, so the third argument would have been dropped as claimed. |
| **PC-Q2** | All four statuses reachable and rendered; AC-10b warning via `onWarning` | **UPHELD.** All four are produced by `applyHost` (`engine.ts:301`, `:318`, `:333`) and reached in tests: `written`/`written-not-wired` `engine.test.ts:276-296`, `skipped` `:598`/`:753`, `failed` `:631`. All four render with their reason: `format.test.ts:86-88`, `:104-123`. The warning routes through `onWarning` and is asserted with `config.json` byte-unchanged (`engine.test.ts:496-534`). |
| **PC-G1** | Two unrunnable gate commands corrected | **UPHELD.** `cd apps/opencode-plugin && bun test src/__tests__/` → 126/0 exit 0 (bare `bun test` there collects the gitignored bundle); `cd apps/mcp-client && bun test src/__tests__/config-cli-bootstrap.test.ts` is the right form, since `run-tests-isolated.ts --filter=…` is not supported in that package. Both corrections are right. |

### Recorded SPEC_DEVIATIONs

| Deviation | Verdict |
| --- | --- |
| T13 dropped `appendBlock`'s blank separator to make the marker pair exactly invertible | **JUSTIFIED AND SENSED.** M9 reintroduced the separator and the round-trip fingerprint plus the `CLAUDE.md` sha both fired, on a fixture with leading *and* trailing blank lines. |
| T17/T18 — `--target` scopes the render, not the persisted preference (FU-5) | **NAMED, NOT SILENT.** `apps/mcp-client/src/config-cli.ts:458-466` (and its opencode twin) compares `bootstrapStateFilePath(targetHome)` against `getConfigPath()` and, when they differ, prints a stderr `Warning:` naming **both** paths and the `XDG_CONFIG_HOME` remedy. `--target` also requires `--yes` (`:436-443`), refused before either writer. Acceptable as a documented follow-up. |
| T21 widened to four installers | **NECESSARY AND COMPLETE.** All four `apps/*/install.sh` update all three lists (copy loop, `install-state.json` skills array, removal loop); cursor additionally adds `bootstrap` to the command-skill exclusion in the same commit that teaches the generator to emit it. The generator's authoritative list is `scripts/generate-skill-artifacts.ts:144` and its managed roots at `:231`; `skill-artifact-parity.test.ts:117-125` asserts membership in the managed roots, not only the emit list. All four bundles present on disk. |
| T23's no-duplication Jaccard at `0.40` | **ADEQUATE FOR THE AC.** The ownership half rests on the citation assertion (`bootstrap-source-contract.test.ts:393-406`), which is a literal-substring plus still-normative check, not on the score. The docblock's 0.27-paraphrase blind spot is a style risk, not an AC risk. |

### On the deliberately out-of-scope items

FU-1 (the dist branch of the render ladder does not load under node, because
`packages/shared/src/bootstrap/{state,render,engine}.ts` use extensionless relative
specifiers) is correctly out of scope for the *write set*, and the ladder turns the failure
into a named error rather than a default render — which is the right behaviour. It is worth
saying plainly, though, that the consequence is that **BST-01 delivery does not work on a
node-only machine at all**, and `scripts/install-harness.sh:189-202` says so in a comment
rather than in any user-facing output. That is a delivery limitation a release note should
carry, not a defect of this feature.

---

## Verification checklist

- [x] Every acceptance criterion traced to `file:line` with the assertion expression reproduced
- [x] Asserted values compared against the spec-defined outcome, not merely "an assertion exists"
- [x] Absence searched for before being concluded; the searches are shown
- [x] Discrimination mutations injected at behaviour level, weighted toward single-assertion criteria and the shell suites
- [x] Every mutation restored from a `/tmp` copy and sha256-verified; `git status --porcelain` empty before and after
- [x] `git stash` / `git checkout` / `git reset` / `git clean` never used
- [x] Real `~/.config/massa-ai/config.json` sha256 and mtime unchanged
- [x] No installer run against a real home; every run used `--target` under `/tmp`
- [x] `massa-ai-config bootstrap enable|disable` never invoked as a real process
- [x] Orchestrator baselines re-measured rather than inherited; three corrections recorded

## Next step

Fix Finding 1 (thread the per-host root through the renderer and the engine, or teach
`HOST_CONFIG_DIR` the `~/.config/codex` fallback) and extend
`scripts/tests/test-install-skills-cli.sh:137-141` to assert the pointer's contents and the
contract's location on that layout. Then amend BST-12 AC-1 to name
`bun scripts/generate-skill-artifacts.ts --check`, or make `generate:artifacts` forward its
arguments to both generators. Gaps 3-5 are optional hardening and do not block.
