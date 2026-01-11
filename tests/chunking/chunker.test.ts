/**
 * Unit Tests for Legal Document Chunker
 *
 * Tests the main chunking functionality:
 * - chunkLegalDocument() - Main chunking function
 * - quickChunk() - Simple chunking with defaults
 * - chunkForE5Large() - Optimized for e5-large embeddings
 * - chunkFineGrained() - Fine-grained chunking
 * - chunkLargeContext() - Large context chunking
 * - estimateChunkCount() - Chunk count estimation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  chunkLegalDocument,
  quickChunk,
  chunkForE5Large,
  chunkFineGrained,
  chunkLargeContext,
  estimateChunkCount,
  HebrewSectionType,
  createDefaultChunkingConfig,
  resetGlobalTokenCounter,
} from '../../lib/src/chunking/index.js';

// =============================================================================
// Test Setup
// =============================================================================

beforeEach(() => {
  resetGlobalTokenCounter();
});

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Simple legal document with sections
 */
const SIMPLE_LEGAL_DOC = `חוק לדוגמה

סעיף 1 - הגדרות
בחוק זה:
"מנהל" - האדם שמונה לנהל את הגוף.
"עובד" - אדם המועסק בגוף.

סעיף 2 - מטרות
מטרת חוק זה לקבוע את הכללים הבאים:
(א) קביעת מסגרת עבודה
(ב) הגדרת תפקידים
(ג) קביעת נהלים

סעיף 3 - תחולה
חוק זה יחול על כל הגופים הציבוריים.`;

/**
 * Hierarchical legal document
 */
const HIERARCHICAL_DOC = `חוק מורכב לדוגמה

חלק א - הוראות כלליות

פרק א - הגדרות

סעיף 1
הגדרות בסיסיות.

סעיף 2
הגדרות נוספות.

פרק ב - עקרונות

סעיף 3
עקרון ראשון.

סעיף 4
עקרון שני.

חלק ב - הוראות מיוחדות

פרק ג - סמכויות

סעיף 5
סמכות המנהל.

סעיף 6
סמכות הועדה.`;

/**
 * Long legal document for testing splitting
 */
function createLongSection(numParagraphs: number = 20): string {
  const paragraphs = [];
  for (let i = 0; i < numParagraphs; i++) {
    paragraphs.push(`פסקה מספר ${i + 1}: ${'תוכן הפסקה הזו מכיל מידע משפטי חשוב. '.repeat(10)}`);
  }
  return paragraphs.join('\n\n');
}

const LONG_SECTION_DOC = `סעיף 1 - סעיף ארוך
${createLongSection(30)}`;

/**
 * Document without sections
 */
const NO_SECTIONS_DOC = `זהו מסמך ללא סעיפים מוגדרים.
הוא מכיל טקסט רציף בלבד.
אין בו סימנים מיוחדים של חלקים או פרקים.
כל התוכן הוא פסקה אחת ארוכה.`;

// =============================================================================
// chunkLegalDocument() Tests
// =============================================================================

