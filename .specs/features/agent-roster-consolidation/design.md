# Agent Roster Consolidation Design

Spec: `.specs/features/agent-roster-consolidation/spec.md`. Evidence: three read-only
inventories (persona, roster/installers, workflows) run 2026-09-22 against
`origin/main@f582b602`; file:line citations below were re-read in this session.

## Design Summary

Subtractive change plus one ownership refactor: 18 charters collapse to 7 (merges keep every former output contract behind a `mode`/`lens` packet field), personas and four workflows are deleted, six workflows renamed, and the `massa-ai-` agent prefix is dropped. Because the prefix was the only ownership signal on Claude and Cursor, ownership moves to a content marker on every host, with a legacy-prefix rule so upgrades prune old files and a collision rule so a user's same-named agent is never touched.

## Architecture Overview

Nothing new is introduced at runtime. The change is subtractive plus one ownership
refactor:

```
skills/agents/<7 charters>  ──generate-subagent-artifacts.ts──►  apps/<host>-plugin/agents/<name>.<ext>
                                                                   apps/<host>-plugin/agent-profiles/<p>/<name>.<ext>
                                  (every file carries an ownership marker)
                                               │
          plugin install.sh (x4) ──copy/prune by MARKER──► ~/.claude/agents, ~/.codex/agents, ~/.cursor/agents, ~/.config/opencode/agents
          profile-switch engine ──overwrite only MARKED dest──► same dirs
```

Before: ownership = filename prefix `massa-ai-`. After: ownership = content marker
(`<!-- massa-ai-owned: true -->` for `.md`, first line `# massa-ai-owned` for `.toml`),
plus a **legacy rule**: a file whose name is exactly `massa-ai-<one of the 18 pre-change
names>` is treated as owned (prune-only) so upgrades can remove it — never the open
`massa-ai-*` glob (spec A17).

## Code Reuse Analysis

### Existing Components to Leverage

| Component | Location | Use |
| --- | --- | --- |
| `OPENCODE_OWNED_MARKER` | `scripts/generate-subagent-artifacts.ts:346` | Generalize to `OWNED_MARKER_MD`, emitted for Claude, Cursor, OpenCode |
| Codex `# massa-ai-owned` first line + first-line check | `generate-subagent-artifacts.ts:323`, `apps/codex-plugin/install.sh:612,737` | Already marker-owned; pattern copied to the other three installers |
| Copy-then-prune loops (IPT-02 D1/D2) | claude `install.sh:954-974`, cursor `:730-749`, codex `:709-744`, opencode `:609-681` | Keep structure; swap the prefix glob for `*.<ext>` + ownership predicate |
| OpenCode symlink-only ownership | `apps/opencode-plugin/install.sh:446,609,641` | Unchanged semantics; symlink targets are marked files |
| Persisted-state tolerance for unknown rule ids | `packages/shared/src/bootstrap/state.ts:115-121` | Add a retired-id set that skips without the warning |
| Repo-route stale-skill prune by marker | `scripts/install-skills.sh:936-976` | Already prunes `persona-router`; no change |
| Plugin install-state record (`platforms[host].skills`) | claude `install.sh:421` and siblings | Becomes the removal population for retired harness skills (fixes IPT-F6 generically) |
| `managedRootsFor` prune-before-emit | `scripts/generate-skill-artifacts.ts:229` | Add a retired-root sweep for `skills/persona-router` |
| Workflow-command generator (stems from filenames) | `scripts/lib/workflow-commands.ts` | Renames/removals flow through automatically; only `RESERVED_BUNDLE_ROOTS` edits |

### Integration Points

| System | Integration |
| --- | --- |
| Claude plugin route | Plugin agents resolve as `massa-ai:<name>` (plugin namespace) — the dispatch-name resolution section in `agent-orchestration.md` is rewritten for unprefixed names |
| Codex built-ins | `code-explorer` avoids `explorer` (A5) |
| `install-state.json` v2 | `skills` list shrinks to 3; prior list drives the retired-skill prune |

## Components

### C1 Charters (7)

Merge rule: each merged charter keeps every **output contract** of its sources, selected by
a `mode` or `lens` field in the capability packet; Restrictions are the union minus the
persona lines; the permission is the most permissive source that actually needs it.

