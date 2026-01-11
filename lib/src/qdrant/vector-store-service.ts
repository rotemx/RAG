/**
 * Vector Store Service
 *
 * High-level service for interacting with Qdrant vector database.
 * Provides search, upsert, and delete operations for Israeli law document embeddings.
 */

import { QdrantClient } from '@qdrant/js-client-rest';

import {
  createQdrantClient,
  getQdrantClient,
  collectionExists,
} from './client.js';
import type { QdrantConfig } from './config.js';
import {
  type VectorStoreServiceConfig,
  type SearchOptions,
  type SearchFilter,
  type SearchResponse,
  type SearchResult,
  type CreateVectorPointInput,
  type UpsertOptions,
  type UpsertResult,
  type BatchUpsertResult,
  type DeleteCriteria,
  type DeleteOptions,
  type DeleteResult,
  type IsraeliLawPayload,
  VectorStoreError,
  VectorStoreErrorCode,
  createDefaultVectorStoreConfig,
  generatePointId,
  validateVectorDimensions,
  formatPayloadForQdrant,
  parsePayloadFromQdrant,
  SearchOptionsSchema,
  UpsertOptionsSchema,
  DeleteOptionsSchema,
} from './types.js';

// =============================================================================
// VectorStoreService Class
// =============================================================================

/**
 * High-level service for vector database operations.
 *
 * Provides a clean API for:
 * - Semantic search with filtering
 * - Upserting vectors (single and batch)
 * - Deleting vectors by ID or filter
 *
 * @example
 * ```typescript
 * const service = new VectorStoreService();
 *
 * // Search for similar vectors
 * const results = await service.search(queryVector, {
 *   limit: 5,
 *   filter: { topicId: 'criminal-law' },
 * });
 *
 * // Upsert a single point
 * await service.upsert({
 *   id: 'chunk-123',
 *   vector: embedding,
 *   payload: { chunkId: 'chunk-123', lawId: 1, ... },
 * });
 *
 * // Delete points by filter
 * await service.delete({ filter: { lawId: 123 } });
 * ```
 */
export class VectorStoreService {
  private readonly client: QdrantClient;
  private readonly config: VectorStoreServiceConfig;
  private readonly collectionName: string;

  /**
   * Creates a new VectorStoreService instance.
   *
   * @param config - Service configuration (optional)
   * @param client - Pre-configured QdrantClient (optional, uses singleton if not provided)
   */
  constructor(
    config?: Partial<VectorStoreServiceConfig>,
    client?: QdrantClient
  ) {
    this.config = createDefaultVectorStoreConfig(config);
    this.collectionName = this.config.collectionName;
    this.client = client ?? getQdrantClient();
  }

  // ===========================================================================
  // Search Operations
  // ===========================================================================

