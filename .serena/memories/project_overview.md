# Israeli Law RAG Project Overview

## Purpose
RAG (Retrieval-Augmented Generation) system for Israeli law documents. Enables users to ask questions about Israeli law in Hebrew and receive accurate answers with source citations.

## Tech Stack
- **Frontend**: Vue.js 3 + TypeScript + Tailwind CSS
- **Backend**: Vercel Serverless Functions
- **Vector Database**: Qdrant Cloud (free tier)
- **LLM Provider**: Anthropic Claude API (modular, easy to switch)
- **Embeddings**: multilingual-e5-large (1024 dimensions)
- **Database**: PostgreSQL (metadata storage)
- **PDF Parsing**: pdf-parse + fallback chain

## Monorepo Structure
```
/israeli-law-rag/
├── frontend/           # Vue.js 3 application
├── api/                # Vercel serverless functions
├── lib/                # Shared backend logic (main library)
├── scripts/            # Data processing scripts
├── tests/              # Test suites
├── documentation/      # Project documentation
└── skraper/            # Source PDFs (~3,900 files) + existing scraper code
```

## Key Configuration Files
- `package.json` - Root monorepo with npm workspaces
- `tsconfig.json` - TypeScript strict mode
- `vitest.config.ts` - Vitest test configuration
- `.eslintrc.cjs` - ESLint configuration
- `.prettierrc` - Prettier configuration
- `vercel.json` - Vercel deployment config
