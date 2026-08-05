# Persona Routing Details

Load this reference from `SKILL.md` only when one of its load conditions fires:
a failure needs reporting, ambiguity needs a user question, a mid-conversation
reroute is in doubt, or the user requests multiple personas. Routing itself
runs from `SKILL.md` alone.

## Persona ↔ Sub-Agent Overlap

Four catalog entries deliberately overlap an agent charter. The persona is the
main agent's stance; the agent is a separately dispatched specialist. Applying
one never implies the other ran.

| Persona | Overlapping agent |
|---|---|
| `senior-mobile-engineer` | `massa-ai-mobile-specialist` |
| `senior-mobile-qa-automation-engineer` | `massa-ai-test-engineer` |
| `context-skill-harness-engineer-architect` | `massa-ai-architecture-specialist` |
| `product-manager` | `massa-ai-requirements-analyst` |

## Multi-Persona Requests

If multiple personas are explicitly requested, the persona owning the primary
deliverable leads and at most one other becomes a review lens. Apply the
ambiguity policy if ownership remains unclear. The review lens contributes only
checks that reduce a concrete risk; never produce independent persona answers,
simulate a debate, or merge full voices.

## Ambiguity And No-Match Behavior

When two or more candidates remain genuinely plausible:

- `ambiguity: ask` — ask one concise question listing the plausible persona
  display names and `No persona`. Use an interactive user-input tool when
  available; otherwise ask in plain text.
- `ambiguity: best_match` — choose the strongest current-deliverable owner,
  then project-specific evidence, then recent valid memory.
- `ambiguity: no_persona` — continue without a persona.

When no catalog entry fits:

- `no_match: no_persona` — continue silently unless the user explicitly
  requested routing.
- `no_match: ask` — ask about the weakly supported candidate versus
  `No persona`; with no supported candidate, ask only about `No persona`
  versus an explicitly named catalog choice.

Do not ask when the request confidently falls outside every cataloged persona —
that is a successful no-persona route, not ambiguity.

## Route Lifetime Detail

With `mid_conversation: task_change`, re-evaluate only when the user explicitly
switches, the primary deliverable changes ownership, a new task begins after
completion, or the selected catalog entry becomes invalid. With
`explicit_only`, re-evaluate only on explicit request. Do not reroute because a
follow-up adds a supporting concern, asks for verification, or mentions another
persona's terminology. If a task change creates genuine ambiguity and policy
says `ask`, ask before substantive work continues. After resume or compaction,
restore any route still present in conversation context without re-announcing
it or repeating a resolved question; if unavailable, run the normal workflow
again — no separate route database exists.

## Routing Examples

| Situation | Result |
|---|---|
| User explicitly asks for Senior Mobile QA Automation Engineer. | Apply that entry; explicit choice wins. |
| Project `AGENTS.md` pins a valid catalog id. | Pin fast path: read only that prompt; no recall, docs, signals, or classification. |
| Pin names an id absent from the catalog. | One-line invalid-pin report; continue with the normal workflow. |
| Memory recalls a successful route, current prompt asks to fix flaky Maestro CI. | Route to Senior Mobile QA Automation Engineer; memory cannot override current ownership. |
| Memory empty; docs describe a cross-platform app; prompt asks to implement offline sync. | Route to Senior Mobile Engineer from docs plus current deliverable. |
| Prompt asks for both app architecture and an automation suite, no primary outcome. | Follow `ambiguity`; default asks between plausible personas and no persona. |
| Prompt asks to draft a billing RFC. | Confident no-match; continue silently without a persona. |
| `enabled: off` and prompt names no persona. | Skip inference; continue without a persona. |
| Memory names a removed persona id. | Discard stale memory; continue to docs and classification. |
| Mobile implementation finishes; user starts a flake-reduction task. | With `task_change`, re-evaluate and announce the new route once. |

## Failure Handling Table

- **Catalog missing or invalid:** report `Persona routing unavailable:
  <reason>.` Continue without a persona.
- **Unsupported schema version:** report found and supported versions.
  Continue without a persona.
- **massa-ai unavailable or empty:** continue with targeted workspace
  documentation and the current prompt; skip route-memory reads and writes.
- **Workspace documentation unavailable:** route from explicit choice, pin,
  and current prompt; apply the ambiguity or no-match policy.
- **Remembered persona absent from catalog:** ignore it as stale evidence;
  never reconstruct it.
- **Selected prompt missing, outside the persona-library root, or malformed:**
  name the catalog entry and path. Continue without a persona; never silently
  substitute another persona.
- **Signals file missing during classification:** report the entry and path;
  the candidate stays matchable by summary and aliases.
- **User cannot be asked interactively:** ask one concise plain-text question
  when policy requires a choice; otherwise use the configured non-interactive
  behavior.
