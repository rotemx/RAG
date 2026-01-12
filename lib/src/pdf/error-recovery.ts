/**
 * PDF Extraction Error Recovery
 *
 * Utilities for handling extraction failures gracefully with recovery strategies,
 * error classification, and detailed failure reporting.
 */

import { z } from 'zod';
import {
  type PdfExtractionResult,
  type PdfExtractionOptions,
  PdfErrorCode,
  PdfExtractionError,
} from './types.js';
import { extractPdfText } from './extractor.js';
import { extractWithFallbackChain, type FallbackChainOptions } from './fallback-chain.js';

// =============================================================================
// Types and Schemas
// =============================================================================

/**
 * Recovery action that can be taken for a failed extraction
 */
export const RecoveryActionSchema = z.enum([
  /** Retry the extraction with same parameters */
  'retry',
  /** Skip this file and continue processing */
  'skip',
  /** Use fallback extraction method (e.g., pdf.js, OCR) */
  'fallback',
  /** Attempt partial extraction (fewer pages) */
  'partial',
  /** Extraction cannot be recovered - permanent failure */
  'abort',
]);

export type RecoveryAction = z.infer<typeof RecoveryActionSchema>;

/**
 * Classification of extraction failure severity
 */
export const FailureSeveritySchema = z.enum([
  /** Transient error that may succeed on retry */
  'transient',
  /** Permanent error for this file but doesn't affect others */
  'permanent',
  /** Critical error that may affect batch processing */
  'critical',
]);

export type FailureSeverity = z.infer<typeof FailureSeveritySchema>;

/**
 * Detailed failure information with recovery suggestions
 */
export const ExtractionFailureSchema = z.object({
  /** The error code */
  code: z.nativeEnum(PdfErrorCode),
  /** Human-readable error message */
  message: z.string(),
  /** Severity classification */
  severity: FailureSeveritySchema,
  /** Whether this error is potentially recoverable */
  recoverable: z.boolean(),
  /** Suggested recovery actions in order of preference */
  suggestedActions: z.array(RecoveryActionSchema),
  /** Additional context about the failure */
  context: z.record(z.unknown()).optional(),
  /** File path if available */
  filePath: z.string().optional(),
  /** Original error if available */
  originalError: z.unknown().optional(),
});

export type ExtractionFailure = z.infer<typeof ExtractionFailureSchema>;

/**
 * Options for recovery behavior
 */
export const RecoveryOptionsSchema = z.object({
  /** Maximum number of retries for transient errors (default: 2) */
  maxRetries: z.number().int().nonnegative().default(2),
  /** Delay between retries in milliseconds (default: 1000) */
  retryDelayMs: z.number().int().nonnegative().default(1000),
  /** Whether to attempt partial extraction on failure (default: true) */
  attemptPartialExtraction: z.boolean().default(true),
  /** Maximum pages to try for partial extraction (default: 5) */
  partialExtractionPages: z.number().int().positive().default(5),
  /** Whether to continue batch on permanent failures (default: true) */
  continueOnPermanentFailure: z.boolean().default(true),
  /** Whether to attempt fallback chain (pdf-parse → pdf.js → OCR) on failure (default: true) */
  attemptFallbackChain: z.boolean().default(true),
  /** Configuration for the fallback chain */
  fallbackChainOptions: z
    .object({
      /** Enable pdf.js as fallback (default: true) */
      enablePdfJs: z.boolean().default(true),
      /** Enable OCR as final fallback (default: true) */
      enableOcr: z.boolean().default(true),
      /** OCR language(s) for tesseract (default: 'heb+eng') */
      ocrLanguage: z.string().default('heb+eng'),
      /** Timeout for each extraction method in milliseconds (default: 60000) */
      timeoutMs: z.number().int().positive().default(60000),
    })
    .default({}),
  /** Callback for failure notifications */
  onFailure: z.function().args(ExtractionFailureSchema).returns(z.void()).optional(),
  /** Callback for recovery attempts */
  onRecoveryAttempt: z
    .function()
    .args(z.string(), RecoveryActionSchema, z.number())
    .returns(z.void())
    .optional(),
});

export type RecoveryOptions = z.infer<typeof RecoveryOptionsSchema>;

