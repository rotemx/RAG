/**
 * Progress Reporter Implementation
 *
 * A flexible progress reporter for tracking and reporting batch processing progress.
 * Supports callbacks, throttling, automatic logging, and ETA calculation.
 */

import {
  type ProgressEntry,
  type ProgressReporterConfig,
  type ProgressUpdate,
  type BatchStatistics,
  ProgressState,
  createDefaultProgressConfig,
  calculatePercentage,
  estimateRemainingTime,
  calculateItemsPerSecond,
  formatProgress,
  formatDuration,
  createProgressBar,
} from './types.js';

// =============================================================================
// Progress Reporter Class
// =============================================================================

/**
 * Progress reporter for tracking batch operation progress
 */
export class ProgressReporter {
  private readonly config: ProgressReporterConfig;
  private current: number = 0;
  private successCount: number = 0;
  private failedCount: number = 0;
  private skippedCount: number = 0;
  private state: ProgressEntry['state'] = ProgressState.PENDING;
  private startTime: Date | null = null;
  private endTime: Date | null = null;
  private lastLoggedPercent: number = 0;
  private lastCallbackTime: number = 0;
  private currentItem: string | undefined;
  private message: string | undefined;
  private context: Record<string, unknown> = {};
  private errors: string[] = [];

  constructor(config: ProgressReporterConfig);
  constructor(total: number, options?: Partial<Omit<ProgressReporterConfig, 'total'>>);
  constructor(
    configOrTotal: ProgressReporterConfig | number,
    options?: Partial<Omit<ProgressReporterConfig, 'total'>>
  ) {
    if (typeof configOrTotal === 'number') {
      this.config = createDefaultProgressConfig(configOrTotal, options);
    } else {
      this.config = configOrTotal;
    }
  }

  /**
   * Start the progress reporter
   */
  start(message?: string): void {
    this.startTime = new Date();
    this.state = ProgressState.RUNNING;
    this.message = message;
    this.lastLoggedPercent = 0;

    if (this.config.autoLog) {
      const opName = this.config.operationName ?? 'Processing';
      console.log(`${opName}: Starting (${this.config.total} items)`);
    }

    this.emitProgress();
  }

  /**
   * Update progress
   */
  update(update?: Partial<ProgressUpdate>): void {
    if (this.state !== ProgressState.RUNNING) {
      return;
    }

    const increment = update?.increment ?? 1;
    this.current += increment;

    if (update?.success === false) {
      this.failedCount += increment;
    } else if (update?.skipped) {
      this.skippedCount += increment;
    } else {
      this.successCount += increment;
    }

    if (update?.message) {
      this.message = update.message;
    }

    if (update?.currentItem) {
      this.currentItem = update.currentItem;
    }

    if (update?.context) {
      this.context = { ...this.context, ...update.context };
    }

    this.emitProgress();
  }

  /**
   * Mark an item as successful
   */
  success(message?: string, currentItem?: string): void {
    this.update({
      success: true,
      message,
      currentItem,
    });
  }

  /**
   * Mark an item as failed
   */
  fail(error?: string, currentItem?: string): void {
    if (error) {
      this.errors.push(error);
    }
    this.update({
      success: false,
      message: error ? `Failed: ${error}` : undefined,
      currentItem,
    });
  }

  /**
   * Mark an item as skipped
   */
  skip(message?: string, currentItem?: string): void {
    this.update({
      skipped: true,
      message,
      currentItem,
    });
  }

  /**
   * Complete the progress reporter successfully
   */
  complete(message?: string): void {
    this.endTime = new Date();
    this.state = ProgressState.COMPLETED;
    this.message = message;
    this.current = this.config.total;

    if (this.config.autoLog) {
      const opName = this.config.operationName ?? 'Processing';
      const duration = this.getElapsedMs();
      console.log(
        `${opName}: Completed - ${this.successCount} succeeded, ` +
          `${this.failedCount} failed, ${this.skippedCount} skipped ` +
          `in ${formatDuration(duration)}`
      );
    }

    this.emitProgress();
  }

  /**
   * Mark the progress reporter as failed
   */
  abort(error?: string): void {
    this.endTime = new Date();
    this.state = ProgressState.FAILED;
    this.message = error;

    if (error) {
      this.errors.push(error);
    }

    if (this.config.autoLog) {
      const opName = this.config.operationName ?? 'Processing';
      console.error(`${opName}: Aborted - ${error ?? 'Unknown error'}`);
    }

    this.emitProgress();
  }

