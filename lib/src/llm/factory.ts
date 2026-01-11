/**
 * LLM Adapter Factory
 *
 * Factory function for creating LLM adapter instances based on provider configuration.
 * Provides a unified entry point for instantiating any supported LLM provider adapter.
 */

import { z } from 'zod';
import { LLMAdapter, LLMError } from './adapter.js';
import {
  type LLMConfig,
  type LLMProvider,
  type AnthropicConfig,
  type OpenAIConfig,
  type GeminiConfig,
  type ProviderSpecificConfig,
  LLMConfigSchema,
  AnthropicConfigSchema,
  OpenAIConfigSchema,
  GeminiConfigSchema,
  LLMErrorCode,
  LLMProvider as LLMProviderEnum,
  DEFAULT_LLM_CONFIG,
  RECOMMENDED_MODELS,
} from './types.js';

// =============================================================================
// Factory Input Types
// =============================================================================

/**
 * Input configuration for the factory function.
 * Can be a base LLMConfig or a provider-specific config.
 */
export type CreateLLMAdapterInput = LLMConfig | ProviderSpecificConfig;

/**
 * Zod schema for validating factory input
 */
export const CreateLLMAdapterInputSchema = z.union([
  AnthropicConfigSchema,
  OpenAIConfigSchema,
  GeminiConfigSchema,
  LLMConfigSchema,
]);

// =============================================================================
// Adapter Registry
// =============================================================================

/**
 * Type for adapter constructor functions.
 * Each provider implementation must conform to this signature.
 */
type AdapterConstructor<T extends LLMConfig = LLMConfig> = new (
  config: T
) => LLMAdapter;

/**
 * Registry mapping provider names to their adapter constructors.
 * Adapters are registered lazily when their modules are loaded.
 */
const adapterRegistry = new Map<LLMProvider, AdapterConstructor>();

/**
 * Registers an adapter constructor for a provider.
 * Called by adapter implementations to make themselves available to the factory.
 *
 * @param provider - The LLM provider identifier
 * @param constructor - The adapter class constructor
 *
 * @example
 * ```typescript
 * // In anthropic-adapter.ts
 * registerAdapter('anthropic', AnthropicAdapter);
 * ```
 */
export function registerAdapter<T extends LLMConfig>(
  provider: LLMProvider,
  constructor: AdapterConstructor<T>
): void {
  adapterRegistry.set(provider, constructor as AdapterConstructor);
}

/**
 * Checks if an adapter is registered for a provider.
 *
 * @param provider - The LLM provider to check
 * @returns Whether an adapter is registered
 */
export function isAdapterRegistered(provider: LLMProvider): boolean {
  return adapterRegistry.has(provider);
}

/**
 * Gets the list of registered providers.
 *
 * @returns Array of registered provider identifiers
 */