/**
 * Result of extraction with recovery attempts
 */
export const RecoveredExtractionResultSchema = z.object({
  /** The extraction result (may be partial or from fallback) */
  result: z.custom<PdfExtractionResult>(),
  /** Whether recovery was needed */
  recoveryNeeded: z.boolean(),
  /** Number of recovery attempts made */
  recoveryAttempts: z.number().int().nonnegative(),
  /** Actions attempted during recovery */
  actionsAttempted: z.array(RecoveryActionSchema),
  /** Final failure info if extraction ultimately failed */
  failure: ExtractionFailureSchema.optional(),
  /** Whether the result is partial (fewer pages than original) */
  isPartial: z.boolean(),
});

export type RecoveredExtractionResult = z.infer<typeof RecoveredExtractionResultSchema>;

/**
 * Batch extraction statistics
 */
export const BatchExtractionStatsSchema = z.object({
  /** Total files processed */
  totalFiles: z.number().int().nonnegative(),
  /** Successfully extracted files */
  successCount: z.number().int().nonnegative(),
  /** Failed files */
  failureCount: z.number().int().nonnegative(),
  /** Partial extractions */
  partialCount: z.number().int().nonnegative(),
  /** Files recovered after retry */
  recoveredCount: z.number().int().nonnegative(),
  /** Total retry attempts */
  totalRetryAttempts: z.number().int().nonnegative(),
  /** Total characters extracted */
  totalCharacters: z.number().int().nonnegative(),
  /** Total pages processed */
  totalPages: z.number().int().nonnegative(),
  /** Total processing time in milliseconds */
  totalDurationMs: z.number().nonnegative(),
  /** Average time per file in milliseconds */
  avgDurationMs: z.number().nonnegative(),
  /** Failures grouped by error code */
  failuresByCode: z.record(z.nativeEnum(PdfErrorCode), z.number().int()),
  /** List of failed file paths */
  failedFiles: z.array(z.string()),
  /** Success rate as percentage (0-100) */
  successRate: z.number().min(0).max(100),
});

export type BatchExtractionStats = z.infer<typeof BatchExtractionStatsSchema>;

// =============================================================================
// Error Classification Functions
// =============================================================================

/**
 * Classify an extraction error and determine recovery options
 *
 * @param error - The error or error code to classify
 * @param filePath - Optional file path for context
 * @returns Detailed failure information with recovery suggestions
 */
export function classifyExtractionFailure(
  error: PdfExtractionError | PdfExtractionResult | Error | string,
  filePath?: string
): ExtractionFailure {
  // Handle PdfExtractionResult with error
  if (typeof error === 'object' && 'success' in error && !error.success) {
    const result = error;
    const errorMessage = result.error ?? 'Unknown extraction error';

    // Infer error code from message
    const code = inferErrorCodeFromMessage(errorMessage);
    return createFailureFromCode(code, errorMessage, filePath);
  }

  // Handle PdfExtractionError
  if (error instanceof PdfExtractionError) {
    return createFailureFromCode(
      error.code,
      error.message,
      error.filePath ?? filePath,
      error.cause
    );
  }

  // Handle generic Error
  if (error instanceof Error) {
    const code = inferErrorCodeFromMessage(error.message);
    return createFailureFromCode(code, error.message, filePath, error);
  }

  // Handle string error message
  if (typeof error === 'string') {
    const code = inferErrorCodeFromMessage(error);
    return createFailureFromCode(code, error, filePath);
  }

  // Unknown error type
  return createFailureFromCode(
    PdfErrorCode.EXTRACTION_ERROR,
    'Unknown error type',
    filePath,
    error
  );
}

/**
 * Infer error code from error message patterns
 */
