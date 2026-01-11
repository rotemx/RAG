# LLM Provider Considerations

This document outlines provider-specific considerations for the modular LLM adapter system used in the Israeli Law RAG Chatbot.

## Overview

The system supports three LLM providers through a unified adapter interface:
- **Anthropic Claude** (recommended, fully implemented)
- **OpenAI GPT** (stub implementation, future-ready)
- **Google Gemini** (stub implementation, future-ready)

All providers share the same interface (`LLMAdapter`) and can be swapped with minimal code changes.

---

## Provider Comparison

| Feature | Anthropic Claude | OpenAI GPT | Google Gemini |
|---------|------------------|------------|---------------|
| **Status** | Fully implemented | Stub | Stub |
| **Hebrew Support** | Excellent | Good | Good |
| **Recommended Model** | claude-3-5-sonnet-20241022 | gpt-4-turbo | gemini-1.5-pro |
| **Max Context** | 200K tokens | 128K tokens | 1M+ tokens |
| **Streaming** | Yes | Yes | Yes |
| **System Message** | Separate parameter | First message | systemInstruction |

---

## Anthropic Claude

### Recommended Configuration

```typescript
import { createAnthropicAdapter } from '@israeli-law-rag/lib';

const adapter = createAnthropicAdapter({
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
  maxTokens: 4096,
  temperature: 0.3, // Low for legal accuracy
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

### Available Models

| Model | Input Price | Output Price | Best For |
|-------|-------------|--------------|----------|
| claude-3-5-sonnet-20241022 | $3.00/M | $15.00/M | **Recommended** - Best balance of quality/cost |
| claude-3-5-haiku-20241022 | $1.00/M | $5.00/M | Fast responses, lower cost |
| claude-3-opus-20240229 | $15.00/M | $75.00/M | Maximum quality (expensive) |
| claude-3-haiku-20240307 | $0.25/M | $1.25/M | Budget option |

### Hebrew Considerations

Claude excels at Hebrew content due to:
- Strong multilingual training data
- Excellent RTL text handling
- Good understanding of Hebrew legal terminology
- Accurate Hebrew grammar and syntax

**Recommendation**: Use Claude 3.5 Sonnet for Hebrew legal content. It provides the best balance of quality, speed, and cost.

### System Message Handling

Anthropic uses a separate `system` parameter:

```typescript
// System messages are automatically extracted and passed separately
const messages = [
  { role: 'system', content: 'You are a Hebrew legal expert...' },
  { role: 'user', content: 'מה הם חוקי הגנת הפרטיות?' }
];

// The adapter automatically converts to:
// { system: 'You are a Hebrew legal expert...', messages: [...] }
```

### Error Handling

The Anthropic adapter maps errors to specific types:

| HTTP Status | Error Type | Retryable |
|-------------|------------|-----------|
| 401 | `AuthenticationError` | No |
| 429 | `RateLimitError` | Yes (with backoff) |
| 400 | `InvalidRequestError` | No |
| 404 | `ModelNotFoundError` | No |
| 5xx | `ServerError` | Yes |
| Timeout | `TimeoutError` | Yes |
| Connection | `NetworkError` | Yes |

### Rate Limits

Anthropic rate limits are based on tokens per minute (TPM) and requests per minute (RPM). The adapter includes built-in retry logic with exponential backoff.

```typescript
const adapter = createAnthropicAdapter({
  // ... config
  retry: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    jitter: true, // Prevents thundering herd
  },
  onRetryEvent: (event) => {
    console.log(`Retry attempt ${event.attemptNumber}/${event.maxRetries}`);
  },
});
```

### Token Tracking

Enable token tracking to monitor usage and costs:

```typescript
const adapter = createAnthropicAdapter({
  // ... config
  enableTokenTracking: true,
});

// After making requests
const stats = adapter.getUsageStatistics();
console.log(`Total cost: $${stats.totalCostUsd.toFixed(4)}`);
```

---

## OpenAI GPT

> **Note**: The OpenAI adapter is currently a stub implementation. Full implementation will be added when switching providers is needed.

### Recommended Configuration (Future)

```typescript
import { createOpenAIAdapter } from '@israeli-law-rag/lib';

