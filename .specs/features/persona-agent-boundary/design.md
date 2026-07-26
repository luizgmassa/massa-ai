# Design — Persona / Sub-Agent Boundary

Spec: `.specs/features/persona-agent-boundary/spec.md`

## Approach

The five gaps are contract gaps in prose, so the change is prose plus gates. The design
question is not *what to say* but *how to say it once and make it load-bearing*, in a repo
that already carries three copies of the Capability Packet and 15 near-identical charters.

Two structural choices drive everything below.

### A1 — One canonical clause, asserted across all copies

The Capability Packet is defined three times, by design: `skills/AGENTS.md` (registry
view), `references/agent-orchestration.md` (runtime dispatch view), and
`references/subagent-design.md` (role-authoring view). This feature does not collapse them
— that is a separate refactor with its own blast radius. Instead the `persona` field uses
**one identical clause fragment in all three**, and one test asserts that fragment appears
in exactly the three expected files.

Canonical fragment (must be byte-identical in all three):

```
advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions
```

Rejected alternative: paraphrasing per file to match each file's voice. It reads better and
is untestable — a substring gate cannot distinguish a legitimate paraphrase from a
weakened one, so drift would ship silently. Uniform text is the cost of a real gate.

### A2 — Charter rules are disk-enumerated, never listed

Both charter-scoped requirements (PAB-02, PAB-06) are enforced by tests that read
`skills/agents/*/` from the filesystem, exactly as the existing `charterNames()` helper in
`scripts/__tests__/skills-harness-integrity.test.ts` already does. A hardcoded roster would
pass for a 16th charter that never got the lines. This mirrors how the file's existing
"every charter is registered" test already works, so it adds no new pattern.

## Exact clause text

### C1 — Capability Packet field (3 files)

Appended to the field list in `skills/AGENTS.md` (§ Capability Packet),
`skills/massa-ai/references/agent-orchestration.md` (§ Capability Packet), and
`skills/massa-ai/references/subagent-design.md` (§ Capability Packet):

```markdown
- `persona`: optional. The cataloged persona id in effect for the parent conversation,
  passed as advisory framing only — it never overrides the agent's charter Restrictions,
  scope, or permissions.
```

### C2 — Charter persona precedence (15 files, `## Restrictions`)

```markdown
- A `persona` supplied in the capability packet shapes emphasis only; these Restrictions win on any conflict.
```

### C3 — Charter self-routing ban (15 files, `## Restrictions`, replaces existing line)

Before:

```markdown
- Never spawn subagents and never load the `massa-ai` router; the dispatching workflow owns routing.
```

After:

```markdown
- Never spawn subagents, never load the `massa-ai` or `persona-router` routers, and never open a `personas/` prompt file; the dispatching workflow owns routing and persona selection.
```

C2 and C3 are adjacent and complementary, which is how PAB-06/AC2 is satisfied in the text
itself rather than by a reader's inference: an agent **may receive** a persona in its
packet (C2) and **may never select** one itself (C3). Ordering is C3 then C2 — the ban
first, the narrow allowance second, so the allowance reads as the exception it is.

The `personas/` clause is the Plan Challenge gate's finding 2. A packet carries a bare id
like `senior-mobile-engineer`, which is not self-defining; "shapes emphasis" is an
instruction a sub-agent cannot follow without knowing what the persona *is*. Banning the
router does not ban reading the persona's prompt file — those are different paths. Left
open, the most likely reader response to an unresolvable instruction is to go look it up,
and the file it would find (`personas/senior-mobile-engineer.md`) claims implementation
ownership. That is gap #5 reproduced one layer down, inside an agent that may hold write
permission. One clause closes it, at the same cost as the router ban next to it.

The corresponding receive-side statement goes in C4: the packet carries an id, never the
prompt, and the sub-agent works from the id alone.

### C4 — persona-router: new `## Persona And Sub-Agents` section

Inserted after `## Instruction Precedence`, before `## Automatic Routing Workflow` — inside
the part of the file a router read actually reaches, satisfying PAB-05/AC1.

```markdown
## Persona And Sub-Agents

Personas and sub-agents are different layers. A persona shapes how the main agent reasons
and synthesizes. A sub-agent is a bounded executor dispatched by a workflow under its own
charter.

- A persona grants no tool access, no write scope, and no permission. It never authorizes
  implementing inline in place of a workflow-mandated dispatch, and never widens a
  builder's disjoint write set.
- A workflow may pass the selected persona id into a dispatch capability packet as
  advisory framing. Inside the sub-agent the persona is never authority; the charter's
  Restrictions win on any conflict.
- The packet carries the persona **id only**, never the persona prompt. A sub-agent works
  from the id and its own charter, and never opens a `personas/` file to expand it.
- A persona route is not a specialist consultation. Applying a persona neither substitutes
  for nor satisfies an agent dispatch that the workflow requires.

Four catalog entries deliberately overlap an agent charter. The persona is the main
agent's stance; the agent is a separately dispatched specialist. Applying one never implies
the other ran.

| Persona | Overlapping agent |
|---|---|
| `senior-mobile-engineer` | `massa-ai-mobile-specialist` |
| `senior-mobile-qa-automation-engineer` | `massa-ai-test-engineer` |
| `context-skill-harness-engineer-architect` | `massa-ai-architecture-specialist` |
| `product-manager` | `massa-ai-requirements-analyst` |
```

Persona ids and agent names are written bare, not as paths. The existing reference-integrity
test resolves every `personas/…` and `skills/agents/…` *path* mentioned under `skills/`;
bare ids stay out of that scan and cannot create a dead link.

