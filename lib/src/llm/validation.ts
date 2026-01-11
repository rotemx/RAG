/**
 * LLM Configuration Validation
 *
 * Comprehensive validation utilities for LLM adapter configurations.
 * Provides runtime validation, environment variable validation,
 * and detailed error reporting using Zod schemas.
 */

import { z } from 'zod';
import {
  type LLMConfig,
  type LLMMessage,
  type LLMCompletionOptions,
  type AnthropicConfig,
  type OpenAIConfig,
  type GeminiConfig,
  type ProviderSpecificConfig,
  type LLMProvider,
  LLMConfigSchema,
  LLMMessageSchema,
  LLMMessagesSchema,
  LLMCompletionOptionsSchema,
  AnthropicConfigSchema,
  OpenAIConfigSchema,
  GeminiConfigSchema,
  LLMProvider as LLMProviderEnum,
  RECOMMENDED_MODELS,
  DEFAULT_LLM_CONFIG,
} from './types.js';

// =============================================================================
// Validation Result Types
// =============================================================================

/**
 * Result of a validation operation
 */
export interface ValidationResult<T> {
  /** Whether the validation passed */
  success: boolean;
  /** Validated data (only present if success is true) */
  data?: T;
  /** Validation errors (only present if success is false) */
  errors?: ValidationError[];
}

/**
 * Structured validation error
 */
export interface ValidationError {
  /** Path to the field that failed validation */
  path: string;
  /** Human-readable error message */
  message: string;
  /** Error code for programmatic handling */
  code: string;
  /** Expected value or type */
  expected?: string;
  /** Received value */
  received?: string;
}

// =============================================================================
// Environment Variable Schemas
// =============================================================================

/**
 * Schema for Anthropic environment variables
 */
export const AnthropicEnvSchema = z.object({
  ANTHROPIC_API_KEY: z
    .string()
    .min(1, 'ANTHROPIC_API_KEY is required')
    .startsWith('sk-ant-', 'ANTHROPIC_API_KEY must start with "sk-ant-"'),
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  ANTHROPIC_API_VERSION: z.string().optional(),
});

export type AnthropicEnv = z.infer<typeof AnthropicEnvSchema>;

/**
 * Schema for OpenAI environment variables
 */
export const OpenAIEnvSchema = z.object({
  OPENAI_API_KEY: z
    .string()
    .min(1, 'OPENAI_API_KEY is required')
    .startsWith('sk-', 'OPENAI_API_KEY must start with "sk-"'),
  OPENAI_ORG_ID: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
});

export type OpenAIEnv = z.infer<typeof OpenAIEnvSchema>;

/**
 * Schema for Gemini environment variables
 */
export const GeminiEnvSchema = z.object({
  GOOGLE_API_KEY: z.string().min(1, 'GOOGLE_API_KEY is required'),
  GOOGLE_PROJECT_ID: z.string().optional(),
  GOOGLE_LOCATION: z.string().optional(),
});

export type GeminiEnv = z.infer<typeof GeminiEnvSchema>;

/**
 * Combined schema for all LLM environment variables
 */
export const LLMEnvSchema = z.object({
  // Anthropic
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  ANTHROPIC_API_VERSION: z.string().optional(),
  // OpenAI
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_ORG_ID: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  // Gemini
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_PROJECT_ID: z.string().optional(),
  GOOGLE_LOCATION: z.string().optional(),
});

export type LLMEnv = z.infer<typeof LLMEnvSchema>;

// =============================================================================
// Core Validation Functions
// =============================================================================

/**
 * Transforms Zod errors into structured ValidationError array
 */
function transformZodErrors(zodError: z.ZodError): ValidationError[] {
  return zodError.errors.map((err) => ({
    path: err.path.join('.') || 'root',
    message: err.message,
    code: err.code,
    expected: 'expected' in err ? String(err.expected) : undefined,
    received: 'received' in err ? String(err.received) : undefined,
  }));
}

/**
 * Validates an LLM configuration
 *
 * @param config - Configuration to validate
 * @returns Validation result with typed data or errors
 *
 * @example
 * ```typescript
 * const result = validateConfig({
 *   provider: 'anthropic',
 *   model: 'claude-3-5-sonnet-20241022',
 *   maxTokens: 4096,
 *   temperature: 0.3,
 * });
 *
 * if (result.success) {
 *   console.log('Valid config:', result.data);
 * } else {
 *   console.error('Validation errors:', result.errors);
 * }
 * ```
 */
export function validateConfig(config: unknown): ValidationResult<LLMConfig> {
  const result = LLMConfigSchema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: transformZodErrors(result.error),
  };
}

