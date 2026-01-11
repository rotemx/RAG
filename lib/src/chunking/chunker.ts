/**
 * Legal Document Chunker
 *
 * Main chunking implementation for Israeli legal documents.
 * Implements semantic chunking that respects section boundaries
 * while maintaining optimal chunk sizes for embedding.
 */

import {
  ChunkingResultSchema,
  HebrewSectionType,
  createDefaultChunkingConfig,
  generateChunkId,
  estimateTokenCount,
  calculateOverlapChars,
  createSectionPath,
  type ChunkingConfig,
  type ChunkingResult,
  type TextChunk,
} from './types.js';
import {
  detectSectionMarkers,
  buildSectionHierarchy,
  findBreakPoints,
  type SectionMarker,
} from './section-detection.js';
import { countTokens } from './token-counter.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for chunking a document
 */
export interface ChunkDocumentInput {
  /** Unique identifier for the source document */
  sourceId: string;
  /** The text content to chunk */
  text: string;
  /** Optional configuration overrides */
  config?: Partial<ChunkingConfig>;
  /** Optional metadata to include in all chunks */
  metadata?: Record<string, unknown>;
}

/**
 * Internal chunk candidate during processing
 */
interface ChunkCandidate {
  content: string;
  startPosition: number;
  endPosition: number;
  sectionMarker: SectionMarker | null;
  sectionHierarchy: SectionMarker[];
  estimatedTokens: number;
}

// =============================================================================
// Main Chunking Function
// =============================================================================

/**
 * Chunk a legal document into semantically meaningful pieces
 *
 * The chunking algorithm:
 * 1. Detect all section markers in the document
 * 2. Find natural break points (sections, paragraphs, sentences)
 * 3. Create initial chunks respecting section boundaries
 * 4. Split oversize chunks at natural break points
 * 5. Merge undersize chunks with neighbors
 * 6. Add overlap between consecutive chunks
 *
 * @param input - Document input with source ID and text
 * @returns Chunking result with all chunks and statistics
 *
 * @example
 * ```typescript
 * const result = chunkLegalDocument({
 *   sourceId: 'law_12345',
 *   text: extractedPdfText,
 * });
 *
 * console.log(`Created ${result.totalChunks} chunks`);
 * for (const chunk of result.chunks) {
 *   console.log(`Chunk ${chunk.chunkIndex}: ${chunk.tokenCount} tokens`);
 * }
 * ```
 */
export function chunkLegalDocument(input: ChunkDocumentInput): ChunkingResult {
  const startTime = performance.now();
  const warnings: string[] = [];

  // Parse configuration
  const config = createDefaultChunkingConfig(input.config);

  // Detect section markers
  const markers = detectSectionMarkers(input.text);

  // Find all break points
  const breakPoints = findBreakPoints(input.text, markers);

  // Create initial chunks based on sections and breaks
  const candidates = createInitialChunks(input.text, markers, breakPoints, config);

  // Process chunks: split oversize, merge undersize
  const processedChunks = processChunks(candidates, config, warnings);

  // Add overlap between chunks
  const chunksWithOverlap = addOverlap(processedChunks, input.text, config);

  // Build final chunks with metadata
  const finalChunks = buildFinalChunks(
    chunksWithOverlap,
    input.sourceId,
    markers,
    config,
    input.metadata
  );

  // Calculate statistics
  const stats = calculateStats(input.text, finalChunks, markers.length, startTime);

  // Build and validate result
  const result: ChunkingResult = {
    sourceId: input.sourceId,
    chunks: finalChunks,
    totalChunks: finalChunks.length,
    stats,
    config,
    warnings,
  };

  return ChunkingResultSchema.parse(result);
}

// =============================================================================
// Internal Functions
// =============================================================================

/**
 * Create initial chunk candidates based on section boundaries
 */
