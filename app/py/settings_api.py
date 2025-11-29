# Moduł obsługujący endpointy API dla ustawień aplikacji

import logging
from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text # Importujemy text do wykonania surowych zapytań SQL
from .database import get_db, Settings

logger = logging.getLogger("SettingsAPI")
router = APIRouter()

def ensure_unit_column(db: Session):
    """
    Sprawdza, czy kolumna 'unit' istnieje w tabeli 'settings'. 
    Jeśli nie, dodaje ją (obejście dla SQLite, gdy brakuje migracji).
    """
    try:
        # Próba odczytu czegokolwiek z kolumny unit
        db.execute(text("SELECT unit FROM settings LIMIT 1")).all()
    except Exception as e:
        # Jeśli błąd to "no such column: settings.unit"
        if "no such column" in str(e):
            logger.warning("Kolumna 'unit' nie istnieje w tabeli 'settings'. Dodawanie kolumny...")
            try:
                # Wykonanie ALTER TABLE ADD COLUMN
                db.execute(text("ALTER TABLE settings ADD COLUMN unit VARCHAR DEFAULT 'mbps'"))
                db.commit()
                logger.info("Kolumna 'unit' dodana pomyślnie.")
            except Exception as alter_e:
                logger.error(f"Nie udało się dodać kolumny 'unit': {alter_e}")
                # Może się zdarzyć, jeśli inna instancja ją dodała
                db.rollback()
        else:
            # Inny, nieoczekiwany błąd bazy danych
            raise HTTPException(status_code=500, detail="Database error during settings initialization.")

@router.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
    """Pobiera aktualne ustawienia (lang, theme, unit) z bazy danych."""
    
    # Próba naprawy schematu przed zapytaniem (tylko dla kolumny 'unit')
    ensure_unit_column(db)
    
    settings = db.query(Settings).filter(Settings.id == 1).first()
    if not settings:
        settings = Settings(id=1, lang="pl", theme="dark", unit="mbps")
        db.add(settings)
        db.commit()
    return settings

@router.post("/api/settings")
async def update_settings(request: Request, db: Session = Depends(get_db)):
    """Aktualizuje ustawienia na podstawie danych JSON otrzymanych od klienta."""
    
    # Próba naprawy schematu przed zapytaniem (tylko dla kolumny 'unit')
    ensure_unit_column(db)

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