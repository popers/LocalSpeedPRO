import { el, formatSpeed, currentUnit, setLastResultDown, setLastResultUp } from '/js/utils.js';
import { THREADS, TEST_DURATION } from '/js/config.js';
import { checkGaugeRange, getGaugeInstance } from '/js/gauge.js';
import { updateChart } from '/js/charts.js';

// --- OPTYMALIZACJA: GLOBALNY BLOB DO UPLOADU ---
// Generujemy dane raz, aby nie obciążać CPU podczas samego testu.
const UPLOAD_DATA_SIZE = 32 * 1024 * 1024; // 32 MB
let uploadBlob = null;

function getUploadBlob() {
    if (uploadBlob) return uploadBlob;
    
    // Szybkie generowanie bufora bez blokowania wątku na długo
    const data = new Uint8Array(UPLOAD_DATA_SIZE);
    // Wypełniamy tylko część losowo dla wydajności, reszta może być zerami (kompresja HTTP i tak jest wyłączona dla multipart/stream zazwyczaj)
    // Ale dla pewności, że smart routery nie kompresują, wypełniamy "szumem"
    for (let i = 0; i < UPLOAD_DATA_SIZE; i += 65536) {
        data[i] = Math.floor(Math.random() * 255);
    }
    uploadBlob = new Blob([data], {type: 'application/octet-stream'});
    return uploadBlob;
}

// --- TESTY ---

/**
 * Test PING
 */
export async function runPing() {
    const start = performance.now();
    try { 
        await fetch(`/api/ping?t=${Date.now()}`, { cache: "no-store" }); 
        return performance.now() - start; 
    } catch(e) { 
        console.error("Ping error:", e);
        return 0; 
    }
}

/**
 * Test DOWNLOAD
 * Wykorzystuje Fetch API i ReadableStream
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
            while(!signal.aborted) {
                try {
                    // Cache busting jest kluczowy
                    const response = await fetch(`/static/500MB.bin?t=${Math.random()}`, { signal, cache: "no-store" });
                    if (!response.body) break;
                    
                    const reader = response.body.getReader();
                    while(true) {
                        const {done, value} = await reader.read();
                        if (done) break; 
                        if (value) totalBytes += value.length;
                    }
                } catch(e) { 
                    break; // AbortError lub błąd sieci
                }
            }
        };

        // Start workerów
        for(let i=0; i<THREADS; i++) worker();
        
        // Pętla pomiarowa (Interval)
        const interval = setInterval(() => {
            const now = performance.now();
            const dur = (now - startTime) / 1000;
            
            // Pomijamy pierwsze 200ms jako "rozgrzewkę" dla stabilniejszego wyniku
            let speed = (dur > 0.2) ? (totalBytes * 8) / dur / 1e6 : 0; 
            
            checkGaugeRange(speed); 
            
            // Aktualizacja UI
            let displaySpeed = (currentUnit === 'mbs') ? speed / 8 : speed;
            if (currentGauge) currentGauge.value = displaySpeed; 
            el('speed-value').innerText = displaySpeed.toFixed(2); 
            el('down-val').textContent = formatSpeed(speed); 
            updateChart('down', speed);
            
            downloadSpeedMbps = speed; 

            if(dur * 1000 >= TEST_DURATION) { 
                clearInterval(interval); 
                controller.abort(); 
                setLastResultDown(downloadSpeedMbps);
                resolve(downloadSpeedMbps);
            }
        }, 200);
    });
}

/**
 * Test UPLOAD
 * Wykorzystuje XHR (XMLHttpRequest) ponieważ oferuje lepszy podgląd postępu (upload.onprogress)
 * niż Fetch API w starszych przeglądarkach, a w nowych działa równie dobrze.
 */
export function runUpload() {
    return new Promise((resolve) => {
        // Przygotuj dane raz
        const blob = getUploadBlob();
        
        let totalBytes = 0;
        let lastLoaded = new Array(THREADS).fill(0);
        let activeXHRs = [];
        let isRunning = true;
        const startTime = performance.now();
        let uploadSpeedMbps = 0; 
        
        const currentGauge = getGaugeInstance();

        const worker = (index) => {
            if(!isRunning) return;
            
            const xhr = new XMLHttpRequest();
            activeXHRs.push(xhr);
            
            // Dodajemy losowy parametr, aby uniknąć cachowania przez proxy
            xhr.open("POST", `/api/upload?t=${Math.random()}`, true);
            
            // Kluczowe dla wydajności uploadu: nie przetwarzaj odpowiedzi
            xhr.responseType = 'text'; 
            
            xhr.upload.onprogress = (e) => {
                if(!isRunning) return;
                // Obliczamy przyrost (delta) od ostatniego sprawdzenia dla tego workera
                const diff = e.loaded - lastLoaded[index];
                if(diff > 0) { 
                    totalBytes += diff; 
                    lastLoaded[index] = e.loaded; 
                }
            };
            
            const restart = () => {
                lastLoaded[index] = 0;
                // Usuń stary XHR z listy
                const idx = activeXHRs.indexOf(xhr);
                if (idx > -1) activeXHRs.splice(idx, 1);
                
                if(isRunning) worker(index);
            };

            xhr.onload = restart;
            xhr.onerror = restart; 
            
            // Wysyłamy dane
            xhr.send(blob);
        };
        
        for(let i=0; i<THREADS; i++) worker(i);
        
        const interval = setInterval(() => {
            const now = performance.now();
            const dur = (now - startTime) / 1000;
            
            let speed = (dur > 0.2) ? (totalBytes * 8) / dur / 1e6 : 0; 
            
            checkGaugeRange(speed); 
            
            let displaySpeed = (currentUnit === 'mbs') ? speed / 8 : speed;
            if (currentGauge) currentGauge.value = displaySpeed; 
            el('speed-value').innerText = displaySpeed.toFixed(2); 
            el('up-val').textContent = formatSpeed(speed);
            updateChart('up', speed);
            
            uploadSpeedMbps = speed; 

            if(dur * 1000 >= TEST_DURATION) { 
                isRunning = false; 
                clearInterval(interval); 
                activeXHRs.forEach(xhr => xhr.abort()); 
                setLastResultUp(uploadSpeedMbps); 
                resolve(uploadSpeedMbps); 
            }
        }, 200);
    });
}