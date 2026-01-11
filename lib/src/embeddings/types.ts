/**
 * Embedding Types and Schemas
 *
 * TypeScript type definitions for vector embeddings in the Israeli Law RAG project.
 * Designed for use with multilingual-e5-large model for Hebrew legal documents.
 */

import { z } from 'zod';

// =============================================================================
// Embedding Model Configuration
// =============================================================================

/**
 * Supported embedding models
 */
export const EmbeddingModel = {
  /** multilingual-e5-large - Excellent Hebrew support, 1024 dimensions */
  MULTILINGUAL_E5_LARGE: 'intfloat/multilingual-e5-large',
  /** Quantized version of multilingual-e5-large for faster inference */
  MULTILINGUAL_E5_LARGE_QUANTIZED: 'Xenova/multilingual-e5-large',
} as const;

export type EmbeddingModel = (typeof EmbeddingModel)[keyof typeof EmbeddingModel];

/**
 * Zod schema for EmbeddingModel validation
 */
export const EmbeddingModelSchema = z.enum([
  'intfloat/multilingual-e5-large',
  'Xenova/multilingual-e5-large',
]);

/**
 * Model dimensions for each supported model
 */
export const MODEL_DIMENSIONS: Record<EmbeddingModel, number> = {
  [EmbeddingModel.MULTILINGUAL_E5_LARGE]: 1024,
  [EmbeddingModel.MULTILINGUAL_E5_LARGE_QUANTIZED]: 1024,
};

/**
 * Default model for embedding generation
 */
export const DEFAULT_EMBEDDING_MODEL = EmbeddingModel.MULTILINGUAL_E5_LARGE_QUANTIZED;

// =============================================================================
// E5Embedder Configuration
// =============================================================================

/**
 * Configuration options for the E5Embedder class
 */
export const E5EmbedderConfigSchema = z.object({
  /**
   * Model identifier to use for embeddings.
   * @default 'Xenova/multilingual-e5-large' (quantized for speed)
   */
  model: EmbeddingModelSchema.default(DEFAULT_EMBEDDING_MODEL),

  /**
   * Whether to use quantized model for faster inference.
   * When true, uses ONNX quantized model.
   * @default true
   */
  quantized: z.boolean().default(true),

  /**
   * Maximum sequence length for the model.
   * multilingual-e5-large supports up to 512 tokens.
   * @default 512
   */
  maxSequenceLength: z.number().int().positive().max(512).default(512),

  /**
   * Whether to normalize embeddings to unit length.
   * Recommended for cosine similarity search.
   * @default true
   */
  normalize: z.boolean().default(true),

  /**
   * Batch size for processing multiple texts.
   * Larger batches are faster but use more memory.
   * @default 32
   */
  batchSize: z.number().int().positive().max(128).default(32),

  /**
   * Whether to cache embeddings for repeated queries.
   * @default true
   */
  enableCache: z.boolean().default(true),

  /**
   * Maximum cache size (number of entries).
   * @default 10000
   */
  maxCacheSize: z.number().int().positive().default(10000),

  /**
   * Device to run the model on.
   * 'auto' will try GPU first, then fall back to CPU.
   * @default 'auto'
   */
  device: z.enum(['auto', 'cpu', 'gpu', 'wasm']).default('auto'),

  /**
   * Progress callback for batch processing.
   */
  onProgress: z
    .function()
    .args(
      z.object({
        current: z.number(),
        total: z.number(),
        percentage: z.number(),
      })
    )
    .returns(z.void())
    .optional(),
});

export type E5EmbedderConfig = z.infer<typeof E5EmbedderConfigSchema>;

/**
 * Create a default E5Embedder configuration
 */
export function createDefaultE5Config(
  overrides?: Partial<E5EmbedderConfig>
): E5EmbedderConfig {
  return E5EmbedderConfigSchema.parse(overrides ?? {});
}

