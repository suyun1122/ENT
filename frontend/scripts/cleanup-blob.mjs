#!/usr/bin/env node

/**
 * Cleanup script to remove orphaned detection/analysis files from Vercel Blob
 * that no longer have corresponding videos in TwelveLabs index.
 *
 * Usage (from frontend folder):
 *   node scripts/cleanup-blob.mjs [--dry-run]
 *
 * Required env vars in .env.local:
 *   TWELVELABS_API_KEY
 *   NEXT_PUBLIC_TWELVELABS_PEGASUS_INDEX_ID
 *   BLOB_READ_WRITE_TOKEN
 *   BLOB_STORE_BASE_URL
 */

import { list, del } from '@vercel/blob';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env vars from .env.local manually
function loadEnvFile(filepath) {
    try {
        const content = fs.readFileSync(filepath, 'utf-8');
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const match = trimmed.match(/^([^=]+)=(.*)$/);
                if (match) {
                    const key = match[1].trim();
                    let value = match[2].trim();
                    // Remove quotes
                    if ((value.startsWith('"') && value.endsWith('"')) ||
                        (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }
                    if (!process.env[key]) {
                        process.env[key] = value;
                    }
                }
            }
        });
    } catch (e) {
        // File not found, ignore
    }
}

// Load .env.local
loadEnvFile(path.join(__dirname, '../.env.local'));

const TWELVELABS_API_KEY = process.env.TWELVELABS_API_KEY;
const INDEX_ID = process.env.NEXT_PUBLIC_TWELVELABS_PEGASUS_INDEX_ID;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

const DRY_RUN = process.argv.includes('--dry-run');

