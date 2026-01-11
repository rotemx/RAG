/**
 * Progress Module
 *
 * Exports all progress reporting types, classes, and utilities.
 */

// Types and schemas
export {
  ProgressState,
  ProgressStateSchema,
  ProgressEntrySchema,
  type ProgressEntry,
  ProgressReporterConfigSchema,
  type ProgressReporterConfig,
  createDefaultProgressConfig,
  ProgressUpdateSchema,
  type ProgressUpdate,
  BatchStatisticsSchema,
  type BatchStatistics,
  calculatePercentage,
  estimateRemainingTime,
  calculateItemsPerSecond,
  formatDuration,
  formatProgress,
  createProgressBar,
  formatBatchStatistics,
} from './types.js';

// Reporter classes and utilities
export {
  ProgressReporter,
  createProgressReporter,
  createSilentProgressReporter,
  createVerboseProgressReporter,
  type ProgressStage,
  MultiStageProgressReporter,
  createMultiStageProgressReporter,
} from './reporter.js';
