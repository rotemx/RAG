-- Migration: Create query_logs table for analytics
-- Description: Stores query logs for analytics, monitoring, and system improvement
-- Part of Task 1.4.5
--
-- This table tracks all user queries to the RAG system, enabling:
-- - Usage analytics and reporting
-- - Query pattern analysis for system improvement
-- - Response quality monitoring
-- - Latency tracking and performance optimization
-- - Token usage tracking for cost management

-- Create enum type for query status
DO $$ BEGIN
    CREATE TYPE query_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'timeout');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Create enum type for query source
DO $$ BEGIN
    CREATE TYPE query_source AS ENUM ('chat', 'search', 'api', 'internal', 'test');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Create table for storing query logs
CREATE TABLE IF NOT EXISTS query_logs (
    -- Primary identifier
    id SERIAL PRIMARY KEY,

    -- Unique query identifier (UUID for external reference)
    query_id VARCHAR(36) UNIQUE NOT NULL DEFAULT gen_random_uuid()::VARCHAR(36),

    -- Session tracking (optional, for grouping related queries)
    session_id VARCHAR(100),

    -- The original user query text
    query_text TEXT NOT NULL,

    -- Normalized/processed query (after preprocessing)
    normalized_query TEXT,

    -- Query language (detected or specified)
    query_language VARCHAR(10) DEFAULT 'he',

    -- Query source/origin
    source query_source DEFAULT 'chat',

    -- Query status
    status query_status DEFAULT 'pending',

    -- Error message if query failed
    error_message TEXT,

    -- ============================================================================
    -- Retrieval Metrics
    -- ============================================================================

    -- Number of chunks retrieved from vector search
    chunks_retrieved INTEGER DEFAULT 0,

    -- Number of chunks actually used in context
    chunks_used INTEGER DEFAULT 0,

    -- Vector search scores (JSON array of top scores)
    vector_scores JSONB,

    -- FTS search was used in hybrid retrieval
    used_fts BOOLEAN DEFAULT FALSE,

    -- Filters applied to the search (JSON object)
    search_filters JSONB,

    -- Topics IDs that matched the query
    matched_topic_ids INTEGER[],

    -- Law IDs that were retrieved
    retrieved_law_ids INTEGER[],

    -- ============================================================================
    -- LLM Metrics
    -- ============================================================================

    -- LLM provider used
    llm_provider VARCHAR(50),

    -- LLM model used
    llm_model VARCHAR(100),

    -- Input tokens consumed
    input_tokens INTEGER,

    -- Output tokens generated
    output_tokens INTEGER,

    -- Total tokens (input + output)
    total_tokens INTEGER GENERATED ALWAYS AS (COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) STORED,

    -- Estimated cost in USD (based on provider pricing)
    estimated_cost_usd DECIMAL(10, 6),

    -- Temperature used for generation
    temperature DECIMAL(3, 2),

    -- Max tokens setting
    max_tokens INTEGER,

    -- ============================================================================
    -- Response Metrics
    -- ============================================================================

    -- Generated response text (truncated for storage efficiency)
    response_text TEXT,

    -- Response character count
    response_char_count INTEGER,

    -- Number of citations/sources included in response
    citation_count INTEGER DEFAULT 0,

    -- Response was streamed
    was_streamed BOOLEAN DEFAULT FALSE,

    -- ============================================================================
    -- Performance Metrics (in milliseconds)
    -- ============================================================================

    -- Time to embed the query
    embedding_latency_ms INTEGER,

    -- Time for vector search
    retrieval_latency_ms INTEGER,

    -- Time for LLM generation
    generation_latency_ms INTEGER,

    -- Total end-to-end latency
    total_latency_ms INTEGER,

    -- ============================================================================
    -- User Feedback (optional, for quality tracking)
    -- ============================================================================

    -- User rating (1-5 stars)
    user_rating SMALLINT CHECK (user_rating IS NULL OR (user_rating >= 1 AND user_rating <= 5)),

    -- User feedback text
    user_feedback TEXT,

    -- Feedback timestamp
    feedback_at TIMESTAMP,

    -- ============================================================================
    -- Metadata
    -- ============================================================================

    -- Client information (user agent, platform, etc.)
    client_info JSONB,

    -- IP address (hashed for privacy)
    ip_hash VARCHAR(64),

    -- Request headers of interest (sanitized)
    request_metadata JSONB,

    -- Custom tags for categorization
    tags VARCHAR(50)[],

    -- ============================================================================
    -- Timestamps
    -- ============================================================================

    -- When the query was received
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- When processing started
    started_at TIMESTAMP,

    -- When processing completed
    completed_at TIMESTAMP,

    -- Last update timestamp
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Indexes for Efficient Querying
-- ============================================================================

-- Index on query_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_query_logs_query_id ON query_logs(query_id);

-- Index on session_id for session-based queries
CREATE INDEX IF NOT EXISTS idx_query_logs_session_id ON query_logs(session_id)
    WHERE session_id IS NOT NULL;

-- Index on status for monitoring pending/failed queries
CREATE INDEX IF NOT EXISTS idx_query_logs_status ON query_logs(status);

-- Index on source for filtering by query origin
CREATE INDEX IF NOT EXISTS idx_query_logs_source ON query_logs(source);

-- Index on created_at for time-based analytics (BRIN for time-series data)
CREATE INDEX IF NOT EXISTS idx_query_logs_created_at_brin ON query_logs
    USING brin(created_at);

-- Index on created_at (B-tree) for recent queries
CREATE INDEX IF NOT EXISTS idx_query_logs_created_at ON query_logs(created_at DESC);

-- Index on llm_provider for provider-specific analytics
CREATE INDEX IF NOT EXISTS idx_query_logs_llm_provider ON query_logs(llm_provider)
    WHERE llm_provider IS NOT NULL;

-- Index on total_latency_ms for performance monitoring
CREATE INDEX IF NOT EXISTS idx_query_logs_total_latency ON query_logs(total_latency_ms)
    WHERE total_latency_ms IS NOT NULL;

-- Index on user_rating for feedback analysis
CREATE INDEX IF NOT EXISTS idx_query_logs_user_rating ON query_logs(user_rating)
    WHERE user_rating IS NOT NULL;

-- GIN index on tags for tag-based filtering
CREATE INDEX IF NOT EXISTS idx_query_logs_tags ON query_logs USING gin(tags)
    WHERE tags IS NOT NULL;

-- GIN index on matched_topic_ids for topic analysis
CREATE INDEX IF NOT EXISTS idx_query_logs_matched_topics ON query_logs USING gin(matched_topic_ids)
    WHERE matched_topic_ids IS NOT NULL;

-- Full-text search index on query_text for query pattern analysis
CREATE INDEX IF NOT EXISTS idx_query_logs_query_fts
    ON query_logs USING gin(to_tsvector('simple', query_text));

-- ============================================================================
-- Trigger to Update updated_at Timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_query_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_query_logs_updated_at ON query_logs;
CREATE TRIGGER trigger_query_logs_updated_at
    BEFORE UPDATE ON query_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_query_logs_updated_at();

-- ============================================================================
-- Helper Functions for Analytics
-- ============================================================================

-- Function to get query statistics for a time period
CREATE OR REPLACE FUNCTION get_query_stats(
    start_date TIMESTAMP DEFAULT (CURRENT_TIMESTAMP - INTERVAL '7 days'),
    end_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
RETURNS TABLE (
    total_queries BIGINT,
    completed_queries BIGINT,
    failed_queries BIGINT,
    avg_latency_ms NUMERIC,
    p50_latency_ms NUMERIC,
    p95_latency_ms NUMERIC,
    p99_latency_ms NUMERIC,
    total_input_tokens BIGINT,
    total_output_tokens BIGINT,
    total_estimated_cost NUMERIC,
    avg_chunks_retrieved NUMERIC,
    avg_user_rating NUMERIC,
    queries_with_feedback BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT as total_queries,
        COUNT(*) FILTER (WHERE ql.status = 'completed')::BIGINT as completed_queries,
        COUNT(*) FILTER (WHERE ql.status = 'failed')::BIGINT as failed_queries,
        AVG(ql.total_latency_ms)::NUMERIC as avg_latency_ms,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ql.total_latency_ms)::NUMERIC as p50_latency_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ql.total_latency_ms)::NUMERIC as p95_latency_ms,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ql.total_latency_ms)::NUMERIC as p99_latency_ms,
        COALESCE(SUM(ql.input_tokens), 0)::BIGINT as total_input_tokens,
        COALESCE(SUM(ql.output_tokens), 0)::BIGINT as total_output_tokens,
        COALESCE(SUM(ql.estimated_cost_usd), 0)::NUMERIC as total_estimated_cost,
        AVG(ql.chunks_retrieved)::NUMERIC as avg_chunks_retrieved,
        AVG(ql.user_rating)::NUMERIC as avg_user_rating,
        COUNT(*) FILTER (WHERE ql.user_rating IS NOT NULL)::BIGINT as queries_with_feedback
    FROM query_logs ql
    WHERE ql.created_at >= start_date AND ql.created_at < end_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get hourly query counts for a time period
