"use client";

import { useState } from "react";
import { ArrowUpIcon } from "@heroicons/react/24/outline";
import { useUpload } from "../contexts/UploadContext";

export default function UploadVideo() {
  const [isDragOver, setIsDragOver] = useState(false);
  const [localStatus, setLocalStatus] = useState("");
  const {
    isUploading,
    error,
    startUpload,
    updateProgress,
    setStage,
    completeUpload,
    completeDetection,
    completeAnalysis,
    failUpload,
    clearError,
  } = useUpload();

  const uploadVideo = async (file) => {
    startUpload(file.name);
    clearError();
    setLocalStatus("Uploading");
    let detectingTimer = null;

    try {
      const formData = new FormData();
      formData.append("video", file);

      setStage("uploading");
      updateProgress(20);

      detectingTimer = setTimeout(() => {
        setStage("detecting");
        setLocalStatus("Detecting");
        updateProgress(80);
      }, 1200);

      const response = await fetch("/api/local-upload", {
        method: "POST",
        body: formData,
      });

      clearTimeout(detectingTimer);
      setStage("detecting");
      setLocalStatus("Detecting");
      updateProgress(80);

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Local upload failed");
      }

      updateProgress(100);
      setLocalStatus("Complete");

      completeUpload(result.videoId);
      completeDetection();
      completeAnalysis(result.videoId);

      return result;
    } catch (uploadError) {
      if (detectingTimer) clearTimeout(detectingTimer);
      console.error("[UploadVideo] Upload failed:", uploadError);
      setLocalStatus("");
      failUpload(uploadError.message || "Upload failed");
      return null;
    }
  };

  const handleFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      failUpload("Please select a video file.");
      return;
    }
    uploadVideo(file);
  };

  const handleFileSelect = (event) => {
    handleFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleClick = () => {
    if (!isUploading) {
      document.getElementById("upload-video")?.click();
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    if (!isUploading) setIsDragOver(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragOver(false);
    if (isUploading) return;
    handleFile(event.dataTransfer.files?.[0]);
  };

  const handleDismissError = (event) => {
    event.stopPropagation();
    clearError();
  };

  const statusText = localStatus === "Detecting" ? "Detecting..." : "Uploading...";

  return (
    <div className="group cursor-pointer">
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative aspect-video w-full rounded-[32px] border-2 border-dashed transition-all duration-300 ${
          isUploading ? "opacity-70 pointer-events-none" : ""
        }`}
        style={{
          borderColor: isDragOver ? "var(--zinc-500)" : "var(--zinc-300)",
          backgroundColor: isDragOver ? "var(--zinc-200)" : "transparent",
          cursor: isUploading ? "not-allowed" : "pointer",
        }}
      >
        <input
          type="file"
          id="upload-video"
          accept="video/*"
          onChange={handleFileSelect}
          disabled={isUploading}
          className="hidden"
        />

        <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
          {isUploading && (
            <>
              <div className="mb-3">
                <div
                  className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                  style={{
                    borderColor: "var(--zinc-400)",
                    borderTopColor: "transparent",
                  }}
                />
              </div>
              <h3
                className="text-base font-normal font-['Milling']"
                style={{ color: "var(--zinc-600)" }}
              >
                {statusText}
              </h3>
              <p
                className="mt-2 text-[10px] font-['Milling'] text-center px-4"
                style={{ color: "var(--zinc-500)" }}
              >
                Local YOLO detection runs before the clip appears in the library.
              </p>
            </>
          )}

          {error && !isUploading && (
            <>
              <h3
                className="text-base font-normal font-['Milling']"
                style={{ color: "var(--color-red)" }}
              >
                Upload Failed
              </h3>
              <p
                className="mt-2 max-w-[85%] text-center text-xs"
                style={{ color: "var(--zinc-600)" }}
              >
                {error}
              </p>
              <button
                onClick={handleDismissError}
                className="mt-2 text-xs underline transition-opacity hover:opacity-70"
                style={{ color: "var(--zinc-600)" }}
              >
                Try Again
              </button>
            </>
          )}

          {!isUploading && !error && (
            <>
              <div className="mb-3">
                <ArrowUpIcon
                  className="h-6 w-6"
                  style={{ color: "var(--zinc-800)" }}
                  strokeWidth={2}
                />
              </div>

              <h3
                className="text-base font-normal font-['Milling'] mb-4"
                style={{ color: "var(--zinc-800)" }}
              >
                Drop videos or browse files
              </h3>

              <div className="flex flex-wrap justify-center gap-2 mb-3">
                <span
                  className="px-2 py-0.5 text-[11px] font-['Milling'] border rounded"
                  style={{
                    borderColor: "var(--zinc-300)",
                    color: "var(--zinc-600)",
                  }}
                >
                  MP4, MOV, AVI
                </span>
                <span
                  className="px-2 py-0.5 text-[11px] font-['Milling'] border rounded"
                  style={{
                    borderColor: "var(--zinc-300)",
                    color: "var(--zinc-600)",
                  }}
                >
                  Local YOLO
                </span>
              </div>

              <p
                className="text-[10px] font-['Milling'] text-center px-4"
                style={{ color: "var(--zinc-500)" }}
              >
                Requires backend at http://127.0.0.1:8000.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
