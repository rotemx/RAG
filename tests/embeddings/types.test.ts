/**
 * Unit Tests for Embedding Types and Utilities
 *
 * Tests the type definitions, Zod schemas, and utility functions:
 * - EmbeddingModel constants and validation
 * - E5EmbedderConfig schema and defaults
 * - EmbeddingType and E5 prefixes
 * - EmbeddingResult and BatchEmbeddingResult schemas
 * - EmbeddingError class
 * - Utility functions (vector operations, prefix handling)
 */

import { describe, it, expect } from 'vitest';
import {
  // Model constants
  EmbeddingModel,
  EmbeddingModelSchema,
  MODEL_DIMENSIONS,
  DEFAULT_EMBEDDING_MODEL,
  getModelDimensions,

  // Configuration
  E5EmbedderConfigSchema,
  createDefaultE5Config,

  // Embedding types
  EmbeddingType,
  EmbeddingTypeSchema,
  E5_PREFIXES,
  applyE5Prefix,
  removeE5Prefix,
  hasE5Prefix,

  // Result schemas
  EmbeddingResultSchema,
  BatchEmbeddingResultSchema,
  EmbedTextInputSchema,
  EmbedBatchInputSchema,

  // Error types
  EmbeddingErrorCode,
  EmbeddingErrorCodeSchema,
  EmbeddingError,
  isEmbeddingError,

  // Utility functions
  validateDimensions,
  normalizeVector,
  cosineSimilarity,
  dotProduct,
} from '../../lib/src/embeddings/index.js';

// =============================================================================
// Model Constants Tests
// =============================================================================

describe('EmbeddingModel', () => {
  it('should define multilingual-e5-large model', () => {
    expect(EmbeddingModel.MULTILINGUAL_E5_LARGE).toBe(
      'intfloat/multilingual-e5-large'
    );
  });

  it('should define quantized multilingual-e5-large model', () => {
    expect(EmbeddingModel.MULTILINGUAL_E5_LARGE_QUANTIZED).toBe(
      'Xenova/multilingual-e5-large'
    );
  });

  it('should validate valid model names with schema', () => {
    expect(
      EmbeddingModelSchema.safeParse('intfloat/multilingual-e5-large').success
    ).toBe(true);
    expect(
      EmbeddingModelSchema.safeParse('Xenova/multilingual-e5-large').success
    ).toBe(true);
  });

  it('should reject invalid model names with schema', () => {
    expect(EmbeddingModelSchema.safeParse('invalid-model').success).toBe(false);
    expect(EmbeddingModelSchema.safeParse('').success).toBe(false);
  });
});

describe('MODEL_DIMENSIONS', () => {
  it('should define 1024 dimensions for multilingual-e5-large', () => {
    expect(MODEL_DIMENSIONS[EmbeddingModel.MULTILINGUAL_E5_LARGE]).toBe(1024);
  });

  it('should define 1024 dimensions for quantized model', () => {
    expect(MODEL_DIMENSIONS[EmbeddingModel.MULTILINGUAL_E5_LARGE_QUANTIZED]).toBe(
      1024
    );
  });
});

describe('getModelDimensions()', () => {
  it('should return correct dimensions for each model', () => {
    expect(getModelDimensions(EmbeddingModel.MULTILINGUAL_E5_LARGE)).toBe(1024);
    expect(
      getModelDimensions(EmbeddingModel.MULTILINGUAL_E5_LARGE_QUANTIZED)
    ).toBe(1024);
  });
});

describe('DEFAULT_EMBEDDING_MODEL', () => {
  it('should be the quantized model by default', () => {
    expect(DEFAULT_EMBEDDING_MODEL).toBe(
      EmbeddingModel.MULTILINGUAL_E5_LARGE_QUANTIZED
    );
  });
});

// =============================================================================
// E5EmbedderConfig Tests
// =============================================================================

