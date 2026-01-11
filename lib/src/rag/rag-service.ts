/**
 * RAG Service
 *
 * End-to-end Retrieval-Augmented Generation pipeline for Israeli law queries.
 * Combines embedding service, vector retrieval, LLM generation, and prompt building.
 *
 * @example
 * ```typescript
 * import { RAGService, createAnthropicAdapter, createE5Embedder, createVectorStoreService } from '@israeli-law-rag/lib';
 *
 * // Create dependencies
 * const embedder = createE5Embedder();
 * const vectorStore = createVectorStoreService();
 * const llmAdapter = createAnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY });
 *
 * // Create RAG service
 * const ragService = new RAGService({
 *   embedder,
 *   vectorStore,
 *   llmAdapter,
 * });
 *
 * // Initialize and use
 * await ragService.initialize();
 *
 * const response = await ragService.answer({
 *   query: 'מהו חוק חופש המידע?',
 * });
 *
 * console.log(response.answer);
 * console.log(response.citations);
 * ```
 */

import type { E5Embedder } from '../embeddings/e5-embedder.js';
import type { VectorStoreService } from '../qdrant/vector-store-service.js';
import type { LLMAdapter } from '../llm/adapter.js';
import type { LLMMessage, LLMCompletionOptions } from '../llm/types.js';
import { LLMError } from '../llm/errors.js';
import { EmbeddingError } from '../embeddings/types.js';
import { VectorStoreError, type SearchFilter } from '../qdrant/types.js';
import { Logger, getGlobalLogger } from '../logging/index.js';
import {
  LatencyTracker,
  RAGPhase,
  type LatencyThresholds,
  DEFAULT_LATENCY_THRESHOLDS,
} from './latency-tracker.js';

import {
  type RAGServiceConfig,
  type RAGQueryInput,
  type RAGResponse,
  type RAGStreamChunk,
  type RAGStreamProgress,
  type RAGMetrics,
  type RetrievedChunk,
  type PromptTemplate,
  type BuiltPrompt,
  type ResponseCacheStats,
  RAGServiceConfigSchema,
  RAGQueryInputSchema,
  RAGError,
  RAGErrorCode,
  RAGStreamPhase,
  DEFAULT_PROMPT_TEMPLATE,
  generateRequestId,
  toSearchFilter,
  payloadToRetrievedChunk,
  createCitationsFromChunks,
  estimateTokenCount,
} from './types.js';

import { ResponseCache } from './response-cache.js';

// =============================================================================
// RAG Service Dependencies
// =============================================================================

/**
 * Dependencies required to create a RAGService
 */
export interface RAGServiceDependencies {
  /** Embedder for generating query vectors */
  embedder: E5Embedder;
  /** Vector store service for similarity search */
  vectorStore: VectorStoreService;
  /** LLM adapter for response generation */
  llmAdapter: LLMAdapter;
  /** Custom prompt template (optional) */
  promptTemplate?: Partial<PromptTemplate>;
  /** Logger instance (optional, uses global logger if not provided) */
  logger?: Logger;
  /** Custom latency thresholds for warnings (optional) */
  latencyThresholds?: Partial<LatencyThresholds>;
}

// =============================================================================
// PromptBuilder Class
// =============================================================================

/**
 * Builds prompts from retrieved chunks and user queries
 */
export class PromptBuilder {
  private readonly template: PromptTemplate;

  constructor(template?: Partial<PromptTemplate>) {
    this.template = {
      ...DEFAULT_PROMPT_TEMPLATE,
      ...template,
    };
  }

  /**
   * Build a prompt from query and retrieved chunks
   */
  build(
    query: string,
    chunks: RetrievedChunk[],
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    maxContextTokens?: number
  ): BuiltPrompt {
    const maxTokens = maxContextTokens ?? estimateTokenCount(this.template.maxContextChars.toString()) * 2.5;

    // Build context from chunks, respecting token limit
    let currentTokens = 0;
    const includedChunks: string[] = [];
    let contextTruncated = false;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const formattedChunk = this.formatChunk(chunk, i + 1);
      const chunkTokens = estimateTokenCount(formattedChunk);

      if (currentTokens + chunkTokens > maxTokens && includedChunks.length > 0) {
        contextTruncated = true;
        break;
      }

      includedChunks.push(formattedChunk);
      currentTokens += chunkTokens;
    }

