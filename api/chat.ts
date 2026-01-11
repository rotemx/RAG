/**
 * Chat API Endpoint
 *
 * POST /api/chat
 * Request: { message: string, conversationHistory?: Message[] }
 * Response: { answer: string, sources: Source[], metadata: Metadata }
 *
 * This endpoint uses the RAG pipeline to answer questions about Israeli law.
 *
 * SECURITY CONSIDERATIONS:
 * - Rate limiting: This endpoint does NOT implement rate limiting. For production use,
 *   implement rate limiting via Vercel Edge Middleware, Vercel KV, or an API gateway
 *   to prevent abuse and control costs. Recommended limits: 10 req/min, 100 req/hour per IP.
 * - Authentication: This endpoint is currently public. For production, consider adding
 *   API key authentication or OAuth to control access and track usage.
 * - CORS: Requires ALLOWED_ORIGINS environment variable to be set explicitly.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import {
  createRAGService,
  createE5Embedder,
  createVectorStoreService,
  createAnthropicAdapter,
  isRAGError,
  type RAGQueryInput,
  type RAGResponse,
  type Citation,
} from '@israeli-law-rag/lib';

// =============================================================================
// Validation Constants
// =============================================================================

/** Maximum message length in characters */
const MAX_MESSAGE_LENGTH = 2000;

/** Maximum conversation history entries */
const MAX_CONVERSATION_HISTORY = 10;

/** Maximum content length in conversation messages */
const MAX_HISTORY_CONTENT_LENGTH = 5000;

/** Maximum topK value for retrieval */
const MAX_TOP_K = 20;

/** Default topK if not specified */
const DEFAULT_TOP_K = 5;

// =============================================================================
// Validation Types
// =============================================================================

/**
 * Structured validation error for API responses
 */
export interface ValidationError {
  /** Path to the field that failed validation */
  field: string;
  /** Human-readable error message in English */
  message: string;
  /** Error code for programmatic handling */
  code: string;
  /** Hebrew error message for user display */
  messageHe?: string;
}

/**
 * Validation result type
 */
export interface ValidationResult<T> {
  /** Whether validation passed */
  success: boolean;
  /** Validated and sanitized data (if success) */
  data?: T;
  /** Validation errors (if failed) */
  errors?: ValidationError[];
}

// =============================================================================
// Hebrew Error Messages
// =============================================================================

/**
 * Hebrew translations for common validation errors
 */
const HEBREW_ERROR_MESSAGES: Record<string, string> = {
  'message_required': 'יש להזין הודעה',
  'message_empty': 'ההודעה לא יכולה להיות ריקה',
  'message_too_long': `ההודעה לא יכולה להכיל יותר מ-${MAX_MESSAGE_LENGTH} תווים`,
  'message_whitespace': 'ההודעה לא יכולה להכיל רק רווחים',
  'invalid_role': 'התפקיד חייב להיות "user" או "assistant"',
  'content_required': 'תוכן ההודעה נדרש',
  'content_empty': 'תוכן ההודעה לא יכול להיות ריק',
  'content_too_long': `תוכן ההודעה לא יכול להכיל יותר מ-${MAX_HISTORY_CONTENT_LENGTH} תווים`,
  'history_too_long': `לא ניתן לכלול יותר מ-${MAX_CONVERSATION_HISTORY} הודעות בהיסטוריה`,
  'invalid_law_id': 'מזהה החוק חייב להיות מספר שלם חיובי',
  'invalid_topic_id': 'מזהה הנושא חייב להיות מחרוזת לא ריקה',
  'topic_id_too_long': 'מזהה הנושא לא יכול להכיל יותר מ-100 תווים',
  'too_many_law_ids': 'לא ניתן לסנן יותר מ-50 חוקים',
  'too_many_topic_ids': 'לא ניתן לסנן יותר מ-20 נושאים',
  'invalid_date_range': 'תאריך ההתחלה חייב להיות קטן או שווה לתאריך הסיום',
  'invalid_top_k': `מספר התוצאות חייב להיות בין 1 ל-${MAX_TOP_K}`,
  'unexpected_field': 'שדה לא צפוי בבקשה',
  'invalid_body': 'גוף הבקשה אינו תקין',
};

/**
 * Get Hebrew error message for a validation error
 */
