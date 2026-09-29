# Validation — agent-start-hook-announcement

Contract: `.specs/features/agent-start-hook-announcement/spec.md`. Verified 2026-09-29.

## Summary

**Result: PASS.** Independent verifier: `massa-ai:code-reviewer`, verify mode, author ≠ verifier.
It found AC1, AC4 and AC5 passing and 31 of 34 mutants killed. Three non-equivalent survivors
left AC2's no-POST clause and AC3's Codex host argument unguarded, plus three advisory
survivors. All six got a sensor, and each was re-run by exit code against its own suite
(hook mutants against `hook-agent-start.test.ts` alone, so the Codex byte-identity test
cannot claim the kill). Result: 6/6 killed, tree restored byte-identical.

## Acceptance criteria

| AC | Verdict | Evidence |
| --- | --- | --- |
| AC1 Claude announcement | PASS | `apps/claude-plugin/hooks/massa-ai-hook.ts:325` builder; env-over-call override at `apps/claude-plugin/hooks/massa-ai-hook.ts:351`; subprocess test `apps/claude-plugin/__tests__/hook-agent-start.test.ts:247` prints one `{systemMessage}` from the real bundle's `code-reviewer.md` |
| AC2 Silent-degrade, no POST | PASS | early return at `apps/claude-plugin/hooks/massa-ai-hook.ts:498`; shadowed/unowned file → null at `apps/claude-plugin/hooks/massa-ai-hook.ts:344`; zero-fetch sensor `apps/claude-plugin/__tests__/hook-agent-start.test.ts:220`; shadow sensor `apps/claude-plugin/__tests__/hook-agent-start.test.ts:68` |
| AC3 Registration | PASS | `apps/claude-plugin/hooks/hooks.json:25`, `apps/claude-plugin/install.sh:167`, parity sensor `apps/claude-plugin/__tests__/manifest.test.ts:113`; Codex `apps/codex-plugin/hooks/hooks.json:19`, `apps/codex-plugin/install.sh:160`, sensor `apps/codex-plugin/__tests__/manifest.test.ts:159` |
| AC4 Codex + OpenCode | PASS | Codex `apps/claude-plugin/hooks/massa-ai-hook.ts:372` (`"""` header split `:359`, `CODEX_HOME` fallback `:410`); OpenCode `apps/opencode-plugin/src/index.ts:219`, `apps/opencode-plugin/src/agent-announcement.ts:36`, call-site sensor `apps/opencode-plugin/src/__tests__/index.test.ts:115` |
| AC5 Prose rule removed | PASS | `skills/AGENTS.md:102`, `skills/massa-ai/references/agent-orchestration.md:287`; sweep sensor `scripts/__tests__/workflow-harness-contract.test.ts:946` (observed red on a reinserted marker) |

## Gates

| Gate | Command | Result |
| --- | --- | --- |
| Lint | `bun run lint` | exit 0 |
| Type-check | `bun run type-check` | exit 0 (6/6) |
| Artifact drift | `XDG_CONFIG_HOME=$(mktemp -d) bun run generate:artifacts --check` | no drift |
| Hook + manifests + contract | `bun test` hook-agent-start, claude manifest, hook-doctor, codex manifest, workflow-harness-contract | 168 pass / 0 fail |
| Installers | `bun test --timeout 180000` claude + codex `install.test.ts` | 54 pass / 0 fail |
| OpenCode + Cursor plugins | `bun test --timeout 180000 apps/opencode-plugin/__tests__ apps/cursor-plugin/__tests__` | 91 pass / 0 fail |
| OpenCode src | `bun test src/__tests__/agent-announcement.test.ts src/__tests__/index.test.ts` | 40 pass / 0 fail |
| Shell sensors | `test-hook-ownership-orphans.sh`, `test-install-agents-claude-hooks.sh` | 22/0, 15/0 |
| Root scripts | `bun run test:scripts` | 2222 pass / 16 fail; see below |

## Environment, not code

- `test:scripts` 16 fails: 11 cleared by regenerating under a scratch `XDG_CONFIG_HOME` (the
  local profile overlay leaks into `generate:artifacts`). The remaining 5 are `npm pack --json`
  consumers failing with `{} is not iterable`: the local npm is 12.1.0 and its JSON shape
  changed; the project pins 11.14.1 and CI uses it. No file of this feature is involved.
- Plugin install suites hit 5000 ms timeouts at load 27–208 (unrelated Gradle builds); with
  `--timeout 180000` they run green.

## Residual risk

- The on-screen rendering itself is observed by no test: Claude's `systemMessage`, Codex's
  `↳ Hook ·` line and OpenCode's toast are documented behaviour, not measured here. One live
  dispatch per host is the only sensor.
- Codex `SubagentStart` output may render in the subagent's thread rather than the parent's
  (not documented).
- Cursor is unsupported by decision D4.
