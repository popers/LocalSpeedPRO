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
    formatSpeed,
    timeout 
} from '/js/utils.js';
import { translations, TEST_DURATION } from '/js/config.js'; 
import { initGauge, reloadGauge, getGaugeInstance } from '/js/gauge.js';
import { initCharts, resetCharts } from '/js/charts.js';
import { loadSettings, saveSettings, saveResult } from '/js/data_sync.js';
import { initHistoryEvents, loadHistory, updateStatTiles } from '/js/history_ui.js';
import { runPing, runDownload, runUpload } from '/js/speedtest.js';

// --- Główna funkcja uruchamiająca test ---
async function startTest() {
    const btn = el('start-btn');
    
    // BLOKOWANIE PRZYCISKU I WŁĄCZENIE ANIMACJI
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
        // USUNIĘTO: log(...)
        ping = await Promise.race([runPing(), timeout(3000)]);
        if (typeof ping !== 'number') throw new Error("Ping timeout");
        el('ping-text').textContent = ping.toFixed(1);

        // 2. DOWNLOAD
        el('card-down').classList.add('active');
        // USUNIĘTO: log(...)
        
        down = await Promise.race([runDownload(), timeout(TEST_DURATION + 1000)]); 
        
        el('down-val').textContent = formatSpeed(down); 
        el('card-down').classList.remove('active');

        // STABILIZACJA
        await new Promise(r => setTimeout(r, 200)); 

        // OPADANIE WSKAZÓWKI
        if (gaugeInstance) {
            gaugeInstance.update({ animationDuration: 1200 }); 
            gaugeInstance.value = 0;
        }
        el('speed-value').innerText = "0.00";
        
        await new Promise(r => setTimeout(r, 1200)); 
        
        if (gaugeInstance) {
            gaugeInstance.update({ animationDuration: 100 }); 
        }

        // 3. UPLOAD
        el('card-up').classList.add('active');
        // USUNIĘTO: log(...)
        
        up = await Promise.race([runUpload(), timeout(TEST_DURATION + 1000)]);
        
        el('up-val').textContent = formatSpeed(up);
        el('card-up').classList.remove('active');

        // STABILIZACJA
        await new Promise(r => setTimeout(r, 200)); 

        // OPADANIE WSKAZÓWKI
        if (gaugeInstance) {
            gaugeInstance.update({ animationDuration: 1200 });
            gaugeInstance.value = 0;
        }
        el('speed-value').innerText = "0.00";
        
        await new Promise(r => setTimeout(r, 1200));

        if (gaugeInstance) {
            gaugeInstance.update({ animationDuration: 100 });
        }

        // 4. SAVE
        await saveResult(ping, down, up); 
        
    } catch (error) {
        console.error("Błąd podczas testu:", error);
        log(translations[lang].err + "Test przerwany: " + error.message);
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading'); 
        
        if (ping > 0 && down > 0 && up > 0) {
            // Toast sukcesu już obsłużony w data_sync.js
        } else {
            log(translations[lang].log_end + " Przycisk odblokowany.");
        }
    }
}

window.onload = () => {
    const savedTheme = localStorage.getItem('ls_theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
    setLang(localStorage.getItem('ls_lang') || 'pl');
    setCurrentUnit(localStorage.getItem('ls_unit') || 'mbps');
    updateThemeIcon(savedTheme);

    initGauge();
    initCharts(); 
    initHistoryEvents();

    loadSettings().then(() => loadHistory());
    
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
        
        reloadGauge(); 
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