# Bootstrap File And Rule Toggles Design

**Spec**: `.specs/features/bootstrap-file-and-rule-toggles/spec.md`
**Status**: Draft

---

## Design Summary

Three things move. The bootstrap contract's authored source (`skills/AGENTS.md`)
gains per-rule markers so a renderer can include or exclude one rule at a time. A new
`packages/shared/src/bootstrap/` module owns the rule registry, the strict state
read/write, the renderer, and a per-host apply engine. `scripts/install-skills.sh`
stops pasting the block into `<host>/AGENTS.md` and instead writes a rendered
`MASSA-AI.md` per host plus that host's own load wiring — a `@MASSA-AI.md` import in
`~/.claude/CLAUDE.md`, an `instructions` entry in the OpenCode config, and a short
pointer block in `AGENTS.md` for Codex and Cursor.

Two defects found during the reuse scan are closed as part of this work rather than
inherited, because both would make an acceptance criterion pass while the behavior it
names is absent. `check_platform` never consults the bootstrap block at all, so
BST-01 AC-10 would pass vacuously; a drift branch is added. And the config write path
destroys a malformed `config.json`, so the state writer never uses `loadConfig`.

---

## Requirements Traceability

| Requirement | Owning component | Sensor |
| --- | --- | --- |
| BST-01 | `render.ts` + `apply_platform` | `test-install-skills-bootstrap-file.sh` |
| BST-02 | `apply_platform` claude branch + `bootstrap_op` | same suite, scenarios 3-4 |
| BST-03 | `apply_platform` opencode branch + `opencode-config.cjs` | same suite + `state_json` reader |
| BST-04 | `render.ts` pointer template | same suite |
| BST-05 | `uninstall_platform` + byte-preserving `bootstrap_op` | round-trip fingerprint assertion |
| BST-06 | `skills/AGENTS.md` edit | renderer suite `rtk` count |
| BST-07 | `rules.ts` + `naming-standards.md` | renderer suite |
| BST-08 | `rules.ts` off-text + `code-annotation.md` | renderer suite, both toggle states |
| BST-09 | `rules.ts` registry + `UnknownRuleError` | registry unit suite |
| BST-10 | `state.ts` + `engine.ts` | registry + engine unit suites |
| BST-11 | both `config-cli.ts` + `skills/bootstrap/SKILL.md` | CLI suites + parity suite |
| BST-12 | generator + `.gitignore` + parity tests | `bun scripts/generate-skill-artifacts.ts --check`, `test:scripts`, `test:plugins` |

---

## Current Codebase Evidence

Files and symbols inspected this session, with the fact each one settled.

| Evidence | Fact established |
| --- | --- |
| `scripts/install-skills.sh:460-530` | `bootstrap_op` takes the target file as `$2` (arbitrary path, `mkdirSync` at `:512`); the block body is hardwired to the global `$BOOTSTRAP_FILE` at `:461`/`:465`. |
| `scripts/install-skills.sh:654`, `:754` | Exactly two `bootstrap_op` call sites: apply and uninstall. |
| `scripts/install-skills.sh:792-899` | `check_platform` contains zero references to `bootstrap_op`, `agents_md`, or `AGENTS`. Bootstrap drift is unchecked today. |
| `scripts/install-skills.sh:486`, `:496` | `replaceBlock` uses `text.trimEnd()`; `removeBlock` ends with `.trim()`. Apply→uninstall is not byte-preserving for a file with leading or trailing blank lines. |
| `scripts/install-skills.sh:200-206` | Skill discovery is dynamic on `skills/<name>/SKILL.md`; a new `skills/bootstrap/` installs with no installer edit. |
| `scripts/install-skills.sh:257-272` | `apply`/`dry-run` iterate only hosts whose binary is on `PATH`; `uninstall`/`check` iterate all requested. |
| `scripts/install-skills.sh:571-579` | The per-host abort shape: `record` an error, `state_replace`, `return 0` — never `exit`. Run-level exit code decided at `:996-1001`. |
| `scripts/lib/opencode-config.cjs:26-44`, `:59-157`, `:172-184` | Three exports: `resolveConfigPath` (`.jsonc` → `.json` → create, `both` flag), `parseJsonc` (throws `not valid JSON: …`), `writeConfig` (backup then re-serialize; no plan mode). |
| `apps/opencode-plugin/install.sh:554-575`, `:488-495` | The array-key precedent in the same config file: push-if-absent, and filter-then-delete-when-empty on uninstall. |
| `apps/opencode-plugin/install.sh:546-551` | JSONC comment loss on write is an already-documented, already-accepted tradeoff, with the backup named as the escape hatch. |
| `packages/shared/src/config/config-loader.ts:99-102` | `loadConfig` catches a parse failure and returns `defaultMassaAiConfig`. |
| `packages/shared/src/config/config-loader.ts:277-278` | `saveConfig` replaces the whole document. |
| `apps/mcp-client/src/config-cli.ts:205-215` | `massa-ai-config set` already composes those two, so a malformed config is already destroyed by the existing command. |
| `apps/mcp-client/src/config-cli.ts:24-31` | Published CLIs may not import `scripts/lib/`; the registry must live in `packages/shared/`. |
| `packages/shared/src/profile-switch/hosts.ts:89-90` | `resolveHostLayout` returns `route: "skip"` for cursor unconditionally — unusable for a feature where Cursor is a first-class target. |
| `scripts/generate-skill-artifacts.ts:138`, `:216-222` | Two hardcoded bundle lists: the emit loop and `managedRootsFor`, the latter driving both `--check` inventory and prune. |
| `scripts/lib/model-profiles.ts:167-314` | The accumulate-then-throw registry validation idiom, and `UnknownProfileError(name, known)`. |
| Claude Code docs, `AGENTS.md` section | "Claude Code reads `CLAUDE.md`, not `AGENTS.md`." Imports resolve relative to the containing file, max four hops. |
| OpenCode config docs, `instructions` | "Relative to the config file directory Or absolute paths starting with `/` or `~`". Same key in the global config. |
| Codex docs | No import directive; `project_doc_fallback_filenames` renames the searched file. |
| Cursor docs | Project-root `AGENTS.md` and `.cursor/rules/`; no user-level global rules path. |

