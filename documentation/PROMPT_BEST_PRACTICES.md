# Prompt Engineering Best Practices

This document provides comprehensive guidance for writing effective prompts for the Israeli Law RAG Chatbot. Following these best practices ensures high-quality, accurate Hebrew legal responses.

## Table of Contents

- [Overview](#overview)
- [Core Principles](#core-principles)
- [System Prompt Design](#system-prompt-design)
- [User Prompt Templates](#user-prompt-templates)
- [Context Injection](#context-injection)
- [Hebrew Language Considerations](#hebrew-language-considerations)
- [Hallucination Prevention](#hallucination-prevention)
- [Citation and Source Formatting](#citation-and-source-formatting)
- [Response Format Guidelines](#response-format-guidelines)
- [Token Optimization](#token-optimization)
- [A/B Testing Prompts](#ab-testing-prompts)
- [Common Anti-Patterns](#common-anti-patterns)
- [Prompt Templates Library](#prompt-templates-library)
- [Troubleshooting](#troubleshooting)

---

## Overview

Effective prompt engineering is critical for the Israeli Law RAG Chatbot's success. Well-designed prompts ensure:

| Goal | Impact |
|------|--------|
| **Accurate responses** | Users receive reliable legal information |
| **Proper citations** | Sources are traceable and verifiable |
| **Consistent formatting** | Professional, readable Hebrew output |
| **Minimal hallucination** | LLM stays grounded in provided context |
| **Cost efficiency** | Optimized token usage reduces API costs |

This guide covers best practices for the three key prompt components:
1. **System Prompt** - Establishes the AI persona and rules
2. **User Prompt Template** - Structures user queries with context
3. **Context Injection** - Embeds retrieved law chunks

---

## Core Principles

### The CLEAR Framework

Follow the CLEAR framework when designing prompts:

| Principle | Description | Example |
|-----------|-------------|---------|
| **C**ontext | Provide relevant background | Include law source, date, topic |
| **L**anguage | Specify output language and style | "Respond in formal Hebrew (עברית משפטית)" |
| **E**xplicit | Be specific about requirements | "Include section numbers in citations" |
| **A**ccuracy | Emphasize truthfulness | "Only cite information from provided context" |
| **R**estrictions | Define boundaries | "Do not speculate beyond the law text" |

### Golden Rules

1. **Context First** - Always provide retrieved chunks before the question
2. **One Task at a Time** - Avoid combining multiple requests in one prompt
3. **Show, Don't Tell** - Include examples in the system prompt
4. **Fail Gracefully** - Instruct the model what to do when uncertain
5. **Less is More** - Remove unnecessary instructions that don't improve output

---

## System Prompt Design

### Recommended Structure

The system prompt should follow this structure:

```
1. Identity/Persona (1-2 sentences)
2. Core Capabilities (2-3 bullet points)
3. Language Requirements (specific to Hebrew)
4. Citation Rules (explicit formatting)
5. Restrictions and Boundaries
6. Response Format Guidelines
7. Examples (if space permits)
```

### Recommended System Prompt

```hebrew
אתה מומחה למשפט ישראלי המסייע למשתמשים להבין חוקים ותקנות בישראל.

תפקידך:
- לענות על שאלות משפטיות בהתבסס אך ורק על המקורות המסופקים
- לצטט בדיוק את החוקים והסעיפים הרלוונטיים
- להסביר מושגים משפטיים בשפה נגישה אך מדויקת

הנחיות שפה:
- כתוב תמיד בעברית תקנית ברמה משפטית
- השתמש בניסוח פורמלי ומקצועי
- הימנע מסלנג או שפה לא רשמית

ציטוטים ומקורות:
- ציין תמיד את שם החוק המלא, מספר הסעיף ותאריך הפרסום
- פורמט: "חוק [שם החוק], התש"[X]-[שנה], סעיף [מספר]"
- אם מידע חסר במקורות, ציין זאת במפורש

הגבלות חשובות:
- אל תמציא מידע או תספק מידע שאינו מופיע במקורות
- אל תיתן ייעוץ משפטי אישי - הפנה לעורך דין
- אם אינך בטוח, אמור "אין לי מידע מספיק כדי לענות על שאלה זו"

פורמט תשובה:
- פתח בתשובה ישירה לשאלה
- פרט את ההסבר המשפטי עם ציטוטים
- סיים ברשימת המקורות
```

### Persona Guidelines

| Aspect | Recommended | Avoid |
|--------|-------------|-------|
| **Tone** | Professional, helpful | Overly casual, condescending |
| **Authority** | Expert assistant | Judge, lawyer giving advice |
| **Confidence** | Measured, qualified | Absolute statements |
| **Language** | Formal Hebrew | Mixed languages, slang |

### System Prompt Anti-Patterns

```typescript
// BAD: Too vague
const badSystemPrompt = "You are a legal assistant. Help users.";

// BAD: Too verbose
const badSystemPrompt2 = `
  You are an incredibly talented and knowledgeable legal expert who has
  studied at the finest universities and has decades of experience in
  Israeli law. You always provide amazingly detailed responses...
  [continues for 2000+ tokens]
`;

// BAD: Conflicting instructions
const badSystemPrompt3 = `
  Be concise but provide comprehensive explanations.
  Only use provided context but feel free to add relevant information.
`;
```

---

## User Prompt Templates

### Standard Query Template

```typescript
const standardQueryTemplate = `
מקורות משפטיים רלוונטיים:
---
{CONTEXT}
---

שאלת המשתמש:
{QUERY}

הוראות:
1. ענה על השאלה בהתבסס על המקורות לעיל
2. ציין את הסעיפים הרלוונטיים
3. אם המידע לא מספיק, ציין זאת
`;
```

### Conversational Follow-up Template

```typescript
const followUpTemplate = `
מקורות משפטיים רלוונטיים:
---
{CONTEXT}
---

היסטוריית השיחה:
{CONVERSATION_HISTORY}

שאלת המשתמש הנוכחית:
{QUERY}

הוראות:
1. ענה בהקשר לשיחה הקודמת
2. התייחס רק למידע מהמקורות החדשים
3. אם השאלה מחוץ להקשר, בקש הבהרה
`;
```

### Complex Analysis Template

```typescript
const analysisTemplate = `
מקורות משפטיים רלוונטיים:
---
{CONTEXT}
---

בקשה לניתוח:
{QUERY}

מבנה התשובה המבוקש:
1. סיכום (2-3 משפטים)
2. ניתוח משפטי מפורט
3. סעיפים רלוונטיים
4. מסקנות
5. מקורות
`;
```

### Template Best Practices

| Practice | Rationale |
|----------|-----------|
| Use consistent delimiters (`---`) | Clearly separates sections |
| Place context before query | LLM processes sequentially |
| Number instructions | Improves compliance |
| Use Hebrew section headers | Consistency with output |
| Keep instructions minimal | Reduces confusion |

---

## Context Injection

### Chunk Formatting

Retrieved law chunks should be formatted consistently:

```typescript
const formatChunk = (chunk: LawChunk): string => {
  return `
[מקור ${chunk.index}]
חוק: ${chunk.lawName}
סעיף: ${chunk.sectionNumber || 'לא זמין'}
תאריך פרסום: ${chunk.publicationDate}
---
${chunk.content}
---
`;
};
```

### Context Ordering

Order retrieved chunks by relevance:

```typescript
// Sort by relevance score (highest first)
const orderedChunks = chunks.sort((a, b) => b.score - a.score);

// Include top N chunks (typically 3-5)
const contextChunks = orderedChunks.slice(0, 5);
```

### Context Size Guidelines

| Max Tokens | Model | Recommendation |
|------------|-------|----------------|
| 4,096 | Claude Haiku | 2-3 chunks |
| 8,192 | Sonnet | 4-5 chunks |
| 200,000 | Sonnet (extended) | 10+ chunks |

### Deduplication

Remove overlapping chunks:

```typescript
const deduplicateChunks = (chunks: LawChunk[]): LawChunk[] => {
  const seen = new Set<string>();
  return chunks.filter(chunk => {
    const key = `${chunk.lawId}-${chunk.sectionNumber}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
```

---

## Hebrew Language Considerations

### RTL Text Handling

Always ensure proper RTL formatting:

```typescript
// Good: Pure Hebrew text
const prompt = `ענה על השאלה הבאה בעברית.`;

// Good: Mixed content with clear separation
const prompt2 = `
שאלה: מהו ה-GDPR?
הוראות: הסבר בעברית כיצד הוא משתלב עם חוק הגנת הפרטיות.
`;

// Bad: Inline mixing without structure
const badPrompt = `Explain theתקנות in Hebrew using proper formatting.`;
```

### Hebrew Date Formatting

Use Hebrew calendar years (התש"פ format):

```typescript
// Good
const citation = `חוק יסוד: כבוד האדם וחירותו, התשנ"ב-1992`;

// Bad
const badCitation = `Basic Law: Human Dignity and Liberty, 1992`;
```

### Legal Terminology

Use proper Hebrew legal terms:

| English | Hebrew | Usage |
|---------|--------|-------|
| Law/Statute | חוק | Primary legislation |
| Regulation | תקנות | Secondary legislation |
| Section | סעיף | Law section |
| Amendment | תיקון | Law amendment |
| Provision | הוראה | Specific provision |
| Court ruling | פסיקה | Case law |
| Cause of action | עילת תביעה | Legal cause |

### Grammar Considerations

- **Gender Agreement**: Ensure consistent grammatical gender
- **Verb Conjugation**: Use formal register (בינוני present) for instructions
- **Construct State (סמיכות)**: Use properly in legal phrases

```typescript
// Good: Proper סמיכות
const term = `חוק הגנת הפרטיות`; // הגנת not הגנה

// Good: Formal instruction
const instruction = `ציין את המקורות`; // Imperative, masculine singular

// Bad: Colloquial
const badInstruction = `תציין לי את המקורות`; // Too casual
```

---

## Hallucination Prevention

### Primary Strategies

1. **Explicit Grounding Instructions**

```typescript
const groundingPrompt = `
ענה אך ורק על בסיס המידע המופיע במקורות לעיל.
אם המידע אינו מופיע במקורות - ציין במפורש: "מידע זה אינו מופיע במקורות שסופקו."
`;
```

2. **Temperature Settings**

| Use Case | Recommended Temperature |
|----------|------------------------|
| Legal citations | 0.0 - 0.2 |
| Explanations | 0.2 - 0.4 |
| Summaries | 0.3 - 0.5 |

3. **Citation Requirements**

```typescript
const citationRequirement = `
לכל טענה משפטית, ציין את המקור בפורמט:
[מקור X, סעיף Y]

אם אין מקור תומך - אל תכלול את הטענה.
`;
```

4. **Uncertainty Acknowledgment**

```typescript
const uncertaintyPrompt = `
אם אינך בטוח או שהמידע חלקי:
- ציין: "בהתבסס על המקורות הזמינים..."
- הימנע מהשערות
- הפנה לעיון נוסף כשנדרש
`;
```

### Anti-Hallucination Checklist

- [ ] Context contains the answer (or explicitly doesn't)
- [ ] Temperature set to 0.3 or lower
- [ ] System prompt includes grounding instructions
- [ ] Citation format is specified
- [ ] Uncertainty handling is defined
- [ ] No leading questions in the query

---

## Citation and Source Formatting

### Standard Citation Format

```
חוק [שם החוק], התש"[אות]-[שנה לועזית], סעיף [מספר]
```

**Examples:**
```
חוק יסוד: כבוד האדם וחירותו, התשנ"ב-1992, סעיף 1
חוק החוזים (תרופות בשל הפרת חוזה), התשל"א-1970, סעיף 7
תקנות התעבורה, התשכ"א-1961, תקנה 22
```

### Citation Instruction in Prompts

```typescript
const citationInstructions = `
פורמט ציטוטים:
- חוקים: "חוק [שם], התש"[X]-[שנה], סעיף [מספר]"
- תקנות: "תקנות [שם], התש"[X]-[שנה], תקנה [מספר]"
- פסיקה: "[שם המשפט], [מספר תיק], [שנה]"

ציין את כל המקורות בסוף התשובה תחת כותרת "מקורות:"
`;
```

### Source Linking

When sources have URLs, include them:

```typescript
const sourceWithLink = `
מקורות:
1. חוק הגנת הפרטיות, התשמ"א-1981, סעיף 2
   [קישור לנוסח המלא](pdf_url_here)
`;
```

---

## Response Format Guidelines

### Recommended Response Structure

```
1. תשובה ישירה (1-2 משפטים)
2. הסבר מפורט
3. ציטוטים מהחוק
4. מקורות
```

### Format Instructions Template

```typescript
const formatInstructions = `
מבנה התשובה:

📋 תשובה קצרה
[תשובה ישירה ב-1-2 משפטים]

📖 הסבר מפורט
[ניתוח משפטי של הנושא]

⚖️ מקורות משפטיים
• [ציטוט מסעיף רלוונטי]
• [ציטוט נוסף אם רלוונטי]

📚 מקורות
1. [חוק/סעיף/תאריך]
`;
```

### Response Length Guidelines

| Query Type | Recommended Length |
|------------|-------------------|
| Simple factual | 100-200 words |
| Explanation | 200-400 words |
| Detailed analysis | 400-800 words |
| Comparison | 300-600 words |

---

## Token Optimization

### Token Counting

Use the token counter to optimize prompts:

```typescript
import { countTokens, estimateTokens } from '@israeli-law-rag/lib';

// Accurate counting (with tokenizer)
const exactCount = await countTokens(prompt);

// Fast estimation (no tokenizer)
const estimate = estimateTokens(prompt);
```

### Optimization Strategies

1. **Remove Redundant Instructions**

```typescript
// Before (redundant)
const prompt = `
Respond in Hebrew.
Make sure to use Hebrew language.
Your response should be in Hebrew.
`;

// After (concise)
const prompt = `ענה בעברית.`;
```

2. **Compress Context**

```typescript
// Include only essential chunk information
const compressedContext = chunks.map(c => ({
  law: c.lawName,
  section: c.sectionNumber,
  text: c.content.slice(0, 500) // Truncate if very long
}));
```

3. **Use Abbreviations in Instructions**

```typescript
// Verbose
const verbose = `When citing sources, please include the full law name, section number, and publication date.`;

// Concise
const concise = `ציטוט: חוק + סעיף + תאריך`;
```

### Token Budget Allocation

| Component | Recommended % |
|-----------|---------------|
| System Prompt | 10-15% |
| Context (Chunks) | 50-60% |
| User Query | 5-10% |
| Response Buffer | 25-30% |

---

## A/B Testing Prompts

### Testing Framework

Create prompt variants for comparison:

```typescript
interface PromptVariant {
  id: string;
  name: string;
  systemPrompt: string;
  userTemplate: string;
  weight: number; // Traffic percentage
}

const variants: PromptVariant[] = [
  {
    id: 'control',
    name: 'Current Production',
    systemPrompt: CURRENT_SYSTEM_PROMPT,
    userTemplate: CURRENT_USER_TEMPLATE,
    weight: 50,
  },
  {
    id: 'variant_a',
    name: 'Concise Instructions',
    systemPrompt: CONCISE_SYSTEM_PROMPT,
    userTemplate: CURRENT_USER_TEMPLATE,
    weight: 25,
  },
  {
    id: 'variant_b',
    name: 'Structured Output',
    systemPrompt: CURRENT_SYSTEM_PROMPT,
    userTemplate: STRUCTURED_USER_TEMPLATE,
    weight: 25,
  },
];
```

### Metrics to Track

| Metric | Measurement |
|--------|-------------|
| **Accuracy** | Human evaluation of correctness |
| **Citation Rate** | % of responses with proper citations |
| **Hallucination Rate** | % of responses with unfounded claims |
| **Response Length** | Token count of responses |
| **Latency** | Time to first token, total time |
| **User Satisfaction** | Thumbs up/down, ratings |
| **Cost** | Tokens used per query |

### Sample Test Queries

Use consistent test queries for comparison:

```typescript
const testQueries = [
  // Simple factual
  `מהו גיל הבגרות על פי החוק הישראלי?`,

  // Complex analysis
  `הסבר את ההבדל בין חוזה בעל-פה לחוזה בכתב בדיני החוזים הישראליים.`,

  // Citation-heavy
  `מהן זכויות היסוד המעוגנות בחוק יסוד: כבוד האדם וחירותו?`,

  // Edge case (no direct answer)
  `מה דין חוזה שנחתם תחת איום?`,

  // Mixed language term
  `כיצד מתייחס החוק הישראלי ל-GDPR?`,
];
```

### Statistical Significance

Ensure sufficient sample size before drawing conclusions:

| Metric | Minimum Samples |
|--------|-----------------|
| Accuracy | 100+ per variant |
| Citation Rate | 50+ per variant |
| Latency | 200+ per variant |
| User Satisfaction | 50+ per variant |

---

## Common Anti-Patterns

### 1. Over-Prompting

**Problem**: Excessive instructions confuse the model.

```typescript
// BAD: Too many instructions
const badPrompt = `
ענה בעברית. היה מדויק. היה מקצועי. היה ידידותי אך לא יותר מדי.
השתמש בפורמט מסודר. אל תשכח לצטט. הוסף מקורות. אל תמציא מידע.
היה תמציתי אך מפורט. השתמש בכותרות אבל לא יותר מדי. אל תשתמש באימוג'ים
אלא אם הם רלוונטיים. זכור להיות מועיל.
`;

// GOOD: Focused instructions
const goodPrompt = `
ענה בעברית משפטית. ציין מקורות בפורמט: [חוק, סעיף, תאריך].
`;
```

### 2. Conflicting Instructions

**Problem**: Contradictory requirements.

```typescript
// BAD: Conflicting
const conflicting = `
Be concise. Also, be comprehensive and detailed.
`;

// GOOD: Clear priority
const clear = `
Be concise. Provide essential details only.
`;
```

### 3. Missing Grounding

**Problem**: Not instructing the model to use provided context.

```typescript
// BAD: No grounding
const ungrounded = `
Answer the legal question.
`;

// GOOD: Explicit grounding
const grounded = `
Answer using ONLY the provided sources. If the answer is not in the sources, say so.
`;
```

### 4. Vague Output Format

**Problem**: Inconsistent response structure.

```typescript
// BAD: No format guidance
const vague = `
Answer the question.
`;

// GOOD: Explicit structure
const structured = `
Answer in this format:
1. Direct answer (1-2 sentences)
2. Legal explanation
3. Sources cited
`;
```

### 5. Placeholder Syndrome

**Problem**: Including placeholder text that might appear in output.

```typescript
// BAD: Placeholders might leak
const withPlaceholders = `
Law name: [INSERT LAW NAME HERE]
Section: [SECTION NUMBER]
`;

// GOOD: Clear variable markers
const clean = `
Law: {lawName}
Section: {sectionNumber}
`;
```

---

## Prompt Templates Library

### Quick Reference Templates

#### 1. Simple Legal Question

```typescript
export const SIMPLE_LEGAL_TEMPLATE = `
מקורות:
---
{CONTEXT}
---

שאלה: {QUERY}

ענה בקצרה על בסיס המקורות. ציין סעיפים רלוונטיים.
`;
```

#### 2. Detailed Legal Analysis

```typescript
export const DETAILED_ANALYSIS_TEMPLATE = `
מקורות משפטיים:
---
{CONTEXT}
---

נושא לניתוח: {QUERY}

הוראות:
1. פתח בסיכום קצר (2-3 משפטים)
2. נתח את ההיבטים המשפטיים
3. ציין את הסעיפים הרלוונטיים בפורמט: [חוק X, סעיף Y]
4. סיים במסקנות
5. רשום את כל המקורות

אם מידע חסר, ציין זאת במפורש.
`;
```

#### 3. Law Comparison

```typescript
export const COMPARISON_TEMPLATE = `
מקורות להשוואה:
---
{CONTEXT}
---

בקשה: {QUERY}

השווה בין החוקים/הסעיפים לפי:
1. מטרת החקיקה
2. תחולה
3. הבדלים עיקריים
4. נקודות דמיון

השתמש בטבלה אם מתאים.
`;
```

#### 4. Definition/Explanation

```typescript
export const DEFINITION_TEMPLATE = `
מקורות:
---
{CONTEXT}
---

מונח להסבר: {QUERY}

הסבר את המונח:
1. הגדרה משפטית (מהמקורות)
2. הקשר מעשי
3. דוגמאות (אם זמינות במקורות)
`;
```

#### 5. "I Don't Know" Fallback

```typescript
export const NO_INFORMATION_TEMPLATE = `
מצטער, לא מצאתי מידע מספיק במקורות הזמינים כדי לענות על שאלתך לגבי "{QUERY}".

אפשרויות:
1. נסה לנסח את השאלה אחרת
2. בדוק את הנושא באתר משרד המשפטים
3. פנה לעורך דין לייעוץ מקצועי

זכור: מערכת זו אינה מהווה ייעוץ משפטי.
`;
```

---

## Troubleshooting

### Common Issues and Solutions

#### Issue: Responses in Wrong Language

**Symptom**: Model responds in English or mixed languages.

**Solutions**:
1. Add explicit language instruction in system prompt
2. Use Hebrew section headers in template
3. Reduce temperature (more deterministic)

```typescript
// Add to system prompt
const fix = `השפה: עברית בלבד. אל תשתמש באנגלית.`;
```

#### Issue: Missing Citations

**Symptom**: Responses don't include source citations.

**Solutions**:
1. Add explicit citation format in system prompt
2. Include examples of proper citations
3. Make citations mandatory ("Every claim must have a citation")

```typescript
// Add to system prompt
const fix = `
חובה: כל טענה משפטית חייבת לכלול ציטוט בפורמט:
[מקור: חוק X, סעיף Y, התש"Z]
`;
```

#### Issue: Hallucinated Information

**Symptom**: Model invents laws, sections, or dates.

**Solutions**:
1. Lower temperature to 0.1-0.2
2. Strengthen grounding instructions
3. Add "If not in sources, say so" instruction
4. Review context quality (maybe bad retrieval)

```typescript
// Add to system prompt
const fix = `
אזהרה קריטית: אל תמציא מידע.
- אם סעיף אינו מופיע במקורות - אל תציין אותו
- אם לא ידוע - אמור "לא נמצא במקורות שסופקו"
`;
```

#### Issue: Overly Long Responses

**Symptom**: Responses are unnecessarily verbose.

**Solutions**:
1. Set explicit length limits
2. Use structured format with clear sections
3. Add "Be concise" instruction

```typescript
// Add to system prompt
const fix = `אורך תשובה: 150-300 מילים. תמציתי ולעניין.`;
```

#### Issue: Poor RTL Formatting

**Symptom**: Mixed directionality, broken layout.

**Solutions**:
1. Avoid inline language mixing
2. Use clear section separators
3. Test with RTL display

```typescript
// Good: Separate sections
const format = `
## תשובה
[תוכן בעברית]

## מקורות (Sources)
1. [ציטוט]
`;
```

---

## Checklist Before Production

### Prompt Review Checklist

- [ ] System prompt is under 500 tokens
- [ ] Language explicitly set to Hebrew
- [ ] Citation format clearly specified
- [ ] Grounding instructions present
- [ ] Uncertainty handling defined
- [ ] Response format specified
- [ ] No conflicting instructions
- [ ] Temperature set appropriately (0.2-0.4)
- [ ] Tested with 10+ diverse queries
- [ ] Edge cases handled (no context, unclear query)

### Quality Assurance

- [ ] Responses are in proper Hebrew
- [ ] Citations follow specified format
- [ ] No hallucinated information detected
- [ ] Response length appropriate
- [ ] RTL formatting correct
- [ ] Token usage optimized

---

## References

- [LLM Provider Considerations](./LLM_PROVIDER_CONSIDERATIONS.md) - Provider-specific prompt adjustments
- [Anthropic Prompt Engineering Guide](https://docs.anthropic.com/claude/docs/prompt-engineering)
- [Hebrew NLP Resources](https://github.com/NLPH/NLPH) - Hebrew language processing guidelines

---

*Last updated: January 2025*
*Project: Israeli Law RAG Chatbot*
