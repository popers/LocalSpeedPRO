import os
import logging
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from .database import STATIC_DIR

# Import routerów
from .settings_api import router as settings_router
from .history_api import router as history_router
from .speedtest_api import router as speedtest_router
from .auth import router as auth_router, COOKIE_NAME
from .backup_api import router as backup_router # NOWY ROUTER

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
                with open(filepath + ".tmp", "wb") as f:
                    f.write(os.urandom(size))
                os.rename(filepath + ".tmp", filepath)
            except Exception:
                pass
initialize_static_files()

app = FastAPI(title="LocalSpeed Pro")

# --- WAŻNE: SessionMiddleware Fix ---
SECRET_KEY = os.getenv("APP_SECRET", "dev_secret_key_fixed_12345")

app.add_middleware(
    SessionMiddleware, 
    secret_key=SECRET_KEY, 
    max_age=3600,
    https_only=False, 
    same_site="lax"   
)

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
        "/api/auth/oidc",
        "/api/auth/status",
        "/css", 
        "/js", 
        # ZMIANA: Zezwalamy na dostęp tylko do /favicon.ico (usunęto /favicon.svg)
        "/favicon.ico"
    ]
    path = request.url.path
    is_public = any(path.startswith(p) for p in public_paths)
    if is_public:
        return await call_next(request)
    
    token = request.cookies.get(COOKIE_NAME)
    if token != "authorized":
        if path.startswith("/api"):
             from fastapi.responses import JSONResponse
             return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
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
app.include_router(backup_router) # Rejestracja

app.mount("/js", StaticFiles(directory=JS_DIR), name="js")
app.mount("/css", StaticFiles(directory=CSS_DIR), name="css")

@app.get("/")
async def read_index(): 
    return FileResponse(os.path.join(BASE_DIR, 'index.html'))

@app.get("/settings.html")
async def read_settings():
    return FileResponse(os.path.join(BASE_DIR, 'settings.html'))

@app.get("/login.html")
async def read_login():
    return FileResponse(os.path.join(BASE_DIR, 'login.html'))

# Endpoint dla favicony (teraz serwuje .ico)
@app.get("/favicon.ico")
async def favicon_ico():
    # Zmieniono ścieżkę z 'favicon.svg' na 'favicon.ico'
    return FileResponse(os.path.join(BASE_DIR, 'favicon.ico'), media_type='image/x-icon')