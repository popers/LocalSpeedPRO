import { translations } from './config.js';

export const el = (id) => document.getElementById(id);

// --- Zmienne globalne do stanu aplikacji ---
export let lang = localStorage.getItem('ls_lang') || 'en';
export let currentUnit = localStorage.getItem('ls_unit') || 'mbps';
// ZMIANA: Pobieramy kolor bez fallbacka tutaj, fallback obsłuży funkcja getPrimaryColor
export let primaryColor = localStorage.getItem('ls_primary_color'); 

export let lastResultDown = 0; 
export let lastResultUp = 0;   

export function setLang(newLang) {
    lang = newLang;
}
export function setCurrentUnit(newUnit) {
    currentUnit = newUnit;
}
export function setPrimaryColor(color) {
    primaryColor = color;
    applyPrimaryColor(color);
}

// Aplikowanie koloru do CSS
export function applyPrimaryColor(color) {
    if (color) {
        document.documentElement.style.setProperty('--primary', color);
    } else {
        document.documentElement.style.removeProperty('--primary');
    }
}

// NOWE: Funkcja zwracająca aktualny kolor w formacie HEX
// Jeśli użytkownik nie ustawił koloru, zwraca domyślny dla obecnego motywu
export function getPrimaryColor() {
    if (primaryColor) return primaryColor;
    
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    // Domyślne kolory zdefiniowane w CSS (base.css)
    return isDark ? '#bb86fc' : '#6200ea';
}

// NOWE: Konwersja HEX na RGBA (potrzebne do wykresów i gauge)
export function hexToRgba(hex, alpha) {
    let c;
    if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
        c= hex.substring(1).split('');
        if(c.length== 3){
            c= [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        c= '0x'+c.join('');
        return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+alpha+')';
    }
    // Fallback jeśli format jest błędny
    return `rgba(98, 0, 234, ${alpha})`;
}

export function setLastResultDown(val) { lastResultDown = val; }
export function setLastResultUp(val) { lastResultUp = val; }

export function formatSpeed(valMbps) {
    if (currentUnit === 'mbs') return (valMbps / 8).toFixed(1);
    return valMbps.toFixed(1);
}

export function getUnitLabel() {
    return currentUnit === 'mbs' ? 'MB/s' : 'Mbps';
}

export function timeout(ms) {
    return new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Test Timeout')), ms);
    });
}

// --- POWIADOMIENIA (TOAST) ---
export const log = (msg) => {
    let container = el('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span class="material-icons" style="font-size:18px">info</span> ${msg}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastFadeOut 0.5s forwards ease-in';
        toast.addEventListener('animationend', () => toast.remove());
    }, 4000);
};

// --- AKTUALIZACJA UI TEKSTÓW ---
export function updateTexts(gaugeInstance) {
    const langBtn = el('lang-toggle');
    if(langBtn) langBtn.innerText = lang.toUpperCase();
    
    const unitBtn = el('unit-toggle');
    if(unitBtn) unitBtn.innerText = getUnitLabel();
    
    document.querySelectorAll('.unit-label').forEach(e => e.innerText = getUnitLabel());
    document.querySelectorAll('[data-key]').forEach(elem => {
        const key = elem.getAttribute('data-key');
        if (translations[lang][key]) elem.innerText = translations[lang][key];
    });

    if(gaugeInstance) {
        gaugeInstance.update({ 
            title: translations[lang].gauge_title,
            units: getUnitLabel()
        });
    }
}

export function updateThemeIcon(theme) {
    const icon = el('theme-icon');
    if (icon) {
        icon.innerText = theme === 'dark' ? 'dark_mode' : 'light_mode';
    }
}