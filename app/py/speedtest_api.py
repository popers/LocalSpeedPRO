import time
import os
import logging
from fastapi import APIRouter, Request, HTTPException, Response
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from .database import STATIC_DIR

router = APIRouter()
logger = logging.getLogger("ClientLogger")

# Model danych dla logu
class LogMessage(BaseModel):
    text: str

# --- ENDPOINT DO LOGOWANIA W KONSOLI DOCKERA ---
@router.post("/api/log_client")
async def log_from_client(data: LogMessage):
    """
    Odbiera komunikat z przeglądarki i wypisuje go w konsoli serwera.
    """
    print(f"\033[96m[CLIENT JS]\033[0m {data.text}", flush=True)
    return {"status": "ok"}

# --- SPEEDTEST API ---

@router.post("/api/upload")
async def upload_stream(request: Request):
    """
    Odbiera strumień danych i zlicza bajty.
    """
    total_bytes = 0
    start_time = time.time()
    try:
        async for chunk in request.stream():
            total_bytes += len(chunk)
    except Exception as e:
        pass
        
    duration = time.time() - start_time
    if duration <= 0: duration = 0.001
    
    return JSONResponse({"received": total_bytes, "time": duration})

@router.get("/api/ping")
async def ping():
    """
    Ultra-lekki endpoint do pomiaru opóźnienia.
    Dodano nagłówek Timing-Allow-Origin, aby przeglądarka odblokowała
    precyzyjne metryki w Performance API (Resource Timing).
    """
    return Response(status_code=204, headers={
        "Timing-Allow-Origin": "*",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
    })

@router.get("/static/{filename}")
async def serve_test_file(filename: str):
    """
    Serwuje pliki binarne do testu downloadu.
    """
    file_path = os.path.join(STATIC_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(
        file_path,
        media_type='application/octet-stream',
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Content-Encoding": "identity"
        }
    )