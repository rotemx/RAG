/**
 * LLM Adapter Types
 *
 * TypeScript type definitions for the modular LLM adapter system.
 * These interfaces enable easy switching between LLM providers (Anthropic, OpenAI, Gemini).
 */

import { z } from 'zod';

// ============================================================================
// LLM Provider Types
// ============================================================================

/**
 * Supported LLM providers
 */
export const LLMProvider = {
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
  GEMINI: 'gemini',
} as const;

export type LLMProvider = (typeof LLMProvider)[keyof typeof LLMProvider];

// ============================================================================
// Message Types
// ============================================================================

/**
 * Message role in a conversation
 */
export const MessageRole = {
  SYSTEM: 'system',
  USER: 'user',
  ASSISTANT: 'assistant',
} as const;

export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole];

/**
 * Zod schema for validating LLMMessage data
 */
export const LLMMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1),
});

export type LLMMessage = z.infer<typeof LLMMessageSchema>;

/**
 * Array of messages representing a conversation
 */
export const LLMMessagesSchema = z.array(LLMMessageSchema).min(1);

export type LLMMessages = z.infer<typeof LLMMessagesSchema>;

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Zod schema for validating LLMConfig data
 */
export const LLMConfigSchema = z.object({
  /** LLM provider to use */
  provider: z.enum(['anthropic', 'openai', 'gemini']),
  /** Model identifier (e.g., 'claude-3-opus-20240229', 'gpt-4-turbo') */
  model: z.string().min(1),
  /** Maximum tokens in the response */
  maxTokens: z.number().int().positive().max(100000),
  /** Temperature for response randomness (0-2) */
  temperature: z.number().min(0).max(2),
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

/**
 * Input type for creating LLM configuration with optional defaults
 */
export const CreateLLMConfigInputSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'gemini']),
  model: z.string().min(1),
  maxTokens: z.number().int().positive().max(100000).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export type CreateLLMConfigInput = z.infer<typeof CreateLLMConfigInputSchema>;

// ============================================================================
// Token Usage Types
// ============================================================================

/**
 * Zod schema for token usage information
 */
export const LLMTokenUsageSchema = z.object({
  /** Number of tokens in the input/prompt */
  inputTokens: z.number().int().nonnegative(),
  /** Number of tokens in the output/completion */
  outputTokens: z.number().int().nonnegative(),
});

export type LLMTokenUsage = z.infer<typeof LLMTokenUsageSchema>;

/**
 * Extended token usage with total and optional cost estimation
 */
export const LLMTokenUsageExtendedSchema = LLMTokenUsageSchema.extend({
  /** Total tokens (input + output) */
  totalTokens: z.number().int().nonnegative(),
  /** Estimated cost in USD (optional) */
  estimatedCostUsd: z.number().nonnegative().optional(),
});

export type LLMTokenUsageExtended = z.infer<typeof LLMTokenUsageExtendedSchema>;

// ============================================================================
// Response Types
// ============================================================================

/**
 * Zod schema for validating LLMResponse data
 */
export const LLMResponseSchema = z.object({
  /** The generated text content */
  content: z.string(),
  /** Token usage information */
  usage: LLMTokenUsageSchema,
  /** Model identifier used for generation */
  model: z.string().min(1),
});

export type LLMResponse = z.infer<typeof LLMResponseSchema>;

/**
 * Extended response with additional metadata
 */
export const LLMResponseExtendedSchema = LLMResponseSchema.extend({
  /** Provider used for generation */
  provider: z.enum(['anthropic', 'openai', 'gemini']),
  /** Finish reason (e.g., 'stop', 'max_tokens', 'content_filter') */
  finishReason: z.string().optional(),
  /** Response generation latency in milliseconds */
  latencyMs: z.number().int().nonnegative().optional(),
  /** Request ID for debugging */
  requestId: z.string().optional(),
});

export type LLMResponseExtended = z.infer<typeof LLMResponseExtendedSchema>;

// ============================================================================
// Streaming Types
// ============================================================================

/**
 * A chunk of streamed response content
 */
export const LLMStreamChunkSchema = z.object({
  /** Partial content chunk */
  content: z.string(),
  /** Whether this is the final chunk */
  done: z.boolean(),
  /** Partial usage (may only be available at end of stream) */
  usage: LLMTokenUsageSchema.optional(),
});

export type LLMStreamChunk = z.infer<typeof LLMStreamChunkSchema>;

