/**
 * Chunking Types and Schemas
 *
 * TypeScript type definitions for semantic chunking of Israeli legal documents.
 * Designed specifically for Hebrew legal text with section-aware splitting.
 */

import { z } from 'zod';

// =============================================================================
// Hebrew Legal Section Types
// =============================================================================

/**
 * Hebrew legal document section markers
 *
 * Israeli legal documents follow a standard hierarchical structure:
 * - חלק (Part) - Highest level division
 * - פרק (Chapter) - Major sections within a part
 * - סימן (Sub-chapter) - Sub-sections within a chapter
 * - סעיף (Section/Article) - Individual legal provisions
 * - תוספת (Schedule/Appendix) - Attached schedules or appendices
 */
export const HebrewSectionType = {
  /** חלק - Part (highest level) */
  PART: 'חלק',
  /** פרק - Chapter */
  CHAPTER: 'פרק',
  /** סימן - Sub-chapter/Division */
  SUBCHAPTER: 'סימן',
  /** סעיף - Section/Article (most common legal unit) */
  SECTION: 'סעיף',
  /** תת-סעיף - Sub-section */
  SUBSECTION: 'תת-סעיף',
  /** הגדרות - Definitions section */
  DEFINITIONS: 'הגדרות',
  /** תוספת - Schedule/Appendix */
  SCHEDULE: 'תוספת',
  /** מבוא - Preamble/Introduction */
  PREAMBLE: 'מבוא',
  /** כותרת - Title/Header */
  TITLE: 'כותרת',
  /** פרשנות - Interpretation section */
  INTERPRETATION: 'פרשנות',
  /** תחילה - Commencement section */
  COMMENCEMENT: 'תחילה',
  /** ביטול - Repeal section */
  REPEAL: 'ביטול',
  /** תיקון - Amendment */
  AMENDMENT: 'תיקון',
  /** Unknown section type */
  OTHER: 'אחר',
} as const;

export type HebrewSectionType = (typeof HebrewSectionType)[keyof typeof HebrewSectionType];

/**
 * Zod schema for HebrewSectionType validation
 */
export const HebrewSectionTypeSchema = z.enum([
  'חלק',
  'פרק',
  'סימן',
  'סעיף',
  'תת-סעיף',
  'הגדרות',
  'תוספת',
  'מבוא',
  'כותרת',
  'פרשנות',
  'תחילה',
  'ביטול',
  'תיקון',
  'אחר',
]);

/**
 * Section hierarchy levels (0 = highest/root, higher = more nested)
 */
export const SECTION_HIERARCHY: Record<HebrewSectionType, number> = {
  [HebrewSectionType.TITLE]: 0,
  [HebrewSectionType.PREAMBLE]: 1,
  [HebrewSectionType.PART]: 2,
  [HebrewSectionType.CHAPTER]: 3,
  [HebrewSectionType.SUBCHAPTER]: 4,
  [HebrewSectionType.SECTION]: 5,
  [HebrewSectionType.SUBSECTION]: 6,
  [HebrewSectionType.DEFINITIONS]: 4,
  [HebrewSectionType.SCHEDULE]: 2,
  [HebrewSectionType.INTERPRETATION]: 5,
  [HebrewSectionType.COMMENCEMENT]: 5,
  [HebrewSectionType.REPEAL]: 5,
  [HebrewSectionType.AMENDMENT]: 5,
  [HebrewSectionType.OTHER]: 6,
};

// =============================================================================
// Chunking Configuration
// =============================================================================

/**
 * Configuration options for chunking legal documents
 */
