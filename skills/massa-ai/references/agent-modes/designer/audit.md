# Designer — Mode: `audit`

Read the design source and the existing screen; compare element by element; write nothing.

Map each design element to a concrete implementation target — component, layout, spacing,
typography, color/design token, state, and empty/error/loading variants. Report conformance
per element with evidence: matched, deviated (with the measured difference), or not
represented in the design. Cover the states a design usually under-specifies: empty,
loading, error, long text, small and large screen sizes, and the platform's accessibility
defaults.

Output:
- Status: Complete | Partial | Blocked
- Scope: screens verified
- Evidence: design-source pointers (node id, frame name, link) paired with implementation pointers (`path:line`)
- Findings: per-element conformance table — element, expected, actual, verdict, severity
- Risks and skipped checks (a missing design source is always listed here)
- Exact next step

Validation sensors: every design element in scope appears in the conformance table with a
verdict, or the table states why the design source did not cover it; empty, loading, and
error states are each either implemented or explicitly recorded as not in scope.
