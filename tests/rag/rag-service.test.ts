/**
 * End-to-End Tests for RAGService
 *
 * Tests the complete RAG pipeline including:
 * - RAGService initialization and lifecycle
 * - answer() method with full pipeline
 * - stream() method with phase-based streaming
 * - streamSimple() for simplified streaming
 * - Error handling and RAGError wrapping
 * - Response caching
 * - PromptBuilder class
 * - Factory functions and global instance management
 *
 * All external dependencies (embedder, vector store, LLM adapter) are mocked
 * to test the service in isolation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  // RAG Service
  RAGService,
  PromptBuilder,
  createRAGService,
  getGlobalRAGService,
  resetGlobalRAGService,
  type RAGServiceDependencies,

  // Types
  RAGError,
  RAGErrorCode,
  isRAGError,
  RAGStreamPhase,
  type RAGQueryInput,
  type RAGResponse,
  type RAGStreamChunk,
  type RetrievedChunk,
  type RAGServiceConfig,
  type PromptTemplate,

  // Default templates
  DEFAULT_PROMPT_TEMPLATE,
  DEFAULT_SYSTEM_PROMPT,

  // Utilities
  generateRequestId,
  createCitationsFromChunks,
  estimateTokenCount,
} from '../../lib/src/rag/index.js';

import type { E5Embedder } from '../../lib/src/embeddings/e5-embedder.js';
import type { VectorStoreService } from '../../lib/src/qdrant/vector-store-service.js';
import type { LLMAdapter } from '../../lib/src/llm/adapter.js';
import { EmbeddingError, EmbeddingErrorCode } from '../../lib/src/embeddings/types.js';
import { VectorStoreError, VectorStoreErrorCode } from '../../lib/src/qdrant/types.js';
import { LLMError } from '../../lib/src/llm/errors.js';

// =============================================================================
// Mock Setup
// =============================================================================

/**
 * Create a mock embedding vector
 */
function createMockEmbedding(dimensions: number = 1024): number[] {
  return new Array(dimensions).fill(0).map((_, i) => Math.sin(i));
}

/**
 * Create mock retrieved chunks
 */
function createMockChunks(count: number = 3): RetrievedChunk[] {
  return Array.from({ length: count }, (_, i) => ({
    chunkId: `chunk-${i + 1}`,
    content: `תוכן חוקי לדוגמה ${i + 1}. סעיף זה קובע כי...`,
    score: 0.9 - i * 0.1,
    lawId: 100 + i,
    lawItemId: `law-item-${i + 1}`,
    chunkIndex: 0,
    lawName: `חוק לדוגמה ${i + 1}`,
    sectionTitle: `סעיף ${i + 1}`,
    sectionType: 'סעיף',
    sectionNumber: `${i + 1}`,
    topicId: 'topic-1',
    publicationDate: Date.now(),
  }));
}

/**
 * Create mock embedder
 */
function createMockEmbedder(): E5Embedder {
  const mockEmbedding = createMockEmbedding();

  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    isInitialized: vi.fn().mockReturnValue(true),
    embedQuery: vi.fn().mockResolvedValue({
      embedding: mockEmbedding,
      cached: false,
      durationMs: 50,
    }),
    embedDocument: vi.fn().mockResolvedValue({
      embedding: mockEmbedding,
      cached: false,
      durationMs: 50,
    }),
    embedBatch: vi.fn().mockResolvedValue({
      embeddings: [{ embedding: mockEmbedding, cached: false }],
      count: 1,
      totalDurationMs: 50,
    }),
    getCacheStats: vi.fn().mockReturnValue({ size: 0, maxSize: 10000 }),
    getDetailedCacheStats: vi.fn().mockReturnValue({ hits: 0, misses: 0, size: 0, hitRate: 0 }),
    clearCache: vi.fn(),
    pruneCache: vi.fn().mockReturnValue(0),
    exportCache: vi.fn().mockReturnValue([]),
    importCache: vi.fn().mockReturnValue(0),
    getCache: vi.fn().mockReturnValue(null),
    getConfig: vi.fn().mockReturnValue({}),
    getModel: vi.fn().mockReturnValue('intfloat/multilingual-e5-large'),
    getDimensions: vi.fn().mockReturnValue(1024),
    preload: vi.fn(),
    dispose: vi.fn(),
  } as unknown as E5Embedder;
}

/**
 * Create mock vector store service
 */
