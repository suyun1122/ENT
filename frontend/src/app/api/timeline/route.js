import { TwelveLabs } from "twelvelabs-js";

// Lazy initialization to avoid build-time errors
let twelvelabs_client = null;
function getTwelveLabsClient() {
    if (!twelvelabs_client) {
        twelvelabs_client = new TwelveLabs({ apiKey: process.env.TWELVELABS_API_KEY });
    }
    return twelvelabs_client;
}

export async function POST(request) {

    const { videoId, prompt } = await request.json();

    try {
        // Use analyze API with structured response format for chapter generation
        const res = await getTwelveLabsClient().analyze({
            videoId: videoId,
            prompt: prompt || "Divide this surgery into distinct phases with medical terminology. For each phase, provide a title, summary, start time, and end time.",
            responseFormat: {
                type: "json_schema",
                jsonSchema: {
                    type: "object",
                    properties: {
                        chapters: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    chapterNumber: { type: "number" },
                                    chapterTitle: { type: "string" },
                                    chapterSummary: { type: "string" },
                                    startSec: { type: "number" },
                                    endSec: { type: "number" }
                                },
                                required: ["chapterNumber", "chapterTitle", "startSec", "endSec"]
                            }
                        }
                    },
                    required: ["chapters"]
                }
            }
        });

        // Parse the JSON response
        const parsedData = JSON.parse(res.data);

        // Normalize to legacy format for backward compatibility
        // Frontend expects: start_time, end_time, chapter_title, chapter_summary
        // New API returns: startSec, endSec, chapterTitle, chapterSummary
        if (parsedData.chapters) {
            parsedData.chapters = parsedData.chapters.map(chapter => ({
                chapter_number: chapter.chapterNumber,
                chapter_title: chapter.chapterTitle,
                chapter_summary: chapter.chapterSummary || "",
                start_time: chapter.startSec,
                end_time: chapter.endSec
            }));
        }

        return new Response(JSON.stringify(parsedData), { status: 200 });

    } catch (error) {
        console.error("Error during chapter generation", error);

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
            code: 'timeline_error',
            error: 'Error generating timeline'
        }), { status: 500 });
    }

}