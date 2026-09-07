# Bootstrap File And Rule Toggles Specification

- **Feature name:** Bootstrap File And Rule Toggles
- **Slug:** `bootstrap-file-and-rule-toggles`
- **Requirement ID prefix:** `BST`
- **Workflow:** `spec-driven` · **Session:** `spec-bootstrap-file-and-rule-toggles`
- **projectId:** `massa-ai`

## Problem Statement

The massa-ai startup contract ships as a 290-line block pasted verbatim into every
host's `AGENTS.md` by `scripts/install-skills.sh`. That shape has three defects. It
is unreadable as a unit and unowned as a file, so a user who wants one rule off has
to hand-edit a generated block that the next `--apply` overwrites. It carries a
conditional RTK section that is not part of massa-ai's contract. And on Claude Code
it is never loaded at all: Claude's own documentation states "Claude Code reads
`CLAUDE.md`, not `AGENTS.md`", while the installer writes only `~/.claude/AGENTS.md`
and no installer in this repository ever writes `~/.claude/CLAUDE.md` (verified:
`grep -rn "CLAUDE.md" scripts/install-skills.sh scripts/install-harness.sh
install.sh` returns zero hits).

This feature moves the contract body into a first-class `MASSA-AI.md` per host, wires
each host to load it through that host's own real mechanism, makes every rule in it
individually switchable through a command, drops RTK, and adds two new rules — an
English-only rule for generated code and comments, and a code-comment rule that
defaults off.

## Goals

- [ ] The startup contract lives in one owned file per host, `MASSA-AI.md`, rendered from the single source `skills/AGENTS.md`.
- [ ] Each of the 9 bootstrap rules can be switched on or off individually from a host command, with the change visible in the rendered `MASSA-AI.md`.
- [ ] Claude Code loads the contract for the first time (today it does not), through a managed `@MASSA-AI.md` import.
- [ ] RTK leaves the contract; English-only code and a default-off code-comment rule enter it.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| Removing `~/.claude/RTK.md` or the user's own RTK setup | The RTK rules leaving massa-ai's contract does not mean deleting a user-owned file the installer never wrote. |
| Making Cursor read a user-level global rules file | Cursor publishes no user-level global rules path; only Settings → Rules and project-root `AGENTS.md`. Already warned at `scripts/install-skills.sh:674`. Unchanged by this feature. |
| Per-project (repo-local) rule toggles | The toggles are machine-level agent configuration. A per-project override is a second precedence layer with its own conflict rules; not requested. |
| Per-host divergent toggle state | One global state applied to every installed host (see assumption A4). |
| Changing what any rule *says* beyond the RTK removal and the two new rules | This feature changes delivery and switchability, not the wording of existing policies. |
| Turning off test-coverage requirements | `references/code-annotation.md` §3 (Tests) is load-bearing for the spec-driven Execution Contract; the comment toggle never reaches it (BST-08). |
| A Web UI **toggle** surface | The requested surface is a host command. The portal is a separate delivery. A read-only inspection field is not excluded — see the amendment below. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| A1 — Codex and Cursor delivery | A managed pointer block of about 6 lines in `<host>/AGENTS.md` instructing the agent to read `<host>/MASSA-AI.md` with its Read tool | Neither host has an import directive: Codex's `project_doc_fallback_filenames` renames the file searched, it does not include a second file; Cursor reads no user-level file at all. User chose this over pasting the full body. | y |
| A2 — Claude and OpenCode delivery | Their real native loaders — `@MASSA-AI.md` in `~/.claude/CLAUDE.md`, and an `instructions` entry in the OpenCode config | "Make the harnesses load this file" is satisfied literally where a loader exists; a pointer would be strictly weaker on exactly the two hosts that do not need it. | y |
| A3 — Toggle state location | `~/.config/massa-ai/config.json`, key `bootstrap.rules` | `config.json` is the documented runtime configuration source with `env > config.json > defaults` precedence; `install-state.json` records installer facts, not user preferences. | n |
| A4 — Toggle scope | One global rule state, applied to every host recorded in `install-state.json` on write | The user's request is "turn a feature off", not "turn it off on Codex only". A `--host` flag would split one contract into four divergent ones with no stated need. | n |
| A5 — Rendering of a disabled rule | The rule's block is omitted from `MASSA-AI.md`, except where omission alone is not sufficient (see A6) | Omission is what "off" means, and it is also the only rendering that recovers the context the rule costs. | n |
| A6 — `code-comments` off must be stated, not omitted | When `code-comments` is off, `MASSA-AI.md` emits an explicit negative directive rather than nothing | `references/code-annotation.md` independently mandates doc blocks and rationale comments. Silence would let the reference win and the toggle would read as broken. | n |
| A7 — Scope of the `code-comments` toggle | `references/code-annotation.md` §1 (API doc block) and §2 (rationale comment) only | User-selected. §3 (Tests) is not a comment and is load-bearing for the Execute gate. | y |
| A8 — `massa-ai-router` is toggleable | Yes, with no exception, per the user's explicit choice | Recorded risk: disabling it removes the router that reads the contract. The `massa-ai-config bootstrap` CLI stays reachable because it is a binary, not a rule (BST-11.5). | y |
| A9 — Fold of non-rule prose | `Contract Ownership`, `Runtime Contract Pointer` and the `massa-ai` line of `Skill Summary` render as part of the `massa-ai-router` rule | They exist only to point at the router; as standalone toggles they would be prose with no behavior to switch. | n |
| A10 — `MASSA-AI.md` with every rule off | Still written, carrying a header stating that every rule is disabled | An absent file is indistinguishable from a failed install; a stated empty contract is not. | n |
| A11 — OpenCode config path | Resolved through the existing `scripts/lib/opencode-config.cjs` (`opencode.jsonc` → `opencode.json` → create), never a hardcoded filename | That module is already the single resolve/parse/write contract for both OpenCode installers and tolerates JSONC. | n |
| A12 — Admin Portal section for `bootstrap` | One read-only `json` field showing the persisted override map, whose guide directs the user to `massa-ai-config bootstrap enable\|disable <id>` | Forced by a pre-existing enforced contract, not chosen: `apps/web-ui/src/static/views/config-sections.ts` declares `CONFIG_SECTIONS_BY_KEY` as a mapped type over every `ConfigSectionKey`, and `installer-config-template.test.ts` requires a matching installer-template entry. Adding `bootstrap` to `MassaAiConfig` — which the design requires — makes both fire. The three options were: add the section, leave the config key untyped, or weaken the enforcing tests. The third is forbidden and the second contradicts the design, so the first is the only one left. | n |

