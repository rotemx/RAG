-- Rollback Migration: Drop query_logs table and analytics functions
-- Description: Removes the query_logs table, enums, and analytics functions
-- Part of Task 1.4.6

-- Drop analytics functions first
DROP FUNCTION IF EXISTS get_provider_stats(TIMESTAMP, TIMESTAMP);
DROP FUNCTION IF EXISTS get_top_queries(INTEGER, TIMESTAMP, TIMESTAMP);
DROP FUNCTION IF EXISTS get_hourly_query_counts(TIMESTAMP, TIMESTAMP);
DROP FUNCTION IF EXISTS get_query_stats(TIMESTAMP, TIMESTAMP);

-- Drop trigger
DROP TRIGGER IF EXISTS trigger_query_logs_updated_at ON query_logs;

-- Drop trigger function
DROP FUNCTION IF EXISTS update_query_logs_updated_at();

-- Drop indexes
DROP INDEX IF EXISTS idx_query_logs_query_fts;
DROP INDEX IF EXISTS idx_query_logs_matched_topics;
DROP INDEX IF EXISTS idx_query_logs_tags;
DROP INDEX IF EXISTS idx_query_logs_user_rating;
DROP INDEX IF EXISTS idx_query_logs_total_latency;
DROP INDEX IF EXISTS idx_query_logs_llm_provider;
DROP INDEX IF EXISTS idx_query_logs_created_at;
DROP INDEX IF EXISTS idx_query_logs_created_at_brin;
DROP INDEX IF EXISTS idx_query_logs_source;
DROP INDEX IF EXISTS idx_query_logs_status;
DROP INDEX IF EXISTS idx_query_logs_session_id;
DROP INDEX IF EXISTS idx_query_logs_query_id;

-- Drop the table
DROP TABLE IF EXISTS query_logs;

-- Drop enum types
DROP TYPE IF EXISTS query_source;
DROP TYPE IF EXISTS query_status;
