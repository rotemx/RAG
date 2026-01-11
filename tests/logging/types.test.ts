/**
 * Tests for logging types and utilities
 */

import { describe, it, expect } from 'vitest';
import {
  LogLevel,
  LogLevelName,
  LogLevelSchema,
  LogEntrySchema,
  LogFormat,
  LogFormatSchema,
  LoggerConfigSchema,
  createDefaultLoggerConfig,
  LogColors,
  LogLevelColors,
  parseLogLevel,
  getLogLevelName,
  shouldLog,
  formatError,
} from '../../lib/src/logging/types.js';

describe('LogLevel', () => {
  it('should have correct severity values', () => {
    expect(LogLevel.ERROR).toBe(0);
    expect(LogLevel.WARN).toBe(1);
    expect(LogLevel.INFO).toBe(2);
    expect(LogLevel.DEBUG).toBe(3);
    expect(LogLevel.TRACE).toBe(4);
  });

  it('should have ERROR as highest priority (lowest number)', () => {
    expect(LogLevel.ERROR).toBeLessThan(LogLevel.WARN);
    expect(LogLevel.WARN).toBeLessThan(LogLevel.INFO);
    expect(LogLevel.INFO).toBeLessThan(LogLevel.DEBUG);
    expect(LogLevel.DEBUG).toBeLessThan(LogLevel.TRACE);
  });
});

describe('LogLevelName', () => {
  it('should map levels to names', () => {
    expect(LogLevelName[LogLevel.ERROR]).toBe('ERROR');
    expect(LogLevelName[LogLevel.WARN]).toBe('WARN');
    expect(LogLevelName[LogLevel.INFO]).toBe('INFO');
    expect(LogLevelName[LogLevel.DEBUG]).toBe('DEBUG');
    expect(LogLevelName[LogLevel.TRACE]).toBe('TRACE');
  });
});

describe('LogLevelSchema', () => {
  it('should validate valid log levels', () => {
    expect(LogLevelSchema.parse(0)).toBe(0);
    expect(LogLevelSchema.parse(1)).toBe(1);
    expect(LogLevelSchema.parse(2)).toBe(2);
    expect(LogLevelSchema.parse(3)).toBe(3);
    expect(LogLevelSchema.parse(4)).toBe(4);
  });

  it('should reject invalid log levels', () => {
    expect(() => LogLevelSchema.parse(5)).toThrow();
    expect(() => LogLevelSchema.parse(-1)).toThrow();
    expect(() => LogLevelSchema.parse('INFO')).toThrow();
  });
});

describe('LogEntrySchema', () => {
  it('should validate a complete log entry', () => {
    const entry = {
      level: LogLevel.INFO,
      message: 'Test message',
      timestamp: new Date(),
      context: { key: 'value' },
      source: 'test-source',
    };

    const result = LogEntrySchema.parse(entry);
    expect(result.level).toBe(LogLevel.INFO);
    expect(result.message).toBe('Test message');
    expect(result.context).toEqual({ key: 'value' });
    expect(result.source).toBe('test-source');
  });

  it('should validate a minimal log entry', () => {
    const entry = {
      level: LogLevel.ERROR,
      message: 'Error occurred',
      timestamp: new Date(),
    };

    const result = LogEntrySchema.parse(entry);
    expect(result.level).toBe(LogLevel.ERROR);
    expect(result.message).toBe('Error occurred');
  });

  it('should validate log entry with error', () => {
    const entry = {
      level: LogLevel.ERROR,
      message: 'Error occurred',
      timestamp: new Date(),
      error: {
        name: 'TypeError',
        message: 'Cannot read property',
        stack: 'Error: Cannot read property\n  at test.js:1',
      },
    };

    const result = LogEntrySchema.parse(entry);
    expect(result.error?.name).toBe('TypeError');
    expect(result.error?.message).toBe('Cannot read property');
  });
});

describe('LogFormat', () => {
  it('should have correct format values', () => {
    expect(LogFormat.TEXT).toBe('text');
    expect(LogFormat.JSON).toBe('json');
    expect(LogFormat.COMPACT).toBe('compact');
    expect(LogFormat.PRETTY).toBe('pretty');
  });
});

describe('LogFormatSchema', () => {
  it('should validate valid formats', () => {
    expect(LogFormatSchema.parse('text')).toBe('text');
    expect(LogFormatSchema.parse('json')).toBe('json');
    expect(LogFormatSchema.parse('compact')).toBe('compact');
    expect(LogFormatSchema.parse('pretty')).toBe('pretty');
  });

  it('should reject invalid formats', () => {
    expect(() => LogFormatSchema.parse('invalid')).toThrow();
    expect(() => LogFormatSchema.parse('')).toThrow();
  });
});

describe('LoggerConfigSchema', () => {
  it('should apply defaults', () => {
    const config = LoggerConfigSchema.parse({});

    expect(config.level).toBe(LogLevel.INFO);
    expect(config.format).toBe('text');
    expect(config.timestamps).toBe(true);
    expect(config.colors).toBe(true);
    expect(config.console).toBe(true);
  });

  it('should accept custom values', () => {
    const config = LoggerConfigSchema.parse({
      level: LogLevel.DEBUG,
      format: 'json',
      timestamps: false,
      colors: false,
      source: 'my-app',
    });

    expect(config.level).toBe(LogLevel.DEBUG);
    expect(config.format).toBe('json');
    expect(config.timestamps).toBe(false);
    expect(config.colors).toBe(false);
    expect(config.source).toBe('my-app');
  });
});

