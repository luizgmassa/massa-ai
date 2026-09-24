# Code Quality Lens

Load from `workflows/code-quality/code-quality-audit.md` (detection) and
`workflows/code-quality/code-quality-fix.md` (repair). Both workflows used to
carry their own copy of these rules, in different words, which is how one copy
drifts into saying something the other does not.

This file owns the rules themselves. Each workflow owns only what is genuinely
its own: the audit owns static leads, severity, and the report contract; the fix
owns sizing, the refactoring map, and behavior preservation.

## The Split Criterion

One criterion governs every "should this be split out?" question in this lens,
whether the answer becomes a finding or an edit:

**Split only when the result yields an externally-findable named unit (locatable
by search or grep from outside the file) or measurably reduces change risk;
never split on size or "more than one thing" alone.**

The negative half is the load-bearing half. "This function does more than one
thing" and "this file is long" are observations, not defects: an extraction that
produces a helper only its single caller can find has moved the code without
making anything easier to locate, change, or delete. Splitting on an accurate
description needing the word "and" is the specific rule this replaces, and it is
not a rule here.

Apply the same criterion, unchanged, when the question is inverted — whether to
inline rather than split.

## File Shape

Flag multi-subject files (unrelated exported surfaces bundled together) and any
file over ~600 lines, regardless of subject count — it crowds out working
context for the rest of the task (see `references/coding-guidelines.md` "File
shape for agent readers"). Do NOT flag a single-subject file for line count
alone below that bound.

## SOLID

Non-test source only.

| Principle | Flag when | Fix direction |
|---|---|---|
| Single Responsibility | a class or module bundles distinct concern groups — validation plus persistence, formatting plus dispatch — and separating them meets the Split Criterion above, never on concern-count or size alone | separate mixed responsibilities only when the split yields an externally-findable named unit (locatable by search or grep from outside the file) or reduces change risk |
| Open/Closed | a caller-side switch or if/else chain on a type tag means adding a variant requires modifying existing files | replace with polymorphism or a data map only when new variants are real |
| Liskov | a subtype throws where the base does not, ignores required methods, or narrows the base contract | preserve base contracts |
| Interface Segregation | an interface forces implementors to define unused methods | narrow fat interfaces |
| Dependency Inversion | a hardcoded `new ConcreteType()` sits inside a class body where abstraction or injection would be natural | inject dependencies when hardcoded concretes block testing or substitution |

## Clean Code

Test and non-test source.

| Smell | Flag when | Fix direction |
|---|---|---|
| Magic values | a meaningful bare literal repeats — strings, timeouts, thresholds, event names | replace with named constants |
| Function does more than one thing | the Split Criterion above is met | split functions only when the result yields an externally-findable named unit (locatable by search or grep from outside the file) or measurably reduces change risk — never split on size or "more than one thing" alone |
| Unqualified generic names | a name carries no domain or role qualification | name domain concepts precisely using `references/naming-standards.md` |
| What-comments | a comment restates the code | remove it; keep only why comments for constraints, workarounds, or non-obvious invariants |
| Half-finished surfaces | an exported TODO, stub, placeholder return, or "implement later" path | finish or delete it |
| Long parameter lists | more than 3-4 positional parameters | convert to an options object when it improves call-site clarity |

## KISS, YAGNI, DRY

**KISS.** Flag abstractions, layers, indirection, or control flow that raise
cognitive load without clearly improving readability, correctness, or constraint
handling. Call out premature generalization, deep call chains, excessive
configuration, and clever patterns that obscure intent. Prefer straightforward,
explicit code a new reader can follow end-to-end: inline trivial abstractions,
collapse unnecessary layers, choose boring solutions unless complexity is
justified (real variability, hard constraints, or measured bottlenecks). When
weighing whether to split instead of inline, apply the Split Criterion above
unchanged — the direction of the question does not change the criterion.

**YAGNI.** Flag speculative features, extension points, and generic
infrastructure with no concrete caller, requirement, or near-term use. Call out
"just in case" hooks, over-parameterization, unused toggles, and frameworks
introduced ahead of need. Prefer implementing only what current use cases
demand, structured to evolve when real requirements appear. Defer generalization
until duplication or constraints force it, and remove dead or unused paths
aggressively.

**DRY.** Flag duplicated logic, data transformations, or domain rules repeated
without a strong reason (e.g., performance isolation or explicit decoupling).
Highlight copy-paste patterns, parallel conditionals, and repeated constants
that raise maintenance cost or inconsistency risk. Recommend consolidation into
a single source of truth when it improves clarity and reduces bugs, but avoid
over-abstraction that harms readability or adds indirection for trivial reuse.

**AI-slop surfaces.** Generic abstractions with no domain vocabulary,
fabricated-looking type names, unnecessary factories/builders, wrappers around
one call, comments that narrate obvious code, and broad configurability not
supported by current requirements. Remove them when current usage evidence does
not justify them.

## Standing Rules

- Prefer delete, inline, or merge over a replacement abstraction whenever simpler
  code preserves behavior.
- Require usage evidence before calling a surface unnecessary. When the evidence
  is incomplete, mark the item `suspect` rather than reporting it as a defect.
- **Architecture boundary.** Do not report, recommend, or introduce ports,
  adapters, bounded contexts, new service/module boundaries, or VSA-style folder
  migration from this lens. Those need dependency-direction, strength, distance,
  volatility, module-depth, or cross-domain ownership evidence this lens does not
  gather — hand them to `workflows/architecture/architecture-audit.md`.
