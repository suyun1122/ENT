import { TwelveLabs } from 'twelvelabs-js';
import { NextResponse } from 'next/server';

const twelvelabs_client = new TwelveLabs({ apiKey: process.env.TWELVELABS_API_KEY });

export async function POST(request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        console.log('[Upload] Starting video upload:', file.name);

        // Use the primary index (supports both Marengo and Pegasus engines)
        const indexId = process.env.NEXT_PUBLIC_TWELVELABS_MARENGO_INDEX_ID;

        if (!indexId) {
            return NextResponse.json({
                error: 'Index ID not configured'
            }, { status: 500 });
        }

        // Upload to TwelveLabs index (single upload supports both engines)
        console.log('[Upload] Uploading to TwelveLabs index...');
        const task = await twelvelabs_client.tasks.create({
            indexId: indexId,
            videoFile: file, // Pass the File object directly
        });

        console.log('[Upload] Task created, Task ID:', task.id);

        // Wait for indexing to complete
        console.log('[Upload] Waiting for indexing to complete...');
        const completedTask = await twelvelabs_client.tasks.waitForDone(task.id, {
            callback: (task) => {
                console.log(`[Upload] Status: ${task.status}, Estimated time: ${task.estimatedTime || 0}s`);
            },
            sleepInterval: 5000, // Check every 5 seconds
        });

        if (completedTask.status !== 'ready') {
            console.error('[Upload] Video indexing failed, status:', completedTask.status);
            return NextResponse.json({
                error: 'Video indexing failed',
                status: completedTask.status
            }, { status: 500 });
        }

        console.log('[Upload] Video indexed successfully, Video ID:', completedTask.videoId);

        // Trigger tool detection and surgical analysis in parallel
        console.log('[Upload] Triggering post-processing (tool detection & surgical analysis)...');

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

        // Start both processes in parallel
        const [detectionResult, analysisResult] = await Promise.allSettled([
            fetch(`${baseUrl}/api/detect-tools/${completedTask.videoId}`, { method: 'POST' })
                .then(res => {
                    if (res.ok) {
                        console.log('[Upload] Tool detection started successfully');
                        return { success: true };
                    } else {
                        console.warn('[Upload] Tool detection failed to start');
                        return { success: false };
                    }
                })
                .catch(error => {
                    console.warn('[Upload] Tool detection error:', error);
                    return { success: false };
                }),

            fetch(`${baseUrl}/api/analysis/${completedTask.videoId}`, { method: 'POST' })
                .then(res => {
                    if (res.ok) {
                        console.log('[Upload] Surgical analysis started successfully');
                        return { success: true };
                    } else {
                        console.warn('[Upload] Surgical analysis failed to start');
                        return { success: false };
                    }
                })
                .catch(error => {
                    console.warn('[Upload] Surgical analysis error:', error);
                    return { success: false };
                })
        ]);

        console.log('[Upload] Post-processing triggered:', {
            toolDetection: detectionResult.status === 'fulfilled' ? 'started' : 'failed',
            surgicalAnalysis: analysisResult.status === 'fulfilled' ? 'started' : 'failed'
        });

        return NextResponse.json({
            success: true,
            message: 'Video uploaded and indexed successfully',
            videoId: completedTask.videoId,
            filename: file.name,
        }, { status: 200 });

    } catch (error) {
        console.error('[Upload] Error:', error);
        return NextResponse.json({
            error: 'Upload failed',
            message: error.message
        }, { status: 500 });
    }
}

