/**
 * Embedding Cache Module
 *
 * Provides caching infrastructure for vector embeddings to avoid recomputing
 * embeddings for repeated queries. Supports LRU eviction, TTL expiration,
 * and optional persistent storage.
 *
 * @example
 * ```typescript
 * import { EmbeddingCache, createEmbeddingCache } from '@israeli-law-rag/lib';
 *
 * // Create cache with default options
 * const cache = createEmbeddingCache();
 *
 * // Store an embedding
 * cache.set('query:מהו חוק חופש המידע', embeddingResult);
 *
 * // Retrieve from cache
 * const cached = cache.get('query:מהו חוק חופש המידע');
 * if (cached) {
 *   console.log('Cache hit!');
 * }
 *
 * // Get cache statistics
 * const stats = cache.getStats();
 * console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);
 * ```
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { type EmbeddingResult, EmbeddingResultSchema } from './types.js';

// =============================================================================
// Cache Configuration Types
// =============================================================================

/**
 * Configuration schema for the embedding cache
 */
export const EmbeddingCacheConfigSchema = z.object({
  /**
   * Maximum number of entries in the cache.
   * When exceeded, least recently used entries are evicted.
   * @default 10000
   */
  maxSize: z.number().int().positive().default(10000),

  /**
   * Time-to-live for cache entries in milliseconds.
   * Set to 0 or undefined for no expiration.
   * @default 0 (no expiration)
   */
  ttlMs: z.number().int().nonnegative().default(0),

  /**
   * Whether to enable persistent storage.
   * When enabled, cache is saved to disk and loaded on initialization.
   * @default false
   */
  persistent: z.boolean().default(false),

  /**
   * File path for persistent cache storage.
   * Only used when `persistent` is true.
   * @default '.embedding-cache.json'
   */
  cachePath: z.string().default('.embedding-cache.json'),

  /**
   * How often to save the cache to disk (in milliseconds).
   * Only used when `persistent` is true.
   * @default 60000 (1 minute)
   */
  persistIntervalMs: z.number().int().positive().default(60000),

  /**
   * Whether to compress cached embeddings.
   * Reduces memory usage but slightly slower.
   * @default false
   */
  compress: z.boolean().default(false),

  /**
   * Callback when cache is updated (for monitoring).
   */
  onUpdate: z
    .function()
    .args(
      z.object({
        type: z.enum(['set', 'get', 'delete', 'evict', 'expire', 'clear']),
        key: z.string().optional(),
        hit: z.boolean().optional(),
      })
    )
    .returns(z.void())
    .optional(),
});

export type EmbeddingCacheConfig = z.infer<typeof EmbeddingCacheConfigSchema>;

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Current number of entries in cache */
  size: number;
  /** Maximum cache size */
  maxSize: number;
  /** Total number of cache hits */
  hits: number;
  /** Total number of cache misses */
  misses: number;
  /** Hit rate (hits / (hits + misses)) */
  hitRate: number;
  /** Number of evictions due to size limit */
  evictions: number;
  /** Number of entries expired due to TTL */
  expirations: number;
  /** Estimated memory usage in bytes */
  memoryUsageBytes: number;
  /** Cache creation timestamp */
  createdAt: number;
  /** Last access timestamp */
  lastAccessAt: number;
}

/**
 * Cache entry with metadata
 */
interface CacheEntry {
  /** The cached embedding result */
  result: EmbeddingResult;
  /** Timestamp when entry was created */
  createdAt: number;
  /** Timestamp when entry was last accessed */
  lastAccessAt: number;
  /** Number of times this entry was accessed */
  accessCount: number;
}

/**
 * Serialized cache format for persistence
 */
const SerializedCacheSchema = z.object({
  version: z.literal(1),
  createdAt: z.number(),
  entries: z.array(
    z.object({
      key: z.string(),
      result: EmbeddingResultSchema,
      createdAt: z.number(),
      accessCount: z.number(),
    })
  ),
});

type SerializedCache = z.infer<typeof SerializedCacheSchema>;

// =============================================================================
// LRU Cache Implementation
// =============================================================================

/**
 * Generic LRU (Least Recently Used) cache with TTL support.
 *
 * Uses a Map for O(1) lookups and a doubly-linked list pattern
 * (via Map's insertion order) for LRU eviction.
 */
