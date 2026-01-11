/**
 * Checkpoint Management for Crash Recovery
 *
 * Provides persistent checkpointing for batch processing to enable:
 * - Crash recovery (resume from last successful item)
 * - Process interruption handling (Ctrl+C graceful save)
 * - Progress persistence across restarts
 */

import { readFile, writeFile, unlink, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import {
  type CheckpointData,
  CheckpointDataSchema,
  type CheckpointEntry,
  type ProcessingState,
  type BatchConfig,
  createInitialCheckpoint,
  getDefaultCheckpointPath,
} from './types.js';

// ============================================================================
// Checkpoint File Operations
// ============================================================================

/**
 * Check if a checkpoint file exists
 */
export async function checkpointExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load checkpoint data from file
 * Returns null if file doesn't exist or is invalid
 */
export async function loadCheckpoint(
  filePath: string
): Promise<CheckpointData | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    const result = CheckpointDataSchema.safeParse(data);
    if (!result.success) {
      console.error('Invalid checkpoint data:', result.error.message);
      return null;
    }
    return result.data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null; // File doesn't exist
    }
    throw error;
  }
}

/**
 * Save checkpoint data to file
 * Uses atomic write (write to temp, then rename) to prevent corruption
 */
export async function saveCheckpoint(
  filePath: string,
  data: CheckpointData
): Promise<void> {
  const tempPath = `${filePath}.tmp`;

  // Update timestamp
  data.updatedAt = new Date().toISOString();

  // Write to temp file first
  await writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');

  // Atomic rename
  const { rename } = await import('node:fs/promises');
  await rename(tempPath, filePath);
}

/**
 * Delete checkpoint file
 */
export async function deleteCheckpoint(filePath: string): Promise<boolean> {
  try {
    await unlink(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false; // File didn't exist
    }
    throw error;
  }
}

// ============================================================================
// Checkpoint Manager
// ============================================================================

export interface CheckpointManagerConfig {
  filePath: string;
  autoSaveIntervalMs: number;
  saveOnProcessExit: boolean;
}

const DEFAULT_CONFIG: CheckpointManagerConfig = {
  filePath: '.checkpoint.json',
  autoSaveIntervalMs: 30000, // 30 seconds
  saveOnProcessExit: true,
};

/**
 * Checkpoint manager for tracking batch processing progress
 */
export class CheckpointManager {
  private config: CheckpointManagerConfig;
  private data: CheckpointData | null = null;
  private saveIntervalId: NodeJS.Timeout | null = null;
  private isDirty: boolean = false;
  private isSaving: boolean = false;
  private exitHandlerRegistered: boolean = false;

