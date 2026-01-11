/**
 * Tests for Logger class
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
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
} from '../../lib/src/logging/logger.js';
import { LogLevel, LogFormat } from '../../lib/src/logging/types.js';

describe('Logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resetGlobalLogger();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create logger with default config', () => {
      const logger = new Logger();
      const config = logger.getConfig();

      expect(config.level).toBe(LogLevel.INFO);
      expect(config.format).toBe('text');
      expect(config.timestamps).toBe(true);
    });

    it('should accept custom config', () => {
      const logger = new Logger({
        level: LogLevel.DEBUG,
        format: 'json',
        source: 'test',
      });
      const config = logger.getConfig();

      expect(config.level).toBe(LogLevel.DEBUG);
      expect(config.format).toBe('json');
      expect(config.source).toBe('test');
    });
  });

  describe('child', () => {
    it('should create child logger with combined source', () => {
      const parent = new Logger({ source: 'parent' });
      const child = parent.child('child');
      const config = child.getConfig();

      expect(config.source).toBe('parent:child');
    });

    it('should create child logger with source when parent has none', () => {
      const parent = new Logger();
      const child = parent.child('child');
      const config = child.getConfig();

      expect(config.source).toBe('child');
    });

    it('should inherit parent config', () => {
      const parent = new Logger({ level: LogLevel.DEBUG, format: 'json' });
      const child = parent.child('child');
      const config = child.getConfig();

      expect(config.level).toBe(LogLevel.DEBUG);
      expect(config.format).toBe('json');
    });
  });

  describe('log levels', () => {
    it('should log error messages', () => {
      const logger = new Logger({ level: LogLevel.ERROR });
      logger.error('Error message');

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should log warn messages', () => {
      const logger = new Logger({ level: LogLevel.WARN });
      logger.warn('Warning message');

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should log info messages', () => {
      const logger = new Logger({ level: LogLevel.INFO });
      logger.info('Info message');

      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log debug messages when level is DEBUG', () => {
      const logger = new Logger({ level: LogLevel.DEBUG });
      logger.debug('Debug message');

      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should not log debug messages when level is INFO', () => {
      const logger = new Logger({ level: LogLevel.INFO });
      logger.debug('Debug message');

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should log trace messages when level is TRACE', () => {
      const logger = new Logger({ level: LogLevel.TRACE });
      logger.trace('Trace message');

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('error with Error object', () => {
    it('should log error with Error object', () => {
      const logger = new Logger({ level: LogLevel.ERROR });
      const error = new Error('Test error');

      logger.error('Something went wrong', error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const output = consoleErrorSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('Something went wrong');
      expect(output).toContain('Test error');
    });

    it('should log error with context', () => {
      const logger = new Logger({ level: LogLevel.ERROR, format: 'json' });
      logger.error('Error', { userId: 123 });

      expect(consoleErrorSpy).toHaveBeenCalled();
      const output = consoleErrorSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('"userId":123');
    });
  });

  describe('format options', () => {
    it('should format as text', () => {
      const logger = new Logger({
        level: LogLevel.INFO,
        format: 'text',
        timestamps: false,
      });
      logger.info('Test message');

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('INFO');
      expect(output).toContain('Test message');
    });

    it('should format as JSON', () => {
      const logger = new Logger({
        level: LogLevel.INFO,
        format: 'json',
      });
      logger.info('Test message', { key: 'value' });

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe('INFO');
      expect(parsed.message).toBe('Test message');
      expect(parsed.context.key).toBe('value');
    });

    it('should format as compact', () => {
      const logger = new Logger({
        level: LogLevel.INFO,
        format: 'compact',
      });
      logger.info('Test message');

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('I'); // First letter of INFO
      expect(output).toContain('Test message');
    });

    it('should format as pretty', () => {
      const logger = new Logger({
        level: LogLevel.INFO,
        format: 'pretty',
        colors: true,
      });
      logger.info('Test message');

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('INFO');
      expect(output).toContain('Test message');
    });
  });

  describe('custom output', () => {
    it('should use custom output handler', () => {
      const output = vi.fn();
      const logger = new Logger({
        level: LogLevel.INFO,
        output,
        console: false,
      });

      logger.info('Test message');

      expect(output).toHaveBeenCalled();
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should pass level to custom output', () => {
      const output = vi.fn();
      const logger = new Logger({
        level: LogLevel.INFO,
        output,
      });

      logger.error('Error');
      logger.warn('Warning');
      logger.info('Info');

      expect(output).toHaveBeenCalledTimes(3);
      expect(output.mock.calls[0]?.[1]).toBe(LogLevel.ERROR);
      expect(output.mock.calls[1]?.[1]).toBe(LogLevel.WARN);
      expect(output.mock.calls[2]?.[1]).toBe(LogLevel.INFO);
    });
  });

  describe('setLevel', () => {
    it('should change log level', () => {
      const logger = new Logger({ level: LogLevel.INFO });

      logger.debug('Should not log');
      expect(consoleSpy).not.toHaveBeenCalled();

      logger.setLevel(LogLevel.DEBUG);
      logger.debug('Should log now');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('getLevel', () => {
    it('should return current level', () => {
      const logger = new Logger({ level: LogLevel.WARN });
      expect(logger.getLevel()).toBe(LogLevel.WARN);
    });
  });
});

describe('Global Logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    resetGlobalLogger();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('getGlobalLogger', () => {
    it('should return same instance', () => {
      const logger1 = getGlobalLogger();
      const logger2 = getGlobalLogger();

      expect(logger1).toBe(logger2);
    });

    it('should create with default config', () => {
      const logger = getGlobalLogger();
      const config = logger.getConfig();

      expect(config.level).toBe(LogLevel.INFO);
      expect(config.format).toBe('pretty');
    });
  });

  describe('setGlobalLogger', () => {
    it('should replace global logger', () => {
      const custom = new Logger({ level: LogLevel.DEBUG });
      setGlobalLogger(custom);

      expect(getGlobalLogger()).toBe(custom);
    });
  });

  describe('resetGlobalLogger', () => {
    it('should reset to new instance', () => {
      const before = getGlobalLogger();
      resetGlobalLogger();
      const after = getGlobalLogger();

      expect(before).not.toBe(after);
    });
  });
});

describe('createLogger', () => {
  it('should create logger with source', () => {
    const logger = createLogger('my-module');
    const config = logger.getConfig();

    expect(config.source).toBe('my-module');
  });

  it('should accept additional config', () => {
    const logger = createLogger('my-module', {
      level: LogLevel.DEBUG,
      format: 'json',
    });
    const config = logger.getConfig();

    expect(config.source).toBe('my-module');
    expect(config.level).toBe(LogLevel.DEBUG);
    expect(config.format).toBe('json');
  });
});

describe('Convenience functions', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resetGlobalLogger();
    // Set global logger to DEBUG level to test all functions
    setGlobalLogger(new Logger({ level: LogLevel.TRACE }));
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('logError should log error', () => {
    logError('Error message');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('logError should accept Error object', () => {
    logError('Error', new Error('Test'));
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('logWarn should log warning', () => {
    logWarn('Warning');
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it('logInfo should log info', () => {
    logInfo('Info');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('logDebug should log debug', () => {
    logDebug('Debug');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('logTrace should log trace', () => {
    logTrace('Trace');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should accept context', () => {
    logInfo('Message', { key: 'value' });
    expect(consoleSpy).toHaveBeenCalled();
  });
});