function createInitialChunks(
  text: string,
  markers: SectionMarker[],
  breakPoints: Array<{ position: number; priority: number; type: string }>,
  config: ChunkingConfig
): ChunkCandidate[] {
  const candidates: ChunkCandidate[] = [];

  if (text.length === 0) {
    return candidates;
  }

  // If no markers, treat as single chunk (will be split if needed)
  if (markers.length === 0) {
    candidates.push({
      content: text,
      startPosition: 0,
      endPosition: text.length,
      sectionMarker: null,
      sectionHierarchy: [],
      estimatedTokens: estimateTokenCount(text.length, config.charsPerTokenEstimate),
    });
    return candidates;
  }

  // Process each section
  let currentPosition = 0;

  // Add content before first marker (preamble)
  if (markers[0].startPosition > 0) {
    const content = text.slice(0, markers[0].startPosition).trim();
    if (content.length > 0) {
      candidates.push({
        content,
        startPosition: 0,
        endPosition: markers[0].startPosition,
        sectionMarker: null,
        sectionHierarchy: [],
        estimatedTokens: estimateTokenCount(content.length, config.charsPerTokenEstimate),
      });
    }
    currentPosition = markers[0].startPosition;
  }

  // Process each marker and its content
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const nextMarker = markers[i + 1];
    const isHardBreak = config.hardBreakSections.includes(marker.type);

    // Content end is start of next marker or end of text
    const contentEnd = nextMarker?.startPosition ?? text.length;

    // Get content including marker text
    const fullContent = text.slice(marker.startPosition, contentEnd).trim();

    if (fullContent.length === 0) {
      continue;
    }

    // Build section hierarchy for this position
    const hierarchy = buildSectionHierarchy(marker.startPosition, markers);

    candidates.push({
      content: fullContent,
      startPosition: marker.startPosition,
      endPosition: contentEnd,
      sectionMarker: marker,
      sectionHierarchy: hierarchy,
      estimatedTokens: estimateTokenCount(fullContent.length, config.charsPerTokenEstimate),
    });

    currentPosition = contentEnd;
  }

  return candidates;
}

/**
 * Process chunks: split oversize and merge undersize
 */
function processChunks(
  candidates: ChunkCandidate[],
  config: ChunkingConfig,
  warnings: string[]
): ChunkCandidate[] {
  const processed: ChunkCandidate[] = [];

  for (const candidate of candidates) {
    if (candidate.estimatedTokens > config.maxTokens) {
      // Chunk is too large - split it
      const splits = splitOversizeChunk(candidate, config, warnings);
      processed.push(...splits);
    } else if (candidate.estimatedTokens < config.minTokens) {
      // Chunk is too small - will try to merge with previous
      if (processed.length > 0) {
        const prev = processed[processed.length - 1];
        const merged = mergeChunks(prev, candidate, config);

        if (merged.estimatedTokens <= config.maxTokens) {
          processed[processed.length - 1] = merged;
        } else {
          // Can't merge without exceeding limit - keep separate
          processed.push(candidate);
        }
      } else {
        processed.push(candidate);
      }
    } else {
      processed.push(candidate);
    }
  }

  return processed;
}

/**
 * Split an oversize chunk at natural break points
 */
function splitOversizeChunk(
  chunk: ChunkCandidate,
  config: ChunkingConfig,
  warnings: string[]
): ChunkCandidate[] {
  if (config.oversizeStrategy === 'allow') {
    warnings.push(
      `Chunk at position ${chunk.startPosition} exceeds max tokens (${chunk.estimatedTokens} > ${config.maxTokens}) but allowed by config`
    );
    return [chunk];
  }

  if (config.oversizeStrategy === 'truncate') {
    const targetChars = Math.floor(config.maxTokens * config.charsPerTokenEstimate);
    const truncatedContent = chunk.content.slice(0, targetChars);
    warnings.push(
      `Truncated chunk at position ${chunk.startPosition} from ${chunk.content.length} to ${targetChars} chars`
    );
    return [
      {
        ...chunk,
        content: truncatedContent,
        endPosition: chunk.startPosition + targetChars,
        estimatedTokens: config.maxTokens,
      },
    ];
  }

  // Split strategy - find natural break points within the chunk
  const splits: ChunkCandidate[] = [];
  const content = chunk.content;
  const targetChars = Math.floor(config.maxTokens * config.charsPerTokenEstimate * 0.9); // 90% of max

  // Find all potential split points
  const splitPoints = findSplitPoints(content, config);

  let currentStart = 0;
  let currentContent = '';
  let lastGoodSplit = 0;

  for (let i = 0; i < content.length; i++) {
    currentContent = content.slice(currentStart, i + 1);
    const currentTokens = estimateTokenCount(currentContent.length, config.charsPerTokenEstimate);

    // Check if we're at a split point
    const isSplitPoint = splitPoints.some((sp) => sp.position === i);
    if (isSplitPoint) {
      lastGoodSplit = i;
    }

    // Check if we need to split
    if (currentTokens >= config.maxTokens * 0.95) {
      // Try to use the last good split point
      let splitAt = lastGoodSplit > currentStart ? lastGoodSplit : i;

      const splitContent = content.slice(currentStart, splitAt).trim();
      if (splitContent.length > 0) {
        splits.push({
          content: splitContent,
          startPosition: chunk.startPosition + currentStart,
          endPosition: chunk.startPosition + splitAt,
          sectionMarker: splits.length === 0 ? chunk.sectionMarker : null,
          sectionHierarchy: chunk.sectionHierarchy,
          estimatedTokens: estimateTokenCount(
            splitContent.length,
            config.charsPerTokenEstimate
          ),
        });
      }

      currentStart = splitAt;
      lastGoodSplit = currentStart;
    }
  }

  // Add remaining content
  const remaining = content.slice(currentStart).trim();
  if (remaining.length > 0) {
    splits.push({
      content: remaining,
      startPosition: chunk.startPosition + currentStart,
      endPosition: chunk.endPosition,
      sectionMarker: splits.length === 0 ? chunk.sectionMarker : null,
      sectionHierarchy: chunk.sectionHierarchy,
      estimatedTokens: estimateTokenCount(remaining.length, config.charsPerTokenEstimate),
    });
  }

  if (splits.length > 1) {
    warnings.push(
      `Split oversize chunk at position ${chunk.startPosition} into ${splits.length} chunks`
    );
  }

  return splits.length > 0 ? splits : [chunk];
}

