# Główny plik aplikacji FastAPI - REFACTORED
# Zastąpiono ręczne serwowanie plików automatycznym montowaniem katalogów (StaticFiles)

import os
import logging
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .database import STATIC_DIR

# Importowanie routerów API
from .settings_api import router as settings_router
from .history_api import router as history_router
from .speedtest_api import router as speedtest_router

# --- LOGOWANIE ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("LocalSpeed")

# --- KONFIGURACJA ŚCIEŻEK ---
BASE_DIR = "/app"
JS_DIR = os.path.join(BASE_DIR, "js")
CSS_DIR = os.path.join(BASE_DIR, "css")

# --- INIT PLIKÓW DANYCH ---
def initialize_static_files():
    """Generuje pliki testowe, jeśli nie istnieją."""
    try:
        os.makedirs(STATIC_DIR, exist_ok=True)
    except Exception:
        pass

    # Generujemy tylko pliki potrzebne do downloadu
    REQUIRED_FILES = {
        "10MB.bin": 10 * 1024 * 1024,
        "100MB.bin": 100 * 1024 * 1024,
        "500MB.bin": 500 * 1024 * 1024
    }

    for filename, size in REQUIRED_FILES.items():
        filepath = os.path.join(STATIC_DIR, filename)
        if not os.path.exists(filepath) or os.path.getsize(filepath) != size:
            try:
                logger.info(f"Generowanie pliku testowego: {filename}...")
                with open(filepath + ".tmp", "wb") as f:
                    f.write(os.urandom(size))
                os.rename(filepath + ".tmp", filepath)
            except Exception as e:
                logger.error(f"Błąd generowania pliku {filename}: {e}")

initialize_static_files()

# --- INICJALIZACJA FASTAPI ---
app = FastAPI(title="LocalSpeed Pro SQL Modular")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- ROUTING API ---
app.include_router(settings_router)
app.include_router(history_router)
app.include_router(speedtest_router)

# --- SERWOWANIE PLIKÓW STATYCZNYCH (PROFESJONALNE PODEJŚCIE) ---
# Zamiast pisać funkcję dla każdego pliku, montujemy całe katalogi.
# Dzięki temu każdy plik wrzucony do folderu /js/ będzie dostępny pod adresem /js/...

app.mount("/js", StaticFiles(directory=JS_DIR), name="js")
app.mount("/css", StaticFiles(directory=CSS_DIR), name="css")
# Opcjonalnie: mount static files dla obrazków/fontów jeśli będziesz ich używał
# app.mount("/assets", StaticFiles(directory=os.path.join(BASE_DIR, "assets")), name="assets")

@app.get("/")
async def read_index(): 
    """Serwuje główny plik HTML (SPA entry point)."""
    return FileResponse(os.path.join(BASE_DIR, 'index.html'))