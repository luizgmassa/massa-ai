# Marketplace Directory-Source Switching — Specification

Slug: `marketplace-directory-source-switching` · Session
`spec-marketplace-directory-source-switching` · Workflow **spec-driven** ·
Persona pin `context-skill-harness-engineer-architect` · Branch
`fix/marketplace-directory-source-switching` from `origin/main` @ `89909051`,
worktree `/Users/luizmassa/Projects/massa-ai-wt-marketplace`.

## Problem Statement

Model-profile changes applied from the Admin Portal's Model Config tab, and
skill edits applied by re-running the installer, do not reach the Claude Code
CLI. The reported symptom is "they stay cached". There are **two independent
defects**, and neither is the one the prior handoff recorded.

**Defect A — the switch engine writes to a tree Claude does not read.**
`resolveClaudeMarketplaceRoot` returns `installed_plugins.json`'s `installPath`
unconditionally — a version-pinned cache snapshot
(`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>`). That is correct
for a marketplace whose source is a remote repository. It is wrong for a
**directory-source** marketplace, where Claude loads the plugin live from the
source directory and the cache is only a snapshot. Every profile switch and
every Save & Apply therefore writes agent files nothing will ever read.

**Defect B — Save & Apply never regenerates or reinstalls skills.**
`apps/tools-api/src/routes/model-registry-stream.ts:154` spawns only
`scripts/generate-subagent-artifacts.ts`. The repository's own entrypoint is
both generators (`generate:artifacts` = `generate-skill-artifacts.ts &&
generate-subagent-artifacts.ts`). Nothing in the Save & Apply path runs the
skill generator or reinstalls skills, so a skill edit cannot reach any host
through the portal at all.

**A stale premise blocks part of the fix.** `detectRoute` refuses a codex
marketplace switch because "in-place bundle rewrite would dirty a checkout and
break the drift gate". That was true when plugin bundles were checked in. Under
AD-016 they are generated-on-demand and gitignored, so the premise no longer
holds and the refusal protects nothing.

## Goals

- [ ] A profile switch on a directory-source marketplace writes to the tree the
      host actually loads.
- [ ] Save & Apply regenerates and reinstalls **skills** as well as sub-agents.
- [ ] The marketplace route stops being second-class: no refusal that rests on
      a premise the repository has since retired.
- [ ] The write-target correctness is pinned by a sensor, not by inspection.

## Out of Scope

| Item | Reason |
| --- | --- |
| Changing where Claude loads plugins from | Not ours to change. This feature makes our writes follow Claude's loader, not the reverse. |
| Remote-source marketplaces resolving to anything but the cache | **Accepted, unmeasured risk — see AC-01.2 and MDS-05, not a safety claim.** The two remote-source marketplaces on this machine are currently in sync with their pinned caches, so no natural divergence exists here to test precedence against. Changing that path on inference is the error this feature exists to correct. |
| Replacing the marketplace route with the file route | The staged migration in `.specs/HANDOFF.md` is a **user-run environment change**. The user's direction is to fix the marketplace route instead, not to migrate off it. |
| `claude plugin update` behavior | Owned by `claude-marketplace-cache-refresh` (CMR-01..04); unchanged here. |
| Cursor profile switching | `resolveHostLayout` skips Cursor uniformly — every tier resolves to `inherit` because Cursor publishes no model-ID table. Unrelated to this defect. |

---

## Evidence

Measured 2026-08-13 against `origin/main` @ `89909051` on the reporting machine.

**E1 — the marketplace is a directory source.**

```
known_marketplaces.json → "massa-ai": { source: { source: "directory",
                                        path: "/Users/luizmassa/Projects/massa-ai" },
                                        installLocation: "/Users/luizmassa/Projects/massa-ai" }
.claude-plugin/marketplace.json → plugins[0].source = "./apps/claude-plugin"
```

**E2 — Claude loads from the source directory, not the cache.** The running
session advertises `massa-ai-designer`, whose description matches
`apps/claude-plugin/agents/massa-ai-designer.md` verbatim. That file exists
**nowhere** under `~/.claude`. Every cache version holds 17 agents and no
designer:

| Location | Agent files | `designer` present |
| --- | --- | --- |
| `apps/claude-plugin/agents/` (source dir) | 18 | yes |
| `~/.claude/plugins/cache/massa-ai/massa-ai/1.48.0/agents/` | 17 | no |
| `~/.claude/plugins/cache/massa-ai/massa-ai/1.47.0/agents/` | 17 | no |
| `~/.claude/plugins/cache/massa-ai/massa-ai/1.45.0/agents/` | 17 | no |
| `~/.claude/agents/` | 0 (empty) | no |

