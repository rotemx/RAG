/**
 * Hebrew Text Cleanup Utilities
 *
 * Functions for cleaning up Hebrew text extracted from PDF files.
 * Handles common issues like PDF artifacts, reversed text, and normalization.
 */

import { z } from 'zod';

// ============================================================================
// Types and Schemas
// ============================================================================

/**
 * Options for Hebrew text cleanup
 */
export const HebrewCleanupOptionsSchema = z.object({
  /** Remove PDF control characters and artifacts (default: true) */
  removeControlChars: z.boolean().default(true),
  /** Fix reversed Hebrew text (default: true) */
  fixReversedText: z.boolean().default(true),
  /** Normalize whitespace (collapse multiple spaces, trim) (default: true) */
  normalizeWhitespace: z.boolean().default(true),
  /** Normalize punctuation (Hebrew-specific fixes) (default: true) */
  normalizePunctuation: z.boolean().default(true),
  /** Remove page numbers (default: true) */
  removePageNumbers: z.boolean().default(true),
  /** Remove headers/footers (default: true) */
  removeHeadersFooters: z.boolean().default(true),
  /** Minimum line length to consider as content (default: 3) */
  minLineLength: z.number().int().nonnegative().default(3),
  /** Preserve paragraph structure (double newlines) (default: true) */
  preserveParagraphs: z.boolean().default(true),
});

export type HebrewCleanupOptions = z.infer<typeof HebrewCleanupOptionsSchema>;

/**
 * Result of Hebrew text cleanup
 */
export const HebrewCleanupResultSchema = z.object({
  /** Cleaned text */
  text: z.string(),
  /** Original character count */
  originalCharCount: z.number().int().nonnegative(),
  /** Cleaned character count */
  cleanedCharCount: z.number().int().nonnegative(),
  /** Characters removed */
  charsRemoved: z.number().int().nonnegative(),
  /** Whether reversed text was detected and fixed */
  reversedTextFixed: z.boolean(),
  /** Number of lines removed (headers, footers, page numbers) */
  linesRemoved: z.number().int().nonnegative(),
  /** Processing duration in milliseconds */
  durationMs: z.number().nonnegative(),
});

export type HebrewCleanupResult = z.infer<typeof HebrewCleanupResultSchema>;

// ============================================================================
// Constants
// ============================================================================

/**
 * Unicode ranges for Hebrew characters
 */
const HEBREW_RANGE = {
  /** Hebrew letters (א-ת) */
  LETTERS_START: 0x05d0,
  LETTERS_END: 0x05ea,
  /** Hebrew points and marks */
  POINTS_START: 0x0591,
  POINTS_END: 0x05c7,
  /** Hebrew punctuation */
  PUNCTUATION_START: 0x05f0,
  PUNCTUATION_END: 0x05f4,
};

/**
 * Common PDF artifacts to remove
 */
const PDF_ARTIFACTS = [
  '\x00', // NULL
  '\x01', // SOH
  '\x02', // STX
  '\x03', // ETX
  '\x04', // EOT
  '\x05', // ENQ
  '\x06', // ACK
  '\x07', // BEL
  '\x08', // BS
  '\x0b', // VT (vertical tab)
  '\x0c', // FF (form feed)
  '\x0e', // SO
  '\x0f', // SI
  '\x10', // DLE
  '\x11', // DC1
  '\x12', // DC2
  '\x13', // DC3
  '\x14', // DC4
  '\x15', // NAK
  '\x16', // SYN
  '\x17', // ETB
  '\x18', // CAN
  '\x19', // EM
  '\x1a', // SUB
  '\x1b', // ESC
  '\x1c', // FS
  '\x1d', // GS
  '\x1e', // RS
  '\x1f', // US
  '\x7f', // DEL
  '\ufeff', // BOM (Byte Order Mark)
  '\ufffe', // Not a character
  '\uffff', // Not a character
];

/**
 * Regex pattern for control characters
 */
const CONTROL_CHARS_PATTERN = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

/**
 * Pattern for common page number formats in Hebrew documents
 */
