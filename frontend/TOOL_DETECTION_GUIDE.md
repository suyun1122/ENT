# Tool Detection Guide

This frontend works with the local FastAPI YOLO backend in `../backend`.

## Current Model

Model source:

```text
https://huggingface.co/joonhaim/surgical-tool-recognition-yolo26s
```

Local weight:

```text
../backend/best.pt
```

Detected classes:

```text
clamp
needle_holder
scalpel
shear
tweezer
```

## Video Sampling

The backend analyzes one frame every 24 frames with a 960 px YOLO input size:

```text
frame_skip = 24
imgsz = 960
```

Approximate inference interval:

| Video FPS | Interval |
| --- | --- |
| 24 FPS | 1.0 second |
| 30 FPS | 0.8 second |
| 60 FPS | 0.4 second |

The backend attempts Ultralytics ByteTrack tracking and writes `track_id` when the tracker returns an ID. The frontend overlay also interpolates bounding boxes between sampled frames, which makes the box motion smoother without changing the original detection JSON.

## Local Workflow

1. Upload a video from `/clips`.
2. `src/app/api/local-upload/route.js` stores the video under `public/uploads/`.
3. The frontend sends the file to `http://127.0.0.1:8000/detect/upload`.
4. The backend runs YOLO inference and returns a detection JSON.
5. The frontend stores the result under `public/detections/`.
6. The detail page displays bounding boxes, timeline, statistics, and motion analysis.

## Main Components

- `ToolDetectionOverlay.js`: draws YOLO bounding boxes on the video canvas.
- `ToolUsageTimeline.js`: groups detections into continuous usage segments.
- `ToolUsageStatistics.js`: counts raw detections by tool class.
- `InstrumentMotionAnalysisPanel.js`: displays pixel-based motion metrics.
- `LocalClipBento.js`: coordinates the local video player and all detection panels.

## Detection JSON

```json
{
  "video_id": "local-...",
  "model": "best.pt",
  "frame_skip": 24,
  "inference_imgsz": 960,
  "tracking": {
    "enabled": true,
    "method": "Ultralytics ByteTrack",
    "track_id_field": "track_id"
  },
  "video_properties": {
    "width": 1280,
    "height": 720,
    "fps": 30,
    "duration": 80.8
  },
  "detections": [
    {
      "frame": 360,
      "timestamp": 12,
      "tools": [
        {
          "class_id": 1,
          "class_name": "needle_holder",
          "track_id": 7,
          "confidence": 0.72,
          "bbox": {
            "x1": 100,
            "y1": 120,
            "x2": 260,
            "y2": 300,
            "width": 160,
            "height": 180
          }
        }
      ]
    }
  ]
}
```

## Notes

Lowering `frame_skip` increases temporal accuracy but makes processing slower. Increasing it makes detection faster but can miss instruments that appear briefly. The frontend smoothing only stabilizes the displayed boxes; raw timeline and statistics still use the original detection records.
