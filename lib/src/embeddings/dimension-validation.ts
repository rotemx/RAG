/**
 * Embedding Dimension Validation Module
 *
 * Comprehensive validation utilities for embedding dimensions.
 * Ensures embeddings have the correct dimensions for the model being used
 * and provides detailed error information when validation fails.
 */

import { z } from 'zod';
import {
  EmbeddingError,
  EmbeddingErrorCode,
  EmbeddingModel,
  MODEL_DIMENSIONS,
  getModelDimensions,
} from './types.js';

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Schema for a single embedding vector
 */
export const EmbeddingVectorSchema = z
  .array(z.number().finite())
  .min(1, 'Embedding vector cannot be empty')
  .describe('A vector of finite numbers representing an embedding');

/**
 * Schema for dimension validation options
 */
export const DimensionValidationOptionsSchema = z
  .object({
    /** Expected model to validate against */
    model: z.nativeEnum(EmbeddingModel).optional(),
    /** Expected dimensions (overrides model if both provided) */
    expectedDimensions: z.number().int().positive().optional(),
    /** Whether to throw an error on validation failure (default: false) */
    throwOnError: z.boolean().optional().default(false),
    /** Custom error message prefix */
    errorMessagePrefix: z.string().optional(),
  })
  .describe('Options for dimension validation');

/**
 * Input type for dimension validation options (allows omitting throwOnError)
 */
export type DimensionValidationOptionsInput = z.input<
  typeof DimensionValidationOptionsSchema
>;

/**
 * Output type for dimension validation options (after Zod parsing with defaults applied)
 */
export type DimensionValidationOptions = z.output<
  typeof DimensionValidationOptionsSchema
>;

/**
 * Schema for dimension validation result
 */
export const DimensionValidationResultSchema = z.object({
  /** Whether the validation passed */
  valid: z.boolean(),
  /** Actual dimensions of the embedding */
  actualDimensions: z.number().int().nonnegative(),
  /** Expected dimensions (if specified) */
  expectedDimensions: z.number().int().positive().optional(),
  /** Error message if validation failed */
  error: z.string().optional(),
  /** Dimension difference (actual - expected) */
  difference: z.number().int().optional(),
});

export type DimensionValidationResult = z.infer<
  typeof DimensionValidationResultSchema
>;

/**
 * Schema for batch validation result
 */
export const BatchDimensionValidationResultSchema = z.object({
  /** Whether all embeddings passed validation */
  allValid: z.boolean(),
  /** Total number of embeddings validated */
  totalCount: z.number().int().nonnegative(),
  /** Number of valid embeddings */
  validCount: z.number().int().nonnegative(),
  /** Number of invalid embeddings */
  invalidCount: z.number().int().nonnegative(),
  /** Individual validation results */
  results: z.array(
    DimensionValidationResultSchema.extend({
      index: z.number().int().nonnegative(),
    })
  ),
  /** Summary of unique dimensions found */
  dimensionSummary: z.record(z.string(), z.number().int().nonnegative()),
});

export type BatchDimensionValidationResult = z.infer<
  typeof BatchDimensionValidationResultSchema
>;

/**
 * Schema for embedding pair validation (for similarity operations)
 */
export const EmbeddingPairValidationResultSchema = z.object({
  /** Whether both embeddings have matching dimensions */
  dimensionsMatch: z.boolean(),
  /** Dimensions of the first embedding */
  firstDimensions: z.number().int().nonnegative(),
  /** Dimensions of the second embedding */
  secondDimensions: z.number().int().nonnegative(),
  /** Whether both are valid for the specified model (if provided) */
  validForModel: z.boolean().optional(),
  /** Error message if validation failed */
  error: z.string().optional(),
});

export type EmbeddingPairValidationResult = z.infer<
  typeof EmbeddingPairValidationResultSchema
>;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate embedding dimensions with detailed result
 *
 * @example
 * ```typescript
 * const embedding = await embedder.embedQuery('test');
 * const result = validateEmbeddingDimensions(embedding.embedding, {
 *   model: EmbeddingModel.MULTILINGUAL_E5_LARGE,
 * });
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 * ```
 */
