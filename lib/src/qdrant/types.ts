/**
 * Qdrant Vector Store Types
 *
 * TypeScript type definitions for the VectorStoreService.
 * Provides strongly-typed interfaces for vector search, upsert, and delete operations.
 */

import { z } from 'zod';

// =============================================================================
// Vector Store Error Types
// =============================================================================

/**
 * Error codes for vector store operations
 */
export const VectorStoreErrorCode = {
  /** Connection to Qdrant failed */
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  /** Collection not found */
  COLLECTION_NOT_FOUND: 'COLLECTION_NOT_FOUND',
  /** Point not found */
  POINT_NOT_FOUND: 'POINT_NOT_FOUND',
  /** Invalid vector dimensions */
  DIMENSION_MISMATCH: 'DIMENSION_MISMATCH',
  /** Invalid filter parameters */
  INVALID_FILTER: 'INVALID_FILTER',
  /** Operation timed out */
  TIMEOUT: 'TIMEOUT',
  /** Unknown error */
  UNKNOWN: 'UNKNOWN',
} as const;

export type VectorStoreErrorCode =
  (typeof VectorStoreErrorCode)[keyof typeof VectorStoreErrorCode];

/**
 * Zod schema for VectorStoreErrorCode validation
 */
export const VectorStoreErrorCodeSchema = z.enum([
  'CONNECTION_ERROR',
  'COLLECTION_NOT_FOUND',
  'POINT_NOT_FOUND',
  'DIMENSION_MISMATCH',
  'INVALID_FILTER',
  'TIMEOUT',
  'UNKNOWN',
]);

/**
 * Custom error class for vector store operations
 */
export class VectorStoreError extends Error {
  readonly code: VectorStoreErrorCode;
  readonly cause: Error | undefined;

  constructor(
    message: string,
    code: VectorStoreErrorCode,
    options?: { cause?: Error }
  ) {
    super(message);
    this.name = 'VectorStoreError';
    this.code = code;
    this.cause = options?.cause;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, VectorStoreError);
    }
  }

  /**
   * Create a VectorStoreError from an unknown error
   */
  static fromError(
    error: unknown,
    code?: VectorStoreErrorCode
  ): VectorStoreError {
    if (error instanceof VectorStoreError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;

    const options = cause ? { cause } : undefined;
    return new VectorStoreError(
      message,
      code ?? VectorStoreErrorCode.UNKNOWN,
      options
    );
  }
}

/**
 * Type guard to check if an error is a VectorStoreError
 */
export function isVectorStoreError(error: unknown): error is VectorStoreError {
  return error instanceof VectorStoreError;
}

// =============================================================================
// Point/Vector Types
// =============================================================================

/**
 * Payload for Israeli law chunks stored in Qdrant
 */
