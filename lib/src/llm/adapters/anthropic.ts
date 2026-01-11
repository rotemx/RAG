/**
 * Anthropic LLM Adapter
 *
 * Adapter implementation for the Anthropic Claude API.
 * Provides completion and streaming capabilities for Hebrew legal content generation.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  MessageStreamEvent,
  ContentBlock,
  TextBlock,
  MessageCreateParams,
} from '@anthropic-ai/sdk/resources/messages';

import { LLMAdapter, type LLMAdapterConfig } from '../adapter.js';
import { registerAdapter } from '../factory.js';
import {
  type LLMMessage,
  type LLMResponse,
  type LLMStreamChunk,
  type LLMCompletionOptions,
  type AnthropicConfig,
  type RetryConfig,
  type RetryEventHandler,
  LLMProvider,
  DEFAULT_LLM_CONFIG,
} from '../types.js';
import {
  LLMError,
  RateLimitError,
  AuthenticationError,
  InvalidRequestError,
  ModelNotFoundError,
  TimeoutError,
  ServerError,
  NetworkError,
} from '../errors.js';
import {
  withRetry,
  withRetryGenerator,
  mergeRetryConfig,
  type WithRetryOptions,
} from '../retry.js';

// =============================================================================
// Extended Configuration Types
// =============================================================================

/**
 * Extended Anthropic configuration with retry and token tracking options.
 */
export interface AnthropicAdapterConfig extends AnthropicConfig, Omit<LLMAdapterConfig, keyof AnthropicConfig> {
  /** Optional retry configuration for handling transient failures */
  retry?: Partial<RetryConfig> | undefined;
  /** Optional event handler for retry events (useful for logging) */
  onRetryEvent?: RetryEventHandler | undefined;
}

// =============================================================================
// AnthropicAdapter Implementation
// =============================================================================

/**
 * LLM adapter for Anthropic's Claude API.
 *
 * Implements the abstract LLMAdapter interface for Claude models,
 * providing both synchronous completion and streaming capabilities.
 * Includes built-in retry logic with exponential backoff for handling
 * rate limits and transient failures.
 *
 * @example Basic usage
 * ```typescript
 * const adapter = new AnthropicAdapter({
 *   provider: 'anthropic',
 *   model: 'claude-3-5-sonnet-20241022',
 *   maxTokens: 4096,
 *   temperature: 0.3,
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 * });
 *
 * const response = await adapter.complete([
 *   { role: 'user', content: 'מה הם חוקי הגנת הפרטיות בישראל?' }
 * ]);
 * ```
 *
 * @example With retry configuration
 * ```typescript
 * const adapter = new AnthropicAdapter({
 *   provider: 'anthropic',
 *   model: 'claude-3-5-sonnet-20241022',
 *   maxTokens: 4096,
 *   temperature: 0.3,
 *   retry: {
 *     maxRetries: 5,
 *     initialDelayMs: 2000,
 *   },
 *   onRetryEvent: (event) => console.log('Retry event:', event),
 * });
 * ```
 *
 * @example With token tracking
 * ```typescript
 * const adapter = new AnthropicAdapter({
 *   provider: 'anthropic',
 *   model: 'claude-3-5-sonnet-20241022',
 *   maxTokens: 4096,
 *   temperature: 0.3,
 *   enableTokenTracking: true,
 * });
 *
 * // Use completeWithTracking for automatic usage tracking
 * const response = await adapter.completeWithTracking(
 *   [{ role: 'user', content: 'Hello!' }],
 *   undefined,
 *   { sessionId: 'abc123' } // optional metadata
 * );
 *
 * // Get usage statistics
 * const stats = adapter.getUsageStatistics();
 * console.log(`Total cost: $${stats?.totalCostUsd.toFixed(4)}`);
 * ```
 */
export class AnthropicAdapter extends LLMAdapter {
  /** Anthropic client instance */
  private readonly client: Anthropic;

  /** Anthropic-specific configuration */
  protected override readonly config: AnthropicConfig;

  /** Retry configuration */
  private readonly retryConfig: Required<RetryConfig>;

  /** Retry event handler */
  private readonly onRetryEvent?: RetryEventHandler | undefined;

  /**
   * Creates a new Anthropic adapter instance.
   *
   * @param config - Anthropic-specific configuration
   */
  constructor(config: AnthropicAdapterConfig) {
    super(config);
    this.config = config;

    // Initialize retry configuration
    this.retryConfig = mergeRetryConfig(config.retry);
    this.onRetryEvent = config.onRetryEvent;

    // Initialize the Anthropic client
    this.client = new Anthropic({
      apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY,
      baseURL: config.baseUrl,
    });
  }

