import { getUnitLabel, lang, currentUnit, getPrimaryColor, hexToRgba } from './utils.js';
import { translations } from './config.js';

let chart = null;
let currentMaxLimit = 0;
let isResetting = false;
let resizeHandler = null; 

export function getGaugeInstance() {
    return chart;
}

export function setIsResetting(state) {
    isResetting = state;
}

export function setGaugeValue(val) {
    if (!chart || isResetting) return;
    
    let displayVal = val;
    if (currentUnit === 'mbs') displayVal = val / 8;

    if (displayVal === null || displayVal === undefined || isNaN(displayVal)) {
        displayVal = 0;
    }
    
    displayVal = Math.round(displayVal * 100) / 100;

    chart.setOption({
        series: [{
            data: [{
                value: displayVal,
                name: translations[lang].gauge_title || 'Speed'
            }]
        }]
    });
}

function getScaleConfig(value, unit, mainColor, isDark) {
    let tiers = [];

    if (unit === 'mbs') {
        tiers = [
            { max: 125, step: 25 },
            { max: 315, step: 45 },
            { max: 625, step: 125 },
            { max: 1250, step: 250 },
            { max: 2500, step: 500 }
        ];
    } else {
        tiers = [
            { max: 1000, step: 200 },
            { max: 2500, step: 500 },
            { max: 5000, step: 1000 },
            { max: 10000, step: 2000 },
            { max: 20000, step: 4000 }
        ];
    }

    let selectedTier = tiers[0];
    for (let tier of tiers) {
        if (value > tier.max * 0.996) {
            continue; 
        } else {
            selectedTier = tier;
            break;
        }
    }
    
    if (value > selectedTier.max) {
        selectedTier = { max: Math.ceil(value / 1000) * 1000 + 1000, step: 1000 };
    }

    const splitNumber = selectedTier.max / selectedTier.step;
    const trackColor = isDark ? '#333' : '#e0e0e0';
    
    return {
        max: selectedTier.max,
        splitNumber: splitNumber,
        trackColor: trackColor
    };
}