  /**
   * Performs a semantic similarity search.
   *
   * @param queryVector - The query embedding vector (1024 dimensions for e5-large)
   * @param options - Search options (limit, filter, scoreThreshold, etc.)
   * @returns Search response with results and metadata
   *
   * @example
   * ```typescript
   * const response = await service.search(queryEmbedding, {
   *   limit: 10,
   *   scoreThreshold: 0.7,
   *   filter: { topicId: 'contract-law' },
   * });
   *
   * for (const result of response.results) {
   *   console.log(`${result.payload?.lawName}: ${result.score}`);
   * }
   * ```
   */
  async search(
    queryVector: number[],
    options?: Partial<SearchOptions>
  ): Promise<SearchResponse> {
    const startTime = performance.now();
    const parsedOptions = SearchOptionsSchema.parse(options ?? {});

    // Validate vector dimensions
    if (!validateVectorDimensions(queryVector, this.config.vectorDimensions)) {
      throw new VectorStoreError(
        `Vector dimension mismatch: expected ${this.config.vectorDimensions}, got ${queryVector.length}`,
        VectorStoreErrorCode.DIMENSION_MISMATCH
      );
    }

    try {
      // Build search params - only include defined fields for exactOptionalPropertyTypes
      const searchParams: {
        vector: number[];
        limit: number;
        offset: number;
        with_vector: boolean;
        with_payload: boolean;
        score_threshold?: number;
        filter?: Record<string, unknown>;
      } = {
        vector: queryVector,
        limit: parsedOptions.limit,
        offset: parsedOptions.offset,
        with_vector: parsedOptions.withVector,
        with_payload: parsedOptions.withPayload,
      };

      // Only add optional fields if defined
      if (parsedOptions.scoreThreshold !== undefined) {
        searchParams.score_threshold = parsedOptions.scoreThreshold;
      }
      if (parsedOptions.filter) {
        searchParams.filter = this.buildQdrantFilter(parsedOptions.filter);
      }

      // Execute search
      const searchResult = await this.client.search(this.collectionName, searchParams);

      // Transform results
      const results: SearchResult[] = searchResult.map((point) => {
        // Handle vector - can be number[] or number[][] for multi-vector, we only handle single vector
        let vector: number[] | undefined = undefined;
        if (parsedOptions.withVector && point.vector) {
          if (Array.isArray(point.vector) && point.vector.length > 0) {
            // Check if it's a flat array of numbers (single vector) or array of arrays (multi-vector)
            if (typeof point.vector[0] === 'number') {
              vector = point.vector as number[];
            }
          }
        }

        return {
          id: point.id,
          score: point.score,
          payload: parsedOptions.withPayload
            ? parsePayloadFromQdrant(point.payload as Record<string, unknown>)
            : undefined,
          vector,
        };
      });

      const durationMs = performance.now() - startTime;

      return {
        results,
        total: results.length,
        durationMs,
        queryDimensions: queryVector.length,
      };
    } catch (error) {
      throw this.wrapError(error, 'Search operation failed');
    }
  }

  /**
   * Searches with a pre-built filter for convenience.
   *
   * @param queryVector - The query embedding vector
   * @param filter - Filter conditions
   * @param limit - Maximum results (default: 10)
   * @returns Search response
   */
  async searchWithFilter(
    queryVector: number[],
    filter: SearchFilter,
    limit: number = this.config.defaultSearchLimit
  ): Promise<SearchResponse> {
    return this.search(queryVector, { limit, filter });
  }

  /**
   * Retrieves a single point by ID.
   *
   * @param id - The point ID (UUID or integer)
   * @returns The point payload and vector, or null if not found
   */
  async getPoint(
    id: string | number
  ): Promise<{ payload?: IsraeliLawPayload; vector?: number[] } | null> {
    try {
      const result = await this.client.retrieve(this.collectionName, {
        ids: [id],
        with_payload: true,
        with_vector: true,
      });

      if (result.length === 0) {
        return null;
      }

      const point = result[0]!;
      // Handle vector - can be number[] or number[][] for multi-vector
      let vector: number[] | undefined = undefined;
      if (point.vector && Array.isArray(point.vector) && point.vector.length > 0) {
        if (typeof point.vector[0] === 'number') {
          vector = point.vector as number[];
        }
      }
      return {
        payload: parsePayloadFromQdrant(point.payload as Record<string, unknown>),
        vector,
      };
    } catch (error) {
      throw this.wrapError(error, `Failed to retrieve point ${id}`);
    }
  }

  /**
   * Checks if a point exists in the collection.
   *
   * @param id - The point ID
   * @returns Whether the point exists
   */
  async pointExists(id: string | number): Promise<boolean> {
    const point = await this.getPoint(id);
    return point !== null;
  }

  // ===========================================================================
  // Upsert Operations
  // ===========================================================================

