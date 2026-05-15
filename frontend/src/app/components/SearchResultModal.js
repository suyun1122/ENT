'use client';

import { useState, useRef, useEffect } from 'react';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon, ClipboardIcon, HandThumbUpIcon, HandThumbDownIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { HandThumbUpIcon as HandThumbUpSolid, HandThumbDownIcon as HandThumbDownSolid } from '@heroicons/react/24/solid';
import Hls from 'hls.js';

export default function SearchResultModal({
  isOpen,
  onClose,
  clip,
  allClips = [],
  currentIndex = 0,
  onNavigate
}) {
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState(null); // 'up' | 'down' | null
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  // Format duration helper
  const formatTimestamp = (seconds) => {
    if (seconds === undefined || seconds === null) return '00:00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get confidence badge styles
  const getConfidenceBadgeClass = (score) => {
    if (score >= 80) return 'bg-green-600 text-white';
    if (score >= 60) return 'bg-orange-500 text-white';
    return 'bg-gray-500 text-white';
  };

  const getConfidenceLabel = (score) => {
    if (score >= 80) return 'HIGH';
    if (score >= 60) return 'MEDIUM';
    return 'LOW';
  };

  // Initialize video player
  useEffect(() => {
    if (!isOpen || !clip?.video_url || !videoRef.current) return;

    const video = videoRef.current;

    // Clean up previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(clip.video_url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (clip.clipStart !== undefined) {
          video.currentTime = clip.clipStart;
        }
        video.play().catch(() => {});
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = clip.video_url;
      video.addEventListener('loadedmetadata', () => {
        if (clip.clipStart !== undefined) {
          video.currentTime = clip.clipStart;
        }
        video.play().catch(() => {});
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [isOpen, clip?.video_url, clip?.clipStart]);

  // Handle video time boundaries
  useEffect(() => {
    if (!videoRef.current || !clip?.clipEnd) return;

    const video = videoRef.current;
    const handleTimeUpdate = () => {
      if (video.currentTime >= clip.clipEnd) {
        video.currentTime = clip.clipStart || 0;
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [clip?.clipStart, clip?.clipEnd]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && currentIndex > 0) onNavigate(currentIndex - 1);
      if (e.key === 'ArrowRight' && currentIndex < allClips.length - 1) onNavigate(currentIndex + 1);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, allClips.length, onClose, onNavigate]);

  // Copy to clipboard
  const handleCopy = (type) => {
    let textToCopy = '';
    if (type === 'video_id') {
      textToCopy = clip.vss_id || clip.id || '';
    } else if (type === 'index_id') {
      textToCopy = clip.indexId || '';
    } else if (type === 'all') {
      textToCopy = JSON.stringify(getResponseData(), null, 2);
    }

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setShowCopyMenu(false);
    setTimeout(() => setCopied(false), 2000);
  };

  // Build response data for JSON display
  const getResponseData = () => ({
    index_id: clip.indexId || clip.pegasusId || '',
    score: clip.searchScore || 0,
    start: clip.clipStart || 0,
    end: clip.clipEnd || 0,
    video_id: clip.vss_id || clip.id || '',
    confidence: getConfidenceLabel(clip.searchScore),
    thumbnail_url: clip.thumbnail_url || '',
    id: clip.clipId || clip.id || ''
  });

  if (!isOpen || !clip) return null;

  const responseData = getResponseData();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-6xl mx-4 bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {clip.filename || clip.name || 'Untitled Video'}
              </h2>
              <div className="flex items-center gap-3 mt-2">
                {/* Confidence Badge */}
                <span className={`px-2 py-1 text-xs font-bold rounded ${getConfidenceBadgeClass(clip.searchScore)}`}>
                  {getConfidenceLabel(clip.searchScore)}
                </span>
                {/* Timestamp */}
                <span className="px-3 py-1 text-sm font-mono bg-gray-100 rounded border border-gray-300">
                  {formatTimestamp(clip.clipStart)}-{formatTimestamp(clip.clipEnd)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Copy IDs Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowCopyMenu(!showCopyMenu)}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <ClipboardIcon className="w-4 h-4" />
                  <span>{copied ? 'Copied!' : 'Copy IDs'}</span>
                  <ChevronDownIcon className="w-4 h-4" />
                </button>

                {showCopyMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowCopyMenu(false)} />
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-20 overflow-hidden">
                      <button
                        onClick={() => handleCopy('video_id')}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 transition-colors"
                      >
                        Copy Video ID
                      </button>
                      <button
                        onClick={() => handleCopy('index_id')}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 transition-colors"
                      >
                        Copy Index ID
                      </button>
                      <button
                        onClick={() => handleCopy('all')}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 transition-colors border-t border-gray-100"
                      >
                        Copy All Data
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Close Button */}
              <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col lg:flex-row">
          {/* Video Player */}
          <div className="flex-1 bg-black">
            <div className="relative aspect-video">
              <video
                ref={videoRef}
                controls
                playsInline
                className="w-full h-full object-contain"
                poster={clip.thumbnail_url}
              />
            </div>
          </div>

          {/* Response Panel */}
          <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-gray-200 bg-gray-50">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="px-3 py-1 text-sm font-medium bg-gray-900 text-white rounded">
                  Response
                </span>
                <button
                  onClick={() => handleCopy('all')}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
                  title="Copy response"
                >
                  <ClipboardIcon className="w-4 h-4" />
                </button>
              </div>

              {/* JSON Display */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <pre className="p-4 text-sm font-mono overflow-x-auto">
                  <code>
                    {'{'}
                    {Object.entries(responseData).map(([key, value], idx) => (
                      <div key={key} className="pl-4">
                        <span className="text-gray-600">{`"${key}"`}</span>
                        <span className="text-gray-400">: </span>
                        <span className={typeof value === 'number' ? 'text-orange-600' : 'text-green-700'}>
                          {typeof value === 'string' ? `"${value}"` : value}
                        </span>
                        {idx < Object.entries(responseData).length - 1 && <span className="text-gray-400">,</span>}
                      </div>
                    ))}
                    {'}'}
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          {/* Feedback Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
              className={`p-2 rounded-lg border transition-colors ${
                feedback === 'up'
                  ? 'bg-green-100 border-green-300 text-green-700'
                  : 'border-gray-300 text-gray-500 hover:bg-gray-100'
              }`}
              title="Good result"
            >
              {feedback === 'up' ? <HandThumbUpSolid className="w-5 h-5" /> : <HandThumbUpIcon className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
              className={`p-2 rounded-lg border transition-colors ${
                feedback === 'down'
                  ? 'bg-red-100 border-red-300 text-red-700'
                  : 'border-gray-300 text-gray-500 hover:bg-gray-100'
              }`}
              title="Bad result"
            >
              {feedback === 'down' ? <HandThumbDownSolid className="w-5 h-5" /> : <HandThumbDownIcon className="w-5 h-5" />}
            </button>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 mr-2">
              {currentIndex + 1} / {allClips.length}
            </span>
            <button
              onClick={() => onNavigate(currentIndex - 1)}
              disabled={currentIndex === 0}
              className={`p-2 rounded-lg border transition-colors ${
                currentIndex === 0
                  ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-100'
              }`}
              title="Previous result"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => onNavigate(currentIndex + 1)}
              disabled={currentIndex === allClips.length - 1}
              className={`p-2 rounded-lg border transition-colors ${
                currentIndex === allClips.length - 1
                  ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-100'
              }`}
              title="Next result"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
