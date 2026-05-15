import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: "Disabled in local mode. Upload videos with /api/local-upload.",
    },
    { status: 410 }
  );
}