describe('E5EmbedderConfigSchema', () => {
  it('should accept empty config and apply defaults', () => {
    const result = E5EmbedderConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.model).toBe(DEFAULT_EMBEDDING_MODEL);
      expect(result.data.quantized).toBe(true);
      expect(result.data.maxSequenceLength).toBe(512);
      expect(result.data.normalize).toBe(true);
      expect(result.data.batchSize).toBe(32);
      expect(result.data.enableCache).toBe(true);
      expect(result.data.maxCacheSize).toBe(10000);
      expect(result.data.device).toBe('auto');
    }
  });

  it('should accept custom configuration', () => {
    const result = E5EmbedderConfigSchema.safeParse({
      model: EmbeddingModel.MULTILINGUAL_E5_LARGE,
      quantized: false,
      maxSequenceLength: 256,
      normalize: false,
      batchSize: 64,
      enableCache: false,
      maxCacheSize: 5000,
      device: 'cpu',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.model).toBe(EmbeddingModel.MULTILINGUAL_E5_LARGE);
      expect(result.data.quantized).toBe(false);
      expect(result.data.maxSequenceLength).toBe(256);
      expect(result.data.normalize).toBe(false);
      expect(result.data.batchSize).toBe(64);
      expect(result.data.enableCache).toBe(false);
      expect(result.data.maxCacheSize).toBe(5000);
      expect(result.data.device).toBe('cpu');
    }
  });

  it('should reject invalid maxSequenceLength', () => {
    expect(
      E5EmbedderConfigSchema.safeParse({ maxSequenceLength: 513 }).success
    ).toBe(false);
    expect(
      E5EmbedderConfigSchema.safeParse({ maxSequenceLength: 0 }).success
    ).toBe(false);
    expect(
      E5EmbedderConfigSchema.safeParse({ maxSequenceLength: -1 }).success
    ).toBe(false);
  });

  it('should reject invalid batchSize', () => {
    expect(E5EmbedderConfigSchema.safeParse({ batchSize: 129 }).success).toBe(
      false
    );
    expect(E5EmbedderConfigSchema.safeParse({ batchSize: 0 }).success).toBe(
      false
    );
  });

  it('should reject invalid device', () => {
    expect(E5EmbedderConfigSchema.safeParse({ device: 'invalid' }).success).toBe(
      false
    );
  });
});

describe('createDefaultE5Config()', () => {
  it('should create default configuration', () => {
    const config = createDefaultE5Config();
    expect(config.model).toBe(DEFAULT_EMBEDDING_MODEL);
    expect(config.quantized).toBe(true);
    expect(config.maxSequenceLength).toBe(512);
  });

  it('should apply overrides', () => {
    const config = createDefaultE5Config({
      batchSize: 16,
      enableCache: false,
    });

    expect(config.batchSize).toBe(16);
    expect(config.enableCache).toBe(false);
    // Defaults should still be applied for other fields
    expect(config.model).toBe(DEFAULT_EMBEDDING_MODEL);
  });
});

// =============================================================================
// EmbeddingType Tests
// =============================================================================

describe('EmbeddingType', () => {
  it('should define query and passage types', () => {
    expect(EmbeddingType.QUERY).toBe('query');
    expect(EmbeddingType.DOCUMENT).toBe('passage');
  });
});

describe('EmbeddingTypeSchema', () => {
  it('should validate valid types', () => {
    expect(EmbeddingTypeSchema.safeParse('query').success).toBe(true);
    expect(EmbeddingTypeSchema.safeParse('passage').success).toBe(true);
  });

  it('should reject invalid types', () => {
    expect(EmbeddingTypeSchema.safeParse('document').success).toBe(false);
    expect(EmbeddingTypeSchema.safeParse('').success).toBe(false);
  });
});

describe('E5_PREFIXES', () => {
  it('should define correct prefixes', () => {
    expect(E5_PREFIXES[EmbeddingType.QUERY]).toBe('query: ');
    expect(E5_PREFIXES[EmbeddingType.DOCUMENT]).toBe('passage: ');
  });
});

describe('applyE5Prefix()', () => {
  it('should apply query prefix', () => {
    const result = applyE5Prefix('מהו חוק חופש המידע?', EmbeddingType.QUERY);
    expect(result).toBe('query: מהו חוק חופש המידע?');
  });

  it('should apply passage prefix', () => {
    const result = applyE5Prefix('חוק חופש המידע', EmbeddingType.DOCUMENT);
    expect(result).toBe('passage: חוק חופש המידע');
  });

  it('should handle empty text', () => {
    const result = applyE5Prefix('', EmbeddingType.QUERY);
    expect(result).toBe('query: ');
  });
});

