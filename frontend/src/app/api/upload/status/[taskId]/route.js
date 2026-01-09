import { TwelveLabs } from 'twelvelabs-js';
import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';

// Lazy initialization to avoid build-time errors
let twelvelabs_client = null;
function getTwelveLabsClient() {
    if (!twelvelabs_client) {
        twelvelabs_client = new TwelveLabs({ apiKey: process.env.TWELVELABS_API_KEY });
    }
    return twelvelabs_client;
}

// Track which tasks have had tool detection triggered
const toolDetectionTriggered = new Set();

export async function GET(request, { params }) {
    try {
        const { taskId } = await params;
        const { searchParams } = new URL(request.url);
        const blobUrl = searchParams.get('blobUrl');

        if (!taskId) {
            return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
        }

        console.log('[Upload Status] Checking task:', taskId);

        // Get task status from TwelveLabs
        const task = await getTwelveLabsClient().tasks.retrieve(taskId);

        console.log('[Upload Status] Task status:', task.status, 'videoId:', task.videoId);

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

        // If videoId is available and we have blobUrl, trigger tool detection early
        if (task.videoId && blobUrl && !toolDetectionTriggered.has(taskId)) {
            toolDetectionTriggered.add(taskId);
            console.log('[Upload Status] Triggering early tool detection for videoId:', task.videoId);

            fetch(`${baseUrl}/api/detect-tools/${task.videoId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ blobUrl }),
            })
                .then(res => {
                    if (res.ok) console.log('[Upload Status] Tool detection started');
                    else console.warn('[Upload Status] Tool detection failed to start:', res.status);
                })
                .catch(err => console.warn('[Upload Status] Tool detection error:', err));
        }

        if (task.status === 'ready') {
            console.log('[Upload Status] Video ready, Video ID:', task.videoId);

            // Trigger post-processing (surgical analysis)
            fetch(`${baseUrl}/api/analysis/${task.videoId}`, { method: 'POST' })
                .then(res => {
                    if (res.ok) console.log('[Upload Status] Surgical analysis started');
                    else console.warn('[Upload Status] Surgical analysis failed to start');
                })
                .catch(err => console.warn('[Upload Status] Surgical analysis error:', err));

            // Clean up tracking
            toolDetectionTriggered.delete(taskId);

            return NextResponse.json({
                status: 'ready',
                videoId: task.videoId,
                message: 'Video indexed successfully',
            });
        } else if (task.status === 'failed') {
            console.log('[Upload Status] Task failed');
            toolDetectionTriggered.delete(taskId);
            return NextResponse.json({
                status: 'failed',
                message: 'Video indexing failed',
            }, { status: 500 });
        } else {
            // Still processing (pending, validating, indexing, etc.)
            return NextResponse.json({
                status: task.status,
                videoId: task.videoId || null, // Return videoId if available
                estimatedTime: task.estimatedTime || 0,
                message: 'Video is being indexed',
            });
        }

    } catch (error) {
        console.error('[Upload Status] Error:', error);
        return NextResponse.json({
            error: 'Failed to check status',
            message: error.message
        }, { status: 500 });
    }
}

// POST endpoint to cleanup blob after indexing is complete
export async function POST(request, { params }) {
    try {
        const { taskId } = await params;
        const { blobUrl } = await request.json();

        if (!blobUrl) {
            return NextResponse.json({ error: 'blobUrl is required' }, { status: 400 });
        }

        console.log('[Upload Status] Cleaning up blob for task:', taskId);

        // Delete temp video from Blob
        try {
            await del(blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
            console.log('[Upload Status] Deleted temp video from Blob');
        } catch (deleteError) {
            console.warn('[Upload Status] Failed to delete temp video from Blob:', deleteError);
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('[Upload Status] Cleanup error:', error);
        return NextResponse.json({
            error: 'Cleanup failed',
            message: error.message
        }, { status: 500 });
    }
}
