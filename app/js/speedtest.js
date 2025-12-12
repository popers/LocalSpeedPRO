import { el, formatSpeed, currentUnit, setLastResultDown, setLastResultUp } from '/js/utils.js';
import { THREADS, TEST_DURATION } from '/js/config.js';
import { checkGaugeRange, setGaugeValue } from '/js/gauge.js'; // ZMIANA importu
import { updateChart } from '/js/charts.js';

// --- LOCAL UTILS ---
const isMobileDevice = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
           || (window.innerWidth < 900);
};

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
    let maxChunkLogged = 0; 

    while (true) {
        try {
            const fetchUrl = url + (url.includes('?') ? '&' : '?') + 't=' + Math.random();
            const response = await fetch(fetchUrl, { cache: "no-store", keepalive: true });
            if (!response.body) return;
            
            const reader = response.body.getReader();
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
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
                
                if (now - lastReport > 50) {
                    self.postMessage({ type: 'progress', bytes: totalBytes, time: now });
                    lastReport = now;
                }
            }
        } catch (e) {
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
                if (now - lastReport > 50) {
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

// --- PING HELPER ---
function calculateJitter(pings) {
    if (pings.length < 2) return 0;
    let differences = 0;
    for (let i = 1; i < pings.length; i++) {
        differences += Math.abs(pings[i] - pings[i-1]);
    }
    return differences / (pings.length - 1);
}

// --- PHASE 1: IDLE PING & JITTER ---
export function runPing() {
    return new Promise((resolve, reject) => {
        sendLogToDocker(`[Phase 1] Starting WebSocket Ping (Idle)...`);
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/api/ws/ping`;

        let ws = new WebSocket(wsUrl);
        
        const SAMPLES = 20; 
        const WARMUP = 5;   
        
        let pings = [];
        let count = 0;
        let startTime = 0;

        ws.onopen = () => {
            sendPing();
        };

        const sendPing = () => {
            if(ws.readyState !== WebSocket.OPEN) return;
            startTime = performance.now();
            ws.send(startTime.toString());
        };

        ws.onmessage = (event) => {
            const now = performance.now();
            const latency = now - startTime;
            
            if (count < WARMUP) {
                count++;
                setTimeout(sendPing, 50); 
            } else if (count < WARMUP + SAMPLES) {
                pings.push(latency);
                count++;
                setTimeout(sendPing, 50);
            } else {
                ws.close();
            }
        };

        ws.onclose = () => {
            if (pings.length > 0) {
                const minPing = Math.min(...pings);
                const avgPing = pings.reduce((a,b) => a+b, 0) / pings.length;
                const jitter = calculateJitter(pings);
                
                sendLogToDocker(`[Phase 1] Result: Min=${minPing.toFixed(2)}, Avg=${avgPing.toFixed(2)}, Jitter=${jitter.toFixed(2)}`);
                resolve({ ping: minPing, jitter: jitter });
            } else {
                resolve({ ping: 0, jitter: 0 });
            }
        };

        ws.onerror = (err) => {
            console.error("WS Ping Error", err);
            resolve({ ping: 0, jitter: 0 }); 
        };
        
        setTimeout(() => {
            if (ws.readyState !== WebSocket.CLOSED) ws.close();
        }, 5000);
    });
}

// --- LOADED PING RUNNER ---
export class LoadedPingRunner {
    constructor(onUpdate) {
        this.pings = [];
        this.isRunning = false;
        this.ws = null;
        this.onUpdate = onUpdate;
        this.startTime = 0;
    }

    start() {
        this.isRunning = true;
        this.pings = [];
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/api/ws/ping`;
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.sendPing();
        };

        this.ws.onmessage = () => {
            if (!this.isRunning) return;
            const now = performance.now();
            const latency = now - this.startTime;
            this.pings.push(latency);
            if (this.onUpdate) this.onUpdate(latency);
            setTimeout(() => this.sendPing(), 1000);
        };

        this.ws.onerror = () => {};
    }

    sendPing() {
        if (!this.isRunning || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.startTime = performance.now();
        this.ws.send("ping");
    }

    stop() {
        this.isRunning = false;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.pings.length === 0) return 0;
        const avg = this.pings.reduce((a,b) => a+b, 0) / this.pings.length;
        return avg;
    }
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

                const alpha = (this.type === 'upload') ? 0.1 : 0.15;
                
                if (this.currentInstantSpeed === 0) this.currentInstantSpeed = instSpeed;
                else this.currentInstantSpeed = (instSpeed * alpha) + (this.currentInstantSpeed * (1 - alpha));
            }

            this.lastTime = now;
            this.lastTotalBytes = totalBytes;

            if (this.status === 'scaling' && avgSpeed < this.uiSpeed) {
                avgSpeed = this.uiSpeed; 
            }

            if (this.currentInstantSpeed < this.uiSpeed * 0.1 && this.uiSpeed > 5) {
                avgSpeed = this.uiSpeed;
            }

            let riseFactor = 0.24; 
            let fallFactor = 0.12; 

            const uiAlpha = (avgSpeed > this.uiSpeed) ? riseFactor : fallFactor;
            this.uiSpeed = (avgSpeed * uiAlpha) + (this.uiSpeed * (1 - uiAlpha));

            let dropLimit = (this.type === 'upload') ? 0.9995 : 0.998;
            
            if (this.uiSpeed < this.prevUiSpeed * dropLimit) {
                this.uiSpeed = this.prevUiSpeed * dropLimit;
            }

            const NEEDLE_DELAY_MS = 350;
            if (duration * 1000 < NEEDLE_DELAY_MS) {
                this.uiSpeed = 0;
            }

            this.prevUiSpeed = this.uiSpeed;

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
        const dropThreshold = (this.type === 'upload') ? -0.30 : -0.30;

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

        const pingRunner = new LoadedPingRunner((latency) => {
            el('ping-dl-val').innerText = latency.toFixed(0);
        });
        pingRunner.start();

        engine.start(
            (speed, rawSpeed, duration, activeThreads) => {
                checkGaugeRange(Math.max(speed, rawSpeed)); 

                if(el('thread-count')) el('thread-count').innerText = activeThreads;
                
                // ZMIANA: Użycie nowej funkcji ECharts zamiast przypisania do .value
                setGaugeValue(speed);
                
                el('down-val').textContent = formatSpeed(speed); 
                updateChart('down', speed);
            },
            (finalSpeed) => {
                const avgLoadedPing = pingRunner.stop(); 
                setLastResultDown(finalSpeed);
                resolve({ speed: finalSpeed, ping: avgLoadedPing });
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

        const pingRunner = new LoadedPingRunner((latency) => {
            el('ping-ul-val').innerText = latency.toFixed(0);
        });
        pingRunner.start();

        engine.start(
            (speed, rawSpeed, duration, activeThreads) => {
                checkGaugeRange(Math.max(speed, rawSpeed));

                if(el('thread-count')) el('thread-count').innerText = activeThreads;
                
                // ZMIANA: ECharts update
                setGaugeValue(speed);
                
                el('up-val').textContent = formatSpeed(speed);
                updateChart('up', speed);
            },
            (finalSpeed) => {
                const avgLoadedPing = pingRunner.stop();
                setLastResultUp(finalSpeed);
                resolve({ speed: finalSpeed, ping: avgLoadedPing });
            }
        );
    });
}