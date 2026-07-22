/**
 * Serialize interfaces — Wave 5 FR-06 / N5 / AD-W5-020.
 *
 * Explicit TypeScript contracts for the grouped-format helper exported by
 * `serialize.ts`. B3 (and any downstream consumer) imports these verbatim —
 * no re-implementation. Interface drift fails the batch per FR-26 / AC-28.
 *
 * The grouped model is the single shape both `format:"tree"` (text-indented)
 * and `format:"json"` (when `grouped:true` is selected) emit. One shared
 * helper (`groupRowsByPrefix`) produces it; both encoders route through it
 * (AD-W5-011). A mutation test in `serialize.test.ts` asserts both formats
 * change together when the helper is mutated.
 */

/**
 * Options for {@link GroupedResult} grouping via `groupRowsByPrefix`.
 *
 * Field-name style: the caller passes the NAME of the field on each row to
 * use for grouping, not the value. This keeps the helper row-shape-agnostic
 * (works for impacted symbols, search results, references, etc.) without
 * per-tool adapters.
 *
 *   groupRowsByPrefix(impacted, { file: "file" })
 *     → derives a 2-segment prefix from each row's `file` field
 *       (`src/services/foo.ts` → `src/services`) and groups by that prefix.
 *
 *   groupRowsByPrefix(results, { qnPrefix: "qnPrefix", file: "filePath" })
 *     → groups by the row's explicit `qnPrefix` field; `filePath` is kept as
 *       a representative file per group when all rows in the group share one.
 */
export interface GroupRowsByPrefixOptions {
  /**
   * Field name on each row whose value is the explicit group key (the 2-
   * segment prefix). When omitted, the prefix is derived from `file` via
   * `twoSegmentPrefix`. When the row has no such field, `(other)` is used.
   */
  qnPrefix?: string;
  /**
   * Field name on each row whose value is the file path. Used to derive the
   * group key when `qnPrefix` is not present, and to populate the
   * representative `file` on each group when all rows in the group share one.
   */
  file?: string;
  /**
   * Cap rows per group. Default 50. Rows past the cap within a group are
   * dropped and counted in `rows_omitted` (Wave 4 N4 parity).
   */
  maxRowsPerGroup?: number;
  /**
   * Cap groups. Default 20. Groups past the cap (sorted by row count desc)
   * fold into a single `(other)` overflow group; their count is surfaced in
   * `groups_omitted`.
   */
  maxGroups?: number;
}

/**
 * One row inside a grouped result. Opaque — the helper does not interpret row
 * contents beyond the `qnPrefix` / `file` fields used for grouping.
 */
export type GroupedRow = Record<string, unknown>;

/**
 * One group in a grouped result. `rows` is the (possibly truncated) list of
 * rows assigned to this group; `rows_shown` / `rows_omitted` mirror the Wave 4
 * N4 `*_shown` / `*_omitted` pair at the group level.
 */
export interface GroupedGroup {
  /** 2-segment path prefix that keys this group, or `(other)` for overflow. */
  qnPrefix: string;
  /**
   * Representative file path for the group when all rows share one (only set
   * when `opts.file` was provided). Undefined when the group spans multiple
   * files or no file field was used.
   */
  file?: string;
  /** Rows emitted for this group (capped at `maxRowsPerGroup`). */
  rows: GroupedRow[];
  /** Rows emitted for this group (== rows.length). */
  rows_shown: number;
  /** Rows dropped from this group by the per-group cap. */
  rows_omitted: number;
}

/**
 * Result of `groupRowsByPrefix`. The single shape both `format:"tree"` and
 * `format:"json"` (with `grouped:true`) emit. Totals mirror the Wave 4 N4
 * `*_total` / `*_shown` / `*_omitted` pattern at both the rows and groups
 * level so callers can surface exact pre-clamp counts.
 */
export interface GroupedResult {
  /** Pre-clamp total rows received by the helper. */
  rows_total: number;
  /** Rows emitted across all groups (sum of per-group rows_shown). */
  rows_shown: number;
  /** Rows dropped by per-group caps (sum of per-group rows_omitted). */
  rows_omitted: number;
  /** Pre-clamp count of distinct groups. */
  groups_total: number;
  /** Groups emitted (includes the `(other)` overflow group when present). */
  groups_shown: number;
  /** Distinct groups folded into `(other)` by the groups cap. */
  groups_omitted: number;
  /** Emitted groups, sorted by row count desc then qnPrefix asc. */
  groups: GroupedGroup[];
}