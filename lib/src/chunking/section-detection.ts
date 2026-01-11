/**
 * Section Detection for Hebrew Legal Documents
 *
 * Detects and parses section markers in Israeli legal texts.
 * Supports the standard hierarchical structure:
 * - חלק (Part)
 * - פרק (Chapter)
 * - סימן (Sub-chapter)
 * - סעיף (Section)
 * - תוספת (Schedule)
 */

import {
  HebrewSectionType,
  SectionMarkerSchema,
  getSectionHierarchyLevel,
  estimateTokenCount,
  type SectionMarker,
  type ParsedSection,
} from './types.js';

// =============================================================================
// Section Marker Patterns
// =============================================================================

/**
 * Hebrew number words for parsing (א-ת letter numbering)
 */
const HEBREW_LETTER_VALUES: Record<string, number> = {
  א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9,
  י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80, צ: 90,
  ק: 100, ר: 200, ש: 300, ת: 400,
  // Final forms
  ך: 20, ם: 40, ן: 50, ף: 80, ץ: 90,
};

/**
 * Pattern for Hebrew letter numbers (א, ב, יא, etc.)
 */
const HEBREW_LETTER_NUMBER = "[א-ת]+[׳']?";

/**
 * Pattern for Arabic numerals
 */
const ARABIC_NUMBER = '\\d+';

/**
 * Combined number pattern (Hebrew letters or Arabic numerals)
 */
const NUMBER_PATTERN = `(?:${HEBREW_LETTER_NUMBER}|${ARABIC_NUMBER})`;

/**
 * Section marker patterns with capture groups
 *
 * Each pattern captures:
 * - Group 1: Section number (if present)
 * - Group 2: Section title (if present)
 */
interface SectionPattern {
  type: HebrewSectionType;
  pattern: RegExp;
  /** Whether this pattern typically has inline content */
  hasInlineContent: boolean;
  /** Priority when multiple patterns match at same position (lower = higher priority) */
  priority: number;
}

const SECTION_PATTERNS: SectionPattern[] = [
  // חלק (Part) - Highest level
  {
    type: HebrewSectionType.PART,
    pattern: new RegExp(
      `^\\s*חלק\\s+(${NUMBER_PATTERN})(?:\\s*[-–:]\\s*(.+?))?\\s*$`,
      'gm'
    ),
    hasInlineContent: false,
    priority: 1,
  },
  // פרק (Chapter)
  {
    type: HebrewSectionType.CHAPTER,
    pattern: new RegExp(
      `^\\s*פרק\\s+(${NUMBER_PATTERN})(?:\\s*[-–:]\\s*(.+?))?\\s*$`,
      'gm'
    ),
    hasInlineContent: false,
    priority: 2,
  },
  // סימן (Sub-chapter)
  {
    type: HebrewSectionType.SUBCHAPTER,
    pattern: new RegExp(
      `^\\s*סימן\\s+(${NUMBER_PATTERN})(?:\\s*[-–:]\\s*(.+?))?\\s*$`,
      'gm'
    ),
    hasInlineContent: false,
    priority: 3,
  },
  // סעיף (Section) - Most common
  {
    type: HebrewSectionType.SECTION,
    pattern: new RegExp(
      `^\\s*סעיף\\s+(${NUMBER_PATTERN})(?:\\s*[-–.]\\s*)?`,
      'gm'
    ),
    hasInlineContent: true,
    priority: 4,
  },
  // סעיף קטן (Subsection) - e.g., "(א)", "(1)"
  {
    type: HebrewSectionType.SUBSECTION,
    pattern: new RegExp(
      `^\\s*\\((${NUMBER_PATTERN})\\)\\s*`,
      'gm'
    ),
    hasInlineContent: true,
    priority: 5,
  },
  // הגדרות (Definitions)
  {
    type: HebrewSectionType.DEFINITIONS,
    pattern: /^\s*הגדרות\s*$/gm,
    hasInlineContent: false,
    priority: 3,
  },
  // פרשנות (Interpretation)
  {
    type: HebrewSectionType.INTERPRETATION,
    pattern: /^\s*פרשנות\s*$/gm,
    hasInlineContent: false,
    priority: 4,
  },
  // תחילה (Commencement)
  {
    type: HebrewSectionType.COMMENCEMENT,
    pattern: /^\s*תחילה(?:\s+ותחולה)?\s*$/gm,
    hasInlineContent: false,
    priority: 4,
  },
  // ביטול (Repeal)
  {
    type: HebrewSectionType.REPEAL,
    pattern: /^\s*ביטול\s*$/gm,
    hasInlineContent: false,
    priority: 4,
  },
  // תוספת (Schedule) - e.g., "תוספת ראשונה", "תוספת א"
  {
    type: HebrewSectionType.SCHEDULE,
    pattern: new RegExp(
      `^\\s*תוספת(?:\\s+(${NUMBER_PATTERN}|ראשונה|שניה|שלישית|רביעית|חמישית))?(?:\\s*[-–:]\\s*(.+?))?\\s*$`,
      'gm'
    ),
    hasInlineContent: false,
    priority: 2,
  },
  // תיקון (Amendment) - e.g., "תיקון מס' 5"
  {
    type: HebrewSectionType.AMENDMENT,
    pattern: new RegExp(
      `^\\s*תיקון\\s+(?:מס['׳]\\s*)?(${NUMBER_PATTERN})\\s*$`,
      'gm'
    ),
    hasInlineContent: false,
    priority: 4,
  },
  // מבוא (Preamble)
  {
    type: HebrewSectionType.PREAMBLE,
    pattern: /^\s*מבוא\s*$/gm,
    hasInlineContent: false,
    priority: 1,
  },
];

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Parse Hebrew letter number to integer
 *
 * Examples:
 * - "א" → 1
 * - "י" → 10
 * - "יא" → 11
 * - "כ" → 20
 */
