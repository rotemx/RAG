/**
 * Unit Tests for ResponseCache
 *
 * Tests the response caching functionality:
 * - LRU eviction policy
 * - TTL expiration
 * - Cache key generation
 * - Import/export functionality
 * - Statistics tracking
 * - Factory functions and global instance
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ResponseCache,
  createResponseCache,
  getGlobalResponseCache,
  resetGlobalResponseCache,
  generateCacheKey,
  formatResponseCacheStats,
  type RAGQueryInput,
  type RAGResponse,
  type ResponseCacheConfig,
  type ResponseCacheStats,
} from '../../lib/src/rag/index.js';

// =============================================================================
// Mock Data
// =============================================================================

/**
 * Create a mock RAG query input
 */
function createMockInput(overrides?: Partial<RAGQueryInput>): RAGQueryInput {
  return {
    query: 'מהו חוק חופש המידע?',
    topK: 5,
    ...overrides,
  };
}

/**
 * Create a mock RAG response
 */
function createMockResponse(overrides?: Partial<RAGResponse>): RAGResponse {
  return {
    answer: 'תשובה לדוגמה',
    citations: [
      {
        index: 1,
        lawName: 'חוק לדוגמה',
        lawId: 100,
        section: 'סעיף 1',
        excerpt: 'קטע לדוגמה',
        score: 0.9,
      },
    ],
    retrievedChunks: [
      {
        chunkId: 'chunk-1',
        content: 'תוכן לדוגמה',
        score: 0.9,
        lawId: 100,
        lawItemId: 'law-1',
        chunkIndex: 0,
        lawName: 'חוק לדוגמה',
      },
    ],
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
    model: 'claude-3-sonnet',
    provider: 'anthropic',
    requestId: 'rag-123',
    ...overrides,
  };
}

// =============================================================================
// Test Cleanup
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  resetGlobalResponseCache();
});

afterEach(() => {
  vi.useRealTimers();
  resetGlobalResponseCache();
});

// =============================================================================
// Constructor Tests
// =============================================================================

describe('ResponseCache constructor', () => {
  it('should create cache with default configuration', () => {
    const cache = new ResponseCache();

    expect(cache.size).toBe(0);
    const stats = cache.getStats();
    expect(stats.maxSize).toBe(100);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });

  it('should accept custom configuration', () => {
    const cache = new ResponseCache({
      maxSize: 50,
      ttlMs: 60000,
    });

    const stats = cache.getStats();
    expect(stats.maxSize).toBe(50);
  });

  it('should accept onUpdate callback', () => {
    const onUpdate = vi.fn();
    const cache = new ResponseCache({ onUpdate });

    cache.get(createMockInput());
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'miss' })
    );
  });
});

// =============================================================================
// Get/Set Tests
// =============================================================================

describe('ResponseCache get/set', () => {
  it('should store and retrieve response', () => {
    const cache = new ResponseCache();
    const input = createMockInput();
    const response = createMockResponse();

    cache.set(input, response);
    const retrieved = cache.get(input);

    expect(retrieved).toBeDefined();
    expect(retrieved?.answer).toBe(response.answer);
  });

  it('should return undefined for missing entry', () => {
    const cache = new ResponseCache();
    const input = createMockInput();

    const result = cache.get(input);
    expect(result).toBeUndefined();
  });

  it('should return copy of cached response', () => {
    const cache = new ResponseCache();
    const input = createMockInput();
    const response = createMockResponse();

    cache.set(input, response);
    const retrieved = cache.get(input);

    expect(retrieved).not.toBe(response);
    expect(retrieved?.answer).toBe(response.answer);
  });

  it('should update access count on get', () => {
    const cache = new ResponseCache();
    const input = createMockInput();
    const response = createMockResponse();

    cache.set(input, response);
    cache.get(input);
    cache.get(input);

    const queries = cache.getCachedQueries();
    expect(queries[0]?.accessCount).toBe(3); // 1 from set + 2 from gets
  });

  it('should track cache hits and misses', () => {
    const cache = new ResponseCache();
    const input = createMockInput();
    const response = createMockResponse();

    cache.get(input); // Miss
    cache.get(input); // Miss
    cache.set(input, response);
    cache.get(input); // Hit
    cache.get(input); // Hit

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(2);
    expect(stats.hitRate).toBe(0.5);
  });
});

// =============================================================================
// LRU Eviction Tests
// =============================================================================

