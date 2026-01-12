import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { head } from '@vercel/blob';

// Railway backend URL for tool detection
const TOOL_DETECTION_BACKEND_URL = process.env.TOOL_DETECTION_BACKEND_URL;

export async function GET(request, { params }) {
    /*
    Get the tool detection results for a specific video
    Returns JSON with bounding box data or processing status
    */

    try {
        const { videoId } = await params;

        if (!videoId) {
            return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
        }

        console.log(`[Detection GET] Checking for videoId: ${videoId}`);

        // Check Vercel Blob (production - newly generated detections)
        // Note: Static files (pre-deployed) are checked by frontend first
        if (process.env.BLOB_READ_WRITE_TOKEN) {
            try {
                const blobPath = `detections/${videoId}.json`;
                console.log(`[Detection GET] Checking Blob: ${blobPath}`);
                const blobHead = await head(blobPath, {
                    token: process.env.BLOB_READ_WRITE_TOKEN
                });

                if (blobHead) {
                    // Fetch the data from blob
                    const response = await fetch(blobHead.url);
                    const detectionData = await response.json();

                    console.log(`[Detection GET] Loaded from Vercel Blob: ${videoId}`);
                    return NextResponse.json({
                        status: 'completed',
                        videoId: videoId,
                        data: detectionData
                    });
                }
            } catch (blobError) {
                // Blob not found - this is normal for new videos
                console.log(`[Detection GET] Blob not found for ${videoId}: ${blobError.message}`);
            }
        }

        // Fallback to local file system (development only)
        // In production, static files are served directly by Vercel CDN
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

        // No results found
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

    // Check if results already exist in Vercel Blob
    try {
        const detectionBlobUrl = `detections/${videoId}.json`;
        const blobHead = await head(detectionBlobUrl, {
            token: process.env.BLOB_READ_WRITE_TOKEN
        });

        if (blobHead) {
            console.log(`[Detection] Already exists in Blob: ${videoId}`);
            return NextResponse.json({
                status: 'completed',
                videoId: videoId,
                message: 'Detection already completed. Use GET to retrieve results.'
            });
        }
    } catch (blobError) {
        // Continue if not found in Blob
    }

    // Check local file system (development only)
    const detectionPath = path.join(process.cwd(), 'public', 'detections', `${videoId}.json`);
    if (fs.existsSync(detectionPath)) {
        console.log(`[Detection] Already exists in local file system: ${videoId}`);
        return NextResponse.json({
            status: 'completed',
            videoId: videoId,
            message: 'Detection already completed. Use GET to retrieve results.'
        });
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

    // Call Railway backend to start detection
    try {
        console.log(`[Detection POST] Calling Railway backend...`);
        console.log(`[Detection POST] Railway URL: ${TOOL_DETECTION_BACKEND_URL}/detect`);
        console.log(`[Detection POST] Request body:`, JSON.stringify({
            video_id: videoId,
            blob_url: blobUrl,
        }));

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
        console.error(`[Detection POST] Error calling Railway backend:`, error);
        console.error(`[Detection POST] Error stack:`, error.stack);
        return NextResponse.json({
            status: 'error',
            videoId: videoId,
            message: `Failed to start detection: ${error.message}`
        }, { status: 500 });
    }
}