describe('removeE5Prefix()', () => {
  it('should remove query prefix', () => {
    const result = removeE5Prefix('query: מהו חוק חופש המידע?');
    expect(result).toBe('מהו חוק חופש המידע?');
  });

  it('should remove passage prefix', () => {
    const result = removeE5Prefix('passage: חוק חופש המידע');
    expect(result).toBe('חוק חופש המידע');
  });

  it('should return text unchanged if no prefix', () => {
    const result = removeE5Prefix('no prefix here');
    expect(result).toBe('no prefix here');
  });

  it('should handle empty text', () => {
    const result = removeE5Prefix('');
    expect(result).toBe('');
  });
});

describe('hasE5Prefix()', () => {
  it('should detect query prefix', () => {
    expect(hasE5Prefix('query: some text')).toBe(true);
  });

  it('should detect passage prefix', () => {
    expect(hasE5Prefix('passage: some text')).toBe(true);
  });

  it('should return false for text without prefix', () => {
    expect(hasE5Prefix('no prefix')).toBe(false);
  });

  it('should return false for similar but not exact prefix', () => {
    expect(hasE5Prefix('query:no-space')).toBe(false);
    expect(hasE5Prefix('Query: capitalized')).toBe(false);
  });
});

// =============================================================================
// Result Schema Tests
// =============================================================================

describe('EmbeddingResultSchema', () => {
  it('should validate a valid embedding result', () => {
    const result = EmbeddingResultSchema.safeParse({
      embedding: [0.1, 0.2, 0.3],
      dimensions: 3,
      text: 'test',
      type: 'query',
      tokenCount: 1,
      truncated: false,
      cached: false,
      durationMs: 10,
    });

    expect(result.success).toBe(true);
  });

  it('should reject invalid embedding type', () => {
    const result = EmbeddingResultSchema.safeParse({
      embedding: [0.1, 0.2, 0.3],
      dimensions: 3,
      text: 'test',
      type: 'invalid',
      tokenCount: 1,
      truncated: false,
      cached: false,
      durationMs: 10,
    });

    expect(result.success).toBe(false);
  });

  it('should reject negative duration', () => {
    const result = EmbeddingResultSchema.safeParse({
      embedding: [0.1, 0.2, 0.3],
      dimensions: 3,
      text: 'test',
      type: 'query',
      tokenCount: 1,
      truncated: false,
      cached: false,
      durationMs: -1,
    });

    expect(result.success).toBe(false);
  });
});

describe('BatchEmbeddingResultSchema', () => {
  it('should validate a valid batch result', () => {
    const result = BatchEmbeddingResultSchema.safeParse({
      embeddings: [],
      count: 0,
      totalDurationMs: 100,
      avgDurationMs: 0,
      cacheHits: 0,
      cacheMisses: 0,
      truncatedCount: 0,
      model: 'Xenova/multilingual-e5-large',
    });

    expect(result.success).toBe(true);
  });
});

describe('EmbedTextInputSchema', () => {
  it('should validate valid input with defaults', () => {
    const result = EmbedTextInputSchema.safeParse({ text: 'hello' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.text).toBe('hello');
      expect(result.data.type).toBe('passage');
      expect(result.data.skipCache).toBe(false);
    }
  });

  it('should reject empty text', () => {
    const result = EmbedTextInputSchema.safeParse({ text: '' });
    expect(result.success).toBe(false);
  });
});

