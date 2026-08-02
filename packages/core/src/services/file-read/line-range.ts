/**
 * @massa-ai/core - Line range selection
 *
 * Module 6 of the `tools/read_file.ts` extraction (PR-D, T11). Owns everything
 * that turns a request into the slice of a file the caller actually receives:
 * `calculateRange` (request → range), `adjustRange` (range → range clamped to
 * the file), `extractLines` (range → line-numbered text), the `ReadRange` shape
 * they pass around, and the N9 output cap — the `MASSA_AI_READ_FILE_MAX_LINES`
 * ceiling together with the clipping block that used to sit inside `handle()`.
 *
 * FREE FUNCTIONS, NOT A CLASS, and that is a decision rather than a default.
 * Modules 2-5 are classes because each owns per-tool state — a Map, a
 * subscription, an injected collaborator. This module owns none: every function
 * here is pure, and the one piece of state is a process-wide constant read from
 * the environment. `services/cache/lru-evict.ts` (module 1) is a bare function
 * for exactly this reason (`design.md` §5.2). A class would also have to be
 * constructed in `ReadFileTool`'s constructor, which is the one surface C64 is
 * about, and would falsely imply per-instance state.
 *
 * IT IMPORTS NOTHING AT ALL, which is `lru-evict.ts`'s property and is asserted
 * by this module's own unit test rather than by any tier rule.
 *
 * `LineRangeRequest` EXISTS BECAUSE `ReadFileParams` IS MODULE 7's. `design.md`
 * §5.1 assigns `interface ReadFileParams` to `read-file.service.ts`, which T12
 * builds and which COMPOSES this module — so importing it here would be a 6 → 7
 * edge against the composition direction, and the interface does not exist yet
 * either way. `calculateRange` reads exactly four fields off its argument, so
 * this module declares those four and `ReadFileParams` satisfies it
 * structurally. The alternative Design's module table hides is that module 6
 * silently depends on module 7's type; naming the subset is what keeps 6
 * standalone. Same shape as the 4 → 5 edge §4.1 decided, which Design handed to
 * Tasks explicitly — this one it handed to nobody.
 *
 * THE CLIPPED PATH RETURNS UNNUMBERED TEXT, AND THAT IS PRESERVED DELIBERATELY.
 * `extractLines` prefixes every line with a padded line number; the cap does NOT
 * slice that string — it re-slices the RAW `lines` array and joins it, so a
 * clipped response loses the prefixes an unclipped one carries. Found by the
 * Plan Challenge gate's red-team lens before this file was written, and
 * confirmed by the evidence audit: no test anywhere asserts content on the
 * clipped path, so composing this as "extract, then slice the extracted text"
 * would have been a silent behavior change inside a behavior-preserving PR.
 * `__tests__/line-range.test.ts` pins both branches' exact format. Whether the
 * asymmetry is intentional is not PR-D's question — it is logged, not fixed
 * (`spec.md` §6, R-07's precedent).
 */

/**
 * N9: per-read line ceiling on user-facing read_file output. Default 500;
 * override via `MASSA_AI_READ_FILE_MAX_LINES`. Invalid/negative/zero
 * values fall back to 500 (treat invalid as unset). When the requested
 * range exceeds the cap, `selectedContent` is sliced and `source_clipped:
 * true` is emitted in the same response. The true total line count is
 * always surfaced as `lineRange.actual.total` so `omitted = total - shown`
 * is derivable. Internal enrichment paths (SymbolGraphService.readSnippet
 * /readContext used by go_to_definition) are NOT capped — see
 * symbol-graph.service.ts for the exclusion comment.
 *
 * STILL EVALUATED ONCE AT MODULE LOAD, which is what keeps the move
 * behavior-preserving. This module is a dependency of `tools/read_file.ts`, so
 * it now evaluates strictly EARLIER in the graph — but both happen on the first
 * import of `read_file.ts`, and a module-level const was never re-readable at
 * call time in either arrangement. Measured: no test can reach this branch.
 * `apps/tools-api/src/routes/workspace.test.ts:422` does set this variable, but
 * it drives `workspace.ts`'s own PER-REQUEST copy of the same IIFE for
 * `symbol_snippet` (a third, separate read of the same name), never this one.
 */
