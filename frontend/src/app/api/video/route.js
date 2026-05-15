import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEOS_PATH = path.join(process.cwd(), "data", "videos.json");

export async function GET() {
  try {
    const raw = await fs.readFile(VIDEOS_PATH, "utf-8");
    const videos = JSON.parse(raw || "{}");

    return NextResponse.json(videos, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      return NextResponse.json(
        {},
        {
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    console.error("[api/video] Failed to read local videos.json:", error);
    return NextResponse.json(
      { error: "Failed to read local video library" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
