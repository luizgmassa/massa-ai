/**
 * Logger Utility
 * 
 * Structured logging with levels and metadata support
 */

import { ILogger } from '../types/interfaces.js';
import { config } from '../config/index.js';
import { appendLine } from './log-sink.js';
import { logBuffer, type LogEntry } from './log-buffer.js';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

/** Uppercase label used in the formatted line — unchanged from the pre-T11 format. */
const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

/** Lowercase tag used by the ring buffer (`LogEntry.level`, LOG-01). */
const LOG_LEVEL_BUFFER_TAGS: Record<LogLevel, LogEntry['level']> = {
  [LogLevel.DEBUG]: 'debug',
  [LogLevel.INFO]: 'info',
  [LogLevel.WARN]: 'warn',
  [LogLevel.ERROR]: 'error',
};

/** Repeat-accounting window (design §4): 15 minutes from first sight. */
const REPEAT_WINDOW_MS = 15 * 60 * 1000;

/** Repeat-accounting cap: cleared (not LRU-evicted) on overflow. */
const MAX_REPEAT_KEYS = 500;

interface RepeatEntry {
  firstSeenAt: number;
  count: number;
}

/** `12m` / `40s` — coarse enough for the 15-minute window it is used in. */
function formatAgo(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  return `${Math.floor(totalSeconds / 60)}m`;
}

/**
 * Picks name/message(+stack)/code/cause from an Error, never spreads it —
 * the AI SDK's `APICallError` carries `requestBodyValues`, which holds the
 * prompt. `cause` is a one-level message: a non-Error cause becomes `String(v)`.
 */
function pickErrorFields(err: Error, includeStack: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = { name: err.name, message: err.message };
  if (includeStack) out.stack = err.stack;
  const code = (err as { code?: unknown }).code;
  if (code !== undefined) out.code = code;
  const cause = (err as { cause?: unknown }).cause;
  if (cause !== undefined) {
    out.cause = cause instanceof Error ? cause.message : String(cause);
  }
  return out;
}

export class Logger implements ILogger {
  private _level?: LogLevel;
  private _enableMetrics?: boolean;
  private _logFilePath?: string;
  private _enableFileSink?: boolean;
  private _maxFileSizeBytes?: number;
  private _maxFiles?: number;
  private _initialized = false;
  private repeats = new Map<string, RepeatEntry>();

  constructor() {
    // Lazy initialization to avoid circular dependency with config
  }

  /**
   * Lazy initialize logger configuration
   */
  private ensureInitialized(): void {
    if (!this._initialized) {
      try {
        const loggingConfig = config.get('logging');
        this._level = this.parseLogLevel(loggingConfig.level);
        this._enableMetrics = loggingConfig.enableMetrics;
        // env > config.json precedence is already resolved by config/index.ts
        // (mirrors `level`'s MASSA_AI_LOG_FILE/MASSA_AI_LOG_LEVEL handling), so
        // this is a plain read. `file` is always concrete since T8 (LOG-02).
        this._logFilePath = loggingConfig.file;
        // LOG-02 AC 2b: the ONLY way to disable the file sink.
        this._enableFileSink = loggingConfig.enableFileSink;
        this._maxFileSizeBytes = loggingConfig.maxFileSizeMb * 1024 * 1024;
        this._maxFiles = loggingConfig.maxFiles;
        // LOG-01: push the resolved ring-buffer capacity into the buffer
        // every time config is (re-)read here.
        logBuffer.setCapacity(loggingConfig.bufferSize);
      } catch {
        // Fallback if config is not available yet — no sink, matching the
        // pre-T11 fallback behavior (stderr-only).
        this._level = LogLevel.INFO;
        this._enableMetrics = false;
        this._logFilePath = undefined;
        this._enableFileSink = false;
        this._maxFileSizeBytes = 32 * 1024 * 1024;
        this._maxFiles = 5;
        logBuffer.setCapacity(2000);
      }
      this._initialized = true;
    }
  }

  private get level(): LogLevel {
    this.ensureInitialized();
    return this._level!;
  }

  private get enableMetrics(): boolean {
    this.ensureInitialized();
    return this._enableMetrics!;
  }

  private get logFilePath(): string | undefined {
    this.ensureInitialized();
    return this._logFilePath;
  }

  private get enableFileSink(): boolean {
    this.ensureInitialized();
    return this._enableFileSink!;
  }

  private get maxFileSizeBytes(): number {
    this.ensureInitialized();
    return this._maxFileSizeBytes!;
  }

  private get maxFiles(): number {
    this.ensureInitialized();
    return this._maxFiles!;
  }

  /**
   * Parse log level from string
   */
  private parseLogLevel(level: string): LogLevel {
    const levels: Record<string, LogLevel> = {
      'debug': LogLevel.DEBUG,
      'info': LogLevel.INFO,
      'warn': LogLevel.WARN,
      'error': LogLevel.ERROR
    };
    return levels[level.toLowerCase()] ?? LogLevel.INFO;
  }

