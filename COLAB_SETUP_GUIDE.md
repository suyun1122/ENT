# Google Colab으로 트레이닝 옮기기 - Step by Step 가이드

## Step 1: 필요한 파일 준비

### 1.1 체크포인트 파일 확인

현재 학습된 모델 파일:

- `cv_model/training_scripts/surgical_tool_training_runs/yolo11m_cholec80_run16/weights/last.pt`
- `cv_model/training_scripts/surgical_tool_training_runs/yolo11m_cholec80_run16/weights/best.pt`

### 1.2 학습 스크립트

- `cv_model/training_scripts/train_surgical_tools.py`
- `cv_model/training_scripts/resume_training.py`

### 1.3 데이터셋

- 이미 Roboflow에서 다운로드 가능하므로 Colab에서 직접 다운로드 가능

---

## Step 2: Google Colab 설정

### 2.1 Google Colab 접속

1. https://colab.research.google.com 접속
2. Google 계정으로 로그인
3. "새 노트북" 클릭

### 2.2 GPU 활성화

1. 상단 메뉴: `런타임` → `런타임 유형 변경`
2. 하드웨어 가속기: **GPU** 선택
3. GPU 유형: **T4** (무료) 또는 **V100/A100** (Pro)
4. 저장

---

## Step 3: Colab 노트북에 코드 작성

### 3.1 첫 번째 셀: 환경 설정 및 라이브러리 설치

```python
# Install required packages
!pip install ultralytics roboflow python-dotenv

# Check GPU
import torch
print(f"CUDA available: {torch.cuda.is_available()}")
print(f"GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'None'}")
```

### 3.2 두 번째 셀: Google Drive 마운트 (체크포인트 저장용)

```python
from google.colab import drive
drive.mount('/content/drive')
```

- 팝업에서 Google 계정 선택 및 권한 허용

### 3.3 세 번째 셀: 작업 디렉토리 생성

```python
import os
from pathlib import Path

# 작업 디렉토리 생성
work_dir = Path("/content/surgical_tool_training")
work_dir.mkdir(exist_ok=True)
os.chdir(work_dir)
print(f"Working directory: {work_dir}")
```

### 3.4 네 번째 셀: 데이터셋 준비

**방법 A: 데이터셋 직접 업로드 (추천 - 빠름)**

```python
from google.colab import files
import zipfile
import shutil
from pathlib import Path
import os

# 데이터셋 디렉토리 생성
dataset_dir = work_dir / "datasets"
dataset_dir.mkdir(exist_ok=True)

print("데이터셋 ZIP 파일을 업로드하세요...")
print("(로컬에서 Cholec80.v3-cholec80-10.yolov11 폴더를 ZIP으로 압축)")
uploaded = files.upload()

# 업로드된 ZIP 파일 압축 해제
# files.upload()는 현재 작업 디렉토리에 파일을 저장함
for filename in uploaded.keys():
    if filename.endswith('.zip'):
        # 업로드된 파일은 현재 작업 디렉토리에 저장됨
        # 현재 디렉토리 확인
        current_dir = Path(os.getcwd())
        uploaded_zip_path = current_dir / filename

        # 파일이 없으면 다른 위치 확인
        if not uploaded_zip_path.exists():
            # dataset_dir에서 확인
            uploaded_zip_path = dataset_dir / filename
            if not uploaded_zip_path.exists():
                # 현재 디렉토리의 파일명만으로 확인
                uploaded_zip_path = Path(filename)

        print(f"Looking for ZIP file: {uploaded_zip_path}")
        print(f"File exists: {uploaded_zip_path.exists()}")

        # 압축 해제
        if uploaded_zip_path.exists():
            with zipfile.ZipFile(uploaded_zip_path, 'r') as zip_ref:
                zip_ref.extractall(dataset_dir)
            print(f"Dataset extracted to: {dataset_dir}")

            # ZIP 파일 삭제 (선택사항)
            uploaded_zip_path.unlink()

            # 압축 해제된 폴더 확인
            extracted_folders = [d for d in dataset_dir.iterdir() if d.is_dir()]
            if extracted_folders:
                dataset_folder = extracted_folders[0]
                print(f"Dataset folder: {dataset_folder}")
                print(f"data.yaml exists: {(dataset_folder / 'data.yaml').exists()}")
        else:
            print(f"Error: ZIP file not found. Please check the file location.")
            print(f"Current directory: {os.getcwd()}")
            print(f"Files in current directory: {list(Path('.').glob('*.zip'))}")
```