function createMockVectorStore(chunks: RetrievedChunk[] = createMockChunks()): VectorStoreService {
  return {
    collectionExists: vi.fn().mockResolvedValue(true),
    getCollectionName: vi.fn().mockReturnValue('israeli_laws'),
    search: vi.fn().mockResolvedValue({
      results: chunks.map((chunk) => ({
        id: chunk.chunkId,
        score: chunk.score,
        payload: {
          chunkId: chunk.chunkId,
          content: chunk.content,
          lawId: chunk.lawId,
          lawItemId: chunk.lawItemId,
          chunkIndex: chunk.chunkIndex,
          lawName: chunk.lawName,
          sectionTitle: chunk.sectionTitle,
          sectionType: chunk.sectionType,
          sectionNumber: chunk.sectionNumber,
          topicId: chunk.topicId,
          publicationDate: chunk.publicationDate,
        },
        vector: undefined,
      })),
      searchLatencyMs: 100,
    }),
    upsert: vi.fn().mockResolvedValue({ success: true, id: 'test-id' }),
    upsertBatch: vi.fn().mockResolvedValue({ successCount: 1, failureCount: 0 }),
    delete: vi.fn().mockResolvedValue({ success: true, deletedCount: 1 }),
    getConfig: vi.fn().mockReturnValue({}),
  } as unknown as VectorStoreService;
}

/**
 * Create mock LLM adapter
 */
function createMockLLMAdapter(): LLMAdapter {
  return {
    provider: 'anthropic',
    model: 'claude-3-sonnet-20240229',
    complete: vi.fn().mockResolvedValue({
      content: 'זוהי תשובה לדוגמה המבוססת על המסמכים המשפטיים שסופקו. [מקור: חוק לדוגמה 1, סעיף 1]',
      model: 'claude-3-sonnet-20240229',
      usage: { inputTokens: 500, outputTokens: 100 },
    }),
    stream: vi.fn().mockImplementation(async function* () {
      yield { content: 'זוהי ', done: false };
      yield { content: 'תשובה ', done: false };
      yield { content: 'לדוגמה.', done: true, usage: { inputTokens: 500, outputTokens: 50 } };
    }),
    calculateCost: vi.fn().mockReturnValue(0.005),
    getUsageStatistics: vi.fn().mockReturnValue({ totalInputTokens: 0, totalOutputTokens: 0 }),
    getTotalCost: vi.fn().mockReturnValue(0),
    trackUsage: vi.fn(),
  } as unknown as LLMAdapter;
}

/**
 * Create dependencies for RAGService
 */
function createMockDependencies(overrides?: Partial<RAGServiceDependencies>): RAGServiceDependencies {
  return {
    embedder: createMockEmbedder(),
    vectorStore: createMockVectorStore(),
    llmAdapter: createMockLLMAdapter(),
    ...overrides,
  };
}

// =============================================================================
// Test Cleanup
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  resetGlobalRAGService();
});

afterEach(() => {
  resetGlobalRAGService();
});

// =============================================================================
// RAGService Constructor Tests
// =============================================================================

describe('RAGService constructor', () => {
  it('should create service with required dependencies', () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);

    expect(service).toBeInstanceOf(RAGService);
    expect(service.isInitialized()).toBe(false);
  });

  it('should accept optional configuration', () => {
    const deps = createMockDependencies();
    const config: Partial<RAGServiceConfig> = {
      defaultTopK: 10,
      maxContextTokens: 4000,
      enableCache: true,
      cacheTtlMs: 600000,
    };

    const service = new RAGService(deps, config);
    const retrievedConfig = service.getConfig();

    expect(retrievedConfig.defaultTopK).toBe(10);
    expect(retrievedConfig.maxContextTokens).toBe(4000);
    expect(retrievedConfig.enableCache).toBe(true);
    expect(service.isCacheEnabled()).toBe(true);
  });

  it('should use default configuration when not provided', () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);
    const config = service.getConfig();

    expect(config.defaultTopK).toBe(5);
    expect(config.maxContextTokens).toBe(3000);
    expect(config.enableCache).toBe(false);
  });

  it('should accept custom prompt template', () => {
    const customTemplate: Partial<PromptTemplate> = {
      systemPrompt: 'Custom system prompt',
    };
    const deps = createMockDependencies({ promptTemplate: customTemplate });
    const service = new RAGService(deps);

    const template = service.getPromptTemplate();
    expect(template.systemPrompt).toBe('Custom system prompt');
  });
});

// =============================================================================
// RAGService Initialization Tests
// =============================================================================

