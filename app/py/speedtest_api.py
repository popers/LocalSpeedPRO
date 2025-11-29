import time
import os
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from .database import STATIC_DIR

router = APIRouter()

# --- SPEEDTEST API ---

@router.post("/api/upload")
async def upload_stream(request: Request):
    """
    Odbiera strumień danych (chunked transfer) i mierzy jego wielkość.
    Nie zapisuje danych na dysku (oszczędność I/O), tylko zlicza bajty.
    """
    total_bytes = 0
    start_time = time.time()
    try:
        async for chunk in request.stream():
            total_bytes += len(chunk)
            # Opcjonalnie: Jeśli chcesz ograniczyć zużycie CPU, możesz dodać tutaj mały sleep(0),
            # ale dla speedtestu chcemy maksymalnej przepustowości.
    except Exception as e:
        # Błędy połączenia są normalne przy przerwaniu testu przez klienta
        pass
        
    duration = time.time() - start_time
    # Zapobieganie dzieleniu przez zero
    if duration <= 0: duration = 0.001
    
    return JSONResponse({"received": total_bytes, "time": duration})

@router.get("/api/ping")
async def ping():
    """Lekki endpoint do pomiaru opóźnienia."""
    return {"pong": time.time()}

@router.get("/static/{filename}")
async def serve_test_file(filename: str):
    """
    Serwuje pliki binarne do testu downloadu.
    Używa FileResponse, który jest zoptymalizowany pod kątem zerocopy sendfile() w systemie operacyjnym.
    """
    file_path = os.path.join(STATIC_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(
        file_path,
        media_type='application/octet-stream',
        # Cache-Control: no-store jest CRITICAL dla wiarygodności testu
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Content-Encoding": "identity" # Zapobiega kompresji gzip/brotli
        }
    )