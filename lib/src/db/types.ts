/**
 * Database Types
 *
 * TypeScript type definitions for database entities used in the Israeli Law RAG project.
 */

import { z } from 'zod';

/**
 * Embedding status values for chunk processing
 */
export const EmbeddingStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type EmbeddingStatus = (typeof EmbeddingStatus)[keyof typeof EmbeddingStatus];

/**
 * Hebrew legal section types
 */
export const SectionType = {
  SECTION: 'סעיף',
  CHAPTER: 'פרק',
  PART: 'חלק',
  DEFINITIONS: 'הגדרות',
  SCHEDULE: 'תוספת',
  PREFACE: 'מבוא',
  OTHER: 'אחר',
} as const;

export type SectionType = (typeof SectionType)[keyof typeof SectionType];

/**
 * Zod schema for validating LawChunk data
 */
export const LawChunkSchema = z.object({
  id: z.number().int().positive().optional(),
  chunkId: z.string().min(1).max(100),
  lawId: z.number().int().positive(),
  lawItemId: z.string().min(1).max(50),
  chunkIndex: z.number().int().nonnegative(),
  content: z.string().min(1),
  tokenCount: z.number().int().nonnegative().nullable().optional(),
  charCount: z.number().int().positive(),
  startPosition: z.number().int().nonnegative().nullable().optional(),
  endPosition: z.number().int().nonnegative().nullable().optional(),
  sectionTitle: z.string().nullable().optional(),
  sectionType: z.string().max(50).nullable().optional(),
  sectionNumber: z.string().max(50).nullable().optional(),
  hasOverlapBefore: z.boolean().default(false),
  hasOverlapAfter: z.boolean().default(false),
  qdrantPointId: z.string().uuid().nullable().optional(),
  embeddingStatus: z.enum(['pending', 'processing', 'completed', 'failed']).default('pending'),
  embeddingError: z.string().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  embeddedAt: z.date().nullable().optional(),
});

export type LawChunk = z.infer<typeof LawChunkSchema>;

/**
 * Input type for creating a new law chunk (without auto-generated fields)
 */
export const CreateLawChunkInputSchema = LawChunkSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  embeddedAt: true,
  qdrantPointId: true,
  embeddingStatus: true,
  embeddingError: true,
}).extend({
  embeddingStatus: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
});

export type CreateLawChunkInput = z.infer<typeof CreateLawChunkInputSchema>;

/**
 * Input type for updating an existing law chunk
 */
export const UpdateLawChunkInputSchema = z.object({
  qdrantPointId: z.string().uuid().optional(),
  embeddingStatus: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  embeddingError: z.string().nullable().optional(),
  embeddedAt: z.date().nullable().optional(),
});

export type UpdateLawChunkInput = z.infer<typeof UpdateLawChunkInputSchema>;

/**
 * Database row type (snake_case matching PostgreSQL columns)
 */
export interface LawChunkRow {
  id: number;
  chunk_id: string;
  law_id: number;
  law_item_id: string;
  chunk_index: number;
  content: string;
  token_count: number | null;
  char_count: number;
  start_position: number | null;
  end_position: number | null;
  section_title: string | null;
  section_type: string | null;
  section_number: string | null;
  has_overlap_before: boolean;
  has_overlap_after: boolean;
  qdrant_point_id: string | null;
  embedding_status: EmbeddingStatus;
  embedding_error: string | null;
  created_at: Date;
  updated_at: Date;
  embedded_at: Date | null;
}

/**
 * Converts a database row to a LawChunk object (snake_case to camelCase)
 */
export function rowToLawChunk(row: LawChunkRow): LawChunk {
  return {
    id: row.id,
    chunkId: row.chunk_id,
    lawId: row.law_id,
    lawItemId: row.law_item_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    tokenCount: row.token_count,
    charCount: row.char_count,
    startPosition: row.start_position,
    endPosition: row.end_position,
    sectionTitle: row.section_title,
    sectionType: row.section_type,
    sectionNumber: row.section_number,
    hasOverlapBefore: row.has_overlap_before,
    hasOverlapAfter: row.has_overlap_after,
    qdrantPointId: row.qdrant_point_id,
    embeddingStatus: row.embedding_status,
    embeddingError: row.embedding_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    embeddedAt: row.embedded_at,
  };
}

/**
 * Query options for retrieving law chunks
 */
