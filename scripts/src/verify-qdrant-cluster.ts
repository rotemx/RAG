#!/usr/bin/env tsx
/**
 * Qdrant Cluster Verification Script
 *
 * This script verifies the Qdrant Cloud cluster is properly configured and accessible.
 * Run this after creating a cluster to ensure everything is set up correctly.
 *
 * Usage:
 *   npm run verify-qdrant -w @israeli-law-rag/scripts
 *   # or directly:
 *   npx tsx scripts/src/verify-qdrant-cluster.ts
 *
 * Options:
 *   --verbose    Show detailed diagnostics
 *   --capacity   Show capacity planning estimates
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
  runClusterDiagnostics,
  verifyClusterSettings,
  formatDiagnosticsReport,
  formatSettingsVerification,
  estimateIsraeliLawsCapacity,
  DEFAULT_QDRANT_CONFIG,
  DEFAULT_CLUSTER_SETTINGS,
} from '@israeli-law-rag/lib';

// Parse command line arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const showCapacity = args.includes('--capacity') || args.includes('-c');

/**
 * Formats a capacity estimate for display
 */
function formatCapacityEstimate(): string {
  const estimate = estimateIsraeliLawsCapacity();
  const lines: string[] = [];

  lines.push('─'.repeat(40));
  lines.push('CAPACITY PLANNING ESTIMATE');
  lines.push('─'.repeat(40));
  lines.push('');
  lines.push('Project estimates (~3,900 law PDFs):');
  lines.push(`  Total vectors:     ${estimate.totalVectors.toLocaleString()}`);
  lines.push(`  Vector storage:    ${estimate.vectorStorageMb.toFixed(2)} MB`);
  lines.push(`  Payload storage:   ${estimate.payloadStorageMb.toFixed(2)} MB`);
  lines.push(`  Total storage:     ${estimate.totalStorageMb.toFixed(2)} MB`);
  lines.push('');
  lines.push(`  Fits in free tier: ${estimate.fitsInFreeTier ? '✓ Yes' : '✗ No'}`);
  lines.push(`  Recommended tier:  ${estimate.recommendedTier}`);
  lines.push('');
  lines.push('Technical breakdown:');
  lines.push(`  Bytes per vector:  ${estimate.breakdown.bytesPerVector.toLocaleString()}`);
  lines.push(`  Vector dimensions: 1024 (e5-large)`);
  lines.push(`  Avg payload size:  2,048 bytes`);

  return lines.join('\n');
}

/**
 * Formats recommended cluster settings for display
 */
function formatRecommendedSettings(): string {
  const lines: string[] = [];

  lines.push('─'.repeat(40));
  lines.push('RECOMMENDED CLUSTER SETTINGS');
  lines.push('─'.repeat(40));
  lines.push('');
  lines.push('When creating your Qdrant Cloud cluster:');
  lines.push(`  Cluster name:      ${DEFAULT_CLUSTER_SETTINGS.name}`);
  lines.push(`  Region:            ${DEFAULT_CLUSTER_SETTINGS.region}`);
  lines.push(`  Tier:              ${DEFAULT_CLUSTER_SETTINGS.tier}`);
  lines.push(`  Storage:           ${DEFAULT_CLUSTER_SETTINGS.storageGb} GB`);
  lines.push(`  Nodes:             ${DEFAULT_CLUSTER_SETTINGS.nodes}`);
  lines.push('');
  lines.push('Collection configuration:');
  lines.push(`  Collection name:   ${DEFAULT_QDRANT_CONFIG.collectionName}`);
  lines.push(`  Vector size:       ${DEFAULT_QDRANT_CONFIG.vectorSize}`);
  lines.push(`  Distance metric:   ${DEFAULT_QDRANT_CONFIG.distance}`);
  lines.push(`  On-disk payload:   ${DEFAULT_QDRANT_CONFIG.onDiskPayload}`);

  return lines.join('\n');
}

