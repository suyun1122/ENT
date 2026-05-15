# Local Deployment Guide

This project is configured as a local YOLO surgical instrument detection demo. It does not require cloud video analysis services.

## Services

Run two services locally:

```text
Backend:  FastAPI + Ultralytics YOLO
Frontend: Next.js
```

## Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

The backend loads:

```text
backend/best.pt
```

Current model source:

```text
https://huggingface.co/joonhaim/surgical-tool-recognition-yolo26s
```

Current classes:

```text
clamp
needle_holder
scalpel
shear
tweezer
```

Default backend URL:

```text
http://127.0.0.1:8000
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:3000/clips
```

If the backend URL changes, create `frontend/.env.local`:

```env
LOCAL_YOLO_BACKEND_URL=http://127.0.0.1:8000
```

## Runtime Data

The local app creates these folders:

```text
frontend/data/
frontend/public/uploads/
frontend/public/detections/
frontend/public/analysis/
```

These folders are ignored by git because they contain local videos and generated detection results.

## Model Replacement

To replace the model:

1. Copy the new weight to `backend/best.pt`.
2. Restart the backend service.
3. Update `README.md`, `cv_model/README.md`, and `frontend/src/app/constants/toolColors.js` if class names change.
4. Re-upload videos or rerun detection, because old detection JSON files keep old model results.