export interface GetLawChunksOptions {
  /** Filter by law ID (internal database ID) */
  lawId?: number;
  /** Filter by law item ID (Knesset ID) */
  lawItemId?: string;
  /** Filter by embedding status */
  embeddingStatus?: EmbeddingStatus;
  /** Maximum number of chunks to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Order by field */
  orderBy?: 'chunk_index' | 'created_at' | 'updated_at';
  /** Order direction */
  orderDirection?: 'ASC' | 'DESC';
}

/**
 * Result of batch operations
 */
export interface BatchOperationResult {
  /** Number of records successfully processed */
  success: number;
  /** Number of records that failed */
  failed: number;
  /** Error messages for failed records */
  errors: string[];
}

/**
 * Statistics for law chunks
 */
export interface LawChunksStats {
  /** Total number of chunks */
  totalChunks: number;
  /** Number of chunks pending embedding */
  pendingEmbedding: number;
  /** Number of chunks with completed embedding */
  completedEmbedding: number;
  /** Number of chunks with failed embedding */
  failedEmbedding: number;
  /** Number of unique laws with chunks */
  uniqueLaws: number;
  /** Average chunks per law */
  avgChunksPerLaw: number;
  /** Total character count across all chunks */
  totalCharacters: number;
}

/**
 * Generates a deterministic chunk ID from law_item_id and chunk_index
 */
export function generateChunkId(lawItemId: string, chunkIndex: number): string {
  return `${lawItemId}_${chunkIndex}`;
}

/**
 * Parses a chunk ID to extract law_item_id and chunk_index
 */
export function parseChunkId(chunkId: string): { lawItemId: string; chunkIndex: number } | null {
  const match = chunkId.match(/^(.+)_(\d+)$/);
  if (!match || !match[1] || !match[2]) {
    return null;
  }
  return {
    lawItemId: match[1],
    chunkIndex: parseInt(match[2], 10),
  };
}

// ============================================================================
// Topic Types (Auto-generated Categories)
// ============================================================================

/**
 * Topic generation methods
 */
export const TopicGenerationMethod = {
  CLUSTERING: 'clustering',
  MANUAL: 'manual',
  LLM_SUGGESTED: 'llm_suggested',
  HYBRID: 'hybrid',
} as const;

export type TopicGenerationMethod = (typeof TopicGenerationMethod)[keyof typeof TopicGenerationMethod];

/**
 * Zod schema for validating Topic data
 */
export const TopicSchema = z.object({
  id: z.number().int().positive().optional(),
  topicId: z.string().min(1).max(50),
  nameHe: z.string().min(1).max(255),
  nameEn: z.string().max(255).nullable().optional(),
  descriptionHe: z.string().nullable().optional(),
  descriptionEn: z.string().nullable().optional(),
  keywordsHe: z.array(z.string()).nullable().optional(),
  keywordsEn: z.array(z.string()).nullable().optional(),
  representativeLawIds: z.array(z.string()).nullable().optional(),
  centroidEmbeddingRef: z.string().max(100).nullable().optional(),
  lawCount: z.number().int().nonnegative().default(0),
  clusterQualityScore: z.number().min(0).max(1).nullable().optional(),
  generationMethod: z.enum(['clustering', 'manual', 'llm_suggested', 'hybrid']).default('clustering'),
  clusteringAlgorithm: z.string().max(100).nullable().optional(),
  llmModel: z.string().max(100).nullable().optional(),
  parentTopicId: z.number().int().positive().nullable().optional(),
  depthLevel: z.number().int().nonnegative().default(0),
  displayOrder: z.number().int().nonnegative().default(0),
  isActive: z.boolean().default(true),
  isReviewed: z.boolean().default(false),
  reviewedAt: z.date().nullable().optional(),
  reviewedBy: z.string().max(255).nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  version: z.number().int().positive().default(1),
});

export type Topic = z.infer<typeof TopicSchema>;

/**
 * Input type for creating a new topic (without auto-generated fields)
 */
export const CreateTopicInputSchema = TopicSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lawCount: true,
  version: true,
}).extend({
  lawCount: z.number().int().nonnegative().optional(),
  version: z.number().int().positive().optional(),
});

export type CreateTopicInput = z.infer<typeof CreateTopicInputSchema>;

/**
 * Input type for updating an existing topic
 */
