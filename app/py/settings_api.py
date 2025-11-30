import logging
from fastapi import APIRouter, Request, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from sqlalchemy import text 
from .database import get_db, Settings, engine

logger = logging.getLogger("SettingsAPI")
router = APIRouter()

def ensure_columns():
    """
    Sprawdza i dodaje brakujące kolumny (surowe połączenie).
    """
    try:
        with engine.connect() as connection:
            columns_info = connection.execute(text("PRAGMA table_info(settings)")).fetchall()
            existing_columns = [col[1] for col in columns_info]
            
            def add_if_missing(col_name, col_type, default):
                if col_name not in existing_columns:
                    logger.info(f"Migracja: Dodawanie kolumny '{col_name}'...")
                    try:
                        connection.execute(text(f"ALTER TABLE settings ADD COLUMN {col_name} {col_type} DEFAULT {default}"))
                        connection.commit()
                    except Exception as ex:
                        logger.error(f"Błąd dodawania kolumny {col_name}: {ex}")

            add_if_missing("unit", "VARCHAR", "'mbps'")
            add_if_missing("primary_color", "VARCHAR", "'#6200ea'")
            add_if_missing("oidc_enabled", "BOOLEAN", "0")
            add_if_missing("oidc_discovery_url", "VARCHAR", "''")
            add_if_missing("oidc_client_id", "VARCHAR", "''")
            add_if_missing("oidc_client_secret", "VARCHAR", "''")
            
    except Exception as e:
        logger.error(f"Krytyczny błąd migracji (engine): {e}")

@router.get("/api/settings")
def get_settings(response: Response, db: Session = Depends(get_db)):
    """Pobiera ustawienia."""
    
    # 1. WYMUSZENIE BRAKU CACHE (Kluczowa poprawka)
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

        # 2. RĘCZNE MAPOWANIE DO SŁOWNIKA
        # To gwarantuje, że FastAPI zwróci dokładnie te pola, nawet jeśli Pydantic/SQLAlchemy "zgłupieją"
        return {
            "id": settings.id,
            "lang": settings.lang,
            "theme": settings.theme,
            "unit": settings.unit,
            "primary_color": settings.primary_color,
            # Pola OIDC - jawnie pobierane z obiektu
            "oidc_enabled": settings.oidc_enabled,
            "oidc_discovery_url": settings.oidc_discovery_url,
            "oidc_client_id": settings.oidc_client_id,
            "oidc_client_secret": settings.oidc_client_secret
        }

    except Exception as e:
        logger.error(f"Błąd pobierania ustawień: {e}")
        # Fallback w razie błędu bazy
        return {
            "id": 1, "lang": "en", "theme": "dark", 
            "oidc_enabled": False, "oidc_discovery_url": "", "oidc_client_id": "", "oidc_client_secret": ""
        }

@router.post("/api/settings")
async def update_settings(request: Request, db: Session = Depends(get_db)):
    """Aktualizuje ustawienia."""
    ensure_columns()

    try:
        data = await request.json()
        logger.info(f"Zapisywanie ustawień: {data}")

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
        if 'oidc_enabled' in data: 
            settings.oidc_enabled = bool(data['oidc_enabled'])
        if 'oidc_discovery_url' in data: 
            val = data['oidc_discovery_url']
            settings.oidc_discovery_url = str(val) if val is not None else ""
        if 'oidc_client_id' in data: 
            val = data['oidc_client_id']
            settings.oidc_client_id = str(val) if val is not None else ""
        if 'oidc_client_secret' in data: 
            val = data['oidc_client_secret']
            settings.oidc_client_secret = str(val) if val is not None else ""
        
        db.commit()
        db.refresh(settings)
        return {"status": "updated"}
        
    except Exception as e:
        logger.error(f"Błąd zapisu ustawień: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))