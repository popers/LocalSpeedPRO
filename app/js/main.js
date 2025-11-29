import { 
    el, 
    log, 
    setLang, 
    setCurrentUnit, 
    lang, 
    currentUnit, 
    lastResultDown, 
    lastResultUp, 
    updateTexts, 
    updateThemeIcon,
    formatSpeed // DODANY IMPORT: Musimy zaimportować formatSpeed, aby użyć go tutaj
} from '/js/utils.js';
import { translations } from '/js/config.js';
import { initGauge, reloadGauge, getGaugeInstance } from '/js/gauge.js';
import { initCharts, resetCharts } from '/js/charts.js';
import { loadSettings, saveSettings, saveResult } from '/js/data_sync.js';
import { initHistoryEvents, loadHistory, updateStatTiles } from '/js/history_ui.js';
import { runPing, runDownload, runUpload } from '/js/speedtest.js';

// --- Główna funkcja uruchamiająca test ---
async function startTest() {
    const btn = el('start-btn');
    btn.disabled = true;
    el('speed-value').innerText = "0.00";
    reloadGauge(); // Resetuje zegar i skalę
    resetCharts();

    const gaugeInstance = getGaugeInstance();

    try {
        log(translations[lang].log_start);
        await new Promise(r => setTimeout(r, 800));

        // 1. PING
        log(translations[lang].log_ping_start);
        const ping = await runPing();
        el('ping-text').textContent = ping.toFixed(1);

        // 2. DOWNLOAD
        el('card-down').classList.add('active');
        log(translations[lang].log_down_start);
        
        const down = await runDownload(); 
        
        // Używamy formatSpeed, który teraz jest zaimportowany
        el('down-val').textContent = formatSpeed(down); 
        el('card-down').classList.remove('active');

        if (gaugeInstance) gaugeInstance.value = 0;
        el('speed-value').innerText = "0.00";
        await new Promise(r => setTimeout(r, 1000)); 

        // 3. UPLOAD
        el('card-up').classList.add('active');
        log(translations[lang].log_up_start);
        
        const up = await runUpload();
        
        // Używamy formatSpeed, który teraz jest zaimportowany
        el('up-val').textContent = formatSpeed(up);
        el('card-up').classList.remove('active');

        // 4. SAVE & CLEANUP
        log(translations[lang].log_end);
        await saveResult(ping, down, up);
        if (gaugeInstance) gaugeInstance.value = 0;
        el('speed-value').innerText = "0.00";
    } catch (error) {
        console.error(error);
        log(translations[lang].err + error.message);
    }
    btn.disabled = false;
}

// --- Obsługa zdarzeń i inicjalizacja aplikacji ---
window.onload = () => {
    // Krok 1: Wczytujemy z localStorage
    const savedTheme = localStorage.getItem('ls_theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
    setLang(localStorage.getItem('ls_lang') || 'pl');
    setCurrentUnit(localStorage.getItem('ls_unit') || 'mbps');
    updateThemeIcon(savedTheme);

    // Krok 2: Inicjalizacja komponentów UI
    initGauge();
    initCharts(); 
    initHistoryEvents();

    // Krok 3: Wczytujemy ustawienia z serwera i historię
    loadSettings().then(() => loadHistory());
    
    // --- OBSŁUGA ZDARZEŃ GLOBALNYCH ---
    el('start-btn').onclick = startTest;

    el('lang-toggle').onclick = () => { 
        const nextLang = lang === 'pl' ? 'en' : 'pl'; 
        setLang(nextLang);
        const currentTheme = document.body.getAttribute('data-theme');
        updateTexts(getGaugeInstance()); 
        saveSettings(nextLang, currentTheme, currentUnit);
        log(translations[lang].msg_lang);
    };
    
    el('theme-toggle').onclick = () => { 
        const current = document.body.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', next);
        updateThemeIcon(next);
        
        // Przeładowanie zegara po zmianie motywu
        reloadGauge(); 
        updateTexts(getGaugeInstance()); // Odświeżenie tekstów w zegarze

        saveSettings(lang, next, currentUnit);
        if(next === 'dark') log(translations[lang].msg_theme_dark);
        else log(translations[lang].msg_theme_light);
    };

    el('unit-toggle').onclick = () => {
        const nextUnit = (currentUnit === 'mbps') ? 'mbs' : 'mbps';
        setCurrentUnit(nextUnit);
        const currentTheme = document.body.getAttribute('data-theme');
        
        // Przeładowanie zegara i odświeżenie kafelków/historii
        reloadGauge(); 
        updateTexts(getGaugeInstance());
        updateStatTiles(lastResultDown, lastResultUp); // Aktualizacja kafelków po zmianie jednostki
        loadHistory(); 
        
        saveSettings(lang, currentTheme, nextUnit);
        if(nextUnit === 'mbps') log(translations[lang].msg_unit_mbps);
        else log(translations[lang].msg_unit_mbs);
    };

    // Zmiana rozmiaru okna
    let resizeTimeout;
    window.onresize = () => { clearTimeout(resizeTimeout); resizeTimeout = setTimeout(reloadGauge, 200); };
};