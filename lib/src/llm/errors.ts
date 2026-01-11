/**
 * LLM Error Types
 *
 * Specific error classes for different types of LLM-related errors.
 * These provide better type discrimination and more specific error handling
 * capabilities compared to the generic LLMError class.
 */

import {
  type LLMProvider,
  type LLMErrorInfo,
  LLMErrorCode,
} from './types.js';

// =============================================================================
// Base LLM Error Class
// =============================================================================

/**
 * Base error class for all LLM-related errors.
 *
 * Provides structured error information including error code,
 * provider, and retry guidance.
 */
export class LLMError extends Error {
  /** Structured error information */
  readonly info: LLMErrorInfo;

  constructor(info: LLMErrorInfo) {
    super(info.message);
    this.name = 'LLMError';
    this.info = info;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LLMError);
    }
  }

  /** Error code */
  get code(): LLMErrorInfo['code'] {
    return this.info.code;
  }

  /** LLM provider that generated the error */
  get provider(): LLMProvider {
    return this.info.provider;
  }

  /** Whether the request can be retried */
  get retryable(): boolean {
    return this.info.retryable;
  }

  /** Suggested retry delay in milliseconds */
  get retryAfterMs(): number | undefined {
    return this.info.retryAfterMs;
  }

  /**
   * Creates an LLMError from an unknown error.
   *
   * @param error - The original error
   * @param provider - The LLM provider
   * @returns LLMError instance
   */
  static fromError(error: unknown, provider: LLMProvider): LLMError {
    if (error instanceof LLMError) {
      return error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';

    return new LLMError({
      code: LLMErrorCode.UNKNOWN,
      message,
      provider,
      retryable: false,
      originalError: error,
    });
  }
}

// =============================================================================
// Specific Error Classes
// =============================================================================

/**
 * Error thrown when the API rate limit is exceeded.
 *
 * This error is retryable and includes a suggested retry delay.
 *
 * @example
 * ```typescript
 * try {
 *   await adapter.complete(messages);
 * } catch (error) {
 *   if (error instanceof RateLimitError) {
 *     console.log(`Rate limited. Retry after ${error.retryAfterMs}ms`);
 *   }
 * }
 * ```
 */
export class RateLimitError extends LLMError {
  constructor(
    message: string,
    provider: LLMProvider,
    retryAfterMs?: number,
    originalError?: unknown
  ) {
    super({
      code: LLMErrorCode.RATE_LIMIT,
      message,
      provider,
      retryable: true,
      retryAfterMs: retryAfterMs ?? 60000, // Default 1 minute
      originalError,
    });
    this.name = 'RateLimitError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitError);
    }
  }
}

/**
 * Error thrown when authentication fails (invalid or missing API key).
 *
 * This error is NOT retryable as it requires fixing the credentials.
 *
 * @example
 * ```typescript
 * try {
 *   await adapter.complete(messages);
 * } catch (error) {
 *   if (error instanceof AuthenticationError) {
 *     console.log('Please check your API key configuration');
 *   }
 * }
 * ```
 */
export class AuthenticationError extends LLMError {
  constructor(
    message: string,
    provider: LLMProvider,
    originalError?: unknown
  ) {
    super({
      code: LLMErrorCode.AUTH_ERROR,
      message,
      provider,
      retryable: false,
      originalError,
    });
    this.name = 'AuthenticationError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthenticationError);
    }
  }
}

/**
 * Error thrown when the request parameters are invalid.
 *
 * This error is NOT retryable as the request needs to be modified.
 *
 * @example
 * ```typescript
 * try {
 *   await adapter.complete(messages);
 * } catch (error) {
 *   if (error instanceof InvalidRequestError) {
 *     console.log('Invalid request:', error.message);
 *   }
 * }
 * ```
 */
export class InvalidRequestError extends LLMError {
  constructor(
    message: string,
    provider: LLMProvider,
    originalError?: unknown
  ) {
    super({
      code: LLMErrorCode.INVALID_REQUEST,
      message,
      provider,
      retryable: false,
      originalError,
    });
    this.name = 'InvalidRequestError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvalidRequestError);
    }
  }
}