function getHebrewMessage(code: string, field?: string): string {
  if (HEBREW_ERROR_MESSAGES[code]) {
    return HEBREW_ERROR_MESSAGES[code];
  }
  // Fallback for unknown errors
  return field ? `שגיאה בשדה ${field}` : 'שגיאת אימות';
}

// =============================================================================
// Request/Response Schemas
// =============================================================================

/**
 * Message role enum for type safety
 */
const MessageRoleSchema = z.enum(['user', 'assistant'], {
  errorMap: () => ({ message: 'Role must be "user" or "assistant"' }),
});

/**
 * Message in conversation history with comprehensive validation
 * Note: not using .strict() to maintain type compatibility with RAGQueryInput
 */
const MessageSchema = z.object({
  role: MessageRoleSchema,
  content: z
    .string({
      required_error: 'Message content is required',
      invalid_type_error: 'Message content must be a string',
    })
    .min(1, 'Message content cannot be empty')
    .max(
      MAX_HISTORY_CONTENT_LENGTH,
      `Message content cannot exceed ${MAX_HISTORY_CONTENT_LENGTH} characters`
    ),
});

/**
 * Filter options for narrowing search with comprehensive validation
 */
const FilterSchema = z
  .object({
    /** Filter by specific law ID */
    lawId: z
      .number({
        invalid_type_error: 'lawId must be a number',
      })
      .int('lawId must be an integer')
      .positive('lawId must be a positive number')
      .optional(),
    /** Filter by topic ID */
    topicId: z
      .string({
        invalid_type_error: 'topicId must be a string',
      })
      .min(1, 'topicId cannot be empty')
      .max(100, 'topicId cannot exceed 100 characters')
      .optional(),
    /** Filter by multiple law IDs */
    lawIds: z
      .array(z.number().int().positive(), {
        invalid_type_error: 'lawIds must be an array of numbers',
      })
      .max(50, 'Cannot filter by more than 50 law IDs')
      .optional(),
    /** Filter by multiple topic IDs */
    topicIds: z
      .array(z.string().min(1).max(100), {
        invalid_type_error: 'topicIds must be an array of strings',
      })
      .max(20, 'Cannot filter by more than 20 topic IDs')
      .optional(),
    /** Filter by publication date range (minimum timestamp) */
    publicationDateMin: z
      .number({
        invalid_type_error: 'publicationDateMin must be a number',
      })
      .int('publicationDateMin must be an integer timestamp')
      .optional(),
    /** Filter by publication date range (maximum timestamp) */
    publicationDateMax: z
      .number({
        invalid_type_error: 'publicationDateMax must be a number',
      })
      .int('publicationDateMax must be an integer timestamp')
      .optional(),
  })
  .refine(
    (data) => {
      // Validate that date range is valid if both are provided
      if (
        data.publicationDateMin !== undefined &&
        data.publicationDateMax !== undefined
      ) {
        return data.publicationDateMin <= data.publicationDateMax;
      }
      return true;
    },
    {
      message: 'publicationDateMin must be less than or equal to publicationDateMax',
      path: ['publicationDateMin'],
    }
  )
  .optional();

/**
 * Chat request body schema with comprehensive validation
 */
const ChatRequestSchema = z
  .object({
    /** The user's message/question in Hebrew */
    message: z
      .string({
        required_error: 'Message is required',
        invalid_type_error: 'Message must be a string',
      })
      .min(1, 'Message cannot be empty')
      .max(MAX_MESSAGE_LENGTH, `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`)
      .transform((val) => val.trim())
      .refine((val) => val.length > 0, {
        message: 'Message cannot be only whitespace',
      }),
    /** Optional conversation history for context */
    conversationHistory: z
      .array(MessageSchema, {
        invalid_type_error: 'conversationHistory must be an array of messages',
      })
      .max(
        MAX_CONVERSATION_HISTORY,
        `Cannot include more than ${MAX_CONVERSATION_HISTORY} messages in history`
      )
      .optional(),
    /** Optional filter to narrow search */
    filter: FilterSchema,
    /** Optional number of results to retrieve */
    topK: z
      .number({
        invalid_type_error: 'topK must be a number',
      })
      .int('topK must be an integer')
      .positive('topK must be a positive number')
      .max(MAX_TOP_K, `topK cannot exceed ${MAX_TOP_K}`)
      .default(DEFAULT_TOP_K)
      .optional(),
  })
  .strict();

/**
 * Source citation in response
 */
