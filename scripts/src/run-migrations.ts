#!/usr/bin/env tsx
/**
 * Database Migration Runner Script
 *
 * This script manages PostgreSQL database migrations for the Israeli Law RAG project.
 *
 * Usage:
 *   npx tsx scripts/src/run-migrations.ts [command] [options]
 *   # or via npm script:
 *   npm run migrate -w @israeli-law-rag/scripts -- [command] [options]
 *
 * Commands:
 *   up        Run pending migrations (default)
 *   down      Rollback migrations (default: 1 step)
 *   status    Show migration status
 *   reset     Rollback all migrations
 *   refresh   Reset and re-run all migrations
 *
 * Options:
 *   --dry-run         Show what would be done without making changes
 *   --steps=N         Number of migrations to run/rollback (default: all for up, 1 for down)
 *   --target=N        Target version to migrate to
 *   --force           Force migration even with checksum mismatch
 *
 * Environment variables:
 *   - DB_HOST: PostgreSQL host (default: localhost)
 *   - DB_PORT: PostgreSQL port (default: 5432)
 *   - DB_USER: Database user (default: scraper)
 *   - DB_PASSWORD: Database password (default: scraper123)
 *   - DB_NAME: Database name (default: knesset_laws)
 *
 * Examples:
 *   npm run migrate -w @israeli-law-rag/scripts -- up
 *   npm run migrate -w @israeli-law-rag/scripts -- down --steps=2
 *   npm run migrate -w @israeli-law-rag/scripts -- status
 *   npm run migrate -w @israeli-law-rag/scripts -- up --dry-run
 */

import {
  migrateUp,
  migrateDown,
  migrateReset,
  migrateRefresh,
  getMigrationStatus,
  validateDatabaseEnv,
  loadDatabaseConfig,
  type MigrationRunResult,
  type MigrationRunnerOptions,
} from '@israeli-law-rag/lib';

type Command = 'up' | 'down' | 'status' | 'reset' | 'refresh';

