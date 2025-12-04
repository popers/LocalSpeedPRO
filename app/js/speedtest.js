import { el, formatSpeed, currentUnit, setLastResultDown, setLastResultUp } from '/js/utils.js';
import { THREADS, TEST_DURATION } from '/js/config.js';
import { checkGaugeRange, getGaugeInstance } from '/js/gauge.js';
import { updateChart } from '/js/charts.js';

// --- LOCAL UTILS ---
// Definiujemy lokalnie, aby uniknąć problemów z cachem importów
const isMobileDevice = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
           || (window.innerWidth < 900);
};

// --- WORKER CODE (INLINE BLOB) ---
const workerScript = `
self.onmessage = function(e) {
    const { command, url, bufferSize, uploadData, baseUrl } = e.data;
    
    // FIX: Budujemy pełny URL, bo w Blob Workerze relatywne ścieżki mogą nie działać
    let fullUrl = url;
    try {
        if (!url.startsWith('http')) {
            fullUrl = new URL(url, baseUrl).href;
        }
    } catch(err) {
        console.error("Worker URL error:", err);
    }

    if (command === 'download') {
        runDownload(fullUrl);
    } else if (command === 'upload') {
        runUpload(fullUrl, uploadData, bufferSize);
    }
};

async function runDownload(url) {
    let totalBytes = 0;
    let startTime = performance.now();
    let lastReport = startTime;

    while (true) {
        try {
            // Cache busting
            const fetchUrl = url + (url.includes('?') ? '&' : '?') + 't=' + Math.random();
            const response = await fetch(fetchUrl, { cache: "no-store", keepalive: true });
            if (!response.body) return;
            
            const reader = response.body.getReader();
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                totalBytes += value.length;
                const now = performance.now();
                
                if (now - lastReport > 100) {
                    self.postMessage({ type: 'progress', bytes: totalBytes, time: now });
                    lastReport = now;
                }
            }
        } catch (e) {
            // Retry on error
        }
    }
}

function runUpload(url, dataBlob, bufferSize) {
    let totalBytes = 0;
    const blob = dataBlob || new Blob([new Uint8Array(bufferSize)]); 
    let startTime = performance.now();
    let lastReport = startTime;

    const loop = () => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url + (url.includes('?') ? '&' : '?') + 't=' + Math.random(), true);
        
        let lastLoaded = 0;
        xhr.upload.onprogress = (e) => {
            const diff = e.loaded - lastLoaded;
            if (diff > 0) {
                totalBytes += diff;
                lastLoaded = e.loaded;
                
                const now = performance.now();
                if (now - lastReport > 100) {
                    self.postMessage({ type: 'progress', bytes: totalBytes, time: now });
                    lastReport = now;
                }
            }
        };

        xhr.onload = loop; 
        xhr.onerror = loop; 
        xhr.send(blob);
    };
    
    loop();
}
`;

// --- ENGINE KLASA (ZARZĄDZANIE WĄTKAMI) ---

class SpeedTestEngine {
    constructor(type, maxThreads) {
        this.type = type; 
        this.maxThreads = maxThreads; 
        this.activeWorkers = [];
        this.workerResults = new Map();
        this.startTime = null;
        this.blobUrl = null;
        this.timer = null;
        this.rampUpTimer = null;
        
        this.startThreads = 2; 
        this.rampUpIncrement = isMobileDevice() ? 1 : 2; 
        
        if (this.maxThreads === 1) {
            this.startThreads = 1;
            this.rampUpIncrement = 0;
        }

        const blob = new Blob([workerScript], { type: "application/javascript" });
        this.blobUrl = URL.createObjectURL(blob);
    }

    addWorker() {
        if (this.activeWorkers.length >= this.maxThreads) return;

        const id = this.activeWorkers.length;
        const worker = new Worker(this.blobUrl);
        
        // Obsługa błędów workera
        worker.onerror = (err) => {
            console.error(`Worker ${id} error:`, err.message, err);
        };
        
        worker.onmessage = (e) => {
            if (e.data.type === 'progress') {
                this.workerResults.set(id, e.data.bytes);
            }
        };

        const config = {
            command: this.type,
            url: this.type === 'download' ? '/static/100MB.bin' : '/api/upload',
            bufferSize: isMobileDevice() ? 1024 * 1024 : 8 * 1024 * 1024,
            uploadData: null,
            baseUrl: window.location.origin // FIX: Przekazujemy origin strony
        };
        
        worker.postMessage(config);
        this.activeWorkers.push(worker);
        this.workerResults.set(id, 0);
        
        // ZMIANA: Odkomentowano i sformatowano logowanie dodawania wątków
        console.log(`%c[Engine] 🚀 Worker ${id+1} added. Total: ${this.activeWorkers.length}`, 'color: #00e676; font-weight: bold;');
    }

