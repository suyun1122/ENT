# Google Colab에서 Resume Training - Step by Step

## 목표

기존에 학습한 `best.pt` 모델에서 50 epochs 추가 학습하여 정확도 향상

---

## Step 1: Google Colab 설정

### 1.1 Colab 노트북 생성

1. https://colab.research.google.com 접속
2. "새 노트북" 클릭

### 1.2 GPU 활성화

1. 상단 메뉴: `런타임` → `런타임 유형 변경`
2. 하드웨어 가속기: **T4 GPU** 선택
3. 저장

---

## Step 2: Colab 노트북 코드 실행

### 셀 1: 환경 설정

**⚠️ 주의:** 아래 코드만 복사하세요 (```python 부분은 복사하지 마세요!)

```python
# Install required packages
!pip install ultralytics roboflow python-dotenv

# Check GPU
import torch
print(f"CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"GPU: {torch.cuda.get_device_name(0)}")
```

**복사 팁:** 코드 블록 우측 상단의 복사 버튼을 사용하거나, # Install 부터 get_device_name 줄까지만 선택해서 복사하세요.

---

### 셀 2: Google Drive 마운트

```python
from google.colab import drive
drive.mount('/content/drive')
```

**실행 후:** Google 계정 선택 → "Google Drive 파일 액세스 허용" 클릭

---

### 셀 3: 작업 디렉토리 생성

```python
from pathlib import Path
import shutil

# Create working directory
work_dir = Path('/content/surgical_tool_training')
work_dir.mkdir(exist_ok=True)

# Create datasets directory
datasets_dir = work_dir / 'datasets'
datasets_dir.mkdir(exist_ok=True)

print(f"Working directory: {work_dir}")
```

---

### 셀 4: 데이터셋 준비 (Google Drive에서 복사)

**⚠️ 사전 준비:** `best.pt` 파일과 데이터셋을 Google Drive에 업로드해두세요

- `best.pt` → Google Drive의 `surgical_tool_training/best.pt`
- 데이터셋 → Google Drive의 `surgical_tool_training/Cholec80.v3-cholec80-10.yolov11.zip`

```python
import shutil
from pathlib import Path

# Copy best.pt from Google Drive
drive_model_path = Path('/content/drive/MyDrive/surgical_tool_training/best.pt')
local_model_path = work_dir / 'best.pt'

if drive_model_path.exists():
    shutil.copy(drive_model_path, local_model_path)
    print(f"✅ Copied best.pt to {local_model_path}")
else:
    print(f"❌ best.pt not found in Google Drive")
    print(f"   Please upload best.pt to: {drive_model_path}")

# Copy dataset from Google Drive
drive_dataset_zip = Path('/content/drive/MyDrive/surgical_tool_training/Cholec80.v3-cholec80-10.yolov11.zip')
local_dataset_zip = work_dir / 'dataset.zip'

if drive_dataset_zip.exists():
    print("Copying dataset from Google Drive...")
    shutil.copy(drive_dataset_zip, local_dataset_zip)

    # Extract dataset
    print("Extracting dataset...")
    !cd {work_dir} && unzip -q dataset.zip -d datasets/
    print(f"✅ Dataset extracted to {datasets_dir}")
else:
    print(f"❌ Dataset not found in Google Drive")
    print(f"   Please upload dataset to: {drive_dataset_zip}")
```

**대안: Roboflow에서 직접 다운로드**

```python
# If you prefer to download from Roboflow instead:
from roboflow import Roboflow

rf = Roboflow(api_key="YOUR_ROBOFLOW_API_KEY")
project = rf.workspace("YOUR_WORKSPACE").project("YOUR_PROJECT")
dataset = project.version(3).download("yolov11", location=str(datasets_dir))
```

---

### 셀 5: data.yaml 경로 수정

```python
import re
from pathlib import Path

dataset_dir = work_dir / 'datasets' / 'Cholec80.v3-cholec80-10.yolov11'
data_yaml_path = dataset_dir / 'data.yaml'

# Read data.yaml
with open(data_yaml_path, 'r') as f:
    content = f.read()

# Update paths to absolute paths
train_path = str(dataset_dir / 'train' / 'images')
val_path = str(dataset_dir / 'valid' / 'images')
test_path = str(dataset_dir / 'test' / 'images')

content = re.sub(r'train:\s*\.\./train/images', f'train: {train_path}', content)
content = re.sub(r'val:\s*\.\./valid/images', f'val: {val_path}', content)
content = re.sub(r'test:\s*\.\./test/images', f'test: {test_path}', content)

# Write updated data.yaml
with open(data_yaml_path, 'w') as f:
    f.write(content)

print(f"✅ Updated data.yaml with absolute paths")
print(f"Train: {train_path}")
print(f"Val: {val_path}")
print(f"Test: {test_path}")
```

---

### 셀 6: Resume Training 스크립트 생성

```python
# Create resume training script
resume_script = '''
from ultralytics import YOLO
from pathlib import Path
import torch

def main():
    print("=== Resume Training Configuration ===")

    # Check device
    if torch.cuda.is_available():
        device = 0
        print(f"Using GPU: {torch.cuda.get_device_name(0)}")
    else:
        device = 'cpu'
        print("Using CPU")

    # Paths
    work_dir = Path('/content/surgical_tool_training')
    model_path = work_dir / 'best.pt'
    data_yaml = work_dir / 'datasets' / 'Cholec80.v3-cholec80-10.yolov11' / 'data.yaml'

    print(f"Model: {model_path}")
    print(f"Data: {data_yaml}")

    # Load model
    print("\\nLoading model...")
    model = YOLO(str(model_path))

    # Resume training
    print("\\nStarting resume training...")
    print("Epochs: 50")
    print("Batch: 8")
    print("Image size: 640")
    print("Device:", device)

    results = model.train(
        data=str(data_yaml),
        epochs=50,          # Additional 50 epochs
        batch=8,            # Batch size (adjust if OOM)
        imgsz=640,          # Image size
        device=device,
        patience=10,        # Early stopping patience
        save=True,
        plots=True,
        project='/content/training_runs',
        name='yolo11m_cholec80_resume',
        exist_ok=True,
        resume=False,       # Don't resume from checkpoint, start fresh with best.pt weights
        pretrained=False,   # Don't use pretrained weights (we're using best.pt)
    )

    print("\\n=== Training Complete! ===")
    print(f"Results saved to: /content/training_runs/yolo11m_cholec80_resume")

    # Validate
    print("\\nRunning final validation...")
    metrics = model.val()

    print(f"\\nmAP50: {metrics.box.map50:.3f}")
    print(f"Precision: {metrics.box.mp:.3f}")
    print(f"Recall: {metrics.box.mr:.3f}")

    # Save to Google Drive
    print("\\nSaving results to Google Drive...")
    import shutil
    drive_save_path = Path('/content/drive/MyDrive/surgical_tool_training/resume_training_results')
    drive_save_path.mkdir(exist_ok=True, parents=True)

    # Copy weights
    src_weights = Path('/content/training_runs/yolo11m_cholec80_resume/weights')
    if src_weights.exists():
        shutil.copy(src_weights / 'best.pt', drive_save_path / 'best_resumed.pt')
        shutil.copy(src_weights / 'last.pt', drive_save_path / 'last_resumed.pt')
        print(f"✅ Weights saved to Google Drive: {drive_save_path}")

    # Copy results
    results_png = Path('/content/training_runs/yolo11m_cholec80_resume/results.png')
    if results_png.exists():
        shutil.copy(results_png, drive_save_path / 'results.png')
        print(f"✅ Results plot saved to Google Drive")

if __name__ == '__main__':
    main()
'''

# Write script to file
script_path = work_dir / 'resume_training_colab.py'
with open(script_path, 'w') as f:
    f.write(resume_script)

print(f"✅ Resume training script created: {script_path}")
```

---

### 셀 7: 트레이닝 실행

```python
# Run resume training
%cd /content/surgical_tool_training
!python resume_training_colab.py
```

**예상 시간:** 약 3-4시간 (T4 GPU 기준, 50 epochs)

---

## Step 3: 결과 확인

### 셀 8: 결과 보기

```python
from IPython.display import Image, display
import matplotlib.pyplot as plt

# Display results plot
results_img = '/content/training_runs/yolo11m_cholec80_resume/results.png'
display(Image(filename=results_img))

# Display confusion matrix
confusion_matrix = '/content/training_runs/yolo11m_cholec80_resume/confusion_matrix.png'
if Path(confusion_matrix).exists():
    display(Image(filename=confusion_matrix))
```

---

## Step 4: 결과 다운로드

### 셀 9: Google Drive에 저장 확인

```python
from pathlib import Path

drive_path = Path('/content/drive/MyDrive/surgical_tool_training/resume_training_results')

if drive_path.exists():
    files = list(drive_path.iterdir())
    print("Files saved to Google Drive:")
    for f in files:
        print(f"  - {f.name}")
else:
    print("❌ Results not saved to Google Drive")
```

**다운로드할 파일:**

- `best_resumed.pt` - 최고 성능 모델 (이걸 사용하세요!)
- `last_resumed.pt` - 마지막 epoch 모델
- `results.png` - 학습 곡선

---

## 트러블슈팅

### 1. Out of Memory 에러

Batch size를 줄이세요:

```python
# In resume_training_colab.py, change:
batch=4,  # 8 → 4로 줄이기
```

### 2. 데이터셋을 찾을 수 없음

data.yaml 경로를 다시 확인하세요:

```python
!cat /content/surgical_tool_training/datasets/Cholec80.v3-cholec80-10.yolov11/data.yaml
```

### 3. Google Drive 연결 끊김

런타임을 다시 실행하고 셀 2부터 다시 실행하세요.

---

## 학습 완료 후

1. **Local에서 테스트:**

   - Google Drive에서 `best_resumed.pt` 다운로드
   - `cv_model/training_scripts/best.pt`를 `best_resumed.pt`로 교체
   - Inference 스크립트로 테스트

2. **성능 비교:**
   - 이전 모델 vs 새 모델 성능 비교
   - mAP50, Precision, Recall 지표 확인

---

## 다음 단계

성능이 만족스럽지 않다면:

1. **더 많은 epochs** (50 → 100)
2. **Hyperparameter 조정** (learning rate, augmentation)
3. **데이터 증강 강화** (mosaic, mixup)

궁금한 점이 있으면 언제든지 물어보세요!
