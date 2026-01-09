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

    const { videoId } = await params;

    if (!videoId) {
        return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    // Check Vercel Blob (production - newly generated detections)
    // Note: Static files (pre-deployed) are checked by frontend first
    try {
        const blobUrl = `detections/${videoId}.json`;
        const blobHead = await head(blobUrl, {
            token: process.env.BLOB_READ_WRITE_TOKEN
        });

        if (blobHead) {
            // Fetch the data from blob
            const response = await fetch(blobHead.url);
            const detectionData = await response.json();

            console.log(`[Detection] Loaded from Vercel Blob: ${videoId}`);
            return NextResponse.json({
                status: 'completed',
                videoId: videoId,
                data: detectionData
            });
        }
    } catch (blobError) {
        // Blob not found, will check local file system for development
        console.log(`[Detection] Blob not found for ${videoId}, checking local...`);
    }

    // Fallback to local file system (development only)
    // In production, static files are served directly by Vercel CDN
    const detectionPath = path.join(process.cwd(), 'public', 'detections', `${videoId}.json`);

    if (fs.existsSync(detectionPath)) {
        try {
            const detectionData = JSON.parse(fs.readFileSync(detectionPath, 'utf-8'));
            console.log(`[Detection] Loaded from local file system: ${videoId}`);
            return NextResponse.json({
                status: 'completed',
                videoId: videoId,
                data: detectionData
            });
        } catch (error) {
            console.error('Error reading detection file:', error);
            return NextResponse.json({ error: 'Failed to read detection data' }, { status: 500 });
        }
    }

    // Check if processing is in progress
    if (processingStatus.has(videoId)) {
        return NextResponse.json({
            status: 'processing',
            videoId: videoId,
            ...processingStatus.get(videoId)
        });
    }

    // No results found
    return NextResponse.json({
        status: 'not_found',
        videoId: videoId,
        message: 'Tool detection has not been run for this video. Use POST to start processing.'
    });
}

export async function POST(request, { params }) {
    /*
    Start tool detection processing for a specific video
    Calls Railway backend to process video with YOLO
    */

    const { videoId } = await params;

    if (!videoId) {
        return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    // Parse request body to get blobUrl
    let blobUrl = null;
    try {
        const body = await request.json();
        blobUrl = body.blobUrl;
    } catch (e) {
        // No body or invalid JSON - blobUrl remains null
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
            error: 'blobUrl is required to start detection',
            videoId: videoId
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
        console.log(`[Detection] Calling Railway backend for video: ${videoId}`);

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

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Detection] Railway backend error: ${errorText}`);
            return NextResponse.json({
                status: 'error',
                videoId: videoId,
                message: `Backend error: ${response.status}`
            }, { status: response.status });
        }

        const result = await response.json();
        console.log(`[Detection] Railway backend response:`, result);

        return NextResponse.json({
            status: result.status,
            videoId: videoId,
            message: result.message || 'Tool detection started'
        });

    } catch (error) {
        console.error(`[Detection] Error calling Railway backend:`, error);
        return NextResponse.json({
            status: 'error',
            videoId: videoId,
            message: `Failed to start detection: ${error.message}`
        }, { status: 500 });
    }
}

