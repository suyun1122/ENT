import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { list, put } from '@vercel/blob';

// Railway backend URL for tool detection
const TOOL_DETECTION_BACKEND_URL = process.env.TOOL_DETECTION_BACKEND_URL;

// In-memory tracking of videos currently being processed
// Key: videoId, Value: { startTime: Date, status: 'processing' }
const processingVideos = new Map();

// Cleanup old processing entries (older than 10 minutes)
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;
function cleanupStaleProcessing() {
    const now = Date.now();
    for (const [videoId, info] of processingVideos.entries()) {
        if (now - info.startTime > PROCESSING_TIMEOUT_MS) {
            console.log(`[Detection] Cleaning up stale processing entry: ${videoId}`);
            processingVideos.delete(videoId);
        }
    }
}

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
                const blobPrefix = `detections/${videoId}`;
                console.log(`[Detection GET] Checking Blob with prefix: ${blobPrefix}`);

                const { blobs } = await list({
                    prefix: blobPrefix,
                    token: process.env.BLOB_READ_WRITE_TOKEN
                });

                if (blobs.length > 0) {
                    // Found the blob - fetch its content
                    const blobUrl = blobs[0].url;
                    console.log(`[Detection GET] Found blob: ${blobUrl}`);

                    const response = await fetch(blobUrl);
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
                console.log(`[Detection GET] Blob error for ${videoId}: ${blobError.message}`);
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

        // Check if video is currently being processed
        cleanupStaleProcessing();
        if (processingVideos.has(videoId)) {
            const processingInfo = processingVideos.get(videoId);
            const elapsedSeconds = Math.floor((Date.now() - processingInfo.startTime) / 1000);
            console.log(`[Detection GET] Video ${videoId} is currently processing (${elapsedSeconds}s elapsed)`);

            // Try to get actual progress from Railway backend
            if (TOOL_DETECTION_BACKEND_URL) {
                try {
                    const statusResponse = await fetch(`${TOOL_DETECTION_BACKEND_URL}/status/${videoId}`);
                    if (statusResponse.ok) {
                        const railwayStatus = await statusResponse.json();
                        if (railwayStatus.status === 'processing' || railwayStatus.status === 'completed') {
                            console.log(`[Detection GET] Railway status for ${videoId}:`, railwayStatus);
                            return NextResponse.json({
                                status: railwayStatus.status,
                                videoId: videoId,
                                progress: railwayStatus.progress || 0,
                                stage: railwayStatus.stage || 'processing',
                                currentFrame: railwayStatus.current_frame || 0,
                                totalFrames: railwayStatus.total_frames || 0,
                                processedFrames: railwayStatus.processed_frames || 0,
                                elapsedSeconds: elapsedSeconds,
                                message: 'Tool detection is currently in progress'
                            });
                        }
                    }
                } catch (e) {
                    console.log(`[Detection GET] Could not fetch Railway status: ${e.message}`);
                }
            }

            // Fallback to basic processing status
            return NextResponse.json({
                status: 'processing',
                videoId: videoId,
                elapsedSeconds: elapsedSeconds,
                message: 'Tool detection is currently in progress'
            });
        }

        // Before returning not_found, check Railway backend status
        // (handles case where processingVideos Map was cleared but Railway is still processing)
        if (TOOL_DETECTION_BACKEND_URL) {
            try {
                console.log(`[Detection GET] Checking Railway status for ${videoId}...`);
                const statusResponse = await fetch(`${TOOL_DETECTION_BACKEND_URL}/status/${videoId}`);
                if (statusResponse.ok) {
                    const railwayStatus = await statusResponse.json();
                    console.log(`[Detection GET] Railway status:`, railwayStatus);

                    if (railwayStatus.status === 'processing') {
                        // Railway is still processing - add to local map and return status
                        processingVideos.set(videoId, { startTime: Date.now() });
                        return NextResponse.json({
                            status: 'processing',
                            videoId: videoId,
                            progress: railwayStatus.progress || 0,
                            stage: railwayStatus.stage || 'processing',
                            currentFrame: railwayStatus.current_frame || 0,
                            totalFrames: railwayStatus.total_frames || 0,
                            processedFrames: railwayStatus.processed_frames || 0,
                            message: 'Tool detection is currently in progress'
                        });
                    } else if (railwayStatus.status === 'completed' && railwayStatus.data) {
                        // Railway completed - return the data directly
                        console.log(`[Detection GET] Railway has completed data, returning it`);
                        return NextResponse.json({
                            status: 'completed',
                            videoId: videoId,
                            data: railwayStatus.data
                        });
                    }
                }
            } catch (e) {
                console.log(`[Detection GET] Could not fetch Railway status: ${e.message}`);
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
        const blobPrefix = `detections/${videoId}`;
        const { blobs } = await list({
            prefix: blobPrefix,
            token: process.env.BLOB_READ_WRITE_TOKEN
        });

        if (blobs.length > 0) {
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

    // Check if video is already being processed
    cleanupStaleProcessing();
    if (processingVideos.has(videoId)) {
        console.log(`[Detection POST] Video ${videoId} is already being processed`);
        return NextResponse.json({
            status: 'processing',
            videoId: videoId,
            message: 'Tool detection is already in progress for this video'
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

    // Mark video as processing before calling backend
    processingVideos.set(videoId, { startTime: Date.now() });
    console.log(`[Detection POST] Marked ${videoId} as processing`);

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
            processingVideos.delete(videoId); // Remove from processing on error
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
        processingVideos.delete(videoId); // Remove from processing on error
        console.error(`[Detection POST] Error calling Railway backend:`, error);
        console.error(`[Detection POST] Error stack:`, error.stack);
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

            const blob = await put(blobPath, JSON.stringify(detectionData, null, 2), {
                access: 'public',
                token: process.env.BLOB_READ_WRITE_TOKEN,
                contentType: 'application/json',
            });

            console.log(`[Detection PUT] Stored in Vercel Blob: ${blob.url}`);

            // Remove from processing map since it's now complete
            if (processingVideos.has(videoId)) {
                processingVideos.delete(videoId);
                console.log(`[Detection PUT] Removed ${videoId} from processing map`);
            }

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
