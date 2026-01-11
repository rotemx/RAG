/**
 * Unit Tests for E5Embedder Class
 *
 * Tests the main embedding generator class:
 * - E5Embedder construction and configuration
 * - Initialization and model loading
 * - embedQuery() and embedDocument() methods
 * - embedBatch() for bulk processing
 * - Cache management
 * - Factory functions
 * - Global instance management
 *
 * Note: These tests mock the @xenova/transformers pipeline to avoid
 * actually loading the model during tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  // E5Embedder class and types
  E5Embedder,
  type E5EmbedderWithCacheConfig,

  // Factory functions
  createE5Embedder,
  createQueryEmbedder,
  createDocumentEmbedder,
  createPersistentEmbedder,

  // Global instance
  getGlobalEmbedder,
  resetGlobalEmbedder,

  // Types and constants
  EmbeddingModel,
  EmbeddingType,
  EmbeddingError,
  EmbeddingErrorCode,
  DEFAULT_EMBEDDING_MODEL,
  MODEL_DIMENSIONS,
} from '../../lib/src/embeddings/index.js';

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
 * Mock the @xenova/transformers module
 */
const mockPipeline = vi.fn();
const mockEnv = {
  allowLocalModels: true,
  useBrowserCache: true,
};

vi.mock('@xenova/transformers', () => ({
  pipeline: (...args: unknown[]) => mockPipeline(...args),
  env: mockEnv,
}));

// =============================================================================
// Test Setup
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  resetGlobalEmbedder();

  // Default mock implementation
  mockPipeline.mockResolvedValue(
    vi.fn().mockImplementation((texts: string | string[]) => {
      const textArray = Array.isArray(texts) ? texts : [texts];
      if (textArray.length === 1) {
        return Promise.resolve({ data: new Float32Array(createMockEmbedding()) });
      }
      return Promise.resolve(
        textArray.map(() => ({ data: new Float32Array(createMockEmbedding()) }))
      );
    })
  );
});

afterEach(() => {
  resetGlobalEmbedder();
});

// =============================================================================
// Constructor Tests
// =============================================================================

describe('E5Embedder constructor', () => {
  it('should create embedder with default configuration', () => {
    const embedder = new E5Embedder();

    expect(embedder.getModel()).toBe(DEFAULT_EMBEDDING_MODEL);
    expect(embedder.getDimensions()).toBe(1024);
    expect(embedder.isInitialized()).toBe(false);
  });

  it('should accept custom configuration', () => {
    const embedder = new E5Embedder({
      model: EmbeddingModel.MULTILINGUAL_E5_LARGE,
      quantized: false,
      maxSequenceLength: 256,
      batchSize: 16,
      enableCache: false,
    });

    const config = embedder.getConfig();
    expect(config.model).toBe(EmbeddingModel.MULTILINGUAL_E5_LARGE);
    expect(config.quantized).toBe(false);
    expect(config.maxSequenceLength).toBe(256);
    expect(config.batchSize).toBe(16);
    expect(config.enableCache).toBe(false);
  });

  it('should accept cache configuration', () => {
    const embedder = new E5Embedder({
      maxCacheSize: 5000,
      cacheConfig: {
        ttlMs: 3600000,
      },
    });

    expect(embedder.getConfig().maxCacheSize).toBe(5000);
  });

  it('should return read-only config copy', () => {
    const embedder = new E5Embedder();
    const config = embedder.getConfig();

    // Should not be able to modify through the returned object
    expect(Object.isFrozen(config) || config !== embedder.getConfig()).toBe(true);
  });
});

// =============================================================================
// Initialization Tests
// =============================================================================

