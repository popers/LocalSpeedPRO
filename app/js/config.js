// --- KONFIGURACJA 2.5 GBIT ---
export const THREADS = 6; 
export const TEST_DURATION = 12000; 

export const translations = {
    pl: { 
        start: "START", 
        history_title: "Historia Pomiarów", 
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
        msg_deleted: "Usunięto wybrane wpisy.",

        gauge_title: "PRĘDKOŚĆ",

        log_start: "Start Testu...", 
        log_ping_start: "Mierzenie Pingu...", 
        log_ping_res: "Ping: ", 
        log_down_start: "Rozpoczynanie pobierania...", 
        log_up_start: "Rozpoczynanie wysyłania...", 
        log_end: "Koniec Testu", 
        err: "Błąd: ",
        msg_lang: "Zmieniono język na Polski",
        msg_theme_dark: "Ustawiono motyw ciemny",
        msg_theme_light: "Ustawiono motyw jasny",
        msg_unit_mbps: "Zmieniono jednostkę na Mbps",
        msg_unit_mbs: "Zmieniono jednostkę na MB/s"
    },
    en: { 
        start: "START", 
        history_title: "Measurement History", 
        down: "Download", 
        up: "Upload", 
        
        table_date: "Date",
        table_ping: "Ping",
        table_down: "Download",
        table_up: "Upload",
        rows_label: "Per page:",

        btn_delete: "Delete Selected",
        btn_csv: "Export CSV",
        modal_delete_title: "Confirmation",
        modal_delete_msg: "Are you sure you want to delete selected items?",
        modal_cancel: "Cancel",
        modal_confirm: "Delete",
        msg_deleted: "Selected items deleted.",

        gauge_title: "SPEED",

        log_start: "Starting Test...", 
        log_ping_start: "Pinging...", 
        log_ping_res: "Ping: ", 
        log_down_start: "Starting Download...", 
        log_up_start: "Starting Upload...", 
        log_end: "Test Finished.", 
        err: "Error: ",
        msg_lang: "Language changed to English",
        msg_theme_dark: "Dark theme enabled",
        msg_theme_light: "Light theme enabled",
        msg_unit_mbps: "Unit changed to Mbps",
        msg_unit_mbs: "Unit changed to MB/s"
    }
};