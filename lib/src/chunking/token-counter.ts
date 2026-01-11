/**
 * Token Counting Utilities
 *
 * Provides token counting functionality for Hebrew legal texts.
 * Supports both estimation-based counting and tokenizer-based counting
 * when the @xenova/transformers library is available.
 */

import { TokenCountOptionsSchema, type TokenCountResult, type TokenCountOptions } from './types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Token counter interface for dependency injection
 */
export interface TokenizerInterface {
  /** Tokenize text and return token IDs */
  encode(text: string): { input_ids: { data: ArrayLike<number> } };
}

/**
 * Token counter configuration
 */
export interface TokenCounterConfig {
  /** Characters per token for estimation (Hebrew text typically 2-3) */
  charsPerToken: number;
  /** Whether to use tokenizer if available */
  useTokenizer: boolean;
  /** Maximum cache size (number of entries) */
  maxCacheSize: number;
}

// =============================================================================
// Token Counter Class
// =============================================================================

/**
 * Token counter with optional tokenizer support and caching
 *
 * The token counter can operate in two modes:
 * 1. Estimation mode (default): Uses character count / chars-per-token ratio
 * 2. Tokenizer mode: Uses actual tokenizer for exact counts
 *
 * For multilingual-e5-large (Hebrew + English):
 * - Hebrew characters typically tokenize to ~2-3 chars per token
 * - English typically tokenizes to ~4 chars per token
 * - Mixed text averages around 2.5 chars per token
 */
export class TokenCounter {
  private readonly config: TokenCounterConfig;
  private tokenizer: TokenizerInterface | null = null;
  private tokenizerLoadPromise: Promise<void> | null = null;
  private cache: Map<string, TokenCountResult> = new Map();

  /**
   * Create a new token counter
   *
   * @param config - Configuration options
   */
  constructor(config?: Partial<TokenCounterConfig>) {
    this.config = {
      charsPerToken: config?.charsPerToken ?? 2.5,
      useTokenizer: config?.useTokenizer ?? true,
      maxCacheSize: config?.maxCacheSize ?? 10000,
    };
  }

  /**
   * Initialize the tokenizer (loads the model)
   *
   * This is async because loading the transformers model takes time.
   * If tokenizer loading fails, the counter falls back to estimation.
   */
  async initializeTokenizer(): Promise<boolean> {
    if (!this.config.useTokenizer) {
      return false;
    }

    if (this.tokenizer) {
      return true;
    }

    if (this.tokenizerLoadPromise) {
      await this.tokenizerLoadPromise;
      return this.tokenizer !== null;
    }

    this.tokenizerLoadPromise = this.loadTokenizer();
    await this.tokenizerLoadPromise;
    return this.tokenizer !== null;
  }

  /**
   * Load the tokenizer model
   */
  private async loadTokenizer(): Promise<void> {
    try {
      // Dynamic import to avoid loading transformers unless needed
      const { AutoTokenizer } = await import('@xenova/transformers');

      // Load the tokenizer for multilingual-e5-large
      // This is the same model used for embeddings
      this.tokenizer = await AutoTokenizer.from_pretrained(
        'intfloat/multilingual-e5-large'
      );
    } catch {
      // Tokenizer not available - will use estimation
      console.warn(
        'Token counter: Failed to load tokenizer, falling back to estimation mode'
      );
      this.tokenizer = null;
    }
  }

  /**
   * Set an external tokenizer (for testing or custom tokenizers)
   */
  setTokenizer(tokenizer: TokenizerInterface): void {
    this.tokenizer = tokenizer;
  }

  /**
   * Count tokens in text
   *
   * @param text - Text to count tokens for
   * @param options - Counting options
   * @returns Token count result
   */
  count(text: string, options?: Partial<TokenCountOptions>): TokenCountResult {
    const opts = TokenCountOptionsSchema.parse(options ?? {});

    // Check cache first
    if (opts.useCache && !opts.forceRecount) {
      const cached = this.cache.get(text);
      if (cached) {
        return { ...cached, method: 'cached' };
      }
    }

    // Try tokenizer first if available
    if (this.tokenizer) {
      try {
        const result = this.countWithTokenizer(text);
        this.addToCache(text, result);
        return result;
      } catch {
        // Fall back to estimation on error
      }
    }

    // Use estimation
    const result = this.countWithEstimation(text, opts.charsPerToken);
    this.addToCache(text, result);
    return result;
  }

  /**
   * Count tokens using the actual tokenizer
   */
  private countWithTokenizer(text: string): TokenCountResult {
    if (!this.tokenizer) {
      throw new Error('Tokenizer not initialized');
    }

    const encoded = this.tokenizer.encode(text);
    const count = encoded.input_ids.data.length;

    return {
      count,
      estimated: false,
      method: 'tokenizer',
    };
  }

