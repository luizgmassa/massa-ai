# Sub-agent Tool Inheritance Design

**Spec**: `.specs/features/subagent-tool-inheritance/spec.md`
**Status**: Approved — approach confirmed by the user; Plan Challenge gate
completed (The Fool, `evidence_audit` mode, standalone fresh-eyes critique;
`massa-ai-plan-critic` delegation skipped because session policy forbids
spawning agents unless the user requests it). Four of five findings were closed
by measurement rather than argument; the revisions they forced are recorded in
`spec.md` § Evidence and in the Risks table below.

---

## Design Summary

Four deliverables, one branch, ordered by a real dependency edge.

1. **STI-01/02** — `emitClaude` stops emitting a `tools:` allowlist for ordinary
   charters. Read-only charters get `disallowedTools: Write, Edit, NotebookEdit`;
   write charters get neither key; a charter with an `AGENT_TOOLS_OVERRIDE`
   entry keeps its allowlist. `navigator` is the only such entry today and its
   bytes are unchanged.
2. **STI-03** — The Cursor, Codex, and OpenCode emitters are untouched; a new
   per-host sensor asserts none of them emits an MCP-blocking construct, so the
   "unaffected" claim survives the next emitter change.
3. **STI-04** — The nesting prohibition is removed from 22 lines (18 charters +
   4 reference lines), with the batch-worker sequential-execution rule restated
   separately so it is not lost with the sentence that carried it.
4. **STI-05** — Every massa-ai roster dispatch announces the sub-agent's model
   and effort, read from the installed agent file.

The ordering constraint is real: STI-04 must land **with or after** STI-01. A
bundle that ships the prohibition removal first would tell agents they may nest
while `Agent` is still allowlisted away.

---

## Requirements Traceability

| Requirement | Where it is realized | Where it is proven |
| --- | --- | --- |
| STI-01.1-.4, .6 | `scripts/generate-subagent-artifacts.ts` — `claudeToolPolicyFor`, `emitClaude` | `scripts/__tests__/generate-subagent-artifacts.test.ts` (unit) |
| STI-01.5 | generated `apps/claude-plugin/agents/` + `agent-profiles/*/` | `scripts/__tests__/subagent-parity.test.ts` (artifact) |
| STI-02.1-.3 | `AGENT_TOOLS_OVERRIDE` retained as the allowlist escape hatch | `subagent-parity.test.ts` + byte-diff measurement |
| STI-03.1 | no change to the three emitters | one-time byte-diff (Execute evidence) |
| STI-03.2-.4 | no change | `subagent-parity.test.ts` existing per-host key schemas |
| STI-03.5 | new sensor | `subagent-parity.test.ts` new group |
| STI-04.1-.2 | 18 `skills/agents/*/SKILL.md` | `scripts/__tests__/skills-harness-integrity.test.ts` |
| STI-04.3-.4 | 4 reference lines | `scripts/__tests__/workflow-harness-contract.test.ts` |
| STI-04.5-.6 | sensors above + `generate:artifacts --check` | both suites |
| STI-05.1-.7 | `skills/massa-ai/references/agent-orchestration.md` | `workflow-harness-contract.test.ts` |
| STI-14 | live host dispatch | `validation.md` |
| STI-15 | `CLAUDE.md`, `scripts/lib/host-capabilities.ts`, `CHANGELOG.md` | existing stale-pointer/doc-path sensors |

---

## Current Codebase Evidence

Files and symbols inspected in this session, with what each established.

