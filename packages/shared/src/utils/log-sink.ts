/**
 * File sink: append + size-capped rotation (LOG-07, LOG-08).
 *
 * Design `.specs/features/admin-portal-ops-suite/design.md` § 3b. Config-free
 * — no import from `config/index.ts`. Never wired to any consumer yet (T10):
 * `Logger` starts calling `appendLine` in a later phase (T11).
 *
 * Creates its directory (pre-mortem #2): the current sink was opt-in with an
 * operator-supplied path that already existed, so it never needed to create
 * anything — the swallow that made that safe would make a default-on sink
 * silently dead. `appendLine` now creates the parent directory once per
 * resolved path (memoized) before its first write.
 *
 * Never throws: every fs call is wrapped; a broken path degrades to
 * stderr-only exactly as today. A swallowed failure is reported, not hidden —
 * `getLastError()` exposes it so the range route (T12) can answer
 * `source:"buffer"` rather than presenting an empty file read as history.
 */

import fs from "fs";
import path from "path";

export interface LogSinkOptions {
  filePath: string;
  maxFileSizeBytes: number; // logging.maxFileSizeMb * 1024 * 1024
  maxFiles: number; // logging.maxFiles
}

/** Re-`stat` only after this many tracked bytes have accumulated since the
 *  last real stat — a `statSync` per line would dominate logging cost. */
const STAT_DELTA_THRESHOLD_BYTES = 1024 * 1024;

interface PerPathState {
  /** Best-known size of the live file, refreshed periodically via `statSync`. */
  trackedSize: number;
  /** Bytes appended in-process since the last real `statSync`. */
  deltaSinceStat: number;
  /** Whether `trackedSize` has ever been grounded by a real `statSync`. */
  primed: boolean;
}

const ensuredDirs = new Set<string>();
const pathState = new Map<string, PerPathState>();
let lastError: unknown;

function getState(filePath: string): PerPathState {
  let state = pathState.get(filePath);
  if (!state) {
    state = { trackedSize: 0, deltaSinceStat: 0, primed: false };
    pathState.set(filePath, state);
  }
  return state;
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (ensuredDirs.has(dir)) return;
  fs.mkdirSync(dir, { recursive: true });
  ensuredDirs.add(dir);
}

/**
 * Re-stat the live file to ground `trackedSize` in reality — a sibling
 * process may have rotated or appended to the same path. Absence is a valid
 * outcome (fresh or just-rotated file), not an error. Unconditional: the
 * caller (`appendLine`) already decides *when* to call this (delta stale, or
 * about to cross the cap) — this must not re-check that gate itself, or the
 * cap-crossing branch would be silently skipped whenever the delta alone
 * looked fresh.
 */
function restat(filePath: string, state: PerPathState): void {
  try {
    state.trackedSize = fs.statSync(filePath).size;
  } catch {
    state.trackedSize = 0;
  }
  state.deltaSinceStat = 0;
  state.primed = true;
}

/**
 * Rotation: unlink `file.<maxFiles>`, shift `file.<n>` -> `file.<n+1>`
 * newest-last, then rename(file, file.1). Rotation from two processes at once
 * can misfile a few lines — documented, not engineered around (spec
 * assumption).
 */
function rotate(filePath: string, maxFiles: number): void {
  if (maxFiles <= 0) {
    // No rotated files retained — just drop the live file so it starts fresh.
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return;
  }
  const oldest = `${filePath}.${maxFiles}`;
  if (fs.existsSync(oldest)) fs.unlinkSync(oldest);
  for (let n = maxFiles - 1; n >= 1; n--) {
    const src = `${filePath}.${n}`;
    const dest = `${filePath}.${n + 1}`;
    if (fs.existsSync(src)) fs.renameSync(src, dest);
  }
  if (fs.existsSync(filePath)) fs.renameSync(filePath, `${filePath}.1`);
}

/**
 * Append one line to the sink, rotating first when the tracked size has
 * already crossed `maxFileSizeBytes`. Always uses `O_APPEND`
 * (`fs.appendFileSync`), so concurrent process writes of a single line do not
 * truncate each other (LOG-08). Never throws.
 */
export function appendLine(opts: LogSinkOptions, line: string): void {
  const { filePath, maxFileSizeBytes, maxFiles } = opts;
  try {
    ensureDir(filePath);
    const state = getState(filePath);
    const lineBytes = Buffer.byteLength(line + "\n", "utf8");

    // Re-stat when the tracked delta is stale, or when the in-process
    // estimate suggests we are about to cross the cap (confirm before
    // rotating rather than trusting a possibly-stale estimate).
    if (
      !state.primed ||
      state.deltaSinceStat >= STAT_DELTA_THRESHOLD_BYTES ||
      state.trackedSize + state.deltaSinceStat >= maxFileSizeBytes
    ) {
      restat(filePath, state);
    }

    if (maxFileSizeBytes > 0 && state.trackedSize >= maxFileSizeBytes) {
      rotate(filePath, maxFiles);
      state.trackedSize = 0;
      state.deltaSinceStat = 0;
      state.primed = true;
    }

    fs.appendFileSync(filePath, line + "\n");
    state.trackedSize += lineBytes;
    state.deltaSinceStat += lineBytes;
  } catch (err) {
    // Best-effort sink; the caller's stderr write already carried the line.
    lastError = err;
  }
}

/** Newest file first: `[file, file.1, …, file.<maxFiles>]` that exist. */
export function sinkFiles(filePath: string, maxFiles: number): string[] {
  const files: string[] = [];
  try {
    if (fs.existsSync(filePath)) files.push(filePath);
    for (let n = 1; n <= maxFiles; n++) {
      const rotated = `${filePath}.${n}`;
      if (fs.existsSync(rotated)) files.push(rotated);
    }
  } catch (err) {
    lastError = err;
  }
  return files;
}

/** The most recent swallowed failure from `appendLine` or `sinkFiles`, if
 *  any. Reportable rather than hidden (pre-mortem #2) — a caller can answer
 *  `source:"buffer"` instead of presenting an empty file read as history. */
export function getLastError(): unknown {
  return lastError;
}

export function _resetForTesting(): void {
  ensuredDirs.clear();
  pathState.clear();
  lastError = undefined;
}
