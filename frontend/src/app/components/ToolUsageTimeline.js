'use client';

import { useRef, useEffect, useState, useMemo } from 'react';

/**
 * ToolUsageTimeline Component
 *
 * Displays a horizontal timeline showing tool detections as segments/bars
 */
export default function ToolUsageTimeline({ detectionData, videoDuration, onSeekTo }) {
  const timelineRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [scrollPosition, setScrollPosition] = useState(0);

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

  // Merge consecutive detections into segments
  const mergeIntoSegments = (detections, gapThreshold = 3) => {
    if (!detections || detections.length === 0) return [];

    // Sort by timestamp
    const sorted = [...detections].sort((a, b) => a.timestamp - b.timestamp);
    const segments = [];

    let currentSegment = {
      start: sorted[0].timestamp,
      end: sorted[0].timestamp,
      avgConfidence: sorted[0].confidence,
      count: 1
    };

    for (let i = 1; i < sorted.length; i++) {
      const detection = sorted[i];
      const gap = detection.timestamp - currentSegment.end;

      if (gap <= gapThreshold) {
        // Extend current segment
        currentSegment.end = detection.timestamp;
        currentSegment.avgConfidence =
          (currentSegment.avgConfidence * currentSegment.count + detection.confidence) /
          (currentSegment.count + 1);
        currentSegment.count++;
      } else {
        // Save current segment and start new one
        // Add minimum duration for visibility
        if (currentSegment.end - currentSegment.start < 1) {
          currentSegment.end = currentSegment.start + 1;
        }
        segments.push(currentSegment);
        currentSegment = {
          start: detection.timestamp,
          end: detection.timestamp,
          avgConfidence: detection.confidence,
          count: 1
        };
      }
    }

    // Don't forget the last segment
    if (currentSegment.end - currentSegment.start < 1) {
      currentSegment.end = currentSegment.start + 1;
    }
    segments.push(currentSegment);

    return segments;
  };

  if (!detectionData || !detectionData.detections || !videoDuration) {
    return (
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
        <p className="text-gray-500">No tool detection data available</p>
      </div>
    );
  }

  // Group detections by tool
  const toolTimelines = {};
  const toolNames = Object.values(detectionData.classes || {});

  toolNames.forEach(toolName => {
    toolTimelines[toolName] = [];
  });

  detectionData.detections.forEach(detection => {
    detection.tools.forEach(tool => {
      const toolName = tool.class_name;
      if (toolTimelines[toolName]) {
        toolTimelines[toolName].push({
          timestamp: detection.timestamp,
          confidence: tool.confidence
        });
      }
    });
  });

  // Convert to segments for each tool
  const toolSegments = {};
  toolNames.forEach(toolName => {
    toolSegments[toolName] = mergeIntoSegments(toolTimelines[toolName]);
  });

  // Format time for display
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate timeline width - adjusted for better default view
  const basePixelsPerSecond = videoDuration > 300 ? 3 : videoDuration > 120 ? 4 : 5;
  const timelineWidth = videoDuration * zoom * basePixelsPerSecond;
  const pixelsPerSecond = (basePixelsPerSecond * zoom);

  // Generate time markers
  const timeMarkers = [];
  const markerInterval = videoDuration > 300 ? 60 : videoDuration > 120 ? 30 : 15; // Every 60s, 30s, or 15s
  for (let t = 0; t <= videoDuration; t += markerInterval) {
    timeMarkers.push(t);
  }

  const handleTimelineClick = (timestamp) => {
    if (onSeekTo) {
      onSeekTo(timestamp);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Tool Usage Timeline</h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setZoom(Math.max(0.5, zoom - 0.5))}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={zoom <= 0.5}
          >
            -
          </button>
          <span className="text-sm text-gray-600 min-w-[70px] text-center font-medium">
            Zoom: {zoom}x
          </span>
          <button
            onClick={() => setZoom(Math.min(3, zoom + 0.5))}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={zoom >= 3}
          >
            +
          </button>
        </div>
      </div>

      {/* Two-column layout: Labels + Timeline */}
      <div className="flex gap-4">
        {/* Left: Tool Labels (Fixed) */}
        <div className="flex-shrink-0" style={{ width: '160px' }}>
          <div className="space-y-3 pt-20">
            <div className="text-xs font-semibold text-gray-700 bg-gray-50 px-2 py-1 rounded mb-4">
              Surgical Tools
            </div>
            {toolNames.map((toolName) => {
              const segments = toolSegments[toolName] || [];
              const color = TOOL_COLORS[toolName] || '#CCCCCC';

              if (segments.length === 0) return null;

              return (
                <div key={toolName} className="flex items-center h-8">
                  <div
                    className="w-4 h-4 rounded mr-2 flex-shrink-0"
                    style={{ backgroundColor: color }}
                  ></div>
                  <span className="text-sm font-medium text-gray-700 truncate" title={toolName}>
                    {toolName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Scrollable Timeline */}
        <div className="flex-1 overflow-x-auto border-l border-gray-200 pl-4" style={{ maxHeight: '400px' }}>
          <div
            ref={timelineRef}
            className="relative pt-8"
            style={{ width: `${timelineWidth}px`, minWidth: '100%' }}
          >
            {/* Time axis header */}
            <div className="absolute -top-2 left-0 text-xs font-semibold text-gray-600 mb-2">
              Time
            </div>

            {/* Time markers */}
            <div className="relative h-8 mb-6">
              {/* Horizontal timeline bar */}
              <div className="absolute bottom-0 left-0 h-0.5 bg-gray-300" style={{ width: `${videoDuration * pixelsPerSecond}px` }}></div>

              {/* Time markers */}
              {timeMarkers.map((time) => (
                <div
                  key={time}
                  className="absolute bottom-0"
                  style={{ left: `${time * pixelsPerSecond}px` }}
                >
                  <span className="absolute -top-6 -translate-x-1/2 left-0 text-xs text-gray-700 whitespace-nowrap font-medium">
                    {formatTime(time)}
                  </span>
                  <div className="absolute bottom-0 left-0 w-px h-2 bg-gray-400"></div>
                </div>
              ))}

              {/* End marker */}
              <div
                className="absolute bottom-0"
                style={{ left: `${videoDuration * pixelsPerSecond}px` }}
              >
                <span className="absolute -top-6 -translate-x-1/2 left-0 text-xs text-gray-900 font-bold whitespace-nowrap">
                  {formatTime(videoDuration)}
                </span>
                <div className="absolute bottom-0 left-0 w-0.5 h-3 bg-gray-900"></div>
              </div>
            </div>

            {/* Tool lines */}
            <div className="space-y-3">
              {toolNames.map((toolName) => {
                const segments = toolSegments[toolName] || [];
                const color = TOOL_COLORS[toolName] || '#CCCCCC';

                if (segments.length === 0) return null;

                return (
                  <div key={toolName} className="relative h-8">
                    {/* Timeline background line */}
                    <div
                      className="absolute top-1/2 left-0 h-2 transform -translate-y-1/2 rounded-full"
                      style={{
                        width: `${videoDuration * pixelsPerSecond}px`,
                        backgroundColor: '#F3F4F6'
                      }}
                    ></div>

                    {/* Segment bars */}
                    {segments.map((segment, segIndex) => {
                      const segmentWidth = Math.max((segment.end - segment.start) * pixelsPerSecond, 8);
                      return (
                        <div
                          key={segIndex}
                          onClick={() => handleTimelineClick(segment.start)}
                          className="absolute top-1/2 transform -translate-y-1/2 cursor-pointer hover:brightness-110 transition-all duration-150 hover:z-20"
                          style={{
                            left: `${segment.start * pixelsPerSecond}px`,
                            width: `${segmentWidth}px`,
                            height: '20px',
                            backgroundColor: color,
                            borderRadius: '4px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                            opacity: 0.7 + segment.avgConfidence * 0.3
                          }}
                          title={`${toolName}: ${formatTime(segment.start)} - ${formatTime(segment.end)} (${segment.count} detections, avg ${(segment.avgConfidence * 100).toFixed(0)}% confidence)`}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500 italic">
          💡 Click on any bar to jump to that segment in the video. Hover for details. Use zoom controls to adjust the timeline scale.
        </p>
      </div>
    </div>
  );
}