describe('ResponseCache LRU eviction', () => {
  it('should evict least recently used when full', () => {
    const cache = new ResponseCache({ maxSize: 3 });

    cache.set(createMockInput({ query: 'query 1' }), createMockResponse());
    cache.set(createMockInput({ query: 'query 2' }), createMockResponse());
    cache.set(createMockInput({ query: 'query 3' }), createMockResponse());

    expect(cache.size).toBe(3);

    // Add new entry, should evict query 1
    cache.set(createMockInput({ query: 'query 4' }), createMockResponse());

    expect(cache.size).toBe(3);
    expect(cache.has(createMockInput({ query: 'query 1' }))).toBe(false);
    expect(cache.has(createMockInput({ query: 'query 4' }))).toBe(true);
  });

  it('should move accessed item to end', () => {
    const cache = new ResponseCache({ maxSize: 3 });

    cache.set(createMockInput({ query: 'query 1' }), createMockResponse());
    cache.set(createMockInput({ query: 'query 2' }), createMockResponse());
    cache.set(createMockInput({ query: 'query 3' }), createMockResponse());

    // Access query 1, moving it to end
    cache.get(createMockInput({ query: 'query 1' }));

    // Add new entry, should evict query 2 (now oldest)
    cache.set(createMockInput({ query: 'query 4' }), createMockResponse());

    expect(cache.has(createMockInput({ query: 'query 1' }))).toBe(true);
    expect(cache.has(createMockInput({ query: 'query 2' }))).toBe(false);
  });

  it('should track evictions in stats', () => {
    const cache = new ResponseCache({ maxSize: 2 });

    cache.set(createMockInput({ query: 'q1' }), createMockResponse());
    cache.set(createMockInput({ query: 'q2' }), createMockResponse());
    cache.set(createMockInput({ query: 'q3' }), createMockResponse()); // Evicts q1
    cache.set(createMockInput({ query: 'q4' }), createMockResponse()); // Evicts q2

    const stats = cache.getStats();
    expect(stats.evictions).toBe(2);
  });

  it('should notify on eviction', () => {
    const onUpdate = vi.fn();
    const cache = new ResponseCache({ maxSize: 2, onUpdate });

    cache.set(createMockInput({ query: 'q1' }), createMockResponse());
    cache.set(createMockInput({ query: 'q2' }), createMockResponse());
    cache.set(createMockInput({ query: 'q3' }), createMockResponse());

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'evict' })
    );
  });
});

// =============================================================================
// TTL Expiration Tests
// =============================================================================

describe('ResponseCache TTL expiration', () => {
  it('should expire entries after TTL', () => {
    vi.useFakeTimers();

    const cache = new ResponseCache({ ttlMs: 1000 });
    const input = createMockInput();
    const response = createMockResponse();

    cache.set(input, response);
    expect(cache.get(input)).toBeDefined();

    vi.advanceTimersByTime(1500);

    expect(cache.get(input)).toBeUndefined();
  });

  it('should track expirations in stats', () => {
    vi.useFakeTimers();

    const cache = new ResponseCache({ ttlMs: 1000 });
    cache.set(createMockInput(), createMockResponse());

    vi.advanceTimersByTime(1500);
    cache.get(createMockInput()); // Triggers expiration

    const stats = cache.getStats();
    expect(stats.expirations).toBe(1);
  });

  it('should prune expired entries', () => {
    vi.useFakeTimers();

    const cache = new ResponseCache({ ttlMs: 1000 });
    cache.set(createMockInput({ query: 'q1' }), createMockResponse());
    cache.set(createMockInput({ query: 'q2' }), createMockResponse());

    expect(cache.size).toBe(2);

    vi.advanceTimersByTime(1500);

    const pruned = cache.prune();
    expect(pruned).toBe(2);
    expect(cache.size).toBe(0);
  });

  it('should not expire with TTL of 0 (disabled)', () => {
    vi.useFakeTimers();

    const cache = new ResponseCache({ ttlMs: -1 });
    const input = createMockInput();
    cache.set(input, createMockResponse());

    vi.advanceTimersByTime(1000000);

    expect(cache.get(input)).toBeDefined();
  });
});

// =============================================================================
// Has/Delete/Clear Tests
// =============================================================================

