# Moduł obsługujący endpointy API dla ustawień aplikacji

import logging
from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text 
from .database import get_db, Settings

logger = logging.getLogger("SettingsAPI")
router = APIRouter()

def ensure_columns(db: Session):
    """
    Sprawdza, czy nowe kolumny (unit, primary_color) istnieją w tabeli 'settings'. 
    Jeśli nie, dodaje je (prosta migracja dla SQLite).
    """
    try:
        # Sprawdzamy unit
        try:
            db.execute(text("SELECT unit FROM settings LIMIT 1")).all()
        except Exception:
            logger.warning("Kolumna 'unit' brakująca. Dodawanie...")
            db.execute(text("ALTER TABLE settings ADD COLUMN unit VARCHAR DEFAULT 'mbps'"))
            db.commit()

        # Sprawdzamy primary_color
        try:
            db.execute(text("SELECT primary_color FROM settings LIMIT 1")).all()
        except Exception:
            logger.warning("Kolumna 'primary_color' brakująca. Dodawanie...")
            db.execute(text("ALTER TABLE settings ADD COLUMN primary_color VARCHAR DEFAULT '#6200ea'"))
            db.commit()
            
    except Exception as e:
        logger.error(f"Błąd migracji bazy: {e}")
        db.rollback()

@router.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
    """Pobiera aktualne ustawienia z bazy danych."""
    
    # Upewniamy się, że kolumny istnieją
    ensure_columns(db)
    
    settings = db.query(Settings).filter(Settings.id == 1).first()
    if not settings:
        settings = Settings(id=1, lang="en", theme="dark", unit="mbps", primary_color="#6200ea")
        db.add(settings)
        db.commit()
    return settings

@router.post("/api/settings")
async def update_settings(request: Request, db: Session = Depends(get_db)):
    """Aktualizuje ustawienia na podstawie danych JSON otrzymanych od klienta."""
    
    ensure_columns(db)

    data = await request.json()
    settings = db.query(Settings).filter(Settings.id == 1).first()
    
    if not settings:
        settings = Settings(id=1)
        db.add(settings)
    
    if 'lang' in data: settings.lang = data['lang']
    if 'theme' in data: settings.theme = data['theme']
    if 'unit' in data: settings.unit = data['unit']
    if 'primary_color' in data: settings.primary_color = data['primary_color']
    
    db.commit()
    return {"status": "updated"}