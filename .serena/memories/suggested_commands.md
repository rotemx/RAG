# Suggested Commands

## Development
```bash
npm run dev                    # Start frontend dev server
npm run dev:api                # Start Vercel dev API
npm run build                  # Build all workspaces
npm run build:lib              # Build lib workspace only
```

## Testing
```bash
npm run test                   # Run tests in watch mode
npm run test:run               # Run tests once
npm run test:coverage          # Run tests with coverage
npm run test:e2e               # Run Playwright E2E tests
```

## Linting & Formatting
```bash
npm run lint                   # Run ESLint
npm run lint:fix               # Run ESLint with auto-fix
npm run format                 # Format with Prettier
npm run format:check           # Check formatting
npm run typecheck              # TypeScript type checking
```

## Scripts
```bash
npm run process-pdfs           # Process PDFs into embeddings
npm run create-collection      # Create Qdrant collection
npm run create-indexes         # Create payload indexes
npm run migrate                # Run database migrations
npm run migrate:up             # Apply migrations
npm run migrate:down           # Rollback migration
npm run migrate:status         # Check migration status
```

## Workspace-Specific Commands
```bash
npm run <script> -w @israeli-law-rag/lib        # Run in lib workspace
npm run <script> -w @israeli-law-rag/scripts    # Run in scripts workspace
npm run <script> -w @israeli-law-rag/api        # Run in api workspace
npm run <script> -w @israeli-law-rag/frontend   # Run in frontend workspace
```

## System Utilities (macOS/Darwin)
```bash
ls -la                         # List files with details
find . -name "pattern"         # Find files (or use Glob tool)
grep -r "pattern"              # Search in files (or use Grep tool)
```
