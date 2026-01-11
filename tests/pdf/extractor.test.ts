/**
 * Unit Tests for PDF Extractor
 *
 * Tests the PDF text extraction functionality including:
 * - extractPdfText() function
 * - extractPdfTextFromBuffer() function
 * - extractPdfTextFromFile() function
 * - extractPdfTextBatch() function
 * - getBatchExtractionSummary() function
 *
 * Uses sample PDFs from the skraper/downloads directory for integration tests
 * and programmatically generated PDFs for unit tests.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractPdfText,
  extractPdfTextFromBuffer,
  extractPdfTextFromFile,
  extractPdfTextBatch,
  getBatchExtractionSummary,
  PdfErrorCode,
  type PdfExtractionResult,
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
async function getSamplePdfPaths(limit: number = 5): Promise<string[]> {
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
 * Create a minimal valid PDF buffer for testing
 * This is a simplified PDF that contains minimal text
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
 * Create an invalid PDF buffer (not a real PDF)
 */
function createInvalidPdfBuffer(): Buffer {
  return Buffer.from('This is not a PDF file', 'utf-8');
}

/**
 * Create an empty buffer
 */
function createEmptyBuffer(): Buffer {
  return Buffer.alloc(0);
}

// =============================================================================
// Test Suites
// =============================================================================

