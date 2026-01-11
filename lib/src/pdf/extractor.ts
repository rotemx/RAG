/**
 * PDF Text Extraction
 *
 * Functions for extracting text content from PDF files.
 * Uses pdf-parse library for text extraction.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import pdfParse from 'pdf-parse';
import {
  type PdfExtractionResult,
  type PdfExtractionOptions,
  type PdfInput,
  PdfExtractionError,
  PdfErrorCode,
  createSuccessResult,
  createFailureResult,
} from './types.js';

/**
 * Extract text content from a PDF file or buffer.
 *
 * This function handles both file paths and Buffer inputs.
 * It extracts all text content from the PDF and returns
 * metadata about the extraction process.
 *
 * @param input - Either a file path (string) or a Buffer containing PDF data
 * @param options - Optional extraction configuration
 * @returns Promise resolving to extraction result with text and metadata
 *
 * @example
 * ```typescript
 * // Extract from file path
 * const result = await extractPdfText('/path/to/law.pdf');
 * if (result.success) {
 *   console.log(`Extracted ${result.charCount} characters from ${result.pageCount} pages`);
 *   console.log(result.text);
 * }
 *
 * // Extract from buffer
 * const buffer = await fs.readFile('/path/to/law.pdf');
 * const result = await extractPdfText(buffer);
 *
 * // Limit to first 10 pages
 * const result = await extractPdfText('/path/to/law.pdf', { maxPages: 10 });
 * ```
 */
export async function extractPdfText(
  input: PdfInput,
  options?: PdfExtractionOptions
): Promise<PdfExtractionResult> {
  const startTime = performance.now();
  let buffer: Buffer;
  let filePath: string | undefined;

  try {
    // Handle string input (file path)
    if (typeof input === 'string') {
      filePath = input;

      // Check if file exists
      if (!existsSync(input)) {
        throw new PdfExtractionError(
          `PDF file not found: ${input}`,
          PdfErrorCode.FILE_NOT_FOUND,
          { filePath: input }
        );
      }

      // Read file into buffer
      try {
        buffer = await readFile(input);
      } catch (readError) {
        throw new PdfExtractionError(
          `Failed to read PDF file: ${input}`,
          PdfErrorCode.READ_ERROR,
          { filePath: input, cause: readError as Error }
        );
      }
    } else if (Buffer.isBuffer(input)) {
      buffer = input;
    } else {
      throw new PdfExtractionError(
        'Invalid input: expected file path (string) or Buffer',
        PdfErrorCode.EXTRACTION_ERROR
      );
    }

    // Validate buffer has content
    if (buffer.length === 0) {
      throw new PdfExtractionError(
        'PDF buffer is empty',
        PdfErrorCode.EMPTY_CONTENT,
        filePath !== undefined ? { filePath } : undefined
      );
    }

    // Check for PDF magic bytes (%PDF-)
    const pdfHeader = buffer.subarray(0, 5).toString('ascii');
    if (!pdfHeader.startsWith('%PDF-')) {
      throw new PdfExtractionError(
        'Invalid PDF: file does not start with PDF header',
        PdfErrorCode.INVALID_PDF,
        filePath !== undefined ? { filePath } : undefined
      );
    }

    // Build pdf-parse options
    const parseOptions: pdfParse.Options = {};

    if (options?.maxPages !== undefined) {
      parseOptions.max = options.maxPages;
    }

    if (options?.pageRenderer !== undefined) {
      parseOptions.pagerender = options.pageRenderer;
    }

    // Extract text using pdf-parse
    const pdfData = await pdfParse(buffer, parseOptions);

    const durationMs = performance.now() - startTime;

    // Check for empty content
    if (!pdfData.text || pdfData.text.trim().length === 0) {
      return createFailureResult(
        'PDF contains no extractable text (may be image-based or empty)',
        {
          pageCount: pdfData.numpages,
          durationMs,
          errorCode: PdfErrorCode.EMPTY_CONTENT,
          filePath,
        }
      );
    }

    return createSuccessResult(pdfData.text, pdfData.numpages, {
      metadata: (pdfData.metadata as Record<string, unknown> | undefined) ?? null,
      info: (pdfData.info as Record<string, unknown> | undefined) ?? null,
      durationMs,
      filePath,
    });
  } catch (error) {
    const durationMs = performance.now() - startTime;

    // Handle PdfExtractionError with proper error code
    if (error instanceof PdfExtractionError) {
      return createFailureResult(error.message, {
        durationMs,
        errorCode: error.code,
        filePath: error.filePath ?? filePath,
      });
    }

    // Handle pdf-parse specific errors with appropriate error codes
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for common pdf-parse error patterns and assign appropriate error codes
    if (errorMessage.includes('password')) {
      return createFailureResult('PDF is password protected', {
        durationMs,
        errorCode: PdfErrorCode.PASSWORD_PROTECTED,
        filePath,
      });
    }

    if (errorMessage.includes('Invalid') || errorMessage.includes('corrupt')) {
      return createFailureResult(`Invalid or corrupted PDF: ${errorMessage}`, {
        durationMs,
        errorCode: PdfErrorCode.INVALID_PDF,
        filePath,
      });
    }

    // Check for timeout-related errors
    if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('timed out') ||
      errorMessage.includes('ETIMEDOUT')
    ) {
      return createFailureResult(`PDF extraction timed out: ${errorMessage}`, {
        durationMs,
        errorCode: PdfErrorCode.TIMEOUT,
        filePath,
      });
    }

    // Check for memory-related errors
    if (
      errorMessage.includes('memory') ||
      errorMessage.includes('heap') ||
      errorMessage.includes('ENOMEM')
    ) {
      return createFailureResult(`PDF extraction ran out of memory: ${errorMessage}`, {
        durationMs,
        errorCode: PdfErrorCode.MEMORY_EXCEEDED,
        filePath,
      });
    }

    // Generic extraction error
    return createFailureResult(`PDF extraction failed: ${errorMessage}`, {
      durationMs,
      errorCode: PdfErrorCode.EXTRACTION_ERROR,
      filePath,
    });
  }
}