export const UpdateTopicInputSchema = z.object({
  nameHe: z.string().min(1).max(255).optional(),
  nameEn: z.string().max(255).nullable().optional(),
  descriptionHe: z.string().nullable().optional(),
  descriptionEn: z.string().nullable().optional(),
  keywordsHe: z.array(z.string()).nullable().optional(),
  keywordsEn: z.array(z.string()).nullable().optional(),
  representativeLawIds: z.array(z.string()).nullable().optional(),
  centroidEmbeddingRef: z.string().max(100).nullable().optional(),
  lawCount: z.number().int().nonnegative().optional(),
  clusterQualityScore: z.number().min(0).max(1).nullable().optional(),
  parentTopicId: z.number().int().positive().nullable().optional(),
  depthLevel: z.number().int().nonnegative().optional(),
  displayOrder: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
  isReviewed: z.boolean().optional(),
  reviewedAt: z.date().nullable().optional(),
  reviewedBy: z.string().max(255).nullable().optional(),
});

export type UpdateTopicInput = z.infer<typeof UpdateTopicInputSchema>;

/**
 * Database row type for topics (snake_case matching PostgreSQL columns)
 */
export interface TopicRow {
  id: number;
  topic_id: string;
  name_he: string;
  name_en: string | null;
  description_he: string | null;
  description_en: string | null;
  keywords_he: string[] | null;
  keywords_en: string[] | null;
  representative_law_ids: string[] | null;
  centroid_embedding_ref: string | null;
  law_count: number;
  cluster_quality_score: number | null;
  generation_method: TopicGenerationMethod;
  clustering_algorithm: string | null;
  llm_model: string | null;
  parent_topic_id: number | null;
  depth_level: number;
  display_order: number;
  is_active: boolean;
  is_reviewed: boolean;
  reviewed_at: Date | null;
  reviewed_by: string | null;
  created_at: Date;
  updated_at: Date;
  version: number;
}

/**
 * Converts a database row to a Topic object (snake_case to camelCase)
 */