function inferErrorCodeFromMessage(message: string): PdfErrorCode {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('not found') || lowerMessage.includes('no such file')) {
    return PdfErrorCode.FILE_NOT_FOUND;
  }

  if (lowerMessage.includes('password')) {
    return PdfErrorCode.PASSWORD_PROTECTED;
  }

  if (
    lowerMessage.includes('invalid') ||
    lowerMessage.includes('corrupt') ||
    lowerMessage.includes('malformed')
  ) {
    return PdfErrorCode.INVALID_PDF;
  }

  if (
    lowerMessage.includes('empty') ||
    lowerMessage.includes('no extractable text') ||
    lowerMessage.includes('no text')
  ) {
    return PdfErrorCode.EMPTY_CONTENT;
  }

  if (
    lowerMessage.includes('permission') ||
    lowerMessage.includes('access denied') ||
    lowerMessage.includes('cannot read')
  ) {
    return PdfErrorCode.READ_ERROR;
  }

  if (
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('timed out') ||
    lowerMessage.includes('etimedout')
  ) {
    return PdfErrorCode.TIMEOUT;
  }

  if (
    lowerMessage.includes('memory') ||
    lowerMessage.includes('heap') ||
    lowerMessage.includes('enomem') ||
    lowerMessage.includes('out of memory')
  ) {
    return PdfErrorCode.MEMORY_EXCEEDED;
  }

  return PdfErrorCode.EXTRACTION_ERROR;
}

/**
 * Create a failure object from an error code
 */
function createFailureFromCode(
  code: PdfErrorCode,
  message: string,
  filePath?: string,
  originalError?: unknown
): ExtractionFailure {
  const config = ERROR_CODE_CONFIG[code];

  return {
    code,
    message,
    severity: config.severity,
    recoverable: config.recoverable,
    suggestedActions: config.suggestedActions,
    filePath,
    originalError,
  };
}

/**
 * Configuration for each error code
 */
const ERROR_CODE_CONFIG: Record<
  PdfErrorCode,
  {
    severity: FailureSeverity;
    recoverable: boolean;
    suggestedActions: RecoveryAction[];
  }
> = {
  [PdfErrorCode.FILE_NOT_FOUND]: {
    severity: 'permanent',
    recoverable: false,
    suggestedActions: ['skip', 'abort'],
  },
  [PdfErrorCode.INVALID_PDF]: {
    severity: 'permanent',
    recoverable: false,
    suggestedActions: ['fallback', 'skip', 'abort'],
  },
  [PdfErrorCode.PASSWORD_PROTECTED]: {
    severity: 'permanent',
    recoverable: false,
    suggestedActions: ['skip', 'abort'],
  },
  [PdfErrorCode.EMPTY_CONTENT]: {
    severity: 'permanent',
    recoverable: true,
    suggestedActions: ['fallback', 'partial', 'skip'],
  },
  [PdfErrorCode.READ_ERROR]: {
    severity: 'transient',
    recoverable: true,
    suggestedActions: ['retry', 'skip'],
  },
  [PdfErrorCode.EXTRACTION_ERROR]: {
    severity: 'transient',
    recoverable: true,
    suggestedActions: ['retry', 'partial', 'fallback', 'skip'],
  },
  [PdfErrorCode.TIMEOUT]: {
    severity: 'transient',
    recoverable: true,
    suggestedActions: ['retry', 'partial', 'skip'],
  },
  [PdfErrorCode.MEMORY_EXCEEDED]: {
    severity: 'critical',
    recoverable: true,
    suggestedActions: ['partial', 'skip', 'abort'],
  },
};

// =============================================================================
// Recovery Functions
// =============================================================================

/**
 * Check if an extraction failure is recoverable
 *
 * @param failure - The failure to check
 * @returns Whether recovery should be attempted
 */
export function isRecoverable(failure: ExtractionFailure): boolean {
  return failure.recoverable && failure.suggestedActions.length > 0;
}

/**
 * Check if an error is transient (may succeed on retry)
 *
 * @param failure - The failure to check
 * @returns Whether the error is transient
 */
export function isTransientError(failure: ExtractionFailure): boolean {
  return failure.severity === 'transient';
}

/**
 * Get the primary suggested recovery action
 *
 * @param failure - The failure to get action for
 * @returns The primary suggested action or 'abort' if none
 */
export function getPrimaryRecoveryAction(failure: ExtractionFailure): RecoveryAction {
  return failure.suggestedActions[0] ?? 'abort';
}