| Source | Established |
| --- | --- |
| `scripts/generate-subagent-artifacts.ts:119-136` | `READ_ONLY_TOOLS`, `WRITE_TOOLS`, `AGENT_TOOLS_OVERRIDE`, `toolsFor` — the whole defect surface. `toolsFor` has exactly one call site, `:289`. |
| `scripts/generate-subagent-artifacts.ts:287-300` | `emitClaude` key order: `name`, `description`, `tools`, `model`, `effort`. |
| `scripts/generate-subagent-artifacts.ts:321-422` | `emitCursor`, `emitCodex`, `emitOpenCode` all gate on `WRITE_AGENTS`, never on `toolsFor`. Changing `toolsFor` cannot reach them. |
| `scripts/generate-subagent-artifacts.ts:102-108` | `WRITE_AGENTS` = builder, test-engineer, documentation-agent, judge, designer. Its docblock states charter frontmatter and this set must agree, enforced by `skills-harness-integrity.test.ts`. |
| `scripts/__tests__/subagent-parity.test.ts:132-165` | `disallowedTools` is **already** in Claude's `ALLOWED_KEYS` set — no schema widening needed. |
| `scripts/__tests__/subagent-parity.test.ts:365-379` | The CLA-02/03 group reads `fm.tools ?? ""`. After the change it passes vacuously for read-only agents and **fails** for write agents. It is a real sensor that will redden; it must be rewritten, not deleted. |
| `packages/shared/src/profile-switch/hosts.ts:84-127` | `resolveHostLayout` already owns the per-host installed-agents directory, including Claude's two routes. |
| `packages/shared/src/profile-switch/claude-marketplace.ts:76` | `resolveClaudeMarketplaceRoot` resolves the versioned marketplace bundle root. |
| `packages/shared/src/profile-switch/report.ts:11-27` + `apps/mcp-client/src/config-cli.ts:300-348` | `profile list` and `profile show` both call `formatProfileInventory(listProfiles())` and nothing else — host, installed, activeProfile, bundleVersion, availableProfiles. No existing surface prints per-agent model/effort. Confirmed by reading the subcommand body, not only the `case` labels. |
| whole-repo `git grep toolsFor` (excluding `*/dist/*`) | Exactly 2 occurrences, both in `scripts/generate-subagent-artifacts.ts` (`:132` definition, `:289` call). No importer anywhere in `packages/`, `apps/`, or `benchmarks/`. The first sweep covered only `scripts/ apps/`; the Plan Challenge gate caught the narrow population and the re-run confirmed the conclusion. Deleting `toolsFor` is safe. |
| `.specs/features/subagent-skills-plugin-parity/validation.md:191` | States "Cursor uses the same generator `WRITE_TOOLS`/`READ_ONLY_TOOLS` constants". **Stale** — `emitCursor` no longer emits a `tools` key at all. A historical artifact, not a live dependency; left unedited, noted so a future reader does not treat it as a constraint on deleting those constants. |
| `skills/massa-ai/references/agent-orchestration.md:215-233` | The canonical `Agent Started` / `Agent Running` / `Agent Done` / `Agent Blocked` label set for delegated work, with its example. This is where the announcement contract belongs. |
| Machine measurement | Installed Claude bundle: `~/.claude/plugins/cache/massa-ai/massa-ai/1.48.0/agents/`. `massa-ai-investigator.md` reads `tools: ["Read","Grep","Glob","Bash"]`, `model: opus`, `effort: high`. `massa-ai-designer.md` is **absent** — the installed bundle is 1.48.0, designer shipped in 1.50.0. |

The last row is load-bearing: the STI-05.5 degraded path is not hypothetical. On
this machine, today, one of the 18 agents has no installed file.

---

## Approach Exploration — STI-05 only

STI-01 through STI-04 have one shape each once the user's decisions are fixed;
there is nothing to trade off. STI-05 has a real fork: **where per-host installed
path resolution lives.**

### Approach A — Prose contract, agent reads the installed directory (recommended)

`references/agent-orchestration.md` gains the announcement rule and a per-host
installed-agents path table. The main agent reads the 18 files once per session
with one shell command and announces from the cached values.

- **Cost**: no new code, no new CLI surface, no new MCP tool. One reference edit.
- **Risk**: the prose path table can drift from `resolveHostLayout`.
- **Mitigation**: a sensor that *executes* `resolveHostLayout` for each host and
  asserts the reference's documented paths match its output. Prose that
  disagrees with code fails the suite. This is the repo's established
  parse-the-policy-out-of-the-doc sensor style, not a new pattern.

### Approach B — New CLI subcommand `massa-ai-config agents model`

`apps/mcp-client/src/config-cli.ts` gains a subcommand that reuses
`readInstallState` + `resolveClaudeMarketplaceRoot` + `resolveHostLayout`,
parses each agent's frontmatter, and prints a table or JSON.

- **Cost**: new published CLI surface, its own tests, a shell-out per session.
- **Benefit**: path resolution is executed, never transcribed — it cannot drift.
- **Against**: adds a harness layer to solve what an instruction plus a sensor
  already solves, and the CLI is a public compatibility surface once shipped.