| New | Sources | Tier | Permission | Modes / lenses |
| --- | --- | --- | --- | --- |
| `builder` | builder | standard | write | — (drop "planner/context-curator" references) |
| `code-explorer` | investigator, navigator | deep | read-only | `lookup` (index-first answer, navigator), `trace` (flow/dependency/impact, investigator) |
| `code-reviewer` | reviewer, verification-agent, audit-specialist, architecture-specialist, mobile-specialist | deep | read-only | modes `review` (diff), `verify` (Verification Ladder + discrimination sensor), `audit` (lenses bugs/architecture/security/code-quality/performance; the `requirements` lens moves to `product-manager`, `tests` to `test-engineer`), `guide` (architecture boundaries; mobile platform guidance with the mobile detection gate) |
| `designer` | designer | standard | write (UI layer when scoped) | modes `audit` (read, conformance table) and `implement` (write) from Figma, screenshots, or other direction |
| `judge` | meta-judge, judge, plan-critic | deep | write (own `judge-N` report in `scorer` mode only) | `spec-author`, `scorer`, `plan-critique` (`lite`/`full`) |
| `product-manager` | furps-analyst, requirements-analyst, audit-specialist `requirements` lens | deep | read-only | `furps` (one dimension per dispatch), `requirements` (ambiguity/gap/contradiction/implicit/uncovered), `audit` (findings-only REQ lens in the audit-report-io format) |
| `test-engineer` | test-engineer, audit-specialist `tests` lens | standard | write (test files when scoped) | `plan` (existing strategy), `audit` (findings-only TST lens, read-only in that mode), `fix` (tests-fix implementation) |

Every charter keeps: "Never load the `massa-ai` router skill; the dispatching workflow owns
routing." The persona clause is deleted.

### C2 Generator (`scripts/generate-subagent-artifacts.ts`)

- `SPECIALIST_NAMES` → the 7 names; `WRITE_AGENTS` → builder, designer, judge, test-engineer.
- Delete `AGENT_TOOLS_OVERRIDE` (navigator allowlist) and `OPENCODE_BASH_OVERRIDE` (planner/navigator); every read-only agent uses the denylist / default read-only bash (A9).
- Name: `name: ${c.name}` (Claude, Cursor), `name = "${c.name}"` (Codex), filename `${c.name}.${ext}` everywhere (`:259,:293,:316,:471`).
- Marker: rename `OPENCODE_OWNED_MARKER` → `OWNED_MARKER_MD`, emit as first body line for Claude, Cursor, OpenCode; `scripts/lib/host-capabilities.ts` ownership becomes `body` for Claude/Cursor.

### C3 Installer ownership (4 plugin installers + `installer-shared.sh` + `verify-harness-install.ts`)

