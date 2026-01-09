import { TwelveLabs } from 'twelvelabs-js';
import { NextResponse } from 'next/server';

const twelvelabs_client = new TwelveLabs({ apiKey: process.env.TWELVELABS_API_KEY });

export async function POST(request) {
    try {
        const { uploadUrl, filename } = await request.json();

        if (!uploadUrl || !filename) {
            return NextResponse.json({
                error: 'Upload URL and filename are required'
            }, { status: 400 });
        }

        console.log('[Upload Confirm] Starting TwelveLabs indexing for:', filename);
        console.log('[Upload Confirm] Video URL:', uploadUrl);

        const indexId = process.env.NEXT_PUBLIC_TWELVELABS_MARENGO_INDEX_ID;

        if (!indexId) {
            return NextResponse.json({
                error: 'Index ID not configured'
            }, { status: 500 });
        }

        // Create task with video URL
        const task = await twelvelabs_client.tasks.create({
            indexId: indexId,
            url: uploadUrl,
        });

        console.log('[Upload Confirm] Task created, Task ID:', task.id);

        // Wait for indexing to complete
        console.log('[Upload Confirm] Waiting for indexing to complete...');
        const completedTask = await twelvelabs_client.tasks.waitForDone(task.id, {
            callback: (task) => {
                console.log(`[Upload Confirm] Status: ${task.status}, Estimated time: ${task.estimatedTime || 0}s`);
            },
            sleepInterval: 5000,
        });

        if (completedTask.status !== 'ready') {
            console.error('[Upload Confirm] Video indexing failed, status:', completedTask.status);
            return NextResponse.json({
                error: 'Video indexing failed',
                status: completedTask.status
            }, { status: 500 });
        }

        const videoId = completedTask.videoId;
        console.log('[Upload Confirm] Video indexed successfully, Video ID:', videoId);

        // Trigger post-processing
        console.log('[Upload Confirm] Triggering post-processing...');
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

        Promise.allSettled([
            fetch(`${baseUrl}/api/detect-tools/${videoId}`, { method: 'POST' })
                .then(res => {
                    if (res.ok) {
                        console.log('[Upload Confirm] Tool detection started');
                    }
                })
                .catch(error => {
                    console.warn('[Upload Confirm] Tool detection error:', error);
                }),

            fetch(`${baseUrl}/api/analysis/${videoId}`, { method: 'POST' })
                .then(res => {
                    if (res.ok) {
                        console.log('[Upload Confirm] Surgical analysis started');
                    }
                })
                .catch(error => {
                    console.warn('[Upload Confirm] Surgical analysis error:', error);
                })
        ]);

        return NextResponse.json({
            success: true,
            message: 'Video uploaded and indexed successfully',
            videoId: videoId,
            filename: filename,
        });

    } catch (error) {
        console.error('[Upload Confirm] Error:', error);
        return NextResponse.json({
            error: 'Upload confirmation failed',
            message: error.message
        }, { status: 500 });
    }
}
