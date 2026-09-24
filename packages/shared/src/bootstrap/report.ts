/**
 * Per-host result shapes for a bootstrap render pass (T7 / TASK-007,
 * BST-10, BST-11).
 *
 * Kept separate from the apply engine (T8, `engine.ts`) for the same reason
 * `profile-switch/report.ts:1-5` is separate from its own engine: any front
 * that has to render or exit on a report — both CLIs (T17/T18) and the
 * shared formatters (T16) — can depend on these shapes without pulling in
 * the fs and install-state machinery the engine needs.
 *
 * This is a sibling of `profile-switch/report.ts:29-52`, not a reuse of it.
 * `HostSwitchResult`'s union carries an `unsupported` member expressing
 * variant availability, which has no meaning for a contract file that is
 * either written, written without wiring, skipped, or failed; and
 * `SwitchReport` requires a `profile` field this report has no analogue for.
 * What is borrowed is the `{host, status, reason?}` row convention and the
 * "derive `restartRequired`, never let a caller set it" discipline
 * (`profile-switch/report.ts:41-44`).
 *
 * Test: cd packages/shared && bun test src/bootstrap/__tests__/report.test.ts
 */

import type { Host } from "../profile-switch/hosts";

/**
 * The four render outcomes, as a runtime list so the union's membership is
 * assertable as a set rather than only by a compile-time error. The union is
 * derived from this array, so the two can never disagree — the same
 * `as const`-array-to-union shape `HOSTS` (`profile-switch/hosts.ts:16-17`)
 * and `BOOTSTRAP_RULE_IDS` (`rules.ts:34-46`) use.
 */
export const BOOTSTRAP_RENDER_STATUSES = [
  "written",
  "written-not-wired",
  "skipped",
  "failed",
] as const;

export type BootstrapRenderStatus = (typeof BOOTSTRAP_RENDER_STATUSES)[number];

/**
 * One host's outcome from a render pass.
 *
 * `written-not-wired`: the contract file was written, but this host has no
 * artifact that loads it — no `@MASSA-AI.md` import, no pointer block, no
 * `instructions` entry. Never collapse it into `written`: a host recorded by
 * a plugin install has skills and an `install-state.json` entry and has never
 * had wiring, so `written` there would report success for a host that cannot
 * load the file at all (BST-10 AC-10a). Its `reason` is where the engine
 * names `scripts/install-skills.sh --apply` as the remedy.
 */
export interface BootstrapRenderResult {
  readonly host: Host;
  readonly status: BootstrapRenderStatus;
  readonly reason?: string;
}

/**
 * The whole outcome of one apply pass, per design.md "Data Models".
 *
 * `ignoredStateKeys` carries persisted `bootstrap.rules` entries naming ids
 * absent from the registry: reported once, never fatal (BST-10 AC-12), which
 * is why it is a field here and not a `failed` row — see
 * {@link bootstrapReportSucceeded}.
 */
export interface BootstrapReport {
  readonly rows: readonly BootstrapRenderResult[];
  readonly restartRequired: boolean;
  readonly dryRun: boolean;
  readonly ignoredStateKeys: readonly string[];
}

/**
 * The statuses that count as a clean outcome for the exit code.
 *
 * `written-not-wired` is deliberately absent. It is the one status whose file
 * write succeeded but whose user-visible effect is nil, and the only signal a
 * CLI caller has that the host needs `scripts/install-skills.sh --apply`
 * before any toggle reaches it; treating it as clean would exit 0 on exactly
 * the state BST-10 AC-10a exists to surface.
 */
const CLEAN_STATUSES: ReadonlySet<BootstrapRenderStatus> = new Set(["written", "skipped"]);

/**
 * True when every host row is a clean outcome — `written` or `skipped`, with
 * no `written-not-wired` and no `failed` row. Callers (both CLIs, T17/T18)
 * use this to decide a non-zero exit for a partial multi-host failure, the
 * role `reportSucceeded` plays for the profile switch
 * (`profile-switch/report.ts:46-52`).
 *
 * An empty `rows` succeeds: no host recorded is exit 0 with a "no host
 * installed" message, not a failure (BST-11 AC-6). `ignoredStateKeys` is
 * deliberately not consulted — an unregistered persisted id is reported, not
 * fatal (BST-10 AC-12).
 *
 * @param report - The report to judge.
 * @returns `true` when the process should exit 0.
 */
export function bootstrapReportSucceeded(report: BootstrapReport): boolean {
  return report.rows.every((row) => CLEAN_STATUSES.has(row.status));
}

/**
 * Assembles a {@link BootstrapReport}, deriving `restartRequired` rather than
 * accepting it, so the invariant below cannot be violated by a caller.
 *
 * `restartRequired` is true only for a non-dry-run with at least one
 * `written` row (BST-11 AC-5), mirroring
 * `profile-switch/report.ts:41-44`'s "real run with at least one switched
 * row". A dry run changed no file, so nothing is pending a restart.
 *
 * `written-not-wired` does **not** count toward it. The design does not say,
 * so the decision is taken from what the status means: that host has no
 * artifact loading the contract, so restarting its session picks up nothing —
 * the file only becomes live after `scripts/install-skills.sh --apply`, which
 * itself reports the restart. Counting it would print "restart your sessions
 * for this to take effect" about a host where the restart demonstrably has no
 * effect, which is the same false-success the status exists to prevent. The
 * consequence is narrow and intended: a run whose only non-skipped rows are
 * `written-not-wired` reports no restart required and a non-zero exit, with
 * the remedy on the row.
 *
 * @param input - `rows` in registry host order, the run's `dryRun` flag, and
 *   any persisted rule ids absent from the registry.
 * @returns The report, with `restartRequired` derived from `rows` + `dryRun`.
 */
export function buildBootstrapReport(input: {
  readonly rows: readonly BootstrapRenderResult[];
  readonly dryRun: boolean;
  readonly ignoredStateKeys: readonly string[];
}): BootstrapReport {
  const restartRequired =
    !input.dryRun && input.rows.some((row) => row.status === "written");
  return {
    rows: input.rows,
    restartRequired,
    dryRun: input.dryRun,
    ignoredStateKeys: input.ignoredStateKeys,
  };
}
