import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

// This endpoint handles large file uploads by storing them temporarily in Vercel Blob
export async function POST(request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        console.log('[Upload URL] Uploading file to Vercel Blob:', file.name, 'Size:', file.size);

        // Upload to Vercel Blob Storage (supports large files)
        const blob = await put(`temp-uploads/${Date.now()}-${file.name}`, file, {
            access: 'public',
            addRandomSuffix: true,
        });

        console.log('[Upload URL] File uploaded to Blob:', blob.url);

        return NextResponse.json({
            success: true,
            uploadUrl: blob.url,
            filename: file.name,
        });

    } catch (error) {
        console.error('[Upload URL] Error:', error);
        return NextResponse.json({
            error: 'Failed to upload file',
            message: error.message
        }, { status: 500 });
    }
}

export const config = {
    api: {
        bodyParser: false,
    },
};