/**
 * Find potential split points within text
 */
function findSplitPoints(
  content: string,
  config: ChunkingConfig
): Array<{ position: number; priority: number }> {
  const points: Array<{ position: number; priority: number }> = [];

  // Paragraph breaks (highest priority)
  const paragraphPattern = /\n\s*\n/g;
  let match: RegExpExecArray | null;
  while ((match = paragraphPattern.exec(content)) !== null) {
    points.push({ position: match.index + match[0].length, priority: 1 });
  }

  // Sentence endings
  for (const delimiter of config.sentenceDelimiters) {
    let idx = 0;
    while ((idx = content.indexOf(delimiter, idx)) !== -1) {
      // Check for space or newline after delimiter
      if (idx + 1 < content.length && /[\s\n]/.test(content[idx + 1])) {
        points.push({ position: idx + 1, priority: 2 });
      }
      idx++;
    }
  }

  // Sort by position
  points.sort((a, b) => a.position - b.position);

  return points;
}

/**
 * Merge two chunks
 */
function mergeChunks(
  first: ChunkCandidate,
  second: ChunkCandidate,
  config: ChunkingConfig
): ChunkCandidate {
  const separator = config.preserveParagraphs ? '\n\n' : ' ';
  const mergedContent = first.content + separator + second.content;

  return {
    content: mergedContent,
    startPosition: first.startPosition,
    endPosition: second.endPosition,
    sectionMarker: first.sectionMarker,
    sectionHierarchy: first.sectionHierarchy,
    estimatedTokens: estimateTokenCount(mergedContent.length, config.charsPerTokenEstimate),
  };
}

/**
 * Add overlap between consecutive chunks
 */
function addOverlap(
  chunks: ChunkCandidate[],
  fullText: string,
  config: ChunkingConfig
): Array<ChunkCandidate & { overlapBefore: number; overlapAfter: number }> {
  if (chunks.length <= 1) {
    return chunks.map((c) => ({ ...c, overlapBefore: 0, overlapAfter: 0 }));
  }

  const result: Array<ChunkCandidate & { overlapBefore: number; overlapAfter: number }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const prevChunk = chunks[i - 1];
    const nextChunk = chunks[i + 1];

    let overlapBefore = 0;
    let overlapAfter = 0;
    let newContent = chunk.content;
    let newStart = chunk.startPosition;
    let newEnd = chunk.endPosition;

    // Add overlap from previous chunk
    if (prevChunk && i > 0) {
      const overlapChars = calculateOverlapChars(prevChunk.estimatedTokens, config);
      if (overlapChars > 0 && prevChunk.content.length >= overlapChars) {
        const overlapText = prevChunk.content.slice(-overlapChars);
        // Only add if not already present (due to natural overlap)
        if (!newContent.startsWith(overlapText)) {
          newContent = overlapText + newContent;
          overlapBefore = overlapChars;
          newStart = prevChunk.endPosition - overlapChars;
        }
      }
    }

    // Calculate overlap that will be added to next chunk
    if (nextChunk) {
      const overlapChars = calculateOverlapChars(chunk.estimatedTokens, config);
      overlapAfter = Math.min(overlapChars, chunk.content.length);
    }

    result.push({
      ...chunk,
      content: newContent,
      startPosition: newStart,
      endPosition: newEnd,
      estimatedTokens: estimateTokenCount(newContent.length, config.charsPerTokenEstimate),
      overlapBefore,
      overlapAfter,
    });
  }

  return result;
}

/**
 * Build final TextChunk objects with all metadata
 */
