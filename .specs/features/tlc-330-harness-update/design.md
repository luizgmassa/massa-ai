# TLC 3.3.0 Harness Update — Design

- **Feature:** `tlc-330-harness-update` — see `spec.md` for requirements.
- **Sizing:** Large. Design included: public-contract changes (skills are a published compatibility surface via 4 host bundles), new deterministic tooling, one charter change with generated-artifact ripple.

## Design Summary

Three concern groups land in one branch: (A) upstream 3.3.0 sync — 4 ported validator scripts + prose wiring + safety-rule ports; (B) batching trigger lowered to >3 tasks; (C) a deliver-specs-before-PR gate (prose stage + new script). All skill edits happen only in `skills/**` sources; `apps/<host>-plugin/**` changes are generator output exclusively.

## Decisions

**D1 — Validator port strategy: copy-then-patch, not rewrite.** Each TLC script is copied verbatim, then minimally patched: (a) `--root` flag + default `.` matching `lessons.py`'s convention; (b) feature auto-detect anchored at `<root>/.specs/features/*/`; (c) `check_commit.py` header regex gains an optional leading `\[([A-Z][A-Z0-9]{1,9}-\d+)\] ` group to accept massa-ai's Jira-prefix contract (`workflows/commit.md` §8); (d) exit codes 0/1/2 untouched. Rationale: upstream scripts are tested logic; the smaller the patch, the cheaper the next upstream sync. Rejected: rewriting in TypeScript — loses upstream diffability, and Python-stdlib-only is a portability feature for non-Bun hosts.

**D2 — Test harness: Bun TS suites spawning `python3`, fixtures in temp dirs.** New `scripts/__tests__/spec-driven-validators.test.ts` (+ one per script if size demands) uses `Bun.spawnSync(["python3", ...])` against fixture `.specs/` trees built in `mkdtemp` dirs. Runs under `bun run test:scripts` (CI build job; GH runners ship python3). No PostgreSQL/Ollama dependency — deterministic-gate friendly. Mutation review per CONTRIBUTING step 7: each core check inverted once during authoring, observed red (a new sensor needs an observed red).

**D3 — `check_specs_delivered.py` semantics (GATE-02).** Two conjunctive checks, both reported with their population: (1) `git status --porcelain -- .specs/` empty — catches modified AND untracked (porcelain shows `??`); (2) required artifact set tracked on HEAD (`git ls-tree -r --name-only HEAD`): feature `spec.md` + any of `{context,design,tasks,validation}.md` that exist on disk, plus `.specs/project/STATE.md`, `.specs/HANDOFF.md`, `.specs/project/FEATURES.json`. Check (2) closes the hole where absence is porcelain-clean. Prints checked paths + counts (population beside verdict). Pure `git` + stdlib; runs from any cwd via `--root`.

