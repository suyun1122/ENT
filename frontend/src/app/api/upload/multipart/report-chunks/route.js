import { NextResponse } from 'next/server';

const TWELVELABS_API_BASE = 'https://api.twelvelabs.io/v1.3';

export async function POST(request) {
    try {
        const { uploadId, chunks } = await request.json();

        if (!uploadId || !chunks || !Array.isArray(chunks)) {
            return NextResponse.json({
                error: 'Upload ID and chunks array are required'
            }, { status: 400 });
        }

        console.log('[Multipart Upload] Reporting', chunks.length, 'chunks for upload:', uploadId);

        const apiKey = process.env.TWELVELABS_API_KEY;
        if (!apiKey) {
            return NextResponse.json({
                error: 'API key not configured'
            }, { status: 500 });
        }

        // Report completed chunks
        const response = await fetch(
            `${TWELVELABS_API_BASE}/assets/multipart-uploads/${uploadId}`,
            {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chunks: chunks,
                }),
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error('[Multipart Upload] Failed to report chunks:', error);
            throw new Error(`Failed to report chunks: ${response.status}`);
        }

        const data = await response.json();
        console.log('[Multipart Upload] Chunks reported successfully');

        return NextResponse.json({
            success: true,
            data: data,
        });

    } catch (error) {
        console.error('[Multipart Upload] Error reporting chunks:', error);
        return NextResponse.json({
            error: 'Failed to report chunks',
            message: error.message
        }, { status: 500 });
    }
}
