# Moduł odpowiedzialny za konfigurację bazy danych i modele SQLAlchemy

import os
import time
import logging
from sqlalchemy import create_engine, Column, Integer, Float, String, Boolean, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError

logger = logging.getLogger("LocalSpeedDB")

# --- KONFIGURACJA ŚCIEŻEK ---
BASE_DIR = "/app"
DB_SQLITE_NAME = "speedtest_final.db"
DB_SQLITE_PATH = os.path.join(BASE_DIR, DB_SQLITE_NAME)
STATIC_DIR = os.path.join(BASE_DIR, "static")

# --- KONFIGURACJA POŁĄCZENIA ---
DB_TYPE = os.getenv("DB_TYPE", "sqlite")

if DB_TYPE == "mysql":
    user = os.getenv("DB_USER", "ls_user")
    password = os.getenv("DB_PASSWORD", "secret")
    host = os.getenv("DB_HOST", "db")
    port = os.getenv("DB_PORT", "3306")
    db_name = os.getenv("DB_NAME", "localspeed")
    
    SQLALCHEMY_DATABASE_URL = f"mysql+pymysql://{user}:{password}@{host}:{port}/{db_name}"
    
    engine_args = {
        "pool_recycle": 3600,
        "pool_pre_ping": True
    }
    logger.info(f"Konfiguracja: MariaDB/MySQL ({host})")

else:
    SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_SQLITE_PATH}"
    engine_args = {"connect_args": {"check_same_thread": False}}
    logger.info(f"Konfiguracja: SQLite ({DB_SQLITE_PATH})")


# --- TWORZENIE SILNIKA (ENGINE) ---
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
    date = Column(String(50))
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
    
    # OIDC
    oidc_enabled = Column(Boolean, default=False)
    oidc_discovery_url = Column(String(255), default="")
    oidc_client_id = Column(String(255), default="")
    oidc_client_secret = Column(String(255), default="")

    # Google Drive Backup
    gdrive_enabled = Column(Boolean, default=False)
    gdrive_client_id = Column(String(255), default="")
    gdrive_client_secret = Column(String(255), default="")
    gdrive_folder_name = Column(String(255), default="LocalSpeed_Backup")
    gdrive_backup_frequency = Column(Integer, default=1)
    gdrive_backup_time = Column(String(10), default="04:00")
    gdrive_retention_days = Column(Integer, default=7)
    gdrive_last_backup = Column(String(50), default="")
    gdrive_status = Column(String(255), default="")
    gdrive_token_json = Column(String(4000), default="")

# --- FUNKCJA OCZEKUJĄCA NA BAZĘ (WAIT-FOR-DB) ---
def wait_for_db_connection(max_retries=15, wait_seconds=2):
    """
    Próbuje nawiązać połączenie z bazą danych w pętli.
    Blokuje start aplikacji do momentu sukcesu lub wyczerpania prób.
    """
    if DB_TYPE != "mysql":
        return True

    logger.info("Oczekiwanie na połączenie z bazą danych...")
    for i in range(max_retries):
        try:
            # Próba prostego połączenia
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            logger.info("Połączenie z bazą danych nawiązane!")
            return True
        except OperationalError as e:
            logger.warning(f"Baza danych niedostępna (próba {i+1}/{max_retries}). Czekam {wait_seconds}s...")
            time.sleep(wait_seconds)
        except Exception as e:
            logger.error(f"Nieoczekiwany błąd połączenia: {e}")
            time.sleep(wait_seconds)
    
    logger.error("Nie udało się połączyć z bazą danych po wielu próbach.")
    return False

# --- INICJALIZACJA TABEL ---
# Najpierw czekamy na bazę, potem tworzymy tabele
if wait_for_db_connection():
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Tabele bazy danych są gotowe.")
    except OperationalError as e:
        # Ignorujemy błąd wyścigu "Table already exists" przy wielu workerach
        if e.orig and e.orig.args[0] == 1050:
            logger.warning("Tabele już istnieją (ignorowanie wyścigu).")
        else:
            logger.error(f"KRYTYCZNY BŁĄD TWORZENIA TABEL: {e}")
    except Exception as e:
        logger.error(f"KRYTYCZNY BŁĄD BAZY: {e}")
else:
    logger.critical("APLIKACJA MOŻE NIE DZIAŁAĆ POPRAWNIE - BRAK POŁĄCZENIA Z BAZĄ")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()