# Bootstrap File And Rule Toggles Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `massa-ai` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/bootstrap-file-and-rule-toggles/design.md`
**Spec**: `.specs/features/bootstrap-file-and-rule-toggles/spec.md`
**Status**: In Progress

## Execution Log

| Phase | Tasks | Status | Commits | Notes |
| --- | --- | --- | --- | --- |
| 1 | T1, T2 | Complete | `0491fcb3`, `46fa6d8a`, `4b63251f`, `2582cc8d` | Two extra commits beyond the two planned tasks. Orchestrator review found a defect the planned sensor could not see: the activation stack named all three of `caveman`, `massa-ai` and `persona-router` from outside every rule span, so a disabled rule's section vanished while the contract still instructed the agent to activate it — the same class the design solved for `code-comments` with an off-text, never generalized. `4b63251f` widened the sensor and was observed red (`idLeaks` returned `["caveman", "persona-router"]`); `2582cc8d` rewrote the intro to enumerate nothing. The sensor is deliberately scoped to the residue outside *every* span rather than per-rule, because distinguishing a load-bearing cross-rule instruction from incidental same-domain prose is not mechanically expressible from the markup; that narrowing is documented inline in the test. |
| 2 | T3, T4 | Complete | `1eebd587`, `aeca60dd`, `a3ba8a6e` | One extra commit. Adding `bootstrap` to `MassaAiConfig` fired two pre-existing enforced contracts the design had not surfaced: `apps/web-ui/src/static/views/config-sections.ts` declares its section map as a mapped type over every `ConfigSectionKey`, and `installer-config-template.test.ts` requires a matching installer-template entry. What shipped is one read-only `json` field, not a per-rule toggle UI — recorded as spec assumption A12 with the reason, and the out-of-scope row narrowed to "a Web UI **toggle** surface" rather than left contradicting the artifact. Both-directions evidence for T3 is structural, not just a differing return value: `loadConfig` is proven to reach its catch-and-degrade branch via a `console.error` spy that actually fires, while `readRawConfigStrict` on the identical malformed file throws `ConfigParseError` and never calls it. Measured independently: `packages/shared` 281 pass / 0 fail across 15 files. |
| 3 | T5, T6 | Complete | `ca526646`, `5bd748cb` | Two commits, one per task. T5 widened `ignoredStateKeys` beyond the one member BST-10 AC-12 names: a known id holding a non-boolean value falls back to its default and is named there, as does a `bootstrap`/`bootstrap.rules` value that is not a plain object. `BootstrapReport` carries no second channel for either, and coercing `"false"` or `0` would disable rules the user never disabled. T6 had to decide blank-line handling, which no artifact specified — the source spaces spans inconsistently (`skills/AGENTS.md:48-49` adjacent, `:112-114` separated), so a rule's rendered whitespace would otherwise depend on its neighbours' states; runs collapse and one blank line precedes each heading, fence-aware so the four fenced policy blocks pass through byte-for-byte. Both tasks were re-measured by the parent rather than taken from the implementing agent's report: `packages/shared` 740 pass / 0 fail across 33 files, oxlint exit 0, and the rendered output inspected directly (0 surviving markers, 0 `rtk`, 7-line pointer, all-off header carrying the recovery command). 15 discrimination mutations across the two tasks, all killed; both restored from `/tmp` copies and hash-verified, because `git checkout` on an untracked new file deletes it rather than restoring it. |
| 4 | T7, T8 | Complete | `0316ad84`, `0a0ceb78` | Two commits, one per task, both implemented by a delegated builder and re-measured by the parent rather than taken from its report. Four additions beyond the literal task text, each because the stated contract made a required behavior unreachable: `buildBootstrapReport` (T7), because "restartRequired is true only for a non-dry-run with at least one written row" is otherwise a comment on a field and any test of it would assert its own construction; and `source?`/`sourcePath?`/`onWarning?` (T8), because `{targetHome, dryRun?}` cannot reach the marked-up source at all and `BootstrapReport` has no warnings channel for AC-10b. `skipped` had no defined trigger and now means a byte-identical re-apply whose wiring is present. **`defaultStatePath` does not exist where `design.md:455` says it does** — it is private and duplicated at `profile-switch/engine.ts:60` and `variant-sync.ts:70`, exported from neither, verified absent from `state.ts`; the path is derived from `path.dirname(bootstrapStateFilePath(targetHome))` instead. Gates: `packages/shared` 815 pass / 0 fail across 35 files, oxlint exit 0, and the real home verified untouched by hand (no `MASSA-AI.md` under `~/.claude`, `~/.codex`, `~/.cursor`, `~/.config/opencode`; `~/.config/massa-ai/config.json` still at its 2026-08-18 mtime). 16 discrimination mutations across the two tasks, all killed, all anchor-counted before replacement, all restored from `/tmp` copies and hash-verified. |
| 5 | T9, T10, T11 | Complete | `f9d8bbea`, `c0599829`, `34158aa5`, `efe9876c`, `fed7becb` | Five commits for three tasks. T9 is committed **red on purpose** (22 passed / 39 failed) — a green red-first sensor would mean it asserts what the installer already does. It immediately found a defect in already-merged code: `MASSA-AI.md` had two writers disagreeing byte-for-byte, `engine.ts:310` writing the raw body while `bootstrap_op` writes the marker pair, breaking `spec.md:96`, `design.md:475` (the pair *is* the ownership proof) and `spec.md:118`. Fixed in `c0599829` by wrapping at the writer, verified against the installer's own extract/plan heredocs sliced verbatim out of `install-skills.sh`; the pre-fix state made `extract` exit 2, "Bootstrap block not found". The engine fix is one variable, not one call site — `document` feeds both the write and the up-to-date comparison, and fixing only the write would have made every host report `written` on an unchanged pass. T10 took the sensor to 26/35 and scoped rather than inverted `is_owned_target`'s symlink comment (different subjects: `rm -rf` of a node under `skills/` versus write-through into a file's bytes). Two of T10's five behaviours had **no committed sensor** — the symlink refusal and temp-file atomicity survived the whole suite untouched — closed in `efe9876c`, +16 assertions, 121 insertions and 0 deletions, sensor 42/35 with the failed count unmoved. T11's plan mode senses **absence of an fs call**, not absence of a change: a read-only compare-then-skip leaves bytes identical and passes a bytes-after sensor, so the test wraps all 96 writable function properties of the `fs` namespace with a delegating counter. Two design clauses could not be implemented literally and are commented at their call sites: `design.md:449` (`writeConfig` itself gaining the mode contract — impossible, a zero-contact plan needs the current document and both live call sites pass only the desired one) and `design.md:272` (the superseded compare-then-skip, overturned by `:449` and `:477`). 25 mutations across the three tasks, all killed. Gates: artifact drift `--check` exit 0 under a scratch `XDG_CONFIG_HOME`, mirror byte-identical, oxlint 0, installer siblings rc=0. **`bun run test:scripts` cannot reach any `.sh` suite** — `package.json:38` chains `bun test … && for f in …`, and two pre-existing `pyts golden: lessons` failures abort the bun phase first, so the whole shell battery is unreachable through the documented command and was run directly. |
| 6 | T12, T13 | Complete | `4e641c1a`, `392082d4` | Two commits, one per task. **PC-B1 was real and wider than stated**: the bootstrap module had no export surface at all, and none of the six suites could see it because every one of them imports relatively while the shell suite imports the absolute source path. The barrel and the root re-export land in T12; `ConfigParseError` is re-exported from the bootstrap barrel because `setBootstrapRuleEnabled` throws it, and omitted from the root re-export because the config block already exports it there. Two facts were measured that no artifact recorded. **The dist branch of the R1 ladder does not load under node**: `packages/shared/src/bootstrap/{state,render,engine}.ts` import their siblings with extensionless relative specifiers, so `node -e "import('dist/bootstrap/index.js')"` fails `ERR_MODULE_NOT_FOUND` on `dist/config/config-loader` — repointing them spans five modules outside this phase's write set, so `loadBootstrapApi` turns the failure into a named `BootstrapRendererUnloadableError` instead of a raw resolution stack, and T15's `bun run build` step will not by itself make a node-only machine work. **`appendBlock`'s blank separator line was not invertible**: no rule distinguishes our separator from a blank line the user already had, and the migration fixture is exactly that shape, so `removeBlock`'s `before.endsWith("\n\n")` trim ate one user byte — the separator is dropped and the pair is now exactly invertible, verified in both directions. Sensor movement 42/35 → **76 passed / 1 failed**; the last assertion is unsatisfiable by construction and is reported above rather than edited, together with seven sibling-suite assertions that BST-05 AC-8 supersedes. Gates re-measured by the implementer: `test:scripts` 1873/2 across 83 files (the two documented pre-existing cases, no third failure), `test:plugins` 142/0, artifact `--check` exit 0 under a scratch `XDG_CONFIG_HOME`, oxlint 0, `bash -n` 0, siblings uninstall 16/0, state 21/0, check 23/0. Six discrimination mutations across the two tasks, all killed, all restored from `/tmp` copies and hash-verified. Real home verified untouched by hand: no `MASSA-AI.md` under `~/.claude`, `~/.codex`, `~/.cursor`, `~/.config/opencode`; `~/.claude/CLAUDE.md` still 19 bytes at its 2026-07-26 mtime with zero massa-ai markers; `~/.config/massa-ai/config.json` still at 2026-08-18. **Two macOS-only measurement traps**: `TMPDIR` ends in `/` here, so `mktemp -d` yields a `T//` path that `path.join` normalizes and two BST-04 pointer assertions compare literally — run this suite with `TMPDIR=/tmp` or read CI; and a real `claude` binary beside `node` in `~/.local/bin` defeats `test-install-skills-cli.sh`'s empty-PATH premise at baseline. |
| 6 | T13a | Complete | `f38fd2cc` | One commit. Added after T13, by user ruling. Seven committed sibling assertions sense the `AGENTS.md` shape BST-05 AC-8 retires, and `bootstrap-file.sh:385` expected a status unreachable in its own scenario; neither was owned by any task. All eight were rewritten, none deleted, and **every suite's total assertion count is unchanged** — apply 31, cli 42, bootstrap-file 77 — because each rewritten slot was made to carry both directions rather than adding a slot: `apply.sh:68` and `:105` are the retired-path-has-zero-effect half for claude, and `cli.sh:127`/`:133` compose both halves into one exact `"1/0"` value per host. That keeps the `>= baseline` constraint and the literal `31/0`, `40/2`, `77/0` targets true at the same time, which a rewrite that only asserted the new path could not have done. Two facts were measured rather than assumed. **`written` is unreachable at `bootstrap-file.sh:396` for the reason T13a states, confirmed by running the engine directly**: before `--apply` the scratch host reports `written-not-wired`, after it `skipped` with reason "already up to date" — so `skipped` still carries the scenario's wiring claim, because an unwired host reports `written-not-wired` (`:380`). A two-dialect sweep (`git grep -P`, `grep -E`) confirms the shell battery now asserts exactly 3 status literals, 1 `skipped` and 2 `written-not-wired`, and no bare `written`; the `written` path stays covered one layer down at `engine.test.ts:422-431`. The apply suite gained a local sed-based `managed_block` helper so its import assertions sit **inside** the marker pair rather than anywhere in the file, and the cli suite reads the OpenCode config through the installer's own `resolveConfigPath`/`parseJsonc` rather than guessing between `opencode.json` and `opencode.jsonc` — the installer writes the latter. Gates re-measured: `test:scripts` 1873/2 across 83 files (the two documented pre-existing `pyts golden: lessons` cases, no third failure), `test:plugins` 142/0, and every shell suite run directly with `TMPDIR=/tmp` — apply 31/0, cli 40/2, bootstrap-file 77/0, check 23/0, uninstall 16/0, state 21/0. The 2 residual `cli` failures are the pre-existing environment case (a real `claude` binary in `~/.local/bin` defeats that suite's empty-PATH premise) and were left untouched. Five discrimination mutations, all killed, all in `install-skills.sh` and all restored from a `/tmp` copy and hash-verified — `git checkout` was never used. The mutation set is what proves the both-directions half is load-bearing: M1 (claude wiring retargeted to `AGENTS.md`) kills only the delivered-path assertions, because the migration op that follows it removes the block it just wrote; M2 (claude's legacy migration replaced by a write) kills only the retired-path assertions. Either half alone would have left one of the two blind. Real home verified untouched: no `MASSA-AI.md` under `~/.claude`, `~/.codex`, `~/.cursor` or `~/.config/opencode`, `~/.claude/CLAUDE.md` still 19 bytes with zero massa-ai markers, `~/.config/massa-ai/config.json` unmodified. |
| 7 | T14, T15, T15a | Complete | `3fc5e8c8`, `1ff1ba94`, `6f4e4a55` | Three commits, one per task. **Every `install-skills.sh` line citation in these three task bodies was stale**, including ones a previous Plan Challenge pass had "corrected"; all were re-measured by content before any edit and the anchors are recorded in T14. Two premises stated in the tasks were verified rather than assumed and both held: `check_platform` referenced `bootstrap_op` zero times (so BST-01 AC-10 passed vacuously), and `install-harness.sh` contained zero occurrences of `bun run build`. **Three sensors were added beyond the literal task text, each because a mutation proved the shipped line was otherwise unguarded**: T14's `drift_count` accumulation feeds only the quiet summary while the exit code is derived independently from `RESULTS_FILE`, so deleting it left every other assertion green; T15's renderer-source precondition was added on a *false* premise (that it protected the three shadow-tree suites — removing it left them 34/0 and 13/0) and turned out to be load-bearing for a different, measured reason (an unguarded step in such a tree emits `error: Script not found "build"` and exits 1); T15a's `record` call was invisible behind `vinfo` under `--verbose`, and its empty-line guard was invisible to a path-substring assertion. **One measurement defect caught in my own test rather than in the subject**: `install-harness.sh` has no `--repo-root` flag, so the first draft of scenario 13 exited 2 at the unknown-flag branch and three assertions passed vacuously — found by reading the pre-change red (it showed the contract file missing, which absence of a build step cannot cause), not the post-change green. 14 mutations across the three tasks, 14 killed after the added sensors, 3 having survived their first run; all restored from `/tmp` copies and hash-verified, `git checkout` never used. Suites re-measured with `TMPDIR=/tmp`: `bootstrap-file` 77 → **108/0**, `uninstall` 16 → **25/0**, `apply` 31/0, `cli` 40/2, `check` 23/0, `state` 21/0. Two `--check` suites outside the briefed baseline were also re-measured and are unmoved: `stale-apply` 25/0 and `check-double-surface` 14/0. Gates: `test:scripts` 1873/2 across 83 files (the two documented pre-existing `pyts golden: lessons` cases, no third failure), `test:plugins` 142/0, artifact `--check` exit 0 under a scratch `XDG_CONFIG_HOME`, `bash -n` 0 on both installers. Real home verified untouched: no `MASSA-AI.md` under `~/.claude`, `~/.codex`, `~/.cursor` or `~/.config/opencode`; `~/.claude/CLAUDE.md` still 19 bytes with zero massa-ai markers; `~/.config/massa-ai/config.json` unmodified. **A measurement trap worth the line**: `test:plugins` read 139/3 once, and the three cursor-plugin failures were caused by a `bun run build` I had started concurrently in the same worktree, not by any change here — re-run with nothing else in flight it is 142/0. Do not read a plugin-suite failure as a code failure without checking what else was writing the tree. **Orchestrator re-measurement (independent of the report):** every figure above reproduced. The whole shell battery (**38** suites — an earlier revision of this row said 39; `ls scripts/tests/*.sh` returns 38) was then run rather than the six briefed rows, which surfaced a third failing suite the report omitted — `test-plugin-registry-registration.sh` at 43/4. It and `test-plugin-auto-install.sh` were measured against `origin/main` in a detached worktree: registry-registration is **43/4 there too**, identical assertions, and auto-install is **193/17 at `origin/main` versus 194/16 here**, i.e. one better on the branch. Both are the same `claude`-binary-on-`PATH` environment cause as `cli`'s 2. No shell regression is attributable to this feature. `oxlint` exit 0. |
| 8 | T16, T17, T18 | Complete | `0e41d667`, `81811156`, `3dd9d433` | Three commits, one per task. The two `case "bootstrap"` blocks are 122 lines each and differ on **exactly one line** — the `findRepoRootWithMarker` argument — measured line-by-line rather than reviewed; T18's block was spliced from T17's with a single unique-anchor substitution, so byte-identity is a property of how it was produced, not a claim. Three things were decided that no artifact specified, each recorded at its call site. **`setBootstrapRuleEnabled` cannot be pointed at `--target`**: it takes no path and writes `getConfigPath()`, which `config-loader.ts:8` freezes at module-eval time, so `--target` scopes the *render* (the four `MASSA-AI.md` files, which is the risk design.md:455/480 names) while the preference stays at the spec's own `~/.config/massa-ai/config.json` (BST-10 AC-11) — and when `bootstrapStateFilePath(targetHome)` is not that file the CLI names both paths on stderr instead of silently rendering from a state the toggle never touched. **PC-Q2's correction was defensive and its named expression is unused**: the CLI never needs a state path because `applyBootstrapState` derives both from `targetHome` internally; the value of the note was stopping a reach for the nonexistent `defaultStatePath`. **`--yes` is implemented** per design.md:358-363 and :481, which T17's done-when omits — a redirected `--target` is exactly `installer_consent_gate`'s case, and the gate is refused before either writer. `--dry-run` persists nothing at all, not even `config.json`, and says so; the engine cannot be handed an in-memory state, so a dry-run toggle previews delivery, not the toggle's effect. BST-09 AC-8's "changes no state" half is asserted directly (`config-cli-bootstrap.test.ts:143-144`, both mutating seams at zero calls) because an exit-code-only test passes over a CLI that wrote first and failed after. 24 discrimination mutations across the two tasks, 24 killed, every anchor population printed beside its verdict and every restore hash-verified against a `/tmp` copy — `git checkout` was never used. Gates: mcp-client `config-cli-bootstrap` 22/0, opencode `config-cli-bootstrap` 22/0, opencode `src/__tests__/` **104/0 → 126/0 across 7 files**, mcp-client isolation runner **13/13 groups** (12 before this file, which `mock.module` puts in its own child), `packages/shared` 860/0, `test:scripts` 1873/2 across 83 files (the two documented pre-existing `pyts golden: lessons` cases, no third failure), `test:plugins` 142/0, `oxlint` 0, `turbo run type-check --force` 6/6. **A pre-existing defect was triggered, not introduced, and it wrote the developer's real config**: `apps/mcp-client/src/__tests__/config-cli.test.ts` sets `XDG_CONFIG_HOME` in `beforeEach`, after its line-5 static import of `../config-cli.js` has already frozen `CONFIG_DIR`, so run **directly** it executes `use openai --api-key k` against `~/.config/massa-ai/config.json`. It is safe under `bun scripts/run-tests-isolated.ts`, whose `buildChildEnv` sets the child's `XDG_CONFIG_HOME` before the child starts, which is why it has never surfaced. The opencode twin already solves it with `src/__tests__/env-setup.ts` as a first import, and the new opencode suite here does the same — that import is the only difference between the two otherwise case-for-case test files. Every direct suite run after the discovery used a scratch `XDG_CONFIG_HOME` and the real `config.json` mtime was compared across each one. |
| 8b | T18a | Complete | `46340b97` | Added by user ruling after the Phase 8 config-overwrite. Placed as its own phase, not inside Phase 9, because Phase 9 already sits at the three-task worker budget. **RED was reproduced, not argued**: with `HOME`/`XDG_CONFIG_HOME` pointed at a scratch dir, the pre-change file reported **23 pass / 0 fail** while writing `$SCRATCH/.config/massa-ai/config.json` with `{"provider":"openai","model":"text-embedding-3-small","apiKey":"k","dimensions":1536}` — the exact damage signature, at the ambient config dir the `beforeEach` never redirects. Two sensors ship, and they are **not** duplicates: `config-cli.test.ts:197` asserts the frozen path by exact equality against `env-setup`'s own scratch dir, and `:204` asserts, by reading its own source, that `./env-setup.js` is the file's first import. `env-setup.ts` therefore exports `TEST_CONFIG_HOME` where the opencode twin exports nothing — that is what lets the behavioural sensor compare an exact path instead of inferring one from `HOME` or `TMPDIR`, which would misfire wherever `TMPDIR` sits under `HOME`. Three ordering mutations, all killed, all run under a scratch `HOME` and removed afterwards: import deleted (both sensors fail), import demoted below `../config-cli.js` (both fail), import demoted below the harmless `import path from "path"` (**only** the ordering sensor fails, 24/1). That third mutation is the one that proves the static sensor is load-bearing: the behavioural assertion cannot see a demotion past an import that touches no config, and criterion 3 asks for *any* demotion. The other 23 cases stayed green through all three — a green suite was never a sensor for this. Gates: `config-cli.test.ts` **25/0**, mcp-client isolation runner **13 groups, exit 0**, `test:scripts` 1873/2 across 83 files (the two documented `pyts golden: lessons` cases, no third failure), `test:plugins` 142/0. **Two things were measured that the task did not predict.** The isolation runner failed `embedded-api-client-endpoints` on its first invocation and passed it on a second full run (exit 0) and on two standalone runs (122/0) — unreproduced, and that suite references neither file changed here. And `~/.config/massa-ai/config.json` changed while this task was in flight, from outside it. **The worker attributed that change to FU-5 firing during its run; the orchestrator re-measured and that attribution is wrong, while the underlying finding is right.** Decoded, the observed mtime `1788803686` is `2026-09-07T14:54:46` — exactly the orchestrator's own concurrent restore of the `embedding` block the Phase 8 defect had clobbered. T18a's run wrote nothing. What *is* confirmed is that FU-5 fired earlier, during Phase 8 rather than during T18a: comparing three generations of the file, `config.json.bak` (2026-08-18) has **16** top-level keys and no `bootstrap`, while the pre-restore copy captured at mtime `14:32:59` already has **17** and carries `bootstrap: {"rules":{}}`. So an explicit bootstrap write reached the developer's real home during T17/T18, which is precisely the unredirectable-`--target` behaviour FU-5 names. The residue is inert — an empty `rules` object resolves to the registry defaults, identically to the section being absent — but it is real evidence, and it means a worker's own before/after hash is not attributable without an mtime and a check for concurrent writers. Embedding block intact after the restore (`ollama` / `qwen3-embedding:4b` / 2560), verified `MATCH` against the backup, with `database.url` and `security.apiKey` preserved and file mode still `0600`. **Orchestrator re-verification of the task itself:** `config-cli.test.ts` re-run at 25/0 leaving the real config's hash *and* mtime frozen, and the ordering mutation reproduced independently — demoting the guard to line 2 yields 24 pass / 1 fail with only the static sensor firing, subject restored from a `/tmp` copy and sha256-verified identical. |
| 9 | T19, T20, T21 | Complete | `f8033ac5`, `dc6dbf66`, `3e8a7354` | Three commits, one per task. **T19 was deliberately not built the cheap way.** A prior worker had noted that T17/T18's two `case "bootstrap"` blocks are 122 lines differing on one line, and suggested a line-count-plus-diff assertion over that span; that would have been source-text identity, which passes over two CLIs whose shared callee behaves differently per caller, and T19's done-when demands the guard reach **persistence**. It asserts instead at `scripts/__tests__/profile-cli-parity.test.ts:204` (and `:216`, `:226`, `:288`) that both CLIs hand `setBootstrapRuleEnabled` — the only writer of `config.json` — identical argument lists. Deleting opencode's persistence call takes it to 17/4; hardcoding the boolean to `true` persists the right id exactly once and is caught only by the value comparison. **T21 could not be done inside its stated `Where`, and the reason is a test that makes the generator authoritative**: `scripts/__tests__/installer-removal-derivation.test.ts:241` regexes `for (const bundleName of [...] as const)` out of `scripts/generate-skill-artifacts.ts` and requires every literal `for name in …` loop in all four `apps/<host>-plugin/install.sh`, install and uninstall paths both, to equal it exactly. Editing only the generator produced four named failures. So the four installers (8 loops plus 4 `install-state.json` `skills:` arrays) and five plugin roster suites moved with it, as did `apps/cursor-plugin/install.sh`'s harness-bundle exclusion `case` — omitting it leaks `bootstrap/` into Cursor's command-skill cache mislabelled as a command, the exact defect that line's own comment records against `profile` — and `scripts/lib/workflow-commands.ts`'s `RESERVED_BUNDLE_ROOTS`. Every changed roster assertion stayed an exact equality and gained a member; none was weakened. A side effect worth keeping: this makes BST-11 AC-1 true on the **plugin-tarball** route, which T20's `install-skills.sh` route alone does not cover. 12 discrimination mutations, 12 killed, all restored from `/tmp` copies and sha256-verified; `git checkout` never used. **Orchestrator re-measurement, independent of the report:** every figure reproduced. `test:scripts` 1873/2 across 83 files → **1905/2 across 84**; `test:plugins` **142/0**; artifact `--check` exit 0 under a scratch `XDG_CONFIG_HOME`; `oxlint` 0. The **whole shell battery (**38** suites — an earlier revision of this row said 39; `ls scripts/tests/*.sh` returns 38)** was run, not the nine the worker reached, and it holds: `apply` 31 → **42/0**, `bootstrap-file` 108/0, and the only failures anywhere are the three pre-existing environment cases already measured identical at `origin/main` (`cli` 40/2, `plugin-auto-install` 194/16, `plugin-registry-registration` 43/4). Bundle delivery verified directly rather than inferred: all four `apps/<host>-plugin/skills/bootstrap/SKILL.md` exist at 74 lines with **one distinct sha256 across the four**, the source is tracked at `skills/bootstrap/SKILL.md`, and the bundles are gitignored by `.gitignore:82` per AD-016. The real `~/.config/massa-ai/config.json` was untouched throughout, sha `34244ef2…` and mtime `1788803686` unchanged. **One orchestrator baseline was wrong and the worker corrected it**: the packet said `test:plugins` "should grow" and that a flat count would be a finding. It is 142 → 142, correctly — every plugin-side roster is an exact-equality array *inside an existing case*, so a new bundle widens assertions rather than adding cases, and the new per-bundle cases land in `skill-artifact-parity.test.ts` inside `test:scripts`, which is where the +32 appeared. The worker did not merely assert this: reverting the claude installer loop takes `apps/claude-plugin/__tests__/install.test.ts` to 15/2, proving that runner still senses the bundle. |
| 10 | T22, T23 | Complete | `0a5c8313`, `dcf6f6b9` | Two commits, one per task. **T23's no-duplication criterion was asserted mechanically rather than by reading**, which is the only way to guard against a *near*-duplicate: a token-set Jaccard over all 12 cross-file sentence pairs (§Language sentences against the `english-code` rule span), threshold `0.40`, with both populations asserted non-empty first so a vacuous pass cannot read as a clean one. The threshold is calibrated against measured probes recorded in the test's own docblock — verbatim restatement 1.00, light paraphrase 0.71, the conversational-replies clause 0.45, the pre-change §Language text 0.19, the shipped text 0.13 — and the docblock states the limit honestly: a heavy paraphrase sharing few content words measures 0.27 and is invisible to any token-overlap metric, so the ownership half of AD-019 is carried by the citation assertion, not by this one. Six mutations, six killed, each restored from a `/tmp` copy and sha256-verified: dropping the off-default clause, deleting the §3 exclusion sentence, dropping the `english-code` citation, pasting the rule's first sentence verbatim, lightly paraphrasing it, and dropping the normative-identifier claim. **A committed sensor belonging to a different feature constrained T23's prose**: `scripts/__tests__/workflow-harness-contract.test.ts:666-671` (the NAME-01 content sensor) pins the literals `Convert any non-English source term to English` and `Portuguese is the primary case`. The first draft rewrote the former into a mid-sentence clause and produced a third `test:scripts` failure (1908/3); the prose was rewritten to keep both literals verbatim rather than touching the sensor, so the gate passed inside T23's own boundary and this is not a deviation. T22 additionally added one clause to the file's opening paragraph, inside its stated `Where`: without it the reference's third line still asserted all three obligations unconditionally, four lines above the gate saying otherwise — the same "reference winning" shape assumption A6 describes. T23's `Reuses` cite `§Language (:31-39)` was annotated in place: the section is now `:31-44`, heading still at `:31`. **Orchestrator re-measurement:** every figure reproduced. `test:scripts` 1905/2 across 84 → **1909/2 across 84**; `test:plugins` **142/0**; artifact `--check` exit 0 under a scratch `XDG_CONFIG_HOME`; `oxlint` 0. Bundle sync verified by content rather than by the check alone — all four `apps/<host>-plugin/skills/massa-ai/references/{code-annotation,naming-standards}.md` sha256-identical to source. The NAME-01 literal is still present exactly once. Real `~/.config/massa-ai/config.json` untouched, sha `34244ef2…` and mtime `1788803686` unchanged; `bootstrap enable\|disable` was never invoked as a real process. |
| 11 | T24, T25 | Pending | — | Order is T24 → independent verification → T25, per PC-B6. |

**Plan Challenge, Phases 6–11 (2026-09-07).** A read-only `massa-ai-plan-critic` pass was run
against T12–T25 before any Phase 6 edit, then every finding was re-measured at its own line by
the orchestrator rather than accepted from the report. Six blocking findings, all confirmed,
all now amended into the task bodies as `PC-*` bullets: **PC-B1** the bootstrap module is not
exported at all (`packages/shared/package.json:11-28` closes `exports` to four subpaths, root
`index.ts` names no bootstrap symbol, `dist/index.js` holds 0 occurrences) — invisible to every
gate because all six suites import relatively and the shell suite imports the absolute source
path; **PC-B2** T14's anchor named a `return` that does not exist in `check_platform`
(`:924-1031`, zero returns) and its literal reading would have shipped an inverted guard;
**PC-B3** T13's destination map cited a helper with zero uses in this script that disagrees with
the real one on Codex home resolution; **PC-B4** the Cursor-warning cite drifted `:673-677` →
`:800-808`; **PC-B5** `design.md:449`'s contract would have had T13 pass a third argument to a
two-parameter `writeConfig`, silently defeating T11's plan mode; **PC-B6** T25 declared
completion before the mandatory verification gate that writes `validation.md`, and its own
`check_specs_delivered.ts` gate cannot catch that because `validation.md` is in
`FEATURE_OPTIONAL` (`:47`).

The generalizable rule the pass found: **every stale cite lands in one of the two files Phases
1–5 rewrote** (`scripts/install-skills.sh`, `scripts/lib/opencode-config.cjs`); every cite into a
file those phases did not touch is still exact. Re-verify cites by file, not by artifact.

No done-when outcome was weakened by these amendments; each corrects an anchor, a citation, or
an ordering the workflow contract already required. Hand every `PC-*` bullet to the verifier as
a question.

---

## Project Testing Guidelines Scan

Sources read, with the rule each one contributes:

| Source | Rule taken |
| --- | --- |
| `CONTRIBUTING.md` Step 7 | Tests must discriminate — "if you changed one line of the component, would the test catch it?" |
| `CONTRIBUTING.md` Step 6 | Retiring a compatibility boundary asserts **both** directions: the new path works AND the old one has zero effect |
| `CONTRIBUTING.md` § CHANGELOG authoring | An entry under `[Unreleased]` picks the version; the CI merge gate fails a PR without one unless labelled |
| `CLAUDE.md` § Running tests | `packages/shared` and `apps/opencode-plugin` run plain `bun test`; `apps/mcp-client` runs `bun scripts/run-tests-isolated.ts` |
| `CLAUDE.md` § Running tests | `bunfig.toml` sets a 5 s per-test timeout; raise per-test with a third `test()` arg, never globally |
| `CLAUDE.md` § Running tests | `bun run test` does not reach `scripts/`; `bun run test:scripts` is a separate runner |
| `CLAUDE.md` § Agent-harness surface | `bun run test:plugins` is a **third** runner, wired into the CI build job only |
| `.github/workflows/coverage.yml` | 90%-per-file floor, blocking |
| `package.json:38` | `test:scripts` runs `bun test scripts/__tests__ scripts/tests/*.test.ts` then loops every `scripts/tests/*.sh` — a new `.sh` suite is auto-discovered |
| `scripts/tests/lib/installer-test-helpers.sh` | Shell suites source one helper: `assert_*`, `tree_fingerprint`, `make_mock_agents`, `summary` |

Guidelines were found, so the Coverage Expectation below conforms to them rather than to a default.

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `CONTRIBUTING.md`, `CLAUDE.md`, `.github/workflows/coverage.yml`, `package.json`, `scripts/tests/lib/installer-test-helpers.sh`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| `packages/shared` domain module (registry, state, render, engine, report, format) | unit | All branches; 1:1 to spec ACs; every listed edge case; ≥90% per file | `packages/shared/src/bootstrap/__tests__/*.test.ts` | `cd packages/shared && bun test src/bootstrap` |
| `packages/shared` config seam (strict read/write) | unit | Both directions per CONTRIBUTING Step 6: the strict path throws on malformed input AND the old permissive composition is not reachable from the toggle path | `packages/shared/src/config/__tests__/*.test.ts` | `cd packages/shared && bun test src/config` |
| Published CLI subcommand | unit | Dispatch, argument validation, unknown-id error, persistence, `--target`, `--dry-run` | `apps/<app>/src/__tests__/config-cli-bootstrap.test.ts` | `cd apps/mcp-client && bun test src/__tests__/config-cli-bootstrap.test.ts` (see PC-G1) |
| Repo script (`scripts/*.ts`) | unit | All branches of the resolution ladder and the degrade-to-defaults path | `scripts/__tests__/*.test.ts` | `bun test scripts/__tests__/<file>` |
| Bash installer behaviour | shell suite | One scenario per acceptance criterion in BST-01..BST-05, plus the no-write proof against deliberate drift | `scripts/tests/test-*.sh` | `bash scripts/tests/<file>.sh` |
| Harness source content (`skills/**/*.md`) | contract | Guarded by a scripted source-contract assertion, never by review | `scripts/__tests__/*.test.ts` | `bun test scripts/__tests__/<file>` |
| Generated plugin bundles | contract | Byte-identity across all four hosts + `--check` drift detection | `scripts/__tests__/skill-artifact-parity.test.ts`, `apps/*-plugin/__tests__/` | `bun run test:scripts`, `bun run test:plugins` |

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After a task whose tests are a single unit or contract file | `bun test <the task's named test file>` |
| Full | After a task touching the installer, the generator, or a plugin bundle | `bun run test:scripts && bun run test:plugins` |
| Build | After phase completion | `bun run lint && bunx turbo run type-check --force && bun run build && bun run test:scripts && bun run test:plugins` |

**The artifact gate is `bun scripts/generate-skill-artifacts.ts --check`, never `bun run generate:artifacts --check`.** `package.json:31` is an `&&` chain, so the flag reaches only the second generator while the first runs in write mode and repairs the drift it should report. CI uses the direct form (`.github/workflows/ci.yml:238`).

**Baseline to beat, measured at `09e9a597` after `bun run build`:** `test:scripts` 1821 pass / 2 fail across 81 files. The two failures are `pyts golden: lessons > list --status all …` and `… list --query filter …`, and both reproduce at `origin/main` — they are pre-existing and out of scope. Any third failure is this feature's. Re-measured at `9cd23199` (Phase 7 complete): **1873 pass / 2 fail across 83 files**, same two failures.

**PC-G1 — two gate commands this artifact named do not run, and a third env fact.** Found by
executing them before Phase 8 rather than at dispatch time.

1. **`apps/mcp-client`'s isolation runner takes no arguments.** The documented
   `bun scripts/run-tests-isolated.ts --filter='config-cli-bootstrap'` exits with
   `Unknown argument(s): --filter=config-cli-bootstrap`. `--filter` and `--unit` belong to
   **core's** runner; the mcp-client wrapper is a 46-line shim that passes `packageRoot`,
   `testsRoot`, `isolationReason` and `labels` to `runIsolatedTests` and forwards no CLI
   surface at all. The correct quick gate for one file is
   `cd apps/mcp-client && bun test src/__tests__/config-cli-bootstrap.test.ts` — that file
   uses `mock.module`, and running it alone already gives it its own process, which is the
   isolation the runner exists to provide.
2. **`cd apps/opencode-plugin && bun test` exits 2 and reports no summary.** From that
   package root, `bun test` collects the **generated skill bundle** — `skills/massa-ai/scripts/`
   is gitignored build output (AD-016) — and executes `validate_spec.ts` as if it were a
   test, which prints `validate_spec: could not locate a spec.md` and fails the run. This is
   why the plugin packages deliberately declare no `test` script and `bun run test:plugins`
   is their runner. Scope it: `bun test src/__tests__/` → **104 pass / 0 fail across 6 files**,
   exit 0.
3. **`apps/mcp-client`'s runner needs `DATABASE_URL` exported locally.** Without it, 7 of 12
   groups fail with `# Unhandled error between tests` at the `DATABASE_URL` resolution site
   while each file passes when run alone — a wrapper reporting its own exit code, not a test
   failure. With
   `DATABASE_URL=postgresql://massa_ai:massa_ai_password@localhost:5432/massa_ai` exported,
   **all 12 groups pass**. CI sets this; a local shell does not.

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Source contract, red first

T1 → T2

### Phase 2: Strict config seam and rule registry

T3 → T4

### Phase 3: State and renderer

T5 → T6

### Phase 4: Report and engine

T7 → T8

### Phase 5: Installer safety, red first

T9 → T10 → T11

### Phase 6: Render entry point and per-host delivery

T12 → T13 → T13a

### Phase 7: Drift branch, harness build and backup reporting

T14 → T15 → T15a

### Phase 8: Shared formatting and the two CLIs

T16 → T17 → T18

### Phase 8b: Test isolation guard

T18a

> The user's ruling was "a new task in Phase 9". It is placed as its own phase rather
> than inside Phase 9 because Phase 9 already holds three tasks, which is the worker
> budget's maximum, and `references/spec-driven/sub-agents.md` treats a phase over three
> tasks as a Tasks-authoring defect to split rather than a dispatch-time problem to absorb.
> Sequence is unchanged in substance: it runs immediately after Phase 8 and before Phase 9.

### Phase 9: Skill, generator, parity

T19 → T20 → T21

### Phase 10: Reference alignment

T22 → T23

### Phase 11b: Verification fixes

T26 → re-verify

> Added after the independent verification gate returned **FAIL**. The fix→re-verify loop is
> bounded to 3 iterations (`references/verification-ladder.md`); this is iteration 1. T25
> stays last, so it carries the passing `validation.md`.

### Phase 11: Changelog and close-out

T24 → T25

---

## Task Breakdown

### T1: Bootstrap source contract sensor

**Task ID**: TASK-001

**What**: A scripted assertion that `skills/AGENTS.md` carries exactly 9 well-formed rule marker pairs with the registry's ids, carries the `code-comments` off-span, and contains no occurrence of `rtk`.
**Where**: `scripts/__tests__/bootstrap-source-contract.test.ts`
**Depends on**: None
**Reuses**: `scripts/__tests__/skills-harness-integrity.test.ts:272-286` (locates the bootstrap markers in `skills/AGENTS.md` and asserts a key appears exactly once inside the block)
**Requirement**: BST-06, BST-09

**Tools**: MCP: NONE (server is down). Skill: NONE.

**Done when**:
- [ ] The suite reads the whole file, not line by line — the `rtk` and marker assertions must survive a claim spanning a newline
- [ ] **Observed RED before T2**, with the failure naming the missing marker ids, and that red output is quoted in the task report
- [ ] Test count recorded (no silent deletions)

**Tests**: contract
**Gate**: quick — `bun test scripts/__tests__/bootstrap-source-contract.test.ts`
**Commit**: `test(bootstrap): add the source contract sensor for the rule markers`

---

### T2: Mark up the bootstrap source, drop RTK, add the two new rules

**Task ID**: TASK-002

**What**: Wrap each of the 7 existing rules in `<!-- massa-ai:rule:<id>:start|end -->`, delete `### Conditional RTK Rules`, and add the `english-code` and `code-comments` sections including the `code-comments` off-span.
**Where**: `skills/AGENTS.md`
**Depends on**: T1
**Reuses**: the existing `<!-- massa-ai:bootstrap:start|end -->` marker convention (`scripts/install-skills.sh:74-75`)
**Requirement**: BST-06, BST-07, BST-08, BST-09

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] `Contract Ownership`, `Runtime Contract Pointer` and the `massa-ai` bullet of `Skill Summary` sit inside the `massa-ai-router` span (assumption A9)
- [ ] The `english-code` rule states that it does **not** change the language of conversational replies
- [ ] The `code-comments` off-span explicitly overrides `references/code-annotation.md` §1 and §2 and says nothing about §3
- [ ] T1 goes green, with its previously-red assertions named
- [ ] `bun test scripts/__tests__/skills-harness-integrity.test.ts` still passes