### C5 — persona-router: scoped Stop Conditions

Before:

```markdown
Routing is complete when one primary persona is applied, the user selects no persona, or policy intentionally produces a no-persona route. Do not invoke a separate model router, launch subagents, create subprocess orchestration, or persist a route database.
```

After:

```markdown
Routing is complete when one primary persona is applied, the user selects no persona, or policy intentionally produces a no-persona route. Persona routing itself stays inline: do not invoke a separate model router, launch subagents for persona selection, create subprocess orchestration, or persist a route database. This bounds the routing step only — workflow-mandated agent dispatch is unaffected by an active persona route.
```

The rewrite is what makes PAB-04 testable in both directions: the scoped form must be
present **and** the unscoped fragment `launch subagents, create subprocess orchestration`
must be absent. A presence-only assertion would pass if someone re-added the old sentence
alongside the new one.

## Test design

New `describe` block appended to `scripts/__tests__/skills-harness-integrity.test.ts`, and
one new numbered entry in that file's header comment (which documents one defect class per
block — leaving it stale would break the file's own convention).

| # | Test | Requirement | Discriminates against |
|---|---|---|---|
| 1 | all three packet copies declare `persona` with the canonical clause | PAB-01 | field dropped from any one copy, or clause weakened in one |
| 2 | the canonical clause appears in exactly those three files under `skills/` | PAB-01/AC3 | a fourth packet definition forking the contract |
| 3 | every charter's **`## Restrictions` span** carries the C2 precedence line | PAB-02/AC3, AC4 | a new charter added without it; a line that landed in the wrong section |
| 4 | every charter's **`## Restrictions` span** carries the C3 extended ban | PAB-06/AC1, AC3, AC4 | a new charter added with the old form; a ban outside Restrictions |
| 5 | no charter contains the superseded `massa-ai`-only restriction sentence | PAB-06/AC5 | old sentence restored alongside the new one |
| 6 | persona-router contains the scoped stop condition | PAB-04 | scope qualifier deleted |
| 7 | persona-router does **not** contain the unscoped fragment | PAB-04 | old sentence restored alongside the new one |
| 8 | persona-router states persona grants no tool access / write scope / permission | PAB-07 | rule deleted |
| 9 | persona-router states a persona route is not a specialist consultation | PAB-05 | rule deleted |

Cases 3, 4, and 5 are the Plan Challenge gate's finding 3. The original design applied
presence+absence rigor to PAB-04 alone and used whole-file searches for the charter rules —
which would have passed a charter whose C2 line landed under `## Inputs`, in direct
violation of PAB-02/AC2. Section-scoping (3, 4) and the absence assertion (5) bring the
charter rules to the same standard the design already demanded of PAB-04.

**Accepted residual (finding 3, partial).** Cases 1, 2, 6, 8, and 9 remain presence-only.
The contradiction-by-addition risk they carry is real — a future edit could add "a persona
may authorize write scope" elsewhere in the file while case 8's clause stays present and
green. It is not closed here because the absence side has no bounded fragment to assert
against: unlike PAB-04, where exactly one superseded sentence exists to forbid, a
contradicting *addition* has unbounded phrasing, and a keyword blocklist would produce
false failures on legitimate prose. Recorded as accepted risk rather than silently left as
a gap.

All assertions read from disk; none is skipped when a tool is absent. The suite is
DB-free and Ollama-free, so it runs in `bun run test:scripts` and in the deterministic gate.

## CONTRIBUTING 7-step mapping

| Step | Status | Rationale |
|---|---|---|
| 1. Contract | Done | `spec.md` requirements PAB-01..10 with inputs, outputs, invariants |
| 2. Register | Done | `skills/AGENTS.md` § How to Add an Agent gains the two new charter lines so a future charter is compliant by construction; the packet field is registered in all three packet definitions |
| 3. Preserve argv | **N/A** | No component in scope wraps or delegates to an external command; no argument vector exists |
| 4. Read-only export | **N/A** | No component in scope holds internal state; the change is declarative contract text |
| 5. Deliver-before-ack | **N/A** | No asynchronous invocation in scope |
| 6. Invariants | Done | The invariants are the eight assertions above; each has a disk-read test with no error/timeout path to diverge on |
| 7. Tests | Done | PAB-09 — each case mutation-checked before commit |

Steps 3–5 are recorded N/A with reasons rather than silently skipped, per the protocol's
"no invariant is silently violated" rule.

## Risks

| Risk | Mitigation |
|---|---|
| C1's byte-identical requirement is brittle across three files with different voices | Accepted deliberately (A1). The test names all three paths, so a failure points at the exact file |
| 15 charter edits are mechanical and easy to half-apply | Disk-enumerated, section-scoped tests (A2) fail on any miss; **both** generators' `--check` catch an unregenerated bundle |
| Adding a `persona` field no workflow emits creates a documented-but-dead contract | Accepted and stated in spec Out of scope. The field is optional; absent is the valid default. Runtime adoption is a tracked follow-up |
| ~580 mirrored plugin files inflate the diff | Expected and pre-existing; the two `--check` gates are what make the mirrors trustworthy |
| Cases 1, 2, 6, 8, 9 are presence-only and could pass alongside contradicting added prose | Accepted (finding 3, partial). No bounded absence fragment exists to assert against; a keyword blocklist would false-fail on legitimate prose. See § Test design |
| The `persona` id reaching a sub-agent is still a second instruction source inside an isolated executor | Accepted — inherent to D1, which the user chose over main-agent-only. Narrowed by C3's `personas/` ban (id only, never the prompt) and by C2's explicit precedence. Not eliminated |
