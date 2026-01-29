import { NextResponse } from 'next/server';
import { TwelveLabs } from 'twelvelabs-js';
import { put, del } from '@vercel/blob';

// Route config for long TwelveLabs API calls
export const maxDuration = 180; // 3 minutes
export const dynamic = 'force-dynamic';

const BLOB_STORE_BASE_URL = process.env.BLOB_STORE_BASE_URL;

const TOOL_DETECTION_BACKEND_URL = process.env.TOOL_DETECTION_BACKEND_URL;

// Helper: fetch tool detection data from blob or Railway backend
async function fetchToolDetection(videoId) {
    // 1. Try Vercel Blob first
    if (BLOB_STORE_BASE_URL) {
        const blobUrl = `${BLOB_STORE_BASE_URL}/detections/${videoId}.json`;
        try {
            const response = await fetch(blobUrl);
            if (response.ok) {
                const data = await response.json();
                console.log(`[SOAP] Loaded tool detection from Blob: ${data.detections?.length || 0} frames`);
                return data;
            }
        } catch (error) {
            console.log(`[SOAP] Blob fetch error: ${error.message}`);
        }
    }

    // 2. Try Railway backend
    if (TOOL_DETECTION_BACKEND_URL) {
        try {
            const railwayUrl = `${TOOL_DETECTION_BACKEND_URL}/status/${videoId}`;
            console.log(`[SOAP] Trying Railway backend: ${railwayUrl}`);
            const response = await fetch(railwayUrl);
            if (response.ok) {
                const result = await response.json();
                if (result.status === 'completed' && result.data) {
                    console.log(`[SOAP] Loaded tool detection from Railway: ${result.data.detections?.length || 0} frames`);
                    return result.data;
                }
            }
        } catch (error) {
            console.log(`[SOAP] Railway fetch error: ${error.message}`);
        }
    }

    console.log(`[SOAP] No tool detection data found for ${videoId}`);
    return null;
}

// Helper: format tool detection for prompt
function formatToolDetectionForPrompt(toolData) {
    if (!toolData || !toolData.detections || toolData.detections.length === 0) {
        return null;
    }

    // Create a summary of tool usage with timestamps
    const toolUsage = {};
    toolData.detections.forEach(detection => {
        detection.tools.forEach(tool => {
            if (!toolUsage[tool.class_name]) {
                toolUsage[tool.class_name] = [];
            }
            toolUsage[tool.class_name].push({
                timestamp: detection.timestamp,
                confidence: tool.confidence
            });
        });
    });

    // Format as readable text
    let summary = 'DETECTED SURGICAL TOOLS (from AI vision model):\n';
    for (const [toolName, usages] of Object.entries(toolUsage)) {
        const timestamps = usages.map(u => {
            const mins = Math.floor(u.timestamp / 60);
            const secs = Math.floor(u.timestamp % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        });
        // Group consecutive timestamps into ranges
        const uniqueTimestamps = [...new Set(timestamps)];
        summary += `- ${toolName}: detected at ${uniqueTimestamps.slice(0, 10).join(', ')}${uniqueTimestamps.length > 10 ? ` (and ${uniqueTimestamps.length - 10} more)` : ''}\n`;
    }

    return summary;
}

// Lazy TwelveLabs client
let twelvelabs_client = null;
function getTwelveLabsClient() {
    if (!twelvelabs_client) {
        twelvelabs_client = new TwelveLabs({ apiKey: process.env.TWELVELABS_API_KEY });
    }
    return twelvelabs_client;
}

// SOAP-only prompt
const soapPrompt = `You are analyzing a full-length surgical video.

This task is for EDUCATIONAL and DEMONSTRATION purposes only.
The output is a video-derived operative summary and is NOT a substitute for a clinical operative report.

Your task is to generate a SOAP-inspired operative note STRICTLY based on what is visible in the video.
- CRITICAL: Write the operative note in FIRST-PERSON perspective
- Use "I performed...", "I observed...", "I assessed...", "I identified..."
- If certain details are not discernible, use phrases like "not fully visible" or "unable to confirm from video."

EXAMPLE of first-person voice:
✅ "I performed an incision at the level of T10-T11..."
✅ "I identified a herniated disc and proceeded with a microdiscectomy..."
❌ "The surgeon performed..." (INCORRECT — do NOT use third person)

## OUTPUT FORMAT

Return JSON only with no additional commentary:

\`\`\`json
{
  "operative_note": {
    "title": "Lumbar Microdiscectomy (Example)",
    "SOAP": {
      "Subjective": "I performed a lumbar microdiscectomy on a patient with symptomatic disc herniation.",
      "Objective": "I identified [specific anatomical findings]. I observed [intraoperative findings].",
      "Assessment": "I assessed the procedure as [outcome]. [Complications or concerns if visible].",
      "Plan": "I closed the wound in layers. [Postoperative plan as indicated by procedure]."
    }
  }
}
\`\`\`

## CRITICAL RULES

- NEVER invent or assume clinical information not visible in the video.
- Write the entire operative note in FIRST-PERSON PAST TENSE.
- If you cannot determine a detail, acknowledge it (e.g., "specifics not visible").
- Focus on what is surgically relevant and observable.
- If tool detection data is provided below, incorporate the detected tools into the Objective section.`;

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
        console.log(`[SOAP] Blob fetch error: ${error.message}`);
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

    console.log(`[SOAP] Saved to blob: ${blob.url}`);
    return dataWithTimestamp;
}

export async function POST(request, { params }) {
    const { videoId } = await params;

    if (!videoId) {
        return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    console.log(`[SOAP] ========================================`);
    console.log(`[SOAP] Starting SOAP note generation for ${videoId}`);

    try {
        // 1. Fetch tool detection data to enrich prompt
        const toolData = await fetchToolDetection(videoId);
        const toolContext = formatToolDetectionForPrompt(toolData);

        // 2. Build enriched prompt
        let enrichedPrompt = soapPrompt;
        if (toolContext) {
            enrichedPrompt = `${soapPrompt}\n\n## REFERENCE DATA\n\n${toolContext}\nUse this tool detection data to provide accurate tool names and usage times in the operative note.`;
            console.log(`[SOAP] Enriched prompt with tool detection data`);
        } else {
            console.log(`[SOAP] No tool detection data available, using base prompt`);
        }

        // 3. Call TwelveLabs API
        console.log(`[SOAP] Calling TwelveLabs API...`);
        const startTime = Date.now();

        const response = await getTwelveLabsClient().analyze({
            videoId: videoId,
            prompt: enrichedPrompt,
            temperature: 0.2
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[SOAP] TwelveLabs API responded in ${elapsed}s`);

        // 2. Parse response
        let jsonString = response.data || response.response || "{}";
        jsonString = jsonString
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        const parsedData = JSON.parse(jsonString);
        console.log(`[SOAP] Parsed operative_note: ${!!parsedData.operative_note}`);

        // 3. Merge with existing data
        let existingData = await fetchBlobData(videoId) || {};
        const finalData = {
            ...existingData,
            operative_note: parsedData.operative_note
        };

        // 4. Save to blob
        const savedData = await saveToBlob(videoId, finalData);

        console.log(`[SOAP] Completed successfully`);

        return NextResponse.json({
            status: 'completed',
            videoId,
            data: savedData
        });

    } catch (error) {
        console.error(`[SOAP] Error:`, error);
        return NextResponse.json({
            status: 'error',
            error: error.message
        }, { status: 500 });
    }
}
