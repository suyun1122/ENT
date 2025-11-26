# Hazel.ai Prompt - Surgical Video Insight App

## Project Goal

Build a **Surgical Video Insight Application** that analyzes surgical procedure videos using Twelve Labs API and YOLO-based surgical tool detection. The app should allow users to upload surgical videos, detect tools in real-time, generate automated reports, and provide AI-powered video search and Q&A.

## Reference Project Structure

Use the existing PPE detection app structure as a template, but adapt it for surgical video analysis:

- **Frontend**: Next.js app (similar to `frontend/` directory)
- **Backend**: FastAPI worker (similar to `rtsp-stream-worker/`)
- **CV Model**: YOLO11m for surgical tool detection (use `cv_model/training_scripts/best.pt`)

## Core Features to Implement

### 1. Video Upload & Processing

- Upload surgical videos (MP4, MOV)
- Show processing progress
- Support video chunking for long procedures

### 2. Surgical Tool Detection (7 Tools)

Detect these tools using YOLO11m model (`best.pt`):

- Bipolar, Clipper, Grasper, Hook, Irrigator, Scissors, Specimen Bag

**Implementation Reference**: Use `cv_model/training_scripts/inference_surgical_tools.py` as a guide. The model has mAP50 of 0.871.

**Detection Parameters**:

```python
model.predict(source=video_path, conf=0.4, iou=0.45, imgsz=640, save=True)
```

### 3. Twelve Labs Integration

- Upload processed videos to Twelve Labs
- Create searchable video index
- Implement semantic search (e.g., "find moments with scissors")
- Generate video chapters automatically
- Add chat interface for video Q&A

### 4. Automated Report Generation

Generate PDF/JSON reports with:

- Procedure summary (duration, date)
- Tool usage statistics (count, frequency, timeline)
- Tool detection confidence scores
- Key moments and highlights
- Visual charts and graphs

### 5. UI Components (Reference Existing App)

- Video player with tool detection overlay
- Interactive timeline showing tool detections
- Chapter timeline (like `ChapterTimeline.js`)
- Event timeline (like `EventTimeline.js`)
- Chat interface (like `ClipChat.js`)
- Report viewer and exporter

## Technical Stack

**Frontend**:

- Next.js 14+ (App Router)
- Tailwind CSS
- Heroicons
- Similar structure to existing `frontend/src/app/`

**Backend**:

- FastAPI
- Ultralytics YOLO for tool detection
- Twelve Labs Python SDK
- Similar structure to `rtsp-stream-worker/main.py`

## Key Implementation Details

### Tool Detection Pipeline

```python
# In backend worker
from ultralytics import YOLO

class SurgicalToolDetector:
    def __init__(self):
        self.model = YOLO("best.pt")  # Use the trained model

    def detect_tools(self, video_path):
        results = self.model.predict(
            video_path,
            conf=0.4,
            iou=0.45,
            imgsz=640,
            save=True
        )
        # Extract: tool names, confidence, bounding boxes, timestamps
        return processed_results
```

### Video Processing Flow

1. Upload video → Backend receives file
2. Chunk video into segments
3. For each chunk:
   - Run tool detection (YOLO)
   - Draw bounding boxes on frames
   - Generate annotated video
   - Upload to Twelve Labs
   - Index for search
4. Generate report
5. Return results to frontend

### Frontend Pages Needed

- `/`: Dashboard with procedure library
- `/upload`: Video upload page
- `/procedure/[id]`: Procedure analysis page with:
  - Video player
  - Tool detection overlay
  - Timeline visualization
  - Statistics panel
  - Chat interface
- `/reports`: Reports library

### API Endpoints Needed

```
POST /api/upload - Upload video
GET /api/procedure/[id] - Get procedure data
POST /api/analyze/[id] - Trigger analysis
GET /api/tools/[id] - Get tool detection results
POST /api/report/[id] - Generate report
GET /api/search - Semantic video search
POST /api/chat - Chat with video
```

## UI Design

- Follow existing app's design patterns
- Medical/clinical theme (blues, whites)
- Clean, professional interface
- Responsive design

## Environment Variables

```
TWELVE_LABS_API_KEY=your_key
API_BASE_URL=http://localhost:8000
CV_MODEL_PATH=./cv_model/training_scripts/best.pt
```

## Deliverables

1. Complete Next.js frontend with all UI components
2. FastAPI backend with tool detection integration
3. Twelve Labs integration for search and chat
4. Report generation functionality
5. Video processing pipeline
6. Proper error handling and loading states

## Success Criteria

- ✅ Upload and process surgical videos
- ✅ Detect all 7 tool classes accurately
- ✅ Generate comprehensive reports
- ✅ Enable semantic video search
- ✅ Interactive video playback with tool overlays
- ✅ Chat-based Q&A about video content

**Start by setting up the project structure, then implement the video upload and processing pipeline, followed by tool detection integration, and finally the UI components and report generation.**