> **Amended during Execute, Phase 2 (T4).** The out-of-scope row above originally
> excluded "a Web UI surface for the toggles" without qualification. That was written
> before the type-level consumer contract was known. What ships is deliberately **not**
> a toggle surface — there is no boolean field per rule id, because the nine ids live in
> `packages/shared/src/bootstrap/rules.ts` and a per-id field list would have to be
> hand-synced with that registry forever. A per-rule Web UI toggle remains out of scope
> and is still a separate delivery.

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Contract lives in MASSA-AI.md and each host loads it ⭐ MVP

**User Story**: As a massa-ai user, I want the startup contract in its own `MASSA-AI.md`
that my harness loads, so that the contract is a file I can read and own instead of a
generated block buried in a rules file.

**Why P1**: Every other requirement renders into or reads from this file. Without it there
is nothing to toggle.

**Acceptance Criteria** (each line is one EARS pattern):

1. WHEN `scripts/install-skills.sh --apply` runs for a host THEN the installer SHALL write the rendered contract to that host's `MASSA-AI.md` at `~/.claude/MASSA-AI.md`, `$CODEX_HOME/MASSA-AI.md`, `~/.cursor/MASSA-AI.md`, or `~/.config/opencode/MASSA-AI.md`. <!-- BST-01 -->
2. The rendered `MASSA-AI.md` SHALL be delimited by the existing `<!-- massa-ai:bootstrap:start -->` and `<!-- massa-ai:bootstrap:end -->` marker pair, so that ownership detection and removal reuse the current marker contract. <!-- BST-01 -->
3. WHEN `--apply` runs for host `claude` THEN the installer SHALL write a managed block containing the line `@MASSA-AI.md` into `~/.claude/CLAUDE.md`, creating that file when absent and preserving all content outside the markers. <!-- BST-02 -->
4. IF `~/.claude/CLAUDE.md` already contains content outside the managed markers THEN the installer SHALL leave that content byte-identical. <!-- BST-02 -->
5. WHEN `--apply` runs for host `opencode` THEN the installer SHALL add the absolute path of `~/.config/opencode/MASSA-AI.md` to the `instructions` array of the config file resolved by `scripts/lib/opencode-config.cjs`, adding the array when absent and adding no duplicate entry on re-run. <!-- BST-03 -->
6. WHEN `--apply` runs for host `codex` or `cursor` THEN the installer SHALL write a managed pointer block of at most 10 lines into that host's `AGENTS.md`, naming the absolute path of that host's `MASSA-AI.md` and instructing the agent to read it before substantive work. <!-- BST-04 -->
7. The managed pointer block SHALL contain no policy text of its own, so that `AGENTS.md` never becomes a second copy of the contract. <!-- BST-04 -->
8. WHEN `--apply` runs against a host whose `AGENTS.md` still carries the pre-migration full bootstrap block THEN the installer SHALL replace it with the new shape for that host, leaving no bootstrap marker pair holding policy text in `AGENTS.md` on `claude` or `opencode`. <!-- BST-05 -->
9. WHEN `scripts/install-skills.sh --uninstall` runs for a host THEN the installer SHALL remove that host's `MASSA-AI.md`, its managed block in `AGENTS.md` or `CLAUDE.md`, and its `instructions` entry, and SHALL leave every other line of those files unchanged. <!-- BST-05 -->
9a. WHEN uninstall removes the managed block from a file this installer created, and that block was the file's only content, THEN the installer SHALL unlink the file rather than leave it empty. <!-- BST-05 -->
9b. The installer SHALL unlink `MASSA-AI.md` on uninstall rather than write it empty, because for that file the managed block is the whole file. <!-- BST-05 -->
9c. WHERE a `*.massa-ai.bak-<timestamp>` backup was created by an install, uninstall SHALL leave it in place and SHALL name it in the uninstall report. <!-- BST-05 -->