  /**
   * Cancel the progress reporter
   */
  cancel(): void {
    this.endTime = new Date();
    this.state = ProgressState.CANCELLED;
    this.message = 'Cancelled';

    if (this.config.autoLog) {
      const opName = this.config.operationName ?? 'Processing';
      console.log(`${opName}: Cancelled`);
    }

    this.emitProgress();
  }

  /**
   * Pause the progress reporter
   */
  pause(): void {
    this.state = ProgressState.PAUSED;
    this.emitProgress();
  }

  /**
   * Resume the progress reporter
   */
  resume(): void {
    this.state = ProgressState.RUNNING;
    this.emitProgress();
  }

  /**
   * Get the current progress entry
   */
  getProgress(): ProgressEntry {
    const elapsedMs = this.getElapsedMs();
    const percentage = calculatePercentage(this.current, this.config.total);

    return {
      current: this.current,
      total: this.config.total,
      percentage,
      state: this.state,
      message: this.message,
      startTime: this.startTime ?? new Date(),
      endTime: this.endTime ?? undefined,
      elapsedMs,
      estimatedRemainingMs: estimateRemainingTime(
        elapsedMs,
        this.current,
        this.config.total
      ),
      avgTimePerItemMs: this.current > 0 ? elapsedMs / this.current : undefined,
      itemsPerSecond: calculateItemsPerSecond(this.current, elapsedMs),
      successCount: this.successCount,
      failedCount: this.failedCount,
      skippedCount: this.skippedCount,
      currentItem: this.currentItem,
      context: Object.keys(this.context).length > 0 ? this.context : undefined,
    };
  }

  /**
   * Get batch statistics
   */
  getStatistics(): BatchStatistics {
    const elapsedMs = this.getElapsedMs();
    const processed = this.successCount + this.failedCount + this.skippedCount;

    return {
      totalItems: this.config.total,
      successCount: this.successCount,
      failedCount: this.failedCount,
      skippedCount: this.skippedCount,
      totalDurationMs: elapsedMs,
      avgTimePerItemMs: processed > 0 ? elapsedMs / processed : 0,
      itemsPerSecond: calculateItemsPerSecond(processed, elapsedMs),
      successRate: processed > 0 ? (this.successCount / processed) * 100 : 0,
      startTime: this.startTime ?? new Date(),
      endTime: this.endTime ?? new Date(),
      errors: this.errors,
    };
  }

  /**
   * Get elapsed time in milliseconds
   */
  getElapsedMs(): number {
    if (!this.startTime) return 0;
    const end = this.endTime ?? new Date();
    return end.getTime() - this.startTime.getTime();
  }

  /**
   * Get the current state
   */
  getState(): ProgressEntry['state'] {
    return this.state;
  }

  /**
   * Check if the reporter is running
   */
  isRunning(): boolean {
    return this.state === ProgressState.RUNNING;
  }

  /**
   * Check if the reporter has completed (any terminal state)
   */
  isComplete(): boolean {
    return (
      this.state === ProgressState.COMPLETED ||
      this.state === ProgressState.FAILED ||
      this.state === ProgressState.CANCELLED
    );
  }

  /**
   * Get a formatted progress string
   */
  toString(): string {
    return formatProgress(this.getProgress());
  }

  /**
   * Get a progress bar string
   */
  toProgressBar(width: number = 40): string {
    const entry = this.getProgress();
    const bar = createProgressBar(entry.percentage, width);
    return `[${bar}] ${entry.percentage.toFixed(1)}%`;
  }

