# Marketplace Directory-Source Switching — Validation

Contract: `spec.md` · Design: `design.md` · Tasks: `tasks.md`.

## T5 — per-host measurement (MDS-04) and the remote-source experiment (MDS-05)

Author-written measurement section. The independent verification verdict is a
separate section below, appended by a verifier who did not write this feature.

Measured 2026-08-13 on the reporting machine, against a repo roster of **18**
charters enumerated from `skills/agents/`.

### MDS-04 — what each host loads vs what the engine writes

| Host | `installRoute` | Engine's write target | Host's load path | Same tree? |
| --- | --- | --- | --- | --- |
| claude | `marketplace` | **was** the version-pinned cache; **now** the directory source's `apps/claude-plugin/` | `apps/claude-plugin/` (directory-source marketplace) | **was NO — this feature's Defect A**; now yes |
| codex | `file` | `~/.codex/agents` | `~/.codex/agents` | yes — no defect of this class |
| opencode | `file` | `~/.config/opencode/agents` | `~/.config/opencode/agents` | yes — no defect of this class |
| cursor | `bridge` | none — `resolveHostLayout` skips Cursor uniformly | `~/.cursor/agents` | n/a — never switched, every tier resolves to `inherit` |

"No defect of this class" is a measured finding here, not an assumption: the
file-route hosts have no marketplace indirection at all, so the wrong-target
failure mode is structurally absent for them.

### A separate defect this measurement found — installed rosters are stale

Counting files was nearly enough to miss it. Three hosts report a plausible
file count that is actually **one missing agent plus one retired orphan**:

| Location | files | missing | orphaned |
| --- | --- | --- | --- |
| `~/.codex/agents` | 18 | `massa-ai-designer` | `massa-ai-handoff-writer` |
| `~/.config/opencode/agents` | 18 | `massa-ai-designer` | `massa-ai-handoff-writer` |
| `~/.cursor/agents` | 17 | `massa-ai-designer` | — |
| `apps/claude-plugin/agents` (repo) | 18 | — | — |

Every **installed variant root** is stale the same way — the trees a profile
switch copies *from*:

| Variant root | `balanced` profile | missing |
| --- | --- | --- |
| `~/.codex/massa-ai/agent-profiles` | 17 | `massa-ai-designer` |
| `~/.config/opencode/plugins/massa-ai/agent-profiles` | 17 | `massa-ai-designer` |
| `~/.claude/plugins/cache/.../1.48.0/agent-profiles` | 17 | `massa-ai-designer` |
| `apps/claude-plugin/agent-profiles` (repo) | **18** | — |

Two distinct findings, neither of which is this feature's defect class:

1. **Nothing has refreshed the installed trees since the roster changed.** The
   mechanism to do it exists and targets the right roots for the file-route
   hosts (`syncGeneratedVariants` → `switchProfile`, both invoked by the
   regenerate stream). This is staleness from non-invocation, not a wrong
   target. It should resolve itself the first time Save & Apply runs after this
   branch lands — and that is a prediction to verify, not a claim.
2. **`massa-ai-handoff-writer` is a retired agent still installed.** It is
   absent from `skills/agents/` and from every repo bundle, yet still present in
   two hosts' active dirs. The generators prune their managed roots before
   emitting; the **installers do not appear to prune removed agents from a
   host's active directory**. Out of scope here — recorded as a finding with its
   evidence rather than patched inside a feature about write-target resolution.

### MDS-05 — remote-source load path: unmeasured, with the reason

| Marketplace | kind | clone HEAD | pinned `gitCommitSha` | diverged? |
| --- | --- | --- | --- | --- |
| `caveman` | github | `25d22f864ad6` | `25d22f864ad6` | no |
| `understand-anything` | github | `2cda14e89535` | `2cda14e89535` | no |
| `claude-plugins-official` | github | not a git repo | — | n/a |

Both remote-source marketplaces are **exactly in sync** with their pinned
caches, so no natural divergence exists on this machine to test precedence
against. Per AC-05.2 this is recorded as the reason it is unmeasured, **never as
evidence of safety**. The experiment, for whoever can run it: once a
remote-source marketplace's upstream diverges from its pinned cache version,
diff a shared-name agent file between `~/.claude/plugins/marketplaces/<name>/…`
and `~/.claude/plugins/cache/<name>/<plugin>/<version>/…`, invoke that plugin's
own agent, and compare its live frontmatter against both trees — the technique
that settled the directory case.