export function rowToTopic(row: TopicRow): Topic {
  return {
    id: row.id,
    topicId: row.topic_id,
    nameHe: row.name_he,
    nameEn: row.name_en,
    descriptionHe: row.description_he,
    descriptionEn: row.description_en,
    keywordsHe: row.keywords_he,
    keywordsEn: row.keywords_en,
    representativeLawIds: row.representative_law_ids,
    centroidEmbeddingRef: row.centroid_embedding_ref,
    lawCount: row.law_count,
    clusterQualityScore: row.cluster_quality_score ? Number(row.cluster_quality_score) : null,
    generationMethod: row.generation_method,
    clusteringAlgorithm: row.clustering_algorithm,
    llmModel: row.llm_model,
    parentTopicId: row.parent_topic_id,
    depthLevel: row.depth_level,
    displayOrder: row.display_order,
    isActive: row.is_active,
    isReviewed: row.is_reviewed,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

/**
 * Query options for retrieving topics
 */
export interface GetTopicsOptions {
  /** Filter by parent topic ID (null for root topics) */
  parentTopicId?: number | null;
  /** Filter by active status */
  isActive?: boolean;
  /** Filter by reviewed status */
  isReviewed?: boolean;
  /** Filter by generation method */
  generationMethod?: TopicGenerationMethod;
  /** Maximum number of topics to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Order by field */
  orderBy?: 'display_order' | 'law_count' | 'name_he' | 'created_at' | 'updated_at';
  /** Order direction */
  orderDirection?: 'ASC' | 'DESC';
}

/**
 * Statistics for topics
 */
export interface TopicsStats {
  /** Total number of topics */
  totalTopics: number;
  /** Number of active topics */
  activeTopics: number;
  /** Number of reviewed topics */
  reviewedTopics: number;
  /** Number of root-level topics (no parent) */
  rootTopics: number;
  /** Total laws assigned across all topics */
  totalLawsAssigned: number;
  /** Average laws per topic */
  avgLawsPerTopic: number;
  /** Average cluster quality score */
  avgClusterQuality: number | null;
}

/**
 * Generates a deterministic topic ID from cluster index
 */
export function generateTopicId(clusterIndex: number): string {
  return `topic_${clusterIndex}`;
}

/**
 * Parses a topic ID to extract the cluster index
 */
export function parseTopicId(topicId: string): number | null {
  const match = topicId.match(/^topic_(\d+)$/);
  if (!match || !match[1]) {
    return null;
  }
  return parseInt(match[1], 10);
}

// ============================================================================
// LawTopic Types (Many-to-Many Junction Table)
// ============================================================================

/**
 * Assignment methods for law-topic relationships
 */
export const AssignmentMethod = {
  CLUSTERING: 'clustering',
  MANUAL: 'manual',
  LLM_SUGGESTED: 'llm_suggested',
  KEYWORD_MATCH: 'keyword_match',
  HYBRID: 'hybrid',
} as const;

export type AssignmentMethod = (typeof AssignmentMethod)[keyof typeof AssignmentMethod];

/**
 * Zod schema for validating LawTopic data
 */
export const LawTopicSchema = z.object({
  id: z.number().int().positive().optional(),
  lawId: z.number().int().positive(),
  topicId: z.number().int().positive(),
  relevanceScore: z.number().min(0).max(1).default(1.0),
  topicRank: z.number().int().positive().default(1),
  isPrimary: z.boolean().default(false),
  assignmentMethod: z.enum(['clustering', 'manual', 'llm_suggested', 'keyword_match', 'hybrid']).default('clustering'),
  assignmentConfidence: z.number().min(0).max(1).nullable().optional(),
  isReviewed: z.boolean().default(false),
  reviewedAt: z.date().nullable().optional(),
  reviewedBy: z.string().max(255).nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type LawTopic = z.infer<typeof LawTopicSchema>;

/**
 * Input type for creating a new law-topic relationship (without auto-generated fields)
 */
export const CreateLawTopicInputSchema = LawTopicSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  relevanceScore: z.number().min(0).max(1).optional(),
  topicRank: z.number().int().positive().optional(),
  isPrimary: z.boolean().optional(),
  assignmentMethod: z.enum(['clustering', 'manual', 'llm_suggested', 'keyword_match', 'hybrid']).optional(),
});

export type CreateLawTopicInput = z.infer<typeof CreateLawTopicInputSchema>;

/**
 * Input type for updating an existing law-topic relationship
 */
export const UpdateLawTopicInputSchema = z.object({
  relevanceScore: z.number().min(0).max(1).optional(),
  topicRank: z.number().int().positive().optional(),
  isPrimary: z.boolean().optional(),
  assignmentConfidence: z.number().min(0).max(1).nullable().optional(),
  isReviewed: z.boolean().optional(),
  reviewedAt: z.date().nullable().optional(),
  reviewedBy: z.string().max(255).nullable().optional(),
});

export type UpdateLawTopicInput = z.infer<typeof UpdateLawTopicInputSchema>;

/**
 * Database row type for law_topics (snake_case matching PostgreSQL columns)
 */
export interface LawTopicRow {
  id: number;
  law_id: number;
  topic_id: number;
  relevance_score: number;
  topic_rank: number;
  is_primary: boolean;
  assignment_method: AssignmentMethod;
  assignment_confidence: number | null;
  is_reviewed: boolean;
  reviewed_at: Date | null;
  reviewed_by: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Converts a database row to a LawTopic object (snake_case to camelCase)
 */
export function rowToLawTopic(row: LawTopicRow): LawTopic {
  return {
    id: row.id,
    lawId: row.law_id,
    topicId: row.topic_id,
    relevanceScore: Number(row.relevance_score),
    topicRank: row.topic_rank,
    isPrimary: row.is_primary,
    assignmentMethod: row.assignment_method,
    assignmentConfidence: row.assignment_confidence ? Number(row.assignment_confidence) : null,
    isReviewed: row.is_reviewed,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Query options for retrieving law-topic relationships
 */
export interface GetLawTopicsOptions {
  /** Filter by law ID */
  lawId?: number;
  /** Filter by topic ID */
  topicId?: number;
  /** Filter by primary status */
  isPrimary?: boolean;
  /** Filter by reviewed status */
  isReviewed?: boolean;
  /** Filter by assignment method */
  assignmentMethod?: AssignmentMethod;
  /** Minimum relevance score */
  minRelevanceScore?: number;
  /** Maximum number of results to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Order by field */
  orderBy?: 'relevance_score' | 'topic_rank' | 'created_at' | 'updated_at';
  /** Order direction */
  orderDirection?: 'ASC' | 'DESC';
}

/**
 * Statistics for law-topic relationships
 */
export interface LawTopicsStats {
  /** Total number of law-topic relationships */
  totalRelationships: number;
  /** Number of laws with at least one topic */
  lawsWithTopics: number;
  /** Number of topics with at least one law */
  topicsWithLaws: number;
  /** Average topics per law */
  avgTopicsPerLaw: number;
  /** Average laws per topic */
  avgLawsPerTopic: number;
  /** Number of primary topic assignments */
  primaryAssignments: number;
  /** Average relevance score */
  avgRelevanceScore: number;
}

/**
 * Extended law-topic with topic details (for joins)
 */
export interface LawTopicWithTopic extends LawTopic {
  topic?: Topic;
}

/**
 * Extended law-topic with law details (for joins)
 */
export interface LawTopicWithLaw extends LawTopic {
  lawItemId?: string;
}

// ============================================================================
// Full-Text Search Types
// ============================================================================

/**
 * Result from full-text search on law chunks
 */
export interface FtsChunkResult {
  /** Chunk identifier */
  chunkId: string;
  /** Internal law ID */
  lawId: number;
  /** Knesset law item ID */
  lawItemId: string;
  /** Chunk index within the law document */
  chunkIndex: number;
  /** Full chunk content */
  content: string;
  /** Section title if available */
  sectionTitle: string | null;
  /** Section type (סעיף, פרק, etc.) */
  sectionType: string | null;
  /** Relevance rank score */
  rank: number;
  /** Highlighted excerpt with search terms marked */
  headline: string;
}

/**
 * Database row type for FTS chunk results (snake_case)
 */
export interface FtsChunkResultRow {
  chunk_id: string;
  law_id: number;
  law_item_id: string;
  chunk_index: number;
  content: string;
  section_title: string | null;
  section_type: string | null;
  rank: number;
  headline: string;
}

/**
 * Converts FTS chunk result row to typed object
 */
export function rowToFtsChunkResult(row: FtsChunkResultRow): FtsChunkResult {
  return {
    chunkId: row.chunk_id,
    lawId: row.law_id,
    lawItemId: row.law_item_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    sectionTitle: row.section_title,
    sectionType: row.section_type,
    rank: Number(row.rank),
    headline: row.headline,
  };
}

/**
 * Result from full-text search on laws
 */
export interface FtsLawResult {
  /** Internal law ID */
  id: number;
  /** Knesset law item ID */
  lawItemId: string;
  /** Law name */
  lawName: string;
  /** Publication date */
  publicationDate: Date | null;
  /** Relevance rank score */
  rank: number;
  /** Highlighted excerpt with search terms marked */
  headline: string;
}

/**
 * Database row type for FTS law results (snake_case)
 */
export interface FtsLawResultRow {
  id: number;
  law_item_id: string;
  law_name: string;
  publication_date: Date | null;
  rank: number;
  headline: string;
}

/**
 * Converts FTS law result row to typed object
 */
export function rowToFtsLawResult(row: FtsLawResultRow): FtsLawResult {
  return {
    id: row.id,
    lawItemId: row.law_item_id,
    lawName: row.law_name,
    publicationDate: row.publication_date,
    rank: Number(row.rank),
    headline: row.headline,
  };
}

/**
 * Result from full-text search on topics
 */
export interface FtsTopicResult {
  /** Internal topic ID */
  id: number;
  /** Topic identifier */
  topicId: string;
  /** Hebrew topic name */
  nameHe: string;
  /** Hebrew topic description */
  descriptionHe: string | null;
  /** Number of laws in this topic */
  lawCount: number;
  /** Relevance rank score */
  rank: number;
  /** Highlighted excerpt with search terms marked */
  headline: string;
}

/**
 * Database row type for FTS topic results (snake_case)
 */
export interface FtsTopicResultRow {
  id: number;
  topic_id: string;
  name_he: string;
  description_he: string | null;
  law_count: number;
  rank: number;
  headline: string;
}

/**
 * Converts FTS topic result row to typed object
 */
export function rowToFtsTopicResult(row: FtsTopicResultRow): FtsTopicResult {
  return {
    id: row.id,
    topicId: row.topic_id,
    nameHe: row.name_he,
    descriptionHe: row.description_he,
    lawCount: row.law_count,
    rank: Number(row.rank),
    headline: row.headline,
  };
}

/**
 * Result from fuzzy search on laws using trigram similarity
 */
export interface FuzzyLawResult {
  /** Internal law ID */
  id: number;
  /** Knesset law item ID */
  lawItemId: string;
  /** Law name */
  lawName: string;
  /** Publication date */
  publicationDate: Date | null;
  /** Similarity score (0-1) */
  similarity: number;
}

/**
 * Database row type for fuzzy law results (snake_case)
 */
export interface FuzzyLawResultRow {
  id: number;
  law_item_id: string;
  law_name: string;
  publication_date: Date | null;
  similarity: number;
}

/**
 * Converts fuzzy law result row to typed object
 */
export function rowToFuzzyLawResult(row: FuzzyLawResultRow): FuzzyLawResult {
  return {
    id: row.id,
    lawItemId: row.law_item_id,
    lawName: row.law_name,
    publicationDate: row.publication_date,
    similarity: Number(row.similarity),
  };
}

/**
 * Options for full-text search queries
 */
export interface FtsSearchOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Minimum relevance rank threshold */
  minRank?: number;
}

/**
 * Options for fuzzy search queries
 */
export interface FuzzySearchOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Minimum similarity threshold (0-1) */
  similarityThreshold?: number;
}

/**
 * Options for topic FTS search
 */
export interface FtsTopicSearchOptions extends FtsSearchOptions {
  /** Only return active topics */
  activeOnly?: boolean;
}

/**
 * Combined search result for hybrid RAG retrieval
 */
export interface HybridSearchResult<T> {
  /** The search result item */
  item: T;
  /** Vector similarity score (if from vector search) */
  vectorScore?: number;
  /** Full-text search rank (if from FTS) */
  ftsRank?: number;
  /** Combined/fused score */
  combinedScore: number;
  /** Source of this result */
  source: 'vector' | 'fts' | 'both';
}

// ============================================================================
// Query Log Types (Analytics)
// ============================================================================

/**
 * Query status values
 */
export const QueryStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  TIMEOUT: 'timeout',
} as const;

export type QueryStatus = (typeof QueryStatus)[keyof typeof QueryStatus];

/**
 * Query source/origin values
 */
export const QuerySource = {
  CHAT: 'chat',
  SEARCH: 'search',
  API: 'api',
  INTERNAL: 'internal',
  TEST: 'test',
} as const;

export type QuerySource = (typeof QuerySource)[keyof typeof QuerySource];

/**
 * Zod schema for validating QueryLog data
 */
export const QueryLogSchema = z.object({
  id: z.number().int().positive().optional(),
  queryId: z.string().uuid(),
  sessionId: z.string().max(100).nullable().optional(),
  queryText: z.string().min(1),
  normalizedQuery: z.string().nullable().optional(),
  queryLanguage: z.string().max(10).default('he'),
  source: z.enum(['chat', 'search', 'api', 'internal', 'test']).default('chat'),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'timeout']).default('pending'),
  errorMessage: z.string().nullable().optional(),

  // Retrieval metrics
  chunksRetrieved: z.number().int().nonnegative().default(0),
  chunksUsed: z.number().int().nonnegative().default(0),
  vectorScores: z.array(z.number()).nullable().optional(),
  usedFts: z.boolean().default(false),
  searchFilters: z.record(z.unknown()).nullable().optional(),
  matchedTopicIds: z.array(z.number().int()).nullable().optional(),
  retrievedLawIds: z.array(z.number().int()).nullable().optional(),

  // LLM metrics
  llmProvider: z.string().max(50).nullable().optional(),
  llmModel: z.string().max(100).nullable().optional(),
  inputTokens: z.number().int().nonnegative().nullable().optional(),
  outputTokens: z.number().int().nonnegative().nullable().optional(),
  totalTokens: z.number().int().nonnegative().nullable().optional(),
  estimatedCostUsd: z.number().nonnegative().nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  maxTokens: z.number().int().positive().nullable().optional(),

  // Response metrics
  responseText: z.string().nullable().optional(),
  responseCharCount: z.number().int().nonnegative().nullable().optional(),
  citationCount: z.number().int().nonnegative().default(0),
  wasStreamed: z.boolean().default(false),

  // Performance metrics (in milliseconds)
  embeddingLatencyMs: z.number().int().nonnegative().nullable().optional(),
  retrievalLatencyMs: z.number().int().nonnegative().nullable().optional(),
  generationLatencyMs: z.number().int().nonnegative().nullable().optional(),
  totalLatencyMs: z.number().int().nonnegative().nullable().optional(),

  // User feedback
  userRating: z.number().int().min(1).max(5).nullable().optional(),
  userFeedback: z.string().nullable().optional(),
  feedbackAt: z.date().nullable().optional(),

  // Metadata
  clientInfo: z.record(z.unknown()).nullable().optional(),
  ipHash: z.string().max(64).nullable().optional(),
  requestMetadata: z.record(z.unknown()).nullable().optional(),
  tags: z.array(z.string().max(50)).nullable().optional(),

  // Timestamps
  createdAt: z.date().optional(),
  startedAt: z.date().nullable().optional(),
  completedAt: z.date().nullable().optional(),
  updatedAt: z.date().optional(),
});