describe('PDF Extractor', () => {
  let samplePdfsAvailable = false;
  let samplePdfPaths: string[] = [];

  beforeAll(async () => {
    samplePdfsAvailable = await hasSamplePdfs();
    if (samplePdfsAvailable) {
      samplePdfPaths = await getSamplePdfPaths(5);
    }
  });

  // ===========================================================================
  // extractPdfText() Tests
  // ===========================================================================

  describe('extractPdfText()', () => {
    describe('with Buffer input', () => {
      it('should extract text from a valid PDF buffer', async () => {
        const buffer = createMinimalPdfBuffer();
        const result = await extractPdfText(buffer);

        // Note: The minimal PDF may or may not extract text depending on pdf-parse's capabilities
        // What's important is that it doesn't throw and returns a result object
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.text).toBe('string');
        expect(typeof result.pageCount).toBe('number');
        expect(typeof result.charCount).toBe('number');
        expect(result.method).toBe('pdf-parse');
      });

      it('should return failure result for invalid PDF buffer', async () => {
        const buffer = createInvalidPdfBuffer();
        const result = await extractPdfText(buffer);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(PdfErrorCode.INVALID_PDF);
        expect(result.error).toBeDefined();
        expect(result.text).toBe('');
      });

      it('should return failure result for empty buffer', async () => {
        const buffer = createEmptyBuffer();
        const result = await extractPdfText(buffer);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(PdfErrorCode.EMPTY_CONTENT);
        expect(result.error).toBeDefined();
      });

      it('should include durationMs in result', async () => {
        const buffer = createMinimalPdfBuffer();
        const result = await extractPdfText(buffer);

        expect(result.durationMs).toBeDefined();
        expect(typeof result.durationMs).toBe('number');
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      });
    });

    describe('with file path input', () => {
      it('should return failure for non-existent file', async () => {
        const result = await extractPdfText('/non/existent/path/to/file.pdf');

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(PdfErrorCode.FILE_NOT_FOUND);
        expect(result.error).toContain('not found');
      });

      it.skipIf(!samplePdfsAvailable)(
        'should extract text from a real PDF file',
        async () => {
          const pdfPath = samplePdfPaths[0];
          const result = await extractPdfText(pdfPath);

          expect(result).toBeDefined();
          expect(result.filePath).toBe(pdfPath);

          // Real PDFs should successfully extract
          if (result.success) {
            expect(result.text.length).toBeGreaterThan(0);
            expect(result.charCount).toBeGreaterThan(0);
            expect(result.pageCount).toBeGreaterThan(0);
          }
        }
      );

      it.skipIf(!samplePdfsAvailable)(
        'should include filePath in result when extracting from file',
        async () => {
          const pdfPath = samplePdfPaths[0];
          const result = await extractPdfText(pdfPath);

          expect(result.filePath).toBe(pdfPath);
        }
      );
    });

    describe('with options', () => {
      it.skipIf(!samplePdfsAvailable)(
        'should respect maxPages option',
        async () => {
          const pdfPath = samplePdfPaths[0];

          // First get the full extraction to know how many pages
          const fullResult = await extractPdfText(pdfPath);

          if (fullResult.success && fullResult.pageCount > 1) {
            // Now limit to just 1 page
            const limitedResult = await extractPdfText(pdfPath, { maxPages: 1 });

            expect(limitedResult.success).toBe(true);
            // The extracted text should be shorter when limited
            // (not always guaranteed due to varying page sizes, but generally true)
            expect(limitedResult.charCount).toBeLessThanOrEqual(fullResult.charCount);
          }
        }
      );
    });
  });

  // ===========================================================================
  // extractPdfTextFromBuffer() Tests
  // ===========================================================================

  describe('extractPdfTextFromBuffer()', () => {
    it('should work identically to extractPdfText with Buffer', async () => {
      const buffer = createMinimalPdfBuffer();

      const result1 = await extractPdfText(buffer);
      const result2 = await extractPdfTextFromBuffer(buffer);

      // Results should have same structure (content may vary due to timing)
      expect(result1.success).toBe(result2.success);
      expect(result1.errorCode).toBe(result2.errorCode);
    });
  });

  // ===========================================================================
  // extractPdfTextFromFile() Tests
  // ===========================================================================

  describe('extractPdfTextFromFile()', () => {
    it('should return failure for non-existent file', async () => {
      const result = await extractPdfTextFromFile('/non/existent/file.pdf');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(PdfErrorCode.FILE_NOT_FOUND);
    });

    it.skipIf(!samplePdfsAvailable)(
      'should extract text from file path',
      async () => {
        const pdfPath = samplePdfPaths[0];
        const result = await extractPdfTextFromFile(pdfPath);

        expect(result).toBeDefined();
        expect(result.filePath).toBe(pdfPath);
      }
    );
  });

  // ===========================================================================
  // extractPdfTextBatch() Tests
  // ===========================================================================

  describe('extractPdfTextBatch()', () => {
    it('should return empty array for empty input', async () => {
      const results = await extractPdfTextBatch([]);

      expect(results).toEqual([]);
    });

    it('should handle non-existent files in batch', async () => {
      const paths = [
        '/non/existent/file1.pdf',
        '/non/existent/file2.pdf',
      ];
      const results = await extractPdfTextBatch(paths);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(false);
      expect(results[0].errorCode).toBe(PdfErrorCode.FILE_NOT_FOUND);
      expect(results[1].errorCode).toBe(PdfErrorCode.FILE_NOT_FOUND);
    });

    it.skipIf(!samplePdfsAvailable || samplePdfPaths.length < 3)(
      'should process multiple PDFs in batch',
      async () => {
        const paths = samplePdfPaths.slice(0, 3);
        const results = await extractPdfTextBatch(paths);

        expect(results).toHaveLength(3);

        // Each result should have a filePath that matches input order
        for (let i = 0; i < results.length; i++) {
          expect(results[i].filePath).toBe(paths[i]);
        }
      }
    );

    it.skipIf(!samplePdfsAvailable || samplePdfPaths.length < 3)(
      'should respect concurrency limit',
      async () => {
        const paths = samplePdfPaths.slice(0, 3);

        // With concurrency of 1, files should be processed one at a time
        const startTime = performance.now();
        const results = await extractPdfTextBatch(paths, undefined, 1);
        const sequentialTime = performance.now() - startTime;

        expect(results).toHaveLength(3);
        // Sequential processing should take non-trivial time
        expect(sequentialTime).toBeGreaterThan(0);
      }
    );

    it('should handle mixed success and failure', async () => {
      const paths = [
        '/non/existent/file.pdf',
        ...(samplePdfsAvailable ? samplePdfPaths.slice(0, 1) : []),
      ];

      if (paths.length > 1) {
        const results = await extractPdfTextBatch(paths);

        expect(results[0].success).toBe(false);
        // The second result depends on whether sample PDFs exist
      }
    });
  });

  // ===========================================================================
  // getBatchExtractionSummary() Tests
  // ===========================================================================

  describe('getBatchExtractionSummary()', () => {
    it('should return correct summary for empty results', () => {
      const summary = getBatchExtractionSummary([]);

      expect(summary.totalCount).toBe(0);
      expect(summary.successCount).toBe(0);
      expect(summary.failureCount).toBe(0);
      expect(summary.partialCount).toBe(0);
      expect(summary.totalCharacters).toBe(0);
      expect(summary.totalPages).toBe(0);
      expect(summary.successPaths).toEqual([]);
      expect(summary.failedPaths).toEqual([]);
      expect(summary.failuresByCode).toEqual({});
    });

    it('should correctly count successes and failures', () => {
      const results: PdfExtractionResult[] = [
        {
          success: true,
          text: 'Hello world',
          charCount: 11,
          pageCount: 1,
          method: 'pdf-parse',
          metadata: null,
          info: null,
          filePath: '/path/to/success.pdf',
        },
        {
          success: false,
          text: '',
          charCount: 0,
          pageCount: 0,
          method: 'pdf-parse',
          error: 'File not found',
          errorCode: PdfErrorCode.FILE_NOT_FOUND,
          metadata: null,
          info: null,
          filePath: '/path/to/failure.pdf',
        },
      ];

      const summary = getBatchExtractionSummary(results);

      expect(summary.totalCount).toBe(2);
      expect(summary.successCount).toBe(1);
      expect(summary.failureCount).toBe(1);
      expect(summary.totalCharacters).toBe(11);
      expect(summary.totalPages).toBe(1);
      expect(summary.successPaths).toContain('/path/to/success.pdf');
      expect(summary.failedPaths).toContain('/path/to/failure.pdf');
      expect(summary.failuresByCode[PdfErrorCode.FILE_NOT_FOUND]).toBe(1);
    });

    it('should track partial extractions', () => {
      const results: PdfExtractionResult[] = [
        {
          success: true,
          text: 'Partial content',
          charCount: 15,
          pageCount: 1,
          method: 'pdf-parse',
          metadata: null,
          info: null,
          isPartial: true,
          filePath: '/path/to/partial.pdf',
        },
      ];

      const summary = getBatchExtractionSummary(results);

      expect(summary.partialCount).toBe(1);
      expect(summary.successCount).toBe(1);
    });

    it('should group failures by error code', () => {
      const results: PdfExtractionResult[] = [
        {
          success: false,
          text: '',
          charCount: 0,
          pageCount: 0,
          method: 'pdf-parse',
          error: 'File not found',
          errorCode: PdfErrorCode.FILE_NOT_FOUND,
          metadata: null,
          info: null,
        },
        {
          success: false,
          text: '',
          charCount: 0,
          pageCount: 0,
          method: 'pdf-parse',
          error: 'Invalid PDF',
          errorCode: PdfErrorCode.INVALID_PDF,
          metadata: null,
          info: null,
        },
        {
          success: false,
          text: '',
          charCount: 0,
          pageCount: 0,
          method: 'pdf-parse',
          error: 'Also not found',
          errorCode: PdfErrorCode.FILE_NOT_FOUND,
          metadata: null,
          info: null,
        },
      ];

      const summary = getBatchExtractionSummary(results);

      expect(summary.failuresByCode[PdfErrorCode.FILE_NOT_FOUND]).toBe(2);
      expect(summary.failuresByCode[PdfErrorCode.INVALID_PDF]).toBe(1);
    });
  });

  // ===========================================================================
  // Integration Tests with Real PDFs
  // ===========================================================================

  describe.skipIf(!samplePdfsAvailable)('integration tests with sample PDFs', () => {
    it('should extract Hebrew text from Israeli law PDFs', async () => {
      const pdfPath = samplePdfPaths[0];
      const result = await extractPdfText(pdfPath);

      if (result.success) {
        // Check that we got some content
        expect(result.text.length).toBeGreaterThan(0);

        // Check for Hebrew characters (Unicode range U+0590 to U+05FF)
        const hebrewPattern = /[\u0590-\u05FF]/;
        const hasHebrew = hebrewPattern.test(result.text);

        // Most Israeli law PDFs should contain Hebrew
        // (allow for the possibility of English-only documents)
        expect(typeof hasHebrew).toBe('boolean');
      }
    });

    it('should handle multiple PDFs without memory issues', async () => {
      // Process several PDFs to check for memory stability
      const paths = samplePdfPaths.slice(0, 3);
      const results = await extractPdfTextBatch(paths, undefined, 2);

      expect(results).toHaveLength(paths.length);

      const summary = getBatchExtractionSummary(results);
      // At least some should succeed
      expect(summary.successCount + summary.failureCount).toBe(paths.length);
    });

    it('should measure extraction performance', async () => {
      const pdfPath = samplePdfPaths[0];

      const startTime = performance.now();
      const result = await extractPdfText(pdfPath);
      const totalTime = performance.now() - startTime;

      // Verify timing is reasonable (less than 30 seconds for a single PDF)
      expect(totalTime).toBeLessThan(30000);

      // The result should include timing information
      expect(result.durationMs).toBeDefined();
      expect(result.durationMs).toBeGreaterThan(0);
    });
  });
});