export const ChunkingConfigSchema = z.object({
  /**
   * Target maximum tokens per chunk.
   * For e5-large embeddings, optimal is ~512 tokens (max 512).
   * We target slightly lower to leave room for metadata.
   */
  maxTokens: z.number().int().positive().default(450),

  /**
   * Minimum tokens per chunk.
   * Chunks smaller than this may be merged with adjacent chunks.
   */
  minTokens: z.number().int().nonnegative().default(50),

  /**
   * Overlap percentage between consecutive chunks (0-1).
   * 10-20% overlap helps maintain context across chunk boundaries.
   */
  overlapRatio: z.number().min(0).max(0.5).default(0.15),

  /**
   * Minimum overlap in tokens (absolute minimum regardless of ratio).
   */
  minOverlapTokens: z.number().int().nonnegative().default(20),

  /**
   * Maximum overlap in tokens (absolute maximum regardless of ratio).
   */
  maxOverlapTokens: z.number().int().nonnegative().default(100),

  /**
   * Whether to respect section boundaries.
   * When true, tries to avoid splitting in the middle of sections.
   */
  respectSectionBoundaries: z.boolean().default(true),

  /**
   * Section types that should always start a new chunk.
   * These are natural semantic boundaries.
   */
  hardBreakSections: z
    .array(HebrewSectionTypeSchema)
    .default([HebrewSectionType.PART, HebrewSectionType.CHAPTER, HebrewSectionType.SECTION]),

  /**
   * Section types that should prefer starting a new chunk if close to limit.
   */
  softBreakSections: z
    .array(HebrewSectionTypeSchema)
    .default([HebrewSectionType.SUBCHAPTER, HebrewSectionType.SUBSECTION]),

  /**
   * Whether to include section context (title, number) in chunk metadata.
   */
  includeSectionContext: z.boolean().default(true),

  /**
   * Whether to include parent section hierarchy in chunk metadata.
   */
  includeHierarchy: z.boolean().default(true),

  /**
   * Characters used to approximate token count when tokenizer unavailable.
   * Hebrew averages ~2-3 chars per token with multilingual models.
   */
  charsPerTokenEstimate: z.number().positive().default(2.5),

  /**
   * Strategy for handling sections that exceed maxTokens.
   */
  oversizeStrategy: z.enum(['split', 'allow', 'truncate']).default('split'),

  /**
   * Sentence boundary markers for intelligent splitting.
   */
  sentenceDelimiters: z.array(z.string()).default(['.', ':', ';', '?', '!']),

  /**
   * Whether to preserve paragraph structure in chunks.
   */
  preserveParagraphs: z.boolean().default(true),
});

export type ChunkingConfig = z.infer<typeof ChunkingConfigSchema>;

/**
 * Create a default chunking configuration
 */
export function createDefaultChunkingConfig(
  overrides?: Partial<ChunkingConfig>
): ChunkingConfig {
  return ChunkingConfigSchema.parse(overrides ?? {});
}

// =============================================================================
// Section Detection Types
// =============================================================================

/**
 * Detected section marker in text
 */
export const SectionMarkerSchema = z.object({
  /** Type of section detected */
  type: HebrewSectionTypeSchema,

  /** Section number (e.g., "1", "א", "1.2") */
  number: z.string().nullable(),

  /** Section title/label if present */
  title: z.string().nullable(),

  /** Full matched text of the section marker */
  matchedText: z.string(),

  /** Start position in original text */
  startPosition: z.number().int().nonnegative(),

  /** End position in original text */
  endPosition: z.number().int().nonnegative(),

  /** Hierarchy level (0 = root, higher = nested) */
  hierarchyLevel: z.number().int().nonnegative(),
});

export type SectionMarker = z.infer<typeof SectionMarkerSchema>;

/**
 * Section with content between markers
 */
export const ParsedSectionSchema = z.object({
  /** Section marker information */
  marker: SectionMarkerSchema.nullable(),

  /** Content text for this section */
  content: z.string(),

  /** Character count */
  charCount: z.number().int().nonnegative(),

  /** Estimated token count */
  estimatedTokens: z.number().int().nonnegative(),

  /** Parent section markers (for hierarchy) */
  parentMarkers: z.array(SectionMarkerSchema),

  /** Child sections within this section */
  children: z.array(z.lazy((): z.ZodTypeAny => ParsedSectionSchema)).optional(),
});

export type ParsedSection = z.infer<typeof ParsedSectionSchema>;

// =============================================================================
// Chunk Types
// =============================================================================

/**
 * A single chunk of text ready for embedding
 */
