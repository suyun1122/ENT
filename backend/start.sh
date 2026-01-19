#!/bin/bash
export LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu:/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
exec /opt/venv/bin/uvicorn main:app --host 0.0.0.0 --port $PORT
