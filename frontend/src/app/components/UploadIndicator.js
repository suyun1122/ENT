'use client';

import { CloudArrowUpIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { useUpload } from '../contexts/UploadContext';

function getStatusText(stage, progress) {
  if (stage === 'uploading') return `Uploading video ${progress || 0}%`;
  if (stage === 'detecting') return 'Running local YOLO detection...';
  if (stage === 'complete') return 'Detection result saved locally';
  return 'Processing video...';
}

export default function UploadIndicator() {
  const {
    isUploading,
    isDetecting,
    progress,
    stage,
    fileName,
    error,
    completedVideoId,
    clearError,
    dismissComplete,
  } = useUpload();

  const isProcessing = isUploading || isDetecting;
  const isComplete = completedVideoId && !isProcessing && !error;

  if (!isProcessing && !isComplete && !error) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isProcessing && (
        <div className="min-w-[320px] rounded-lg border border-gray-200 bg-white p-4 shadow-lg animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                <CloudArrowUpIcon className="h-5 w-5 animate-pulse text-blue-600" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">Processing Video</p>
              <p className="truncate text-xs text-gray-500">{fileName}</p>
            </div>
          </div>

          {stage === 'uploading' && (
            <div className="mt-3">
              <div className="h-1.5 w-full rounded-full bg-gray-200">
                <div
                  className="h-1.5 rounded-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <div className="flex space-x-1">
              <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500" style={{ animationDelay: '0ms' }} />
              <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500" style={{ animationDelay: '150ms' }} />
              <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-gray-500">{getStatusText(stage, progress)}</span>
          </div>

          <div className="mt-3 flex items-center gap-3 text-xs">
            <div className={`flex items-center gap-1 ${progress >= 20 ? 'text-green-600' : 'text-gray-400'}`}>
              {progress >= 20 ? (
                <CheckCircleIcon className="h-3.5 w-3.5" />
              ) : (
                <div className="h-3.5 w-3.5 rounded-full border border-current" />
              )}
              <span>Uploaded</span>
            </div>
            <div className={`flex items-center gap-1 ${stage === 'detecting' ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className="h-3.5 w-3.5 rounded-full border border-current" />
              <span>Detecting</span>
            </div>
          </div>
        </div>
      )}

      {isComplete && (
        <div className="min-w-[280px] rounded-lg border border-green-200 bg-white p-4 shadow-lg animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                <CheckCircleIcon className="h-5 w-5 text-green-600" />
              </div>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Processing complete</p>
              <p className="text-xs text-gray-500">Video and detection JSON are saved locally</p>
            </div>
            <button onClick={dismissComplete} className="text-gray-400 hover:text-gray-600">
              <XCircleIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {error && !isUploading && (
        <div className="min-w-[280px] rounded-lg border border-red-200 bg-white p-4 shadow-lg animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <XCircleIcon className="h-5 w-5 text-red-600" />
              </div>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Upload failed</p>
              <p className="truncate text-xs text-red-600">{error}</p>
            </div>
            <button onClick={clearError} className="text-gray-400 hover:text-gray-600">
              <XCircleIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
