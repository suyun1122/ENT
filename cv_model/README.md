## CV Model Training Module — Customizable Object Detection

This module provides a flexible, reusable computer vision training pipeline for object detection tasks. Originally designed for PPE (Personal Protective Equipment) detection, it can be easily customized for other domains such as **surgical tool detection** or any other object detection task.

### Quick Start: Surgical Tool Detection

To train a model for detecting surgical tools using the Cholec80 dataset:

1. **Set up environment:**
```bash
pip install -r requirements.txt
```

2. **Configure Roboflow API key:**
Create a `.env` file in the project root:
```
ROBOFLOW_API_KEY=your_api_key_here
```

3. **Run training:**
```bash
cd training_scripts
python train_surgical_tools.py
```

The script will automatically:
- Download the Cholec80 dataset (version 3) from Roboflow
- Train a YOLO11m model optimized for surgical tool detection
- Save trained weights to `surgical_tool_training_runs/`

4. **Resume training (if interrupted):**
If training was stopped and you want to continue from the last checkpoint:
```bash
cd training_scripts
python resume_training.py
```

This will automatically find the latest training run and resume from the last checkpoint.

### Dataset: Cholec80

The Cholec80 dataset is available at: https://universe.roboflow.com/daad-mobility/cholec80/dataset/3

**Download format:** Use `yolov11` format

**Dataset location:** The dataset should be placed in `cv_model/Cholec80.v3-cholec80-10.yolov11/` (or will be auto-downloaded if not found)

**Classes (7 surgical tools):**
- Bipolar
- Clipper
- Grasper
- Hook
- Irrigator
- Scissors
- Specimen Bag

The dataset contains annotated surgical tool images from cholecystectomy procedures, perfect for training medical instrument detection models.

**Dataset structure:**
- `train/`: 6,165 images
- `valid/`: 1,047 images
- `test/`: 1,049 images

---

## PPE Detection CV Model — Training Methodology and Results

This section documents the original PPE compliance detector training methodology.

### Objective
Detect missing PPE on workers (e.g., missing hardhat, vest, gloves) within factory and construction environments. Outputs are overlaid during preprocessing so the worker can chunk, upload to NVIDIA VSS, and index richer, annotated video segments.

### Dataset & Labeling
- Sources: curated industrial clips and internal recording samples
- Labels: PPE presence classes and context (e.g., person, helmet, vest)
- Splits: train/val following scene diversity to minimize leakage

### Model & Training Setup
- Base: Ultralytics YOLO (weights fine‑tuned)
- Resolution: imgsz=1280 for better small object fidelity
- Augmentations: mosaic, HSV, flips; tuned to preserve PPE color cues
- Hyperparameters: confidence/iou thresholds tuned per validation PR curves
- Hardware: single GPU fine‑tune with mixed precision

### Why It Works
- High‑resolution fine‑tuning improves helmet/vest detection at distance
- Domain examples across lighting/motion conditions reduce false negatives
- Post‑processing thresholds chosen via PR/F1 maxima on validation set

### Results
Representative artifacts from `ppe_training_runs/yolo11m_finetune_imgsz1280_run12/`:

![Results](ppe_training_runs/yolo11m_finetune_imgsz1280_run12/results.png)
![Confusion Matrix](ppe_training_runs/yolo11m_finetune_imgsz1280_run12/confusion_matrix.png)
![Normalized Confusion Matrix](ppe_training_runs/yolo11m_finetune_imgsz1280_run12/confusion_matrix_normalized.png)
![PR Curves](ppe_training_runs/yolo11m_finetune_imgsz1280_run12/BoxPR_curve.png)
![F1 Curve](ppe_training_runs/yolo11m_finetune_imgsz1280_run12/BoxF1_curve.png)

Sample batches (training/validation):

![Train Batch](ppe_training_runs/yolo11m_finetune_imgsz1280_run12/train_batch0.jpg)
![Val Pred](ppe_training_runs/yolo11m_finetune_imgsz1280_run12/val_batch0_pred.jpg)

Weights are stored in `ppe_training_runs/.../weights/` and the best export deployed as `rtsp-stream-worker/cv_model_best.pt` for inference.

### Inference Integration
`rtsp-stream-worker` loads the exported YOLO weights, draws detections, and writes an annotated video. The annotated video is then chunked and uploaded to NVIDIA VSS so downstream search and summarization can leverage richer visual cues.