/**
 * Error thrown when the requested model is not found or not available.
 *
 * This error is NOT retryable as the model configuration needs to be changed.
 *
 * @example
 * ```typescript
 * try {
 *   await adapter.complete(messages);
 * } catch (error) {
 *   if (error instanceof ModelNotFoundError) {
 *     console.log(`Model not available: ${error.message}`);
 *   }
 * }
 * ```
 */
export class ModelNotFoundError extends LLMError {
  constructor(
    message: string,
    provider: LLMProvider,
    originalError?: unknown
  ) {
    super({
      code: LLMErrorCode.MODEL_NOT_FOUND,
      message,
      provider,
      retryable: false,
      originalError,
    });
    this.name = 'ModelNotFoundError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ModelNotFoundError);
    }
  }
}

/**
 * Error thrown when content is blocked by the provider's safety filters.
 *
 * This error is NOT retryable as the content needs to be modified.
 *
 * @example
 * ```typescript
 * try {
 *   await adapter.complete(messages);
 * } catch (error) {
 *   if (error instanceof ContentFilteredError) {
 *     console.log('Content was blocked by safety filters');
 *   }
 * }
 * ```
 */
export class ContentFilteredError extends LLMError {
  constructor(
    message: string,
    provider: LLMProvider,
    originalError?: unknown
  ) {
    super({
      code: LLMErrorCode.CONTENT_FILTERED,
      message,
      provider,
      retryable: false,
      originalError,
    });
    this.name = 'ContentFilteredError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ContentFilteredError);
    }
  }
}

/**
 * Error thrown when a request times out.
 *
 * This error is retryable as it may be a transient issue.
 *
 * @example
 * ```typescript
 * try {
 *   await adapter.complete(messages);
 * } catch (error) {
 *   if (error instanceof TimeoutError) {
 *     console.log('Request timed out, retrying...');
 *   }
 * }
 * ```
 */
export class TimeoutError extends LLMError {
  constructor(
    message: string,
    provider: LLMProvider,
    retryAfterMs?: number,
    originalError?: unknown
  ) {
    super({
      code: LLMErrorCode.TIMEOUT,
      message,
      provider,
      retryable: true,
      retryAfterMs: retryAfterMs ?? 1000, // Default 1 second
      originalError,
    });
    this.name = 'TimeoutError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TimeoutError);
    }
  }
}

/**
 * Error thrown when the LLM provider's server encounters an error.
 *
 * This error is retryable as server errors are often transient.
 *
 * @example
 * ```typescript
 * try {
 *   await adapter.complete(messages);
 * } catch (error) {
 *   if (error instanceof ServerError) {
 *     console.log('Server error, will retry automatically');
 *   }
 * }
 * ```
 */
export class ServerError extends LLMError {
  constructor(
    message: string,
    provider: LLMProvider,
    retryAfterMs?: number,
    originalError?: unknown
  ) {
    super({
      code: LLMErrorCode.SERVER_ERROR,
      message,
      provider,
      retryable: true,
      retryAfterMs: retryAfterMs ?? 5000, // Default 5 seconds
      originalError,
    });
    this.name = 'ServerError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ServerError);
    }
  }
}

/**
 * Error thrown when there's a network or connection issue.
 *
 * This error is retryable as network issues are often transient.
 *
 * @example
 * ```typescript
 * try {
 *   await adapter.complete(messages);
 * } catch (error) {
 *   if (error instanceof NetworkError) {
 *     console.log('Network error, checking connection...');
 *   }
 * }
 * ```
 */
export class NetworkError extends LLMError {
  constructor(
    message: string,
    provider: LLMProvider,
    retryAfterMs?: number,
    originalError?: unknown
  ) {
    super({
      code: LLMErrorCode.NETWORK_ERROR,
      message,
      provider,
      retryable: true,
      retryAfterMs: retryAfterMs ?? 2000, // Default 2 seconds
      originalError,
    });
    this.name = 'NetworkError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NetworkError);
    }
  }
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to check if an error is an LLMError.
 */
export function isLLMError(error: unknown): error is LLMError {
  return error instanceof LLMError;
}

