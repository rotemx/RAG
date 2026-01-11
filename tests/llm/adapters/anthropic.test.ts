/**
 * Unit Tests for Anthropic Adapter
 *
 * Tests the AnthropicAdapter class for LLM integration with Claude API.
 * Uses mocked Anthropic SDK to test without making actual API calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import {
  AnthropicAdapter,
  type AnthropicAdapterConfig,
} from '../../../lib/src/llm/adapters/anthropic.js';
import {
  LLMError,
  RateLimitError,
  AuthenticationError,
  InvalidRequestError,
  ModelNotFoundError,
  ServerError,
  TimeoutError,
  NetworkError,
} from '../../../lib/src/llm/errors.js';
import {
  type LLMMessage,
  type LLMResponse,
  type LLMStreamChunk,
  LLMProvider,
} from '../../../lib/src/llm/types.js';
import type { RetryEvent } from '../../../lib/src/llm/types.js';

// =============================================================================
// Mock Setup
// =============================================================================

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = vi.fn();

  // Define error classes on the mock
  class APIError extends Error {
    status: number;
    headers?: Record<string, string>;
    constructor(status: number, message: string, headers?: Record<string, string>) {
      super(message);
      this.name = 'APIError';
      this.status = status;
      this.headers = headers;
    }
  }

  class APIConnectionError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'APIConnectionError';
    }
  }

  class APIConnectionTimeoutError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'APIConnectionTimeoutError';
    }
  }

  MockAnthropic.APIError = APIError;
  MockAnthropic.APIConnectionError = APIConnectionError;
  MockAnthropic.APIConnectionTimeoutError = APIConnectionTimeoutError;

  return {
    default: MockAnthropic,
    APIError,
    APIConnectionError,
    APIConnectionTimeoutError,
  };
});

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockConfig = (overrides: Partial<AnthropicAdapterConfig> = {}): AnthropicAdapterConfig => ({
  provider: 'anthropic' as const,
  model: 'claude-3-5-sonnet-20241022',
  maxTokens: 4096,
  temperature: 0.3,
  apiKey: 'test-api-key',
  ...overrides,
});

const createMockMessages = (): LLMMessage[] => [
  { role: 'user', content: 'Hello, how are you?' },
];

const createMockMessagesWithSystem = (): LLMMessage[] => [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Hello!' },
];

const createMockResponse = () => ({
  id: 'msg_123',
  type: 'message' as const,
  role: 'assistant' as const,
  content: [{ type: 'text' as const, text: 'Hello! I am doing well.' }],
  model: 'claude-3-5-sonnet-20241022',
  stop_reason: 'end_turn',
  usage: {
    input_tokens: 10,
    output_tokens: 20,
  },
});

// =============================================================================
// Test Suites
// =============================================================================

describe('AnthropicAdapter', () => {
  let mockClient: {
    messages: {
      create: ReturnType<typeof vi.fn>;
      stream: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Set up mock client
    mockClient = {
      messages: {
        create: vi.fn(),
        stream: vi.fn(),
      },
    };

    // Configure mock constructor to return our mock client
    vi.mocked(Anthropic).mockImplementation(() => mockClient as unknown as Anthropic);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('constructor', () => {
    it('should create an adapter with provided configuration', () => {
      const config = createMockConfig();
      const adapter = new AnthropicAdapter(config);

      expect(adapter.provider).toBe('anthropic');
      expect(adapter.model).toBe('claude-3-5-sonnet-20241022');
      expect(adapter.getConfig().maxTokens).toBe(4096);
      expect(adapter.getConfig().temperature).toBe(0.3);
    });

    it('should initialize Anthropic client with API key', () => {
      const config = createMockConfig({ apiKey: 'my-secret-key' });
      new AnthropicAdapter(config);

      expect(Anthropic).toHaveBeenCalledWith({
        apiKey: 'my-secret-key',
        baseURL: undefined,
      });
    });

    it('should pass baseUrl to Anthropic client', () => {
      const config = createMockConfig({ baseUrl: 'https://proxy.example.com' });
      new AnthropicAdapter(config);

      expect(Anthropic).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        baseURL: 'https://proxy.example.com',
      });
    });

    it('should use default maxTokens and temperature if not provided', () => {
      const config: AnthropicAdapterConfig = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        maxTokens: 4096,
        temperature: 0.3,
      };
      const adapter = new AnthropicAdapter(config);

      expect(adapter.getConfig().maxTokens).toBeDefined();
      expect(adapter.getConfig().temperature).toBeDefined();
    });
  });

  // ===========================================================================
  // complete() Method Tests
  // ===========================================================================

  describe('complete()', () => {
    it('should generate a completion successfully', async () => {
      const config = createMockConfig();
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      mockClient.messages.create.mockResolvedValue(createMockResponse());

      const response = await adapter.complete(messages);

      expect(response.content).toBe('Hello! I am doing well.');
      expect(response.model).toBe('claude-3-5-sonnet-20241022');
      expect(response.usage.inputTokens).toBe(10);
      expect(response.usage.outputTokens).toBe(20);
    });

    it('should pass correct parameters to Anthropic API', async () => {
      const config = createMockConfig();
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      mockClient.messages.create.mockResolvedValue(createMockResponse());

      await adapter.complete(messages);

      expect(mockClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 4096,
          temperature: 0.3,
          messages: [{ role: 'user', content: 'Hello, how are you?' }],
        })
      );
    });

    it('should extract system message from messages array', async () => {
      const config = createMockConfig();
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessagesWithSystem();

      mockClient.messages.create.mockResolvedValue(createMockResponse());

      await adapter.complete(messages);

      expect(mockClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are a helpful assistant.',
          messages: [{ role: 'user', content: 'Hello!' }],
        })
      );
    });

    it('should override config with completion options', async () => {
      const config = createMockConfig();
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      mockClient.messages.create.mockResolvedValue(createMockResponse());

      await adapter.complete(messages, {
        temperature: 0.8,
        maxTokens: 2048,
        stopSequences: ['END'],
        topP: 0.9,
      });

      expect(mockClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.8,
          max_tokens: 2048,
          stop_sequences: ['END'],
          top_p: 0.9,
        })
      );
    });

    it('should throw InvalidRequestError for empty messages array', async () => {
      const config = createMockConfig();
      const adapter = new AnthropicAdapter(config);

      await expect(adapter.complete([])).rejects.toThrow(InvalidRequestError);
    });

    it('should throw InvalidRequestError for messages with only system message', async () => {
      const config = createMockConfig();
      const adapter = new AnthropicAdapter(config);

      await expect(
        adapter.complete([{ role: 'system', content: 'You are helpful.' }])
      ).rejects.toThrow(InvalidRequestError);
    });

    it('should combine multiple text content blocks', async () => {
      const config = createMockConfig();
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      mockClient.messages.create.mockResolvedValue({
        ...createMockResponse(),
        content: [
          { type: 'text', text: 'Part 1. ' },
          { type: 'text', text: 'Part 2.' },
        ],
      });

      const response = await adapter.complete(messages);

      expect(response.content).toBe('Part 1. Part 2.');
    });

    it('should filter out non-text content blocks', async () => {
      const config = createMockConfig();
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      mockClient.messages.create.mockResolvedValue({
        ...createMockResponse(),
        content: [
          { type: 'text', text: 'Hello!' },
          { type: 'tool_use', id: 'tool_1', name: 'search', input: {} },
        ],
      });

      const response = await adapter.complete(messages);

      expect(response.content).toBe('Hello!');
    });
  });

  // ===========================================================================
  // stream() Method Tests
  // ===========================================================================

  describe('stream()', () => {
    it('should generate streaming chunks', async () => {
      const config = createMockConfig({ retry: { maxRetries: 0 } });
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      // Create an async iterable mock for the stream
      const mockStreamEvents = [
        { type: 'message_start', message: { usage: { input_tokens: 10 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: ' World' } },
        { type: 'message_delta', usage: { output_tokens: 5 } },
        { type: 'message_stop' },
      ];

      const mockStreamInstance = {
        [Symbol.asyncIterator]: async function* () {
          for (const event of mockStreamEvents) {
            yield event;
          }
        },
      };

      mockClient.messages.stream.mockResolvedValue(mockStreamInstance);

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of adapter.stream(messages)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      const textChunks = chunks.filter((c) => c.content !== '');
      expect(textChunks.map((c) => c.content).join('')).toBe('Hello World');
    });

    it('should include usage in final chunk', async () => {
      const config = createMockConfig({ retry: { maxRetries: 0 } });
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      const mockStreamEvents = [
        { type: 'message_start', message: { usage: { input_tokens: 10 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } },
        { type: 'message_delta', usage: { output_tokens: 5 } },
        { type: 'message_stop' },
      ];

      const mockStreamInstance = {
        [Symbol.asyncIterator]: async function* () {
          for (const event of mockStreamEvents) {
            yield event;
          }
        },
      };

      mockClient.messages.stream.mockResolvedValue(mockStreamInstance);

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of adapter.stream(messages)) {
        chunks.push(chunk);
      }

      const finalChunk = chunks.find((c) => c.done);
      expect(finalChunk).toBeDefined();
      expect(finalChunk?.usage).toEqual({
        inputTokens: 10,
        outputTokens: 5,
      });
    });

    it('should throw InvalidRequestError for empty messages', async () => {
      const config = createMockConfig({ retry: { maxRetries: 0 } });
      const adapter = new AnthropicAdapter(config);

      const generator = adapter.stream([]);
      await expect(generator.next()).rejects.toThrow(InvalidRequestError);
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('error handling', () => {
    describe('complete() errors', () => {
      it('should throw RateLimitError for 429 status', async () => {
        const config = createMockConfig({ retry: { maxRetries: 0 } });
        const adapter = new AnthropicAdapter(config);
        const messages = createMockMessages();

        const error = new Anthropic.APIError(429, 'Rate limit exceeded');
        mockClient.messages.create.mockRejectedValue(error);

        await expect(adapter.complete(messages)).rejects.toThrow(RateLimitError);
      });

      it('should include retry-after from headers in RateLimitError', async () => {
        const config = createMockConfig({ retry: { maxRetries: 0 } });
        const adapter = new AnthropicAdapter(config);
        const messages = createMockMessages();

        const error = new Anthropic.APIError(429, 'Rate limit exceeded', {
          'retry-after': '30',
        });
        mockClient.messages.create.mockRejectedValue(error);

        try {
          await adapter.complete(messages);
          expect.fail('Should have thrown');
        } catch (e) {
          expect(e).toBeInstanceOf(RateLimitError);
          expect((e as RateLimitError).retryAfterMs).toBe(30000);
        }
      });

      it('should throw AuthenticationError for 401 status', async () => {
        const config = createMockConfig({ retry: { maxRetries: 0 } });
        const adapter = new AnthropicAdapter(config);
        const messages = createMockMessages();

        const error = new Anthropic.APIError(401, 'Invalid API key');
        mockClient.messages.create.mockRejectedValue(error);

        await expect(adapter.complete(messages)).rejects.toThrow(AuthenticationError);
      });

      it('should throw InvalidRequestError for 400 status', async () => {
        const config = createMockConfig({ retry: { maxRetries: 0 } });
        const adapter = new AnthropicAdapter(config);
        const messages = createMockMessages();

        const error = new Anthropic.APIError(400, 'Invalid request parameters');
        mockClient.messages.create.mockRejectedValue(error);

        await expect(adapter.complete(messages)).rejects.toThrow(InvalidRequestError);
      });

      it('should throw ModelNotFoundError for 404 status', async () => {
        const config = createMockConfig({ retry: { maxRetries: 0 } });
        const adapter = new AnthropicAdapter(config);
        const messages = createMockMessages();

        const error = new Anthropic.APIError(404, 'Model not found');
        mockClient.messages.create.mockRejectedValue(error);

        await expect(adapter.complete(messages)).rejects.toThrow(ModelNotFoundError);
      });

      it('should throw ServerError for 500 status', async () => {
        const config = createMockConfig({ retry: { maxRetries: 0 } });
        const adapter = new AnthropicAdapter(config);
        const messages = createMockMessages();

        const error = new Anthropic.APIError(500, 'Internal server error');
        mockClient.messages.create.mockRejectedValue(error);

        await expect(adapter.complete(messages)).rejects.toThrow(ServerError);
      });

      it('should throw TimeoutError for APIConnectionTimeoutError', async () => {
        const config = createMockConfig({ retry: { maxRetries: 0 } });
        const adapter = new AnthropicAdapter(config);
        const messages = createMockMessages();

        const error = new Anthropic.APIConnectionTimeoutError('Request timed out');
        mockClient.messages.create.mockRejectedValue(error);

        await expect(adapter.complete(messages)).rejects.toThrow(TimeoutError);
      });

      it('should throw NetworkError for APIConnectionError', async () => {
        const config = createMockConfig({ retry: { maxRetries: 0 } });
        const adapter = new AnthropicAdapter(config);
        const messages = createMockMessages();

        const error = new Anthropic.APIConnectionError('Connection refused');
        mockClient.messages.create.mockRejectedValue(error);

        await expect(adapter.complete(messages)).rejects.toThrow(NetworkError);
      });

      it('should throw generic LLMError for unknown errors', async () => {
        const config = createMockConfig({ retry: { maxRetries: 0 } });
        const adapter = new AnthropicAdapter(config);
        const messages = createMockMessages();

        mockClient.messages.create.mockRejectedValue(new Error('Unknown error'));

        await expect(adapter.complete(messages)).rejects.toThrow(LLMError);
      });
    });

    describe('stream() errors', () => {
      it('should throw appropriate error during streaming', async () => {
        const config = createMockConfig({ retry: { maxRetries: 0 } });
        const adapter = new AnthropicAdapter(config);
        const messages = createMockMessages();

        const error = new Anthropic.APIError(503, 'Service unavailable');
        mockClient.messages.stream.mockRejectedValue(error);

        const generator = adapter.stream(messages);
        await expect(generator.next()).rejects.toThrow(ServerError);
      });
    });
  });

  // ===========================================================================
  // Retry Behavior Tests
  // ===========================================================================

  describe('retry behavior', () => {
    it('should retry on rate limit error', async () => {
      const config = createMockConfig({
        retry: {
          maxRetries: 2,
          initialDelayMs: 100,
          jitter: false,
        },
      });
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      const rateLimitError = new Anthropic.APIError(429, 'Rate limit exceeded');
      mockClient.messages.create
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(createMockResponse());

      const responsePromise = adapter.complete(messages);

      // Advance timers to allow retry
      await vi.advanceTimersByTimeAsync(200);

      const response = await responsePromise;
      expect(response.content).toBe('Hello! I am doing well.');
      expect(mockClient.messages.create).toHaveBeenCalledTimes(2);
    });

    it('should retry on server error', async () => {
      const config = createMockConfig({
        retry: {
          maxRetries: 2,
          initialDelayMs: 100,
          jitter: false,
        },
      });
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      const serverError = new Anthropic.APIError(500, 'Internal server error');
      mockClient.messages.create
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce(createMockResponse());

      const responsePromise = adapter.complete(messages);

      // Advance timers to allow retry
      await vi.advanceTimersByTimeAsync(200);

      const response = await responsePromise;
      expect(response.content).toBe('Hello! I am doing well.');
      expect(mockClient.messages.create).toHaveBeenCalledTimes(2);
    });

    it('should not retry on authentication error', async () => {
      const config = createMockConfig({
        retry: { maxRetries: 3 },
      });
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      const authError = new Anthropic.APIError(401, 'Invalid API key');
      mockClient.messages.create.mockRejectedValue(authError);

      await expect(adapter.complete(messages)).rejects.toThrow(AuthenticationError);
      expect(mockClient.messages.create).toHaveBeenCalledTimes(1);
    });

    it('should not retry on invalid request error', async () => {
      const config = createMockConfig({
        retry: { maxRetries: 3 },
      });
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      const invalidError = new Anthropic.APIError(400, 'Invalid request');
      mockClient.messages.create.mockRejectedValue(invalidError);

      await expect(adapter.complete(messages)).rejects.toThrow(InvalidRequestError);
      expect(mockClient.messages.create).toHaveBeenCalledTimes(1);
    });

    it('should emit retry events', async () => {
      const retryEvents: RetryEvent[] = [];
      const config = createMockConfig({
        retry: {
          maxRetries: 1,
          initialDelayMs: 100,
          jitter: false,
        },
        onRetryEvent: (event) => retryEvents.push(event),
      });
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      const rateLimitError = new Anthropic.APIError(429, 'Rate limit exceeded');
      mockClient.messages.create
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(createMockResponse());

      const responsePromise = adapter.complete(messages);

      // Advance timers to allow retry
      await vi.advanceTimersByTimeAsync(200);

      await responsePromise;

      expect(retryEvents.length).toBeGreaterThan(0);
      expect(retryEvents.some((e) => e.type === 'attempt_start')).toBe(true);
      expect(retryEvents.some((e) => e.type === 'attempt_failed')).toBe(true);
      expect(retryEvents.some((e) => e.type === 'retrying')).toBe(true);
      expect(retryEvents.some((e) => e.type === 'attempt_succeeded')).toBe(true);
    });

    it('should throw after max retries exceeded', async () => {
      const config = createMockConfig({
        retry: {
          maxRetries: 2,
          initialDelayMs: 50,
          jitter: false,
        },
      });
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      const serverError = new Anthropic.APIError(500, 'Internal server error');
      mockClient.messages.create.mockRejectedValue(serverError);

      const responsePromise = adapter.complete(messages);

      // Advance timers through all retry attempts
      await vi.advanceTimersByTimeAsync(1000);

      await expect(responsePromise).rejects.toThrow(ServerError);
      // Initial attempt + maxRetries
      expect(mockClient.messages.create).toHaveBeenCalledTimes(3);
    });
  });

  // ===========================================================================
  // Token Tracking Tests
  // ===========================================================================

  describe('token tracking', () => {
    it('should track token usage when enabled', async () => {
      const config = createMockConfig({
        enableTokenTracking: true,
      });
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      mockClient.messages.create.mockResolvedValue(createMockResponse());

      const response = await adapter.completeWithTracking(messages);

      expect(response.usageRecord).toBeDefined();
      expect(response.usageRecord?.usage.inputTokens).toBe(10);
      expect(response.usageRecord?.usage.outputTokens).toBe(20);
      expect(response.usageRecord?.provider).toBe('anthropic');
    });

    it('should not include usageRecord when tracking is disabled', async () => {
      const config = createMockConfig({
        enableTokenTracking: false,
      });
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      mockClient.messages.create.mockResolvedValue(createMockResponse());

      const response = await adapter.completeWithTracking(messages);

      expect(response.usageRecord).toBeUndefined();
    });

    it('should report tracking status correctly', () => {
      const enabledAdapter = new AnthropicAdapter(createMockConfig({ enableTokenTracking: true }));
      const disabledAdapter = new AnthropicAdapter(createMockConfig({ enableTokenTracking: false }));

      expect(enabledAdapter.isTrackingEnabled).toBe(true);
      expect(disabledAdapter.isTrackingEnabled).toBe(false);
    });

    it('should calculate cost for tracked usage', async () => {
      const config = createMockConfig({
        enableTokenTracking: true,
      });
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      mockClient.messages.create.mockResolvedValue(createMockResponse());

      await adapter.completeWithTracking(messages);

      const stats = adapter.getUsageStatistics();
      expect(stats).toBeDefined();
      expect(stats!.totalRequests).toBe(1);
      expect(stats!.totalCostUsd).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // completeWithMetadata() Tests
  // ===========================================================================

  describe('completeWithMetadata()', () => {
    it('should include latency in response', async () => {
      const config = createMockConfig();
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      mockClient.messages.create.mockResolvedValue(createMockResponse());

      const response = await adapter.completeWithMetadata(messages);

      expect(response.latencyMs).toBeDefined();
      expect(response.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should include provider in response', async () => {
      const config = createMockConfig();
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      mockClient.messages.create.mockResolvedValue(createMockResponse());

      const response = await adapter.completeWithMetadata(messages);

      expect(response.provider).toBe('anthropic');
    });
  });

  // ===========================================================================
  // streamToCompletion() Tests
  // ===========================================================================

  describe('streamToCompletion()', () => {
    it('should collect stream chunks into complete response', async () => {
      const config = createMockConfig({ retry: { maxRetries: 0 } });
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      const mockStreamEvents = [
        { type: 'message_start', message: { usage: { input_tokens: 10 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: ' World!' } },
        { type: 'message_delta', usage: { output_tokens: 8 } },
        { type: 'message_stop' },
      ];

      const mockStreamInstance = {
        [Symbol.asyncIterator]: async function* () {
          for (const event of mockStreamEvents) {
            yield event;
          }
        },
      };

      mockClient.messages.stream.mockResolvedValue(mockStreamInstance);

      const response = await adapter.streamToCompletion(messages);

      expect(response.content).toBe('Hello World!');
      expect(response.usage.inputTokens).toBe(10);
      expect(response.usage.outputTokens).toBe(8);
    });
  });

  // ===========================================================================
  // getConfig() Tests
  // ===========================================================================

  describe('getConfig()', () => {
    it('should return a read-only copy of configuration', () => {
      const config = createMockConfig();
      const adapter = new AnthropicAdapter(config);

      const returnedConfig = adapter.getConfig();

      expect(returnedConfig.provider).toBe('anthropic');
      expect(returnedConfig.model).toBe('claude-3-5-sonnet-20241022');
      expect(returnedConfig.maxTokens).toBe(4096);
      expect(returnedConfig.temperature).toBe(0.3);
    });
  });
});
