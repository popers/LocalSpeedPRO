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
        keepalive: true // Ważne: pozwala wysłać log nawet jak przeglądarka jest zajęta
    }).catch(() => {}); // Ignorujemy błędy logowania (fire & forget)
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

    while (true) {
        try {
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
            // Retry
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
        
        // --- DEBUG LOGGING ---
        // Dodano logowanie rozmiaru bufora przy każdej próbie wysłania
        self.postMessage({ 
            type: 'log', 
            text: \`[Upload Debug] Buffer: \${currentSize} bytes\` 
        });
        
        const chunk = masterBuffer.subarray(0, currentSize);
        const blob = new Blob([chunk]);

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

        xhr.onload = () => {
            const reqEnd = performance.now();
            const duration = reqEnd - reqStart;

            if (duration < 50) {
                const oldSize = currentSize;
                currentSize *= 2;
                
                if (currentSize > maxBufferSize) currentSize = maxBufferSize;

                if (currentSize !== oldSize) {
                    const msg = \`[Worker] ⬆️ Resize: \${(oldSize/1024).toFixed(0)}KB -> \${(currentSize/1024).toFixed(0)}KB (\${duration.toFixed(1)}ms)\`;
                    self.postMessage({ type: 'log', text: msg });
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

// --- PHASE 1: PRE-TEST (LATENCY & JITTER) ---
export async function runPing() {
    const PING_COUNT = 10;
    const pings = [];
    
    // Log start to Docker
    sendLogToDocker(`[Phase 1] Starting Ping Test (${PING_COUNT} probes)...`);

    for(let i=0; i<PING_COUNT; i++) {
        const start = performance.now();
        try {
            await fetch(`/api/ping?t=${Date.now()}`, { cache: "no-store" });
            const duration = performance.now() - start;
            pings.push(duration);
            await new Promise(r => setTimeout(r, 10));
        } catch(e) {
            console.warn("Ping failed", e);
        }
    }

    if (pings.length === 0) return 0;
    const minPing = Math.min(...pings);
    const avgPing = pings.reduce((a,b) => a+b, 0) / pings.length;
    
    // Log result to Docker
    sendLogToDocker(`[Phase 1] Result: Min: ${minPing.toFixed(2)}ms, Avg: ${avgPing.toFixed(2)}ms`);
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
            // ZMIANA: Przesyłamy log do Dockera
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

        const config = {
            command: this.type,
            url: this.type === 'download' ? '/static/100MB.bin' : '/api/upload',
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
        
        sendLogToDocker(`[Engine] Worker added (ID: ${id}). Buffer: ${minBuf/1024}KB -> ${maxBuf/1024/1024}MB`);
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
                const instSpeed = (safeDb * 8) / dt / 1e6;
                const alpha = (this.type === 'upload') ? 0.1 : 0.3;
                
                if (this.currentInstantSpeed === 0) this.currentInstantSpeed = instSpeed;
                else this.currentInstantSpeed = (instSpeed * alpha) + (this.currentInstantSpeed * (1 - alpha));
            }

            this.lastTime = now;
            this.lastTotalBytes = totalBytes;

            if (this.uiSpeed === 0) this.uiSpeed = avgSpeed;
            if (avgSpeed < this.uiSpeed * 0.7 && this.uiSpeed > 10) avgSpeed = this.uiSpeed; 
            const uiAlpha = (avgSpeed > this.uiSpeed) ? 0.2 : 0.05;
            this.uiSpeed = (avgSpeed * uiAlpha) + (this.uiSpeed * (1 - uiAlpha));

            if (this.uiSpeed < this.prevUiSpeed * 0.98) this.uiSpeed = this.prevUiSpeed * 0.98;
            this.prevUiSpeed = this.uiSpeed;

            onUpdate(this.uiSpeed, duration, this.activeWorkers.length);

            if (duration * 1000 >= TEST_DURATION) {
                this.stop();
                onFinish((totalBytes * 8) / duration / 1e6);
            }
        }, 100); 
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

        // FIX: Na localhost/szybkich sieciach prędkość stabilizuje się natychmiast na 2 wątkach.
        // Algorytm mylnie uznaje to za plateau. Wymuszamy wyjście do min. 4 wątków.
        // Warunek (!isCrash) zapobiega dodawaniu wątków, gdy sieć się dławi.
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
        if (THREADS > 1 && isMobileDevice()) maxT = Math.min(maxT, 6); 
        const engine = new SpeedTestEngine('download', maxT);
        const currentGauge = getGaugeInstance();

        engine.start(
            (speed, duration, activeThreads) => {
                checkGaugeRange(speed); 
                if(el('thread-count')) el('thread-count').innerText = activeThreads;
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
        if (THREADS > 1) {
            maxT = isMobileDevice() ? Math.min(maxT, 6) : Math.min(maxT, 12);
        }
        const engine = new SpeedTestEngine('upload', maxT);
        const currentGauge = getGaugeInstance();

        engine.start(
            (speed, duration, activeThreads) => {
                checkGaugeRange(speed); 
                if(el('thread-count')) el('thread-count').innerText = activeThreads;
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