---

## Approach Exploration — where the renderer lives and who invokes it

All three approaches deliver the same scope. The question is only which process
turns source plus state into `MASSA-AI.md`, given two callers with incompatible
constraints: `install-skills.sh` is bash running under `node` **or** `bun` in a repo
checkout, and the toggle CLI is a published npm package with no checkout.

### R1 — TypeScript renderer in `packages/shared`, installer resolves it (RECOMMENDED)

`packages/shared/src/bootstrap/render.ts` is the single implementation. Both CLIs
import it as an ordinary published dependency. `install-skills.sh` invokes it through
a resolution ladder that is keyed on **`command -v bun` directly**, never on
`installer_detect_runner`: that helper returns `node` first whenever node is on
`PATH` (`scripts/lib/installer-shared.sh:25-33`), and node is always present in this
repo as the node-gyp build helper, so a ladder keyed on `$RUNNER` would take the bun
branch on no machine at all.

Ladder, in order: run `scripts/render-bootstrap.ts` under `bun` when `command -v bun`
succeeds; otherwise require the built `packages/shared/dist/bootstrap/render.js`; if
neither is reachable, abort that host with a named error naming `bun run build`.

- **For:** one implementation, no vendoring, no new generated root, no new contract
  test for a mirrored copy. `packages/shared` is already a dependency of both CLIs.
- **Against:** on a machine with neither `bun` nor a build, every host aborts, where
  today `install-skills.sh` needs no build at all. `packages/shared/dist/` is
  gitignored (`.gitignore:8`), only `install.sh:1026` runs `bun run build`, and
  `scripts/install-harness.sh` runs none — so the abort is reachable from a fresh
  clone driven through the harness installer. Mitigation: `install-harness.sh` gains
  the same `bun run build` step, and the abort message names the exact command for
  the current checkout. The failure is loud and named, never a default render.

### R2 — CommonJS renderer in `scripts/lib`, vendored into the plugin bundles

Mirror the `opencode-config.cjs` pattern exactly: `scripts/lib/bootstrap-render.cjs`,
vendored byte-for-byte into `apps/*-plugin/lib/`, `require()`d from the bash heredoc
and imported by both CLIs.

- **For:** no build dependency at all; the proven pattern for a module a bash heredoc
  must reach.
- **Against:** `apps/mcp-client` has no vendored `lib/` today, so this adds a managed
  root, a generator entry, a `.gitignore` entry and a byte-identity contract test
  purely to make one function reachable. `packages/shared` still could not import it
  (published-app rule), so the registry and the renderer would live in different
  packages with a hand-maintained id list across the boundary.

### R3 — Installer renders inline in bash, CLI renders in TypeScript

Rejected. Two implementations of one algorithm, and the divergence would surface as a
`MASSA-AI.md` that differs depending on whether it was written by an install or by a
toggle — invisible until a user compared them.

**Recommendation: R1.** It keeps the registry and the renderer in one module, which is
what makes BST-12 AC-4's id-parity test possible at all, and its one weakness has a
loud named failure rather than a silent wrong render.

---

## Proposed Structure And Ownership

```
packages/shared/src/bootstrap/
  rules.ts        BOOTSTRAP_RULES registry: 9 ids, defaults, order, on/off text keys
  state.ts        strict read of bootstrap.rules, merge with defaults, strict write
  render.ts       source + state -> MASSA-AI.md text; pointer-block template
  engine.ts       applyBootstrapState(): per-host render + write, returns a report
  report.ts       BootstrapRenderResult / BootstrapReport types
  index.ts        barrel

packages/shared/src/config/
  config-loader.ts   + readRawConfigStrict(), writeRawConfig()  (throwing read path)

scripts/
  render-bootstrap.ts        bun entry point for install-skills.sh (R1 ladder)
  install-skills.sh          per-host delivery, migration, uninstall, check branch
  generate-skill-artifacts.ts  + "bootstrap" in both hardcoded lists

skills/
  AGENTS.md         + per-rule markers, - RTK section, + english-code, + code-comments
  bootstrap/SKILL.md  new skill, template skills/profile/SKILL.md

apps/mcp-client/src/config-cli.ts        + case "bootstrap"
apps/opencode-plugin/src/config-cli.ts   + case "bootstrap"
```

### Rule registry

Nine ids, fixed order, rendered in source order:

