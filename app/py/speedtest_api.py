# Moduł obsługujący endpointy API dla samego testu prędkości i serwowania plików

import time
import os
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from .database import STATIC_DIR # POPRAWKA: Użycie względnego importu wewnątrz pakietu (.database)

router = APIRouter()

# --- SPEEDTEST API ---
@router.post("/api/upload")
async def upload_stream(request: Request):
    """Odbiera strumień danych w celu pomiaru prędkości wysyłania."""
    total_bytes = 0
    start_time = time.time()
    try:
        # Iteruje przez strumień przychodzących danych
        async for chunk in request.stream():
            total_bytes += len(chunk)
    except Exception as e:
        # Ignorujemy błędy, ale logujemy je. Wiele workerów może się abortować w tym samym czasie.
        print(f"Upload stream error: {e}") 
        pass
        
    duration = time.time() - start_time
    if duration == 0: duration = 0.001
    
    return JSONResponse({"received": total_bytes, "time": duration})

@router.get("/api/ping")
async def ping():
    """Endpoint do pomiaru opóźnienia (ping)."""
    return {"pong": time.time()}

@router.get("/static/{filename}")
async def serve_test_file(filename: str):
    """Serwuje pliki binarne do pomiaru prędkości pobierania."""
    file_path = os.path.join(STATIC_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    # Użycie nagłówków Cache-Control: no-store jest kluczowe, aby przeglądarka 
    # za każdym razem pobierała plik, a nie używała kopii z pamięci podręcznej.
    return FileResponse(
        file_path,
        media_type='application/octet-stream',
        headers={"Cache-Control": "no-store", "Content-Encoding": "identity"}
    )