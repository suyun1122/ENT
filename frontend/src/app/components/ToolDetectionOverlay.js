'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { EyeIcon, EyeSlashIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { TOOL_COLORS } from '../constants/toolColors';

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getMedianTimestampGap(detections) {
  if (!Array.isArray(detections) || detections.length < 2) return null;

  const gaps = [];
  for (let i = 1; i < detections.length; i += 1) {
    const gap = detections[i].timestamp - detections[i - 1].timestamp;
    if (Number.isFinite(gap) && gap > 0) gaps.push(gap);
  }

  if (gaps.length === 0) return null;

  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

function getAdaptiveDisplayWindow(detectionData, sortedDetections) {
  const frameSkip = numeric(detectionData?.frame_skip, 0);
  const fps = numeric(detectionData?.video_properties?.fps, 0);
  const intervalFromFrames = frameSkip > 0 && fps > 0 ? frameSkip / fps : null;
  const intervalFromTimestamps = getMedianTimestampGap(sortedDetections);
  const sampleInterval = intervalFromFrames || intervalFromTimestamps || 1;

  return Math.max(0.75, sampleInterval / 2 + 0.35);
}

function findNearestDetection(detections, currentTime, maxDiffSec) {
  if (!detections.length) return null;

  let left = 0;
  let right = detections.length - 1;

  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (detections[middle].timestamp < currentTime) {
      left = middle + 1;
    } else {
      right = middle;
    }
  }

  const candidates = [detections[left], detections[left - 1]].filter(Boolean);
  let nearest = null;
  let nearestDiff = Infinity;

  for (const detection of candidates) {
    const diff = Math.abs(detection.timestamp - currentTime);
    if (diff < nearestDiff) {
      nearest = detection;
      nearestDiff = diff;
    }
  }

  return nearestDiff <= maxDiffSec ? nearest : null;
}

/**
 * ToolDetectionOverlay Component
 *
 * Renders bounding boxes for surgical tool detection on top of a video
 * Uses Canvas API for performance
 */
export default function ToolDetectionOverlay({
  videoRef,
  detectionData,
  isVisible = true,
  enabledTools = null // null means all tools enabled
}) {
  const canvasRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0, dpr: 1 });
  const [currentDetections, setCurrentDetections] = useState([]);

  const sortedDetections = useMemo(() => {
    const detections = Array.isArray(detectionData?.detections) ? detectionData.detections : [];
    return [...detections]
      .filter((detection) => Number.isFinite(Number(detection.timestamp)))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [detectionData]);

  const displayWindowSec = useMemo(
    () => getAdaptiveDisplayWindow(detectionData, sortedDetections),
    [detectionData, sortedDetections]
  );

  // Update canvas dimensions when video size changes
  useEffect(() => {
    let animationFrame = null;
    let resizeObserver = null;
    let activeVideo = null;

    const updateDimensions = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;

      const rect = video.getBoundingClientRect();
      const parentRect = video.parentElement?.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.round(rect.width || parentRect?.width || video.clientWidth || 0);
      const height = Math.round(rect.height || parentRect?.height || video.clientHeight || 0);

      if (width <= 0 || height <= 0) {
        animationFrame = requestAnimationFrame(updateDimensions);
        return;
      }

      setDimensions({ width, height, dpr });

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    const setupListeners = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas) {
        animationFrame = requestAnimationFrame(setupListeners);
        return;
      }

      activeVideo = video;
      updateDimensions();

      resizeObserver = new ResizeObserver(updateDimensions);
      resizeObserver.observe(video);
      if (video.parentElement) resizeObserver.observe(video.parentElement);

      window.addEventListener('resize', updateDimensions);
      video.addEventListener('loadedmetadata', updateDimensions);
      video.addEventListener('loadeddata', updateDimensions);
      video.addEventListener('canplay', updateDimensions);
    };

    setupListeners();

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', updateDimensions);
      if (activeVideo) {
        activeVideo.removeEventListener('loadedmetadata', updateDimensions);
        activeVideo.removeEventListener('loadeddata', updateDimensions);
        activeVideo.removeEventListener('canplay', updateDimensions);
      }
    };
  }, [videoRef]);

  // Update detections based on current video time
  useEffect(() => {
    let animationFrame = null;
    let activeVideo = null;

    const updateDetections = () => {
      const video = videoRef.current;
      if (!video) return;

      const currentTime = video.currentTime;
      const nearestDetection = findNearestDetection(
        sortedDetections,
        currentTime,
        displayWindowSec
      );

      setCurrentDetections(Array.isArray(nearestDetection?.tools) ? nearestDetection.tools : []);
    };

    const setupListeners = () => {
      const video = videoRef.current;

      if (!video) {
        animationFrame = requestAnimationFrame(setupListeners);
        return;
      }

      activeVideo = video;
      video.addEventListener('timeupdate', updateDetections);
      video.addEventListener('seeked', updateDetections);
      video.addEventListener('play', updateDetections);
      video.addEventListener('pause', updateDetections);
      updateDetections();
    };

    if (sortedDetections.length === 0) {
      setCurrentDetections([]);
      return undefined;
    }

    setupListeners();

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (activeVideo) {
        activeVideo.removeEventListener('timeupdate', updateDetections);
        activeVideo.removeEventListener('seeked', updateDetections);
        activeVideo.removeEventListener('play', updateDetections);
        activeVideo.removeEventListener('pause', updateDetections);
      }
    };
  }, [videoRef, sortedDetections, displayWindowSec]);

  // Draw bounding boxes on canvas
  useEffect(() => {
    if (!canvasRef.current || !isVisible || !currentDetections.length) {
      // Clear canvas if not visible or no detections
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const video = videoRef.current;

    if (!video || !detectionData) return;

    const displayWidth = dimensions.width || canvas.width;
    const displayHeight = dimensions.height || canvas.height;
    const dpr = dimensions.dpr || 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Calculate scale factors
    const videoProps = detectionData.video_properties || {};
    const sourceWidth = numeric(videoProps.width, video.videoWidth || displayWidth);
    const sourceHeight = numeric(videoProps.height, video.videoHeight || displayHeight);
    const scaleX = displayWidth / sourceWidth;
    const scaleY = displayHeight / sourceHeight;

    // Draw each detection
    currentDetections.forEach(detection => {
      const toolName = detection.class_name;

      // Check if this tool is enabled
      if (enabledTools && !enabledTools.includes(toolName)) {
        return;
      }

      const bbox = detection.bbox || {};
      const color = TOOL_COLORS[toolName] || '#FFFFFF';

      // Scale coordinates
      const x1 = numeric(bbox.x1, 0);
      const y1 = numeric(bbox.y1, 0);
      const x2 = numeric(bbox.x2, x1 + numeric(bbox.width, 0));
      const y2 = numeric(bbox.y2, y1 + numeric(bbox.height, 0));
      const x = Math.max(0, x1 * scaleX);
      const y = Math.max(0, y1 * scaleY);
      const width = Math.max(1, (x2 - x1) * scaleX);
      const height = Math.max(1, (y2 - y1) * scaleY);

      // Draw bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.5;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 4;
      ctx.strokeRect(x, y, width, height);
      ctx.shadowBlur = 0;

      // Draw label background
      const label = `${toolName} ${(numeric(detection.confidence, 0) * 100).toFixed(0)}%`;
      ctx.font = '14px Inter, sans-serif';
      const textMetrics = ctx.measureText(label);
      const textHeight = 20;
      const padding = 4;
      const labelX = Math.min(Math.max(0, x), Math.max(0, displayWidth - textMetrics.width - padding * 2));
      const labelY = y - textHeight - padding < 0 ? y + 2 : y - textHeight - padding;

      ctx.fillStyle = color;
      ctx.fillRect(
        labelX,
        labelY,
        textMetrics.width + padding * 2,
        textHeight + padding
      );

      // Draw label text
      ctx.fillStyle = '#000000';
      ctx.fillText(label, labelX + padding, labelY + textHeight - 4);
    });

  }, [currentDetections, isVisible, enabledTools, detectionData, videoRef, dimensions]);

  if (!detectionData) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 pointer-events-none z-10"
      style={{
        width: dimensions.width,
        height: dimensions.height,
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 0.3s'
      }}
    />
  );
}

