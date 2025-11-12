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

    # Load pre-trained model (from previous training run or base model)
    # Option 1: Use a previously trained model
    # pretrained_model_path = str(cv_model_dir / 'surgical_tool_training_runs' / 'yolo11m_cholec80_run1' / 'weights' / 'best.pt')
    # Option 2: Use base YOLO model
    pretrained_model_path = 'yolo11m.pt'
    model = YOLO(pretrained_model_path)

    # Fine-tune pre-trained model on Cholec80 surgical tools dataset
    dataset_path = dataset_dir / 'data.yaml'

    if not dataset_path.exists():
        raise FileNotFoundError(f"data.yaml not found at {dataset_path}. Please check dataset structure.")

    print(f"Fine-tuning with dataset: {dataset_path}")

    results = model.train(
        data=str(dataset_path),

        device=device,  # Use GPU if available, otherwise CPU
        imgsz=1280,  # High resolution for small surgical instruments
        batch=4,     # Adjust based on your GPU memory (1280px needs more memory)

        # --- Experiment Tracking ---
        project="surgical_tool_training_runs",
        name="yolo11m_cholec80_finetune_imgsz1280_run1",

        # --- Reduced training duration for fine-tuning ---
        epochs=30,   # Fewer epochs for fine-tuning
        patience=10, # Early stopping patience

        # --- Augmentations (optimized for surgical environment) ---
        mosaic=1.0,
        close_mosaic=5,  # Reduced as we have fewer total epochs

        perspective=0.0,
        degrees=10.0,
        scale=0.3,
        translate=0.1,
        shear=0.0,
        hsv_h=0.01,
        hsv_s=0.5,
        hsv_v=0.3,
        fliplr=0.5,
        mixup=0.0,
        copy_paste=0.1
    )

    print(f"\nFine-tuning complete!")
    print(f"Best weights saved at: {results.save_dir}/weights/best.pt")
    print(f"Last weights saved at: {results.save_dir}/weights/last.pt")

if __name__ == '__main__':
    main()

