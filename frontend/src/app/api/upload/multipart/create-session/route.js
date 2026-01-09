import { NextResponse } from 'next/server';

const TWELVELABS_API_BASE = 'https://api.twelvelabs.io/v1.3';

export async function POST(request) {
    try {
        const { filename, fileSize } = await request.json();

        if (!filename || !fileSize) {
            return NextResponse.json({
                error: 'Filename and file size are required'
            }, { status: 400 });
        }

        console.log('[Multipart Upload] Creating session for:', filename, 'Size:', fileSize, 'bytes');

        const apiKey = process.env.TWELVELABS_API_KEY;
        if (!apiKey) {
            return NextResponse.json({
                error: 'API key not configured'
            }, { status: 500 });
        }

        // Create multipart upload session
        const response = await fetch(`${TWELVELABS_API_BASE}/assets/multipart-uploads`, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                file_name: filename,
                file_size: fileSize,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[Multipart Upload] Failed to create session:', error);
            throw new Error(`Failed to create upload session: ${response.status}`);
        }

        const data = await response.json();
        console.log('[Multipart Upload] Session created successfully');
        console.log('[Multipart Upload] Upload ID:', data.upload_id);
        console.log('[Multipart Upload] Asset ID:', data.asset_id);
        console.log('[Multipart Upload] Chunk size:', data.chunk_size);
        console.log('[Multipart Upload] Upload URLs:', data.upload_urls?.length);

        return NextResponse.json({
            success: true,
            uploadId: data.upload_id,
            assetId: data.asset_id,
            uploadUrls: data.upload_urls,
            chunkSize: data.chunk_size,
        });

    } catch (error) {
        console.error('[Multipart Upload] Error creating session:', error);
        return NextResponse.json({
            error: 'Failed to create upload session',
            message: error.message
        }, { status: 500 });
    }
}
