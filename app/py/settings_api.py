import logging
from fastapi import APIRouter, Request, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect
from .database import get_db, Settings, engine

logger = logging.getLogger("SettingsAPI")
router = APIRouter()

def ensure_columns():
    """
    Sprawdza i dodaje brakujące kolumny.
    Zaktualizowane, aby działać zarówno na SQLite (PRAGMA) jak i MySQL (inspect).
    """
    try:
        # Używamy SQLAlchemy Inspector, który jest niezależny od bazy danych
        inspector = inspect(engine)
        
        # Jeśli tabela jeszcze nie istnieje (np. przy pierwszym starcie przed create_all), pomijamy
        if not inspector.has_table("settings"):
            return

        columns_info = inspector.get_columns("settings")
        existing_columns = [col['name'] for col in columns_info]
        
        # Helper do wykonywania ALTER TABLE
        def add_if_missing(col_name, col_type, default):
            if col_name not in existing_columns:
                logger.info(f"Migracja: Dodawanie kolumny '{col_name}'...")
                try:
                    with engine.connect() as connection:
                        # Składnia ADD COLUMN jest wspierana przez MySQL i SQLite
                        # W MySQL ważne jest podanie długości dla VARCHAR (np. VARCHAR(255))
                        connection.execute(text(f"ALTER TABLE settings ADD COLUMN {col_name} {col_type} DEFAULT {default}"))
                        connection.commit()
                except Exception as ex:
                    logger.error(f"Błąd dodawania kolumny {col_name}: {ex}")

        # Definicje kolumn z typami kompatybilnymi dla MySQL (długość VARCHAR)
        add_if_missing("unit", "VARCHAR(10)", "'mbps'")
        add_if_missing("primary_color", "VARCHAR(20)", "'#6200ea'")
        add_if_missing("oidc_enabled", "BOOLEAN", "0")
        add_if_missing("oidc_discovery_url", "VARCHAR(255)", "''")
        add_if_missing("oidc_client_id", "VARCHAR(255)", "''")
        add_if_missing("oidc_client_secret", "VARCHAR(255)", "''")
        
        # --- Nowe kolumny Google Drive ---
        add_if_missing("gdrive_enabled", "BOOLEAN", "0")
        add_if_missing("gdrive_client_id", "VARCHAR(255)", "''")
        add_if_missing("gdrive_client_secret", "VARCHAR(255)", "''")
        add_if_missing("gdrive_folder_name", "VARCHAR(255)", "'LocalSpeed_Backup'")
        add_if_missing("gdrive_backup_frequency", "INTEGER", "1")
        add_if_missing("gdrive_backup_time", "VARCHAR(10)", "'04:00'")
        add_if_missing("gdrive_retention_days", "INTEGER", "7")
        add_if_missing("gdrive_last_backup", "VARCHAR(50)", "''")
        add_if_missing("gdrive_status", "VARCHAR(255)", "''")
        # Zwiększamy limit dla tokena (TEXT byłby lepszy w MySQL, ale VARCHAR(4000) jest bezpieczny i prosty)
        add_if_missing("gdrive_token_json", "VARCHAR(4000)", "''")

    except Exception as e:
        logger.error(f"Krytyczny błąd migracji (engine): {e}")

@router.get("/api/settings")
def get_settings(response: Response, db: Session = Depends(get_db)):
    """Pobiera ustawienia."""
    
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"

    ensure_columns()
    
    try:
        settings = db.query(Settings).filter(Settings.id == 1).first()
        if not settings:
            settings = Settings(id=1, lang="en", theme="dark", unit="mbps", primary_color="#6200ea")
            db.add(settings)
            db.commit()
            db.refresh(settings)

        return {
            "id": settings.id,
            "lang": settings.lang,
            "theme": settings.theme,
            "unit": settings.unit,
            "primary_color": settings.primary_color,
            "oidc_enabled": settings.oidc_enabled,
            "oidc_discovery_url": settings.oidc_discovery_url,
            "oidc_client_id": settings.oidc_client_id,
            "oidc_client_secret": settings.oidc_client_secret,
            
            # Google Drive fields
            "gdrive_enabled": settings.gdrive_enabled,
            "gdrive_client_id": settings.gdrive_client_id,
            "gdrive_client_secret": settings.gdrive_client_secret,
            "gdrive_folder_name": settings.gdrive_folder_name,
            "gdrive_backup_frequency": settings.gdrive_backup_frequency,
            "gdrive_backup_time": settings.gdrive_backup_time,
            "gdrive_retention_days": settings.gdrive_retention_days
        }

    except Exception as e:
        logger.error(f"Błąd pobierania ustawień: {e}")
        # Fallback w przypadku błędu
        return { "id": 1, "lang": "en", "theme": "dark" }

@router.post("/api/settings")
async def update_settings(request: Request, db: Session = Depends(get_db)):
    """Aktualizuje ustawienia."""
    ensure_columns()

    try:
        data = await request.json()
        
        settings = db.query(Settings).filter(Settings.id == 1).first()
        if not settings:
            settings = Settings(id=1)
            db.add(settings)
        
        # Podstawowe
        if 'lang' in data: settings.lang = str(data['lang'])
        if 'theme' in data: settings.theme = str(data['theme'])
        if 'unit' in data: settings.unit = str(data['unit'])
        if 'primary_color' in data: settings.primary_color = str(data['primary_color'])
        
        # OIDC
        if 'oidc_enabled' in data: settings.oidc_enabled = bool(data['oidc_enabled'])
        if 'oidc_discovery_url' in data: settings.oidc_discovery_url = str(data['oidc_discovery_url'])
        if 'oidc_client_id' in data: settings.oidc_client_id = str(data['oidc_client_id'])
        if 'oidc_client_secret' in data: settings.oidc_client_secret = str(data['oidc_client_secret'])
        
        # Google Drive
        if 'gdrive_client_id' in data: settings.gdrive_client_id = str(data['gdrive_client_id'])
        if 'gdrive_client_secret' in data: settings.gdrive_client_secret = str(data['gdrive_client_secret'])
        if 'gdrive_folder_name' in data: settings.gdrive_folder_name = str(data['gdrive_folder_name'])
        if 'gdrive_backup_frequency' in data: settings.gdrive_backup_frequency = int(data['gdrive_backup_frequency'])
        if 'gdrive_backup_time' in data: settings.gdrive_backup_time = str(data['gdrive_backup_time'])
        if 'gdrive_retention_days' in data: settings.gdrive_retention_days = int(data['gdrive_retention_days'])

        db.commit()
        db.refresh(settings)
        return {"status": "updated"}
        
    except Exception as e:
        logger.error(f"Błąd zapisu ustawień: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))