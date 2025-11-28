import { TwelveLabs, TwelvelabsApi } from 'twelvelabs-js';

const twelvelabs_client = new TwelveLabs({apiKey: process.env.TWELVELABS_API_KEY});

export async function GET(request) {

    /*
    Retrieves all videos from the TwelveLabs index which can be mapped to the VSS database.
    */

    try {
        // Check if API key is set
        if (!process.env.TWELVELABS_API_KEY) {
            return new Response(JSON.stringify({
                error: 'TWELVELABS_API_KEY is not set in environment variables'
            }), { status: 500 });
        }

        // Check if index IDs are set
        const marengoIndexId = process.env.NEXT_PUBLIC_TWELVELABS_MARENGO_INDEX_ID;
        const pegasusIndexId = process.env.NEXT_PUBLIC_TWELVELABS_PEGASUS_INDEX_ID;

        if (!marengoIndexId || !pegasusIndexId) {
            return new Response(JSON.stringify({
                error: 'Index IDs are not set in environment variables'
            }), { status: 500 });
        }

        const videoList = {}

        // Fetch videos from Marengo index
        try {
            const videoPager = await twelvelabs_client.indexes.videos.list(marengoIndexId);
            for await (const video of videoPager.data) {
                const fileName = video.systemMetadata?.filename || video.filename || `video_${video.id}`;
                videoList[fileName] = {
                    ...video,
                    ...video.systemMetadata,
                    id: video.id,
                    filename: fileName
                }
            }
        } catch (error) {
            console.error("Error fetching videos from Marengo index:", error);
            // Continue even if Marengo fails
        }

        // Fetch videos from Pegasus index
        try {
            const videoPagerPegasus = await twelvelabs_client.indexes.videos.list(pegasusIndexId);
            for await (const video of videoPagerPegasus.data) {
                const fileName = video.systemMetadata?.filename || video.filename || `video_${video.id}`;
                if (videoList[fileName]) {
                    videoList[fileName]['pegasusId'] = video.id;
                } else {
                    videoList[fileName] = {
                        ...video,
                        ...video.systemMetadata,
                        id: video.id,
                        pegasusId: video.id,
                        filename: fileName
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching videos from Pegasus index:", error);
            // Continue even if Pegasus fails
        }

        return new Response(JSON.stringify(videoList), {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            }
        });

    } catch (error) {
        console.error("Error in /api/video:", error);
        return new Response(JSON.stringify({
            error: 'Failed to fetch videos from TwelveLabs',
            message: error.message,
            details: error.toString()
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

}

export async function POST(request) {
    /*
    S3 upload functionality removed - not needed for this use case.
    If you need video upload, use the UploadVideo component which uploads directly to VSS.
    */
    return new Response(JSON.stringify({
        error: 'S3 upload not available. Use direct VSS upload instead.'
    }), {
        status: 501, // Not Implemented
        headers: {
            'Content-Type': 'application/json'
        }
    });
}