| id | Source span in `skills/AGENTS.md` | Default |
| --- | --- | --- |
| `caveman` | activation stack entry + its `Skill Summary` bullet | on |
| `massa-ai-router` | activation stack entry, its summary bullet, `## Contract Ownership`, `## Runtime Contract Pointer` (assumption A9) | on |
| `persona-router` | activation stack entry, its summary bullet, `## Persona Router Policy` | on |
| `dedupe-guardrails` | `### Dedupe And Lazy-Load Guardrails` | on |
| `plan-challenge` | `## Plan Challenge Policy` | on |
| `conversation-feedback` | `## Conversation Feedback Policy` | on |
| `indexing-hygiene` | `## Indexing / Context Hygiene` | on |
| `english-code` | new section | on |
| `code-comments` | new section, carries both on-text and off-text | **off** |

Marker shape in the source, nested inside the existing bootstrap pair:

```
<!-- massa-ai:rule:plan-challenge:start -->
…rule body…
<!-- massa-ai:rule:plan-challenge:end -->
```

`code-comments` additionally carries `<!-- massa-ai:rule:code-comments:off -->` …
`<!-- massa-ai:rule:code-comments:off-end -->`, the negative directive rendered when
the rule is disabled. This is the only rule with an off-text, and the reason is
recorded in the spec's assumption A6: `references/code-annotation.md` mandates doc
blocks and rationale comments on its own, so omission alone would leave the reference
winning and the toggle reading as broken.

### Renderer contract

`renderBootstrap({source, state, host, targetHome})` returns `{contract, pointer}`.
`contract` is the `MASSA-AI.md` body: the source with every disabled rule's span
removed, every off-text span for a disabled rule inserted, and every marker comment
stripped. `pointer` is the Codex/Cursor `AGENTS.md` block — a fixed template naming
the absolute `MASSA-AI.md` path, with no policy text of its own (BST-04 AC-7).

Determinism (BST-10 AC-7) comes from iterating `BOOTSTRAP_RULES` in registry order
and never from object key order.

### Per-host delivery

| Host | `MASSA-AI.md` | Load wiring | Migration |
| --- | --- | --- | --- |
| claude | `~/.claude/MASSA-AI.md` | managed block in `~/.claude/CLAUDE.md` containing `@MASSA-AI.md` | remove the block from `~/.claude/AGENTS.md` |
| codex | `$CODEX_HOME/MASSA-AI.md` | pointer block in `$CODEX_HOME/AGENTS.md` | the pointer replaces the full block in place |
| cursor | `~/.cursor/MASSA-AI.md` | pointer block in `~/.cursor/AGENTS.md` | same |
| opencode | `~/.config/opencode/MASSA-AI.md` | absolute path in the `instructions` array | remove the block from `~/.config/opencode/AGENTS.md` |

The Cursor warning at `scripts/install-skills.sh:673-677` stays and is reworded to
name `MASSA-AI.md` — Cursor still reads nothing under `~/.cursor/`, and this feature
does not change that.

### State resolution — who supplies `state` on the installer path

`install-skills.sh` has no awareness of `config.json` today: the only two matches for
a massa-ai config path in that file are `install-state.json` (`:57`, `:174`). Left
unstated, this design has two wrong branches and no right one. If the installer
renders from registry defaults, every `--apply` silently resets every toggle the user
set — and `--apply` runs on every repo install, every `install-harness.sh` run, and
every plugin upgrade. If the installer calls `readRawConfigStrict`, a malformed
`config.json` starts aborting harness installation, a failure mode that does not exist
today.

The contract is therefore explicit and asymmetric: **the strict throwing read belongs
to the write path only.** `scripts/render-bootstrap.ts` resolves state through the same
`resolveBootstrapState`, and a *read* failure degrades to registry defaults **with a
named warning and no write to `config.json`**. The rendered file is still written, so
an unreadable preference never blocks an install; the warning names the file and the
parse error so the cause is not silent.

The `--check` drift branch reads state the same way. Without this, `--check` would
render defaults, report permanent drift on every machine holding a non-default toggle,
and name `--apply` as the remedy — the command that would destroy the toggle.

### Wiring probe — what `written` is allowed to mean

The contract file and the wiring that loads it have two different writers over two
different host populations. `--apply` iterates only hosts whose binary is on `PATH`
(`scripts/install-skills.sh:257-272`); the toggle iterates every host recorded in
`install-state.json`. And no plugin installer has ever written a bootstrap block —
`git grep -n "massa-ai:bootstrap" -- apps/*/install.sh` returns zero hits, and the two
writer sites in the repository are `scripts/install-skills.sh:654` and `:754`. So a
machine recorded as `skillsOwner: "plugin"` has skills, has a state entry, and has
never had the contract or any wiring.

`applyBootstrapState` therefore probes each host's wiring artifact — the `@MASSA-AI.md`
line in `CLAUDE.md`, the pointer block in `AGENTS.md`, or the `instructions` entry —
**before** it is allowed to report `written`. A host whose contract was written but
whose wiring is absent reports `written-not-wired` and names
`scripts/install-skills.sh --apply` as the remedy. Reporting `written` for a host that
cannot load the file is the silent-wrong-state failure this probe exists to prevent.

`check_platform` returns early for a plugin-owned platform
(`scripts/install-skills.sh:792-803`), so the new drift branch is placed after that
guard deliberately, and the plugin-owned case is covered by the toggle's probe rather
than by `--check`.

---

## Code Reuse Analysis

### Existing components to leverage