export const TextChunkSchema = z.object({
  /** Unique chunk identifier (deterministic from source) */
  chunkId: z.string().min(1),

  /** Source document/law identifier */
  sourceId: z.string().min(1),

  /** Sequential index of this chunk within the source document */
  chunkIndex: z.number().int().nonnegative(),

  /** Total number of chunks from this source */
  totalChunks: z.number().int().positive(),

  /** The actual text content of the chunk */
  content: z.string().min(1),

  /** Character count of the chunk */
  charCount: z.number().int().positive(),

  /** Token count (exact if tokenizer used, estimated otherwise) */
  tokenCount: z.number().int().positive(),

  /** Whether token count is estimated (true) or exact (false) */
  tokenCountEstimated: z.boolean(),

  /** Start position in original document */
  startPosition: z.number().int().nonnegative(),

  /** End position in original document */
  endPosition: z.number().int().nonnegative(),

  /** Whether this chunk overlaps with the previous chunk */
  hasOverlapBefore: z.boolean(),

  /** Whether this chunk overlaps with the next chunk */
  hasOverlapAfter: z.boolean(),

  /** Number of characters that overlap with previous chunk */
  overlapCharsBefore: z.number().int().nonnegative(),

  /** Number of characters that overlap with next chunk */
  overlapCharsAfter: z.number().int().nonnegative(),

  /** Section information if detected */
  section: z
    .object({
      /** Primary section type containing this chunk */
      type: HebrewSectionTypeSchema.nullable(),
      /** Section number */
      number: z.string().nullable(),
      /** Section title */
      title: z.string().nullable(),
      /** Full section path (e.g., "פרק א > סימן 1 > סעיף 5") */
      path: z.string().nullable(),
    })
    .nullable(),

  /** Hierarchy of parent sections */
  sectionHierarchy: z.array(
    z.object({
      type: HebrewSectionTypeSchema,
      number: z.string().nullable(),
      title: z.string().nullable(),
    })
  ),

  /** Additional metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type TextChunk = z.infer<typeof TextChunkSchema>;

/**
 * Input for creating a text chunk (without generated fields)
 */
export const CreateTextChunkInputSchema = TextChunkSchema.omit({
  chunkId: true,
  chunkIndex: true,
  totalChunks: true,
}).extend({
  chunkIndex: z.number().int().nonnegative().optional(),
  totalChunks: z.number().int().positive().optional(),
});

export type CreateTextChunkInput = z.infer<typeof CreateTextChunkInputSchema>;

// =============================================================================
// Chunking Result Types
// =============================================================================

/**
 * Result of chunking a document
 */
export const ChunkingResultSchema = z.object({
  /** Source document identifier */
  sourceId: z.string().min(1),

  /** All chunks generated from the document */
  chunks: z.array(TextChunkSchema),

  /** Total number of chunks */
  totalChunks: z.number().int().nonnegative(),

  /** Statistics about the chunking process */
  stats: z.object({
    /** Original document character count */
    originalCharCount: z.number().int().nonnegative(),
    /** Total chunked character count (including overlaps) */
    totalChunkedCharCount: z.number().int().nonnegative(),
    /** Overlap characters (counted once) */
    overlapCharCount: z.number().int().nonnegative(),
    /** Average chunk size in characters */
    avgChunkCharCount: z.number().nonnegative(),
    /** Average chunk size in tokens */
    avgChunkTokenCount: z.number().nonnegative(),
    /** Minimum chunk size in tokens */
    minChunkTokenCount: z.number().int().nonnegative(),
    /** Maximum chunk size in tokens */
    maxChunkTokenCount: z.number().int().nonnegative(),
    /** Number of sections detected */
    sectionsDetected: z.number().int().nonnegative(),
    /** Processing duration in milliseconds */
    durationMs: z.number().nonnegative(),
  }),

  /** Configuration used for chunking */
  config: ChunkingConfigSchema,

  /** Any warnings generated during chunking */
  warnings: z.array(z.string()),
});

export type ChunkingResult = z.infer<typeof ChunkingResultSchema>;

// =============================================================================
// Token Counting Types
// =============================================================================

/**
 * Token count result
 */
export const TokenCountResultSchema = z.object({
  /** Number of tokens */
  count: z.number().int().nonnegative(),
  /** Whether the count is estimated (true) or exact (false) */
  estimated: z.boolean(),
  /** Method used for counting */
  method: z.enum(['tokenizer', 'estimation', 'cached']),
});

export type TokenCountResult = z.infer<typeof TokenCountResultSchema>;

/**
 * Token counting options
 */
export const TokenCountOptionsSchema = z.object({
  /** Use cached count if available */
  useCache: z.boolean().default(true),
  /** Force re-count even if cached */
  forceRecount: z.boolean().default(false),
  /** Characters per token for estimation (if tokenizer unavailable) */
  charsPerToken: z.number().positive().default(2.5),
});

export type TokenCountOptions = z.infer<typeof TokenCountOptionsSchema>;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a deterministic chunk ID from source ID and chunk index
 */
export function generateChunkId(sourceId: string, chunkIndex: number): string {
  return `${sourceId}_chunk_${chunkIndex}`;
}

/**
 * Parse a chunk ID to extract source ID and chunk index
 */
export function parseChunkId(chunkId: string): { sourceId: string; chunkIndex: number } | null {
  const match = chunkId.match(/^(.+)_chunk_(\d+)$/);
  if (!match || !match[1] || !match[2]) {
    return null;
  }
  return {
    sourceId: match[1],
    chunkIndex: parseInt(match[2], 10),
  };
}

/**
 * Get the hierarchy level for a section type
 */
export function getSectionHierarchyLevel(sectionType: HebrewSectionType): number {
  return SECTION_HIERARCHY[sectionType] ?? SECTION_HIERARCHY[HebrewSectionType.OTHER];
}

/**
 * Check if one section type is a parent of another
 */
export function isSectionParentOf(
  potentialParent: HebrewSectionType,
  potentialChild: HebrewSectionType
): boolean {
  return getSectionHierarchyLevel(potentialParent) < getSectionHierarchyLevel(potentialChild);
}

/**
 * Create a section path string from hierarchy
 */
export function createSectionPath(
  hierarchy: Array<{ type: HebrewSectionType; number: string | null; title: string | null }>
): string {
  return hierarchy
    .map((section) => {
      const parts = [section.type];
      if (section.number) parts.push(section.number);
      if (section.title) parts.push(`(${section.title})`);
      return parts.join(' ');
    })
    .join(' > ');
}

/**
 * Estimate token count from character count
 *
 * For Hebrew text with multilingual models (like e5-large):
 * - Hebrew characters typically tokenize to 2-3 chars per token
 * - Mixed Hebrew/English text averages around 2.5 chars per token
 * - Pure English averages around 4 chars per token
 */
export function estimateTokenCount(charCount: number, charsPerToken: number = 2.5): number {
  return Math.ceil(charCount / charsPerToken);
}

/**
 * Check if a chunk would exceed the maximum token limit
 */
export function wouldExceedMaxTokens(
  currentTokens: number,
  additionalChars: number,
  maxTokens: number,
  charsPerToken: number = 2.5
): boolean {
  const additionalTokens = estimateTokenCount(additionalChars, charsPerToken);
  return currentTokens + additionalTokens > maxTokens;
}

/**
 * Calculate overlap size in characters based on config
 */
export function calculateOverlapChars(
  chunkTokens: number,
  config: ChunkingConfig
): number {
  const overlapTokens = Math.floor(chunkTokens * config.overlapRatio);
  const clampedTokens = Math.max(
    config.minOverlapTokens,
    Math.min(config.maxOverlapTokens, overlapTokens)
  );
  // Convert tokens back to approximate chars
  return Math.ceil(clampedTokens * config.charsPerTokenEstimate);
}

/**
 * Validate that a chunk meets minimum requirements
 */
export function isValidChunk(
  chunk: { content: string; tokenCount: number },
  config: ChunkingConfig
): boolean {
  return chunk.content.trim().length > 0 && chunk.tokenCount >= config.minTokens;
}
