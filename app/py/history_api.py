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
def export_history_csv(
    unit: str = 'mbps', 
    h_date: str = 'Date', 
    h_ping: str = 'Ping',
    h_down: str = 'Download', 
    h_up: str = 'Upload', 
    db: Session = Depends(get_db)
):
    """
    Generuje i zwraca plik CSV z całą historią.
    Parametr unit='mbs' konwertuje wartości na MB/s.
    Parametry h_* pozwalają na tłumaczenie nagłówków kolumn.
    Nazwa pliku zawiera teraz znacznik czasu.
    """
    try:
        # Pobieramy wszystkie dane, sortując od najnowszych
        results = db.query(SpeedResult).order_by(desc(SpeedResult.date)).all()
        
        # Tworzymy strumień w pamięci
        output = io.StringIO()
        writer = csv.writer(output)
        
        is_mbs = (unit == 'mbs')
        unit_label = 'MB/s' if is_mbs else 'Mbps'
        
        # Nagłówki z uwzględnieniem jednostki i języka.
        writer.writerow([h_date, f'{h_ping} (ms)', f'{h_down} ({unit_label})', f'{h_up} ({unit_label})'])
        
        # Dane
        for row in results:
            # Konwersja jeśli potrzebna (baza trzyma dane w Mbps)
            down_val = row.download / 8.0 if is_mbs else row.download
            up_val = row.upload / 8.0 if is_mbs else row.upload
            
            writer.writerow([
                row.date, 
                f"{row.ping:.2f}", 
                f"{down_val:.2f}", 
                f"{up_val:.2f}"
            ])
            
        output.seek(0)
        
        # Generowanie nazwy pliku z datą i godziną (np. localspeed_history_2023-11-29_14-30-00.csv)
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        filename = f"localspeed_history_{timestamp}.csv"
        
        response = StreamingResponse(iter([output.getvalue()]), media_type="text/csv")
        response.headers["Content-Disposition"] = f"attachment; filename={filename}"
        return response
        
    except Exception as e:
        logger.error(f"Błąd eksportu CSV: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})