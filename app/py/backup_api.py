import os
import shutil
import datetime
import logging
import json
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from .database import get_db, Settings, DB_PATH, BASE_DIR, engine

# Biblioteki Google
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

# Import wspólnej logiki
from .backup_service import perform_backup_logic

logger = logging.getLogger("BackupAPI")
router = APIRouter()

SCOPES = ['https://www.googleapis.com/auth/drive.file']

# --- LOKALNA KOPIA ZAPASOWA ---

@router.get("/api/backup/download")
async def download_backup():
    """Pobiera plik bazy danych jako SQL/DB."""
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=404, detail="Database file not found")
    
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M")
    filename = f"localspeed_backup_{timestamp}.sql"
    
    return FileResponse(
        path=DB_PATH,
        filename=filename,
        media_type='application/octet-stream',
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache"
        }
    )

@router.post("/api/backup/restore")
async def restore_backup(file: UploadFile = File(...)):
    """Nadpisuje bazę danych przesłanym plikiem."""
    try:
        temp_path = os.path.join(BASE_DIR, "restore_temp.db")
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        with open(temp_path, "rb") as f:
            header = f.read(16)
            if b"SQLite format 3" not in header:
                os.remove(temp_path)
                raise HTTPException(status_code=400, detail="Invalid database file format")

        engine.dispose()
        shutil.move(temp_path, DB_PATH)
        engine.dispose()
        
        logger.info("Baza danych została przywrócona i połączenia zrestartowane.")
        return {"status": "success", "message": "Database restored successfully"}
        
    except Exception as e:
        logger.error(f"Błąd przywracania bazy: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- GOOGLE DRIVE OAUTH FLOW ---

@router.get("/api/backup/google/auth")
async def google_auth_start(request: Request, db: Session = Depends(get_db)):
    """1. Rozpoczyna proces logowania do Google Drive."""
    settings = db.query(Settings).filter(Settings.id == 1).first()
    
    if not settings.gdrive_client_id or not settings.gdrive_client_secret:
        return RedirectResponse("/settings.html?error=missing_gdrive_config")

    client_config = {
        "web": {
            "client_id": settings.gdrive_client_id,
            "client_secret": settings.gdrive_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }

    base_url = str(request.base_url).rstrip('/')
    redirect_uri = f"{base_url}/api/backup/google/callback"
    if request.headers.get("x-forwarded-proto") == "https":
        redirect_uri = redirect_uri.replace("http://", "https://")

    try:
        flow = Flow.from_client_config(
            client_config,
            scopes=SCOPES,
            redirect_uri=redirect_uri
        )
        
        authorization_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            prompt='consent' 
        )
        
        request.session["gdrive_state"] = state
        return RedirectResponse(authorization_url)
        
    except Exception as e:
        logger.error(f"OAuth Init Error: {e}")
        return RedirectResponse(f"/settings.html?error=oauth_init_failed&msg={str(e)}")


@router.get("/api/backup/google/callback")
async def google_auth_callback(request: Request, code: str = None, error: str = None, state: str = None, db: Session = Depends(get_db)):
    """2. Odbiera kod z Google i wymienia na tokeny."""
    if error:
        return RedirectResponse(f"/settings.html?error=gdrive_denied&msg={error}")
    
    settings = db.query(Settings).filter(Settings.id == 1).first()
    
    client_config = {
        "web": {
            "client_id": settings.gdrive_client_id,
            "client_secret": settings.gdrive_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }
    
    base_url = str(request.base_url).rstrip('/')
    redirect_uri = f"{base_url}/api/backup/google/callback"
    if request.headers.get("x-forwarded-proto") == "https":
        redirect_uri = redirect_uri.replace("http://", "https://")

    try:
        flow = Flow.from_client_config(
            client_config,
            scopes=SCOPES,
            redirect_uri=redirect_uri,
            state=state
        )
        
        flow.fetch_token(code=code)
        creds = flow.credentials
        
        settings.gdrive_token_json = creds.to_json()
        settings.gdrive_status = "Połączono pomyślnie"
        settings.gdrive_enabled = True 
        db.commit()
        
        return RedirectResponse("/settings.html?gdrive_auth=success")
        
    except Exception as e:
        logger.error(f"OAuth Callback Error: {e}")
        return RedirectResponse(f"/settings.html?error=oauth_callback_failed&msg={str(e)}")


@router.post("/api/backup/google/disconnect")
async def google_disconnect(db: Session = Depends(get_db)):
    """Rozłącza konto Google."""
    settings = db.query(Settings).filter(Settings.id == 1).first()
    if settings:
        settings.gdrive_token_json = None
        settings.gdrive_status = "Niepołączono"
        settings.gdrive_enabled = False
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return {"status": "disconnected"}


@router.post("/api/backup/google/test")
async def test_google_backup(db: Session = Depends(get_db)):
    """Ręczne wywołanie backupu (Button: Wyślij teraz)."""
    try:
        # Używamy nowej funkcji z backup_service
        result = perform_backup_logic(db)
        if result['status'] == 'skipped':
             return JSONResponse(status_code=400, content={"status": "error", "message": result['message']})
        
        return result
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})


@router.get("/api/backup/status")
async def get_backup_status(response: Response, db: Session = Depends(get_db)):
    """Zwraca status ostatniego backupu."""
    
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"

    settings = db.query(Settings).filter(Settings.id == 1).first()
    if not settings: return {}
    
    has_token = settings.gdrive_token_json is not None and len(settings.gdrive_token_json) > 10
    connected = settings.gdrive_enabled and has_token
    
    return {
        "last_backup": settings.gdrive_last_backup or "Brak",
        "status": settings.gdrive_status or "Niepołączono",
        "next_backup_time": settings.gdrive_backup_time,
        "next_backup_freq": settings.gdrive_backup_frequency,
        "connected": connected
    }