const PAGE_NUMBER_PATTERNS = [
  // Hebrew: "עמוד 1", "עמ' 1", "- 1 -"
  /^\s*עמוד\s*\d+\s*$/gm,
  /^\s*עמ['׳]\s*\d+\s*$/gm,
  /^\s*-\s*\d+\s*-\s*$/gm,
  // Standalone numbers at start/end of lines (likely page numbers)
  /^\s*\d{1,4}\s*$/gm,
  // "Page X" or "Page X of Y"
  /^\s*page\s*\d+(\s*(of|\/)\s*\d+)?\s*$/gim,
];

/**
 * Common header/footer patterns in Israeli legal documents
 */
const HEADER_FOOTER_PATTERNS = [
  // "ספר החוקים", "קובץ התקנות", "רשומות" - common publication headers
  /^\s*ספר החוקים\s*$/gm,
  /^\s*קובץ התקנות\s*$/gm,
  /^\s*רשומות\s*$/gm,
  /^\s*ילקוט הפרסומים\s*$/gm,
  // Date patterns that appear as headers
  /^\s*\d{1,2}[./]\d{1,2}[./]\d{2,4}\s*$/gm,
  // Publication year patterns
  /^\s*תש[א-ת]{1,2}[-–]\d{4}\s*$/gm,
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a character is a Hebrew letter
 */
export function isHebrewLetter(char: string): boolean {
  if (char.length !== 1) return false;
  const code = char.charCodeAt(0);
  return code >= HEBREW_RANGE.LETTERS_START && code <= HEBREW_RANGE.LETTERS_END;
}

/**
 * Check if a character is in Hebrew range (letters, points, punctuation)
 */
export function isHebrewChar(char: string): boolean {
  if (char.length !== 1) return false;
  const code = char.charCodeAt(0);
  return (
    (code >= HEBREW_RANGE.LETTERS_START && code <= HEBREW_RANGE.LETTERS_END) ||
    (code >= HEBREW_RANGE.POINTS_START && code <= HEBREW_RANGE.POINTS_END) ||
    (code >= HEBREW_RANGE.PUNCTUATION_START && code <= HEBREW_RANGE.PUNCTUATION_END)
  );
}

/**
 * Count Hebrew characters in a string
 */
export function countHebrewChars(text: string): number {
  let count = 0;
  for (const char of text) {
    if (isHebrewLetter(char)) {
      count++;
    }
  }
  return count;
}

/**
 * Calculate the ratio of Hebrew characters in text
 */
export function hebrewRatio(text: string): number {
  const total = text.replace(/\s/g, '').length;
  if (total === 0) return 0;
  return countHebrewChars(text) / total;
}

/**
 * Check if text appears to be reversed (RTL incorrectly extracted as LTR)
 *
 * Detects reversed text by looking for Hebrew word patterns that appear backwards.
 * Common indicators:
 * - Final forms (ך, ם, ן, ף, ץ) appearing at the start of words
 * - Common Hebrew word patterns that appear reversed
 */
export function isTextReversed(text: string): boolean {
  // Extract Hebrew words (consecutive Hebrew letters)
  const hebrewWordPattern = /[א-ת]+/g;
  const words = text.match(hebrewWordPattern);

  if (!words || words.length < 3) {
    return false; // Not enough words to determine
  }

  // Final forms that should appear at end of words
  const finalForms = ['ך', 'ם', 'ן', 'ף', 'ץ'];
  // Non-final forms that correspond to final forms
  const nonFinalForms = ['כ', 'מ', 'נ', 'פ', 'צ'];

  let finalAtStart = 0;
  let nonFinalAtEnd = 0;
  let wordsChecked = 0;

  for (const word of words) {
    if (word.length < 2) continue;
    wordsChecked++;

    const firstChar = word[0];
    const lastChar = word[word.length - 1];

    // Check if final form is at the start (indicates reversed)
    if (finalForms.includes(firstChar)) {
      finalAtStart++;
    }

    // Check if non-final form is at the end where final should be
    if (nonFinalForms.includes(lastChar)) {
      nonFinalAtEnd++;
    }
  }

  if (wordsChecked === 0) return false;

  // If more than 30% of words have final forms at start, likely reversed
  const reversedRatio = finalAtStart / wordsChecked;
  return reversedRatio > 0.3;
}

/**
 * Reverse a Hebrew word while preserving final forms
 *
 * When reversing, also swap final/non-final form letters:
 * - כ <-> ך
 * - מ <-> ם
 * - נ <-> ן
 * - פ <-> ף
 * - צ <-> ץ
 */
export function reverseHebrewWord(word: string): string {
  const finalToNonFinal: Record<string, string> = {
    ך: 'כ',
    ם: 'מ',
    ן: 'נ',
    ף: 'פ',
    ץ: 'צ',
  };

  const nonFinalToFinal: Record<string, string> = {
    כ: 'ך',
    מ: 'ם',
    נ: 'ן',
    פ: 'ף',
    צ: 'ץ',
  };

  const chars = [...word].reverse();

  // Fix final forms: first char after reverse was last (should be non-final)
  // last char after reverse was first (should be final if applicable)
  return chars
    .map((char, index) => {
      if (index === chars.length - 1) {
        // This is now the last character - should be final form if applicable
        return nonFinalToFinal[char] ?? char;
      } else if (index === 0) {
        // This was the last character - should NOT be final form
        return finalToNonFinal[char] ?? char;
      }
      // Middle characters - should not be final forms
      return finalToNonFinal[char] ?? char;
    })
    .join('');
}

/**
 * Reverse reversed Hebrew text while preserving non-Hebrew content
 */
export function fixReversedHebrewText(text: string): string {
  // Process line by line to handle mixed content better
  return text
    .split('\n')
    .map((line) => {
      // Check if this line is predominantly Hebrew
      if (hebrewRatio(line) < 0.3) {
        return line; // Keep non-Hebrew lines as-is
      }

      // Split by Hebrew word boundaries, preserving delimiters
      const parts = line.split(/([א-ת]+)/g);

      // Reverse each Hebrew word
      const fixedParts = parts.map((part) => {
        if (/^[א-ת]+$/.test(part)) {
          return reverseHebrewWord(part);
        }
        return part;
      });

      // Reverse the order of parts to fix RTL ordering
      // But keep leading/trailing whitespace in place
      const leadingSpace = line.match(/^\s*/)?.[0] ?? '';
      const trailingSpace = line.match(/\s*$/)?.[0] ?? '';

      const content = fixedParts.join('').trim();
      const contentParts = content.split(/(\s+)/);
      const reversedContent = contentParts.reverse().join('');

      return leadingSpace + reversedContent + trailingSpace;
    })
    .join('\n');
}

// ============================================================================
// Cleanup Functions
// ============================================================================

/**
 * Remove PDF control characters and artifacts
 */
export function removeControlCharacters(text: string): string {
  let result = text;

  // Remove specific PDF artifacts
  for (const artifact of PDF_ARTIFACTS) {
    result = result.split(artifact).join('');
  }

  // Remove remaining control characters
  result = result.replace(CONTROL_CHARS_PATTERN, '');

  // Remove soft hyphens
  result = result.replace(/\u00ad/g, '');

  // Remove zero-width characters (except ZWNJ and ZWJ which may be intentional)
  result = result.replace(/[\u200b\u200c\u200d\ufeff]/g, '');

  return result;
}

/**
 * Normalize whitespace in Hebrew text
 */
export function normalizeWhitespace(text: string, preserveParagraphs: boolean = true): string {
  let result = text;

  // Replace various space characters with regular space
  result = result.replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g, ' ');

  // Replace tabs with spaces
  result = result.replace(/\t/g, ' ');

  // Collapse multiple spaces to single space
  result = result.replace(/ {2,}/g, ' ');

  if (preserveParagraphs) {
    // Normalize line endings to \n
    result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Collapse 3+ newlines to 2 (paragraph break)
    result = result.replace(/\n{3,}/g, '\n\n');

    // Trim whitespace from each line
    result = result
      .split('\n')
      .map((line) => line.trim())
      .join('\n');
  } else {
    // Normalize all line endings
    result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Collapse multiple newlines
    result = result.replace(/\n{2,}/g, '\n');
  }

  // Trim leading/trailing whitespace
  result = result.trim();

  return result;
}

/**
 * Normalize Hebrew punctuation
 */
export function normalizePunctuation(text: string): string {
  let result = text;

  // Normalize Hebrew geresh and gershayim
  // גרש (׳) and גרשיים (״) should be used consistently
  result = result.replace(/[''`´]/g, '׳'); // Normalize to Hebrew geresh
  result = result.replace(/["״""]/g, '"'); // Normalize double quotes (keep standard quote)

  // Normalize Hebrew maqaf (־) vs regular hyphen (-)
  // In Hebrew, use maqaf for compound words
  result = result.replace(/(?<=[א-ת])-(?=[א-ת])/g, '־');

  // Fix spaces around punctuation
  // Remove space before punctuation
  result = result.replace(/ +([.,;:!?])/g, '$1');
  // Add space after punctuation if missing (but not before numbers or at end of line)
  result = result.replace(/([.,;:!?])(?=[א-תa-zA-Z])/g, '$1 ');

  // Normalize ellipsis
  result = result.replace(/\.{3,}/g, '...');

  // Fix double punctuation
  result = result.replace(/([.,;:!?])\1+/g, '$1');

  return result;
}

/**
 * Remove page numbers from text
 */
export function removePageNumbers(text: string): string {
  let result = text;

  for (const pattern of PAGE_NUMBER_PATTERNS) {
    result = result.replace(pattern, '');
  }

  return result;
}

/**
 * Remove headers and footers from text
 */
export function removeHeadersFooters(text: string): string {
  let result = text;

  for (const pattern of HEADER_FOOTER_PATTERNS) {
    result = result.replace(pattern, '');
  }

  return result;
}

/**
 * Remove lines shorter than minimum length
 */
export function removeShortLines(text: string, minLength: number): string {
  return text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      // Keep empty lines (paragraph breaks) and lines meeting minimum length
      return trimmed.length === 0 || trimmed.length >= minLength;
    })
    .join('\n');
}

// ============================================================================
// Main Cleanup Function
// ============================================================================

/**
 * Clean up Hebrew text extracted from PDF
 *
 * This is the main cleanup function that applies all cleanup operations
 * based on the provided options.
 *
 * @param text - Raw text extracted from PDF
 * @param options - Cleanup options (all enabled by default)
 * @returns Cleanup result with cleaned text and statistics
 *
 * @example
 * ```typescript
 * const rawText = extractedPdfResult.text;
 * const result = cleanupHebrewText(rawText);
 *
 * console.log(`Cleaned: ${result.cleanedCharCount} chars (removed ${result.charsRemoved})`);
 * if (result.reversedTextFixed) {
 *   console.log('Fixed reversed Hebrew text');
 * }
 * ```
 */
export function cleanupHebrewText(
  text: string,
  options?: Partial<HebrewCleanupOptions>
): HebrewCleanupResult {
  const startTime = performance.now();
  const originalCharCount = text.length;

  // Parse and apply defaults to options
  const opts = HebrewCleanupOptionsSchema.parse(options ?? {});

  let result = text;
  let reversedTextFixed = false;
  let linesRemoved = 0;

  // 1. Remove control characters and artifacts
  if (opts.removeControlChars) {
    result = removeControlCharacters(result);
  }

  // 2. Check and fix reversed text
  if (opts.fixReversedText && isTextReversed(result)) {
    result = fixReversedHebrewText(result);
    reversedTextFixed = true;
  }

  // 3. Remove page numbers
  if (opts.removePageNumbers) {
    const beforeLines = result.split('\n').length;
    result = removePageNumbers(result);
    linesRemoved += beforeLines - result.split('\n').length;
  }

  // 4. Remove headers and footers
  if (opts.removeHeadersFooters) {
    const beforeLines = result.split('\n').length;
    result = removeHeadersFooters(result);
    linesRemoved += beforeLines - result.split('\n').length;
  }

  // 5. Remove short lines
  if (opts.minLineLength > 0) {
    const beforeLines = result.split('\n').filter((l) => l.trim().length > 0).length;
    result = removeShortLines(result, opts.minLineLength);
    const afterLines = result.split('\n').filter((l) => l.trim().length > 0).length;
    linesRemoved += beforeLines - afterLines;
  }

  // 6. Normalize punctuation
  if (opts.normalizePunctuation) {
    result = normalizePunctuation(result);
  }

  // 7. Normalize whitespace (do this last to clean up any gaps)
  if (opts.normalizeWhitespace) {
    result = normalizeWhitespace(result, opts.preserveParagraphs);
  }

  const durationMs = performance.now() - startTime;
  const cleanedCharCount = result.length;

  return {
    text: result,
    originalCharCount,
    cleanedCharCount,
    charsRemoved: originalCharCount - cleanedCharCount,
    reversedTextFixed,
    linesRemoved,
    durationMs,
  };
}

/**
 * Quick cleanup with sensible defaults for most Hebrew PDF text
 *
 * This is a convenience function that applies all cleanup with default options.
 *
 * @param text - Raw text extracted from PDF
 * @returns Cleaned text string
 */
export function quickCleanup(text: string): string {
  return cleanupHebrewText(text).text;
}

/**
 * Detect the dominant text direction in the content
 *
 * @param text - Text to analyze
 * @returns 'rtl' for Hebrew-dominant, 'ltr' for Latin-dominant, 'mixed' for balanced
 */
export function detectTextDirection(text: string): 'rtl' | 'ltr' | 'mixed' {
  const ratio = hebrewRatio(text);

  if (ratio > 0.6) return 'rtl';
  if (ratio < 0.2) return 'ltr';
  return 'mixed';
}
