/**
 * Logger Implementation
 *
 * A flexible, configurable logger for the Israeli Law RAG project.
 * Supports multiple log levels, formats, and output targets.
 */

import {
  type LogEntry,
  type LoggerConfig,
  type LogLevel,
  LogLevelName,
  LogLevelColors,
  LogColors,
  createDefaultLoggerConfig,
  shouldLog,
  formatError,
  LogLevel as LogLevelEnum,
  LogFormat,
} from './types.js';

// =============================================================================
// Logger Class
// =============================================================================

/**
 * Logger class for structured logging
 */
export class Logger {
  private readonly config: LoggerConfig;

  constructor(config?: Partial<LoggerConfig>) {
    this.config = createDefaultLoggerConfig(config);
  }

  /**
   * Create a child logger with a specific source
   */
  child(source: string): Logger {
    return new Logger({
      ...this.config,
      source: this.config.source ? `${this.config.source}:${source}` : source,
    });
  }

  /**
   * Log an error message
   */
  error(message: string, context?: Record<string, unknown>): void;
  error(message: string, error: Error, context?: Record<string, unknown>): void;
  error(
    message: string,
    errorOrContext?: Error | Record<string, unknown>,
    context?: Record<string, unknown>
  ): void {
    let error: Error | undefined;
    let ctx: Record<string, unknown> | undefined = context;

    if (errorOrContext instanceof Error) {
      error = errorOrContext;
    } else {
      ctx = errorOrContext;
    }

    this.log(LogLevelEnum.ERROR, message, ctx, error);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevelEnum.WARN, message, context);
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevelEnum.INFO, message, context);
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevelEnum.DEBUG, message, context);
  }

  /**
   * Log a trace message
   */
  trace(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevelEnum.TRACE, message, context);
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    if (!shouldLog(level, this.config.level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context,
      source: this.config.source,
      error: error ? formatError(error) : undefined,
    };

    const formatted = this.format(entry);
    this.output(formatted, level);
  }

  /**
   * Format a log entry based on configuration
   */
  private format(entry: LogEntry): string {
    switch (this.config.format) {
      case LogFormat.JSON:
        return this.formatJson(entry);
      case LogFormat.COMPACT:
        return this.formatCompact(entry);
      case LogFormat.PRETTY:
        return this.formatPretty(entry);
      case LogFormat.TEXT:
      default:
        return this.formatText(entry);
    }
  }

  /**
   * Format as text (default)
   */
  private formatText(entry: LogEntry): string {
    const parts: string[] = [];

    // Timestamp
    if (this.config.timestamps) {
      parts.push(`[${entry.timestamp.toISOString()}]`);
    }

    // Level
    const levelName = LogLevelName[entry.level];
    parts.push(levelName.padEnd(5));

    // Source
    if (entry.source) {
      parts.push(`[${entry.source}]`);
    }

    // Message
    parts.push(entry.message);

    // Context
    if (entry.context && Object.keys(entry.context).length > 0) {
      parts.push(JSON.stringify(entry.context));
    }

    // Error
    if (entry.error) {
      parts.push(`\n  Error: ${entry.error.name}: ${entry.error.message}`);
      if (entry.error.stack) {
        parts.push(`\n  ${entry.error.stack.replace(/\n/g, '\n  ')}`);
      }
    }

    return parts.join(' ');
  }

  /**
   * Format as JSON
   */
  private formatJson(entry: LogEntry): string {
    return JSON.stringify({
      timestamp: entry.timestamp.toISOString(),
      level: LogLevelName[entry.level],
      message: entry.message,
      source: entry.source,
      context: entry.context,
      error: entry.error,
    });
  }

  /**
   * Format as compact (one-liner)
   */
  private formatCompact(entry: LogEntry): string {
    const levelName = LogLevelName[entry.level][0]; // First letter only
    const time = entry.timestamp.toISOString().slice(11, 19); // HH:MM:SS only
    return `${time} ${levelName} ${entry.message}`;
  }

  /**
   * Format as pretty (with colors)
   */
  private formatPretty(entry: LogEntry): string {
    if (!this.config.colors) {
      return this.formatText(entry);
    }

    const parts: string[] = [];
    const levelColor = LogLevelColors[entry.level];
    const levelName = LogLevelName[entry.level];

    // Timestamp (gray)
    if (this.config.timestamps) {
      parts.push(
        `${LogColors.gray}[${entry.timestamp.toISOString()}]${LogColors.reset}`
      );
    }

    // Level (colored)
    parts.push(`${levelColor}${levelName.padEnd(5)}${LogColors.reset}`);

    // Source (cyan)
    if (entry.source) {
      parts.push(`${LogColors.cyan}[${entry.source}]${LogColors.reset}`);
    }

    // Message
    parts.push(entry.message);

    // Context (dim)
    if (entry.context && Object.keys(entry.context).length > 0) {
      parts.push(
        `${LogColors.dim}${JSON.stringify(entry.context)}${LogColors.reset}`
      );
    }

    // Error (red)
    if (entry.error) {
      parts.push(
        `\n  ${LogColors.red}Error: ${entry.error.name}: ${entry.error.message}${LogColors.reset}`
      );
      if (entry.error.stack) {
        parts.push(
          `\n  ${LogColors.gray}${entry.error.stack.replace(/\n/g, '\n  ')}${LogColors.reset}`
        );
      }
    }

    return parts.join(' ');
  }

  /**
   * Output the formatted log entry
   */
  private output(formatted: string, level: LogLevel): void {
    // Custom output handler
    if (this.config.output) {
      this.config.output(formatted, level);
      return;
    }

    // Console output
    if (this.config.console) {
      if (level === LogLevelEnum.ERROR) {
        console.error(formatted);
      } else if (level === LogLevelEnum.WARN) {
        console.warn(formatted);
      } else {
        console.log(formatted);
      }
    }
  }

  /**
   * Set the log level
   */
  setLevel(level: LogLevel): void {
    (this.config as { level: LogLevel }).level = level;
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Get the logger configuration
   */
  getConfig(): Readonly<LoggerConfig> {
    return this.config;
  }
}

