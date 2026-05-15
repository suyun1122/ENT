# CV Model Notes

This project currently uses an external pretrained YOLO weight from Hugging Face instead of training a new model inside this repository.

## Current Model

```text
https://huggingface.co/joonhaim/surgical-tool-recognition-yolo26s
```

Model details from the model card:

- Model ID: `joonhaim/surgical-tool-recognition-yolo26s`
- Task: Object Detection
- Library: Ultralytics
- License: MIT
- Dataset: `joonhaim/surgical-tool-recognition-full-multiview`

The active deployed weight is copied into:

```text
backend/best.pt
```

The loaded model classes are:

```text
0: clamp
1: needle_holder
2: scalpel
3: shear
4: tweezer
```

## Video Inference Sampling

The current backend samples videos every 24 frames and uses a 960 px inference size:

```text
frame_skip = 24
imgsz = 960
```

At 30 FPS, this means approximately 1.25 YOLO inferences per second. The backend attempts Ultralytics ByteTrack tracking and records `track_id` in detection results when tracking is available. These settings live in `backend/main.py`.

## Local Model Check

From the repository root:

```bash
python - << "PY"
from ultralytics import YOLO

model = YOLO("backend/best.pt")
print(model.task)
print(model.names)
PY
```

Expected output:

```text
detect
{0: 'clamp', 1: 'needle_holder', 2: 'scalpel', 3: 'shear', 4: 'tweezer'}
```

## Optional Training Scripts

The `training_scripts/` folder is kept for future experiments, but the current demo does not depend on those scripts. If a new model is trained later, replace `backend/best.pt`, update the class names in the root README, and restart the backend service.
