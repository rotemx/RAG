/**
 * PDF Extraction Fallback Chain
 *
 * Implements a fallback chain for PDF text extraction:
 * 1. pdf-parse (primary - fast, good for text-based PDFs)
 * 2. pdf.js (secondary - better compatibility, handles complex PDFs)
 * 3. tesseract.js OCR (tertiary - for scanned/image-based PDFs)
 *
 * The chain automatically progresses to the next method when:
 * - Current method fails completely
 * - Current method returns empty content
 * - Current method throws an error
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import {
  type PdfExtractionResult,
  type PdfExtractionOptions,
  type PdfInput,
  type ExtractionMethod,
  PdfExtractionError,
  PdfErrorCode,
  createSuccessResult,
  createFailureResult,
} from './types.js';
import { extractPdfText } from './extractor.js';

// =============================================================================
// Types and Schemas
// =============================================================================

/**
 * Configuration for the fallback chain
 */
export const FallbackChainOptionsSchema = z.object({
  /** Enable pdf-parse as the first method (default: true) */
  enablePdfParse: z.boolean().default(true),
  /** Enable pdf.js as fallback (default: true) */
  enablePdfJs: z.boolean().default(true),
  /** Enable OCR as final fallback (default: true) */
  enableOcr: z.boolean().default(true),
  /** Minimum character count to consider extraction successful (default: 50) */
  minCharCount: z.number().int().nonnegative().default(50),
  /** Minimum ratio of content to pages (chars per page) for success (default: 10) */
  minCharsPerPage: z.number().nonnegative().default(10),
  /** OCR language(s) for tesseract (default: 'heb+eng') */
  ocrLanguage: z.string().default('heb+eng'),
  /** Timeout for each extraction method in milliseconds (default: 60000) */
  timeoutMs: z.number().int().positive().default(60000),
  /** Callback for progress notifications */
  onProgress: z
    .function()
    .args(z.string(), z.nativeEnum({ 'pdf-parse': 'pdf-parse', pdfjs: 'pdfjs', ocr: 'ocr', fallback: 'fallback' } as const))
    .returns(z.void())
    .optional(),
  /** Callback for method attempt notifications */
  onMethodAttempt: z
    .function()
    .args(
      z.nativeEnum({ 'pdf-parse': 'pdf-parse', pdfjs: 'pdfjs', ocr: 'ocr', fallback: 'fallback' } as const),
      z.boolean(),
      z.string().optional()
    )
    .returns(z.void())
    .optional(),
});

export type FallbackChainOptions = z.infer<typeof FallbackChainOptionsSchema>;

/**
 * Result from fallback chain extraction
 */
export const FallbackChainResultSchema = z.object({
  /** The extraction result */
  result: z.custom<PdfExtractionResult>(),
  /** Methods attempted in order */
  methodsAttempted: z.array(z.enum(['pdf-parse', 'pdfjs', 'ocr', 'fallback'])),
  /** Which method ultimately succeeded (or undefined if all failed) */
  successfulMethod: z.enum(['pdf-parse', 'pdfjs', 'ocr', 'fallback']).optional(),
  /** Error messages from failed methods */
  failedAttempts: z.array(
    z.object({
      method: z.enum(['pdf-parse', 'pdfjs', 'ocr', 'fallback']),
      error: z.string(),
      durationMs: z.number().nonnegative(),
    })
  ),
  /** Total duration across all attempts */
  totalDurationMs: z.number().nonnegative(),
});

export type FallbackChainResult = z.infer<typeof FallbackChainResultSchema>;

// =============================================================================
// PDF.js Extractor
// =============================================================================

/**
 * Extract text from a PDF using pdf.js library
 *
 * pdf.js is Mozilla's PDF rendering library and provides better
 * compatibility with complex PDFs than pdf-parse.
 *
 * @param input - File path or Buffer containing PDF data
 * @param options - Extraction options
 * @returns Extraction result
 */