**방법 B: Google Drive에서 복사**

```python
# Google Drive에 데이터셋 폴더를 업로드한 경우
import shutil

# Google Drive 경로 (본인의 경로로 수정)
drive_dataset_path = "/content/drive/MyDrive/Cholec80.v3-cholec80-10.yolov11"

# 데이터셋 디렉토리 생성
dataset_dir = work_dir / "datasets"
dataset_dir.mkdir(exist_ok=True)

if os.path.exists(drive_dataset_path):
    target_path = dataset_dir / "Cholec80.v3-cholec80-10.yolov11"

    # 기존 디렉토리가 있으면 삭제
    if target_path.exists():
        print(f"Removing existing directory: {target_path}")
        shutil.rmtree(target_path)

    # Google Drive에서 복사
    shutil.copytree(drive_dataset_path, target_path)
    print("Dataset copied from Google Drive!")
    print(f"Dataset location: {target_path}")
else:
    print("Dataset not found in Google Drive. Please upload it first.")
    print(f"Expected path: {drive_dataset_path}")
```

**방법 C: Roboflow에서 다운로드 (API 키 필요)**

```python
from roboflow import Roboflow
import os

# Roboflow API 키 설정
rf_api_key = os.getenv('ROBOFLOW_API_KEY', 'YOUR_API_KEY_HERE')

# 데이터셋 다운로드
rf = Roboflow(api_key=rf_api_key)
project = rf.workspace("daad-mobility").project("cholec80")
version = project.version(3)
dataset = version.download("yolov11", location=str(work_dir / "datasets"))

print(f"Dataset downloaded to: {dataset.location}")
```

### 3.5 데이터셋 경로 수정 (중요!)

데이터셋을 업로드/복사한 후, `data.yaml` 파일의 경로를 수정해야 합니다:

```python
import yaml
from pathlib import Path

# 데이터셋 폴더 찾기
datasets_base = Path("/content/surgical_tool_training/datasets")
dataset_dir = None

for item in datasets_base.iterdir():
    if item.is_dir() and (item / 'data.yaml').exists():
        dataset_dir = item
        break

if dataset_dir is None:
    raise FileNotFoundError("Dataset folder not found!")

data_yaml_path = dataset_dir / 'data.yaml'

# data.yaml 읽기
with open(data_yaml_path, 'r') as f:
    data = yaml.safe_load(f)

# 경로를 절대 경로로 수정
data['train'] = str(dataset_dir / 'train' / 'images')
data['val'] = str(dataset_dir / 'valid' / 'images')
data['test'] = str(dataset_dir / 'test' / 'images')

# 수정된 내용 저장
with open(data_yaml_path, 'w') as f:
    yaml.dump(data, f, default_flow_style=False)

print(f"Updated data.yaml at: {data_yaml_path}")
print(f"Train path: {data['train']}")
print(f"Val path: {data['val']}")
print(f"Test path: {data['test']}")
```

**간단하고 확실한 방법 (추천):**

