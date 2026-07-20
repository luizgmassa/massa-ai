/**
 * session-pin-store — bounded, TTL-expiring in-memory map of
 * `sessionId → projectId` for sticky hook attribution (HAR-04).
 *
 * Pins are an optimization, not a correctness dependency: process restart or
 * eviction degrades attribution to containment/verbatim, both contract-legal.
 * Bounds: `maxSize` entries (oldest-access evicted), `ttlMs` lazy expiry.
 */

export interface SessionPinStoreOptions {
  /** Max pinned sessions. Default 1000. */
  readonly maxSize?: number;
  /** Pin TTL in ms. Default 24h. */
  readonly ttlMs?: number;
  /** Injectable clock for tests. */
  readonly now?: () => number;
}

const DEFAULT_MAX_SIZE = 1_000;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1_000;

interface PinEntry {
  projectId: string;
  expiresAt: number;
}

export class SessionPinStore {
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly pins = new Map<string, PinEntry>();

  constructor(options: SessionPinStoreOptions = {}) {
    this.maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  /** Return the pinned id, refreshing recency, or undefined when absent/expired. */
  get(sessionId: string): string | undefined {
    const entry = this.pins.get(sessionId);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.pins.delete(sessionId);
      return undefined;
    }
    // Refresh recency (Map preserves insertion order on re-set).
    this.pins.delete(sessionId);
    this.pins.set(sessionId, entry);
    return entry.projectId;
  }

  /** Pin (or re-pin) a session to a project id, evicting oldest-access entries at the bound. */
  set(sessionId: string, projectId: string): void {
    if (this.maxSize < 1) return;
    this.pins.delete(sessionId);
    while (this.pins.size >= this.maxSize) {
      const oldest = this.pins.keys().next();
      if (oldest.done) break;
      this.pins.delete(oldest.value);
    }
    this.pins.set(sessionId, { projectId, expiresAt: this.now() + this.ttlMs });
  }

  /** Test/maintenance escape hatch. */
  clear(): void {
    this.pins.clear();
  }

  /** @internal — exposed for tests. */
  get size(): number {
    return this.pins.size;
  }
}
