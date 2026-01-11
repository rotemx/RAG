/**
 * Google Gemini LLM Adapter
 *
 * Adapter implementation for the Google Gemini API.
 * Provides completion and streaming capabilities for Hebrew legal content generation.
 *
 * NOTE: This is a stub implementation. The actual Google Generative AI SDK integration
 * will be completed when switching to Gemini is needed.
 */

import { LLMAdapter, type LLMAdapterConfig } from '../adapter.js';
import { registerAdapter } from '../factory.js';
import {
  type LLMMessage,
  type LLMResponse,
  type LLMStreamChunk,
  type LLMCompletionOptions,
  type GeminiConfig,
  type RetryConfig,
  type RetryEventHandler,
  LLMProvider,
} from '../types.js';
import { LLMError } from '../errors.js';

// =============================================================================
// Extended Configuration Types
// =============================================================================

/**
 * Extended Gemini configuration with retry and token tracking options.
 */
export interface GeminiAdapterConfig extends GeminiConfig, Omit<LLMAdapterConfig, keyof GeminiConfig> {
  /** Optional retry configuration for handling transient failures */
  retry?: Partial<RetryConfig> | undefined;
  /** Optional event handler for retry events (useful for logging) */
  onRetryEvent?: RetryEventHandler | undefined;
}

// =============================================================================
// GeminiAdapter Implementation
// =============================================================================