describe('RAGService initialization', () => {
  it('should initialize successfully', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);

    expect(service.isInitialized()).toBe(false);

    await service.initialize();

    expect(service.isInitialized()).toBe(true);
    expect(deps.embedder.initialize).toHaveBeenCalled();
    expect(deps.vectorStore.collectionExists).toHaveBeenCalled();
  });

  it('should be idempotent - multiple calls are safe', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);

    await service.initialize();
    await service.initialize();
    await service.initialize();

    expect(deps.embedder.initialize).toHaveBeenCalledTimes(1);
  });

  it('should throw if vector store collection does not exist', async () => {
    const deps = createMockDependencies();
    vi.mocked(deps.vectorStore.collectionExists).mockResolvedValue(false);

    const service = new RAGService(deps);

    await expect(service.initialize()).rejects.toThrow(RAGError);
    await expect(service.initialize()).rejects.toThrow('does not exist');
  });

  it('should throw if embedder initialization fails', async () => {
    const deps = createMockDependencies();
    vi.mocked(deps.embedder.initialize).mockRejectedValue(new Error('Model load failed'));

    const service = new RAGService(deps);

    await expect(service.initialize()).rejects.toThrow(RAGError);
    expect(service.isInitialized()).toBe(false);
  });
});

// =============================================================================
// RAGService.answer() Tests
// =============================================================================

describe('RAGService.answer()', () => {
  it('should throw if not initialized', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);

    await expect(
      service.answer({ query: 'מהו חוק חופש המידע?' })
    ).rejects.toThrow(RAGError);

    await expect(
      service.answer({ query: 'מהו חוק חופש המידע?' })
    ).rejects.toThrow('not initialized');
  });

  it('should complete full RAG pipeline', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);
    await service.initialize();

    const response = await service.answer({
      query: 'מהו חוק חופש המידע?',
    });

    expect(response).toMatchObject({
      answer: expect.any(String),
      citations: expect.any(Array),
      retrievedChunks: expect.any(Array),
      metrics: expect.objectContaining({
        totalLatencyMs: expect.any(Number),
        embeddingLatencyMs: expect.any(Number),
        retrievalLatencyMs: expect.any(Number),
        generationLatencyMs: expect.any(Number),
        chunksRetrieved: expect.any(Number),
        chunksUsed: expect.any(Number),
        tokenUsage: expect.objectContaining({
          inputTokens: expect.any(Number),
          outputTokens: expect.any(Number),
        }),
      }),
      model: expect.any(String),
      provider: 'anthropic',
      requestId: expect.stringMatching(/^rag-/),
    });

    // Verify pipeline was called
    expect(deps.embedder.embedQuery).toHaveBeenCalledWith('מהו חוק חופש המידע?');
    expect(deps.vectorStore.search).toHaveBeenCalled();
    expect(deps.llmAdapter.complete).toHaveBeenCalled();
  });

  it('should use custom topK', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);
    await service.initialize();

    await service.answer({
      query: 'test query',
      topK: 10,
    });

    expect(deps.vectorStore.search).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ limit: 10 })
    );
  });

  it('should apply filters to search', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);
    await service.initialize();

    await service.answer({
      query: 'test query',
      filter: {
        lawId: 123,
        topicId: 'criminal-law',
      },
    });

    expect(deps.vectorStore.search).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        filter: expect.objectContaining({
          lawId: 123,
          topicId: 'criminal-law',
        }),
      })
    );
  });

  it('should include conversation history in prompt', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);
    await service.initialize();

    await service.answer({
      query: 'המשך את ההסבר',
      conversationHistory: [
        { role: 'user', content: 'מהו חוק חופש המידע?' },
        { role: 'assistant', content: 'חוק חופש המידע הוא...' },
      ],
    });

    expect(deps.llmAdapter.complete).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('היסטוריית שיחה'),
        }),
      ]),
      expect.any(Object)
    );
  });

  it('should throw NO_RESULTS when no chunks are found', async () => {
    const deps = createMockDependencies();
    vi.mocked(deps.vectorStore.search).mockResolvedValue({
      results: [],
      searchLatencyMs: 50,
    });

    const service = new RAGService(deps);
    await service.initialize();

    try {
      await service.answer({ query: 'שאלה לא רלוונטית' });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(isRAGError(error)).toBe(true);
      expect((error as RAGError).code).toBe(RAGErrorCode.NO_RESULTS);
    }
  });

  it('should pass completion options to LLM', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);
    await service.initialize();

    await service.answer({
      query: 'test',
      completionOptions: {
        temperature: 0.5,
        maxTokens: 500,
      },
    });

    expect(deps.llmAdapter.complete).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        temperature: 0.5,
        maxTokens: 500,
      })
    );
  });

  it('should create citations from retrieved chunks', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);
    await service.initialize();

    const response = await service.answer({ query: 'test' });

    expect(response.citations.length).toBeGreaterThan(0);
    expect(response.citations[0]).toMatchObject({
      index: 1,
      lawName: expect.any(String),
      lawId: expect.any(Number),
    });
  });

  it('should track embedding cache hits', async () => {
    const deps = createMockDependencies();
    vi.mocked(deps.embedder.embedQuery).mockResolvedValue({
      embedding: createMockEmbedding(),
      cached: true,
      durationMs: 0,
    });

    const service = new RAGService(deps);
    await service.initialize();

    const response = await service.answer({ query: 'test' });

    expect(response.metrics.embeddingCached).toBe(true);
  });
});

