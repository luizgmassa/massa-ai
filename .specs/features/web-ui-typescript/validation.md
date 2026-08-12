# Validation — `web-ui-typescript`

**Subject**: branch `spec/web-ui-typescript` @ `630d0260`, 63 commits ahead of
`origin/main` @ `6227b4ac`.
**Method**: independent read-only verification pass (author ≠ verifier), adversarial —
every claim treated as a hypothesis to falsify, with the command and output that
settled it. Scratch mutations were restored by hand and `git status --porcelain`
confirmed empty afterwards; HEAD unchanged throughout.

**Verdict: fit to open as a Pull Request.** Two documentation defects were found and
have since been fixed (below). No code defect survived verification.

---

## Claim verdicts

| # | Claim | Verdict |
| --- | --- | --- |
| 1 | All 22 modules converted, none left behind | **CONFIRMED** |
| 2 | Behaviour unchanged (golden fixture) | **CONFIRMED** |
| 3 | `MassaAiConfig` coupling is real, not decorative | **CONFIRMED** (with a recorded caveat) |
| 4 | Frozen public surface intact | **CONFIRMED** |
| 5 | All gates pass at the claimed figures | **CONFIRMED** |
| 6 | Requirement coverage traceable | **PARTIAL** → defects fixed, now complete |
| 7 | Execution Log's own figures reproduce | **CONFIRMED** |

### 1 — Conversion is terminal

`0` `.js` and `22` `.ts` under `apps/web-ui/src/static`. A clean rebuild
(`rm -rf apps/web-ui/dist` first) yields `dist/static` with exactly **22 `.js`, 0
`.ts`, 1 `index.html`, 1 `styles.css`** (plus 22 `.js.map`, not claimed and not
contradicting).

### 2 — Behaviour unchanged, except the golden keys Phase 15 changed on purpose

**This claim held at the time it was made and has since become false, in the scoped way
Phase 15 (T41-T44) intended.** At this verification pass's own subject commit
(`630d0260`), `render-golden.json` hashed to
`27195c2e9975ae28481d7fd6d8d778232f3df07e0556253a2dfbc05ffb77af30`, an exact match, and
its modification count on the branch to that point was **0** — the file's only
ever-touching commit `b21c818d` was an ancestor of `6227b4ac`, confirmed with
`git merge-base --is-ancestor`. Hash-match and never-modified were different claims, and
both held, for Phases 1-14.

