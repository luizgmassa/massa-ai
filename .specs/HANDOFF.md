# Handoff — registry-cleanup-skill-imports (Execute done; verification-agent gate next, then PR)

Previous handoffs closed: skill-token-optimization merged as PR #71 @
`ef595210`, released v1.27.0.

Session `spec-registry-cleanup-skill-imports` · workflow spec-driven (Large) ·
persona route: Context-Skill Harness Engineer/Architect (pinned). massa-ai MCP
not used this session; `.specs/` files canonical. Contract files:
`.specs/features/registry-cleanup-skill-imports/{spec,design,tasks}.md`.

## Objective

skills/AGENTS.md registry cleanup (stale claims, mirror sections, judge
permission end-to-end) + import coding-guidelines / skill-architect / to-prd
into skills/massa-ai as router-owned workflows/references. User decisions
2026-08-05: convert-to-workflows shape; copy-only (Useful-Agent-Skills
untouched); lazy coding-guidelines load; branch from main post-#71;
skill-architect keeps CC-BY-4.0 with attribution (WMH gate license allowlist).

## State

- Branch `spec/registry-cleanup-skill-imports` from `main` @ `394770fc`.
  Commits: 65cae03a (contract), 7e38f3cd..4cdd0175 (T1–T6, one
  massa-ai-builder Phase worker), 1e02fcc7 (T7), 3eb83bea (T8 first half).
- All gates green: test:scripts exit 0 (1414 tests + 8 shell suites), lint 0,
  test:plugins 96/0, both generators --check clean, skills-harness-integrity
  32/0, subagent-parity 65/0.
- Three WRITE_AGENTS roster copies now list judge: generator, subagent-parity
  test, claude-plugin install test. Two workflow-count locks now 38:
  workflow-metadata-headers (+ license allowlist ["MIT","CC-BY-4.0"]) and
  workflow-harness-contract (+ complement 22, intake lines in both new
  workflows).
- Plan Challenge (pre_mortem) findings all folded: C1 count-lock, C2
  authority-scanner narrowing, C3 pointer clause, C4 licensing.

## Next

1. Dispatch massa-ai-verification-agent (author ≠ verifier) →
   `.specs/features/registry-cleanup-skill-imports/validation.md`.
2. Commit state files; `check_specs_delivered.ts` must exit 0.
3. Push branch + `gh pr create` (authorized in Execute GO; merge = user).
4. Post-merge user-run (never agent-run): `bash scripts/install-skills.sh
   --apply` to refresh installed hosts; optionally remove the orphaned
   standalone `~/.claude/skills/coding-guidelines`.
