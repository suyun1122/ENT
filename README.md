<<<<<<< HEAD
## Surgical Video Insight App

AI-powered surgical video analysis platform that enables surgeons, researchers, and educators to automatically analyze surgical videos — segmenting phases, detecting tools, generating operative reports, and providing explainable insights.

### Overview

This application transforms raw surgical footage into structured, searchable knowledge using Twelve Labs' multimodal video understanding APIs (`Analyze`, `Search`) and custom YOLO-based surgical tool detection.

**Key Features:**
- **Automatic Phase Segmentation**: Detect and label surgical phases (Preparation → Incision → Tumor Removal → Closure)
- **Critical Event Detection**: Identify key events like bleeding, tissue dissection, and tool collisions
- **Tool Usage Analysis**: Detect surgical instruments with duration and frequency tracking
- **AI-Generated Operative Reports**: SOAP format reports with first-person perspective toggle
- **Natural Language Search**: Query videos like "moment when dura opened" or "use of Rhoton dissector"

### Repository Structure

```
├── frontend/           # Next.js app for video analysis, search, and reporting UI
├── backend/            # FastAPI backend with YOLO inference for tool detection
├── cv_model/           # Surgical tool detection training module (YOLOv11 + Cholec80)
├── rtsp-stream-worker/ # RTSP stream processing and video chunking service
└── assets/             # Images and diagrams
```

### Getting Started

1. **Frontend**: See `frontend/README.md` to configure environment variables and run the UI.
   ```bash
   cd frontend && npm install && npm run dev
   ```

2. **Backend**: Deploy the FastAPI backend with the trained YOLO model (`best.pt`).
   ```bash
   cd backend && pip install -r requirements.txt && python main.py
   ```

3. **CV Model Training**: See `cv_model/README.md` for training surgical tool detection models with Cholec80 dataset.

### Environment Variables

Required credentials for AWS, TwelveLabs API, and service endpoints. Create `.env` files in each module directory as described in their respective READMEs.

### Documentation

- `PRD.md` — Product Requirements Document
- `DEPLOYMENT.md` — Deployment guide
- `cv_model/README.md` — Model training documentation
- `COLAB_SETUP_GUIDE.md` — Google Colab training setup
=======
# Surgical Tool Detection

AI-powered surgical tool detection and analysis platform using YOLO computer vision and TwelveLabs video intelligence.

**Live Demo**: [https://surgical-tool-detection-dun.vercel.app](https://surgical-tool-detection-dun.vercel.app)

![Sample App Demo](frontend/public/sample_app_demo.gif)

## Overview

This application automatically detects and tracks surgical instruments in laparoscopic surgery videos. It combines real-time YOLO-based object detection with TwelveLabs' video understanding capabilities to provide comprehensive surgical video analysis.

### Key Features

- **Automatic Tool Detection**: YOLO-based detection of 7 surgical instruments (Bipolar, Clipper, Grasper, Hook, Irrigator, Scissors, Specimen Bag)
- **Tool Usage Timeline**: Visual timeline showing when each tool appears in the video
- **Usage Statistics**: Aggregated statistics on tool usage frequency and duration
- **Video Search**: Natural language search across indexed surgical videos via TwelveLabs
- **Clip Generation**: Create and export video clips of specific tool usage segments

### Detected Surgical Tools

| Tool | Color |
|------|-------|
| Bipolar | Red |
| Clipper | Cyan |
| Grasper | Yellow |
| Hook | Green |
| Irrigator | Blue |
| Scissors | Purple |
| Specimen Bag | Pink |

## Tech Stack

### Frontend
- **Framework**: Next.js 15 with Turbopack
- **UI**: React 19, Tailwind CSS 4
- **Video**: HLS.js for video playback
- **API**: TwelveLabs JS SDK for video intelligence
- **Storage**: Vercel Blob, AWS S3

### Backend
- **Framework**: FastAPI (Python)
- **ML Model**: YOLO (Ultralytics) for object detection
- **Video Processing**: OpenCV
- **Deployment**: Docker, Railway

## Repository Structure

```
├── frontend/          # Next.js web application
│   ├── src/app/
│   │   ├── components/   # React components (Timeline, Statistics, etc.)
│   │   ├── api/          # API routes
│   │   └── clips/        # Clip management pages
├── backend/           # FastAPI detection server
│   ├── main.py           # Detection API endpoints
│   └── best.pt           # Trained YOLO model weights
├── cv_model/          # Model training scripts and results
└── rtsp-stream-worker/   # RTSP streaming worker (optional)
```

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.10+
- Docker (optional, for backend deployment)

### Frontend Setup

```bash
cd frontend
npm install
```

Create `.env.local` with required environment variables:
```env
TWELVE_LABS_API_KEY=your_api_key
TWELVE_LABS_INDEX_ID=your_index_id
BLOB_READ_WRITE_TOKEN=your_blob_token
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

Run the development server:
```bash
npm run dev
```

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
```

Set environment variables:
```env
MODEL_PATH=best.pt
FRONTEND_URL=http://localhost:3000
BLOB_READ_WRITE_TOKEN=your_blob_token
```

Run the server:
```bash
python main.py
```

## API Endpoints

### Backend (Detection API)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check and model status |
| POST | `/detect` | Start detection from blob URL |
| POST | `/detect/upload` | Direct video upload for detection |
| GET | `/status/{video_id}` | Get processing status |

## Environment Variables

### Frontend
| Variable | Description |
|----------|-------------|
| `TWELVE_LABS_API_KEY` | TwelveLabs API key |
| `TWELVE_LABS_INDEX_ID` | TwelveLabs index ID |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token |
| `NEXT_PUBLIC_BACKEND_URL` | Backend API URL |

### Backend
| Variable | Description |
|----------|-------------|
| `MODEL_PATH` | Path to YOLO model weights |
| `FRONTEND_URL` | Frontend URL for callbacks |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token |
| `PORT` | Server port (default: 8000) |
>>>>>>> 8b11436845a3cb8741e7092e084ae43e4d3f3b07
