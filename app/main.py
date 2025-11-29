import time
import os
import random
import datetime
import logging
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# --- SQLALCHEMY IMPORTS ---
from sqlalchemy import create_engine, Column, Integer, Float, String, func, desc, asc
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

# --- LOGOWANIE ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("LocalSpeed")

# --- KONFIGURACJA PLIKÓW ---
BASE_DIR = "/app"
STATIC_DIR = os.path.join(BASE_DIR, "static")
DB_PATH = os.path.join(BASE_DIR, "speedtest_final.db") 

SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- MODELE BAZY DANYCH ---

class SpeedResult(Base):
    __tablename__ = "results"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(String) 
    ping = Column(Float)
    download = Column(Float)
    upload = Column(Float)
    lang = Column(String, default="pl")
    theme = Column(String, default="dark")

class Settings(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, index=True)
    lang = Column(String, default="pl")
    theme = Column(String, default="dark")
    unit = Column(String, default="mbps") # 'mbps' lub 'mbs'

# Tworzenie tabel
try:
    Base.metadata.create_all(bind=engine)
    logger.info(f"Baza danych zainicjalizowana: {DB_PATH}")
except Exception as e:
    logger.error(f"KRYTYCZNY BŁĄD BAZY: {e}")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- INIT PLIKÓW ---
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
            print(f"Generowanie: {filename}...")
            with open(filepath + ".tmp", "wb") as f:
                f.write(os.urandom(size))
            os.rename(filepath + ".tmp", filepath)
        except Exception:
            pass

app = FastAPI(title="LocalSpeed Pro SQL")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API USTAWIEŃ ---
@app.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(Settings).filter(Settings.id == 1).first()
    if not settings:
        settings = Settings(id=1, lang="pl", theme="dark", unit="mbps")
        db.add(settings)
        db.commit()
    return settings

@app.post("/api/settings")
async def update_settings(request: Request, db: Session = Depends(get_db)):
    data = await request.json()
    settings = db.query(Settings).filter(Settings.id == 1).first()
    if not settings:
        settings = Settings(id=1)
        db.add(settings)
    
    if 'lang' in data: settings.lang = data['lang']
    if 'theme' in data: settings.theme = data['theme']
    if 'unit' in data: settings.unit = data['unit']
    
    db.commit()
    return {"status": "updated"}

# --- API HISTORII (Z SORTOWANIEM I PAGINACJĄ) ---
@app.get("/api/history")
def read_history(
    page: int = 1, 
    limit: int = 10, 
    sort_by: str = 'date', 
    order: str = 'desc',
    db: Session = Depends(get_db)
):
    offset = (page - 1) * limit
    
    # Mapowanie nazw kolumn z frontend na model SQLAlchemy
    sort_column = SpeedResult.date # Default
    if sort_by == 'ping': sort_column = SpeedResult.ping
    elif sort_by == 'download': sort_column = SpeedResult.download
    elif sort_by == 'upload': sort_column = SpeedResult.upload
    
    # Kierunek sortowania
    sort_func = desc if order == 'desc' else asc

    try:
        total_count = db.query(func.count(SpeedResult.id)).scalar()
        
        results = db.query(SpeedResult)\
            .order_by(sort_func(sort_column))\
            .offset(offset)\
            .limit(limit)\
            .all()
            
        return {
            "total": total_count,
            "page": page,
            "limit": limit,
            "data": results
        }
    except Exception as e:
        logger.error(f"Błąd odczytu historii: {e}")
        return {"total": 0, "page": 1, "limit": limit, "data": []}

@app.post("/api/history")
async def save_result(request: Request, db: Session = Depends(get_db)):
    try:
        data = await request.json()
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        new_result = SpeedResult(
            ping=data['ping'],
            download=data['download'],
            upload=data['upload'],
            lang=data.get('lang', 'pl'),
            theme=data.get('theme', 'dark'),
            date=now_str
        )
        db.add(new_result)
        db.commit()
        return {"status": "saved"}
    except Exception as e:
        logger.error(f"Błąd zapisu historii: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

# --- SPEEDTEST API ---
@app.post("/api/upload")
async def upload_stream(request: Request):
    total_bytes = 0
    start_time = time.time()
    try:
        async for chunk in request.stream():
            total_bytes += len(chunk)
    except Exception:
        pass
    duration = time.time() - start_time
    if duration == 0: duration = 0.001
    return JSONResponse({"received": total_bytes, "time": duration})

@app.get("/api/ping")
async def ping():
    return {"pong": time.time()}

@app.get("/static/{filename}")
async def serve_test_file(filename: str):
    file_path = os.path.join(STATIC_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        file_path,
        media_type='application/octet-stream',
        headers={"Cache-Control": "no-store", "Content-Encoding": "identity"}
    )

@app.get("/")
async def read_index(): return FileResponse(os.path.join(BASE_DIR, 'index.html'))
@app.get("/style.css")
async def read_css(): return FileResponse(os.path.join(BASE_DIR, 'style.css'))
@app.get("/main.js")
async def read_js(): return FileResponse(os.path.join(BASE_DIR, 'main.js'))