| Component | Location | How to use |
| --- | --- | --- |
| `bootstrap_op` 4-mode marker engine | `scripts/install-skills.sh:460-530` | Extend: promote the block body to a third positional argument so one engine serves `AGENTS.md`, `CLAUDE.md`, and `MASSA-AI.md`. |
| `BOOTSTRAP_START` / `BOOTSTRAP_END` | `scripts/install-skills.sh:74-75` | Use unchanged; three suites read the literals back out of the source. |
| Duplicate-marker abort | `scripts/install-skills.sh:472-477` | Use unchanged; it is the spec's first edge case verbatim. |
| Foreign-conflict per-host abort shape | `scripts/install-skills.sh:571-579` | Use as pattern for the unparseable-OpenCode-config abort (BST-03 AC-11). |
| `resolveConfigPath` / `parseJsonc` / `writeConfig` | `scripts/lib/opencode-config.cjs:26,59,172` | Use; `writeConfig` extended with a compare-then-skip guard (see Risks R2). |
| Array push-if-absent / filter-then-delete-when-empty | `apps/opencode-plugin/install.sh:554-575`, `:488-495` | Use as pattern for the `instructions` entry and its removal. |
| `installer_host_config_dir` | `scripts/lib/installer-shared.sh:192-200` | Use as the `MASSA-AI.md` destination map. |
| `installer_backup_file`, `installer_resolve_path`, `installer_require_runner`, `installer_consent_gate` | `scripts/lib/installer-shared.sh:52,72,23,557` | Use unchanged. |
| `readInstallState` | `packages/shared/src/profile-switch/state.ts:105` | Use as the source of "which hosts are installed" (assumption A4). |
| `HOSTS` / `isHost` / `type Host` | `packages/shared/src/profile-switch/hosts.ts:16-21` | Use; already imported by both CLIs. |
| `HostSwitchResult` `{host, status, reason?}` convention | `packages/shared/src/profile-switch/report.ts:29-36` | Extend: a sibling `BootstrapRenderResult` in the same file, not a reuse of the profile union. |
| `restartRequired` derivation | `packages/shared/src/profile-switch/report.ts:44`, `engine.ts:505` | Use as pattern for BST-11 AC-5. |
| Accumulate-then-throw registry validation, `UnknownProfileError(name, known)` | `scripts/lib/model-profiles.ts:167-314`, `:115` | Use as pattern; the code itself is unreachable from a published CLI. |
| `SCHEDULER_JOB_KINDS` as-const id list plus its validator | `packages/shared/src/config/massa-ai-config.ts:7-13` | Use as pattern — the in-repo precedent for a fixed id list in `packages/shared` that a validator rejects unknown members against. |
| `writeFileAtomically` | `packages/shared/src/config/config-loader.ts:247` | Use; add it to the barrel, which does not export it today. |
| `skills/profile/SKILL.md` | whole file, 39 lines | Use as template, minus its "prefer MCP when connected" clause (see Risks R7). |
| `scripts/tests/lib/installer-test-helpers.sh` | whole file | Use: `tree_fingerprint`, `make_mock_agents`, `assert_*`, `summary`. |
| `scripts/tests/test-install-skills-{apply,uninstall,check,state}.sh` | whole files | Use as templates; `state_json` read verbatim for the `instructions` assertion. |
| `scripts/__tests__/profile-cli-parity.test.ts` | whole file, 77 lines | Extend: the same `test.each(CLIS)` guard for the `bootstrap` subcommand. |

### Rejected candidates

| Rejected | Location | Why |
| --- | --- | --- |
| `switchProfile` | `packages/shared/src/profile-switch/engine.ts:376` | Generic in shape only; its body is variant-directory copy semantics end to end. |
| `resolveHostLayout` | `packages/shared/src/profile-switch/hosts.ts:84` | Returns `route: "skip"` for cursor unconditionally; Cursor is a first-class target here. |
| `detectRoute` | `packages/shared/src/profile-switch/hosts.ts:163` | Refuses any host with no `installRoute` recorded — a profile-era field that must not block a render. |
| `savePartialConfig` | `packages/shared/src/config/config-writer.ts:422` | Writes a timestamped backup on every call; four rule flips would leave four secret-bearing backups. |
| `loadConfig` on the write path | `packages/shared/src/config/config-loader.ts:65` | Returns defaults on a parse failure, so the write would destroy a malformed file. |
| `is_owned_target` | `scripts/install-skills.sh:549-557` | All three ownership arms key on a skill name under `$root/skills/`; it cannot address a single file. |
| `install-state.json` for rule state | `scripts/install-skills.sh:286-407` | Three sites change together for one new field, and AD-015 scopes that file to installer facts. |

### Evidence-or-zero

No reusable element exists for rendering `MASSA-AI.md`: `git grep MASSA-AI.md` over
`scripts skills apps packages` returns zero hits. No reusable element exists for
listing recorded platforms: `installer_plugin_versions`
(`scripts/lib/installer-shared.sh:490-518`) enumerates only hosts carrying a
`plugin.version` and silently omits a skills-only install.

---

## Data Models

