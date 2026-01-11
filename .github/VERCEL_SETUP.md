# Vercel Setup Guide

This guide covers the complete setup for deploying the Israeli Law RAG Chatbot to Vercel.

## Part 1: Create Vercel Account and Project

### Step 1: Create a Vercel Account

1. Go to [Vercel Sign Up](https://vercel.com/signup)
2. Sign up using one of the following methods:
   - **GitHub** (recommended) - Provides seamless integration
   - Google account
   - GitLab
   - Bitbucket
   - Email
3. Complete the account setup process
4. Verify your email if required

### Step 2: Create a New Vercel Project

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New..."** > **"Project"**
3. Import your Git repository:
   - If using GitHub (recommended), click **"Import Git Repository"**
   - Select the `RAG` repository from the list
   - If you don't see it, click **"Adjust GitHub App Permissions"** to grant access
4. Configure the project:
   - **Project Name**: `israeli-law-rag` (or your preferred name)
   - **Framework Preset**: Select **Vue.js** (should be auto-detected)
   - **Root Directory**: Leave as `.` (root)
   - **Build Command**: `npm run build` (from vercel.json)
   - **Output Directory**: `frontend/dist` (from vercel.json)
   - **Install Command**: `npm install` (from vercel.json)

### Step 3: Configure Environment Variables

Before deploying, add the required environment variables. This is a critical step - the application will not function without these credentials.

#### Environment Variables Overview

| Variable | Required | Description | Example Format |
|----------|----------|-------------|----------------|
| `ANTHROPIC_API_KEY` | **Yes** | Your Anthropic Claude API key | `sk-ant-api03-...` |
| `QDRANT_URL` | **Yes** | Qdrant Cloud cluster URL with port | `https://xxx-xxx.us-east.aws.cloud.qdrant.io:6333` |
| `QDRANT_API_KEY` | **Yes** | Qdrant Cloud API key | Long alphanumeric string |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `ALLOWED_ORIGINS` | Optional | Allowed CORS origins (comma-separated) | `https://israeli-law-rag.vercel.app` |

#### Method A: Via Vercel Dashboard (Recommended)

1. Go to your project at [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click on your project (e.g., `israeli-law-rag`)
3. Navigate to **Settings** tab at the top
4. Click **Environment Variables** in the left sidebar
5. For each variable:

   **Adding `ANTHROPIC_API_KEY`:**
   - Click **"Add New"** or **"Add"** button
   - **Key**: Enter `ANTHROPIC_API_KEY`
   - **Value**: Paste your Claude API key (starts with `sk-ant-`)
   - **Environment**: Check all three boxes ☑️ Production, ☑️ Preview, ☑️ Development
   - Click **"Save"**

   **Adding `QDRANT_URL`:**
   - Click **"Add New"**
   - **Key**: Enter `QDRANT_URL`
   - **Value**: Paste your Qdrant cluster URL (e.g., `https://abc123-xyz.us-east.aws.cloud.qdrant.io:6333`)
   - **Environment**: ☑️ Production, ☑️ Preview, ☑️ Development
   - Click **"Save"**

   **Adding `QDRANT_API_KEY`:**
   - Click **"Add New"**
   - **Key**: Enter `QDRANT_API_KEY`
   - **Value**: Paste your Qdrant API key
   - **Environment**: ☑️ Production, ☑️ Preview, ☑️ Development
   - Click **"Save"**

   **Adding `DATABASE_URL`:**
   - Click **"Add New"**
   - **Key**: Enter `DATABASE_URL`
   - **Value**: Paste your PostgreSQL connection string
   - **Environment**: ☑️ Production, ☑️ Preview, ☑️ Development
   - Click **"Save"**

   **Adding `ALLOWED_ORIGINS` (optional):**
   - Click **"Add New"**
   - **Key**: Enter `ALLOWED_ORIGINS`
   - **Value**: Your production URL (e.g., `https://israeli-law-rag.vercel.app`)
   - **Environment**: ☑️ Production only (you may want different values per environment)
   - Click **"Save"**

6. Verify all variables are listed in the Environment Variables page

#### Method B: Via Vercel CLI

If you prefer the command line:

```bash
# Install Vercel CLI if not already installed
npm install -g vercel

# Login to Vercel
vercel login

# Link to your project (run from project root)
vercel link

# Add secrets interactively (you'll be prompted for values)
vercel env add ANTHROPIC_API_KEY
# Select: Production, Preview, Development
# Paste your API key when prompted

vercel env add QDRANT_URL
# Select: Production, Preview, Development
# Paste your Qdrant URL when prompted

vercel env add QDRANT_API_KEY
# Select: Production, Preview, Development
# Paste your Qdrant API key when prompted

vercel env add DATABASE_URL
# Select: Production, Preview, Development
# Paste your database URL when prompted

vercel env add ALLOWED_ORIGINS
# Select: Production (or all environments)
# Enter your allowed origins

# Verify all variables are set
vercel env ls
```

#### How Environment Variables Work

When you add environment variables through the Vercel dashboard (or CLI), they are automatically available to your serverless functions at runtime via `process.env`. No additional configuration in `vercel.json` is needed for the variables to be accessible.

**Important**: The environment variables you add in the Vercel dashboard must match the exact names expected by the application:
- `ANTHROPIC_API_KEY`
- `QDRANT_URL`
- `QDRANT_API_KEY`
- `DATABASE_URL`
- `ALLOWED_ORIGINS` (optional)

#### Obtaining Credentials

If you don't have credentials yet, see:
- **Anthropic API Key**: [documentation/CREDENTIALS.md](../documentation/CREDENTIALS.md#anthropic-api-key) or [console.anthropic.com](https://console.anthropic.com/)
- **Qdrant Credentials**: [documentation/QDRANT_CLOUD_SETUP.md](../documentation/QDRANT_CLOUD_SETUP.md) or [cloud.qdrant.io](https://cloud.qdrant.io/)
- **Database URL**: [documentation/CREDENTIALS.md](../documentation/CREDENTIALS.md#postgresql-database-url)

### Step 4: Deploy the Project

1. Click **"Deploy"** to trigger the initial deployment
2. Wait for the build to complete (usually 1-3 minutes)
3. Once deployed, you'll receive a production URL like:
   - `https://israeli-law-rag.vercel.app`
   - Or `https://israeli-law-rag-[username].vercel.app`

### Step 5: Verify Deployment

1. Visit your deployment URL
2. Check that the frontend loads correctly
3. Test an API endpoint:
   ```
   https://your-url.vercel.app/api/health
   ```

---

## Part 2: Configure Preview Deployments

This project is configured with automatic preview deployments for pull requests using GitHub Actions.

## Required GitHub Secrets

Add the following secrets to your GitHub repository (Settings > Secrets and variables > Actions):

### 1. `VERCEL_TOKEN`

Generate a Vercel access token:
1. Go to [Vercel Account Settings](https://vercel.com/account/tokens)
2. Click "Create" to create a new token
3. Name it (e.g., "GitHub Actions")
4. Copy the token and add it as a GitHub secret

### 2. `VERCEL_ORG_ID`

Get your Vercel organization/team ID:
1. Go to [Vercel Team Settings](https://vercel.com/teams) (or personal account settings)
2. Copy the Team ID from the URL or settings page

Or use the Vercel CLI:
```bash
vercel link
cat .vercel/project.json
```

### 3. `VERCEL_PROJECT_ID`

Get your Vercel project ID:
1. Go to your project on Vercel dashboard
2. Navigate to Settings > General
3. Copy the Project ID

Or use the Vercel CLI:
```bash
vercel link
cat .vercel/project.json
```

## How It Works

1. When a PR is opened, updated, or reopened, the GitHub Action triggers
2. The action builds the project using Vercel's build system
3. Deploys to a unique preview URL
4. Posts a comment on the PR with the preview URL
5. Updates the same comment on subsequent pushes

## Preview URL Format

Preview deployments use the format:
```
https://<project>-<unique-id>-<team>.vercel.app
```

## Troubleshooting

### Build Failures
- Check that all environment variables are set in Vercel project settings
- Verify Node.js version compatibility (requires Node 20+)

### Missing Secrets
- Ensure all three secrets are configured: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
- Secrets are case-sensitive

### Permission Issues
- The workflow requires `pull-requests: write` permission to comment on PRs
- This is already configured in the workflow file

---

## Part 3: Post-Setup Configuration

### Enable Production Deployments

Production deployments are automatically enabled for the `main` branch via `vercel.json`:

```json
{
  "git": {
    "deploymentEnabled": {
      "main": true,
      "master": true
    }
  }
}
```

### Function Limits

Serverless functions are configured in `vercel.json` with:
- **Max Duration**: 30 seconds (sufficient for RAG queries)
- **Memory**: 1024 MB (required for embedding model)

```json
{
  "functions": {
    "api/**/*.ts": {
      "maxDuration": 30,
      "memory": 1024
    }
  }
}
```

### Custom Domain (Optional)

To add a custom domain:
1. Go to **Settings** > **Domains**
2. Click **"Add"**
3. Enter your domain name
4. Follow DNS configuration instructions
5. Wait for SSL certificate provisioning

See `documentation/CUSTOM_DOMAIN_SETUP.md` for detailed instructions.

---

## Part 4: Vercel CLI Setup (Alternative Method)

You can also set up the project using the Vercel CLI:

### Install Vercel CLI

```bash
npm install -g vercel
```

### Link Project

```bash
# Login to Vercel
vercel login

# Link existing project or create new one
vercel link

# This creates .vercel/project.json with:
# - projectId
# - orgId
```

### Deploy from CLI

```bash
# Preview deployment
vercel

# Production deployment
vercel --prod
```

### Pull Environment Variables

```bash
# Pull env vars for local development
vercel env pull .env.local
```

---

## Configuration Files Reference

| File | Purpose |
|------|---------|
| `vercel.json` | Main Vercel configuration |
| `.github/workflows/preview.yml` | GitHub Actions for preview deployments |
| `.github/VERCEL_SETUP.md` | This setup guide |

---

## Checklist

Use this checklist to ensure complete setup:

### Initial Setup
- [ ] Created Vercel account
- [ ] Created Vercel project
- [ ] Linked GitHub repository

### Environment Variables (Required for API Functions)
- [ ] `ANTHROPIC_API_KEY` - Claude API key from [console.anthropic.com](https://console.anthropic.com/)
  - [ ] Added to Production environment
  - [ ] Added to Preview environment
  - [ ] Added to Development environment
- [ ] `QDRANT_URL` - Qdrant cluster URL (include `:6333` port)
  - [ ] Added to Production environment
  - [ ] Added to Preview environment
  - [ ] Added to Development environment
- [ ] `QDRANT_API_KEY` - Qdrant API key from cluster dashboard
  - [ ] Added to Production environment
  - [ ] Added to Preview environment
  - [ ] Added to Development environment
- [ ] `DATABASE_URL` - PostgreSQL connection string
  - [ ] Added to Production environment
  - [ ] Added to Preview environment
  - [ ] Added to Development environment
- [ ] `ALLOWED_ORIGINS` (optional) - CORS allowed origins
  - [ ] Added to Production environment

### Deployment Verification
- [ ] Completed initial deployment
- [ ] Verified deployment URL works
- [ ] Tested `/api/health` endpoint returns success (when implemented)

### Preview Deployments (GitHub Actions)
- [ ] Added GitHub secrets:
  - [ ] `VERCEL_TOKEN` - From Vercel account settings
  - [ ] `VERCEL_ORG_ID` - From Vercel project settings
  - [ ] `VERCEL_PROJECT_ID` - From Vercel project settings
- [ ] Tested preview deployment on a PR

### Verification Commands
```bash
# Verify environment variables are set (CLI)
vercel env ls

# Pull env vars for local development
vercel env pull .env.local

# Test a deployment
vercel --prod
```

---

*Last updated: January 2025*
