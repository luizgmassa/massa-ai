/**
 * Logger Utility
 * 
 * Structured logging with levels and metadata support
 */

import fs from 'node:fs';
import { ILogger } from '../types/interfaces.js';
import { config } from '../config/index.js';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export class Logger implements ILogger {
  private _level?: LogLevel;
  private _enableMetrics?: boolean;
  private _logFilePath?: string;
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
        // a plain read.
        this._logFilePath = loggingConfig.file;
      } catch {
        // Fallback if config is not available yet
        this._level = LogLevel.INFO;
        this._enableMetrics = false;
        this._logFilePath = undefined;
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
    meta?: Record<string, unknown>
  ): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}] ${message}${metaStr}`;
  }

  /**
   * Write log message to stderr, and additionally to a file when the opt-in
   * sink (MASSA_AI_LOG_FILE env or config `logging.file`) is configured.
   * All logs (DEBUG, INFO, WARN, ERROR) go to stderr, unconditionally and
   * unchanged. Stdout must remain pristine for stdio MCP protocol (pure
   * JSON-RPC) — the file sink never touches stdout.
   */
  private write(message: string, _level: LogLevel): void {
    console.error(message);
    const filePath = this.logFilePath;
    if (filePath) {
      try {
        // Sync append, v1: no rotation. A broken/unwritable path must not
        // crash logging or ever fall back to stdout.
        fs.appendFileSync(filePath, message + '\n');
      } catch {
        // Best-effort sink; stderr above already carried the line.
      }
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.write(this.formatMessage('DEBUG', message, meta), LogLevel.DEBUG);
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.write(this.formatMessage('INFO', message, meta), LogLevel.INFO);
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.write(this.formatMessage('WARN', message, meta), LogLevel.WARN);
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
      this.write(this.formatMessage('ERROR', message, errorMeta), LogLevel.ERROR);
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
