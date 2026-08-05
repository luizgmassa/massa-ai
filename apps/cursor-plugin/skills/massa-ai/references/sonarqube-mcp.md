# SonarQube MCP Protocol

Use this reference from `workflows/implementation/implementation-audit.md` and
`workflows/implementation/implementation-fix.md` when SonarQube MCP tools may
be available for the current implementation scope.

## Detection And Availability

Check whether SonarQube MCP is available and useful for the implementation
scope:

- Detect callable SonarQube MCP tools at runtime, such as project discovery,
  issue search, file/snippet analysis, advanced code analysis, duplicated-file
  search, component measures, security hotspots, guidelines, or quality gate
  status.
- If SonarQube MCP is unavailable, no project key can be resolved, required
  credentials/configuration are missing, or the target files are outside the
  configured SonarQube project, record `SonarQube MCP: not evaluated` with the
  skipped-check reason and continue normal lens synthesis.

## Firewall And Invocation

If available, use `references/context-firewall.md` and pass only the
immutable implementation scope packet, resolved files, branch/PR identifiers,
project key, and minimal file contents or paths required by the selected
SonarQube tools.

Wait for SonarQube MCP execution to finish when a tool starts analysis,
capture quality gate status when available, and summarize raw
issues/measures/hotspots instead of copying raw tool output into the report.

## Normalization Areas

Normalize actionable SonarQube results into only these implementation audit
areas: Architecture, Correctness/Bugs, Code Quality, Security, and Tests. Do
not create a Requirements finding from SonarQube output.

## Preserved Fields

Preserve Sonar issue key, rule key, tool name, severity/impact, file/line,
quality gate condition, and evidence summary inside the normalized finding.

## ID Mapping

Use normal source-qualified implementation IDs after normalization, such as
`Architecture/ARCH-1`, `Correctness/BUG-1`, `Code Quality/CQ-1`,
`Security/SEC-1`, or `Tests/TST-1`; do not invent `SONAR-*` executable finding
IDs. The canonical area/prefix table and discipline live in
`references/audit-report-io.md` (Source-Qualified Finding IDs).

## Exclusion Rules

Keep unmapped, duplicate, low-context, or out-of-scope SonarQube results in
Scope And Evidence or skipped checks, not in Findings or Execution Handoff.

## Reporting Integration

- Include SonarQube MCP as evidence in the coverage matrix or Scope And
  Evidence, with quality gate status when available.
- Sonar-derived findings enter the execution handoff only after normalization
  to one of the supported source lens IDs and with enough evidence for
  `implementation-fix` to revalidate from the saved markdown report.
- Do not persist raw SonarQube output; persist only normalized, durable
  patterns after Importance Calibration.

## Fix-Time Consumption

Treat SonarQube-derived items as actionable only when the saved
implementation report already normalized them to a supported source-qualified
ID with source lens, original ID, Sonar issue/rule evidence, location,
impact, and verification suggestion. Never execute directly from raw
SonarQube MCP output, quality gate summaries, chat summaries, or remembered
Sonar findings.