```typescript
/** One switchable rule of the startup contract. */
export interface BootstrapRule {
  readonly id: BootstrapRuleId;
  readonly enabledByDefault: boolean;
  readonly description: string;
}

/** Resolved state: every registry id present, defaults filled in. */
export type BootstrapState = Readonly<Record<BootstrapRuleId, boolean>>;

/** One host's outcome from a render pass. */
export interface BootstrapRenderResult {
  readonly host: Host;
  /**
   * `written-not-wired`: the contract file was written, but this host has no
   * artifact that loads it. Never collapse it into `written` — a host recorded
   * by a plugin install has skills and a state entry and has never had wiring.
   */
  readonly status: "written" | "written-not-wired" | "skipped" | "failed";
  readonly reason?: string;
}

export interface BootstrapReport {
  readonly rows: readonly BootstrapRenderResult[];
  readonly restartRequired: boolean;
  readonly dryRun: boolean;
  readonly ignoredStateKeys: readonly string[];
}

/**
 * Every entry point is explicitly scoped to a home. `install-skills.sh` scopes
 * everything to `TARGET_HOME` and persists state under it
 * (scripts/install-skills.sh:174); an engine that resolved the real
 * `configDir("massa-ai")` internally could not be exercised against a scratch
 * home at all, and the shell suite would have to write the developer's real
 * `~/.claude/`, `~/.cursor/` and OpenCode config on every `bun run test:scripts`.
 */
export interface BootstrapApplyOptions {
  readonly targetHome: string;
  readonly dryRun?: boolean;
}

export function applyBootstrapState(opts: BootstrapApplyOptions): BootstrapReport;
```

Both CLIs expose `--target <dir>` for the same reason, mirroring the installer's
existing flag. An interactive `bootstrap enable|disable` against the real `$HOME` is
**exempt from a consent gate** — the user typed the command naming the mutation, which
is the consent — but `--target` pointing at a path that is not the resolved `$HOME`
requires `--yes`, matching `installer_consent_gate`'s existing contract
(`scripts/install-skills.sh:133`).

Persisted shape in `~/.config/massa-ai/config.json`:

```json
{ "bootstrap": { "rules": { "code-comments": true, "plan-challenge": false } } }
```

Only non-default entries need to be present; `resolveBootstrapState` fills the rest
from the registry. An entry naming an unregistered id lands in `ignoredStateKeys` and
is reported once (BST-10 AC-12), never fatal.

---

## Error Handling Strategy

| Error scenario | Handling | User impact |
| --- | --- | --- |
| Malformed `config.json` | `readRawConfigStrict` throws; nothing is written | Named parse error, exit non-zero, file untouched |
| Unparseable OpenCode config | `parseJsonc` throws; `record` an error for that host and `return 0` | That host reported failed with a reason; sibling hosts still processed; run exits 1 |
| Duplicated or incomplete bootstrap markers | Existing `integration_error`, exit 2 | Whole run stops — deliberate, unchanged |
| Unknown rule id | `UnknownRuleError(id, known)` before any write | Exit non-zero naming the id and listing the nine valid ones |
| `~/.claude/CLAUDE.md` is a symlink pointing outside the target home | Abort that host with a named error | That host reported failed; nothing written through the link |
| No host recorded as installed | Empty report, exit 0 | "no host installed" message, no file written |
| Renderer unreachable (node-only, no build) | Abort that host with a named error naming `bun run build` | Loud, never a partial or default render |

---

## Verification Design

| Requirement class | Deterministic sensor | Must be observed red first |
| --- | --- | --- |
| Per-host delivery shape | `scripts/tests/test-install-skills-bootstrap-file.sh` against `--target` scratch home | yes |
| Byte-identical uninstall | `tree_fingerprint` before apply and after uninstall, with a fixture that has leading and trailing blank lines | **yes — this fails today** |
| `--check` drift on the bootstrap surface | new branch in `check_platform`, exercised by mutating a written `MASSA-AI.md` | **yes — `--check` is blind today** |
| Registry, defaults, determinism, unknown id | `packages/shared/src/bootstrap/__tests__/` | yes |
| `code-comments` off-text and untouched §3 | renderer suite asserting both toggle states | yes |
| `rtk` absent from source and render | count assertion in the renderer suite | yes |
| CLI subcommand in both CLIs | `config-cli-bootstrap.test.ts` in each app, plus an extended `profile-cli-parity.test.ts` | yes |
| Skill bundle in all four hosts | `bun scripts/generate-skill-artifacts.ts --check` — **not** `bun run generate:artifacts --check` | yes |
| Registry ids vs the skill's documented ids | new parity assertion, template `skills-harness-integrity.test.ts:272-286` | yes |
| `--check` and `--dry-run` write nothing, against deliberate drift | `tree_fingerprint` before and after, plus an assertion that no `*.massa-ai.bak-*` appeared | **yes — the OpenCode path writes today** |
| `--apply` after a toggle preserves the toggle | apply, disable one rule, apply again, assert the rule is still absent and `--check` exits 0 | yes |
| A host recorded in state whose wiring is absent | shell-suite scenario seeding `install-state.json` with a host that has no wiring artifact; assert `written-not-wired` | yes |
| Uninstall leaves no 0-byte residue | round-trip fixture including a host directory that did not exist pre-install | yes |

**The gate command matters more than the gate.** `"generate:artifacts"` is
`"bun scripts/generate-skill-artifacts.ts && bun scripts/generate-subagent-artifacts.ts"`
(`package.json:31`), so `bun run generate:artifacts --check` appends the flag to the end
of the chain: only the *second* generator sees it, the first runs in write mode and
**repairs** the drift it was supposed to report, and a follow-up manual check then also
passes. CI already uses the direct form (`.github/workflows/ci.yml:238`);
`scripts/worktree-verify.sh:286` uses the broken one. Fixing `package.json:31` to forward
arguments to both generators is a repo-wide change and is recorded as a follow-up
finding, not absorbed here.

**Frozen fingerprint exclusion list.** `tree_fingerprint` hashes `find "$root"` output
including every path (`scripts/tests/lib/installer-test-helpers.sh:67-79`), so
timestamped backups make it non-deterministic. The exclusion list is frozen here, before
implementation, so that widening it later is visible as a spec change rather than a test
edit: `*.massa-ai.bak-*` only. Nothing else may be excluded. Every other post-uninstall
difference is a defect to fix in the subject, not in the sensor.

