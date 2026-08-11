# Sub-agent Tool Inheritance Specification

Slug: `subagent-tool-inheritance` · Session `spec-subagent-tool-inheritance` ·
Workflow **spec-driven** · Persona pin `context-skill-harness-engineer-architect`
· Branch `fix/subagent-tool-inheritance` from `origin/main` @ `c32b8a22`,
worktree `/Users/luizmassa/Projects/massa-ai-wt-subagent-tool-inheritance`.

## Problem Statement

Every Claude sub-agent this repository generates ships a hardcoded `tools:`
allowlist. Claude Code treats that field as an exhaustive allowlist, so a
sub-agent cannot call **any** MCP (Model Context Protocol) tool the parent
session has active — Figma, Atlassian, Context7, or massa-ai's own 54-tool
surface. The `designer` charter is the reported case: it is told to "read the
design source first: Figma through MCP", and its generated file
(`apps/claude-plugin/agents/massa-ai-designer.md`) emits
`tools: ["Read","Grep","Glob","Bash","Write","Edit"]`, which makes that
instruction structurally impossible to follow. No dispatch re-wording can fix
it; the frontmatter is baked in at generation time by
`scripts/generate-subagent-artifacts.ts`.

The defect is wider than the reported agent, and narrower than all four hosts.
Two adjacent gaps surfaced while root-causing it and are folded in here: the
charters' blanket "Never spawn subagents" direction, which the user has decided
to retire; and the absence of any dispatch-time statement of which model and
effort a sub-agent actually runs on.

## Goals

- [ ] Every Claude sub-agent except `navigator` inherits the parent session's
      MCP tools, for any MCP server, without the generator knowing that server
      exists.
- [ ] Read-only charters keep the only enforcement the allowlist really
      provided on Claude: no `Write`, no `Edit`, no `NotebookEdit`.
- [ ] The three non-Claude hosts are proven unaffected by measurement, and a
      sensor keeps them that way.
- [ ] The "Never spawn subagents" direction is removed in all four of its
      textual shapes, leaving one coherent nesting policy.
- [ ] Every massa-ai roster dispatch states the sub-agent's model and effort,
      read from the installed agent file.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Adding MCP tool names to any generated `tools:` list | Generation time cannot know a user's per-session MCP servers. Claude's `tools` field accepts `mcp__<server>` / `mcp__<server>__*` but has no documented cross-server wildcard, so an allowlist can never be dynamic. |
| `mcpServers:` frontmatter on Claude agents | Documented as **"Ignored for plugin subagents"**; all massa-ai agents ship as plugin sub-agents. |
| Cursor, Codex, OpenCode emitter behavior changes | Measured as already inheriting MCP (see Evidence). A change would be a regression, not a fix. |
| `navigator`'s tool allowlist | User decision: index-first narrowing is the charter's purpose. It keeps `tools:` and will not see non-massa-ai MCP servers. |
| Enforcing read-only through anything other than `disallowedTools` | Claude sandboxing/permission modes are `permissionMode`, also "Ignored for plugin subagents". |
| Restricting `Agent`, `Skill`, `WebFetch`, `WebSearch` on read-only agents | User decision: block nothing extra. |
| Changing what `Bash` can do on a read-only agent | Pre-existing: `Bash` was already in `READ_ONLY_TOOLS`, so shell-based writes were already reachable. No regression either way. |
| Sub-agent depth/recursion limits | Owned by each host, not by this repository. |
| Announcing model/effort for non-massa-ai agents | The main agent cannot read frontmatter for agents this repo does not own. |

---

## Evidence

Measured before design, cited so a later reader can re-check rather than trust.

### The defect, in source

`scripts/generate-subagent-artifacts.ts:122-136`

```ts
const READ_ONLY_TOOLS = ["Read", "Grep", "Glob", "Bash"];
const WRITE_TOOLS = [...READ_ONLY_TOOLS, "Write", "Edit"];
const AGENT_TOOLS_OVERRIDE: Partial<Record<SpecialistName, readonly string[]>> = {
  navigator: ["mcp__massa-ai__*", "Read", "Grep", "Glob", "Bash(pwd)"],
};
export function toolsFor(name: SpecialistName): readonly string[] { … }
```

`emitClaude` (`:289`, `:294`) writes `tools: ${JSON.stringify(toolsFor(c.name))}`
unconditionally.

### Host behavior, quoted from each host's own documentation

