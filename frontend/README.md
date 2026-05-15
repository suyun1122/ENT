# Surgical Instrument Detection Frontend

This is the local Next.js frontend for the surgical instrument detection demo.

## What It Does

- Lists local videos from `frontend/data/videos.json`.
- Uploads local videos through `/api/local-upload`.
- Stores uploaded videos under `public/uploads/`.
- Stores YOLO detection JSON under `public/detections/`.
- Plays local videos in `/clips/[id]`.
- Displays YOLO bounding boxes, tool filters, continuous usage timeline, usage statistics, and instrument motion data.

## Local Backend

The frontend expects the FastAPI YOLO backend to run at:

```text
http://127.0.0.1:8000
```

To use another backend URL, create `.env.local`:

```env
LOCAL_YOLO_BACKEND_URL=http://127.0.0.1:8000
```

## Commands

```bash
npm install
npm run dev
npm run build
```

Open:

```text
http://localhost:3000/clips
```

## Active Routes

- `/clips`
- `/clips/[id]`
- `/api/local-upload`
- `/api/video`
- `/api/detect-tools/[videoId]`
- `/api/motion/[videoId]`

This frontend does not require any cloud video indexing, cloud object storage, or AI chat service.
