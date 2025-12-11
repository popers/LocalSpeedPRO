import { getUnitLabel, lang, currentUnit, getPrimaryColor, hexToRgba } from './utils.js';
import { translations } from './config.js';

let chart = null;
let currentMaxLimit = 0;
let isResetting = false;

// Pobiera instancję wykresu (potrzebne czasem do resize)
export function getGaugeInstance() {
    return chart;
}

export function setIsResetting(state) {
    isResetting = state;
}

// Ustawia wartość na wskaźniku
export function setGaugeValue(val) {
    if (!chart || isResetting) return;
    
    // Konwersja dla MB/s jeśli trzeba
    let displayVal = val;
    if (currentUnit === 'mbs') displayVal = val / 8;

    // ZABEZPIECZENIE: Eliminacja NaN i null/undefined
    if (displayVal === null || displayVal === undefined || isNaN(displayVal)) {
        displayVal = 0;
    }
    
    // Zaokrąglamy wartość przekazywaną do wskazówki (logika animacji)
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

// Konfiguracja skali (identyczna logika progów jak wcześniej, ale zwraca config dla ECharts)
function getScaleConfig(value, unit, mainColor, isDark) {
    // Progi skalowania
    let tiers = [];

    if (unit === 'mbs') {
        tiers = [
            { max: 125, step: 25 },    // ~1 Gbps
            { max: 315, step: 45 },    // ~2.5 Gbps
            { max: 625, step: 125 },   // ~5 Gbps
            { max: 1250, step: 250 },  // ~10 Gbps
            { max: 2500, step: 500 }   // ~20 Gbps
        ];
    } else {
        tiers = [
            { max: 1000, step: 200 },  // 1 Gbps
            { max: 2500, step: 500 },  // 2.5 Gbps
            { max: 5000, step: 1000 }, // 5 Gbps
            { max: 10000, step: 2000 },// 10 Gbps
            { max: 20000, step: 4000 } // 20 Gbps
        ];
    }

    // Wybór tieru
    let selectedTier = tiers[0];
    for (let tier of tiers) {
        if (value > tier.max * 0.996) {
            continue; 
        } else {
            selectedTier = tier;
            break;
        }
    }
    // Fallback dla ultra prędkości
    if (value > selectedTier.max) {
        selectedTier = { max: Math.ceil(value / 1000) * 1000 + 1000, step: 1000 };
    }

    const splitNumber = selectedTier.max / selectedTier.step;

    // Kolory osi
    const axisColor = isDark ? '#333' : '#e0e0e0';
    
    // Definiujemy kolory segmentów
    const colorStops = [
        [0.3, hexToRgba(mainColor, 0.4)],
        [0.7, hexToRgba(mainColor, 0.7)],
        [1, mainColor]
    ];

    return {
        max: selectedTier.max,
        splitNumber: splitNumber,
        axisLineColor: colorStops, 
        bgColor: axisColor
    };
}

// Inicjalizacja ECharts
export function initGauge() {
    const dom = document.getElementById('speed-gauge');
    if (!dom) return;

    // Jeśli wykres już istnieje, usuwamy go (ważne przy zmianie motywu/resize)
    if (chart) {
        chart.dispose();
    }

    chart = echarts.init(dom, null, { renderer: 'canvas' });

    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const mainColor = getPrimaryColor();
    const textColor = isDark ? '#fff' : '#2d3436';
    const tickColor = isDark ? '#666' : '#ccc';
    
    // Startowa konfiguracja skali (dla 0)
    const config = getScaleConfig(0, currentUnit, mainColor, isDark);
    currentMaxLimit = config.max;

    const option = {
        // ZMIANA: Bardzo szybka animacja (50ms), aby wskazówka nadążała w trakcie testu
        animationDuration: 100,
        animationDurationUpdate: 100,
        
        series: [
            {
                type: 'gauge',
                // ZMIANA: Powiększenie licznika
                radius: '115%',
                // ZMIANA: Przesunięcie w dół na 59% (naprawa ucinania góry)
                center: ['50%', '58%'],
                startAngle: 225,
                endAngle: -45,
                min: 0,
                max: config.max,
                splitNumber: config.splitNumber,
                
                // Oś główna (tło paska)
                axisLine: {
                    lineStyle: {
                        width: 15,
                        color: [[1, config.bgColor]] 
                    }
                },
                // Pasek postępu (to co się wypełnia)
                progress: {
                    show: true,
                    width: 15,
                    itemStyle: {
                        color: {
                            type: 'linear',
                            x: 0, y: 0, x2: 1, y2: 0,
                            colorStops: [
                                { offset: 0, color: hexToRgba(mainColor, 0.3) },
                                { offset: 1, color: mainColor }
                            ]
                        }
                    }
                },
                // Wskazówka
                pointer: {
                    show: true,
                    length: '75%',
                    width: 5,
                    itemStyle: { color: mainColor }
                },
                // Kotwica wskazówki
                anchor: {
                    show: true,
                    showAbove: true,
                    size: 14,
                    itemStyle: { borderWidth: 2, borderColor: mainColor, color: isDark ? '#1e1e1e' : '#fff' }
                },
                // Kreski podziałki małe
                axisTick: {
                    distance: -15, 
                    length: 6,
                    lineStyle: { color: tickColor, width: 1 }
                },
                // Kreski podziałki duże
                splitLine: {
                    distance: -15,
                    length: 12,
                    lineStyle: { color: tickColor, width: 2 }
                },
                // Liczby na osi
                axisLabel: {
                    distance: 25,
                    color: textColor,
                    fontSize: 12,
                    fontFamily: 'Roboto'
                },
                // Tytuł (np. PRĘDKOŚĆ)
                title: {
                    // ZMIANA: Ukrycie napisu "Speed/Prędkość" pod licznikiem
                    show: false,
                    offsetCenter: [0, '85%'],
                    fontSize: 14,
                    color: textColor,
                    fontWeight: 500
                },
                // Jednostka i wartość w środku
                detail: {
                    valueAnimation: true,
                    // ZMIANA: Zabezpieczenie przed NaN i wymuszenie jednego miejsca po przecinku
                    formatter: function (value) {
                        if (value === null || value === undefined || isNaN(value)) {
                            return '0.0';
                        }
                        return parseFloat(value).toFixed(1);
                    },
                    color: mainColor,
                    fontSize: 32,
                    fontWeight: 'bold',
                    offsetCenter: [0, '60%'],
                    fontFamily: 'Roboto Mono'
                },
                data: [{
                    value: 0,
                    name: translations[lang].gauge_title || 'Speed'
                }]
            },
            // Druga seria - tylko dla etykiety jednostki pod wartością
            {
                type: 'gauge',
                radius: '115%', // Musi być takie samo jak wyżej
                center: ['50%', '58%'], // Musi być takie samo jak wyżej
                startAngle: 225,
                endAngle: -45,
                min: 0, max: 100,
                axisLine: { show: false },
                progress: { show: false },
                pointer: { show: false },
                axisTick: { show: false },
                splitLine: { show: false },
                axisLabel: { show: false },
                title: {
                    show: true,
                    offsetCenter: [0, '95%'], // Pod tytułem głównym
                    color: hexToRgba(textColor, 0.6),
                    fontSize: 12
                },
                detail: { show: false },
                data: [{ value: 0, name: getUnitLabel() }]
            }
        ]
    };

    chart.setOption(option);
    
    // Obsługa responsywności
    window.addEventListener('resize', () => {
        chart && chart.resize();
    });
}

// Funkcja do przeładowania (np. zmiana motywu, zmiana jednostki)
export function reloadGauge() {
    initGauge();
}

// Sprawdza zakres i aktualizuje skalę wykresu
export function checkGaugeRange(speedMbps, forceUpdate = false) {
    if (!chart) return;
    
    let val = speedMbps;
    if (currentUnit === 'mbs') val = speedMbps / 8;

    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const mainColor = getPrimaryColor();
    const newConfig = getScaleConfig(val, currentUnit, mainColor, isDark);

    // Aktualizujemy tylko jeśli max się zmienił
    if (newConfig.max !== currentMaxLimit || forceUpdate) {
        currentMaxLimit = newConfig.max;
        
        chart.setOption({
            series: [{
                max: newConfig.max,
                splitNumber: newConfig.splitNumber
            }]
        });
    }
}

// Animacja resetowania do zera
export function resetGauge() {
    if (!chart) return;
    setIsResetting(true);
    
    // ZMIANA: Wydłużamy czas animacji dla efektu powolnego opadania (1.5s)
    chart.setOption({
        animationDurationUpdate: 1500,
        series: [{
            data: [{ value: 0, name: translations[lang].gauge_title || 'Speed' }]
        }]
    });

    // Czekamy na zakończenie animacji, po czym przywracamy szybką animację
    setTimeout(() => {
        setIsResetting(false);
        // Przywracamy szybką reakcję dla kolejnego testu
        if (chart) {
            chart.setOption({
                animationDurationUpdate: 100
            });
        }
    }, 1500); 
}

// Aktualizacja tekstów (język, jednostka) bez pełnego reloadu
export function updateGaugeTexts() {
    if (!chart) return;
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#fff' : '#2d3436';

    chart.setOption({
        series: [
            {
                data: [{ name: translations[lang].gauge_title || 'Speed' }],
                axisLabel: { color: textColor },
                title: { color: textColor }
            },
            {
                data: [{ name: getUnitLabel() }],
                title: { color: hexToRgba(textColor, 0.6) }
            }
        ]
    });
}