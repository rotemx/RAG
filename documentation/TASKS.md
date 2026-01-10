# Israeli Law RAG Chatbot - Project Plan

## Project Overview

**Goal**: Build a production-ready RAG (Retrieval-Augmented Generation) system for Israeli law documents. The system enables users to ask questions about Israeli law in Hebrew and receive accurate answers with source citations.

**Demonstration Objectives**:
- Prove technical capability in RAG planning and deployment
- Showcase domain-specific information retrieval
- Demonstrate modular LLM architecture for easy provider switching

---

## Technical Decisions Summary

| Category | Decision | Rationale |
|----------|----------|-----------|
| **LLM Provider** | Anthropic Claude API (modular) | Excellent Hebrew support, easy to switch providers |
| **Hosting** | Vercel | Free tier, serverless functions, easy deployment |
| **Vector Database** | Qdrant Cloud | Free tier (1GB), excellent filtering, TypeScript SDK |
| **Embeddings** | multilingual-e5-large | Strong Hebrew support, 1024 dimensions |
| **PDF Parsing** | pdf-parse + cleanup | Fast, lightweight, good for text-heavy legal docs |
| **Frontend** | Vue.js 3 + TypeScript | Modern composition API, great TypeScript support |
| **UI Style** | Clean minimal + RTL | Professional, Hebrew-optimized |
| **Auth** | None (demo mode) | Simplified for demonstration |
| **History** | localStorage | No server storage needed |
| **Law Index** | Auto-generated topics | LLM/embedding clustering |
| **Budget** | $10-30/month | Qdrant free + Vercel free + Claude API usage |

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

# EPIC 1: Project Infrastructure Setup

**Goal**: Establish the foundational project structure, tooling, and cloud services.

## Story 1.1: Initialize Monorepo Structure
**As a** developer
**I want** a well-organized project structure
**So that** code is maintainable and scalable

### Tasks:
- [R:2] **Task 1.1.1**: Create project directory structure
  ```
  /israeli-law-rag/
  ├── frontend/           # Vue.js 3 application
  ├── api/                # Vercel serverless functions
  ├── lib/                # Shared backend logic
  ├── scripts/            # Data processing scripts
  ├── tests/              # Test suites
  └── documentation/      # Project documentation
  ```
- [C:1] **Task 1.1.2**: Initialize root `package.json` with workspaces
- [C:3] **Task 1.1.3**: Configure TypeScript (`tsconfig.json`) with strict mode
- [C:4] **Task 1.1.4**: Set up ESLint and Prettier for code quality
- [C:1] **Task 1.1.5**: Create `.gitignore` with appropriate exclusions
- [ ] **Task 1.1.6**: Initialize Git repository with conventional commits

## Story 1.2: Configure Vercel Deployment
**As a** developer
**I want** automated deployments to Vercel
**So that** changes are deployed seamlessly

### Tasks:
- [ ] **Task 1.2.1**: Create Vercel account and project
- [ ] **Task 1.2.2**: Configure `vercel.json` with:
  - Build commands
  - Output directory
  - Function configurations (30s timeout, 1024MB memory)
  - Environment variable mappings
- [ ] **Task 1.2.3**: Set up environment variables in Vercel:
  - `ANTHROPIC_API_KEY`
  - `QDRANT_URL`
  - `QDRANT_API_KEY`
  - `DATABASE_URL`
- [ ] **Task 1.2.4**: Configure preview deployments for PRs
- [ ] **Task 1.2.5**: Set up custom domain (optional)

## Story 1.3: Set Up Qdrant Cloud
**As a** developer
**I want** a vector database for semantic search
**So that** users can find relevant legal content

### Tasks:
- [ ] **Task 1.3.1**: Create Qdrant Cloud account (free tier)
- [ ] **Task 1.3.2**: Create cluster with appropriate settings
- [ ] **Task 1.3.3**: Create `israeli_laws` collection with:
  - Vector size: 1024 (e5-large dimensions)
  - Distance metric: Cosine
  - On-disk payload storage
