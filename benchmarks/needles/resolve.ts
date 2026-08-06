/**
 * Content-anchored needle resolution (SEN-04).
 *
 * ## Why this exists
 *
 * A needle used to name its target as `filePath` + `lineStart`/`lineEnd`. Both
 * halves of the hit predicate in `scorer.ts` are pinned to that physical layout,
 * so any commit that moves code between files — or more than `lineTolerance`
 * lines within one file — silently converts a needle into a permanent zero.
 * `scorer.ts` averages that zero over the full needle count, which makes it
 * indistinguishable from a genuine retrieval regression.
 *
 * That is not hypothetical. `smart-chunker.ts` was split into
 * `services/search/chunker/` at `56c84d1` (945 lines -> 81); the fixture was
 * authored at `af3dab6`, the commit before. N07/N08/N09 have targeted lines
 * 198-206, 642-674 and 737-744 of an 81-line file ever since, and the gate has
 * been quietly reporting MRR 0.569 against a 0.65 floor.
 *
 * ## Three failure paths, not one
 *
 * The requirement originally named only the first of these. The second is the
 * one actually firing, and it is the quietest:
 *
 *   1. target file absent           -> `run.ts` printed `[warn]` and continued
 *   2. file present, span past EOF  -> no signal at all; needle scores zero
 *   3. file present, span in range, content moved away -> no signal
 *
 * All three are hard failures here. Resolution never returns a span it cannot
 * stand behind, and the harness never proceeds to scoring on a stale fixture.
 *
 * ## Why anchor + offsets, and not two anchors
 *
 * The design first written for this called for `{anchor, endAnchor}` — one
 * substring locating `lineStart`, another locating `lineEnd`. Measuring the
 * fixture's actual boundaries killed it. Of the 11 needles whose targets are
 * still valid, only three (N01, N02, N04) have both boundaries on a line that is
 * unique repo-wide. The rest start on a comment (N05, N12, N14), on a blank line
 * (N13), or on `    }` — which occurs 11130 times in tracked TypeScript. N03
 * *ends* on a blank line.
 *
 * So the anchor cannot be the boundary. It is instead a unique code substring
 * *inside* the span, plus signed line deltas to each edge. That reproduces every
 * existing span byte-exactly, which is what proves the change is
 * representation-only, and it keeps every anchor on a code line — necessary
 * because the Wave 6 split stripped comments while moving code, so a
 * comment-anchored needle would not have survived the very transformation this
 * is built to survive.
 *
 * The tradeoff is explicit: offsets survive a verbatim move to another file, a
 * file rename, and a within-file move of any distance — the three
 * transformations the requirement names — because all three preserve the span's
 * internal line structure. They do not survive edits *inside* the span. That is
 * out of scope by the same requirement, which excludes reformatting because the
 * repo-wide reformat is its own PR.
 *
 * Anchors match as **substrings**, never as whole lines: `netBraceDelta` gained
 * an `export ` prefix during the split, which a whole-line match would have
 * missed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

/** Directories never scanned: build output, deps, generated code, run artifacts. */
const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  "generated",
  "reports",
  ".turbo",
  ".next",
  // Harness-session artifacts. `.claude/worktrees/` holds full sibling copies
  // of the repo, so scanning it makes every anchor resolve to N locations and
  // fails the gate with NEEDLE_ANCHOR_AMBIGUOUS on any machine with an active
  // agent worktree — a false positive the docblock's "run artifacts" already
  // means to exclude.
  ".claude",
]);

/**
 * Only TypeScript sources are scanned. Every needle targets one, and a narrower
 * scan cannot manufacture ambiguity from a build artifact or a vendored copy.
 */
const SCANNED_EXTENSIONS = [".ts", ".tsx"];

export interface NeedleAnchor {
  /** Unique code substring inside the span. Matched as a substring, not a line. */
  anchor: string;
  /** Signed line delta from the anchor's line to `lineStart`. */
  startOffset: number;
  /** Signed line delta from the anchor's line to `lineEnd`. */
  endOffset: number;
}

/** A legacy positional target. Only permitted for grandfathered needles. */
export interface NeedlePositional {
  filePath: string;
  lineStart: number;
  lineEnd: number;
}

export type NeedleExpected = Partial<NeedleAnchor> & Partial<NeedlePositional>;

export interface ResolvedSpan {
  filePath: string;
  lineStart: number;
  lineEnd: number;
}

/** A retrieved chunk, as every consumer of this fixture models one. */
export interface ScoredHit {
  filePath: string;
  lineStart: number;
  lineEnd: number;
}

/**
 * The hit predicate — the single copy.
 *
 * It lived in three places: `scorer.ts`, `run.ts`, and
 * `packages/core/src/__tests__/e2e/14.needles.test.ts`, the last two both
 * carrying a comment saying they replicate the first. Repairing two of the three
 * would have left the third positionally pinned against the same fixture, so a
 * later refactor could break it invisibly.
 */
