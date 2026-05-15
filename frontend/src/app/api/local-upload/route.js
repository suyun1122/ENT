import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.LOCAL_YOLO_BACKEND_URL || "http://127.0.0.1:8000";
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");
const DETECTIONS_DIR = path.join(process.cwd(), "public", "detections");
const DATA_DIR = path.join(process.cwd(), "data");
const VIDEOS_PATH = path.join(DATA_DIR, "videos.json");

function safeFilename(filename) {
  const parsed = path.parse(filename || "video.mp4");
  const base = parsed.name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  const ext = (parsed.ext || ".mp4").replace(/[^\w.]/g, "") || ".mp4";
  return `${base || "video"}${ext}`;
}

async function readVideos() {
  try {
    const raw = await fs.readFile(VIDEOS_PATH, "utf-8");
    return JSON.parse(raw || "{}");
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function waitForStatus(videoId) {
  let lastStatus = null;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch(`${BACKEND_URL}/status/${videoId}`, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to read YOLO status: ${response.status} ${text}`);
    }

    lastStatus = await response.json();

    if (lastStatus.status === "completed" && lastStatus.data) {
      return lastStatus;
    }

    if (lastStatus.status === "error") {
      throw new Error(lastStatus.error || "YOLO detection failed");
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(
    `YOLO detection did not return completed data. Last status: ${JSON.stringify(lastStatus)}`
  );
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const video = formData.get("video");

    if (!video || typeof video.arrayBuffer !== "function") {
      return NextResponse.json({ error: "Missing formData video file" }, { status: 400 });
    }

    const videoId = `local-${Date.now()}`;
    const originalFilename = video.name || `${videoId}.mp4`;
    const storedFilename = `${videoId}-${safeFilename(originalFilename)}`;
    const uploadPath = path.join(UPLOADS_DIR, storedFilename);
    const videoUrl = `/uploads/${storedFilename}`;
    const buffer = Buffer.from(await video.arrayBuffer());

    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.mkdir(DETECTIONS_DIR, { recursive: true });
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(uploadPath, buffer);

    const backendForm = new FormData();
    backendForm.append("video_id", videoId);
    backendForm.append(
      "video",
      new Blob([buffer], { type: video.type || "application/octet-stream" }),
      originalFilename
    );

    const detectionResponse = await fetch(`${BACKEND_URL}/detect/upload`, {
      method: "POST",
      body: backendForm,
    });

    if (!detectionResponse.ok) {
      const text = await detectionResponse.text();
      throw new Error(`YOLO backend upload failed: ${detectionResponse.status} ${text}`);
    }

    const status = await waitForStatus(videoId);
    const detectionData = status.data;
    const detectionPath = path.join(DETECTIONS_DIR, `${videoId}.json`);
    await fs.writeFile(detectionPath, JSON.stringify(detectionData, null, 2), "utf-8");

    const videos = await readVideos();
    videos[storedFilename] = {
      id: videoId,
      pegasusId: videoId,
      filename: originalFilename,
      createdAt: new Date().toISOString(),
      duration: detectionData?.video_properties?.duration || 0,
      video_url: videoUrl,
      thumbnail_url: "",
      hls: {
        video_url: videoUrl,
        thumbnail_urls: [""],
      },
    };

    await fs.writeFile(VIDEOS_PATH, JSON.stringify(videos, null, 2), "utf-8");

    return NextResponse.json({
      success: true,
      videoId,
      filename: originalFilename,
      video_url: videoUrl,
    });
  } catch (error) {
    console.error("[api/local-upload] Upload failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Local upload failed",
      },
      { status: 500 }
    );
  }
}