describe('EmbedBatchInputSchema', () => {
  it('should validate valid batch input', () => {
    const result = EmbedBatchInputSchema.safeParse({
      texts: ['text1', 'text2'],
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty array', () => {
    const result = EmbedBatchInputSchema.safeParse({ texts: [] });
    expect(result.success).toBe(false);
  });

  it('should reject array with empty strings', () => {
    const result = EmbedBatchInputSchema.safeParse({
      texts: ['valid', ''],
    });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Error Types Tests
// =============================================================================

describe('EmbeddingErrorCode', () => {
  it('should define all error codes', () => {
    expect(EmbeddingErrorCode.MODEL_LOAD_ERROR).toBe('MODEL_LOAD_ERROR');
    expect(EmbeddingErrorCode.MODEL_NOT_INITIALIZED).toBe('MODEL_NOT_INITIALIZED');
    expect(EmbeddingErrorCode.EMPTY_INPUT).toBe('EMPTY_INPUT');
    expect(EmbeddingErrorCode.INPUT_TOO_LONG).toBe('INPUT_TOO_LONG');
    expect(EmbeddingErrorCode.COMPUTATION_ERROR).toBe('COMPUTATION_ERROR');
    expect(EmbeddingErrorCode.DIMENSION_MISMATCH).toBe('DIMENSION_MISMATCH');
    expect(EmbeddingErrorCode.UNKNOWN).toBe('UNKNOWN');
  });
});

describe('EmbeddingErrorCodeSchema', () => {
  it('should validate all error codes', () => {
    Object.values(EmbeddingErrorCode).forEach((code) => {
      expect(EmbeddingErrorCodeSchema.safeParse(code).success).toBe(true);
    });
  });

  it('should reject invalid error codes', () => {
    expect(EmbeddingErrorCodeSchema.safeParse('INVALID_CODE').success).toBe(
      false
    );
  });
});

describe('EmbeddingError', () => {
  it('should create error with message and code', () => {
    const error = new EmbeddingError(
      'Model failed to load',
      EmbeddingErrorCode.MODEL_LOAD_ERROR
    );

    expect(error.message).toBe('Model failed to load');
    expect(error.code).toBe(EmbeddingErrorCode.MODEL_LOAD_ERROR);
    expect(error.name).toBe('EmbeddingError');
    expect(error.cause).toBeUndefined();
  });

  it('should store cause error', () => {
    const cause = new Error('Original error');
    const error = new EmbeddingError(
      'Wrapped error',
      EmbeddingErrorCode.COMPUTATION_ERROR,
      { cause }
    );

    expect(error.cause).toBe(cause);
  });

  it('should extend Error', () => {
    const error = new EmbeddingError(
      'Test error',
      EmbeddingErrorCode.UNKNOWN
    );

    expect(error instanceof Error).toBe(true);
    expect(error instanceof EmbeddingError).toBe(true);
  });
});

describe('EmbeddingError.fromError()', () => {
  it('should return existing EmbeddingError unchanged', () => {
    const original = new EmbeddingError(
      'Original',
      EmbeddingErrorCode.MODEL_LOAD_ERROR
    );
    const result = EmbeddingError.fromError(original);

    expect(result).toBe(original);
  });

  it('should wrap Error with message', () => {
    const original = new Error('Something went wrong');
    const result = EmbeddingError.fromError(original);

    expect(result.message).toBe('Something went wrong');
    expect(result.code).toBe(EmbeddingErrorCode.UNKNOWN);
    expect(result.cause).toBe(original);
  });

  it('should wrap non-Error with string conversion', () => {
    const result = EmbeddingError.fromError('string error');

    expect(result.message).toBe('string error');
    expect(result.code).toBe(EmbeddingErrorCode.UNKNOWN);
    expect(result.cause).toBeUndefined();
  });

  it('should use provided error code', () => {
    const original = new Error('Failed');
    const result = EmbeddingError.fromError(
      original,
      EmbeddingErrorCode.COMPUTATION_ERROR
    );

    expect(result.code).toBe(EmbeddingErrorCode.COMPUTATION_ERROR);
  });
});

describe('isEmbeddingError()', () => {
  it('should return true for EmbeddingError', () => {
    const error = new EmbeddingError('Test', EmbeddingErrorCode.UNKNOWN);
    expect(isEmbeddingError(error)).toBe(true);
  });

  it('should return false for regular Error', () => {
    const error = new Error('Test');
    expect(isEmbeddingError(error)).toBe(false);
  });

  it('should return false for non-errors', () => {
    expect(isEmbeddingError('string')).toBe(false);
    expect(isEmbeddingError(null)).toBe(false);
    expect(isEmbeddingError(undefined)).toBe(false);
    expect(isEmbeddingError({})).toBe(false);
  });
});

// =============================================================================
// Utility Functions Tests
// =============================================================================

describe('validateDimensions()', () => {
  it('should return true for matching dimensions', () => {
    const embedding = new Array(1024).fill(0);
    expect(
      validateDimensions(embedding, EmbeddingModel.MULTILINGUAL_E5_LARGE)
    ).toBe(true);
  });

  it('should return false for wrong dimensions', () => {
    const embedding = new Array(512).fill(0);
    expect(
      validateDimensions(embedding, EmbeddingModel.MULTILINGUAL_E5_LARGE)
    ).toBe(false);
  });

  it('should handle empty array', () => {
    expect(
      validateDimensions([], EmbeddingModel.MULTILINGUAL_E5_LARGE)
    ).toBe(false);
  });
});

describe('normalizeVector()', () => {
  it('should normalize vector to unit length', () => {
    const vector = [3, 4]; // Magnitude is 5
    const normalized = normalizeVector(vector);

    expect(normalized[0]).toBeCloseTo(0.6);
    expect(normalized[1]).toBeCloseTo(0.8);

    // Check magnitude is 1
    const magnitude = Math.sqrt(
      normalized.reduce((sum, val) => sum + val * val, 0)
    );
    expect(magnitude).toBeCloseTo(1);
  });

  it('should handle already normalized vector', () => {
    const vector = [0.6, 0.8]; // Already normalized
    const normalized = normalizeVector(vector);

    expect(normalized[0]).toBeCloseTo(0.6);
    expect(normalized[1]).toBeCloseTo(0.8);
  });

  it('should handle zero vector', () => {
    const vector = [0, 0, 0];
    const normalized = normalizeVector(vector);

    expect(normalized).toEqual([0, 0, 0]);
  });

  it('should handle single element', () => {
    const vector = [5];
    const normalized = normalizeVector(vector);

    expect(normalized[0]).toBeCloseTo(1);
  });

  it('should handle negative values', () => {
    const vector = [-3, 4];
    const normalized = normalizeVector(vector);

    expect(normalized[0]).toBeCloseTo(-0.6);
    expect(normalized[1]).toBeCloseTo(0.8);
  });
});

describe('cosineSimilarity()', () => {
  it('should return 1 for identical vectors', () => {
    const a = [1, 2, 3];
    const similarity = cosineSimilarity(a, a);
    expect(similarity).toBeCloseTo(1);
  });

  it('should return -1 for opposite vectors', () => {
    const a = [1, 2, 3];
    const b = [-1, -2, -3];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(-1);
  });

  it('should return 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(0);
  });

  it('should handle normalized vectors', () => {
    const a = normalizeVector([1, 2, 3]);
    const b = normalizeVector([1, 2, 3]);
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(1);
  });

  it('should throw on dimension mismatch', () => {
    const a = [1, 2, 3];
    const b = [1, 2];

    expect(() => cosineSimilarity(a, b)).toThrow(EmbeddingError);
    expect(() => cosineSimilarity(a, b)).toThrow('dimension mismatch');
  });

  it('should handle zero vectors', () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBe(0);
  });
});

describe('dotProduct()', () => {
  it('should calculate correct dot product', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    // 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
    expect(dotProduct(a, b)).toBe(32);
  });

  it('should return 0 for orthogonal vectors', () => {
    const a = [1, 0];
    const b = [0, 1];
    expect(dotProduct(a, b)).toBe(0);
  });

  it('should handle negative values', () => {
    const a = [1, -2, 3];
    const b = [4, 5, 6];
    // 1*4 + (-2)*5 + 3*6 = 4 - 10 + 18 = 12
    expect(dotProduct(a, b)).toBe(12);
  });

  it('should throw on dimension mismatch', () => {
    const a = [1, 2, 3];
    const b = [1, 2];

    expect(() => dotProduct(a, b)).toThrow(EmbeddingError);
    expect(() => dotProduct(a, b)).toThrow('dimension mismatch');
  });

  it('should equal cosine similarity for normalized vectors', () => {
    const a = normalizeVector([1, 2, 3, 4, 5]);
    const b = normalizeVector([5, 4, 3, 2, 1]);

    const dot = dotProduct(a, b);
    const cosine = cosineSimilarity(a, b);

    expect(dot).toBeCloseTo(cosine);
  });
});
