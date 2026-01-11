/**
 * Tests for progress reporting types and utilities
 */

import { describe, it, expect } from 'vitest';
import {
  ProgressState,
  ProgressStateSchema,
  ProgressEntrySchema,
  ProgressReporterConfigSchema,
  createDefaultProgressConfig,
  ProgressUpdateSchema,
  BatchStatisticsSchema,
  calculatePercentage,
  estimateRemainingTime,
  calculateItemsPerSecond,
  formatDuration,
  formatProgress,
  createProgressBar,
  formatBatchStatistics,
} from '../../lib/src/progress/types.js';

describe('ProgressState', () => {
  it('should have correct state values', () => {
    expect(ProgressState.PENDING).toBe('pending');
    expect(ProgressState.RUNNING).toBe('running');
    expect(ProgressState.COMPLETED).toBe('completed');
    expect(ProgressState.FAILED).toBe('failed');
    expect(ProgressState.CANCELLED).toBe('cancelled');
    expect(ProgressState.PAUSED).toBe('paused');
  });
});

describe('ProgressStateSchema', () => {
  it('should validate valid states', () => {
    expect(ProgressStateSchema.parse('pending')).toBe('pending');
    expect(ProgressStateSchema.parse('running')).toBe('running');
    expect(ProgressStateSchema.parse('completed')).toBe('completed');
    expect(ProgressStateSchema.parse('failed')).toBe('failed');
    expect(ProgressStateSchema.parse('cancelled')).toBe('cancelled');
    expect(ProgressStateSchema.parse('paused')).toBe('paused');
  });

  it('should reject invalid states', () => {
    expect(() => ProgressStateSchema.parse('invalid')).toThrow();
    expect(() => ProgressStateSchema.parse('')).toThrow();
  });
});

describe('ProgressEntrySchema', () => {
  it('should validate a complete progress entry', () => {
    const entry = {
      current: 50,
      total: 100,
      percentage: 50,
      state: 'running',
      message: 'Processing...',
      startTime: new Date(),
      elapsedMs: 5000,
      estimatedRemainingMs: 5000,
      avgTimePerItemMs: 100,
      itemsPerSecond: 10,
      successCount: 45,
      failedCount: 3,
      skippedCount: 2,
      currentItem: 'item-50',
      context: { phase: 'extraction' },
    };

    const result = ProgressEntrySchema.parse(entry);
    expect(result.current).toBe(50);
    expect(result.percentage).toBe(50);
    expect(result.state).toBe('running');
  });

  it('should validate a minimal progress entry', () => {
    const entry = {
      current: 0,
      total: 100,
      percentage: 0,
      state: 'pending',
      startTime: new Date(),
      elapsedMs: 0,
    };

    const result = ProgressEntrySchema.parse(entry);
    expect(result.current).toBe(0);
    expect(result.successCount).toBe(0);
    expect(result.failedCount).toBe(0);
  });

  it('should enforce percentage bounds', () => {
    expect(() =>
      ProgressEntrySchema.parse({
        current: 0,
        total: 100,
        percentage: 150, // Over 100
        state: 'running',
        startTime: new Date(),
        elapsedMs: 0,
      })
    ).toThrow();

    expect(() =>
      ProgressEntrySchema.parse({
        current: 0,
        total: 100,
        percentage: -10, // Negative
        state: 'running',
        startTime: new Date(),
        elapsedMs: 0,
      })
    ).toThrow();
  });
});

describe('ProgressReporterConfigSchema', () => {
  it('should apply defaults', () => {
    const config = ProgressReporterConfigSchema.parse({ total: 100 });

    expect(config.total).toBe(100);
    expect(config.throttleMs).toBe(100);
    expect(config.autoLog).toBe(true);
    expect(config.logIntervalPercent).toBe(10);
  });

  it('should accept custom values', () => {
    const config = ProgressReporterConfigSchema.parse({
      total: 500,
      throttleMs: 200,
      autoLog: false,
      logIntervalPercent: 5,
      operationName: 'PDF Processing',
    });

    expect(config.total).toBe(500);
    expect(config.throttleMs).toBe(200);
    expect(config.autoLog).toBe(false);
    expect(config.logIntervalPercent).toBe(5);
    expect(config.operationName).toBe('PDF Processing');
  });
});

