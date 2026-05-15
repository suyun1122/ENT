export const DEFAULT_TIMELINE_OPTIONS = {
  mergeGapSec: 6,
  minSegmentDurationSec: 2,
  bridgeGapSec: 3,
};

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeDetections(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.data?.detections)) return input.data.detections;
  if (Array.isArray(input?.detections)) return input.detections;
  return [];
}

function finishSegment(segment, minSegmentDurationSec) {
  const duration = segment.end - segment.start;
  return {
    className: segment.className,
    start: segment.start,
    end: duration < minSegmentDurationSec ? segment.start + minSegmentDurationSec : segment.end,
    count: segment.count,
    avgConfidence: segment.count > 0 ? segment.confidenceSum / segment.count : 0,
    maxConfidence: segment.maxConfidence,
  };
}

function mergeBridgedSegments(segments, options) {
  if (segments.length <= 1) return segments;

  const bridged = [];
  let current = { ...segments[0] };

  for (let i = 1; i < segments.length; i++) {
    const next = segments[i];
    const gap = next.start - current.end;

    if (gap <= options.bridgeGapSec) {
      current.end = Math.max(current.end, next.end);
      current.count += next.count;
      current.confidenceSum += next.confidenceSum;
      current.maxConfidence = Math.max(current.maxConfidence, next.maxConfidence);
      continue;
    }

    bridged.push(current);
    current = { ...next };
  }

  bridged.push(current);
  return bridged;
}

export function flattenTimelineDetections(input) {
  return normalizeDetections(input)
    .flatMap((detection) => {
      const timestamp = numeric(detection?.timestamp, null);
      const tools = Array.isArray(detection?.tools) ? detection.tools : [];

      if (timestamp === null) return [];

      return tools.map((tool) => ({
        className: tool?.class_name || tool?.className || 'Unknown',
        timestamp,
        confidence: numeric(tool?.confidence, 0),
      }));
    })
    .filter((row) => row.className && Number.isFinite(row.timestamp));
}

export function buildContinuousSegments(detections, options = {}) {
  const mergedOptions = {
    ...DEFAULT_TIMELINE_OPTIONS,
    ...options,
  };
  const rows = flattenTimelineDetections(detections);
  const grouped = new Map();

  for (const row of rows) {
    if (!grouped.has(row.className)) grouped.set(row.className, []);
    grouped.get(row.className).push(row);
  }

  const output = [];

  for (const [className, classRows] of grouped.entries()) {
    const sortedRows = [...classRows].sort((a, b) => a.timestamp - b.timestamp);
    const rawSegments = [];
    let current = null;

    for (const row of sortedRows) {
      if (!current) {
        current = {
          className,
          start: row.timestamp,
          end: row.timestamp,
          count: 1,
          confidenceSum: row.confidence,
          maxConfidence: row.confidence,
        };
        continue;
      }

      const gap = row.timestamp - current.end;
      if (gap <= mergedOptions.mergeGapSec) {
        current.end = row.timestamp;
        current.count += 1;
        current.confidenceSum += row.confidence;
        current.maxConfidence = Math.max(current.maxConfidence, row.confidence);
        continue;
      }

      rawSegments.push(current);
      current = {
        className,
        start: row.timestamp,
        end: row.timestamp,
        count: 1,
        confidenceSum: row.confidence,
        maxConfidence: row.confidence,
      };
    }

    if (current) rawSegments.push(current);

    output.push(
      ...mergeBridgedSegments(rawSegments, mergedOptions).map((segment) =>
        finishSegment(segment, mergedOptions.minSegmentDurationSec)
      )
    );
  }

  return output.sort((a, b) => {
    if (a.className === b.className) return a.start - b.start;
    return a.className.localeCompare(b.className);
  });
}
