/**
 * Database Migrations
 *
 * Migration runner utilities for the Israeli Law RAG project.
 * Provides functions to run, rollback, and track database migrations.
 */

import { createHash } from 'crypto';
import { readdir, readFile } from 'fs/promises';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import pg from 'pg';

import { loadDatabaseConfig, type DatabaseConfig } from './config.js';

const { Pool } = pg;
type PoolType = InstanceType<typeof Pool>;

/**
 * Migration direction
 */
export type MigrationDirection = 'up' | 'down';

/**
 * Migration file information
 */
export interface MigrationFile {
  /** Migration filename */
  filename: string;
  /** Migration version (extracted from filename prefix) */
  version: number;
  /** Full path to migration file */
  path: string;
  /** Direction (up or down) */
  direction: MigrationDirection;
  /** Base migration name without direction suffix */
  baseName: string;
}

/**
 * Migration record from database
 */
export interface MigrationRecord {
  id: number;
  migrationName: string;
  version: number;
  direction: MigrationDirection;
  checksum: string | null;
  executionTimeMs: number | null;
  success: boolean;
  errorMessage: string | null;
  appliedBy: string;
  appliedAt: Date;
}

/**
 * Result of a single migration execution
 */
export interface MigrationResult {
  migrationName: string;
  version: number;
  direction: MigrationDirection;
  success: boolean;
  executionTimeMs: number;
  error?: string;
}

/**
 * Result of running multiple migrations
 */
export interface MigrationRunResult {
  success: boolean;
  applied: MigrationResult[];
  errors: string[];
  totalTime: number;
}

/**
 * Migration runner options
 */
export interface MigrationRunnerOptions {
  /** Database configuration (uses default if not provided) */
  config?: DatabaseConfig;
  /** Whether to run in dry-run mode (no actual changes) */
  dryRun?: boolean;
  /** Maximum number of migrations to apply (0 = all) */
  maxMigrations?: number;
  /** Target version to migrate to (up: max version, down: min version) */
  targetVersion?: number;
  /** Whether to force migration even if checksum mismatch */
  force?: boolean;
}

/**
 * Database row for schema_migrations table
 */
interface MigrationRow {
  id: number;
  migration_name: string;
  version: number;
  direction: string;
  checksum: string | null;
  execution_time_ms: number | null;
  success: boolean;
  error_message: string | null;
  applied_by: string;
  applied_at: Date;
}

/**
 * Parses migration filename to extract version and direction.
 * Expected format: NNN_name.sql or NNN_name.down.sql
 */
export function parseMigrationFilename(filename: string): {
  version: number;
  direction: MigrationDirection;
  baseName: string;
} | null {
  // Match patterns like: 001_create_law_chunks.sql or 001_create_law_chunks.down.sql
  const downMatch = filename.match(/^(\d+)_(.+)\.down\.sql$/);
  if (downMatch) {
    return {
      version: parseInt(downMatch[1], 10),
      direction: 'down',
      baseName: `${downMatch[1]}_${downMatch[2]}`,
    };
  }

  const upMatch = filename.match(/^(\d+)_(.+)\.sql$/);
  if (upMatch) {
    return {
      version: parseInt(upMatch[1], 10),
      direction: 'up',
      baseName: `${upMatch[1]}_${upMatch[2]}`,
    };
  }

  return null;
}

/**
 * Calculates SHA-256 checksum of migration content.
 */
export function calculateChecksum(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Gets the migrations directory path.
 */
export function getMigrationsDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return join(__dirname, 'migrations');
}

/**
 * Reads all migration files from the migrations directory.
 */
export async function readMigrationFiles(
  direction: MigrationDirection = 'up'
): Promise<MigrationFile[]> {
  const migrationsDir = getMigrationsDir();
  const files = await readdir(migrationsDir);

  const migrations: MigrationFile[] = [];

  for (const file of files) {
    const parsed = parseMigrationFilename(file);
    if (parsed && parsed.direction === direction) {
      migrations.push({
        filename: file,
        version: parsed.version,
        path: join(migrationsDir, file),
        direction: parsed.direction,
        baseName: parsed.baseName,
      });
    }
  }

  // Sort by version (ascending for up, descending for down)
  migrations.sort((a, b) =>
    direction === 'up' ? a.version - b.version : b.version - a.version
  );

  return migrations;
}

/**
 * Converts database row to MigrationRecord.
 */
function rowToMigrationRecord(row: MigrationRow): MigrationRecord {
  return {
    id: row.id,
    migrationName: row.migration_name,
    version: row.version,
    direction: row.direction as MigrationDirection,
    checksum: row.checksum,
    executionTimeMs: row.execution_time_ms,
    success: row.success,
    errorMessage: row.error_message,
    appliedBy: row.applied_by,
    appliedAt: row.applied_at,
  };
}

/**
 * Creates a database pool for migrations.
 */
