# Migration Scripts

## migrate-to-blob.js

Uploads existing JSON files (analysis and tool detection results) from `public/` directory to Vercel Blob Storage.

### Quick Start

```bash
# Get your Blob token from Vercel Dashboard:
# https://vercel.com/dashboard → Storage → Blob → Settings → Create Token

# Set the token
export BLOB_READ_WRITE_TOKEN="vercel_blob_rw_xxxxxxxxxxxxx"

# Run migration
npm run migrate:blob
```

### What it does

1. ✅ Uploads all files from `public/analysis/*.json` to Blob Storage
2. ✅ Uploads all files from `public/detections/*.json` to Blob Storage
3. ✅ Verifies all uploads completed successfully
4. ✅ Provides next steps for deployment

### After Migration

1. Verify files in Vercel Dashboard → Storage → Blob
2. Set `BLOB_READ_WRITE_TOKEN` in Vercel project environment variables
3. Deploy to Vercel
4. (Optional) Remove local JSON files after confirming deployment works

See [DEPLOYMENT.md](../../DEPLOYMENT.md) for full deployment guide.
