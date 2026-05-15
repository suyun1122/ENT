# Surgical Instrument Detection

这是一个本地运行的手术器械检测 demo。项目使用 YOLO 目标检测模型识别视频中的手术器械，并在网页中展示检测框、器械使用时间线、统计结果和基础运动数据分析。

当前版本是本地版：视频上传、YOLO 推理、检测结果保存和页面展示都在本机完成，无需云端视频分析服务。

## Model Source

本项目的当前权重来自 Hugging Face:

```text
https://huggingface.co/joonhaim/surgical-tool-recognition-yolo26s
```

模型信息：

- Model: `joonhaim/surgical-tool-recognition-yolo26s`
- Task: Object Detection
- Library: Ultralytics
- License: MIT
- Dataset: `joonhaim/surgical-tool-recognition-full-multiview`
- Local weight path: `backend/best.pt`

当前 `backend/best.pt` 已经替换为该模型权重。使用 Python 加载后，模型类别为：

| Class ID | Class Name |
| --- | --- |
| 0 | clamp |
| 1 | needle_holder |
| 2 | scalpel |
| 3 | shear |
| 4 | tweezer |

如果重新替换 `backend/best.pt`，需要重启后端服务。已经生成的旧检测 JSON 不会自动更新，需要重新上传视频或重新运行检测。

## What This Demo Does

这个 demo 解决的问题是：手术或训练视频通常很长，人工逐帧查看器械出现时间、数量和运动情况很费时间。这个项目把视频中的器械检测结果转成结构化数据，并用网页可视化展示。

主要功能：

- 上传本地视频
- 使用 YOLO 模型检测手术器械
- 在视频播放器上显示检测框 overlay
- 按类别筛选检测框
- 展示连续器械使用时间线
- 展示器械检测数量和平均置信度
- 基于检测框中心点计算运动数据
- 导出运动数据 JSON 和 CSV

## Project Structure

```text
surgical-tool-detection/
├── backend/
│   ├── main.py              # FastAPI YOLO inference server
│   ├── best.pt              # Current Hugging Face YOLO weight
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── src/app/
│   │   ├── api/local-upload/        # Local video upload and YOLO backend call
│   │   ├── api/motion/[videoId]/    # Motion data JSON/CSV export
│   │   ├── clips/                   # Video library and detail pages
│   │   ├── components/              # Player, overlay, timeline, statistics
│   │   ├── constants/toolColors.js  # Tool color mapping
│   │   └── utils/                   # Timeline and motion analysis utilities
│   ├── public/uploads/              # Local uploaded videos, ignored by git
│   ├── public/detections/           # Local detection JSON, ignored by git
│   └── data/                        # Local video index, ignored by git
│
└── cv_model/
    └── training_scripts/            # Optional local training/inference scripts
```

## Tech Stack

Frontend:

- Next.js 15
- React 19
- Tailwind CSS
- Canvas overlay

Backend:

- FastAPI
- Ultralytics YOLO
- OpenCV
- Python

## Local Setup

### 1. Start Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

Default backend URL:

```text
http://127.0.0.1:8000
```

Optional environment variables:

```env
MODEL_PATH=best.pt
PORT=8000
```

### 2. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:3000/clips
```

If the backend uses another URL, create `frontend/.env.local`:

```env
LOCAL_YOLO_BACKEND_URL=http://127.0.0.1:8000
```

## Workflow

1. Open `/clips`.
2. Upload a local video.
3. The frontend saves the video under `frontend/public/uploads/`.
4. The frontend calls the backend endpoint `/detect/upload`.
5. The backend loads `backend/best.pt` and runs YOLO inference.
6. Detection results are saved under `frontend/public/detections/`.
7. The detail page displays the video, bounding boxes, timeline, statistics and motion analysis.

## Detection JSON Format

The backend produces JSON similar to:

```json
{
  "video_id": "local-...",
  "model": "best.pt",
  "video_properties": {
    "width": 1280,
    "height": 720,
    "fps": 30,
    "duration": 80.8
  },
  "detections": [
    {
      "frame": 360,
      "timestamp": 12,
      "tools": [
        {
          "class_id": 1,
          "class_name": "needle_holder",
          "confidence": 0.72,
          "bbox": {
            "x1": 100,
            "y1": 120,
            "x2": 260,
            "y2": 300,
            "width": 160,
            "height": 180
          }
        }
      ]
    }
  ]
}
```

## GitHub Notes

The following files are local runtime data and are ignored by git:

- `frontend/data/`
- `frontend/public/uploads/`
- `frontend/public/detections/`
- `frontend/public/analysis/`
- `backend/best.previous-*.pt`

The active model file `backend/best.pt` is kept in the repository because it is required to run the demo.

## Disclaimer

This project is a demo for surgical instrument detection and motion visualization. It is not a medical diagnosis system. Detection results may contain false positives or missed detections and should be reviewed manually before any real use.