export function parseHebrewNumber(hebrewNum: string): number | null {
  if (!hebrewNum || hebrewNum.length === 0) return null;

  // Remove geresh/gershayim
  const cleaned = hebrewNum.replace(/[׳'״"]/g, '');

  // Check if it's a simple Arabic numeral
  if (/^\d+$/.test(cleaned)) {
    return parseInt(cleaned, 10);
  }

  // Parse Hebrew letter numbers
  let total = 0;
  for (const char of cleaned) {
    const value = HEBREW_LETTER_VALUES[char];
    if (value === undefined) {
      return null; // Unknown character
    }
    total += value;
  }

  return total > 0 ? total : null;
}

/**
 * Normalize section number for consistent formatting
 */
export function normalizeSectionNumber(number: string | null): string | null {
  if (!number) return null;

  const trimmed = number.trim();
  if (!trimmed) return null;

  // Keep as-is for now, preserving original format
  return trimmed;
}

// =============================================================================
// Section Detection Functions
// =============================================================================

/**
 * Detect all section markers in text
 *
 * @param text - The text to scan for section markers
 * @returns Array of detected section markers, sorted by position
 */
export function detectSectionMarkers(text: string): SectionMarker[] {
  const markers: SectionMarker[] = [];

  for (const patternDef of SECTION_PATTERNS) {
    // Reset regex lastIndex for each pattern
    const pattern = new RegExp(patternDef.pattern.source, patternDef.pattern.flags);

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const startPosition = match.index;
      const matchedText = match[0];
      const endPosition = startPosition + matchedText.length;

      // Extract number and title from capture groups
      const number = match[1] ? normalizeSectionNumber(match[1]) : null;
      const title = match[2]?.trim() || null;

      const marker: SectionMarker = {
        type: patternDef.type,
        number,
        title,
        matchedText: matchedText.trim(),
        startPosition,
        endPosition,
        hierarchyLevel: getSectionHierarchyLevel(patternDef.type),
      };

      // Validate with schema
      const validated = SectionMarkerSchema.safeParse(marker);
      if (validated.success) {
        markers.push(validated.data);
      }
    }
  }

  // Sort by position and handle overlapping matches
  markers.sort((a, b) => {
    if (a.startPosition !== b.startPosition) {
      return a.startPosition - b.startPosition;
    }
    // If same position, prefer higher-level sections (lower hierarchy level)
    return a.hierarchyLevel - b.hierarchyLevel;
  });

  // Remove overlapping markers (keep the first/higher-level one)
  const filtered: SectionMarker[] = [];
  let lastEnd = -1;

  for (const marker of markers) {
    if (marker.startPosition >= lastEnd) {
      filtered.push(marker);
      lastEnd = marker.endPosition;
    }
  }

  return filtered;
}

/**
 * Find the section marker containing a specific position
 */
export function findContainingSection(
  position: number,
  markers: SectionMarker[]
): SectionMarker | null {
  // Find the last marker that starts before or at this position
  let containing: SectionMarker | null = null;

  for (const marker of markers) {
    if (marker.startPosition <= position) {
      containing = marker;
    } else {
      break; // Markers are sorted by position
    }
  }

  return containing;
}

/**
 * Build section hierarchy for a position in the text
 *
 * Returns an array of section markers from root to most specific,
 * based on the marker positions before the given position.
 */
export function buildSectionHierarchy(
  position: number,
  markers: SectionMarker[]
): SectionMarker[] {
  const hierarchy: SectionMarker[] = [];
  const levelMap = new Map<number, SectionMarker>();

  for (const marker of markers) {
    if (marker.startPosition > position) {
      break; // Past our position
    }

    const level = marker.hierarchyLevel;

    // This marker becomes the current marker at its level
    levelMap.set(level, marker);

    // Clear all lower levels (higher hierarchy numbers) since they're now stale
    for (const [existingLevel] of levelMap) {
      if (existingLevel > level) {
        levelMap.delete(existingLevel);
      }
    }
  }

  // Sort by hierarchy level and return
  const sortedLevels = Array.from(levelMap.keys()).sort((a, b) => a - b);
  for (const level of sortedLevels) {
    const marker = levelMap.get(level);
    if (marker) {
      hierarchy.push(marker);
    }
  }

  return hierarchy;
}

/**
 * Parse text into sections based on detected markers
 *
 * @param text - The full document text
 * @param charsPerToken - Characters per token for estimation
 * @returns Array of parsed sections with content
 */
export function parseIntoSections(
  text: string,
  charsPerToken: number = 2.5
): ParsedSection[] {
  const markers = detectSectionMarkers(text);
  const sections: ParsedSection[] = [];

  if (markers.length === 0) {
    // No sections detected - treat entire text as one section
    return [
      {
        marker: null,
        content: text,
        charCount: text.length,
        estimatedTokens: estimateTokenCount(text.length, charsPerToken),
        parentMarkers: [],
        children: [],
      },
    ];
  }

  // Add content before first marker if exists
  if (markers[0].startPosition > 0) {
    const preContent = text.slice(0, markers[0].startPosition).trim();
    if (preContent.length > 0) {
      sections.push({
        marker: null,
        content: preContent,
        charCount: preContent.length,
        estimatedTokens: estimateTokenCount(preContent.length, charsPerToken),
        parentMarkers: [],
        children: [],
      });
    }
  }

  // Process each marker and its content
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const nextMarker = markers[i + 1];

    // Content is from end of marker to start of next marker (or end of text)
    const contentStart = marker.endPosition;
    const contentEnd = nextMarker ? nextMarker.startPosition : text.length;
    const content = text.slice(contentStart, contentEnd).trim();

    // Build hierarchy for this position
    const parentMarkers = buildSectionHierarchy(marker.startPosition, markers).filter(
      (m) => m !== marker && m.hierarchyLevel < marker.hierarchyLevel
    );

    sections.push({
      marker,
      content,
      charCount: content.length,
      estimatedTokens: estimateTokenCount(content.length, charsPerToken),
      parentMarkers,
      children: [],
    });
  }

  return sections;
}

