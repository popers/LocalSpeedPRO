import { translations } from './config.js';

export const el = (id) => document.getElementById(id);

// --- Zmienne globalne do stanu aplikacji ---
export let lang = localStorage.getItem('ls_lang') || 'pl';
export let currentUnit = localStorage.getItem('ls_unit') || 'mbps';
export let lastResultDown = 0; // w Mbps
export let lastResultUp = 0;   // w Mbps

export function setLang(newLang) {
    lang = newLang;
}
export function setCurrentUnit(newUnit) {
    currentUnit = newUnit;
}
// FUNKCJE AKTUALIZUJĄCE WYNIKI
export function setLastResultDown(val) {
    lastResultDown = val;
}
export function setLastResultUp(val) {
    lastResultUp = val;
}

// --- HELPERY FORMATOWANIA ---
export function formatSpeed(valMbps) {
    if (currentUnit === 'mbs') return (valMbps / 8).toFixed(1);
    return valMbps.toFixed(1);
}

export function getUnitLabel() {
    return currentUnit === 'mbs' ? 'MB/s' : 'Mbps';
}

// NOWA FUNKCJA: Zapewnia timeout (używana w Promise.race w main.js)
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
    el('lang-toggle').innerText = lang.toUpperCase();
    el('unit-toggle').innerText = getUnitLabel();
    
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

// --- Funkcja do resetowania ikon motywu ---
export function updateThemeIcon(theme) {
    const icon = el('theme-icon');
    if (icon) {
        icon.innerText = theme === 'dark' ? 'dark_mode' : 'light_mode';
    }
}