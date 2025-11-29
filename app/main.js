// --- KONFIGURACJA 2.5 GBIT ---
const THREADS = 6; 
const TEST_DURATION = 12000; 

const translations = {
    pl: { 
        // status_ready usunięty, bo element usunięty z HTML
        start: "START", 
        history_title: "Historia Pomiarów", 
        down: "Pobieranie", 
        up: "Wysyłanie", 
        
        table_date: "Data",
        table_ping: "Ping",
        table_down: "Pobieranie",
        table_up: "Wysyłanie",
        rows_label: "Na stronę:",

        gauge_title: "PRĘDKOŚĆ",

        log_start: "Start Testu...", 
        log_ping_start: "Mierzenie Pingu...", 
        log_ping_res: "Ping: ", 
        log_down_start: "Rozpoczynanie pobierania...", 
        log_up_start: "Rozpoczynanie wysyłania...", 
        log_end: "Koniec Testu", 
        err: "Błąd: ",
        msg_lang: "Zmieniono język na Polski",
        msg_theme_dark: "Ustawiono motyw ciemny",
        msg_theme_light: "Ustawiono motyw jasny",
        msg_unit_mbps: "Zmieniono jednostkę na Mbps",
        msg_unit_mbs: "Zmieniono jednostkę na MB/s"
    },
    en: { 
        start: "START", 
        history_title: "Measurement History", 
        down: "Download", 
        up: "Upload", 
        
        table_date: "Date",
        table_ping: "Ping",
        table_down: "Download",
        table_up: "Upload",
        rows_label: "Per page:",

        gauge_title: "SPEED",

        log_start: "Starting Test...", 
        log_ping_start: "Pinging...", 
        log_ping_res: "Ping: ", 
        log_down_start: "Starting Download...", 
        log_up_start: "Starting Upload...", 
        log_end: "Test Finished.", 
        err: "Error: ",
        msg_lang: "Language changed to English",
        msg_theme_dark: "Dark theme enabled",
        msg_theme_light: "Light theme enabled",
        msg_unit_mbps: "Unit changed to Mbps",
        msg_unit_mbs: "Unit changed to MB/s"
    }
};

let lang = localStorage.getItem('ls_lang') || 'pl';
let currentUnit = localStorage.getItem('ls_unit') || 'mbps';
let gauge; 
let gaugeScaled = false; 

// --- NOWE: Zmienne do przechowywania ostatnich wyników (w Mbps) ---
let lastResultDown = 0;
let lastResultUp = 0;

// --- Wykresy w tle ---
let chartDown = null;
let chartUp = null;

// --- ZMIENNE PAGINACJI I SORTOWANIA ---
let currentPage = 1;
let itemsPerPage = 10;
let totalItems = 0;
let sortBy = 'date';
let sortOrder = 'desc';

const el = (id) => document.getElementById(id);

// --- HELPERY ---
function formatSpeed(valMbps) {
    if (currentUnit === 'mbs') return (valMbps / 8).toFixed(1);
    return valMbps.toFixed(1);
}

function getUnitLabel() {
    return currentUnit === 'mbs' ? 'MB/s' : 'Mbps';
}

const log = (msg) => {
    let container = el('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span class="material-icons" style="font-size:18px">info</span> ${msg}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastFadeOut 0.5s forwards ease-in';
        toast.addEventListener('animationend', () => toast.remove());
    }, 4000);
};

// --- AKTUALIZACJA UI ---
function updateTexts() {
    el('lang-toggle').innerText = lang.toUpperCase();
    el('unit-toggle').innerText = getUnitLabel();
    
    document.querySelectorAll('.unit-label').forEach(e => e.innerText = getUnitLabel());
    document.querySelectorAll('[data-key]').forEach(elem => {
        const key = elem.getAttribute('data-key');
        if (translations[lang][key]) elem.innerText = translations[lang][key];
    });

    if(gauge) {
        gauge.update({ 
            title: translations[lang].gauge_title,
            units: getUnitLabel()
        });
    }
}

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

function resetCharts() {
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

function initCharts() {
    if(!chartDown) chartDown = initMiniChart('chart-down', 'rgba(98, 0, 234, 1)'); 
    if(!chartUp) chartUp = initMiniChart('chart-up', 'rgba(0, 229, 255, 1)'); 
}

function updateChart(chart, value) {
    if(!chart) return;
    if(chart.data.labels.length > 50) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }
    chart.data.labels.push('');
    chart.data.datasets[0].data.push(value);
    chart.update('none'); 
}

