/**
 * Unit Tests for Embedding Cache Module
 *
 * Tests the caching infrastructure:
 * - LRUCache class (generic LRU implementation)
 * - EmbeddingCache class (specialized for embeddings)
 * - Cache factory functions
 * - Cache utility functions
 * - Persistent cache behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  // LRU Cache
  LRUCache,

  // Embedding Cache
  EmbeddingCache,
  type EmbeddingCacheConfig,
  EmbeddingCacheConfigSchema,
  type CacheStats,

  // Factory functions
  createEmbeddingCache,
  createQueryCache,
  createDocumentCache,
  createPersistentCache,

  // Global cache
  getGlobalCache,
  resetGlobalCache,

  // Utilities
  generateCacheKey,
  parseCacheKey,
  formatCacheStats,

  // Types
  type EmbeddingResult,
  EmbeddingType,
} from '../../lib/src/embeddings/index.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a mock embedding result for testing
 */
function createMockEmbeddingResult(
  text: string = 'test text',
  type: 'query' | 'passage' = 'passage'
): EmbeddingResult {
  return {
    embedding: new Array(1024).fill(0).map(() => Math.random()),
    dimensions: 1024,
    text,
    type,
    tokenCount: Math.ceil(text.length / 2.5),
    truncated: false,
    cached: false,
    durationMs: 10,
  };
}

// =============================================================================
// LRUCache Tests
// =============================================================================

describe('LRUCache', () => {
  describe('basic operations', () => {
    it('should set and get values', () => {
      const cache = new LRUCache<string>(10);

      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for missing keys', () => {
      const cache = new LRUCache<string>(10);
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check if key exists', () => {
      const cache = new LRUCache<string>(10);

      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('should delete keys', () => {
      const cache = new LRUCache<string>(10);

      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should clear all entries', () => {
      const cache = new LRUCache<string>(10);

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should track size correctly', () => {
      const cache = new LRUCache<string>(10);

      expect(cache.size).toBe(0);

      cache.set('key1', 'value1');
      expect(cache.size).toBe(1);

      cache.set('key2', 'value2');
      expect(cache.size).toBe(2);

      cache.delete('key1');
      expect(cache.size).toBe(1);
    });

    it('should update existing keys', () => {
      const cache = new LRUCache<string>(10);

      cache.set('key1', 'value1');
      cache.set('key1', 'updated');

      expect(cache.get('key1')).toBe('updated');
      expect(cache.size).toBe(1);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used when full', () => {
      const cache = new LRUCache<string>(3);

      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');
      cache.set('d', '4'); // Should evict 'a'

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe('2');
      expect(cache.get('c')).toBe('3');
      expect(cache.get('d')).toBe('4');
    });

    it('should update access order on get', () => {
      const cache = new LRUCache<string>(3);

      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');

      // Access 'a' to make it recently used
      cache.get('a');

      cache.set('d', '4'); // Should evict 'b' instead of 'a'

      expect(cache.get('a')).toBe('1');
      expect(cache.get('b')).toBeUndefined();
    });

    it('should update access order on set (update)', () => {
      const cache = new LRUCache<string>(3);

      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');

      // Update 'a'
      cache.set('a', 'updated');

      cache.set('d', '4'); // Should evict 'b'

      expect(cache.get('a')).toBe('updated');
      expect(cache.get('b')).toBeUndefined();
    });
  });

  describe('TTL expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should expire entries after TTL', () => {
      const cache = new LRUCache<string>(10, 1000); // 1 second TTL

      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      vi.advanceTimersByTime(500);
      expect(cache.get('key1')).toBe('value1'); // Not expired yet

      vi.advanceTimersByTime(600);
      expect(cache.get('key1')).toBeUndefined(); // Expired
    });

    it('should not expire entries when TTL is 0', () => {
      const cache = new LRUCache<string>(10, 0); // No expiration

      cache.set('key1', 'value1');

      vi.advanceTimersByTime(100000);
      expect(cache.get('key1')).toBe('value1');
    });

    it('should prune expired entries', () => {
      const cache = new LRUCache<string>(10, 1000);

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      vi.advanceTimersByTime(1500);

      const removed = cache.prune();
      expect(removed).toBe(2);
      expect(cache.size).toBe(0);
    });

    it('should check expiration in has()', () => {
      const cache = new LRUCache<string>(10, 1000);

      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);

      vi.advanceTimersByTime(1500);
      expect(cache.has('key1')).toBe(false);
    });
  });

  describe('iteration', () => {
    it('should iterate over keys', () => {
      const cache = new LRUCache<string>(10);

      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');

      const keys = Array.from(cache.keys());
      expect(keys).toContain('a');
      expect(keys).toContain('b');
      expect(keys).toContain('c');
    });

    it('should iterate over entries (skipping expired)', () => {
      vi.useFakeTimers();

      const cache = new LRUCache<string>(10, 1000);

      cache.set('a', '1');
      vi.advanceTimersByTime(500);
      cache.set('b', '2');
      vi.advanceTimersByTime(600); // 'a' is now expired

      const entries = Array.from(cache.entries());
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(['b', '2']);

      vi.useRealTimers();
    });
  });
});