```python
from pathlib import Path
import re
import os

# 작업 디렉토리 확인 및 생성
work_dir = Path("/content/surgical_tool_training")
work_dir.mkdir(exist_ok=True)

# 데이터셋 디렉토리 확인 및 생성
datasets_base = work_dir / "datasets"
datasets_base.mkdir(exist_ok=True, parents=True)

print(f"Work directory: {work_dir}")
print(f"Datasets base: {datasets_base}")
print(f"Datasets base exists: {datasets_base.exists()}")

# 데이터셋 폴더 찾기
dataset_dir = None

if datasets_base.exists():
    items = list(datasets_base.iterdir())
    print(f"Items in datasets directory: {items}")

    for item in items:
        if item.is_dir() and (item / 'data.yaml').exists():
            dataset_dir = item
            break
else:
    print(f"ERROR: {datasets_base} does not exist!")

if dataset_dir:
    data_yaml_path = dataset_dir / 'data.yaml'

    print(f"Found dataset at: {dataset_dir}")
    print(f"data.yaml path: {data_yaml_path}")

    # 현재 파일 내용 확인
    print("\n=== Current data.yaml content ===")
    with open(data_yaml_path, 'r') as f:
        original_content = f.read()
    print(original_content)

    # 절대 경로로 변환
    train_path = str(dataset_dir / 'train' / 'images')
    val_path = str(dataset_dir / 'valid' / 'images')
    test_path = str(dataset_dir / 'test' / 'images')

    # 여러 패턴으로 교체 시도
    content = original_content
    content = re.sub(r'train:\s*\.\./train/images', f'train: {train_path}', content)
    content = re.sub(r'train:\s*\.\.\/train\/images', f'train: {train_path}', content)
    content = re.sub(r'val:\s*\.\./valid/images', f'val: {val_path}', content)
    content = re.sub(r'val:\s*\.\.\/valid\/images', f'val: {val_path}', content)
    content = re.sub(r'test:\s*\.\./test/images', f'test: {test_path}', content)
    content = re.sub(r'test:\s*\.\.\/test\/images', f'test: {test_path}', content)

    # 수정된 내용 저장
    with open(data_yaml_path, 'w') as f:
        f.write(content)

    print("\n=== Updated data.yaml content ===")
    with open(data_yaml_path, 'r') as f:
        print(f.read())

    # 경로 존재 확인
    print("\n=== Verifying paths ===")
    print(f"Train path exists: {Path(train_path).exists()}")
    print(f"Val path exists: {Path(val_path).exists()}")
    print(f"Test path exists: {Path(test_path).exists()}")

    print(f"\n✅ Updated data.yaml at: {data_yaml_path}")
else:
    print("❌ Dataset folder not found!")
    print(f"Searching in: {datasets_base}")
    print(f"Found items: {list(datasets_base.iterdir())}")
```

### 3.6 여섯 번째 셀: 체크포인트 파일 업로드 (선택사항 - 재개용)

**방법 A: Google Drive에 업로드 후 복사**

1. 로컬에서 `last.pt` 파일을 Google Drive에 업로드
2. 다음 코드 실행:

```python
# Google Drive에서 체크포인트 복사
import shutil

# 체크포인트 디렉토리 생성
checkpoint_dir = work_dir / "checkpoints"
checkpoint_dir.mkdir(exist_ok=True)

# Google Drive 경로 (본인의 경로로 수정)
drive_checkpoint_path = "/content/drive/MyDrive/last.pt"  # 본인의 경로로 변경

if os.path.exists(drive_checkpoint_path):
    shutil.copy(drive_checkpoint_path, checkpoint_dir / "last.pt")
    print("Checkpoint copied successfully!")
else:
    print("Checkpoint not found. Starting from scratch.")
```

**방법 B: 직접 업로드**

```python
from google.colab import files

# 파일 업로드
uploaded = files.upload()

# 업로드된 파일을 체크포인트 디렉토리로 이동
checkpoint_dir = work_dir / "checkpoints"
checkpoint_dir.mkdir(exist_ok=True)

for filename in uploaded.keys():
    if filename.endswith('.pt'):
        shutil.move(filename, checkpoint_dir / filename)
        print(f"Moved {filename} to checkpoints directory")
```

### 3.7 일곱 번째 셀: 학습 스크립트 작성