**Tests**: contract
**Gate**: quick — `bun test scripts/__tests__/bootstrap-source-contract.test.ts scripts/__tests__/skills-harness-integrity.test.ts`
**Commit**: `feat(bootstrap): mark the rule spans, drop RTK, add the english-code and code-comments rules`

---

### T3: Strict config read and write seam

**Task ID**: TASK-003

**What**: `readRawConfigStrict()` that throws a named parse error and returns the literal document, and `writeRawConfig(doc, {expectedBytes})` that performs the compare-and-swap write; both exported from the package barrel.
**Where**: `packages/shared/src/config/config-loader.ts`
**Depends on**: None
**Reuses**: `writeFileAtomically` (`packages/shared/src/config/config-loader.ts:247`), which is not exported from either barrel today
**Requirement**: BST-10

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] A malformed `config.json` makes `readRawConfigStrict` throw naming the file and the parse failure, and writes nothing
- [ ] The both-directions assertion per CONTRIBUTING Step 6: the strict read throws **and** a test proves the toggle path does not reach `loadConfig`'s defaults-on-parse-failure branch
- [ ] Compare-and-swap: a test mutates the file between read and write and asserts one re-apply, then a loud failure on a second race
- [ ] Unknown top-level keys survive a read-modify-write round trip
- [ ] `writeFileAtomically`, `readRawConfigStrict`, `writeRawConfig` are reachable from `@massa-ai/shared/config`
- [ ] Tests co-located at `packages/shared/src/config/__tests__/config-strict-io.test.ts`

