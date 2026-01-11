/**
 * Unit Tests for Section Detection
 *
 * Tests the section detection functionality for Hebrew legal documents:
 * - parseHebrewNumber() - Hebrew letter number parsing
 * - normalizeSectionNumber() - Section number normalization
 * - detectSectionMarkers() - Section marker detection
 * - findContainingSection() - Section lookup
 * - buildSectionHierarchy() - Hierarchy construction
 * - parseIntoSections() - Document parsing into sections
 * - findBreakPoints() - Break point detection
 * - hasSectionMarkers() and countSectionsByType()
 */

import { describe, it, expect } from 'vitest';
import {
  parseHebrewNumber,
  normalizeSectionNumber,
  detectSectionMarkers,
  findContainingSection,
  buildSectionHierarchy,
  parseIntoSections,
  findBreakPoints,
  isAtSectionBoundary,
  getSectionTypeAtPosition,
  hasSectionMarkers,
  countSectionsByType,
  HebrewSectionType,
} from '../../lib/src/chunking/index.js';

// =============================================================================
// parseHebrewNumber() Tests
// =============================================================================

describe('parseHebrewNumber()', () => {
  describe('single letter numbers', () => {
    it('should parse single Hebrew letters 1-9', () => {
      expect(parseHebrewNumber('א')).toBe(1);
      expect(parseHebrewNumber('ב')).toBe(2);
      expect(parseHebrewNumber('ג')).toBe(3);
      expect(parseHebrewNumber('ד')).toBe(4);
      expect(parseHebrewNumber('ה')).toBe(5);
      expect(parseHebrewNumber('ו')).toBe(6);
      expect(parseHebrewNumber('ז')).toBe(7);
      expect(parseHebrewNumber('ח')).toBe(8);
      expect(parseHebrewNumber('ט')).toBe(9);
    });

    it('should parse tens (10-90)', () => {
      expect(parseHebrewNumber('י')).toBe(10);
      expect(parseHebrewNumber('כ')).toBe(20);
      expect(parseHebrewNumber('ל')).toBe(30);
      expect(parseHebrewNumber('מ')).toBe(40);
      expect(parseHebrewNumber('נ')).toBe(50);
      expect(parseHebrewNumber('ס')).toBe(60);
      expect(parseHebrewNumber('ע')).toBe(70);
      expect(parseHebrewNumber('פ')).toBe(80);
      expect(parseHebrewNumber('צ')).toBe(90);
    });

    it('should parse hundreds (100-400)', () => {
      expect(parseHebrewNumber('ק')).toBe(100);
      expect(parseHebrewNumber('ר')).toBe(200);
      expect(parseHebrewNumber('ש')).toBe(300);
      expect(parseHebrewNumber('ת')).toBe(400);
    });
  });

  describe('multi-letter numbers', () => {
    it('should parse compound numbers (11-19)', () => {
      expect(parseHebrewNumber('יא')).toBe(11);
      expect(parseHebrewNumber('יב')).toBe(12);
      expect(parseHebrewNumber('יג')).toBe(13);
      expect(parseHebrewNumber('יד')).toBe(14);
      // Note: 15 and 16 use special forms (טו, טז) in traditional numbering
      expect(parseHebrewNumber('יה')).toBe(15);
      expect(parseHebrewNumber('יו')).toBe(16);
      expect(parseHebrewNumber('יז')).toBe(17);
      expect(parseHebrewNumber('יח')).toBe(18);
      expect(parseHebrewNumber('יט')).toBe(19);
    });

    it('should parse compound numbers (20+)', () => {
      expect(parseHebrewNumber('כא')).toBe(21);
      expect(parseHebrewNumber('כב')).toBe(22);
      expect(parseHebrewNumber('לה')).toBe(35);
      expect(parseHebrewNumber('מב')).toBe(42);
    });

    it('should parse larger numbers', () => {
      expect(parseHebrewNumber('קא')).toBe(101);
      expect(parseHebrewNumber('קכג')).toBe(123);
      expect(parseHebrewNumber('רמח')).toBe(248);
      expect(parseHebrewNumber('תיג')).toBe(413);
    });
  });

  describe('final form letters', () => {
    it('should handle final forms (sofit)', () => {
      expect(parseHebrewNumber('ך')).toBe(20); // Final kaf
      expect(parseHebrewNumber('ם')).toBe(40); // Final mem
      expect(parseHebrewNumber('ן')).toBe(50); // Final nun
      expect(parseHebrewNumber('ף')).toBe(80); // Final pe
      expect(parseHebrewNumber('ץ')).toBe(90); // Final tsadi
    });
  });

  describe('with geresh/gershayim marks', () => {
    it('should strip geresh marks', () => {
      expect(parseHebrewNumber("א'")).toBe(1);
      expect(parseHebrewNumber('א׳')).toBe(1);
      expect(parseHebrewNumber("י'")).toBe(10);
    });

    it('should strip gershayim marks', () => {
      expect(parseHebrewNumber('יא"')).toBe(11);
      expect(parseHebrewNumber('יא״')).toBe(11);
    });
  });

  describe('Arabic numerals', () => {
    it('should parse Arabic numerals', () => {
      expect(parseHebrewNumber('1')).toBe(1);
      expect(parseHebrewNumber('10')).toBe(10);
      expect(parseHebrewNumber('123')).toBe(123);
      expect(parseHebrewNumber('9999')).toBe(9999);
    });
  });

  describe('edge cases', () => {
    it('should return null for empty input', () => {
      expect(parseHebrewNumber('')).toBeNull();
    });

    it('should return null for invalid characters', () => {
      expect(parseHebrewNumber('abc')).toBeNull();
      expect(parseHebrewNumber('xyz')).toBeNull();
    });

    it('should handle whitespace-only input', () => {
      // After stripping marks, if nothing left, should return null
      expect(parseHebrewNumber('  ')).toBeNull();
    });
  });
});

