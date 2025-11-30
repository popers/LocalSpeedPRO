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
DB_NAME = "speedtest_final.db"
DB_PATH = os.path.join(BASE_DIR, DB_NAME) 

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
    oidc_enabled = Column(Boolean, default=False)
    oidc_discovery_url = Column(String, default="")
    oidc_client_id = Column(String, default="")
    oidc_client_secret = Column(String, default="")

    # --- Konfiguracja Google Drive Backup ---
    gdrive_enabled = Column(Boolean, default=False)
    gdrive_client_id = Column(String, default="")
    gdrive_client_secret = Column(String, default="")
    gdrive_folder_name = Column(String, default="LocalSpeed_Backup")
    gdrive_backup_frequency = Column(Integer, default=1) # co ile dni
    gdrive_backup_time = Column(String, default="04:00")
    gdrive_retention_days = Column(Integer, default=7)
    gdrive_last_backup = Column(String, default="") # data ostatniego backupu
    gdrive_status = Column(String, default="") # np. "Success", "Error: ..."
    # Tokeny przechowujemy jako JSON string
    gdrive_token_json = Column(String, default="")

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