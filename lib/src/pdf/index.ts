/**
 * PDF Processing Module
 *
 * This module exports PDF extraction and processing functionality
 * for the Israeli Law RAG project.
 */

// Types and schemas
export {
  // Schemas
  PdfExtractionResultSchema,
  PdfExtractionOptionsSchema,
  PdfErrorCodeSchema,
  ExtractionMethodSchema,
  // Error handling
  PdfErrorCode,
  PdfExtractionError,
  isPdfExtractionError,
  // Result factory functions
  createSuccessResult,
  createFailureResult,
  createPartialResult,
  // Error classification utilities
  isRecoverableErrorCode,
  isPermanentErrorCode,
  isExtractionFailure,
  isPartialExtraction,
  getResultErrorCode,
  // Types
  type PdfExtractionResult,
  type PdfExtractionOptions,
  type PdfInput,
  type ExtractionMethod,
} from './types.js';

// Extraction functions
export {
  extractPdfText,
  extractPdfTextFromBuffer,
  extractPdfTextFromFile,
  extractPdfTextBatch,
  getBatchExtractionSummary,
} from './extractor.js';

// Error recovery and graceful failure handling
export {
  // Schemas
  RecoveryActionSchema,
  FailureSeveritySchema,
  ExtractionFailureSchema,
  RecoveryOptionsSchema,
  RecoveredExtractionResultSchema,
  BatchExtractionStatsSchema,
  // Functions
  classifyExtractionFailure,
  isRecoverable,
  isTransientError,
  getPrimaryRecoveryAction,
  extractWithRecovery,
  extractBatchWithRecovery,
  formatFailure,
  formatBatchStats,
  aggregateExtractionResults,
  isBatchSuccessful,
  // Types
  type RecoveryAction,
  type FailureSeverity,
  type ExtractionFailure,
  type RecoveryOptions,
  type RecoveredExtractionResult,
  type BatchExtractionStats,
} from './error-recovery.js';

// Fallback chain (pdf-parse → pdf.js → OCR)
export {
  // Schemas and types
  FallbackChainOptionsSchema,
  FallbackChainResultSchema,
  type FallbackChainOptions,
  type FallbackChainResult,
  // Individual extractors
  extractWithPdfJs,
  extractWithOcr,
  // Fallback chain functions
  extractWithFallbackChain,
  extractBatchWithFallbackChain,
  getFallbackChainBatchSummary,
  formatFallbackChainResult,
} from './fallback-chain.js';

// Hebrew text cleanup
export {
  // Types and schemas
  HebrewCleanupOptionsSchema,
  HebrewCleanupResultSchema,
  type HebrewCleanupOptions,
  type HebrewCleanupResult,
  // Main cleanup functions
  cleanupHebrewText,
  quickCleanup,
  // Individual cleanup utilities
  removeControlCharacters,
  normalizeWhitespace,
  normalizePunctuation,
  removePageNumbers,
  removeHeadersFooters,
  removeShortLines,
  // Hebrew text analysis
  isHebrewLetter,
  isHebrewChar,
  countHebrewChars,
  hebrewRatio,
  detectTextDirection,
  // Reversed text handling
  isTextReversed,
  reverseHebrewWord,
  fixReversedHebrewText,
} from './hebrew-cleanup.js';