/**
 * Extract text from a PDF buffer.
 *
 * Convenience function that only accepts Buffer input.
 * Useful when you already have the PDF data in memory.
 *
 * @param buffer - Buffer containing PDF data
 * @param options - Optional extraction configuration
 * @returns Promise resolving to extraction result
 */
export async function extractPdfTextFromBuffer(
  buffer: Buffer,
  options?: PdfExtractionOptions
): Promise<PdfExtractionResult> {
  return extractPdfText(buffer, options);
}

/**
 * Extract text from a PDF file path.
 *
 * Convenience function that only accepts file path input.
 * Reads the file and extracts text content.
 *
 * @param filePath - Path to the PDF file
 * @param options - Optional extraction configuration
 * @returns Promise resolving to extraction result
 */
export async function extractPdfTextFromFile(
  filePath: string,
  options?: PdfExtractionOptions
): Promise<PdfExtractionResult> {
  return extractPdfText(filePath, options);
}

/**
 * Batch extract text from multiple PDF files.
 *
 * Processes multiple PDFs concurrently with configurable concurrency limit.
 * Returns results in the same order as input paths. Each result includes
 * the file path for easy identification of failures.
 *
 * @param filePaths - Array of paths to PDF files
 * @param options - Extraction options applied to all files
 * @param concurrency - Maximum concurrent extractions (default: 5)
 * @returns Promise resolving to array of extraction results
 *
 * @example
 * ```typescript
 * const paths = ['/path/to/law1.pdf', '/path/to/law2.pdf', '/path/to/law3.pdf'];
 * const results = await extractPdfTextBatch(paths, undefined, 3);
 *
 * for (const result of results) {
 *   if (result.success) {
 *     console.log(`Extracted ${result.charCount} chars from ${result.filePath}`);
 *   } else {
 *     console.error(`Failed ${result.filePath}: ${result.error} (${result.errorCode})`);
 *   }
 * }
 * ```
 */
export async function extractPdfTextBatch(
  filePaths: string[],
  options?: PdfExtractionOptions,
  concurrency: number = 5
): Promise<PdfExtractionResult[]> {
  if (filePaths.length === 0) {
    return [];
  }

  const results: PdfExtractionResult[] = [];

  // Process in batches to limit concurrency
  for (let i = 0; i < filePaths.length; i += concurrency) {
    const batch = filePaths.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((path) => extractPdfText(path, options))
    );

    // Append batch results (filePath is now included in each result)
    results.push(...batchResults);
  }

  return results;
}

/**
 * Get a summary of batch extraction results.
 *
 * Analyzes batch results and returns counts by success/failure status.
 *
 * @param results - Array of extraction results from batch processing
 * @returns Summary object with counts and lists
 *
 * @example
 * ```typescript
 * const results = await extractPdfTextBatch(paths);
 * const summary = getBatchExtractionSummary(results);
 *
 * console.log(`Success: ${summary.successCount}/${summary.totalCount}`);
 * console.log(`Failed files: ${summary.failedPaths.join(', ')}`);
 * ```
 */
export function getBatchExtractionSummary(results: PdfExtractionResult[]): {
  totalCount: number;
  successCount: number;
  failureCount: number;
  partialCount: number;
  totalCharacters: number;
  totalPages: number;
  successPaths: string[];
  failedPaths: string[];
  failuresByCode: Record<string, number>;
} {
  const successPaths: string[] = [];
  const failedPaths: string[] = [];
  const failuresByCode: Record<string, number> = {};

  let successCount = 0;
  let failureCount = 0;
  let partialCount = 0;
  let totalCharacters = 0;
  let totalPages = 0;

  for (const result of results) {
    if (result.success) {
      successCount++;
      totalCharacters += result.charCount;
      totalPages += result.pageCount;

      if (result.filePath) {
        successPaths.push(result.filePath);
      }

      if (result.isPartial) {
        partialCount++;
      }
    } else {
      failureCount++;

      if (result.filePath) {
        failedPaths.push(result.filePath);
      }

      const code = result.errorCode ?? 'UNKNOWN';
      failuresByCode[code] = (failuresByCode[code] ?? 0) + 1;
    }
  }

  return {
    totalCount: results.length,
    successCount,
    failureCount,
    partialCount,
    totalCharacters,
    totalPages,
    successPaths,
    failedPaths,
    failuresByCode,
  };
}