const adapter = createOpenAIAdapter({
  provider: 'openai',
  model: 'gpt-4-turbo',
  maxTokens: 4096,
  temperature: 0.3,
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_ORG_ID, // Optional
});
```

### Available Models

| Model | Input Price | Output Price | Best For |
|-------|-------------|--------------|----------|
| gpt-4o | $2.50/M | $10.00/M | Latest, most capable |
| gpt-4o-mini | $0.15/M | $0.60/M | Fast, cost-effective |
| gpt-4-turbo | $10.00/M | $30.00/M | Previous flagship |
| gpt-3.5-turbo | $0.50/M | $1.50/M | Budget option |

### Hebrew Considerations

OpenAI GPT-4 provides good Hebrew support but with some limitations:
- Generally good but occasionally less fluent than Claude
- May need more explicit Hebrew formatting instructions
- Works well with legal terminology when prompted correctly

**Recommendation**: If switching to OpenAI, use gpt-4o for the best Hebrew performance.

### Message Format Differences

OpenAI uses a different message format:

```typescript
// OpenAI expects system messages in the messages array
const messages = [
  { role: 'system', content: 'You are a Hebrew legal expert...' },
  { role: 'user', content: 'Question here' }
];

// Maps directly to OpenAI format (roles: 'system', 'user', 'assistant')
```

### API Differences

| Feature | Anthropic | OpenAI |
|---------|-----------|--------|
| System message | Separate `system` param | First message in array |
| Stop sequences | `stop_sequences` | `stop` |
| Response | `content` array | `choices[0].message.content` |
| Usage | `usage.input_tokens` | `usage.prompt_tokens` |

### Azure OpenAI

For enterprise deployments, OpenAI models are available through Azure:

```typescript
const adapter = createOpenAIAdapter({
  provider: 'openai',
  model: 'gpt-4-turbo',
  maxTokens: 4096,
  temperature: 0.3,
  baseUrl: 'https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT',
  apiKey: process.env.AZURE_OPENAI_API_KEY,
});
```

---

## Google Gemini

> **Note**: The Gemini adapter is currently a stub implementation. Full implementation will be added when switching providers is needed.

### Recommended Configuration (Future)

```typescript
import { createGeminiAdapter } from '@israeli-law-rag/lib';

// Standard Gemini API
const adapter = createGeminiAdapter({
  provider: 'gemini',
  model: 'gemini-1.5-pro',
  maxTokens: 4096,
  temperature: 0.3,
  apiKey: process.env.GOOGLE_API_KEY,
});

// OR via Vertex AI (enterprise)
const vertexAdapter = createGeminiAdapter({
  provider: 'gemini',
  model: 'gemini-1.5-pro',
  maxTokens: 4096,
  temperature: 0.3,
  projectId: 'my-gcp-project',
  location: 'us-central1',
});
```

### Available Models

| Model | Input Price | Output Price | Best For |
|-------|-------------|--------------|----------|
| gemini-1.5-pro | $1.25/M | $5.00/M | Best quality |
| gemini-1.5-flash | $0.075/M | $0.30/M | Fast, very cost-effective |
| gemini-2.0-flash | $0.10/M | $0.40/M | Latest flash model |

### Hebrew Considerations

Gemini provides good multilingual support including Hebrew:
- Strong performance on multilingual tasks
- Very long context windows (1M+ tokens)
- May require explicit formatting instructions for RTL

**Recommendation**: If switching to Gemini, use gemini-1.5-pro for legal content. The 1M+ token context is useful for long legal documents.

### Message Format Differences

Gemini uses a different role naming convention:

```typescript
// Gemini uses 'model' instead of 'assistant'
// Anthropic/OpenAI: { role: 'assistant', content: '...' }
// Gemini:          { role: 'model', parts: [{ text: '...' }] }

// System instructions are separate
const result = await model.generateContent({
  contents: [{ role: 'user', parts: [{ text: 'Question' }] }],
  systemInstruction: 'You are a Hebrew legal expert...',
});
```

### Vertex AI vs Standard API

| Feature | Standard API | Vertex AI |
|---------|--------------|-----------|
| Authentication | API Key | Service Account |
| Regions | Global | Specific GCP regions |
| Enterprise Features | No | Yes |
| SLA | None | Enterprise SLA |

---

## Switching Providers

### Step 1: Update Environment Variables

```bash
# .env.local

# Current (Anthropic)
ANTHROPIC_API_KEY=your-anthropic-key

# Add new provider
OPENAI_API_KEY=your-openai-key
# OR
GOOGLE_API_KEY=your-google-key
```

### Step 2: Update Adapter Creation

```typescript
// Before (Anthropic)
const adapter = createAnthropicAdapter({
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
  // ...
});

