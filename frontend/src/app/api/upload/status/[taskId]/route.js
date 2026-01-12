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

export async function GET(request, { params }) {
    try {
        const { taskId } = await params;
        const { searchParams } = new URL(request.url);
        const blobUrl = searchParams.get('blobUrl');

        if (!taskId) {
            return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
        }

        console.log('[Upload Status] Checking task:', taskId, 'blobUrl:', blobUrl ? 'provided' : 'none');

        // Get task status from TwelveLabs
        const client = getTwelveLabsClient();
        const task = await client.tasks.retrieve(taskId);

        console.log('[Upload Status] Task status:', task.status, 'videoId:', task.videoId);

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

        if (task.status === 'ready') {
            console.log('[Upload Status] Video ready, Video ID:', task.videoId);

            // Trigger tool detection with blob URL (direct video file, not HLS stream)
            if (blobUrl) {
                console.log('[Upload Status] Triggering tool detection with blob URL...');
                console.log('[Upload Status] Blob URL:', blobUrl);

                fetch(`${baseUrl}/api/detect-tools/${task.videoId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ blobUrl: blobUrl }),
                })
                    .then(async res => {
                        const text = await res.text();
                        console.log('[Upload Status] Tool detection response status:', res.status);
                        console.log('[Upload Status] Tool detection response:', text);
                    })
                    .catch(err => console.error('[Upload Status] Tool detection fetch error:', err));
            } else {
                console.warn('[Upload Status] No blob URL provided, skipping tool detection');
            }

            // Trigger post-processing (surgical analysis)
            fetch(`${baseUrl}/api/analysis/${task.videoId}`, { method: 'POST' })
                .then(res => {
                    if (res.ok) console.log('[Upload Status] Surgical analysis started');
                    else console.warn('[Upload Status] Surgical analysis failed to start');
                })
                .catch(err => console.warn('[Upload Status] Surgical analysis error:', err));

            return NextResponse.json({
                status: 'ready',
                videoId: task.videoId,
                message: 'Video indexed successfully',
                // Return flag indicating tool detection was triggered
                toolDetectionTriggered: !!blobUrl,
            });
        } else if (task.status === 'failed') {
            console.log('[Upload Status] Task failed');
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