**Independently corroborated by the Plan Challenge Gate**, which found a
sharper proof than this file-count comparison. The `massa-ai-plan-critic`
subagent compared its **own live system-prompt frontmatter** against both trees:
it matches the source file's `disallowedTools: Write, Edit, NotebookEdit`, not
the cache's `tools: ["Read","Grep","Glob","Bash"]` allowlist — which would have
denied it the Task tool it was demonstrably using. It also reports all 17
shared-name agent files differ between the two trees. A running agent's own
capabilities are stronger evidence of which tree was loaded than a file census.

Corroborated further by the registry's own record: the 1.48.0 entry pins
`gitCommitSha: f8427283`, which is the **base commit of the designer feature** —
so the cache is a snapshot taken before designer existed, while the session sees
designer.

**E3 — the switch engine's write target is that stale cache.**
`install-state.json` records `platforms.claude.installRoute: "marketplace"` and
`modelProfile: { profile: "balanced", switchedAt: "2026-08-11T03:00:25Z" }`. With
that route, `resolveHostLayout` composes `activeDir = <installPath>/agents` and
`variantsRoot = <installPath>/agent-profiles`, both under the 1.48.0 cache —
whose `agents/` mtime is `2026-08-11 00:00:25`, i.e. written by that switch.

**E4 — the prior handoff's diagnosis is stale.** It records that the marketplace
route "refuses profile switching by design". `hosts.ts:149-173` shows Claude
**proceeds**; only codex refuses. Switching is not refused — it writes to the
wrong tree.

**E5 — the codex refusal's stated premise is false.** Its reason is that an
in-place bundle rewrite "would dirty a checkout". `git check-ignore` reports
every bundle path ignored, and the working tree is clean with all 18 agent files
present:

| Path | `git check-ignore` |
| --- | --- |
| `apps/claude-plugin/agents/massa-ai-builder.md` | ignored |
| `apps/claude-plugin/agent-profiles/work/massa-ai-builder.md` | ignored |
| `apps/codex-plugin/agents/massa-ai-builder.toml` | ignored |
| `apps/cursor-plugin/agents/massa-ai-builder.md` | ignored |

**E6 — Save & Apply runs one generator of two.**
`model-registry-stream.ts:154` spawns `scripts/generate-subagent-artifacts.ts`.
`package.json` defines `generate:artifacts` as **both** generators. No caller in
`apps/` or `packages/` references `generate-skill-artifacts.ts`; only the four
`install.sh` scripts and the opencode package's `pretest` do.

---

## Requirements

### MDS-01 — resolve the live plugin root for a directory-source marketplace

- **AC-01.1** When `known_marketplaces.json` records the plugin's marketplace
  with `source.source === "directory"`, the resolved root is
  `<installLocation>/<plugins[i].source>`, read from that directory's own
  `.claude-plugin/marketplace.json` and matched by plugin name — never the
  `installed_plugins.json` `installPath`.
- **AC-01.2** Any other source kind keeps today's behavior exactly: the
  `installPath` from `installed_plugins.json`, selected by the existing
  `selectRecord` precedence. **This is an explicitly accepted, UNMEASURED risk,
  not a correctness claim.** Defect A's class has been measured only for a
  directory source. A remote-source marketplace has a *third* tree this spec
  does not otherwise mention — a live clone at
  `~/.claude/plugins/marketplaces/<name>`, which exists on this machine for
  `caveman` and `understand-anything` — and which of clone or cache Claude loads
  there is untested. If the clone wins, AC-01.2 ships the same two-trees defect
  for every remote-source user. It is left unchanged because changing it on
  inference is precisely the error that produced the stale diagnosis this
  feature had to correct, not because it is known safe. MDS-05 owns closing it.
- **AC-01.3** Every failure mode resolves to `null`, never a throw: absent or
  unparseable `known_marketplaces.json`, missing `installLocation`, absent or
  unparseable `.claude-plugin/marketplace.json`, no plugin entry matching the
  name, or a composed path that does not exist on disk.
- **AC-01.6** The composed path must resolve to a descendant of
  `installLocation`. `plugins[i].source` is manifest-supplied relative data, and
  this is the first code path that turns manifest content into a live **write**
  target; a `../`-escaping value that happens to exist on disk must resolve
  `null`, not a write root outside the marketplace tree.
- **AC-01.4** Resolution stays uncached, per the module's existing contract.
- **AC-01.5** The plugin key's marketplace half selects the marketplace entry
  (`massa-ai@massa-ai` → marketplace `massa-ai`), so a differently-named
  marketplace resolves correctly rather than by hardcoded name.

