/**
 * OpenAI LLM Adapter
 *
 * Adapter implementation for the OpenAI API.
 * Provides completion and streaming capabilities for Hebrew legal content generation.
 *
 * NOTE: This is a stub implementation. The actual OpenAI SDK integration
 * will be completed when switching to OpenAI is needed.
 */

import { LLMAdapter, type LLMAdapterConfig } from '../adapter.js';
import { registerAdapter } from '../factory.js';
import {
  type LLMMessage,
  type LLMResponse,
  type LLMStreamChunk,
  type LLMCompletionOptions,
  type OpenAIConfig,
  type RetryConfig,
  type RetryEventHandler,
  LLMProvider,
} from '../types.js';
import { LLMError } from '../errors.js';

// =============================================================================
// Extended Configuration Types
// =============================================================================

/**
 * Extended OpenAI configuration with retry and token tracking options.
 */
export interface OpenAIAdapterConfig extends OpenAIConfig, Omit<LLMAdapterConfig, keyof OpenAIConfig> {
  /** Optional retry configuration for handling transient failures */
  retry?: Partial<RetryConfig> | undefined;
  /** Optional event handler for retry events (useful for logging) */
  onRetryEvent?: RetryEventHandler | undefined;
}

// =============================================================================
// OpenAIAdapter Implementation
// =============================================================================

