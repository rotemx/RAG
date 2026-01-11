/**
 * Tests for LatencyTracker class
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LatencyTracker,
  RAGPhase,
  createLatencyTracker,
  createLatencyTrackerWithThresholds,
  formatLatencySummary,
  calculatePhasePercentages,
  checkLatencyThresholds,
  aggregateLatencySummaries,
  DEFAULT_LATENCY_THRESHOLDS,
  type LatencySummary,
} from '../../lib/src/rag/latency-tracker.js';
import { Logger, LogLevel } from '../../lib/src/logging/index.js';

describe('LatencyTracker', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create tracker with request ID', () => {
      const tracker = new LatencyTracker('test-123');
      expect(tracker.getRequestId()).toBe('test-123');
    });

    it('should accept custom config', () => {
      const logger = new Logger({ level: LogLevel.TRACE });
      const tracker = new LatencyTracker('test-123', {
        logger,
        logPhaseEvents: true,
        logSummaryOnComplete: false,
      });
      expect(tracker.getRequestId()).toBe('test-123');
    });
  });

  describe('phase tracking', () => {
    it('should track a single phase', () => {
      const tracker = new LatencyTracker('test-123', {
        logPhaseEvents: false,
        logSummaryOnComplete: false,
      });

      tracker.startPhase('embedding');
      // Simulate some work
      const duration = tracker.endPhase('embedding');

      expect(duration).toBeGreaterThanOrEqual(0);
      expect(tracker.getPhaseDuration('embedding')).toBe(duration);
    });

    it('should track multiple phases', () => {
      const tracker = new LatencyTracker('test-123', {
        logPhaseEvents: false,
        logSummaryOnComplete: false,
      });

      tracker.startPhase(RAGPhase.EMBEDDING);
      tracker.endPhase(RAGPhase.EMBEDDING);

      tracker.startPhase(RAGPhase.RETRIEVAL);
      tracker.endPhase(RAGPhase.RETRIEVAL);

      tracker.startPhase(RAGPhase.GENERATION);
      tracker.endPhase(RAGPhase.GENERATION);

      const summary = tracker.getSummary();

      expect(Object.keys(summary.phases)).toHaveLength(3);
      expect(summary.phases[RAGPhase.EMBEDDING]).toBeGreaterThanOrEqual(0);
      expect(summary.phases[RAGPhase.RETRIEVAL]).toBeGreaterThanOrEqual(0);
      expect(summary.phases[RAGPhase.GENERATION]).toBeGreaterThanOrEqual(0);
    });

    it('should handle ending unknown phase gracefully', () => {
      const tracker = new LatencyTracker('test-123', {
        logPhaseEvents: false,
        logSummaryOnComplete: false,
      });

      const duration = tracker.endPhase('unknown-phase');
      expect(duration).toBe(0);
    });
  });

  describe('cache marking', () => {
    it('should mark a phase as cached', () => {
      const tracker = new LatencyTracker('test-123', {
        logPhaseEvents: false,
        logSummaryOnComplete: false,
      });

      tracker.startPhase(RAGPhase.EMBEDDING);
      tracker.markCached(RAGPhase.EMBEDDING);

      expect(tracker.isPhaseCached(RAGPhase.EMBEDDING)).toBe(true);
      expect(tracker.getPhaseDuration(RAGPhase.EMBEDDING)).toBe(0);
    });

    it('should mark a phase as cached without prior start', () => {
      const tracker = new LatencyTracker('test-123', {
        logPhaseEvents: false,
        logSummaryOnComplete: false,
      });

      tracker.markCached(RAGPhase.EMBEDDING);

      expect(tracker.isPhaseCached(RAGPhase.EMBEDDING)).toBe(true);
      const summary = tracker.complete();
      expect(summary.cachedPhases).toContain(RAGPhase.EMBEDDING);
    });
  });

  describe('timePhase', () => {
    it('should time an async function', async () => {
      const tracker = new LatencyTracker('test-123', {
        logPhaseEvents: false,
        logSummaryOnComplete: false,
      });

      const result = await tracker.timePhase('embedding', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'result';
      });

      expect(result).toBe('result');
      expect(tracker.getPhaseDuration('embedding')).toBeGreaterThanOrEqual(10);
    });

    it('should handle errors in async function', async () => {
      const tracker = new LatencyTracker('test-123', {
        logPhaseEvents: false,
        logSummaryOnComplete: false,
      });

      await expect(
        tracker.timePhase('embedding', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      expect(tracker.getPhaseDuration('embedding')).toBeGreaterThanOrEqual(0);
    });
  });

  describe('timePhaseSync', () => {
    it('should time a sync function', () => {
      const tracker = new LatencyTracker('test-123', {
        logPhaseEvents: false,
        logSummaryOnComplete: false,
      });

      const result = tracker.timePhaseSync('prompt', () => {
        return 'prompt-result';
      });

      expect(result).toBe('prompt-result');
      expect(tracker.getPhaseDuration('prompt')).toBeGreaterThanOrEqual(0);
    });
  });

  describe('summary', () => {
    it('should generate correct summary', () => {
      const tracker = new LatencyTracker('test-123', {
        logPhaseEvents: false,
        logSummaryOnComplete: false,
      });

      tracker.startPhase(RAGPhase.EMBEDDING);
      tracker.endPhase(RAGPhase.EMBEDDING);

      tracker.startPhase(RAGPhase.RETRIEVAL);
      tracker.endPhase(RAGPhase.RETRIEVAL);

      tracker.addMetadata({ query: 'test query' });

      const summary = tracker.complete();

      expect(summary.requestId).toBe('test-123');
      expect(summary.totalMs).toBeGreaterThanOrEqual(0);
      expect(summary.phases).toHaveProperty(RAGPhase.EMBEDDING);
      expect(summary.phases).toHaveProperty(RAGPhase.RETRIEVAL);
      expect(summary.startedAt).toBeInstanceOf(Date);
      expect(summary.completedAt).toBeInstanceOf(Date);
      expect(summary.metadata).toEqual({ query: 'test query' });
    });

    it('should return ongoing summary with getSummary', () => {
      const tracker = new LatencyTracker('test-123', {
        logPhaseEvents: false,
        logSummaryOnComplete: false,
      });

      tracker.startPhase(RAGPhase.EMBEDDING);
      const summary = tracker.getSummary();

      expect(summary.requestId).toBe('test-123');
      expect(summary.completedAt).toBeUndefined();
    });
  });

  describe('elapsed time', () => {
    it('should track elapsed time', async () => {
      const tracker = new LatencyTracker('test-123', {
        logPhaseEvents: false,
        logSummaryOnComplete: false,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      const elapsed = tracker.getElapsedMs();

      expect(elapsed).toBeGreaterThanOrEqual(10);
    });
  });

  describe('logging', () => {
    it('should log phase events when enabled', () => {
      const outputSpy = vi.fn();
      const logger = new Logger({
        level: LogLevel.TRACE,
        console: false,
        output: outputSpy,
      });

      const tracker = new LatencyTracker('test-123', {
        logger,
        logPhaseEvents: true,
        logSummaryOnComplete: false,
      });

      tracker.startPhase(RAGPhase.EMBEDDING);
      tracker.endPhase(RAGPhase.EMBEDDING);

      expect(outputSpy).toHaveBeenCalled();
    });

    it('should log summary on complete when enabled', () => {
      const outputSpy = vi.fn();
      const logger = new Logger({
        level: LogLevel.INFO,
        console: false,
        output: outputSpy,
      });

      const tracker = new LatencyTracker('test-123', {
        logger,
        logPhaseEvents: false,
        logSummaryOnComplete: true,
      });

      tracker.startPhase(RAGPhase.EMBEDDING);
      tracker.endPhase(RAGPhase.EMBEDDING);
      tracker.complete();

      expect(outputSpy).toHaveBeenCalled();
    });
  });
});

describe('RAGPhase constants', () => {
  it('should have all expected phases', () => {
    expect(RAGPhase.EMBEDDING).toBe('embedding');
    expect(RAGPhase.RETRIEVAL).toBe('retrieval');
    expect(RAGPhase.GENERATION).toBe('generation');
    expect(RAGPhase.PROMPT_BUILDING).toBe('promptBuilding');
    expect(RAGPhase.CACHE_LOOKUP).toBe('cacheLookup');
    expect(RAGPhase.TOTAL).toBe('total');
  });
});

describe('createLatencyTracker', () => {
  it('should create a tracker with factory function', () => {
    const tracker = createLatencyTracker('test-123', {
      logPhaseEvents: false,
      logSummaryOnComplete: false,
    });

    expect(tracker).toBeInstanceOf(LatencyTracker);
    expect(tracker.getRequestId()).toBe('test-123');
  });
});

describe('createLatencyTrackerWithThresholds', () => {
  it('should create a tracker with custom thresholds', () => {
    const tracker = createLatencyTrackerWithThresholds(
      'test-123',
      { embeddingWarnMs: 50 },
      {
        logPhaseEvents: false,
        logSummaryOnComplete: false,
      }
    );

    expect(tracker).toBeInstanceOf(LatencyTracker);
  });
});

describe('formatLatencySummary', () => {
  it('should format summary as readable string', () => {
    const summary: LatencySummary = {
      requestId: 'test-123',
      totalMs: 1250.5,
      phases: {
        [RAGPhase.EMBEDDING]: 50.25,
        [RAGPhase.RETRIEVAL]: 200.1,
        [RAGPhase.GENERATION]: 1000.15,
      },
      cachedPhases: [RAGPhase.EMBEDDING],
      startedAt: new Date(),
    };

    const formatted = formatLatencySummary(summary);

    expect(formatted).toContain('test-123');
    expect(formatted).toContain('1250.50ms');
    expect(formatted).toContain('embedding');
    expect(formatted).toContain('(cached)');
    expect(formatted).toContain('retrieval');
    expect(formatted).toContain('generation');
  });
});

describe('calculatePhasePercentages', () => {
  it('should calculate correct percentages', () => {
    const summary: LatencySummary = {
      requestId: 'test-123',
      totalMs: 100,
      phases: {
        [RAGPhase.EMBEDDING]: 10,
        [RAGPhase.RETRIEVAL]: 30,
        [RAGPhase.GENERATION]: 60,
      },
      cachedPhases: [],
      startedAt: new Date(),
    };

    const percentages = calculatePhasePercentages(summary);

    expect(percentages[RAGPhase.EMBEDDING]).toBe(10);
    expect(percentages[RAGPhase.RETRIEVAL]).toBe(30);
    expect(percentages[RAGPhase.GENERATION]).toBe(60);
  });

  it('should handle zero total time', () => {
    const summary: LatencySummary = {
      requestId: 'test-123',
      totalMs: 0,
      phases: {
        [RAGPhase.EMBEDDING]: 0,
      },
      cachedPhases: [],
      startedAt: new Date(),
    };

    const percentages = calculatePhasePercentages(summary);
    expect(percentages[RAGPhase.EMBEDDING]).toBe(0);
  });
});

describe('checkLatencyThresholds', () => {
  it('should detect no violations', () => {
    const summary: LatencySummary = {
      requestId: 'test-123',
      totalMs: 500,
      phases: {
        [RAGPhase.EMBEDDING]: 50,
        [RAGPhase.RETRIEVAL]: 100,
        [RAGPhase.GENERATION]: 300,
      },
      cachedPhases: [],
      startedAt: new Date(),
    };

    const result = checkLatencyThresholds(summary);

    expect(result.exceeded).toBe(false);
    expect(result.violations).toHaveLength(0);
  });

  it('should detect threshold violations', () => {
    const summary: LatencySummary = {
      requestId: 'test-123',
      totalMs: 15000,
      phases: {
        [RAGPhase.EMBEDDING]: 200, // > default 100ms
        [RAGPhase.RETRIEVAL]: 1000, // > default 500ms
        [RAGPhase.GENERATION]: 10000, // > default 5000ms
      },
      cachedPhases: [],
      startedAt: new Date(),
    };

    const result = checkLatencyThresholds(summary);

    expect(result.exceeded).toBe(true);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('should use custom thresholds', () => {
    const summary: LatencySummary = {
      requestId: 'test-123',
      totalMs: 500,
      phases: {
        [RAGPhase.EMBEDDING]: 60,
      },
      cachedPhases: [],
      startedAt: new Date(),
    };

    const result = checkLatencyThresholds(summary, { embeddingWarnMs: 50 });

    expect(result.exceeded).toBe(true);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        phase: RAGPhase.EMBEDDING,
        threshold: 50,
      })
    );
  });
});

describe('aggregateLatencySummaries', () => {
  it('should aggregate multiple summaries', () => {
    const summaries: LatencySummary[] = [
      {
        requestId: 'test-1',
        totalMs: 100,
        phases: { [RAGPhase.EMBEDDING]: 20, [RAGPhase.RETRIEVAL]: 80 },
        cachedPhases: [RAGPhase.EMBEDDING],
        startedAt: new Date(),
      },
      {
        requestId: 'test-2',
        totalMs: 200,
        phases: { [RAGPhase.EMBEDDING]: 40, [RAGPhase.RETRIEVAL]: 160 },
        cachedPhases: [],
        startedAt: new Date(),
      },
    ];

    const aggregated = aggregateLatencySummaries(summaries);

    expect(aggregated.count).toBe(2);
    expect(aggregated.avgTotalMs).toBe(150);
    expect(aggregated.minTotalMs).toBe(100);
    expect(aggregated.maxTotalMs).toBe(200);
    expect(aggregated.avgPhases[RAGPhase.EMBEDDING]).toBe(30);
    expect(aggregated.avgPhases[RAGPhase.RETRIEVAL]).toBe(120);
    expect(aggregated.cacheHitRate[RAGPhase.EMBEDDING]).toBe(50); // 1 of 2 cached
  });

  it('should handle empty array', () => {
    const aggregated = aggregateLatencySummaries([]);

    expect(aggregated.count).toBe(0);
    expect(aggregated.avgTotalMs).toBe(0);
    expect(aggregated.avgPhases).toEqual({});
  });
});

describe('DEFAULT_LATENCY_THRESHOLDS', () => {
  it('should have expected default values', () => {
    expect(DEFAULT_LATENCY_THRESHOLDS.embeddingWarnMs).toBe(100);
    expect(DEFAULT_LATENCY_THRESHOLDS.retrievalWarnMs).toBe(500);
    expect(DEFAULT_LATENCY_THRESHOLDS.generationWarnMs).toBe(5000);
    expect(DEFAULT_LATENCY_THRESHOLDS.totalWarnMs).toBe(10000);
    expect(DEFAULT_LATENCY_THRESHOLDS.totalErrorMs).toBe(30000);
  });
});
