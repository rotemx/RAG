-- Rollback Migration: Drop full-text search indexes and functions
-- Description: Removes FTS indexes, trigram indexes, and helper functions
-- Part of Task 1.4.6

-- Drop stored functions first
DROP FUNCTION IF EXISTS search_laws_fuzzy(TEXT, INTEGER, REAL);
DROP FUNCTION IF EXISTS search_topics_fts(TEXT, INTEGER, BOOLEAN);
DROP FUNCTION IF EXISTS search_laws_fts(TEXT, INTEGER);
DROP FUNCTION IF EXISTS search_law_chunks_fts(TEXT, INTEGER, REAL);
DROP FUNCTION IF EXISTS build_search_query(TEXT);
DROP FUNCTION IF EXISTS normalize_hebrew_query(TEXT);

-- Drop trigram indexes
DROP INDEX IF EXISTS idx_law_chunks_section_title_trgm;
DROP INDEX IF EXISTS idx_topics_name_he_trgm;
DROP INDEX IF EXISTS idx_laws_law_name_trgm;

-- Drop topics FTS indexes
DROP INDEX IF EXISTS idx_topics_fts_combined;
DROP INDEX IF EXISTS idx_topics_description_he_fts;
DROP INDEX IF EXISTS idx_topics_name_he_fts;

-- Drop law_chunks FTS indexes
DROP INDEX IF EXISTS idx_law_chunks_section_title_fts;
DROP INDEX IF EXISTS idx_law_chunks_fts_combined;

-- Drop laws FTS indexes
DROP INDEX IF EXISTS idx_laws_fts_combined;

-- Note: We don't drop the pg_trgm extension as it may be used by other parts of the database
-- If you want to drop it, uncomment the following line:
-- DROP EXTENSION IF EXISTS pg_trgm;