const SourceSchema = z.object({
  /** Citation index (1-based) */
  index: z.number().int().positive(),
  /** Law name */
  lawName: z.string(),
  /** Law ID */
  lawId: z.number().int().positive(),
  /** Section reference */
  section: z.string().optional(),
  /** Relevant excerpt */
  excerpt: z.string().optional(),
  /** Relevance score */
  score: z.number().min(0).max(1).optional(),
});

/**
 * Response metadata
 */
const MetadataSchema = z.object({
  /** Request ID for tracking */
  requestId: z.string(),
  /** LLM model used */
  model: z.string(),
  /** LLM provider */
  provider: z.string(),
  /** Total latency in milliseconds */
  totalLatencyMs: z.number(),
  /** Number of chunks retrieved */
  chunksRetrieved: z.number(),
  /** Number of chunks used in context */
  chunksUsed: z.number(),
  /** Token usage */
  tokenUsage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    totalTokens: z.number(),
  }),
  /** Estimated cost in USD */
  estimatedCostUsd: z.number().optional(),
});

/**
 * Chat response body schema
 */
const ChatResponseSchema = z.object({
  /** The generated answer */
  answer: z.string(),
  /** Source citations */
  sources: z.array(SourceSchema),
  /** Response metadata */
  metadata: MetadataSchema,
});

/**
 * Error response schema
 */
const ErrorResponseSchema = z.object({
  error: z.object({
    /** Error message */
    message: z.string(),
    /** Hebrew error message */
    messageHe: z.string().optional(),
    /** Error code */
    code: z.string(),
    /** Request ID for tracking */
    requestId: z.string().optional(),
    /** Validation errors (for 400 responses) */
    validationErrors: z
      .array(
        z.object({
          field: z.string(),
          message: z.string(),
          code: z.string(),
          messageHe: z.string().optional(),
        })
      )
      .optional(),
  }),
});

// Export types
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Metadata = z.infer<typeof MetadataSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// =============================================================================
// Service Singleton
// =============================================================================

let ragServicePromise: Promise<ReturnType<typeof createRAGService>> | null = null;

/**
 * Get or create the RAGService singleton
 * Initializes lazily on first request
 */
async function getRAGService() {
  if (!ragServicePromise) {
    ragServicePromise = initializeRAGService();
  }
  return ragServicePromise;
}

/**
 * Initialize the RAG service with all dependencies
 */
async function initializeRAGService() {
  // Validate required environment variables
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const qdrantUrl = process.env.QDRANT_URL;
  const qdrantApiKey = process.env.QDRANT_API_KEY;

  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }
  if (!qdrantUrl) {
    throw new Error('QDRANT_URL environment variable is required');
  }
  if (!qdrantApiKey) {
    throw new Error('QDRANT_API_KEY environment variable is required');
  }

  // Create embedder
  const embedder = createE5Embedder({
    modelId: 'Xenova/multilingual-e5-large',
    quantized: true,
    cacheSize: 100,
  });

  // Create vector store service
  const vectorStore = createVectorStoreService({
    url: qdrantUrl,
    apiKey: qdrantApiKey,
    collectionName: 'israeli_laws',
  });

  // Create LLM adapter
  const llmAdapter = createAnthropicAdapter({
    apiKey: anthropicApiKey,
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 4096,
  });

  // Create RAG service
  const ragService = createRAGService(
    {
      embedder,
      vectorStore,
      llmAdapter,
    },
    {
      enableCache: true,
      cacheTtlMs: 5 * 60 * 1000, // 5 minutes
      defaultTopK: 5,
      maxContextTokens: 8000,
      enableLatencyLogging: true,
    }
  );

  // Initialize the service (loads embedding model, verifies vector store)
  await ragService.initialize();

  return ragService;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert RAG citations to API source format
 */
function citationsToSources(citations: Citation[]): Source[] {
  return citations.map((citation) => ({
    index: citation.index,
    lawName: citation.lawName,
    lawId: citation.lawId,
    section: citation.section,
    excerpt: citation.excerpt,
    score: citation.score,
  }));
}

/**
 * Convert RAG response to API response format
 */