export type QueryLog = z.infer<typeof QueryLogSchema>;

/**
 * Input type for creating a new query log (without auto-generated fields)
 */
export const CreateQueryLogInputSchema = QueryLogSchema.omit({
  id: true,
  queryId: true,
  totalTokens: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  queryId: z.string().uuid().optional(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'timeout']).optional(),
  source: z.enum(['chat', 'search', 'api', 'internal', 'test']).optional(),
});

export type CreateQueryLogInput = z.infer<typeof CreateQueryLogInputSchema>;

/**
 * Input type for updating an existing query log
 */
export const UpdateQueryLogInputSchema = z.object({
  normalizedQuery: z.string().nullable().optional(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'timeout']).optional(),
  errorMessage: z.string().nullable().optional(),

  // Retrieval metrics
  chunksRetrieved: z.number().int().nonnegative().optional(),
  chunksUsed: z.number().int().nonnegative().optional(),
  vectorScores: z.array(z.number()).nullable().optional(),
  usedFts: z.boolean().optional(),
  searchFilters: z.record(z.unknown()).nullable().optional(),
  matchedTopicIds: z.array(z.number().int()).nullable().optional(),
  retrievedLawIds: z.array(z.number().int()).nullable().optional(),

  // LLM metrics
  llmProvider: z.string().max(50).nullable().optional(),
  llmModel: z.string().max(100).nullable().optional(),
  inputTokens: z.number().int().nonnegative().nullable().optional(),
  outputTokens: z.number().int().nonnegative().nullable().optional(),
  estimatedCostUsd: z.number().nonnegative().nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  maxTokens: z.number().int().positive().nullable().optional(),

  // Response metrics
  responseText: z.string().nullable().optional(),
  responseCharCount: z.number().int().nonnegative().nullable().optional(),
  citationCount: z.number().int().nonnegative().optional(),
  wasStreamed: z.boolean().optional(),

  // Performance metrics
  embeddingLatencyMs: z.number().int().nonnegative().nullable().optional(),
  retrievalLatencyMs: z.number().int().nonnegative().nullable().optional(),
  generationLatencyMs: z.number().int().nonnegative().nullable().optional(),
  totalLatencyMs: z.number().int().nonnegative().nullable().optional(),

  // User feedback
  userRating: z.number().int().min(1).max(5).nullable().optional(),
  userFeedback: z.string().nullable().optional(),
  feedbackAt: z.date().nullable().optional(),

  // Timestamps
  startedAt: z.date().nullable().optional(),
  completedAt: z.date().nullable().optional(),
});

