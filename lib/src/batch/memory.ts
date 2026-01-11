/**
 * Memory Management Utilities
 *
 * Provides memory monitoring, garbage collection triggers, and adaptive
 * concurrency for efficient processing of large datasets (~3,900 PDFs, ~1GB).
 */

import { type MemorySnapshot, type MemoryThresholds, MemoryThresholdsSchema } from './types.js';

// ============================================================================
// Memory Snapshot
// ============================================================================

/**
 * Get current memory usage snapshot
 */
export function getMemorySnapshot(): MemorySnapshot {
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
  const heapTotalMB = memUsage.heapTotal / 1024 / 1024;

  return {
    heapUsedMB: Math.round(heapUsedMB * 100) / 100,
    heapTotalMB: Math.round(heapTotalMB * 100) / 100,
    externalMB: Math.round((memUsage.external / 1024 / 1024) * 100) / 100,
    rssMemoryMB: Math.round((memUsage.rss / 1024 / 1024) * 100) / 100,
    heapUsagePercent: Math.round((heapUsedMB / heapTotalMB) * 100),
    timestamp: Date.now(),
  };
}

/**
 * Format memory snapshot for logging
 */
export function formatMemorySnapshot(snapshot: MemorySnapshot): string {
  return [
    `Heap: ${snapshot.heapUsedMB.toFixed(1)}MB / ${snapshot.heapTotalMB.toFixed(1)}MB (${snapshot.heapUsagePercent}%)`,
    `RSS: ${snapshot.rssMemoryMB.toFixed(1)}MB`,
    `External: ${snapshot.externalMB.toFixed(1)}MB`,
  ].join(' | ');
}

// ============================================================================
// Garbage Collection
// ============================================================================

/**
 * Request garbage collection if available (requires --expose-gc flag)
 * Returns true if GC was triggered, false if not available
 */
export function requestGC(): boolean {
  if (global.gc) {
    global.gc();
    return true;
  }
  return false;
}

/**
 * Force garbage collection with memory pressure check
 * Will only trigger if heap usage exceeds threshold
 */
export function triggerGCIfNeeded(
  thresholdPercent: number = 80
): { triggered: boolean; before: MemorySnapshot; after?: MemorySnapshot } {
  const before = getMemorySnapshot();

  if (before.heapUsagePercent >= thresholdPercent) {
    const triggered = requestGC();
    if (triggered) {
      // Allow GC to complete
      const after = getMemorySnapshot();
      return { triggered: true, before, after };
    }
  }

  return { triggered: false, before };
}

/**
 * Memory cleanup between batches
 * Clears caches and triggers GC if needed
 */
export async function performBatchCleanup(
  clearCaches?: () => void | Promise<void>
): Promise<{
  gcTriggered: boolean;
  memoryBefore: MemorySnapshot;
  memoryAfter: MemorySnapshot;
}> {
  const memoryBefore = getMemorySnapshot();

  // Clear any provided caches
  if (clearCaches) {
    await clearCaches();
  }

  // Force GC if available
  const gcTriggered = requestGC();

  // Small delay to let GC complete
  await new Promise((resolve) => setTimeout(resolve, 100));

  const memoryAfter = getMemorySnapshot();

  return {
    gcTriggered,
    memoryBefore,
    memoryAfter,
  };
}

// ============================================================================
// Memory Monitor
// ============================================================================

export interface MemoryMonitorCallbacks {
  onWarning?: (snapshot: MemorySnapshot) => void;
  onCritical?: (snapshot: MemorySnapshot) => void;
  onRecovered?: (snapshot: MemorySnapshot) => void;
}

/**
 * Memory monitor for continuous monitoring during batch processing
 */