interface ParsedArgs {
  command: Command;
  dryRun: boolean;
  steps?: number;
  target?: number;
  force: boolean;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);

  const result: ParsedArgs = {
    command: 'up',
    dryRun: false,
    force: false,
  };

  for (const arg of args) {
    if (arg === 'up' || arg === 'down' || arg === 'status' || arg === 'reset' || arg === 'refresh') {
      result.command = arg;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--force') {
      result.force = true;
    } else if (arg.startsWith('--steps=')) {
      result.steps = parseInt(arg.slice(8), 10);
    } else if (arg.startsWith('--target=')) {
      result.target = parseInt(arg.slice(9), 10);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
Database Migration Runner

Usage:
  npm run migrate -w @israeli-law-rag/scripts -- [command] [options]

Commands:
  up        Run pending migrations (default)
  down      Rollback migrations (default: 1 step)
  status    Show migration status
  reset     Rollback all migrations
  refresh   Reset and re-run all migrations

Options:
  --dry-run         Show what would be done without making changes
  --steps=N         Number of migrations to run/rollback
  --target=N        Target version to migrate to
  --force           Force migration even with checksum mismatch
  -h, --help        Show this help message

Examples:
  npm run migrate -w @israeli-law-rag/scripts -- up
  npm run migrate -w @israeli-law-rag/scripts -- down --steps=2
  npm run migrate -w @israeli-law-rag/scripts -- status
  npm run migrate -w @israeli-law-rag/scripts -- up --dry-run
`);
}

function printResult(result: MigrationRunResult, direction: 'up' | 'down'): void {
  console.log('');
  console.log('='.repeat(60));
  console.log(`MIGRATION ${direction.toUpperCase()} ${result.success ? 'COMPLETE' : 'FAILED'}`);
  console.log('='.repeat(60));
  console.log('');

  if (result.applied.length === 0) {
    console.log(direction === 'up' ? 'No pending migrations.' : 'No migrations to rollback.');
  } else {
    console.log(`Applied ${result.applied.length} migration(s):`);
    console.log('');

    for (const migration of result.applied) {
      const status = migration.success ? '[OK]' : '[FAILED]';
      const time = `${migration.executionTimeMs}ms`;
      console.log(`  ${status} ${migration.migrationName} (${time})`);
      if (migration.error) {
        console.log(`       Error: ${migration.error}`);
      }
    }
  }

  console.log('');
  console.log(`Total time: ${result.totalTime}ms`);
  console.log('');

  if (result.errors.length > 0) {
    console.log('Errors:');
    for (const error of result.errors) {
      console.log(`  - ${error}`);
    }
    console.log('');
  }
}

async function runStatusCommand(): Promise<void> {
  console.log('Fetching migration status...');
  console.log('');

  const status = await getMigrationStatus();

  console.log('='.repeat(60));
  console.log('MIGRATION STATUS');
  console.log('='.repeat(60));
  console.log('');

  console.log(`Current version: ${status.currentVersion}`);
  console.log(`Available migrations: ${status.availableMigrations.length}`);
  console.log(`Pending migrations: ${status.pendingMigrations.length}`);
  console.log('');

  if (status.appliedMigrations.length > 0) {
    console.log('Applied migrations:');
    for (const migration of status.appliedMigrations) {
      const date = migration.appliedAt.toISOString().split('T')[0];
      console.log(`  [v${migration.version}] ${migration.migrationName} (${date})`);
    }
    console.log('');
  }

  if (status.pendingMigrations.length > 0) {
    console.log('Pending migrations:');
    for (const migration of status.pendingMigrations) {
      console.log(`  [v${migration.version}] ${migration.filename}`);
    }
    console.log('');
  }
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Database Migration Runner');
  console.log('='.repeat(60));
  console.log('');

  const args = parseArgs();

  // Validate environment
  console.log('Validating database configuration...');
  const validation = validateDatabaseEnv();

  if (validation.warnings.length > 0) {
    console.log('');
    console.log('Warnings:');
    for (const warning of validation.warnings) {
      console.log(`  - ${warning}`);
    }
  }

  if (!validation.isValid) {
    console.error('');
    console.error('ERROR: Database configuration is invalid.');
    for (const error of validation.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  // Show configuration
  const config = loadDatabaseConfig();
  console.log('');
  console.log('Database configuration:');
  console.log(`  Host: ${config.host}`);
  console.log(`  Port: ${config.port}`);
  console.log(`  Database: ${config.database}`);
  console.log(`  User: ${config.user}`);
  console.log('');

  if (args.dryRun) {
    console.log('*** DRY RUN MODE - No changes will be made ***');
    console.log('');
  }

  const options: MigrationRunnerOptions = {
    config,
    dryRun: args.dryRun,
    targetVersion: args.target,
    force: args.force,
  };

  switch (args.command) {
    case 'up': {
      console.log('Running pending migrations...');
      if (args.steps !== undefined) {
        options.maxMigrations = args.steps;
      }
      const result = await migrateUp(options);
      printResult(result, 'up');
      process.exit(result.success ? 0 : 1);
      break;
    }

    case 'down': {
      console.log('Rolling back migrations...');
      const steps = args.steps ?? 1;
      const result = await migrateDown({ ...options, steps });
      printResult(result, 'down');
      process.exit(result.success ? 0 : 1);
      break;
    }

    case 'status': {
      await runStatusCommand();
      break;
    }

    case 'reset': {
      console.log('Rolling back all migrations...');
      console.log('');
      console.log('WARNING: This will remove all data from the migrated tables!');
      console.log('');

      const result = await migrateReset(options);
      printResult(result, 'down');
      process.exit(result.success ? 0 : 1);
      break;
    }

    case 'refresh': {
      console.log('Refreshing database (reset + migrate)...');
      console.log('');
      console.log('WARNING: This will remove all data from the migrated tables!');
      console.log('');

      const { down, up } = await migrateRefresh(options);

      console.log('');
      console.log('--- ROLLBACK PHASE ---');
      printResult(down, 'down');

      if (down.success) {
        console.log('--- MIGRATION PHASE ---');
        printResult(up, 'up');
      }

      process.exit(down.success && up.success ? 0 : 1);
      break;
    }

    default: {
      console.error(`Unknown command: ${args.command}`);
      printHelp();
      process.exit(1);
    }
  }
}

main().catch((error: unknown) => {
  console.error('');
  console.error('Unexpected error:', error);
  process.exit(1);
});
