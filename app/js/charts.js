import { el } from './utils.js';

// Zmienne do przechowywania instancji Chart.js
let chartDown = null;
let chartUp = null;

// --- KONFIGURACJA WYKRESÓW ---
function initMiniChart(canvasId, color) {
    const ctx = el(canvasId).getContext('2d');
    const fillColor = color.replace('1)', '0.2)'); 

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], 
            datasets: [{
                data: [],
                borderColor: color, 
                backgroundColor: fillColor, 
                borderWidth: 1, 
                pointRadius: 0, 
                fill: true,
                tension: 0.2 
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            devicePixelRatio: (window.devicePixelRatio || 1) * 2, 
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
    if(!chartDown) chartDown = initMiniChart('chart-down', 'rgba(98, 0, 234, 1)'); 
    if(!chartUp) chartUp = initMiniChart('chart-up', 'rgba(0, 229, 255, 1)'); 
}

export function updateChart(type, value) {
    const chart = type === 'down' ? chartDown : chartUp;
    if(!chart) return;
    if(chart.data.labels.length > 50) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }
    chart.data.labels.push('');
    chart.data.datasets[0].data.push(value);
    chart.update('none'); 
}