// =============================================================================
// normalizeSectionNumber() Tests
// =============================================================================

describe('normalizeSectionNumber()', () => {
  it('should trim whitespace', () => {
    expect(normalizeSectionNumber('  5  ')).toBe('5');
    expect(normalizeSectionNumber('\tא\n')).toBe('א');
  });

  it('should preserve the original format', () => {
    expect(normalizeSectionNumber('א')).toBe('א');
    expect(normalizeSectionNumber('1')).toBe('1');
    expect(normalizeSectionNumber('1.2.3')).toBe('1.2.3');
  });

  it('should return null for null or empty input', () => {
    expect(normalizeSectionNumber(null)).toBeNull();
    expect(normalizeSectionNumber('')).toBeNull();
    expect(normalizeSectionNumber('   ')).toBeNull();
  });
});

// =============================================================================
// detectSectionMarkers() Tests
// =============================================================================

describe('detectSectionMarkers()', () => {
  describe('basic section detection', () => {
    it('should detect סעיף (section) markers', () => {
      const text = 'סעיף 1 - הגדרות\nתוכן הסעיף';
      const markers = detectSectionMarkers(text);

      expect(markers.length).toBe(1);
      expect(markers[0].type).toBe(HebrewSectionType.SECTION);
      expect(markers[0].number).toBe('1');
    });

    it('should detect פרק (chapter) markers', () => {
      const text = 'פרק א - הוראות כלליות';
      const markers = detectSectionMarkers(text);

      expect(markers.length).toBe(1);
      expect(markers[0].type).toBe(HebrewSectionType.CHAPTER);
      expect(markers[0].number).toBe('א');
      expect(markers[0].title).toBe('הוראות כלליות');
    });

    it('should detect חלק (part) markers', () => {
      const text = 'חלק א - מבוא';
      const markers = detectSectionMarkers(text);

      expect(markers.length).toBe(1);
      expect(markers[0].type).toBe(HebrewSectionType.PART);
      expect(markers[0].number).toBe('א');
    });

    it('should detect סימן (sub-chapter) markers', () => {
      const text = 'סימן 1: סמכויות';
      const markers = detectSectionMarkers(text);

      expect(markers.length).toBe(1);
      expect(markers[0].type).toBe(HebrewSectionType.SUBCHAPTER);
      expect(markers[0].number).toBe('1');
    });

    it('should detect תוספת (schedule) markers', () => {
      const text = 'תוספת ראשונה - טפסים';
      const markers = detectSectionMarkers(text);

      expect(markers.length).toBe(1);
      expect(markers[0].type).toBe(HebrewSectionType.SCHEDULE);
    });
  });

  describe('multiple markers', () => {
    it('should detect multiple sections in order', () => {
      const text = `פרק א - כללי

סעיף 1 - הגדרות
הגדרות שונות

סעיף 2 - מטרות
מטרות החוק`;

      const markers = detectSectionMarkers(text);

      expect(markers.length).toBe(3);
      expect(markers[0].type).toBe(HebrewSectionType.CHAPTER);
      expect(markers[1].type).toBe(HebrewSectionType.SECTION);
      expect(markers[1].number).toBe('1');
      expect(markers[2].type).toBe(HebrewSectionType.SECTION);
      expect(markers[2].number).toBe('2');
    });

    it('should handle hierarchical structure', () => {
      const text = `חלק א - מבוא

פרק א - הגדרות

סעיף 1
תוכן

סעיף 2
תוכן

פרק ב - הוראות

סעיף 3
תוכן`;

      const markers = detectSectionMarkers(text);

      expect(markers.length).toBe(6);
      expect(markers[0].type).toBe(HebrewSectionType.PART);
      expect(markers[1].type).toBe(HebrewSectionType.CHAPTER);
      expect(markers[2].type).toBe(HebrewSectionType.SECTION);
      expect(markers[5].number).toBe('3');
    });
  });

  describe('special section types', () => {
    it('should detect הגדרות (definitions) section', () => {
      const text = 'הגדרות\nבחוק זה:';
      const markers = detectSectionMarkers(text);

      expect(markers.length).toBe(1);
      expect(markers[0].type).toBe(HebrewSectionType.DEFINITIONS);
    });

    it('should detect מבוא (preamble) section', () => {
      const text = 'מבוא\nהואיל וכו';
      const markers = detectSectionMarkers(text);

      expect(markers.length).toBe(1);
      expect(markers[0].type).toBe(HebrewSectionType.PREAMBLE);
    });

    it('should detect ביטול (repeal) section', () => {
      const text = 'ביטול\nחוק קודם בטל';
      const markers = detectSectionMarkers(text);

      expect(markers.length).toBe(1);
      expect(markers[0].type).toBe(HebrewSectionType.REPEAL);
    });

    it('should detect תחילה (commencement) section', () => {
      const text = 'תחילה\nחוק זה יחול מיום...';
      const markers = detectSectionMarkers(text);

      expect(markers.length).toBe(1);
      expect(markers[0].type).toBe(HebrewSectionType.COMMENCEMENT);
    });
  });

  describe('subsection detection', () => {
    it('should detect numbered subsections (א), (ב)', () => {
      const text = `סעיף 1
(א) תנאי ראשון
(ב) תנאי שני
(ג) תנאי שלישי`;

      const markers = detectSectionMarkers(text);

      // Should detect section + subsections
      const subsections = markers.filter((m) => m.type === HebrewSectionType.SUBSECTION);
      expect(subsections.length).toBe(3);
      expect(subsections[0].number).toBe('א');
      expect(subsections[1].number).toBe('ב');
      expect(subsections[2].number).toBe('ג');
    });

    it('should detect Arabic numbered subsections (1), (2)', () => {
      const text = `סעיף 5
(1) פריט ראשון
(2) פריט שני`;

      const markers = detectSectionMarkers(text);

      const subsections = markers.filter((m) => m.type === HebrewSectionType.SUBSECTION);
      expect(subsections.length).toBe(2);
      expect(subsections[0].number).toBe('1');
      expect(subsections[1].number).toBe('2');
    });
  });

  describe('position tracking', () => {
    it('should track accurate start and end positions', () => {
      const text = 'טקסט לפני\n\nסעיף 1\n\nטקסט אחרי';
      const markers = detectSectionMarkers(text);

      expect(markers.length).toBe(1);
      expect(markers[0].startPosition).toBe(text.indexOf('סעיף'));
      expect(markers[0].endPosition).toBeGreaterThan(markers[0].startPosition);
    });

    it('should sort markers by position', () => {
      const text = `סעיף 2
content
סעיף 1`;

      // Note: detection is position-based, not number-based
      const markers = detectSectionMarkers(text);

      for (let i = 1; i < markers.length; i++) {
        expect(markers[i].startPosition).toBeGreaterThan(markers[i - 1].startPosition);
      }
    });
  });

  describe('edge cases', () => {
    it('should return empty array for text with no sections', () => {
      const text = 'זהו טקסט רגיל ללא סעיפים או פרקים.';
      const markers = detectSectionMarkers(text);

      expect(markers).toEqual([]);
    });

    it('should handle empty text', () => {
      const markers = detectSectionMarkers('');
      expect(markers).toEqual([]);
    });
  });
});

