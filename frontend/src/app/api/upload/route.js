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

        // Trigger tool detection
        console.log('[Upload] Triggering tool detection...');
        try {
            const detectionResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/detect-tools/${completedTask.videoId}`, {
                method: 'POST',
            });

            if (!detectionResponse.ok) {
                console.warn('[Upload] Tool detection failed to start, but video was uploaded successfully');
            } else {
                console.log('[Upload] Tool detection started successfully');
            }
        } catch (detectionError) {
            console.warn('[Upload] Tool detection error:', detectionError);
            // Continue even if detection fails
        }

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

