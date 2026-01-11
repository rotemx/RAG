/**
 * Logging Types and Schemas
 *
 * TypeScript type definitions for the logging system in the Israeli Law RAG project.
 * Provides structured logging with log levels, formatters, and transports.
 */

import { z } from 'zod';

// =============================================================================
// Log Levels
// =============================================================================

/**
 * Log level severity (lower number = higher priority)
 */
export const LogLevel = {
  /** Critical errors that require immediate attention */
  ERROR: 0,
  /** Warning conditions that should be investigated */
  WARN: 1,
  /** Informational messages about normal operation */
  INFO: 2,
  /** Debug information for development and troubleshooting */
  DEBUG: 3,
  /** Detailed trace information */
  TRACE: 4,
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * Log level names for display
 */
export const LogLevelName = {
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.TRACE]: 'TRACE',
} as const;

export type LogLevelName = (typeof LogLevelName)[keyof typeof LogLevelName];

/**
 * Zod schema for log level validation
 */
export const LogLevelSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

// =============================================================================
// Log Entry
// =============================================================================

/**
 * A single log entry
 */
export const LogEntrySchema = z.object({
  /** Log level */
  level: LogLevelSchema,

  /** Log message */
  message: z.string(),

  /** Timestamp of the log entry */
  timestamp: z.date(),

  /** Optional context/metadata */
  context: z.record(z.unknown()).optional(),

  /** Optional error associated with the log */
  error: z
    .object({
      name: z.string(),
      message: z.string(),
      stack: z.string().optional(),
    })
    .optional(),

  /** Optional source identifier (e.g., module name) */
  source: z.string().optional(),
});

export type LogEntry = z.infer<typeof LogEntrySchema>;

// =============================================================================
// Logger Configuration
// =============================================================================

/**
 * Output format for log entries
 */
export const LogFormat = {
  /** Human-readable text format */
  TEXT: 'text',
  /** JSON format for machine parsing */
  JSON: 'json',
  /** Compact format with minimal information */
  COMPACT: 'compact',
  /** Pretty format with colors (for terminal) */
  PRETTY: 'pretty',
} as const;

export type LogFormat = (typeof LogFormat)[keyof typeof LogFormat];

/**
 * Zod schema for log format validation
 */
export const LogFormatSchema = z.enum(['text', 'json', 'compact', 'pretty']);

/**
 * Logger configuration options
 */
export const LoggerConfigSchema = z.object({
  /**
   * Minimum log level to output
   * @default LogLevel.INFO
   */
  level: LogLevelSchema.default(LogLevel.INFO),

  /**
   * Output format
   * @default 'text'
   */
  format: LogFormatSchema.default('text'),

  /**
   * Whether to include timestamps
   * @default true
   */
  timestamps: z.boolean().default(true),

  /**
   * Whether to include colors in output (for terminal)
   * @default true
   */
  colors: z.boolean().default(true),

  /**
   * Source identifier for all logs from this logger
   */
  source: z.string().optional(),

  /**
   * Whether to output to console
   * @default true
   */
  console: z.boolean().default(true),

  /**
   * Custom output handler (receives formatted log entries)
   */
  output: z
    .function()
    .args(z.string(), LogLevelSchema)
    .returns(z.void())
    .optional(),
});

export type LoggerConfig = z.infer<typeof LoggerConfigSchema>;

/**
 * Create a default logger configuration
 */
export function createDefaultLoggerConfig(
  overrides?: Partial<LoggerConfig>
): LoggerConfig {
  return LoggerConfigSchema.parse(overrides ?? {});
}

// =============================================================================
// Log Formatting
// =============================================================================

/**
 * ANSI color codes for terminal output
 */
export const LogColors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground colors
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
} as const;

/**
 * Color mapping for log levels
 */
export const LogLevelColors: Record<LogLevel, string> = {
  [LogLevel.ERROR]: LogColors.red,
  [LogLevel.WARN]: LogColors.yellow,
  [LogLevel.INFO]: LogColors.blue,
  [LogLevel.DEBUG]: LogColors.cyan,
  [LogLevel.TRACE]: LogColors.gray,
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Parse a log level from string
 */
export function parseLogLevel(level: string): LogLevel {
  const normalized = level.toUpperCase();
  const found = Object.entries(LogLevelName).find(
    ([, name]) => name === normalized
  );

  if (found) {
    return parseInt(found[0], 10) as LogLevel;
  }

  // Default to INFO if not recognized
  return LogLevel.INFO;
}

/**
 * Get the name for a log level
 */
export function getLogLevelName(level: LogLevel): LogLevelName {
  return LogLevelName[level];
}

/**
 * Check if a log level should be output given a minimum level
 */
export function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
  return level <= minLevel;
}

/**
 * Format an error for logging
 */
export function formatError(
  error: unknown
): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: 'UnknownError',
    message: String(error),
  };
}