// =============================================================================
// RAGService.stream() Tests
// =============================================================================

describe('RAGService.stream()', () => {
  it('should throw if not initialized', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);

    const generator = service.stream({ query: 'test' });

    await expect(generator.next()).rejects.toThrow(RAGError);
  });

  it('should yield all streaming phases', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);
    await service.initialize();

    const phases: string[] = [];
    const chunks: RAGStreamChunk[] = [];

    for await (const chunk of service.stream({ query: 'מהו חוק חופש המידע?' })) {
      phases.push(chunk.phase);
      chunks.push(chunk);
    }

    expect(phases).toContain(RAGStreamPhase.STARTING);
    expect(phases).toContain(RAGStreamPhase.EMBEDDING);
    expect(phases).toContain(RAGStreamPhase.RETRIEVING);
    expect(phases).toContain(RAGStreamPhase.CONTEXT);
    expect(phases).toContain(RAGStreamPhase.CONTENT);
    expect(phases).toContain(RAGStreamPhase.DONE);
  });

  it('should yield retrieved chunks in context phase', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);
    await service.initialize();

    let contextChunk: RAGStreamChunk | undefined;

    for await (const chunk of service.stream({ query: 'test' })) {
      if (chunk.phase === RAGStreamPhase.CONTEXT) {
        contextChunk = chunk;
      }
    }

    expect(contextChunk).toBeDefined();
    expect(contextChunk?.retrievedChunks).toHaveLength(3);
  });

  it('should yield content chunks during generation', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);
    await service.initialize();

    const contentChunks: RAGStreamChunk[] = [];

    for await (const chunk of service.stream({ query: 'test' })) {
      if (chunk.phase === RAGStreamPhase.CONTENT) {
        contentChunks.push(chunk);
      }
    }

    expect(contentChunks.length).toBeGreaterThan(0);
  });

  it('should include metrics and citations in done phase', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);
    await service.initialize();

    let doneChunk: RAGStreamChunk | undefined;

    for await (const chunk of service.stream({ query: 'test' })) {
      if (chunk.phase === RAGStreamPhase.DONE) {
        doneChunk = chunk;
      }
    }

    expect(doneChunk).toBeDefined();
    expect(doneChunk?.done).toBe(true);
    expect(doneChunk?.metrics).toBeDefined();
    expect(doneChunk?.citations).toBeDefined();
  });

  it('should include progress information', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);
    await service.initialize();

    const progressMessages: string[] = [];

    for await (const chunk of service.stream({ query: 'test' })) {
      if (chunk.progress?.message) {
        progressMessages.push(chunk.progress.message);
      }
    }

    expect(progressMessages.length).toBeGreaterThan(0);
    expect(progressMessages.some((m) => m.includes('מתחיל'))).toBe(true);
  });

  it('should yield error phase on failure', async () => {
    const deps = createMockDependencies();
    vi.mocked(deps.vectorStore.search).mockResolvedValue({
      results: [],
      searchLatencyMs: 50,
    });

    const service = new RAGService(deps);
    await service.initialize();

    let errorChunk: RAGStreamChunk | undefined;

    try {
      for await (const chunk of service.stream({ query: 'test' })) {
        if (chunk.phase === RAGStreamPhase.ERROR) {
          errorChunk = chunk;
        }
      }
    } catch {
      // Expected
    }

    expect(errorChunk).toBeDefined();
    expect(errorChunk?.error).toBeDefined();
    expect(errorChunk?.error?.code).toBe(RAGErrorCode.NO_RESULTS);
  });
});

// =============================================================================
// RAGService.streamSimple() Tests
// =============================================================================