// =============================================================================
// EmbeddingCache Tests
// =============================================================================

describe('EmbeddingCache', () => {
  afterEach(() => {
    resetGlobalCache();
  });

  describe('basic operations', () => {
    it('should set and get embedding results', () => {
      const cache = new EmbeddingCache({ maxSize: 100 });
      const result = createMockEmbeddingResult('test');

      cache.set('key1', result);
      const retrieved = cache.get('key1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.text).toBe('test');
    });

    it('should return undefined for missing keys', () => {
      const cache = new EmbeddingCache();
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check key existence', () => {
      const cache = new EmbeddingCache();
      const result = createMockEmbeddingResult();

      cache.set('key1', result);
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('should delete entries', () => {
      const cache = new EmbeddingCache();
      const result = createMockEmbeddingResult();

      cache.set('key1', result);
      expect(cache.delete('key1')).toBe(true);
      expect(cache.has('key1')).toBe(false);
    });

    it('should clear all entries and reset stats', () => {
      const cache = new EmbeddingCache();

      cache.set('key1', createMockEmbeddingResult());
      cache.set('key2', createMockEmbeddingResult());
      cache.get('key1');

      cache.clear();

      expect(cache.size).toBe(0);
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it('should track size correctly', () => {
      const cache = new EmbeddingCache();

      expect(cache.size).toBe(0);

      cache.set('key1', createMockEmbeddingResult());
      expect(cache.size).toBe(1);

      cache.set('key2', createMockEmbeddingResult());
      expect(cache.size).toBe(2);
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', () => {
      const cache = new EmbeddingCache();

      cache.set('key1', createMockEmbeddingResult());

      cache.get('key1'); // Hit
      cache.get('key1'); // Hit
      cache.get('key2'); // Miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    it('should calculate hit rate', () => {
      const cache = new EmbeddingCache();

      cache.set('key1', createMockEmbeddingResult());

      cache.get('key1'); // Hit
      cache.get('key1'); // Hit
      cache.get('key2'); // Miss
      cache.get('key3'); // Miss

      const stats = cache.getStats();
      expect(stats.hitRate).toBeCloseTo(0.5); // 2 hits / 4 total
    });

    it('should track evictions', () => {
      const cache = new EmbeddingCache({ maxSize: 2 });

      cache.set('key1', createMockEmbeddingResult());
      cache.set('key2', createMockEmbeddingResult());
      cache.set('key3', createMockEmbeddingResult()); // Evicts key1

      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
    });

    it('should track expirations', () => {
      vi.useFakeTimers();

      const cache = new EmbeddingCache({ ttlMs: 1000 });

      cache.set('key1', createMockEmbeddingResult());

      vi.advanceTimersByTime(1500);
      cache.get('key1'); // Triggers expiration

      const stats = cache.getStats();
      expect(stats.expirations).toBe(1);

      vi.useRealTimers();
    });

    it('should estimate memory usage', () => {
      const cache = new EmbeddingCache();

      cache.set('key1', createMockEmbeddingResult('short'));
      cache.set('key2', createMockEmbeddingResult('longer text here'));

      const stats = cache.getStats();
      expect(stats.memoryUsageBytes).toBeGreaterThan(0);
    });

    it('should track timestamps', () => {
      const cache = new EmbeddingCache();

      const beforeCreate = Date.now();
      cache.set('key1', createMockEmbeddingResult());
      cache.get('key1');
      const afterAccess = Date.now();

      const stats = cache.getStats();
      expect(stats.createdAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(stats.lastAccessAt).toBeLessThanOrEqual(afterAccess);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entries', () => {
      const cache = new EmbeddingCache({ maxSize: 2 });

      cache.set('key1', createMockEmbeddingResult('text1'));
      cache.set('key2', createMockEmbeddingResult('text2'));

      // Access key1 to make it recently used
      cache.get('key1');

      cache.set('key3', createMockEmbeddingResult('text3')); // Should evict key2

      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key3')).toBe(true);
    });
  });

  describe('TTL expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should expire entries after TTL', () => {
      const cache = new EmbeddingCache({ ttlMs: 1000 });

      cache.set('key1', createMockEmbeddingResult());

      vi.advanceTimersByTime(500);
      expect(cache.get('key1')).toBeDefined();

      vi.advanceTimersByTime(600);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should prune expired entries', () => {
      const cache = new EmbeddingCache({ ttlMs: 1000 });

      cache.set('key1', createMockEmbeddingResult());
      cache.set('key2', createMockEmbeddingResult());

      vi.advanceTimersByTime(1500);

      const pruned = cache.prune();
      expect(pruned).toBe(2);
    });
  });

  describe('update callbacks', () => {
    it('should call onUpdate for set operations', () => {
      const onUpdate = vi.fn();
      const cache = new EmbeddingCache({ onUpdate });

      cache.set('key1', createMockEmbeddingResult());

      expect(onUpdate).toHaveBeenCalledWith({
        type: 'set',
        key: 'key1',
        hit: undefined,
      });
    });

    it('should call onUpdate for get operations', () => {
      const onUpdate = vi.fn();
      const cache = new EmbeddingCache({ onUpdate });

      cache.set('key1', createMockEmbeddingResult());
      onUpdate.mockClear();

      cache.get('key1'); // Hit
      expect(onUpdate).toHaveBeenCalledWith({
        type: 'get',
        key: 'key1',
        hit: true,
      });

      cache.get('key2'); // Miss
      expect(onUpdate).toHaveBeenCalledWith({
        type: 'get',
        key: 'key2',
        hit: false,
      });
    });

    it('should call onUpdate for delete operations', () => {
      const onUpdate = vi.fn();
      const cache = new EmbeddingCache({ onUpdate });

      cache.set('key1', createMockEmbeddingResult());
      onUpdate.mockClear();

      cache.delete('key1');

      expect(onUpdate).toHaveBeenCalledWith({
        type: 'delete',
        key: 'key1',
        hit: undefined,
      });
    });

    it('should call onUpdate for evictions', () => {
      const onUpdate = vi.fn();
      const cache = new EmbeddingCache({ maxSize: 1, onUpdate });

      cache.set('key1', createMockEmbeddingResult());
      onUpdate.mockClear();

      cache.set('key2', createMockEmbeddingResult()); // Evicts key1

      expect(onUpdate).toHaveBeenCalledWith({
        type: 'evict',
        key: 'key1',
        hit: undefined,
      });
    });

    it('should call onUpdate for clear', () => {
      const onUpdate = vi.fn();
      const cache = new EmbeddingCache({ onUpdate });

      cache.set('key1', createMockEmbeddingResult());
      onUpdate.mockClear();

      cache.clear();

      expect(onUpdate).toHaveBeenCalledWith({
        type: 'clear',
        key: undefined,
        hit: undefined,
      });
    });
  });

  describe('export and import', () => {
    it('should export cache entries', () => {
      const cache = new EmbeddingCache();

      cache.set('key1', createMockEmbeddingResult('text1'));
      cache.set('key2', createMockEmbeddingResult('text2'));

      // Access key1 multiple times
      cache.get('key1');
      cache.get('key1');

      const exported = cache.export();

      expect(exported).toHaveLength(2);
      expect(exported.find((e) => e.key === 'key1')?.accessCount).toBe(3); // 1 initial + 2 gets
      expect(exported.find((e) => e.key === 'key2')?.accessCount).toBe(1);
    });

    it('should import cache entries', () => {
      const cache = new EmbeddingCache();

      const entries = [
        { key: 'key1', result: createMockEmbeddingResult('text1') },
        { key: 'key2', result: createMockEmbeddingResult('text2') },
      ];

      const imported = cache.import(entries);

      expect(imported).toBe(2);
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(true);
    });

    it('should respect maxSize during import', () => {
      const cache = new EmbeddingCache({ maxSize: 2 });

      cache.set('existing', createMockEmbeddingResult());

      const entries = [
        { key: 'key1', result: createMockEmbeddingResult('text1') },
        { key: 'key2', result: createMockEmbeddingResult('text2') },
      ];

      const imported = cache.import(entries);

      // Should only import entries that fit
      expect(imported).toBeLessThanOrEqual(2);
    });
  });

  describe('prefix filtering', () => {
    it('should find keys with prefix', () => {
      const cache = new EmbeddingCache();

      cache.set('query:test1', createMockEmbeddingResult());
      cache.set('query:test2', createMockEmbeddingResult());
      cache.set('passage:doc1', createMockEmbeddingResult());

      const queryKeys = cache.keysWithPrefix('query:');
      expect(queryKeys).toHaveLength(2);
      expect(queryKeys).toContain('query:test1');
      expect(queryKeys).toContain('query:test2');
    });
  });
});

// =============================================================================
// EmbeddingCacheConfig Schema Tests
// =============================================================================

describe('EmbeddingCacheConfigSchema', () => {
  it('should apply default values', () => {
    const result = EmbeddingCacheConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxSize).toBe(10000);
      expect(result.data.ttlMs).toBe(0);
      expect(result.data.persistent).toBe(false);
      expect(result.data.cachePath).toBe('.embedding-cache.json');
      expect(result.data.persistIntervalMs).toBe(60000);
      expect(result.data.compress).toBe(false);
    }
  });

  it('should accept custom values', () => {
    const result = EmbeddingCacheConfigSchema.safeParse({
      maxSize: 5000,
      ttlMs: 3600000,
      persistent: true,
      cachePath: '/custom/path.json',
      persistIntervalMs: 30000,
      compress: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxSize).toBe(5000);
      expect(result.data.ttlMs).toBe(3600000);
      expect(result.data.persistent).toBe(true);
      expect(result.data.cachePath).toBe('/custom/path.json');
    }
  });

  it('should reject invalid values', () => {
    expect(
      EmbeddingCacheConfigSchema.safeParse({ maxSize: 0 }).success
    ).toBe(false);
    expect(
      EmbeddingCacheConfigSchema.safeParse({ maxSize: -1 }).success
    ).toBe(false);
    expect(
      EmbeddingCacheConfigSchema.safeParse({ ttlMs: -1 }).success
    ).toBe(false);
  });
});

// =============================================================================
// Factory Functions Tests
// =============================================================================

describe('createEmbeddingCache()', () => {
  it('should create cache with default config', () => {
    const cache = createEmbeddingCache();
    expect(cache).toBeInstanceOf(EmbeddingCache);
  });

  it('should accept custom config', () => {
    const cache = createEmbeddingCache({ maxSize: 500 });
    const stats = cache.getStats();
    expect(stats.maxSize).toBe(500);
  });
});

describe('createQueryCache()', () => {
  it('should create cache optimized for queries', () => {
    const cache = createQueryCache();
    const stats = cache.getStats();

    expect(stats.maxSize).toBe(1000); // Smaller for queries
  });
});

describe('createDocumentCache()', () => {
  it('should create cache optimized for documents', () => {
    const cache = createDocumentCache();
    const stats = cache.getStats();

    expect(stats.maxSize).toBe(50000); // Larger for documents
  });
});

describe('createPersistentCache()', () => {
  const testCachePath = '/tmp/test-embedding-cache.json';

  afterEach(() => {
    // Clean up test file
    try {
      if (fs.existsSync(testCachePath)) {
        fs.unlinkSync(testCachePath);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should create persistent cache', () => {
    const cache = createPersistentCache(testCachePath);
    expect(cache).toBeInstanceOf(EmbeddingCache);

    // Dispose to trigger save
    cache.dispose();
  });
});

// =============================================================================
// Global Cache Tests
// =============================================================================

describe('getGlobalCache() and resetGlobalCache()', () => {
  afterEach(() => {
    resetGlobalCache();
  });

  it('should return the same instance', () => {
    const cache1 = getGlobalCache();
    const cache2 = getGlobalCache();
    expect(cache1).toBe(cache2);
  });

  it('should create new instance after reset', () => {
    const cache1 = getGlobalCache();
    resetGlobalCache();
    const cache2 = getGlobalCache();
    expect(cache1).not.toBe(cache2);
  });

  it('should accept config on first call', () => {
    const cache = getGlobalCache({ maxSize: 500 });
    const stats = cache.getStats();
    expect(stats.maxSize).toBe(500);
  });
});

// =============================================================================
// Utility Functions Tests
// =============================================================================

describe('generateCacheKey()', () => {
  it('should generate key with type and text', () => {
    const key = generateCacheKey('query', 'test text');
    expect(key).toBe('query:test text');
  });

  it('should handle empty text', () => {
    const key = generateCacheKey('passage', '');
    expect(key).toBe('passage:');
  });

  it('should preserve Hebrew text', () => {
    const key = generateCacheKey('query', 'מהו חוק חופש המידע?');
    expect(key).toBe('query:מהו חוק חופש המידע?');
  });

  it('should handle text with colons', () => {
    const key = generateCacheKey('query', 'time: 10:30');
    expect(key).toBe('query:time: 10:30');
  });
});

describe('parseCacheKey()', () => {
  it('should parse valid cache key', () => {
    const result = parseCacheKey('query:test text');
    expect(result).toEqual({ type: 'query', text: 'test text' });
  });

  it('should handle text with colons', () => {
    const result = parseCacheKey('passage:time: 10:30');
    expect(result).toEqual({ type: 'passage', text: 'time: 10:30' });
  });

  it('should return null for invalid key', () => {
    const result = parseCacheKey('invalid-no-colon');
    expect(result).toBeNull();
  });

  it('should handle empty text', () => {
    const result = parseCacheKey('query:');
    expect(result).toEqual({ type: 'query', text: '' });
  });
});

describe('formatCacheStats()', () => {
  it('should format cache statistics', () => {
    const stats: CacheStats = {
      size: 100,
      maxSize: 1000,
      hits: 80,
      misses: 20,
      hitRate: 0.8,
      evictions: 5,
      expirations: 2,
      memoryUsageBytes: 1024 * 1024,
      createdAt: Date.now() - 3600000,
      lastAccessAt: Date.now(),
    };

    const formatted = formatCacheStats(stats);

    expect(formatted).toContain('100 / 1000 entries');
    expect(formatted).toContain('80.00%');
    expect(formatted).toContain('80 hits');
    expect(formatted).toContain('20 misses');
    expect(formatted).toContain('Evictions: 5');
    expect(formatted).toContain('Expirations: 2');
    expect(formatted).toContain('1.00 MB');
  });

  it('should handle zero hit rate', () => {
    const stats: CacheStats = {
      size: 0,
      maxSize: 1000,
      hits: 0,
      misses: 0,
      hitRate: 0,
      evictions: 0,
      expirations: 0,
      memoryUsageBytes: 0,
      createdAt: Date.now(),
      lastAccessAt: Date.now(),
    };

    const formatted = formatCacheStats(stats);

    expect(formatted).toContain('0.00%');
    expect(formatted).toContain('0 hits');
  });
});

// =============================================================================
// Persistent Cache Tests (Integration)
// =============================================================================

describe('Persistent Cache', () => {
  const testCachePath = '/tmp/test-persistent-cache.json';

  afterEach(() => {
    try {
      if (fs.existsSync(testCachePath)) {
        fs.unlinkSync(testCachePath);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should save cache to disk on dispose', () => {
    const cache = new EmbeddingCache({
      persistent: true,
      cachePath: testCachePath,
    });

    cache.set('key1', createMockEmbeddingResult('test'));
    cache.dispose();

    expect(fs.existsSync(testCachePath)).toBe(true);
  });

  it('should load cache from disk on creation', () => {
    // Create and populate cache
    const cache1 = new EmbeddingCache({
      persistent: true,
      cachePath: testCachePath,
    });

    cache1.set('key1', createMockEmbeddingResult('test'));
    cache1.dispose();

    // Create new cache and check if data is loaded
    const cache2 = new EmbeddingCache({
      persistent: true,
      cachePath: testCachePath,
    });

    expect(cache2.has('key1')).toBe(true);
    expect(cache2.get('key1')?.text).toBe('test');

    cache2.dispose();
  });

  it('should skip expired entries when loading', () => {
    vi.useFakeTimers();

    // Create cache with short TTL
    const cache1 = new EmbeddingCache({
      persistent: true,
      cachePath: testCachePath,
      ttlMs: 1000,
    });

    cache1.set('key1', createMockEmbeddingResult('test'));
    cache1.dispose();

    // Advance time past TTL
    vi.advanceTimersByTime(2000);

    // Create new cache - expired entry should not be loaded
    const cache2 = new EmbeddingCache({
      persistent: true,
      cachePath: testCachePath,
      ttlMs: 1000,
    });

    expect(cache2.has('key1')).toBe(false);

    cache2.dispose();
    vi.useRealTimers();
  });
});