describe('chunkLegalDocument()', () => {
  describe('basic chunking', () => {
    it('should chunk a simple legal document', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: SIMPLE_LEGAL_DOC,
      });

      expect(result.sourceId).toBe('test_law_1');
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.totalChunks).toBe(result.chunks.length);
    });

    it('should generate unique chunk IDs', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: SIMPLE_LEGAL_DOC,
      });

      const ids = result.chunks.map((c) => c.chunkId);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should maintain correct chunk indices', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: SIMPLE_LEGAL_DOC,
      });

      result.chunks.forEach((chunk, index) => {
        expect(chunk.chunkIndex).toBe(index);
        expect(chunk.totalChunks).toBe(result.chunks.length);
      });
    });

    it('should preserve content integrity', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: SIMPLE_LEGAL_DOC,
      });

      // All chunks should have content
      result.chunks.forEach((chunk) => {
        expect(chunk.content.length).toBeGreaterThan(0);
        expect(chunk.charCount).toBe(chunk.content.length);
      });
    });

    it('should track token counts', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: SIMPLE_LEGAL_DOC,
      });

      result.chunks.forEach((chunk) => {
        expect(chunk.tokenCount).toBeGreaterThan(0);
        expect(typeof chunk.tokenCountEstimated).toBe('boolean');
      });
    });
  });

  describe('section detection', () => {
    it('should detect section markers', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: SIMPLE_LEGAL_DOC,
      });

      const chunksWithSections = result.chunks.filter((c) => c.section !== null);
      expect(chunksWithSections.length).toBeGreaterThan(0);
    });

    it('should include section type in chunk metadata', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: SIMPLE_LEGAL_DOC,
      });

      const sectionChunk = result.chunks.find((c) => c.section !== null);
      if (sectionChunk) {
        expect(sectionChunk.section?.type).toBeDefined();
      }
    });

    it('should handle hierarchical sections', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: HIERARCHICAL_DOC,
      });

      // Should detect multiple section types
      const sectionTypes = new Set(
        result.chunks
          .filter((c) => c.section !== null)
          .map((c) => c.section?.type)
      );

      expect(sectionTypes.size).toBeGreaterThan(1);
    });

    it('should build section hierarchy', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: HIERARCHICAL_DOC,
        config: { includeHierarchy: true },
      });

      const chunkWithHierarchy = result.chunks.find(
        (c) => c.sectionHierarchy.length > 0
      );

      if (chunkWithHierarchy) {
        expect(chunkWithHierarchy.sectionHierarchy.length).toBeGreaterThan(0);
        // Hierarchy should be ordered (parent to child)
        const levels = chunkWithHierarchy.sectionHierarchy.map((h) => {
          const levelMap: Record<string, number> = {
            'חלק': 2,
            'פרק': 3,
            'סימן': 4,
            'סעיף': 5,
          };
          return levelMap[h.type] ?? 6;
        });

        for (let i = 1; i < levels.length; i++) {
          expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
        }
      }
    });
  });

  describe('overlap handling', () => {
    it('should add overlap between chunks when configured', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: SIMPLE_LEGAL_DOC,
        config: { overlapRatio: 0.15 },
      });

      if (result.chunks.length > 1) {
        // At least some chunks should have overlap
        const hasOverlap = result.chunks.some(
          (c) => c.hasOverlapBefore || c.hasOverlapAfter
        );
        expect(hasOverlap).toBe(true);
      }
    });

    it('should track overlap character counts', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: SIMPLE_LEGAL_DOC,
        config: { overlapRatio: 0.15 },
      });

      result.chunks.forEach((chunk) => {
        if (chunk.hasOverlapBefore) {
          expect(chunk.overlapCharsBefore).toBeGreaterThan(0);
        }
        if (chunk.hasOverlapAfter) {
          expect(chunk.overlapCharsAfter).toBeGreaterThan(0);
        }
      });
    });

    it('should include overlap in statistics', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: SIMPLE_LEGAL_DOC,
        config: { overlapRatio: 0.15 },
      });

      expect(result.stats.overlapCharCount).toBeDefined();
      expect(typeof result.stats.overlapCharCount).toBe('number');
    });
  });

  describe('oversize handling', () => {
    it('should split oversize chunks with split strategy', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: LONG_SECTION_DOC,
        config: {
          maxTokens: 100,
          oversizeStrategy: 'split',
        },
      });

      // Should produce multiple chunks from the long section
      expect(result.chunks.length).toBeGreaterThan(1);

      // No chunk should exceed max tokens (with some tolerance)
      result.chunks.forEach((chunk) => {
        expect(chunk.tokenCount).toBeLessThanOrEqual(120); // Allow 20% tolerance
      });
    });

    it('should allow oversize chunks with allow strategy', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: LONG_SECTION_DOC,
        config: {
          maxTokens: 100,
          oversizeStrategy: 'allow',
        },
      });

      // Should have warnings about oversized chunks
      const hasOversizeWarning = result.warnings.some((w) =>
        w.includes('exceeds')
      );
      expect(hasOversizeWarning).toBe(true);
    });

    it('should truncate with truncate strategy', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: LONG_SECTION_DOC,
        config: {
          maxTokens: 100,
          oversizeStrategy: 'truncate',
        },
      });

      // Should have warnings about truncation
      const hasTruncateWarning = result.warnings.some((w) =>
        w.includes('Truncated')
      );
      expect(hasTruncateWarning).toBe(true);
    });
  });

  describe('undersize handling', () => {
    it('should merge small chunks with neighbors', () => {
      // Create document with very short sections
      const shortDoc = `סעיף 1
א

סעיף 2
ב

סעיף 3
ג`;

      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: shortDoc,
        config: {
          minTokens: 10,
          maxTokens: 450,
        },
      });

      // Small chunks should be merged
      // The result should have fewer chunks than sections
      expect(result.chunks.length).toBeLessThanOrEqual(3);
    });
  });

  describe('configuration', () => {
    it('should use default configuration', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: SIMPLE_LEGAL_DOC,
      });

      expect(result.config.maxTokens).toBe(450);
      expect(result.config.minTokens).toBe(50);
      expect(result.config.overlapRatio).toBe(0.15);
    });

    it('should accept custom configuration', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: SIMPLE_LEGAL_DOC,
        config: {
          maxTokens: 256,
          minTokens: 20,
          overlapRatio: 0.2,
        },
      });

      expect(result.config.maxTokens).toBe(256);
      expect(result.config.minTokens).toBe(20);
      expect(result.config.overlapRatio).toBe(0.2);
    });

    it('should respect section boundary settings', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: HIERARCHICAL_DOC,
        config: {
          respectSectionBoundaries: true,
          hardBreakSections: [HebrewSectionType.PART, HebrewSectionType.CHAPTER],
        },
      });

      expect(result.chunks.length).toBeGreaterThan(0);
    });
  });

  describe('metadata handling', () => {
    it('should include provided metadata in chunks', () => {
      const metadata = {
        lawId: 12345,
        lawName: 'חוק לדוגמה',
        publicationDate: '2024-01-01',
      };

      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: SIMPLE_LEGAL_DOC,
        metadata,
      });

      result.chunks.forEach((chunk) => {
        expect(chunk.metadata).toEqual(metadata);
      });
    });
  });

  describe('statistics', () => {
    it('should calculate correct statistics', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: SIMPLE_LEGAL_DOC,
      });

      expect(result.stats.originalCharCount).toBe(SIMPLE_LEGAL_DOC.length);
      expect(result.stats.totalChunkedCharCount).toBeGreaterThan(0);
      expect(result.stats.avgChunkCharCount).toBeGreaterThan(0);
      expect(result.stats.avgChunkTokenCount).toBeGreaterThan(0);
      expect(result.stats.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should track min and max chunk sizes', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: SIMPLE_LEGAL_DOC,
      });

      expect(result.stats.minChunkTokenCount).toBeLessThanOrEqual(
        result.stats.maxChunkTokenCount
      );

      // Min should match actual minimum
      const actualMin = Math.min(...result.chunks.map((c) => c.tokenCount));
      expect(result.stats.minChunkTokenCount).toBe(actualMin);

      // Max should match actual maximum
      const actualMax = Math.max(...result.chunks.map((c) => c.tokenCount));
      expect(result.stats.maxChunkTokenCount).toBe(actualMax);
    });

    it('should count sections detected', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: SIMPLE_LEGAL_DOC,
      });

      expect(result.stats.sectionsDetected).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle document without sections', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: NO_SECTIONS_DOC,
      });

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.stats.sectionsDetected).toBe(0);
    });

    it('should handle empty text', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: '',
      });

      expect(result.chunks).toEqual([]);
      expect(result.totalChunks).toBe(0);
    });

    it('should handle whitespace-only text', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: '   \n\t   ',
      });

      expect(result.totalChunks).toBe(0);
    });

    it('should handle very short text', () => {
      const result = chunkLegalDocument({
        sourceId: 'test_law_1',
        text: 'קצר',
      });

      expect(result.chunks.length).toBe(1);
      expect(result.chunks[0].content).toBe('קצר');
    });
  });
});