    const context = includedChunks.join(this.template.contextSeparator);

    // Build user message with context
    let userMessage = this.template.userPromptTemplate
      .replace('{context}', context)
      .replace('{query}', query);

    // Include conversation history if provided
    if (conversationHistory && conversationHistory.length > 0) {
      const historyText = conversationHistory
        .map((msg) => `${msg.role === 'user' ? 'שאלה' : 'תשובה'}: ${msg.content}`)
        .join('\n\n');

      userMessage = `היסטוריית שיחה קודמת:\n${historyText}\n\n${userMessage}`;
    }

    // Calculate total estimated tokens
    const systemTokens = estimateTokenCount(this.template.systemPrompt);
    const userTokens = estimateTokenCount(userMessage);

    return {
      systemMessage: this.template.systemPrompt,
      userMessage,
      chunksIncluded: includedChunks.length,
      estimatedTokens: systemTokens + userTokens,
      contextTruncated,
    };
  }

  /**
   * Format a single chunk for inclusion in context
   */
  private formatChunk(chunk: RetrievedChunk, index: number): string {
    let section = '';
    if (chunk.sectionTitle) {
      section = `${chunk.sectionType ?? 'סעיף'} ${chunk.sectionNumber ?? ''}: ${chunk.sectionTitle}`;
    } else if (chunk.sectionNumber) {
      section = `${chunk.sectionType ?? 'סעיף'} ${chunk.sectionNumber}`;
    }

    return this.template.contextChunkFormat
      .replace('{index}', index.toString())
      .replace('{lawName}', chunk.lawName ?? `חוק ${chunk.lawId}`)
      .replace('{section}', section ? `סעיף: ${section}` : '')
      .replace('{content}', chunk.content.trim());
  }

  /**
   * Get the current template
   */
  getTemplate(): Readonly<PromptTemplate> {
    return { ...this.template };
  }
}

// =============================================================================
// RAGService Class
// =============================================================================

/**
 * RAG Service - End-to-end retrieval-augmented generation pipeline
 *
 * Features:
 * - Query embedding with E5 model
 * - Semantic vector search in Qdrant
 * - Context-aware prompt building
 * - LLM response generation (streaming supported)
 * - Citation extraction
 * - Comprehensive metrics tracking
 */
export class RAGService {
  private readonly embedder: E5Embedder;
  private readonly vectorStore: VectorStoreService;
  private readonly llmAdapter: LLMAdapter;
  private readonly promptBuilder: PromptBuilder;
  private readonly config: RAGServiceConfig;
  private readonly responseCache: ResponseCache | null;
  private readonly logger: Logger;
  private readonly latencyThresholds: LatencyThresholds;

  private initialized = false;

