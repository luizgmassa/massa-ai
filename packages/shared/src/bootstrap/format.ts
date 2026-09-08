/**
 * Shared CLI formatting for the bootstrap rule toggles (T16 / TASK-016,
 * BST-10, BST-11).
 *
 * Both published CLIs — `apps/mcp-client/src/config-cli.ts` (T17) and
 * `apps/opencode-plugin/src/config-cli.ts` (T18) — call these two functions
 * instead of each growing its own copy. That is the whole point of the
 * module: `formatProfileInventory` and `formatSwitchReport` are already
 * byte-identical across those two files (`config-cli.ts:105-142` against
 * `:111-148`, 38 lines), and a `bootstrap` surface that repeated the pattern
 * would double the drift surface the T19 parity guard has to police.
 *
 * These return a `string` rather than calling `console.log`, which is the one
 * deliberate divergence from the profile formatters' shape. Two reasons, both
 * structural. `packages/shared` is imported by the stdio MCP server, whose
 * stdout carries JSON-RPC and nothing else (`utils/logger.ts` routes every
 * level to stderr for exactly this reason), so a shared module that writes to
 * stdout is a hazard even when today's only callers are CLIs. And a returned
 * string is assertable directly, where a `void` + `console.log` shape forces
 * every test through a console-capture harness that proves the call happened
 * rather than what it printed. The callers each spend one `console.log(...)`.
 *
 * Test: cd packages/shared && bun test src/bootstrap/__tests__/format.test.ts
 */

import { BOOTSTRAP_RULES } from "./rules";
import type { BootstrapReport } from "./report";
import type { BootstrapState } from "./state";

/** How an enabled flag reads in both the state column and the default column,
 *  so a row can never say "enabled" in one and "on" in the other. */
function enabledWord(enabled: boolean): string {
  return enabled ? "enabled" : "disabled";
}

/**
 * The `bootstrap list` / `bootstrap show` body (BST-11 AC-3): every rule id,
 * its current state, its registry default, and its one-line description.
 *
 * Rows come from {@link BOOTSTRAP_RULES} in registry order, not from
 * `Object.keys(state)`, so the listing order is the render order and does not
 * depend on the key order of whatever `config.json` happened to hold. A
 * persisted id absent from the registry therefore cannot appear here at all;
 * it is reported through `BootstrapReport.ignoredStateKeys` instead
 * (BST-10 AC-12, see {@link formatBootstrapReport}).
 *
 * The default is printed on every row, including the rows where it agrees
 * with the current state. BST-11 AC-3 requires the default named, and
 * printing it only on overridden rows would make "no default shown" mean two
 * different things — agreeing with the default, or being a rule whose default
 * the output never mentioned.
 *
 * @param state - A resolved state: every registry id present.
 * @returns One line per rule, newline-joined, with no trailing newline.
 */
export function formatBootstrapInventory(state: BootstrapState): string {
  return BOOTSTRAP_RULES.map((rule) => {
    const current = enabledWord(state[rule.id]);
    const fallback = enabledWord(rule.defaultEnabled);
    return `  ${rule.id}: ${current} (default: ${fallback}) — ${rule.description}`;
  }).join("\n");
}

/**
 * The per-host outcome of an apply pass (BST-10 AC-10, BST-11 AC-5, AC-6).
 *
 * Every one of the four `BootstrapRenderStatus` members renders, and each
 * prints its own literal rather than being folded into a neighbour:
 *
 *   - `written` — the contract was written and this host loads it;
 *   - `written-not-wired` — written, but nothing on this host loads it. Never
 *     collapsed into `written`; its `reason` carries the
 *     `scripts/install-skills.sh --apply` remedy (BST-10 AC-10a), and
 *     `bootstrapReportSucceeded` treats it as a non-zero exit;
 *   - `skipped` — a byte-identical re-apply whose wiring is present, with the
 *     reason saying so;
 *   - `failed` — with the reason that host failed for.
 *
 * `skipped` and `failed` print their `reason` because BST-10 AC-10 requires
 * each host's outcome reported *with its reason*; a bare `skipped` would not
 * distinguish "already up to date" from any other no-op.
 *
 * An empty `rows` is the BST-11 AC-6 case and says "no host installed"
 * explicitly. It is not an error — `bootstrapReportSucceeded` returns `true`
 * for it — so the difference between "nothing to do" and "nothing happened"
 * has to be carried by the text.
 *
 * @param report - The report an apply pass returned.
 * @returns The full report body, newline-joined, with no trailing newline.
 */
export function formatBootstrapReport(report: BootstrapReport): string {
  const dryRunSuffix = report.dryRun ? " (dry run — no files changed)" : "";
  const lines: string[] = [];

  if (report.rows.length === 0) {
    lines.push(`bootstrap: no host installed${dryRunSuffix}`);
  } else {
    lines.push(`bootstrap: ${report.rows.length} host(s)${dryRunSuffix}`);
    for (const row of report.rows) {
      const detail = row.reason ? `: ${row.reason}` : "";
      lines.push(`  ${row.host}: ${row.status}${detail}`);
    }
  }

  // BST-10 AC-12: an unregistered — or non-boolean — persisted entry is
  // reported once and is never fatal. The report is the only place the engine
  // puts these, so dropping them here would make "reported" untrue.
  if (report.ignoredStateKeys.length > 0) {
    lines.push(
      "",
      `Ignored persisted rule state: ${report.ignoredStateKeys.join(", ")} — not a known rule id with a boolean value.`,
    );
  }

  if (report.restartRequired) {
    lines.push("", "A host session restart is required for the change to take effect.");
  }

  return lines.join("\n");
}
