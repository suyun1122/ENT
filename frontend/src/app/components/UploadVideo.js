"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { useUpload } from "../contexts/UploadContext";
import {
  ArrowUpIcon,
} from "@heroicons/react/24/outline";

export default function UploadVideo() {
  const [isDragOver, setIsDragOver] = useState(false);
  const {
    isUploading,
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
      {/* Upload Container with Dashed Border */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative aspect-video w-full rounded-[32px] border-2 border-dashed transition-all duration-300 ${isUploading ? 'opacity-60 pointer-events-none' : ''}`}
        style={{
          borderColor: isDragOver ? 'var(--zinc-500)' : 'var(--zinc-300)',
          backgroundColor: isDragOver ? 'var(--zinc-200)' : 'transparent',
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
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
          {/* Uploading State */}
          {isUploading && (
            <>
              <div className="mb-3">
                <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--zinc-400)', borderTopColor: 'transparent' }} />
              </div>
              <h3 className="text-base font-normal font-['Milling']" style={{ color: 'var(--zinc-600)' }}>
                Uploading...
              </h3>
            </>
          )}

          {/* Error State */}
          {error && !isUploading && (
            <>
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
              {/* Arrow Up Icon */}
              <div className="mb-3">
                <ArrowUpIcon className="h-6 w-6" style={{ color: 'var(--zinc-800)' }} strokeWidth={2} />
              </div>

              {/* Main Text */}
              <h3 className="text-base font-normal font-['Milling'] mb-4" style={{ color: 'var(--zinc-800)' }}>
                Drop videos or browse files
              </h3>

              {/* Info Badges */}
              <div className="flex flex-wrap justify-center gap-2 mb-3">
                <span className="px-2 py-0.5 text-[11px] font-['Milling'] border rounded" style={{ borderColor: 'var(--zinc-300)', color: 'var(--zinc-600)' }}>
                  MP4, MOV, AVI
                </span>
                <span className="px-2 py-0.5 text-[11px] font-['Milling'] border rounded" style={{ borderColor: 'var(--zinc-300)', color: 'var(--zinc-600)' }}>
                  Max 100MB
                </span>
              </div>

              {/* Processing Note */}
              <p className="text-[10px] font-['Milling'] text-center px-4" style={{ color: 'var(--zinc-500)' }}>
                *Processing takes ~3-4 min (indexing, tool detection, analysis)
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