describe('ResponseCache has/delete/clear', () => {
  it('should check if entry exists', () => {
    const cache = new ResponseCache();
    const input = createMockInput();

    expect(cache.has(input)).toBe(false);

    cache.set(input, createMockResponse());
    expect(cache.has(input)).toBe(true);
  });

  it('should return false for expired entry in has()', () => {
    vi.useFakeTimers();

    const cache = new ResponseCache({ ttlMs: 1000 });
    const input = createMockInput();

    cache.set(input, createMockResponse());
    expect(cache.has(input)).toBe(true);

    vi.advanceTimersByTime(1500);
    expect(cache.has(input)).toBe(false);
  });

  it('should delete specific entry', () => {
    const cache = new ResponseCache();
    const input = createMockInput();

    cache.set(input, createMockResponse());
    expect(cache.has(input)).toBe(true);

    const deleted = cache.delete(input);
    expect(deleted).toBe(true);
    expect(cache.has(input)).toBe(false);
  });

  it('should return false when deleting non-existent entry', () => {
    const cache = new ResponseCache();
    const deleted = cache.delete(createMockInput());
    expect(deleted).toBe(false);
  });

  it('should clear all entries', () => {
    const cache = new ResponseCache();

    cache.set(createMockInput({ query: 'q1' }), createMockResponse());
    cache.set(createMockInput({ query: 'q2' }), createMockResponse());
    cache.set(createMockInput({ query: 'q3' }), createMockResponse());

    expect(cache.size).toBe(3);

    cache.clear();

    expect(cache.size).toBe(0);
    const stats = cache.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });

  it('should notify on clear', () => {
    const onUpdate = vi.fn();
    const cache = new ResponseCache({ onUpdate });

    cache.set(createMockInput(), createMockResponse());
    cache.clear();

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'clear' })
    );
  });
});

// =============================================================================
// Statistics Tests
// =============================================================================

describe('ResponseCache statistics', () => {
  it('should calculate hit rate correctly', () => {
    const cache = new ResponseCache();
    const input = createMockInput();

    cache.get(input); // Miss
    cache.set(input, createMockResponse());
    cache.get(input); // Hit
    cache.get(input); // Hit
    cache.get(input); // Hit

    const stats = cache.getStats();
    expect(stats.hitRate).toBe(0.75); // 3 hits / 4 total
  });

  it('should return 0 hit rate with no requests', () => {
    const cache = new ResponseCache();
    const stats = cache.getStats();
    expect(stats.hitRate).toBe(0);
  });

  it('should track timestamps', () => {
    const cache = new ResponseCache();
    const stats = cache.getStats();

    expect(stats.createdAt).toBeGreaterThan(0);
    expect(stats.lastAccessAt).toBeGreaterThan(0);
  });

  it('should update lastAccessAt on operations', () => {
    vi.useFakeTimers({ now: 1000 });

    const cache = new ResponseCache();
    const initialStats = cache.getStats();

    vi.advanceTimersByTime(1000);
    cache.get(createMockInput());
    const afterGetStats = cache.getStats();

    expect(afterGetStats.lastAccessAt).toBeGreaterThan(initialStats.lastAccessAt);
  });
});

// =============================================================================
// Cached Queries Tests
// =============================================================================

describe('ResponseCache getCachedQueries()', () => {
  it('should return list of cached queries', () => {
    const cache = new ResponseCache();

    cache.set(createMockInput({ query: 'query 1' }), createMockResponse());
    cache.set(createMockInput({ query: 'query 2' }), createMockResponse());

    const queries = cache.getCachedQueries();

    expect(queries).toHaveLength(2);
    expect(queries.some((q) => q.query === 'query 1')).toBe(true);
    expect(queries.some((q) => q.query === 'query 2')).toBe(true);
  });

  it('should sort by access count descending', () => {
    const cache = new ResponseCache();

    cache.set(createMockInput({ query: 'query 1' }), createMockResponse());
    cache.set(createMockInput({ query: 'query 2' }), createMockResponse());
    cache.get(createMockInput({ query: 'query 1' }));
    cache.get(createMockInput({ query: 'query 1' }));

    const queries = cache.getCachedQueries();

    expect(queries[0]?.query).toBe('query 1');
    expect(queries[0]?.accessCount).toBeGreaterThan(queries[1]?.accessCount ?? 0);
  });

  it('should exclude expired entries', () => {
    vi.useFakeTimers();

    const cache = new ResponseCache({ ttlMs: 1000 });
    cache.set(createMockInput({ query: 'query 1' }), createMockResponse());

    vi.advanceTimersByTime(1500);
    cache.set(createMockInput({ query: 'query 2' }), createMockResponse());

    const queries = cache.getCachedQueries();

    expect(queries).toHaveLength(1);
    expect(queries[0]?.query).toBe('query 2');
  });
});

// =============================================================================
// Export/Import Tests
// =============================================================================

