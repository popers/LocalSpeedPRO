# Moduł odpowiedzialny za konfigurację bazy danych i modele SQLAlchemy

import os
import datetime
import logging
from sqlalchemy import create_engine, Column, Integer, Float, String, func, desc, asc
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

logger = logging.getLogger("LocalSpeedDB")

# --- KONFIGURACJA ŚCIEŻEK ---
BASE_DIR = "/app"
DB_PATH = os.path.join(BASE_DIR, "speedtest_final.db") 

SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

# --- INICJALIZACJA BAZY DANYCH ---
# check_same_thread=False jest potrzebne dla SQLite w FastAPI, aby umożliwić
# wielu wątkom interakcję z bazą danych (standardowe zachowanie to jeden wątek).
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
    lang = Column(String, default="en") # ZMIANA: Domyślnie angielski dla wyników (jeśli nie podano)
    theme = Column(String, default="dark")

class Settings(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, index=True)
    lang = Column(String, default="en") # ZMIANA: Domyślnie angielski w bazie
    theme = Column(String, default="dark") 
    unit = Column(String, default="mbps") # 'mbps' lub 'mbs'

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