**Tests**: unit
**Gate**: quick — `cd packages/shared && bun test src/config`
**Commit**: `feat(config): add a strict read and compare-and-swap write seam`

---

### T4: Rule registry

**Task ID**: TASK-004

**What**: `BOOTSTRAP_RULES` — 9 ids in fixed render order with defaults and descriptions — plus `UnknownRuleError(id, known)` and a validator that reports every violation in one throw.
**Where**: `packages/shared/src/bootstrap/rules.ts`
**Depends on**: None
**Reuses**: `SCHEDULER_JOB_KINDS` as-const id list (`packages/shared/src/config/massa-ai-config.ts:7-13`) for shape; `scripts/lib/model-profiles.ts:167-314` for the accumulate-then-throw idiom and `UnknownProfileError(name, known)` for the error shape — the module itself is unreachable from a published CLI
**Requirement**: BST-08, BST-09

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] Exactly 9 ids, asserted as a set, so adding or removing one reddens
- [ ] Every rule defaults enabled except `code-comments`, asserted per id rather than by count
- [ ] `UnknownRuleError` names the bad id and lists all 9 valid ones
- [ ] Both `enable` and `disable` accept every id — no protected id (BST-09 AC-3)
- [ ] Tests co-located at `packages/shared/src/bootstrap/__tests__/rules.test.ts`

