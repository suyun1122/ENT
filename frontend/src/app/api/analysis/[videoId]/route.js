import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { put, del } from '@vercel/blob';

export const dynamic = 'force-dynamic';

const BLOB_STORE_BASE_URL = process.env.BLOB_STORE_BASE_URL;

// Helper: get blob URL
function getBlobUrl(videoId) {
    if (!BLOB_STORE_BASE_URL) return null;
    return `${BLOB_STORE_BASE_URL}/analysis/${videoId}.json`;
}

// Helper: fetch existing blob data
async function fetchBlobData(videoId) {
    const blobUrl = getBlobUrl(videoId);
    if (!blobUrl) return null;

    try {
        const response = await fetch(`${blobUrl}?t=${Date.now()}`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' }
        });
        if (response.ok) {
            const data = await response.json();
            const lastUpdated = data._lastUpdated || 'unknown';
            console.log(`[Analysis] Loaded from Blob (updated: ${lastUpdated})`);
            return data;
        }
        return null;
    } catch (error) {
        console.log(`[Analysis] Blob fetch error: ${error.message}`);
        return null;
    }
}

// Helper: delete blob
async function deleteBlobIfExists(videoId) {
    const blobUrl = getBlobUrl(videoId);
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobUrl || !token) return false;

    try {
        await del(blobUrl, { token });
        return true;
    } catch (error) {
        return false;
    }
}

// Helper: save to blob
async function saveToBlob(videoId, data) {
    const blobPath = `analysis/${videoId}.json`;
    const token = process.env.BLOB_READ_WRITE_TOKEN;

    if (!token) {
        throw new Error('BLOB_READ_WRITE_TOKEN not configured');
    }

    const dataWithTimestamp = {
        ...data,
        _lastUpdated: new Date().toISOString()
    };

    await deleteBlobIfExists(videoId);
    await new Promise(r => setTimeout(r, 500));

    const blob = await put(blobPath, JSON.stringify(dataWithTimestamp, null, 2), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        cacheControlMaxAge: 0,
        token
    });

    console.log(`[Analysis] Saved to blob: ${blob.url}`);
    return dataWithTimestamp;
}

// GET: Fetch existing analysis data
export async function GET(request, { params }) {
    const { videoId } = await params;

    if (!videoId) {
        return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    console.log('[Analysis] GET request for video:', videoId);

    // 1. Try Vercel Blob Storage first
    const blobData = await fetchBlobData(videoId);
    if (blobData) {
        return NextResponse.json({
            status: 'completed',
            videoId,
            data: blobData
        });
    }

    // 2. Fallback to local filesystem (development only)
    if (!BLOB_STORE_BASE_URL) {
        const analysisPath = path.join(process.cwd(), 'public', 'analysis', `${videoId}.json`);
        if (fs.existsSync(analysisPath)) {
            try {
                console.log('[Analysis] Found in local filesystem (dev mode)');
                const analysisData = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
                return NextResponse.json({
                    status: 'completed',
                    videoId,
                    data: analysisData
                });
            } catch (error) {
                console.error('[Analysis] Error reading local file:', error);
            }
        }
    }

    console.log('[Analysis] Not found');
    return NextResponse.json({
        status: 'not_found',
        videoId,
        message: 'Surgical analysis not found. Use /timeline and /soap endpoints to generate.'
    });
}

// PATCH: Update SOAP note (for editing)
export async function PATCH(request, { params }) {
    const { videoId } = await params;

    if (!videoId) {
        return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    try {
        const body = await request.json();
        const { SOAP } = body;

        if (!SOAP) {
            return NextResponse.json({ error: 'SOAP data is required' }, { status: 400 });
        }

        console.log('[Analysis] PATCH - updating SOAP note for video:', videoId);

        // Load existing data
        let existingData = await fetchBlobData(videoId);

        if (!existingData) {
            // Try local filesystem as fallback
            const analysisPath = path.join(process.cwd(), 'public', 'analysis', `${videoId}.json`);
            if (fs.existsSync(analysisPath)) {
                existingData = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
            }
        }

        if (!existingData) {
            return NextResponse.json({
                error: 'Analysis data not found. Please generate analysis first.'
            }, { status: 404 });
        }

        // Update SOAP note
        const updatedData = {
            ...existingData,
            operative_note: {
                ...existingData.operative_note,
                SOAP: {
                    ...existingData.operative_note?.SOAP,
                    ...SOAP
                }
            }
        };

        // Save to blob
        if (process.env.BLOB_READ_WRITE_TOKEN) {
            const savedData = await saveToBlob(videoId, updatedData);
            return NextResponse.json({
                status: 'success',
                message: 'SOAP note updated successfully',
                data: savedData
            });
        } else {
            // Local filesystem fallback (development)
            const localPath = path.join(process.cwd(), 'public', 'analysis', `${videoId}.json`);
            fs.writeFileSync(localPath, JSON.stringify(updatedData, null, 2));
            return NextResponse.json({
                status: 'success',
                message: 'SOAP note updated successfully',
                data: updatedData
            });
        }

    } catch (error) {
        console.error('[Analysis] Error updating SOAP note:', error);
        return NextResponse.json({
            error: 'Failed to update SOAP note',
            details: error.message
        }, { status: 500 });
    }
}
