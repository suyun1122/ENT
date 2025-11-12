"""
Inference script for surgical tool detection model.
Can be used independently in other projects.
"""

import argparse
from pathlib import Path
from ultralytics import YOLO
import cv2

def main():
    parser = argparse.ArgumentParser(description='Run inference on surgical tool detection model')
    parser.add_argument('--model', type=str, required=True,
                        help='Path to trained model weights (.pt file)')
    parser.add_argument('--source', type=str, required=True,
                        help='Path to image, video, or directory, or RTSP stream URL')
    parser.add_argument('--conf', type=float, default=0.25,
                        help='Confidence threshold (default: 0.25)')
    parser.add_argument('--iou', type=float, default=0.45,
                        help='IOU threshold for NMS (default: 0.45)')
    parser.add_argument('--imgsz', type=int, default=1280,
                        help='Image size for inference (default: 1280)')
    parser.add_argument('--save', action='store_true',
                        help='Save annotated results')
    parser.add_argument('--show', action='store_true',
                        help='Show results in window')

    args = parser.parse_args()

    # Load model
    print(f"Loading model from: {args.model}")
    model = YOLO(args.model)

    # Run inference
    print(f"Running inference on: {args.source}")
    results = model.predict(
        source=args.source,
        conf=args.conf,
        iou=args.iou,
        imgsz=args.imgsz,
        save=args.save,
        show=args.show
    )

    # Print results summary
    print("\n=== Inference Results ===")
    for i, result in enumerate(results):
        if hasattr(result, 'boxes') and result.boxes is not None:
            num_detections = len(result.boxes)
            print(f"Frame/Image {i+1}: {num_detections} detections")

            # Print class names and confidences
            if num_detections > 0:
                for box in result.boxes:
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    cls_name = model.names[cls_id]
                    print(f"  - {cls_name}: {conf:.2f}")

    print("\nInference complete!")

if __name__ == '__main__':
    main()

