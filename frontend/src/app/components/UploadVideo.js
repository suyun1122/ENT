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

  // Poll for tool detection completion, then cleanup blob
  const waitForDetectionAndCleanup = async (videoId, blobUrl, taskId) => {
    const POLL_INTERVAL = 10000; // 10 seconds
    const MAX_POLLS = 60; // 10 minutes max (60 * 10s)
    let pollCount = 0;

    const checkDetection = async () => {
      try {
        pollCount++;
        console.log(`[Detection Cleanup] Checking detection status ${pollCount}/${MAX_POLLS}...`);

        const response = await fetch(`/api/detect-tools/${videoId}`);
        const data = await response.json();

        console.log(`[Detection Cleanup] Status: ${data.status}`);

        if (data.status === 'completed') {
          // Verify detection data is not empty
          const hasValidData = data.data &&
            (data.data.frames?.length > 0 ||
             data.data.detections?.length > 0 ||
             Object.keys(data.data.classes || {}).length > 0);

          if (!hasValidData) {
            console.warn('[Detection Cleanup] Detection completed but data is empty, continuing to poll...');
            if (pollCount < MAX_POLLS) {
              setTimeout(checkDetection, POLL_INTERVAL);
              return;
            }
          }

          // Detection complete with valid data! Now safe to cleanup blob
          console.log('[Detection Cleanup] Detection complete with valid data, cleaning up blob...');
          console.log('[Detection Cleanup] Data summary:', {
            frames: data.data?.frames?.length || 0,
            classes: Object.keys(data.data?.classes || {}).length || 0
          });

          try {
            await fetch(`/api/upload/status/${taskId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ blobUrl }),
            });
            console.log('[Detection Cleanup] Blob cleanup complete');
          } catch (cleanupError) {
            console.warn('[Detection Cleanup] Blob cleanup failed:', cleanupError);
          }
          return;
        } else if (data.status === 'error' || pollCount >= MAX_POLLS) {
          // Error or timeout - cleanup anyway to avoid orphaned blobs
          console.log('[Detection Cleanup] Detection failed or timeout, cleaning up blob anyway...');
          try {
            await fetch(`/api/upload/status/${taskId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ blobUrl }),
            });
          } catch (cleanupError) {
            console.warn('[Detection Cleanup] Blob cleanup failed:', cleanupError);
          }
          return;
        } else {
          // Still processing - continue polling
          setTimeout(checkDetection, POLL_INTERVAL);
        }
      } catch (error) {
        console.error('[Detection Cleanup] Poll error:', error);
        if (pollCount >= MAX_POLLS) {
          // Timeout - cleanup anyway
          try {
            await fetch(`/api/upload/status/${taskId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ blobUrl }),
            });
          } catch (cleanupError) {
            console.warn('[Detection Cleanup] Blob cleanup failed:', cleanupError);
          }
        } else {
          setTimeout(checkDetection, POLL_INTERVAL);
        }
      }
    };

    // Start polling for detection completion
    checkDetection();
  };

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

          // Pass blobUrl so server can trigger tool detection when ready
          const encodedBlobUrl = encodeURIComponent(blobUrl);
          const response = await fetch(`/api/upload/status/${taskId}?blobUrl=${encodedBlobUrl}`);
          const data = await response.json();

          console.log(`[Indexing Status] Status: ${data.status}, videoId: ${data.videoId || 'pending'}`);

          // Update stage with actual TwelveLabs status
          if (data.status && data.status !== 'ready' && data.status !== 'failed') {
            setStage(data.status);
          }

          if (data.status === 'ready') {
            // Indexing complete - tool detection was triggered by the server
            console.log('[Indexing Status] Video ready! Tool detection triggered:', data.toolDetectionTriggered);

            // Save blob URL mapping for future use (tool detection when returning to page)
            try {
              await fetch(`/api/video-urls/${data.videoId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ blobUrl }),
              });
              console.log('[Indexing Status] Blob URL mapping saved for', data.videoId);
            } catch (mappingError) {
              console.warn('[Indexing Status] Failed to save blob URL mapping:', mappingError);
            }

            // Start background polling for detection completion, then cleanup
            if (data.toolDetectionTriggered) {
              console.log('[Indexing Status] Starting background detection monitoring...');
              waitForDetectionAndCleanup(data.videoId, blobUrl, taskId);
            } else {
              // No tool detection triggered, cleanup immediately
              try {
                await fetch(`/api/upload/status/${taskId}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ blobUrl }),
                });
              } catch (cleanupError) {
                console.warn('[Indexing Status] Blob cleanup failed:', cleanupError);
              }
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
    <div
      className={`rounded-[32px] shadow-soft hover:shadow-card transition-all duration-300 overflow-hidden group transform hover:-translate-y-1 ${isUploading ? 'opacity-60 pointer-events-none' : ''}`}
      style={{ backgroundColor: 'var(--color-white-200)' }}
    >
      {/* Upload Area - Top Section (matches video thumbnail height) */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="relative h-48 overflow-hidden transition-all duration-300 ease-in-out flex flex-col items-center justify-center"
        style={{
          backgroundColor: isUploading
            ? 'var(--color-blue)'
            : isDragOver
            ? 'var(--color-light-purple)'
            : error
            ? 'var(--color-light-pink)'
            : 'var(--zinc-200)',
          cursor: isUploading ? 'not-allowed' : 'pointer'
        }}
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
          <div className="absolute inset-0 bg-button-gradient"></div>
        </div>

        {/* Main Content */}
        <div className="relative z-10 flex flex-col items-center justify-center p-6 text-center">
          {/* Disabled State (uploading in progress) */}
          {isUploading && (
            <>
              <div className="mb-4 p-4 rounded-full shadow-soft" style={{ backgroundColor: 'var(--zinc-300)', color: 'var(--zinc-500)' }}>
                <VideoCameraIcon className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-normal font-['Milling']" style={{ color: 'var(--zinc-500)' }}>
                  Upload in Progress
                </h3>
                <p className="text-sm font-['Milling']" style={{ color: 'var(--zinc-500)' }}>
                  Please wait for current upload to complete
                </p>
              </div>
            </>
          )}

          {/* Error State */}
          {error && !isUploading && (
            <>
              <div className="mb-4 p-4 rounded-full shadow-soft" style={{ backgroundColor: 'var(--color-light-pink)', color: 'var(--color-red)' }}>
                <div className="relative">
                  <VideoCameraIcon className="h-8 w-8" />
                  <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-red)' }}>
                    <span className="text-white text-xs font-bold">!</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-normal font-['Milling']" style={{ color: 'var(--color-red)' }}>
                  Upload Failed
                </h3>
                <p className="text-sm font-['Milling']" style={{ color: 'var(--color-red)' }}>{error}</p>
                <button
                  onClick={handleDismissError}
                  className="text-xs underline transition-opacity hover:opacity-70"
                  style={{ color: 'var(--color-red)' }}
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
                className="mb-4 p-4 rounded-full transition-all duration-300 shadow-soft group-hover:scale-110"
                style={{
                  backgroundColor: isDragOver ? 'var(--color-light-purple)' : 'rgba(255,255,255,0.8)',
                  color: isDragOver ? 'var(--zinc-800)' : 'var(--zinc-600)'
                }}
              >
                <div className="relative">
                  <VideoCameraIcon className="h-8 w-8" />
                  <PlusIcon
                    className="absolute -top-1 -right-1 h-4 w-4 transition-all duration-300"
                    style={{ color: isDragOver ? 'var(--zinc-800)' : 'var(--zinc-500)' }}
                  />
                </div>
              </div>

              {/* Text Content */}
              <div className="space-y-2">
                <h3
                  className="text-lg font-normal font-['Milling'] transition-colors duration-300"
                  style={{ color: isDragOver ? 'var(--zinc-900)' : 'var(--zinc-800)' }}
                >
                  Upload Video
                </h3>

                <p
                  className="text-sm font-['Milling'] transition-colors duration-300"
                  style={{ color: isDragOver ? 'var(--zinc-700)' : 'var(--zinc-600)' }}
                >
                  Click to browse or drag & drop
                </p>
              </div>
            </>
          )}
        </div>

        {/* Overlay for drag state */}
        {isDragOver && (
          <div className="absolute inset-0 border-4 border-dashed pointer-events-none" style={{ borderColor: 'var(--color-light-purple)', backgroundColor: 'rgba(251,223,255,0.3)' }}></div>
        )}
      </div>

      {/* Bottom Info Section (matches ClipCard structure) */}
      <div className="p-4 space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-normal font-['Milling'] group-hover:opacity-80 transition-opacity" style={{ color: 'var(--zinc-900)' }}>
            Upload Video
          </h3>
          <p className="text-xs font-['Milling']" style={{ color: 'var(--zinc-600)' }}>
            Click to browse or drag & drop
          </p>
        </div>

        {/* Video Info Icons */}
        <div className="flex items-center gap-3 text-xs font-['Milling']" style={{ color: 'var(--zinc-600)' }}>
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
        <div className="pt-3 border-t space-y-2.5" style={{ borderColor: 'var(--zinc-200)' }}>
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 w-5 h-5 rounded-full text-white flex items-center justify-center text-[10px] font-bold mt-0.5" style={{ backgroundColor: 'var(--color-blue)' }}>
              1
            </div>
            <div className="flex-1">
              <div className="text-xs font-normal font-['Milling']" style={{ color: 'var(--zinc-800)' }}>
                Video Indexing
              </div>
              <div className="text-[11px] leading-tight font-['Milling']" style={{ color: 'var(--zinc-600)' }}>
                AI analyzes your video content
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 w-5 h-5 rounded-full text-white flex items-center justify-center text-[10px] font-bold mt-0.5" style={{ backgroundColor: 'var(--color-green)' }}>
              2
            </div>
            <div className="flex-1">
              <div className="text-xs font-normal font-['Milling']" style={{ color: 'var(--zinc-800)' }}>
                Tool Detection
              </div>
              <div className="text-[11px] leading-tight font-['Milling']" style={{ color: 'var(--zinc-600)' }}>
                YOLO11m detects surgical tools
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 w-5 h-5 rounded-full text-white flex items-center justify-center text-[10px] font-bold mt-0.5" style={{ backgroundColor: 'var(--color-light-purple)', color: 'var(--zinc-800)' }}>
              3
            </div>
            <div className="flex-1">
              <div className="text-xs font-normal font-['Milling']" style={{ color: 'var(--zinc-800)' }}>
                Surgical Analysis
              </div>
              <div className="text-[11px] leading-tight font-['Milling']" style={{ color: 'var(--zinc-600)' }}>
                Generate phases & SOAP notes
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 w-5 h-5 rounded-full text-white flex items-center justify-center text-[10px] font-bold mt-0.5" style={{ backgroundColor: 'var(--color-orange)' }}>
              4
            </div>
            <div className="flex-1">
              <div className="text-xs font-normal font-['Milling']" style={{ color: 'var(--zinc-800)' }}>
                Results Ready
              </div>
              <div className="text-[11px] leading-tight font-['Milling']" style={{ color: 'var(--zinc-600)' }}>
                View & chat with your video
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