Method note: every quote below was read from the raw documentation page, not
from a summarizer's paraphrase. The first pass used a summarizing fetch for
Cursor, Codex, and OpenCode; the Plan Challenge gate rejected that as
asymmetric evidence — Claude's page had been read verbatim and the other three
had not, and the Cursor URL had 404'd once before succeeding, so the summary
could have described a different page. All four were re-fetched raw and
grepped. Grades below are post-re-verification.

| Host | Verbatim citation | Verdict | Grade |
| --- | --- | --- | --- |
| Claude | `tools` — "Inherits every tool available to subagents **if omitted**." Allowlist example: "The subagent can't edit files, write files, **or use any MCP tools**." `disallowedTools` example: "The subagent keeps Bash, **MCP tools**, and the rest of its pool." | **Broken** — allowlist emitted | A |
| Cursor | "### Can I use MCP tools in subagents? / Yes. Subagents inherit all tools from the parent, including MCP tools from configured servers." | Unaffected | A |
| Codex | "session settings, such as `sandbox_mode`, `mcp_servers`, and `skills…` inherit from the parent when the custom agent file omits them" | Unaffected | A |
| OpenCode | Permission patterns are "matched as wildcard patterns against the underlying tool name, so the same syntax works for built-ins, custom tools, and MCP tools — for example `"mymcp_*": "deny"` denies every tool from an MCP server". The emitter writes only `edit` and `bash` keys, so no MCP pattern is denied. | Unaffected | A |

### Claude plugin sub-agent field support

The plugin restriction is a **closed enumeration in prose**, not an open-ended
table footnote: "For security reasons, plugin subagents don't support the
`hooks`, `mcpServers`, or `permissionMode` frontmatter fields. These fields are
ignored when loading agents from a plugin." Three fields, named, with a stated
rationale. `disallowedTools` is not among them.

Corroborating, from the nesting section: "To keep one subagent from spawning
while nesting is on, such as a reviewer that should stay read-only, omit `Agent`
from its `tools` list or **add it to `disallowedTools`**." The field is cited as
a working sub-agent control mechanism with no plugin caveat attached.

### Claude sub-agent nesting

"By default, a subagent can spawn subagents of its own, up to three layers below
the main conversation. At the depth limit, Claude Code withholds the `Agent`
tool from every subagent except a fork." The limit is
`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`; setting it to `1` turns nesting off.

Consequence for STI-04: on Claude, retiring the prohibition takes effect
immediately, because nesting is already enabled by default. The equivalent
capability on Cursor, Codex, and OpenCode was **not** measured, so this feature
claims nothing about it.

Claude additionally documents two filters over the inherited pool. The first
removes `Agent` (at depth limit), `AskUserQuestion`, `EndConversation`,
`EnterPlanMode`, `ExitPlanMode`, `ScheduleWakeup`, `TaskOutput`,
`WaitForMcpServers`, `Workflow`. The second applies to background sub-agents and
"keeps **every MCP tool** but only these built-in tools: `Read`, `Grep`, `Glob`,
`Bash`, `PowerShell`, `Edit`, `Write`, `NotebookEdit`, `WebFetch`, `WebSearch`,
`TodoWrite`, `Skill`, `ToolSearch`, `EnterWorktree`, `ExitWorktree`, `Monitor`,
`TaskStop`, `SendMessage`, `Artifact`." Neither filter removes MCP tools, so
inheritance holds in both foreground and background.

### Blast radius

17 of 18 charters lose all MCP access on Claude. `navigator` is the only
exception and reaches `mcp__massa-ai__*` only. Two consequences are load-bearing
rather than theoretical:

- `context-curator`'s charter mandates "Retrieve memories via `recall`" and "Use
  Synapse when more than one search is expected". Both are MCP calls. Its
  allowlist makes its own mission impossible.
- `designer`'s charter mandates reading Figma through MCP. Same contradiction.

### "Never spawn subagents" population

18 identical lines, one per charter in `skills/agents/*/SKILL.md`, plus **four**
other lines carrying the same policy in different words:

| File | Line | Shape |
| --- | --- | --- |
| `skills/massa-ai/references/code-reuse-scan.md` | 46 | "never spawns further subagents" |
| `skills/massa-ai/references/figma-pre-analysis.md` | 68 | "Retrieval subagents never spawn further subagents" |
| `skills/massa-ai/references/spec-driven/sub-agents.md` | 70 | "It does NOT spawn further sub-agents." |
| `skills/massa-ai/references/spec-driven/sub-agents.md` | 87 | "**No nesting:** … They never spawn sub-sub-agents" |

