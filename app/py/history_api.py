# Moduł obsługujący endpointy API dla historii pomiarów

import datetime
import logging
import csv
import io
from typing import List
from fastapi import APIRouter, Request, Depends, Body
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc
from .database import get_db, SpeedResult

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

@router.delete("/api/history")
async def delete_results(ids: List[int] = Body(...), db: Session = Depends(get_db)):
    """Usuwa wybrane wyniki z bazy danych."""
    try:
        if not ids:
            return {"status": "no_ids_provided"}
            
        # Usuwanie rekordów, których ID znajduje się na liście
        db.query(SpeedResult).filter(SpeedResult.id.in_(ids)).delete(synchronize_session=False)
        db.commit()
        return {"status": "deleted", "count": len(ids)}
    except Exception as e:
        logger.error(f"Błąd usuwania historii: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@router.get("/api/history/export")
def export_history_csv(db: Session = Depends(get_db)):
    """Generuje i zwraca plik CSV z całą historią."""
    try:
        # Pobieramy wszystkie dane, sortując od najnowszych
        results = db.query(SpeedResult).order_by(desc(SpeedResult.date)).all()
        
        # Tworzymy strumień w pamięci
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Nagłówki
        writer.writerow(['ID', 'Date', 'Ping (ms)', 'Download (Mbps)', 'Upload (Mbps)'])
        
        # Dane
        for row in results:
            writer.writerow([
                row.id, 
                row.date, 
                f"{row.ping:.2f}", 
                f"{row.download:.2f}", 
                f"{row.upload:.2f}"
            ])
            
        output.seek(0)
        
        response = StreamingResponse(iter([output.getvalue()]), media_type="text/csv")
        response.headers["Content-Disposition"] = "attachment; filename=localspeed_history.csv"
        return response
        
    except Exception as e:
        logger.error(f"Błąd eksportu CSV: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})