/**
 * RAG Service Types
 *
 * TypeScript type definitions for the RAG (Retrieval-Augmented Generation) service.
 * Combines embedding, retrieval, LLM, and prompt building into a unified pipeline.
 */

import { z } from 'zod';
import type { IsraeliLawPayload, SearchFilter } from '../qdrant/types.js';

// =============================================================================
// RAG Error Types
// =============================================================================

/**
 * Error codes for RAG service operations
 */
export const RAGErrorCode = {
  /** Embedding generation failed */
  EMBEDDING_ERROR: 'EMBEDDING_ERROR',
  /** Vector search/retrieval failed */
  RETRIEVAL_ERROR: 'RETRIEVAL_ERROR',
  /** LLM generation failed */
  GENERATION_ERROR: 'GENERATION_ERROR',
  /** Prompt building failed */
  PROMPT_ERROR: 'PROMPT_ERROR',
  /** Configuration is invalid */
  INVALID_CONFIG: 'INVALID_CONFIG',
  /** Service not initialized */
  NOT_INITIALIZED: 'NOT_INITIALIZED',
  /** No relevant chunks found */
  NO_RESULTS: 'NO_RESULTS',
  /** Request timeout */
  TIMEOUT: 'TIMEOUT',
  /** Unknown error */
  UNKNOWN: 'UNKNOWN',
} as const;

export type RAGErrorCode = (typeof RAGErrorCode)[keyof typeof RAGErrorCode];

/**
 * Custom error class for RAG service operations
 */
export class RAGError extends Error {
  readonly code: RAGErrorCode;
  override readonly cause: Error | undefined;
  readonly metadata: Record<string, unknown> | undefined;

  constructor(
    message: string,
    code: RAGErrorCode,
    options?: { cause?: Error; metadata?: Record<string, unknown> }
  ) {
    super(message);
    this.name = 'RAGError';
    this.code = code;
    this.cause = options?.cause;
    this.metadata = options?.metadata ?? undefined;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RAGError);
    }
  }

  /**
   * Create a RAGError from an unknown error
   */
  static fromError(
    error: unknown,
    code?: RAGErrorCode,
    metadata?: Record<string, unknown>
  ): RAGError {
    if (error instanceof RAGError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;
    const options: { cause?: Error; metadata?: Record<string, unknown> } = {};
    if (cause !== undefined) {
      options.cause = cause;
    }
    if (metadata !== undefined) {
      options.metadata = metadata;
    }

    return new RAGError(message, code ?? RAGErrorCode.UNKNOWN, options);
  }
}

/**
 * Type guard to check if an error is a RAGError
 */
export function isRAGError(error: unknown): error is RAGError {
  return error instanceof RAGError;
}

// =============================================================================
// Retrieved Chunk Types
// =============================================================================

/**
 * A retrieved chunk with relevance score
 */
export const RetrievedChunkSchema = z.object({
  /** Unique chunk identifier */
  chunkId: z.string(),
  /** Text content of the chunk */
  content: z.string(),
  /** Cosine similarity score (0-1) */
  score: z.number().min(0).max(1),
  /** Law ID this chunk belongs to */
  lawId: z.number().int().positive(),
  /** Law item ID (Knesset identifier) */
  lawItemId: z.string(),
  /** Chunk index within the document */
  chunkIndex: z.number().int().nonnegative(),
  /** Law name */
  lawName: z.string().optional(),
  /** Section title if available */
  sectionTitle: z.string().nullable().optional(),
  /** Section type (סעיף, פרק, etc.) */
  sectionType: z.string().nullable().optional(),
  /** Section number */
  sectionNumber: z.string().nullable().optional(),
  /** Topic ID if categorized */
  topicId: z.string().optional(),
  /** Publication date as timestamp */
  publicationDate: z.number().int().optional(),
});

export type RetrievedChunk = z.infer<typeof RetrievedChunkSchema>;

// =============================================================================
// Citation Types
// =============================================================================

/**
 * A citation/source reference in the response
 */
export const CitationSchema = z.object({
  /** Citation index (1-based for display) */
  index: z.number().int().positive(),
  /** Law name */
  lawName: z.string(),
  /** Law ID */
  lawId: z.number().int().positive(),
  /** Section reference (if available) */
  section: z.string().optional(),
  /** Relevant excerpt */
  excerpt: z.string().optional(),
  /** Relevance score */
  score: z.number().min(0).max(1).optional(),
});

export type Citation = z.infer<typeof CitationSchema>;

// =============================================================================
// RAG Request/Response Types
// =============================================================================

