/**
 * Tests for ProgressReporter class
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ProgressReporter,
  createProgressReporter,
  createSilentProgressReporter,
  createVerboseProgressReporter,
  MultiStageProgressReporter,
  createMultiStageProgressReporter,
} from '../../lib/src/progress/reporter.js';
import {
  ProgressState,
  type ProgressEntry,
} from '../../lib/src/progress/types.js';

describe('ProgressReporter', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should accept total as number', () => {
      const reporter = new ProgressReporter(100);
      const progress = reporter.getProgress();
      expect(progress.total).toBe(100);
    });

    it('should accept config object', () => {
      const reporter = new ProgressReporter({
        total: 100,
        autoLog: false,
        operationName: 'Test',
      });
      const progress = reporter.getProgress();
      expect(progress.total).toBe(100);
    });

    it('should accept total with options', () => {
      const reporter = new ProgressReporter(100, {
        autoLog: false,
        operationName: 'Test',
      });
      const progress = reporter.getProgress();
      expect(progress.total).toBe(100);
    });
  });

  describe('start', () => {
    it('should set state to RUNNING', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      expect(reporter.getState()).toBe(ProgressState.RUNNING);
    });

    it('should log start message when autoLog is true', () => {
      const reporter = new ProgressReporter(100, {
        autoLog: true,
        operationName: 'Test',
      });
      reporter.start();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Test'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('100 items'));
    });

    it('should set start message', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start('Starting processing');
      const progress = reporter.getProgress();
      expect(progress.message).toBe('Starting processing');
    });
  });

  describe('update', () => {
    it('should increment current by 1 by default', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.update();
      expect(reporter.getProgress().current).toBe(1);
    });

    it('should increment by custom amount', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.update({ increment: 5 });
      expect(reporter.getProgress().current).toBe(5);
    });

    it('should track success count', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.update({ success: true });
      reporter.update({ success: true });
      expect(reporter.getProgress().successCount).toBe(2);
    });

    it('should track failed count', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.update({ success: false });
      expect(reporter.getProgress().failedCount).toBe(1);
    });

    it('should track skipped count', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.update({ skipped: true });
      expect(reporter.getProgress().skippedCount).toBe(1);
    });

    it('should not update when not running', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.update(); // Not started
      expect(reporter.getProgress().current).toBe(0);
    });

    it('should update message', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.update({ message: 'Processing item 1' });
      expect(reporter.getProgress().message).toBe('Processing item 1');
    });

    it('should update current item', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.update({ currentItem: 'item-1' });
      expect(reporter.getProgress().currentItem).toBe('item-1');
    });
  });

  describe('success/fail/skip shortcuts', () => {
    it('success should increment success count', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.success('Done', 'item-1');
      expect(reporter.getProgress().successCount).toBe(1);
      expect(reporter.getProgress().current).toBe(1);
    });

    it('fail should increment failed count', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.fail('Error', 'item-1');
      expect(reporter.getProgress().failedCount).toBe(1);
    });

    it('skip should increment skipped count', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.skip('Already done', 'item-1');
      expect(reporter.getProgress().skippedCount).toBe(1);
    });
  });

  describe('complete', () => {
    it('should set state to COMPLETED', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.complete();
      expect(reporter.getState()).toBe(ProgressState.COMPLETED);
    });

    it('should set current to total', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.update({ increment: 50 });
      reporter.complete();
      expect(reporter.getProgress().current).toBe(100);
    });

    it('should log completion message', () => {
      const reporter = new ProgressReporter(10, {
        autoLog: true,
        operationName: 'Test',
      });
      reporter.start();
      for (let i = 0; i < 10; i++) {
        reporter.success();
      }
      reporter.complete();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Completed'));
    });
  });

  describe('abort', () => {
    it('should set state to FAILED', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.abort('Error occurred');
      expect(reporter.getState()).toBe(ProgressState.FAILED);
    });

    it('should track error message', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.abort('Error occurred');
      const stats = reporter.getStatistics();
      expect(stats.errors).toContain('Error occurred');
    });
  });

  describe('cancel', () => {
    it('should set state to CANCELLED', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.cancel();
      expect(reporter.getState()).toBe(ProgressState.CANCELLED);
    });
  });

  describe('pause/resume', () => {
    it('pause should set state to PAUSED', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.pause();
      expect(reporter.getState()).toBe(ProgressState.PAUSED);
    });

    it('resume should set state back to RUNNING', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.pause();
      reporter.resume();
      expect(reporter.getState()).toBe(ProgressState.RUNNING);
    });
  });

  describe('getProgress', () => {
    it('should calculate percentage', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.update({ increment: 50 });
      expect(reporter.getProgress().percentage).toBe(50);
    });

    it('should track elapsed time', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      const progress = reporter.getProgress();
      expect(progress.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('should estimate remaining time', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.update({ increment: 10 });
      // Wait a bit for elapsed time
      const progress = reporter.getProgress();
      if (progress.estimatedRemainingMs !== undefined) {
        expect(progress.estimatedRemainingMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('getStatistics', () => {
    it('should return batch statistics', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.success();
      reporter.success();
      reporter.fail('Error');
      reporter.skip('Skip');
      reporter.complete();

      const stats = reporter.getStatistics();
      expect(stats.totalItems).toBe(100);
      expect(stats.successCount).toBe(2);
      expect(stats.failedCount).toBe(1);
      expect(stats.skippedCount).toBe(1);
      expect(stats.errors).toContain('Error');
    });

    it('should calculate success rate', () => {
      const reporter = new ProgressReporter(10, { autoLog: false });
      reporter.start();
      for (let i = 0; i < 9; i++) reporter.success();
      reporter.fail();
      reporter.complete();

      const stats = reporter.getStatistics();
      expect(stats.successRate).toBe(90);
    });
  });

  describe('isRunning/isComplete', () => {
    it('isRunning should return true when running', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      expect(reporter.isRunning()).toBe(false);
      reporter.start();
      expect(reporter.isRunning()).toBe(true);
    });

    it('isComplete should return true for terminal states', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      expect(reporter.isComplete()).toBe(false);
      reporter.complete();
      expect(reporter.isComplete()).toBe(true);
    });

    it('isComplete should be true for failed state', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.abort('Error');
      expect(reporter.isComplete()).toBe(true);
    });

    it('isComplete should be true for cancelled state', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.cancel();
      expect(reporter.isComplete()).toBe(true);
    });
  });

  describe('toString', () => {
    it('should return formatted progress string', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.update({ increment: 50 });
      const str = reporter.toString();
      expect(str).toContain('50/100');
      expect(str).toContain('50.0%');
    });
  });

  describe('toProgressBar', () => {
    it('should return progress bar string', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.update({ increment: 50 });
      const bar = reporter.toProgressBar(10);
      expect(bar).toContain('[');
      expect(bar).toContain(']');
      expect(bar).toContain('50.0%');
    });
  });

  describe('context', () => {
    it('should add context', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.addContext({ phase: 'extraction' });
      const progress = reporter.getProgress();
      expect(progress.context?.phase).toBe('extraction');
    });

    it('should merge context from updates', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.start();
      reporter.addContext({ phase: 'extraction' });
      reporter.update({ context: { step: 1 } });
      const progress = reporter.getProgress();
      expect(progress.context?.phase).toBe('extraction');
      expect(progress.context?.step).toBe(1);
    });

    it('should clear context', () => {
      const reporter = new ProgressReporter(100, { autoLog: false });
      reporter.addContext({ phase: 'extraction' });
      reporter.clearContext();
      const progress = reporter.getProgress();
      expect(progress.context).toBeUndefined();
    });
  });

  describe('onProgress callback', () => {
    it('should call onProgress on updates', () => {
      const onProgress = vi.fn();
      const reporter = new ProgressReporter(100, {
        autoLog: false,
        throttleMs: 0,
        onProgress,
      });

      reporter.start();
      reporter.update();

      expect(onProgress).toHaveBeenCalled();
    });

    it('should throttle callbacks', async () => {
      const onProgress = vi.fn();
      const reporter = new ProgressReporter(100, {
        autoLog: false,
        throttleMs: 100,
        onProgress,
      });

      reporter.start();
      reporter.update();
      reporter.update();
      reporter.update();

      // First call on start, then throttled
      expect(onProgress.mock.calls.length).toBeLessThanOrEqual(2);
    });
  });
});

describe('Factory functions', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('createProgressReporter', () => {
    it('should create reporter with total', () => {
      const reporter = createProgressReporter(100);
      expect(reporter.getProgress().total).toBe(100);
    });

    it('should accept options', () => {
      const reporter = createProgressReporter(100, {
        operationName: 'Test',
      });
      expect(reporter.getProgress().total).toBe(100);
    });
  });

  describe('createSilentProgressReporter', () => {
    it('should create reporter with autoLog disabled', () => {
      const reporter = createSilentProgressReporter(100);
      reporter.start();
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should accept onProgress callback', () => {
      const onProgress = vi.fn();
      const reporter = createSilentProgressReporter(100, onProgress);
      reporter.start();
      expect(onProgress).toHaveBeenCalled();
    });
  });

  describe('createVerboseProgressReporter', () => {
    it('should create reporter with autoLog enabled', () => {
      const reporter = createVerboseProgressReporter(100, 'Test');
      reporter.start();
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});

describe('MultiStageProgressReporter', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should accept stages', () => {
      const reporter = new MultiStageProgressReporter([
        { name: 'Stage 1', weight: 1, total: 100 },
        { name: 'Stage 2', weight: 1, total: 50 },
      ]);
      expect(reporter.getOverallProgress()).toBe(0);
    });
  });

  describe('start', () => {
    it('should set state to RUNNING', () => {
      const reporter = new MultiStageProgressReporter([
        { name: 'Stage 1', weight: 1, total: 100 },
      ]);
      reporter.start();
      expect(reporter.getProgress().state).toBe(ProgressState.RUNNING);
    });
  });

  describe('startStage', () => {
    it('should return a ProgressReporter for the stage', () => {
      const reporter = new MultiStageProgressReporter([
        { name: 'Stage 1', weight: 1, total: 100 },
        { name: 'Stage 2', weight: 1, total: 50 },
      ]);
      reporter.start();

      const stageReporter = reporter.startStage(0);
      expect(stageReporter).toBeInstanceOf(ProgressReporter);
    });

    it('should throw for invalid stage index', () => {
      const reporter = new MultiStageProgressReporter([
        { name: 'Stage 1', weight: 1, total: 100 },
      ]);
      reporter.start();

      expect(() => reporter.startStage(5)).toThrow();
    });
  });

  describe('getOverallProgress', () => {
    it('should calculate weighted progress', () => {
      const onProgress = vi.fn();
      const reporter = new MultiStageProgressReporter(
        [
          { name: 'Stage 1', weight: 1, total: 10 },
          { name: 'Stage 2', weight: 1, total: 10 },
        ],
        onProgress
      );

      reporter.start();

      // Complete stage 1 (50% of total with equal weights)
      const stage1 = reporter.startStage(0);
      for (let i = 0; i < 10; i++) {
        stage1.update();
      }
      stage1.complete();

      expect(reporter.getOverallProgress()).toBeCloseTo(50, 0);
    });

    it('should respect stage weights', () => {
      const reporter = new MultiStageProgressReporter([
        { name: 'Stage 1', weight: 3, total: 10 }, // 75% of total
        { name: 'Stage 2', weight: 1, total: 10 }, // 25% of total
      ]);

      reporter.start();

      // Complete stage 1
      const stage1 = reporter.startStage(0);
      for (let i = 0; i < 10; i++) {
        stage1.update();
      }
      stage1.complete();

      expect(reporter.getOverallProgress()).toBeCloseTo(75, 0);
    });
  });

  describe('getCurrentReporter', () => {
    it('should return current stage reporter', () => {
      const reporter = new MultiStageProgressReporter([
        { name: 'Stage 1', weight: 1, total: 100 },
      ]);
      reporter.start();

      const stageReporter = reporter.startStage(0);
      expect(reporter.getCurrentReporter()).toBe(stageReporter);
    });

    it('should return null before any stage starts', () => {
      const reporter = new MultiStageProgressReporter([
        { name: 'Stage 1', weight: 1, total: 100 },
      ]);
      expect(reporter.getCurrentReporter()).toBeNull();
    });
  });

  describe('complete', () => {
    it('should set all stages to 100%', () => {
      const reporter = new MultiStageProgressReporter([
        { name: 'Stage 1', weight: 1, total: 100 },
        { name: 'Stage 2', weight: 1, total: 50 },
      ]);

      reporter.start();
      reporter.complete();

      expect(reporter.getOverallProgress()).toBe(100);
      expect(reporter.getProgress().state).toBe(ProgressState.COMPLETED);
    });
  });
});

describe('createMultiStageProgressReporter', () => {
  it('should create multi-stage reporter', () => {
    const reporter = createMultiStageProgressReporter([
      { name: 'Stage 1', weight: 1, total: 100 },
      { name: 'Stage 2', weight: 1, total: 50 },
    ]);
    expect(reporter).toBeInstanceOf(MultiStageProgressReporter);
  });

  it('should accept onProgress callback', () => {
    const onProgress = vi.fn();
    const reporter = createMultiStageProgressReporter(
      [{ name: 'Stage 1', weight: 1, total: 10 }],
      onProgress
    );

    reporter.start();
    const stage = reporter.startStage(0);
    stage.update();

    expect(onProgress).toHaveBeenCalled();
  });
});
