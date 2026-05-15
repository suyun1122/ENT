"""
Surgical Tool Detection Backend API
FastAPI server for YOLO-based tool detection
"""

import os

# Set environment variables for headless operation BEFORE any imports
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
os.environ.setdefault("MPLBACKEND", "Agg")
os.environ.setdefault("OPENCV_IO_ENABLE_OPENEXR", "0")
import tempfile
import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import shutil

# Lazy imports for heavy dependencies (cv2, ultralytics)
# These are imported inside functions to allow the server to start quickly
cv2 = None
YOLO = None

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
model_loading = False  # Track if model is currently loading

# Processing status storage
processing_status = {}

class DetectionRequest(BaseModel):
    video_id: str
    video_url: str
    callback_url: Optional[str] = None  # URL to notify when done

class DetectionResponse(BaseModel):
    status: str
    video_id: str
    message: str

@app.on_event("startup")
async def startup_event():
    """Start model loading in background - don't block startup"""
    import asyncio
    print(f"[Startup] Server starting, will load model in background")
    # Start model loading as a background task
    asyncio.create_task(load_model_background())

async def load_model_background():
    """Load model in background thread to not block the event loop"""
    global model, model_loading, cv2, YOLO
    import asyncio

    model_loading = True
    print(f"[Startup] Loading YOLO model from: {MODEL_PATH}")

    def _load_model():
        """Blocking function to import and load model"""
        global cv2, YOLO
        # Ensure headless mode for cv2
        os.environ["QT_QPA_PLATFORM"] = "offscreen"
        os.environ["MPLBACKEND"] = "Agg"

        # Preload X11 libraries in dependency order
        try:
            import ctypes
            lib_path = "/usr/lib/x86_64-linux-gnu"
            libs_to_load = [
                "libXau.so.6",
                "libXdmcp.so.6",
                "libxcb.so.1",
                "libX11.so.6",
            ]
            for lib in libs_to_load:
                try:
                    ctypes.CDLL(f"{lib_path}/{lib}", mode=ctypes.RTLD_GLOBAL)
                    print(f"[Startup] Preloaded {lib}")
                except Exception as e:
                    print(f"[Startup] Could not preload {lib}: {e}")
        except Exception as e:
            print(f"[Startup] Library preload failed: {e}")

        print(f"[Startup] Importing cv2 and ultralytics...")
        import cv2 as _cv2
        from ultralytics import YOLO as _YOLO
        cv2 = _cv2
        YOLO = _YOLO
        print(f"[Startup] Imports complete, loading model...")
        return _YOLO(MODEL_PATH)

    try:
        if os.path.exists(MODEL_PATH):
            # Run the blocking imports and model load in a thread pool
            loop = asyncio.get_event_loop()
            model = await loop.run_in_executor(None, _load_model)
            print(f"[Startup] Model loaded successfully")
        else:
            print(f"[Startup] WARNING: Model file not found at {MODEL_PATH}")
    except Exception as e:
        print(f"[Startup] ERROR loading model: {e}")
        import traceback
        traceback.print_exc()
    finally:
        model_loading = False

@app.get("/")
async def root():
    return {"status": "ok", "service": "Surgical Tool Detection API"}

@app.get("/health")
async def health():
    """Health check - responds immediately even if model is still loading"""
    return {
        "status": "healthy",
        "model_loaded": model is not None,
        "model_loading": model_loading
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
        if model_loading:
            raise HTTPException(status_code=503, detail="Model is still loading, please try again shortly")
        raise HTTPException(status_code=503, detail="Model not loaded")

    video_id = request.video_id

    # Check if already processing in memory
    if video_id in processing_status and processing_status[video_id].get("status") == "processing":
        return DetectionResponse(
            status="processing",
            video_id=video_id,
            message="Detection already in progress"
        )

    # Check if results already exist in the frontend detection API.
    # Only check for "completed" status - ignore "processing" to avoid circular dependency
    frontend_url = os.environ.get("FRONTEND_URL")
    if not frontend_url:
        print("[Detection] WARNING: FRONTEND_URL not set, skipping existing results check")
    else:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                check_response = await client.get(f"{frontend_url}/api/detect-tools/{video_id}")
                if check_response.status_code == 200:
                    check_data = check_response.json()
                    if check_data.get("status") == "completed":
                        print(f"[Detection] Results already exist for {video_id}")
                        # Store in local cache too
                        processing_status[video_id] = {
                            "status": "completed",
                            "progress": 100,
                            "stage": "done",
                            "data": check_data.get("data")
                        }
                        return DetectionResponse(
                            status="completed",
                            video_id=video_id,
                            message="Detection already completed"
                        )
                    # Note: We don't check for "processing" here anymore
                    # The frontend's processing-status was causing a circular dependency
        except Exception as e:
            print(f"[Detection] Could not check existing results: {e}")
            # Continue with processing if check fails

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
        request.video_url,
        request.callback_url
    )

    return DetectionResponse(
        status="started",
        video_id=video_id,
        message="Tool detection started"
    )

