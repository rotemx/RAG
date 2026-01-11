/**
 * Token Usage Tracker
 *
 * Provides comprehensive token usage tracking and cost estimation
 * for LLM API calls. Supports multiple providers with configurable pricing.
 */

import { z } from 'zod';
import {
  type LLMTokenUsage,
  type LLMProvider,
  LLMProvider as LLMProviderEnum,
} from './types.js';

// =============================================================================
// Pricing Configuration Types
// =============================================================================

/**
 * Pricing per 1M tokens for a specific model
 */
export const ModelPricingSchema = z.object({
  /** Cost per 1M input tokens in USD */
  inputPricePerMillion: z.number().nonnegative(),
  /** Cost per 1M output tokens in USD */
  outputPricePerMillion: z.number().nonnegative(),
});

export type ModelPricing = z.infer<typeof ModelPricingSchema>;

/**
 * Pricing configuration for all models of a provider
 */
export const ProviderPricingSchema = z.record(z.string(), ModelPricingSchema);

export type ProviderPricing = z.infer<typeof ProviderPricingSchema>;

// =============================================================================
// Default Pricing Configuration (as of January 2025)
// =============================================================================

/**
 * Default pricing for Anthropic models (per 1M tokens)
 * @see https://www.anthropic.com/pricing
 */
export const ANTHROPIC_PRICING: ProviderPricing = {
  // Claude 3.5 models
  'claude-3-5-sonnet-20241022': { inputPricePerMillion: 3.00, outputPricePerMillion: 15.00 },
  'claude-3-5-sonnet-latest': { inputPricePerMillion: 3.00, outputPricePerMillion: 15.00 },
  'claude-3-5-haiku-20241022': { inputPricePerMillion: 1.00, outputPricePerMillion: 5.00 },
  'claude-3-5-haiku-latest': { inputPricePerMillion: 1.00, outputPricePerMillion: 5.00 },
  // Claude 3 models
  'claude-3-opus-20240229': { inputPricePerMillion: 15.00, outputPricePerMillion: 75.00 },
  'claude-3-opus-latest': { inputPricePerMillion: 15.00, outputPricePerMillion: 75.00 },
  'claude-3-sonnet-20240229': { inputPricePerMillion: 3.00, outputPricePerMillion: 15.00 },
  'claude-3-haiku-20240307': { inputPricePerMillion: 0.25, outputPricePerMillion: 1.25 },
};

/**
 * Default pricing for OpenAI models (per 1M tokens)
 * @see https://openai.com/pricing
 */
export const OPENAI_PRICING: ProviderPricing = {
  // GPT-4 Turbo
  'gpt-4-turbo': { inputPricePerMillion: 10.00, outputPricePerMillion: 30.00 },
  'gpt-4-turbo-preview': { inputPricePerMillion: 10.00, outputPricePerMillion: 30.00 },
  'gpt-4-turbo-2024-04-09': { inputPricePerMillion: 10.00, outputPricePerMillion: 30.00 },
  // GPT-4o
  'gpt-4o': { inputPricePerMillion: 2.50, outputPricePerMillion: 10.00 },
  'gpt-4o-2024-11-20': { inputPricePerMillion: 2.50, outputPricePerMillion: 10.00 },
  'gpt-4o-mini': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.60 },
  // GPT-4
  'gpt-4': { inputPricePerMillion: 30.00, outputPricePerMillion: 60.00 },
  'gpt-4-32k': { inputPricePerMillion: 60.00, outputPricePerMillion: 120.00 },
  // GPT-3.5
  'gpt-3.5-turbo': { inputPricePerMillion: 0.50, outputPricePerMillion: 1.50 },
  'gpt-3.5-turbo-0125': { inputPricePerMillion: 0.50, outputPricePerMillion: 1.50 },
};

/**
 * Default pricing for Google Gemini models (per 1M tokens)
 * @see https://ai.google.dev/pricing
 */
