import { el, formatSpeed, currentUnit, setLastResultDown, setLastResultUp } from '/js/utils.js';
import { THREADS, TEST_DURATION } from '/js/config.js';
import { checkGaugeRange, getGaugeInstance } from '/js/gauge.js';
import { updateChart } from '/js/charts.js';

// --- LOCAL UTILS ---
const isMobileDevice = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
           || (window.innerWidth < 900);
};

// Funkcja pomocnicza do wysyłania logów do Dockera
const sendLogToDocker = (text) => {
    fetch('/api/log_client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text }),
        keepalive: true
    }).catch(() => {});
};

// --- WORKER CODE (INLINE BLOB) ---
const workerScript = `
self.onmessage = function(e) {
    const { command, url, maxBufferSize, minBufferSize, bufferSize, uploadData, baseUrl } = e.data;
    
    let fullUrl = url;
    try {
        if (!url.startsWith('http')) {
            fullUrl = new URL(url, baseUrl).href;
        }
    } catch(err) {
        self.postMessage({ type: 'log_err', text: "Worker URL error: " + err });
    }

    if (command === 'download') {
        runDownload(fullUrl);
    } else if (command === 'upload') {
        runUpload(fullUrl, maxBufferSize, minBufferSize);
    }
};

async function runDownload(url) {
    let totalBytes = 0;
    let startTime = performance.now();
    let lastReport = startTime;
    let maxChunkLogged = 0; // Do śledzenia wzrostu chunków

    while (true) {
        try {
            // Dodajemy losowy parametr t, aby uniknąć cache'owania przeglądarki
            const fetchUrl = url + (url.includes('?') ? '&' : '?') + 't=' + Math.random();
            const response = await fetch(fetchUrl, { cache: "no-store", keepalive: true });
            if (!response.body) return;
            
            const reader = response.body.getReader();
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                // --- LOGOWANIE WZROSTU CHUNKÓW (Monitorowanie bufora Download) ---
                // Logujemy tylko, jeśli otrzymaliśmy większą paczkę niż dotychczas
                // i jest ona znacząca (> 64KB), aby nie spamować logami na początku.
                if (value.length > maxChunkLogged) {
                    maxChunkLogged = value.length;
                    if (maxChunkLogged > 64 * 1024) {
                        self.postMessage({ 
                            type: 'log', 
                            text: "DL Chunk Growth: " + (maxChunkLogged/1024).toFixed(0) + " KB" 
                        });
                    }
                }

                totalBytes += value.length;
                const now = performance.now();
                
                // ZMIANA: Częstsze raportowanie (50ms zamiast 100ms) dla płynniejszego wykresu
                if (now - lastReport > 50) {
                    self.postMessage({ type: 'progress', bytes: totalBytes, time: now });
                    lastReport = now;
                }
            }
        } catch (e) {
            // Retry w pętli
        }
    }
}

function runUpload(url, maxBufferSize, minBufferSize) {
    let totalBytes = 0;
    const masterBuffer = new Uint8Array(maxBufferSize); 
    let currentSize = minBufferSize;
    
    let startTime = performance.now();
    let lastReport = startTime;

    const loop = () => {
        const reqStart = performance.now();
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url + (url.includes('?') ? '&' : '?') + 't=' + Math.random(), true);
        
        const chunk = masterBuffer.subarray(0, currentSize);
        const blob = new Blob([chunk]);

        let lastLoaded = 0;
        xhr.upload.onprogress = (e) => {
            const diff = e.loaded - lastLoaded;
            if (diff > 0) {
                totalBytes += diff;
                lastLoaded = e.loaded;
                
                const now = performance.now();
                // ZMIANA: Częstsze raportowanie (50ms zamiast 100ms)
                if (now - lastReport > 50) {
                    self.postMessage({ type: 'progress', bytes: totalBytes, time: now });
                    lastReport = now;
                }
            }
        };

        xhr.onload = () => {
            const reqEnd = performance.now();
            const duration = reqEnd - reqStart;

            // --- ALGORYTM ADAPTACYJNY BUFORA (Monitorowanie bufora Upload) ---
            if (duration < 50) {
                const oldSize = currentSize;
                currentSize *= 2;
                if (currentSize > maxBufferSize) currentSize = maxBufferSize;
                
                // LOGOWANIE ZMIANY BUFORA
                if (currentSize !== oldSize) {
                    self.postMessage({ 
                        type: 'log', 
                        text: "UL Buffer Up: " + (oldSize/1024).toFixed(0) + "KB -> " + (currentSize/1024).toFixed(0) + "KB" 
                    });
                }
            } 
            
            if (currentSize > maxBufferSize) currentSize = maxBufferSize;
            if (currentSize < minBufferSize) currentSize = minBufferSize;

            loop();
        };

        xhr.onerror = loop; 
        xhr.send(blob);
    };
    
    loop();
}
`;

