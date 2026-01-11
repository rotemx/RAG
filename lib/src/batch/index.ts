/**
 * Batch Processing Module
 *
 * Efficient batch processing utilities for large-scale operations.
 * Designed to handle ~3,900 PDFs (~1GB) efficiently with:
 * - Memory monitoring and adaptive concurrency
 * - Persistent checkpoints for crash recovery
 * - Stream-based processing to minimize memory footprint
 */

// Types
export * from './types.js';

// Memory Management
export {
  getMemorySnapshot,
  formatMemorySnapshot,
  requestGC,
  triggerGCIfNeeded,
  performBatchCleanup,
  MemoryMonitor,
  AdaptiveConcurrencyController,
  createPdfProcessingMemoryMonitor,
  createPdfProcessingConcurrencyController,
  type MemoryMonitorCallbacks,
  type AdaptiveConcurrencyConfig,
} from './memory.js';

// Checkpoint Management
export {
  checkpointExists,
  loadCheckpoint,
  saveCheckpoint,
  deleteCheckpoint,
  CheckpointManager,
  createCheckpointManager,
  canResume,
  formatCheckpointSummary,
  type CheckpointManagerConfig,
} from './checkpoint.js';

// Batch Processor
export {
  StreamBatchProcessor,
  createPdfBatchProcessor,
  toBatchItems,
  streamFromCursor,
  paginatedStream,
} from './processor.js';
