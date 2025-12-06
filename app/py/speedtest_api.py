import time
import os
import logging
import subprocess
import platform
import re
import asyncio
from fastapi import APIRouter, Request, HTTPException, Response
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from .database import STATIC_DIR

router = APIRouter()
logger = logging.getLogger("ClientLogger")

# Model danych dla logu
class LogMessage(BaseModel):
    text: str

def get_real_client_ip(request: Request) -> str:
    """
    Pobiera prawdziwe IP klienta, uwzględniając proxy (Nginx, Traefik, Cloudflare).
    """
    # 1. X-Forwarded-For (Standard) - może zawierać listę IP, bierzemy pierwsze
    x_forwarded = request.headers.get("x-forwarded-for")
    if x_forwarded:
        return x_forwarded.split(",")[0].strip()
    
    # 2. X-Real-IP (Często używane przez Nginx)
    x_real = request.headers.get("x-real-ip")
    if x_real:
        return x_real
    
    # 3. CF-Connecting-IP (Cloudflare)
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip

    # 4. Fallback do bezpośredniego połączenia (jeśli brak proxy)
    return request.client.host

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
    Ultra-lekki endpoint do pomiaru opóźnienia HTTP (Fallback).
    """
    return Response(status_code=204, headers={
        "Timing-Allow-Origin": "*",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
    })

@router.get("/api/ping_icmp")
async def ping_icmp(request: Request):
    """
    Wykonuje prawdziwy PING ICMP z serwera do klienta.
    Obsługuje scenariusze za Reverse Proxy (Nginx/Traefik).
    """
    try:
        client_ip = get_real_client_ip(request)
        
        # Zabezpieczenie: Nie pingujemy localhosta ani 127.0.0.1, bo to zafałszuje wynik
        if client_ip in ["127.0.0.1", "localhost", "::1"]:
             return {"ping": 0, "error": "Skipping localhost ping", "method": "skipped"}

        # Ustalamy komendę w zależności od systemu
        if platform.system().lower() == "windows":
            cmd = ["ping", "-n", "1", "-w", "1000", client_ip]
        else:
            cmd = ["ping", "-c", "1", "-W", "1", client_ip]

        # Uruchamiamy w osobnym wątku
        process = await asyncio.to_thread(
            subprocess.run, 
            cmd, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE, 
            text=True
        )

        if process.returncode == 0:
            # Parsowanie wyniku (Windows/Linux)
            match = re.search(r'(?:time|czas|Cza)[=<]([\d\.]+)', process.stdout, re.IGNORECASE)
            if match:
                return {"ping": float(match.group(1)), "method": "icmp", "ip": client_ip}
                
        return {
            "ping": 0, 
            "error": "ICMP unreachable (Client Firewall?)", 
            "ip": client_ip, 
            "details": "Target blocked ICMP request"
        }

    except Exception as e:
        logger.error(f"ICMP Error: {e}")
        return {"ping": 0, "error": str(e)}

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