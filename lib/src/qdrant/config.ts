/**
 * Qdrant Cloud Configuration
 *
 * This module provides configuration for connecting to Qdrant Cloud.
 * Configuration values are read from environment variables.
 */

import { z } from 'zod';

// =============================================================================
// Cluster Settings Schema
// =============================================================================

/**
 * Recommended Qdrant Cloud regions for optimal latency with Vercel
 */
export const QdrantCloudRegion = {
  /** AWS US East (Virginia) - Recommended for Vercel */
  AWS_US_EAST_1: 'aws-us-east-1',
  /** AWS EU West (Ireland) */
  AWS_EU_WEST_1: 'aws-eu-west-1',
  /** AWS AP Southeast (Singapore) */
  AWS_AP_SOUTHEAST_1: 'aws-ap-southeast-1',
  /** GCP US East */
  GCP_US_EAST1: 'gcp-us-east1',
  /** GCP Europe West */
  GCP_EUROPE_WEST1: 'gcp-europe-west1',
} as const;

export type QdrantCloudRegion = (typeof QdrantCloudRegion)[keyof typeof QdrantCloudRegion];

/**
 * Qdrant Cloud tier options
 */
export const QdrantCloudTier = {
  /** Free tier - 1GB storage, shared infrastructure */
  FREE: 'free',
  /** Starter tier - dedicated resources */
  STARTER: 'starter',
  /** Production tier - high availability */
  PRODUCTION: 'production',
} as const;

export type QdrantCloudTier = (typeof QdrantCloudTier)[keyof typeof QdrantCloudTier];

/**
 * Schema for Qdrant Cloud cluster settings
 * These are the settings used when creating a new cluster in Qdrant Cloud
 */
export const ClusterSettingsSchema = z.object({
  /** Cluster name (lowercase, numbers, hyphens only) */
  name: z.string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/,
      'Cluster name must be lowercase, can contain numbers and hyphens, and cannot start or end with a hyphen'),

  /** Cloud region for the cluster */
  region: z.enum([
    'aws-us-east-1',
    'aws-eu-west-1',
    'aws-ap-southeast-1',
    'gcp-us-east1',
    'gcp-europe-west1',
  ]).default('aws-us-east-1'),

  /** Cluster tier */
  tier: z.enum(['free', 'starter', 'production']).default('free'),

  /** Storage capacity in GB (free tier = 1GB) */
  storageGb: z.number().int().positive().default(1),

  /** RAM in GB (free tier = shared) */
  ramGb: z.number().positive().optional(),

  /** Number of nodes (free tier = 1) */
  nodes: z.number().int().positive().default(1),
});

export type ClusterSettings = z.infer<typeof ClusterSettingsSchema>;

/**
 * Default cluster settings for the Israeli Law RAG project (free tier)
 */
export const DEFAULT_CLUSTER_SETTINGS: ClusterSettings = {
  name: 'israeli-law-rag',
  region: 'aws-us-east-1',
  tier: 'free',
  storageGb: 1,
  nodes: 1,
};

// =============================================================================
// Capacity Planning Schema
// =============================================================================

/**
 * Schema for capacity planning estimates
 */
export const CapacityPlanSchema = z.object({
  /** Number of documents */
  documentCount: z.number().int().positive(),
  /** Average chunks per document */
  avgChunksPerDocument: z.number().positive().default(10),
  /** Vector dimensions */
  vectorDimensions: z.number().int().positive().default(1024),
  /** Average payload size in bytes */
  avgPayloadSizeBytes: z.number().int().positive().default(2048),
});

export type CapacityPlan = z.infer<typeof CapacityPlanSchema>;

/**
 * Result of capacity estimation
 */
export interface CapacityEstimate {
  /** Total estimated vectors */
  totalVectors: number;
  /** Vector storage in MB */
  vectorStorageMb: number;
  /** Payload storage in MB */
  payloadStorageMb: number;
  /** Total storage in MB */
  totalStorageMb: number;
  /** Whether it fits in free tier (1GB) */
  fitsInFreeTier: boolean;
  /** Recommended tier */
  recommendedTier: QdrantCloudTier;
  /** Details breakdown */
  breakdown: {
    bytesPerVector: number;
    totalVectorBytes: number;
    totalPayloadBytes: number;
  };
}

/**
 * Estimates storage requirements for the given capacity plan
 */
