# Custom Domain Setup Guide

This guide explains how to configure a custom domain for the Israeli Law RAG Chatbot deployed on Vercel.

## Prerequisites

- Vercel project already deployed (Task 1.2.1 completed)
- A registered domain name
- Access to your domain's DNS settings

## Step 1: Add Domain in Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select the **israeli-law-rag** project
3. Navigate to **Settings** → **Domains**
4. Click **Add Domain**
5. Enter your domain name (e.g., `israeli-law.example.com` or `example.com`)

## Step 2: Configure DNS Records

Vercel will provide DNS configuration instructions. Common setups:

### Option A: Apex Domain (example.com)

Add an **A record** pointing to Vercel's IP:

```
Type: A
Name: @
Value: 76.76.21.21
TTL: 3600 (or Auto)
```

### Option B: Subdomain (app.example.com)

Add a **CNAME record** pointing to your Vercel deployment:

```
Type: CNAME
Name: app (or your subdomain)
Value: cname.vercel-dns.com
TTL: 3600 (or Auto)
```

### Option C: Using Vercel Nameservers (Recommended for Apex)

For apex domains, you can delegate to Vercel nameservers for automatic SSL and configuration:

1. In your domain registrar, update nameservers to:
   - `ns1.vercel-dns.com`
   - `ns2.vercel-dns.com`

## Step 3: Verify Domain

1. Return to Vercel Dashboard → **Settings** → **Domains**
2. Wait for DNS propagation (can take up to 48 hours, usually minutes)
3. Vercel will show a green checkmark when verified

## Step 4: SSL Certificate

Vercel automatically provisions SSL certificates via Let's Encrypt. No additional configuration needed.

## Step 5: Configure Redirects (Optional)

To redirect `www` to apex domain (or vice versa), add in `vercel.json`:

```json
{
  "redirects": [
    {
      "source": "/",
      "has": [
        {
          "type": "host",
          "value": "www.example.com"
        }
      ],
      "destination": "https://example.com",
      "permanent": true
    }
  ]
}
```

## Recommended Domain Structure

For this project, consider:

| Domain | Use Case |
|--------|----------|
| `israeli-law-rag.vercel.app` | Default Vercel domain (always available) |
| `law.yourdomain.com` | Production subdomain |
| `preview-*.yourdomain.com` | Preview deployments (optional wildcard) |

## Environment-Specific Domains

Vercel supports different domains per environment:

- **Production**: Your custom domain
- **Preview**: `*.vercel.app` subdomains for PR previews
- **Development**: `localhost:3000`

## Troubleshooting

### Domain Not Verifying

1. Check DNS propagation: [dnschecker.org](https://dnschecker.org)
2. Ensure no conflicting records exist
3. Wait up to 48 hours for propagation

### SSL Certificate Issues

- SSL is automatic; if issues persist, remove and re-add the domain
- Check for CAA records that might block Let's Encrypt

### Mixed Content Warnings

- Ensure all API calls use relative URLs or respect the current protocol
- The current `vercel.json` configuration handles this correctly

## Cost Considerations

- Vercel provides free SSL certificates
- Custom domains are included in all Vercel plans (including free tier)
- No additional cost for domain configuration in Vercel

## Additional Resources

- [Vercel Custom Domains Documentation](https://vercel.com/docs/projects/domains)
- [Vercel DNS Documentation](https://vercel.com/docs/projects/domains/vercel-dns)
- [SSL Certificate Troubleshooting](https://vercel.com/docs/projects/domains/working-with-ssl-certificates)

---

*Note: This task is marked as optional. The default `*.vercel.app` domain is fully functional for demonstration purposes.*