export const IsraeliLawPayloadSchema = z.object({
  /** Unique chunk identifier */
  chunkId: z.string(),
  /** Internal law ID from PostgreSQL */
  lawId: z.number().int().positive(),
  /** Knesset law item ID */
  lawItemId: z.string(),
  /** Chunk index within the document */
  chunkIndex: z.number().int().nonnegative(),
  /** Text content of the chunk */
  content: z.string(),
  /** Character count */
  charCount: z.number().int().positive().optional(),
  /** Token count */
  tokenCount: z.number().int().positive().optional(),
  /** Section title if available */
  sectionTitle: z.string().nullable().optional(),
  /** Section type (סעיף, פרק, etc.) */
  sectionType: z.string().nullable().optional(),
  /** Section number */
  sectionNumber: z.string().nullable().optional(),
  /** Publication date as timestamp */
  publicationDate: z.number().int().optional(),
  /** Topic ID for filtering */
  topicId: z.string().optional(),
  /** Law name */
  lawName: z.string().optional(),
  /** Additional metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type IsraeliLawPayload = z.infer<typeof IsraeliLawPayloadSchema>;

/**
 * A point to be upserted into Qdrant
 */
export const VectorPointSchema = z.object({
  /** Unique point ID (UUID or integer) */
  id: z.union([z.string().uuid(), z.number().int().positive()]),
  /** Vector embedding (1024 dimensions for e5-large) */
  vector: z.array(z.number()).length(1024),
  /** Payload data */
  payload: IsraeliLawPayloadSchema,
});

export type VectorPoint = z.infer<typeof VectorPointSchema>;

/**
 * Input for creating a vector point (without generated fields)
 */
export const CreateVectorPointInputSchema = VectorPointSchema.omit({
  id: true,
}).extend({
  /** Optional ID - will be generated if not provided */
  id: z.union([z.string().uuid(), z.number().int().positive()]).optional(),
});

export type CreateVectorPointInput = z.infer<typeof CreateVectorPointInputSchema>;

// =============================================================================
// Search Types
// =============================================================================

/**
 * Filter conditions for vector search
 */
export const SearchFilterSchema = z.object({
  /** Filter by specific law ID */
  lawId: z.number().int().positive().optional(),
  /** Filter by multiple law IDs */
  lawIds: z.array(z.number().int().positive()).optional(),
  /** Filter by topic ID */
  topicId: z.string().optional(),
  /** Filter by multiple topic IDs */
  topicIds: z.array(z.string()).optional(),
  /** Filter by law item ID */
  lawItemId: z.string().optional(),
  /** Filter by publication date range (min) */
  publicationDateMin: z.number().int().optional(),
  /** Filter by publication date range (max) */
  publicationDateMax: z.number().int().optional(),
});

export type SearchFilter = z.infer<typeof SearchFilterSchema>;

/**
 * Options for vector search
 */
export const SearchOptionsSchema = z.object({
  /** Maximum number of results to return */
  limit: z.number().int().positive().default(10),
  /** Minimum similarity score threshold (0-1 for cosine) */
  scoreThreshold: z.number().min(0).max(1).optional(),
  /** Filter conditions */
  filter: SearchFilterSchema.optional(),
  /** Whether to return the vector in results */
  withVector: z.boolean().default(false),
  /** Whether to return the payload in results */
  withPayload: z.boolean().default(true),
  /** Offset for pagination */
  offset: z.number().int().nonnegative().default(0),
});

export type SearchOptions = z.infer<typeof SearchOptionsSchema>;

/**
 * A single search result
 */
export const SearchResultSchema = z.object({
  /** Point ID */
  id: z.union([z.string(), z.number()]),
  /** Similarity score */
  score: z.number(),
  /** Payload data (if requested) */
  payload: IsraeliLawPayloadSchema.optional(),
  /** Vector (if requested) */
  vector: z.array(z.number()).optional(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

/**
 * Search response with results and metadata
 */
export const SearchResponseSchema = z.object({
  /** Array of search results */
  results: z.array(SearchResultSchema),
  /** Total number of results found */
  total: z.number().int().nonnegative(),
  /** Search duration in milliseconds */
  durationMs: z.number().nonnegative(),
  /** Query vector dimensions */
  queryDimensions: z.number().int().positive(),
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;

// =============================================================================
// Upsert Types
// =============================================================================

/**
 * Options for upsert operations
 */
export const UpsertOptionsSchema = z.object({
  /** Whether to wait for the operation to complete */
  wait: z.boolean().default(true),
  /** Batch size for bulk upserts */
  batchSize: z.number().int().positive().default(100),
});

export type UpsertOptions = z.infer<typeof UpsertOptionsSchema>;

/**
 * Result of an upsert operation
 */
export const UpsertResultSchema = z.object({
  /** Whether the operation was successful */
  success: z.boolean(),
  /** Number of points upserted */
  upsertedCount: z.number().int().nonnegative(),
  /** Duration in milliseconds */
  durationMs: z.number().nonnegative(),
  /** Error message if failed */
  error: z.string().optional(),
});

export type UpsertResult = z.infer<typeof UpsertResultSchema>;

/**
 * Result of a batch upsert operation
 */
export const BatchUpsertResultSchema = z.object({
  /** Overall success status */
  success: z.boolean(),
  /** Total points processed */
  totalProcessed: z.number().int().nonnegative(),
  /** Total points successfully upserted */
  totalUpserted: z.number().int().nonnegative(),
  /** Number of failed upserts */
  failedCount: z.number().int().nonnegative(),
  /** Total duration in milliseconds */
  durationMs: z.number().nonnegative(),
  /** Per-batch results */
  batchResults: z.array(UpsertResultSchema),
  /** Error messages for failed batches */
  errors: z.array(z.string()),
});

export type BatchUpsertResult = z.infer<typeof BatchUpsertResultSchema>;

// =============================================================================
// Delete Types
// =============================================================================

/**
 * Options for delete operations
 */
export const DeleteOptionsSchema = z.object({
  /** Whether to wait for the operation to complete */
  wait: z.boolean().default(true),
});

export type DeleteOptions = z.infer<typeof DeleteOptionsSchema>;

/**
 * Criteria for deleting points
 */
export const DeleteCriteriaSchema = z.object({
  /** Delete by specific point IDs */
  ids: z.array(z.union([z.string(), z.number()])).optional(),
  /** Delete by filter conditions */
  filter: SearchFilterSchema.optional(),
});

export type DeleteCriteria = z.infer<typeof DeleteCriteriaSchema>;

/**
 * Result of a delete operation
 */
export const DeleteResultSchema = z.object({
  /** Whether the operation was successful */
  success: z.boolean(),
  /** Number of points deleted (estimated, Qdrant doesn't always report exact count) */
  deletedCount: z.number().int().nonnegative().optional(),
  /** Duration in milliseconds */
  durationMs: z.number().nonnegative(),
  /** Error message if failed */
  error: z.string().optional(),
});

export type DeleteResult = z.infer<typeof DeleteResultSchema>;

// =============================================================================
// Service Configuration
// =============================================================================

/**
 * Configuration for VectorStoreService
 */
export const VectorStoreServiceConfigSchema = z.object({
  /** Collection name (default: israeli_laws) */
  collectionName: z.string().default('israeli_laws'),
  /** Expected vector dimensions (default: 1024 for e5-large) */
  vectorDimensions: z.number().int().positive().default(1024),
  /** Default search limit */
  defaultSearchLimit: z.number().int().positive().default(10),
  /** Default batch size for upserts */
  defaultBatchSize: z.number().int().positive().default(100),
  /** Request timeout in milliseconds */
  timeout: z.number().int().positive().default(30000),
});

export type VectorStoreServiceConfig = z.infer<typeof VectorStoreServiceConfigSchema>;

/**
 * Create a default VectorStoreService configuration
 */
export function createDefaultVectorStoreConfig(
  overrides?: Partial<VectorStoreServiceConfig>
): VectorStoreServiceConfig {
  return VectorStoreServiceConfigSchema.parse(overrides ?? {});
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a UUID v4 for point IDs
 */
export function generatePointId(): string {
  return crypto.randomUUID();
}

/**
 * Validate vector dimensions match expected dimensions
 */
export function validateVectorDimensions(
  vector: number[],
  expectedDimensions: number
): boolean {
  return vector.length === expectedDimensions;
}

/**
 * Format a payload for Qdrant (ensure all fields are serializable)
 */
export function formatPayloadForQdrant(
  payload: IsraeliLawPayload
): Record<string, unknown> {
  return {
    chunkId: payload.chunkId,
    lawId: payload.lawId,
    lawItemId: payload.lawItemId,
    chunkIndex: payload.chunkIndex,
    content: payload.content,
    ...(payload.charCount !== undefined && { charCount: payload.charCount }),
    ...(payload.tokenCount !== undefined && { tokenCount: payload.tokenCount }),
    ...(payload.sectionTitle !== undefined && { sectionTitle: payload.sectionTitle }),
    ...(payload.sectionType !== undefined && { sectionType: payload.sectionType }),
    ...(payload.sectionNumber !== undefined && { sectionNumber: payload.sectionNumber }),
    ...(payload.publicationDate !== undefined && { publicationDate: payload.publicationDate }),
    ...(payload.topicId !== undefined && { topicId: payload.topicId }),
    ...(payload.lawName !== undefined && { lawName: payload.lawName }),
    ...(payload.metadata !== undefined && { metadata: payload.metadata }),
  };
}

/**
 * Parse a payload from Qdrant response
 */
export function parsePayloadFromQdrant(
  payload: Record<string, unknown> | null | undefined
): IsraeliLawPayload | undefined {
  if (!payload) {
    return undefined;
  }

  try {
    return IsraeliLawPayloadSchema.parse(payload);
  } catch {
    // Return a partial payload if validation fails
    return {
      chunkId: String(payload['chunkId'] ?? ''),
      lawId: Number(payload['lawId'] ?? 0),
      lawItemId: String(payload['lawItemId'] ?? ''),
      chunkIndex: Number(payload['chunkIndex'] ?? 0),
      content: String(payload['content'] ?? ''),
      charCount: payload['charCount'] !== undefined ? Number(payload['charCount']) : undefined,
      tokenCount: payload['tokenCount'] !== undefined ? Number(payload['tokenCount']) : undefined,
      sectionTitle: payload['sectionTitle'] !== undefined ? String(payload['sectionTitle']) : undefined,
      sectionType: payload['sectionType'] !== undefined ? String(payload['sectionType']) : undefined,
      sectionNumber: payload['sectionNumber'] !== undefined ? String(payload['sectionNumber']) : undefined,
      publicationDate: payload['publicationDate'] !== undefined ? Number(payload['publicationDate']) : undefined,
      topicId: payload['topicId'] !== undefined ? String(payload['topicId']) : undefined,
      lawName: payload['lawName'] !== undefined ? String(payload['lawName']) : undefined,
      metadata: payload['metadata'] as Record<string, unknown> | undefined,
    };
  }
}