If the clone wins there, AC-01.2 ships the same two-trees defect for every
remote-source user, and this feature will have fixed one half of the class.

---

## Independent Verification (Execute final gate)

**Date**: 2026-08-13
**Verifier**: independent sub-agent (author ≠ verifier), read-only against the real worktree; discrimination mutations run in-place via text edit and restored via text edit (per instruction — no scratch worktree was created), never `git checkout`/`stash`.
**Worktree**: `/Users/luizmassa/Projects/massa-ai-wt-marketplace`, branch `fix/marketplace-directory-source-switching`
**Diff range**: `89909051..HEAD` (9 commits, confirmed via `git log --oneline 89909051..HEAD`)

### Verdict: **NEEDS FIX** ❌ (not PASS)

The spec-anchored AC check and the discrimination sensor are both clean — every AC traces to a real assertion of the spec-defined outcome, and 5/5 injected behavior-level mutations were killed. The FAIL comes from two things outside the AC set but inside this feature's own mandatory delivery bar:

1. **A mandatory gate command from `tasks.md`'s own "Gate Check Commands" section (`bun run test:scripts`) is RED**, caused directly by this branch's own new code (T2b), not by anything pre-existing.
2. **T6 (close-out) was not done.** No `CHANGELOG.md` entry, no `FEATURES.json` registry entry, no `STATE.md`/`HANDOFF.md` update — despite the task requiring all four.

Both are fixable in a small follow-up; neither implicates the correctness of T1-T4's actual logic, which is solid.

---

