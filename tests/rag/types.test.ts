/**
 * Unit Tests for RAG Types Module
 *
 * Tests type definitions, Zod schemas, and utility functions:
 * - RAGError class and type guards
 * - Zod schema validation
 * - Utility functions (generateRequestId, toSearchFilter, etc.)
 * - Default templates
 * - Citation and chunk helpers
 */

import { describe, it, expect } from 'vitest';
import {
  // Error types
  RAGError,
  RAGErrorCode,
  isRAGError,

  // Zod schemas
  RAGQueryInputSchema,
  RAGResponseSchema,
  RAGStreamChunkSchema,
  RAGMetricsSchema,
  RetrievedChunkSchema,
  CitationSchema,
  PromptTemplateSchema,
  RAGServiceConfigSchema,
  ResponseCacheConfigSchema,
  ResponseCacheStatsSchema,
  CachedResponseSchema,

  // Types
  type RAGQueryInput,
  type RAGResponse,
  type RAGStreamChunk,
  type RAGMetrics,
  type RetrievedChunk,
  type Citation,
  type PromptTemplate,
  type RAGServiceConfig,

  // Constants
  RAGStreamPhase,
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
  createDefaultRAGServiceConfig,
} from '../../lib/src/rag/index.js';

import type { IsraeliLawPayload } from '../../lib/src/qdrant/types.js';

// =============================================================================
// RAGError Tests
// =============================================================================

describe('RAGError', () => {
  describe('constructor', () => {
    it('should create error with message and code', () => {
      const error = new RAGError('Test error', RAGErrorCode.EMBEDDING_ERROR);

      expect(error.message).toBe('Test error');
      expect(error.code).toBe(RAGErrorCode.EMBEDDING_ERROR);
      expect(error.name).toBe('RAGError');
    });

    it('should create error with cause', () => {
      const cause = new Error('Original error');
      const error = new RAGError('Wrapped', RAGErrorCode.UNKNOWN, { cause });

      expect(error.cause).toBe(cause);
    });

    it('should create error with metadata', () => {
      const error = new RAGError('Test', RAGErrorCode.NO_RESULTS, {
        metadata: { query: 'test', requestId: 'req-123' },
      });

      expect(error.metadata?.query).toBe('test');
      expect(error.metadata?.requestId).toBe('req-123');
    });

    it('should have proper stack trace', () => {
      const error = new RAGError('Test', RAGErrorCode.UNKNOWN);
      expect(error.stack).toBeDefined();
    });
  });

  describe('fromError()', () => {
    it('should pass through RAGError unchanged', () => {
      const original = new RAGError('Original', RAGErrorCode.EMBEDDING_ERROR);
      const result = RAGError.fromError(original);

      expect(result).toBe(original);
    });

    it('should wrap regular Error', () => {
      const original = new Error('Original message');
      const result = RAGError.fromError(original, RAGErrorCode.GENERATION_ERROR);

      expect(result.message).toBe('Original message');
      expect(result.code).toBe(RAGErrorCode.GENERATION_ERROR);
      expect(result.cause).toBe(original);
    });

    it('should wrap string error', () => {
      const result = RAGError.fromError('string error');

      expect(result.message).toBe('string error');
      expect(result.code).toBe(RAGErrorCode.UNKNOWN);
    });

    it('should use default code if not provided', () => {
      const result = RAGError.fromError(new Error('test'));

      expect(result.code).toBe(RAGErrorCode.UNKNOWN);
    });

    it('should include metadata', () => {
      const result = RAGError.fromError(
        new Error('test'),
        RAGErrorCode.TIMEOUT,
        { requestId: 'req-123' }
      );

      expect(result.metadata?.requestId).toBe('req-123');
    });
  });
});

describe('isRAGError()', () => {
  it('should return true for RAGError', () => {
    const error = new RAGError('test', RAGErrorCode.UNKNOWN);
    expect(isRAGError(error)).toBe(true);
  });

  it('should return false for regular Error', () => {
    expect(isRAGError(new Error('test'))).toBe(false);
  });

  it('should return false for null/undefined', () => {
    expect(isRAGError(null)).toBe(false);
    expect(isRAGError(undefined)).toBe(false);
  });

  it('should return false for non-objects', () => {
    expect(isRAGError('string')).toBe(false);
    expect(isRAGError(123)).toBe(false);
    expect(isRAGError(true)).toBe(false);
  });
});

// =============================================================================
// RAGErrorCode Tests
// =============================================================================