- [ ] **Task 1.3.4**: Create payload indexes for filtering:
  - `lawId` (keyword)
  - `publicationDate` (integer)
  - `topicId` (keyword)
- [ ] **Task 1.3.5**: Document connection credentials securely

## Story 1.4: Extend PostgreSQL Schema
**As a** developer
**I want** additional database tables
**So that** I can store chunks and topics

### Tasks:
- [ ] **Task 1.4.1**: Create `law_chunks` table for processed text chunks
- [ ] **Task 1.4.2**: Create `topics` table for auto-generated categories
- [ ] **Task 1.4.3**: Create `law_topics` junction table (many-to-many)
- [ ] **Task 1.4.4**: Add full-text search indexes using GIN
- [ ] **Task 1.4.5**: Create `query_logs` table for analytics (optional)
- [ ] **Task 1.4.6**: Write migration scripts

---

# EPIC 2: LLM Integration Layer

**Goal**: Build a modular LLM adapter system for easy provider switching.

## Story 2.1: Create LLM Adapter Interface
**As a** developer
**I want** an abstract LLM interface
**So that** I can switch providers without code changes

### Tasks:
- [ ] **Task 2.1.1**: Define TypeScript interfaces:
  ```typescript
  interface LLMConfig {
    provider: 'anthropic' | 'openai' | 'gemini';
    model: string;
    maxTokens: number;
    temperature: number;
  }

  interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
  }

  interface LLMResponse {
    content: string;
    usage: { inputTokens: number; outputTokens: number };
    model: string;
  }
  ```
- [ ] **Task 2.1.2**: Create abstract `LLMAdapter` base class
- [ ] **Task 2.1.3**: Implement factory function `createLLMAdapter()`
- [ ] **Task 2.1.4**: Add configuration validation with Zod

## Story 2.2: Implement Anthropic Adapter
**As a** developer
**I want** Claude API integration
**So that** I can generate Hebrew legal responses

### Tasks:
- [ ] **Task 2.2.1**: Install `@anthropic-ai/sdk`
- [ ] **Task 2.2.2**: Implement `AnthropicAdapter` class:
  - `complete()` method for single responses
  - `stream()` method for streaming responses
- [ ] **Task 2.2.3**: Handle rate limiting and retries
- [ ] **Task 2.2.4**: Implement error handling with specific error types
- [ ] **Task 2.2.5**: Add token usage tracking
- [ ] **Task 2.2.6**: Write unit tests for adapter

## Story 2.3: Implement Additional Adapters (Future-Ready)
**As a** developer
**I want** placeholder adapters
**So that** switching is straightforward later

### Tasks:
- [ ] **Task 2.3.1**: Create `OpenAIAdapter` stub
- [ ] **Task 2.3.2**: Create `GeminiAdapter` stub
- [ ] **Task 2.3.3**: Document provider-specific considerations
- [ ] **Task 2.3.4**: Create comparison matrix for Hebrew performance

---

# EPIC 3: Data Processing Pipeline

**Goal**: Process ~3,900 Hebrew law PDFs into vector embeddings.

## Story 3.1: PDF Text Extraction
**As a** developer
**I want** to extract text from PDF files
**So that** content can be processed for RAG

### Tasks:
- [ ] **Task 3.1.1**: Install `pdf-parse` library
- [ ] **Task 3.1.2**: Create `extractPdfText()` function
- [ ] **Task 3.1.3**: Implement Hebrew text cleanup utilities:
  - Remove PDF artifacts and control characters
  - Fix reversed text (common in Hebrew PDF extraction)
  - Normalize whitespace and punctuation
  - Remove page numbers and headers
- [ ] **Task 3.1.4**: Handle extraction failures gracefully
- [ ] **Task 3.1.5**: Create fallback chain (pdf-parse → pdf.js → OCR)
- [ ] **Task 3.1.6**: Write tests with sample PDFs