// --- GAUGE ---
function getGaugeSize() { 
    const container = document.querySelector('.gauge-section');
    if (!container) return 300;

    // Pobieramy aktualne wymiary kontenera sekcji zegara
    const w = container.clientWidth;
    const h = container.clientHeight;

    // Marginesy bezpieczeństwa i miejsce na elementy pod zegarem
    // (Licznik cyfrowy, ping, przełącznik jednostek)
    // Musimy zostawić im około 130-140px wysokości na dole
    const paddingX = 40; 
    const bottomSpace = 140; 

    const availableWidth = w - paddingX;
    const availableHeight = h - bottomSpace;

    // Wybieramy mniejszy wymiar, aby zachować proporcje koła i zmieścić się w pudełku
    let size = Math.min(availableWidth, availableHeight);

    // Ustalamy minimalny rozmiar, żeby zegar nie zniknął przy dziwnym skalowaniu
    return Math.max(size, 280); 
}

function initGauge() {
    const size = getGaugeSize();
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    // Użyjemy niemal czarnego koloru tekstu dla trybu jasnego, aby zwiększyć kontrast
    const tickColor = isDark ? '#eeeeee' : '#2d3436'; 
    
    // Zmieniamy logikę: jeśli gauge istnieje, wystarczy update, nie musimy go rysować od nowa, 
    // chyba że jego rozmiar się zmienił (ale to obsłuży reloadGauge).
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
}

function checkGaugeRange(speedMbps) {
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

function reloadGauge() {
    const old = el('speed-gauge');
    // UWAGA: Sprawdzamy, czy canvas istnieje. Jeśli tak, usuwamy go, aby przerysować.
    if(old) old.remove(); 
    
    // Dodajemy nowy element canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'speed-gauge';
    document.querySelector('.gauge-section').prepend(canvas);
    
    // Zerujemy zmienną gauge, aby initGauge wiedziało, że ma rysować od nowa
    gauge = null; 
    initGauge();
}

// --- DB SYNC ---
async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        
        let shouldReloadGauge = false;
        
        if(data.lang) { 
            lang = data.lang; 
            localStorage.setItem('ls_lang', lang); 
        }
        if(data.theme) { 
            // Sprawdzamy, czy motyw się zmienił (dotyczy tylko autorytetu z API/DB)
            if (document.body.getAttribute('data-theme') !== data.theme) {
                shouldReloadGauge = true;
            }
            document.body.setAttribute('data-theme', data.theme); 
            localStorage.setItem('ls_theme', data.theme); 
        }
        if(data.unit) {
            // Sprawdzamy, czy jednostka się zmieniła
            if (currentUnit !== data.unit) {
                shouldReloadGauge = true;
            }
            currentUnit = data.unit;
            localStorage.setItem('ls_unit', currentUnit);
        }
        
        // ZMIANA: Przeładowujemy zegar TYLKO jeśli nastąpiła zmiana jednostki lub motywu z serwera, 
        // W przeciwnym razie initGauge() już został wywołany w window.onload
        if (shouldReloadGauge) {
            reloadGauge(); 
        }
        
        updateTexts();
    } catch(e) { console.error("Settings load error", e); }
}

async function saveSettings(newLang, newTheme, newUnit) {
    localStorage.setItem('ls_lang', newLang);
    localStorage.setItem('ls_theme', newTheme);
    localStorage.setItem('ls_unit', newUnit);
    try {
        await fetch('/api/settings', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ lang: newLang, theme: newTheme, unit: newUnit })
        });
    } catch(e) { console.error("Settings save error", e); }
}

// --- HISTORIA I PAGINACJA ---
async function loadHistory() {
    try {
        const res = await fetch(`/api/history?page=${currentPage}&limit=${itemsPerPage}&sort_by=${sortBy}&order=${sortOrder}`);
        const responseData = await res.json();
        
        const data = responseData.data; 
        totalItems = responseData.total;
        
        renderHistoryTable(data);
        updatePaginationControls();
        updateSortIcons();

    } catch(e) { console.error("History load error", e); }
}

function renderHistoryTable(data) {
    const tbody = el('history-table').querySelector('tbody');
    tbody.innerHTML = '';
    
    data.forEach(row => {
        const tr = `<tr>
            <td>${row.date}</td>
            <td>${row.ping.toFixed(1)} ms</td>
            <td>${formatSpeed(row.download)} ${getUnitLabel()}</td>
            <td>${formatSpeed(row.upload)} ${getUnitLabel()}</td>
        </tr>`;
        tbody.innerHTML += tr;
    });
}

function updatePaginationControls() {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const displayPage = totalItems > 0 ? currentPage : 1;
    const displayTotal = totalItems > 0 ? totalPages : 1;
    el('page-info').innerText = `${displayPage} / ${displayTotal}`;
    el('prev-page').disabled = currentPage <= 1;
    el('next-page').disabled = currentPage >= totalPages;
}