describe('RAGService.streamSimple()', () => {
  it('should skip progress phases', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);
    await service.initialize();

    const phases: string[] = [];

    for await (const chunk of service.streamSimple({ query: 'test' })) {
      phases.push(chunk.phase);
    }

    expect(phases).not.toContain(RAGStreamPhase.STARTING);
    expect(phases).not.toContain(RAGStreamPhase.EMBEDDING);
    expect(phases).not.toContain(RAGStreamPhase.RETRIEVING);
    expect(phases).not.toContain(RAGStreamPhase.CONTEXT);
  });

  it('should include retrieved chunks on first content chunk', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);
    await service.initialize();

    let firstContentChunk: RAGStreamChunk | undefined;

    for await (const chunk of service.streamSimple({ query: 'test' })) {
      if (chunk.phase === RAGStreamPhase.CONTENT && !firstContentChunk) {
        firstContentChunk = chunk;
      }
    }

    expect(firstContentChunk?.retrievedChunks).toBeDefined();
    expect(firstContentChunk?.retrievedChunks?.length).toBeGreaterThan(0);
  });

  it('should yield content and done phases', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);
    await service.initialize();

    const phases: string[] = [];

    for await (const chunk of service.streamSimple({ query: 'test' })) {
      phases.push(chunk.phase);
    }

    expect(phases).toContain(RAGStreamPhase.CONTENT);
    expect(phases).toContain(RAGStreamPhase.DONE);
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('RAGService error handling', () => {
  it('should wrap EmbeddingError as EMBEDDING_ERROR', async () => {
    const deps = createMockDependencies();
    vi.mocked(deps.embedder.embedQuery).mockRejectedValue(
      new EmbeddingError('Embedding failed', EmbeddingErrorCode.COMPUTATION_ERROR)
    );

    const service = new RAGService(deps);
    await service.initialize();

    try {
      await service.answer({ query: 'test' });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(isRAGError(error)).toBe(true);
      expect((error as RAGError).code).toBe(RAGErrorCode.EMBEDDING_ERROR);
    }
  });

  it('should wrap VectorStoreError as RETRIEVAL_ERROR', async () => {
    const deps = createMockDependencies();
    vi.mocked(deps.vectorStore.search).mockRejectedValue(
      new VectorStoreError('Search failed', VectorStoreErrorCode.SEARCH_ERROR)
    );

    const service = new RAGService(deps);
    await service.initialize();

    try {
      await service.answer({ query: 'test' });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(isRAGError(error)).toBe(true);
      expect((error as RAGError).code).toBe(RAGErrorCode.RETRIEVAL_ERROR);
    }
  });

  it('should wrap LLMError as GENERATION_ERROR', async () => {
    const deps = createMockDependencies();
    vi.mocked(deps.llmAdapter.complete).mockRejectedValue(
      new LLMError('Generation failed', { code: 'SERVER_ERROR', provider: 'anthropic' })
    );

    const service = new RAGService(deps);
    await service.initialize();

    try {
      await service.answer({ query: 'test' });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(isRAGError(error)).toBe(true);
      expect((error as RAGError).code).toBe(RAGErrorCode.GENERATION_ERROR);
    }
  });

  it('should wrap unknown errors as UNKNOWN', async () => {
    const deps = createMockDependencies();
    vi.mocked(deps.llmAdapter.complete).mockRejectedValue(new Error('Unknown error'));

    const service = new RAGService(deps);
    await service.initialize();

    try {
      await service.answer({ query: 'test' });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(isRAGError(error)).toBe(true);
      expect((error as RAGError).code).toBe(RAGErrorCode.GENERATION_ERROR);
    }
  });

  it('should include requestId in error metadata', async () => {
    const deps = createMockDependencies();
    vi.mocked(deps.vectorStore.search).mockResolvedValue({
      results: [],
      searchLatencyMs: 50,
    });

    const service = new RAGService(deps);
    await service.initialize();

    try {
      await service.answer({ query: 'test' });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(isRAGError(error)).toBe(true);
      expect((error as RAGError).metadata?.query).toBeDefined();
    }
  });
});

// =============================================================================
// Response Caching Tests
// =============================================================================

