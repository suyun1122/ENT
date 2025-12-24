# Surgical Tool Detection Integration Guide

## Overview

This feature adds real-time surgical tool detection to video playback using a trained YOLO11m model. Bounding boxes are overlaid on the video player using Canvas API, with support for filtering specific tools.

## Architecture

```
Video Upload → TwelveLabs Index → User Views Video
                                         ↓
                                  (First View) API detects video has no detection data
                                         ↓
                                  Download video from TwelveLabs
                                         ↓
                                  Run YOLO inference (Python script)
                                         ↓
                                  Save JSON results to /public/detections/
                                         ↓
                                  Load JSON and render Canvas overlay
```

## Components

### Backend
- **API Route**: `/api/detect-tools/[videoId]`
  - `GET`: Check detection status or retrieve results
  - `POST`: Start detection processing
- **Python Script**: `src/app/api/detect-tools/inference.py`
  - Runs YOLO inference on video
  - Generates JSON with timestamped detections
- **Model**: `models/surgical_tools.pt` (YOLO11m trained on Cholec80)

### Frontend
- **ToolDetectionOverlay**: Canvas component that draws bounding boxes
- **ToolFilterPanel**: UI controls for toggling tools on/off
- **ClickableVideo**: Modified to include overlay
- **ClipBento**: Orchestrates detection loading and state

## Detected Tools (7 Classes)

1. **Bipolar** (Red: #FF6B6B)
2. **Clipper** (Teal: #4ECDC4)
3. **Grasper** (Yellow: #FFE66D)
4. **Hook** (Mint: #95E1D3)
5. **Irrigator** (Pink: #F38181)
6. **Scissors** (Purple: #AA96DA)
7. **Specimen Bag** (Light Pink: #FCBAD3)

## Setup

### 1. Python Environment

The API uses the existing cv_model Python environment:

```bash
cd /Users/Miranda/twelveLabs/surgical-tool-detection/cv_model
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Model Location

Model is automatically copied to:
```
frontend/models/surgical_tools.pt
```

### 3. Detection Results Storage

JSON results are saved to:
```
frontend/public/detections/[videoId].json
```

## Usage

### Automatic Detection

1. Navigate to a surgical video (e.g., `/clips/[videoId]`)
2. The system automatically:
   - Checks if detection data exists
   - If not, starts processing in background
   - Polls for completion every 5 seconds
   - Loads results when ready

### Manual Controls

- **Show/Hide Detection**: Click the eye icon in the Tool Detection panel
- **Filter Tools**: Expand the panel and toggle individual tools on/off
- **Detection Progress**: Shows spinner and status during processing

## Performance

- **Processing Time**: ~1-2 minutes for a typical surgical video (depends on length)
- **Frame Skip**: Processes every 5th frame by default (configurable)
- **Canvas Rendering**: Real-time, synced with video playback
- **Caching**: Once processed, results are cached permanently

## JSON Format

```json
{
  "video_path": "/path/to/video.mp4",
  "model": "surgical_tools.pt",
  "video_properties": {
    "width": 1920,
    "height": 1080,
    "fps": 30,
    "total_frames": 9000,
    "duration": 300.0
  },
  "frame_skip": 5,
  "classes": {
    "0": "Bipolar",
    "1": "Clipper",
    "2": "Grasper",
    ...
  },
  "detections": [
    {
      "frame": 0,
      "timestamp": 0.0,
      "tools": [
        {
          "class_id": 2,
          "class_name": "Grasper",
          "confidence": 0.9523,
          "bbox": {
            "x1": 450.32,
            "y1": 200.15,
            "x2": 520.78,
            "y2": 290.43,
            "width": 70.46,
            "height": 90.28
          }
        }
      ]
    },
    ...
  ],
  "summary": {
    "total_frames_processed": 1800,
    "frames_with_detections": 1234,
    "total_tool_detections": 5678
  }
}
```

## API Endpoints

### GET /api/detect-tools/[videoId]

Check detection status or retrieve results.

**Response (not found):**
```json
{
  "status": "not_found",
  "videoId": "abc123",
  "message": "Tool detection has not been run for this video. Use POST to start processing."
}
```

**Response (processing):**
```json
{
  "status": "processing",
  "videoId": "abc123",
  "progress": 45,
  "stage": "running_detection"
}
```

**Response (completed):**
```json
{
  "status": "completed",
  "videoId": "abc123",
  "data": { ... } // Full detection JSON
}
```

### POST /api/detect-tools/[videoId]

Start detection processing.

**Response:**
```json
{
  "status": "started",
  "videoId": "abc123",
  "message": "Tool detection processing started. Use GET to check status."
}
```

## Troubleshooting

### Detection Not Starting

**Issue**: API returns 500 error

**Solution**:
- Check that Python environment is accessible
- Verify model file exists at `frontend/models/surgical_tools.pt`
- Check logs for Python errors

### Canvas Not Rendering

**Issue**: No bounding boxes appear on video

**Solution**:
- Check browser console for errors
- Verify JSON data is loaded (check Network tab)
- Ensure video dimensions match detection data
- Check that `showToolDetection` is true

### Python Script Errors

**Issue**: Inference script fails

**Solution**:
```bash
# Test script directly
cd frontend
python src/app/api/detect-tools/inference.py \
  /path/to/video.mp4 \
  models/surgical_tools.pt \
  /tmp/test_output.json \
  5
```

### Video Download Fails

**Issue**: Cannot download video from TwelveLabs

**Solution**:
- Verify TwelveLabs API key is set
- Check video has HLS URL available
- Ensure network connectivity

## Future Enhancements

- [ ] Real-time processing for live streams
- [ ] Batch reprocessing for existing videos
- [ ] Export detection results to CSV
- [ ] Tool timeline visualization
- [ ] Detection confidence threshold adjustment
- [ ] Custom tool color selection
- [ ] Detection statistics dashboard

## Technical Notes

### Why Canvas Overlay?

- **Performance**: Canvas is much faster than DOM elements for frequent updates
- **Video Quality**: Original video stays pristine
- **Flexibility**: Easy to toggle on/off, filter tools
- **Compatibility**: Works with HLS video player

### Why Polling Instead of WebSockets?

- **Simplicity**: No additional server infrastructure needed
- **Reliability**: Works across network boundaries
- **Adequate Performance**: 5-second polling is sufficient for background processing

### Frame Skip Strategy

Processing every 5th frame is a balance between:
- **Accuracy**: Surgical movements are relatively slow
- **Performance**: Reduces processing time by 80%
- **File Size**: Keeps JSON manageable

For higher accuracy, reduce frame_skip in the API route.

## Credits

- **Model**: YOLO11m trained on Cholec80 dataset
- **Dataset**: 7 surgical tool classes from laparoscopic cholecystectomy
- **Framework**: Ultralytics YOLO11

