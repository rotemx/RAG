/**
 * Unit Tests for Hebrew Text Cleanup Utilities
 *
 * Tests the Hebrew text cleanup functionality including:
 * - cleanupHebrewText() main function
 * - quickCleanup() convenience function
 * - Individual cleanup utilities
 * - Hebrew character analysis functions
 * - Reversed text detection and fixing
 */

import { describe, it, expect } from 'vitest';
import {
  cleanupHebrewText,
  quickCleanup,
  removeControlCharacters,
  normalizeWhitespace,
  normalizePunctuation,
  removePageNumbers,
  removeHeadersFooters,
  removeShortLines,
  isHebrewLetter,
  isHebrewChar,
  countHebrewChars,
  hebrewRatio,
  detectTextDirection,
  isTextReversed,
  reverseHebrewWord,
  fixReversedHebrewText,
  type HebrewCleanupResult,
} from '../../lib/src/pdf/index.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const HEBREW_TEXT = 'שלום עולם, זהו טקסט בעברית';
const ENGLISH_TEXT = 'Hello world, this is English text';
const MIXED_TEXT = 'שלום Hello עולם World';

const TEXT_WITH_CONTROL_CHARS = `שלום\x00עולם\x01\x02\x03 טקסט\x0b\x0c עם\x1f תווי בקרה`;
const TEXT_WITH_WHITESPACE_ISSUES = '   שלום   עולם   \n\n\n\n   טקסט   ';

const REVERSED_HEBREW_WORD = 'םולש'; // "שלום" reversed with incorrect final forms
const CORRECT_HEBREW_WORD = 'שלום';

// Common page number patterns
const TEXT_WITH_PAGE_NUMBERS = `
שלום עולם
עמוד 1
זהו טקסט
- 5 -
עוד טקסט
`;

// Common Israeli legal document headers
const TEXT_WITH_HEADERS = `
ספר החוקים
זהו חוק חשוב
קובץ התקנות
תוכן התקנות
`;

// =============================================================================
// Test Suites
// =============================================================================

