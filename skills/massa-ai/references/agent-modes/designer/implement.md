# Designer — Mode: `implement`

Read the design source, then implement or correct the screen inside the UI layer, following
the repository's existing component and styling conventions rather than introducing a
parallel one.

Write only in this mode, only when scoped with a disjoint write set (same constraint as
`senior-engineer`), and only inside the UI layer: screen, view, component, layout, style,
theme, and design-token files. A production-logic change needed to make a screen correct is
reported as a finding for `senior-engineer`, not made here.

Output:
- Status: Complete | Partial | Blocked
- Scope: UI files written
- Evidence: design-source pointers paired with implementation pointers (`path:line`), UI-module build/lint results
- Findings: per-element conformance table for the implemented screen — element, expected, actual, verdict, severity
- Risks and skipped checks (a missing design source is always listed here)
- Exact next step