// --- PHASE 1: PRE-TEST (HYBRID ICMP / HTTP) ---
export async function runPing() {
    sendLogToDocker(`[Phase 1] Starting Ping Test...`);

    // --- KROK 1: Próba ICMP (Backend -> Client) ---
    try {
        const start = performance.now();
        const res = await fetch('/api/ping_icmp');
        if (res.ok) {
            const data = await res.json();
            if (data.ping && data.ping > 0) {
                 sendLogToDocker(`[Phase 1] ICMP Result: ${data.ping} ms (Backend measured)`);
                 return data.ping;
            } else {
                 sendLogToDocker(`[Phase 1] ICMP failed (Firewall/Docker?), falling back to HTTP...`);
            }
        }
    } catch (e) {
        console.warn("ICMP Request failed", e);
    }

    // --- KROK 2: Fallback do HTTP ---
    const PING_COUNT = 15; 
    const pings = [];
    
    const pingRequest = (url) => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", url, true);
            const startFallback = performance.now();
            xhr.onreadystatechange = () => {
                if (xhr.readyState === 4) { 
                    const entries = performance.getEntriesByName(new URL(url, window.location.href).href);
                    if (entries.length > 0) {
                        resolve(entries[entries.length - 1].duration);
                    } else {
                        resolve(performance.now() - startFallback);
                    }
                }
            };
            xhr.onerror = () => reject("XHR Error");
            xhr.send();
        });
    };

    try { await pingRequest(`/api/ping?warmup=${Date.now()}`); } catch(e) {}

    for(let i=0; i<PING_COUNT; i++) {
        const url = `/api/ping?t=${Date.now()}_${i}`;
        performance.clearResourceTimings();
        try {
            const duration = await pingRequest(url);
            if (duration < 200) pings.push(duration);
            await new Promise(r => setTimeout(r, 5));
        } catch(e) {}
    }

    if (pings.length === 0) return 0;
    const minPing = Math.min(...pings);
    sendLogToDocker(`[Phase 1] HTTP Result: Min: ${minPing.toFixed(3)}ms`);
    return minPing; 
}

// --- ENGINE ---
class SpeedTestEngine {
    constructor(type, maxThreads) {
        this.type = type; 
        this.maxThreads = maxThreads; 
        this.activeWorkers = [];
        this.workerResults = new Map();
        this.startTime = null;
        this.blobUrl = null;
        this.maxTotalBytesSeen = 0; 
        this.uiSpeed = 0;
        this.prevUiSpeed = 0;
        this.timer = null;
        this.processTimer = null;
        this.status = 'warmup'; 
        this.prevSpeed = 0;
        this.stableCount = 0; 
        this.lastTotalBytes = 0;
        this.lastTime = 0;
        this.currentInstantSpeed = 0;
        this.startThreads = 2; 
        this.monitorInterval = 400; 
        this.minGrowth = 0.02; 
        
        if (this.maxThreads === 1) {
            this.startThreads = 1;
            this.status = 'sustain'; 
        }

        const blob = new Blob([workerScript], { type: "application/javascript" });
        this.blobUrl = URL.createObjectURL(blob);
    }

    addWorker() {
        if (this.activeWorkers.length >= this.maxThreads) return;
        const id = this.workerResults.size; 
        const worker = new Worker(this.blobUrl);
        
        worker.onerror = (err) => {
             console.error(`Worker ${id} error:`, err);
             sendLogToDocker(`[Worker ${id}] ERROR: ${err.message}`);
        };

        worker.onmessage = (e) => {
            if (e.data.type === 'progress') {
                const current = this.workerResults.get(id) || 0;
                if (e.data.bytes > current) {
                    this.workerResults.set(id, e.data.bytes);
                }
            } 
            else if (e.data.type === 'log') {
                const msg = `[Worker ${id}] ${e.data.text.replace('[Worker] ', '')}`;
                sendLogToDocker(msg);
            }
            else if (e.data.type === 'log_err') {
                sendLogToDocker(`[Worker ${id}] ERROR: ${e.data.text}`);
            }
        };

        let minBuf = 512 * 1024; 
        let maxBuf = 32 * 1024 * 1024; 

        if (isMobileDevice()) {
            minBuf = 256 * 1024; 
            maxBuf = 4 * 1024 * 1024; 
        }

        // ZMIANA: URL dla downloadu wskazuje teraz na endpoint API generujący dane w RAM
        // size=100 oznacza 100MB per request. W pętli worker i tak będzie to pobierał wielokrotnie.
        const downloadUrl = '/api/download?size=100'; 
        const uploadUrl = '/api/upload';

        const config = {
            command: this.type,
            url: this.type === 'download' ? downloadUrl : uploadUrl,
            minBufferSize: minBuf,
            maxBufferSize: maxBuf,
            uploadData: null,
            baseUrl: window.location.origin 
        };
        
        worker.postMessage(config);
        this.activeWorkers.push({ worker, id });
        
        if (!this.workerResults.has(id)) {
            this.workerResults.set(id, 0);
        }
        
        sendLogToDocker(`[Engine] Worker added (ID: ${id}). Target: ${config.url}`);
    }