async function main(): Promise<void> {
  console.log('═'.repeat(60));
  console.log('QDRANT CLUSTER VERIFICATION');
  console.log('═'.repeat(60));
  console.log('');

  // Show recommended settings if no cluster configured yet
  if (showCapacity) {
    console.log(formatRecommendedSettings());
    console.log('');
    console.log(formatCapacityEstimate());
    console.log('');
    console.log('═'.repeat(60));
    console.log('');
  }

  // Step 1: Validate environment variables
  console.log('Step 1: Validating environment variables...');
  const validation = validateQdrantEnv();

  if (!validation.isValid) {
    console.error('');
    console.error('✗ ERROR: Environment configuration is invalid.');

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
    console.error('See documentation/QDRANT_CLOUD_SETUP.md for detailed instructions.');
    console.error('');

    // Show recommended settings even on error
    if (!showCapacity) {
      console.log(formatRecommendedSettings());
      console.log('');
    }

    process.exit(1);
  }

  console.log('  ✓ Environment variables are valid.');
  console.log('');

  // Step 2: Load configuration
  console.log('Step 2: Loading configuration...');
  const config = loadQdrantConfig();
  console.log(`  URL:             ${config.url}`);
  console.log(`  Collection:      ${config.collectionName}`);
  console.log(`  Vector Size:     ${config.vectorSize}`);
  console.log(`  Distance Metric: ${config.distance}`);
  console.log(`  Timeout:         ${config.timeout}ms`);
  console.log('');

  // Step 3: Create client and check health
  console.log('Step 3: Checking cluster health...');
  const client = createQdrantClient(config);
  const health = await checkClusterHealth(client);

  if (!health.healthy) {
    console.error('');
    console.error('✗ ERROR: Cluster health check failed.');
    console.error(`  Error: ${health.error}`);
    console.error('');
    console.error('Please verify:');
    console.error('  1. The cluster URL is correct');
    console.error('  2. The API key is valid');
    console.error('  3. The cluster is running in Qdrant Cloud dashboard');
    console.error('');
    process.exit(1);
  }

  console.log('  ✓ Cluster is healthy!');
  console.log(`  Collections count: ${health.collectionsCount}`);
  console.log('');

  // Track collection existence to avoid duplicate API calls
  let collectionExists = false;

  // Step 4: Run detailed diagnostics (verbose mode)
  if (verbose) {
    console.log('Step 4: Running detailed diagnostics...');
    const diagnostics = await runClusterDiagnostics(client);
    console.log('');
    console.log(formatDiagnosticsReport(diagnostics));
    console.log('');

    // Track collection existence from diagnostics
    collectionExists = diagnostics.hasIsraeliLawsCollection;

    // Step 5: Verify settings if collection exists
    if (diagnostics.hasIsraeliLawsCollection) {
      console.log('Step 5: Verifying collection settings...');
      const settingsVerification = await verifyClusterSettings(client);
      console.log('');
      console.log(formatSettingsVerification(settingsVerification));
      console.log('');
    }
  } else {
    // Step 4: Check for israeli_laws collection (simple mode)
    console.log('Step 4: Checking for collection...');
    try {
      const collectionResponse = await client.collectionExists(
        DEFAULT_QDRANT_CONFIG.collectionName
      );
      collectionExists = collectionResponse.exists;

      if (collectionResponse.exists) {
        console.log(`  ✓ Collection '${DEFAULT_QDRANT_CONFIG.collectionName}' exists.`);

        // Get collection info
        const info = await client.getCollection(DEFAULT_QDRANT_CONFIG.collectionName);
        console.log(`  Indexed vectors: ${(info.indexed_vectors_count ?? 0).toLocaleString()}`);
        console.log(`  Points count:    ${(info.points_count ?? 0).toLocaleString()}`);
        console.log(`  Status:          ${info.status}`);
      } else {
        console.log(`  ⚠ Collection '${DEFAULT_QDRANT_CONFIG.collectionName}' does not exist yet.`);
        console.log('    This is expected if you have not run Task 1.3.3 yet.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.log(`  ⚠ Could not check collection: ${errorMessage}`);
      console.log('    This may be expected if the collection has not been created yet.');
    }
    console.log('');
  }

  // Summary
  console.log('═'.repeat(60));
  console.log('✓ VERIFICATION COMPLETE');
  console.log('═'.repeat(60));
  console.log('');
  console.log('Your Qdrant cluster is properly configured and accessible.');
  console.log('');

  // Determine next steps based on collection status (reuse earlier check)
  if (!collectionExists) {
    console.log('Next steps:');
    console.log('  1. npm run create-collection -w @israeli-law-rag/scripts');
    console.log('     (Task 1.3.3: Create the israeli_laws collection)');
    console.log('');
    console.log('  2. npm run create-indexes -w @israeli-law-rag/scripts');
    console.log('     (Task 1.3.4: Create payload indexes for filtering)');
    console.log('');
  } else {
    console.log('Your cluster is ready for use!');
    console.log('');
    console.log('Available commands:');
    console.log('  npm run verify-qdrant -w @israeli-law-rag/scripts -- --verbose');
    console.log('  npm run verify-qdrant -w @israeli-law-rag/scripts -- --capacity');
    console.log('');
  }

  // Show tip for verbose mode
  if (!verbose) {
    console.log('Tip: Run with --verbose for detailed diagnostics.');
  }
  console.log('');
}

main().catch((error: unknown) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
