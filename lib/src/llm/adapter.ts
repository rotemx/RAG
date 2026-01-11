/**
 * LLM Adapter Base Class
 *
 * Abstract base class for LLM provider adapters.
 * Provides a unified interface for interacting with different LLM providers
 * (Anthropic, OpenAI, Gemini) enabling easy switching without code changes.
 */

import {
  type LLMConfig,
  type LLMMessage,
  type LLMResponse,
  type LLMResponseExtended,
  type LLMStreamChunk,
  type LLMCompletionOptions,
  type LLMTokenUsage,
  type LLMErrorInfo,
  type LLMProvider,
  LLMErrorCode,
  DEFAULT_LLM_CONFIG,
} from './types.js';

import { InvalidRequestError } from './errors.js';
import {
  TokenTracker,
  type TokenTrackerConfig,
  type TokenUsageRecord,
  type UsageStatistics,
} from './token-tracker.js';

/**
 * Abstract base class for LLM adapters.
 *
 * All LLM provider implementations must extend this class and implement
 * the abstract methods for completion and streaming.
 *
 * @example
 * ```typescript
 * class AnthropicAdapter extends LLMAdapter {
 *   async complete(messages: LLMMessage[], options?: LLMCompletionOptions): Promise<LLMResponse> {
 *     // Implementation specific to Anthropic API
 *   }
 *
 *   async *stream(messages: LLMMessage[], options?: LLMCompletionOptions): AsyncGenerator<LLMStreamChunk> {
 *     // Streaming implementation specific to Anthropic API
 *   }
 * }
 * ```
 */
/**
 * Extended configuration for LLMAdapter with token tracking options
 */
export interface LLMAdapterConfig extends LLMConfig {
  /** Enable token usage tracking for this adapter */
  enableTokenTracking?: boolean;
  /** Configuration for the token tracker */
  tokenTrackerConfig?: TokenTrackerConfig;
  /** Use a shared token tracker instance instead of creating a new one */
  sharedTokenTracker?: TokenTracker;
}

export abstract class LLMAdapter {
  /** The configuration for this adapter instance */
  protected readonly config: LLMConfig;

  /** Token tracker instance for usage tracking */
  private readonly tokenTracker?: TokenTracker;

  /** Whether token tracking is enabled */
  private readonly trackingEnabled: boolean;

  /**
   * Creates a new LLM adapter instance.
   *
   * @param config - The configuration for the adapter
   */
  constructor(config: LLMConfig | LLMAdapterConfig) {
    this.config = {
      ...config,
      maxTokens: config.maxTokens ?? DEFAULT_LLM_CONFIG.maxTokens,
      temperature: config.temperature ?? DEFAULT_LLM_CONFIG.temperature,
    };

    // Initialize token tracking if enabled
    const adapterConfig = config as LLMAdapterConfig;
    this.trackingEnabled = adapterConfig.enableTokenTracking ?? false;

    if (this.trackingEnabled) {
      this.tokenTracker =
        adapterConfig.sharedTokenTracker ??
        new TokenTracker(adapterConfig.tokenTrackerConfig);
    }
  }

  // ===========================================================================
  // Abstract Methods - Must be implemented by subclasses
  // ===========================================================================

  /**
   * Generates a completion for the given messages.
   *
   * @param messages - Array of conversation messages
   * @param options - Optional completion options to override config defaults
   * @returns Promise resolving to the LLM response
   * @throws {LLMError} If the completion fails
   */
  abstract complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMResponse>;

  /**
   * Generates a streaming completion for the given messages.
   *
   * @param messages - Array of conversation messages
   * @param options - Optional completion options to override config defaults
   * @returns AsyncGenerator yielding stream chunks
   * @throws {LLMError} If the stream fails
   */
  abstract stream(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): AsyncGenerator<LLMStreamChunk, void, unknown>;

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Gets the provider type for this adapter.
   */
  get provider(): LLMProvider {
    return this.config.provider;
  }

  /**
   * Gets the model identifier for this adapter.
   */
  get model(): string {
    return this.config.model;
  }

  /**
   * Gets the current configuration (read-only copy).
   */
  getConfig(): Readonly<LLMConfig> {
    return { ...this.config };
  }

