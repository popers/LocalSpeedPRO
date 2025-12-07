import { 
    el, 
    log, 
    setLang, 
    setCurrentUnit,
    setPrimaryColor,
    lang, 
    currentUnit, 
    lastResultDown, 
    lastResultUp, 
    updateTexts, 
    updateThemeIcon,
    formatSpeed,
    timeout 
} from '/js/utils.js';
import { translations, TEST_DURATION, THREADS, setThreads } from '/js/config.js';
import { initGauge, reloadGauge, getGaugeInstance, setIsResetting } from '/js/gauge.js'; // ZMIANA: Import setIsResetting
import { initCharts, resetCharts } from '/js/charts.js';
import { loadSettings, saveSettings, saveResult } from '/js/data_sync.js';
import { initHistoryEvents, loadHistory, updateStatTiles } from '/js/history_ui.js';
import { runPing, runDownload, runUpload } from '/js/speedtest.js';

// --- OBSŁUGA WYLOGOWANIA ---
async function handleLogout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login.html?logout=true';
    } catch (e) {
        console.error("Logout failed", e);
        window.location.href = '/login.html';
    }
}

// --- SPRAWDZENIE STATUSU AUTH DLA UI ---
async function checkAuthUI() {
    try {
        const res = await fetch('/api/auth/status');
        if(res.ok) {
            const data = await res.json();
            // Jeśli auth jest wyłączony, ukrywamy przycisk wylogowania
            if (data.auth_enabled === false) {
                const logoutBtn = el('logout-btn');
                if (logoutBtn) logoutBtn.style.display = 'none';
            }
        }
    } catch(e) { console.error("Auth check failed", e); }
}

// --- Główna funkcja uruchamiająca test ---
async function startTest() {
    const btn = el('start-btn');
    
    btn.disabled = true;
    btn.classList.add('loading'); 

    // Usunięto reset speed-value, bo elementu już nie ma
    
    try { reloadGauge(); } catch(e) { console.warn("Gauge error:", e); }
    try { resetCharts(); } catch(e) { console.warn("Charts error:", e); }

    // ZMIANA: Nie pobieramy gaugeInstance tutaj do zmiennej lokalnej,
    // bo może ona stać się nieaktualna w trakcie testu.

    let ping = 0, down = 0, up = 0;

    try {
        log(translations[lang].log_start);
        await new Promise(r => setTimeout(r, 800));

        // 1. PING
        ping = await Promise.race([runPing(), timeout(3000)]);
        if (typeof ping !== 'number') throw new Error("Ping timeout");
        el('ping-text').textContent = ping.toFixed(1);

        // 2. DOWNLOAD
        el('card-down').classList.add('active');
        down = await Promise.race([runDownload(), timeout(TEST_DURATION + 1000)]); 
        el('down-val').textContent = formatSpeed(down); 
        el('card-down').classList.remove('active');

        await new Promise(r => setTimeout(r, 200)); 

        // ZMIANA: Pobieramy aktualną instancję tuż przed użyciem
        let currentGauge = getGaugeInstance();
        if (currentGauge) {
            setIsResetting(true); 
            currentGauge.update({ animationDuration: 1200 }); 
            currentGauge.value = 0;
        }
        
        await new Promise(r => setTimeout(r, 1200)); 
        setIsResetting(false); 
        
        // Ponowne pobranie, na wypadek gdyby reloadGauge zadziałał w trakcie czekania
        currentGauge = getGaugeInstance();
        if (currentGauge) currentGauge.update({ animationDuration: 100 }); 

        // 3. UPLOAD
        el('card-up').classList.add('active');
        up = await Promise.race([runUpload(), timeout(TEST_DURATION + 1000)]);
        el('up-val').textContent = formatSpeed(up);
        el('card-up').classList.remove('active');

        await new Promise(r => setTimeout(r, 200)); 

        // ZMIANA: Ponownie pobieramy aktualną instancję dla Uploadu
        currentGauge = getGaugeInstance();
        if (currentGauge) {
            setIsResetting(true); 
            currentGauge.update({ animationDuration: 1200 });
            currentGauge.value = 0;
        }
        
        await new Promise(r => setTimeout(r, 1200));
        setIsResetting(false); 
        
        currentGauge = getGaugeInstance();
        if (currentGauge) currentGauge.update({ animationDuration: 100 }); 

        // 4. SAVE (Przekazujemy tryb)
        const currentMode = (THREADS > 1) ? "Multi" : "Single";
        await saveResult(ping, down, up, currentMode); 
        
    } catch (error) {
        console.error("Błąd podczas testu:", error);
        log(translations[lang].err + "Test przerwany: " + error.message);
        
        if(error.message.includes('401') || error.status === 401) {
            window.location.href = '/login.html';
        }

    } finally {
        btn.disabled = false;
        btn.classList.remove('loading'); 
        
        if (ping > 0 && down > 0 && up > 0) {
            // Sukces obsłużony w data_sync
        } else {
            log(translations[lang].log_end + " Przycisk odblokowany.");
        }
    }
}

