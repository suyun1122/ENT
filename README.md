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