// ============================================================================
// Request Types
// ============================================================================

/**
 * Options for LLM completion requests
 */
export const LLMCompletionOptionsSchema = z.object({
  /** Override default temperature for this request */
  temperature: z.number().min(0).max(2).optional(),
  /** Override default max tokens for this request */
  maxTokens: z.number().int().positive().max(100000).optional(),
  /** Stop sequences to end generation */
  stopSequences: z.array(z.string()).optional(),
  /** Top-p (nucleus) sampling parameter */
  topP: z.number().min(0).max(1).optional(),
  /** Frequency penalty (-2 to 2) */
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  /** Presence penalty (-2 to 2) */
  presencePenalty: z.number().min(-2).max(2).optional(),
});

export type LLMCompletionOptions = z.infer<typeof LLMCompletionOptionsSchema>;

/**
 * Full request structure for LLM completion
 */
export const LLMCompletionRequestSchema = z.object({
  /** Messages for the conversation */
  messages: LLMMessagesSchema,
  /** Optional completion options */
  options: LLMCompletionOptionsSchema.optional(),
});

export type LLMCompletionRequest = z.infer<typeof LLMCompletionRequestSchema>;

// ============================================================================
// Error Types
// ============================================================================

/**
 * LLM-specific error codes
 */
export const LLMErrorCode = {
  /** Rate limit exceeded */
  RATE_LIMIT: 'rate_limit',
  /** Invalid API key or authentication failure */
  AUTH_ERROR: 'auth_error',
  /** Invalid request parameters */
  INVALID_REQUEST: 'invalid_request',
  /** Model not found or not available */
  MODEL_NOT_FOUND: 'model_not_found',
  /** Content blocked by safety filters */
  CONTENT_FILTERED: 'content_filtered',
  /** Request timeout */
  TIMEOUT: 'timeout',
  /** Server error from provider */
  SERVER_ERROR: 'server_error',
  /** Network or connection error */
  NETWORK_ERROR: 'network_error',
  /** Generic/unknown error */
  UNKNOWN: 'unknown',
} as const;

export type LLMErrorCode = (typeof LLMErrorCode)[keyof typeof LLMErrorCode];

/**
 * Structured LLM error information
 */
export const LLMErrorInfoSchema = z.object({
  /** Error code */
  code: z.enum([
    'rate_limit',
    'auth_error',
    'invalid_request',
    'model_not_found',
    'content_filtered',
    'timeout',
    'server_error',
    'network_error',
    'unknown',
  ]),
  /** Human-readable error message */
  message: z.string(),
  /** Provider that generated the error */
  provider: z.enum(['anthropic', 'openai', 'gemini']),
  /** Whether the request can be retried */
  retryable: z.boolean(),
  /** Suggested retry delay in milliseconds */
  retryAfterMs: z.number().int().nonnegative().optional(),
  /** Original error from the provider */
  originalError: z.unknown().optional(),
});

export type LLMErrorInfo = z.infer<typeof LLMErrorInfoSchema>;

// ============================================================================
// Retry Configuration Types
// ============================================================================

/**
 * Configuration options for retry behavior
 */
export const RetryConfigSchema = z.object({
  /** Maximum number of retry attempts (excluding the initial request) */
  maxRetries: z.number().int().nonnegative().default(3),
  /** Initial delay in milliseconds before the first retry */
  initialDelayMs: z.number().int().positive().default(1000),
  /** Maximum delay in milliseconds between retries */
  maxDelayMs: z.number().int().positive().default(60000),
  /** Exponential backoff multiplier (e.g., 2 means each retry waits 2x longer) */
  backoffMultiplier: z.number().positive().default(2),
  /** Whether to add random jitter to retry delays to prevent thundering herd */
  jitter: z.boolean().default(true),
  /** Maximum jitter as a fraction of the delay (0.0 to 1.0) */
  jitterFactor: z.number().min(0).max(1).default(0.25),
  /** Which error codes should trigger a retry (defaults to all retryable errors) */
  retryableErrorCodes: z
    .array(
      z.enum([
        'rate_limit',
        'timeout',
        'server_error',
        'network_error',
      ])
    )
    .optional(),
});

export type RetryConfig = z.infer<typeof RetryConfigSchema>;

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  jitter: true,
  jitterFactor: 0.25,
  retryableErrorCodes: ['rate_limit', 'timeout', 'server_error', 'network_error'],
};

/**
 * Result of a retry attempt
 */
