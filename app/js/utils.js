import { translations } from './config.js';
// Importujemy funkcję aktualizacji tekstów z gauge.js
import { updateGaugeTexts } from './gauge.js';

// --- Podstawowe funkcje DOM ---
export const el = (id) => document.getElementById(id);

// --- Zmienne globalne do stanu aplikacji ---
export let lang = localStorage.getItem('ls_lang') || 'en';
export let currentUnit = localStorage.getItem('ls_unit') || 'mbps';
export let primaryColor = localStorage.getItem('ls_primary_color'); 

export let lastResultDown = 0; 
export let lastResultUp = 0;   

// --- WYKRYWANIE URZĄDZENIA ---
export const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
           || (window.innerWidth < 900);
};

// --- Settery dla zmiennych stanu ---
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

// --- Funkcje wizualne ---

export function applyPrimaryColor(color) {
    if (color) {
        document.documentElement.style.setProperty('--primary', color);
        const rgb = hexToRgb(color);
        if(rgb) document.documentElement.style.setProperty('--primary-rgb', rgb);
    } else {
        document.documentElement.style.removeProperty('--primary');
        document.documentElement.style.removeProperty('--primary-rgb');
    }
}

export function getPrimaryColor() {
    if (primaryColor && primaryColor !== 'null') return primaryColor;
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    return isDark ? '#bb86fc' : '#6200ea';
}

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
    return `rgba(98, 0, 234, ${alpha})`;
}

function hexToRgb(hex) {
    let c;
    if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
        c= hex.substring(1).split('');
        if(c.length== 3){
            c= [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        c= '0x'+c.join('');
        return [(c>>16)&255, (c>>8)&255, c&255].join(', ');
    }
    return null;
}

// --- Funkcje wyników testu ---
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
        if (translations[lang] && translations[lang][key]) {
             if(elem.tagName === 'A' && elem.classList.contains('btn-oidc')) {
                const icon = elem.querySelector('.material-icons')?.outerHTML || '';
                elem.innerHTML = icon + " " + translations[lang][key];
             } else {
                elem.innerText = translations[lang][key];
             }
        }
    });

    // ZMIANA: Wywołanie dedykowanej funkcji z gauge.js
    updateGaugeTexts();
    
    document.documentElement.setAttribute('lang', lang);

    const sidebar = el('app-sidebar');
    if (sidebar && sidebar.classList.contains('untranslated')) {
        requestAnimationFrame(() => {
            sidebar.classList.remove('untranslated');
        });
    }
}

export function updateThemeIcon(theme) {
    const icon = el('theme-icon');
    if (icon) {
        icon.innerText = theme === 'dark' ? 'dark_mode' : 'light_mode';
    }
}