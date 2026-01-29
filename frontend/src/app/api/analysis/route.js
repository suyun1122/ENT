import { TwelveLabs, TwelvelabsApi } from 'twelvelabs-js';

const BLOB_STORE_BASE_URL = process.env.BLOB_STORE_BASE_URL;
const TOOL_DETECTION_BACKEND_URL = process.env.TOOL_DETECTION_BACKEND_URL;

// Lazy initialization to avoid build-time errors
let twelvelabs_client = null;
function getTwelveLabsClient() {
    if (!twelvelabs_client) {
        twelvelabs_client = new TwelveLabs({ apiKey: process.env.TWELVELABS_API_KEY });
    }
    return twelvelabs_client;
}

// Helper: fetch tool detection data from blob or Railway backend
async function fetchToolDetection(videoId) {
    // 1. Try Vercel Blob first
    if (BLOB_STORE_BASE_URL) {
        const blobUrl = `${BLOB_STORE_BASE_URL}/detections/${videoId}.json`;
        try {
            const response = await fetch(blobUrl);
            if (response.ok) {
                const data = await response.json();
                console.log(`[Chat] Loaded tool detection from Blob: ${data.detections?.length || 0} frames`);
                return data;
            }
        } catch (error) {
            console.log(`[Chat] Blob fetch error: ${error.message}`);
        }
    }

    // 2. Try Railway backend
    if (TOOL_DETECTION_BACKEND_URL) {
        try {
            const railwayUrl = `${TOOL_DETECTION_BACKEND_URL}/status/${videoId}`;
            console.log(`[Chat] Trying Railway backend: ${railwayUrl}`);
            const response = await fetch(railwayUrl);
            if (response.ok) {
                const result = await response.json();
                if (result.status === 'completed' && result.data) {
                    console.log(`[Chat] Loaded tool detection from Railway: ${result.data.detections?.length || 0} frames`);
                    return result.data;
                }
            }
        } catch (error) {
            console.log(`[Chat] Railway fetch error: ${error.message}`);
        }
    }

    console.log(`[Chat] No tool detection data found for ${videoId}`);
    return null;
}

// Helper: format tool detection summary for chat context
function formatToolDetectionForChat(toolData) {
    if (!toolData || !toolData.detections || toolData.detections.length === 0) {
        return null;
    }

    // Create summary of detected tools with time ranges
    const toolUsage = {};
    toolData.detections.forEach(detection => {
        detection.tools.forEach(tool => {
            if (!toolUsage[tool.class_name]) {
                toolUsage[tool.class_name] = {
                    count: 0,
                    timestamps: []
                };
            }
            toolUsage[tool.class_name].count++;
            toolUsage[tool.class_name].timestamps.push(detection.timestamp);
        });
    });

    // Format tool summary
    let summary = '\n\n[TOOL DETECTION DATA]\nThe following surgical tools were detected by AI vision analysis:\n';
    for (const [toolName, usage] of Object.entries(toolUsage)) {
        const minTime = Math.min(...usage.timestamps);
        const maxTime = Math.max(...usage.timestamps);
        const formatTime = (t) => {
            const mins = Math.floor(t / 60);
            const secs = Math.floor(t % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };
        summary += `- ${toolName}: ${usage.count} detections (${formatTime(minTime)} - ${formatTime(maxTime)})\n`;
    }
    summary += '\nUse this data when answering questions about tools used in the surgery.\n';

    return summary;
}

export async function POST(request) {

    /* Request prompt to TwelveLabs Pegasus model and return response. */

    const { userQuery, videoId } = await request.json();

    // Fetch tool detection data to enrich context
    const toolData = await fetchToolDetection(videoId);
    const toolContext = formatToolDetectionForChat(toolData);

    // Enrich the user query with tool detection context
    const enrichedQuery = toolContext ? `${userQuery}${toolContext}` : userQuery;

    try {
        // Call TwelveLabs API with enriched query (caching is handled by TanStack Query on the client)
        const response = await getTwelveLabsClient().analyze({
            videoId: videoId,
            prompt: enrichedQuery,
            temperature: 0.2
        });

        return new Response(JSON.stringify(response), { status: 200 });

    } catch (error) {
        console.error("Error during analysis", error);

        // Check if it's a video_not_ready error from TwelveLabs
        if (error.message && error.message.includes('video_not_ready')) {
            return new Response(JSON.stringify({
                code: 'video_not_ready',
                message: 'The video is still being indexed. Please try again once the indexing process is complete.'
            }), { status: 202 }); // 202 Accepted - request accepted but processing not complete
        }

        // Check if it's a parameter_invalid error (video not in index yet)
        if (error.body && error.body.code === 'parameter_invalid' &&
            error.body.message && error.body.message.includes('video_id parameter is invalid')) {
            return new Response(JSON.stringify({
                code: 'video_not_uploaded',
                message: 'The video is still being uploaded and processed. Please wait for the upload to complete.'
            }), { status: 202 }); // 202 Accepted - request accepted but processing not complete
        }

        return new Response(JSON.stringify({
            code: 'analysis_error',
            error: 'Error during analysis'
        }), { status: 500 });
    }
}