Phases 15-16 repair three defects the operator found by operating the served bundle, all
three reproducing byte-for-byte on `origin/main` (see `spec.md` § "P1: The three defects
found by operating the served UI are fixed"), and the fixes are behaviour changes by
design — that is what a defect repair is. As of `HEAD` (`99bbb1cc`), against
`origin/main` @ `6227b4ac`:

- **86** golden entries, up from **85**. **83 of the 85** pre-existing entries are
  byte-identical to their `origin/main` value; **2 changed** and **1 was added**; **0**
  were removed.
- **Added** — `renderModelRegistry/nonProfileOverlay` (T42: a non-profile overlay
  override is now marked with an `overlay-badge` where it is edited, the exact scenario
  the reported defect had nothing on screen for).
- **Changed** — `renderConfig/read`, `renderConfig/write` (T43: the Config tab now
  displays the server-supplied default for an unresolved field and marks it inherited,
  and a saved section no longer coerces an un-rendered default to `false`).
- **Unchanged within their families** — `renderModelRegistry/*` is **13 → 14** entries
  with **0** of the original 13 byte-changed (only the new entry was added);
  `renderConfig/*` is unchanged in count at **2**, both changed as above;
  `renderLogs/*` is unchanged at **7** entries, **0** byte-changed — T44 (the Logs Live
  preference fix) changes startup state, not the renderer, so its golden family is
  untouched, matching spec.md AC8.

Every changed or added key belongs to the task that named it in advance (T42 named
`nonProfileOverlay`; T43 named the 2 `renderConfig/*` keys), so the change is the
intended one and not collateral — spec.md AC9. The branch's behaviour-preserving
property, true through Phase 14, is retired for exactly these 3 of 86 keys by explicit
user decision (Phase 15's own framing note), not by accident.

### 3 — The coupling is real, and the caveat is worth more than the confirmation

Both directions mutated in scratch and restored byte-identical:

- added `scratchVerifierField?: string` to `MassaAiConfig` with no matching section →
  **exit 2**, `TS2741: Property 'scratchVerifierField' is missing … at config-sections.ts(36,7)`
- removed the `scheduler:` entry from `CONFIG_SECTIONS_BY_KEY` → **exit 2**,
  `TS2741: Property 'scheduler' is missing`

**Caveat, newly found and not previously recorded.** The sensor fires reliably only
through the **root, turbo-mediated** `bun run type-check`, because `turbo.json`
declares `type-check` with `dependsOn: ["^build"]`, which rebuilds
`@massa-ai/shared`'s `dist/*.d.ts` first. Running `tsc --noEmit` **directly inside
`apps/web-ui`** resolves `@massa-ai/shared` through the workspace symlink's stale
`dist/index.d.ts`, which is not rebuilt — and the same mutation **silently passes,
exit 0, no output**. CI and `bun run type-check` both use the turbo form, so the
shipped gate is sound; but a contributor running bare `tsc --noEmit` locally gets a
false green on exactly the coupling this feature exists to provide. Related to, and
sharper than, the T24 note that the *revert* needs the turbo form.

### 4 — Frozen public surface

`public-surface.test.ts` has **0** commits on this branch (same pre-fork ancestor
situation as the golden fixture), and `bun test` on it returns **7 pass / 0 fail**,
so the converted barrel still satisfies both frozen export lists.

### 5 — Gates

| Command | Result |
| --- | --- |
| `bun run build` | exit 0 |
| `bun run type-check` (turbo, **forced**, non-cached) | exit 0, 6/6 successful |
| `bun run lint` (root oxlint) | exit 0 |
| `bun test apps/web-ui/src/__tests__/` | **703 pass, 0 fail**, 15 files |
| six tools-api web-ui suites | **57 pass, 0 fail** |
| `web-ui-serve` + `web-ui-key-http` | **15 pass, 0 fail** |
| `installer-config-template.test.ts` | **31 pass, 0 fail** |

All reproduced exactly. `test:scripts` was skipped by judgment: the one suite in it
touching this feature's surface (`installer-config-template.test.ts`) was run directly,
and no file under `scripts/` generators was changed by this branch.

### 6 — Requirement coverage

`tasks.md` cites **all 16** requirement IDs — `grep -oE 'WUT-[0-9]+' | sort -u` returns
`WUT-01`..`WUT-16` with no gaps and no phantom ids — across 40 task headings. The
substantive mapping is real and complete.

**Two documentation defects were found here, and both are now fixed:**

1. `spec.md`'s own Requirement Traceability table still read `Phase: Design`,
   `Status: Pending` for all 16 rows, with a summary line claiming
   `0 mapped to tasks … 16 unmapped ⚠️`. A reader trusting `spec.md` alone would have
   concluded nothing was covered. Now `Execute` / `Verified` for all 16, with a
   corrected coverage line.
2. `tasks.md`'s top-of-file `**Status**` line read `In Progress — Batches 1-11 of 14
   in flight … Phase 14 remains`, contradicting its own Execution Log and
   `FEATURES.json` within the same document. Now `Complete`.

Both were stale status fields rather than implementation gaps — the recurring failure
mode of a status field being a claim that goes out of date silently.

### 7 — Execution Log figures

Spot-checked and reproduced: the `scheduler-store-pg` 5/1 result and its five row
names verbatim; `git rev-list --count 6227b4ac..HEAD -- packages/` = **0** and an empty
`git diff --stat`, so the branch genuinely touches nothing under `packages/` and the
non-causation claim holds; the D6/D7 fixes present in the tree (`readBundleSource` now
globs `.js`+`.ts`, the population assertion printed `scanned 22 files`, the mutant
literal now genuinely contains its own target); D9's fix present
(`wire-view-handlers.ts:121` has `doc: ConfigDocument & LogsDoc`, required); T34's
`1 → 23` population with 0 `apps/web-ui` hits out of 19 repo-wide, scanner PASS.

No spot-checked figure failed to reproduce. One is worth a footnote: `FEATURES.json`'s
"62 commits" resolves only once you know it excludes its own authoring commit — the
full branch is **63**.

---

## Known-open items — confirmed accurately recorded

- **T7's two manual browser bullets** ("refresh the browser and observe"; "devtools
  opens the `.ts`") are recorded as **deferred to the user, not done**, with the
  Execution Log additionally noting that authoring them as automated acceptance
  criteria was an orchestrator error. Not claimed complete.
- **`scheduler-store-pg.test.ts` 5 pass / 1 fail locally** is environmental and not
  caused by this branch — independently reproduced, including the `packages/`
  zero-diff. It will pass in CI, whose `pgvector` service starts with an empty
  `scheduled_jobs` table and where no migration seeds the five application defaults.
  A latent defect in that suite's own M35 seam (it filters `id.startsWith("scheduled-")`
  yet did not filter) exists on `main` and is **out of this feature's scope** — worth
  reporting upstream.

## Guards probed for vacuity

None found beyond the two the feature's own log already documents and fixed (D6, the
corpus that shrank 21 → 2; D7, the mutant that never contained its own assertion
target). `config-section-coverage.test.ts`'s population read and the security-allowlist
scanner were both probed independently and are real. The six source-text scanners were
not each re-mutated a second time — T31 did that per-scanner with observed reds and
exact `Expected`/`Received` pairs — so verification effort went instead to the two
highest-value guards: the `MassaAiConfig` mapped-type coupling and the write-mode
discrimination sensor's current state, both re-derived from scratch.

## Residual risk

- The bare-`tsc` false green described under claim 3. Not shipped-gate-affecting;
  worth a contributor-facing note.
- `CLAUDE.md` documents `test:scripts` as "1230 TS tests across 55 files" against a
  measured **1804 across 80**. Pre-dates this branch; corrected in `CLAUDE.md` by T35.

`git status --porcelain` empty at end of verification; no commits made by the verifier.
