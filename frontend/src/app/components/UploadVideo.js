"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { useUpload } from "../contexts/UploadContext";
import {
  VideoCameraIcon,
  PlusIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

export default function UploadVideo() {
  const [isDragOver, setIsDragOver] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
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
    const POLL_INTERVAL = 10000;
    const MAX_POLLS = 60;
    let pollCount = 0;

    const checkDetection = async () => {
      try {
        pollCount++;
        console.log(`[Detection Cleanup] Checking detection status ${pollCount}/${MAX_POLLS}...`);

        const response = await fetch(`/api/detect-tools/${videoId}`);
        const data = await response.json();

        console.log(`[Detection Cleanup] Status: ${data.status}`);

        if (data.status === 'completed') {
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

          console.log('[Detection Cleanup] Detection complete with valid data, cleaning up blob...');

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
          setTimeout(checkDetection, POLL_INTERVAL);
        }
      } catch (error) {
        console.error('[Detection Cleanup] Poll error:', error);
        if (pollCount >= MAX_POLLS) {
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

    checkDetection();
  };

  // Poll for indexing status
  const pollIndexingStatus = async (taskId, blobUrl) => {
    const POLL_INTERVAL = 5000;
    const MAX_POLLS = 120;
    let pollCount = 0;

    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        try {
          pollCount++;
          console.log(`[Indexing Status] Polling ${pollCount}/${MAX_POLLS}...`);

          const encodedBlobUrl = encodeURIComponent(blobUrl);
          const response = await fetch(`/api/upload/status/${taskId}?blobUrl=${encodedBlobUrl}`);
          const data = await response.json();

          console.log(`[Indexing Status] Status: ${data.status}, videoId: ${data.videoId || 'pending'}`);

          if (data.status && data.status !== 'ready' && data.status !== 'failed') {
            setStage(data.status);
          }

          if (data.status === 'ready') {
            console.log('[Indexing Status] Video ready! Tool detection triggered:', data.toolDetectionTriggered);

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

            if (data.toolDetectionTriggered) {
              console.log('[Indexing Status] Starting background detection monitoring...');
              waitForDetectionAndCleanup(data.videoId, blobUrl, taskId);
            } else {
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
            setTimeout(checkStatus, POLL_INTERVAL);
          }
        } catch (error) {
          console.error('[Indexing Status] Poll error:', error);
          if (pollCount >= MAX_POLLS) {
            reject(error);
          } else {
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

      console.log("[Blob Upload] Step 3: Polling for indexing completion...");
      const videoId = await pollIndexingStatus(indexData.taskId, blob.url);
      console.log("[Blob Upload] Video indexed successfully, videoId:", videoId);

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
    <div className="group cursor-pointer">
      {/* Video/Thumbnail Container - Same as ClipCard */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative aspect-video w-full rounded-[32px] overflow-hidden shadow-soft hover:shadow-card transition-all duration-300 transform hover:-translate-y-1 ${isUploading ? 'opacity-60 pointer-events-none' : ''}`}
        style={{
          backgroundColor: isUploading
            ? 'var(--zinc-300)'
            : isDragOver
            ? 'var(--zinc-300)'
            : error
            ? 'var(--zinc-300)'
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

        {/* Main Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
          {/* Uploading State */}
          {isUploading && (
            <>
              <div className="mb-3 p-3 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.8)', color: 'var(--zinc-500)' }}>
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--zinc-400)', borderTopColor: 'transparent' }} />
              </div>
              <h3 className="text-base font-normal font-['Milling']" style={{ color: 'var(--zinc-600)' }}>
                Uploading...
              </h3>
            </>
          )}

          {/* Error State */}
          {error && !isUploading && (
            <>
              <div className="mb-3 p-3 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.8)', color: 'var(--color-red)' }}>
                <VideoCameraIcon className="h-8 w-8" />
              </div>
              <h3 className="text-base font-normal font-['Milling']" style={{ color: 'var(--color-red)' }}>
                Upload Failed
              </h3>
              <button
                onClick={handleDismissError}
                className="mt-2 text-xs underline transition-opacity hover:opacity-70"
                style={{ color: 'var(--zinc-600)' }}
              >
                Try Again
              </button>
            </>
          )}

          {/* Normal State */}
          {!isUploading && !error && (
            <>
              <div
                className="mb-3 p-4 rounded-full transition-all duration-300 group-hover:scale-110"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.9)',
                  color: 'var(--zinc-600)'
                }}
              >
                <div className="relative">
                  <VideoCameraIcon className="h-8 w-8" />
                  <PlusIcon className="absolute -top-1 -right-1 h-4 w-4" style={{ color: 'var(--zinc-500)' }} />
                </div>
              </div>
              <h3 className="text-base font-normal font-['Milling']" style={{ color: 'var(--zinc-700)' }}>
                Upload Video
              </h3>
              <p className="text-sm font-['Milling'] mt-1" style={{ color: 'var(--zinc-500)' }}>
                Click or drag & drop
              </p>
            </>
          )}
        </div>

        {/* Drag Overlay */}
        {isDragOver && (
          <div className="absolute inset-0 border-4 border-dashed pointer-events-none rounded-[32px]" style={{ borderColor: 'var(--zinc-400)', backgroundColor: 'rgba(255,255,255,0.3)' }}></div>
        )}

        {/* Info Icon - Bottom Right */}
        {!isUploading && !error && (
          <div
            className="absolute bottom-4 right-4 z-10"
            onMouseEnter={() => setShowInfo(true)}
            onMouseLeave={() => setShowInfo(false)}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-1.5 rounded-full transition-colors" style={{ backgroundColor: 'rgba(255,255,255,0.9)' }}>
              <InformationCircleIcon className="h-5 w-5" style={{ color: 'var(--zinc-500)' }} />
            </div>

            {/* Info Tooltip - Opens to the left to avoid clipping */}
            {showInfo && (
              <div
                className="absolute bottom-0 right-full mr-2 w-56 p-3 rounded-xl shadow-card z-50"
                style={{ backgroundColor: 'white', border: '1px solid var(--zinc-200)' }}
              >
                <h4 className="text-xs font-bold font-['Milling'] mb-2" style={{ color: 'var(--zinc-800)' }}>
                  Processing Steps
                </h4>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ backgroundColor: 'var(--zinc-200)', color: 'var(--zinc-600)' }}>
                      1
                    </div>
                    <span className="text-xs font-['Milling']" style={{ color: 'var(--zinc-700)' }}>Video Indexing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ backgroundColor: 'var(--zinc-200)', color: 'var(--zinc-600)' }}>
                      2
                    </div>
                    <span className="text-xs font-['Milling']" style={{ color: 'var(--zinc-700)' }}>Tool Detection</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ backgroundColor: 'var(--zinc-200)', color: 'var(--zinc-600)' }}>
                      3
                    </div>
                    <span className="text-xs font-['Milling']" style={{ color: 'var(--zinc-700)' }}>Surgical Analysis</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ backgroundColor: 'var(--zinc-200)', color: 'var(--zinc-600)' }}>
                      4
                    </div>
                    <span className="text-xs font-['Milling']" style={{ color: 'var(--zinc-700)' }}>Results Ready</span>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t space-y-1 text-[10px] font-['Milling']" style={{ borderColor: 'var(--zinc-200)', color: 'var(--zinc-500)' }}>
                  <div className="flex items-center gap-3">
                    <span>~3-4 min</span>
                    <span>MP4, MOV, AVI</span>
                  </div>
                  <div>
                    <span>Max file size: 100MB</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