/**
 * Extract text with automatic recovery on failure
 *
 * Attempts extraction and applies recovery strategies if the initial
 * extraction fails. Supports retry, partial extraction, and fallback.
 *
 * @param input - File path or buffer to extract
 * @param options - Extraction options
 * @param recoveryOptions - Recovery behavior options
 * @returns Extraction result with recovery information
 *
 * @example
 * ```typescript
 * const result = await extractWithRecovery('/path/to/law.pdf', undefined, {
 *   maxRetries: 3,
 *   attemptPartialExtraction: true,
 *   onFailure: (failure) => console.log(`Failed: ${failure.message}`),
 * });
 *
 * if (result.result.success) {
 *   console.log(`Extracted ${result.result.charCount} chars`);
 *   if (result.recoveryNeeded) {
 *     console.log(`Recovery succeeded after ${result.recoveryAttempts} attempts`);
 *   }
 * }
 * ```
 */
export async function extractWithRecovery(
  input: string | Buffer,
  options?: PdfExtractionOptions,
  recoveryOptions?: Partial<RecoveryOptions>
): Promise<RecoveredExtractionResult> {
  const opts = RecoveryOptionsSchema.parse(recoveryOptions ?? {});
  const filePath = typeof input === 'string' ? input : undefined;

  const actionsAttempted: RecoveryAction[] = [];
  let recoveryAttempts = 0;
  let isPartial = false;

  // Initial extraction attempt
  let result = await extractPdfText(input, options);

  // If successful, return immediately
  if (result.success) {
    return {
      result,
      recoveryNeeded: false,
      recoveryAttempts: 0,
      actionsAttempted: [],
      isPartial: false,
    };
  }

  // Classify the failure
  let failure = classifyExtractionFailure(result, filePath);
  opts.onFailure?.(failure);

  // If not recoverable, return failure
  if (!isRecoverable(failure)) {
    return {
      result,
      recoveryNeeded: true,
      recoveryAttempts: 0,
      actionsAttempted: [],
      failure,
      isPartial: false,
    };
  }

  // Attempt recovery based on suggested actions
  for (const action of failure.suggestedActions) {
    if (action === 'abort' || action === 'skip') {
      actionsAttempted.push(action);
      break;
    }

    if (action === 'retry' && recoveryAttempts < opts.maxRetries) {
      actionsAttempted.push('retry');

      for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
        recoveryAttempts++;
        opts.onRecoveryAttempt?.(filePath ?? '<buffer>', 'retry', attempt + 1);

        // Wait before retry
        if (opts.retryDelayMs > 0) {
          await sleep(opts.retryDelayMs);
        }

        result = await extractPdfText(input, options);

        if (result.success) {
          return {
            result,
            recoveryNeeded: true,
            recoveryAttempts,
            actionsAttempted,
            isPartial: false,
          };
        }
      }

      // Update failure after retries
      failure = classifyExtractionFailure(result, filePath);
    }

    if (action === 'partial' && opts.attemptPartialExtraction) {
      actionsAttempted.push('partial');
      recoveryAttempts++;
      opts.onRecoveryAttempt?.(filePath ?? '<buffer>', 'partial', recoveryAttempts);

      // Try extracting fewer pages
      const partialOptions: PdfExtractionOptions = {
        ...options,
        maxPages: opts.partialExtractionPages,
      };

      result = await extractPdfText(input, partialOptions);

      if (result.success) {
        isPartial = true;
        return {
          result,
          recoveryNeeded: true,
          recoveryAttempts,
          actionsAttempted,
          isPartial: true,
        };
      }

      failure = classifyExtractionFailure(result, filePath);
    }

    // Use fallback chain (pdf-parse → pdf.js → OCR)
    if (action === 'fallback' && opts.attemptFallbackChain) {
      actionsAttempted.push('fallback');
      recoveryAttempts++;
      opts.onRecoveryAttempt?.(filePath ?? '<buffer>', 'fallback', recoveryAttempts);

      // Build fallback chain options, starting from pdf.js since pdf-parse already failed
      const fallbackOpts: Partial<FallbackChainOptions> = {
        enablePdfParse: false, // Already tried pdf-parse
        enablePdfJs: opts.fallbackChainOptions.enablePdfJs,
        enableOcr: opts.fallbackChainOptions.enableOcr,
        ocrLanguage: opts.fallbackChainOptions.ocrLanguage,
        timeoutMs: opts.fallbackChainOptions.timeoutMs,
      };

      const fallbackResult = await extractWithFallbackChain(input, options, fallbackOpts);

      if (fallbackResult.result.success) {
        return {
          result: fallbackResult.result,
          recoveryNeeded: true,
          recoveryAttempts,
          actionsAttempted,
          isPartial: fallbackResult.result.isPartial ?? false,
        };
      }

      // Update failure from fallback chain result
      failure = classifyExtractionFailure(fallbackResult.result, filePath);
    }
  }

  // All recovery attempts exhausted
  return {
    result,
    recoveryNeeded: true,
    recoveryAttempts,
    actionsAttempted,
    failure,
    isPartial,
  };
}

