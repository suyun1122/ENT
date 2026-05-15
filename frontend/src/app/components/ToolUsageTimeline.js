'use client';

import { useMemo, useRef, useState } from 'react';
import { TOOL_COLORS } from '../constants/toolColors';
import {
  DEFAULT_TIMELINE_OPTIONS,
  buildContinuousSegments,
  flattenTimelineDetections,
} from '../utils/buildContinuousSegments';

const FALLBACK_COLORS = [
  '#7C3AED',
  '#059669',
  '#EA580C',
  '#0891B2',
  '#C026D3',
  '#4B5563',
];

function formatTime(seconds) {
  const safeSeconds = Number.isFinite(Number(seconds)) ? Number(seconds) : 0;
  const mins = Math.floor(safeSeconds / 60);
  const secs = Math.floor(safeSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getToolColor(toolName, index) {
  return TOOL_COLORS[toolName] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, value));
}

function groupByClassName(rows) {
  return rows.reduce((groups, row) => {
    const key = row.className || 'Unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
    return groups;
  }, {});
}

export default function ToolUsageTimeline({ detectionData, videoDuration, onSeekTo }) {
  const timelineRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [continuousMode, setContinuousMode] = useState(true);

  const flatRows = useMemo(() => flattenTimelineDetections(detectionData), [detectionData]);

  const segments = useMemo(
    () => buildContinuousSegments(detectionData, DEFAULT_TIMELINE_OPTIONS),
    [detectionData]
  );

  const pointsByTool = useMemo(() => groupByClassName(flatRows), [flatRows]);
  const segmentsByTool = useMemo(() => groupByClassName(segments), [segments]);

  const toolNames = useMemo(() => {
    const classNames = Object.values(detectionData?.classes || detectionData?.data?.classes || {});
    return [...new Set([...classNames, ...flatRows.map((row) => row.className)])]
      .filter(Boolean)
      .filter((toolName) =>
        continuousMode
          ? (segmentsByTool[toolName] || []).length > 0
          : (pointsByTool[toolName] || []).length > 0
      );
  }, [continuousMode, detectionData, flatRows, pointsByTool, segmentsByTool]);

  if (!detectionData || !videoDuration || flatRows.length === 0) {
    return (
      <div className="rounded-[20px] bg-white p-8 text-center outline outline-1 outline-offset-[-1px] outline-gray-300">
        <p className="text-gray-600">No tool detection data available</p>
      </div>
    );
  }

  const duration = Number(videoDuration);
  const basePixelsPerSecond = duration > 300 ? 3 : duration > 120 ? 4 : 5;
  const timelineWidth = Math.max(duration * zoom * basePixelsPerSecond, 560);
  const markerInterval = duration > 300 ? 60 : duration > 120 ? 30 : 15;
  const timeMarkers = [];

  for (let t = 0; t <= duration; t += markerInterval) {
    timeMarkers.push(t);
  }

  if (!timeMarkers.includes(duration)) {
    timeMarkers.push(duration);
  }

  const handleTimelineClick = (timestamp) => {
    if (onSeekTo) onSeekTo(timestamp);
  };

  return (
    <div className="rounded-[20px] bg-white p-6 outline outline-1 outline-offset-[-1px] outline-gray-300">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Tool Usage Timeline</h3>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={continuousMode}
            onClick={() => setContinuousMode((value) => !value)}
            className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            Continuous mode: {continuousMode ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            onClick={() => setZoom(Math.max(0.5, zoom - 0.5))}
            className="rounded bg-gray-100 px-3 py-1.5 text-sm font-semibold hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={zoom <= 0.5}
          >
            -
          </button>
          <span className="min-w-[70px] text-center text-sm font-medium text-gray-600">
            Zoom: {zoom}x
          </span>
          <button
            type="button"
            onClick={() => setZoom(Math.min(3, zoom + 0.5))}
            className="rounded bg-gray-100 px-3 py-1.5 text-sm font-semibold hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={zoom >= 3}
          >
            +
          </button>
        </div>
      </div>

      <div className="flex">
        <div className="flex-shrink-0 pr-4" style={{ width: '130px' }}>
          <div className="space-y-3 pt-2">
            {toolNames.map((toolName, index) => {
              const color = getToolColor(toolName, index);

              return (
                <div key={toolName} className="flex h-7 items-center">
                  <div
                    className="mr-2 h-3 w-3 flex-shrink-0 rounded"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate text-sm font-medium text-gray-700" title={toolName}>
                    {toolName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-x-auto border-l border-gray-200 pl-4">
          <div
            ref={timelineRef}
            className="relative"
            style={{ width: `${timelineWidth}px`, minWidth: '100%' }}
          >
            <div className="space-y-3 pt-2">
              {toolNames.map((toolName, index) => {
                const color = getToolColor(toolName, index);
                const toolSegments = segmentsByTool[toolName] || [];
                const toolPoints = pointsByTool[toolName] || [];

                return (
                  <div key={toolName} className="relative h-7">
                    <div className="absolute left-0 top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-gray-200" />

                    {continuousMode
                      ? toolSegments.map((segment, segmentIndex) => {
                          const safeStart = Math.min(segment.start, duration);
                          const safeEnd = Math.min(Math.max(segment.end, safeStart), duration);
                          const left = clampPercent((safeStart / duration) * 100);
                          const width = clampPercent(((safeEnd - safeStart) / duration) * 100);

                          return (
                            <button
                              type="button"
                              key={`${toolName}-${segment.start}-${segmentIndex}`}
                              onClick={() => handleTimelineClick(segment.start)}
                              className="absolute top-1/2 h-5 min-w-2 -translate-y-1/2 cursor-pointer rounded-md opacity-90 shadow-sm transition hover:z-20 hover:opacity-100"
                              style={{
                                left: `${left}%`,
                                width: `${width}%`,
                                minWidth: '8px',
                                backgroundColor: color,
                              }}
                              title={`${segment.className}: ${formatTime(segment.start)} - ${formatTime(segment.end)} (${segment.count} detections, avg ${(
                                segment.avgConfidence * 100
                              ).toFixed(0)}% confidence)`}
                            />
                          );
                        })
                      : toolPoints.map((point, pointIndex) => {
                          const left = clampPercent((point.timestamp / duration) * 100);

                          return (
                            <button
                              type="button"
                              key={`${toolName}-${point.timestamp}-${pointIndex}`}
                              onClick={() => handleTimelineClick(point.timestamp)}
                              className="absolute top-1/2 h-5 w-1.5 min-w-1.5 -translate-y-1/2 cursor-pointer rounded opacity-90 shadow-sm transition hover:z-20 hover:opacity-100"
                              style={{
                                left: `${left}%`,
                                backgroundColor: color,
                              }}
                              title={`${point.className}: ${formatTime(point.timestamp)} (${(
                                point.confidence * 100
                              ).toFixed(0)}% confidence)`}
                            />
                          );
                        })}
                  </div>
                );
              })}
            </div>

            <div className="relative mt-2 h-7">
              <div className="absolute left-0 top-0 h-px w-full bg-gray-300" />

              {timeMarkers.map((time) => {
                const left = clampPercent((time / duration) * 100);

                return (
                  <div key={time} className="absolute top-0" style={{ left: `${left}%` }}>
                    <div className="absolute left-0 top-0 h-1.5 w-px bg-gray-400" />
                    <span className="absolute left-0 top-2 -translate-x-1/2 whitespace-nowrap text-xs text-gray-600">
                      {formatTime(time)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-gray-200 pt-4">
        <p className="text-xs text-gray-500">
          Click on any bar to jump to that segment in the video. Hover for details.
        </p>
      </div>
    </div>
  );
}
