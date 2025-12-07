import time
import os
import logging
import subprocess
import platform
import re
import asyncio
from fastapi import APIRouter, Request, HTTPException, Response
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
from .database import STATIC_DIR

router = APIRouter()
logger = logging.getLogger("ClientLogger")

# --- KONFIGURACJA GENERATORA DANYCH ---
# Tworzymy statyczny blok danych w pamięci RAM (np. 4MB), który będziemy wysyłać w pętli.
# Dzięki temu nie obciążamy CPU generowaniem losowych danych w czasie rzeczywistym,
# a jedynie kopiujemy gotowy blok pamięci.
CHUNK_SIZE = 4 * 1024 * 1024  # 4 MB
RANDOM_DATA = os.urandom(CHUNK_SIZE)

# Model danych dla logu
class LogMessage(BaseModel):
    text: str

def get_real_client_ip(request: Request) -> str:
    """
    Pobiera prawdziwe IP klienta, uwzględniając proxy (Nginx, Traefik, Cloudflare).
    """
    x_forwarded = request.headers.get("x-forwarded-for")
    if x_forwarded:
        return x_forwarded.split(",")[0].strip()
    
    x_real = request.headers.get("x-real-ip")
    if x_real:
        return x_real
    
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip

    return request.client.host

# --- ENDPOINTY ---

@router.post("/api/log_client")
async def log_from_client(data: LogMessage):
    print(f"\033[96m[CLIENT JS]\033[0m {data.text}", flush=True)
    return {"status": "ok"}

@router.post("/api/upload")
async def upload_stream(request: Request):
    """
    Odbiera strumień danych i zlicza bajty (Test Uploadu).
    Dane trafiają w "czarną dziurę" (/dev/null), liczymy tylko transfer.
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

@router.get("/api/download")
async def download_stream(size: int = 100):
    """
    Generuje strumień danych z pamięci RAM (Test Downloadu).
    
    Args:
        size (int): Rozmiar danych do pobrania w MB (domyślnie 100MB).
    """
    # Ograniczenie bezpieczeństwa - max 1GB na jedno żądanie
    if size > 1000: size = 1000
    if size < 1: size = 1
    
    total_bytes = size * 1024 * 1024

    def iterfile():
        bytes_sent = 0
        while bytes_sent < total_bytes:
            # Oblicz ile zostało do wysłania
            remaining = total_bytes - bytes_sent
            # Wyślij pełny CHUNK lub resztkę, jeśli została mniejsza niż CHUNK
            to_send = min(remaining, CHUNK_SIZE)
            
            # Jeśli wysyłamy pełny chunk, używamy pre-alokowanego bufora
            if to_send == CHUNK_SIZE:
                yield RANDOM_DATA
            else:
                yield RANDOM_DATA[:to_send]
                
            bytes_sent += to_send

    headers = {
        "Content-Disposition": f'attachment; filename="random_{size}MB.bin"',
        "Content-Length": str(total_bytes),
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
    }

    return StreamingResponse(iterfile(), media_type="application/octet-stream", headers=headers)

@router.get("/api/ping")
async def ping():
    return Response(status_code=204, headers={
        "Timing-Allow-Origin": "*",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
    })

@router.get("/api/ping_icmp")
async def ping_icmp(request: Request):
    try:
        client_ip = get_real_client_ip(request)
        
        if client_ip in ["127.0.0.1", "localhost", "::1"]:
             return {"ping": 0, "error": "Skipping localhost ping", "method": "skipped"}

        if platform.system().lower() == "windows":
            cmd = ["ping", "-n", "1", "-w", "1000", client_ip]
        else:
            cmd = ["ping", "-c", "1", "-W", "1", client_ip]

        process = await asyncio.to_thread(
            subprocess.run, 
            cmd, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE, 
            text=True
        )

        if process.returncode == 0:
            match = re.search(r'(?:time|czas|Cza)[=<]([\d\.]+)', process.stdout, re.IGNORECASE)
            if match:
                return {"ping": float(match.group(1)), "method": "icmp", "ip": client_ip}
                
        return {
            "ping": 0, 
            "error": "ICMP unreachable", 
            "ip": client_ip
        }

    except Exception as e:
        logger.error(f"ICMP Error: {e}")
        return {"ping": 0, "error": str(e)}

# Zachowujemy endpoint statyczny dla kompatybilności wstecznej lub customowych plików,
# ale główny test będzie teraz korzystał z /api/download
@router.get("/static/{filename}")
async def serve_test_file(filename: str):
    file_path = os.path.join(STATIC_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(
        file_path,
        media_type='application/octet-stream',
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache"
        }
    )