> **Amended after the Plan Challenge gate.** AC-9 originally stood alone and its
> "byte-identical" success criterion was false by construction in three states that
> one ordinary apply-then-uninstall round trip reaches: a `CLAUDE.md` this installer
> created (`removeBlock` returns `""` and the caller writes it, leaving an empty file
> where none existed), an `opencode.jsonc` this installer created (left holding `{}`),
> and the timestamped backups every write leaves behind. AC-9a/9b/9c decide each case
> instead of leaving the criterion to be satisfied by weakening the sensor. The
> round-trip fingerprint excludes `*.massa-ai.bak-*` and nothing else; that exclusion
> list is frozen in `design.md` so widening it later reads as a spec change rather
> than a test edit.
10. WHEN `scripts/install-skills.sh --check` runs after a successful `--apply` with no source change THEN the command SHALL exit 0. <!-- BST-01 -->
11. IF the OpenCode config file cannot be parsed THEN the installer SHALL abort that host with a named error and SHALL write no partial change to it. <!-- BST-03 -->

**Independent Test**: Run `--apply --target <tmp> --yes` against a scratch home; assert the four `MASSA-AI.md` files exist, that `CLAUDE.md` holds `@MASSA-AI.md`, that the OpenCode config `instructions` array holds the path, that `codex`/`cursor` `AGENTS.md` are pointer-only, then `--uninstall` and assert the scratch home is back to its pre-install content.

---

### P1: Every bootstrap rule is individually switchable ⭐ MVP

**User Story**: As a massa-ai user, I want to turn any single rule of the startup contract
off, so that I keep the parts I want without hand-editing a generated file.

**Why P1**: This is the requested capability; the file move exists to make it possible.

**Acceptance Criteria**:

1. The rule registry SHALL define exactly these 9 rule ids: `caveman`, `massa-ai-router`, `persona-router`, `dedupe-guardrails`, `plan-challenge`, `conversation-feedback`, `indexing-hygiene`, `english-code`, `code-comments`. <!-- BST-09 -->
2. The rule registry SHALL default every rule to enabled except `code-comments`, which SHALL default to disabled. <!-- BST-08 -->
3. The toggle engine SHALL accept every one of the 9 rule ids for both `enable` and `disable`, rejecting no id as protected. <!-- BST-09 -->
4. WHEN a rule is disabled THEN the next render SHALL omit that rule's block from `MASSA-AI.md`. <!-- BST-10 -->
5. WHILE `code-comments` is disabled the rendered `MASSA-AI.md` SHALL carry an explicit directive stating that generated code gets no API doc blocks and no rationale comments, overriding `references/code-annotation.md` §1 and §2. <!-- BST-08 -->
6. The rendered `MASSA-AI.md` SHALL never alter the test-coverage requirement of `references/code-annotation.md` §3 in any toggle state. <!-- BST-08 -->
7. WHEN the same rule state is rendered twice THEN the two outputs SHALL be byte-identical. <!-- BST-10 -->
8. IF a rule id passed to `enable` or `disable` is not in the registry THEN the command SHALL exit non-zero, name the unknown id, and list the valid ids, changing no state. <!-- BST-09 -->
9. WHEN every rule is disabled THEN the render SHALL still produce a `MASSA-AI.md` whose body states that every massa-ai bootstrap rule is disabled. <!-- BST-10 -->
10. WHEN a toggle is applied THEN every host recorded in `install-state.json` SHALL be re-rendered in the same operation, and each host's outcome SHALL be reported as written, written-not-wired, skipped with a reason, or failed with a reason. <!-- BST-10 -->
10a. IF a host's contract file was written but that host has no artifact that loads it — no `@MASSA-AI.md` import, no pointer block, no `instructions` entry — THEN the report SHALL classify that host `written-not-wired` and SHALL name `scripts/install-skills.sh --apply` as the remedy. <!-- BST-10 -->
10b. WHERE a rule state cannot be read during an install-time render, the installer SHALL render the registry defaults, SHALL emit a named warning identifying the file and the parse failure, and SHALL NOT write `config.json`. <!-- BST-10 -->
11. The persisted rule state SHALL live under the `bootstrap.rules` key of `~/.config/massa-ai/config.json`. <!-- BST-10 -->
12. IF the persisted state names a rule id absent from the registry THEN the renderer SHALL ignore that entry and report it once, rather than failing the render. <!-- BST-10 -->

**Independent Test**: Disable `plan-challenge`, render, and assert the Plan Challenge policy block is absent from every host's `MASSA-AI.md` and present again after `enable`.

---

### P1: A host command drives the toggles ⭐ MVP

**User Story**: As a massa-ai user, I want to run a command inside my harness to list and
switch the rules, so that I never edit a generated file by hand.

**Why P1**: The user asked for a command in the harnesses, not only a library.

**Acceptance Criteria**:

1. WHEN a user invokes the `bootstrap` skill in any of the four hosts THEN the skill SHALL drive the one toggle engine and report its per-host result, implementing no second toggle path of its own. <!-- BST-11 -->
2. The command surface SHALL expose `list`, `show`, `enable <rule-id>`, and `disable <rule-id>`. <!-- BST-11 -->
3. WHEN `list` runs THEN the output SHALL name every rule id, its default, its current state, and a one-line description. <!-- BST-11 -->
4. The `massa-ai-config bootstrap` CLI SHALL remain callable when no rule is enabled and when the massa-ai MCP server is unreachable, so that a user who disabled `massa-ai-router` can re-enable it. <!-- BST-11.5 -->
5. WHEN a toggle is applied THEN the command SHALL state that the affected host sessions must restart before the change takes effect. <!-- BST-11 -->
6. IF no host is recorded as installed THEN the command SHALL report that no host is installed and SHALL exit 0 without writing a `MASSA-AI.md`. <!-- BST-11 -->
7. The `bootstrap` skill SHALL be emitted into all four `apps/<host>-plugin/skills/` bundles by `scripts/generate-skill-artifacts.ts`. <!-- BST-12 -->