The `sub-agents.md:70` row was missed by the first sweep, which searched for the
literal charter phrase. It appeared only when the sweep was re-run as a PCRE
pattern over the whole prohibition class. 22 lines total, not 21.

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Claude honors `disallowedTools` on plugin sub-agents | Assume honored | Evidence grade **B**, upgraded from F by the Plan Challenge gate. Two independent supports: the plugin restriction is a closed three-field enumeration in prose that does not include `disallowedTools`; and the nesting section cites `disallowedTools` as a working sub-agent control with no plugin caveat. Neither is a behavioral observation, which is why it is still an assumption. | n — behavioral check in Execute (STI-14) |
| Retiring the prohibition changes behavior uniformly across hosts | No — claim Claude only | Claude documents nesting on by default to depth 3. The other three hosts' nesting capability was not measured, and this feature does not claim it. | y |
| `Bash(pwd)` in `navigator`'s allowlist resolves to a tool | Treat as **unverified**; leave unchanged this feature | Claude's docs describe `tools` entries as tool names and do not document permission-specifier syntax there. The errors page's "spawned with zero tools" section was not retrievable. Changing it without measurement risks trading one silent breakage for another. | n — recorded as a Design-phase measurement, not a code change |
| Removing "Never spawn subagents" grants nesting, not mandates it | Direction removed, nothing added telling agents to nest | The user asked to remove a prohibition. Adding an encouragement is a different change. | y |
| The router/persona clause survives the charter edit | Keep "never load the `massa-ai` or `persona-router` routers, and never open a `personas/` prompt file; the dispatching workflow owns routing and persona selection" | Only the spawning direction was retired. | y |
| Announcement source is the installed agent file | Read `model:` / `effort:` frontmatter from the host's installed agent file | Reports what the host will really load, including a local profile overlay, rather than what the registry would compute. | y |
| Announcement covers every massa-ai roster dispatch | All 18 specialists, every workflow, including the three standing exceptions and spec-driven batch workers | User decision. | y |
| Effort absent from a host's agent file | Announce `effort: inherit` | Cursor resolves every tier to `inherit` and emits no `effort`; Codex and OpenCode omit the key when the registry value is null. Silence would read as a lookup failure. | y |
| Read-only enforcement weakens on Claude beyond writes | Accepted | The allowlist incidentally blocked `Agent`, `Skill`, `WebFetch`, `WebSearch`. User chose "block nothing extra". | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Claude sub-agents inherit session MCP tools ⭐ MVP

**User Story**: As an engineer with an MCP server active in my Claude session, I
want a dispatched massa-ai sub-agent to be able to call that server's tools, so
that charters which mandate MCP reads (designer→Figma, context-curator→recall)
can actually do their job.

**Why P1**: The reported defect. Without it, five charters instruct agents to
perform calls the host structurally forbids.

**Acceptance Criteria**:

1. The `emitClaude` function SHALL emit no `tools:` key for any charter that has no entry in `AGENT_TOOLS_OVERRIDE`. <!-- ubiquitous -->
2. WHERE a charter's `metadata.permission` is `read-only` and it has no `AGENT_TOOLS_OVERRIDE` entry, `emitClaude` SHALL emit exactly `disallowedTools: Write, Edit, NotebookEdit`. <!-- optional-feature -->
3. WHERE a charter's `metadata.permission` is `write` and it has no `AGENT_TOOLS_OVERRIDE` entry, `emitClaude` SHALL emit neither a `tools:` key nor a `disallowedTools:` key. <!-- optional-feature -->
4. WHERE a charter has an `AGENT_TOOLS_OVERRIDE` entry, `emitClaude` SHALL emit that entry as a `tools:` allowlist and no `disallowedTools:` key. <!-- optional-feature -->
5. WHEN `bun run generate:artifacts` runs, THEN every emitted Claude agent file in `apps/claude-plugin/agents/` and every `apps/claude-plugin/agent-profiles/<profile>/` variant SHALL satisfy criteria 1-4. <!-- event-driven -->
6. IF a future charter is added with neither an override nor a recognized permission value, THEN the generator SHALL emit the read-only denylist rather than an allowlist. <!-- unwanted-behavior -->

**Independent Test**: Run `bun run generate:artifacts`, then assert
`apps/claude-plugin/agents/massa-ai-designer.md` contains no `tools:` and no
`disallowedTools:` line, and `massa-ai-investigator.md` contains
`disallowedTools: Write, Edit, NotebookEdit` and no `tools:` line.

