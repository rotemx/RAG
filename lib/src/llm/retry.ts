/**
 * Retry Utilities for LLM Adapters
 *
 * Provides exponential backoff retry logic with jitter for handling
 * transient failures like rate limits, timeouts, and server errors.
 */

import {
  DEFAULT_RETRY_CONFIG,
  LLMErrorCode,
  type LLMErrorInfo,
  type RetryConfig,
  type RetryEvent,
  type RetryEventHandler,
} from './types.js';
import { isLLMError, LLMError } from './errors.js';

// ============================================================================
// Retry Utilities
// ============================================================================

/**
 * Calculates the delay before the next retry attempt using exponential backoff.
 *
 * @param attemptNumber - The current attempt number (1-based)
 * @param config - Retry configuration
 * @param errorRetryAfterMs - Optional retry-after value from the error
 * @returns Delay in milliseconds before the next retry
 */
export function calculateRetryDelay(
  attemptNumber: number,
  config: Required<RetryConfig>,
  errorRetryAfterMs?: number
): number {
  // If the error specifies a retry-after, respect it (but cap at maxDelayMs)
  if (errorRetryAfterMs !== undefined && errorRetryAfterMs > 0) {
    return Math.min(errorRetryAfterMs, config.maxDelayMs);
  }

  // Calculate exponential backoff: initialDelayMs * (multiplier ^ (attempt - 1))
  const exponentialDelay =
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attemptNumber - 1);

  // Cap at maxDelayMs
  let delay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter to prevent thundering herd
  if (config.jitter) {
    const jitterRange = delay * config.jitterFactor;
    // Add random jitter between -jitterRange/2 and +jitterRange/2
    delay += (Math.random() - 0.5) * jitterRange;
    // Ensure delay doesn't go below 0
    delay = Math.max(0, delay);
  }

  return Math.round(delay);
}

/**
 * Determines if an error should trigger a retry based on the configuration.
 *
 * @param error - The error to check
 * @param config - Retry configuration
 * @returns True if the error should trigger a retry
 */
export function shouldRetry(
  error: unknown,
  config: Required<RetryConfig>
): boolean {
  if (!isLLMError(error)) {
    return false;
  }

  // Check if the error is marked as retryable
  if (!error.retryable) {
    return false;
  }

  // Check if the error code is in the allowed list
  const errorCode = error.code;
  if (config.retryableErrorCodes && config.retryableErrorCodes.length > 0) {
    return config.retryableErrorCodes.includes(
      errorCode as (typeof config.retryableErrorCodes)[number]
    );
  }

  // If no specific codes configured, retry all retryable errors
  return true;
}

/**
 * Creates a retry event for logging/monitoring.
 *
 * @param type - Type of retry event
 * @param attemptNumber - Current attempt number (1-based)
 * @param maxRetries - Maximum retries configured
 * @param error - Optional error information
 * @param nextDelayMs - Optional delay before next retry
 * @returns Retry event object
 */
export function createRetryEvent(
  type: RetryEvent['type'],
  attemptNumber: number,
  maxRetries: number,
  error?: LLMErrorInfo,
  nextDelayMs?: number
): RetryEvent {
  return {
    type,
    attemptNumber,
    maxRetries,
    error,
    nextDelayMs,
    timestamp: new Date(),
  };
}

/**
 * Sleeps for the specified number of milliseconds.
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Merges partial retry config with defaults.
 *
 * @param config - Partial retry configuration
 * @returns Complete retry configuration with defaults applied
 */
export function mergeRetryConfig(config?: Partial<RetryConfig>): Required<RetryConfig> {
  return {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };
}

// ============================================================================
// withRetry Function
// ============================================================================

/**
 * Options for the withRetry function.
 */
export interface WithRetryOptions {
  /** Retry configuration */
  config?: Partial<RetryConfig> | undefined;
  /** Event handler for retry events (useful for logging) */
  onRetryEvent?: RetryEventHandler | undefined;
  /** Abort signal to cancel retries */
  abortSignal?: AbortSignal | undefined;
}

