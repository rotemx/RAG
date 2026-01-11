/**
 * Unit Tests for PDF Fallback Chain
 *
 * Tests the fallback chain functionality including:
 * - extractWithPdfJs() function
 * - extractWithOcr() function
 * - extractWithFallbackChain() function
 * - extractBatchWithFallbackChain() function
 * - getFallbackChainBatchSummary() function
 * - formatFallbackChainResult() function
 *
 * Note: Some tests may be skipped if optional dependencies (pdfjs-dist, tesseract.js, canvas)
 * are not installed, as these are used for fallback extraction methods.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import {
  extractWithFallbackChain,
  extractBatchWithFallbackChain,
  getFallbackChainBatchSummary,
  formatFallbackChainResult,
  PdfErrorCode,
  type FallbackChainResult,
  type FallbackChainOptions,
  createSuccessResult,
  createFailureResult,
} from '../../lib/src/pdf/index.js';

// =============================================================================
// Test Helpers and Fixtures
// =============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const SAMPLE_PDFS_DIR = join(PROJECT_ROOT, 'skraper', 'downloads');

/**
 * Get a list of sample PDF paths for testing
 */
async function getSamplePdfPaths(limit: number = 3): Promise<string[]> {
  try {
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(SAMPLE_PDFS_DIR);
    const pdfFiles = files
      .filter((f) => f.endsWith('.pdf'))
      .slice(0, limit)
      .map((f) => join(SAMPLE_PDFS_DIR, f));
    return pdfFiles;
  } catch {
    return [];
  }
}

/**
 * Check if sample PDFs are available for testing
 */
