-- Migration: Create schema_migrations table for tracking applied migrations
-- Description: Tracks which migrations have been applied to the database
-- This migration is applied manually or auto-created by the migration runner

-- Create table for tracking applied migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
    -- Primary identifier
    id SERIAL PRIMARY KEY,

    -- Migration filename (e.g., '001_create_law_chunks.sql')
    migration_name VARCHAR(255) UNIQUE NOT NULL,

    -- Migration version number extracted from filename
    version INTEGER NOT NULL,

    -- Direction of the migration (up or down)
    direction VARCHAR(10) NOT NULL DEFAULT 'up'
        CHECK (direction IN ('up', 'down')),

    -- Checksum of the migration file for integrity verification
    checksum VARCHAR(64),

    -- Execution time in milliseconds
    execution_time_ms INTEGER,

    -- Whether the migration was successful
    success BOOLEAN DEFAULT TRUE,

    -- Error message if migration failed
    error_message TEXT,

    -- Who/what applied the migration
    applied_by VARCHAR(255) DEFAULT 'migration_runner',

    -- Timestamp when migration was applied
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient version lookups
CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations(version);

-- Index for finding latest migrations
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations(applied_at DESC);

-- Index for direction filtering
CREATE INDEX IF NOT EXISTS idx_schema_migrations_direction ON schema_migrations(direction);

-- Comments for documentation
COMMENT ON TABLE schema_migrations IS 'Tracks applied database migrations for version control';
COMMENT ON COLUMN schema_migrations.migration_name IS 'Migration filename without path';
COMMENT ON COLUMN schema_migrations.version IS 'Numeric version extracted from filename prefix';
COMMENT ON COLUMN schema_migrations.checksum IS 'SHA-256 hash of migration file content';
COMMENT ON COLUMN schema_migrations.direction IS 'Whether this was an up or down migration';