CREATE OR REPLACE FUNCTION get_hourly_query_counts(
    start_date TIMESTAMP DEFAULT (CURRENT_TIMESTAMP - INTERVAL '24 hours'),
    end_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
RETURNS TABLE (
    hour TIMESTAMP,
    query_count BIGINT,
    avg_latency_ms NUMERIC,
    error_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        date_trunc('hour', ql.created_at) as hour,
        COUNT(*)::BIGINT as query_count,
        AVG(ql.total_latency_ms)::NUMERIC as avg_latency_ms,
        COUNT(*) FILTER (WHERE ql.status = 'failed')::BIGINT as error_count
    FROM query_logs ql
    WHERE ql.created_at >= start_date AND ql.created_at < end_date
    GROUP BY date_trunc('hour', ql.created_at)
    ORDER BY hour;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get top queries by frequency
CREATE OR REPLACE FUNCTION get_top_queries(
    result_limit INTEGER DEFAULT 20,
    start_date TIMESTAMP DEFAULT (CURRENT_TIMESTAMP - INTERVAL '30 days'),
    end_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
RETURNS TABLE (
    normalized_query TEXT,
    query_count BIGINT,
    avg_latency_ms NUMERIC,
    avg_rating NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(ql.normalized_query, ql.query_text) as normalized_query,
        COUNT(*)::BIGINT as query_count,
        AVG(ql.total_latency_ms)::NUMERIC as avg_latency_ms,
        AVG(ql.user_rating)::NUMERIC as avg_rating
    FROM query_logs ql
    WHERE ql.created_at >= start_date AND ql.created_at < end_date
    GROUP BY COALESCE(ql.normalized_query, ql.query_text)
    ORDER BY query_count DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get provider usage statistics
CREATE OR REPLACE FUNCTION get_provider_stats(
    start_date TIMESTAMP DEFAULT (CURRENT_TIMESTAMP - INTERVAL '30 days'),
    end_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
RETURNS TABLE (
    llm_provider VARCHAR(50),
    llm_model VARCHAR(100),
    query_count BIGINT,
    total_tokens BIGINT,
    total_cost NUMERIC,
    avg_latency_ms NUMERIC,
    error_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ql.llm_provider,
        ql.llm_model,
        COUNT(*)::BIGINT as query_count,
        COALESCE(SUM(ql.input_tokens + ql.output_tokens), 0)::BIGINT as total_tokens,
        COALESCE(SUM(ql.estimated_cost_usd), 0)::NUMERIC as total_cost,
        AVG(ql.generation_latency_ms)::NUMERIC as avg_latency_ms,
        (COUNT(*) FILTER (WHERE ql.status = 'failed')::NUMERIC / NULLIF(COUNT(*), 0) * 100)::NUMERIC as error_rate
    FROM query_logs ql
    WHERE ql.created_at >= start_date
      AND ql.created_at < end_date
      AND ql.llm_provider IS NOT NULL
    GROUP BY ql.llm_provider, ql.llm_model
    ORDER BY query_count DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE query_logs IS 'Stores query logs for analytics, monitoring, and system improvement';
COMMENT ON COLUMN query_logs.query_id IS 'Unique UUID for external reference and API responses';
COMMENT ON COLUMN query_logs.session_id IS 'Optional session ID for grouping related queries';
COMMENT ON COLUMN query_logs.query_text IS 'Original user query text';
COMMENT ON COLUMN query_logs.normalized_query IS 'Preprocessed/normalized query for deduplication';
COMMENT ON COLUMN query_logs.source IS 'Origin of the query: chat, search, api, internal, test';
COMMENT ON COLUMN query_logs.status IS 'Query processing status';
COMMENT ON COLUMN query_logs.chunks_retrieved IS 'Number of chunks retrieved from vector search';
COMMENT ON COLUMN query_logs.chunks_used IS 'Number of chunks actually used in LLM context';
COMMENT ON COLUMN query_logs.vector_scores IS 'JSON array of top vector similarity scores';
COMMENT ON COLUMN query_logs.input_tokens IS 'Input tokens consumed by LLM';
COMMENT ON COLUMN query_logs.output_tokens IS 'Output tokens generated by LLM';
COMMENT ON COLUMN query_logs.total_tokens IS 'Generated column: input_tokens + output_tokens';
COMMENT ON COLUMN query_logs.estimated_cost_usd IS 'Estimated cost in USD based on provider pricing';
COMMENT ON COLUMN query_logs.total_latency_ms IS 'Total end-to-end latency in milliseconds';
COMMENT ON COLUMN query_logs.user_rating IS 'User rating 1-5 stars';
COMMENT ON COLUMN query_logs.ip_hash IS 'SHA-256 hash of client IP for privacy';
COMMENT ON COLUMN query_logs.tags IS 'Custom tags for categorization and filtering';

COMMENT ON FUNCTION get_query_stats IS 'Get aggregate query statistics for a time period';
COMMENT ON FUNCTION get_hourly_query_counts IS 'Get hourly query counts for monitoring dashboards';
COMMENT ON FUNCTION get_top_queries IS 'Get most frequent queries for analysis';
COMMENT ON FUNCTION get_provider_stats IS 'Get LLM provider usage statistics';