// =============================================================================
// Global Logger Instance
// =============================================================================

let globalLogger: Logger | null = null;

/**
 * Get or create the global logger instance
 */
export function getGlobalLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger({
      level: LogLevelEnum.INFO,
      format: 'pretty',
    });
  }
  return globalLogger;
}

/**
 * Set the global logger instance
 */
export function setGlobalLogger(logger: Logger): void {
  globalLogger = logger;
}

/**
 * Reset the global logger instance
 */
export function resetGlobalLogger(): void {
  globalLogger = null;
}

/**
 * Create a logger with a specific source
 */
export function createLogger(
  source: string,
  config?: Partial<LoggerConfig>
): Logger {
  return new Logger({
    ...config,
    source,
  });
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Log an error using the global logger
 */
export function logError(
  message: string,
  errorOrContext?: Error | Record<string, unknown>,
  context?: Record<string, unknown>
): void {
  const logger = getGlobalLogger();
  if (errorOrContext instanceof Error) {
    logger.error(message, errorOrContext, context);
  } else {
    logger.error(message, errorOrContext);
  }
}

/**
 * Log a warning using the global logger
 */
export function logWarn(
  message: string,
  context?: Record<string, unknown>
): void {
  getGlobalLogger().warn(message, context);
}

/**
 * Log an info message using the global logger
 */
export function logInfo(
  message: string,
  context?: Record<string, unknown>
): void {
  getGlobalLogger().info(message, context);
}

/**
 * Log a debug message using the global logger
 */
export function logDebug(
  message: string,
  context?: Record<string, unknown>
): void {
  getGlobalLogger().debug(message, context);
}

/**
 * Log a trace message using the global logger
 */
export function logTrace(
  message: string,
  context?: Record<string, unknown>
): void {
  getGlobalLogger().trace(message, context);
}