export async function extractWithPdfJs(
  input: PdfInput,
  options?: PdfExtractionOptions
): Promise<PdfExtractionResult> {
  const startTime = performance.now();
  let filePath: string | undefined;

  try {
    // Dynamic import of pdfjs-dist to avoid loading it if not needed
    const pdfjsLib = await import('pdfjs-dist');

    let data: Uint8Array;

    // Handle string input (file path)
    if (typeof input === 'string') {
      filePath = input;

      if (!existsSync(input)) {
        throw new PdfExtractionError(
          `PDF file not found: ${input}`,
          PdfErrorCode.FILE_NOT_FOUND,
          { filePath: input }
        );
      }

      const buffer = await readFile(input);
      data = new Uint8Array(buffer);
    } else if (Buffer.isBuffer(input)) {
      data = new Uint8Array(input);
    } else {
      throw new PdfExtractionError(
        'Invalid input: expected file path (string) or Buffer',
        PdfErrorCode.EXTRACTION_ERROR
      );
    }

    // Validate PDF header
    if (data.length < 5) {
      throw new PdfExtractionError(
        'PDF buffer is too small',
        PdfErrorCode.INVALID_PDF,
        filePath !== undefined ? { filePath } : undefined
      );
    }

    const header = String.fromCharCode(...data.slice(0, 5));
    if (!header.startsWith('%PDF-')) {
      throw new PdfExtractionError(
        'Invalid PDF: file does not start with PDF header',
        PdfErrorCode.INVALID_PDF,
        filePath !== undefined ? { filePath } : undefined
      );
    }

    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({
      data,
      // Disable worker to avoid issues in Node.js environment
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    });

    const pdfDocument = await loadingTask.promise;
    const numPages = pdfDocument.numPages;
    const maxPages = options?.maxPages ?? numPages;
    const pagesToProcess = Math.min(maxPages, numPages);

    // Extract text from each page
    const textParts: string[] = [];

    for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Combine text items into page text
      const pageText = textContent.items
        .map((item) => {
          if ('str' in item) {
            return item.str;
          }
          return '';
        })
        .join(' ');

      textParts.push(pageText);
    }

    const text = textParts.join('\n\n');
    const durationMs = performance.now() - startTime;

    // Check for empty content
    if (!text || text.trim().length === 0) {
      return createFailureResult(
        'PDF contains no extractable text using pdf.js (may be image-based)',
        {
          pageCount: numPages,
          durationMs,
          errorCode: PdfErrorCode.EMPTY_CONTENT,
          method: 'pdfjs',
          filePath,
        }
      );
    }

    return createSuccessResult(text, numPages, {
      durationMs,
      method: 'pdfjs',
      filePath,
      isPartial: pagesToProcess < numPages,
    });
  } catch (error) {
    const durationMs = performance.now() - startTime;

    if (error instanceof PdfExtractionError) {
      return createFailureResult(error.message, {
        durationMs,
        errorCode: error.code,
        method: 'pdfjs',
        filePath: error.filePath ?? filePath,
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for password-protected PDFs
    if (errorMessage.includes('password') || errorMessage.includes('encrypted')) {
      return createFailureResult('PDF is password protected', {
        durationMs,
        errorCode: PdfErrorCode.PASSWORD_PROTECTED,
        method: 'pdfjs',
        filePath,
      });
    }

    // Check for invalid/corrupted PDFs
    if (
      errorMessage.includes('Invalid') ||
      errorMessage.includes('corrupt') ||
      errorMessage.includes('XRef')
    ) {
      return createFailureResult(`Invalid or corrupted PDF: ${errorMessage}`, {
        durationMs,
        errorCode: PdfErrorCode.INVALID_PDF,
        method: 'pdfjs',
        filePath,
      });
    }

    return createFailureResult(`pdf.js extraction failed: ${errorMessage}`, {
      durationMs,
      errorCode: PdfErrorCode.EXTRACTION_ERROR,
      method: 'pdfjs',
      filePath,
    });
  }
}

// =============================================================================
// OCR Extractor
// =============================================================================

/**
 * Extract text from a PDF using OCR (Optical Character Recognition)
 *
 * This method converts PDF pages to images and uses Tesseract.js
 * to recognize text. It's the most robust method for scanned/image-based
 * PDFs but is significantly slower.
 *
 * @param input - File path or Buffer containing PDF data
 * @param options - Extraction options
 * @param ocrLanguage - OCR language(s) (default: 'heb+eng' for Hebrew+English)
 * @returns Extraction result
 */
export async function extractWithOcr(
  input: PdfInput,
  options?: PdfExtractionOptions,
  ocrLanguage: string = 'heb+eng'
): Promise<PdfExtractionResult> {
  const startTime = performance.now();
  let filePath: string | undefined;

  try {
    // Dynamic imports
    const pdfjsLib = await import('pdfjs-dist');
    const Tesseract = await import('tesseract.js');

    let data: Uint8Array;

    // Handle string input (file path)
    if (typeof input === 'string') {
      filePath = input;

      if (!existsSync(input)) {
        throw new PdfExtractionError(
          `PDF file not found: ${input}`,
          PdfErrorCode.FILE_NOT_FOUND,
          { filePath: input }
        );
      }

      const buffer = await readFile(input);
      data = new Uint8Array(buffer);
    } else if (Buffer.isBuffer(input)) {
      data = new Uint8Array(input);
    } else {
      throw new PdfExtractionError(
        'Invalid input: expected file path (string) or Buffer',
        PdfErrorCode.EXTRACTION_ERROR
      );
    }

    // Validate PDF header
    if (data.length < 5) {
      throw new PdfExtractionError(
        'PDF buffer is too small',
        PdfErrorCode.INVALID_PDF,
        filePath !== undefined ? { filePath } : undefined
      );
    }

    const header = String.fromCharCode(...data.slice(0, 5));
    if (!header.startsWith('%PDF-')) {
      throw new PdfExtractionError(
        'Invalid PDF: file does not start with PDF header',
        PdfErrorCode.INVALID_PDF,
        filePath !== undefined ? { filePath } : undefined
      );
    }

    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({
      data,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    });

    const pdfDocument = await loadingTask.promise;
    const numPages = pdfDocument.numPages;
    const maxPages = options?.maxPages ?? numPages;
    const pagesToProcess = Math.min(maxPages, numPages);

    // Create Tesseract worker
    const worker = await Tesseract.createWorker(ocrLanguage);

    const textParts: string[] = [];

    try {
      // Process each page
      for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR

        // Create a canvas to render the page
        // Note: In Node.js, we need to use a canvas library
        // For now, we'll use the node-canvas approach
        const { createCanvas } = await import('canvas');
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');

        // Render the page to canvas
        await page.render({
          canvasContext: context as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise;

        // Convert canvas to image buffer
        const imageBuffer = canvas.toBuffer('image/png');

        // Run OCR on the image
        const {
          data: { text: pageText },
        } = await worker.recognize(imageBuffer);

        textParts.push(pageText);
      }
    } finally {
      // Always terminate the worker
      await worker.terminate();
    }

    const text = textParts.join('\n\n');
    const durationMs = performance.now() - startTime;

    // Check for empty content
    if (!text || text.trim().length === 0) {
      return createFailureResult(
        'OCR could not extract any text from the PDF',
        {
          pageCount: numPages,
          durationMs,
          errorCode: PdfErrorCode.EMPTY_CONTENT,
          method: 'ocr',
          filePath,
        }
      );
    }

    return createSuccessResult(text, numPages, {
      durationMs,
      method: 'ocr',
      filePath,
      isPartial: pagesToProcess < numPages,
    });
  } catch (error) {
    const durationMs = performance.now() - startTime;

    if (error instanceof PdfExtractionError) {
      return createFailureResult(error.message, {
        durationMs,
        errorCode: error.code,
        method: 'ocr',
        filePath: error.filePath ?? filePath,
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for canvas-related errors (common in Node.js without proper setup)
    if (
      errorMessage.includes('canvas') ||
      errorMessage.includes('Canvas') ||
      errorMessage.includes('createCanvas')
    ) {
      return createFailureResult(
        `OCR requires the 'canvas' package to be installed: ${errorMessage}`,
        {
          durationMs,
          errorCode: PdfErrorCode.EXTRACTION_ERROR,
          method: 'ocr',
          filePath,
        }
      );
    }

    // Check for Tesseract-related errors
    if (errorMessage.includes('tesseract') || errorMessage.includes('Tesseract')) {
      return createFailureResult(`OCR (Tesseract) error: ${errorMessage}`, {
        durationMs,
        errorCode: PdfErrorCode.EXTRACTION_ERROR,
        method: 'ocr',
        filePath,
      });
    }

    return createFailureResult(`OCR extraction failed: ${errorMessage}`, {
      durationMs,
      errorCode: PdfErrorCode.EXTRACTION_ERROR,
      method: 'ocr',
      filePath,
    });
  }
}

// =============================================================================
// Fallback Chain
// =============================================================================

/**
 * Check if extraction result is considered successful
 *
 * A result is successful if:
 * - It has success: true
 * - The character count meets the minimum threshold
 * - The chars-per-page ratio meets the minimum threshold
 */
function isExtractionSuccessful(
  result: PdfExtractionResult,
  options: FallbackChainOptions
): boolean {
  if (!result.success) {
    return false;
  }

  // Check minimum character count
  if (result.charCount < options.minCharCount) {
    return false;
  }

  // Check minimum chars per page ratio
  if (result.pageCount > 0) {
    const charsPerPage = result.charCount / result.pageCount;
    if (charsPerPage < options.minCharsPerPage) {
      return false;
    }
  }

  return true;
}

/**
 * Extract text from a PDF using a fallback chain of extraction methods
 *
 * The chain attempts extraction methods in order:
 * 1. pdf-parse (fast, good for text-based PDFs)
 * 2. pdf.js (better compatibility for complex PDFs)
 * 3. OCR via tesseract.js (for scanned/image PDFs)
 *
 * Each method is only attempted if the previous one fails or returns
 * insufficient content.
 *
 * @param input - File path or Buffer containing PDF data
 * @param extractionOptions - Options passed to extraction methods
 * @param chainOptions - Configuration for the fallback chain
 * @returns Fallback chain result with extraction result and metadata
 *
 * @example
 * ```typescript
 * // Basic usage
 * const result = await extractWithFallbackChain('/path/to/document.pdf');
 * if (result.result.success) {
 *   console.log(`Extracted using ${result.successfulMethod}`);
 *   console.log(`Text: ${result.result.text}`);
 * }
 *
 * // With options
 * const result = await extractWithFallbackChain(
 *   '/path/to/scanned.pdf',
 *   { maxPages: 5 },
 *   {
 *     enableOcr: true,
 *     ocrLanguage: 'heb',
 *     onMethodAttempt: (method, success, error) => {
 *       console.log(`${method}: ${success ? 'success' : error}`);
 *     },
 *   }
 * );
 * ```
 */
export async function extractWithFallbackChain(
  input: PdfInput,
  extractionOptions?: PdfExtractionOptions,
  chainOptions?: Partial<FallbackChainOptions>
): Promise<FallbackChainResult> {
  const startTime = performance.now();
  const opts = FallbackChainOptionsSchema.parse(chainOptions ?? {});

  const methodsAttempted: ExtractionMethod[] = [];
  const failedAttempts: FallbackChainResult['failedAttempts'] = [];
  let successfulMethod: ExtractionMethod | undefined;
  let finalResult: PdfExtractionResult | undefined;

  // Helper to record a failed attempt
  const recordFailure = (
    method: ExtractionMethod,
    error: string,
    durationMs: number
  ): void => {
    failedAttempts.push({ method, error, durationMs });
    opts.onMethodAttempt?.(method, false, error);
  };

  // Helper to create timeout wrapper
  const withTimeout = async <T>(
    promise: Promise<T>,
    timeoutMs: number,
    method: ExtractionMethod
  ): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`${method} extraction timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  };

  // Method 1: pdf-parse
  if (opts.enablePdfParse) {
    methodsAttempted.push('pdf-parse');
    opts.onProgress?.('Attempting pdf-parse extraction', 'pdf-parse');

    try {
      const methodStart = performance.now();
      const result = await withTimeout(
        extractPdfText(input, extractionOptions),
        opts.timeoutMs,
        'pdf-parse'
      );

      if (isExtractionSuccessful(result, opts)) {
        successfulMethod = 'pdf-parse';
        finalResult = result;
        opts.onMethodAttempt?.('pdf-parse', true, undefined);
      } else {
        const error = result.error ?? 'Insufficient content extracted';
        recordFailure('pdf-parse', error, performance.now() - methodStart);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      recordFailure('pdf-parse', errorMessage, performance.now() - startTime);
    }
  }

  // Method 2: pdf.js
  if (!successfulMethod && opts.enablePdfJs) {
    methodsAttempted.push('pdfjs');
    opts.onProgress?.('Attempting pdf.js extraction', 'pdfjs');

    try {
      const methodStart = performance.now();
      const result = await withTimeout(
        extractWithPdfJs(input, extractionOptions),
        opts.timeoutMs,
        'pdfjs'
      );

      if (isExtractionSuccessful(result, opts)) {
        successfulMethod = 'pdfjs';
        finalResult = result;
        opts.onMethodAttempt?.('pdfjs', true, undefined);
      } else {
        const error = result.error ?? 'Insufficient content extracted';
        recordFailure('pdfjs', error, performance.now() - methodStart);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      recordFailure('pdfjs', errorMessage, performance.now() - startTime);
    }
  }

  // Method 3: OCR
  if (!successfulMethod && opts.enableOcr) {
    methodsAttempted.push('ocr');
    opts.onProgress?.('Attempting OCR extraction', 'ocr');

    try {
      const methodStart = performance.now();
      const result = await withTimeout(
        extractWithOcr(input, extractionOptions, opts.ocrLanguage),
        opts.timeoutMs * 3, // OCR gets 3x the timeout as it's much slower
        'ocr'
      );

      if (isExtractionSuccessful(result, opts)) {
        successfulMethod = 'ocr';
        finalResult = result;
        opts.onMethodAttempt?.('ocr', true, undefined);
      } else {
        const error = result.error ?? 'Insufficient content extracted';
        recordFailure('ocr', error, performance.now() - methodStart);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      recordFailure('ocr', errorMessage, performance.now() - startTime);
    }
  }

  const totalDurationMs = performance.now() - startTime;
  const filePath = typeof input === 'string' ? input : undefined;

  // If no method succeeded, create a failure result
  if (!finalResult) {
    const lastError = failedAttempts[failedAttempts.length - 1];
    const errorMessage =
      failedAttempts.length > 0
        ? `All extraction methods failed. Last error: ${lastError?.error ?? 'unknown'}`
        : 'No extraction methods were enabled';

    finalResult = createFailureResult(errorMessage, {
      durationMs: totalDurationMs,
      errorCode: PdfErrorCode.EXTRACTION_ERROR,
      method: 'fallback',
      filePath,
    });
  }

  return {
    result: finalResult,
    methodsAttempted,
    successfulMethod,
    failedAttempts,
    totalDurationMs,
  };
}

/**
 * Batch extract text from multiple PDFs using the fallback chain
 *
 * Processes multiple PDFs concurrently with configurable concurrency limit.
 *
 * @param filePaths - Array of paths to PDF files
 * @param extractionOptions - Extraction options applied to all files
 * @param chainOptions - Fallback chain configuration
 * @param concurrency - Maximum concurrent extractions (default: 3, lower than non-OCR due to resource intensity)
 * @returns Promise resolving to array of fallback chain results
 */
export async function extractBatchWithFallbackChain(
  filePaths: string[],
  extractionOptions?: PdfExtractionOptions,
  chainOptions?: Partial<FallbackChainOptions>,
  concurrency: number = 3
): Promise<FallbackChainResult[]> {
  if (filePaths.length === 0) {
    return [];
  }

  const results: FallbackChainResult[] = [];

  // Process in batches to limit concurrency
  for (let i = 0; i < filePaths.length; i += concurrency) {
    const batch = filePaths.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((path) =>
        extractWithFallbackChain(path, extractionOptions, chainOptions)
      )
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Get a summary of fallback chain batch results
 */
export function getFallbackChainBatchSummary(results: FallbackChainResult[]): {
  totalCount: number;
  successCount: number;
  failureCount: number;
  successByMethod: Record<ExtractionMethod, number>;
  avgDurationMs: number;
  methodAttemptCounts: Record<ExtractionMethod, number>;
} {
  const successByMethod: Record<ExtractionMethod, number> = {
    'pdf-parse': 0,
    pdfjs: 0,
    ocr: 0,
    fallback: 0,
  };

  const methodAttemptCounts: Record<ExtractionMethod, number> = {
    'pdf-parse': 0,
    pdfjs: 0,
    ocr: 0,
    fallback: 0,
  };

  let successCount = 0;
  let totalDuration = 0;

  for (const result of results) {
    totalDuration += result.totalDurationMs;

    // Count method attempts
    for (const method of result.methodsAttempted) {
      methodAttemptCounts[method]++;
    }

    if (result.result.success && result.successfulMethod) {
      successCount++;
      successByMethod[result.successfulMethod]++;
    }
  }

  return {
    totalCount: results.length,
    successCount,
    failureCount: results.length - successCount,
    successByMethod,
    avgDurationMs: results.length > 0 ? totalDuration / results.length : 0,
    methodAttemptCounts,
  };
}

/**
 * Format fallback chain result for logging
 */
export function formatFallbackChainResult(result: FallbackChainResult): string {
  const lines: string[] = [];

  if (result.result.success) {
    lines.push(`✓ Success using ${result.successfulMethod}`);
    lines.push(`  Characters: ${result.result.charCount.toLocaleString()}`);
    lines.push(`  Pages: ${result.result.pageCount}`);
  } else {
    lines.push(`✗ All methods failed`);
    lines.push(`  Error: ${result.result.error}`);
  }

  lines.push(`  Duration: ${result.totalDurationMs.toFixed(0)}ms`);
  lines.push(`  Methods attempted: ${result.methodsAttempted.join(' → ')}`);

  if (result.failedAttempts.length > 0) {
    lines.push('  Failed attempts:');
    for (const attempt of result.failedAttempts) {
      lines.push(`    - ${attempt.method}: ${attempt.error} (${attempt.durationMs.toFixed(0)}ms)`);
    }
  }

  return lines.join('\n');
}