export class LRUCache<T> {
  private cache: Map<string, { value: T; expiresAt: number | null }> =
    new Map();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize: number, ttlMs: number = 0) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Get a value from the cache.
   * Returns undefined if not found or expired.
   * Updates access order for LRU tracking.
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check TTL expiration
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used) by re-inserting
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Set a value in the cache.
   * Evicts least recently used entries if cache is full.
   */
  set(key: string, value: T): void {
    // Delete first to update position if key exists
    this.cache.delete(key);

    // Evict if necessary
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      } else {
        break;
      }
    }

    const expiresAt = this.ttlMs > 0 ? Date.now() + this.ttlMs : null;
    this.cache.set(key, { value, expiresAt });
  }

  /**
   * Check if a key exists and is not expired.
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Delete a key from the cache.
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current number of entries (including potentially expired ones).
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys in the cache.
   */
  keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  /**
   * Get all entries in the cache.
   */
  entries(): IterableIterator<[string, T]> {
    const self = this;
    return (function* () {
      for (const [key, entry] of self.cache) {
        if (entry.expiresAt === null || Date.now() <= entry.expiresAt) {
          yield [key, entry.value] as [string, T];
        }
      }
    })();
  }

  /**
   * Remove all expired entries.
   * Returns the number of entries removed.
   */
  prune(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }
}

// =============================================================================
// Embedding Cache Implementation
// =============================================================================

/**
 * Specialized cache for embedding results.
 *
 * Features:
 * - LRU eviction when cache is full
 * - Optional TTL expiration
 * - Cache statistics tracking
 * - Optional persistent storage to disk
 * - Memory-efficient storage
 */
