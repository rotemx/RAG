/**
 * Unit Tests for Chunking Types and Utilities
 *
 * Tests the type definitions, schemas, and utility functions for chunking:
 * - generateChunkId() and parseChunkId()
 * - getSectionHierarchyLevel() and isSectionParentOf()
 * - createSectionPath()
 * - estimateTokenCount() and related calculations
 * - Zod schema validation
 */

import { describe, it, expect } from 'vitest';
import {
  HebrewSectionType,
  HebrewSectionTypeSchema,
  SECTION_HIERARCHY,
  ChunkingConfigSchema,
  createDefaultChunkingConfig,
  SectionMarkerSchema,
  TextChunkSchema,
  ChunkingResultSchema,
  TokenCountResultSchema,
  generateChunkId,
  parseChunkId,
  getSectionHierarchyLevel,
  isSectionParentOf,
  createSectionPath,
  estimateTokenCount,
  wouldExceedMaxTokens,
  calculateOverlapChars,
  isValidChunk,
} from '../../lib/src/chunking/index.js';

// =============================================================================
// HebrewSectionType Tests
// =============================================================================

describe('HebrewSectionType', () => {
  it('should define all expected section types', () => {
    expect(HebrewSectionType.PART).toBe('חלק');
    expect(HebrewSectionType.CHAPTER).toBe('פרק');
    expect(HebrewSectionType.SUBCHAPTER).toBe('סימן');
    expect(HebrewSectionType.SECTION).toBe('סעיף');
    expect(HebrewSectionType.SUBSECTION).toBe('תת-סעיף');
    expect(HebrewSectionType.DEFINITIONS).toBe('הגדרות');
    expect(HebrewSectionType.SCHEDULE).toBe('תוספת');
    expect(HebrewSectionType.PREAMBLE).toBe('מבוא');
    expect(HebrewSectionType.TITLE).toBe('כותרת');
    expect(HebrewSectionType.INTERPRETATION).toBe('פרשנות');
    expect(HebrewSectionType.COMMENCEMENT).toBe('תחילה');
    expect(HebrewSectionType.REPEAL).toBe('ביטול');
    expect(HebrewSectionType.AMENDMENT).toBe('תיקון');
    expect(HebrewSectionType.OTHER).toBe('אחר');
  });

  it('should validate section types with Zod schema', () => {
    expect(HebrewSectionTypeSchema.safeParse('חלק').success).toBe(true);
    expect(HebrewSectionTypeSchema.safeParse('פרק').success).toBe(true);
    expect(HebrewSectionTypeSchema.safeParse('סעיף').success).toBe(true);
    expect(HebrewSectionTypeSchema.safeParse('invalid').success).toBe(false);
    expect(HebrewSectionTypeSchema.safeParse(123).success).toBe(false);
  });
});

// =============================================================================
// SECTION_HIERARCHY Tests
// =============================================================================

describe('SECTION_HIERARCHY', () => {
  it('should define hierarchy levels for all section types', () => {
    expect(SECTION_HIERARCHY[HebrewSectionType.TITLE]).toBe(0);
    expect(SECTION_HIERARCHY[HebrewSectionType.PREAMBLE]).toBe(1);
    expect(SECTION_HIERARCHY[HebrewSectionType.PART]).toBe(2);
    expect(SECTION_HIERARCHY[HebrewSectionType.CHAPTER]).toBe(3);
    expect(SECTION_HIERARCHY[HebrewSectionType.SUBCHAPTER]).toBe(4);
    expect(SECTION_HIERARCHY[HebrewSectionType.SECTION]).toBe(5);
    expect(SECTION_HIERARCHY[HebrewSectionType.SUBSECTION]).toBe(6);
  });

  it('should have TITLE as the highest level (0)', () => {
    const levels = Object.values(SECTION_HIERARCHY);
    const minLevel = Math.min(...levels);
    expect(SECTION_HIERARCHY[HebrewSectionType.TITLE]).toBe(minLevel);
  });

  it('should have correct parent-child relationships', () => {
    expect(SECTION_HIERARCHY[HebrewSectionType.PART]).toBeLessThan(
      SECTION_HIERARCHY[HebrewSectionType.CHAPTER]
    );
    expect(SECTION_HIERARCHY[HebrewSectionType.CHAPTER]).toBeLessThan(
      SECTION_HIERARCHY[HebrewSectionType.SUBCHAPTER]
    );
    expect(SECTION_HIERARCHY[HebrewSectionType.SUBCHAPTER]).toBeLessThan(
      SECTION_HIERARCHY[HebrewSectionType.SECTION]
    );
    expect(SECTION_HIERARCHY[HebrewSectionType.SECTION]).toBeLessThan(
      SECTION_HIERARCHY[HebrewSectionType.SUBSECTION]
    );
  });
});

