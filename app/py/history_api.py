import datetime
import logging
import csv
import io
from typing import List
from fastapi import APIRouter, Request, Depends, Body
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc, text, inspect
from .database import get_db, SpeedResult, engine

logger = logging.getLogger("LocalSpeedHistoryAPI")
router = APIRouter()

# --- MIGRACJA DLA TABELI WYNIKÓW ---
def ensure_results_columns():
    """Sprawdza i dodaje brakujące kolumny w tabeli results."""
    try:
        inspector = inspect(engine)
        if not inspector.has_table("results"): return

        columns_info = inspector.get_columns("results")
        existing_columns = [col['name'] for col in columns_info]
        
        if "mode" not in existing_columns:
            logger.info("Migracja: Dodawanie kolumny 'mode' do tabeli results...")
            try:
                with engine.connect() as connection:
                    # SQLite i MySQL wspierają ADD COLUMN
                    connection.execute(text(f"ALTER TABLE results ADD COLUMN mode VARCHAR(10) DEFAULT 'Multi'"))
                    connection.commit()
            except Exception as ex:
                logger.error(f"Błąd dodawania kolumny mode: {ex}")
    except Exception as e:
        logger.error(f"Błąd migracji results: {e}")

# Wywołujemy migrację przy imporcie modułu (lub pierwszym użyciu)
ensure_results_columns()

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
    
    sort_column = SpeedResult.date 
    if sort_by == 'ping': sort_column = SpeedResult.ping
    elif sort_by == 'download': sort_column = SpeedResult.download
    elif sort_by == 'upload': sort_column = SpeedResult.upload
    elif sort_by == 'mode': sort_column = SpeedResult.mode # Sortowanie po trybie
    
    sort_func = desc if order == 'desc' else asc

    try:
        total_count = db.query(func.count(SpeedResult.id)).scalar()
        
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
        
        new_result = SpeedResult(
            ping=data['ping'],
            download=data['download'],
            upload=data['upload'],
            lang=data.get('lang', 'pl'),
            theme=data.get('theme', 'dark'),
            mode=data.get('mode', 'Multi'), # Zapisujemy tryb
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
    try:
        if not ids: return {"status": "no_ids_provided"}
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
    h_mode: str = 'Mode', # Nowy nagłówek
    h_ping: str = 'Ping',
    h_down: str = 'Download', 
    h_up: str = 'Upload', 
    db: Session = Depends(get_db)
):
    try:
        results = db.query(SpeedResult).order_by(desc(SpeedResult.date)).all()
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        is_mbs = (unit == 'mbs')
        unit_label = 'MB/s' if is_mbs else 'Mbps'
        
        # Zaktualizowany nagłówek CSV
        writer.writerow([h_date, h_mode, f'{h_ping} (ms)', f'{h_down} ({unit_label})', f'{h_up} ({unit_label})'])
        
        for row in results:
            down_val = row.download / 8.0 if is_mbs else row.download
            up_val = row.upload / 8.0 if is_mbs else row.upload
            mode_val = row.mode if row.mode else "Multi"
            
            writer.writerow([
                row.date, 
                mode_val,
                f"{row.ping:.2f}", 
                f"{down_val:.2f}", 
                f"{up_val:.2f}"
            ])
            
        output.seek(0)
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        filename = f"localspeed_history_{timestamp}.csv"
        
        response = StreamingResponse(iter([output.getvalue()]), media_type="text/csv")
        response.headers["Content-Disposition"] = f"attachment; filename={filename}"
        return response
        
    except Exception as e:
        logger.error(f"Błąd eksportu CSV: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})