/**
 * In-process ring buffer for structured log entries (LOG-01).
 *
 * Design `.specs/features/admin-portal-ops-suite/design.md` § 3a. Zero config
 * imports — capacity is pushed in by `Logger` via `setCapacity`, so this
 * module has no import cycle with `config/index.ts` and no import-time
 * filesystem side effect. It is also never wired to any consumer yet (T9):
 * `Logger` starts pushing into it in a later phase (T11).
 *
 * Re-entrancy (pre-mortem-adjacent risk, LOG-12): a subscriber that itself
 * logs would otherwise recurse into `push` while the outer `push` is still
 * notifying subscribers. The `dispatching` flag converts that into a bounded,
 * non-recursive drain: a nested `push` during dispatch is queued rather than
 * processed synchronously, and the queue is drained by iteration (not
 * recursion) once the in-flight dispatch finishes. A subscriber that keeps
 * pushing forever on every notification is a caller bug this module cannot
 * prevent; a subscriber that pushes a bounded number of times terminates.
 */

/** Default ring-buffer capacity, mirroring `logging.bufferSize`'s literal
 *  default in `config/index.ts` — this module cannot import that config
 *  (zero config imports), so the default is duplicated here intentionally. */
const DEFAULT_CAPACITY = 2000;

export interface LogEntry {
  /** Monotonic within a process; the SSE cursor and the stable sort key. */
  seq: number;
  /** ISO-8601 UTC. */
  ts: string;
  level: "debug" | "info" | "warn" | "error" | "raw";
  message: string;
  meta?: Record<string, unknown>;
}

/**
 * `snapshot`'s filter options: `from`/`to` are inclusive bounds on `seq`,
 * `level` is an exact match, `q` a case-insensitive substring match on
 * `message`.
 */
export interface LogBuffer {
  push(entry: Omit<LogEntry, "seq">): void;
  /** Newest-first snapshot, optionally filtered. Never mutates. */
  snapshot(opts?: { from?: number; to?: number; level?: string; q?: string }): LogEntry[];
  subscribe(fn: (entry: LogEntry) => void): () => void;
  setCapacity(n: number): void;
  size(): number;
  _resetForTesting(): void;
}

class LogBufferImpl implements LogBuffer {
  private capacity = DEFAULT_CAPACITY;
  private entries: LogEntry[] = [];
  private subscribers = new Set<(entry: LogEntry) => void>();
  private nextSeq = 0;
  private dispatching = false;
  private pending: Array<Omit<LogEntry, "seq">> = [];

  push(entry: Omit<LogEntry, "seq">): void {
    if (this.dispatching) {
      // Nested push while a dispatch is already in flight — queue it rather
      // than recursing. Drained by the outer call's iteration below.
      this.pending.push(entry);
      return;
    }
    this.dispatching = true;
    try {
      this.pushOne(entry);
      // Iterative, not recursive: a queued nested push may itself queue
      // another (handled the same way above), so this loop keeps draining
      // until no more are pending rather than growing the call stack.
      while (this.pending.length > 0) {
        const next = this.pending.shift()!;
        this.pushOne(next);
      }
    } finally {
      this.dispatching = false;
    }
  }

  private pushOne(entry: Omit<LogEntry, "seq">): void {
    const full: LogEntry = { ...entry, seq: this.nextSeq++ };
    this.entries.push(full);
    while (this.entries.length > this.capacity) {
      this.entries.shift();
    }
    for (const fn of this.subscribers) {
      try {
        fn(full);
      } catch {
        // Swallow deliberately — this catch must NEVER log (LOG-12): logging
        // a subscriber failure here would re-enter this same buffer.
      }
    }
  }

  snapshot(opts?: { from?: number; to?: number; level?: string; q?: string }): LogEntry[] {
    const from = opts?.from;
    const to = opts?.to;
    const level = opts?.level;
    const q = opts?.q?.toLowerCase();
    const result: LogEntry[] = [];
    // Newest first: walk the backing array (oldest-first) from the end.
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      if (from !== undefined && e.seq < from) continue;
      if (to !== undefined && e.seq > to) continue;
      if (level !== undefined && e.level !== level) continue;
      if (q !== undefined && !e.message.toLowerCase().includes(q)) continue;
      result.push(e);
    }
    return result;
  }

  subscribe(fn: (entry: LogEntry) => void): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  setCapacity(n: number): void {
    this.capacity = n > 0 ? n : 0;
    while (this.entries.length > this.capacity) {
      this.entries.shift();
    }
  }

  size(): number {
    return this.entries.length;
  }

  _resetForTesting(): void {
    this.entries = [];
    this.subscribers.clear();
    this.nextSeq = 0;
    this.dispatching = false;
    this.pending = [];
    this.capacity = DEFAULT_CAPACITY;
  }
}

export const logBuffer: LogBuffer = new LogBufferImpl();
