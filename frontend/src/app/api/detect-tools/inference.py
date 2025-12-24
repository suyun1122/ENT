#!/usr/bin/env python3
"""
Surgical Tool Detection Inference Script
Performs YOLO inference on a video and generates JSON metadata with bounding boxes
"""

import sys
import json
import os
from pathlib import Path
import cv2
from ultralytics import YOLO

def inference_video(video_path, model_path, output_json_path, frame_skip=5):
    """
    Run YOLO inference on video and save results as JSON

    Args:
        video_path: Path to input video file
        model_path: Path to YOLO model weights
        output_json_path: Path to save JSON results
        frame_skip: Process every Nth frame (default: 5 for performance)

    Returns:
        dict: Detection results
    """

    # Load YOLO model
    print(f"[INFO] Loading YOLO model from: {model_path}", file=sys.stderr)
    model = YOLO(model_path)

    # Open video
    print(f"[INFO] Opening video: {video_path}", file=sys.stderr)
    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    # Get video properties
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = total_frames / fps if fps > 0 else 0

    print(f"[INFO] Video: {width}x{height}, {fps} FPS, {total_frames} frames, {duration:.2f}s", file=sys.stderr)

    # Prepare results structure
    results_data = {
        "video_path": video_path,
        "model": os.path.basename(model_path),
        "video_properties": {
            "width": width,
            "height": height,
            "fps": fps,
            "total_frames": total_frames,
            "duration": duration
        },
        "frame_skip": frame_skip,
        "classes": {},  # Will be populated with class names
        "detections": []
    }

    frame_idx = 0
    processed_frames = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # Process every Nth frame
            if frame_idx % frame_skip == 0:
                timestamp = frame_idx / fps if fps > 0 else 0

                # Run inference
                results = model.predict(
                    frame,
                    conf=0.5,  # Confidence threshold (50% - balanced detection)
                    iou=0.45,   # IOU threshold for NMS
                    verbose=False
                )

                # Extract detections for this frame
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

                        # Get class name
                        class_name = model.names[cls_id]

                        # Store class info
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

                # Only add frame if there are detections
                if len(frame_detections["tools"]) > 0:
                    results_data["detections"].append(frame_detections)

                processed_frames += 1

                # Progress update every 100 frames
                if processed_frames % 100 == 0:
                    progress = (frame_idx / total_frames) * 100
                    print(f"[PROGRESS] {progress:.1f}% ({frame_idx}/{total_frames} frames)", file=sys.stderr)

            frame_idx += 1

    finally:
        cap.release()

    # Add summary statistics
    results_data["summary"] = {
        "total_frames_processed": processed_frames,
        "frames_with_detections": len(results_data["detections"]),
        "total_tool_detections": sum(len(d["tools"]) for d in results_data["detections"])
    }

    # Save to JSON
    print(f"[INFO] Saving results to: {output_json_path}", file=sys.stderr)
    os.makedirs(os.path.dirname(output_json_path), exist_ok=True)

    with open(output_json_path, 'w') as f:
        json.dump(results_data, f, indent=2)

    print(f"[SUCCESS] Detection complete!", file=sys.stderr)
    print(f"[SUMMARY] Processed {processed_frames} frames, found {results_data['summary']['total_tool_detections']} tools", file=sys.stderr)

    return results_data

def main():
    if len(sys.argv) < 4:
        print("Usage: python inference.py <video_path> <model_path> <output_json_path> [frame_skip]", file=sys.stderr)
        sys.exit(1)

    video_path = sys.argv[1]
    model_path = sys.argv[2]
    output_json_path = sys.argv[3]
    frame_skip = int(sys.argv[4]) if len(sys.argv) > 4 else 5

    try:
        results = inference_video(video_path, model_path, output_json_path, frame_skip)

        # Print JSON to stdout for API consumption
        print(json.dumps({"success": True, "output_path": output_json_path}))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

