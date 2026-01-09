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

export async function POST(request) {
    try {
        const { blobUrl, filename } = await request.json();

        if (!blobUrl || !filename) {
            return NextResponse.json({ error: 'blobUrl and filename are required' }, { status: 400 });
        }

        console.log('[Upload from Blob] Starting upload:', filename);
        console.log('[Upload from Blob] Blob URL:', blobUrl);

        // Get the index ID
        const indexId = process.env.NEXT_PUBLIC_TWELVELABS_MARENGO_INDEX_ID;
        if (!indexId) {
            return NextResponse.json({ error: 'Index ID not configured' }, { status: 500 });
        }

        // Download file from Blob
        console.log('[Upload from Blob] Downloading from Blob...');
        const blobResponse = await fetch(blobUrl);
        if (!blobResponse.ok) {
            throw new Error(`Failed to download from Blob: ${blobResponse.status}`);
        }

        const videoBuffer = await blobResponse.arrayBuffer();
        console.log('[Upload from Blob] Downloaded:', videoBuffer.byteLength, 'bytes');

        // Create a File-like object for the SDK
        const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });
        const videoFile = new File([videoBlob], filename, { type: 'video/mp4' });

        // Upload to TwelveLabs
        console.log('[Upload from Blob] Uploading to TwelveLabs...');
        const task = await getTwelveLabsClient().tasks.create({
            indexId: indexId,
            videoFile: videoFile,
        });

        console.log('[Upload from Blob] Task created, Task ID:', task.id);

        // Wait for indexing to complete
        console.log('[Upload from Blob] Waiting for indexing...');
        const completedTask = await getTwelveLabsClient().tasks.waitForDone(task.id, {
            callback: (task) => {
                console.log(`[Upload from Blob] Status: ${task.status}, Estimated time: ${task.estimatedTime || 0}s`);
            },
            sleepInterval: 5000,
        });

        console.log('[Upload from Blob] Indexing finished with status:', completedTask.status);

        if (completedTask.status !== 'ready') {
            throw new Error(`Video indexing failed with status: ${completedTask.status}`);
        }

        const videoId = completedTask.videoId;
        console.log('[Upload from Blob] Video indexed successfully, Video ID:', videoId);

        // Delete temp video from Blob
        try {
            await del(blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
            console.log('[Upload from Blob] Deleted temp video from Blob');
        } catch (deleteError) {
            console.warn('[Upload from Blob] Failed to delete temp video from Blob:', deleteError);
        }

        // Trigger tool detection and surgical analysis in parallel
        console.log('[Upload from Blob] Triggering post-processing...');
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

        // Start tool detection with blobUrl (but video is already deleted, so skip for now)
        // Tool detection will need to be handled differently
        Promise.allSettled([
            fetch(`${baseUrl}/api/analysis/${videoId}`, { method: 'POST' })
                .then(res => {
                    if (res.ok) console.log('[Upload from Blob] Surgical analysis started');
                    else console.warn('[Upload from Blob] Surgical analysis failed to start');
                })
                .catch(err => console.warn('[Upload from Blob] Surgical analysis error:', err))
        ]);

        return NextResponse.json({
            success: true,
            message: 'Video uploaded and indexed successfully',
            videoId: videoId,
            filename: filename,
        }, { status: 200 });

    } catch (error) {
        console.error('[Upload from Blob] Error:', error);
        return NextResponse.json({
            error: 'Upload failed',
            message: error.message
        }, { status: 500 });
    }
}
