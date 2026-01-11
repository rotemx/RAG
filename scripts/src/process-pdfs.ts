#!/usr/bin/env tsx
/**
 * PDF Processing Script
 *
 * This script processes Israeli law PDFs into vector embeddings and uploads them to Qdrant.
 * Optimized for handling ~3,900 PDFs (~1GB) efficiently with:
 * - Memory monitoring and adaptive concurrency
 * - Persistent checkpoints for crash recovery
 * - Stream-based processing to minimize memory footprint
 * - Automatic garbage collection between batches
 *
 * The processing pipeline:
 * 1. Read laws from PostgreSQL (with PDF paths)
 * 2. Extract text from PDFs using fallback chain (pdf-parse → pdf.js → OCR)
 * 3. Clean up Hebrew text (handle RTL, punctuation, artifacts)
 * 4. Chunk documents semantically (respecting section boundaries)
 * 5. Generate embeddings using multilingual-e5-large
 * 6. Insert chunks into PostgreSQL (law_chunks table)
 * 7. Upsert vectors to Qdrant Cloud
 * 8. Track progress and handle failures gracefully
 *
 * Usage:
 *   npx tsx scripts/src/process-pdfs.ts [options]
 *   # or via npm script:
 *   npm run process-pdfs -w @israeli-law-rag/scripts -- [options]
 *
 * Options:
 *   --batch-size=N      Number of PDFs to process per batch (default: 100)
 *   --concurrency=N     Number of PDFs to process in parallel (default: 5)
 *   --dry-run           Show what would be done without making changes
 *   --skip-existing     Skip laws that already have chunks in the database
 *   --limit=N           Process only first N laws (for testing)
 *   --offset=N          Start processing from Nth law (for resuming)
 *   --law-id=ID         Process only a specific law by law_item_id
 *   --force             Force reprocessing even if chunks exist
 *   --verbose           Show detailed logging
 *   --quiet             Minimal output (errors only)
 *   --log-format=FMT    Log format: text, json, pretty (default: pretty)
 *   --resume            Resume from last checkpoint
 *   --checkpoint=PATH   Custom checkpoint file path
 *   --no-checkpoint     Disable checkpoint saving
 *   --no-adaptive       Disable adaptive concurrency
 *   --gc-interval=N     Force GC every N batches (default: 5)
 *   --memory-limit=MB   Memory warning threshold in MB (default: 1024)
 *
 * Environment variables:
 *   - DB_HOST: PostgreSQL host (default: localhost)
 *   - DB_PORT: PostgreSQL port (default: 5432)
 *   - DB_USER: Database user (default: scraper)
 *   - DB_PASSWORD: Database password (default: scraper123)
 *   - DB_NAME: Database name (default: knesset_laws)
 *   - QDRANT_URL: Qdrant Cloud cluster URL
 *   - QDRANT_API_KEY: Qdrant API key
 *
 * Examples:
 *   npm run process-pdfs -w @israeli-law-rag/scripts -- --dry-run
 *   npm run process-pdfs -w @israeli-law-rag/scripts -- --batch-size=50 --verbose
 *   npm run process-pdfs -w @israeli-law-rag/scripts -- --limit=10 --skip-existing
 *   npm run process-pdfs -w @israeli-law-rag/scripts -- --law-id=LAW_123456
 *   npm run process-pdfs -w @israeli-law-rag/scripts -- --resume
 *   npm run process-pdfs -w @israeli-law-rag/scripts -- --batch-size=50 --memory-limit=2048
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';

import {
  // Database
  getDatabasePool,
  loadDatabaseConfig,
  validateDatabaseEnv,
  closeDatabasePool,
  insertLawChunksBatch,
  markChunkEmbedded,
  deleteChunksForLaw,
  getChunksForLaw,
  type CreateLawChunkInput,
  EmbeddingStatus,
  // Qdrant
  getQdrantClient,
  validateQdrantEnv,
  loadQdrantConfig,
  collectionExists,
  DEFAULT_QDRANT_CONFIG,
  // PDF
  extractWithFallbackChain,
  quickCleanup,
  type FallbackChainResult,
  // Chunking
  chunkLegalDocument,
  type ChunkingResult,
  type TextChunk,
  // Embeddings
  createE5Embedder,
  type E5Embedder,
  type BatchEmbeddingResult,
  EmbeddingType,
  // Logging
  Logger,
  createLogger,
  LogLevel,
  type LogFormat,
  // Progress
  ProgressReporter,
  createProgressReporter,
  type ProgressStage,
  type BatchStatistics,
  formatDuration,
  formatBatchStatistics,
  // Batch Processing (Memory & Checkpoints)
  CheckpointManager,
  createCheckpointManager,
  canResume,
  formatCheckpointSummary,
  MemoryMonitor,
  AdaptiveConcurrencyController,
  getMemorySnapshot,
  formatMemorySnapshot,
  performBatchCleanup,
  requestGC,
  createPdfProcessingMemoryMonitor,
  createPdfProcessingConcurrencyController,
} from '@israeli-law-rag/lib';

// ============================================================================
// Types
// ============================================================================

interface LawRecord {
  id: number;
  law_item_id: string;
  law_name: string;
  pdf_path: string | null;
  pdf_url: string | null;
  publication_date: Date | null;
}

interface ParsedArgs {
  batchSize: number;
  concurrency: number;
  dryRun: boolean;
  skipExisting: boolean;
  limit?: number;
  offset: number;
  lawId?: string;
  force: boolean;
  verbose: boolean;
  quiet: boolean;
  logFormat: LogFormat;
  // New efficiency options
  resume: boolean;
  checkpointPath?: string;
  enableCheckpoint: boolean;
  enableAdaptiveConcurrency: boolean;
  gcInterval: number;
  memoryLimitMB: number;
}

interface ProcessingStats {
  totalLaws: number;
  processedLaws: number;
  skippedLaws: number;
  failedLaws: number;
  totalChunks: number;
  embeddedChunks: number;
  failedChunks: number;
  startTime: number;
  errors: string[];
  lawTimings: Map<string, number>;
  // Memory tracking
  peakMemoryMB: number;
  gcCycles: number;
  concurrencyAdjustments: number;
}

interface LawProcessingResult {
  lawId: string;
  lawName: string;
  success: boolean;
  chunksCreated: number;
  chunksEmbedded: number;
  error?: string;
  durationMs: number;
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);

  const result: ParsedArgs = {
    batchSize: 100,
    concurrency: 5,
    dryRun: false,
    skipExisting: false,
    offset: 0,
    force: false,
    verbose: false,
    quiet: false,
    logFormat: 'pretty',
    // New efficiency options
    resume: false,
    enableCheckpoint: true,
    enableAdaptiveConcurrency: true,
    gcInterval: 5,
    memoryLimitMB: 1024,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--skip-existing') {
      result.skipExisting = true;
    } else if (arg === '--force') {
      result.force = true;
    } else if (arg === '--verbose') {
      result.verbose = true;
    } else if (arg === '--quiet') {
      result.quiet = true;
    } else if (arg === '--resume') {
      result.resume = true;
    } else if (arg === '--no-checkpoint') {
      result.enableCheckpoint = false;
    } else if (arg === '--no-adaptive') {
      result.enableAdaptiveConcurrency = false;
    } else if (arg.startsWith('--batch-size=')) {
      result.batchSize = parseInt(arg.slice(13), 10);
    } else if (arg.startsWith('--concurrency=')) {
      result.concurrency = parseInt(arg.slice(14), 10);
    } else if (arg.startsWith('--limit=')) {
      result.limit = parseInt(arg.slice(8), 10);
    } else if (arg.startsWith('--offset=')) {
      result.offset = parseInt(arg.slice(9), 10);
    } else if (arg.startsWith('--law-id=')) {
      result.lawId = arg.slice(9);
    } else if (arg.startsWith('--log-format=')) {
      result.logFormat = arg.slice(13) as LogFormat;
    } else if (arg.startsWith('--checkpoint=')) {
      result.checkpointPath = arg.slice(13);
    } else if (arg.startsWith('--gc-interval=')) {
      result.gcInterval = parseInt(arg.slice(14), 10);
    } else if (arg.startsWith('--memory-limit=')) {
      result.memoryLimitMB = parseInt(arg.slice(15), 10);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
PDF Processing Script - Optimized for ~3,900 PDFs (~1GB)

Usage:
  npm run process-pdfs -w @israeli-law-rag/scripts -- [options]

Options:
  --batch-size=N      Number of PDFs to process per batch (default: 100)
  --concurrency=N     Number of PDFs to process in parallel (default: 5)
  --dry-run           Show what would be done without making changes
  --skip-existing     Skip laws that already have chunks in the database
  --limit=N           Process only first N laws (for testing)
  --offset=N          Start processing from Nth law (for resuming)
  --law-id=ID         Process only a specific law by law_item_id
  --force             Force reprocessing even if chunks exist
  --verbose           Show detailed logging (DEBUG level)
  --quiet             Minimal output (ERROR level only)
  --log-format=FMT    Log format: text, json, pretty (default: pretty)
  -h, --help          Show this help message

Efficiency Options:
  --resume            Resume from last checkpoint (crash recovery)
  --checkpoint=PATH   Custom checkpoint file path
  --no-checkpoint     Disable checkpoint saving
  --no-adaptive       Disable adaptive concurrency (memory-based adjustment)
  --gc-interval=N     Force garbage collection every N batches (default: 5)
  --memory-limit=MB   Memory warning threshold in MB (default: 1024)

Examples:
  npm run process-pdfs -w @israeli-law-rag/scripts -- --dry-run
  npm run process-pdfs -w @israeli-law-rag/scripts -- --batch-size=50 --verbose
  npm run process-pdfs -w @israeli-law-rag/scripts -- --limit=10 --skip-existing
  npm run process-pdfs -w @israeli-law-rag/scripts -- --law-id=LAW_123456
  npm run process-pdfs -w @israeli-law-rag/scripts -- --resume
  npm run process-pdfs -w @israeli-law-rag/scripts -- --batch-size=50 --memory-limit=2048

For processing ~3,900 PDFs efficiently:
  npm run process-pdfs -w @israeli-law-rag/scripts -- --batch-size=100 --gc-interval=5 --skip-existing
`);
}

// ============================================================================
// Logger Setup
// ============================================================================

function createProcessLogger(args: ParsedArgs): Logger {
  let level: 0 | 1 | 2 | 3 | 4 = LogLevel.INFO;
  if (args.verbose) level = LogLevel.DEBUG;
  if (args.quiet) level = LogLevel.ERROR;

  return createLogger('process-pdfs', {
    level,
    format: args.logFormat,
    timestamps: true,
    colors: true,
  });
}

// ============================================================================
// Database Operations
// ============================================================================

async function getLawsToProcess(
  args: ParsedArgs,
  logger: Logger
): Promise<LawRecord[]> {
  const pool = getDatabasePool();

  let query = `
    SELECT id, law_item_id, law_name, pdf_path, pdf_url, publication_date
    FROM laws
    WHERE pdf_path IS NOT NULL
  `;

  const params: (string | number)[] = [];

  // Filter by specific law ID if provided
  if (args.lawId) {
    params.push(args.lawId);
    query += ` AND law_item_id = $${params.length}`;
  }

  // Order by ID for consistent pagination
  query += ' ORDER BY id';

  // Apply offset
  if (args.offset > 0) {
    params.push(args.offset);
    query += ` OFFSET $${params.length}`;
  }

  // Apply limit
  if (args.limit !== undefined) {
    params.push(args.limit);
    query += ` LIMIT $${params.length}`;
  }

  logger.debug('Executing query', { query, params });

  const result = await pool.query<LawRecord>(query, params);
  return result.rows;
}

async function lawHasChunks(lawItemId: string): Promise<boolean> {
  const chunks = await getChunksForLaw(lawItemId);
  return chunks.length > 0;
}

// ============================================================================
// PDF Processing
// ============================================================================

async function extractAndCleanPdf(
  pdfPath: string,
  logger: Logger
): Promise<{ text: string; success: boolean; error?: string; method?: string }> {
  try {
    // Use the fallback chain for robust extraction
    const chainResult: FallbackChainResult = await extractWithFallbackChain(pdfPath, {
      maxPages: undefined, // Process all pages
    });

    const extractedText = chainResult.result.text;
    if (!chainResult.result.success || !extractedText) {
      return {
        text: '',
        success: false,
        error: chainResult.result.error ?? 'No text extracted from PDF',
      };
    }

    // Clean up the extracted Hebrew text
    const cleanedText = quickCleanup(extractedText);

    // Validate we got meaningful content
    if (cleanedText.length < 100) {
      return {
        text: '',
        success: false,
        error: `Extracted text too short (${cleanedText.length} chars)`,
      };
    }

    logger.debug('PDF extracted successfully', {
      chars: cleanedText.length,
      method: chainResult.result.method,
    });

    return {
      text: cleanedText,
      success: true,
      method: chainResult.result.method,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown extraction error';
    return {
      text: '',
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================================================
// Chunking
// ============================================================================

function chunkDocument(
  text: string,
  lawItemId: string,
  logger: Logger
): TextChunk[] {
  const result: ChunkingResult = chunkLegalDocument({
    sourceId: lawItemId,
    text,
    config: {
      maxTokens: 450, // Leave room for e5-large's 512 token limit
      minTokens: 50,
      overlapRatio: 0.15, // 15% overlap
      minOverlapTokens: 20,
      maxOverlapTokens: 80,
    },
  });

  const totalTokens = result.chunks.reduce((sum, c) => sum + c.tokenCount, 0);
  logger.debug('Document chunked', {
    chunks: result.chunks.length,
    totalTokens,
  });

  return result.chunks;
}

// ============================================================================
// Embedding Generation
// ============================================================================

async function generateEmbeddings(
  chunks: TextChunk[],
  embedder: E5Embedder,
  logger: Logger
): Promise<{ embeddings: number[][]; success: boolean; error?: string }> {
  try {
    const texts = chunks.map((chunk) => chunk.content);
    const result: BatchEmbeddingResult = await embedder.embedBatch(texts, {
      type: EmbeddingType.DOCUMENT, // Use "passage: " prefix for documents
    });

    logger.debug('Embeddings generated', {
      count: result.count,
      cacheHits: result.cacheHits,
      cacheMisses: result.cacheMisses,
    });

    const embeddings = result.embeddings.map((r) => r.embedding);
    return { embeddings, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown embedding error';
    return {
      embeddings: [],
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================================================
// Qdrant Operations
// ============================================================================

interface QdrantPointPayload {
  chunkId: string;
  lawId: number;
  lawItemId: string;
  lawName: string;
  chunkIndex: number;
  content: string;
  sectionTitle: string | null;
  sectionType: string | null;
  sectionNumber: string | null;
  publicationDate: number | null;
  tokenCount: number;
}

interface QdrantPoint {
  id: string;
  vector: number[];
  payload: QdrantPointPayload;
}

async function upsertToQdrant(
  points: QdrantPoint[],
  args: ParsedArgs,
  logger: Logger
): Promise<{ success: boolean; error?: string }> {
  if (args.dryRun) {
    logger.info('DRY RUN: Would upsert points to Qdrant', { count: points.length });
    return { success: true };
  }

  try {
    const client = getQdrantClient();
    const collectionName = DEFAULT_QDRANT_CONFIG.collectionName;

    // Upsert in smaller batches to avoid timeout
    const batchSize = 100;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      await client.upsert(collectionName, {
        wait: true,
        points: batch.map((p) => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload as unknown as Record<string, unknown>,
        })),
      });

      logger.debug('Qdrant batch upserted', {
        batch: Math.floor(i / batchSize) + 1,
        points: batch.length,
      });
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown Qdrant error';
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// Law Processing
// ============================================================================

async function processLaw(
  law: LawRecord,
  embedder: E5Embedder,
  args: ParsedArgs,
  stats: ProcessingStats,
  logger: Logger,
  progress: ProgressReporter,
  checkpointManager?: CheckpointManager | null
): Promise<LawProcessingResult> {
  const startTime = Date.now();
  const lawLogger = logger.child(law.law_item_id);

  const result: LawProcessingResult = {
    lawId: law.law_item_id,
    lawName: law.law_name,
    success: false,
    chunksCreated: 0,
    chunksEmbedded: 0,
    durationMs: 0,
  };

  // Mark as started in checkpoint
  checkpointManager?.markStarted(law.law_item_id);

  try {
    lawLogger.info('Processing law', { name: law.law_name.substring(0, 50) });

    // Check if law already has chunks (unless force is set)
    if (args.skipExisting && !args.force) {
      const hasChunks = await lawHasChunks(law.law_item_id);
      if (hasChunks) {
        lawLogger.debug('Skipped: already has chunks');
        result.success = true;
        result.durationMs = Date.now() - startTime;
        stats.skippedLaws++;
        checkpointManager?.markSkipped(law.law_item_id, 'Already has chunks');
        progress.skip('Already has chunks', law.law_item_id);
        return result;
      }
    }

    // Delete existing chunks if force is set
    if (args.force) {
      await deleteChunksForLaw(law.law_item_id);
      lawLogger.debug('Deleted existing chunks (--force)');
    }

    // Resolve PDF path
    if (!law.pdf_path) {
      result.error = 'No PDF path';
      result.durationMs = Date.now() - startTime;
      stats.failedLaws++;
      stats.errors.push(`${law.law_item_id}: No PDF path`);
      progress.fail('No PDF path', law.law_item_id);
      return result;
    }

    // Check if file exists (relative to project root or absolute)
    const pdfPath = path.isAbsolute(law.pdf_path)
      ? law.pdf_path
      : path.resolve(process.cwd(), law.pdf_path);

    // Step 1: Extract and clean PDF text
    const extraction = await extractAndCleanPdf(pdfPath, lawLogger);
    if (!extraction.success) {
      const extractionError = extraction.error ?? 'Unknown extraction error';
      result.error = extractionError;
      result.durationMs = Date.now() - startTime;
      stats.failedLaws++;
      stats.errors.push(`${law.law_item_id}: ${extractionError}`);
      lawLogger.error('Extraction failed', { error: extractionError });
      progress.fail(extractionError, law.law_item_id);
      return result;
    }

    // Step 2: Chunk the document
    const chunks = chunkDocument(extraction.text, law.law_item_id, lawLogger);
    if (chunks.length === 0) {
      result.error = 'No chunks created';
      result.durationMs = Date.now() - startTime;
      stats.failedLaws++;
      stats.errors.push(`${law.law_item_id}: No chunks created`);
      progress.fail('No chunks created', law.law_item_id);
      return result;
    }

    // Step 3: Generate embeddings
    const embeddingResult = await generateEmbeddings(chunks, embedder, lawLogger);
    if (!embeddingResult.success) {
      const embeddingError = embeddingResult.error ?? 'Unknown embedding error';
      result.error = embeddingError;
      result.durationMs = Date.now() - startTime;
      stats.failedLaws++;
      stats.errors.push(`${law.law_item_id}: ${embeddingError}`);
      lawLogger.error('Embedding failed', { error: embeddingError });
      progress.fail(embeddingError, law.law_item_id);
      return result;
    }

    // Step 4: Prepare database records
    const chunkInputs: CreateLawChunkInput[] = chunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      lawId: law.id,
      lawItemId: law.law_item_id,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      charCount: chunk.charCount,
      startPosition: chunk.startPosition,
      endPosition: chunk.endPosition,
      sectionTitle: chunk.section?.title ?? null,
      sectionType: chunk.section?.type ?? null,
      sectionNumber: chunk.section?.number ?? null,
      hasOverlapBefore: chunk.hasOverlapBefore,
      hasOverlapAfter: chunk.hasOverlapAfter,
      embeddingStatus: EmbeddingStatus.PENDING,
    }));

    // Step 5: Insert chunks into PostgreSQL
    if (!args.dryRun) {
      const insertResult = await insertLawChunksBatch(chunkInputs);
      result.chunksCreated = insertResult.success;
      stats.totalChunks += insertResult.success;

      if (insertResult.failed > 0) {
        lawLogger.warn('Some chunks failed to insert', { failed: insertResult.failed });
        stats.failedChunks += insertResult.failed;
      }
    } else {
      lawLogger.info('DRY RUN: Would insert chunks', { count: chunkInputs.length });
      result.chunksCreated = chunkInputs.length;
    }

    // Step 6: Prepare Qdrant points
    const qdrantPoints: QdrantPoint[] = chunks.map((chunk, index) => ({
      id: randomUUID(),
      vector: embeddingResult.embeddings[index]!,
      payload: {
        chunkId: chunk.chunkId,
        lawId: law.id,
        lawItemId: law.law_item_id,
        lawName: law.law_name,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        sectionTitle: chunk.section?.title ?? null,
        sectionType: chunk.section?.type ?? null,
        sectionNumber: chunk.section?.number ?? null,
        publicationDate: law.publication_date
          ? Math.floor(law.publication_date.getTime() / 1000)
          : null,
        tokenCount: chunk.tokenCount,
      },
    }));

    // Step 7: Upsert to Qdrant
    const qdrantResult = await upsertToQdrant(qdrantPoints, args, lawLogger);
    if (!qdrantResult.success) {
      result.error = `Qdrant upsert failed: ${qdrantResult.error}`;
      result.durationMs = Date.now() - startTime;
      // Don't count as complete failure since DB chunks were created
      lawLogger.error('Qdrant upsert failed', { error: qdrantResult.error });
      progress.fail(`Qdrant: ${qdrantResult.error}`, law.law_item_id);
      return result;
    }

    // Step 8: Mark chunks as embedded
    if (!args.dryRun) {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        const pointId = qdrantPoints[i]!.id;
        await markChunkEmbedded(chunk.chunkId, pointId);
        result.chunksEmbedded++;
        stats.embeddedChunks++;
      }
    } else {
      result.chunksEmbedded = chunks.length;
    }

    result.success = true;
    result.durationMs = Date.now() - startTime;
    stats.processedLaws++;
    stats.lawTimings.set(law.law_item_id, result.durationMs);

    // Mark as completed in checkpoint
    checkpointManager?.markCompleted(law.law_item_id, {
      durationMs: result.durationMs,
      chunksCreated: result.chunksCreated,
      chunksEmbedded: result.chunksEmbedded,
    });

    lawLogger.info('Law processed successfully', {
      chunks: chunks.length,
      duration: formatDuration(result.durationMs),
    });

    progress.success(undefined, law.law_item_id);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    result.error = errorMessage;
    result.durationMs = Date.now() - startTime;
    stats.failedLaws++;
    stats.errors.push(`${law.law_item_id}: ${errorMessage}`);

    // Mark as failed in checkpoint
    checkpointManager?.markFailed(law.law_item_id, errorMessage, result.durationMs);

    if (error instanceof Error) {
      lawLogger.error('Processing failed', error);
    } else {
      lawLogger.error('Processing failed', { error: String(error) });
    }
    progress.fail(errorMessage, law.law_item_id);
    return result;
  }
}

// ============================================================================
// Batch Processing
// ============================================================================

async function processBatch(
  laws: LawRecord[],
  embedder: E5Embedder,
  args: ParsedArgs,
  stats: ProcessingStats,
  batchIndex: number,
  totalBatches: number,
  logger: Logger,
  overallProgress: ProgressReporter,
  checkpointManager?: CheckpointManager | null,
  processedIds?: Set<string>
): Promise<LawProcessingResult[]> {
  const batchLogger = logger.child(`batch-${batchIndex + 1}`);

  batchLogger.info('Starting batch', {
    batch: `${batchIndex + 1}/${totalBatches}`,
    laws: laws.length,
  });

  const results: LawProcessingResult[] = [];

  // Create a progress reporter for this batch
  const batchProgress = createProgressReporter(laws.length, {
    operationName: `Batch ${batchIndex + 1}`,
    autoLog: false, // We'll handle logging ourselves
    logIntervalPercent: 25,
  });

  batchProgress.start();

  // Process laws with limited concurrency
  for (let i = 0; i < laws.length; i += args.concurrency) {
    const batch = laws.slice(i, i + args.concurrency);
    const batchResults = await Promise.all(
      batch.map((law) => {
        // Check if already processed in a previous run
        if (processedIds?.has(law.law_item_id)) {
          batchLogger.debug('Skipping already processed law', { lawId: law.law_item_id });
          stats.skippedLaws++;
          batchProgress.skip('Already processed', law.law_item_id);
          return Promise.resolve<LawProcessingResult>({
            lawId: law.law_item_id,
            lawName: law.law_name,
            success: true,
            chunksCreated: 0,
            chunksEmbedded: 0,
            durationMs: 0,
          });
        }
        return processLaw(law, embedder, args, stats, batchLogger, batchProgress, checkpointManager);
      })
    );
    results.push(...batchResults);

    // Update overall progress
    overallProgress.update({
      increment: batchResults.length,
      message: `Batch ${batchIndex + 1}/${totalBatches}`,
    });
  }

  batchProgress.complete();

  batchLogger.info('Batch completed', {
    processed: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
  });

  return results;
}

// ============================================================================
// Statistics Reporting
// ============================================================================

function printStats(stats: ProcessingStats, logger: Logger): void {
  const duration = Date.now() - stats.startTime;
  const avgTimePerLaw = stats.processedLaws > 0
    ? duration / stats.processedLaws
    : 0;

  const batchStats: BatchStatistics = {
    totalItems: stats.totalLaws,
    successCount: stats.processedLaws,
    failedCount: stats.failedLaws,
    skippedCount: stats.skippedLaws,
    totalDurationMs: duration,
    avgTimePerItemMs: avgTimePerLaw,
    itemsPerSecond: stats.processedLaws > 0 ? (stats.processedLaws / duration) * 1000 : 0,
    successRate: stats.totalLaws > 0
      ? ((stats.processedLaws + stats.skippedLaws) / stats.totalLaws) * 100
      : 0,
    startTime: new Date(stats.startTime),
    endTime: new Date(),
    errors: stats.errors,
    breakdown: {
      totalChunks: stats.totalChunks,
      embeddedChunks: stats.embeddedChunks,
      failedChunks: stats.failedChunks,
    },
  };

  logger.info('Processing complete', {
    totalLaws: stats.totalLaws,
    processed: stats.processedLaws,
    skipped: stats.skippedLaws,
    failed: stats.failedLaws,
    totalChunks: stats.totalChunks,
    embeddedChunks: stats.embeddedChunks,
    duration: formatDuration(duration),
    avgPerLaw: formatDuration(avgTimePerLaw),
  });

  // Print detailed stats to console
  console.log('\n' + '='.repeat(60));
  console.log('PROCESSING COMPLETE');
  console.log('='.repeat(60) + '\n');
  console.log(formatBatchStatistics(batchStats));
  console.log('');
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs();
  const logger = createProcessLogger(args);

  console.log('='.repeat(60));
  console.log('PDF Processing Script - Israeli Law RAG');
  console.log('Optimized for ~3,900 PDFs (~1GB)');
  console.log('='.repeat(60));
  console.log('');

  // Initialize statistics with memory tracking
  const stats: ProcessingStats = {
    totalLaws: 0,
    processedLaws: 0,
    skippedLaws: 0,
    failedLaws: 0,
    totalChunks: 0,
    embeddedChunks: 0,
    failedChunks: 0,
    startTime: Date.now(),
    errors: [],
    lawTimings: new Map(),
    peakMemoryMB: 0,
    gcCycles: 0,
    concurrencyAdjustments: 0,
  };

  // Initialize checkpoint manager
  let checkpointManager: CheckpointManager | null = null;
  let memoryMonitor: MemoryMonitor | null = null;
  let concurrencyController: AdaptiveConcurrencyController | null = null;

  try {
    // Step 1: Validate environment
    logger.info('Step 1: Validating configuration...');

    // Database validation
    const dbValidation = validateDatabaseEnv();
    if (dbValidation.warnings.length > 0) {
      for (const warning of dbValidation.warnings) {
        logger.warn('Database configuration warning', { warning });
      }
    }
    if (!dbValidation.isValid) {
      for (const error of dbValidation.errors) {
        logger.error('Database configuration error', { error });
      }
      process.exit(1);
    }

    // Qdrant validation
    const qdrantValidation = validateQdrantEnv();
    if (!qdrantValidation.isValid) {
      if (qdrantValidation.missingVars.length > 0) {
        logger.error('Missing Qdrant environment variables', {
          missing: qdrantValidation.missingVars,
        });
      }
      process.exit(1);
    }

    logger.info('Configuration validated', {
      database: 'OK',
      qdrant: 'OK',
    });

    // Step 2: Initialize memory monitoring
    logger.info('Step 2: Initializing memory monitoring...');
    memoryMonitor = createPdfProcessingMemoryMonitor({
      onWarning: (snapshot) => {
        logger.warn('Memory warning', { memory: formatMemorySnapshot(snapshot) });
      },
      onCritical: (snapshot) => {
        logger.error('Critical memory pressure', { memory: formatMemorySnapshot(snapshot) });
        // Force GC on critical memory
        if (requestGC()) {
          stats.gcCycles++;
          logger.info('Forced garbage collection');
        }
      },
    });
    memoryMonitor.start(5000);

    // Initialize adaptive concurrency
    if (args.enableAdaptiveConcurrency) {
      concurrencyController = createPdfProcessingConcurrencyController(
        args.concurrency,
        memoryMonitor
      );
      logger.info('Adaptive concurrency enabled', {
        initial: args.concurrency,
        min: 1,
        max: Math.max(10, args.concurrency * 2),
      });
    }

    // Step 3: Check for existing checkpoint (resume mode)
    const checkpointPath = args.checkpointPath ?? '.checkpoint-process-pdfs.json';
    let processedIds: Set<string> = new Set();

    if (args.resume && args.enableCheckpoint) {
      logger.info('Step 3: Checking for existing checkpoint...');
      const resumeInfo = await canResume(checkpointPath);
      if (resumeInfo.canResume && resumeInfo.summary) {
        logger.info('Found checkpoint to resume', {
          runId: resumeInfo.summary.runId,
          progress: resumeInfo.summary.progress,
          pending: resumeInfo.summary.pending,
        });
        console.log('\n' + formatCheckpointSummary(resumeInfo.checkpoint!) + '\n');

        // Get processed IDs from checkpoint
        if (resumeInfo.checkpoint) {
          for (const [id, entry] of Object.entries(resumeInfo.checkpoint.items)) {
            if (entry.state === 'completed' || entry.state === 'skipped') {
              processedIds.add(id);
            }
          }
        }
      } else {
        logger.info('No checkpoint found or nothing to resume');
      }
    }

    // Step 4: Show configuration
    logger.info('Step 4: Configuration');
    const dbConfig = loadDatabaseConfig();
    const qdrantConfig = loadQdrantConfig();

    logger.info('Database configuration', {
      host: `${dbConfig.host}:${dbConfig.port}`,
      database: dbConfig.database,
      user: dbConfig.user,
    });

    logger.info('Qdrant configuration', {
      url: qdrantConfig.url,
      collection: qdrantConfig.collectionName,
    });

    logger.info('Processing options', {
      batchSize: args.batchSize,
      concurrency: args.concurrency,
      dryRun: args.dryRun,
      skipExisting: args.skipExisting,
      force: args.force,
      limit: args.limit,
      offset: args.offset,
      lawId: args.lawId,
    });

    logger.info('Efficiency options', {
      checkpoint: args.enableCheckpoint,
      adaptiveConcurrency: args.enableAdaptiveConcurrency,
      gcInterval: args.gcInterval,
      memoryLimitMB: args.memoryLimitMB,
    });

    // Step 5: Verify Qdrant collection exists
    logger.info('Step 5: Verifying Qdrant collection...');
    const existsResult = await collectionExists(DEFAULT_QDRANT_CONFIG.collectionName);
    if (existsResult.error) {
      logger.error('Could not check Qdrant collection', { error: existsResult.error });
      process.exit(1);
    }
    if (!existsResult.exists) {
      logger.error('Qdrant collection does not exist', {
        collection: DEFAULT_QDRANT_CONFIG.collectionName,
        hint: 'Run: npm run create-collection -w @israeli-law-rag/scripts',
      });
      process.exit(1);
    }
    logger.info('Qdrant collection verified', {
      collection: DEFAULT_QDRANT_CONFIG.collectionName,
    });

    // Step 6: Initialize embedder
    logger.info('Step 6: Initializing embedder...');
    const embedder = createE5Embedder({
      model: 'Xenova/multilingual-e5-large',
      quantized: true, // Use quantized model for faster processing
      enableCache: true,
    });
    await embedder.initialize();
    logger.info('Embedder initialized', {
      model: embedder.getModel(),
      dimensions: embedder.getDimensions(),
    });

    // Log initial memory state
    const initialMemory = getMemorySnapshot();
    logger.info('Initial memory state', { memory: formatMemorySnapshot(initialMemory) });

    // Step 7: Fetch laws to process
    logger.info('Step 7: Fetching laws to process...');
    const laws = await getLawsToProcess(args, logger);
    stats.totalLaws = laws.length;

    if (laws.length === 0) {
      logger.info('No laws found to process');
      logger.info('Make sure there are laws with pdf_path in the database');
      process.exit(0);
    }

    logger.info('Laws to process', { count: laws.length });

    // Initialize checkpoint manager if enabled
    if (args.enableCheckpoint && !args.dryRun) {
      checkpointManager = createCheckpointManager('process-pdfs', {
        filePath: checkpointPath,
        autoSaveIntervalMs: 30000, // Save every 30 seconds
      });
      await checkpointManager.initialize(
        `run-${Date.now()}`,
        laws.length,
        {
          batchSize: args.batchSize,
          concurrency: args.concurrency,
          maxRetries: 2,
          retryDelayMs: 1000,
          enableCheckpoints: true,
          checkpointIntervalMs: 30000,
          enableMemoryMonitoring: true,
          gcBetweenBatches: true,
          adaptiveConcurrency: args.enableAdaptiveConcurrency,
          minConcurrency: 1,
          maxConcurrency: Math.max(10, args.concurrency * 2),
        }
      );
      logger.info('Checkpoint manager initialized', { path: checkpointPath });
    }

    // Confirm if not dry run and processing many laws
    if (!args.dryRun && laws.length > 10 && !args.lawId) {
      logger.info('Will process all laws. Press Ctrl+C to cancel (progress will be saved).');
    }

    // Step 8: Process in batches with progress tracking
    logger.info('Step 8: Processing PDFs...');

    const totalBatches = Math.ceil(laws.length / args.batchSize);

    // Create multi-stage progress reporter
    const stages: ProgressStage[] = [];
    for (let i = 0; i < totalBatches; i++) {
      const batchSize = Math.min(args.batchSize, laws.length - i * args.batchSize);
      stages.push({
        name: `Batch ${i + 1}`,
        weight: batchSize,
        total: batchSize,
      });
    }

    // Create overall progress reporter
    const overallProgress = createProgressReporter(laws.length, {
      operationName: 'PDF Processing',
      autoLog: true,
      logIntervalPercent: 10,
    });

    overallProgress.start();

    for (let i = 0; i < laws.length; i += args.batchSize) {
      const batch = laws.slice(i, i + args.batchSize);
      const batchIndex = Math.floor(i / args.batchSize);

      // Update checkpoint batch index
      checkpointManager?.setCurrentBatch(batchIndex);

      // Get current concurrency (may be adjusted based on memory)
      let currentConcurrency = args.concurrency;
      if (concurrencyController) {
        const evaluation = concurrencyController.evaluate();
        if (evaluation.adjusted) {
          currentConcurrency = evaluation.concurrency;
          stats.concurrencyAdjustments++;
          logger.info('Concurrency adjusted', {
            new: currentConcurrency,
            reason: evaluation.reason,
          });
        } else {
          currentConcurrency = evaluation.concurrency;
        }
      }

      // Create args with current concurrency
      const batchArgs = { ...args, concurrency: currentConcurrency };

      await processBatch(
        batch,
        embedder,
        batchArgs,
        stats,
        batchIndex,
        totalBatches,
        logger,
        overallProgress,
        checkpointManager,
        processedIds
      );

      // Track peak memory
      const currentMemory = getMemorySnapshot();
      if (currentMemory.rssMemoryMB > stats.peakMemoryMB) {
        stats.peakMemoryMB = currentMemory.rssMemoryMB;
      }

      // Force GC between batches at specified interval
      if (args.gcInterval > 0 && (batchIndex + 1) % args.gcInterval === 0) {
        logger.debug('Running batch cleanup...', { batch: batchIndex + 1 });
        const cleanup = await performBatchCleanup(() => {
          // Clear embedder cache if memory is high
          if (currentMemory.heapUsagePercent > 80) {
            embedder.clearCache?.();
          }
        });
        if (cleanup.gcTriggered) {
          stats.gcCycles++;
          logger.debug('Garbage collection completed', {
            before: `${cleanup.memoryBefore.heapUsedMB.toFixed(1)}MB`,
            after: `${cleanup.memoryAfter.heapUsedMB.toFixed(1)}MB`,
            freed: `${(cleanup.memoryBefore.heapUsedMB - cleanup.memoryAfter.heapUsedMB).toFixed(1)}MB`,
          });
        }
      }

      // Save checkpoint after each batch
      await checkpointManager?.saveIfDirty();
    }

    overallProgress.complete();

    // Step 9: Print final statistics
    printStats(stats, logger);

    // Print memory statistics
    const finalMemory = getMemorySnapshot();
    console.log('\nMemory Statistics:');
    console.log(`  Peak Memory: ${stats.peakMemoryMB.toFixed(1)}MB`);
    console.log(`  Final Memory: ${finalMemory.rssMemoryMB.toFixed(1)}MB`);
    console.log(`  GC Cycles: ${stats.gcCycles}`);
    console.log(`  Concurrency Adjustments: ${stats.concurrencyAdjustments}`);

    // Cleanup checkpoint on successful completion
    if (stats.failedLaws === 0 && checkpointManager) {
      await checkpointManager.cleanup(true); // Delete checkpoint on success
      logger.info('Checkpoint deleted (processing completed successfully)');
    } else if (checkpointManager) {
      await checkpointManager.save();
      logger.info('Checkpoint saved', {
        path: checkpointPath,
        hint: 'Use --resume to continue from this point',
      });
    }

    // Cleanup
    memoryMonitor?.stop();
    embedder.dispose();
    await closeDatabasePool();

    // Exit with appropriate code
    if (stats.failedLaws > 0) {
      logger.warn('Completed with errors', { failedLaws: stats.failedLaws });
      process.exit(1);
    }

  } catch (error) {
    if (error instanceof Error) {
      logger.error('Fatal error', error);
    } else {
      logger.error('Fatal error', { error: String(error) });
    }

    // Save checkpoint on error
    if (checkpointManager) {
      await checkpointManager.save();
      logger.info('Checkpoint saved on error', {
        path: args.checkpointPath ?? '.checkpoint-process-pdfs.json',
      });
    }

    // Cleanup
    memoryMonitor?.stop();

    printStats(stats, logger);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
