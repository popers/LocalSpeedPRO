import { el } from './utils.js';

// Przechowujemy instancje, aby móc je wyczyścić
let chartDown = null;
let chartUp = null;

// --- BUFOR DANYCH (FIX NA ZNIKANIE) ---
// Przechowujemy dane niezależnie od instancji wykresu,
// aby móc je odtworzyć po zmianie motywu.
let storedData = {
    down: [],
    up: []
};
const MAX_POINTS = 60; // Stała długość okna danych

// --- KONFIGURACJA WYKRESÓW ---
function initMiniChart(canvasId, colorStr, dataPoints) {
    const canvas = el(canvasId);
    if (!canvas) return null;
    
    const ctx = canvas.getContext('2d');
    
    // --- DYNAMICZNY GRADIENT ---
    // Tworzymy gradient od koloru wiodącego do przezroczystości
    // To daje efekt "dynamicznego" powiązania ze stylem Gauge
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    
    // Parsowanie koloru rgba string na składowe, aby dodać alpha
    // Zakładamy format "rgba(r, g, b, 1)"
    const baseColor = colorStr.replace('1)', ''); // "rgba(r, g, b, "
    
    gradient.addColorStop(0, baseColor + '0.4)'); // Góra: 40% krycia
    gradient.addColorStop(1, baseColor + '0.0)'); // Dół: 0% krycia (zanikanie)

    // Przygotowanie etykiet (pustych) dla istniejących punktów
    const labels = new Array(dataPoints.length).fill('');

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels, 
            datasets: [{
                data: [...dataPoints], // Kopiujemy dane z bufora
                borderColor: colorStr, 
                backgroundColor: gradient, // Używamy gradientu zamiast flat color
                borderWidth: 2, 
                pointRadius: 0, 
                fill: true,
                tension: 0.4, // Gładka linia
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
    // 1. Czyścimy bufor danych
    storedData.down = [];
    storedData.up = [];

    // 2. Czyścimy wykresy wizualnie
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
    if (chartDown) { chartDown.destroy(); chartDown = null; }
    if (chartUp) { chartUp.destroy(); chartUp = null; }

    const isDark = document.body.getAttribute('data-theme') === 'dark';

    // LOGIKA KOLORÓW (Spójna z Gauge):
    // Tryb Ciemny: Jasny fiolet (#bb86fc)
    // Tryb Jasny: Głęboki fiolet (#6200ea)
    const themeColor = isDark ? 'rgba(187, 134, 252, 1)' : 'rgba(98, 0, 234, 1)';
    
    // Inicjalizujemy wykresy przekazując im zapamiętane dane (storedData)
    // Dzięki temu po reloadzie (zmiana motywu) wykres "wstaje" z danymi.
    chartDown = initMiniChart('chart-down', themeColor, storedData.down); 
    chartUp = initMiniChart('chart-up', themeColor, storedData.up); 
}

export function updateChart(type, value) {
    // 1. Aktualizacja Bufora Danych (Persystencja)
    const buffer = type === 'down' ? storedData.down : storedData.up;
    if (buffer.length > MAX_POINTS) buffer.shift();
    buffer.push(value);

    // 2. Aktualizacja Wykresu (Wizualizacja)
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