**Independent Test**: From a scratch home with all four hosts recorded, run `massa-ai-config bootstrap disable caveman` and assert all four `MASSA-AI.md` lost the caveman rule and the report named four hosts.

---

### P1: RTK out, English-only and comment rules in ⭐ MVP

**User Story**: As a massa-ai user, I want the contract to stop carrying RTK, to require
English in generated code regardless of my chat language, and to stop adding comments to
my code unless I ask, so that the contract matches what massa-ai actually owns.

**Why P1**: Three of the five requested changes; each is a content change to the single source.

**Acceptance Criteria**:

1. The bootstrap source `skills/AGENTS.md` SHALL contain no `Conditional RTK Rules` section and no `rtk` command example. <!-- BST-06 -->
2. WHEN the contract is rendered in any toggle state THEN the output SHALL contain no occurrence of the literal `rtk`. <!-- BST-06 -->
3. WHILE `english-code` is enabled the contract SHALL state that all generated code, identifiers, comments, commit-facing code artifacts, and code documentation are written in English regardless of the language the user writes in. <!-- BST-07 -->
4. The `english-code` rule SHALL state that it does not change the language of the agent's conversational replies. <!-- BST-07 -->
5. `references/code-annotation.md` SHALL state that its §1 and §2 apply only while the `code-comments` bootstrap rule is enabled, and that §3 applies unconditionally. <!-- BST-08 -->
6. The `references/naming-standards.md` §Language section SHALL cite the `english-code` rule as the wider contract rather than restating it. <!-- BST-07 -->

**Independent Test**: `grep -ci rtk` over the rendered contract returns 0; render with `code-comments` off and confirm the negative directive is present and the tests sentence is untouched.

---

### P2: The new surfaces are guarded

**User Story**: As a maintainer, I want the new files and toggles covered by the repository's
own gates, so that a later edit cannot silently break delivery on one host.

**Why P2**: Not needed to demonstrate the feature, required before merge.

**Acceptance Criteria**:

1. WHEN a drift check runs after a source change under `skills/bootstrap/` THEN it SHALL exit non-zero until the bundles are regenerated — for **both** `bun scripts/generate-skill-artifacts.ts --check` (the direct form, which `.github/workflows/ci.yml:238` uses) and `bun run generate:artifacts --check`. <!-- BST-12 -->
2. The `scripts/tests/` directory SHALL contain a shell suite that installs to a scratch home, asserts the per-host delivery shape of BST-01..BST-04, and asserts the uninstall reversal of BST-05. <!-- BST-12 -->
3. A committed unit suite SHALL assert the renderer's rule set, defaults, determinism, unknown-id handling, and the `code-comments` negative directive, co-located with the module under test per this repository's convention — which places the renderer's own assertions in `packages/shared/src/bootstrap/__tests__/` and the entry point's in `scripts/__tests__/`. <!-- BST-12 -->
4. WHEN a rule id is added to or removed from the registry without updating the skill's documented id list THEN a test SHALL fail naming the divergent ids. <!-- BST-12 -->
5. The `CHANGELOG.md` file SHALL carry an entry under `[Unreleased]` describing the delivery change. <!-- BST-12 -->

> **AC-3 amended after the verification gate (user ruling).** It named
> `scripts/__tests__/` as the sole location, which the verifier measured as false: the
> determinism assertion and the `code-comments` negative-directive assertion live in
> `packages/shared/src/bootstrap/__tests__/render.test.ts:210,238`, beside the module they
> test, which is this repository's own convention. The substance was always delivered; the
> AC's location clause was wrong and would have forced a correct suite to move to satisfy a
> sentence. The criterion now requires the assertions and names both real homes.

> **AC-1 amended after the verification gate (user ruling).** It originally named
> `bun run generate:artifacts --check` alone, and the verifier measured that command
> **exiting 0 under real drift**: `package.json:31` is
> `bun scripts/generate-skill-artifacts.ts && bun scripts/generate-subagent-artifacts.ts`,
> so the flag reaches only the *second* generator while the first runs in write mode and
> repairs the drift it was supposed to report. Planting an unmanaged file in
> `skills/bootstrap/` gave exit **1** from the direct form and exit **0** from the named one.
> The criterion was unsatisfiable as written, not merely inconvenient. Rather than narrow the
> AC to the form that already worked, `package.json:31` is fixed to forward arguments to both
> generators, and the AC now requires both forms to discriminate — so the documented command
> and the CI command agree instead of one being a trap. `scripts/worktree-verify.sh:286` uses
> the previously broken form and is covered by the same fix. Recorded as FU-2 at design time
> and deliberately deferred then; the user's ruling brings it into scope now.

