import { el, log, setLang, setCurrentUnit, setPrimaryColor, lang, currentUnit, primaryColor, updateTexts } from './utils.js';
import { translations } from './config.js';
import { reloadGauge } from './gauge.js';
import { initCharts } from './charts.js'; 

export async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        
        let shouldReloadVisuals = false;
        const currentTheme = document.body.getAttribute('data-theme');
        
        if(data.lang && lang !== data.lang) { 
            setLang(data.lang); 
            localStorage.setItem('ls_lang', data.lang); 
        }
        if(data.theme && currentTheme !== data.theme) { 
            document.body.setAttribute('data-theme', data.theme); 
            localStorage.setItem('ls_theme', data.theme); 
            shouldReloadVisuals = true;
        }
        if(data.unit && currentUnit !== data.unit) {
            setCurrentUnit(data.unit);
            localStorage.setItem('ls_unit', data.unit);
            shouldReloadVisuals = true;
        }
        
        // POPRAWKA: Obsługa null/brakującego koloru
        const incomingColor = data.primary_color;
        // Sprawdzamy czy kolor się różni. Traktujemy null i "null" jako brak koloru.
        const effectiveCurrent = (primaryColor === 'null') ? null : primaryColor;
        
        if (incomingColor !== effectiveCurrent) {
            setPrimaryColor(incomingColor);
            
            if (incomingColor) {
                localStorage.setItem('ls_primary_color', incomingColor);
            } else {
                localStorage.removeItem('ls_primary_color');
            }
            shouldReloadVisuals = true;
        }
        
        if (shouldReloadVisuals) {
            if (typeof reloadGauge === 'function') reloadGauge(); 
            if (typeof initCharts === 'function') initCharts();
        }
        
        updateTexts();
        return data;
    } catch(e) { 
        console.error("Settings load error", e); 
        updateTexts(); 
        return null;
    }
}

export async function saveSettings(newLang, newTheme, newUnit, newColor) {
    const l = newLang || lang;
    const t = newTheme || document.body.getAttribute('data-theme');
    const u = newUnit || currentUnit;
    
    // Specjalna obsługa koloru: jeśli explicitly passed as null, to null. Jeśli undefined, to obecny.
    let c = (newColor === null) ? null : (newColor || primaryColor);
    
    // Jeśli obecny kolor to string "null" (błąd), zamień na null
    if (c === 'null') c = null;

    localStorage.setItem('ls_lang', l);
    localStorage.setItem('ls_theme', t);
    localStorage.setItem('ls_unit', u);
    
    // POPRAWKA: Nie zapisuj "null" jako string
    if (c) {
        localStorage.setItem('ls_primary_color', c);
    } else {
        localStorage.removeItem('ls_primary_color');
    }
    
    try {
        await fetch('/api/settings', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                lang: l, 
                theme: t, 
                unit: u,
                primary_color: c
            })
        });
    } catch(e) { 
        console.error("Settings save error", e);
        log(translations[lang].err + "Nie udało się zapisać ustawień na serwerze.");
    }
}

export async function saveResult(ping, down, up) {
    try {
        const currentTheme = document.body.getAttribute('data-theme') || 'dark';
        const res = await fetch('/api/history', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ ping, download: down, upload: up, lang, theme: currentTheme })
        });
        
        if (res.ok) {
            setTimeout(() => {
                const event = new CustomEvent('historyUpdated');
                window.dispatchEvent(event);
                log(translations[lang].log_end);
            }, 500); 
        } else {
            const errorData = await res.json();
            throw new Error(errorData.error || "Nieznany błąd zapisu");
        }
    } catch(e) { 
        console.error("History save error", e); 
        log(translations[lang].err + "Nie udało się zapisać wyniku testu.");
    }
}

export async function fetchHistory(page, limit, sortBy, order) {
    try {
        const res = await fetch(`/api/history?page=${page}&limit=${limit}&sort_by=${sortBy}&order=${order}`);
        return await res.json();
    } catch(e) { 
        console.error("History fetch error", e); 
        return { total: 0, page: 1, limit: limit, data: [] };
    }
}

export async function deleteItems(ids) {
    try {
        const res = await fetch('/api/history', {
            method: 'DELETE',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(ids)
        });
        
        if (res.ok) {
            return true;
        } else {
            throw new Error("Delete failed");
        }
    } catch(e) {
        console.error("Delete error", e);
        log(translations[lang].err + "Nie udało się usunąć wpisów.");
        return false;
    }
}