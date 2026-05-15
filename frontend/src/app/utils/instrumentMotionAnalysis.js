function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function distance(a, b) {
  return Math.hypot(a.center_x - b.center_x, a.center_y - b.center_y);
}

function summarizeRows(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const pathDistances = safeRows
    .map((row) => row.step_distance_px)
    .filter((value) => Number.isFinite(value));
  const speeds = safeRows
    .map((row) => row.speed_px_s)
    .filter((value) => Number.isFinite(value));
  const xs = safeRows.map((row) => row.center_x).filter((value) => Number.isFinite(value));
  const ys = safeRows.map((row) => row.center_y).filter((value) => Number.isFinite(value));

  return {
    motionPoints: safeRows.length,
    uniqueTracks: new Set(safeRows.map((row) => row.object_id).filter(Boolean)).size,
    totalPathLengthPx: pathDistances.reduce((sum, value) => sum + value, 0),
    meanSpeedPxS:
      speeds.length > 0 ? speeds.reduce((sum, value) => sum + value, 0) / speeds.length : 0,
    maxSpeedPxS: speeds.length > 0 ? Math.max(...speeds) : 0,
    idleRatio:
      speeds.length > 0 ? speeds.filter((speed) => speed < 10).length / speeds.length : 0,
    workingAreaPx2:
      xs.length > 0 && ys.length > 0
        ? (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
        : 0,
  };
}

function csvValue(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function flattenDetections(rawDetectionData) {
  const data = rawDetectionData?.data?.detections ? rawDetectionData.data : rawDetectionData;
  const detections = Array.isArray(data?.detections) ? data.detections : [];

  return detections.flatMap((frameItem) => {
    const frame = frameItem.frame;
    const timestamp = numeric(frameItem.timestamp, 0);
    const tools = Array.isArray(frameItem.tools) ? frameItem.tools : [];

    return tools.map((tool) => {
      const bbox = tool.bbox || {};
      const x1 = numeric(bbox.x1, 0);
      const y1 = numeric(bbox.y1, 0);
      const x2 = numeric(bbox.x2, x1);
      const y2 = numeric(bbox.y2, y1);
      const width = numeric(bbox.width, x2 - x1);
      const height = numeric(bbox.height, y2 - y1);

      return {
        frame,
        timestamp,
        class_id: tool.class_id,
        class_name: tool.class_name || "Unknown",
        confidence: numeric(tool.confidence, 0),
        bbox,
        center_x: (x1 + x2) / 2,
        center_y: (y1 + y2) / 2,
        box_area: Math.max(0, width) * Math.max(0, height),
        aspect_ratio: height > 0 ? width / height : null,
      };
    });
  });
}

export function assignSimpleTrackIds(rows, options = {}) {
  const matchDistance = options.matchDistance ?? 160;
  const maxTimeGap = options.maxTimeGap ?? 8;
  const sortedRows = [...(rows || [])].sort((a, b) => a.timestamp - b.timestamp);
  const tracks = [];
  let nextTrackId = 1;

  return sortedRows.map((row) => {
    let bestTrack = null;
    let bestDistance = Infinity;

    for (const track of tracks) {
      if (track.class_name !== row.class_name) continue;
      if (row.timestamp - track.last_timestamp > maxTimeGap) continue;

      const centerDistance = distance(row, track);
      if (centerDistance < bestDistance) {
        bestDistance = centerDistance;
        bestTrack = track;
      }
    }

    if (!bestTrack || bestDistance > matchDistance) {
      bestTrack = {
        object_id: `instrument_${nextTrackId}`,
        class_name: row.class_name,
        center_x: row.center_x,
        center_y: row.center_y,
        last_timestamp: row.timestamp,
      };
      nextTrackId += 1;
      tracks.push(bestTrack);
    }

    bestTrack.center_x = row.center_x;
    bestTrack.center_y = row.center_y;
    bestTrack.last_timestamp = row.timestamp;

    return {
      ...row,
      object_id: bestTrack.object_id,
    };
  });
}

export function addMotionSpeeds(rows) {
  const sortedRows = [...(rows || [])].sort((a, b) => {
    if (a.object_id === b.object_id) return a.timestamp - b.timestamp;
    return String(a.object_id).localeCompare(String(b.object_id));
  });
  const previousByTrack = new Map();

  return sortedRows.map((row) => {
    const previous = previousByTrack.get(row.object_id);
    let stepDistance = null;
    let speed = null;

    if (previous) {
      const timeDiff = row.timestamp - previous.timestamp;
      if (timeDiff > 0) {
        stepDistance = distance(row, previous);
        speed = stepDistance / timeDiff;
      }
    }

    previousByTrack.set(row.object_id, row);

    return {
      ...row,
      step_distance_px: stepDistance,
      speed_px_s: speed,
    };
  });
}

export function computeClassMotionSummary(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    if (!groups.has(row.class_name)) groups.set(row.class_name, []);
    groups.get(row.class_name).push(row);
  }

  return [...groups.entries()]
    .map(([className, classRows]) => ({
      class_name: className,
      ...summarizeRows(classRows),
    }))
    .sort((a, b) => b.motionPoints - a.motionPoints);
}

export function computeTrackMotionSummary(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    if (!groups.has(row.object_id)) groups.set(row.object_id, []);
    groups.get(row.object_id).push(row);
  }

  return [...groups.entries()]
    .map(([objectId, trackRows]) => {
      const sorted = [...trackRows].sort((a, b) => a.timestamp - b.timestamp);
      return {
        object_id: objectId,
        class_name: sorted[0]?.class_name || "Unknown",
        start_time: sorted[0]?.timestamp ?? null,
        end_time: sorted[sorted.length - 1]?.timestamp ?? null,
        ...summarizeRows(sorted),
      };
    })
    .sort((a, b) => b.totalPathLengthPx - a.totalPathLengthPx);
}