export function validateEmbeddingDimensions(
  embedding: number[],
  options: DimensionValidationOptionsInput = {}
): DimensionValidationResult {
  const parsedOptions = DimensionValidationOptionsSchema.parse(options);
  const actualDimensions = embedding.length;

  // Determine expected dimensions
  let expectedDimensions: number | undefined;
  if (parsedOptions.expectedDimensions !== undefined) {
    expectedDimensions = parsedOptions.expectedDimensions;
  } else if (parsedOptions.model !== undefined) {
    expectedDimensions = getModelDimensions(parsedOptions.model);
  }

  // If no expected dimensions specified, just check it's non-empty
  if (expectedDimensions === undefined) {
    const valid = actualDimensions > 0;
    const result: DimensionValidationResult = {
      valid,
      actualDimensions,
      error: valid ? undefined : 'Embedding vector is empty',
    };

    if (!valid && parsedOptions.throwOnError) {
      throw new EmbeddingError(
        result.error!,
        EmbeddingErrorCode.DIMENSION_MISMATCH
      );
    }

    return result;
  }

  // Validate against expected dimensions
  const valid = actualDimensions === expectedDimensions;
  const difference = actualDimensions - expectedDimensions;

  let error: string | undefined;
  if (!valid) {
    const prefix = parsedOptions.errorMessagePrefix
      ? `${parsedOptions.errorMessagePrefix}: `
      : '';
    error = `${prefix}Dimension mismatch: expected ${expectedDimensions}, got ${actualDimensions} (difference: ${difference > 0 ? '+' : ''}${difference})`;
  }

  const result: DimensionValidationResult = {
    valid,
    actualDimensions,
    expectedDimensions,
    difference: valid ? undefined : difference,
    error,
  };

  if (!valid && parsedOptions.throwOnError) {
    throw new EmbeddingError(error!, EmbeddingErrorCode.DIMENSION_MISMATCH);
  }

  return result;
}

/**
 * Assert that embedding has valid dimensions (throws on failure)
 *
 * @example
 * ```typescript
 * // Throws EmbeddingError if dimensions don't match
 * assertEmbeddingDimensions(embedding, {
 *   model: EmbeddingModel.MULTILINGUAL_E5_LARGE,
 * });
 * ```
 */
export function assertEmbeddingDimensions(
  embedding: number[],
  options: Omit<DimensionValidationOptionsInput, 'throwOnError'> = {}
): void {
  validateEmbeddingDimensions(embedding, { ...options, throwOnError: true });
}

/**
 * Validate multiple embeddings at once
 *
 * @example
 * ```typescript
 * const results = await embedder.embedBatch(['text1', 'text2', 'text3']);
 * const validation = validateBatchDimensions(
 *   results.embeddings.map(e => e.embedding),
 *   { model: EmbeddingModel.MULTILINGUAL_E5_LARGE }
 * );
 * if (!validation.allValid) {
 *   console.error(`${validation.invalidCount} embeddings have invalid dimensions`);
 * }
 * ```
 */
export function validateBatchDimensions(
  embeddings: number[][],
  options: DimensionValidationOptionsInput = {}
): BatchDimensionValidationResult {
  const results: (DimensionValidationResult & { index: number })[] = [];
  const dimensionSummary: Record<string, number> = {};

  for (let i = 0; i < embeddings.length; i++) {
    const embedding = embeddings[i]!;
    const result = validateEmbeddingDimensions(embedding, {
      ...options,
      throwOnError: false, // Never throw in batch mode
      errorMessagePrefix: options.errorMessagePrefix
        ? `${options.errorMessagePrefix} [index ${i}]`
        : `Embedding at index ${i}`,
    });

    results.push({ ...result, index: i });

    // Track dimension distribution
    const dimKey = result.actualDimensions.toString();
    dimensionSummary[dimKey] = (dimensionSummary[dimKey] ?? 0) + 1;
  }

  const validCount = results.filter((r) => r.valid).length;
  const invalidCount = results.filter((r) => !r.valid).length;

  const batchResult: BatchDimensionValidationResult = {
    allValid: invalidCount === 0,
    totalCount: embeddings.length,
    validCount,
    invalidCount,
    results,
    dimensionSummary,
  };

  if (!batchResult.allValid && options.throwOnError) {
    const firstError = results.find((r) => !r.valid)?.error ?? 'Unknown error';
    throw new EmbeddingError(
      `Batch dimension validation failed: ${invalidCount} of ${embeddings.length} embeddings invalid. First error: ${firstError}`,
      EmbeddingErrorCode.DIMENSION_MISMATCH
    );
  }

  return batchResult;
}

/**
 * Validate that two embeddings have matching dimensions (required for similarity operations)
 *
 * @example
 * ```typescript
 * const query = await embedder.embedQuery('search');
 * const doc = await embedder.embedDocument('content');
 * const validation = validateEmbeddingPair(
 *   query.embedding,
 *   doc.embedding,
 *   { model: EmbeddingModel.MULTILINGUAL_E5_LARGE }
 * );
 * if (!validation.dimensionsMatch) {
 *   console.error(validation.error);
 * }
 * ```
 */
