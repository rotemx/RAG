-- Create table for storing Israeli laws
CREATE TABLE IF NOT EXISTS laws (
    id SERIAL PRIMARY KEY,
    law_item_id VARCHAR(50) UNIQUE NOT NULL,
    law_name TEXT NOT NULL,
    law_page_url TEXT NOT NULL,
    pdf_url TEXT,
    pdf_path TEXT,
    publication_series VARCHAR(100),
    booklet_number VARCHAR(50),
    page_number VARCHAR(50),
    publication_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_laws_law_item_id ON laws(law_item_id);
CREATE INDEX IF NOT EXISTS idx_laws_publication_date ON laws(publication_date);
CREATE INDEX IF NOT EXISTS idx_laws_law_name ON laws USING gin(to_tsvector('simple', law_name));