  /**
   * Generates a completion with extended response metadata.
   *
   * This method wraps `complete()` to provide additional metadata
   * like latency tracking and provider information.
   *
   * @param messages - Array of conversation messages
   * @param options - Optional completion options
   * @returns Promise resolving to extended LLM response
   */
  async completeWithMetadata(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMResponseExtended> {
    const startTime = Date.now();

    const response = await this.complete(messages, options);

    const latencyMs = Date.now() - startTime;

    return {
      ...response,
      provider: this.config.provider,
      latencyMs,
    };
  }

  /**
   * Collects all stream chunks into a complete response.
   *
   * Useful when you want to use streaming internally but return
   * a complete response to the caller.
   *
   * @param messages - Array of conversation messages
   * @param options - Optional completion options
   * @returns Promise resolving to the complete LLM response
   */
  async streamToCompletion(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMResponse> {
    const chunks: string[] = [];
    let finalUsage: LLMTokenUsage | undefined;

    for await (const chunk of this.stream(messages, options)) {
      chunks.push(chunk.content);

      if (chunk.done && chunk.usage) {
        finalUsage = chunk.usage;
      }
    }

    return {
      content: chunks.join(''),
      model: this.config.model,
      usage: finalUsage ?? { inputTokens: 0, outputTokens: 0 },
    };
  }

  /**
   * Generates a completion and tracks token usage.
   *
   * This method wraps `complete()` to provide automatic token tracking
   * with cost estimation when token tracking is enabled.
   *
   * @param messages - Array of conversation messages
   * @param options - Optional completion options
   * @param metadata - Optional metadata to attach to the usage record
   * @returns Promise resolving to LLM response with usage record
   */
  async completeWithTracking(
    messages: LLMMessage[],
    options?: LLMCompletionOptions,
    metadata?: Record<string, unknown>
  ): Promise<LLMResponse & { usageRecord?: TokenUsageRecord }> {
    const startTime = Date.now();
    const response = await this.complete(messages, options);
    const latencyMs = Date.now() - startTime;

    let usageRecord: TokenUsageRecord | undefined;

    if (this.trackingEnabled && this.tokenTracker) {
      usageRecord = this.tokenTracker.trackUsage({
        provider: this.config.provider,
        model: response.model,
        usage: response.usage,
        latencyMs,
        ...(metadata !== undefined && { metadata }),
      });
    }

    // Build result object, only including usageRecord if defined
    if (usageRecord !== undefined) {
      return {
        ...response,
        usageRecord,
      };
    }

    return response;
  }

  /**
   * Generates a streaming completion and tracks token usage.
   *
   * This method wraps `stream()` to provide automatic token tracking
   * when token tracking is enabled. Usage is tracked after stream completes.
   *
   * @param messages - Array of conversation messages
   * @param options - Optional completion options
   * @param metadata - Optional metadata to attach to the usage record
   * @returns Object with stream generator and promise for usage record
   */
  streamWithTracking(
    messages: LLMMessage[],
    options?: LLMCompletionOptions,
    metadata?: Record<string, unknown>
  ): {
    stream: AsyncGenerator<LLMStreamChunk, void, unknown>;
    getUsageRecord: () => TokenUsageRecord | undefined;
  } {
    const startTime = Date.now();
    let usageRecord: TokenUsageRecord | undefined;
    const self = this;
    const originalStream = this.stream(messages, options);

    // Wrap the stream to capture usage from the final chunk
    const wrappedStream = (async function* () {
      let finalUsage: LLMTokenUsage | undefined;

      for await (const chunk of originalStream) {
        if (chunk.done && chunk.usage) {
          finalUsage = chunk.usage;
        }
        yield chunk;
      }

      // Track usage after stream completes
      if (self.trackingEnabled && self.tokenTracker && finalUsage) {
        const latencyMs = Date.now() - startTime;
        usageRecord = self.tokenTracker.trackUsage({
          provider: self.config.provider,
          model: self.config.model,
          usage: finalUsage,
          latencyMs,
          ...(metadata !== undefined && { metadata }),
        });
      }
    })();

    return {
      stream: wrappedStream,
      getUsageRecord: () => usageRecord,
    };
  }

  // ===========================================================================
  // Token Tracking Methods
  // ===========================================================================

  /**
   * Checks if token tracking is enabled for this adapter.
   */
  get isTrackingEnabled(): boolean {
    return this.trackingEnabled;
  }

  /**
   * Gets the token tracker instance if tracking is enabled.
   *
   * @returns TokenTracker instance or undefined if tracking is disabled
   */
  getTokenTracker(): TokenTracker | undefined {
    return this.tokenTracker;
  }

  /**
   * Gets usage statistics from the token tracker.
   *
   * @param options - Optional filtering options
   * @returns Usage statistics or undefined if tracking is disabled
   */
  getUsageStatistics(options?: {
    provider?: LLMProvider;
    model?: string;
    since?: Date;
    until?: Date;
  }): UsageStatistics | undefined {
    return this.tokenTracker?.getStatistics(options);
  }

  /**
   * Gets the total estimated cost from the token tracker.
   *
   * @returns Total cost in USD or undefined if tracking is disabled
   */
  getTotalCost(): number | undefined {
    return this.tokenTracker?.getTotalCost();
  }

  /**
   * Gets the total token counts from the token tracker.
   *
   * @returns Token counts or undefined if tracking is disabled
   */
  getTotalTokens(): { inputTokens: number; outputTokens: number; totalTokens: number } | undefined {
    return this.tokenTracker?.getTotalTokens();
  }

  /**
   * Gets usage records from the token tracker.
   *
   * @param options - Optional filtering options
   * @returns Array of usage records or undefined if tracking is disabled
   */
  getUsageRecords(options?: {
    limit?: number;
    provider?: LLMProvider;
    model?: string;
    since?: Date;
  }): TokenUsageRecord[] | undefined {
    return this.tokenTracker?.getRecords(options);
  }

  /**
   * Clears all tracked usage records.
   */
  clearUsageRecords(): void {
    this.tokenTracker?.clear();
  }

  /**
   * Manually tracks token usage.
   *
   * Useful when you need to track usage from external sources
   * or when using lower-level API calls.
   *
   * @param usage - Token usage to track
   * @param options - Additional tracking options
   * @returns Usage record or undefined if tracking is disabled
   */
  trackUsage(
    usage: LLMTokenUsage,
    options?: {
      model?: string;
      latencyMs?: number;
      metadata?: Record<string, unknown>;
    }
  ): TokenUsageRecord | undefined {
    if (!this.trackingEnabled || !this.tokenTracker) {
      return undefined;
    }

    return this.tokenTracker.trackUsage({
      provider: this.config.provider,
      model: options?.model ?? this.config.model,
      usage,
      ...(options?.latencyMs !== undefined && { latencyMs: options.latencyMs }),
      ...(options?.metadata !== undefined && { metadata: options.metadata }),
    });
  }

  /**
   * Calculates the estimated cost for a given token usage.
   *
   * @param usage - Token usage to calculate cost for
   * @param model - Optional model override (defaults to adapter's model)
   * @returns Estimated cost in USD or undefined if tracking is disabled
   */
  calculateCost(usage: LLMTokenUsage, model?: string): number | undefined {
    if (!this.tokenTracker) {
      return undefined;
    }

    return this.tokenTracker.calculateCost(
      this.config.provider,
      model ?? this.config.model,
      usage
    );
  }

  // ===========================================================================
  // Protected Helper Methods
  // ===========================================================================

  /**
   * Merges completion options with the adapter's default config.
   *
   * @param options - Optional completion options
   * @returns Merged options with defaults applied
   */
  protected mergeOptions(options?: LLMCompletionOptions): Required<
    Pick<LLMCompletionOptions, 'temperature' | 'maxTokens'>
  > &
    Omit<LLMCompletionOptions, 'temperature' | 'maxTokens'> {
    return {
      temperature: options?.temperature ?? this.config.temperature,
      maxTokens: options?.maxTokens ?? this.config.maxTokens,
      stopSequences: options?.stopSequences,
      topP: options?.topP,
      frequencyPenalty: options?.frequencyPenalty,
      presencePenalty: options?.presencePenalty,
    };
  }

  /**
   * Extracts the system message from the messages array if present.
   *
   * @param messages - Array of conversation messages
   * @returns Tuple of [systemMessage | undefined, otherMessages]
   */
  protected extractSystemMessage(
    messages: LLMMessage[]
  ): [string | undefined, LLMMessage[]] {
    const systemMessage = messages.find((m) => m.role === 'system');
    const otherMessages = messages.filter((m) => m.role !== 'system');

    return [systemMessage?.content, otherMessages];
  }

  /**
   * Creates a standardized error info object from an error.
   *
   * Subclasses should override this method to provide provider-specific
   * error code mapping.
   *
   * @param error - The original error
   * @returns Standardized error info
   */
  protected createErrorInfo(error: unknown): LLMErrorInfo {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return {
      code: LLMErrorCode.UNKNOWN,
      message,
      provider: this.config.provider,
      retryable: false,
      originalError: error,
    };
  }

  /**
   * Validates that messages array is not empty and has valid structure.
   *
   * @param messages - Array of conversation messages
   * @throws {InvalidRequestError} If validation fails
   */
  protected validateMessages(messages: LLMMessage[]): void {
    if (!messages || messages.length === 0) {
      throw new InvalidRequestError(
        'Messages array must not be empty',
        this.config.provider
      );
    }

    // Ensure there's at least one non-system message
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');
    if (nonSystemMessages.length === 0) {
      throw new InvalidRequestError(
        'Messages must contain at least one user or assistant message',
        this.config.provider
      );
    }
  }
}

// =============================================================================
// Re-exports from errors.ts for backward compatibility
// =============================================================================

// Re-export error classes and utilities from errors.ts
// This maintains backward compatibility for code that imports from adapter.ts
export { LLMError, isLLMError, isRetryableError, getRetryDelay } from './errors.js';