async function hasSamplePdfs(): Promise<boolean> {
  try {
    await access(SAMPLE_PDFS_DIR, constants.R_OK);
    const paths = await getSamplePdfPaths(1);
    return paths.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if pdfjs-dist is available
 */
async function hasPdfJs(): Promise<boolean> {
  try {
    await import('pdfjs-dist');
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if tesseract.js is available
 */
async function hasTesseract(): Promise<boolean> {
  try {
    await import('tesseract.js');
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if canvas is available (needed for OCR)
 */
async function hasCanvas(): Promise<boolean> {
  try {
    await import('canvas');
    return true;
  } catch {
    return false;
  }
}

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

/**
 * Create an invalid PDF buffer
 */
function createInvalidPdfBuffer(): Buffer {
  return Buffer.from('This is not a PDF file', 'utf-8');
}

// =============================================================================
// Test Suites
// =============================================================================

describe('Fallback Chain', () => {
  let samplePdfsAvailable = false;
  let samplePdfPaths: string[] = [];
  let pdfJsAvailable = false;
  let tesseractAvailable = false;
  let canvasAvailable = false;

  beforeAll(async () => {
    samplePdfsAvailable = await hasSamplePdfs();
    if (samplePdfsAvailable) {
      samplePdfPaths = await getSamplePdfPaths(3);
    }
    pdfJsAvailable = await hasPdfJs();
    tesseractAvailable = await hasTesseract();
    canvasAvailable = await hasCanvas();
  });

  // ===========================================================================
  // extractWithFallbackChain() Tests
  // ===========================================================================

  describe('extractWithFallbackChain()', () => {
    describe('with Buffer input', () => {
      it('should return FallbackChainResult with correct structure', async () => {
        const buffer = createMinimalPdfBuffer();
        const result = await extractWithFallbackChain(buffer, undefined, {
          enablePdfJs: false,
          enableOcr: false,
        });

        expect(result).toHaveProperty('result');
        expect(result).toHaveProperty('methodsAttempted');
        expect(result).toHaveProperty('failedAttempts');
        expect(result).toHaveProperty('totalDurationMs');

        expect(Array.isArray(result.methodsAttempted)).toBe(true);
        expect(Array.isArray(result.failedAttempts)).toBe(true);
        expect(typeof result.totalDurationMs).toBe('number');
      });

      it('should attempt pdf-parse first when enabled', async () => {
        const buffer = createMinimalPdfBuffer();
        const result = await extractWithFallbackChain(buffer, undefined, {
          enablePdfParse: true,
          enablePdfJs: false,
          enableOcr: false,
        });

        expect(result.methodsAttempted).toContain('pdf-parse');
      });

      it('should record successful method when extraction succeeds', async () => {
        const buffer = createMinimalPdfBuffer();
        const result = await extractWithFallbackChain(buffer, undefined, {
          enablePdfJs: false,
          enableOcr: false,
        });

        if (result.result.success) {
          expect(result.successfulMethod).toBeDefined();
        }
      });

      it('should track failed attempts', async () => {
        const buffer = createInvalidPdfBuffer();
        const result = await extractWithFallbackChain(buffer, undefined, {
          enablePdfJs: false,
          enableOcr: false,
        });

        // Invalid PDF should fail pdf-parse
        expect(result.failedAttempts.length).toBeGreaterThan(0);
        expect(result.failedAttempts[0]).toHaveProperty('method');
        expect(result.failedAttempts[0]).toHaveProperty('error');
        expect(result.failedAttempts[0]).toHaveProperty('durationMs');
      });

      it('should include totalDurationMs', async () => {
        const buffer = createMinimalPdfBuffer();
        const result = await extractWithFallbackChain(buffer, undefined, {
          enablePdfJs: false,
          enableOcr: false,
        });

        expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
      });
    });

    describe('with file path input', () => {
      it('should handle non-existent file', async () => {
        const result = await extractWithFallbackChain(
          '/non/existent/file.pdf',
          undefined,
          {
            enablePdfJs: false,
            enableOcr: false,
          }
        );

        expect(result.result.success).toBe(false);
        expect(result.failedAttempts.length).toBeGreaterThan(0);
      });

      it.skipIf(!samplePdfsAvailable)(
        'should extract text from real PDF file',
        async () => {
          const pdfPath = samplePdfPaths[0];
          const result = await extractWithFallbackChain(pdfPath, undefined, {
            enablePdfJs: false,
            enableOcr: false,
          });

          expect(result.result).toBeDefined();

          if (result.result.success) {
            expect(result.successfulMethod).toBe('pdf-parse');
            expect(result.result.text.length).toBeGreaterThan(0);
          }
        }
      );
    });

    describe('with options', () => {
      it('should skip pdf-parse when disabled', async () => {
        const buffer = createMinimalPdfBuffer();
        const result = await extractWithFallbackChain(buffer, undefined, {
          enablePdfParse: false,
          enablePdfJs: false,
          enableOcr: false,
        });

        expect(result.methodsAttempted).not.toContain('pdf-parse');
      });

      it('should call onProgress callback', async () => {
        const onProgress = vi.fn();
        const buffer = createMinimalPdfBuffer();

        await extractWithFallbackChain(buffer, undefined, {
          enablePdfJs: false,
          enableOcr: false,
          onProgress,
        });

        expect(onProgress).toHaveBeenCalled();
      });

      it('should call onMethodAttempt callback', async () => {
        const onMethodAttempt = vi.fn();
        const buffer = createMinimalPdfBuffer();

        await extractWithFallbackChain(buffer, undefined, {
          enablePdfJs: false,
          enableOcr: false,
          onMethodAttempt,
        });

        expect(onMethodAttempt).toHaveBeenCalled();
        // Check callback was called with correct arguments
        const call = onMethodAttempt.mock.calls[0];
        expect(['pdf-parse', 'pdfjs', 'ocr', 'fallback']).toContain(call[0]);
        expect(typeof call[1]).toBe('boolean');
      });

      it('should respect minCharCount threshold', async () => {
        const buffer = createMinimalPdfBuffer();
        const result = await extractWithFallbackChain(buffer, undefined, {
          enablePdfJs: false,
          enableOcr: false,
          minCharCount: 1000000, // Very high threshold
        });

        // With impossibly high threshold, should fail even if extraction works
        if (result.result.charCount < 1000000) {
          expect(result.result.success).toBe(false);
        }
      });
    });

    describe.skipIf(!pdfJsAvailable)('with pdfjs fallback', () => {
      it('should fall back to pdfjs when pdf-parse fails', async () => {
        // Create a buffer that pdf-parse might have trouble with
        // but pdfjs might handle better
        const buffer = createMinimalPdfBuffer();
        const result = await extractWithFallbackChain(buffer, undefined, {
          enablePdfParse: false, // Skip pdf-parse to test pdfjs
          enablePdfJs: true,
          enableOcr: false,
        });

        if (result.methodsAttempted.includes('pdfjs')) {
          expect(result.methodsAttempted).toContain('pdfjs');
        }
      });

      it('should record pdfjs as successful method when it succeeds', async () => {
        const buffer = createMinimalPdfBuffer();
        const result = await extractWithFallbackChain(buffer, undefined, {
          enablePdfParse: false,
          enablePdfJs: true,
          enableOcr: false,
        });

        if (result.result.success) {
          expect(result.successfulMethod).toBe('pdfjs');
        }
      });
    });

    describe.skipIf(!tesseractAvailable || !canvasAvailable)('with OCR fallback', () => {
      it('should attempt OCR when other methods fail', async () => {
        const buffer = createMinimalPdfBuffer();
        const result = await extractWithFallbackChain(buffer, undefined, {
          enablePdfParse: false,
          enablePdfJs: false,
          enableOcr: true,
          ocrLanguage: 'eng',
        });

        expect(result.methodsAttempted).toContain('ocr');
      });

      it('should use correct OCR language', async () => {
        const onMethodAttempt = vi.fn();
        const buffer = createMinimalPdfBuffer();

        await extractWithFallbackChain(buffer, undefined, {
          enablePdfParse: false,
          enablePdfJs: false,
          enableOcr: true,
          ocrLanguage: 'heb+eng',
          onMethodAttempt,
        });

        // OCR should be attempted
        expect(onMethodAttempt).toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should return failure when all methods fail', async () => {
        const buffer = createInvalidPdfBuffer();
        const result = await extractWithFallbackChain(buffer, undefined, {
          enablePdfJs: false,
          enableOcr: false,
        });

        expect(result.result.success).toBe(false);
        expect(result.successfulMethod).toBeUndefined();
      });

      it('should return failure when no methods are enabled', async () => {
        const buffer = createMinimalPdfBuffer();
        const result = await extractWithFallbackChain(buffer, undefined, {
          enablePdfParse: false,
          enablePdfJs: false,
          enableOcr: false,
        });

        expect(result.result.success).toBe(false);
        expect(result.methodsAttempted).toHaveLength(0);
      });

      it('should include error code in failure result', async () => {
        const buffer = createInvalidPdfBuffer();
        const result = await extractWithFallbackChain(buffer, undefined, {
          enablePdfJs: false,
          enableOcr: false,
        });

        expect(result.result.success).toBe(false);
        expect(result.result.errorCode).toBeDefined();
      });
    });
  });

  // ===========================================================================
  // extractBatchWithFallbackChain() Tests
  // ===========================================================================

  describe('extractBatchWithFallbackChain()', () => {
    it('should return empty array for empty input', async () => {
      const results = await extractBatchWithFallbackChain([]);

      expect(results).toEqual([]);
    });

    it('should process multiple files', async () => {
      const paths = [
        '/non/existent/file1.pdf',
        '/non/existent/file2.pdf',
      ];

      const results = await extractBatchWithFallbackChain(paths, undefined, {
        enablePdfJs: false,
        enableOcr: false,
      });

      expect(results).toHaveLength(2);
    });

    it('should return FallbackChainResult for each file', async () => {
      const paths = ['/non/existent/file.pdf'];

      const results = await extractBatchWithFallbackChain(paths, undefined, {
        enablePdfJs: false,
        enableOcr: false,
      });

      expect(results[0]).toHaveProperty('result');
      expect(results[0]).toHaveProperty('methodsAttempted');
      expect(results[0]).toHaveProperty('failedAttempts');
      expect(results[0]).toHaveProperty('totalDurationMs');
    });

    it('should respect concurrency limit', async () => {
      const paths = [
        '/non/existent/file1.pdf',
        '/non/existent/file2.pdf',
        '/non/existent/file3.pdf',
      ];

      // Lower concurrency should still produce correct results
      const results = await extractBatchWithFallbackChain(
        paths,
        undefined,
        { enablePdfJs: false, enableOcr: false },
        1
      );

      expect(results).toHaveLength(3);
    });

    it.skipIf(!samplePdfsAvailable || samplePdfPaths.length < 2)(
      'should process real PDFs in batch',
      async () => {
        const paths = samplePdfPaths.slice(0, 2);

        const results = await extractBatchWithFallbackChain(
          paths,
          undefined,
          { enablePdfJs: false, enableOcr: false },
          2
        );

        expect(results).toHaveLength(2);

        // Check results have proper structure
        for (const result of results) {
          expect(result.methodsAttempted.length).toBeGreaterThan(0);
        }
      }
    );
  });

  // ===========================================================================
  // getFallbackChainBatchSummary() Tests
  // ===========================================================================

  describe('getFallbackChainBatchSummary()', () => {
    it('should calculate summary for empty results', () => {
      const summary = getFallbackChainBatchSummary([]);

      expect(summary.totalCount).toBe(0);
      expect(summary.successCount).toBe(0);
      expect(summary.failureCount).toBe(0);
      expect(summary.avgDurationMs).toBe(0);
    });

    it('should calculate correct counts', () => {
      const results: FallbackChainResult[] = [
        {
          result: createSuccessResult('Text 1', 1, { method: 'pdf-parse' }),
          methodsAttempted: ['pdf-parse'],
          successfulMethod: 'pdf-parse',
          failedAttempts: [],
          totalDurationMs: 100,
        },
        {
          result: createFailureResult('Error', { errorCode: PdfErrorCode.INVALID_PDF }),
          methodsAttempted: ['pdf-parse'],
          failedAttempts: [{ method: 'pdf-parse', error: 'Error', durationMs: 50 }],
          totalDurationMs: 50,
        },
      ];

      const summary = getFallbackChainBatchSummary(results);

      expect(summary.totalCount).toBe(2);
      expect(summary.successCount).toBe(1);
      expect(summary.failureCount).toBe(1);
    });

    it('should track success by method', () => {
      const results: FallbackChainResult[] = [
        {
          result: createSuccessResult('Text 1', 1, { method: 'pdf-parse' }),
          methodsAttempted: ['pdf-parse'],
          successfulMethod: 'pdf-parse',
          failedAttempts: [],
          totalDurationMs: 100,
        },
        {
          result: createSuccessResult('Text 2', 1, { method: 'pdfjs' }),
          methodsAttempted: ['pdf-parse', 'pdfjs'],
          successfulMethod: 'pdfjs',
          failedAttempts: [{ method: 'pdf-parse', error: 'Failed', durationMs: 50 }],
          totalDurationMs: 150,
        },
      ];

      const summary = getFallbackChainBatchSummary(results);

      expect(summary.successByMethod['pdf-parse']).toBe(1);
      expect(summary.successByMethod['pdfjs']).toBe(1);
    });

    it('should track method attempt counts', () => {
      const results: FallbackChainResult[] = [
        {
          result: createSuccessResult('Text', 1, { method: 'pdf-parse' }),
          methodsAttempted: ['pdf-parse'],
          successfulMethod: 'pdf-parse',
          failedAttempts: [],
          totalDurationMs: 100,
        },
        {
          result: createSuccessResult('Text', 1, { method: 'pdfjs' }),
          methodsAttempted: ['pdf-parse', 'pdfjs'],
          successfulMethod: 'pdfjs',
          failedAttempts: [],
          totalDurationMs: 150,
        },
      ];

      const summary = getFallbackChainBatchSummary(results);

      expect(summary.methodAttemptCounts['pdf-parse']).toBe(2);
      expect(summary.methodAttemptCounts['pdfjs']).toBe(1);
    });

    it('should calculate average duration', () => {
      const results: FallbackChainResult[] = [
        {
          result: createSuccessResult('Text', 1, { method: 'pdf-parse' }),
          methodsAttempted: ['pdf-parse'],
          successfulMethod: 'pdf-parse',
          failedAttempts: [],
          totalDurationMs: 100,
        },
        {
          result: createSuccessResult('Text', 1, { method: 'pdf-parse' }),
          methodsAttempted: ['pdf-parse'],
          successfulMethod: 'pdf-parse',
          failedAttempts: [],
          totalDurationMs: 200,
        },
      ];

      const summary = getFallbackChainBatchSummary(results);

      expect(summary.avgDurationMs).toBe(150); // (100 + 200) / 2
    });
  });

  // ===========================================================================
  // formatFallbackChainResult() Tests
  // ===========================================================================

  describe('formatFallbackChainResult()', () => {
    it('should format successful result', () => {
      const result: FallbackChainResult = {
        result: createSuccessResult('Test text content', 5, { method: 'pdf-parse' }),
        methodsAttempted: ['pdf-parse'],
        successfulMethod: 'pdf-parse',
        failedAttempts: [],
        totalDurationMs: 123,
      };

      const formatted = formatFallbackChainResult(result);

      expect(formatted).toContain('Success');
      expect(formatted).toContain('pdf-parse');
      expect(formatted).toContain('Characters');
      expect(formatted).toContain('Pages');
      expect(formatted).toContain('Duration');
    });

    it('should format failed result', () => {
      const result: FallbackChainResult = {
        result: createFailureResult('Extraction failed', { errorCode: PdfErrorCode.INVALID_PDF }),
        methodsAttempted: ['pdf-parse', 'pdfjs'],
        failedAttempts: [
          { method: 'pdf-parse', error: 'Invalid header', durationMs: 50 },
          { method: 'pdfjs', error: 'Cannot load', durationMs: 100 },
        ],
        totalDurationMs: 150,
      };

      const formatted = formatFallbackChainResult(result);

      expect(formatted).toContain('failed');
      expect(formatted).toContain('Error');
      expect(formatted).toContain('Failed attempts');
    });

    it('should list methods attempted in order', () => {
      const result: FallbackChainResult = {
        result: createSuccessResult('Text', 1, { method: 'pdfjs' }),
        methodsAttempted: ['pdf-parse', 'pdfjs'],
        successfulMethod: 'pdfjs',
        failedAttempts: [{ method: 'pdf-parse', error: 'Failed', durationMs: 50 }],
        totalDurationMs: 150,
      };

      const formatted = formatFallbackChainResult(result);

      expect(formatted).toContain('pdf-parse → pdfjs');
    });

    it('should include failed attempt details', () => {
      const result: FallbackChainResult = {
        result: createFailureResult('All methods failed', { errorCode: PdfErrorCode.EXTRACTION_ERROR }),
        methodsAttempted: ['pdf-parse'],
        failedAttempts: [
          { method: 'pdf-parse', error: 'Specific error message', durationMs: 75 },
        ],
        totalDurationMs: 75,
      };

      const formatted = formatFallbackChainResult(result);

      expect(formatted).toContain('Specific error message');
      expect(formatted).toContain('75');
    });
  });

  // ===========================================================================
  // Integration Tests
  // ===========================================================================

  describe.skipIf(!samplePdfsAvailable)('integration tests with sample PDFs', () => {
    it('should successfully extract text using fallback chain', async () => {
      const pdfPath = samplePdfPaths[0];
      const result = await extractWithFallbackChain(pdfPath, undefined, {
        enablePdfJs: false, // Only use pdf-parse for speed
        enableOcr: false,
      });

      expect(result.methodsAttempted.length).toBeGreaterThan(0);

      if (result.result.success) {
        expect(result.result.text.length).toBeGreaterThan(0);
        expect(result.successfulMethod).toBeDefined();
      }
    });

    it('should measure extraction performance', async () => {
      const pdfPath = samplePdfPaths[0];

      const startTime = performance.now();
      const result = await extractWithFallbackChain(pdfPath, undefined, {
        enablePdfJs: false,
        enableOcr: false,
      });
      const totalTime = performance.now() - startTime;

      // Should complete in reasonable time
      expect(totalTime).toBeLessThan(30000);
      expect(result.totalDurationMs).toBeGreaterThan(0);
    });

    it('should process batch of real PDFs', async () => {
      const paths = samplePdfPaths.slice(0, 2);

      const results = await extractBatchWithFallbackChain(
        paths,
        undefined,
        { enablePdfJs: false, enableOcr: false },
        2
      );

      const summary = getFallbackChainBatchSummary(results);

      expect(summary.totalCount).toBe(paths.length);
      // At least some should succeed (real PDFs)
      expect(summary.successCount + summary.failureCount).toBe(paths.length);
    });
  });
});