// =============================================================================
// Embedding Types
// =============================================================================

/**
 * Type of text being embedded (determines prefix)
 *
 * E5 models require specific prefixes:
 * - "query: " for search queries
 * - "passage: " for documents to be searched
 */
export const EmbeddingType = {
  /** Query embedding - uses "query: " prefix */
  QUERY: 'query',
  /** Document/passage embedding - uses "passage: " prefix */
  DOCUMENT: 'passage',
} as const;

export type EmbeddingType = (typeof EmbeddingType)[keyof typeof EmbeddingType];

/**
 * Zod schema for EmbeddingType validation
 */
export const EmbeddingTypeSchema = z.enum(['query', 'passage']);

/**
 * E5 prefix strings for each embedding type
 */
export const E5_PREFIXES: Record<EmbeddingType, string> = {
  [EmbeddingType.QUERY]: 'query: ',
  [EmbeddingType.DOCUMENT]: 'passage: ',
};

// =============================================================================
// Embedding Result Types
// =============================================================================

/**
 * Single embedding result
 */
export const EmbeddingResultSchema = z.object({
  /** The embedding vector */
  embedding: z.array(z.number()),

  /** Dimension of the embedding */
  dimensions: z.number().int().positive(),

  /** Original text that was embedded */
  text: z.string(),

  /** Type of embedding (query or document) */
  type: EmbeddingTypeSchema,

  /** Token count of the input text */
  tokenCount: z.number().int().nonnegative(),

  /** Whether the text was truncated to fit max sequence length */
  truncated: z.boolean(),

  /** Whether this result was from cache */
  cached: z.boolean(),

  /** Processing duration in milliseconds (0 if cached) */
  durationMs: z.number().nonnegative(),
});

export type EmbeddingResult = z.infer<typeof EmbeddingResultSchema>;

/**
 * Batch embedding result
 */
export const BatchEmbeddingResultSchema = z.object({
  /** Array of embedding results */
  embeddings: z.array(EmbeddingResultSchema),

  /** Total number of embeddings generated */
  count: z.number().int().nonnegative(),

  /** Total processing duration in milliseconds */
  totalDurationMs: z.number().nonnegative(),

  /** Average duration per embedding */
  avgDurationMs: z.number().nonnegative(),

  /** Number of embeddings from cache */
  cacheHits: z.number().int().nonnegative(),

  /** Number of embeddings that required computation */
  cacheMisses: z.number().int().nonnegative(),

  /** Number of texts that were truncated */
  truncatedCount: z.number().int().nonnegative(),

  /** Model used for embeddings */
  model: EmbeddingModelSchema,
});

export type BatchEmbeddingResult = z.infer<typeof BatchEmbeddingResultSchema>;

// =============================================================================
// Input Types
// =============================================================================

/**
 * Input for embedding a single text
 */
export const EmbedTextInputSchema = z.object({
  /** Text to embed */
  text: z.string().min(1),

  /** Type of embedding (query or document) */
  type: EmbeddingTypeSchema.default('passage'),

  /** Skip cache lookup and force computation */
  skipCache: z.boolean().default(false),
});

export type EmbedTextInput = z.infer<typeof EmbedTextInputSchema>;

/**
 * Input for embedding multiple texts
 */
export const EmbedBatchInputSchema = z.object({
  /** Texts to embed */
  texts: z.array(z.string().min(1)).min(1),

  /** Type of embedding (query or document) */
  type: EmbeddingTypeSchema.default('passage'),

  /** Skip cache lookup and force computation */
  skipCache: z.boolean().default(false),
});

export type EmbedBatchInput = z.infer<typeof EmbedBatchInputSchema>;

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error codes for embedding failures
 */