async function getTwelveLabsVideos() {
    console.log('Fetching videos from TwelveLabs...');

    const videos = [];
    let page = 1;

    while (true) {
        const response = await fetch(
            `https://api.twelvelabs.io/v1.3/indexes/${INDEX_ID}/videos?page=${page}&page_limit=50`,
            {
                headers: {
                    'x-api-key': TWELVELABS_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`TwelveLabs API error: ${response.status}`);
        }

        const data = await response.json();

        if (!data.data || data.data.length === 0) {
            break;
        }

        videos.push(...data.data.map(v => v._id));

        if (!data.page_info?.next_page_token) {
            break;
        }

        page++;
    }

    console.log(`Found ${videos.length} videos in TwelveLabs`);
    return new Set(videos);
}

async function getBlobFiles(prefix) {
    console.log(`Fetching blob files with prefix: ${prefix}`);

    const files = [];
    let cursor = undefined;

    while (true) {
        const result = await list({
            prefix,
            cursor,
            token: BLOB_TOKEN
        });

        files.push(...result.blobs);

        if (!result.cursor) {
            break;
        }
        cursor = result.cursor;
    }

    console.log(`Found ${files.length} files in ${prefix}`);
    return files;
}

function extractVideoId(filename) {
    // Format: detections/696e12982ac784d5310c5292.json
    const match = filename.match(/\/([a-f0-9]+)\.json$/);
    return match ? match[1] : null;
}

async function main() {
    // Validate env vars
    if (!TWELVELABS_API_KEY) {
        console.error('Error: TWELVELABS_API_KEY not set');
        process.exit(1);
    }
    if (!INDEX_ID) {
        console.error('Error: NEXT_PUBLIC_TWELVELABS_PEGASUS_INDEX_ID not set');
        process.exit(1);
    }
    if (!BLOB_TOKEN) {
        console.error('Error: BLOB_READ_WRITE_TOKEN not set');
        console.error('Please add it to .env.local');
        process.exit(1);
    }

    console.log('='.repeat(60));
    console.log('Vercel Blob Cleanup Script');
    console.log(DRY_RUN ? '*** DRY RUN MODE - No files will be deleted ***' : '*** LIVE MODE - Files will be deleted ***');
    console.log('='.repeat(60));
    console.log('');

    try {
        // 1. Get TwelveLabs video IDs
        const twelveLabsVideos = await getTwelveLabsVideos();
        console.log('');

        // 2. Get blob files
        const detectionFiles = await getBlobFiles('detections/');
        const analysisFiles = await getBlobFiles('analysis/');
        const videoUrlFiles = await getBlobFiles('video-urls/');
        const processingStatusFiles = await getBlobFiles('processing-status/');
        const videoFiles = await getBlobFiles('videos/');

        console.log('');

        // 3. Find orphaned files
        const orphanedDetections = [];
        const orphanedAnalysis = [];
        const orphanedVideoUrls = [];

        for (const file of detectionFiles) {
            const videoId = extractVideoId(file.pathname);
            if (videoId && !twelveLabsVideos.has(videoId)) {
                orphanedDetections.push(file);
            }
        }

        for (const file of analysisFiles) {
            const videoId = extractVideoId(file.pathname);
            if (videoId && !twelveLabsVideos.has(videoId)) {
                orphanedAnalysis.push(file);
            }
        }

        for (const file of videoUrlFiles) {
            const videoId = extractVideoId(file.pathname);
            if (videoId && !twelveLabsVideos.has(videoId)) {
                orphanedVideoUrls.push(file);
            }
        }

        const orphanedProcessingStatus = [];
        for (const file of processingStatusFiles) {
            const videoId = extractVideoId(file.pathname);
            if (videoId && !twelveLabsVideos.has(videoId)) {
                orphanedProcessingStatus.push(file);
            }
        }

        // For videos folder, we need to check differently - files may have different naming
        const orphanedVideos = [];
        for (const file of videoFiles) {
            // Try to extract videoId from filename (format may vary)
            const videoId = extractVideoId(file.pathname);
            if (videoId && !twelveLabsVideos.has(videoId)) {
                orphanedVideos.push(file);
            }
        }

        console.log('='.repeat(60));
        console.log('ORPHANED FILES (in Blob but not in TwelveLabs):');
        console.log('='.repeat(60));
        console.log('');

        console.log(`Detections: ${orphanedDetections.length} orphaned files`);
        orphanedDetections.forEach(f => {
            const videoId = extractVideoId(f.pathname);
            console.log(`  - ${videoId} (${(f.size / 1024).toFixed(1)} KB)`);
        });

        console.log('');

        console.log(`Analysis: ${orphanedAnalysis.length} orphaned files`);
        orphanedAnalysis.forEach(f => {
            const videoId = extractVideoId(f.pathname);
            console.log(`  - ${videoId} (${(f.size / 1024).toFixed(1)} KB)`);
        });

        console.log('');

        console.log(`Video-URLs: ${orphanedVideoUrls.length} orphaned files`);
        orphanedVideoUrls.forEach(f => {
            const videoId = extractVideoId(f.pathname);
            console.log(`  - ${videoId} (${(f.size / 1024).toFixed(1)} KB)`);
        });

        console.log('');

        console.log(`Processing-Status: ${orphanedProcessingStatus.length} orphaned files`);
        orphanedProcessingStatus.forEach(f => {
            const videoId = extractVideoId(f.pathname);
            console.log(`  - ${videoId} (${(f.size / 1024).toFixed(1)} KB)`);
        });

        console.log('');

        console.log(`Videos: ${orphanedVideos.length} orphaned files`);
        orphanedVideos.forEach(f => {
            console.log(`  - ${f.pathname} (${(f.size / 1024 / 1024).toFixed(2)} MB)`);
        });

        console.log('');

        // 4. Summary
        const allOrphanedFiles = [...orphanedDetections, ...orphanedAnalysis, ...orphanedVideoUrls, ...orphanedProcessingStatus, ...orphanedVideos];
        const totalOrphaned = allOrphanedFiles.length;
        const totalSize = allOrphanedFiles.reduce((sum, f) => sum + f.size, 0);

        console.log('='.repeat(60));
        console.log('SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total orphaned files: ${totalOrphaned}`);
        console.log(`Total size to free: ${(totalSize / 1024).toFixed(1)} KB`);
        console.log('');

        if (totalOrphaned === 0) {
            console.log('✓ No cleanup needed - all blob files have matching TwelveLabs videos');
            return;
        }

        // 5. Delete orphaned files
        if (DRY_RUN) {
            console.log('*** DRY RUN - No files deleted ***');
            console.log('Run without --dry-run to actually delete files');
        } else {
            console.log('Deleting orphaned files...');

            const allOrphaned = [...orphanedDetections, ...orphanedAnalysis, ...orphanedVideoUrls, ...orphanedProcessingStatus, ...orphanedVideos];
            let deleted = 0;

            for (const file of allOrphaned) {
                try {
                    await del(file.url, { token: BLOB_TOKEN });
                    deleted++;
                    console.log(`  ✓ Deleted: ${file.pathname}`);
                } catch (error) {
                    console.error(`  ✗ Failed to delete ${file.pathname}: ${error.message}`);
                }
            }

            console.log('');
            console.log(`Done! Deleted ${deleted}/${totalOrphaned} files`);
        }

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();