### MDS-02 — retire the refusal whose premise no longer holds

- **AC-02.1** `detectRoute` no longer refuses a codex marketplace switch on the
  "would dirty a checkout" ground (E5).
- **AC-02.2** The refusal for a **missing** `installRoute` is unchanged — an
  absent record is still refused loudly with installer guidance.
- **AC-02.3** A sensor asserts no refusal reason in the module cites checkout
  dirtiness, so the stale premise cannot be reintroduced by copy-paste.
- **AC-02.4** A **runtime** guard replaces the removed refusal: before writing,
  the engine verifies the resolved write target is not a git-tracked path, and
  refuses loudly with the offending path if it is. E5 measured one machine — a
  checkout predating AD-016's untracking, a fork made before it, or a user who
  deliberately committed a generated bundle would all be dirtied by an in-place
  rewrite. The premise is stale *for checkouts where AD-016 landed*, which is
  narrower than "stale". Where `git` is unavailable the guard cannot verify and
  proceeds, recording that it could not check.

### MDS-03 — Save & Apply regenerates and reinstalls skills

- **AC-03.1** The regenerate stream runs the **skill** generator as well as the
  sub-agent generator, in the order `generate:artifacts` defines.
- **AC-03.2** A generator failure is reported per generator, naming which one
  failed; a skill-generator failure does not silently report success.
- **AC-03.3** Skills reach each host's installed location, and the stream emits
  a per-host frame for it, mirroring the existing `variant-sync` / `install`
  frames rather than inventing a new reporting shape.
- **AC-03.4** A sensor asserts every generator named by `package.json`'s
  `generate:artifacts` script is spawned by the regenerate path — derived from
  that script, not from a hardcoded list of two.
- **AC-03.5** The derivation **throws** on a script shape it cannot parse; it
  never returns a short or empty list. A self-referential sensor — production
  derives the list, the test derives it the same way, both agree — cannot tell
  a correct derivation from a consistently wrong one, and would pass green while
  production spawned one generator or none. That is Defect B reintroduced
  through the guard built to prevent it.
- **AC-03.6** An independent hardcoded backstop asserts the spawned list has at
  least 2 entries and contains both known generator filenames, so a shared
  parser bug cannot hide behind agreement between production and test.

### MDS-05 — measure the remote-source load path, or say it is unmeasured

- **AC-05.1** The experiment is recorded even if it cannot be run here: on a
  remote-source marketplace whose upstream has diverged from its pinned cache,
  diff a shared-name file between `~/.claude/plugins/marketplaces/<name>/…` and
  `~/.claude/plugins/cache/<name>/<plugin>/<version>/…`, then invoke that
  plugin's own agent and compare its live behavior against both trees.
- **AC-05.2** Where no natural divergence exists to test against, that is
  recorded as the reason it is unmeasured — never as evidence of safety.

### MDS-04 — the other three hosts are measured, not assumed

- **AC-04.1** Codex, Cursor and OpenCode write targets are each measured against
  what that host actually loads, and the result recorded per host — including
  "no defect" as an explicit finding with its evidence.
- **AC-04.2** Any host found with the same class of defect is fixed under this
  spec or recorded as an out-of-scope finding with its reason.

---

## Edge Cases

| Case | Required behavior |
| --- | --- |
| Both a directory-source marketplace record and a cache entry exist | Directory source wins (AC-01.1); it is what the host loads. |
| `installLocation` points at a path that no longer exists | Resolve `null`; the caller already reports an unresolvable root loudly (CPP-06). |
| Marketplace manifest lists several plugins | Match by plugin name from the registry key. |
| The source directory is a git checkout with uncommitted work | Writes land only on gitignored generated paths (E5). No tracked file is touched. |
| A user on a remote-source marketplace | Unchanged behavior (AC-01.2). |

## Verification

| Requirement | Sensor |
| --- | --- |
| MDS-01 | Unit tests over a staged `~/.claude` fixture: directory source resolves to the composed live root; remote source still resolves to `installPath`; each failure mode returns `null`. |
| MDS-02 | Unit test on `detectRoute` for codex marketplace; plus a source-level assertion that no refusal reason cites checkout dirtiness. |
| MDS-03 | Test asserting both generators are spawned, with the generator list derived from `package.json`'s `generate:artifacts`. |
| MDS-04 | Recorded measurement per host in `validation.md`, with the command that produced it. |

## Open Questions

None blocking. The one decision that looked open — write into the repo checkout
versus the versioned cache — was closed by measurement rather than preference:
the host loads the source directory (E2), and the paths written there are
gitignored generated output (E5), so following the loader costs nothing.
