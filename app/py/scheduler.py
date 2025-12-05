import logging
import datetime
import os
import sys
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.orm import Session
from .database import SessionLocal, Settings
from .backup_service import perform_backup_logic

logger = logging.getLogger("Scheduler")

scheduler = AsyncIOScheduler()

# --- OBSŁUGA BLOKOWANIA PLIKÓW (Cross-Platform) ---
# fcntl działa tylko na Unix/Linux. Na Windows musimy to pominąć lub użyć msvcrt (ale tutaj po prostu pominiemy blokadę dla dev).
_lock_handle = None
HAS_FCNTL = False

try:
    import fcntl
    HAS_FCNTL = True
except ImportError:
    HAS_FCNTL = False
    logger.warning("Biblioteka 'fcntl' niedostępna (Windows?). Mechanizm blokady schedulera wyłączony.")

def check_and_run_backup():
    """
    Funkcja uruchamiana cyklicznie (co 60 sekund).
    Sprawdza, czy nadszedł czas na backup.
    """
    # Tworzymy nową sesję dla każdego wykonania zadania
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

        # A. Ustal punkt w czasie dla "dzisiejszego" backupu (np. dzisiaj 04:00)
        today_target_dt = datetime.datetime.combine(
            now.date(), 
            datetime.time(target_hour, target_minute)
        )
        
        # B. Czy minęła już godzina uruchomienia?
        is_past_target_time = now >= today_target_dt
        
        # C. Czy backup dla tego konkretnego "slotu" (dzisiaj po godzinie X) został już wykonany?
        already_done_for_this_slot = last_backup_dt >= today_target_dt

        # D. Sprawdzenie częstotliwości (Dni)
        days_since_last = (now.date() - last_backup_dt.date()).days
        is_freq_ok = days_since_last >= freq_days

        should_run = False
        
        if is_past_target_time and not already_done_for_this_slot:
            if is_freq_ok:
                should_run = True
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
    Próbuje uruchomić scheduler.
    """
    global _lock_handle
    lock_file = '/tmp/localspeed_scheduler.lock'
    
    # Jeśli nie mamy fcntl (np. Windows), uruchamiamy scheduler bez blokady
    # UWAGA: Przy wielu workerach na Windows spowoduje to wielokrotne uruchomienie schedulera.
    # W środowisku produkcyjnym (Linux/Docker) blokada zadziała.
    if not HAS_FCNTL:
        logger.info("Scheduler: Start bez blokady (Windows mode).")
        scheduler.add_job(check_and_run_backup, 'interval', seconds=60, jitter=5)
        scheduler.start()
        return

    try:
        # Otwieramy plik (tworzymy jeśli nie istnieje)
        _lock_handle = open(lock_file, 'w')
        
        # Próbujemy założyć blokadę WYŁĄCZNĄ (LOCK_EX) w trybie NIEBLOKUJĄCYM (LOCK_NB).
        fcntl.lockf(_lock_handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        
        # --- JEŚLI DOTARLIŚMY TUTAJ, TO JESTEŚMY WYBRANYM PROCESEM ---
        logger.info("Scheduler: Uzyskano blokadę (MASTER). Uruchamianie zegara co 60s.")
        
        scheduler.add_job(check_and_run_backup, 'interval', seconds=60, jitter=5)
        scheduler.start()
        
    except (IOError, BlockingIOError):
        logger.info("Scheduler: Ten proces jest Workerem (SLAVE). Scheduler NIE zostanie uruchomiony.")

def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()