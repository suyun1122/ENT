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