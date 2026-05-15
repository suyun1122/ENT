import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import {
  buildInstrumentMotionAnalysis,
  motionRowsToCsv,
  motionSummaryToCsv,
} from "@/app/utils/instrumentMotionAnalysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvResponse(csv, filename) {
  return new Response(csv, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}

export async function GET(request, { params }) {
  const { videoId } = await params;

  if (!videoId) {
    return NextResponse.json({ error: "Video ID is required" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") || "json").toLowerCase();
  const type = (searchParams.get("type") || "rows").toLowerCase();
  const detectionPath = path.join(process.cwd(), "public", "detections", `${videoId}.json`);

  try {
    const raw = await fs.readFile(detectionPath, "utf-8");
    const detectionData = JSON.parse(raw);
    const normalizedData = detectionData?.data?.detections ? detectionData.data : detectionData;
    const videoDuration = normalizedData?.video_properties?.duration || 0;
    const analysis = buildInstrumentMotionAnalysis(detectionData, videoDuration);

    if (format === "csv") {
      if (type === "class") {
        return csvResponse(
          motionSummaryToCsv(analysis.classSummary),
          `${videoId}-motion-by-class.csv`
        );
      }

      if (type === "track") {
        return csvResponse(
          motionSummaryToCsv(analysis.trackSummary),
          `${videoId}-motion-by-track.csv`
        );
      }

      return csvResponse(motionRowsToCsv(analysis.rows), `${videoId}-motion-rows.csv`);
    }

    return NextResponse.json(
      {
        status: "completed",
        videoId,
        source: `/detections/${videoId}.json`,
        ...analysis,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      return NextResponse.json(
        {
          status: "not_found",
          videoId,
          error: "Motion data requires a local detection JSON file.",
        },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        status: "error",
        videoId,
        error: "Failed to build motion data from the local detection JSON file.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
