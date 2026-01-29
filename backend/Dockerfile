FROM ultralytics/ultralytics:latest-cpu

WORKDIR /app

# Copy requirements and install additional dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy only needed application files
COPY main.py .
COPY best.pt .

# Run the application - Railway sets PORT env var
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
