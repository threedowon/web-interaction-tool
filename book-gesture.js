// ---- DOM ----
const videoEl = document.getElementById('input-video');
const canvasEl = document.getElementById('overlay-canvas');
const ctx = canvasEl.getContext('2d');
const hintOverlay = document.getElementById('hint-overlay');
const startBtn = document.getElementById('start-btn');
const switchCamBtn = document.getElementById('switch-cam-btn');
const resetBaselineBtn = document.getElementById('reset-baseline-btn');
const overlayToggle = document.getElementById('overlay-toggle');
const debugReadout = document.getElementById('debug-readout');
const wsUrlInput = document.getElementById('ws-url');
const wsConnectBtn = document.getElementById('ws-connect-btn');
const wsStatusEl = document.getElementById('ws-status');
const eventLogEl = document.getElementById('event-log');
const threshPage = document.getElementById('thresh-page');
const threshMotion = document.getElementById('thresh-motion');

// ---- Camera state ----
let currentFacing = 'environment';
let stream = null;
let running = false;

// ---- WebSocket ----
let ws = null;

function connectWS() {
    const url = wsUrlInput.value.trim();
    if (!url) return;

    try {
        ws = new WebSocket(url);
    } catch (e) {
        setWsStatus(false, '주소 오류');
        return;
    }

    setWsStatus(false, '연결 중...');
    ws.addEventListener('open', () => setWsStatus(true, '연결됨'));
    ws.addEventListener('close', () => setWsStatus(false, '연결 끊김'));
    ws.addEventListener('error', () => setWsStatus(false, '오류'));
}

function setWsStatus(connected, text) {
    wsStatusEl.textContent = text;
    wsStatusEl.classList.toggle('status-connected', connected);
    wsStatusEl.classList.toggle('status-disconnected', !connected);
}

wsConnectBtn.addEventListener('click', () => {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
    } else {
        connectWS();
    }
});

document.getElementById('test-left-btn').addEventListener('click', () => {
    sendEvent('page_turn', { direction: 'left', intensity: 0.8 });
});
document.getElementById('test-right-btn').addEventListener('click', () => {
    sendEvent('page_turn', { direction: 'right', intensity: 0.8 });
});

function sendEvent(eventName, extra = {}) {
    const payload = {
        type: 'book_gesture',
        event: eventName,
        timestamp: Date.now(),
        ...extra,
    };
    logEvent(eventName, extra);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

function logEvent(eventName, extra) {
    const li = document.createElement('li');
    const time = new Date().toLocaleTimeString();
    const extraStr = Object.keys(extra).length ? ` (${JSON.stringify(extra)})` : '';
    li.textContent = `[${time}] ${eventName}${extraStr}`;
    eventLogEl.prepend(li);
    while (eventLogEl.children.length > 30) {
        eventLogEl.removeChild(eventLogEl.lastChild);
    }
}

// Logs every classification attempt (including non-matches) so it's visible
// whether the analyzer is running at all vs. just not matching any gesture.
function logDebug(text) {
    const li = document.createElement('li');
    li.style.opacity = '0.55';
    const time = new Date().toLocaleTimeString();
    li.textContent = `[${time}] (분석) ${text}`;
    eventLogEl.prepend(li);
    while (eventLogEl.children.length > 30) {
        eventLogEl.removeChild(eventLogEl.lastChild);
    }
}

// ---- Camera ----
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: currentFacing,
                width: { ideal: 1280 },
                height: { ideal: 720 },
            },
            audio: false,
        });
        videoEl.srcObject = stream;
        await videoEl.play();
    } catch (e) {
        alert('카메라 접근 실패: ' + e.message);
        return;
    }

    hintOverlay.classList.add('hidden');
    switchCamBtn.disabled = false;
    resetBaselineBtn.disabled = false;
    startBtn.textContent = '카메라 켜짐';
    startBtn.disabled = true;
    running = true;
    resetMotionState();
    requestAnimationFrame(frameLoop);
}

videoEl.addEventListener('loadedmetadata', () => {
    canvasEl.width = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;
    document.querySelector('.video-wrap').style.aspectRatio =
        `${videoEl.videoWidth} / ${videoEl.videoHeight}`;

    // Keep the analysis buffer small for speed, but preserve the real aspect
    // ratio so bbox-shape heuristics (aspect ratio, corner distance) stay valid.
    sampleCanvas.width = 320;
    sampleCanvas.height = Math.round(320 * (videoEl.videoHeight / videoEl.videoWidth));
});

startBtn.addEventListener('click', startCamera);

switchCamBtn.addEventListener('click', async () => {
    currentFacing = currentFacing === 'environment' ? 'user' : 'environment';
    if (stream) {
        stream.getTracks().forEach((t) => t.stop());
    }
    await startCamera();
});

resetBaselineBtn.addEventListener('click', () => {
    resetMotionState();
});