describe('RAGErrorCode', () => {
  it('should have all expected error codes', () => {
    expect(RAGErrorCode.EMBEDDING_ERROR).toBe('EMBEDDING_ERROR');
    expect(RAGErrorCode.RETRIEVAL_ERROR).toBe('RETRIEVAL_ERROR');
    expect(RAGErrorCode.GENERATION_ERROR).toBe('GENERATION_ERROR');
    expect(RAGErrorCode.PROMPT_ERROR).toBe('PROMPT_ERROR');
    expect(RAGErrorCode.INVALID_CONFIG).toBe('INVALID_CONFIG');
    expect(RAGErrorCode.NOT_INITIALIZED).toBe('NOT_INITIALIZED');
    expect(RAGErrorCode.NO_RESULTS).toBe('NO_RESULTS');
    expect(RAGErrorCode.TIMEOUT).toBe('TIMEOUT');
    expect(RAGErrorCode.UNKNOWN).toBe('UNKNOWN');
  });
});

// =============================================================================
// RAGStreamPhase Tests
// =============================================================================

describe('RAGStreamPhase', () => {
  it('should have all expected phases', () => {
    expect(RAGStreamPhase.STARTING).toBe('starting');
    expect(RAGStreamPhase.EMBEDDING).toBe('embedding');
    expect(RAGStreamPhase.RETRIEVING).toBe('retrieving');
    expect(RAGStreamPhase.CONTEXT).toBe('context');
    expect(RAGStreamPhase.CONTENT).toBe('content');
    expect(RAGStreamPhase.DONE).toBe('done');
    expect(RAGStreamPhase.ERROR).toBe('error');
  });
});

// =============================================================================
// Zod Schema Validation Tests
// =============================================================================

describe('RAGQueryInputSchema', () => {
  it('should validate valid input', () => {
    const input = {
      query: 'מהו חוק חופש המידע?',
    };

    const result = RAGQueryInputSchema.parse(input);

    expect(result.query).toBe(input.query);
    expect(result.topK).toBe(5); // default
  });

  it('should reject empty query', () => {
    expect(() => RAGQueryInputSchema.parse({ query: '' })).toThrow();
  });

  it('should validate with all optional fields', () => {
    const input = {
      query: 'test query',
      conversationHistory: [
        { role: 'user', content: 'previous' },
        { role: 'assistant', content: 'response' },
      ],
      filter: {
        lawId: 123,
        topicIds: ['topic-1', 'topic-2'],
        publicationDateMin: 1000000,
        publicationDateMax: 2000000,
      },
      topK: 10,
      scoreThreshold: 0.7,
      completionOptions: {
        temperature: 0.5,
        maxTokens: 1000,
      },
    };

    const result = RAGQueryInputSchema.parse(input);

    expect(result.topK).toBe(10);
    expect(result.filter?.lawId).toBe(123);
    expect(result.conversationHistory).toHaveLength(2);
  });

  it('should reject invalid conversation history role', () => {
    const input = {
      query: 'test',
      conversationHistory: [
        { role: 'invalid', content: 'test' },
      ],
    };

    expect(() => RAGQueryInputSchema.parse(input)).toThrow();
  });

  it('should validate score threshold range', () => {
    expect(() =>
      RAGQueryInputSchema.parse({ query: 'test', scoreThreshold: 1.5 })
    ).toThrow();

    expect(() =>
      RAGQueryInputSchema.parse({ query: 'test', scoreThreshold: -0.5 })
    ).toThrow();
  });
});

describe('RetrievedChunkSchema', () => {
  it('should validate valid chunk', () => {
    const chunk = {
      chunkId: 'chunk-1',
      content: 'test content',
      score: 0.85,
      lawId: 100,
      lawItemId: 'law-1',
      chunkIndex: 0,
    };

    const result = RetrievedChunkSchema.parse(chunk);

    expect(result.chunkId).toBe('chunk-1');
    expect(result.score).toBe(0.85);
  });

  it('should validate score range', () => {
    const validChunk = {
      chunkId: 'c1',
      content: 'c',
      score: 0.5,
      lawId: 1,
      lawItemId: 'l1',
      chunkIndex: 0,
    };

    expect(() =>
      RetrievedChunkSchema.parse({ ...validChunk, score: 1.5 })
    ).toThrow();

    expect(() =>
      RetrievedChunkSchema.parse({ ...validChunk, score: -0.1 })
    ).toThrow();
  });

  it('should validate with optional fields', () => {
    const chunk = {
      chunkId: 'chunk-1',
      content: 'test',
      score: 0.9,
      lawId: 100,
      lawItemId: 'law-1',
      chunkIndex: 0,
      lawName: 'חוק לדוגמה',
      sectionTitle: 'סעיף 1',
      sectionType: 'סעיף',
      sectionNumber: '1',
      topicId: 'topic-1',
      publicationDate: Date.now(),
    };

    const result = RetrievedChunkSchema.parse(chunk);

    expect(result.lawName).toBe('חוק לדוגמה');
    expect(result.sectionTitle).toBe('סעיף 1');
  });
});

