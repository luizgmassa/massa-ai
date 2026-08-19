# Maestro Reference Index

Use this small index from `workflows/maestro/maestro.md`, `workflows/maestro/maestro-audit.md`, and `workflows/maestro/maestro-fix.md` to select the minimum focused Maestro reference for the current step. Not the full Maestro source of truth.

## Source Policy

Load `references/maestro/fact-ledger.md` before making any normative Maestro claim. Every Maestro claim must be tagged as `official-doc`, `live-help`, `repo-convention`, or `excluded/unverified`.

Use a user-supplied coverage checklist, when the user provides one, only as a coverage checklist. If a checklist item is not supported by official Maestro docs, live CLI help, or repository convention, quarantine it as `excluded/unverified`.

Official source anchors:

- CLI commands/options: https://docs.maestro.dev/maestro-cli/maestro-cli-commands-and-options.md
- Commands available: https://docs.maestro.dev/reference/commands-available.md
- Selectors: https://docs.maestro.dev/reference/selectors.md
- Workspace configuration: https://docs.maestro.dev/reference/workspace-configuration.md
- Test reports/artifacts: https://docs.maestro.dev/maestro-flows/workspace-management/test-reports-and-artifacts.md
- Cloud build requirements: https://docs.maestro.dev/maestro-cloud/build-your-app-for-the-cloud.md
- Cloud limits: https://docs.maestro.dev/maestro-cloud/limits.md
- Maestro MCP: https://docs.maestro.dev/get-started/maestro-mcp.md

## Minimum Step Selection

- Flow implementation: load `fact-ledger.md`, `cli-device.md`, then only the focused files for the flow surface being edited: commonly `yaml-commands.md`, `selectors.md`, `workspace-execution.md`, `config-env-output.md`, `js-scripting.md`, and `patterns.md`.
- Audit: load `fact-ledger.md`, `cli-device.md`, `workspace-execution.md`, `artifacts-reports.md`, `patterns.md`, and `references/audit-report-io.md`.
- Fix: load `fact-ledger.md`, `cli-device.md`, `artifacts-reports.md`, `patterns.md`, and whichever focused file owns the saved `MST-*` finding.
- Cloud or MCP work: load `cloud.md` or `mcp.md` only when the requested flow, audit, fix, or CI wiring actually touches that surface.

## Closure Reminder

All Maestro workflow closures must report scenario source, changed flows, setup/teardown, command, exit status, JUnit path, artifact directory, device/platform, skipped reason, validation assets, and residual risk.