/**
 * Find natural break points in text for chunking
 *
 * Returns positions where it's semantically appropriate to split,
 * prioritizing section boundaries, then paragraph breaks, then sentences.
 */
export function findBreakPoints(
  text: string,
  markers: SectionMarker[]
): Array<{ position: number; priority: number; type: 'section' | 'paragraph' | 'sentence' }> {
  const breakPoints: Array<{
    position: number;
    priority: number;
    type: 'section' | 'paragraph' | 'sentence';
  }> = [];

  // Add section markers as break points (highest priority)
  for (const marker of markers) {
    breakPoints.push({
      position: marker.startPosition,
      priority: 1,
      type: 'section',
    });
  }

  // Find paragraph breaks (double newlines)
  const paragraphPattern = /\n\s*\n/g;
  let paragraphMatch: RegExpExecArray | null;
  while ((paragraphMatch = paragraphPattern.exec(text)) !== null) {
    breakPoints.push({
      position: paragraphMatch.index + paragraphMatch[0].length,
      priority: 2,
      type: 'paragraph',
    });
  }

  // Find sentence endings (lower priority)
  const sentencePattern = /[.!?:;]\s+/g;
  let sentenceMatch: RegExpExecArray | null;
  while ((sentenceMatch = sentencePattern.exec(text)) !== null) {
    // Only add if not too close to existing break points
    const position = sentenceMatch.index + sentenceMatch[0].length;
    const tooClose = breakPoints.some(
      (bp) => Math.abs(bp.position - position) < 20
    );
    if (!tooClose) {
      breakPoints.push({
        position,
        priority: 3,
        type: 'sentence',
      });
    }
  }

  // Sort by position, then by priority
  breakPoints.sort((a, b) => {
    if (a.position !== b.position) {
      return a.position - b.position;
    }
    return a.priority - b.priority;
  });

  return breakPoints;
}

/**
 * Check if a position is at a section boundary
 */
export function isAtSectionBoundary(position: number, markers: SectionMarker[]): boolean {
  return markers.some((m) => m.startPosition === position);
}

/**
 * Get the section type at a position
 */
export function getSectionTypeAtPosition(
  position: number,
  markers: SectionMarker[]
): HebrewSectionType | null {
  const containing = findContainingSection(position, markers);
  return containing?.type ?? null;
}

/**
 * Check if text contains any section markers
 */
export function hasSectionMarkers(text: string): boolean {
  for (const patternDef of SECTION_PATTERNS) {
    const pattern = new RegExp(patternDef.pattern.source, patternDef.pattern.flags);
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Count sections by type in text
 */
export function countSectionsByType(text: string): Map<HebrewSectionType, number> {
  const markers = detectSectionMarkers(text);
  const counts = new Map<HebrewSectionType, number>();

  for (const marker of markers) {
    counts.set(marker.type, (counts.get(marker.type) ?? 0) + 1);
  }

  return counts;
}
