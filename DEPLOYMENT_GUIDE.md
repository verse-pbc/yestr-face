# Yestr Face - Deployment Guide for Non-DevOps Users

This guide will walk you through deploying the Yestr Face profile picture proxy server to Cloudflare Workers step by step.

## Prerequisites

Before starting, you'll need:
1. A Cloudflare account (free tier is fine to start)
2. Node.js installed on your computer (version 16 or higher)
3. A credit card (R2 storage requires adding a payment method, but has generous free tier)

## Step 1: Set Up Your Cloudflare Account

### 1.1 Create a Cloudflare Account
1. Go to https://dash.cloudflare.com/sign-up
2. Enter your email and password
3. Verify your email address

### 1.2 Add a Payment Method (Required for R2)
1. In the Cloudflare dashboard, click on your account name (top right)
2. Go to "Billing"
3. Add a payment method (you won't be charged unless you exceed free tier limits)

### 1.3 Note Your Account ID
1. Go to any domain in your account (or Workers & Pages)
2. On the right sidebar, find and copy your "Account ID"
3. Save this for later - you'll need it!

## Step 2: Enable Cloudflare R2 Storage

### 2.1 Create an R2 Bucket
1. In the Cloudflare dashboard, go to "R2" in the left sidebar
2. Click "Create bucket"
3. Name it: `yestr-avatars`
4. Location: Choose "Automatic"
5. Click "Create bucket"

### 2.2 Create R2 API Token
1. In R2 dashboard, click "Manage R2 API Tokens"
2. Click "Create API token"
3. Name it: `yestr-face-token`
4. Permissions: Select "Object Read & Write"
5. Specify bucket: Select "yestr-avatars"
6. Click "Create API Token"
7. **IMPORTANT**: Copy and save the token details:
   - Token value
   - Access Key ID
   - Secret Access Key
   
   **You won't be able to see these again!**

## Step 3: Create a KV Namespace

### 3.1 Set Up Workers KV
1. In the Cloudflare dashboard, go to "Workers & Pages" → "KV"
2. Click "Create namespace"
3. Name it: `yestr-profiles`
4. Click "Add"
5. Copy the namespace ID (you'll need this later)

## Step 4: Install Development Tools

### 4.1 Install Wrangler CLI
Open your terminal/command prompt and run:
```bash
npm install -g wrangler
```

### 4.2 Login to Cloudflare
```bash
wrangler login
```
This will open your browser - click "Allow" to authorize Wrangler.

## Step 5: Deploy the Worker

### 5.1 Navigate to Project Directory
```bash
cd /path/to/tinder-swipe/yestr-face
```

### Alternative: Use the Setup Script
We've included a setup script that automates most of these steps:
```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

### 5.2 Install Dependencies
```bash
npm install
```

### 5.3 Configure Wrangler
The project includes a `wrangler.toml` file. Update it with your IDs:

1. Open `wrangler.toml` in a text editor
2. Replace these placeholders:
   - `YOUR_ACCOUNT_ID` → Your Cloudflare account ID from Step 1.3
   - `YOUR_KV_NAMESPACE_ID` → Your KV namespace ID from Step 3.1

### 5.4 Set Secret Environment Variables
Run these commands, replacing with your actual values:

```bash
# Set your R2 credentials
wrangler secret put R2_ACCESS_KEY_ID
# Paste your Access Key ID and press Enter

wrangler secret put R2_SECRET_ACCESS_KEY
# Paste your Secret Access Key and press Enter

# Optional: Set allowed origins (defaults to allowing all)
wrangler secret put ALLOWED_ORIGINS
# Enter: https://yestr.app,https://www.yestr.app,http://localhost:3000
```

### 5.5 Deploy the Worker
```bash
wrangler deploy
```

You should see output like:
```
Published yestr-face (1.0.0)
  https://yestr-face.YOUR-SUBDOMAIN.workers.dev
```

Copy this URL - this is your worker's endpoint!

## Step 6: Test Your Deployment

### 6.1 Check Health Endpoint
Open your browser and go to:
```
https://yestr-face.YOUR-SUBDOMAIN.workers.dev/health
```

You should see a JSON response like:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "r2": "connected",
  "kv": "connected"
}
```

### 6.2 Test Profile Picture Proxy
Try fetching a profile picture:
```
https://yestr-face.YOUR-SUBDOMAIN.workers.dev/avatar/e0f6050d930a61323bac4a5b47d58e961da2919834f3f58f3b312c2918852b55
```

## Step 7: Configure Custom Domain (Optional)

### 7.1 Add Custom Domain
1. In Workers & Pages, find your worker
2. Go to "Settings" → "Triggers"
3. Click "Add Custom Domain"
4. Enter: `avatars.yestr.app` (or your preferred subdomain)
5. Follow the DNS configuration instructions

## Step 8: Set Up Monitoring

### 8.1 Enable Logpush (Optional)
1. Go to your worker's settings
2. Click on "Logs"
3. Enable "Real-time logs" for debugging

### 8.2 Set Up Email Alerts
1. Go to your worker's settings
2. Click on "Analytics"
3. Set up email alerts for error rates > 1%

## Step 9: Update Yestr App

Update your Yestr app to use the new proxy:

### 9.1 Update Image URLs
In your Yestr app configuration, set:
```javascript
const AVATAR_PROXY_URL = 'https://yestr-face.YOUR-SUBDOMAIN.workers.dev';
// or if using custom domain:
const AVATAR_PROXY_URL = 'https://avatars.yestr.app';
```

## Maintenance Tasks

### Daily Monitoring
- Check the Workers dashboard for errors
- Monitor R2 storage usage

### Weekly Tasks
- Review analytics for performance
- Check KV storage size

### Monthly Tasks
- Review Cloudflare billing
- Update dependencies if needed

## Troubleshooting

### Worker Returns 500 Error
1. Check real-time logs in Workers dashboard
2. Verify R2 credentials are correct
3. Ensure KV namespace is properly bound

### Images Not Loading
1. Check browser console for CORS errors
2. Verify ALLOWED_ORIGINS includes your domain
3. Test the direct worker URL first

### High Costs
1. Enable caching headers (should be automatic)
2. Implement rate limiting (contact developer)
3. Review R2 storage for orphaned images

## Cost Estimates

### Free Tier Limits
- Workers: 100,000 requests/day
- R2 Storage: 10GB stored
- R2 Operations: 1M reads/month
- KV: 100,000 reads/day

### Estimated Costs for 10,000 Active Users
- Workers: $0 (under free tier)
- R2 Storage: ~$0.15/month for 50GB
- R2 Operations: ~$0.36/month
- **Total: Less than $1/month**

## Getting Help

### Resources
- Cloudflare Workers Discord: https://discord.gg/cloudflaredev
- Workers Documentation: https://developers.cloudflare.com/workers/
- R2 Documentation: https://developers.cloudflare.com/r2/

### Common Issues
1. **"Wrangler not found"** - Make sure Node.js is installed and restart terminal
2. **"Authentication error"** - Run `wrangler login` again
3. **"R2 binding not found"** - Check wrangler.toml configuration

## Security Checklist

- [ ] R2 bucket is not publicly accessible
- [ ] API tokens are stored as secrets, not in code
- [ ] ALLOWED_ORIGINS is configured for production
- [ ] Rate limiting is enabled (automatic in code)
- [ ] Monitoring alerts are configured

## Next Steps

After successful deployment:
1. Test with a few profile pictures
2. Monitor for 24 hours
3. Update Yestr app to use the proxy
4. Gradually roll out to all users

Congratulations! Your profile picture proxy is now live and serving images with proper CORS headers!