// =============================================================================
// generateChunkId() and parseChunkId() Tests
// =============================================================================

describe('generateChunkId()', () => {
  it('should generate deterministic chunk IDs', () => {
    const id1 = generateChunkId('law_123', 0);
    const id2 = generateChunkId('law_123', 0);
    expect(id1).toBe(id2);
  });

  it('should include source ID and chunk index', () => {
    const id = generateChunkId('law_456', 5);
    expect(id).toBe('law_456_chunk_5');
  });

  it('should handle various source ID formats', () => {
    expect(generateChunkId('simple', 0)).toBe('simple_chunk_0');
    expect(generateChunkId('with-dashes', 10)).toBe('with-dashes_chunk_10');
    expect(generateChunkId('with_underscores', 99)).toBe('with_underscores_chunk_99');
    expect(generateChunkId('123numeric', 0)).toBe('123numeric_chunk_0');
  });

  it('should handle edge case indices', () => {
    expect(generateChunkId('source', 0)).toBe('source_chunk_0');
    expect(generateChunkId('source', 9999)).toBe('source_chunk_9999');
  });
});

describe('parseChunkId()', () => {
  it('should parse valid chunk IDs', () => {
    const result = parseChunkId('law_123_chunk_5');
    expect(result).not.toBeNull();
    expect(result?.sourceId).toBe('law_123');
    expect(result?.chunkIndex).toBe(5);
  });

  it('should handle source IDs with underscores', () => {
    const result = parseChunkId('my_complex_source_id_chunk_42');
    expect(result).not.toBeNull();
    expect(result?.sourceId).toBe('my_complex_source_id');
    expect(result?.chunkIndex).toBe(42);
  });

  it('should return null for invalid chunk IDs', () => {
    expect(parseChunkId('invalid')).toBeNull();
    expect(parseChunkId('no_chunk_suffix')).toBeNull();
    expect(parseChunkId('source_chunk_')).toBeNull();
    expect(parseChunkId('source_chunk_abc')).toBeNull();
    expect(parseChunkId('')).toBeNull();
  });

  it('should round-trip with generateChunkId', () => {
    const sourceId = 'test_source_123';
    const chunkIndex = 7;
    const id = generateChunkId(sourceId, chunkIndex);
    const parsed = parseChunkId(id);

    expect(parsed).not.toBeNull();
    expect(parsed?.sourceId).toBe(sourceId);
    expect(parsed?.chunkIndex).toBe(chunkIndex);
  });
});

// =============================================================================
// getSectionHierarchyLevel() Tests
// =============================================================================

describe('getSectionHierarchyLevel()', () => {
  it('should return correct hierarchy level for known types', () => {
    expect(getSectionHierarchyLevel(HebrewSectionType.TITLE)).toBe(0);
    expect(getSectionHierarchyLevel(HebrewSectionType.PART)).toBe(2);
    expect(getSectionHierarchyLevel(HebrewSectionType.CHAPTER)).toBe(3);
    expect(getSectionHierarchyLevel(HebrewSectionType.SECTION)).toBe(5);
  });

  it('should return OTHER level for unknown types', () => {
    // Type cast to test edge case
    const unknownType = 'unknown' as HebrewSectionType;
    expect(getSectionHierarchyLevel(unknownType)).toBe(SECTION_HIERARCHY[HebrewSectionType.OTHER]);
  });
});

// =============================================================================
// isSectionParentOf() Tests
// =============================================================================

