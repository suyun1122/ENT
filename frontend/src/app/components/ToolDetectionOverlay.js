'use client';

import { useEffect, useRef, useState } from 'react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

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
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [currentDetections, setCurrentDetections] = useState([]);

  // Tool color mapping
  const TOOL_COLORS = {
    'Bipolar': '#FF6B6B',      // Red
    'Clipper': '#4ECDC4',      // Teal
    'Grasper': '#FFE66D',      // Yellow
    'Hook': '#95E1D3',         // Mint
    'Irrigator': '#F38181',    // Pink
    'Scissors': '#AA96DA',     // Purple
    'Specimen Bag': '#FCBAD3'  // Light Pink
  };

  // Update canvas dimensions when video size changes
  useEffect(() => {
    const updateDimensions = () => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const rect = video.getBoundingClientRect();

        setDimensions({
          width: rect.width,
          height: rect.height
        });

        // Set canvas size to match video display size
        canvasRef.current.width = rect.width;
        canvasRef.current.height = rect.height;
      }
    };

    updateDimensions();

    // Update on window resize
    window.addEventListener('resize', updateDimensions);

    // Update when video metadata loads
    if (videoRef.current) {
      videoRef.current.addEventListener('loadedmetadata', updateDimensions);
    }

    return () => {
      window.removeEventListener('resize', updateDimensions);
      if (videoRef.current) {
        videoRef.current.removeEventListener('loadedmetadata', updateDimensions);
      }
    };
  }, [videoRef]);

  // Update detections based on current video time
  useEffect(() => {
    if (!videoRef.current || !detectionData || !detectionData.detections) {
      return;
    }

    const video = videoRef.current;

    const updateDetections = () => {
      const currentTime = video.currentTime;

      // Find detections closest to current time
      // Use binary search for efficiency with large detection arrays
      const detections = detectionData.detections;

      // Find the detection at or just before current time
      let closestDetection = null;
      let minTimeDiff = Infinity;

      for (const detection of detections) {
        const timeDiff = Math.abs(detection.timestamp - currentTime);
        if (timeDiff < minTimeDiff && timeDiff < 0.5) { // Within 0.5 seconds
          minTimeDiff = timeDiff;
          closestDetection = detection;
        }
      }

      setCurrentDetections(closestDetection ? closestDetection.tools : []);
    };

    // Update on time update
    video.addEventListener('timeupdate', updateDetections);
    video.addEventListener('seeked', updateDetections);

    // Initial update
    updateDetections();

    return () => {
      video.removeEventListener('timeupdate', updateDetections);
      video.removeEventListener('seeked', updateDetections);
    };
  }, [videoRef, detectionData]);

  // Draw bounding boxes on canvas
  useEffect(() => {
    if (!canvasRef.current || !isVisible || !currentDetections.length) {
      // Clear canvas if not visible or no detections
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const video = videoRef.current;

    if (!video || !detectionData) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate scale factors
    const videoProps = detectionData.video_properties;
    const scaleX = canvas.width / videoProps.width;
    const scaleY = canvas.height / videoProps.height;

    // Draw each detection
    currentDetections.forEach(detection => {
      const toolName = detection.class_name;

      // Check if this tool is enabled
      if (enabledTools && !enabledTools.includes(toolName)) {
        return;
      }

      const bbox = detection.bbox;
      const color = TOOL_COLORS[toolName] || '#FFFFFF';

      // Scale coordinates
      const x = bbox.x1 * scaleX;
      const y = bbox.y1 * scaleY;
      const width = bbox.width * scaleX;
      const height = bbox.height * scaleY;

      // Draw bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);

      // Draw label background
      const label = `${toolName} ${(detection.confidence * 100).toFixed(0)}%`;
      ctx.font = '14px Inter, sans-serif';
      const textMetrics = ctx.measureText(label);
      const textHeight = 20;
      const padding = 4;

      ctx.fillStyle = color;
      ctx.fillRect(
        x,
        y - textHeight - padding,
        textMetrics.width + padding * 2,
        textHeight + padding
      );

      // Draw label text
      ctx.fillStyle = '#000000';
      ctx.fillText(label, x + padding, y - padding - 4);
    });

  }, [currentDetections, isVisible, enabledTools, detectionData, videoRef]);

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

  // Tool color mapping (same as overlay)
  const TOOL_COLORS = {
    'Bipolar': '#FF6B6B',
    'Clipper': '#4ECDC4',
    'Grasper': '#FFE66D',
    'Hook': '#95E1D3',
    'Irrigator': '#F38181',
    'Scissors': '#AA96DA',
    'Specimen Bag': '#FCBAD3'
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between p-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
          <h3 className="font-semibold text-gray-900 text-sm">Tool Detection</h3>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onToggleVisibility}
            className={`p-1.5 rounded transition-colors ${
              isVisible
                ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
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
            className="text-xs text-gray-600 hover:text-gray-900 font-medium"
          >
            {isExpanded ? 'Collapse' : 'Filters'}
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
                  w-full flex items-center justify-between p-2 rounded-lg transition-all
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
                  ${isEnabled ? 'bg-emerald-500' : 'bg-gray-300'}
                `}>
                  <div className={`
                    absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform
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




