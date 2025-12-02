import logging
import datetime
import fcntl # Biblioteka systemowa do blokowania plików (działa w Docker/Linux)
import os
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.orm import Session
from .database import SessionLocal, Settings
from .backup_service import perform_backup_logic

logger = logging.getLogger("Scheduler")

scheduler = AsyncIOScheduler()

# Zmienna globalna do trzymania "uchwytu" blokady. 
# Musi być globalna, żeby Python nie zamknął pliku (i nie zwolnił blokady) przez Garbage Collector.
_lock_handle = None 

def check_and_run_backup():
    """
    Funkcja uruchamiana cyklicznie (co 60 sekund).
    Sprawdza, czy nadszedł czas na backup.
    """
    db: Session = SessionLocal()
    try:
        settings = db.query(Settings).filter(Settings.id == 1).first()
        
        # 1. Sprawdź czy backup włączony
        if not settings or not settings.gdrive_enabled:
            return

        # 2. Pobierz konfigurację
        freq_days = settings.gdrive_backup_frequency or 1
        target_time_str = settings.gdrive_backup_time or "04:00"
        last_backup_str = settings.gdrive_last_backup

        # Parsowanie godziny docelowej
        try:
            target_hour, target_minute = map(int, target_time_str.split(':'))
        except ValueError:
            target_hour, target_minute = 4, 0

        now = datetime.datetime.now()
        
        # 3. Parsowanie daty ostatniego backupu
        if last_backup_str:
            try:
                # Format z bazy: "YYYY-MM-DD HH:MM:SS"
                last_backup_dt = datetime.datetime.strptime(last_backup_str, "%Y-%m-%d %H:%M:%S")
            except ValueError:
                last_backup_dt = now - datetime.timedelta(days=365)
        else:
            last_backup_dt = now - datetime.timedelta(days=365)

        # --- NOWA LOGIKA HARMONOGRAMU ---
        
        # A. Ustal punkt w czasie dla "dzisiejszego" backupu (np. dzisiaj 04:00)
        today_target_dt = datetime.datetime.combine(
            now.date(), 
            datetime.time(target_hour, target_minute)
        )
        
        # B. Czy minęła już godzina uruchomienia?
        is_past_target_time = now >= today_target_dt
        
        # C. Czy backup dla tego konkretnego "slotu" (dzisiaj po godzinie X) został już wykonany?
        # Jeśli ostatni backup był zrobiony PO czasie docelowym, to znaczy, że mamy to z głowy.
        already_done_for_this_slot = last_backup_dt >= today_target_dt

        # D. Sprawdzenie częstotliwości (Dni)
        days_since_last = (now.date() - last_backup_dt.date()).days
        is_freq_ok = days_since_last >= freq_days

        should_run = False
        
        if is_past_target_time and not already_done_for_this_slot:
            # Normalny tryb: minęło wystarczająco dni od ostatniego razu
            if is_freq_ok:
                should_run = True
            # Tryb "Catch-up" dla backupów codziennych (freq=1):
            # Jeśli backup jest ustawiony na codziennie (freq=1), a dzisiaj zrobiliśmy go wcześniej 
            # (np. o 01:29 bo testowaliśmy), ale teraz wybiła godzina harmonogramu (np. 01:47), 
            # to chcemy zrobić ten właściwy backup harmonogramowy.
            elif freq_days == 1 and days_since_last == 0:
                should_run = True

        if should_run:
            logger.info(f"Uruchamianie zaplanowanego backupu (Ostatni: {last_backup_str})...")
            perform_backup_logic(db)

    except Exception as e:
        logger.error(f"Scheduler Error: {e}")
    finally:
        db.close()

def start_scheduler():
    """
    Próbuje uruchomić scheduler. Dzięki mechanizmowi fcntl.lockf,
    tylko JEDEN proces z wielu (WEB_CONCURRENCY=8) faktycznie go uruchomi.
    """
    global _lock_handle
    lock_file = '/tmp/localspeed_scheduler.lock'
    
    try:
        # Otwieramy plik (tworzymy jeśli nie istnieje)
        _lock_handle = open(lock_file, 'w')
        
        # Próbujemy założyć blokadę WYŁĄCZNĄ (LOCK_EX) w trybie NIEBLOKUJĄCYM (LOCK_NB).
        # Jeśli inny proces już ma blokadę, ta funkcja rzuci wyjątek IOError/BlockingIOError.
        fcntl.lockf(_lock_handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        
        # --- JEŚLI DOTARLIŚMY TUTAJ, TO JESTEŚMY WYBRANYM PROCESEM ---
        logger.info("Scheduler: Uzyskano blokadę (MASTER). Uruchamianie zegara co 60s.")
        
        # ZMIANA: Przywracamy interwał 60 sekund (standardowy), aby nie spamować logami.
        scheduler.add_job(check_and_run_backup, 'interval', seconds=60, jitter=5)
        scheduler.start()
        
    except (IOError, BlockingIOError):
        # Inny proces już trzyma blokadę. To normalne przy wielu workerach.
        logger.info("Scheduler: Ten proces jest Workerem (SLAVE). Scheduler NIE zostanie uruchomiony.")
        # Nie zamykamy _lock_handle, po prostu pozwalamy mu istnieć, ale nie startujemy schedulera.

def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()