export function getRegisteredProviders(): LLMProvider[] {
  return Array.from(adapterRegistry.keys());
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Factory function to create an LLM adapter instance.
 *
 * Creates and returns the appropriate adapter implementation based on the
 * provider specified in the configuration. Supports Anthropic, OpenAI, and
 * Gemini providers with their respective configurations.
 *
 * @param config - The LLM configuration specifying the provider and settings
 * @returns An LLMAdapter instance for the specified provider
 * @throws {LLMError} If the provider is not supported or not yet implemented
 * @throws {LLMError} If configuration validation fails
 *
 * @example
 * ```typescript
 * // Create an Anthropic adapter with default settings
 * const adapter = createLLMAdapter({
 *   provider: 'anthropic',
 *   model: 'claude-3-5-sonnet-20241022',
 *   maxTokens: 4096,
 *   temperature: 0.3,
 * });
 *
 * // Create with provider-specific options
 * const adapter = createLLMAdapter({
 *   provider: 'anthropic',
 *   model: 'claude-3-5-sonnet-20241022',
 *   maxTokens: 4096,
 *   temperature: 0.3,
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 *   baseUrl: 'https://api.anthropic.com',
 * });
 *
 * // Use the adapter
 * const response = await adapter.complete([
 *   { role: 'user', content: 'Hello!' }
 * ]);
 * ```
 */
export function createLLMAdapter(config: CreateLLMAdapterInput): LLMAdapter {
  // Validate the configuration
  const validationResult = CreateLLMAdapterInputSchema.safeParse(config);

  if (!validationResult.success) {
    throw new LLMError({
      code: LLMErrorCode.INVALID_REQUEST,
      message: `Invalid LLM configuration: ${validationResult.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ')}`,
      provider: (config as LLMConfig).provider ?? 'unknown' as LLMProvider,
      retryable: false,
    });
  }

  const validatedConfig = validationResult.data;
  const provider = validatedConfig.provider;

  // Check if adapter is registered
  const AdapterClass = adapterRegistry.get(provider);

  if (AdapterClass) {
    return new AdapterClass(validatedConfig);
  }

  // Provider not registered - throw helpful error
  const registeredProviders = getRegisteredProviders();
  const availableMsg =
    registeredProviders.length > 0
      ? `Available providers: ${registeredProviders.join(', ')}`
      : 'No providers are currently registered. Make sure to import the adapter module first.';

  throw new LLMError({
    code: LLMErrorCode.MODEL_NOT_FOUND,
    message: `LLM provider '${provider}' is not implemented or not registered. ${availableMsg}`,
    provider,
    retryable: false,
  });
}

// =============================================================================
// Convenience Factory Functions
// =============================================================================

/**
 * Creates an Anthropic adapter with the specified configuration.
 *
 * @param config - Anthropic-specific configuration (provider field is optional)
 * @returns An LLMAdapter configured for Anthropic
 * @throws {LLMError} If Anthropic adapter is not registered
 *
 * @example
 * ```typescript
 * const adapter = createAnthropicAdapter({
 *   model: 'claude-3-5-sonnet-20241022',
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 * });
 * ```
 */
export function createAnthropicAdapter(
  config: Omit<AnthropicConfig, 'provider'> & { provider?: 'anthropic' }
): LLMAdapter {
  return createLLMAdapter({
    ...config,
    provider: LLMProviderEnum.ANTHROPIC,
  } as AnthropicConfig);
}

/**
 * Creates an OpenAI adapter with the specified configuration.
 *
 * @param config - OpenAI-specific configuration (provider field is optional)
 * @returns An LLMAdapter configured for OpenAI
 * @throws {LLMError} If OpenAI adapter is not registered
 *
 * @example
 * ```typescript
 * const adapter = createOpenAIAdapter({
 *   model: 'gpt-4-turbo',
 *   apiKey: process.env.OPENAI_API_KEY,
 * });
 * ```
 */
export function createOpenAIAdapter(
  config: Omit<OpenAIConfig, 'provider'> & { provider?: 'openai' }
): LLMAdapter {
  return createLLMAdapter({
    ...config,
    provider: LLMProviderEnum.OPENAI,
  } as OpenAIConfig);
}

/**
 * Creates a Gemini adapter with the specified configuration.
 *
 * @param config - Gemini-specific configuration (provider field is optional)
 * @returns An LLMAdapter configured for Google Gemini
 * @throws {LLMError} If Gemini adapter is not registered
 *
 * @example
 * ```typescript
 * const adapter = createGeminiAdapter({
 *   model: 'gemini-1.5-pro',
 *   apiKey: process.env.GOOGLE_API_KEY,
 * });
 * ```
 */
export function createGeminiAdapter(
  config: Omit<GeminiConfig, 'provider'> & { provider?: 'gemini' }
): LLMAdapter {
  return createLLMAdapter({
    ...config,
    provider: LLMProviderEnum.GEMINI,
  } as GeminiConfig);
}

// =============================================================================
// Default Adapter Factory
// =============================================================================

/**
 * Creates an LLM adapter with default configuration for the specified provider.
 *
 * Uses the recommended model and default settings for the provider.
 * Useful for quick prototyping or when detailed configuration isn't needed.
 *
 * @param provider - The LLM provider to use
 * @param overrides - Optional configuration overrides
 * @returns An LLMAdapter with default configuration
 * @throws {LLMError} If the provider is not supported
 *
 * @example
 * ```typescript
 * // Create adapter with all defaults
 * const adapter = createDefaultAdapter('anthropic');
 *
 * // Create with some overrides
 * const adapter = createDefaultAdapter('anthropic', {
 *   temperature: 0.7,
 *   maxTokens: 8192,
 * });
 * ```
 */
export function createDefaultAdapter(
  provider: LLMProvider,
  overrides?: Partial<Omit<LLMConfig, 'provider'>>
): LLMAdapter {
  const config: LLMConfig = {
    provider,
    model: RECOMMENDED_MODELS[provider],
    maxTokens: overrides?.maxTokens ?? DEFAULT_LLM_CONFIG.maxTokens,
    temperature: overrides?.temperature ?? DEFAULT_LLM_CONFIG.temperature,
  };

  return createLLMAdapter(config);
}
