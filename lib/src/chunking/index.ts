/**
 * Chunking Module
 *
 * Semantic chunking for Israeli legal documents.
 * Provides section-aware text splitting with configurable overlap,
 * optimized for RAG retrieval with embedding models.
 *
 * @example
 * ```typescript
 * import {
 *   chunkLegalDocument,
 *   createDefaultChunkingConfig,
 *   detectSectionMarkers,
 *   TokenCounter,
 * } from '@israeli-law-rag/lib';
 *
 * // Basic usage - chunk a legal document
 * const result = chunkLegalDocument({
 *   sourceId: 'law_12345',
 *   text: extractedPdfText,
 * });
 *
 * // Access chunks
 * for (const chunk of result.chunks) {
 *   console.log(`Chunk ${chunk.chunkIndex}: ${chunk.tokenCount} tokens`);
 *   console.log(`Section: ${chunk.section?.type} ${chunk.section?.number}`);
 * }
 *
 * // Use with custom config
 * const customResult = chunkLegalDocument({
 *   sourceId: 'law_12345',
 *   text: extractedPdfText,
 *   config: {
 *     maxTokens: 256,
 *     overlapRatio: 0.2,
 *   },
 * });
 *
 * // Detect sections without chunking
 * const markers = detectSectionMarkers(text);
 * for (const marker of markers) {
 *   console.log(`${marker.type} ${marker.number}: ${marker.title}`);
 * }
 *
 * // Use token counter directly
 * const counter = new TokenCounter();
 * await counter.initializeTokenizer(); // Optional - enables exact counting
 * const tokens = counter.count(text);
 * console.log(`${tokens.count} tokens (estimated: ${tokens.estimated})`);
 * ```
 */

// Types and Schemas
export {
  // Hebrew Section Types
  HebrewSectionType,
  HebrewSectionTypeSchema,
  SECTION_HIERARCHY,

  // Configuration
  ChunkingConfig,
  ChunkingConfigSchema,
  createDefaultChunkingConfig,

  // Section Detection Types
  SectionMarker,
  SectionMarkerSchema,
  ParsedSection,
  ParsedSectionSchema,

  // Chunk Types
  TextChunk,
  TextChunkSchema,
  CreateTextChunkInput,
  CreateTextChunkInputSchema,

  // Result Types
  ChunkingResult,
  ChunkingResultSchema,

  // Token Counting Types
  TokenCountResult,
  TokenCountResultSchema,
  TokenCountOptions,
  TokenCountOptionsSchema,

  // Utility Functions
  generateChunkId,
  parseChunkId,
  getSectionHierarchyLevel,
  isSectionParentOf,
  createSectionPath,
  estimateTokenCount,
  wouldExceedMaxTokens,
  calculateOverlapChars,
  isValidChunk,
} from './types.js';

// Section Detection
export {
  // Core Detection
  detectSectionMarkers,
  parseIntoSections,
  findBreakPoints,

  // Section Queries
  findContainingSection,
  buildSectionHierarchy,
  isAtSectionBoundary,
  getSectionTypeAtPosition,
  hasSectionMarkers,
  countSectionsByType,

  // Number Parsing
  parseHebrewNumber,
  normalizeSectionNumber,
} from './section-detection.js';

// Token Counting
export {
  // Token Counter Class
  TokenCounter,
  TokenizerInterface,
  TokenCounterConfig,

  // Global Instance
  getGlobalTokenCounter,
  resetGlobalTokenCounter,

  // Quick Functions
  countTokens,
  estimateTokens,
  tokensToChars,
  charsToTokens,

  // Hebrew-Specific
  countHebrewChars,
  getHebrewRatio,
  estimateCharsPerToken,
  adaptiveTokenCount,
} from './token-counter.js';

// Main Chunking Functions
export {
  // Main Function
  chunkLegalDocument,
  ChunkDocumentInput,

  // Convenience Functions
  quickChunk,
  chunkForE5Large,
  chunkFineGrained,
  chunkLargeContext,
  estimateChunkCount,
} from './chunker.js';