export function createMigrationPool(config?: DatabaseConfig): PoolType {
  const dbConfig = config ?? loadDatabaseConfig();
  return new Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    max: 1, // Single connection for migrations
    connectionTimeoutMillis: dbConfig.connectionTimeout,
    idleTimeoutMillis: dbConfig.idleTimeout,
  });
}

/**
 * Ensures the schema_migrations table exists.
 */
export async function ensureMigrationsTable(pool: PoolType): Promise<void> {
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      migration_name VARCHAR(255) UNIQUE NOT NULL,
      version INTEGER NOT NULL,
      direction VARCHAR(10) NOT NULL DEFAULT 'up' CHECK (direction IN ('up', 'down')),
      checksum VARCHAR(64),
      execution_time_ms INTEGER,
      success BOOLEAN DEFAULT TRUE,
      error_message TEXT,
      applied_by VARCHAR(255) DEFAULT 'migration_runner',
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations(version);
    CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations(applied_at DESC);
  `;

  await pool.query(createTableSql);
}

/**
 * Gets all applied migrations from the database.
 */
export async function getAppliedMigrations(pool: PoolType): Promise<MigrationRecord[]> {
  const result = await pool.query<MigrationRow>(
    'SELECT * FROM schema_migrations WHERE success = TRUE ORDER BY version ASC'
  );
  return result.rows.map(rowToMigrationRecord);
}

/**
 * Gets the current migration version (highest applied 'up' migration).
 */
export async function getCurrentVersion(pool: PoolType): Promise<number> {
  const result = await pool.query<{ max_version: number }>(
    `SELECT COALESCE(MAX(version), 0) as max_version
     FROM schema_migrations
     WHERE direction = 'up' AND success = TRUE`
  );
  return result.rows[0].max_version;
}

/**
 * Checks if a specific migration has been applied.
 */
export async function isMigrationApplied(
  pool: PoolType,
  migrationName: string
): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM schema_migrations
     WHERE migration_name = $1 AND success = TRUE`,
    [migrationName]
  );
  return parseInt(result.rows[0].count, 10) > 0;
}

/**
 * Records a migration execution in the schema_migrations table.
 */
export async function recordMigration(
  pool: PoolType,
  migration: {
    migrationName: string;
    version: number;
    direction: MigrationDirection;
    checksum: string;
    executionTimeMs: number;
    success: boolean;
    errorMessage?: string;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO schema_migrations
     (migration_name, version, direction, checksum, execution_time_ms, success, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      migration.migrationName,
      migration.version,
      migration.direction,
      migration.checksum,
      migration.executionTimeMs,
      migration.success,
      migration.errorMessage ?? null,
    ]
  );
}

/**
 * Removes a migration record when rolling back.
 */
export async function removeMigrationRecord(
  pool: PoolType,
  baseName: string
): Promise<void> {
  // Remove the 'up' migration record when rolling back
  await pool.query(
    `DELETE FROM schema_migrations WHERE migration_name = $1 AND direction = 'up'`,
    [`${baseName}.sql`]
  );
}

/**
 * Runs a single migration.
 */
