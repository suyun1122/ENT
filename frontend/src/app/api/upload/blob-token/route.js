import { NextResponse } from 'next/server';
import { handleUpload } from '@vercel/blob/client';

export async function POST(request) {
    const body = await request.json();

    try {
        const jsonResponse = await handleUpload({
            body,
            request,
            onBeforeGenerateToken: async (pathname) => {
                // Validate the upload (optional)
                return {
                    allowedContentTypes: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'],
                    maximumSizeInBytes: 4 * 1024 * 1024 * 1024, // 4GB max
                    addRandomSuffix: true, // Allow same filename to be uploaded multiple times
                    tokenPayload: JSON.stringify({
                        uploadedAt: new Date().toISOString(),
                    }),
                };
            },
            onUploadCompleted: async ({ blob, tokenPayload }) => {
                console.log('[Blob Upload] Completed:', blob.url);
            },
        });

        return NextResponse.json(jsonResponse);
    } catch (error) {
        console.error('[Blob Token] Error:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 400 }
        );
    }
}
