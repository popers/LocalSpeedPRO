import { el, formatSpeed, currentUnit, setLastResultDown, setLastResultUp } from '/js/utils.js';
import { THREADS, TEST_DURATION } from '/js/config.js';
import { checkGaugeRange, getGaugeInstance } from '/js/gauge.js';
import { updateChart } from '/js/charts.js';

// --- TESTY ---

/**
 * Uruchamia test ping, mierząc opóźnienie do serwera.
 * @returns {Promise<number>} Zmierzony czas PING w milisekundach.
 */
export async function runPing() {
    const start = performance.now();
    try { 
        // Wysłanie zapytania do endpointu /api/ping
        await fetch(`/api/ping?t=${Date.now()}`); 
        return performance.now() - start; 
    } catch(e) { 
        console.error("Ping error:", e);
        return 0; 
    }
}

/**
 * Uruchamia test pobierania (Download), używając wielu równoległych strumieni (fetch).
 * Zapewnia gwarancję zakończenia wszystkich workerów po upływie czasu testu.
 * @returns {Promise<number>} Średnia prędkość pobierania w Mbps.
 */
export function runDownload() {
    return new Promise((resolve) => {
        let totalBytes = 0;
        const controller = new AbortController(); 
        const signal = controller.signal;
        const startTime = performance.now();
        let downloadSpeedMbps = 0; 
        
        const currentGauge = getGaugeInstance();
        
        const worker = async () => {
            // Pętla do ciągłego pobierania testowego pliku binarnego (500MB.bin)
            while(!signal.aborted) {
                try {
                    // Dodano Math.random() do URL, aby zapobiec cachowaniu
                    const response = await fetch(`/static/500MB.bin?t=${Math.random()}`, { signal });
                    const reader = response.body.getReader();
                    while(true) {
                        const {done, value} = await reader.read();
                        if (done) break; 
                        totalBytes += value.length;
                    }
                } catch(e) { 
                    // AbortError lub inne błędy
                    break;
                }
            }
        };

        // Uruchomienie workerów
        for(let i=0; i<THREADS; i++) worker();
        
        // Interwał aktualizacji UI i kontroli czasu
        const interval = setInterval(() => {
            const now = performance.now();
            const dur = (now - startTime) / 1000;
            // Obliczanie prędkości (Bity na sek. / 1 mln = Mbps)
            let speed = (dur > 0.5) ? (totalBytes * 8) / dur / 1e6 : 0; 
            
            // Aktualizacja elementów UI
            checkGaugeRange(speed); 
            let displaySpeed = (currentUnit === 'mbs') ? speed / 8 : speed;
            if (currentGauge) currentGauge.value = displaySpeed; 
            el('speed-value').innerText = displaySpeed.toFixed(2); 
            el('down-val').textContent = formatSpeed(speed); 
            updateChart('down', speed);
            downloadSpeedMbps = speed; 

            if(dur * 1000 >= TEST_DURATION) { 
                // ZATRZYMANIE, JEŚLI OSIĄGNIĘTO CZAS TESTU
                clearInterval(interval); 
                controller.abort(); // Przerwanie wszystkich aktywnych fetchów
                setLastResultDown(downloadSpeedMbps); // Zapisujemy wynik do stanu globalnego
                resolve(downloadSpeedMbps); // Rozwiązanie Promise, aby umożliwić kontynuację
            }
        }, 200);
    });
}

/**
 * Uruchamia test wysyłania (Upload), używając wielu równoległych XHR.
 * @returns {Promise<number>} Średnia prędkość wysyłania w Mbps.
 */
export function runUpload() {
    return new Promise((resolve) => {
        let totalBytes = 0;
        let lastLoaded = new Array(THREADS).fill(0);
        let activeXHRs = [];
        let isRunning = true;
        const startTime = performance.now();
        const dataSize = 64 * 1024 * 1024; // 64 MB na BLOB
        let uploadSpeedMbps = 0; 
        
        const currentGauge = getGaugeInstance();

        // Generowanie losowego BLOB-a
        const data = new Uint8Array(dataSize);
        const MAX_CHUNK_SIZE = 65536; 
        for(let i = 0; i < dataSize; i += MAX_CHUNK_SIZE) {
            const len = Math.min(MAX_CHUNK_SIZE, dataSize - i);
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
            
            const onWorkerFinish = () => {
                lastLoaded[index] = 0;
                // Usuwamy worker z aktywnej listy
                const arrIdx = activeXHRs.indexOf(xhr);
                if (arrIdx > -1) activeXHRs.splice(arrIdx, 1);
                
                if(isRunning) {
                    setTimeout(() => worker(index), 50); 
                }
            };
            
            // Poprawa: xhr.onerror musi usunąć XHR z listy i zrestartować worker, jeśli czas nie minął
            xhr.onload = onWorkerFinish;
            xhr.onerror = onWorkerFinish; 

            xhr.send(blob);
        };
        
        for(let i=0; i<THREADS; i++) worker(i);
        
        // Interwał aktualizacji UI i kontroli czasu
        const interval = setInterval(() => {
            const now = performance.now();
            const dur = (now - startTime) / 1000;
            let speed = (dur > 0.5) ? (totalBytes * 8) / dur / 1e6 : 0; 
            
            checkGaugeRange(speed); 
            let displaySpeed = (currentUnit === 'mbs') ? speed / 8 : speed;
            if (currentGauge) currentGauge.value = displaySpeed; 
            el('speed-value').innerText = displaySpeed.toFixed(2); 
            el('up-val').textContent = formatSpeed(speed);
            updateChart('up', speed);
            uploadSpeedMbps = speed; 

            if(dur * 1000 >= TEST_DURATION) { 
                // ZATRZYMANIE, JEŚLI OSIĄGNIĘTO CZAS TESTU
                isRunning = false; // Zatrzymaj tworzenie nowych workerów
                clearInterval(interval); 
                activeXHRs.forEach(xhr => xhr.abort()); // Przerwanie wszystkich aktywnych requestów
                setLastResultUp(uploadSpeedMbps); // Zapisujemy wynik do stanu globalnego
                resolve(uploadSpeedMbps); // Rozwiązanie Promise, aby umożliwić kontynuację
            }
        }, 200);
    });
}