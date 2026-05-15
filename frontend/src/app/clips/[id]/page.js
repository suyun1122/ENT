"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import LocalClipBento from "@/app/components/LocalClipBento";

function normalizeClip(video, key) {
  const videoUrl = video.video_url || video.hls?.video_url || "";
  const thumbnailUrl =
    video.thumbnail_url || video.hls?.thumbnail_urls?.[0] || video.thumbnail_urls?.[0] || "";

  return {
    ...video,
    id: video.id || video.pegasusId || key,
    pegasusId: video.pegasusId || video.id || key,
    filename: video.filename || key,
    createdAt: video.createdAt || video.created_at || new Date().toISOString(),
    duration: video.duration || video.video_properties?.duration || 0,
    video_url: videoUrl,
    thumbnail_url: thumbnailUrl,
    hls: video.hls || {
      video_url: videoUrl,
      thumbnail_urls: [thumbnailUrl],
    },
  };
}

function matchesClip(clip, key, requestedId, decodedId) {
  const candidates = [
    key,
    clip.id,
    clip.pegasusId,
    clip.filename,
    encodeURIComponent(clip.filename || ""),
  ]
    .filter(Boolean)
    .map(String);

  return candidates.some(
    (candidate) =>
      candidate === requestedId ||
      candidate === decodedId ||
      candidate.toLowerCase() === decodedId.toLowerCase()
  );
}

function formatClipDate(item) {
  const value = item?.createdAt || item?.created_at || item?.date || item?.uploaded_at;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

export default function ClipDetailPage({ params }) {
  const paramsObj = typeof React.use === "function" ? React.use(params) : params;
  const { id } = paramsObj;
  const decodedId = useMemo(() => decodeURIComponent(id), [id]);

  const [clipData, setClipData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadClipData() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/video", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Failed to load local videos: ${response.status}`);
        }

        const data = await response.json();
        let found = null;

        for (const [key, video] of Object.entries(data || {})) {
          const clip = normalizeClip(video, key);
          if (matchesClip(clip, key, id, decodedId)) {
            found = clip;
            break;
          }
        }

        if (!found) {
          throw new Error(`Video "${decodedId}" was not found in the local library.`);
        }

        if (!cancelled) {
          setClipData(found);
        }
      } catch (loadError) {
        console.error("[clips/[id]] Failed to load clip:", loadError);
        if (!cancelled) {
          setError(loadError.message || "Failed to load clip");
          setClipData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadClipData();

    return () => {
      cancelled = true;
    };
  }, [decodedId, id]);

  const displayDate = formatClipDate(clipData);
  const title = clipData?.filename?.replace(/\.[^.]+$/i, "") || "Loading...";

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f4f3f3" }}>
      <div className="container mx-auto px-4 py-6">
        <Link
          href="/clips"
          className="inline-flex items-center gap-1 text-gray-700 text-xs font-normal mb-6 hover:text-gray-900 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Library
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
          {displayDate && (
            <p className="mt-1 text-sm text-gray-600">Recorded: {displayDate}</p>
          )}
        </div>

        {error && (
          <div className="mb-6 rounded-[20px] border border-red-200 bg-red-50 p-6 text-red-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 rounded-full border-2 border-solid border-gray-500 border-t-transparent animate-spin mb-6"></div>
            <p className="text-gray-600 font-normal text-base">Loading clip data...</p>
          </div>
        )}

        {!loading && clipData && (
          <LocalClipBento clipData={clipData} videoId={clipData.id} />
        )}
      </div>
    </div>
  );
}