describe('isSectionParentOf()', () => {
  it('should return true for valid parent-child relationships', () => {
    expect(isSectionParentOf(HebrewSectionType.PART, HebrewSectionType.CHAPTER)).toBe(true);
    expect(isSectionParentOf(HebrewSectionType.CHAPTER, HebrewSectionType.SECTION)).toBe(true);
    expect(isSectionParentOf(HebrewSectionType.TITLE, HebrewSectionType.SUBSECTION)).toBe(true);
  });

  it('should return false for invalid parent-child relationships', () => {
    expect(isSectionParentOf(HebrewSectionType.SECTION, HebrewSectionType.PART)).toBe(false);
    expect(isSectionParentOf(HebrewSectionType.CHAPTER, HebrewSectionType.CHAPTER)).toBe(false);
    expect(isSectionParentOf(HebrewSectionType.SUBSECTION, HebrewSectionType.SECTION)).toBe(false);
  });

  it('should return false for same section type', () => {
    expect(isSectionParentOf(HebrewSectionType.SECTION, HebrewSectionType.SECTION)).toBe(false);
  });
});

// =============================================================================
// createSectionPath() Tests
// =============================================================================

describe('createSectionPath()', () => {
  it('should create path from hierarchy', () => {
    const hierarchy = [
      { type: HebrewSectionType.PART, number: 'א', title: null },
      { type: HebrewSectionType.CHAPTER, number: '1', title: 'כללי' },
    ];

    const path = createSectionPath(hierarchy);
    expect(path).toBe('חלק א > פרק 1 (כללי)');
  });

  it('should handle empty hierarchy', () => {
    expect(createSectionPath([])).toBe('');
  });

  it('should handle hierarchy without numbers', () => {
    const hierarchy = [
      { type: HebrewSectionType.DEFINITIONS, number: null, title: null },
    ];

    const path = createSectionPath(hierarchy);
    expect(path).toBe('הגדרות');
  });

  it('should handle hierarchy with titles only', () => {
    const hierarchy = [
      { type: HebrewSectionType.SECTION, number: null, title: 'מטרת החוק' },
    ];

    const path = createSectionPath(hierarchy);
    expect(path).toBe('סעיף (מטרת החוק)');
  });

  it('should handle complex hierarchy', () => {
    const hierarchy = [
      { type: HebrewSectionType.PART, number: 'א', title: 'הוראות כלליות' },
      { type: HebrewSectionType.CHAPTER, number: '2', title: null },
      { type: HebrewSectionType.SECTION, number: '5', title: null },
    ];

    const path = createSectionPath(hierarchy);
    expect(path).toBe('חלק א (הוראות כלליות) > פרק 2 > סעיף 5');
  });
});

// =============================================================================
// estimateTokenCount() Tests
// =============================================================================

describe('estimateTokenCount()', () => {
  it('should estimate tokens based on character count', () => {
    // Default chars per token is 2.5
    expect(estimateTokenCount(100)).toBe(40); // 100 / 2.5 = 40
    expect(estimateTokenCount(250)).toBe(100); // 250 / 2.5 = 100
  });

  it('should use custom chars per token', () => {
    expect(estimateTokenCount(100, 4)).toBe(25); // 100 / 4 = 25
    expect(estimateTokenCount(100, 2)).toBe(50); // 100 / 2 = 50
  });

  it('should round up', () => {
    expect(estimateTokenCount(7, 2.5)).toBe(3); // 7 / 2.5 = 2.8 -> 3
    expect(estimateTokenCount(1, 2.5)).toBe(1); // 1 / 2.5 = 0.4 -> 1
  });

  it('should handle edge cases', () => {
    expect(estimateTokenCount(0)).toBe(0);
  });
});

// =============================================================================
// wouldExceedMaxTokens() Tests
// =============================================================================

describe('wouldExceedMaxTokens()', () => {
  it('should detect when adding chars would exceed limit', () => {
    // Current: 400 tokens, adding 200 chars (80 tokens), max: 450
    expect(wouldExceedMaxTokens(400, 200, 450)).toBe(true); // 400 + 80 = 480 > 450
  });

  it('should return false when within limit', () => {
    // Current: 100 tokens, adding 100 chars (40 tokens), max: 450
    expect(wouldExceedMaxTokens(100, 100, 450)).toBe(false); // 100 + 40 = 140 < 450
  });

  it('should handle exact limit', () => {
    // Current: 400 tokens, adding 125 chars (50 tokens), max: 450
    expect(wouldExceedMaxTokens(400, 125, 450)).toBe(false); // 400 + 50 = 450 = 450
  });

  it('should use custom chars per token', () => {
    expect(wouldExceedMaxTokens(400, 200, 450, 4)).toBe(false); // 400 + 50 = 450
    expect(wouldExceedMaxTokens(400, 200, 449, 4)).toBe(true); // 400 + 50 = 450 > 449
  });
});

