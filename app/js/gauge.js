import { el, getUnitLabel, lang, currentUnit, updateTexts, getPrimaryColor, hexToRgba } from './utils.js';
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

// --- INICJALIZACJA I REKONFIGURACJA GAUGE ---
export function initGauge() {
    const size = getGaugeSize();
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const tickColor = isDark ? '#eeeeee' : '#2d3436'; 
    const mainColor = getPrimaryColor();
    
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
            colorNeedleEnd: mainColor
        });
        checkGaugeRange(gauge.value, true);
        return; 
    }

    let maxVal = (currentUnit === 'mbs') ? 125 : 1000;
    let ticks = (currentUnit === 'mbs') 
        ? ["0", "25", "50", "75", "100", "125"]
        : ["0", "200", "400", "600", "800", "1000"];

    const alpha1 = isDark ? 0.1 : 0.15;
    const alpha2 = isDark ? 0.3 : 0.4;
    const alpha3 = isDark ? 0.6 : 0.8;

    let highlights = (currentUnit === 'mbs') 
        ? [ 
            { from: 0, to: 50, color: hexToRgba(mainColor, alpha1) }, 
            { from: 50, to: 100, color: hexToRgba(mainColor, alpha2) }, 
            { from: 100, to: 125, color: hexToRgba(mainColor, alpha3) } 
          ]
        : [ 
            { from: 0, to: 400, color: hexToRgba(mainColor, alpha1) }, 
            { from: 400, to: 800, color: hexToRgba(mainColor, alpha2) }, 
            { from: 800, to: 1000, color: hexToRgba(mainColor, alpha3) } 
          ];

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
        colorNeedle: mainColor,
        colorNeedleEnd: mainColor,
        animationDuration: 200, 
        animationRule: "dequint", 
        fontValue: "Roboto",
        fontNumbers: "Roboto",
        fontTitle: "Roboto",
        fontUnits: "Roboto"
    }).draw();
    gaugeScaled = false;
    updateTexts(gauge);
}

export function reloadGauge() {
    let savedValue = 0;
    if (gauge) {
        savedValue = gauge.value;
    }

    const old = el('speed-gauge');
    if(old) old.remove(); 
    
    const canvas = document.createElement('canvas');
    canvas.id = 'speed-gauge';
    document.querySelector('.gauge-section').prepend(canvas);
    
    gauge = null; 
    gaugeScaled = false; 
    initGauge();

    if (savedValue > 0 && gauge) {
        gauge.update({ animationDuration: 0 });
        
        checkGaugeRange(savedValue, true); 
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

    let threshold = (currentUnit === 'mbs') ? 118 : 950;
    
    if ((val > threshold && !gaugeScaled) || forceUpdate) {
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        const alpha1 = isDark ? 0.1 : 0.15;
        const alpha2 = isDark ? 0.3 : 0.4;
        const alpha3 = isDark ? 0.6 : 0.8;
        const mainColor = getPrimaryColor();
        
        let useHighRange = gaugeScaled || (val > threshold);
        let newMax, newTicks, newHighlights;

        if (useHighRange) {
             newMax = (currentUnit === 'mbs') ? 375 : 3000;
             newTicks = (currentUnit === 'mbs') 
                ? ["0", "50", "100", "150", "200", "250", "300", "375"]
                : ["0", "500", "1000", "1500", "2000", "2500", "3000"];
             newHighlights = (currentUnit === 'mbs')
                ? [ 
                    { from: 0, to: 125, color: hexToRgba(mainColor, alpha1) }, 
                    { from: 125, to: 250, color: hexToRgba(mainColor, alpha2) }, 
                    { from: 250, to: 375, color: hexToRgba(mainColor, alpha3) } 
                  ]
                : [ 
                    { from: 0, to: 1000, color: hexToRgba(mainColor, alpha1) }, 
                    { from: 1000, to: 2000, color: hexToRgba(mainColor, alpha2) }, 
                    { from: 2000, to: 3000, color: hexToRgba(mainColor, alpha3) } 
                  ];
             gaugeScaled = true;
        } else {
            newMax = (currentUnit === 'mbs') ? 125 : 1000;
            newTicks = (currentUnit === 'mbs') 
                ? ["0", "25", "50", "75", "100", "125"]
                : ["0", "200", "400", "600", "800", "1000"];
            newHighlights = (currentUnit === 'mbs') 
                ? [ { from: 0, to: 50, color: hexToRgba(mainColor, alpha1) }, { from: 50, to: 100, color: hexToRgba(mainColor, alpha2) }, { from: 100, to: 125, color: hexToRgba(mainColor, alpha3) } ]
                : [ { from: 0, to: 400, color: hexToRgba(mainColor, alpha1) }, { from: 400, to: 800, color: hexToRgba(mainColor, alpha2) }, { from: 800, to: 1000, color: hexToRgba(mainColor, alpha3) } ];
        }

        // FIX: Zatrzymaj animację przed zmianą skali, aby uniknąć "skoku w dół"
        gauge.update({ 
            animationDuration: 0,
            maxValue: newMax, 
            majorTicks: newTicks, 
            highlights: newHighlights 
        });
        
        // Ustaw wartość natychmiast na nowej skali
        gauge.value = val;

        // Przywróć animację po chwili
        setTimeout(() => {
            if(gauge) gauge.update({ animationDuration: 200 });
        }, 50);
    }
}