/**
 * LLM adapter for OpenAI's API.
 *
 * Implements the abstract LLMAdapter interface for OpenAI models (GPT-4, etc.),
 * providing both synchronous completion and streaming capabilities.
 * Includes built-in retry logic with exponential backoff for handling
 * rate limits and transient failures.
 *
 * NOTE: This is a stub implementation. The `complete()` and `stream()` methods
 * throw "not implemented" errors. Install `openai` package and implement
 * the actual API calls when switching to OpenAI is needed.
 *
 * @example Basic usage (once implemented)
 * ```typescript
 * const adapter = new OpenAIAdapter({
 *   provider: 'openai',
 *   model: 'gpt-4-turbo',
 *   maxTokens: 4096,
 *   temperature: 0.3,
 *   apiKey: process.env.OPENAI_API_KEY,
 * });
 *
 * const response = await adapter.complete([
 *   { role: 'user', content: 'What are the privacy laws in Israel?' }
 * ]);
 * ```
 *
 * @example With retry configuration
 * ```typescript
 * const adapter = new OpenAIAdapter({
 *   provider: 'openai',
 *   model: 'gpt-4-turbo',
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
 * const adapter = new OpenAIAdapter({
 *   provider: 'openai',
 *   model: 'gpt-4-turbo',
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
export class OpenAIAdapter extends LLMAdapter {
  /** OpenAI-specific configuration */
  protected override readonly config: OpenAIConfig;

  /**
   * Creates a new OpenAI adapter instance.
   *
   * @param config - OpenAI-specific configuration
   */
  constructor(config: OpenAIAdapterConfig) {
    super(config);
    this.config = config;

    // NOTE: When implementing, store retry config and initialize OpenAI client:
    // import { mergeRetryConfig } from '../retry.js';
    // import OpenAI from 'openai';
    //
    // this.retryConfig = mergeRetryConfig(config.retry);
    // this.onRetryEvent = config.onRetryEvent;
    // this.client = new OpenAI({
    //   apiKey: config.apiKey ?? process.env.OPENAI_API_KEY,
    //   organization: config.organization,
    //   baseURL: config.baseUrl,
    // });
  }

  // ===========================================================================
  // Abstract Method Implementations
  // ===========================================================================

  /**
   * Generates a completion for the given messages using OpenAI.
   *
   * NOTE: This is a stub implementation that throws an error.
   * Implement the actual OpenAI API call when needed.
   *
   * @param messages - Array of conversation messages
   * @param _options - Optional completion options to override config defaults
   * @returns Promise resolving to the LLM response
   * @throws {LLMError} Always throws "not implemented" error in stub
   */
  async complete(
    messages: LLMMessage[],
    _options?: LLMCompletionOptions
  ): Promise<LLMResponse> {
    this.validateMessages(messages);

    // TODO: Implement OpenAI API call
    // Example implementation outline:
    //
    // const mergedOptions = this.mergeOptions(options);
    // const params = {
    //   model: this.config.model,
    //   max_tokens: mergedOptions.maxTokens,
    //   temperature: mergedOptions.temperature,
    //   messages: messages.map((msg) => ({
    //     role: msg.role as 'system' | 'user' | 'assistant',
    //     content: msg.content,
    //   })),
    //   ...(mergedOptions.stopSequences && { stop: mergedOptions.stopSequences }),
    //   ...(mergedOptions.topP !== undefined && { top_p: mergedOptions.topP }),
    //   ...(mergedOptions.frequencyPenalty !== undefined && { frequency_penalty: mergedOptions.frequencyPenalty }),
    //   ...(mergedOptions.presencePenalty !== undefined && { presence_penalty: mergedOptions.presencePenalty }),
    // };
    //
    // const response = await this.client.chat.completions.create(params);
    //
    // return {
    //   content: response.choices[0]?.message?.content ?? '',
    //   model: response.model,
    //   usage: {
    //     inputTokens: response.usage?.prompt_tokens ?? 0,
    //     outputTokens: response.usage?.completion_tokens ?? 0,
    //   },
    // };

    throw new LLMError({
      code: 'invalid_request',
      message: 'OpenAI adapter is not yet implemented. Install the openai package and implement the complete() method.',
      provider: LLMProvider.OPENAI,
      retryable: false,
    });
  }

  /**
   * Generates a streaming completion for the given messages using OpenAI.
   *
   * NOTE: This is a stub implementation that throws an error.
   * Implement the actual OpenAI streaming API call when needed.
   *
   * @param messages - Array of conversation messages
   * @param _options - Optional completion options to override config defaults
   * @returns AsyncGenerator yielding stream chunks
   * @throws {LLMError} Always throws "not implemented" error in stub
   */
  async *stream(
    messages: LLMMessage[],
    _options?: LLMCompletionOptions
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    this.validateMessages(messages);

    // TODO: Implement OpenAI streaming API call
    // Example implementation outline:
    //
    // const mergedOptions = this.mergeOptions(options);
    // const params = {
    //   model: this.config.model,
    //   max_tokens: mergedOptions.maxTokens,
    //   temperature: mergedOptions.temperature,
    //   messages: messages.map((msg) => ({
    //     role: msg.role as 'system' | 'user' | 'assistant',
    //     content: msg.content,
    //   })),
    //   stream: true,
    //   stream_options: { include_usage: true },
    // };
    //
    // const stream = await this.client.chat.completions.create(params);
    //
    // let inputTokens = 0;
    // let outputTokens = 0;
    //
    // for await (const chunk of stream) {
    //   const delta = chunk.choices[0]?.delta?.content;
    //   if (delta) {
    //     yield { content: delta, done: false };
    //   }
    //
    //   if (chunk.usage) {
    //     inputTokens = chunk.usage.prompt_tokens;
    //     outputTokens = chunk.usage.completion_tokens;
    //   }
    //
    //   if (chunk.choices[0]?.finish_reason) {
    //     yield {
    //       content: '',
    //       done: true,
    //       usage: { inputTokens, outputTokens },
    //     };
    //   }
    // }

    throw new LLMError({
      code: 'invalid_request',
      message: 'OpenAI adapter is not yet implemented. Install the openai package and implement the stream() method.',
      provider: LLMProvider.OPENAI,
      retryable: false,
    });

    // TypeScript requires a yield statement in a generator function
    // This is unreachable but satisfies the type checker
    yield { content: '', done: true };
  }
}

// =============================================================================
// Register the OpenAI Adapter
// =============================================================================

// Register this adapter with the factory
registerAdapter(LLMProvider.OPENAI, OpenAIAdapter);

// =============================================================================
// Re-export for convenience
// =============================================================================

export default OpenAIAdapter;
