import os
import logging
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .database import STATIC_DIR

# Import routerów
from .settings_api import router as settings_router
from .history_api import router as history_router
from .speedtest_api import router as speedtest_router
from .auth import router as auth_router, COOKIE_NAME

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("LocalSpeed")

BASE_DIR = "/app"
JS_DIR = os.path.join(BASE_DIR, "js")
CSS_DIR = os.path.join(BASE_DIR, "css")

# --- INIT PLIKÓW DANYCH ---
def initialize_static_files():
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
                logger.info(f"Generowanie pliku testowego: {filename}...")
                with open(filepath + ".tmp", "wb") as f:
                    f.write(os.urandom(size))
                os.rename(filepath + ".tmp", filepath)
            except Exception as e:
                logger.error(f"Błąd generowania pliku {filename}: {e}")

initialize_static_files()

app = FastAPI(title="LocalSpeed Pro")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MIDDLEWARE AUTORYZACJI ---
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    public_paths = [
        "/login.html", 
        "/api/login", 
        "/css", 
        "/js", 
        "/favicon.ico"
    ]
    path = request.url.path
    is_public = any(path.startswith(p) for p in public_paths)
    
    if is_public:
        return await call_next(request)
    
    token = request.cookies.get(COOKIE_NAME)
    if token != "authorized":
        if path.startswith("/api"):
             pass 
        else:
             return RedirectResponse("/login.html")
             
    response = await call_next(request)
    if response.status_code == 401:
        response.delete_cookie(COOKIE_NAME)
        
    return response

app.include_router(settings_router)
app.include_router(history_router)
app.include_router(speedtest_router)
app.include_router(auth_router)

app.mount("/js", StaticFiles(directory=JS_DIR), name="js")
app.mount("/css", StaticFiles(directory=CSS_DIR), name="css")

@app.get("/")
async def read_index(): 
    return FileResponse(os.path.join(BASE_DIR, 'index.html'))

# NOWY ROUTE: Ustawienia
@app.get("/settings.html")
async def read_settings():
    return FileResponse(os.path.join(BASE_DIR, 'settings.html'))

@app.get("/login.html")
async def read_login():
    return FileResponse(os.path.join(BASE_DIR, 'login.html'))