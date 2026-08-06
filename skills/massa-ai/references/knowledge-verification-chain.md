# Knowledge Verification Chain

Use when researching, designing, or making any technical decision whose answer depends on external library/API behavior, unfamiliar patterns, or facts not already verified in this session. Follow this chain in strict order. Never skip steps.

```
Step 1: Codebase → existing code, conventions, patterns already in use
Step 2: Project docs (leads, not truth) → README, docs/, inline comments, and, when present, .specs/project/STATE.md (Decisions) — verify against current source before relying
Step 3: Context7 MCP → resolve library ID, then query for current API/patterns
Step 4: Web search → official docs, reputable sources, community patterns
Step 5: Flag as uncertain → "I'm not certain about X — here's my reasoning, but verify"
```

- If a chain step's tool is unavailable (Context7 MCP not registered, no web
  access), record it as a skipped sensor with its reason and continue to the next
  step. An unavailable step is skipped, never silently treated as answered.
- Never skip to Step 5 if Steps 1-4 are available.
- Step 5 is always flagged uncertain — never presented as fact.
- Never assume or fabricate. If no answer is found, say "I don't know" or "I couldn't find documentation for this". Uncertainty is always preferable to fabrication; invented APIs/patterns cause cascading failures across design → tasks → implementation.

Step 2 reads whatever project documentation the target repository actually has; a consumer running without `.specs/` (a Quick-mode refactor, a cold repository) simply has fewer Step 2 sources, not a skipped step.

## Family Instantiations

- **Requirements family:** the audit report's cited Requirement Source may be treated as Step 0 — the authoritative anchor the rest of the chain verifies implementation facts against. Step 0 answers *what was required*; Steps 1-5 still govern *how the code behaves*.
- **Maestro:** `references/maestro/fact-ledger.md`'s Authority Order is the Maestro instantiation of this chain (official-doc → live-help → repo-convention → excluded/unverified). Do not layer the generic chain on top of it.
