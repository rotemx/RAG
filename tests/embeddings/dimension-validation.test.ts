/**
 * Unit Tests for Embedding Dimension Validation Module
 *
 * Tests the dimension validation utilities:
 * - validateEmbeddingDimensions() - Single embedding validation
 * - assertEmbeddingDimensions() - Assertion-style validation
 * - validateBatchDimensions() - Batch validation
 * - validateEmbeddingPair() - Pair validation for similarity ops
 * - Utility functions (areDimensionsConsistent, hasExpectedDimensions, etc.)
 * - Qdrant-specific validation functions
 * - Formatting functions
 */

import { describe, it, expect } from 'vitest';
import {
  // Validation schemas
  EmbeddingVectorSchema,
  DimensionValidationOptionsSchema,
  DimensionValidationResultSchema,
  BatchDimensionValidationResultSchema,
  EmbeddingPairValidationResultSchema,

  // Validation functions
  validateEmbeddingDimensions,
  assertEmbeddingDimensions,
  validateBatchDimensions,
  validateEmbeddingPair,
  assertEmbeddingPairDimensions,

  // Utility functions
  areDimensionsConsistent,
  getEmbeddingDimensions,
  hasExpectedDimensions,
  formatDimensionValidation,
  formatBatchDimensionValidation,
  createModelDimensionValidator,

  // Qdrant-specific
  QDRANT_COLLECTION_DIMENSIONS,
  validateForQdrantCollection,
  validateBatchForQdrant,

  // Types
  EmbeddingModel,
  EmbeddingError,
  EmbeddingErrorCode,
} from '../../lib/src/embeddings/index.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a test embedding with specified dimensions
 */
function createTestEmbedding(dimensions: number): number[] {
  return new Array(dimensions).fill(0).map(() => Math.random());
}

/**
 * Create embedding with expected dimensions for e5-large
 */
function createValidEmbedding(): number[] {
  return createTestEmbedding(1024);
}

// =============================================================================
// Schema Tests
// =============================================================================