  /**
   * Check if level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  /**
   * Any Error value sitting at the top level of `meta` is replaced by its
   * picked fields (design §5) — returns `meta` unchanged (same reference)
   * when nothing needs replacing, so a first-occurrence line stays
   * byte-identical.
   */
  private serializeMetaErrors(
    meta?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!meta) return meta;
    let out: Record<string, unknown> | undefined;
    for (const [key, value] of Object.entries(meta)) {
      if (value instanceof Error) {
        if (!out) out = { ...meta };
        out[key] = pickErrorFields(value, false);
      }
    }
    return out ?? meta;
  }

  /**
   * Repeat accounting (design §4): only WARN/ERROR are tracked, keyed by
   * level + message (+ meta.label when present). The first occurrence in a
   * 15-minute window is returned unchanged; later ones gain `occurrences`
   * and `firstSeenAgo`. Capped at 500 keys, cleared (not LRU-evicted) on
   * overflow.
   */
  private applyRepeatAccounting(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (level !== LogLevel.WARN && level !== LogLevel.ERROR) return meta;
    const label = typeof meta?.label === 'string' ? meta.label : '';
    const key = `${level}|${message}|${label}`;
    const now = Date.now();
    const existing = this.repeats.get(key);

    if (!existing || now - existing.firstSeenAt > REPEAT_WINDOW_MS) {
      if (this.repeats.size >= MAX_REPEAT_KEYS) this.repeats.clear();
      this.repeats.set(key, { firstSeenAt: now, count: 1 });
      return meta;
    }

    existing.count += 1;
    return {
      ...meta,
      occurrences: existing.count,
      firstSeenAgo: formatAgo(now - existing.firstSeenAt),
    };
  }

  /** Test-only seam: `packages/shared` runs plain `bun test`, so module- or
   * instance-scoped repeat state must be resettable between cases. */
  _resetRepeatsForTesting(): void {
    this.repeats.clear();
  }

  /**
   * Format log message
   */
  private formatMessage(
    level: string,
    message: string,
    meta?: Record<string, unknown>,
    timestamp: string = new Date().toISOString()
  ): string {
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}] ${message}${metaStr}`;
  }

  /**
   * Emit one log record: stderr (always, unchanged format), the file sink
   * (only when `logging.enableFileSink` resolves true and a path is
   * available), and the in-process ring buffer (always — LOG-01/LOG-02).
   *
   * Ordering is load-bearing: stdout must remain pristine for the stdio MCP
   * protocol (pure JSON-RPC), so `console.error` (stderr) goes FIRST and
   * unconditionally, before either of the two additive sinks are touched.
   */
  private emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const serializedMeta = this.serializeMetaErrors(meta);
    const finalMeta = this.applyRepeatAccounting(level, message, serializedMeta);
    const ts = new Date().toISOString();
    const line = this.formatMessage(LOG_LEVEL_LABELS[level], message, finalMeta, ts);
    console.error(line);

    if (this.enableFileSink) {
      const filePath = this.logFilePath;
      if (filePath) {
        // appendLine never throws — a broken/unwritable path degrades to
        // stderr-only exactly as before (pre-mortem #2's `getLastError()`
        // is the reportable trace, not an exception here).
        appendLine(
          { filePath, maxFileSizeBytes: this.maxFileSizeBytes, maxFiles: this.maxFiles },
          line,
        );
      }
    }

    logBuffer.push({
      ts,
      level: LOG_LEVEL_BUFFER_TAGS[level],
      message,
      ...(finalMeta ? { meta: finalMeta } : {}),
    });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.emit(LogLevel.DEBUG, message, meta);
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.emit(LogLevel.INFO, message, meta);
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.emit(LogLevel.WARN, message, meta);
    }
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorMeta = error
        ? { ...meta, error: pickErrorFields(error, true) }
        : meta;
      this.emit(LogLevel.ERROR, message, errorMeta);
    }
  }

  /**
   * Log metric (if enabled)
   */
  metric(name: string, value: number, unit?: string): void {
    if (this.enableMetrics) {
      this.info(`METRIC: ${name}`, { value, unit });
    }
  }

  /**
   * Create child logger with context
   */
  child(context: Record<string, unknown>): Logger {
    const childLogger = new Logger();
    // Wrap methods to include context
    const originalDebug = childLogger.debug.bind(childLogger);
    const originalInfo = childLogger.info.bind(childLogger);
    const originalWarn = childLogger.warn.bind(childLogger);
    const originalError = childLogger.error.bind(childLogger);

    childLogger.debug = (msg: string, meta?: Record<string, unknown>) => {
      originalDebug(msg, { ...context, ...meta });
    };
    childLogger.info = (msg: string, meta?: Record<string, unknown>) => {
      originalInfo(msg, { ...context, ...meta });
    };
    childLogger.warn = (msg: string, meta?: Record<string, unknown>) => {
      originalWarn(msg, { ...context, ...meta });
    };
    childLogger.error = (msg: string, err?: Error, meta?: Record<string, unknown>) => {
      originalError(msg, err, { ...context, ...meta });
    };

    return childLogger;
  }
}

/**
 * Global logger instance
 */
export const logger = new Logger();
