import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.LOCAL_YOLO_BACKEND_URL || "http://127.0.0.1:8000";

export async function GET(_request, { params }) {
  const { videoId } = await params;

  if (!videoId) {
    return NextResponse.json({ error: "Video ID is required" }, { status: 400 });
  }

  const detectionPath = path.join(process.cwd(), "public", "detections", `${videoId}.json`);

  try {
    const raw = await fs.readFile(detectionPath, "utf-8");
    return NextResponse.json(
      {
        status: "completed",
        videoId,
        data: JSON.parse(raw),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    if (error.code !== "ENOENT") {
      return NextResponse.json(
        { status: "error", videoId, message: "Failed to read local detection file" },
        { status: 500 }
      );
    }
  }

  try {
    const response = await fetch(`${BACKEND_URL}/status/${videoId}`, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { status: "not_found", videoId, message: "No local detection data found" },
        { status: 404 }
      );
    }

    const status = await response.json();
    return NextResponse.json({ ...status, videoId }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { status: "not_found", videoId, message: "Local YOLO backend is not reachable" },
      { status: 404 }
    );
  }
}

export async function POST() {
  return NextResponse.json(
    {
      status: "disabled",
      message: "Use /api/local-upload for local video upload and YOLO detection.",
    },
    { status: 410 }
  );
}

export async function PUT() {
  return NextResponse.json(
    {
      status: "disabled",
      message: "Local mode stores detections under public/detections.",
    },
    { status: 410 }
  );
}