export function intersects(a: [number, number], b: [number, number], tol: number): boolean {
  const aStart = a[0] - tol;
  const aEnd = a[1] + tol;
  return !(aEnd < b[0] || aStart > b[1]);
}

/** First hit whose file matches and whose line range intersects, within `tol`. */
export function findRank(
  expected: ResolvedSpan,
  hits: ScoredHit[],
  tol: number,
): { rank: number | null; hit: ScoredHit | null } {
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]!;
    if (
      hit.filePath === expected.filePath &&
      intersects([hit.lineStart, hit.lineEnd], [expected.lineStart, expected.lineEnd], tol)
    ) {
      return { rank: i + 1, hit };
    }
  }
  return { rank: null, hit: null };
}

export interface AnchorMatch {
  filePath: string;
  line: number;
}

export class NeedleResolutionError extends Error {
  constructor(
    readonly code:
      | "NEEDLE_ANCHOR_MISSING"
      | "NEEDLE_ANCHOR_UNRESOLVED"
      | "NEEDLE_ANCHOR_AMBIGUOUS"
      | "NEEDLE_SPAN_OUT_OF_RANGE"
      | "NEEDLE_STALE_ENTRY_OBSOLETE"
      | "NEEDLE_FILE_MISSING",
    message: string,
  ) {
    super(message);
    this.name = "NeedleResolutionError";
  }
}

/** Every scanned source file, repo-relative and posix-separated, sorted. */
export function collectSourceFiles(repoRoot: string): string[] {
  const found: string[] = [];
  const walk = (absoluteDir: string): void => {
    let entries;
    try {
      entries = readdirSync(absoluteDir, { withFileTypes: true });
    } catch {
      return; // unreadable directory is not a fixture error
    }
    for (const entry of entries) {
      const absolute = join(absoluteDir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;
        walk(absolute);
      } else if (SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
        found.push(relative(repoRoot, absolute).split(sep).join("/"));
      }
    }
  };
  walk(repoRoot);
  return found.sort();
}