export interface RetryAttemptResult<T> {
  /** Whether the attempt succeeded */
  success: boolean;
  /** The result if successful */
  result?: T;
  /** The error if failed */
  error?: LLMErrorInfo;
  /** Which attempt number this was (1-based) */
  attemptNumber: number;
  /** Delay before this attempt (0 for first attempt) */
  delayMs: number;
}

/**
 * Event emitted during retry operations for logging/monitoring
 */
export interface RetryEvent {
  /** Type of retry event */
  type: 'attempt_start' | 'attempt_failed' | 'attempt_succeeded' | 'retrying' | 'max_retries_exceeded';
  /** Which attempt number this was (1-based) */
  attemptNumber: number;
  /** Maximum number of retries configured */
  maxRetries: number;
  /** Error information if the attempt failed */
  error?: LLMErrorInfo | undefined;
  /** Delay before next retry (only for 'retrying' events) */
  nextDelayMs?: number | undefined;
  /** Timestamp of the event */
  timestamp: Date;
}

/**
 * Callback function for retry events
 */
export type RetryEventHandler = (event: RetryEvent) => void;

// ============================================================================
// Provider-Specific Configuration Types
// ============================================================================

/**
 * Anthropic-specific configuration options
 */
export const AnthropicConfigSchema = LLMConfigSchema.extend({
  provider: z.literal('anthropic'),
  /** Anthropic API key */
  apiKey: z.string().min(1).optional(),
  /** API version header */
  apiVersion: z.string().optional(),
  /** Base URL for API requests (for proxies) */
  baseUrl: z.string().url().optional(),
});

export type AnthropicConfig = z.infer<typeof AnthropicConfigSchema>;

/**
 * OpenAI-specific configuration options
 */
export const OpenAIConfigSchema = LLMConfigSchema.extend({
  provider: z.literal('openai'),
  /** OpenAI API key */
  apiKey: z.string().min(1).optional(),
  /** Organization ID */
  organization: z.string().optional(),
  /** Base URL for API requests (for Azure OpenAI or proxies) */
  baseUrl: z.string().url().optional(),
});

export type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;

/**
 * Google Gemini-specific configuration options
 */
export const GeminiConfigSchema = LLMConfigSchema.extend({
  provider: z.literal('gemini'),
  /** Google API key */
  apiKey: z.string().min(1).optional(),
  /** Project ID for Vertex AI */
  projectId: z.string().optional(),
  /** Location for Vertex AI */
  location: z.string().optional(),
});

export type GeminiConfig = z.infer<typeof GeminiConfigSchema>;

/**
 * Union type for any provider-specific config
 */
export type ProviderSpecificConfig = AnthropicConfig | OpenAIConfig | GeminiConfig;

// ============================================================================
// Default Configurations
// ============================================================================

/**
 * Default LLM configuration values
 */
export const DEFAULT_LLM_CONFIG: Omit<LLMConfig, 'provider' | 'model'> = {
  maxTokens: 4096,
  temperature: 0.3,
};

/**
 * Recommended models for Hebrew legal content
 */
export const RECOMMENDED_MODELS = {
  anthropic: 'claude-3-5-sonnet-20241022',
  openai: 'gpt-4-turbo',
  gemini: 'gemini-1.5-pro',
} as const;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Creates a default LLM config for the specified provider
 */
export function createDefaultConfig(provider: LLMProvider): LLMConfig {
  return {
    provider,
    model: RECOMMENDED_MODELS[provider],
    ...DEFAULT_LLM_CONFIG,
  };
}

/**
 * Validates an LLM config and returns validation result
 */
export function validateLLMConfig(config: unknown): {
  isValid: boolean;
  config?: LLMConfig;
  errors?: string[];
} {
  const result = LLMConfigSchema.safeParse(config);
  if (result.success) {
    return { isValid: true, config: result.data };
  }
  return {
    isValid: false,
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
}

/**
 * Calculates total tokens from usage
 */
export function calculateTotalTokens(usage: LLMTokenUsage): number {
  return usage.inputTokens + usage.outputTokens;
}

/**
 * Creates a system message
 */
export function createSystemMessage(content: string): LLMMessage {
  return { role: 'system', content };
}

/**
 * Creates a user message
 */
export function createUserMessage(content: string): LLMMessage {
  return { role: 'user', content };
}

/**
 * Creates an assistant message
 */
export function createAssistantMessage(content: string): LLMMessage {
  return { role: 'assistant', content };
}