/**
 * Input for a RAG query
 */
export const RAGQueryInputSchema = z.object({
  /** The user's query in Hebrew */
  query: z.string().min(1),
  /** Optional conversation history for context */
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
  /** Optional filter to narrow search */
  filter: z.object({
    /** Filter by specific law ID */
    lawId: z.number().int().positive().optional(),
    /** Filter by multiple law IDs */
    lawIds: z.array(z.number().int().positive()).optional(),
    /** Filter by topic ID */
    topicId: z.string().optional(),
    /** Filter by multiple topic IDs */
    topicIds: z.array(z.string()).optional(),
    /** Filter by publication date range (min timestamp) */
    publicationDateMin: z.number().int().optional(),
    /** Filter by publication date range (max timestamp) */
    publicationDateMax: z.number().int().optional(),
  }).optional(),
  /** Maximum number of chunks to retrieve */
  topK: z.number().int().positive().default(5),
  /** Minimum similarity score threshold */
  scoreThreshold: z.number().min(0).max(1).optional(),
  /** LLM completion options override */
  completionOptions: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
  }).optional(),
});

export type RAGQueryInput = z.infer<typeof RAGQueryInputSchema>;

/**
 * Metrics from the RAG pipeline execution
 */
export const RAGMetricsSchema = z.object({
  /** Total pipeline latency in milliseconds */
  totalLatencyMs: z.number().nonnegative(),
  /** Embedding generation latency */
  embeddingLatencyMs: z.number().nonnegative(),
  /** Vector search latency */
  retrievalLatencyMs: z.number().nonnegative(),
  /** LLM generation latency */
  generationLatencyMs: z.number().nonnegative(),
  /** Number of chunks retrieved */
  chunksRetrieved: z.number().int().nonnegative(),
  /** Number of chunks used in context */
  chunksUsed: z.number().int().nonnegative(),
  /** Token usage from LLM */
  tokenUsage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  }),
  /** Estimated cost in USD (if available) */
  estimatedCostUsd: z.number().nonnegative().optional(),
  /** Whether the embedding was cached */
  embeddingCached: z.boolean(),
});

export type RAGMetrics = z.infer<typeof RAGMetricsSchema>;

/**
 * Response from the RAG pipeline
 */
export const RAGResponseSchema = z.object({
  /** The generated answer */
  answer: z.string(),
  /** Citations/sources used */
  citations: z.array(CitationSchema),
  /** Retrieved chunks that informed the answer */
  retrievedChunks: z.array(RetrievedChunkSchema),
  /** Pipeline metrics */
  metrics: RAGMetricsSchema,
  /** The model used for generation */
  model: z.string(),
  /** The provider used */
  provider: z.enum(['anthropic', 'openai', 'gemini']),
  /** Request ID for logging/debugging */
  requestId: z.string(),
});

export type RAGResponse = z.infer<typeof RAGResponseSchema>;

/**
 * Stream chunk types for different phases of the RAG pipeline
 */
export const RAGStreamPhase = {
  /** Pipeline is starting */
  STARTING: 'starting',
  /** Embedding the query */
  EMBEDDING: 'embedding',
  /** Retrieving relevant chunks from vector store */
  RETRIEVING: 'retrieving',
  /** Context has been retrieved */
  CONTEXT: 'context',
  /** Generating LLM response content */
  CONTENT: 'content',
  /** Pipeline is complete */
  DONE: 'done',
  /** An error occurred */
  ERROR: 'error',
} as const;

export type RAGStreamPhase = (typeof RAGStreamPhase)[keyof typeof RAGStreamPhase];

/**
 * Progress information for streaming
 */
export const RAGStreamProgressSchema = z.object({
  /** Current phase of the pipeline */
  phase: z.enum(['starting', 'embedding', 'retrieving', 'context', 'content', 'done', 'error']),
  /** Progress message (Hebrew-friendly) */
  message: z.string(),
  /** Time elapsed since stream start in milliseconds */
  elapsedMs: z.number().nonnegative(),
  /** Percentage complete (0-100) if calculable */
  percentComplete: z.number().min(0).max(100).optional(),
});

export type RAGStreamProgress = z.infer<typeof RAGStreamProgressSchema>;

/**
 * Streaming chunk from RAG pipeline (enhanced for real-time feedback)
 *
 * The streaming response provides different types of chunks:
 * 1. Progress updates during embedding and retrieval phases
 * 2. Context information when chunks are retrieved (before content)
 * 3. Content chunks as the LLM generates the response
 * 4. Final metrics and citations on completion
 */
