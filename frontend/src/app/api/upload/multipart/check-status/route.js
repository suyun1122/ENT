import { NextResponse } from 'next/server';

const TWELVELABS_API_BASE = 'https://api.twelvelabs.io/v1.3';

export async function POST(request) {
    try {
        const { uploadId } = await request.json();

        if (!uploadId) {
            return NextResponse.json({
                error: 'Upload ID is required'
            }, { status: 400 });
        }

        const apiKey = process.env.TWELVELABS_API_KEY;
        if (!apiKey) {
            return NextResponse.json({
                error: 'API key not configured'
            }, { status: 500 });
        }

        // Get upload status
        const response = await fetch(
            `${TWELVELABS_API_BASE}/assets/multipart-uploads/${uploadId}`,
            {
                method: 'GET',
                headers: {
                    'x-api-key': apiKey,
                },
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error('[Multipart Upload] Failed to get status:', error);
            throw new Error(`Failed to get status: ${response.status}`);
        }

        const data = await response.json();
        console.log('[Multipart Upload] Status:', data.status);

        return NextResponse.json({
            success: true,
            status: data.status,
            assetId: data.asset_id,
        });

    } catch (error) {
        console.error('[Multipart Upload] Error checking status:', error);
        return NextResponse.json({
            error: 'Failed to check status',
            message: error.message
        }, { status: 500 });
    }
}