  /**
   * Upserts a single vector point.
   *
   * @param point - The point to upsert (ID will be generated if not provided)
   * @param options - Upsert options
   * @returns Upsert result
   *
   * @example
   * ```typescript
   * const result = await service.upsert({
   *   vector: embedding,
   *   payload: {
   *     chunkId: 'law-123-chunk-0',
   *     lawId: 123,
   *     lawItemId: 'abc123',
   *     chunkIndex: 0,
   *     content: 'Legal text content...',
   *   },
   * });
   * ```
   */
  async upsert(
    point: CreateVectorPointInput,
    options?: Partial<UpsertOptions>
  ): Promise<UpsertResult> {
    const startTime = performance.now();
    const parsedOptions = UpsertOptionsSchema.parse(options ?? {});

    // Validate vector dimensions
    if (!validateVectorDimensions(point.vector, this.config.vectorDimensions)) {
      throw new VectorStoreError(
        `Vector dimension mismatch: expected ${this.config.vectorDimensions}, got ${point.vector.length}`,
        VectorStoreErrorCode.DIMENSION_MISMATCH
      );
    }

    try {
      const pointId = point.id ?? generatePointId();

      await this.client.upsert(this.collectionName, {
        wait: parsedOptions.wait,
        points: [
          {
            id: pointId,
            vector: point.vector,
            payload: formatPayloadForQdrant(point.payload),
          },
        ],
      });

      const durationMs = performance.now() - startTime;

      return {
        success: true,
        upsertedCount: 1,
        durationMs,
      };
    } catch (error) {
      throw this.wrapError(error, 'Upsert operation failed');
    }
  }