/**
 * Wraps an async function with retry logic using exponential backoff.
 *
 * @param fn - The async function to execute with retries
 * @param options - Retry options
 * @returns Promise resolving to the function result
 * @throws {LLMError} If all retry attempts fail
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => client.messages.create(params),
 *   {
 *     config: { maxRetries: 5, initialDelayMs: 2000 },
 *     onRetryEvent: (event) => console.log('Retry event:', event),
 *   }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: WithRetryOptions = {}
): Promise<T> {
  const config = mergeRetryConfig(options.config);
  const { onRetryEvent, abortSignal } = options;

  let lastError: LLMError | undefined;

  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
    // Check if aborted before attempting
    if (abortSignal?.aborted) {
      throw new LLMError({
        code: LLMErrorCode.UNKNOWN,
        message: 'Operation aborted',
        provider: 'anthropic', // Will be overwritten by actual error if any
        retryable: false,
      });
    }

    // Emit attempt start event
    if (onRetryEvent) {
      onRetryEvent(
        createRetryEvent('attempt_start', attempt, config.maxRetries)
      );
    }

    try {
      const result = await fn();

      // Emit success event
      if (onRetryEvent) {
        onRetryEvent(
          createRetryEvent('attempt_succeeded', attempt, config.maxRetries)
        );
      }

      return result;
    } catch (error) {
      // Convert to LLMError if needed
      lastError = isLLMError(error)
        ? error
        : LLMError.fromError(error, 'anthropic');

      // Emit failure event
      if (onRetryEvent) {
        onRetryEvent(
          createRetryEvent(
            'attempt_failed',
            attempt,
            config.maxRetries,
            lastError.info
          )
        );
      }

      // Check if we should retry
      const isLastAttempt = attempt > config.maxRetries;
      const canRetry = !isLastAttempt && shouldRetry(lastError, config);

      if (!canRetry) {
        // No more retries - emit max retries exceeded if applicable
        if (isLastAttempt && onRetryEvent) {
          onRetryEvent(
            createRetryEvent(
              'max_retries_exceeded',
              attempt,
              config.maxRetries,
              lastError.info
            )
          );
        }
        throw lastError;
      }

      // Calculate delay for next retry
      const delayMs = calculateRetryDelay(
        attempt,
        config,
        lastError.retryAfterMs
      );

      // Emit retrying event
      if (onRetryEvent) {
        onRetryEvent(
          createRetryEvent(
            'retrying',
            attempt,
            config.maxRetries,
            lastError.info,
            delayMs
          )
        );
      }

      // Wait before retrying
      await sleep(delayMs);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError ?? new LLMError({
    code: LLMErrorCode.UNKNOWN,
    message: 'Unexpected retry loop exit',
    provider: 'anthropic',
    retryable: false,
  });
}

// ============================================================================
// withRetryGenerator Function
// ============================================================================

/**
 * Wraps an async generator function with retry logic for streaming.
 *
 * Note: This retries the entire stream from the beginning if an error occurs.
 * It cannot resume a partially completed stream.
 *
 * @param fn - The async generator function to execute with retries
 * @param options - Retry options
 * @returns AsyncGenerator that yields values from the function
 * @throws {LLMError} If all retry attempts fail
 *
 * @example
 * ```typescript
 * const stream = withRetryGenerator(
 *   () => client.messages.stream(params),
 *   { config: { maxRetries: 3 } }
 * );
 * for await (const chunk of stream) {
 *   console.log(chunk);
 * }
 * ```
 */
export async function* withRetryGenerator<T>(
  fn: () => AsyncGenerator<T, void, unknown>,
  options: WithRetryOptions = {}
): AsyncGenerator<T, void, unknown> {
  const config = mergeRetryConfig(options.config);
  const { onRetryEvent, abortSignal } = options;

  let lastError: LLMError | undefined;

  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
    // Check if aborted before attempting
    if (abortSignal?.aborted) {
      throw new LLMError({
        code: LLMErrorCode.UNKNOWN,
        message: 'Operation aborted',
        provider: 'anthropic',
        retryable: false,
      });
    }

    // Emit attempt start event
    if (onRetryEvent) {
      onRetryEvent(
        createRetryEvent('attempt_start', attempt, config.maxRetries)
      );
    }

    try {
      const generator = fn();

      // Yield all values from the generator
      for await (const value of generator) {
        yield value;
      }

      // Emit success event
      if (onRetryEvent) {
        onRetryEvent(
          createRetryEvent('attempt_succeeded', attempt, config.maxRetries)
        );
      }

      // Successfully completed - exit
      return;
    } catch (error) {
      // Convert to LLMError if needed
      lastError = isLLMError(error)
        ? error
        : LLMError.fromError(error, 'anthropic');

      // Emit failure event
      if (onRetryEvent) {
        onRetryEvent(
          createRetryEvent(
            'attempt_failed',
            attempt,
            config.maxRetries,
            lastError.info
          )
        );
      }

      // Check if we should retry
      const isLastAttempt = attempt > config.maxRetries;
      const canRetry = !isLastAttempt && shouldRetry(lastError, config);

      if (!canRetry) {
        // No more retries - emit max retries exceeded if applicable
        if (isLastAttempt && onRetryEvent) {
          onRetryEvent(
            createRetryEvent(
              'max_retries_exceeded',
              attempt,
              config.maxRetries,
              lastError.info
            )
          );
        }
        throw lastError;
      }

      // Calculate delay for next retry
      const delayMs = calculateRetryDelay(
        attempt,
        config,
        lastError.retryAfterMs
      );

      // Emit retrying event
      if (onRetryEvent) {
        onRetryEvent(
          createRetryEvent(
            'retrying',
            attempt,
            config.maxRetries,
            lastError.info,
            delayMs
          )
        );
      }

      // Wait before retrying
      await sleep(delayMs);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError ?? new LLMError({
    code: LLMErrorCode.UNKNOWN,
    message: 'Unexpected retry loop exit',
    provider: 'anthropic',
    retryable: false,
  });
}
