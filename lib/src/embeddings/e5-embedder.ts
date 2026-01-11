/**
 * E5Embedder Class
 *
 * Embedding generator using the multilingual-e5-large model.
 * Optimized for Hebrew legal documents with proper E5 prefixing.
 *
 * @example
 * ```typescript
 * import { E5Embedder } from '@israeli-law-rag/lib';
 *
 * // Create embedder
 * const embedder = new E5Embedder();
 *
 * // Initialize the model (required before use)
 * await embedder.initialize();
 *
 * // Embed a search query
 * const queryResult = await embedder.embedQuery('מהו חוק חופש המידע?');
 *
 * // Embed a document passage
 * const docResult = await embedder.embedDocument('חוק חופש המידע, התשנ"ח-1998');
 *
 * // Batch embed multiple documents
 * const batchResult = await embedder.embedBatch(['text1', 'text2', 'text3']);
 * ```
 */

import {
  type E5EmbedderConfig,
  type EmbeddingResult,
  type BatchEmbeddingResult,
  type EmbeddingType,
  type EmbeddingModel,
  E5EmbedderConfigSchema,
  EmbeddingError,
  EmbeddingErrorCode,
  EmbeddingType as EmbeddingTypeEnum,
  MODEL_DIMENSIONS,
  applyE5Prefix,
  normalizeVector,
} from './types.js';
import {
  EmbeddingCache,
  type EmbeddingCacheConfig,
  type CacheStats,
  generateCacheKey,
} from './cache.js';

// =============================================================================
// Types for Transformers.js
// =============================================================================

/**
 * Interface for the pipeline output from transformers.js
 */
interface PipelineOutput {
  data: Float32Array;
}

/**
 * Interface for the feature extraction pipeline
 */
interface FeatureExtractionPipeline {
  (
    texts: string | string[],
    options?: { pooling?: string; normalize?: boolean }
  ): Promise<PipelineOutput | PipelineOutput[]>;
}

// =============================================================================
// E5Embedder Class
// =============================================================================

/**
 * Extended configuration for E5Embedder with cache options
 */
export interface E5EmbedderWithCacheConfig extends E5EmbedderConfig {
  /**
   * Cache configuration options.
   * If not provided, uses default in-memory cache.
   */
  cacheConfig?: Partial<EmbeddingCacheConfig>;
}

/**
 * E5Embedder - Generates embeddings using multilingual-e5-large
 *
 * The E5 model family uses specific prefixes for different use cases:
 * - "query: " for search queries (what the user is looking for)
 * - "passage: " for documents (what is being searched)
 *
 * This asymmetric embedding approach improves retrieval quality.
 *
 * Features:
 * - LRU cache with configurable size and TTL
 * - Optional persistent cache storage
 * - Cache statistics tracking
 */
export class E5Embedder {
  private readonly config: E5EmbedderConfig;
  private readonly embeddingCache: EmbeddingCache;
  private pipeline: FeatureExtractionPipeline | null = null;
  private initializePromise: Promise<void> | null = null;
  private initialized = false;

  /**
   * Create a new E5Embedder instance
   *
   * @param config - Configuration options including cache settings
   */
  constructor(config?: Partial<E5EmbedderWithCacheConfig>) {
    // Extract cache config before parsing E5EmbedderConfig
    const { cacheConfig, ...e5Config } = config ?? {};
    this.config = E5EmbedderConfigSchema.parse(e5Config);

    // Initialize the embedding cache with provided config or defaults
    this.embeddingCache = new EmbeddingCache({
      maxSize: this.config.maxCacheSize,
      ttlMs: cacheConfig?.ttlMs ?? 0,
      persistent: cacheConfig?.persistent ?? false,
      cachePath: cacheConfig?.cachePath ?? '.embedding-cache.json',
      persistIntervalMs: cacheConfig?.persistIntervalMs ?? 60000,
      onUpdate: cacheConfig?.onUpdate,
      ...cacheConfig,
    });
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize the embedding model
   *
   * This loads the model and must be called before generating embeddings.
   * The method is idempotent - calling it multiple times is safe.
   *
   * @returns Promise that resolves when the model is ready
   * @throws {EmbeddingError} If model loading fails
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initializePromise) {
      await this.initializePromise;
      return;
    }

    this.initializePromise = this.loadModel();

