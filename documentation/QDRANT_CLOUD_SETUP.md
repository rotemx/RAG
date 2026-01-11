# Qdrant Cloud Setup Guide

This guide walks you through setting up Qdrant Cloud for the Israeli Law RAG Chatbot project.

## Table of Contents

- [Task 1.3.1: Create Qdrant Cloud Account (Free Tier)](#task-131-create-qdrant-cloud-account-free-tier)
- [Task 1.3.2: Create Cluster with Appropriate Settings](#task-132-create-cluster-with-appropriate-settings)

---

## Task 1.3.1: Create Qdrant Cloud Account (Free Tier)

### Step 1: Navigate to Qdrant Cloud

1. Go to [https://cloud.qdrant.io/](https://cloud.qdrant.io/)
2. Click **"Get Started Free"** or **"Sign Up"**

### Step 2: Create an Account

Choose one of the following sign-up methods:

- **Google Account** (recommended for quick setup)
- **GitHub Account**
- **Email and Password**

### Step 3: Verify Your Email

If you signed up with email:
1. Check your inbox for a verification email from Qdrant
2. Click the verification link
3. Return to the Qdrant Cloud dashboard

### Step 4: Confirm Free Tier Selection

The free tier includes:
- **1 GB** of storage
- **1 cluster**
- Shared infrastructure
- Community support

This is sufficient for the Israeli Law RAG project (~3,900 documents).

### Step 5: Access the Dashboard

Once logged in, you should see the Qdrant Cloud dashboard where you can:
- Create clusters
- Manage API keys
- Monitor usage

## Free Tier Limits

| Resource | Limit |
|----------|-------|
| Storage | 1 GB |
| Clusters | 1 |
| Vectors | ~500,000 (depends on dimensions) |
| API Rate | Reasonable use |

## Next Steps

After completing account creation:

1. **Task 1.3.2**: Create cluster with appropriate settings
2. **Task 1.3.3**: Create `israeli_laws` collection
3. **Task 1.3.4**: Create payload indexes for filtering
4. **Task 1.3.5**: Document connection credentials securely

---

## Task 1.3.2: Create Cluster with Appropriate Settings

### Step 1: Navigate to Cluster Creation

1. In the Qdrant Cloud dashboard, click **"Create Cluster"** or **"+ New Cluster"**
2. You will be presented with cluster configuration options

### Step 2: Select Free Tier

1. Choose the **Free** tier plan
2. The free tier provides:
   - 1 GB storage
   - Shared infrastructure
   - Single node
   - Perfect for development and demonstration

### Step 3: Configure Cluster Settings

#### Cluster Name
- **Name**: `israeli-law-rag` (or similar descriptive name)
- Use lowercase letters, numbers, and hyphens only

#### Region Selection
Choose a region closest to your deployment location:
- **Recommended for Vercel**: `aws-us-east-1` or `gcp-us-east1`
- This minimizes latency between your Vercel serverless functions and Qdrant

#### Node Configuration (Free Tier)
The free tier has fixed settings:
- **RAM**: 1 GB (shared)
- **vCPUs**: Shared
- **Disk**: 1 GB

### Step 4: Create the Cluster

1. Review your configuration
2. Click **"Create"** or **"Create Cluster"**
3. Wait for cluster provisioning (typically 1-2 minutes)

### Step 5: Verify Cluster Status

1. The cluster status should show **"Running"** (green indicator)
2. Note the cluster URL, which will be in the format:
   ```
   https://<cluster-id>.us-east.aws.cloud.qdrant.io:6333
   ```

### Step 6: Generate API Key

1. Navigate to **"API Keys"** or **"Access Management"** in the cluster settings
2. Click **"Create API Key"**
3. Configure the API key:
   - **Name**: `israeli-law-rag-api-key`
   - **Permissions**: Full access (read/write) for development
4. **IMPORTANT**: Copy and securely store the API key immediately - it won't be shown again

### Step 7: Configure Environment Variables

Add the following to your `.env.local` file:

```bash
# Qdrant Cloud Configuration
QDRANT_URL=https://<your-cluster-id>.<region>.cloud.qdrant.io:6333
QDRANT_API_KEY=<your-api-key>
```

Replace:
- `<your-cluster-id>` with your actual cluster ID
- `<region>` with your cluster region (e.g., `us-east.aws`)
- `<your-api-key>` with the API key you generated

### Step 8: Verify Connection

Use the following curl command to verify your cluster is accessible:

```bash
curl -X GET "${QDRANT_URL}/collections" \
  -H "api-key: ${QDRANT_API_KEY}" \
  -H "Content-Type: application/json"
```

Expected response (empty collections list):
```json
{
  "result": {
    "collections": []
  },
  "status": "ok",
  "time": 0.001
}
```

### Cluster Configuration Summary

| Setting | Value | Rationale |
|---------|-------|-----------|
| Tier | Free | Sufficient for ~500K vectors with 1024 dimensions |
| Region | aws-us-east-1 | Low latency to Vercel serverless |
| Storage | 1 GB | Handles ~3,900 law documents |
| Name | israeli-law-rag | Descriptive and project-specific |

### Programmatic Cluster Verification

You can also verify the cluster connection programmatically using the TypeScript client. See `lib/src/qdrant/client.ts` for the Qdrant client configuration.

### Capacity Planning

For the Israeli Law RAG project:
- **Documents**: ~3,900 law PDFs
- **Estimated chunks**: ~40,000 (averaging 10 chunks per document)
- **Vector dimensions**: 1024 (e5-large)
- **Vector storage**: ~40,000 × 1024 × 4 bytes = ~164 MB
- **Payload storage**: ~200 MB (metadata, text snippets)
- **Total estimated**: ~400 MB (well within 1 GB free tier)

## Troubleshooting

### Account Creation Issues

- **Email not received**: Check spam/junk folder, or try a different email provider
- **OAuth fails**: Try a different sign-in method (Google/GitHub/Email)
- **Page not loading**: Try a different browser or disable ad blockers

### Free Tier Exhausted

If you exceed the 1 GB limit:
1. Delete unused collections
2. Reduce vector dimensions
3. Consider upgrading to paid tier

## Security Notes

- Store API keys in environment variables, never in code
- Use `.env.local` for local development
- Add credentials to Vercel environment variables for production
- Never commit API keys to git

---

*Created for Israeli Law RAG Chatbot Project - January 2025*