function formatResponse(ragResponse: RAGResponse): ChatResponse {
  return {
    answer: ragResponse.answer,
    sources: citationsToSources(ragResponse.citations),
    metadata: {
      requestId: ragResponse.requestId,
      model: ragResponse.model,
      provider: ragResponse.provider,
      totalLatencyMs: ragResponse.metrics.totalLatencyMs,
      chunksRetrieved: ragResponse.metrics.chunksRetrieved,
      chunksUsed: ragResponse.metrics.chunksUsed,
      tokenUsage: ragResponse.metrics.tokenUsage,
      estimatedCostUsd: ragResponse.metrics.estimatedCostUsd,
    },
  };
}

/**
 * Generate a unique request ID for tracking
 */
function generateRequestId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Transform Zod errors into structured ValidationError array
 */
function transformZodErrors(zodError: z.ZodError): ValidationError[] {
  return zodError.errors.map((err) => {
    const field = err.path.join('.') || 'body';
    const code = mapZodErrorToCode(err);
    return {
      field,
      message: err.message,
      code,
      messageHe: getHebrewMessage(code, field),
    };
  });
}

/**
 * Map Zod error to a specific error code
 */
function mapZodErrorToCode(err: z.ZodIssue): string {
  const path = err.path.join('.');

  // Map specific fields to error codes
  if (path === 'message' || path.startsWith('message')) {
    if (err.code === 'too_small') return 'message_empty';
    if (err.code === 'too_big') return 'message_too_long';
    if (err.code === 'invalid_type') return 'message_required';
    if (err.message.includes('whitespace')) return 'message_whitespace';
  }

  if (path.includes('role')) return 'invalid_role';
  if (path.includes('content')) {
    if (err.code === 'too_small') return 'content_empty';
    if (err.code === 'too_big') return 'content_too_long';
    return 'content_required';
  }

  if (path === 'conversationHistory' && err.code === 'too_big') {
    return 'history_too_long';
  }

  if (path.includes('lawId')) return 'invalid_law_id';
  if (path.includes('lawIds') && err.code === 'too_big') return 'too_many_law_ids';
  if (path.includes('topicId')) {
    if (err.code === 'too_big') return 'topic_id_too_long';
    return 'invalid_topic_id';
  }
  if (path.includes('topicIds') && err.code === 'too_big') return 'too_many_topic_ids';
  if (path.includes('publicationDate')) return 'invalid_date_range';
  if (path === 'topK') return 'invalid_top_k';

  // Handle strict mode (unexpected fields)
  if (err.code === 'unrecognized_keys') return 'unexpected_field';

  // Default error code based on Zod error code
  return `validation_${err.code}`;
}

/**
 * Create error response with proper structure
 */
function createErrorResponse(
  res: VercelResponse,
  statusCode: number,
  message: string,
  code?: string,
  options?: {
    messageHe?: string;
    requestId?: string;
    validationErrors?: ValidationError[];
  }
): void {
  const response: ErrorResponse = {
    error: {
      message,
      code: code ?? 'UNKNOWN_ERROR',
      ...(options?.messageHe && { messageHe: options.messageHe }),
      ...(options?.requestId && { requestId: options.requestId }),
      ...(options?.validationErrors && { validationErrors: options.validationErrors }),
    },
  };

  res.status(statusCode).json(response);
}

/**
 * Validate request body and return structured result
 */
function validateRequest(body: unknown): ValidationResult<ChatRequest> {
  // Check if body exists
  if (body === undefined || body === null) {
    return {
      success: false,
      errors: [
        {
          field: 'body',
          message: 'Request body is required',
          code: 'invalid_body',
          messageHe: getHebrewMessage('invalid_body'),
        },
      ],
    };
  }

  // Check if body is an object
  if (typeof body !== 'object' || Array.isArray(body)) {
    return {
      success: false,
      errors: [
        {
          field: 'body',
          message: 'Request body must be a JSON object',
          code: 'invalid_body',
          messageHe: getHebrewMessage('invalid_body'),
        },
      ],
    };
  }

  // Validate with Zod
  const result = ChatRequestSchema.safeParse(body);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: transformZodErrors(result.error),
  };
}

// =============================================================================
// Request Handler
// =============================================================================

/**
 * Allowed origins for CORS
 * SECURITY: ALLOWED_ORIGINS must be set in all environments (including preview deployments)
 * Never use wildcard CORS as it allows any website to consume API resources
 */