/**
 * LLM adapter for Google's Gemini API.
 *
 * Implements the abstract LLMAdapter interface for Gemini models (gemini-1.5-pro, etc.),
 * providing both synchronous completion and streaming capabilities.
 * Includes built-in retry logic with exponential backoff for handling
 * rate limits and transient failures.
 *
 * NOTE: This is a stub implementation. The `complete()` and `stream()` methods
 * throw "not implemented" errors. Install `@google/generative-ai` package and implement
 * the actual API calls when switching to Gemini is needed.
 *
 * @example Basic usage (once implemented)
 * ```typescript
 * const adapter = new GeminiAdapter({
 *   provider: 'gemini',
 *   model: 'gemini-1.5-pro',
 *   maxTokens: 4096,
 *   temperature: 0.3,
 *   apiKey: process.env.GOOGLE_API_KEY,
 * });
 *
 * const response = await adapter.complete([
 *   { role: 'user', content: 'What are the privacy laws in Israel?' }
 * ]);
 * ```
 *
 * @example With Vertex AI configuration
 * ```typescript
 * const adapter = new GeminiAdapter({
 *   provider: 'gemini',
 *   model: 'gemini-1.5-pro',
 *   maxTokens: 4096,
 *   temperature: 0.3,
 *   projectId: 'my-gcp-project',
 *   location: 'us-central1',
 * });
 * ```
 *
 * @example With retry configuration
 * ```typescript
 * const adapter = new GeminiAdapter({
 *   provider: 'gemini',
 *   model: 'gemini-1.5-pro',
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
 * const adapter = new GeminiAdapter({
 *   provider: 'gemini',
 *   model: 'gemini-1.5-pro',
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
export class GeminiAdapter extends LLMAdapter {
  /** Gemini-specific configuration */
  protected override readonly config: GeminiConfig;

  /**
   * Creates a new Gemini adapter instance.
   *
   * @param config - Gemini-specific configuration
   */
  constructor(config: GeminiAdapterConfig) {
    super(config);
    this.config = config;

    // NOTE: When implementing, store retry config and initialize Gemini client:
    // import { mergeRetryConfig } from '../retry.js';
    // import { GoogleGenerativeAI } from '@google/generative-ai';
    //
    // this.retryConfig = mergeRetryConfig(config.retry);
    // this.onRetryEvent = config.onRetryEvent;
    //
    // For standard Gemini API:
    // this.client = new GoogleGenerativeAI(config.apiKey ?? process.env.GOOGLE_API_KEY);
    // this.model = this.client.getGenerativeModel({ model: config.model });
    //
    // For Vertex AI:
    // import { VertexAI } from '@google-cloud/vertexai';
    // this.vertexAI = new VertexAI({
    //   project: config.projectId,
    //   location: config.location ?? 'us-central1',
    // });
    // this.model = this.vertexAI.getGenerativeModel({ model: config.model });
  }

  // ===========================================================================
  // Abstract Method Implementations
  // ===========================================================================

  /**
   * Generates a completion for the given messages using Gemini.
   *
   * NOTE: This is a stub implementation that throws an error.
   * Implement the actual Gemini API call when needed.
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

    // TODO: Implement Gemini API call
    // Example implementation outline:
    //
    // const mergedOptions = this.mergeOptions(options);
    //
    // // Convert messages to Gemini format
    // // Note: Gemini uses 'user' and 'model' roles, and handles system separately
    // const systemMessage = this.extractSystemMessage(messages);
    // const contents = this.convertMessages(messages.filter(m => m.role !== 'system'));
    //
    // const generationConfig = {
    //   maxOutputTokens: mergedOptions.maxTokens,
    //   temperature: mergedOptions.temperature,
    //   ...(mergedOptions.topP !== undefined && { topP: mergedOptions.topP }),
    //   ...(mergedOptions.stopSequences && { stopSequences: mergedOptions.stopSequences }),
    // };
    //
    // const result = await this.model.generateContent({
    //   contents,
    //   generationConfig,
    //   ...(systemMessage && { systemInstruction: systemMessage }),
    // });
    //
    // const response = result.response;
    // const text = response.text();
    // const usageMetadata = response.usageMetadata;
    //
    // return {
    //   content: text,
    //   model: this.config.model,
    //   usage: {
    //     inputTokens: usageMetadata?.promptTokenCount ?? 0,
    //     outputTokens: usageMetadata?.candidatesTokenCount ?? 0,
    //   },
    // };

    throw new LLMError({
      code: 'invalid_request',
      message: 'Gemini adapter is not yet implemented. Install the @google/generative-ai package and implement the complete() method.',
      provider: LLMProvider.GEMINI,
      retryable: false,
    });
  }

  /**
   * Generates a streaming completion for the given messages using Gemini.
   *
   * NOTE: This is a stub implementation that throws an error.
   * Implement the actual Gemini streaming API call when needed.
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

    // TODO: Implement Gemini streaming API call
    // Example implementation outline:
    //
    // const mergedOptions = this.mergeOptions(options);
    //
    // // Convert messages to Gemini format
    // const systemMessage = this.extractSystemMessage(messages);
    // const contents = this.convertMessages(messages.filter(m => m.role !== 'system'));
    //
    // const generationConfig = {
    //   maxOutputTokens: mergedOptions.maxTokens,
    //   temperature: mergedOptions.temperature,
    //   ...(mergedOptions.topP !== undefined && { topP: mergedOptions.topP }),
    //   ...(mergedOptions.stopSequences && { stopSequences: mergedOptions.stopSequences }),
    // };
    //
    // const result = await this.model.generateContentStream({
    //   contents,
    //   generationConfig,
    //   ...(systemMessage && { systemInstruction: systemMessage }),
    // });
    //
    // let inputTokens = 0;
    // let outputTokens = 0;
    //
    // for await (const chunk of result.stream) {
    //   const text = chunk.text();
    //   if (text) {
    //     yield { content: text, done: false };
    //   }
    //
    //   const usageMetadata = chunk.usageMetadata;
    //   if (usageMetadata) {
    //     inputTokens = usageMetadata.promptTokenCount ?? 0;
    //     outputTokens = usageMetadata.candidatesTokenCount ?? 0;
    //   }
    // }
    //
    // yield {
    //   content: '',
    //   done: true,
    //   usage: { inputTokens, outputTokens },
    // };

    throw new LLMError({
      code: 'invalid_request',
      message: 'Gemini adapter is not yet implemented. Install the @google/generative-ai package and implement the stream() method.',
      provider: LLMProvider.GEMINI,
      retryable: false,
    });

    // TypeScript requires a yield statement in a generator function
    // This is unreachable but satisfies the type checker
    yield { content: '', done: true };
  }

  // ===========================================================================
  // Helper Methods (stubs for future implementation)
  // ===========================================================================

  /**
   * Converts LLMMessages to Gemini content format.
   *
   * NOTE: Stub method - implement when adding full Gemini support.
   * Gemini uses 'user' and 'model' roles instead of 'user' and 'assistant'.
   *
   * @param _messages - Messages to convert
   * @returns Gemini-formatted contents array
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private convertMessages(_messages: LLMMessage[]): unknown[] {
    // TODO: Implement message conversion
    // Example:
    // return messages.map((msg) => ({
    //   role: msg.role === 'assistant' ? 'model' : 'user',
    //   parts: [{ text: msg.content }],
    // }));
    return [];
  }

  /**
   * Handles Gemini-specific errors and converts them to LLMError.
   *
   * NOTE: Stub method - implement when adding full Gemini support.
   *
   * @param _error - Error from Gemini API
   * @returns Structured LLMError
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private handleError(_error: unknown): LLMError {
    // TODO: Implement error handling
    // Map Gemini error codes to LLMErrorCode
    // Handle rate limits, auth errors, etc.
    return new LLMError({
      code: 'unknown',
      message: 'Unknown Gemini error',
      provider: LLMProvider.GEMINI,
      retryable: false,
    });
  }

  /**
   * Extracts retry-after information from Gemini rate limit errors.
   *
   * NOTE: Stub method - implement when adding full Gemini support.
   *
   * @param _error - Error from Gemini API
   * @returns Retry delay in milliseconds, or undefined if not applicable
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private extractRetryAfter(_error: unknown): number | undefined {
    // TODO: Implement retry-after extraction
    // Parse error headers or body for retry timing
    return undefined;
  }
}

// =============================================================================
// Register the Gemini Adapter
// =============================================================================

// Register this adapter with the factory
registerAdapter(LLMProvider.GEMINI, GeminiAdapter);

// =============================================================================
// Re-export for convenience
// =============================================================================

export default GeminiAdapter;
