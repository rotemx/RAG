/**
 * PDF Processing Types
 *
 * TypeScript type definitions for PDF extraction and processing
 * in the Israeli Law RAG project.
 */

import { z } from 'zod';

// =============================================================================
// Error Codes (must be defined first for use in schemas)
// =============================================================================

/**
 * Error codes for PDF extraction failures
 */
export const PdfErrorCode = {
  /** File not found or path invalid */
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  /** Invalid or corrupted PDF */
  INVALID_PDF: 'INVALID_PDF',
  /** PDF is password protected */
  PASSWORD_PROTECTED: 'PASSWORD_PROTECTED',
  /** Empty PDF or no extractable text */
  EMPTY_CONTENT: 'EMPTY_CONTENT',
  /** Read error (permissions, etc.) */
  READ_ERROR: 'READ_ERROR',
  /** Unknown extraction error */
  EXTRACTION_ERROR: 'EXTRACTION_ERROR',
  /** Timeout during extraction */
  TIMEOUT: 'TIMEOUT',
  /** Memory limit exceeded */
  MEMORY_EXCEEDED: 'MEMORY_EXCEEDED',
} as const;

export type PdfErrorCode = (typeof PdfErrorCode)[keyof typeof PdfErrorCode];

/**
 * Zod schema for PdfErrorCode validation
 */
export const PdfErrorCodeSchema = z.enum([
  'FILE_NOT_FOUND',
  'INVALID_PDF',
  'PASSWORD_PROTECTED',
  'EMPTY_CONTENT',
  'READ_ERROR',
  'EXTRACTION_ERROR',
  'TIMEOUT',
  'MEMORY_EXCEEDED',
]);

// =============================================================================
// Extraction Schemas
// =============================================================================

/**
 * Extraction method used for PDF processing
 */
export const ExtractionMethodSchema = z.enum(['pdf-parse', 'pdfjs', 'ocr', 'fallback']);

export type ExtractionMethod = z.infer<typeof ExtractionMethodSchema>;

/**
 * PDF extraction result
 */
export const PdfExtractionResultSchema = z.object({
  /** Raw extracted text from the PDF */
  text: z.string(),
  /** Number of pages in the PDF */
  pageCount: z.number().int().nonnegative(),
  /** PDF metadata if available */
  metadata: z.record(z.unknown()).nullable().optional(),
  /** PDF info object if available */
  info: z.record(z.unknown()).nullable().optional(),
  /** Character count of extracted text */
  charCount: z.number().int().nonnegative(),
  /** Whether extraction was successful */
  success: z.boolean(),
  /** Error message if extraction failed */
  error: z.string().nullable().optional(),
  /** Error code for programmatic error handling */
  errorCode: PdfErrorCodeSchema.optional(),
  /** Extraction method used */
  method: ExtractionMethodSchema.default('pdf-parse'),
  /** Processing duration in milliseconds */
  durationMs: z.number().nonnegative().optional(),
  /** Whether this is a partial extraction (fewer pages than original) */
  isPartial: z.boolean().optional(),
  /** File path if available (for batch processing) */
  filePath: z.string().optional(),
});

export type PdfExtractionResult = z.infer<typeof PdfExtractionResultSchema>;

/**
 * Options for PDF text extraction
 */
export const PdfExtractionOptionsSchema = z.object({
  /** Maximum number of pages to extract (undefined = all pages) */
  maxPages: z.number().int().positive().optional(),
  /** Custom page render function */
  pageRenderer: z.function().args(z.any()).returns(z.union([z.string(), z.promise(z.string())])).optional(),
});

export type PdfExtractionOptions = z.infer<typeof PdfExtractionOptionsSchema>;

/**
 * Input source for PDF extraction
 */
export type PdfInput = Buffer | string;

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Custom error class for PDF extraction failures
 */
export class PdfExtractionError extends Error {
  readonly code: PdfErrorCode;
  readonly filePath: string | undefined;
  readonly cause: Error | undefined;

