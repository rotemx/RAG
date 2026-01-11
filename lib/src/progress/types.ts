/**
 * Progress Reporting Types and Schemas
 *
 * TypeScript type definitions for progress reporting in batch processing operations.
 * Designed for tracking PDF processing, embedding generation, and other long-running tasks.
 */

import { z } from 'zod';

// =============================================================================
// Progress State
// =============================================================================

/**
 * State of a progress operation
 */
export const ProgressState = {
  /** Not yet started */
  PENDING: 'pending',
  /** Currently running */
  RUNNING: 'running',
  /** Successfully completed */
  COMPLETED: 'completed',
  /** Failed with error */
  FAILED: 'failed',
  /** Cancelled by user */
  CANCELLED: 'cancelled',
  /** Paused */
  PAUSED: 'paused',
} as const;

export type ProgressState = (typeof ProgressState)[keyof typeof ProgressState];

/**
 * Zod schema for progress state validation
 */
export const ProgressStateSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
  'paused',
]);

// =============================================================================
// Progress Entry
// =============================================================================

/**
 * A single progress entry representing the state of a task
 */
export const ProgressEntrySchema = z.object({
  /** Current count of processed items */
  current: z.number().int().nonnegative(),

  /** Total count of items to process */
  total: z.number().int().nonnegative(),

  /** Percentage complete (0-100) */
  percentage: z.number().min(0).max(100),

  /** Current state of the operation */
  state: ProgressStateSchema,

  /** Human-readable status message */
  message: z.string().optional(),

  /** Start time of the operation */
  startTime: z.date(),

  /** End time of the operation (if completed) */
  endTime: z.date().optional(),

  /** Elapsed time in milliseconds */
  elapsedMs: z.number().nonnegative(),

  /** Estimated time remaining in milliseconds */
  estimatedRemainingMs: z.number().nonnegative().optional(),

  /** Average time per item in milliseconds */
  avgTimePerItemMs: z.number().nonnegative().optional(),

  /** Items processed per second */
  itemsPerSecond: z.number().nonnegative().optional(),

  /** Number of successful items */
  successCount: z.number().int().nonnegative().default(0),

  /** Number of failed items */
  failedCount: z.number().int().nonnegative().default(0),

  /** Number of skipped items */
  skippedCount: z.number().int().nonnegative().default(0),

  /** Current item being processed */
  currentItem: z.string().optional(),

  /** Optional context/metadata */
  context: z.record(z.unknown()).optional(),
});

export type ProgressEntry = z.infer<typeof ProgressEntrySchema>;

// =============================================================================
// Progress Reporter Configuration
// =============================================================================

/**
 * Configuration for progress reporting
 */
export const ProgressReporterConfigSchema = z.object({
  /**
   * Total number of items to process
   */
  total: z.number().int().nonnegative(),

  /**
   * Callback to call on progress updates
   */
  onProgress: z
    .function()
    .args(ProgressEntrySchema)
    .returns(z.void())
    .optional(),

  /**
   * Minimum interval between progress callbacks in milliseconds
   * @default 100
   */
  throttleMs: z.number().int().nonnegative().default(100),

  /**
   * Whether to automatically log progress updates
   * @default true
   */
  autoLog: z.boolean().default(true),

  /**
   * Log interval in percentage points (e.g., 10 = log every 10%)
   * @default 10
   */
  logIntervalPercent: z.number().min(1).max(100).default(10),

  /**
   * Optional name for the operation (used in logs)
   */
  operationName: z.string().optional(),
});

export type ProgressReporterConfig = z.infer<typeof ProgressReporterConfigSchema>;

/**
 * Create a default progress reporter configuration
 */
export function createDefaultProgressConfig(
  total: number,
  overrides?: Partial<Omit<ProgressReporterConfig, 'total'>>
): ProgressReporterConfig {
  return ProgressReporterConfigSchema.parse({ total, ...overrides });
}

// =============================================================================
// Progress Update Input
// =============================================================================

/**
 * Input for updating progress
 */
export const ProgressUpdateSchema = z.object({
  /** Increment by this amount (default: 1) */
  increment: z.number().int().positive().default(1),

  /** Whether this item succeeded */
  success: z.boolean().default(true),

  /** Whether this item was skipped */
  skipped: z.boolean().default(false),

  /** Optional message for this update */
  message: z.string().optional(),

  /** Optional identifier for the current item */
  currentItem: z.string().optional(),

  /** Optional context to merge */
  context: z.record(z.unknown()).optional(),
});

export type ProgressUpdate = z.infer<typeof ProgressUpdateSchema>;