### Approach C — New MCP tool `agent_model`

Consistent with AD-017 ("plugins deliver, MCP serves tools"), reaching all four
hosts uniformly.

- **Cost**: the documented three-place change — `tool-defs` schema, tools-api
  route, embedded client mapping — plus parity tests, for a query that touches
  only the local filesystem and never the database or core.
- **Against**: heaviest option for the smallest deliverable in this feature.

**Recommendation: A.** It is the only option that adds no public surface, and its
single weakness — a transcribed path table — is closed by a sensor that runs the
real resolver. B and C both solve a drift problem that a 20-line test already
solves, at the price of a permanent new interface.

**Not yet confirmed — this design is not final until the user picks.**

---

## Components

### 1. `claudeToolPolicyFor` — replaces `toolsFor`

- **Purpose**: decide which of Claude's two tool-gating mechanisms a charter uses.
- **Location**: `scripts/generate-subagent-artifacts.ts`
- **Interface**:

```ts
export type ClaudeToolPolicy =
  | { readonly kind: "allowlist"; readonly tools: readonly string[] }
  | { readonly kind: "denylist"; readonly disallowed: readonly string[] }
  | { readonly kind: "inherit" };

export function claudeToolPolicyFor(name: SpecialistName): ClaudeToolPolicy;
```

- **Behavior**: an `AGENT_TOOLS_OVERRIDE` entry → `allowlist`; otherwise a member
  of `WRITE_AGENTS` → `inherit`; otherwise → `denylist` with
  `READ_ONLY_DISALLOWED`.
- **Reuses**: `AGENT_TOOLS_OVERRIDE` and `WRITE_AGENTS` unchanged. Gating on
  `WRITE_AGENTS` rather than `Charter.permission` keeps this emitter consistent
  with `emitCursor`/`emitCodex`/`emitOpenCode`, which all already gate on that
  set, and the existing integrity test already forces the set and the charter
  frontmatter to agree.
- **STI-01.6 falls out for free**: an unrecognized permission is coerced to
  `read-only` by `loadCharter:245`, and a charter absent from `WRITE_AGENTS`
  takes the denylist branch. No new guard is needed; a unit test pins it.
- **Deletions**: `READ_ONLY_TOOLS`, `WRITE_TOOLS`, and `toolsFor` become unused.
  `toolsFor` has exactly one call site and no external importer, so it is
  removed rather than kept as an alias — oxlint's `correctness` category is a
  real CI gate and unused exports are noise a future reader would trust.

### 2. `emitClaude` — key emission

- **Purpose**: render the policy into Claude frontmatter.
- **Key order**: `name`, `description`, `tools` | `disallowedTools` | *(neither)*,
  `model`, `effort`. The gating key stays in the slot `tools` occupied, which is
  what keeps `massa-ai-navigator.md` byte-identical.
- **Denylist rendering**: `disallowedTools: Write, Edit, NotebookEdit` — the
  comma-separated form Claude's own documentation uses for this field. The JSON
  array form is retained only for `tools`, where the navigator precedent already
  proves it resolves. Two forms is deliberate: each matches the shape its own
  field is documented with, and neither is guessed.

### 3. Charter and reference edits (STI-04)

| File | Line | Edit |
| --- | --- | --- |
| `skills/agents/<18 roles>/SKILL.md` | 1 line each | Drop `Never spawn subagents, ` — the clause keeps `never load the massa-ai or persona-router routers, and never open a personas/ prompt file; the dispatching workflow owns routing and persona selection.` recapitalized. |
| `skills/massa-ai/references/code-reuse-scan.md` | 46 | Remove the nesting sentence. |
| `skills/massa-ai/references/figma-pre-analysis.md` | 68 | Remove the nesting sentence. |
| `skills/massa-ai/references/spec-driven/sub-agents.md` | 70 | Drop `It does NOT spawn further sub-agents.` from the batch-worker paragraph. |
| `skills/massa-ai/references/spec-driven/sub-agents.md` | 87 | Retitle `**No nesting:**` → `**Sequential execution:**`, drop `They never spawn sub-sub-agents.`, keep the strictly-sequential rule verbatim. |