    start(onUpdate, onFinish) {
        this.startTime = performance.now();
        
        // Log startowy
        console.log(`%c[Engine] Starting ${this.type} test (Max Threads: ${this.maxThreads})`, 'color: #2979ff; font-weight: bold;');

        for (let i = 0; i < this.startThreads; i++) {
            this.addWorker();
        }

        if (this.rampUpIncrement > 0) {
            this.rampUpTimer = setInterval(() => {
                if (this.activeWorkers.length < this.maxThreads) {
                    for(let k=0; k<this.rampUpIncrement; k++) {
                        this.addWorker();
                    }
                } else {
                    clearInterval(this.rampUpTimer);
                }
            }, 1000);
        }

        this.timer = setInterval(() => {
            const now = performance.now();
            const duration = (now - this.startTime) / 1000;

            let totalBytes = 0;
            for (let bytes of this.workerResults.values()) {
                totalBytes += bytes;
            }

            let speed = (duration > 0.2) ? (totalBytes * 8) / duration / 1e6 : 0;
            
            // ZMIANA: Opcjonalne logowanie statusu co 1 sekundę w konsoli (żeby nie spamować)
            if (Math.floor(duration * 10) % 10 === 0) {
                 // console.debug(`[Status] ${speed.toFixed(2)} Mbps | Threads: ${this.activeWorkers.length}`);
            }

            onUpdate(speed, duration, this.activeWorkers.length);

            if (duration * 1000 >= TEST_DURATION) {
                this.stop();
                onFinish(speed);
            }
        }, 150); 
    }

    stop() {
        clearInterval(this.timer);
        clearInterval(this.rampUpTimer);
        
        console.log(`%c[Engine] Test finished. Final Threads: ${this.activeWorkers.length}`, 'color: #ff1744; font-weight: bold;');

        this.activeWorkers.forEach(w => w.terminate());
        this.activeWorkers = [];
        
        if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    }
}

// --- FUNKCJE TESTOWE (PUBLIC API) ---

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

export function runDownload() {
    return new Promise((resolve) => {
        let maxT = (THREADS === 1) ? 1 : THREADS;
        
        if (THREADS > 1 && isMobileDevice()) {
            maxT = Math.min(maxT, 4); 
        }

        const engine = new SpeedTestEngine('download', maxT);
        const currentGauge = getGaugeInstance();

        engine.start(
            (speed, duration, activeThreads) => {
                checkGaugeRange(speed); 
                
                let displaySpeed = (currentUnit === 'mbs') ? speed / 8 : speed;
                if (currentGauge) currentGauge.value = displaySpeed; 
                el('speed-value').innerText = displaySpeed.toFixed(2); 
                el('down-val').textContent = formatSpeed(speed); 
                updateChart('down', speed);
            },
            (finalSpeed) => {
                setLastResultDown(finalSpeed);
                resolve(finalSpeed);
            }
        );
    });
}

export function runUpload() {
    return new Promise((resolve) => {
        let maxT = (THREADS === 1) ? 1 : THREADS;
        if (THREADS > 1 && isMobileDevice()) {
            maxT = Math.min(maxT, 4);
        }

        const engine = new SpeedTestEngine('upload', maxT);
        const currentGauge = getGaugeInstance();

        engine.start(
            (speed, duration, activeThreads) => {
                checkGaugeRange(speed); 
                
                let displaySpeed = (currentUnit === 'mbs') ? speed / 8 : speed;
                if (currentGauge) currentGauge.value = displaySpeed; 
                el('speed-value').innerText = displaySpeed.toFixed(2); 
                el('up-val').textContent = formatSpeed(speed);
                updateChart('up', speed);
            },
            (finalSpeed) => {
                setLastResultUp(finalSpeed);
                resolve(finalSpeed);
            }
        );
    });
}