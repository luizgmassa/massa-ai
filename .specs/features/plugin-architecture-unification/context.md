# Plugin Architecture Unification — Context (locked decisions + live captures)

## User decisions (2026-08-05, this session)

- Architecture AD-017 fixed by user brief: plugins deliver, MCP serves tools, hooks observe. Not re-litigated.
- Item 4: hooks-only (hybrid in-process subset rejected).
- Delivery: single PR.
- Spec approved including PAU-03 (plugin uninstall leaves MCP entry).
- Design approved (A1 sentinel, bridge-preferred Cursor, codex-pattern delegation).
- Execute: GO, 2 batch workers.

## Live-machine captures (read-only, 2026-08-05 — fixture source of truth; pre-mortem F1/F2)

**`~/.claude/plugins/installed_plugins.json`** (shape v2; massa-ai entry):

```json
{
  "version": 2,
  "plugins": {
    "massa-ai@massa-ai": [
      {
        "scope": "user",
        "installPath": "/Users/luizmassa/.claude/plugins/cache/massa-ai/massa-ai/1.28.0",
        "version": "1.28.0",
        "installedAt": "2026-08-05T21:11:52.743Z",
        "lastUpdated": "2026-08-05T21:11:52.743Z",
        "gitCommitSha": "96ee1850a984169dad07366790acc4a08cf17825"
      }
    ]
  }
}
```

**`~/.claude/settings.json`** (relevant keys): `enabledPlugins["massa-ai@massa-ai"]: true`; `extraKnownMarketplaces` keys include `massa-ai`.

**Bridge probe contract (T6):** bridge detected ⇔ `installed_plugins.json` parses, `plugins["massa-ai@massa-ai"]` is a non-empty array, AND `settings.json` `enabledPlugins["massa-ai@massa-ai"]` is not `false` (absent settings.json or absent key → treat as enabled, matching Claude's own default). Any parse failure → local fallback.

**Codex sentinel glob confirmed live:** `~/.codex/agents/massa-ai-*.toml` (e.g. `massa-ai-architecture-specialist.toml`, `massa-ai-builder.toml`).

## Branch mechanics deviation (accepted)

origin/main moved during Specify (PR #73 merged, v1.29.0 released — `[Unreleased]` promoted). Branch `spec/plugin-architecture-unification` cut from `96ee1850` (= pre-merge tip, ancestor of origin/main) carrying the uncommitted diff; specs commit → T1 fix commit → merge origin/main in main thread (CHANGELOG resolution: folded entries move under the fresh `[Unreleased]`). Workers never perform repo-wide git ops. T1 therefore executes in the main thread; Batch 1 = T2–T6, Batch 2 = T7–T10.

## Delegation notes

- `massa-ai-plan-critic` and `massa-ai-builder` subagent types not registered in this session's agent registry — plan challenge ran as standalone fresh-eyes pre-mortem (5 findings, F1–F3 folded, F4 accepted, F5 no-op); batch workers dispatch as `general-purpose` agents under the batch-worker contract from `references/spec-driven/sub-agents.md`.
- Shared-checkout lesson applies: workers must verify `git branch --show-current` = `spec/plugin-architecture-unification` before every commit.