function getAllowedOrigin(origin: string | undefined): string | null {
  // Get allowed origins from environment variable (comma-separated list)
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;

  // SECURITY: Require explicit ALLOWED_ORIGINS in all environments
  // This prevents accidental exposure in preview/staging deployments
  if (!allowedOriginsEnv) {
    // Log warning for debugging but don't expose to clients
    console.warn('ALLOWED_ORIGINS environment variable is not set. CORS requests will be rejected.');
    return null;
  }

  // Parse allowed origins
  const allowedOrigins = allowedOriginsEnv.split(',').map(o => o.trim());

  // Check if origin is allowed
  if (origin && allowedOrigins.includes(origin)) {
    return origin;
  }

  // Return null if origin not allowed (don't set CORS header)
  return null;
}

/**
 * Chat API handler
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Generate request ID for tracking
  const requestId = generateRequestId();

  // Set CORS headers with origin validation
  const origin = req.headers.origin;
  const allowedOrigin = getAllowedOrigin(origin);

  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Vary by Origin for proper caching when using dynamic origins
    if (allowedOrigin !== '*') {
      res.setHeader('Vary', 'Origin');
    }
  }

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    createErrorResponse(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED', {
      messageHe: 'שיטת הבקשה אינה נתמכת',
      requestId,
    });
    return;
  }

  try {
    // Validate request body with comprehensive validation
    const validationResult = validateRequest(req.body);

    if (!validationResult.success) {
      const primaryError = validationResult.errors![0];
      createErrorResponse(res, 400, primaryError.message, 'VALIDATION_ERROR', {
        messageHe: primaryError.messageHe,
        requestId,
        validationErrors: validationResult.errors,
      });
      return;
    }

    const { message, conversationHistory, filter, topK } = validationResult.data!;

    // Get RAG service
    const ragService = await getRAGService();

    // Build RAG query input with all validated filter options
    // Type assertion is safe because Zod validation ensures required fields are present
    const queryInput: RAGQueryInput = {
      query: message,
      conversationHistory: conversationHistory as
        | { role: 'user' | 'assistant'; content: string }[]
        | undefined,
      filter: filter
        ? {
            lawId: filter.lawId,
            lawIds: filter.lawIds,
            topicId: filter.topicId,
            topicIds: filter.topicIds,
            publicationDateMin: filter.publicationDateMin,
            publicationDateMax: filter.publicationDateMax,
          }
        : undefined,
      topK: topK ?? DEFAULT_TOP_K,
    };

    // Get answer from RAG pipeline
    const ragResponse = await ragService.answer(queryInput);

    // Format and send response
    const response = formatResponse(ragResponse);
    res.status(200).json(response);
  } catch (error) {
    console.error('Chat API error:', error, { requestId });

    // Handle RAG errors
    if (isRAGError(error)) {
      // Map RAG error codes to HTTP status codes and messages
      switch (error.code) {
        case 'NO_RESULTS':
          createErrorResponse(
            res,
            404,
            'No relevant documents found for query',
            error.code,
            {
              messageHe: 'לא נמצאו מסמכים רלוונטיים לשאילתה',
              requestId,
            }
          );
          return;
        case 'NOT_INITIALIZED':
          createErrorResponse(
            res,
            503,
            'Service is currently unavailable',
            error.code,
            {
              messageHe: 'השירות אינו זמין כרגע',
              requestId,
            }
          );
          return;
        case 'TIMEOUT':
          createErrorResponse(
            res,
            504,
            'Request timed out',
            error.code,
            {
              messageHe: 'הבקשה חרגה מהזמן המוקצב',
              requestId,
            }
          );
          return;
        case 'EMBEDDING_ERROR':
        case 'RETRIEVAL_ERROR':
        case 'GENERATION_ERROR':
        case 'PROMPT_ERROR':
          // SECURITY: Don't expose internal error messages to clients
          // Log the actual error server-side, return generic message to client
          createErrorResponse(res, 500, 'An error occurred while processing your request', error.code, {
            messageHe: 'שגיאה בעיבוד הבקשה',
            requestId,
          });
          return;
        default:
          createErrorResponse(res, 500, 'Internal server error', error.code, {
            messageHe: 'שגיאה פנימית',
            requestId,
          });
          return;
      }
    }

    // Handle generic errors
    // SECURITY: Don't expose internal error details to clients
    // The actual error is already logged above with console.error
    createErrorResponse(res, 500, 'An unexpected error occurred', 'INTERNAL_ERROR', {
      messageHe: 'שגיאה לא צפויה',
      requestId,
    });
  }
}
