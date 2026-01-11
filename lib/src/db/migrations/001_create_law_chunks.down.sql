-- Rollback Migration: Drop law_chunks table
-- Description: Removes the law_chunks table and all related objects
-- Part of Task 1.4.6

-- Drop trigger first
DROP TRIGGER IF EXISTS trigger_law_chunks_updated_at ON law_chunks;

-- Drop trigger function
DROP FUNCTION IF EXISTS update_law_chunks_updated_at();

-- Drop indexes
DROP INDEX IF EXISTS idx_law_chunks_status_created;
DROP INDEX IF EXISTS idx_law_chunks_content_fts;
DROP INDEX IF EXISTS idx_law_chunks_section_type;
DROP INDEX IF EXISTS idx_law_chunks_qdrant_point_id;
DROP INDEX IF EXISTS idx_law_chunks_embedding_status;
DROP INDEX IF EXISTS idx_law_chunks_chunk_id;
DROP INDEX IF EXISTS idx_law_chunks_law_item_id;
DROP INDEX IF EXISTS idx_law_chunks_law_id;

-- Drop the table
DROP TABLE IF EXISTS law_chunks;
