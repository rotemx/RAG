-- Migration: Add full-text search indexes using GIN
-- Description: Creates GIN indexes for efficient full-text search on Hebrew legal content
-- Part of Task 1.4.4
--
-- Full-text search (FTS) enables efficient keyword-based searching to complement
-- vector similarity search in the hybrid RAG retrieval system.
--
-- Uses 'simple' configuration for Hebrew text as it doesn't apply language-specific
-- stemming, which is more appropriate for Hebrew legal terminology.

-- ============================================================================
-- Laws Table FTS Indexes
-- ============================================================================

-- Note: idx_laws_law_name already exists from init.sql
-- We add additional indexes for comprehensive search

-- Combined index on law_name and publication_series for broader law search
CREATE INDEX IF NOT EXISTS idx_laws_fts_combined
    ON laws USING gin((
        setweight(to_tsvector('simple', COALESCE(law_name, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(publication_series, '')), 'B')
    ));

-- ============================================================================
-- Law Chunks Table FTS Indexes
-- ============================================================================

-- Note: idx_law_chunks_content_fts already exists from 001_create_law_chunks.sql
-- We add additional indexes for section-aware search

-- Combined index on content and section metadata for contextual search
CREATE INDEX IF NOT EXISTS idx_law_chunks_fts_combined
    ON law_chunks USING gin((
        setweight(to_tsvector('simple', COALESCE(content, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(section_title, '')), 'B')
    ));

-- Index on section_title for section-specific searches
CREATE INDEX IF NOT EXISTS idx_law_chunks_section_title_fts
    ON law_chunks USING gin(to_tsvector('simple', COALESCE(section_title, '')));

-- ============================================================================
-- Topics Table FTS Indexes
-- ============================================================================

-- Note: Some GIN indexes on arrays already exist from 002_create_topics.sql
-- We add FTS indexes for text-based topic search

-- Index on Hebrew topic name for topic searches
CREATE INDEX IF NOT EXISTS idx_topics_name_he_fts
    ON topics USING gin(to_tsvector('simple', name_he));

-- Index on Hebrew description for detailed topic searches
CREATE INDEX IF NOT EXISTS idx_topics_description_he_fts
    ON topics USING gin(to_tsvector('simple', COALESCE(description_he, '')));

-- Combined weighted index for comprehensive topic search
-- Hebrew name has highest weight, description is secondary
CREATE INDEX IF NOT EXISTS idx_topics_fts_combined
    ON topics USING gin((
        setweight(to_tsvector('simple', COALESCE(name_he, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(description_he, '')), 'B') ||
        setweight(to_tsvector('simple', COALESCE(name_en, '')), 'C')
    ));

-- ============================================================================
-- Trigram Indexes for Fuzzy/Partial Matching (requires pg_trgm extension)
-- ============================================================================

-- Enable pg_trgm extension for fuzzy string matching
-- This is particularly useful for Hebrew text with varying spelling conventions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index on law_name for fuzzy law name searches
CREATE INDEX IF NOT EXISTS idx_laws_law_name_trgm
    ON laws USING gin(law_name gin_trgm_ops);

-- Trigram index on topic Hebrew name for fuzzy topic searches
CREATE INDEX IF NOT EXISTS idx_topics_name_he_trgm
    ON topics USING gin(name_he gin_trgm_ops);

-- Trigram index on section_title for fuzzy section searches
CREATE INDEX IF NOT EXISTS idx_law_chunks_section_title_trgm
    ON law_chunks USING gin(section_title gin_trgm_ops)
    WHERE section_title IS NOT NULL;

-- ============================================================================
-- Helper Functions for Full-Text Search
-- ============================================================================

-- Function to normalize Hebrew search queries
-- Handles common Hebrew text variations
CREATE OR REPLACE FUNCTION normalize_hebrew_query(query_text TEXT)
RETURNS TEXT AS $$
BEGIN
    -- Remove extra whitespace
    query_text := regexp_replace(query_text, '\s+', ' ', 'g');
    -- Trim leading/trailing whitespace
    query_text := trim(query_text);
    -- Return normalized text
    RETURN query_text;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to build a tsquery from user input
-- Handles multiple words with AND logic
CREATE OR REPLACE FUNCTION build_search_query(search_text TEXT)
RETURNS tsquery AS $$
DECLARE
    normalized TEXT;
    words TEXT[];
    word TEXT;
    query_parts TEXT[];
BEGIN
    -- Normalize the input
    normalized := normalize_hebrew_query(search_text);

    -- Split into words
    words := string_to_array(normalized, ' ');

    -- Build query parts (each word becomes a search term)
    FOREACH word IN ARRAY words
    LOOP
        IF length(word) > 0 THEN
            -- Use prefix matching for partial word searches
            query_parts := array_append(query_parts, word || ':*');
        END IF;
    END LOOP;

    -- Join with AND operator
    IF array_length(query_parts, 1) > 0 THEN
        RETURN to_tsquery('simple', array_to_string(query_parts, ' & '));
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to search law chunks with ranking
-- Returns chunks ordered by relevance score
CREATE OR REPLACE FUNCTION search_law_chunks_fts(
    search_text TEXT,
    result_limit INTEGER DEFAULT 20,
    min_rank REAL DEFAULT 0.0
)
RETURNS TABLE (
    chunk_id VARCHAR(100),
    law_id INTEGER,
    law_item_id VARCHAR(50),
    chunk_index INTEGER,
    content TEXT,
    section_title TEXT,
    section_type VARCHAR(50),
    rank REAL,
    headline TEXT
) AS $$
DECLARE
    search_query tsquery;
BEGIN
    -- Build the search query
    search_query := build_search_query(search_text);

    IF search_query IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        lc.chunk_id,
        lc.law_id,
        lc.law_item_id,
        lc.chunk_index,
        lc.content,
        lc.section_title,
        lc.section_type,
        ts_rank(
            setweight(to_tsvector('simple', COALESCE(lc.content, '')), 'A') ||
            setweight(to_tsvector('simple', COALESCE(lc.section_title, '')), 'B'),
            search_query
        ) AS rank,
        ts_headline(
            'simple',
            lc.content,
            search_query,
            'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20, MaxFragments=3'
        ) AS headline
    FROM law_chunks lc
    WHERE (
        setweight(to_tsvector('simple', COALESCE(lc.content, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(lc.section_title, '')), 'B')
    ) @@ search_query
    AND ts_rank(
        setweight(to_tsvector('simple', COALESCE(lc.content, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(lc.section_title, '')), 'B'),
        search_query
    ) >= min_rank
    ORDER BY rank DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to search laws by name with ranking
CREATE OR REPLACE FUNCTION search_laws_fts(
    search_text TEXT,
    result_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id INTEGER,
    law_item_id VARCHAR(50),
    law_name TEXT,
    publication_date DATE,
    rank REAL,
    headline TEXT
) AS $$
DECLARE
    search_query tsquery;
BEGIN
    -- Build the search query
    search_query := build_search_query(search_text);

    IF search_query IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        l.id,
        l.law_item_id,
        l.law_name,
        l.publication_date,
        ts_rank(
            setweight(to_tsvector('simple', COALESCE(l.law_name, '')), 'A') ||
            setweight(to_tsvector('simple', COALESCE(l.publication_series, '')), 'B'),
            search_query
        ) AS rank,
        ts_headline(
            'simple',
            l.law_name,
            search_query,
            'StartSel=<mark>, StopSel=</mark>, MaxWords=30, MinWords=10'
        ) AS headline
    FROM laws l
    WHERE (
        setweight(to_tsvector('simple', COALESCE(l.law_name, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(l.publication_series, '')), 'B')
    ) @@ search_query
    ORDER BY rank DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to search topics by name/description with ranking
CREATE OR REPLACE FUNCTION search_topics_fts(
    search_text TEXT,
    result_limit INTEGER DEFAULT 20,
    active_only BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
    id INTEGER,
    topic_id VARCHAR(50),
    name_he VARCHAR(255),
    description_he TEXT,
    law_count INTEGER,
    rank REAL,
    headline TEXT
) AS $$
DECLARE
    search_query tsquery;
BEGIN
    -- Build the search query
    search_query := build_search_query(search_text);

    IF search_query IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        t.id,
        t.topic_id,
        t.name_he,
        t.description_he,
        t.law_count,
        ts_rank(
            setweight(to_tsvector('simple', COALESCE(t.name_he, '')), 'A') ||
            setweight(to_tsvector('simple', COALESCE(t.description_he, '')), 'B'),
            search_query
        ) AS rank,
        ts_headline(
            'simple',
            COALESCE(t.name_he, '') || ' - ' || COALESCE(t.description_he, ''),
            search_query,
            'StartSel=<mark>, StopSel=</mark>, MaxWords=30, MinWords=10'
        ) AS headline
    FROM topics t
    WHERE (
        setweight(to_tsvector('simple', COALESCE(t.name_he, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(t.description_he, '')), 'B')
    ) @@ search_query
    AND (NOT active_only OR t.is_active = TRUE)
    ORDER BY rank DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function for fuzzy search using trigrams (for typo tolerance)
CREATE OR REPLACE FUNCTION search_laws_fuzzy(
    search_text TEXT,
    result_limit INTEGER DEFAULT 20,
    similarity_threshold REAL DEFAULT 0.3
)
RETURNS TABLE (
    id INTEGER,
    law_item_id VARCHAR(50),
    law_name TEXT,
    publication_date DATE,
    similarity REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        l.id,
        l.law_item_id,
        l.law_name,
        l.publication_date,
        similarity(l.law_name, search_text) AS similarity
    FROM laws l
    WHERE similarity(l.law_name, search_text) >= similarity_threshold
    ORDER BY similarity DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON FUNCTION normalize_hebrew_query IS 'Normalizes Hebrew search query text by removing extra whitespace';
COMMENT ON FUNCTION build_search_query IS 'Builds a tsquery from user input with prefix matching for partial words';
COMMENT ON FUNCTION search_law_chunks_fts IS 'Full-text search on law chunks with ranking and headline generation';
COMMENT ON FUNCTION search_laws_fts IS 'Full-text search on laws by name with ranking';
COMMENT ON FUNCTION search_topics_fts IS 'Full-text search on topics by Hebrew name/description';
COMMENT ON FUNCTION search_laws_fuzzy IS 'Fuzzy search on law names using trigram similarity for typo tolerance';

COMMENT ON INDEX idx_laws_fts_combined IS 'GIN index for weighted FTS on law name and publication series';
COMMENT ON INDEX idx_law_chunks_fts_combined IS 'GIN index for weighted FTS on chunk content and section title';
COMMENT ON INDEX idx_law_chunks_section_title_fts IS 'GIN index for FTS on section titles';
COMMENT ON INDEX idx_topics_name_he_fts IS 'GIN index for FTS on Hebrew topic names';
COMMENT ON INDEX idx_topics_description_he_fts IS 'GIN index for FTS on Hebrew topic descriptions';
COMMENT ON INDEX idx_topics_fts_combined IS 'GIN index for weighted FTS on topic name and description';
COMMENT ON INDEX idx_laws_law_name_trgm IS 'GIN trigram index for fuzzy law name searches';
COMMENT ON INDEX idx_topics_name_he_trgm IS 'GIN trigram index for fuzzy topic name searches';
COMMENT ON INDEX idx_law_chunks_section_title_trgm IS 'GIN trigram index for fuzzy section title searches';
