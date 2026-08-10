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

export class Logger implements ILogger {
  private _level?: LogLevel;
  private _enableMetrics?: boolean;
  private _logFilePath?: string;
  private _enableFileSink?: boolean;
  private _maxFileSizeBytes?: number;
  private _maxFiles?: number;
  private _initialized = false;

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
        // (mirrors `level`'s MASSA_AI_LOG_FILE/LOG_LEVEL handling), so this is
        // a plain read. `file` is always concrete since T8 (LOG-02).
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
    const ts = new Date().toISOString();
    const line = this.formatMessage(LOG_LEVEL_LABELS[level], message, meta, ts);
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
      ...(meta ? { meta } : {}),
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
      const errorMeta = error ? {
        ...meta,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        }
      } : meta;
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