export function estimateCapacity(plan: CapacityPlan): CapacityEstimate {
  const validatedPlan = CapacityPlanSchema.parse(plan);

  const totalVectors = validatedPlan.documentCount * validatedPlan.avgChunksPerDocument;
  const bytesPerVector = validatedPlan.vectorDimensions * 4; // 4 bytes per float32
  const totalVectorBytes = totalVectors * bytesPerVector;
  const totalPayloadBytes = totalVectors * validatedPlan.avgPayloadSizeBytes;

  const vectorStorageMb = totalVectorBytes / (1024 * 1024);
  const payloadStorageMb = totalPayloadBytes / (1024 * 1024);
  const totalStorageMb = vectorStorageMb + payloadStorageMb;

  // Free tier is 1GB (1024 MB), leave some headroom
  const fitsInFreeTier = totalStorageMb < 900;

  let recommendedTier: QdrantCloudTier;
  if (totalStorageMb < 900) {
    recommendedTier = 'free';
  } else if (totalStorageMb < 5000) {
    recommendedTier = 'starter';
  } else {
    recommendedTier = 'production';
  }

  return {
    totalVectors,
    vectorStorageMb: Math.round(vectorStorageMb * 100) / 100,
    payloadStorageMb: Math.round(payloadStorageMb * 100) / 100,
    totalStorageMb: Math.round(totalStorageMb * 100) / 100,
    fitsInFreeTier,
    recommendedTier,
    breakdown: {
      bytesPerVector,
      totalVectorBytes,
      totalPayloadBytes,
    },
  };
}

/**
 * Estimates capacity for the Israeli Law RAG project
 * Based on ~3,900 law PDFs with ~10 chunks each
 */
export function estimateIsraeliLawsCapacity(): CapacityEstimate {
  return estimateCapacity({
    documentCount: 3900,
    avgChunksPerDocument: 10,
    vectorDimensions: 1024,
    avgPayloadSizeBytes: 2048, // text content + metadata
  });
}

// =============================================================================
// Main Configuration Schema
// =============================================================================

/**
 * Qdrant configuration schema with validation
 */
export const QdrantConfigSchema = z.object({
  /** Qdrant Cloud cluster URL (e.g., https://xxx.us-east.aws.cloud.qdrant.io:6333) */
  url: z.string().url().min(1),

  /** Qdrant API key for authentication */
  apiKey: z.string().min(1),

  /** Collection name for Israeli laws vectors */
  collectionName: z.string().default('israeli_laws'),

  /** Vector dimensions (must match embedding model) */
  vectorSize: z.number().int().positive().default(1024),

  /** Distance metric for similarity search */
  distance: z.enum(['Cosine', 'Euclid', 'Dot']).default('Cosine'),

  /** Whether to use on-disk payload storage (recommended for large payloads) */
  onDiskPayload: z.boolean().default(true),

  /** Request timeout in milliseconds */
  timeout: z.number().int().positive().default(30000),
});

export type QdrantConfig = z.infer<typeof QdrantConfigSchema>;

/**
 * Default configuration values for the Israeli Law RAG project
 */
export const DEFAULT_QDRANT_CONFIG = {
  collectionName: 'israeli_laws',
  vectorSize: 1024, // multilingual-e5-large dimensions
  distance: 'Cosine' as const,
  onDiskPayload: true,
  timeout: 30000,
} as const;

/**
 * Loads Qdrant configuration from environment variables.
 *
 * Required environment variables:
 * - QDRANT_URL: Full URL to Qdrant Cloud cluster
 * - QDRANT_API_KEY: API key for authentication
 *
 * Optional environment variables:
 * - QDRANT_COLLECTION_NAME: Collection name (default: 'israeli_laws')
 * - QDRANT_VECTOR_SIZE: Vector dimensions (default: 1024)
 * - QDRANT_TIMEOUT: Request timeout in ms (default: 30000)
 *
 * @throws {z.ZodError} If required environment variables are missing or invalid
 */
export function loadQdrantConfig(): QdrantConfig {
  const rawConfig = {
    url: process.env['QDRANT_URL'],
    apiKey: process.env['QDRANT_API_KEY'],
    collectionName:
      process.env['QDRANT_COLLECTION_NAME'] ?? DEFAULT_QDRANT_CONFIG.collectionName,
    vectorSize: process.env['QDRANT_VECTOR_SIZE']
      ? parseInt(process.env['QDRANT_VECTOR_SIZE'], 10)
      : DEFAULT_QDRANT_CONFIG.vectorSize,
    distance: DEFAULT_QDRANT_CONFIG.distance,
    onDiskPayload: DEFAULT_QDRANT_CONFIG.onDiskPayload,
    timeout: process.env['QDRANT_TIMEOUT']
      ? parseInt(process.env['QDRANT_TIMEOUT'], 10)
      : DEFAULT_QDRANT_CONFIG.timeout,
  };

  return QdrantConfigSchema.parse(rawConfig);
}

/**
 * Validates that all required Qdrant environment variables are set.
 * Returns an object with validation results without throwing.
 */
export function validateQdrantEnv(): {
  isValid: boolean;
  missingVars: string[];
  errors: string[];
} {
  const missingVars: string[] = [];
  const errors: string[] = [];

  if (!process.env['QDRANT_URL']) {
    missingVars.push('QDRANT_URL');
  } else {
    try {
      new URL(process.env['QDRANT_URL']);
    } catch {
      errors.push('QDRANT_URL is not a valid URL');
    }
  }

  if (!process.env['QDRANT_API_KEY']) {
    missingVars.push('QDRANT_API_KEY');
  }

  return {
    isValid: missingVars.length === 0 && errors.length === 0,
    missingVars,
    errors,
  };
}