export type UpdateQueryLogInput = z.infer<typeof UpdateQueryLogInputSchema>;

/**
 * Database row type for query_logs (snake_case matching PostgreSQL columns)
 */
export interface QueryLogRow {
  id: number;
  query_id: string;
  session_id: string | null;
  query_text: string;
  normalized_query: string | null;
  query_language: string;
  source: QuerySource;
  status: QueryStatus;
  error_message: string | null;

  // Retrieval metrics
  chunks_retrieved: number;
  chunks_used: number;
  vector_scores: number[] | null;
  used_fts: boolean;
  search_filters: Record<string, unknown> | null;
  matched_topic_ids: number[] | null;
  retrieved_law_ids: number[] | null;

  // LLM metrics
  llm_provider: string | null;
  llm_model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  temperature: number | null;
  max_tokens: number | null;

  // Response metrics
  response_text: string | null;
  response_char_count: number | null;
  citation_count: number;
  was_streamed: boolean;

  // Performance metrics
  embedding_latency_ms: number | null;
  retrieval_latency_ms: number | null;
  generation_latency_ms: number | null;
  total_latency_ms: number | null;

  // User feedback
  user_rating: number | null;
  user_feedback: string | null;
  feedback_at: Date | null;

  // Metadata
  client_info: Record<string, unknown> | null;
  ip_hash: string | null;
  request_metadata: Record<string, unknown> | null;
  tags: string[] | null;

