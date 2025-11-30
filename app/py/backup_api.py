import os
import shutil
import datetime
import logging
import json
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from .database import get_db, Settings, DB_PATH, BASE_DIR, engine # Importujemy engine

# Biblioteki Google
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

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

        # CRITICAL FIX: Zamykamy wszystkie połączenia do starej bazy
        engine.dispose()

        # Nadpisujemy plik bazy
        shutil.move(temp_path, DB_PATH)
        
        # Ponownie czyścimy pulę połączeń, aby nowe zapytania otworzyły nowy plik
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
        settings.gdrive_token_json = None # Używamy None zamiast pustego stringa
        settings.gdrive_status = "Niepołączono" # Resetujemy status na bardziej czytelny
        settings.gdrive_enabled = False
        db.add(settings) # Upewniamy się, że sesja widzi zmiany
        db.commit()
        db.refresh(settings) # Odświeżamy obiekt z bazy
    return {"status": "disconnected"}


@router.post("/api/backup/google/test")
async def test_google_backup(db: Session = Depends(get_db)):
    """Ręczne wywołanie backupu na Google Drive."""
    settings = db.query(Settings).filter(Settings.id == 1).first()
    
    if not settings.gdrive_token_json or not settings.gdrive_enabled:
        return JSONResponse(status_code=400, content={"status": "error", "message": "Brak autoryzacji Google Drive"})

    try:
        creds = Credentials.from_authorized_user_info(json.loads(settings.gdrive_token_json), SCOPES)
        service = build('drive', 'v3', credentials=creds)
        
        folder_id = None
        folder_name = settings.gdrive_folder_name or "LocalSpeed_Backup"
        
        q = f"mimeType='application/vnd.google-apps.folder' and name='{folder_name}' and trashed=false"
        results = service.files().list(q=q, spaces='drive', fields='files(id, name)').execute()
        items = results.get('files', [])
        
        if not items:
            file_metadata = { 'name': folder_name, 'mimeType': 'application/vnd.google-apps.folder' }
            file = service.files().create(body=file_metadata, fields='id').execute()
            folder_id = file.get('id')
        else:
            folder_id = items[0]['id']

        timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M")
        file_name = f"localspeed_backup_{timestamp}.sql"
        
        file_metadata = { 'name': file_name, 'parents': [folder_id] }
        media = MediaFileUpload(DB_PATH, mimetype='application/octet-stream', resumable=True)
        
        uploaded_file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id'
        ).execute()

        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        settings.gdrive_last_backup = now_str
        settings.gdrive_status = "Sukces"
        db.commit()
        
        return {"status": "success", "file_id": uploaded_file.get('id'), "last_backup": now_str}

    except Exception as e:
        logger.error(f"GDrive Upload Error: {e}")
        settings.gdrive_status = f"Błąd: {str(e)[:50]}"
        db.commit()
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

@router.get("/api/backup/status")
async def get_backup_status(response: Response, db: Session = Depends(get_db)):
    """Zwraca status ostatniego backupu."""
    
    # Dodajemy nagłówki, aby przeglądarka nie cache'owała statusu połączenia
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"

    settings = db.query(Settings).filter(Settings.id == 1).first()
    if not settings: return {}
    
    # FIX: Sprawdzamy nie tylko czy token istnieje, ale też czy funkcja jest włączona.
    # Używamy (is not None) i (len > 0), żeby wyeliminować puste stringi.
    has_token = settings.gdrive_token_json is not None and len(settings.gdrive_token_json) > 10
    connected = settings.gdrive_enabled and has_token
    
    return {
        "last_backup": settings.gdrive_last_backup or "Brak",
        "status": settings.gdrive_status or "Niepołączono",
        "next_backup_time": settings.gdrive_backup_time,
        "next_backup_freq": settings.gdrive_backup_frequency,
        "connected": connected
    }