function initMenu() {
    const sidebar = el('app-sidebar');
    const overlay = el('sidebar-overlay');
    const menuToggle = el('menu-toggle');
    const navDashboard = el('nav-dashboard');
    const navHistory = el('nav-history');

    function closeMenu() {
        if(sidebar) sidebar.classList.remove('open');
        if(overlay) overlay.classList.remove('active');
        document.body.classList.remove('menu-open');
    }

    function openMenu() {
        if(sidebar) sidebar.classList.add('open');
        if(overlay) overlay.classList.add('active');
        document.body.classList.add('menu-open');
    }

    if(menuToggle) {
        menuToggle.onclick = () => {
            if (sidebar && sidebar.classList.contains('open')) closeMenu();
            else openMenu();
        };
    }
    if(overlay) overlay.onclick = closeMenu;

    if(navDashboard) {
        navDashboard.onclick = (e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            closeMenu();
            navDashboard.classList.add('active');
            if(navHistory) navHistory.classList.remove('active');
        };
    }

    if(navHistory) {
        navHistory.onclick = (e) => {
            e.preventDefault();
            const section = el('history-section');
            if(section) {
                section.scrollIntoView({ behavior: 'smooth' });
                closeMenu();
                navHistory.classList.add('active');
                if(navDashboard) navDashboard.classList.remove('active');
            }
        };
    }
    
    if(navDashboard) navDashboard.classList.add('active');
}

