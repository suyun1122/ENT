import { NextResponse } from 'next/server';
import { list, put } from '@vercel/blob';

/**
 * API route to store and retrieve blob URLs for videos
 * This allows tool detection to access the original blob URL
 * even after navigating away from the upload page
 */

export async function GET(request, { params }) {
    /**
     * Get the blob URL for a video
     */
    try {
        const { videoId } = await params;

        if (!videoId) {
            return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
        }

        console.log(`[Video URL] Getting blob URL for: ${videoId}`);

        if (!process.env.BLOB_READ_WRITE_TOKEN) {
            return NextResponse.json({ error: 'Blob storage not configured' }, { status: 503 });
        }

        // Check if mapping exists
        const blobPrefix = `video-urls/${videoId}`;
        const { blobs } = await list({
            prefix: blobPrefix,
            token: process.env.BLOB_READ_WRITE_TOKEN
        });

        if (blobs.length > 0) {
            // Fetch the mapping content
            const response = await fetch(blobs[0].url);
            const data = await response.json();

            console.log(`[Video URL] Found blob URL for ${videoId}`);
            return NextResponse.json({
                status: 'found',
                videoId: videoId,
                blobUrl: data.blobUrl,
                createdAt: data.createdAt
            });
        }

        console.log(`[Video URL] No blob URL found for ${videoId}`);
        return NextResponse.json({
            status: 'not_found',
            videoId: videoId
        });

    } catch (error) {
        console.error('[Video URL] GET error:', error);
        return NextResponse.json({
            error: 'Failed to get video URL',
            message: error.message
        }, { status: 500 });
    }
}

export async function PUT(request, { params }) {
    /**
     * Store the blob URL for a video
     */
    try {
        const { videoId } = await params;

        if (!videoId) {
            return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
        }

        const body = await request.json();
        const { blobUrl } = body;

        if (!blobUrl) {
            return NextResponse.json({ error: 'Blob URL is required' }, { status: 400 });
        }

        console.log(`[Video URL] Storing blob URL for: ${videoId}`);

        if (!process.env.BLOB_READ_WRITE_TOKEN) {
            return NextResponse.json({ error: 'Blob storage not configured' }, { status: 503 });
        }

        // Store the mapping
        const mappingData = {
            videoId: videoId,
            blobUrl: blobUrl,
            createdAt: new Date().toISOString()
        };

        const blobPath = `video-urls/${videoId}.json`;
        const blob = await put(blobPath, JSON.stringify(mappingData), {
            access: 'public',
            token: process.env.BLOB_READ_WRITE_TOKEN,
            contentType: 'application/json',
        });

        console.log(`[Video URL] Stored blob URL for ${videoId}: ${blob.url}`);

        return NextResponse.json({
            status: 'stored',
            videoId: videoId,
            mappingUrl: blob.url
        });

    } catch (error) {
        console.error('[Video URL] PUT error:', error);
        return NextResponse.json({
            error: 'Failed to store video URL',
            message: error.message
        }, { status: 500 });
    }
}
