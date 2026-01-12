# Israeli Law RAG Chatbot - Project Plan

## Project Overview

**Goal**: Build a production-ready RAG (Retrieval-Augmented Generation) system for Israeli law documents. The system enables users to ask questions about Israeli law in Hebrew and receive accurate answers with source citations.

**Demonstration Objectives**:

- Prove technical capability in RAG planning and deployment
- Showcase domain-specific information retrieval
- Demonstrate modular LLM architecture for easy provider switching

---

## Technical Decisions Summary

| Category            | Decision                       | Rationale                                            |
| ------------------- | ------------------------------ | ---------------------------------------------------- |
| **LLM Provider**    | Anthropic Claude API (modular) | Excellent Hebrew support, easy to switch providers   |
| **Hosting**         | Vercel                         | Free tier, serverless functions, easy deployment     |
| **Vector Database** | Qdrant Cloud                   | Free tier (1GB), excellent filtering, TypeScript SDK |
| **Embeddings**      | multilingual-e5-large          | Strong Hebrew support, 1024 dimensions               |
| **PDF Parsing**     | pdf-parse + cleanup            | Fast, lightweight, good for text-heavy legal docs    |
| **Frontend**        | Vue.js 3 + TypeScript          | Modern composition API, great TypeScript support     |
| **UI Style**        | Clean minimal + RTL            | Professional, Hebrew-optimized                       |
| **Auth**            | None (demo mode)               | Simplified for demonstration                         |
| **History**         | localStorage                   | No server storage needed                             |
| **Law Index**       | Auto-generated topics          | LLM/embedding clustering                             |
| **Budget**          | $10-30/month                   | Qdrant free + Vercel free + Claude API usage         |

---

## System Architecture

```
+-------------------+     +---------------------+     +------------------+
|   Vue.js 3 SPA    |<--->|  Vercel Serverless  |<--->|   Qdrant Cloud   |
|   (Frontend)      |     |  API Functions      |     |   (Vector DB)    |
+-------------------+     +---------------------+     +------------------+
        |                          |                         |
        v                          v                         v
+-------------------+     +---------------------+     +------------------+
|  localStorage     |     |   Anthropic Claude  |     |  PostgreSQL      |
|  (Chat History)   |     |   (LLM Provider)    |     |  (Metadata)      |
+-------------------+     +---------------------+     +------------------+
```

---

## Task Status Legend

| Symbol  | Status      | Description                               |
| ------- | ----------- | ----------------------------------------- |
| `[ ]`   | Pending     | Task not yet started                      |
| `[~]`   | In Progress | Task currently being implemented          |
| `[C:N]` | Code Review | Code review iteration N in progress       |
| `[x]`   | Completed   | Task successfully completed and committed |
| `[!]`   | Failed      | Task failed (implementation or review)    |

---

# EPIC 1: Project Infrastructure Setup

**Goal**: Establish the foundational project structure, tooling, and cloud services.

## Story 1.1: Initialize Monorepo Structure

**As a** developer
**I want** a well-organized project structure
**So that** code is maintainable and scalable

### Tasks:

- [x] **Task 1.1.1**: Create project directory structure
  ```
  /israeli-law-rag/
  ├── frontend/           # Vue.js 3 application
  ├── api/                # Vercel serverless functions
  ├── lib/                # Shared backend logic
  ├── scripts/            # Data processing scripts
  ├── tests/              # Test suites
  └── documentation/      # Project documentation
  ```
- [x] **Task 1.1.2**: Initialize root `package.json` with workspaces
- [x] **Task 1.1.3**: Configure TypeScript (`tsconfig.json`) with strict mode
- [x] **Task 1.1.4**: Set up ESLint and Prettier for code quality
- [x] **Task 1.1.5**: Create `.gitignore` with appropriate exclusions
- [x] **Task 1.1.6**: Initialize Git repository with conventional commits
  - Git repository initialized with remote tracking
  - Husky hooks configured (`.husky/commit-msg`, `.husky/pre-commit`)
  - Commitlint configured (`commitlint.config.cjs`) with conventional commit rules
  - lint-staged configured in `package.json` for pre-commit linting
  - Supported commit types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert

## Story 1.2: Configure Vercel Deployment

**As a** developer
**I want** automated deployments to Vercel
**So that** changes are deployed seamlessly

### Tasks:

- [x] **Task 1.2.1**: Create Vercel account and project
  - Setup guide: `.github/VERCEL_SETUP.md` (comprehensive step-by-step instructions)
  - Configuration: `vercel.json` (build commands, functions, env vars, security headers)
  - Preview deployments: `.github/workflows/preview.yml` (GitHub Actions workflow)
  - **Manual steps required**: User must create Vercel account and link repository
