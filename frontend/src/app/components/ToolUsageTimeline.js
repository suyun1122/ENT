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

  // Tool color mapping - distinct colors for each tool
  const TOOL_COLORS = {
    'Bipolar': '#E53935',      // Red
    'Clipper': '#00ACC1',      // Cyan/Teal
    'Grasper': '#FDD835',      // Yellow
    'Hook': '#43A047',         // Green
    'Irrigator': '#1E88E5',    // Blue (changed from pink to be distinct from Bipolar)
    'Scissors': '#8E24AA',     // Purple
    'Specimen Bag': '#F48FB1'  // Pink
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
      <div className="bg-white rounded-[20px] outline outline-1 outline-offset-[-1px] outline-gray-300 p-8 text-center">
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
    <div className="bg-white rounded-[20px] outline outline-1 outline-offset-[-1px] outline-gray-300 p-6">
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
      <div className="flex">
        {/* Left: Tool Labels (Fixed) */}
        <div className="flex-shrink-0 pr-4" style={{ width: '140px' }}>
          {/* Header spacer to align with time markers */}
          <div className="h-14 flex items-end pb-2">
            <span className="text-xs font-semibold text-gray-700">Surgical Tools</span>
          </div>
          {/* Tool labels - aligned with timeline rows */}
          <div className="space-y-3">
            {toolNames.map((toolName) => {
              const segments = toolSegments[toolName] || [];
              const color = TOOL_COLORS[toolName] || '#CCCCCC';

              if (segments.length === 0) return null;

              return (
                <div key={toolName} className="flex items-center h-8">
                  <div
                    className="w-3 h-3 rounded mr-2 flex-shrink-0"
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
            className="relative"
            style={{ width: `${timelineWidth}px`, minWidth: '100%' }}
          >
            {/* Time markers header */}
            <div className="relative h-14 mb-0">
              {/* Time label */}
              <div className="absolute top-0 left-0 text-xs font-semibold text-gray-600">
                Time
              </div>

              {/* Horizontal timeline bar */}
              <div className="absolute bottom-2 left-0 h-0.5 bg-gray-300" style={{ width: `${videoDuration * pixelsPerSecond}px` }}></div>

              {/* Time markers */}
              {timeMarkers.map((time) => (
                <div
                  key={time}
                  className="absolute bottom-2"
                  style={{ left: `${time * pixelsPerSecond}px` }}
                >
                  <span className="absolute -top-4 -translate-x-1/2 left-0 text-xs text-gray-600 whitespace-nowrap">
                    {formatTime(time)}
                  </span>
                  <div className="absolute bottom-0 left-0 w-px h-2 bg-gray-400"></div>
                </div>
              ))}

              {/* End marker */}
              <div
                className="absolute bottom-2"
                style={{ left: `${videoDuration * pixelsPerSecond}px` }}
              >
                <span className="absolute -top-4 -translate-x-1/2 left-0 text-xs text-gray-700 font-medium whitespace-nowrap">
                  {formatTime(videoDuration)}
                </span>
                <div className="absolute bottom-0 left-0 w-0.5 h-3 bg-gray-700"></div>
              </div>
            </div>

            {/* Tool lines - aligned with labels */}
            <div className="space-y-3">
              {toolNames.map((toolName) => {
                const segments = toolSegments[toolName] || [];
                const color = TOOL_COLORS[toolName] || '#CCCCCC';

                if (segments.length === 0) return null;

                return (
                  <div key={toolName} className="relative h-8">
                    {/* Timeline background line */}
                    <div
                      className="absolute top-1/2 left-0 h-1.5 transform -translate-y-1/2 rounded-full"
                      style={{
                        width: `${videoDuration * pixelsPerSecond}px`,
                        backgroundColor: '#E5E7EB'
                      }}
                    ></div>

                    {/* Segment bars */}
                    {segments.map((segment, segIndex) => {
                      const segmentWidth = Math.max((segment.end - segment.start) * pixelsPerSecond, 6);
                      return (
                        <div
                          key={segIndex}
                          onClick={() => handleTimelineClick(segment.start)}
                          className="absolute top-1/2 transform -translate-y-1/2 cursor-pointer hover:brightness-110 transition-all duration-150 hover:z-20"
                          style={{
                            left: `${segment.start * pixelsPerSecond}px`,
                            width: `${segmentWidth}px`,
                            height: '18px',
                            backgroundColor: color,
                            borderRadius: '3px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                            opacity: 0.85 + segment.avgConfidence * 0.15
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