/**
 * Batch extract with recovery and statistics
 *
 * Processes multiple PDF files with automatic recovery and generates
 * detailed statistics about the batch operation.
 *
 * @param filePaths - Array of file paths to process
 * @param options - Extraction options for all files
 * @param recoveryOptions - Recovery behavior options
 * @param concurrency - Maximum concurrent extractions (default: 5)
 * @returns Object with results array and batch statistics
 *
 * @example
 * ```typescript
 * const { results, stats } = await extractBatchWithRecovery(
 *   ['/path/to/law1.pdf', '/path/to/law2.pdf'],
 *   undefined,
 *   { maxRetries: 2 },
 *   3
 * );
 *
 * console.log(`Success rate: ${stats.successRate.toFixed(1)}%`);
 * console.log(`Recovered: ${stats.recoveredCount} files`);
 * console.log(`Failed: ${stats.failedFiles.join(', ')}`);
 * ```
 */
export async function extractBatchWithRecovery(
  filePaths: string[],
  options?: PdfExtractionOptions,
  recoveryOptions?: Partial<RecoveryOptions>,
  concurrency: number = 5
): Promise<{ results: RecoveredExtractionResult[]; stats: BatchExtractionStats }> {
  const startTime = performance.now();
  const results: RecoveredExtractionResult[] = [];

  if (filePaths.length === 0) {
    return {
      results: [],
      stats: createEmptyStats(),
    };
  }

  // Process in batches to limit concurrency
  for (let i = 0; i < filePaths.length; i += concurrency) {
    const batch = filePaths.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((path) => extractWithRecovery(path, options, recoveryOptions))
    );
    results.push(...batchResults);
  }

  const totalDurationMs = performance.now() - startTime;

  // Calculate statistics
  const stats = calculateBatchStats(results, filePaths, totalDurationMs);

  return { results, stats };
}

/**
 * Create empty batch statistics
 */
function createEmptyStats(): BatchExtractionStats {
  return {
    totalFiles: 0,
    successCount: 0,
    failureCount: 0,
    partialCount: 0,
    recoveredCount: 0,
    totalRetryAttempts: 0,
    totalCharacters: 0,
    totalPages: 0,
    totalDurationMs: 0,
    avgDurationMs: 0,
    failuresByCode: {},
    failedFiles: [],
    successRate: 100,
  };
}

/**
 * Calculate batch extraction statistics
 */
