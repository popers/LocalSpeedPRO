import os
import json
import logging
import datetime
from sqlalchemy.orm import Session
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from .database import Settings, DB_PATH

logger = logging.getLogger("BackupService")
SCOPES = ['https://www.googleapis.com/auth/drive.file']

def perform_backup_logic(db: Session):
    """
    Logika wykonania backupu niezależna od żądań HTTP.
    Zwraca słownik ze statusem lub rzuca wyjątek.
    """
    settings = db.query(Settings).filter(Settings.id == 1).first()
    
    if not settings:
        return {"status": "error", "message": "Settings not found"}

    if not settings.gdrive_token_json or not settings.gdrive_enabled:
        return {"status": "skipped", "message": "GDrive disabled or token missing"}

    try:
        # Autoryzacja
        creds = Credentials.from_authorized_user_info(json.loads(settings.gdrive_token_json), SCOPES)
        service = build('drive', 'v3', credentials=creds)
        
        # Sprawdzenie/Tworzenie folderu
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

        # Upload pliku
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M")
        file_name = f"localspeed_backup_{timestamp}.sql"
        
        file_metadata = { 'name': file_name, 'parents': [folder_id] }
        media = MediaFileUpload(DB_PATH, mimetype='application/octet-stream', resumable=True)
        
        uploaded_file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id'
        ).execute()

        # Aktualizacja statusu w bazie
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        settings.gdrive_last_backup = now_str
        settings.gdrive_status = "Sukces (Auto)"
        db.commit()
        
        logger.info(f"Backup auto-run success: {file_name}")
        return {"status": "success", "file_id": uploaded_file.get('id'), "timestamp": now_str}

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Backup Service Error: {error_msg}")
        # Aktualizujemy status błędu w bazie
        settings.gdrive_status = f"Błąd Auto: {error_msg[:50]}"
        db.commit()
        raise e