The final gate is an independent `massa-ai-verification-agent` pass with its
discrimination sensor; this table is the author's claim, not the verdict.

---

## Risks & Concerns

| Concern | Location (file:line) | Impact | Mitigation |
| --- | --- | --- | --- |
| `--check` never consults the bootstrap block, so BST-01 AC-10 passes vacuously against today's code | `scripts/install-skills.sh:792-899` | A drift sensor that is green before the feature exists proves nothing | Add a bootstrap-surface branch to `check_platform`; write the sensor first and observe it red by mutating a written `MASSA-AI.md` |
| `bootstrap_op` is not byte-preserving: `removeBlock` ends `.trim()`, the append path uses `.trimEnd()` | `scripts/install-skills.sh:486`, `:496` | BST-05 AC-9 and the byte-identical success criterion are stricter than the engine; existing fixtures are pre-trimmed so the suite cannot see it | Make both paths preserve the surrounding text exactly; add a fixture with leading and trailing blank lines and observe it red first |
| `loadConfig` returns defaults on a parse failure and `saveConfig` replaces the whole document | `packages/shared/src/config/config-loader.ts:99-102`, `:277-278` | A toggle over a malformed `config.json` would overwrite it with defaults, destroying `security.apiKey` and `database.url` | New `readRawConfigStrict` that throws; the toggle path never calls `loadConfig`. The identical pre-existing defect in `massa-ai-config set` (`apps/mcp-client/src/config-cli.ts:205-215`) is recorded as a follow-up finding, not silently fixed inside this feature |
| `writeConfig` always writes and always backs up, with no plan mode | `scripts/lib/opencode-config.cjs:172-184` | `--dry-run` would write, `--check`'s fingerprint would differ, and every re-apply would leave a new `.massa-ai.bak-<ts>` | Compute the desired document, compare against the parsed original, skip the write on equality |
| A `.jsonc` user loses every comment the first time this feature touches the OpenCode config | `scripts/lib/opencode-config.cjs:172-184` | Comment loss in a user-authored file | Not a new class: already documented and accepted at `apps/opencode-plugin/install.sh:546-551`, with the backup as the escape hatch. The message names the backup path, matching that precedent |
| The `instructions` entry is a bare string and cannot carry an ownership marker | `apps/opencode-plugin/install.sh:491` (the analogous case) | A user who moves their home, or installs under a different `--target`, leaves an orphan entry uninstall will not remove | Match on the exact absolute path, and state the limitation in the uninstall report rather than silently leaving it |
| Copying `skills/profile/SKILL.md`'s "prefer MCP when connected" clause would instruct the agent to call a `bootstrap_*` MCP tool that does not exist | `skills/profile/SKILL.md:23` | Direct conflict with BST-11.5, which requires the CLI to work when MCP is unreachable | The new skill names the CLI as its only front; an assertion in the skill-integrity suite forbids an MCP-tool reference in `skills/bootstrap/SKILL.md` |
| `generate-skill-artifacts.ts` has two hardcoded lists and only one drives `--check` | `scripts/generate-skill-artifacts.ts:138`, `:216-222` | Adding the bundle at `:138` alone makes emit work while `--check` never inspects the subtree, so BST-12 AC-1 passes vacuously and prune leaves stale files forever | Edit both sites plus `.gitignore:79-82` in the same task, and assert the `--check` failure by touching a file in the new bundle |
| `test:plugins` is a second runner wired only into the CI build job | root `package.json` scripts | A bootstrap-skill bundle contract can stay green through every `test:scripts` gate and redden later at the build gate | Run `bun run test:plugins` explicitly in the task's gate, not only `test:scripts` |
| `apply` iterates only hosts whose binary is on `PATH`; `uninstall` iterates all | `scripts/install-skills.sh:257-272` | A `MASSA-AI.md` is never written for an absent host but is looked for on uninstall; the suites dodge this with `make_mock_agents` | Keep the asymmetry (it is pre-existing and correct) and assert the uninstall path tolerates an absent file |
| `check` is redefined as an installer runner in one existing suite | `scripts/tests/test-install-skills-check.sh:33` | A new assertion using `check` in that file would silently invoke the installer | Name the new suite's runner `run_check` |
| The two CLIs are about 92% identical with no shared module; the existing parity test covers only `--help` and argument validation | `apps/mcp-client/src/config-cli.ts`, `apps/opencode-plugin/src/config-cli.ts`, `scripts/__tests__/profile-cli-parity.test.ts` | A `bootstrap enable` that persists in one CLI and not the other would not redden | Put the formatters in `packages/shared/src/bootstrap/` so both CLIs call one implementation, and extend the parity test to assert the subcommand surface |
| `writeFileAtomically` is not exported from either barrel | `packages/shared/src/config/config-loader.ts:247`; absent from `config/index.ts` and `packages/shared/src/index.ts` | The strict write path cannot reach it from a published CLI | Add the one barrel export |
| Cursor still reads nothing under `~/.cursor/` | `scripts/install-skills.sh:673-677` | The contract reaches no Cursor session unless the user pastes it into Settings → Rules | Out of scope per the spec; the existing warning stays and is reworded to name `MASSA-AI.md` |
| `--check` and `--dry-run` skip the consent gate by design, and the only OpenCode write path they reach is equality-guarded, not planned | `scripts/install-skills.sh:132-134`; `scripts/lib/opencode-config.cjs:172-183` | Against a config whose `instructions` array lacks the entry — exactly the drift `--check` exists to find — `--check` rewrites the user's config, strips JSONC comments and drops a backup, without consent | A compare-then-skip guard is not a plan mode. `writeConfig` gains the same four-mode contract `bootstrap_op` has (`plan`/`apply`/`remove-plan`/`remove-apply`), with **no filesystem contact** in either plan mode. Sensor: `--check` against a scratch home with deliberate drift asserts an unchanged fingerprint and no new backup |
| A lock-free whole-document rewrite of `config.json` loses a concurrent write | `packages/shared/src/config/config-loader.ts:247-269` (atomicity, not lost-update); the file's own SEC-01 docblock | A server auto-provisioning `security.apiKey` while a toggle is in flight loses the key with no recovery copy, because `savePartialConfig`'s backup was deliberately rejected. Under AD-011 every API request then 401s with no diagnostic | The write is a surgical merge of the `bootstrap` subtree only, guarded by compare-and-swap on the bytes read before the mutation: re-read before writing, and if the file changed, re-apply the subtree onto the new document once, then fail loudly rather than clobber. Accepted risk is not available — the asset is a secret with no second copy |
| `bootstrap_op` has no delete mode, and for `MASSA-AI.md` the block **is** the whole file | `scripts/install-skills.sh:494-499`, `:527` | `removeBlock` returns `""` and the caller writes it, so `--uninstall` leaves a 0-byte `MASSA-AI.md` on all four hosts, contradicting BST-05 AC-9 and reddening the round-trip fingerprint | Add a fifth mode that unlinks the target when the removal result is empty and the target is a massa-ai-owned whole-file artifact. Same treatment for a `CLAUDE.md` or `opencode.jsonc` this installer created whose managed block was its only content |
| `--apply` overwrites a hand-edited `MASSA-AI.md` with no backup and no warning | `scripts/install-skills.sh:513` | A user who edits the rendered contract loses the edit silently, and the new `--check` branch reports it as drift with `--apply` as the remedy | Call `installer_backup_file` before any `MASSA-AI.md` overwrite where `current !== desired`. Note the helper has **zero production call sites** today (`git grep installer_backup_file` returns its own definition plus prose mentions only), so this is a new call site to write, not an existing one to reuse |
| The spec's symlink rule is inverted, has no home in the engine, and contradicts a comment in the same file | `spec.md` symlink edge case; `scripts/install-skills.sh:513`, `:527`, `:549-557` | The common real case, `~/.claude/CLAUDE.md → ~/dotfiles/…`, resolves *inside* the home, so the rule permits writing into a git-tracked dotfiles repo and later deleting lines from it; the rare harmless out-of-home case is blocked. `bootstrap_op` contains no symlink check at all, and `is_owned_target`'s comment asserts the opposite policy ("a symlink is always ours to replace") | Invert the predicate: refuse write-through on **any** symlink unless the resolved target is already recorded as massa-ai-owned. Put the check inside `bootstrap_op`, the single engine, not in the caller. Reconcile or scope the `is_owned_target` comment in the same change |
| `bootstrap_op` writes with `fs.writeFileSync`, which truncates in place | `scripts/install-skills.sh:513`, `:527` | A kill or ENOSPC mid-write leaves `~/.claude/CLAUDE.md` — the file with the most user-authored content — holding a start marker and no end marker. The next run hits `starts !== ends`, exits 2, and **stops the whole run for every host**, unrecoverable without hand-editing | Write through a temp file plus rename, the discipline `writeFileAtomically` already applies to `config.json` |
| `applyBootstrapState()` had no `targetHome`, so the spec's own independent test was unrunnable against a scratch home | `scripts/install-skills.sh:174`; `packages/shared/src/config/config-loader.ts:8` | The path of least resistance for an implementer is to run the suite against the real home, at which point `bun run test:scripts` writes `~/.claude/MASSA-AI.md` and mutates the real OpenCode config on every run | `targetHome` is an explicit option on the engine and a `--target` flag on both CLIs; `readInstallState` already accepts a path and `defaultStatePath(targetHome)` already exists |
| The contract file and its wiring have two writers over two different host populations | `scripts/install-skills.sh:257-272` vs `spec.md` BST-10 AC-10; `scripts/install-skills.sh:654`, `:754`; zero hits for a bootstrap write in any `apps/*/install.sh` | A plugin-only install reports `written` for a host that has no wiring and never loads the file, so the toggle looks broken while the file on disk looks right | The wiring probe and the `written-not-wired` status, specified above |
| The installer had no defined access to the persisted rule state | `scripts/install-skills.sh:174` (only `install-state.json` appears in that file) | Rendering from defaults makes every `--apply` reset every toggle; reading strictly makes a malformed `config.json` abort harness installation | The asymmetric contract specified above: strict throwing read on the write path, degrade-to-defaults-with-a-named-warning on the render path |
| The named BST-12 gate command cannot fail and silently repairs the drift it should report | `package.json:31`; `.github/workflows/ci.yml:238`; `scripts/worktree-verify.sh:286` | `bun run generate:artifacts --check` reaches only the second generator; the first regenerates the bundle, so the gate is green by construction and a follow-up check also passes | Use `bun scripts/generate-skill-artifacts.ts --check` in the task gate and observe it red by touching a file in the new bundle. Fixing the `package.json` script to forward arguments is recorded as a follow-up finding |
| The R1 ladder was keyed on a runner detector that prefers node | `scripts/lib/installer-shared.sh:25-33`; `scripts/install-skills.sh:136`; `.gitignore:8` | Node is always present here as the node-gyp helper, so the bun branch would be dead and the gitignored `packages/shared/dist` would be an unconditional requirement — every host aborts from a fresh clone driven through `install-harness.sh`, which runs no build | Key the ladder on `command -v bun`; add `bun run build` to `install-harness.sh`; make the abort message name the exact command |
| The recovery path for a disabled `massa-ai-router` may not exist on the machine, and could be deleted by the rule it recovers | `scripts/setup-local-first.sh:571`; `install.sh:828`; the A9 fold of `Contract Ownership` into the `massa-ai-router` span | If the recovery sentence lives inside a rule span, disabling that rule deletes the instructions for undoing it; and `massa-ai-config` is not put on `PATH` by any installer here | `render.ts` emits an **always-rendered header region**, outside every rule span, carrying the recovery command and the state file path in every toggle state. The all-off render asserts its presence. The command is written in the form that works without a global bin |