@app.post("/detect/upload", response_model=DetectionResponse)
async def detect_tools_upload(
    video_id: str = Form(...),
    video: UploadFile = File(...)
):
    """
    Direct video upload endpoint for faster processing.
    Accepts a video file directly.
    Video is deleted after processing.
    """

    if model is None:
        if model_loading:
            raise HTTPException(status_code=503, detail="Model is still loading, please try again shortly")
        raise HTTPException(status_code=503, detail="Model not loaded")

    # Check if already processing
    if video_id in processing_status and processing_status[video_id].get("status") == "processing":
        return DetectionResponse(
            status="processing",
            video_id=video_id,
            message="Detection already in progress"
        )

    temp_video_path = None

    try:
        # Initialize status
        processing_status[video_id] = {
            "status": "processing",
            "progress": 5,
            "stage": "receiving",
            "current_frame": 0,
            "total_frames": 0,
            "processed_frames": 0
        }

        # Save uploaded file to temp
        print(f"[Detection Upload] Receiving video for {video_id}")
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            shutil.copyfileobj(video.file, f)
            temp_video_path = f.name

        print(f"[Detection Upload] Video saved to: {temp_video_path}")

        processing_status[video_id] = {
            "status": "processing",
            "progress": 15,
            "stage": "analyzing",
            "current_frame": 0,
            "total_frames": 0,
            "processed_frames": 0
        }

        # Run inference synchronously
        results_data = run_inference(temp_video_path, video_id)

        processing_status[video_id] = {
            "status": "processing",
            "progress": 95,
            "stage": "finalizing",
            "current_frame": 0,
            "total_frames": 0,
            "processed_frames": 0
        }

        processing_status[video_id] = {
            "status": "completed",
            "progress": 100,
            "stage": "done",
            "data": results_data
        }

        print(f"[Detection Upload] Completed for video: {video_id}")

        return DetectionResponse(
            status="completed",
            video_id=video_id,
            message=f"Detection completed. Found {results_data['summary']['total_tool_detections']} tools."
        )

    except Exception as e:
        print(f"[Detection Upload] Error: {e}")
        import traceback
        traceback.print_exc()
        processing_status[video_id] = {
            "status": "error",
            "progress": 0,
            "stage": "failed",
            "error": str(e)
        }
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # Cleanup temp file
        if temp_video_path and os.path.exists(temp_video_path):
            os.unlink(temp_video_path)
            print(f"[Detection Upload] Cleaned up temp file")

async def process_detection(video_id: str, video_url: str, callback_url: Optional[str]):
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

        # Download video from a remote URL. The local frontend uses /detect/upload instead.
        print(f"[Detection] Downloading video from: {video_url}")
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.get(video_url)
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

        # Keep frame counts from results for status reporting
        total_frames = results_data.get("video_properties", {}).get("total_frames", 0)
        processed_frames = results_data.get("summary", {}).get("total_frames_processed", 0)

        processing_status[video_id] = {
            "status": "processing",
            "progress": 95,
            "stage": "finalizing",
            "current_frame": total_frames,
            "total_frames": total_frames,
            "processed_frames": processed_frames
        }

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

def run_inference(video_path: str, video_id: str):
    """Run YOLO inference on sampled video frames."""

    # Analyze one frame every 24 frames. The model input resolution is 960 px.
    frame_skip = 24
    inference_imgsz = 960
    conf_threshold = 0.5
    iou_threshold = 0.45
    tracking_method = "bytetrack.yaml"

    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    # Get video properties
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = total_frames / fps if fps > 0 else 0
    estimated_frames_to_process = max(1, (total_frames + frame_skip - 1) // frame_skip)

    print(f"[Inference] Video: {width}x{height}, {fps} FPS, {total_frames} frames, duration: {duration:.1f}s")
    print(f"[Inference] Frame skip: {frame_skip} (will process ~{estimated_frames_to_process} frames)")
    print(f"[Inference] Input size: {inference_imgsz}, tracking: Ultralytics ByteTrack")

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
        "inference_imgsz": inference_imgsz,
        "tracking": {
            "enabled": True,
            "method": "Ultralytics ByteTrack",
            "track_id_field": "track_id"
        },
        "classes": {},
        "detections": []
    }

    frame_idx = 0
    processed_frames = 0
    tracking_available = True
    tracking_used = False
    track_ids_found = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % frame_skip == 0:
                timestamp = frame_idx / fps if fps > 0 else 0

                # Run tracked inference when available. If tracking is unavailable
                # in the local Ultralytics install, fall back to plain detection.
                if tracking_available:
                    try:
                        results = model.track(
                            frame,
                            conf=conf_threshold,
                            iou=iou_threshold,
                            imgsz=inference_imgsz,
                            persist=processed_frames > 0,
                            tracker=tracking_method,
                            verbose=False
                        )
                        tracking_used = True
                    except Exception as track_error:
                        tracking_available = False
                        print(f"[Inference] Tracking unavailable, falling back to predict(): {track_error}")
                        results = model.predict(
                            frame,
                            conf=conf_threshold,
                            iou=iou_threshold,
                            imgsz=inference_imgsz,
                            verbose=False
                        )
                else:
                    results = model.predict(
                        frame,
                        conf=conf_threshold,
                        iou=iou_threshold,
                        imgsz=inference_imgsz,
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
                        track_id = None

                        try:
                            box_track_id = getattr(box, "id", None)
                            if box_track_id is not None:
                                if hasattr(box_track_id, "item"):
                                    track_id = int(box_track_id.item())
                                else:
                                    track_id = int(box_track_id[0])
                                track_ids_found += 1
                        except Exception:
                            track_id = None

                        if cls_id not in results_data["classes"]:
                            results_data["classes"][cls_id] = class_name

                        tool_detection = {
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
                        }

                        if track_id is not None:
                            tool_detection["track_id"] = track_id

                        frame_detections["tools"].append(tool_detection)

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
    results_data["tracking"]["enabled"] = tracking_used and tracking_available
    results_data["tracking"]["track_ids_found"] = track_ids_found

    print(f"[Inference] Complete: {results_data['summary']}")

    return results_data

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