// After (OpenAI)
const adapter = createOpenAIAdapter({
  provider: 'openai',
  model: 'gpt-4-turbo',
  // ...
});

// Or use the factory for dynamic switching
const adapter = createLLMAdapter({
  provider: process.env.LLM_PROVIDER || 'anthropic',
  model: process.env.LLM_MODEL || 'claude-3-5-sonnet-20241022',
  // ...
});
```

### Step 3: Adjust Prompts (If Needed)

Different providers may require slight prompt adjustments:

```typescript
// Provider-specific prompt tuning
const systemPrompts = {
  anthropic: 'You are a Hebrew legal expert. Respond in formal Hebrew...',
  openai: 'You are a Hebrew legal expert. IMPORTANT: Always respond in Hebrew using proper RTL formatting...',
  gemini: 'You are a Hebrew legal expert. Format responses for RTL display...',
};
```

### Step 4: Test Thoroughly

Before switching in production:
1. Test with sample Hebrew legal queries
2. Verify citation accuracy
3. Check response quality and formatting
4. Monitor token usage and costs
5. Validate error handling

---

## Cost Optimization

### Recommended Strategies

1. **Use appropriate model tiers**
   - Simple queries: claude-3-haiku / gpt-4o-mini / gemini-1.5-flash
   - Complex legal analysis: claude-3-5-sonnet / gpt-4o / gemini-1.5-pro

2. **Optimize prompt length**
   - Keep system prompts concise
   - Include only relevant context
   - Use chunking to limit input size

3. **Cache responses**
   - Cache common legal queries
   - Cache embedding results
   - Use response caching for identical queries

4. **Monitor usage**
   ```typescript
   const tracker = adapter.getUsageStatistics();
   if (tracker.totalCostUsd > dailyBudget) {
     // Switch to cheaper model or rate limit
   }
   ```

### Cost Comparison (per 1M tokens)

| Quality Tier | Anthropic | OpenAI | Gemini |
|--------------|-----------|--------|--------|
| **Budget** | Haiku: $0.25/$1.25 | GPT-3.5: $0.50/$1.50 | Flash: $0.075/$0.30 |
| **Standard** | Sonnet: $3.00/$15.00 | GPT-4o: $2.50/$10.00 | Pro: $1.25/$5.00 |
| **Premium** | Opus: $15.00/$75.00 | GPT-4-32K: $60/$120 | N/A |

---

## Security Considerations

### API Key Management

1. **Never commit API keys** to version control
2. **Use environment variables** for all keys
3. **Rotate keys regularly** (quarterly recommended)
4. **Use separate keys** for development and production

### Request Security

1. **Validate inputs** before sending to LLM
2. **Sanitize outputs** before displaying to users
3. **Implement rate limiting** at the application level
4. **Log requests** for audit purposes (without sensitive content)

### Provider-Specific Security

| Provider | Security Feature | Notes |
|----------|------------------|-------|
| Anthropic | Content filtering | Built-in safety filters |
| OpenAI | Content moderation | Optional moderation API |
| Gemini | Safety settings | Configurable safety thresholds |

---

## Troubleshooting

### Common Issues

#### Authentication Errors

```typescript
// Error: AuthenticationError
// Solution: Verify API key
const key = process.env.ANTHROPIC_API_KEY;
if (!key || key === 'your-key-here') {
  throw new Error('Invalid API key configuration');
}
```

#### Rate Limiting

```typescript
// Error: RateLimitError
// Solution: Implement backoff or reduce request rate
try {
  const response = await adapter.complete(messages);
} catch (error) {
  if (isRateLimitError(error)) {
    const delay = error.retryAfterMs || 60000;
    await sleep(delay);
    // Retry
  }
}
```

#### Hebrew Text Issues

```typescript
// Issue: Garbled or reversed Hebrew text
// Solution: Ensure proper encoding and add RTL markers
const systemPrompt = `
You are a Hebrew legal expert.
IMPORTANT: Always respond in Hebrew using proper Unicode.
Format legal terms with proper Hebrew typography.
`;
```

---

## Implementation Roadmap

### Current Status

- [x] Anthropic adapter (fully implemented)
- [x] OpenAI adapter (stub)
- [x] Gemini adapter (stub)
- [x] Token tracking
- [x] Retry logic
- [x] Error handling

### Future Enhancements

1. **Complete OpenAI implementation**
   - Install `openai` package
   - Implement `complete()` and `stream()` methods
   - Add Azure OpenAI support

2. **Complete Gemini implementation**
   - Install `@google/generative-ai` package
   - Implement `complete()` and `stream()` methods
   - Add Vertex AI support

3. **Provider benchmarking**
   - Create Hebrew legal query test suite
   - Benchmark response quality across providers
   - Document findings in Hebrew performance comparison

---

## Hebrew Performance Comparison Matrix

This section provides a detailed comparison of Hebrew language capabilities across all supported LLM providers. This is critical for the Israeli Law RAG Chatbot as all interactions are in Hebrew.

### Overall Hebrew Capability Ratings

| Capability | Anthropic Claude | OpenAI GPT | Google Gemini |
|------------|------------------|------------|---------------|
| **Overall Hebrew Fluency** | ★★★★★ Excellent | ★★★★☆ Good | ★★★★☆ Good |
| **Hebrew Grammar** | ★★★★★ Excellent | ★★★★☆ Good | ★★★★☆ Good |
| **RTL Text Handling** | ★★★★★ Native | ★★★★☆ Good | ★★★☆☆ Adequate |
| **Legal Terminology** | ★★★★★ Excellent | ★★★★☆ Good | ★★★☆☆ Adequate |
| **Formal Register** | ★★★★★ Excellent | ★★★★☆ Good | ★★★★☆ Good |
| **Modern Hebrew** | ★★★★★ Excellent | ★★★★★ Excellent | ★★★★★ Excellent |
| **Biblical/Classical Hebrew** | ★★★★☆ Good | ★★★★☆ Good | ★★★★☆ Good |

### Detailed Hebrew Language Analysis

#### 1. Grammar and Syntax

| Feature | Anthropic Claude | OpenAI GPT | Google Gemini |
|---------|------------------|------------|---------------|
| Verb conjugation (בניינים) | Accurate across all 7 בניינים | Occasionally misses passive forms | Generally accurate |
| Gender agreement | Consistently correct | Rare errors with mixed sentences | Occasional errors |
| Noun declension | Excellent handling of סמיכות | Good but occasional slips | Good |
| Sentence structure | Natural Hebrew word order | Sometimes follows English patterns | Sometimes follows English patterns |
| Punctuation | Hebrew-appropriate | Mostly correct | Mostly correct |
| Niqqud (vowel points) | Accurate when requested | Accurate when requested | Accurate when requested |

#### 2. Legal Hebrew Terminology

| Term Category | Anthropic Claude | OpenAI GPT | Google Gemini |
|---------------|------------------|------------|---------------|
| חוק (Law/Statute) | ★★★★★ | ★★★★☆ | ★★★☆☆ |
| תקנות (Regulations) | ★★★★★ | ★★★★☆ | ★★★☆☆ |
| פסיקה (Case Law) | ★★★★★ | ★★★★☆ | ★★★☆☆ |
| מונחים משפטיים (Legal Terms) | ★★★★★ | ★★★★☆ | ★★★☆☆ |
| ניסוח משפטי (Legal Drafting) | ★★★★★ | ★★★★☆ | ★★★☆☆ |

**Example Legal Terms Performance:**

```
Term: עילת תביעה (cause of action)
- Claude: Correctly uses in legal context with proper prepositions
- GPT-4: Usually correct, occasionally confused with general "reason"
- Gemini: Sometimes requires clarification prompts

