"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolDetectionOverlay, { ToolFilterPanel } from "./ToolDetectionOverlay";
import ToolUsageTimeline from "./ToolUsageTimeline";
import ToolUsageStatistics from "./ToolUsageStatistics";
import InstrumentMotionAnalysisPanel from "./InstrumentMotionAnalysisPanel";
import { buildInstrumentMotionAnalysis } from "@/app/utils/instrumentMotionAnalysis";

function normalizeDetectionData(raw) {
  const data = raw?.data?.detections ? raw.data : raw;
  if (!data || !Array.isArray(data.detections)) return null;

  const classes = { ...(data.classes || {}) };

  for (const frame of data.detections) {
    for (const tool of frame.tools || []) {
      if (tool.class_id !== undefined && tool.class_name && classes[tool.class_id] === undefined) {
        classes[tool.class_id] = tool.class_name;
      }
    }
  }

  return {
    ...data,
    classes,
    video_properties: data.video_properties || {},
  };
}

export default function LocalClipBento({ clipData, videoId }) {
  const videoRef = useRef(null);
  const [detectionData, setDetectionData] = useState(null);
  const [detectionStatus, setDetectionStatus] = useState("loading");
  const [detectionError, setDetectionError] = useState("");
  const [enabledTools, setEnabledTools] = useState([]);
  const [showDetections, setShowDetections] = useState(true);
  const [videoDuration, setVideoDuration] = useState(clipData?.duration || 0);

  useEffect(() => {
    let cancelled = false;

    async function loadDetections() {
      if (!videoId) return;

      setDetectionStatus("loading");
      setDetectionError("");

      try {
        let data = null;

        const staticResponse = await fetch(`/detections/${videoId}.json`, {
          cache: "no-store",
        });

        if (staticResponse.ok) {
          data = await staticResponse.json();
        } else {
          const apiResponse = await fetch(`/api/detect-tools/${videoId}`, {
            cache: "no-store",
          });
          const apiData = await apiResponse.json().catch(() => null);

          if (!apiResponse.ok) {
            throw new Error(apiData?.message || apiData?.error || "Failed to load detection data");
          }

          if (apiData?.status !== "completed" || !apiData?.data) {
            throw new Error(apiData?.message || "Detection data is not available yet");
          }

          data = apiData.data;
        }

        const normalized = normalizeDetectionData(data);
        if (!normalized) {
          throw new Error("Detection JSON has an unsupported format");
        }

        if (!cancelled) {
          setDetectionData(normalized);
          setEnabledTools(Object.values(normalized.classes || {}));
          setVideoDuration(normalized.video_properties?.duration || clipData?.duration || 0);
          setDetectionStatus("completed");
        }
      } catch (error) {
        console.error("[LocalClipBento] Detection load failed:", error);
        if (!cancelled) {
          setDetectionData(null);
          setDetectionError(error.message || "Failed to load detection data");
          setDetectionStatus("error");
        }
      }
    }

    loadDetections();

    return () => {
      cancelled = true;
    };
  }, [videoId, clipData?.duration]);

  const detectionCount = useMemo(() => {
    if (!detectionData?.detections) return 0;
    return detectionData.detections.reduce(
      (total, frame) => total + (frame.tools?.length || 0),
      0
    );
  }, [detectionData]);

  const motionAnalysis = useMemo(() => {
    if (!detectionData) return null;
    return buildInstrumentMotionAnalysis(
      detectionData,
      clipData?.duration || detectionData?.video_properties?.duration || videoDuration
    );
  }, [detectionData, clipData?.duration, videoDuration]);

  const handleToggleTool = (toolName) => {
    setEnabledTools((current) => {
      if (current.includes(toolName)) {
        return current.filter((name) => name !== toolName);
      }
      return [...current, toolName];
    });
  };

  const handleSeekTo = (timestamp) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = timestamp;
    videoRef.current.play().catch(() => {});
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current?.duration && Number.isFinite(videoRef.current.duration)) {
      setVideoDuration(videoRef.current.duration);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm">
          <div className="relative overflow-hidden rounded-[18px] bg-black">
            <video
              ref={videoRef}
              src={clipData.video_url}
              controls
              playsInline
              preload="metadata"
              onLoadedMetadata={handleLoadedMetadata}
              className="block w-full"
            />
            <ToolDetectionOverlay
              videoRef={videoRef}
              detectionData={detectionData}
              isVisible={showDetections}
              enabledTools={enabledTools}
            />
          </div>
        </div>

        <div className="space-y-4">
          <ToolFilterPanel
            detectionData={detectionData}
            enabledTools={enabledTools}
            onToggleTool={handleToggleTool}
            isVisible={showDetections}
            onToggleVisibility={() => setShowDetections((value) => !value)}
          />

          <div className="rounded-[20px] border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">
            <div className="font-semibold text-gray-900">Detection Status</div>
            <div className="mt-2">
              {detectionStatus === "loading" && "Loading instrument detection data..."}
              {detectionStatus === "completed" && `${detectionCount} tool detections loaded.`}
              {detectionStatus === "error" && detectionError}
            </div>
          </div>
        </div>
      </div>

      <ToolUsageTimeline
        detectionData={detectionData}
        videoDuration={videoDuration}
        onSeekTo={handleSeekTo}
      />

      <InstrumentMotionAnalysisPanel
        metrics={motionAnalysis?.metrics}
        videoId={videoId}
        motionRows={motionAnalysis?.rows || []}
        classSummary={motionAnalysis?.classSummary || []}
        trackSummary={motionAnalysis?.trackSummary || []}
      />

      <ToolUsageStatistics detectionData={detectionData} />
    </div>
  );
}
