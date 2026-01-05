#!/usr/bin/env python3
"""
Fix detection mappings for incorrectly mapped videos
"""

import os
import sys

# Add the inference script directory to path
sys.path.insert(0, "/Users/Miranda/twelveLabs/surgical-tool-detection/frontend/src/app/api/detect-tools")
from inference import inference_video

# Paths
videos_dir = "/Users/Miranda/twelveLabs/surgical-tool-detection/frontend/public/videos"
detections_dir = "/Users/Miranda/twelveLabs/surgical-tool-detection/frontend/public/detections"
model_path = "/Users/Miranda/twelveLabs/surgical-tool-detection/cv_model/training_scripts/best.pt"

# Correct mapping from TwelveLabs API
correct_mapping = {
    "695231aa9f7b96b9f6cfc2ce": "Cholecystectomy ｜ Gallbladder Removal Surgery ｜ Nucleus Health.mp4",
    "6940bcd7fa043d83a4915323": "Gallbladder removal surgery.mp4"
}

def main():
    print("=" * 80)
    print("Fixing Detection Mappings with best.pt Model")
    print("=" * 80)
    print()

    for video_id, video_filename in correct_mapping.items():
        video_path = os.path.join(videos_dir, video_filename)
        output_path = os.path.join(detections_dir, f"{video_id}.json")

        print("-" * 80)
        print(f"Processing: {video_id}")
        print(f"  Video: {video_filename}")

        if not os.path.exists(video_path):
            print(f"  ERROR: Video file not found at {video_path}")
            continue

        try:
            print(f"  Running inference with best.pt...")
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

        except Exception as e:
            print(f"  ✗ ERROR: {e}")

        print()

    print("=" * 80)
    print("Detection Fix Complete")
    print("=" * 80)

if __name__ == "__main__":
    main()