export class MemoryMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private thresholds: MemoryThresholds;
  private callbacks: MemoryMonitorCallbacks;
  private lastState: 'normal' | 'warning' | 'critical' = 'normal';
  private peakMemoryMB: number = 0;
  private snapshots: MemorySnapshot[] = [];
  private maxSnapshots: number = 100;

  constructor(
    thresholds?: Partial<MemoryThresholds>,
    callbacks?: MemoryMonitorCallbacks
  ) {
    this.thresholds = MemoryThresholdsSchema.parse(thresholds ?? {});
    this.callbacks = callbacks ?? {};
  }

  /**
   * Start monitoring memory at specified interval
   */
  start(intervalMs: number = 5000): void {
    if (this.intervalId) {
      return; // Already running
    }

    this.intervalId = setInterval(() => {
      this.check();
    }, intervalMs);

    // Initial check
    this.check();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Perform a memory check
   */
  check(): MemorySnapshot {
    const snapshot = getMemorySnapshot();

    // Track peak memory
    if (snapshot.rssMemoryMB > this.peakMemoryMB) {
      this.peakMemoryMB = snapshot.rssMemoryMB;
    }

    // Store snapshot
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    // Determine state
    let newState: 'normal' | 'warning' | 'critical' = 'normal';
    if (snapshot.rssMemoryMB >= this.thresholds.criticalThresholdMB) {
      newState = 'critical';
    } else if (snapshot.rssMemoryMB >= this.thresholds.warningThresholdMB) {
      newState = 'warning';
    }

    // Trigger callbacks on state change
    if (newState !== this.lastState) {
      if (newState === 'critical' && this.callbacks.onCritical) {
        this.callbacks.onCritical(snapshot);
      } else if (newState === 'warning' && this.callbacks.onWarning) {
        this.callbacks.onWarning(snapshot);
      } else if (newState === 'normal' && this.lastState !== 'normal' && this.callbacks.onRecovered) {
        this.callbacks.onRecovered(snapshot);
      }
      this.lastState = newState;
    }

    return snapshot;
  }

  /**
   * Get current state
   */
  getState(): 'normal' | 'warning' | 'critical' {
    return this.lastState;
  }

  /**
   * Get peak memory usage
   */
  getPeakMemoryMB(): number {
    return this.peakMemoryMB;
  }

  /**
   * Get recent snapshots
   */
  getSnapshots(): MemorySnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Get average memory usage from recent snapshots
   */
  getAverageMemoryMB(): number {
    if (this.snapshots.length === 0) return 0;
    const sum = this.snapshots.reduce((acc, s) => acc + s.rssMemoryMB, 0);
    return sum / this.snapshots.length;
  }

  /**
   * Check if memory is under pressure
   */
  isUnderPressure(): boolean {
    return this.lastState !== 'normal';
  }

  /**
   * Reset peak memory tracking
   */
  resetPeak(): void {
    this.peakMemoryMB = getMemorySnapshot().rssMemoryMB;
  }
}

// ============================================================================
// Adaptive Concurrency
// ============================================================================

export interface AdaptiveConcurrencyConfig {
  initialConcurrency: number;
  minConcurrency: number;
  maxConcurrency: number;
  targetHeapUsagePercent: number;
  increaseThreshold: number; // If below this %, consider increasing
  decreaseThreshold: number; // If above this %, decrease
  adjustmentStep: number;
  stabilizationMs: number; // Time to wait before adjusting again
}

const DEFAULT_ADAPTIVE_CONFIG: AdaptiveConcurrencyConfig = {
  initialConcurrency: 5,
  minConcurrency: 1,
  maxConcurrency: 10,
  targetHeapUsagePercent: 70,
  increaseThreshold: 50,
  decreaseThreshold: 80,
  adjustmentStep: 1,
  stabilizationMs: 10000,
};

/**
 * Adaptive concurrency controller that adjusts based on memory pressure
 */
export class AdaptiveConcurrencyController {
  private config: AdaptiveConcurrencyConfig;
  private currentConcurrency: number;
  private lastAdjustmentTime: number = 0;
  private adjustmentCount: number = 0;
  private memoryMonitor: MemoryMonitor;

