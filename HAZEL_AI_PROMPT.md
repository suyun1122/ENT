# Hazel.ai Prompt for Surgical Video Insight Application

## Application Overview

Build a **Surgical Video Insight Application** that analyzes surgical procedure videos using Twelve Labs video intelligence API and custom YOLO-based surgical tool detection. The application should provide comprehensive video analysis, tool detection, automated report generation, and AI-powered insights.

## Reference Architecture

This application follows a similar structure to a PPE (Personal Protective Equipment) detection system for construction sites, but adapted for surgical video analysis:

- **Frontend**: Next.js application with video upload, playback, and analytics dashboard
- **Backend Worker**: FastAPI service for video processing, tool detection, and Twelve Labs integration
- **CV Model**: YOLO11m model trained on Cholec80 dataset for detecting 7 surgical tools

## Core Features

### 1. Video Upload & Processing

- Upload surgical procedure videos (MP4, MOV formats)
- Automatic video chunking and processing
- Real-time processing status indicators
- Support for both live streams (RTSP) and archived videos

### 2. Surgical Tool Detection

- **Model**: YOLO11m trained on Cholec80 dataset (mAP50: 0.871)
- **Detectable Tools** (7 classes):
  - Bipolar
  - Clipper
  - Grasper
  - Hook
  - Irrigator
  - Scissors
  - Specimen Bag
- Real-time tool detection overlay on video frames
- Detection confidence scores and bounding boxes
- Tool usage timeline and statistics

### 3. Twelve Labs Integration

- Video indexing and search using Twelve Labs API
- Semantic video search (e.g., "find moments where scissors are used")
- Video chaptering and automatic scene segmentation
- AI-powered Q&A chatbot for video content
- Event timeline generation

### 4. Automated Report Generation

- **Surgical Procedure Report** including:
  - Procedure summary and duration
  - Tool usage statistics (frequency, duration per tool)
  - Tool transition timeline
  - Key moments and highlights
  - Compliance metrics (if applicable)
- Export reports as PDF or JSON
- Scheduled report generation (per procedure, daily, weekly)

### 5. Analytics Dashboard

- Real-time video playback with tool detection overlays
- Interactive timeline showing tool detections
- Tool usage heatmaps
- Procedure efficiency metrics
- Comparison across multiple procedures

## Technical Stack

### Frontend (Next.js)

- **Framework**: Next.js 14+ with App Router
- **UI Components**:
  - Video player with clickable timeline
  - Tool detection overlay visualization
  - Chapter timeline component
  - Event timeline component
  - Clip generation and preview
  - Chat interface for video Q&A
  - Report viewer and exporter
- **Styling**: Tailwind CSS
- **Icons**: Heroicons
- **Key Pages**:
  - `/`: Dashboard with video library
  - `/upload`: Video upload interface
  - `/procedure/[procedureId]`: Individual procedure analysis page
  - `/reports`: Generated reports library

### Backend Worker (FastAPI)

- **Framework**: FastAPI
- **Video Processing**:
  - RTSP stream capture (using MediaMTX)
  - Video chunking and segmentation
  - Frame extraction for tool detection
- **Computer Vision**:
  - YOLO11m model inference (using Ultralytics)
  - Tool detection on video frames
  - Bounding box drawing and annotation
  - Processed video generation
- **Twelve Labs Integration**:
  - Video upload to Twelve Labs
  - Index creation and management
  - Search and retrieval
  - Chapter generation
- **API Endpoints**:
  - `POST /upload`: Upload video for processing
  - `GET /procedure/{id}`: Get procedure analysis
  - `POST /analyze`: Trigger video analysis
  - `GET /tools/{procedureId}`: Get tool detection results
  - `POST /report/{procedureId}`: Generate report
  - `GET /search`: Semantic video search
  - `POST /chat`: Chat with video content

### Computer Vision Model

- **Model File**: `cv_model/training_scripts/best.pt` (YOLO11m, 39MB)
- **Inference Script**: `cv_model/training_scripts/inference_surgical_tools.py`
- **Model Performance**:
  - mAP50: 0.871
  - Precision: 0.889
  - Recall: 0.825
- **Detection Classes**: 7 surgical tools (Bipolar, Clipper, Grasper, Hook, Irrigator, Scissors, Specimen Bag)
- **Inference Parameters**:
  - Confidence threshold: 0.4
  - IOU threshold: 0.45
  - Image size: 640 (optimized for T4 GPU)

## Implementation Details

### 1. Video Processing Pipeline

```
Upload Video → Chunk Video → Process Each Chunk:
  ├─ Extract frames
  ├─ Run tool detection (YOLO)
  ├─ Draw bounding boxes
  ├─ Generate annotated video
  ├─ Upload to Twelve Labs
  └─ Index for search
```