describe('ResponseCache export/import', () => {
  it('should export cache entries', () => {
    const cache = new ResponseCache();

    cache.set(createMockInput({ query: 'q1' }), createMockResponse());
    cache.set(createMockInput({ query: 'q2' }), createMockResponse());

    const exported = cache.export();

    expect(exported).toHaveLength(2);
    expect(exported[0]).toMatchObject({
      response: expect.any(Object),
      cachedAt: expect.any(Number),
      accessCount: expect.any(Number),
      query: expect.any(String),
    });
  });

  it('should exclude expired entries from export', () => {
    vi.useFakeTimers();

    const cache = new ResponseCache({ ttlMs: 1000 });
    cache.set(createMockInput({ query: 'q1' }), createMockResponse());

    vi.advanceTimersByTime(1500);
    cache.set(createMockInput({ query: 'q2' }), createMockResponse());

    const exported = cache.export();

    expect(exported).toHaveLength(1);
    expect(exported[0]?.query).toBe('q2');
  });

  it('should import cache entries', () => {
    const cache1 = new ResponseCache();
    cache1.set(createMockInput({ query: 'q1' }), createMockResponse());
    cache1.set(createMockInput({ query: 'q2' }), createMockResponse());

    const exported = cache1.export();

    const cache2 = new ResponseCache();
    const imported = cache2.import(exported);

    expect(imported).toBe(2);
    expect(cache2.size).toBe(2);
  });

  it('should preserve timestamps on import', () => {
    const cache1 = new ResponseCache();
    cache1.set(createMockInput({ query: 'q1' }), createMockResponse());

    const exported = cache1.export();
    const originalCachedAt = exported[0]!.cachedAt;

    const cache2 = new ResponseCache();
    cache2.import(exported, true);

    const queries = cache2.getCachedQueries();
    expect(queries[0]?.cachedAt).toBe(originalCachedAt);
  });

  it('should update timestamps on import when requested', () => {
    vi.useFakeTimers({ now: 1000 });

    const cache1 = new ResponseCache();
    cache1.set(createMockInput({ query: 'q1' }), createMockResponse());

    const exported = cache1.export();

    vi.advanceTimersByTime(5000);

    const cache2 = new ResponseCache();
    cache2.import(exported, false);

    const queries = cache2.getCachedQueries();
    expect(queries[0]?.cachedAt).toBe(6000);
  });

  it('should skip expired entries on import', () => {
    vi.useFakeTimers();

    const cache1 = new ResponseCache({ ttlMs: 1000 });
    cache1.set(createMockInput({ query: 'q1' }), createMockResponse());

    const exported = cache1.export();

    vi.advanceTimersByTime(2000);

    const cache2 = new ResponseCache({ ttlMs: 1000 });
    const imported = cache2.import(exported, true);

    expect(imported).toBe(0);
  });

  it('should respect max size on import', () => {
    const cache1 = new ResponseCache();
    cache1.set(createMockInput({ query: 'q1' }), createMockResponse());
    cache1.set(createMockInput({ query: 'q2' }), createMockResponse());
    cache1.set(createMockInput({ query: 'q3' }), createMockResponse());

    const exported = cache1.export();

    const cache2 = new ResponseCache({ maxSize: 2 });
    const imported = cache2.import(exported);

    expect(imported).toBe(2);
    expect(cache2.size).toBe(2);
  });
});

// =============================================================================
// Cache Key Generation Tests
// =============================================================================

describe('generateCacheKey()', () => {
  it('should generate key from query', () => {
    const key = generateCacheKey({ query: 'test query', topK: 5 });

    expect(key).toContain('test query');
  });

  it('should normalize query (lowercase, trim, collapse whitespace)', () => {
    const key1 = generateCacheKey({ query: '  Test  QUERY  ', topK: 5 });
    const key2 = generateCacheKey({ query: 'test query', topK: 5 });

    expect(key1).toBe(key2);
  });

  it('should include filters when configured', () => {
    const key = generateCacheKey(
      {
        query: 'test',
        topK: 5,
        filter: { lawId: 123, topicId: 'criminal-law' },
      },
      { includeFilters: true }
    );

    expect(key).toContain('lid:123');
    expect(key).toContain('tid:criminal-law');
  });

  it('should exclude filters when configured', () => {
    const key = generateCacheKey(
      {
        query: 'test',
        topK: 5,
        filter: { lawId: 123 },
      },
      { includeFilters: false }
    );

    expect(key).not.toContain('lid:');
  });

  it('should include topK when configured', () => {
    const key = generateCacheKey(
      { query: 'test', topK: 10 },
      { includeTopK: true }
    );

    expect(key).toContain('k:10');
  });

  it('should exclude topK when configured', () => {
    const key = generateCacheKey(
      { query: 'test', topK: 10 },
      { includeTopK: false }
    );

    expect(key).not.toContain('k:');
  });

  it('should generate consistent keys for same input', () => {
    const input: RAGQueryInput = {
      query: 'test query',
      topK: 5,
      filter: { lawId: 123 },
    };

    const key1 = generateCacheKey(input);
    const key2 = generateCacheKey(input);

    expect(key1).toBe(key2);
  });

  it('should generate different keys for different queries', () => {
    const key1 = generateCacheKey({ query: 'query 1', topK: 5 });
    const key2 = generateCacheKey({ query: 'query 2', topK: 5 });

    expect(key1).not.toBe(key2);
  });

  it('should sort filter arrays for consistent keys', () => {
    const key1 = generateCacheKey({
      query: 'test',
      topK: 5,
      filter: { lawIds: [1, 2, 3] },
    });

    const key2 = generateCacheKey({
      query: 'test',
      topK: 5,
      filter: { lawIds: [3, 1, 2] },
    });

    expect(key1).toBe(key2);
  });
});