  constructor(config?: Partial<CheckpointManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize checkpoint for a new processing run
   */
  async initialize(
    runId: string,
    totalItems: number,
    batchConfig: BatchConfig
  ): Promise<CheckpointData> {
    this.data = createInitialCheckpoint(runId, totalItems, batchConfig);
    await this.save();
    this.startAutoSave();
    this.registerExitHandler();
    return this.data;
  }

  /**
   * Resume from an existing checkpoint
   */
  async resume(): Promise<CheckpointData | null> {
    this.data = await loadCheckpoint(this.config.filePath);
    if (this.data) {
      this.startAutoSave();
      this.registerExitHandler();
    }
    return this.data;
  }

  /**
   * Get IDs of items that need processing (not completed or skipped)
   */
  getPendingItemIds(): string[] {
    if (!this.data) return [];

    const completedStates: ProcessingState[] = ['completed', 'skipped'];
    return Object.entries(this.data.items)
      .filter(([_, entry]) => !completedStates.includes(entry.state))
      .map(([id]) => id);
  }

  /**
   * Get IDs of items that have been completed
   */
  getCompletedItemIds(): string[] {
    if (!this.data) return [];
    return Object.entries(this.data.items)
      .filter(([_, entry]) => entry.state === 'completed')
      .map(([id]) => id);
  }

  /**
   * Get IDs of items that failed
   */
  getFailedItemIds(): string[] {
    if (!this.data) return [];
    return Object.entries(this.data.items)
      .filter(([_, entry]) => entry.state === 'failed')
      .map(([id]) => id);
  }

  /**
   * Check if an item has already been processed
   */
  isItemProcessed(id: string): boolean {
    if (!this.data) return false;
    const entry = this.data.items[id];
    return entry?.state === 'completed' || entry?.state === 'skipped';
  }

  /**
   * Update item state
   */
  updateItem(
    id: string,
    state: ProcessingState,
    details?: Partial<Omit<CheckpointEntry, 'id' | 'state'>>
  ): void {
    if (!this.data) {
      throw new Error('Checkpoint not initialized');
    }

    const existingEntry = this.data.items[id];
    const entry: CheckpointEntry = {
      id,
      state,
      ...details,
    };

    this.data.items[id] = entry;

    // Update counts
    if (!existingEntry || existingEntry.state !== state) {
      if (state === 'completed') {
        this.data.processedCount++;
      } else if (state === 'failed') {
        this.data.failedCount++;
      } else if (state === 'skipped') {
        this.data.skippedCount++;
      }
    }

    this.isDirty = true;
  }

  /**
   * Mark item as started
   */
  markStarted(id: string): void {
    this.updateItem(id, 'in_progress');
  }

  /**
   * Mark item as completed
   */
  markCompleted(
    id: string,
    details?: {
      durationMs?: number;
      chunksCreated?: number;
      chunksEmbedded?: number;
    }
  ): void {
    this.updateItem(id, 'completed', {
      processedAt: new Date().toISOString(),
      ...details,
    });
  }

  /**
   * Mark item as failed
   */
  markFailed(id: string, error: string, durationMs?: number): void {
    this.updateItem(id, 'failed', {
      error,
      processedAt: new Date().toISOString(),
      durationMs,
    });
  }

  /**
   * Mark item as skipped
   */
  markSkipped(id: string, reason?: string): void {
    this.updateItem(id, 'skipped', {
      error: reason,
      processedAt: new Date().toISOString(),
    });
  }

  /**
   * Update current batch index
   */
  setCurrentBatch(batchIndex: number): void {
    if (!this.data) {
      throw new Error('Checkpoint not initialized');
    }
    this.data.currentBatch = batchIndex;
    this.isDirty = true;
  }

  /**
   * Get checkpoint data
   */
  getData(): CheckpointData | null {
    return this.data;
  }

  /**
   * Get the file path
   */
  getFilePath(): string {
    return this.config.filePath;
  }

  /**
   * Save checkpoint to disk
   */
  async save(): Promise<void> {
    if (!this.data || this.isSaving) return;

    this.isSaving = true;
    try {
      await saveCheckpoint(this.config.filePath, this.data);
      this.isDirty = false;
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Save if dirty (has unsaved changes)
   */
  async saveIfDirty(): Promise<boolean> {
    if (this.isDirty) {
      await this.save();
      return true;
    }
    return false;
  }

  /**
   * Start auto-save interval
   */
  private startAutoSave(): void {
    if (this.saveIntervalId) return;

    this.saveIntervalId = setInterval(async () => {
      await this.saveIfDirty();
    }, this.config.autoSaveIntervalMs);
  }

  /**
   * Stop auto-save interval
   */
  private stopAutoSave(): void {
    if (this.saveIntervalId) {
      clearInterval(this.saveIntervalId);
      this.saveIntervalId = null;
    }
  }

  /**
   * Register exit handlers for graceful shutdown
   */
  private registerExitHandler(): void {
    if (this.exitHandlerRegistered) return;

    const exitHandler = async (signal: string) => {
      console.log(`\nReceived ${signal}, saving checkpoint...`);
      this.stopAutoSave();
      await this.save();
      console.log(`Checkpoint saved to ${this.config.filePath}`);
      process.exit(signal === 'SIGINT' ? 130 : 0);
    };

    // Handle Ctrl+C
    process.on('SIGINT', () => exitHandler('SIGINT'));
    // Handle kill
    process.on('SIGTERM', () => exitHandler('SIGTERM'));
    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('Uncaught exception:', error);
      this.stopAutoSave();
      await this.save();
      console.log(`Checkpoint saved to ${this.config.filePath}`);
      process.exit(1);
    });

    this.exitHandlerRegistered = true;
  }

  /**
   * Clean up and optionally delete checkpoint
   */
  async cleanup(deleteFile: boolean = false): Promise<void> {
    this.stopAutoSave();

    if (deleteFile && this.config.filePath) {
      await deleteCheckpoint(this.config.filePath);
    }
  }

  /**
   * Get progress summary
   */
  getProgressSummary(): {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    pending: number;
    percentComplete: number;
  } {
    if (!this.data) {
      return {
        total: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
        pending: 0,
        percentComplete: 0,
      };
    }

    const completed = this.data.processedCount;
    const failed = this.data.failedCount;
    const skipped = this.data.skippedCount;
    const pending = this.data.totalItems - completed - failed - skipped;
    const percentComplete = this.data.totalItems > 0
      ? Math.round(((completed + skipped) / this.data.totalItems) * 100)
      : 0;

    return {
      total: this.data.totalItems,
      completed,
      failed,
      skipped,
      pending,
      percentComplete,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a checkpoint manager for PDF processing
 */
export function createCheckpointManager(
  runId?: string,
  config?: Partial<CheckpointManagerConfig>
): CheckpointManager {
  const filePath = config?.filePath ?? getDefaultCheckpointPath(runId ?? 'process-pdfs');
  return new CheckpointManager({
    ...config,
    filePath,
  });
}

/**
 * Check if a previous run can be resumed
 */
export async function canResume(filePath: string): Promise<{
  canResume: boolean;
  checkpoint: CheckpointData | null;
  summary?: {
    runId: string;
    startedAt: string;
    progress: string;
    pending: number;
  };
}> {
  const checkpoint = await loadCheckpoint(filePath);
  if (!checkpoint) {
    return { canResume: false, checkpoint: null };
  }

  const completed = checkpoint.processedCount;
  const failed = checkpoint.failedCount;
  const skipped = checkpoint.skippedCount;
  const pending = checkpoint.totalItems - completed - failed - skipped;

  return {
    canResume: pending > 0,
    checkpoint,
    summary: {
      runId: checkpoint.runId,
      startedAt: checkpoint.startedAt,
      progress: `${completed + skipped}/${checkpoint.totalItems} (${Math.round(((completed + skipped) / checkpoint.totalItems) * 100)}%)`,
      pending,
    },
  };
}

/**
 * Format checkpoint summary for display
 */
export function formatCheckpointSummary(checkpoint: CheckpointData): string {
  const lines = [
    `Run ID: ${checkpoint.runId}`,
    `Started: ${checkpoint.startedAt}`,
    `Last Updated: ${checkpoint.updatedAt}`,
    `Progress: ${checkpoint.processedCount + checkpoint.skippedCount}/${checkpoint.totalItems}`,
    `  - Completed: ${checkpoint.processedCount}`,
    `  - Skipped: ${checkpoint.skippedCount}`,
    `  - Failed: ${checkpoint.failedCount}`,
    `  - Pending: ${checkpoint.totalItems - checkpoint.processedCount - checkpoint.skippedCount - checkpoint.failedCount}`,
    `Current Batch: ${checkpoint.currentBatch + 1}/${checkpoint.totalBatches}`,
  ];
  return lines.join('\n');
}
