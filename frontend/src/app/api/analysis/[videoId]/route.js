import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { TwelveLabs } from 'twelvelabs-js';
import { put, head, del } from '@vercel/blob';

const twelvelabs_client = new TwelveLabs({ apiKey: process.env.TWELVELABS_API_KEY });
const processingStatus = new Map();

// Surgical analysis prompt
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

    // 1. Check Vercel Blob Storage first (if BLOB_READ_WRITE_TOKEN is set)
    if (process.env.BLOB_READ_WRITE_TOKEN) {
        try {
            const blobInfo = await head(`analysis/${videoId}.json`);
            if (blobInfo) {
                console.log('[Surgical Analysis] Found in Vercel Blob');
                const response = await fetch(blobInfo.url);
                const analysisData = await response.text();
                return NextResponse.json({
                    status: 'completed',
                    videoId,
                    data: JSON.parse(analysisData)
                });
            }
        } catch (error) {
            console.warn(`[Surgical Analysis] Failed to fetch from Vercel Blob for ${videoId}:`, error.message);
        }
    }

    // 2. Fallback to local filesystem (for development and pre-deployed videos)
    const analysisPath = path.join(process.cwd(), 'public', 'analysis', `${videoId}.json`);
    if (fs.existsSync(analysisPath)) {
        try {
            console.log('[Surgical Analysis] Found in local filesystem');
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

    // 3. Check if processing is in progress
    if (processingStatus.has(videoId)) {
        const status = processingStatus.get(videoId);
        console.log('[Surgical Analysis] Processing in progress:', status);
        return NextResponse.json({
            status: 'processing',
            videoId,
            ...status
        });
    }

    console.log('[Surgical Analysis] Not found');
    return NextResponse.json({
        status: 'not_found',
        videoId,
        message: 'Surgical analysis has not been run.'
    });
}

export async function POST(request, { params }) {
    const { videoId } = await params;

    if (!videoId) {
        return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    // Check for force refresh parameter
    const url = new URL(request.url);
    const force = url.searchParams.get('force') === 'true';

    console.log('[Surgical Analysis] POST request for video:', videoId, 'force:', force);

    // Check if already processing (unless force is true)
    if (processingStatus.has(videoId) && !force) {
        return NextResponse.json({
            status: 'already_processing',
            videoId,
            message: 'Surgical analysis is already being processed.'
        }, { status: 409 });
    }

    // If force refresh, delete existing cached files
    if (force) {
        console.log('[Surgical Analysis] Force refresh - deleting cached files');

        // Delete from local filesystem
        const analysisPath = path.join(process.cwd(), 'public', 'analysis', `${videoId}.json`);
        if (fs.existsSync(analysisPath)) {
            fs.unlinkSync(analysisPath);
            console.log('[Surgical Analysis] Deleted local file:', analysisPath);
        }

        // Delete from Vercel Blob Storage if available
        if (process.env.BLOB_READ_WRITE_TOKEN) {
            try {
                await del(`analysis/${videoId}.json`);
                console.log('[Surgical Analysis] Deleted from Vercel Blob Storage');
            } catch (blobError) {
                console.warn('[Surgical Analysis] Failed to delete from Vercel Blob (file may not exist):', blobError.message);
            }
        }

        // Clear processing status if exists
        if (processingStatus.has(videoId)) {
            processingStatus.delete(videoId);
        }
    }

    // Start processing
    processingStatus.set(videoId, { progress: 0, stage: 'initializing' });

    // Process asynchronously
    processSurgicalAnalysis(videoId).catch(error => {
        console.error('[Surgical Analysis] Processing error:', error);
        processingStatus.delete(videoId);
    });

    return NextResponse.json({
        status: 'started',
        videoId,
        message: force ? 'Surgical analysis force refresh started.' : 'Surgical analysis processing started.'
    });
}

async function processSurgicalAnalysis(videoId) {
    try {
        console.log(`[Surgical Analysis] Starting analysis for video ${videoId}`);

        processingStatus.set(videoId, { progress: 10, stage: 'calling_twelvelabs_api' });

        // Call TwelveLabs API
        const response = await twelvelabs_client.analyze({
            videoId: videoId,
            prompt: surgicalAnalysisPrompt,
            temperature: 0.2
        });

        processingStatus.set(videoId, { progress: 60, stage: 'parsing_response' });

        // Parse the response
        let jsonString = response.data || response.response || "{}";

        // Remove markdown code fences if present
        jsonString = jsonString
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        const parsedData = JSON.parse(jsonString);

        processingStatus.set(videoId, { progress: 80, stage: 'saving_results' });

        // Save to local filesystem first
        const localOutputPath = path.join(process.cwd(), 'public', 'analysis', `${videoId}.json`);

        // Ensure directory exists
        const dir = path.dirname(localOutputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(localOutputPath, JSON.stringify(parsedData, null, 2));
        console.log(`[Surgical Analysis] Saved to local file: ${localOutputPath}`);

        // Save to Vercel Blob if token is available
        if (process.env.BLOB_READ_WRITE_TOKEN) {
            try {
                const fileContent = fs.readFileSync(localOutputPath);
                const blob = await put(`analysis/${videoId}.json`, fileContent, {
                    access: 'public',
                    contentType: 'application/json'
                });
                console.log(`[Surgical Analysis] Uploaded to Vercel Blob: ${blob.url}`);
            } catch (blobError) {
                console.error(`[Surgical Analysis] Failed to upload to Vercel Blob:`, blobError);
            }
        }

        processingStatus.set(videoId, { progress: 100, stage: 'completed' });
        console.log(`[Surgical Analysis] Processing completed for video ${videoId}`);

        // Clean up status after a delay
        setTimeout(() => {
            processingStatus.delete(videoId);
        }, 60000); // 1 minute

    } catch (error) {
        console.error(`[Surgical Analysis] Error processing video ${videoId}:`, error);
        processingStatus.set(videoId, {
            progress: 0,
            stage: 'error',
            error: error.message
        });

        // Clean up error status after a delay
        setTimeout(() => {
            processingStatus.delete(videoId);
        }, 60000);

        throw error;
    }
}
