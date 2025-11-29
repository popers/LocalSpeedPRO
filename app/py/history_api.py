# Moduł obsługujący endpointy API dla historii pomiarów

import datetime
import logging
from fastapi import APIRouter, Request, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc
from .database import get_db, SpeedResult # Zmieniono na poprawny import względny

logger = logging.getLogger("LocalSpeedHistoryAPI")
router = APIRouter()

@router.get("/api/history")
def read_history(
    page: int = 1, 
    limit: int = 10, 
    sort_by: str = 'date', 
    order: str = 'desc',
    db: Session = Depends(get_db)
):
    """Pobiera historię pomiarów z paginacją i sortowaniem."""
    offset = (page - 1) * limit
    
    # Mapowanie nazw kolumn z frontend na model SQLAlchemy
    sort_column = SpeedResult.date # Default
    if sort_by == 'ping': sort_column = SpeedResult.ping
    elif sort_by == 'download': sort_column = SpeedResult.download
    elif sort_by == 'upload': sort_column = SpeedResult.upload
    
    # Kierunek sortowania
    sort_func = desc if order == 'desc' else asc

    try:
        # Całkowita liczba rekordów (do paginacji)
        total_count = db.query(func.count(SpeedResult.id)).scalar()
        
        # Zapytanie z sortowaniem i paginacją
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

@router.post("/api/history")
async def save_result(request: Request, db: Session = Depends(get_db)):
    """Zapisuje nowy wynik testu do bazy danych."""
    try:
        data = await request.json()
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Walidacja i konwersja do modelu
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