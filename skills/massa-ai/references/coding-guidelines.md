# Coding Guidelines

Source: Karpathy Guidelines (Useful-Agent-Skills)

Behavioral guidelines to reduce common LLM coding mistakes. These principles bias toward caution over speed—for trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them—don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.
- Disagree honestly. If the user's approach seems wrong, say so—don't be sycophantic.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it—don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

**The test:** Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. File Shape for Agent Readers

**Read mechanics, not module depth.**

- A one-subject file up to ~500 lines is fine — a single agent read stays coherent, cheap in tokens, and a coding agent can hold the whole file in context with headroom for the rest of the task.
- A file over ~600 lines must be flagged for splitting — even one-subject, it crowds out the rest of the working context and pushes reads toward pagination.
- Splitting one subject across many files does not reduce read cost — it multiplies it: one subject spread over N files costs N reads, and each file boundary loses context (per-hop navigation cost).
- This guidance derives from agent read mechanics, not from module depth. Depth is a separate concept, and this section makes no depth claim: depth is NOT a lines-of-code ratio (`references/architecture-deepening-lens.md` Rejected Framings) — a deep module can be tiny and a shallow wrapper can be long. Do not phrase file-size guidance as a depth metric; it is scoped to single-agent read cost only.