/** 1-based line number of `index` within `content`. */
function lineOfIndex(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

/** Every occurrence of `anchor` across `files`, as (filePath, line) pairs. */
export function findAnchorMatches(
  anchor: string,
  repoRoot: string,
  files: string[],
): AnchorMatch[] {
  const matches: AnchorMatch[] = [];
  for (const relativePath of files) {
    let content: string;
    try {
      content = readFileSync(resolve(repoRoot, relativePath), "utf8");
    } catch {
      continue;
    }
    let from = 0;
    for (;;) {
      const index = content.indexOf(anchor, from);
      if (index === -1) break;
      matches.push({ filePath: relativePath, line: lineOfIndex(content, index) });
      from = index + anchor.length;
    }
  }
  return matches;
}

function countLines(repoRoot: string, relativePath: string): number {
  const content = readFileSync(resolve(repoRoot, relativePath), "utf8");
  // A trailing newline does not open a further line.
  const newlines = content.split("\n").length;
  return content.endsWith("\n") ? newlines - 1 : newlines;
}

/**
 * Resolve one anchored needle to a concrete span.
 *
 * Throws rather than degrading. Zero matches, two-or-more matches, and a span
 * that falls outside the resolved file are each a hard failure naming the needle
 * id and the anchor — because every one of them previously produced a plausible
 * wrong number instead of an error.
 */
export function resolveAnchoredNeedle(
  needleId: string,
  expected: NeedleAnchor,
  repoRoot: string,
  files: string[],
): ResolvedSpan {
  const matches = findAnchorMatches(expected.anchor, repoRoot, files);

  if (matches.length === 0) {
    throw new NeedleResolutionError(
      "NEEDLE_ANCHOR_UNRESOLVED",
      `${needleId}: anchor resolved to 0 locations — the fixture is stale.\n` +
        `  anchor: ${JSON.stringify(expected.anchor)}\n` +
        `  Recover the needle's original content from the commit that authored it and re-anchor; ` +
        `do not re-author the anchor against current code.`,
    );
  }

  if (matches.length > 1) {
    const where = matches.map((m) => `    ${m.filePath}:${m.line}`).join("\n");
    throw new NeedleResolutionError(
      "NEEDLE_ANCHOR_AMBIGUOUS",
      `${needleId}: anchor resolved to ${matches.length} locations — it is not unique.\n` +
        `  anchor: ${JSON.stringify(expected.anchor)}\n${where}\n` +
        `  Lengthen the anchor until exactly one location matches repo-wide.`,
    );
  }

  const { filePath, line } = matches[0]!;
  const lineStart = line + expected.startOffset;
  const lineEnd = line + expected.endOffset;
  const fileLines = countLines(repoRoot, filePath);

  if (lineStart < 1 || lineEnd > fileLines || lineEnd < lineStart) {
    throw new NeedleResolutionError(
      "NEEDLE_SPAN_OUT_OF_RANGE",
      `${needleId}: resolved span falls outside its file.\n` +
        `  anchor: ${JSON.stringify(expected.anchor)} at ${filePath}:${line}\n` +
        `  resolved span: ${filePath}:${lineStart}-${lineEnd}\n` +
        `  file length: ${fileLines} lines\n` +
        `  This is the path that produced no signal at all before: a present file ` +
        `with a span behind which no chunk exists.`,
    );
  }

  return { filePath, lineStart, lineEnd };
}

/**
 * Legacy positional resolution, for grandfathered needles only.
 *
 * Deliberately weaker: it verifies the file exists, and nothing else. These
 * needles are known-stale and are being carried for exactly one commit so that
 * the anchoring change can be proven rank-for-rank equivalent before the fixture
 * repair moves the score. Applying the out-of-range check here would abort the
 * run before scoring and make that equivalence unmeasurable.
 */
function resolvePositionalNeedle(
  needleId: string,
  expected: NeedlePositional,
  repoRoot: string,
): ResolvedSpan {
  const absolute = resolve(repoRoot, expected.filePath);
  let isFile = false;
  try {
    isFile = statSync(absolute).isFile();
  } catch {
    isFile = false;
  }
  if (!isFile) {
    throw new NeedleResolutionError(
      "NEEDLE_FILE_MISSING",
      `${needleId}: target file does not exist: ${expected.filePath}\n` +
        `  This needle is grandfathered as positional and cannot be resolved by content.`,
    );
  }
  return {
    filePath: expected.filePath,
    lineStart: expected.lineStart,
    lineEnd: expected.lineEnd,
  };
}

export interface ResolveOptions {
  /**
   * Needle ids permitted to carry a legacy positional target instead of an
   * anchor. The list must shrink to empty: an id listed here that *does* carry
   * an anchor is itself a hard failure, so the entry cannot outlive its reason.
   */
  staleNeedles?: string[];
}

export interface ResolvedNeedle<T> {
  needle: T;
  resolved: ResolvedSpan;
  /** True when the span came from a grandfathered positional target. */
  positional: boolean;
}

/**
 * Resolve every needle in a dataset, or throw on the first failure.
 *
 * A needle with no anchor is a hard failure unless its id is grandfathered.
 * That is what stops a positional needle being added back later: the allowlist
 * is explicit, enumerated, and checked in both directions.
 */
export function resolveNeedles<T extends { id: string; expected: NeedleExpected }>(
  needles: T[],
  repoRoot: string,
  options: ResolveOptions = {},
): Array<ResolvedNeedle<T>> {
  const stale = new Set(options.staleNeedles ?? []);
  const files = collectSourceFiles(repoRoot);
  const resolvedNeedles: Array<ResolvedNeedle<T>> = [];

  for (const needle of needles) {
    const expected = needle.expected;
    const hasAnchor = typeof expected.anchor === "string" && expected.anchor.length > 0;

    if (hasAnchor && stale.has(needle.id)) {
      throw new NeedleResolutionError(
        "NEEDLE_STALE_ENTRY_OBSOLETE",
        `${needle.id}: listed in scoring.staleNeedles but now carries an anchor.\n` +
          `  Remove it from that list — a grandfather entry that outlives its reason ` +
          `silently exempts a needle from the checks it no longer needs exemption from.`,
      );
    }

    if (hasAnchor) {
      resolvedNeedles.push({
        needle,
        resolved: resolveAnchoredNeedle(
          needle.id,
          expected as NeedleAnchor,
          repoRoot,
          files,
        ),
        positional: false,
      });
      continue;
    }

    if (!stale.has(needle.id)) {
      throw new NeedleResolutionError(
        "NEEDLE_ANCHOR_MISSING",
        `${needle.id}: no anchor, and it is not grandfathered in scoring.staleNeedles.\n` +
          `  Every needle is identified by content. Add an anchor plus startOffset/endOffset.`,
      );
    }

    if (
      typeof expected.filePath !== "string" ||
      typeof expected.lineStart !== "number" ||
      typeof expected.lineEnd !== "number"
    ) {
      throw new NeedleResolutionError(
        "NEEDLE_ANCHOR_MISSING",
        `${needle.id}: grandfathered as positional but has no usable filePath/lineStart/lineEnd.`,
      );
    }

    resolvedNeedles.push({
      needle,
      resolved: resolvePositionalNeedle(
        needle.id,
        expected as NeedlePositional,
        repoRoot,
      ),
      positional: true,
    });
  }

  return resolvedNeedles;
}
