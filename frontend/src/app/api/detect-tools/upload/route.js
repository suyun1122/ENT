import { NextResponse } from 'next/server';

// Railway backend URL for tool detection
const TOOL_DETECTION_BACKEND_URL = process.env.TOOL_DETECTION_BACKEND_URL;

export const maxDuration = 300; // 5 minutes for large uploads
export const dynamic = 'force-dynamic';

export async function POST(request) {
    /*
    Proxy video upload to Railway backend for tool detection
    This avoids CORS issues from browser -> Railway direct uploads
    */

    try {
        if (!TOOL_DETECTION_BACKEND_URL) {
            console.error('[Upload Proxy] TOOL_DETECTION_BACKEND_URL not configured');
            return NextResponse.json({
                error: 'Tool detection backend not configured'
            }, { status: 503 });
        }

        const formData = await request.formData();
        const videoId = formData.get('video_id');
        const video = formData.get('video');

        if (!videoId || !video) {
            return NextResponse.json({
                error: 'video_id and video are required'
            }, { status: 400 });
        }

        console.log(`[Upload Proxy] Forwarding video upload for ${videoId} to Railway...`);
        console.log(`[Upload Proxy] Video size: ${video.size} bytes`);

        // Forward to Railway
        const railwayFormData = new FormData();
        railwayFormData.append('video_id', videoId);
        railwayFormData.append('video', video);

        const response = await fetch(`${TOOL_DETECTION_BACKEND_URL}/detect/upload`, {
            method: 'POST',
            body: railwayFormData,
        });

        console.log(`[Upload Proxy] Railway response status: ${response.status}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Upload Proxy] Railway error: ${errorText}`);
            return NextResponse.json({
                error: 'Railway upload failed',
                message: errorText
            }, { status: response.status });
        }

        const result = await response.json();
        console.log(`[Upload Proxy] Railway response:`, result);

        return NextResponse.json(result);

    } catch (error) {
        console.error('[Upload Proxy] Error:', error);
        return NextResponse.json({
            error: 'Upload proxy failed',
            message: error.message
        }, { status: 500 });
    }
}