/**
 * Validates a provider-specific configuration
 *
 * @param provider - The LLM provider
 * @param config - Configuration to validate
 * @returns Validation result with typed data or errors
 */
export function validateProviderConfig(
  provider: LLMProvider,
  config: unknown
): ValidationResult<ProviderSpecificConfig> {
  const schema = getProviderConfigSchema(provider);
  const result = schema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data as ProviderSpecificConfig };
  }

  return {
    success: false,
    errors: transformZodErrors(result.error),
  };
}

/**
 * Validates an Anthropic-specific configuration
 */
export function validateAnthropicConfig(
  config: unknown
): ValidationResult<AnthropicConfig> {
  const result = AnthropicConfigSchema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: transformZodErrors(result.error),
  };
}

/**
 * Validates an OpenAI-specific configuration
 */
export function validateOpenAIConfig(
  config: unknown
): ValidationResult<OpenAIConfig> {
  const result = OpenAIConfigSchema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: transformZodErrors(result.error),
  };
}

/**
 * Validates a Gemini-specific configuration
 */
export function validateGeminiConfig(
  config: unknown
): ValidationResult<GeminiConfig> {
  const result = GeminiConfigSchema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: transformZodErrors(result.error),
  };
}

/**
 * Validates an array of LLM messages
 *
 * @param messages - Messages to validate
 * @returns Validation result with typed data or errors
 */
export function validateMessages(
  messages: unknown
): ValidationResult<LLMMessage[]> {
  const result = LLMMessagesSchema.safeParse(messages);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: transformZodErrors(result.error),
  };
}

/**
 * Validates a single LLM message
 *
 * @param message - Message to validate
 * @returns Validation result with typed data or errors
 */
export function validateMessage(
  message: unknown
): ValidationResult<LLMMessage> {
  const result = LLMMessageSchema.safeParse(message);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: transformZodErrors(result.error),
  };
}

/**
 * Validates completion options
 *
 * @param options - Options to validate
 * @returns Validation result with typed data or errors
 */
export function validateCompletionOptions(
  options: unknown
): ValidationResult<LLMCompletionOptions> {
  const result = LLMCompletionOptionsSchema.safeParse(options);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: transformZodErrors(result.error),
  };
}

// =============================================================================
// Environment Variable Validation
// =============================================================================

/**
 * Validates environment variables for a specific provider
 *
 * @param provider - The LLM provider
 * @param env - Environment object (defaults to process.env)
 * @returns Validation result with required environment variables
 *
 * @example
 * ```typescript
 * const result = validateProviderEnv('anthropic', process.env);
 *
 * if (result.success) {
 *   console.log('API key found:', result.data.ANTHROPIC_API_KEY.slice(0, 10) + '...');
 * } else {
 *   console.error('Missing or invalid env vars:', result.errors);
 * }
 * ```
 */
export function validateProviderEnv(
  provider: LLMProvider,
  env: Record<string, string | undefined> = process.env
): ValidationResult<AnthropicEnv | OpenAIEnv | GeminiEnv> {
  const schema = getProviderEnvSchema(provider);
  const result = schema.safeParse(env);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: transformZodErrors(result.error),
  };
}

/**
 * Validates all LLM-related environment variables
 *
 * @param env - Environment object (defaults to process.env)
 * @returns Validation result with all environment variables
 */
export function validateLLMEnv(
  env: Record<string, string | undefined> = process.env
): ValidationResult<LLMEnv> {
  const result = LLMEnvSchema.safeParse(env);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: transformZodErrors(result.error),
  };
}

/**
 * Checks if the required environment variables for a provider are present
 *
 * @param provider - The LLM provider
 * @param env - Environment object (defaults to process.env)
 * @returns True if all required variables are present and valid
 */
export function hasRequiredEnvVars(
  provider: LLMProvider,
  env: Record<string, string | undefined> = process.env
): boolean {
  const result = validateProviderEnv(provider, env);
  return result.success;
}

/**
 * Gets the required environment variable names for a provider
 *
 * @param provider - The LLM provider
 * @returns Array of required environment variable names
 */
export function getRequiredEnvVars(provider: LLMProvider): string[] {
  switch (provider) {
    case LLMProviderEnum.ANTHROPIC:
      return ['ANTHROPIC_API_KEY'];
    case LLMProviderEnum.OPENAI:
      return ['OPENAI_API_KEY'];
    case LLMProviderEnum.GEMINI:
      return ['GOOGLE_API_KEY'];
    default:
      return [];
  }
}