export function buildInstrumentMotionAnalysis(rawDetectionData, videoDuration, options = {}) {
  const flatRows = flattenDetections(rawDetectionData);
  const trackedRows = assignSimpleTrackIds(flatRows, options);
  const motionRows = addMotionSpeeds(trackedRows);
  const metrics = computeInstrumentMotionMetrics(motionRows, videoDuration);

  return {
    rows: motionRows,
    metrics,
    classSummary: computeClassMotionSummary(motionRows),
    trackSummary: computeTrackMotionSummary(motionRows),
  };
}

export function motionRowsToCsv(rows) {
  const columns = [
    "frame",
    "timestamp",
    "object_id",
    "class_id",
    "class_name",
    "confidence",
    "center_x",
    "center_y",
    "bbox_x1",
    "bbox_y1",
    "bbox_x2",
    "bbox_y2",
    "box_area",
    "aspect_ratio",
    "step_distance_px",
    "speed_px_s",
  ];

  const lines = [columns.join(",")];
  for (const row of rows || []) {
    lines.push(
      columns
        .map((column) => {
          if (column === "bbox_x1") return csvValue(row.bbox?.x1);
          if (column === "bbox_y1") return csvValue(row.bbox?.y1);
          if (column === "bbox_x2") return csvValue(row.bbox?.x2);
          if (column === "bbox_y2") return csvValue(row.bbox?.y2);
          return csvValue(row[column]);
        })
        .join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

export function motionSummaryToCsv(summaryRows) {
  const columns = [
    "class_name",
    "object_id",
    "start_time",
    "end_time",
    "motionPoints",
    "uniqueTracks",
    "totalPathLengthPx",
    "meanSpeedPxS",
    "maxSpeedPxS",
    "idleRatio",
    "workingAreaPx2",
  ];

  const lines = [columns.join(",")];
  for (const row of summaryRows || []) {
    lines.push(columns.map((column) => csvValue(row[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function computeInstrumentMotionMetrics(rows, videoDuration) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const totalDetections = safeRows.length;

  if (totalDetections === 0) {
    return {
      totalDetections: 0,
      activeTools: [],
      classCounts: {},
      avgConfidence: 0,
      uniqueTracks: 0,
      totalPathLengthPx: 0,
      meanSpeedPxS: 0,
      maxSpeedPxS: 0,
      idleRatio: 0,
      workingAreaPx2: 0,
      dominantTool: "None",
      possibleFalsePositiveCount: 0,
      possibleFalsePositiveReasons: [],
      interpretation: ["No instrument motion points are available for this video."],
      videoDuration: numeric(videoDuration, 0),
    };
  }

  const classCounts = {};
  const trackCounts = {};
  let confidenceSum = 0;

  for (const row of safeRows) {
    classCounts[row.class_name] = (classCounts[row.class_name] || 0) + 1;
    trackCounts[row.object_id] = (trackCounts[row.object_id] || 0) + 1;
    confidenceSum += numeric(row.confidence, 0);
  }

  const activeTools = Object.keys(classCounts);
  const avgConfidence = confidenceSum / totalDetections;
  const uniqueTracks = Object.keys(trackCounts).length;
  const pathDistances = safeRows
    .map((row) => row.step_distance_px)
    .filter((value) => Number.isFinite(value));
  const speeds = safeRows
    .map((row) => row.speed_px_s)
    .filter((value) => Number.isFinite(value));
  const totalPathLengthPx = pathDistances.reduce((sum, value) => sum + value, 0);
  const meanSpeedPxS =
    speeds.length > 0 ? speeds.reduce((sum, value) => sum + value, 0) / speeds.length : 0;
  const maxSpeedPxS = speeds.length > 0 ? Math.max(...speeds) : 0;
  const idleRatio =
    speeds.length > 0 ? speeds.filter((speed) => speed < 10).length / speeds.length : 0;

  const xs = safeRows.map((row) => row.center_x).filter((value) => Number.isFinite(value));
  const ys = safeRows.map((row) => row.center_y).filter((value) => Number.isFinite(value));
  const workingAreaPx2 =
    xs.length > 0 && ys.length > 0
      ? (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
      : 0;

  const dominantTool =
    Object.entries(classCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "None";

  const boxAreas = safeRows.map((row) => row.box_area).filter((value) => Number.isFinite(value));
  const medianBoxArea = median(boxAreas);
  const possibleFalsePositiveRows = new Set();
  const reasonCounts = {
    lowConfidence: 0,
    oversizedBox: 0,
    rareClass: 0,
    singlePointTrack: 0,
    extremeAspectRatio: 0,
  };

  safeRows.forEach((row, index) => {
    if (numeric(row.confidence, 0) < 0.55) {
      possibleFalsePositiveRows.add(index);
      reasonCounts.lowConfidence += 1;
    }
    if (medianBoxArea > 0 && row.box_area > medianBoxArea * 4) {
      possibleFalsePositiveRows.add(index);
      reasonCounts.oversizedBox += 1;
    }
    if ((classCounts[row.class_name] || 0) <= 2) {
      possibleFalsePositiveRows.add(index);
      reasonCounts.rareClass += 1;
    }
    if ((trackCounts[row.object_id] || 0) <= 1) {
      possibleFalsePositiveRows.add(index);
      reasonCounts.singlePointTrack += 1;
    }
    if (
      Number.isFinite(row.aspect_ratio) &&
      (row.aspect_ratio < 0.15 || row.aspect_ratio > 8)
    ) {
      possibleFalsePositiveRows.add(index);
      reasonCounts.extremeAspectRatio += 1;
    }
  });

  const possibleFalsePositiveReasons = [];
  if (reasonCounts.oversizedBox > 0) {
    possibleFalsePositiveReasons.push(`${reasonCounts.oversizedBox} motion points have unusually large boxes that may skew center tracking.`);
  }
  if (reasonCounts.rareClass > 0) {
    possibleFalsePositiveReasons.push(`${reasonCounts.rareClass} motion points belong to tool classes that appear only 1-2 times.`);
  }
  if (reasonCounts.singlePointTrack > 0) {
    possibleFalsePositiveReasons.push(`${reasonCounts.singlePointTrack} motion points are single-point tracks.`);
  }
  if (reasonCounts.extremeAspectRatio > 0) {
    possibleFalsePositiveReasons.push(`${reasonCounts.extremeAspectRatio} motion points have extreme aspect ratios.`);
  }

  const interpretation = [];
  if (dominantTool !== "None") {
    interpretation.push(`The dominant moving instrument is ${dominantTool}, which has the highest number of tracked motion points.`);
  }
  if (possibleFalsePositiveRows.size > 0) {
    interpretation.push("Some motion points should be visually reviewed because they may come from non-instrument objects, background edges, or occlusion.");
  }
  if (workingAreaPx2 > 0 && workingAreaPx2 < 250000) {
    interpretation.push("The tracked instrument centers stay within a compact working area.");
  } else if (workingAreaPx2 >= 250000) {
    interpretation.push("The tracked instrument centers cover a broad working area across the frame.");
  }
  if (totalPathLengthPx > 5000) {
    interpretation.push("The accumulated path length is high, indicating substantial instrument movement.");
  } else {
    interpretation.push("The accumulated path length is limited, indicating relatively small instrument movement.");
  }
  if (idleRatio > 0.5) {
    interpretation.push("More than half of the measured motion intervals are slow or stationary.");
  } else if (speeds.length > 0) {
    interpretation.push("Most measured motion intervals show active instrument movement.");
  }

  return {
    totalDetections,
    activeTools,
    classCounts,
    avgConfidence,
    uniqueTracks,
    totalPathLengthPx,
    meanSpeedPxS,
    maxSpeedPxS,
    idleRatio,
    workingAreaPx2,
    dominantTool,
    possibleFalsePositiveCount: possibleFalsePositiveRows.size,
    possibleFalsePositiveReasons,
    interpretation,
    videoDuration: numeric(videoDuration, 0),
  };
}
