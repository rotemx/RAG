/**
 * Qdrant module exports
 *
 * This module provides all Qdrant-related functionality for the Israeli Law RAG project.
 */

// Configuration
export {
  QdrantConfigSchema,
  type QdrantConfig,
  DEFAULT_QDRANT_CONFIG,
  loadQdrantConfig,
  validateQdrantEnv,
  // Cluster settings
  QdrantCloudRegion,
  type QdrantCloudRegion as QdrantCloudRegionType,
  QdrantCloudTier,
  type QdrantCloudTier as QdrantCloudTierType,
  ClusterSettingsSchema,
  type ClusterSettings,
  DEFAULT_CLUSTER_SETTINGS,
  // Capacity planning
  CapacityPlanSchema,
  type CapacityPlan,
  type CapacityEstimate,
  estimateCapacity,
  estimateIsraeliLawsCapacity,
} from './config.js';

// Client
export {
  QdrantClient,
  createQdrantClient,
  getQdrantClient,
  resetQdrantClient,
  checkClusterHealth,
  collectionExists,
  createIsraeliLawsCollection,
  getIsraeliLawsCollectionInfo,
  createPayloadIndexes,
  ISRAELI_LAWS_PAYLOAD_INDEXES,
  // Cluster diagnostics
  runClusterDiagnostics,
  verifyClusterSettings,
  formatDiagnosticsReport,
  formatSettingsVerification,
  type ClusterHealthResult,
  type CollectionExistsResult,
  type CreateCollectionResult,
  type CollectionInfoResult,
  type PayloadIndexField,
  type CreatePayloadIndexResult,
  type CreatePayloadIndexesResult,
  type ClusterDiagnostics,
  type ClusterSettingsVerification,
} from './client.js';

// Types
export {
  // Error types
  VectorStoreError,
  VectorStoreErrorCode,
  VectorStoreErrorCodeSchema,
  isVectorStoreError,
  // Payload types
  IsraeliLawPayloadSchema,
  type IsraeliLawPayload,
  // Point types
  VectorPointSchema,
  type VectorPoint,
  CreateVectorPointInputSchema,
  type CreateVectorPointInput,
  // Search types
  SearchFilterSchema,
  type SearchFilter,
  SearchOptionsSchema,
  type SearchOptions,
  SearchResultSchema,
  type SearchResult,
  SearchResponseSchema,
  type SearchResponse,
  // Upsert types
  UpsertOptionsSchema,
  type UpsertOptions,
  UpsertResultSchema,
  type UpsertResult,
  BatchUpsertResultSchema,
  type BatchUpsertResult,
  // Delete types
  DeleteOptionsSchema,
  type DeleteOptions,
  DeleteCriteriaSchema,
  type DeleteCriteria,
  DeleteResultSchema,
  type DeleteResult,
  // Service config
  VectorStoreServiceConfigSchema,
  type VectorStoreServiceConfig,
  createDefaultVectorStoreConfig,
  // Utility functions
  generatePointId,
  validateVectorDimensions,
  formatPayloadForQdrant,
  parsePayloadFromQdrant,
} from './types.js';

// Vector Store Service
export {
  VectorStoreService,
  createVectorStoreService,
  getVectorStoreService,
  resetVectorStoreService,
  createVectorStoreServiceWithConfig,
} from './vector-store-service.js';
