/**
 * Stream-Based Batch Processor
 *
 * Efficient batch processor for large-scale operations (~3,900 PDFs, ~1GB).
 * Features:
 * - Streaming processing (doesn't load all items into memory)
 * - Adaptive concurrency based on memory pressure
 * - Persistent checkpoints for crash recovery
 * - Memory monitoring with automatic GC triggers
 * - Configurable retry logic
 */

import {
  type BatchConfig,
  BatchConfigSchema,
  type BatchItem,
  type BatchItemResult,
  type BatchProcessingStats,
  type BatchProcessingEvents,
  type StreamBatchOptions,
  createEmptyStats,
} from './types.js';
import {
  getMemorySnapshot,
  performBatchCleanup,
  requestGC,
  createPdfProcessingMemoryMonitor,
  createPdfProcessingConcurrencyController,
  type MemoryMonitor,
  type AdaptiveConcurrencyController,
} from './memory.js';
import { createCheckpointManager, type CheckpointManager } from './checkpoint.js';

// ============================================================================
// Batch Processor
// ============================================================================

/**
 * Stream-based batch processor for efficient large-scale processing
 */
export class StreamBatchProcessor<T, R> {
  private config: BatchConfig;
  private processor: (item: BatchItem<T>) => Promise<R>;
  private events: BatchProcessingEvents<T, R>;
  private shouldSkip: ((item: BatchItem<T>) => boolean | Promise<boolean>) | undefined;
  private shouldRetry: ((item: BatchItem<T>, error: Error, retryCount: number) => boolean) | undefined;

  private memoryMonitor: MemoryMonitor | null = null;
  private concurrencyController: AdaptiveConcurrencyController | null = null;
  private checkpointManager: CheckpointManager | null = null;

  private stats: BatchProcessingStats;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private abortController: AbortController | null = null;

  constructor(options: StreamBatchOptions<T, R>) {
    this.config = BatchConfigSchema.parse(options);
    this.processor = options.processor;
    this.events = options.events ?? {};
    this.shouldSkip = options.shouldSkip ?? undefined;
    this.shouldRetry = options.shouldRetry ?? undefined;
    this.stats = createEmptyStats();
  }

  /**
   * Initialize the processor with monitoring and checkpointing
   */
  async initialize(
    runId: string,
    totalItems: number
  ): Promise<void> {
    // Initialize memory monitoring
    if (this.config.enableMemoryMonitoring) {
      this.memoryMonitor = createPdfProcessingMemoryMonitor({
        onWarning: (snapshot) => this.events.onMemoryWarning?.(snapshot),
        onCritical: (snapshot) => {
          this.events.onMemoryWarning?.(snapshot);
          // Force GC on critical memory
          requestGC();
        },
      });
      this.memoryMonitor.start(5000);
    }

    // Initialize adaptive concurrency
    if (this.config.adaptiveConcurrency) {
      this.concurrencyController = createPdfProcessingConcurrencyController(
        this.config.concurrency,
        this.memoryMonitor ?? undefined
      );
    }

    // Initialize checkpoint manager
    if (this.config.enableCheckpoints) {
      const checkpointConfig: { filePath?: string; autoSaveIntervalMs: number } = {
        autoSaveIntervalMs: this.config.checkpointIntervalMs,
      };
      if (this.config.checkpointPath) {
        checkpointConfig.filePath = this.config.checkpointPath;
      }
      this.checkpointManager = createCheckpointManager(runId, checkpointConfig);
      await this.checkpointManager.initialize(runId, totalItems, this.config);
    }

    this.stats.totalItems = totalItems;
  }

  /**
   * Resume from a previous checkpoint
   */
  async resume(): Promise<Set<string>> {
    if (!this.checkpointManager) {
      return new Set();
    }

    const checkpoint = await this.checkpointManager.resume();
    if (!checkpoint) {
      return new Set();
    }

    // Return set of already processed item IDs
    return new Set(this.checkpointManager.getCompletedItemIds());
  }