// =============================================================================
// calculateOverlapChars() Tests
// =============================================================================

describe('calculateOverlapChars()', () => {
  it('should calculate overlap based on token count and ratio', () => {
    const config = createDefaultChunkingConfig({
      overlapRatio: 0.15,
      minOverlapTokens: 20,
      maxOverlapTokens: 100,
      charsPerTokenEstimate: 2.5,
    });

    // 400 tokens * 0.15 = 60 tokens overlap
    // 60 tokens * 2.5 chars = 150 chars
    const overlap = calculateOverlapChars(400, config);
    expect(overlap).toBe(150);
  });

  it('should respect minimum overlap', () => {
    const config = createDefaultChunkingConfig({
      overlapRatio: 0.05, // Very small ratio
      minOverlapTokens: 30,
      maxOverlapTokens: 100,
      charsPerTokenEstimate: 2.5,
    });

    // 100 tokens * 0.05 = 5 tokens, but min is 30
    // 30 tokens * 2.5 chars = 75 chars
    const overlap = calculateOverlapChars(100, config);
    expect(overlap).toBe(75);
  });

  it('should respect maximum overlap', () => {
    const config = createDefaultChunkingConfig({
      overlapRatio: 0.5, // Large ratio
      minOverlapTokens: 20,
      maxOverlapTokens: 50,
      charsPerTokenEstimate: 2.5,
    });

    // 400 tokens * 0.5 = 200 tokens, but max is 50
    // 50 tokens * 2.5 chars = 125 chars
    const overlap = calculateOverlapChars(400, config);
    expect(overlap).toBe(125);
  });
});

// =============================================================================
// isValidChunk() Tests
// =============================================================================

describe('isValidChunk()', () => {
  it('should validate chunks meeting minimum requirements', () => {
    const config = createDefaultChunkingConfig({ minTokens: 50 });

    expect(isValidChunk({ content: 'Some content', tokenCount: 100 }, config)).toBe(true);
    expect(isValidChunk({ content: 'Some content', tokenCount: 50 }, config)).toBe(true);
  });

  it('should reject chunks below minimum tokens', () => {
    const config = createDefaultChunkingConfig({ minTokens: 50 });

    expect(isValidChunk({ content: 'Short', tokenCount: 10 }, config)).toBe(false);
    expect(isValidChunk({ content: 'Some content', tokenCount: 49 }, config)).toBe(false);
  });

  it('should reject empty content', () => {
    const config = createDefaultChunkingConfig({ minTokens: 10 });

    expect(isValidChunk({ content: '', tokenCount: 100 }, config)).toBe(false);
    expect(isValidChunk({ content: '   ', tokenCount: 100 }, config)).toBe(false);
    expect(isValidChunk({ content: '\n\t', tokenCount: 100 }, config)).toBe(false);
  });
});

// =============================================================================
// ChunkingConfigSchema Tests
// =============================================================================