/**
 * Gets optional environment variable names for a provider
 *
 * @param provider - The LLM provider
 * @returns Array of optional environment variable names
 */
export function getOptionalEnvVars(provider: LLMProvider): string[] {
  switch (provider) {
    case LLMProviderEnum.ANTHROPIC:
      return ['ANTHROPIC_BASE_URL', 'ANTHROPIC_API_VERSION'];
    case LLMProviderEnum.OPENAI:
      return ['OPENAI_ORG_ID', 'OPENAI_BASE_URL'];
    case LLMProviderEnum.GEMINI:
      return ['GOOGLE_PROJECT_ID', 'GOOGLE_LOCATION'];
    default:
      return [];
  }
}

// =============================================================================
// Configuration Building with Validation
// =============================================================================

/**
 * Builds a validated configuration from partial input with defaults
 *
 * @param input - Partial configuration input
 * @returns Validation result with complete configuration
 *
 * @example
 * ```typescript
 * const result = buildConfig({
 *   provider: 'anthropic',
 *   model: 'claude-3-5-sonnet-20241022',
 * });
 *
 * if (result.success) {
 *   // result.data has all defaults applied
 *   console.log(result.data.temperature); // 0.3 (default)
 *   console.log(result.data.maxTokens);   // 4096 (default)
 * }
 * ```
 */
