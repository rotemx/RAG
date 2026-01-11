-- Migration: Create law_topics junction table for many-to-many relationship
-- Description: Links laws to topics with relevance scores for topic-based filtering
-- Part of Task 1.4.3

-- Create junction table for law-topic many-to-many relationship
CREATE TABLE IF NOT EXISTS law_topics (
    -- Primary identifier
    id SERIAL PRIMARY KEY,

    -- Foreign key to the law
    law_id INTEGER NOT NULL REFERENCES laws(id) ON DELETE CASCADE,

    -- Foreign key to the topic
    topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,

    -- Relevance score (0.0 to 1.0) indicating how strongly the law belongs to this topic
    -- Higher scores indicate stronger association
    relevance_score DECIMAL(5, 4) DEFAULT 1.0
        CHECK (relevance_score >= 0 AND relevance_score <= 1),

    -- Rank of this topic for the law (1 = primary topic, 2 = secondary, etc.)
    -- Useful for displaying "primary" vs "related" topics
    topic_rank INTEGER DEFAULT 1
        CHECK (topic_rank >= 1),

    -- Whether this is the primary/main topic for the law
    is_primary BOOLEAN DEFAULT FALSE,

    -- Assignment method
    assignment_method VARCHAR(50) DEFAULT 'clustering'
        CHECK (assignment_method IN ('clustering', 'manual', 'llm_suggested', 'keyword_match', 'hybrid')),

    -- Confidence score from the assignment algorithm (optional)
    assignment_confidence DECIMAL(5, 4)
        CHECK (assignment_confidence IS NULL OR (assignment_confidence >= 0 AND assignment_confidence <= 1)),

    -- Whether this assignment was manually reviewed/approved
    is_reviewed BOOLEAN DEFAULT FALSE,
    reviewed_at TIMESTAMP,
    reviewed_by VARCHAR(255),

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure each law-topic pair is unique
    CONSTRAINT unique_law_topic UNIQUE (law_id, topic_id)
);

-- Indexes for efficient querying

-- Index on law_id for fast retrieval of all topics for a law
CREATE INDEX IF NOT EXISTS idx_law_topics_law_id ON law_topics(law_id);

-- Index on topic_id for fast retrieval of all laws in a topic
CREATE INDEX IF NOT EXISTS idx_law_topics_topic_id ON law_topics(topic_id);

-- Composite index for looking up specific law-topic pairs
CREATE INDEX IF NOT EXISTS idx_law_topics_law_topic ON law_topics(law_id, topic_id);

-- Index on relevance_score for filtering high-relevance associations
CREATE INDEX IF NOT EXISTS idx_law_topics_relevance ON law_topics(relevance_score DESC);

-- Index for primary topic lookups
CREATE INDEX IF NOT EXISTS idx_law_topics_primary ON law_topics(law_id, is_primary) WHERE is_primary = TRUE;

-- Index for topic rank ordering
CREATE INDEX IF NOT EXISTS idx_law_topics_rank ON law_topics(law_id, topic_rank);

-- Partial index for unreviewed assignments needing review
CREATE INDEX IF NOT EXISTS idx_law_topics_unreviewed ON law_topics(created_at)
    WHERE is_reviewed = FALSE;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_law_topics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_law_topics_updated_at ON law_topics;
CREATE TRIGGER trigger_law_topics_updated_at
    BEFORE UPDATE ON law_topics
    FOR EACH ROW
    EXECUTE FUNCTION update_law_topics_updated_at();

-- Trigger to update topics.law_count when law_topics changes
CREATE OR REPLACE FUNCTION update_topic_law_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE topics SET law_count = law_count + 1 WHERE id = NEW.topic_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE topics SET law_count = law_count - 1 WHERE id = OLD.topic_id;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' AND OLD.topic_id != NEW.topic_id THEN
        UPDATE topics SET law_count = law_count - 1 WHERE id = OLD.topic_id;
        UPDATE topics SET law_count = law_count + 1 WHERE id = NEW.topic_id;
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_law_topics_count ON law_topics;
CREATE TRIGGER trigger_law_topics_count
    AFTER INSERT OR DELETE OR UPDATE OF topic_id ON law_topics
    FOR EACH ROW
    EXECUTE FUNCTION update_topic_law_count();

-- Comments for documentation
COMMENT ON TABLE law_topics IS 'Junction table linking laws to topics for many-to-many relationship';
COMMENT ON COLUMN law_topics.relevance_score IS 'Score 0-1 indicating strength of law-topic association';
COMMENT ON COLUMN law_topics.topic_rank IS 'Rank of topic for this law (1 = primary, 2+ = related)';
COMMENT ON COLUMN law_topics.is_primary IS 'TRUE if this is the main/primary topic for the law';
COMMENT ON COLUMN law_topics.assignment_method IS 'How assignment was made: clustering, manual, llm_suggested, keyword_match, hybrid';
COMMENT ON COLUMN law_topics.assignment_confidence IS 'Confidence score from the assignment algorithm';