/**
 * Type guard to check if an error is a RateLimitError.
 */
export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

/**
 * Type guard to check if an error is an AuthenticationError.
 */
export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

/**
 * Type guard to check if an error is an InvalidRequestError.
 */
export function isInvalidRequestError(error: unknown): error is InvalidRequestError {
  return error instanceof InvalidRequestError;
}

/**
 * Type guard to check if an error is a ModelNotFoundError.
 */
export function isModelNotFoundError(error: unknown): error is ModelNotFoundError {
  return error instanceof ModelNotFoundError;
}

/**
 * Type guard to check if an error is a ContentFilteredError.
 */
export function isContentFilteredError(error: unknown): error is ContentFilteredError {
  return error instanceof ContentFilteredError;
}

/**
 * Type guard to check if an error is a TimeoutError.
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

/**
 * Type guard to check if an error is a ServerError.
 */
export function isServerError(error: unknown): error is ServerError {
  return error instanceof ServerError;
}

/**
 * Type guard to check if an error is a NetworkError.
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

/**
 * Determines if an error is retryable.
 *
 * @param error - The error to check
 * @returns Whether the error can be retried
 */
export function isRetryableError(error: unknown): boolean {
  if (isLLMError(error)) {
    return error.retryable;
  }
  return false;
}

/**
 * Gets the retry delay for an error in milliseconds.
 *
 * @param error - The error to check
 * @param defaultDelayMs - Default delay if not specified in error (default: 1000)
 * @returns Retry delay in milliseconds
 */
export function getRetryDelay(error: unknown, defaultDelayMs = 1000): number {
  if (isLLMError(error) && error.retryAfterMs !== undefined) {
    return error.retryAfterMs;
  }
  return defaultDelayMs;
}

// =============================================================================
// Error Factory Function
// =============================================================================

/**
 * Creates the appropriate specific error class based on an LLMErrorInfo object.
 *
 * This is useful when you have error info and want to create the correct
 * specific error type based on the error code.
 *
 * @param info - The LLM error info
 * @returns The appropriate specific error instance
 *
 * @example
 * ```typescript
 * const errorInfo = mapAnthropicError(sdkError);
 * throw createSpecificError(errorInfo);
 * ```
 */
export function createSpecificError(info: LLMErrorInfo): LLMError {
  switch (info.code) {
    case LLMErrorCode.RATE_LIMIT:
      return new RateLimitError(
        info.message,
        info.provider,
        info.retryAfterMs,
        info.originalError
      );

    case LLMErrorCode.AUTH_ERROR:
      return new AuthenticationError(
        info.message,
        info.provider,
        info.originalError
      );

    case LLMErrorCode.INVALID_REQUEST:
      return new InvalidRequestError(
        info.message,
        info.provider,
        info.originalError
      );

    case LLMErrorCode.MODEL_NOT_FOUND:
      return new ModelNotFoundError(
        info.message,
        info.provider,
        info.originalError
      );

    case LLMErrorCode.CONTENT_FILTERED:
      return new ContentFilteredError(
        info.message,
        info.provider,
        info.originalError
      );

    case LLMErrorCode.TIMEOUT:
      return new TimeoutError(
        info.message,
        info.provider,
        info.retryAfterMs,
        info.originalError
      );

    case LLMErrorCode.SERVER_ERROR:
      return new ServerError(
        info.message,
        info.provider,
        info.retryAfterMs,
        info.originalError
      );

    case LLMErrorCode.NETWORK_ERROR:
      return new NetworkError(
        info.message,
        info.provider,
        info.retryAfterMs,
        info.originalError
      );

    case LLMErrorCode.UNKNOWN:
    default:
      return new LLMError(info);
  }
}

// =============================================================================
// Union Type for All Specific Errors
// =============================================================================

/**
 * Union type representing all possible specific LLM error types.
 */
export type SpecificLLMError =
  | RateLimitError
  | AuthenticationError
  | InvalidRequestError
  | ModelNotFoundError
  | ContentFilteredError
  | TimeoutError
  | ServerError
  | NetworkError;
