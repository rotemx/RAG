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
import { type LLMMessage, type LLMStreamChunk } from '../../../lib/src/llm/types.js';
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

const createMockConfig = (
  overrides: Partial<AnthropicAdapterConfig> = {}
): AnthropicAdapterConfig => ({
  provider: 'anthropic' as const,
  model: 'claude-3-5-sonnet-20241022',
  maxTokens: 4096,
  temperature: 0.3,
  apiKey: 'test-api-key',
  ...overrides,
});

const createMockMessages = (): LLMMessage[] => [{ role: 'user', content: 'Hello, how are you?' }];

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

      // Run all pending timers to allow retry to complete
      await vi.runAllTimersAsync();

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

      // Run all pending timers to allow retry to complete
      await vi.runAllTimersAsync();

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

      // Run all pending timers to allow retry to complete
      await vi.runAllTimersAsync();

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

      let caughtError: unknown;
      const responsePromise = adapter.complete(messages).catch((e) => {
        caughtError = e;
      });

      // Run all pending timers to exhaust retry attempts
      await vi.runAllTimersAsync();

      // Wait for the promise to settle
      await responsePromise;

      // Verify error was caught
      expect(caughtError).toBeInstanceOf(ServerError);

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
      const disabledAdapter = new AnthropicAdapter(
        createMockConfig({ enableTokenTracking: false })
      );

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

  // ===========================================================================
  // streamWithTracking() Tests
  // ===========================================================================

  describe('streamWithTracking()', () => {
    it('should track usage from stream when tracking enabled', async () => {
      const config = createMockConfig({
        enableTokenTracking: true,
        retry: { maxRetries: 0 },
      });
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      const mockStreamEvents = [
        { type: 'message_start', message: { usage: { input_tokens: 15 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi!' } },
        { type: 'message_delta', usage: { output_tokens: 3 } },
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

      const { stream, getUsageRecord } = adapter.streamWithTracking(messages);

      // Consume the stream
      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Usage record should be available after stream completes
      const usageRecord = getUsageRecord();
      expect(usageRecord).toBeDefined();
      expect(usageRecord?.usage.inputTokens).toBe(15);
      expect(usageRecord?.usage.outputTokens).toBe(3);
      expect(usageRecord?.provider).toBe('anthropic');
    });

    it('should not track usage when tracking disabled', async () => {
      const config = createMockConfig({
        enableTokenTracking: false,
        retry: { maxRetries: 0 },
      });
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      const mockStreamEvents = [
        { type: 'message_start', message: { usage: { input_tokens: 10 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } },
        { type: 'message_delta', usage: { output_tokens: 2 } },
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

      const { stream, getUsageRecord } = adapter.streamWithTracking(messages);

      // Consume the stream
      for await (const _chunk of stream) {
        // Consume all chunks
      }

      expect(getUsageRecord()).toBeUndefined();
    });

    it('should include metadata in usage record', async () => {
      const config = createMockConfig({
        enableTokenTracking: true,
        retry: { maxRetries: 0 },
      });
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      const mockStreamEvents = [
        { type: 'message_start', message: { usage: { input_tokens: 10 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Test' } },
        { type: 'message_delta', usage: { output_tokens: 2 } },
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

      const { stream, getUsageRecord } = adapter.streamWithTracking(messages, undefined, {
        sessionId: 'test-session',
        requestType: 'chat',
      });

      for await (const _chunk of stream) {
        // Consume all chunks
      }

      const usageRecord = getUsageRecord();
      expect(usageRecord?.metadata).toEqual({
        sessionId: 'test-session',
        requestType: 'chat',
      });
    });
  });

  // ===========================================================================
  // Edge Case Tests
  // ===========================================================================

  describe('edge cases', () => {
    describe('retry-after header parsing', () => {
      it('should use default retry delay when retry-after header is missing', async () => {
        const config = createMockConfig({ retry: { maxRetries: 0 } });
        const adapter = new AnthropicAdapter(config);
        const messages = createMockMessages();

        // Error without retry-after header
        const error = new Anthropic.APIError(429, 'Rate limit exceeded');
        mockClient.messages.create.mockRejectedValue(error);

        try {
          await adapter.complete(messages);
          expect.fail('Should have thrown');
        } catch (e) {
          expect(e).toBeInstanceOf(RateLimitError);
          // Default is 60 seconds (60000ms)
          expect((e as RateLimitError).retryAfterMs).toBe(60000);
        }
      });

      it('should handle non-numeric retry-after header gracefully', async () => {
        const config = createMockConfig({ retry: { maxRetries: 0 } });
        const adapter = new AnthropicAdapter(config);
        const messages = createMockMessages();

        const error = new Anthropic.APIError(429, 'Rate limit exceeded', {
          'retry-after': 'invalid',
        });
        mockClient.messages.create.mockRejectedValue(error);

        try {
          await adapter.complete(messages);
          expect.fail('Should have thrown');
        } catch (e) {
          expect(e).toBeInstanceOf(RateLimitError);
          // Falls back to default when parsing fails
          expect((e as RateLimitError).retryAfterMs).toBe(60000);
        }
      });
    });

    describe('message handling', () => {
      it('should handle conversation with assistant messages', async () => {
        const config = createMockConfig();
        const adapter = new AnthropicAdapter(config);

        const messages: LLMMessage[] = [
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello!' },
          { role: 'user', content: 'How are you?' },
        ];

        mockClient.messages.create.mockResolvedValue(createMockResponse());

        await adapter.complete(messages);

        expect(mockClient.messages.create).toHaveBeenCalledWith(
          expect.objectContaining({
            messages: [
              { role: 'user', content: 'Hi' },
              { role: 'assistant', content: 'Hello!' },
              { role: 'user', content: 'How are you?' },
            ],
          })
        );
      });

      it('should handle multiple system messages by using first one', async () => {
        const config = createMockConfig();
        const adapter = new AnthropicAdapter(config);

        // Note: In practice, we only use the first system message found
        const messages: LLMMessage[] = [
          { role: 'system', content: 'First system message.' },
          { role: 'user', content: 'Hello!' },
        ];

        mockClient.messages.create.mockResolvedValue(createMockResponse());

        await adapter.complete(messages);

        expect(mockClient.messages.create).toHaveBeenCalledWith(
          expect.objectContaining({
            system: 'First system message.',
            messages: [{ role: 'user', content: 'Hello!' }],
          })
        );
      });

      it('should handle empty content response', async () => {
        const config = createMockConfig();
        const adapter = new AnthropicAdapter(config);
        const messages = createMockMessages();

        mockClient.messages.create.mockResolvedValue({
          ...createMockResponse(),
          content: [],
        });

        const response = await adapter.complete(messages);

        expect(response.content).toBe('');
      });
    });

    describe('stream edge cases', () => {
      it('should handle stream with no content deltas', async () => {
        const config = createMockConfig({ retry: { maxRetries: 0 } });
        const adapter = new AnthropicAdapter(config);
        const messages = createMockMessages();

        // Stream with only start and stop events, no content
        const mockStreamEvents = [
          { type: 'message_start', message: { usage: { input_tokens: 10 } } },
          { type: 'message_delta', usage: { output_tokens: 0 } },
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

        // Only final chunk should be present
        expect(chunks.length).toBe(1);
        expect(chunks[0].done).toBe(true);
        expect(chunks[0].content).toBe('');
      });

      it('should handle input_json_delta events gracefully', async () => {
        const config = createMockConfig({ retry: { maxRetries: 0 } });
        const adapter = new AnthropicAdapter(config);
        const messages = createMockMessages();

        // Stream with tool use delta that should be ignored
        const mockStreamEvents = [
          { type: 'message_start', message: { usage: { input_tokens: 10 } } },
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
          {
            type: 'content_block_delta',
            delta: { type: 'input_json_delta', partial_json: '{"key":' },
          },
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

        // Should only have the text chunk and final chunk
        const textChunks = chunks.filter((c) => c.content !== '');
        expect(textChunks.length).toBe(1);
        expect(textChunks[0].content).toBe('Hello');
      });
    });

    describe('error handling edge cases', () => {
      it('should handle APIError without status code', async () => {
        const config = createMockConfig({ retry: { maxRetries: 0 } });
        const adapter = new AnthropicAdapter(config);
        const messages = createMockMessages();

        // Create error with undefined status (cast to bypass type check for testing)
        const error = new Anthropic.APIError(undefined as unknown as number, 'Unknown API error');
        mockClient.messages.create.mockRejectedValue(error);

        // Should fall through to generic LLMError handling
        await expect(adapter.complete(messages)).rejects.toThrow(LLMError);
      });

      it('should handle 503 Service Unavailable as ServerError', async () => {
        const config = createMockConfig({ retry: { maxRetries: 0 } });
        const adapter = new AnthropicAdapter(config);
        const messages = createMockMessages();

        const error = new Anthropic.APIError(503, 'Service temporarily unavailable');
        mockClient.messages.create.mockRejectedValue(error);

        await expect(adapter.complete(messages)).rejects.toThrow(ServerError);
      });

      it('should handle 502 Bad Gateway as ServerError', async () => {
        const config = createMockConfig({ retry: { maxRetries: 0 } });
        const adapter = new AnthropicAdapter(config);
        const messages = createMockMessages();

        const error = new Anthropic.APIError(502, 'Bad gateway');
        mockClient.messages.create.mockRejectedValue(error);

        await expect(adapter.complete(messages)).rejects.toThrow(ServerError);
      });

      it('should handle 403 Forbidden as generic LLMError', async () => {
        const config = createMockConfig({ retry: { maxRetries: 0 } });
        const adapter = new AnthropicAdapter(config);
        const messages = createMockMessages();

        const error = new Anthropic.APIError(403, 'Forbidden');
        mockClient.messages.create.mockRejectedValue(error);

        // 403 doesn't map to a specific error type, should fall through
        await expect(adapter.complete(messages)).rejects.toThrow(LLMError);
      });

      it('should handle non-Error objects thrown', async () => {
        const config = createMockConfig({ retry: { maxRetries: 0 } });
        const adapter = new AnthropicAdapter(config);
        const messages = createMockMessages();

        // Throw a string instead of an Error
        mockClient.messages.create.mockRejectedValue('String error');

        await expect(adapter.complete(messages)).rejects.toThrow(LLMError);
      });
    });
  });

  // ===========================================================================
  // Token Tracker Methods Tests
  // ===========================================================================

  describe('token tracker methods', () => {
    it('should return undefined for getTokenTracker when tracking disabled', () => {
      const adapter = new AnthropicAdapter(createMockConfig({ enableTokenTracking: false }));

      expect(adapter.getTokenTracker()).toBeUndefined();
    });

    it('should return token tracker instance when tracking enabled', () => {
      const adapter = new AnthropicAdapter(createMockConfig({ enableTokenTracking: true }));

      expect(adapter.getTokenTracker()).toBeDefined();
    });

    it('should track manual usage', async () => {
      const adapter = new AnthropicAdapter(createMockConfig({ enableTokenTracking: true }));

      const usageRecord = adapter.trackUsage(
        { inputTokens: 100, outputTokens: 50 },
        { latencyMs: 500, metadata: { custom: 'data' } }
      );

      expect(usageRecord).toBeDefined();
      expect(usageRecord?.usage.inputTokens).toBe(100);
      expect(usageRecord?.usage.outputTokens).toBe(50);
    });

    it('should return undefined for trackUsage when tracking disabled', () => {
      const adapter = new AnthropicAdapter(createMockConfig({ enableTokenTracking: false }));

      const result = adapter.trackUsage({ inputTokens: 10, outputTokens: 5 });

      expect(result).toBeUndefined();
    });

    it('should get total tokens', async () => {
      const adapter = new AnthropicAdapter(createMockConfig({ enableTokenTracking: true }));
      const messages = createMockMessages();

      mockClient.messages.create.mockResolvedValue(createMockResponse());

      await adapter.completeWithTracking(messages);

      const totals = adapter.getTotalTokens();
      expect(totals).toBeDefined();
      expect(totals!.inputTokens).toBe(10);
      expect(totals!.outputTokens).toBe(20);
      expect(totals!.totalTokens).toBe(30);
    });

    it('should get total cost', async () => {
      const adapter = new AnthropicAdapter(createMockConfig({ enableTokenTracking: true }));
      const messages = createMockMessages();

      mockClient.messages.create.mockResolvedValue(createMockResponse());

      await adapter.completeWithTracking(messages);

      const cost = adapter.getTotalCost();
      expect(cost).toBeDefined();
      expect(cost).toBeGreaterThanOrEqual(0);
    });

    it('should clear usage records', async () => {
      const adapter = new AnthropicAdapter(createMockConfig({ enableTokenTracking: true }));
      const messages = createMockMessages();

      mockClient.messages.create.mockResolvedValue(createMockResponse());

      await adapter.completeWithTracking(messages);
      expect(adapter.getTotalTokens()?.totalTokens).toBeGreaterThan(0);

      adapter.clearUsageRecords();

      expect(adapter.getTotalTokens()?.totalTokens).toBe(0);
    });

    it('should get usage records with filtering', async () => {
      const adapter = new AnthropicAdapter(createMockConfig({ enableTokenTracking: true }));
      const messages = createMockMessages();

      mockClient.messages.create.mockResolvedValue(createMockResponse());

      await adapter.completeWithTracking(messages);
      await adapter.completeWithTracking(messages);

      const records = adapter.getUsageRecords({ limit: 1 });
      expect(records).toBeDefined();
      expect(records!.length).toBe(1);
    });

    it('should calculate cost for given usage', () => {
      const adapter = new AnthropicAdapter(createMockConfig({ enableTokenTracking: true }));

      const cost = adapter.calculateCost({ inputTokens: 1000, outputTokens: 500 });

      expect(cost).toBeDefined();
      expect(typeof cost).toBe('number');
    });

    it('should return undefined for calculateCost when tracking disabled', () => {
      const adapter = new AnthropicAdapter(createMockConfig({ enableTokenTracking: false }));

      const cost = adapter.calculateCost({ inputTokens: 1000, outputTokens: 500 });

      expect(cost).toBeUndefined();
    });
  });

  // ===========================================================================
  // Provider and Model Getter Tests
  // ===========================================================================

  describe('provider and model getters', () => {
    it('should return correct provider', () => {
      const adapter = new AnthropicAdapter(createMockConfig());

      expect(adapter.provider).toBe('anthropic');
    });

    it('should return correct model', () => {
      const adapter = new AnthropicAdapter(createMockConfig({ model: 'claude-3-opus-20240229' }));

      expect(adapter.model).toBe('claude-3-opus-20240229');
    });
  });

  // ===========================================================================
  // Default Configuration Tests
  // ===========================================================================

  describe('default configuration', () => {
    it('should use ANTHROPIC_API_KEY from environment when not provided', () => {
      const originalEnv = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'env-api-key';

      try {
        const config: AnthropicAdapterConfig = {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-20241022',
          maxTokens: 4096,
          temperature: 0.3,
          // No apiKey provided
        };
        new AnthropicAdapter(config);

        expect(Anthropic).toHaveBeenCalledWith({
          apiKey: 'env-api-key',
          baseURL: undefined,
        });
      } finally {
        if (originalEnv !== undefined) {
          process.env.ANTHROPIC_API_KEY = originalEnv;
        } else {
          delete process.env.ANTHROPIC_API_KEY;
        }
      }
    });

    it('should use default retry config when not provided', async () => {
      const config = createMockConfig(); // No retry config
      const adapter = new AnthropicAdapter(config);
      const messages = createMockMessages();

      const serverError = new Anthropic.APIError(500, 'Internal server error');
      mockClient.messages.create
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce(createMockResponse());

      const responsePromise = adapter.complete(messages);

      // Default config should allow retries - run all timers to completion
      await vi.runAllTimersAsync();

      const response = await responsePromise;
      expect(response.content).toBe('Hello! I am doing well.');
      expect(mockClient.messages.create).toHaveBeenCalledTimes(2);
    });
  });
});