function updateSortIcons() {
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc'); 
        const icon = th.querySelector('.sort-icon');
        icon.innerText = 'unfold_more';
        
        if (th.getAttribute('data-sort') === sortBy) {
            th.classList.add(sortOrder === 'asc' ? 'sort-asc' : 'sort-desc');
            icon.innerText = sortOrder === 'asc' ? 'expand_less' : 'expand_more';
        }
    });
}

document.querySelectorAll('th.sortable').forEach(th => {
    th.onclick = () => {
        const column = th.getAttribute('data-sort');
        
        if (sortBy === column) {
            sortOrder = (sortOrder === 'asc') ? 'desc' : 'asc';
        } else {
            sortBy = column;
            sortOrder = 'desc';
        }
        currentPage = 1; 
        loadHistory();
    };
});

el('prev-page').onclick = () => { if (currentPage > 1) { currentPage--; loadHistory(); } };
el('next-page').onclick = () => { if (currentPage < Math.ceil(totalItems / itemsPerPage)) { currentPage++; loadHistory(); } };
el('rows-per-page').onchange = (e) => { itemsPerPage = parseInt(e.target.value); currentPage = 1; loadHistory(); };

// --- TESTS ---
async function runPing() {
    const start = performance.now();
    try { await fetch(`/api/ping?t=${Date.now()}`); return performance.now() - start; } catch(e) { return 0; }
}

function runDownload() {
    return new Promise((resolve) => {
        let totalBytes = 0;
        const controller = new AbortController(); 
        const signal = controller.signal;
        const startTime = performance.now();
        const worker = async () => {
            while(!signal.aborted) {
                try {
                    const response = await fetch(`/static/500MB.bin?t=${Math.random()}`, { signal });
                    const reader = response.body.getReader();
                    while(true) {
                        const {done, value} = await reader.read();
                        if (done) break; totalBytes += value.length;
                    }
                } catch(e) { if(e.name !== 'AbortError') break; }
            }
        };
        for(let i=0; i<THREADS; i++) worker();
        const interval = setInterval(() => {
            const now = performance.now();
            const dur = (now - startTime) / 1000;
            let speed = (dur > 0.5) ? (totalBytes * 8) / dur / 1e6 : 0;
            checkGaugeRange(speed); 
            
            let displaySpeed = (currentUnit === 'mbs') ? speed / 8 : speed;
            gauge.value = displaySpeed; 
            el('speed-value').innerText = displaySpeed.toFixed(2); 
            el('down-val').textContent = displaySpeed.toFixed(1);

            updateChart(chartDown, speed);

            if(dur > TEST_DURATION/1000) { 
                clearInterval(interval); 
                controller.abort(); 
                setTimeout(() => resolve(speed), 500); 
            }
        }, 200);
    });
}

function runUpload() {
    return new Promise((resolve) => {
        let totalBytes = 0;
        let lastLoaded = new Array(THREADS).fill(0);
        let activeXHRs = [];
        let isRunning = true;
        const startTime = performance.now();
        const dataSize = 64 * 1024 * 1024;
        const data = new Uint8Array(dataSize);
        const chunkSize = 65536;
        for(let i=0; i < dataSize; i += chunkSize) {
            const len = Math.min(chunkSize, dataSize - i);
            const view = new Uint8Array(data.buffer, i, len);
            window.crypto.getRandomValues(view);
        }
        const blob = new Blob([data], {type: 'application/octet-stream'});
        const worker = (index) => {
            if(!isRunning) return;
            const xhr = new XMLHttpRequest();
            activeXHRs.push(xhr);
            xhr.open("POST", `/api/upload?t=${Math.random()}`, true);
            xhr.upload.onprogress = (e) => {
                if(!isRunning) return;
                const diff = e.loaded - lastLoaded[index];
                if(diff > 0) { totalBytes += diff; lastLoaded[index] = e.loaded; }
            };
            xhr.onload = xhr.onerror = () => {
                lastLoaded[index] = 0;
                const arrIdx = activeXHRs.indexOf(xhr);
                if (arrIdx > -1) activeXHRs.splice(arrIdx, 1);
                if(isRunning) worker(index);
            };
            xhr.send(blob);
        };
        for(let i=0; i<THREADS; i++) worker(i);
        const interval = setInterval(() => {
            const now = performance.now();
            const dur = (now - startTime) / 1000;
            let speed = (dur > 0.5) ? (totalBytes * 8) / dur / 1e6 : 0;
            checkGaugeRange(speed); 
            
            let displaySpeed = (currentUnit === 'mbs') ? speed / 8 : speed;
            gauge.value = displaySpeed; 
            el('speed-value').innerText = displaySpeed.toFixed(2); 
            el('up-val').textContent = displaySpeed.toFixed(1);

            updateChart(chartUp, speed);

            if(dur > TEST_DURATION/1000) { 
                isRunning = false; 
                clearInterval(interval); 
                activeXHRs.forEach(xhr => xhr.abort()); 
                setTimeout(() => resolve(speed), 500); 
            }
        }, 200);
    });
}