describe('E5Embedder initialization', () => {
  it('should initialize successfully', async () => {
    const embedder = new E5Embedder();

    expect(embedder.isInitialized()).toBe(false);

    await embedder.initialize();

    expect(embedder.isInitialized()).toBe(true);
    expect(mockPipeline).toHaveBeenCalledWith(
      'feature-extraction',
      DEFAULT_EMBEDDING_MODEL,
      expect.any(Object)
    );
  });

  it('should be idempotent - multiple calls should be safe', async () => {
    const embedder = new E5Embedder();

    await embedder.initialize();
    await embedder.initialize();
    await embedder.initialize();

    expect(mockPipeline).toHaveBeenCalledTimes(1);
  });

  it('should handle concurrent initialization calls', async () => {
    const embedder = new E5Embedder();

    // Start multiple initializations concurrently
    const results = await Promise.all([
      embedder.initialize(),
      embedder.initialize(),
      embedder.initialize(),
    ]);

    expect(mockPipeline).toHaveBeenCalledTimes(1);
    expect(embedder.isInitialized()).toBe(true);
  });

  it('should throw EmbeddingError on model load failure', async () => {
    mockPipeline.mockRejectedValueOnce(new Error('Network error'));

    const embedder = new E5Embedder();

    await expect(embedder.initialize()).rejects.toThrow(EmbeddingError);
    await expect(embedder.initialize()).rejects.toThrow('Failed to load');

    expect(embedder.isInitialized()).toBe(false);
  });

  it('should pass correct options to pipeline', async () => {
    const embedder = new E5Embedder({
      model: EmbeddingModel.MULTILINGUAL_E5_LARGE,
      quantized: true,
      device: 'cpu',
    });

    await embedder.initialize();

    expect(mockPipeline).toHaveBeenCalledWith(
      'feature-extraction',
      EmbeddingModel.MULTILINGUAL_E5_LARGE,
      {
        quantized: true,
        device: 'cpu',
      }
    );
  });

  it('should preload without blocking', () => {
    const embedder = new E5Embedder();

    // Should not throw
    embedder.preload();

    // Preload is async, but should have started initialization
    expect(mockPipeline).toHaveBeenCalled();
  });
});

// =============================================================================
// Embedding Methods Tests
// =============================================================================

describe('E5Embedder.embedQuery()', () => {
  it('should throw if not initialized', async () => {
    const embedder = new E5Embedder();

    await expect(embedder.embedQuery('test')).rejects.toThrow(EmbeddingError);
    await expect(embedder.embedQuery('test')).rejects.toThrow('not initialized');
  });

  it('should embed query text with correct prefix', async () => {
    const embedder = new E5Embedder();
    await embedder.initialize();

    const pipelineFn = await mockPipeline.mock.results[0]!.value;

    await embedder.embedQuery('מהו חוק חופש המידע?');

    expect(pipelineFn).toHaveBeenCalledWith(
      ['query: מהו חוק חופש המידע?'],
      expect.any(Object)
    );
  });

  it('should return complete embedding result', async () => {
    const embedder = new E5Embedder();
    await embedder.initialize();

    const result = await embedder.embedQuery('test query');

    expect(result).toMatchObject({
      embedding: expect.any(Array),
      dimensions: 1024,
      text: 'test query',
      type: EmbeddingType.QUERY,
      tokenCount: expect.any(Number),
      truncated: expect.any(Boolean),
      cached: false,
      durationMs: expect.any(Number),
    });
  });

  it('should throw on empty input', async () => {
    const embedder = new E5Embedder();
    await embedder.initialize();

    await expect(embedder.embedQuery('')).rejects.toThrow(EmbeddingError);
    await expect(embedder.embedQuery('   ')).rejects.toThrow(EmbeddingError);
  });

  it('should use cache on repeated queries', async () => {
    const embedder = new E5Embedder({ enableCache: true });
    await embedder.initialize();

    const pipelineFn = await mockPipeline.mock.results[0]!.value;

    const result1 = await embedder.embedQuery('same query');
    const result2 = await embedder.embedQuery('same query');

    // First should compute, second should be from cache
    expect(result1.cached).toBe(false);
    expect(result2.cached).toBe(true);
    expect(result2.durationMs).toBe(0);

    // Pipeline should only be called once
    expect(pipelineFn).toHaveBeenCalledTimes(1);
  });

  it('should skip cache when requested', async () => {
    const embedder = new E5Embedder({ enableCache: true });
    await embedder.initialize();

    const pipelineFn = await mockPipeline.mock.results[0]!.value;

    await embedder.embedQuery('same query');
    const result = await embedder.embedQuery('same query', { skipCache: true });

    expect(result.cached).toBe(false);
    expect(pipelineFn).toHaveBeenCalledTimes(2);
  });
});

