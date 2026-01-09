# Israeli Laws Database - Project Access Guide

## Quick Start

```bash
# Ensure database is running
npm run db:up

# Check stats
npm run stats
```

## Database Access

### Connection Details
- **Host:** localhost
- **Port:** 5432
- **Database:** knesset_laws
- **User:** scraper
- **Password:** scraper123

### Direct Access
```bash
# Connect via Docker
docker exec -it knesset_laws_db psql -U scraper -d knesset_laws

# Or using psql directly
psql -h localhost -U scraper -d knesset_laws
```

### Table Schema: `laws`

| Column | Type | Description |
|--------|------|-------------|
| law_item_id | VARCHAR(50) | Unique Knesset ID (use for PDF filename) |
| law_name | TEXT | Hebrew law name |
| law_page_url | TEXT | Knesset page URL |
| pdf_url | TEXT | Direct PDF URL |
| pdf_path | TEXT | Local path: `downloads/law_{law_item_id}.pdf` |
| publication_series | VARCHAR(100) | Usually "ספר החוקים" |
| publication_date | DATE | When published |

## PDF Files

### Location
```
./downloads/law_{law_item_id}.pdf
```

### Example
- Database record: `law_item_id = '2196528'`
- PDF file: `downloads/law_2196528.pdf`

### Total Files
- ~3,700 PDF files
- ~1 GB total size
- Language: Hebrew (RTL)

## Common Queries

```sql
-- All laws with PDFs
SELECT law_item_id, law_name, pdf_path
FROM laws WHERE pdf_path IS NOT NULL;

-- Search by name
SELECT * FROM laws WHERE law_name ILIKE '%חוזים%';

-- Recent laws
SELECT * FROM laws
ORDER BY publication_date DESC LIMIT 20;

-- Laws without PDFs (older laws)
SELECT law_item_id, law_name, publication_date
FROM laws WHERE pdf_path IS NULL;
```

## TypeScript Access

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'scraper',
  password: 'scraper123',
  database: 'knesset_laws',
});

// Get all laws with PDFs
const result = await pool.query(`
  SELECT * FROM laws WHERE pdf_path IS NOT NULL
`);
```

## Project Commands

| Command | Description |
|---------|-------------|
| `npm run db:up` | Start PostgreSQL container |
| `npm run db:down` | Stop database |
| `npm run stats` | Show law/PDF counts |
| `npm run scrape` | Re-scrape all pages |
| `npm run download` | Download missing PDFs |

## File Structure

```
skraper/
├── downloads/           # PDF files
│   ├── law_2196528.pdf
│   ├── law_2214242.pdf
│   └── ... (~3,700 files)
├── src/
│   ├── scraper.ts       # Main scraper
│   └── db.ts            # DB utilities
├── docker-compose.yml   # PostgreSQL setup
├── init.sql            # DB schema
└── package.json
```

## Notes

- All content is in **Hebrew** (RTL text)
- ~4,000 older laws don't have PDF files available online
- PDF URLs use Knesset's file server: `fs.knesset.gov.il`