**D4 — EARS ripple: templates verified, not assumed.** Before T7 lands, a scripted check confirms `design.md`/`tasks.md` templates contain no `WHEN/THEN`-format mandate that would contradict EARS (agent 1's "likely low ripple" is a lead, not evidence). If a mandate is found, the task extends to those templates; spec traceability updated.

**D5 — Model-tier rubric expressed against the real mechanism.** `sub-agents.md` gains a short rubric section that maps roles to charter `metadata.model_tier` values (`light/standard/deep` from `skills/model-profiles.json`), keeping TLC's "size up when unsure" and replacing TLC's "Verifier mid-to-high" with the user rule: **the Verifier always runs on `deep`** — enforced structurally by SYNC-11's charter change, not just prose. No agent list is added to `model-profiles.json` (registry shape is a documented invariant).

**D6 — Threshold sweep is a task-level gate.** BATCH-01's AC2 runs a scripted sweep for the old trigger phrasing (`>~8`, "more than one task-budgeted batch" as trigger condition) across `skills/**` and regenerated bundles, printing the match population before/after. The sweep keys on content identity, not remembered locations — known sites today: `workflows/spec-driven.md:42,95`, `sub-agents.md:3,14,21`, but the sweep enumerates, the list does not.

**D7 — Blast-radius adaptation (flagged tension).** TLC verbatim requires explicit go-ahead before any `git push`, even post-approval. massa-ai's delivery chain today auto-pushes and auto-creates the PR, stopping only before merge. Adopting verbatim changes routine behavior. **Decision: adapt — one explicit delivery authorization per feature.** At Execute start (same moment as the batch offer), the agent asks once: "approve implementation + delivery through PR creation?" That single approval covers task commits, branch push, and `gh pr create` for this feature. Force-push, deploy, production DB changes, merges, and anything destructive always require a separate explicit go-ahead, per TLC. Rejected: (a) verbatim TLC — one more blocking question per feature with no recorded incident it would have prevented here; (b) status quo — leaves push authorization implicit, which is the gap TLC's rule names. Plan Challenge reviews this decision explicitly.

**D8 — GATE-01 stage placement.** New stage 3.5 "Deliver specs" in `implementation-delivery.md` between Push and Propose: run `check_specs_delivered.py`; on failure, commit the missing `.specs/` updates (a `docs(specs):`-type commit is normal), push, re-run; Propose's precondition names the gate. Rationale for post-Push placement: STATE/HANDOFF close-out text usually needs final commit hashes, which exist only after the last task commit; the gate then guarantees the *push* that carries them precedes the PR. **Nominal path (Plan Challenge C2 revision): the close-out task (T18-equivalent) always runs and commits *before* the first push, so stage 3.5's remediation branch is a defensive fallback that should never fire; the prose in the new stage states this explicitly, and the close-out gate asserts no commits land between close-out and PR creation.**

**D9 — Charter regeneration scope.** `verification-agent` tier change regenerates via `scripts/generate-subagent-artifacts.ts` (agents) and `scripts/generate-skill-artifacts.ts` (skills incl. `skills/agents/**` charter copies). Both `--check` gates + `subagent-parity` + `skill-artifact-parity` tests must be green in the same commit as the regeneration — never split source edit from bundle regen across commits. **T16 therefore runs both generators and both parity tests itself** (Plan Challenge C1 revision: T16's gate must be as wide as this invariant); T17's later skill regen then only picks up Phase-2 prose, already-consistent charters included.

## Verification Design

- Per-task gates: the relevant validator/test run named in each task (`tasks.md` Gate Check Commands).
- Feature gates: `bun run test:scripts` (parity + new validator suites), `bun run lint`, both generators `--check` clean.
- Independent validation: `massa-ai-verification-agent` (charter tier now `deep`) per workflow dispatch block; discrimination sensor on the new scripts (invert a check, expect suite red) run in scratch state per the newly-ported no-stash rule — this feature dogfoods its own port.
- GATE-02 dogfood: the feature's own PR must pass `check_specs_delivered.py` before `gh pr create`.

## Plan Challenge Record (full gate, pre_mortem, 2026-08-04)

`massa-ai-plan-critic` returned 5 challenges. Resolutions (decided by main agent per `serious_findings: revise_plan`; options rejected are named):

- **C1 (critical) — T16 gate narrower than D9:** revised — T16 now runs both generators + both parity tests (D9 amended). Rejected: relaxing D9 to tolerate one-commit skew — contradicts R4's commit-scoped framing.
- **C2 (high) — close-out/push race:** revised — D8 amended: close-out always precedes first push; stage 3.5 remediation is defensive fallback; close-out gate asserts zero commits between close-out and PR.
- **C3 (high) — no cross-file rule consistency check:** revised — T17 gains a cross-file clause-consistency check (blast-radius + gate-invocation clauses extracted from every touched file, asserted parameterized-identical, population printed).
- **C4 (medium) — batch boundary algorithm unstated:** no plan change. The existing `sub-agents.md` algorithm already owns boundaries: batches pack whole phases and never split one, so intra-phase dependency edges cannot cross workers; the >3 trigger only changes *when the offer fires*, not the boundary rule. Quick mode is unaffected — it never produces a formal `tasks.md`, and the trigger reads task count from `tasks.md`. Self-application: this feature's phases [6,9,3] pack to 3 batches under the unchanged algorithm.
- **C5 (medium) — validator/template drift over time:** closed, not accepted — GEN-02 gains a template-conformance test: extract each validator's required-section/field expectations and assert the corresponding template blocks in `specify.md`/`tasks.md`/`validate.md` satisfy them, so a future template edit that breaks a validator goes red in `test:scripts`. Rejected: naming it as accepted risk only — this project's standing pattern is close gaps, don't exclude them.

## Risks / Mitigations

- **R1 — Prose drift across 8 edited reference files:** mitigate with the D6-style content-identity sweeps per changed rule (old phrasing population → 0).
- **R2 — Validator false-reds on historical features** (61 existing feature dirs): validators are invoked per-feature by the workflow, never repo-wide in CI — no retroactive enforcement. `validate_state.py`'s multi-feature cross-check only inspects features that "appear complete"; T4's tests cover one legacy-shaped fixture to confirm no crash.
- **R3 — python3 absent on a future runner:** wiring prose keeps TLC's degradation (perform checks by reading the artifact); test harness asserts python3 present in CI only.
- **R4 — Generated-bundle hand-edit accident:** all bundle changes come from generators; `--check` in CI catches drift either way.