  /**
   * Upserts multiple vector points in batches.
   *
   * @param points - Array of points to upsert
   * @param options - Upsert options (including batch size)
   * @param onProgress - Optional callback for progress updates
   * @returns Batch upsert result with per-batch details
   *
   * @example
   * ```typescript
   * const result = await service.upsertBatch(points, {
   *   batchSize: 100,
   *   wait: true,
   * }, (progress) => {
   *   console.log(`Processed ${progress.current}/${progress.total}`);
   * });
   * ```
   */
  async upsertBatch(
    points: CreateVectorPointInput[],
    options?: Partial<UpsertOptions>,
    onProgress?: (progress: { current: number; total: number; percentage: number }) => void
  ): Promise<BatchUpsertResult> {
    const startTime = performance.now();
    const parsedOptions = UpsertOptionsSchema.parse(options ?? {});
    const batchSize = parsedOptions.batchSize;

    const batchResults: UpsertResult[] = [];
    const errors: string[] = [];
    let totalUpserted = 0;

    // Validate all vector dimensions first
    for (const point of points) {
      if (!validateVectorDimensions(point.vector, this.config.vectorDimensions)) {
        throw new VectorStoreError(
          `Vector dimension mismatch in batch: expected ${this.config.vectorDimensions}, got ${point.vector.length}`,
          VectorStoreErrorCode.DIMENSION_MISMATCH
        );
      }
    }

    // Process in batches
    const totalBatches = Math.ceil(points.length / batchSize);

    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      const batchStartTime = performance.now();

      try {
        // Prepare points for Qdrant
        const qdrantPoints = batch.map((point) => ({
          id: point.id ?? generatePointId(),
          vector: point.vector,
          payload: formatPayloadForQdrant(point.payload),
        }));

        await this.client.upsert(this.collectionName, {
          wait: parsedOptions.wait,
          points: qdrantPoints,
        });

        const batchDurationMs = performance.now() - batchStartTime;
        totalUpserted += batch.length;

        batchResults.push({
          success: true,
          upsertedCount: batch.length,
          durationMs: batchDurationMs,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${errorMessage}`);

        batchResults.push({
          success: false,
          upsertedCount: 0,
          durationMs: performance.now() - batchStartTime,
          error: errorMessage,
        });
      }

      // Report progress
      if (onProgress) {
        const currentBatch = Math.min(i + batchSize, points.length);
        onProgress({
          current: currentBatch,
          total: points.length,
          percentage: (currentBatch / points.length) * 100,
        });
      }
    }

    const durationMs = performance.now() - startTime;

    return {
      success: errors.length === 0,
      totalProcessed: points.length,
      totalUpserted,
      failedCount: points.length - totalUpserted,
      durationMs,
      batchResults,
      errors,
    };
  }

  // ===========================================================================
  // Delete Operations
  // ===========================================================================

  /**
   * Deletes vectors by IDs or filter.
   *
   * @param criteria - Delete criteria (IDs or filter)
   * @param options - Delete options
   * @returns Delete result
   *
   * @example
   * ```typescript
   * // Delete by IDs
   * await service.delete({ ids: ['id1', 'id2', 'id3'] });
   *
   * // Delete by filter
   * await service.delete({ filter: { lawId: 123 } });
   * ```
   */
  async delete(
    criteria: DeleteCriteria,
    options?: Partial<DeleteOptions>
  ): Promise<DeleteResult> {
    const startTime = performance.now();
    const parsedOptions = DeleteOptionsSchema.parse(options ?? {});

    // Must have either IDs or filter
    if (!criteria.ids && !criteria.filter) {
      throw new VectorStoreError(
        'Delete criteria must include either ids or filter',
        VectorStoreErrorCode.INVALID_FILTER
      );
    }

    try {
      if (criteria.ids && criteria.ids.length > 0) {
        // Delete by IDs
        await this.client.delete(this.collectionName, {
          wait: parsedOptions.wait,
          points: criteria.ids,
        });
      } else if (criteria.filter) {
        // Delete by filter
        const qdrantFilter = this.buildQdrantFilter(criteria.filter);
        await this.client.delete(this.collectionName, {
          wait: parsedOptions.wait,
          filter: qdrantFilter,
        });
      }

      const durationMs = performance.now() - startTime;

      return {
        success: true,
        durationMs,
        // Note: Qdrant doesn't return exact deleted count for filter-based deletes
        deletedCount: criteria.ids?.length,
      };
    } catch (error) {
      throw this.wrapError(error, 'Delete operation failed');
    }
  }

  /**
   * Deletes a single point by ID.
   *
   * @param id - The point ID to delete
   * @param options - Delete options
   * @returns Delete result
   */
  async deleteById(
    id: string | number,
    options?: Partial<DeleteOptions>
  ): Promise<DeleteResult> {
    return this.delete({ ids: [id] }, options);
  }

  /**
   * Deletes all points matching a filter.
   *
   * @param filter - Filter conditions
   * @param options - Delete options
   * @returns Delete result
   */
  async deleteByFilter(
    filter: SearchFilter,
    options?: Partial<DeleteOptions>
  ): Promise<DeleteResult> {
    return this.delete({ filter }, options);
  }

  /**
   * Deletes all points for a specific law.
   *
   * @param lawId - The law ID
   * @param options - Delete options
   * @returns Delete result
   */
  async deleteByLawId(
    lawId: number,
    options?: Partial<DeleteOptions>
  ): Promise<DeleteResult> {
    return this.delete({ filter: { lawId } }, options);
  }

  // ===========================================================================
  // Collection Operations
  // ===========================================================================

  /**
   * Checks if the configured collection exists.
   *
   * @returns Whether the collection exists
   */
  async collectionExists(): Promise<boolean> {
    const result = await collectionExists(this.collectionName, this.client);
    return result.exists;
  }

  /**
   * Gets the current point count in the collection.
   *
   * @returns Number of points in the collection
   */
  async getPointCount(): Promise<number> {
    try {
      const info = await this.client.getCollection(this.collectionName);
      return info.points_count ?? 0;
    } catch (error) {
      throw this.wrapError(error, 'Failed to get collection info');
    }
  }

  /**
   * Gets the collection name being used.
   */
  getCollectionName(): string {
    return this.collectionName;
  }

  /**
   * Gets the expected vector dimensions.
   */
  getVectorDimensions(): number {
    return this.config.vectorDimensions;
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Builds a Qdrant filter object from a SearchFilter.
   */
  private buildQdrantFilter(filter: SearchFilter): Record<string, unknown> {
    const conditions: Record<string, unknown>[] = [];

    // Law ID filter
    if (filter.lawId !== undefined) {
      conditions.push({
        key: 'lawId',
        match: { value: filter.lawId },
      });
    }

    // Multiple law IDs filter
    if (filter.lawIds && filter.lawIds.length > 0) {
      conditions.push({
        key: 'lawId',
        match: { any: filter.lawIds },
      });
    }

    // Topic ID filter
    if (filter.topicId !== undefined) {
      conditions.push({
        key: 'topicId',
        match: { value: filter.topicId },
      });
    }

    // Multiple topic IDs filter
    if (filter.topicIds && filter.topicIds.length > 0) {
      conditions.push({
        key: 'topicId',
        match: { any: filter.topicIds },
      });
    }

    // Law item ID filter
    if (filter.lawItemId !== undefined) {
      conditions.push({
        key: 'lawItemId',
        match: { value: filter.lawItemId },
      });
    }

    // Publication date range filter
    if (filter.publicationDateMin !== undefined || filter.publicationDateMax !== undefined) {
      const range: { gte?: number; lte?: number } = {};
      if (filter.publicationDateMin !== undefined) {
        range.gte = filter.publicationDateMin;
      }
      if (filter.publicationDateMax !== undefined) {
        range.lte = filter.publicationDateMax;
      }
      conditions.push({
        key: 'publicationDate',
        range,
      });
    }

    return { must: conditions };
  }

  /**
   * Wraps an error in a VectorStoreError with appropriate code.
   */
  private wrapError(error: unknown, context: string): VectorStoreError {
    if (error instanceof VectorStoreError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;

    // Detect error type from message
    let code: VectorStoreErrorCode = VectorStoreErrorCode.UNKNOWN;

    if (message.includes('timeout') || message.includes('TIMEOUT')) {
      code = VectorStoreErrorCode.TIMEOUT;
    } else if (message.includes('connection') || message.includes('ECONNREFUSED')) {
      code = VectorStoreErrorCode.CONNECTION_ERROR;
    } else if (message.includes('collection') && message.includes('not found')) {
      code = VectorStoreErrorCode.COLLECTION_NOT_FOUND;
    } else if (message.includes('point') && message.includes('not found')) {
      code = VectorStoreErrorCode.POINT_NOT_FOUND;
    } else if (message.includes('dimension')) {
      code = VectorStoreErrorCode.DIMENSION_MISMATCH;
    }

    return new VectorStoreError(`${context}: ${message}`, code, { cause });
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/** Singleton service instance */
let serviceInstance: VectorStoreService | null = null;

/**
 * Creates a new VectorStoreService instance.
 *
 * @param config - Service configuration
 * @param client - Optional pre-configured client
 * @returns New VectorStoreService instance
 */
export function createVectorStoreService(
  config?: Partial<VectorStoreServiceConfig>,
  client?: QdrantClient
): VectorStoreService {
  return new VectorStoreService(config, client);
}

/**
 * Gets or creates a singleton VectorStoreService instance.
 *
 * @returns Singleton VectorStoreService instance
 */
export function getVectorStoreService(): VectorStoreService {
  if (!serviceInstance) {
    serviceInstance = new VectorStoreService();
  }
  return serviceInstance;
}

/**
 * Resets the singleton service instance.
 * Useful for testing or when configuration changes.
 */
export function resetVectorStoreService(): void {
  serviceInstance = null;
}

/**
 * Creates a VectorStoreService with a custom Qdrant configuration.
 *
 * @param qdrantConfig - Qdrant connection configuration
 * @param serviceConfig - Service configuration
 * @returns New VectorStoreService instance
 */
export function createVectorStoreServiceWithConfig(
  qdrantConfig: QdrantConfig,
  serviceConfig?: Partial<VectorStoreServiceConfig>
): VectorStoreService {
  const client = createQdrantClient(qdrantConfig);
  return new VectorStoreService(serviceConfig, client);
}