export function buildConfig(input: {
  provider: LLMProvider;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): ValidationResult<LLMConfig> {
  const config: LLMConfig = {
    provider: input.provider,
    model: input.model ?? RECOMMENDED_MODELS[input.provider],
    maxTokens: input.maxTokens ?? DEFAULT_LLM_CONFIG.maxTokens,
    temperature: input.temperature ?? DEFAULT_LLM_CONFIG.temperature,
  };

  return validateConfig(config);
}

/**
 * Builds a provider-specific configuration from environment variables
 *
 * @param provider - The LLM provider
 * @param env - Environment object (defaults to process.env)
 * @param overrides - Optional configuration overrides
 * @returns Validation result with complete provider configuration
 *
 * @example
 * ```typescript
 * const result = buildConfigFromEnv('anthropic', process.env, {
 *   model: 'claude-3-opus-20240229',
 *   temperature: 0.5,
 * });
 *
 * if (result.success) {
 *   const adapter = createLLMAdapter(result.data);
 * }
 * ```
 */
export function buildConfigFromEnv(
  provider: LLMProvider,
  env: Record<string, string | undefined> = process.env,
  overrides?: Partial<Omit<LLMConfig, 'provider'>>
): ValidationResult<ProviderSpecificConfig> {
  // First validate that required env vars are present
  const envResult = validateProviderEnv(provider, env);
  if (!envResult.success) {
    return envResult as ValidationResult<ProviderSpecificConfig>;
  }

  // Build the configuration based on provider
  let config: ProviderSpecificConfig;

  switch (provider) {
    case LLMProviderEnum.ANTHROPIC:
      config = {
        provider: 'anthropic',
        model: overrides?.model ?? RECOMMENDED_MODELS.anthropic,
        maxTokens: overrides?.maxTokens ?? DEFAULT_LLM_CONFIG.maxTokens,
        temperature: overrides?.temperature ?? DEFAULT_LLM_CONFIG.temperature,
        apiKey: env.ANTHROPIC_API_KEY,
        baseUrl: env.ANTHROPIC_BASE_URL,
        apiVersion: env.ANTHROPIC_API_VERSION,
      };
      break;

    case LLMProviderEnum.OPENAI:
      config = {
        provider: 'openai',
        model: overrides?.model ?? RECOMMENDED_MODELS.openai,
        maxTokens: overrides?.maxTokens ?? DEFAULT_LLM_CONFIG.maxTokens,
        temperature: overrides?.temperature ?? DEFAULT_LLM_CONFIG.temperature,
        apiKey: env.OPENAI_API_KEY,
        organization: env.OPENAI_ORG_ID,
        baseUrl: env.OPENAI_BASE_URL,
      };
      break;

    case LLMProviderEnum.GEMINI:
      config = {
        provider: 'gemini',
        model: overrides?.model ?? RECOMMENDED_MODELS.gemini,
        maxTokens: overrides?.maxTokens ?? DEFAULT_LLM_CONFIG.maxTokens,
        temperature: overrides?.temperature ?? DEFAULT_LLM_CONFIG.temperature,
        apiKey: env.GOOGLE_API_KEY,
        projectId: env.GOOGLE_PROJECT_ID,
        location: env.GOOGLE_LOCATION,
      };
      break;
  }

  return validateProviderConfig(provider, config);
}

// =============================================================================
// Assertion Functions
// =============================================================================

/**
 * Asserts that a configuration is valid, throwing an error if not
 *
 * @param config - Configuration to validate
 * @returns The validated configuration
 * @throws {Error} If validation fails
 *
 * @example
 * ```typescript
 * // Throws if invalid, returns typed config if valid
 * const config = assertValidConfig({ provider: 'anthropic', ... });
 * ```
 */
export function assertValidConfig(config: unknown): LLMConfig {
  const result = validateConfig(config);

  if (!result.success) {
    const errorMessages = result.errors!.map(
      (e) => `  - ${e.path}: ${e.message}`
    );
    throw new Error(
      `Invalid LLM configuration:\n${errorMessages.join('\n')}`
    );
  }

  return result.data!;
}

/**
 * Asserts that messages are valid, throwing an error if not
 *
 * @param messages - Messages to validate
 * @returns The validated messages
 * @throws {Error} If validation fails
 */
export function assertValidMessages(messages: unknown): LLMMessage[] {
  const result = validateMessages(messages);

  if (!result.success) {
    const errorMessages = result.errors!.map(
      (e) => `  - ${e.path}: ${e.message}`
    );
    throw new Error(`Invalid LLM messages:\n${errorMessages.join('\n')}`);
  }

  return result.data!;
}

/**
 * Asserts that required environment variables are present for a provider
 *
 * @param provider - The LLM provider
 * @param env - Environment object (defaults to process.env)
 * @throws {Error} If required environment variables are missing
 */
export function assertRequiredEnvVars(
  provider: LLMProvider,
  env: Record<string, string | undefined> = process.env
): void {
  const result = validateProviderEnv(provider, env);

  if (!result.success) {
    const required = getRequiredEnvVars(provider);
    const errorMessages = result.errors!.map(
      (e) => `  - ${e.path}: ${e.message}`
    );
    throw new Error(
      `Missing or invalid environment variables for ${provider}:\n` +
        `Required: ${required.join(', ')}\n` +
        `Errors:\n${errorMessages.join('\n')}`
    );
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gets the Zod schema for a provider's configuration
 */
function getProviderConfigSchema(
  provider: LLMProvider
): z.ZodType<ProviderSpecificConfig> {
  switch (provider) {
    case LLMProviderEnum.ANTHROPIC:
      return AnthropicConfigSchema as z.ZodType<ProviderSpecificConfig>;
    case LLMProviderEnum.OPENAI:
      return OpenAIConfigSchema as z.ZodType<ProviderSpecificConfig>;
    case LLMProviderEnum.GEMINI:
      return GeminiConfigSchema as z.ZodType<ProviderSpecificConfig>;
    default:
      return LLMConfigSchema as z.ZodType<ProviderSpecificConfig>;
  }
}

/**
 * Gets the Zod schema for a provider's environment variables
 */
function getProviderEnvSchema(
  provider: LLMProvider
): z.ZodType<AnthropicEnv | OpenAIEnv | GeminiEnv> {
  switch (provider) {
    case LLMProviderEnum.ANTHROPIC:
      return AnthropicEnvSchema as z.ZodType<AnthropicEnv | OpenAIEnv | GeminiEnv>;
    case LLMProviderEnum.OPENAI:
      return OpenAIEnvSchema as z.ZodType<AnthropicEnv | OpenAIEnv | GeminiEnv>;
    case LLMProviderEnum.GEMINI:
      return GeminiEnvSchema as z.ZodType<AnthropicEnv | OpenAIEnv | GeminiEnv>;
    default:
      return LLMEnvSchema as z.ZodType<AnthropicEnv | OpenAIEnv | GeminiEnv>;
  }
}

/**
 * Formats validation errors into a human-readable string
 *
 * @param errors - Array of validation errors
 * @returns Formatted error string
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) {
    return 'No validation errors';
  }

  return errors
    .map((e) => {
      let msg = `${e.path}: ${e.message}`;
      if (e.expected && e.received) {
        msg += ` (expected: ${e.expected}, received: ${e.received})`;
      }
      return msg;
    })
    .join('\n');
}

/**
 * Checks if a value matches a provider type
 */
export function isValidProvider(value: unknown): value is LLMProvider {
  return (
    typeof value === 'string' &&
    Object.values(LLMProviderEnum).includes(value as LLMProvider)
  );
}

/**
 * Gets all supported provider values
 */
export function getSupportedProviders(): LLMProvider[] {
  return Object.values(LLMProviderEnum) as LLMProvider[];
}
