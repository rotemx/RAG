/**
 * Database Module
 *
 * This module exports all database-related functionality for the Israeli Law RAG project.
 * Includes PostgreSQL client, law_chunks operations, topics operations, types, and configuration.
 */

// Types and schemas - Law Chunks
export {
  EmbeddingStatus,
  SectionType,
  LawChunkSchema,
  CreateLawChunkInputSchema,
  UpdateLawChunkInputSchema,
  type LawChunk,
  type LawChunkRow,
  type CreateLawChunkInput,
  type UpdateLawChunkInput,
  type GetLawChunksOptions,
  type BatchOperationResult,
  type LawChunksStats,
  rowToLawChunk,
  generateChunkId,
  parseChunkId,
} from './types.js';

// Types and schemas - Topics
export {
  TopicGenerationMethod,
  TopicSchema,
  CreateTopicInputSchema,
  UpdateTopicInputSchema,
  type Topic,
  type TopicRow,
  type CreateTopicInput,
  type UpdateTopicInput,
  type GetTopicsOptions,
  type TopicsStats,
  rowToTopic,
  generateTopicId,
  parseTopicId,
} from './types.js';

// Types and schemas - LawTopics (Many-to-Many)
export {
  AssignmentMethod,
  LawTopicSchema,
  CreateLawTopicInputSchema,
  UpdateLawTopicInputSchema,
  type LawTopic,
  type LawTopicRow,
  type CreateLawTopicInput,
  type UpdateLawTopicInput,
  type GetLawTopicsOptions,
  type LawTopicsStats,
  type LawTopicWithTopic,
  type LawTopicWithLaw,
  rowToLawTopic,
} from './types.js';

// Types and schemas - Full-Text Search
export {
  type FtsChunkResult,
  type FtsChunkResultRow,
  type FtsLawResult,
  type FtsLawResultRow,
  type FtsTopicResult,
  type FtsTopicResultRow,
  type FuzzyLawResult,
  type FuzzyLawResultRow,
  type FtsSearchOptions,
  type FtsTopicSearchOptions,
  type FuzzySearchOptions,
  type HybridSearchResult,
  rowToFtsChunkResult,
  rowToFtsLawResult,
  rowToFtsTopicResult,
  rowToFuzzyLawResult,
} from './types.js';

// Configuration
export {
  DatabaseConfigSchema,
  type DatabaseConfig,
  loadDatabaseConfig,
  parseDatabaseUrl,
  validateDatabaseEnv,
} from './config.js';

// Client functions
export {
  // Pool management
  createDatabasePool,
  getDatabasePool,
  resetDatabasePool,
  closeDatabasePool,
  getConnection,

  // Law Chunks CRUD operations
  insertLawChunk,
  insertLawChunksBatch,
  getLawChunkByChunkId,
  getLawChunkById,
  getLawChunks,
  getChunksForLaw,
  getPendingChunks,
  updateLawChunk,
  markChunkEmbedded,
  markChunkFailed,
  deleteChunksForLaw,
  deleteLawChunk,

  // Law Chunks stats and utilities
  getLawChunksStats,
  chunkExists,
  searchChunks,
  resetFailedChunks,

  // Topics CRUD operations
  insertTopic,
  insertTopicsBatch,
  getTopicByTopicId,
  getTopicById,
  getTopics,
  getActiveTopics,
  getRootTopics,
  getChildTopics,
  updateTopic,
  markTopicReviewed,
  incrementTopicLawCount,
  deleteTopic,
  deleteAllTopics,

  // Topics stats and utilities
  getTopicsStats,
  topicExists,
  searchTopics,

  // LawTopics CRUD operations (Many-to-Many)
  insertLawTopic,
  insertLawTopicsBatch,
  getLawTopicByIds,
  getLawTopicById,
  getLawTopics,
  getTopicsForLaw,
  getPrimaryTopicForLaw,
  getLawsForTopic,
  getHighRelevanceLawTopics,
  updateLawTopic,
  markLawTopicReviewed,
  setPrimaryTopicForLaw,
  deleteLawTopic,
  deleteTopicsForLaw,
  deleteLawsForTopic,
  deleteAllLawTopics,

  // LawTopics stats and utilities
  getLawTopicsStats,
  lawTopicExists,
  assignTopicsToLaw,
  getTopicLawCounts,

  // Full-Text Search operations
  normalizeSearchQuery,
  buildTsQueryString,
  searchChunksFts,
  searchLawsFts,
  searchTopicsFts,
  searchLawsFuzzy,
  searchLawsCombined,
  searchChunksSimple,
  getFtsStatus,
} from './client.js';

// Migration utilities
export {
  // Types
  type MigrationDirection,
  type MigrationFile,
  type MigrationRecord,
  type MigrationResult,
  type MigrationRunResult,
  type MigrationRunnerOptions,

  // Utility functions
  parseMigrationFilename,
  calculateChecksum,
  getMigrationsDir,
  readMigrationFiles,

  // Pool management for migrations
  createMigrationPool,
  ensureMigrationsTable,

  // Migration status
  getAppliedMigrations,
  getCurrentVersion,
  isMigrationApplied,
  getMigrationStatus,

  // Migration execution
  runMigration,
  migrateUp,
  migrateDown,
  migrateReset,
  migrateRefresh,

  // Migration recording
  recordMigration,
  removeMigrationRecord,
} from './migrations.js';