describe('RAGService response caching', () => {
  it('should not cache by default', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);

    expect(service.isCacheEnabled()).toBe(false);
    expect(service.getResponseCacheStats()).toBeUndefined();
  });

  it('should cache responses when enabled', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps, { enableCache: true });
    await service.initialize();

    expect(service.isCacheEnabled()).toBe(true);

    await service.answer({ query: 'test query' });
    const cacheStats = service.getResponseCacheStats();

    expect(cacheStats).toBeDefined();
    expect(cacheStats?.size).toBe(1);
  });

  it('should serve cached response on repeat query', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps, { enableCache: true });
    await service.initialize();

    await service.answer({ query: 'test query' });

    // Clear mocks to verify cache hit
    vi.mocked(deps.embedder.embedQuery).mockClear();
    vi.mocked(deps.vectorStore.search).mockClear();
    vi.mocked(deps.llmAdapter.complete).mockClear();

    const cachedResponse = await service.answer({ query: 'test query' });

    // Pipeline should not have been called
    expect(deps.embedder.embedQuery).not.toHaveBeenCalled();
    expect(deps.vectorStore.search).not.toHaveBeenCalled();
    expect(deps.llmAdapter.complete).not.toHaveBeenCalled();

    // Response should indicate cache hit
    expect(cachedResponse.metrics.embeddingCached).toBe(true);
  });

  it('should skip cache for conversational queries', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps, { enableCache: true });
    await service.initialize();

    await service.answer({
      query: 'test query',
      conversationHistory: [{ role: 'user', content: 'previous' }],
    });

    const cacheStats = service.getResponseCacheStats();
    expect(cacheStats?.size).toBe(0);
  });

  it('should clear response cache', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps, { enableCache: true });
    await service.initialize();

    await service.answer({ query: 'test' });
    expect(service.getResponseCacheSize()).toBe(1);

    service.clearResponseCache();
    expect(service.getResponseCacheSize()).toBe(0);
  });

  it('should prune expired cache entries', async () => {
    vi.useFakeTimers();

    const deps = createMockDependencies();
    const service = new RAGService(deps, {
      enableCache: true,
      cacheTtlMs: 1000,
    });
    await service.initialize();

    await service.answer({ query: 'test' });
    expect(service.getResponseCacheSize()).toBe(1);

    vi.advanceTimersByTime(2000);

    const pruned = service.pruneResponseCache();
    expect(pruned).toBe(1);
    expect(service.getResponseCacheSize()).toBe(0);

    vi.useRealTimers();
  });

  it('should get cached queries list', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps, { enableCache: true });
    await service.initialize();

    await service.answer({ query: 'first query' });
    await service.answer({ query: 'second query' });

    const cachedQueries = service.getCachedQueries();
    expect(cachedQueries).toHaveLength(2);
    expect(cachedQueries.some((q) => q.query === 'first query')).toBe(true);
    expect(cachedQueries.some((q) => q.query === 'second query')).toBe(true);
  });
});

// =============================================================================
// PromptBuilder Tests
// =============================================================================

describe('PromptBuilder', () => {
  it('should build prompt with default template', () => {
    const builder = new PromptBuilder();
    const chunks = createMockChunks(2);

    const prompt = builder.build('מהו חוק חופש המידע?', chunks);

    expect(prompt.systemMessage).toBe(DEFAULT_SYSTEM_PROMPT);
    expect(prompt.userMessage).toContain('מהו חוק חופש המידע?');
    expect(prompt.userMessage).toContain('תוכן חוקי לדוגמה');
    expect(prompt.chunksIncluded).toBe(2);
    expect(prompt.estimatedTokens).toBeGreaterThan(0);
  });

  it('should build prompt with custom template', () => {
    const customTemplate: Partial<PromptTemplate> = {
      systemPrompt: 'Custom system prompt',
      userPromptTemplate: 'Query: {query}\nContext: {context}',
    };

    const builder = new PromptBuilder(customTemplate);
    const chunks = createMockChunks(1);

    const prompt = builder.build('test query', chunks);

    expect(prompt.systemMessage).toBe('Custom system prompt');
    expect(prompt.userMessage).toContain('Query: test query');
  });

  it('should include conversation history', () => {
    const builder = new PromptBuilder();
    const chunks = createMockChunks(1);
    const history = [
      { role: 'user' as const, content: 'שאלה קודמת' },
      { role: 'assistant' as const, content: 'תשובה קודמת' },
    ];

    const prompt = builder.build('המשך', chunks, history);

    expect(prompt.userMessage).toContain('היסטוריית שיחה');
    expect(prompt.userMessage).toContain('שאלה קודמת');
    expect(prompt.userMessage).toContain('תשובה קודמת');
  });

  it('should truncate context when exceeding token limit', () => {
    const builder = new PromptBuilder();
    // Create many chunks that would exceed limit
    const chunks = createMockChunks(20);

    const prompt = builder.build('test', chunks, undefined, 500);

    expect(prompt.chunksIncluded).toBeLessThan(20);
    expect(prompt.contextTruncated).toBe(true);
  });

  it('should format chunks with section info', () => {
    const builder = new PromptBuilder();
    const chunks: RetrievedChunk[] = [
      {
        chunkId: 'chunk-1',
        content: 'תוכן הסעיף',
        score: 0.9,
        lawId: 100,
        lawItemId: 'law-1',
        chunkIndex: 0,
        lawName: 'חוק הגנת הפרטיות',
        sectionTitle: 'איסור פגיעה בפרטיות',
        sectionType: 'סעיף',
        sectionNumber: '2',
      },
    ];

    const prompt = builder.build('test', chunks);

    expect(prompt.userMessage).toContain('חוק הגנת הפרטיות');
    expect(prompt.userMessage).toContain('סעיף');
    expect(prompt.userMessage).toContain('תוכן הסעיף');
  });

  it('should return template via getTemplate()', () => {
    const builder = new PromptBuilder();
    const template = builder.getTemplate();

    expect(template).toMatchObject({
      systemPrompt: expect.any(String),
      userPromptTemplate: expect.any(String),
      contextChunkFormat: expect.any(String),
      contextSeparator: expect.any(String),
    });
  });
});

