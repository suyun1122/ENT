#!/usr/bin/env python3
"""
Run tool detection on all videos with best.pt model
"""

import os
import sys
import json
from pathlib import Path

# Add the inference script directory to path
inference_script = "/Users/Miranda/twelveLabs/surgical-tool-detection/frontend/src/app/api/detect-tools/inference.py"

# Import the inference function
sys.path.insert(0, os.path.dirname(inference_script))
from inference import inference_video

# Paths
videos_dir = "/Users/Miranda/twelveLabs/surgical-tool-detection/frontend/public/videos"
detections_dir = "/Users/Miranda/twelveLabs/surgical-tool-detection/frontend/public/detections"
model_path = "/Users/Miranda/twelveLabs/surgical-tool-detection/cv_model/training_scripts/best.pt"

# Video ID mapping (based on existing detection files)
# For now, we'll map the 3 videos to the first 3 video IDs
# and use the same mappings for similar videos
video_mappings = {
    "6911d695773d9e332952bf6d": "Gallbladder removal surgery.mp4",
    "6911d69646cd130f2b0de4e6": "Cholecystectomy ｜ Gallbladder Removal Surgery ｜ Nucleus Health.mp4",
    "6911d69bf141b311b3b9fbbb": "A Beginner's Guide To Suturing： 10 years in 20Minutes!.mp4",
    "69129bb45126c58641e4d164": "Gallbladder removal surgery.mp4",  # Duplicate mapping
    "6940bcd7fa043d83a4915323": "Cholecystectomy ｜ Gallbladder Removal Surgery ｜ Nucleus Health.mp4",  # Duplicate mapping
    "695231aa9f7b96b9f6cfc2ce": "A Beginner's Guide To Suturing： 10 years in 20Minutes!.mp4"  # Duplicate mapping
}

def main():
    print("=" * 80)
    print("Running Tool Detection with best.pt Model")
    print("=" * 80)
    print()

    # Check if model exists
    if not os.path.exists(model_path):
        print(f"ERROR: Model not found at {model_path}")
        sys.exit(1)

    print(f"Model: {model_path}")
    print(f"Videos directory: {videos_dir}")
    print(f"Output directory: {detections_dir}")
    print()

    # Process each video ID
    processed = 0
    failed = 0

    for video_id, video_filename in video_mappings.items():
        video_path = os.path.join(videos_dir, video_filename)
        output_path = os.path.join(detections_dir, f"{video_id}.json")

        print("-" * 80)
        print(f"Processing: {video_id}")
        print(f"  Video: {video_filename}")

        if not os.path.exists(video_path):
            print(f"  ERROR: Video file not found at {video_path}")
            failed += 1
            continue

        try:
            print(f"  Running inference...")
            results = inference_video(
                video_path=video_path,
                model_path=model_path,
                output_json_path=output_path,
                frame_skip=5
            )

            print(f"  ✓ Success!")
            print(f"  Output: {output_path}")
            print(f"  Summary:")
            print(f"    - Frames processed: {results['summary']['total_frames_processed']}")
            print(f"    - Frames with detections: {results['summary']['frames_with_detections']}")
            print(f"    - Total tool detections: {results['summary']['total_tool_detections']}")
            processed += 1

        except Exception as e:
            print(f"  ✗ ERROR: {e}")
            failed += 1

        print()

    print("=" * 80)
    print("Detection Complete")
    print(f"  Processed: {processed}")
    print(f"  Failed: {failed}")
    print("=" * 80)

if __name__ == "__main__":
    main()
