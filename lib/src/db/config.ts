/**
 * Database Configuration
 *
 * Configuration for connecting to PostgreSQL database.
 * Reads from environment variables with sensible defaults for local development.
 */

import { z } from 'zod';

/**
 * Database configuration schema with validation
 *
 * NOTE: In production (Vercel), DATABASE_URL must be set as an environment variable.
 * The defaults below are ONLY for local development convenience.
 */
export const DatabaseConfigSchema = z.object({
  /** PostgreSQL host */
  host: z.string().min(1),

  /** PostgreSQL port */
  port: z.number().int().positive().default(5432),

  /** Database user */
  user: z.string().min(1),

  /** Database password */
  password: z.string().min(1),

  /** Database name */
  database: z.string().min(1),

  /** Maximum number of connections in pool */
  maxConnections: z.number().int().positive().default(10),

  /** Connection timeout in milliseconds */
  connectionTimeout: z.number().int().positive().default(30000),

  /** Idle timeout in milliseconds (0 to disable) */
  idleTimeout: z.number().int().nonnegative().default(10000),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

/**
 * Default database configuration for local development ONLY.
 * In production, DATABASE_URL environment variable MUST be set.
 */
const LOCAL_DEV_DEFAULTS = {
  host: 'localhost',
  port: 5432,
  user: 'scraper',
  password: 'scraper123',
  database: 'knesset_laws',
} as const;

/**
 * Loads database configuration from environment variables.
 *
 * Environment variables:
 * - DATABASE_URL: Full connection URL (takes precedence if set) - REQUIRED in production
 * - DB_HOST: PostgreSQL host (local dev default: localhost)
 * - DB_PORT: PostgreSQL port (default: 5432)
 * - DB_USER: Database user (local dev default: scraper)
 * - DB_PASSWORD: Database password (local dev default: scraper123)
 * - DB_NAME: Database name (local dev default: knesset_laws)
 * - DB_MAX_CONNECTIONS: Max pool connections (default: 10)
 *
 * @returns Validated database configuration
 * @throws {Error} In production (NODE_ENV=production) if DATABASE_URL is not set
 */
export function loadDatabaseConfig(): DatabaseConfig {
  const isProduction = process.env['NODE_ENV'] === 'production';

  // In production, require DATABASE_URL to prevent using local dev defaults
  if (isProduction && !process.env['DATABASE_URL']) {
    throw new Error('DATABASE_URL environment variable is required in production');
  }

  // If DATABASE_URL is set, parse it (takes precedence)
  if (process.env['DATABASE_URL']) {
    const urlConfig = parseDatabaseUrl(process.env['DATABASE_URL']);
    return DatabaseConfigSchema.parse({
      ...urlConfig,
      maxConnections: process.env['DB_MAX_CONNECTIONS']
        ? parseInt(process.env['DB_MAX_CONNECTIONS'], 10)
        : 10,
      connectionTimeout: 30000,
      idleTimeout: 10000,
    });
  }

  // Local development: use individual env vars with local defaults
  const rawConfig = {
    host: process.env['DB_HOST'] ?? LOCAL_DEV_DEFAULTS.host,
    port: process.env['DB_PORT']
      ? parseInt(process.env['DB_PORT'], 10)
      : LOCAL_DEV_DEFAULTS.port,
    user: process.env['DB_USER'] ?? LOCAL_DEV_DEFAULTS.user,
    password: process.env['DB_PASSWORD'] ?? LOCAL_DEV_DEFAULTS.password,
    database: process.env['DB_NAME'] ?? LOCAL_DEV_DEFAULTS.database,
    maxConnections: process.env['DB_MAX_CONNECTIONS']
      ? parseInt(process.env['DB_MAX_CONNECTIONS'], 10)
      : 10,
    connectionTimeout: 30000,
    idleTimeout: 10000,
  };

  return DatabaseConfigSchema.parse(rawConfig);
}

/**
 * Parses a DATABASE_URL connection string into DatabaseConfig
 * Format: postgresql://user:password@host:port/database
 */
export function parseDatabaseUrl(url: string): Partial<DatabaseConfig> {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '5432', 10),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.slice(1), // Remove leading '/'
    };
  } catch {
    // SECURITY: Don't expose the full URL in error messages as it contains credentials
    throw new Error('Invalid DATABASE_URL format. Expected: postgresql://user:password@host:port/database');
  }
}

/**
 * Validates database environment variables.
 * In production, DATABASE_URL is required.
 */
export function validateDatabaseEnv(): {
  isValid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  const isProduction = process.env['NODE_ENV'] === 'production';

  // In production, DATABASE_URL is required
  if (isProduction && !process.env['DATABASE_URL']) {
    errors.push('DATABASE_URL is required in production');
  }

  // Check if using local dev defaults (warn outside production)
  if (!isProduction && !process.env['DATABASE_URL'] && !process.env['DB_HOST']) {
    warnings.push('Using local development database defaults - set DATABASE_URL for other environments');
  }

  // Validate port if provided
  if (process.env['DB_PORT']) {
    const port = parseInt(process.env['DB_PORT'], 10);
    if (isNaN(port) || port <= 0 || port > 65535) {
      errors.push('DB_PORT must be a valid port number (1-65535)');
    }
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  };
}