    removeLastWorker() {
        if (this.activeWorkers.length <= this.startThreads) return;
        const workerObj = this.activeWorkers.pop(); 
        if (workerObj) {
            workerObj.worker.terminate();
            sendLogToDocker(`[Engine] Worker killed (ID: ${workerObj.id}).`);
        }
    }

    start(onUpdate, onFinish) {
        this.startTime = performance.now();
        this.lastTime = this.startTime;
        this.uiSpeed = 0;
        this.prevUiSpeed = 0;

        sendLogToDocker(`[Engine] Starting ${this.type.toUpperCase()} test. Threads: ${this.startThreads}->${this.maxThreads}`);

        if(el('thread-badge')) el('thread-badge').style.opacity = '1';

        for (let i = 0; i < this.startThreads; i++) {
            this.addWorker();
        }

        setTimeout(() => {
            if(this.status === 'warmup' && this.maxThreads > 1) {
                this.status = 'scaling';
                sendLogToDocker(`[Engine] Phase change: Warmup -> Scaling`);
            }
        }, 800);

        if (this.maxThreads > 1) {
            this.processTimer = setInterval(() => {
                this.evaluateNetworkConditions();
            }, this.monitorInterval);
        }

        // --- ZMIANA: ZWIĘKSZONA PŁYNNOŚĆ (50ms = 20 FPS) ---
        // Wcześniej 120ms powodowało, że wskazówka "skakała" przy szybkich zmianach.
        const UPDATE_INTERVAL = 50; 

        this.timer = setInterval(() => {
            const now = performance.now();
            const duration = (now - this.startTime) / 1000;

            let rawTotalBytes = 0;
            for (let bytes of this.workerResults.values()) rawTotalBytes += bytes;
            
            if (rawTotalBytes < this.maxTotalBytesSeen) rawTotalBytes = this.maxTotalBytesSeen;
            else this.maxTotalBytesSeen = rawTotalBytes;
            
            let totalBytes = rawTotalBytes;
            let avgSpeed = (duration > 0.1) ? (totalBytes * 8) / duration / 1e6 : 0;

            const dt = (now - this.lastTime) / 1000;
            if (dt > 0) {
                const db = totalBytes - this.lastTotalBytes;
                const safeDb = Math.max(0, db);
                let instSpeed = (safeDb * 8) / dt / 1e6;

                if (this.type === 'upload' && duration > 0.5) {
                    if (this.currentInstantSpeed > 5 && instSpeed < this.currentInstantSpeed * 0.90) {
                         instSpeed = this.currentInstantSpeed; 
                    }
                }

                const alpha = (this.type === 'upload') ? 0.1 : 0.3;
                
                if (this.currentInstantSpeed === 0) this.currentInstantSpeed = instSpeed;
                else this.currentInstantSpeed = (instSpeed * alpha) + (this.currentInstantSpeed * (1 - alpha));
            }

            this.lastTime = now;
            this.lastTotalBytes = totalBytes;

            // ZMIANA: Usunięto warunek natychmiastowego startu dla lepszej płynności
            // if (this.uiSpeed === 0) this.uiSpeed = avgSpeed;

            if (this.status === 'scaling' && avgSpeed < this.uiSpeed) {
                avgSpeed = this.uiSpeed; 
            }

            if (this.currentInstantSpeed < this.uiSpeed * 0.1 && this.uiSpeed > 5) {
                avgSpeed = this.uiSpeed;
            }

            // --- TŁUMIENIE WSKAZÓWKI (SMOOTHING) ---
            // ZMIANA: Zmniejszono faktor do 0.03 (z 0.06), ponieważ pętla działa teraz częściej (50ms vs 120ms).
            // Dzięki temu zachowujemy bezwładność, ale zyskujemy płynność ruchu.
            let riseFactor = 0.12; 
            let fallFactor = 0.06; 

            const uiAlpha = (avgSpeed > this.uiSpeed) ? riseFactor : fallFactor;
            this.uiSpeed = (avgSpeed * uiAlpha) + (this.uiSpeed * (1 - uiAlpha));

            // ZMIANA: Dostosowano dropLimit do częstszego odświeżania, aby wskazówka nie opadała zbyt szybko
            let dropLimit = (this.type === 'upload') ? 0.9995 : 0.998;
            
            if (this.uiSpeed < this.prevUiSpeed * dropLimit) {
                this.uiSpeed = this.prevUiSpeed * dropLimit;
            }

            // --- ZMIANA: OPÓŹNIENIE STARTU WSKAZÓWKI ---
            // Pozwala skali (gauge) dostosować się do dużej prędkości (dzięki avgSpeed),
            // zanim wskazówka (this.uiSpeed) zacznie się podnosić.
            const NEEDLE_DELAY_MS = 350;
            if (duration * 1000 < NEEDLE_DELAY_MS) {
                this.uiSpeed = 0;
            }

            this.prevUiSpeed = this.uiSpeed;

            // ZMIANA: Przekazujemy również 'avgSpeed' jako surowy cel, aby UI mogło dostosować skalę
            onUpdate(this.uiSpeed, avgSpeed, duration, this.activeWorkers.length);

            if (duration * 1000 >= TEST_DURATION) {
                this.stop();
                onFinish((totalBytes * 8) / duration / 1e6);
            }
        }, UPDATE_INTERVAL); 
    }

