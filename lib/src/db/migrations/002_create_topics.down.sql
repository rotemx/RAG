-- Rollback Migration: Drop topics table
-- Description: Removes the topics table and all related objects
-- Part of Task 1.4.6

-- Drop trigger first
DROP TRIGGER IF EXISTS trigger_topics_updated_at ON topics;

-- Drop trigger function
DROP FUNCTION IF EXISTS update_topics_updated_at();

-- Drop indexes
DROP INDEX IF EXISTS idx_topics_representative_laws;
DROP INDEX IF EXISTS idx_topics_keywords_he;
DROP INDEX IF EXISTS idx_topics_law_count;
DROP INDEX IF EXISTS idx_topics_display_order;
DROP INDEX IF EXISTS idx_topics_parent;
DROP INDEX IF EXISTS idx_topics_active;
DROP INDEX IF EXISTS idx_topics_name_he;
DROP INDEX IF EXISTS idx_topics_topic_id;

-- Drop the table
DROP TABLE IF EXISTS topics;