describe('CitationSchema', () => {
  it('should validate valid citation', () => {
    const citation = {
      index: 1,
      lawName: 'חוק חופש המידע',
      lawId: 100,
    };

    const result = CitationSchema.parse(citation);

    expect(result.lawName).toBe('חוק חופש המידע');
  });

  it('should validate with optional fields', () => {
    const citation = {
      index: 1,
      lawName: 'חוק לדוגמה',
      lawId: 100,
      section: 'סעיף 5',
      excerpt: 'קטע מהחוק...',
      score: 0.95,
    };

    const result = CitationSchema.parse(citation);

    expect(result.section).toBe('סעיף 5');
    expect(result.excerpt).toBe('קטע מהחוק...');
  });

  it('should reject non-positive index', () => {
    expect(() =>
      CitationSchema.parse({ index: 0, lawName: 'test', lawId: 1 })
    ).toThrow();
  });
});

describe('RAGMetricsSchema', () => {
  it('should validate valid metrics', () => {
    const metrics = {
      totalLatencyMs: 1000,
      embeddingLatencyMs: 50,
      retrievalLatencyMs: 100,
      generationLatencyMs: 800,
      chunksRetrieved: 5,
      chunksUsed: 3,
      tokenUsage: {
        inputTokens: 500,
        outputTokens: 100,
        totalTokens: 600,
      },
      embeddingCached: false,
    };

    const result = RAGMetricsSchema.parse(metrics);

    expect(result.totalLatencyMs).toBe(1000);
    expect(result.tokenUsage.totalTokens).toBe(600);
  });

  it('should reject negative values', () => {
    const invalidMetrics = {
      totalLatencyMs: -100,
      embeddingLatencyMs: 50,
      retrievalLatencyMs: 100,
      generationLatencyMs: 800,
      chunksRetrieved: 5,
      chunksUsed: 3,
      tokenUsage: {
        inputTokens: 500,
        outputTokens: 100,
        totalTokens: 600,
      },
      embeddingCached: false,
    };

    expect(() => RAGMetricsSchema.parse(invalidMetrics)).toThrow();
  });
});

describe('RAGServiceConfigSchema', () => {
  it('should provide defaults for all fields', () => {
    const result = RAGServiceConfigSchema.parse({});

    expect(result.defaultTopK).toBe(5);
    expect(result.maxChunksInContext).toBe(10);
    expect(result.maxContextTokens).toBe(3000);
    expect(result.enableCache).toBe(false);
    expect(result.cacheTtlMs).toBe(300000);
    expect(result.enableQueryLogging).toBe(false);
    expect(result.timeoutMs).toBe(30000);
    expect(result.enableLatencyLogging).toBe(true);
    expect(result.logPhaseEvents).toBe(false);
    expect(result.logLatencySummary).toBe(true);
  });

  it('should accept custom values', () => {
    const config = {
      defaultTopK: 10,
      enableCache: true,
      cacheTtlMs: 600000,
    };

    const result = RAGServiceConfigSchema.parse(config);

    expect(result.defaultTopK).toBe(10);
    expect(result.enableCache).toBe(true);
    expect(result.cacheTtlMs).toBe(600000);
  });
});

describe('PromptTemplateSchema', () => {
  it('should validate valid template', () => {
    const template = {
      systemPrompt: 'You are a helpful assistant',
      userPromptTemplate: 'Query: {query}\nContext: {context}',
      contextChunkFormat: '[{index}] {content}',
    };

    const result = PromptTemplateSchema.parse(template);

    expect(result.contextSeparator).toBe('\n\n');
    expect(result.maxContextChars).toBe(12000);
  });
});

// =============================================================================
// Utility Functions Tests
// =============================================================================

