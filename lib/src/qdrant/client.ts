/**
 * Qdrant Client
 *
 * This module provides a configured Qdrant client instance for the Israeli Law RAG project.
 * It wraps the @qdrant/js-client-rest library with project-specific configuration.
 */

import { QdrantClient } from '@qdrant/js-client-rest';

import {
  loadQdrantConfig,
  validateQdrantEnv,
  type QdrantConfig,
  DEFAULT_QDRANT_CONFIG,
} from './config.js';

/** Singleton client instance */
let clientInstance: QdrantClient | null = null;

/**
 * Creates a new Qdrant client with the provided configuration.
 *
 * @param config - Qdrant configuration (URL, API key, etc.)
 * @returns Configured QdrantClient instance
 */
export function createQdrantClient(config: QdrantConfig): QdrantClient {
  return new QdrantClient({
    url: config.url,
    apiKey: config.apiKey,
    timeout: config.timeout,
  });
}

/**
 * Gets or creates a singleton Qdrant client instance.
 * Uses environment variables for configuration.
 *
 * @throws {Error} If environment variables are not properly configured
 * @returns Configured QdrantClient instance
 */
export function getQdrantClient(): QdrantClient {
  if (clientInstance) {
    return clientInstance;
  }

  const validation = validateQdrantEnv();
  if (!validation.isValid) {
    const errorMessages: string[] = [];
    if (validation.missingVars.length > 0) {
      errorMessages.push(`Missing environment variables: ${validation.missingVars.join(', ')}`);
    }
    if (validation.errors.length > 0) {
      errorMessages.push(validation.errors.join('; '));
    }
    throw new Error(`Qdrant configuration error: ${errorMessages.join('. ')}`);
  }

  const config = loadQdrantConfig();
  clientInstance = createQdrantClient(config);
  return clientInstance;
}

/**
 * Resets the singleton client instance.
 * Useful for testing or when configuration changes.
 */
export function resetQdrantClient(): void {
  clientInstance = null;
}

/**
 * Cluster health check result
 */
export interface ClusterHealthResult {
  healthy: boolean;
  version?: string;
  collectionsCount?: number;
  error?: string;
}

/**
 * Checks the health of the Qdrant cluster.
 *
 * @param client - QdrantClient instance (uses singleton if not provided)
 * @returns Health check result with cluster information
 */
export async function checkClusterHealth(
  client?: QdrantClient
): Promise<ClusterHealthResult> {
  const qdrantClient = client ?? getQdrantClient();

  try {
    // Get cluster info to verify connection
    const collectionsResponse = await qdrantClient.getCollections();
    const collections = collectionsResponse.collections;

    return {
      healthy: true,
      collectionsCount: collections.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      healthy: false,
      error: errorMessage,
    };
  }
}

/**
 * Collection existence check result
 */
export interface CollectionExistsResult {
  exists: boolean;
  error?: string;
}

/**
 * Checks if a collection exists in the Qdrant cluster.
 *
 * @param collectionName - Name of the collection to check
 * @param client - QdrantClient instance (uses singleton if not provided)
 * @returns Whether the collection exists
 */
export async function collectionExists(
  collectionName: string = DEFAULT_QDRANT_CONFIG.collectionName,
  client?: QdrantClient
): Promise<CollectionExistsResult> {
  const qdrantClient = client ?? getQdrantClient();

  try {
    const response = await qdrantClient.collectionExists(collectionName);
    return { exists: response.exists };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      exists: false,
      error: errorMessage,
    };
  }
}

/**
 * Collection creation result
 */
export interface CreateCollectionResult {
  success: boolean;
  created: boolean;
  error?: string;
}

/**
 * Creates the israeli_laws collection with the configured settings.
 * If the collection already exists, it will not be recreated.
 *
 * Collection configuration:
 * - Vector size: 1024 (multilingual-e5-large dimensions)
 * - Distance metric: Cosine
 * - On-disk payload storage: enabled
 *
 * @param client - QdrantClient instance (uses singleton if not provided)
 * @returns Result indicating success and whether collection was created
 */
export async function createIsraeliLawsCollection(
  client?: QdrantClient
): Promise<CreateCollectionResult> {
  const qdrantClient = client ?? getQdrantClient();
  const collectionName = DEFAULT_QDRANT_CONFIG.collectionName;

  try {
    // Check if collection already exists
    const existsResult = await collectionExists(collectionName, qdrantClient);
    if (existsResult.error) {
      return {
        success: false,
        created: false,
        error: existsResult.error,
      };
    }

    if (existsResult.exists) {
      return {
        success: true,
        created: false,
      };
    }

    // Create the collection with configured settings
    await qdrantClient.createCollection(collectionName, {
      vectors: {
        size: DEFAULT_QDRANT_CONFIG.vectorSize,
        distance: DEFAULT_QDRANT_CONFIG.distance,
      },
      on_disk_payload: DEFAULT_QDRANT_CONFIG.onDiskPayload,
    });

    return {
      success: true,
      created: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      created: false,
      error: errorMessage,
    };
  }
}

