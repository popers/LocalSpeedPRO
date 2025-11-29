import { el } from './utils.js';

// Przechowujemy instancje, aby móc je wyczyścić
let chartDown = null;
let chartUp = null;

// --- KONFIGURACJA WYKRESÓW ---
function initMiniChart(canvasId, color) {
    const canvas = el(canvasId);
    if (!canvas) return null;
    
    const ctx = canvas.getContext('2d');
    const fillColor = color.replace('1)', '0.2)'); 

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], 
            datasets: [{
                data: [],
                borderColor: color, 
                backgroundColor: fillColor, 
                borderWidth: 2, // Lekko grubsza linia
                pointRadius: 0, 
                fill: true,
                tension: 0.3, // Łagodniejsze krzywe
                cubicInterpolationMode: 'monotone'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false, // Wyłączamy animację dla płynności przy częstym update
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
    // Czyścimy dane, ale nie niszczymy instancji (wydajniej)
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
    // CRITICAL: Zawsze niszcz stare instancje przed stworzeniem nowych
    if (chartDown) {
        chartDown.destroy();
        chartDown = null;
    }
    if (chartUp) {
        chartUp.destroy();
        chartUp = null;
    }

    chartDown = initMiniChart('chart-down', 'rgba(98, 0, 234, 1)'); 
    chartUp = initMiniChart('chart-up', 'rgba(0, 229, 255, 1)'); 
}

export function updateChart(type, value) {
    const chart = type === 'down' ? chartDown : chartUp;
    if(!chart) return;
    
    // Efekt "przesuwającego się okna" - trzymamy ostatnie 60 punktów
    if(chart.data.labels.length > 60) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }
    chart.data.labels.push('');
    chart.data.datasets[0].data.push(value);
    
    // 'none' mode jest bardzo ważny dla wydajności przy szybkim update
    chart.update('none'); 
}