## Story 3.2: Semantic Chunking
**As a** developer
**I want** to split documents into meaningful chunks
**So that** retrieval is accurate and contextual

### Tasks:
- [ ] **Task 3.2.1**: Design chunking strategy for legal documents:
  - Split by section markers (סעיף, פרק, חלק)
  - Respect maximum chunk size (512 tokens for e5-large)
  - Add 10-20% overlap between chunks
  - Preserve metadata (section titles, positions)
- [ ] **Task 3.2.2**: Implement `chunkLegalDocument()` function
- [ ] **Task 3.2.3**: Create chunk ID generation (deterministic)
- [ ] **Task 3.2.4**: Implement token counting utility
- [ ] **Task 3.2.5**: Handle edge cases (very short/long documents)
- [ ] **Task 3.2.6**: Write chunking tests

## Story 3.3: Embedding Generation
**As a** developer
**I want** to generate vector embeddings
**So that** semantic search is possible

### Tasks:
- [ ] **Task 3.3.1**: Install `@xenova/transformers`
- [ ] **Task 3.3.2**: Create `E5Embedder` class:
  - Initialize multilingual-e5-large model
  - Use quantized version for speed
  - Implement `embedQuery()` with "query: " prefix
  - Implement `embedDocument()` with "passage: " prefix
  - Implement `embedBatch()` for bulk processing
- [ ] **Task 3.3.3**: Add embedding caching for repeated queries
- [ ] **Task 3.3.4**: Create embedding dimension validation
- [ ] **Task 3.3.5**: Write embedding tests

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
- [ ] **Task 3.4.3**: Implement checkpoint/resume capability
- [ ] **Task 3.4.4**: Add dry-run mode for testing
- [ ] **Task 3.4.5**: Create processing statistics report
- [ ] **Task 3.4.6**: Handle ~3,900 PDFs (~1GB) efficiently

---

# EPIC 4: RAG Pipeline Implementation

**Goal**: Build the core retrieval and generation pipeline.

## Story 4.1: Vector Search Service
**As a** developer
**I want** to query the vector database
**So that** relevant chunks are retrieved

### Tasks:
- [ ] **Task 4.1.1**: Install `@qdrant/js-client-rest`
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

## Story 4.4: RAG Service Integration
**As a** developer
**I want** an end-to-end RAG pipeline
**So that** questions get answered with sources

### Tasks:
- [ ] **Task 4.4.1**: Create `RAGService` class combining:
  - Embedding service
  - Retrieval service
  - LLM adapter
  - Prompt builder
- [ ] **Task 4.4.2**: Implement `answer()` method:
  - Embed query
  - Retrieve relevant chunks
  - Build prompt with context
  - Generate response
  - Extract and format citations
- [ ] **Task 4.4.3**: Add streaming support for real-time responses
- [ ] **Task 4.4.4**: Implement response caching (optional)
- [ ] **Task 4.4.5**: Add latency tracking and logging
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
- [ ] **Task 5.1.2**: Implement request validation with Zod
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

| Risk | Mitigation Strategy |
|------|---------------------|
| PDF parsing failures | Implement fallback chain (pdf-parse → pdf.js → OCR) |
| Hebrew text reversed | Build robust RTL detection and correction |
| LLM hallucinations | Low temperature (0.3), strict citation prompts |
| Vercel timeout (10s) | Stream responses, optimize retrieval to <3s |
| Embedding model slow | Use quantized model, cache frequent queries |
| Qdrant free tier limit | Monitor usage, have migration plan |

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

| File | Purpose |
|------|---------|
| `/skraper/downloads/` | Source PDFs (~3,900 files, 1GB) |
| `/skraper/src/db.ts` | Existing database interface |
| `/skraper/init.sql` | Base PostgreSQL schema |
| `/skraper/CLAUDE.md` | Data structure documentation |

---

*Generated: January 2025*
*Project: Israeli Law RAG Chatbot Demonstration*
