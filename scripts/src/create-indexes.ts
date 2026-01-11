#!/usr/bin/env tsx
/**
 * Create Payload Indexes Script
 *
 * This script creates payload indexes on the israeli_laws collection in Qdrant Cloud
 * to enable efficient filtering during vector search:
 * - lawId (keyword): For exact law ID matching
 * - publicationDate (integer): For date range filtering
 * - topicId (keyword): For topic-based filtering
 *
 * Usage:
 *   npx tsx scripts/src/create-indexes.ts
 *   # or via npm script:
 *   npm run create-indexes -w @israeli-law-rag/scripts
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
  collectionExists,
  createPayloadIndexes,
  ISRAELI_LAWS_PAYLOAD_INDEXES,
  DEFAULT_QDRANT_CONFIG,
} from '@israeli-law-rag/lib';

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Create Payload Indexes for Israeli Laws Collection');
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

  // Step 4: Verify collection exists
  console.log('Step 4: Verifying collection exists...');
  const existsResult = await collectionExists(DEFAULT_QDRANT_CONFIG.collectionName, client);

  if (existsResult.error) {
    console.error('');
    console.error('ERROR: Could not check collection existence.');
    console.error(`  Error: ${existsResult.error}`);
    console.error('');
    process.exit(1);
  }

  if (!existsResult.exists) {
    console.error('');
    console.error(`ERROR: Collection '${DEFAULT_QDRANT_CONFIG.collectionName}' does not exist.`);
    console.error('');
    console.error('Please run the create-collection script first:');
    console.error('  npm run create-collection -w @israeli-law-rag/scripts');
    console.error('');
    process.exit(1);
  }

  console.log(`  Collection '${DEFAULT_QDRANT_CONFIG.collectionName}' exists.`);
  console.log('');

  // Step 5: Create payload indexes
  console.log('Step 5: Creating payload indexes...');
  console.log('');
  console.log('  Indexes to create:');
  for (const index of ISRAELI_LAWS_PAYLOAD_INDEXES) {
    console.log(`    - ${index.name} (${index.type})`);
  }
  console.log('');

  const result = await createPayloadIndexes(client);

  console.log('  Results:');
  for (const indexResult of result.results) {
    if (indexResult.success) {
      console.log(`    [OK] ${indexResult.field}`);
    } else {
      console.log(`    [FAILED] ${indexResult.field}: ${indexResult.error}`);
    }
  }
  console.log('');

  if (!result.success) {
    console.error('');
    console.error('WARNING: Some indexes failed to create.');
    console.error('  Errors:');
    for (const error of result.errors) {
      console.error(`    - ${error}`);
    }
    console.error('');
    console.error('Note: If an index already exists, you may see an error.');
    console.error('This is expected and the existing index will remain in place.');
    console.error('');
  }

  // Summary
  console.log('='.repeat(60));
  console.log('PAYLOAD INDEX CREATION COMPLETE');
  console.log('='.repeat(60));
  console.log('');

  const successCount = result.results.filter((r) => r.success).length;
  const totalCount = result.results.length;

  console.log(`Successfully created ${successCount}/${totalCount} indexes.`);
  console.log('');
  console.log('Payload indexes enable efficient filtering:');
  console.log('  - lawId: Filter by specific law identifier');
  console.log('  - publicationDate: Filter by date ranges');
  console.log('  - topicId: Filter by topic/category');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Task 1.3.5: Document connection credentials securely');
  console.log('  2. Task 1.4.x: Set up PostgreSQL schema extensions');
  console.log('');
}

main().catch((error: unknown) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