export const GEMINI_PRICING: ProviderPricing = {
  // Gemini 1.5
  'gemini-1.5-pro': { inputPricePerMillion: 1.25, outputPricePerMillion: 5.00 },
  'gemini-1.5-pro-latest': { inputPricePerMillion: 1.25, outputPricePerMillion: 5.00 },
  'gemini-1.5-flash': { inputPricePerMillion: 0.075, outputPricePerMillion: 0.30 },
  'gemini-1.5-flash-latest': { inputPricePerMillion: 0.075, outputPricePerMillion: 0.30 },
  // Gemini 2.0
  'gemini-2.0-flash': { inputPricePerMillion: 0.10, outputPricePerMillion: 0.40 },
  'gemini-2.0-flash-exp': { inputPricePerMillion: 0.10, outputPricePerMillion: 0.40 },
};

/**
 * Default pricing configuration for all providers
 */
export const DEFAULT_PRICING: Record<LLMProvider, ProviderPricing> = {
  [LLMProviderEnum.ANTHROPIC]: ANTHROPIC_PRICING,
  [LLMProviderEnum.OPENAI]: OPENAI_PRICING,
  [LLMProviderEnum.GEMINI]: GEMINI_PRICING,
};

// =============================================================================
// Token Usage Record Types
// =============================================================================

/**
 * A single token usage record
 */
export const TokenUsageRecordSchema = z.object({
  /** Unique identifier for this record */
  id: z.string(),
  /** Timestamp when the usage occurred */
  timestamp: z.date(),
  /** LLM provider */
  provider: z.enum(['anthropic', 'openai', 'gemini']),
  /** Model used */
  model: z.string(),
  /** Token usage */
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }),
  /** Estimated cost in USD */
  estimatedCostUsd: z.number().nonnegative(),
  /** Latency in milliseconds (optional) */
  latencyMs: z.number().int().nonnegative().optional(),
  /** Optional metadata for categorization */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type TokenUsageRecord = z.infer<typeof TokenUsageRecordSchema>;

/**
 * Aggregated usage statistics
 */
export const UsageStatisticsSchema = z.object({
  /** Total number of requests tracked */
  totalRequests: z.number().int().nonnegative(),
  /** Total input tokens across all requests */
  totalInputTokens: z.number().int().nonnegative(),
  /** Total output tokens across all requests */
  totalOutputTokens: z.number().int().nonnegative(),
  /** Total tokens (input + output) */
  totalTokens: z.number().int().nonnegative(),
  /** Total estimated cost in USD */
  totalCostUsd: z.number().nonnegative(),
  /** Average tokens per request */
  averageTokensPerRequest: z.number().nonnegative(),
  /** Average cost per request in USD */
  averageCostPerRequest: z.number().nonnegative(),
  /** Average latency in milliseconds (if available) */
  averageLatencyMs: z.number().nonnegative().optional(),
  /** Breakdown by provider */
  byProvider: z.record(z.enum(['anthropic', 'openai', 'gemini']), z.object({
    requests: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
  })).optional(),
  /** Breakdown by model */
  byModel: z.record(z.string(), z.object({
    requests: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
  })).optional(),
  /** Time range of tracked usage */
  timeRange: z.object({
    start: z.date(),
    end: z.date(),
  }).optional(),
});

export type UsageStatistics = z.infer<typeof UsageStatisticsSchema>;

// =============================================================================
// Token Tracker Configuration
// =============================================================================

/**
 * Configuration options for TokenTracker
 */
export interface TokenTrackerConfig {
  /** Custom pricing configuration (overrides defaults) */
  customPricing?: Partial<Record<LLMProvider, ProviderPricing>>;
  /** Maximum number of records to keep (0 for unlimited) */
  maxRecords?: number;
  /** Whether to include detailed breakdowns in statistics */
  includeBreakdowns?: boolean;
}

// =============================================================================
// Token Tracker Class
// =============================================================================

/**
 * Tracks token usage and estimates costs across LLM API calls.
 *
 * @example
 * ```typescript
 * const tracker = new TokenTracker();
 *
 * // Track usage from a response
 * tracker.trackUsage({
 *   provider: 'anthropic',
 *   model: 'claude-3-5-sonnet-20241022',
 *   usage: { inputTokens: 1000, outputTokens: 500 },
 * });
 *
 * // Get statistics
 * const stats = tracker.getStatistics();
 * console.log(`Total cost: $${stats.totalCostUsd.toFixed(4)}`);
 * ```
 */