describe('ChunkingConfigSchema', () => {
  it('should create default config', () => {
    const config = createDefaultChunkingConfig();

    expect(config.maxTokens).toBe(450);
    expect(config.minTokens).toBe(50);
    expect(config.overlapRatio).toBe(0.15);
    expect(config.respectSectionBoundaries).toBe(true);
    expect(config.oversizeStrategy).toBe('split');
    expect(config.preserveParagraphs).toBe(true);
  });

  it('should allow overriding defaults', () => {
    const config = createDefaultChunkingConfig({
      maxTokens: 256,
      minTokens: 20,
      overlapRatio: 0.2,
    });

    expect(config.maxTokens).toBe(256);
    expect(config.minTokens).toBe(20);
    expect(config.overlapRatio).toBe(0.2);
  });

  it('should validate config with Zod schema', () => {
    const validConfig = {
      maxTokens: 500,
      minTokens: 100,
      overlapRatio: 0.1,
    };

    const result = ChunkingConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('should reject invalid config values', () => {
    expect(
      ChunkingConfigSchema.safeParse({ maxTokens: -1 }).success
    ).toBe(false);
    expect(
      ChunkingConfigSchema.safeParse({ overlapRatio: 1.5 }).success
    ).toBe(false);
    expect(
      ChunkingConfigSchema.safeParse({ oversizeStrategy: 'invalid' }).success
    ).toBe(false);
  });
});

// =============================================================================
// SectionMarkerSchema Tests
// =============================================================================

describe('SectionMarkerSchema', () => {
  it('should validate a valid section marker', () => {
    const marker = {
      type: 'סעיף',
      number: '5',
      title: 'מטרת החוק',
      matchedText: 'סעיף 5 - מטרת החוק',
      startPosition: 100,
      endPosition: 120,
      hierarchyLevel: 5,
    };

    const result = SectionMarkerSchema.safeParse(marker);
    expect(result.success).toBe(true);
  });

  it('should allow null number and title', () => {
    const marker = {
      type: 'הגדרות',
      number: null,
      title: null,
      matchedText: 'הגדרות',
      startPosition: 0,
      endPosition: 6,
      hierarchyLevel: 4,
    };

    const result = SectionMarkerSchema.safeParse(marker);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// TextChunkSchema Tests
// =============================================================================

describe('TextChunkSchema', () => {
  it('should validate a valid text chunk', () => {
    const chunk = {
      chunkId: 'law_123_chunk_0',
      sourceId: 'law_123',
      chunkIndex: 0,
      totalChunks: 5,
      content: 'החוק הזה מגדיר את הכללים',
      charCount: 24,
      tokenCount: 10,
      tokenCountEstimated: true,
      startPosition: 0,
      endPosition: 24,
      hasOverlapBefore: false,
      hasOverlapAfter: true,
      overlapCharsBefore: 0,
      overlapCharsAfter: 20,
      section: {
        type: 'סעיף',
        number: '1',
        title: 'מבוא',
        path: 'פרק א > סעיף 1',
      },
      sectionHierarchy: [
        { type: 'פרק', number: 'א', title: null },
        { type: 'סעיף', number: '1', title: 'מבוא' },
      ],
    };

    const result = TextChunkSchema.safeParse(chunk);
    expect(result.success).toBe(true);
  });

  it('should allow null section', () => {
    const chunk = {
      chunkId: 'law_123_chunk_0',
      sourceId: 'law_123',
      chunkIndex: 0,
      totalChunks: 1,
      content: 'Some content',
      charCount: 12,
      tokenCount: 5,
      tokenCountEstimated: true,
      startPosition: 0,
      endPosition: 12,
      hasOverlapBefore: false,
      hasOverlapAfter: false,
      overlapCharsBefore: 0,
      overlapCharsAfter: 0,
      section: null,
      sectionHierarchy: [],
    };

    const result = TextChunkSchema.safeParse(chunk);
    expect(result.success).toBe(true);
  });

  it('should reject invalid chunk', () => {
    const invalidChunk = {
      chunkId: '', // Empty string not allowed
      sourceId: 'law_123',
      chunkIndex: -1, // Negative not allowed
      content: '', // Empty content not allowed
    };

    const result = TextChunkSchema.safeParse(invalidChunk);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// TokenCountResultSchema Tests
// =============================================================================

describe('TokenCountResultSchema', () => {
  it('should validate token count results', () => {
    expect(
      TokenCountResultSchema.safeParse({
        count: 100,
        estimated: true,
        method: 'estimation',
      }).success
    ).toBe(true);

    expect(
      TokenCountResultSchema.safeParse({
        count: 50,
        estimated: false,
        method: 'tokenizer',
      }).success
    ).toBe(true);

    expect(
      TokenCountResultSchema.safeParse({
        count: 100,
        estimated: true,
        method: 'cached',
      }).success
    ).toBe(true);
  });

  it('should reject invalid method', () => {
    expect(
      TokenCountResultSchema.safeParse({
        count: 100,
        estimated: true,
        method: 'invalid',
      }).success
    ).toBe(false);
  });
});