**Tests**: unit
**Gate**: quick — `cd packages/shared && bun test src/bootstrap`
**Commit**: `feat(bootstrap): add the rule registry`

---

### T5: Rule state resolution and persistence

**Task ID**: TASK-005

**What**: `resolveBootstrapState()` merging persisted `bootstrap.rules` over registry defaults, and the writer that persists a single rule flip through the T3 seam.
**Where**: `packages/shared/src/bootstrap/state.ts`
**Depends on**: T3, T4
**Reuses**: `readRawConfigStrict` / `writeRawConfig` from T3
**Requirement**: BST-10

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] A persisted id absent from the registry lands in `ignoredStateKeys` and is reported once, never fatal (BST-10 AC-12)
- [ ] Only the `bootstrap` subtree is written; sibling keys are byte-identical after a flip
- [ ] An absent `config.json` is created holding the `bootstrap` key
- [ ] Tests co-located at `packages/shared/src/bootstrap/__tests__/state.test.ts`

**Tests**: unit
**Gate**: quick — `cd packages/shared && bun test src/bootstrap`
**Commit**: `feat(bootstrap): resolve and persist rule state`

---

### T6: Renderer

**Task ID**: TASK-006

**What**: `renderBootstrap({source, state, host, targetHome})` returning `{contract, pointer}` — disabled spans removed, off-text inserted, markers stripped, always-rendered header region emitted.
**Where**: `packages/shared/src/bootstrap/render.ts`
**Depends on**: T4, T5
**Reuses**: the marker convention from T2
**Requirement**: BST-01, BST-04, BST-06, BST-07, BST-08, BST-10

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] Determinism: the same state renders byte-identical output twice (BST-10 AC-7)
- [ ] `code-comments` disabled emits the negative directive; both toggle states leave the §3 tests sentence untouched (BST-08 AC-5, AC-6)
- [ ] `rtk` count is 0 in every toggle state (BST-06 AC-2)
- [ ] The all-off render still produces a body stating every rule is disabled **and** carries the always-rendered header with the recovery command and the state file path (BST-10 AC-9)
- [ ] The pointer template is at most 10 lines and carries no policy text (BST-04 AC-6, AC-7)
- [ ] Tests co-located at `packages/shared/src/bootstrap/__tests__/render.test.ts`

**Tests**: unit
**Gate**: quick — `cd packages/shared && bun test src/bootstrap`
**Commit**: `feat(bootstrap): render the contract from source and rule state`

---

### T7: Report types and exit-code predicate

**Task ID**: TASK-007

**What**: `BootstrapRenderResult` with the four-value status union including `written-not-wired`, `BootstrapReport`, and a `bootstrapReportSucceeded` predicate.
**Where**: `packages/shared/src/bootstrap/report.ts`
**Depends on**: T4
**Reuses**: the `{host, status, reason?}` convention and `restartRequired` derivation from `packages/shared/src/profile-switch/report.ts:29-44` — a sibling type, not a reuse of `HostSwitchResult`, whose union carries a variant-availability concept and a required `profile` field
**Requirement**: BST-10, BST-11

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] `written-not-wired` is a distinct status that the predicate does not treat as a clean success
- [ ] `restartRequired` is true only for a non-dry-run with at least one written row
- [ ] Tests co-located at `packages/shared/src/bootstrap/__tests__/report.test.ts`

**Tests**: unit
**Gate**: quick — `cd packages/shared && bun test src/bootstrap`
**Commit**: `feat(bootstrap): add the per-host report types`

---

### T8: Apply engine with the wiring probe

**Task ID**: TASK-008

**What**: `applyBootstrapState({targetHome, dryRun})` — iterate every host recorded in `install-state.json`, render, write, probe the wiring artifact, and return the report.
**Where**: `packages/shared/src/bootstrap/engine.ts`
**Depends on**: T5, T6, T7
**Reuses**: `readInstallState` (`packages/shared/src/profile-switch/state.ts:105`), `HOSTS`/`isHost` (`hosts.ts:16-21`), and the fixed-order per-host loop shape from `profile-switch/engine.ts:445-506`. **Not** `resolveHostLayout` — it returns `route: "skip"` for cursor unconditionally (`hosts.ts:89-90`), and Cursor is a first-class target here
**Requirement**: BST-10, BST-11

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] `targetHome` is threaded to both the install-state path and the config path; nothing resolves the real home internally
- [ ] A host whose contract was written but whose wiring artifact is absent reports `written-not-wired` and names `scripts/install-skills.sh --apply` (BST-10 AC-10a)
- [ ] No host recorded → empty report, exit 0, "no host installed" (BST-11 AC-6)
- [ ] `dryRun` writes nothing, proven by a fingerprint over the scratch home
- [ ] Rows are emitted in registry host order, so the report is deterministic
- [ ] Tests co-located at `packages/shared/src/bootstrap/__tests__/engine.test.ts`

**Tests**: unit
**Gate**: quick — `cd packages/shared && bun test src/bootstrap`
**Commit**: `feat(bootstrap): apply rule state across every installed host`

---

### T9: Installer delivery shell suite, red first

**Task ID**: TASK-009

**What**: A scratch-home shell suite asserting the per-host delivery shape, the byte-identical uninstall round trip, the unlink-not-empty rule, and that `--check`/`--dry-run` write nothing against deliberate OpenCode drift.
**Where**: `scripts/tests/test-install-skills-bootstrap-file.sh`
**Depends on**: None
**Reuses**: `scripts/tests/lib/installer-test-helpers.sh` (`tree_fingerprint`, `make_mock_agents`, `assert_*`, `summary`); `test-install-skills-check.sh:32-45` for the fingerprint-around-`--check` shape; `test-install-skills-state.sh:26-37` `state_json` verbatim for reading the OpenCode `instructions` array
**Requirement**: BST-01, BST-02, BST-03, BST-04, BST-05, BST-12

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] The runner function is named `run_check`, never `check` — `test-install-skills-check.sh:33` shadows the helper's assertion function with an installer runner, and repeating that name here would silently invoke the installer instead of asserting
- [ ] Round-trip fixture includes a file with **leading and trailing blank lines** and a host directory that did not exist pre-install
- [ ] The fingerprint excludes `*.massa-ai.bak-*` and nothing else — the list frozen in `design.md`
- [ ] A scenario seeds `install-state.json` with a host that has no wiring artifact
- [ ] **Observed RED before T10/T11**, and the red output is quoted in the task report naming which assertions fail and why
- [ ] Auto-discovered by `package.json:38`'s `for f in scripts/tests/*.sh` loop; the helper stays under `lib/`

**Tests**: shell suite
**Gate**: quick — `bash scripts/tests/test-install-skills-bootstrap-file.sh`
**Commit**: `test(installer): add the bootstrap delivery and no-write suite`

---

### T10: Make the marker engine byte-preserving, deletable, symlink-safe and atomic

**Task ID**: TASK-010

**What**: `bootstrap_op` takes the block body as a third argument, preserves surrounding bytes exactly, gains a delete mode, refuses write-through on an unowned symlink, and writes through a temp file plus rename.
**Where**: `scripts/install-skills.sh`
**Depends on**: T9
**Reuses**: the existing four-mode contract and duplicate-marker abort (`scripts/install-skills.sh:460-530`); `installer_backup_file` (`scripts/lib/installer-shared.sh:56`), which has **zero production call sites** today — this is a new call site to write, not an existing one to reuse
**Requirement**: BST-01, BST-02, BST-05

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] `removeBlock`'s `.trim()` (`:496`) and the append path's `.trimEnd()` (`:486`) no longer alter surrounding text
- [ ] A removal that empties a whole-file artifact, or an installer-created wiring file, unlinks it instead of writing `""` (BST-05 AC-9a, AC-9b)
- [ ] Write-through is refused on any symlink whose resolved target is not already recorded as massa-ai-owned; the check lives **inside** `bootstrap_op`, not in the caller
- [ ] `is_owned_target`'s "a symlink is always ours to replace" comment (`:549-557`) is reconciled or scoped in the same change, so two contradictory symlink policies do not ship in one file
- [ ] Writes go through temp file plus rename, so an interrupted write cannot leave a start marker with no end marker
- [ ] `installer_backup_file` is called before any `MASSA-AI.md` overwrite where the content differs
- [ ] The T9 assertions covering these behaviours turn green, named individually

**Tests**: shell suite
**Gate**: full — `bun run test:scripts && bun run test:plugins`
**Commit**: `fix(installer): make the managed-block engine byte-preserving, deletable and symlink-safe`

---

### T11: Give the OpenCode config writer a real plan mode

**Task ID**: TASK-011

**What**: A four-mode contract on the OpenCode config write — `plan`, `apply`, `remove-plan`, `remove-apply` — with no filesystem contact in either plan mode, plus idempotent `instructions` add and remove.
**Where**: `scripts/lib/opencode-config.cjs`
**Depends on**: T9
**Reuses**: `resolveConfigPath` / `parseJsonc` (`:26`, `:59`) unchanged; the array push-if-absent and filter-then-delete-when-empty shape from `apps/opencode-plugin/install.sh:554-575` and `:488-495`
**Requirement**: BST-03, BST-05

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] `plan` and `remove-plan` touch the filesystem not at all — not a compare-then-skip guard, which writes in exactly the drift state `--check` exists to find
- [ ] Re-running `apply` adds no duplicate `instructions` entry and creates no second backup
- [ ] An unparseable config throws the existing named error; the caller records it and returns, never `exit`, so sibling hosts still run (BST-03 AC-11)
- [ ] Uninstall removes the exact absolute path and deletes the array when it empties; the orphan-entry limitation is stated in the uninstall report
- [ ] The vendored `apps/opencode-plugin/lib/opencode-config.cjs` mirror stays byte-identical — `bun scripts/generate-skill-artifacts.ts --check` passes
- [ ] The T9 no-write-against-drift assertion turns green

**Tests**: shell suite
**Gate**: full — `bun run test:scripts && bun run test:plugins`
**Commit**: `fix(opencode-config): add a real plan mode and idempotent instructions editing`

---

### T12: Render entry point for the installer

**Task ID**: TASK-012

**What**: A bun entry point that resolves rule state, renders per host, and degrades to registry defaults with a named warning when the state cannot be read.
**Where**: `scripts/render-bootstrap.ts`, `packages/shared/src/bootstrap/index.ts`, `packages/shared/src/index.ts`
**Depends on**: T6, T8
**Reuses**: `renderBootstrap` and `resolveBootstrapState` from `packages/shared/src/bootstrap/`
**Requirement**: BST-01, BST-10

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [x] The ladder is keyed on `command -v bun`, never on `installer_detect_runner` — that helper returns `node` first (`scripts/lib/installer-shared.sh:25-33`) and node is always present here as the node-gyp helper, so a `$RUNNER`-keyed ladder would take the bun branch on no machine
- [x] An unreadable `config.json` renders defaults, emits a warning naming the file and the parse error, and writes nothing to `config.json` (BST-10 AC-10b)
- [x] Neither bun nor a build reachable → a named error quoting `bun run build`, never a default render
- [x] Tests at `scripts/__tests__/render-bootstrap.test.ts` cover all three ladder branches and the degrade path
- [x] **PC-B1 — the module is exported before its first consumer.** `packages/shared/src/bootstrap/index.ts` does not exist and `packages/shared/src/index.ts` names no bootstrap symbol; `packages/shared/package.json:11-28` closes `exports` to `.`, `./types`, `./utils`, `./config`, so a `@massa-ai/shared/bootstrap` deep specifier is blocked too. Measured: `dist/index.js` holds 0 occurrences of `bootstrap`. Add the barrel `design.md:142` already names, and re-export it from the root `index.ts` the way `profile-switch/` is exported (root re-export, **no** new subpath — that is the in-repo precedent and what T17/T18 will import). Every existing bootstrap suite imports relatively (`../engine`, `../render`, …) and the shell suite imports the absolute *source* path, which is why `packages/shared` 815/0 and the 42/35 shell suite both pass with the export surface entirely absent
- [x] **PC-Q2 — the parse warning reaches a channel a caller can surface.** T8 added `onWarning?` to `applyBootstrapState` (log `:22`); the design had no warnings channel. Route AC-10b's warning through it, not a bare stderr write — T16's formatter and T17's CLI can only surface what the callback carries

**Tests**: unit
**Gate**: quick — `bun test scripts/__tests__/render-bootstrap.test.ts`
**Commit**: `feat(installer): add the bootstrap render entry point`

---

### T13: Per-host delivery, migration and uninstall

**Task ID**: TASK-013

**What**: Rewrite `apply_platform` and `uninstall_platform` to write `MASSA-AI.md` plus each host's own load wiring, migrate the old block out of `AGENTS.md`, and reverse all of it on uninstall.
**Where**: `scripts/install-skills.sh`
**Depends on**: T10, T11, T12
**Reuses**: `platform_root` (`scripts/install-skills.sh:147-154`) as the destination map — see PC-B3; the foreign-conflict per-host abort shape (`scripts/install-skills.sh:571-579`)
**Requirement**: BST-01, BST-02, BST-03, BST-04, BST-05

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [x] Claude gets a managed block holding `@MASSA-AI.md` in `~/.claude/CLAUDE.md`, created when absent, with all content outside the markers byte-identical (BST-02)
- [x] OpenCode gets the absolute path in `instructions`; Codex and Cursor get the pointer block (BST-03, BST-04)
- [x] Migration leaves no bootstrap marker pair holding policy text in `AGENTS.md` on claude or opencode (BST-05 AC-8)
- [x] The Cursor warning is reworded to name `MASSA-AI.md` — it is at `scripts/install-skills.sh:800-808` (comment `:800-804`, the three `warn` lines `:806-808`), **not** the `:673-677` this task and `design.md:211` originally cited; that span drifted across the Phase 1–5 commits and now sits between `skill_marker_path` (`:661`) and `is_owned_target` (`:681`). Locate it by content, never by the old line number (PC-B4)
- [ ] Every remaining T9 assertion turns green, and the full suite shows no third failure beyond the two documented pre-existing ones

**Amendments after the Phase 6 Plan Challenge** (anchors only — no done-when outcome is weakened):

