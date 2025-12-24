# Essential Files to Share with Hazel.ai

## 1. API Endpoints (Reference Implementation)
These show how Twelve Labs API is already integrated:

- `frontend/src/app/api/analysis/route.js` - Main analysis endpoint (used for chat, reports, tools)
- `frontend/src/app/api/analysis/[videoId]/route.js` - Get video gist
- `frontend/src/app/api/video/route.js` - Video upload and list
- `frontend/src/app/api/search/route.js` - Semantic search
- `frontend/src/app/api/timeline/route.js` - Timeline generation

## 2. UI Components (Reference for Structure)
These show the UI patterns to follow:

- `frontend/src/app/components/ChapterTimeline.js` - Timeline component
- `frontend/src/app/components/ClipChat.js` - Chat interface
- `frontend/src/app/components/EventTimeline.js` - Event timeline
- `frontend/src/app/components/UploadVideo.js` - Video upload component
- `frontend/src/app/page.js` - Main dashboard page

## 3. Tool Detection Code
The inference script to understand how tool detection works:

- `cv_model/training_scripts/inference_surgical_tools.py` - Tool detection inference code

## 4. Configuration Files
- `frontend/package.json` - Dependencies and scripts
- `cv_model/training_scripts/best.pt` - **Model file location** (39MB - may need to share path only, not file)

## 5. Project Structure Reference
- `README.md` - Overall project structure
- `frontend/src/app/layout.js` - App layout structure

## Files NOT Needed:
- `rtsp-stream-worker/` - Backend worker (will be recreated)
- `runs/` - Training outputs
- `cv_model/venv/` - Virtual environment
- `cv_model/Cholec80.v3-cholec80-10.yolov11/` - Dataset (too large)
- All `.pt` files except `best.pt` path reference

## Recommended Sharing Method:
1. Create a zip file with only the essential files above
2. Or share individual files through Hazel.ai's file upload
3. For `best.pt` - either share the file path or upload separately if size allows