overlayToggle.addEventListener('change', () => {
    if (!overlayToggle.checked) {
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    }
});

// ---- Frame sampling ----
const sampleCanvas = document.createElement('canvas');
sampleCanvas.width = 320;
sampleCanvas.height = 180;
const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

const maskCanvas = document.createElement('canvas');
const maskCtx = maskCanvas.getContext('2d');

function grabGrayFrame() {
    const w = sampleCanvas.width;
    const h = sampleCanvas.height;
    sampleCtx.drawImage(videoEl, 0, 0, w, h);
    const { data } = sampleCtx.getImageData(0, 0, w, h);
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, o = 0; i < gray.length; i++, o += 4) {
        gray[i] = data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114;
    }
    return gray;
}

// Single O(n) pass: changed-pixel ratio (motion gate) + horizontal centroid
// of the changed pixels (swipe direction). cx is normalized 0..1 left-to-right,
// null when too few pixels changed to be meaningful.
function computeFrameMotion(a, b, threshold) {
    const w = sampleCanvas.width;
    let sumX = 0, count = 0;
    for (let i = 0; i < a.length; i++) {
        if (Math.abs(a[i] - b[i]) > threshold) {
            sumX += i % w;
            count++;
        }
    }
    return {
        ratio: count / a.length,
        cx: count > 30 ? (sumX / count) / w : null,
    };
}

// sensitivity: 1 (least sensitive) .. 10 (most sensitive)
function mapSensitivity(value, atLeastSensitive, atMostSensitive) {
    const t = (value - 1) / 9;
    return atLeastSensitive - t * (atLeastSensitive - atMostSensitive);
}

// ---- Motion state machine ----
// idle: nothing happening, baseline tracks the live (stable) frame.
// moving: a motion spike started; baseline is frozen at the pre-spike frame.
// settling: motion dropped back down; we wait a short stabilization window
//           before diffing pre-spike vs post-spike frames, so the "after"
//           frame isn't a blurry mid-flip snapshot.
const STATE = { IDLE: 'idle', MOVING: 'moving', SETTLING: 'settling' };

let state = STATE.IDLE;
let lastFrame = null;
let stableFrame = null;
let preMotionFrame = null;
let consecutiveAboveStart = 0;
let belowEndSince = 0;
let motionStartAt = 0;
let settleUntil = 0;
let peakMotionScore = 0;
let lastMaskRenderAt = 0;
let swipeDx = 0;       // accumulated horizontal centroid shift during MOVING
let swipeFrames = 0;   // frames that contributed to swipeDx
let prevMotionCx = null;

const SETTLE_DELAY_MS = 250;
const SETTLE_GRACE_MS = 150;
const MAX_MOVING_MS = 3000;

function resetMotionState() {
    state = STATE.IDLE;
    lastFrame = null;
    stableFrame = null;
    preMotionFrame = null;
    consecutiveAboveStart = 0;
    belowEndSince = 0;
    peakMotionScore = 0;
    swipeDx = 0;
    swipeFrames = 0;
    prevMotionCx = null;
}

let lastProcessAt = 0;
const PROCESS_INTERVAL_MS = 1000 / 15;

function frameLoop(ts) {
    if (!running) return;
    if (videoEl.readyState >= 2 && ts - lastProcessAt >= PROCESS_INTERVAL_MS) {
        lastProcessAt = ts;
        processFrame();
    }
    requestAnimationFrame(frameLoop);
}