---

## Tech Decisions (only non-obvious ones)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Renderer placement | R1 — one TypeScript implementation in `packages/shared/src/bootstrap/render.ts`, reached by the installer through a bun-source then dist ladder | Keeps the registry and the renderer in one module, which is what makes the id-parity test possible; R2's vendoring would split them across a package boundary the published apps cannot cross |
| Toggle state location | `~/.config/massa-ai/config.json` under `bootstrap.rules` | AD-015 scopes `install-state.json` to installer facts, and its TSV reader requires three coordinated edits per new field. The state here is a user preference that must survive an uninstall |
| Config write path | New `readRawConfigStrict` + `writeRawConfig`, never `loadConfig` + `saveConfig` | `loadConfig` returns defaults on a parse failure, so the composed pair destroys a malformed file. The raw path also avoids inflating the user's document from 3 to 18 top-level keys |
| Disabled-rule rendering | Omit the span, except `code-comments`, which renders an explicit negative directive | `references/code-annotation.md` mandates comments independently; omission alone would leave the reference winning |
| English rule ownership | `naming-standards.md` stays normative for identifier naming; the `english-code` bootstrap rule is normative for the wider class of all generated code and comments; each cites the other | Conforms to AD-019's one-normative-reference discipline while keeping the bootstrap actionable standalone, since references are lazy-loaded and `MASSA-AI.md` is not |
| Command vehicle | A skill (`skills/bootstrap/`), not a generated workflow command | AD-018 restricts generated command bodies to explicit-route dispatch into the massa-ai router; a toggle command would be a second path |
| MCP front | Not built | BST-11 requires the CLI and the skill only; an MCP tool would mean touching the documented three places, and BST-11.5 requires the surface to work with MCP unreachable |
| Ownership proof for `MASSA-AI.md` | The file's own `<!-- massa-ai:bootstrap:start -->` pair, not a sidecar marker file | Self-describing and already the contract in BST-01 AC-2; the per-skill marker scheme keys on a name under `skills/` and cannot address a single file |
| Concurrent toggles | Compare-and-swap on the pre-read bytes, with a surgical `bootstrap`-subtree merge; one re-apply, then fail loudly | The spec's original "last writer wins" was written before the reuse scan showed that `config.json` holds `security.apiKey` and `database.url` and that no backup survives the rejection of `savePartialConfig`. A lost update there is an unrecoverable secret loss, not a stale preference. This supersedes the spec's final edge-case bullet, and the spec is amended with the reason rather than left contradicting the design |
| `writeConfig` plan mode | A real four-mode contract mirroring `bootstrap_op`, with no filesystem contact in `plan`/`remove-plan` | An equality-only skip satisfies `--dry-run` exactly in the state where `--dry-run` is uninteresting, and writes in the state it exists for |
| Symlink policy for the managed instruction files | Refuse write-through on any symlink whose resolved target is not already recorded as massa-ai-owned; the check lives inside `bootstrap_op` | The in-home dotfiles symlink is the common case and the damaging one; a predicate keyed on "target inside the home" permits exactly it |
| Uninstall residue | Unlink, never write an empty file, for a whole-file artifact or an installer-created wiring file whose managed block was its only content | `removeBlock` returning `""` through `writeFileSync` is how a 0-byte `MASSA-AI.md` would be left on all four hosts |
| Engine scoping | Explicit `targetHome` on the engine and `--target` on both CLIs | Without it the spec's own independent test can only be made to pass by writing the developer's real `$HOME` on every `bun run test:scripts` |
| Consent for an interactive toggle | Exempt against the resolved `$HOME`; `--yes` required when `--target` names another path | The typed command naming the mutation is the consent; a redirected target is the case `installer_consent_gate` already exists for |
| Recovery text placement | An always-rendered header region outside every rule span | A recovery line inside a rule span is deleted by disabling that rule |

> **Project-level decisions:** none of the above sets a new project-wide convention.
> The closest candidate, the strict config read path, is recorded here as a
> feature-local choice and proposed as a follow-up finding for the pre-existing
> `massa-ai-config set` defect rather than a superseding `AD-NNN`.

---

## Artifact-Store Evidence

- **Active artifact key:** `.specs/features/bootstrap-file-and-rule-toggles/design.md`
- **Version:** 1 (initial write)
- **Checksum:** recorded in the Design completion report after write (`shasum -a 256`).
