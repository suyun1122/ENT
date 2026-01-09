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

        // Return immediately with task ID - don't wait for indexing
        // Frontend will poll for status
        return NextResponse.json({
            success: true,
            message: 'Video upload started, indexing in progress',
            taskId: task.id,
            blobUrl: blobUrl,
            filename: filename,
            status: 'indexing',
        }, { status: 202 }); // 202 Accepted

    } catch (error) {
        console.error('[Upload from Blob] Error:', error);
        return NextResponse.json({
            error: 'Upload failed',
            message: error.message
        }, { status: 500 });
    }
}