  // ===========================================================================
  // Abstract Method Implementations
  // ===========================================================================

  /**
   * Generates a completion for the given messages using Claude.
   *
   * @param messages - Array of conversation messages
   * @param options - Optional completion options to override config defaults
   * @returns Promise resolving to the LLM response
   * @throws {LLMError} If the completion fails
   */
  async complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMResponse> {
    this.validateMessages(messages);

    const mergedOptions = this.mergeOptions(options);
    const [systemMessage, conversationMessages] =
      this.extractSystemMessage(messages);

    // Build the request params, only including defined optional fields
    const params: MessageCreateParams = {
      model: this.config.model,
      max_tokens: mergedOptions.maxTokens ?? DEFAULT_LLM_CONFIG.maxTokens,
      messages: this.convertMessages(conversationMessages),
    };

    // Only add optional parameters if they are defined
    if (mergedOptions.temperature !== undefined) {
      params.temperature = mergedOptions.temperature;
    }
    if (systemMessage !== undefined) {
      params.system = systemMessage;
    }
    if (mergedOptions.stopSequences !== undefined) {
      params.stop_sequences = mergedOptions.stopSequences;
    }
    if (mergedOptions.topP !== undefined) {
      params.top_p = mergedOptions.topP;
    }

    // Execute with retry logic for rate limits and transient failures
    const retryOptions: WithRetryOptions = {
      config: this.retryConfig,
      ...(this.onRetryEvent && { onRetryEvent: this.onRetryEvent }),
    };

    return withRetry(async () => {
      try {
        const response = await this.client.messages.create(params);

        // Extract text content from the response
        const content = this.extractTextContent(response.content);

        return {
          content,
          model: response.model,
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          },
        };
      } catch (error) {
        throw this.handleError(error);
      }
    }, retryOptions);
  }

  /**
   * Generates a streaming completion for the given messages using Claude.
   *
   * @param messages - Array of conversation messages
   * @param options - Optional completion options to override config defaults
   * @returns AsyncGenerator yielding stream chunks
   * @throws {LLMError} If the stream fails
   */
  async *stream(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    this.validateMessages(messages);

    const mergedOptions = this.mergeOptions(options);
    const [systemMessage, conversationMessages] =
      this.extractSystemMessage(messages);

    // Build the request params, only including defined optional fields
    const params: MessageCreateParams = {
      model: this.config.model,
      max_tokens: mergedOptions.maxTokens ?? DEFAULT_LLM_CONFIG.maxTokens,
      messages: this.convertMessages(conversationMessages),
    };

    // Only add optional parameters if they are defined
    if (mergedOptions.temperature !== undefined) {
      params.temperature = mergedOptions.temperature;
    }
    if (systemMessage !== undefined) {
      params.system = systemMessage;
    }
    if (mergedOptions.stopSequences !== undefined) {
      params.stop_sequences = mergedOptions.stopSequences;
    }
    if (mergedOptions.topP !== undefined) {
      params.top_p = mergedOptions.topP;
    }

    // Execute with retry logic for rate limits and transient failures
    // Note: withRetryGenerator will restart the stream from the beginning on failure
    const retryOptions: WithRetryOptions = {
      config: this.retryConfig,
      ...(this.onRetryEvent && { onRetryEvent: this.onRetryEvent }),
    };

    // Create a generator that wraps the stream with retry logic
    const self = this;
    const streamGenerator = withRetryGenerator<LLMStreamChunk>(
      async function* () {
        try {
          const stream = await self.client.messages.stream(params);

          let inputTokens = 0;
          let outputTokens = 0;

          for await (const event of stream) {
            // Track token usage from message_start event
            if (event.type === 'message_start' && event.message?.usage) {
              inputTokens = event.message.usage.input_tokens;
            }

            // Track output tokens from message_delta event
            if (event.type === 'message_delta') {
              const deltaEvent = event as MessageStreamEvent & {
                usage?: { output_tokens: number };
              };
              if (deltaEvent.usage) {
                outputTokens = deltaEvent.usage.output_tokens;
              }
            }

            const chunk = self.processStreamEvent(event);

            if (chunk) {
              // Add usage info to final chunk
              if (chunk.done) {
                chunk.usage = {
                  inputTokens,
                  outputTokens,
                };
              }

              yield chunk;
            }
          }
        } catch (error) {
          throw self.handleError(error);
        }
      },
      retryOptions
    );

    // Yield all chunks from the retry-wrapped generator
    yield* streamGenerator;
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Converts internal LLMMessage format to Anthropic MessageParam format.
   *
   * @param messages - Array of LLMMessage objects
   * @returns Array of Anthropic MessageParam objects
   */
  private convertMessages(messages: LLMMessage[]): MessageParam[] {
    return messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));
  }

  /**
   * Extracts text content from Anthropic's ContentBlock array.
   *
   * @param content - Array of ContentBlock from Anthropic response
   * @returns Combined text content
   */
  private extractTextContent(content: ContentBlock[]): string {
    return content
      .filter((block): block is TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }

  /**
   * Processes a stream event and returns a chunk if applicable.
   *
   * @param event - Anthropic stream event
   * @returns LLMStreamChunk or undefined if event doesn't produce content
   */
  private processStreamEvent(
    event: MessageStreamEvent
  ): LLMStreamChunk | undefined {
    switch (event.type) {
      case 'content_block_delta':
        if (event.delta.type === 'text_delta') {
          return {
            content: event.delta.text,
            done: false,
          };
        }
        break;

      case 'message_stop':
        return {
          content: '',
          done: true,
        };
    }

    return undefined;
  }

  /**
   * Handles and transforms Anthropic API errors into specific LLMError types.
   *
   * Maps Anthropic SDK errors to the appropriate specific error class
   * (RateLimitError, AuthenticationError, etc.) for better type discrimination.
   *
   * @param error - The original error from the Anthropic SDK
   * @returns Specific LLMError subclass with appropriate error code and details
   */
  private handleError(error: unknown): LLMError {
    // Handle Anthropic-specific error types
    if (error instanceof Anthropic.APIError) {
      const status = error.status;
      const message = error.message;

      // Map HTTP status codes to specific error types
      if (status === 401) {
        return new AuthenticationError(
          `Authentication failed: ${message}`,
          LLMProvider.ANTHROPIC,
          error
        );
      }

      if (status === 429) {
        // Extract retry-after if available
        const retryAfterMs = this.extractRetryAfter(error);
        return new RateLimitError(
          `Rate limit exceeded: ${message}`,
          LLMProvider.ANTHROPIC,
          retryAfterMs,
          error
        );
      }

      if (status === 400) {
        return new InvalidRequestError(
          `Invalid request: ${message}`,
          LLMProvider.ANTHROPIC,
          error
        );
      }

      if (status === 404) {
        return new ModelNotFoundError(
          `Model not found: ${message}`,
          LLMProvider.ANTHROPIC,
          error
        );
      }

      if (status !== undefined && status >= 500) {
        return new ServerError(
          `Server error: ${message}`,
          LLMProvider.ANTHROPIC,
          5000,
          error
        );
      }
    }

    // Handle timeout errors
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      return new TimeoutError(
        `Request timeout: ${(error as Error).message}`,
        LLMProvider.ANTHROPIC,
        1000,
        error
      );
    }

    // Handle connection errors
    if (error instanceof Anthropic.APIConnectionError) {
      return new NetworkError(
        `Connection error: ${(error as Error).message}`,
        LLMProvider.ANTHROPIC,
        2000,
        error
      );
    }

    // Default unknown error handling
    return LLMError.fromError(error, LLMProvider.ANTHROPIC);
  }

  /**
   * Extracts retry-after delay from rate limit error.
   *
   * @param error - The Anthropic API error
   * @returns Retry delay in milliseconds or undefined
   */
  private extractRetryAfter(
    error: InstanceType<typeof Anthropic.APIError>
  ): number | undefined {
    // Check headers for retry-after
    const headers = error.headers;
    if (headers) {
      const retryAfter = headers['retry-after'];
      if (retryAfter) {
        // retry-after can be in seconds
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) {
          return seconds * 1000;
        }
      }
    }

    // Default retry delay for rate limits
    return 60000; // 1 minute default
  }

}

// =============================================================================
// Register the Anthropic Adapter
// =============================================================================

// Register this adapter with the factory
registerAdapter(LLMProvider.ANTHROPIC, AnthropicAdapter);

// =============================================================================
// Re-export for convenience
// =============================================================================

export default AnthropicAdapter;
