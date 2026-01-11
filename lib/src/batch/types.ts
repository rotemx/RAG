/**
 * Batch Processing Types
 *
 * Type definitions for efficient large-scale batch processing.
 * Designed to handle ~3,900 PDFs (~1GB) efficiently.
 */

import { z } from 'zod';

// ============================================================================
// Checkpoint Types
// ============================================================================

/**
 * Processing state for a single item
 */
export const ProcessingStateSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'failed',
  'skipped',
]);
export type ProcessingState = z.infer<typeof ProcessingStateSchema>;

/**
 * Individual item checkpoint entry
 */
export const CheckpointEntrySchema = z.object({
  id: z.string(),
  state: ProcessingStateSchema,
  error: z.string().optional(),
  processedAt: z.string().optional(), // ISO timestamp
  durationMs: z.number().optional(),
  chunksCreated: z.number().optional(),
  chunksEmbedded: z.number().optional(),
});
export type CheckpointEntry = z.infer<typeof CheckpointEntrySchema>;

/**
 * Batch processing checkpoint data
 * Persisted to disk for crash recovery
 */
export const CheckpointDataSchema = z.object({
  version: z.literal(1),
  runId: z.string(),
  startedAt: z.string(), // ISO timestamp
  updatedAt: z.string(), // ISO timestamp
  totalItems: z.number(),
  processedCount: z.number(),
  failedCount: z.number(),
  skippedCount: z.number(),
  currentBatch: z.number(),
  totalBatches: z.number(),
  items: z.record(z.string(), CheckpointEntrySchema),
  config: z.object({
    batchSize: z.number(),
    concurrency: z.number(),
    offset: z.number(),
    limit: z.number().optional(),
  }),
});
export type CheckpointData = z.infer<typeof CheckpointDataSchema>;

// ============================================================================
// Memory Management Types
// ============================================================================

/**
 * Memory usage snapshot
 */
export const MemorySnapshotSchema = z.object({
  heapUsedMB: z.number(),
  heapTotalMB: z.number(),
  externalMB: z.number(),
  rssMemoryMB: z.number(),
  heapUsagePercent: z.number(),
  timestamp: z.number(),
});
export type MemorySnapshot = z.infer<typeof MemorySnapshotSchema>;

/**
 * Memory thresholds for adaptive processing
 */
export const MemoryThresholdsSchema = z.object({
  warningThresholdMB: z.number().default(1024), // 1GB
  criticalThresholdMB: z.number().default(1536), // 1.5GB
  targetHeapUsagePercent: z.number().default(70),
  gcTriggerPercent: z.number().default(80),
});
export type MemoryThresholds = z.infer<typeof MemoryThresholdsSchema>;

/**
 * Memory monitoring configuration
 */
export const MemoryMonitorConfigSchema = z.object({
  enabled: z.boolean().default(true),
  checkIntervalMs: z.number().default(5000),
  thresholds: MemoryThresholdsSchema.optional(),
  onWarning: z.function().args(z.custom<MemorySnapshot>()).optional(),
  onCritical: z.function().args(z.custom<MemorySnapshot>()).optional(),
});
export type MemoryMonitorConfig = z.infer<typeof MemoryMonitorConfigSchema>;

// ============================================================================
// Batch Processing Types
// ============================================================================

/**
 * Batch processing configuration
 */
export const BatchConfigSchema = z.object({
  batchSize: z.number().min(1).default(100),
  concurrency: z.number().min(1).default(5),
  maxRetries: z.number().min(0).default(2),
  retryDelayMs: z.number().min(0).default(1000),
  timeoutMs: z.number().min(0).optional(),
  enableCheckpoints: z.boolean().default(true),
  checkpointPath: z.string().optional(),
  checkpointIntervalMs: z.number().default(30000), // Save every 30s
  enableMemoryMonitoring: z.boolean().default(true),
  gcBetweenBatches: z.boolean().default(true),
  adaptiveConcurrency: z.boolean().default(true),
  minConcurrency: z.number().min(1).default(1),
  maxConcurrency: z.number().min(1).default(10),
});
export type BatchConfig = z.infer<typeof BatchConfigSchema>;

/**
 * Batch processing item with metadata
 */
export interface BatchItem<T> {
  id: string;
  data: T;
  priority?: number;
  retryCount?: number;
}

/**
 * Result of processing a single item
 */
export interface BatchItemResult<R> {
  id: string;
  success: boolean;
  result?: R;
  error?: string;
  durationMs: number;
  retryCount: number;
}

/**
 * Batch processing statistics
 */
export interface BatchProcessingStats {
  totalItems: number;
  processedItems: number;
  failedItems: number;
  skippedItems: number;
  retriedItems: number;
  totalDurationMs: number;
  avgItemDurationMs: number;
  itemsPerSecond: number;
  peakMemoryMB: number;
  gcCycles: number;
  concurrencyAdjustments: number;
}

/**
 * Batch processing events
 */
export interface BatchProcessingEvents<T, R> {
  onBatchStart?: (batchIndex: number, items: BatchItem<T>[]) => void;
  onBatchComplete?: (batchIndex: number, results: BatchItemResult<R>[]) => void;
  onItemStart?: (item: BatchItem<T>) => void;
  onItemComplete?: (item: BatchItem<T>, result: BatchItemResult<R>) => void;
  onItemError?: (item: BatchItem<T>, error: Error, retryCount: number) => void;
  onCheckpointSaved?: (checkpoint: CheckpointData) => void;
  onMemoryWarning?: (snapshot: MemorySnapshot) => void;
  onConcurrencyAdjusted?: (oldValue: number, newValue: number, reason: string) => void;
  onProgress?: (processed: number, total: number, stats: BatchProcessingStats) => void;
}

/**
 * Streaming batch processor options
 */
export interface StreamBatchOptions<T, R> extends BatchConfig {
  processor: (item: BatchItem<T>) => Promise<R>;
  events?: BatchProcessingEvents<T, R>;
  shouldSkip?: (item: BatchItem<T>) => boolean | Promise<boolean>;
  shouldRetry?: (item: BatchItem<T>, error: Error, retryCount: number) => boolean;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Checkpoint file path helpers
 */
export function getDefaultCheckpointPath(runId: string): string {
  return `.checkpoint-${runId}.json`;
}

/**
 * Create initial checkpoint data
 */
export function createInitialCheckpoint(
  runId: string,
  totalItems: number,
  config: BatchConfig
): CheckpointData {
  const now = new Date().toISOString();
  return {
    version: 1,
    runId,
    startedAt: now,
    updatedAt: now,
    totalItems,
    processedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    currentBatch: 0,
    totalBatches: Math.ceil(totalItems / config.batchSize),
    items: {},
    config: {
      batchSize: config.batchSize,
      concurrency: config.concurrency,
      offset: 0,
      limit: undefined,
    },
  };
}

/**
 * Create empty batch processing stats
 */
export function createEmptyStats(): BatchProcessingStats {
  return {
    totalItems: 0,
    processedItems: 0,
    failedItems: 0,
    skippedItems: 0,
    retriedItems: 0,
    totalDurationMs: 0,
    avgItemDurationMs: 0,
    itemsPerSecond: 0,
    peakMemoryMB: 0,
    gcCycles: 0,
    concurrencyAdjustments: 0,
  };
}