  constructor(
    config?: Partial<AdaptiveConcurrencyConfig>,
    memoryMonitor?: MemoryMonitor
  ) {
    this.config = { ...DEFAULT_ADAPTIVE_CONFIG, ...config };
    this.currentConcurrency = this.config.initialConcurrency;
    this.memoryMonitor = memoryMonitor ?? new MemoryMonitor();
  }

  /**
   * Get current recommended concurrency
   */
  getConcurrency(): number {
    return this.currentConcurrency;
  }

  /**
   * Get number of times concurrency was adjusted
   */
  getAdjustmentCount(): number {
    return this.adjustmentCount;
  }

  /**
   * Evaluate and potentially adjust concurrency based on memory
   * Returns the new concurrency and reason for change (if any)
   */
  evaluate(): { concurrency: number; adjusted: boolean; reason?: string } {
    const now = Date.now();

    // Check if we're still in stabilization period
    if (now - this.lastAdjustmentTime < this.config.stabilizationMs) {
      return { concurrency: this.currentConcurrency, adjusted: false };
    }

    const snapshot = this.memoryMonitor.check();
    const oldConcurrency = this.currentConcurrency;

    // Decrease if under pressure
    if (snapshot.heapUsagePercent >= this.config.decreaseThreshold) {
      if (this.currentConcurrency > this.config.minConcurrency) {
        this.currentConcurrency = Math.max(
          this.config.minConcurrency,
          this.currentConcurrency - this.config.adjustmentStep
        );
        this.lastAdjustmentTime = now;
        this.adjustmentCount++;
        return {
          concurrency: this.currentConcurrency,
          adjusted: true,
          reason: `Memory pressure (${snapshot.heapUsagePercent}% heap usage), decreased from ${oldConcurrency} to ${this.currentConcurrency}`,
        };
      }
    }

    // Increase if memory is low
    if (snapshot.heapUsagePercent <= this.config.increaseThreshold) {
      if (this.currentConcurrency < this.config.maxConcurrency) {
        this.currentConcurrency = Math.min(
          this.config.maxConcurrency,
          this.currentConcurrency + this.config.adjustmentStep
        );
        this.lastAdjustmentTime = now;
        this.adjustmentCount++;
        return {
          concurrency: this.currentConcurrency,
          adjusted: true,
          reason: `Memory available (${snapshot.heapUsagePercent}% heap usage), increased from ${oldConcurrency} to ${this.currentConcurrency}`,
        };
      }
    }

    return { concurrency: this.currentConcurrency, adjusted: false };
  }

  /**
   * Force set concurrency (e.g., from command line override)
   */
  setConcurrency(value: number): void {
    this.currentConcurrency = Math.max(
      this.config.minConcurrency,
      Math.min(this.config.maxConcurrency, value)
    );
  }

  /**
   * Get the memory monitor
   */
  getMemoryMonitor(): MemoryMonitor {
    return this.memoryMonitor;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a memory monitor with default settings for PDF processing
 */
export function createPdfProcessingMemoryMonitor(
  callbacks?: MemoryMonitorCallbacks
): MemoryMonitor {
  return new MemoryMonitor(
    {
      warningThresholdMB: 1024, // 1GB
      criticalThresholdMB: 1536, // 1.5GB
      targetHeapUsagePercent: 70,
      gcTriggerPercent: 80,
    },
    callbacks
  );
}

/**
 * Create an adaptive concurrency controller for PDF processing
 */
export function createPdfProcessingConcurrencyController(
  initialConcurrency: number = 5,
  memoryMonitor?: MemoryMonitor
): AdaptiveConcurrencyController {
  return new AdaptiveConcurrencyController(
    {
      initialConcurrency,
      minConcurrency: 1,
      maxConcurrency: Math.max(10, initialConcurrency * 2),
      targetHeapUsagePercent: 70,
      increaseThreshold: 50,
      decreaseThreshold: 80,
      adjustmentStep: 1,
      stabilizationMs: 10000,
    },
    memoryMonitor
  );
}