export class TokenTracker {
  /** Usage records */
  private records: TokenUsageRecord[] = [];

  /** Pricing configuration */
  private readonly pricing: Record<LLMProvider, ProviderPricing>;

  /** Maximum records to keep */
  private readonly maxRecords: number;

  /** Whether to include breakdowns in statistics */
  private readonly includeBreakdowns: boolean;

  /** Counter for generating unique IDs */
  private idCounter = 0;

  /**
   * Creates a new TokenTracker instance.
   *
   * @param config - Optional configuration
   */
  constructor(config?: TokenTrackerConfig) {
    // Merge custom pricing with defaults
    this.pricing = {
      ...DEFAULT_PRICING,
      ...config?.customPricing,
    };
    this.maxRecords = config?.maxRecords ?? 0; // 0 = unlimited
    this.includeBreakdowns = config?.includeBreakdowns ?? true;
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Tracks token usage from an LLM response.
   *
   * @param params - Usage parameters
   * @returns The created usage record
   */
  trackUsage(params: {
    provider: LLMProvider;
    model: string;
    usage: LLMTokenUsage;
    latencyMs?: number;
    metadata?: Record<string, unknown>;
  }): TokenUsageRecord {
    const { provider, model, usage, latencyMs, metadata } = params;

    // Calculate cost
    const estimatedCostUsd = this.calculateCost(provider, model, usage);

    // Create record
    const record: TokenUsageRecord = {
      id: this.generateId(),
      timestamp: new Date(),
      provider,
      model,
      usage,
      estimatedCostUsd,
      latencyMs,
      metadata,
    };

    // Add record
    this.records.push(record);

    // Prune if necessary
    if (this.maxRecords > 0 && this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }

    return record;
  }

  /**
   * Calculates the estimated cost for a given token usage.
   *
   * @param provider - LLM provider
   * @param model - Model identifier
   * @param usage - Token usage
   * @returns Estimated cost in USD
   */
  calculateCost(provider: LLMProvider, model: string, usage: LLMTokenUsage): number {
    const providerPricing = this.pricing[provider];
    const modelPricing = providerPricing?.[model];

    if (!modelPricing) {
      // Model not found in pricing, return 0
      return 0;
    }

    const inputCost = (usage.inputTokens / 1_000_000) * modelPricing.inputPricePerMillion;
    const outputCost = (usage.outputTokens / 1_000_000) * modelPricing.outputPricePerMillion;

    return inputCost + outputCost;
  }

  /**
   * Gets aggregated statistics for all tracked usage.
   *
   * @param options - Optional filtering options
   * @returns Usage statistics
   */
  getStatistics(options?: {
    /** Filter by provider */
    provider?: LLMProvider;
    /** Filter by model */
    model?: string;
    /** Filter by start date */
    since?: Date;
    /** Filter by end date */
    until?: Date;
  }): UsageStatistics {
    let filteredRecords = this.records;

    // Apply filters
    if (options?.provider) {
      filteredRecords = filteredRecords.filter((r) => r.provider === options.provider);
    }
    if (options?.model) {
      filteredRecords = filteredRecords.filter((r) => r.model === options.model);
    }
    if (options?.since) {
      filteredRecords = filteredRecords.filter((r) => r.timestamp >= options.since!);
    }
    if (options?.until) {
      filteredRecords = filteredRecords.filter((r) => r.timestamp <= options.until!);
    }

    // Calculate totals
    const totalRequests = filteredRecords.length;
    const totalInputTokens = filteredRecords.reduce((sum, r) => sum + r.usage.inputTokens, 0);
    const totalOutputTokens = filteredRecords.reduce((sum, r) => sum + r.usage.outputTokens, 0);
    const totalTokens = totalInputTokens + totalOutputTokens;
    const totalCostUsd = filteredRecords.reduce((sum, r) => sum + r.estimatedCostUsd, 0);

    // Calculate averages
    const averageTokensPerRequest = totalRequests > 0 ? totalTokens / totalRequests : 0;
    const averageCostPerRequest = totalRequests > 0 ? totalCostUsd / totalRequests : 0;

    // Calculate average latency (only for records with latency)
    const recordsWithLatency = filteredRecords.filter((r) => r.latencyMs !== undefined);
    const averageLatencyMs = recordsWithLatency.length > 0
      ? recordsWithLatency.reduce((sum, r) => sum + r.latencyMs!, 0) / recordsWithLatency.length
      : undefined;

    // Calculate time range
    const timeRange = filteredRecords.length > 0
      ? {
          start: new Date(Math.min(...filteredRecords.map((r) => r.timestamp.getTime()))),
          end: new Date(Math.max(...filteredRecords.map((r) => r.timestamp.getTime()))),
        }
      : undefined;

    const stats: UsageStatistics = {
      totalRequests,
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      totalCostUsd,
      averageTokensPerRequest,
      averageCostPerRequest,
      averageLatencyMs,
      timeRange,
    };

    // Add breakdowns if enabled
    if (this.includeBreakdowns && filteredRecords.length > 0) {
      stats.byProvider = this.calculateProviderBreakdown(filteredRecords);
      stats.byModel = this.calculateModelBreakdown(filteredRecords);
    }

    return stats;
  }

  /**
   * Gets all usage records.
   *
   * @param options - Optional filtering options
   * @returns Array of usage records
   */
  getRecords(options?: {
    /** Maximum number of records to return */
    limit?: number;
    /** Filter by provider */
    provider?: LLMProvider;
    /** Filter by model */
    model?: string;
    /** Filter by start date */
    since?: Date;
  }): TokenUsageRecord[] {
    let records = [...this.records];

    // Apply filters
    if (options?.provider) {
      records = records.filter((r) => r.provider === options.provider);
    }
    if (options?.model) {
      records = records.filter((r) => r.model === options.model);
    }
    if (options?.since) {
      records = records.filter((r) => r.timestamp >= options.since!);
    }

    // Apply limit (most recent first)
    if (options?.limit !== undefined && options.limit > 0) {
      records = records.slice(-options.limit);
    }

    return records;
  }

  /**
   * Gets the most recent usage record.
   *
   * @returns The most recent record or undefined if no records exist
   */
  getLastRecord(): TokenUsageRecord | undefined {
    return this.records[this.records.length - 1];
  }

  /**
   * Gets the total estimated cost for all tracked usage.
   *
   * @returns Total cost in USD
   */
  getTotalCost(): number {
    return this.records.reduce((sum, r) => sum + r.estimatedCostUsd, 0);
  }

  /**
   * Gets the total token count for all tracked usage.
   *
   * @returns Object with input, output, and total token counts
   */
  getTotalTokens(): { inputTokens: number; outputTokens: number; totalTokens: number } {
    const inputTokens = this.records.reduce((sum, r) => sum + r.usage.inputTokens, 0);
    const outputTokens = this.records.reduce((sum, r) => sum + r.usage.outputTokens, 0);
    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
  }

  /**
   * Clears all tracked usage records.
   */
  clear(): void {
    this.records = [];
    this.idCounter = 0;
  }

  /**
   * Gets the current number of tracked records.
   */
  get recordCount(): number {
    return this.records.length;
  }

  /**
   * Updates pricing for a specific model.
   *
   * @param provider - LLM provider
   * @param model - Model identifier
   * @param pricing - New pricing configuration
   */
  setModelPricing(provider: LLMProvider, model: string, pricing: ModelPricing): void {
    if (!this.pricing[provider]) {
      this.pricing[provider] = {};
    }
    this.pricing[provider][model] = pricing;
  }

  /**
   * Gets the pricing configuration for a specific model.
   *
   * @param provider - LLM provider
   * @param model - Model identifier
   * @returns Model pricing or undefined if not configured
   */
  getModelPricing(provider: LLMProvider, model: string): ModelPricing | undefined {
    return this.pricing[provider]?.[model];
  }

  /**
   * Exports all records as JSON.
   *
   * @returns JSON-serializable array of records
   */
  export(): TokenUsageRecord[] {
    return this.records.map((record) => ({
      ...record,
      // Ensure timestamp is serializable
      timestamp: new Date(record.timestamp),
    }));
  }

  /**
   * Imports records from a JSON export.
   *
   * @param records - Records to import
   * @param options - Import options
   */
  import(records: TokenUsageRecord[], options?: { merge?: boolean }): void {
    const parsedRecords = records.map((record) => ({
      ...record,
      timestamp: new Date(record.timestamp),
    }));

    if (options?.merge) {
      // Merge with existing records, avoiding duplicates by ID
      const existingIds = new Set(this.records.map((r) => r.id));
      const newRecords = parsedRecords.filter((r) => !existingIds.has(r.id));
      this.records = [...this.records, ...newRecords];
    } else {
      this.records = parsedRecords;
    }

    // Update ID counter
    const maxIdNum = Math.max(
      ...this.records.map((r) => {
        const match = r.id.match(/^usage-(\d+)$/);
        return match?.[1] !== undefined ? parseInt(match[1], 10) : 0;
      }),
      this.idCounter
    );
    this.idCounter = maxIdNum;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Generates a unique ID for a usage record.
   */
  private generateId(): string {
    this.idCounter++;
    return `usage-${this.idCounter}`;
  }

  /**
   * Calculates breakdown by provider.
   */
  private calculateProviderBreakdown(
    records: TokenUsageRecord[]
  ): UsageStatistics['byProvider'] {
    const breakdown: NonNullable<UsageStatistics['byProvider']> = {};

    for (const record of records) {
      let entry = breakdown[record.provider];
      if (!entry) {
        entry = {
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        };
        breakdown[record.provider] = entry;
      }
      entry.requests++;
      entry.inputTokens += record.usage.inputTokens;
      entry.outputTokens += record.usage.outputTokens;
      entry.costUsd += record.estimatedCostUsd;
    }

    return breakdown;
  }

  /**
   * Calculates breakdown by model.
   */
  private calculateModelBreakdown(
    records: TokenUsageRecord[]
  ): UsageStatistics['byModel'] {
    const breakdown: NonNullable<UsageStatistics['byModel']> = {};

    for (const record of records) {
      let entry = breakdown[record.model];
      if (!entry) {
        entry = {
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        };
        breakdown[record.model] = entry;
      }
      entry.requests++;
      entry.inputTokens += record.usage.inputTokens;
      entry.outputTokens += record.usage.outputTokens;
      entry.costUsd += record.estimatedCostUsd;
    }

    return breakdown;
  }
}

// =============================================================================
// Singleton Instance (Optional)
// =============================================================================

/** Global token tracker instance for application-wide usage tracking */
let globalTracker: TokenTracker | undefined;

/**
 * Gets or creates a global TokenTracker instance.
 *
 * @param config - Configuration for the global tracker (only used on first call)
 * @returns The global TokenTracker instance
 */
export function getGlobalTokenTracker(config?: TokenTrackerConfig): TokenTracker {
  if (!globalTracker) {
    globalTracker = new TokenTracker(config);
  }
  return globalTracker;
}

/**
 * Resets the global TokenTracker instance.
 */
export function resetGlobalTokenTracker(): void {
  globalTracker = undefined;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Formats a cost in USD as a human-readable string.
 *
 * @param costUsd - Cost in USD
 * @param options - Formatting options
 * @returns Formatted cost string
 */
export function formatCost(
  costUsd: number,
  options?: { precision?: number; includeSymbol?: boolean }
): string {
  const precision = options?.precision ?? 4;
  const includeSymbol = options?.includeSymbol ?? true;
  const formatted = costUsd.toFixed(precision);
  return includeSymbol ? `$${formatted}` : formatted;
}

/**
 * Formats token count as a human-readable string.
 *
 * @param tokens - Token count
 * @returns Formatted token string (e.g., "1.5K", "2.3M")
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Creates a usage summary string from statistics.
 *
 * @param stats - Usage statistics
 * @returns Human-readable summary
 */
export function createUsageSummary(stats: UsageStatistics): string {
  const lines = [
    `Requests: ${stats.totalRequests}`,
    `Tokens: ${formatTokens(stats.totalTokens)} (${formatTokens(stats.totalInputTokens)} in / ${formatTokens(stats.totalOutputTokens)} out)`,
    `Cost: ${formatCost(stats.totalCostUsd)}`,
  ];

  if (stats.averageLatencyMs !== undefined) {
    lines.push(`Avg Latency: ${stats.averageLatencyMs.toFixed(0)}ms`);
  }

  return lines.join('\n');
}
