# Handoff — pr-review-workflow (VALIDATED PASS 2026-08-05 — 26/26 ACs, 5/5 mutations killed; push/PR = user decision)

Previous handoffs closed: untracked-generated-bundles merged as PR #73 @
`40ec631a`, released v1.29.0 (its full handoff is preserved below as Previous);
registry-cleanup-skill-imports merged as PR #72 @ `724ad02d` (main).

Session `spec-pr-review-workflow` · workflow spec-driven (Large) · massa-ai MCP
not used this session (no recall hits needed beyond CLAUDE.md/.specs context);
`.specs/` files canonical. Contract files:
`.specs/features/pr-review-workflow/{spec,design,tasks}.md` (+ `validation.md`
at T6).

## Objective

New routed workflow `pr-review`: six-dimension hosted PR (Pull Request) /
MR (Merge Request) review — security, requirements/DoD, test coverage,
architecture, regression/hallucination, performance — posting inline comments
plus one consolidated summary through `gh` (GitHub) or `glab` (GitLab).
Adapted from the TLC pr-review skill (CC-BY-4.0, github.com/augusto-dmh) with
massa-ai roster dispatches, orchestrator-posts channel discipline, `.specs/`
requirements Track B, and freshness-gated index retrieval. GitLab command
surface researched against official docs (citations in design.md D1); stable
`glab api` Discussions/Notes endpoints are the contract.

## State

- Branch `spec/pr-review-workflow` from origin/main @ `1906a04e` (v1.29.0).
  Commits: `55ed20e2` specs (Plan Challenge F1–F5 folded) → `18e0dbe6` T1
  workflow file (17,424 B) → T2 router registration (SKILL.md 20,091 B of
  21,000 ceiling) → T3 count locks 38→39 + complement 22→23 (observed
  red→green) → T4 CHANGELOG → this state commit (T6 partial).
- Gates green: `generate:artifacts` + `--check` no drift; integrity (6 new
  dispatch-block parses: audit-specialist + reviewer, persona clause present) +
  duplication + parity + size 81/0; doc-paths 0 misses; lint 0; both count
  suites 50/0; `test:scripts` 1451/4 — the 4 fails are the documented
  `.claude/worktrees/` needle-anchor contamination (3 sibling checkouts
  duplicate `const DAMPING = 0.85;`; CI authoritative, same class as the
  workflow-metadata-headers AC5 amendment).
- validate_state: 51 pre-existing errors on origin/main baseline (scratch
  worktree, measured 2026-08-05); this feature contributes 0; T6 gate amended
  accordingly in tasks.md.
- Plan Challenge (full pre_mortem, massa-ai-plan-critic subagent): F1
  consolidation check recorded as design D2b (six dispatches stand); F2 live
  read-only dry run executed on GitHub PR #73 (identity, metadata + head SHA,
  diff, changed files, comment inventory — all resolve), glab side
  skipped-with-reason (`glab` not installed on this machine); F3 numeric 80%
  confidence gate reworded qualitative; F4 accepted; F5 measured.

## Next Step

Done through T6: independent validation PASS (26/26 ACs, 5/5 mutations killed,
0 gaps — `.specs/features/pr-review-workflow/validation.md`); FEATURES.json
status `complete`. Remaining: push `spec/pr-review-workflow` + open the PR —
the user's decision (outward-facing; not taken unattended). CHANGELOG entry
present, so the merge gate is satisfied without the `no-changelog` label. No
installed-machine actions needed — the workflow ships with the skills bundles
on the next release/install.

---

# Previous — Handoff — plugin-architecture-unification (VALIDATED PASS; merged as PR #74 @ `46e7af97`)

Previous handoffs closed: untracked-generated-bundles merged as PR #73 @
`40ec631a` (main, released v1.29.0).

Session `spec-plugin-architecture-unification` · workflow spec-driven (Large) ·
branch `spec/plugin-architecture-unification` from `96ee1850` with origin/main
(v1.29.0) merged at `bb3e90bf`. Contract files:
`.specs/features/plugin-architecture-unification/{spec,design,tasks,context,validation}.md`.

## Objective

AD-017 — plugins deliver, MCP serves tools, hooks observe. Four coordinated
changes: OpenCode installer registers MCP alongside the plugin (54 tools; skip
rule removed; uninstall preserves the entry), harness skip-current gated on
per-host on-disk sentinels (wiped installs self-heal), Cursor prefers the
Claude-bridge load with local fallback (hooks fire exactly once,
installRoute bridge|local recorded), OpenCode plugin hooks-only (14 in-process
tools removed). Folded baseline: cursor flat agents, opencode real-copy
plugin, install-skills cursor warning.

## State

- Commits: `f0d84a7e` specs → `0a81f85d` T1 → `bb3e90bf` merge → T2–T6
  (`7efd1633`, `4f198e82`, `251621ec`, `3b1a5642`, `c9aee7c3`) → T7–T10
  (`fca8e995`, `3fb8c44c`, `dc18ed30`, `186bbd12`) → `8376dee6` validation fix.
- Validation: PASS (iteration 2 of 3) — 17/17 ACs, 6/6 mutations killed,
  gates green (single-writer 57/0, plugin-auto-install 201/0, cursor 25/0,
  opencode 27/0 + package 125/0, parity 88/0, lint 0, test:plugins 119/0,
  test:scripts 1455/0). Iteration-1 gap: PAU-14 "in-process `profile` tool"
  phrase outside the T9 sweep literals — class enumerated (pop 142), 2 live
  rows fixed; verifier re-derived independently (184-row superset, 0 live).
- ADR: `docs/adr/0002-plugins-deliver-mcp-serves-tools-hooks-observe.md` +
  AD-017 row in STATE.md Decisions (duplicate `## Decisions` heading noted,
  canonical = the AD-016 table).
- Lessons: L-021 recorded by verifier (sweep-literal class gap).

## Next Step

PR #74 open, CI 14/14 green (post-PR commits `c1334397` coverage floor +
`7aef1eba` config-pollution race; one infra rerun). Merge = user decision.
After merge, the user runs the staged machine repairs (this machine's
wiped `~/.cursor` artifacts + opencode plugin/MCP refresh):

```bash
bun run build                       # fresh opencode dist for the real-copy install
bash scripts/install-harness.sh     # sentinel probe now sees the wipe → reinstalls cursor; re-registers opencode MCP
# then verify: ls ~/.cursor/agents/massa-ai-*.md | wc -l   (expect 17)
#              /usr/bin/grep -c '"massa-ai"' ~/.config/opencode/opencode.json*  (MCP entry present)
```

Live once-only Cursor hook check (bridge route): restart Cursor, confirm one
massa-ai load line in the "Cursor Plugins" exthost log and single hook events.