### 2. Tool Detection Integration

```python
# Reference implementation from inference_surgical_tools.py
from ultralytics import YOLO

model = YOLO("best.pt")
results = model.predict(
    source=video_path,
    conf=0.4,
    iou=0.45,
    imgsz=640,
    save=True
)

# Process results to extract:
# - Tool class names
# - Confidence scores
# - Bounding box coordinates
# - Frame timestamps
```

### 3. Twelve Labs API Integration

- Use Twelve Labs Python SDK
- Create video index for each procedure
- Enable semantic search capabilities
- Generate video chapters automatically
- Implement chat functionality for Q&A

### 4. Report Generation

Generate comprehensive reports including:

- **Procedure Metadata**: Date, duration, procedure type
- **Tool Usage Statistics**:
  - Total detections per tool
  - Average confidence per tool
  - Tool usage timeline
  - Most frequently used tools
- **Key Moments**: Automatically identified important scenes
- **Visualizations**: Charts, graphs, timeline visualizations
- **Export Options**: PDF, JSON, CSV

## UI/UX Requirements

### Design System

- Follow the existing PPE detection app design patterns
- Color scheme: Medical/clinical theme (blues, whites, greens)
- Clean, professional interface suitable for medical professionals
- Responsive design for desktop and tablet

### Key UI Components

1. **Video Upload Page**:

   - Drag-and-drop video upload
   - Upload progress indicator
   - Video preview thumbnail

2. **Procedure Analysis Page**:

   - Video player with tool detection overlay
   - Interactive timeline showing tool detections
   - Tool legend with color coding
   - Statistics panel (tool counts, confidence scores)
   - Chapter navigation
   - Chat interface for video Q&A

3. **Dashboard**:

   - Grid of procedure cards
   - Search and filter functionality
   - Quick stats overview
   - Recent procedures list

4. **Report Viewer**:
   - PDF viewer
   - Download/export options
   - Share functionality

## Environment Variables Required

```
# Twelve Labs
TWELVE_LABS_API_KEY=your_api_key

# NVIDIA VSS (if using)
NVIDIA_VSS_BASE_URL=http://localhost:8080

# Backend API
API_BASE_URL=http://localhost:8000

# Model Path
CV_MODEL_PATH=./cv_model/training_scripts/best.pt
```

## File Structure

```
surgical-video-insight/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.js (Dashboard)
│   │   │   ├── upload/
│   │   │   ├── procedure/[id]/
│   │   │   ├── reports/
│   │   │   ├── components/
│   │   │   │   ├── VideoPlayer.js
│   │   │   │   ├── ToolDetectionOverlay.js
│   │   │   │   ├── ToolTimeline.js
│   │   │   │   ├── ChapterTimeline.js
│   │   │   │   ├── ReportViewer.js
│   │   │   │   └── VideoChat.js
│   │   │   └── api/
│   │   └── lib/
├── backend-worker/
│   ├── main.py (FastAPI app)
│   ├── cv_pipeline.py (Tool detection)
│   ├── twelve_labs_client.py
│   ├── report_generator.py
│   └── Dockerfile
└── cv_model/
    └── training_scripts/
        └── best.pt (Model weights)
```

## Key Implementation Notes

1. **Tool Detection**: Use the provided `best.pt` model file. The inference code should follow the pattern from `inference_surgical_tools.py` but integrated into the FastAPI worker.

2. **Video Processing**: Process videos in chunks to handle long surgical procedures efficiently. Each chunk should be analyzed, annotated, and uploaded to Twelve Labs.

3. **Real-time Updates**: Use WebSockets or Server-Sent Events to provide real-time processing updates to the frontend.

4. **Error Handling**: Implement robust error handling for:

   - Video upload failures
   - Model inference errors
   - Twelve Labs API failures
   - Network issues

5. **Performance**: Optimize for:
   - Fast video processing (use GPU acceleration)
   - Efficient video chunking
   - Caching of analysis results
   - Lazy loading of video segments

## Success Criteria

- ✅ Upload surgical video and process successfully
- ✅ Detect all 7 tool classes with high accuracy
- ✅ Generate comprehensive procedure reports
- ✅ Enable semantic search through video content
- ✅ Provide interactive video playback with tool overlays
- ✅ Support chat-based Q&A about video content
- ✅ Export reports in multiple formats

## Additional Features (Optional)

- Multi-procedure comparison
- Procedure templates and checklists
- Integration with hospital EMR systems
- Real-time alerts for critical moments
- Procedure quality scoring
- Surgeon performance analytics

---

**Note**: This application should be production-ready, with proper error handling, logging, and security measures. Follow best practices for medical data handling and ensure HIPAA compliance if handling real patient data.