The `sub-agents.md:70` line was **missed by the first sweep** and found only by
re-enumerating the class with a PCRE pattern rather than the literal phrase. The
spec's population table records 3 reference lines; the true count is 4. That
correction is carried into STI-04.3 below.

### 4. Announcement contract (STI-05, Approach A)

- **Location**: `skills/massa-ai/references/agent-orchestration.md`,
  § Conversation Feedback — the file that already owns dispatch mechanics and the
  `Agent Started` label set.
- **Single canonical location**: `references/conversation-feedback.md` points at
  it and does not restate the rule.
- **Shape**:

```md
🤖 [Agent Started] Investigator — model opus, effort high. Scope: the four emitters.
🤖 [Agent Started] Designer — model/effort unknown (no installed agent file at
   ~/.claude/plugins/cache/massa-ai/massa-ai/1.48.0/agents/massa-ai-designer.md). Dispatching anyway.
```

- **Source rule**: read `model:` / `effort:` from the installed agent file for
  the active host. Absent `effort` → `effort: inherit`. Absent or `inherit`
  `model` → `model: inherit`. Unreadable file → state unknown, name the path,
  proceed.
- **Caching**: read once per session for all 18 agents, not once per dispatch.

---

## Error Handling Strategy

| Error Scenario | Handling | User Impact |
| --- | --- | --- |
| Installed agent file missing (version skew, agent newer than bundle) | Announce `model/effort unknown`, name the attempted path, dispatch proceeds (STI-05.5) | One extra clause on the status line; no dispatch is blocked |
| Installed agents directory missing entirely (host not installed) | Same degraded announcement, stated once per session rather than per dispatch | Same |
| Cursor is the active host | Every tier resolves to `inherit`; announce `model: inherit, effort: inherit` | Accurate, not a failure |
| `disallowedTools` turns out to be ignored for plugin sub-agents | STI-14 surfaces it; feature goes `Blocked` and the mechanism is reconsidered — it does not ship with a caveat | Read-only agents would have silently gained write tools |
| A future charter is added with no override and no recognized permission | Denylist branch (read-only) — fail safe, not fail open | None |
| A future emitter change introduces an MCP-blocking construct | STI-03.5 sensor fails naming host and construct | CI red before merge |

---

## Verification Design

Every new sensor must be observed RED against a deliberate mutation before it is
quoted. A sensor authored in the same commit as its subject is unquotable until
it has failed on purpose.

| # | Sensor | Home | Proves | Mutation that must redden it |
| --- | --- | --- | --- | --- |
| S1 | `claudeToolPolicyFor` returns the right kind per class | `generate-subagent-artifacts.test.ts` | STI-01.1-.4, .6, STI-02.3 | Swap the `WRITE_AGENTS` branch to return `denylist` |
| S2 | `emitClaude` output per class | `generate-subagent-artifacts.test.ts` | STI-01.1-.4 | Re-add `tools:` to the denylist branch |
| S3 | Emitted Claude artifacts carry no `tools:` except navigator, and read-only files carry the exact denylist | `subagent-parity.test.ts` (rewritten CLA-02/03 group) | STI-01.5, STI-02.1-.2 | Add `investigator` to `AGENT_TOOLS_OVERRIDE` |
| S4 | No host emits an MCP-blocking construct | `subagent-parity.test.ts` (new group) | STI-03.5 | Add `"mcp__*": "deny"` to the OpenCode permission block; add a `tools` key to Cursor |
| S5 | No charter contains a spawn prohibition; all 18 retain the router/persona clause | `skills-harness-integrity.test.ts` | STI-04.1-.2 | Re-add the phrase to one charter; delete the clause from another |
| S6 | No reference contains a nesting prohibition | `workflow-harness-contract.test.ts` | STI-04.3 | Re-add the sentence to `code-reuse-scan.md` |
| S7 | `sub-agents.md` still states the sequential-execution rule | `workflow-harness-contract.test.ts` | STI-04.4 | Delete the restated sentence |
| S8 | The announcement contract exists in exactly one reference, and no other dispatch block defines a competing shape | `workflow-harness-contract.test.ts` | STI-05.1, .6, .7 | Add a second announcement shape to a workflow's dispatch block |
| S9 | The reference's documented installed-agent paths equal `resolveHostLayout`'s output per host | `workflow-harness-contract.test.ts` | STI-05.2 (Approach A drift guard) | Change one documented path |