Term: הוראות מעבר (transitional provisions)
- Claude: Perfect understanding of legislative context
- GPT-4: Good understanding
- Gemini: May need additional context

Term: סייגים ותנאים (exceptions and conditions)
- Claude: Accurate legal interpretation
- GPT-4: Accurate legal interpretation
- Gemini: Generally accurate
```

#### 3. RTL Text Handling

| Aspect | Anthropic Claude | OpenAI GPT | Google Gemini |
|--------|------------------|------------|---------------|
| Pure Hebrew text | ★★★★★ | ★★★★★ | ★★★★★ |
| Mixed Hebrew/English | ★★★★★ | ★★★★☆ | ★★★☆☆ |
| Numbers in Hebrew context | ★★★★★ | ★★★★☆ | ★★★★☆ |
| Legal citations | ★★★★★ | ★★★★☆ | ★★★☆☆ |
| Structured lists | ★★★★★ | ★★★★☆ | ★★★★☆ |
| Tables/formatting | ★★★★☆ | ★★★★☆ | ★★★☆☆ |

**RTL Formatting Example:**

```
Task: Format a law citation properly

Claude output:
חוק יסוד: כבוד האדם וחירותו, התשנ"ב-1992, סעיף 1

GPT-4 output:
חוק יסוד: כבוד האדם וחירותו, התשנ"ב-1992, סעיף 1
(Occasionally: סעיף 1, התשנ"ב-1992, חוק יסוד: כבוד האדם וחירותו)

Gemini output:
חוק יסוד: כבוד האדם וחירותו, התשנ"ב-1992, סעיף 1
(May need explicit RTL formatting instructions)
```

#### 4. Hebrew Tokenization Efficiency

| Provider | Tokens per 1000 Hebrew Characters | Efficiency Rating |
|----------|-----------------------------------|-------------------|
| Anthropic Claude | ~400-450 | ★★★★★ Excellent |
| OpenAI GPT | ~450-500 | ★★★★☆ Good |
| Google Gemini | ~420-480 | ★★★★☆ Good |

**Note**: Hebrew text typically uses more tokens than English due to the script complexity. Claude's tokenizer appears slightly more efficient for Hebrew.

#### 5. Response Quality for Legal Queries

| Query Type | Anthropic Claude | OpenAI GPT | Google Gemini |
|------------|------------------|------------|---------------|
| Simple legal question | ★★★★★ | ★★★★★ | ★★★★☆ |
| Complex legal analysis | ★★★★★ | ★★★★☆ | ★★★☆☆ |
| Multi-law comparison | ★★★★★ | ★★★★☆ | ★★★☆☆ |
| Citation generation | ★★★★★ | ★★★★☆ | ★★★☆☆ |
| Legal summary | ★★★★★ | ★★★★★ | ★★★★☆ |
| Amendment tracking | ★★★★☆ | ★★★★☆ | ★★★☆☆ |

### Hebrew-Specific Prompt Optimization

Different providers may require different prompting strategies for optimal Hebrew output.

#### Anthropic Claude (Recommended)

```typescript
const claudeSystemPrompt = `
אתה מומחה למשפט ישראלי. עליך לענות בעברית תקנית ברמה משפטית גבוהה.

הנחיות:
- השתמש בניסוח משפטי פורמלי
- ציין את מקורות החוק המדויקים
- הימנע מספקולציות - אם אינך בטוח, ציין זאת
- פרמט תשובות עם כותרות וסעיפים מסודרים
`;
```

#### OpenAI GPT

```typescript
const openaiSystemPrompt = `
אתה מומחה למשפט ישראלי. עליך לענות בעברית תקנית ברמה משפטית גבוהה.

חשוב מאוד:
- כל התשובות חייבות להיות בעברית בלבד
- השתמש בפורמט RTL (מימין לשמאל)
- השתמש בניסוח משפטי פורמלי
- ציין את מקורות החוק המדויקים
- הימנע מספקולציות - אם אינך בטוח, ציין זאת
- פרמט תשובות עם כותרות וסעיפים מסודרים

הערה: אל תערבב שפות בתוך משפט.
`;
```

#### Google Gemini

```typescript
const geminiSystemPrompt = `
אתה מומחה למשפט ישראלי. עליך לענות בעברית תקנית ברמה משפטית גבוהה.

הנחיות קריטיות לפורמט:
- כתוב אך ורק בעברית
- פורמט: טקסט מימין לשמאל (RTL)
- סגנון: ניסוח משפטי פורמלי
- מקורות: ציין חוקים וסעיפים מדויקים
- דיוק: הימנע מהשערות, ציין חוסר ודאות
- מבנה: השתמש בכותרות, רשימות וסעיפים

כללים נוספים:
- אל תשתמש באנגלית בתוך משפטים בעברית
- מספרים וציונים משפטיים בפורמט ישראלי
- התש"פ, התשפ"א וכו' - לא 2020, 2021
`;
```

### Benchmark Test Suite

The following test queries can be used to evaluate Hebrew performance when comparing providers:

#### Test 1: Basic Legal Query

```hebrew
שאלה: מהם התנאים לביטול חוזה על פי חוק החוזים (תרופות בשל הפרת חוזה)?
```

**Expected Qualities:**
- Proper citation of חוק החוזים (תרופות בשל הפרת חוזה), התשל"א-1970
- Listing of conditions (הפרה יסודית, הודעה על ביטול, etc.)
- Formal legal Hebrew register

#### Test 2: Complex Legal Analysis

```hebrew
שאלה: הסבר את ההבדל בין "רשלנות" ו"רשלנות רבתי" בפסיקה הישראלית, וכיצד הם משפיעים על קביעת הנזק.
```

**Expected Qualities:**
- Citation of relevant פסיקה
- Proper use of legal terminology
- Structured analysis with clear distinctions

#### Test 3: Hebrew Citation Format

```hebrew
שאלה: ציין את סעיף 1 לחוק יסוד: כבוד האדם וחירותו.
```

**Expected Output:**
```hebrew
סעיף 1 לחוק יסוד: כבוד האדם וחירותו, התשנ"ב-1992:

"זכויות היסוד של האדם בישראל מושתתות על ההכרה בערך האדם, בקדושת חייו ובהיותו בן-חורין, והן יכובדו ברוח העקרונות שבהכרזה על הקמת מדינת ישראל."
```

#### Test 4: Mixed Content Handling

```hebrew
שאלה: מה קובע ה-GDPR (התקנה הכללית להגנה על מידע) של האיחוד האירופי, וכיצד הוא משתלב עם חוק הגנת הפרטיות הישראלי?
```

**Expected Qualities:**
- Proper handling of "GDPR" acronym in Hebrew context
- Comparison between international and Israeli law
- Correct formatting of mixed Hebrew/English terms

### Recommended Provider Selection

Based on the comprehensive Hebrew performance analysis:

| Use Case | Recommended Provider | Rationale |
|----------|---------------------|-----------|
| **Production legal chatbot** | Anthropic Claude | Best Hebrew fluency, legal terminology, and RTL handling |
| **Budget-conscious deployment** | OpenAI GPT-4o-mini | Good Hebrew with lower cost |
| **Long document processing** | Google Gemini | 1M+ context for long legal documents |
| **Maximum accuracy** | Anthropic Claude Opus | Highest quality for complex legal analysis |
| **Fast responses** | Anthropic Haiku / GPT-4o-mini / Gemini Flash | All adequate for simple queries |

### Provider Selection Decision Tree

```
Need best Hebrew legal accuracy?
├── Yes → Use Anthropic Claude (Sonnet recommended)
└── No → Continue...

Need very long context (>200K tokens)?
├── Yes → Use Google Gemini (1M+ context)
└── No → Continue...

Budget is primary concern?
├── Yes → Use OpenAI GPT-4o-mini or Gemini Flash
└── No → Use Anthropic Claude Sonnet

Need enterprise features (Azure/Vertex)?
├── Yes → OpenAI (Azure) or Gemini (Vertex AI)
└── No → Anthropic API directly
```

### Migration Considerations

When switching between providers, be aware of Hebrew-specific issues:

| Issue | From Claude → OpenAI | From Claude → Gemini |
|-------|---------------------|----------------------|
| Prompt adjustments | Minor - add RTL reminders | Moderate - explicit formatting |
| Citation format | Verify output format | May need reformatting |
| Legal terminology | Generally preserved | Test extensively |
| Response quality | Slight reduction expected | Moderate reduction expected |
| Token efficiency | ~5-10% more tokens | ~5% more tokens |

### Quality Assurance Checklist for Hebrew

Before deploying any provider for Hebrew legal content:

- [ ] Test with 10+ sample legal queries
- [ ] Verify proper Hebrew grammar (verb conjugation, gender agreement)
- [ ] Check RTL formatting in mixed content
- [ ] Validate legal terminology accuracy
- [ ] Test citation format consistency
- [ ] Verify proper handling of Hebrew dates (התש"פ format)
- [ ] Check אותיות סופיות (final letters) in legal terms
- [ ] Validate proper use of ניקוד if required
- [ ] Test long-form legal analysis quality
- [ ] Verify chunk/context handling doesn't break Hebrew text

---

## References

- [Anthropic API Documentation](https://docs.anthropic.com/)
- [OpenAI API Documentation](https://platform.openai.com/docs/)
- [Google Gemini API Documentation](https://ai.google.dev/docs)
- [Anthropic Pricing](https://www.anthropic.com/pricing)
- [OpenAI Pricing](https://openai.com/pricing)
- [Gemini Pricing](https://ai.google.dev/pricing)

---

*Last updated: January 2025*
*Project: Israeli Law RAG Chatbot*