---

### P1: `navigator` keeps its deliberate narrowing ⭐ MVP

**User Story**: As the harness owner, I want `navigator` to stay index-first, so
that the one agent whose charter is "consult the massa-ai index before reading
files" is not silently widened to every MCP server on the machine.

**Why P1**: A blanket fix would erase an intentional constraint that the
charter, the emitter override, and the OpenCode bash override all encode.

**Acceptance Criteria**:

1. The generated `massa-ai-navigator.md` SHALL contain `tools: ["mcp__massa-ai__*","Read","Grep","Glob","Bash(pwd)"]`. <!-- ubiquitous -->
2. The generated `massa-ai-navigator.md` SHALL NOT contain a `disallowedTools:` key. <!-- ubiquitous -->
3. The override mechanism SHALL remain a per-charter table so a second deliberately-narrowed agent needs no emitter change. <!-- ubiquitous -->

**Independent Test**: Regenerate and diff `massa-ai-navigator.md` against its
pre-change bytes — the frontmatter must be unchanged.

---

### P1: The other three hosts are proven unaffected ⭐ MVP

**User Story**: As a Codex, Cursor, or OpenCode user, I want proof that this
change neither breaks nor was needed for my host, so that the fix is scoped to
the host that has the defect.

**Why P1**: The request explicitly asked for all four hosts to be checked. A
claim without a sensor decays.

**Acceptance Criteria**:

1. The Cursor, Codex, and OpenCode emitters SHALL produce byte-identical output before and after this change for every charter. <!-- ubiquitous -->
2. The generated Cursor agent files SHALL contain no `tools` key. <!-- ubiquitous -->
3. The generated Codex agent files SHALL contain no `tools` key and no `mcp_servers` key, so MCP inherits from the parent config. <!-- ubiquitous -->
4. The generated OpenCode agent files SHALL contain no `tools` key, and their `permission` map SHALL deny no MCP pattern. <!-- ubiquitous -->
5. IF a future emitter change introduces an MCP-blocking construct on any host, THEN a deterministic sensor SHALL fail and name the host and the construct. <!-- unwanted-behavior -->

**Independent Test**: Freeze the three hosts' generated output to a pre-change
baseline; assert equality after the change. Separately mutate each emitter to
add a blocking construct and confirm the sensor reddens.

---

### P1: The "Never spawn subagents" direction is retired ⭐ MVP

**User Story**: As the harness owner, I want the blanket nesting prohibition
gone from every place it is written, so that agents inheriting the `Agent` tool
are not simultaneously told never to use it.

**Why P1**: Leaving it produces a live contradiction the moment P1 lands —
`Agent` becomes reachable while 21 lines of prose forbid it.

**Acceptance Criteria**:

1. The 18 `skills/agents/<name>/SKILL.md` charters SHALL each contain no phrase prohibiting the agent from spawning sub-agents. <!-- ubiquitous -->
2. The 18 charters SHALL each still contain the router and persona clause: never load the `massa-ai` or `persona-router` routers, never open a `personas/` prompt file, and the dispatching workflow owns routing and persona selection. <!-- ubiquitous -->
3. The references `code-reuse-scan.md`, `figma-pre-analysis.md`, and `spec-driven/sub-agents.md` SHALL contain no nesting prohibition, across all 4 of its occurrences. <!-- ubiquitous -->
4. The sequential-execution rule for batch workers in `references/spec-driven/sub-agents.md` SHALL be preserved and restated separately from the nesting sentence, or its removal SHALL be recorded as a deliberate behavior change in `design.md`. <!-- ubiquitous -->
5. IF the prohibition is reintroduced in any charter or reference, THEN a deterministic sensor SHALL fail and name the file and line. <!-- unwanted-behavior -->
6. WHEN the generators run, THEN the 4 host bundles SHALL carry the edited charter bodies with no residual prohibition. <!-- event-driven -->

**Independent Test**: A repository sweep for the prohibition across
`skills/` and every generated bundle returns zero matches, while a sweep for
the router/persona clause returns 18.

---

### P1: Dispatches announce model and effort ⭐ MVP

**User Story**: As the user watching a workflow, I want each sub-agent dispatch
to state which model and effort that agent will run on, so that a profile
mismatch or an unexpected `inherit` is visible at dispatch time rather than
discovered from behavior.

**Why P1**: Requested as a first-class deliverable alongside the fix.

**Acceptance Criteria**:

