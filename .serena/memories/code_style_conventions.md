# Code Style & Conventions

## TypeScript
- Strict mode enabled
- Use `.js` extensions in imports (ESM)
- Prefer `interface` for object types, `type` for unions/aliases
- Use Zod schemas for runtime validation with inferred types
- Export types with `type` keyword when appropriate

## File Organization
- One module per file, related functionality grouped
- Index files (`index.ts`) for re-exports
- Types in separate `types.ts` files when shared
- Keep exports organized: types, schemas, classes, functions

## Naming Conventions
- Files: kebab-case (`vector-store-service.ts`)
- Classes: PascalCase (`VectorStoreService`)
- Functions: camelCase (`createQdrantClient`)
- Constants: SCREAMING_SNAKE_CASE (`DEFAULT_QDRANT_CONFIG`)
- Types/Interfaces: PascalCase (`QdrantConfig`)
- Schemas: PascalCase with `Schema` suffix (`QdrantConfigSchema`)

## Documentation
- JSDoc comments for exported functions/classes
- @param, @returns, @throws tags as needed
- Brief description at module top
- Document non-obvious behavior

## Error Handling
- Custom error classes for domain errors
- Error codes as const objects (`VectorStoreErrorCode`)
- Type guards for error checking (`isVectorStoreError`)
- Structured error info with cause chain

## Patterns Used
- Singleton pattern with reset functions (e.g., `getQdrantClient()`)
- Factory functions for object creation
- Zod schemas for validation with defaults
- Result types for operations that can fail
