import { TwelveLabs } from 'twelvelabs-js';
import { NextResponse } from 'next/server';

// Route segment config for large file uploads (200MB max)
export const maxDuration = 300; // 5 minutes for large uploads
export const dynamic = 'force-dynamic';

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
        const formData = await request.formData();
        const videoFile = formData.get('video');
        const filename = formData.get('filename');

        if (!videoFile || !filename) {
            return NextResponse.json({ error: 'video and filename are required' }, { status: 400 });
        }

        console.log('[Direct Upload] Starting upload:', filename);
        console.log('[Direct Upload] File size:', videoFile.size, 'bytes');

        // Get the index ID
        const indexId = process.env.NEXT_PUBLIC_TWELVELABS_MARENGO_INDEX_ID;
        if (!indexId) {
            return NextResponse.json({ error: 'Index ID not configured' }, { status: 500 });
        }

        // Convert to File object if needed
        const file = new File([videoFile], filename, { type: videoFile.type || 'video/mp4' });

        // Upload directly to TwelveLabs
        console.log('[Direct Upload] Uploading to TwelveLabs...');
        const task = await getTwelveLabsClient().tasks.create({
            indexId: indexId,
            videoFile: file,
        });

        console.log('[Direct Upload] Task created, Task ID:', task.id);

        // Return immediately with task ID - don't wait for indexing
        return NextResponse.json({
            success: true,
            message: 'Video upload started, indexing in progress',
            taskId: task.id,
            filename: filename,
            status: 'indexing',
        }, { status: 202 }); // 202 Accepted

    } catch (error) {
        console.error('[Direct Upload] Error:', error);
        return NextResponse.json({
            error: 'Upload failed',
            message: error.message
        }, { status: 500 });
    }
}