describe('E5Embedder.embedDocument()', () => {
  it('should embed document text with correct prefix', async () => {
    const embedder = new E5Embedder();
    await embedder.initialize();

    const pipelineFn = await mockPipeline.mock.results[0]!.value;

    await embedder.embedDocument('חוק חופש המידע, התשנ"ח-1998');

    expect(pipelineFn).toHaveBeenCalledWith(
      ['passage: חוק חופש המידע, התשנ"ח-1998'],
      expect.any(Object)
    );
  });

  it('should return embedding with document type', async () => {
    const embedder = new E5Embedder();
    await embedder.initialize();

    const result = await embedder.embedDocument('test document');

    expect(result.type).toBe(EmbeddingType.DOCUMENT);
  });

  it('should have separate cache from queries', async () => {
    const embedder = new E5Embedder({ enableCache: true });
    await embedder.initialize();

    const pipelineFn = await mockPipeline.mock.results[0]!.value;

    // Same text, different types
    await embedder.embedQuery('same text');
    await embedder.embedDocument('same text');

    // Both should be computed (different cache keys due to type)
    expect(pipelineFn).toHaveBeenCalledTimes(2);
  });
});

describe('E5Embedder.embedBatch()', () => {
  it('should throw if not initialized', async () => {
    const embedder = new E5Embedder();

    await expect(embedder.embedBatch(['text'])).rejects.toThrow(EmbeddingError);
  });

  it('should embed multiple texts', async () => {
    const embedder = new E5Embedder();
    await embedder.initialize();

    const texts = ['text 1', 'text 2', 'text 3'];
    const result = await embedder.embedBatch(texts);

    expect(result.count).toBe(3);
    expect(result.embeddings).toHaveLength(3);
    expect(result.model).toBe(DEFAULT_EMBEDDING_MODEL);
  });

  it('should use document type by default', async () => {
    const embedder = new E5Embedder();
    await embedder.initialize();

    const result = await embedder.embedBatch(['text 1', 'text 2']);

    result.embeddings.forEach((embedding) => {
      expect(embedding.type).toBe(EmbeddingType.DOCUMENT);
    });
  });

  it('should accept query type option', async () => {
    const embedder = new E5Embedder();
    await embedder.initialize();

    const result = await embedder.embedBatch(['text 1', 'text 2'], {
      type: EmbeddingType.QUERY,
    });

    result.embeddings.forEach((embedding) => {
      expect(embedding.type).toBe(EmbeddingType.QUERY);
    });
  });

  it('should track cache hits and misses', async () => {
    const embedder = new E5Embedder({ enableCache: true });
    await embedder.initialize();

    // First batch - all misses
    const result1 = await embedder.embedBatch(['text 1', 'text 2', 'text 3']);
    expect(result1.cacheHits).toBe(0);
    expect(result1.cacheMisses).toBe(3);

    // Second batch with overlap - some hits
    const result2 = await embedder.embedBatch(['text 1', 'text 2', 'text 4']);
    expect(result2.cacheHits).toBe(2);
    expect(result2.cacheMisses).toBe(1);
  });

  it('should track truncated count', async () => {
    // Long text that would be truncated
    const longText = 'א'.repeat(2000);

    const embedder = new E5Embedder({ maxSequenceLength: 512 });
    await embedder.initialize();

    const result = await embedder.embedBatch(['short', longText, 'also short']);

    expect(result.truncatedCount).toBe(1);
  });

  it('should calculate timing statistics', async () => {
    const embedder = new E5Embedder();
    await embedder.initialize();

    const result = await embedder.embedBatch(['text 1', 'text 2']);

    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.avgDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('should call progress callback', async () => {
    const onProgress = vi.fn();

    const embedder = new E5Embedder({ onProgress });
    await embedder.initialize();

    await embedder.embedBatch(['text 1', 'text 2', 'text 3']);

    expect(onProgress).toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith({
      current: expect.any(Number),
      total: 3,
      percentage: expect.any(Number),
    });
  });

  it('should process in batches according to batchSize', async () => {
    const embedder = new E5Embedder({ batchSize: 2 });
    await embedder.initialize();

    const pipelineFn = await mockPipeline.mock.results[0]!.value;

    // 5 texts with batch size 2 = 3 batch calls
    await embedder.embedBatch(['1', '2', '3', '4', '5']);

    // Pipeline is called for each batch
    expect(pipelineFn).toHaveBeenCalledTimes(3);
  });
});

// =============================================================================
// Cache Management Tests
// =============================================================================

describe('E5Embedder cache management', () => {
  it('should get cache statistics', async () => {
    const embedder = new E5Embedder();
    await embedder.initialize();

    await embedder.embedQuery('test');
    await embedder.embedQuery('test'); // Cache hit

    const stats = embedder.getCacheStats();
    expect(stats.size).toBe(1);
    expect(stats.maxSize).toBe(10000);
  });

  it('should get detailed cache statistics', async () => {
    const embedder = new E5Embedder();
    await embedder.initialize();

    await embedder.embedQuery('test');
    await embedder.embedQuery('test');
    await embedder.embedQuery('different');

    const stats = embedder.getDetailedCacheStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(0); // Misses are only counted on cache lookups that fail
    expect(stats.size).toBe(2);
  });

  it('should clear cache', async () => {
    const embedder = new E5Embedder();
    await embedder.initialize();

    await embedder.embedQuery('test');
    expect(embedder.getCacheStats().size).toBe(1);

    embedder.clearCache();
    expect(embedder.getCacheStats().size).toBe(0);
  });

  it('should prune expired entries', async () => {
    vi.useFakeTimers();

    const embedder = new E5Embedder({
      cacheConfig: { ttlMs: 1000 },
    });
    await embedder.initialize();

    await embedder.embedQuery('test');
    expect(embedder.getCacheStats().size).toBe(1);

    vi.advanceTimersByTime(2000);

    const pruned = embedder.pruneCache();
    expect(pruned).toBe(1);
    expect(embedder.getCacheStats().size).toBe(0);

    vi.useRealTimers();
  });

  it('should export and import cache', async () => {
    const embedder = new E5Embedder();
    await embedder.initialize();

    await embedder.embedQuery('test 1');
    await embedder.embedDocument('test 2');

    const exported = embedder.exportCache();
    expect(exported).toHaveLength(2);

    embedder.clearCache();
    expect(embedder.getCacheStats().size).toBe(0);

    const imported = embedder.importCache(exported);
    expect(imported).toBe(2);
    expect(embedder.getCacheStats().size).toBe(2);
  });

  it('should access underlying cache', () => {
    const embedder = new E5Embedder();
    const cache = embedder.getCache();

    expect(cache).toBeDefined();
    expect(typeof cache.get).toBe('function');
    expect(typeof cache.set).toBe('function');
  });
});

// =============================================================================
// Dispose Tests
// =============================================================================

describe('E5Embedder.dispose()', () => {
  it('should dispose without error', async () => {
    const embedder = new E5Embedder();
    await embedder.initialize();

    expect(() => embedder.dispose()).not.toThrow();
  });

  it('should dispose even if not initialized', () => {
    const embedder = new E5Embedder();
    expect(() => embedder.dispose()).not.toThrow();
  });
});

// =============================================================================
// Factory Functions Tests
// =============================================================================

describe('createE5Embedder()', () => {
  it('should create embedder with default config', () => {
    const embedder = createE5Embedder();
    expect(embedder).toBeInstanceOf(E5Embedder);
  });

  it('should accept custom config', () => {
    const embedder = createE5Embedder({ batchSize: 16 });
    expect(embedder.getConfig().batchSize).toBe(16);
  });
});

describe('createQueryEmbedder()', () => {
  it('should create embedder optimized for queries', () => {
    const embedder = createQueryEmbedder();
    expect(embedder.getConfig().maxCacheSize).toBe(1000);
  });

  it('should accept custom config overrides', () => {
    const embedder = createQueryEmbedder({ maxCacheSize: 500 });
    expect(embedder.getConfig().maxCacheSize).toBe(500);
  });
});

describe('createDocumentEmbedder()', () => {
  it('should create embedder optimized for documents', () => {
    const embedder = createDocumentEmbedder();
    expect(embedder.getConfig().batchSize).toBe(64);
    expect(embedder.getConfig().maxCacheSize).toBe(50000);
  });
});

describe('createPersistentEmbedder()', () => {
  it('should create embedder with persistent cache', () => {
    const embedder = createPersistentEmbedder('/tmp/test-cache.json');
    expect(embedder).toBeInstanceOf(E5Embedder);

    // Clean up
    embedder.dispose();
  });
});

// =============================================================================
// Global Instance Tests
// =============================================================================

describe('getGlobalEmbedder() and resetGlobalEmbedder()', () => {
  it('should return same instance', () => {
    const embedder1 = getGlobalEmbedder();
    const embedder2 = getGlobalEmbedder();

    expect(embedder1).toBe(embedder2);
  });

  it('should accept config on first call', () => {
    const embedder = getGlobalEmbedder({ batchSize: 8 });
    expect(embedder.getConfig().batchSize).toBe(8);

    // Subsequent calls should return same instance (config ignored)
    const embedder2 = getGlobalEmbedder({ batchSize: 16 });
    expect(embedder2.getConfig().batchSize).toBe(8);
  });

  it('should reset global instance', () => {
    const embedder1 = getGlobalEmbedder({ batchSize: 8 });
    resetGlobalEmbedder();
    const embedder2 = getGlobalEmbedder({ batchSize: 16 });

    expect(embedder1).not.toBe(embedder2);
    expect(embedder2.getConfig().batchSize).toBe(16);
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('E5Embedder error handling', () => {
  it('should throw MODEL_NOT_INITIALIZED for operations before init', async () => {
    const embedder = new E5Embedder();

    try {
      await embedder.embedQuery('test');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(EmbeddingError);
      expect((error as EmbeddingError).code).toBe(
        EmbeddingErrorCode.MODEL_NOT_INITIALIZED
      );
    }
  });

  it('should throw EMPTY_INPUT for empty text', async () => {
    const embedder = new E5Embedder();
    await embedder.initialize();

    try {
      await embedder.embedQuery('');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(EmbeddingError);
      expect((error as EmbeddingError).code).toBe(EmbeddingErrorCode.EMPTY_INPUT);
    }
  });

  it('should throw COMPUTATION_ERROR on pipeline failure', async () => {
    const embedder = new E5Embedder();
    await embedder.initialize();

    // Make the pipeline fail
    const pipelineFn = await mockPipeline.mock.results[0]!.value;
    pipelineFn.mockRejectedValueOnce(new Error('Computation failed'));

    try {
      await embedder.embedQuery('test', { skipCache: true });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(EmbeddingError);
      expect((error as EmbeddingError).code).toBe(
        EmbeddingErrorCode.COMPUTATION_ERROR
      );
    }
  });
});

// =============================================================================
// Utility Method Tests
// =============================================================================

describe('E5Embedder utility methods', () => {
  it('should return correct model', () => {
    const embedder = new E5Embedder({
      model: EmbeddingModel.MULTILINGUAL_E5_LARGE,
    });
    expect(embedder.getModel()).toBe(EmbeddingModel.MULTILINGUAL_E5_LARGE);
  });

  it('should return correct dimensions', () => {
    const embedder = new E5Embedder({
      model: EmbeddingModel.MULTILINGUAL_E5_LARGE,
    });
    expect(embedder.getDimensions()).toBe(
      MODEL_DIMENSIONS[EmbeddingModel.MULTILINGUAL_E5_LARGE]
    );
  });
});