// =============================================================================
// findContainingSection() Tests
// =============================================================================

describe('findContainingSection()', () => {
  it('should find the section containing a position', () => {
    const text = `פרק א - כללי

סעיף 1 - הגדרות
תוכן הסעיף

סעיף 2 - מטרות
מטרות החוק`;

    const markers = detectSectionMarkers(text);
    const section2Start = text.indexOf('סעיף 2');
    const inSection2 = section2Start + 30;

    const containing = findContainingSection(inSection2, markers);

    expect(containing).not.toBeNull();
    expect(containing?.type).toBe(HebrewSectionType.SECTION);
    expect(containing?.number).toBe('2');
  });

  it('should return the last section before position', () => {
    const text = `סעיף 1
content 1

סעיף 2
content 2`;

    const markers = detectSectionMarkers(text);
    const afterSection1 = text.indexOf('content 1') + 5;

    const containing = findContainingSection(afterSection1, markers);

    expect(containing?.number).toBe('1');
  });

  it('should return null for position before any section', () => {
    const text = `פתיחה

סעיף 1 - הגדרות`;

    const markers = detectSectionMarkers(text);
    const beforeSection = 2;

    const containing = findContainingSection(beforeSection, markers);

    expect(containing).toBeNull();
  });
});

// =============================================================================
// buildSectionHierarchy() Tests
// =============================================================================

