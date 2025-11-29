import { el, getUnitLabel, lang, currentUnit, updateTexts } from './utils.js';
import { translations } from './config.js';

let gauge = null; 
let gaugeScaled = false; 

export function getGaugeInstance() {
    return gauge;
}

// --- WSPARCIE ROZMIARU GAUGE ---
export function getGaugeSize() { 
    const container = document.querySelector('.gauge-section');
    if (!container) return 300;

    const w = container.clientWidth;
    const h = container.clientHeight;

    const paddingX = 40; 
    const bottomSpace = 140; 

    const availableWidth = w - paddingX;
    const availableHeight = h - bottomSpace;

    let size = Math.min(availableWidth, availableHeight);

    return Math.max(size, 280); 
}

// --- INICJALIZACJA I REKONFIGURACJA GAUGE ---
export function initGauge() {
    const size = getGaugeSize();
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const tickColor = isDark ? '#eeeeee' : '#2d3436'; 
    
    // Jeśli gauge już istnieje i nie ma potrzeby przerysowywania, tylko aktualizujemy kolory/rozmiar
    if (gauge) {
        gauge.update({
            width: size,
            height: size,
            colorMajorTicks: tickColor,
            colorMinorTicks: tickColor,
            colorTitle: tickColor,
            colorUnits: tickColor,
            colorNumbers: tickColor
        });
        return; 
    }

    let maxVal = (currentUnit === 'mbs') ? 125 : 1000;
    let ticks = (currentUnit === 'mbs') 
        ? ["0", "25", "50", "75", "100", "125"]
        : ["0", "200", "400", "600", "800", "1000"];

    let highlights = (currentUnit === 'mbs') 
        ? [ { from: 0, to: 50, color: 'rgba(98, 0, 234, .1)' }, { from: 50, to: 100, color: 'rgba(98, 0, 234, .3)' }, { from: 100, to: 125, color: 'rgba(98, 0, 234, .6)' } ]
        : [ { from: 0, to: 400, color: 'rgba(98, 0, 234, .1)' }, { from: 400, to: 800, color: 'rgba(98, 0, 234, .3)' }, { from: 800, to: 1000, color: 'rgba(98, 0, 234, .6)' } ];

    gauge = new RadialGauge({
        renderTo: 'speed-gauge',
        width: size,
        height: size,
        units: getUnitLabel(),
        title: translations[lang].gauge_title,
        minValue: 0,
        maxValue: maxVal,
        valueBox: false, 
        majorTicks: ticks,
        minorTicks: 2,
        strokeTicks: true,
        highlights: highlights,
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
        colorNeedle: "#6200ea",
        colorNeedleEnd: "#6200ea",
        animationDuration: 100, 
        animationRule: "linear",
        fontValue: "Roboto",
        fontNumbers: "Roboto",
        fontTitle: "Roboto",
        fontUnits: "Roboto"
    }).draw();
    gaugeScaled = false;
    updateTexts(gauge);
}

export function reloadGauge() {
    const old = el('speed-gauge');
    if(old) old.remove(); 
    
    const canvas = document.createElement('canvas');
    canvas.id = 'speed-gauge';
    document.querySelector('.gauge-section').prepend(canvas);
    
    gauge = null; 
    gaugeScaled = false; 
    initGauge();
}

// --- SKALOWANIE GAUGE DLA WYSOKICH PRĘDKOŚCI ---
export function checkGaugeRange(speedMbps) {
    if (!gauge) return;
    let val = speedMbps;
    if (currentUnit === 'mbs') val = speedMbps / 8;

    let threshold = (currentUnit === 'mbs') ? 118 : 950;
    
    if (val > threshold && !gaugeScaled) {
        let newMax = (currentUnit === 'mbs') ? 375 : 3000;
        let newTicks = (currentUnit === 'mbs') 
            ? ["0", "50", "100", "150", "200", "250", "300", "375"]
            : ["0", "500", "1000", "1500", "2000", "2500", "3000"];
        let newHighlights = (currentUnit === 'mbs')
            ? [ { from: 0, to: 125, color: 'rgba(98, 0, 234, .1)' }, { from: 125, to: 250, color: 'rgba(98, 0, 234, .3)' }, { from: 250, to: 375, color: 'rgba(98, 0, 234, .6)' } ]
            : [ { from: 0, to: 1000, color: 'rgba(98, 0, 234, .1)' }, { from: 1000, to: 2000, color: 'rgba(98, 0, 234, .3)' }, { from: 2000, to: 3000, color: 'rgba(98, 0, 234, .6)' } ];

        gauge.update({ maxValue: newMax, majorTicks: newTicks, highlights: newHighlights });
        gaugeScaled = true; 
    }
}