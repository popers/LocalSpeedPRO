import json
import logging
import datetime
from sqlalchemy.orm import Session
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from .database import Settings, SpeedResult
import io

logger = logging.getLogger("BackupService")
SCOPES = ['https://www.googleapis.com/auth/drive.file']

def generate_sql_dump(db: Session) -> str:
    """
    Generuje prosty zrzut SQL (INSERTY) dla tabel settings i results.
    """
    lines = []
    lines.append("-- LocalSpeed Pro SQL Dump")
    lines.append(f"-- Created: {datetime.datetime.now()}")
    lines.append("")
    
    # 1. Settings
    settings = db.query(Settings).filter(Settings.id == 1).first()
    if settings:
        def fmt(val):
            if val is None: return "NULL"
            if isinstance(val, bool): return "1" if val else "0"
            if isinstance(val, (int, float)): return str(val)
            safe_str = str(val).replace("'", "''")
            return f"'{safe_str}'"

        cols = [
            "id", "lang", "theme", "unit", "primary_color", 
            "oidc_enabled", "oidc_discovery_url", "oidc_client_id", "oidc_client_secret",
            "gdrive_enabled", "gdrive_client_id", "gdrive_client_secret", "gdrive_folder_name",
            "gdrive_backup_frequency", "gdrive_backup_time", "gdrive_retention_days", "gdrive_token_json"
        ]
        
        vals = []
        for col in cols:
            vals.append(fmt(getattr(settings, col)))
            
        cols_str = ", ".join(cols)
        vals_str = ", ".join(vals)
        
        lines.append(f"INSERT INTO settings ({cols_str}) VALUES ({vals_str});")
    
    lines.append("")
    
    # 2. Results
    results = db.query(SpeedResult).all()
    for res in results:
        # id, date, ping, download, upload, lang, theme, mode
        date_safe = str(res.date).replace("'", "''")
        lang_safe = str(res.lang).replace("'", "''")
        theme_safe = str(res.theme).replace("'", "''")
        mode_safe = str(res.mode or 'Multi').replace("'", "''")
        
        lines.append(
            f"INSERT INTO results (id, date, ping, download, upload, lang, theme, mode) "
            f"VALUES ({res.id}, '{date_safe}', {res.ping}, {res.download}, {res.upload}, '{lang_safe}', '{theme_safe}', '{mode_safe}');"
        )
        
    return "\n".join(lines)

def cleanup_old_backups(service, folder_id, retention_days):
    if not retention_days or retention_days <= 0:
        return 0

    deleted_count = 0
    try:
        cutoff_date = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=retention_days)
        cutoff_str = cutoff_date.isoformat()

        logger.info(f"Retencja: Sprawdzanie plików starszych niż {cutoff_str} (dni: {retention_days})")

        q = f"'{folder_id}' in parents and trashed = false and createdTime < '{cutoff_str}'"
        results = service.files().list(q=q, spaces='drive', fields='files(id, name, createdTime)').execute()
        files = results.get('files', [])

        for f in files:
            logger.info(f"Retencja: Usuwanie starego pliku: {f['name']} (ID: {f['id']}, Data: {f['createdTime']})")
            try:
                service.files().delete(fileId=f['id']).execute()
                deleted_count += 1
            except Exception as e_del:
                logger.error(f"Nie udało się usunąć pliku {f['id']}: {e_del}")
            
    except Exception as e:
        logger.warning(f"Błąd procesu retencji (nie krytyczny): {e}")
    
    if deleted_count > 0:
        logger.info(f"Retencja: Usunięto łącznie {deleted_count} starych plików.")
    
    return deleted_count

def perform_backup_logic(db: Session):
    settings = db.query(Settings).filter(Settings.id == 1).first()
    
    if not settings:
        return {"status": "error", "message": "Settings not found"}

    if not settings.gdrive_token_json or not settings.gdrive_enabled:
        return {"status": "skipped", "message": "GDrive disabled or token missing"}

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

        sql_content = generate_sql_dump(db)
        
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M")
        file_name = f"localspeed_backup_{timestamp}.sql"
        
        fh = io.BytesIO(sql_content.encode('utf-8'))
        media = MediaIoBaseUpload(fh, mimetype='application/sql', resumable=True)
        
        file_metadata = { 'name': file_name, 'parents': [folder_id] }
        
        uploaded_file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id'
        ).execute()

        retention_days = settings.gdrive_retention_days
        if retention_days and retention_days > 0:
            cleanup_old_backups(service, folder_id, retention_days)

        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        settings.gdrive_last_backup = now_str
        # ZMIANA: Usunięto dopisek (Auto)
        settings.gdrive_status = "Sukces"
        db.commit()
        
        logger.info(f"Backup auto-run success: {file_name}")
        return {"status": "success", "file_id": uploaded_file.get('id'), "timestamp": now_str}

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Backup Service Error: {error_msg}")
        settings.gdrive_status = f"Błąd Auto: {error_msg[:50]}"
        db.commit()
        raise e