window.onload = () => {
    const savedTheme = localStorage.getItem('ls_theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    setLang(localStorage.getItem('ls_lang') || 'en');
    setCurrentUnit(localStorage.getItem('ls_unit') || 'mbps');
    
    const savedColor = localStorage.getItem('ls_primary_color');
    if (savedColor) {
        setPrimaryColor(savedColor);
    }

    updateThemeIcon(savedTheme);
    checkAuthUI(); // Sprawdzamy czy pokazać przycisk wylogowania

    try {
        initGauge();
    } catch (e) {
        console.error("Gauge init failed:", e);
        const gaugeEl = el('speed-gauge');
        if(gaugeEl) gaugeEl.style.display = 'none';
    }

    try {
        initCharts(); 
    } catch (e) {
        console.error("Charts init failed:", e);
    }

    try {
        initHistoryEvents();
        initMenu(); 
    
        loadSettings()
            .then(() => loadHistory())
            .catch(e => console.error("Critical: API connection failed:", e));
    
        window.addEventListener('historyUpdated', () => {
            loadHistory(1);
        });
    } catch (e) {
        console.error("Core init failed:", e);
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.get('login') === 'success') {
        setTimeout(() => {
            log(translations[lang].msg_login_success);
        }, 500);
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (urlParams.get('section') === 'history') {
        const navHistory = el('nav-history');
        const navDashboard = el('nav-dashboard');
        
        if (navHistory) navHistory.classList.add('active');
        if (navDashboard) navDashboard.classList.remove('active');

        setTimeout(() => {
            const section = el('history-section');
            if (section) {
                section.scrollIntoView({ behavior: 'smooth' });
                window.history.replaceState({}, document.title, "/");
            }
        }, 500);
    }

    const startBtn = el('start-btn');
    if(startBtn) startBtn.onclick = startTest;

    const logoutBtn = el('logout-btn');
    if(logoutBtn) logoutBtn.onclick = handleLogout;

    const langToggle = el('lang-toggle');
    if(langToggle) langToggle.onclick = () => { 
        const nextLang = lang === 'pl' ? 'en' : 'pl'; 
        setLang(nextLang);
        const currentTheme = document.body.getAttribute('data-theme');
        try { updateTexts(getGaugeInstance()); } catch(e) { updateTexts(null); }
        saveSettings(nextLang, currentTheme, currentUnit);
        log(translations[lang].msg_lang);
    };
    
    const themeToggle = el('theme-toggle');
    if(themeToggle) themeToggle.onclick = () => { 
        const current = document.body.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', next);
        document.documentElement.setAttribute('data-theme', next); 
        updateThemeIcon(next);
        
        try { reloadGauge(); } catch(e){}
        try { initCharts(); } catch(e){}
        try { updateTexts(getGaugeInstance()); } catch(e) { updateTexts(null); }

        saveSettings(lang, next, currentUnit);
        if(next === 'dark') log(translations[lang].msg_theme_dark);
        else log(translations[lang].msg_theme_light);
    };

    const unitToggle = el('unit-toggle');
    if(unitToggle) unitToggle.onclick = () => {
        const nextUnit = (currentUnit === 'mbps') ? 'mbs' : 'mbps';
        setCurrentUnit(nextUnit);
        const currentTheme = document.body.getAttribute('data-theme');
        
        try { reloadGauge(); } catch(e){}
        try { updateTexts(getGaugeInstance()); } catch(e) { updateTexts(null); }
        updateStatTiles(lastResultDown, lastResultUp); 
        loadHistory(); 
        
        saveSettings(lang, currentTheme, nextUnit);
        if(nextUnit === 'mbps') log(translations[lang].msg_unit_mbps);
        else log(translations[lang].msg_unit_mbs);
    };

    const modeToggle = el('mode-toggle');
    const modeText = el('mode-text');
    
    // --- FUNKCJA AKTUALIZUJĄCA UI PRZYCISKU MULTI/SINGLE ---
    const updateModeUI = () => {
        if (!modeToggle || !modeText) return;
        
        if (THREADS > 1) {
            modeText.innerText = "Multi";
            modeText.setAttribute('data-key', 'mode_multi');
            modeToggle.querySelector('.material-icons').innerText = "hub";
        } else {
            modeText.innerText = "Single";
            modeText.setAttribute('data-key', 'mode_single');
            modeToggle.querySelector('.material-icons').innerText = "device_hub"; 
        }
    };

    // Wywołujemy od razu po załadowaniu (wczyta z localStorage przez config.js)
    updateModeUI();
    
    if(modeToggle) {
        modeToggle.onclick = () => {
            if (THREADS > 1) {
                setThreads(1);
                log(translations[lang].msg_mode_single || "Tryb: Pojedyncze połączenie");
            } else {
                setThreads(16);
                log(translations[lang].msg_mode_multi || "Tryb: Wiele połączeń");
            }
            updateModeUI();
        };
    }

    let resizeTimeout;
    let lastWidth = window.innerWidth; 

    window.onresize = () => { 
        const currentWidth = window.innerWidth;
        if (currentWidth === lastWidth) return;
        lastWidth = currentWidth;
        clearTimeout(resizeTimeout); 
        resizeTimeout = setTimeout(() => {
             try { reloadGauge(); } catch(e){}
        }, 200); 
    };
};