    evaluateNetworkConditions() {
        if (this.status !== 'scaling') return;
        if (!this.currentInstantSpeed || this.currentInstantSpeed <= 0) return;
        if (this.prevSpeed === 0) {
            this.prevSpeed = this.currentInstantSpeed;
            return;
        }
        const growth = (this.currentInstantSpeed - this.prevSpeed) / this.prevSpeed;
        const dropThreshold = (this.type === 'upload') ? -0.30 : -0.20;

        const isCrash = (growth < dropThreshold);
        const forceScaling = (!isCrash && this.activeWorkers.length < 4 && this.currentInstantSpeed > 5);

        if (growth > this.minGrowth || forceScaling) {
            if (this.activeWorkers.length < this.maxThreads) {
                this.addWorker();
                this.stableCount = 0; 
                if (forceScaling) {
                    sendLogToDocker(`[Engine] 🚀 Force Ramp-up (Stable but < 4 threads). Speed: ${this.currentInstantSpeed.toFixed(0)} Mbps`);
                }
            } else {
                this.status = 'sustain';
            }
        } 
        else if (isCrash) {
            if (this.currentInstantSpeed > 50) {
                sendLogToDocker(`[Engine] 🛑 Congestion detected (Drop ${(growth*100).toFixed(1)}%).`);
                this.removeLastWorker();
                this.status = 'sustain'; 
            }
        } 
        else {
            this.stableCount++;
            if (this.stableCount >= 5) {
                sendLogToDocker(`[Engine] 📊 Plateau detected.`);
                this.status = 'sustain';
            }
        }
        this.prevSpeed = this.currentInstantSpeed;
    }

    stop() {
        clearInterval(this.timer);
        clearInterval(this.processTimer);
        sendLogToDocker(`[Engine] Test finished. Threads active: ${this.activeWorkers.length}`);
        if(el('thread-badge')) el('thread-badge').style.opacity = '0.5';
        this.activeWorkers.forEach(w => w.worker.terminate());
        this.activeWorkers = [];
        this.workerResults.clear(); 
        if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    }
}

export function runDownload() {
    return new Promise((resolve) => {
        let maxT = (THREADS === 1) ? 1 : THREADS;
        if (THREADS > 1 && isMobileDevice()) maxT = Math.min(maxT, 8); 
        const engine = new SpeedTestEngine('download', maxT);
        const currentGauge = getGaugeInstance();

        engine.start(
            (speed, rawSpeed, duration, activeThreads) => {
                // ZMIANA: Używamy większej wartości (wskazówka lub cel) do ustalenia skali.
                // Dzięki temu, jeśli cel (rawSpeed) jest wysoki, skala od razu skoczy w górę.
                checkGaugeRange(Math.max(speed, rawSpeed)); 

                if(el('thread-count')) el('thread-count').innerText = activeThreads;
                let displaySpeed = (currentUnit === 'mbs') ? speed / 8 : speed;
                if (currentGauge) currentGauge.value = displaySpeed; 
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
        if (THREADS > 1) {
            maxT = isMobileDevice() ? Math.min(maxT, 8) : Math.min(maxT, 16);
        }
        const engine = new SpeedTestEngine('upload', maxT);
        const currentGauge = getGaugeInstance();

        engine.start(
            (speed, rawSpeed, duration, activeThreads) => {
                // ZMIANA: Analogicznie dla uploadu
                checkGaugeRange(Math.max(speed, rawSpeed));

                if(el('thread-count')) el('thread-count').innerText = activeThreads;
                let displaySpeed = (currentUnit === 'mbs') ? speed / 8 : speed;
                if (currentGauge) currentGauge.value = displaySpeed; 
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