- **PC-B3 — the destination map is `platform_root`, not `installer_host_config_dir`.** `git grep -c installer_host_config_dir -- scripts/install-skills.sh` returns **zero uses**; this script has always had its own map. The two disagree on Codex: `installer-shared.sh:195` hardcodes a home-relative `.codex`, while `platform_root` (`:150`) returns the absolute `$CODEX_HOME` resolved at `:139-145`, which prefers `~/.codex` but falls back to `~/.config/codex`. Following the original cite writes `MASSA-AI.md` to `~/.codex/` on a `~/.config/codex` machine — a silently unwired host, exactly the `written-not-wired` class this feature exists to detect.
- **PC-B5 — wire OpenCode's `instructions` through `instructionsOp`, never `writeConfig`.** `design.md:449` describes `writeConfig` itself gaining the four-mode contract. T11 could not implement that literally (log `:23`) and layered it instead: `instructionsOp(mode, targetPath, cfg, entry)` at `scripts/lib/opencode-config.cjs:268`. `writeConfig` at `:174` still takes exactly `(targetPath, cfg)` — a third `mode` argument is silently ignored by JS and the config is written unconditionally, defeating T11's plan mode with every gate green.

**Open after T13 — three test-side items this task's write set cannot close.** All three
are assertions in committed suites, so they are reported rather than edited.

1. `scripts/tests/test-install-skills-bootstrap-file.sh:385` asserts `"status":"written"`
   after `--apply`, which is unsatisfiable by construction: the scenario's own first step
   (`run_engine`, `:377`) already wrote a byte-identical `MASSA-AI.md`, so the second
   engine pass correctly reports `skipped` — T8's defined trigger, "a byte-identical
   re-apply whose wiring is present" (log `:22`), and the status `engine.ts:311-318`
   documents as the one that must not raise `restartRequired` for a no-op. The scenario's
   stated intent is already carried by `:387`'s `assert_not_contains "written-not-wired"`,
   which passes. Measured directly: run 1 `written-not-wired`, run 2 `skipped`.
2. `scripts/tests/test-install-skills-apply.sh` (5 assertions) and
   `test-install-skills-cli.sh:101` and `:104` (2 — **not** `:101-102`, as this note
   first recorded; `:102` is the codex row, which never failed) require
   `~/.claude/AGENTS.md` and
   `~/.config/opencode/AGENTS.md` to carry the bootstrap marker pair. BST-05 AC-8 now
   forbids exactly that. Baseline at `7a51d7aa`: apply 31/0, cli 40/2. After T13: apply
   26/5, cli 38/4 — the two extra cli failures are the same superseded pair, and cli's
   other 2 are pre-existing and environment-caused (a real `claude` binary beside `node`
   on this machine defeats the suite's empty-PATH premise, `got='0' want='2'` at
   baseline).
3. `test-install-skills-check.sh:135` was closed inside this task rather than reported:
   the installer keeps its existing "bootstrap block" record vocabulary for the contract
   file, which is accurate — `MASSA-AI.md` is the bootstrap block, it is simply no longer
   a section of `AGENTS.md`.

**Tests**: shell suite
**Gate**: full — `bun run test:scripts && bun run test:plugins`
**Commit**: `feat(installer): deliver MASSA-AI.md and per-host load wiring`

---

### T13a: Repoint the installer suites at the delivered contract

**Task ID**: TASK-013A

**What**: Rewrite every committed assertion that senses the retired `AGENTS.md` bootstrap block so it senses the delivered per-host contract instead, and correct one assertion whose expected status is unreachable by construction.
**Where**: `scripts/tests/test-install-skills-apply.sh`, `scripts/tests/test-install-skills-cli.sh`, `scripts/tests/test-install-skills-bootstrap-file.sh`
**Depends on**: T13
**Reuses**: the assertion helpers in `scripts/tests/lib/installer-test-helpers.sh`; the per-host delivery assertions T9 already wrote in `test-install-skills-bootstrap-file.sh` as the shape to mirror
**Requirement**: BST-02, BST-03, BST-05, BST-12

**Tools**: MCP: NONE. Skill: NONE.

**Why this task exists.** T13 delivered BST-05 AC-8, which forbids leaving a bootstrap
marker pair in `AGENTS.md` on `claude` or `opencode`. Seven committed assertions in two
sibling suites sense exactly that retired shape, so they went red on correct behaviour.
No task owned them: the Tasks artifact tracked the three suites T9 authored and never
enumerated the suites T13's contract change would invalidate. Deleting them is not an
option — `CONTRIBUTING.md` Step 6 requires retiring a compatibility boundary to assert
**both** directions.

**Measured baselines, all with `TMPDIR=/tmp`** (this machine's default `TMPDIR` ends in
`/`, so `mktemp -d` yields a `T//` path that `path.join` normalizes and two BST-04
pointer assertions compare literally):

| Suite | at `7a51d7aa` | after T13 |
| --- | --- | --- |
| `test-install-skills-apply.sh` | 31 / 0 | 26 / 5 |
| `test-install-skills-cli.sh` | 40 / 2 | 38 / 4 |
| `test-install-skills-bootstrap-file.sh` | 42 / 35 | 76 / 1 |

**Done when**:
- [x] The 5 `apply` failures and the 2 new `cli` failures assert the **delivered** contract: `claude` → a managed block in `~/.claude/CLAUDE.md` containing `@MASSA-AI.md`; `opencode` → the absolute `MASSA-AI.md` path in the `instructions` array; `codex`/`cursor` → the pointer block. No assertion is deleted; each suite's total assertion count is greater than or equal to its baseline
- [x] **Both directions (`CONTRIBUTING.md` Step 6).** Each rewritten site also asserts the retired path has **zero effect** — no bootstrap marker pair remains in `~/.claude/AGENTS.md` or `~/.config/opencode/AGENTS.md` (BST-05 AC-8). Asserting only that the new path works would leave the migration itself unsensed
- [x] `test-install-skills-bootstrap-file.sh:385` asserts `'"status":"skipped"'`, not `'"status":"written"'`, with an inline comment naming T8's trigger definition — a byte-identical re-apply whose wiring is present — and why `written` is unreachable there: the scenario's own `:377` already ran the engine and wrote byte-identical bytes, and `:383`'s `--apply` adds wiring without changing rule state. `:387`'s `assert_not_contains '"status":"written-not-wired"'` stays; it already carries the scenario's real intent
- [x] The `written` path is **not** re-asserted in the shell suite. It is already covered one layer down at `packages/shared/src/bootstrap/__tests__/engine.test.ts:424-431`, which asserts `{codex: "written", cursor: "written-not-wired"}` from one real engine run, and at `:441` (`apply().restartRequired === true`), with `report.test.ts:170-176` sweeping every status against its expected `restartRequired`. Execute's Check C forbids duplicating an assertion at another layer for the same scenario
- [x] The 2 **pre-existing** `cli` failures are not touched and not chased: `no tools exits 2` (`got='1' want='2'`) and `reason is reported` fail identically at `7a51d7aa`, caused by a real `claude` binary in `~/.local/bin` defeating that suite's empty-PATH premise. They are environment-caused, not branch-caused
- [x] Final, with `TMPDIR=/tmp`: `apply` 31/0, `cli` 40/2, `bootstrap-file` 77/0

**Tests**: shell suite
**Gate**: full — `bun run test:scripts && bun run test:plugins`
**Commit**: `test(installer): repoint the installer suites at the delivered contract`

---

### T14: Bootstrap drift branch in `--check`

**Task ID**: TASK-014

**What**: A drift branch in `check_platform` covering `MASSA-AI.md` and each host's wiring artifact.
**Where**: `scripts/install-skills.sh`
**Depends on**: T13
**Reuses**: the existing drift-record conventions in `check_platform` (`:924-1031`)
**Requirement**: BST-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [x] **Observed RED first** by mutating a written `MASSA-AI.md` in the scratch home and confirming the branch reports drift — `check_platform` contains zero references to `bootstrap_op` today, so BST-01 AC-10 would otherwise pass vacuously. Measured: `bootstrap-file` went 77/0 → **81 passed / 16 failed (97 total)** with the scenario committed and the installer untouched; shortest decisive line `claude contract drift exits 1 (BST-01 AC-10) → got='0' want='1'`. The clean-run half of AC-10 passed before the change, which is the vacuity this observation exists to expose
- [x] **PC-B2 — placed INSIDE the plugin-owned guard, before its `fi`, not after it.** The original wording ("after the plugin-owned early return (`:792-803`)") is wrong twice and its literal reading inverts the intent. `check_platform` is `scripts/install-skills.sh:924-1031` and contains **zero `return` statements**; `:792-803` is inside `apply_platform`, a different function. The plugin-owned guard is a wrapping conditional, `if [ "$owner" != "plugin" ]; then … fi` at `:935-987`. "After the early return" therefore resolves to "after the `fi` at `:987`", which runs the bootstrap drift check **for plugin-owned platforms** — the opposite of what `design.md:255-258` states. Place the branch before `:987`, so the plugin-owned case stays covered by the engine's wiring probe as designed
- [x] `--check` still writes nothing, proven by the T9 fingerprint assertion — scenario 12b hashes the whole scratch home before and after a `--check` that really does find drift, with `tree_fingerprint` rather than the backup-excluding variant, so a repair-on-check would also be caught by the backup it would drop. The branch uses only `bootstrap_engine`'s `plan` and `instructionsOp`'s `plan`, the two modes T11 proved make zero filesystem contact
- [x] Exit 0 after a clean `--apply` with no source change (BST-01 AC-10)

**Anchors re-measured at `3768f94a` before the edit** (every `install-skills.sh` cite in this
task body was stale; located by content, never by line): `check_platform` `:1165`, its
plugin-owned guard `:1176`, that guard's `fi` `:1228`, `bootstrap_op` `:653`, `contract_path`
`:705`, `platform_root` `:162`. The guard is a wrapping conditional and `check_platform` still
contains zero `return` statements, so "before the `fi` at `:987`" resolves to "inside the
`if [ "$owner" != "plugin" ]` block" and nothing else.

**Two additions beyond the literal task text, each closing something otherwise unsensed.**
`check_bootstrap_note` counts drift through the global `BOOTSTRAP_DRIFT` and the branch adds it
back into `drift_count`; that accumulation feeds only the quiet summary line, and the `--check`
exit code is computed independently from `RESULTS_FILE`, so deleting the accumulation left every
other assertion green. Two assertions on `--check --quiet` now sense it — that flag pair is the
only path that reaches the summary, since `--check` sets verbose and only a following `--quiet`
resets it. And the plugin-owned case is asserted directly (a plugin-owned host with no contract
must exit 0), because it is the single observable difference between the correct placement and
the literal reading PC-B2 corrected.

**Discrimination: 5 mutations, 5 killed**, all in `install-skills.sh`, all restored from a
`/tmp` copy and hash-verified (`git checkout` never used). M1 the branch moved after the guard's
`fi` → killed only by the two PC-B2 assertions, which is what proves the placement itself is
sensed; M2 the verdict test inverted to `nochange` → 8 killed; M3 the `drift_count` accumulation
deleted → killed only by the two new quiet-summary assertions; M4 the claude wiring probe
neutralised → 2; M5 the opencode wiring probe neutralised → 2.

**Tests**: shell suite
**Gate**: full — `bun run test:scripts && bun run test:plugins`
**Commit**: `feat(installer): report bootstrap drift in --check`

---

### T15: Build step in the harness installer

**Task ID**: TASK-015

**What**: Add the `bun run build` step so the render ladder's dist branch is reachable from a fresh clone driven through the harness installer.
**Where**: `scripts/install-harness.sh`
**Depends on**: T12
**Reuses**: the equivalent step at `install.sh:1026`
**Requirement**: BST-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [x] A fresh clone with no build reaches a successful render, or fails with the named `bun run build` message — never a default render
- [x] The step is skipped when `bun` is absent, matching the ladder's own branch order
- [x] Covered by a scenario in `scripts/tests/test-install-skills-bootstrap-file.sh` — scenario 13, 9 assertions, `bootstrap-file` 99 → 108
- [x] **PC-T15 — the scope of this step is the bun branch only; state that, do not widen it.** T12 measured the ladder's node branch dead: `packages/shared/dist/bootstrap/state.js` imports `../config/config-loader` with no extension, so `node -e "import('packages/shared/dist/bootstrap/index.js')"` fails `ERR_MODULE_NOT_FOUND` **even with a completed build**. The cause is pre-existing and not this feature's: 33 non-test relative imports across `packages/shared/src/bootstrap/` and `packages/shared/src/config/` carry no `.js`, while `profile-switch/` does, and `packages/shared/tsconfig.json` sets `moduleResolution: bundler`, which lets `tsc` emit them verbatim. Nothing had noticed because no unbundled node consumer of `packages/shared/dist/**` existed before T12 — both published CLIs are `#!/usr/bin/env bun` built with `bun build --target=bun`, and `apps/mcp-client/src/index.ts`, which *is* `#!/usr/bin/env node`, has `@massa-ai/shared` bundled into it. So this step makes the **bun** branch's built path reliable and matches `install.sh:1026`; a node-only machine still reaches the named error, by design (`design.md:99-105`). Record that limitation in the step's own comment rather than implying the build repairs it. The import repointing is FU-1 below, deliberately not absorbed here

**Confirmed absent before the edit**: `git grep -c "bun run build" -- scripts/install-harness.sh`
returned 0, so the step was genuinely missing rather than already present under another name.

**The step carries three preconditions, not one, and the third was nearly shipped on a false
premise.** bun absent and dry-run/uninstall are the two the task text implies. The third — skip
when `packages/shared/src/bootstrap/index.ts` is absent, which is render-bootstrap.ts's own
`BOOTSTRAP_SOURCE_ENTRY` — was added on the assumption that it protected the three sibling suites
that copy `install-harness.sh` into a shadow tree. **That assumption was wrong and the mutation
proved it**: removing the precondition left `test-install-harness-cli.sh` 34/0 and
`test-harness-single-generation.sh` 13/0, because neither asserts the harness exit code on that
path. Measured directly instead: an unguarded step in such a tree emits
`error: Script not found "build"` and turns the whole run **exit 1**. The precondition is
therefore load-bearing and was, until scenario 13d, sensed by nothing at all.

**Discrimination: 5 mutations, 5 killed**, all in `install-harness.sh`, all restored from a
`/tmp` copy and hash-verified. N1 dry-run precondition dropped → 2; N2 uninstall precondition
dropped → 1; N3 bun precondition dropped → 2; N4 the build call itself replaced by `true` → 1;
N5 the renderer-source precondition dropped → **survived on first run**, killed by 3 after 13d
was added.