// =============================================================================
// Convenience Function Tests
// =============================================================================

describe('quickChunk()', () => {
  it('should chunk with default settings', () => {
    const result = quickChunk('test_law', SIMPLE_LEGAL_DOC);

    expect(result.sourceId).toBe('test_law');
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.config.maxTokens).toBe(450);
  });

  it('should be equivalent to chunkLegalDocument with defaults', () => {
    const result1 = quickChunk('test_law', SIMPLE_LEGAL_DOC);
    const result2 = chunkLegalDocument({
      sourceId: 'test_law',
      text: SIMPLE_LEGAL_DOC,
    });

    expect(result1.totalChunks).toBe(result2.totalChunks);
  });
});

describe('chunkForE5Large()', () => {
  it('should use settings optimized for e5-large', () => {
    const result = chunkForE5Large('test_law', SIMPLE_LEGAL_DOC);

    expect(result.config.maxTokens).toBe(450); // Leave room for special tokens
    expect(result.config.minTokens).toBe(50);
    expect(result.config.overlapRatio).toBe(0.15);
  });

  it('should not exceed e5-large max context', () => {
    const result = chunkForE5Large('test_law', LONG_SECTION_DOC);

    // All chunks should be within e5-large limit (512 - some buffer)
    result.chunks.forEach((chunk) => {
      expect(chunk.tokenCount).toBeLessThanOrEqual(512);
    });
  });
});

