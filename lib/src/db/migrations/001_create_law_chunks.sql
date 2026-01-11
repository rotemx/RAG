-- Migration: Create law_chunks table for processed text chunks
-- Description: Stores chunked text content from laws for RAG retrieval
-- Part of Task 1.4.1

-- Create table for storing processed law text chunks
CREATE TABLE IF NOT EXISTS law_chunks (
    -- Primary identifier
    id SERIAL PRIMARY KEY,

    -- Deterministic chunk ID for deduplication and Qdrant reference
    -- Format: {law_item_id}_{chunk_index} (e.g., "2196528_0", "2196528_1")
    chunk_id VARCHAR(100) UNIQUE NOT NULL,

    -- Foreign key reference to the parent law
    law_id INTEGER NOT NULL REFERENCES laws(id) ON DELETE CASCADE,

    -- The law_item_id for easier querying (denormalized from laws table)
    law_item_id VARCHAR(50) NOT NULL,

    -- Chunk ordering within the document (0-indexed)
    chunk_index INTEGER NOT NULL,

    -- The actual chunk text content
    content TEXT NOT NULL,

    -- Token count for this chunk (useful for LLM context management)
    token_count INTEGER,

    -- Character count for this chunk
    char_count INTEGER NOT NULL,

    -- Start position in original document (character offset)
    start_position INTEGER,

    -- End position in original document (character offset)
    end_position INTEGER,

    -- Section metadata (if chunk corresponds to a legal section like סעיף, פרק)
    section_title TEXT,
    section_type VARCHAR(50), -- e.g., 'סעיף', 'פרק', 'חלק', 'הגדרות'
    section_number VARCHAR(50), -- e.g., '1', '2א', '12(ב)'

    -- Overlap information for chunk context
    has_overlap_before BOOLEAN DEFAULT FALSE,
    has_overlap_after BOOLEAN DEFAULT FALSE,

    -- Qdrant point ID (UUID stored as string for reference)
    qdrant_point_id VARCHAR(36),

    -- Processing status
    embedding_status VARCHAR(20) DEFAULT 'pending'
        CHECK (embedding_status IN ('pending', 'processing', 'completed', 'failed')),
    embedding_error TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    embedded_at TIMESTAMP,

    -- Ensure chunk ordering is unique per law
    CONSTRAINT unique_law_chunk_order UNIQUE (law_id, chunk_index)
);

-- Indexes for efficient querying
-- Index on law_id for fast retrieval of all chunks for a law
CREATE INDEX IF NOT EXISTS idx_law_chunks_law_id ON law_chunks(law_id);

-- Index on law_item_id for direct lookups by Knesset ID
CREATE INDEX IF NOT EXISTS idx_law_chunks_law_item_id ON law_chunks(law_item_id);

-- Index on chunk_id for deduplication checks and Qdrant sync
CREATE INDEX IF NOT EXISTS idx_law_chunks_chunk_id ON law_chunks(chunk_id);

-- Index on embedding_status for batch processing queries
CREATE INDEX IF NOT EXISTS idx_law_chunks_embedding_status ON law_chunks(embedding_status);

-- Index on qdrant_point_id for reverse lookups from vector search results
CREATE INDEX IF NOT EXISTS idx_law_chunks_qdrant_point_id ON law_chunks(qdrant_point_id);

-- Index on section_type for filtering by legal structure
CREATE INDEX IF NOT EXISTS idx_law_chunks_section_type ON law_chunks(section_type);

-- Composite index for efficient pagination of pending embeddings
CREATE INDEX IF NOT EXISTS idx_law_chunks_status_created
    ON law_chunks(embedding_status, created_at)
    WHERE embedding_status = 'pending';

-- Full-text search index on content for hybrid search support
-- Uses 'simple' config for Hebrew text (no stemming)
CREATE INDEX IF NOT EXISTS idx_law_chunks_content_fts
    ON law_chunks USING gin(to_tsvector('simple', content));

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_law_chunks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_law_chunks_updated_at ON law_chunks;
CREATE TRIGGER trigger_law_chunks_updated_at
    BEFORE UPDATE ON law_chunks
    FOR EACH ROW
    EXECUTE FUNCTION update_law_chunks_updated_at();

-- Comments for documentation
COMMENT ON TABLE law_chunks IS 'Stores processed text chunks from Israeli law documents for RAG retrieval';
COMMENT ON COLUMN law_chunks.chunk_id IS 'Deterministic ID: {law_item_id}_{chunk_index} for deduplication';
COMMENT ON COLUMN law_chunks.content IS 'The chunk text content, typically 512 tokens max for e5-large';
COMMENT ON COLUMN law_chunks.section_type IS 'Hebrew legal section type: סעיף, פרק, חלק, הגדרות, etc.';
COMMENT ON COLUMN law_chunks.embedding_status IS 'Status: pending, processing, completed, failed';
COMMENT ON COLUMN law_chunks.qdrant_point_id IS 'UUID reference to the vector point in Qdrant';
