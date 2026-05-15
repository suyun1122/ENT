# Building a Local Surgical Instrument Detection Demo

This project is a local surgical instrument detection demo built with a YOLO object detection model and a Next.js interface.

The current model weight comes from Hugging Face:

```text
https://huggingface.co/joonhaim/surgical-tool-recognition-yolo26s
```

The model is an Ultralytics object detection model trained for five surgical instrument classes:

- clamp
- needle_holder
- scalpel
- shear
- tweezer

## Problem

Surgical and training videos can be long. Reviewing them manually to find when instruments appear, how often they appear, and how they move is slow. This demo turns a video into structured detection data that can be viewed and inspected quickly.

## Pipeline

1. A user uploads a local video in the web app.
2. The frontend saves the video locally.
3. The frontend sends the video to the FastAPI backend.
4. The backend loads `backend/best.pt` and runs YOLO inference.
5. Detection results are saved as JSON.
6. The frontend displays:
   - video playback
   - bounding-box overlay
   - tool filter panel
   - continuous usage timeline
   - usage statistics
   - instrument motion analysis

## Detection Data

Each detection record contains:

- frame index
- timestamp
- class ID
- class name
- confidence
- bounding box coordinates

The frontend uses this data directly. It does not change the original YOLO output.

## Motion Analysis

The motion analysis panel computes simple movement features from YOLO bounding-box centers:

- center position
- path length
- mean speed
- max speed
- working area
- track count

These values are pixel-based and should be interpreted as demo-level motion features, not calibrated real-world physical measurements.

## Limitations

This is a demo, not a medical diagnosis system. The YOLO model may produce false positives or miss instruments. Results should be reviewed manually before any real use.
