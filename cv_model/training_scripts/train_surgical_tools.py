import os
import torch

from pathlib import Path
from dotenv import load_dotenv
from ultralytics import YOLO
from roboflow import Roboflow

def main():

    load_dotenv()

    # Check if GPU is available
    is_available = torch.cuda.is_available()
    device = 0 if is_available else 'cpu'
    print(f"GPU Available: {is_available}")
    print(f"Using device: {device}")

    # Use already downloaded Cholec80 dataset
    # Dataset should be in: cv_model/Cholec80.v3-cholec80-10.yolov11/
    script_dir = Path(__file__).parent
    cv_model_dir = script_dir.parent
    dataset_dir = cv_model_dir / "Cholec80.v3-cholec80-10.yolov11"

    # If dataset not found, try to download it
    if not dataset_dir.exists():
        print(f"Dataset not found at {dataset_dir}")
        print("Attempting to download from Roboflow...")

        DOWNLOAD_PATH = cv_model_dir / "datasets" / "cholec80"
        DOWNLOAD_PATH.mkdir(parents=True, exist_ok=True)

        rf_client = Roboflow(api_key=os.getenv('ROBOFLOW_API_KEY'))
        project = rf_client.workspace("daad-mobility").project("cholec80")
        version = project.version(3)
        dataset = version.download("yolov11", location=str(DOWNLOAD_PATH))
        dataset_dir = Path(dataset.location) if hasattr(dataset, 'location') else DOWNLOAD_PATH
        print(f"Dataset downloaded to: {dataset_dir}")

    # Load pre-trained YOLO model
    # Using yolo11m (medium) for good balance between speed and accuracy
    model = YOLO("yolo11m.pt")

    # Train pre-trained model on Cholec80 surgical tools dataset
    dataset_path = dataset_dir / 'data.yaml'

    if not dataset_path.exists():
        raise FileNotFoundError(f"data.yaml not found at {dataset_path}. Please check dataset structure.")

    print(f"Training with dataset: {dataset_path}")

    results = model.train(
        data=str(dataset_path),

        epochs=100,
        patience=20,
        batch=-1,  # Auto batch size
        imgsz=1280,  # High resolution for small surgical instruments
        device=device,  # Use GPU if available, otherwise CPU

        # --- AUGMENTATIONS FOR SURGICAL ENVIRONMENT ---

        # 1. Minimal geometric transformations (surgical cameras are usually fixed)
        perspective=0.0,  # No perspective distortion (surgical cameras are stable)
        degrees=10.0,     # Small rotation range (instruments have specific orientations)
        scale=0.3,        # Moderate scaling for size variation
        translate=0.1,    # Small translation
        shear=0.0,        # No shearing (surgical environment is stable)

        # 2. Color augmentations (important for metal/blood variations in surgery)
        hsv_h=0.01,       # Minimal hue shift (surgical tools have distinct colors)
        hsv_s=0.5,        # Moderate saturation variation
        hsv_v=0.3,        # Brightness variation (important for different lighting)
        fliplr=0.5,       # Horizontal flipping (surgical tools can appear from both sides)

        # 3. Object augmentations for small instrument detection
        mosaic=1.0,        # CRITICAL: Combines images to teach scale and partial objects
        close_mosaic=10,  # Keep for initial epochs to stabilize training
        mixup=0.0,        # Avoid mixup (surgical context is very specific)
        copy_paste=0.1,   # Small copy-paste for instrument density variation

        # Project tracking
        project="surgical_tool_training_runs",
        name="yolo11m_cholec80_run1"
    )

    print(f"\nTraining complete!")
    print(f"Best weights saved at: {results.save_dir}/weights/best.pt")
    print(f"Last weights saved at: {results.save_dir}/weights/last.pt")

if __name__ == '__main__':
    main()