describe('generateRequestId()', () => {
  it('should generate unique IDs', () => {
    const ids = new Set<string>();

    for (let i = 0; i < 100; i++) {
      ids.add(generateRequestId());
    }

    expect(ids.size).toBe(100);
  });

  it('should match expected format', () => {
    const id = generateRequestId();
    expect(id).toMatch(/^rag-\d+-[a-z0-9]+$/);
  });

  it('should include timestamp', () => {
    const now = Date.now();
    const id = generateRequestId();
    const timestamp = parseInt(id.split('-')[1]!);

    // Timestamp should be within 1 second of now
    expect(Math.abs(timestamp - now)).toBeLessThan(1000);
  });
});

describe('toSearchFilter()', () => {
  it('should return undefined for undefined input', () => {
    expect(toSearchFilter(undefined)).toBeUndefined();
  });

  it('should convert filter to SearchFilter format', () => {
    const input = {
      lawId: 123,
      topicId: 'criminal-law',
      publicationDateMin: 1000000,
      publicationDateMax: 2000000,
    };

    const result = toSearchFilter(input);

    expect(result).toEqual({
      lawId: 123,
      lawIds: undefined,
      topicId: 'criminal-law',
      topicIds: undefined,
      publicationDateMin: 1000000,
      publicationDateMax: 2000000,
    });
  });

  it('should handle arrays', () => {
    const input = {
      lawIds: [1, 2, 3],
      topicIds: ['topic-1', 'topic-2'],
    };

    const result = toSearchFilter(input);

    expect(result?.lawIds).toEqual([1, 2, 3]);
    expect(result?.topicIds).toEqual(['topic-1', 'topic-2']);
  });
});

describe('payloadToRetrievedChunk()', () => {
  it('should convert payload to RetrievedChunk', () => {
    const payload: IsraeliLawPayload = {
      chunkId: 'chunk-1',
      content: 'test content',
      lawId: 100,
      lawItemId: 'law-1',
      chunkIndex: 0,
      lawName: 'חוק לדוגמה',
      sectionTitle: 'סעיף 1',
      sectionType: 'סעיף',
      sectionNumber: '1',
      topicId: 'topic-1',
      publicationDate: 1234567890,
    };

    const result = payloadToRetrievedChunk(payload, 0.85);

    expect(result.chunkId).toBe('chunk-1');
    expect(result.content).toBe('test content');
    expect(result.score).toBe(0.85);
    expect(result.lawId).toBe(100);
    expect(result.lawName).toBe('חוק לדוגמה');
    expect(result.sectionTitle).toBe('סעיף 1');
  });
});

describe('createCitationsFromChunks()', () => {
  it('should create citations from chunks', () => {
    const chunks: RetrievedChunk[] = [
      {
        chunkId: 'c1',
        content: 'content 1 that is quite long for excerpt testing purposes',
        score: 0.9,
        lawId: 100,
        lawItemId: 'l1',
        chunkIndex: 0,
        lawName: 'חוק 1',
        sectionTitle: 'סעיף 1',
        sectionType: 'סעיף',
        sectionNumber: '1',
      },
      {
        chunkId: 'c2',
        content: 'content 2',
        score: 0.8,
        lawId: 200,
        lawItemId: 'l2',
        chunkIndex: 0,
        lawName: 'חוק 2',
      },
    ];

    const citations = createCitationsFromChunks(chunks);

    expect(citations).toHaveLength(2);
    expect(citations[0]).toMatchObject({
      index: 1,
      lawName: 'חוק 1',
      lawId: 100,
      section: 'סעיף 1: סעיף 1',
      score: 0.9,
    });
    expect(citations[1]).toMatchObject({
      index: 2,
      lawName: 'חוק 2',
      lawId: 200,
    });
  });

  it('should deduplicate by lawId keeping highest score', () => {
    const chunks: RetrievedChunk[] = [
      {
        chunkId: 'c1',
        content: 'c1',
        score: 0.7,
        lawId: 100,
        lawItemId: 'l1',
        chunkIndex: 0,
        lawName: 'Law 100',
      },
      {
        chunkId: 'c2',
        content: 'c2',
        score: 0.9, // Higher score
        lawId: 100, // Same lawId
        lawItemId: 'l1',
        chunkIndex: 1,
        lawName: 'Law 100',
      },
      {
        chunkId: 'c3',
        content: 'c3',
        score: 0.8,
        lawId: 200,
        lawItemId: 'l2',
        chunkIndex: 0,
        lawName: 'Law 200',
      },
    ];

    const citations = createCitationsFromChunks(chunks);

    expect(citations).toHaveLength(2);
    // The citation for lawId 100 should have the higher score
    const law100Citation = citations.find((c) => c.lawId === 100);
    expect(law100Citation?.score).toBe(0.9);
  });

  it('should truncate long excerpts', () => {
    const longContent = 'א'.repeat(300);
    const chunks: RetrievedChunk[] = [
      {
        chunkId: 'c1',
        content: longContent,
        score: 0.9,
        lawId: 100,
        lawItemId: 'l1',
        chunkIndex: 0,
        lawName: 'Law',
      },
    ];

    const citations = createCitationsFromChunks(chunks);

    expect(citations[0]?.excerpt?.length).toBeLessThanOrEqual(203); // 200 + "..."
    expect(citations[0]?.excerpt?.endsWith('...')).toBe(true);
  });

  it('should handle missing lawName', () => {
    const chunks: RetrievedChunk[] = [
      {
        chunkId: 'c1',
        content: 'content',
        score: 0.9,
        lawId: 100,
        lawItemId: 'l1',
        chunkIndex: 0,
        // No lawName
      },
    ];

    const citations = createCitationsFromChunks(chunks);

    expect(citations[0]?.lawName).toBe('חוק 100');
  });

  it('should handle section number without title', () => {
    const chunks: RetrievedChunk[] = [
      {
        chunkId: 'c1',
        content: 'content',
        score: 0.9,
        lawId: 100,
        lawItemId: 'l1',
        chunkIndex: 0,
        lawName: 'Law',
        sectionNumber: '5',
        sectionType: 'סעיף',
        // No sectionTitle
      },
    ];

    const citations = createCitationsFromChunks(chunks);

    expect(citations[0]?.section).toBe('סעיף 5');
  });

  it('should return empty array for empty chunks', () => {
    const citations = createCitationsFromChunks([]);
    expect(citations).toEqual([]);
  });
});