function calculateBatchStats(
  results: RecoveredExtractionResult[],
  filePaths: string[],
  totalDurationMs: number
): BatchExtractionStats {
  const failuresByCode: Partial<Record<PdfErrorCode, number>> = {};
  const failedFiles: string[] = [];

  let successCount = 0;
  let failureCount = 0;
  let partialCount = 0;
  let recoveredCount = 0;
  let totalRetryAttempts = 0;
  let totalCharacters = 0;
  let totalPages = 0;

  results.forEach((recoveredResult, index) => {
    const { result, recoveryNeeded, recoveryAttempts, failure, isPartial } = recoveredResult;
    totalRetryAttempts += recoveryAttempts;

    if (result.success) {
      successCount++;
      totalCharacters += result.charCount;
      totalPages += result.pageCount;

      if (isPartial) {
        partialCount++;
      }

      if (recoveryNeeded) {
        recoveredCount++;
      }
    } else {
      failureCount++;
      failedFiles.push(filePaths[index] ?? `file_${index}`);

      if (failure) {
        failuresByCode[failure.code] = (failuresByCode[failure.code] ?? 0) + 1;
      }
    }
  });

  const totalFiles = results.length;
  const successRate = totalFiles > 0 ? (successCount / totalFiles) * 100 : 100;
  const avgDurationMs = totalFiles > 0 ? totalDurationMs / totalFiles : 0;

  return {
    totalFiles,
    successCount,
    failureCount,
    partialCount,
    recoveredCount,
    totalRetryAttempts,
    totalCharacters,
    totalPages,
    totalDurationMs,
    avgDurationMs,
    failuresByCode: failuresByCode as Record<PdfErrorCode, number>,
    failedFiles,
    successRate,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format extraction failure for logging
 *
 * @param failure - The failure to format
 * @returns Human-readable failure description
 */
export function formatFailure(failure: ExtractionFailure): string {
  const parts = [`[${failure.code}]`, failure.message, `(${failure.severity})`];

  if (failure.filePath) {
    parts.push(`File: ${failure.filePath}`);
  }

  if (failure.recoverable) {
    parts.push(`Suggested: ${failure.suggestedActions.join(', ')}`);
  }

  return parts.join(' - ');
}

/**
 * Format batch statistics for logging
 *
 * @param stats - The statistics to format
 * @returns Human-readable statistics summary
 */
export function formatBatchStats(stats: BatchExtractionStats): string {
  const lines = [
    `Batch Extraction Summary`,
    `========================`,
    `Total files: ${stats.totalFiles}`,
    `Success: ${stats.successCount} (${stats.successRate.toFixed(1)}%)`,
    `Failed: ${stats.failureCount}`,
    `Partial: ${stats.partialCount}`,
    `Recovered: ${stats.recoveredCount}`,
    `Total retries: ${stats.totalRetryAttempts}`,
    ``,
    `Content Extracted:`,
    `  Characters: ${stats.totalCharacters.toLocaleString()}`,
    `  Pages: ${stats.totalPages.toLocaleString()}`,
    ``,
    `Performance:`,
    `  Total time: ${(stats.totalDurationMs / 1000).toFixed(2)}s`,
    `  Avg per file: ${stats.avgDurationMs.toFixed(0)}ms`,
  ];

  if (Object.keys(stats.failuresByCode).length > 0) {
    lines.push('', 'Failures by type:');
    for (const [code, count] of Object.entries(stats.failuresByCode)) {
      lines.push(`  ${code}: ${count}`);
    }
  }

  if (stats.failedFiles.length > 0 && stats.failedFiles.length <= 10) {
    lines.push('', 'Failed files:');
    for (const file of stats.failedFiles) {
      lines.push(`  - ${file}`);
    }
  } else if (stats.failedFiles.length > 10) {
    lines.push('', `Failed files: ${stats.failedFiles.length} (first 10):`);
    for (const file of stats.failedFiles.slice(0, 10)) {
      lines.push(`  - ${file}`);
    }
    lines.push(`  ... and ${stats.failedFiles.length - 10} more`);
  }

  return lines.join('\n');
}

/**
 * Create a summary extraction result from multiple results
 *
 * Useful for aggregating partial results when processing fails midway.
 *
 * @param results - Array of extraction results
 * @returns Combined text and metadata
 */
export function aggregateExtractionResults(results: PdfExtractionResult[]): {
  text: string;
  totalCharCount: number;
  totalPageCount: number;
  successCount: number;
  failureCount: number;
} {
  const successfulResults = results.filter((r) => r.success);

  return {
    text: successfulResults.map((r) => r.text).join('\n\n---\n\n'),
    totalCharCount: successfulResults.reduce((sum, r) => sum + r.charCount, 0),
    totalPageCount: successfulResults.reduce((sum, r) => sum + r.pageCount, 0),
    successCount: successfulResults.length,
    failureCount: results.length - successfulResults.length,
  };
}

/**
 * Check if a batch had acceptable success rate
 *
 * @param stats - Batch statistics to check
 * @param minimumSuccessRate - Minimum acceptable success rate (0-100, default: 80)
 * @returns Whether the batch meets the success threshold
 */
export function isBatchSuccessful(
  stats: BatchExtractionStats,
  minimumSuccessRate: number = 80
): boolean {
  return stats.successRate >= minimumSuccessRate;
}
