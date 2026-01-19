import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { put } from '@vercel/blob';

// Railway backend URL for tool detection
const TOOL_DETECTION_BACKEND_URL = process.env.TOOL_DETECTION_BACKEND_URL;

// Blob store base URL - set this in Vercel environment variables
// Format: https://{storeId}.public.blob.vercel-storage.com
const BLOB_STORE_BASE_URL = process.env.BLOB_STORE_BASE_URL;

// In-memory tracking (note: won't persist across serverless cold starts)
const processingVideos = new Map();

// Try to fetch detection data directly from blob using predictable URL
// This uses GET (Simple Operation) instead of LIST (Advanced Operation)
async function fetchDetectionFromBlob(videoId) {
    if (!BLOB_STORE_BASE_URL) {
        console.log(`[Detection] BLOB_STORE_BASE_URL not set, cannot fetch directly`);
        return null;
    }

    const blobUrl = `${BLOB_STORE_BASE_URL}/detections/${videoId}.json`;
    console.log(`[Detection] Trying direct fetch: ${blobUrl}`);

    try {
        const response = await fetch(blobUrl);
        if (response.ok) {
            const data = await response.json();
            console.log(`[Detection] Found blob at predictable URL: ${blobUrl}`);
            return data;
        } else if (response.status === 404) {
            console.log(`[Detection] Blob not found at: ${blobUrl}`);
            return null;
        } else {
            console.log(`[Detection] Unexpected response ${response.status} from: ${blobUrl}`);
            return null;
        }
    } catch (e) {
        console.log(`[Detection] Error fetching blob: ${e.message}`);
        return null;
    }
}

export async function GET(request, { params }) {
    /*
    Get the tool detection results for a specific video
    Returns JSON with bounding box data or processing status

    OPTIMIZED: Uses direct blob URL fetch instead of list() to avoid Advanced Operations
    */

    try {
        const { videoId } = await params;

        if (!videoId) {
            return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
        }

        console.log(`[Detection GET] Checking for videoId: ${videoId}`);

        // 1. Try direct blob fetch (Simple Operation - no list() needed)
        const blobData = await fetchDetectionFromBlob(videoId);
        if (blobData) {
            console.log(`[Detection GET] Loaded from Vercel Blob: ${videoId}`);
            return NextResponse.json({
                status: 'completed',
                videoId: videoId,
                data: blobData
            });
        }

        // 2. Check local file system (development / pre-deployed static files)
        const detectionPath = path.join(process.cwd(), 'public', 'detections', `${videoId}.json`);

        if (fs.existsSync(detectionPath)) {
            try {
                const detectionData = JSON.parse(fs.readFileSync(detectionPath, 'utf-8'));
                console.log(`[Detection GET] Loaded from local file system: ${videoId}`);
                return NextResponse.json({
                    status: 'completed',
                    videoId: videoId,
                    data: detectionData
                });
            } catch (error) {
                console.error('[Detection GET] Error reading detection file:', error);
                return NextResponse.json({ error: 'Failed to read detection data' }, { status: 500 });
            }
        }

        // 3. Check in-memory processing status (works within same serverless instance)
        if (processingVideos.has(videoId)) {
            const processingInfo = processingVideos.get(videoId);
            const elapsedSeconds = Math.floor((Date.now() - processingInfo.startTime) / 1000);
            console.log(`[Detection GET] Video ${videoId} is currently processing (${elapsedSeconds}s elapsed)`);

            return NextResponse.json({
                status: 'processing',
                videoId: videoId,
                elapsedSeconds: elapsedSeconds,
                message: 'Tool detection is currently in progress'
            });
        }

        // 4. No results found
        console.log(`[Detection GET] No results found for ${videoId}`);
        return NextResponse.json({
            status: 'not_found',
            videoId: videoId,
            message: 'Tool detection has not been run for this video. Use POST to start processing.'
        });

    } catch (error) {
        console.error('[Detection GET] Unexpected error:', error);
        return NextResponse.json({
            error: 'Internal server error',
            message: error.message
        }, { status: 500 });
    }
}

