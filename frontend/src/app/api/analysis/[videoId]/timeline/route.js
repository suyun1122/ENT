import { NextResponse } from 'next/server';
import { TwelveLabs } from 'twelvelabs-js';
import { put, del } from '@vercel/blob';

// Route config for long TwelveLabs API calls
export const maxDuration = 180; // 3 minutes
export const dynamic = 'force-dynamic';

const BLOB_STORE_BASE_URL = process.env.BLOB_STORE_BASE_URL;

// Lazy TwelveLabs client
let twelvelabs_client = null;
function getTwelveLabsClient() {
    if (!twelvelabs_client) {
        twelvelabs_client = new TwelveLabs({ apiKey: process.env.TWELVELABS_API_KEY });
    }
    return twelvelabs_client;
}

// Timeline-only prompt
const timelinePrompt = `You are analyzing a full-length surgical video.

This task is for EDUCATIONAL and DEMONSTRATION purposes only.

Your task is to chapterize the surgery using the predefined surgical phases below.

## OUTPUT FORMAT

Return JSON only with no additional commentary:

\`\`\`json
{
  "chapters": [
    {
      "chapter_number": 1,
      "chapter_title": "Anesthesia & Positioning",
      "start_time": 0,
      "end_time": 120,
      "chapter_summary": "Patient positioned in prone position with appropriate padding. General anesthesia administered."
    }
  ]
}
\`\`\`

## PREDEFINED SURGICAL PHASES (use as chapter titles)

You MUST use one or more of the following standardized chapter titles:

1. "Anesthesia & Positioning"
2. "Surgical Approach & Incision"
3. "Exposure & Dissection"
4. "Main Procedure"
5. "Hemostasis & Inspection"
6. "Closure"
7. "Postoperative Care Preparation"

## CRITICAL RULES

- NEVER invent or assume clinical information not visible in the video.
- Use ONLY the predefined chapter titles listed above.
- Chapters must be chronological and non-overlapping.`;

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
            return await response.json();
        }
        return null;
    } catch (error) {
        console.log(`[Timeline] Blob fetch error: ${error.message}`);
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

    // Delete existing, then save
    await deleteBlobIfExists(videoId);
    await new Promise(r => setTimeout(r, 500));

    const blob = await put(blobPath, JSON.stringify(dataWithTimestamp, null, 2), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        cacheControlMaxAge: 0,
        token
    });

    console.log(`[Timeline] Saved to blob: ${blob.url}`);
    return dataWithTimestamp;
}

export async function POST(request, { params }) {
    const { videoId } = await params;

    if (!videoId) {
        return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    console.log(`[Timeline] ========================================`);
    console.log(`[Timeline] Starting timeline generation for ${videoId}`);

    try {
        // 1. Call TwelveLabs API
        console.log(`[Timeline] Calling TwelveLabs API...`);
        const startTime = Date.now();

        const response = await getTwelveLabsClient().analyze({
            videoId: videoId,
            prompt: timelinePrompt,
            temperature: 0.2
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Timeline] TwelveLabs API responded in ${elapsed}s`);

        // 2. Parse response
        let jsonString = response.data || response.response || "{}";
        jsonString = jsonString
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        const parsedData = JSON.parse(jsonString);
        console.log(`[Timeline] Parsed ${parsedData.chapters?.length || 0} chapters`);

        // 3. Merge with existing data
        let existingData = await fetchBlobData(videoId) || {};
        const finalData = {
            ...existingData,
            chapters: parsedData.chapters
        };

        // 4. Save to blob
        const savedData = await saveToBlob(videoId, finalData);

        console.log(`[Timeline] Completed successfully`);

        return NextResponse.json({
            status: 'completed',
            videoId,
            data: savedData
        });

    } catch (error) {
        console.error(`[Timeline] Error:`, error);
        return NextResponse.json({
            status: 'error',
            error: error.message
        }, { status: 500 });
    }
}