describe('chunkFineGrained()', () => {
  it('should use smaller chunk sizes', () => {
    const result = chunkFineGrained('test_law', SIMPLE_LEGAL_DOC);

    expect(result.config.maxTokens).toBe(256);
    expect(result.config.minTokens).toBe(30);
  });

  it('should produce more chunks than default', () => {
    const fineResult = chunkFineGrained('test_law', SIMPLE_LEGAL_DOC);
    const defaultResult = quickChunk('test_law', SIMPLE_LEGAL_DOC);

    // Fine-grained should produce same or more chunks
    expect(fineResult.chunks.length).toBeGreaterThanOrEqual(
      defaultResult.chunks.length
    );
  });

  it('should have higher overlap ratio', () => {
    const result = chunkFineGrained('test_law', SIMPLE_LEGAL_DOC);

    expect(result.config.overlapRatio).toBe(0.2);
  });
});

describe('chunkLargeContext()', () => {
  it('should use larger chunk sizes', () => {
    const result = chunkLargeContext('test_law', SIMPLE_LEGAL_DOC);

    expect(result.config.maxTokens).toBe(512);
    expect(result.config.minTokens).toBe(100);
  });

  it('should produce fewer chunks than default', () => {
    const largeResult = chunkLargeContext('test_law', SIMPLE_LEGAL_DOC);
    const defaultResult = quickChunk('test_law', SIMPLE_LEGAL_DOC);

    // Large context should produce same or fewer chunks
    expect(largeResult.chunks.length).toBeLessThanOrEqual(
      defaultResult.chunks.length
    );
  });

  it('should have lower overlap ratio', () => {
    const result = chunkLargeContext('test_law', SIMPLE_LEGAL_DOC);

    expect(result.config.overlapRatio).toBe(0.1);
  });
});

// =============================================================================
// estimateChunkCount() Tests
// =============================================================================

