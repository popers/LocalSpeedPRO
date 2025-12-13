import { el, getPrimaryColor, hexToRgba } from './utils.js';

let chartDown = null;
let chartUp = null;
let resizeHandler = null;

let storedData = {
    down: [],
    up: []
};
const MAX_POINTS = 60; 

function initEChart(domId, colorHex, dataPoints) {
    const dom = el(domId);
    if (!dom) return null;

    // Jeżeli instancja już istnieje, usuwamy ją przed stworzeniem nowej
    const existing = echarts.getInstanceByDom(dom);
    if (existing) {
        existing.dispose();
    }
    
    const chart = echarts.init(dom, null, { renderer: 'canvas' });

    // Przygotowanie pustych etykiet dla osi X
    const labels = new Array(MAX_POINTS).fill('');
    // Uzupełnienie danych zerami, jeśli jest ich mniej niż MAX_POINTS (dla ładniejszego startu)
    // Chociaż ECharts radzi sobie z mniejszą ilością danych, tutaj po prostu przekażemy to co mamy.

    const option = {
        grid: {
            left: -10,
            right: -10,
            top: 0,
            bottom: 0,
            containLabel: false
        },
        xAxis: {
            type: 'category',
            show: false,
            boundaryGap: false,
            data: labels
        },
        yAxis: {
            type: 'value',
            show: false,
            min: 0
        },
        series: [{
            type: 'line',
            // --- KONFIGURACJA WYGŁADZANIA ---
            // false = brak wygładzania (linie proste)
            // true = domyślne wygładzanie (~0.5)
            // wartość 0.0 - 1.0 = stopień krzywizny (np. 0.3 to lekkie, 0.8 to bardzo okrągłe)
            smooth: 1.0,
            showSymbol: false,
            lineStyle: {
                width: 3,
                color: colorHex
            },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: hexToRgba(colorHex, 0.9) }, // Góra: 40% krycia
                    { offset: 1, color: hexToRgba(colorHex, 0.0) }  // Dół: 0% krycia
                ])
            },
            data: [...dataPoints],
            animation: true // Wyłączamy animacje dla lepszej wydajności przy szybkim odświeżaniu
        }]
    };

    chart.setOption(option);
    return chart;
}

export function resetCharts() {
    storedData.down = [];
    storedData.up = [];

    if(chartDown) {
        chartDown.setOption({ series: [{ data: [] }] });
    }
    if(chartUp) {
        chartUp.setOption({ series: [{ data: [] }] });
    }
}

export function initCharts() {
    // Czyszczenie starego handlera resize
    if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
    }

    const themeColor = getPrimaryColor();
    
    chartDown = initEChart('chart-down', themeColor, storedData.down); 
    chartUp = initEChart('chart-up', themeColor, storedData.up); 

    // Nowy handler resize
    resizeHandler = () => {
        if (chartDown) chartDown.resize();
        if (chartUp) chartUp.resize();
    };
    window.addEventListener('resize', resizeHandler);
}

export function updateChart(type, value) {
    const buffer = type === 'down' ? storedData.down : storedData.up;
    
    // Zarządzanie buforem danych
    if (buffer.length > MAX_POINTS) buffer.shift();
    buffer.push(value);

    const chart = type === 'down' ? chartDown : chartUp;
    if(!chart) return;
    
    // Aktualizacja danych w wykresie
    chart.setOption({
        series: [{
            data: buffer
        }]
    });
}