**One measurement correction worth recording**: `install-harness.sh` has no `--repo-root` flag.
The first draft of scenario 13 passed one, so every harness invocation exited 2 at the unknown-flag
branch and three assertions passed vacuously — including "`--dry-run` runs no build", which was
true only because nothing ran at all. Caught by reading the pre-change red rather than the
post-change green: the red showed the *contract file* missing too, which a mere absence of the
build step cannot cause.

**Tests**: shell suite
**Gate**: full — `bun run test:scripts && bun run test:plugins`
**Commit**: `fix(installer): build before rendering the bootstrap contract`

---

### T15a: Name retained backups in the uninstall report

**Task ID**: TASK-015A

**What**: Have uninstall name every `*.massa-ai.bak-<timestamp>` it leaves in place.
**Where**: `scripts/install-skills.sh`
**Depends on**: T13
**Reuses**: `uninstall_platform`'s existing `record` calls; `installer_backup_file` (`scripts/lib/installer-shared.sh:52`), whose only production call site is `bootstrap_op` (`:627-643`)
**Requirement**: BST-05 (AC-9c)

**Tools**: MCP: NONE. Skill: NONE.

**Why this task exists.** `spec.md:106` (AC-9c) requires uninstall to leave a backup in
place **and name it in the uninstall report**. The "leave in place" half is satisfied;
the "name it" half is implemented nowhere and is named in no task's done-when. It would
otherwise reach the verification gate as an uncovered acceptance criterion.

**Done when**:
- [x] **Observed RED first** — the assertion fails against `uninstall_platform` as it stands before the change. Measured: `uninstall` 16/0 → **21 passed / 1 failed (22 total)**, and the one failure was exactly the "name it" half (`the uninstall report names the retained backup → '…/MASSA-AI.md.massa-ai.bak-2026-09-07T14-43-43-000Z' not found in output`) while the three "left in place" assertions passed. That split is itself the evidence for this task's premise: half the criterion already held, half was implemented nowhere
- [x] A backup created by an install is left in place on uninstall **and** named in the uninstall report (AC-9c, `spec.md:106`)
- [x] The round-trip fingerprint's exclusion list is **unchanged**: `*.massa-ai.bak-*` and nothing else. `design.md:419-424` freezes it deliberately so that widening it later reads as a spec change rather than a test edit. Every other post-uninstall difference is a defect in the subject, not the sensor. Verified rather than asserted: `scripts/tests/lib/installer-test-helpers.sh` is untouched and `test-install-skills-bootstrap-file.sh`'s `tree_fingerprint_no_backups` still carries the single `-name '*.massa-ai.bak-*' -prune` term. No round-trip difference appeared, so nothing had to be decided here
- [x] Covered in `scripts/tests/test-install-skills-uninstall.sh`, which is 16/0 at the start of this task — now **25/0**

**A first install creates no backup**, which is what shapes the fixture. `bootstrap_op`'s guard is
`[ "$backup" = "1" ] && [ -f "$target" ]`, and `MASSA-AI.md` does not exist on a first apply, so
the scenario has to reach the real user shape the backup exists for: apply, hand-edit the contract,
apply again.

**Two mutations survived first and drove two added sensors.** Dropping the `record "retained"` call
left the suite 22/0, because the suite runs `--verbose` and `vinfo` prints the same text — the
text assertion was sensing the console line, not the report. The criterion's "report" includes the
machine-readable one, so the scenario now also reads `--uninstall --json`. Separately, dropping the
`[ -n "$backup" ] || continue` guard also left the suite green while emitting
`"target": "", "status": "retained", "message": "Left in place: "` on **every** uninstall that
retained nothing — a report entry for an artifact that does not exist, invisible to a
"does the output contain the suffix" assertion because an empty path contains no suffix. Scenario
10 now asserts the absence of the row, not just of the path.

**Discrimination: 4 mutations after the sensors were added, 4 killed**, all restored from a `/tmp`
copy and hash-verified. P2 the glob narrowed to a suffix nothing matches → 2; P3 the backups deleted
instead of retained → 5; P4 the empty-line guard dropped → 1; P5 the `record` call dropped → 1.

**`retained` is a new status token**, chosen over reusing `changed`: the JSON summary derives its
top-level `changed` from the `changed`/`would-change` tokens alone, so an uninstall that removed
nothing and merely retained a backup would otherwise report itself as a mutation. It affects no
exit code — `--check` keys on `drift` and every action keys on `error`.

**Tests**: shell suite
**Gate**: full — `bun run test:scripts && bun run test:plugins`
**Commit**: `fix(installer): name retained backups in the uninstall report`

---

### T16: Shared CLI formatters

**Task ID**: TASK-016

**What**: `formatBootstrapInventory` and `formatBootstrapReport`, so both CLIs call one implementation instead of duplicating the profile formatters' shape a second time. (The original "~106 lines each" had no anchor and is wrong: the duplicated pair is `apps/mcp-client/src/config-cli.ts:105-142` against `apps/opencode-plugin/src/config-cli.ts:111-148`, **38 lines**, byte-identical. The reuse argument stands; the figure did not.)
**Where**: `packages/shared/src/bootstrap/format.ts`
**Depends on**: T7
**Reuses**: the output conventions of `formatProfileInventory` / `formatSwitchReport`, which are byte-identical across the two CLIs today and are exactly the duplication this task refuses to repeat
**Requirement**: BST-11

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [x] `list` output names every rule id, its default, its current state, and a one-line description (BST-11 AC-3)
- [x] The report formatter renders `written-not-wired` distinctly and prints the restart notice when required (BST-11 AC-5)
- [x] **PC-Q2 — all four statuses are rendered, not two.** `BootstrapRenderResult.status` is `written | written-not-wired | skipped | failed` (`design.md:331`), and T7 gave `skipped` a definition the design lacked: a byte-identical re-apply whose wiring is present (log `:22`). The original done-when named only `written-not-wired`, leaving `skipped` and `failed`-with-reason unspecified for the formatter. Cover every arm, and render `failed`'s and `skipped`'s `reason` — BST-10 AC-10 requires each host's outcome to be reported with its reason
- [x] Tests co-located at `packages/shared/src/bootstrap/__tests__/format.test.ts`

**Tests**: unit
**Gate**: quick — `cd packages/shared && bun test src/bootstrap`
**Commit**: `feat(bootstrap): add shared CLI formatters`

---

### T17: `bootstrap` subcommand in the mcp-client CLI

**Task ID**: TASK-017

**What**: `massa-ai-config bootstrap list|show|enable <id>|disable <id>` with `--target` and `--dry-run`.
**Where**: `apps/mcp-client/src/config-cli.ts`
**Depends on**: T8, T16
**Reuses**: the `case "profile"` dispatch shape at `:300-350` and `parseOptions` at `:87`; `reportSucceeded`'s exit-code role at `:341`
**Requirement**: BST-11

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [x] An unknown rule id exits non-zero, names the id, lists the nine valid ones, and changes no state (BST-09 AC-8)
- [x] The command works with the massa-ai MCP server unreachable (BST-11 AC-4) — asserted, since this is the recovery path when `massa-ai-router` is disabled
- [x] `--target` is honoured so the suite never writes the developer's real home. **PC-Q2 — derive the state path the way T8 did**, `path.dirname(bootstrapStateFilePath(targetHome))`: `design.md:455` cites a `defaultStatePath` in `state.ts` that does not exist there — it is private and duplicated at `profile-switch/engine.ts:60` and `variant-sync.ts:70`, exported from neither (log `:22`). T18 inherits the same correction
- [x] Help text and examples list the new subcommand
- [x] Tests at `apps/mcp-client/src/__tests__/config-cli-bootstrap.test.ts`, following the `config-cli-profile.test.ts` seam order: pre-resolve `require("@massa-ai/shared")` before `mock.module`, then `await import("../config-cli.js")`

**Tests**: unit
**Gate**: quick — `cd apps/mcp-client && bun test src/__tests__/config-cli-bootstrap.test.ts` (see PC-G1)
**Commit**: `feat(cli): add the bootstrap subcommand to massa-ai-config`

---

### T18: `bootstrap` subcommand in the opencode-plugin CLI

**Task ID**: TASK-018

**What**: The same subcommand in the twin CLI, calling the same engine and the same formatters.
**Where**: `apps/opencode-plugin/src/config-cli.ts`
**Depends on**: T17
**Reuses**: T16's formatters and T8's engine; the `case "profile"` block at `:337-387`, which differs from its twin by exactly one line (`__dirname` versus `import.meta.dirname`)
**Requirement**: BST-11

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [x] Behaviour is identical to T17 except the documented `__dirname` difference — measured, not asserted by eye: the two `case "bootstrap"` blocks are 122 lines each and differ on **exactly one**, the `findRepoRootWithMarker` argument
- [x] Tests at `apps/opencode-plugin/src/__tests__/config-cli-bootstrap.test.ts`
- [x] `cd apps/opencode-plugin && bun test src/__tests__/` passes — **not** bare `bun test` (see PC-G1)

**Tests**: unit
**Gate**: quick — `cd apps/opencode-plugin && bun test src/__tests__/config-cli-bootstrap.test.ts`
**Commit**: `feat(cli): add the bootstrap subcommand to the opencode config CLI`

---

### T18a: Stop the mcp-client config CLI suite writing the developer's real home

**Task ID**: TASK-018A

**What**: Give `apps/mcp-client/src/__tests__/` the first-import env guard its opencode twin already has, so a direct `bun test` of that directory cannot write `~/.config/massa-ai/config.json`.
**Where**: `apps/mcp-client/src/__tests__/env-setup.ts` (new), `apps/mcp-client/src/__tests__/config-cli.test.ts`
**Depends on**: T17
**Reuses**: `apps/opencode-plugin/src/__tests__/env-setup.ts` verbatim as the template, and the first-line `import "./env-setup";` convention its `config-cli.test.ts:1` already carries
**Requirement**: BST-12 (the new surfaces are guarded)

**Tools**: MCP: NONE. Skill: NONE.

**Why this task exists — it fired, it is not hypothetical.** During Phase 8 a worker ran the
documented single-file gate `bun test src/__tests__/config-cli.test.ts` and it **overwrote the
developer's real `~/.config/massa-ai/config.json`**, replacing the `embedding` block
(`ollama` / `qwen3-embedding:4b` / 2560 dims) with that suite's fixture
(`openai` / `text-embedding-3-small` / `apiKey: "k"` / 1536 dims). `database.url` and
`security.apiKey` survived. The live file's mtime moved to `2026-09-07T14:32:59`; the
pre-damage state is preserved at `~/.config/massa-ai/config.json.bak`, 4681 bytes at
`2026-08-18T15:18:31` — a size and mtime independently recorded as the *live* values in the
Phase 4 and Phase 6 execution-log rows, which is what makes that backup trustworthy.

**Mechanism, verified at source.** `config-cli.test.ts:13` sets `process.env.XDG_CONFIG_HOME`
in `beforeEach`, but `:5`'s static `import { runCli, parseOptions } from "../config-cli.js"`
hoists above it and has already frozen `CONFIG_DIR` at
`packages/shared/src/config/config-loader.ts:8` (`const CONFIG_DIR = configDir("massa-ai")`).
The env var arrives after the freeze. The suite is safe under
`bun scripts/run-tests-isolated.ts`, whose `buildChildEnv` sets the child's `XDG_CONFIG_HOME`
before the child starts — which is exactly why this has never surfaced in CI or in
`bun run test`, and only bites a developer running the file directly. Pre-existing; not
introduced by this feature.

**Done when**:
- [x] **Observed RED first**, safely: prove the current file writes outside its scratch dir *without* touching the real home — point `HOME`/`XDG_CONFIG_HOME` at a scratch dir for the observation, or assert on the resolved `CONFIG_DIR`. **Never reproduce the defect against the real `~/.config/massa-ai/`**
- [x] `apps/mcp-client/src/__tests__/env-setup.ts` mirrors the opencode twin, and `config-cli.test.ts` imports it as its **first** line, above every other import, with the same explanatory comment naming the freeze
- [x] A sensor fails if that import is ever removed or demoted below another import — the ordering is the whole contract, and a plain "it works now" test cannot see a future reorder
- [x] `cd apps/mcp-client && bun test src/__tests__/config-cli.test.ts` leaves `~/.config/massa-ai/config.json` byte-identical, verified by hash before and after
- [x] The mcp-client isolation runner still reports all groups passing (13 groups at the start of this task)

**Out of scope.** The same module-eval freeze underlies the T17/T18 deviation that
`setBootstrapRuleEnabled` writes `getConfigPath()` and so cannot be redirected by `--target`.
Fixing *that* means a `targetHome` parameter in `packages/shared`, which is a different write
set and a behaviour change — it stays a finding for the verifier, recorded as FU-5.

**Tests**: unit
**Gate**: quick — `cd apps/mcp-client && bun test src/__tests__/config-cli.test.ts`, then the full runner with `DATABASE_URL` exported
**Commit**: `test(mcp-client): stop the config CLI suite writing the real home`

---

### T19: Cross-CLI parity guard for the subcommand

**Task ID**: TASK-019

**What**: Extend the existing parity guard so a `bootstrap` behaviour that diverges between the two CLIs reddens.
**Where**: `scripts/__tests__/profile-cli-parity.test.ts`
**Depends on**: T18
**Reuses**: its own `test.each(CLIS)` shape
**Requirement**: BST-11, BST-12

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [x] The guard reaches persistence, not only `--help` text and argument validation — the existing suite would not catch an `enable` that persists in one CLI and not the other. Sensed at the seam, not in the source text: every case compares the exact argument lists each CLI hands `setBootstrapRuleEnabled` (the only writer of `config.json`) and `applyBootstrapState` (the only writer of any `MASSA-AI.md`), per CLI, for the same argv — `profile-cli-parity.test.ts:204` is the assertion the done-when names. A line-count-plus-diff over the two 122-line blocks was rejected: it is blind to a shared callee behaving differently per caller, and to a CLI that stops calling the writer while still printing the same report and exiting 0
- [x] Observed red by deliberately diverging one CLI, then reverted — four mutations, four killed, each restored from a `/tmp` copy and sha256-verified (`git checkout` never used). M1 opencode's `setBootstrapRuleEnabled` call deleted → 17/4, first failure at `:204`; M2 its boolean hardcoded to `true` → 19/2, only the `disable` cases; M3 its `--dry-run` guard defeated → 20/1, only the dry-run case; M4 mcp-client's `applyBootstrapState` call replaced by a literal → 16/5. M2 is what proves the value half is load-bearing — it persists the right id, exactly once, and only the boolean comparison sees it
- [x] Test count recorded: **9 → 21 pass / 0 fail**, 121 `expect()` calls. `bun run test:scripts` moved 1873 → **1885 pass / 2 fail across 83 files** (+12, exactly the new cases; the two documented pre-existing `pyts golden: lessons` failures, no third). The `mock.module("@massa-ai/shared")` this needs is process-global under `bun test scripts/__tests__`, so contamination was checked rather than assumed: no sibling in that directory imports the barrel at runtime (all six `git grep` hits are string literals inside fixtures), and the full-suite count confirms it

