"""
Surgical Tool Detection Backend API
FastAPI server for YOLO-based tool detection
"""

import os
import json
import tempfile
import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import cv2
from ultralytics import YOLO

app = FastAPI(title="Surgical Tool Detection API")

# CORS - allow frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model at startup
MODEL_PATH = os.environ.get("MODEL_PATH", "best.pt")
model = None

# Processing status storage
processing_status = {}

class DetectionRequest(BaseModel):
    video_id: str
    blob_url: str
    callback_url: Optional[str] = None  # URL to notify when done

class DetectionResponse(BaseModel):
    status: str
    video_id: str
    message: str

@app.on_event("startup")
async def load_model():
    global model
    print(f"[Startup] Loading YOLO model from: {MODEL_PATH}")
    if os.path.exists(MODEL_PATH):
        model = YOLO(MODEL_PATH)
        print(f"[Startup] Model loaded successfully")
    else:
        print(f"[Startup] WARNING: Model file not found at {MODEL_PATH}")

@app.get("/")
async def root():
    return {"status": "ok", "service": "Surgical Tool Detection API"}

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "model_loaded": model is not None
    }

@app.get("/status/{video_id}")
async def get_status(video_id: str):
    """Get processing status for a video"""
    if video_id in processing_status:
        return processing_status[video_id]
    return {"status": "not_found", "video_id": video_id}

@app.post("/detect", response_model=DetectionResponse)
async def detect_tools(request: DetectionRequest, background_tasks: BackgroundTasks):
    """Start tool detection for a video"""

    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    video_id = request.video_id

    # Check if already processing
    if video_id in processing_status and processing_status[video_id].get("status") == "processing":
        return DetectionResponse(
            status="processing",
            video_id=video_id,
            message="Detection already in progress"
        )

    # Initialize status
    processing_status[video_id] = {
        "status": "processing",
        "progress": 0,
        "stage": "queued",
        "current_frame": 0,
        "total_frames": 0,
        "processed_frames": 0
    }

    # Run detection in background
    background_tasks.add_task(
        process_detection,
        video_id,
        request.blob_url,
        request.callback_url
    )

    return DetectionResponse(
        status="started",
        video_id=video_id,
        message="Tool detection started"
    )

async def process_detection(video_id: str, blob_url: str, callback_url: Optional[str]):
    """Process video detection in background"""
    temp_video_path = None

    try:
        processing_status[video_id] = {
            "status": "processing",
            "progress": 5,
            "stage": "downloading",
            "current_frame": 0,
            "total_frames": 0,
            "processed_frames": 0
        }

        # Download video from blob
        print(f"[Detection] Downloading video from: {blob_url}")
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.get(blob_url)
            response.raise_for_status()

            # Save to temp file
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
                f.write(response.content)
                temp_video_path = f.name

        print(f"[Detection] Video saved to: {temp_video_path}")

        processing_status[video_id] = {
            "status": "processing",
            "progress": 15,
            "stage": "loading_model",
            "current_frame": 0,
            "total_frames": 0,
            "processed_frames": 0
        }

        # Run inference
        results_data = run_inference(temp_video_path, video_id)

        processing_status[video_id] = {
            "status": "processing",
            "progress": 95,
            "stage": "uploading",
            "current_frame": 0,
            "total_frames": 0,
            "processed_frames": 0
        }

        # Upload results to Vercel Blob
        blob_token = os.environ.get("BLOB_READ_WRITE_TOKEN")
        if blob_token:
            await upload_results_to_blob(video_id, results_data, blob_token)

        # Notify callback if provided
        if callback_url:
            try:
                async with httpx.AsyncClient() as client:
                    await client.post(callback_url, json={
                        "video_id": video_id,
                        "status": "completed"
                    })
            except Exception as e:
                print(f"[Detection] Callback failed: {e}")

        processing_status[video_id] = {
            "status": "completed",
            "progress": 100,
            "stage": "done",
            "data": results_data
        }

        print(f"[Detection] Completed for video: {video_id}")

    except Exception as e:
        print(f"[Detection] Error: {e}")
        processing_status[video_id] = {
            "status": "error",
            "progress": 0,
            "stage": "failed",
            "error": str(e)
        }

    finally:
        # Cleanup temp file
        if temp_video_path and os.path.exists(temp_video_path):
            os.unlink(temp_video_path)

