"""
Resume training from the last checkpoint.
Run this script to continue training from where it was stopped.
"""

import os
import torch

from pathlib import Path
from dotenv import load_dotenv
from ultralytics import YOLO

def main():
    load_dotenv()

    # Check if GPU is available
    is_available = torch.cuda.is_available()
    device = 0 if is_available else 'cpu'
    print(f"GPU Available: {is_available}")
    print(f"Using device: {device}")

    # Find the latest training run
    script_dir = Path(__file__).parent
    cv_model_dir = script_dir.parent
    training_runs_dir = script_dir / "surgical_tool_training_runs"

    # Find the most recent run directory
    run_dirs = sorted(training_runs_dir.glob("yolo11m_cholec80_run*"), reverse=True)

    if not run_dirs:
        print("No previous training runs found. Starting new training...")
        print("Please run train_surgical_tools.py instead.")
        return

    latest_run = run_dirs[0]
    weights_dir = latest_run / "weights"

    # Check for last.pt (checkpoint) or best.pt
    checkpoint_path = weights_dir / "last.pt"
    best_path = weights_dir / "best.pt"

    if checkpoint_path.exists():
        model_path = checkpoint_path
        print(f"Resuming from checkpoint: {model_path}")
    elif best_path.exists():
        model_path = best_path
        print(f"Resuming from best weights: {model_path}")
    else:
        print(f"No checkpoint found in {latest_run}")
        print("Starting new training...")
        # Use base model
        model_path = "yolo11m.pt"

    # Load model
    model = YOLO(str(model_path))

    # Dataset path
    dataset_dir = cv_model_dir / "Cholec80.v3-cholec80-10.yolov11"
    dataset_path = dataset_dir / 'data.yaml'

    if not dataset_path.exists():
        raise FileNotFoundError(f"data.yaml not found at {dataset_path}")

    print(f"Training with dataset: {dataset_path}")
    print(f"Resuming training in: {latest_run}")

    # Resume training
    results = model.train(
        data=str(dataset_path),
        resume=True,  # CRITICAL: This resumes from the last checkpoint

        epochs=100,
        patience=20,
        batch=-1,
        imgsz=1280,
        device=device,

        # Augmentations (same as original)
        perspective=0.0,
        degrees=10.0,
        scale=0.3,
        translate=0.1,
        shear=0.0,
        hsv_h=0.01,
        hsv_s=0.5,
        hsv_v=0.3,
        fliplr=0.5,
        mosaic=1.0,
        close_mosaic=10,
        mixup=0.0,
        copy_paste=0.1,

        # Project tracking (will continue in same directory)
        project="surgical_tool_training_runs",
        name=latest_run.name  # Continue in the same run directory
    )

    print(f"\nTraining complete!")
    print(f"Best weights saved at: {results.save_dir}/weights/best.pt")
    print(f"Last weights saved at: {results.save_dir}/weights/last.pt")

if __name__ == '__main__':
    main()