  // Timestamps
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  updated_at: Date;
}

/**
 * Converts a database row to a QueryLog object (snake_case to camelCase)
 */
export function rowToQueryLog(row: QueryLogRow): QueryLog {
  return {
    id: row.id,
    queryId: row.query_id,
    sessionId: row.session_id,
    queryText: row.query_text,
    normalizedQuery: row.normalized_query,
    queryLanguage: row.query_language,
    source: row.source,
    status: row.status,
    errorMessage: row.error_message,

    // Retrieval metrics
    chunksRetrieved: row.chunks_retrieved,
    chunksUsed: row.chunks_used,
    vectorScores: row.vector_scores,
    usedFts: row.used_fts,
    searchFilters: row.search_filters,
    matchedTopicIds: row.matched_topic_ids,
    retrievedLawIds: row.retrieved_law_ids,

    // LLM metrics
    llmProvider: row.llm_provider,
    llmModel: row.llm_model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    estimatedCostUsd: row.estimated_cost_usd ? Number(row.estimated_cost_usd) : null,
    temperature: row.temperature ? Number(row.temperature) : null,
    maxTokens: row.max_tokens,

    // Response metrics
    responseText: row.response_text,
    responseCharCount: row.response_char_count,
    citationCount: row.citation_count,
    wasStreamed: row.was_streamed,

    // Performance metrics
    embeddingLatencyMs: row.embedding_latency_ms,
    retrievalLatencyMs: row.retrieval_latency_ms,
    generationLatencyMs: row.generation_latency_ms,
    totalLatencyMs: row.total_latency_ms,

    // User feedback
    userRating: row.user_rating,
    userFeedback: row.user_feedback,
    feedbackAt: row.feedback_at,

    // Metadata
    clientInfo: row.client_info,
    ipHash: row.ip_hash,
    requestMetadata: row.request_metadata,
    tags: row.tags,

    // Timestamps
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Query options for retrieving query logs
 */
export interface GetQueryLogsOptions {
  /** Filter by session ID */
  sessionId?: string;
  /** Filter by status */
  status?: QueryStatus;
  /** Filter by source */
  source?: QuerySource;
  /** Filter by LLM provider */
  llmProvider?: string;
  /** Filter by date range (start) */
  startDate?: Date;
  /** Filter by date range (end) */
  endDate?: Date;
  /** Filter by minimum user rating */
  minRating?: number;
  /** Filter by tags (any match) */
  tags?: string[];
  /** Maximum number of results to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Order by field */
  orderBy?: 'created_at' | 'total_latency_ms' | 'total_tokens' | 'user_rating';
  /** Order direction */
  orderDirection?: 'ASC' | 'DESC';
}

/**
 * Statistics for query logs
 */
export interface QueryLogsStats {
  /** Total number of queries */
  totalQueries: number;
  /** Number of completed queries */
  completedQueries: number;
  /** Number of failed queries */
  failedQueries: number;
  /** Average total latency in milliseconds */
  avgLatencyMs: number | null;
  /** P50 (median) latency in milliseconds */
  p50LatencyMs: number | null;
  /** P95 latency in milliseconds */
  p95LatencyMs: number | null;
  /** P99 latency in milliseconds */
  p99LatencyMs: number | null;
  /** Total input tokens consumed */
  totalInputTokens: number;
  /** Total output tokens generated */
  totalOutputTokens: number;
  /** Total estimated cost in USD */
  totalEstimatedCost: number;
  /** Average chunks retrieved per query */
  avgChunksRetrieved: number | null;
  /** Average user rating */
  avgUserRating: number | null;
  /** Number of queries with user feedback */
  queriesWithFeedback: number;
}

/**
 * Hourly query count data for monitoring
 */
export interface HourlyQueryCount {
  /** Hour timestamp */
  hour: Date;
  /** Number of queries in this hour */
  queryCount: number;
  /** Average latency in this hour */
  avgLatencyMs: number | null;
  /** Number of errors in this hour */
  errorCount: number;
}

/**
 * Top query data for analysis
 */
export interface TopQuery {
  /** Normalized query text */
  normalizedQuery: string;
  /** Number of times this query was asked */
  queryCount: number;
  /** Average latency for this query */
  avgLatencyMs: number | null;
  /** Average user rating for this query */
  avgRating: number | null;
}

/**
 * Provider statistics for cost and usage tracking
 */
export interface ProviderStats {
  /** LLM provider name */
  llmProvider: string;
  /** LLM model name */
  llmModel: string;
  /** Number of queries using this provider/model */
  queryCount: number;
  /** Total tokens consumed */
  totalTokens: number;
  /** Total cost in USD */
  totalCost: number;
  /** Average generation latency */
  avgLatencyMs: number | null;
  /** Error rate as percentage */
  errorRate: number;
}