/**
 * ToolFilterPanel Component
 *
 * Provides UI controls for filtering which tools are displayed
 */
export function ToolFilterPanel({ detectionData, enabledTools, onToggleTool, isVisible, onToggleVisibility }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!detectionData || !detectionData.classes) return null;

  const toolClasses = Object.entries(detectionData.classes).map(([id, name]) => ({
    id: parseInt(id),
    name
  }));

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between p-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
          <h3 className="font-semibold text-gray-900 text-sm">Tool Detection</h3>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onToggleVisibility}
            className={`cursor-pointer p-1.5 rounded transition-colors ${
              isVisible
                ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
            }`}
            title={isVisible ? 'Hide detections' : 'Show detections'}
          >
            {isVisible ? (
              <EyeIcon className="w-4 h-4" />
            ) : (
              <EyeSlashIcon className="w-4 h-4" />
            )}
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="cursor-pointer flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 font-medium transition-colors"
          >
            {isExpanded ? 'Collapse' : 'Filters'}
            {isExpanded ? (
              <ChevronUpIcon className="w-3 h-3" />
            ) : (
              <ChevronDownIcon className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-3 space-y-2">
          <p className="text-xs text-gray-500 mb-3">
            Toggle tools to show/hide in video
          </p>

          {toolClasses.map(tool => {
            const isEnabled = !enabledTools || enabledTools.includes(tool.name);
            const color = TOOL_COLORS[tool.name] || '#CCCCCC';

            return (
              <button
                key={tool.id}
                onClick={() => onToggleTool(tool.name)}
                className={`
                  cursor-pointer w-full flex items-center justify-between p-2 rounded-lg transition-all
                  ${isEnabled
                    ? 'bg-gray-50 hover:bg-gray-100'
                    : 'bg-gray-100 opacity-50 hover:opacity-75'
                  }
                `}
              >
                <div className="flex items-center space-x-2">
                  <div
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: color }}
                  ></div>
                  <span className={`text-sm font-medium ${
                    isEnabled ? 'text-gray-900' : 'text-gray-500'
                  }`}>
                    {tool.name}
                  </span>
                </div>

                <div className={`
                  w-10 h-5 rounded-full transition-colors relative
                  ${isEnabled ? 'bg-gray-800' : 'bg-gray-300'}
                `}>
                  <div className={`
                    absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm
                    ${isEnabled ? 'left-5' : 'left-0.5'}
                  `}></div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}




