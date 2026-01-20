import { handleUpload } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

// This route handles the client-side upload token generation
// It's called by the @vercel/blob/client upload function

export async function POST(request) {
    const body = await request.json();

    try {
        const jsonResponse = await handleUpload({
            body,
            request,
            onBeforeGenerateToken: async (pathname) => {
                // Validate the upload request
                // pathname is the desired blob path
                console.log('[Upload Token] Generating token for:', pathname);

                return {
                    allowedContentTypes: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/avi'],
                    maximumSizeInBytes: 200 * 1024 * 1024, // 200MB max
                    tokenPayload: JSON.stringify({
                        timestamp: Date.now(),
                    }),
                };
            },
            onUploadCompleted: async ({ blob, tokenPayload }) => {
                // Called after the file is uploaded to Vercel Blob
                console.log('[Upload Token] Upload completed:', blob.url);
                // We don't need to do anything here - the client will handle the next steps
            },
        });

        return NextResponse.json(jsonResponse);
    } catch (error) {
        console.error('[Upload Token] Error:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 400 }
        );
    }
}
