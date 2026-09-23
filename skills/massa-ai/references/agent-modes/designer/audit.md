# Designer — Mode: `audit`

Read the design source and the existing screen; compare element by element; write nothing.

Output:
- Status: Complete | Partial | Blocked
- Scope: screens verified
- Evidence: design-source pointers (node id, frame name, link) paired with implementation pointers (`path:line`)
- Findings: per-element conformance table — element, expected, actual, verdict, severity
- Risks and skipped checks (a missing design source is always listed here)
- Exact next step