**Tests**: unit
**Gate**: quick — `bun test scripts/__tests__/profile-cli-parity.test.ts`
**Commit**: `test(cli): extend the parity guard to the bootstrap subcommand`

---

### T20: The `bootstrap` skill

**Task ID**: TASK-020

**What**: A skill charter driving the one toggle engine and relaying its per-host report.
**Where**: `skills/bootstrap/SKILL.md`
**Depends on**: T17
**Reuses**: `skills/profile/SKILL.md` as the template — its Mission, "Relaying The Result" and Restrictions sections
**Requirement**: BST-11

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [x] It names the CLI as its only front. `skills/profile/SKILL.md:23`'s "prefer MCP when connected" clause is **not** copied — no `bootstrap_*` MCP tool exists, and BST-11.5 requires the surface to work with MCP unreachable
- [x] It relays `written-not-wired` verbatim in substance, with the `--apply` remedy. All four `BootstrapRenderStatus` literals are relayed with their own meaning, plus the three lines the formatter emits outside the rows — no-host-installed (exit 0, "nothing to do", not "nothing happened"), ignored persisted state, and the restart notice
- [x] It states the host restart requirement and never claims a toggle is live before it
- [x] A scripted assertion forbids an MCP-tool reference in this file, and asserts its documented rule-id list equals the registry's nine (BST-12 AC-4) — `scripts/__tests__/bootstrap-skill-contract.test.ts`, 10 pass / 0 fail. **The ban is a tool-identifier ban, not a substring ban on "MCP", and that is load-bearing**: this file's job includes *saying* that no MCP tool exists and that the CLI survives an unreachable server, so a substring ban would be satisfied by deleting the explanation and would fire on the disclaimer itself. What is banned is any `mcp__*` name, any snake_case backticked identifier (the shape every tool in this MCP surface has — `profile_list`, `synapse_get`), and the template's preference clause; the positive claims are asserted too, so the ban cannot pass on a file that says nothing. Three mutations, three killed: M5 pasting the `skills/profile/SKILL.md:23` clause verbatim → 9/1; M6 dropping `english-code` from the documented list → 8/2, the failure printing `missing: ["english-code"]`, which is the naming AC-4 asks for; M7 flipping the documented `code-comments` default → 9/1
- [x] `skills.yml` frontmatter validation passes — the workflow's own `skills/*/SKILL.md` loop replayed locally: 4/4 ok, `skills/bootstrap/SKILL.md` included. The charter-only fields (`model_tier`, `model_hint`) are asserted absent, since this is a top-level skill and not a `skills/agents/*` charter
- [x] `scripts/install-skills.sh` picks it up with no installer edit — **the cite `:200-206` is stale; discovery is at `:216` (`SKILL_NAMES=""`) and `:223`, located by content.** Asserted in `scripts/tests/test-install-skills-apply.sh` Scenario 9, in three directions: the installer's source names no skill directory at all (`grep -cE 'skills/(bootstrap|profile|persona-router|massa-ai)[/"[:space:]]'` = **0**, the population printed beside the verdict), the copy actually lands byte-for-byte with its ownership marker and as a real directory, and the delivered bytes carry no `mcp__` identifier. Suite moved **31 → 42 pass / 0 fail** (+3 from Scenario 1's own dynamic loop, +8 new). Observed red: M8b inserting `[ "$name" != "bootstrap" ] || continue` into the discovery loop → **32/10**. Note the two directions are complementary, not redundant — M8b skips by name rather than by path literal, so Direction 1's grep stays at 0 through it and only Direction 2 fires. An earlier attempt at this mutation silently resolved to nothing (a `\Q…\E` perl pattern containing escaped slashes matches literal backslashes) and read as 42/0, i.e. as a gate catching nothing; the population was re-printed before the verdict was believed

**Tests**: contract
**Gate**: full — `bun run test:scripts && bun run test:plugins`
**Commit**: `feat(skills): add the bootstrap toggle skill`

---

### T21: Ship the skill to all four plugin bundles

**Task ID**: TASK-021

**What**: Register `skills/bootstrap/` in both hardcoded generator lists and add the gitignore entries.
**Where**: `scripts/generate-skill-artifacts.ts`
**Depends on**: T20
**Reuses**: the existing `"profile"` entries at `:138` (emit loop) and `:216-222` (`managedRootsFor`)
**Requirement**: BST-12

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [x] **Both** lists are edited — the emit loop (`collectSkillEntries`, cited `:138`, exact at HEAD) and `managedRootsFor`'s `common` array (cited `:216-222`, exact at `:220`). Proven load-bearing rather than asserted: with an unmanaged file planted in `apps/codex-plugin/skills/bootstrap/`, `--check` exits **1** with both lists edited and **0** with the `managedRootsFor` entry removed — the second run is the failure mode the done-when describes, observed rather than reasoned about
- [x] `.gitignore` gains the root-precise entry beside the `profile` one (cited `:79-82`, added at `:82`, AD-016). Verified behaviourally by `git check-ignore` on all four hosts' paths and `git ls-files` returning 0 tracked entries. Observed red: deleting the line → `generated-bundles-contract.test.ts` 24/1
- [x] `scripts/__tests__/skill-artifact-parity.test.ts` and `generated-bundles-contract.test.ts` gain their per-bundle cases. The parity file gains three: the per-host byte-identity case, a per-host structural assertion that `managedRootsFor(host)` contains the bundle, and the planted-stale-file behavioural case above. The contract file gains a `check-ignore` representative on a **different host** from `profile`'s, because the two `.gitignore` lines are independent and a shared host would let one line's deletion hide behind the other's
- [x] Observed red: `bun scripts/generate-skill-artifacts.ts --check` exits **1** both for a modified emitted file and for an unmanaged extra file — run under a scratch `XDG_CONFIG_HOME`, and never through `bun run generate:artifacts --check`, whose flag reaches only the second generator while the first repairs the drift it should report
- [x] `bun run test:plugins` passes — **142 pass / 0 fail across 10 files, unmoved from the baseline, and that non-movement is the honest result rather than a miss.** Every plugin-side roster assertion is an exact-equality array *inside an existing case*, so a new bundle widens assertions without adding cases; the new per-bundle *cases* land in `skill-artifact-parity.test.ts`, which `test:scripts` runs (1873 → **1905 pass / 2 fail across 84 files**). That the plugin runner still senses the bundle was checked, not assumed: M11, reverting claude's `install.sh` install loop to the three old names, takes that suite to **15/2**
- [x] **Scope beyond the task's stated `Where`, forced by a committed contract the task did not name.** `scripts/__tests__/installer-removal-derivation.test.ts:235-280` (AC-05.2a) reads the generator's bundle list as *the* authority and requires every literal `for name in …` loop in all four `apps/<host>-plugin/install.sh` — install path **and** uninstall path — to equal it exactly. Editing only the generator turned that gate red with four named failures. So the four installers' eight loops and their four `install-state.json` `skills:` arrays now name `bootstrap`, which is also what makes BST-11 AC-1 ("invokes the skill in any of the four hosts") true on the plugin-tarball route, not only on the `install-skills.sh` route T20 covers. Two more sites were forced by the same emit: `apps/cursor-plugin/install.sh`'s harness-bundle exclusion `case` — omitting it leaks `bootstrap/` into the Cursor command-skill cache mislabeled as a command, exactly the `profile` defect that `case` line's own comment records — and `scripts/lib/workflow-commands.ts`'s `RESERVED_BUNDLE_ROOTS`, whose omission failed `cursor-plugin/__tests__/manifest.test.ts`. `cursor-plugin/__tests__/install.test.ts` had a **local duplicate** of that constant; it now imports the shared one instead, because a bundle added to one copy and not the other is invisible — which is how this was found. Observed red for the exclusion pair: M10, dropping `bootstrap` from the `case`, fails both the scan-derived stem equality and the named WFC-08 guard

**Tests**: contract
**Gate**: full — `bun run test:scripts && bun run test:plugins && bun scripts/generate-skill-artifacts.ts --check`
**Commit**: `feat(build): ship the bootstrap skill to all four plugin bundles`

---

### T22: Gate the annotation reference on the toggle

**Task ID**: TASK-022

**What**: State that §1 and §2 apply only while `code-comments` is enabled, and that §3 applies unconditionally.
**Where**: `skills/massa-ai/references/code-annotation.md`
**Depends on**: T2
**Reuses**: the reference's existing section structure
**Requirement**: BST-08

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [x] The gating sentence names the rule id and the default (off)
- [x] §3 is explicitly excluded from the gate
- [x] A scripted assertion in the source-contract suite covers both statements, so the wording cannot drift out
- [x] Regenerated bundles stay in sync — `bun scripts/generate-skill-artifacts.ts --check` passes

**Tests**: contract
**Gate**: full — `bun run test:scripts && bun run test:plugins`
**Commit**: `docs(references): gate doc blocks and rationale comments on the code-comments rule`

---

### T23: Point the naming reference at the wider English rule

**Task ID**: TASK-023

**What**: Have §Language cite the `english-code` rule as the wider contract instead of restating it.
**Where**: `skills/massa-ai/references/naming-standards.md`
**Depends on**: T2
**Reuses**: the existing §Language section (`:31-39` before this task; `:31-44` after)
**Requirement**: BST-07

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [x] §Language stays normative for identifier naming and cites the bootstrap rule for the wider class, per AD-019's one-normative-reference discipline
- [x] No sentence is duplicated between the two
- [x] Covered by the source-contract assertion

**Tests**: contract
**Gate**: full — `bun run test:scripts && bun run test:plugins`
**Commit**: `docs(references): cite the english-code rule from naming standards`

---

### T24: CHANGELOG entry

**Task ID**: TASK-024

**What**: An `[Unreleased]` entry describing the delivery change and the two behaviour changes.
**Where**: `CHANGELOG.md`
**Depends on**: T13, T21
**Reuses**: the Keep a Changelog headings already in the file
**Requirement**: BST-12

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [x] Filed under `### Changed` and `### Added`, so the release derives a minor bump. `[Unreleased]` was empty before this entry; both headings carry bullets, and `CONTRIBUTING.md:145` makes minor win when a minor-class and a patch-class heading both have content — no `### Fixed` heading was added, so the derivation is unambiguous
- [x] Names the Claude fix explicitly — first bullet under `### Changed`, stated as the measured premise behind the change rather than a side effect: Claude documents reading `CLAUDE.md` and not `AGENTS.md`, and no installer here wrote `~/.claude/CLAUDE.md`, so the block was inert on Claude unless hand-imported
- [x] Names the `code-comments` default-off behaviour change, together with why omission alone was insufficient (`references/code-annotation.md` mandates both obligations on its own) and the §3 carve-out
- [x] The skip-ci marker is never written literally anywhere in the entry, the commit body, or the PR body — the entry contains no bracketed CI directive of any kind
- [x] Two user-facing limits are stated rather than left for a user to discover: rendering now requires `bun` on `PATH` (FU-1, the dist fallback cannot load under plain Node), and `--target` scopes the render but never the persisted preference (FU-5)

**Gate evidence (build level, run in full):** `oxlint` exit 0; `bunx turbo run type-check --force` **6 successful, 6 total**; `bunx turbo run build --force` **6 successful, 6 total, 0 cached**; `bun run test:scripts` **1909 pass / 2 fail across 84 files** (the two documented pre-existing `pyts golden: lessons` cases — exit 1 comes from those and nothing else); `bun run test:plugins` **142 / 0 across 10 files**. Working tree carried only `CHANGELOG.md` after the build, so the build produced no untracked drift.

> **Corrected after the verification gate.** This row first cited a plain `bun run build` at "6 successful, 6 total". That run reported `Cached: 6 cached, 6 total` and `71ms >>> FULL TURBO` — a **cache replay, not a build**, so the figure was not evidence for what it was quoted to prove. Re-run with `--force` it is `0 cached, 6 total` and the conclusion holds, but the original citation did not support it. A cached result is not a measurement; the `--force` form is the one this gate needs.

**Tests**: none — the coverage matrix assigns no test type to a changelog entry; the CI merge gate is the sensor
**Gate**: build
**Commit**: `docs(changelog): record the bootstrap file and rule toggles`

---

### T26: Make the renderer honour the resolved Codex home

**Task ID**: TASK-026 — **verification fix, iteration 1 of a maximum 3**

**What**: Stop `packages/shared/src/bootstrap/` hardcoding `.codex`, so the pointer block names the contract file that was actually written and a toggle re-renders the contract the host actually loads.
**Where**: `packages/shared/src/bootstrap/render.ts`, `packages/shared/src/bootstrap/engine.ts`, `scripts/render-bootstrap.ts`, `scripts/install-skills.sh`, plus their suites
**Depends on**: the verification gate
**Requirement**: BST-04 AC-6, BST-10 AC-10

**Tools**: MCP: NONE. Skill: NONE.

**Why this exists — reproduced, not argued.** `render.ts:135-140`'s `HOST_CONFIG_DIR` maps
`codex: [".codex"]`, and its own docblock says it *mirrors* `installer_host_config_dir`. That
is the map `PC-B3` rejected **by name** for the installer, precisely because it hardcodes
`.codex` while `install-skills.sh` resolves `CODEX_HOME` with `~/.codex` preferred and
`~/.config/codex` as fallback. The installer half was fixed (`contract_path`, `:705`); the
renderer half was never checked, and the orchestrator's own amendment is the reason it was
not — a fix scoped to the file that provoked it, with the identical site one module over left
standing.

Measured on a scratch home containing `.config/codex` and no `.codex`, via
`install-skills.sh --apply --platform codex --target <scratch> --yes`:

- contract written to `<scratch>/.config/codex/MASSA-AI.md` (11 KB) — **correct**
- pointer block in `<scratch>/.config/codex/AGENTS.md` names `<scratch>/.codex/MASSA-AI.md`
- `<scratch>/.codex` **does not exist**

So Codex on that layout follows the pointer to a nonexistent file and loads nothing. The
toggle path is worse: it writes a stray `~/.codex/MASSA-AI.md`, never touches the contract the
host loads, reports `written-not-wired` and exits non-zero — **every toggle is a no-op that
reports failure**. `--check` exits 0 over all of it, because apply and check share the
renderer.

**Done when**:
- [ ] **Observed RED first** with a committed sensor, using the scratch-home reproduction above — the existing `test-install-skills-cli.sh:137-141` covers this layout but asserts only file *existence*, never the pointer's contents, which is why it passed
- [ ] On a home with `.config/codex` and no `.codex`: the pointer names the file that was written, and no stray `~/.codex/` is created by either the installer or the toggle engine
- [ ] On a home with `.codex`: unchanged behaviour, asserted, so the fix is not a swap of one hardcoded branch for another
- [ ] A toggle re-renders the contract the host actually loads on both layouts, reporting `written` (or `skipped`) rather than `written-not-wired`
- [ ] `--check` reports drift on the fallback layout rather than exiting 0 over it
- [ ] **Recommended approach**, not mandatory: thread the resolved root explicitly rather than re-deriving it. `install-state.json` already records the correct `platforms.codex.root` and `engine.ts` already calls `readInstallState`; `install-skills.sh` already has `platform_root`. Re-probing the filesystem inside the renderer would put the same resolution in two languages, which is the R3 shape `design.md:121-125` rejected. If you take a different route, say why
- [ ] The other three hosts have single-valued config dirs; do not generalise the mechanism beyond what Codex needs

**Tests**: unit + shell suite
**Gate**: full — `bun run test:scripts && bun run test:plugins`, plus `cd packages/shared && bun test src/bootstrap` and the shell battery run directly with `TMPDIR=/tmp`
**Commit**: `fix(bootstrap): honour the resolved Codex home when rendering`

---

### T25: Close out the spec artifacts

**Task ID**: TASK-025

**What**: Update and commit `STATE.md`, `HANDOFF.md` and `FEATURES.json` on the branch before any push.
**Where**: `.specs/project/STATE.md`
**Depends on**: T24
**Reuses**: the existing STATE Current/Previous rotation and the `HANDOFF.md` rotation contract
**Requirement**: BST-12

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:
- [ ] `HANDOFF.md` is **rotated**, not replaced: rename the current section to Previous first, then prepend, then assert the section count grew. Note the current `HANDOFF.md` body is still `installer-prune-and-test-scoping` (2026-08-17) — this feature has never appeared in it
- [ ] `FEATURES.json` records the feature complete with all four phases true. **PC-A1 — three of those fields have been wrong for the feature's whole life**: `:1454-1457` still reads `design: false, tasks: false, execute: false` while both artifacts are written and 13 commits have landed
- [ ] `.specs/project/STATE.md` gains this feature's entry — it currently has **zero** occurrences of the slug across 4320 lines, so the feature is invisible to a resume that reads state from `.specs/` as the workflow requires
- [ ] `bun skills/massa-ai/scripts/check_specs_delivered.ts bootstrap-file-and-rule-toggles --root .` exits 0
- [ ] **PC-B6 — the order is T24 → independent verification → T25, and this task commits `validation.md` with the rest.** The original "No commit lands between this one and PR creation" contradicted the workflow's own mandatory final gate: `workflows/spec-driven.md:117` has the verification-agent always run automatically at the end of Execute and write `.specs/features/<slug>/validation.md`, i.e. after T24. T25 must therefore land last, carrying that report. `FEATURES.json:1465` already declares a `validation.md` path for a file that does not exist, and **T25's own gate cannot catch it** — `check_specs_delivered.ts:47` lists `validation.md` in `FEATURE_OPTIONAL`, so the gate exits 0 with the file absent. Verify the file exists by reading it, not by the gate's exit code
- [ ] No commit lands between this one and PR creation. Any fix task the verifier's ranked gaps produce lands **before** T25, and T25 is then re-run

**Tests**: none — the coverage matrix assigns no test type to spec artifacts; `check_specs_delivered.ts` is the sensor
**Gate**: build
**Commit**: `docs(specs): close out bootstrap-file-and-rule-toggles`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 10 → Phase 11

Phase 1:   T1 ──→ T2
Phase 2:   T3 ──→ T4
Phase 3:   T5 ──→ T6
Phase 4:   T7 ──→ T8
Phase 5:   T9 ──→ T10 ──→ T11
Phase 6:   T12 ──→ T13 ──→ T13a
Phase 7:   T14 ──→ T15 ──→ T15a
Phase 8:   T16 ──→ T17 ──→ T18
Phase 8b:  T18a
Phase 9:   T19 ──→ T20 ──→ T21
Phase 10:  T22 ──→ T23
Phase 11:  T24 ──→ T25
```

Execution is strictly sequential — there is no intra-phase parallelism.

**Ordering rationale.** Phase 1 and Phase 5 lead with a sensor that must be observed red. Writing the renderer and the engine before the installer's byte-preservation, delete mode and drift branch is the ordering that leaves a working-looking wrong state: the shell suite would pass against a scratch home with fresh directories, mocked binaries and pre-trimmed fixtures, the toggle would demo correctly, and the 0-byte `MASSA-AI.md` and the unwired-host defects would ship undetected.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 test file | ✅ Granular |
| T2 | 1 source file | ✅ Granular |
| T3 | 1 module + its barrel export | ✅ Granular |
| T4 | 1 module | ✅ Granular |
| T5 | 1 module | ✅ Granular |
| T6 | 1 module | ✅ Granular |
| T7 | 1 module | ✅ Granular |
| T8 | 1 module | ✅ Granular |
| T9 | 1 shell suite | ✅ Granular |
| T10 | 1 function in 1 file | ✅ Granular |
| T11 | 1 module | ✅ Granular |
| T12 | 1 script | ✅ Granular |
| T13 | 2 functions in 1 file, one concern | ✅ Granular |
| T13a | 8 assertions across 3 suites, one concern (repoint sensors at the delivered contract) | ✅ Granular |
| T14 | 1 function in 1 file | ✅ Granular |
| T15 | 1 step in 1 file | ✅ Granular |
| T15a | 1 record call in 1 function | ✅ Granular |
| T16 | 1 module | ✅ Granular |
| T17 | 1 subcommand in 1 file | ✅ Granular |
| T18 | 1 subcommand in 1 file | ✅ Granular |
| T18a | 1 new guard file + 1 import line | ✅ Granular |
| T19 | 1 test file | ✅ Granular |
| T20 | 1 charter | ✅ Granular |
| T21 | 2 list entries in 1 file + gitignore | ✅ Granular |
| T22 | 1 reference | ✅ Granular |
| T23 | 1 reference | ✅ Granular |
| T24 | 1 file | ✅ Granular |
| T25 | 1 close-out | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | phase head | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | None | phase head | ✅ Match |
| T4 | None | T3 → T4 (order, not dependency) | ✅ Match — sequential within phase |
| T5 | T3, T4 | prior phases | ✅ Match |
| T6 | T4, T5 | T5 → T6 | ✅ Match |
| T7 | T4 | prior phase | ✅ Match |
| T8 | T5, T6, T7 | T7 → T8 | ✅ Match |
| T9 | None | phase head | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T9 | T10 → T11 (order) | ✅ Match |
| T12 | T6, T8 | prior phases | ✅ Match |
| T13 | T10, T11, T12 | T12 → T13 | ✅ Match |
| T13a | T13 | T13 → T13a | ✅ Match |
| T14 | T13 | prior phase | ✅ Match |
| T15 | T12 | prior phase | ✅ Match |
| T15a | T13 | prior phase | ✅ Match |
| T16 | T7 | prior phase | ✅ Match |
| T17 | T8, T16 | T16 → T17 | ✅ Match |
| T18 | T17 | T17 → T18 | ✅ Match |
| T18a | T17 | own phase, after T18 | ✅ Match |
| T19 | T18 | prior phase | ✅ Match |
| T20 | T17 | prior phase | ✅ Match |
| T21 | T20 | T20 → T21 | ✅ Match |
| T22 | T2 | prior phase | ✅ Match |
| T23 | T2 | prior phase | ✅ Match |
| T24 | T13, T21 | prior phases | ✅ Match |
| T25 | T24 | T24 → T25 | ✅ Match |

No dependency points forward into a later phase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Repo script (test) | unit/contract | contract | ✅ OK |
| T2 | Harness source content | contract | contract | ✅ OK |
| T3 | shared config seam | unit | unit | ✅ OK |
| T4 | shared domain module | unit | unit | ✅ OK |
| T5 | shared domain module | unit | unit | ✅ OK |
| T6 | shared domain module | unit | unit | ✅ OK |
| T7 | shared domain module | unit | unit | ✅ OK |
| T8 | shared domain module | unit | unit | ✅ OK |
| T9 | Bash installer behaviour | shell suite | shell suite | ✅ OK |
| T10 | Bash installer behaviour | shell suite | shell suite | ✅ OK |
| T11 | Bash installer behaviour | shell suite | shell suite | ✅ OK |
| T12 | Repo script | unit | unit | ✅ OK |
| T13 | Bash installer behaviour | shell suite | shell suite | ✅ OK |
| T13a | Bash installer behaviour | shell suite | shell suite | ✅ OK |
| T14 | Bash installer behaviour | shell suite | shell suite | ✅ OK |
| T15 | Bash installer behaviour | shell suite | shell suite | ✅ OK |
| T15a | Bash installer behaviour | shell suite | shell suite | ✅ OK |
| T16 | shared domain module | unit | unit | ✅ OK |
| T17 | Published CLI subcommand | unit | unit | ✅ OK |
| T18 | Published CLI subcommand | unit | unit | ✅ OK |
| T18a | Published CLI subcommand (test harness) | unit | unit | ✅ OK |
| T19 | Repo script (test) | unit | unit | ✅ OK |
| T20 | Harness source content | contract | contract | ✅ OK |
| T21 | Generated plugin bundles | contract | contract | ✅ OK |
| T22 | Harness source content | contract | contract | ✅ OK |
| T23 | Harness source content | contract | contract | ✅ OK |
| T24 | Changelog | none | none | ✅ OK |
| T25 | Spec artifacts | none | none | ✅ OK |

`Tests: none` appears only where the matrix assigns no test type, and each such row names its non-test sensor.

---

## Follow-up Findings — deliberately not absorbed by this feature

Recorded here so they are not lost, and explicitly out of scope. Each names why absorbing
it would widen this feature past its spec.

**FU-1 — `packages/shared/dist` is not loadable by an unbundled node consumer.** 33
non-test relative imports across `packages/shared/src/bootstrap/` and
`packages/shared/src/config/` carry no `.js` extension, while `profile-switch/` uses it;
`packages/shared/tsconfig.json` sets `moduleResolution: bundler`, so `tsc` typechecks and
emits both forms verbatim. Measured:
`node -e "import('packages/shared/dist/index.js')"` → `ERR_MODULE_NOT_FOUND: Cannot find
module '…/dist/config/config-loader' imported from …/dist/config/index.js`. This predates
the feature and had no consumer: both published CLIs are `#!/usr/bin/env bun` built with
`bun build --target=bun`, and `apps/mcp-client/src/index.ts` — the one `#!/usr/bin/env
node` entry — has `@massa-ai/shared` bundled into it by the same build. T12's ladder is
the first unbundled node consumer in the repository. **Consequence to state plainly:**
after T13, `scripts/install-skills.sh` on a machine without `bun` aborts every host with a
named error, where before this feature it needed neither `bun` nor a build. Fixing it
means repointing a module this feature does not otherwise own, for no other beneficiary.
See T15's `PC-T15` bullet.

**FU-2 — `package.json:31` swallows `--check` for the first generator.**
`"generate:artifacts"` is an `&&` chain, so `bun run generate:artifacts --check` appends
the flag only to the second generator while the first runs in write mode and repairs the
drift it was meant to report. `spec.md:204` (P2 AC-1) names the broken form; `design.md`
and this artifact both override it with the direct form, and CI already uses the direct
form (`.github/workflows/ci.yml:238`). `scripts/worktree-verify.sh:286` still uses the
broken one. Repo-wide argument forwarding is the real fix.

**FU-3 — `massa-ai-config set` still round-trips through `loadConfig`.**
`apps/mcp-client/src/config-cli.ts:205-215` reads with the permissive loader that returns
defaults on a parse failure, then writes the whole document — the same defect
`readRawConfigStrict` was introduced to close on the toggle path. A malformed
`config.json` would be overwritten with defaults, destroying `security.apiKey` and
`database.url`. Recorded at Design time (`design.md:437`) and deliberately not fixed
inside this feature.

**FU-5 — `setBootstrapRuleEnabled` cannot be redirected by `--target`.** It takes no path
and writes `getConfigPath()`, frozen at module-eval time by
`packages/shared/src/config/config-loader.ts:8`. So both CLIs' `--target` scopes the
*render* — the four `MASSA-AI.md` files, which is the risk `design.md:455`/`:480` names —
while the persisted preference always lands at `~/.config/massa-ai/config.json`, which is
what BST-10 AC-11 specifies anyway. T17 mitigates rather than fixes: when
`bootstrapStateFilePath(targetHome)` is not that file, the CLI names both paths on stderr
instead of silently rendering from a state the toggle never touched. A real fix means a
`targetHome` parameter on `setBootstrapRuleEnabled` in `packages/shared` — a different write
set and a behaviour change. **This is the same module-eval freeze as T18a's subject**; one
root cause, two symptoms, and T18a closes only the test-harness one.

**FU-6 — a closed feature's validation record claims a gap that has since been closed.**
`.specs/features/workflow-reuse-naming-figma/validation.md:48` says NAME-01's rule content
"has no committed regression sensor", and `:113` records a mutation deleting the whole
`## Language` block as **❌ Survived**, with 0 failures across a 7-file, 355-test sweep. That
was true when written and is false now: `scripts/__tests__/workflow-harness-contract.test.ts:666-671`
is an explicit "NAME-01 content sensor" pinning `## Language` plus the literals
`Convert any non-English source term to English` and `Portuguese is the primary case`. It is
not theoretical — it fired on T23's first draft and produced a third `test:scripts` failure.
Left uncorrected on purpose: a `validation.md` is a point-in-time record of one feature's
gate, and editing another feature's closed evidence would be rewriting history rather than
recording it. Worth a one-line amendment there by whoever owns that feature next. The general
shape is the recurring one — a status field is a claim, and it goes stale silently.

---

## Artifact-Store Evidence

- **Active artifact key:** `.specs/features/bootstrap-file-and-rule-toggles/tasks.md`
- **Version:** 4 (initial write; +Plan Challenge amendments; +T13a/T15a; +T18a and FU-5 by user ruling)
- **Checksum:** recorded in the Tasks completion report after write (`shasum -a 256`).