### 1. Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC-01.1 | directory-source root = `<installLocation>/<plugins[i].source>` from that dir's own manifest, matched by plugin name, never `installPath` | `packages/shared/src/profile-switch/claude-marketplace.ts:141-185` (`resolveDirectorySourceRoot`) — `packages/shared/src/profile-switch/__tests__/claude-marketplace.test.ts:291-299` `expect(resolveClaudeMarketplaceRoot(...)).toBe(liveRoot)`, and `:301-316` proves it wins over a resolvable cache entry | ✅ PASS |
| AC-01.2 | any non-"directory" source kind keeps `installed_plugins.json`'s `installPath` via `selectRecord`, unchanged | `claude-marketplace.ts:236-261` — `claude-marketplace.test.ts:88-257` (multi-record precedence, absent/corrupt registry, missing-on-disk — all unchanged cache-path behavior) | ✅ PASS |
| AC-01.3 (amended) | absent/unparseable `known_marketplaces.json` → fall through to cache (`undefined`, not `null`); a *named* directory source that then fails → `null`, never a silent demotion to cache | `claude-marketplace.ts:141-185` docblock + `:151,155` — `claude-marketplace.test.ts:347-359` (fall-through case), `:361-416` (5 named-and-broken failure modes → null) | ✅ PASS — see Amendment Verification below |
| AC-01.4 | resolution stays uncached — every call re-reads from disk | `claude-marketplace.ts` — no module-level state anywhere in the file (verified by reading: every branch calls `fs.readFileSync`/`fs.existsSync` fresh) — `claude-marketplace.test.ts:259-288` proves this empirically for the **cache-path** branch (moved `installPath` across two calls) | ⚠️ Spec-precision gap (minor) — no dedicated test proves non-caching for the **directory-source** branch specifically; the guarantee is structural (no closures/module state exist to cache in), not exercised by a test that mutates the directory-source registry between two calls. Low severity — see Gaps below. |
| AC-01.5 | marketplace name comes from the plugin key's right-hand side, never hardcoded | `claude-marketplace.ts:94-101` (`splitPluginKey`), used at `:144,233` | ✅ PASS — `claude-marketplace.test.ts:318-331` uses `acme-tool@acme-market`, a non-"massa-ai" key, and still resolves correctly |
| AC-01.6 | composed path must resolve to a descendant of `installLocation`; a `../`-escape to an *existing* directory must resolve `null`, not that directory | `claude-marketplace.ts:103-112` (`isContainedPath`), applied at `:176` | ✅ PASS — `claude-marketplace.test.ts:419-437`: escape target is proven to exist on disk (line 436) yet resolves `null`; boundary-inclusive case at `:439-448` |
| AC-02.1 | `detectRoute` no longer refuses codex marketplace on "would dirty a checkout" | `packages/shared/src/profile-switch/hosts.ts:167` (`host === "claude" \|\| host === "codex"`) | ✅ PASS — `hosts.test.ts:149-152`, `engine.test.ts:435-448` (codex actually switches end-to-end) |
| AC-02.2 | absent `installRoute` still refuses loud with installer guidance | `hosts.ts:176-179` | ✅ PASS — `hosts.test.ts:105-118` |
| AC-02.3 | no refusal reason in the module cites checkout dirtiness (source-level tripwire) | `hosts.test.ts:183-197` reads `hosts.ts`'s own source, `expect(source).not.toMatch(/dirty a checkout/i)` | ✅ PASS |
| AC-02.4 | runtime guard: refuse a write to a git-tracked destination, name the path; unavailable `git` proceeds but records "could not check" | `packages/shared/src/profile-switch/engine.ts:220-321` (`checkTrackedPathGuard`, `detectGitAvailability`, `gitTrackedFileNames`), call site `:472-484` | ✅ PASS — `engine.test.ts:451-517`: tracked file refused (`:466-484`), ignored path proceeds (`:486-502`), non-repo target proceeds as a **verified pass** not "unchecked" (`:504-516`, matches design's "not-a-repo is a verified pass" distinction exactly) |
| AC-03.1 | regenerate stream runs the skill generator + subagent generator in `generate:artifacts`'s order | `apps/tools-api/src/routes/model-registry-stream.ts:111-144` (`deriveGeneratorScripts`), spawn loop `:329-371` | ✅ PASS — `model-registry-stream.test.ts:573-586`, generator order asserted against an **independently, test-owned** re-parse of the real `package.json` (`:552-565`), not the route's own derivation |
| AC-03.2 | a generator failure is reported per-generator by name; failure ≠ silent success | `model-registry-stream.ts:363-370` | ✅ PASS — `model-registry-stream.test.ts:588-604`: `done.error` contains `"generate-skill-artifacts.ts"` + `"exit code 7"`; no `skills`/`install`/`variant-sync` frame follows |
| AC-03.3 | skills reach each host's installed location; stream emits a per-host frame mirroring `variant-sync`/`install` shape | `model-registry-stream.ts:171-181` (`emitSkillsFrames`) | ✅ PASS — `model-registry-stream.test.ts:666-679`: 4 frames, one per `HOSTS`, `status:"generated"`, before variant-sync/install |
| AC-03.4 | generator list is *derived* from `package.json`, never a hardcoded list of two | `model-registry-stream.ts:111-144` | ✅ PASS — same evidence as AC-03.1 |
| AC-03.5 | derivation THROWS on an unparseable shape, never returns a short/empty list | `model-registry-stream.ts:114-144` (5 distinct throw sites) | ✅ PASS — `model-registry-stream.test.ts:606-645`: missing script key and a non-`bun <script.ts>` shape both throw, `spawnMock` never called |
| AC-03.6 | independent hardcoded backstop: ≥2 entries, both known filenames, checked without re-using the parser | `model-registry-stream.ts:91-97` (`KNOWN_GENERATOR_FILENAMES`, literal), `:146-163` (`assertGeneratorBackstop`) | ✅ PASS — `model-registry-stream.test.ts:647-654` checks the **actually-spawned** list with test-owned literals, not the route's derivation; **independence proven empirically**, see Mutation 4 below |
| AC-04.1 / AC-04.2 (MDS-04) | codex/cursor/opencode write targets measured against what each host loads; "no defect" recorded with evidence | `validation.md` T5 section (author-written) | ✅ PASS — cross-checked against this machine's live `~/.config/massa-ai/install-state.json`: `claude:marketplace, codex:file, cursor:bridge, opencode:file` — **matches the T5 table exactly** |
| AC-05.1 / AC-05.2 (MDS-05) | remote-source experiment recorded, or its unmeasured reason recorded (never as a safety claim) | `validation.md` T5 section | ✅ PASS — both remote marketplaces measured in-sync with their caches; explicitly captioned "never as evidence of safety" |

**Status**: 18/18 ACs covered and matching their spec-defined outcome, 1 minor spec-precision gap (AC-01.4, directory-branch caching not empirically tested — structurally guaranteed, non-blocking).

#### Amendment Verification (AC-01.3)

The amendment is real and correctly scoped. Before appending, I re-ran the two suites the spec cites as evidence for the amendment, from a clean tree:

- `bun test packages/shared/src/profile-switch/__tests__/variant-sync.test.ts` → **12 pass, 0 fail** (matches the claimed post-amendment figure; the spec's claimed pre-amendment `11/1` was not independently re-derived — the amendment already landed on this branch — but the current 12/0 is the only measurement that matters for a go/no-go here).
- Mutation 1 (below) independently proves the *narrower* guard the amendment kept — "never silently demote a **named** directory source to the cache" — is still enforced: forcing `resolveDirectorySourceRoot` to always fall through kills 4 directory-source tests, including the one at `claude-marketplace.test.ts:301-316` that exists specifically to prove a directory source wins over a resolvable cache entry.

---

### 2. Discrimination Sensor

Honest denominator: **5 mutations injected, 5 killed, 0 survived, 0 excluded** (no equivalent or unreachable mutations were encountered — every mutation targeted live, reachable code on the feature's diff surface). Restoration was by exact text-edit (Python `str.replace` on the exact original substring), never `git checkout`/`restore`/`stash`; `git status --short` was empty after every single restore, confirmed below.

| # | File:line | Description | Test run | Result | Post-restore `git status --short` |
| --- | --- | --- | --- | --- | --- |
| 1 | `claude-marketplace.ts:154-155` | Forced `resolveDirectorySourceRoot` to always `return undefined` — the exact regression this feature fixes (directory branch falls through to cache even when a directory source IS named) | `bun test .../claude-marketplace.test.ts` | ❌→✅ Killed: 4/25 failed, incl. the "wins over resolvable cache entry" test (expected live root, got the stale `1.48.0` cache path) | (empty) |
| 2 | `claude-marketplace.ts:176` | Disabled the AC-01.6 containment check (`if (false && !isContainedPath(...))`) | `bun test .../claude-marketplace.test.ts` | ❌→✅ Killed: 1/25 failed — the `../`-escape-to-existing-directory test, got the escape target back instead of `null` | (empty) |
| 3 | `engine.ts:292-293` | Neutered `checkTrackedPathGuard` to unconditionally `return GUARD_PASS` | `bun test .../engine.test.ts` | ❌→✅ Killed: 1/31 failed — the "deliberately git add-ed destination file is refused" test, got `"switched"` instead of `"failed"` | (empty) |
| 4 | `model-registry-stream.ts:134` (`deriveGeneratorScripts`) + `:157` (`assertGeneratorBackstop`) | Dropped all but the first generator from the derived list AND disabled the backstop's `if` in the same edit (`if (false)`) | `cd apps/tools-api && bun test src/routes/model-registry-stream.test.ts` | ❌→✅ Killed: 2/32 failed — **both** the AC-03.1/03.4 spawn-count test (expected 2 calls, got 1) **and** the AC-03.6 backstop test (expected ≥2 spawned paths, got 1) failed independently, proving AC-03.6's backstop is not merely redundant with AC-03.1's test | (empty) |
| 5 | `hosts.ts:167` | Reintroduced the codex marketplace refusal (`if (host === "claude")` only) | `bun test .../hosts.test.ts` and `bun test .../engine.test.ts` | ❌→✅ Killed: 1/20 (hosts) + 1/31 (engine) failed — the "codex now proceeds" unit test and the end-to-end "codex marketplace-route switch now proceeds" integration test | (empty) |

**Sensor depth**: lightweight (targeted, one behavior change per mutation, on the feature's own diff surface).
**Result**: 5/5 killed — PASS ✅

---

### 3. Gate Check (re-derived independently, fresh — not copied from any prior report)

| Command | Result |
| --- | --- |
| `bun run lint` (oxlint) | 0 violations — clean exit |
| `npx turbo run type-check --force` (cache bypassed to force a real run, per "a cached result is not a measurement") | **6/6 successful** (`@massa-ai/shared:build`, `@massa-ai/core:build`, `@massa-ai/web-ui:type-check`, `@massa-ai/tools-api:type-check`, `@massa-ai/opencode-plugin:type-check`, `@massa-ai/mcp-client:type-check`) |
| `bun test packages/shared/src/profile-switch/__tests__/claude-marketplace.test.ts` | **25 pass, 0 fail** |
| `bun test packages/shared/src/profile-switch/__tests__/hosts.test.ts` | **20 pass, 0 fail** |
| `bun test packages/shared/src/profile-switch/__tests__/engine.test.ts` | **31 pass, 0 fail** |
| `bun test packages/shared/src/profile-switch/__tests__/variant-sync.test.ts` | **12 pass, 0 fail** (T18 fixture, confirms the AC-01.3 amendment) |
| `cd apps/tools-api && bun test src/routes/model-registry-stream.test.ts` (one file per invocation, per the repo's own tools-api isolation rule) | **32 pass, 0 fail** |
| `bun test packages/shared` (plain `bun test`, whole package) | **498 pass, 0 fail** across 29 files |
| `bun run test:scripts` | ❌ **1809 pass, 1 FAIL** across 1810 tests, 80 files — see Gap 1 below |

Every one of the 6 named suite figures in the parent brief was independently re-derived and matches exactly. `bun run test:scripts` was **not** in that named-figures list but **is** in `tasks.md`'s own mandatory "Gate Check Commands" section, and it is red.

---

### 4. Gaps (ranked)

**Gap 1 — BLOCKING. `scripts/__tests__/check-security-allowlist.test.ts` fails because T2b's new `execFileSync` call sites were never added to `scripts/security-allowlist.txt`.**

- Evidence: `packages/shared/src/profile-switch/engine.ts:238` (`execFileSync("git", ["-C", dir, "rev-parse", "--is-inside-work-tree"], ...)` in `detectGitAvailability`) and `:254` (`execFileSync("git", ["-C", dir, "ls-files", "--", ...filenames], ...)` in `gitTrackedFileNames`) are two new, unreviewed child-process call sites added by T2b (the AC-02.4 runtime tracked-path guard).
- `scripts/security-allowlist.txt` already has a reviewed entry for `packages/shared/src/profile-switch/lock.ts` (line 24) for exactly this class of thing (an earlier `execFileSync("ps", ...)` site), but no entry exists for `engine.ts`.
- Confirmed this is a **real regression introduced by this branch**, not pre-existing: `bun test scripts/__tests__/check-security-allowlist.test.ts` on `main` (`/Users/luizmassa/Projects/massa-ai`) passes **39/39**; the identical command on this branch fails with:
  ```
  {
    "actual": 2, "cls": "child-process",
    "detail": "packages/shared/src/profile-switch/engine.ts: 2 child-process site(s), not in security-allowlist.txt at all (unreviewed new site)",
    "expected": 0, "kind": "unreviewed"
  }
  ```
- This is `tasks.md`'s own mandatory `bun run test:scripts` gate command failing — the checklist says "Non-zero exit code = STOP. Do not proceed to Code Quality Check." Task T2b's "Done when" never mentioned the security allowlist, so this reads as an omission in T2b's task definition or its self-check, not a design flaw in AC-02.4 itself — the guard's own behavior is correct and well-tested (Mutation 3 above).
- **Fix task**: add one `child-process|packages/shared/src/profile-switch/engine.ts|2|<justification>` line to `scripts/security-allowlist.txt`, describing the two fixed-literal `git` invocations (array-args, no shell interpolation, used only to check tracked-path status before an overwrite). Then re-run `bun run test:scripts` to confirm green.

**Gap 2 — BLOCKING for close-out. T6 was not executed.**

- `tasks.md`'s T6 requires: `validation.md` (done — the T5 author section exists, and this section is the independent-verifier half), `STATE.md`, `HANDOFF.md`, `FEATURES.json`, and a `### Fixed` entry under `[Unreleased]` in `CHANGELOG.md` naming the user-visible symptom.
- `grep -n "marketplace-directory-source-switching" CHANGELOG.md .specs/project/STATE.md .specs/project/FEATURES.json .specs/HANDOFF.md` → **zero matches in all four files**.
- `CHANGELOG.md`'s `[Unreleased]` section is empty (confirmed by reading it directly).
- `.specs/project/FEATURES.json` has no entry for this slug (confirmed by `grep -n "marketplace"` — every hit is an unrelated, pre-existing feature: `claude-marketplace-cache-refresh`, `model-profile-switching`, etc.).
- `.specs/project/STATE.md` and `.specs/HANDOFF.md` are both about unrelated, other in-flight work (a native-runtime re-baseline and `web-ui-typescript`, respectively) with no mention of this feature.
- `bun skills/massa-ai/scripts/check_specs_delivered.ts marketplace-directory-source-switching --root .` reports **0 errors** — but that script only checks that the 7 named paths *exist*, not that they mention or reflect this feature. It is not a reliable substitute for actually doing T6; do not treat its green exit as evidence T6 happened.
- Per CLAUDE.md: "a PR that does not modify `CHANGELOG.md` fails unless it carries the `no-changelog` label" — this branch's diff-stat (`git diff --stat 89909051..HEAD`) touches 12 files, none of them `CHANGELOG.md`. This branch will fail the CI CHANGELOG merge gate as-is.
- **Fix task**: complete T6 — a `### Fixed` CHANGELOG entry (both defects, user-visible framing: "profile switches on a directory-source Claude marketplace install now write where Claude actually reads, and Save & Apply now regenerates skills too"), a `.specs/project/FEATURES.json` entry for this slug, and STATE.md/HANDOFF.md updates recording this session's outcome.

**Gap 3 — minor, non-blocking. AC-01.4 (never-cached contract) is untested for the directory-source branch specifically.**

- `claude-marketplace.test.ts:259-288` ("never caches") only exercises the cache/remote-path branch (moves `installPath` between two calls). No equivalent test moves the directory-source's composed root (e.g., changes `plugins[].source` in `marketplace.json` between two calls to the same `resolveClaudeMarketplaceRoot({ targetHome })`) to prove the directory branch also re-reads fresh.
- Read the code directly: `resolveDirectorySourceRoot` (`claude-marketplace.ts:141-185`) has no closures, no module-level `let`/cache map, and reads both registry files via `fs.readFileSync` on every invocation — structurally this cannot cache anything. This is a real guarantee, just not one exercised by a directory-branch-specific test.
- **Fix task (optional, low priority)**: add one test mirroring the existing "two calls across a moved installPath" pattern but staging a directory-source fixture and changing `plugins[].source` between calls.

---

### 5. Requirement Traceability

| Requirement | Status |
| --- | --- |
| MDS-01 | ✅ Verified (AC-01.4 minor precision gap noted, non-blocking) |
| MDS-02 | ✅ Verified |
| MDS-03 | ✅ Verified |
| MDS-04 | ✅ Verified |
| MDS-05 | ✅ Verified |

### 6. Summary

**Overall**: ⚠️ Issues — correctness is solid, delivery is incomplete.
**Result**: NEEDS FIX

**Spec-anchored check**: 18/18 ACs matched their spec-defined outcome; 1 minor spec-precision gap (AC-01.4, directory branch).
**Sensor**: 5/5 mutations killed, 0 survived, 0 excluded.
**Gate**: lint 0, type-check 6/6 (forced, non-cached), 5 named unit suites all green and exactly matching claimed figures (25/0, 20/0, 31/0, 12/0, 32/0), `packages/shared` 498/0 — but `bun run test:scripts` **1809/1 FAIL** (Gap 1).

**What works**: T1 (directory-source resolution incl. the AC-01.3 amendment and AC-01.6 containment), T2/T2b (codex refusal retirement + its runtime replacement guard), T3/T4 (generator-list derivation, its independent backstop, and the per-host skills frame) are all correctly implemented and are backed by tests that fail for the right reason when the underlying behavior is broken — proven empirically by 5/5 killed mutations, not just by reading the code.

**Issues found**: Gap 1 (security-allowlist gate red — blocking, small fix), Gap 2 (T6 close-out not done — blocking for merge/CI, small fix), Gap 3 (AC-01.4 coverage — non-blocking).

**Next steps**: (1) Add the `engine.ts` entry to `scripts/security-allowlist.txt` and re-run `bun run test:scripts` to confirm 0 failures. (2) Complete T6: CHANGELOG entry, FEATURES.json entry, STATE.md/HANDOFF.md updates. (3) Optionally add the AC-01.4 directory-branch caching test. Re-verify after (1) and (2); this feature is close but not done.