describe('buildSectionHierarchy()', () => {
  it('should build correct hierarchy', () => {
    const text = `חלק א - מבוא

פרק א - הגדרות

סעיף 1
תוכן`;

    const markers = detectSectionMarkers(text);
    const inSection1 = text.indexOf('תוכן');

    const hierarchy = buildSectionHierarchy(inSection1, markers);

    expect(hierarchy.length).toBeGreaterThanOrEqual(1);
    // Hierarchy should be sorted by level
    for (let i = 1; i < hierarchy.length; i++) {
      expect(hierarchy[i].hierarchyLevel).toBeGreaterThanOrEqual(hierarchy[i - 1].hierarchyLevel);
    }
  });

  it('should clear lower levels when new parent appears', () => {
    const text = `פרק א - ראשון

סעיף 1
תוכן 1

פרק ב - שני

סעיף 2
תוכן 2`;

    const markers = detectSectionMarkers(text);
    const inSection2 = text.indexOf('תוכן 2');

    const hierarchy = buildSectionHierarchy(inSection2, markers);

    // Should have chapter ב, not chapter א
    const chapters = hierarchy.filter((m) => m.type === HebrewSectionType.CHAPTER);
    expect(chapters.length).toBe(1);
    expect(chapters[0].number).toBe('ב');
  });

  it('should return empty array for position before any section', () => {
    const text = 'טקסט לפני\n\nסעיף 1 - תוכן';
    const markers = detectSectionMarkers(text);

    const hierarchy = buildSectionHierarchy(0, markers);

    expect(hierarchy).toEqual([]);
  });
});

// =============================================================================
// parseIntoSections() Tests
// =============================================================================