One inline bash predicate per installer (plugin tarballs cannot source repo-only libs they don't ship — each installer already inlines its own loops):

Per-host predicate (plan-challenge C1 — each host's old safety came from the prefix and must be re-derived):

| Host | Owned iff | Legacy (prune-only) |
| --- | --- | --- |
| Claude, Cursor | regular file whose first body line (the line after the closing frontmatter `---`) is exactly `<!-- massa-ai-owned: true -->` | name is exactly `massa-ai-<one of the 18 pre-change names>.md` |
| Codex | first line exactly `# massa-ai-owned` (unchanged; legacy files already carry it) | none needed — `massa-ai-mine.toml` without the marker keeps surviving (AC-02.3) |
| OpenCode | symlink AND (its resolved target's first body line is the marker, OR its `readlink` text matches `*/opencode-plugin/agents/<base>` or `*/plugins/massa-ai/agent-profiles/*/<base>` — so a dangling link from a deleted checkout still counts). Never a regular file. Ownership must survive a reinstall from a different bundle location, so it is not "target under the current SCRIPT_DIR" | symlink named `massa-ai-<one of the 18>.md` |

The 18 legacy names are an inline literal in each installer and in `ownership.ts` — not a
bundle file, because the bundle can be absent at uninstall (IPT-03 made removal independent
of the bundle). One definition of "owned": **first body line equals the marker**, identical
in bash and TS (a predicate-parity test runs one fixture set through both).

```bash
LEGACY_AGENT_NAMES=" architecture-specialist audit-specialist builder context-curator designer documentation-agent furps-analyst investigator judge meta-judge mobile-specialist navigator plan-critic planner requirements-analyst reviewer test-engineer verification-agent "
is_legacy_agent() { local b; b="$(basename "$1")"; b="${b%.*}"; [[ "$b" == massa-ai-* && "$LEGACY_AGENT_NAMES" == *" ${b#massa-ai-} "* ]]; }
has_owned_marker() {   # first body line after the closing frontmatter fence
  awk 'NR==1{if($0!="---")exit 1;next} $0=="---"{getline; exit ($0=="<!-- massa-ai-owned: true -->")?0:1} END{exit 1}' "$1"
}
is_owned_agent() {     # claude/cursor; $1 = path
  [[ -f "$1" && ! -L "$1" ]] || return 1
  is_legacy_agent "$1" || has_owned_marker "$1"
}
```

- **Copy**: for each bundle agent, `dest` absent or `is_owned_agent dest` → copy; else warn `⚠ <dest> exists and is not massa-ai-owned — skipped` and continue (NAM AC-3).
- **Prune** (population = destination dir, keep-predicate = bundle, per IPT-02 D2): iterate `"$TARGET/agents/"*.md`, skip unless `is_owned_agent`, skip if the bundle ships the same basename, else `rm`. Legacy `massa-ai-*` files are never shipped, so they are pruned (NAM AC-5).
- **Uninstall**: same population + predicate, no keep-predicate.
- OpenCode: the relink pre-flight and prune both require the target-under-plugin-dir check; a user symlink pointing elsewhere is skipped with the warning and never pruned.
- **Site list** is built from `git grep -nE 'massa-ai-\*|startsWith\("massa-ai-'` (69 files at `f582b602`), not from this design — excluding slash-command globs (`commands/massa-ai-*.md`, `command/massa-ai-*.md`), which keep the prefix (spec out-of-scope); every hand-planted `massa-ai-*` fixture in tests is renamed to an unprefixed name so an unconverted glob fails (observed red).
- `installer-shared.sh` "installed?" checks and `verify-harness-install.ts` `ownedFiles` use the same predicate.

### C4 Retired harness skill prune (plugin installers)

In the existing install-state heredoc, compute `prev.skills − current` and print those
names; the bash side removes `$HARNESS_SKILLS_DIR/<name>` for each. Population comes from
the state file (proof of prior plugin ownership), not from a literal — this generically
closes IPT-F6 and handles `persona-router` (PER AC-5).

### C5 Profile-switch (`packages/shared/src/profile-switch/`)

- `hosts.ts`: replace `activeGlob` (`massa-ai-*.md|toml`) with `activeExt` (`.md|.toml`).
- `ownership.ts` owns the TS predicate (first body line = marker; `.toml` first line = `# massa-ai-owned`) and the 18-name legacy literal; `config-cli.ts:410`'s `content.includes(...)` is replaced by it.
- `engine.ts`: variant entries must be owned (marker) and not legacy-named — `variant-sync.ts` never deletes, so a variant dir can still hold legacy files after a Regenerate (plan-challenge C5); before overwriting/repointing `dest`, require `dest` absent or `isOwnedAgentFile(dest)`; `matchingFileNames` (tracked-path guard) follows the same filter.
- New `ownership.ts`: `isOwnedAgentFile(path)` — marker in content (`.md`) or first line (`.toml`); exported for `doctor.ts:135` and `apps/opencode-plugin/src/config-cli.ts:391-410`.
- `variant-sync.ts`: unchanged (installers `rm -rf` + re-copy variant trees).

### C6 Bootstrap (`packages/shared/src/bootstrap/`)

- `rules.ts`: drop `persona-router` from ids and registry; add `RETIRED_RULE_IDS = ["persona-router"] as const`.
- `state.ts:115-121`: a retired id is skipped without being pushed to `ignoredStateKeys` (PER AC-6).
- `skills/AGENTS.md`: delete the `persona-router` span and persona sentences inside the router/dedupe spans; registry/marker lockstep is enforced by `render.ts` errors.

### C7 Workflows

- `git mv` for the six renames; frontmatter `name`, session-id prefix, and `workflow:` tag updated in-file; all pointers repointed by exact-string replacement of `workflows/<old>.md` and backticked stem mentions, reviewed per hit (the inventory separated workflow mentions from document-type mentions such as "ADR", `references/tdd/`).
- Router `SKILL.md`: remove rows `general`, `maestro*`; rename rows; precedence rule 6 becomes "No match: proceed without a workflow file under the Core Contract"; drop the maestro tier-3/4 clauses.
- Remove maestro family from `audit-report-io.md`, `validate_audit_report.ts` `FAMILIES`, `hook-enforcement.md`, `mobile-context.md`; repoint `knowledge-verification-chain.md:25`.
- Web UI `WORKFLOW_STEMS` + 3 test mirrors + regenerate `render-golden.json`.

### C8 Dispatch blocks

Rewrite every `**Dispatch: `massa-ai-X`**` block to the mapping in spec "Workflow dispatch
mapping", with `mode`/`lens` bullets. `designer` blocks in `design`, `mobile-figma-audit`,
`mobile-figma-fix` lose the "when this task creates or modifies a screen" condition;
`mobile-figma-fix` keeps a `builder` block scoped to MFM findings whose fix needs non-UI wiring. Name Resolution: the one-line rule "on the Claude plugin route, dispatch `massa-ai:<name>`" lives in the always-loaded router `SKILL.md` (dispatch blocks name bare `<name>` and must not depend on `agent-orchestration.md` being loaded); `agent-orchestration.md` keeps the detail. **Accepted risk (file route and non-Claude hosts):** there is no namespace, so a user agent that won a collision skip receives massa-ai dispatches; the install-time skip warning is the only signal. Other workflows keep the conditional
screen-work designer block.

### C9 Runtime hook

`apps/claude-plugin/hooks/massa-ai-hook.ts:256,258` sentinel → `code-reviewer.md`: deep tier, so profile drift between `balanced`/`home` stays visible (`builder` is standard tier and resolves to the same model in both — plan-challenge C2).

### C10 Observation extractor

Delete the `/persona` prefix trigger (`observation-extractor.ts:207`) and its test row;
`act as` / `you are a` stay.

## Data Models

`install-state.json` `platforms[host].skills`: `["massa-ai","profile","bootstrap"]`.
No schema change.

## Error Handling Strategy

| Scenario | Handling | User impact |
| --- | --- | --- |
| Foreign same-named agent file | Skip + warn, count not incremented | User keeps their file; massa-ai's agent of that name is absent on that host |
| Retired skill dir missing | `rm -rf` of a missing path is a no-op | None |
| Stale `bootstrap.rules["persona-router"]` | Silently skipped | None |
| Profile switch meets foreign dest | Skip that file (not counted as changed) | Same as install |

## Tech Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Ownership signal | Content marker on the first body line; exact 18 legacy names honored for pruning only | Filename no longer carries identity; Cursor forbids frontmatter keys |
| Predicate location | Inline per installer, TS helper in shared | Tarballs ship their own `install.sh`; TS consumers share one module |
| Retired-skill population | Previous `install-state.json` skills list | Proof of ownership without a new marker |
| Charter merge | Modes/lenses inside one charter | Keeps every former output contract addressable |

## Risks & Concerns

| Risk | Mitigation |
| --- | --- |
| Test churn hides a real regression | Update tests per task with the code they pin; full `test` + `test:scripts` + `test:plugins` gate before each commit |
| A missed `massa-ai-<agent>` literal dispatches a dead name | `skills-harness-integrity` dispatch-target test (exists in all 4 bundles) + repo-wide literal sweep in WFL-04/ROS-02 |
| Merged charter drops an output contract a workflow depends on | Frozen fixture of the 14 retired charters' output fields at `f582b602` + test that each appears in its merged charter (ROS AC-9), committed before the roster swap |
| Plan Challenge critic is write-capable (judge) | Accepted risk A10; charter prose forbids writes outside `scorer` mode |
| Main-checkout WIP on `generate-subagent-artifacts.ts`/`model-profiles.ts` (uncommitted, not ours) | Record in handoff; rebase at merge time |
| Frozen `model-profile-registry` baseline fixture names 15 old agents | Map baseline comparisons through the old→new table; don't edit the historical fixture |
