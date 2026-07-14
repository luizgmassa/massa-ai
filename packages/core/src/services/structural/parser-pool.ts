import type { NativeParserInstance } from "./grammar-loaders.js";

export const DEFAULT_STRUCTURAL_PARSER_CAPACITY = 4;
export const MAX_STRUCTURAL_PARSER_CAPACITY = 32;
export const DEFAULT_STRUCTURAL_ACQUIRE_TIMEOUT_MS = 5_000;
export const MAX_STRUCTURAL_ACQUIRE_TIMEOUT_MS = 60_000;

export interface ParserLease {
  readonly key: string;
  parse(source: Buffer): ReturnType<NativeParserInstance["parse"]>;
  release(): void;
}

export interface ParserPoolOptions {
  capacity?: number;
  acquireTimeoutMs?: number;
  createParser: () => NativeParserInstance;
  scheduleTimeout?: (callback: () => void, timeoutMs: number) => unknown;
  cancelTimeout?: (timer: unknown) => void;
}

export class ParserAcquireTimeoutError extends Error {
  readonly code = "PARSER_ACQUIRE_TIMEOUT";

  constructor(readonly key: string, readonly timeoutMs: number) {
    super(`Timed out acquiring structural parser for ${key} after ${timeoutMs}ms`);
    this.name = "ParserAcquireTimeoutError";
  }
}

interface Slot {
  readonly parser: NativeParserInstance;
  key: string;
  language: unknown;
  busy: boolean;
}

interface Waiter {
  readonly key: string;
  readonly language: unknown;
  readonly resolve: (lease: ParserLease) => void;
  readonly reject: (error: Error) => void;
  timer: unknown;
}

function positiveInteger(value: number, name: string, maximum: number): number {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

/** Globally FIFO, bounded parser ownership with safe idle retargeting. */
export class StructuralParserPool {
  readonly capacity: number;
  readonly acquireTimeoutMs: number;
  readonly #createParser: () => NativeParserInstance;
  readonly #scheduleTimeout: (callback: () => void, timeoutMs: number) => unknown;
  readonly #cancelTimeout: (timer: unknown) => void;
  readonly #slots: Slot[] = [];
  readonly #waiters: Waiter[] = [];

  constructor(options: ParserPoolOptions) {
    this.capacity = positiveInteger(
      options.capacity ?? DEFAULT_STRUCTURAL_PARSER_CAPACITY,
      "parser capacity",
      MAX_STRUCTURAL_PARSER_CAPACITY,
    );
    this.acquireTimeoutMs = positiveInteger(
      options.acquireTimeoutMs ?? DEFAULT_STRUCTURAL_ACQUIRE_TIMEOUT_MS,
      "parser acquisition timeout",
      MAX_STRUCTURAL_ACQUIRE_TIMEOUT_MS,
    );
    this.#createParser = options.createParser;
    this.#scheduleTimeout = options.scheduleTimeout ?? setTimeout;
    this.#cancelTimeout = options.cancelTimeout ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  }

  get size(): number {
    return this.#slots.length;
  }

  get waiting(): number {
    return this.#waiters.length;
  }

  acquire(key: string, language: unknown): Promise<ParserLease> {
    if (!key) throw new Error("parser key must not be empty");

    // Once contention exists, all newcomers join the same global FIFO queue.
    if (this.#waiters.length === 0) {
      try {
        const slot = this.#claimSlot(key, language);
        if (slot) return Promise.resolve(this.#lease(slot));
      } catch (error) {
        return Promise.reject(error);
      }
    }

    return new Promise<ParserLease>((resolve, reject) => {
      const waiter: Waiter = {
        key,
        language,
        resolve,
        reject,
        timer: undefined,
      };
      waiter.timer = this.#scheduleTimeout(() => {
        const index = this.#waiters.indexOf(waiter);
        if (index < 0) return;
        this.#waiters.splice(index, 1);
        reject(new ParserAcquireTimeoutError(key, this.acquireTimeoutMs));
        this.#dispatch();
      }, this.acquireTimeoutMs);
      this.#waiters.push(waiter);
      this.#dispatch();
    });
  }

  #claimSlot(key: string, language: unknown): Slot | undefined {
    let slot = this.#slots.find((candidate) => !candidate.busy && candidate.key === key);
    let requiresLanguage = false;
    if (!slot && this.#slots.length < this.capacity) {
      slot = { parser: this.#createParser(), key, language, busy: false };
      this.#slots.push(slot);
      requiresLanguage = true;
    }
    // Retarget an idle wrong-key slot when at capacity. Without this branch,
    // skewed traffic can wait forever even though a parser is idle.
    slot ??= this.#slots.find((candidate) => !candidate.busy);
    if (!slot) return undefined;
    if (slot.key !== key || slot.language !== language) {
      requiresLanguage = true;
    }
    try {
      if (requiresLanguage) slot.parser.setLanguage(language);
    } catch (error) {
      // setLanguage may partially mutate a native parser before throwing.
      // Never return that slot to the idle pool, whether new or retargeted.
      this.#slots.splice(this.#slots.indexOf(slot), 1);
      throw error;
    }
    slot.key = key;
    slot.language = language;
    slot.busy = true;
    return slot;
  }

  #lease(slot: Slot): ParserLease {
    let released = false;
    return Object.freeze({
      key: slot.key,
      parse(source: Buffer) {
        if (released) throw new Error("Parser lease has been released");
        return slot.parser.parse(source.toString("utf8"));
      },
      release: () => {
        if (released) return;
        released = true;
        slot.busy = false;
        this.#dispatch();
      },
    });
  }

  #dispatch(): void {
    while (this.#waiters.length > 0) {
      const waiter = this.#waiters[0]!;
      let slot: Slot | undefined;
      try {
        slot = this.#claimSlot(waiter.key, waiter.language);
      } catch (error) {
        this.#waiters.shift();
        this.#cancelTimeout(waiter.timer);
        waiter.reject(error instanceof Error ? error : new Error(String(error)));
        continue;
      }
      if (!slot) return;
      this.#waiters.shift();
      this.#cancelTimeout(waiter.timer);
      waiter.resolve(this.#lease(slot));
    }
  }
}
