'use client';

import { useUpload } from '../contexts/UploadContext';
import { CloudArrowUpIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

// Map TwelveLabs indexing status to user-friendly text
const getIndexingText = (stage) => {
  switch (stage) {
    case 'uploading':
      return 'Uploading video...';
    case 'validating':
      return 'Validating format...';
    case 'pending':
    case 'queued':
      return 'Queued for indexing...';
    case 'indexing':
      return 'Indexing video...';
    case 'ready':
      return 'Indexing complete';
    default:
      return 'Processing...';
  }
};

export default function UploadIndicator() {
  const {
    isUploading,
    progress,
    stage,
    indexingStage,
    fileName,
    error,
    completedVideoId,
    clearError,
    dismissComplete,
    isDetecting,
    isAnalyzing,
    indexingComplete,
    detectionComplete,
    analysisComplete,
  } = useUpload();

  // Don't render if nothing to show
  const isProcessing = isUploading || isDetecting || isAnalyzing;
  const allComplete = indexingComplete && detectionComplete && analysisComplete;
  const isComplete = completedVideoId && allComplete && !isProcessing;

  if (!isProcessing && !isComplete && !error) {
    return null;
  }

  // Determine what to show in subtitle (priority: indexing -> analysis -> detection)
  const getSubtitle = () => {
    // If still uploading file
    if (stage === 'uploading') {
      return `Uploading ${progress}%`;
    }

    // Show indexing status first (Twelve Labs)
    if (!indexingComplete) {
      return getIndexingText(indexingStage || stage);
    }

    // If indexing done but analysis in progress
    if (!analysisComplete) {
      return 'Analyzing video content...';
    }

    // If analysis done but still detecting tools
    if (!detectionComplete) {
      return 'Detecting surgical tools...';
    }

    return 'Finalizing...';
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Processing in progress (unified view) */}
      {isProcessing && (
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 min-w-[320px] animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <CloudArrowUpIcon className="w-5 h-5 text-blue-600 animate-pulse" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">Processing Video</p>
              <p className="text-xs text-gray-500 truncate">{fileName}</p>
            </div>
          </div>

          {/* Progress bar for uploading stage */}
          {stage === 'uploading' && (
            <div className="mt-3">
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Status indicator */}
          <div className="mt-3 flex items-center gap-2">
            <div className="flex space-x-1">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-gray-500">{getSubtitle()}</span>
          </div>

          {/* Step indicators - 3 steps */}
          <div className="mt-3 flex items-center gap-3 text-xs">
            <div className={`flex items-center gap-1 ${indexingComplete ? 'text-green-600' : 'text-gray-400'}`}>
              {indexingComplete ? (
                <CheckCircleIcon className="w-3.5 h-3.5" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-current" />
              )}
              <span>Indexed</span>
            </div>
            <div className={`flex items-center gap-1 ${analysisComplete ? 'text-green-600' : 'text-gray-400'}`}>
              {analysisComplete ? (
                <CheckCircleIcon className="w-3.5 h-3.5" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-current" />
              )}
              <span>Analyzed</span>
            </div>
            <div className={`flex items-center gap-1 ${detectionComplete ? 'text-green-600' : 'text-gray-400'}`}>
              {detectionComplete ? (
                <CheckCircleIcon className="w-3.5 h-3.5" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-current" />
              )}
              <span>Tools</span>
            </div>
          </div>
        </div>
      )}

      {/* Processing complete */}
      {isComplete && (
        <div className="bg-white rounded-lg shadow-lg border border-green-200 p-4 min-w-[280px] animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircleIcon className="w-5 h-5 text-green-600" />
              </div>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Processing complete!</p>
              <p className="text-xs text-gray-500">Video ready for review</p>
            </div>
            <button
              onClick={dismissComplete}
              className="text-gray-400 hover:text-gray-600"
            >
              <XCircleIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Error toast */}
      {error && !isUploading && (
        <div className="bg-white rounded-lg shadow-lg border border-red-200 p-4 min-w-[280px] animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <XCircleIcon className="w-5 h-5 text-red-600" />
              </div>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Upload failed</p>
              <p className="text-xs text-red-600 truncate">{error}</p>
            </div>
            <button
              onClick={clearError}
              className="text-gray-400 hover:text-gray-600"
            >
              <XCircleIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