describe('estimateTokenCount()', () => {
  it('should estimate tokens for Hebrew text', () => {
    const hebrewText = 'זהו טקסט בעברית לבדיקת מספר הטוקנים';
    const tokens = estimateTokenCount(hebrewText);

    // Hebrew should be ~2.5 chars per token
    const expectedApprox = Math.ceil(hebrewText.length / 2.5);
    expect(tokens).toBeGreaterThan(0);
    expect(Math.abs(tokens - expectedApprox)).toBeLessThan(expectedApprox * 0.5);
  });

  it('should estimate tokens for English text', () => {
    const englishText = 'This is some English text for testing token count';
    const tokens = estimateTokenCount(englishText);

    // English should be ~4 chars per token
    const expectedApprox = Math.ceil(englishText.length / 4);
    expect(tokens).toBeGreaterThan(0);
    expect(Math.abs(tokens - expectedApprox)).toBeLessThan(expectedApprox * 0.5);
  });

  it('should handle mixed Hebrew and English', () => {
    const mixedText = 'This is English and זהו טקסט בעברית';
    const tokens = estimateTokenCount(mixedText);

    expect(tokens).toBeGreaterThan(0);
  });

  it('should return 0 for empty text', () => {
    expect(estimateTokenCount('')).toBe(0);
  });
});

describe('createDefaultRAGServiceConfig()', () => {
  it('should create config with defaults', () => {
    const config = createDefaultRAGServiceConfig();

    expect(config.defaultTopK).toBe(5);
    expect(config.enableCache).toBe(false);
    expect(config.maxContextTokens).toBe(3000);
  });

  it('should accept overrides', () => {
    const config = createDefaultRAGServiceConfig({
      defaultTopK: 10,
      enableCache: true,
    });

    expect(config.defaultTopK).toBe(10);
    expect(config.enableCache).toBe(true);
    expect(config.maxContextTokens).toBe(3000); // default
  });
});

// =============================================================================
// Default Templates Tests
// =============================================================================

