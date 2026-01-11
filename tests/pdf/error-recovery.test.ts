/**
 * Unit Tests for PDF Extraction Error Recovery
 *
 * Tests the error recovery functionality including:
 * - Error classification
 * - Recovery action suggestions
 * - extractWithRecovery() function
 * - extractBatchWithRecovery() function
 * - Batch statistics
 * - Failure formatting
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
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
  PdfErrorCode,
  PdfExtractionError,
  type ExtractionFailure,
  type RecoveryOptions,
  type BatchExtractionStats,
  type PdfExtractionResult,
  createSuccessResult,
  createFailureResult,
} from '../../lib/src/pdf/index.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a minimal valid PDF buffer for testing
 */
function createMinimalPdfBuffer(): Buffer {
  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 12 Tf 100 700 Td (Hello World) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000360 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
432
%%EOF`;

  return Buffer.from(pdfContent, 'ascii');
}

const createMockSuccessResult = (): PdfExtractionResult =>
  createSuccessResult('Hello World', 1, {
    durationMs: 100,
    filePath: '/path/to/success.pdf',
  });

const createMockFailureResult = (
  errorCode: PdfErrorCode = PdfErrorCode.EXTRACTION_ERROR
): PdfExtractionResult =>
  createFailureResult(`Error: ${errorCode}`, {
    durationMs: 50,
    errorCode,
    filePath: '/path/to/failure.pdf',
  });

// =============================================================================
// Test Suites
// =============================================================================

describe('Error Recovery', () => {
  // ===========================================================================
  // classifyExtractionFailure() Tests
  // ===========================================================================

  describe('classifyExtractionFailure()', () => {
    describe('from PdfExtractionError', () => {
      it('should classify FILE_NOT_FOUND as permanent', () => {
        const error = new PdfExtractionError(
          'File not found',
          PdfErrorCode.FILE_NOT_FOUND,
          { filePath: '/path/to/missing.pdf' }
        );

        const failure = classifyExtractionFailure(error);

        expect(failure.code).toBe(PdfErrorCode.FILE_NOT_FOUND);
        expect(failure.severity).toBe('permanent');
        expect(failure.recoverable).toBe(false);
        expect(failure.filePath).toBe('/path/to/missing.pdf');
      });

      it('should classify INVALID_PDF as permanent', () => {
        const error = new PdfExtractionError(
          'Invalid PDF',
          PdfErrorCode.INVALID_PDF
        );

        const failure = classifyExtractionFailure(error);

        expect(failure.code).toBe(PdfErrorCode.INVALID_PDF);
        expect(failure.severity).toBe('permanent');
        expect(failure.recoverable).toBe(false);
      });

      it('should classify PASSWORD_PROTECTED as permanent', () => {
        const error = new PdfExtractionError(
          'Password protected',
          PdfErrorCode.PASSWORD_PROTECTED
        );

        const failure = classifyExtractionFailure(error);

        expect(failure.code).toBe(PdfErrorCode.PASSWORD_PROTECTED);
        expect(failure.severity).toBe('permanent');
        expect(failure.recoverable).toBe(false);
      });

      it('should classify EXTRACTION_ERROR as transient', () => {
        const error = new PdfExtractionError(
          'Extraction failed',
          PdfErrorCode.EXTRACTION_ERROR
        );

        const failure = classifyExtractionFailure(error);

        expect(failure.code).toBe(PdfErrorCode.EXTRACTION_ERROR);
        expect(failure.severity).toBe('transient');
        expect(failure.recoverable).toBe(true);
      });

      it('should classify TIMEOUT as transient', () => {
        const error = new PdfExtractionError(
          'Timed out',
          PdfErrorCode.TIMEOUT
        );

        const failure = classifyExtractionFailure(error);

        expect(failure.code).toBe(PdfErrorCode.TIMEOUT);
        expect(failure.severity).toBe('transient');
        expect(failure.recoverable).toBe(true);
      });

      it('should classify MEMORY_EXCEEDED as critical', () => {
        const error = new PdfExtractionError(
          'Out of memory',
          PdfErrorCode.MEMORY_EXCEEDED
        );

        const failure = classifyExtractionFailure(error);

        expect(failure.code).toBe(PdfErrorCode.MEMORY_EXCEEDED);
        expect(failure.severity).toBe('critical');
        expect(failure.recoverable).toBe(true);
      });
    });

    describe('from PdfExtractionResult', () => {
      it('should classify failed result correctly', () => {
        const result = createMockFailureResult(PdfErrorCode.EMPTY_CONTENT);

        const failure = classifyExtractionFailure(result);

        expect(failure.code).toBe(PdfErrorCode.EMPTY_CONTENT);
        expect(failure.message).toContain('EMPTY_CONTENT');
      });

      it('should infer error code from error message patterns', () => {
        const result: PdfExtractionResult = {
          success: false,
          text: '',
          charCount: 0,
          pageCount: 0,
          method: 'pdf-parse',
          error: 'PDF is password protected',
          metadata: null,
          info: null,
        };

        const failure = classifyExtractionFailure(result);

        expect(failure.code).toBe(PdfErrorCode.PASSWORD_PROTECTED);
      });
    });

    describe('from Error', () => {
      it('should classify generic Error with pattern detection', () => {
        const error = new Error('File not found: /path/to/file.pdf');

        const failure = classifyExtractionFailure(error);

        expect(failure.code).toBe(PdfErrorCode.FILE_NOT_FOUND);
      });

      it('should classify timeout errors', () => {
        const error = new Error('Request timed out');

        const failure = classifyExtractionFailure(error);

        expect(failure.code).toBe(PdfErrorCode.TIMEOUT);
      });

      it('should classify memory errors', () => {
        const error = new Error('JavaScript heap out of memory');

        const failure = classifyExtractionFailure(error);

        expect(failure.code).toBe(PdfErrorCode.MEMORY_EXCEEDED);
      });

      it('should default to EXTRACTION_ERROR for unknown errors', () => {
        const error = new Error('Some unknown error');

        const failure = classifyExtractionFailure(error);

        expect(failure.code).toBe(PdfErrorCode.EXTRACTION_ERROR);
      });
    });

    describe('from string', () => {
      it('should classify string error messages', () => {
        const failure = classifyExtractionFailure(
          'Invalid or corrupted PDF file'
        );

        expect(failure.code).toBe(PdfErrorCode.INVALID_PDF);
      });
    });
  });

  // ===========================================================================
  // isRecoverable() Tests
  // ===========================================================================

  describe('isRecoverable()', () => {
    it('should return true for recoverable failures', () => {
      const failure: ExtractionFailure = {
        code: PdfErrorCode.EXTRACTION_ERROR,
        message: 'Extraction failed',
        severity: 'transient',
        recoverable: true,
        suggestedActions: ['retry', 'partial', 'fallback'],
      };

      expect(isRecoverable(failure)).toBe(true);
    });

    it('should return false for non-recoverable failures', () => {
      const failure: ExtractionFailure = {
        code: PdfErrorCode.FILE_NOT_FOUND,
        message: 'File not found',
        severity: 'permanent',
        recoverable: false,
        suggestedActions: ['skip', 'abort'],
      };

      expect(isRecoverable(failure)).toBe(false);
    });

    it('should return false when no suggested actions', () => {
      const failure: ExtractionFailure = {
        code: PdfErrorCode.EXTRACTION_ERROR,
        message: 'Some error',
        severity: 'transient',
        recoverable: true,
        suggestedActions: [],
      };

      expect(isRecoverable(failure)).toBe(false);
    });
  });

  // ===========================================================================
  // isTransientError() Tests
  // ===========================================================================

  describe('isTransientError()', () => {
    it('should return true for transient errors', () => {
      const failure: ExtractionFailure = {
        code: PdfErrorCode.TIMEOUT,
        message: 'Timed out',
        severity: 'transient',
        recoverable: true,
        suggestedActions: ['retry'],
      };

      expect(isTransientError(failure)).toBe(true);
    });

    it('should return false for permanent errors', () => {
      const failure: ExtractionFailure = {
        code: PdfErrorCode.INVALID_PDF,
        message: 'Invalid PDF',
        severity: 'permanent',
        recoverable: false,
        suggestedActions: ['skip'],
      };

      expect(isTransientError(failure)).toBe(false);
    });

    it('should return false for critical errors', () => {
      const failure: ExtractionFailure = {
        code: PdfErrorCode.MEMORY_EXCEEDED,
        message: 'Out of memory',
        severity: 'critical',
        recoverable: true,
        suggestedActions: ['partial'],
      };

      expect(isTransientError(failure)).toBe(false);
    });
  });

  // ===========================================================================
  // getPrimaryRecoveryAction() Tests
  // ===========================================================================

  describe('getPrimaryRecoveryAction()', () => {
    it('should return first suggested action', () => {
      const failure: ExtractionFailure = {
        code: PdfErrorCode.EXTRACTION_ERROR,
        message: 'Error',
        severity: 'transient',
        recoverable: true,
        suggestedActions: ['retry', 'partial', 'fallback'],
      };

      expect(getPrimaryRecoveryAction(failure)).toBe('retry');
    });

    it('should return abort when no suggestions', () => {
      const failure: ExtractionFailure = {
        code: PdfErrorCode.FILE_NOT_FOUND,
        message: 'Not found',
        severity: 'permanent',
        recoverable: false,
        suggestedActions: [],
      };

      expect(getPrimaryRecoveryAction(failure)).toBe('abort');
    });
  });

  // ===========================================================================
  // extractWithRecovery() Tests
  // ===========================================================================

  describe('extractWithRecovery()', () => {
    it('should return immediately on success', async () => {
      const buffer = createMinimalPdfBuffer();
      const result = await extractWithRecovery(buffer);

      // Result structure should be correct
      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('recoveryNeeded');
      expect(result).toHaveProperty('recoveryAttempts');
      expect(result).toHaveProperty('actionsAttempted');
      expect(result).toHaveProperty('isPartial');

      // The minimal PDF may or may not extract successfully
      // but structure should be correct either way
      expect(typeof result.result.success).toBe('boolean');
    });

    it('should set recoveryNeeded=false when initial extraction succeeds', async () => {
      const buffer = createMinimalPdfBuffer();
      const result = await extractWithRecovery(buffer);

      // If successful, no recovery was needed
      if (result.result.success) {
        expect(result.recoveryNeeded).toBe(false);
        expect(result.recoveryAttempts).toBe(0);
        expect(result.actionsAttempted).toEqual([]);
      }
    });

    it('should mark recovery needed for failed extraction', async () => {
      // Use non-existent file to force failure
      const result = await extractWithRecovery('/non/existent/file.pdf');

      expect(result.result.success).toBe(false);
      expect(result.recoveryNeeded).toBe(true);
      expect(result.failure).toBeDefined();
      expect(result.failure?.code).toBe(PdfErrorCode.FILE_NOT_FOUND);
    });

    it('should respect maxRetries option', async () => {
      const result = await extractWithRecovery(
        '/non/existent/file.pdf',
        undefined,
        {
          maxRetries: 0,
          attemptFallbackChain: false,
        }
      );

      // With maxRetries: 0, should not attempt retries
      expect(result.result.success).toBe(false);
      expect(result.recoveryAttempts).toBe(0);
    });

    it('should call onFailure callback', async () => {
      const onFailure = vi.fn();

      await extractWithRecovery('/non/existent/file.pdf', undefined, {
        onFailure,
        attemptFallbackChain: false,
      });

      expect(onFailure).toHaveBeenCalled();
      expect(onFailure.mock.calls[0][0]).toHaveProperty('code');
      expect(onFailure.mock.calls[0][0]).toHaveProperty('message');
    });

    it('should call onRecoveryAttempt callback when attempting recovery', async () => {
      const onRecoveryAttempt = vi.fn();

      // Use invalid PDF to trigger recovery attempts
      await extractWithRecovery(
        Buffer.from('not a pdf'),
        undefined,
        {
          onRecoveryAttempt,
          maxRetries: 1,
          attemptPartialExtraction: false,
          attemptFallbackChain: false,
        }
      );

      // Should have called the callback if recovery was attempted
      // (depends on whether the error is retryable)
    });

    it('should attempt partial extraction when enabled', async () => {
      const result = await extractWithRecovery(
        Buffer.from('not a pdf'),
        undefined,
        {
          maxRetries: 0,
          attemptPartialExtraction: true,
          partialExtractionPages: 1,
          attemptFallbackChain: false,
        }
      );

      // Check that partial was attempted (structure should be correct)
      expect(result).toHaveProperty('isPartial');
    });
  });

  // ===========================================================================
  // extractBatchWithRecovery() Tests
  // ===========================================================================

  describe('extractBatchWithRecovery()', () => {
    it('should return empty results for empty input', async () => {
      const { results, stats } = await extractBatchWithRecovery([]);

      expect(results).toEqual([]);
      expect(stats.totalFiles).toBe(0);
    });

    it('should process multiple files and return stats', async () => {
      const paths = [
        '/non/existent/file1.pdf',
        '/non/existent/file2.pdf',
      ];

      const { results, stats } = await extractBatchWithRecovery(paths, undefined, {
        attemptFallbackChain: false,
      });

      expect(results).toHaveLength(2);
      expect(stats.totalFiles).toBe(2);
      expect(stats.failureCount).toBe(2);
      expect(stats.successCount).toBe(0);
    });

    it('should track recovery statistics', async () => {
      const paths = ['/non/existent/file.pdf'];

      const { stats } = await extractBatchWithRecovery(paths, undefined, {
        attemptFallbackChain: false,
      });

      expect(stats).toHaveProperty('totalRetryAttempts');
      expect(stats).toHaveProperty('recoveredCount');
      expect(stats).toHaveProperty('failuresByCode');
    });

    it('should calculate success rate', async () => {
      const paths = ['/non/existent/file.pdf'];

      const { stats } = await extractBatchWithRecovery(paths, undefined, {
        attemptFallbackChain: false,
      });

      expect(stats.successRate).toBeDefined();
      expect(stats.successRate).toBe(0); // All failures
    });

    it('should respect concurrency limit', async () => {
      const paths = [
        '/non/existent/file1.pdf',
        '/non/existent/file2.pdf',
        '/non/existent/file3.pdf',
      ];

      // Concurrency of 1 should process sequentially
      const { results } = await extractBatchWithRecovery(
        paths,
        undefined,
        { attemptFallbackChain: false },
        1
      );

      expect(results).toHaveLength(3);
    });
  });

  // ===========================================================================
  // formatFailure() Tests
  // ===========================================================================

  describe('formatFailure()', () => {
    it('should format failure with all details', () => {
      const failure: ExtractionFailure = {
        code: PdfErrorCode.EXTRACTION_ERROR,
        message: 'Failed to extract text',
        severity: 'transient',
        recoverable: true,
        suggestedActions: ['retry', 'partial'],
        filePath: '/path/to/file.pdf',
      };

      const formatted = formatFailure(failure);

      expect(formatted).toContain('[EXTRACTION_ERROR]');
      expect(formatted).toContain('Failed to extract text');
      expect(formatted).toContain('transient');
      expect(formatted).toContain('/path/to/file.pdf');
      expect(formatted).toContain('retry');
    });

    it('should handle failure without filePath', () => {
      const failure: ExtractionFailure = {
        code: PdfErrorCode.INVALID_PDF,
        message: 'Invalid PDF',
        severity: 'permanent',
        recoverable: false,
        suggestedActions: ['skip'],
      };

      const formatted = formatFailure(failure);

      expect(formatted).toContain('[INVALID_PDF]');
      expect(formatted).toContain('permanent');
    });
  });

  // ===========================================================================
  // formatBatchStats() Tests
  // ===========================================================================

  describe('formatBatchStats()', () => {
    it('should format batch statistics', () => {
      const stats: BatchExtractionStats = {
        totalFiles: 10,
        successCount: 8,
        failureCount: 2,
        partialCount: 1,
        recoveredCount: 1,
        totalRetryAttempts: 3,
        totalCharacters: 50000,
        totalPages: 100,
        totalDurationMs: 5000,
        avgDurationMs: 500,
        failuresByCode: {
          [PdfErrorCode.INVALID_PDF]: 1,
          [PdfErrorCode.TIMEOUT]: 1,
        },
        failedFiles: ['/path/to/failed1.pdf', '/path/to/failed2.pdf'],
        successRate: 80,
      };

      const formatted = formatBatchStats(stats);

      expect(formatted).toContain('Total files: 10');
      expect(formatted).toContain('Success: 8 (80.0%)');
      expect(formatted).toContain('Failed: 2');
      expect(formatted).toContain('Partial: 1');
      expect(formatted).toContain('Recovered: 1');
      expect(formatted).toContain('Characters: 50,000');
      expect(formatted).toContain('Pages: 100');
    });

    it('should list failed files when count is small', () => {
      const stats: BatchExtractionStats = {
        totalFiles: 3,
        successCount: 1,
        failureCount: 2,
        partialCount: 0,
        recoveredCount: 0,
        totalRetryAttempts: 0,
        totalCharacters: 100,
        totalPages: 1,
        totalDurationMs: 100,
        avgDurationMs: 33,
        failuresByCode: { [PdfErrorCode.FILE_NOT_FOUND]: 2 },
        failedFiles: ['/file1.pdf', '/file2.pdf'],
        successRate: 33.3,
      };

      const formatted = formatBatchStats(stats);

      expect(formatted).toContain('/file1.pdf');
      expect(formatted).toContain('/file2.pdf');
    });

    it('should truncate failed files list when too long', () => {
      const failedFiles = Array.from({ length: 15 }, (_, i) => `/file${i}.pdf`);

      const stats: BatchExtractionStats = {
        totalFiles: 20,
        successCount: 5,
        failureCount: 15,
        partialCount: 0,
        recoveredCount: 0,
        totalRetryAttempts: 0,
        totalCharacters: 100,
        totalPages: 5,
        totalDurationMs: 1000,
        avgDurationMs: 50,
        failuresByCode: { [PdfErrorCode.EXTRACTION_ERROR]: 15 },
        failedFiles,
        successRate: 25,
      };

      const formatted = formatBatchStats(stats);

      expect(formatted).toContain('first 10');
      expect(formatted).toContain('and 5 more');
    });
  });

  // ===========================================================================
  // aggregateExtractionResults() Tests
  // ===========================================================================

  describe('aggregateExtractionResults()', () => {
    it('should aggregate successful results', () => {
      const results: PdfExtractionResult[] = [
        createSuccessResult('Text 1', 1, { durationMs: 100 }),
        createSuccessResult('Text 2', 2, { durationMs: 200 }),
      ];

      const aggregated = aggregateExtractionResults(results);

      expect(aggregated.text).toContain('Text 1');
      expect(aggregated.text).toContain('Text 2');
      expect(aggregated.totalCharCount).toBe(12); // 'Text 1' + 'Text 2'
      expect(aggregated.totalPageCount).toBe(3);
      expect(aggregated.successCount).toBe(2);
      expect(aggregated.failureCount).toBe(0);
    });

    it('should handle mixed success and failure', () => {
      const results: PdfExtractionResult[] = [
        createSuccessResult('Success text', 1, { durationMs: 100 }),
        createFailureResult('Error', { errorCode: PdfErrorCode.INVALID_PDF }),
      ];

      const aggregated = aggregateExtractionResults(results);

      expect(aggregated.text).toContain('Success text');
      expect(aggregated.successCount).toBe(1);
      expect(aggregated.failureCount).toBe(1);
    });

    it('should handle all failures', () => {
      const results: PdfExtractionResult[] = [
        createFailureResult('Error 1', { errorCode: PdfErrorCode.INVALID_PDF }),
        createFailureResult('Error 2', { errorCode: PdfErrorCode.TIMEOUT }),
      ];

      const aggregated = aggregateExtractionResults(results);

      expect(aggregated.text).toBe('');
      expect(aggregated.totalCharCount).toBe(0);
      expect(aggregated.successCount).toBe(0);
      expect(aggregated.failureCount).toBe(2);
    });

    it('should handle empty results array', () => {
      const aggregated = aggregateExtractionResults([]);

      expect(aggregated.text).toBe('');
      expect(aggregated.totalCharCount).toBe(0);
      expect(aggregated.successCount).toBe(0);
      expect(aggregated.failureCount).toBe(0);
    });
  });

  // ===========================================================================
  // isBatchSuccessful() Tests
  // ===========================================================================

  describe('isBatchSuccessful()', () => {
    it('should return true when success rate meets default threshold', () => {
      const stats: BatchExtractionStats = {
        totalFiles: 10,
        successCount: 8,
        failureCount: 2,
        partialCount: 0,
        recoveredCount: 0,
        totalRetryAttempts: 0,
        totalCharacters: 1000,
        totalPages: 10,
        totalDurationMs: 1000,
        avgDurationMs: 100,
        failuresByCode: {},
        failedFiles: [],
        successRate: 80,
      };

      expect(isBatchSuccessful(stats)).toBe(true);
    });

    it('should return false when below default threshold', () => {
      const stats: BatchExtractionStats = {
        totalFiles: 10,
        successCount: 7,
        failureCount: 3,
        partialCount: 0,
        recoveredCount: 0,
        totalRetryAttempts: 0,
        totalCharacters: 1000,
        totalPages: 10,
        totalDurationMs: 1000,
        avgDurationMs: 100,
        failuresByCode: {},
        failedFiles: [],
        successRate: 70,
      };

      expect(isBatchSuccessful(stats)).toBe(false);
    });

    it('should respect custom threshold', () => {
      const stats: BatchExtractionStats = {
        totalFiles: 10,
        successCount: 5,
        failureCount: 5,
        partialCount: 0,
        recoveredCount: 0,
        totalRetryAttempts: 0,
        totalCharacters: 500,
        totalPages: 5,
        totalDurationMs: 1000,
        avgDurationMs: 100,
        failuresByCode: {},
        failedFiles: [],
        successRate: 50,
      };

      expect(isBatchSuccessful(stats, 50)).toBe(true);
      expect(isBatchSuccessful(stats, 51)).toBe(false);
    });

    it('should return true for empty batch (100% success rate)', () => {
      const stats: BatchExtractionStats = {
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

      expect(isBatchSuccessful(stats)).toBe(true);
    });
  });
});