export function validateEmbeddingPair(
  first: number[],
  second: number[],
  options: DimensionValidationOptionsInput = {}
): EmbeddingPairValidationResult {
  const firstDimensions = first.length;
  const secondDimensions = second.length;
  const dimensionsMatch = firstDimensions === secondDimensions;

  let validForModel: boolean | undefined;
  let error: string | undefined;

  // Check model compatibility if specified
  if (options.model !== undefined || options.expectedDimensions !== undefined) {
    const expectedDimensions =
      options.expectedDimensions ?? getModelDimensions(options.model!);
    const firstValid = firstDimensions === expectedDimensions;
    const secondValid = secondDimensions === expectedDimensions;
    validForModel = firstValid && secondValid;

    if (!validForModel) {
      const issues: string[] = [];
      if (!firstValid) {
        issues.push(
          `first embedding has ${firstDimensions} dimensions (expected ${expectedDimensions})`
        );
      }
      if (!secondValid) {
        issues.push(
          `second embedding has ${secondDimensions} dimensions (expected ${expectedDimensions})`
        );
      }
      error = `Model dimension mismatch: ${issues.join(', ')}`;
    }
  }

  // Check that dimensions match each other
  if (!dimensionsMatch && !error) {
    error = `Embedding dimension mismatch: first has ${firstDimensions}, second has ${secondDimensions}`;
  }

  const result: EmbeddingPairValidationResult = {
    dimensionsMatch,
    firstDimensions,
    secondDimensions,
    validForModel,
    error,
  };

  if ((error || !dimensionsMatch) && options.throwOnError) {
    throw new EmbeddingError(
      error ?? 'Dimension mismatch',
      EmbeddingErrorCode.DIMENSION_MISMATCH
    );
  }

  return result;
}

/**
 * Assert that two embeddings have matching dimensions (throws on failure)
 *
 * @example
 * ```typescript
 * // Throws EmbeddingError if dimensions don't match
 * assertEmbeddingPairDimensions(queryEmbedding, docEmbedding, {
 *   model: EmbeddingModel.MULTILINGUAL_E5_LARGE,
 * });
 * const similarity = cosineSimilarity(queryEmbedding, docEmbedding);
 * ```
 */
