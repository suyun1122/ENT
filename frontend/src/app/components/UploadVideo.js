"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { useUpload } from "../contexts/UploadContext";
import {
  VideoCameraIcon,
  CloudArrowUpIcon,
  PlusIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";

export default function UploadVideo() {
  const [isDragOver, setIsDragOver] = useState(false);
  const {
    isUploading,
    progress,
    stage,
    error,
    startUpload,
    updateProgress,
    setStage,
    completeUpload,
    failUpload,
    clearError,
  } = useUpload();

  // Poll for indexing status
  const pollIndexingStatus = async (taskId, blobUrl) => {
    const POLL_INTERVAL = 5000; // 5 seconds
    const MAX_POLLS = 120; // 10 minutes max (120 * 5s)
    let pollCount = 0;

    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        try {
          pollCount++;
          console.log(`[Indexing Status] Polling ${pollCount}/${MAX_POLLS}...`);

          // Pass blobUrl as query param so server can trigger tool detection early
          const encodedBlobUrl = encodeURIComponent(blobUrl);
          const response = await fetch(`/api/upload/status/${taskId}?blobUrl=${encodedBlobUrl}`);
          const data = await response.json();

          console.log(`[Indexing Status] Status: ${data.status}, videoId: ${data.videoId || 'pending'}`);

          // Update stage with actual TwelveLabs status
          if (data.status && data.status !== 'ready' && data.status !== 'failed') {
            setStage(data.status);
          }

          if (data.status === 'ready') {
            // Indexing complete - cleanup blob (tool detection should have already started)
            console.log('[Indexing Status] Video ready! Cleaning up blob...');
            try {
              await fetch(`/api/upload/status/${taskId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ blobUrl }),
              });
            } catch (cleanupError) {
              console.warn('[Indexing Status] Blob cleanup failed:', cleanupError);
            }
            resolve(data.videoId);
          } else if (data.status === 'failed') {
            reject(new Error('Video indexing failed'));
          } else if (pollCount >= MAX_POLLS) {
            reject(new Error('Indexing timeout - please check video status later'));
          } else {
            // Still processing - continue polling
            setTimeout(checkStatus, POLL_INTERVAL);
          }
        } catch (error) {
          console.error('[Indexing Status] Poll error:', error);
          if (pollCount >= MAX_POLLS) {
            reject(error);
          } else {
            // Retry on error
            setTimeout(checkStatus, POLL_INTERVAL);
          }
        }
      };

      checkStatus();
    });
  };

  const uploadVideo = async (file) => {
    console.log("Starting video upload via Vercel Blob...");
    startUpload(file.name);

    try {
      // Step 1: Upload to Vercel Blob
      console.log("[Blob Upload] Step 1: Uploading to Vercel Blob...");

      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/upload/blob-token',
        onUploadProgress: (progress) => {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          updateProgress(percent);
          console.log(`[Blob Upload] Progress: ${percent}%`);
        },
      });

      console.log("[Blob Upload] Uploaded to Blob:", blob.url);

      // Step 2: Start TwelveLabs indexing (returns immediately with taskId)
      setStage('indexing');
      console.log("[Blob Upload] Step 2: Starting TwelveLabs indexing...");

      const indexResponse = await fetch("/api/upload/from-blob", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          blobUrl: blob.url,
          filename: file.name,
        }),
      });

      if (!indexResponse.ok) {
        const errorData = await indexResponse.json();
        throw new Error(errorData.error || "Failed to start indexing");
      }

      const indexData = await indexResponse.json();
      console.log("[Blob Upload] Indexing started, taskId:", indexData.taskId);

      // Step 3: Poll for indexing completion
      console.log("[Blob Upload] Step 3: Polling for indexing completion...");
      const videoId = await pollIndexingStatus(indexData.taskId, blob.url);
      console.log("[Blob Upload] Video indexed successfully, videoId:", videoId);

      // Complete upload - toast will show automatically
      completeUpload(videoId);

      return {
        success: true,
        fileId: videoId,
        message: "Video uploaded and indexed successfully",
      };
    } catch (error) {
      console.error("Error uploading video", error);
      failUpload(error.message);
      return {
        success: false,
        message: "Error uploading video",
      };
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      console.log("Video file selected:", file.name, file.type, file.size);
      uploadVideo(file);
    }
  };

  const handleClick = () => {
    if (!isUploading) {
      document.getElementById("upload-video")?.click();
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!isUploading) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);

    if (isUploading) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("video/")) {
        console.log("Video file dropped:", file.name, file.type, file.size);
        uploadVideo(file);
      } else {
        console.log("Please drop a video file");
      }
    }
  };

  const handleDismissError = (e) => {
    e.stopPropagation();
    clearError();
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group transform hover:-translate-y-1 ${isUploading ? 'opacity-60 pointer-events-none' : ''}`}>
      {/* Upload Area - Top Section (matches video thumbnail height) */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative h-48 overflow-hidden transition-all duration-300 ease-in-out
          ${
            isUploading
              ? "bg-blue-50 cursor-not-allowed"
              : isDragOver
              ? "bg-blue-100 cursor-pointer"
              : error
              ? "bg-red-50 cursor-pointer"
              : "bg-gray-100 cursor-pointer"
          }
          flex flex-col items-center justify-center
        `}
      >
        {/* Hidden File Input */}
        <input
          type="file"
          id="upload-video"
          accept="video/*"
          onChange={handleFileSelect}
          disabled={isUploading}
          className="hidden"
        />

        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600"></div>
        </div>

        {/* Main Content */}
        <div className="relative z-10 flex flex-col items-center justify-center p-6 text-center">
          {/* Disabled State (uploading in progress) */}
          {isUploading && (
            <>
              <div className="mb-4 p-4 rounded-full bg-gray-200 text-gray-400 shadow-lg">
                <VideoCameraIcon className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold font-inter text-gray-400">
                  Upload in Progress
                </h3>
                <p className="text-sm font-inter text-gray-400">
                  Please wait for current upload to complete
                </p>
              </div>
            </>
          )}

          {/* Error State */}
          {error && !isUploading && (
            <>
              <div className="mb-4 p-4 rounded-full bg-red-100 text-red-600 shadow-lg">
                <div className="relative">
                  <VideoCameraIcon className="h-8 w-8" />
                  <div className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-bold">!</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold font-inter text-red-800">
                  Upload Failed
                </h3>
                <p className="text-sm font-inter text-red-600">{error}</p>
                <button
                  onClick={handleDismissError}
                  className="text-xs text-red-500 hover:text-red-700 underline"
                >
                  Try Again
                </button>
              </div>
            </>
          )}

          {/* Normal State */}
          {!isUploading && !error && (
            <>
              {/* Icon Container */}
              <div
                className={`
              mb-4 p-4 rounded-full transition-all duration-300
              ${
                isDragOver
                  ? "bg-blue-100 text-blue-600 scale-110"
                  : "bg-white/80 text-gray-600 group-hover:bg-white group-hover:text-gray-800 group-hover:scale-110"
              }
              shadow-lg
            `}
              >
                <div className="relative">
                  <VideoCameraIcon className="h-8 w-8" />
                  <PlusIcon
                    className={`
                  absolute -top-1 -right-1 h-4 w-4 transition-all duration-300
                  ${
                    isDragOver
                      ? "text-blue-600"
                      : "text-gray-500 group-hover:text-gray-700"
                  }
                `}
                  />
                </div>
              </div>

              {/* Text Content */}
              <div className="space-y-2">
                <h3
                  className={`
                text-lg font-semibold font-inter transition-colors duration-300
                ${
                  isDragOver
                    ? "text-blue-800"
                    : "text-gray-800 group-hover:text-gray-900"
                }
              `}
                >
                  Upload Video
                </h3>

                <p
                  className={`
                text-sm font-inter transition-colors duration-300
                ${
                  isDragOver
                    ? "text-blue-600"
                    : "text-gray-600 group-hover:text-gray-700"
                }
              `}
                >
                  Click to browse or drag & drop
                </p>
              </div>
            </>
          )}
        </div>

        {/* Overlay for drag state */}
        {isDragOver && (
          <div className="absolute inset-0 border-4 border-blue-500 border-dashed bg-blue-50/50 pointer-events-none"></div>
        )}
      </div>

      {/* Bottom Info Section (matches ClipCard structure) */}
      <div className="p-4 space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-gray-900 group-hover:text-gray-700 transition-colors">
            Upload Video
          </h3>
          <p className="text-xs text-gray-500">
            Click to browse or drag & drop
          </p>
        </div>

        {/* Video Info Icons */}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <ClockIcon className="w-4 h-4" />
            ~2-3 min
          </span>
          <span className="flex items-center gap-1">
            <VideoCameraIcon className="w-4 h-4" />
            MP4, MOV, AVI
          </span>
        </div>

        {/* Processing Steps */}
        <div className="pt-3 border-t border-gray-100 space-y-2.5">
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-bold mt-0.5">
              1
            </div>
            <div className="flex-1">
              <div className="text-xs font-semibold text-gray-800">
                Video Indexing
              </div>
              <div className="text-[11px] text-gray-500 leading-tight">
                Twelve Labs AI indexes your video
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold mt-0.5">
              2
            </div>
            <div className="flex-1">
              <div className="text-xs font-semibold text-gray-800">
                Tool Detection
              </div>
              <div className="text-[11px] text-gray-500 leading-tight">
                YOLO11m detects surgical tools
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center text-[10px] font-bold mt-0.5">
              3
            </div>
            <div className="flex-1">
              <div className="text-xs font-semibold text-gray-800">
                Surgical Analysis
              </div>
              <div className="text-[11px] text-gray-500 leading-tight">
                Generate phases & SOAP notes
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold mt-0.5">
              4
            </div>
            <div className="flex-1">
              <div className="text-xs font-semibold text-gray-800">
                Results Ready
              </div>
              <div className="text-[11px] text-gray-500 leading-tight">
                View & chat with your video
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
