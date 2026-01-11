/**
 * RAG (Retrieval-Augmented Generation) Module
 *
 * End-to-end pipeline for answering Israeli law questions using:
 * - E5 embeddings for semantic search
 * - Qdrant vector database for retrieval
 * - LLM adapters for response generation
 * - Hebrew-optimized prompt templates
 *
 * @example
 * ```typescript
 * import {
 *   RAGService,
 *   createRAGService,
 *   PromptBuilder,
 *   DEFAULT_PROMPT_TEMPLATE,
 * } from '@israeli-law-rag/lib';
 *
 * // Create service with dependencies
 * const ragService = createRAGService({
 *   embedder,
 *   vectorStore,
 *   llmAdapter,
 * });
 *
 * // Initialize (loads embedding model)
 * await ragService.initialize();
 *
 * // Answer a question
 * const response = await ragService.answer({
 *   query: 'מהם זכויות העובד לפי חוק שעות עבודה ומנוחה?',
 *   topK: 5,
 * });
 *
 * console.log(response.answer);
 * console.log(response.citations);
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export {
  // Error types
  RAGError,
  RAGErrorCode,
  isRAGError,

  // Request/Response types
  type RAGQueryInput,
  type RAGResponse,
  type RAGStreamChunk,
  type RAGMetrics,

  // Streaming types (enhanced)
  type RAGStreamProgress,
  RAGStreamPhase,
  RAGStreamProgressSchema,

  // Legacy streaming type (deprecated)
  type LegacyRAGStreamChunk,
  LegacyRAGStreamChunkSchema,

  // Chunk and citation types
  type RetrievedChunk,
  type Citation,

  // Prompt types
  type PromptTemplate,
  type BuiltPrompt,

  // Configuration
  type RAGServiceConfig,
  createDefaultRAGServiceConfig,

  // Response cache types
  type ResponseCacheConfig,
  type ResponseCacheStats,
  type CachedResponse,
  ResponseCacheConfigSchema,
  ResponseCacheStatsSchema,
  CachedResponseSchema,

  // Zod schemas (for validation)
  RAGQueryInputSchema,
  RAGResponseSchema,
  RAGStreamChunkSchema,
  RAGMetricsSchema,
  RetrievedChunkSchema,
  CitationSchema,
  PromptTemplateSchema,
  RAGServiceConfigSchema,

  // Default templates
  DEFAULT_PROMPT_TEMPLATE,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_USER_PROMPT_TEMPLATE,
  DEFAULT_CONTEXT_CHUNK_FORMAT,

  // Utility functions
  generateRequestId,
  generateCacheKey,
  formatResponseCacheStats,
  toSearchFilter,
  payloadToRetrievedChunk,
  createCitationsFromChunks,
  estimateTokenCount,
} from './types.js';

// =============================================================================
// Response Cache
// =============================================================================

export {
  ResponseCache,
  createResponseCache,
  getGlobalResponseCache,
  resetGlobalResponseCache,
} from './response-cache.js';

// =============================================================================
// Latency Tracking
// =============================================================================

export {
  // Class
  LatencyTracker,

  // Types
  RAGPhase,
  type PhaseTiming,
  type LatencySummary,
  type LatencyThresholds,
  type LatencyTrackerConfig,

  // Schemas
  PhaseTimingSchema,
  LatencySummarySchema,
  LatencyThresholdsSchema,
  LatencyTrackerConfigSchema,

  // Constants
  DEFAULT_LATENCY_THRESHOLDS,

  // Factory functions
  createLatencyTracker,
  createLatencyTrackerWithThresholds,

  // Utility functions
  formatLatencySummary,
  calculatePhasePercentages,
  checkLatencyThresholds,
  aggregateLatencySummaries,
} from './latency-tracker.js';

// =============================================================================
// Classes and Services
// =============================================================================

export {
  // Main service
  RAGService,
  type RAGServiceDependencies,

  // Prompt builder
  PromptBuilder,

  // Factory functions
  createRAGService,

  // Singleton management
  getGlobalRAGService,
  resetGlobalRAGService,
} from './rag-service.js';