// =============================================================================
// Individual Pipeline Steps Tests
// =============================================================================

describe('RAGService individual pipeline steps', () => {
  describe('embedQuery()', () => {
    it('should embed query text', async () => {
      const deps = createMockDependencies();
      const service = new RAGService(deps);
      await service.initialize();

      const result = await service.embedQuery('test query');

      expect(result.embedding).toHaveLength(1024);
      expect(result.cached).toBe(false);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should throw on embedding failure', async () => {
      const deps = createMockDependencies();
      vi.mocked(deps.embedder.embedQuery).mockRejectedValue(
        new EmbeddingError('Failed', EmbeddingErrorCode.COMPUTATION_ERROR)
      );

      const service = new RAGService(deps);
      await service.initialize();

      await expect(service.embedQuery('test')).rejects.toThrow(RAGError);
    });
  });

  describe('retrieveChunks()', () => {
    it('should retrieve chunks from vector store', async () => {
      const deps = createMockDependencies();
      const service = new RAGService(deps);
      await service.initialize();

      const embedding = createMockEmbedding();
      const chunks = await service.retrieveChunks(embedding);

      expect(chunks).toHaveLength(3);
      expect(chunks[0]?.content).toBeDefined();
      expect(chunks[0]?.score).toBeDefined();
    });

    it('should apply topK and filter options', async () => {
      const deps = createMockDependencies();
      const service = new RAGService(deps);
      await service.initialize();

      const embedding = createMockEmbedding();
      await service.retrieveChunks(embedding, 10, 0.5, { lawId: 123 });

      expect(deps.vectorStore.search).toHaveBeenCalledWith(
        embedding,
        expect.objectContaining({
          limit: 10,
          scoreThreshold: 0.5,
          filter: { lawId: 123 },
        })
      );
    });
  });

  describe('buildPrompt()', () => {
    it('should build prompt from query and chunks', async () => {
      const deps = createMockDependencies();
      const service = new RAGService(deps);
      await service.initialize();

      const chunks = createMockChunks(2);
      const prompt = service.buildPrompt('test query', chunks);

      expect(prompt.systemMessage).toBeDefined();
      expect(prompt.userMessage).toContain('test query');
      expect(prompt.chunksIncluded).toBe(2);
    });
  });

  describe('generateResponse()', () => {
    it('should generate response from prompt', async () => {
      const deps = createMockDependencies();
      const service = new RAGService(deps);
      await service.initialize();

      const chunks = createMockChunks(1);
      const prompt = service.buildPrompt('test', chunks);
      const response = await service.generateResponse(prompt);

      expect(response.content).toBeDefined();
      expect(response.model).toBeDefined();
      expect(response.usage).toBeDefined();
    });
  });
});

// =============================================================================
// Configuration and Utility Methods Tests
// =============================================================================

describe('RAGService configuration methods', () => {
  it('should return provider', () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);

    expect(service.getProvider()).toBe('anthropic');
  });

  it('should return model', () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);

    expect(service.getModel()).toBe('claude-3-sonnet-20240229');
  });

  it('should get embedding cache stats', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);
    await service.initialize();

    const stats = service.getEmbeddingCacheStats();
    expect(stats).toMatchObject({
      size: expect.any(Number),
      maxSize: expect.any(Number),
    });
  });

  it('should clear embedding cache', async () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);
    await service.initialize();

    service.clearEmbeddingCache();
    expect(deps.embedder.clearCache).toHaveBeenCalled();
  });

  it('should get LLM usage statistics', () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);

    const stats = service.getLLMUsageStatistics();
    expect(stats).toBeDefined();
  });

  it('should get total LLM cost', () => {
    const deps = createMockDependencies();
    const service = new RAGService(deps);

    const cost = service.getTotalLLMCost();
    expect(cost).toBeDefined();
  });
});

// =============================================================================
// Factory Functions Tests
// =============================================================================

describe('createRAGService()', () => {
  it('should create RAGService with dependencies', () => {
    const deps = createMockDependencies();
    const service = createRAGService(deps);

    expect(service).toBeInstanceOf(RAGService);
  });

  it('should accept optional config', () => {
    const deps = createMockDependencies();
    const service = createRAGService(deps, { defaultTopK: 10 });

    expect(service.getConfig().defaultTopK).toBe(10);
  });
});