  /**
   * Create a new RAGService instance
   *
   * @param dependencies - Required service dependencies
   * @param config - Optional service configuration
   */
  constructor(
    dependencies: RAGServiceDependencies,
    config?: Partial<RAGServiceConfig>
  ) {
    this.embedder = dependencies.embedder;
    this.vectorStore = dependencies.vectorStore;
    this.llmAdapter = dependencies.llmAdapter;
    this.promptBuilder = new PromptBuilder(dependencies.promptTemplate);
    this.config = RAGServiceConfigSchema.parse(config ?? {});
    this.logger = dependencies.logger ?? getGlobalLogger().child('RAGService');
    this.latencyThresholds = {
      ...DEFAULT_LATENCY_THRESHOLDS,
      ...dependencies.latencyThresholds,
    };

    // Initialize response cache if enabled
    if (this.config.enableCache) {
      this.responseCache = new ResponseCache({
        maxSize: 100, // Default max size
        ttlMs: this.config.cacheTtlMs,
      });
    } else {
      this.responseCache = null;
    }

    this.logger.debug('RAGService initialized', {
      enableCache: this.config.enableCache,
      enableLatencyLogging: this.config.enableLatencyLogging,
      defaultTopK: this.config.defaultTopK,
      maxContextTokens: this.config.maxContextTokens,
    });
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize the RAG service
   *
   * This initializes the embedding model and verifies vector store connectivity.
   * Must be called before using `answer()` or `stream()`.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize the embedder (loads the model)
      await this.embedder.initialize();

      // Verify vector store collection exists
      const exists = await this.vectorStore.collectionExists();
      if (!exists) {
        throw new RAGError(
          `Vector store collection '${this.vectorStore.getCollectionName()}' does not exist`,
          RAGErrorCode.INVALID_CONFIG
        );
      }

      this.initialized = true;
    } catch (error) {
      if (error instanceof RAGError) {
        throw error;
      }
      throw RAGError.fromError(error, RAGErrorCode.NOT_INITIALIZED, {
        stage: 'initialization',
      });
    }
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Ensure the service is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new RAGError(
        'RAGService not initialized. Call initialize() first.',
        RAGErrorCode.NOT_INITIALIZED
      );
    }
  }

  // ===========================================================================
  // Main Answer Methods
  // ===========================================================================

  /**
   * Answer a query using the RAG pipeline
   *
   * This is the main entry point for RAG queries. It:
   * 1. Embeds the query using E5 model
   * 2. Retrieves relevant chunks from the vector store
   * 3. Builds a prompt with the retrieved context
   * 4. Generates a response using the LLM
   * 5. Extracts citations from the response
   *
   * @param input - Query input with optional filters and settings
   * @returns Complete RAG response with answer, citations, and metrics
   */
  async answer(input: RAGQueryInput): Promise<RAGResponse> {
    this.ensureInitialized();

    const requestId = generateRequestId();
    const parsedInput = RAGQueryInputSchema.parse(input);

    // Create latency tracker if logging is enabled
    const tracker = this.config.enableLatencyLogging
      ? new LatencyTracker(requestId, {
          logger: this.logger,
          logPhaseEvents: this.config.logPhaseEvents,
          logSummaryOnComplete: this.config.logLatencySummary,
          thresholds: this.latencyThresholds,
          defaultMetadata: {
            query: parsedInput.query.substring(0, 50) + (parsedInput.query.length > 50 ? '...' : ''),
            topK: parsedInput.topK ?? this.config.defaultTopK,
          },
        })
      : null;

    // Log the start of the request
    this.logger.info('RAG query started', {
      requestId,
      queryLength: parsedInput.query.length,
      hasConversationHistory: !!parsedInput.conversationHistory?.length,
      hasFilters: !!parsedInput.filter,
    });

    // Check cache first (if enabled and no conversation history)
    // We skip cache for conversational queries as context matters
    if (this.responseCache && !parsedInput.conversationHistory?.length) {
      tracker?.startPhase(RAGPhase.CACHE_LOOKUP);
      const cachedResponse = this.responseCache.get(parsedInput);
      tracker?.endPhase(RAGPhase.CACHE_LOOKUP);

      if (cachedResponse) {
        const summary = tracker?.complete();
        this.logger.info('RAG query served from cache', {
          requestId,
          cacheHit: true,
          latencyMs: summary?.totalMs ?? 0,
        });
        // Return cached response with updated request ID and cache indicator
        return {
          ...cachedResponse,
          requestId,
          metrics: {
            ...cachedResponse.metrics,
            // Override latency to show cache lookup time
            totalLatencyMs: summary?.totalMs ?? 0,
            embeddingLatencyMs: 0,
            retrievalLatencyMs: 0,
            generationLatencyMs: 0,
            embeddingCached: true,
          },
        };
      }
    }

    let embeddingCached = false;

    try {
      // Step 1: Embed the query
      tracker?.startPhase(RAGPhase.EMBEDDING);
      const queryEmbedding = await this.embedQuery(parsedInput.query);
      const embeddingLatencyMs = tracker?.endPhase(RAGPhase.EMBEDDING) ?? 0;
      embeddingCached = queryEmbedding.cached;
      if (embeddingCached) {
        tracker?.markCached(RAGPhase.EMBEDDING);
      }

      // Step 2: Retrieve relevant chunks
      tracker?.startPhase(RAGPhase.RETRIEVAL);
      const chunks = await this.retrieveChunks(
        queryEmbedding.embedding,
        parsedInput.topK,
        parsedInput.scoreThreshold,
        toSearchFilter(parsedInput.filter)
      );
      const retrievalLatencyMs = tracker?.endPhase(RAGPhase.RETRIEVAL, {
        chunksRetrieved: chunks.length,
      }) ?? 0;

      // Check if we found any results
      if (chunks.length === 0) {
        this.logger.warn('No relevant documents found', {
          requestId,
          query: parsedInput.query,
        });
        throw new RAGError(
          'No relevant legal documents found for the query',
          RAGErrorCode.NO_RESULTS,
          { metadata: { query: parsedInput.query } }
        );
      }

      // Step 3: Build the prompt
      tracker?.startPhase(RAGPhase.PROMPT_BUILDING);
      const builtPrompt = this.promptBuilder.build(
        parsedInput.query,
        chunks,
        parsedInput.conversationHistory,
        this.config.maxContextTokens
      );
      tracker?.endPhase(RAGPhase.PROMPT_BUILDING, {
        chunksUsed: builtPrompt.chunksIncluded,
        contextTruncated: builtPrompt.contextTruncated,
      });

      // Step 4: Generate response
      tracker?.startPhase(RAGPhase.GENERATION);
      const llmResponse = await this.generateResponse(
        builtPrompt,
        parsedInput.completionOptions
      );
      const generationLatencyMs = tracker?.endPhase(RAGPhase.GENERATION, {
        inputTokens: llmResponse.usage.inputTokens,
        outputTokens: llmResponse.usage.outputTokens,
      }) ?? 0;

      // Step 5: Create citations
      const citations = createCitationsFromChunks(chunks);

      // Complete latency tracking and get summary
      const summary = tracker?.complete();

      // Build metrics
      const totalLatencyMs = summary?.totalMs ?? 0;
      const metrics: RAGMetrics = {
        totalLatencyMs,
        embeddingLatencyMs: summary?.phases[RAGPhase.EMBEDDING] ?? embeddingLatencyMs,
        retrievalLatencyMs: summary?.phases[RAGPhase.RETRIEVAL] ?? retrievalLatencyMs,
        generationLatencyMs: summary?.phases[RAGPhase.GENERATION] ?? generationLatencyMs,
        chunksRetrieved: chunks.length,
        chunksUsed: builtPrompt.chunksIncluded,
        tokenUsage: {
          inputTokens: llmResponse.usage.inputTokens,
          outputTokens: llmResponse.usage.outputTokens,
          totalTokens: llmResponse.usage.inputTokens + llmResponse.usage.outputTokens,
        },
        estimatedCostUsd: this.llmAdapter.calculateCost(llmResponse.usage),
        embeddingCached,
      };

      const response: RAGResponse = {
        answer: llmResponse.content,
        citations,
        retrievedChunks: chunks,
        metrics,
        model: llmResponse.model,
        provider: this.llmAdapter.provider,
        requestId,
      };

      // Cache the response (if enabled and no conversation history)
      if (this.responseCache && !parsedInput.conversationHistory?.length) {
        this.responseCache.set(parsedInput, response);
      }

      return response;
    } catch (error) {
      // Log the error with latency info
      const summary = tracker?.complete();
      this.logger.error('RAG query failed', error instanceof Error ? error : new Error(String(error)), {
        requestId,
        latencyMs: summary?.totalMs,
        phases: summary?.phases,
      });
      throw this.wrapError(error, requestId);
    }
  }

  /**
   * Answer a query with streaming response and real-time progress updates
   *
   * Enhanced streaming that provides feedback during all pipeline phases:
   * 1. 'starting' - Pipeline initialization
   * 2. 'embedding' - Query embedding generation
   * 3. 'retrieving' - Vector store search
   * 4. 'context' - Retrieved chunks available (sent before content)
   * 5. 'content' - LLM response generation
   * 6. 'done' - Final chunk with metrics and citations
   * 7. 'error' - Error occurred (thrown as exception)
   *
   * @param input - Query input with optional filters and settings
   * @returns AsyncGenerator yielding stream chunks with progress info
   *
   * @example
   * ```typescript
   * for await (const chunk of ragService.stream(input)) {
   *   switch (chunk.phase) {
   *     case 'starting':
   *       showSpinner('מתחיל...');
   *       break;
   *     case 'context':
   *       displaySources(chunk.retrievedChunks);
   *       break;
   *     case 'content':
   *       appendToAnswer(chunk.content);
   *       break;
   *     case 'done':
   *       hideSpinner();
   *       showMetrics(chunk.metrics);
   *       break;
   *   }
   * }
   * ```
   */
  async *stream(input: RAGQueryInput): AsyncGenerator<RAGStreamChunk, void, unknown> {
    this.ensureInitialized();

    const requestId = generateRequestId();
    const startTime = performance.now();
    const parsedInput = RAGQueryInputSchema.parse(input);

    // Create latency tracker if logging is enabled
    const tracker = this.config.enableLatencyLogging
      ? new LatencyTracker(requestId, {
          logger: this.logger,
          logPhaseEvents: this.config.logPhaseEvents,
          logSummaryOnComplete: false, // We'll log manually at the end
          thresholds: this.latencyThresholds,
          defaultMetadata: {
            streaming: true,
            query: parsedInput.query.substring(0, 50) + (parsedInput.query.length > 50 ? '...' : ''),
          },
        })
      : null;

    // Log the start of the streaming request
    this.logger.info('RAG streaming query started', {
      requestId,
      queryLength: parsedInput.query.length,
      hasConversationHistory: !!parsedInput.conversationHistory?.length,
    });

    let embeddingCached = false;
    let chunks: RetrievedChunk[] = [];

    // Helper to create progress info
    const createProgress = (
      phase: RAGStreamProgress['phase'],
      message: string,
      percentComplete?: number
    ): RAGStreamProgress => ({
      phase,
      message,
      elapsedMs: performance.now() - startTime,
      percentComplete,
    });

    try {
      // Phase 1: Starting
      yield {
        phase: RAGStreamPhase.STARTING,
        content: '',
        done: false,
        progress: createProgress('starting', 'מתחיל עיבוד השאילתה...', 0),
      };

      // Phase 2: Embedding
      yield {
        phase: RAGStreamPhase.EMBEDDING,
        content: '',
        done: false,
        progress: createProgress('embedding', 'מייצר וקטור חיפוש...', 10),
      };

      tracker?.startPhase(RAGPhase.EMBEDDING);
      const queryEmbedding = await this.embedQuery(parsedInput.query);
      tracker?.endPhase(RAGPhase.EMBEDDING);
      embeddingCached = queryEmbedding.cached;
      if (embeddingCached) {
        tracker?.markCached(RAGPhase.EMBEDDING);
      }

      // Phase 3: Retrieving
      yield {
        phase: RAGStreamPhase.RETRIEVING,
        content: '',
        done: false,
        progress: createProgress(
          'retrieving',
          embeddingCached
            ? 'וקטור נמצא במטמון, מחפש מסמכים רלוונטיים...'
            : 'מחפש מסמכים רלוונטיים...',
          30
        ),
      };

      tracker?.startPhase(RAGPhase.RETRIEVAL);
      chunks = await this.retrieveChunks(
        queryEmbedding.embedding,
        parsedInput.topK,
        parsedInput.scoreThreshold,
        toSearchFilter(parsedInput.filter)
      );
      tracker?.endPhase(RAGPhase.RETRIEVAL, { chunksRetrieved: chunks.length });

      // Check if we found any results
      if (chunks.length === 0) {
        this.logger.warn('No relevant documents found (streaming)', {
          requestId,
          query: parsedInput.query,
        });
        throw new RAGError(
          'No relevant legal documents found for the query',
          RAGErrorCode.NO_RESULTS,
          { metadata: { query: parsedInput.query } }
        );
      }

      // Phase 4: Context - send retrieved chunks before content generation
      yield {
        phase: RAGStreamPhase.CONTEXT,
        content: '',
        done: false,
        progress: createProgress(
          'context',
          `נמצאו ${chunks.length} מקורות רלוונטיים, מתחיל יצירת תשובה...`,
          50
        ),
        retrievedChunks: chunks,
      };

      // Build the prompt
      tracker?.startPhase(RAGPhase.PROMPT_BUILDING);
      const builtPrompt = this.promptBuilder.build(
        parsedInput.query,
        chunks,
        parsedInput.conversationHistory,
        this.config.maxContextTokens
      );
      tracker?.endPhase(RAGPhase.PROMPT_BUILDING, {
        chunksUsed: builtPrompt.chunksIncluded,
      });

      // Phase 5: Content - stream the LLM response
      const messages = this.buildMessages(builtPrompt);
      const mergedOptions = this.mergeCompletionOptions(parsedInput.completionOptions);

      tracker?.startPhase(RAGPhase.GENERATION);
      let totalContent = '';
      let finalUsage = { inputTokens: 0, outputTokens: 0 };

      for await (const chunk of this.llmAdapter.stream(messages, mergedOptions)) {
        totalContent += chunk.content;

        if (chunk.done) {
          tracker?.endPhase(RAGPhase.GENERATION, {
            inputTokens: chunk.usage?.inputTokens,
            outputTokens: chunk.usage?.outputTokens,
          });

          if (chunk.usage) {
            finalUsage = {
              inputTokens: chunk.usage.inputTokens ?? 0,
              outputTokens: chunk.usage.outputTokens ?? 0,
            };
          }

          // Complete latency tracking and get summary
          const summary = tracker?.complete();

          // Phase 6: Done - create citations and final metrics
          const citations = createCitationsFromChunks(chunks);
          const totalLatencyMs = summary?.totalMs ?? (performance.now() - startTime);
          const metrics: RAGMetrics = {
            totalLatencyMs,
            embeddingLatencyMs: summary?.phases[RAGPhase.EMBEDDING] ?? 0,
            retrievalLatencyMs: summary?.phases[RAGPhase.RETRIEVAL] ?? 0,
            generationLatencyMs: summary?.phases[RAGPhase.GENERATION] ?? 0,
            chunksRetrieved: chunks.length,
            chunksUsed: builtPrompt.chunksIncluded,
            tokenUsage: {
              inputTokens: finalUsage.inputTokens,
              outputTokens: finalUsage.outputTokens,
              totalTokens: finalUsage.inputTokens + finalUsage.outputTokens,
            },
            estimatedCostUsd: this.llmAdapter.calculateCost(finalUsage),
            embeddingCached,
          };

          // Log completion with latency summary
          if (this.config.logLatencySummary) {
            this.logger.info('RAG streaming query completed', {
              requestId,
              totalMs: metrics.totalLatencyMs,
              embeddingMs: metrics.embeddingLatencyMs,
              retrievalMs: metrics.retrievalLatencyMs,
              generationMs: metrics.generationLatencyMs,
              chunksUsed: metrics.chunksUsed,
              totalTokens: metrics.tokenUsage.totalTokens,
              estimatedCostUsd: metrics.estimatedCostUsd,
              embeddingCached,
            });
          }

          yield {
            phase: RAGStreamPhase.DONE,
            content: chunk.content,
            done: true,
            progress: createProgress('done', 'הושלם', 100),
            metrics,
            citations,
          };
        } else {
          yield {
            phase: RAGStreamPhase.CONTENT,
            content: chunk.content,
            done: false,
          };
        }
      }
    } catch (error) {
      // Log the error with latency info
      const summary = tracker?.complete();
      this.logger.error('RAG streaming query failed', error instanceof Error ? error : new Error(String(error)), {
        requestId,
        latencyMs: summary?.totalMs,
        phases: summary?.phases,
      });

      // Yield error phase before throwing
      const ragError = this.wrapError(error, requestId);
      yield {
        phase: RAGStreamPhase.ERROR,
        content: '',
        done: true,
        error: {
          code: ragError.code,
          message: ragError.message,
        },
        progress: createProgress('error', ragError.message),
      };
      throw ragError;
    }
  }

  /**
   * Simplified streaming that only yields content chunks (legacy behavior)
   *
   * Use this if you only need the generated text without progress updates.
   * The first chunk contains retrievedChunks, and the final chunk contains metrics/citations.
   *
   * @param input - Query input with optional filters and settings
   * @returns AsyncGenerator yielding minimal stream chunks
   */
  async *streamSimple(input: RAGQueryInput): AsyncGenerator<RAGStreamChunk, void, unknown> {
    let isFirstContent = true;
    let retrievedChunks: RetrievedChunk[] | undefined;

    for await (const chunk of this.stream(input)) {
      // Skip progress phases, only pass through context and content
      if (chunk.phase === RAGStreamPhase.CONTEXT) {
        retrievedChunks = chunk.retrievedChunks;
        continue;
      }

      if (chunk.phase === RAGStreamPhase.STARTING ||
          chunk.phase === RAGStreamPhase.EMBEDDING ||
          chunk.phase === RAGStreamPhase.RETRIEVING) {
        continue;
      }

      // On first content chunk, include the retrieved chunks
      if (chunk.phase === RAGStreamPhase.CONTENT && isFirstContent && retrievedChunks) {
        isFirstContent = false;
        yield {
          ...chunk,
          retrievedChunks,
        };
        continue;
      }

      yield chunk;
    }
  }

  // ===========================================================================
  // Individual Pipeline Steps (for advanced use)
  // ===========================================================================

  /**
   * Embed a query text
   *
   * Useful for pre-computing embeddings or debugging.
   */
  async embedQuery(
    query: string
  ): Promise<{ embedding: number[]; cached: boolean; durationMs: number }> {
    try {
      const result = await this.embedder.embedQuery(query);
      return {
        embedding: result.embedding,
        cached: result.cached,
        durationMs: result.durationMs,
      };
    } catch (error) {
      if (error instanceof EmbeddingError) {
        throw new RAGError(
          `Embedding failed: ${error.message}`,
          RAGErrorCode.EMBEDDING_ERROR,
          { cause: error }
        );
      }
      throw RAGError.fromError(error, RAGErrorCode.EMBEDDING_ERROR);
    }
  }

  /**
   * Retrieve chunks from vector store
   *
   * Useful for debugging retrieval or pre-fetching context.
   */
  async retrieveChunks(
    queryVector: number[],
    topK?: number,
    scoreThreshold?: number,
    filter?: SearchFilter
  ): Promise<RetrievedChunk[]> {
    try {
      const response = await this.vectorStore.search(queryVector, {
        limit: topK ?? this.config.defaultTopK,
        scoreThreshold: scoreThreshold ?? this.config.defaultScoreThreshold,
        filter,
        withPayload: true,
        withVector: false,
      });

      return response.results
        .filter((result) => result.payload !== undefined)
        .map((result) => payloadToRetrievedChunk(result.payload!, result.score));
    } catch (error) {
      if (error instanceof VectorStoreError) {
        throw new RAGError(
          `Retrieval failed: ${error.message}`,
          RAGErrorCode.RETRIEVAL_ERROR,
          { cause: error }
        );
      }
      throw RAGError.fromError(error, RAGErrorCode.RETRIEVAL_ERROR);
    }
  }

  /**
   * Build a prompt from query and chunks
   *
   * Useful for inspecting the prompt before generation.
   */
  buildPrompt(
    query: string,
    chunks: RetrievedChunk[],
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): BuiltPrompt {
    return this.promptBuilder.build(
      query,
      chunks,
      conversationHistory,
      this.config.maxContextTokens
    );
  }

  /**
   * Generate a response from a built prompt
   *
   * Useful for generating responses from custom prompts.
   */
  async generateResponse(
    builtPrompt: BuiltPrompt,
    options?: LLMCompletionOptions
  ): Promise<{ content: string; model: string; usage: { inputTokens: number; outputTokens: number } }> {
    try {
      const messages = this.buildMessages(builtPrompt);
      const mergedOptions = this.mergeCompletionOptions(options);

      const response = await this.llmAdapter.complete(messages, mergedOptions);

      return {
        content: response.content,
        model: response.model,
        usage: response.usage,
      };
    } catch (error) {
      if (error instanceof LLMError) {
        throw new RAGError(
          `Generation failed: ${error.message}`,
          RAGErrorCode.GENERATION_ERROR,
          { cause: error }
        );
      }
      throw RAGError.fromError(error, RAGErrorCode.GENERATION_ERROR);
    }
  }

  // ===========================================================================
  // Configuration and Utilities
  // ===========================================================================

  /**
   * Get the current configuration
   */
  getConfig(): Readonly<RAGServiceConfig> {
    return { ...this.config };
  }

  /**
   * Get the prompt template being used
   */
  getPromptTemplate(): Readonly<PromptTemplate> {
    return this.promptBuilder.getTemplate();
  }

  /**
   * Get the LLM adapter's provider
   */
  getProvider(): string {
    return this.llmAdapter.provider;
  }

  /**
   * Get the LLM adapter's model
   */
  getModel(): string {
    return this.llmAdapter.model;
  }

  /**
   * Get embedding cache statistics
   */
  getEmbeddingCacheStats(): { size: number; maxSize: number } {
    return this.embedder.getCacheStats();
  }

  /**
   * Clear the embedding cache
   */
  clearEmbeddingCache(): void {
    this.embedder.clearCache();
  }

  /**
   * Get LLM token usage statistics (if tracking enabled)
   */
  getLLMUsageStatistics() {
    return this.llmAdapter.getUsageStatistics();
  }

  /**
   * Get total LLM cost (if tracking enabled)
   */
  getTotalLLMCost(): number | undefined {
    return this.llmAdapter.getTotalCost();
  }


  // ===========================================================================
  // Response Cache Management
  // ===========================================================================

  /**
   * Check if response caching is enabled
   */
  isCacheEnabled(): boolean {
    return this.responseCache !== null;
  }

  /**
   * Get response cache statistics
   * Returns undefined if caching is not enabled
   */
  getResponseCacheStats(): ResponseCacheStats | undefined {
    return this.responseCache?.getStats();
  }

  /**
   * Clear the response cache
   * No-op if caching is not enabled
   */
  clearResponseCache(): void {
    this.responseCache?.clear();
  }

  /**
   * Prune expired entries from the response cache
   * Returns the number of entries removed, or 0 if caching is not enabled
   */
  pruneResponseCache(): number {
    return this.responseCache?.prune() ?? 0;
  }

  /**
   * Get all cached queries (for debugging/monitoring)
   * Returns an empty array if caching is not enabled
   */
  getCachedQueries(): Array<{ query: string; accessCount: number; cachedAt: number }> {
    return this.responseCache?.getCachedQueries() ?? [];
  }

  /**
   * Get the current response cache size
   * Returns 0 if caching is not enabled
   */
  getResponseCacheSize(): number {
    return this.responseCache?.size ?? 0;
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Build LLM messages from a built prompt
   */
  private buildMessages(builtPrompt: BuiltPrompt): LLMMessage[] {
    return [
      { role: 'system', content: builtPrompt.systemMessage },
      { role: 'user', content: builtPrompt.userMessage },
    ];
  }

  /**
   * Merge completion options with defaults
   */
  private mergeCompletionOptions(
    options?: LLMCompletionOptions
  ): LLMCompletionOptions {
    return {
      ...options,
      // Use lower temperature for legal responses to reduce hallucination
      temperature: options?.temperature ?? 0.3,
    };
  }

  /**
   * Wrap an error in a RAGError with appropriate code
   */
  private wrapError(error: unknown, requestId: string): RAGError {
    if (error instanceof RAGError) {
      return error;
    }

    const metadata = { requestId };

    // Detect error type from instance
    if (error instanceof EmbeddingError) {
      return new RAGError(
        `Embedding error: ${error.message}`,
        RAGErrorCode.EMBEDDING_ERROR,
        { cause: error, metadata }
      );
    }

    if (error instanceof VectorStoreError) {
      return new RAGError(
        `Retrieval error: ${error.message}`,
        RAGErrorCode.RETRIEVAL_ERROR,
        { cause: error, metadata }
      );
    }

    if (error instanceof LLMError) {
      return new RAGError(
        `Generation error: ${error.message}`,
        RAGErrorCode.GENERATION_ERROR,
        { cause: error, metadata }
      );
    }

    // Generic error
    const message = error instanceof Error ? error.message : String(error);
    const options: { cause?: Error; metadata?: Record<string, unknown> } = { metadata };
    if (error instanceof Error) {
      options.cause = error;
    }
    return new RAGError(message, RAGErrorCode.UNKNOWN, options);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a RAGService with the provided dependencies
 */
export function createRAGService(
  dependencies: RAGServiceDependencies,
  config?: Partial<RAGServiceConfig>
): RAGService {
  return new RAGService(dependencies, config);
}

// =============================================================================
// Singleton Instance
// =============================================================================

let globalRAGService: RAGService | null = null;

/**
 * Get or create a global RAGService instance
 *
 * Note: You must provide dependencies on first call.
 */
export function getGlobalRAGService(
  dependencies?: RAGServiceDependencies,
  config?: Partial<RAGServiceConfig>
): RAGService {
  if (!globalRAGService) {
    if (!dependencies) {
      throw new RAGError(
        'Dependencies required when creating global RAGService for the first time',
        RAGErrorCode.INVALID_CONFIG
      );
    }
    globalRAGService = new RAGService(dependencies, config);
  }
  return globalRAGService;
}

/**
 * Reset the global RAGService instance
 */
export function resetGlobalRAGService(): void {
  globalRAGService = null;
}
