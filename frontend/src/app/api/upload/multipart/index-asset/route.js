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

export async function POST(request) {
    try {
        const { assetId, filename } = await request.json();

        if (!assetId) {
            return NextResponse.json({
                error: 'Asset ID is required'
            }, { status: 400 });
        }

        console.log('[Index Asset] Starting indexing for asset:', assetId);

        const indexId = process.env.NEXT_PUBLIC_TWELVELABS_MARENGO_INDEX_ID;

        if (!indexId) {
            return NextResponse.json({
                error: 'Index ID not configured'
            }, { status: 500 });
        }

        // Create indexing task with asset ID
        const task = await getTwelveLabsClient().tasks.create({
            indexId: indexId,
            assetId: assetId,
        });

        console.log('[Index Asset] Task created, Task ID:', task.id);

        // Wait for indexing to complete
        console.log('[Index Asset] Waiting for indexing to complete...');
        const completedTask = await getTwelveLabsClient().tasks.waitForDone(task.id, {
            callback: (task) => {
                console.log(`[Index Asset] Status: ${task.status}, Estimated time: ${task.estimatedTime || 0}s`);
            },
            sleepInterval: 5000,
        });

        if (completedTask.status !== 'ready') {
            console.error('[Index Asset] Indexing failed, status:', completedTask.status);
            return NextResponse.json({
                error: 'Video indexing failed',
                status: completedTask.status
            }, { status: 500 });
        }

        const videoId = completedTask.videoId;
        console.log('[Index Asset] Video indexed successfully, Video ID:', videoId);

        // Trigger post-processing
        console.log('[Index Asset] Triggering post-processing...');
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

        Promise.allSettled([
            fetch(`${baseUrl}/api/detect-tools/${videoId}`, { method: 'POST' })
                .then(res => {
                    if (res.ok) {
                        console.log('[Index Asset] Tool detection started');
                    }
                })
                .catch(error => {
                    console.warn('[Index Asset] Tool detection error:', error);
                }),

            fetch(`${baseUrl}/api/analysis/${videoId}`, { method: 'POST' })
                .then(res => {
                    if (res.ok) {
                        console.log('[Index Asset] Surgical analysis started');
                    }
                })
                .catch(error => {
                    console.warn('[Index Asset] Surgical analysis error:', error);
                })
        ]);

        return NextResponse.json({
            success: true,
            message: 'Video indexed successfully',
            videoId: videoId,
            filename: filename,
        });

    } catch (error) {
        console.error('[Index Asset] Error:', error);
        return NextResponse.json({
            error: 'Failed to index asset',
            message: error.message
        }, { status: 500 });
    }
}
