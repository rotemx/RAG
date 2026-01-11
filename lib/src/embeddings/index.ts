/**
 * Embeddings Module
 *
 * Vector embedding generation for Israeli legal documents using multilingual-e5-large.
 * Provides a high-level interface for generating embeddings optimized for Hebrew text.
 *
 * @example
 * ```typescript
 * import {
 *   E5Embedder,
 *   createE5Embedder,
 *   createPersistentEmbedder,
 *   getGlobalEmbedder,
 *   EmbeddingType,
 *   cosineSimilarity,
 *   formatCacheStats,
 * } from '@israeli-law-rag/lib';
 *
 * // Basic usage - create and initialize embedder
 * const embedder = createE5Embedder();
 * await embedder.initialize();
 *
 * // Embed a search query (uses "query: " prefix)
 * const queryResult = await embedder.embedQuery('מהו חוק חופש המידע?');
 * console.log(`Query embedding: ${queryResult.dimensions} dimensions`);
 *
 * // Embed a document passage (uses "passage: " prefix)
 * const docResult = await embedder.embedDocument('חוק חופש המידע, התשנ"ח-1998');
 * console.log(`Document embedding: ${docResult.dimensions} dimensions`);
 *
 * // Batch embed multiple documents
 * const chunks = ['סעיף 1...', 'סעיף 2...', 'סעיף 3...'];
 * const batchResult = await embedder.embedBatch(chunks);
 * console.log(`Embedded ${batchResult.count} documents`);
 * console.log(`Cache hits: ${batchResult.cacheHits}`);
 *
 * // Calculate similarity between query and document
 * const similarity = cosineSimilarity(
 *   queryResult.embedding,
 *   docResult.embedding
 * );
 * console.log(`Similarity: ${similarity.toFixed(4)}`);
 *
 * // Get detailed cache statistics
 * const stats = embedder.getDetailedCacheStats();
 * console.log(formatCacheStats(stats));
 *
 * // Using persistent embedder (cache survives restarts)
 * const persistentEmbedder = createPersistentEmbedder('.cache/embeddings.json');
 * await persistentEmbedder.initialize();
 *
 * // Using global embedder (shared instance)
 * const globalEmbedder = getGlobalEmbedder();
 * await globalEmbedder.initialize();
 * const result = await globalEmbedder.embedQuery('חיפוש');
 *
 * // Clean up when done
 * embedder.dispose();
 * ```
 */

// Types and Schemas
export {
  // Embedding Model Types
  EmbeddingModel,
  EmbeddingModelSchema,
  MODEL_DIMENSIONS,
  DEFAULT_EMBEDDING_MODEL,

  // Configuration
  type E5EmbedderConfig,
  E5EmbedderConfigSchema,
  createDefaultE5Config,

  // Embedding Types
  EmbeddingType,
  EmbeddingTypeSchema,
  E5_PREFIXES,

  // Result Types
  type EmbeddingResult,
  EmbeddingResultSchema,
  type BatchEmbeddingResult,
  BatchEmbeddingResultSchema,

  // Input Types
  type EmbedTextInput,
  EmbedTextInputSchema,
  type EmbedBatchInput,
  EmbedBatchInputSchema,

  // Error Types
  EmbeddingErrorCode,
  EmbeddingErrorCodeSchema,
  EmbeddingError,
  isEmbeddingError,

  // Utility Functions
  getModelDimensions,
  applyE5Prefix,
  removeE5Prefix,
  hasE5Prefix,
  validateDimensions,
  normalizeVector,
  cosineSimilarity,
  dotProduct,
} from './types.js';

// E5Embedder Class and Factory Functions
export {
  // Main Class
  E5Embedder,

  // Extended Configuration Type
  type E5EmbedderWithCacheConfig,

  // Factory Functions
  createE5Embedder,
  createQueryEmbedder,
  createDocumentEmbedder,
  createPersistentEmbedder,

  // Global Instance
  getGlobalEmbedder,
  resetGlobalEmbedder,
} from './e5-embedder.js';

// Cache Module
export {
  // Cache Class
  EmbeddingCache,
  LRUCache,

  // Cache Configuration
  type EmbeddingCacheConfig,
  EmbeddingCacheConfigSchema,

  // Cache Statistics
  type CacheStats,

  // Cache Factory Functions
  createEmbeddingCache,
  createQueryCache,
  createDocumentCache,
  createPersistentCache,

  // Global Cache Instance
  getGlobalCache,
  resetGlobalCache,

  // Cache Utilities
  generateCacheKey,
  parseCacheKey,
  formatCacheStats,
} from './cache.js';

// Dimension Validation Module
export {
  // Schemas
  EmbeddingVectorSchema,
  DimensionValidationOptionsSchema,
  type DimensionValidationOptions,
  type DimensionValidationOptionsInput,
  DimensionValidationResultSchema,
  type DimensionValidationResult,
  BatchDimensionValidationResultSchema,
  type BatchDimensionValidationResult,
  EmbeddingPairValidationResultSchema,
  type EmbeddingPairValidationResult,

  // Validation Functions
  validateEmbeddingDimensions,
  assertEmbeddingDimensions,
  validateBatchDimensions,
  validateEmbeddingPair,
  assertEmbeddingPairDimensions,

  // Utility Functions
  areDimensionsConsistent,
  getEmbeddingDimensions,
  hasExpectedDimensions,
  formatDimensionValidation,
  formatBatchDimensionValidation,
  createModelDimensionValidator,

  // Qdrant-specific validation
  QDRANT_COLLECTION_DIMENSIONS,
  validateForQdrantCollection,
  validateBatchForQdrant,
} from './dimension-validation.js';
