# massa-ai Spec State

## Current — Worktree Isolation Gate (**VALIDATED PASS 2026-08-06** — 6/6 ACs, 3/3 mutations killed, iteration 1; push/PR = user decision)

- projectId: `massa-ai` · workflowSessionId: `spec-worktree-isolation-gate` ·
  workflow: spec-driven (Medium) · branch `spec/worktree-isolation-gate` from
  origin/main @ v1.32.0 (`5c66e813`), worktree
  `/Users/luizmassa/Projects/massa-ai-wt-worktree-isolation-step` (isolated —
  dogfooding the feature itself; main checkout untouched).
- Scope (user-directed 2026-08-06): user asked for worktree+branch creation in
  every implementation workflow via a shared reference; premise measured
  already-satisfied (the delivery clause + Stage 1 have been in all 16 since
  `93c1ee1c`), user redirected to **strengthen enforcement**. Delivered: one
  identical **Isolation Gate** action line after the delivery clause in all 16
  implementation workflows; Stage 1 gains record-evidence + never-switch-
  branches-in-shared-checkout (cross-session rule, distinct from
  agent-orchestration.md's cross-subagent bullet); hook-level blocking deferred
  (hook binary contract is observation-only; no PreToolUse registered) — see
  `.specs/features/worktree-isolation-gate/design.md` D2.
- Contract: `.specs/features/worktree-isolation-gate/{spec,design,tasks}.md` —
  `2 Phases = 5 Tasks`, inline (batch-worker offer declined by precedent).
  Plan Challenge full pre_mortem (massa-ai-plan-critic): F1 efficacy accepted-
  risk recorded in spec Assumptions (textual gate is unfalsifiable for behavior
  change; falsifier = future repeat incident), F2 cross-reference distinction +
  post-T1 duplication measure, F3 critic pre-measured duplication delta 0
  (483→483 @ window 4, zero-headroom ceiling untouched), F4 per-file sensor
  loop, F5 CONTRIBUTING 7-step mapping added to spec, F6 size-budgets citation
  corrected (no budget covers workflows/**).
- Commits: `11d93062` specs → T1 Stage 1 paragraph → T2 sensor (observed red
  17 = 16 per-file + uniformity; committed red-by-design, gates green at T3) →
  T3 gate lines 16 files ×2 insertions (sensor 67/0, excess 483 ≤ 483) → T4
  CHANGELOG (Added → minor).
- Gates: workflow-harness-contract 67/0; duplication 20/0 (excess 483 ≤ 483 @
  w4); size 6/0; metadata-headers 40 files; doc-paths green; venue-parity
  green; integrity 32/0 (after `generate:artifacts` in fresh worktree);
  `generate:artifacts --check` no drift (707 skill-bundle files, 374 variant
  agents).
- massa-ai MCP not consulted this session (recall unavailable); `.specs/`
  files canonical.
- Validation (independent verifier, author ≠ verifier, iteration 1 of 3 —
  closed): 6/6 ACs; 3 mutations, 3/3 killed. Pass-1 survivor was real: the
  coverage matrix claimed a Stage 1 sensor T2 never wrote (AC4); fixed
  `a8360f18` (observed red in scratch, copy-count verified), re-injected pass 2,
  killed, porcelain byte-identical before/after. Verifier gates: 68/0
  harness-contract, validate_state exit 0. Lesson class: a tasks.md
  coverage-matrix row naming a sensor is a claim to falsify, not trust.
- Next: push/PR = user decision (branch `spec/worktree-isolation-gate`, 8
  commits ahead of origin/main).

## Previous — Agent-Era Harness Upgrades (**VALIDATED PASS 2026-08-06** — 28/28 ACs, 8/8 mutants killed; PR #76 open; file-size thresholds amended ~500/~600 by user @ `eb23dd0a`; main v1.30.0 + PR #77 merged in; merge authorized, CI watch)

- projectId: `massa-ai` · workflowSessionId: `spec-agent-era-harness-upgrades` ·
  workflow: spec-driven (Large) · branch `spec/agent-era-harness-upgrades` from
  `main` @ `40ec631a` (post PR #73 merge).
- Scope (AEH-01..10): `lessons.ts review add`/`trust status`
  trust-ramp (per-category streak, `trust_threshold` default 30, `>=`
  comparison, `major` resets+demotes, legacy stores load clean) and
  `metrics add`/`metrics trend` (scalar score, improving/stable/degrading,
  `insufficient data` under two snapshots); code-quality/refactor/
  coding-guidelines rewrites to a discoverability-or-change-risk split
  criterion and an agent-read-aware file-shape section; tests-audit
  five-gate error-class model + variation/trend sensors + tests lens on
  audit-specialist + test-engineer five-class mission; feature-workflow AC
  capture/anchor; `massa-ai-reviewer` dispatch wired into 14 workflows
  (5 implementing + 9 fix); generated-bundle regeneration gates (AD-016).
- Contract: `.specs/features/agent-era-harness-upgrades/{spec,design,tasks}.md`
  — `6 Phases = 19 Tasks`. Batch A+B (T1-T14) committed prior to this batch.
  Batch C (this batch, T15-T19): T15 `377b654a` (5 implementing workflows),
  T16 `2cf7d3fc` (5 fix workflows batch 1), T17 `9f7a4718` (4 fix workflows
  batch 2, 14-file count sensor), T18 no commit (gates only — `bun install`,
  `generate:artifacts` + `--check`, parity suites, lint, full gate all green,
  no tracked drift), T19 this commit (CHANGELOG + state artifacts).
- Gates (Batch C): quick gate 106/0 after T17 (up from 96/0 at T15 as the new
  T16/T17 dispatch-block sensors landed); `skills-harness-integrity.test.ts`
  held at 32/0 through T15/T16/T17 (unchanged count — it asserts aggregate
  invariants, not a per-block count); full gate (quick + pyts-golden +
  spec-driven-validators) 205/0; parity suites (`skill-artifact-parity` +
  `subagent-parity`) 88/0; `bun run lint` (oxlint) exit 0;
  `generate:artifacts --check` exit 0 with zero tracked-file drift.
- `bun install` in this worktree (no prior `node_modules/`) completed native
  tree-sitter builds (`.node` addons present for `tree-sitter`,
  `tree-sitter-clojure-orchard`, `tree-sitter-dart`, `tree-sitter-erlang`) —
  did not hit the documented Node 25/macOS arm64 node-gyp failure this run.
- SPEC_DEVIATION: `tasks.md` T9/T10 Done-when literally reads
  "`validate_skill.ts` exits 0"; re-baselined during Batches A+B to "no NEW
  failures" because `description_has_negative_scope` fails pre-existing on
  all 17 charters at the `origin/main` baseline (measured before those
  tasks landed) — carried forward here unchanged, not reopened by Batch C.
- massa-ai MCP server not used this session; `.specs/` files canonical.

## Previous — PR Review Workflow (**VALIDATED PASS 2026-08-05** — 26/26 ACs, 5/5 mutations killed; merged as PR #75 @ `d2e7a43b`, released v1.30.0)
## Previous — Discovery Workflow (**VALIDATED PASS 2026-08-05** — 15/15 ACs, 4/4 mutations killed; merged as PR #77 @ `eeef4f4e`)

- projectId: `massa-ai` · workflowSessionId: `spec-discovery-workflow` ·
  workflow: spec-driven (full artifacts by pr-review precedent) · branch
  `spec/discovery-workflow` STACKED on `spec/pr-review-workflow` @ `975a020d`
  (A1: same three contended surfaces).
- **Cross-session incident (recorded):** the sibling pr-review session
  committed its T6 close-out `c4b4d6cb` (validation PASS, registry complete,
  state/handoff stamped) into this shared checkout while it was on
  `spec/discovery-workflow` — so that commit is an ancestor of this branch,
  and `spec/pr-review-workflow`'s own tip (`975a020d`) lacks it. It also
  swept this feature's then-uncommitted `spec.md`/`design.md` drafts into
  itself. Linear history, nothing lost. Suggested user-level repair:
  `git branch -f spec/pr-review-workflow c4b4d6cb` (fast-forward to its own
  T6 commit) before pushing either branch; discovery's PR then targets
  `base=spec/pr-review-workflow`.
- Scope (user-directed 2026-08-05): new routed workflow `discovery` — product
  brainstorming thinking partner adapted from the `product-brainstorming`
  skill in `anthropics/knowledge-work-plugins` (Apache-2.0; provenance
  established by unique-phrase web search + GitHub API per Plan Challenge F3,
  which had flagged it user-decision — measurement resolved it). Four modes,
  seven frameworks-as-tools, Frame→Diverge→Provoke→Converge→Capture,
  conduct contract + six anti-patterns, massa-ai session/memory binding,
  mandatory to-prd PRD offer at Capture (acceptance = to-prd's explicit
  request).
- Contract: `.specs/features/discovery-workflow/{spec,design,tasks}.md` —
  `2 Phases = 6 Tasks`, inline execution (batch-worker offer declined: one
  dominant prose file, sequential deps — pr-review precedent). Plan Challenge
  full pre_mortem (massa-ai-plan-critic): F1 merge-path explicit (recorded in
  A1 + tasks delivery note), F2 open-PR sweep (PR #74 touches
  SKILL.md/CHANGELOG, no line collision), F3 provenance resolved by
  measurement (Apache-2.0), F4 voice-mitigation corrected to T6 clause read,
  F5 size figure reworded authoring-target.
- Commits: `e67700d1` specs → `f83fe38a` T1 discovery.md (12,497 B,
  frontmatter parses; attribution + intake + no-delivery-ref + to-prd
  literals green) → `231a9357` T2 router row before `to-prd` + tier-4 clause
  (SKILL.md 20,293 B ≤ 21,000) → `5330337f` T3 count locks 39→40 +
  complement 23→24 (observed red: 3 fails before, 50/0 after) → `01073577`
  T3 amendment: WMH license allowlist +Apache-2.0 (observed red first;
  discrimination preserved) → `1e14716a` T4 CHANGELOG.
- Gates: `generate:artifacts` + `--check` no drift; integrity 32/0; size 6/0;
  duplication 20/0; parity 23/0; doc-paths 160 files / 1167 citations /
  0 misses; lint 0; `test:scripts` 1451/4 — the 4 are the documented
  `.claude/worktrees/` needle-anchor contamination class (CI authoritative).
- massa-ai MCP unreachable this session (recall aborted at 120 s);
  `.specs/` files canonical.
- Next: T6 — check_specs_delivered, independent verification-agent →
  validation.md; push/PR = user decision (see delivery note in tasks.md and
  the incident repair above).

## Previous — PR Review Workflow (**VALIDATED PASS 2026-08-05** — 26/26 ACs, 5/5 mutations killed, iteration 1; push/PR = user decision)

- projectId: `massa-ai` · workflowSessionId: `spec-pr-review-workflow` ·
  workflow: spec-driven (Large) · branch `spec/pr-review-workflow` from
  origin/main @ `1906a04e` (v1.29.0).
- Scope (user-directed 2026-08-05): new routed workflow `pr-review` adapting the
  TLC pr-review skill (CC-BY-4.0, github.com/augusto-dmh) — six-dimension hosted
  PR/MR review posting inline comments + one consolidated summary, GitHub `gh` +
  GitLab `glab`, massa-ai roster dispatches (audit-specialist ×5 by lens incl.
  coverage-under-performance per tests-audit precedent, reviewer for regression),
  orchestrator-posts channel discipline, `.specs/` as requirements Track B,
  freshness-gated index retrieval. glab commands verified against official
  GitLab CLI/API docs by a research subagent (citations in design.md D1); stable
  `glab api` Discussions/Notes endpoints are the contract, experimental
  `glab mr note` inline flags noted only as alternative.
- Contract: `.specs/features/pr-review-workflow/{spec,design,tasks}.md` —
  `2 Phases = 6 Tasks`, inline execution (batch worker declined: one dominant
  prose file, sequential deps). Plan Challenge full pre_mortem
  (massa-ai-plan-critic): F1 consolidation check recorded (D2b, six dispatches
  stand), F2 live read-only dry run added (gh side executed against PR #73:
  identity/metadata/diff/files/comments all resolve; glab skipped-with-reason —
  not installed), F3 80% confidence gate → qualitative bar, F4 accepted
  (read-only classification with outward posting), F5 byte ceiling measured.
- Commits: `55ed20e2` (specs) `18e0dbe6` (T1 workflow file, 17,424 B)
  `T2` router row + tier-3 clause (SKILL.md 20,091 B ≤ 21,000)
  `T3` count locks 38→39 + complement 22→23 (observed red→green)
  `T4` CHANGELOG. Gates: generate:artifacts --check no drift; integrity +
  duplication + parity + size 81/0; doc-paths 0 misses; lint 0; test:scripts
  1451/4 — the 4 fails are the documented `.claude/worktrees/` needle-anchor
  contamination class (3 sibling checkouts duplicate `const DAMPING = 0.85;`;
  same class as workflow-metadata-headers AC5 amendment; CI authoritative).
- Validation (author ≠ verifier, iteration 1 of 3): PASS — 26/26 lettered ACs
  (17 structural via verifier-owned gate runs, 9 prose via clause quotes),
  5/5 discrimination mutations killed (count-lock revert, persona-line delete,
  intake-line delete, multiline frontmatter description, bare-role rename; all
  restores cp-based and diff-verified — never git checkout), 6 suites 131/0,
  parity no drift, doc-paths 0 misses, check_specs_delivered 0. Verifier note:
  a YAML folded-scalar mutation variant was correctly non-red (folding removes
  the newline pre-parse) and was redone as a literal block scalar — real red.
  validation.md carries the validate_state-parseable Summary/Result shape.
- Next: push + PR (user decision, outward-facing; not taken unattended).

## Previous — Plugin Architecture Unification (**VALIDATED PASS 2026-08-05** — 17/17 ACs, 6/6 mutations, fix loop iteration 2; merged as PR #74 @ `46e7af97`)

- projectId: `massa-ai` · workflowSessionId: `spec-plugin-architecture-unification` ·
  workflow: spec-driven (Large) · branch `spec/plugin-architecture-unification` from
  `96ee1850`, origin/main (v1.29.0) merged at `bb3e90bf` (CHANGELOG conflict resolved).
- Scope (user decisions 2026-08-05): AD-017 "plugins deliver, MCP serves tools, hooks
  observe" — (1) OpenCode installer registers MCP alongside plugin (54 tools; the
  plugin-presence skip in install-agents.sh removed; uninstall leaves the MCP entry,
  PAU-03 user-confirmed); (2) harness skip-current gated on per-host on-disk sentinel
  (route-keyed presence probe, reinstall bias); (3) Cursor prefers the Claude-bridge
  load (installed_plugins.json + enabledPlugins probe, installRoute bridge|local,
  local fallback, hooks fire once); (4) OpenCode plugin hooks-only (14 in-process
  tools removed; hybrid subset rejected). Folded baseline: cursor flat agents,
  opencode real copy, install-skills cursor warning (session
  debug-harness-install-cursor-opencode). Single PR (user decision).
- Contract: `.specs/features/plugin-architecture-unification/{spec,design,tasks,context}.md`
  — `4 Phases = 10 Tasks`, 2 general-purpose batch workers (massa-ai-builder type
  unregistered this session) + T1/state in main thread. Commits `f0d84a7e` (specs),
  `0a81f85d` (T1) .. `186bbd12` (T10), fix `8376dee6`. Plan Challenge: standalone
  fresh-eyes pre-mortem (critic agent unavailable) — F1 bridge-probe surface + F2
  live-shape fixtures + F3 specs-commit sequencing folded; F4 stale-local-MCP accepted.
- Validation (author ≠ verifier): FAIL iteration 1 (PAU-14 gap — "in-process profile
  tool" phrase outside the sweep literal list, CLAUDE.md:368 + FEATURES.md:527) →
  fix `8376dee6` (class enumerated, pop 142) → PASS 17/17 ACs, 6/6 mutations killed,
  gates green (single-writer 57/0, plugin-auto-install 201/0, cursor 25/0, opencode
  27/0 + 125/0, parity 88/0, lint 0, test:plugins 119/0, test:scripts 1455/0).
  Verifier independently re-derived the sweep (184-row superset, 0 live). L-021
  recorded by verifier. Known post-merge user actions: machine repair commands
  staged in the session final report (live ~/.cursor + ~/.config/opencode re-run).
- Post-PR: coverage floor caught index.ts at 88.93% after the hooks-only slimming → `c1334397` (coverage to 99.63%, MASSA_AI_REINDEX_DEBOUNCE_MS knob + turbo passthrough) and `7aef1eba` (closed a LATENT real-config pollution race: config-cli-profile's module-scope require froze CONFIG_DIR before any scratch XDG existed, so CI suites initialized the runner's real ~/.config/massa-ai — also the mechanism behind the build job's api-key flake; every shared/config importer now pulls env-setup first, verified zero writes under a scratch HOME). One coverage run also died in runner bunx-cache corruption (infra, rerun green). Main-checkout branch moved mid-session to a sibling session's branch — delivery continued from worktree .claude/worktrees/pau.
- Deviations recorded: T10 split (worker CHANGELOG+gates / orchestrator state files);
  T9 repaired 3 suites left stale by Batch 1 behavior changes + latent
  00.harness.smoke EXPECTED_TOOLS 52→54 gap; FEATURES.json untracked-generated-bundles
  status closed to complete (was stale in-progress after PR #73 merge).
- massa-ai MCP server used this session (recall only); .specs/ files canonical.

## Previous — Untracked Generated Bundles (**VALIDATED PASS 2026-08-05** — 17/17 ACs, 7/7 mutations after fix loop 1; merged as PR #73 @ `40ec631a`, released v1.29.0)

- projectId: `massa-ai` · workflowSessionId: `spec-untracked-generated-bundles` ·
  workflow: spec-driven (Large) · persona: AI Engineer · branch
  `spec/untracked-generated-bundles` from `main` @ `724ad02d` (post PR #72).
- Scope (user decisions 2026-08-05): untrack all 1,141 generated bundle files
  across all four plugins (git-marketplace channel included — documented
  generation prerequisite + opt-in post-merge hook snippet, never
  auto-installed); generation-on-demand contract (AD-016). Approach A:
  prune-before-emit in both generators, root `generate:artifacts` +
  pre-scripts (`pretest:{scripts,plugins,coverage}` + opencode package
  `pretest`), checkout-detected install.sh generation with
  `MASSA_AI_SKIP_ARTIFACT_GENERATION` harness once-only, ci.yml + publish.yml
  build-job steps (publish jobs are artifact-only — prepack rejected).
- Pre-mortem (full gate): critical coverage.yml third-entry-point finding →
  UGB-17; nine .gitignore root-precise entries protect hand-authored
  codex/cursor quick skills + hooks.json + claude hook source.
- Contract: `.specs/features/untracked-generated-bundles/{spec,design,tasks}.md`
  — `3 Phases = 14 Tasks`, 3 massa-ai-builder batch workers, 17 commits
  `381b48d7`..`247ef8ef`. Accepted interpretations: REPO_ROOT (not
  PLUGIN_SOURCE_ROOT) checkout detection; T10/T11 sensor split; 4 shell suites
  scoped with skip env to preserve discrimination.
- Validation (author ≠ verifier): FAIL iteration 0 (2 surviving mutants:
  pretest:coverage deletion, .gitignore entry deletion) → fix `247ef8ef`
  (`generated-bundles-contract.test.ts`, both observed red) → PASS 17/17 ACs,
  7/7 killed, gates 6/6, validate_state exit 0. Cold path: fresh worktree,
  bundles absent → test:scripts 1435/0, test:plugins 104/0, opencode 139/0,
  turbo 11/11.
- massa-ai MCP server not used this session; `.specs/` files canonical.

## Previous — Registry Cleanup And Skill Imports (**VALIDATED PASS 2026-08-05** — 24/24 ACs, 4/4 mutations; merged as PR #72 @ `724ad02d`)

- projectId: `massa-ai` · workflowSessionId: `spec-registry-cleanup-skill-imports` ·
  workflow: spec-driven (Large) · persona: Context-Skill Harness Engineer/Architect
  (pinned) · branch `spec/registry-cleanup-skill-imports` from `main` @ `394770fc`
  (v1.27.0, after PR #71 merge).
- Scope (user-directed 2026-08-05): skills/AGENTS.md registry cleanup — deleted
  §Orchestration Model + §Future Integration + both "symlinked" claims; Capability
  Packet / Output Contract → pointers to canonical agent-orchestration.md
  (ORC-06/ORC-08 mirror reversed — recorded; its rationale was factually wrong);
  judge permission fixed end-to-end (charter `write` v1.2.0; WRITE_AGENTS in
  generator + parity test + claude-plugin install test — THREE roster copies);
  bootstrap stack → 3 items (coding-guidelines folded into massa-ai as
  `references/coding-guidelines.md`, lazy Core Contract load); `!.env.example`
  ignore carve-out. Imports: to-prd + skill-architect → workflows (WMH
  frontmatter; skill-architect keeps CC-BY-4.0 + attribution, user decision
  2026-08-05; WMH gate license allowlist + EXPECTED_WORKFLOW_COUNT 36→38);
  3 skill-architect references + validate_skill.py. capability-packet-parity
  test retired; skills-harness-integrity PACKET_FILES 3→2 with AGENTS.md kept
  in AUTHORITY_SCANNED_FILES; workflow-harness-contract 36→38, complement
  20→22, intake lines added to both new workflows.
- Contract: `.specs/features/registry-cleanup-skill-imports/{spec,design,tasks}.md`
  — `3 Phases = 8 Tasks`. Plan Challenge full (pre_mortem, massa-ai-plan-critic):
  C1 critical count-lock (folded), C2 authority-scanner narrowing (folded),
  C3 pointer-clause sensor (folded), C4 CC-BY-4.0 licensing (user decision).
- Execute: T1–T6 one massa-ai-builder Phase worker (6 commits
  7e38f3cd..4cdd0175); T7 @ 1e02fcc7 (regen + WRITE_AGENTS both rosters +
  agent-orchestration stale-citation repoint); T8 @ 3eb83bea (population locks,
  intake lines, third roster copy, CHANGELOG). Gates: test:scripts exit 0
  (1414 tests + 8 shell suites), lint 0, test:plugins 96/0, both generators
  --check clean. Useful-Agent-Skills source repo untouched (porcelain empty).
- Post-validation: 4th WRITE_AGENTS roster copy fixed (opencode agents-install, CI root cause); validate_skill ported .py→.ts (user directive; Bun.YAML); lessons L-019/L-020 recorded.
- massa-ai MCP server not used this session; `.specs/` files canonical.


## Previous — Skill Token Optimization (**VALIDATED PASS 2026-08-05** — T1–T12 done; merged as PR #71 @ `ef595210`, released v1.27.0)

- projectId: `massa-ai` · workflowSessionId: `spec-skill-token-optimization` ·
  workflow: spec-driven (Large) · persona: AI Engineer (pinned) · branch
  `spec/skill-token-optimization`, worktree
  `.claude/worktrees/skill-token-optimization`, cut from `main` @ `41daeb68`.
- Scope STO-1..9 (user-directed 2026-08-05): lazy-load extractions — SonarQube
  MCP protocol → new `references/sonarqube-mcp.md`; mobile/Figma design-source
  intake gate → `references/mobile-context.md`; high-value set (audit-scope
  5-branch dedupe across 6 audit workflows, SKILL.md graceful-degradation
  table → `references/graceful-degradation.md`, brownfield 7-doc table,
  general.md dupe deletion, judge/meta-judge model-hint dedupe, stacked-branch
  restatement deletions, spec-driven trims). Validator top pack:
  `validate_audit_report.ts` + `validate_design.ts` (red-first) wired into
  9 `*-fix.md` + audit-report-io + spec-driven design step. Then caveman
  compression of 36 workflows + 87 references + 17 agent charters
  (prose-only; protected literals/code/tables byte-preserved; no
  `*.original.md`). Baseline @ 41daeb68: 339,809 / 603,273 / 63,781 B.
- Contract: `.specs/features/skill-token-optimization/{spec,design,tasks}.md`
  — `3 Phases = 12 Tasks` (T1 main, T2–T7 + T8–T11 two sequential
  massa-ai-builder Phase workers, T12 main + verification-agent).
  validate_spec/validate_tasks green (12 tasks parsed).
- User decisions 2026-08-05: high-value extraction set IN; validator top pack
  IN; Execute GO with Phase workers (delivery through PR; merge user's);
  merge order INVERTED in practice: `workflow-metadata-headers` merged first
  (PR #70 @ `519766bc`); origin/main merged into this branch — frontmatter +
  compressed bodies combined, only .specs state files conflicted. DO-NOT-EXTRACT: dispatch blocks
  (agent-orchestration.md:92-93 invariant).
- Investigation reports (2 read-only subagents, 2026-08-05): 27 conditional
  findings (~15 actionable; marginals deferred), 24 deterministic-check
  mechanisms (top pack in scope; rest = follow-up backlog candidate).
- Execute: T1 @ 8ecbeccc (guards, red-calibrated); T2–T7 Phase worker (6 commits, extractions + validators, full test:scripts 1362/0); T8–T11 Phase worker (compression, −3,060 B source); boilerplate pass @ daf7a2c2 (−3.3 KB preambles/Synapse dedupe); origin/main merged @ 69678336 (WMH frontmatter + compressed bodies, only .specs conflicted; both generators --check 0; post-rebuild test:scripts 1424/0, lint 0, test:plugins 96/0). Measurement vs origin/main: workflows 348,591→322,689 (−7.4%); total −11,405 B; ≥20% goal MISSED (corpus contract-dense; win is structural lazy-loading). CHANGELOG entry added.
- massa-ai MCP server not used this session; `.specs/` files canonical.
## Previous — Workflow Metadata Headers (**VALIDATED PASS 2026-08-05** — T1–T5 done; PR #70 open, CI 14/14 green; merge = user decision)

- projectId: `massa-ai` · workflowSessionId: `spec-workflow-metadata-headers` ·
  workflow: spec-driven (Medium) · persona: AI Engineer (pinned) · branch
  `spec/workflow-metadata-headers` from `main` @ `41daeb68` (plain branch in main
  checkout — clean tree, no parallel session; worktree-isolation deviation recorded).
- Scope WMH-01..06 (user-directed 2026-08-04, pattern ref
  https://agentskills.io/specification): Agent Skills-style YAML frontmatter on all
  36 `skills/massa-ai/workflows/**/*.md` — `name` = file stem, hand-authored
  double-quoted `description`, `license: MIT`, `metadata.version: "1.0.0"`;
  prepend-only (body byte-identical); new real-YAML-parse gate
  `scripts/__tests__/workflow-metadata-headers.test.ts` (red-first); bundle regen +
  `--check` 0; test:scripts + lint green; CHANGELOG entry.
- Contract: `.specs/features/workflow-metadata-headers/{spec,tasks}.md` — Design
  skipped (format fixed by external spec + repo SKILL.md convention). `1 Phase = 5
  Tasks`. Full Plan Challenge (pre_mortem, massa-ai-plan-critic): F1 critical —
  unquoted YAML plain scalars break on 8/36 opening paragraphs (inline `: `) —
  folded as quoted-scalar + real-parser sensor; F2 skills.yml validates only
  SKILL.md, new test is sole backstop (PR note); F3 wrap-truncation moot via
  hand-authored descriptions; F4 generator byte-copies defects into 4 bundles
  (PR note); F5 length ceiling 20–1024.
- Execute: go-ahead given (full delivery incl. push + PR; merge stays user's).
  T1–T4 via one massa-ai-builder Phase-group worker (user accepted offer);
  verification-agent + T5 delivery by main agent.
- massa-ai MCP server not used this session; `.specs/` files canonical.
- Progress (2026-08-05): T1 sensor observed red (0 pass / 1 fail — all 36 files
  missing frontmatter), green post-T2 (1 pass / 0 fail, population 36 printed).
  T2 @ `bfddbb69` — wrong-branch incident: the worker's commit first landed on
  `spec/skill-token-optimization` (a concurrent session's worktree branch that had
  been checked out under us mid-run, reflog-verified); parent verified the commit
  (37 files, 0 outside scope) and cherry-picked it here; the sibling branch was
  left untouched. Byte-check re-run by parent: 36/36 byte-identical after
  stripping frontmatter vs `f414cdbf`. T3 @ `32f54c83` — bundle regen exit 0,
  `--check` exit 0 (647 files emitted, 144 committed = 36 × 4 hosts).
  T4 (inline after the worker hit its API weekly limit): lint exit 0;
  `test:scripts` 1329 pass / 4 fail — all 4 are `needle-resolution`/
  `check-frozen-anchors` scanning concurrent worktrees under `.claude/worktrees/`
  (`DAMPING` anchor 3×, 2 in sibling checkouts; `git diff f414cdbf HEAD` empty on
  those paths — not WMH fallout; AC5 amended in spec.md: CI is the authoritative
  venue; scanner-boundary fix recorded as follow-up). `skills-duplication-metric`
  ceiling 331 → 471 with in-file reason (mandated frontmatter uniformity, gate's
  own documented-raise convention). CHANGELOG entry under [Unreleased] ### Added.
- T5 delivery (2026-08-05): validation.md committed @ `bfcab362` (PASS — 6/6 ACs
  re-derived, 5/5 mutants killed, sha256-verified restores). PR #70
  (https://github.com/luizgmassa/massa-ai/pull/70) initially CONFLICTING — sibling
  PR #69 (model-profile-switching) merged to main 6 min before #70 opened, and a
  conflicted PR never starts `pull_request` checks (zero checks, not red ones).
  Merged `origin/main` @ `b334234b` in: conflicts HANDOFF.md + FEATURES.json
  resolved keeping both histories (65 features, active = this); CHANGELOG
  auto-merge had mis-placed this branch's entry inside released [1.25.0] —
  relocated to [Unreleased]. Post-merge: regen `--check` 0, sensor 36/36, dup
  metric 20/0 @ 471, lint 0; local test:scripts residue = known worktree
  contamination only (DAMPING now 2×, sole live sibling worktree). CI: 14/14
  green after one coverage re-run — single flaky core `trace_path` MAX_DEPTH
  test failed then passed on identical commit; not WMH-related. Merge = user's.
- Follow-up candidates recorded: add `.claude/` to
  `benchmarks/needles/resolve.ts` IGNORED_DIRECTORIES (kills the local
  worktree-contamination class); optionally refresh installed
  `~/.claude/skills/massa-ai` copies post-merge.

## Previous — Persona Router Token Optimization (**VALIDATED PASS 2026-08-04** — T0–T9 done; PR #68 open, CI 14/14 green; merge = user's decision; PRT-02 live walkthrough pending-restart)

- projectId: `massa-ai` · workflowSessionId: `spec-persona-router-token-optimization` ·
  workflow: spec-driven (Large) · branch `spec/persona-router-token-optimization`,
  worktree `.claude/worktrees/persona-router-token-optimization`, cut from
  `origin/main` @ `d18e7764` (v1.23.0 release commit).
- Scope PRT-01..09 (user-directed, 2026-08-04): persona routing measured at ~8k
  tokens/session (SKILL.md 13,316 B + full catalog 8,871 B + prompt 4,929–8,308 B)
  plus full double registration on the user machine (user-level installs AND
  massa-ai@massa-ai local plugin; user-level agent roster stale at 16). Fixes:
  persona_pin fast path (data line in project AGENTS.md — line-start
  `persona_router:` outside the bootstrap block is gate-forbidden), SKILL.md slim
  ≤5,000 B (6 gate-anchored sentences retained), catalog schema_version 2 index
  ≤2,500 B + per-persona signals/<id>.json, prompt compression ≤4,500 B,
  persona-route:<projectId> memory contract, machine dedupe (keep installs, drop
  plugin — user decision), size-budget gate (red-first) + install-skills.sh
  --check double-surface probe.
- Contract: `.specs/features/persona-router-token-optimization/{spec,design,tasks}.md`
  — 2 Phases = 10 Tasks (T0–T6 repo, T7–T9 machine + delivery). Full Plan
  Challenge (pre_mortem, massa-ai-plan-critic) F1–F6 all folded: F1 critical —
  `apps/claude-plugin/install.sh` re-registers the plugin and deletes loose
  `~/.claude/{commands,agents}/massa-ai-*.md` by default; C11 reordered
  (suppressed refresh first, disable LAST, 3-file falsifying re-check). F3 —
  `validate-repository.test.ts` hardcodes schema_version 1; C13 repoint task. F4 —
  settings.json evidence redacted to enabledPlugins/hooks (live OAuth token). F6 —
  PRT-02 walkthrough restart-gated.
- massa-ai MCP server unreachable this session; `.specs/` files canonical.
- T6 landed @ `ef29a3cc` (double-surface probe + shell suite red-then-green 14/0 +
  CHANGELOG). `origin/main` (v1.24.0, PR #67) merged in @ `ad04e953` — conflicts only in
  `.specs/` state files + CHANGELOG, resolved keeping both histories; post-merge gates
  223/0 (integrity, capability-packet parity, size budgets, validate-repository),
  bundles no-drift. T7 COMPLETE after the user approved prompt-by-prompt retries (the
  classifier denied the first attempt): 1b file-route plugin install from the MAIN
  checkout (17 specialists + 6 commands; hooks merge self-skipped — plugin still
  registered, the C11-order guarantee); 2 broken symlinks removed; 3 LAST
  `enabledPlugins["massa-ai@massa-ai"] = false` + user-approved removal of the dead
  `th0th` MCP entry from `~/.claude.json` (backups taken); `installed_plugins.json`
  has no enablement field → alignment no-op, record retained (F5). Falsifying re-check
  caught a stale `massa-ai-handoff-writer.md` (file route copies, never prunes) —
  removed with explicit user approval → roster exactly 17, judge + meta-judge present.
  Post-merge skills re-refresh (installed copy predated the main merge; `--check` then
  0 drift, real exit 0). Hooks byte-identical to BEFORE. Evidence (redacted per AC5):
  `/tmp/prt01-evidence.md`, summarized in validation.md.
- T8: PR #68 (https://github.com/luizgmassa/massa-ai/pull/68), CI 14/14 green;
  `test:scripts` exit 0 (1,332/0 TS + all shell suites 0-failed), `test:plugins` 96/0,
  lint 0. T9: independent verification-agent PASS — 5/5 scratch mutations killed,
  per-AC evidence in `validation.md`; PRT-02 AC1–3 pending-restart (F6), PRT-06
  documented-contract only (MCP down). Merge stays the user's.

## Previous — Sub-Agent Orchestration I/O (**VALIDATED PASS 2026-08-04** — 9/9 ORC ACs, 3/3 mutations killed; merged as PR #67 @ `5b338af4`, released v1.24.0)

- projectId: `massa-ai` · workflowSessionId: `spec-subagent-orchestration-io` · workflow:
  spec-driven (Large) · persona: AI Engineer · branch `spec/subagent-orchestration-io`,
  worktree `.claude/worktrees/subagent-orchestration-io`, cut from `origin/main` @
  `d18e7764` (v1.23.0 release commit).
- Scope ORC-01..09 (user-directed 2026-08-04, from Fowler "The Orchestrator's Tax"):
  no-polling/no-transcript-ingestion rule; wave cap 4 + consolidation check;
  cognitive-locality consolidation signal; git safety for concurrent workers; subagent
  non-inheritance; canonical Capability Packet (13 backticked fields incl. conditional
  `lens`, `next_use` renamed from the input-side `exact next step` bullet — output-side
  `Exact next step` return field unchanged, 251 occurrences exempt as a class);
  40-line default return bound + dual-channel rule; `skills/AGENTS.md` mirror +
  `scripts/__tests__/capability-packet-parity.test.ts` (observed red, then green);
  standard dispatch blocks added to `judge-with-debate.md` (2) and
  `furps-refinement.md` (1) — census 24 → 27 blocks, 9 field counts = 27 each.
- Contract: `.specs/features/subagent-orchestration-io/{spec,design,tasks}.md` —
  `2 Phases = 8 Tasks`. Full Plan Challenge (pre_mortem, massa-ai-plan-critic): F1-F4
  folded before Execute; F1's 203-hit rename population re-measured to exactly 1
  input-side occurrence (verify-the-mechanism).
- Execute ran inline (batch-worker offer not honorable: autonomous session, user absent;
  recorded deviation — precedent workflow-policy-updates). Commits: `3c02462c`
  activation, `1e530528` T1, `a9540ddd` T2, `9acdaff4` T3, `e2ee6e72` T4, `0a246af8` T5,
  `d924f7eb` T6, `f380317f` T7, T8 = this commit. Per-task gates:
  `generate-skill-artifacts.ts --check` no-drift + literal grep sensors, populations in
  each commit body.
- Delivery deviation (closed): push + `gh pr create` were deferred pending the user's
  go-ahead; subsequently delivered and merged as PR #67 @ `5b338af4`, released v1.24.0.
- massa-ai MCP server unreachable that session; `.specs/` files canonical.

## Previous — Workflow Policy Updates (VALIDATED, merged via PR #66, released v1.23.0)

- projectId: `massa-ai` · workflowSessionId: `spec-workflow-policy-updates` · workflow:
  spec-driven (Medium-Large) · branch `spec/workflow-policy-updates`, worktree
  `.claude/worktrees/workflow-policy-updates`, cut from `origin/main` @ `07ffa7fd`
  (v1.22.0 release commit).
- Scope WFP-01..05 (user-directed, 2026-08-04): Compose/KMP `@Preview` rule for
  implementation workflows (`mobile-context.md` normative + `mobile-diagnosis.md`
  pointer); PR description updated after each requested push, before merge
  (`implementation-delivery.md`); Figma pre-analysis + strictly-sequential retrieval
  subagent protocol (new `references/figma-pre-analysis.md`, wired into design,
  mobile-figma-audit, mobile-figma-fix, feature, spec-driven local gates + router list);
  abbreviation expansion on first use and uniform Phase/Task vocabulary
  (`1 Phase = X Tasks` / `Y Phases = Z Tasks`) as SKILL.md Core Contract bullets, with
  spec-driven sub-agent offer reworded off "batch" nouns.
- Contract: `.specs/features/workflow-policy-updates/{spec,design,tasks}.md` — 2 Phases =
  5 Tasks (Phase 1 = 4 Tasks, Phase 2 = 1 Task). Full Plan Challenge (pre_mortem,
  massa-ai-plan-critic): F1-F6 all folded before Execute — key folds: absence sensors for
  the protocol's single-copy criterion (F1), wiring into local gate lines only because
  `mobile-context.md`'s shared design-source gate also serves rfc/adr/tdd (F2), literal
  grep sensors committed in tasks.md (F4).
- Execute ran inline in the main agent (no batch-worker offer honored: autonomous
  session, user unavailable to confirm; recorded deviation). Commits: `5abb8278`
  activation, `f0701b93` T1, `147e3209` T2, `c557997b` T3, `bb3bfd92` T4, T5 = this
  commit. Each task commit carries its regenerated 4-host bundles; per-task gates
  `generate-skill-artifacts.ts --check` + oxlint green; sensor populations printed in
  each commit body.
- Accepted assumptions (user absent): "implementation workflows" = the 16 loaders of
  `implementation-delivery.md`; feature.md included in WFP-03; ticket.md "Phase/Wave"
  Jira naming out of scope (external structure); delivery-through-PR authorized, merge
  stays the user's.
- massa-ai MCP server unreachable this session; `.specs/` files canonical.

## Previous — Python→TypeScript Scripts + Lessons Single-Store (**VALIDATED PASS 2026-08-04 — T1-T12 + FT1-FT3 (FT2-FT3 = delivery repairs 1-2), 2 verification iterations; PR #65 open, merge = user's decision**)

- **Validation:** independent verifier (deep tier) iteration 1 FAIL (1 critical gap:
  mutation (b) — naive rounding for `roundHalfEven2` — survived the whole delivered gate
  set; Plan Challenge F1's "exercised, not assumed" violated once T11 deleted the dual-run
  harness) → FT1 `67e769ca` (two mutating golden entries at the 0.625 boundary, observed
  red 44/2 with the exact 0.63-vs-0.62 signature) → iteration 2 **PASS** (kill re-confirmed
  independently, 4/4 mutations killed, no regression: goldens 46/0, `test:scripts` 1323/0,
  lint 0). Report: `.specs/features/python-to-typescript-scripts/validation.md`. Lesson
  L-016 recorded via `lessons.ts add` (grounded in validation.md Finding 1).

- projectId: `massa-ai` · parent workflowSessionId: `spec-python-to-typescript-scripts` ·
  workflow: spec-driven (Large) · branch `spec/python-to-typescript-scripts`, worktree
  `.claude/worktrees/python-to-typescript-scripts`, cut from `origin/main` @ `e932a673`
  (the PR #64 merge commit; that merge's minor release chain was in flight at cut).
- Scope: PTS-01..06 (8-script py→ts migration under Bun, CLI/exit/output parity) + LSN-01
  (lessons single-store: `.specs/lessons.json` survives, `LESSONS.md` + render path
  deleted). User decisions this session: json survives (over markdown-canonical), one
  combined feature (over two sequential), delivery-through-PR authorized for the feature,
  merge stays the user's.
- Contract: `.specs/features/python-to-typescript-scripts/{spec,design,tasks}.md` — spec
  amended (LSN group; PTS-02 + Out-of-Scope losing clauses superseded in place with
  reasons), design D1-D9, 12 tasks / 4 phases, all 12 marked `[x]`. Full Plan Challenge
  (pre_mortem, massa-ai-plan-critic, deep): 4 findings F1-F4 ALL folded before Execute — F1
  Python `round()` half-to-even parity sensor (0.625-class boundary op exercised in T9), F2
  sweep-blind installed commit-msg hook symlinks (T4 local repoint + T12 CHANGELOG operator
  note), F3 golden fixtures materialized before the dual-run harness's deletion (T11), F4
  coverage floor verified to never reach `scripts/`/`skills/` (R6 reframed). See design.md
  Plan Challenge Record.
- Execute ran as 3 sequential batch workers (offered per the >3-task trigger, user
  confirmed): B1 T1-T3 (LSN-01 + harness), B2 T4-T9 (six skill-script ports), B3 T10-T12
  (repo scripts + golden/sweeps + close-out). Commit range (`e932a673..HEAD`, 12 task
  commits + 1 pre-Execute activation commit): `b4782690` activate, `b8ef61e5` T1,
  `d6ca0747` T2, `74a19f2c` T3, `6b4e383f` T4, `e4931929` T5, `140398ed` T6, `109a8885` T7,
  `cccaad7b` T8, `3bc677c4` T9, `9e8ea516` T10, `1503995f` T11, T12 this commit. One atomic
  commit per task, status-before-commit, same-commit bundle regen + `--check`, dual-run
  parity before every `.py` deletion (T10 used scratch-copy byte-diff instead, per its
  mutating-in-place shape), python3 always spawned with `-B` (L-015).
- All 8 scripts are now `.ts` under Bun; every `.py` original is deleted. Final sweeps
  (T11, populations printed in the T11 commit body): `python3` under `skills/` +
  `apps/*/skills/` 25→0; the 8 scripts' `.py` basenames under the same scope 10→0;
  `LESSONS.md` live refs repo-wide 33 matches, all exempted (sealed other-feature history,
  this feature's own artifacts, this feature's own STATE/HANDOFF narrative, the
  validate-repository absence sensor) — zero unexplained. `scripts/pyts-dual-run.ts`
  deleted; its oracle role lives on in `scripts/__tests__/pyts-golden.test.ts` (44 golden
  cases, pure `bun test`, no python3).
- Gates green at T12 close: `bun run test:scripts`, `bun run lint`,
  `generate-skill-artifacts.ts --check`, `generate-subagent-artifacts.ts --check`, the four
  ported validators + `check_specs_delivered.ts` dogfooded against this feature.
- massa-ai MCP server unreachable this session; `.specs/` files canonical per contract.
- **Delivery repair 1 (FT2, post-`e6d8362a`):** PR #65 CI red on `e6d8362a` — `build`
  (run 30952327811, `Test` step) and `coverage` (run 30952330241) both failed on the one
  turbo task `@massa-ai/opencode-plugin#test`; `mcp`/`install-test` skipped downstream
  (the `github-advanced-security` check-run failure is pre-existing — red on both PR #64
  heads too, merge state CLEAN — not this branch's doing). Root cause (log-verified and
  reproduced locally): Bun test discovery matches any file ending `_spec.ts`; the
  migration shipped `validate_spec.ts` into the plugin's bundled `skills/` tree, and
  opencode-plugin is the only plugin declaring its own `test` script — its bare
  package-wide `bun test` walked the bundle, loaded the CLI as a test module, and died on
  its usage error. The old `.py` was invisible to discovery; local gates missed it
  because the feature's scoped set ran `test:scripts`, never turbo `bun run test` —
  lesson L-007's blind-spot class. Fix FT2 (tasks.md Phase 6): `"test": "bun test
  __tests__ src/__tests__"` — the package's two real test dirs, find-verified, nothing
  that ever ran excluded. Gates re-run, each command's own exit code, no pipes:
  turbo-filtered `@massa-ai/opencode-plugin#test` 0 (124/0 across the same 6 files),
  `test:scripts` 0 (1323/0 TS + shell suites), `lint` 0, `validate_tasks.ts` 0 errors.
  One atomic FT2 commit (package.json + tasks.md + STATE + HANDOFF,
  status-before-commit); no verifier re-dispatch for a delivery-stage repair (precedent:
  tlc-330 FT6) — CI green is the gate.
- **Delivery repair 2 (FT3, post-`46f7e581`):** FT2 turned `build` green; `coverage`
  (run 30953865966) stayed red — one root cause, but a **second discovery mechanism**,
  not a second venue of the same one: `check-coverage.ts`'s opencode-plugin UNITS entry
  spawns its own bare `bun test --coverage` in the package cwd and never consults the
  package.json `test` script FT2 scoped, so the coverage walk still loaded the bundled
  `validate_spec.ts` (`suite exited 2`, no lcov.info — same usage-error signature).
  Found by enumerating every bare `bun test` call site instead of re-reading FT2's
  resolution; populations in tasks.md FT3 (3 of 6 UNITS entries bare; `*_spec.ts` per
  unit dir 0,0,0,0,0,1 — opencode-plugin the single live site; `test:plugins` /
  `test:scripts` dir-targeted, safe). Fix: the unit command mirrors the package's own
  test script (`bun test __tests__ src/__tests__ --coverage …`). Evidence: observed
  red→green on the exact unit command (bare exit 2, no lcov, CI-identical signature →
  scoped exit 0, lcov.info, 124/0); venue mirror `bun run test:coverage
  apps/opencode-plugin` against the dedicated 5433 DB exit 0 — merged 1 lcov, 4 source
  files measured, floor PASS. Gates re-run, own exit codes: check-coverage.test solo
  23/0, `test:scripts` 0 (1323/0), `lint` 0, `validate_tasks.ts` 0 errors. One atomic
  FT3 commit; still no verifier re-dispatch (delivery-stage repair).
- Next action: push FT3 → re-watch PR #65 to green (poll the new sha's check-run count
  >0 before `gh pr checks --watch` — the old-sha rollup race) → merge decision to the
  user (minor release on merge). `check_specs_delivered.ts` + `validate_state.ts` both
  exit 0 on the close-out commit.

## Previous — TLC 3.3.0 Harness Update (**VALIDATED PASS 2026-08-04 — T1-T22 + FT1-FT6 (FT6 = delivery repair 1), 5 verification iterations; MERGED as PR #64 @ `e932a673` 2026-08-04, release chain fired on green main CI**)
- **Phase 5 amendment (user, post-PR#64-green):** ALLWF-01/02 Core Contract rules + KVC
  leads-not-truth rewording (T19 `e751c777`), ALLWF-03 read-only charter sweep to `deep` —
  14/17 charters deep, 3 write-capable unchanged (T20 `277ec7a5`), PYTS-01
  `python-to-typescript-scripts` spec authored + registered planned P2 (T21 `b291b0fb`).
- **Validation:** independent verifier (deep tier) iteration 1 FAIL (2 gaps: __pycache__
  drift under combined suites — GEN-01 blocker; validate_state.py verdict collision —
  SYNC-12 major) → FT1 `19ebe0cd` + FT2 `98f76d0f` → iteration 2 **PASS** (gaps closed,
  mutation killed, gates 0). Report: `.specs/features/tlc-330-harness-update/validation.md`.
  Non-blocking follow-ups recorded there: IT2-01 (validate_tasks.py FT-prefix headers fold
  into prior task's record), IT2-02 (anchor _verdict candidate match to declaration lines).
- **Delivery repair 1 (FT6, post-`bf23b925`):** PR #64 CI `build` red in `bun run
  test:scripts` — 3 failures, all stale tests vs ALLWF-03's tier sweep, outside the scoped
  verification set (validation.md's recorded scope limit): duplication-metric ceiling 313 <
  measured 331 (differential main→branch: the +18 excess is charter frontmatter made
  identical by pinning the 8 remaining read-only charters `deep`; raised with reason via
  the ceiling's own documented path — same class as T16's parity-allowlist addition),
  `loadCharter` hardcoded investigator `light`, profile-selection test read investigator
  artifacts (moved to `documentation-agent`, the one remaining light charter). Worktree
  was wholly unprovisioned (no `node_modules`) — repaired per the CLAUDE.md fresh-worktree
  rule (install + 4-dir addon copy + `bun run build`; grammar contract suite 9/0). Full
  gates re-run locally, each command's own exit code, no pipes: `bun run test:scripts` 0
  (1277/0 TS across 56 files + shell suites), `bun run lint` 0, `validate_tasks.py` 0
  errors. One atomic commit (both test files + FT6 record + this file + HANDOFF, status
  closed before commit); push + `gh pr checks 64` re-watch is the delivery gate; merge
  stays the user's decision (minor release).


- projectId: `massa-ai` · parent workflowSessionId: `spec-harness-330-update` · workflow:
  spec-driven Execute (batched: 2 inline task ranges + 3 sequential batch workers, offered
  and confirmed per BATCH-01) · branch `spec/tlc-330-harness-update`, worktree
  `.claude/worktrees/tlc-330-harness-update`, cut from `origin/main` @ `066e86e` (v1.20.0).
- Scope: port TLC 3.3.0's spec-driven harness into massa-ai. Contract:
  `.specs/features/tlc-330-harness-update/{spec,design,tasks}.md`.
- Three phases, 18 tasks, one atomic commit each, commit range `e6b282c4`..`ca621e0a`+close-out:
  **Phase 1 (T1-T6)** four new deterministic validator scripts (`validate_spec.py`,
  `validate_tasks.py`, `check_commit.py` with Jira-prefix support, `validate_state.py`) plus
  `check_specs_delivered.py` (GATE-02, porcelain + tracked-on-HEAD conjunction) and a Unicode
  (NFD) fix to `lessons.py`'s dedup normalizer with a new `selftest` subcommand; **Phase 2
  (T7-T15)** EARS-shaped acceptance criteria and a facts-vs-decisions rule in `specify.md`;
  scripted wiring ("run it, do not eyeball it") for all four validators plus
  `check_specs_delivered.py` across `tasks.md`/`execute.md`/`validate.md`/`sub-agents.md`/
  `workflows/spec-driven.md`; a `git stash` ban with a porcelain-baseline discrimination
  sensor in `validate.md`; status-before-commit reordered into one step in `execute.md`; the
  batch sub-agent offer trigger lowered from `>~8` to `>3` tasks everywhere it is stated; a
  discuss-pace system (Quick/Guided/Detailed) in `discuss.md`; a Writing Voice section and a
  git-reconciliation resume procedure ported into `coding-principles.md`/`memory.md`; a new
  stage 3.5 "deliver specs before PR" in `implementation-delivery.md` plus a blast-radius
  delivery-authorization sentence (one approval per feature covers commits+push+PR); **Phase 3
  (T16-T18)** `verification-agent`'s charter pinned to the `deep` model tier and regenerated
  through both generators in one commit (D9 as amended by Plan Challenge C1), a repo-wide
  threshold sweep (population 0) and a cross-file blast-radius/gate-invocation clause
  consistency check (Plan Challenge C3; both clause families byte-identical or
  parameterized-identical across all touched source + regenerated bundle files), and this
  close-out.
- Plan Challenge folded five findings into the design before Execute (not appended after):
  C1 widened T16's gate to run both generators + both parity tests in the same commit; C2
  reordered close-out to always precede the first push (stage 3.5's remediation branch is a
  defensive fallback that should never fire); C3 added the T17 cross-file consistency check;
  C5 added a template-conformance test tying each validator's expectations to the live
  `specify.md`/`tasks.md`/`validate.md` template blocks so future template drift goes red.
- T16's regen also updated `FEATURES.md`'s role -> tier table and
  `scripts/__tests__/subagent-parity.test.ts`'s frozen-baseline allowlist to record the
  intentional `verification-agent` tier change (outside the task's originally stated write
  set, but required for both parity suites to stay green — not a weakening, an addition to
  the allowlist the test itself designed for this case).
- massa-ai MCP server not consulted this session; `.specs/` files canonical per contract.
- Next action: independent verifier runs the Verification Ladder against this branch
  (author != verifier) and writes `.specs/features/tlc-330-harness-update/validation.md`
  before PR creation, per GATE-02 / `check_specs_delivered.py`.

## Previous — DA Inventory Closure (**VALIDATED PASS 2026-08-03 — EXECUTE + INDEPENDENT VALIDATION COMPLETE; PR open, merge is the user's decision**)

- projectId: `massa-ai` · workflowSessionId: `spec-da-inventory-closure` · workflow:
  spec-driven (Large) · branch `spec/da-inventory-closure`, worktree
  `.claude/worktrees/da-inventory-closure`, cut from `origin/main` @ `8e63477` (v1.19.0).
- Scope: the DA-01..DA-17 inventory of `.specs/reports/cross-pollination-portability-and-gaps.md`
  (folder removed at close-out per the user's instruction — recover via git history)
  §"(a) already documented", re-measured row-by-row at `8e63477` (the report is a week stale and
  was written at `45daaa1`). Full disposition table with per-row evidence:
  `.specs/features/da-inventory-closure/spec.md`.
- Outcome of triage: **7 FIX** (DI-01 LLM seam export + embedded-suite pin; DI-02 UNION GUARD
  wiring sensor; DI-03 `subagent-skills-plugin-parity` registry truth — validated PASS 2026-07-23
  yet still "Specify-only" in the registry; DI-04 stale STATE notes annotated; DI-05 hermetic
  runner config dir; DI-06 native-grammar worktree-provisioning doc; DI-07 CONTRIBUTING
  measurement-discipline section), **8 RESOLVED** with evidence (DA-02/03/06/07/08/09/12 + DA-14's
  code half — BEH-01 shipped it in v1.9.1), **1 ROUTED** (DA-10 → `sqlite-removal-followup`),
  **2 ACCEPTED** (DA-04 CodeQL platform behavior; DA-13 do-not-chase flakes, already documented).
- Session measurements worth keeping: fresh-worktree `bun install` under Node 25.9.0 on macOS
  arm64 exits 0 with **no native tree-sitter build** (silent node-gyp failure) → exactly DA-16's
  3 red suites; copying `node_modules/tree-sitter*/build/` from the provisioned main checkout
  turned the contract suite 9/0 (DI-06 documents this). Importing `@massa-ai/shared` eagerly
  reads the real config dir (malformed-sentinel probe hit `dist/config/index.js:233` + module-level
  "Smart Rate Limiter initialized") — DA-15's mechanism, 94 importing core test files (was 75).
- Process constraints (user, this session): commit `.ua/` data files (the `.gitignore` premise is
  false — `git check-ignore` exit 1, nothing ignores `.ua/`); do NOT commit
  `.ua/tmp-dashboard-token.txt` (credential-shaped) or `.ua/.trash-*` (transient) — flagged;
  remove `.specs/reports/` as the final development step after a content sweep; one PR;
  `skills-directive-dedup` (parked T5/12) untouchable.
- massa-ai MCP server not consulted; `.specs/` files canonical per contract.
- Execute complete: T1-T11 one commit each (`c8174af`..`d6329a0`); full Plan Challenge revised
  the plan twice before Execute (D1 mechanism — the LLM seam provably never gated the embedding
  path; D3 sweep population 3 named classes → 14 measured files). Independent validation **PASS**
  (`validation.md` — verifier re-derived the DI-02 mutation kill with a copy-aside restore, re-ran
  the five gates + test:scripts, all exit 0). L-001 tool-promoted to confirmed. DI-05 withdrawn at
  D0 (SEN-03 `39afe59` v1.10.0 had already shipped the fix — a carried-forward status the report
  re-inherited unre-measured). `.specs/reports/` removed after a fully-dispositioned 14-file sweep.
- Next action (user): review + merge the PR. Merging cuts a **minor** release (CHANGELOG
  `[Unreleased]` has `### Added` content) — approving the merge approves a release.

## Previous — Cross-Pollination Ports & Gap Closure (**VALIDATED PASS 2026-08-03 — MERGED as PR #61 @ `0084d1a`, RELEASED as v1.19.0 @ `8e63477`; CI + Coverage + Release all green on the merge sha**)

**Outcome.** All 19 implementation tasks done on `feature/cross-pollination-ports` (worktree
`.claude/worktrees/cross-pollination-ports`, cut from `origin/main` @ `94e6b05`), one atomic
commit per task, three sequential builder batches (user chose batch workers over inline) plus
inline validation. Independent verification-agent verdict: **PASS — 35/35 ACs evidenced,
6/6 discrimination mutations killed, every gate re-run green by the verifier itself**
(`.specs/features/cross-pollination-ports/validation.md`). Deterministic gate 2098/0 across
138 files; `test:scripts` 1230/55 + 21 shell suites; both generators `--check` no-drift with
`git diff -- apps/` EMPTY across the whole capability-table refactor.

**What shipped (XP-01..13):** kernel credential-scrub boundary with branded
`SanitizedPayloadJson` enforced at `ObservationStore.insert` (AD-014); count-bounded
security-allowlist CI gate (15 sites, 6 entries, eval class hard-zero); workflow venue-parity
CI gate; Bun install-cache warming ×5 install steps; ci.yml build job flipped to the dedicated
DB triple (blind spot closed: `graph-store-pg-coverage` 0 pass/18-20 skip → 18 pass/0 fail
through turbo — `RUN_POSTGRES_TESTS` also added to `passThroughEnv`, without which the flip
was a silent no-op); `check-coverage.ts`'s stale "50 suites" comment corrected to measured
13/11/1-overlap; host-capability table + both generators refactored onto it byte-identically +
fixture 5th host + `docs/adding-a-host.md`; shared RSS helper; CLAUDE.md test-runner and
test:scripts figures re-measured and fixed; CONTRIBUTING tripwire paragraph; FEATURES.json
spelling; lessons L-009..L-014 via lessons.py; CHANGELOG Added×7/Fixed×4.

**Deferred to the PR's real CI run (spec'd, not gaps):** actual cache-hit observation (T8)
and gated-suite execution in GitHub Actions (T7).

**Residual:** massa-ai MCP server unreachable ALL session — durable-memory sync skipped
(`.specs/` files canonical, per contract). ~~Main checkout still holds untracked duplicates of
`.specs/reports/*` + `.specs/features/cross-pollination-ports/*` (classifier declined deletion);
at merge, remove them before `git pull` or git will refuse the checkout.~~ **Resolved
2026-08-03 post-merge: duplicates diffed against merged versions (identical except the recorded
design/tasks amendments), deleted, and the main checkout fast-forwarded to `8e63477` cleanly.**
Verifier's process finding: a design doc that pre-assigns an AD number goes stale by append
time — AD-014 renumbering is the instance (lesson L-014).

## Previous — Cross-Pollination Ports (registration snapshot, superseded by the block above)

- projectId: `massa-ai`
- workflowSessionId: `spec-cross-pollination-ports`
- workflow: spec-driven (Large — Specify + Design + Tasks + full Plan Challenge + Execute + independent validation)
- feature: `cross-pollination-ports` — implement the still-live items of
  `.specs/reports/cross-pollination-portability-and-gaps.md` (2026-07-29, written at `45daaa1`).
  **Every report claim was re-verified at `94e6b05` before specifying** — DB-01/02/03/04 are
  already fixed on main (recorded no-ops); PORT-01..07 and DB-05/06/07/08/09/10 are live.
  Spec: `.specs/features/cross-pollination-ports/spec.md` (sha256 `63c88cd…5836c`), XP-01..XP-13.
- **User decisions (2026-08-03):** XP-04 = enforce `RUN_POSTGRES_TESTS` in ci.yml **plus**
  venue-parity script; XP-06 = **full** capability-predicate prep refactor (agent recommended
  defer; user overruled); delivery = one branch `feature/cross-pollination-ports`, one PR,
  atomic per-task commits.
- DB-09 re-measured **wider** than the report: 27 missing `MASSA_AI_*` vars (24 in
  `passThroughEnv`, 35 read), not the report's smaller set. XP-10 fixes the class
  (wildcard if Turbo `^2.5.0` supports it — verify in Design).
- massa-ai MCP server unreachable this session ("Unable to connect") — memory recall/persist
  skipped; `.specs/` files + source are the canonical state, per contract.
- Next action: **Design** (`design.md`) — sanitizer branded type + redaction rule set,
  allowlist-gate AST design, ci.yml dedicated-DB wiring, generator capability-predicate
  extraction shape, then Tasks, full Plan Challenge (before Execute, never concurrent), Execute.

## Previous — skills/ Directive Dedup (T1–T5 of 12, stopped at user instruction)

- projectId: `massa-ai`
- workflowSessionId: `spec-skills-directive-dedup`
- workflow: spec-driven (Large — Specify + Design + Tasks + Plan Challenge + Execute)
- feature: `skills-directive-dedup` — **Specify, Design, Tasks and the full Plan Challenge
  are DONE. Execute is T1–T5 of 12; T6–T12 NOT STARTED. Independent validation NOT RUN.**
  Branch `refactor/skills-directive-dedup`, worktree `.claude/worktrees/skills-dedup`, cut
  from `origin/main` @ `6d5dc6b`. Head `ed1028e`, 6 commits, tree clean, every gate green.
  **Not pushed, no PR** — stopping was the user's instruction. Read `.specs/HANDOFF.md`
  and `.specs/features/skills-directive-dedup/{spec,design,tasks}.md` for the task
  contract, not this file.

**The brief's premise was refuted by measurement, and that is the headline.** The request
was to remove unnecessary/duplicated agents, workflows and references. There are none to
remove: `skills-reference-graph.ts` reports **0 orphans across 151 files**, and
`skills-duplication-metric.ts` puts removable literal duplication at **313 lines of
12,639 (2.5%)** at window=4. A large share of that is *deliberately mandated* —
`skills-harness-integrity.test.ts` asserts the persona clause byte-identical across 3
packet definitions and 22 dispatch blocks, and four fixed sentences in all 17 charters,
because a subagent receives only its charter and a pointer would resolve to a file not in
context. **The duplicate is the contract.**

**What the audit found instead: four correctness defects the duplication was hiding**,
each shipping to users through four npm-published plugin bundles, each invisible to a
fully green suite. Every one had a guard nearby that did not cover it; three were closed
by correcting the *direction* or *surface* of an existing gate rather than adding one.

1. **`skills/AGENTS.md` was a second hand-authored model-naming site** (T3, `99afd3a`),
   contradicting `model-profiles.json`'s own "THE only hand-authored place that names a
   model", three lines below a step reading "never a model name". Stale for `planner`
   (said GLM-5.2, resolves minimax-m3) and `requirements-analyst` (said DeepSeek V4 Pro,
   resolves glm-5.2) — two of the three roles PR #51 renormalized. `navigator`, the third,
   matches **only by luck**. `meta-judge`'s `kimi-k3` is profile-ambiguous rather than
   stale: it is the `deep` model under `heavy`/`home`/`open_models`/`local_models`, so it
   reads as correct to anyone on `heavy` and is wrong on the shipped default — worse than
   plainly stale. **The gate already existed and was never pointed here**:
   `verify-model-tokens.ts` policed four surfaces and `skills/AGENTS.md` was not one.
   Replayed against the pre-fix file the unchanged matcher reports **17 hits**, one per
   agent row.
2. **A developer's home path shipped as a named evidence tier** (T2, `bc47359`).
   `/Users/<name>/Downloads/questions.md` in `references/maestro.md` and
   `references/maestro/fact-ledger.md`, 3 sites — one a tier of the fact ledger's
   taxonomy, so agents were told to quarantine claims as `excluded/unverified` unless they
   appeared in a file they could not open.
3. **`judge` and `meta-judge` were absent from `agent-orchestration.md` for a whole
   release** (T4, `dd09cc1`). The "no phantom roles" guard checks that mentioned paths
   resolve — the opposite direction from coverage — and a charter never mentioned cannot
   produce a dead link. Fixing the direction exposed five more, carried in prose by role
   name rather than by the checkable charter path.
4. **The roster guard could not match the string it was written to ban** (T5, `bc5a76a`).
   It banned three literal spellings of "16"; `docs/ONBOARDING.md` read "16 **sub-agent**
   specialists" and the hyphen defeated all three. Also found:
   `.claude-plugin/marketplace.json` advertising **12** in the shipped Claude marketplace
   description, `CLAUDE.md` at 15 twice, and `FEATURES.md` describing the registry as 12
   while enumerating 12 of the 17 names.

**Two process failures, recorded rather than hidden.** (A0) The full Plan Challenge gate
ran **concurrently with Execute** instead of before it — the critic read files that
changed between its own tool calls, so every amendment A1–A7 exists because the critique
arrived after the commit it should have preceded. (Open risk) **One commit was made
through a red gate** (921/1); it did not reproduce across four subsequent full runs and
the failing test could not be named, because the output had been reduced to counts.

**The plan critic's best finding: the plan fell into its own metric's blind spot.** P5
extracted the four retrieval-list items shingling can prove identical between `SKILL.md`
and `mcp-tools.md`, while items 1–6 and 11 of the *same numbered list* are paraphrase
duplicates between the *same two files*. Four of eleven would split one procedure across
two files and leave the larger duplicate. **P5 withdrawn (A6).** The user chose
`mcp-tools.md` to own the whole list with `SKILL.md` keeping one load line, accepting the
conditional-load risk; `design.md` §D3 records the two mitigations T7 must implement.

**Decisions locked with the user:** scope tier B — single-source, fix drift, and collapse
the audit/fix family scaffolding; **not** tier C, so no file is deleted or merged and no
pinned count changes. The duplication metric **ships** as a committed ceiling gate.

**Gate at `ed1028e`:** `test:scripts` **922 pass / 0 fail across 45 files** (baseline
892/44), `test:plugins` 96/0, `lint` 0, both generators `--check` **No drift**,
`verify-model-tokens.ts` OK across 155 files. `excessLines` still **313** — unmoved
because T6–T8 *are* the dedup and none has run.

**Open / residual:** `EXCESS_CEILING = 313` in `skills-duplication-metric.test.ts` is the
pre-cleanup value and enforces nothing until T9 lowers it. `excessLines` is
pre-pointer-cost, so net reduction lands below 313. T11 (CHANGELOG) is required before any
PR — CI fails a PR without one. T7's accepted risk is this feature's own defect shape and
must be mitigated, not inherited. massa-ai MCP server was not registered this session; all
state came from `.specs/` files and source reads.


## Previous — Model Profile Registry

- projectId: `massa-ai`
- workflowSessionId: `spec-model-profile-registry`
- workflow: spec-driven (Large — Specify + Design + Tasks + Execute)
- feature: `model-profile-registry` — **COMPLETE 2026-07-30. Specify, Design, Tasks,
  Execute (T1–T13) and independent validation ALL DONE. Verdict: PASS at `af79151`
  (`.specs/features/model-profile-registry/validation.md`). PR
  [#51](https://github.com/luizgmassa/massa-ai/pull/51) OPEN against `main`, driving CI to
  green. Per-task scope, commit hashes, amendments A1–A5 and gate commands are in
  `.specs/features/model-profile-registry/tasks.md` — read that, not this file, for the task
  contract.**
- **Merge note:** `origin/main` advanced two commits past this branch's base while the PR was
  being prepared (PR #50 `judge-with-debate` merged, released `v1.13.0` — see the Previous
  entry below). Merged `origin/main` into this branch (not rebased) and migrated the two new
  charters it added (`judge`, `meta-judge`, still on the retired `metadata.model_hint`) to
  `metadata.model_tier: deep`, matching their original Claude/Codex pins.
- Validation took **two** of the three permitted fix loops. Iteration 0 was a **FAIL** with
  three gaps: MPR-R1's scripted model-token scan did not exist (a model name in charter prose
  propagated to 9 sites with every gate green), the test named as killing the
  `loadCharter`-defaults-a-tier mutation never called `loadCharter`, and `design.md`/`tasks.md`
  still carried the 39-fact/two-profile design-time figures. Closed by T10, T11, T12. Iteration
  1 passed with a residual — the scan matched per line, so a display name split across a line
  wrap slipped through, realistic here because prose wraps at ~95 columns. Closed by T13.
  Iteration 2 is the final PASS.
- User chose inline execution over sub-agent batches (offer made and declined for T1–T8;
  T9 still requires author ≠ verifier).
- Seven profiles ship, not two: `balanced` (hostDefaults target), `cheap`, `heavy`, `work`,
  `home`, `open_models`, `local_models`. The last two support OpenCode only, by design —
  resolving them for another host is `MissingHostError`, never a silent inherit.
- branch: `feat/model-profile-registry`, worktree `.claude/worktrees/model-profiles`,
  cut from `origin/main` @ `45daaa1`.
- Artifacts: `.specs/features/model-profile-registry/{spec,design,tasks,fool,validation}.md` +
  `fixtures/baseline-main.json`. `spec.md` §9 records the divergences; `tasks.md` records
  amendments A1–A5 and the accepted known limitation.

**Problem, measured:** 304 model facts across 6 surfaces, 184 hand-authored. Three of fifteen
roles hold contradictory tiers across the four hosts. The Cursor emitter has never worked
(display name where an ID is required, plus two keys Cursor does not define). OpenCode sends
`name` and `metadata` to the model provider as bogus model options on every subagent
invocation, under its documented unknown-key pass-through rule.

**Design:** charters own their own tier (`metadata.model_tier`); `skills/model-profiles.json`
owns `tiers` / `hostDefaults` / `workflowTiers` / `profiles.<name>.<host>.<tier> → {model,
effort}` and contains **no agent list**; `scripts/lib/model-profiles.ts` resolves with total,
fail-loud functions; per-host emitters own host syntax only. Profile precedence
`--profile` > `MASSA_AI_MODEL_PROFILE` > `hostDefaults[host]`. **81** hand-authored facts down
from 184 — and they express seven profiles where the 184 expressed one. The marginal figure is
the real one: a new full profile is 12 entries, a host-specific one is 3.

**Decisions taken with the user:** factored tier registry over a flat cross-product; open
profile set; workflow keys supported with no consumer; `model_hint` → `model_tier`; fix all
three defect classes on all four hosts; normalize the 3 drifted roles by their documented
rationale (`navigator`→light, `requirements-analyst`→standard, `planner`→deep).

**Plan Challenge:** full gate, `evidence_audit` mode, `massa-ai-plan-critic`. 6 of 8 evidence
claims STRONG on independent re-fetch. Four findings adjudicated in `fool.md`; three upheld,
one (`CLAUDE_CODE_SUBAGENT_MODEL` precedence) partially — the critic was wrong on Claude,
right on Codex, verified by direct doc quote. The critic also graded "the OpenCode ownership
marker is dead" STRONG; that is **refuted** — `apps/opencode-plugin/src/config-cli.ts:248`
reads it, so the marker moves to a body comment instead of being deleted.

**Gate (corrected during Execute):** with all five packages built, `test:scripts` = **857 pass
/ 0 fail** at `af79151` and `test:plugins` = **96 pass / 0 fail**, both exit 0. The count moved
832 → 836 (T7) → 850 (T10) → 853 (T11) → 857 (T13). The "4 pre-existing
failures" recorded during Specify were an unbuilt-worktree artefact, not real defects — see
`spec.md` §8 for the four measured build states and why a *partial* build moves the failure
instead of reducing it. Build before measuring anything.

**Open / residual:** `verify-model-tokens.ts` can false-fire on ordinary English use of the
three bare Claude aliases (two poetry forms and the Latin for "a great work"). Dormant — no
charter triggers it. Narrowing it was **declined**: gating those tokens on an adjacent `model`
context word would trade a loud false positive for a silent false negative on a real duplicated
fact. Recorded in the script's docblock so the next person rewords rather than weakens it.
Cursor tier values are `inherit` — no portable Cursor model ID exists for
the pinned models, and `cursor-agent` is not installed here, so the hard-error-vs-fallback
falsifier is a **skipped sensor with reason**. massa-ai MCP server not registered this session;
all state came from `.specs/` and source reads.

## Previous — Judge With Debate (spec-driven, VALIDATED PASS, merged and released v1.13.0)

- projectId: `massa-ai`
- workflowSessionId: `spec-judge-with-debate`
- workflow: spec-driven (Large — all phases complete)
- feature: `judge-with-debate` — **COMPLETE 2026-07-30, independently validated PASS**
  (`.specs/features/judge-with-debate/validation.md`: 12/12 ACs, 5/5 edge cases, 4/4
  discrimination sensors executed + killed, gate 773 pass / 0 fail / 41 files, No drift ×2;
  accepted deviation: verifier env had no shell/write — sensor executions + file persistence by
  main agent, per plugin-auto-install precedent). Branch `feat/judge-with-debate`. PR
  [#50](https://github.com/luizgmassa/massa-ai/pull/50) went green after one repair iteration
  (stale 15→17 rosters in the plugin install-test surface, which only `test:plugins` covers),
  merged, and released as `v1.13.0`.
- Plan Challenge: pre_mortem, 5 findings (2C/2H/1M) all verified + incorporated (tasks.md).
- Final gate @ T10: lint 0 · type-check 6/6 · `test:scripts` **772 pass / 0 fail across 41
  files** · both generators `--check` No drift. Baseline corrected: true pre-feature state was
  737/2 (both environmental — crash probe + unbuilt dist).
- Execute divergence (unplanned, gate-discovered): three registration spots missed by quick
  gates and caught by the full gate — `validate-repository.test.ts` third roster,
  `workflow-harness-contract.test.ts` workflow count 35→36 + read-only complement 19→20, intake
  line in the new workflow. Fixed in one repair commit; full gate is the sensor that works.
- scope: 12 requirements (JD-01..12) — port of NeoLabHQ `judge-with-debate` pattern: meta-judge
  eval-spec YAML (once, verbatim) + 3 independent judges + ≤3 debate rounds + consensus
  (0.5 overall / 1.0 criterion). Two new charters (`meta-judge`, `judge`; registry 15→17),
  workflow `workflows/judge-with-debate.md` + router entry, reports under `audits/judge/`.
- User decisions locked: full protocol; model-diversity advisory per dispatch (meta kimi-k3,
  J1 deepseek-v4-pro, J2 minimax-m3, J3 GLM-5.2 — as given, unverified) with loud host-default
  fallback; generic artifacts; standalone only; audit-report-io storage; consensus file saved.

## Active — Core Layering, `read_file.ts` Split (PR-D)

- projectId: `massa-ai`
- workflowSessionId: `spec-core-layering-read-file-split`
- workflow: spec-driven (Large — Specify + Design + Tasks + Execute)
- feature: `core-layering-read-file-split` — **Specify COMPLETE 2026-07-31. Design COMPLETE
  2026-07-31.** Branch `spec/pr-d-read-file-split`. **PR-D of 4, the last.** Registered in
  `FEATURES.json` at Specify time (55 → 56), `active_feature` untouched and verified not stale for
  the second time.
- Artifacts: `.specs/features/core-layering-read-file-split/{spec,design}.md`. **They are the
  record** — nothing from them is duplicated here, on the rule this file's own PR-B section learned
  the hard way: a duplicated table drifted and was wrong for five tasks.
- **PR-D is sized: six changes, nine new files under the 90% per-file coverage floor** (`design.md`
  §7). Five decisions taken with the user, each with its rejected options — the rename
  `services/graph/` → `services/memory-graph/`; delete-not-repoint the dangling `EXCLUSIONS` entry
  plus an existence assert in the gate's *test*; **N = 125**; `handle()` sheds all 98 of its
  non-delegation lines (extraction **490 of 707**, not 392); and the LRU lands in
  `services/cache/lru-evict.ts`, not `kernel/`.
- feature: **Tasks COMPLETE 2026-07-31** — `tasks.md`, ~~28 task rows~~ → **29 task rows**, eight
  phases, ~~78~~ → **80 distinct files** (corrected in `tasks.md` at T4b, carried here at T5 — this
  line and the T4b bullet below contradicted each other inside one file for two tasks). Three user decisions with their rejected options: **one PR, eight phased commits**;
  artifacts *and* code on one branch (so the `no-changelog` label must **not** be used, since the PR
  edits `CHANGELOG.md`); **`### Changed` + `### Removed`**, both minor.
- feature: **Execute STARTED.** Tasks committed `4f1e8ad`; **T1 done `d0fbc92`** — record in
  `tasks.md` §10.1, including **C34–C36** and the two plan amendments they forced (T10 gains a test
  repoint; new task **T8b**). **T2 done `ee578b2`** — record in `tasks.md` §10.2. RFS-06 AC-1, AC-2
  and AC-3 all close. **T3 done `f2222d3`** — record in `tasks.md` §10.3. R-31 and GMS-05 AC-1
  close; **Phase 0 is complete**. Six gates plus `check-core-layering` green at all three.
  **T4a done `180f7d2`** — record in `tasks.md` §10.4. `scripts/check-tools-thin.ts`, 524 lines,
  three clauses over a TypeScript AST; **RFS-01 AC-2 and AC-6 close**, as does AC-1's
  population-print clause (AC-1's *"exits 0"* and *"runs in CI"* conjuncts are **T15's**). Reads
  `FAIL — 2 of 30` and exits **1**, which is the intended Phase 1 state. **Phase 1 is started.**
  **T4b done `e0ebf17`** — record in `tasks.md` §10.5. `scripts/__tests__/check-tools-thin.test.ts`,
  96 cases / 258 assertions, synthetic fixtures only; **RFS-01 AC-4 and AC-5 close**. It shipped
  **two files**: AC-5 could not be closed against the gate as T4a shipped it, so the gate is amended
  too (**524 → 614 lines**). Six gates plus `check-core-layering` green — `test:scripts` **1114 / 0
  across 49 files**, edges **965 unchanged**, files 901 → 902.
  **T6 done** — record in `tasks.md` §10.7. `services/cache/lru-evict.ts` + its unit suite, 15 cases
  / 43 assertions; **RFS-02 AC-3 closes and AC-2 closes in part** (C47 reassigns AC-2's second clause
  to T7). **Phase 2 started, and it is the first task on this branch that moves code.** Four plan
  defects (**C44–C47**). Six gates plus `check-core-layering` green — `test:scripts` **1114 / 0
  across 49 files** unchanged, `test:plugins` 96 / 0, edges **965 unchanged**, files 902 → 904,
  `check-tools-thin` **byte-identical to T5's frozen base**, and the new module measured at **100%
  lines** against the 90% floor (R-36).
- **C44–C47 are the forty-ninth to fifty-second plan defects; two of them change what a later task
  does.** **C44** — `design.md` §5.1's *"a function taking `(cache, cap)`"* does not determine the
  predicate and the five caches do not share one, so one operator with each site passing its own
  literal cap is behavior-preserving at **neither** call position (measured, both directions). The
  shipped contract is a post-call bound with pre-insert callers passing `CAP - 1`, exact because
  `size > cap - 1` and `size >= cap` are the same predicate over integers. **C46** — T7's shape was
  unfixed by any artifact and decides whether RFS-01 AC-3's frozen base **moves during Phase 2**:
  inlining takes `read_file.ts` 13 → 12 maximal bodies and leaves `read-file.test.ts` red until T8,
  while a one-line delegate leaves both byte-identical. **T7 takes the delegate shape**, and T8's
  *"cannot survive T7 unmodified"* is struck as falsified. **C45** — T1's `fileCache` characterization
  case does not discriminate eviction at all. **C47** — T6's row credited it with a criterion a module
  with no call sites cannot close. All four author level on the C34/C35/C37/C38/C39/C41/C42/C43
  precedent; **C44 owed to `design.md`** (T20b, §8.1 row 15), the other three internal to `tasks.md`.
- **C37 is the forty-second plan defect, and the first on this feature to amend a criterion rather
  than a figure.** RFS-06 shape (c)'s prescribed assertion — *"no literal `..` segment"* — is
  **vacuous**: `path.resolve` normalizes `..` away on every exit, and a probe written to the clause's
  letter **passes under the very mutation it exists to catch**. Struck and amended in place in both
  `spec.md` §5 and T2(c); replacement predicate is containment-relative. Author level on the C34/C35
  precedent, **handed to T25 as a question**.
- **C38 is the forty-third plan defect, and it enlarges T3's subject rather than changing it.**
  `design.md` R-31's per-key table credits `compressionRatio` with an `e2e/08.search` assertion that
  belongs to **`compress_context`** — `:556` reads `metadata.compressionRatio` while `ReadFileTool`
  assigns the field at the top level. True figure **0**, not ×1; `tokens` is **2**, not ×1, and both
  sit behind a `catch { return }`. R-31 was rewritten for citing another tool's *fixture* and its
  replacement then credited another tool's *assertion*. Author level; owed to `design.md` (T20b,
  §8.1 row 7), **not** to the parent — R-31 has no parent criterion behind it.
- **C39 is the forty-fourth plan defect, and its tell was the document's own subtraction.**
  `design.md` §6.5's two raw body figures are measured under **two different constructor
  conventions** — `read_file.ts`'s **18** counts the constructor, `index_project.ts`'s **3** does
  not, and 18 / 3 is a pair no single convention produces (17 / 3 exempt, 18 / 4 counted). The
  named nested list is short by one: 13 plus the four named arrows is **17**, and the fifth item is
  the constructor entry, not a nested arrow. **The maximal figures 13 and 3 are identical under
  both conventions**, so RFS-01 AC-3's frozen base is untouched and no decision moves. Author
  level; owed to `design.md` (T20b, §8.1 row 8), **not** to the parent — §6.5 is Design's own
  instrument note with no criterion behind it.
- **C40 is the forty-fifth plan defect: AC-5's sixth evasion shape was the one the gate could not
  see.** RFS-01 AC-5 lists *"an object-literal handler that is not a class"* and says omitting one
  would be C21's shape aimed forward. **Measured — an object literal with a 200-line `handle()` and
  a module-level `Map` read PASS**, because `analyzeSource` returns early with no class to check.
  Five of six caught; the sixth needed the population predicate to move, which is **C33's shape
  inside the task that closes the clause**. **Decided by the user, 2026-08-01**, from three options;
  the population now admits an object literal claiming the interface by annotation, `satisfies` or
  `as`. The widened live-tree reading is **byte-identical**, so **AC-3's frozen base is untouched**.
  The Plan Challenge gate then found a **false positive in the widening itself** — clause 2's
  module-level walk has no `handle()` exemption, and an object literal puts `handle()`'s body inside
  a `VariableStatement` — which the author's own three probes could not have caught, all having
  referenced an *outer* cache.
- **C41 is the forty-sixth, and it strikes a criterion three documents had already contradicted.**
  RFS-01 AC-4's *"a legal public method added must stay PASS"* is **falsified by C32**: the
  predicate is a declared body, so visibility is never consulted. Measured **RED**. `design.md`
  §6.5 listed a public method among C32's subsumed shapes, §6.6 property 4 had substituted a
  different inert control without striking anything, and T4b's own row listed *"public method"* as a
  RED shape. Amended in place; **handed to T25 as a question** alongside C37's and AC-2's. Author
  level on the C34/C35/C37/C38/C39 precedent.
- **T4b's mutation table measured a premise nothing had tested: ten of thirteen mutations of the
  rule are invisible to the live-tree run, and the `2 of 30` verdict moves under none of them.**
  *"The gate still reads `2 of 30`"* is not evidence the rule is intact — R-40's concern one level
  further out than R-40 states.
- **Three corrections landed at T4b that are not its own work.** **T8b existed only in C35's prose
  for four tasks** — no §5 row, no write-set entry — so the task/file totals were **28 / 78** and are
  **29 / 80**; §10.4's *"both task rows claim AC-1"* is **three**; and `design.md` §6.5's nine-case
  table is `declaresBody()`'s truth table, not `BodyFinding.kind`'s — **second figure in that table
  not to survive being re-run, after C39**.
- **T5 done `9adee57`** — record in `tasks.md` §10.6. **RFS-01 AC-3 closes**, and **all four
  non-retroactive steps are now taken**. The frozen base transcribed per member with spans:
  `2 of 30`, 27 declare an `IToolHandler`, 3 do not, 224 members; `read_file.ts` 13 maximal / 17 raw
  / 2 state / `handle()` 175, `index_project.ts` 3 / 3 / 0 / 128. R-37 verified — zero diff in
  `packages/core/src/tools/` across the branch. `HANDOFF.md` predicted *"at least one"* arrow body
  would report `ArrowFunction`; measured **two**, and neither is a class member (a module-level IIFE
  and the constructor's `eventBus` callback), so *"13 per member"* is **11 methods + 2 anonymous
  arrows** — the 11 being C29's corrected count exactly.
- **C42 is the forty-seventh plan defect: `2 of 30` is a union.** Per clause the readings are
  **2 / 1 / 2** — `index_project.ts` has **zero** `Map`/`Set` state, so clause 2 flags `read_file.ts`
  alone. R-39 calls the third clause's value prospective for flagging no file the other two miss;
  **clause 2's RED set is a strict subset of both** and nothing said so. Author level; owed to
  `design.md` (T20b, §8.1 row 13), **not** to the parent.
- **C43 is the forty-eighth: the span anchor is split per file and unstated.** `read_file.ts`'s cited
  spans are comment-inclusive at all 8 sites with a comment; `index_project.ts`'s are
  declaration-only at both, orphaning `executeIndexing`'s doc `:246-253` (**T13**, 8 lines) and the
  managed-run lease's `:151-157` (**T14b**, 7 lines). **The second is gate-relevant** — that comment
  is inside `handle()` `:117-244`, measured **including comment lines**, so T14b's `128 → ~87` lands
  at **~94**. `design.md` §5.1's ~110 estimate is the tell: 106 comment-inclusive, 98
  declaration-only. Both rows amended; **C33 does not move**. Owed to `design.md` (T20b, §8.1 row 14).
- **T5's own measured result, and the one to carry forward: the frozen base is a claim about the
  tree, not about the rule.** Seven gate copies with only `isViolation` patched, plus an inert
  control and a byte-identical baseline copy — **deleting any one of the three clauses leaves the
  entire report byte-identical**. T4b: 10 of 13 internal mutations invisible. T5: **3 of 3** at
  whole-clause granularity. It does **not** falsify the per-member rationale, which is about the AST
  enumerating correctly; AC-4's suite is the complementary sensor. R-40 already sends T25 per clause
  — T5 adds that the per-clause reading **is not derivable from the default report**, only from
  `--json` or a patched gate.
- **Both Plan Challenge modes caught the same figure and it was the author's** — a carried `108` that
  measures **106**, inherited from an instrument anchored at `handle()`'s closing brace whose control
  had already failed once. The red-team's finding was sharper: **the author's span sweep was
  structurally blind to T14b**, its population being *declared members* while task rows cite plain
  code ranges. Re-run over all 26 cited spans. The critic's own figure for that comment was off by
  one. **Transcription verified rather than proofread** — the fenced block byte-identical to the live
  run, both tables parsed back out and checked cell by cell against `--json`, 72 assertions / 0
  mismatches.
- **T7 done `ea59b04`** — record in `tasks.md` §10.8. Four files / five caches repointed at
  `services/cache/lru-evict.ts`; **RFS-02 AC-1 closes and AC-2 clause 2 closes** where C47 reassigned
  it. Delegate shape at both wrapper sites, pre-insert passing `CAP - 1` and post-insert `CAP`.
  Evidence is byte-identity rather than greenness: **all six suites reaching any of the five caches
  are SHA-256 identical to `HEAD`** and pass together at **92 / 0 / 3335 expect()**. Six gates plus
  both structural gates green — `test:scripts` **1114 / 0 across 49** unchanged, `test:plugins`
  96 / 0, `check-tools-thin` counts byte-identical to T5's base, and **edges 965 → 969 with files
  904 unchanged**: the first commit on this branch where the edge count is the figure that moves,
  the delta being exactly the four new imports. Four plan defects (**C48–C51**), running total
  **fifty-six**.
- **C48–C51 are the fifty-third to fifty-sixth; two change what a later task does.** **C48** — C46
  fixed T7's shape for `read_file.ts` and is scoped to that file, while `symbol-graph.service.ts` has
  the identical wrapper reached by a cast in `symbol-graph-service.test.ts`; `evictOldestProjectRoot`
  has **0 occurrences anywhere under `.specs/`**, and inlining leaves that suite **48p/1f with no task
  owning the repoint**. Delegate shape at both. **C49** — C45's *"the site is still covered today by
  `read-file.test.ts:264-299`"* is true of the **method** and false of the **call site**: deleting
  `read_file.ts:570` (`fileCache`) or `:169` leaves **all 92 cases green**, because that test calls
  `evictOldest` directly and never drives `readFileWithCache`. Live for **T10**, which moves `:570`'s
  call into a new module with nothing watching. **C50** — C46's *"byte-identical"* was measured on the
  gate's summary line, which carries **counts**; §3.3's frozen base also carries **line spans**, and
  the delegate moves **15 of 15** while every count holds. RFS-01 AC-3's own text records a verdict
  and is untouched. **C51** — `read-file.test.ts`'s cast declares four private members and the body
  exercises **three**; `projectRootCache` is type-only, which is the mechanism under half of C49.
  C48, C50 and C51 author level on the C34…C47 precedent; **all owed to `tasks.md`'s own rows, so
  §8.1 stays at fifteen** and §5 stays at **29 task rows**.
- **Two user decisions at T7, each against named alternatives.** `file-filter-cache`'s
  `logger.debug` at `:154` is **dropped and priced in the site's docblock** — keeping it behind a
  victim-naming wrapper and not repointing the site at all were rejected; the shared function cannot
  report a victim, the other four sites do not log, and the line had **0 assertions repo-wide**. And
  **C49 is closed now by widening T8** rather than recorded-only or given a new task T8c: T8's write
  set stays **1 file** and its subject gains call-site sensors for `:570` and `:169`.
- **T7's discrimination table measured RFS-02 AC-1's own justification for the first time.** Column B
  is the suites that existed **before** PR-D — the honest counterfactual — and it **misses 4 of 7**
  mutations: both post-insert sites are entirely unsensed, and `file-filter-cache.test.ts:94` asserts
  `toBeLessThanOrEqual`, an upper bound only, so over-eviction walks through. Every column-A FAIL is
  `4p/1f` because **C45's vacuity covers the off-by-one too**, not only the neuter — confirmed by
  reading the failing case name rather than the count.
- **T8 done `887350c`** — record in `tasks.md` §10.9. **GMS-05 AC-3 satisfied for
  `read-file.test.ts`, and C49 closes.** One file, **7p/34x → 9p/45x, 0 fail**. C49's closure is a
  **before/after pair**, not a green suite: on the shipped tree `read_file.ts:170` and `:578` read
  **92p/0f — NO SENSOR** before the edit and **93p/1f** after, each killed by one of the two new
  cases, read **by name**. All four call sites now sensed; before T8 the repository sensed two.
  The repoint shipped as an **operator swap in place** rather than a move onto a bare `Map` — the
  gate found `lru-evict.test.ts:60`/`:70`/`:107` already assert both properties over a plain `Map`,
  so that move would have duplicated T6 and severed the `ReadFileTool` link. Six gates plus both
  structural gates green — `test:scripts` **1114 / 0 across 49** unchanged, `test:plugins` 96 / 0,
  **edges 969 → 969 and files 904 → 904, both unchanged** (T8's import lands in `__tests__/`, which
  is not a tier), `check-tools-thin` counts byte-identical to T5's base. Two plan defects
  (**C52–C53**), running total **fifty-eight**.
- **C52–C53 are the fifty-seventh and fifty-eighth; both change what a later task does.** **C52** —
  C50's post-delegate span table was measured on a tree that was **never committed**: the probe
  applies a minimal delegate (net −3) while the shipped commit also carries an 11-line docblock
  (`+13/−5`, `read_file.ts` **707 → 715**). So net is **+8**, seven entries shift **+8** not −3, and
  `evictOldest` lands at **`:489-491`** not `:478-480`. **C50's headline reproduces exactly** — 15 of
  15 spans move, every count holds — which is why the arithmetic under it survived. Three
  consequences in three artifacts: §3.3 and C50 amended; **C48's and C49's own tables carry four
  pre-T7 call-site citations** and gained a shipped-tree column, since T25 must re-run C49's table on
  the real tree; and **three source comments T7 itself added cite line numbers in their own file that
  its own commit falsified**. **C53** — closing C49 creates a private reach that dies **one task
  before C34's break-phase table predicted**: T9 moves `projectRootCache` *and* the `eventBus`
  subscription into module 3, while §1's overlap table schedules the only Phase-3 touch of
  `read-file.test.ts` at T10, so T9 as written lands a red suite owned by nothing. **T9's write set
  gains `+ 1 test repoint`**, author level on C34's own precedent. Both internal to `tasks.md`, so
  **§8.1 stays at fifteen** and §5 stays at **29 task rows**.
- **One user decision at T8, against three named alternatives.** C52's three false source comments
  **fold into T8b**, taking it from 2 files to **5, comments only** — widening T8 to 4 files, a new
  task T8c, and record-only were all rejected. T8's write set stays **1 file**. `read_file.ts`'s
  comment is **de-numbered** rather than renumbered, because T10 deletes `:578`'s call outright and a
  renumber would go stale a third time; the other two files are in **no** Phase 3–5 write set.
- **A figure withdrawn rather than shipped.** The repo-wide count of self-referential `:NNN` comment
  citations: per-line classification said **59**, the evidence-audit lens said **~6**, block-aware
  re-measurement says **25**, and it still cannot decide a bare `:NNN` in a docblock that does not
  re-name its subject. **None is defensible and none is quoted.** The only figure anything depends on
  — **5 citations in the four T7-edited files → 3 comments in 3 files**, T8b's write set — was
  reproduced exactly and independently by both parties.
- **T8's discrimination table re-chose column B rather than inheriting it.** T7 shipped no new test,
  so its column B was *"the suites that existed before PR-D"*; T8 **does** ship cases, so column B is
  **the six eviction suites exactly as they stood at `HEAD`**. It **misses 2 of 5** applicable
  mutations and they are **exactly the two sites C49 named**. Expectation mismatches **0**, both
  controls hold. M1 was split into **M1a/M1b** after the first run read `PASS` on a **dead mutation**
  — the repointed case has two operator calls and only the post-seed one can cross the bound, so the
  seed-loop call is inert **by position**. T6's lesson recurring: the verdict column cannot show a
  dead subject.
- **T8b done `38fdc52`** — record in `tasks.md` §10.10. **RFS-02 AC-4 closes, C52 closes, and Phase 2
  is COMPLETE.** It shipped **8 source files + `spec.md`**, not the 5 the row named: two user
  decisions grew the write set during the task. RFS-02 AC-4's pair now states what T1's pin measured
  and **both cite the pin test rather than each other** — *a comment's authority should be a
  measurement, not another comment.* C52's three landed as planned, `read_file.ts:484` de-numbered in
  **four lines replacing four**. Six gates plus both structural gates green: edges **969 unchanged**,
  files **904 unchanged**, and `check-tools-thin` **byte-identical to the pre-edit run, spans
  included** — stronger than T7's and T8's counts-only claim, and available only because the
  `read_file.ts` edit was line-neutral on purpose (715 → 715).
- **C54–C56 are the fifty-ninth to sixty-first plan defects; two of them change what a later task
  does and one amends two criteria.** **C54** — C52's sweep was **self-referential**, and T7's `+1`
  import insertions falsify a citation *into* those files from anywhere: measured over 892 tracked
  source files, **14 explicit cross-file citations plus a bare-`:NNN` tail, 48 stale across the three
  Phase-0 suites, 44 naming spans Phase 3 relocates**. Three **invert** rather than dangle — the pin
  suite cites `read_file.ts:148` for `ROOT_CACHE_TTL` *"and NOTHING READS IT"* while shipped `:148`
  is `CACHE_TTL`, the constant that **is** read. **User decision from four options: fix all now.**
  **C55** — fixing them moves the obligation rather than retiring it, and no row owned the Phase-3
  re-break: **T9, T10, T11 and T12 each gain `+ N citation repoints`**, counts re-derived per task;
  **T12 additionally owns the nine stale `:NNN` in `test()` TITLE strings** T8b deliberately left,
  because a string literal is not a comment. **C56** — C55 then falsifies **RFS-02 AC-1's and RFS-06
  AC-1's byte-identity clause by construction**; both amended in place to **byte-identity with
  comments stripped** and **handed to T25 as a question**. C54/C55 are internal to `tasks.md` and C56
  amends `spec.md`, so **§8.1 stays at fifteen** and §5 stays at **29 task rows**.
- **A second user decision, and the red-team found it before a line was written.** An honest
  correction to `production-wiring.ts:67-69` needs six lines, not three, and the growth shifts the
  **2** citations *below* it. Measured by content: `spec.md:158` `:91` → **`:100`** and `:156` `:105`
  → **`:114`**, both in §3.B's evidence table, both exact beforehand; `production-wiring.ts` is in no
  Phase 3–7 write set, so the repoint is stable. *A comment-only diff moves no tokens and still moves
  line numbers, and here line numbers are load-bearing evidence.*
- **The repoint is content-anchored, never arithmetic**, and that is the result to carry forward. For
  each cited pre-T7 number the instrument reads the **text** at that line in `ea59b04^` and finds it
  on the shipped tree; deriving *"+1 below the import, +8 below `:474`"* is the arithmetic that
  produced C50 and then C52. Verified by a round trip that is **not** the proposal generator re-run —
  **49 pairs checked by content, 0 mismatch**, plus four bare `:NNN` whose subject is another file
  adjudicated by reading the block and left untouched.
- **Three instrument defects at T8b, none found by a green run.** A raw `ts.createScanner` cannot
  re-scan template spans without a parser and swallowed `read_file.ts`'s remainder into one token
  **including the comments it was meant to be blind to** — **after passing its own observed red**. A
  `/g` `RegExp.test` skipped lines via `lastIndex`. A `\b`-anchored negative lookahead matched
  mid-token. *A red proves a checker can fire, not that it fires for the right reason; and a verifier
  that only inspects the diff cannot see an omission.*
- **T9 done `5fb88fd`** — record in `tasks.md` §10.11. **RFS-06 AC-1 closes**, GMS-05 AC-3 is
  satisfied for the C53 repoint, RFS-03 AC-1/AC-2 hold, and **Phase 3 is open**. Modules 2 and 3 out:
  `services/file-read/{path-containment,project-root-cache}.ts` plus two new suites;
  `read_file.ts` **715 → 590**. **Three new plan defects (C57–C59), running total sixty-four.**
  **Not one span in §5's T9 row matches the tree** — it is pre-T7 numbering throughout, so every span
  was re-derived from the AST and anchor-verified; the 2→3 edge is `:374`/`:416`, not `:373`/`:415`.
- **Two decisions taken at author level with their rejected options.** Module 3 is instantiated **per
  `ReadFileTool`**, not as a module singleton — mutation M10 shows the repository sees the difference.
  Module 2 takes module 3 as a **constructor dependency**, not a callback: the red-team lens correctly
  caught that the first framing (*"`design.md` §5.1 already decided this"*) **overstates the
  artifact** — §5.1 names the edge and its direction and chooses no mechanism, and `tasks.md` §4's own
  header says §5.1 names **one** edge, the 4→5 one.
- **C57 — the sweep's SHAPE, not its count, is what kept going stale.** C54 took the **explicit**
  `<file>:NNN` sweep repo-wide and left its sibling hand-scoped to three carriers, and **no sweep on
  this feature ever looked at by-FILE or by-IDENTIFIER claims at all**. Proven by patching the subject
  predicate and diffing counts — a widening that cannot match is a no-op that reads like a clean
  sweep. Four instances, the sharpest being **`check-tools-thin.ts:103`, the gate's own docblock**,
  citing the `eventBus.subscribe` arrow at `:167-171` since **T7** moved it to `:168-172`; correct
  when authored (`180f7d2` precedes `ea59b04`) and invisible to T8b. Plus two citations **into**
  `read-file.test.ts` that T8 orphaned, and one **semantic inversion** citing `production-wiring.ts`
  as giving a reason that comment now disavows. **The write set grew 8 → 12 files on a user decision.**
- **C58 and C59 are live for T10–T12.** **C58**: C56's *"Note what does NOT change"* exempted
  `lru-eviction-characterization.test.ts` — RFS-02 AC-1's own main subject — on the true premise that
  it carries zero *line* citations; it carries **two by-FILE claims** T9 relocates, so C56's
  amendment covers it and only the note is wrong. **C59**: T9 moves 6 spans and **shifts 27 further
  citations**, a class C55 does not assign. Every one names code T10/T11/T12 relocate, so renumbering
  now buys a third falsification; left to the owning task and **recorded with its size** so a
  verifier can tell a scheduled transient from a defect. ~~Post-repoint the sweep reads **moved-out
  0**.~~ → **corrected by C61 at T10: the true figure is 1 and the population is 45.**
- **Column B was re-chosen, and which two mutations it misses is the result to carry.** B is *the
  pre-existing suites with only the C53 repoint* — what the repository would catch if T9 had written
  no new tests — because R-36 forces two module suites and R-26 warns that is how shallow tests get
  written. **B catches 10 of 12**: on the main risk surface the new suites add **coverage, not
  discrimination**. The two they alone catch are both `getProjectRoot` **failure branches** that every
  pre-existing suite stubs away. *A module suite earns its place at the branches its callers cannot
  reach.*
- **Gates.** `lint` **0**, proven to bite on a T9 file, restored SHA-identical. `type-check` **6/6**,
  `build` **5/5**, both 0 cached forced. `test` **11/11 exit 0** warm, 5 cached all `:build`, core
  `all 149 group(s)`. `test:scripts` **1114**/0. `test:plugins` **96**/0. `check-core-layering`
  **edges 969 → 973, files 904 → 908**. `check-tools-thin` **`2 of 30` HOLDS**, members **224 → 221**,
  `read_file.ts` **13/17/2/175 → 9/10/1/175**, `handle()` unchanged at 175. Both new modules **100%
  lines / funcs**. The one first-run failure was `apps/mcp-client`'s documented 22 s live-provider
  case — zero-diff against `main`, 95p/0f standalone under both configs, 3.96 s empty vs 17.82 s real.
- **T10 done `f1413b6`** — record in `tasks.md` §10.12. **C34's repoint lands and GMS-05 AC-3 is
  satisfied for it**; RFS-03 AC-1/AC-2 hold. Modules 4 and 5 out:
  `services/file-read/{file-content-cache,file-metadata}.ts` plus two new suites; `read_file.ts`
  **590 → 392**. **Six new plan defects (C60–C65), running total seventy.** None of §5's nine spans
  matched the tree — the row is pre-T7 *and* pre-T9 — so all nine were AST-derived and
  anchor-verified, as T9's were.
- **The 4→5 callback is wired as an ARROW, not a `.bind()`, and that is measured rather than styled.**
  The cache re-resolves `this.fileMetadata.extractMetadata` per call, exactly as the handler resolved
  `this.extractMetadata` before the move, so the writeback case's spy still observes it. Mutation
  **M14** confirms that spy is the **only** sensor for the choice anywhere — and it lives in a
  pre-existing test T10 repoints, not in either new module suite.
- **C60: the `evictOldest` delegate died here, not at T12.** Its body reads `FILE_CACHE_MAX_ENTRIES`,
  which T10's own row moves, so it could not compile even as dead code. Three artifacts said T12 —
  including `read_file.ts`'s own docblock — and the task row never named the member at all. Author
  level; GMS-05 AC-4 fixes the answer. *C33's shape one phase down: a clause and the work meant to
  satisfy it were checked at file granularity and disagreed at member granularity.*
- **C61 is the one a resumer must not skip: T9's `moved-out 0` was false, and the sweep's own repoint
  is what blinded it.** `read-file-containment-shapes.test.ts` carried two bare citations naming
  `handle()` call sites, exact at `5fb88fd^` and stale from T9 onward. `t9-citation-sweep.ts` decides
  a file's subject by testing for the literal `read_file.ts` in it — and T9's repoint of that file's
  *other* citations took the count **5 → 0**, dropping it out of the population before the verifying
  run. True figures: **moved-out 1**, population **45**, not 43. *An instrument whose subject
  predicate is a literal its own repoint deletes verifies a smaller population than it measured, and
  the shrinkage reads exactly like a clean sweep.*
- **C62, C63, C64, C65 — the other four, all live for T11 and T12.** **C62**: C55's *"owner = whoever
  moves the subject"* has a **null case** — one citation names code no remaining task moves, so under
  the rule it belongs to nobody; it belongs to the task that shifts it. **C63**: the **by-FIGURE**
  class — a count claim carries no line and no identifier, so every sweep here was blind to it; the
  instance was `check-tools-thin.ts`'s own implementation comment, stale since T9 and contradicting
  its file's stated no-live-figures policy 278 lines above. **C64**: the wiring arrow is the first
  body PR-D **adds** to `tools/` (the constructor is exempt *by kind*, so it counts as maximal), and
  §5's Phase-3 acceptance reading assumed the count only falls — **T12 must move it or RFS-01 AC-1
  cannot read `0 of 30`**. **C65**: §1's table stopped summing to its own total two tasks ago, because
  T8b's write-set growth never reached it; re-derived, **sum 101, union 81**, and three files now sit
  in *three* phases, which is what broke the table's own self-check.
- **The write set grew from the 5 + N the row predicts to 17, on a user decision** (fix-all-now
  chosen). Beyond the two line-citation files, **eight** carry a by-FILE, by-IDENTIFIER or by-FIGURE
  claim T10 falsifies — two of them production files. **T9 rejected the same finding for those two
  files and both dispositions are right**: T9's was about *unqualified* identifiers inside behavioural
  claims a behavior-preserving move preserves; T10's is `ReadFileTool.CACHE_TTL`, a **qualified member
  path** that stops resolving. Eleven diffs **proven** comment-only; five repointed pairs verified by
  **round trip against three distinct frames**, because the revision a citation was written against is
  per citation and the sweep takes one base for every row.
- **Column B was re-chosen, and which four mutations it misses is the result to carry.** B is *the
  pre-existing suites with only the C34 repoint* — T10 takes a design decision whose only sensor is a
  test it repoints, so that sensor belongs inside B. **B misses 4 of 15**: the TTL predicate read
  **exactly at** the cap (every pre-existing sensor steps a full second past it), and three
  `file-metadata` branches the handler cannot reach because it asks for one language, always stubs
  `listDefinitions` to resolve, and always passes a `relativePath`. Against T9's 2 of 12.
- **Gates.** `lint` **0**, proven to bite on a T10 file, restored SHA-identical. `type-check` **6/6**,
  `build` **5/5**, both 0 cached forced. `test` **11/11 exit 0** warm, 5 cached all `:build`, core
  `all 150 group(s)` — **+1 for two new files, verified not assumed**: `file-content-cache.test.ts`
  uses `setSystemTime` and is forked as process-global, `file-metadata.test.ts` joins the mock-free
  batch. `test:scripts` **1114**/0. `test:plugins` **96**/0. `check-core-layering` **edges 973 → 977,
  files 908 → 912**. `check-tools-thin` **`2 of 30` HOLDS**, members **221 → 215**, `read_file.ts`
  **9/10/1/175 → 5/6/0/175**, `handle()` unchanged; **clause 2's own reading reaches `0 of 30`** —
  `fileCache` was its last subject anywhere under `tools/`. Both new modules **100% lines / funcs**.
  The one first-run failure was `apps/mcp-client`'s documented live-provider case again — zero-diff
  against `main`, 95p/0f standalone under both configs, 3.80 s empty vs 16.90 s real.
- **An instrument lesson worth more than its size.** The first draft of `file-content-cache.test.ts`
  stubbed `fs/promises` with `mock.module` to count disk reads; run beside its eight sibling suites in
  one process the aggregate went **128 pass / 26 fail**, and `run-tests-isolated.ts` would have forked
  the file and hidden it. Rewritten onto real temp files with the rewrite-and-re-read observation —
  **154 pass / 0 fail** in one process. *A global module mock is measured cross-contamination, not a
  style question.*
- **T11 DONE — `834f00a`.** Module 6 out: `services/file-read/line-range.ts` + its suite.
  `read_file.ts` **392 → 315**; `check-tools-thin` **5/6/0/175 → 1/1/0/165** — **`handle()` moves off
  175 for the first time since T5**, and the one surviving body IS C64's wiring arrow, so the whole
  remaining distance to `0 of 30` is T12's. `2 of 30` holds. **Five new plan defects (C66–C70), running
  total seventy-five.** Record is `tasks.md` §10.13. Write set **8**, from two user decisions —
  `spec.md` (**C68**) and `check-tools-thin.ts` + its suite (**C69**); N was *resolved* at 2, not grown.
- **C69 is the one not to skip: a shipped gate's population counter was pinned at 2.**
  `forEachChild(() => membersExamined++)` short-circuits — `forEachChild` halts on a truthy return and
  post-increment returns the pre-value. Never moved a verdict; falsified both sentences the file states
  about the field and RFS-01 AC-1's own property. Fixed **with the recalibration recorded**: same tree
  reads `read_file.ts` **16 → 28**, repo total **215 → 419**, so T5's 224 / T7's 223 / T9's 221 /
  T10's 215 all mean `2 + members`. Its suite had six assertions on that member, all shape assertions,
  all blind. *This task is the proof it is not cosmetic*: the member delta reads −3 on the old counter
  and −4 on the fixed one, the fourth being `interface ReadRange` leaving.
- **C67 changed the code before it was written.** The N9 cap re-slices the **raw** array, so a clipped
  response loses the line numbering an unclipped one carries — and no test anywhere asserted content on
  that path. The natural composition would have silently "fixed" it; mutation **M10** is killed only by
  the new suite. Pinned, logged, not fixed. **C66**: `design.md` §5.1 makes module 6 import from module
  7, which composes it — a third cross-module edge Design handed to nobody. **C70**: `adjustRange`'s
  `Infinity` ternary is dead branching.
- **The sweep now derives its baseline PER CITATION** (`git blame` on the citing line), which closes
  §10.12's *"cannot verify its own repoints"* structurally. **32 of 40 rows** classify differently
  under one BASE. Checked as a falsifiable prediction: pre-commit the repointed row read SHIFTED,
  post-commit it reads **STABLE**, NO-OWNER **0**. C62's null case materialized exactly as predicted.
- **Gates.** `lint` **0**, proven to bite on a T11 file. `type-check` **6/6**, `build` **5/5**, both 0
  cached forced. `test` exit **0 on the first run**, 11/11, 5 cached all `:build`, core `all 150
  group(s)` — **unchanged for one added file**, verified: `line-range.test.ts` matches no isolation
  pattern. `test:scripts` **1114 → 1115** (the +1 is C69's sensor). `test:plugins` **96**/0.
  `check-core-layering` **edges 977 → 978, files 912 → 914**; module 6 adds **zero** edges, importing
  nothing at all. New module **100% lines / funcs**. Discrimination: 15 mutations, M6 **equivalent**
  and M14 **unreachable**, so the honest denominator is **12** — A kills 12/12, pre-existing 3/12, the
  first Phase-3 module where the new suite is discrimination rather than coverage.
- **T12 DONE — `83922db`. PHASE 3 IS COMPLETE.** Module 7 out:
  `services/file-read/read-file.service.ts` + its suite. `read_file.ts` **315 → 124**, `handle()`
  **165 → 27**, `check-tools-thin` **`1/1/0/165` → `0/0/0/27`** and the verdict **`2 of 30` → `1 of
  30`** — the one file still red is `index_project.ts`, T14b's, exactly as C33 predicted. **Five new
  plan defects (C71–C75), running total eighty.** Record is `tasks.md` §10.14. Write set **7** against
  the row's **4**, one user decision covering all three growths; citation policy also the user's.
- **C72 is the one not to skip, and `type-check` cannot see it.** `read-file.test.ts` reaches
  `ReadFileTool`'s collaborators through **four erasing casts**; T12 moves those fields onto module 7,
  so all four break at RUNTIME while `tsc` stays green — observed as **176p/4f** before repointing,
  the four failing cases being exactly the four cast sites. §10.1's **C34 break-phase table tracks
  MEMBERS and stops at T10**; every prior task moved a member, T12 moves the holder. *A break-phase
  table is falsified by moving the container, not only the contents.*
- **C74: the plan's stated mechanism was wrong and only the mutation harness said so.**
  `readFileOptions` sits above `handle()`'s `try` to preserve the pre-T12 throw position — but
  `handle(null)` rejects **either way**, because the catch dereferences `p.filePath`. The real
  discriminating input is a throwing option accessor with a readable `filePath`. M14 survived column A
  **twice**: first the pin was missing, then it was written without `await` and floated. *A pin can be
  absent, vacuous, or aimed at the wrong input, and all three read identically in a green suite.*
- **C71**: the row's four spans are **97 of `handle()`'s 165** lines and cannot produce its own
  *`handle()` → ~15*; all five cited spans were stale. **C73**: R-30's *above 125 → logic was left
  behind* cannot say what went over — the five sibling docblocks average **32.4** lines against a
  budgeted **10**, and the first draft measured **131**, trimmed in prose not code; the reading is now
  recorded decomposed. **C75**: module 7's own size is measured by **no** gate (`check-tools-thin` is
  `tools/`-scoped, G-HUB runs on `services/search` alone) — recorded, not fixed.
- **Citations: 46 swept, 7 adjudicated, 39 T12's, all in one file.** T12 is TERMINAL for
  `read_file.ts`, so C62's null case is the default rather than a residue. **37 of 46** classify
  differently under one BASE. Widening to `test()` TITLE strings moved **39 → 46**: measured **7**
  citations on **5** lines, against the row's stated *nine* and its own enumeration of seven — with
  two of its five line numbers stale. Verified by round trip: 26 pairs by content across 2 frames, 5
  de-numberings in both directions, **0** residual.
- **Gates.** `lint` **0**, proven to bite on a T12 file. `type-check` **6/6**, `build` **5/5**, both 0
  cached forced. `test:scripts` **1115** unchanged (T12 adds no `scripts/` test); `test:plugins`
  **96**/0. `check-core-layering` **edges 978 → 980, files 914 → 916**; `read_file.ts`'s own
  `tools → services` count **7 → 2**. Module 7 **100% lines / funcs**. Discrimination: **15**
  mutations, **no** equivalent or unreachable rows this time — A kills **15/15**, pre-existing
  **9/15**, the six misses being the whole of `readFileOptions`' contract, the conditional-spread
  shape and the call position. **`bun run test` exited 1 on its first run and it is not PR-D's** —
  `mcp-client`'s `web/fetch_and_index` at 22780 ms, zero diff against `main`, **95p/0f standalone
  under an empty config dir**; warm re-run 11/11 exit 0, core `all 150 group(s)`, unchanged for one
  added file and the runner's classification read rather than assumed.
- **T13 DONE — `f56e03e`. Phase 4 is open.** Module 8 out:
  `services/indexing/execute-indexing.ts` + its suite. `index_project.ts` **352 → 246**, maximal
  bodies **3 → 2**, members **404 → 403**, and `check-tools-thin` **stays `1 of 30`** — the three
  remaining flag reasons are T14's two module-level bodies and T14b's `handle()` ceiling, exactly as
  C33 predicted. **Two new plan defects (C76–C77), running total eighty-two.** Record is `tasks.md`
  §10.15. Write set **4** against the row's **3**, one user decision — and **the phase total does not
  move**, because that fourth file is one of the 2 test repoints §1's Phase-4 row already carries for
  T14. First growth on this feature that leaves §1's sum/union/identity untouched, checked not assumed.
- **All nine cited spans were EXACT, which inverts T9–T12** — because `index_project.ts` is
  **byte-identical at HEAD, `main`, `d7091ac` and `f06b01d`** (blob `aa953e5c`), confirmed by blob SHA
  at four refs rather than by reading, so C43's T5-era re-derivation still held. 12 text anchors.
- **Order taken: T13 → T14b → T14, and it is the hazard §6 item 8 does not state.** The spans are
  disjoint; the line numbers are not. File order is T14 `:39-68` < T14b `:151-202` < T13 `:246-351`,
  so landing the **last** span first renumbers neither of the others, while T14 first renumbers both.
  **Verified by outcome**: after T13, all six remaining anchors re-derived EXACT, so **T14b and T14
  inherit zero re-derivation cost**. Re-derive anyway — the import block sits above every span.
- **C76**: §6 item 8 still cited the **pre-C43** spans, and §8.1's declared scope is `design.md`, so
  no task was scheduled to fix a `tasks.md` site — PR-C's **C19** shape, third time here.
  `design.md:747` carries the same superseded figure and is added to §8.1 row 14. Disjointness
  unchanged; only the figures were stale.
- **C77**: T14b's *`handle()` 128 → ~87* is unreachable from its own mechanism. `52 − 16 = 36`, so
  ~~**92**~~ → **93 — C77's own first operand is stale, corrected by C78 at T14b**: `128` is
  `handle()` BEFORE T13, the shipped tree is **129**. C77 was written after T13 committed and
  re-derived from the number it was amending rather than from the tree, which is the sentence it uses
  to convict C43. The mechanism holds; only the baseline was wrong, and 92, 93, 94 and the shipped
  **106** all clear 120. `87` is reconstructably `128 − 45 + 4` — the pre-C43 span minus **only**
  the 4-line catch return, omitting the 12-line `"busy"` block the same sentence keeps in the handler;
  **C43's `~94` re-derived from that wrong baseline instead of from the mechanism**, inheriting the
  defect it was correcting. All three figures clear the ceiling, so **nothing downstream moves**.
- **The mutation harness found what both lenses missed, for the second consecutive task.** 16
  mutations, two subject files, **no refusals and no equivalent or unreachable rows**. First run: A
  killed **12 of 16**, **B killed ZERO** — T13's premise measured rather than asserted. **All four
  survivors were handler-side**, and **M13 is the one that mattered**: passing `warmupCache` without
  `.bind()` loses the receiver and throws on every `warmCache` request, so §4.2's identity decision was
  **documented and unenforced** — C74's shape. *A method test is not a call-site test.* Fixed in the
  subject: four wiring cases, each with an **observed red** first; the union now kills **16 of 16**.
- **A stub had to be strengthened before a sensor could fire at all.** The `ContextualSearchRLM` double
  was receiver-free, so an unbound callback was **undetectable by construction**; it now reads through
  `this` as the real method does. *A stub simpler than its subject can make a decision unenforceable no
  matter how the test is written.* A delegating module mock was tried first and **recursed** —
  `mock.module` rebinds a namespace imported before registration.
- **Gates.** `lint` **0**, proven to bite on a T13 file. `type-check` **6/6**, `build` **5/5**, both 0
  cached forced. `test` exit **0 on the first run**, 11/11, 5 cached all `:build`. `test:scripts`
  **1115 unchanged** (T13 adds no `scripts/` test). `test:plugins` **96**/0. `check-core-layering`
  **edges 980 → 983, files 916 → 918** — **and the pre-`git add` run reported 916 unchanged**, because
  the gate enumerates `git ls-files` and could not see either new file. Core's group count
  **150 → 151**, the new suite classified `database/integration`; **T12's fork-free property cannot
  carry**, since a suite stubbing the ETL pipeline must name it. Coverage (R-36): new module **100% /
  100%**; `index_project.ts` **85.71% funcs / 97.79% lines** against **88.89% / 98.61%** before — the
  same single uncovered function over a smaller denominator, and the gate enforces **line** coverage
  only, so both clear it. That arrow is `handle()`'s outer `.catch` and is **unreachable rather than
  untested**; no artificial reach was written to buy the percentage, and its documented trigger was
  wrong and is corrected (`updateStatus` is the first statement *inside* the try it was said to precede).
- **T14b DONE — `7d4fc22`. The gate's third clause is CLOSED.**
  `services/indexing/acquire-indexing-lease.ts` + its suite. `index_project.ts` **246 → 222**,
  `handle()` **129 → 106** (ceiling 120), members **403 → 402**, maximal bodies **unchanged at 2** —
  the lease block was statements inside `handle()`, never a member, so no other clause could move.
  `check-tools-thin` still reads **`1 of 30`, now for TWO reasons rather than three**, and both are
  T14's. **Two new plan defects (C78–C79), running total eighty-four.** Record is `tasks.md` §10.16.
  Write set **5** against the row's **3**, one user decision; **the phase total again does not move**,
  both growths being intra-phase re-touches.
- **C78 corrects C77's baseline, and C79 states a frame.** C78 is above. **C79**: `tasks.md` §4.2's
  evidence paragraph is wholly in the `d7091ac` frame — `:254-351` and `:306` were deleted by T13,
  `:111`/`:114` were shifted to `:110`/`:113` by T14b — so the **frame is stated** rather than two of
  four numbers renumbered (C52's rule). §10.15's sweep called the whole subsection historical; two of
  its numbers were live.
- **The filename was an author-level choice no artifact makes.** `design.md` §5.1's table runs 1-8
  plus 8b and has **no row for this module at all** (C33 minted T14b after Design). Chosen on the one
  sibling's convention — `execute-indexing.ts` exports `executeIndexing`. Owed to `design.md` as
  **§8.1 row 19; the count is now nineteen, not eighteen.**
- **The mutation harness found what both lenses missed, for the THIRD consecutive task.** 18
  mutations, two subject files, **no refusals and no equivalent or unreachable rows**. Column B swaps
  `index-project-tool.test.ts` back to its **HEAD content**, because the row prices no test repoint.
  First run: A killed **16 of 18**, B **5 of 18**. **Both survivors were the 409 response body** — the
  part the design deliberately keeps in the handler, and therefore the part the module suite is
  structurally unable to reach; the pre-existing assertion is `toContain("indexing_busy")`, which
  passes when the handler reports the **job** id as the **active run** id, and `leaseExpiresAt` was
  asserted by nothing. Fixed in the subject with an observed red; A now kills **18 of 18**. *T13's
  survivors were the call site; T14b's were the call site's OUTPUT SHAPE.*
- **A docblock sentence claiming a property destroyed it.** The new suite asserted it named none of
  `run-tests-isolated.ts`'s isolation literals **by listing them**, and the predicate is a plain
  word-boundary scan over test source, comments included — classifying the file
  `database/integration`. Core went `150 → 151` isolated, then back to `122 pure/shared, 150` once the
  names left the comment, so the group count holds at **151, unchanged for one added file**.
- **Gates.** `lint` **0**, proven to bite on a T14b file. `type-check` **6/6**, `build` **5/5**, both
  0 cached forced. `test:scripts` **1115 unchanged**; `test:plugins` **96**/0. `check-core-layering`
  **edges 983 → 985, files 918 → 920**, taken after `git add` on T13's lesson. **`bun run test` ran
  four times and three were red with DISJOINT failing sets** — `mcp-client` `web/fetch_and_index`
  (21903.99 ms), `architecture-map`, `trace_path` — each zero-diff against `main`, naming 0 of T14b's
  five subjects, and green standalone (95p/0f in 2.15 s under an empty config dir, 24p/0f, 18p/0f);
  host load rose **2.30 → 4.12** across the repeated runs. **Run 4 clean: 11/11, exit 0, core `all 151
  group(s)`.** Coverage (R-36): new module **100% / 100%**; `index_project.ts` **85.71% funcs /
  97.52% lines** against **85.71% / 97.79%** after T13 — the same unreachable `.catch` over a smaller
  denominator.
- **T14 DONE — `6af528e`. PHASE 4 IS CLOSED AND THE GATE IS GREEN.**
  `services/project-identity/project-root-identity.ts` + its suite; `index_project.ts` **222 →
  189**, members **402 → 399**, maximal **2 → 0**, `handle()` **106 unchanged** — `check-tools-thin`
  **`PASS — 0 of 30`, exit 0**; the criterion and CI wiring stay T15's. Record is `tasks.md`
  **§10.17**. **One new plan defect (C80), running total eighty-five** — the row's published-surface
  argument was SOURCE-side only; the destination barrel is `export *`-ed by `services/index.ts:66`,
  so the module is deliberately absent from the directory barrel (author level, design.md §5.1's
  precedent). The inherited `:38-67` re-derived EXACT, and the drag rule recursed one level down:
  `type CanonicalizePath` (:36, outside the span) departed on the same 2-in-span/0-elsewhere reader
  count as T14b's imports.
- **The row's "no test rewrite" premise was measured false BEFORE a line moved**: 11 mutations of
  the helpers and their call sites survived every class-reaching suite on the unmoved tree, 11 of
  11 at 61p/0f — the workspace mock returns no stored path in every handler test, so the reuse
  guard no-ops everywhere. Write set **6 against the row's 5, one user decision** (fix-all-now):
  call-site sensors (stored-root knob reset in the existing `afterEach`, `mkdtemp` fixtures,
  `realpathSync` expectations, `createJob` spied), four module-suite pins (message operand order +
  three `path.resolve` placements), `execute-indexing.ts:38` amended. **Phase total unchanged a
  third time** — every T14 file was already in Phase 4's 9-file roster; §1's 107/86/21 hold,
  re-checked.
- **Harness: 18 of 18 written, no refusals; A kills 18, the repoint-only counterfactual kills 6 —
  and A killed everything on run 1, the first task of four where the harness found nothing the
  Plan Challenge lenses missed.** The premeasure ran before planning finished, so the sensors were
  designed against measured survivors rather than predicted ones. B's 6 = the four method-covered
  module behaviors + T13's one pre-existing canonical-path sensor + the self-sensing repoint (an
  unresolvable specifier is a load failure in both columns).
- **Gates at T14.** `lint` 0 (+bite on a T14 file), `type-check` 6/6 / `build` 5/5 both 0-cached
  forced, **`bun run test` green twice** (11/11; the disjoint-red class did not fire; load 5.85 →
  4.18, both readings kept), `test:scripts` 1115 unchanged, `test:plugins` 96/0,
  `check-core-layering` **985 → 986 edges, 920 → 922 files** after `git add`. Coverage (R-36):
  module **100/100**; handler **75.00% funcs / 97.03% lines**, same single unreachable arrow,
  floor cleared. Isolation: core **273 files, 151 groups unchanged**, new suite pure/shared, read
  from the runner. Both pre-move instruments (`t14-spans.ts`, `t14-citation-sweep.ts`) now exit 1
  on this tree — the refusals working.
- **T15 DONE — `89d3c25`. PHASE 5 IS COMPLETE; RFS-01 AC-1 CLOSES ON ALL THREE CONJUNCTS AND THE
  GMS-02 HEADLINE WITH IT.** The step lands at `ci.yml:167-168` (comment `:155-166`, +15 lines),
  parsed build step **12 of 21** between `check-core-layering` and the stale-pointers gate — no
  `if:`, no `continue-on-error`, no live figures in the comment (C63). Ruleset re-verified live
  in-session (context = job id; `build` among the six); gate re-read `PASS — 0 of 30`, exit 0,
  **both directions re-observed on the live tree**: Map-field mutation → `FAIL — 1 of 30`, exit 1,
  members 399 → 400, restore SHA-256-identical. Record is `tasks.md` **§10.18**.
- **The write set grew 1 → 3 under C55's standing rule, no new user decision.** The +15 insertion
  shifts every `ci.yml` line ≥ 155; five live-frame `ci.yml:200` sites adjudicated — two repointed
  `:200 → :215` (`check-tools-thin.test.ts:14`, `design.md:828`), `tasks.md:528` amended in place,
  HANDOFF's Next-action paragraph superseded by its own rewrite, `design.md:970` frame-stated and
  kept (C52). The evidence-audit lens found the author's "three live citations" figure wrong (true
  count **five**); the red-team's critical — parse-success is not list-membership — was folded into
  `t15-verify-post.ts` **before** the edit (16/16 post; observed red 11/16 FAIL pre). One
  pre-existing stale cite logged not fixed: `native-macos-arm64-workflow.test.ts:11`'s colon-free
  "(lines 150-190)" — C57's shape, 166 lines stale before T15, outside every sweep on this feature.
- **C81, the eighty-sixth plan defect, running total eighty-six.** §1's *"which is what takes …
  105 to 84"* sentence sat two tasks stale while the same table's sum and union rows moved to
  107/86 at T12 — the C19 no-owner family inside a self-checking table. Struck and advanced
  (`109 to 86`; identity `15 × 1 + 4 × 2 = 23`), with `check-tools-thin.test.ts` the fourth
  three-phase file (1, 3, 5) and `design.md` entering the two-phase group (5, 7).
- **The local-gate call for a workflow-YAML commit is decided and its population measured** —
  `test:scripts` **IS sensitive** (`scripts/tests/native-*-workflow.test.ts` `readFileSync`
  `ci.yml`): **1115/0 across 49 + 5 shell suites, both sides of the edit**. `actionlint` 0 both
  sides; Bun.YAML structural probe 20 → 21 steps, one match, index 12; `check-core-layering`
  **986 / 922 unchanged** and `lint` 0, both stated as tree-state frames (neither population can
  sense a YAML diff); `type-check`/`build`/`bun run test`/`test:plugins` **N/A by measured
  population** — zero ci.yml readers in either (§10.18). Residual named: local validators are
  proxies for GitHub's server-side validator; first live step run comes with the PR, and the
  CHANGELOG gate cannot fire before then (`pull_request`-only, no PR open, push trigger
  `main`-only — checked, not assumed).
- **T16+T17 DONE — `ef5f837`, ONE commit; PHASE 6's RENAME IS LANDED (T18 deferred after T21).**
  `services/graph/` → `services/memory-graph/`: 7 `git mv` + 28 import lines rewritten by an
  AST-anchored instrument (refuses on population ≠ 28 and on offset drift) + `docs/ONBOARDING.md:225`.
  The commit shape was a measured decision, the first task:commit break on this feature: a bare mv
  reads core tsc exit 2 (13 errors / exactly the 7 production importers) while the 6 `mock.module`
  registrations degrade silently, so C46's no-red-commit bar beat the 1:1 mapping; rejected shapes
  in `tasks.md` §10.19. Acceptance both directions: old path **RAW 0 files / 0 lines**, new path an
  exact **25/45** mirror of the premeasured baseline (§3.5 item 8 reproduced to the digit first).
- **The T17 discrimination table is the carry-forward: 4 of 6 single-miss mock mutations are
  SILENT** — the resolver sweep is those four's only sensor in the repository; the loud two
  (`memory-controller` 27p/5f, `search-facade-synapse` 21p/5f) fell on the axis the red-team did
  not predict, and bun 1.3.14 registers a dead mock path without throwing (probed live). Control:
  a reverted production import is compiler-red. All restores SHA-256-verified.
- **C82 and C83, the eighty-seventh and eighty-eighth plan defects, running total eighty-eight.**
  C82: `docs/ONBOARDING.md:225` fell between two differently-derived "3"s (design §7 group E's
  prose carriers vs §3.5 item 2's R-32 intersection) and was owned by no row — repointed in the
  commit under C55/C62, T15's precedent; `CHANGELOG.md:35` stays as a dated v1.17.0 record (C52).
  C83: group E's "9 fixture citations" contradicts design's own §1.4 and R-32 ("Eight") and the
  measured 8 at all three baselines — `tasks.md` §8.1 row 20 (now twenty rows), T20b's to apply.
- **Post-commit literal residue is an enumerated set, recorded with frames**: outside
  `.specs/`/`.ua/` exactly 11 lines / 4 files (CHANGELOG permanent-dated + T18's ten, scheduled
  transients across the T16→T21 window); `.specs/` 40/12 frame-stated; `.ua/` 200/3 deferred
  (spec §4.4), verified already-excluded from every gate. Gates: lint 0; type-check 6/6 and build
  5/5 forced 0-cached; `bun run test` 11/11 first-run green, core isolation 273/151 unchanged;
  test:scripts 1115/0/49; test:plugins 96/0; `check-core-layering` **986 / 922 count-identical**;
  `check-tools-thin` **byte-identical**; `check-stale-pointers` PASS/28 as the nothing-else-broke
  frame ONLY (stems blind to all 7 renamed basenames). Both Plan Challenge lenses ran — **no author
  figure fell, a first on this feature**. New residual: a populated local pgvector index keys
  embeddings by pre-rename paths; a git rename does not re-index (operational, post-merge).
- **T19 DONE — `40103b6`. PHASE 7 IS OPEN; RFS-04 AC-1 + AC-3 close.** The three removals landed
  at exactly the row's 5 files — `data/vector/{index,hybrid-search}.ts` deleted, `IHybridSearch`
  and `BatchCommand` stripped — **zero write-set growth and zero new plan defects, both firsts on
  this feature** (running total stays eighty-eight). Record: `tasks.md` §10.20. Every figure was
  premeasured at `9abe04c` and full-path-cited (the LIVE `services/search/hybrid-search.ts`: 3
  files / 5 lines — 3 import/require + 2 `mock.module` — untouched); AC-1 read a proven-fresh pack
  (core's `build` never cleans `dist/`, measured; `rm -rf dist` + forced rebuild; tarball
  `dist/data/vector/` 16 → 8, both symbols 1 → 0); the control probe removed the live file and
  observed tsc exit 2 / TS2307 at `contextual-search-rlm.ts(57,8)`, restore SHA-verified. Gates:
  layering 986 → 982 edges / 922 → 920 files, thinness 399 → 398 members — both predicted from
  gate source before the run, both exact; the red-team's 984 fell to the source-derived 982.
  For T25: `.specs/reports/` is untracked hence invisible to `git grep` sweeps and is accepted
  region; `.ua/` regenerates after PR-D.
- **T20b DONE — `7fb8ddf`.** All twenty §8.1 rows applied into `design.md` in place (+103/−27),
  verified **20/20 APPLIED-CORRECT** by an independent row audit; the +76-line shift's citation
  adjudication (T15's precedent) found **zero live repoints owed** — every citing site frame-stated,
  `t15-verify-post.ts` content-anchored and 16/16 post-edit. **C84 minted and fixed in the same
  commit (running total eighty-nine)**: row 19's new 8c table row falsified design's thrice-stated
  "Nine new files under the floor" — the tree holds **ten** — amended at all three sites + R-36.
  §8.1 gained its frame line (ledger numbers are minting-frame; find positions by content). Record:
  `tasks.md` §10.21. Gates (`.specs/`-only): test:scripts 1115/0/49; both structural gates
  byte-stable at T19's readings.
- **T20 DONE — `32f36d5`. RFS-05 AC-2 + AC-3 close.** The parent gains its C28–C33 section
  (C13–C27 convention, six rows verified against rationale artifacts) and every falsified site is
  amended in place — including the two the row's letter did not name, **AS-06's own row and GMS-02
  AC-1's parenthetical** (still carrying ~390 and the C28-falsified sensor as live fact; both
  critics found the gap independently; AC-2's "in place AND indexed" now holds everywhere). Layer
  figures carry three frames + method (a6216cd 31/6/208/41 → d7091ac 30/0/208/39+11 → T20 tree
  **30/0/218/37+11**, critic-re-derived); ~390/55% → **490/707 (69.3%)**; the 707 row frame-stated
  at current **124**. Three author insertions fell to the gate pre-commit (83-vs-51 range
  conflation, C25→C23 misattribution, non-reproducible frame label). Record `tasks.md` §10.22;
  zero new defects, running total eighty-nine; +40-line citation adjudication: zero live repoints,
  bare-`:NNN` swept.
- **T21 DONE — `644f190`. RFS-05 AC-4 closes, red observed FIRST** (22p/1f pre-deletion →
  23p/0f; `EXCLUSIONS` 9 → 8 by module import; behavior-neutral by consumption-site reading;
  gate untouched per Design §4). Record `tasks.md` §10.23. Write set 2 → **4 tracked + 2
  `.specs/`** under C55 (−4/+6 = **+2** shift; lru-evict comments `:318` → `:320`). **Both
  critics caught the author's +3 arithmetic and a missed fourth site** — fixed pre-commit;
  recorded anti-pattern: repoint by content identity against `git show HEAD`, never by delta.
  APFS case-insensitivity noted in the test (pin load-bearing in Linux CI for case-drift). §1:
  sum **112** / union 86 / identity 26 = 14×1 + 6×2. Gates: lint 0; test:scripts **1116/0/49**;
  structural gates byte-stable. Zero new defects, running total eighty-nine.
- **T18 DONE — `96908f3`. PHASE 6 CLOSES.** 10 literal sites swapped in place, zero net line
  change; residual outside `.specs/`/`.ua/` = `CHANGELOG.md:35` alone (permanent C52 record).
  Record `tasks.md` §10.24 with a recorded route deviation (one combined-lens critic, reason
  stated; 8/8 confirmed; `graph-queries.ts` still 440 so the repointed figure is exact). The
  critic's finding — the `:237` trap note is really THREE-way (`data/symbol/` third, Design §1.1)
  and owned by nobody — is **assigned to T22**. Gates: lint 0; test:scripts 1116/0/49; suite
  23p/0f; stale-pointers PASS/28 frame-only. Zero new defects, running total eighty-nine.
- **T22 DONE — `a5a3aa1`. RFS-05 AC-5 closes** + the T18-assigned three-way widen. All five
  figures critic-reproduced (23 migrations, metric named; 8 publishable today / 5 at v1.3.1 by
  `git ls-tree`, both frames stated; the `data/symbol/` error named). Two author-prose defects
  fixed pre-commit (two-vs-three contradiction; over-label). One shell-harness flake adjudicated,
  three readings kept (static assertion, untouched file, red once in aggregate, green twice).
  Record `tasks.md` §10.25; zero new defects, running total eighty-nine.
- **T23 DONE — `036e5b2`** (state files flipped with the T25-pending frame stated inside them;
  `active_feature` untouched, fourth check; §10.26). **T24 DONE — `c6ee80c`. RFS-04 AC-2 closes
  and EXECUTE IS COMPLETE THROUGH T24** — CHANGELOG under both decided headings, semver re-taken
  per item on the reachability table, live file exempted by name, no skip-ci literal anywhere it
  matters; §10.27. Running total **eighty-nine** plan defects; branch **57 ahead of `main`**,
  unpushed, no PR; `test:scripts` 1116/0/49 at the close.
- ~~**Next action: Execute, T5**~~ … ~~**Execute, T22**~~ → ~~**Execute, T23 + T24**~~ →
  ~~**Next action: T25 — STOPPED ON THE USER'S AUTHORSHIP QUESTION.**~~ The question was answered
  (fresh conversation = different author; HANDOFF Active tail carries the decision with its
  rejected options).
- **T25 DONE — `e18ee11`, 2026-08-03, by the fresh-conversation verifier. VERDICT: PASS.** Record:
  `core-layering-read-file-split/validation.md` (`tasks.md` §10.28 the pointer). All five re-takes
  reproduced from raw data (frozen base per clause 2/1/2 via `--json` in a T5 worktree;
  `edgesExamined` per structural commit, 18 rows all exit 0, 965/896 → 986/922 → 982/920; resolver
  sweep old 0/0 / new 25/45 exact; pack from proven-fresh dist, 8 survivors, both symbols 0; a
  ten-fault discrimination table, SHA-256 restores, **no surviving mutant**). Both open criteria
  questions closed in the amendments' favour on two-sided executed evidence (C37 probe green under
  the mutation while the resolution escaped the root; `$HOME`-leak red only under the set-equality
  case). Ten new modules re-measured 100/100 each (GMS-05 AC-2 per file). Zero new plan defects —
  running total stays **eighty-nine**. **Next action: the user's — push, PR (first live CI run of
  the new step; CHANGELOG gate fires there), `--no-ff` merge (R-04/R-27).**
- **Three full Plan Challenge gates run.** Specify: two modes, seven findings, six revising the
  document (`spec.md` §9.1). Design: two modes, **twelve** findings, all twelve re-measured and
  confirmed (`design.md` §10). Tasks: two modes, **eight** findings, all eight confirmed
  (`tasks.md` §8) — plus **eleven** corrections the sizing measurement produced before the gate ran
  (`tasks.md` §3.5).
- **C33 is the fortieth plan defect and the highest-consequence line in `tasks.md`.** Phase 4 as
  designed **could not close the gate**: `index_project.ts`'s `handle()` is `:117-244` = **128
  lines**, and all three spans Design extracts (`:39-44`, `:46-68`, `:254-351`) sit **outside** it,
  so the `handle() ≤ 120` clause stayed red at **1 of 30** and T15 could not wire the gate into
  `ci.yml` without failing a required check. Closed by a new task **T14b**, extracting the 45-line
  managed-run lease block `:158-202`; `handle()` **128 → ~87**. Zero allowlist.
- ~~**Six** corrections are owed to `design.md` itself~~ → ~~fourteen~~ → ~~fifteen~~ → ~~sixteen~~ →
  **seventeen** (`tasks.md` §8.1, task T20b), on PR-C's C18 precedent. *"Six" was last true at Design;
  §8.1 grew at T4b, T5, T6, T9 and again at T11 (**C66**).* **C28–C33** are owed to the parent
  `spec.md` (T20); none is written there yet.
- **C28 through C32 and the parent's stale layer figures are owed back** to
  `core-layering-god-module-split/spec.md` (RFS-05 AC-2/AC-3), landing with the work. None is
  written there yet. C29 additionally amends the parent's own `~390 of 707` Evidence row.

## Previous — Core Layering, Controller Retirement (PR-C) — MERGED #59, RELEASED v1.17.0

> **Merged 2026-07-31 as `2bea11e`, `--no-ff`, two parents (`450352b` + `2ea4ebd`); released
> v1.17.0.** T18 PASS, `validation.md`. Everything below was written before the merge and is kept
> as the pre-merge record; where it describes work as outstanding, this line supersedes it. The
> four residual findings are `validation.md` §5.1–§5.4 and what was not verified is §6.

- projectId: `massa-ai`
- workflowSessionId: `spec-core-layering-controller-retirement`
- workflow: spec-driven (Large — Specify + Design + Tasks + Execute)
- feature: `core-layering-controller-retirement` — **Specify COMPLETE and merged 2026-07-31.
  Design COMPLETE 2026-07-31 — full Plan Challenge gate run, five findings, three folded into the
  plan (see below). Tasks COMPLETE 2026-07-31 — a second full Plan Challenge gate, four findings,
  all four confirmed by independent re-measurement. 20 tasks, three phases, 104 distinct files.
  EXECUTE COMPLETE 2026-07-31 on `spec/pr-c-execute` — 20 tasks in four phases, each commit green
  on its own. **T18 independent validation PASS** (author != verifier), `validation.md`: all of
  GMS-01 AC-1-AC-6 and GMS-02 AC-2 re-derived from raw data, 5 mutations, no surviving mutant. Fifteen further plan defects confirmed,
  C13-C27, amended into the parent `spec.md` at T16.**
- **Tasks resolved the two things Design left open**, each with its rejected alternatives recorded:
  1. **The cut → one PR, three phased commits.** Decided by the user, 2026-07-31. Three-PRs and
     two-PRs both rejected — reasons in `tasks.md` §1. Measured input: phases at **62 / 16 / 32**
     files, sum 110, **distinct union 104**, against PR-B's 37.
  2. **R-10's CHANGELOG heading → `### Changed`, a minor.** `### Removed`/major rejected on the
     measured **zero** consumers of the `./controllers` subpath; `### Fixed`/patch rejected against
     PR-B's own precedent.
- **Both non-retroactive steps are taken, at `bc9019b`, before any structural commit** — do not
  re-take them. Frozen base **60 / 32 / 28 PASS**; no-op control **142 / 114 / 28** *(narrowed at
  T10b to **137 / 109 / 28** by C26; HISTORICAL unchanged at 28)*, so the reshape
  moves the count by **+82** and is not a no-op. R-09's coverage is **59 of 61** — the two invisible
  pointers are `controllers/index.js` at `package.json:30` and `src/index.ts:18`, closed by AC-6 and
  AC-2 rather than by the gate.
- **C18, C19, C20 — the twenty-fifth, -sixth and -seventh plan defects**, all found by the Plan
  Challenge gate on Tasks, two of them in artifacts already merged to `main`, all corrected in the
  Tasks PR:
  - **C18** — `design.md` §5.2's code block was a **broken regex**. `String.raw` tagged only the
    first of two concatenated segments, so `\.` became a wildcard and `\b` the backspace character
    U+0008. Verbatim it takes the gate from `PASS 60/32/28` to **`FAIL 0/0/28`**, killing the
    untouched prefix branch. §5.2 is now three remedies deep — no-op, then regression, then correct.
  - **C19** — `controllers/` holds **5** `→ tools/` imports, so retiring the layer into `services/`
    grows `services → tools` **4 → 9**. No task touched them and **AC-3 had no owner at all**.
    Resolved by repointing all five (**T8b**, before T10/T11), closing AC-3 by removal.
  - **C20** — R-11 named `maxFileLoc` 696/700, which the move **does not touch**. The metric that
    moves is `maxForeignReach`, **1 → 3** against a ceiling of **3**.
- **PR-C has no `FEATURES.json` entry** — #56 and #57 both skipped it; **T16b** adds one.
  `active_feature: skills-directive-dedup` is **not** stale and must be left alone.
- **Design's three owed decisions are all delivered** (`design.md` §1, §4, §5), each with its
  rejected alternative recorded:
  1. **R-08's precondition → a kernel tier.** `data → kernel` legal, `data → services` illegal,
     **zero** allowlist entries for the group. Decided by the user, 2026-07-31; allowlist-only and
     hybrid both rejected, reasons in §1. **R-08 closes.**
  2. **GMS-01 AC-4's referent → 26**, not 24 — **C15**. 24 is a property of a double-quote-anchored
     pattern, not of the tree; the check must be written quote-agnostic.
  3. **R-09 → give `POINTER` a second alternation branch for suffix-shaped stems.** Base reading
     frozen before the first structural commit, re-pin as its own commit, both directions observed
     red, **plus a no-op control** confirming the reshaped gate's count actually moves.
- **C16 — the twenty-second plan defect, found by the Plan Challenge gate.** §5's *first* decision
  was *"add `"controller"` to `STEMS`"*, argued as strictly stricter. **It is a measured no-op.**
  `POINTER` interpolates the stem as a **prefix** (`<stem>-<rest>.ts`) and every controller file is
  **suffix**-shaped: `controller-*.{ts,js}` matches **0** tracked files, `*-controller.{ts,js}`
  matches **6**. Patched gate output is byte-identical to baseline. R-09 would have been recorded
  closed over **zero** coverage of the 61 pointers it names. Found by *patching the checker and
  running it* — the one thing the original decision never did. **A subject-list entry cannot repair
  a positional assumption baked into a pattern.**
- **Plan Challenge: full gate run 2026-07-31, five findings, three confirmed by independent
  re-measurement and folded into §1–§6** (not appended): the §5 no-op; `db-connection`'s importer
  count (**14** files / 9 non-test, not 12 — the original sweep's pathspec excluded
  `packages/core/scripts/`, where a tracked file imports it by relative path and breaks on any
  move); and the embeddings inversion, which mischaracterised T11's F4 seam as a replacement when
  it is additive-with-default, and left **40** test constructions across 6 files plus **5**
  `mock.module` sites unsized. Two further findings accepted: the kernel's physical path
  (`packages/core/src/kernel/`, path-prefix rule) and the one-PR/question-free conflation, now
  three independently-revertable phases with the cut decision deferred to Tasks.
- **C14 — the twenty-first plan defect.** The kernel tier was **not implementable as chosen**:
  `alias-resolver.ts` and `identity-guard-installer.ts` import `data/db-connection.js`, so
  promoting them makes `data → kernel → data`. Rescued by admitting `data/db-connection.ts`
  itself — 40 lines, zero relative imports, **7 of its 8 non-test importers are under `services/`**.
  **GMS-01 AC-4 counts zero of its edges**, because AC-4 counts `data → services` and this module
  produces `services → data`. The criterion's own direction hid the most-shared module in the tree.
- **`services/embeddings/index.ts` is NOT admitted** — a barrel over 6 sibling modules. Its single
  edge is inverted via a constructor seam instead (the F4/T11 shape), so the allowlist stays empty.
- base: `origin/main` @ `9df5608`. **Specify merged to `main` via #56** (merge commit); **Design
  delivered via PR #57** from `spec/pr-c-design`. The branch named here previously
  (`spec/pr-c-controller-retirement`) is **not** what landed — see `HANDOFF.md`'s branch-name
  correction for the 44-second retarget race that orphaned #55.
- **C13 through C20 are all owed back to the parent `core-layering-god-module-split/spec.md`**
  in its *Design and Execute corrections* index, landing with the work. **None is written there
  yet.** That same commit must also fix the parent `spec.md`'s Status line, which still reads
  *"Execute in progress (PR-B, T19 of 20)"* against a PR-B that merged as #53 and released v1.16.0.
- **C17 — the twenty-fourth plan defect**, found by re-measuring `design.md`'s own figures rather
  than inheriting them. §3 sized the embeddings seam at **40** vector-store constructions across
  **6** test files; measured repo-wide it is **39** across **5**. The phantom sixth was
  `scripts/__tests__/run-deterministic-coverage.test.ts:55`, where `new PostgresVectorStore()` is a
  **string literal** inside `expect(classify(...))` — a different package, and unreachable by any
  constructor change. **C16 mirrored**: C16's pattern could not see its subject, C17's saw a
  non-subject. §2's repo-wide rule is what surfaced it and is now qualified — repo-wide **and**
  excluding string-literal, comment and fixture matches.
- Artifacts: `.specs/features/core-layering-controller-retirement/{spec,design}.md`
- **Scope**: GMS-01 (all six ACs) + GMS-02 **AC-2 only**. `read_file.ts` (GMS-02 AC-1 + AS-06) is
  **PR-D**; `.ua/` regeneration is after PR-D.
- **C13 — twentieth plan defect, found in Specify.** GMS-02 AC-1 named `tools/read_file.ts`, which
  AS-06 (agreed `y`) assigns to PR-D *after* PR-C. GMS-02 now splits: AC-1 → PR-D, AC-2 stays in
  PR-C re-targeted at a handler PR-C touches. **Decided by the user, 2026-07-31**, from three
  options; the two rejected are recorded in `spec.md` §2 with the measured reason each failed.
  Amendment owed back to the parent `spec.md` as C13, landing with the work.
- **Design owes three decisions before sizing**, each with its rejected alternative: R-08's
  cross-cutting-module precondition (`design.md` §5.3 — blocks GMS-01 AC-1's check from being
  written at all); the `controller`-stem sensor gap (**61** stranded pointers invisible to
  `check-stale-pointers`); and the `data → services` metric (AC-4's **24** vs the quote-agnostic
  **26**).
- Gates at `00ed280`: `check-stale-pointers` PASS (0 broken, pin **28** exact) · `search-hub-metric`
  PASS (`maxFileLoc` **696**/700) · `check-frozen-anchors` 0 (14/14) · `check-characterization`
  0 (3/3).
- **R-04 is the highest-likelihood process risk**: PR #53 is the only non-squash in the last nine
  merges (#45–#52 all squashed). `--no-ff` must be chosen deliberately.
- **R-10, new**: PR-C must choose its CHANGELOG heading **before** merge and record who chose and
  what was rejected. PR-B's was settled by default — see this file's closed release-semantics item.

## Previous — Skills / Workflows Updates + spec-driven DI rule

- projectId: `massa-ai`
- Two related harness-text features consolidated on one branch for one PR; both independently
  validated PASS. Branch `feat/skills-and-di-updates` rebased on `origin/main` @ `7c20d47`
  (v1.9.2), worktree `../massa-ai-wt-skills-di`.
- **SWU-01..06** (`spec-skills-workflows-updates`): no unit tests for data/domain models;
  mandatory worktree creation; spec-driven enforces the target repo's `.claude/`/`.cursor/`/module
  + test rules (new `references/repo-rules-discovery.md`); Jira tasks per Phase/Wave with sub-tasks
  per Task; one commit per task prefixed `[XXX-YYYY]`; branch per Phase/Wave + PR phase-key prefix.
  Artifacts: `.specs/features/skills-workflows-updates/{spec,design,tasks,validation}.md`.
- **DI-01** (`spec-spec-driven-di-per-phase`): dependency injection / wiring is done inside the
  task/phase that introduces the code, never a separate trailing "DI"/"wiring"/"integration" phase
  (the dependency-side twin of test co-location). Edits in `references/spec-driven/{tasks,execute}.md`.
  Artifacts: `.specs/features/spec-driven-di-per-phase/{spec,validation}.md`.
- Both ride single-source references; 13 of 16 impl-workflow bodies unchanged. Four host skill
  bundles regenerated byte-for-byte (`generate-skill-artifacts.ts --check` = No drift).
- Gates: `bun run test:scripts` zero new failures vs baseline (only pre-existing
  `topLevelEntries`/oxlint/`__zzz_crash_*` fails, all environmental). `type-check` not run in
  worktree (no `turbo`); zero `.ts` files changed.
- ~~Open for the reviewer: harness contract text ships as a real release across the four plugin
  bundles; `[Unreleased]` CHANGELOG entry to be added at merge. PR opened; **do not merge** per
  user instruction — CI watch in progress.~~
- **CLOSED — corrected 2026-07-31.** The entry above was stale for nearly two days. This work
  merged as **PR #45**, `feat(skills): tighten impl/spec-driven/ticket/commit workflows + DI per
  task/phase`, on **2026-07-29T17:45:07Z**, and released as **v1.10.0**. The `[Unreleased]` entry
  was added on the branch (`1ee3a21`) before the merge, so the CHANGELOG gate was satisfied.
  **It was squashed, not merged** — `c677d10` has a single parent (`7c20d47`), so the branch's own
  commits are unreachable from `main` and the remote branch tip `1ee3a21` is **not** an ancestor of
  `origin/main`. Any sha this section cites from that branch resolves only while the remote branch
  survives.
- **Do not confuse this with PR #52.** #52 is a *different* feature — `refactor/skills-directive-dedup`,
  the `skills/` directive dedup gate (T1–T5 of 12), merged 2026-07-30T21:33:50Z as `47b957b`, whose
  own record is `HANDOFF.md`'s *Previous — skills/ directive dedup*. Both are harness-text work with
  similar names and both were squashed; conflating them is easy and was done once already.

## Previous — Core Layering and God-Module Split (PR-B)

- projectId: `massa-ai`
- workflowSessionId: `spec-core-layering-god-module-split`
- workflow: spec-driven (Large — Specify + Design + Tasks + Execute)
- feature: `core-layering-god-module-split` — **Specify, Design and Tasks COMPLETE 2026-07-29.
  Execute IN PROGRESS. Phase 0 (T0–T5) COMPLETE and MERGED (PR #44, released v1.9.2).
  Phase 1 STARTED on `refactor/search-facade-split-phase-1`: T6a and T6 committed and green.
  Next action: review the two plan amendments, then T7.**
- base: Phase 0 merged to `main` @ `d628464`; `origin/main` is now `7c20d47`
  (`chore(release): v1.9.2`), one release-only commit ahead of this branch's base.
  Branch `refactor/search-facade-split-phase-1` cut from `d628464`.
  Dependency `sensor-repair-2026-07` (PR-A) satisfied.
- Artifacts: `.specs/features/core-layering-god-module-split/{spec.md,design.md,tasks.md}`
- **Scope is PR-B only**: search facade split (GMS-03) + `rlm-*` rename (GMS-04), validated by
  GMS-05. AD-012 / GMS-01 / GMS-02 are **PR-C**; `read_file.ts` is **PR-D**.

### What Design settled

- **AS-02's dangling forward reference is resolved.** `git log --all` shows no `design.md` ever
  existed on any branch. The member→consumer matrix it cited was built at `a6216cd` and read
  correctly — all three retained statistics reproduce (`searchImpl` 13 members, `ensureInitialized`
  7 of 15 delegates, `RRF_K`/`fileFilterCache`/`queryUnderstanding` 1 each) — but the artifact was
  never written down. AS-02 **stands, not re-opened**; `design.md` §2 supplies the missing matrix.
- **R-03 is falsified by measurement.** `scripts/search-hub-metric.ts`
  (+13 unit tests) measures `maxForeignReach` over every type declared in a directory.
  *(This line previously read "and the metric is committed". It was not — the Design session wrote
  the file and committed nothing. It lands at Execute T0. See the Execute block below.)* Calibrated
  against M14 (`c92e481`), the split that failed: host file **1668 → 463 LOC** while deepest
  foreign reach went **1 → 14** and members stayed flat (**26 → 24**). M14 moved code without
  moving responsibility, and lines-per-file — the only metric watched — said it succeeded.
  Today's tree is unchanged from post-M14 on both coupling numbers.
- **Gate G-HUB**: every declared type `maxForeignReach ≤ 3`, every file ≤ 700 LOC. Today exactly
  one type fails and it is the target (`ContextualSearchRLM`, 14). Stated limit: necessary, not
  sufficient — N-individual-parameters evades it; GMS-03 AC-2 is the compensating control.
- **The design's first draft was wrong and was replaced.** `#private` state fields would have
  broken **77 post-construction test assignments** across 12 files, and constructor injection would
  have made those stubs *silently ineffective*. Capability modules are therefore **functions taking
  narrow per-call deps records** (constraint LATE-BIND), state fields stay public, and PR-B needs
  **zero test-file edits** outside the 4 rename sites.
- **R-08 answered to PR-B's depth, deferred to PR-C with a precondition.** The rule of thumb passes
  under every unit pairing (0.5× / 2.3×, both under 3×), but its premise was ~10× low and file
  count is not where the risk is: 12 of the 24 `data → services` edges are one misfiled module
  (`prisma-client.ts`); the other five targets are **cross-cutting modules with no legal home** —
  `search-diagnostics.ts` is imported by all four layers. PR-C's Design must answer *"where do
  cross-cutting modules live?"* before it sizes itself.
- **New PR-B constraint the spec did not have: FROZEN-ANCHOR.** PR-A content-anchored all 14
  needles and removed every `filePath`, so the rename is invisible to the fixture — but 4 of 14
  anchors are *content* inside files PR-B rewrites (3 in `rlm-fusion.ts`, 1 in `rlm-search.ts`),
  and an unresolvable anchor is now a hard failure. Those four strings are frozen text.

### Plan Challenge

Full The Fool, mode `evidence_audit`, two parallel read-only critics. Two **critical** findings —
the deliverable scripts did not exist, and the M14 calibration table did not reproduce — plus two
successful **breaks of G-HUB** (aggregate-holder rename; class rename giving a vacuous pass). All
incorporated: D2 committed with tests, the gate rewritten to enumerate declarations rather than
audit a name, and the table corrected. The measurement method was wrong **four** separate times;
two of the defects cancelled, so the reported number was stable and incorrect.

### Spec corrections owed (design.md §10, applied at task T19)

C1 AS-02 tense · C2 `~16` denominator → 23 · **C3 needles cost 90 min → ~2 min** · C4 GMS-04 AC-4's
fixture clause is obsolete, replaced by FROZEN-ANCHOR · C5 R-08 premise · C6 R-03 falsifier ·
C7 `data → services` is 24 edges / 14 files.

### Execute — Phase 0 COMPLETE (2026-07-29), stopped at the session boundary

**T0–T5 are committed; T6 is not started.** That stop is the plan's, not an interruption: Phase 0
locks every before/after measurement — G-HUB, the needles baseline, the characterization record —
and none can be taken retroactively once a structural commit lands. It is the one review point
Phase 1 cannot be re-done without.

| # | commit | deliverable |
| --- | --- | --- |
| T0 | `ab80e62` | `search-hub-metric.ts` + 13 tests, `.specs/` artifacts |
| T1 | `3dee676` | `search-facade-matrix.ts` + 20 tests (D1) |
| T2 | `8fd3983` | `search-facade-metrics.ts` + 18 tests (D3) |
| T3 | `e359115` | `check-frozen-anchors.ts` + 9 tests |
| T4 | `0129207` | needles baseline + `needles-diff.ts` + 17 tests |
| T5 | `06bde32` | `check-characterization.ts` + 14 tests, `validation.md` |

Gates at `06bde32`: `lint` 0 · `type-check` 0 · `test:scripts` **725 pass / 0 fail across 39
files** · `check-frozen-anchors` exit 0 (14/14 unique) · `check-characterization` exit 0 (3/3 at
floor) · characterization net **160** across 7 suites · G-HUB exit 1 at reach **14** · needles
gate PASS at hit@1 **0.6429** / MRR **0.7357** · PATCHABLE **16 across 3 files** · exclusions **9**.

The before-record is `validation.md`. **It carries no verdict** — that is T20's, by a fresh
verifier. Two spec corrections were added to `design.md` §10 for T19: **C8** (the dynamic
importers are `packages/core/src/scripts/{beir,symbol}-benchmark.ts` at `:259`/`:214`; the cited
`scripts/…:258`/`:213` paths do not exist) and **C9** (§5.1 names two dynamic `controllers`
importers; there is one — measured 22 deep + 1 barrel + 1 dynamic = 24).

**The recurring defect of this phase, three times in one session: a measurement whose reading was
an artifact of the state it was taken in.** T2's suite was verified at 17 pass / 0 fail while its
own files were *untracked*, and it enumerates `git ls-files` — staging them moved fan-in to 27 and
turned 3 of its own tests red. The same shape then moved the mention-only count twice more as
later tooling landed, which is why that count is now a floor plus a partition invariant rather
than an exact pin. **A measurement script has to be verified in the tracked state it ships in.**
`design.md` §13 already recorded the method being wrong four times with two defects cancelling;
this is the same family and it is not exhausted.

Two further findings recorded rather than corrected. **"Each anchor appears exactly once
repo-wide" was already false** — each of the four appears 4–6 times across tracked files and is
unique only inside `resolve.ts`'s `.ts`/`.tsx` corpus, which is the scope the real gate uses.
And **LATE-BIND's site count now has four values from four methods** (77 prose / 82 table / a
third from direct measurement / 91 here): the spread is the finding, so the sensor is the
per-suite pass count, which is exact.

`benchmarks/needles/run.ts` was changed at T4 to record each needle's `rank` and resolved
`expected` span into its report. Without it, comparing an old report against a post-rename tree
resolves anchors to their new homes, matches nothing in the old hit lists, and reads as a miss on
every needle — a total collapse manufactured entirely by the measurement. The baseline is
committed at `.specs/features/core-layering-god-module-split/needles-before.json` because
`benchmarks/needles/reports/` is gitignored and a baseline that does not survive a fresh checkout
cannot be T17's referent.

**~~Open for the reviewer~~ — CLOSED 2026-07-31, and *how* it closed is the point.** The question
was: the `[Unreleased]` entry sits under `### Changed`, which cuts a **minor** release; if PR-B
should land as a patch it must move to `### Fixed`.

**Settled by default, not by deliberation.** No one argued it. The user merged PR #53 with the 12
`### Changed` bullets untouched, and the automatic release chain did the rest — `release.yml`
derived **minor** from the D4 table and shipped **v1.16.0**. Recording it as *"Resolved"* would
overstate what happened, which is the format defect `validation.md` §15 finding 2 names.

- **Decided by:** the user, by the act of merging — not by a written adjudication. **PR #53 drew
  zero comments** (0 issue, 0 review, 0 reviews, read through the API), so the question was never
  raised on the PR at all. This entry is the first place the outcome is written down.
- **Option rejected:** moving the section to `### Fixed` for a patch bump (which, from `main` at
  1.15.0, would have cut **v1.15.1**). It was rejected **by not being taken**, not on merit. The
  case for it was real — PR-B is behavior-preserving by construction, and GMS-05's whole apparatus
  exists to prove exactly that, so `### Fixed` was defensible.
- **The premise had also gone stale.** This item was written when `main` was **1.11.0**; `main`
  reached **1.15.0** through four unrelated releases before the merge, so the version the choice
  would have produced was not the one the item was written against.
- **Consequence, on the record:** a behavior-preserving refactor cut a minor version. Nothing
  breaks — but the next reader should know the semantics were inherited from the heading, not
  chosen for the change.

**For PR-C:** decide this *before* the merge, and write the decision down with the name of whoever
made it and the option rejected. That is the one process finding PR-B hands forward.

### Execute — COMPLETE. T6a–T20 committed, every criterion validated, **MERGED as #53 (`fe1f30b`, `--no-ff`) and RELEASED as v1.16.0 on 2026-07-31**

**Two branches, and the first one is gone.** T6a and T6 were executed on
`refactor/search-facade-split-phase-1` (cut from `d628464`) and reached `main` through **PR #46,
which was squashed rather than merged** — so **R-04 was violated**: none of those commits are
ancestors of `main`, the shas below are unreachable, and the per-commit sensor evidence survives only
in `.specs/`. That branch is deleted. T7 onward lives on
**`refactor/search-facade-split-phase-1b`**, cut from `main` @ `5247ecb` (v1.11.0), worktree
`../massa-ai-wt-facade-phase-1b`. The `-1b` name is deliberate: reusing the old one would make these
commit tables ambiguous against a history that no longer exists. `refactor/search-facade-split`
(Phase 0's, `23e68b9`) still exists on the remote and is **not** this work. **This PR must be merged
with a merge commit.**

| # | commit | deliverable |
| --- | --- | --- |
| — | `569de25` † | plan amendment: AC-3 retired, T6's sensor corrected |
| T6a | `7996c2d` † | `capture-facade-baseline.ts` + 3 frozen fixtures; 9 assertions re-pointed |
| T6 | `f612e03` † | `rlm-fusion.ts` → `result-fusion.ts` |
| T7 | `3e46eae` | `buildGraphStream` → `graph-stream.ts`, plus the sensor amendment |
| T8 | `29ea8b9` | `applySynapseState` → `session-bias.ts` with `SessionBiasDeps`; the AC-2 and LATE-BIND sensors |
| T9 | `2664008` | `correctQuery` → `hybrid-search.ts` with `HybridSearchDeps`; **`rlm-synapse.ts` deleted whole**; a second LATE-BIND sensor |
| T10 | `b9d444d` | six indexing surfaces → `project-indexer.ts` with `IndexerDeps`; `ensureInitializedImpl` absorbed into the root; **`rlm-indexing.ts` deleted whole**; a third LATE-BIND sensor |
| T11 | `23470ce` | `injectedDeps.indexManager` — the F4 seam, the only *added* seam in PR-B; `index-manager-seam.test.ts` red under three violation shapes |
| T12 | `484e61a` | four admin surfaces → `index-admin.ts` with `IndexAdminDeps`; **`rlm-admin.ts` deleted whole**; `index-admin-late-bind.test.ts` red under five mutation shapes |
| T13 | `1090504` | five search surfaces → `hybrid-search.ts` with an 8-key `HybridSearchDeps`; **`rlm-search.ts` deleted whole** — the last of the five delegates; `hybrid-search-late-bind.test.ts` widened to 4 tests, red under six shapes; **G-HUB exit 1 → 0** |
| — | `ba8d2bc` | plan amendment: T14's sensor corrected — the tenth plan defect |
| T14 | `e4e38bd` | the root's final cleanup — ten stale `Visibility relaxed` notes replaced per group (§4.3 for the nine methods, §4.3.1 for the one field), the T13 hand-off block retired; **Phase 1 closes**; the eleventh plan defect |
| T15–T19 | see `HANDOFF.md` | **`HANDOFF.md`'s commit table is canonical and runs to T19.** This table stopped at T14 and carried `on -1b` in place of a sha until T19 corrected both. It is not extended here on purpose: two copies of the same table is what drifted, and one of them was wrong for five tasks. |

† unreachable — squashed into `main` by #46. **Post-merge update**: `-1b` itself is no longer
unpushed or local-only — see *Next* below and `HANDOFF.md`'s *Next action*. This footnote's "local
only" always meant the pre-`b7cb5a2` state; the squashed `-1` commits it marks unreachable stay
unreachable regardless.

Gates at T8: `lint` 0 · `type-check` 0 · `build` 0 · `test:scripts` **732 pass / 0 fail across 39
files**, exit 0 · `check-frozen-anchors` exit 0 (14/14) · `check-characterization` exit 0 (3/3) ·
characterization net **160** unchanged across 7 suites · `search-synapse-integration` **5/0** · new
`session-bias` **10/0** · new `session-bias-late-bind` **3/0** · coverage exclusions **9** · G-HUB
exit 1, 25 files, foreign modules **5**, reach **14** (both expected until T13/T14), `perModule`
synapse **2 → 1** · D1 `delegateScope` **18 → 17**, facade-taking **13 → 12**, scoped LOC
**1186 → 1132**.

Gates at T9: `lint` 0 · `type-check` 0 · `build` 0 · `test:scripts` **732 pass / 0 fail across 39
files**, exit 0 · `check-frozen-anchors` exit 0 (14/14) · `check-characterization` exit 0 (3/3) ·
characterization net **160** unchanged across 7 suites, every suite individually unchanged ·
`search-synapse-integration` **5/0** · `session-bias` **10/0** · `session-bias-late-bind` **3/0** ·
`search-ranking-regression` **2/0** · new `hybrid-search-late-bind` **3/0** · coverage exclusions
**9** · G-HUB exit 1, 25 files, **foreign modules 5 → 4** (the predicted move, now spent), reach
**14**, members **23**, `perModule` `{csr 5, admin 7, indexing 11, search 14, warmup 1}` — synapse
gone, `csr` **4 → 5** and expected · D1 `delegateScope` **17 → 16**, facade-taking **12 → 11**,
scoped LOC **1132 → 1108**.

**T7, T8 and T9 surfaced a fourth, fifth and sixth plan defect, same class as T6's three.**

4. **The foreign-module count is not a per-task sensor either** (T7) — and this one is the
   *correction* to T6's unfirable sensor inheriting the defect it corrected. A file counts as foreign
   only when it dereferences a `: ContextualSearchRLM`-annotated binding, so `buildGraphStreamImpl`'s
   never-dereferenced `_rlm` contributed zero members. Measured: base 5, +T7 **5**, +T8 **5**, +T9
   **4**. It moves once, at T9. **Resolved: T7's and T8's sensor is the D1 matrix delta**, which reads
   the axis those tasks actually move. Both predictions held exactly.
5. **LATE-BIND has no sensor at T8** (T8) — and this one contradicts the standing constraint rather
   than a task row. `injectedDeps` is `readonly` with **zero** post-construction assignment sites
   (`design.md` §4.3.1's own table), so the ~80-site mechanism that senses LATE-BIND has nothing to
   detect. Measured on the finished code: capturing the deps record instead of assembling it per call
   leaves `tsc` at 0, the characterization net at **160/0**, and T8's own AC-2 sensor at 10/0.
   **Resolved: a dedicated 3-test sensor in its own file** — separate because AC-3 pins the coverage
   file at 41 tests — observed **2/1 red** under the mutation before being trusted. Its claim that
   the ordinary sensor self-heals from T9 on is what defect 6 corrects.
6. **LATE-BIND's ordinary sensor does not "come back" at T9** (T9) — it covers one violation shape of
   two, and this defect is the *resolution* of defect 5 inheriting the flaw it fixed, exactly as
   defect 4 did to defect 3. T8 reasoned from `keywordSearch`'s **10 post-construction assignment
   sites**; that is not the quantity that governs detectability. Measured on the finished code: a
   **construction** capture is caught loudly (`rlm-synapse` **21/5**, `search-ranking-regression`
   **1/1**), a **first-call memo** is invisible (`tsc` 0, coverage **41/0**, `rlm-synapse` **26/0**,
   `search-ranking-regression` **2/0**). All six call sites do construct → assign → call, so a memo
   populates *after* the assignment and captures the correct value; detecting one needs a collaborator
   to change **between two calls on one instance**, and that count is **zero**. **Resolved: a second
   dedicated 3-test sensor**, `hybrid-search-late-bind.test.ts`, whose middle test creates exactly
   that missing shape — observed **1/2 red** under the memo mutation, **1/2** under the construction
   capture and **2/1** under a third-key leak. **T10, T12 and T13 must each run the memo mutation
   against their own surface** rather than inherit the claim.

Two refinements a resumer needs. **Which `this.`-recursion `tsc` can see depends on whether the
module takes deps**: a deps-taking module is one argument wider, so the naive substitution is caught
(`TS2554`), and the blind variant is recursion that *also drops the deps record* — that is the
mutation to run at T10/T12/T13. Both shapes were re-confirmed at T9: `this.correctQuery(query)` left
`tsc` at 0 and coverage at 40/1, while `this.correctQuery(deps, query)` failed with
`TS2554: Expected 1 arguments, but got 2`. And **`toHaveBeenCalledWith` treats an undefined-valued key
as absent** (`f({})` satisfies `toHaveBeenCalledWith({a: undefined})`, measured), so a deps-record
assertion needs defined stubs or it proves nothing — at T9 that meant assigning the *field*, because
the constructor stores its argument in `injectedDeps` and only `ensureInitialized` bridges it across.

Gates at T10: `lint` 0 · `type-check` 0 (6/6) · `build` 0 (5/5) · `test:scripts` **732 pass / 0 fail
across 39 files**, exit 0 · `check-frozen-anchors` exit 0 (14/14) · `check-characterization` exit 0
(3/3) · characterization net **160** across 7 suites, every suite individually unchanged ·
`search-synapse-integration` **5/0** · `session-bias` **10/0** · `session-bias-late-bind` **3/0** ·
`hybrid-search-late-bind` **3/0** · `search-ranking-regression` **2/0** · new
`project-indexer-late-bind` **4/0** · coverage exclusions **9** · G-HUB exit 1, 25 files,
**foreign modules 4 → 3** (predicted by scratch simulation, confirmed), reach **14** by
`rlm-search.ts`, members **23**, largest file now `project-indexer.ts` **641** (700 ceiling
untouched), `perModule {csr 14, admin 7, search 14, warmup 1}` — `rlm-indexing.ts` gone, `csr`
**5 → 14** and predicted · D1 `delegateScope` **16 → 9**, facade-taking **11 → 6**, scoped LOC
**1108 → 626**, all three predicted to the number.

**T10 surfaced a seventh plan defect, and this one contradicts a claim about the *pattern* rather
than a task row.**

7. **The deps-record pattern is not G-HUB-neutral** (T10). `design.md` §3.4 records that the per-module
   records have foreign reach 0 because they are declared in the module that reads them. **True of the
   record type, false of the types its fields name.** `search-hub-metric.ts:139`'s annotation pattern
   `([A-Za-z0-9_]+)\s*:\s*<Type>\b` does not distinguish an interface field declaration from a
   parameter, so `IndexerDeps { indexManager: IndexManager }` attributed four
   `deps.indexManager.<method>` reads to `IndexManager` and took its `maxForeignReach` from **0 to 4** —
   **two** G-HUB violations where the tree had exactly one, which would have made T14's gate
   unclosable and surfaced four commits later with three plausible causes. **Resolved inside T10**:
   narrow the field to `Pick<IndexManager, …4 methods>`, which is the honest type as well as a
   structural annotation. T6–T9 never hit it because their collaborators are either structural
   (`Awaited<ReturnType<…>>`) or declared outside `services/search/`. **T12 and T13 will each hit it**
   — `FileFilterCache`, `SearchAnalytics`/`SearchAnalyticsPg`, `QueryUnderstandingService` are all
   declared in that directory — so both tasks gain a sensor: the hub metric must report exactly **one**
   type above the ceiling, and it must be `ContextualSearchRLM`. Reading only the
   `ContextualSearchRLM` row, which is all T6–T9 needed, is what let this through for one measurement.

Gates at T11 — **every structural figure byte-identical to T10, and that is the prediction, not a
missed measurement**: `lint` 0 · `type-check` 0 (6/6) · `build` 0 (5/5) · `test:scripts` **732 pass /
0 fail across 39 files**, exit 0 · `check-frozen-anchors` exit 0 (14/14) · `check-characterization`
exit 0 (3/3) · characterization net **160** across 7 suites, every suite individually unchanged ·
`search-synapse-integration` **5/0** · `session-bias` **10/0** · `session-bias-late-bind` **3/0** ·
`hybrid-search-late-bind` **3/0** · `project-indexer-late-bind` **4/0** · `search-ranking-regression`
**2/0** · new `index-manager-seam` **3/0** · coverage exclusions **9** · G-HUB exit 1, 25 files,
foreign **3**, reach **14**, members **23**, `perModule {csr 14, admin 7, search 14, warmup 1}`, and
**exactly one type above the ceiling** — T10's seventh-defect check, run and passed, with
`IndexManager` at foreign **0 → 0** and reach **0 → 0** · D1 `delegateScope` **9**, facade-taking
**6**, scoped LOC **626** — all three unmoved.

**T11 produced no eighth plan defect — the first Phase 1 task whose row survived execution
unamended.** That is evidence about *where* this plan's defects live rather than a claim it is now
sound: **T11 is the only Phase 1 task that moves no function**, and all seven defects were consequences
of a move. T12 and T13 move functions again and each carries a known trap already.

Two T11 results that matter downstream:

- **Three violation shapes, all red on the new sensor, `tsc` blind to all three, and two of them
  invisible to the entire pre-existing suite.** The plan named two; the third — seam correct but
  **hoisted above the `Promise.all`**, so the default construction captures an unresolved
  `this.vectorStore` while still satisfying `instanceof` — came from the plan critic. The only prior
  assertion about this member was `rlm-indexing.test.ts:201`'s `toBeDefined()`, which catches one shape
  (**24/1**) and neither other. Plan-challenge finding 7, discharged by measurement.
- **An optional record field does *not* fire the seventh defect, and the `?` is the whole reason.**
  `search-hub-metric.ts:139`'s `([A-Za-z0-9_]+)\s*:\s*<Type>\b` cannot match across `?`, so
  `indexManager?: IndexManager` is never captured as a binding — same route by which
  `indexManager!: IndexManager` always escaped. Independently moot: `perModule` needs a *dereference*,
  and the root has none. Both measured. **The `Pick<>` decision does not generalise to this field** —
  its value lands in the public full-typed `indexManager` field, so narrowing would need a cast. T12's
  and T13's fields are *required*, so they **will** fire and must still be narrowed. Residual risk is a
  later edit dropping the `?`; nothing fails until T14.
   **Settled by the reviewer at the T10 review point: `Pick<>` per record is the pattern**, and
   rescoping the ceiling inside `search-hub-metric.ts` was rejected because it edits a sensor during
   the refactor that sensor polices. The accepted cost — narrowing hides a real four-method reach, and
   forgetting to narrow breaks T14 — is carried as a **sensor** on the T12/T13 rows, not as advice.

**Two standing reviewer decisions were also closed at this review point**, so no later task re-raises
them: the `Pick<>` pattern above, and **release semantics — `[Unreleased]` stays under `### Changed`
and PR-B lands as a minor** (left open at T7, T8, T9 and T10). The module layout, exported symbols and
file names are a public compatibility surface per `CLAUDE.md`, and PR-B deletes two modules outright.

T10 also confirmed the T9 LATE-BIND finding at the best case available and registered a **6-site
extension to PATCHABLE's measured footprint** — `rlm-indexing.test.ts` stubs `rlm.indexFile` and
`rlm.indexProject` as bare assignments with no `as any` cast, so the established regex finds none of
them; both are exercised through `ensureFreshIndex` / `_indexProjectInternal`, which is why
`IndexerDeps` carries them as per-call arrow wrappers. Full record in `tasks.md`.

Gates at T12 — **every structural prediction held to the number**: `lint` 0 · `type-check` 0 (6/6) ·
`build` 0 (5/5) · `test:scripts` **732 pass / 0 fail across 39 files**, exit 0 ·
`check-frozen-anchors` exit 0 (14/14) · `check-characterization` exit 0 (3/3) · characterization net
**160** across 7 suites, every suite individually unchanged · `search-synapse-integration` **5/0** ·
`session-bias` **10/0** · `session-bias-late-bind` **3/0** · `hybrid-search-late-bind` **3/0** ·
`project-indexer-late-bind` **4/0** · `index-manager-seam` **3/0** · `search-ranking-regression`
**2/0** · new `index-admin-late-bind` **4/0** · coverage exclusions **9** · G-HUB exit 1, 25 files,
**foreign modules 3 → 2**, reach **14** by `rlm-search.ts`, members **23**, `perModule {csr 15,
search 14, warmup 1}` — `rlm-admin.ts` gone, `csr` **14 → 15** and predicted — exactly **one** type
above the ceiling, and **`maxFileLoc` 641 → 675 against a 700 ceiling** · D1 `delegateScope`
**9 → 5**, facade-taking **6 → 2**, scoped LOC **626 → 524**, all three predicted to the number ·
AC-3 budget **0**, spent **0** · T15's `rlm-` count **29 → 30**.

**T12 surfaced an eighth plan defect, and it contradicts the *resolution* of the seventh — the fourth
time in this feature a correction has inherited the defect it was correcting.**

8. **The seventh defect's T12 sites do not fire, and one of them cannot be narrowed at all** (T12).
   The seventh defect's enumeration, the T12 row and `HANDOFF.md` all predicted that
   `fileFilterCache: FileFilterCache` and any `SearchAnalytics`/`SearchAnalyticsPg` field "**will**
   fire" because they are *required* record fields rather than T11's optional seam. **Measured: false
   for both.** The analytics field cannot fire on three independent grounds — `SearchAnalytics` is an
   alias re-export whose declaring line `stripNonCode` deletes, so it is **never declared** and never
   appears in the metric's output; `SearchAnalyticsPg` only ever occurs after `| `, never in
   `<name>:` position; and `getAnalytics` returns `deps.analytics` **whole**, never dereferencing it.
   It also **must not** be narrowed: `Pick<>` there breaks `type-check`, because the value is returned
   through the root's public `getAnalytics(): SearchAnalytics | SearchAnalyticsPg`, a 24-importer
   surface — so the row's instruction was *unexecutable*, not merely unnecessary.
   `fileFilterCache` **does** trip the mechanism (foreign 0 → 1, reach 0 → **1**) but **1 ≤ the
   ceiling of 3**, so it yields no second violation, unlike `IndexManager` at reach 4. **Resolved
   inside T12's own write set** on T10's precedent: keep the `Pick<>` as honest typing per §4.4,
   record it as *not* a fired sensor, and correct the T12 and T13 rows in the same commit. What
   generalises: *"declared in the gated directory + required field"* is a **category**; whether the
   annotation pattern captures a binding and whether the module dereferences it are the **mechanism**,
   and they are two separate measurements. **T13's `queryUnderstanding` is the one site left where
   both may hold** — §2.1 shows it dereferenced — so T13 measures both variants rather than inheriting.

**Two more T12 findings that are not plan defects but change how T13 works.**

- **A trap no task row names: G-HUB gates on `MAX_FILE_LOC` 700 as well as on reach.** Phase 1 moves
  LOC out of the `rlm-*` files and *into* `contextual-search-rlm.ts`, which took the largest-file title
  at T10 (641). T12 as first written pushed it to **685**; trimming prose into `index-admin.ts` (the
  `IndexerDeps` precedent) brought it to **675**, leaving **25 lines**. T13 grows the root again.
  Crossing 700 fails G-HUB on an axis unrelated to hub coupling and makes T14 unclosable for a reason
  nothing names. Carried as a **sensor** on the T13 row.
- **T10's blind-recursion rule is necessary but not sufficient, and T12's surface has no observable
  subject.** T10 said use a delegate with no preceding `await`. `getAnalytics` is exactly that and
  **hangs anyway** — `tsc` 0, then >60 s at ~98 % CPU with no throw, reproduced outside `bun test` in a
  bare script with a `try/catch`, so it is not the runner's error formatting. The missing condition is
  that the delegate be **`async`**; an async frame cannot be elided, which is why T9's and T10's
  overflowed at once and read cleanly. A JavaScriptCore tail-call explanation was **tested and not
  confirmed** and is recorded as unverified. **A hang is not blindness** — no such run reports green —
  and the positive runtime evidence is the module spy's `toHaveBeenCalledTimes(2)`. The naive half is
  caught statically (**TS2554**). T13 inherits both mechanisms; it must not budget time hunting a
  subject.

Also measured at T12: **`git grep -E` cannot express the PATCHABLE sweep and fails silently** — POSIX
ERE has no `\s`, so `-E` returns zero matches and exit 1 where `-P` returns **7** (`rlm.search` stubbed
at `rlm-admin.test.ts:124,137,148` and `contextual-search-rlm-coverage.test.ts:382,395,407,416`, all
bare assignments, a **7-site extension** to PATCHABLE). Those 7 are also the only 7 `warmupCache` calls
in the suite and all assign *before* they call, so a `.bind(this)` at assembly time is invisible to the
entire pre-existing suite — hence the arrow wrapper and the new sensor's test 4. Seventh
two-methods-two-answers in this feature: **name the flag, not just the tool**.

Gates at T13 — **the split is proven**: `lint` 0 · `type-check` 0 (6/6) · `build` 0 (5/5) ·
`test:scripts` **732 pass / 0 fail across 39 files**, exit 0 · `check-frozen-anchors` exit 0 (14
anchors) · `check-characterization` exit 0 (3/3) · characterization net **160** across 7 suites, every
suite individually unchanged · `search-synapse-integration` **5/0** · `session-bias` **10/0** ·
`session-bias-late-bind` **3/0** · `project-indexer-late-bind` **4/0** · `index-admin-late-bind`
**4/0** · `index-manager-seam` **3/0** · `search-ranking-regression` **2/0** ·
`search-dependency-outage` **9/0** · `search-filter-overfetch` **10/0** ·
`search-admission-preflight` **5/0** · widened `hybrid-search-late-bind` **4/0** · coverage exclusions
**9** · **G-HUB exit 1 → 0**, 24 files, foreign **2 → 1**, reach **14 → 1** by `search-warmup.ts`,
members **23 → 18**, `perModule {csr 18, warmup 1}`, **zero** types above the ceiling, `maxFileLoc`
**675 → 697** against 700 · D1 `delegateScope` **5 → 0**, facade-taking **2 → 0**, scoped LOC
**524 → 0**, all terminal · AC-3 budget **3 → 4**, 4 spent · T15's `rlm-` count **30 → 29**, the first
decrement in the series.

**T13 surfaced a ninth plan defect, and it is the fifth time in this feature that a correction
inherited the defect it was correcting.**

9. **T14's sensor fires at T13** (T13). `tasks.md`'s *T6's sensor was unfirable* section — itself the
   correction to T6's unfirable row — closed with *"reach cannot fall until T13 rewrites
   `rlm-search.ts`, and **G-HUB cannot go green until T14**. G-HUB's exit status is T14's gate and
   nobody else's."* The first clause is right and the second is false **because** the first is right:
   reach falling *is* the gate, and nothing else in the directory was above the ceiling. Measured
   before any edit, on a scratch copy of `services/search` with `rlm-search.ts` removed and nothing
   else changed (deletion verified by `diff -rq`): **exit 0**, `ContextualSearchRLM` foreign 1, reach
   **1** by `search-warmup.ts`, **zero** types above the ceiling. D1 goes terminal on the same commit,
   so **both** of Phase 1's structural sensors reach their target values at T13. Taken literally, T14
   would have read a gate already green before it started — an artifact reporting success while
   measuring nothing, this repository's signature defect class arriving in the plan's own final
   structural task, and the exact mirror of T6's row (which would have reported a correct task as
   failed). **Resolved by reviewer decision at the T13 review point: re-scope T14's sensor, keep the
   order.** T13 owns the G-HUB close and records it; T14 narrows to the root's final cleanup with
   `git grep -c 'Visibility relaxed'` **10 → 0** as its discriminating sensor and G-HUB exit 0 demoted
   to invariance. Absorbing T14 into T13, and leaving a re-export husk for T14 to delete, were both
   put and both rejected — the first puts the session boundary mid-task, the second reintroduces the
   one-function husk GMS-04 AC-1 forbids and T10 killed `rlm-indexing.ts` whole to avoid.

**Four more T13 findings that are not plan defects.**

- **A deps record snapshots by value, so `ensureInitialized` cannot live in it — this would have
  shipped a broken T13.** The first implementation made it a ninth key called *inside* the module,
  reasoning correctly that `searchImpl` wraps an init failure in `searchBackendUnavailable(…)` so
  T10's and T12's **bare** hoist would drop the wrap. It missed **evaluation order**:
  `#hybridSearchDeps()` is evaluated as an argument before the module runs and reads its five stores
  as plain values, so on an uninitialised facade all five are `undefined`. `tsc` **0**; `rlm-search`
  **15/16**, `search-dependency-outage` **4/5**, `search-filter-overfetch` **1/9**. Fixed by hoisting
  init **with its `try/catch`**. **Surfaced by the read-only plan critic and confirmed by
  measurement** — its third earned keep. Generalises: *"assemble per call from current fields"* has an
  implicit precondition, that the fields are current **at assembly time**; six tasks satisfied it by
  accident of hoisting.
- **The eighth defect's one open site fires, and the gate still does not move.** `queryUnderstanding`
  is the third and last time this question is asked. Both conditions genuinely hold — the binding is
  captured *and* dereferenced — so unlike T12's two fields the mechanism works: bare nominal takes
  `QueryUnderstandingService` to foreign 0 → 1, reach 0 → **1**. But **1 ≤ the ceiling of 3**, so no
  second violation. `Pick<>` kept as **honest typing per §4.4, not a fired sensor**. Across all three
  sites only T10's `IndexManager` at reach 4 ever moved the gate.
- **`HybridSearchDeps` is 8 keys, not §4.1's five**, and the T13 row's "widen test 3 from one key to
  five" was wrong by three and incomplete: test 1 could not survive unchanged (its `toEqual` compares
  fresh closures) and a **test 4** was needed that no row named. Dispositions measured, not read — 5
  stores, 3 per-call arrow wrappers, 3 module-local calls, 1 direct import, 1 hoisted.
- **AC-3's budget was 4, not 3, and two `mock.module` blocks collided.** T12's three sites were
  correct and all spent; a fourth tracks the *record's shape* rather than the facade argument, which
  its sweep could not have found. Ledger **18 → 19**. And the T9 `hybrid-search.js` block and the
  re-pointed `rlm-search.js` block would both have named `hybrid-search.js` — two registrations on one
  specifier do not compose — so they are **merged**, taking `mock.module` **16 → 15**, the first time
  that count has moved down.

**A tenth plan defect was found at the T13/T14 boundary, and it is the sixth correction in this
feature to inherit the defect it was correcting — the shortest-lived yet.**

10. **T14's re-scoped sensor is both unsatisfiable and tautological** (T13/T14 boundary). The
    defective text *is the ninth defect's own resolution*, written into `tasks.md` during T13 by the
    executor from the reviewer's option text without measuring its scope. `git grep -l 'rlm-search'
    -- packages/core/src` → empty **cannot pass**: 31 matches across 9 files, and `rlm-search.test.ts`
    alone contributes nine — a file this same plan defers to T15. Reaching it would mean silently
    widening the write set or re-scoping mid-task. Separately, `'Visibility relaxed' 10 → 0` is a
    **tautology**: satisfied by bare deletion, because nothing checks the replacement exists. The
    violation it hides is concrete — deleting `contextual-search-rlm.ts:184`, the only place in source
    recording PATCHABLE's evidence trail, while every proposed check stays green. Both defects
    reproduced independently by the executor and by a read-only plan critic.
    **Resolved: the sensor is replaced by a mutation, not relaxed.** Reprivatise the ten members;
    `tsc -p packages/core/tsconfig.json` must report **exactly 1 × TS2341**, on `queryUnderstanding`,
    from `production-wiring.ts:51` — measured, mutation verified applied, restore diffed. Plus two
    positive content checks. **The ten sites are two groups**: nine public *methods* held by §4.3's
    compatibility surface, whose reprivatisation **no gate can see** (core's tsconfig excludes
    `src/__tests__`; `type-check` covers four other packages), and one *field* held by a live
    production reader. That split also corrects a plan-critic claim — it reported "a loud `tsc`
    failure across dozens of call sites"; the call sites are real, the consequence is not.
    **Eighth two-methods-two-answers in this feature; re-measure a delegate's figures with the
    project's own command.**
    Generalises: **a sensor must be scoped to the subject the task changes, not the population the
    subject lives in.** The ninth defect read an axis its task did not move; the tenth reads a
    population its task cannot clear.

**An eleventh plan defect was found at T14, before the first edit, and it is the seventh correction in
this feature to inherit the defect it was correcting. The defective text is the tenth defect's own
resolution, exactly as the tenth was the ninth's — and it is the third consecutive defect in this one
task row.**

11. **T14's private-revert is a truth check, not a discriminating sensor** (T14). The T14 row read
    *"The **discriminating** sensor is the **private-revert mutation**"*. By T7's vocabulary that is
    wrong: T14 edits only comments, the mutation edits only modifiers, so the two do not intersect.
    Measured on **both** states under one harness (10 markers verified applied, diff-vs-pristine 40
    lines, refuse-on-byte-identical, restore diffed clean): `tsc` **exit 2, exactly 1 `error TS` line,
    exactly 1 TS2341**, at `production-wiring.ts(51,32)` — **identical before and after**. An invariance
    check cited as a discriminating one is this repository's signature defect class, and it would have
    let T14 report a sensor an empty commit also passes.
    **Resolved as a relabel plus one addition, not a scope change**; the set was always sufficient.
    **Truth check**: the private revert, which witnesses that the *new comment* is true — the job
    `tasks.md`'s own tenth-defect prose already gave it, and which the row's one-word label
    contradicted. **Discriminating pair**: `Visibility relaxed` 10 → 0 *and* the replacement comments
    present; neither half alone, since the first is the tenth defect's tautology and the second passes
    on a file still carrying the false notes. **The pair needed a positional check**, on a plan-critic
    finding: asserting only that `§4.3` and `§4.3.1` both appear somewhere is passed by a replacement
    that **swaps them**, which is the *"the ten sites are not one group"* violation. Closed structurally
    — each citation sits adjacent to the group it justifies (`:114` §4.3.1, `:456` §4.3 and not §4.3.1),
    so a swap is unexpressible without moving a comment past 340 lines of class body.
    Generalises, completing the ninth-and-tenth sentence: **the ninth read an axis its task did not
    move, the tenth a population its task could not clear, the eleventh an axis its task moves nothing
    on. A sensor's label is part of the sensor** — say whether a reading proves the task happened or
    only that nothing broke, because the two are indistinguishable in a report and opposite in meaning.

**A separate T14 finding, not a plan defect: the subject was undercounted by four lines, and the grep is
why.** *"11 lines: the 10 comments plus `:88`"* misses `:95-98`, which said the notes *"below are
historical … Removing them is T14's … leaving them here is deliberate"* — false the moment T14 removes
them, and **carrying no `rlm-search` substring**, so the 13-line sweep that produced the enumeration
could not see it. A subject enumerated by one pattern is exhaustive only for statements that pattern
matches. Short by two more on the other side: `:86-88` is one sentence. **Reviewer decision (2026-07-30):
rewrite `:86-99` preserving `:92-94`'s provenance** — *"do not touch `:93`"* read as preserve-the-record,
authority being **T10's own rule** on correcting stale comments in a source file already in the write
set. Final subject **24 lines**, one file, comments only, **+23 / −24**.

**Three more plan defects were found at T15, and the fourteenth is inside the sensor written to fix
the twelfth. That is the ninth time in this feature that a correction inherited the defect it was
correcting.**

12. **AC-3's own 2026-07-29 correction is unsatisfiable too** (T15). Narrowing to *zero `rlm-` hits
    outside `CHANGELOG.md` / `.specs/` / `.ua/`* cannot pass: ~35 provenance pointers name deleted
    `rlm-*.ts` sources — six files carry nothing else, and every one was added **on purpose** — plus
    `contextual-search-rlm-coverage.test.ts`'s own filename, which §6 keeps, and excluding it moves the
    file count 29 → 29. **Second time this one criterion inherited its own defect.**
    **Resolved (reviewer, 2026-07-30): stop measuring the population, measure the shape.** The counter
    becomes `scripts/check-stale-pointers.ts`, classifying every path-shaped pointer as
    `RESOLVES` / `HISTORICAL` / `BROKEN` against real git history and pinning the `HISTORICAL` count.
    Over budget (45 m → ~2 h); accepted. *Generalises, extending the eleventh's sentence: the ninth read
    an axis its task did not move, the tenth a population its task could not clear, the eleventh an axis
    its task moves nothing on — and the twelfth a population whose floor was never zero, because the
    plan had deliberately put things in it.*
13. **The rename was framed as the executor's decision when the spec already mandated it** (T15).
    `HANDOFF.md:325`, `:561` and `tasks.md` all called it *"T15's own decision"*; **GMS-04 AC-1 says
    *"No source or test file under `packages/core/src` is named `rlm-*`"***. The plan relaxed an
    acceptance criterion its own spec had fixed, and PR-B could have closed with `rlm-admin.test.ts` on
    disk and AC-1 believed met. Only the **names** were the executor's call —
    `search-facade-{admin,indexing,hybrid,synapse}`, chosen because these suites test the facade rather
    than the capability modules, and collision-free against the `*-late-bind` files.
    (`contextual-search-rlm*.ts` is **not** an AC-1 violation: `rlm-*` means *starts with*.)
14. **The replacement sensor under-enforced in two directions** (T15), found by a scoped read-only plan
    critic after its unit suite was already green, then re-measured. **(a)** `historical.length <=
    HISTORICAL_FLOOR` is a **ceiling under a name that says floor** — it catches a stale citation being
    added and is blind to a provenance comment being **deleted**, which is the thing the category exists
    to protect. **(c)** the stem was the literal `rlm`, so the gate could not see the **17 citations
    across 10 files T15's own rename minted**: green on exactly the failure its docblock claims to
    catch, for the names the task had just created. **Resolved (reviewer, 2026-07-30): close (a) and
    (c), record (b).** (a) becomes an exact pin, injected as a parameter so the gate's own tests can
    exercise it; (c) becomes a `STEMS` list with `POINTER` **derived** from it. **(b)** stays open in
    writing: `POINTER` needs a file extension, so bare-word mentions — `` `rlm-admin` ``, a
    `describe("rlm-search — …")` title, an `rlm-*.test.ts` glob — are invisible; policing them would be
    a banned-word list, a different sensor. Every such site was fixed by hand and **none is under a
    gate.** *A sensor's alphabet is part of the sensor, alongside its label.*
15. **T16's sensor names an observation this repository cannot produce** (T16, found before the first
    edit by reading the triggers instead of assuming them). The row asks for *"flip a threshold in a
    scratch branch → CI goes red"*; `ci.yml` fires only on `push`/`pull_request` to `main`, so a pushed
    scratch branch raises no run. **Resolved (reviewer, 2026-07-30): substitute the three-part local
    equivalent and label it as a substitution** — required-check membership, no failure suppression, and
    non-zero exit on a genuine violation. **No red CI run was observed and the record says so.** A side
    finding improves the mutation: `--max-reach` / `--max-loc` are already CLI flags, so the flip needs
    no source edit at all.
16. **The widened gate fails on a clean tree, and only in CI** (T16) — **the first defect in this feature
    created by a decision taken during execution rather than inherited from the plan**, surfaced by a
    scoped read-only plan critic and then re-measured rather than believed. `check-stale-pointers`
    separates HISTORICAL from BROKEN via `git log --all --name-only`; `actions/checkout@v4` carried no
    `with:` block, so `fetch-depth` defaulted to **1**. At the same commit, depth as the only variable:
    depth 1 → `FAIL — 28 broken, 0 historical`; full history → `PASS — 0 broken, historical exactly at
    its pin of 28`. **The categories invert wholesale.** *A checker reporting a fact about its own
    environment as a fact about the subject* — the fourth instance in this feature. **Resolved:
    `fetch-depth: 0` on the `build` checkout**, fixing the subject rather than lowering the pin, which
    would have made the gate green and meaningless. **Not specific to the mechanism**: routing the check
    through a `describe("the real repository")` block instead would depend on the same history and fail
    identically.
17. **T17's sensor is unreachable on a PR that renames a file the needles corpus covers** (T17, found
    by running the row as written and then attributing the result). The row asks for
    `needles-diff.ts` exit 0; it exits **1**, `N05` rank **5 → 6**, while both floors pass and MRR
    *rises*. `smart-chunker.ts:62-70` writes `// File: <path>` into every chunk before embedding plus
    a symbol-derived `// Section:` label repeated three more times, and rank is a function of the
    cosine score over that text — so renaming a file, or de-facading a symbol inside it, perturbs
    every score in it. N05's own top score is **byte-identical** (0.6712) and a rival overtook it
    across a **0.0134** margin. The 2x2 shows the flip needs the path change **and** the body change
    together, and reverting **either** restores rank 5; both conjuncts are naming, so **no retrieval
    logic moved a rank**. **Resolved (reviewer, 2026-07-30): substitute a controlled comparison,
    commit it, leave `needles-diff.ts` alone** — relaxing it to tolerate a drop of 1 makes it green
    and meaningless. `scripts/needles-rename-control.ts` re-ranks twice changing only the path the
    chunker is told, deriving the map from the baseline report so PR-C needs no edit; exit **0**, all
    14 needles at baseline, and its identity pass must reproduce the shipped report or it aborts.
    *The tenth correction to inherit the defect it was correcting: Phase 0 finding 4 saw the
    catastrophic form of this same mechanism and closed only that half.* **A sensor cannot exempt a
    cause and then police an effect of that cause** — `needles-diff.ts:31-37` exempts score drift
    from a rename by name, then calls rank the invariant.
18. **T18's command does not terminate under an automated runner** (T18, found by running the row as
    written and watching it produce nothing for six minutes). **The first defect here that is neither
    a wrong figure nor an unsatisfiable criterion**, and the first whose symptom is *silence* rather
    than a number — an unexecutable command looks exactly like one still working.
    `apps/web-ui/src/static/app.js:838` calls `prompt("Edit memory content:", "")`; Bun implements
    `prompt`/`confirm`/`alert` as **stdin readers**, and `app-renderers.test.ts`'s fake DOM returns a
    stable child for *any* selector, so `bindEvents` registers the `memory-edit` handler on it and the
    test that fires captured click handlers reaches it. Measured both directions: `< /dev/null` →
    `apps/web-ui` **113 pass / 0 fail in ~2 s**; an open pipe that never delivers → **still running at
    46 s**, last output `Edit memory content: []`. **No per-test timeout applies** — the block is
    inside a handler the test invoked synchronously. CI never saw it because stdin at EOF makes
    `prompt()` return `null`; that same EOF is why `app.js:840-848` was uncovered in *every*
    environment. `apps/web-ui` has **zero** diff on this branch, so this is neither PR-B's defect nor
    a regression. **Resolved (reviewer, 2026-07-30): all three of record it, fix the command, fix the
    test** — `< /dev/null` in the gate block, and `fakeDialogs()` recording stubs in the suite, which
    is *fix the subject, not the gate*. Observed red first: `fakeDialogs(null)` — exactly what
    un-stubbed `prompt()` returns at EOF — gives **55 pass / 1 fail**. Side effect worth keeping:
    `app.js` **93.56% → 95.34%**.
19. **GMS-03 AC-3 fails on the shipped tree, and no correction owned it** (T19, found by a scoped
    plan critic reading `spec.md` against the tree rather than by executing a row — **the first
    defect here surfaced that way**, and the first that is a *live acceptance-criterion failure*
    rather than a wrong figure, an unsatisfiable criterion or a non-terminating command). AC-3
    requires fan-in **and fan-out** both lower. Measured with one method at both commits, against the
    **frozen** `d628464` baseline in `facade-metrics-before.json` rather than a re-read of any live
    tree: fan-in **24 → 23** static and **26 → 25** with dynamic, fan-out **19 → 21**. The cause is
    exact, not statistical — diffing the specifier sets gives **4 removed** (`rlm-admin`,
    `rlm-indexing`, `rlm-search`, `rlm-synapse`) and **6 added** (`graph-stream`, `hybrid-search`,
    `index-admin`, `project-indexer`, `result-fusion`, `session-bias`), net **+2**. A split that
    replaces one delegate with N modules necessarily raises distinct-specifier fan-out, **so
    requiring fan-out to fall is requiring the split not to happen.** Everything AC-3 exists to
    detect moved the right way: `maxForeignReach` **14 → 1** with G-HUB exit **1 → 0**, foreign
    modules **6 → 1**, D1 `delegateScope` **21 → 0**, facade-taking **15 → 0**, scoped LOC
    **1550 → 0**. **Resolved (reviewer, 2026-07-30): add C12 — replace the criterion with the
    sensor, inside T19's own commit**, on the C10/C11 precedent and for the identical reason.
    Accept-and-record was put and rejected (ships PR-B with a red criterion); so was narrowing the
    fan-out metric, which **edits a sensor during the refactor that sensor polices** — already
    rejected at T10. *The eleventh correction to inherit the defect it was correcting*: AC-3 was
    itself the rewrite of the unmeasurable 22/26 figures, and it pinned the counting **method** while
    leaving the **direction** claim unexamined. **A sensor's direction is part of the sensor**,
    alongside its label (ninth–eleventh defects) and its alphabet (fourteenth).

**The discriminating evidence is M3b**, and it is the only reading proving (c) was a live gap rather
than a theoretical one: on a tree carrying a broken `search-facade-*` citation, the pre-T15 `rlm`-only
pattern reports **PASS — 0 broken** while the shipped pattern reports **FAIL — 1 broken**. Two further
mutations, each verified applied and each restore diffed: a citation reverted to its pre-rename name →
HISTORICAL **29**, FAIL; a provenance comment deleted → HISTORICAL **27**, FAIL — the shape the old
`<=` passed. Pristine is **`RESOLVES 32 / HISTORICAL 28 / BROKEN 0`**, exit 0.

**A further T15 finding that invalidated every sensor figure until it was fixed: the gate was blind to
itself.** It enumerates `git ls-files`, so while its own two files were untracked it never scanned
them. Staging took it from **PASS `31/26/0`** to **FAIL `36/46/15`**; all 15 `BROKEN` were **fixture
literals** in its own test file, which must use a real stem to exercise `POINTER` at all. Resolved
narrowly — the **test file** joins `EXCLUDED` as fixtures-not-references, the **script does not**, so
its two genuine citations of the deleted `rlm-search` are counted and the pin is **28** rather than 26.
Two more `BROKEN` then appeared inside that new exclusion's own docblock, which had spelled the fixture
names out in full: the same trap one level up, and it fired. **This is the Phase 0 lesson verbatim** —
*verify any measurement script in the tracked state it ships in, never the state it was written in* —
and it has now cost this feature twice. **Quote no figure from this gate that was not taken after
`git add`.**

**A separate T15 finding, not a plan defect: the line-count constraint was wider than the plan stated.**
The plan named the four renamed suites. Measured — **and name the metric, since all three figures are
quotable and different**: **11 line-anchored citation tokens** on **10 matching lines** across **6
files**. Seven point into the renamed four; **four point into
`contextual-search-rlm-coverage.test.ts`**, whose header T15 also rewrites and which the plan never
flagged. All five targets were edited by in-place single-line substitution only —
**162 / 647 / 520 / 389 / 936** lines before and after. A reflow would have invalidated those citations
silently and **no gate would have seen it.** Same shape as T14's four-line undercount: a constraint
enumerated over the files `git mv` touched missed the file that is edited but not moved.

**T16 is done, and the half that made it a different risk class never happened.** `build` was **already**
in `main`'s `required_status_checks` (measured live; ruleset `19462721`), so **no ruleset was mutated** —
the PUT-not-PATCH and DeployKey-bypass traps stayed out of play, and SEN-02 AC-5's enabling condition is
recorded as measured rather than assumed. Two deliberate departures from the row, both on the record:
its **scope widened** to gate `check-stale-pointers` alongside G-HUB, since the other two sensors turned
out to be enforced already through their own suites; and its **sensor was substituted** (fifteenth
defect). Wiring the second gate is what exposed the sixteenth.

**T17 is done, and its sensor did not hold — the seventeenth plan defect.** The needles gate passes
both floors (hit@1 **0.643**, MRR **0.745**, up from 0.7357) and `needles-diff.ts` exits **1**:
`N05-centrality-rerank-bonus` goes rank **5 → 6**. Attributed rather than accepted or dismissed. The
chunker embeds `// File: <path>` plus a symbol-derived `// Section:` label repeated three more times,
so a rename perturbs every score in the renamed file; N05's own top score is **byte-identical**
(0.6712 → 0.6712) and a rival overtook it across a **0.0134** margin. A 2x2 shows the flip needs the
path change **and** the body change together — and the body delta is three de-facading lines, which
also rename the symbols the label comes from. **Reverting either one restores rank 5.** Substituted
sensor, committed: `scripts/needles-rename-control.ts` re-ranks twice changing only the path the
chunker is told, and exits **0** with all 14 needles at baseline. Its identity pass must reproduce
the shipped report before its control pass is believed, or it aborts. **No change to retrieval logic
moved a rank.**

**T18 is done, and the gate is green on every file this work touches — but the reading that matters
is the one the gate cannot give you.** `bun run test:coverage` exits **0**: `floor 90% line · 315
source files measured · 9 documented exclusions · PASS`, in **2 m 14 s**, with all 169 `N fail` lines
at zero. Both halves of GMS-05 AC-2 hold, and the second holds *structurally* —
`scripts/check-coverage.ts` has **zero** diff on this branch, so no exclusion could have been added
or swapped. The gate prints only an aggregate and a below-floor list, and **absence from that list is
not evidence of a pass**: `below` is built by iterating `merged`, so a file no group reports never
enters `merged` and can never be below the floor. Re-derived through the gate's own `parseLcov` /
`mergeInto` / `linePercent`, all seven are **present**: `contextual-search-rlm` `index-admin`
`session-bias` **100.00%**, `graph-stream` 98.90, `result-fusion` 97.62, `hybrid-search` 95.54,
`project-indexer` **94.57** — and that recomputation reproduces 315 / 0 / 9 exactly. **Scope widened
from the row's 6 to AC-2's 7**: the row says *this PR*, AC-2 says *this work*, and they differ by
`result-fusion.ts`, which T6 delivered through the squashed #46. It measures 97.62%, so **no spec
correction is owed and T19's C1–C11 range is unchanged.** The paper prediction was **falsified on
ordering** — `index-admin` was predicted riskiest from mock topology and is 100.00%; executable-line
count predicted it, mock topology did not. `coverage` **is** in `main`'s required checks (measured
live), so this gate blocks; CI has nonetheless never run on this branch. T18 changes no product code,
so PASS is a **truth check on the tree**, not proof T18 happened — the one discriminating sensor in
the commit is the new web-ui test from defect 18.

**T19 is done, and it shipped C1–C12 rather than the C1–C11 it was scoped to.** `design.md` §10 is
applied to `spec.md` in place and indexed there under *Design and Execute corrections (C1–C12)*;
§10's rows are **kept and marked applied**, not struck, because `spec.md` carries only one-line
summaries and deleting the rationale would leave them pointing at nothing. The range grew four times:
§10 held **C1–C9** from Design, **C10** arrived at T15 (no row owned GMS-04 AC-3), **C11** at T17 (no
row owned GMS-05 AC-4 note 2), and **C12** during T19 itself (no row owned GMS-03 AC-3 — defect 19
above). All four share one shape: T20's verifier reads `spec.md`, and against the criterion as
written it marks a passing tree failed.

**Three T19 results worth carrying.** *(1)* **T19's own sensor was non-discriminating.** *"`design.md`
§10 rows all struck"* reads the wrong artifact — measured before the first edit, **8** old-text
occurrences in `spec.md` survive a commit that strikes all twelve. Replaced by a per-correction
discriminating pair (old absent **and** new present), a positional check and a row count; against the
pre-T19 file it fails **every** correction. Its own row-drop control then caught it printing
`rows: 11 FAIL` while **exiting 0** — `fail=1` inside `$( )` is a subshell assignment and is lost.
*Silence as a failure mode, in the instrument rather than the subject.* *(2)* **A gate-board figure
did not survive re-measurement**: C12's D1 numbers were drafted as `16 → 0` / `11 → 0` from
`HANDOFF.md`, which are **T10 mid-refactor** readings; the frozen `facade-matrix-before.json` at
`d628464` gives **21 / 15 / 1550**. Twelfth figure in this feature that did not reproduce, and the
frozen fixture is why it was caught. *(3)* **No CHANGELOG entry** — the briefing said a specs-only
task had no precedent; `353de59` and `ba8d2bc` are both exactly that and both touch zero
`CHANGELOG.md`. `[Unreleased]` stays at **12** bullets under `### Changed`, **no new heading**, so
the open release-semantics item at the top of this file is untouched.

**T20 is done and Execute is complete. Every GMS-03 / GMS-04 / GMS-05 criterion PASSes** as amended
by C1–C12, checked by a fresh `verification-agent` at `b4f21a9` with author ≠ verifier, which
re-derived from raw data rather than reading these files: all four structural sensors at both the
frozen `d628464` base and HEAD, every gate re-run live (including the needles trio against a real
Ollama), and per-file coverage recomputed from raw lcov. `validation.md` gains **Part II**.

**It was told to argue C12 was a criterion relaxed to fit a result, and it rejected its own
steelman on measured facts** — collapsing the six capability modules to hold fan-out flat would
re-violate GMS-03 AC-1/AC-2 and likely breach G-HUB's 700-LOC ceiling, and G-HUB was **calibrated
before any Phase 1 code existed**, against M14, where fan-in/fan-out stayed flat while reach went
1 → 14. The objection's strongest form is kept in `validation.md` §14 rather than dissolved, because
part of it stands: C10 and C11 rest on impossibilities that hold for *any* tree; C12's holds for the
decomposition this PR chose.

**Its one finding worth carrying past PR-B is about this record's format.** *"C12 was authored and
resolved in the same commit as the work it excuses, with no independent party at the time."* The
reviewer did adjudicate it live — but the convention **`Resolved (reviewer, <date>)` does not let a
later reader tell that apart from an executor asserting approval**. That ambiguity is the real
defect, it is in the format rather than in any single decision, and PR-C and PR-D inherit it.

**`origin/main` merged in as `b7cb5a2`** (real two-parent commit, not rebased — see `HANDOFF.md`'s
*Next action* for the conflict resolutions and the post-merge gate re-run, all green). **Next: push
and open the PR — merging is withheld for the user's call, not the executor's**, matching Plugin
Auto-Install's precedent below. The branch is still local, eighteen commits deep counting the merge
commit (not sixteen — already stale by one pre-merge — and not seventeen either), and **CI has
never run on it**, so the authoritative gate reading still arrives at PR time. Commands are in
`HANDOFF.md` under *Next action*.

**Update: PR #53 opened, then `main` moved again (`47b957b`, #52) mid-first-CI-run — merged a
second time as `c7e1452`.** The superseded first run had five of six required checks green; the
sixth, `coverage`, failed on `packages/core`'s own isolated run (one explicit failing line,
`trace_path > inbound traversal finds callers of gamma`, on code this branch never touches) —
recorded as an observed, unconfirmed data point, not chased against a run that can no longer be
re-verified. Full conflict-resolution and re-run detail is in `HANDOFF.md`'s *Next action*
addendum. Gates all still green after the second merge (`test:scripts` now 961/47, up from
930/46). **Correct commit count via `git rev-list --count origin/main..HEAD` (not `git log`, whose
default simplification hides merge commits from an unqualified listing): 20** — the same eighteen
plus one more merge commit and one more `origin/main` advance. Still local; pushing a second time
next.

**Update: `main` moved a third time — `7425241` (`chore(release): v1.15.0`) — merged as `99bcba5`
with zero textual conflicts, and the zero-conflict merge was itself wrong.** The release commit's
diff (insert `## [1.15.0]`, drop one blank line) applied at anchors that do not know about this
branch's own `### Changed` section, so the auto-merge swept this branch's 12 still-unreleased
bullets under the new `## [1.15.0]` heading, leaving `[Unreleased]` empty — the same silent,
downstream failure shape `CLAUDE.md` documents, caught by re-reading structure rather than by any
gate. Fixed in `916540e` (moved back under a fresh `[Unreleased]`); re-verified structurally and by
the full gate board, all still green (`test:scripts` 961/47, unchanged). **Commit count is now 23**
(`git rev-list --count origin/main..HEAD`). Full detail in `HANDOFF.md`'s *Next action* addendum.
Still local; pushing a third time next.

**T6 alone surfaced three plan defects, two needing a spec-owner decision.** All three are the
`ensureInitializedImpl` class — a consequence `design.md` settled in substance and never wrote into
the constraint it contradicts. Full record in `tasks.md`.

1. **AC-3 vs GMS-03 AC-1 are contradictory.** AC-1 requires no `*Impl` signature to begin with the
   facade; `contextual-search-rlm-coverage.test.ts` holds **18 assertions whose content is that it
   does**. Measured before any test edit: the other six suites unchanged at 119, the coverage suite
   41 → **37 pass / 4 fail**. §4.3.1's "zero test-file edits" reasoned about post-construction state
   assignment — correct, and the ~80 LATE-BIND sites did survive untouched — but never covered
   delegate call-signature forwarding. **Resolved: AC-3 amended, edits bounded and enumerated per
   task** (T6 2, T7 2, T8 2, T9 1, T10 8, T13 3). File stays at 41 tests and 75 expect() calls.
2. **Phase 0's before-baselines were live-tree assertions**, so `test:scripts` could not stay green
   through Phase 1 — the "725 pass / 0 fail" known-good was an invariant Phase 1 destroys.
   **Resolved: frozen to committed fixtures (T6a)**, the fix T4 already applied to needles.
   Scoped to the 9 assertions that actually move, not all 16.
3. **T6's sensor could not fire.** "Reach drops below 14" — reach is set by `rlm-search.ts`, not by
   the 1-member `rlm-fusion.ts`. Measured 14 → 14, foreign modules 6 → 5. Read literally it reports
   T6–T12 as failed. Corrected to the foreign-module count; G-HUB's exit status is T14's gate alone.

Two smaller findings recorded: `graph-stream-project-scope-pg.test.ts` passes `NO_RLM` at 3 call
sites, so §4.6's "rename-only" is wrong for it (T7 owns them); and the frozen-anchor suite pinned
the four anchors **by path**, which asserts the opposite of FROZEN-ANCHOR — moving an anchor is
legal, reflowing is not. It now pins the text.

**A measurement trap repeated at this level.** The Phase 1 baseline was first reported as
`test:scripts` 730 pass / 0 fail. It was **726 pass / 4 fail** — the count line was read and the
pass/fail split was not. The 4 were environmental in a fresh worktree (3× tree-sitter, and
`verifyPackageContents` needing `bun run build`), and `bun run build` clears the last one. Same
family as Phase 0's three: *assert the pass count, never the count of tests.*

### Execute — Phase 0, the plan revisions that preceded it

`tasks.md` was **not approvable as written**. An independent `massa-ai-plan-critic` was run against
it (the file had never been challenged; `design.md` §13's gate predates it) and returned nine
findings, two critical. Three more came from the main agent's own re-measurement. All twelve are
incorporated; the record is `tasks.md` → *Plan Challenge — tasks*. The four that changed the plan:

1. **Nothing from the Design session was ever committed.** Five artifacts claimed
   `scripts/search-hub-metric.ts` was committed; `git log --all` was empty. The script stays —
   it is correct, tested and attacked three ways, and re-deriving a measurement that was already
   wrong four times buys nothing — but it lands as **T0, the first commit of Execute**, not as
   Design output. Only its provenance claim was false.
2. **`ensureInitializedImpl` had no destination.** `rlm-indexing.ts` exports 7 functions;
   `design.md` §4.1 names 6. The seventh reads **8** facade members, so anywhere but the root it
   fails G-HUB permanently and T14's gate could never go green. §4.5(b) had already decided the
   substance; the module table never recorded it. **T10 owns it**; T11's F4 seam re-points from
   `rlm-indexing.ts:586` (a line T10 deletes) to the root.
3. **GMS-04 AC-3 was unsatisfiable.** `rg 'rlm-'` returning only CHANGELOG and `.specs/` cannot
   hold: `.ua/{knowledge-graph,fingerprints,intermediate/scan-result}.json` carry **320**
   occurrences in tracked generated output, plus two unnamed test-file comments. Sensor scoped to
   exclude `.ua/`; the two comments corrected as explicitly-authorised edits; **`.ua/` regeneration
   deferred to after PR-C** — PR-B does not close AC-3 for it and must not claim to.
4. **T16 tested redness, not blocking** — the exact SEN-02 AC-5 defect PR-A closed. A `gh api`
   ruleset assertion was added.

Two `design.md` provenance figures also failed to reproduce and are corrected in place:
**PATCHABLE is 16 sites across 3 files, not 4** (the 16 reproduces exactly; the file count does
not), and **LATE-BIND's "77 across 12" is unverified** — the table sums to 82 and direct
measurement gives a third answer once `LoadStage` assignments are excluded. Neither weakens its
constraint; both replace a hand-tabulated count with the per-suite pass counts, which are exact.

Estimate revised **~22 h → ~25 h**. Baselines re-measured at `ce26f28`: hub-metric reach **14**,
largest file **592**, `lint` **0**, coverage exclusions **9**, `scripts/__tests__` **602 pass /
0 fail**, characterization net **160** across 7 suites, 4 frozen anchors present exactly once,
`:3333` free. All still reproduce at `06bde32` except `scripts/__tests__`, which is **725 pass /
0 fail across 39 files** after Phase 0 added six suites.

Also update the feature block above: **Phase 0 is done, remaining Execute is ~21 h** (Phase 1
~17.5 h, Phase 2 ~3.5 h).

---

## Previous — Plugin Auto-Install

- projectId: `massa-ai`
- workflowSessionId: `spec-plugin-auto-install`
- workflow: spec-driven (Large — Specify + Design + Tasks + Execute)
- feature: `plugin-auto-install` — **COMPLETE 2026-07-29, independently validated PASS,
  PR [#47](https://github.com/luizgmassa/massa-ai/pull/47) OPEN with CI green (14 pass /
  0 fail / install-test skips by condition). DO NOT MERGE per user instruction.**
  Specify + Design + Tasks approved (Plan Challenge: full gate, pre_mortem, 4 findings
  incorporated). Execute T1–T6 all DONE: T1, T2, T3, T4, T5 (docs), T6 (aggregate gate +
  4/4 discrimination mutants killed and reverted). Independent verification-agent PASS
  (`.specs/features/plugin-auto-install/validation.md`): PAI-01..10 + AC-1..16 VERIFIED
  (AC-13 under corrected text), docs fixed in one loop iteration. Branch rebased onto
  `origin/main` @ v1.11.0 (conflicts in FEATURES.json/STATE.md/HANDOFF.md/CHANGELOG.md
  resolved union-style; registry closed out). Post-rebase gate: lint clean, type-check
  6/6, TS 735 pass + 3 pre-existing env failures red at HEAD
  (`verify-tree-sitter-grammars`), shell 21/21, plugins 96/96.
- worktree: `/Users/luizmassa/Projects/massa-ai-wt-plugin-auto-install`; branch
  `feat/plugin-auto-install` cut from `origin/main` @ `ce26f28` (v1.9.1)
- scope: 10 requirements (PAI-01..10) — harness plugin phase detects the four agent hosts
  (config dir OR PATH binary), skips absent hosts with one log line, records bundle version
  per platform in `install-state.json` (v2-compatible extension), no-ops at same version,
  upgrades on version change, never downgrades, isolates per-host failures
- Artifacts: `.specs/features/plugin-auto-install/spec.md`
- User decisions: trigger = install-time auto-detect (not npm postinstall); all four hosts;
  absent host = skip + log; re-run = auto-upgrade on version change
- Note: `core-layering-god-module-split` (PR-B) Execute is in progress on
  `refactor/search-facade-split` in the main checkout — untouched by this feature.

## Previous — Sensor Repair 2026-07

- projectId: `massa-ai`
- workflowSessionId: `spec-sensor-repair-2026-07`
- workflow: spec-driven (Medium — Specify + Tasks + Execute; Design inline)
- feature: `sensor-repair-2026-07` — **COMPLETE AND MERGED 2026-07-29. All 9 planned tasks plus 7
  unplanned ones are DONE; every requirement VERIFIED.** PR #42 merged as `33efc82` (merge commit,
  21 commits preserved). Release chain left to fire on its own.
- base: `origin/main` @ `a6216cd` (v1.9.0) → merged to `main`, releasing **v1.9.1** (patch: all
  `[Unreleased]` entries are `### Fixed`)
- Artifacts: `.specs/features/sensor-repair-2026-07/{spec.md,design.md,tasks.md,validation.md}`
- **Seven unplanned repairs, each a blocker discovered by trying to use the previous fix.** T6a (a
  full index aborting on a same-name/different-kind declaration), T6b (`security.allowedExtensions`
  never propagated from user config), T6c (`capturePolicy` validated then never consulted), T6d (a
  one-element brace glob matching literally, so a single-extension allow-list indexed nothing), the
  e2e availability probe sending no API key under mandatory auth (every E2E suite silently
  skipping), in-process coverage for two config validators only ever exercised in subprocesses, and
  **T10** (a `inet_server_port()` assertion no Docker port map can satisfy, in a suite that had
  never executed in CI). **None of the seven failed loudly** — they aborted, skipped, or reported
  success over an empty result. That is the same defect class SEN-01..04 exist to remove, found
  inside the tooling that was supposed to measure it. Full mechanism in `design.md`, Fourth and
  Fifth forks, and `tasks.md` T10.
- **The eighth instance was in this feature's own deliverable.** T4 shipped `coverage.yml` with a
  header reading `BLOCKING BY DESIGN` while the `coverage` check was absent from the `main` branch
  ruleset's required-status-checks list — so it reported and enforced nothing. Satisfying SEN-02
  AC-2 exactly as written (`no continue-on-error`) produced a gate that could not block a merge.
  The criterion was the defect. Closed as **SEN-02 AC-5**; `coverage` is now in the required list.
  **A gate's enabling condition is part of the gate.**
- scope: 5 requirements — SEN-01 (reset the coverage gate's dedicated DB), SEN-02 (wire
  `test:coverage` into its own blocking CI workflow), SEN-03 (scratch `XDG_CONFIG_HOME` in the
  shared test runner), SEN-04 (content-anchor the needles fixture; make a stale needle a hard
  failure), BEH-01 (honour `includePersistent`). One PR.
- Why it exists and why it is first: it is the four sensors that
  `core-layering-god-module-split` will be judged by, and all four are currently unreliable. That
  refactor is behavior-preserving, so its only proof is the instruments.
- **Headline finding (new, not in the carried-forward list — nobody had looked).** The needles
  retrieval gate is not a sensor that might miss a regression; as built it is a sensor that
  manufactures one. `benchmarks/needles/scorer.ts:94-104` scores a hit only on
  `filePath` equality **and** line-range intersection, and `benchmarks/needles/run.ts:233-236`
  skips a missing target with a `[warn]` and scores it zero. 7 of the 14 needles sit in
  `services/search/`, 4 of them in the `rlm-*` files the refactor renames. Moving them caps
  `hit@1` at 7/14 = 0.50 against a 0.5 floor and `MRR` at 0.50 against a **0.65** floor — a
  guaranteed failure independent of retrieval quality. R-01 in the downstream spec had this
  exactly backwards.
- Spec-owner decisions closed 2026-07-28:
  - SEN-01: truncate tables at gate start, keep schema and migrations. Guarded by the *existing*
    `assertDedicatedDatabase()`, not a second condition — two conditions drift apart, one cannot.
  - SEN-02: its own `coverage.yml` on the `needles-gate.yml` precedent, **blocking** (no
    `continue-on-error`), deliberately outside `ci.yml` so it does not extend the `workflow_run`
    chain `release.yml` keys off.
  - SEN-03: scratch `XDG_CONFIG_HOME` in `scripts/lib/run-tests-isolated.ts`, mirroring what
    `check-coverage.ts:402` already does. **Not** 75 new isolation groups — that would take core
    from 126 forked processes to ~180 on a sequential runner and break T20's pinned invariant.
  - SEN-04: content-anchor the fixture, before any refactor commit. The loud-failure requirement
    matters more than the anchoring: the silent skip is what made the gate untrustworthy.
  - BEH-01: implement the option. Deliberately isolated here so neither PR-B nor PR-C — both
    behavior-preserving — carries a behavior change.
- Plan Challenge: **full gate**, mode `red_team`, `massa-ai-plan-critic`, `serious_findings:
  revise_plan`. Returned `escalate_to_full: true`. **4 findings, all independently verified
  against source by the main agent before incorporation, all folded into acceptance criteria.**
  The critic's own framing of the shared failure shape is worth keeping: *the author verified the
  mechanism that was named, not every mechanism that reaches the same symptom.*
  1. **SEN-03 does not close the leak it claims to.** `packages/shared/src/env.ts:33-34`
     dotenv-loads the nearest `.env` walking up from cwd, independently of `XDG_CONFIG_HOME`, and
     `config/index.ts:575` resolves `envBool("MASSA_AI_LLM_ENABLED", …)` with **env winning over
     `config.json`**. A repo-root `.env` setting it true bypasses the scratch config dir entirely.
     Latent in this checkout (no `.env` present), which is why it would have been found the hard
     way. → new **AC-6**: the runner also neutralizes `MASSA_AI_LLM_*` in the child env.
  2. **The needles fixture has three consumers, not two.**
     `packages/core/src/__tests__/e2e/14.needles.test.ts:119-133` replicates `intersects` and
     `findRank` verbatim against the same JSON. With the 7 `services/search/` targets moved its
     `hit@5` caps at 0.50 against its own **0.64** floor (`:302`). Gated behind
     `describe.skipIf(!READY)` (`:236`), so lower blast radius than graded, not exempt. → new
     **AC-7**.
  3. **SEN-01 would desync Prisma.** `_prisma_migrations` sits in the same `public` schema, so
     "truncate every table in the schema" empties the applied-migration bookkeeping while leaving
     all 24 migrations' DDL applied; the next `migrate deploy` replays non-idempotent
     `ALTER TABLE ADD COLUMN` and fails. → new **AC-2** (exclude it by name, enumerate tables) and
     **AC-2a** (`prisma migrate status` reports up-to-date).
  4. **`packages/core/package.json`'s `"./controllers"` exports subpath** is published npm surface
     that retiring the layer would strand. Zero consumers, so cheap to remove — but not to ignore.
     → new **GMS-01 AC-6** downstream.
  Also raised and accepted: anchor-resolution span drift and anchor uniqueness (→ **AC-8**,
  **AC-9**), and **R-08** — PR-C bundles a 3-4 file controllers move with a 12-file
  `data → services` cleanup under one label.
  Not accepted: nothing. The critic refuted no claim the main agent had verified; the needles
  arithmetic was independently confirmed by both.

## Previous — Audit Remediation 2026-07

- projectId: `massa-ai`
- workflowSessionId: `spec-audit-remediation-2026-07`
- workflow: spec-driven (Large — Specify + Design + Tasks + full Plan Challenge + Execute)
- feature: `audit-remediation-2026-07` — **COMPLETE. PR1 merged as `af16ea2`, released v1.8.0;
  PR2 merged as `ac89d0f`, released v1.9.0. Both independently validated.**
- worktree (PR1): `/Users/luizmassa/Projects/massa-ai-wt-audit-remediation`; branch
  `fix/audit-remediation-security-and-bugs` off `origin/main` @ `3a25cc6` (v1.7.1)
- worktree (PR2): `/Users/luizmassa/Projects/massa-ai-wt-audit-remediation-debt`; branch
  `feat/audit-remediation-debt` off `origin/main` @ `c992ae9` (v1.8.0). **Merged as `ac89d0f`
  (PR #41) and released as v1.9.0; worktree and branch are gone.**
- scope: 17 requirements (SEC-01..06, BUG-01..06, DEBT-01..05) across 22 tasks and 2 PRs
- Artifacts: `.specs/features/audit-remediation-2026-07/{spec,design,tasks}.md`
- Origin: knowledge-graph analysis at `17ee708` (1847 nodes / 4226 edges) plus two verification
  passes. Every finding confirmed against current source, not inferred from the graph.
- Headline finding: the Tools API serves unauthenticated requests by default
  (`auth.ts:51` `if (!apiKey) return;`) and exposes three arbitrary-code-execution routes
  (`routes/executor.ts:38,72,94`); `.use(cors())` at `index.ts:73` reflects any Origin with
  credentials, making it reachable from a developer's browser.
- User decisions locked at Specify/Design:
  - Two PRs: PR1 correctness (SEC + BUG), PR2 debt (DEBT).
  - Bind address stays `0.0.0.0`; exposure is closed by auth, not by address.
  - API key auto-provisioned into `config.json` on first start; hard-refuse only when unwritable.
  - Web UI key injected server-side for loopback callers only.
  - `RLM_LLM_*` → `MASSA_AI_LLM_*` hard rename, no dual-read (requires AD-010 supersession).
  - BUG-02 closed by a read-side project filter; no 25th migration.
  - oxlint, correctness rules, **no formatter** — repo-wide reformat is its own later PR.
  - Layering refactor and `contextual-search-rlm.ts` god-module split deferred to their own specs.
- Conforms to: **AD-007** (executor sandbox default `auto` with best-effort fallback is unchanged;
  SEC-03 only makes the fallback observable) and **AD-008** (json_schema gating untouched;
  DEBT-03 renames env vars only).
- Pending decisions to append during Execute: `AD-010` (one env prefix, supersedes the
  `RLM_LLM_*` compatibility boundary recorded in `repo-rename-massa-ai` and
  `project-identity-rename`) and `AD-011` (the Tools API never serves an anonymous request).
- Plan Challenge: **full gate**, mode `red_team`, `massa-ai-plan-critic`. 2 critical, 1 high,
  1 medium/high — all four verified against source by the main agent, all incorporated before
  Execute (`serious_findings: revise_plan`).
  - C1a `/ui` would 401 after SEC-01: `authMiddleware` (`index.ts:121`) precedes `webUiRoutes`
    (`:140`) and `PUBLIC_PATHS.some(p => path.startsWith(p))` (`auth.ts:46`) lacks `/ui`. The
    whole SEC-05 injection mechanism was dead code. `/ui` + `/ui/` added, decoy-path test required.
  - C1b The loopback check has no supported implementation on `@elysiajs/node` (`index.ts:72`);
    `server.requestIP()` throws there. **TASK-000 spike added** with a
    `MASSA_AI_WEB_UI_TRUST_LOCAL` fallback so SEC-05 is implementable either way.
  - C2 `apps/claude-plugin/hooks/massa-ai-hook.ts:152` reads `process.env.MASSA_AI_API_KEY` only,
    never imports `@massa-ai/shared`, and silent-degrades — the auto-provisioned key never reaches
    it, so lifecycle capture would die invisibly. **TASK-023 added**; closes candidate lesson L-002.
  - H3 Docker may fail the trust check in the opposite direction from the documented risk
    (bridge mapping, not loopback). Explicit Docker assertion added to TASK-007.
  - M4 `CONFIG_DIR` is a module-level const (`config-loader.ts:7`) ⇒ resolve the key in an explicit
    `initAuth()`, never at import, or `bun test` writes to the real `~/.config`. `auth.test.ts:24-34`
    asserts the deleted bypass and is now named for rewrite.
  - Rejected as not-a-gap: CORS-as-theatre — the plan never overclaims CORS as the primary control.
- Task count: 24 across 6 phases, 2 PRs. Packs into 4 batches at the ~7-task budget.
- Execute: **PR1 in progress — 16 of 16 implementation tasks committed; T15 (PR1 close) in
  progress**, executed inline (the user declined sub-agents for PR1; the T15 verification agent is
  the one accepted exception).
  - Order: T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T23 → T8 → T9 → T10 → T11 → T12 → T13 → T14 →
    **T15 (in progress)**.
  - Committed: `30e710a` T1, `a081406` T0, `41b2f90` T2, `976370f` T3, `e17bd5d` T4, `079cc49` T5,
    `5908960` T6, `a646204` T7, `7ee6fa4` T23, `640fd3c` T8, `085e3e8` T9, `92912ce` T10,
    `81c6841` T11, `287df69` T12, `c3510d3` T13, `af008e0` T14.
    (`f26060b` corrected this section's own stale `Execute: not started` line; `18a992e` recorded
    progress through T9; `48d0f39` is the out-of-band test fix described below.)
  - **Phases 0-4 are complete. Only T15 remains.**
  - Three Execute-phase divergences, all written back into `spec.md` / `design.md`:
    1. **T2** — the specified "re-read after conflict" concurrency fix does not converge; proven by
       its own test. Replaced with an `open(…, "wx")` exclusive-create writer election in
       `packages/shared/src/config/api-key.ts`.
    2. **T0** — `ctx.request.ip` is the verified mechanism. `ctx.server` is *absent* under
       `adapter: node()`, so `server.requestIP()` is `undefined` rather than throwing. Loopback has
       three accepted spellings: `::1`, `::ffff:127.0.0.1`, `127.0.0.0/8`.
    3. **T5** — a second admin-preservation test file lived in a different directory. Do a
       repo-wide reference sweep after deleting a module.
  - New decision (T6): Docker gets an explicit `MASSA_AI_WEB_UI_TRUST_LOCAL=true` opt-in set in the
    `Dockerfile`. A bridge-mapped container can never satisfy the loopback check, so this is the
    only way `/ui` works in Docker. Exposure accepted knowingly by the user: with the `0.0.0.0`
    bind, anyone reaching `:3333` can read the key out of `/ui`'s HTML. It is off by default,
    accepts only the exact string `"true"`, warns once at startup, and is documented in
    `docs/web-ui-access.md`. Do not silently widen or narrow it.
  - Further divergences found in Phase 3/4, all written back into `design.md`:
    4. **T7** — `setup-local-first.sh` regenerated `config.json` wholesale, so a re-run destroyed
       the auto-provisioned key. Key resolution + the config writer moved to
       `scripts/lib/installer-api-key.sh` so the contract is executable, not grep-pinned.
    5. **T7** — `env.ts` seeded `MASSA_AI_API_KEY` on a bare truthiness check while `usable()`
       treats whitespace as unset, so a `"   "` stored key made the API provision a fresh key
       while clients sent blanks. Both sides now trim.
    6. **T7** — the compose `mcp` service had no volume and no key, so a default
       `docker compose up` could not authenticate. It now shares `massa-ai-data`, and both
       images set `XDG_CONFIG_HOME=/data` so `config.json` lands in the mounted volume.
    7. **T23** — the Codex/Cursor hook copies are owned by `generate-skill-artifacts.ts`, **not**
       `generate-subagent-artifacts.ts` as CLAUDE.md's hook paragraph implies. The subagent
       generator reported "No drift" against stale copies still shipping the broken hook. Run
       **both** `--check`s after touching any managed harness surface.
    8. **T8** — `tsc` found three `ExecResult` constructions the design did not name (two
       path-boundary refusals and the compile-failure return). They report the mode that would
       have applied rather than omitting the field.
    9. **T10** — the design prescribed a bare `row.project_id !== projectId`. Verified against
       source before implementing: `buildGraphStreamImpl` takes an *unresolved* `projectId?`, while
       `memories.project_id` holds canonical ids, so a strict `!==` against a retired alias would
       have dropped **every** neighbor. Two facts settle it — every read seam the search fuses is
       equally alias-unaware (`postgres-vector-store.ts:545`, `memory-repository-pg.ts:226,289`;
       the resolver appears only at write seams), and with a retired alias the seed set is empty so
       the function returns above the loop. Shipped as
       `projectId && row.project_id !== projectId`, matching those seams' `if (projectId)`
       semantics. Recorded in `design.md`.
    10. **T12** — BUG-04 needed one structure the plan did not anticipate, so it is wider than its
        "1 function" granularity row. `symbolIndex` is `Map<name, fqn>` with one entry per *name*
        and therefore cannot answer "does the namespace-imported module define this?" once another
        file wins the name — exactly the collision the bug is about. `buildSymbolIndex` now also
        returns `fqns: Set<string>`; one extra parameter each on `resolveFile` /
        `resolveEdgeTarget`, no extra pass.
    11. **T13** — tasks named one centrality call site (`rlm-indexing.ts:179`); there are **two**.
        `ensureFreshIndexImpl`'s incremental path (`:385`) carries the identical defect and is the
        path auto-reindex actually takes. Both fixed, both tested.
    12. **T14** — `insert` is synchronous and alias resolution is not, so the fix required a new
        cache-only `ProjectIdentityAliasResolver.resolveCached()`. It closes the window whenever
        the mapping is cached and **cannot** close it for an alias this process has never resolved
        — nothing can consult the database synchronously. That residual is documented at the call
        site and pinned by its own test; closing it would mean making `insert` async and changing
        the fire-and-forget contract the hook paths depend on.
  - **Out-of-band fix approved by the user (`48d0f39`, test-only).**
    `contextual-search-rlm-coverage.test.ts` was failing 11 pass / 3 fail **at HEAD**, verified by
    stashing all PR1 work and reproducing it. `ensureInitializedImpl` falls back to the real
    factory for any dependency the subject did not inject, and the file mocked four sibling
    factories but not `vector-store-factory.js` — so the three `makeRlm({})` warmupCache tests
    built a real `PostgresVectorStore` and ran live embedding-provider auto-selection, measured at
    **13.4 s cold** against `bunfig.toml`'s 5 s budget. The missing mock was added; no test was
    weakened, skipped or removed (14 before, 14 after) and the group now runs in 144 ms. This also
    explains why the recorded baseline and the observed red are both true: the cost is provider
    latency, so the same tests pass on a warm model cache and fail on a cold one.
  - **Owed measurement (T7): satisfied.** PR1's own CI run (`30317033460`, `mcp` job, "Measure
    the Docker bridge remote address" step) observed `ctx.request.ip = ::ffff:172.17.0.1` — a
    non-loopback bridge address, confirming the design premise. Recorded verbatim in
    `design.md` → "TASK-007 — the Docker path, instrumented rather than asserted", and SEC-06
    is now fully evidenced in `validation.md`.
  - Known load flakes seen repeatedly this session, green standalone every time, a different one
    each run: `apps/mcp-client` `embedded-api-client-endpoints.test.ts`, and `packages/core`'s
    `mock-free (113 files)` group and `trace-path.test.ts`. Do not chase them; re-run the package
    alone and say so rather than claiming a clean parallel aggregate.
  - PR1 shipped: merged as `af16ea2`, released as **v1.8.0**.
- **PR2 (DEBT-01..05, T16–T22) — execute complete** on `feat/audit-remediation-debt`.
  - Order: T16 → T17 → T18 → **T20 → T19** → T21 → T22. T20 precedes T19 deliberately: T19's
    gate needs the `--coverage` passthrough T20 added to the shared runner.
  - Committed: `2380615` T16, `2e6c16d` T17, `17f345a` T18, `7199d27` T20, `469fa4f` T19
    (implementation), `32a647a` T21, `dc7fee3` (scope addition), `341a9a5` T19 (verification),
    `6cf97ae` follow-on spec.
  - **AD-010** recorded before the rename it authorises (T16), superseding the `RLM_LLM_*`
    compatibility boundary held by `repo-rename-massa-ai` and `project-identity-rename`.
  - Two Execute-phase supersessions by the spec owner, both written into `tasks.md`/`design.md`:
    1. **T18** — the "zero source changes" non-goal was superseded. Adoption found **337**
       violations; honouring the non-goal literally meant downgrading 15 firing rules to `warn`,
       i.e. a gate that reports and never enforces. All 337 fixed instead; every correctness rule
       ships at `error`. The "no formatter, no reformat" non-goal is unchanged.
    2. **T18** — `turbo.json`'s `lint` task is not implementable per-package: turbo dispatches only
       to workspace packages, and `scripts/`/`benchmarks/` held 21 of the 337. Shipped as a root
       `oxlint` over the whole repo; the dead turbo task was removed.
  - PR2 Execute-phase divergences beyond those:
    13. **T19 — the gate's arithmetic was wrong, not the floor.** Run against the dedicated test
        database it reported **130 of 314** files below 90%, including files `coverage-90pct` had
        measured at 100%. Bun emits two shapes of lcov record for one file: an instrumenting group
        reports the real executable lines, a group that only imports the module transitively emits
        a degenerate record marking *every physical line* uncovered — blanks, braces and JSDoc
        included. On `graph-queries.ts` that was 220 lines covered 220/220 against seven shallow
        groups reporting 377 and covering 14, and the 157-line difference is entirely
        non-executable text. Unioning the denominators scored a fully covered file at 58.4%.
        `check-coverage.ts` now unions the **covered** set and takes the **minimum** executable
        set. 130 → 3, floor untouched at 90%.
    14. **T19 — the gate pins its own config environment.** Suites now run against a scratch
        `XDG_CONFIG_HOME`. Without it the numbers are a property of the machine, not the tree, and
        the developer's real `~/.config/massa-ai/` is writable by the run. This also closes the
        second open finding carried out of PR1.
    15. **T19 — 2 of the 3 remaining below-floor files are excluded as measurement blind spots**
        (`config/api-key.ts` 13.79%, `env.ts` 88.89%), taking the list from 9 to **11**. The third,
        `contextual-search-rlm.ts` at 63.55%, was a **real** gap and was closed to 100% with 27
        facade-forwarding tests rather than excluded — user decision. In-process coverage of
        `env.ts`'s four seeding lines was attempted and abandoned with evidence: `CONFIG_DIR`
        freezes at first import, `packages/shared` runs single-process so no test can guarantee it
        loads `env.ts` first, and `env.ts` dotenv-loads the nearest `.env` before consulting
        config.json.
    16. **Scope addition (user-approved): unit tests were reaching live providers.** The 2 Dart
        timeouts pre-existing at `c992ae9` were **not** a cold native compile. `CodeCompressor`
        reads `llm.enabled` from the developer's `~/.config/massa-ai/config.json`; with a local
        Ollama that is `true`, so the tests made a real network call — **42030 ms cold / 690 ms
        warm** against a 5 s budget. Passes warm, hangs cold, so it read as flakiness, and CI
        never saw it because CI has no config file. Fixed by pinning the seams the subjects
        already expose. The sweep found two siblings: `code-compressor.test.ts`'s first describe
        block, and `rlm-admin.test.ts`, which was missing the `vector-store-factory` mock — the
        identical omission `48d0f39` fixed in PR1 (2 fail / 10.15 s → 7 pass / 176 ms).
    17. **Instrumentation cost is a separate class from the leak, and is budgeted.**
        `etl-cache-invalidation` measured **66.42 s** standalone under `--coverage`; 30_000 passed
        one gate run and failed the next at 30001 ms, so it is 180_000. `etl-idempotent` is 670 ms
        instrumented — its 5 s failures were pure contention — so 30_000 is headroom, not cost.
        `architecture-map`'s three `getProjectMap` cases went 60_000 → 300_000, but for a
        different reason and only as a stopgap: their cost tracks accumulated shared test-database
        state (1213 ms fresh / 16.59 s post-gate / over 120 s mid-gate), and the isolation runner
        is sequential, so this is accumulation rather than contention.
        `bunfig.toml`'s global 5 s default is untouched throughout.
  - Core's isolated-group count is still exactly **126** (T20's pinned invariant): the 27 new
    facade tests extended the already-forked `contextual-search-rlm-coverage.test.ts` rather than
    adding a file, which would have made it 127.
  - `packages/core` merging **122** lcov files for **126** groups is explained and benign: Bun
    writes no lcov when a run's coverage record set is empty, and four groups either skip behind
    their own opt-in flags or import no product source. Not a collision — group indices are unique
    by construction.
- Follow-on registered: **`core-layering-god-module-split`**, Specify-only, `execute: false`. Owns
  the three items this feature deferred — the controllers-layer restructuring, the
  `contextual-search-rlm.ts` split, and the `rlm-*` filename rename. All six of its assumptions are
  open questions.
- ~~Open findings carried forward, not actioned: `memory-controller.ts:274`'s inert
  `includePersistent` option (a behavior decision), and `packages/core`'s test runner having no
  isolation rule for `@massa-ai/shared` — 75 core test files import it and its barrel side-effects
  run against the real `CONFIG_DIR` under a plain `bun run test`.~~ **Both clauses went stale and
  were annotated at `da-inventory-closure` (2026-08-03, DA-14/DA-15/DI-04) rather than deleted:**
  (1) `includePersistent` was made live by this same feature's later BEH-01 ([1.9.1]) — today
  `memory-controller.ts:281` defaults it `true` and `:305` forwards it, and
  `memory-repository-pg.ts:236-238` applies `level <> PERSISTENT` when `false`; the note simply
  predated the fix and was carried forward verbatim. (2) The `@massa-ai/shared` exposure was
  closed by SEN-03 (`39afe59`, v1.10.0) at a different surface than the isolation rule this note
  proposed: `scripts/lib/run-tests-isolated.ts` `buildChildEnv` gives **every** spawned group a
  scratch `XDG_CONFIG_HOME` and pins the LLM env gate (unit suite
  `runner-child-env.test.ts`); the cross-pollination report's DA-15 row inherited this note
  unre-measured — a carried-forward status is a claim that goes stale.
- Skipped sensor: `recall` returned 0 memories for this workspace, so no durable memory informed
  this plan. Context7 MCP not registered — oxlint's rule catalogue is unverified against upstream
  docs and must be confirmed in TASK-018.

## Previous — Persona / Sub-Agent Boundary

- projectId: `massa-ai`
- workflowSessionId: `spec-persona-agent-boundary`
- workflow: spec-driven (Large — Specify + Design + Tasks + full Plan Challenge + Execute)
- feature: `persona-agent-boundary` — **Execute complete, independently validated PASS**
- worktree: `../massa-ai-wt-persona-agent-boundary`; branch `feat/persona-agent-boundary`
  off `origin/main` @ `77dd144` (v1.6.0)
- scope: 10 requirements (PAB-01..10) closing five unstated boundaries between the persona
  layer and the 15 sub-agent charters
- Artifacts: `.specs/features/persona-agent-boundary/{spec,design,tasks,validation}.md`
- Key decisions:
  - D1 Persona propagates to sub-agents as an **optional advisory packet field** carrying
    the **id only, never the prompt**. User chose this over main-agent-only and over a
    read-only-roles allowlist (rejected as a new drift surface needing its own parity test).
  - D2 The Capability Packet's three definitions are **not** collapsed. They are three
    legitimate views (registry / runtime dispatch / role authoring). Instead the new field
    uses byte-identical clause text in all three, gated by a test asserting the clause
    appears in exactly those three files. Per-file paraphrase reads better and is
    untestable — a substring gate cannot tell a paraphrase from a weakening.
  - D3 Charter bodies feed **two** generators, not one. `generate-subagent-artifacts.ts`
    embeds the charter body verbatim (`:287`, `fm + c.body`) into
    `apps/*/agents/massa-ai-*.{md,toml}`, distinct from `generate-skill-artifacts.ts`'s
    raw copy into `apps/*/skills/agents/`. Naming only one was the plan's most serious
    defect; `subagent-parity.test.ts` would have gone red at the pre-PR aggregate, after
    six commits.
  - D4 A bare persona id is **not self-defining**, so "shapes emphasis" is an instruction
    a sub-agent cannot follow without knowing what the persona is. Banning `persona-router`
    does not ban reading `personas/<id>.md` — different paths. Both are banned now, or the
    outer-layer stance-vs-tool-scope conflict reappears inside a write-permitted agent.
  - D5 This takes a real release rather than the `no-changelog` label: harness contract
    text **is** the shipped product for the four plugin packages.
- Plan Challenge: full gate, mode `pre_mortem`, `massa-ai-plan-critic`. 2 critical, 1 high,
  2 medium — all incorporated before Execute began. D3 and D4 are findings 1 and 2.
- Evidence: integrity suite 24/24 (9 new cases observed red before the content commits);
  both generators `--check` no drift; `subagent-parity` + `skill-artifact-parity` 36/36;
  aggregate 567 pass / 4 fail where all 4 are the native tree-sitter suites failing only
  because the worktree was provisioned with `--ignore-scripts` (same suites 14/14 in the
  fully-installed checkout). Independent verifier PASS, 6 discrimination mutations killed.
- Residual risk: 5 test cases are presence-only by accepted design (no bounded absence
  fragment exists to assert against). The `persona` field is defined but no workflow emits
  it yet — runtime adoption is a tracked follow-up.
- Skipped sensor: massa-ai MCP server not registered this session, so `recall`/`remember`
  were unavailable; no durable memory was written for this feature.

## Superseded — Plugin Distribution Overhaul

- projectId: `massa-ai`
- workflowSessionId: `spec-plugin-distribution-overhaul`
- workflow: spec-driven (Large — Specify + Design + Tasks + full Plan Challenge + Execute)
- feature: `plugin-distribution-overhaul` — **PR1 execute complete**, PR2 not started
- worktrees: `massa-ai-wt-pdo-a` (PR1 branch), `massa-ai-wt-pdo-b` (batch B, merged into A)
- branch: `feat/plugin-harness-gate-and-cleanup` (from `origin/main` @ `64b6feb`, v1.4.0)
- scope: 26 requirements (PDO-01..26) across 5 workstreams — OpenCode `.jsonc` resolution,
  skills bundled into all 4 plugins, all 4 plugins published, `qwen-profile.json` removal,
  CHANGELOG single-sourcing
- Spec: `.specs/features/plugin-distribution-overhaul/spec.md`
- Design: `.specs/features/plugin-distribution-overhaul/design.md`
- Tasks: `.specs/features/plugin-distribution-overhaul/tasks.md`
- Key decisions:
  - D1 `.jsonc` is **not** unconditionally correct — OpenCode core merges `opencode.json`
    *over* `opencode.jsonc`, so the installer probes for an existing file and only creates
    `.jsonc` when neither exists. Editing the losing file would be a silent no-op.
  - D2 `npm pack` **silently drops symlinks** (verified empirically: the linked file and its
    containing directory were both absent from the tarball, with no pack-time error). This is
    why skills are bundled as real checked-in files and why `codex`/`cursor`'s
    `hooks/massa-ai-hook` symlinks must become real files before those plugins can publish.
  - D3 The publish jobs have **no `actions/checkout`** — their entire filesystem is the
    `build-output` artifact. A `files` field cannot include what was never uploaded. This was
    already shipping broken: `@massa-ai/opencode-plugin@1.3.1` contained only `dist/` and
    `package.json` despite declaring `agents/*.md`.
  - D4 Two PRs, gate first (A10). The tarball gate landed in PR1 and was observed failing on
    the real defect before the fix existed — a gate never seen red is not evidence.
  - D5 `manifestHash` leaves the shared E2E identity; the commit SHA already encodes revision
    content. Provider/model/dimensions come from the embeddings config resolver, never raw
    `process.env` — a throw there nulls `SHARED_PID` and reintroduces a documented OOM.
  - D6 The Sub-Agent Registry stays **outside** the bootstrap markers. The boundary is
    host-portable policy vs repo-internal contribution machinery.
- Evidence: package-contents gate 5/5 pass (4/5 before the T2 fix, as designed); OpenCode
  helper 21 pass; install-agents shell suites 66/48/27/25 pass; `test-mcp-single-writer` 36
  pass; opencode-plugin 16 pass; `test:plugins` 73 pass; skills-harness-integrity 15 pass;
  `SHARED_PID` non-null with all three embedding env vars unset.
- Residual risk: PR2 (skills bundling + 4-plugin publishing) unstarted. The ~5 MB / 580-file
  bundle cost and the `hooks/massa-ai-hook` symlink replacement both land there.

## Previous — Workflow Harness Overhaul

- projectId: `massa-ai`
- workflowSessionId: `spec-workflow-harness-overhaul`
- workflow: spec-driven (Large — Specify + Design + Tasks + full Plan Challenge + Execute)
- feature: `workflow-harness-overhaul` — Execute complete, awaiting CI + merge approval
- worktree: `/Users/luizmassa/Projects/massa-ai-wt-harness`
- branch: `feat/workflow-harness-overhaul` (from `origin/main` @ `fd35379`, v1.3.1)
- scope: 24 requirements (WHO-R1..R24) — delete the `restart-save`, `restart-load`, and
  `agent-handoff` workflows plus the `handoff-writer` specialist and two references; add
  four cross-cutting references (project-context intake, implementation delivery protocol,
  code annotation, root-cause proof scripts); wire them across all 35 workflows
- Spec: `.specs/features/workflow-harness-overhaul/spec.md`
- Design: `.specs/features/workflow-harness-overhaul/design.md`
- Tasks: `.specs/features/workflow-harness-overhaul/tasks.md`
- Challenge: `.specs/features/workflow-harness-overhaul/fool.md` (full gate, pre-mortem)
- Report: `.specs/features/workflow-harness-overhaul/validation.md`
- Key decisions:
  - D1 Removal is harness-only. The MCP `handoff_*` tools and `workflows/long-session.md`
    survive — they are published product surface and compaction ownership respectively,
    not chat-restart routing. The contract suite asserts their survival as a negative
    control.
  - D2 Worktree isolation carries no size exemption. The exemption, not the ceremony, is
    what strands half-finished work on shared branches.
  - D3 Merge is never automatic. Green CI is the precondition for asking, not the approval
    — decisive in a repo where merging to `main` auto-cuts a release.
  - D4 Each new obligation is one reference plus one load line per workflow, never inlined
    prose, so a future edit stays a one-file change instead of a 35-file sweep.
  - D5 T1 and T2 merged into one removal commit: `skills-harness-integrity` rejects any
    dangling harness path, so splitting them would leave an intermediate commit where
    `agent-handoff.md` pointed at a deleted `restart-save.md`.
- Evidence: `test:scripts` 493 pass / 4 pre-existing env failures (no `packages/core/dist`
  in this worktree); `test:plugins` 66 pass / 0 fail; contract suite 46 pass / 0 fail,
  mutation-verified in both directions.


## Previous — Auto Release Versioning

- projectId: `massa-ai`
- workflowSessionId: `spec-auto-release-versioning`
- workflow: spec-driven (Large — Specify + Design + Tasks + Execute)
- feature: `auto-release-versioning` — COMPLETE + validated PASS
- branch: `feat/auto-release-versioning` (not pushed)
- scope: 13 requirements (ARV-R1..R13) — derive the version bump from the `[Unreleased]`
  section of `CHANGELOG.md` on every green CI run over `main`, tag it, publish a GitHub
  Release, publish to npmjs.org **and** GitHub Packages, remove the GitHub Deployment
  surface and the `next` prerelease channel
- Spec: `.specs/features/auto-release-versioning/spec.md`
- Design: `.specs/features/auto-release-versioning/design.md`
- Tasks: `.specs/features/auto-release-versioning/tasks.md` (T0-T8)
- Challenge: `.specs/features/auto-release-versioning/fool.md` (full gate, pre-mortem)
- Report: `.specs/features/auto-release-versioning/validation.md`
- Key decisions:
  - D1 GitHub Packages publishes as `@luizgmassa/*` — that registry resolves an npm scope
    to a GitHub owner, and `@massa-ai` is not one
  - D2 one `release.yml` calling `publish.yml` via `workflow_call`; **no PAT**, because a
    tag or release created with `GITHUB_TOKEN` raises no event
  - D3 the `next` prerelease channel is retired
  - D4 `Added`/`Changed`/`Removed`/`Deprecated` ⇒ minor; `Fixed`/`Security` ⇒ patch;
    empty `[Unreleased]` ⇒ no release; major never auto-incremented
  - D5 (user decision) CHANGELOG authoring rules are documented in **three** places by
    choice: full copies in both `CLAUDE.md` (§ Releasing and CHANGELOG authoring) and
    `CONTRIBUTING.md`, plus a quick-reference in the `skills/AGENTS.md` **bootstrap
    block**. `README.md` links to `CONTRIBUTING.md`. The bootstrap placement is
    deliberate: `install-skills.sh` copies that block to user-global
    `~/.claude|.codex|.cursor/AGENTS.md` and `~/.config/opencode/AGENTS.md`, so the rules
    load at session start in every project. Accepted trade-offs — this repo's versioning
    policy is visible outside this repo, and the two full copies can drift; keep them in
    sync when either is edited.
- Constraints: `qwen-profile.json` content-hash-pins the 5 `package.json` files the bump
  rewrites, so the release commit must carry a **selective** re-pin (ARV-R13) — never
  `bun run update-qwen-hashes` from the release path
- Validation: PASS — 13/13 requirements evidenced, 5/5 mutants killed, actionlint 0
  across all 5 workflows, `test:scripts` 0, `type-check` 6/6
- **Blocked on one operator action before merge:** `NPM_TOKEN` lived only inside the
  `DEPLOY` environment, and the repo-level secret list is empty. Removing
  `environment: DEPLOY` unbinds it. Re-create it at repository scope:
  `gh secret set NPM_TOKEN --repo luizgmassa/massa-ai`
- Open follow-up (out of scope here): **35 of 71** entries in `qwen-profile.json` are
  already stale on `main` — see `fool.md` F8. Needs its own `bench:needles:gate` evidence.
  Note `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` do not exist in any scope, so the Docker job
  has always failed silently behind `continue-on-error: true`.
- Expected first automated release: **v1.3.0** (minor, from `1.2.1`)

## Previous — Install Harness Migration

- projectId: `massa-ai`
- workflowSessionId: `spec-install-harness-migration`
- workflow: spec-driven (Large/Complex)
- feature: `install-harness-migration` — COMPLETE + validated PASS
- branch: `feat/install-harness-migration`
- scope: 7 requirements (IHM-R1..R7) — migrate `install-skills.ts` / `install-agents.ts` to
  bash following the plugin-installer heredoc pattern, make `install-agents.sh` the sole
  writer of host MCP config, add `scripts/install-harness.sh` and wire it into `install.sh`
  and `scripts/setup-local-first.sh`, replace the TypeScript installer suites with
  CI-gated bash suites, refresh README/FEATURES/CHANGELOG
- Spec: `.specs/features/install-harness-migration/spec.md`
- Design: `.specs/features/install-harness-migration/design.md`
- Tasks: `.specs/features/install-harness-migration/tasks.md` (T1-T20)
- Report: `.specs/features/install-harness-migration/validation.md`
- Key decisions:
  - D1 pure bash + inline `node`/`bun` heredoc (no `jq`, no `.ts` shim)
  - D2 `install-agents.sh` sole MCP writer; plugin installers delegate to it
  - D3 shared `install-harness.sh` orchestrator called from both entry points
- Constraints: `scripts/__tests__/root-install-menu.test.ts` grep-pins the `install.sh`
  menu strings, so the new option is additive (`k)`), never a rewrite of `c)`/`p)`
- Validation: PASS — test:scripts exit 0 (396 TS + 12 bash suites, 296 assertions), type-check 6/6, build 5/5, plugin tests 33/33
- Next step: none — feature complete.

## Previous — Coverage >90% Unit Tests

- projectId: `massa-ai`
- workflowSessionId: `spec-coverage-90pct`
- workflow: spec-driven (Large/Complex)
- feature: `coverage-90pct` — COMPLETE + validated PASS
- scope: 10 requirements (R1-R10), raise unit-test coverage across monorepo to >90% line per-file, 0 fail / 0 skip, fix bugs found
- Validation: PASS — 10/10 ACs verified, independent verifier confirmed all suites 0 fail, type-check 6/6, build 5/5, R10 disjoint, coverage >=90% for all in-scope source (9 documented exclusions)
- Report: `.specs/features/coverage-90pct/validation.md`
- Spec: `.specs/features/coverage-90pct/spec.md`
- Design: `.specs/features/coverage-90pct/design.md` (Batches A-L, disjoint write sets)
- Tasks: `.specs/features/coverage-90pct/tasks.md` (T1-T16)
- Commits (this session): `fb1a02c` (recover cancelled subagent work), `e3c11db` (Completion-1: search+context), `b19518e` (Completion-2: PG stores+symbol+apply)
- Prior commits: `a36a2a1`..`e28cb86` (Batches A-L, T1-T14)
- Key outcomes:
  - Core unit: 124 groups, 0 fail (up from 76 baseline)
  - All packages: 0 fail, 0 skip
  - 9 documented exclusions (tree-sitter native internals, ONNX, barrel re-export, e2e-gated health, env-boilerplate prisma-client)
  - R8 bugs fixed: graph-queries pinned cast, metadata double-encode, pagination determinism, SSE leak, migrateDataDirOnce isolation
- Next step: none — feature complete.

## Previous — Repository Rename Part 2

- projectId: `massa-ai`
- workflowSessionId: `spec-repo-rename-massa-ai-part2`
- workflow: spec-driven (Large/Complex)
- feature: `repo-rename-massa-ai-part2` — COMPLETE + validated PASS
- scope: 13 requirements (R1-R13), residual `th0th`/`massa-th0th` concept + identity references across bun.lock, CHANGELOG, .specs, skills, plugin agents, docs, source
- Validation: PASS — 13/13 ACs verified, discrimination sensor killed 1 mutation (observation-extractor `case "search":` → `th0th_search`), type-check 6/6, build 5/5, drift gate no-drift, 398+ tests green across affected suites
- Report: `.specs/features/repo-rename-massa-ai-part2/validation.md`
- Spec: `.specs/features/repo-rename-massa-ai-part2/spec.md`
- Key decisions (user gray-area resolutions):
  - D1: CHANGELOG historical `massa-th0th` refs rewritten to `massa-ai` (breaks append-only, accepted)
  - D2: observation-extractor `th0th_*` legacy case arms REMOVED (breaks DB backward-compat, accepted; no migration)
  - D3: .specs/features/** `th0th`/`Th0th` concept refs → `massa-ai`
  - D4: installation.md upstream corrected to `luizgmassa/massa-ai` (from stale `S1LV4/th0th`)
  - D5: README/FEATURES Credits `[th0th](S1LV4/th0th)` preserved
- Latent bugs found + fixed during lockfile regen:
  - web-ui type-check: added `@types/bun` devDep (was relying on accidental root hoisting)
  - subagent-parity test: added `toml` root devDep (was relying on transitive `effect` dep hoisting)
  - cursor+codex plugin hook symlinks: fixed stale `massa-th0th-hook.ts` target → `massa-ai-hook.ts`
- Next step: none — feature complete.

## Previous — Workflow Tools Adaptation

- projectId: `massa-ai`
- workflowSessionId: `spec-workflow-tools-adaptation`
- workflow: spec-driven (Large/Complex)
- feature: `workflow-tools-adaptation` — COMPLETE + validated PASS
- scope: 29 requirements (WTA-01..29), 9 user stories (4 P1, 4 P2, 1 P3)
- Validation: PASS — 29/29 ACs verified with grep-sensor evidence, 1/1 discrimination mutation killed, type-check 6/6, build 5/5. All 4 pre-mortem mitigations verified.
- Report: `.specs/features/workflow-tools-adaptation/validation.md`
- Commits: 12 commits (`e318fe9`..`5a1894d`)
- Spec: `.specs/features/workflow-tools-adaptation/spec.md`
- Design: `.specs/features/workflow-tools-adaptation/design.md` (Approach A: single-pass rename + selective adoption)
- Tasks: `.specs/features/workflow-tools-adaptation/tasks.md` (12 tasks across 4 phases)
- Plan Challenge: full The Fool pre-mortem mode; 5 failure narratives; 3 critical/high findings (F1 references not renamed, F2 graph tools lack freshness gate, F3 compact_snapshot session-id confusion) incorporated as plan revisions.
- Key decisions:
  - Canonical tool naming = un-prefixed (matching `tool-definitions.ts` CANONICAL_ORDER); all `th0th_*` references removed across 60 files.
  - `references/mcp-tools.md` expanded from ~20 to 52 tools (full MCP Capability Matrix).
  - Selective tool adoption: each workflow adopts only tools that materially benefit its flow.
  - Graph tools (`trace_path`, `impact_analysis`, `get_architecture`) include explicit freshness gates.
  - `compact_snapshot` uses lifecycle `sessionId`, NOT `workflowSessionId` (two-session-id rule).
  - `get_architecture` (architecture-specific) distinguished from `project_map` (general overview).
- Next step: none — feature complete.

## Previous — Subagent Skills Plugin Parity

- projectId: `massa-ai`
- workflowSessionId: `spec-subagent-skills-plugins-parity`
- workflow: spec-driven (Large/Complex)
- feature: `subagent-skills-plugin-parity` — COMPLETE + validated PASS
- scope: 44 requirements (CLA-01..10, CDX-01..10, CRS-01..08, OPC-01..10, DOC-01..07), 5 user stories, 4 host targets
- Validation: PASS — 42/44 ACs verified with file:line evidence, 3/3 discrimination mutations killed, 60 tests pass (818 assertions), type-check 6/6, build 5/5, drift gate exit 0. 2 non-blocking spec-precision gaps flagged (CRS-02/03 transitive, DOC-06 substring parity).
- Report: `.specs/features/subagent-skills-plugin-parity/validation.md`
- Commits: 14 commits on `spec-sub-agent-system` (bc57daa..851f29b)
- Spec: `.specs/features/subagent-skills-plugin-parity/spec.md` (checksum `e563bb80...`, v4 docs-parity amendment)
- Design: `.specs/features/subagent-skills-plugin-parity/design.md` (checksum `a7fa79c8...`, v1; Approach A chosen: one generator + four installer extensions)
- Tasks: `.specs/features/subagent-skills-plugin-parity/tasks.md` (checksum `59c28dab...`, v1; 12 tasks across 3 phases; pre-approval checks pass)
- Tasks plan: Phase 1 (T1-T4 generator foundation) → Phase 2 (T5-T8 installer extensions) → Phase 3 (T9-T12 docs + final gate). Single source of truth = `scripts/generate-subagent-artifacts.ts`; drift gate via `--check` + parity test.
- Design key decisions:
  - `scripts/generate-subagent-artifacts.ts` = single source of truth; reads `skills/*/SKILL.md`, emits per-host agent files into `apps/*/agents/`; outputs checked in; `--check` mode + parity test = drift gate (F1 mitigation).
  - Codex agents → `~/.codex/agents/*.toml` (OUTSIDE plugin dir; `# massa-ai-owned` top comment). OpenCode agents → `~/.config/opencode/agents/*.md` (OUTSIDE npm package; `metadata: { massa-ai-owned: true }`; shipped via `files` array update — R2).
  - Claude/Cursor agents → plugin's `agents/` dir (Claude uninstall excludes `massa-ai-navigator.md` by name — R1).
  - OpenCode: new `massa-ai-config agents install/uninstall` subcommand (extends `config-cli.ts`).
  - 10 risks R1-R10 documented with mitigations; no project-level AD (additive, no DB/binary).
- Docs parity (user follow-up): `README.md` = summary layer (12 names, pinned model+effort per host in compact form, link to FEATURES.md); `FEATURES.md` = depth layer (new "Subagent Skills (12 Specialists)" section: per-host names, file locations/formats, four model-pinning tables verbatim, effort pins, permission mappings, ownership markers, generator+parity contract). DOC-02/03/06/07 assert the split; DOC-06 asserts FEATURES.md ↔ spec table byte-parity (test).
- Model pinning (user follow-up): `model` PINNED per agent per host, NOT advisory. Claude aliases (haiku/sonnet/opus); Codex IDs (gpt-5.4-mini / gpt-5.6-terra / gpt-5.6-sol); Cursor + OpenCode use charter `metadata.model_hint` verbatim (DeepSeek V4 Pro / GLM-5.2 / MiniMax M3). Three model-pinning tables added to spec; AC CLA-10/CDX-10/CRS-08/OPC-10 assert exact pinning.
- Effort pinning (user follow-up): Claude `effort: high`; Codex `model_reasoning_effort = "high"`; Cursor `reasoningEffort: max` (field-name unverified — subagent docs 404; pass-through, harmless if ignored); OpenCode `reasoningEffort: max` (pass-through, provider-dependent honoring for DeepSeek/GLM/MiniMax). ACs CLA-10/CDX-10/CRS-08/OPC-10 updated.
- Plan Challenge: lite-escalation inline (subagent spawning unavailable — `cavecrew-reviewer` model not found). 8 findings F1-F8; F1 (drift), F2 (name collision), F4 (OpenCode bash ambiguity), F5 (out-of-plugin-dir ownership marker), F6 (Claude tools format) incorporated as assumptions + ACs. Escalate-to-full: false.
- Decisions (feature-local, no project-level AD):
  - Ship as host-native subagent definitions (Claude `agents/*.md`, Cursor `agents/*.md`, OpenCode `agents/<name>.md` mode: subagent, Codex `agents/<name>.toml`).
  - Full native frontmatter adaptation (tools/sandbox_mode/permission per host; model hint as advisory body comment, omitted from frontmatter).
  - No new lifecycle hooks (invocation-based specialists; existing 6 lifecycle hooks unchanged; shared binary untouched).
  - Codex/OpenCode agents live OUTSIDE the plugin dir (shared agent dirs) → in-file ownership marker (`# massa-ai-owned` comment / `metadata: { massa-ai-owned: true }`).
  - Single source of truth: `scripts/generate-subagent-artifacts.ts` emits shipped files from `skills/*/SKILL.md`; parity test asserts byte-identity (drift fails CI).
  - Existing `massa-ai-navigator.md` (Claude/Cursor) preserved; 12 specialists additive.
- Next step: Design phase (`references/spec-driven/design.md`) — architecture, components, per-host frontmatter mapping table, generator design, verification design.

## Previous — Codex + Cursor Plugin Parity

- projectId: `massa-ai`
- workflowSessionId: `spec-codex-cursor-plugin-parity`
- workflow: spec-driven (Large/Complex)
- feature: `codex-cursor-plugin-parity` — COMPLETE + validated PASS
- branch: `spec-codex-cursor-plugin-parity` (off `main`)
- scope: 28 requirements (CPX-01..08, CRS-01..08, INS-01..12), 20 tasks across 4 phases
- Phase 1 (T1-T6): COMPLETE — binary `pre-tool-use` + Codex plugin (manifest, skills, hooks.json, .mcp.json, install.sh, README, tests)
- Phase 2 (T7-T11): COMPLETE — Cursor plugin (manifest, skills, hooks.json with 7 events incl. sessionStart + preCompact, mcp.json, agents, install.sh, README, tests)
- Phase 3 (T12-T15): COMPLETE — root install.sh plugin menu (Codex/Cursor), install-agents.ts deconfliction hints, README, stale Cursor note removed
- Phase 4 (T16-T20): COMPLETE — Claude Code hooks auto-write into settings.json, root menu extended to 4 tools (Claude/Codex/Cursor/OpenCode), install-agents.ts Claude/OpenCode hints, README 4-plugin parity
- Validation: PASS — 28/28 ACs verified, 5/5 discrimination mutants killed, 112 tests pass, type-check 6/6, build 5/5
- Report: `.specs/features/codex-cursor-plugin-parity/validation.md`
- Commits: 17 commits on `spec-codex-cursor-plugin-parity` (1a59854..fcda808)

## Previous — Wave 7

- projectId: `massa-ai`
- workflowSessionId: `spec-wave-7-hygiene-ui-process`
- workflow: spec-driven (Large/Complex)
- feature: `wave-7-hygiene-ui-process` (Wave 7) — COMPLETE + validated PASS
- branch: `wave-7` (off `main`)
- scope: 13 requirements (W7-01..W7-13), 15 tasks across 3 phases
- Phase 1 (T1-T7): COMPLETE — hygiene (AGENTS.md, version pins, LLM defaults, CHANGELOG, D5 ADR, doc cleanup, removed-features)
- Phase 2 (T8-T12): COMPLETE — features (web UI markdown+write+SSE, json_schema, sandbox)
- Phase 3 (T13-T15): COMPLETE — cleanup (spec archive, wave-2 reconcile, hook breadcrumb)
- Validation: PASS — 13/13 ACs verified, 3/3 mutations killed, gates green
- Report: `.specs/features/wave-7-hygiene-ui-process/validation.md`

## Decisions

| ID | Status | Decision | Evidence |
| --- | --- | --- | --- |
| AD-007 | active (T12) | Executor sandbox default is `auto` (not `on`); uses platform tool if available, falls back to best-effort. F1 mitigation. | `sandbox.ts` getSandboxMode, `MASSA_AI_EXECUTOR_SANDBOX=auto\|on\|none` |
| AD-008 | active (T11) | json_schema constrained decoding for Ollama structured calls; version-gated (>= 0.5.0), graceful fallback to json_object. F3 mitigation. | `llm-client.ts` _checkJsonSchemaSupport, llmObject |
| AD-009 | active (T5) | D5 Cypher subset deferral formally removed — structural graph traversal covers use cases. | `docs/adr/0001-remove-d5-cypher-subset.md` |
| AD-010 | active (audit-remediation-2026-07 T16/T17) | **This project has exactly one environment-variable prefix: `MASSA_AI_`.** The ten `RLM_LLM_*` vars are hard-renamed to `MASSA_AI_LLM_*` with **no dual-read** — the old names are removed, not deprecated, and setting one has no effect. This **supersedes** the compatibility boundary recorded in `repo-rename-massa-ai` (spec R3.4 / design "explicitly excluded") and `project-identity-rename` ("retained subsystem names … are intentional compatibility boundaries"), both of which are annotated as superseded rather than rewritten. Rationale: `RLM_` names no subsystem that still exists under that name — it is a residual of the pre-rename project identity, so the "subsystem namespace" justification no longer describes anything. A second live prefix also costs a permanent tax on `turbo.json`'s `passThroughEnv`, which today lists only 4 of the 10 vars, so six of them already arrive `undefined` under `bun run test` — a silent bug that a rename without the passThroughEnv completion would have preserved under a new name. Rejected alternatives: (a) **dual-read with deprecation warning** — rejected because it doubles the resolution surface permanently and the repo has no released consumer contract on these vars (they are developer/runtime knobs documented in `.env.example`, not a published API); (b) **leave `RLM_LLM_*` alone** — rejected because it is the last identity residual and keeps two prefixes in every doc and config example; (c) **config.json key migration** — not needed: the config-file keys are already prefix-free, so no config migration ships. Breaking change: yes, announced in `CHANGELOG.md` under `### Changed` at T22. | `packages/shared/src/config/index.ts`, `packages/shared/src/env.ts`, `turbo.json` `passThroughEnv` (all 10 listed), `.env.example`, `packages/core/src/services/memory/llm-client.ts` |
| AD-011 | active (audit-remediation-2026-07 T3/T15) | **The Tools API never serves an anonymous request.** A key is always present — by `MASSA_AI_API_KEY`, by `security.apiKey` in `config.json`, or by first-start provisioning. The no-key pass-through is deleted, not made configurable: there is no supported way to run the API open. Startup fails non-zero only when no key exists *and* the config file is unwritable. The bind address stays `0.0.0.0` (AS-05) precisely because exposure is now closed by authentication rather than by address, so Docker port mapping keeps working unmodified. Public paths are a fixed, tested list (`/health`, `/swagger`, `/swagger/json`, `/ui`, `/ui/`) matched by prefix, with a decoy-path test proving `/uixyz` is not exempt. | `apps/tools-api/src/middleware/auth.ts` (`initAuth`, `isPublicPath`), `src/startup-config.ts` (`initAuthOrExit`), `packages/shared/src/config/api-key.ts` (`resolveApiKey`), commits `41b2f90` / `976370f` |
| AD-012 | proposed (core-layering-god-module-split AS-01, closed 2026-07-28; **not yet implemented**) | **The `controllers/` layer is retired. `packages/core` is `tools → services (some of which orchestrate) → data`, enforced by a CI import-direction check.** The four-layer contract stated in `src/index.ts` and `CLAUDE.md` was never adopted: 31 tools, 6 controllers, and `tools → services` 34× against `tools → controllers` 6×. Only **3 of the 6** controllers hold what the contract claims for them — `MemoryController.store` publishes a domain event and fires two background side-effects (`memory-controller.ts:164-171,184-186`), `SearchController.searchProject` emits `search:completed`/`search:reranked` (`search-controller.ts:239-250,282-295`), `ContextController` composes two controllers plus a graph service, compressor and metrics singleton (`context-controller.ts:120-171`). The other three do not: `GraphController` is a validate→call-one-service→reshape wrapper that `tools/trace_path.ts:161` duplicates, `ExecutorController.execute`/`executeFile` are 1:1 wraps whose only addition is error mapping, and `index.ts` is a barrel. Those 3 move into `services/` as named orchestrators, following the precedent **already in the tree**: `WebController` lives at `services/web/web-controller.ts` and both transports instantiate it. `ExecutorController` keeps its exported symbol name because `apps/tools-api/src/routes/executor.ts:13` and `apps/mcp-client/src/embedded-api-client.ts:43` import it directly from the root barrel — it is public surface despite its directory. Rejected alternatives: (a) **adopt controllers for all 31 tools** — rejected on evidence, it is ~7-9 genuinely new orchestration controllers plus ~11 pure pass-throughs written as ceremony, for 34 import rewrites; (b) **keep controllers optional and only fix import direction** — rejected because it leaves "controller" naming nothing precise while `WebController` already contradicts it. Note the layer contract's dominant violation is elsewhere entirely: **24 of the 36 backward imports are `data → services`**, mostly `getPrismaClient`, and are unrelated to this decision. Breaking change: no — the published MCP/REST surface binds to Tool classes, and the one directly-imported controller keeps its name. | `packages/core/src/{index.ts,controllers/,services/}`, `packages/core/package.json` `"./controllers"` exports subpath, `CLAUDE.md` Architecture section |
| AD-013 | active (sensor-repair-2026-07 SEN-04, implemented 2026-07-28, commits `27dda6c` / `5e018e5` / `d5b5813`) | **A retrieval-benchmark needle is identified by content, not by file position, and an unresolvable needle is a hard failure.** The needles gate scores a hit only on `filePath` equality **and** line-range intersection within `lineTolerance` (5) — `benchmarks/needles/scorer.ts:94-104`, replicated verbatim in `benchmarks/needles/run.ts:85-96` and again in `packages/core/src/__tests__/e2e/14.needles.test.ts:119-133`. `run.ts:233-236` skips a missing target with a `[warn]` and scores the needle **zero**, and `scorer.ts:111,124,135` average that zero over the full needle count rather than dropping it. The consequence is not a weak sensor but an inverted one: 7 of 14 needles sit in `services/search/`, so any refactor that moves them caps `MRR` at 0.50 against a **0.65** floor — a guaranteed failure independent of retrieval quality, indistinguishable from a real regression. Positional pinning is the root defect, not the filename: with `lineTolerance` at 5, a span that moves more than 5 lines inside a file of the same name breaks its needle too. Rejected alternatives: (a) **baseline then mechanically re-point the fixture after the refactor** — rejected because the sensor would be edited by the change it validates, and a re-point landing on subtly different code hides exactly the regression the gate exists to catch; (b) **drop the needles clause and rely on characterization tests** — rejected because it leaves retrieval quality with no sensor at all across the riskiest change in the backlog. The loud-failure half matters more than the anchoring half: a silent skip is what made the gate untrustworthy. **Implemented.** Needles carry a unique code `anchor` plus signed `startOffset`/`endOffset`; `{anchor, endAnchor}` was measured unbuildable (only 3 of 11 needles have both boundaries on a repo-wide-unique code line; N03 ends on a blank line and N13 starts on one) — see `design.md`, Second fork. Resolution runs before any embedding, so a stale fixture costs seconds, not a wrong number. Three consumers became one: `resolve.ts` owns `intersects`/`findRank`. The predicted failure was confirmed by measurement, not reasoning — the gate had been red since `56c84d1` because N07/N08/N09 pointed past EOF of an 81-line file, and repairing the *instrument* alone took MRR from 0.569 to 0.736 with no retrieval code, chunker parameter or floor touched. `scorer.ts` keeps a positional path for external corpora (`sicad`) whose sources are not in this repo; the pass/fail gate `run.ts` does not. | `benchmarks/needles/{resolve.ts,run.ts,scorer.ts,fixtures/massa-ai.json}`, `packages/core/src/__tests__/e2e/{14.needles.test.ts,_helpers.ts}`, `scripts/__tests__/needle-resolution.test.ts` |
| AD-014 | active (cross-pollination-ports T4, implemented 2026-08-03, commit `a6fdafb`; renumbered from the design's pre-assigned "AD-013" at close-out — that slot was already taken, re-check the highest AD at append time) | **Every durable Observation write passes the kernel credential-scrub boundary.** `ObservationStore.insert` takes `InsertableObservation`, whose `payloadJson` is the branded `SanitizedPayloadJson` — only constructible via `scrubCredentials()` (`packages/core/src/kernel/sanitize/credential-scrub.ts`: 7 narrow credential-shape rules, non-growth invariant, no escape-hatch constructor). Both production writers (`hook-service.ts:246`, `tools/compact_snapshot.ts`) construct through it; read shapes stay plain `string`, and pre-existing rows remain unsanitized (accepted limitation, spec'd). Because `packages/core/src/__tests__` is excluded from every type-check, the compile-time claim is enforced by the compile-fixture gate `scripts/__tests__/xp02-branded-type.test.ts`, not by an in-tree `@ts-expect-error`. | `.specs/features/cross-pollination-ports/{spec,design,validation}.md`; discrimination sensor 6/6 mutations killed |
| AD-015 | active (model-profile-switching T17, implemented 2026-08-04, branch `spec/model-profile-switching`) | **Installed model-profile state is `platforms[host].modelProfile = {profile, switchedAt}` in `install-state.json`, and the switch engine (`packages/shared/src/profile-switch/`) is its only writer.** Installers read it to re-apply the recorded profile on install/upgrade and write the installer-owned `installRoute: "file"\|"marketplace"` field, but never invent or edit `modelProfile`. Bundle version is reported from the existing `platforms[host].plugin.version` — never duplicated into the profile record (two sources for one fact is the defect the registry removed). Runtime profile selection is an explicit argument, never an env read (AD-010 passThroughEnv tax; a second resolution surface is the registry-named defect). | `.specs/features/model-profile-switching/{spec,design}.md`; round-trip guards `scripts/__tests__/install-state-plugin-version.test.ts` |

---

## Wave 7 — Active

- projectId: `massa-ai`
- workflowSessionId: `spec-wave-7-hygiene-ui-process`
- workflow: spec-driven (Large/Complex)
- feature: `wave-7-hygiene-ui-process` (Wave 7) — IN PROGRESS
- branch: `wave-7` (off `main`)
- baseline: `56c84d1`
- scope: 13 requirements (W7-01..W7-13), 15 atomic tasks across 3 phases
- Phase 1 COMPLETE: T1-T7 committed (32b5ce4..815488f)
- Phase 2 COMPLETE: T8-T12 committed (f0b92cd..2a2aee9)
- Phase 3 IN PROGRESS: T13 done, T14-T15 remaining
- Pre-mortem: 5 findings (F1 sandbox auto, F2 realpathSync, F3 json_schema log, F4 XSS, F5 bot PR skip)
- Spec: `.specs/features/wave-7-hygiene-ui-process/spec.md`
- Design: `.specs/features/wave-7-hygiene-ui-process/design.md`
- Tasks: `.specs/features/wave-7-hygiene-ui-process/tasks.md`

---

## Wave 5 — Active

- projectId: `massa-ai`
- workflowSessionId: `spec-wave-5`
- workflow: spec-driven (Large/Complex)
- feature: `wave-5-cross-pollination` (Wave 5, P1) — COMPLETE + validated PASS
- branch: `wave-5` (off `main` post-`92b7fb4`)
- baseline: `92b7fb4`
- scope: 26 requirements (FR-01..FR-26), 29 acceptance criteria, 27 atomic tasks across 9 phases
- gray areas: all 8 resolved (see `.specs/features/wave-5-cross-pollination/context.md`)
- plan-critic revisions: FR-20..FR-26 / AD-W5-013..AD-W5-020 incorporated
- B1 (graph features) COMPLETE: T01-T08, 8 commits (9a73b4b..14744ce)
- B2 (grouped format + indexing) COMPLETE: T09-T16, 8 commits (a12f9f6..6740a3e) + 1 test-isolation fixup (a0c67d6)
- B3 (search/scheduler/synapse) COMPLETE: T17-T24, 8 commits (2c21db6..56e5c10)
- B4 (defense + validation) COMPLETE: T25-T27, 3 commits (1509732..38b04bb) + independent verifier PASS (7/7 ACs, 3/3 mutations killed)

---

## Wave 4 — Complete

- projectId: `massa-ai`
- workflowSessionId: `spec-wave-4-correctness-hygiene`
- workflow: spec-driven
- feature: `wave-4-correctness-hygiene` (Wave 4, P1) — COMPLETE + validated PASS
- status: complete (T1–T20 all done; independent verifier PASS: 13/13 ACs, 4/4 discrimination mutations killed, gates green, no gaps)
- branch: `main`
- baseline: `f3d8020`
- residual risk: pre-existing `qwen-e2e-fixture` failure (documented, owned by `sqlite-removal-followup` SQLRFU-002 — not Wave 4 task-owned)

---

## Wave 3 — Active

- projectId: `massa-ai`
- workflowSessionId: `spec-wave3-followup` (native-runtime-rebaseline follow-up); prior `spec-m21` (M21) COMPLETE.
- workflow: spec-driven
- feature: `native-runtime-rebaseline` (Wave 3 follow-up, P1) — T1–T6 COMPLETE + validated PASS. T1 merge `b6aa4a4`; T2 test rewrite `428d462`; spec artifacts `846ff29`; T3 classification `e866ea5` + `17eedfd`; T4 npm reconcile (no code change — Codespace npm 11.12.1 → 11.14.1 install); T5 cross-platform verify (Codespace Bun 1.3.14 install, ABI 137, both platforms `verify:tree-sitter-native` exit 0, 152/152 native-structural); T6 AD amendment + validation.md (this commit). Status: `complete`.
- prior: `linux-native-structural-runtime` (M21, P0) — COMPLETE + validated PASS.
- status: M19, M20+M54, M50, M16+M17, M45+M47, M21 complete. **native-runtime-rebaseline COMPLETE** (T1–T6: `b6aa4a4`/`428d462`/`846ff29`/`e866ea5`/`17eedfd` + T4/T5/T6). Phase A (T1–T2) PASS on macOS arm64; Phase B (T3) six-suite classification — 2 FIX (`e866ea5` auto-improve LLM-surface isolation defect, `17eedfd` qwen fixture re-lock after identity-guard drift) + 4 DOCUMENTED-ACCEPT (etl-cache-invalidation, etl-pipeline-queue, scheduler-store-pg, trace-path — shared-DB fixture gaps: `graph_generation_workspace_missing:*`, `scheduled-*` pollution) — **RESOLVED in Wave 6**: `clearProject` now deletes `graph_generations` rows (prevents orphaned generations), `architecture-map.test.ts` calls `markIndexing` before `EtlPipeline.run` (prevents workspace-missing race), qwen fixture hashes re-locked after N31 decomposition; Phase C (T4–T5) npm reconciled 11.14.1 both platforms, Bun 1.3.14 installed on Codespace (ABI 137), `verify:tree-sitter-native` PASS on macOS arm64 + Ubuntu Codespace (33+33 parses, 27+27 modules, 10 sensors, RSS -188 KB Codespace / +589 KB macOS < 16 MiB, packed package PASS, 152/152 native-structural both platforms). Phase D (T6) AD-004/005/006 amendment + validation.md.
- branch/worktree: `wave-3` / `massa-ai-wt-wave-3`
- sequence: M19 → M20+M54 → M50 → M16+M17 → M45+M47 ✅ → M21 ✅ → native-runtime-rebaseline ✅
- invariant: `sqlite-removal` complete; `sqlite-removal-followup` in_progress (M29); `multi-language-tree-sitter-breadth` reconciled to `complete` from its recorded PASS evidence.
- cleanup: temp branch `wave-3-codespace-sync` on origin (used to sync Codespace for T5) — delete after feature closure.

### Wave 3 Next Step

native-runtime-rebaseline complete. Wave 3 follow-up exhausted. Clean up: delete temp remote branch `wave-3-codespace-sync`. No push of `wave-3` (contract). Independent verifier (author ≠ verifier) to run full gate matrix + discrimination sensors and confirm PASS per spec-driven validate.md.

---

## Current

- projectId: `massa-ai`
- workflowSessionId: `spec-multi-language`
- workflow: spec-driven
- persona: AI Engineer
- feature: `multi-language-tree-sitter-breadth`
- status: EXECUTE + VALIDATE complete (feature verdict PASS). Native runtime re-baselined to Bun `1.3.11` + Node `25.9.0` (npm `11.14.1`); TASK-001 through TASK-026 PASS. MLTS-022 performance contract reframed on 2026-07-17 (spec-owner approved): the 16 MiB explicit-disposal/forced-GC stress is the hard native-safety gate (PASS, 82 KB median delta); candidate throughput/RSS (≈1.20 MB/s, ≈290 MB) recorded as an absolute self-baseline. Output-preserving optimizations committed: `490f302`, `13718af`, `4a26353`. Final independent verifier PASS.
- branch: `main`
- baseline: `5d43a96f4c0f1dfbd04ee7ae95f589f9b023bf03`
- push: not attempted

## Objective

Replace regex structural extraction with pinned native Tree-sitter grammars and versioned query/resolver contracts across all 33 canonical extensions while keeping semantic chunking, embeddings, ranking, and search behavior unchanged.

## Active Constraints

- TASK-001 is a no-fallback feasibility gate on exact Bun/macOS arm64. Every required grammar must install, load, and parse before production implementation.
- Native runtime downloads, WASM fallback, raw CST persistence, compiler/LSP resolution, and semantic-search changes are out of scope.
- Structural generations cover files, definitions, references, imports, centrality, diagnostics, and full counts; DB lease/snapshot/CAS activation must finish before terminal job state.
- Required-file hard failure blocks generation activation; incremental hard failure retains last-known-good active structure with stale diagnostics.
- TS/JS native-safety is bounded by the 16 MiB explicit-disposal/forced-GC stress gate (MLTS-022 reframed 2026-07-17, spec-owner approved); candidate throughput/RSS are an absolute self-baseline, not a regex-relative threshold, because the candidate is a full 33-language AST indexer vs the `5d43a96` single-regex baseline.
- One atomic commit per task. Sequential phase workers are authorized; independent verification is mandatory.

## Decisions

| ID | Status | Decision | Evidence |
| --- | --- | --- | --- |
| AD-001 | active after TASK-001/TASK-002 verification | Structural parsing uses pinned native Tree-sitter grammar artifacts plus repository-owned query/resolver packs; no runtime-download or WASM fallback. | TASK-001 matrix; TASK-002 frozen dependency/verifier gates |
| AD-002 | proposed; activate after migration/CAS tests | Graph schema upgrades build generation-scoped structure beside active data and activate through DB lease, immutable snapshot, completeness, and CAS. | `design.md`, full pre-mortem |
| AD-003 | active codec; transport parity pending T12/T20 | One versioned FQN codec owns modern IDs, legacy aliases, collision failure, and ambiguity payloads; later persistence/HTTP/MCP tasks must consume it without reimplementation. | TASK-006 canonical hash, collision, ambiguity, and independent review gates |
| AD-004 | active after TASK-004 PASS; re-baselined 2026-07-16 | Exact Bun `1.3.11` loads upstream native packages through one serialized compatibility loader that snapshots, removes, and restores the full `process.versions.bun` descriptor before parsing. Exact Node `25.9.0` is the build-only `node-gyp` helper (npm `11.14.1`). | TASK-001 native evidence; TASK-004 fault, readiness, startup, and direct-guard gates |
| AD-005 | active after TASK-002 PASS; re-baselined 2026-07-16 | The runtime identity combines upstream `tree-sitter@0.25.0` SRI with patch SHA-256 `e79aec7b96eb8114e85ebcb90f0a8b12076bcd8aa08c09bb88929621e1c1446d`, adding idempotent cursor/tree deletion, stale-object guards, immutable JS owner identity, same-tree cursor reset enforcement, generated-addon packaging, a C++20 `binding.gyp` (Node 25 headers), and an install-guard that no-ops when the prebuilt addon is present. Core bundles the patched dependency for packed consumers. | TASK-002 no-delete control, hardened prototype, independent crash reviews, fresh normal packed consumer, final independent PASS; re-baseline cold install + source/dist native verifier under Bun 1.3.11/Node 25.9.0 |
| AD-006 | active after TASK-005 PASS | Production uses one process-global FIFO parser pool: default capacity 4/hard max 32 and default acquisition timeout 5,000 ms/hard max 60,000 ms. Runtime owns cursor-before-tree cleanup and never returns empty success without a query executor. | TASK-005 overlap, timeout, retarget recovery, hard-outcome, native lifetime, RSS, and independent review gates |
| AD-004 (amendment 2026-07-21, native-runtime-rebaseline) | active; Bun pin moved 1.3.11 → 1.3.14 via merge of main (`e12c4e4`) into `wave-3` | Wave-3 absorbed main's Bun `1.3.14` bump + lock-contract `record.includes` fix via merge commit `b6aa4a4`. Node `25.9.0` unchanged; npm `11.14.1` unchanged (Codespace npm 11.12.1 → 11.14.1 install reconciled). ABI `137` unchanged (confirmed on both platforms). Native load still uses the masked-Bun Node-path (`withMaskedBunVersion` → `node-gyp-build` → `build/Release`). | `verify:tree-sitter-native` PASS on macOS arm64 + Ubuntu Codespace under Bun 1.3.14; `verify-tree-sitter-grammars.test.ts` 9/9; native-structural 152/152 both platforms |
| AD-005 (amendment 2026-07-21, native-runtime-rebaseline) | active; patch SHA `e79aec7b...` unchanged; only the Bun pin moves | Patch SHA `e79aec7b96eb8114e85ebcb90f0a8b12076bcd8aa08c09bb88929621e1c1446d` unchanged under Bun 1.3.14. Immutable owners, same-tree reset, install-guard, C++20 `binding.gyp`, 33-language manifest, versioned FQN codec, lazy grammar pool, embedded Vue/Markdown all unchanged (FROZEN contract). | 33+33 parses, 27+27 modules, 10 sensors, RSS -188 KB (Codespace) / +589 KB (macOS) < 16 MiB on both platforms under 1.3.14 |
| AD-006 (amendment 2026-07-21, native-runtime-rebaseline) | active; parser pool contract unchanged; only the Bun pin moves | Parser pool (capacity 4/max 32, timeout 5s/max 60s), cursor-before-tree cleanup, non-empty-success guarantee all unchanged under Bun 1.3.14. | 10 behavior sensors PASS on both platforms; RSS stress gate PASS (100 cycles, median delta well within 16 MiB) under 1.3.14 |
| AD-016 | active (untracked-generated-bundles, 2026-08-05) | Generated plugin bundles under `apps/*-plugin` (managed skill roots, `agents/`, `agent-profiles/`, generated hook copies, `opencode-config.cjs` mirror) are untracked build output; generation-on-demand is the contract; any new consumer (workflow, script, test entry point) must chain `bun run generate:artifacts` ahead of itself. | Cold-path evidence in validation.md; workflow-generation-order sensor; pre-script chain |
| AD-017 | active (plugin-architecture-unification, 2026-08-05) | **Plugins deliver, MCP serves tools, hooks observe.** A plugin is a delivery vehicle for agents/skills/hooks/host wiring, never a tool-serving mechanism; the MCP server registered by `scripts/install-agents.sh` (single writer) is the one canonical tool surface (54 tools); hooks are host-native and always on; in-process tools are never a coverage mechanism. Closes three defects: OpenCode's installer removed its own MCP entry as "redundant," leaving OpenCode users 14 of 54 tools; Cursor 3.14 double-loads massa-ai (local plugin copy + Claude-marketplace bridge), risking double hook firing; the harness plugin phase trusted `install-state.json` version records with no on-disk check, so an external wipe of installed artifacts (observed live 2026-08-05, marker `~/.cursor/projects/.agent-data-cleanup-2026-08-05`) reported `skip-current` forever with zero artifacts present. Implemented: OpenCode installer delegates MCP registration to the single writer instead of removing it (uninstall leaves the MCP entry — plugin lifecycle ≠ tool-surface lifecycle); harness `skip-current` now requires an on-disk per-host sentinel, gated on the recorded `installRoute`; Cursor installer prefers the Claude-bridge load path with local install as fallback, hooks fire exactly once; the OpenCode plugin's 14 in-process tools are removed, event handlers kept (OpenCode has no external hook surface). Rejected alternatives: a hybrid in-process hot-path tool subset (depended on unverified OpenCode per-server tool-disable config); preferring the local Cursor copy over the bridge (an installer cannot suppress host bridge behavior; the local copy is the one thing fully within this project's control). | `docs/adr/0002-plugins-deliver-mcp-serves-tools-hooks-observe.md`, `apps/opencode-plugin/src/index.ts`, `scripts/install-agents.sh` |

## Progress

- Required coding bootstrap, memory recall, persona routing, source investigation, and full Plan Challenge completed.
- Supplied plan revised until the Plan Critic reported no remaining critical/high contradiction.
- Canonical `spec.md`, `context.md`, `design.md`, `tasks.md`, `capability-matrix.md`, and initial `gate-manifest.md` created.
- 23 requirements, 12 acceptance criteria, 26 atomic tasks, seven phases, and independent verifier contract are frozen.
- Current source evidence: all 33 allowed extensions route through native structural extraction; the deterministic polyglot fixture proves 29 Flow-tier extensions and four Structure-tier extensions.
- TASK-001 target discovery measured macOS 26.5.2 arm64 with Bun 1.3.11. The user then narrowed platform scope to macOS arm64 only, reopening the grammar artifact loop. No production file changed yet.
- TASK-001 PASS: exact Bun 1.2.0 was rejected; exact Bun 1.3.0 passed a second frozen clean install, all 33 extension parses twice, 27 loaded native modules with Mach-O arm64/system-only linkage, and missing/incompatible negative sensors.
- Frozen selections include modern pinned Dart and Erlang Git commits, Clojure Orchard, and HTML as the Vue SFC host. No WASM or runtime download was used.
- TASK-002 initially pinned exact Bun 1.3.0, exact Node 22.22.2 build-helper contract, all 27 audited native dependencies/trust entries, and the frozen lockfile. Its first implementation passed fresh install, focused tests, type-check, and build, but independent review rejected the verifier as insufficient.
- TASK-002 remediation closed cold real source/dist consumers, queue release after setup/restoration faults, and exact resolved lock identities/integrities. The reference-only lifetime proposal was then falsified: stock binding parses retained about 1 MiB RSS per repeated 32 KiB parse under forced GC.
- A full native patch red-team rejected a root-only patch for packed consumers and required stale-object guards. The hardened source-and-packaging patch now adds idempotent cursor/tree deletion, live guards across Tree/Node/Query/oldTree/Cursor operations, and generated-addon delivery through core's bundled dependency.
- Independent review found a second critical native path: mutable public node/cursor `.tree` properties allowed a deleted owner to be replaced with a live tree and caused SIGSEGV. Patch v2 binds both owners as non-writable/non-configurable and adds cold substitution sensors.
- A follow-up review found cross-tree cursor reset/resetTo could bypass or desynchronize owner identity. Patch v3 marshals only same-tree reset nodes and rejects cross-tree cursor transfer in JS plus native code; the declaration marks both owners readonly.
- Authoritative patch v3 gates pass: empty-cache 770-package install; 9 focused tests/54 assertions; real cold source/dist 33+33 parses and 27+27 modules; ten behavior sensors; patched 100-cycle median below 1 MiB versus a roughly 125 MiB no-delete control; type-check 6/6; build 5/5.
- Fresh npm-packed shared/core installed into a normal consumer. Built core resolved only the nested runtime; immutable owners, same-tree reset, cross-tree reset/resetTo rejection, stale throw, and system-only Mach-O arm64 linkage passed.
- Exact Node 22.22.2/npm 10.9.7 packed shared/core after Bun 1.3.0 packing was proven to omit bundle payloads. A normal non-workspace Bun consumer imported built core, resolved the nested patched runtime, parsed/double-deleted, and loaded a system-only Mach-O arm64 addon.
- Clean build exposed pre-existing direct `zod` imports in core without a direct declaration; TASK-002 added `zod` as the minimal required dependency.
- TASK-003 froze the normalized structural contracts and exact ordered 33-extension manifest. Exact Bun 1.3.0 focused tests passed 6/6 with 451 assertions; uncached type-check/build passed; independent review's sole `parameterIndex` versus `paramIndex` mismatch was remediated and accepted.
- TASK-004 added literal lazy native grammar loading, exact serialized Bun-marker restoration, cached all-33 readiness, live-but-parser-failed health, startup validation ordering, and pre-side-effect guards for the tool, ETL, and legacy direct index paths. Focused/native/regression/type/build/dist gates and independent review passed.
- TASK-005 added the process-global bounded FIFO parser pool, structural runtime, bounded diagnostics with total counts, validated grammar-cache handoff, and native lifetime ownership. Review-driven fixes closed per-runtime cap multiplication, poisoned retarget-slot reuse, and public raw grammar access.
- TASK-006 added immutable UTF-8 byte/point indexing, embedded host-child span remapping, legacy line derivation, canonical full-SHA FQNs, legacy aliases, collision detection, and deterministic ambiguity payloads. Review-driven strict parsing prevents malformed modern-looking suffixes from masquerading as legacy names.
- TASK-007 added runtime-owned bounded native Query execution/cache identity and declarative TS/JS/TSX/JSX packs. Review-driven fixes completed typed signature/import material, exact exports/relations/calls/flow/specialized edges, capability filtering, private-name encoding, native dialect breadth, and AST-safe modifier identity.
- TASK-008 added an exact `(dialect, resolverVersion)` registry, generation-scoped identity session, and deterministic TS/JS resolver for lexical, import, re-export, namespace, default-owner, global, ambiguity, unresolved, and legacy outcomes. Review-driven direct probes closed nested-basename leakage, dynamic import namespaces, barrel forwarding, private export leakage, and default-owner member qualification.
- TASK-009 routed TS/JS/TSX/JSX ETL structural work through the native runtime, retained exact `smartChunk` output, persisted generation-scoped resolver results, froze executable pre-T9 parity evidence and approved additions, and removed the superseded TS/JS regex typed-edge path. Focused 105/105, native source/dist, type/build, diff, and independent review gates passed.
- TASK-010 added the locked transactional graph-generation migration, deterministic legacy backfill, generation-owned graph keys/metadata, active/pending/lease state, full counts, and an active-scoped T9 repository bridge. Owned PostgreSQL 17 passed 3/3 with 62 assertions; clean migration, migrated ETL, type/build, and independent review gates passed.
- TASK-011 added the PostgreSQL lifecycle repository for serialized begin, heartbeat, completion, CAS activation, abort, lease-expiry takeover, and superseded cleanup. The owned macOS arm64 PostgreSQL suite passed 11/11 with 67 assertions after review fixes made expired abort non-mutating and protected last-known-good generation pointers. T13 retains ownership of discovered-file snapshot membership and post-snapshot content-delta reconciliation.
- TASK-012 generation-scoped symbol storage now validates live pending leases, atomically replaces/deletes/stales per-file graph rows, removes stale inbound edges, captures one active generation for batch reads/writes, replaces centrality exactly, and resolves modern/legacy FQNs with deterministic ambiguity. Owned PostgreSQL passed 12/12 with 38 assertions after race and identity review remediation.
- TASK-013 integrates complete pending generations through real Discover/Parse/Resolve/Load stages, immutable input snapshots, deletion reconciliation, stale LKG recovery, cross-process owner refresh, interruption settlement, synchronous CAS activation, and durable terminal generation identity. Exact Bun 1.3.0 focused/owned PostgreSQL passed 38/38 with 147 assertions; type-check 6/6, build 5/5, diff, and independent review passed. The canonical semantic vector/keyword lifecycle remains unchanged by adjudication.
- TASK-014 preserves exact diagnostic totals independently from ten bounded details/spans for recovered and incremental hard/stale files, derives status/language summaries only from the activated generation, and durably round-trips the summary with its activated identity through nullable forward-compatible job columns. Exact Bun 1.3.0 focused/owned PostgreSQL and ETL passed 50/50 with 249 assertions; type 6/6, build 5/5, diff, and independent review passed.
- TASK-015 adds native Python/Ruby/PHP/Lua declarations, documentation, honest per-module/per-clause imports, applicable type relations, calls/data flow/HTTP/events, and dialect-scoped resolution without cross-language leakage. Exact Bun 1.3.0 focused query/resolver/ETL passed 67/67 with 333 assertions; core build/type compilation, diff, and independent review passed after four P1 remediations.
- TASK-016 adds native C/C++/Go/Rust/Zig declarations, documentation, honest AST-derived imports, applicable types/inheritance/traits, calls/data flow/HTTP/events, and dialect-isolated resolution. `.h` defaults to C and selects C++ only from unambiguous native importer or directory-aware compilation-database evidence, including cached importers; angle includes remain unresolved. Exact Bun 1.3.0 focused gates passed 95/95 with 1,010 assertions; core build, diff, and independent review passed after four remediation rounds.
- TASK-017 adds native Java/Kotlin/KTS/Scala/C#/Swift/Dart declarations, documentation, honest imports, overload/constructor/property/field identities, inheritance, calls/data flow/HTTP/events, and dialect-isolated resolution. Real Java provider/consumer tests prove nested and static named/wildcard imports with public/private visibility. Exact Bun 1.3.0 focused gates passed 91/91 with 480 assertions; type-check 6/6, build 5/5, diff, and independent review passed after five remediation rounds.
- TASK-018 adds native Elixir/EXS/Erlang/Clojure/OCaml/Haskell declarations, documentation/spec evidence, honest namespace/named/open/qualified/hiding imports, applicable relations, calls/data flow, module-owned identities, and dialect-isolated resolution. BEAM import arity selects exact overload identities; EX/EXS remain compatible. Exact Bun 1.3.0 focused gates passed 101/101 with 575 assertions; type-check 6/6, core build 2/2, diff, and independent review passed after two remediation rounds.
- TASK-019 adds Vue/Markdown embedded parsing plus Markdown heading and JSON/YAML qualified-key packs. Host resources release before sequential depth-two child parsing, native UTF-16 offsets are centrally adapted to exact UTF-8 bytes, Vue `lang` uses native attributes, stable ordinal scopes remap child spans, and fallback/hard-failure diagnostics retain exact totals. Exact Bun 1.3.0 passed 141/141 with 915 assertions; type-check 6/6, build 5/5, diff, and independent review passed after resolver, native-attribute, and acceptance-matrix remediation.
- TASK-020 routes definition, reference, trace, architecture, and impact consumers through one active-generation identity lookup; exact modern identities resolve, legacy ambiguity remains explicit and stable, overload impact analysis does not fall back to bare names, and search exposes all 18 canonical additive kinds. Exact Bun 1.3.0 focused tests passed 8/8 with 19 assertions; owned PostgreSQL passed 21/21 with 81 assertions; type-check 6/6, build 5/5, diff, and independent review passed. A supplemental broad trace/architecture run retained four pre-existing shared-database fixture failures outside the task-owned gate; no validation asset was weakened.
- TASK-021 exposes one shared parser-summary, active-generation, FQN-resolution, and canonical 18-kind transport contract through HTTP and the production MCP CallTool proxy. Project-map graph inputs are captured in one share-locked PostgreSQL transaction so concurrent activation cannot mix generations; extension counts remain distinct from parser language counts and raw diagnostics are never expanded. Exact Bun 1.3.0 focused transport/readiness/identity tests passed 19/19 with 92 assertions; owned PostgreSQL passed 21/21 with 93 assertions including the activation-lock/pending-poison sensor; type-check 6/6, build 5/5, diff, and independent re-review passed after both initial P1 findings were remediated.
- TASK-022 replaces the baseline-deleted indexing limitation suite with a PostgreSQL-native deterministic all-33 E2E contract. A 29-of-33 ParseStage integration escape—25/29 Flow tiers plus all four Structure tiers—was remediated by deriving routing from `LANGUAGE_MANIFEST`; the exact fixture now proves 29 Flow tiers, four Structure tiers, modern/legacy identity, HTTP/MCP parity, unresolved null targets, atomic activation, stale-failure preservation, deletion, and same/different-project concurrency. Owned sequential E2E passed 41 tests with 664 assertions plus one explained auth-on skip; focused indexing passed 7/7 with 249 assertions; static routing passed 20 tests with 278 assertions and seven expected E2E-off skips; type 6/6, build 5/5, qwen 69-entry hash validation, diff, and independent final review passed.
- TASK-023 implementation is complete but uncommitted. Focused 14/14, source/dist native 33+33 parses and 27+27 modules, ten lifetime sensors, RSS/linkage, type 6/6, build 5/5, tar semver/addon inspection, and an extracted packed-surface 33/27/10 run pass. Independent review requires the current tarballs' mandatory empty-cache install; it remains unexecuted because platform network escalation was rejected at the account approval limit and local caches lack 47 resolution manifests plus Dart/Erlang Git tarballs.

## Native Runtime Re-baseline (2026-07-16)

User directive switched the native runtime to Bun `1.3.11` and Node `25.9.0` (Node 25.2.2 was requested but is not a real release; the closest real, locally-installed Node 25.x — 25.9.0 — was selected and confirmed by the user). The network approval block cleared, so the TASK-023 empty-cache packed-consumer install now runs. Two real defects surfaced and were fixed: (1) Node 25 headers require C++20 while `tree-sitter@0.25.0` declared C++17, so the patch now sets the `binding.gyp` C++ standard to C++20; (2) the bundled tree-sitter `install` script (`node-gyp-build`) fell back to a missing `node-gyp` in consumers, so the patch adds an install-guard that no-ops when the prebuilt addon is present (falling back to the upstream command only for fresh source builds). The package verifier also materializes the hoisted patched runtime into `packages/core/node_modules` before `npm pack` so the core tarball bundles the exact nested patched runtime. Cold install, source/dist native verifier (33+33 parses, 27+27 modules, 10 sensors, RSS within bound), the package gate (33 parses, 27 modules/paths, 10 sensors), focused verifier tests (14/14), type-check (6/6), and build (5/5) pass under the new versions. Patch SHA moved from `b0f73d00…` to `e79aec7b96eb8114e85ebcb90f0a8b12076bcd8aa08c09bb88929621e1c1446d`.

## Next Step

Commit the native runtime re-baseline, then commit TASK-023 (`build(parser): verify macos native artifacts`) after its independent review passes. Continue TASK-024 (frozen macOS arm64 CI), TASK-025 (parser benchmark), and TASK-026 (docs) under Bun `1.3.11`/Node `25.9.0`.

## Previous Feature

`sqlite-removal` remains registry `in_progress` because its documented legacy-fixture follow-up is unresolved; its implementation/validation evidence remains under `.specs/features/sqlite-removal/`. This feature does not alter that status.

### SQLite Removal Final State

- Configuration, installer, core persistence, API/health, CI, docs, and active test/E2E paths were converted to PostgreSQL-only behavior.
- Workspace type-check/build, validator discrimination, bootstrap regression, installer tests, active-reference scan, and diff integrity passed.
- Isolated PostgreSQL 17 + pgvector completed 14 migrations, vector CRUD integration (16/16), CRUD/scheduler restart checks (44), smoke (4/4), CLI (13/13), and destructive E2E (4/4; 79 assertions). Owned `:5433`, `:3334`, and `:11435` resources were removed; shared `:3333` remained healthy.
- Residual follow-up: rerun a legacy migration smoke after its checked Prisma fixture repair, rebuild/re-run the frozen qwen fixture, and capture a concise aggregate root-test result.
- Canonical evidence: `.specs/features/sqlite-removal/validation.md`.

### Historical Plan Spec Capture

- Added 14 feature-named folders for supplied Claude Code plans, each with `spec.md`, `design.md`, `tasks.md`, and `validation.md`.
- Source plans remain machine-local under `/Users/luizmassa/.claude/plans`; each feature design captures commit-backed execution facts and explicit gaps.
- Historical source range: inclusive `c1d37b8120025a69e2de0e5fd054ca8177e205de^..81d33606fb6826e1759a073006b165419d0e3ba4` contains 133 reachable commits. Historical claims are not current-session runtime verification.

## Wave 2 (Improvement Plan v2) — COMPLETE

- Source plan: `~/Downloads/massa-ai-improvement-plan.md`. Wave 1 merged via PR #3 (`9fb32f3`).
- workflowSessionId: `spec-driven-wave2`; branch: `wave-2` (off `main`).
- Status: **COMPLETE** — 10/10 items done (M36, M7, M9, M40, M13, M11, M10, M8, M12, M14). All validated PASS. Local branch `wave-2` now tracks `origin/wave-2`.
- **M36 (TOON compact output) — DONE + validated PASS** (2026-07-18). Shared `serializeToolResponse` + `fields` projection; `format` added to 3 tools (get_optimized_context, trace_path, impact_analysis), `fields` to all 12, two-layer MCP parity. Commits `33fea92`, `23035ac`, `05d518b`, `1d30061` on `wave-2`. Independent verifier PASS, discrimination sensor 4/4. Artifacts: `.specs/features/toon-compact-output/`. Follow-ups (non-blocking): MCP `search` def lacks `format` (pre-existing, M32 scope); pre-existing PG-fixture failures in `trace-path.test.ts` (test-isolation task).
- **Small batch — DONE** (2026-07-18): M7 query deadline (`8cf69d2`, injectable clock), M9 schema-ahead (`1ef6d0a`, SchemaAheadError + canonical-signature/checkpoint guards), M40 pinned invariant (`164ed95`, pin guard + fail-closed proposal validation), M13 body-tokens gate (`969ae4f`, empty-region signature skip). Each DB-free tested + tsc clean. Quick specs under `.specs/quick/001..004`.
- **M11 (grammar load-time integrity) — DONE** (`4731cbd`). Shared `native-lock-identities.ts` + `grammar-integrity.ts` verifier (sha512 over package source, ABI-rebuild-safe), wired into `parser-readiness.ts` default-on/memoized. NOTE: prior partial's 27 `sourceIntegrity` pins were fabricated; re-derived from `bun.lock` + recomputed, round-trip-verified. Quick spec `.specs/quick/005`.
- Remaining: **M10** (search preflight — behavior change, two-tier recommended), **M8** (audit-log — DB migration + actor-identity gap), **M12** (agent installer — writes user HOME), **M14** (god-files refactor — Large/high-risk, own feature). Checkpoint before M8/M12/M14.
- **M10/M8/M12 — DONE** (2026-07-18, user approved safe-defaults proceed): M10 two-tier search preflight (`1f5374f`, hard-fail unindexed / warn stale); M8 audit-log (`6db3855`, additive reversible `operation_log` migration + `recordOperation` + api-key-only `ActorContext` seam, PG-verified); M12 agent installer (`d8bf093`, `scripts/install-agents.ts`, 5 agents wired — claude-code/desktop/codex/cursor/opencode — safe-merge+backup+`--dry-run`+`--uninstall`+home-write guard; Gemini/Grok/Devin deferred). Final regression: 67 pass across 6 core DB-free suites + 46 installer; repo type-check 6/6.
- **M14 (god-files refactor) — DONE** (2026-07-18, branch `m14-god-files` off `wave-2`, full spec-driven pass with plan-challenge gate): decomposed both god-files behind byte-identical facades. query-pack 1254→73 LOC across 5 modules (native-node-helpers/symbol-signature/query-pack-registry/query-pack-captures/query-pack-edges); ContextualSearchRLM 1668→463 LOC across 5 delegate modules (rlm-indexing/rlm-search/rlm-fusion/rlm-synapse/rlm-admin). No module >537 LOC. New characterization test (21 tests) pins RRF fusion + search() + mutex try/finally BEFORE the split. Plan-critic gate caught 3 critical/high issues (mutex try/finally preservation, `_indexProjectInternal`/`ensureInitialized` instance-delegate requirement, characterization seam-reachability) — all incorporated pre-execute. Static `indexingLocks` mutex preserved; barrel `services/index.ts` byte-identical. Independent verifier: PASS (88/88 targeted tests, 3 discrimination mutations killed). 9 commits. Validation at `.specs/features/god-files-refactor/validation.md`. **Wave 2 now 10/10 complete.** Branch NOT pushed.
