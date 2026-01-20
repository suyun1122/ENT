import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { TwelveLabs } from 'twelvelabs-js';
import { put, del } from '@vercel/blob';

// Route segment config - increase maxDuration for TwelveLabs API calls (30s-2min)
export const maxDuration = 180; // 3 minutes
export const dynamic = 'force-dynamic';

// Blob store base URL for direct access
const BLOB_STORE_BASE_URL = process.env.BLOB_STORE_BASE_URL;

// Helper function to get blob URL
function getBlobUrl(videoId) {
    if (!BLOB_STORE_BASE_URL) {
        console.log(`[Surgical Analysis] BLOB_STORE_BASE_URL not configured`);
        return null;
    }
    return `${BLOB_STORE_BASE_URL}/analysis/${videoId}.json`;
}

// Helper function to fetch existing blob data (with cache busting)
async function fetchBlobData(videoId) {
    const blobUrl = getBlobUrl(videoId);
    if (!blobUrl) return null;

    try {
        // Add cache busting to avoid CDN caching issues
        const urlWithCacheBust = `${blobUrl}?t=${Date.now()}`;
        const response = await fetch(urlWithCacheBust, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });
        if (response.ok) {
            const data = await response.json();
            // Log when data was last updated (if available)
            const lastUpdated = data._lastUpdated || 'unknown';
            console.log(`[Surgical Analysis] Loaded from Blob (updated: ${lastUpdated})`);
            return data;
        }
        console.log(`[Surgical Analysis] Blob fetch returned ${response.status}`);
        return null;
    } catch (error) {
        console.log(`[Surgical Analysis] Blob fetch error: ${error.message}`);
        return null;
    }
}

// Helper function to delete blob (with explicit token)
async function deleteBlobIfExists(videoId) {
    const blobUrl = getBlobUrl(videoId);
    const token = process.env.BLOB_READ_WRITE_TOKEN;

    if (!blobUrl || !token) {
        console.log(`[Surgical Analysis] Delete skipped: blobUrl=${!!blobUrl}, token=${!!token}`);
        return false;
    }

    try {
        console.log(`[Surgical Analysis] Attempting to delete blob at: ${blobUrl}`);
        await del(blobUrl, { token });
        console.log(`[Surgical Analysis] Successfully deleted blob`);
        return true;
    } catch (error) {
        // 404 is expected if blob doesn't exist - not an error
        if (error.message?.includes('not found') || error.message?.includes('404')) {
            console.log(`[Surgical Analysis] Blob not found (OK to proceed)`);
            return false;
        }
        console.error(`[Surgical Analysis] Delete error: ${error.message}`);
        return false;
    }
}