  /**
   * Process items in streaming batches
   * Uses async generator to avoid loading all items into memory
   */
  async processStream(
    items: AsyncIterable<BatchItem<T>> | Iterable<BatchItem<T>>
  ): Promise<BatchProcessingStats> {
    if (this.isRunning) {
      throw new Error('Processor is already running');
    }

    this.isRunning = true;
    this.isPaused = false;
    this.abortController = new AbortController();
    const startTime = Date.now();

    try {
      let batchIndex = 0;
      let currentBatch: BatchItem<T>[] = [];

      // Get effective concurrency
      const getEffectiveConcurrency = (): number => {
        if (this.concurrencyController) {
          const result = this.concurrencyController.evaluate();
          if (result.adjusted) {
            this.stats.concurrencyAdjustments++;
            this.events.onConcurrencyAdjusted?.(
              this.config.concurrency,
              result.concurrency,
              result.reason ?? ''
            );
          }
          return result.concurrency;
        }
        return this.config.concurrency;
      };

      // Process a batch of items
      const processBatch = async (batch: BatchItem<T>[]): Promise<void> => {
        this.events.onBatchStart?.(batchIndex, batch);
        this.checkpointManager?.setCurrentBatch(batchIndex);

        const concurrency = getEffectiveConcurrency();
        const results: BatchItemResult<R>[] = [];

        // Process in concurrent chunks
        for (let i = 0; i < batch.length; i += concurrency) {
          if (this.abortController?.signal.aborted) {
            break;
          }

          while (this.isPaused) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }

          const chunk = batch.slice(i, i + concurrency);
          const chunkResults = await Promise.all(
            chunk.map((item) => this.processItem(item))
          );
          results.push(...chunkResults);

          // Report progress
          this.events.onProgress?.(
            this.stats.processedItems + this.stats.skippedItems,
            this.stats.totalItems,
            this.stats
          );
        }

        this.events.onBatchComplete?.(batchIndex, results);

        // Cleanup between batches
        if (this.config.gcBetweenBatches) {
          const cleanup = await performBatchCleanup();
          if (cleanup.gcTriggered) {
            this.stats.gcCycles++;
          }
        }

        // Track peak memory
        const memory = getMemorySnapshot();
        if (memory.rssMemoryMB > this.stats.peakMemoryMB) {
          this.stats.peakMemoryMB = memory.rssMemoryMB;
        }

        batchIndex++;
      };

      // Stream through items and batch them
      for await (const item of items) {
        if (this.abortController?.signal.aborted) {
          break;
        }

        currentBatch.push(item);

        if (currentBatch.length >= this.config.batchSize) {
          await processBatch(currentBatch);
          currentBatch = [];
        }
      }

      // Process remaining items
      if (currentBatch.length > 0) {
        await processBatch(currentBatch);
      }

      // Finalize stats
      this.stats.totalDurationMs = Date.now() - startTime;
      this.stats.avgItemDurationMs =
        this.stats.processedItems > 0
          ? this.stats.totalDurationMs / this.stats.processedItems
          : 0;
      this.stats.itemsPerSecond =
        this.stats.totalDurationMs > 0
          ? (this.stats.processedItems / this.stats.totalDurationMs) * 1000
          : 0;

      // Save final checkpoint
      await this.checkpointManager?.save();

      return this.stats;
    } finally {
      this.isRunning = false;
      this.cleanup();
    }
  }

  /**
   * Process items from an array (convenience method)
   */
  async process(items: BatchItem<T>[]): Promise<BatchProcessingStats> {
    this.stats.totalItems = items.length;
    return this.processStream(items);
  }

  /**
   * Process a single item with retry logic
   */
  private async processItem(item: BatchItem<T>): Promise<BatchItemResult<R>> {
    const startTime = Date.now();
    let retryCount = item.retryCount ?? 0;

    // Check if already processed (from checkpoint)
    if (this.checkpointManager?.isItemProcessed(item.id)) {
      this.stats.skippedItems++;
      return {
        id: item.id,
        success: true,
        durationMs: 0,
        retryCount: 0,
      };
    }

    // Check if should skip
    if (this.shouldSkip) {
      const skip = await this.shouldSkip(item);
      if (skip) {
        this.stats.skippedItems++;
        this.checkpointManager?.markSkipped(item.id, 'Skipped by filter');
        return {
          id: item.id,
          success: true,
          durationMs: Date.now() - startTime,
          retryCount: 0,
        };
      }
    }

    this.events.onItemStart?.(item);
    this.checkpointManager?.markStarted(item.id);

    while (retryCount <= this.config.maxRetries) {
      try {
        const result = await this.processWithTimeout(item);
        const durationMs = Date.now() - startTime;

        this.stats.processedItems++;
        this.checkpointManager?.markCompleted(item.id, { durationMs });

        const itemResult: BatchItemResult<R> = {
          id: item.id,
          success: true,
          result,
          durationMs,
          retryCount,
        };

        this.events.onItemComplete?.(item, itemResult);
        return itemResult;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        // Check if should retry
        const canRetry =
          retryCount < this.config.maxRetries &&
          (this.shouldRetry?.(item, err, retryCount) ?? true);

        if (canRetry) {
          this.events.onItemError?.(item, err, retryCount);
          this.stats.retriedItems++;
          retryCount++;

          // Wait before retry
          await new Promise((resolve) =>
            setTimeout(resolve, this.config.retryDelayMs * retryCount)
          );
          continue;
        }

        // Final failure
        const durationMs = Date.now() - startTime;
        this.stats.failedItems++;
        this.checkpointManager?.markFailed(item.id, err.message, durationMs);

        const itemResult: BatchItemResult<R> = {
          id: item.id,
          success: false,
          error: err.message,
          durationMs,
          retryCount,
        };

        this.events.onItemComplete?.(item, itemResult);
        return itemResult;
      }
    }

    // Should never reach here, but TypeScript needs it
    const durationMs = Date.now() - startTime;
    return {
      id: item.id,
      success: false,
      error: 'Max retries exceeded',
      durationMs,
      retryCount,
    };
  }

  /**
   * Process item with timeout
   */
  private async processWithTimeout(item: BatchItem<T>): Promise<R> {
    if (!this.config.timeoutMs) {
      return this.processor(item);
    }

    return Promise.race([
      this.processor(item),
      new Promise<R>((_, reject) =>
        setTimeout(
          () => reject(new Error('Processing timeout')),
          this.config.timeoutMs
        )
      ),
    ]);
  }

  /**
   * Pause processing
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume processing
   */
  resumeProcessing(): void {
    this.isPaused = false;
  }

  /**
   * Abort processing
   */
  abort(): void {
    this.abortController?.abort();
  }

  /**
   * Get current stats
   */
  getStats(): BatchProcessingStats {
    return { ...this.stats };
  }

  /**
   * Get checkpoint manager
   */
  getCheckpointManager(): CheckpointManager | null {
    return this.checkpointManager;
  }

  /**
   * Get memory monitor
   */
  getMemoryMonitor(): MemoryMonitor | null {
    return this.memoryMonitor;
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.memoryMonitor?.stop();
    this.abortController = null;
  }

  /**
   * Full cleanup including checkpoint
   */
  async dispose(deleteCheckpoint: boolean = false): Promise<void> {
    this.cleanup();
    await this.checkpointManager?.cleanup(deleteCheckpoint);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a stream batch processor for PDF processing
 */
export function createPdfBatchProcessor<T, R>(
  processor: (item: BatchItem<T>) => Promise<R>,
  options?: Partial<BatchConfig> & { events?: BatchProcessingEvents<T, R> }
): StreamBatchProcessor<T, R> {
  return new StreamBatchProcessor({
    batchSize: 100,
    concurrency: 5,
    maxRetries: 2,
    retryDelayMs: 1000,
    enableCheckpoints: true,
    checkpointIntervalMs: 30000,
    enableMemoryMonitoring: true,
    gcBetweenBatches: true,
    adaptiveConcurrency: true,
    minConcurrency: 1,
    maxConcurrency: 10,
    ...options,
    processor,
  });
}

/**
 * Helper to create BatchItem array from regular items
 */
export function toBatchItems<T>(
  items: T[],
  getId: (item: T) => string
): BatchItem<T>[] {
  return items.map((item) => ({
    id: getId(item),
    data: item,
  }));
}

/**
 * Async generator to stream items from database cursor
 * This avoids loading all items into memory at once
 */
export async function* streamFromCursor<T>(
  cursor: AsyncIterable<T>,
  getId: (item: T) => string
): AsyncGenerator<BatchItem<T>> {
  for await (const item of cursor) {
    yield {
      id: getId(item),
      data: item,
    };
  }
}

/**
 * Create a paginated stream from a fetch function
 * Useful for database pagination without loading all records
 */
export async function* paginatedStream<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  pageSize: number,
  getId: (item: T) => string,
  maxItems?: number
): AsyncGenerator<BatchItem<T>> {
  let offset = 0;
  let totalYielded = 0;

  while (true) {
    const page = await fetchPage(offset, pageSize);

    if (page.length === 0) {
      break;
    }

    for (const item of page) {
      if (maxItems !== undefined && totalYielded >= maxItems) {
        return;
      }

      yield {
        id: getId(item),
        data: item,
      };

      totalYielded++;
    }

    offset += page.length;

    // If we got fewer items than requested, we've reached the end
    if (page.length < pageSize) {
      break;
    }
  }
}