export async function POST(request, { params }) {
    /*
    Start tool detection processing for a specific video
    Calls Railway backend to process video with YOLO
    */

    const { videoId } = await params;
    console.log(`[Detection POST] Starting for videoId: ${videoId}`);

    if (!videoId) {
        return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    // Parse request body to get blobUrl
    let blobUrl = null;
    try {
        const body = await request.json();
        blobUrl = body.blobUrl;
        console.log(`[Detection POST] Received blobUrl: ${blobUrl}`);
    } catch (e) {
        console.log(`[Detection POST] No body or invalid JSON: ${e.message}`);
    }

    // Check if already completed in blob (direct fetch)
    const existingData = await fetchDetectionFromBlob(videoId);
    if (existingData) {
        console.log(`[Detection POST] Already completed (blob): ${videoId}`);
        return NextResponse.json({
            status: 'completed',
            videoId: videoId,
            message: 'Detection already completed. Use GET to retrieve results.'
        });
    }

    // Check local file system (development only)
    const detectionPath = path.join(process.cwd(), 'public', 'detections', `${videoId}.json`);
    if (fs.existsSync(detectionPath)) {
        console.log(`[Detection POST] Already exists in local file system: ${videoId}`);
        return NextResponse.json({
            status: 'completed',
            videoId: videoId,
            message: 'Detection already completed. Use GET to retrieve results.'
        });
    }

    // Check if video is already being processed (in-memory)
    if (processingVideos.has(videoId)) {
        const processingInfo = processingVideos.get(videoId);
        const elapsedSeconds = Math.floor((Date.now() - processingInfo.startTime) / 1000);

        // Only consider stale if > 15 minutes
        if (elapsedSeconds <= 900) {
            console.log(`[Detection POST] Video ${videoId} is already being processed (${elapsedSeconds}s elapsed)`);
            return NextResponse.json({
                status: 'processing',
                videoId: videoId,
                message: 'Tool detection is already in progress for this video'
            });
        } else {
            // Stale, remove it
            console.log(`[Detection POST] Clearing stale processing entry: ${videoId}`);
            processingVideos.delete(videoId);
        }
    }

    // Require blobUrl for new detections
    if (!blobUrl) {
        return NextResponse.json({
            status: 'unavailable',
            videoId: videoId,
            message: 'Video URL not available for tool detection.'
        }, { status: 400 });
    }

    // Check if Railway backend is configured
    if (!TOOL_DETECTION_BACKEND_URL) {
        console.warn('[Detection] TOOL_DETECTION_BACKEND_URL not configured');
        return NextResponse.json({
            status: 'unavailable',
            videoId: videoId,
            message: 'Tool detection backend not configured'
        }, { status: 503 });
    }

    // Mark video as processing (in-memory only - no blob write needed)
    processingVideos.set(videoId, { startTime: Date.now() });
    console.log(`[Detection POST] Marked ${videoId} as processing`);

    // Call Railway backend to start detection
    try {
        console.log(`[Detection POST] Calling Railway backend...`);
        console.log(`[Detection POST] Railway URL: ${TOOL_DETECTION_BACKEND_URL}/detect`);

        const response = await fetch(`${TOOL_DETECTION_BACKEND_URL}/detect`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                video_id: videoId,
                blob_url: blobUrl,
            }),
        });

        console.log(`[Detection POST] Railway response status: ${response.status}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Detection POST] Railway backend error: ${errorText}`);
            processingVideos.delete(videoId);
            return NextResponse.json({
                status: 'error',
                videoId: videoId,
                message: `Backend error: ${response.status}`
            }, { status: response.status });
        }

        const result = await response.json();
        console.log(`[Detection POST] Railway backend response:`, JSON.stringify(result));

        return NextResponse.json({
            status: result.status,
            videoId: videoId,
            message: result.message || 'Tool detection started'
        });

    } catch (error) {
        processingVideos.delete(videoId);
        console.error(`[Detection POST] Error calling Railway backend:`, error);
        return NextResponse.json({
            status: 'error',
            videoId: videoId,
            message: `Failed to start detection: ${error.message}`
        }, { status: 500 });
    }
}

export async function PUT(request, { params }) {
    /*
    Store tool detection results from Railway backend
    Railway calls this endpoint to save results to Vercel Blob
    */

    try {
        const { videoId } = await params;
        console.log(`[Detection PUT] Storing results for videoId: ${videoId}`);

        if (!videoId) {
            return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
        }

        // Parse the detection results from request body
        const detectionData = await request.json();

        if (!detectionData) {
            return NextResponse.json({ error: 'Detection data is required' }, { status: 400 });
        }

        console.log(`[Detection PUT] Received data with ${detectionData.summary?.total_frames_processed || 0} frames`);

        // Store in Vercel Blob using SDK
        if (process.env.BLOB_READ_WRITE_TOKEN) {
            const blobPath = `detections/${videoId}.json`;

            // Use addRandomSuffix: false for predictable URLs
            const blob = await put(blobPath, JSON.stringify(detectionData, null, 2), {
                access: 'public',
                token: process.env.BLOB_READ_WRITE_TOKEN,
                contentType: 'application/json',
                addRandomSuffix: false,  // Predictable URL
            });

            console.log(`[Detection PUT] Stored in Vercel Blob: ${blob.url}`);

            // Remove from processing
            if (processingVideos.has(videoId)) {
                processingVideos.delete(videoId);
            }
            console.log(`[Detection PUT] Cleared processing status for ${videoId}`);

            return NextResponse.json({
                status: 'completed',
                videoId: videoId,
                url: blob.url,
                message: 'Detection results stored successfully'
            });
        } else {
            console.error('[Detection PUT] BLOB_READ_WRITE_TOKEN not configured');
            return NextResponse.json({
                error: 'Blob storage not configured'
            }, { status: 503 });
        }

    } catch (error) {
        console.error('[Detection PUT] Error:', error);
        return NextResponse.json({
            error: 'Failed to store detection results',
            message: error.message
        }, { status: 500 });
    }
}
