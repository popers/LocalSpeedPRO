import { el, getUnitLabel, lang, currentUnit, updateTexts, getPrimaryColor, hexToRgba } from './utils.js';
import { translations } from './config.js';

let gauge = null; 

// Przechowujemy aktualny maksymalny zakres licznika, aby nie odświeżać go bez potrzeby
let currentMaxLimit = 0;

// ZMIANA: Flaga informująca, czy licznik jest w trakcie resetowania do zera
let isResetting = false;

export function setIsResetting(state) {
    isResetting = state;
}

export function getGaugeInstance() {
    return gauge;
}

// --- WSPARCIE ROZMIARU GAUGE ---
export function getGaugeSize() { 
    const container = document.querySelector('.gauge-section');
    if (!container) return 300;

    const w = container.clientWidth;
    const h = container.clientHeight;
    const paddingX = 0; 
    
    const isMobile = window.innerWidth <= 900;

    if (isMobile) {
        return Math.max(w - paddingX, 280);
    }

    const bottomSpace = 50; 
    const availableWidth = w - paddingX;
    const availableHeight = h - bottomSpace;
    let size = Math.min(availableWidth, availableHeight);

    return Math.max(size, 280); 
}

// --- KONFIGURACJA SKALI (TIERS) ---
// Ta funkcja zwraca konfigurację (max, ticks, highlights) dla danej prędkości
function getScaleConfig(value, unit, mainColor, isDark) {
    const alpha1 = isDark ? 0.1 : 0.15;
    const alpha2 = isDark ? 0.3 : 0.4;
    const alpha3 = isDark ? 0.6 : 0.8;

    // Definicje progów dla Mbps
    // Jeśli wartość przekroczy próg, wchodzimy na wyższy poziom
    let tiers = [];

    if (unit === 'mbs') {
        // Skala dla MB/s (1 Gbps = 125 MB/s)
        tiers = [
            { max: 125, step: 25 },    // Do 1 Gbps
            { max: 315, step: 45 },    // Do 2.5 Gbps
            { max: 625, step: 125 },   // Do 5 Gbps
            { max: 1250, step: 250 },  // Do 10 Gbps
            { max: 2500, step: 500 }   // Do 20 Gbps (Future proof)
        ];
    } else {
        // Skala dla Mbps
        tiers = [
            { max: 1000, step: 200 },  // 1 Gbps
            { max: 2500, step: 500 },  // 2.5 Gbps
            { max: 5000, step: 1000 }, // 5 Gbps
            { max: 10000, step: 2000 },// 10 Gbps
            { max: 20000, step: 4000 } // 20 Gbps
        ];
    }

    // Znajdź odpowiedni tier. Zmieniono threshold na bardzo wysoki (0.996).
    // Licznik przełączy się dopiero, gdy wykorzysta 99.6% obecnej skali (np. 2490/2500).
    let selectedTier = tiers[0];
    for (let tier of tiers) {
        if (value > tier.max * 0.996) {
            continue; // Za mało miejsca, idziemy do następnego
        } else {
            selectedTier = tier;
            break;
        }
    }
    // Jeśli prędkość jest kosmiczna i wykracza poza tiery, weź ostatni i go przeskaluj
    if (value > selectedTier.max) {
        // Fallback dla ultra wysokich prędkości - po prostu podwajamy ostatni tier
        selectedTier = { max: Math.ceil(value / 1000) * 1000 + 1000, step: 1000 };
    }

    // Generowanie tablicy Ticks (podziałki)
    const ticks = [];
    const count = Math.floor(selectedTier.max / selectedTier.step);
    for (let i = 0; i <= count; i++) {
        ticks.push((i * selectedTier.step).toString());
    }
    // Upewnij się, że ostatnia wartość to max
    if (ticks[ticks.length - 1] !== selectedTier.max.toString()) {
        ticks.push(selectedTier.max.toString());
    }

    // Generowanie Highlights (kolorowych stref)
    const part = selectedTier.max / 3;
    const highlights = [
        { from: 0, to: part, color: hexToRgba(mainColor, alpha1) },
        { from: part, to: part * 2, color: hexToRgba(mainColor, alpha2) },
        { from: part * 2, to: selectedTier.max, color: hexToRgba(mainColor, alpha3) }
    ];

    return {
        maxValue: selectedTier.max,
        majorTicks: ticks,
        highlights: highlights
    };
}

