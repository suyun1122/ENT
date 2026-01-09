"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  VideoCameraIcon,
  CloudArrowUpIcon,
  PlusIcon,
  CheckCircleIcon,
  WrenchScrewdriverIcon,
  ClockIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";

export default function UploadVideo() {
  const [isDragOver, setIsDragOver] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadedVideoId, setUploadedVideoId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState(''); // 'generating', 'uploading', 'indexing'

  const uploadVideo = async (file) => {
    console.log("Starting video upload via Vercel Blob...");
    setIsUploading(true);
    setUploadError(null);
    setShowSuccessModal(false);
    setUploadProgress(0);

    try {
      // Step 1: Upload to Vercel Blob
      setUploadStage('uploading');
      console.log("[Blob Upload] Step 1: Uploading to Vercel Blob...");

      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/upload/blob-token',
        onUploadProgress: (progress) => {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          setUploadProgress(percent);
          console.log(`[Blob Upload] Progress: ${percent}%`);
        },
      });

      console.log("[Blob Upload] Uploaded to Blob:", blob.url);

      // Step 2: Send to server for TwelveLabs indexing
      setUploadStage('indexing');
      setUploadProgress(100);
      console.log("[Blob Upload] Step 2: Indexing via TwelveLabs...");

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
        throw new Error(errorData.error || "Failed to index video");
      }

      const indexData = await indexResponse.json();
      const videoId = indexData.videoId;
      console.log("[Blob Upload] Video indexed successfully:", indexData);

      // Show success modal
      setTimeout(() => {
        console.log("Showing success modal...");
        setUploadedVideoId(videoId);
        setShowSuccessModal(true);
        setIsUploading(false);
        setUploadProgress(0);
        setUploadStage('');
      }, 100);

      return {
        success: true,
        fileId: videoId,
        message: "Video uploaded and indexed successfully",
      };
    } catch (error) {
      console.error("Error uploading video", error);
      setUploadError(`Upload error: ${error.message}`);
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStage('');
      return {
        success: false,
        message: "Error uploading video",
      };
    }
  };

  // Start Tool Detection processing in background
  const startToolDetection = async (videoId) => {
    try {
      console.log(
        `[Tool Detection] Starting background processing for video ${videoId}`
      );

      // Trigger Tool Detection API (backend will download from TwelveLabs and process)
      const response = await fetch(`/api/detect-tools/${videoId}`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Tool Detection API returned ${response.status}`);
      }

      const result = await response.json();
      console.log(`[Tool Detection] Background processing started:`, result);

      return result;
    } catch (error) {
      console.error(
        `[Tool Detection] Failed to start background processing:`,
        error
      );
      // Don't throw - this is non-critical, video page will retry later
      throw error;
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

  const handleConfirmSuccess = () => {
    setShowSuccessModal(false);
  };

  const handleDismissError = () => {
    setUploadError(null);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group transform hover:-translate-y-1">
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
              ? "bg-blue-50 cursor-wait"
              : isDragOver
              ? "bg-blue-100 cursor-pointer"
              : uploadError
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
          className="hidden"
        />

        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600"></div>
        </div>

        {/* Main Content */}
        <div className="relative z-10 flex flex-col items-center justify-center p-6 text-center">
          {/* Loading State */}
          {isUploading && (
            <>
              <div className="mb-4 p-4 rounded-full bg-blue-100 text-blue-600 shadow-lg">
                <div className="animate-spin">
                  <CloudArrowUpIcon className="h-8 w-8" />
                </div>
              </div>
              <div className="space-y-3 w-full max-w-md">
                <h3 className="text-lg font-semibold font-inter text-blue-800">
                  {uploadStage === 'generating' && 'Preparing Upload...'}
                  {uploadStage === 'uploading' && 'Uploading Video...'}
                  {uploadStage === 'indexing' && 'Processing Video...'}
                  {!uploadStage && 'Uploading Video...'}
                </h3>
                {uploadStage === 'uploading' && uploadProgress > 0 && (
                  <div className="w-full">
                    <div className="flex justify-between text-xs text-blue-600 mb-1">
                      <span>Progress</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
                <p className="text-sm font-inter text-blue-600">
                  {uploadStage === 'generating' && 'Creating upload session...'}
                  {uploadStage === 'uploading' && 'Uploading chunks directly to TwelveLabs...'}
                  {uploadStage === 'indexing' && 'Processing and indexing video...'}
                  {!uploadStage && 'Please wait while your video is being processed'}
                </p>
              </div>
            </>
          )}

          {/* Error State */}
          {uploadError && !isUploading && (
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
                <p className="text-sm font-inter text-red-600">{uploadError}</p>
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
          {!isUploading && !uploadError && (
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

        {/* Success Modal */}
        {showSuccessModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={handleConfirmSuccess}
            ></div>

            {/* Modal Content */}
            <div className="relative bg-white rounded-2xl shadow-2xl p-8 mx-4 max-w-md w-full transform transition-all duration-300 scale-100">
              {/* Animated Checkmark */}
              <div className="flex justify-center mb-6">
                <div className="relative">
                  <CheckCircleIcon className="h-20 w-20 text-green-500 animate-pulse" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-16 w-16 bg-green-100 rounded-full animate-ping"></div>
                  </div>
                </div>
              </div>

              {/* Success Message */}
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  Upload Successful!
                </h3>
                <p className="text-gray-600 text-base">
                  Your video has been uploaded successfully.
                </p>
              </div>

              {/* Processing Status */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5 mb-6 border border-blue-100">
                <div className="flex items-center mb-3">
                  <ClockIcon className="h-5 w-5 text-blue-600 mr-2" />
                  <h4 className="text-sm font-semibold text-gray-800">
                    Background Processing
                  </h4>
                </div>

                <div className="space-y-3">
                  {/* TwelveLabs Indexing Status */}
                  <div className="flex items-center justify-between bg-white/70 rounded-lg p-3 shadow-sm">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <svg
                            className="w-4 h-4 text-blue-600"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          TwelveLabs Indexing
                        </p>
                        <p className="text-xs text-gray-500">
                          AI video analysis & search
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-1">
                        <div
                          className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"
                          style={{ animationDelay: "0ms" }}
                        ></div>
                        <div
                          className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"
                          style={{ animationDelay: "150ms" }}
                        ></div>
                        <div
                          className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        ></div>
                      </div>
                      <span className="text-xs font-medium text-blue-600">
                        Processing
                      </span>
                    </div>
                  </div>

                  {/* Tool Detection Status */}
                  <div className="flex items-center justify-between bg-white/70 rounded-lg p-3 shadow-sm">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                          <WrenchScrewdriverIcon className="w-4 h-4 text-emerald-600" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          Tool Detection
                        </p>
                        <p className="text-xs text-gray-500">
                          YOLO surgical instrument detection
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-1">
                        <div
                          className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"
                          style={{ animationDelay: "0ms" }}
                        ></div>
                        <div
                          className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"
                          style={{ animationDelay: "150ms" }}
                        ></div>
                        <div
                          className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        ></div>
                      </div>
                      <span className="text-xs font-medium text-emerald-600">
                        Processing
                      </span>
                    </div>
                  </div>

                  {/* Surgical Analysis Status */}
                  <div className="flex items-center justify-between bg-white/70 rounded-lg p-3 shadow-sm">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                          <DocumentTextIcon className="w-4 h-4 text-purple-600" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          Surgical Analysis
                        </p>
                        <p className="text-xs text-gray-500">
                          Chapter & SOAP note generation
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-1">
                        <div
                          className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce"
                          style={{ animationDelay: "0ms" }}
                        ></div>
                        <div
                          className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce"
                          style={{ animationDelay: "150ms" }}
                        ></div>
                        <div
                          className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        ></div>
                      </div>
                      <span className="text-xs font-medium text-purple-600">
                        Processing
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-blue-200">
                  <div className="flex items-start space-x-2">
                    <svg
                      className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      All processes are running in parallel. You can navigate to
                      the video page now - features will be available as they
                      complete.
                    </p>
                  </div>
                </div>
              </div>

              {/* Confirm Button */}
              <button
                onClick={handleConfirmSuccess}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 shadow-md hover:shadow-lg"
              >
                Got it!
              </button>
            </div>
          </div>
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