const MASSA_AI_READ_FILE_MAX_LINES = (() => {
  const v = Number(process.env.MASSA_AI_READ_FILE_MAX_LINES);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 500;
})();

/** An inclusive, 1-indexed line range. `end` may be `Infinity` before adjustment. */
export interface ReadRange {
  start: number;
  end: number;
}

/**
 * The four fields `calculateRange` reads. `ReadFileParams` (module 7, T12)
 * satisfies this structurally; declaring the subset is what stops module 6
 * depending on the module that composes it.
 */
export interface LineRangeRequest {
  offset?: number;
  limit?: number;
  lineStart?: number;
  lineEnd?: number;
}

/** The result of selecting lines, after the N9 cap has been applied. */
export interface LineSelection {
  /** The text served to the caller. Line-numbered unless `clipped`. */
  content: string;
  /** `content.split("\n").length` — recomputed after any clipping. */
  lineCount: number;
  /** True when the N9 cap trimmed the selection. Surfaces as `source_clipped`. */
  clipped: boolean;
}

export function calculateRange(params: LineRangeRequest): ReadRange {
  // Priority: lineStart/lineEnd > offset/limit > entire file
  if (params.lineStart !== undefined && params.lineEnd !== undefined) {
    return {
      start: Math.max(1, params.lineStart),
      end: params.lineEnd,
    };
  }

  if (params.offset !== undefined) {
    const offset = Math.max(1, params.offset);
    const limit = params.limit || 1000;
    return {
      start: offset,
      end: offset + limit - 1,
    };
  }

  return {
    start: 1,
    end: Infinity,
  };
}

export function adjustRange(range: ReadRange, totalLines: number): ReadRange {
  const start = Math.max(1, Math.min(range.start, totalLines));
  const end = range.end === Infinity ? totalLines : Math.min(range.end, totalLines);

  return { start, end };
}

export function extractLines(lines: string[], range: ReadRange): string {
  const start = range.start - 1; // Convert to 0-indexed
  const end = range.end;

  const selectedLines = lines.slice(start, end);

  // Add line numbers for context
  return selectedLines
    .map((line, index) => {
      const lineNum = start + index + 1;
      return `${lineNum.toString().padStart(6, " ")}: ${line}`;
    })
    .join("\n");
}

/**
 * Extract the requested lines and apply the N9 cap, returning the clipped flag
 * rather than mutating the caller's locals.
 *
 * The two steps ship as one function because they were never separable at the
 * call site: before this task the cap read and reassigned the very
 * `selectedContent` and `selectedLineCount` that the `extractLines` call one
 * line above it had produced, inside `handle()`. Deliberately unnumbered — a
 * line citation into `read_file.ts` written here would name a revision that no
 * longer exists the moment this commit lands, and T12 moves that whole region
 * again (T8b's de-numbering precedent). Splitting them would mean passing
 * the already-extracted string and its line count back in as parameters, which
 * duplicates the `.split("\n")` at the call site and adds an argument derivable
 * from another. `extractLines` stays exported so its own contract is pinnable
 * independently.
 */
export function selectLines(lines: string[], range: ReadRange): LineSelection {
  let content = extractLines(lines, range);
  let lineCount = content.split("\n").length;

  // N9: cap user-facing read_file output at MASSA_AI_READ_FILE_MAX_LINES
  // (default 500). When the adjusted range exceeds the cap, slice the
  // content and emit `source_clipped: true` in the same response so the
  // caller knows lines were omitted. `lineRange.actual.total` keeps the
  // true total line count so `omitted = total - shown` is derivable.
  //
  // NOTE the slice is over `lines`, the RAW array — not over `content`, which
  // `extractLines` has already numbered. That is the pre-existing shape, moved
  // verbatim: a clipped response is unnumbered where an unclipped one is
  // numbered. See this file's header.
  let clipped = false;
  if (lineCount > MASSA_AI_READ_FILE_MAX_LINES) {
    const cappedLines = lines.slice(
      range.start - 1,
      range.start - 1 + MASSA_AI_READ_FILE_MAX_LINES,
    );
    content = cappedLines.join("\n");
    lineCount = content.split("\n").length;
    clipped = true;
  }

  return { content, lineCount, clipped };
}