1. WHEN the main agent dispatches any of the 18 massa-ai roster specialists, THEN it SHALL emit one status line naming the agent, the model, and the effort. <!-- event-driven -->
2. The announced model and effort SHALL be read from the installed agent file for the active host, not computed from `skills/model-profiles.json`. <!-- ubiquitous -->
3. WHERE the installed agent file omits `effort`, the announcement SHALL state `effort: inherit`. <!-- optional-feature -->
4. WHERE the installed agent file omits `model`, or spells it `inherit`, the announcement SHALL state `model: inherit`. <!-- optional-feature -->
5. IF the installed agent file cannot be found or read, THEN the announcement SHALL state that the model and effort are unknown, name the path attempted, and the dispatch SHALL proceed. <!-- unwanted-behavior -->
6. The requirement SHALL apply to the three standing dispatch exceptions (`plan-critic`, `verification-agent`, `designer`) and to spec-driven batch workers, with no exemption. <!-- ubiquitous -->
7. The announcement SHALL use the Conversation Feedback Policy's existing `Agent Started` label and stay within its 1-2 line budget. <!-- ubiquitous -->

**Independent Test**: The contract is documented in exactly one canonical
location and every dispatch-defining reference points at it; a sensor asserts
that no dispatch block defines a competing announcement shape.

---

### P2: A behavioral check proves MCP actually reaches a sub-agent

**User Story**: As the requester, I want the fix confirmed by a sub-agent
successfully calling an MCP tool, not only by a file diff, so that the
`disallowedTools`-on-plugin-sub-agents assumption is tested rather than assumed.

**Why P2**: The generator assertions are the gate; this closes the one
assumption a file assertion cannot reach. It requires a live host session, so it
cannot be a CI gate.

**Acceptance Criteria**:

1. WHEN a massa-ai sub-agent is dispatched from a session with at least one MCP server active, THEN that sub-agent SHALL be able to call a tool from that server. <!-- event-driven -->
2. The check's result SHALL be recorded in `validation.md` with the host version, the server used, and the tool called — or recorded as a skipped sensor with its reason. <!-- ubiquitous -->
3. The check SHALL NOT assert that any MCP tool name appears in the generated `tools:` frontmatter, because the chosen mechanism removes that key. <!-- ubiquitous -->

**Independent Test**: Dispatch `massa-ai-investigator` with an MCP server
active and have it report the result of one MCP call.

---

### P3: Documentation reflects the new contract

**User Story**: As a future contributor, I want the repository's own docs to
state how sub-agent tool access works per host, so that the next emitter change
does not silently reintroduce an allowlist.

**Acceptance Criteria**:

1. The agent-harness section of `CLAUDE.md` SHALL state the per-host tool-gating mechanism and why Claude uses a denylist. <!-- ubiquitous -->
2. The per-host capability table in `scripts/lib/host-capabilities.ts` SHALL carry the tool-gating fact as a capability field or a cited comment, consistent with how that table already records per-host divergence. <!-- ubiquitous -->
3. The `[Unreleased]` section of `CHANGELOG.md` SHALL carry an entry for this change. <!-- ubiquitous -->

**Independent Test**: `bun run test:scripts` stale-pointer and doc-path sensors
stay green; the CHANGELOG merge gate passes.

---

## Edge Cases

- IF every entry in a `tools:` list fails to resolve THEN Claude refuses to
  launch the sub-agent ("would be spawned with zero tools — refusing"). The
  denylist path cannot reach this state because it emits no allowlist;
  `navigator` remains the only agent that can, which is why its `Bash(pwd)`
  entry is recorded as an open measurement rather than left unexamined.
- WHEN a sub-agent runs in the background (Claude's default) THEN the second
  filter strips most built-ins but "keeps every MCP tool", so inheritance holds
  in both foreground and background.
- IF `disallowedTools` turned out to be ignored for plugin sub-agents THEN
  read-only agents would gain `Write`/`Edit` — a silent widening. STI-14's
  behavioral check is what would surface it; a failing result makes this feature
  `Blocked` pending an alternative mechanism, not shipped with a caveat.
- WHEN a user has no MCP server active THEN behavior is unchanged from today for
  every agent.
- IF a host's installed agent file is stale relative to the repository (the
  known "regenerate writes the repo, install reads the installed plugin" split)
  THEN the announcement reports the installed values, which is the intended
  behavior — it reports what will run.
- WHEN Cursor is the active host THEN every agent resolves to `inherit`, so the
  announcement states `model: inherit, effort: inherit` for all 18.
