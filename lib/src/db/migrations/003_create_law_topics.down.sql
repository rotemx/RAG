-- Rollback Migration: Drop law_topics junction table
-- Description: Removes the law_topics table and all related objects
-- Part of Task 1.4.6

-- Drop triggers first
DROP TRIGGER IF EXISTS trigger_law_topics_count ON law_topics;
DROP TRIGGER IF EXISTS trigger_law_topics_updated_at ON law_topics;

-- Drop trigger functions
DROP FUNCTION IF EXISTS update_topic_law_count();
DROP FUNCTION IF EXISTS update_law_topics_updated_at();

-- Drop indexes
DROP INDEX IF EXISTS idx_law_topics_unreviewed;
DROP INDEX IF EXISTS idx_law_topics_rank;
DROP INDEX IF EXISTS idx_law_topics_primary;
DROP INDEX IF EXISTS idx_law_topics_relevance;
DROP INDEX IF EXISTS idx_law_topics_law_topic;
DROP INDEX IF EXISTS idx_law_topics_topic_id;
DROP INDEX IF EXISTS idx_law_topics_law_id;

-- Drop the table
DROP TABLE IF EXISTS law_topics;