  constructor(
    message: string,
    code: PdfErrorCode,
    options?: { filePath?: string | undefined; cause?: Error | undefined }
  ) {
    super(message);
    this.name = 'PdfExtractionError';
    this.code = code;
    this.filePath = options?.filePath;
    this.cause = options?.cause;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PdfExtractionError);
    }
  }

  /**
   * Create a PdfExtractionError from an unknown error
   */
  static fromError(error: unknown, code?: PdfErrorCode, filePath?: string): PdfExtractionError {
    if (error instanceof PdfExtractionError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;

    return new PdfExtractionError(
      message,
      code ?? PdfErrorCode.EXTRACTION_ERROR,
      { filePath, cause }
    );
  }
}

/**
 * Type guard to check if an error is a PdfExtractionError
 */
export function isPdfExtractionError(error: unknown): error is PdfExtractionError {
  return error instanceof PdfExtractionError;
}

// =============================================================================
// Result Factory Functions
// =============================================================================

/**
 * Create a successful extraction result
 */
export function createSuccessResult(
  text: string,
  pageCount: number,
  options?: {
    metadata?: Record<string, unknown> | null;
    info?: Record<string, unknown> | null;
    durationMs?: number;
    method?: ExtractionMethod;
    isPartial?: boolean;
    filePath?: string;
  }
): PdfExtractionResult {
  return {
    text,
    pageCount,
    charCount: text.length,
    success: true,
    error: null,
    method: options?.method ?? 'pdf-parse',
    metadata: options?.metadata ?? null,
    info: options?.info ?? null,
    durationMs: options?.durationMs,
    isPartial: options?.isPartial,
    filePath: options?.filePath,
  };
}

/**
 * Create a failed extraction result
 */
export function createFailureResult(
  error: string,
  options?: {
    pageCount?: number;
    durationMs?: number;
    errorCode?: PdfErrorCode;
    method?: ExtractionMethod;
    filePath?: string;
  }
): PdfExtractionResult {
  return {
    text: '',
    pageCount: options?.pageCount ?? 0,
    charCount: 0,
    success: false,
    error,
    errorCode: options?.errorCode,
    method: options?.method ?? 'pdf-parse',
    metadata: null,
    info: null,
    durationMs: options?.durationMs,
    filePath: options?.filePath,
  };
}

/**
 * Create a partial extraction result
 *
 * Use this when extraction succeeds but with fewer pages than originally requested.
 */
export function createPartialResult(
  text: string,
  pageCount: number,
  options?: {
    metadata?: Record<string, unknown> | null;
    info?: Record<string, unknown> | null;
    durationMs?: number;
    method?: ExtractionMethod;
    filePath?: string;
  }
): PdfExtractionResult {
  return createSuccessResult(text, pageCount, {
    ...options,
    isPartial: true,
  });
}

// =============================================================================
// Error Classification Utilities
// =============================================================================

/**
 * Check if an error code indicates a recoverable error
 */
export function isRecoverableErrorCode(code: PdfErrorCode): boolean {
  return code === PdfErrorCode.READ_ERROR ||
         code === PdfErrorCode.EXTRACTION_ERROR ||
         code === PdfErrorCode.TIMEOUT;
}

/**
 * Check if an error code indicates a permanent failure
 */
export function isPermanentErrorCode(code: PdfErrorCode): boolean {
  return code === PdfErrorCode.FILE_NOT_FOUND ||
         code === PdfErrorCode.INVALID_PDF ||
         code === PdfErrorCode.PASSWORD_PROTECTED;
}

/**
 * Check if an extraction result represents a failure
 */
export function isExtractionFailure(result: PdfExtractionResult): boolean {
  return !result.success;
}

/**
 * Check if an extraction result is partial
 */
export function isPartialExtraction(result: PdfExtractionResult): boolean {
  return result.isPartial === true;
}

/**
 * Get the error code from a result if it failed
 */
export function getResultErrorCode(result: PdfExtractionResult): PdfErrorCode | undefined {
  if (result.success) {
    return undefined;
  }
  return result.errorCode;
}