// =============================================================================
// Format Stats Tests
// =============================================================================

describe('formatResponseCacheStats()', () => {
  it('should format stats as readable string', () => {
    const stats: ResponseCacheStats = {
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

    const formatted = formatResponseCacheStats(stats);

    expect(formatted).toContain('50/100');
    expect(formatted).toContain('Hits: 200');
    expect(formatted).toContain('Misses: 50');
    expect(formatted).toContain('80.0%');
    expect(formatted).toContain('Evictions: 10');
    expect(formatted).toContain('Expirations: 5');
  });
});

// =============================================================================
// Factory Functions Tests
// =============================================================================

describe('createResponseCache()', () => {
  it('should create cache with default config', () => {
    const cache = createResponseCache();

    expect(cache).toBeInstanceOf(ResponseCache);
    expect(cache.getStats().maxSize).toBe(100);
  });

  it('should accept custom config', () => {
    const cache = createResponseCache({ maxSize: 50 });

    expect(cache.getStats().maxSize).toBe(50);
  });
});

describe('getGlobalResponseCache()', () => {
  it('should return same instance', () => {
    const cache1 = getGlobalResponseCache();
    const cache2 = getGlobalResponseCache();

    expect(cache1).toBe(cache2);
  });

  it('should accept config on first call', () => {
    const cache = getGlobalResponseCache({ maxSize: 25 });

    expect(cache.getStats().maxSize).toBe(25);
  });

  it('should ignore config on subsequent calls', () => {
    getGlobalResponseCache({ maxSize: 25 });
    const cache = getGlobalResponseCache({ maxSize: 50 });

    expect(cache.getStats().maxSize).toBe(25);
  });
});

describe('resetGlobalResponseCache()', () => {
  it('should clear and reset global cache', () => {
    const cache1 = getGlobalResponseCache({ maxSize: 25 });
    cache1.set(createMockInput(), createMockResponse());

    resetGlobalResponseCache();

    const cache2 = getGlobalResponseCache({ maxSize: 50 });

    expect(cache2).not.toBe(cache1);
    expect(cache2.size).toBe(0);
    expect(cache2.getStats().maxSize).toBe(50);
  });
});

// =============================================================================
// Update Callback Tests
// =============================================================================

describe('ResponseCache onUpdate callback', () => {
  it('should call on cache miss', () => {
    const onUpdate = vi.fn();
    const cache = new ResponseCache({ onUpdate });

    cache.get(createMockInput({ query: 'test' }));

    expect(onUpdate).toHaveBeenCalledWith({
      type: 'miss',
      key: expect.any(String),
      query: 'test',
    });
  });

  it('should call on cache hit', () => {
    const onUpdate = vi.fn();
    const cache = new ResponseCache({ onUpdate });
    const input = createMockInput({ query: 'test' });

    cache.set(input, createMockResponse());
    onUpdate.mockClear();

    cache.get(input);

    expect(onUpdate).toHaveBeenCalledWith({
      type: 'hit',
      key: expect.any(String),
      query: 'test',
    });
  });

  it('should call on cache set', () => {
    const onUpdate = vi.fn();
    const cache = new ResponseCache({ onUpdate });

    cache.set(createMockInput({ query: 'test' }), createMockResponse());

    expect(onUpdate).toHaveBeenCalledWith({
      type: 'set',
      key: expect.any(String),
      query: 'test',
    });
  });

  it('should call on expiration', () => {
    vi.useFakeTimers();

    const onUpdate = vi.fn();
    const cache = new ResponseCache({ onUpdate, ttlMs: 1000 });
    const input = createMockInput({ query: 'test' });

    cache.set(input, createMockResponse());
    onUpdate.mockClear();

    vi.advanceTimersByTime(1500);
    cache.get(input);

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'expire' })
    );
  });
});