// =============================================================================
// Batch Statistics
// =============================================================================

/**
 * Statistics for a batch operation
 */
export const BatchStatisticsSchema = z.object({
  /** Total items in the batch */
  totalItems: z.number().int().nonnegative(),

  /** Items successfully processed */
  successCount: z.number().int().nonnegative(),

  /** Items that failed */
  failedCount: z.number().int().nonnegative(),

  /** Items that were skipped */
  skippedCount: z.number().int().nonnegative(),

  /** Total processing time in milliseconds */
  totalDurationMs: z.number().nonnegative(),

  /** Average time per item in milliseconds */
  avgTimePerItemMs: z.number().nonnegative(),

  /** Items processed per second */
  itemsPerSecond: z.number().nonnegative(),

  /** Success rate (0-100) */
  successRate: z.number().min(0).max(100),

  /** Start time */
  startTime: z.date(),

  /** End time */
  endTime: z.date(),

  /** List of error messages */
  errors: z.array(z.string()).default([]),

  /** Optional breakdown by category */
  breakdown: z.record(z.number().int().nonnegative()).optional(),
});

export type BatchStatistics = z.infer<typeof BatchStatisticsSchema>;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate percentage with bounds
 */
export function calculatePercentage(current: number, total: number): number {
  if (total === 0) return 100;
  return Math.min(100, Math.max(0, (current / total) * 100));
}

/**
 * Estimate remaining time based on current progress
 */
export function estimateRemainingTime(
  elapsedMs: number,
  current: number,
  total: number
): number | undefined {
  if (current === 0 || current >= total) return undefined;
  const avgTimePerItem = elapsedMs / current;
  const remaining = total - current;
  return avgTimePerItem * remaining;
}

/**
 * Calculate items per second
 */
export function calculateItemsPerSecond(
  count: number,
  elapsedMs: number
): number {
  if (elapsedMs === 0) return 0;
  return (count / elapsedMs) * 1000;
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;

  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);

  if (ms < 3600000) return `${minutes}m ${seconds}s`;

  const hours = Math.floor(ms / 3600000);
  const remainingMinutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Format a progress entry as a human-readable string
 */
export function formatProgress(entry: ProgressEntry): string {
  const pct = entry.percentage.toFixed(1);
  const elapsed = formatDuration(entry.elapsedMs);

  let status = `${entry.current}/${entry.total} (${pct}%)`;

  if (entry.estimatedRemainingMs !== undefined) {
    status += ` - ETA: ${formatDuration(entry.estimatedRemainingMs)}`;
  }

  status += ` - Elapsed: ${elapsed}`;

  if (entry.itemsPerSecond !== undefined && entry.itemsPerSecond > 0) {
    status += ` - ${entry.itemsPerSecond.toFixed(1)} items/s`;
  }

  return status;
}

/**
 * Create a progress bar string
 */
export function createProgressBar(
  percentage: number,
  width: number = 40,
  filled: string = '█',
  empty: string = '░'
): string {
  const filledCount = Math.round((percentage / 100) * width);
  const emptyCount = width - filledCount;
  return filled.repeat(filledCount) + empty.repeat(emptyCount);
}

/**
 * Format batch statistics as a summary string
 */
export function formatBatchStatistics(stats: BatchStatistics): string {
  const lines: string[] = [
    `Total Items: ${stats.totalItems}`,
    `  Successful: ${stats.successCount}`,
    `  Failed: ${stats.failedCount}`,
    `  Skipped: ${stats.skippedCount}`,
    ``,
    `Success Rate: ${stats.successRate.toFixed(1)}%`,
    `Total Duration: ${formatDuration(stats.totalDurationMs)}`,
    `Avg Time Per Item: ${formatDuration(stats.avgTimePerItemMs)}`,
    `Throughput: ${stats.itemsPerSecond.toFixed(2)} items/s`,
  ];

  if (stats.errors.length > 0) {
    lines.push(``, `Errors (${stats.errors.length}):`);
    // Show first 10 errors
    const displayErrors = stats.errors.slice(0, 10);
    for (const error of displayErrors) {
      lines.push(`  - ${error}`);
    }
    if (stats.errors.length > 10) {
      lines.push(`  ... and ${stats.errors.length - 10} more`);
    }
  }

  if (stats.breakdown && Object.keys(stats.breakdown).length > 0) {
    lines.push(``, `Breakdown:`);
    for (const [category, count] of Object.entries(stats.breakdown)) {
      lines.push(`  ${category}: ${count}`);
    }
  }

  return lines.join('\n');
}