describe('createDefaultProgressConfig', () => {
  it('should create config with total', () => {
    const config = createDefaultProgressConfig(100);
    expect(config.total).toBe(100);
    expect(config.throttleMs).toBe(100);
  });

  it('should accept overrides', () => {
    const config = createDefaultProgressConfig(100, {
      autoLog: false,
      operationName: 'Test',
    });

    expect(config.total).toBe(100);
    expect(config.autoLog).toBe(false);
    expect(config.operationName).toBe('Test');
  });
});

describe('ProgressUpdateSchema', () => {
  it('should apply defaults', () => {
    const update = ProgressUpdateSchema.parse({});

    expect(update.increment).toBe(1);
    expect(update.success).toBe(true);
    expect(update.skipped).toBe(false);
  });

  it('should accept custom values', () => {
    const update = ProgressUpdateSchema.parse({
      increment: 5,
      success: false,
      skipped: false,
      message: 'Failed: timeout',
      currentItem: 'item-10',
      context: { error: 'timeout' },
    });

    expect(update.increment).toBe(5);
    expect(update.success).toBe(false);
    expect(update.message).toBe('Failed: timeout');
  });
});

describe('BatchStatisticsSchema', () => {
  it('should validate batch statistics', () => {
    const stats = {
      totalItems: 100,
      successCount: 90,
      failedCount: 5,
      skippedCount: 5,
      totalDurationMs: 10000,
      avgTimePerItemMs: 100,
      itemsPerSecond: 10,
      successRate: 90,
      startTime: new Date(),
      endTime: new Date(),
      errors: ['Error 1', 'Error 2'],
      breakdown: {
        extraction: 50,
        embedding: 40,
      },
    };

    const result = BatchStatisticsSchema.parse(stats);
    expect(result.totalItems).toBe(100);
    expect(result.successRate).toBe(90);
    expect(result.errors).toHaveLength(2);
  });
});

describe('calculatePercentage', () => {
  it('should calculate percentage correctly', () => {
    expect(calculatePercentage(50, 100)).toBe(50);
    expect(calculatePercentage(25, 100)).toBe(25);
    expect(calculatePercentage(100, 100)).toBe(100);
  });

  it('should return 100 when total is 0', () => {
    expect(calculatePercentage(0, 0)).toBe(100);
  });

  it('should clamp to 0-100 range', () => {
    expect(calculatePercentage(-10, 100)).toBe(0);
    expect(calculatePercentage(150, 100)).toBe(100);
  });
});

describe('estimateRemainingTime', () => {
  it('should estimate remaining time', () => {
    // 1000ms elapsed, 10 items done, 100 total = ~9000ms remaining
    const remaining = estimateRemainingTime(1000, 10, 100);
    expect(remaining).toBe(9000);
  });

  it('should return undefined when current is 0', () => {
    const remaining = estimateRemainingTime(1000, 0, 100);
    expect(remaining).toBeUndefined();
  });

  it('should return undefined when current >= total', () => {
    const remaining = estimateRemainingTime(1000, 100, 100);
    expect(remaining).toBeUndefined();
  });
});

describe('calculateItemsPerSecond', () => {
  it('should calculate items per second', () => {
    // 100 items in 10000ms = 10 items/s
    expect(calculateItemsPerSecond(100, 10000)).toBe(10);
  });

  it('should return 0 when elapsed is 0', () => {
    expect(calculateItemsPerSecond(100, 0)).toBe(0);
  });

  it('should handle fractional results', () => {
    // 1 item in 500ms = 2 items/s
    expect(calculateItemsPerSecond(1, 500)).toBe(2);
  });
});

describe('formatDuration', () => {
  it('should format milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('should format seconds', () => {
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(5500)).toBe('5.5s');
    expect(formatDuration(59000)).toBe('59.0s');
  });

  it('should format minutes and seconds', () => {
    expect(formatDuration(60000)).toBe('1m 0s');
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(3599000)).toBe('59m 59s');
  });

  it('should format hours and minutes', () => {
    expect(formatDuration(3600000)).toBe('1h 0m');
    expect(formatDuration(7200000)).toBe('2h 0m');
    expect(formatDuration(5400000)).toBe('1h 30m');
  });
});