export const RAGStreamChunkSchema = z.object({
  /** Current phase of the pipeline */
  phase: z.enum(['starting', 'embedding', 'retrieving', 'context', 'content', 'done', 'error']),
  /** Partial content chunk (primarily for 'content' phase) */
  content: z.string(),
  /** Whether this is the final chunk */
  done: z.boolean(),
  /** Progress information for real-time feedback */
  progress: RAGStreamProgressSchema.optional(),
  /** Retrieved chunks (sent during 'context' phase before content) */
  retrievedChunks: z.array(RetrievedChunkSchema).optional(),
  /** Final metrics (only on 'done' phase) */
  metrics: RAGMetricsSchema.optional(),
  /** Final citations (only on 'done' phase) */
  citations: z.array(CitationSchema).optional(),
  /** Error information (only on 'error' phase) */
  error: z.object({
    code: z.string(),
    message: z.string(),
  }).optional(),
});

export type RAGStreamChunk = z.infer<typeof RAGStreamChunkSchema>;

/**
 * Legacy streaming chunk type for backward compatibility
 * @deprecated Use RAGStreamChunk instead
 */
export const LegacyRAGStreamChunkSchema = z.object({
  content: z.string(),
  done: z.boolean(),
  metrics: RAGMetricsSchema.optional(),
  citations: z.array(CitationSchema).optional(),
});

export type LegacyRAGStreamChunk = z.infer<typeof LegacyRAGStreamChunkSchema>;

// =============================================================================
// Prompt Builder Types
// =============================================================================

/**
 * Prompt template configuration
 */
export const PromptTemplateSchema = z.object({
  /** System prompt template with {placeholders} */
  systemPrompt: z.string(),
  /** User prompt template with {query} and {context} placeholders */
  userPromptTemplate: z.string(),
  /** Format for each context chunk with {index}, {content}, {lawName}, {section} */
  contextChunkFormat: z.string(),
  /** Separator between context chunks */
  contextSeparator: z.string().default('\n\n'),
  /** Maximum context characters (for token management) */
  maxContextChars: z.number().int().positive().default(12000),
  /** Whether to include citations in context */
  includeCitationInstructions: z.boolean().default(true),
});

export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

/**
 * Built prompt ready for LLM
 */
export interface BuiltPrompt {
  /** System message content */
  systemMessage: string;
  /** User message content */
  userMessage: string;
  /** Number of chunks included in context */
  chunksIncluded: number;
  /** Estimated token count of the prompt */
  estimatedTokens: number;
  /** Whether context was truncated */
  contextTruncated: boolean;
}

// =============================================================================
// RAG Service Configuration
// =============================================================================

/**
 * Configuration for the RAG service
 */
export const RAGServiceConfigSchema = z.object({
  /** Default number of chunks to retrieve */
  defaultTopK: z.number().int().positive().default(5),
  /** Default minimum similarity score threshold */
  defaultScoreThreshold: z.number().min(0).max(1).optional(),
  /** Maximum chunks to include in context */
  maxChunksInContext: z.number().int().positive().default(10),
  /** Maximum tokens for context (approximate) */
  maxContextTokens: z.number().int().positive().default(3000),
  /** Enable response caching */
  enableCache: z.boolean().default(false),
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTtlMs: z.number().int().positive().default(300000),
  /** Log queries to database (if query_logs table exists) */
  enableQueryLogging: z.boolean().default(false),
  /** Timeout for the full pipeline in milliseconds */
  timeoutMs: z.number().int().positive().default(30000),
  /** Enable detailed latency tracking and logging */
  enableLatencyLogging: z.boolean().default(true),
  /** Log latency phase events (start/end of each phase) */
  logPhaseEvents: z.boolean().default(false),
  /** Log latency summary on request completion */
  logLatencySummary: z.boolean().default(true),
});

export type RAGServiceConfig = z.infer<typeof RAGServiceConfigSchema>;

/**
 * Create default RAG service configuration
 */
export function createDefaultRAGServiceConfig(
  overrides?: Partial<RAGServiceConfig>
): RAGServiceConfig {
  return RAGServiceConfigSchema.parse(overrides ?? {});
}


// =============================================================================
// Response Cache Types
// =============================================================================

/**
 * Configuration for the response cache
 */