// --- INICJALIZACJA I REKONFIGURACJA GAUGE ---
export function initGauge() {
    const size = getGaugeSize();
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const tickColor = isDark ? '#eeeeee' : '#2d3436'; 
    const mainColor = getPrimaryColor();
    
    // Pobieramy konfigurację startową (dla wartości 0)
    const config = getScaleConfig(0, currentUnit, mainColor, isDark);
    currentMaxLimit = config.maxValue;

    if (gauge) {
        gauge.update({
            width: size,
            height: size,
            colorMajorTicks: tickColor,
            colorMinorTicks: tickColor,
            colorTitle: tickColor,
            colorUnits: tickColor,
            colorNumbers: tickColor,
            colorNeedle: mainColor,
            colorNeedleEnd: mainColor,
            // Resetujemy skalę przy re-init (np. zmiana motywu)
            maxValue: config.maxValue,
            majorTicks: config.majorTicks,
            highlights: config.highlights
        });
        return; 
    }

    gauge = new RadialGauge({
        renderTo: 'speed-gauge',
        width: size,
        height: size,
        units: getUnitLabel(),
        title: translations[lang].gauge_title,
        minValue: 0,
        maxValue: config.maxValue,
        valueBox: false, 
        majorTicks: config.majorTicks,
        minorTicks: 2,
        strokeTicks: true,
        highlights: config.highlights,
        colorPlate: "transparent",
        colorMajorTicks: tickColor,
        colorMinorTicks: tickColor,
        colorTitle: tickColor,
        colorUnits: tickColor,
        colorNumbers: tickColor,
        borderShadowWidth: 0,
        borders: false,
        needleType: "arrow",
        needleWidth: 4,
        colorNeedle: mainColor,
        colorNeedleEnd: mainColor,
        animationDuration: 200, 
        animationRule: "dequint", 
        fontValue: "Roboto",
        fontNumbers: "Roboto",
        fontTitle: "Roboto",
        fontUnits: "Roboto"
    }).draw();
    
    updateTexts(gauge);
}

export function reloadGauge() {
    let savedValue = 0;
    
    // ZMIANA: Jeśli jesteśmy w trakcie resetowania (opadania do zera),
    // nie zapisujemy obecnej wartości, tylko pozwalamy licznikowi się wyzerować.
    if (gauge && !isResetting) {
        savedValue = gauge.value;
    }

    const old = el('speed-gauge');
    if(old) old.remove(); 
    
    const canvas = document.createElement('canvas');
    canvas.id = 'speed-gauge';
    document.querySelector('.gauge-section').prepend(canvas);
    
    gauge = null; 
    currentMaxLimit = 0; // Reset limitu
    initGauge();

    if (savedValue > 0 && gauge) {
        gauge.update({ animationDuration: 0 });
        checkGaugeRange(savedValue, true); // Sprawdź czy stara wartość mieści się w nowej skali
        gauge.value = savedValue;
        
        setTimeout(() => {
            if(gauge) gauge.update({ animationDuration: 200 });
        }, 50);
    }
}

export function checkGaugeRange(speedMbps, forceUpdate = false) {
    if (!gauge) return;
    
    let val = speedMbps;
    if (currentUnit === 'mbs') val = speedMbps / 8;

    // Sprawdzamy, czy potrzebujemy zmiany skali
    // Logika: Jeśli wartość zbliża się do końca licznika (90%) -> Zwiększamy
    // Lub jeśli wartość jest bardzo mała w stosunku do max (np. < 20% połowy poprzedniego zakresu) -> Zmniejszamy (opcjonalne, tutaj skupiamy się na wzroście)
    
    // Pobieramy konfigurację dla AKTUALNEJ wartości
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const mainColor = getPrimaryColor();
    const newConfig = getScaleConfig(val, currentUnit, mainColor, isDark);

    // Jeśli wyliczony Max różni się od obecnego Max licznika, robimy update
    if (newConfig.maxValue !== currentMaxLimit || forceUpdate) {
        
        // Zatrzymaj animację przed zmianą skali
        gauge.update({ 
            animationDuration: 0,
            maxValue: newConfig.maxValue, 
            majorTicks: newConfig.majorTicks, 
            highlights: newConfig.highlights 
        });
        
        currentMaxLimit = newConfig.maxValue;
        
        // ZMIANA: Usunięto linię "gauge.value = val;"
        // Dzięki temu funkcja aktualizuje tylko TŁO (skalę), a nie pozycję wskazówki.
        // Pozycja wskazówki jest ustawiana osobno w pętli silnika testu (speedtest.js).
        // To eliminuje "skok" wskazówki przy zmianie skali na podstawie prognozy (rawSpeed).

        // Przywróć animację
        setTimeout(() => {
            if(gauge) gauge.update({ animationDuration: 200 });
        }, 50);
    }
}