- IF a charter is added or removed THEN the per-charter override table and the
  denylist default require no edit; only the `AGENT_TOOLS_OVERRIDE` map does,
  and only for a deliberately-narrowed agent.

---

## Implicit-Requirement Sweep

Large scope — every dimension resolved.

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | Generator input is the charter set; `loadCharter` already throws on a missing `description` or `model_tier`. STI-01.6 adds the unrecognized-permission fallback. |
| Failure / partial-failure states | `emitHostProfile` prunes then rewrites each directory; a mid-run failure leaves a partially-emitted bundle, which `generate:artifacts --check` detects. Unchanged by this feature. |
| Idempotency / retry / duplicate handling | Generation is idempotent by construction (prune-before-emit). Re-running `generate:artifacts` twice produces identical bytes — asserted by the existing `--check` gate. |
| Auth boundaries & rate limits | N/A because no network or credential path is touched. |
| Concurrency / ordering | N/A because generation is sequential per host and the announcement is main-agent prose. Nesting removal does not introduce parallelism: STI-04.4 preserves the sequential batch-worker rule. |
| Data lifecycle / expiry | N/A because no persisted state is created. Generated bundles are gitignored build output (AD-016) and are pruned on every run. |
| Observability | The dispatch announcement *is* the observability deliverable (P1, STI-05). No logging change elsewhere. |
| External-dependency failure | STI-05.5: an unreadable installed agent file degrades the announcement and never blocks the dispatch. Host doc claims are pinned in the spec's Evidence table so a future doc change is detectable by re-reading, not by silent drift. |
| State-transition integrity | The only transition is charter → generated file. STI-01.5 asserts it across both the active `agents/` set and every `agent-profiles/<profile>/` variant, which is where a partial change would hide. |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| STI-01 | P1: Claude sub-agents inherit session MCP tools | Design | Pending |
| STI-02 | P1: `navigator` keeps its deliberate narrowing | Design | Pending |
| STI-03 | P1: The other three hosts are proven unaffected | Design | Pending |
| STI-04 | P1: The "Never spawn subagents" direction is retired | Design | Pending |
| STI-05 | P1: Dispatches announce model and effort | Design | Pending |
| STI-14 | P2: A behavioral check proves MCP reaches a sub-agent | Execute | Pending |
| STI-15 | P3: Documentation reflects the new contract | Execute | Pending |

**ID format:** `STI-[NUMBER]`. Sub-criteria are cited as `STI-01.2`.

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 7 requirements, 0 mapped to tasks yet.

---

## Verification Approach

- **Deterministic (CI-reachable):** generator unit assertions per host and per
  permission class; a frozen pre-change baseline for the three unaffected hosts;
  a reintroduction sensor for both the allowlist and the nesting prohibition;
  `bun run generate:artifacts --check` for drift; `bun run test:scripts` and
  `bun run test:plugins` for the parity suites.
- **Mutation-proved:** each new sensor must be observed RED against a deliberate
  mutation before it is trusted — a sensor authored in the same commit as its
  subject is unquotable until it has failed on purpose.
- **Behavioral (host-only, not CI):** STI-14's live MCP call from a dispatched
  sub-agent, recorded with host version and tool name, or recorded as skipped.
- **Explicitly not a check:** asserting MCP tool names appear in generated
  `tools:` frontmatter. The chosen mechanism removes that key; such an assertion
  would fail by design.

## Sizing

Large. Specify + Design + Tasks + Execute. Design is required: a public
compatibility surface (generated plugin artifacts consumed by four host CLIs),
a per-host divergence table, and a new cross-cutting dispatch contract. Tasks is
required: the work has more than 3 steps with a real dependency edge — the
nesting-prohibition removal must land with or after the tool change, never
before, or the bundles carry a prohibition against a tool the agent already has.

## Success Criteria

- [ ] A `designer` sub-agent dispatched from a Figma-MCP-active session
      completes a Figma MCP call.
- [ ] `massa-ai-navigator.md` is byte-identical to its pre-change form.
- [ ] Cursor, Codex, and OpenCode bundles are byte-identical to their pre-change
      form.
- [ ] Zero matches for the nesting prohibition across `skills/` and all four
      generated bundles; 18 matches for the retained router/persona clause.
- [ ] Every new sensor has a recorded observed-RED mutation result.
- [ ] `lint`, `type-check`, `generate:artifacts --check`, `test:scripts`, and
      `test:plugins` all green.