**Independent Test**: Delete one rule from the registry and confirm the parity test reddens naming that id.

---

## Edge Cases

- IF a host's `AGENTS.md` contains duplicated or incomplete bootstrap markers THEN the installer SHALL abort that host with the existing "Managed markers are incomplete or duplicated" error and write nothing.
- IF `~/.claude/CLAUDE.md` is a symlink THEN the installer SHALL write through it only when its target is inside the target home, and SHALL otherwise abort that host, since Claude documents skipping symlinked user memory in Cowork sessions.
- IF both `opencode.json` and `opencode.jsonc` exist THEN the installer SHALL edit the file `opencode-config.cjs` reports as winning and SHALL warn that the other is shadowed.
- IF `~/.config/massa-ai/config.json` does not exist when a toggle is set THEN the command SHALL create it with the single `bootstrap` key and SHALL preserve any other key when it does exist.
- IF `~/.config/massa-ai/config.json` is malformed THEN the command SHALL exit non-zero naming the parse failure and SHALL not overwrite the file.
- WHEN a rendered `MASSA-AI.md` exceeds Codex's 32 KiB `project_doc_max_bytes` default THEN no failure occurs, because the pointer block, not the contract, is what Codex loads.
- IF the user disables `massa-ai-router` THEN the contract SHALL still name `massa-ai-config bootstrap enable massa-ai-router` as the way back, so the off state is recoverable from the file itself.
- WHEN `--dry-run` runs THEN the command SHALL write no file and SHALL report every change it would make.
- IF `config.json` changed on disk between the toggle's read and its write THEN the command SHALL re-apply the `bootstrap` subtree onto the current document once and, if that also races, SHALL fail loudly without writing.

> **Amended after the Plan Challenge gate.** This bullet originally read "the last
> writer wins on `config.json`". That was written before the reuse scan established
> that the same file holds `security.apiKey` and `database.url`, and that rejecting
> `savePartialConfig` on secret-hygiene grounds also removed the only writer that
> produced a recovery copy. A lost update there destroys a secret with no second copy,
> and under AD-011 the visible symptom is every Tools API request returning 401 with no
> diagnostic. Last-writer-wins is acceptable for a preference and not for this file.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| BST-01 | P1: Contract lives in MASSA-AI.md | Design | Pending |
| BST-02 | P1: Contract lives in MASSA-AI.md | Design | Pending |
| BST-03 | P1: Contract lives in MASSA-AI.md | Design | Pending |
| BST-04 | P1: Contract lives in MASSA-AI.md | Design | Pending |
| BST-05 | P1: Contract lives in MASSA-AI.md | Design | Pending |
| BST-06 | P1: RTK out, English-only and comment rules in | Design | Pending |
| BST-07 | P1: RTK out, English-only and comment rules in | Design | Pending |
| BST-08 | P1: RTK out, English-only and comment rules in | Design | Pending |
| BST-09 | P1: Every bootstrap rule is individually switchable | Design | Pending |
| BST-10 | P1: Every bootstrap rule is individually switchable | Design | Pending |
| BST-11 | P1: A host command drives the toggles | Design | Pending |
| BST-12 | P2: The new surfaces are guarded | Design | Pending |