export function assertEmbeddingPairDimensions(
  first: number[],
  second: number[],
  options: Omit<DimensionValidationOptionsInput, 'throwOnError'> = {}
): void {
  validateEmbeddingPair(first, second, { ...options, throwOnError: true });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if embedding dimensions are consistent within a batch
 *
 * @example
 * ```typescript
 * const embeddings = [embed1, embed2, embed3];
 * if (!areDimensionsConsistent(embeddings)) {
 *   console.error('Embeddings have inconsistent dimensions');
 * }
 * ```
 */
export function areDimensionsConsistent(embeddings: number[][]): boolean {
  if (embeddings.length <= 1) {
    return true;
  }

  const firstDim = embeddings[0]!.length;
  return embeddings.every((e) => e.length === firstDim);
}

/**
 * Get the dimensions of an embedding with validation
 *
 * @example
 * ```typescript
 * const dims = getEmbeddingDimensions(embedding);
 * if (dims === 0) {
 *   console.error('Empty embedding');
 * }
 * ```
 */
export function getEmbeddingDimensions(embedding: number[]): number {
  return embedding.length;
}

/**
 * Check if embedding has the expected dimensions for a model
 *
 * This is a simpler version of validateEmbeddingDimensions that returns a boolean.
 *
 * @example
 * ```typescript
 * if (!hasExpectedDimensions(embedding, EmbeddingModel.MULTILINGUAL_E5_LARGE)) {
 *   throw new Error('Invalid embedding dimensions');
 * }
 * ```
 */
export function hasExpectedDimensions(
  embedding: number[],
  model: EmbeddingModel
): boolean {
  return embedding.length === MODEL_DIMENSIONS[model];
}

/**
 * Get a human-readable description of dimension validation status
 *
 * @example
 * ```typescript
 * const result = validateEmbeddingDimensions(embedding, { model });
 * console.log(formatDimensionValidation(result));
 * // Output: "✓ Valid: 1024 dimensions (matches expected)"
 * // Or: "✗ Invalid: 512 dimensions (expected 1024, difference: -512)"
 * ```
 */
export function formatDimensionValidation(
  result: DimensionValidationResult
): string {
  if (result.valid) {
    const expectedPart = result.expectedDimensions
      ? ' (matches expected)'
      : '';
    return `✓ Valid: ${result.actualDimensions} dimensions${expectedPart}`;
  }

  const expectedPart = result.expectedDimensions
    ? ` (expected ${result.expectedDimensions}, difference: ${result.difference! > 0 ? '+' : ''}${result.difference})`
    : '';
  return `✗ Invalid: ${result.actualDimensions} dimensions${expectedPart}`;
}

/**
 * Get a human-readable summary of batch dimension validation
 *
 * @example
 * ```typescript
 * const result = validateBatchDimensions(embeddings, { model });
 * console.log(formatBatchDimensionValidation(result));
 * ```
 */
export function formatBatchDimensionValidation(
  result: BatchDimensionValidationResult
): string {
  const lines: string[] = [];

  if (result.allValid) {
    lines.push(
      `✓ All ${result.totalCount} embeddings have valid dimensions`
    );
  } else {
    lines.push(
      `✗ ${result.invalidCount} of ${result.totalCount} embeddings have invalid dimensions`
    );
  }

  // Add dimension distribution
  const dimEntries = Object.entries(result.dimensionSummary).sort(
    ([a], [b]) => parseInt(a) - parseInt(b)
  );
  if (dimEntries.length > 1) {
    lines.push('Dimension distribution:');
    for (const [dims, count] of dimEntries) {
      const pct = ((count / result.totalCount) * 100).toFixed(1);
      lines.push(`  ${dims} dimensions: ${count} (${pct}%)`);
    }
  } else if (dimEntries.length === 1) {
    lines.push(`All embeddings have ${dimEntries[0]![0]} dimensions`);
  }

  return lines.join('\n');
}

/**
 * Create a dimension validator function for a specific model
 *
 * @example
 * ```typescript
 * const validateForE5 = createModelDimensionValidator(
 *   EmbeddingModel.MULTILINGUAL_E5_LARGE
 * );
 *
 * const result = validateForE5(embedding);
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 * ```
 */
export function createModelDimensionValidator(
  model: EmbeddingModel,
  defaultOptions: Omit<DimensionValidationOptionsInput, 'model'> = {}
): (
  embedding: number[],
  options?: Partial<DimensionValidationOptionsInput>
) => DimensionValidationResult {
  return (embedding, options = {}) =>
    validateEmbeddingDimensions(embedding, {
      ...defaultOptions,
      ...options,
      model,
    });
}

/**
 * Expected dimensions for common Qdrant collection configurations
 */
export const QDRANT_COLLECTION_DIMENSIONS = {
  /** Israeli laws collection using multilingual-e5-large */
  ISRAELI_LAWS: 1024,
} as const;

/**
 * Validate embedding dimensions against Qdrant collection requirements
 *
 * @example
 * ```typescript
 * const result = validateForQdrantCollection(embedding, 'ISRAELI_LAWS');
 * if (!result.valid) {
 *   throw new Error(`Cannot upsert to Qdrant: ${result.error}`);
 * }
 * ```
 */
export function validateForQdrantCollection(
  embedding: number[],
  collection: keyof typeof QDRANT_COLLECTION_DIMENSIONS,
  options: Omit<
    DimensionValidationOptionsInput,
    'expectedDimensions' | 'model'
  > = {}
): DimensionValidationResult {
  return validateEmbeddingDimensions(embedding, {
    ...options,
    expectedDimensions: QDRANT_COLLECTION_DIMENSIONS[collection],
    errorMessagePrefix:
      options.errorMessagePrefix ??
      `Qdrant collection '${collection}' validation`,
  });
}

/**
 * Validate batch of embeddings for Qdrant upsert
 *
 * @example
 * ```typescript
 * const embeddings = results.map(r => r.embedding);
 * const validation = validateBatchForQdrant(embeddings, 'ISRAELI_LAWS');
 * if (!validation.allValid) {
 *   const invalidIds = validation.results
 *     .filter(r => !r.valid)
 *     .map(r => r.index);
 *   console.error(`Cannot upsert indices: ${invalidIds.join(', ')}`);
 * }
 * ```
 */
export function validateBatchForQdrant(
  embeddings: number[][],
  collection: keyof typeof QDRANT_COLLECTION_DIMENSIONS,
  options: Omit<
    DimensionValidationOptionsInput,
    'expectedDimensions' | 'model'
  > = {}
): BatchDimensionValidationResult {
  return validateBatchDimensions(embeddings, {
    ...options,
    expectedDimensions: QDRANT_COLLECTION_DIMENSIONS[collection],
    errorMessagePrefix:
      options.errorMessagePrefix ??
      `Qdrant collection '${collection}' validation`,
  });
}