Non-sensor evidence, recorded in `validation.md` rather than committed as tests:

- **M1** — one-time byte-diff of the Cursor, Codex, and OpenCode bundles before
  and after (STI-03.1). Generate at the base commit into a temp dir, generate
  after, `diff -r`. This is a measurement, not a permanent gate; S4 is the
  permanent guard, which is why both exist.
- **M2** — STI-14's live MCP call from a dispatched sub-agent, with host version,
  server, and tool name — or recorded as a skipped sensor with its reason.
- **M3** — the standing gates: `lint`, `type-check`, `generate:artifacts --check`,
  `test:scripts`, `test:plugins`.

---

## Risks & Concerns

| Concern | Location (file:line) | Impact | Mitigation |
| --- | --- | --- | --- |
| `disallowedTools` may be ignored for plugin sub-agents, as `permissionMode`/`mcpServers`/`hooks` documented are | `scripts/generate-subagent-artifacts.ts:287` | Read-only agents silently gain `Write`/`Edit` — a permission widening no file assertion can see | STI-14 behavioral check (M2). A negative result makes the feature `Blocked`, not shipped with a caveat. Recorded as an unconfirmed assumption in `spec.md`, not as a fact. |
| `navigator`'s `Bash(pwd)` entry may not resolve — permission-specifier syntax in `tools:` is undocumented for Claude, and the errors-page section was not retrievable | `scripts/generate-subagent-artifacts.ts:129` | If it does not resolve, navigator has had no shell access since the override was written, silently | Explicitly out of scope for this feature and left byte-identical. Recorded here so it is not lost; the measurement needs a live dispatch and belongs to its own task. Changing it blind would trade one silent breakage for another. |
| Read-only agents gain `Agent`, `Skill`, `WebFetch`, `WebSearch`, `EnterWorktree` on Claude | 15 generated read-only agent files | Wider tool surface than today; `EnterWorktree` in particular can mutate git state | Accepted by explicit user decision ("block nothing extra"). `EnterWorktree` grants nothing `Bash` did not already grant, since `Bash` was already in `READ_ONLY_TOOLS`. Charter Restrictions remain the behavioral bound. |
| `subagent-parity.test.ts:366-379` passes **vacuously** for read-only agents after the change (`fm.tools ?? ""` is `""`, which contains neither `Write` nor `Edit`) | `scripts/__tests__/subagent-parity.test.ts:370` | A rewritten-but-under-specified test would report green while asserting nothing | S3 replaces it with assertions on the *presence* of the exact denylist and the *absence* of `tools:`, not only on absence of substrings. Its write-agent branch fails immediately on the change, which is the observed RED for the rewrite. |
| The prohibition population was undercounted on first sweep — 3 reference lines found, 4 exist | `skills/massa-ai/references/spec-driven/sub-agents.md:70` | A residual prohibition would contradict the shipped policy | Re-enumerated with a PCRE class pattern; S6 sweeps the class, not the literal phrase, so a fifth shape in different words still has to pass review — and the sweep pattern is recorded in the test, not in prose. |
| Generated bundles are gitignored build output (AD-016), so a stale bundle cannot be caught by `git diff` | `apps/*/agents/`, `apps/*/agent-profiles/` | A stale bundle would ship the old allowlist | `bun run generate:artifacts --check` diffs full directory inventories per managed subtree and is already a CI `build`-job step. |
| Removing the nesting prohibition takes effect immediately on Claude — nesting is on by default to depth 3 (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`), and the host withholds `Agent` only at the limit | 22 lines across `skills/` | Roster agents can begin nesting the moment this ships, on the one host measured | Intended by the user's decision. The host enforces its own depth limit and withholds `Agent` at it, so runaway nesting is bounded by the host, not by prose. Nothing added here mandates nesting — only the prohibition is removed. |
| The other three hosts' nesting capability was never measured | Cursor, Codex, OpenCode bundles | A uniform-behavior claim would be unsupported | The spec explicitly claims Claude only, recorded as a confirmed assumption. No sensor asserts cross-host nesting parity, because no evidence supports one. |
| Claude's docs give "a reviewer that should stay read-only" as the canonical case for denying `Agent` via `disallowedTools` — precisely the restriction the user chose to drop | `references/agent-orchestration.md`, 15 read-only agent files | A read-only reviewer can now spawn writers, so "read-only" describes the agent's own file access, not its transitive effect | Accepted by explicit, informed user decision. Recorded here so the trade-off is traceable to a choice rather than an oversight, and so re-adding `Agent` to the denylist is a one-line change if the effect proves unwanted. |
| STI-05's prose path table can drift from `resolveHostLayout` | `skills/massa-ai/references/agent-orchestration.md` | An announcement that reads the wrong directory reports stale or absent values | S9 executes the real resolver and compares. This is the entire reason Approach A is acceptable rather than Approach B. |

---

## Tech Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Claude read-only gating | `disallowedTools` denylist, not an allowlist | The only mechanism that inherits MCP tools dynamically. Claude documents no cross-server wildcard for `tools`, and `mcpServers:` is ignored for plugin sub-agents. |
| Denylist contents | `Write, Edit, NotebookEdit` | The three write-capable built-ins in Claude's documented sub-agent pool. `Bash` is excluded because it was already granted to read-only agents. |
| Denylist rendering | Comma-separated, not a JSON array | The form Claude's own docs use for this field. `tools` keeps the JSON array form, which the navigator precedent proves resolves. Each field matches the shape it is documented with. |
| Gate on `WRITE_AGENTS`, not `Charter.permission` | `WRITE_AGENTS` | Every other emitter already gates on it, and an existing integrity test forces it to agree with charter frontmatter. Introducing a second source here would create the disagreement that test exists to prevent. |
| `toolsFor` | Removed, not deprecated | One call site, no external importer. An unused export is a claim a future reader would trust. |
| Announcement contract home | `references/agent-orchestration.md` § Conversation Feedback | It already owns dispatch mechanics and the `Agent Started` label set. A second location is what let two roster entries go undocumented for a release with every gate green. |
| Byte-identity for 3 hosts | One-time measurement + a permanent construct sensor | A byte-freeze fixture for three hosts would redden on every legitimate registry change. S4 guards the property that actually matters. |
| New CLI or MCP surface for STI-05 | Rejected (pending user confirmation) | An instruction plus a 20-line executing sensor solves the same drift problem without adding a public compatibility surface. |

> **Project-level decisions:** none proposed. This design conforms to AD-010
> (single env prefix — no new env var is introduced), AD-016 (generated bundles
> stay untracked), and AD-017 (no new plugin-local tool surface; Approach A adds
> no tool at all).

---

## Reuse Scan

Run **inline**, not through separate read-only subagents. Inline-fallback reason,
verbatim: *session policy forbade spawning subagents at the time the scan was
due — the user's approval to dispatch batch workers came after Tasks, and the
scan's due point is before Design closes.* The scan's output is the Reuse Plan
table below plus the Current Codebase Evidence table above; every row carries a
`file:line` confirmed by reading current source in this session, which is the
evidence standard the delegated form would have had to meet.

## Reuse Plan

| Existing | Location | How used |
| --- | --- | --- |
| `AGENT_TOOLS_OVERRIDE` | `scripts/generate-subagent-artifacts.ts:128` | Kept verbatim as the allowlist escape hatch (STI-02.3) |
| `WRITE_AGENTS` | `scripts/generate-subagent-artifacts.ts:102` | Sole permission source for the new policy function |
| Claude `ALLOWED_KEYS` set | `scripts/__tests__/subagent-parity.test.ts:135` | Already contains `disallowedTools`; no widening |
| CLA-02/03 test group | `scripts/__tests__/subagent-parity.test.ts:365` | Rewritten in place rather than replaced by a new group |
| `resolveHostLayout` | `packages/shared/src/profile-switch/hosts.ts:84` | Executed by S9 as the drift oracle for the documented path table |
| `Agent Started` label set | `references/agent-orchestration.md:215-233` | Extended, not duplicated |

**Rejected alternatives**: enumerating MCP server names in `tools:` (cannot be
dynamic); `mcpServers:` frontmatter (ignored for plugin sub-agents); a per-host
`tools` capability field in `host-capabilities.ts` driving the emitters (the
divergence is one host's, and the table is documentation-bearing rather than a
dispatch mechanism).