export const ResponseCacheConfigSchema = z.object({
  /** Maximum number of cached responses */
  maxSize: z.number().int().positive().default(100),
  /** Cache TTL in milliseconds (default: 5 minutes) */
  ttlMs: z.number().int().positive().default(300000),
  /**
   * Whether to include filters in the cache key.
   * If true, different filters produce different cache entries.
   * If false, only the query text is used as the key.
   */
  includeFiltersInKey: z.boolean().default(true),
  /**
   * Whether to include topK in the cache key.
   * If false, queries with different topK may return cached results with fewer chunks.
   */
  includeTopKInKey: z.boolean().default(false),
  /**
   * Callback for cache updates (monitoring/logging)
   */
  onUpdate: z
    .function()
    .args(
      z.object({
        type: z.enum(['hit', 'miss', 'set', 'evict', 'expire', 'clear']),
        key: z.string().optional(),
        query: z.string().optional(),
      })
    )
    .returns(z.void())
    .optional(),
});

export type ResponseCacheConfig = z.infer<typeof ResponseCacheConfigSchema>;

/**
 * Statistics for the response cache
 */
export const ResponseCacheStatsSchema = z.object({
  /** Number of cached entries */
  size: z.number().int(),
  /** Maximum cache size */
  maxSize: z.number().int(),
  /** Number of cache hits */
  hits: z.number().int(),
  /** Number of cache misses */
  misses: z.number().int(),
  /** Cache hit rate (0-1) */
  hitRate: z.number().min(0).max(1),
  /** Number of entries evicted due to size limit */
  evictions: z.number().int(),
  /** Number of entries expired due to TTL */
  expirations: z.number().int(),
  /** Timestamp when cache was created */
  createdAt: z.number().int(),
  /** Timestamp of last cache access */
  lastAccessAt: z.number().int(),
});

export type ResponseCacheStats = z.infer<typeof ResponseCacheStatsSchema>;

/**
 * Cached RAG response entry
 */
export const CachedResponseSchema = z.object({
  /** The cached response */
  response: RAGResponseSchema,
  /** Timestamp when cached */
  cachedAt: z.number().int(),
  /** Number of times this entry was accessed */
  accessCount: z.number().int(),
  /** Original query that produced this response */
  query: z.string(),
  /** Hash of filter parameters (for debugging) */
  filterHash: z.string().optional(),
});

export type CachedResponse = z.infer<typeof CachedResponseSchema>;

/**
 * Generate a cache key from query input
 */
export function generateCacheKey(
  input: RAGQueryInput,
  options: { includeFilters?: boolean; includeTopK?: boolean } = {}
): string {
  const { includeFilters = true, includeTopK = false } = options;

  // Start with normalized query (lowercase, trimmed, collapsed whitespace)
  const normalizedQuery = input.query.trim().toLowerCase().replace(/\s+/g, ' ');

  const parts: string[] = [normalizedQuery];

  // Include filters if configured
  if (includeFilters && input.filter) {
    const filterParts: string[] = [];
    if (input.filter.lawId) filterParts.push(`lid:${input.filter.lawId}`);
    if (input.filter.lawIds?.length) filterParts.push(`lids:${input.filter.lawIds.sort().join(',')}`);
    if (input.filter.topicId) filterParts.push(`tid:${input.filter.topicId}`);
    if (input.filter.topicIds?.length) filterParts.push(`tids:${input.filter.topicIds.sort().join(',')}`);
    if (input.filter.publicationDateMin) filterParts.push(`pmin:${input.filter.publicationDateMin}`);
    if (input.filter.publicationDateMax) filterParts.push(`pmax:${input.filter.publicationDateMax}`);

    if (filterParts.length > 0) {
      parts.push(filterParts.sort().join('|'));
    }
  }

  // Include topK if configured
  if (includeTopK && input.topK) {
    parts.push(`k:${input.topK}`);
  }

  return parts.join('::');
}

/**
 * Format cache stats for display
 */
export function formatResponseCacheStats(stats: ResponseCacheStats): string {
  const hitRatePct = (stats.hitRate * 100).toFixed(1);
  return [
    `Cache Stats:`,
    `  Size: ${stats.size}/${stats.maxSize} entries`,
    `  Hits: ${stats.hits} | Misses: ${stats.misses} | Hit Rate: ${hitRatePct}%`,
    `  Evictions: ${stats.evictions} | Expirations: ${stats.expirations}`,
    `  Created: ${new Date(stats.createdAt).toISOString()}`,
    `  Last Access: ${new Date(stats.lastAccessAt).toISOString()}`,
  ].join('\n');
}

// =============================================================================
// Default Prompt Templates
// =============================================================================

/**
 * Default Hebrew legal assistant system prompt
 */