describe('EmbeddingVectorSchema', () => {
  it('should validate valid embedding array', () => {
    const result = EmbeddingVectorSchema.safeParse([0.1, 0.2, 0.3]);
    expect(result.success).toBe(true);
  });

  it('should reject empty array', () => {
    const result = EmbeddingVectorSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it('should reject non-finite numbers', () => {
    expect(EmbeddingVectorSchema.safeParse([Infinity]).success).toBe(false);
    expect(EmbeddingVectorSchema.safeParse([NaN]).success).toBe(false);
    expect(EmbeddingVectorSchema.safeParse([-Infinity]).success).toBe(false);
  });

  it('should accept negative and zero values', () => {
    const result = EmbeddingVectorSchema.safeParse([-1, 0, 1]);
    expect(result.success).toBe(true);
  });
});

describe('DimensionValidationOptionsSchema', () => {
  it('should apply default values', () => {
    const result = DimensionValidationOptionsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.throwOnError).toBe(false);
    }
  });

  it('should accept model specification', () => {
    const result = DimensionValidationOptionsSchema.safeParse({
      model: EmbeddingModel.MULTILINGUAL_E5_LARGE,
    });
    expect(result.success).toBe(true);
  });

  it('should accept expectedDimensions', () => {
    const result = DimensionValidationOptionsSchema.safeParse({
      expectedDimensions: 1024,
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid expectedDimensions', () => {
    expect(
      DimensionValidationOptionsSchema.safeParse({ expectedDimensions: 0 }).success
    ).toBe(false);
    expect(
      DimensionValidationOptionsSchema.safeParse({ expectedDimensions: -1 }).success
    ).toBe(false);
  });
});

describe('DimensionValidationResultSchema', () => {
  it('should validate valid result', () => {
    const result = DimensionValidationResultSchema.safeParse({
      valid: true,
      actualDimensions: 1024,
      expectedDimensions: 1024,
    });
    expect(result.success).toBe(true);
  });

  it('should validate result with error', () => {
    const result = DimensionValidationResultSchema.safeParse({
      valid: false,
      actualDimensions: 512,
      expectedDimensions: 1024,
      error: 'Dimension mismatch',
      difference: -512,
    });
    expect(result.success).toBe(true);
  });
});

describe('BatchDimensionValidationResultSchema', () => {
  it('should validate valid batch result', () => {
    const result = BatchDimensionValidationResultSchema.safeParse({
      allValid: true,
      totalCount: 3,
      validCount: 3,
      invalidCount: 0,
      results: [
        { valid: true, actualDimensions: 1024, index: 0 },
        { valid: true, actualDimensions: 1024, index: 1 },
        { valid: true, actualDimensions: 1024, index: 2 },
      ],
      dimensionSummary: { '1024': 3 },
    });
    expect(result.success).toBe(true);
  });
});

describe('EmbeddingPairValidationResultSchema', () => {
  it('should validate valid pair result', () => {
    const result = EmbeddingPairValidationResultSchema.safeParse({
      dimensionsMatch: true,
      firstDimensions: 1024,
      secondDimensions: 1024,
      validForModel: true,
    });
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// validateEmbeddingDimensions() Tests
// =============================================================================

describe('validateEmbeddingDimensions()', () => {
  describe('without expected dimensions', () => {
    it('should return valid for non-empty embedding', () => {
      const embedding = createTestEmbedding(512);
      const result = validateEmbeddingDimensions(embedding);

      expect(result.valid).toBe(true);
      expect(result.actualDimensions).toBe(512);
      expect(result.expectedDimensions).toBeUndefined();
    });

    it('should return invalid for empty embedding', () => {
      const result = validateEmbeddingDimensions([]);

      expect(result.valid).toBe(false);
      expect(result.actualDimensions).toBe(0);
      expect(result.error).toContain('empty');
    });
  });

  describe('with model specification', () => {
    it('should validate matching dimensions', () => {
      const embedding = createTestEmbedding(1024);
      const result = validateEmbeddingDimensions(embedding, {
        model: EmbeddingModel.MULTILINGUAL_E5_LARGE,
      });

      expect(result.valid).toBe(true);
      expect(result.actualDimensions).toBe(1024);
      expect(result.expectedDimensions).toBe(1024);
    });

    it('should detect mismatched dimensions', () => {
      const embedding = createTestEmbedding(512);
      const result = validateEmbeddingDimensions(embedding, {
        model: EmbeddingModel.MULTILINGUAL_E5_LARGE,
      });

      expect(result.valid).toBe(false);
      expect(result.actualDimensions).toBe(512);
      expect(result.expectedDimensions).toBe(1024);
      expect(result.difference).toBe(-512);
      expect(result.error).toContain('mismatch');
    });
  });

  describe('with expectedDimensions', () => {
    it('should validate matching dimensions', () => {
      const embedding = createTestEmbedding(768);
      const result = validateEmbeddingDimensions(embedding, {
        expectedDimensions: 768,
      });

      expect(result.valid).toBe(true);
      expect(result.expectedDimensions).toBe(768);
    });

    it('should detect mismatched dimensions', () => {
      const embedding = createTestEmbedding(512);
      const result = validateEmbeddingDimensions(embedding, {
        expectedDimensions: 768,
      });

      expect(result.valid).toBe(false);
      expect(result.difference).toBe(-256);
    });

    it('should override model when both are provided', () => {
      const embedding = createTestEmbedding(768);
      const result = validateEmbeddingDimensions(embedding, {
        model: EmbeddingModel.MULTILINGUAL_E5_LARGE, // 1024
        expectedDimensions: 768, // Should take precedence
      });

      expect(result.valid).toBe(true);
      expect(result.expectedDimensions).toBe(768);
    });
  });

  describe('with custom error message prefix', () => {
    it('should include prefix in error message', () => {
      const embedding = createTestEmbedding(512);
      const result = validateEmbeddingDimensions(embedding, {
        expectedDimensions: 1024,
        errorMessagePrefix: 'Custom prefix',
      });

      expect(result.error).toContain('Custom prefix');
    });
  });

  describe('with throwOnError', () => {
    it('should throw EmbeddingError on invalid dimensions', () => {
      const embedding = createTestEmbedding(512);

      expect(() =>
        validateEmbeddingDimensions(embedding, {
          expectedDimensions: 1024,
          throwOnError: true,
        })
      ).toThrow(EmbeddingError);
    });

    it('should not throw on valid dimensions', () => {
      const embedding = createTestEmbedding(1024);

      expect(() =>
        validateEmbeddingDimensions(embedding, {
          expectedDimensions: 1024,
          throwOnError: true,
        })
      ).not.toThrow();
    });
  });
});

// =============================================================================
// assertEmbeddingDimensions() Tests
// =============================================================================

describe('assertEmbeddingDimensions()', () => {
  it('should not throw for valid dimensions', () => {
    const embedding = createValidEmbedding();

    expect(() =>
      assertEmbeddingDimensions(embedding, {
        model: EmbeddingModel.MULTILINGUAL_E5_LARGE,
      })
    ).not.toThrow();
  });

  it('should throw for invalid dimensions', () => {
    const embedding = createTestEmbedding(512);

    expect(() =>
      assertEmbeddingDimensions(embedding, {
        model: EmbeddingModel.MULTILINGUAL_E5_LARGE,
      })
    ).toThrow(EmbeddingError);
  });

  it('should throw with correct error code', () => {
    const embedding = createTestEmbedding(512);

    try {
      assertEmbeddingDimensions(embedding, { expectedDimensions: 1024 });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(EmbeddingError);
      expect((error as EmbeddingError).code).toBe(
        EmbeddingErrorCode.DIMENSION_MISMATCH
      );
    }
  });
});

// =============================================================================
// validateBatchDimensions() Tests
// =============================================================================

describe('validateBatchDimensions()', () => {
  it('should validate all valid embeddings', () => {
    const embeddings = [
      createTestEmbedding(1024),
      createTestEmbedding(1024),
      createTestEmbedding(1024),
    ];

    const result = validateBatchDimensions(embeddings, {
      model: EmbeddingModel.MULTILINGUAL_E5_LARGE,
    });

    expect(result.allValid).toBe(true);
    expect(result.totalCount).toBe(3);
    expect(result.validCount).toBe(3);
    expect(result.invalidCount).toBe(0);
  });

  it('should detect invalid embeddings in batch', () => {
    const embeddings = [
      createTestEmbedding(1024),
      createTestEmbedding(512), // Invalid
      createTestEmbedding(1024),
    ];

    const result = validateBatchDimensions(embeddings, {
      expectedDimensions: 1024,
    });

    expect(result.allValid).toBe(false);
    expect(result.validCount).toBe(2);
    expect(result.invalidCount).toBe(1);
    expect(result.results[1]!.valid).toBe(false);
  });

  it('should include index in result', () => {
    const embeddings = [
      createTestEmbedding(1024),
      createTestEmbedding(512),
    ];

    const result = validateBatchDimensions(embeddings, {
      expectedDimensions: 1024,
    });

    expect(result.results[0]!.index).toBe(0);
    expect(result.results[1]!.index).toBe(1);
  });

  it('should generate dimension summary', () => {
    const embeddings = [
      createTestEmbedding(1024),
      createTestEmbedding(1024),
      createTestEmbedding(512),
      createTestEmbedding(768),
    ];

    const result = validateBatchDimensions(embeddings);

    expect(result.dimensionSummary['1024']).toBe(2);
    expect(result.dimensionSummary['512']).toBe(1);
    expect(result.dimensionSummary['768']).toBe(1);
  });

  it('should include error message prefix with index', () => {
    const embeddings = [createTestEmbedding(512)];

    const result = validateBatchDimensions(embeddings, {
      expectedDimensions: 1024,
      errorMessagePrefix: 'Test',
    });

    expect(result.results[0]!.error).toContain('Test');
    expect(result.results[0]!.error).toContain('index 0');
  });

  it('should never throw in batch mode by default', () => {
    const embeddings = [createTestEmbedding(512)];

    expect(() =>
      validateBatchDimensions(embeddings, { expectedDimensions: 1024 })
    ).not.toThrow();
  });

  it('should throw if throwOnError is true and validation fails', () => {
    const embeddings = [createTestEmbedding(512)];

    expect(() =>
      validateBatchDimensions(embeddings, {
        expectedDimensions: 1024,
        throwOnError: true,
      })
    ).toThrow(EmbeddingError);
  });

  it('should handle empty array', () => {
    const result = validateBatchDimensions([]);

    expect(result.allValid).toBe(true);
    expect(result.totalCount).toBe(0);
    expect(result.validCount).toBe(0);
    expect(result.invalidCount).toBe(0);
  });
});

// =============================================================================
// validateEmbeddingPair() Tests
// =============================================================================

describe('validateEmbeddingPair()', () => {
  it('should validate matching dimensions', () => {
    const first = createTestEmbedding(1024);
    const second = createTestEmbedding(1024);

    const result = validateEmbeddingPair(first, second);

    expect(result.dimensionsMatch).toBe(true);
    expect(result.firstDimensions).toBe(1024);
    expect(result.secondDimensions).toBe(1024);
    expect(result.error).toBeUndefined();
  });

  it('should detect mismatched dimensions', () => {
    const first = createTestEmbedding(1024);
    const second = createTestEmbedding(512);

    const result = validateEmbeddingPair(first, second);

    expect(result.dimensionsMatch).toBe(false);
    expect(result.error).toContain('mismatch');
    expect(result.error).toContain('1024');
    expect(result.error).toContain('512');
  });

  it('should validate against model', () => {
    const first = createTestEmbedding(1024);
    const second = createTestEmbedding(1024);

    const result = validateEmbeddingPair(first, second, {
      model: EmbeddingModel.MULTILINGUAL_E5_LARGE,
    });

    expect(result.dimensionsMatch).toBe(true);
    expect(result.validForModel).toBe(true);
  });

  it('should detect model dimension mismatch', () => {
    const first = createTestEmbedding(512);
    const second = createTestEmbedding(512);

    const result = validateEmbeddingPair(first, second, {
      model: EmbeddingModel.MULTILINGUAL_E5_LARGE, // Expects 1024
    });

    expect(result.dimensionsMatch).toBe(true); // They match each other
    expect(result.validForModel).toBe(false); // But not the model
    expect(result.error).toContain('Model');
  });

  it('should detect when only first mismatches model', () => {
    const first = createTestEmbedding(512);
    const second = createTestEmbedding(1024);

    const result = validateEmbeddingPair(first, second, {
      model: EmbeddingModel.MULTILINGUAL_E5_LARGE,
    });

    expect(result.dimensionsMatch).toBe(false);
    expect(result.validForModel).toBe(false);
    expect(result.error).toContain('first');
  });

  it('should detect when only second mismatches model', () => {
    const first = createTestEmbedding(1024);
    const second = createTestEmbedding(512);

    const result = validateEmbeddingPair(first, second, {
      model: EmbeddingModel.MULTILINGUAL_E5_LARGE,
    });

    expect(result.dimensionsMatch).toBe(false);
    expect(result.validForModel).toBe(false);
    expect(result.error).toContain('second');
  });

  it('should throw with throwOnError', () => {
    const first = createTestEmbedding(1024);
    const second = createTestEmbedding(512);

    expect(() =>
      validateEmbeddingPair(first, second, { throwOnError: true })
    ).toThrow(EmbeddingError);
  });
});

// =============================================================================
// assertEmbeddingPairDimensions() Tests
// =============================================================================

describe('assertEmbeddingPairDimensions()', () => {
  it('should not throw for matching dimensions', () => {
    const first = createValidEmbedding();
    const second = createValidEmbedding();

    expect(() => assertEmbeddingPairDimensions(first, second)).not.toThrow();
  });

  it('should throw for mismatched dimensions', () => {
    const first = createTestEmbedding(1024);
    const second = createTestEmbedding(512);

    expect(() => assertEmbeddingPairDimensions(first, second)).toThrow(
      EmbeddingError
    );
  });

  it('should throw for model mismatch', () => {
    const first = createTestEmbedding(512);
    const second = createTestEmbedding(512);

    expect(() =>
      assertEmbeddingPairDimensions(first, second, {
        model: EmbeddingModel.MULTILINGUAL_E5_LARGE,
      })
    ).toThrow(EmbeddingError);
  });
});

// =============================================================================
// Utility Functions Tests
// =============================================================================

describe('areDimensionsConsistent()', () => {
  it('should return true for empty array', () => {
    expect(areDimensionsConsistent([])).toBe(true);
  });

  it('should return true for single embedding', () => {
    expect(areDimensionsConsistent([createTestEmbedding(512)])).toBe(true);
  });

  it('should return true for consistent dimensions', () => {
    const embeddings = [
      createTestEmbedding(1024),
      createTestEmbedding(1024),
      createTestEmbedding(1024),
    ];
    expect(areDimensionsConsistent(embeddings)).toBe(true);
  });

  it('should return false for inconsistent dimensions', () => {
    const embeddings = [
      createTestEmbedding(1024),
      createTestEmbedding(512),
      createTestEmbedding(1024),
    ];
    expect(areDimensionsConsistent(embeddings)).toBe(false);
  });
});

describe('getEmbeddingDimensions()', () => {
  it('should return correct dimensions', () => {
    expect(getEmbeddingDimensions(createTestEmbedding(1024))).toBe(1024);
    expect(getEmbeddingDimensions(createTestEmbedding(512))).toBe(512);
    expect(getEmbeddingDimensions([])).toBe(0);
  });
});

describe('hasExpectedDimensions()', () => {
  it('should return true for matching dimensions', () => {
    const embedding = createTestEmbedding(1024);
    expect(
      hasExpectedDimensions(embedding, EmbeddingModel.MULTILINGUAL_E5_LARGE)
    ).toBe(true);
  });

  it('should return false for wrong dimensions', () => {
    const embedding = createTestEmbedding(512);
    expect(
      hasExpectedDimensions(embedding, EmbeddingModel.MULTILINGUAL_E5_LARGE)
    ).toBe(false);
  });
});

describe('formatDimensionValidation()', () => {
  it('should format valid result', () => {
    const result = validateEmbeddingDimensions(createTestEmbedding(1024), {
      model: EmbeddingModel.MULTILINGUAL_E5_LARGE,
    });

    const formatted = formatDimensionValidation(result);

    expect(formatted).toContain('✓');
    expect(formatted).toContain('Valid');
    expect(formatted).toContain('1024');
    expect(formatted).toContain('matches expected');
  });

  it('should format invalid result', () => {
    const result = validateEmbeddingDimensions(createTestEmbedding(512), {
      expectedDimensions: 1024,
    });

    const formatted = formatDimensionValidation(result);

    expect(formatted).toContain('✗');
    expect(formatted).toContain('Invalid');
    expect(formatted).toContain('512');
    expect(formatted).toContain('expected 1024');
    expect(formatted).toContain('-512');
  });

  it('should format result without expected dimensions', () => {
    const result = validateEmbeddingDimensions(createTestEmbedding(512));

    const formatted = formatDimensionValidation(result);

    expect(formatted).toContain('Valid');
    expect(formatted).toContain('512');
    expect(formatted).not.toContain('matches expected');
  });
});

describe('formatBatchDimensionValidation()', () => {
  it('should format all-valid batch', () => {
    const embeddings = [createTestEmbedding(1024), createTestEmbedding(1024)];
    const result = validateBatchDimensions(embeddings, {
      expectedDimensions: 1024,
    });

    const formatted = formatBatchDimensionValidation(result);

    expect(formatted).toContain('✓');
    expect(formatted).toContain('All 2 embeddings');
    expect(formatted).toContain('valid');
  });

  it('should format batch with invalid embeddings', () => {
    const embeddings = [
      createTestEmbedding(1024),
      createTestEmbedding(512),
      createTestEmbedding(1024),
    ];
    const result = validateBatchDimensions(embeddings, {
      expectedDimensions: 1024,
    });

    const formatted = formatBatchDimensionValidation(result);

    expect(formatted).toContain('✗');
    expect(formatted).toContain('1 of 3');
    expect(formatted).toContain('invalid');
  });

  it('should show dimension distribution', () => {
    const embeddings = [
      createTestEmbedding(1024),
      createTestEmbedding(512),
      createTestEmbedding(512),
    ];
    const result = validateBatchDimensions(embeddings);

    const formatted = formatBatchDimensionValidation(result);

    expect(formatted).toContain('Dimension distribution');
    expect(formatted).toContain('1024');
    expect(formatted).toContain('512');
  });

  it('should handle uniform dimensions', () => {
    const embeddings = [createTestEmbedding(1024), createTestEmbedding(1024)];
    const result = validateBatchDimensions(embeddings);

    const formatted = formatBatchDimensionValidation(result);

    expect(formatted).toContain('All embeddings have 1024 dimensions');
  });
});

describe('createModelDimensionValidator()', () => {
  it('should create validator for specific model', () => {
    const validate = createModelDimensionValidator(
      EmbeddingModel.MULTILINGUAL_E5_LARGE
    );

    const validResult = validate(createTestEmbedding(1024));
    expect(validResult.valid).toBe(true);

    const invalidResult = validate(createTestEmbedding(512));
    expect(invalidResult.valid).toBe(false);
  });

  it('should accept default options', () => {
    const validate = createModelDimensionValidator(
      EmbeddingModel.MULTILINGUAL_E5_LARGE,
      { errorMessagePrefix: 'E5 validation' }
    );

    const result = validate(createTestEmbedding(512));
    expect(result.error).toContain('E5 validation');
  });

  it('should allow overriding options per call', () => {
    const validate = createModelDimensionValidator(
      EmbeddingModel.MULTILINGUAL_E5_LARGE,
      { errorMessagePrefix: 'Default' }
    );

    const result = validate(createTestEmbedding(512), {
      errorMessagePrefix: 'Custom',
    });
    expect(result.error).toContain('Custom');
  });
});

// =============================================================================
// Qdrant-Specific Tests
// =============================================================================

describe('QDRANT_COLLECTION_DIMENSIONS', () => {
  it('should define ISRAELI_LAWS collection dimensions', () => {
    expect(QDRANT_COLLECTION_DIMENSIONS.ISRAELI_LAWS).toBe(1024);
  });
});

describe('validateForQdrantCollection()', () => {
  it('should validate embedding for ISRAELI_LAWS collection', () => {
    const embedding = createTestEmbedding(1024);
    const result = validateForQdrantCollection(embedding, 'ISRAELI_LAWS');

    expect(result.valid).toBe(true);
    expect(result.expectedDimensions).toBe(1024);
  });

  it('should detect invalid dimensions for collection', () => {
    const embedding = createTestEmbedding(512);
    const result = validateForQdrantCollection(embedding, 'ISRAELI_LAWS');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('ISRAELI_LAWS');
  });

  it('should use custom error prefix', () => {
    const embedding = createTestEmbedding(512);
    const result = validateForQdrantCollection(embedding, 'ISRAELI_LAWS', {
      errorMessagePrefix: 'Custom',
    });

    expect(result.error).toContain('Custom');
  });

  it('should throw with throwOnError', () => {
    const embedding = createTestEmbedding(512);

    expect(() =>
      validateForQdrantCollection(embedding, 'ISRAELI_LAWS', {
        throwOnError: true,
      })
    ).toThrow(EmbeddingError);
  });
});

describe('validateBatchForQdrant()', () => {
  it('should validate batch for collection', () => {
    const embeddings = [createTestEmbedding(1024), createTestEmbedding(1024)];
    const result = validateBatchForQdrant(embeddings, 'ISRAELI_LAWS');

    expect(result.allValid).toBe(true);
    expect(result.totalCount).toBe(2);
  });

  it('should detect invalid embeddings in batch', () => {
    const embeddings = [createTestEmbedding(1024), createTestEmbedding(512)];
    const result = validateBatchForQdrant(embeddings, 'ISRAELI_LAWS');

    expect(result.allValid).toBe(false);
    expect(result.invalidCount).toBe(1);
  });

  it('should include collection name in error messages', () => {
    const embeddings = [createTestEmbedding(512)];
    const result = validateBatchForQdrant(embeddings, 'ISRAELI_LAWS');

    expect(result.results[0]!.error).toContain('ISRAELI_LAWS');
  });
});
