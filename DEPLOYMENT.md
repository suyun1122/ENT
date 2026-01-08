# Deployment Guide - Vercel Blob Storage Migration

This guide helps you migrate your surgical tool detection app to Vercel with Blob Storage.

## Overview

The app currently stores data in two locations:
- **Videos**: `public/videos/` (221MB) - ⚠️ Will cause deployment failure
- **JSON Data**: `public/analysis/`, `public/detections/` - Will be read-only after deployment

**Solution**:
- Videos are already served via Twelve Labs HLS streaming (no changes needed)
- Migrate JSON files to Vercel Blob Storage for read/write access in production

## Prerequisites

1. **Vercel Account**: Create one at [vercel.com](https://vercel.com)
2. **Vercel Blob Storage**: Enable in your Vercel dashboard
3. **Environment Variables**: You'll need these API keys:
   - `TWELVELABS_API_KEY`
   - `BLOB_READ_WRITE_TOKEN`

## Step-by-Step Deployment

### Step 1: Get Vercel Blob Storage Token

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Navigate to **Storage** → **Create Database** → **Blob**
3. Create a new Blob store (or use existing)
4. Go to **Settings** → **Tokens** → **Create Token**
5. Copy the `BLOB_READ_WRITE_TOKEN`

### Step 2: Migrate JSON Files to Blob Storage

Run the migration script to upload existing analysis and detection files:

```bash
cd frontend

# Set your Blob token
export BLOB_READ_WRITE_TOKEN="vercel_blob_rw_xxxxxxxxxxxxx"

# Run migration
npm run migrate:blob
```

**Expected Output:**
```
=== Vercel Blob Storage Migration ===

✓ BLOB_READ_WRITE_TOKEN found

Uploading Analysis Files (4 files)
✓ Uploaded: analysis/6911d69bf141b311b3b9fbbb.json
✓ Uploaded: analysis/69129bb45126c58641e4d164.json
✓ Uploaded: analysis/6940bcd7fa043d83a4915323.json
✓ Uploaded: analysis/695231aa9f7b96b9f6cfc2ce.json

Uploading Detection Files (3 files)
✓ Uploaded: detections/695231aa9f7b96b9f6cfc2ce.json
✓ Uploaded: detections/6940bcd7fa043d83a4915323.json
✓ Uploaded: detections/6911d69bf141b311b3b9fbbb.json

=== Migration Summary ===
ℹ Total files uploaded: 7
✓ All files uploaded successfully!
```

### Step 3: Verify Blob Storage

1. Go to [Vercel Dashboard](https://vercel.com/dashboard) → **Storage** → **Blob**
2. You should see folders:
   - `analysis/` with 4 JSON files
   - `detections/` with 3 JSON files

### Step 4: Configure Environment Variables in Vercel

1. Go to your Vercel project → **Settings** → **Environment Variables**
2. Add the following variables for all environments (Production, Preview, Development):

| Variable | Value | Description |
|----------|-------|-------------|
| `TWELVELABS_API_KEY` | `tlk_xxxxx` | Your Twelve Labs API key |
| `BLOB_READ_WRITE_TOKEN` | `vercel_blob_rw_xxxxx` | Token from Step 1 |

### Step 5: Deploy to Vercel

#### Option A: Deploy via Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **Add New** → **Project**
3. Import your Git repository
4. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: Leave default (`.next`)
5. Click **Deploy**

#### Option B: Deploy via CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy (from frontend directory)
cd frontend
vercel --prod
```

### Step 6: Verify Deployment

1. Open your deployed app URL
2. Check that:
   - ✅ Videos load correctly (from Twelve Labs HLS)
   - ✅ Existing analysis data shows up (from Blob Storage)
   - ✅ Tool detection data displays properly
   - ✅ Refresh buttons work (should fetch new data from Twelve Labs API)

### Step 7: Test Refresh Functionality

1. Click on any video
2. Go to **Timeline** or **SOAP Note** tab
3. Click the **Refresh** button
4. Verify:
   - ✅ New data is fetched from Twelve Labs API
   - ✅ Data is saved to Blob Storage (check Vercel Dashboard)
   - ✅ Data persists on page reload

## Data Flow in Production

### Initial Load (Existing Videos)
```
1. Frontend requests data → GET /api/analysis/{videoId}
2. API checks: Blob Storage → Returns cached data
3. If not in Blob → Returns 'not_found'
```

### Refresh Button
```
1. User clicks Refresh → POST /api/analysis/{videoId}?force=true
2. API deletes cached files from Blob Storage
3. API calls Twelve Labs API for fresh analysis
4. API saves new results to Blob Storage
5. Frontend displays updated data
```

### New Video Upload
```
1. User uploads video → Twelve Labs API
2. Tool detection runs → Results saved to Blob Storage
3. Analysis runs → Results saved to Blob Storage
```

## Cleanup (Optional)

After successful deployment, you can clean up local files:

```bash
# Remove video files (already using Twelve Labs HLS)
rm -rf frontend/public/videos/

# Optional: Remove JSON files (now in Blob Storage)
# Only do this after verifying deployment works!
# rm -rf frontend/public/analysis/
# rm -rf frontend/public/detections/
```

**Note**: The `.vercelignore` file already excludes `public/videos/` from deployment to save space.

## Troubleshooting

### Error: "BLOB_READ_WRITE_TOKEN is required"

- Make sure you've set the environment variable in Vercel Dashboard
- Redeploy after adding the variable

### Error: "Failed to fetch from Vercel Blob"

- Check that the token has read/write permissions
- Verify the token is set for the correct environment (Production/Preview)

### Videos not loading

- Verify `TWELVELABS_API_KEY` is set correctly
- Check browser console for API errors
- Ensure videos are indexed in Twelve Labs

### Refresh button doesn't work

- Check that `BLOB_READ_WRITE_TOKEN` is set
- Verify the API route has proper permissions
- Check Vercel function logs for errors

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     User's Browser                      │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Next.js App (Vercel)                       │
│  ┌──────────────────────────────────────────────────┐  │
│  │  API Routes                                       │  │
│  │  - /api/analysis/[videoId]                       │  │
│  │  - /api/detect-tools/[videoId]                   │  │
│  │  - /api/video                                     │  │
│  └─────────────┬────────────────────────────────────┘  │
└────────────────┼────────────────────────────────────────┘
                 │
        ┌────────┼────────┐
        │        │        │
        ▼        ▼        ▼
┌──────────┐ ┌─────────┐ ┌────────────────┐
│ Twelve   │ │ Vercel  │ │ Static Files   │
│ Labs API │ │ Blob    │ │ (Read-only)    │
│          │ │ Storage │ │                │
│ - Videos │ │ - JSON  │ │ - Fallback     │
│ - HLS    │ │ - R/W   │ │   data         │
│ - AI     │ │         │ │                │
└──────────┘ └─────────┘ └────────────────┘
```

## Cost Estimates

### Vercel (Pro Plan ~$20/month)
- **Bandwidth**: Videos served via Twelve Labs (no cost)
- **Blob Storage**: ~1MB of JSON files (minimal cost)
- **Function Executions**: AI analysis on-demand

### Twelve Labs
- **Video indexing**: Per video uploaded
- **API calls**: Analysis queries (refresh, search)
- Refer to [Twelve Labs pricing](https://www.twelvelabs.io/pricing)

## Support

For issues or questions:
- **Vercel**: https://vercel.com/support
- **Twelve Labs**: https://docs.twelvelabs.io
- **Project Issues**: [GitHub Issues](https://github.com/your-repo/issues)
