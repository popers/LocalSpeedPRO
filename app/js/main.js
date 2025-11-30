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
import { translations, TEST_DURATION } from '/js/config.js'; 
import { initGauge, reloadGauge, getGaugeInstance } from '/js/gauge.js';
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

// --- Główna funkcja uruchamiająca test ---
async function startTest() {
    const btn = el('start-btn');
    
    btn.disabled = true;
    btn.classList.add('loading'); 

    el('speed-value').innerText = "0.00";
    reloadGauge(); 
    resetCharts();

    const gaugeInstance = getGaugeInstance();

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

        if (gaugeInstance) {
            gaugeInstance.update({ animationDuration: 1200 }); 
            gaugeInstance.value = 0;
        }
        el('speed-value').innerText = "0.00";
        await new Promise(r => setTimeout(r, 1200)); 
        if (gaugeInstance) gaugeInstance.update({ animationDuration: 100 }); 

        // 3. UPLOAD
        el('card-up').classList.add('active');
        up = await Promise.race([runUpload(), timeout(TEST_DURATION + 1000)]);
        el('up-val').textContent = formatSpeed(up);
        el('card-up').classList.remove('active');

        await new Promise(r => setTimeout(r, 200)); 

        if (gaugeInstance) {
            gaugeInstance.update({ animationDuration: 1200 });
            gaugeInstance.value = 0;
        }
        el('speed-value').innerText = "0.00";
        await new Promise(r => setTimeout(r, 1200));
        if (gaugeInstance) gaugeInstance.update({ animationDuration: 100 });

        // 4. SAVE
        await saveResult(ping, down, up); 
        
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

// --- OBSŁUGA MENU ---
function initMenu() {
    const sidebar = el('app-sidebar');
    const overlay = el('sidebar-overlay');
    const menuToggle = el('menu-toggle');
    const navDashboard = el('nav-dashboard');
    const navHistory = el('nav-history');

    function closeMenu() {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        document.body.classList.remove('menu-open');
    }

    function openMenu() {
        sidebar.classList.add('open');
        overlay.classList.add('active');
        document.body.classList.add('menu-open');
    }

    if(menuToggle) {
        menuToggle.onclick = () => {
            if (sidebar.classList.contains('open')) closeMenu();
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
    
    // Jeśli załadowaliśmy się na stronie głównej, oznaczamy Dashboard jako aktywny
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

    initGauge();
    initCharts(); 
    initHistoryEvents();
    initMenu(); 

    loadSettings().then(() => loadHistory());
    
    const urlParams = new URLSearchParams(window.location.search);
    
    // Obsługa komunikatu o zalogowaniu
    if (urlParams.get('login') === 'success') {
        setTimeout(() => {
            log(translations[lang].msg_login_success);
        }, 500);
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // --- NOWE: OBSŁUGA PRZEWIJANIA DO SEKCJI PO ZAŁADOWANIU ---
    // Sprawdzamy czy w URL jest ?section=history
    if (urlParams.get('section') === 'history') {
        const navHistory = el('nav-history');
        const navDashboard = el('nav-dashboard');
        
        // Ustawiamy aktywny link w menu
        if (navHistory) navHistory.classList.add('active');
        if (navDashboard) navDashboard.classList.remove('active');

        // Czekamy 500ms aby strona się ułożyła (wykresy, responsywność)
        setTimeout(() => {
            const section = el('history-section');
            if (section) {
                section.scrollIntoView({ behavior: 'smooth' });
                
                // Czyścimy URL aby po odświeżeniu nie skakało znowu
                window.history.replaceState({}, document.title, "/");
            }
        }, 500);
    }

    el('start-btn').onclick = startTest;

    const logoutBtn = el('logout-btn');
    if(logoutBtn) logoutBtn.onclick = handleLogout;

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
        document.documentElement.setAttribute('data-theme', next); // Update HTML too
        updateThemeIcon(next);
        
        reloadGauge(); 
        initCharts(); 
        updateTexts(getGaugeInstance()); 

        saveSettings(lang, next, currentUnit);
        if(next === 'dark') log(translations[lang].msg_theme_dark);
        else log(translations[lang].msg_theme_light);
    };

    el('unit-toggle').onclick = () => {
        const nextUnit = (currentUnit === 'mbps') ? 'mbs' : 'mbps';
        setCurrentUnit(nextUnit);
        const currentTheme = document.body.getAttribute('data-theme');
        
        reloadGauge(); 
        updateTexts(getGaugeInstance());
        updateStatTiles(lastResultDown, lastResultUp); 
        loadHistory(); 
        
        saveSettings(lang, currentTheme, nextUnit);
        if(nextUnit === 'mbps') log(translations[lang].msg_unit_mbps);
        else log(translations[lang].msg_unit_mbs);
    };

    let resizeTimeout;
    let lastWidth = window.innerWidth; 

    window.onresize = () => { 
        const currentWidth = window.innerWidth;
        if (currentWidth === lastWidth) return;
        lastWidth = currentWidth;
        clearTimeout(resizeTimeout); 
        resizeTimeout = setTimeout(reloadGauge, 200); 
    };
};