/**
 * Gets information about the israeli_laws collection.
 */
export interface CollectionInfoResult {
  success: boolean;
  info?: {
    vectorsCount: number;
    pointsCount: number;
    segmentsCount: number;
    status: string;
  };
  error?: string;
}

/**
 * Retrieves information about the israeli_laws collection.
 *
 * @param client - QdrantClient instance (uses singleton if not provided)
 * @returns Collection information or error
 */
export async function getIsraeliLawsCollectionInfo(
  client?: QdrantClient
): Promise<CollectionInfoResult> {
  const qdrantClient = client ?? getQdrantClient();
  const collectionName = DEFAULT_QDRANT_CONFIG.collectionName;

  try {
    const info = await qdrantClient.getCollection(collectionName);

    return {
      success: true,
      info: {
        vectorsCount: info.vectors_count ?? 0,
        pointsCount: info.points_count ?? 0,
        segmentsCount: info.segments_count ?? 0,
        status: info.status,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Payload index field definition
 */
export interface PayloadIndexField {
  /** Field name in the payload */
  name: string;
  /** Field type for indexing */
  type: 'keyword' | 'integer' | 'float' | 'geo' | 'text';
}

/**
 * Default payload indexes for the israeli_laws collection.
 * These indexes enable efficient filtering during vector search.
 */
export const ISRAELI_LAWS_PAYLOAD_INDEXES: PayloadIndexField[] = [
  { name: 'lawId', type: 'keyword' },
  { name: 'publicationDate', type: 'integer' },
  { name: 'topicId', type: 'keyword' },
];

/**
 * Result of creating a single payload index
 */
export interface CreatePayloadIndexResult {
  field: string;
  success: boolean;
  error?: string;
}

/**
 * Result of creating all payload indexes
 */
export interface CreatePayloadIndexesResult {
  success: boolean;
  results: CreatePayloadIndexResult[];
  errors: string[];
}

/**
 * Creates payload indexes on the israeli_laws collection for efficient filtering.
 *
 * The following indexes are created:
 * - lawId (keyword): For exact law ID matching
 * - publicationDate (integer): For date range filtering
 * - topicId (keyword): For topic-based filtering
 *
 * @param client - QdrantClient instance (uses singleton if not provided)
 * @param indexes - Array of index definitions (uses defaults if not provided)
 * @returns Result indicating success/failure for each index
 */
export async function createPayloadIndexes(
  client?: QdrantClient,
  indexes: PayloadIndexField[] = ISRAELI_LAWS_PAYLOAD_INDEXES
): Promise<CreatePayloadIndexesResult> {
  const qdrantClient = client ?? getQdrantClient();
  const collectionName = DEFAULT_QDRANT_CONFIG.collectionName;

  const results: CreatePayloadIndexResult[] = [];
  const errors: string[] = [];

  for (const index of indexes) {
    try {
      await qdrantClient.createPayloadIndex(collectionName, {
        field_name: index.name,
        field_schema: index.type,
        wait: true,
      });

      results.push({
        field: index.name,
        success: true,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.push({
        field: index.name,
        success: false,
        error: errorMessage,
      });
      errors.push(`${index.name}: ${errorMessage}`);
    }
  }

  return {
    success: errors.length === 0,
    results,
    errors,
  };
}

// =============================================================================
// Cluster Diagnostics
// =============================================================================

/**
 * Detailed cluster information
 */
export interface ClusterDiagnostics {
  /** Whether the cluster is accessible */
  accessible: boolean;
  /** Cluster URL (masked) */
  clusterUrl: string;
  /** Number of collections */
  collectionsCount: number;
  /** List of collection names */
  collectionNames: string[];
  /** Connection latency in milliseconds */
  latencyMs: number;
  /** Whether israeli_laws collection exists */
  hasIsraeliLawsCollection: boolean;
  /** Israeli laws collection stats (if exists) */
  israeliLawsStats?: {
    vectorsCount: number;
    pointsCount: number;
    segmentsCount: number;
    status: string;
    indexedVectorsCount?: number;
  };
  /** Error message if any */
  error?: string;
  /** Timestamp of the diagnostic */
  timestamp: string;
}

/**
 * Masks the API key in a URL for safe display
 */
function maskClusterUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Just show the host, hide potential embedded credentials
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url.substring(0, 30) + '...';
  }
}

/**
 * Runs comprehensive diagnostics on the Qdrant cluster.
 *
 * This function checks:
 * - Cluster accessibility and latency
 * - Available collections
 * - Israeli laws collection status and statistics
 *
 * @param client - QdrantClient instance (uses singleton if not provided)
 * @returns Detailed diagnostic information
 */
export async function runClusterDiagnostics(
  client?: QdrantClient
): Promise<ClusterDiagnostics> {
  const qdrantClient = client ?? getQdrantClient();
  const config = loadQdrantConfig();
  const startTime = Date.now();

  const diagnostics: ClusterDiagnostics = {
    accessible: false,
    clusterUrl: maskClusterUrl(config.url),
    collectionsCount: 0,
    collectionNames: [],
    latencyMs: 0,
    hasIsraeliLawsCollection: false,
    timestamp: new Date().toISOString(),
  };

  try {
    // Test cluster connectivity and get collections
    const collectionsResponse = await qdrantClient.getCollections();
    diagnostics.latencyMs = Date.now() - startTime;
    diagnostics.accessible = true;
    diagnostics.collectionsCount = collectionsResponse.collections.length;
    diagnostics.collectionNames = collectionsResponse.collections.map((c) => c.name);

    // Check for israeli_laws collection
    const collectionName = DEFAULT_QDRANT_CONFIG.collectionName;
    diagnostics.hasIsraeliLawsCollection = diagnostics.collectionNames.includes(collectionName);

    // Get detailed stats if collection exists
    if (diagnostics.hasIsraeliLawsCollection) {
      try {
        const info = await qdrantClient.getCollection(collectionName);
        diagnostics.israeliLawsStats = {
          vectorsCount: info.vectors_count ?? 0,
          pointsCount: info.points_count ?? 0,
          segmentsCount: info.segments_count ?? 0,
          status: info.status,
          indexedVectorsCount: info.indexed_vectors_count ?? undefined,
        };
      } catch (collectionError) {
        // Collection info fetch failed, but cluster is still accessible
        diagnostics.error = `Collection accessible but stats unavailable: ${
          collectionError instanceof Error ? collectionError.message : 'Unknown error'
        }`;
      }
    }
  } catch (error) {
    diagnostics.latencyMs = Date.now() - startTime;
    diagnostics.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return diagnostics;
}

/**
 * Result of cluster settings verification
 */
export interface ClusterSettingsVerification {
  /** Whether all settings match expected values */
  allSettingsMatch: boolean;
  /** Individual setting checks */
  checks: {
    setting: string;
    expected: string | number;
    actual: string | number | undefined;
    matches: boolean;
  }[];
  /** Recommendations if settings don't match */
  recommendations: string[];
}

/**
 * Verifies the cluster collection settings match the expected configuration.
 *
 * @param client - QdrantClient instance (uses singleton if not provided)
 * @returns Verification result with individual checks and recommendations
 */
export async function verifyClusterSettings(
  client?: QdrantClient
): Promise<ClusterSettingsVerification> {
  const qdrantClient = client ?? getQdrantClient();
  const collectionName = DEFAULT_QDRANT_CONFIG.collectionName;

  const checks: ClusterSettingsVerification['checks'] = [];
  const recommendations: string[] = [];

  try {
    // Check if collection exists first
    const existsResult = await collectionExists(collectionName, qdrantClient);
    if (!existsResult.exists) {
      return {
        allSettingsMatch: false,
        checks: [
          {
            setting: 'collection_exists',
            expected: 'true',
            actual: 'false',
            matches: false,
          },
        ],
        recommendations: [
          `Collection '${collectionName}' does not exist. Run Task 1.3.3 to create it.`,
        ],
      };
    }

    // Get collection info
    const info = await qdrantClient.getCollection(collectionName);

    // Check vector size
    const vectorsConfig = info.config.params.vectors;
    let actualVectorSize: number | undefined;
    let actualDistance: string | undefined;

    if (typeof vectorsConfig === 'object' && vectorsConfig !== null) {
      if ('size' in vectorsConfig) {
        // Single vector configuration
        actualVectorSize = vectorsConfig.size as number;
        actualDistance = vectorsConfig.distance as string;
      }
    }

    checks.push({
      setting: 'vector_size',
      expected: DEFAULT_QDRANT_CONFIG.vectorSize,
      actual: actualVectorSize,
      matches: actualVectorSize === DEFAULT_QDRANT_CONFIG.vectorSize,
    });

    if (actualVectorSize !== DEFAULT_QDRANT_CONFIG.vectorSize) {
      recommendations.push(
        `Vector size mismatch. Expected ${DEFAULT_QDRANT_CONFIG.vectorSize} (e5-large), got ${actualVectorSize}.`
      );
    }

    // Check distance metric
    checks.push({
      setting: 'distance_metric',
      expected: DEFAULT_QDRANT_CONFIG.distance,
      actual: actualDistance,
      matches: actualDistance === DEFAULT_QDRANT_CONFIG.distance,
    });

    if (actualDistance !== DEFAULT_QDRANT_CONFIG.distance) {
      recommendations.push(
        `Distance metric mismatch. Expected '${DEFAULT_QDRANT_CONFIG.distance}', got '${actualDistance}'.`
      );
    }

    // Check on-disk payload
    const onDiskPayload = info.config.params.on_disk_payload;
    checks.push({
      setting: 'on_disk_payload',
      expected: String(DEFAULT_QDRANT_CONFIG.onDiskPayload),
      actual: String(onDiskPayload),
      matches: onDiskPayload === DEFAULT_QDRANT_CONFIG.onDiskPayload,
    });

    if (onDiskPayload !== DEFAULT_QDRANT_CONFIG.onDiskPayload) {
      recommendations.push(
        `On-disk payload setting mismatch. Expected ${DEFAULT_QDRANT_CONFIG.onDiskPayload}, got ${onDiskPayload}.`
      );
    }

    const allMatch = checks.every((c) => c.matches);

    return {
      allSettingsMatch: allMatch,
      checks,
      recommendations,
    };
  } catch (error) {
    return {
      allSettingsMatch: false,
      checks: [
        {
          setting: 'verification',
          expected: 'success',
          actual: 'error',
          matches: false,
        },
      ],
      recommendations: [
        `Failed to verify settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ],
    };
  }
}

/**
 * Formatted diagnostic report for display
 */
export function formatDiagnosticsReport(diagnostics: ClusterDiagnostics): string {
  const lines: string[] = [];

  lines.push('═'.repeat(60));
  lines.push('QDRANT CLUSTER DIAGNOSTICS');
  lines.push('═'.repeat(60));
  lines.push('');
  lines.push(`Timestamp: ${diagnostics.timestamp}`);
  lines.push(`Cluster URL: ${diagnostics.clusterUrl}`);
  lines.push('');

  lines.push('─'.repeat(40));
  lines.push('CONNECTION STATUS');
  lines.push('─'.repeat(40));
  lines.push(`Accessible: ${diagnostics.accessible ? '✓ Yes' : '✗ No'}`);
  lines.push(`Latency: ${diagnostics.latencyMs}ms`);
  if (diagnostics.error) {
    lines.push(`Error: ${diagnostics.error}`);
  }
  lines.push('');

  lines.push('─'.repeat(40));
  lines.push('COLLECTIONS');
  lines.push('─'.repeat(40));
  lines.push(`Total Collections: ${diagnostics.collectionsCount}`);
  if (diagnostics.collectionNames.length > 0) {
    lines.push(`Collection Names: ${diagnostics.collectionNames.join(', ')}`);
  }
  lines.push(`Israeli Laws Collection: ${diagnostics.hasIsraeliLawsCollection ? '✓ Exists' : '✗ Not found'}`);
  lines.push('');

  if (diagnostics.israeliLawsStats) {
    lines.push('─'.repeat(40));
    lines.push('ISRAELI LAWS COLLECTION STATS');
    lines.push('─'.repeat(40));
    lines.push(`Status: ${diagnostics.israeliLawsStats.status}`);
    lines.push(`Vectors Count: ${diagnostics.israeliLawsStats.vectorsCount.toLocaleString()}`);
    lines.push(`Points Count: ${diagnostics.israeliLawsStats.pointsCount.toLocaleString()}`);
    lines.push(`Segments Count: ${diagnostics.israeliLawsStats.segmentsCount}`);
    if (diagnostics.israeliLawsStats.indexedVectorsCount !== undefined) {
      lines.push(`Indexed Vectors: ${diagnostics.israeliLawsStats.indexedVectorsCount.toLocaleString()}`);
    }
    lines.push('');
  }

  lines.push('═'.repeat(60));

  return lines.join('\n');
}

/**
 * Formats the settings verification result for display
 */
export function formatSettingsVerification(verification: ClusterSettingsVerification): string {
  const lines: string[] = [];

  lines.push('─'.repeat(40));
  lines.push('SETTINGS VERIFICATION');
  lines.push('─'.repeat(40));

  for (const check of verification.checks) {
    const status = check.matches ? '✓' : '✗';
    lines.push(`${status} ${check.setting}: ${check.actual ?? 'N/A'} (expected: ${check.expected})`);
  }

  lines.push('');
  lines.push(`Overall: ${verification.allSettingsMatch ? '✓ All settings match' : '✗ Settings mismatch'}`);

  if (verification.recommendations.length > 0) {
    lines.push('');
    lines.push('Recommendations:');
    for (const rec of verification.recommendations) {
      lines.push(`  • ${rec}`);
    }
  }

  return lines.join('\n');
}

// Re-export types for convenience
export { QdrantClient };
export type { QdrantConfig } from './config.js';
