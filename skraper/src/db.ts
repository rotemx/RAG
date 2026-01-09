import { Pool, PoolClient } from 'pg';

export interface LawRecord {
  law_item_id: string;
  law_name: string;
  law_page_url: string;
  pdf_url: string | null;
  pdf_path: string | null;
  publication_series: string | null;
  booklet_number: string | null;
  page_number: string | null;
  publication_date: Date | null;
}

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'scraper',
  password: process.env.DB_PASSWORD || 'scraper123',
  database: process.env.DB_NAME || 'knesset_laws',
});

export async function getConnection(): Promise<PoolClient> {
  return pool.connect();
}

export async function closePool(): Promise<void> {
  await pool.end();
}

export async function upsertLaw(law: LawRecord): Promise<void> {
  const query = `
    INSERT INTO laws (
      law_item_id, law_name, law_page_url, pdf_url, pdf_path,
      publication_series, booklet_number, page_number, publication_date
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (law_item_id) DO UPDATE SET
      law_name = EXCLUDED.law_name,
      law_page_url = EXCLUDED.law_page_url,
      pdf_url = EXCLUDED.pdf_url,
      pdf_path = COALESCE(EXCLUDED.pdf_path, laws.pdf_path),
      publication_series = EXCLUDED.publication_series,
      booklet_number = EXCLUDED.booklet_number,
      page_number = EXCLUDED.page_number,
      publication_date = EXCLUDED.publication_date,
      updated_at = CURRENT_TIMESTAMP
  `;

  await pool.query(query, [
    law.law_item_id,
    law.law_name,
    law.law_page_url,
    law.pdf_url,
    law.pdf_path,
    law.publication_series,
    law.booklet_number,
    law.page_number,
    law.publication_date,
  ]);
}

export async function getLawByItemId(lawItemId: string): Promise<LawRecord | null> {
  const result = await pool.query(
    'SELECT * FROM laws WHERE law_item_id = $1',
    [lawItemId]
  );
  return result.rows[0] || null;
}

export async function getLawsWithoutPdf(): Promise<LawRecord[]> {
  const result = await pool.query(
    'SELECT * FROM laws WHERE pdf_path IS NULL AND pdf_url IS NOT NULL ORDER BY id'
  );
  return result.rows;
}

export async function updatePdfPath(lawItemId: string, pdfPath: string): Promise<void> {
  await pool.query(
    'UPDATE laws SET pdf_path = $1, updated_at = CURRENT_TIMESTAMP WHERE law_item_id = $2',
    [pdfPath, lawItemId]
  );
}

export async function getStats(): Promise<{ total: number; withPdf: number }> {
  const totalResult = await pool.query('SELECT COUNT(*) as count FROM laws');
  const withPdfResult = await pool.query('SELECT COUNT(*) as count FROM laws WHERE pdf_path IS NOT NULL');
  return {
    total: parseInt(totalResult.rows[0].count),
    withPdf: parseInt(withPdfResult.rows[0].count),
  };
}