el('start-btn').onclick = async () => {
    const btn = el('start-btn');
    btn.disabled = true;
    el('speed-value').innerText = "0.00";
    reloadGauge();
    
    resetCharts();

    try {
        log(translations[lang].log_start);
        await new Promise(r => setTimeout(r, 800));

        log(translations[lang].log_ping_start);
        const ping = await runPing();
        el('ping-text').textContent = ping.toFixed(1);

        el('card-down').classList.add('active');
        log(translations[lang].log_down_start);
        
        // Zapisujemy prędkość pobierania w zmiennej globalnej (w Mbps)
        const down = await runDownload(); 
        lastResultDown = down; 
        
        el('down-val').textContent = formatSpeed(down); 
        el('card-down').classList.remove('active');

        gauge.value = 0;
        el('speed-value').innerText = "0.00";
        await new Promise(r => setTimeout(r, 1000)); 

        el('card-up').classList.add('active');
        log(translations[lang].log_up_start);
        
        // Zapisujemy prędkość wysyłania w zmiennej globalnej (w Mbps)
        const up = await runUpload();
        lastResultUp = up;
        
        el('up-val').textContent = formatSpeed(up);
        el('card-up').classList.remove('active');

        log(translations[lang].log_end);
        await saveResult(ping, down, up);
        gauge.value = 0;
        el('speed-value').innerText = "0.00";
    } catch (error) {
        console.error(error);
        log(translations[lang].err + error.message);
    }
    btn.disabled = false;
};

async function saveResult(ping, down, up) {
    try {
        const currentTheme = document.body.getAttribute('data-theme') || 'dark';
        await fetch('/api/history', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ ping, download: down, upload: up, lang, theme: currentTheme })
        });
        currentPage = 1;
        sortBy = 'date'; 
        sortOrder = 'desc';
        setTimeout(loadHistory, 500); 
    } catch(e) { console.error("History save error", e); }
}

window.onload = () => {
    // Krok 1: Wczytujemy motyw z localStorage i ustawiamy go NATYCHMIAST, 
    // aby initGauge mogło odczytać właściwy kolor tickColor
    const savedTheme = localStorage.getItem('ls_theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
    
    lang = localStorage.getItem('ls_lang') || 'pl';
    currentUnit = localStorage.getItem('ls_unit') || 'mbps';

    // Krok 2: Inicjalizujemy zegar i wykresy, używając poprawnego, świeżo ustawionego motywu
    initGauge();
    initCharts(); 
    
    // Krok 3: Aktualizujemy teksty na podstawie poprawnie wczytanego języka/jednostki
    updateTexts();

    // Krok 4: Ładujemy ustawienia z serwera. Jeśli z serwera przyjdą inne ustawienia, 
    // zostaną zastosowane i nastąpi ewentualny reloadGauge (wewnątrz loadSettings)
    loadSettings().then(() => loadHistory());
    
    el('lang-toggle').onclick = () => { 
        lang = lang === 'pl' ? 'en' : 'pl'; 
        const currentTheme = document.body.getAttribute('data-theme');
        updateTexts(); 
        saveSettings(lang, currentTheme, currentUnit);
        log(translations[lang].msg_lang);
    };
    
    el('theme-toggle').onclick = () => { 
        const current = document.body.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', next);
        
        // ZMIANA: Przeładowanie zegara po zmianie motywu, aby kolory zostały natychmiast poprawione
        reloadGauge(); 

        saveSettings(lang, next, currentUnit);
        if(next === 'dark') log(translations[lang].msg_theme_dark);
        else log(translations[lang].msg_theme_light);
    };

    el('unit-toggle').onclick = () => {
        currentUnit = (currentUnit === 'mbps') ? 'mbs' : 'mbps';
        const currentTheme = document.body.getAttribute('data-theme');
        reloadGauge(); 
        updateTexts();
        
        // --- NOWE: Aktualizacja kafelków po zmianie jednostki ---
        if(lastResultDown > 0) el('down-val').textContent = formatSpeed(lastResultDown);
        if(lastResultUp > 0) el('up-val').textContent = formatSpeed(lastResultUp);
        
        loadHistory(); 
        
        saveSettings(lang, currentTheme, currentUnit);
        if(currentUnit === 'mbps') log(translations[lang].msg_unit_mbps);
        else log(translations[lang].msg_unit_mbs);
    };

    let resizeTimeout;
    window.onresize = () => { clearTimeout(resizeTimeout); resizeTimeout = setTimeout(reloadGauge, 200); };
};