export class EmbeddingCache {
  private readonly config: EmbeddingCacheConfig;
  private readonly cache: Map<string, CacheEntry> = new Map();
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
    expirations: number;
    createdAt: number;
    lastAccessAt: number;
  };
  private persistInterval: NodeJS.Timeout | null = null;
  private dirty = false;

  constructor(config?: Partial<EmbeddingCacheConfig>) {
    this.config = EmbeddingCacheConfigSchema.parse(config ?? {});
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      createdAt: Date.now(),
      lastAccessAt: Date.now(),
    };

    // Load from disk if persistent
    if (this.config.persistent) {
      this.loadFromDisk();
      this.startPersistInterval();
    }
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Get an embedding result from the cache.
   *
   * @param key - Cache key (typically type:text)
   * @returns The cached result or undefined if not found/expired
   */
  get(key: string): EmbeddingResult | undefined {
    const entry = this.cache.get(key);
    this.stats.lastAccessAt = Date.now();

    if (!entry) {
      this.stats.misses++;
      this.notifyUpdate('get', key, false);
      return undefined;
    }

    // Check TTL expiration
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.expirations++;
      this.dirty = true;
      this.notifyUpdate('expire', key);
      return undefined;
    }

    // Update access metadata
    entry.lastAccessAt = Date.now();
    entry.accessCount++;

    // Move to end (most recently used) by re-inserting
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.stats.hits++;
    this.notifyUpdate('get', key, true);

    return entry.result;
  }

  /**
   * Store an embedding result in the cache.
   *
   * @param key - Cache key (typically type:text)
   * @param result - The embedding result to cache
   */
  set(key: string, result: EmbeddingResult): void {
    // Delete first to update position if key exists
    const existed = this.cache.delete(key);

    // Evict if necessary
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
    const entry: CacheEntry = {
      result,
      createdAt: existed ? (this.cache.get(key)?.createdAt ?? now) : now,
      lastAccessAt: now,
      accessCount: 1,
    };

    this.cache.set(key, entry);
    this.dirty = true;
    this.stats.lastAccessAt = now;
    this.notifyUpdate('set', key);
  }

  /**
   * Check if a key exists in the cache (and is not expired).
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.expirations++;
      this.dirty = true;
      return false;
    }
    return true;
  }

  /**
   * Delete a specific key from the cache.
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.dirty = true;
      this.notifyUpdate('delete', key);
    }
    return deleted;
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.evictions = 0;
    this.stats.expirations = 0;
    this.dirty = true;
    this.notifyUpdate('clear');
  }

  /**
   * Get the current number of entries in the cache.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      evictions: this.stats.evictions,
      expirations: this.stats.expirations,
      memoryUsageBytes: this.estimateMemoryUsage(),
      createdAt: this.stats.createdAt,
      lastAccessAt: this.stats.lastAccessAt,
    };
  }

  /**
   * Remove all expired entries.
   * Returns the number of entries removed.
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

    if (removed > 0) {
      this.dirty = true;
    }

    return removed;
  }

  /**
   * Get all keys in the cache that match a prefix.
   */
  keysWithPrefix(prefix: string): string[] {
    const keys: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys;
  }

  /**
   * Export cache entries for analysis or backup.
   */
  export(): Array<{ key: string; result: EmbeddingResult; accessCount: number }> {
    const entries: Array<{ key: string; result: EmbeddingResult; accessCount: number }> = [];

    for (const [key, entry] of this.cache) {
      if (!this.isExpired(entry)) {
        entries.push({
          key,
          result: entry.result,
          accessCount: entry.accessCount,
        });
      }
    }

    return entries;
  }

  /**
   * Import cache entries.
   * Existing entries with same keys will be overwritten.
   */
  import(entries: Array<{ key: string; result: EmbeddingResult }>): number {
    let imported = 0;

    for (const { key, result } of entries) {
      if (this.cache.size < this.config.maxSize || this.cache.has(key)) {
        this.set(key, result);
        imported++;
      }
    }

    return imported;
  }

  /**
   * Stop any background processes (like persistence interval).
   */
  dispose(): void {
    if (this.persistInterval) {
      clearInterval(this.persistInterval);
      this.persistInterval = null;
    }

    // Final save if dirty
    if (this.config.persistent && this.dirty) {
      this.saveToDisk();
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Check if an entry has expired based on TTL.
   */
  private isExpired(entry: CacheEntry): boolean {
    if (this.config.ttlMs <= 0) {
      return false;
    }
    return Date.now() - entry.createdAt > this.config.ttlMs;
  }

  /**
   * Notify the update callback if configured.
   */
  private notifyUpdate(
    type: 'set' | 'get' | 'delete' | 'evict' | 'expire' | 'clear',
    key?: string,
    hit?: boolean
  ): void {
    if (this.config.onUpdate) {
      this.config.onUpdate({ type, key, hit });
    }
  }

  /**
   * Estimate memory usage of the cache in bytes.
   */
  private estimateMemoryUsage(): number {
    let totalBytes = 0;

    for (const [key, entry] of this.cache) {
      // Key size (UTF-16, 2 bytes per char)
      totalBytes += key.length * 2;

      // Embedding array (Float64, 8 bytes per number)
      totalBytes += entry.result.embedding.length * 8;

      // Original text (UTF-16, 2 bytes per char)
      totalBytes += entry.result.text.length * 2;

      // Metadata overhead (rough estimate)
      totalBytes += 200;
    }

    return totalBytes;
  }

  // ===========================================================================
  // Persistence Methods
  // ===========================================================================

  /**
   * Save cache to disk.
   */
  private saveToDisk(): void {
    if (!this.config.persistent) {
      return;
    }

    try {
      const serialized: SerializedCache = {
        version: 1,
        createdAt: this.stats.createdAt,
        entries: [],
      };

      for (const [key, entry] of this.cache) {
        if (!this.isExpired(entry)) {
          serialized.entries.push({
            key,
            result: entry.result,
            createdAt: entry.createdAt,
            accessCount: entry.accessCount,
          });
        }
      }

      const cachePath = path.resolve(this.config.cachePath);
      const cacheDir = path.dirname(cachePath);

      // Ensure directory exists
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      // Write atomically using a temp file
      const tempPath = `${cachePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(serialized), 'utf-8');
      fs.renameSync(tempPath, cachePath);

      this.dirty = false;
    } catch (error) {
      console.error('Failed to save embedding cache to disk:', error);
    }
  }

  /**
   * Load cache from disk.
   */
  private loadFromDisk(): void {
    if (!this.config.persistent) {
      return;
    }

    const cachePath = path.resolve(this.config.cachePath);

    if (!fs.existsSync(cachePath)) {
      return;
    }

    try {
      const data = fs.readFileSync(cachePath, 'utf-8');
      const parsed = JSON.parse(data);
      const serialized = SerializedCacheSchema.parse(parsed);

      const now = Date.now();

      for (const entry of serialized.entries) {
        // Skip if would exceed max size
        if (this.cache.size >= this.config.maxSize) {
          break;
        }

        // Skip if expired (based on TTL from creation time)
        if (
          this.config.ttlMs > 0 &&
          now - entry.createdAt > this.config.ttlMs
        ) {
          continue;
        }

        this.cache.set(entry.key, {
          result: entry.result,
          createdAt: entry.createdAt,
          lastAccessAt: now,
          accessCount: entry.accessCount,
        });
      }

      this.stats.createdAt = serialized.createdAt;
    } catch (error) {
      console.error('Failed to load embedding cache from disk:', error);
    }
  }

  /**
   * Start the periodic persistence interval.
   */
  private startPersistInterval(): void {
    if (this.persistInterval) {
      return;
    }

    this.persistInterval = setInterval(() => {
      if (this.dirty) {
        this.saveToDisk();
      }
    }, this.config.persistIntervalMs);

    // Allow the process to exit even if the interval is running
    this.persistInterval.unref();
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an embedding cache with default configuration.
 */
export function createEmbeddingCache(
  config?: Partial<EmbeddingCacheConfig>
): EmbeddingCache {
  return new EmbeddingCache(config);
}

/**
 * Create an embedding cache optimized for query caching.
 * Uses smaller cache size since queries are typically more unique.
 */
export function createQueryCache(
  config?: Partial<EmbeddingCacheConfig>
): EmbeddingCache {
  return new EmbeddingCache({
    maxSize: 1000,
    ttlMs: 3600000, // 1 hour TTL for queries
    ...config,
  });
}

/**
 * Create an embedding cache optimized for document caching.
 * Uses larger cache size for processing many documents.
 */
export function createDocumentCache(
  config?: Partial<EmbeddingCacheConfig>
): EmbeddingCache {
  return new EmbeddingCache({
    maxSize: 50000,
    ttlMs: 0, // No expiration for documents
    ...config,
  });
}

/**
 * Create a persistent embedding cache that saves to disk.
 */
export function createPersistentCache(
  cachePath: string,
  config?: Partial<EmbeddingCacheConfig>
): EmbeddingCache {
  return new EmbeddingCache({
    persistent: true,
    cachePath,
    ...config,
  });
}

// =============================================================================
// Global Cache Instance
// =============================================================================

let globalCache: EmbeddingCache | null = null;

/**
 * Get or create a global embedding cache instance.
 */
export function getGlobalCache(
  config?: Partial<EmbeddingCacheConfig>
): EmbeddingCache {
  if (!globalCache) {
    globalCache = new EmbeddingCache(config);
  }
  return globalCache;
}

/**
 * Reset the global cache instance.
 */
export function resetGlobalCache(): void {
  if (globalCache) {
    globalCache.dispose();
    globalCache = null;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a cache key from embedding type and text.
 */
export function generateCacheKey(type: string, text: string): string {
  return `${type}:${text}`;
}

/**
 * Parse a cache key into type and text components.
 */
export function parseCacheKey(key: string): { type: string; text: string } | null {
  const colonIndex = key.indexOf(':');
  if (colonIndex === -1) {
    return null;
  }
  return {
    type: key.slice(0, colonIndex),
    text: key.slice(colonIndex + 1),
  };
}

/**
 * Format cache statistics for display.
 */
export function formatCacheStats(stats: CacheStats): string {
  const memoryMB = (stats.memoryUsageBytes / (1024 * 1024)).toFixed(2);
  const hitRatePercent = (stats.hitRate * 100).toFixed(2);

  return [
    `Embedding Cache Statistics:`,
    `  Size: ${stats.size} / ${stats.maxSize} entries`,
    `  Hit Rate: ${hitRatePercent}% (${stats.hits} hits, ${stats.misses} misses)`,
    `  Evictions: ${stats.evictions}`,
    `  Expirations: ${stats.expirations}`,
    `  Memory Usage: ~${memoryMB} MB`,
    `  Created: ${new Date(stats.createdAt).toISOString()}`,
    `  Last Access: ${new Date(stats.lastAccessAt).toISOString()}`,
  ].join('\n');
}