// Helper function to save to blob with retry
async function saveToBlobWithRetry(videoId, data, maxRetries = 3) {
    const blobPath = `analysis/${videoId}.json`;
    const token = process.env.BLOB_READ_WRITE_TOKEN;

    if (!token) {
        console.error(`[Surgical Analysis] BLOB_READ_WRITE_TOKEN is not set!`);
        throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
    }

    // Add timestamp for tracking when data was last updated
    const dataWithTimestamp = {
        ...data,
        _lastUpdated: new Date().toISOString()
    };

    console.log(`[Surgical Analysis] ===== SAVING TO BLOB =====`);
    console.log(`[Surgical Analysis] Path: ${blobPath}`);
    console.log(`[Surgical Analysis] Timestamp: ${dataWithTimestamp._lastUpdated}`);
    console.log(`[Surgical Analysis] Has chapters: ${dataWithTimestamp.chapters !== null && dataWithTimestamp.chapters !== undefined}`);
    console.log(`[Surgical Analysis] Has operative_note: ${dataWithTimestamp.operative_note !== null && dataWithTimestamp.operative_note !== undefined}`);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Try to delete existing blob first
            const deleted = await deleteBlobIfExists(videoId);
            console.log(`[Surgical Analysis] Delete before save: ${deleted ? 'deleted' : 'not found or failed'}`);

            // Delay after delete to ensure propagation
            await new Promise(resolve => setTimeout(resolve, deleted ? 1000 : 200));

            // Create new blob with explicit token
            const blob = await put(blobPath, JSON.stringify(dataWithTimestamp, null, 2), {
                access: 'public',
                contentType: 'application/json',
                addRandomSuffix: false,
                cacheControlMaxAge: 0,
                token
            });

            console.log(`[Surgical Analysis] ===== BLOB SAVED SUCCESSFULLY =====`);
            console.log(`[Surgical Analysis] URL: ${blob.url}`);
            console.log(`[Surgical Analysis] Timestamp: ${dataWithTimestamp._lastUpdated}`);
            return blob;
        } catch (error) {
            console.error(`[Surgical Analysis] Blob save attempt ${attempt + 1}/${maxRetries + 1} FAILED: ${error.message}`);
            console.error(`[Surgical Analysis] Error details:`, error);

            if (attempt === maxRetries) {
                console.error(`[Surgical Analysis] All ${maxRetries + 1} attempts failed!`);
                throw error;
            }

            // Wait longer before retry
            const delay = 1500 * (attempt + 1);
            console.log(`[Surgical Analysis] Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Lazy initialization to avoid build-time errors
let twelvelabs_client = null;
function getTwelveLabsClient() {
    if (!twelvelabs_client) {
        twelvelabs_client = new TwelveLabs({ apiKey: process.env.TWELVELABS_API_KEY });
    }
    return twelvelabs_client;
}
const processingStatus = new Map();

// Surgical analysis prompts - separate prompts for chapters and SOAP note
const chaptersOnlyPrompt = `You are analyzing a full-length surgical video.

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

const soapOnlyPrompt = `You are analyzing a full-length surgical video.

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
- Focus on what is surgically relevant and observable.`;

// Full surgical analysis prompt (both chapters and SOAP)
const surgicalAnalysisPrompt = `You are analyzing a full-length surgical video.

This task is for EDUCATIONAL and DEMONSTRATION purposes only.
The output is a video-derived operative summary and is NOT a substitute for a clinical operative report.

Your tasks:

1. Chapterize the surgery using the predefined surgical phases below.
2. Generate a SOAP-inspired operative note STRICTLY based on what is visible in the video.
   - CRITICAL: Write the operative note in FIRST-PERSON perspective
   - Use "I performed...", "I observed...", "I assessed...", "I identified..."
   - If certain details are not discernible, use phrases like "not fully visible" or "unable to confirm from video."
   - Include relevant timestamps using the format [HH:MM:SS] where appropriate

EXAMPLE of first-person voice:
✅ "I performed an incision at the level of T10-T11..."
✅ "I identified a herniated disc and proceeded with a microdiscectomy..."
❌ "The surgeon performed..." (INCORRECT — do NOT use third person)

3. Return JSON only, with no additional commentary.

## OUTPUT FORMAT

\`\`\`json
{
  "chapters": [
    {
      "chapter_number": 1,
      "chapter_title": "Anesthesia & Positioning",
      "start_time": 0,
      "end_time": 120,
      "chapter_summary": "Patient positioned in prone position with appropriate padding. General anesthesia administered."
    },
    {
      "chapter_number": 2,
      "chapter_title": "Surgical Approach & Incision",
      "start_time": 120,
      "end_time": 350,
      "chapter_summary": "Midline incision performed. Dissection through subcutaneous tissue and fascia."
    }
  ],
  "operative_note": {
    "title": "Lumbar Microdiscectomy (Example)",
    "SOAP": {
      "Subjective": "I performed a lumbar microdiscectomy on a patient with symptomatic disc herniation. [Details as visible in video]",
      "Objective": "I identified [specific anatomical findings]. I observed [intraoperative findings].",
      "Assessment": "I assessed the procedure as [outcome]. [Complications or concerns if visible].",
      "Plan": "I closed the wound in layers. [Postoperative plan as indicated by procedure]."
    }
  }
}
\`\`\`

## PREDEFINED SURGICAL PHASES (use as chapter titles)

You MUST use one or more of the following standardized chapter titles.
If a phase is not present in this video, skip it.

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
- Chapters must be chronological and non-overlapping.
- Write the entire operative note in FIRST-PERSON PAST TENSE.
- If you cannot determine a detail, acknowledge it (e.g., "specifics not visible").
- Focus on what is surgically relevant and observable.

## STYLE GUIDELINES

- Use a neutral, professional surgical tone.
- Write in the past tense.
- Avoid timestamps in the operative note text.
- Do NOT over-summarize or embellish.
- Clarity and safety take precedence over completeness.`;

export async function GET(request, { params }) {
    const { videoId } = await params;

    if (!videoId) {
        return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    console.log('[Surgical Analysis] GET request for video:', videoId);

    // 1. Check if ANY processing is in progress for this videoId
    // Check all possible processing keys: videoId-all, videoId-chapters, videoId-soap
    const processingKeys = [`${videoId}-all`, `${videoId}-chapters`, `${videoId}-soap`];
    for (const key of processingKeys) {
        if (processingStatus.has(key)) {
            const status = processingStatus.get(key);
            // Only report as processing if actively processing (not completed/error)
            if (status.stage !== 'completed' && status.stage !== 'error') {
                console.log(`[Surgical Analysis] Processing in progress (${key}):`, status);
                return NextResponse.json({
                    status: 'processing',
                    videoId,
                    processingType: key.split('-')[1], // 'all', 'chapters', or 'soap'
                    ...status
                });
            }
        }
    }

    // 2. Check Vercel Blob Storage (using direct URL fetch)
    const blobData = await fetchBlobData(videoId);
    if (blobData) {
        // Check if partial data is null (meaning partial refresh is in progress but status was cleared)
        // This can happen if the processingStatus was cleared but data hasn't been updated yet
        const hasValidChapters = blobData.chapters !== null && blobData.chapters !== undefined;
        const hasValidSOAP = blobData.operative_note !== null && blobData.operative_note !== undefined;

        console.log(`[Surgical Analysis] Blob data: chapters=${hasValidChapters}, soap=${hasValidSOAP}`);

        return NextResponse.json({
            status: 'completed',
            videoId,
            data: blobData
        });
    }

    // 3. Fallback to local filesystem ONLY if Blob is not configured (development only)
    // In production (BLOB_STORE_BASE_URL is set), we should NOT use local files
    // because they might be stale (deployed with build, never updated)
    if (!BLOB_STORE_BASE_URL) {
        const analysisPath = path.join(process.cwd(), 'public', 'analysis', `${videoId}.json`);
        if (fs.existsSync(analysisPath)) {
            try {
                console.log('[Surgical Analysis] Found in local filesystem (dev mode)');
                const analysisData = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
                return NextResponse.json({
                    status: 'completed',
                    videoId,
                    data: analysisData
                });
            } catch (error) {
                console.error('[Surgical Analysis] Error reading local file:', error);
            }
        }
    }

    console.log('[Surgical Analysis] Not found');
    return NextResponse.json({
        status: 'not_found',
        videoId,
        message: 'Surgical analysis has not been run.'
    });
}

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

        console.log('[Surgical Analysis] PATCH request - updating SOAP note for video:', videoId);

        // 1. Try to load existing data from Vercel Blob first
        let existingData = await fetchBlobData(videoId);

        // 2. If not in Blob, try local filesystem
        if (!existingData) {
            const analysisPath = path.join(process.cwd(), 'public', 'analysis', `${videoId}.json`);
            if (fs.existsSync(analysisPath)) {
                existingData = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
                console.log('[Surgical Analysis] Loaded existing data from filesystem');
            }
        }

        if (!existingData) {
            return NextResponse.json({
                error: 'Analysis data not found. Please generate analysis first.'
            }, { status: 404 });
        }

        // 3. Update SOAP note
        const updatedData = {
            ...existingData,
            operative_note: {
                ...existingData.operative_note,
                SOAP: {
                    ...existingData.operative_note.SOAP,
                    ...SOAP
                }
            }
        };

        // 4. Save to Vercel Blob (primary storage for production)
        if (process.env.BLOB_READ_WRITE_TOKEN) {
            try {
                await saveToBlobWithRetry(videoId, updatedData);
                console.log('[Surgical Analysis] Updated SOAP sections:', Object.keys(SOAP));
            } catch (blobError) {
                console.error('[Surgical Analysis] Failed to update Blob:', blobError);
                throw new Error(`Failed to save to Blob Storage: ${blobError.message}`);
            }
        } else {
            // 5. Fallback to local filesystem (development only)
            try {
                const localOutputPath = path.join(process.cwd(), 'public', 'analysis', `${videoId}.json`);
                const dir = path.dirname(localOutputPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(localOutputPath, JSON.stringify(updatedData, null, 2));
                console.log('[Surgical Analysis] Updated local file (development mode)');
            } catch (fsError) {
                console.error('[Surgical Analysis] Failed to update local file:', fsError);
                // In production (read-only filesystem), this is expected - don't throw error
                if (process.env.VERCEL) {
                    console.log('[Surgical Analysis] Skipping local file save in production (read-only filesystem)');
                } else {
                    throw fsError;
                }
            }
        }

        return NextResponse.json({
            status: 'success',
            message: 'SOAP note updated successfully',
            data: updatedData
        });

    } catch (error) {
        console.error('[Surgical Analysis] Error updating SOAP note:', error);
        return NextResponse.json({
            error: 'Failed to update SOAP note',
            details: error.message
        }, { status: 500 });
    }
}

export async function POST(request, { params }) {
    const { videoId } = await params;

    if (!videoId) {
        return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    // Check for parameters
    const url = new URL(request.url);
    const force = url.searchParams.get('force') === 'true';
    const type = url.searchParams.get('type') || 'all'; // 'all', 'chapters', 'soap'

    console.log('[Surgical Analysis] POST request for video:', videoId, 'force:', force, 'type:', type);

    // Validate type parameter
    if (!['all', 'chapters', 'soap'].includes(type)) {
        return NextResponse.json({
            error: 'Invalid type parameter. Must be "all", "chapters", or "soap".'
        }, { status: 400 });
    }

    const processingKey = `${videoId}-${type}`;

    // Check if already processing (unless force is true)
    if (processingStatus.has(processingKey) && !force) {
        const currentStatus = processingStatus.get(processingKey);
        // Only block if actively processing (not completed or errored)
        if (currentStatus.stage !== 'completed' && currentStatus.stage !== 'error') {
            return NextResponse.json({
                status: 'already_processing',
                videoId,
                message: 'Surgical analysis is already being processed.'
            }, { status: 409 });
        }
        // If completed or errored, clear the status and allow new request
        processingStatus.delete(processingKey);
    }

    // If force refresh AND type is 'all', delete existing cached files
    if (force && type === 'all') {
        console.log('[Surgical Analysis] Force refresh - deleting cached files');

        // Delete from local filesystem
        const analysisPath = path.join(process.cwd(), 'public', 'analysis', `${videoId}.json`);
        if (fs.existsSync(analysisPath)) {
            fs.unlinkSync(analysisPath);
            console.log('[Surgical Analysis] Deleted local file:', analysisPath);
        }

        // Delete from Vercel Blob Storage
        await deleteBlobIfExists(videoId);

        // Clear processing status if exists
        if (processingStatus.has(processingKey)) {
            processingStatus.delete(processingKey);
        }
    }

    // For partial refresh (chapters or soap only), we DON'T nullify the existing data anymore
    // Instead, we'll use the processing status to signal that refresh is in progress
    // This prevents data loss if the refresh fails
    if (type !== 'all') {
        console.log(`[Surgical Analysis] Partial refresh (${type}) - keeping existing data until new data is ready`);
    }

    // Start processing
    processingStatus.set(processingKey, { progress: 0, stage: 'initializing' });

    const typeMessages = {
        'all': 'Full surgical analysis',
        'chapters': 'Timeline/chapters analysis',
        'soap': 'SOAP note analysis'
    };

    // Process SYNCHRONOUSLY to avoid Vercel serverless termination issues
    // This makes the request longer but ensures the processing completes
    try {
        console.log(`[Surgical Analysis] Starting synchronous ${type} processing...`);
        await processSurgicalAnalysis(videoId, type);
        console.log(`[Surgical Analysis] Synchronous ${type} processing completed!`);

        return NextResponse.json({
            status: 'completed',
            videoId,
            type,
            message: `${typeMessages[type]} ${force ? 'force refresh ' : ''}completed.`
        });
    } catch (error) {
        console.error('[Surgical Analysis] Processing error:', error);
        processingStatus.delete(processingKey);

        return NextResponse.json({
            status: 'error',
            videoId,
            type,
            message: `${typeMessages[type]} failed: ${error.message}`
        }, { status: 500 });
    }
}

async function processSurgicalAnalysis(videoId, type = 'all') {
    const processingKey = `${videoId}-${type}`;

    try {
        console.log(`[Surgical Analysis] ========================================`);
        console.log(`[Surgical Analysis] Starting ${type} analysis for video ${videoId}`);
        console.log(`[Surgical Analysis] Timestamp: ${new Date().toISOString()}`);

        processingStatus.set(processingKey, { progress: 10, stage: 'calling_twelvelabs_api' });

        // Select the appropriate prompt based on type
        let prompt;
        switch (type) {
            case 'chapters':
                prompt = chaptersOnlyPrompt;
                break;
            case 'soap':
                prompt = soapOnlyPrompt;
                break;
            default:
                prompt = surgicalAnalysisPrompt;
        }

        // Call TwelveLabs API
        console.log(`[Surgical Analysis] Calling TwelveLabs API... (this typically takes 30s-2min)`);
        const startTime = Date.now();
        const response = await getTwelveLabsClient().analyze({
            videoId: videoId,
            prompt: prompt,
            temperature: 0.2
        });
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Surgical Analysis] TwelveLabs API responded in ${elapsed}s`);

        processingStatus.set(processingKey, { progress: 60, stage: 'parsing_response' });

        // Parse the response
        let jsonString = response.data || response.response || "{}";
        console.log(`[Surgical Analysis] Raw response length: ${jsonString.length} chars`);

        // Remove markdown code fences if present
        jsonString = jsonString
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        console.log(`[Surgical Analysis] Parsing JSON response...`);
        const parsedData = JSON.parse(jsonString);
        console.log(`[Surgical Analysis] Parsed data - chapters: ${!!parsedData.chapters}, operative_note: ${!!parsedData.operative_note}`);

        processingStatus.set(processingKey, { progress: 80, stage: 'saving_results' });

        // For partial updates (chapters or soap), we need to merge with existing data
        let finalData = parsedData;

        if (type !== 'all') {
            // Load existing data first (try Blob, then filesystem)
            let existingData = await fetchBlobData(videoId);

            if (!existingData) {
                const analysisPath = path.join(process.cwd(), 'public', 'analysis', `${videoId}.json`);
                if (fs.existsSync(analysisPath)) {
                    existingData = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
                    console.log(`[Surgical Analysis] Loaded existing data from filesystem for merging`);
                }
            }

            if (existingData) {
                // Merge: update only the part that was regenerated
                if (type === 'chapters') {
                    finalData = {
                        ...existingData,
                        chapters: parsedData.chapters
                    };
                } else if (type === 'soap') {
                    finalData = {
                        ...existingData,
                        operative_note: parsedData.operative_note
                    };
                }
            } else {
                // No existing data - for partial types, we might need to initialize missing parts
                console.log(`[Surgical Analysis] No existing data found for partial merge`);
                if (type === 'chapters') {
                    finalData = {
                        chapters: parsedData.chapters,
                        operative_note: null
                    };
                } else if (type === 'soap') {
                    finalData = {
                        chapters: null,
                        operative_note: parsedData.operative_note
                    };
                }
            }
        }

        console.log(`[Surgical Analysis] Final data to save:`);
        console.log(`[Surgical Analysis]   - chapters: ${finalData.chapters ? finalData.chapters.length + ' chapters' : 'null'}`);
        console.log(`[Surgical Analysis]   - operative_note: ${finalData.operative_note ? 'present' : 'null'}`);

        // Save to Vercel Blob FIRST (works in production)
        if (process.env.BLOB_READ_WRITE_TOKEN) {
            try {
                await saveToBlobWithRetry(videoId, finalData);
            } catch (blobError) {
                console.error(`[Surgical Analysis] Failed to upload to Vercel Blob:`, blobError);
            }
        } else {
            // Local filesystem only for development (no Blob configured)
            try {
                const localOutputPath = path.join(process.cwd(), 'public', 'analysis', `${videoId}.json`);
                const dir = path.dirname(localOutputPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(localOutputPath, JSON.stringify(finalData, null, 2));
                console.log(`[Surgical Analysis] Saved to local file: ${localOutputPath}`);
            } catch (fsError) {
                console.log(`[Surgical Analysis] Local file save skipped`);
            }
        }

        processingStatus.set(processingKey, { progress: 100, stage: 'completed' });
        console.log(`[Surgical Analysis] ${type} processing completed for video ${videoId}`);

        // Clean up status after a delay
        setTimeout(() => {
            processingStatus.delete(processingKey);
        }, 60000); // 1 minute

    } catch (error) {
        console.error(`[Surgical Analysis] Error processing video ${videoId}:`, error);
        processingStatus.set(processingKey, {
            progress: 0,
            stage: 'error',
            error: error.message
        });

        // Clean up error status after a delay
        setTimeout(() => {
            processingStatus.delete(processingKey);
        }, 60000);

        throw error;
    }
}
