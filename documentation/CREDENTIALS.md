# Secure Credentials Management

This document describes how to securely manage connection credentials for the Israeli Law RAG Chatbot project.

## Table of Contents

- [Overview](#overview)
- [Required Credentials](#required-credentials)
  - [Anthropic API Key](#anthropic-api-key)
  - [Qdrant Cloud Credentials](#qdrant-cloud-credentials)
  - [PostgreSQL Database URL](#postgresql-database-url)
- [Optional LLM Provider Credentials](#optional-llm-provider-credentials)
  - [OpenAI Credentials](#openai-credentials)
  - [Google Gemini Credentials](#google-gemini-credentials)
- [Local Development Setup](#local-development-setup)
- [Production Environment (Vercel)](#production-environment-vercel)
- [CI/CD Environment](#cicd-environment)
- [Security Best Practices](#security-best-practices)
- [Credential Validation](#credential-validation)
- [Credential Rotation](#credential-rotation)
- [Troubleshooting](#troubleshooting)

---

## Overview

This project requires credentials for external services. All credentials **must** be stored as environment variables and **never** committed to version control.

### Required Services

| Service          | Purpose                             | Environment Variables          |
| ---------------- | ----------------------------------- | ------------------------------ |
| Anthropic Claude | LLM for generating responses        | `ANTHROPIC_API_KEY`            |
| Qdrant Cloud     | Vector database for semantic search | `QDRANT_URL`, `QDRANT_API_KEY` |
| PostgreSQL       | Metadata and law document storage   | `DATABASE_URL`                 |

### Optional Services (Future-Ready)

| Service       | Purpose                  | Environment Variables                                    |
| ------------- | ------------------------ | -------------------------------------------------------- |
| OpenAI        | Alternative LLM provider | `OPENAI_API_KEY`, `OPENAI_ORG_ID`, `OPENAI_BASE_URL`     |
| Google Gemini | Alternative LLM provider | `GOOGLE_API_KEY`, `GOOGLE_PROJECT_ID`, `GOOGLE_LOCATION` |

---

## Required Credentials

### Anthropic API Key

**Variable**: `ANTHROPIC_API_KEY`

**Purpose**: Authenticates requests to the Claude API for generating Hebrew legal responses.

**How to obtain**:

1. Create an account at [console.anthropic.com](https://console.anthropic.com/)
2. Navigate to **API Keys** in the dashboard
3. Click **Create Key**
4. Copy the key immediately (it won't be shown again)

**Format**: `sk-ant-api03-...`

**Validation**: The key must start with `sk-ant-` prefix.

**Usage in code**:

```typescript
import { validateProviderEnv } from '@israeli-law-rag/lib/llm';

const result = validateProviderEnv('anthropic', process.env);
if (!result.success) {
  console.error('Invalid Anthropic credentials:', result.errors);
}
```

---

### Qdrant Cloud Credentials

**Variables**:

- `QDRANT_URL` - Full URL to your Qdrant cluster (including port)
- `QDRANT_API_KEY` - API key for authentication

**Purpose**: Connects to the vector database for storing and retrieving law document embeddings.

**How to obtain**:

1. Log in to [cloud.qdrant.io](https://cloud.qdrant.io/)
2. Navigate to your cluster
3. Find the cluster URL in the format: `https://<cluster-id>.<region>.cloud.qdrant.io:6333`
4. Go to **API Keys** section
5. Create a new API key with read/write permissions
6. Copy the API key immediately

**Format**:

- URL: `https://abc123xyz.us-east.aws.cloud.qdrant.io:6333`
- API Key: A long alphanumeric string

**Important URL requirements**:

- Must include the protocol (`https://`)
- Must include the port (`:6333`)
- Must NOT have a trailing slash

**Validation in code**:

```typescript
import { validateQdrantEnv } from '@israeli-law-rag/lib/qdrant';

const validation = validateQdrantEnv();
if (!validation.isValid) {
  console.error('Missing variables:', validation.missingVars);
  console.error('Errors:', validation.errors);
}
```

See [QDRANT_CLOUD_SETUP.md](./QDRANT_CLOUD_SETUP.md) for detailed Qdrant setup instructions.

---

### PostgreSQL Database URL

**Variable**: `DATABASE_URL`

**Purpose**: Connects to the PostgreSQL database storing law metadata, chunks, and topics.

**Format**: `postgresql://user:password@host:port/database?sslmode=require`

**Components**:
| Component | Description | Example |
|-----------|-------------|---------|
| `user` | Database username | `scraper` |
| `password` | Database password (URL-encoded if contains special characters) | `myP%40ssword` |
| `host` | Database server hostname | `db.example.com` |
| `port` | Database port | `5432` |
| `database` | Database name | `knesset_laws` |
| `sslmode` | SSL mode | `require` (for production) |

**Password encoding**: If your password contains special characters, URL-encode them:
| Character | Encoded |
|-----------|---------|
| `@` | `%40` |
| `#` | `%23` |
| `$` | `%24` |
| `%` | `%25` |
| `&` | `%26` |
| `/` | `%2F` |
| `:` | `%3A` |

**Example with special characters**:

```
postgresql://user:pass%40word123@db.example.com:5432/mydb?sslmode=require
```

---

## Optional LLM Provider Credentials

The project's modular LLM adapter architecture supports multiple providers. While Anthropic is the default, you can configure alternative providers.

### OpenAI Credentials

**Variables**:
| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `OPENAI_ORG_ID` | No | Organization ID (for team accounts) |
| `OPENAI_BASE_URL` | No | Custom API base URL (for proxies/Azure) |

**How to obtain**:

1. Create an account at [platform.openai.com](https://platform.openai.com/)
2. Navigate to **API Keys** in your account settings
3. Click **Create new secret key**
4. Copy the key immediately

**Format**: `sk-...` (starts with `sk-`)

**Example**:

```bash
OPENAI_API_KEY=sk-proj-abc123xyz...
OPENAI_ORG_ID=org-abc123  # Optional
```

---

### Google Gemini Credentials

**Variables**:
| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_API_KEY` | Yes | Google AI API key |
| `GOOGLE_PROJECT_ID` | No | GCP project ID (for Vertex AI) |
| `GOOGLE_LOCATION` | No | GCP region (for Vertex AI, e.g., `us-central1`) |

**How to obtain**:

**Option A: Google AI Studio (Simpler)**

1. Go to [makersuite.google.com](https://makersuite.google.com/)
2. Click **Get API key**
3. Create a new API key or use an existing one
4. Copy the key

**Option B: Vertex AI (Enterprise)**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable the Vertex AI API
4. Create a service account with AI Platform User role
5. Generate and download the key

**Example**:

```bash
# For Google AI Studio
GOOGLE_API_KEY=AIza...

# For Vertex AI
GOOGLE_API_KEY=AIza...
GOOGLE_PROJECT_ID=my-project-123
GOOGLE_LOCATION=us-central1
```

---

## Local Development Setup

### Step 1: Create Environment File

Create a `.env.local` file in the project root:

```bash
touch .env.local
```

### Step 2: Add Credentials

Add your credentials to `.env.local`:

```bash
# =============================================================================
# Required: Anthropic Claude API
# =============================================================================
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# =============================================================================
# Required: Qdrant Cloud
# =============================================================================
QDRANT_URL=https://your-cluster-id.us-east.aws.cloud.qdrant.io:6333
QDRANT_API_KEY=your-qdrant-api-key-here

# Optional Qdrant settings (defaults shown)
# QDRANT_COLLECTION_NAME=israeli_laws
# QDRANT_VECTOR_SIZE=1024
# QDRANT_TIMEOUT=30000

# =============================================================================
# Required: PostgreSQL Database
# =============================================================================
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require

# =============================================================================
# Optional: Alternative LLM Providers
# =============================================================================
# OpenAI (if using as alternative to Anthropic)
# OPENAI_API_KEY=sk-your-openai-key
# OPENAI_ORG_ID=org-your-org-id

# Google Gemini (if using as alternative to Anthropic)
# GOOGLE_API_KEY=your-google-api-key
# GOOGLE_PROJECT_ID=your-gcp-project
# GOOGLE_LOCATION=us-central1

# =============================================================================
# Optional: Application Settings
# =============================================================================
# ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

### Step 3: Verify File is Ignored

Ensure `.env.local` is in `.gitignore` (it already is):

```bash
# Check that the file is ignored
git check-ignore .env.local
# Should output: .env.local
```

### Step 4: Verify Credentials

**Test Qdrant connection**:

```bash
curl -X GET "${QDRANT_URL}/collections" \
  -H "api-key: ${QDRANT_API_KEY}" \
  -H "Content-Type: application/json"
```

Expected response:

```json
{
  "result": { "collections": [] },
  "status": "ok"
}
```

**Test using the verification script**:

```bash
npm run verify-qdrant -w @israeli-law-rag/scripts
```

---

## Production Environment (Vercel)

### Adding Secrets to Vercel

Production credentials are managed through Vercel's encrypted environment variables.

#### Via Vercel Dashboard (Recommended)

1. Go to your project at [vercel.com/dashboard](https://vercel.com/dashboard)
2. Navigate to **Settings** > **Environment Variables**
3. Add each variable:
   - **Name**: Variable name (e.g., `ANTHROPIC_API_KEY`)
   - **Value**: The secret value
   - **Environment**: Select `Production`, `Preview`, and/or `Development`
4. Click **Save**

#### Via Vercel CLI

```bash
# Add production secrets
vercel env add ANTHROPIC_API_KEY production
vercel env add QDRANT_URL production
vercel env add QDRANT_API_KEY production
vercel env add DATABASE_URL production

# Verify all variables are set
vercel env ls
```

### Environment Separation

Use different credentials for each environment to prevent accidental data modification:

| Environment | Qdrant Cluster            | Database              | Usage             |
| ----------- | ------------------------- | --------------------- | ----------------- |
| Development | `dev-israeli-law-rag`     | `israeli_law_dev`     | Local development |
| Preview     | `staging-israeli-law-rag` | `israeli_law_staging` | PR previews       |
| Production  | `israeli-law-rag`         | `israeli_law_prod`    | Live application  |

See [VERCEL_SETUP.md](../.github/VERCEL_SETUP.md) for detailed Vercel deployment instructions.

---

## CI/CD Environment

### GitHub Actions Secrets

For automated workflows, add secrets in your repository settings:

1. Go to **Settings** > **Secrets and variables** > **Actions**
2. Click **New repository secret**
3. Add the following secrets:

| Secret Name         | Description                 | Required For      |
| ------------------- | --------------------------- | ----------------- |
| `VERCEL_TOKEN`      | Vercel API token            | Deployments       |
| `VERCEL_ORG_ID`     | Vercel organization ID      | Deployments       |
| `VERCEL_PROJECT_ID` | Vercel project ID           | Deployments       |
| `ANTHROPIC_API_KEY` | Anthropic API key           | Integration tests |
| `QDRANT_URL`        | Qdrant test cluster URL     | Integration tests |
| `QDRANT_API_KEY`    | Qdrant test cluster API key | Integration tests |
| `DATABASE_URL`      | Test database URL           | Integration tests |

### Obtaining Vercel Secrets

```bash
# Link project first
vercel link

# Get project and org IDs
cat .vercel/project.json
# Output contains "projectId" and "orgId"

# Generate token at: https://vercel.com/account/tokens
```

### GitHub Actions Usage

Secrets are accessed in workflows via `${{ secrets.SECRET_NAME }}`:

```yaml
# .github/workflows/test.yml
jobs:
  test:
    runs-on: ubuntu-latest
    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      QDRANT_URL: ${{ secrets.QDRANT_URL }}
      QDRANT_API_KEY: ${{ secrets.QDRANT_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - run: npm test
```

---

## Security Best Practices

### DO

- Store all credentials in environment variables
- Use `.env.local` for local development (automatically gitignored)
- Use Vercel's encrypted environment variables for production
- Rotate credentials periodically (see [Credential Rotation](#credential-rotation))
- Use separate credentials for development, staging, and production
- Set restrictive permissions on API keys when possible
- Review access logs in service dashboards regularly
- Use the built-in validation functions before using credentials

### DON'T

- Commit credentials to version control (even in private repos)
- Share credentials via email, Slack, or other insecure channels
- Use production credentials in development
- Hardcode credentials in source code
- Log credentials in application output
- Store credentials in client-side code (frontend)
- Create overly-permissive API keys

### Files That Should Never Contain Credentials

- Source code files (`.ts`, `.js`, `.vue`, etc.)
- Configuration files committed to git
- README files
- Test fixtures
- CI/CD configuration files (use secrets management instead)
- Docker files (use build args or runtime env vars)

### Sensitive File Patterns (Already in .gitignore)

```gitignore
# Environment files
.env
.env.local
.env.*.local
.env.development
.env.production

# Secrets and credentials
*.pem
*.key
credentials.json
service-account*.json
```

---

## Credential Validation

The project includes built-in validation for all credentials using Zod schemas.

### Qdrant Validation

```typescript
import { validateQdrantEnv, loadQdrantConfig } from '@israeli-law-rag/lib/qdrant';

// Non-throwing validation
const validation = validateQdrantEnv();
if (!validation.isValid) {
  console.error('Missing variables:', validation.missingVars);
  console.error('Errors:', validation.errors);
  process.exit(1);
}

// Throwing validation (use in initialization)
try {
  const config = loadQdrantConfig();
  console.log('Qdrant configured:', config.url);
} catch (error) {
  console.error('Invalid Qdrant configuration:', error.message);
  process.exit(1);
}
```

### LLM Provider Validation

```typescript
import {
  validateProviderEnv,
  hasRequiredEnvVars,
  getRequiredEnvVars,
  assertRequiredEnvVars,
} from '@israeli-law-rag/lib/llm';

// Check if provider can be used
if (hasRequiredEnvVars('anthropic')) {
  console.log('Anthropic credentials available');
}

// Get required variable names
const required = getRequiredEnvVars('anthropic');
console.log('Required for Anthropic:', required);
// Output: ['ANTHROPIC_API_KEY']

// Validate and get result
const result = validateProviderEnv('anthropic', process.env);
if (result.success) {
  console.log('API key prefix:', result.data.ANTHROPIC_API_KEY.slice(0, 10));
}

// Assert (throws if invalid)
assertRequiredEnvVars('anthropic');
```

### All Providers Quick Check

```typescript
import { hasRequiredEnvVars, getSupportedProviders } from '@israeli-law-rag/lib/llm';

// Check which providers are configured
const providers = getSupportedProviders();
for (const provider of providers) {
  const available = hasRequiredEnvVars(provider);
  console.log(`${provider}: ${available ? 'configured' : 'not configured'}`);
}
// Output:
// anthropic: configured
// openai: not configured
// gemini: not configured
```

---

## Credential Rotation

### When to Rotate

- **Immediately** if credentials may have been exposed
- When team members leave the project
- Every 90 days for high-security environments
- After any security incident
- When changing service providers

### Rotation Procedure

#### 1. Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Create a **new** API key
3. Update the key in all environments:
   - `.env.local` (local)
   - Vercel dashboard (production)
   - GitHub secrets (CI/CD)
4. Verify the application works with the new key
5. Delete the **old** API key

#### 2. Qdrant API Key

1. Log in to [cloud.qdrant.io](https://cloud.qdrant.io/)
2. Navigate to your cluster's **API Keys**
3. Create a **new** API key
4. Update the key in all environments
5. Verify the application can connect
6. Delete the **old** API key

#### 3. Database Password

1. Change the password in your database provider
2. Update `DATABASE_URL` in all environments
3. Verify database connections work
4. Document the change date

### Zero-Downtime Rotation

For production systems, use this approach to avoid downtime:

1. **Create new credential** (do not revoke old one yet)
2. **Update staging/preview environment**
3. **Verify functionality** (run tests, check logs)
4. **Update production environment**
5. **Monitor for errors** (check dashboards, alerts)
6. **Revoke old credential** after 24-48 hours of stable operation

### Rotation Checklist

```
[ ] Create new credential in provider dashboard
[ ] Test new credential locally
[ ] Update development environment
[ ] Update staging/preview environment
[ ] Verify staging deployment works
[ ] Update production environment
[ ] Verify production deployment works
[ ] Monitor for 24-48 hours
[ ] Revoke old credential
[ ] Document rotation date and reason
```

---

## Troubleshooting

### "Missing environment variables" Error

**Symptom**: Application fails to start with missing variable errors.

**Solution**:

1. Verify `.env.local` exists and contains all required variables
2. Check for typos in variable names
3. Ensure variables are exported (if using shell scripts)
4. Restart the development server after adding variables

```bash
# Check if file exists
ls -la .env.local

# Check specific variable
grep ANTHROPIC_API_KEY .env.local
```

### "Invalid URL" Error for QDRANT_URL

**Symptom**: Zod validation fails for QDRANT_URL.

**Solution**:

1. Ensure the URL includes the protocol: `https://`
2. Ensure the URL includes the port: `:6333`
3. Check for trailing slashes (should NOT have one)

**Correct**: `https://abc123.us-east.aws.cloud.qdrant.io:6333`
**Wrong**: `abc123.us-east.aws.cloud.qdrant.io:6333` (no protocol)
**Wrong**: `https://abc123.us-east.aws.cloud.qdrant.io:6333/` (trailing slash)

### "Unauthorized" Error (401) from Qdrant

**Symptom**: API calls to Qdrant return 401 Unauthorized.

**Solution**:

1. Verify the API key is correct (copy again from dashboard)
2. Check the API key hasn't expired or been revoked
3. Ensure the API key has the required permissions (read/write)
4. Verify you're using the correct cluster URL

```bash
# Test connection
curl -v -X GET "${QDRANT_URL}/collections" \
  -H "api-key: ${QDRANT_API_KEY}"
```

### "Invalid API Key" Error from Anthropic

**Symptom**: Anthropic API returns authentication error.

**Solution**:

1. Verify the key starts with `sk-ant-`
2. Check for leading/trailing whitespace
3. Regenerate key if corrupted

```bash
# Check key format
echo "Key starts with: ${ANTHROPIC_API_KEY:0:7}"
# Should output: Key starts with: sk-ant-
```

### Vercel Build Fails with Missing Secrets

**Symptom**: Vercel build fails because environment variables are undefined.

**Solution**:

1. Verify environment variables are added in Vercel dashboard
2. Check variable names match exactly (case-sensitive)
3. Ensure variables are enabled for the correct environment
4. Trigger a new deployment after adding variables

```bash
# List current Vercel env vars
vercel env ls

# Pull to verify
vercel env pull .env.vercel-test
cat .env.vercel-test
rm .env.vercel-test  # Clean up
```

### Database Connection Refused

**Symptom**: PostgreSQL connection fails.

**Solution**:

1. Verify the host is accessible from your network
2. Check if SSL is required (`?sslmode=require`)
3. Verify the port is correct (default: 5432)
4. Check firewall/security group rules

```bash
# Test connection with psql
psql "${DATABASE_URL}" -c "SELECT 1"
```

---

## Quick Reference

### Environment Variable Checklist

```
Required:
[ ] ANTHROPIC_API_KEY  - Anthropic Console API key (sk-ant-...)
[ ] QDRANT_URL         - Qdrant cluster URL with port (:6333)
[ ] QDRANT_API_KEY     - Qdrant cluster API key
[ ] DATABASE_URL       - PostgreSQL connection string

Optional:
[ ] ALLOWED_ORIGINS    - CORS allowed origins
[ ] OPENAI_API_KEY     - OpenAI API key (sk-...)
[ ] GOOGLE_API_KEY     - Google AI API key
```

### File Locations

| Environment | Credential Storage                           |
| ----------- | -------------------------------------------- |
| Local Dev   | `.env.local` (gitignored)                    |
| Vercel      | Dashboard > Settings > Environment Variables |
| CI/CD       | GitHub Secrets / Provider Secrets            |

### Useful Commands

```bash
# Verify local env file is ignored
git check-ignore .env.local

# Test Qdrant connection
npm run verify-qdrant -w @israeli-law-rag/scripts

# List Vercel environment variables
vercel env ls

# Pull Vercel env to local
vercel env pull .env.local
```

### Related Documentation

- [QDRANT_CLOUD_SETUP.md](./QDRANT_CLOUD_SETUP.md) - Detailed Qdrant Cloud setup
- [VERCEL_SETUP.md](../.github/VERCEL_SETUP.md) - Vercel deployment guide
- [LLM_PROVIDER_CONSIDERATIONS.md](./LLM_PROVIDER_CONSIDERATIONS.md) - LLM provider comparison

---

_Last updated: January 2025_
_Project: Israeli Law RAG Chatbot_
