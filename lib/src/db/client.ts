/**
 * Database Client
 *
 * PostgreSQL client wrapper for the Israeli Law RAG project.
 * Provides connection pooling and CRUD operations for law_chunks table.
 */

import pg from 'pg';

import { loadDatabaseConfig, type DatabaseConfig } from './config.js';
import {
  type LawChunk,
  type LawChunkRow,
  type CreateLawChunkInput,
  type UpdateLawChunkInput,
  type GetLawChunksOptions,
  type BatchOperationResult,
  type LawChunksStats,
  rowToLawChunk,
  EmbeddingStatus,
  type Topic,
  type TopicRow,
  type CreateTopicInput,
  type UpdateTopicInput,
  type GetTopicsOptions,
  type TopicsStats,
  rowToTopic,
  TopicGenerationMethod,
  type LawTopic,
  type LawTopicRow,
  type CreateLawTopicInput,
  type UpdateLawTopicInput,
  type GetLawTopicsOptions,
  type LawTopicsStats,
  rowToLawTopic,
  AssignmentMethod,
  // Full-text search types
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
  rowToFtsChunkResult,
  rowToFtsLawResult,
  rowToFtsTopicResult,
  rowToFuzzyLawResult,
  // Query log types
  type QueryLog,
  type QueryLogRow,
  type CreateQueryLogInput,
  type UpdateQueryLogInput,
  type GetQueryLogsOptions,
  type QueryLogsStats,
  type HourlyQueryCount,
  type TopQuery,
  type ProviderStats,
  rowToQueryLog,
  QueryStatus,
  QuerySource,
} from './types.js';

const { Pool } = pg;
type PoolType = InstanceType<typeof Pool>;
type PoolClient = pg.PoolClient;

/** Singleton pool instance */
let poolInstance: PoolType | null = null;

/**
 * Creates a new database pool with the provided configuration.
 */
export function createDatabasePool(config: DatabaseConfig): PoolType {
  return new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    max: config.maxConnections,
    connectionTimeoutMillis: config.connectionTimeout,
    idleTimeoutMillis: config.idleTimeout,
  });
}

/**
 * Gets or creates a singleton database pool instance.
 */
export function getDatabasePool(): PoolType {
  if (poolInstance) {
    return poolInstance;
  }

  const config = loadDatabaseConfig();
  poolInstance = createDatabasePool(config);
  return poolInstance;
}

/**
 * Resets the singleton pool instance.
 */
export function resetDatabasePool(): void {
  poolInstance = null;
}

/**
 * Closes the database pool gracefully.
 */
export async function closeDatabasePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}

/**
 * Gets a client connection from the pool.
 */
export async function getConnection(): Promise<PoolClient> {
  const pool = getDatabasePool();
  return pool.connect();
}

// ============================================================================
// Law Chunks CRUD Operations
// ============================================================================

/**
 * Inserts a new law chunk into the database.
 *
 * @param chunk - The chunk data to insert
 * @returns The inserted chunk with generated fields
 */
export async function insertLawChunk(chunk: CreateLawChunkInput): Promise<LawChunk> {
  const pool = getDatabasePool();

  const query = `
    INSERT INTO law_chunks (
      chunk_id, law_id, law_item_id, chunk_index, content,
      token_count, char_count, start_position, end_position,
      section_title, section_type, section_number,
      has_overlap_before, has_overlap_after,
      embedding_status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *
  `;

  const values = [
    chunk.chunkId,
    chunk.lawId,
    chunk.lawItemId,
    chunk.chunkIndex,
    chunk.content,
    chunk.tokenCount ?? null,
    chunk.charCount,
    chunk.startPosition ?? null,
    chunk.endPosition ?? null,
    chunk.sectionTitle ?? null,
    chunk.sectionType ?? null,
    chunk.sectionNumber ?? null,
    chunk.hasOverlapBefore ?? false,
    chunk.hasOverlapAfter ?? false,
    chunk.embeddingStatus ?? EmbeddingStatus.PENDING,
  ];

  const result = await pool.query<LawChunkRow>(query, values);
  const row = result.rows[0];
  if (!row) {
    throw new Error('Failed to insert law chunk - no row returned');
  }
  return rowToLawChunk(row);
}

/**
 * Inserts multiple law chunks in a single transaction.
 *
 * @param chunks - Array of chunks to insert
 * @returns Batch operation result with success/failure counts
 */
