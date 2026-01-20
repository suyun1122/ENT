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
    startDetection,
    completeDetection,
  } = useUpload();

  // Poll for tool detection completion (no blob cleanup needed anymore)
  const waitForDetectionCompletion = async (videoId) => {
    const POLL_INTERVAL = 10000;
    const MAX_POLLS = 60;
    let pollCount = 0;

    const checkDetection = async () => {
      try {
        pollCount++;
        console.log(`[Detection] Checking status ${pollCount}/${MAX_POLLS}...`);

        const response = await fetch(`/api/detect-tools/${videoId}`);
        const data = await response.json();

        console.log(`[Detection] Status: ${data.status}`);

        if (data.status === 'completed') {
          const hasValidData = data.data &&
            (data.data.frames?.length > 0 ||
             data.data.detections?.length > 0 ||
             Object.keys(data.data.classes || {}).length > 0);

          if (!hasValidData) {
            console.warn('[Detection] Detection completed but data is empty, continuing to poll...');
            if (pollCount < MAX_POLLS) {
              setTimeout(checkDetection, POLL_INTERVAL);
              return;
            }
          }

          console.log('[Detection] Detection complete with valid data!');
          completeDetection(); // Update indicator to show complete
          return;
        } else if (data.status === 'error' || pollCount >= MAX_POLLS) {
          console.log('[Detection] Detection failed or timeout');
          completeDetection(); // Clear detecting state even on error
          return;
        } else {
          setTimeout(checkDetection, POLL_INTERVAL);
        }
      } catch (error) {
        console.error('[Detection] Poll error:', error);
        if (pollCount < MAX_POLLS) {
          setTimeout(checkDetection, POLL_INTERVAL);
        } else {
          completeDetection(); // Clear on max polls reached
        }
      }
    };

    checkDetection();
  };

  // Upload video to Railway for tool detection via API proxy (avoids CORS)
  const uploadToRailwayForDetection = async (videoId, blobUrl) => {
    try {
      console.log(`[Railway Upload] Starting detection with blob URL for ${videoId}...`);

      // Use POST to start detection with blob URL
      const response = await fetch(`/api/detect-tools/${videoId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blobUrl }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[Railway Upload] Detection started:', result);
        return true;
      } else {
        const errorText = await response.text();
        console.warn('[Railway Upload] Detection failed:', response.status, errorText);
        return false;
      }
    } catch (error) {
      console.warn('[Railway Upload] Detection error:', error);
      return false;
    }
  };

  // Poll for indexing status
  // Tool detection starts after we get videoId and blob URL
  const pollIndexingStatus = async (taskId, blobUrl) => {
    const POLL_INTERVAL = 5000;
    const MAX_POLLS = 120;
    let pollCount = 0;
    let railwayUploadStarted = false;

    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        try {
          pollCount++;
          console.log(`[Indexing Status] Polling ${pollCount}/${MAX_POLLS}...`);

          const response = await fetch(`/api/upload/status/${taskId}`);
          const data = await response.json();

          console.log(`[Indexing Status] Status: ${data.status}, videoId: ${data.videoId || 'pending'}`);

          if (data.status && data.status !== 'ready' && data.status !== 'failed') {
            setStage(data.status);
          }

          // Start Railway detection as soon as we have videoId (don't wait for indexing to complete)
          if (data.videoId && blobUrl && !railwayUploadStarted) {
            railwayUploadStarted = true;
            console.log('[Indexing Status] Got videoId, starting tool detection in parallel. videoId:', data.videoId);

            // Start detection tracking immediately
            console.log('[Indexing Status] Calling startDetection...');
            startDetection(data.videoId);

            // Start tool detection in background using blob URL (don't await)
            uploadToRailwayForDetection(data.videoId, blobUrl)
              .then(success => {
                if (success) {
                  console.log('[Indexing Status] Tool detection started!');
                  waitForDetectionCompletion(data.videoId);
                } else {
                  console.warn('[Indexing Status] Tool detection failed to start');
                  completeDetection(); // Clear detection state on failure
                }
              })
              .catch(err => {
                console.warn('[Indexing Status] Tool detection error:', err);
                completeDetection(); // Clear detection state on error
              });
          }

          if (data.status === 'ready') {
            console.log('[Indexing Status] Video ready!');
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
    console.log("Starting video upload flow...");
    startUpload(file.name);

    try {
      // Step 1: Upload to Vercel Blob using client-side upload (bypasses 4.5MB API limit)
      console.log("[Upload] Step 1: Uploading to Vercel Blob (client-side)...");
      setStage('uploading');

      const blob = await upload(`videos/${Date.now()}-${file.name}`, file, {
        access: 'public',
        handleUploadUrl: '/api/upload/token',
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
          updateProgress(percent);
          console.log(`[Upload] Blob upload progress: ${percent}%`);
        },
      });

      console.log("[Upload] Blob upload complete:", blob.url);
      updateProgress(100);

      // Step 2: Send blob URL to server for TwelveLabs indexing
      console.log("[Upload] Step 2: Starting TwelveLabs indexing...");
      setStage('validating');

      const uploadResponse = await fetch("/api/upload/direct", {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blobUrl: blob.url,
          filename: file.name,
        }),
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.error || "Failed to start video indexing");
      }

      const uploadData = await uploadResponse.json();
      console.log("[Upload] Indexing started, taskId:", uploadData.taskId);

      // Step 3: Poll for indexing completion
      setStage('indexing');
      console.log("[Upload] Step 3: Polling for indexing completion...");

      const videoId = await pollIndexingStatus(uploadData.taskId, blob.url);
      console.log("[Upload] Video indexed successfully, videoId:", videoId);

      console.log("[Upload] Calling completeUpload...");
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
                  Max 200MB
                </span>
              </div>

              {/* Processing Note */}
              <p className="text-[10px] font-['Milling'] text-center px-4" style={{ color: 'var(--zinc-500)' }}>
                *Processing takes ~2-3 min (indexing, tool detection, analysis)
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
