const { TwelveLabs } = require('twelvelabs-js');

const apiKey = "tlk_2JMS67D2VG2HDJ21ASZST356S4WZ";
const indexId = "6911d676f0196372818c5c3d";

const client = new TwelveLabs({ apiKey: apiKey });

const videoIds = [
    "6911d695773d9e332952bf6d",
    "6911d69646cd130f2b0de4e6",
    "6911d69bf141b311b3b9fbbb",
    "69129bb45126c58641e4d164",
    "6940bcd7fa043d83a4915323",
    "695231aa9f7b96b9f6cfc2ce"
];

async function fetchVideoMetadata() {
    console.log("Fetching video metadata from TwelveLabs API...\n");

    const results = [];

    for (const videoId of videoIds) {
        try {
            const video = await client.index.video.retrieve(indexId, videoId);
            const info = {
                videoId: videoId,
                filename: video.metadata?.filename || 'N/A',
                duration: video.metadata?.duration || 'N/A',
                hlsUrl: video.hls?.videoUrl || 'N/A'
            };
            results.push(info);
            console.log(`Video ID: ${videoId}`);
            console.log(`  Filename: ${info.filename}`);
            console.log(`  Duration: ${info.duration}s`);
            console.log();
        } catch (e) {
            console.log(`Video ID: ${videoId}`);
            console.log(`  Error: ${e.message}`);
            console.log();
        }
    }

    return results;
}

fetchVideoMetadata()
    .then(results => {
        console.log('\n=== Summary ===');
        console.log(JSON.stringify(results, null, 2));
    })
    .catch(console.error);
