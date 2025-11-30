# Moduł odpowiedzialny za konfigurację bazy danych i modele SQLAlchemy

import os
import datetime
import logging
from sqlalchemy import create_engine, Column, Integer, Float, String, Boolean, func, desc, asc
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

logger = logging.getLogger("LocalSpeedDB")

# --- KONFIGURACJA ŚCIEŻEK ---
BASE_DIR = "/app"
DB_PATH = os.path.join(BASE_DIR, "speedtest_final.db") 

SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

# --- INICJALIZACJA BAZY DANYCH ---
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
    lang = Column(String, default="en") 
    theme = Column(String, default="dark")

class Settings(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, index=True)
    lang = Column(String, default="en") 
    theme = Column(String, default="dark") 
    unit = Column(String, default="mbps")
    primary_color = Column(String, default="#6200ea")
    
    # --- Konfiguracja OIDC ---
    # SQLite przechowuje Boolean jako 0/1
    oidc_enabled = Column(Boolean, default=False)
    oidc_discovery_url = Column(String, default="")
    oidc_client_id = Column(String, default="")
    oidc_client_secret = Column(String, default="")

# Tworzenie tabel
try:
    Base.metadata.create_all(bind=engine)
    logger.info(f"Baza danych zainicjalizowana: {DB_PATH}")
except Exception as e:
    logger.error(f"KRYTYCZNY BŁĄD BAZY: {e}")

# Zależność (Dependency) do pobierania sesji DB
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Używane w main.py do inicjalizacji
STATIC_DIR = os.path.join(BASE_DIR, "static")