describe('createDefaultLoggerConfig', () => {
  it('should create config with defaults', () => {
    const config = createDefaultLoggerConfig();

    expect(config.level).toBe(LogLevel.INFO);
    expect(config.format).toBe('text');
  });

  it('should accept overrides', () => {
    const config = createDefaultLoggerConfig({
      level: LogLevel.ERROR,
      source: 'test',
    });

    expect(config.level).toBe(LogLevel.ERROR);
    expect(config.source).toBe('test');
  });
});

describe('LogColors', () => {
  it('should have ANSI color codes', () => {
    expect(LogColors.reset).toBe('\x1b[0m');
    expect(LogColors.red).toBe('\x1b[31m');
    expect(LogColors.yellow).toBe('\x1b[33m');
    expect(LogColors.blue).toBe('\x1b[34m');
  });
});

describe('LogLevelColors', () => {
  it('should map levels to colors', () => {
    expect(LogLevelColors[LogLevel.ERROR]).toBe(LogColors.red);
    expect(LogLevelColors[LogLevel.WARN]).toBe(LogColors.yellow);
    expect(LogLevelColors[LogLevel.INFO]).toBe(LogColors.blue);
    expect(LogLevelColors[LogLevel.DEBUG]).toBe(LogColors.cyan);
    expect(LogLevelColors[LogLevel.TRACE]).toBe(LogColors.gray);
  });
});

describe('parseLogLevel', () => {
  it('should parse level names (case insensitive)', () => {
    expect(parseLogLevel('ERROR')).toBe(LogLevel.ERROR);
    expect(parseLogLevel('error')).toBe(LogLevel.ERROR);
    expect(parseLogLevel('WARN')).toBe(LogLevel.WARN);
    expect(parseLogLevel('warn')).toBe(LogLevel.WARN);
    expect(parseLogLevel('INFO')).toBe(LogLevel.INFO);
    expect(parseLogLevel('info')).toBe(LogLevel.INFO);
    expect(parseLogLevel('DEBUG')).toBe(LogLevel.DEBUG);
    expect(parseLogLevel('debug')).toBe(LogLevel.DEBUG);
    expect(parseLogLevel('TRACE')).toBe(LogLevel.TRACE);
    expect(parseLogLevel('trace')).toBe(LogLevel.TRACE);
  });

  it('should default to INFO for unknown levels', () => {
    expect(parseLogLevel('unknown')).toBe(LogLevel.INFO);
    expect(parseLogLevel('')).toBe(LogLevel.INFO);
  });
});

describe('getLogLevelName', () => {
  it('should return level names', () => {
    expect(getLogLevelName(LogLevel.ERROR)).toBe('ERROR');
    expect(getLogLevelName(LogLevel.WARN)).toBe('WARN');
    expect(getLogLevelName(LogLevel.INFO)).toBe('INFO');
    expect(getLogLevelName(LogLevel.DEBUG)).toBe('DEBUG');
    expect(getLogLevelName(LogLevel.TRACE)).toBe('TRACE');
  });
});

describe('shouldLog', () => {
  it('should return true when level is at or below minimum', () => {
    // At INFO level, should log ERROR, WARN, and INFO
    expect(shouldLog(LogLevel.ERROR, LogLevel.INFO)).toBe(true);
    expect(shouldLog(LogLevel.WARN, LogLevel.INFO)).toBe(true);
    expect(shouldLog(LogLevel.INFO, LogLevel.INFO)).toBe(true);
  });

  it('should return false when level is above minimum', () => {
    // At INFO level, should not log DEBUG or TRACE
    expect(shouldLog(LogLevel.DEBUG, LogLevel.INFO)).toBe(false);
    expect(shouldLog(LogLevel.TRACE, LogLevel.INFO)).toBe(false);
  });

  it('should log everything at TRACE level', () => {
    expect(shouldLog(LogLevel.ERROR, LogLevel.TRACE)).toBe(true);
    expect(shouldLog(LogLevel.WARN, LogLevel.TRACE)).toBe(true);
    expect(shouldLog(LogLevel.INFO, LogLevel.TRACE)).toBe(true);
    expect(shouldLog(LogLevel.DEBUG, LogLevel.TRACE)).toBe(true);
    expect(shouldLog(LogLevel.TRACE, LogLevel.TRACE)).toBe(true);
  });

  it('should only log errors at ERROR level', () => {
    expect(shouldLog(LogLevel.ERROR, LogLevel.ERROR)).toBe(true);
    expect(shouldLog(LogLevel.WARN, LogLevel.ERROR)).toBe(false);
    expect(shouldLog(LogLevel.INFO, LogLevel.ERROR)).toBe(false);
    expect(shouldLog(LogLevel.DEBUG, LogLevel.ERROR)).toBe(false);
    expect(shouldLog(LogLevel.TRACE, LogLevel.ERROR)).toBe(false);
  });
});

describe('formatError', () => {
  it('should format Error objects', () => {
    const error = new Error('Test error');
    error.name = 'TestError';

    const formatted = formatError(error);

    expect(formatted.name).toBe('TestError');
    expect(formatted.message).toBe('Test error');
    expect(formatted.stack).toBeDefined();
  });

  it('should format non-Error values', () => {
    const formatted = formatError('string error');

    expect(formatted.name).toBe('UnknownError');
    expect(formatted.message).toBe('string error');
    expect(formatted.stack).toBeUndefined();
  });

  it('should handle null and undefined', () => {
    expect(formatError(null).message).toBe('null');
    expect(formatError(undefined).message).toBe('undefined');
  });

  it('should handle objects', () => {
    const formatted = formatError({ code: 'ERR', reason: 'test' });

    expect(formatted.name).toBe('UnknownError');
    expect(formatted.message).toBe('[object Object]');
  });
});