  /**
   * Count tokens using character-based estimation
   *
   * For Hebrew text with multilingual models:
   * - Pure Hebrew: ~2-2.5 chars per token
   * - Mixed Hebrew/English: ~2.5 chars per token
   * - Pure English: ~4 chars per token
   */
  private countWithEstimation(
    text: string,
    charsPerToken: number = this.config.charsPerToken
  ): TokenCountResult {
    const charCount = text.length;
    const count = Math.ceil(charCount / charsPerToken);

    return {
      count,
      estimated: true,
      method: 'estimation',
    };
  }

  /**
   * Count tokens for multiple texts
   */
  countMany(
    texts: string[],
    options?: Partial<TokenCountOptions>
  ): TokenCountResult[] {
    return texts.map((text) => this.count(text, options));
  }

  /**
   * Get total token count for multiple texts
   */
  countTotal(texts: string[], options?: Partial<TokenCountOptions>): number {
    return this.countMany(texts, options).reduce((sum, result) => sum + result.count, 0);
  }

  /**
   * Check if text exceeds a token limit
   */
  exceedsLimit(
    text: string,
    limit: number,
    options?: Partial<TokenCountOptions>
  ): boolean {
    return this.count(text, options).count > limit;
  }

  /**
   * Get remaining tokens before hitting a limit
   */
  remainingTokens(
    text: string,
    limit: number,
    options?: Partial<TokenCountOptions>
  ): number {
    const count = this.count(text, options).count;
    return Math.max(0, limit - count);
  }

  /**
   * Add a result to the cache
   */
  private addToCache(text: string, result: TokenCountResult): void {
    // LRU-style: remove oldest entries if cache is full
    if (this.cache.size >= this.config.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(text, result);
  }

  /**
   * Clear the token count cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxCacheSize,
      hitRate: 0, // Would need to track hits/misses for accurate rate
    };
  }

  /**
   * Check if tokenizer is available
   */
  hasTokenizer(): boolean {
    return this.tokenizer !== null;
  }

  /**
   * Get the current chars per token estimate
   */
  getCharsPerToken(): number {
    return this.config.charsPerToken;
  }
}

// =============================================================================
// Global Instance & Utilities
// =============================================================================

/**
 * Default global token counter instance
 */
let globalTokenCounter: TokenCounter | null = null;

/**
 * Get or create the global token counter instance
 */
export function getGlobalTokenCounter(
  config?: Partial<TokenCounterConfig>
): TokenCounter {
  if (!globalTokenCounter) {
    globalTokenCounter = new TokenCounter(config);
  }
  return globalTokenCounter;
}

/**
 * Reset the global token counter (useful for testing)
 */
export function resetGlobalTokenCounter(): void {
  globalTokenCounter = null;
}

/**
 * Quick token count using the global counter
 */
export function countTokens(
  text: string,
  options?: Partial<TokenCountOptions>
): TokenCountResult {
  return getGlobalTokenCounter().count(text, options);
}

/**
 * Quick estimation-only token count (no tokenizer)
 */
export function estimateTokens(text: string, charsPerToken: number = 2.5): number {
  return Math.ceil(text.length / charsPerToken);
}

/**
 * Calculate the number of characters for a given token count
 */
export function tokensToChars(tokenCount: number, charsPerToken: number = 2.5): number {
  return Math.floor(tokenCount * charsPerToken);
}

/**
 * Calculate token count needed for given character count
 */
export function charsToTokens(charCount: number, charsPerToken: number = 2.5): number {
  return Math.ceil(charCount / charsPerToken);
}

// =============================================================================
// Hebrew-Specific Utilities
// =============================================================================

/**
 * Hebrew letter unicode range
 */
const HEBREW_START = 0x0590;
const HEBREW_END = 0x05ff;

/**
 * Count Hebrew characters in text
 */
export function countHebrewChars(text: string): number {
  let count = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code >= HEBREW_START && code <= HEBREW_END) {
      count++;
    }
  }
  return count;
}

/**
 * Calculate Hebrew ratio in text
 */
export function getHebrewRatio(text: string): number {
  const nonWhitespace = text.replace(/\s/g, '');
  if (nonWhitespace.length === 0) return 0;
  return countHebrewChars(text) / nonWhitespace.length;
}

/**
 * Estimate chars per token based on text content
 *
 * Analyzes the Hebrew/English ratio to provide a better estimate:
 * - Pure Hebrew: ~2.0-2.5 chars/token
 * - Mixed: ~2.5 chars/token
 * - Pure English: ~4.0 chars/token
 */
export function estimateCharsPerToken(text: string): number {
  const hebrewRatio = getHebrewRatio(text);

  // Interpolate between Hebrew rate (2.2) and English rate (4.0)
  const hebrewRate = 2.2;
  const englishRate = 4.0;

  return hebrewRatio * hebrewRate + (1 - hebrewRatio) * englishRate;
}

/**
 * Adaptive token counting that adjusts chars-per-token based on text content
 */
export function adaptiveTokenCount(text: string): TokenCountResult {
  const charsPerToken = estimateCharsPerToken(text);
  const count = Math.ceil(text.length / charsPerToken);

  return {
    count,
    estimated: true,
    method: 'estimation',
  };
}