describe('estimateChunkCount()', () => {
  it('should estimate number of chunks', () => {
    const estimate = estimateChunkCount(SIMPLE_LEGAL_DOC);

    expect(estimate).toBeGreaterThan(0);
    expect(Number.isInteger(estimate)).toBe(true);
  });

  it('should increase estimate with smaller max tokens', () => {
    const largeChunks = estimateChunkCount(SIMPLE_LEGAL_DOC, { maxTokens: 450 });
    const smallChunks = estimateChunkCount(SIMPLE_LEGAL_DOC, { maxTokens: 100 });

    expect(smallChunks).toBeGreaterThanOrEqual(largeChunks);
  });

  it('should account for overlap in estimate', () => {
    const noOverlap = estimateChunkCount(SIMPLE_LEGAL_DOC, { overlapRatio: 0 });
    const withOverlap = estimateChunkCount(SIMPLE_LEGAL_DOC, { overlapRatio: 0.2 });

    // More overlap = more chunks needed
    expect(withOverlap).toBeGreaterThanOrEqual(noOverlap);
  });

  it('should be reasonably accurate', () => {
    const estimate = estimateChunkCount(SIMPLE_LEGAL_DOC);
    const actual = quickChunk('test', SIMPLE_LEGAL_DOC).totalChunks;

    // Estimate should be within 50% of actual
    expect(estimate).toBeGreaterThanOrEqual(actual * 0.5);
    expect(estimate).toBeLessThanOrEqual(actual * 2);
  });

  it('should handle empty text', () => {
    const estimate = estimateChunkCount('');
    expect(estimate).toBe(0);
  });

  it('should handle very short text', () => {
    const estimate = estimateChunkCount('קצר');
    expect(estimate).toBe(1);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration Tests', () => {
  it('should handle realistic Israeli law structure', () => {
    const israeliLaw = `חוק ההתיישנות, התשי"ח-1958

פרק א: הוראות יסוד

סעיף 1 - תביעה והתיישנות
תביעה לקיום זכות כל שהיא נדחית מחמת התיישנות, אם הוגשה לאחר שעברה תקופת ההתיישנות.

סעיף 2 - הזכות לא בטלה
אין בהתיישנות בלבד כדי לבטל את הזכות גופה.

פרק ב: תקופות התיישנות

סעיף 5 - התקופה הרגילה
תקופת ההתיישנות היא שבע שנים.

סעיף 6 - מקרקעין
בתביעה במקרקעין - התקופה היא חמש עשרה שנה.`;

    const result = chunkLegalDocument({
      sourceId: 'law_123',
      text: israeliLaw,
      metadata: {
        lawName: 'חוק ההתיישנות',
        year: 1958,
      },
    });

    // Should properly detect structure
    expect(result.stats.sectionsDetected).toBeGreaterThan(0);

    // Should have multiple chunks
    expect(result.chunks.length).toBeGreaterThan(0);

    // Each chunk should have section info
    const chunksWithSections = result.chunks.filter((c) => c.section !== null);
    expect(chunksWithSections.length).toBeGreaterThan(0);
  });

  it('should handle amendments section', () => {
    const lawWithAmendment = `חוק המקור

סעיף 1
תוכן מקורי

תיקון מס' 5

סעיף 1א
תוכן מתוקן`;

    const result = chunkLegalDocument({
      sourceId: 'law_amended',
      text: lawWithAmendment,
    });

    // Should detect amendment section
    const amendmentChunk = result.chunks.find(
      (c) => c.section?.type === HebrewSectionType.AMENDMENT
    );
    expect(amendmentChunk).toBeDefined();
  });

  it('should handle schedules/appendices', () => {
    const lawWithSchedule = `חוק עם תוספת

סעיף 1
הוראות עיקריות

תוספת ראשונה

טבלה או רשימה`;

    const result = chunkLegalDocument({
      sourceId: 'law_schedule',
      text: lawWithSchedule,
    });

    // Should detect schedule section
    const scheduleChunk = result.chunks.find(
      (c) => c.section?.type === HebrewSectionType.SCHEDULE
    );
    expect(scheduleChunk).toBeDefined();
  });

  it('should preserve Hebrew text correctly', () => {
    const hebrewText = `סעיף 1 - הגדרות

בחוק זה:
"שופט" - שופט של בית משפט מחוזי;
"יושב ראש" - יושב ראש הועדה;

סעיף 2 - סמכויות

השופט רשאי לפעול בהתאם לחוק.`;

    const result = chunkLegalDocument({
      sourceId: 'hebrew_test',
      text: hebrewText,
    });

    // Content should contain Hebrew
    const hebrewPattern = /[\u0590-\u05FF]/;
    result.chunks.forEach((chunk) => {
      expect(hebrewPattern.test(chunk.content)).toBe(true);
    });
  });
});
