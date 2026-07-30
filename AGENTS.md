# massa-ai — Agent Startup Contract

## Project Identity

- **projectId**: `massa-ai`
- **Resolve from**: workspace root directory basename (fallback: git toplevel basename)
- **Session IDs**: `spec-<workflow>-<entity>` (e.g., `spec-wave-7-hygiene-ui-process`)

## Runtime Routing

This project uses the `massa-ai` skill workflow router. Load it once per coding session.

### Active Feature

Check `.specs/project/STATE.md` for the current active feature and `.specs/project/FEATURES.json` for the feature registry.

### Available Skills (repo-local)

- `massa-ai/` — workflow router; MCP tool contracts and Synapse lifecycle live in
  its `references/mcp-tools.md` and `references/synapse-policy.md`
- `persona-router/` — persona selection
- `AGENTS.md` (under `skills/`) — sub-agent registry: 17 reusable specialist
  agents, plus the canonical policy bootstrap block

#### Sub-Agent Skills (invocable by any workflow)

Dispatch under the host-registered name `massa-ai-<role>`, never the bare role
name (see `skills/massa-ai/references/agent-orchestration.md` → Name Resolution).

- `investigator/` — read-only codebase investigation (locate, trace, impact)
- `planner/` — read-only implementation planning (steps, deps, risks, order)
- `builder/` — write-permitted implementation (disjoint write set)
- `reviewer/` — read-only diff review (bugs, regressions, smells, edge cases)
- `context-curator/` — read-only Context Packet preparation (firewall, Synapse)
- `verification-agent/` — read-only Verification Ladder centralization (validate, report)
- `requirements-analyst/` — read-only requirements analysis (ambiguity, gaps, implicit)
- `architecture-specialist/` — read-only architecture guidance (boundaries, trade-offs)
- `test-engineer/` — testing strategy (unit, integration, edge, acceptance coverage)
- `documentation-agent/` — engineering documentation (README, ADR, RFC, changelog)
- `audit-specialist/` — configurable 6-lens audit (bugs, architecture, security, requirements, code-quality, performance)
- `mobile-specialist/` — conditional mobile expertise (Android, iOS, KMP; refuses non-mobile)
- `plan-critic/` — read-only plan challenge for the lite and full Plan Challenge gates
- `furps-analyst/` — read-only single-dimension FURPS+ analysis of a PRD or ADR
- `navigator/` — read-only index-first codebase navigation (massa-ai MCP surface)

### Spec Artifacts

- `.specs/project/STATE.md` — current objective, progress, decisions
- `.specs/project/FEATURES.json` — feature registry and status
- `.specs/HANDOFF.md` — session handoff state
- `.specs/features/<slug>/` — per-feature spec, design, tasks, validation
- `.specs/lessons.json` — machine-owned lesson state
- `.specs/LESSONS.md` — rendered lesson playbook (read-only)

## Indexing / Context Hygiene

Always ignore these paths during indexing and context loading:

```text
node_modules/
vendor/
.venv/
env/
__pycache__/
*.pyc
dist/
build/
.next/
.nuxt/
out/
bin/
obj/
target/
ios/Pods/
ios/build/
android/app/build/
android/.gradle/
android/.idea/
.expo/
.dart_tool/
*.ipa
*.apk
*.app
*.log
logs/
.npm/
.eslintcache
.stylelintcache
.cache/
tmp/
.env*
*.pem
*.key
.ssh/
secrets.json
.idea/
.vscode/
.DS_Store
Thumbs.db
```

## Agent Policies (single source elsewhere)

The Persona Router, Plan Challenge, and Conversation Feedback policies are
defined **once**, in the `<!-- massa-ai:bootstrap -->` block of
[`skills/AGENTS.md`](./skills/AGENTS.md). `scripts/install-skills.sh` copies that
block to `<host>/AGENTS.md` (for example `~/.claude/AGENTS.md`), which is the
copy an agent reads at runtime.

Edit the policies in `skills/AGENTS.md`. Do not restate them here or in a host
copy — a second copy is how the repo previously ended up shipping two
contradicting Plan Challenge gates.
`scripts/__tests__/skills-harness-integrity.test.ts` fails if a
`plan_challenge:` / `conversation_feedback:` / `persona_router:` block reappears
in this file.

## Runtime Contract

After activation, follow `skills/massa-ai/SKILL.md` for all runtime behavior — in
a checkout that is this repo's copy, and in an installed host it is the symlink
`scripts/install-skills.sh` created to the same file. It defines workflow
routing, project/session handling, retrieval, persistence, graceful degradation,
and completion evidence.

## Tech Stack

- **Runtime**: Bun 1.3.14 (pinned via `.tool-versions`, `mise.toml`, Dockerfile)
- **Build helper**: Node 25.9.0 (pinned via `.tool-versions`, `mise.toml`)
- **Language**: TypeScript (ESM, strict)
- **Test runner**: `bun test` (Bun-native)
- **Type-check**: `bun run type-check` (6 tsc projects)
- **Build**: `bun run build` (turbo build, 5 packages)
- **Database**: PostgreSQL 17 + pgvector
- **Packages**: `packages/core`, `packages/shared`; `apps/tools-api`, `apps/mcp-client`, `apps/opencode-plugin`, `apps/claude-plugin`, `apps/web-ui`