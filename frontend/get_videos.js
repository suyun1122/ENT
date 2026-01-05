const { TwelveLabs } = require('twelvelabs-js');

const apiKey = "tlk_2JMS67D2VG2HDJ21ASZST356S4WZ";
const indexId = "6911d676f0196372818c5c3d";

const client = new TwelveLabs({ apiKey: apiKey });

async function getVideos() {
    try {
        console.log("Fetching all videos from TwelveLabs index...\n");

        const videoPager = await client.indexes.videos.list(indexId);

        console.log("=== Videos in Index ===\n");

        const videoList = [];
        for await (const video of videoPager.data) {
            const filename = video.systemMetadata?.filename || video.filename || 'N/A';
            const duration = video.systemMetadata?.duration || 'N/A';

            const info = {
                id: video.id,
                filename: filename,
                duration: duration,
                createdAt: video.createdAt || 'N/A'
            };
            videoList.push(info);

            console.log(`Video ID: ${info.id}`);
            console.log(`  Filename: ${info.filename}`);
            console.log(`  Duration: ${info.duration}s`);
            console.log(`  Created: ${info.createdAt}`);
            console.log();
        }

        console.log(`\nTotal videos in index: ${videoList.length}\n`);

        console.log("=== JSON Output ===");
        console.log(JSON.stringify(videoList, null, 2));

    } catch (error) {
        console.error("Error:", error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

getVideos();