export const EmbeddingErrorCode = {
  /** Model failed to load */
  MODEL_LOAD_ERROR: 'MODEL_LOAD_ERROR',
  /** Model not initialized */
  MODEL_NOT_INITIALIZED: 'MODEL_NOT_INITIALIZED',
  /** Input text is empty */
  EMPTY_INPUT: 'EMPTY_INPUT',
  /** Input text exceeds maximum length */
  INPUT_TOO_LONG: 'INPUT_TOO_LONG',
  /** Embedding computation failed */
  COMPUTATION_ERROR: 'COMPUTATION_ERROR',
  /** Dimension mismatch */
  DIMENSION_MISMATCH: 'DIMENSION_MISMATCH',
  /** Unknown error */
  UNKNOWN: 'UNKNOWN',
} as const;

export type EmbeddingErrorCode =
  (typeof EmbeddingErrorCode)[keyof typeof EmbeddingErrorCode];

/**
 * Zod schema for EmbeddingErrorCode validation
 */
export const EmbeddingErrorCodeSchema = z.enum([
  'MODEL_LOAD_ERROR',
  'MODEL_NOT_INITIALIZED',
  'EMPTY_INPUT',
  'INPUT_TOO_LONG',
  'COMPUTATION_ERROR',
  'DIMENSION_MISMATCH',
  'UNKNOWN',
]);

/**
 * Custom error class for embedding failures
 */
export class EmbeddingError extends Error {
  readonly code: EmbeddingErrorCode;
  readonly cause: Error | undefined;

  constructor(
    message: string,
    code: EmbeddingErrorCode,
    options?: { cause?: Error }
  ) {
    super(message);
    this.name = 'EmbeddingError';
    this.code = code;
    this.cause = options?.cause;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EmbeddingError);
    }
  }

  /**
   * Create an EmbeddingError from an unknown error
   */
  static fromError(
    error: unknown,
    code?: EmbeddingErrorCode
  ): EmbeddingError {
    if (error instanceof EmbeddingError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;

    return new EmbeddingError(
      message,
      code ?? EmbeddingErrorCode.UNKNOWN,
      { cause }
    );
  }
}

/**
 * Type guard to check if an error is an EmbeddingError
 */
export function isEmbeddingError(error: unknown): error is EmbeddingError {
  return error instanceof EmbeddingError;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the dimension for a given model
 */
export function getModelDimensions(model: EmbeddingModel): number {
  return MODEL_DIMENSIONS[model];
}

/**
 * Apply the E5 prefix to text based on embedding type
 */
export function applyE5Prefix(text: string, type: EmbeddingType): string {
  return `${E5_PREFIXES[type]}${text}`;
}

/**
 * Remove the E5 prefix from text
 */
export function removeE5Prefix(text: string): string {
  for (const prefix of Object.values(E5_PREFIXES)) {
    if (text.startsWith(prefix)) {
      return text.slice(prefix.length);
    }
  }
  return text;
}

/**
 * Check if text already has an E5 prefix
 */
export function hasE5Prefix(text: string): boolean {
  return Object.values(E5_PREFIXES).some((prefix) => text.startsWith(prefix));
}

/**
 * Validate embedding dimensions match expected model dimensions
 */
export function validateDimensions(
  embedding: number[],
  model: EmbeddingModel
): boolean {
  return embedding.length === MODEL_DIMENSIONS[model];
}

/**
 * Normalize a vector to unit length (L2 normalization)
 */
export function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(
    vector.reduce((sum, val) => sum + val * val, 0)
  );

  if (magnitude === 0) {
    return vector;
  }

  return vector.map((val) => val / magnitude);
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new EmbeddingError(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`,
      EmbeddingErrorCode.DIMENSION_MISMATCH
    );
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);

  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}

/**
 * Calculate dot product between two vectors
 * (For normalized vectors, this equals cosine similarity)
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new EmbeddingError(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`,
      EmbeddingErrorCode.DIMENSION_MISMATCH
    );
  }

  let product = 0;
  for (let i = 0; i < a.length; i++) {
    product += a[i]! * b[i]!;
  }

  return product;
}