export async function insertLawChunksBatch(
  chunks: CreateLawChunkInput[]
): Promise<BatchOperationResult> {
  const pool = getDatabasePool();
  const client = await pool.connect();

  const result: BatchOperationResult = {
    success: 0,
    failed: 0,
    errors: [],
  };

  try {
    await client.query('BEGIN');

    for (const chunk of chunks) {
      try {
        const query = `
          INSERT INTO law_chunks (
            chunk_id, law_id, law_item_id, chunk_index, content,
            token_count, char_count, start_position, end_position,
            section_title, section_type, section_number,
            has_overlap_before, has_overlap_after,
            embedding_status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT (chunk_id) DO NOTHING
        `;

        const values = [
          chunk.chunkId,
          chunk.lawId,
          chunk.lawItemId,
          chunk.chunkIndex,
          chunk.content,
          chunk.tokenCount ?? null,
          chunk.charCount,
          chunk.startPosition ?? null,
          chunk.endPosition ?? null,
          chunk.sectionTitle ?? null,
          chunk.sectionType ?? null,
          chunk.sectionNumber ?? null,
          chunk.hasOverlapBefore ?? false,
          chunk.hasOverlapAfter ?? false,
          chunk.embeddingStatus ?? EmbeddingStatus.PENDING,
        ];

        await client.query(query, values);
        result.success++;
      } catch (error) {
        result.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Chunk ${chunk.chunkId}: ${errorMessage}`);
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return result;
}

/**
 * Retrieves a law chunk by its chunk_id.
 */
export async function getLawChunkByChunkId(chunkId: string): Promise<LawChunk | null> {
  const pool = getDatabasePool();

  const result = await pool.query<LawChunkRow>(
    'SELECT * FROM law_chunks WHERE chunk_id = $1',
    [chunkId]
  );

  const row = result.rows[0];
  return row ? rowToLawChunk(row) : null;
}

/**
 * Retrieves a law chunk by its database ID.
 */
export async function getLawChunkById(id: number): Promise<LawChunk | null> {
  const pool = getDatabasePool();

  const result = await pool.query<LawChunkRow>(
    'SELECT * FROM law_chunks WHERE id = $1',
    [id]
  );

  const row = result.rows[0];
  return row ? rowToLawChunk(row) : null;
}

/** Allowed order by columns for law chunks to prevent SQL injection */
const ALLOWED_LAW_CHUNKS_ORDER_BY = new Set(['chunk_index', 'created_at', 'updated_at']);

/** Allowed order directions to prevent SQL injection */
const ALLOWED_ORDER_DIRECTIONS = new Set(['ASC', 'DESC']);

/**
 * Retrieves law chunks with optional filtering and pagination.
 */
export async function getLawChunks(options: GetLawChunksOptions = {}): Promise<LawChunk[]> {
  const pool = getDatabasePool();

  const conditions: string[] = [];
  const values: (string | number)[] = [];
  let paramIndex = 1;

  if (options.lawId !== undefined) {
    conditions.push(`law_id = $${paramIndex++}`);
    values.push(options.lawId);
  }

  if (options.lawItemId !== undefined) {
    conditions.push(`law_item_id = $${paramIndex++}`);
    values.push(options.lawItemId);
  }

  if (options.embeddingStatus !== undefined) {
    conditions.push(`embedding_status = $${paramIndex++}`);
    values.push(options.embeddingStatus);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Validate orderBy to prevent SQL injection
  const orderBy = options.orderBy ?? 'chunk_index';
  if (!ALLOWED_LAW_CHUNKS_ORDER_BY.has(orderBy)) {
    throw new Error(`Invalid orderBy column: ${orderBy}`);
  }

  // Validate orderDirection to prevent SQL injection
  const orderDirection = options.orderDirection ?? 'ASC';
  if (!ALLOWED_ORDER_DIRECTIONS.has(orderDirection)) {
    throw new Error(`Invalid orderDirection: ${orderDirection}`);
  }

  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const query = `
    SELECT * FROM law_chunks
    ${whereClause}
    ORDER BY ${orderBy} ${orderDirection}
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `;

  values.push(limit, offset);

  const result = await pool.query<LawChunkRow>(query, values);
  return result.rows.map(rowToLawChunk);
}

/**
 * Retrieves all chunks for a specific law, ordered by chunk index.
 */
export async function getChunksForLaw(lawItemId: string): Promise<LawChunk[]> {
  return getLawChunks({
    lawItemId,
    orderBy: 'chunk_index',
    orderDirection: 'ASC',
    limit: 10000, // High limit to get all chunks
  });
}

/**
 * Retrieves chunks that are pending embedding.
 */
export async function getPendingChunks(limit: number = 100): Promise<LawChunk[]> {
  return getLawChunks({
    embeddingStatus: EmbeddingStatus.PENDING,
    orderBy: 'created_at',
    orderDirection: 'ASC',
    limit,
  });
}

/**
 * Updates a law chunk's embedding-related fields.
 */
export async function updateLawChunk(
  chunkId: string,
  update: UpdateLawChunkInput
): Promise<LawChunk | null> {
  const pool = getDatabasePool();

  const setClauses: string[] = [];
  const values: (string | Date | null)[] = [];
  let paramIndex = 1;

  if (update.qdrantPointId !== undefined) {
    setClauses.push(`qdrant_point_id = $${paramIndex++}`);
    values.push(update.qdrantPointId ?? null);
  }

  if (update.embeddingStatus !== undefined) {
    setClauses.push(`embedding_status = $${paramIndex++}`);
    values.push(update.embeddingStatus);
  }

  if (update.embeddingError !== undefined) {
    setClauses.push(`embedding_error = $${paramIndex++}`);
    values.push(update.embeddingError ?? null);
  }

  if (update.embeddedAt !== undefined) {
    setClauses.push(`embedded_at = $${paramIndex++}`);
    values.push(update.embeddedAt ?? null);
  }

  if (setClauses.length === 0) {
    // No updates to make, just return current chunk
    return getLawChunkByChunkId(chunkId);
  }

  values.push(chunkId);

  const query = `
    UPDATE law_chunks
    SET ${setClauses.join(', ')}
    WHERE chunk_id = $${paramIndex}
    RETURNING *
  `;

  const result = await pool.query<LawChunkRow>(query, values);
  const row = result.rows[0];
  return row ? rowToLawChunk(row) : null;
}

/**
 * Marks a chunk as successfully embedded.
 */
export async function markChunkEmbedded(
  chunkId: string,
  qdrantPointId: string
): Promise<LawChunk | null> {
  return updateLawChunk(chunkId, {
    qdrantPointId,
    embeddingStatus: EmbeddingStatus.COMPLETED,
    embeddedAt: new Date(),
    embeddingError: null,
  });
}

/**
 * Marks a chunk as failed embedding.
 */
export async function markChunkFailed(
  chunkId: string,
  error: string
): Promise<LawChunk | null> {
  return updateLawChunk(chunkId, {
    embeddingStatus: EmbeddingStatus.FAILED,
    embeddingError: error,
  });
}

/**
 * Deletes all chunks for a specific law.
 */
export async function deleteChunksForLaw(lawItemId: string): Promise<number> {
  const pool = getDatabasePool();

  const result = await pool.query(
    'DELETE FROM law_chunks WHERE law_item_id = $1',
    [lawItemId]
  );

  return result.rowCount ?? 0;
}

/**
 * Deletes a specific chunk by chunk_id.
 */
export async function deleteLawChunk(chunkId: string): Promise<boolean> {
  const pool = getDatabasePool();

  const result = await pool.query(
    'DELETE FROM law_chunks WHERE chunk_id = $1',
    [chunkId]
  );

  return (result.rowCount ?? 0) > 0;
}

/**
 * Gets statistics about law chunks.
 */
export async function getLawChunksStats(): Promise<LawChunksStats> {
  const pool = getDatabasePool();

  const statsQuery = `
    SELECT
      COUNT(*) as total_chunks,
      COUNT(*) FILTER (WHERE embedding_status = 'pending') as pending_embedding,
      COUNT(*) FILTER (WHERE embedding_status = 'completed') as completed_embedding,
      COUNT(*) FILTER (WHERE embedding_status = 'failed') as failed_embedding,
      COUNT(DISTINCT law_item_id) as unique_laws,
      COALESCE(SUM(char_count), 0) as total_characters
    FROM law_chunks
  `;

  const result = await pool.query<{
    total_chunks: string;
    pending_embedding: string;
    completed_embedding: string;
    failed_embedding: string;
    unique_laws: string;
    total_characters: string;
  }>(statsQuery);

  const row = result.rows[0];
  if (!row) {
    return {
      totalChunks: 0,
      pendingEmbedding: 0,
      completedEmbedding: 0,
      failedEmbedding: 0,
      uniqueLaws: 0,
      avgChunksPerLaw: 0,
      totalCharacters: 0,
    };
  }

  const totalChunks = parseInt(row.total_chunks, 10);
  const uniqueLaws = parseInt(row.unique_laws, 10);

  return {
    totalChunks,
    pendingEmbedding: parseInt(row.pending_embedding, 10),
    completedEmbedding: parseInt(row.completed_embedding, 10),
    failedEmbedding: parseInt(row.failed_embedding, 10),
    uniqueLaws,
    avgChunksPerLaw: uniqueLaws > 0 ? totalChunks / uniqueLaws : 0,
    totalCharacters: parseInt(row.total_characters, 10),
  };
}

/**
 * Checks if a chunk with the given chunk_id exists.
 */
export async function chunkExists(chunkId: string): Promise<boolean> {
  const pool = getDatabasePool();

  const result = await pool.query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM law_chunks WHERE chunk_id = $1) as exists',
    [chunkId]
  );

  return result.rows[0]?.exists ?? false;
}

/**
 * Performs full-text search on chunk content.
 *
 * @param searchQuery - The search query (will be processed for tsquery)
 * @param limit - Maximum number of results
 * @returns Chunks matching the search query, ordered by relevance
 */
export async function searchChunks(
  searchQuery: string,
  limit: number = 20
): Promise<LawChunk[]> {
  const pool = getDatabasePool();

  // Convert search query to tsquery format (simple Hebrew tokenization)
  // Replace spaces with & for AND matching
  const tsQuery = searchQuery
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .join(' & ');

  const query = `
    SELECT *,
           ts_rank(to_tsvector('simple', content), to_tsquery('simple', $1)) as rank
    FROM law_chunks
    WHERE to_tsvector('simple', content) @@ to_tsquery('simple', $1)
    ORDER BY rank DESC
    LIMIT $2
  `;

  const result = await pool.query<LawChunkRow & { rank: number }>(query, [tsQuery, limit]);
  return result.rows.map(rowToLawChunk);
}

/**
 * Resets all failed chunks back to pending status for retry.
 */
export async function resetFailedChunks(): Promise<number> {
  const pool = getDatabasePool();

  const result = await pool.query(`
    UPDATE law_chunks
    SET embedding_status = 'pending',
        embedding_error = NULL
    WHERE embedding_status = 'failed'
  `);

  return result.rowCount ?? 0;
}

// ============================================================================
// Topics CRUD Operations
// ============================================================================

/**
 * Inserts a new topic into the database.
 *
 * @param topic - The topic data to insert
 * @returns The inserted topic with generated fields
 */
export async function insertTopic(topic: CreateTopicInput): Promise<Topic> {
  const pool = getDatabasePool();

  const query = `
    INSERT INTO topics (
      topic_id, name_he, name_en, description_he, description_en,
      keywords_he, keywords_en, representative_law_ids, centroid_embedding_ref,
      law_count, cluster_quality_score, generation_method, clustering_algorithm,
      llm_model, parent_topic_id, depth_level, display_order,
      is_active, is_reviewed, reviewed_at, reviewed_by, version
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
    RETURNING *
  `;

  const values = [
    topic.topicId,
    topic.nameHe,
    topic.nameEn ?? null,
    topic.descriptionHe ?? null,
    topic.descriptionEn ?? null,
    topic.keywordsHe ?? null,
    topic.keywordsEn ?? null,
    topic.representativeLawIds ?? null,
    topic.centroidEmbeddingRef ?? null,
    topic.lawCount ?? 0,
    topic.clusterQualityScore ?? null,
    topic.generationMethod ?? TopicGenerationMethod.CLUSTERING,
    topic.clusteringAlgorithm ?? null,
    topic.llmModel ?? null,
    topic.parentTopicId ?? null,
    topic.depthLevel ?? 0,
    topic.displayOrder ?? 0,
    topic.isActive ?? true,
    topic.isReviewed ?? false,
    topic.reviewedAt ?? null,
    topic.reviewedBy ?? null,
    topic.version ?? 1,
  ];

  const result = await pool.query<TopicRow>(query, values);
  const row = result.rows[0];
  if (!row) {
    throw new Error('Failed to insert topic - no row returned');
  }
  return rowToTopic(row);
}

/**
 * Inserts multiple topics in a single transaction.
 *
 * @param topics - Array of topics to insert
 * @returns Batch operation result with success/failure counts
 */
export async function insertTopicsBatch(
  topics: CreateTopicInput[]
): Promise<BatchOperationResult> {
  const pool = getDatabasePool();
  const client = await pool.connect();

  const result: BatchOperationResult = {
    success: 0,
    failed: 0,
    errors: [],
  };

  try {
    await client.query('BEGIN');

    for (const topic of topics) {
      try {
        const query = `
          INSERT INTO topics (
            topic_id, name_he, name_en, description_he, description_en,
            keywords_he, keywords_en, representative_law_ids, centroid_embedding_ref,
            law_count, cluster_quality_score, generation_method, clustering_algorithm,
            llm_model, parent_topic_id, depth_level, display_order,
            is_active, is_reviewed, reviewed_at, reviewed_by, version
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
          ON CONFLICT (topic_id) DO NOTHING
        `;

        const values = [
          topic.topicId,
          topic.nameHe,
          topic.nameEn ?? null,
          topic.descriptionHe ?? null,
          topic.descriptionEn ?? null,
          topic.keywordsHe ?? null,
          topic.keywordsEn ?? null,
          topic.representativeLawIds ?? null,
          topic.centroidEmbeddingRef ?? null,
          topic.lawCount ?? 0,
          topic.clusterQualityScore ?? null,
          topic.generationMethod ?? TopicGenerationMethod.CLUSTERING,
          topic.clusteringAlgorithm ?? null,
          topic.llmModel ?? null,
          topic.parentTopicId ?? null,
          topic.depthLevel ?? 0,
          topic.displayOrder ?? 0,
          topic.isActive ?? true,
          topic.isReviewed ?? false,
          topic.reviewedAt ?? null,
          topic.reviewedBy ?? null,
          topic.version ?? 1,
        ];

        await client.query(query, values);
        result.success++;
      } catch (error) {
        result.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Topic ${topic.topicId}: ${errorMessage}`);
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return result;
}

/**
 * Retrieves a topic by its topic_id.
 */
export async function getTopicByTopicId(topicId: string): Promise<Topic | null> {
  const pool = getDatabasePool();

  const result = await pool.query<TopicRow>(
    'SELECT * FROM topics WHERE topic_id = $1',
    [topicId]
  );

  const row = result.rows[0];
  return row ? rowToTopic(row) : null;
}

/**
 * Retrieves a topic by its database ID.
 */
export async function getTopicById(id: number): Promise<Topic | null> {
  const pool = getDatabasePool();

  const result = await pool.query<TopicRow>(
    'SELECT * FROM topics WHERE id = $1',
    [id]
  );

  const row = result.rows[0];
  return row ? rowToTopic(row) : null;
}

/** Allowed order by columns for topics to prevent SQL injection */
const ALLOWED_TOPICS_ORDER_BY = new Set(['display_order', 'law_count', 'name_he', 'created_at', 'updated_at']);

/**
 * Retrieves topics with optional filtering and pagination.
 */
export async function getTopics(options: GetTopicsOptions = {}): Promise<Topic[]> {
  const pool = getDatabasePool();

  const conditions: string[] = [];
  const values: (string | number | boolean | null)[] = [];
  let paramIndex = 1;

  // Special handling for parentTopicId - null means root topics
  if (options.parentTopicId === null) {
    conditions.push('parent_topic_id IS NULL');
  } else if (options.parentTopicId !== undefined) {
    conditions.push(`parent_topic_id = $${paramIndex++}`);
    values.push(options.parentTopicId);
  }

  if (options.isActive !== undefined) {
    conditions.push(`is_active = $${paramIndex++}`);
    values.push(options.isActive);
  }

  if (options.isReviewed !== undefined) {
    conditions.push(`is_reviewed = $${paramIndex++}`);
    values.push(options.isReviewed);
  }

  if (options.generationMethod !== undefined) {
    conditions.push(`generation_method = $${paramIndex++}`);
    values.push(options.generationMethod);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Validate orderBy to prevent SQL injection
  const orderBy = options.orderBy ?? 'display_order';
  if (!ALLOWED_TOPICS_ORDER_BY.has(orderBy)) {
    throw new Error(`Invalid orderBy column: ${orderBy}`);
  }

  // Validate orderDirection to prevent SQL injection
  const orderDirection = options.orderDirection ?? 'ASC';
  if (!ALLOWED_ORDER_DIRECTIONS.has(orderDirection)) {
    throw new Error(`Invalid orderDirection: ${orderDirection}`);
  }

  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const query = `
    SELECT * FROM topics
    ${whereClause}
    ORDER BY ${orderBy} ${orderDirection}
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `;

  values.push(limit, offset);

  const result = await pool.query<TopicRow>(query, values);
  return result.rows.map(rowToTopic);
}

/**
 * Retrieves all active topics ordered by display order.
 */
export async function getActiveTopics(): Promise<Topic[]> {
  return getTopics({
    isActive: true,
    orderBy: 'display_order',
    orderDirection: 'ASC',
    limit: 1000,
  });
}

/**
 * Retrieves root-level topics (no parent).
 */
export async function getRootTopics(): Promise<Topic[]> {
  return getTopics({
    parentTopicId: null,
    isActive: true,
    orderBy: 'display_order',
    orderDirection: 'ASC',
    limit: 1000,
  });
}

/**
 * Retrieves child topics for a given parent topic.
 */
export async function getChildTopics(parentTopicId: number): Promise<Topic[]> {
  return getTopics({
    parentTopicId,
    isActive: true,
    orderBy: 'display_order',
    orderDirection: 'ASC',
    limit: 1000,
  });
}

/**
 * Updates a topic's fields.
 */
export async function updateTopic(
  topicId: string,
  update: UpdateTopicInput
): Promise<Topic | null> {
  const pool = getDatabasePool();

  const setClauses: string[] = [];
  const values: (string | number | boolean | string[] | Date | null)[] = [];
  let paramIndex = 1;

  if (update.nameHe !== undefined) {
    setClauses.push(`name_he = $${paramIndex++}`);
    values.push(update.nameHe);
  }

  if (update.nameEn !== undefined) {
    setClauses.push(`name_en = $${paramIndex++}`);
    values.push(update.nameEn ?? null);
  }

  if (update.descriptionHe !== undefined) {
    setClauses.push(`description_he = $${paramIndex++}`);
    values.push(update.descriptionHe ?? null);
  }

  if (update.descriptionEn !== undefined) {
    setClauses.push(`description_en = $${paramIndex++}`);
    values.push(update.descriptionEn ?? null);
  }

  if (update.keywordsHe !== undefined) {
    setClauses.push(`keywords_he = $${paramIndex++}`);
    values.push(update.keywordsHe ?? null);
  }

  if (update.keywordsEn !== undefined) {
    setClauses.push(`keywords_en = $${paramIndex++}`);
    values.push(update.keywordsEn ?? null);
  }

  if (update.representativeLawIds !== undefined) {
    setClauses.push(`representative_law_ids = $${paramIndex++}`);
    values.push(update.representativeLawIds ?? null);
  }

  if (update.centroidEmbeddingRef !== undefined) {
    setClauses.push(`centroid_embedding_ref = $${paramIndex++}`);
    values.push(update.centroidEmbeddingRef ?? null);
  }

  if (update.lawCount !== undefined) {
    setClauses.push(`law_count = $${paramIndex++}`);
    values.push(update.lawCount);
  }

  if (update.clusterQualityScore !== undefined) {
    setClauses.push(`cluster_quality_score = $${paramIndex++}`);
    values.push(update.clusterQualityScore ?? null);
  }

  if (update.parentTopicId !== undefined) {
    setClauses.push(`parent_topic_id = $${paramIndex++}`);
    values.push(update.parentTopicId ?? null);
  }

  if (update.depthLevel !== undefined) {
    setClauses.push(`depth_level = $${paramIndex++}`);
    values.push(update.depthLevel);
  }

  if (update.displayOrder !== undefined) {
    setClauses.push(`display_order = $${paramIndex++}`);
    values.push(update.displayOrder);
  }

  if (update.isActive !== undefined) {
    setClauses.push(`is_active = $${paramIndex++}`);
    values.push(update.isActive);
  }

  if (update.isReviewed !== undefined) {
    setClauses.push(`is_reviewed = $${paramIndex++}`);
    values.push(update.isReviewed);
  }

  if (update.reviewedAt !== undefined) {
    setClauses.push(`reviewed_at = $${paramIndex++}`);
    values.push(update.reviewedAt ?? null);
  }

  if (update.reviewedBy !== undefined) {
    setClauses.push(`reviewed_by = $${paramIndex++}`);
    values.push(update.reviewedBy ?? null);
  }

  if (setClauses.length === 0) {
    // No updates to make, just return current topic
    return getTopicByTopicId(topicId);
  }

  values.push(topicId);

  const query = `
    UPDATE topics
    SET ${setClauses.join(', ')}
    WHERE topic_id = $${paramIndex}
    RETURNING *
  `;

  const result = await pool.query<TopicRow>(query, values);
  const row = result.rows[0];
  return row ? rowToTopic(row) : null;
}

/**
 * Marks a topic as reviewed.
 */
export async function markTopicReviewed(
  topicId: string,
  reviewedBy: string
): Promise<Topic | null> {
  return updateTopic(topicId, {
    isReviewed: true,
    reviewedAt: new Date(),
    reviewedBy,
  });
}

/**
 * Increments the law count for a topic.
 */
export async function incrementTopicLawCount(
  topicId: string,
  increment: number = 1
): Promise<Topic | null> {
  const pool = getDatabasePool();

  const result = await pool.query<TopicRow>(
    `UPDATE topics SET law_count = law_count + $1 WHERE topic_id = $2 RETURNING *`,
    [increment, topicId]
  );

  const row = result.rows[0];
  return row ? rowToTopic(row) : null;
}

/**
 * Deletes a topic by topic_id.
 */
export async function deleteTopic(topicId: string): Promise<boolean> {
  const pool = getDatabasePool();

  const result = await pool.query(
    'DELETE FROM topics WHERE topic_id = $1',
    [topicId]
  );

  return (result.rowCount ?? 0) > 0;
}

/**
 * Deletes all topics (useful for regeneration).
 */
export async function deleteAllTopics(): Promise<number> {
  const pool = getDatabasePool();

  const result = await pool.query('DELETE FROM topics');

  return result.rowCount ?? 0;
}

/**
 * Gets statistics about topics.
 */
export async function getTopicsStats(): Promise<TopicsStats> {
  const pool = getDatabasePool();

  const statsQuery = `
    SELECT
      COUNT(*) as total_topics,
      COUNT(*) FILTER (WHERE is_active = TRUE) as active_topics,
      COUNT(*) FILTER (WHERE is_reviewed = TRUE) as reviewed_topics,
      COUNT(*) FILTER (WHERE parent_topic_id IS NULL) as root_topics,
      COALESCE(SUM(law_count), 0) as total_laws_assigned,
      AVG(cluster_quality_score) as avg_cluster_quality
    FROM topics
  `;

  const result = await pool.query<{
    total_topics: string;
    active_topics: string;
    reviewed_topics: string;
    root_topics: string;
    total_laws_assigned: string;
    avg_cluster_quality: string | null;
  }>(statsQuery);

  const row = result.rows[0];
  if (!row) {
    return {
      totalTopics: 0,
      activeTopics: 0,
      reviewedTopics: 0,
      rootTopics: 0,
      totalLawsAssigned: 0,
      avgLawsPerTopic: 0,
      avgClusterQuality: null,
    };
  }

  const totalTopics = parseInt(row.total_topics, 10);
  const totalLawsAssigned = parseInt(row.total_laws_assigned, 10);

  return {
    totalTopics,
    activeTopics: parseInt(row.active_topics, 10),
    reviewedTopics: parseInt(row.reviewed_topics, 10),
    rootTopics: parseInt(row.root_topics, 10),
    totalLawsAssigned,
    avgLawsPerTopic: totalTopics > 0 ? totalLawsAssigned / totalTopics : 0,
    avgClusterQuality: row.avg_cluster_quality ? parseFloat(row.avg_cluster_quality) : null,
  };
}

/**
 * Checks if a topic with the given topic_id exists.
 */
export async function topicExists(topicId: string): Promise<boolean> {
  const pool = getDatabasePool();

  const result = await pool.query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM topics WHERE topic_id = $1) as exists',
    [topicId]
  );

  return result.rows[0]?.exists ?? false;
}

/**
 * Searches topics by name or keywords.
 *
 * @param searchQuery - The search query
 * @param limit - Maximum number of results
 * @returns Topics matching the search query
 */
export async function searchTopics(
  searchQuery: string,
  limit: number = 20
): Promise<Topic[]> {
  const pool = getDatabasePool();

  // Search in name and keywords
  const query = `
    SELECT *
    FROM topics
    WHERE is_active = TRUE
      AND (
        name_he ILIKE $1
        OR name_en ILIKE $1
        OR $2 = ANY(keywords_he)
        OR $2 = ANY(keywords_en)
      )
    ORDER BY law_count DESC
    LIMIT $3
  `;

  const searchPattern = `%${searchQuery}%`;
  const result = await pool.query<TopicRow>(query, [searchPattern, searchQuery, limit]);
  return result.rows.map(rowToTopic);
}

// ============================================================================
// LawTopics CRUD Operations (Many-to-Many Junction Table)
// ============================================================================

/**
 * Inserts a new law-topic relationship into the database.
 *
 * @param lawTopic - The law-topic data to insert
 * @returns The inserted law-topic with generated fields
 */
export async function insertLawTopic(lawTopic: CreateLawTopicInput): Promise<LawTopic> {
  const pool = getDatabasePool();

  const query = `
    INSERT INTO law_topics (
      law_id, topic_id, relevance_score, topic_rank, is_primary,
      assignment_method, assignment_confidence, is_reviewed, reviewed_at, reviewed_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `;

  const values = [
    lawTopic.lawId,
    lawTopic.topicId,
    lawTopic.relevanceScore ?? 1.0,
    lawTopic.topicRank ?? 1,
    lawTopic.isPrimary ?? false,
    lawTopic.assignmentMethod ?? AssignmentMethod.CLUSTERING,
    lawTopic.assignmentConfidence ?? null,
    lawTopic.isReviewed ?? false,
    lawTopic.reviewedAt ?? null,
    lawTopic.reviewedBy ?? null,
  ];

  const result = await pool.query<LawTopicRow>(query, values);
  const row = result.rows[0];
  if (!row) {
    throw new Error('Failed to insert law-topic relationship - no row returned');
  }
  return rowToLawTopic(row);
}

/**
 * Inserts multiple law-topic relationships in a single transaction.
 *
 * @param lawTopics - Array of law-topics to insert
 * @returns Batch operation result with success/failure counts
 */
export async function insertLawTopicsBatch(
  lawTopics: CreateLawTopicInput[]
): Promise<BatchOperationResult> {
  const pool = getDatabasePool();
  const client = await pool.connect();

  const result: BatchOperationResult = {
    success: 0,
    failed: 0,
    errors: [],
  };

  try {
    await client.query('BEGIN');

    for (const lawTopic of lawTopics) {
      try {
        const query = `
          INSERT INTO law_topics (
            law_id, topic_id, relevance_score, topic_rank, is_primary,
            assignment_method, assignment_confidence, is_reviewed, reviewed_at, reviewed_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (law_id, topic_id) DO NOTHING
        `;

        const values = [
          lawTopic.lawId,
          lawTopic.topicId,
          lawTopic.relevanceScore ?? 1.0,
          lawTopic.topicRank ?? 1,
          lawTopic.isPrimary ?? false,
          lawTopic.assignmentMethod ?? AssignmentMethod.CLUSTERING,
          lawTopic.assignmentConfidence ?? null,
          lawTopic.isReviewed ?? false,
          lawTopic.reviewedAt ?? null,
          lawTopic.reviewedBy ?? null,
        ];

        await client.query(query, values);
        result.success++;
      } catch (error) {
        result.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`LawTopic ${lawTopic.lawId}-${lawTopic.topicId}: ${errorMessage}`);
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return result;
}

/**
 * Retrieves a law-topic relationship by law_id and topic_id.
 */
export async function getLawTopicByIds(lawId: number, topicId: number): Promise<LawTopic | null> {
  const pool = getDatabasePool();

  const result = await pool.query<LawTopicRow>(
    'SELECT * FROM law_topics WHERE law_id = $1 AND topic_id = $2',
    [lawId, topicId]
  );

  const row = result.rows[0];
  return row ? rowToLawTopic(row) : null;
}

/**
 * Retrieves a law-topic relationship by its database ID.
 */
export async function getLawTopicById(id: number): Promise<LawTopic | null> {
  const pool = getDatabasePool();

  const result = await pool.query<LawTopicRow>(
    'SELECT * FROM law_topics WHERE id = $1',
    [id]
  );

  const row = result.rows[0];
  return row ? rowToLawTopic(row) : null;
}

/** Allowed order by columns for law_topics to prevent SQL injection */
const ALLOWED_LAW_TOPICS_ORDER_BY = new Set(['relevance_score', 'topic_rank', 'created_at', 'updated_at']);

/**
 * Retrieves law-topic relationships with optional filtering and pagination.
 */
export async function getLawTopics(options: GetLawTopicsOptions = {}): Promise<LawTopic[]> {
  const pool = getDatabasePool();

  const conditions: string[] = [];
  const values: (string | number | boolean)[] = [];
  let paramIndex = 1;

  if (options.lawId !== undefined) {
    conditions.push(`law_id = $${paramIndex++}`);
    values.push(options.lawId);
  }

  if (options.topicId !== undefined) {
    conditions.push(`topic_id = $${paramIndex++}`);
    values.push(options.topicId);
  }

  if (options.isPrimary !== undefined) {
    conditions.push(`is_primary = $${paramIndex++}`);
    values.push(options.isPrimary);
  }

  if (options.isReviewed !== undefined) {
    conditions.push(`is_reviewed = $${paramIndex++}`);
    values.push(options.isReviewed);
  }

  if (options.assignmentMethod !== undefined) {
    conditions.push(`assignment_method = $${paramIndex++}`);
    values.push(options.assignmentMethod);
  }

  if (options.minRelevanceScore !== undefined) {
    conditions.push(`relevance_score >= $${paramIndex++}`);
    values.push(options.minRelevanceScore);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Validate orderBy to prevent SQL injection
  const orderBy = options.orderBy ?? 'topic_rank';
  if (!ALLOWED_LAW_TOPICS_ORDER_BY.has(orderBy)) {
    throw new Error(`Invalid orderBy column: ${orderBy}`);
  }

  // Validate orderDirection to prevent SQL injection
  const orderDirection = options.orderDirection ?? 'ASC';
  if (!ALLOWED_ORDER_DIRECTIONS.has(orderDirection)) {
    throw new Error(`Invalid orderDirection: ${orderDirection}`);
  }

  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const query = `
    SELECT * FROM law_topics
    ${whereClause}
    ORDER BY ${orderBy} ${orderDirection}
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `;

  values.push(limit, offset);

  const result = await pool.query<LawTopicRow>(query, values);
  return result.rows.map(rowToLawTopic);
}

/**
 * Retrieves all topics for a specific law, ordered by rank.
 */
export async function getTopicsForLaw(lawId: number): Promise<LawTopic[]> {
  return getLawTopics({
    lawId,
    orderBy: 'topic_rank',
    orderDirection: 'ASC',
    limit: 1000,
  });
}

/**
 * Retrieves the primary topic for a law.
 */
export async function getPrimaryTopicForLaw(lawId: number): Promise<LawTopic | null> {
  const pool = getDatabasePool();

  const result = await pool.query<LawTopicRow>(
    'SELECT * FROM law_topics WHERE law_id = $1 AND is_primary = TRUE LIMIT 1',
    [lawId]
  );

  const row = result.rows[0];
  return row ? rowToLawTopic(row) : null;
}

/**
 * Retrieves all laws for a specific topic, ordered by relevance score.
 */
export async function getLawsForTopic(topicId: number): Promise<LawTopic[]> {
  return getLawTopics({
    topicId,
    orderBy: 'relevance_score',
    orderDirection: 'DESC',
    limit: 10000,
  });
}

/**
 * Retrieves high-relevance law-topic relationships.
 */
export async function getHighRelevanceLawTopics(
  minScore: number = 0.8,
  limit: number = 100
): Promise<LawTopic[]> {
  return getLawTopics({
    minRelevanceScore: minScore,
    orderBy: 'relevance_score',
    orderDirection: 'DESC',
    limit,
  });
}

/**
 * Updates a law-topic relationship's fields.
 */
export async function updateLawTopic(
  lawId: number,
  topicId: number,
  update: UpdateLawTopicInput
): Promise<LawTopic | null> {
  const pool = getDatabasePool();

  const setClauses: string[] = [];
  const values: (string | number | boolean | Date | null)[] = [];
  let paramIndex = 1;

  if (update.relevanceScore !== undefined) {
    setClauses.push(`relevance_score = $${paramIndex++}`);
    values.push(update.relevanceScore);
  }

  if (update.topicRank !== undefined) {
    setClauses.push(`topic_rank = $${paramIndex++}`);
    values.push(update.topicRank);
  }

  if (update.isPrimary !== undefined) {
    setClauses.push(`is_primary = $${paramIndex++}`);
    values.push(update.isPrimary);
  }

  if (update.assignmentConfidence !== undefined) {
    setClauses.push(`assignment_confidence = $${paramIndex++}`);
    values.push(update.assignmentConfidence ?? null);
  }

  if (update.isReviewed !== undefined) {
    setClauses.push(`is_reviewed = $${paramIndex++}`);
    values.push(update.isReviewed);
  }

  if (update.reviewedAt !== undefined) {
    setClauses.push(`reviewed_at = $${paramIndex++}`);
    values.push(update.reviewedAt ?? null);
  }

  if (update.reviewedBy !== undefined) {
    setClauses.push(`reviewed_by = $${paramIndex++}`);
    values.push(update.reviewedBy ?? null);
  }

  if (setClauses.length === 0) {
    // No updates to make, just return current law-topic
    return getLawTopicByIds(lawId, topicId);
  }

  values.push(lawId, topicId);

  const query = `
    UPDATE law_topics
    SET ${setClauses.join(', ')}
    WHERE law_id = $${paramIndex} AND topic_id = $${paramIndex + 1}
    RETURNING *
  `;

  const result = await pool.query<LawTopicRow>(query, values);
  const row = result.rows[0];
  return row ? rowToLawTopic(row) : null;
}

/**
 * Marks a law-topic relationship as reviewed.
 */
export async function markLawTopicReviewed(
  lawId: number,
  topicId: number,
  reviewedBy: string
): Promise<LawTopic | null> {
  return updateLawTopic(lawId, topicId, {
    isReviewed: true,
    reviewedAt: new Date(),
    reviewedBy,
  });
}

/**
 * Sets a topic as the primary topic for a law.
 * Unsets any existing primary topic for that law.
 */
export async function setPrimaryTopicForLaw(
  lawId: number,
  topicId: number
): Promise<LawTopic | null> {
  const pool = getDatabasePool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Unset any existing primary topic for this law
    await client.query(
      'UPDATE law_topics SET is_primary = FALSE WHERE law_id = $1 AND is_primary = TRUE',
      [lawId]
    );

    // Set the new primary topic
    const result = await client.query<LawTopicRow>(
      'UPDATE law_topics SET is_primary = TRUE, topic_rank = 1 WHERE law_id = $1 AND topic_id = $2 RETURNING *',
      [lawId, topicId]
    );

    await client.query('COMMIT');

    const row = result.rows[0];
    return row ? rowToLawTopic(row) : null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Deletes a law-topic relationship.
 */
export async function deleteLawTopic(lawId: number, topicId: number): Promise<boolean> {
  const pool = getDatabasePool();

  const result = await pool.query(
    'DELETE FROM law_topics WHERE law_id = $1 AND topic_id = $2',
    [lawId, topicId]
  );

  return (result.rowCount ?? 0) > 0;
}

/**
 * Deletes all topic assignments for a specific law.
 */
export async function deleteTopicsForLaw(lawId: number): Promise<number> {
  const pool = getDatabasePool();

  const result = await pool.query(
    'DELETE FROM law_topics WHERE law_id = $1',
    [lawId]
  );

  return result.rowCount ?? 0;
}

/**
 * Deletes all law assignments for a specific topic.
 */
export async function deleteLawsForTopic(topicId: number): Promise<number> {
  const pool = getDatabasePool();

  const result = await pool.query(
    'DELETE FROM law_topics WHERE topic_id = $1',
    [topicId]
  );

  return result.rowCount ?? 0;
}

/**
 * Deletes all law-topic relationships (useful for regeneration).
 */
export async function deleteAllLawTopics(): Promise<number> {
  const pool = getDatabasePool();

  const result = await pool.query('DELETE FROM law_topics');

  return result.rowCount ?? 0;
}

/**
 * Gets statistics about law-topic relationships.
 */
export async function getLawTopicsStats(): Promise<LawTopicsStats> {
  const pool = getDatabasePool();

  const statsQuery = `
    SELECT
      COUNT(*) as total_relationships,
      COUNT(DISTINCT law_id) as laws_with_topics,
      COUNT(DISTINCT topic_id) as topics_with_laws,
      COUNT(*) FILTER (WHERE is_primary = TRUE) as primary_assignments,
      COALESCE(AVG(relevance_score), 0) as avg_relevance_score
    FROM law_topics
  `;

  const result = await pool.query<{
    total_relationships: string;
    laws_with_topics: string;
    topics_with_laws: string;
    primary_assignments: string;
    avg_relevance_score: string;
  }>(statsQuery);

  const row = result.rows[0];
  if (!row) {
    return {
      totalRelationships: 0,
      lawsWithTopics: 0,
      topicsWithLaws: 0,
      avgTopicsPerLaw: 0,
      avgLawsPerTopic: 0,
      primaryAssignments: 0,
      avgRelevanceScore: 0,
    };
  }

  const totalRelationships = parseInt(row.total_relationships, 10);
  const lawsWithTopics = parseInt(row.laws_with_topics, 10);
  const topicsWithLaws = parseInt(row.topics_with_laws, 10);

  return {
    totalRelationships,
    lawsWithTopics,
    topicsWithLaws,
    avgTopicsPerLaw: lawsWithTopics > 0 ? totalRelationships / lawsWithTopics : 0,
    avgLawsPerTopic: topicsWithLaws > 0 ? totalRelationships / topicsWithLaws : 0,
    primaryAssignments: parseInt(row.primary_assignments, 10),
    avgRelevanceScore: parseFloat(row.avg_relevance_score),
  };
}

/**
 * Checks if a law-topic relationship exists.
 */
export async function lawTopicExists(lawId: number, topicId: number): Promise<boolean> {
  const pool = getDatabasePool();

  const result = await pool.query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM law_topics WHERE law_id = $1 AND topic_id = $2) as exists',
    [lawId, topicId]
  );

  return result.rows[0]?.exists ?? false;
}

/**
 * Assigns multiple topics to a law at once.
 * Useful for batch assignment during clustering.
 *
 * @param lawId - The law ID
 * @param topicAssignments - Array of topic assignments with scores
 */
export async function assignTopicsToLaw(
  lawId: number,
  topicAssignments: Array<{
    topicId: number;
    relevanceScore?: number;
    isPrimary?: boolean;
  }>
): Promise<BatchOperationResult> {
  // Sort by relevance score descending to assign ranks
  const sorted = [...topicAssignments].sort(
    (a, b) => (b.relevanceScore ?? 1.0) - (a.relevanceScore ?? 1.0)
  );

  const lawTopics: CreateLawTopicInput[] = sorted.map((assignment, index) => ({
    lawId,
    topicId: assignment.topicId,
    relevanceScore: assignment.relevanceScore ?? 1.0,
    topicRank: index + 1,
    isPrimary: assignment.isPrimary ?? index === 0, // First is primary by default
    assignmentMethod: AssignmentMethod.CLUSTERING,
  }));

  return insertLawTopicsBatch(lawTopics);
}

/**
 * Gets the count of laws assigned to each topic.
 * Returns a map of topic_id to law count.
 */
export async function getTopicLawCounts(): Promise<Map<number, number>> {
  const pool = getDatabasePool();

  const result = await pool.query<{ topic_id: number; count: string }>(
    'SELECT topic_id, COUNT(*) as count FROM law_topics GROUP BY topic_id'
  );

  const counts = new Map<number, number>();
  for (const row of result.rows) {
    counts.set(row.topic_id, parseInt(row.count, 10));
  }
  return counts;
}

// ============================================================================
// Full-Text Search Operations
// ============================================================================

/**
 * Normalizes a Hebrew search query by trimming and collapsing whitespace.
 * This mirrors the SQL normalize_hebrew_query function for client-side use.
 */
export function normalizeSearchQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

/**
 * Sanitizes a word for use in PostgreSQL tsquery by removing special characters.
 * This prevents tsquery injection attacks.
 *
 * @param word - A single word from user input
 * @returns Sanitized word safe for tsquery
 */
function sanitizeTsQueryWord(word: string): string {
  // Remove tsquery special characters: & | ! : * ( ) < > \
  // Only keep alphanumeric characters, Hebrew letters, and common punctuation
  return word.replace(/[&|!:*()<>\\'"]/g, '');
}

/**
 * Builds a PostgreSQL tsquery string from user input.
 * Converts words to prefix-matching terms joined with AND.
 * Sanitizes input to prevent tsquery injection.
 *
 * @param searchText - The user's search input
 * @returns A string suitable for to_tsquery('simple', ...)
 */
export function buildTsQueryString(searchText: string): string {
  const normalized = normalizeSearchQuery(searchText);
  const words = normalized
    .split(' ')
    .map(sanitizeTsQueryWord)
    .filter((w) => w.length > 0);

  if (words.length === 0) {
    return '';
  }

  // Use prefix matching for partial word searches
  return words.map((word) => `${word}:*`).join(' & ');
}

/**
 * Performs full-text search on law chunks using PostgreSQL stored function.
 * Returns chunks ordered by relevance with highlighted excerpts.
 *
 * @param searchText - The search query
 * @param options - Search options
 * @returns Array of matching chunks with rank and headline
 */
export async function searchChunksFts(
  searchText: string,
  options: FtsSearchOptions = {}
): Promise<FtsChunkResult[]> {
  const pool = getDatabasePool();
  const limit = options.limit ?? 20;
  const minRank = options.minRank ?? 0.0;

  // Use the stored function if available, otherwise fallback to inline query
  try {
    const result = await pool.query<FtsChunkResultRow>(
      'SELECT * FROM search_law_chunks_fts($1, $2, $3)',
      [searchText, limit, minRank]
    );
    return result.rows.map(rowToFtsChunkResult);
  } catch {
    // Fallback: stored function might not exist yet (before migration)
    return searchChunksFtsFallback(searchText, options);
  }
}

/**
 * Fallback FTS search for chunks when stored function is not available.
 * Uses inline query with the same logic.
 */
async function searchChunksFtsFallback(
  searchText: string,
  options: FtsSearchOptions = {}
): Promise<FtsChunkResult[]> {
  const pool = getDatabasePool();
  const limit = options.limit ?? 20;
  const minRank = options.minRank ?? 0.0;

  const tsQuery = buildTsQueryString(searchText);
  if (!tsQuery) {
    return [];
  }

  const query = `
    SELECT
      chunk_id,
      law_id,
      law_item_id,
      chunk_index,
      content,
      section_title,
      section_type,
      ts_rank(
        setweight(to_tsvector('simple', COALESCE(content, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(section_title, '')), 'B'),
        to_tsquery('simple', $1)
      ) AS rank,
      ts_headline(
        'simple',
        content,
        to_tsquery('simple', $1),
        'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20, MaxFragments=3'
      ) AS headline
    FROM law_chunks
    WHERE (
      setweight(to_tsvector('simple', COALESCE(content, '')), 'A') ||
      setweight(to_tsvector('simple', COALESCE(section_title, '')), 'B')
    ) @@ to_tsquery('simple', $1)
    AND ts_rank(
      setweight(to_tsvector('simple', COALESCE(content, '')), 'A') ||
      setweight(to_tsvector('simple', COALESCE(section_title, '')), 'B'),
      to_tsquery('simple', $1)
    ) >= $2
    ORDER BY rank DESC
    LIMIT $3
  `;

  const result = await pool.query<FtsChunkResultRow>(query, [tsQuery, minRank, limit]);
  return result.rows.map(rowToFtsChunkResult);
}

/**
 * Performs full-text search on laws using PostgreSQL stored function.
 * Returns laws ordered by relevance with highlighted law names.
 *
 * @param searchText - The search query
 * @param options - Search options
 * @returns Array of matching laws with rank and headline
 */
export async function searchLawsFts(
  searchText: string,
  options: FtsSearchOptions = {}
): Promise<FtsLawResult[]> {
  const pool = getDatabasePool();
  const limit = options.limit ?? 20;

  // Use the stored function if available, otherwise fallback to inline query
  try {
    const result = await pool.query<FtsLawResultRow>(
      'SELECT * FROM search_laws_fts($1, $2)',
      [searchText, limit]
    );
    return result.rows.map(rowToFtsLawResult);
  } catch {
    // Fallback: stored function might not exist yet (before migration)
    return searchLawsFtsFallback(searchText, options);
  }
}

/**
 * Fallback FTS search for laws when stored function is not available.
 */
async function searchLawsFtsFallback(
  searchText: string,
  options: FtsSearchOptions = {}
): Promise<FtsLawResult[]> {
  const pool = getDatabasePool();
  const limit = options.limit ?? 20;

  const tsQuery = buildTsQueryString(searchText);
  if (!tsQuery) {
    return [];
  }

  const query = `
    SELECT
      id,
      law_item_id,
      law_name,
      publication_date,
      ts_rank(
        setweight(to_tsvector('simple', COALESCE(law_name, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(publication_series, '')), 'B'),
        to_tsquery('simple', $1)
      ) AS rank,
      ts_headline(
        'simple',
        law_name,
        to_tsquery('simple', $1),
        'StartSel=<mark>, StopSel=</mark>, MaxWords=30, MinWords=10'
      ) AS headline
    FROM laws
    WHERE (
      setweight(to_tsvector('simple', COALESCE(law_name, '')), 'A') ||
      setweight(to_tsvector('simple', COALESCE(publication_series, '')), 'B')
    ) @@ to_tsquery('simple', $1)
    ORDER BY rank DESC
    LIMIT $2
  `;

  const result = await pool.query<FtsLawResultRow>(query, [tsQuery, limit]);
  return result.rows.map(rowToFtsLawResult);
}

/**
 * Performs full-text search on topics using PostgreSQL stored function.
 * Returns topics ordered by relevance with highlighted names/descriptions.
 *
 * @param searchText - The search query
 * @param options - Search options
 * @returns Array of matching topics with rank and headline
 */
export async function searchTopicsFts(
  searchText: string,
  options: FtsTopicSearchOptions = {}
): Promise<FtsTopicResult[]> {
  const pool = getDatabasePool();
  const limit = options.limit ?? 20;
  const activeOnly = options.activeOnly ?? true;

  // Use the stored function if available, otherwise fallback to inline query
  try {
    const result = await pool.query<FtsTopicResultRow>(
      'SELECT * FROM search_topics_fts($1, $2, $3)',
      [searchText, limit, activeOnly]
    );
    return result.rows.map(rowToFtsTopicResult);
  } catch {
    // Fallback: stored function might not exist yet (before migration)
    return searchTopicsFtsFallback(searchText, options);
  }
}

/**
 * Fallback FTS search for topics when stored function is not available.
 */
async function searchTopicsFtsFallback(
  searchText: string,
  options: FtsTopicSearchOptions = {}
): Promise<FtsTopicResult[]> {
  const pool = getDatabasePool();
  const limit = options.limit ?? 20;
  const activeOnly = options.activeOnly ?? true;

  const tsQuery = buildTsQueryString(searchText);
  if (!tsQuery) {
    return [];
  }

  const activeClause = activeOnly ? 'AND is_active = TRUE' : '';

  const query = `
    SELECT
      id,
      topic_id,
      name_he,
      description_he,
      law_count,
      ts_rank(
        setweight(to_tsvector('simple', COALESCE(name_he, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(description_he, '')), 'B'),
        to_tsquery('simple', $1)
      ) AS rank,
      ts_headline(
        'simple',
        COALESCE(name_he, '') || ' - ' || COALESCE(description_he, ''),
        to_tsquery('simple', $1),
        'StartSel=<mark>, StopSel=</mark>, MaxWords=30, MinWords=10'
      ) AS headline
    FROM topics
    WHERE (
      setweight(to_tsvector('simple', COALESCE(name_he, '')), 'A') ||
      setweight(to_tsvector('simple', COALESCE(description_he, '')), 'B')
    ) @@ to_tsquery('simple', $1)
    ${activeClause}
    ORDER BY rank DESC
    LIMIT $2
  `;

  const result = await pool.query<FtsTopicResultRow>(query, [tsQuery, limit]);
  return result.rows.map(rowToFtsTopicResult);
}

/**
 * Performs fuzzy search on law names using trigram similarity.
 * Useful for handling typos and spelling variations in Hebrew text.
 *
 * @param searchText - The search query
 * @param options - Search options
 * @returns Array of matching laws with similarity scores
 */
export async function searchLawsFuzzy(
  searchText: string,
  options: FuzzySearchOptions = {}
): Promise<FuzzyLawResult[]> {
  const pool = getDatabasePool();
  const limit = options.limit ?? 20;
  const similarityThreshold = options.similarityThreshold ?? 0.3;

  // Use the stored function if available, otherwise fallback to inline query
  try {
    const result = await pool.query<FuzzyLawResultRow>(
      'SELECT * FROM search_laws_fuzzy($1, $2, $3)',
      [searchText, limit, similarityThreshold]
    );
    return result.rows.map(rowToFuzzyLawResult);
  } catch {
    // Fallback: stored function or pg_trgm might not exist yet
    return searchLawsFuzzyFallback(searchText, options);
  }
}

/**
 * Fallback fuzzy search for laws when stored function is not available.
 */
async function searchLawsFuzzyFallback(
  searchText: string,
  options: FuzzySearchOptions = {}
): Promise<FuzzyLawResult[]> {
  const pool = getDatabasePool();
  const limit = options.limit ?? 20;
  const similarityThreshold = options.similarityThreshold ?? 0.3;

  const query = `
    SELECT
      id,
      law_item_id,
      law_name,
      publication_date,
      similarity(law_name, $1) AS similarity
    FROM laws
    WHERE similarity(law_name, $1) >= $2
    ORDER BY similarity DESC
    LIMIT $3
  `;

  try {
    const result = await pool.query<FuzzyLawResultRow>(query, [
      searchText,
      similarityThreshold,
      limit,
    ]);
    return result.rows.map(rowToFuzzyLawResult);
  } catch {
    // pg_trgm extension might not be installed
    return [];
  }
}

/**
 * Performs a combined FTS and fuzzy search for more comprehensive results.
 * Merges results from both methods, removing duplicates.
 *
 * @param searchText - The search query
 * @param options - Search options
 * @returns Combined array of law results
 */
export async function searchLawsCombined(
  searchText: string,
  options: FtsSearchOptions & FuzzySearchOptions = {}
): Promise<FtsLawResult[]> {
  // Run both searches in parallel
  const [ftsResults, fuzzyResults] = await Promise.all([
    searchLawsFts(searchText, options),
    searchLawsFuzzy(searchText, options),
  ]);

  // Create a map to track seen law IDs and merge results
  const seen = new Set<number>();
  const combined: FtsLawResult[] = [];

  // Add FTS results first (typically more relevant)
  for (const result of ftsResults) {
    if (!seen.has(result.id)) {
      seen.add(result.id);
      combined.push(result);
    }
  }

  // Add fuzzy results that weren't in FTS results
  for (const fuzzyResult of fuzzyResults) {
    if (!seen.has(fuzzyResult.id)) {
      seen.add(fuzzyResult.id);
      // Convert fuzzy result to FTS result format
      combined.push({
        id: fuzzyResult.id,
        lawItemId: fuzzyResult.lawItemId,
        lawName: fuzzyResult.lawName,
        publicationDate: fuzzyResult.publicationDate,
        rank: fuzzyResult.similarity, // Use similarity as rank
        headline: fuzzyResult.lawName, // No highlighting for fuzzy results
      });
    }
  }

  // Sort by rank descending
  combined.sort((a, b) => b.rank - a.rank);

  // Limit to requested number
  const limit = options.limit ?? 20;
  return combined.slice(0, limit);
}

/**
 * Performs a simple text search on chunk content using the basic existing index.
 * This is a lighter-weight alternative to the full FTS functions.
 *
 * @param searchText - The search query
 * @param limit - Maximum number of results
 * @returns Array of matching chunks (without rank/headline)
 */
export async function searchChunksSimple(
  searchText: string,
  limit: number = 20
): Promise<LawChunk[]> {
  const pool = getDatabasePool();

  // Convert search query to tsquery format
  const tsQuery = buildTsQueryString(searchText);
  if (!tsQuery) {
    return [];
  }

  const query = `
    SELECT *
    FROM law_chunks
    WHERE to_tsvector('simple', content) @@ to_tsquery('simple', $1)
    ORDER BY ts_rank(to_tsvector('simple', content), to_tsquery('simple', $1)) DESC
    LIMIT $2
  `;

  const result = await pool.query<LawChunkRow>(query, [tsQuery, limit]);
  return result.rows.map(rowToLawChunk);
}

/**
 * Gets the search configuration status, checking if FTS functions exist.
 * Useful for diagnostics and determining which search mode to use.
 */
export async function getFtsStatus(): Promise<{
  functionsExist: boolean;
  pgTrgmEnabled: boolean;
  indexesExist: {
    lawChunksContentFts: boolean;
    lawChunksCombinedFts: boolean;
    lawsNameFts: boolean;
    topicsNameFts: boolean;
  };
}> {
  const pool = getDatabasePool();

  // Check if stored functions exist
  const functionsResult = await pool.query<{ exists: boolean }>(`
    SELECT EXISTS(
      SELECT 1 FROM pg_proc WHERE proname = 'search_law_chunks_fts'
    ) as exists
  `);

  // Check if pg_trgm extension is enabled
  const trgmResult = await pool.query<{ exists: boolean }>(`
    SELECT EXISTS(
      SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'
    ) as exists
  `);

  // Check if indexes exist
  const indexResult = await pool.query<{ indexname: string }>(`
    SELECT indexname FROM pg_indexes
    WHERE indexname IN (
      'idx_law_chunks_content_fts',
      'idx_law_chunks_fts_combined',
      'idx_laws_law_name',
      'idx_topics_name_he_fts'
    )
  `);

  const indexNames = new Set(indexResult.rows.map((r) => r.indexname));

  return {
    functionsExist: functionsResult.rows[0]?.exists ?? false,
    pgTrgmEnabled: trgmResult.rows[0]?.exists ?? false,
    indexesExist: {
      lawChunksContentFts: indexNames.has('idx_law_chunks_content_fts'),
      lawChunksCombinedFts: indexNames.has('idx_law_chunks_fts_combined'),
      lawsNameFts: indexNames.has('idx_laws_law_name'),
      topicsNameFts: indexNames.has('idx_topics_name_he_fts'),
    },
  };
}

// ============================================================================
// Query Logs CRUD Operations (Analytics)
// ============================================================================

/**
 * Inserts a new query log into the database.
 *
 * @param queryLog - The query log data to insert
 * @returns The inserted query log with generated fields
 */
export async function insertQueryLog(queryLog: CreateQueryLogInput): Promise<QueryLog> {
  const pool = getDatabasePool();

  const query = `
    INSERT INTO query_logs (
      query_id, session_id, query_text, normalized_query, query_language,
      source, status, error_message,
      chunks_retrieved, chunks_used, vector_scores, used_fts, search_filters,
      matched_topic_ids, retrieved_law_ids,
      llm_provider, llm_model, input_tokens, output_tokens, estimated_cost_usd,
      temperature, max_tokens,
      response_text, response_char_count, citation_count, was_streamed,
      embedding_latency_ms, retrieval_latency_ms, generation_latency_ms, total_latency_ms,
      user_rating, user_feedback, feedback_at,
      client_info, ip_hash, request_metadata, tags,
      started_at, completed_at
    )
    VALUES (
      COALESCE($1, gen_random_uuid()::VARCHAR(36)), $2, $3, $4, $5,
      $6, $7, $8,
      $9, $10, $11, $12, $13,
      $14, $15,
      $16, $17, $18, $19, $20,
      $21, $22,
      $23, $24, $25, $26,
      $27, $28, $29, $30,
      $31, $32, $33,
      $34, $35, $36, $37,
      $38, $39
    )
    RETURNING *
  `;

  const values = [
    queryLog.queryId ?? null,
    queryLog.sessionId ?? null,
    queryLog.queryText,
    queryLog.normalizedQuery ?? null,
    queryLog.queryLanguage ?? 'he',
    queryLog.source ?? QuerySource.CHAT,
    queryLog.status ?? QueryStatus.PENDING,
    queryLog.errorMessage ?? null,
    queryLog.chunksRetrieved ?? 0,
    queryLog.chunksUsed ?? 0,
    queryLog.vectorScores ? JSON.stringify(queryLog.vectorScores) : null,
    queryLog.usedFts ?? false,
    queryLog.searchFilters ? JSON.stringify(queryLog.searchFilters) : null,
    queryLog.matchedTopicIds ?? null,
    queryLog.retrievedLawIds ?? null,
    queryLog.llmProvider ?? null,
    queryLog.llmModel ?? null,
    queryLog.inputTokens ?? null,
    queryLog.outputTokens ?? null,
    queryLog.estimatedCostUsd ?? null,
    queryLog.temperature ?? null,
    queryLog.maxTokens ?? null,
    queryLog.responseText ?? null,
    queryLog.responseCharCount ?? null,
    queryLog.citationCount ?? 0,
    queryLog.wasStreamed ?? false,
    queryLog.embeddingLatencyMs ?? null,
    queryLog.retrievalLatencyMs ?? null,
    queryLog.generationLatencyMs ?? null,
    queryLog.totalLatencyMs ?? null,
    queryLog.userRating ?? null,
    queryLog.userFeedback ?? null,
    queryLog.feedbackAt ?? null,
    queryLog.clientInfo ? JSON.stringify(queryLog.clientInfo) : null,
    queryLog.ipHash ?? null,
    queryLog.requestMetadata ? JSON.stringify(queryLog.requestMetadata) : null,
    queryLog.tags ?? null,
    queryLog.startedAt ?? null,
    queryLog.completedAt ?? null,
  ];

  const result = await pool.query<QueryLogRow>(query, values);
  const row = result.rows[0];
  if (!row) {
    throw new Error('Failed to insert query log - no row returned');
  }
  return rowToQueryLog(row);
}

/**
 * Retrieves a query log by its query_id (UUID).
 */
export async function getQueryLogByQueryId(queryId: string): Promise<QueryLog | null> {
  const pool = getDatabasePool();

  const result = await pool.query<QueryLogRow>(
    'SELECT * FROM query_logs WHERE query_id = $1',
    [queryId]
  );

  const row = result.rows[0];
  return row ? rowToQueryLog(row) : null;
}

/**
 * Retrieves a query log by its database ID.
 */
export async function getQueryLogById(id: number): Promise<QueryLog | null> {
  const pool = getDatabasePool();

  const result = await pool.query<QueryLogRow>(
    'SELECT * FROM query_logs WHERE id = $1',
    [id]
  );

  const row = result.rows[0];
  return row ? rowToQueryLog(row) : null;
}

/** Allowed order by columns for query_logs to prevent SQL injection */
const ALLOWED_QUERY_LOGS_ORDER_BY = new Set(['created_at', 'total_latency_ms', 'total_tokens', 'user_rating']);

/**
 * Retrieves query logs with optional filtering and pagination.
 */
export async function getQueryLogs(options: GetQueryLogsOptions = {}): Promise<QueryLog[]> {
  const pool = getDatabasePool();

  const conditions: string[] = [];
  const values: (string | number | boolean | Date | string[])[] = [];
  let paramIndex = 1;

  if (options.sessionId !== undefined) {
    conditions.push(`session_id = $${paramIndex++}`);
    values.push(options.sessionId);
  }

  if (options.status !== undefined) {
    conditions.push(`status = $${paramIndex++}`);
    values.push(options.status);
  }

  if (options.source !== undefined) {
    conditions.push(`source = $${paramIndex++}`);
    values.push(options.source);
  }

  if (options.llmProvider !== undefined) {
    conditions.push(`llm_provider = $${paramIndex++}`);
    values.push(options.llmProvider);
  }

  if (options.startDate !== undefined) {
    conditions.push(`created_at >= $${paramIndex++}`);
    values.push(options.startDate);
  }

  if (options.endDate !== undefined) {
    conditions.push(`created_at < $${paramIndex++}`);
    values.push(options.endDate);
  }

  if (options.minRating !== undefined) {
    conditions.push(`user_rating >= $${paramIndex++}`);
    values.push(options.minRating);
  }

  if (options.tags !== undefined && options.tags.length > 0) {
    conditions.push(`tags && $${paramIndex++}`);
    values.push(options.tags);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Validate orderBy to prevent SQL injection
  const orderBy = options.orderBy ?? 'created_at';
  if (!ALLOWED_QUERY_LOGS_ORDER_BY.has(orderBy)) {
    throw new Error(`Invalid orderBy column: ${orderBy}`);
  }

  // Validate orderDirection to prevent SQL injection
  const orderDirection = options.orderDirection ?? 'DESC';
  if (!ALLOWED_ORDER_DIRECTIONS.has(orderDirection)) {
    throw new Error(`Invalid orderDirection: ${orderDirection}`);
  }

  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const query = `
    SELECT * FROM query_logs
    ${whereClause}
    ORDER BY ${orderBy} ${orderDirection}
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `;

  values.push(limit, offset);

  const result = await pool.query<QueryLogRow>(query, values);
  return result.rows.map(rowToQueryLog);
}

/**
 * Retrieves recent query logs.
 */
export async function getRecentQueryLogs(limit: number = 50): Promise<QueryLog[]> {
  return getQueryLogs({
    orderBy: 'created_at',
    orderDirection: 'DESC',
    limit,
  });
}

/**
 * Retrieves query logs for a specific session.
 */
export async function getQueryLogsForSession(sessionId: string): Promise<QueryLog[]> {
  return getQueryLogs({
    sessionId,
    orderBy: 'created_at',
    orderDirection: 'ASC',
    limit: 1000,
  });
}

/**
 * Retrieves failed query logs.
 */
export async function getFailedQueryLogs(limit: number = 100): Promise<QueryLog[]> {
  return getQueryLogs({
    status: QueryStatus.FAILED,
    orderBy: 'created_at',
    orderDirection: 'DESC',
    limit,
  });
}

/**
 * Updates a query log's fields.
 */
export async function updateQueryLog(
  queryId: string,
  update: UpdateQueryLogInput
): Promise<QueryLog | null> {
  const pool = getDatabasePool();

  const setClauses: string[] = [];
  const values: (string | number | boolean | Date | string[] | number[] | null)[] = [];
  let paramIndex = 1;

  // Build SET clauses dynamically based on provided fields
  const fieldMappings: Array<{
    key: keyof UpdateQueryLogInput;
    column: string;
    isJson?: boolean;
  }> = [
    { key: 'normalizedQuery', column: 'normalized_query' },
    { key: 'status', column: 'status' },
    { key: 'errorMessage', column: 'error_message' },
    { key: 'chunksRetrieved', column: 'chunks_retrieved' },
    { key: 'chunksUsed', column: 'chunks_used' },
    { key: 'vectorScores', column: 'vector_scores', isJson: true },
    { key: 'usedFts', column: 'used_fts' },
    { key: 'searchFilters', column: 'search_filters', isJson: true },
    { key: 'matchedTopicIds', column: 'matched_topic_ids' },
    { key: 'retrievedLawIds', column: 'retrieved_law_ids' },
    { key: 'llmProvider', column: 'llm_provider' },
    { key: 'llmModel', column: 'llm_model' },
    { key: 'inputTokens', column: 'input_tokens' },
    { key: 'outputTokens', column: 'output_tokens' },
    { key: 'estimatedCostUsd', column: 'estimated_cost_usd' },
    { key: 'temperature', column: 'temperature' },
    { key: 'maxTokens', column: 'max_tokens' },
    { key: 'responseText', column: 'response_text' },
    { key: 'responseCharCount', column: 'response_char_count' },
    { key: 'citationCount', column: 'citation_count' },
    { key: 'wasStreamed', column: 'was_streamed' },
    { key: 'embeddingLatencyMs', column: 'embedding_latency_ms' },
    { key: 'retrievalLatencyMs', column: 'retrieval_latency_ms' },
    { key: 'generationLatencyMs', column: 'generation_latency_ms' },
    { key: 'totalLatencyMs', column: 'total_latency_ms' },
    { key: 'userRating', column: 'user_rating' },
    { key: 'userFeedback', column: 'user_feedback' },
    { key: 'feedbackAt', column: 'feedback_at' },
    { key: 'startedAt', column: 'started_at' },
    { key: 'completedAt', column: 'completed_at' },
  ];

  for (const { key, column, isJson } of fieldMappings) {
    if (update[key] !== undefined) {
      setClauses.push(`${column} = $${paramIndex++}`);
      const value = update[key];
      if (isJson && value !== null) {
        values.push(JSON.stringify(value));
      } else {
        values.push(value as string | number | boolean | Date | string[] | number[] | null);
      }
    }
  }

  if (setClauses.length === 0) {
    // No updates to make, just return current query log
    return getQueryLogByQueryId(queryId);
  }

  values.push(queryId);

  const query = `
    UPDATE query_logs
    SET ${setClauses.join(', ')}
    WHERE query_id = $${paramIndex}
    RETURNING *
  `;

  const result = await pool.query<QueryLogRow>(query, values);
  const row = result.rows[0];
  return row ? rowToQueryLog(row) : null;
}

/**
 * Marks a query as processing.
 */
export async function markQueryProcessing(queryId: string): Promise<QueryLog | null> {
  return updateQueryLog(queryId, {
    status: QueryStatus.PROCESSING,
    startedAt: new Date(),
  });
}

/**
 * Marks a query as completed with metrics.
 */
export async function markQueryCompleted(
  queryId: string,
  metrics: {
    chunksRetrieved?: number;
    chunksUsed?: number;
    inputTokens?: number;
    outputTokens?: number;
    embeddingLatencyMs?: number;
    retrievalLatencyMs?: number;
    generationLatencyMs?: number;
    totalLatencyMs?: number;
    responseText?: string;
    citationCount?: number;
  }
): Promise<QueryLog | null> {
  return updateQueryLog(queryId, {
    status: QueryStatus.COMPLETED,
    completedAt: new Date(),
    ...metrics,
    responseCharCount: metrics.responseText?.length,
  });
}

/**
 * Marks a query as failed with error message.
 */
export async function markQueryFailed(
  queryId: string,
  errorMessage: string
): Promise<QueryLog | null> {
  return updateQueryLog(queryId, {
    status: QueryStatus.FAILED,
    errorMessage,
    completedAt: new Date(),
  });
}

/**
 * Adds user feedback to a query log.
 */
export async function addQueryFeedback(
  queryId: string,
  rating: number,
  feedback?: string
): Promise<QueryLog | null> {
  return updateQueryLog(queryId, {
    userRating: rating,
    userFeedback: feedback ?? null,
    feedbackAt: new Date(),
  });
}

/**
 * Deletes old query logs (for data retention).
 */
export async function deleteOldQueryLogs(olderThan: Date): Promise<number> {
  const pool = getDatabasePool();

  const result = await pool.query(
    'DELETE FROM query_logs WHERE created_at < $1',
    [olderThan]
  );

  return result.rowCount ?? 0;
}

/**
 * Deletes a specific query log by query_id.
 */
export async function deleteQueryLog(queryId: string): Promise<boolean> {
  const pool = getDatabasePool();

  const result = await pool.query(
    'DELETE FROM query_logs WHERE query_id = $1',
    [queryId]
  );

  return (result.rowCount ?? 0) > 0;
}

/**
 * Gets statistics about query logs for a time period.
 * Uses the stored function if available.
 */
export async function getQueryLogsStats(
  startDate?: Date,
  endDate?: Date
): Promise<QueryLogsStats> {
  const pool = getDatabasePool();
  const start = startDate ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
  const end = endDate ?? new Date();

  try {
    // Try to use the stored function
    const result = await pool.query<{
      total_queries: string;
      completed_queries: string;
      failed_queries: string;
      avg_latency_ms: string | null;
      p50_latency_ms: string | null;
      p95_latency_ms: string | null;
      p99_latency_ms: string | null;
      total_input_tokens: string;
      total_output_tokens: string;
      total_estimated_cost: string;
      avg_chunks_retrieved: string | null;
      avg_user_rating: string | null;
      queries_with_feedback: string;
    }>('SELECT * FROM get_query_stats($1, $2)', [start, end]);

    const row = result.rows[0];
    if (!row) {
      return getEmptyQueryLogsStats();
    }

    return {
      totalQueries: parseInt(row.total_queries, 10),
      completedQueries: parseInt(row.completed_queries, 10),
      failedQueries: parseInt(row.failed_queries, 10),
      avgLatencyMs: row.avg_latency_ms ? parseFloat(row.avg_latency_ms) : null,
      p50LatencyMs: row.p50_latency_ms ? parseFloat(row.p50_latency_ms) : null,
      p95LatencyMs: row.p95_latency_ms ? parseFloat(row.p95_latency_ms) : null,
      p99LatencyMs: row.p99_latency_ms ? parseFloat(row.p99_latency_ms) : null,
      totalInputTokens: parseInt(row.total_input_tokens, 10),
      totalOutputTokens: parseInt(row.total_output_tokens, 10),
      totalEstimatedCost: parseFloat(row.total_estimated_cost),
      avgChunksRetrieved: row.avg_chunks_retrieved ? parseFloat(row.avg_chunks_retrieved) : null,
      avgUserRating: row.avg_user_rating ? parseFloat(row.avg_user_rating) : null,
      queriesWithFeedback: parseInt(row.queries_with_feedback, 10),
    };
  } catch {
    // Fallback to inline query if stored function doesn't exist
    return getQueryLogsStatsFallback(start, end);
  }
}

/**
 * Fallback implementation for query stats when stored function is not available.
 */
async function getQueryLogsStatsFallback(
  startDate: Date,
  endDate: Date
): Promise<QueryLogsStats> {
  const pool = getDatabasePool();

  const result = await pool.query<{
    total_queries: string;
    completed_queries: string;
    failed_queries: string;
    avg_latency_ms: string | null;
    total_input_tokens: string;
    total_output_tokens: string;
    total_estimated_cost: string;
    avg_chunks_retrieved: string | null;
    avg_user_rating: string | null;
    queries_with_feedback: string;
  }>(`
    SELECT
      COUNT(*)::TEXT as total_queries,
      COUNT(*) FILTER (WHERE status = 'completed')::TEXT as completed_queries,
      COUNT(*) FILTER (WHERE status = 'failed')::TEXT as failed_queries,
      AVG(total_latency_ms)::TEXT as avg_latency_ms,
      COALESCE(SUM(input_tokens), 0)::TEXT as total_input_tokens,
      COALESCE(SUM(output_tokens), 0)::TEXT as total_output_tokens,
      COALESCE(SUM(estimated_cost_usd), 0)::TEXT as total_estimated_cost,
      AVG(chunks_retrieved)::TEXT as avg_chunks_retrieved,
      AVG(user_rating)::TEXT as avg_user_rating,
      COUNT(*) FILTER (WHERE user_rating IS NOT NULL)::TEXT as queries_with_feedback
    FROM query_logs
    WHERE created_at >= $1 AND created_at < $2
  `, [startDate, endDate]);

  const row = result.rows[0];
  if (!row) {
    return getEmptyQueryLogsStats();
  }

  return {
    totalQueries: parseInt(row.total_queries, 10),
    completedQueries: parseInt(row.completed_queries, 10),
    failedQueries: parseInt(row.failed_queries, 10),
    avgLatencyMs: row.avg_latency_ms ? parseFloat(row.avg_latency_ms) : null,
    p50LatencyMs: null, // Not available in fallback
    p95LatencyMs: null,
    p99LatencyMs: null,
    totalInputTokens: parseInt(row.total_input_tokens, 10),
    totalOutputTokens: parseInt(row.total_output_tokens, 10),
    totalEstimatedCost: parseFloat(row.total_estimated_cost),
    avgChunksRetrieved: row.avg_chunks_retrieved ? parseFloat(row.avg_chunks_retrieved) : null,
    avgUserRating: row.avg_user_rating ? parseFloat(row.avg_user_rating) : null,
    queriesWithFeedback: parseInt(row.queries_with_feedback, 10),
  };
}

/**
 * Returns empty stats object.
 */
function getEmptyQueryLogsStats(): QueryLogsStats {
  return {
    totalQueries: 0,
    completedQueries: 0,
    failedQueries: 0,
    avgLatencyMs: null,
    p50LatencyMs: null,
    p95LatencyMs: null,
    p99LatencyMs: null,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalEstimatedCost: 0,
    avgChunksRetrieved: null,
    avgUserRating: null,
    queriesWithFeedback: 0,
  };
}

/**
 * Gets hourly query counts for monitoring dashboards.
 */
export async function getHourlyQueryCounts(
  startDate?: Date,
  endDate?: Date
): Promise<HourlyQueryCount[]> {
  const pool = getDatabasePool();
  const start = startDate ?? new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
  const end = endDate ?? new Date();

  try {
    // Try to use the stored function
    const result = await pool.query<{
      hour: Date;
      query_count: string;
      avg_latency_ms: string | null;
      error_count: string;
    }>('SELECT * FROM get_hourly_query_counts($1, $2)', [start, end]);

    return result.rows.map((row) => ({
      hour: row.hour,
      queryCount: parseInt(row.query_count, 10),
      avgLatencyMs: row.avg_latency_ms ? parseFloat(row.avg_latency_ms) : null,
      errorCount: parseInt(row.error_count, 10),
    }));
  } catch {
    // Fallback to inline query
    const result = await pool.query<{
      hour: Date;
      query_count: string;
      avg_latency_ms: string | null;
      error_count: string;
    }>(`
      SELECT
        date_trunc('hour', created_at) as hour,
        COUNT(*)::TEXT as query_count,
        AVG(total_latency_ms)::TEXT as avg_latency_ms,
        COUNT(*) FILTER (WHERE status = 'failed')::TEXT as error_count
      FROM query_logs
      WHERE created_at >= $1 AND created_at < $2
      GROUP BY date_trunc('hour', created_at)
      ORDER BY hour
    `, [start, end]);

    return result.rows.map((row) => ({
      hour: row.hour,
      queryCount: parseInt(row.query_count, 10),
      avgLatencyMs: row.avg_latency_ms ? parseFloat(row.avg_latency_ms) : null,
      errorCount: parseInt(row.error_count, 10),
    }));
  }
}

/**
 * Gets top queries by frequency.
 */
export async function getTopQueries(
  limit: number = 20,
  startDate?: Date,
  endDate?: Date
): Promise<TopQuery[]> {
  const pool = getDatabasePool();
  const start = startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
  const end = endDate ?? new Date();

  try {
    // Try to use the stored function
    const result = await pool.query<{
      normalized_query: string;
      query_count: string;
      avg_latency_ms: string | null;
      avg_rating: string | null;
    }>('SELECT * FROM get_top_queries($1, $2, $3)', [limit, start, end]);

    return result.rows.map((row) => ({
      normalizedQuery: row.normalized_query,
      queryCount: parseInt(row.query_count, 10),
      avgLatencyMs: row.avg_latency_ms ? parseFloat(row.avg_latency_ms) : null,
      avgRating: row.avg_rating ? parseFloat(row.avg_rating) : null,
    }));
  } catch {
    // Fallback to inline query
    const result = await pool.query<{
      normalized_query: string;
      query_count: string;
      avg_latency_ms: string | null;
      avg_rating: string | null;
    }>(`
      SELECT
        COALESCE(normalized_query, query_text) as normalized_query,
        COUNT(*)::TEXT as query_count,
        AVG(total_latency_ms)::TEXT as avg_latency_ms,
        AVG(user_rating)::TEXT as avg_rating
      FROM query_logs
      WHERE created_at >= $1 AND created_at < $2
      GROUP BY COALESCE(normalized_query, query_text)
      ORDER BY query_count DESC
      LIMIT $3
    `, [start, end, limit]);

    return result.rows.map((row) => ({
      normalizedQuery: row.normalized_query,
      queryCount: parseInt(row.query_count, 10),
      avgLatencyMs: row.avg_latency_ms ? parseFloat(row.avg_latency_ms) : null,
      avgRating: row.avg_rating ? parseFloat(row.avg_rating) : null,
    }));
  }
}

/**
 * Gets LLM provider usage statistics.
 */
export async function getProviderStats(
  startDate?: Date,
  endDate?: Date
): Promise<ProviderStats[]> {
  const pool = getDatabasePool();
  const start = startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
  const end = endDate ?? new Date();

  try {
    // Try to use the stored function
    const result = await pool.query<{
      llm_provider: string;
      llm_model: string;
      query_count: string;
      total_tokens: string;
      total_cost: string;
      avg_latency_ms: string | null;
      error_rate: string;
    }>('SELECT * FROM get_provider_stats($1, $2)', [start, end]);

    return result.rows.map((row) => ({
      llmProvider: row.llm_provider,
      llmModel: row.llm_model,
      queryCount: parseInt(row.query_count, 10),
      totalTokens: parseInt(row.total_tokens, 10),
      totalCost: parseFloat(row.total_cost),
      avgLatencyMs: row.avg_latency_ms ? parseFloat(row.avg_latency_ms) : null,
      errorRate: parseFloat(row.error_rate),
    }));
  } catch {
    // Fallback to inline query
    const result = await pool.query<{
      llm_provider: string;
      llm_model: string;
      query_count: string;
      total_tokens: string;
      total_cost: string;
      avg_latency_ms: string | null;
      error_rate: string;
    }>(`
      SELECT
        llm_provider,
        llm_model,
        COUNT(*)::TEXT as query_count,
        COALESCE(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)), 0)::TEXT as total_tokens,
        COALESCE(SUM(estimated_cost_usd), 0)::TEXT as total_cost,
        AVG(generation_latency_ms)::TEXT as avg_latency_ms,
        (COUNT(*) FILTER (WHERE status = 'failed')::NUMERIC / NULLIF(COUNT(*), 0) * 100)::TEXT as error_rate
      FROM query_logs
      WHERE created_at >= $1
        AND created_at < $2
        AND llm_provider IS NOT NULL
      GROUP BY llm_provider, llm_model
      ORDER BY query_count DESC
    `, [start, end]);

    return result.rows.map((row) => ({
      llmProvider: row.llm_provider,
      llmModel: row.llm_model,
      queryCount: parseInt(row.query_count, 10),
      totalTokens: parseInt(row.total_tokens, 10),
      totalCost: parseFloat(row.total_cost),
      avgLatencyMs: row.avg_latency_ms ? parseFloat(row.avg_latency_ms) : null,
      errorRate: parseFloat(row.error_rate || '0'),
    }));
  }
}

/**
 * Checks if a query log with the given query_id exists.
 */
export async function queryLogExists(queryId: string): Promise<boolean> {
  const pool = getDatabasePool();

  const result = await pool.query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM query_logs WHERE query_id = $1) as exists',
    [queryId]
  );

  return result.rows[0]?.exists ?? false;
}

/**
 * Searches query logs by query text.
 */
export async function searchQueryLogs(
  searchText: string,
  limit: number = 50
): Promise<QueryLog[]> {
  const pool = getDatabasePool();

  const tsQuery = buildTsQueryString(searchText);
  if (!tsQuery) {
    return [];
  }

  const query = `
    SELECT *
    FROM query_logs
    WHERE to_tsvector('simple', query_text) @@ to_tsquery('simple', $1)
    ORDER BY ts_rank(to_tsvector('simple', query_text), to_tsquery('simple', $1)) DESC,
             created_at DESC
    LIMIT $2
  `;

  const result = await pool.query<QueryLogRow>(query, [tsQuery, limit]);
  return result.rows.map(rowToQueryLog);
}