```python
# train_surgical_tools_colab.py
train_script = """
import os
import torch
from pathlib import Path
from ultralytics import YOLO

def main():
    # Check GPU
    device = 0 if torch.cuda.is_available() else 'cpu'
    print(f"Using device: {device}")

    # Dataset path - 자동으로 찾기
    datasets_base = Path("/content/surgical_tool_training/datasets")

    # Cholec80 데이터셋 폴더 찾기
    dataset_dir = None
    for item in datasets_base.iterdir():
        if item.is_dir() and (item / 'data.yaml').exists():
            dataset_dir = item
            break

    if dataset_dir is None:
        # 직접 경로 시도
        dataset_dir = datasets_base / "Cholec80.v3-cholec80-10.yolov11"

    dataset_path = dataset_dir / 'data.yaml'

    if not dataset_path.exists():
        raise FileNotFoundError(f"data.yaml not found. Please check dataset location: {datasets_base}")

    print(f"Training with dataset: {dataset_path}")

    # Check if checkpoint exists
    checkpoint_dir = Path("/content/surgical_tool_training/checkpoints")
    checkpoint_path = checkpoint_dir / "last.pt"

    if checkpoint_path.exists():
        print(f"Resuming from checkpoint: {checkpoint_path}")
        model = YOLO(str(checkpoint_path))
        resume = True
    else:
        print("Starting new training with pretrained model")
        model = YOLO("yolo11m.pt")
        resume = False

    # Train
    results = model.train(
        data=str(dataset_path),
        epochs=100,
        patience=20,
        batch=4,  # Reduced for T4 GPU memory (was 16, but T4 has limited memory)
        imgsz=1280,
        device=device,

        # Augmentations
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

        # Project tracking
        project="training_runs",
        name="yolo11m_cholec80_colab",
        resume=resume
    )

    print(f"\\nTraining complete!")
    print(f"Best weights: {results.save_dir}/weights/best.pt")
    print(f"Last weights: {results.save_dir}/weights/last.pt")

    # Save to Google Drive
    drive_save_dir = Path("/content/drive/MyDrive/surgical_tool_training")
    drive_save_dir.mkdir(exist_ok=True, parents=True)

    import shutil
    shutil.copy(results.save_dir / "weights" / "best.pt",
                drive_save_dir / "best.pt")
    shutil.copy(results.save_dir / "weights" / "last.pt",
                drive_save_dir / "last.pt")

    print(f"\\nSaved to Google Drive: {drive_save_dir}")

if __name__ == '__main__':
    main()
"""

# 스크립트 저장
with open(work_dir / "train_surgical_tools_colab.py", "w") as f:
    f.write(train_script)

print("Training script created!")
```

### 3.8 여덟 번째 셀: 트레이닝 실행

```python
# 트레이닝 시작
exec(open(work_dir / "train_surgical_tools_colab.py").read())
```

또는:

```python
!python train_surgical_tools_colab.py
```

---

## Step 4: 트레이닝 모니터링

### 4.1 실시간 로그 확인

- Colab 셀 출력에서 실시간으로 진행 상황 확인
- Loss 값, epoch 진행률 등 확인

### 4.2 결과 확인

```python
# 학습 결과 확인
from pathlib import Path
import pandas as pd

results_csv = Path("/content/surgical_tool_training/training_runs/yolo11m_cholec80_colab/results.csv")
if results_csv.exists():
    df = pd.read_csv(results_csv)
    print(df.tail(10))
```

---

## Step 5: 결과 다운로드

### 5.1 Google Drive에 자동 저장

- 스크립트에서 자동으로 Google Drive에 저장됨
- `/content/drive/MyDrive/surgical_tool_training/` 경로 확인

### 5.2 수동 다운로드

```python
from google.colab import files

# best.pt 다운로드
files.download("/content/surgical_tool_training/training_runs/yolo11m_cholec80_colab/weights/best.pt")
files.download("/content/surgical_tool_training/training_runs/yolo11m_cholec80_colab/weights/last.pt")
```

---

## 주의사항

1. **세션 제한**: 무료 Colab은 약 12시간 후 세션이 종료될 수 있음

   - 해결: Google Drive에 주기적으로 체크포인트 저장
   - 또는 Colab Pro 사용 ($10/월)

2. **데이터 손실 방지**:

   - 중요한 파일은 Google Drive에 저장
   - 주기적으로 체크포인트 백업

3. **API 키 보안**:

   - Roboflow API 키는 환경 변수로 관리
   - 코드에 직접 입력하지 않기

4. **재개 방법**:
   - `last.pt` 파일이 있으면 자동으로 재개됨
   - 없으면 처음부터 시작

---

## 예상 속도

- **Colab T4 (무료)**: 현재보다 2-3배 빠름
- **Colab V100 (Pro)**: 현재보다 5-10배 빠름
- **Colab A100 (Pro)**: 현재보다 10-20배 빠름

**예상 시간 (100 epochs):**

- T4: 약 2-3일
- V100: 약 1일
- A100: 약 12시간