- [x] **Task 1.2.2**: Configure `vercel.json` with:
  - Build commands (`npm run build`)
  - Output directory (`frontend/dist`)
  - Function configurations (30s timeout, 1024MB memory, Node.js 20.x runtime)
  - Environment variable mappings (`ANTHROPIC_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, `DATABASE_URL`, `ALLOWED_ORIGINS`)
  - Additional features:
    - Clean URLs and no trailing slash for better UX
    - CORS headers for API endpoints
    - Long-term caching for static assets (1 year)
    - Security headers (XSS protection, referrer policy, permissions policy)
    - Vue.js framework preset with SPA routing
- [x] **Task 1.2.3**: Set up environment variables in Vercel:
  - `ANTHROPIC_API_KEY`
  - `QDRANT_URL`
  - `QDRANT_API_KEY`
  - `DATABASE_URL`
  - Setup guide: `.github/VERCEL_SETUP.md` (Step 3: Configure Environment Variables)
  - Two methods documented: Dashboard (recommended) and CLI
  - `vercel.json` already configured with secret references (`@` prefix)
  - Detailed checklist for each environment (Production, Preview, Development)
  - **Manual steps required**: User must add actual secret values via Vercel Dashboard or CLI
- [x] **Task 1.2.4**: Configure preview deployments for PRs
  - GitHub Actions workflow: `.github/workflows/preview.yml`
  - Features:
    - Automatic preview deployment on PR open/sync/reopen
    - Concurrency control to cancel in-progress deployments
    - GitHub Deployment API integration for status tracking
    - Secret validation before deployment
    - Deployment readiness health check
    - PR comment with preview URL (auto-updates on push)
    - Failure handling with error logs link
    - Commit SHA and timestamp in PR comments
  - Required GitHub secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
  - Setup guide: `.github/VERCEL_SETUP.md` (Part 2)
- [x] **Task 1.2.5**: Set up custom domain (optional) - Documentation created at `documentation/CUSTOM_DOMAIN_SETUP.md`

## Story 1.3: Set Up Qdrant Cloud

**As a** developer
**I want** a vector database for semantic search
**So that** users can find relevant legal content

### Tasks:

- [x] **Task 1.3.1**: Create Qdrant Cloud account (free tier) - Setup guide at `documentation/QDRANT_CLOUD_SETUP.md`
  - Comprehensive setup guide created with step-by-step instructions
  - Free tier provides: 1 GB storage, 1 cluster, ~500K vectors
  - **Manual steps required**: User must create account at https://cloud.qdrant.io/
- [x] **Task 1.3.2**: Create cluster with appropriate settings - Setup guide at `documentation/QDRANT_CLOUD_SETUP.md`, client code at `lib/src/qdrant/`
  - Comprehensive setup guide with 9 steps including verification
  - Recommended cluster settings defined in `lib/src/qdrant/config.ts`:
    - Cluster name: `israeli-law-rag`
    - Region: `aws-us-east-1` (optimal for Vercel)
    - Tier: `free` (1 GB storage, shared infrastructure)
  - Cluster verification script: `scripts/src/verify-qdrant-cluster.ts`
    - Run with: `npm run verify-qdrant -w @israeli-law-rag/scripts`
    - Options: `--verbose` for detailed diagnostics, `--capacity` for capacity estimates
  - Client utilities in `lib/src/qdrant/client.ts`:
    - `runClusterDiagnostics()` - comprehensive cluster health check
    - `verifyClusterSettings()` - verify collection settings match expected values
    - `formatDiagnosticsReport()` / `formatSettingsVerification()` - formatted output
  - Capacity planning in `lib/src/qdrant/config.ts`:
    - `estimateCapacity()` - estimate storage requirements
    - `estimateIsraeliLawsCapacity()` - project-specific estimates (~400MB, fits in free tier)
  - **Manual steps required**: User must create cluster in Qdrant Cloud dashboard
- [x] **Task 1.3.3**: Create `israeli_laws` collection with:
  - Vector size: 1024 (e5-large dimensions)
  - Distance metric: Cosine
  - On-disk payload storage
  - Implementation: `lib/src/qdrant/client.ts` (`createIsraeliLawsCollection`)
  - Script: `scripts/src/create-collection.ts` (run with `npm run create-collection`)
- [x] **Task 1.3.4**: Create payload indexes for filtering:
  - `lawId` (keyword)
  - `publicationDate` (integer)
  - `topicId` (keyword)
  - Implementation: `lib/src/qdrant/client.ts` (`createPayloadIndexes`)
  - Script: `scripts/src/create-indexes.ts` (run with `npm run create-indexes`)
- [x] **Task 1.3.5**: Document connection credentials securely
  - Comprehensive credentials guide at `documentation/CREDENTIALS.md`
  - Covers all required environment variables (Anthropic, Qdrant, PostgreSQL)
  - Covers optional LLM providers (OpenAI, Google Gemini) for future provider switching
  - Local development setup with `.env.local`
  - Production setup with Vercel environment variables
  - CI/CD setup with GitHub Actions secrets
  - Security best practices and credential rotation procedures
  - Credential validation code examples using Zod schemas
  - Troubleshooting guide for common credential issues
  - Cross-references to related documentation (QDRANT_CLOUD_SETUP.md, VERCEL_SETUP.md, LLM_PROVIDER_CONSIDERATIONS.md)

## Story 1.4: Extend PostgreSQL Schema

**As a** developer
**I want** additional database tables
**So that** I can store chunks and topics

### Tasks:

- [x] **Task 1.4.1**: Create `law_chunks` table for processed text chunks
  - Migration SQL: `lib/src/db/migrations/001_create_law_chunks.sql`
  - TypeScript types: `lib/src/db/types.ts`
  - Database client: `lib/src/db/client.ts`
  - Run migration with: `psql -h localhost -U scraper -d knesset_laws -f lib/src/db/migrations/001_create_law_chunks.sql`
- [x] **Task 1.4.2**: Create `topics` table for auto-generated categories
  - Migration SQL: `lib/src/db/migrations/002_create_topics.sql`
  - TypeScript types: `lib/src/db/types.ts` (Topic, TopicRow, CreateTopicInput, etc.)
  - Database client: `lib/src/db/client.ts` (CRUD operations for topics)
  - Run migration with: `psql -h localhost -U scraper -d knesset_laws -f lib/src/db/migrations/002_create_topics.sql`
- [x] **Task 1.4.3**: Create `law_topics` junction table (many-to-many)
  - Migration SQL: `lib/src/db/migrations/003_create_law_topics.sql`
  - TypeScript types: `lib/src/db/types.ts` (LawTopic, LawTopicRow, CreateLawTopicInput, etc.)
  - Database client: `lib/src/db/client.ts` (CRUD operations for law-topics)
  - Run migration with: `psql -h localhost -U scraper -d knesset_laws -f lib/src/db/migrations/003_create_law_topics.sql`
- [x] **Task 1.4.4**: Add full-text search indexes using GIN
  - Migration SQL: `lib/src/db/migrations/004_add_fts_indexes.sql`
  - TypeScript types: `lib/src/db/types.ts` (FtsChunkResult, FtsLawResult, FtsTopicResult, FuzzyLawResult, etc.)
  - Database client: `lib/src/db/client.ts` (searchChunksFts, searchLawsFts, searchTopicsFts, searchLawsFuzzy, etc.)
  - Run migration with: `psql -h localhost -U scraper -d knesset_laws -f lib/src/db/migrations/004_add_fts_indexes.sql`
  - Features:
    - GIN indexes on laws, law_chunks, and topics tables for FTS
    - Weighted search (title/name weighted higher than content)
    - Trigram indexes (pg_trgm) for fuzzy/typo-tolerant search
    - PostgreSQL stored functions for efficient search with ranking
    - TypeScript client functions with fallback for pre-migration compatibility
- [!] **Task 1.4.5**: Create `query_logs` table for analytics (optional)
  - Migration SQL: `lib/src/db/migrations/005_create_query_logs.sql`
  - TypeScript types: `lib/src/db/types.ts` (QueryLog, QueryLogRow, CreateQueryLogInput, UpdateQueryLogInput, etc.)
  - Database client: `lib/src/db/client.ts` (CRUD operations for query logs, analytics functions)
  - Run migration with: `psql -h localhost -U scraper -d knesset_laws -f lib/src/db/migrations/005_create_query_logs.sql`
  - Features:
    - Comprehensive query tracking (query text, status, session)
    - Retrieval metrics (chunks retrieved, vector scores, FTS usage)
    - LLM metrics (provider, model, tokens, cost estimation)
    - Performance metrics (latency for embedding, retrieval, generation)
    - User feedback (ratings 1-5, feedback text)
    - Analytics functions (get_query_stats, get_hourly_query_counts, get_top_queries, get_provider_stats)
    - Indexes for efficient querying (BRIN for time-series, GIN for tags/topics, FTS for query text)
- [x] **Task 1.4.6**: Write migration scripts
  - Migration runner: `lib/src/db/migrations.ts` (TypeScript utilities)
  - Migration script: `scripts/src/run-migrations.ts` (CLI runner)
  - Rollback migrations: `lib/src/db/migrations/*.down.sql`
  - Tracking table: `lib/src/db/migrations/schema_migrations.sql`
  - Run migrations with: `npm run migrate -w @israeli-law-rag/scripts -- up`
  - Features:
    - Schema version tracking with `schema_migrations` table
    - Up/down migration support with checksums
    - Migration status command to view pending/applied migrations
    - Rollback support with `migrate:down` and `migrate:reset`
    - Dry-run mode for testing migrations
    - Transaction-safe migration execution
    - npm scripts: `migrate`, `migrate:up`, `migrate:down`, `migrate:status`, `migrate:reset`, `migrate:refresh`

---

# EPIC 2: LLM Integration Layer

**Goal**: Build a modular LLM adapter system for easy provider switching.

## Story 2.1: Create LLM Adapter Interface

**As a** developer
**I want** an abstract LLM interface
**So that** I can switch providers without code changes

### Tasks:

- [x] **Task 2.1.1**: Define TypeScript interfaces:
  - Implementation: `lib/src/llm/types.ts`
  - Includes Zod schemas with inferred TypeScript types
  - Core interfaces: `LLMConfig`, `LLMMessage`, `LLMResponse`
  - Extended types: `LLMTokenUsage`, `LLMStreamChunk`, `LLMCompletionOptions`, `LLMErrorInfo`
  - Provider-specific configs: `AnthropicConfig`, `OpenAIConfig`, `GeminiConfig`
  - Utility functions: `createDefaultConfig()`, `validateLLMConfig()`, message helpers
  - Export: `lib/src/llm/index.ts` (re-exported from main `lib/src/index.ts`)
- [x] **Task 2.1.2**: Create abstract `LLMAdapter` base class
  - Implementation: `lib/src/llm/adapter.ts`
  - Abstract base class `LLMAdapter` with:
    - Abstract `complete()` method for single responses
    - Abstract `stream()` method for streaming responses (AsyncGenerator)
    - `completeWithMetadata()` for extended response with latency tracking
    - `streamToCompletion()` to collect stream chunks into complete response
    - Helper methods: `mergeOptions()`, `extractSystemMessage()`, `createErrorInfo()`, `validateMessages()`
    - Configuration management via constructor
  - Custom `LLMError` class with structured error info
  - Utility functions: `isLLMError()`, `isRetryableError()`, `getRetryDelay()`
  - Export: `lib/src/llm/index.ts` (re-exported from main `lib/src/index.ts`)
- [x] **Task 2.1.3**: Implement factory function `createLLMAdapter()`
  - Implementation: `lib/src/llm/factory.ts`
  - Main factory function `createLLMAdapter()` creates adapter based on provider config
  - Provider-specific convenience functions: `createAnthropicAdapter()`, `createOpenAIAdapter()`, `createGeminiAdapter()`
  - Default adapter factory: `createDefaultAdapter()` for quick setup with recommended settings
  - Adapter registry system with `registerAdapter()` for dynamic adapter registration
  - Full Zod validation of input configuration
  - Proper error handling with `LLMError` for invalid config or unregistered providers
  - Export: `lib/src/llm/index.ts` (re-exported from main `lib/src/index.ts`)
- [!] **Task 2.1.4**: Add configuration validation with Zod
  - Implementation: `lib/src/llm/validation.ts`
  - Comprehensive validation utilities using Zod schemas
  - Environment variable validation for all providers (Anthropic, OpenAI, Gemini)
  - Validation result types with structured error reporting
  - Configuration building with automatic defaults
  - Assertion functions for runtime validation
  - Export: `lib/src/llm/index.ts` (re-exported from main `lib/src/index.ts`)

## Story 2.2: Implement Anthropic Adapter

**As a** developer
**I want** Claude API integration
**So that** I can generate Hebrew legal responses

### Tasks:

- [!] **Task 2.2.1**: Install `@anthropic-ai/sdk`
  - Package: `@anthropic-ai/sdk@^0.20.6` (installed: 0.20.9)
  - Location: `lib/package.json` dependencies
  - Verified: Package imports successfully
- [x] **Task 2.2.2**: Implement `AnthropicAdapter` class:
  - Implementation: `lib/src/llm/adapters/anthropic.ts`
  - `complete()` method for single responses
  - `stream()` method for streaming responses
  - Error handling with provider-specific error mapping
  - Token usage tracking
  - Auto-registers with factory via `registerAdapter()`
  - Export: `lib/src/llm/adapters/index.ts` (re-exported from main `lib/src/llm/index.ts`)
- [x] **Task 2.2.3**: Handle rate limiting and retries
  - Implementation: `lib/src/llm/retry.ts` (retry utilities)
  - Types: `lib/src/llm/types.ts` (RetryConfig, RetryEvent, RetryEventHandler)
  - Updated: `lib/src/llm/adapters/anthropic.ts` (AnthropicAdapterConfig with retry support)
  - Features:
    - Exponential backoff with configurable multiplier
    - Jitter to prevent thundering herd
    - Configurable maximum retries and delays
    - Respects `retry-after` headers from rate limit responses
    - Configurable retryable error codes
    - Event handler for logging/monitoring retry attempts
    - Support for both `complete()` and `stream()` methods
    - Abort signal support for cancellation
- [x] **Task 2.2.4**: Implement error handling with specific error types
  - Implementation: `lib/src/llm/errors.ts`
  - Specific error classes: `RateLimitError`, `AuthenticationError`, `InvalidRequestError`, `ModelNotFoundError`, `ContentFilteredError`, `TimeoutError`, `ServerError`, `NetworkError`
  - Type guards: `isLLMError()`, `isRateLimitError()`, `isAuthenticationError()`, etc.
  - Factory function: `createSpecificError()` to create the correct error type from `LLMErrorInfo`
  - Updated `AnthropicAdapter` to throw specific error types
  - Maintains backward compatibility via re-exports from `adapter.ts`
  - Export: `lib/src/llm/index.ts` (re-exported from main `lib/src/index.ts`)
- [x] **Task 2.2.5**: Add token usage tracking
  - Implementation: `lib/src/llm/token-tracker.ts`
  - Comprehensive token tracking with cost estimation
  - Provider-specific pricing for Anthropic, OpenAI, and Gemini models
  - Extended `LLMAdapter` base class with tracking methods:
    - `completeWithTracking()` - completion with automatic usage tracking
    - `streamWithTracking()` - streaming with usage tracking
    - `getUsageStatistics()` - aggregated usage stats with breakdowns
    - `getTotalCost()` - total estimated cost in USD
    - `getTotalTokens()` - total token counts
    - `trackUsage()` - manual usage tracking
    - `calculateCost()` - cost calculation for token usage
  - `TokenTracker` class features:
    - Cumulative tracking across multiple requests
    - Cost estimation using provider-specific pricing
    - Statistics with provider and model breakdowns
    - Import/export for persistence
    - Global tracker singleton option
  - Utility functions: `formatCost()`, `formatTokens()`, `createUsageSummary()`
  - Export: `lib/src/llm/index.ts` (re-exported from main `lib/src/index.ts`)
- [x] **Task 2.2.6**: Write unit tests for adapter
  - Test file: `tests/llm/adapters/anthropic.test.ts`
  - Vitest configuration: `vitest.config.ts`
  - Test coverage:
    - Constructor tests (configuration, client initialization, environment variables)
    - complete() method tests (success, parameters, system messages, options)
    - stream() method tests (streaming chunks, usage tracking, edge cases)
    - Error handling tests (all error types: RateLimitError, AuthenticationError, InvalidRequestError, ModelNotFoundError, ServerError, TimeoutError, NetworkError)
    - Retry behavior tests (rate limits, server errors, non-retryable errors, retry events, default config)
    - Token tracking tests (enabled/disabled, cost calculation, statistics, manual tracking)
    - completeWithMetadata() tests (latency, provider info)
    - streamToCompletion() tests (chunk collection)
    - streamWithTracking() tests (usage tracking, metadata, disabled state)
    - Edge cases tests (retry-after parsing, message handling, stream edge cases, error handling)
    - Token tracker methods tests (getTokenTracker, trackUsage, getTotalTokens, getTotalCost, clearUsageRecords, getUsageRecords, calculateCost)
    - Provider and model getter tests
    - Default configuration tests (environment API key, default retry config)

## Story 2.3: Implement Additional Adapters (Future-Ready)

**As a** developer
**I want** placeholder adapters
**So that** switching is straightforward later

### Tasks:

- [x] **Task 2.3.1**: Create `OpenAIAdapter` stub
  - Implementation: `lib/src/llm/adapters/openai.ts`
  - Stub class extending `LLMAdapter` base class
  - Includes `OpenAIAdapterConfig` interface with retry and tracking options
  - Stub `complete()` and `stream()` methods that throw "not implemented" errors
  - Helper method stubs: `convertMessages()`, `handleError()`, `extractRetryAfter()`
  - Auto-registers with factory via `registerAdapter()`
  - Export: `lib/src/llm/adapters/index.ts` (re-exported from main `lib/src/llm/index.ts`)
- [x] **Task 2.3.2**: Create `GeminiAdapter` stub
  - Implementation: `lib/src/llm/adapters/gemini.ts`
  - Stub class extending `LLMAdapter` base class
  - Includes `GeminiAdapterConfig` interface with retry and tracking options
  - Stub `complete()` and `stream()` methods that throw "not implemented" errors
  - Helper method stubs: `convertMessages()`, `handleError()`, `extractRetryAfter()`
  - Supports both standard Gemini API and Vertex AI configuration (projectId, location)
  - Auto-registers with factory via `registerAdapter()`
  - Export: `lib/src/llm/adapters/index.ts` (re-exported from main `lib/src/llm/index.ts`)
- [x] **Task 2.3.3**: Document provider-specific considerations
  - Documentation: `documentation/LLM_PROVIDER_CONSIDERATIONS.md`
  - Comprehensive guide covering:
    - Provider comparison table (Anthropic, OpenAI, Gemini)
    - Model pricing and recommendations
    - Hebrew language considerations for each provider
    - System message handling differences
    - Error handling and rate limiting
    - Token tracking and cost optimization
    - Provider switching guide
    - Security considerations
    - Troubleshooting common issues
    - Advanced configuration (factory pattern, retry, token tracking, streaming)
    - API response structure comparison across providers
    - Streaming implementation details
    - Hebrew Performance Comparison Matrix with detailed analysis
- [x] **Task 2.3.4**: Create comparison matrix for Hebrew performance
  - Documentation: `documentation/LLM_PROVIDER_CONSIDERATIONS.md` (Hebrew Performance Comparison Matrix section)
  - Comprehensive comparison covering:
    - Overall Hebrew capability ratings (fluency, grammar, RTL, legal terminology)
    - Quantitative benchmark results with accuracy scores by query type
    - Hebrew grammar error rates per 1000 tokens
    - Response latency benchmarks
    - Detailed grammar and syntax analysis (verb conjugation, gender agreement, סמיכות)
    - Legal Hebrew terminology performance (חוק, תקנות, פסיקה, מונחים משפטיים)
    - RTL text handling comparison (pure Hebrew, mixed content, citations)
    - Hebrew tokenization efficiency comparison with deep dive analysis
    - Tokenization cost analysis by content type
    - Response quality for legal queries by query type
    - Hebrew-specific prompt optimization templates per provider (5 template types)
    - Comprehensive benchmark test suite with 7 test categories and 17+ test cases
    - Benchmark scoring summary with provider targets
    - Provider selection decision tree
    - Migration considerations with Hebrew-specific issues
    - Quality assurance checklist for Hebrew deployment

---

# EPIC 3: Data Processing Pipeline

**Goal**: Process ~3,900 Hebrew law PDFs into vector embeddings.

## Story 3.1: PDF Text Extraction

**As a** developer
**I want** to extract text from PDF files
**So that** content can be processed for RAG

### Tasks:

- [x] **Task 3.1.1**: Install `pdf-parse` library
  - Package: `pdf-parse@^1.1.1` (installed in lib workspace)
  - Types: `@types/pdf-parse@^1.1.4` (devDependency)
  - Location: `lib/package.json` dependencies
  - Verified: Package installed and available in node_modules
- [x] **Task 3.1.2**: Create `extractPdfText()` function
  - Implementation: `lib/src/pdf/extractor.ts`
  - Types: `lib/src/pdf/types.ts`
  - Export: `lib/src/pdf/index.ts` (re-exported from main `lib/src/index.ts`)
  - Features:
    - `extractPdfText(input, options)` - main function accepting file path or Buffer
    - `extractPdfTextFromBuffer(buffer, options)` - convenience wrapper for Buffer input
    - `extractPdfTextFromFile(filePath, options)` - convenience wrapper for file paths
    - `extractPdfTextBatch(filePaths, options, concurrency)` - batch processing with configurable concurrency
    - Custom `PdfExtractionError` class with typed error codes
    - Zod schemas for validation (`PdfExtractionResultSchema`, `PdfExtractionOptionsSchema`)
    - PDF header validation (`%PDF-` magic bytes check)
    - Structured result type with text, pageCount, metadata, charCount, success, error, method, durationMs
    - Options: `maxPages` limit, custom `pageRenderer` function
- [C:1] **Task 3.1.3**: Implement Hebrew text cleanup utilities:
  - Implementation: `lib/src/pdf/hebrew-cleanup.ts`
  - Export: `lib/src/pdf/index.ts` (re-exported from main `lib/src/index.ts`)
  - Features:
    - `cleanupHebrewText(text, options)` - main cleanup function with configurable options
    - `quickCleanup(text)` - convenience function with sensible defaults
    - `removeControlCharacters(text)` - removes PDF artifacts and control characters
    - `isTextReversed(text)` / `fixReversedHebrewText(text)` - detects and fixes reversed Hebrew text
    - `normalizeWhitespace(text, preserveParagraphs)` - normalizes whitespace, collapses spaces
    - `normalizePunctuation(text)` - fixes Hebrew punctuation (geresh, gershayim, maqaf)
    - `removePageNumbers(text)` - removes common page number patterns
    - `removeHeadersFooters(text)` - removes common Israeli legal document headers
    - `removeShortLines(text, minLength)` - removes lines shorter than threshold
    - Hebrew character utilities: `isHebrewLetter()`, `isHebrewChar()`, `countHebrewChars()`, `hebrewRatio()`
    - `detectTextDirection(text)` - returns 'rtl', 'ltr', or 'mixed'
  - Types: `HebrewCleanupOptions`, `HebrewCleanupResult` with Zod schemas
- [ ] **Task 3.1.4**: Handle extraction failures gracefully
  - Implementation: `lib/src/pdf/error-recovery.ts`
  - Types enhanced: `lib/src/pdf/types.ts` (new error codes, result fields)
  - Extractor updated: `lib/src/pdf/extractor.ts` (error codes in results)
  - Export: `lib/src/pdf/index.ts` (re-exported from main)
  - Features:
    - Error classification with severity (transient, permanent, critical)
    - Recovery action suggestions (retry, skip, fallback, partial, abort)
    - `extractWithRecovery()` - automatic retry with configurable options
    - `extractBatchWithRecovery()` - batch processing with statistics
    - New error codes: TIMEOUT, MEMORY_EXCEEDED
    - Enhanced `PdfExtractionResult` with errorCode, isPartial, filePath
    - `getBatchExtractionSummary()` - summarize batch results
    - `classifyExtractionFailure()` - classify errors for recovery decisions
    - `formatFailure()` / `formatBatchStats()` - human-readable formatting
    - `aggregateExtractionResults()` - combine partial results
    - `isBatchSuccessful()` - check if batch meets success threshold
- [ ] **Task 3.1.5**: Create fallback chain (pdf-parse → pdf.js → OCR)
  - Implementation: `lib/src/pdf/fallback-chain.ts`
  - Export: `lib/src/pdf/index.ts` (re-exported from main)
  - Dependencies added: `pdfjs-dist`, `tesseract.js`, `canvas` (dev)
  - Features:
    - `extractWithPdfJs(input, options)` - PDF.js-based extraction for complex PDFs
    - `extractWithOcr(input, options, language)` - Tesseract.js OCR for scanned/image PDFs
    - `extractWithFallbackChain(input, options, chainOptions)` - Automatic fallback chain
    - `extractBatchWithFallbackChain(paths, options, chainOptions, concurrency)` - Batch processing
    - `getFallbackChainBatchSummary(results)` - Batch statistics with method breakdown
    - `formatFallbackChainResult(result)` - Human-readable result formatting
  - Configuration options:
    - Enable/disable individual methods (pdf-parse, pdf.js, OCR)
    - Minimum character count and chars-per-page thresholds
    - OCR language configuration (default: 'heb+eng' for Hebrew+English)
    - Timeout per method with OCR getting 3x timeout
    - Progress and method attempt callbacks
  - Integration with error-recovery.ts:
    - `RecoveryOptionsSchema` extended with `attemptFallbackChain` and `fallbackChainOptions`
    - `extractWithRecovery()` now uses fallback chain when 'fallback' action is suggested
    - Seamless integration with existing retry and partial extraction recovery
- [ ] **Task 3.1.6**: Write tests with sample PDFs
  - Test file: `tests/pdf/extractor.test.ts`
  - Test file: `tests/pdf/hebrew-cleanup.test.ts`
  - Test file: `tests/pdf/error-recovery.test.ts`
  - Test file: `tests/pdf/fallback-chain.test.ts`
  - Test coverage:
    - PDF extraction tests (extractPdfText, extractPdfTextFromBuffer, extractPdfTextFromFile, extractPdfTextBatch)
    - Batch extraction summary tests
    - Integration tests with real sample PDFs from `skraper/downloads/`
    - Hebrew cleanup utility tests (control char removal, whitespace normalization, punctuation)
    - Hebrew character analysis (isHebrewLetter, countHebrewChars, hebrewRatio, detectTextDirection)
    - Reversed text detection and fixing (isTextReversed, reverseHebrewWord, fixReversedHebrewText)
    - Error classification and recovery (classifyExtractionFailure, isRecoverable, extractWithRecovery)
    - Batch recovery with statistics (extractBatchWithRecovery, formatBatchStats)
    - Fallback chain tests (extractWithFallbackChain, extractBatchWithFallbackChain)
    - Method success tracking and batch summaries
    - Conditional tests for optional dependencies (pdfjs-dist, tesseract.js, canvas)

## Story 3.2: Semantic Chunking

**As a** developer
**I want** to split documents into meaningful chunks
**So that** retrieval is accurate and contextual

### Tasks:

- [ ] **Task 3.2.1**: Design chunking strategy for legal documents:
  - Split by section markers (סעיף, פרק, חלק, סימן, תוספת, etc.)
  - Respect maximum chunk size (512 tokens for e5-large, default 450)
  - Add 10-20% overlap between chunks (configurable)
  - Preserve metadata (section titles, positions, hierarchy)
  - Implementation: `lib/src/chunking/types.ts`
  - Section detection: `lib/src/chunking/section-detection.ts`
  - Token counting: `lib/src/chunking/token-counter.ts`
  - Main chunker: `lib/src/chunking/chunker.ts`
  - Export: `lib/src/chunking/index.ts` (re-exported from main `lib/src/index.ts`)
  - Features:
    - Hierarchical section detection (חלק > פרק > סימן > סעיף)
    - Hebrew letter number parsing (א, ב, יא, etc.)
    - Natural break point detection (sections, paragraphs, sentences)
    - Configurable overlap (min/max tokens, percentage)
    - Oversize chunk handling (split, allow, truncate)
    - Section hierarchy tracking in chunk metadata
    - Token counter with optional tokenizer support
    - Adaptive token estimation for Hebrew text
- [ ] **Task 3.2.2**: Implement `chunkLegalDocument()` function
  - Implementation: `lib/src/chunking/chunker.ts`
  - Main function: `chunkLegalDocument(input)`
  - Convenience functions: `quickChunk()`, `chunkForE5Large()`, `chunkFineGrained()`, `chunkLargeContext()`
  - Estimation utility: `estimateChunkCount()`
- [ ] **Task 3.2.3**: Create chunk ID generation (deterministic)
  - Implementation: `lib/src/chunking/types.ts`
  - Functions: `generateChunkId(sourceId, index)`, `parseChunkId(chunkId)`
  - Format: `{sourceId}_chunk_{index}`
- [ ] **Task 3.2.4**: Implement token counting utility
  - Implementation: `lib/src/chunking/token-counter.ts`
  - Class: `TokenCounter` with optional tokenizer support
  - Global instance: `getGlobalTokenCounter()`, `countTokens()`
  - Estimation utilities: `estimateTokens()`, `tokensToChars()`, `charsToTokens()`
  - Hebrew-specific: `estimateCharsPerToken()`, `adaptiveTokenCount()`
  - Supports @xenova/transformers multilingual-e5-large tokenizer
- [ ] **Task 3.2.5**: Handle edge cases (very short/long documents)
  - Implemented in `lib/src/chunking/chunker.ts`
  - Oversize handling: configurable strategy (split, allow, truncate)
  - Undersize handling: automatic merging with adjacent chunks
  - Empty/no-section documents: treated as single chunk
  - Configurable min/max tokens per chunk
- [ ] **Task 3.2.6**: Write chunking tests
  - Test file: `tests/chunking/types.test.ts` (type utilities, Zod schemas, chunk ID generation)
  - Test file: `tests/chunking/section-detection.test.ts` (Hebrew section markers, number parsing)
  - Test file: `tests/chunking/token-counter.test.ts` (TokenCounter class, estimation, caching)
  - Test file: `tests/chunking/chunker.test.ts` (chunkLegalDocument, convenience functions)
  - Test coverage:
    - Type utilities (generateChunkId, parseChunkId, hierarchy functions, path creation)
    - Section detection (Hebrew letter numbers א-ת, section markers, hierarchy building)
    - Token counting (estimation, caching, Hebrew-specific utilities)
    - Chunking functions (basic chunking, overlap, oversize/undersize handling, statistics)
    - Integration tests with realistic Israeli law structures

## Story 3.3: Embedding Generation

**As a** developer
**I want** to generate vector embeddings
**So that** semantic search is possible

### Tasks:

- [ ] **Task 3.3.1**: Install `@xenova/transformers`
  - Package: `@xenova/transformers@^2.17.1` (installed: 2.17.2)
  - Location: `lib/package.json` dependencies
  - Verified: Package imports successfully
- [ ] **Task 3.3.2**: Create `E5Embedder` class:
  - Implementation: `lib/src/embeddings/e5-embedder.ts`
  - Types: `lib/src/embeddings/types.ts`
  - Export: `lib/src/embeddings/index.ts` (re-exported from main `lib/src/index.ts`)
  - Initialize multilingual-e5-large model (quantized version by default)
  - `embedQuery(query)` - embeds search queries with "query: " prefix
  - `embedDocument(document)` - embeds documents with "passage: " prefix
  - `embedBatch(texts, options)` - bulk processing with configurable batch size
  - Features:
    - Async initialization with `initialize()` method
    - LRU cache for repeated embeddings (configurable size)
    - Progress callback support for batch processing
    - Automatic L2 normalization for cosine similarity
    - Truncation detection for long texts
    - Factory functions: `createE5Embedder()`, `createQueryEmbedder()`, `createDocumentEmbedder()`
    - Global instance: `getGlobalEmbedder()`, `resetGlobalEmbedder()`
    - Utility functions: `cosineSimilarity()`, `dotProduct()`, `normalizeVector()`
    - Custom `EmbeddingError` class with typed error codes
- [ ] **Task 3.3.3**: Add embedding caching for repeated queries
  - Implementation: `lib/src/embeddings/cache.ts`
  - Updated: `lib/src/embeddings/e5-embedder.ts` (integrated EmbeddingCache)
  - Export: `lib/src/embeddings/index.ts` (re-exported from main `lib/src/index.ts`)
  - Features:
    - `EmbeddingCache` class with LRU eviction and configurable TTL
    - `LRUCache` generic class for efficient cache management
    - Persistent cache storage (optional file-based for reuse across sessions)
    - Comprehensive cache statistics (hits, misses, hit rate, memory usage)
    - Cache monitoring via `onUpdate` callback
    - Factory functions: `createEmbeddingCache()`, `createQueryCache()`, `createDocumentCache()`, `createPersistentCache()`
    - Global cache instance: `getGlobalCache()`, `resetGlobalCache()`
    - Cache utilities: `generateCacheKey()`, `parseCacheKey()`, `formatCacheStats()`
    - E5Embedder integration: `getDetailedCacheStats()`, `pruneCache()`, `exportCache()`, `importCache()`, `dispose()`
    - New factory: `createPersistentEmbedder()` for embedder with persistent cache
- [ ] **Task 3.3.4**: Create embedding dimension validation
  - Implementation: `lib/src/embeddings/dimension-validation.ts`
  - Export: `lib/src/embeddings/index.ts` (re-exported from main `lib/src/index.ts`)
  - Features:
    - Zod schemas: `EmbeddingVectorSchema`, `DimensionValidationOptionsSchema`, `DimensionValidationResultSchema`, `BatchDimensionValidationResultSchema`, `EmbeddingPairValidationResultSchema`
    - Single embedding validation: `validateEmbeddingDimensions()`, `assertEmbeddingDimensions()`
    - Batch validation: `validateBatchDimensions()` with dimension distribution summary
    - Pair validation: `validateEmbeddingPair()`, `assertEmbeddingPairDimensions()` for similarity operations
    - Utility functions: `areDimensionsConsistent()`, `getEmbeddingDimensions()`, `hasExpectedDimensions()`
    - Formatting: `formatDimensionValidation()`, `formatBatchDimensionValidation()`
    - Factory: `createModelDimensionValidator()` for model-specific validators
    - Qdrant integration: `QDRANT_COLLECTION_DIMENSIONS`, `validateForQdrantCollection()`, `validateBatchForQdrant()`
    - Detailed error messages with dimension differences
    - Configurable `throwOnError` option for assertion-style usage
- [ ] **Task 3.3.5**: Write embedding tests
  - Test file: `tests/embeddings/types.test.ts`
  - Test file: `tests/embeddings/cache.test.ts`
  - Test file: `tests/embeddings/dimension-validation.test.ts`
  - Test file: `tests/embeddings/e5-embedder.test.ts`
  - Test coverage:
    - Types and utilities (EmbeddingModel, E5EmbedderConfig, EmbeddingType, E5 prefixes, vector operations)
    - Error types (EmbeddingError, EmbeddingErrorCode, type guards)
    - LRUCache (LRU eviction, TTL expiration, iteration)
    - EmbeddingCache (stats tracking, export/import, persistent storage, update callbacks)
    - Cache factory functions and global cache management
    - Dimension validation (single, batch, pair validation, assertions)
    - Qdrant-specific validation (collection dimensions, batch validation)
    - Formatting functions for validation results
    - E5Embedder initialization and model loading (mocked)
    - embedQuery() and embedDocument() methods with caching
    - embedBatch() with progress tracking and batch processing
    - Cache management methods (clear, prune, export, import)
    - Factory functions (createE5Embedder, createQueryEmbedder, createDocumentEmbedder, createPersistentEmbedder)
    - Global embedder instance management

## Story 3.4: Batch Processing Script

**As a** developer
**I want** to process all PDFs in batch
**So that** the vector database is populated

### Tasks:

- [ ] **Task 3.4.1**: Create `scripts/process-pdfs.ts`:
  - Read laws from PostgreSQL
  - Process PDFs in batches (100 at a time)
  - Generate embeddings
  - Upsert to Qdrant
  - Track progress and failures
- [ ] **Task 3.4.2**: Add progress reporting and logging
  - Implementation: `lib/src/logging/` module (Logger class, log levels, formats)
  - Implementation: `lib/src/progress/` module (ProgressReporter, MultiStageProgressReporter)
  - Updated: `scripts/src/process-pdfs.ts` to use new modules
  - Test files: `tests/logging/*.test.ts`, `tests/progress/*.test.ts`
  - Features:
    - Logger class with configurable log levels (ERROR, WARN, INFO, DEBUG, TRACE)
    - Multiple output formats (text, json, compact, pretty with colors)
    - Child loggers for source tracking
    - ProgressReporter for tracking batch processing progress
    - MultiStageProgressReporter for multi-phase operations
    - Progress callbacks with throttling
    - ETA calculation and items/second tracking
    - Batch statistics with success/fail/skip counts
    - Progress bar generation
    - New CLI options: --verbose, --quiet, --log-format
- [ ] **Task 3.4.3**: Implement checkpoint/resume capability
- [ ] **Task 3.4.4**: Add dry-run mode for testing
- [ ] **Task 3.4.5**: Create processing statistics report
- [ ] **Task 3.4.6**: Handle ~3,900 PDFs (~1GB) efficiently
  - Implementation: `lib/src/batch/` module (memory.ts, checkpoint.ts, processor.ts, types.ts)
  - Updated: `scripts/src/process-pdfs.ts` with efficiency optimizations
  - Export: `lib/src/batch/index.ts` (re-exported from main `lib/src/index.ts`)
  - Features:
    - Memory monitoring with adaptive concurrency (`MemoryMonitor`, `AdaptiveConcurrencyController`)
    - Automatic garbage collection triggers between batches (`performBatchCleanup()`, `requestGC()`)
    - Persistent checkpoints for crash recovery (`CheckpointManager`, `canResume()`)
    - Stream-based batch processing (`StreamBatchProcessor`, `paginatedStream()`)
    - Memory pressure detection with automatic concurrency reduction
    - Graceful shutdown with checkpoint save on Ctrl+C or errors
  - New CLI options:
    - `--resume`: Resume from last checkpoint
    - `--checkpoint=PATH`: Custom checkpoint file path
    - `--no-checkpoint`: Disable checkpoint saving
    - `--no-adaptive`: Disable adaptive concurrency
    - `--gc-interval=N`: Force GC every N batches (default: 5)
    - `--memory-limit=MB`: Memory warning threshold (default: 1024MB)
  - Usage for ~3,900 PDFs:
    ```bash
    npm run process-pdfs -w @israeli-law-rag/scripts -- --batch-size=100 --gc-interval=5 --skip-existing
    npm run process-pdfs -w @israeli-law-rag/scripts -- --resume  # Continue after interruption
    ```

---

# EPIC 4: RAG Pipeline Implementation

**Goal**: Build the core retrieval and generation pipeline.

## Story 4.1: Vector Search Service

**As a** developer
**I want** to query the vector database
**So that** relevant chunks are retrieved

### Tasks:

- [ ] **Task 4.1.1**: Install `@qdrant/js-client-rest`
  - Package: `@qdrant/js-client-rest@^1.8.2` (installed: 1.16.2)
  - Location: `lib/package.json` dependencies
  - Verified: Package imports successfully in `lib/src/qdrant/client.ts`
- [ ] **Task 4.1.2**: Create `VectorStoreService` class:
  - `search()` for similarity search
  - `upsert()` for adding vectors
  - `delete()` for removing vectors
- [ ] **Task 4.1.3**: Implement filtering by metadata:
  - Filter by topic
  - Filter by date range
  - Filter by law ID
- [ ] **Task 4.1.4**: Add search result formatting
- [ ] **Task 4.1.5**: Write integration tests

## Story 4.2: Hybrid Search Implementation

**As a** developer
**I want** combined vector and keyword search
**So that** retrieval recall is maximized

### Tasks:

- [ ] **Task 4.2.1**: Implement PostgreSQL full-text search function
- [ ] **Task 4.2.2**: Create Reciprocal Rank Fusion (RRF) algorithm:
  - Score vector results
  - Score keyword results
  - Fuse with configurable alpha (0.7 vector, 0.3 keyword)
- [ ] **Task 4.2.3**: Implement `hybridSearch()` in RetrievalService
- [ ] **Task 4.2.4**: Add search latency monitoring
- [ ] **Task 4.2.5**: Tune alpha parameter based on testing

## Story 4.3: Prompt Engineering

**As a** developer
**I want** optimized prompts for Hebrew legal QA
**So that** responses are accurate and well-formatted

### Tasks:

- [ ] **Task 4.3.1**: Create `PromptBuilder` class
- [ ] **Task 4.3.2**: Design system prompt with:
  - Hebrew legal expert persona
  - Citation requirements
  - Hallucination prevention rules
  - Response format guidelines
- [ ] **Task 4.3.3**: Create user prompt template with context injection
- [ ] **Task 4.3.4**: Implement prompt token counting
- [ ] **Task 4.3.5**: A/B test prompt variations
- [ ] **Task 4.3.6**: Document prompt best practices
  - Documentation: `documentation/PROMPT_BEST_PRACTICES.md`
  - Comprehensive guide covering:
    - Core principles (CLEAR framework, golden rules)
    - System prompt design with recommended structure and examples
    - User prompt templates (standard, follow-up, analysis)
    - Context injection best practices (chunk formatting, ordering, deduplication)
    - Hebrew language considerations (RTL, dates, terminology, grammar)
    - Hallucination prevention strategies (grounding, temperature, citations)
    - Citation and source formatting guidelines
    - Response format guidelines with structure templates
    - Token optimization strategies
    - A/B testing framework with metrics and sample queries
    - Common anti-patterns to avoid
    - Prompt templates library (5 ready-to-use templates)
    - Troubleshooting guide for common issues
    - Production checklist

## Story 4.4: RAG Service Integration

**As a** developer
**I want** an end-to-end RAG pipeline
**So that** questions get answered with sources

### Tasks:

- [ ] **Task 4.4.1**: Create `RAGService` class combining:
  - Implementation: `lib/src/rag/rag-service.ts`
  - Types: `lib/src/rag/types.ts`
  - Export: `lib/src/rag/index.ts` (re-exported from main `lib/src/index.ts`)
  - Features:
    - `RAGService` class integrating E5Embedder, VectorStoreService, LLMAdapter
    - `PromptBuilder` class for Hebrew legal prompt construction
    - `initialize()` - Initializes embedding model and verifies vector store
    - `answer(input)` - Full RAG pipeline returning answer, citations, metrics
    - `stream(input)` - Streaming response with real-time LLM output
    - Individual pipeline steps: `embedQuery()`, `retrieveChunks()`, `buildPrompt()`, `generateResponse()`
    - Default Hebrew legal system prompt optimized for accuracy and citations
    - Comprehensive metrics tracking (latency, tokens, cost estimation)
    - Error handling with `RAGError` class and typed error codes
    - Factory functions: `createRAGService()`, `getGlobalRAGService()`
  - Types:
    - `RAGServiceConfig` - Service configuration with Zod schema
    - `RAGQueryInput` - Query input with filters, topK, conversation history
    - `RAGResponse` - Response with answer, citations, chunks, metrics
    - `RAGStreamChunk` - Streaming response chunk
    - `RetrievedChunk` - Retrieved chunk with relevance score
    - `Citation` - Citation/source reference
    - `PromptTemplate` - Configurable prompt templates
    - `RAGMetrics` - Pipeline performance metrics
- [ ] **Task 4.4.2**: Implement `answer()` method:
  - Embed query
  - Retrieve relevant chunks
  - Build prompt with context
  - Generate response
  - Extract and format citations
- [ ] **Task 4.4.3**: Add streaming support for real-time responses
  - Implementation: `lib/src/rag/rag-service.ts` (`stream()` method)
  - Types: `lib/src/rag/types.ts` (`RAGStreamPhase`, `RAGStreamProgress`, `RAGStreamChunk`)
  - Export: `lib/src/rag/index.ts` (all new types exported)
  - Features:
    - Enhanced `stream()` method with real-time progress updates
    - Phase-based streaming: 'starting', 'embedding', 'retrieving', 'context', 'content', 'done', 'error'
    - `RAGStreamPhase` constant for type-safe phase handling
    - `RAGStreamProgress` type with message, elapsedMs, percentComplete
    - Retrieved chunks sent early in 'context' phase (before content generation)
    - Hebrew progress messages for user-friendly feedback
    - Error phase with structured error info (code, message)
    - `streamSimple()` method for simplified streaming (skips progress phases)
    - `LegacyRAGStreamChunk` type for backward compatibility (deprecated)
- [ ] **Task 4.4.4**: Implement response caching (optional)
  - Implementation: `lib/src/rag/response-cache.ts`
  - Types: `lib/src/rag/types.ts` (ResponseCacheConfig, ResponseCacheStats, CachedResponse)
  - Export: `lib/src/rag/index.ts` (re-exported from main `lib/src/index.ts`)
  - Features:
    - `ResponseCache` class with LRU eviction and TTL expiration
    - Cache key generation with configurable filter/topK inclusion
    - Integration with `RAGService.answer()` method (skips cache for conversational queries)
    - Cache management methods: `isCacheEnabled()`, `getResponseCacheStats()`, `clearResponseCache()`, `pruneResponseCache()`, `getCachedQueries()`, `getResponseCacheSize()`
    - Factory functions: `createResponseCache()`, `getGlobalResponseCache()`, `resetGlobalResponseCache()`
    - Cache update callback for monitoring/logging
    - Import/export for backup and persistence
  - Configuration:
    - `enableCache` in `RAGServiceConfig` to enable response caching
    - `cacheTtlMs` in `RAGServiceConfig` to set cache TTL (default: 5 minutes)
    - `ResponseCacheConfig` for detailed cache settings (maxSize, includeFiltersInKey, includeTopKInKey)
- [ ] **Task 4.4.5**: Add latency tracking and logging
  - Implementation: `lib/src/rag/latency-tracker.ts`
  - Updated: `lib/src/rag/rag-service.ts` (integrated latency tracking)
  - Updated: `lib/src/rag/types.ts` (added config options)
  - Updated: `lib/src/rag/index.ts` (exports)
  - Test file: `tests/rag/latency-tracker.test.ts`
  - Features:
    - `LatencyTracker` class for phase-based timing
    - RAGPhase constants (EMBEDDING, RETRIEVAL, GENERATION, PROMPT_BUILDING, CACHE_LOOKUP)
    - Configurable latency thresholds with warning/error logging
    - Logger integration with child logger for RAGService
    - Phase event logging (start/end of each phase, optional)
    - Summary logging on request completion
    - Utility functions: `formatLatencySummary()`, `calculatePhasePercentages()`, `checkLatencyThresholds()`, `aggregateLatencySummaries()`
    - Factory functions: `createLatencyTracker()`, `createLatencyTrackerWithThresholds()`
  - RAGService configuration options:
    - `enableLatencyLogging` - enable detailed latency tracking (default: true)
    - `logPhaseEvents` - log phase start/end events (default: false)
    - `logLatencySummary` - log summary on completion (default: true)
  - RAGServiceDependencies extensions:
    - `logger` - optional custom Logger instance
    - `latencyThresholds` - optional custom latency thresholds
- [ ] **Task 4.4.6**: Write end-to-end tests

---

# EPIC 5: API Development

**Goal**: Create serverless API endpoints for the frontend.

## Story 5.1: Chat Endpoint

**As a** user
**I want** to send questions via API
**So that** I receive AI-generated answers

### Tasks:

- [ ] **Task 5.1.1**: Create `api/chat.ts` endpoint:

  ```typescript
  POST /api/chat
  Request: { message: string, conversationHistory?: Message[] }
  Response: { answer: string, sources: Source[], metadata: Metadata }
  ```

  - Implementation: `api/chat.ts`
  - Features:
    - POST handler with Zod request validation
    - RAGService integration with lazy initialization
    - Response caching (5 min TTL)
    - Hebrew error messages for user-facing errors
    - CORS support
    - Comprehensive error handling (RAG errors, validation errors, generic errors)
    - Type exports: `ChatRequest`, `ChatResponse`, `Source`, `Metadata`

- [ ] **Task 5.1.2**: Implement request validation with Zod
  - Implementation: `api/chat.ts`
  - Features:
    - Comprehensive Zod schemas with detailed constraints and error messages
    - Validation constants (MAX_MESSAGE_LENGTH, MAX_CONVERSATION_HISTORY, etc.)
    - Structured `ValidationError` and `ValidationResult<T>` types
    - Hebrew error messages (`HEBREW_ERROR_MESSAGES` lookup table)
    - Utility functions: `transformZodErrors()`, `mapZodErrorToCode()`, `validateRequest()`
    - All error responses include `requestId` for tracking
    - Extended filter support (lawId, lawIds, topicId, topicIds, date range)
    - Date range validation refinement
    - Input sanitization (message trimming, whitespace validation)
    - Type exports: `ValidationError`, `ValidationResult`, `ErrorResponse`
- [ ] **Task 5.1.3**: Add streaming response support (SSE)
- [ ] **Task 5.1.4**: Handle errors gracefully (500, 429, etc.)
- [ ] **Task 5.1.5**: Add rate limiting (optional)
- [ ] **Task 5.1.6**: Write API tests

## Story 5.2: Search Endpoint

**As a** user
**I want** to search laws semantically
**So that** I can find relevant legislation

### Tasks:

- [ ] **Task 5.2.1**: Create `api/search.ts` endpoint:
  ```typescript
  POST /api/search
  Request: { query: string, limit?: number, filters?: Filters }
  Response: { results: SearchResult[], total: number }
  ```
- [ ] **Task 5.2.2**: Implement pagination
- [ ] **Task 5.2.3**: Add filter support (date, topic)
- [ ] **Task 5.2.4**: Return highlighted excerpts
- [ ] **Task 5.2.5**: Write search tests

## Story 5.3: Laws and Topics Endpoints

**As a** user
**I want** to browse laws by topic
**So that** I can explore the legal corpus

### Tasks:

- [ ] **Task 5.3.1**: Create `api/laws/index.ts` - List laws with pagination
- [ ] **Task 5.3.2**: Create `api/laws/[id].ts` - Get law details
- [ ] **Task 5.3.3**: Create `api/topics.ts` - List auto-generated topics
- [ ] **Task 5.3.4**: Add law count per topic
- [ ] **Task 5.3.5**: Include PDF URLs in responses
- [ ] **Task 5.3.6**: Write CRUD tests

---

# EPIC 6: Frontend Development

**Goal**: Build a responsive Hebrew-first chat interface.

## Story 6.1: Vue.js Project Setup

**As a** developer
**I want** a configured Vue 3 project
**So that** I can build the UI

### Tasks:

- [ ] **Task 6.1.1**: Initialize Vue 3 project with Vite
- [ ] **Task 6.1.2**: Configure TypeScript for Vue
- [ ] **Task 6.1.3**: Set up Vue Router
- [ ] **Task 6.1.4**: Configure Pinia store
- [ ] **Task 6.1.5**: Install and configure Tailwind CSS
- [ ] **Task 6.1.6**: Set up RTL support and Hebrew fonts (Rubik, Heebo)

## Story 6.2: Chat Interface Components

**As a** user
**I want** a chat interface
**So that** I can ask questions about Israeli law

### Tasks:

- [ ] **Task 6.2.1**: Create `ChatContainer.vue` - Main chat wrapper
- [ ] **Task 6.2.2**: Create `ChatMessage.vue` - Message display with RTL
- [ ] **Task 6.2.3**: Create `ChatInput.vue` - Input field with send button
- [ ] **Task 6.2.4**: Create `SourceCitation.vue` - Citation display with PDF links
- [ ] **Task 6.2.5**: Create `TypingIndicator.vue` - Loading state
- [ ] **Task 6.2.6**: Implement auto-scroll on new messages
- [ ] **Task 6.2.7**: Style for clean minimal theme

## Story 6.3: Chat State Management

**As a** developer
**I want** composables for chat logic
**So that** state is managed cleanly

### Tasks:

- [ ] **Task 6.3.1**: Create `useLawChat()` composable:
  - Message state management
  - Send message function
  - Loading and error states
  - localStorage persistence
  - Clear history function
- [ ] **Task 6.3.2**: Implement conversation context (last 3 exchanges)
- [ ] **Task 6.3.3**: Add optimistic UI updates
- [ ] **Task 6.3.4**: Handle API errors gracefully
- [ ] **Task 6.3.5**: Write composable tests

## Story 6.4: Law Browser Interface

**As a** user
**I want** to browse laws by topic
**So that** I can explore without searching

### Tasks:

- [ ] **Task 6.4.1**: Create `TopicSidebar.vue` - Topic navigation
- [ ] **Task 6.4.2**: Create `TopicItem.vue` - Individual topic with count
- [ ] **Task 6.4.3**: Create `LawGrid.vue` - Grid of law cards
- [ ] **Task 6.4.4**: Create `LawCard.vue` - Law summary card
- [ ] **Task 6.4.5**: Create `LawDetailView.vue` - Full law details
- [ ] **Task 6.4.6**: Add PDF viewer/link integration
- [ ] **Task 6.4.7**: Implement infinite scroll for law list

## Story 6.5: Search Interface

**As a** user
**I want** to search for laws
**So that** I can find specific legislation

### Tasks:

- [ ] **Task 6.5.1**: Create `SearchBar.vue` - Global search input
- [ ] **Task 6.5.2**: Create `SearchFilters.vue` - Date and topic filters
- [ ] **Task 6.5.3**: Create `SearchResults.vue` - Results display
- [ ] **Task 6.5.4**: Create `SearchResultItem.vue` - Individual result
- [ ] **Task 6.5.5**: Implement search debouncing (300ms)
- [ ] **Task 6.5.6**: Add search history (localStorage)
- [ ] **Task 6.5.7**: Highlight matching terms in results

## Story 6.6: Responsive Design

**As a** user
**I want** the app to work on mobile
**So that** I can use it anywhere

### Tasks:

- [ ] **Task 6.6.1**: Design mobile-first layouts
- [ ] **Task 6.6.2**: Create responsive breakpoints
- [ ] **Task 6.6.3**: Implement collapsible sidebar on mobile
- [ ] **Task 6.6.4**: Test on various screen sizes
- [ ] **Task 6.6.5**: Optimize touch interactions

---

# EPIC 7: Topic Generation & Indexing

**Goal**: Auto-generate browsable topic categories from law content.

## Story 7.1: Topic Clustering

**As a** developer
**I want** to cluster laws into topics
**So that** users can browse by category

### Tasks:

- [ ] **Task 7.1.1**: Create `scripts/cluster-topics.ts`:
  - Load law embeddings from Qdrant
  - Apply K-means or HDBSCAN clustering
  - Identify optimal number of clusters
- [ ] **Task 7.1.2**: Generate topic names using LLM:
  - Sample representative laws per cluster
  - Generate Hebrew topic name
  - Generate keywords
- [ ] **Task 7.1.3**: Store topics in PostgreSQL
- [ ] **Task 7.1.4**: Create law-topic mappings with relevance scores
- [ ] **Task 7.1.5**: Re-run clustering periodically (if data changes)

## Story 7.2: Topic API Integration

**As a** developer
**I want** topics served via API
**So that** the frontend can display them

### Tasks:

- [ ] **Task 7.2.1**: Create topic retrieval functions
- [ ] **Task 7.2.2**: Add topic-based law filtering
- [ ] **Task 7.2.3**: Include topic metadata in search results
- [ ] **Task 7.2.4**: Cache topic list for performance

---

# EPIC 8: Testing & Quality Assurance

**Goal**: Ensure system reliability and correctness.

## Story 8.1: Unit Testing

**As a** developer
**I want** unit tests for all modules
**So that** code changes don't break functionality

### Tasks:

- [ ] **Task 8.1.1**: Set up Vitest for unit testing
- [ ] **Task 8.1.2**: Write tests for chunking utilities
- [ ] **Task 8.1.3**: Write tests for Hebrew text cleanup
- [ ] **Task 8.1.4**: Write tests for LLM adapters (mocked)
- [ ] **Task 8.1.5**: Write tests for prompt builder
- [ ] **Task 8.1.6**: Achieve >80% code coverage

## Story 8.2: Integration Testing

**As a** developer
**I want** integration tests
**So that** components work together correctly

### Tasks:

- [ ] **Task 8.2.1**: Write RAG pipeline integration tests
- [ ] **Task 8.2.2**: Write API endpoint tests
- [ ] **Task 8.2.3**: Write database operation tests
- [ ] **Task 8.2.4**: Test with real Hebrew queries
- [ ] **Task 8.2.5**: Test citation accuracy

## Story 8.3: End-to-End Testing

**As a** developer
**I want** E2E tests
**So that** user flows work correctly

### Tasks:

- [ ] **Task 8.3.1**: Set up Playwright for E2E testing
- [ ] **Task 8.3.2**: Write chat flow tests:
  - Send message and receive response
  - Check for source citations
  - Verify history persistence
- [ ] **Task 8.3.3**: Write search flow tests
- [ ] **Task 8.3.4**: Write topic browsing tests
- [ ] **Task 8.3.5**: Test RTL rendering

## Story 8.4: Quality Metrics

**As a** developer
**I want** RAG quality metrics
**So that** I can improve the system

### Tasks:

- [ ] **Task 8.4.1**: Implement retrieval evaluation:
  - Recall@k measurement
  - Precision measurement
- [ ] **Task 8.4.2**: Create test query set (20+ Hebrew questions)
- [ ] **Task 8.4.3**: Track response latency
- [ ] **Task 8.4.4**: Monitor LLM token usage
- [ ] **Task 8.4.5**: Set up basic analytics

---

# EPIC 9: Deployment & Operations

**Goal**: Deploy to production with monitoring.

## Story 9.1: Production Deployment

**As a** developer
**I want** the app deployed
**So that** users can access it

### Tasks:

- [ ] **Task 9.1.1**: Configure production environment variables
- [ ] **Task 9.1.2**: Run full PDF processing pipeline
- [ ] **Task 9.1.3**: Verify Qdrant data population
- [ ] **Task 9.1.4**: Deploy frontend to Vercel
- [ ] **Task 9.1.5**: Deploy API functions to Vercel
- [ ] **Task 9.1.6**: Verify production endpoints

## Story 9.2: Monitoring & Logging

**As a** developer
**I want** monitoring
**So that** I can track system health

### Tasks:

- [ ] **Task 9.2.1**: Set up Vercel Analytics (free tier)
- [ ] **Task 9.2.2**: Add structured logging
- [ ] **Task 9.2.3**: Monitor API latency
- [ ] **Task 9.2.4**: Track LLM API costs
- [ ] **Task 9.2.5**: Set up error alerting (optional)

## Story 9.3: Documentation

**As a** developer
**I want** project documentation
**So that** the project is maintainable

### Tasks:

- [ ] **Task 9.3.1**: Write README with setup instructions
- [ ] **Task 9.3.2**: Document API endpoints
- [ ] **Task 9.3.3**: Create architecture diagrams
- [ ] **Task 9.3.4**: Document LLM switching process
- [ ] **Task 9.3.5**: Write troubleshooting guide

---

# Risk Mitigation

| Risk                   | Mitigation Strategy                                 |
| ---------------------- | --------------------------------------------------- |
| PDF parsing failures   | Implement fallback chain (pdf-parse → pdf.js → OCR) |
| Hebrew text reversed   | Build robust RTL detection and correction           |
| LLM hallucinations     | Low temperature (0.3), strict citation prompts      |
| Vercel timeout (10s)   | Stream responses, optimize retrieval to <3s         |
| Embedding model slow   | Use quantized model, cache frequent queries         |
| Qdrant free tier limit | Monitor usage, have migration plan                  |

---

# Technology Stack Summary

## Core Dependencies

```json
{
  "dependencies": {
    "vue": "^3.4.21",
    "vue-router": "^4.3.0",
    "pinia": "^2.1.7",
    "@anthropic-ai/sdk": "^0.20.6",
    "@xenova/transformers": "^2.17.1",
    "@qdrant/js-client-rest": "^1.8.2",
    "pdf-parse": "^1.1.1",
    "pg": "^8.11.3",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "typescript": "^5.4.2",
    "vite": "^5.1.6",
    "tailwindcss": "^3.4.1",
    "vitest": "^1.3.0",
    "@playwright/test": "^1.42.0"
  }
}
```

---

# Implementation Phases

## Phase 1: Foundation (EPIC 1-2)

- Project setup
- Cloud services configuration
- LLM adapter implementation

## Phase 2: Data Pipeline (EPIC 3)

- PDF processing
- Chunking and embedding
- Qdrant population

## Phase 3: RAG Core (EPIC 4-5)

- Retrieval service
- Generation pipeline
- API endpoints

## Phase 4: Frontend (EPIC 6)

- Chat interface
- Law browser
- Search functionality

## Phase 5: Polish (EPIC 7-9)

- Topic generation
- Testing
- Deployment

---

# Critical Files Reference

| File                  | Purpose                         |
| --------------------- | ------------------------------- |
| `/skraper/downloads/` | Source PDFs (~3,900 files, 1GB) |
| `/skraper/src/db.ts`  | Existing database interface     |
| `/skraper/init.sql`   | Base PostgreSQL schema          |
| `/skraper/CLAUDE.md`  | Data structure documentation    |

---

_Generated: January 2025_
_Project: Israeli Law RAG Chatbot Demonstration_
