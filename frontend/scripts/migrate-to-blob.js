#!/usr/bin/env node

/**
 * Migration script to upload existing JSON files to Vercel Blob Storage
 *
 * This script:
 * 1. Uploads all analysis/*.json files to Vercel Blob
 * 2. Uploads all detections/*.json files to Vercel Blob
 * 3. Validates that all files were uploaded successfully
 *
 * Usage:
 *   BLOB_READ_WRITE_TOKEN=your_token node scripts/migrate-to-blob.js
 *
 * Prerequisites:
 *   - Set BLOB_READ_WRITE_TOKEN environment variable
 *   - Install dependencies: npm install @vercel/blob
 */

import { put, list } from '@vercel/blob';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PUBLIC_DIR = join(__dirname, '..', 'public');
const ANALYSIS_DIR = join(PUBLIC_DIR, 'analysis');
const DETECTIONS_DIR = join(PUBLIC_DIR, 'detections');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✓ ${message}`, colors.green);
}

function logError(message) {
  log(`✗ ${message}`, colors.red);
}

function logInfo(message) {
  log(`ℹ ${message}`, colors.cyan);
}

function logWarning(message) {
  log(`⚠ ${message}`, colors.yellow);
}

async function uploadFile(localPath, blobPath) {
  try {
    const fileContent = readFileSync(localPath);
    const blob = await put(blobPath, fileContent, {
      access: 'public',
      contentType: 'application/json',
    });

    logSuccess(`Uploaded: ${blobPath} -> ${blob.url}`);
    return { success: true, url: blob.url };
  } catch (error) {
    logError(`Failed to upload ${blobPath}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function uploadDirectory(localDir, blobPrefix, label) {
  if (!existsSync(localDir)) {
    logWarning(`Directory ${localDir} does not exist. Skipping.`);
    return { uploaded: 0, failed: 0 };
  }

  const files = readdirSync(localDir).filter(f => f.endsWith('.json'));

  if (files.length === 0) {
    logWarning(`No JSON files found in ${localDir}`);
    return { uploaded: 0, failed: 0 };
  }

  log(`\n${colors.bright}Uploading ${label} (${files.length} files)${colors.reset}`);

  let uploaded = 0;
  let failed = 0;

  for (const file of files) {
    const localPath = join(localDir, file);
    const blobPath = `${blobPrefix}/${file}`;

    const result = await uploadFile(localPath, blobPath);
    if (result.success) {
      uploaded++;
    } else {
      failed++;
    }
  }

  return { uploaded, failed };
}

async function verifyUploads() {
  logInfo('\nVerifying uploads...');

  try {
    const { blobs } = await list();

    const analysisBlobsCount = blobs.filter(b => b.pathname.startsWith('analysis/')).length;
    const detectionsBlobsCount = blobs.filter(b => b.pathname.startsWith('detections/')).length;

    logInfo(`Found ${analysisBlobsCount} analysis files in Blob Storage`);
    logInfo(`Found ${detectionsBlobsCount} detection files in Blob Storage`);

    return { analysisBlobsCount, detectionsBlobsCount };
  } catch (error) {
    logError(`Failed to verify uploads: ${error.message}`);
    return null;
  }
}

async function main() {
  log(`\n${colors.bright}=== Vercel Blob Storage Migration ===${colors.reset}\n`);

  // Check for BLOB_READ_WRITE_TOKEN
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    logError('BLOB_READ_WRITE_TOKEN environment variable is required!');
    logInfo('Usage: BLOB_READ_WRITE_TOKEN=your_token node scripts/migrate-to-blob.js');
    logInfo('Get your token from: https://vercel.com/dashboard > Storage > Blob > Settings');
    process.exit(1);
  }

  logSuccess('BLOB_READ_WRITE_TOKEN found');

  // Upload analysis files
  const analysisResults = await uploadDirectory(ANALYSIS_DIR, 'analysis', 'Analysis Files');

  // Upload detection files
  const detectionsResults = await uploadDirectory(DETECTIONS_DIR, 'detections', 'Detection Files');

  // Summary
  const totalUploaded = analysisResults.uploaded + detectionsResults.uploaded;
  const totalFailed = analysisResults.failed + detectionsResults.failed;

  log(`\n${colors.bright}=== Migration Summary ===${colors.reset}`);
  logInfo(`Total files uploaded: ${totalUploaded}`);
  if (totalFailed > 0) {
    logError(`Total files failed: ${totalFailed}`);
  } else {
    logSuccess('All files uploaded successfully!');
  }

  // Verify uploads
  const verification = await verifyUploads();

  if (verification) {
    log(`\n${colors.bright}=== Next Steps ===${colors.reset}`);
    logInfo('1. Verify the uploads in Vercel Dashboard: https://vercel.com/dashboard > Storage > Blob');
    logInfo('2. Set BLOB_READ_WRITE_TOKEN in your Vercel project environment variables');
    logInfo('3. Deploy your application to Vercel');
    logInfo('4. (Optional) Remove public/analysis and public/detections directories from local');
    logWarning('\n⚠ DO NOT remove public/videos yet - verify deployment works first');
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(error => {
  logError(`Unexpected error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
