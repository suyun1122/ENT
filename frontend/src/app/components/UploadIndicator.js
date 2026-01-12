'use client';

import { useUpload } from '../contexts/UploadContext';
import { CloudArrowUpIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

// Map TwelveLabs status to user-friendly text
const getStageInfo = (stage) => {
  switch (stage) {
    case 'uploading':
      return { title: 'Uploading...', subtitle: 'Transferring video file' };
    case 'validating':
      return { title: 'Validating...', subtitle: 'Checking video format' };
    case 'pending':
      return { title: 'Pending...', subtitle: 'Waiting in queue' };
    case 'queued':
      return { title: 'Queued...', subtitle: 'Ready for processing' };
    case 'indexing':
      return { title: 'Indexing...', subtitle: 'AI analyzing video' };
    default:
      return { title: 'Processing...', subtitle: 'Please wait' };
  }
};

export default function UploadIndicator() {
  const { isUploading, progress, stage, fileName, error, completedVideoId, clearError } = useUpload();

  // Don't render if nothing to show
  if (!isUploading && !completedVideoId && !error) {
    return null;
  }

  const stageInfo = getStageInfo(stage);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Upload in progress */}
      {isUploading && (
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 min-w-[280px] animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <CloudArrowUpIcon className="w-5 h-5 text-blue-600 animate-pulse" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {stageInfo.title}
              </p>
              <p className="text-xs text-gray-500 truncate">{fileName}</p>
            </div>
          </div>

          {/* Progress bar for uploading stage */}
          {stage === 'uploading' && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Processing stages indicator (non-uploading) */}
          {stage && stage !== 'uploading' && (
            <div className="mt-3 flex items-center gap-2">
              <div className="flex space-x-1">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-gray-500">{stageInfo.subtitle}</span>
            </div>
          )}
        </div>
      )}

      {/* Upload completed toast */}
      {completedVideoId && !isUploading && (
        <div className="bg-white rounded-lg shadow-lg border border-green-200 p-4 min-w-[280px] animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircleIcon className="w-5 h-5 text-green-600" />
              </div>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Upload complete!</p>
              <p className="text-xs text-gray-500">Video is now being processed</p>
            </div>
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