    try {
      await this.initializePromise;
      this.initialized = true;
    } catch (error) {
      this.initializePromise = null;
      throw error;
    }
  }

  /**
   * Load the embedding model
   */
  private async loadModel(): Promise<void> {
    try {
      // Dynamic import to avoid loading transformers unless needed
      const { pipeline, env } = await import('@xenova/transformers');

      // Configure environment
      env.allowLocalModels = false;
      env.useBrowserCache = false;

      // Create the feature extraction pipeline
      this.pipeline = (await pipeline('feature-extraction', this.config.model, {
        quantized: this.config.quantized,
        device: this.config.device === 'auto' ? undefined : this.config.device,
      })) as unknown as FeatureExtractionPipeline;
    } catch (error) {
      throw new EmbeddingError(
        `Failed to load embedding model: ${error instanceof Error ? error.message : String(error)}`,
        EmbeddingErrorCode.MODEL_LOAD_ERROR,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Check if the embedder is initialized and ready
   */
  isInitialized(): boolean {
    return this.initialized && this.pipeline !== null;
  }

  /**
   * Ensure the model is initialized before use
   */
  private ensureInitialized(): void {
    if (!this.isInitialized()) {
      throw new EmbeddingError(
        'E5Embedder not initialized. Call initialize() first.',
        EmbeddingErrorCode.MODEL_NOT_INITIALIZED
      );
    }
  }

  // ===========================================================================
  // Public Embedding Methods
  // ===========================================================================

  /**
   * Embed a search query
   *
   * Uses the "query: " prefix as required by E5 models for queries.
   *
   * @param query - The search query text
   * @param options - Optional settings
   * @returns Promise resolving to the embedding result
   *
   * @example
   * ```typescript
   * const result = await embedder.embedQuery('מהו חוק הגנת הפרטיות?');
   * console.log(result.embedding); // 1024-dimensional vector
   * ```
   */
  async embedQuery(
    query: string,
    options?: { skipCache?: boolean }
  ): Promise<EmbeddingResult> {
    return this.embed(query, EmbeddingTypeEnum.QUERY, options?.skipCache);
  }

  /**
   * Embed a document passage
   *
   * Uses the "passage: " prefix as required by E5 models for documents.
   *
   * @param document - The document text to embed
   * @param options - Optional settings
   * @returns Promise resolving to the embedding result
   *
   * @example
   * ```typescript
   * const result = await embedder.embedDocument('סעיף 1. הגדרות...');
   * console.log(result.embedding); // 1024-dimensional vector
   * ```
   */
  async embedDocument(
    document: string,
    options?: { skipCache?: boolean }
  ): Promise<EmbeddingResult> {
    return this.embed(document, EmbeddingTypeEnum.DOCUMENT, options?.skipCache);
  }

  /**
   * Embed multiple texts in batch
   *
   * Processes texts in batches for efficiency. All texts are treated
   * as documents (passage prefix) by default.
   *
   * @param texts - Array of texts to embed
   * @param options - Optional settings
   * @returns Promise resolving to batch embedding results
   *
   * @example
   * ```typescript
   * const chunks = ['סעיף 1...', 'סעיף 2...', 'סעיף 3...'];
   * const result = await embedder.embedBatch(chunks);
   * console.log(result.embeddings.length); // 3
   * console.log(result.cacheHits); // Number from cache
   * ```
   */
  async embedBatch(
    texts: string[],
    options?: {
      type?: EmbeddingType;
      skipCache?: boolean;
    }
  ): Promise<BatchEmbeddingResult> {
    this.ensureInitialized();

    const startTime = Date.now();
    const type = options?.type ?? EmbeddingTypeEnum.DOCUMENT;
    const skipCache = options?.skipCache ?? false;

    const results: EmbeddingResult[] = [];
    let cacheHits = 0;
    let cacheMisses = 0;
    let truncatedCount = 0;

    // Separate cached and non-cached texts
    const textsToEmbed: { index: number; text: string; prefixedText: string }[] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i]!;
      const prefixedText = applyE5Prefix(text, type);
      const cacheKey = generateCacheKey(type, text);

      if (!skipCache && this.config.enableCache) {
        const cached = this.embeddingCache.get(cacheKey);
        if (cached) {
          results[i] = { ...cached, cached: true, durationMs: 0 };
          cacheHits++;
          continue;
        }
      }

      textsToEmbed.push({ index: i, text, prefixedText });
      cacheMisses++;
    }

    // Process non-cached texts in batches
    for (let i = 0; i < textsToEmbed.length; i += this.config.batchSize) {
      const batch = textsToEmbed.slice(i, i + this.config.batchSize);
      const batchTexts = batch.map((item) => item.prefixedText);

      const batchStartTime = Date.now();
      const embeddings = await this.computeEmbeddings(batchTexts);
      const batchDuration = Date.now() - batchStartTime;
      const perItemDuration = batchDuration / batch.length;

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j]!;
        const embedding = embeddings[j]!;
        const truncated = this.wouldTruncate(item.prefixedText);

        if (truncated) {
          truncatedCount++;
        }

        const result: EmbeddingResult = {
          embedding,
          dimensions: embedding.length,
          text: item.text,
          type,
          tokenCount: this.estimateTokenCount(item.prefixedText),
          truncated,
          cached: false,
          durationMs: perItemDuration,
        };

        results[item.index] = result;

        // Cache the result
        if (this.config.enableCache) {
          const cacheKey = generateCacheKey(type, item.text);
          this.embeddingCache.set(cacheKey, result);
        }
      }

      // Report progress
      if (this.config.onProgress) {
        const processed = Math.min(i + this.config.batchSize, textsToEmbed.length);
        this.config.onProgress({
          current: cacheHits + processed,
          total: texts.length,
          percentage: ((cacheHits + processed) / texts.length) * 100,
        });
      }
    }

    const totalDuration = Date.now() - startTime;

    return {
      embeddings: results,
      count: results.length,
      totalDurationMs: totalDuration,
      avgDurationMs: results.length > 0 ? totalDuration / results.length : 0,
      cacheHits,
      cacheMisses,
      truncatedCount,
      model: this.config.model,
    };
  }

  // ===========================================================================
  // Core Embedding Logic
  // ===========================================================================

  /**
   * Embed a single text with the specified type
   */
  private async embed(
    text: string,
    type: EmbeddingType,
    skipCache?: boolean
  ): Promise<EmbeddingResult> {
    this.ensureInitialized();

    if (!text || text.trim().length === 0) {
      throw new EmbeddingError(
        'Input text cannot be empty',
        EmbeddingErrorCode.EMPTY_INPUT
      );
    }

    const prefixedText = applyE5Prefix(text, type);
    const cacheKey = generateCacheKey(type, text);

    // Check cache
    if (!skipCache && this.config.enableCache) {
      const cached = this.embeddingCache.get(cacheKey);
      if (cached) {
        return { ...cached, cached: true, durationMs: 0 };
      }
    }

    // Compute embedding
    const startTime = Date.now();
    const embeddings = await this.computeEmbeddings([prefixedText]);
    const embedding = embeddings[0]!;
    const durationMs = Date.now() - startTime;

    const truncated = this.wouldTruncate(prefixedText);

    const result: EmbeddingResult = {
      embedding,
      dimensions: embedding.length,
      text,
      type,
      tokenCount: this.estimateTokenCount(prefixedText),
      truncated,
      cached: false,
      durationMs,
    };

    // Cache the result
    if (this.config.enableCache) {
      this.embeddingCache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Compute embeddings for a batch of texts
   */
  private async computeEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.pipeline) {
      throw new EmbeddingError(
        'Pipeline not initialized',
        EmbeddingErrorCode.MODEL_NOT_INITIALIZED
      );
    }

    try {
      const output = await this.pipeline(texts, {
        pooling: 'mean',
        normalize: this.config.normalize,
      });

      // Handle single text vs batch
      if (texts.length === 1) {
        const singleOutput = output as PipelineOutput;
        return [Array.from(singleOutput.data)];
      }

      // Handle batch output
      const batchOutput = output as PipelineOutput[];
      return batchOutput.map((o) => {
        // For batch output, each item contains the full embedding
        // The data is a flat Float32Array, we need to extract the embedding
        const data = Array.from(o.data);

        // Normalize if not already done by the pipeline
        if (this.config.normalize && !this.isNormalized(data)) {
          return normalizeVector(data);
        }

        return data;
      });
    } catch (error) {
      throw new EmbeddingError(
        `Embedding computation failed: ${error instanceof Error ? error.message : String(error)}`,
        EmbeddingErrorCode.COMPUTATION_ERROR,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Check if a vector is approximately normalized
   */
  private isNormalized(vector: number[]): boolean {
    const magnitude = Math.sqrt(
      vector.reduce((sum, val) => sum + val * val, 0)
    );
    return Math.abs(magnitude - 1) < 0.001;
  }

  // ===========================================================================
  // Cache Management
  // ===========================================================================

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.embeddingCache.clear();
  }

  /**
   * Get basic cache statistics (size and maxSize)
   * @deprecated Use getDetailedCacheStats() for full statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.embeddingCache.size,
      maxSize: this.config.maxCacheSize,
    };
  }

  /**
   * Get detailed cache statistics including hit rate, evictions, etc.
   */
  getDetailedCacheStats(): CacheStats {
    return this.embeddingCache.getStats();
  }

  /**
   * Remove expired entries from the cache.
   * Only relevant when TTL is configured.
   * @returns Number of entries removed
   */
  pruneCache(): number {
    return this.embeddingCache.prune();
  }

  /**
   * Export cache entries for backup or analysis.
   */
  exportCache(): Array<{ key: string; result: EmbeddingResult; accessCount: number }> {
    return this.embeddingCache.export();
  }

  /**
   * Import cache entries from a previous export.
   * @returns Number of entries imported
   */
  importCache(entries: Array<{ key: string; result: EmbeddingResult }>): number {
    return this.embeddingCache.import(entries);
  }

  /**
   * Get the underlying cache instance for advanced operations.
   */
  getCache(): EmbeddingCache {
    return this.embeddingCache;
  }

  /**
   * Dispose of resources (stops persistence interval, final save).
   * Call this when the embedder is no longer needed.
   */
  dispose(): void {
    this.embeddingCache.dispose();
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Get the expected embedding dimension for the current model
   */
  getDimensions(): number {
    return MODEL_DIMENSIONS[this.config.model as EmbeddingModel];
  }

  /**
   * Get the current model identifier
   */
  getModel(): EmbeddingModel {
    return this.config.model as EmbeddingModel;
  }

  /**
   * Get the current configuration (read-only copy)
   */
  getConfig(): Readonly<E5EmbedderConfig> {
    return { ...this.config };
  }

  /**
   * Estimate token count for a text
   *
   * Uses a simple character-based estimate.
   * For multilingual text with Hebrew, approximately 2.5 chars per token.
   */
  private estimateTokenCount(text: string): number {
    // Hebrew text typically tokenizes to ~2-2.5 chars per token
    // English text tokenizes to ~4 chars per token
    // We use a conservative estimate of 2.5 for mixed content
    return Math.ceil(text.length / 2.5);
  }

  /**
   * Check if text would be truncated based on max sequence length
   */
  private wouldTruncate(text: string): boolean {
    const estimatedTokens = this.estimateTokenCount(text);
    return estimatedTokens > this.config.maxSequenceLength;
  }

  /**
   * Preload the model without blocking
   *
   * Useful for warming up the model during app initialization.
   */
  preload(): void {
    // Start loading but don't await
    this.initialize().catch((error) => {
      console.warn('E5Embedder preload failed:', error);
    });
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an E5Embedder with default configuration
 */
export function createE5Embedder(
  config?: Partial<E5EmbedderWithCacheConfig>
): E5Embedder {
  return new E5Embedder(config);
}

/**
 * Create an E5Embedder optimized for query embedding
 *
 * Uses smaller cache with TTL since queries are typically more unique
 * but may be repeated within a session.
 */
export function createQueryEmbedder(
  config?: Partial<E5EmbedderWithCacheConfig>
): E5Embedder {
  return new E5Embedder({
    ...config,
    maxCacheSize: config?.maxCacheSize ?? 1000,
    cacheConfig: {
      ttlMs: 3600000, // 1 hour TTL for queries
      ...config?.cacheConfig,
    },
  });
}

/**
 * Create an E5Embedder optimized for document embedding
 *
 * Uses larger batch size and cache for processing many documents.
 * Documents typically don't expire.
 */
export function createDocumentEmbedder(
  config?: Partial<E5EmbedderWithCacheConfig>
): E5Embedder {
  return new E5Embedder({
    ...config,
    batchSize: config?.batchSize ?? 64,
    maxCacheSize: config?.maxCacheSize ?? 50000,
    cacheConfig: {
      ttlMs: 0, // No expiration for documents
      ...config?.cacheConfig,
    },
  });
}

/**
 * Create an E5Embedder with persistent cache
 *
 * Cache is saved to disk and loaded on initialization,
 * allowing cache to persist across sessions.
 */
export function createPersistentEmbedder(
  cachePath: string,
  config?: Partial<E5EmbedderWithCacheConfig>
): E5Embedder {
  return new E5Embedder({
    ...config,
    cacheConfig: {
      persistent: true,
      cachePath,
      ...config?.cacheConfig,
    },
  });
}

// =============================================================================
// Global Instance
// =============================================================================

let globalEmbedder: E5Embedder | null = null;

/**
 * Get or create a global E5Embedder instance
 *
 * Useful for applications that only need a single embedder.
 */
export function getGlobalEmbedder(
  config?: Partial<E5EmbedderWithCacheConfig>
): E5Embedder {
  if (!globalEmbedder) {
    globalEmbedder = new E5Embedder(config);
  }
  return globalEmbedder;
}

/**
 * Reset the global embedder instance
 *
 * Properly disposes the embedder (saves persistent cache if enabled)
 * and allows creating a new instance with different configuration.
 */
export function resetGlobalEmbedder(): void {
  if (globalEmbedder) {
    globalEmbedder.dispose();
  }
  globalEmbedder = null;
}