function buildFinalChunks(
  processedChunks: Array<ChunkCandidate & { overlapBefore: number; overlapAfter: number }>,
  sourceId: string,
  allMarkers: SectionMarker[],
  config: ChunkingConfig,
  metadata?: Record<string, unknown>
): TextChunk[] {
  const totalChunks = processedChunks.length;

  return processedChunks.map((chunk, index) => {
    // Get token count
    const tokenResult = countTokens(chunk.content);

    // Build section info
    const section = chunk.sectionMarker
      ? {
          type: chunk.sectionMarker.type,
          number: chunk.sectionMarker.number,
          title: chunk.sectionMarker.title,
          path: config.includeHierarchy
            ? createSectionPath(
                chunk.sectionHierarchy.map((m) => ({
                  type: m.type,
                  number: m.number,
                  title: m.title,
                }))
              )
            : null,
        }
      : null;

    // Build hierarchy
    const sectionHierarchy = config.includeHierarchy
      ? chunk.sectionHierarchy.map((m) => ({
          type: m.type,
          number: m.number,
          title: m.title,
        }))
      : [];

    const textChunk: TextChunk = {
      chunkId: generateChunkId(sourceId, index),
      sourceId,
      chunkIndex: index,
      totalChunks,
      content: chunk.content,
      charCount: chunk.content.length,
      tokenCount: tokenResult.count,
      tokenCountEstimated: tokenResult.estimated,
      startPosition: chunk.startPosition,
      endPosition: chunk.endPosition,
      hasOverlapBefore: chunk.overlapBefore > 0,
      hasOverlapAfter: chunk.overlapAfter > 0,
      overlapCharsBefore: chunk.overlapBefore,
      overlapCharsAfter: chunk.overlapAfter,
      section,
      sectionHierarchy,
      metadata,
    };

    return textChunk;
  });
}

/**
 * Calculate statistics for the chunking result
 */
function calculateStats(
  originalText: string,
  chunks: TextChunk[],
  sectionsDetected: number,
  startTime: number
): ChunkingResult['stats'] {
  const tokenCounts = chunks.map((c) => c.tokenCount);
  const totalChunkedCharCount = chunks.reduce((sum, c) => sum + c.charCount, 0);
  const overlapCharCount = chunks.reduce(
    (sum, c) => sum + c.overlapCharsBefore + c.overlapCharsAfter,
    0
  );

  return {
    originalCharCount: originalText.length,
    totalChunkedCharCount,
    overlapCharCount,
    avgChunkCharCount: chunks.length > 0 ? totalChunkedCharCount / chunks.length : 0,
    avgChunkTokenCount:
      chunks.length > 0
        ? tokenCounts.reduce((a, b) => a + b, 0) / chunks.length
        : 0,
    minChunkTokenCount: chunks.length > 0 ? Math.min(...tokenCounts) : 0,
    maxChunkTokenCount: chunks.length > 0 ? Math.max(...tokenCounts) : 0,
    sectionsDetected,
    durationMs: performance.now() - startTime,
  };
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Quick chunk function with default settings
 */
export function quickChunk(sourceId: string, text: string): ChunkingResult {
  return chunkLegalDocument({ sourceId, text });
}

/**
 * Chunk for embedding with e5-large (512 max tokens)
 */
export function chunkForE5Large(sourceId: string, text: string): ChunkingResult {
  return chunkLegalDocument({
    sourceId,
    text,
    config: {
      maxTokens: 450, // Leave room for special tokens
      minTokens: 50,
      overlapRatio: 0.15,
    },
  });
}

/**
 * Chunk with aggressive splitting for fine-grained retrieval
 */
export function chunkFineGrained(sourceId: string, text: string): ChunkingResult {
  return chunkLegalDocument({
    sourceId,
    text,
    config: {
      maxTokens: 256,
      minTokens: 30,
      overlapRatio: 0.2,
      hardBreakSections: [
        HebrewSectionType.PART,
        HebrewSectionType.CHAPTER,
        HebrewSectionType.SUBCHAPTER,
        HebrewSectionType.SECTION,
      ],
    },
  });
}

/**
 * Chunk with larger chunks for context preservation
 */
export function chunkLargeContext(sourceId: string, text: string): ChunkingResult {
  return chunkLegalDocument({
    sourceId,
    text,
    config: {
      maxTokens: 512,
      minTokens: 100,
      overlapRatio: 0.1,
      hardBreakSections: [HebrewSectionType.PART, HebrewSectionType.CHAPTER],
    },
  });
}

/**
 * Estimate how many chunks a text will produce
 */
export function estimateChunkCount(
  text: string,
  config?: Partial<ChunkingConfig>
): number {
  const cfg = createDefaultChunkingConfig(config);
  const totalTokens = estimateTokenCount(text.length, cfg.charsPerTokenEstimate);
  const effectiveTokensPerChunk = cfg.maxTokens * (1 - cfg.overlapRatio);
  return Math.ceil(totalTokens / effectiveTokensPerChunk);
}
