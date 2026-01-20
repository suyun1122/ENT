import { TwelveLabs } from 'twelvelabs-js';
import { NextResponse } from 'next/server';

// Route segment config
export const maxDuration = 60; // 1 minute should be enough now (just API call)
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
        const body = await request.json();
        const { blobUrl, filename } = body;

        if (!blobUrl || !filename) {
            return NextResponse.json({ error: 'blobUrl and filename are required' }, { status: 400 });
        }

        console.log('[Direct Upload] Starting upload from blob URL:', blobUrl);
        console.log('[Direct Upload] Filename:', filename);

        // Get the index ID
        const indexId = process.env.NEXT_PUBLIC_TWELVELABS_MARENGO_INDEX_ID;
        if (!indexId) {
            return NextResponse.json({ error: 'Index ID not configured' }, { status: 500 });
        }

        // Upload to TwelveLabs using URL (no download needed!)
        console.log('[Direct Upload] Sending URL to TwelveLabs...');
        const task = await getTwelveLabsClient().tasks.create({
            indexId: indexId,
            videoUrl: blobUrl,  // TwelveLabs will fetch from this URL directly
        });

        console.log('[Direct Upload] Task created, Task ID:', task.id);

        // Return with task ID and blob URL (for tool detection later)
        return NextResponse.json({
            success: true,
            message: 'Video upload started, indexing in progress',
            taskId: task.id,
            filename: filename,
            blobUrl: blobUrl,
            status: 'indexing',
        }, { status: 202 });

    } catch (error) {
        console.error('[Direct Upload] Error:', error);
        return NextResponse.json({
            error: 'Upload failed',
            message: error.message
        }, { status: 500 });
    }
}
