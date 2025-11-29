# Główny plik aplikacji FastAPI, który łączy wszystkie moduły

import os
import logging
import random
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from .database import STATIC_DIR # Importujemy tylko STATIC_DIR, baza jest inicjalizowana w database.py

# Importowanie routerów API
from .settings_api import router as settings_router
from .history_api import router as history_router
from .speedtest_api import router as speedtest_router

# --- LOGOWANIE ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("LocalSpeed")

# --- INIT PLIKÓW DANYCH ---
def initialize_static_files():
    """Sprawdza i generuje wymagane pliki binarne do testów, jeśli nie istnieją."""
    try:
        os.makedirs(STATIC_DIR, exist_ok=True)
    except Exception:
        pass

    REQUIRED_FILES = {
        "10MB.bin": 10 * 1024 * 1024,
        "100MB.bin": 100 * 1024 * 1024,
        "500MB.bin": 500 * 1024 * 1024
    }

    for filename, size in REQUIRED_FILES.items():
        filepath = os.path.join(STATIC_DIR, filename)
        if not os.path.exists(filepath) or os.path.getsize(filepath) != size:
            try:
                print(f"Generowanie pliku testowego: {filename}...")
                # Używamy os.urandom zamiast dd (jak w Dockerfile), 
                # aby zapewnić dostępność pliku również w środowiskach lokalnych bez Dockerfile
                with open(filepath + ".tmp", "wb") as f:
                    f.write(os.urandom(size))
                os.rename(filepath + ".tmp", filepath)
            except Exception as e:
                logger.error(f"Nie udało się wygenerować pliku {filename}: {e}")
                pass

initialize_static_files()

# --- INICJALIZACJA FASTAPI ---
BASE_DIR = "/app"
app = FastAPI(title="LocalSpeed Pro SQL Modular")

# Konfiguracja CORS (umożliwia dostęp z dowolnego źródła)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rejestracja routerów API
app.include_router(settings_router)
app.include_router(history_router)
app.include_router(speedtest_router) # Speedtest API zawiera też endpoint /static/{filename}

# --- SERWOWANIE GŁÓWNYCH PLIKÓW FRONTENDOWYCH ---

@app.get("/")
async def read_index(): 
    """Serwuje główny plik HTML."""
    return FileResponse(os.path.join(BASE_DIR, 'index.html'))

# Endpointy dla poszczególnych plików CSS (teraz /css/)
@app.get("/css/base.css")
async def read_base_css(): return FileResponse(os.path.join(BASE_DIR, 'css', 'base.css'))
@app.get("/css/header.css")
async def read_header_css(): return FileResponse(os.path.join(BASE_DIR, 'css', 'header.css'))
@app.get("/css/dashboard.css")
async def read_dashboard_css(): return FileResponse(os.path.join(BASE_DIR, 'css', 'dashboard.css'))
@app.get("/css/gauge.css")
async def read_gauge_css(): return FileResponse(os.path.join(BASE_DIR, 'css', 'gauge.css'))
@app.get("/css/stats.css")
async def read_stats_css(): return FileResponse(os.path.join(BASE_DIR, 'css', 'stats.css'))
@app.get("/css/history.css")
async def read_history_css(): return FileResponse(os.path.join(BASE_DIR, 'css', 'history.css'))
@app.get("/css/toast.css")
async def read_toast_css(): return FileResponse(os.path.join(BASE_DIR, 'css', 'toast.css'))

# Endpointy dla poszczególnych plików JS (teraz /js/)
@app.get("/js/config.js")
async def read_config_js(): return FileResponse(os.path.join(BASE_DIR, 'js', 'config.js'))
@app.get("/js/utils.js")
async def read_utils_js(): return FileResponse(os.path.join(BASE_DIR, 'js', 'utils.js'))
@app.get("/js/gauge.js")
async def read_gauge_js(): return FileResponse(os.path.join(BASE_DIR, 'js', 'gauge.js'))
@app.get("/js/charts.js")
async def read_charts_js(): return FileResponse(os.path.join(BASE_DIR, 'js', 'charts.js'))
@app.get("/js/data_sync.js")
async def read_data_sync_js(): return FileResponse(os.path.join(BASE_DIR, 'js', 'data_sync.js'))
@app.get("/js/history_ui.js")
async def read_history_ui_js(): return FileResponse(os.path.join(BASE_DIR, 'js', 'history_ui.js'))
@app.get("/js/speedtest.js")
async def read_speedtest_js(): return FileResponse(os.path.join(BASE_DIR, 'js', 'speedtest.js'))
@app.get("/js/main.js")
async def read_main_js(): return FileResponse(os.path.join(BASE_DIR, 'js', 'main.js'))