describe('getGlobalRAGService()', () => {
  it('should throw if dependencies not provided on first call', () => {
    expect(() => getGlobalRAGService()).toThrow(RAGError);
  });

  it('should return same instance on subsequent calls', () => {
    const deps = createMockDependencies();
    const service1 = getGlobalRAGService(deps);
    const service2 = getGlobalRAGService();

    expect(service1).toBe(service2);
  });

  it('should reset global instance', () => {
    const deps1 = createMockDependencies();
    const deps2 = createMockDependencies();

    const service1 = getGlobalRAGService(deps1);
    resetGlobalRAGService();
    const service2 = getGlobalRAGService(deps2);

    expect(service1).not.toBe(service2);
  });
});

// =============================================================================
// Utility Functions Tests
// =============================================================================

describe('generateRequestId()', () => {
  it('should generate unique request IDs', () => {
    const id1 = generateRequestId();
    const id2 = generateRequestId();

    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^rag-\d+-[a-z0-9]+$/);
  });
});

describe('createCitationsFromChunks()', () => {
  it('should create citations from chunks', () => {
    const chunks = createMockChunks(3);
    const citations = createCitationsFromChunks(chunks);

    expect(citations.length).toBeGreaterThan(0);
    expect(citations[0]).toMatchObject({
      index: 1,
      lawName: expect.any(String),
      lawId: expect.any(Number),
    });
  });

  it('should deduplicate by lawId keeping highest score', () => {
    const chunks: RetrievedChunk[] = [
      {
        chunkId: 'c1',
        content: 'content 1',
        score: 0.9,
        lawId: 100,
        lawItemId: 'l1',
        chunkIndex: 0,
        lawName: 'Law 100',
      },
      {
        chunkId: 'c2',
        content: 'content 2',
        score: 0.7,
        lawId: 100, // Same lawId
        lawItemId: 'l1',
        chunkIndex: 1,
        lawName: 'Law 100',
      },
      {
        chunkId: 'c3',
        content: 'content 3',
        score: 0.8,
        lawId: 200,
        lawItemId: 'l2',
        chunkIndex: 0,
        lawName: 'Law 200',
      },
    ];

    const citations = createCitationsFromChunks(chunks);

    expect(citations).toHaveLength(2);
    expect(citations.find((c) => c.lawId === 100)?.score).toBe(0.9);
  });
});

describe('estimateTokenCount()', () => {
  it('should estimate tokens for Hebrew text', () => {
    const hebrewText = 'זהו טקסט בעברית לבדיקה';
    const tokens = estimateTokenCount(hebrewText);

    expect(tokens).toBeGreaterThan(0);
    // Hebrew text should have ~2.5 chars per token
    expect(tokens).toBeLessThan(hebrewText.length);
  });

  it('should estimate tokens for mixed text', () => {
    const mixedText = 'This is English and זהו עברית';
    const tokens = estimateTokenCount(mixedText);

    expect(tokens).toBeGreaterThan(0);
  });
});

// =============================================================================
// RAGError Tests
// =============================================================================

describe('RAGError', () => {
  it('should create error with code', () => {
    const error = new RAGError('Test error', RAGErrorCode.EMBEDDING_ERROR);

    expect(error.message).toBe('Test error');
    expect(error.code).toBe(RAGErrorCode.EMBEDDING_ERROR);
    expect(error.name).toBe('RAGError');
  });

  it('should create error with cause', () => {
    const cause = new Error('Original error');
    const error = new RAGError('Wrapped error', RAGErrorCode.UNKNOWN, { cause });

    expect(error.cause).toBe(cause);
  });

  it('should create error with metadata', () => {
    const error = new RAGError('Test', RAGErrorCode.NO_RESULTS, {
      metadata: { query: 'test query' },
    });

    expect(error.metadata?.query).toBe('test query');
  });

  it('should create from unknown error', () => {
    const originalError = new Error('Original');
    const ragError = RAGError.fromError(originalError, RAGErrorCode.UNKNOWN);

    expect(ragError.message).toBe('Original');
    expect(ragError.code).toBe(RAGErrorCode.UNKNOWN);
    expect(ragError.cause).toBe(originalError);
  });

  it('should pass through existing RAGError', () => {
    const original = new RAGError('Original', RAGErrorCode.EMBEDDING_ERROR);
    const passed = RAGError.fromError(original);

    expect(passed).toBe(original);
  });
});

describe('isRAGError()', () => {
  it('should return true for RAGError', () => {
    const error = new RAGError('Test', RAGErrorCode.UNKNOWN);
    expect(isRAGError(error)).toBe(true);
  });

  it('should return false for regular Error', () => {
    const error = new Error('Test');
    expect(isRAGError(error)).toBe(false);
  });

  it('should return false for non-errors', () => {
    expect(isRAGError(null)).toBe(false);
    expect(isRAGError(undefined)).toBe(false);
    expect(isRAGError('string')).toBe(false);
  });
});
