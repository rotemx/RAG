#!/usr/bin/env tsx
/**
 * Create Israeli Laws Collection Script
 *
 * This script creates the israeli_laws collection in Qdrant Cloud with the
 * proper configuration for the RAG system:
 * - Vector size: 1024 (multilingual-e5-large dimensions)
 * - Distance metric: Cosine
 * - On-disk payload storage: enabled
 *
 * Usage:
 *   npx tsx scripts/src/create-collection.ts
 *
 * Required environment variables:
 *   - QDRANT_URL: Full URL to Qdrant Cloud cluster
 *   - QDRANT_API_KEY: API key for authentication
 */

import {
  validateQdrantEnv,
  loadQdrantConfig,
  createQdrantClient,
  checkClusterHealth,
  createIsraeliLawsCollection,
  getIsraeliLawsCollectionInfo,
  DEFAULT_QDRANT_CONFIG,
} from '@israeli-law-rag/lib';

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Create Israeli Laws Collection');
  console.log('='.repeat(60));
  console.log('');

  // Step 1: Validate environment variables
  console.log('Step 1: Validating environment variables...');
  const validation = validateQdrantEnv();

  if (!validation.isValid) {
    console.error('');
    console.error('ERROR: Environment configuration is invalid.');

    if (validation.missingVars.length > 0) {
      console.error('');
      console.error('Missing environment variables:');
      for (const varName of validation.missingVars) {
        console.error(`  - ${varName}`);
      }
    }

    if (validation.errors.length > 0) {
      console.error('');
      console.error('Configuration errors:');
      for (const error of validation.errors) {
        console.error(`  - ${error}`);
      }
    }

    console.error('');
    console.error('Please set the required environment variables in .env.local:');
    console.error('');
    console.error('  QDRANT_URL=https://<cluster-id>.<region>.cloud.qdrant.io:6333');
    console.error('  QDRANT_API_KEY=<your-api-key>');
    console.error('');
    process.exit(1);
  }

  console.log('  Environment variables are valid.');
  console.log('');

  // Step 2: Load configuration
  console.log('Step 2: Loading configuration...');
  const config = loadQdrantConfig();
  console.log(`  URL: ${config.url}`);
  console.log(`  Collection Name: ${config.collectionName}`);
  console.log(`  Vector Size: ${config.vectorSize}`);
  console.log(`  Distance Metric: ${config.distance}`);
  console.log(`  On-disk Payload: ${config.onDiskPayload}`);
  console.log('');

  // Step 3: Check cluster health
  console.log('Step 3: Checking cluster health...');
  const client = createQdrantClient(config);
  const health = await checkClusterHealth(client);

  if (!health.healthy) {
    console.error('');
    console.error('ERROR: Cluster health check failed.');
    console.error(`  Error: ${health.error}`);
    console.error('');
    process.exit(1);
  }

  console.log('  Cluster is healthy!');
  console.log('');

  // Step 4: Create collection
  console.log('Step 4: Creating collection...');
  const result = await createIsraeliLawsCollection(client);

  if (!result.success) {
    console.error('');
    console.error('ERROR: Failed to create collection.');
    console.error(`  Error: ${result.error}`);
    console.error('');
    process.exit(1);
  }

  if (result.created) {
    console.log(`  Collection '${DEFAULT_QDRANT_CONFIG.collectionName}' created successfully!`);
  } else {
    console.log(`  Collection '${DEFAULT_QDRANT_CONFIG.collectionName}' already exists.`);
  }
  console.log('');

  // Step 5: Verify collection info
  console.log('Step 5: Verifying collection...');
  const info = await getIsraeliLawsCollectionInfo(client);

  if (!info.success) {
    console.error('');
    console.error('WARNING: Could not retrieve collection info.');
    console.error(`  Error: ${info.error}`);
    console.error('');
  } else if (info.info) {
    console.log(`  Status: ${info.info.status}`);
    console.log(`  Vectors count: ${info.info.vectorsCount}`);
    console.log(`  Points count: ${info.info.pointsCount}`);
    console.log(`  Segments count: ${info.info.segmentsCount}`);
  }
  console.log('');

  // Summary
  console.log('='.repeat(60));
  console.log('COLLECTION CREATION COMPLETE');
  console.log('='.repeat(60));
  console.log('');
  console.log('The israeli_laws collection is now ready.');
  console.log('');
  console.log('Collection configuration:');
  console.log(`  - Vector size: ${DEFAULT_QDRANT_CONFIG.vectorSize} dimensions`);
  console.log(`  - Distance metric: ${DEFAULT_QDRANT_CONFIG.distance}`);
  console.log(`  - On-disk payload: ${DEFAULT_QDRANT_CONFIG.onDiskPayload ? 'enabled' : 'disabled'}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Task 1.3.4: Create payload indexes for filtering');
  console.log('  2. Task 1.3.5: Document connection credentials securely');
  console.log('');
}

main().catch((error: unknown) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
