/**
 * Logging Module
 *
 * Exports all logging-related types, classes, and utilities.
 */

// Types and schemas
export {
  LogLevel,
  LogLevelName,
  LogLevelSchema,
  LogEntrySchema,
  type LogEntry,
  LogFormat,
  LogFormatSchema,
  LoggerConfigSchema,
  type LoggerConfig,
  createDefaultLoggerConfig,
  LogColors,
  LogLevelColors,
  parseLogLevel,
  getLogLevelName,
  shouldLog,
  formatError,
} from './types.js';

// Logger class and utilities
export {
  Logger,
  getGlobalLogger,
  setGlobalLogger,
  resetGlobalLogger,
  createLogger,
  logError,
  logWarn,
  logInfo,
  logDebug,
  logTrace,
} from './logger.js';