export const DEFAULT_SYSTEM_PROMPT = `אתה מומחה למשפט ישראלי המסייע בשאלות משפטיות בעברית.

כללים חשובים:
1. ענה רק על סמך המידע המסופק בהקשר. אם אין מספיק מידע, ציין זאת.
2. השתמש בשפה משפטית מדויקת בעברית.
3. ציין תמיד את מקורות המידע (שם החוק והסעיף הרלוונטי).
4. אל תמציא או תנחש מידע שאינו מופיע בהקשר.
5. אם השאלה חורגת מתחום המשפט הישראלי או מהמידע הזמין, הבהר זאת.
6. עדיף להגיד "איני יודע" מאשר לספק מידע שגוי.

פורמט תשובה:
- תחילה, ספק תשובה ממוקדת לשאלה
- לאחר מכן, הרחב אם רלוונטי
- בסוף, ציין את המקורות בפורמט: [מקור: שם החוק, סעיף X]`;

/**
 * Default user prompt template
 */
export const DEFAULT_USER_PROMPT_TEMPLATE = `הקשר משפטי רלוונטי:
{context}

שאלת המשתמש: {query}

אנא ענה על השאלה בהתבסס על ההקשר המשפטי שסופק.`;

/**
 * Default context chunk format
 */
export const DEFAULT_CONTEXT_CHUNK_FORMAT = `[מקור {index}]
חוק: {lawName}
{section}
תוכן:
{content}`;

/**
 * Default prompt template
 */
export const DEFAULT_PROMPT_TEMPLATE: PromptTemplate = {
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  userPromptTemplate: DEFAULT_USER_PROMPT_TEMPLATE,
  contextChunkFormat: DEFAULT_CONTEXT_CHUNK_FORMAT,
  contextSeparator: '\n\n---\n\n',
  maxContextChars: 12000,
  includeCitationInstructions: true,
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `rag-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Convert a search filter to Qdrant SearchFilter format
 */
export function toSearchFilter(filter?: RAGQueryInput['filter']): SearchFilter | undefined {
  if (!filter) return undefined;

  return {
    lawId: filter.lawId,
    lawIds: filter.lawIds,
    topicId: filter.topicId,
    topicIds: filter.topicIds,
    publicationDateMin: filter.publicationDateMin,
    publicationDateMax: filter.publicationDateMax,
  };
}

/**
 * Convert IsraeliLawPayload to RetrievedChunk
 */
export function payloadToRetrievedChunk(
  payload: IsraeliLawPayload,
  score: number
): RetrievedChunk {
  return {
    chunkId: payload.chunkId,
    content: payload.content,
    score,
    lawId: payload.lawId,
    lawItemId: payload.lawItemId,
    chunkIndex: payload.chunkIndex,
    lawName: payload.lawName,
    sectionTitle: payload.sectionTitle,
    sectionType: payload.sectionType,
    sectionNumber: payload.sectionNumber,
    topicId: payload.topicId,
    publicationDate: payload.publicationDate,
  };
}

/**
 * Create citations from retrieved chunks
 */
export function createCitationsFromChunks(chunks: RetrievedChunk[]): Citation[] {
  // Deduplicate by lawId and collect unique citations
  const lawMap = new Map<number, RetrievedChunk>();

  for (const chunk of chunks) {
    const existing = lawMap.get(chunk.lawId);
    if (!existing || chunk.score > existing.score) {
      lawMap.set(chunk.lawId, chunk);
    }
  }

  // Convert to citations with indices
  return Array.from(lawMap.values()).map((chunk, index) => {
    const section = chunk.sectionTitle
      ? `${chunk.sectionType ?? 'סעיף'} ${chunk.sectionNumber ?? ''}: ${chunk.sectionTitle}`.trim()
      : chunk.sectionNumber
        ? `${chunk.sectionType ?? 'סעיף'} ${chunk.sectionNumber}`
        : undefined;

    return {
      index: index + 1,
      lawName: chunk.lawName ?? `חוק ${chunk.lawId}`,
      lawId: chunk.lawId,
      section,
      excerpt: chunk.content.substring(0, 200) + (chunk.content.length > 200 ? '...' : ''),
      score: chunk.score,
    };
  });
}

/**
 * Estimate token count for text (Hebrew-aware)
 * Hebrew text typically tokenizes to ~2-2.5 chars per token
 */
export function estimateTokenCount(text: string): number {
  // Count Hebrew characters
  const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
  const otherChars = text.length - hebrewChars;

  // Hebrew: ~2.5 chars/token, Other: ~4 chars/token
  const hebrewTokens = hebrewChars / 2.5;
  const otherTokens = otherChars / 4;

  return Math.ceil(hebrewTokens + otherTokens);
}
