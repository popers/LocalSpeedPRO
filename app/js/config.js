export const THREADS = 6; 
export const TEST_DURATION = 12000; 

export const translations = {
    pl: { 
        start: "START", 
        history_title: "Pomiary", 
        down: "Pobieranie", 
        up: "Wysyłanie", 
        
        table_date: "Data",
        table_ping: "Ping",
        table_down: "Pobieranie",
        table_up: "Wysyłanie",
        rows_label: "Na stronę:",
        
        btn_delete: "Usuń zaznaczone",
        btn_csv: "Eksport CSV",
        modal_delete_title: "Potwierdzenie",
        modal_delete_msg: "Czy na pewno chcesz usunąć zaznaczone wpisy?",
        modal_cancel: "Anuluj",
        modal_confirm: "Usuń",
        msg_deleted: "Usunięto wpisy.",

        gauge_title: "PRĘDKOŚĆ",

        log_start: "Start testu", 
        log_end: "Koniec testu", 
        err: "Błąd: ",
        msg_lang: "Zmieniono język",
        msg_theme_dark: "Motyw ciemny",
        msg_theme_light: "Motyw jasny",
        msg_unit_mbps: "Zmieniono jednostkę: Mbps",
        msg_unit_mbs: "Zmieniono jednostkę: MB/s",
        msg_color_saved: "Zapisano nowy kolor",
        msg_settings_saved: "Zapisano ustawienia",
        msg_backup_success: "Kopia zapasowa udana",

        // --- MENU ---
        nav_dashboard: "Panel Główny",
        nav_measurements: "Pomiary",
        nav_settings: "Ustawienia",

        // --- SETTINGS PAGE ---
        settings_title: "Ustawienia",
        settings_appearance: "Wygląd",
        settings_oidc_title: "Logowanie OIDC (SSO)",
        settings_oidc_desc: "Skonfiguruj logowanie przez OpenID Connect (np. Authentik, Keycloak, Google).",
        settings_backup_title: "Kopia Zapasowa",

        lbl_primary_color: "Kolor wiodący",
        lbl_oidc_enable: "Włącz logowanie OIDC",
        lbl_oidc_discovery: "Discovery URL (.well-known):",
        lbl_oidc_client_id: "Client ID:",
        lbl_oidc_secret: "Client Secret:",
        lbl_redirect: "Redirect URI (Callback) do wpisania u dostawcy:", // ZMIANA NA GENERYCZNĄ
        btn_reset_color: "Przywróć domyślny",

        // Backup translations
        backup_download_title: "Pobierz Kopię",
        backup_download_desc: "Pobierz plik SQL zawierający całą historię pomiarów oraz ustawienia.",
        btn_download_sql: "POBIERZ .SQL",
        backup_restore_title: "Przywróć Kopię",
        backup_restore_warn: "UWAGA: Przywrócenie kopii nadpisze wszystkie obecne dane!",
        btn_select_file: "Wybierz plik",
        btn_restore_file: "PRZYWRÓĆ Z PLIKU",
        no_file: "Brak wybranego pliku",

        gdrive_desc: "Automatycznie wysyłaj kopie zapasowe do folderu na Google Drive.",
        lbl_folder: "Nazwa folderu (Google Drive):",
        lbl_retention: "Retencja plików (dni):",
        lbl_freq: "Częstotliwość (co ile dni):",
        lbl_time: "Godzina backupu:",
        btn_save: "Zapisz", // NOWE
        btn_connect_account: "POŁĄCZ KONTO",
        btn_disconnect_account: "ODŁĄCZ KONTO",
        btn_backup_now: "WYŚLIJ TERAZ",
        help_gdrive_config: "Jak skonfigurować Client ID/Secret?",

        // --- LOGIN PAGE ---
        login_header: "LocalSpeed PRO",
        login_user: "Użytkownik",
        login_pass: "Hasło",
        login_btn: "Zaloguj się",
        login_oidc_btn: "Zaloguj przez OIDC",
        msg_login_success: "Zalogowano pomyślnie",
        msg_login_error: "Błędny login lub hasło",
        msg_logged_out: "Wylogowano pomyślnie",
        err_server: "Błąd połączenia z serwerem"
    },
    en: { 
        start: "START", 
        history_title: "Measurements", 
        down: "Download", 
        up: "Upload", 
        
        table_date: "Date",
        table_ping: "Ping",
        table_down: "Download",
        table_up: "Upload",
        rows_label: "Per page:",

        btn_delete: "Delete selected",
        btn_csv: "Export CSV",
        modal_delete_title: "Confirmation",
        modal_delete_msg: "Are you sure you want to delete selected entries?",
        modal_cancel: "Cancel",
        modal_confirm: "Delete",
        msg_deleted: "Entries deleted.",

        gauge_title: "SPEED",

        log_start: "Starting test", 
        log_end: "Test finished.", 
        err: "Error: ",
        msg_lang: "Language changed",
        msg_theme_dark: "Dark theme",
        msg_theme_light: "Light theme",
        msg_unit_mbps: "Unit changed: Mbps",
        msg_unit_mbs: "Unit changed: MB/s",
        msg_color_saved: "New color saved",
        msg_settings_saved: "Settings saved",
        msg_backup_success: "Backup successful",

        // --- MENU ---
        nav_dashboard: "Dashboard",
        nav_measurements: "Measurements",
        nav_settings: "Settings",

        // --- SETTINGS PAGE ---
        settings_title: "Settings",
        settings_appearance: "Appearance",
        settings_oidc_title: "OIDC Login (SSO)",
        settings_oidc_desc: "Configure OpenID Connect login (e.g. Authentik, Keycloak, Google).",
        settings_backup_title: "Backup",

        lbl_primary_color: "Primary Color",
        lbl_oidc_enable: "Enable OIDC Login",
        lbl_oidc_discovery: "Discovery URL (.well-known):",
        lbl_oidc_client_id: "Client ID:",
        lbl_oidc_secret: "Client Secret:",
        lbl_redirect: "Redirect URI (Callback) to register with provider:",
        btn_reset_color: "Reset to default",

        // Backup translations
        backup_download_title: "Download Backup",
        backup_download_desc: "Download SQL file containing all measurement history and settings.",
        btn_download_sql: "DOWNLOAD .SQL",
        backup_restore_title: "Restore Backup",
        backup_restore_warn: "WARNING: Restoring a backup will overwrite all current data!",
        btn_select_file: "Select file",
        btn_restore_file: "RESTORE FROM FILE",
        no_file: "No file selected",

        gdrive_desc: "Automatically send backups to a Google Drive folder.",
        lbl_folder: "Folder Name (Google Drive):",
        lbl_retention: "File Retention (days):",
        lbl_freq: "Frequency (every X days):",
        lbl_time: "Backup Time:",
        btn_save: "Save",
        btn_connect_account: "CONNECT ACCOUNT",
        btn_disconnect_account: "DISCONNECT ACCOUNT",
        btn_backup_now: "BACKUP NOW",
        help_gdrive_config: "How to configure Client ID/Secret?",

        // --- LOGIN PAGE ---
        login_header: "LocalSpeed PRO",
        login_user: "Username",
        login_pass: "Password",
        login_btn: "Log in",
        login_oidc_btn: "Log in with OIDC",
        msg_login_success: "Logged in successfully",
        msg_login_error: "Invalid username or password",
        msg_logged_out: "Logged out successfully",
        err_server: "Server connection error"
    }
};