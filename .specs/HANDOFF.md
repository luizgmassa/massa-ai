# Handoff — skill-token-optimization (Specify/Design/Tasks done; Execute approved, Plan Challenge next)

Previous handoffs closed: persona-router-token-optimization merged as PR #68 @
`41daeb68` (T0–T9 validated PASS; PRT-02 live walkthrough remains
pending-restart, tracked in that feature's validation.md; provisioning recipe
for its worktree preserved in git history of this file @ `41daeb68`).

Session `spec-skill-token-optimization` · workflow spec-driven (Large) ·
persona route: AI Engineer (pinned). massa-ai MCP not used this session;
`.specs/` files canonical. Contract files:
`.specs/features/skill-token-optimization/{spec,design,tasks}.md`.

## Objective

Cut token cost of the skill surface (STO-1..9): lazy-load conditional
definitions (SonarQube → `references/sonarqube-mcp.md`; mobile/Figma
design-source intake gate → `references/mobile-context.md`; high-value
extraction set incl. audit-scope 5-branch dedupe), validator top pack
(`validate_audit_report.ts`, `validate_design.ts`, red-first), caveman
compression of 36 workflows + 87 references + 17 agent charters. Baseline @
`41daeb68`: 339,809 / 603,273 / 63,781 B.

## Environment

- Branch `spec/skill-token-optimization`, worktree
  `.claude/worktrees/skill-token-optimization`, cut from `main` @ `41daeb68`.
- Worktree NOT yet provisioned (no `bun install`); T1 provisions: `bun
  install`, copy `node_modules/tree-sitter*/build/` from main checkout, verify
  `bun test scripts/tests/verify-tree-sitter-grammars.test.ts` → 9/0.
- `spec.md`/`design.md`/`tasks.md` written; validate_spec + validate_tasks
  exit 0 (12 tasks parsed). FEATURES.json registered + active; STATE rotated
  (43→44 sections).

## User decisions (2026-08-05)

- High-value extraction set IN; validator top pack IN; marginals + remaining
  22 deterministic mechanisms deferred (recorded in STATE).
- Execute GO with two sequential massa-ai-builder Phase workers (T2–T7,
  T8–T11); T1 + T12 main agent; delivery through PR; merge stays user's.
- Merge order: this feature BEFORE `workflow-metadata-headers` — that branch's
  T1–T4 frontmatter edits sit UNCOMMITTED in the MAIN checkout; never touch
  that tree from this feature.

## Cautions

- rtk-filtered output corrupted a `git status` reading this session — cite
  only `rtk proxy`/scripted figures.
- Dispatch blocks stay inline (`agent-orchestration.md:92-93` invariant);
  trigger sentences stay inline when a conditional body moves.
- main moved mid-session (model-profile-switching landed; generator now covers
  `skills/profile/`): T12 rebases onto `origin/main` + re-runs regen.
- Workers: branch-check before every commit (a shared checkout's branch can
  move under a running agent).

## Exact Next Step

Full Plan Challenge gate (The Fool + massa-ai-plan-critic), fold serious
findings, commit spec artifacts, then T1 (guard tooling, main agent), then
dispatch Phase 1 worker (T2–T7).
