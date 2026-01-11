/**
 * Response Cache for RAG Service
 *
 * LRU cache for caching RAG responses to avoid redundant computation
 * for repeated or similar queries.
 *
 * @example
 * ```typescript
 * const cache = new ResponseCache({ maxSize: 100, ttlMs: 300000 });
 *
 * // Check cache before processing
 * const cached = cache.get(queryInput);
 * if (cached) {
 *   return cached;
 * }
 *
 * // Process query and cache result
 * const response = await ragService.answer(queryInput);
 * cache.set(queryInput, response);
 * ```
 */

import {
  type CachedResponse,
  type RAGQueryInput,
  type RAGResponse,
  type ResponseCacheConfig,
  type ResponseCacheStats,
  ResponseCacheConfigSchema,
  generateCacheKey,
} from './types.js';

// =============================================================================
// Response Cache Class
// =============================================================================

/**
 * LRU cache for RAG responses with TTL support
 */
export class ResponseCache {
  private readonly config: ResponseCacheConfig;
  private readonly cache: Map<string, CachedResponse> = new Map();
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
    expirations: number;
    createdAt: number;
    lastAccessAt: number;
  };

  /**
   * Create a new ResponseCache instance
   *
   * @param config - Cache configuration options
   */
  constructor(config?: Partial<ResponseCacheConfig>) {
    this.config = ResponseCacheConfigSchema.parse(config ?? {});
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      createdAt: Date.now(),
      lastAccessAt: Date.now(),
    };
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Get a cached response for the given query input.
   *
   * @param input - The RAG query input
   * @returns The cached response or undefined if not found/expired
   */
  get(input: RAGQueryInput): RAGResponse | undefined {
    const key = this.generateKey(input);
    const entry = this.cache.get(key);
    this.stats.lastAccessAt = Date.now();

    if (!entry) {
      this.stats.misses++;
      this.notifyUpdate('miss', key, input.query);
      return undefined;
    }

    // Check TTL expiration
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.expirations++;
      this.notifyUpdate('expire', key, input.query);
      return undefined;
    }

    // Update access metadata
    entry.accessCount++;

    // Move to end (most recently used) by re-inserting
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.stats.hits++;
    this.notifyUpdate('hit', key, input.query);

    // Return a copy to prevent mutation
    return { ...entry.response };
  }

  /**
   * Cache a response for the given query input.
   *
   * @param input - The RAG query input
   * @param response - The RAG response to cache
   */
  set(input: RAGQueryInput, response: RAGResponse): void {
    const key = this.generateKey(input);

    // Delete first to update position if key exists
    this.cache.delete(key);

    // Evict if necessary (LRU eviction)
    while (this.cache.size >= this.config.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
        this.stats.evictions++;
        this.notifyUpdate('evict', firstKey);
      } else {
        break;
      }
    }

    const now = Date.now();
    const entry: CachedResponse = {
      response: { ...response }, // Store a copy
      cachedAt: now,
      accessCount: 1,
      query: input.query,
      filterHash: input.filter ? this.hashFilter(input.filter) : undefined,
    };

    this.cache.set(key, entry);
    this.stats.lastAccessAt = now;
    this.notifyUpdate('set', key, input.query);
  }

  /**
   * Check if a cached response exists for the given query input.
   *
   * @param input - The RAG query input
   * @returns True if a valid (non-expired) cache entry exists
   */
  has(input: RAGQueryInput): boolean {
    const key = this.generateKey(input);
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.expirations++;
      return false;
    }

    return true;
  }

  /**
   * Delete a specific cache entry.
   *
   * @param input - The RAG query input
   * @returns True if an entry was deleted
   */
  delete(input: RAGQueryInput): boolean {
    const key = this.generateKey(input);
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.evictions = 0;
    this.stats.expirations = 0;
    this.notifyUpdate('clear');
  }

  /**
   * Get the current number of cached entries.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics.
   */
  getStats(): ResponseCacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      evictions: this.stats.evictions,
      expirations: this.stats.expirations,
      createdAt: this.stats.createdAt,
      lastAccessAt: this.stats.lastAccessAt,
    };
  }

  /**
   * Remove all expired entries.
   *
   * @returns The number of entries removed
   */
  prune(): number {
    let removed = 0;

    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        removed++;
        this.stats.expirations++;
      }
    }

    return removed;
  }

  /**
   * Get all cached queries (for debugging/monitoring).
   *
   * @returns Array of cached query strings with their access counts
   */
  getCachedQueries(): Array<{ query: string; accessCount: number; cachedAt: number }> {
    const queries: Array<{ query: string; accessCount: number; cachedAt: number }> = [];

    for (const [, entry] of this.cache) {
      if (!this.isExpired(entry)) {
        queries.push({
          query: entry.query,
          accessCount: entry.accessCount,
          cachedAt: entry.cachedAt,
        });
      }
    }

    // Sort by access count descending
    return queries.sort((a, b) => b.accessCount - a.accessCount);
  }

  /**
   * Export cache entries for backup or analysis.
   */
  export(): CachedResponse[] {
    const entries: CachedResponse[] = [];

    for (const [, entry] of this.cache) {
      if (!this.isExpired(entry)) {
        entries.push({ ...entry });
      }
    }

    return entries;
  }

  /**
   * Import cache entries.
   *
   * @param entries - Array of cached responses to import
   * @param preserveTimestamps - If true, use original timestamps; if false, set to now
   * @returns Number of entries imported
   */
  import(entries: CachedResponse[], preserveTimestamps = true): number {
    let imported = 0;
    const now = Date.now();

    for (const entry of entries) {
      // Skip expired entries
      if (preserveTimestamps && now - entry.cachedAt > this.config.ttlMs) {
        continue;
      }

      // Skip if cache is full and entry already exists
      if (this.cache.size >= this.config.maxSize) {
        break;
      }

      // Generate a simplified key from the stored query
      // We use the query directly since we only stored the query in the entry
      const key = generateCacheKey(
        { query: entry.query, topK: 5 }, // Use default topK value
        {
          includeFilters: this.config.includeFiltersInKey,
          includeTopK: this.config.includeTopKInKey,
        }
      );

      const newEntry: CachedResponse = {
        ...entry,
        cachedAt: preserveTimestamps ? entry.cachedAt : now,
      };

      this.cache.set(key, newEntry);
      imported++;
    }

    return imported;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Generate a cache key for the given input.
   */
  private generateKey(input: RAGQueryInput): string {
    return generateCacheKey(input, {
      includeFilters: this.config.includeFiltersInKey,
      includeTopK: this.config.includeTopKInKey,
    });
  }

  /**
   * Check if an entry has expired based on TTL.
   */
  private isExpired(entry: CachedResponse): boolean {
    if (this.config.ttlMs <= 0) {
      return false;
    }
    return Date.now() - entry.cachedAt > this.config.ttlMs;
  }

  /**
   * Hash filter parameters for debugging purposes.
   */
  private hashFilter(filter: NonNullable<RAGQueryInput['filter']>): string {
    const parts: string[] = [];
    if (filter.lawId) parts.push(`lid:${filter.lawId}`);
    if (filter.lawIds?.length) parts.push(`lids:${filter.lawIds.length}`);
    if (filter.topicId) parts.push(`tid:${filter.topicId}`);
    if (filter.topicIds?.length) parts.push(`tids:${filter.topicIds.length}`);
    if (filter.publicationDateMin) parts.push(`pmin`);
    if (filter.publicationDateMax) parts.push(`pmax`);
    return parts.join(',') || 'none';
  }

  /**
   * Notify the update callback if configured.
   */
  private notifyUpdate(
    type: 'hit' | 'miss' | 'set' | 'evict' | 'expire' | 'clear',
    key?: string,
    query?: string
  ): void {
    if (this.config.onUpdate) {
      this.config.onUpdate({ type, key, query });
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new response cache with default settings.
 *
 * @param config - Optional configuration overrides
 * @returns A new ResponseCache instance
 */
export function createResponseCache(
  config?: Partial<ResponseCacheConfig>
): ResponseCache {
  return new ResponseCache(config);
}

// =============================================================================
// Global Cache Instance
// =============================================================================

let globalResponseCache: ResponseCache | null = null;

/**
 * Get or create the global response cache instance.
 *
 * @param config - Configuration to use when creating the cache (ignored if already created)
 * @returns The global ResponseCache instance
 */
export function getGlobalResponseCache(
  config?: Partial<ResponseCacheConfig>
): ResponseCache {
  if (!globalResponseCache) {
    globalResponseCache = new ResponseCache(config);
  }
  return globalResponseCache;
}

/**
 * Reset the global response cache instance.
 * This clears the cache and allows a new one to be created with different config.
 */
export function resetGlobalResponseCache(): void {
  if (globalResponseCache) {
    globalResponseCache.clear();
    globalResponseCache = null;
  }
}
