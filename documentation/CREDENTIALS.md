# Secure Credentials Management

This document describes how to securely manage connection credentials for the Israeli Law RAG Chatbot project.

## Table of Contents

- [Overview](#overview)
- [Required Credentials](#required-credentials)
- [Local Development Setup](#local-development-setup)
- [Production Environment (Vercel)](#production-environment-vercel)
- [Security Best Practices](#security-best-practices)
- [Credential Rotation](#credential-rotation)
- [Troubleshooting](#troubleshooting)

---

## Overview

This project requires credentials for the following external services:

| Service | Purpose | Environment Variable |
|---------|---------|---------------------|
| Anthropic Claude | LLM for generating responses | `ANTHROPIC_API_KEY` |
| Qdrant Cloud | Vector database for semantic search | `QDRANT_URL`, `QDRANT_API_KEY` |
| PostgreSQL | Metadata and law document storage | `DATABASE_URL` |

All credentials **must** be stored as environment variables and **never** committed to version control.

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

---

### Qdrant Cloud Credentials

**Variables**:
- `QDRANT_URL` - Full URL to your Qdrant cluster
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

See [QDRANT_CLOUD_SETUP.md](./QDRANT_CLOUD_SETUP.md) for detailed Qdrant setup instructions.

---

### PostgreSQL Database URL

**Variable**: `DATABASE_URL`

**Purpose**: Connects to the PostgreSQL database storing law metadata, chunks, and topics.

**Format**: `postgresql://user:password@host:port/database?sslmode=require`

**Components**:
- `user` - Database username
- `password` - Database password (URL-encoded if contains special characters)
- `host` - Database server hostname
- `port` - Database port (default: 5432)
- `database` - Database name
- `sslmode` - SSL mode (use `require` for production)

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
# Anthropic Claude API
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# Qdrant Cloud
QDRANT_URL=https://your-cluster-id.us-east.aws.cloud.qdrant.io:6333
QDRANT_API_KEY=your-qdrant-api-key-here

# PostgreSQL Database
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require

# Optional: Qdrant collection settings (defaults shown)
# QDRANT_COLLECTION_NAME=israeli_laws
# QDRANT_VECTOR_SIZE=1024
# QDRANT_TIMEOUT=30000
```

### Step 3: Verify File is Ignored

Ensure `.env.local` is in `.gitignore` (it already is):

```bash
# Check that the file is ignored
git check-ignore .env.local
```

### Step 4: Verify Credentials

Test your Qdrant connection:

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
```

### How Environment Variables Work in Vercel

When you add environment variables through the Vercel dashboard (or CLI), they are automatically available to your serverless functions at runtime via `process.env`. No additional configuration is needed.

Use the exact variable names expected by the application:
- `ANTHROPIC_API_KEY`
- `QDRANT_URL`
- `QDRANT_API_KEY`
- `DATABASE_URL`
- `ALLOWED_ORIGINS` (optional)

### Environment Separation

Use different credentials for each environment to prevent accidental data modification:

| Environment | Qdrant Cluster | Database |
|-------------|----------------|----------|
| Development | `dev-israeli-law-rag` | `israeli_law_dev` |
| Preview | `staging-israeli-law-rag` | `israeli_law_staging` |
| Production | `israeli-law-rag` | `israeli_law_prod` |

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

### DON'T

- Commit credentials to version control (even in private repos)
- Share credentials via email, Slack, or other insecure channels
- Use production credentials in development
- Hardcode credentials in source code
- Log credentials in application output
- Store credentials in client-side code (frontend)

### Files That Should Never Contain Credentials

- Source code files (`.ts`, `.js`, `.vue`, etc.)
- Configuration files committed to git
- README files
- Test fixtures
- CI/CD configuration files (use secrets management instead)

### Credential Validation in Code

The project validates credentials at runtime using Zod schemas. See `lib/src/qdrant/config.ts` for the implementation:

```typescript
import { validateQdrantEnv } from '@/lib/qdrant';

const validation = validateQdrantEnv();
if (!validation.isValid) {
  console.error('Missing variables:', validation.missingVars);
  console.error('Errors:', validation.errors);
}
```

---

## Credential Rotation

### When to Rotate

- Immediately if credentials may have been exposed
- When team members leave the project
- Every 90 days for high-security environments
- After any security incident

### Rotation Procedure

#### 1. Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Create a new API key
3. Update the key in all environments (local, Vercel)
4. Verify the application works with the new key
5. Delete the old API key

#### 2. Qdrant API Key

1. Log in to [cloud.qdrant.io](https://cloud.qdrant.io/)
2. Navigate to your cluster's API Keys
3. Create a new API key
4. Update the key in all environments
5. Verify the application can connect
6. Delete the old API key

#### 3. Database Password

1. Change the password in your database provider
2. Update `DATABASE_URL` in all environments
3. Verify database connections work
4. Document the change date

### Zero-Downtime Rotation

For production systems, use this approach:

1. Create new credential
2. Update staging/preview environment
3. Verify functionality
4. Update production environment
5. Monitor for errors
6. Revoke old credential after 24-48 hours

---

## Troubleshooting

### "Missing environment variables" Error

**Symptom**: Application fails to start with missing variable errors.

**Solution**:
1. Verify `.env.local` exists and contains all required variables
2. Check for typos in variable names
3. Ensure variables are exported (if using shell scripts)
4. Restart the development server after adding variables

### "Invalid URL" Error for QDRANT_URL

**Symptom**: Zod validation fails for QDRANT_URL.

**Solution**:
1. Ensure the URL includes the protocol: `https://`
2. Ensure the URL includes the port: `:6333`
3. Check for trailing slashes (should not have one)

### "Unauthorized" Error (401) from Qdrant

**Symptom**: API calls to Qdrant return 401 Unauthorized.

**Solution**:
1. Verify the API key is correct
2. Check the API key hasn't expired or been revoked
3. Ensure the API key has the required permissions
4. Verify you're using the correct cluster URL

### Vercel Build Fails with Missing Secrets

**Symptom**: Vercel build fails because environment variables are undefined.

**Solution**:
1. Verify environment variables are added in Vercel dashboard (Settings > Environment Variables)
2. Check variable names match exactly: `ANTHROPIC_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, `DATABASE_URL`
3. Ensure variables are enabled for the correct environment (Production/Preview/Development)
4. Trigger a new deployment after adding variables

---

## Quick Reference

### Environment Variable Checklist

```
[ ] ANTHROPIC_API_KEY - Anthropic Console API key
[ ] QDRANT_URL        - Qdrant cluster URL with port
[ ] QDRANT_API_KEY    - Qdrant cluster API key
[ ] DATABASE_URL      - PostgreSQL connection string
```

### File Locations

| Environment | Credential Storage |
|-------------|-------------------|
| Local Dev | `.env.local` (gitignored) |
| Vercel | Dashboard > Settings > Environment Variables |
| CI/CD | GitHub Secrets / Provider Secrets |

### Useful Commands

```bash
# Verify local env file is ignored
git check-ignore .env.local

# Test Qdrant connection
npm run scripts:verify-qdrant

# List Vercel environment variables
vercel env ls

# Pull Vercel env to local
vercel env pull .env.local
```

---

*Last updated: January 2025*
*Project: Israeli Law RAG Chatbot*