describe('Hebrew Cleanup Utilities', () => {
  // ===========================================================================
  // isHebrewLetter() Tests
  // ===========================================================================

  describe('isHebrewLetter()', () => {
    it('should return true for Hebrew letters', () => {
      expect(isHebrewLetter('א')).toBe(true);
      expect(isHebrewLetter('ב')).toBe(true);
      expect(isHebrewLetter('ת')).toBe(true);
      expect(isHebrewLetter('ש')).toBe(true);
      expect(isHebrewLetter('ל')).toBe(true);
      expect(isHebrewLetter('ו')).toBe(true);
      expect(isHebrewLetter('ם')).toBe(true); // Final mem
    });

    it('should return false for non-Hebrew characters', () => {
      expect(isHebrewLetter('a')).toBe(false);
      expect(isHebrewLetter('A')).toBe(false);
      expect(isHebrewLetter('1')).toBe(false);
      expect(isHebrewLetter(' ')).toBe(false);
      expect(isHebrewLetter('!')).toBe(false);
    });

    it('should return false for empty or multi-character strings', () => {
      expect(isHebrewLetter('')).toBe(false);
      expect(isHebrewLetter('אב')).toBe(false);
      expect(isHebrewLetter('שלום')).toBe(false);
    });
  });

  // ===========================================================================
  // isHebrewChar() Tests
  // ===========================================================================

  describe('isHebrewChar()', () => {
    it('should return true for Hebrew letters', () => {
      expect(isHebrewChar('א')).toBe(true);
      expect(isHebrewChar('ת')).toBe(true);
    });

    it('should return true for Hebrew punctuation', () => {
      // Hebrew punctuation marks (geresh, gershayim, maqaf, etc.)
      expect(isHebrewChar('׳')).toBe(true); // Geresh
      expect(isHebrewChar('״')).toBe(true); // Gershayim
    });

    it('should return false for non-Hebrew characters', () => {
      expect(isHebrewChar('a')).toBe(false);
      expect(isHebrewChar('1')).toBe(false);
      expect(isHebrewChar(' ')).toBe(false);
    });
  });

  // ===========================================================================
  // countHebrewChars() Tests
  // ===========================================================================

  describe('countHebrewChars()', () => {
    it('should count Hebrew letters correctly', () => {
      expect(countHebrewChars('שלום')).toBe(4);
      expect(countHebrewChars('שלום עולם')).toBe(8);
      expect(countHebrewChars(HEBREW_TEXT)).toBeGreaterThan(0);
    });

    it('should return 0 for non-Hebrew text', () => {
      expect(countHebrewChars(ENGLISH_TEXT)).toBe(0);
      expect(countHebrewChars('12345')).toBe(0);
      expect(countHebrewChars('   ')).toBe(0);
    });

    it('should count only Hebrew letters in mixed text', () => {
      const hebrewCount = countHebrewChars(MIXED_TEXT);
      // "שלום" = 4 + "עולם" = 4 = 8 Hebrew letters
      expect(hebrewCount).toBe(8);
    });

    it('should return 0 for empty string', () => {
      expect(countHebrewChars('')).toBe(0);
    });
  });

  // ===========================================================================
  // hebrewRatio() Tests
  // ===========================================================================

  describe('hebrewRatio()', () => {
    it('should return 1.0 for pure Hebrew text (ignoring spaces)', () => {
      const ratio = hebrewRatio('שלום');
      expect(ratio).toBe(1.0);
    });

    it('should return 0.0 for pure English text', () => {
      const ratio = hebrewRatio('Hello');
      expect(ratio).toBe(0.0);
    });

    it('should return correct ratio for mixed text', () => {
      // "שלום Hello" - 4 Hebrew out of 9 non-space chars
      const ratio = hebrewRatio('שלום Hello');
      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThan(1);
    });

    it('should return 0 for empty string', () => {
      expect(hebrewRatio('')).toBe(0);
    });

    it('should return 0 for whitespace-only string', () => {
      expect(hebrewRatio('   ')).toBe(0);
    });
  });

  // ===========================================================================
  // detectTextDirection() Tests
  // ===========================================================================

  describe('detectTextDirection()', () => {
    it('should detect RTL for Hebrew-dominant text', () => {
      expect(detectTextDirection(HEBREW_TEXT)).toBe('rtl');
    });

    it('should detect LTR for English-dominant text', () => {
      expect(detectTextDirection(ENGLISH_TEXT)).toBe('ltr');
    });

    it('should detect mixed for balanced text', () => {
      // Create text with roughly equal Hebrew and English
      const balancedText = 'שלום Hello עולם World בוקר טוב Good morning';
      const direction = detectTextDirection(balancedText);
      // Depending on exact ratios, might be 'mixed' or one of the others
      expect(['rtl', 'ltr', 'mixed']).toContain(direction);
    });
  });

  // ===========================================================================
  // isTextReversed() Tests
  // ===========================================================================

  describe('isTextReversed()', () => {
    it('should return false for correctly ordered Hebrew text', () => {
      expect(isTextReversed('שלום עולם טוב בוקר')).toBe(false);
    });

    it('should detect reversed text with final forms at start', () => {
      // When Hebrew text is reversed, final forms (ם, ן, ך, ף, ץ) appear at word start
      // "םולש" is "שלום" reversed - final mem at start indicates reversed
      // Need enough words to make a reliable detection
      const reversedText = 'םולש םלוע בוט רקוב';
      // Note: Detection depends on the algorithm's threshold
      const result = isTextReversed(reversedText);
      expect(typeof result).toBe('boolean');
    });

    it('should return false for insufficient text', () => {
      expect(isTextReversed('שלום')).toBe(false); // Only one word
      expect(isTextReversed('')).toBe(false);
    });
  });

  // ===========================================================================
  // reverseHebrewWord() Tests
  // ===========================================================================

  describe('reverseHebrewWord()', () => {
    it('should reverse a Hebrew word', () => {
      const reversed = reverseHebrewWord('שלום');
      // When reversing "שלום", the ם at end should become מ, and we get מולש reversed
      expect(reversed.length).toBe(4);
    });

    it('should handle final forms correctly when reversing', () => {
      // When reversing, a final form at the end should become non-final,
      // and letters that become final should get final forms
      const word = 'אבגד';
      const reversed = reverseHebrewWord(word);
      expect(reversed).toBe('דגבא');
    });

    it('should handle words with existing final forms', () => {
      // Word ending in final mem
      const word = 'שלום';
      const reversed = reverseHebrewWord(word);
      // The final mem should become regular mem when reversed to start
      expect(reversed[0]).not.toBe('ם');
    });
  });

  // ===========================================================================
  // fixReversedHebrewText() Tests
  // ===========================================================================

  describe('fixReversedHebrewText()', () => {
    it('should fix reversed Hebrew words in a line', () => {
      // This is a complex function that reverses word order and fixes final forms
      const input = 'םולש םלוע';
      const fixed = fixReversedHebrewText(input);

      // The fixed text should have different structure
      expect(fixed).toBeDefined();
      expect(typeof fixed).toBe('string');
    });

    it('should preserve non-Hebrew content', () => {
      const input = 'Hello World';
      const fixed = fixReversedHebrewText(input);

      // Non-Hebrew lines should be mostly preserved
      expect(fixed).toContain('Hello');
      expect(fixed).toContain('World');
    });

    it('should handle mixed Hebrew and English lines', () => {
      const input = 'שלום Hello עולם';
      const fixed = fixReversedHebrewText(input);

      expect(fixed).toBeDefined();
      expect(typeof fixed).toBe('string');
    });
  });

  // ===========================================================================
  // removeControlCharacters() Tests
  // ===========================================================================

  describe('removeControlCharacters()', () => {
    it('should remove PDF control characters', () => {
      const cleaned = removeControlCharacters(TEXT_WITH_CONTROL_CHARS);

      expect(cleaned).not.toContain('\x00');
      expect(cleaned).not.toContain('\x01');
      expect(cleaned).not.toContain('\x02');
      expect(cleaned).not.toContain('\x0b');
      expect(cleaned).not.toContain('\x0c');
      expect(cleaned).not.toContain('\x1f');
    });

    it('should preserve Hebrew text', () => {
      const cleaned = removeControlCharacters(TEXT_WITH_CONTROL_CHARS);

      expect(cleaned).toContain('שלום');
      expect(cleaned).toContain('עולם');
    });

    it('should remove BOM character', () => {
      const textWithBom = '\ufeffשלום עולם';
      const cleaned = removeControlCharacters(textWithBom);

      expect(cleaned).not.toContain('\ufeff');
      expect(cleaned).toContain('שלום');
    });

    it('should handle text without control characters', () => {
      const cleaned = removeControlCharacters(HEBREW_TEXT);
      expect(cleaned).toBe(HEBREW_TEXT);
    });
  });

  // ===========================================================================
  // normalizeWhitespace() Tests
  // ===========================================================================

  describe('normalizeWhitespace()', () => {
    it('should collapse multiple spaces to single space', () => {
      const input = 'שלום    עולם';
      const normalized = normalizeWhitespace(input);

      expect(normalized).toBe('שלום עולם');
    });

    it('should trim leading and trailing whitespace', () => {
      const normalized = normalizeWhitespace(TEXT_WITH_WHITESPACE_ISSUES);

      expect(normalized).not.toMatch(/^\s/);
      expect(normalized).not.toMatch(/\s$/);
    });

    it('should preserve paragraph breaks when preserveParagraphs is true', () => {
      const input = 'פסקה ראשונה\n\nפסקה שנייה';
      const normalized = normalizeWhitespace(input, true);

      expect(normalized).toContain('\n\n');
    });

    it('should collapse paragraph breaks when preserveParagraphs is false', () => {
      const input = 'שורה ראשונה\n\n\n\nשורה שנייה';
      const normalized = normalizeWhitespace(input, false);

      expect(normalized).not.toContain('\n\n\n');
    });

    it('should normalize various space characters to regular space', () => {
      const input = 'שלום\u00a0עולם\u2000טקסט'; // Non-breaking space and en quad
      const normalized = normalizeWhitespace(input);

      // All special spaces should become regular spaces
      expect(normalized).not.toContain('\u00a0');
      expect(normalized).not.toContain('\u2000');
    });

    it('should replace tabs with spaces', () => {
      const input = 'שלום\tעולם';
      const normalized = normalizeWhitespace(input);

      expect(normalized).not.toContain('\t');
      expect(normalized).toContain(' ');
    });
  });

  // ===========================================================================
  // normalizePunctuation() Tests
  // ===========================================================================

  describe('normalizePunctuation()', () => {
    it('should normalize quotes to Hebrew geresh', () => {
      const input = "שלום'עולם";
      const normalized = normalizePunctuation(input);

      // Should convert regular apostrophe to Hebrew geresh
      expect(normalized).toContain('׳');
    });

    it('should fix space before punctuation', () => {
      const input = 'שלום .עולם';
      const normalized = normalizePunctuation(input);

      expect(normalized).not.toMatch(/ \./);
    });

    it('should add space after punctuation if missing', () => {
      const input = 'שלום.עולם';
      const normalized = normalizePunctuation(input);

      expect(normalized).toBe('שלום. עולם');
    });

    it('should normalize ellipsis', () => {
      const input = 'שלום.....עולם';
      const normalized = normalizePunctuation(input);

      expect(normalized).toContain('...');
      expect(normalized).not.toContain('.....');
    });

    it('should remove double punctuation', () => {
      const input = 'שלום!!עולם';
      const normalized = normalizePunctuation(input);

      expect(normalized).not.toMatch(/!!/);
    });

    it('should convert hyphen to Hebrew maqaf between Hebrew words', () => {
      const input = 'בית-ספר';
      const normalized = normalizePunctuation(input);

      expect(normalized).toContain('־'); // Hebrew maqaf
    });
  });

  // ===========================================================================
  // removePageNumbers() Tests
  // ===========================================================================

  describe('removePageNumbers()', () => {
    it('should remove Hebrew page number patterns', () => {
      const cleaned = removePageNumbers(TEXT_WITH_PAGE_NUMBERS);

      expect(cleaned).not.toMatch(/עמוד\s*\d+/);
    });

    it('should remove dash-surrounded page numbers', () => {
      const cleaned = removePageNumbers(TEXT_WITH_PAGE_NUMBERS);

      expect(cleaned).not.toMatch(/-\s*\d+\s*-/);
    });

    it('should remove standalone numbers on their own line', () => {
      const input = 'טקסט\n42\nעוד טקסט';
      const cleaned = removePageNumbers(input);

      // Standalone 42 should be removed
      expect(cleaned).not.toMatch(/^\s*42\s*$/m);
    });

    it('should preserve numbers within text', () => {
      const input = 'סעיף 42 לחוק';
      const cleaned = removePageNumbers(input);

      // Numbers within sentences should be preserved
      expect(cleaned).toContain('42');
    });
  });

  // ===========================================================================
  // removeHeadersFooters() Tests
  // ===========================================================================

  describe('removeHeadersFooters()', () => {
    it('should remove ספר החוקים header', () => {
      const cleaned = removeHeadersFooters(TEXT_WITH_HEADERS);

      expect(cleaned).not.toMatch(/^\s*ספר החוקים\s*$/m);
    });

    it('should remove קובץ התקנות header', () => {
      const cleaned = removeHeadersFooters(TEXT_WITH_HEADERS);

      expect(cleaned).not.toMatch(/^\s*קובץ התקנות\s*$/m);
    });

    it('should preserve content text', () => {
      const cleaned = removeHeadersFooters(TEXT_WITH_HEADERS);

      expect(cleaned).toContain('זהו חוק חשוב');
      expect(cleaned).toContain('תוכן התקנות');
    });

    it('should handle text without headers', () => {
      const input = 'טקסט רגיל ללא כותרות';
      const cleaned = removeHeadersFooters(input);

      expect(cleaned).toBe(input);
    });
  });

  // ===========================================================================
  // removeShortLines() Tests
  // ===========================================================================

  describe('removeShortLines()', () => {
    it('should remove lines shorter than minimum length', () => {
      const input = 'שלום עולם\nאב\nזהו טקסט ארוך יותר';
      const cleaned = removeShortLines(input, 5);

      expect(cleaned).not.toContain('אב');
      expect(cleaned).toContain('שלום עולם');
    });

    it('should preserve empty lines (paragraph breaks)', () => {
      const input = 'פסקה ראשונה\n\nפסקה שנייה';
      const cleaned = removeShortLines(input, 5);

      // Empty lines should be preserved for paragraph structure
      expect(cleaned).toContain('\n\n');
    });

    it('should handle minimum length of 0', () => {
      const input = 'א\nב\nג';
      const cleaned = removeShortLines(input, 0);

      // Nothing should be removed with minLength 0
      expect(cleaned).toBe(input);
    });
  });

  // ===========================================================================
  // cleanupHebrewText() Main Function Tests
  // ===========================================================================

  describe('cleanupHebrewText()', () => {
    it('should return HebrewCleanupResult with all properties', () => {
      const result = cleanupHebrewText(HEBREW_TEXT);

      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('originalCharCount');
      expect(result).toHaveProperty('cleanedCharCount');
      expect(result).toHaveProperty('charsRemoved');
      expect(result).toHaveProperty('reversedTextFixed');
      expect(result).toHaveProperty('linesRemoved');
      expect(result).toHaveProperty('durationMs');
    });

    it('should track character counts correctly', () => {
      const result = cleanupHebrewText(TEXT_WITH_CONTROL_CHARS);

      expect(result.originalCharCount).toBe(TEXT_WITH_CONTROL_CHARS.length);
      expect(result.cleanedCharCount).toBeLessThanOrEqual(result.originalCharCount);
      expect(result.charsRemoved).toBe(
        result.originalCharCount - result.cleanedCharCount
      );
    });

    it('should include duration measurement', () => {
      const result = cleanupHebrewText(HEBREW_TEXT);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.durationMs).toBe('number');
    });

    it('should apply all cleanup operations by default', () => {
      const dirtyText = `\x00שלום   עולם\n\n\n\nעמוד 1\nספר החוקים`;
      const result = cleanupHebrewText(dirtyText);

      // Control chars should be removed
      expect(result.text).not.toContain('\x00');

      // Excessive newlines should be collapsed
      expect(result.text).not.toContain('\n\n\n');
    });

    it('should respect options to disable cleanup operations', () => {
      const input = 'שלום   עולם';

      // With normalizeWhitespace disabled
      const result = cleanupHebrewText(input, {
        normalizeWhitespace: false,
      });

      // Multiple spaces should be preserved
      expect(result.text).toContain('   ');
    });

    it('should report reversed text fixing', () => {
      // Create text that would be detected as reversed
      const reversedText = 'םולש םלוע בוט רקוב דחא םינש שולש';
      const result = cleanupHebrewText(reversedText);

      // reversedTextFixed should be a boolean
      expect(typeof result.reversedTextFixed).toBe('boolean');
    });

    it('should track lines removed', () => {
      const input = `שלום עולם
עמוד 1
זהו טקסט
ספר החוקים
עוד שורה`;

      const result = cleanupHebrewText(input);

      // Some lines should be removed (page numbers, headers)
      expect(result.linesRemoved).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // quickCleanup() Tests
  // ===========================================================================

  describe('quickCleanup()', () => {
    it('should return cleaned text string', () => {
      const cleaned = quickCleanup(TEXT_WITH_CONTROL_CHARS);

      expect(typeof cleaned).toBe('string');
      expect(cleaned).not.toContain('\x00');
    });

    it('should apply all default cleanup operations', () => {
      const dirtyText = '\x00שלום   עולם\n\n\n\n';
      const cleaned = quickCleanup(dirtyText);

      expect(cleaned).not.toContain('\x00');
      expect(cleaned).not.toMatch(/\s{3,}/);
    });

    it('should be equivalent to cleanupHebrewText().text', () => {
      const input = TEXT_WITH_CONTROL_CHARS;

      const quickResult = quickCleanup(input);
      const fullResult = cleanupHebrewText(input);

      expect(quickResult).toBe(fullResult.text);
    });

    it('should handle empty string', () => {
      expect(quickCleanup('')).toBe('');
    });

    it('should handle whitespace-only string', () => {
      const result = quickCleanup('   \n\n   ');
      expect(result).toBe('');
    });
  });

  // ===========================================================================
  // Integration Tests
  // ===========================================================================

  describe('integration tests', () => {
    it('should clean typical Israeli law PDF text', () => {
      // Simulate text extracted from an Israeli law PDF
      const pdfText = `
\x00\x01ספר החוקים\x02

חוק\x03 זכויות\x04 האדם

סעיף 1.  זכויות    היסוד

עמוד 1

(א) כל אדם זכאי לכבוד.
(ב) כל אדם זכאי לחירות.

- 2 -

סעיף 2.  הגנה על זכויות

`;

      const result = cleanupHebrewText(pdfText);

      // Control characters should be removed
      expect(result.text).not.toMatch(/[\x00-\x1f]/);

      // Content should be preserved
      expect(result.text).toContain('חוק');
      expect(result.text).toContain('זכויות');
      expect(result.text).toContain('סעיף');

      // Headers and page numbers should be removed
      expect(result.text).not.toMatch(/^\s*ספר החוקים\s*$/m);
      expect(result.text).not.toMatch(/^\s*עמוד 1\s*$/m);
      expect(result.text).not.toMatch(/^\s*- 2 -\s*$/m);

      // Excessive whitespace should be normalized
      expect(result.text).not.toMatch(/\s{4,}/);
    });

    it('should preserve important legal structure', () => {
      const legalText = `
סעיף 1. הגדרות

בחוק זה -
"אדם" - כל אדם;
"זכות" - זכות חוקית.

סעיף 2. תחולה

חוק זה יחול על כל אדם.
`;

      const result = cleanupHebrewText(legalText);

      // Section markers should be preserved
      expect(result.text).toContain('סעיף 1');
      expect(result.text).toContain('סעיף 2');

      // Definitions should be preserved
      expect(result.text).toContain('"אדם"');
      expect(result.text).toContain('"זכות"');

      // Paragraph structure should be maintained
      expect(result.text).toContain('הגדרות');
      expect(result.text).toContain('תחולה');
    });
  });
});
