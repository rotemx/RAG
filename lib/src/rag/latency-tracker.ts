/**
 * Latency Tracking Module for RAG Pipeline
 *
 * Provides utilities for tracking and logging latency across all phases
 * of the RAG pipeline (embedding, retrieval, generation).
 *
 * @example
 * ```typescript
 * import { LatencyTracker } from '@israeli-law-rag/lib';
 *
 * const tracker = new LatencyTracker('query-123');
 *
 * tracker.startPhase('embedding');
 * await embedQuery(query);
 * tracker.endPhase('embedding');
 *
 * tracker.startPhase('retrieval');
 * await searchVectors(embedding);
 * tracker.endPhase('retrieval');
 *
 * tracker.startPhase('generation');
 * await generateResponse(context);
 * tracker.endPhase('generation');
 *
 * const summary = tracker.getSummary();
 * console.log(summary);
 * // { totalMs: 1250, phases: { embedding: 50, retrieval: 200, generation: 1000 } }
 * ```
 */

import { z } from 'zod';
import { Logger, getGlobalLogger, LogLevel } from '../logging/index.js';

// =============================================================================
// Types & Schemas
// =============================================================================

/**
 * Phases in the RAG pipeline that can be tracked
 */
export const RAGPhase = {
  EMBEDDING: 'embedding',
  RETRIEVAL: 'retrieval',
  GENERATION: 'generation',
  PROMPT_BUILDING: 'promptBuilding',
  CACHE_LOOKUP: 'cacheLookup',
  TOTAL: 'total',
} as const;

export type RAGPhase = (typeof RAGPhase)[keyof typeof RAGPhase];

/**
 * Schema for a single phase timing
 */
export const PhaseTimingSchema = z.object({
  /** Phase name */
  phase: z.string(),
  /** Start time (high-resolution) */
  startMs: z.number(),
  /** End time (high-resolution), undefined if still running */
  endMs: z.number().optional(),
  /** Duration in milliseconds */
  durationMs: z.number().optional(),
  /** Whether this phase was cached/skipped */
  cached: z.boolean().default(false),
  /** Additional metadata for this phase */
  metadata: z.record(z.unknown()).optional(),
});

export type PhaseTiming = z.infer<typeof PhaseTimingSchema>;

/**
 * Schema for latency summary
 */
