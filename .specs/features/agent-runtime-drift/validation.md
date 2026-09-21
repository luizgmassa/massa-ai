# Validation — agent-runtime-drift

Filled at gate time (T08). Contract: `.specs/features/agent-runtime-drift/spec.md`.

## Gates

| Gate | Command | Result |
| --- | --- | --- |
| Profile-switch suites | `bun test packages/shared/src/profile-switch` | 125 pass / 0 fail (317 expects) |
| Hook suites | `bun test apps/claude-plugin/__tests__` | 43 pass / 0 fail (279 expects) |
| Harness contract sensor (S9) | `bun test scripts/__tests__/workflow-harness-contract.test.ts` | 128 pass / 0 fail (249 expects) |
| Hook ownership orphans (critique falsifier #1) | `bash scripts/tests/test-hook-ownership-orphans.sh` | 22 passed / 0 failed |
| Lint | `bun run lint` (oxlint) | exit 0, no findings |
| Bundle regeneration | `bun run generate:artifacts` | 396 variant agent files emitted across 4 hosts; generator works with the extracted parser |
| Combined re-run (verification pass) | `bun test packages/shared/src/profile-switch apps/claude-plugin/__tests__` | 168 pass / 0 fail (596 expects) |

## Known pre-existing baselines (not introduced by this change-set; stash round-trip verified on origin/main)

- `apps/mcp-client`: 14 fails (EmbeddedApiClient handoff/proposal/symbol endpoints + env-setup import guard) — identical on clean origin/main in a fresh worktree.
- `scripts/__tests__`: order/parallel flaky failures (overlay temp-file fixtures); the generator forwarding suite's `--check` reports a pre-existing emit-vs-check asymmetry on this machine (`claude/agent-profiles/{cheap,work}` with a clean git tree). The extracted parser is byte-identical to the deleted block and no generator input was touched.

## Critique falsifiers (plan-critic, pre_mortem)

- F1 hook alive: hook ships inside the EXISTING `massa-ai-hook` session-start
  entry (no new hooks.json entry → orphan test stays green by construction).
- F2 parser: shared `frontmatter.ts` extracted; generator imports it; hook's
  dependency-free `^model:` regex pinned cross-side (`hook-doctor.test.ts`).
- F3 status: negative tests pin "real run never emits `would-switch`" and
  "dry run never emits `switched`"; `reportSucceeded` semantics unchanged for
  real runs.
- F4 route honesty: registry-cache fallback fixture asserts the non-directory
  path resolves the cache (AC-01.2) — no live-load claim beyond directory-source.
- F5 MCP visibility: no output schema exists on `profile_list` (loose
  passthrough, verified in `tool-defs-project.ts`), so the engine-level
  assertions on the new row fields are the discriminating check; description
  documents the fields.

## Bounds respected

B1/B2/B3 of the spec: directory-source live-load is asserted only as
resolver coherence; the doc qualifies the cache fallback; the hook regex is
pinned against the shared parser instead of importing it.
