/**
 * Unit Tests for Token Counter
 *
 * Tests the token counting functionality:
 * - TokenCounter class
 * - Global token counter instance
 * - Estimation-based counting
 * - Caching behavior
 * - Hebrew-specific utilities
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  TokenCounter,
  getGlobalTokenCounter,
  resetGlobalTokenCounter,
  countTokens,
  estimateTokens,
  tokensToChars,
  charsToTokens,
  countHebrewChars,
  getHebrewRatio,
  estimateCharsPerToken,
  adaptiveTokenCount,
} from '../../lib/src/chunking/index.js';

// =============================================================================
// Test Setup
// =============================================================================

beforeEach(() => {
  // Reset global counter before each test
  resetGlobalTokenCounter();
});

// =============================================================================
// TokenCounter Class Tests
// =============================================================================

describe('TokenCounter', () => {
  describe('constructor', () => {
    it('should create counter with default config', () => {
      const counter = new TokenCounter();
      expect(counter.getCharsPerToken()).toBe(2.5);
      expect(counter.hasTokenizer()).toBe(false);
    });

    it('should accept custom config', () => {
      const counter = new TokenCounter({
        charsPerToken: 3.0,
        useTokenizer: false,
        maxCacheSize: 5000,
      });
      expect(counter.getCharsPerToken()).toBe(3.0);
    });
  });

  describe('count()', () => {
    it('should count tokens using estimation', () => {
      const counter = new TokenCounter({ useTokenizer: false });
      const result = counter.count('Hello world');

      expect(result.count).toBeGreaterThan(0);
      expect(result.estimated).toBe(true);
      expect(result.method).toBe('estimation');
    });

    it('should use default chars per token (2.5)', () => {
      const counter = new TokenCounter({ useTokenizer: false });
      const text = 'a'.repeat(100);
      const result = counter.count(text);

      // 100 chars / 2.5 = 40 tokens
      expect(result.count).toBe(40);
    });

    it('should use custom chars per token in options', () => {
      const counter = new TokenCounter({ useTokenizer: false });
      const text = 'a'.repeat(100);
      const result = counter.count(text, { charsPerToken: 4 });

      // 100 chars / 4 = 25 tokens
      expect(result.count).toBe(25);
    });

    it('should round up token count', () => {
      const counter = new TokenCounter({ useTokenizer: false });
      const text = 'abc'; // 3 chars / 2.5 = 1.2 -> 2
      const result = counter.count(text);

      expect(result.count).toBe(2);
    });
  });

  describe('caching', () => {
    it('should cache results by default', () => {
      const counter = new TokenCounter({ useTokenizer: false });
      const text = 'Test text for caching';

      const result1 = counter.count(text);
      const result2 = counter.count(text);

      expect(result1.method).toBe('estimation');
      expect(result2.method).toBe('cached');
      expect(result1.count).toBe(result2.count);
    });

    it('should not use cache when disabled', () => {
      const counter = new TokenCounter({ useTokenizer: false });
      const text = 'Test text';

      const result1 = counter.count(text);
      const result2 = counter.count(text, { useCache: false });

      expect(result1.method).toBe('estimation');
      expect(result2.method).toBe('estimation');
    });

    it('should force recount when requested', () => {
      const counter = new TokenCounter({ useTokenizer: false });
      const text = 'Test text';

      counter.count(text); // Cache it
      const result = counter.count(text, { forceRecount: true });

      expect(result.method).toBe('estimation');
    });

    it('should clear cache', () => {
      const counter = new TokenCounter({ useTokenizer: false });
      const text = 'Test text';

      counter.count(text); // Cache it
      counter.clearCache();
      const result = counter.count(text);

      expect(result.method).toBe('estimation');
    });

    it('should respect max cache size', () => {
      const counter = new TokenCounter({
        useTokenizer: false,
        maxCacheSize: 3,
      });

      // Fill cache beyond capacity
      counter.count('text1');
      counter.count('text2');
      counter.count('text3');
      counter.count('text4');

      const stats = counter.getCacheStats();
      expect(stats.size).toBeLessThanOrEqual(3);
    });
  });

  describe('countMany()', () => {
    it('should count tokens for multiple texts', () => {
      const counter = new TokenCounter({ useTokenizer: false });
      const texts = ['Hello', 'World', 'Test'];

      const results = counter.countMany(texts);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.count).toBeGreaterThan(0);
      });
    });
  });

  describe('countTotal()', () => {
    it('should sum token counts', () => {
      const counter = new TokenCounter({ useTokenizer: false });
      const texts = ['a'.repeat(25), 'b'.repeat(25)]; // 10 + 10 = 20 tokens

      const total = counter.countTotal(texts);

      expect(total).toBe(20);
    });
  });

  describe('exceedsLimit()', () => {
    it('should detect when text exceeds limit', () => {
      const counter = new TokenCounter({ useTokenizer: false });
      const text = 'a'.repeat(250); // 100 tokens

      expect(counter.exceedsLimit(text, 50)).toBe(true);
      expect(counter.exceedsLimit(text, 100)).toBe(false);
      expect(counter.exceedsLimit(text, 150)).toBe(false);
    });
  });

  describe('remainingTokens()', () => {
    it('should calculate remaining tokens before limit', () => {
      const counter = new TokenCounter({ useTokenizer: false });
      const text = 'a'.repeat(125); // 50 tokens

      expect(counter.remainingTokens(text, 100)).toBe(50);
      expect(counter.remainingTokens(text, 50)).toBe(0);
      expect(counter.remainingTokens(text, 40)).toBe(0); // Clamped to 0
    });
  });

  describe('getCacheStats()', () => {
    it('should return cache statistics', () => {
      const counter = new TokenCounter({
        useTokenizer: false,
        maxCacheSize: 100,
      });

      counter.count('text1');
      counter.count('text2');

      const stats = counter.getCacheStats();

      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(100);
    });
  });

  describe('setTokenizer()', () => {
    it('should use provided tokenizer', () => {
      const counter = new TokenCounter();

      // Mock tokenizer
      const mockTokenizer = {
        encode: vi.fn().mockReturnValue({
          input_ids: { data: [1, 2, 3, 4, 5] },
        }),
      };

      counter.setTokenizer(mockTokenizer);
      const result = counter.count('Test text');

      expect(result.count).toBe(5);
      expect(result.estimated).toBe(false);
      expect(result.method).toBe('tokenizer');
      expect(mockTokenizer.encode).toHaveBeenCalledWith('Test text');
    });

    it('should fall back to estimation on tokenizer error', () => {
      const counter = new TokenCounter();

      const mockTokenizer = {
        encode: vi.fn().mockImplementation(() => {
          throw new Error('Tokenizer error');
        }),
      };

      counter.setTokenizer(mockTokenizer);
      const result = counter.count('Test text');

      expect(result.estimated).toBe(true);
      expect(result.method).toBe('estimation');
    });
  });

  describe('initializeTokenizer()', () => {
    it('should return false when useTokenizer is disabled', async () => {
      const counter = new TokenCounter({ useTokenizer: false });
      const result = await counter.initializeTokenizer();
      expect(result).toBe(false);
    });

    it('should handle tokenizer loading failure gracefully', async () => {
      const counter = new TokenCounter({ useTokenizer: true });

      // Module not installed in test environment
      const result = await counter.initializeTokenizer();

      // Should return false (tokenizer not available) but not throw
      expect(typeof result).toBe('boolean');
    });
  });
});

// =============================================================================
// Global Token Counter Tests
// =============================================================================

describe('Global Token Counter', () => {
  describe('getGlobalTokenCounter()', () => {
    it('should return a singleton instance', () => {
      const counter1 = getGlobalTokenCounter();
      const counter2 = getGlobalTokenCounter();

      expect(counter1).toBe(counter2);
    });

    it('should create new instance after reset', () => {
      const counter1 = getGlobalTokenCounter();
      resetGlobalTokenCounter();
      const counter2 = getGlobalTokenCounter();

      expect(counter1).not.toBe(counter2);
    });

    it('should accept config on first call', () => {
      const counter = getGlobalTokenCounter({ charsPerToken: 3.5 });
      expect(counter.getCharsPerToken()).toBe(3.5);
    });
  });

  describe('countTokens()', () => {
    it('should use global counter', () => {
      const result = countTokens('Test text');

      expect(result.count).toBeGreaterThan(0);
      expect(typeof result.estimated).toBe('boolean');
    });

    it('should cache across calls', () => {
      const text = 'Reusable text';
      const result1 = countTokens(text);
      const result2 = countTokens(text);

      expect(result1.count).toBe(result2.count);
      expect(result2.method).toBe('cached');
    });
  });
});

// =============================================================================
// Estimation Utility Tests
// =============================================================================

describe('estimateTokens()', () => {
  it('should estimate tokens from character count', () => {
    expect(estimateTokens('a'.repeat(100))).toBe(40); // 100 / 2.5
    expect(estimateTokens('a'.repeat(50))).toBe(20); // 50 / 2.5
  });

  it('should use custom chars per token', () => {
    expect(estimateTokens('a'.repeat(100), 4)).toBe(25);
    expect(estimateTokens('a'.repeat(100), 2)).toBe(50);
  });

  it('should round up', () => {
    expect(estimateTokens('abc')).toBe(2); // 3 / 2.5 = 1.2 -> 2
  });
});

describe('tokensToChars()', () => {
  it('should convert tokens to characters', () => {
    expect(tokensToChars(40)).toBe(100); // 40 * 2.5 = 100
    expect(tokensToChars(20)).toBe(50); // 20 * 2.5 = 50
  });

  it('should use custom chars per token', () => {
    expect(tokensToChars(25, 4)).toBe(100);
    expect(tokensToChars(50, 2)).toBe(100);
  });

  it('should floor result', () => {
    expect(tokensToChars(3, 2.5)).toBe(7); // 3 * 2.5 = 7.5 -> 7
  });
});

describe('charsToTokens()', () => {
  it('should convert characters to tokens', () => {
    expect(charsToTokens(100)).toBe(40); // 100 / 2.5 = 40
    expect(charsToTokens(50)).toBe(20); // 50 / 2.5 = 20
  });

  it('should use custom chars per token', () => {
    expect(charsToTokens(100, 4)).toBe(25);
    expect(charsToTokens(100, 2)).toBe(50);
  });

  it('should round up', () => {
    expect(charsToTokens(7)).toBe(3); // 7 / 2.5 = 2.8 -> 3
  });
});

// =============================================================================
// Hebrew-Specific Utility Tests
// =============================================================================

describe('countHebrewChars()', () => {
  it('should count Hebrew characters', () => {
    expect(countHebrewChars('שלום')).toBe(4);
    expect(countHebrewChars('אבגדהוזחטיכלמנסעפצקרשת')).toBe(22);
  });

  it('should not count non-Hebrew characters', () => {
    expect(countHebrewChars('Hello')).toBe(0);
    expect(countHebrewChars('12345')).toBe(0);
    expect(countHebrewChars('   ')).toBe(0);
  });

  it('should handle mixed text', () => {
    expect(countHebrewChars('שלום Hello')).toBe(4);
    expect(countHebrewChars('Test בדיקה 123')).toBe(5);
  });

  it('should count Hebrew vowels and cantillation marks', () => {
    // These are in the Hebrew Unicode block (U+0590-U+05FF)
    const textWithNiqqud = 'שָׁלוֹם'; // with vowels
    expect(countHebrewChars(textWithNiqqud)).toBeGreaterThanOrEqual(4);
  });

  it('should handle empty string', () => {
    expect(countHebrewChars('')).toBe(0);
  });
});

describe('getHebrewRatio()', () => {
  it('should calculate ratio of Hebrew characters', () => {
    expect(getHebrewRatio('שלום')).toBe(1); // 100% Hebrew
    expect(getHebrewRatio('Hello')).toBe(0); // 0% Hebrew
  });

  it('should handle mixed text', () => {
    const ratio = getHebrewRatio('שלום Hello'); // 4 Hebrew, 5 English, 1 space (ignored)
    expect(ratio).toBeCloseTo(4 / 9, 1); // ~0.44
  });

  it('should ignore whitespace in calculation', () => {
    expect(getHebrewRatio('שלום')).toBe(getHebrewRatio('ש ל ו ם'));
  });

  it('should return 0 for empty or whitespace-only string', () => {
    expect(getHebrewRatio('')).toBe(0);
    expect(getHebrewRatio('   ')).toBe(0);
  });
});

describe('estimateCharsPerToken()', () => {
  it('should return lower value for pure Hebrew', () => {
    const hebrewRate = estimateCharsPerToken('שלום עולם');
    expect(hebrewRate).toBeLessThan(3); // Hebrew typically 2.2
  });

  it('should return higher value for pure English', () => {
    const englishRate = estimateCharsPerToken('Hello World');
    expect(englishRate).toBeCloseTo(4, 0.5); // English typically 4.0
  });

  it('should return intermediate value for mixed text', () => {
    const mixedRate = estimateCharsPerToken('שלום Hello');
    expect(mixedRate).toBeGreaterThan(2);
    expect(mixedRate).toBeLessThan(4);
  });
});

describe('adaptiveTokenCount()', () => {
  it('should use text content to estimate tokens', () => {
    const hebrewResult = adaptiveTokenCount('שלום עולם');
    const englishResult = adaptiveTokenCount('Hello World');

    expect(hebrewResult.estimated).toBe(true);
    expect(hebrewResult.method).toBe('estimation');

    // Hebrew text should result in more tokens per character
    // (or same chars = more tokens)
    // This is because Hebrew has fewer chars per token
  });

  it('should return more tokens for Hebrew text of same length', () => {
    // Hebrew: approximately 2.2 chars per token
    // English: approximately 4 chars per token
    const hebrewText = 'א'.repeat(100); // 100 chars -> ~45 tokens
    const englishText = 'a'.repeat(100); // 100 chars -> ~25 tokens

    const hebrewTokens = adaptiveTokenCount(hebrewText).count;
    const englishTokens = adaptiveTokenCount(englishText).count;

    expect(hebrewTokens).toBeGreaterThan(englishTokens);
  });

  it('should handle empty text', () => {
    const result = adaptiveTokenCount('');
    expect(result.count).toBe(0);
  });
});

// =============================================================================
// Edge Cases and Integration Tests
// =============================================================================

describe('Edge Cases', () => {
  it('should handle very long text', () => {
    const longText = 'א'.repeat(100000);
    const counter = new TokenCounter({ useTokenizer: false });

    const result = counter.count(longText);

    expect(result.count).toBe(40000); // 100000 / 2.5
  });

  it('should handle special characters', () => {
    const specialText = '!@#$%^&*()[]{}|\\:";\'<>,.?/~`';
    const result = countTokens(specialText);

    expect(result.count).toBeGreaterThan(0);
  });

  it('should handle newlines and tabs', () => {
    const text = 'Line 1\nLine 2\tTabbed';
    const result = countTokens(text);

    expect(result.count).toBeGreaterThan(0);
  });

  it('should handle Unicode emojis', () => {
    const text = '👋 שלום 🌍 World';
    const result = countTokens(text);

    expect(result.count).toBeGreaterThan(0);
  });

  it('should handle RTL marks', () => {
    const textWithRTL = '\u200F שלום \u200E Hello'; // RLM and LRM
    const result = countTokens(textWithRTL);

    expect(result.count).toBeGreaterThan(0);
  });
});