describe('Default Templates', () => {
  describe('DEFAULT_SYSTEM_PROMPT', () => {
    it('should be in Hebrew', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toContain('אתה');
      expect(DEFAULT_SYSTEM_PROMPT).toContain('עברית');
    });

    it('should include citation instructions', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toContain('מקורות');
    });

    it('should include anti-hallucination rules', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toContain('אל תמציא');
    });
  });

  describe('DEFAULT_USER_PROMPT_TEMPLATE', () => {
    it('should have query placeholder', () => {
      expect(DEFAULT_USER_PROMPT_TEMPLATE).toContain('{query}');
    });

    it('should have context placeholder', () => {
      expect(DEFAULT_USER_PROMPT_TEMPLATE).toContain('{context}');
    });
  });

  describe('DEFAULT_CONTEXT_CHUNK_FORMAT', () => {
    it('should have all required placeholders', () => {
      expect(DEFAULT_CONTEXT_CHUNK_FORMAT).toContain('{index}');
      expect(DEFAULT_CONTEXT_CHUNK_FORMAT).toContain('{lawName}');
      expect(DEFAULT_CONTEXT_CHUNK_FORMAT).toContain('{section}');
      expect(DEFAULT_CONTEXT_CHUNK_FORMAT).toContain('{content}');
    });
  });

  describe('DEFAULT_PROMPT_TEMPLATE', () => {
    it('should be valid PromptTemplate', () => {
      expect(() => PromptTemplateSchema.parse(DEFAULT_PROMPT_TEMPLATE)).not.toThrow();
    });

    it('should have all required fields', () => {
      expect(DEFAULT_PROMPT_TEMPLATE.systemPrompt).toBeDefined();
      expect(DEFAULT_PROMPT_TEMPLATE.userPromptTemplate).toBeDefined();
      expect(DEFAULT_PROMPT_TEMPLATE.contextChunkFormat).toBeDefined();
      expect(DEFAULT_PROMPT_TEMPLATE.contextSeparator).toBeDefined();
      expect(DEFAULT_PROMPT_TEMPLATE.maxContextChars).toBeDefined();
      expect(DEFAULT_PROMPT_TEMPLATE.includeCitationInstructions).toBeDefined();
    });
  });
});

// =============================================================================
// Cache Key Generation Tests (additional)
// =============================================================================

describe('generateCacheKey() additional tests', () => {
  it('should handle all filter options', () => {
    const input: RAGQueryInput = {
      query: 'test',
      topK: 5,
      filter: {
        lawId: 123,
        lawIds: [1, 2, 3],
        topicId: 'topic-1',
        topicIds: ['t1', 't2'],
        publicationDateMin: 1000,
        publicationDateMax: 2000,
      },
    };

    const key = generateCacheKey(input, { includeFilters: true });

    expect(key).toContain('lid:123');
    expect(key).toContain('lids:');
    expect(key).toContain('tid:topic-1');
    expect(key).toContain('tids:');
    expect(key).toContain('pmin:1000');
    expect(key).toContain('pmax:2000');
  });

  it('should handle empty filter object', () => {
    const input: RAGQueryInput = {
      query: 'test',
      topK: 5,
      filter: {},
    };

    const key = generateCacheKey(input, { includeFilters: true });

    // Should just have the query, no filter parts
    expect(key).toBe('test');
  });
});

// =============================================================================
// Response Cache Config/Stats Schema Tests
// =============================================================================

describe('ResponseCacheConfigSchema', () => {
  it('should provide defaults', () => {
    const result = ResponseCacheConfigSchema.parse({});

    expect(result.maxSize).toBe(100);
    expect(result.ttlMs).toBe(300000);
    expect(result.includeFiltersInKey).toBe(true);
    expect(result.includeTopKInKey).toBe(false);
  });
});

describe('ResponseCacheStatsSchema', () => {
  it('should validate valid stats', () => {
    const stats = {
      size: 50,
      maxSize: 100,
      hits: 200,
      misses: 50,
      hitRate: 0.8,
      evictions: 10,
      expirations: 5,
      createdAt: Date.now() - 3600000,
      lastAccessAt: Date.now(),
    };

    const result = ResponseCacheStatsSchema.parse(stats);

    expect(result.hitRate).toBe(0.8);
  });
});

describe('CachedResponseSchema', () => {
  it('should validate cached response entry', () => {
    const entry = {
      response: {
        answer: 'test answer',
        citations: [],
        retrievedChunks: [],
        metrics: {
          totalLatencyMs: 1000,
          embeddingLatencyMs: 50,
          retrievalLatencyMs: 100,
          generationLatencyMs: 800,
          chunksRetrieved: 3,
          chunksUsed: 2,
          tokenUsage: {
            inputTokens: 500,
            outputTokens: 100,
            totalTokens: 600,
          },
          embeddingCached: false,
        },
        model: 'claude-3',
        provider: 'anthropic',
        requestId: 'rag-123',
      },
      cachedAt: Date.now(),
      accessCount: 5,
      query: 'test query',
    };

    const result = CachedResponseSchema.parse(entry);

    expect(result.accessCount).toBe(5);
    expect(result.query).toBe('test query');
  });
});
