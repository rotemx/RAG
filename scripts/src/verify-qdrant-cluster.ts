#!/usr/bin/env tsx
/**
 * Qdrant Cluster Verification Script
 *
 * This script verifies the Qdrant Cloud cluster is properly configured and accessible.
 * Run this after creating a cluster to ensure everything is set up correctly.
 *
 * Usage:
 *   npx tsx scripts/src/verify-qdrant-cluster.ts
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
  DEFAULT_QDRANT_CONFIG,
} from '@israeli-law-rag/lib';

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Qdrant Cluster Verification');
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
  console.log(`  Timeout: ${config.timeout}ms`);
  console.log('');

  // Step 3: Create client and check health
  console.log('Step 3: Checking cluster health...');
  const client = createQdrantClient(config);
  const health = await checkClusterHealth(client);

  if (!health.healthy) {
    console.error('');
    console.error('ERROR: Cluster health check failed.');
    console.error(`  Error: ${health.error}`);
    console.error('');
    console.error('Please verify:');
    console.error('  1. The cluster URL is correct');
    console.error('  2. The API key is valid');
    console.error('  3. The cluster is running');
    console.error('');
    process.exit(1);
  }

  console.log('  Cluster is healthy!');
  console.log(`  Collections count: ${health.collectionsCount}`);
  console.log('');

  // Step 4: Check for israeli_laws collection
  console.log('Step 4: Checking for collection...');
  try {
    const collectionResponse = await client.collectionExists(DEFAULT_QDRANT_CONFIG.collectionName);

    if (collectionResponse.exists) {
      console.log(`  Collection '${DEFAULT_QDRANT_CONFIG.collectionName}' exists.`);

      // Get collection info
      const info = await client.getCollection(DEFAULT_QDRANT_CONFIG.collectionName);
      console.log(`  Vector count: ${info.vectors_count ?? 0}`);
      console.log(`  Points count: ${info.points_count ?? 0}`);
    } else {
      console.log(`  Collection '${DEFAULT_QDRANT_CONFIG.collectionName}' does not exist yet.`);
      console.log('  This is expected if you have not run Task 1.3.3 yet.');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.log(`  Could not check collection: ${errorMessage}`);
    console.log('  This may be expected if the collection has not been created yet.');
  }
  console.log('');

  // Summary
  console.log('='.repeat(60));
  console.log('VERIFICATION COMPLETE');
  console.log('='.repeat(60));
  console.log('');
  console.log('Your Qdrant cluster is properly configured and accessible.');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Task 1.3.3: Create the israeli_laws collection');
  console.log('  2. Task 1.3.4: Create payload indexes for filtering');
  console.log('  3. Task 1.3.5: Document connection credentials securely');
  console.log('');
}

main().catch((error: unknown) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