**ID format:** `BST-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 12 total, 0 mapped to tasks yet, 0 unmapped.

---

## Implicit-Requirement Sweep

Large scope: every dimension resolves to a requirement or an explicit `N/A because`.

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | BST-09 AC-8 (unknown rule id), pointer block capped at 10 lines (BST-04 AC-6). |
| Failure / partial-failure states | BST-03 AC-11 (unparseable OpenCode config aborts that host with no partial write); edge case for malformed `config.json`. |
| Idempotency / retry / duplicate handling | BST-01 AC-10 (`--check` clean after `--apply`), BST-03 AC-5 (no duplicate `instructions` entry), BST-10 AC-7 (byte-identical re-render). |
| Auth boundaries & rate limits | N/A because every surface is a local file write under the user's own home; there is no caller identity and no remote endpoint. |
| Concurrency / ordering | Edge case: last writer wins on `config.json`, render always re-reads persisted state. |
| Data lifecycle / expiry | BST-05 AC-9 (uninstall removes every artifact this feature creates). No expiry: the state is a user preference with no TTL. |
| Observability | BST-10 AC-10 and BST-11 AC-5 (per-host outcome reported, restart notice stated); BST-10 AC-12 (unknown persisted id reported once). |
| External-dependency failure | BST-11 AC-4 (CLI works with the MCP server unreachable). No other external dependency is involved. |
| State-transition integrity | BST-09 AC-3 (every id switchable both ways), A8/BST-11.5 (the off state of `massa-ai-router` is recoverable), BST-10 AC-4/AC-9 (render follows state exactly). |

---

## Verification Approach

| Requirement | Deterministic sensor |
| --- | --- |
| BST-01..BST-05 | New shell suite under `scripts/tests/`, run against `--target <scratch home> --yes`: asserts per-host file shape after `--apply`, exit 0 on `--check`, and byte-level restoration after `--uninstall`. |
| BST-06 | `grep -ci rtk` over `skills/AGENTS.md` and over the rendered contract, asserted at 0 in the renderer suite. |
| BST-07, BST-08 | Renderer suite asserts the English directive text is present while enabled, the negative comment directive is present while `code-comments` is disabled, and the §3 tests sentence is present in both states. |
| BST-09, BST-10 | Renderer unit suite: id set equality, default map, both-way toggling of all 9 ids, byte-identical re-render, unknown-id exit code, all-off body. |
| BST-11 | CLI suite in both `apps/mcp-client` and `apps/opencode-plugin` mirroring the existing `config-cli-profile.test.ts` shape. |
| BST-12 | `bun run generate:artifacts --check`; new parity assertion in `scripts/__tests__/`; `bun run test:scripts`; `bun run test:plugins`. |
| Whole feature | `bun run lint`, `bun run type-check`, `bun run test`, plus the independent verification-agent pass with its discrimination sensor. |

Author ≠ verifier: the final gate is a fresh `massa-ai-verification-agent` pass writing
`validation.md`, not this document's own claims.

---

## Success Criteria

- [ ] A user can run one command in any of the four hosts and see a named rule disappear from that host's `MASSA-AI.md`.
- [ ] Claude Code loads the massa-ai contract without the user hand-editing `~/.claude/CLAUDE.md`.
- [ ] `--uninstall` restores a scratch home to byte-identical pre-install content, excluding `*.massa-ai.bak-*` and nothing else.
- [ ] `--check` and `--dry-run` leave a scratch home byte-identical even when the OpenCode config holds deliberate drift.
- [ ] The rendered contract contains zero occurrences of `rtk`.
- [ ] Generated code carries no doc blocks or rationale comments by default, and test coverage is unaffected.

---

## Discuss Context Summary

Four decisions were resolved with the user before this spec closed.

1. **Codex/Cursor delivery.** Presented with the measured absence of an import mechanism on both hosts, the user chose the short managed pointer over pasting the full body, accepting that the load is an instruction the model follows rather than a loader the host runs.
2. **Command surface.** The user chose a per-host command/skill over MCP tools and over a CLI-only surface. The CLI remains the engine's fallback front (BST-11.5) because a skill cannot run when its own rule is disabled.
3. **Comment toggle scope.** The user chose doc blocks plus rationale comments, leaving test coverage untouched.
4. **Toggle granularity.** The user chose every rule switchable with no exception, including `massa-ai-router`, accepting the recoverability risk that A8 and BST-11.5 mitigate.

---

## Artifact-Store Evidence

- **Active artifact key:** `.specs/features/bootstrap-file-and-rule-toggles/spec.md`
- **Version:** 1 (initial write)
- **Checksum:** recorded in the Specify completion report after write (`shasum -a 256`).