  /**
   * Add context
   */
  addContext(context: Record<string, unknown>): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Clear context
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * Emit progress update
   */
  private emitProgress(): void {
    const now = Date.now();

    // Throttle callbacks
    if (
      this.config.throttleMs > 0 &&
      now - this.lastCallbackTime < this.config.throttleMs &&
      this.state === ProgressState.RUNNING
    ) {
      return;
    }

    this.lastCallbackTime = now;
    const entry = this.getProgress();

    // Call progress callback
    if (this.config.onProgress) {
      this.config.onProgress(entry);
    }

    // Auto-log at intervals
    if (this.config.autoLog && this.state === ProgressState.RUNNING) {
      const currentPercent = Math.floor(entry.percentage);
      const interval = this.config.logIntervalPercent;

      if (
        currentPercent >= this.lastLoggedPercent + interval ||
        entry.percentage === 100
      ) {
        this.lastLoggedPercent = currentPercent - (currentPercent % interval);
        const opName = this.config.operationName ?? 'Progress';
        console.log(`${opName}: ${this.toString()}`);
      }
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a progress reporter with default settings
 */
export function createProgressReporter(
  total: number,
  options?: Partial<Omit<ProgressReporterConfig, 'total'>>
): ProgressReporter {
  return new ProgressReporter(total, options);
}

/**
 * Create a silent progress reporter (no auto-logging)
 */
export function createSilentProgressReporter(
  total: number,
  onProgress?: (entry: ProgressEntry) => void
): ProgressReporter {
  return new ProgressReporter(total, {
    autoLog: false,
    onProgress,
  });
}

/**
 * Create a verbose progress reporter (logs every 5%)
 */
export function createVerboseProgressReporter(
  total: number,
  operationName?: string
): ProgressReporter {
  return new ProgressReporter(total, {
    autoLog: true,
    logIntervalPercent: 5,
    operationName,
  });
}

// =============================================================================
// Multi-Stage Progress
// =============================================================================

/**
 * Configuration for a single stage in a multi-stage operation
 */
export interface ProgressStage {
  name: string;
  weight: number;
  total: number;
}

/**
 * Multi-stage progress reporter for operations with multiple phases
 */
export class MultiStageProgressReporter {
  private readonly stages: ProgressStage[];
  private readonly onProgress?: (entry: ProgressEntry) => void;
  private currentStageIndex: number = -1;
  private currentReporter: ProgressReporter | null = null;
  private stageProgress: number[] = [];
  private startTime: Date | null = null;
  private state: ProgressEntry['state'] = ProgressState.PENDING;

  constructor(
    stages: ProgressStage[],
    onProgress?: (entry: ProgressEntry) => void
  ) {
    this.stages = stages;
    this.onProgress = onProgress;
    this.stageProgress = new Array(stages.length).fill(0);
  }

  /**
   * Start the multi-stage operation
   */
  start(): void {
    this.startTime = new Date();
    this.state = ProgressState.RUNNING;
    this.currentStageIndex = -1;
    this.stageProgress = new Array(this.stages.length).fill(0);
  }

  /**
   * Start a specific stage
   */
  startStage(index: number): ProgressReporter {
    if (index < 0 || index >= this.stages.length) {
      throw new Error(`Invalid stage index: ${index}`);
    }

    this.currentStageIndex = index;
    const stage = this.stages[index]!;

    this.currentReporter = new ProgressReporter(stage.total, {
      autoLog: false,
      operationName: stage.name,
      onProgress: (entry) => {
        this.stageProgress[index] = entry.percentage;
        this.emitOverallProgress();
      },
    });

    this.currentReporter.start();
    return this.currentReporter;
  }

  /**
   * Get the current stage reporter
   */
  getCurrentReporter(): ProgressReporter | null {
    return this.currentReporter;
  }

  /**
   * Get overall progress (0-100)
   */
  getOverallProgress(): number {
    const totalWeight = this.stages.reduce((sum, s) => sum + s.weight, 0);
    if (totalWeight === 0) return 0;

    let weighted = 0;
    for (let i = 0; i < this.stages.length; i++) {
      weighted += (this.stageProgress[i]! / 100) * this.stages[i]!.weight;
    }

    return (weighted / totalWeight) * 100;
  }

  /**
   * Get the overall progress entry
   */
  getProgress(): ProgressEntry {
    const elapsedMs = this.startTime
      ? Date.now() - this.startTime.getTime()
      : 0;
    const percentage = this.getOverallProgress();

    const currentStage =
      this.currentStageIndex >= 0
        ? this.stages[this.currentStageIndex]
        : undefined;

    return {
      current: Math.round(percentage),
      total: 100,
      percentage,
      state: this.state,
      message: currentStage ? `Stage: ${currentStage.name}` : undefined,
      startTime: this.startTime ?? new Date(),
      elapsedMs,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      context: {
        currentStage: this.currentStageIndex,
        stageName: currentStage?.name,
      },
    };
  }

  /**
   * Complete the multi-stage operation
   */
  complete(): void {
    this.state = ProgressState.COMPLETED;
    this.stageProgress = new Array(this.stages.length).fill(100);
    this.emitOverallProgress();
  }

  /**
   * Emit overall progress
   */
  private emitOverallProgress(): void {
    if (this.onProgress) {
      this.onProgress(this.getProgress());
    }
  }
}

/**
 * Create a multi-stage progress reporter
 */
export function createMultiStageProgressReporter(
  stages: ProgressStage[],
  onProgress?: (entry: ProgressEntry) => void
): MultiStageProgressReporter {
  return new MultiStageProgressReporter(stages, onProgress);
}