function processFrame() {
    const gray = grabGrayFrame();

    if (!lastFrame || lastFrame.length !== gray.length) {
        lastFrame = gray;
        stableFrame = gray;
        return;
    }

    const { ratio: score, cx: motionCx } = computeFrameMotion(gray, lastFrame, 18);
    lastFrame = gray;

    const motionSens = parseInt(threshMotion.value, 10);
    const startThresh = mapSensitivity(motionSens, 0.05, 0.008);
    const endThresh = startThresh * 0.5;
    const now = performance.now();

    if (state === STATE.IDLE) {
        if (score > startThresh) {
            consecutiveAboveStart++;
            if (consecutiveAboveStart >= 2) {
                state = STATE.MOVING;
                preMotionFrame = stableFrame;
                motionStartAt = now;
                peakMotionScore = score;
                consecutiveAboveStart = 0;
                prevMotionCx = motionCx;
            }
        } else {
            consecutiveAboveStart = 0;
            stableFrame = gray;
        }
    } else if (state === STATE.MOVING) {
        peakMotionScore = Math.max(peakMotionScore, score);

        // Accumulate horizontal centroid shift to track swipe direction.
        if (motionCx !== null && prevMotionCx !== null) {
            swipeDx += motionCx - prevMotionCx;
            swipeFrames++;
        }
        prevMotionCx = motionCx;

        if (now - motionStartAt > MAX_MOVING_MS) {
            resetMotionState();
            stableFrame = gray;
            return;
        }

        // Fire immediately once swipe direction crosses threshold.
        const pageSensImmediate = parseInt(threshPage.value, 10);
        const swipeTrigger = mapSensitivity(pageSensImmediate, 0.08, 0.02);
        if (swipeFrames >= 3 && Math.abs(swipeDx) > swipeTrigger) {
            const direction = swipeDx < 0 ? 'left' : 'right';
            const intensity = Math.min(1, peakMotionScore / 0.6);
            sendEvent('page_turn', { direction, intensity: Number(intensity.toFixed(2)) });
            resetMotionState();
            stableFrame = gray;
            return;
        }

        if (score < endThresh) {
            if (!belowEndSince) belowEndSince = now;
            if (now - belowEndSince > SETTLE_GRACE_MS) {
                state = STATE.SETTLING;
                settleUntil = now + SETTLE_DELAY_MS;
                belowEndSince = 0;
            }
        } else {
            belowEndSince = 0;
        }
    } else if (state === STATE.SETTLING) {
        if (score > startThresh) {
            state = STATE.MOVING;
            belowEndSince = 0;
        } else if (now >= settleUntil) {
            classifyChange(preMotionFrame, gray, peakMotionScore);
            resetMotionState();
            stableFrame = gray;
        }
    }

    const swipeDisplay = swipeFrames > 0 ? ` / 스와이프 ${(swipeDx * 100).toFixed(1)}%` : '';
    debugReadout.textContent = `state: ${state} / motion: ${(score * 100).toFixed(1)}%${swipeDisplay}`;
}

// ---- Change classification ----
function classifyChange(before, after, peakScore) {
    const w = sampleCanvas.width;
    const h = sampleCanvas.height;
    const n = w * h;

    // Confirm the scene actually changed between stable frames (book content
    // changed vs. just a hand passing in front of a static page).
    const mask = new Uint8Array(n);
    let changedCount = 0;
    for (let i = 0; i < n; i++) {
        if (Math.abs(after[i] - before[i]) > 20) {
            mask[i] = 1;
            changedCount++;
        }
    }

    const avgDx = swipeFrames > 2 ? swipeDx / swipeFrames : 0;
    const pageSens = parseInt(threshPage.value, 10);
    // Required average per-frame centroid shift (normalized 0..1 per frame).
    // A 20%-wide swipe over ~10 active frames = 2%/frame; default slider (5)
    // requires ~0.9%/frame so normal page turns pass with room to spare.
    const swipeThresh = mapSensitivity(pageSens, 0.015, 0.003);

    if (changedCount < n * 0.002) {
        // Scene barely changed: probably just a hand passing over without
        // turning a page — ignore even if there was a swipe.
        logDebug(`변화 없음 (스와이프 ${(swipeDx * 100).toFixed(1)}%)`);
        renderDebugMask(mask, w, h, null, '변화 없음');
        return;
    }

    if (Math.abs(avgDx) > swipeThresh) {
        const direction = avgDx < 0 ? 'left' : 'right';
        const intensity = Math.min(1, peakScore / 0.6);
        sendEvent('page_turn', { direction, intensity: Number(intensity.toFixed(2)) });
        renderDebugMask(mask, w, h, null, 'PAGE TURN');
        return;
    }

    logDebug(`페이지 넘김 아님 (스와이프 ${(avgDx * 100).toFixed(2)}%/f, ${swipeFrames}f, 기준 ${(swipeThresh * 100).toFixed(2)}%/f)`);
    renderDebugMask(mask, w, h, null, '미분류');
}

function renderDebugMask(mask, w, h, bbox, label) {
    if (!overlayToggle.checked) return;

    maskCanvas.width = w;
    maskCanvas.height = h;
    const imgData = maskCtx.createImageData(w, h);
    for (let i = 0; i < mask.length; i++) {
        if (mask[i]) {
            const o = i * 4;
            imgData.data[o] = 255;
            imgData.data[o + 1] = 60;
            imgData.data[o + 2] = 60;
            imgData.data[o + 3] = 140;
        }
    }
    maskCtx.putImageData(imgData, 0, 0);

    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(maskCanvas, 0, 0, canvasEl.width, canvasEl.height);

    if (bbox) {
        const sx = canvasEl.width / w;
        const sy = canvasEl.height / h;
        ctx.strokeStyle = '#4cd3a5';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            bbox.minX * sx,
            bbox.minY * sy,
            (bbox.maxX - bbox.minX) * sx,
            (bbox.maxY - bbox.minY) * sy
        );
    }

    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#4cd3a5';
    ctx.fillText(label, 10, 22);

    const fadeAt = Date.now();
    lastMaskRenderAt = fadeAt;
    setTimeout(() => {
        if (lastMaskRenderAt === fadeAt) {
            ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        }
    }, 1200);
}
