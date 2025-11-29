import { el, log, setLang, setCurrentUnit, lang, currentUnit, updateTexts } from './utils.js';
import { translations } from './config.js';
import { reloadGauge } from './gauge.js';
import { loadHistory } from './history_ui.js';

// --- Wczytywanie ustawień z serwera ---
export async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        
        let shouldReloadGauge = false;
        const currentTheme = document.body.getAttribute('data-theme');
        
        if(data.lang && lang !== data.lang) { 
            setLang(data.lang); 
            localStorage.setItem('ls_lang', data.lang); 
        }
        if(data.theme && currentTheme !== data.theme) { 
            document.body.setAttribute('data-theme', data.theme); 
            localStorage.setItem('ls_theme', data.theme); 
            shouldReloadGauge = true;
        }
        if(data.unit && currentUnit !== data.unit) {
            setCurrentUnit(data.unit);
            localStorage.setItem('ls_unit', data.unit);
            shouldReloadGauge = true;
        }
        
        if (shouldReloadGauge) {
            reloadGauge(); 
        }
        
        updateTexts();
    } catch(e) { 
        console.error("Settings load error", e); 
        // Jeśli ładowanie ustawień z serwera zawiedzie, używamy tylko localStorage
        updateTexts(); 
    }
}

// --- Zapis ustawień na serwerze ---
export async function saveSettings(newLang, newTheme, newUnit) {
    localStorage.setItem('ls_lang', newLang);
    localStorage.setItem('ls_theme', newTheme);
    localStorage.setItem('ls_unit', newUnit);
    try {
        await fetch('/api/settings', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ lang: newLang, theme: newTheme, unit: newUnit })
        });
    } catch(e) { 
        console.error("Settings save error", e);
        log(translations[lang].err + "Nie udało się zapisać ustawień na serwerze.");
    }
}

// --- Zapis wyniku testu na serwerze ---
export async function saveResult(ping, down, up) {
    try {
        const currentTheme = document.body.getAttribute('data-theme') || 'dark';
        await fetch('/api/history', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ ping, download: down, upload: up, lang, theme: currentTheme })
        });
        
        // Po zapisie, automatycznie przechodzimy do pierwszej strony historii i odświeżamy
        loadHistory(1, 'date', 'desc'); 
    } catch(e) { 
        console.error("History save error", e); 
        log(translations[lang].err + "Nie udało się zapisać wyniku testu.");
    }
}

// --- Ładowanie historii (używane w history_ui.js) ---
export async function fetchHistory(page, limit, sortBy, order) {
    try {
        const res = await fetch(`/api/history?page=${page}&limit=${limit}&sort_by=${sortBy}&order=${order}`);
        return await res.json();
    } catch(e) { 
        console.error("History fetch error", e); 
        return { total: 0, page: 1, limit: limit, data: [] };
    }
}