describe('parseIntoSections()', () => {
  it('should parse document into sections with content', () => {
    const text = `סעיף 1 - הגדרות
תוכן סעיף ראשון

סעיף 2 - מטרות
תוכן סעיף שני`;

    const sections = parseIntoSections(text);

    expect(sections.length).toBe(2);
    expect(sections[0].marker?.number).toBe('1');
    expect(sections[0].content).toContain('תוכן סעיף ראשון');
    expect(sections[1].marker?.number).toBe('2');
    expect(sections[1].content).toContain('תוכן סעיף שני');
  });

  it('should include preamble content before first section', () => {
    const text = `הקדמה לחוק
מידע נוסף

סעיף 1 - הגדרות
תוכן`;

    const sections = parseIntoSections(text);

    expect(sections.length).toBe(2);
    expect(sections[0].marker).toBeNull();
    expect(sections[0].content).toContain('הקדמה לחוק');
    expect(sections[1].marker?.number).toBe('1');
  });

  it('should handle document with no sections', () => {
    const text = 'טקסט רגיל ללא סעיפים';
    const sections = parseIntoSections(text);

    expect(sections.length).toBe(1);
    expect(sections[0].marker).toBeNull();
    expect(sections[0].content).toBe(text);
  });

  it('should estimate token count for each section', () => {
    const text = `סעיף 1
${'א'.repeat(100)}`;

    const sections = parseIntoSections(text);

    expect(sections[0].estimatedTokens).toBeGreaterThan(0);
    expect(sections[0].charCount).toBeGreaterThan(0);
  });

  it('should track parent markers', () => {
    const text = `פרק א - כללי

סעיף 1
תוכן`;

    const sections = parseIntoSections(text);

    // Section with סעיף should have parent פרק
    const sectionWithParent = sections.find(
      (s) => s.marker?.type === HebrewSectionType.SECTION
    );
    expect(sectionWithParent?.parentMarkers.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// findBreakPoints() Tests
// =============================================================================

describe('findBreakPoints()', () => {
  it('should find section boundaries as break points', () => {
    const text = `סעיף 1
תוכן

סעיף 2
תוכן`;

    const markers = detectSectionMarkers(text);
    const breakPoints = findBreakPoints(text, markers);

    // Should have section breaks
    const sectionBreaks = breakPoints.filter((bp) => bp.type === 'section');
    expect(sectionBreaks.length).toBe(2);
  });

  it('should find paragraph breaks', () => {
    const text = `פסקה ראשונה.

פסקה שניה.

פסקה שלישית.`;

    const markers = detectSectionMarkers(text);
    const breakPoints = findBreakPoints(text, markers);

    const paragraphBreaks = breakPoints.filter((bp) => bp.type === 'paragraph');
    expect(paragraphBreaks.length).toBe(2);
  });

  it('should find sentence breaks', () => {
    const text = 'משפט ראשון. משפט שני. משפט שלישי.';

    const markers = detectSectionMarkers(text);
    const breakPoints = findBreakPoints(text, markers);

    const sentenceBreaks = breakPoints.filter((bp) => bp.type === 'sentence');
    expect(sentenceBreaks.length).toBeGreaterThan(0);
  });

  it('should prioritize section > paragraph > sentence', () => {
    const text = `סעיף 1
תוכן. עוד תוכן.

פסקה חדשה.`;

    const markers = detectSectionMarkers(text);
    const breakPoints = findBreakPoints(text, markers);

    const sections = breakPoints.filter((bp) => bp.type === 'section');
    const paragraphs = breakPoints.filter((bp) => bp.type === 'paragraph');
    const sentences = breakPoints.filter((bp) => bp.type === 'sentence');

    // Sections should have lowest (best) priority
    if (sections.length > 0) {
      expect(sections[0].priority).toBe(1);
    }
    if (paragraphs.length > 0) {
      expect(paragraphs[0].priority).toBe(2);
    }
    if (sentences.length > 0) {
      expect(sentences[0].priority).toBe(3);
    }
  });

  it('should sort break points by position', () => {
    const text = `סעיף 1
content. more content.

new paragraph

סעיף 2`;

    const markers = detectSectionMarkers(text);
    const breakPoints = findBreakPoints(text, markers);

    for (let i = 1; i < breakPoints.length; i++) {
      expect(breakPoints[i].position).toBeGreaterThanOrEqual(breakPoints[i - 1].position);
    }
  });
});

// =============================================================================
// isAtSectionBoundary() Tests
// =============================================================================

describe('isAtSectionBoundary()', () => {
  it('should return true at section start', () => {
    const text = 'סעיף 1 - הגדרות';
    const markers = detectSectionMarkers(text);

    expect(isAtSectionBoundary(0, markers)).toBe(true);
  });

  it('should return false in middle of section', () => {
    const text = 'סעיף 1 - הגדרות\nתוכן הסעיף';
    const markers = detectSectionMarkers(text);

    expect(isAtSectionBoundary(20, markers)).toBe(false);
  });

  it('should return false for empty markers', () => {
    expect(isAtSectionBoundary(0, [])).toBe(false);
  });
});

// =============================================================================
// getSectionTypeAtPosition() Tests
// =============================================================================

describe('getSectionTypeAtPosition()', () => {
  it('should return section type at position', () => {
    const text = `פרק א - כללי
תוכן הפרק

סעיף 1
תוכן הסעיף`;

    const markers = detectSectionMarkers(text);

    const inChapter = text.indexOf('תוכן הפרק');
    expect(getSectionTypeAtPosition(inChapter, markers)).toBe(HebrewSectionType.CHAPTER);

    const inSection = text.indexOf('תוכן הסעיף');
    expect(getSectionTypeAtPosition(inSection, markers)).toBe(HebrewSectionType.SECTION);
  });

  it('should return null for position before any section', () => {
    const text = 'הקדמה\n\nסעיף 1';
    const markers = detectSectionMarkers(text);

    expect(getSectionTypeAtPosition(0, markers)).toBeNull();
  });
});

// =============================================================================
// hasSectionMarkers() Tests
// =============================================================================

describe('hasSectionMarkers()', () => {
  it('should return true for text with sections', () => {
    expect(hasSectionMarkers('סעיף 1 - הגדרות')).toBe(true);
    expect(hasSectionMarkers('פרק א - כללי')).toBe(true);
    expect(hasSectionMarkers('חלק ראשון')).toBe(true);
  });

  it('should return false for text without sections', () => {
    expect(hasSectionMarkers('טקסט רגיל ללא סעיפים')).toBe(false);
    expect(hasSectionMarkers('מידע כללי על החוק')).toBe(false);
    expect(hasSectionMarkers('')).toBe(false);
  });
});

// =============================================================================
// countSectionsByType() Tests
// =============================================================================

describe('countSectionsByType()', () => {
  it('should count sections by type', () => {
    const text = `פרק א - ראשון

סעיף 1
תוכן

סעיף 2
תוכן

פרק ב - שני

סעיף 3
תוכן`;

    const counts = countSectionsByType(text);

    expect(counts.get(HebrewSectionType.CHAPTER)).toBe(2);
    expect(counts.get(HebrewSectionType.SECTION)).toBe(3);
  });

  it('should return empty map for text without sections', () => {
    const counts = countSectionsByType('טקסט רגיל');
    expect(counts.size).toBe(0);
  });

  it('should handle complex hierarchical structure', () => {
    const text = `חלק א

פרק א

סימן 1

סעיף 1
(א) תוכן
(ב) תוכן

סעיף 2

פרק ב

סעיף 3`;

    const counts = countSectionsByType(text);

    expect(counts.get(HebrewSectionType.PART)).toBe(1);
    expect(counts.get(HebrewSectionType.CHAPTER)).toBe(2);
    expect(counts.get(HebrewSectionType.SUBCHAPTER)).toBe(1);
    expect(counts.get(HebrewSectionType.SECTION)).toBe(3);
    expect(counts.get(HebrewSectionType.SUBSECTION)).toBe(2);
  });
});