describe('formatProgress', () => {
  it('should format progress entry', () => {
    const entry = {
      current: 50,
      total: 100,
      percentage: 50,
      state: 'running' as const,
      startTime: new Date(),
      elapsedMs: 5000,
      estimatedRemainingMs: 5000,
      itemsPerSecond: 10,
      successCount: 50,
      failedCount: 0,
      skippedCount: 0,
    };

    const formatted = formatProgress(entry);
    expect(formatted).toContain('50/100');
    expect(formatted).toContain('50.0%');
    expect(formatted).toContain('ETA');
    expect(formatted).toContain('Elapsed');
    expect(formatted).toContain('items/s');
  });

  it('should handle missing optional fields', () => {
    const entry = {
      current: 10,
      total: 100,
      percentage: 10,
      state: 'running' as const,
      startTime: new Date(),
      elapsedMs: 1000,
      successCount: 10,
      failedCount: 0,
      skippedCount: 0,
    };

    const formatted = formatProgress(entry);
    expect(formatted).toContain('10/100');
    expect(formatted).toContain('10.0%');
  });
});

describe('createProgressBar', () => {
  it('should create progress bar with default chars', () => {
    const bar = createProgressBar(50, 10);
    expect(bar).toBe('█████░░░░░');
  });

  it('should handle 0%', () => {
    const bar = createProgressBar(0, 10);
    expect(bar).toBe('░░░░░░░░░░');
  });

  it('should handle 100%', () => {
    const bar = createProgressBar(100, 10);
    expect(bar).toBe('██████████');
  });

  it('should use custom characters', () => {
    const bar = createProgressBar(50, 10, '#', '-');
    expect(bar).toBe('#####-----');
  });

  it('should use default width of 40', () => {
    const bar = createProgressBar(50);
    expect(bar.length).toBe(40);
  });
});

describe('formatBatchStatistics', () => {
  it('should format batch statistics', () => {
    const stats = {
      totalItems: 100,
      successCount: 90,
      failedCount: 5,
      skippedCount: 5,
      totalDurationMs: 10000,
      avgTimePerItemMs: 100,
      itemsPerSecond: 10,
      successRate: 90,
      startTime: new Date(),
      endTime: new Date(),
      errors: [],
    };

    const formatted = formatBatchStatistics(stats);
    expect(formatted).toContain('Total Items: 100');
    expect(formatted).toContain('Successful: 90');
    expect(formatted).toContain('Failed: 5');
    expect(formatted).toContain('Skipped: 5');
    expect(formatted).toContain('Success Rate: 90.0%');
    expect(formatted).toContain('Total Duration: 10.0s');
  });

  it('should include errors if present', () => {
    const stats = {
      totalItems: 100,
      successCount: 95,
      failedCount: 5,
      skippedCount: 0,
      totalDurationMs: 10000,
      avgTimePerItemMs: 100,
      itemsPerSecond: 10,
      successRate: 95,
      startTime: new Date(),
      endTime: new Date(),
      errors: ['Error 1', 'Error 2'],
    };

    const formatted = formatBatchStatistics(stats);
    expect(formatted).toContain('Errors (2)');
    expect(formatted).toContain('Error 1');
    expect(formatted).toContain('Error 2');
  });

  it('should truncate many errors', () => {
    const errors = Array.from({ length: 20 }, (_, i) => `Error ${i + 1}`);
    const stats = {
      totalItems: 100,
      successCount: 80,
      failedCount: 20,
      skippedCount: 0,
      totalDurationMs: 10000,
      avgTimePerItemMs: 100,
      itemsPerSecond: 10,
      successRate: 80,
      startTime: new Date(),
      endTime: new Date(),
      errors,
    };

    const formatted = formatBatchStatistics(stats);
    expect(formatted).toContain('Errors (20)');
    expect(formatted).toContain('and 10 more');
  });

  it('should include breakdown if present', () => {
    const stats = {
      totalItems: 100,
      successCount: 100,
      failedCount: 0,
      skippedCount: 0,
      totalDurationMs: 10000,
      avgTimePerItemMs: 100,
      itemsPerSecond: 10,
      successRate: 100,
      startTime: new Date(),
      endTime: new Date(),
      errors: [],
      breakdown: {
        extraction: 50,
        embedding: 50,
      },
    };

    const formatted = formatBatchStatistics(stats);
    expect(formatted).toContain('Breakdown:');
    expect(formatted).toContain('extraction: 50');
    expect(formatted).toContain('embedding: 50');
  });
});