export const LatencySummarySchema = z.object({
  /** Request/query identifier */
  requestId: z.string(),
  /** Total pipeline duration in milliseconds */
  totalMs: z.number(),
  /** Individual phase timings */
  phases: z.record(z.number()),
  /** Phases that were cached/skipped */
  cachedPhases: z.array(z.string()),
  /** Timestamp when tracking started */
  startedAt: z.date(),
  /** Timestamp when tracking completed */
  completedAt: z.date().optional(),
  /** Additional metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type LatencySummary = z.infer<typeof LatencySummarySchema>;

/**
 * Schema for latency thresholds used in logging
 */
export const LatencyThresholdsSchema = z.object({
  /** Warn if embedding takes longer than this (ms) */
  embeddingWarnMs: z.number().default(100),
  /** Warn if retrieval takes longer than this (ms) */
  retrievalWarnMs: z.number().default(500),
  /** Warn if generation takes longer than this (ms) */
  generationWarnMs: z.number().default(5000),
  /** Warn if total pipeline takes longer than this (ms) */
  totalWarnMs: z.number().default(10000),
  /** Error if total pipeline takes longer than this (ms) */
  totalErrorMs: z.number().default(30000),
});

export type LatencyThresholds = z.infer<typeof LatencyThresholdsSchema>;

/**
 * Schema for latency tracker configuration
 */
export const LatencyTrackerConfigSchema = z.object({
  /** Logger instance to use (uses global logger if not provided) */
  logger: z.any().optional(),
  /** Log level for phase start/end events */
  logLevel: z.nativeEnum(LogLevel).default(LogLevel.DEBUG),
  /** Log level for summary output */
  summaryLogLevel: z.nativeEnum(LogLevel).default(LogLevel.INFO),
  /** Whether to log phase events */
  logPhaseEvents: z.boolean().default(true),
  /** Whether to log summary on complete */
  logSummaryOnComplete: z.boolean().default(true),
  /** Latency thresholds for warning/error logging */
  thresholds: LatencyThresholdsSchema.optional(),
  /** Additional metadata to include in all log entries */
  defaultMetadata: z.record(z.unknown()).optional(),
});

export type LatencyTrackerConfig = z.infer<typeof LatencyTrackerConfigSchema>;

/**
 * Default latency thresholds
 */
export const DEFAULT_LATENCY_THRESHOLDS: LatencyThresholds = {
  embeddingWarnMs: 100,
  retrievalWarnMs: 500,
  generationWarnMs: 5000,
  totalWarnMs: 10000,
  totalErrorMs: 30000,
};

// =============================================================================
// LatencyTracker Class
// =============================================================================

/**
 * Tracks latency across multiple phases of the RAG pipeline.
 *
 * Features:
 * - Phase-based timing (embedding, retrieval, generation)
 * - Automatic logging with configurable thresholds
 * - Support for nested/overlapping phases
 * - Cache hit tracking
 * - Summary generation
 */
export class LatencyTracker {
  private readonly requestId: string;
  private readonly config: LatencyTrackerConfig;
  private readonly logger: Logger;
  private readonly phases: Map<string, PhaseTiming> = new Map();
  private readonly startTime: number;
  private readonly startedAt: Date;
  private completedAt?: Date;
  private metadata: Record<string, unknown> = {};

  constructor(requestId: string, config?: Partial<LatencyTrackerConfig>) {
    this.requestId = requestId;
    this.config = LatencyTrackerConfigSchema.parse(config ?? {});
    this.logger = (this.config.logger as Logger | undefined) ?? getGlobalLogger().child('LatencyTracker');
    this.startTime = performance.now();
    this.startedAt = new Date();

    if (this.config.defaultMetadata) {
      this.metadata = { ...this.config.defaultMetadata };
    }

    this.logPhaseEvent('trace', 'Latency tracking started', {
      requestId: this.requestId,
    });
  }

  /**
   * Start timing a phase
   */
  startPhase(phase: string, metadata?: Record<string, unknown>): void {
    const timing: PhaseTiming = {
      phase,
      startMs: performance.now(),
      cached: false,
      metadata,
    };
    this.phases.set(phase, timing);

    if (this.config.logPhaseEvents) {
      this.logPhaseEvent('debug', `Phase "${phase}" started`, {
        requestId: this.requestId,
        phase,
        elapsedMs: this.getElapsedMs(),
        ...metadata,
      });
    }
  }

  /**
   * End timing a phase
   */
  endPhase(phase: string, metadata?: Record<string, unknown>): number {
    const timing = this.phases.get(phase);
    if (!timing) {
      this.logger.warn(`Attempted to end unknown phase: ${phase}`, {
        requestId: this.requestId,
        phase,
      });
      return 0;
    }

    timing.endMs = performance.now();
    timing.durationMs = timing.endMs - timing.startMs;

    if (metadata) {
      timing.metadata = { ...timing.metadata, ...metadata };
    }

    if (this.config.logPhaseEvents) {
      const logLevel = this.getPhaseLogLevel(phase, timing.durationMs);
      this.logPhaseEvent(logLevel, `Phase "${phase}" completed`, {
        requestId: this.requestId,
        phase,
        durationMs: Math.round(timing.durationMs * 100) / 100,
        cached: timing.cached,
        ...timing.metadata,
      });
    }

    return timing.durationMs;
  }

  /**
   * Mark a phase as cached/skipped (didn't need to execute)
   */
  markCached(phase: string, metadata?: Record<string, unknown>): void {
    const timing = this.phases.get(phase);
    if (timing) {
      timing.cached = true;
      timing.durationMs = 0;
      timing.endMs = timing.startMs;
      if (metadata) {
        timing.metadata = { ...timing.metadata, ...metadata };
      }
    } else {
      // Create a cached phase entry
      this.phases.set(phase, {
        phase,
        startMs: performance.now(),
        endMs: performance.now(),
        durationMs: 0,
        cached: true,
        metadata,
      });
    }

    if (this.config.logPhaseEvents) {
      this.logPhaseEvent('debug', `Phase "${phase}" skipped (cached)`, {
        requestId: this.requestId,
        phase,
        cached: true,
        ...metadata,
      });
    }
  }

  /**
   * Time a phase using a function wrapper
   */
  async timePhase<T>(
    phase: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    this.startPhase(phase, metadata);
    try {
      const result = await fn();
      this.endPhase(phase);
      return result;
    } catch (error) {
      this.endPhase(phase, { error: true });
      throw error;
    }
  }

  /**
   * Time a synchronous phase using a function wrapper
   */
  timePhaseSync<T>(
    phase: string,
    fn: () => T,
    metadata?: Record<string, unknown>
  ): T {
    this.startPhase(phase, metadata);
    try {
      const result = fn();
      this.endPhase(phase);
      return result;
    } catch (error) {
      this.endPhase(phase, { error: true });
      throw error;
    }
  }

  /**
   * Get the duration of a specific phase
   */
  getPhaseDuration(phase: string): number | undefined {
    return this.phases.get(phase)?.durationMs;
  }

  /**
   * Get whether a phase was cached
   */
  isPhaseCached(phase: string): boolean {
    return this.phases.get(phase)?.cached ?? false;
  }

  /**
   * Get elapsed time since tracking started
   */
  getElapsedMs(): number {
    return performance.now() - this.startTime;
  }

  /**
   * Add metadata to the tracker
   */
  addMetadata(metadata: Record<string, unknown>): void {
    this.metadata = { ...this.metadata, ...metadata };
  }

  /**
   * Complete tracking and generate summary
   */
  complete(): LatencySummary {
    this.completedAt = new Date();
    const totalMs = this.getElapsedMs();

    const phases: Record<string, number> = {};
    const cachedPhases: string[] = [];

    for (const [name, timing] of this.phases) {
      phases[name] = timing.durationMs ?? 0;
      if (timing.cached) {
        cachedPhases.push(name);
      }
    }

    const summary: LatencySummary = {
      requestId: this.requestId,
      totalMs: Math.round(totalMs * 100) / 100,
      phases,
      cachedPhases,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      metadata: Object.keys(this.metadata).length > 0 ? this.metadata : undefined,
    };

    if (this.config.logSummaryOnComplete) {
      this.logSummary(summary);
    }

    return summary;
  }

  /**
   * Get current summary without completing
   */
  getSummary(): LatencySummary {
    const totalMs = this.getElapsedMs();

    const phases: Record<string, number> = {};
    const cachedPhases: string[] = [];

    for (const [name, timing] of this.phases) {
      phases[name] = timing.durationMs ?? (performance.now() - timing.startMs);
      if (timing.cached) {
        cachedPhases.push(name);
      }
    }

    return {
      requestId: this.requestId,
      totalMs: Math.round(totalMs * 100) / 100,
      phases,
      cachedPhases,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      metadata: Object.keys(this.metadata).length > 0 ? this.metadata : undefined,
    };
  }

  /**
   * Get the request ID
   */
  getRequestId(): string {
    return this.requestId;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private logPhaseEvent(
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error',
    message: string,
    context: Record<string, unknown>
  ): void {
    switch (level) {
      case 'trace':
        this.logger.trace(message, context);
        break;
      case 'debug':
        this.logger.debug(message, context);
        break;
      case 'info':
        this.logger.info(message, context);
        break;
      case 'warn':
        this.logger.warn(message, context);
        break;
      case 'error':
        this.logger.error(message, context);
        break;
    }
  }

  private getPhaseLogLevel(phase: string, durationMs: number): 'debug' | 'info' | 'warn' | 'error' {
    const thresholds = this.config.thresholds ?? DEFAULT_LATENCY_THRESHOLDS;

    switch (phase) {
      case RAGPhase.EMBEDDING:
        if (durationMs > thresholds.embeddingWarnMs) return 'warn';
        break;
      case RAGPhase.RETRIEVAL:
        if (durationMs > thresholds.retrievalWarnMs) return 'warn';
        break;
      case RAGPhase.GENERATION:
        if (durationMs > thresholds.generationWarnMs) return 'warn';
        break;
    }

    return 'debug';
  }

  private logSummary(summary: LatencySummary): void {
    const thresholds = this.config.thresholds ?? DEFAULT_LATENCY_THRESHOLDS;

    let level: 'info' | 'warn' | 'error' = 'info';
    if (summary.totalMs > thresholds.totalErrorMs) {
      level = 'error';
    } else if (summary.totalMs > thresholds.totalWarnMs) {
      level = 'warn';
    }

    const context = {
      requestId: summary.requestId,
      totalMs: summary.totalMs,
      embeddingMs: summary.phases[RAGPhase.EMBEDDING] ?? 0,
      retrievalMs: summary.phases[RAGPhase.RETRIEVAL] ?? 0,
      generationMs: summary.phases[RAGPhase.GENERATION] ?? 0,
      cachedPhases: summary.cachedPhases.length > 0 ? summary.cachedPhases : undefined,
      ...summary.metadata,
    };

    const message = `RAG pipeline completed in ${summary.totalMs.toFixed(0)}ms`;

    switch (level) {
      case 'error':
        this.logger.error(message, context);
        break;
      case 'warn':
        this.logger.warn(message, context);
        break;
      case 'info':
        this.logger.info(message, context);
        break;
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new latency tracker
 */
export function createLatencyTracker(
  requestId: string,
  config?: Partial<LatencyTrackerConfig>
): LatencyTracker {
  return new LatencyTracker(requestId, config);
}

/**
 * Create a latency tracker with custom thresholds
 */
export function createLatencyTrackerWithThresholds(
  requestId: string,
  thresholds: Partial<LatencyThresholds>,
  config?: Partial<Omit<LatencyTrackerConfig, 'thresholds'>>
): LatencyTracker {
  return new LatencyTracker(requestId, {
    ...config,
    thresholds: { ...DEFAULT_LATENCY_THRESHOLDS, ...thresholds },
  });
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format a latency summary as a human-readable string
 */
export function formatLatencySummary(summary: LatencySummary): string {
  const lines: string[] = [
    `Latency Summary for ${summary.requestId}:`,
    `  Total: ${summary.totalMs.toFixed(2)}ms`,
  ];

  // Add phase timings
  const phaseOrder: string[] = [
    RAGPhase.EMBEDDING,
    RAGPhase.RETRIEVAL,
    RAGPhase.GENERATION,
    RAGPhase.PROMPT_BUILDING,
    RAGPhase.CACHE_LOOKUP,
  ];

  for (const phase of phaseOrder) {
    if (phase in summary.phases) {
      const duration = summary.phases[phase];
      const cached = summary.cachedPhases.includes(phase) ? ' (cached)' : '';
      lines.push(`  ${phase}: ${duration?.toFixed(2) ?? '0.00'}ms${cached}`);
    }
  }

  // Add any other phases
  for (const [phase, duration] of Object.entries(summary.phases)) {
    if (!phaseOrder.includes(phase)) {
      const cached = summary.cachedPhases.includes(phase) ? ' (cached)' : '';
      lines.push(`  ${phase}: ${duration.toFixed(2)}ms${cached}`);
    }
  }

  return lines.join('\n');
}

/**
 * Calculate the percentage of time spent in each phase
 */
export function calculatePhasePercentages(
  summary: LatencySummary
): Record<string, number> {
  const percentages: Record<string, number> = {};

  for (const [phase, duration] of Object.entries(summary.phases)) {
    percentages[phase] = summary.totalMs > 0
      ? Math.round((duration / summary.totalMs) * 100)
      : 0;
  }

  return percentages;
}

/**
 * Check if any phases exceeded their thresholds
 */
export function checkLatencyThresholds(
  summary: LatencySummary,
  thresholds?: Partial<LatencyThresholds>
): { exceeded: boolean; violations: Array<{ phase: string; duration: number; threshold: number }> } {
  const t = { ...DEFAULT_LATENCY_THRESHOLDS, ...thresholds };
  const violations: Array<{ phase: string; duration: number; threshold: number }> = [];

  const checks: Array<[string, number, number]> = [
    [RAGPhase.EMBEDDING, summary.phases[RAGPhase.EMBEDDING] ?? 0, t.embeddingWarnMs],
    [RAGPhase.RETRIEVAL, summary.phases[RAGPhase.RETRIEVAL] ?? 0, t.retrievalWarnMs],
    [RAGPhase.GENERATION, summary.phases[RAGPhase.GENERATION] ?? 0, t.generationWarnMs],
    [RAGPhase.TOTAL, summary.totalMs, t.totalWarnMs],
  ];

  for (const [phase, duration, threshold] of checks) {
    if (duration > threshold) {
      violations.push({ phase, duration, threshold });
    }
  }

  return {
    exceeded: violations.length > 0,
    violations,
  };
}

/**
 * Aggregate multiple latency summaries for statistics
 */
export function aggregateLatencySummaries(
  summaries: LatencySummary[]
): {
  count: number;
  avgTotalMs: number;
  minTotalMs: number;
  maxTotalMs: number;
  avgPhases: Record<string, number>;
  cacheHitRate: Record<string, number>;
} {
  if (summaries.length === 0) {
    return {
      count: 0,
      avgTotalMs: 0,
      minTotalMs: 0,
      maxTotalMs: 0,
      avgPhases: {},
      cacheHitRate: {},
    };
  }

  const phaseTotals: Record<string, number[]> = {};
  const phaseCacheHits: Record<string, number> = {};
  const phaseCounts: Record<string, number> = {};
  const totalMs: number[] = [];

  for (const summary of summaries) {
    totalMs.push(summary.totalMs);

    for (const [phase, duration] of Object.entries(summary.phases)) {
      if (!phaseTotals[phase]) {
        phaseTotals[phase] = [];
        phaseCacheHits[phase] = 0;
        phaseCounts[phase] = 0;
      }
      const phaseArray = phaseTotals[phase];
      if (phaseArray) {
        phaseArray.push(duration);
      }
      const currentCount = phaseCounts[phase];
      if (currentCount !== undefined) {
        phaseCounts[phase] = currentCount + 1;
      }

      if (summary.cachedPhases.includes(phase)) {
        const currentHits = phaseCacheHits[phase];
        if (currentHits !== undefined) {
          phaseCacheHits[phase] = currentHits + 1;
        }
      }
    }
  }

  const avgPhases: Record<string, number> = {};
  const cacheHitRate: Record<string, number> = {};

  for (const [phase, durations] of Object.entries(phaseTotals)) {
    avgPhases[phase] = durations.reduce((a, b) => a + b, 0) / durations.length;
    const hits = phaseCacheHits[phase] ?? 0;
    const counts = phaseCounts[phase] ?? 1;
    cacheHitRate[phase] = (hits / counts) * 100;
  }

  return {
    count: summaries.length,
    avgTotalMs: totalMs.reduce((a, b) => a + b, 0) / totalMs.length,
    minTotalMs: Math.min(...totalMs),
    maxTotalMs: Math.max(...totalMs),
    avgPhases,
    cacheHitRate,
  };
}
