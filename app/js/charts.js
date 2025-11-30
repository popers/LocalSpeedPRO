import { el, getPrimaryColor, hexToRgba } from './utils.js';

let chartDown = null;
let chartUp = null;

let storedData = {
    down: [],
    up: []
};
const MAX_POINTS = 60; 

function initMiniChart(canvasId, colorHex, dataPoints) {
    const canvas = el(canvasId);
    if (!canvas) return null;
    
    const ctx = canvas.getContext('2d');
    
    // ZMIANA: Używamy przekazanego koloru Hex do stworzenia gradientu RGBA
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, hexToRgba(colorHex, 0.4)); // Góra: 40% krycia
    gradient.addColorStop(1, hexToRgba(colorHex, 0.0)); // Dół: 0% krycia

    const labels = new Array(dataPoints.length).fill('');

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels, 
            datasets: [{
                data: [...dataPoints], 
                borderColor: colorHex, // Pełny kolor Hex dla linii
                backgroundColor: gradient, 
                borderWidth: 2, 
                pointRadius: 0, 
                fill: true,
                tension: 0.4, 
                cubicInterpolationMode: 'monotone'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false, 
            devicePixelRatio: window.devicePixelRatio || 1, 
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            scales: {
                x: { display: false },
                y: { display: false, min: 0 }
            },
            layout: { padding: 0 }
        }
    });
}

export function resetCharts() {
    storedData.down = [];
    storedData.up = [];

    if(chartDown) {
        chartDown.data.labels = [];
        chartDown.data.datasets[0].data = [];
        chartDown.update();
    }
    if(chartUp) {
        chartUp.data.labels = [];
        chartUp.data.datasets[0].data = [];
        chartUp.update();
    }
}

export function initCharts() {
    if (chartDown) { chartDown.destroy(); chartDown = null; }
    if (chartUp) { chartUp.destroy(); chartUp = null; }

    // ZMIANA: Pobieramy dynamiczny kolor
    const themeColor = getPrimaryColor();
    
    chartDown = initMiniChart('chart-down', themeColor, storedData.down); 
    chartUp = initMiniChart('chart-up', themeColor, storedData.up); 
}

export function updateChart(type, value) {
    const buffer = type === 'down' ? storedData.down : storedData.up;
    if (buffer.length > MAX_POINTS) buffer.shift();
    buffer.push(value);

    const chart = type === 'down' ? chartDown : chartUp;
    if(!chart) return;
    
    if(chart.data.labels.length > MAX_POINTS) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }
    chart.data.labels.push('');
    chart.data.datasets[0].data.push(value);
    
    chart.update('none'); 
}