export async function runMigration(
  pool: PoolType,
  migration: MigrationFile,
  options: { dryRun?: boolean } = {}
): Promise<MigrationResult> {
  const startTime = Date.now();

  try {
    // Read migration file content
    const content = await readFile(migration.path, 'utf-8');
    const checksum = calculateChecksum(content);

    if (options.dryRun) {
      console.log(`[DRY-RUN] Would run: ${migration.filename}`);
      return {
        migrationName: migration.filename,
        version: migration.version,
        direction: migration.direction,
        success: true,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Execute migration in a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(content);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const executionTimeMs = Date.now() - startTime;

    // Record successful migration
    await recordMigration(pool, {
      migrationName: migration.filename,
      version: migration.version,
      direction: migration.direction,
      checksum,
      executionTimeMs,
      success: true,
    });

    // If rolling back, remove the original 'up' migration record
    if (migration.direction === 'down') {
      await removeMigrationRecord(pool, migration.baseName);
    }

    return {
      migrationName: migration.filename,
      version: migration.version,
      direction: migration.direction,
      success: true,
      executionTimeMs,
    };
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Record failed migration (unless in dry-run mode)
    if (!options.dryRun) {
      const content = await readFile(migration.path, 'utf-8').catch(() => '');
      const checksum = content ? calculateChecksum(content) : '';

      await recordMigration(pool, {
        migrationName: migration.filename,
        version: migration.version,
        direction: migration.direction,
        checksum,
        executionTimeMs,
        success: false,
        errorMessage,
      }).catch(() => {
        // Ignore errors when recording failed migration
      });
    }

    return {
      migrationName: migration.filename,
      version: migration.version,
      direction: migration.direction,
      success: false,
      executionTimeMs,
      error: errorMessage,
    };
  }
}

/**
 * Runs all pending 'up' migrations.
 */
export async function migrateUp(
  options: MigrationRunnerOptions = {}
): Promise<MigrationRunResult> {
  const startTime = Date.now();
  const pool = createMigrationPool(options.config);

  try {
    await ensureMigrationsTable(pool);

    const currentVersion = await getCurrentVersion(pool);
    const migrations = await readMigrationFiles('up');

    // Filter to only pending migrations
    const pendingMigrations = migrations.filter((m) => m.version > currentVersion);

    // Apply target version filter
    const targetVersion = options.targetVersion ?? Infinity;
    const migrationsToRun = pendingMigrations.filter((m) => m.version <= targetVersion);

    // Apply max migrations limit
    const limit = options.maxMigrations ?? Infinity;
    const limitedMigrations = migrationsToRun.slice(0, limit);

    if (limitedMigrations.length === 0) {
      return {
        success: true,
        applied: [],
        errors: [],
        totalTime: Date.now() - startTime,
      };
    }

    const results: MigrationResult[] = [];
    const errors: string[] = [];

    for (const migration of limitedMigrations) {
      const result = await runMigration(pool, migration, { dryRun: options.dryRun });
      results.push(result);

      if (!result.success) {
        errors.push(`${migration.filename}: ${result.error}`);
        break; // Stop on first error
      }
    }

    return {
      success: errors.length === 0,
      applied: results,
      errors,
      totalTime: Date.now() - startTime,
    };
  } finally {
    await pool.end();
  }
}

/**
 * Rolls back the last N migrations.
 */
export async function migrateDown(
  options: MigrationRunnerOptions & { steps?: number } = {}
): Promise<MigrationRunResult> {
  const startTime = Date.now();
  const pool = createMigrationPool(options.config);

  try {
    await ensureMigrationsTable(pool);

    const appliedMigrations = await getAppliedMigrations(pool);
    const downMigrations = await readMigrationFiles('down');

    // Get migrations that can be rolled back (have both up applied and down available)
    const upMigrations = appliedMigrations.filter((m) => m.direction === 'up');
    const rollbackCandidates = downMigrations.filter((down) =>
      upMigrations.some((up) => up.migrationName === `${down.baseName}.sql`)
    );

    // Apply target version filter (roll back to but not including targetVersion)
    const targetVersion = options.targetVersion ?? 0;
    const migrationsToRun = rollbackCandidates.filter((m) => m.version > targetVersion);

    // Apply steps limit
    const steps = options.steps ?? options.maxMigrations ?? 1;
    const limitedMigrations = migrationsToRun.slice(0, steps);

    if (limitedMigrations.length === 0) {
      return {
        success: true,
        applied: [],
        errors: [],
        totalTime: Date.now() - startTime,
      };
    }

    const results: MigrationResult[] = [];
    const errors: string[] = [];

    for (const migration of limitedMigrations) {
      const result = await runMigration(pool, migration, { dryRun: options.dryRun });
      results.push(result);

      if (!result.success) {
        errors.push(`${migration.filename}: ${result.error}`);
        break; // Stop on first error
      }
    }

    return {
      success: errors.length === 0,
      applied: results,
      errors,
      totalTime: Date.now() - startTime,
    };
  } finally {
    await pool.end();
  }
}

/**
 * Gets the current migration status.
 */
export async function getMigrationStatus(
  options: { config?: DatabaseConfig } = {}
): Promise<{
  currentVersion: number;
  pendingMigrations: MigrationFile[];
  appliedMigrations: MigrationRecord[];
  availableMigrations: MigrationFile[];
}> {
  const pool = createMigrationPool(options.config);

  try {
    await ensureMigrationsTable(pool);

    const currentVersion = await getCurrentVersion(pool);
    const appliedMigrations = await getAppliedMigrations(pool);
    const availableMigrations = await readMigrationFiles('up');
    const pendingMigrations = availableMigrations.filter((m) => m.version > currentVersion);

    return {
      currentVersion,
      pendingMigrations,
      appliedMigrations,
      availableMigrations,
    };
  } finally {
    await pool.end();
  }
}

/**
 * Resets the database by rolling back all migrations.
 */
export async function migrateReset(
  options: MigrationRunnerOptions = {}
): Promise<MigrationRunResult> {
  return migrateDown({
    ...options,
    steps: Infinity,
    targetVersion: 0,
  });
}

/**
 * Refreshes the database by rolling back all migrations and re-applying them.
 */
export async function migrateRefresh(
  options: MigrationRunnerOptions = {}
): Promise<{
  down: MigrationRunResult;
  up: MigrationRunResult;
}> {
  const down = await migrateReset(options);
  if (!down.success) {
    return { down, up: { success: false, applied: [], errors: ['Rollback failed'], totalTime: 0 } };
  }

  const up = await migrateUp(options);
  return { down, up };
}
