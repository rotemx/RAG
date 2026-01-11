# Task Completion Checklist

## Before Completing a Task
1. Ensure code follows existing patterns and style
2. Add JSDoc comments for exported items
3. Export new symbols from appropriate index files
4. Update TASKS.md status from `[ ]` or `[~]` to `[x]`
5. Do NOT run tests yourself (per task instructions)

## Status Legend in TASKS.md
- `[ ]` - Not started
- `[~]` - In progress / Partially complete
- `[x]` - Completed

## Common Locations
- Types: `lib/src/<module>/types.ts`
- Implementation: `lib/src/<module>/<feature>.ts`
- Index exports: `lib/src/<module>/index.ts`
- Main exports: `lib/src/index.ts`
- Scripts: `scripts/src/<script-name>.ts`
- Tests: `tests/<module>/<feature>.test.ts`

## Export Chain
1. Define in implementation file
2. Export from module index (`lib/src/<module>/index.ts`)
3. Re-export from main index (`lib/src/index.ts`) if needed externally