export function initGauge() {
    const dom = document.getElementById('speed-gauge');
    if (!dom) return;

    if (chart) {
        chart.dispose();
    }
    
    if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
    }

    chart = echarts.init(dom, null, { renderer: 'canvas' });

    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const mainColor = getPrimaryColor();
    const textColor = isDark ? '#ffffff' : '#2d3436';
    const subTextColor = isDark ? '#bbbbbb' : '#666666';
    
    const config = getScaleConfig(0, currentUnit, mainColor, isDark);
    currentMaxLimit = config.max;

    // --- KONFIGURACJA KĄTÓW (300 stopni) ---
    const START_ANGLE = 230;
    const END_ANGLE = -50;

    // --- GRUBOŚĆ SKALI ---
    const SCALE_WIDTH = 28; // Zwiększono z 18 do 28

    // --- LOGIKA RESPANSYWNOŚCI ---
    const isMobile = window.innerWidth < 900;
    
    const initialRadius = isMobile ? '113%' : '113%';
    const initialCenter = isMobile ? ['50%', '57%'] : ['50%', '57%'];

    const option = {
        animationDuration: 150,
        animationDurationUpdate: 150,
        
        series: [
            {
                type: 'gauge',
                radius: initialRadius,
                center: initialCenter,
                
                startAngle: START_ANGLE, 
                endAngle: END_ANGLE,   
                min: 0,
                max: config.max,
                splitNumber: config.splitNumber,
                
                // --- 1. TOR (TŁO) ---
                axisLine: {
                    lineStyle: {
                        width: SCALE_WIDTH, // Używamy nowej grubości
                        color: [[1, config.trackColor]],
                        shadowBlur: 0
                    }
                },

                // --- 2. PASEK POSTĘPU ---
                progress: {
                    show: true,
                    width: SCALE_WIDTH, // Używamy nowej grubości
                    roundCap: false, 
                    itemStyle: {
                        color: {
                            type: 'linear',
                            x: 0, y: 0, x2: 1, y2: 0,
                            colorStops: [
                                { offset: 0, color: hexToRgba(mainColor, 0.2) }, 
                                { offset: 1, color: mainColor } 
                            ]
                        },
                        shadowBlur: 5,
                        shadowColor: hexToRgba(mainColor, 0.4)
                    }
                },

                // --- 3. WSKAZÓWKA ---
                pointer: {
                    show: true,
                    icon: 'path://M-2 10 L 2 10 L 0 -100 Z',
                    length: '85%',
                    width: 10,
                    offsetCenter: [0, '0%'],
                    itemStyle: { 
                        color: mainColor,
                        shadowBlur: 8,
                        shadowColor: hexToRgba(mainColor, 0.5)
                    }
                },

                // --- 4. KOTWICA ---
                anchor: {
                    show: true,
                    showAbove: true,
                    size: 20, // Lekko powiększona kotwica
                    itemStyle: { 
                        borderWidth: 5, 
                        borderColor: mainColor, 
                        color: isDark ? '#1a1a1a' : '#fff',
                        shadowBlur: 5,
                        shadowColor: hexToRgba(mainColor, 0.3)
                    }
                },

                // --- 5. PODZIAŁKA ---
                axisTick: {
                    distance: -SCALE_WIDTH, // Ticki wewnątrz paska
                    length: 6,
                    splitNumber: 5,
                    lineStyle: { 
                        color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)', 
                        width: 1 
                    }
                },
                splitLine: {
                    distance: -SCALE_WIDTH, // Linie podziału wewnątrz paska
                    length: SCALE_WIDTH,    // Na całą szerokość
                    lineStyle: { 
                        color: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)', 
                        width: 2 
                    }
                },

                // --- 6. LICZBY NA OSI ---
                axisLabel: {
                    distance: 40, // Odsunięte bardziej ze względu na grubszy pasek
                    color: subTextColor,
                    fontSize: 14, 
                    fontFamily: 'Roboto',
                    fontWeight: 500
                },

                title: { show: false },

                // --- 8. GŁÓWNA WARTOŚĆ (WYŁĄCZONA) ---
                detail: {
                    show: false, 
                    valueAnimation: true,
                    formatter: (val) => val ? parseFloat(val).toFixed(1) : '0.0',
                    color: textColor,
                    fontSize: 42,
                    fontWeight: '700',
                    offsetCenter: [0, '40%'],
                    fontFamily: 'Roboto Mono',
                },
                data: [{
                    value: 0,
                    name: translations[lang].gauge_title || 'Speed'
                }]
            },
            
            // --- SERIA 2: JEDNOSTKA (WYŁĄCZONA WIZUALNIE) ---
            {
                type: 'gauge',
                radius: initialRadius,
                center: initialCenter,
                startAngle: START_ANGLE,
                endAngle: END_ANGLE,
                min: 0, max: 100,
                axisLine: { show: false },
                progress: { show: false },
                pointer: { show: false },
                axisTick: { show: false },
                splitLine: { show: false },
                axisLabel: { show: false },
                title: { show: false },
                detail: { show: false },
                data: [{ value: 0, name: getUnitLabel() }]
            }
        ]
    };

    chart.setOption(option);
    
    // --- OBSŁUGA ZMIANY ROZMIARU OKNA ---
    resizeHandler = () => {
        if (!chart) return;
        chart.resize();
        
        const isSmall = window.innerWidth < 900;
        const newRadius = isSmall ? '113%' : '113%';
        const newCenter = isSmall ? ['50%', '57%'] : ['50%', '57%'];
        
        chart.setOption({
            series: [
                { radius: newRadius, center: newCenter },
                { radius: newRadius, center: newCenter }
            ]
        });
    };
    
    window.addEventListener('resize', resizeHandler);
}

export function reloadGauge() {
    initGauge();
}

export function checkGaugeRange(speedMbps, forceUpdate = false) {
    if (!chart) return;
    
    let val = speedMbps;
    if (currentUnit === 'mbs') val = speedMbps / 8;

    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const mainColor = getPrimaryColor();
    const newConfig = getScaleConfig(val, currentUnit, mainColor, isDark);

    if (newConfig.max !== currentMaxLimit || forceUpdate) {
        currentMaxLimit = newConfig.max;
        
        chart.setOption({
            series: [{
                max: newConfig.max,
                splitNumber: newConfig.splitNumber,
                axisLine: {
                    lineStyle: { color: [[1, newConfig.trackColor]] }
                }
            }]
        });
    }
}

export function resetGauge() {
    if (!chart) return;
    setIsResetting(true);
    
    chart.setOption({
        animationDurationUpdate: 1500,
        series: [{
            data: [{ value: 0, name: translations[lang].gauge_title || 'Speed' }]
        }]
    });

    setTimeout(() => {
        setIsResetting(false);
        if (chart) {
            chart.setOption({
                animationDurationUpdate: 100
            });
        }
    }, 1500); 
}

export function updateGaugeTexts() {
    if (!chart) return;
    chart.setOption({
        series: [
            { data: [{ name: translations[lang].gauge_title || 'Speed' }] },
            { data: [{ name: getUnitLabel() }] }
        ]
    });
}