def run_inference(video_path: str, video_id: str, frame_skip: int = 120):
    """Run YOLO inference on video"""

    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    # Get video properties
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = total_frames / fps if fps > 0 else 0

    print(f"[Inference] Video: {width}x{height}, {fps} FPS, {total_frames} frames")

    # Update status with total frames info
    processing_status[video_id] = {
        "status": "processing",
        "progress": 20,
        "stage": "analyzing",
        "current_frame": 0,
        "total_frames": total_frames,
        "processed_frames": 0
    }

    results_data = {
        "video_id": video_id,
        "model": os.path.basename(MODEL_PATH),
        "video_properties": {
            "width": width,
            "height": height,
            "fps": fps,
            "total_frames": total_frames,
            "duration": duration
        },
        "frame_skip": frame_skip,
        "classes": {},
        "detections": []
    }

    frame_idx = 0
    processed_frames = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % frame_skip == 0:
                timestamp = frame_idx / fps if fps > 0 else 0

                # Run inference
                results = model.predict(
                    frame,
                    conf=0.5,
                    iou=0.45,
                    verbose=False
                )

                frame_detections = {
                    "frame": frame_idx,
                    "timestamp": round(timestamp, 3),
                    "tools": []
                }

                if len(results) > 0 and results[0].boxes is not None:
                    boxes = results[0].boxes

                    for box in boxes:
                        cls_id = int(box.cls[0])
                        conf = float(box.conf[0])
                        x1, y1, x2, y2 = box.xyxy[0].tolist()

                        class_name = model.names[cls_id]

                        if cls_id not in results_data["classes"]:
                            results_data["classes"][cls_id] = class_name

                        frame_detections["tools"].append({
                            "class_id": cls_id,
                            "class_name": class_name,
                            "confidence": round(conf, 4),
                            "bbox": {
                                "x1": round(x1, 2),
                                "y1": round(y1, 2),
                                "x2": round(x2, 2),
                                "y2": round(y2, 2),
                                "width": round(x2 - x1, 2),
                                "height": round(y2 - y1, 2)
                            }
                        })

                if len(frame_detections["tools"]) > 0:
                    results_data["detections"].append(frame_detections)

                processed_frames += 1

                # Log progress every 20 processed frames
                if processed_frames % 20 == 0:
                    print(f"[Inference] Processed {processed_frames} frames (frame {frame_idx}/{total_frames})")

                # Update progress every 10 processed frames with actual frame counts
                if processed_frames % 10 == 0:
                    progress = 30 + int((frame_idx / total_frames) * 60)
                    processing_status[video_id] = {
                        "status": "processing",
                        "progress": min(progress, 89),
                        "stage": "analyzing",
                        "current_frame": frame_idx,
                        "total_frames": total_frames,
                        "processed_frames": processed_frames
                    }

            frame_idx += 1

    finally:
        cap.release()

    results_data["summary"] = {
        "total_frames_processed": processed_frames,
        "frames_with_detections": len(results_data["detections"]),
        "total_tool_detections": sum(len(d["tools"]) for d in results_data["detections"])
    }

    print(f"[Inference] Complete: {results_data['summary']}")

    return results_data

async def upload_results_to_blob(video_id: str, results_data: dict, blob_token: str):
    """Upload detection results via Frontend API (which uses Vercel Blob SDK)"""

    # Frontend API endpoint - use environment variable or default
    frontend_url = os.environ.get("FRONTEND_URL", "https://surgical-tool-detection.vercel.app")

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.put(
            f"{frontend_url}/api/detect-tools/{video_id}",
            content=json.dumps(results_data),
            headers={
                "Content-Type": "application/json",
            }
        )

        if response.status_code in [200, 201]:
            print(f"[Blob] Uploaded results for {video_id}")
        else:
            print(f"[Blob] Upload failed: {response.status_code} - {response.text}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
