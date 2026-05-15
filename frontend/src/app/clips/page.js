"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ClipCard from "../components/ClipCard";
import UploadVideo from "../components/UploadVideo";
import { useUpload } from "../contexts/UploadContext";

function toClip(video, key) {
  const videoUrl = video.video_url || video.hls?.video_url || "";
  const thumbnailUrl =
    video.thumbnail_url || video.hls?.thumbnail_urls?.[0] || video.thumbnail_urls?.[0] || "";

  return {
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

export default function Clips() {
  const [isVisible, setIsVisible] = useState(false);
  const [clips, setClips] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const { onUploadComplete } = useUpload();

  const loadClips = useCallback(async () => {
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
      const nextClips = Object.entries(data || {})
        .map(([key, video]) => toClip(video, key))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      setClips(nextClips);
    } catch (loadError) {
      console.error("[clips] Failed to load local videos:", loadError);
      setError(loadError.message || "Failed to load local videos");
      setClips([]);
    }
  }, []);

  useEffect(() => {
    loadClips();
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, [loadClips]);

  useEffect(() => {
    return onUploadComplete(() => {
      loadClips();
    });
  }, [onUploadComplete, loadClips]);

  const filteredClips = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return clips;
    return clips.filter((clip) => clip.filename.toLowerCase().includes(needle));
  }, [clips, query]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--zinc-100)" }}>
      <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">
              Surgical Video Intelligence
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Local video library with YOLO surgical tool detection.
            </p>
          </div>

          <div className="w-full md:w-80">
            <label htmlFor="clip-search" className="sr-only">
              Search by filename
            </label>
            <input
              id="clip-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search filename"
              className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-900"
            />
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div
          className={`transition-all duration-700 ease-out ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <UploadVideo />

            {filteredClips.map((clip) => (
              <ClipCard
                key={clip.id || clip.filename}
                hrefId={clip.id || clip.filename}
                vss_id={clip.id}
                video_url={clip.video_url}
                thumbnail_url={clip.thumbnail_url}
                createdAt={clip.createdAt}
                duration={clip.duration}
                name={clip.filename || "Untitled"}
              />
            ))}
          </div>

          {filteredClips.length === 0 && clips.length > 0 && (
            <p className="mt-8 text-center text-sm text-gray-500">
              No local videos match that filename.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
