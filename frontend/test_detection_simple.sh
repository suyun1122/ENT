#!/bin/bash

# Simple test script to verify tool detection works

echo "=== Testing Surgical Tool Detection ==="
echo ""

# Check Python environment
echo "1. Checking Python environment..."
PYTHON_PATH="/Users/Miranda/twelveLabs/surgical-tool-detection/cv_model/venv/bin/python"

if [ ! -f "$PYTHON_PATH" ]; then
    echo "❌ Python venv not found at: $PYTHON_PATH"
    exit 1
fi

echo "✅ Python found: $PYTHON_PATH"
$PYTHON_PATH --version
echo ""

# Check model file
echo "2. Checking YOLO model..."
MODEL_PATH="/Users/Miranda/twelveLabs/surgical-tool-detection/frontend/models/surgical_tools.pt"

if [ ! -f "$MODEL_PATH" ]; then
    echo "❌ Model not found at: $MODEL_PATH"
    exit 1
fi

MODEL_SIZE=$(du -h "$MODEL_PATH" | cut -f1)
echo "✅ Model found: $MODEL_PATH ($MODEL_SIZE)"
echo ""

# Check video file
echo "3. Checking video file..."
VIDEO_PATH="/Users/Miranda/twelveLabs/surgical-tool-detection/runs/Gallbladder removal surgery.mp4"

if [ ! -f "$VIDEO_PATH" ]; then
    echo "❌ Video not found at: $VIDEO_PATH"
    exit 1
fi

VIDEO_SIZE=$(du -h "$VIDEO_PATH" | cut -f1)
echo "✅ Video found: $VIDEO_PATH ($VIDEO_SIZE)"
echo ""

# Check Python dependencies
echo "4. Checking Python dependencies..."
$PYTHON_PATH -c "from ultralytics import YOLO; import cv2; print('✅ All dependencies OK')" 2>/dev/null

if [ $? -ne 0 ]; then
    echo "❌ Missing dependencies"
    echo "Run: cd /Users/Miranda/twelveLabs/surgical-tool-detection/cv_model && source venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi
echo ""

# Test inference script (first 10 frames only for speed)
echo "5. Testing inference on 10 frames..."
SCRIPT_PATH="/Users/Miranda/twelveLabs/surgical-tool-detection/frontend/src/app/api/detect-tools/inference.py"
OUTPUT_PATH="/tmp/test_detection_output.json"

$PYTHON_PATH "$SCRIPT_PATH" "$VIDEO_PATH" "$MODEL_PATH" "$OUTPUT_PATH" 30

if [ $? -eq 0 ] && [ -f "$OUTPUT_PATH" ]; then
    echo "✅ Inference test successful!"
    echo ""
    echo "Sample output:"
    cat "$OUTPUT_PATH" | head -50
    echo ""
    echo "Full output saved to: $OUTPUT_PATH"
else
    echo "❌ Inference test failed"
    exit 1
fi

echo ""
echo "=== All tests passed! ✅ ==="
echo "You can now use the tool detection in the browser."


