import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { TwelveLabs } from 'twelvelabs-js';
import { put, head, del } from '@vercel/blob';

// Lazy initialization to avoid build-time errors
let twelvelabs_client = null;
function getTwelveLabsClient() {
    if (!twelvelabs_client) {
        twelvelabs_client = new TwelveLabs({ apiKey: process.env.TWELVELABS_API_KEY });
    }
    return twelvelabs_client;
}

// Store for tracking processing status
const processingStatus = new Map();

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
    Downloads video from Vercel Blob, runs YOLO inference, and saves results
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

    // Check if already processing
    if (processingStatus.has(videoId)) {
        return NextResponse.json({
            status: 'processing',
            videoId: videoId,
            message: 'Detection already in progress',
            ...processingStatus.get(videoId)
        });
    }

    // Check if results already exist in Vercel Blob (newly generated)
    // Note: Frontend checks static files first, so this only checks Blob
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

    // Initialize processing status
    processingStatus.set(videoId, {
        progress: 0,
        stage: 'initializing'
    });

    // Start processing in background (don't await)
    processVideoDetection(videoId, blobUrl).catch(error => {
        console.error(`Error processing video ${videoId}:`, error);
        processingStatus.set(videoId, {
            progress: 0,
            stage: 'error',
            error: error.message
        });
    });

    return NextResponse.json({
        status: 'started',
        videoId: videoId,
        message: 'Tool detection processing started. Use GET to check status.'
    });
}

async function processVideoDetection(videoId, videoBlobUrl) {
    let tempVideoPath = null;

    try {
        // Update status
        processingStatus.set(videoId, { progress: 10, stage: 'downloading_video' });

        console.log(`[Detection] Downloading video from Blob: ${videoBlobUrl}`);

        // Download video from Vercel Blob
        const response = await fetch(videoBlobUrl);
        if (!response.ok) {
            throw new Error(`Failed to download video from Blob: ${response.status}`);
        }

        const videoBuffer = Buffer.from(await response.arrayBuffer());

        // Save to temp file for ffmpeg/inference
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        tempVideoPath = path.join(tempDir, `${videoId}.mp4`);
        fs.writeFileSync(tempVideoPath, videoBuffer);

        console.log(`[Detection] Video saved to temp: ${tempVideoPath}`);
        processingStatus.set(videoId, { progress: 30, stage: 'video_downloaded' });

        // Update status
        processingStatus.set(videoId, { progress: 40, stage: 'running_detection' });

        // Run Python inference script
        const modelPath = path.join(process.cwd(), 'models', 'surgical_tools.pt');
        const outputPath = path.join(process.cwd(), 'public', 'detections', `${videoId}.json`);
        const scriptPath = path.join(process.cwd(), 'src', 'app', 'api', 'detect-tools', 'inference.py');

        // Use Python from cv_model venv
        const pythonPath = path.join(process.cwd(), '..', 'cv_model', 'venv', 'bin', 'python');

        await runInference(pythonPath, scriptPath, tempVideoPath, modelPath, outputPath, (progress) => {
            processingStatus.set(videoId, {
                progress: 40 + (progress * 0.5), // 40-90%
                stage: 'running_detection'
            });
        });

        // Update status
        processingStatus.set(videoId, { progress: 95, stage: 'finalizing' });

        // Upload results to Vercel Blob (production)
        if (process.env.BLOB_READ_WRITE_TOKEN) {
            try {
                const detectionData = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
                const blob = await put(`detections/${videoId}.json`, JSON.stringify(detectionData), {
                    access: 'public',
                    token: process.env.BLOB_READ_WRITE_TOKEN,
                });
                console.log(`[Detection] Uploaded to Vercel Blob: ${blob.url}`);
            } catch (uploadError) {
                console.error('[Detection] Failed to upload to Vercel Blob:', uploadError);
                // Continue anyway - local file exists
            }
        }

        // Clean up temp video file
        if (tempVideoPath && fs.existsSync(tempVideoPath)) {
            try {
                fs.unlinkSync(tempVideoPath);
                console.log(`[Detection] Cleaned up temp file: ${tempVideoPath}`);
            } catch (cleanupError) {
                console.warn('[Detection] Failed to clean up temp file:', cleanupError);
            }
        }

        // Delete video from Vercel Blob (temp storage)
        if (videoBlobUrl && process.env.BLOB_READ_WRITE_TOKEN) {
            try {
                await del(videoBlobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
                console.log(`[Detection] Deleted temp video from Blob: ${videoBlobUrl}`);
            } catch (deleteError) {
                console.warn('[Detection] Failed to delete temp video from Blob:', deleteError);
            }
        }

        // Mark as completed
        processingStatus.set(videoId, { progress: 100, stage: 'completed' });

        // Remove from processing map after 60 seconds
        setTimeout(() => {
            processingStatus.delete(videoId);
        }, 60000);

        console.log(`[Detection] Tool detection completed for video ${videoId}`);

    } catch (error) {
        console.error(`[Detection] Error processing video ${videoId}:`, error);

        // Clean up temp file on error
        if (tempVideoPath && fs.existsSync(tempVideoPath)) {
            try {
                fs.unlinkSync(tempVideoPath);
            } catch (e) { /* ignore */ }
        }

        processingStatus.set(videoId, {
            progress: 0,
            stage: 'error',
            error: error.message
        });
        throw error;
    }
}

function runInference(pythonPath, scriptPath, videoPath, modelPath, outputPath, onProgress) {
    return new Promise((resolve, reject) => {
        const args = [scriptPath, videoPath, modelPath, outputPath, '5']; // frame_skip=5

        const process = spawn(pythonPath, args, {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
            const text = data.toString();
            stderr += text;

            // Parse progress from stderr
            const progressMatch = text.match(/\[PROGRESS\]\s+([\d.]+)%/);
            if (progressMatch && onProgress) {
                const progress = parseFloat(progressMatch[1]);
                onProgress(progress);
            }

            console.log('[INFERENCE]', text.trim());
        });

        process.on('close', (code) => {
            if (code === 0) {
                try {
                    const result = JSON.parse(stdout.trim());
                    if (result.success) {
                        resolve(result);
                    } else {
                        reject(new Error(result.error || 'Inference failed'));
                    }
                } catch (error) {
                    reject(new Error(`Failed to parse inference output: ${error.message}`));
                }
            } else {
                reject(new Error(`Inference process exited with code ${code}: ${stderr}`));
            }
        });

        process.on('error', (error) => {
            reject(new Error(`Failed to start inference process: ${error.message}`));
        });
    });
}

