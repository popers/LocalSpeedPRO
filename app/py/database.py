# Moduł odpowiedzialny za konfigurację bazy danych i modele SQLAlchemy

import os
import logging
from sqlalchemy import create_engine, Column, Integer, Float, String, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError # Import do obsługi błędów bazy

logger = logging.getLogger("LocalSpeedDB")

# --- KONFIGURACJA ŚCIEŻEK ---
BASE_DIR = "/app"
DB_SQLITE_NAME = "speedtest_final.db"
DB_SQLITE_PATH = os.path.join(BASE_DIR, DB_SQLITE_NAME)

# --- KONFIGURACJA POŁĄCZENIA ---
DB_TYPE = os.getenv("DB_TYPE", "sqlite") # domyślnie sqlite, jeśli nie ustawiono mysql

if DB_TYPE == "mysql":
    # Pobieramy zmienne środowiskowe zdefiniowane w compose.yaml / .env
    user = os.getenv("DB_USER", "ls_user")
    password = os.getenv("DB_PASSWORD", "secret")
    host = os.getenv("DB_HOST", "db")
    port = os.getenv("DB_PORT", "3306")
    db_name = os.getenv("DB_NAME", "localspeed")
    
    # Connection string dla MySQL (MariaDB) przy użyciu pymysql
    SQLALCHEMY_DATABASE_URL = f"mysql+pymysql://{user}:{password}@{host}:{port}/{db_name}"
    
    # MySQL wymaga parametru pool_recycle, aby zrywać nieaktywne połączenia przed timeoutem serwera
    engine_args = {
        "pool_recycle": 3600,
        "pool_pre_ping": True
    }
    logger.info(f"Używanie bazy danych MariaDB/MySQL: {host}")

else:
    # Fallback do SQLite
    SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_SQLITE_PATH}"
    # SQLite wymaga check_same_thread=False w FastAPI
    engine_args = {"connect_args": {"check_same_thread": False}}
    logger.info(f"Używanie bazy danych SQLite: {DB_SQLITE_PATH}")


# --- INICJALIZACJA BAZY DANYCH ---
try:
    engine = create_engine(SQLALCHEMY_DATABASE_URL, **engine_args)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base = declarative_base()
except Exception as e:
    logger.error(f"Błąd konfiguracji Engine DB: {e}")
    raise e

# --- MODELE BAZY DANYCH ---
class SpeedResult(Base):
    __tablename__ = "results"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(String(50)) # W MySQL warto określić długość stringa
    ping = Column(Float)
    download = Column(Float)
    upload = Column(Float)
    lang = Column(String(10), default="en") 
    theme = Column(String(20), default="dark")

class Settings(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, index=True)
    lang = Column(String(10), default="en") 
    theme = Column(String(20), default="dark") 
    unit = Column(String(10), default="mbps")
    primary_color = Column(String(20), default="#6200ea")
    
    # --- Konfiguracja OIDC ---
    oidc_enabled = Column(Boolean, default=False)
    oidc_discovery_url = Column(String(255), default="")
    oidc_client_id = Column(String(255), default="")
    oidc_client_secret = Column(String(255), default="")

    # --- Konfiguracja Google Drive Backup ---
    gdrive_enabled = Column(Boolean, default=False)
    gdrive_client_id = Column(String(255), default="")
    gdrive_client_secret = Column(String(255), default="")
    gdrive_folder_name = Column(String(255), default="LocalSpeed_Backup")
    gdrive_backup_frequency = Column(Integer, default=1) # co ile dni
    gdrive_backup_time = Column(String(10), default="04:00")
    gdrive_retention_days = Column(Integer, default=7)
    gdrive_last_backup = Column(String(50), default="") # data ostatniego backupu
    gdrive_status = Column(String(255), default="") # np. "Success", "Error: ..."
    # Tokeny przechowujemy jako JSON string (TEXT w mysql byłby lepszy, ale String wystarczy na start)
    gdrive_token_json = Column(String(4000), default="") # Zwiększony limit dla tokena Google

# Tworzenie tabel
try:
    Base.metadata.create_all(bind=engine)
    logger.info("Tabele bazy danych zostały zweryfikowane/utworzone.")
except OperationalError as e:
    # FIX: Obsługa błędu 1050 (Table already exists)
    # Występuje, gdy wiele workerów (WEB_CONCURRENCY=8) próbuje utworzyć tabele jednocześnie.
    # Jeśli kod błędu to 1050, ignorujemy go.
    if e.orig and e.orig.args[0] == 1050:
        logger.warning("Tabele już istnieją (ignorowanie wyścigu przy starcie wielu workerów).")
    else:
        # Inne błędy operacyjne logujemy jako błąd
        logger.error(f"KRYTYCZNY BŁĄD BAZY (OperationalError): {e}")
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