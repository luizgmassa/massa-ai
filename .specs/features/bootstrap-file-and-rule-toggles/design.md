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
| BST-12 | generator + `.gitignore` + parity tests | `generate:artifacts --check`, `test:scripts`, `test:plugins` |

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
a small resolution ladder: run `scripts/render-bootstrap.ts` under `bun` when the
detected runner is `bun`; otherwise require the built
`packages/shared/dist/bootstrap/render.js`; if neither is reachable, abort that host
with a named error telling the user to run `bun run build`.

- **For:** one implementation, no vendoring, no new generated root, no new contract
  test for a mirrored copy. `packages/shared` is already a dependency of both CLIs.
- **Against:** a checkout with only `node` on `PATH` and no build must build first.
  The failure is loud and named, not silent.

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
  readonly status: "written" | "skipped" | "failed";
  readonly reason?: string;
}

export interface BootstrapReport {
  readonly rows: readonly BootstrapRenderResult[];
  readonly restartRequired: boolean;
  readonly dryRun: boolean;
  readonly ignoredStateKeys: readonly string[];
}
```

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
| Skill bundle in all four hosts | `bun run generate:artifacts --check` plus `skill-artifact-parity.test.ts` | yes |
| Registry ids vs the skill's documented ids | new parity assertion, template `skills-harness-integrity.test.ts:272-286` | yes |

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
| Concurrent toggles | Last writer wins; no lock | The spec chose it, and `acquireLock` derives its lock directory name from the state path, which would produce a misleading `config.json.switch.lock` |

> **Project-level decisions:** none of the above sets a new project-wide convention.
> The closest candidate, the strict config read path, is recorded here as a
> feature-local choice and proposed as a follow-up finding for the pre-existing
> `massa-ai-config set` defect rather than a superseding `AD-NNN`.

---

## Artifact-Store Evidence

- **Active artifact key:** `.specs/features/bootstrap-file-and-rule-toggles/design.md`
- **Version:** 1 (initial write)
- **Checksum:** recorded in the Design completion report after write (`shasum -a 256`).
