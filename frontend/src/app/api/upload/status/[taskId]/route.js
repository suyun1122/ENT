import { TwelveLabs } from 'twelvelabs-js';
import { NextResponse } from 'next/server';

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

        if (!taskId) {
            return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
        }

        console.log('[Upload Status] Checking task:', taskId);

        // Get task status from TwelveLabs
        const client = getTwelveLabsClient();
        const task = await client.tasks.retrieve(taskId);

        console.log('[Upload Status] Task status:', task.status, 'videoId:', task.videoId);

        // Use request URL to get the correct base URL (works on both localhost and Vercel)
        const requestUrl = new URL(request.url);
        const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;

        if (task.status === 'ready') {
            console.log('[Upload Status] Video ready, Video ID:', task.videoId);

            // Trigger post-processing (surgical analysis)
            // Tool detection is now handled directly via frontend upload to Railway
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
                videoId: task.videoId || null,
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
