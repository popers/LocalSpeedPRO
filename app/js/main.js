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
import { initGauge, reloadGauge, resetGauge, getGaugeInstance } from '/js/gauge.js';
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
    
    // Reset wartości UI
    el('ping-idle-val').innerText = '--';
    el('ping-dl-val').innerText = '--';
    el('ping-ul-val').innerText = '--';
    el('jitter-val').innerText = '--';
    el('down-val').innerText = '--';
    el('up-val').innerText = '--';

    try { reloadGauge(); } catch(e) { console.warn("Gauge error:", e); }
    try { resetCharts(); } catch(e) { console.warn("Charts error:", e); }

    let pingResults = { ping: 0, jitter: 0 };
    let downResult = { speed: 0, ping: 0 };
    let upResult = { speed: 0, ping: 0 };

    try {
        log(translations[lang].log_start);
        await new Promise(r => setTimeout(r, 800));

        // 1. PING IDLE & JITTER
        // Zwiększamy timeout dla mobile, aby dać czas na nawiązanie połączenia WS
        pingResults = await Promise.race([runPing(), timeout(6000)]);
        if (!pingResults) throw new Error("Ping error");

        el('ping-idle-val').textContent = pingResults.ping.toFixed(1);
        el('jitter-val').textContent = pingResults.jitter.toFixed(1);

        // POPRAWKA: Dodajemy opóźnienie, aby przeglądarka (szczególnie mobile)
        // zdążyła przerysować wynik Pingu przed zamrożeniem wątku przez Workery.
        await new Promise(r => setTimeout(r, 1000));

        // 2. DOWNLOAD
        el('card-down').classList.add('active');
        downResult = await Promise.race([runDownload(), timeout(TEST_DURATION + 1000)]); 
        el('down-val').textContent = formatSpeed(downResult.speed); 
        el('ping-dl-val').textContent = downResult.ping.toFixed(1);
        el('card-down').classList.remove('active');

        // Reset wskazówki
        resetGauge();
        await new Promise(r => setTimeout(r, 1600)); 

        // 3. UPLOAD
        el('card-up').classList.add('active');
        upResult = await Promise.race([runUpload(), timeout(TEST_DURATION + 1000)]);
        el('up-val').textContent = formatSpeed(upResult.speed);
        el('ping-ul-val').textContent = upResult.ping.toFixed(1);
        el('card-up').classList.remove('active');

        // Reset wskazówki
        resetGauge();
        await new Promise(r => setTimeout(r, 1600)); 

        // 4. SAVE
        const currentMode = (THREADS > 1) ? "Multi" : "Single";
        await saveResult(
            pingResults.ping, 
            downResult.speed, 
            upResult.speed, 
            currentMode,
            pingResults.jitter,
            downResult.ping,
            upResult.ping
        ); 
        
    } catch (error) {
        console.error("Błąd podczas testu:", error);
        log(translations[lang].err + "Test przerwany: " + error.message);
        
        if(error.message.includes('401') || error.status === 401) {
            window.location.href = '/login.html';
        }

    } finally {
        btn.disabled = false;
        btn.classList.remove('loading'); 
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
    checkAuthUI(); 

    try {
        initGauge();
    } catch (e) {
        console.error("Gauge init failed:", e);
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
        updateModeUI();
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
    
    const updateModeUI = () => {
        if (!modeToggle || !modeText) return;
        
        if (THREADS > 1) {
            const key = 'mode_multi';
            const txt = (translations[lang] && translations[lang][key]) ? translations[lang][key] : "Multi";
            
            modeText.innerText = txt;
            modeText.setAttribute('data-key', key);
            modeToggle.querySelector('.material-icons').innerText = "hub";
        } else {
            const key = 'mode_single';
            const txt = (translations[lang] && translations[lang][key]) ? translations[lang][key] : "Single";
            
            modeText.innerText = txt;
            modeText.setAttribute('data-key', key);
            modeToggle.querySelector('.material-icons').innerText = "device_hub"; 
        }
    };

    updateModeUI();
    
    if(modeToggle) {
        modeToggle.onclick = () => {
            if (THREADS > 1) {
                setThreads(1);
                const msg = translations[lang]['msg_mode_single'] || "Tryb: Pojedyncze połączenie";
                log(msg);
            } else {
                setThreads(16);
                const msg = translations[lang]['msg_mode_multi'] || "Tryb: Wiele połączeń";
                log(msg);
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