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

    const { query, groupBy, threshold } = await request.json();

    const response = await getTwelveLabsClient().search.query({
        indexId: process.env.NEXT_PUBLIC_TWELVELABS_MARENGO_INDEX_ID,
        searchOptions: ['visual', 'audio'],
        queryText: query,
        groupBy: groupBy,
        threshold: threshold,
    })

    // Collect all results into an array
    const results = [];

    for await (const item of response) {
        if (item.id && item.clips) { // Grouped by videos
            console.log(` Video ID: ${item.id}`);
            for (const clip of item.clips) {
                console.log("  Clip:");
                console.log(`    Score: ${clip.score}`);
                console.log(`    Start: ${clip.start}`);
                console.log(`    End: ${clip.end}`);
                console.log(`    Video ID: ${clip.videoId}`);
                console.log(`    Confidence: ${clip.confidence}`);
                console.log(`    Thumbnail URL: ${clip.thumbnailUrl}`);
                results.push(clip);
            }
        } else { // Grouped by clips.
            console.log(`  Score: ${item.score}`);
            console.log(`  Start: ${item.start}`);
            console.log(`  End: ${item.end}`);
            console.log(`  Video ID: ${item.videoId}`);
            console.log(`  Confidence: ${item.confidence}`);
            console.log(`  Thumbnail URL: ${item.thumbnailUrl}`);
            if (item.transcription) {
                console.log(`  Transcription: ${item.transcription}`);
            }
            results.push(item);
        }
    }

    return new Response(JSON.stringify({ data: results }), { status: 200 });

}