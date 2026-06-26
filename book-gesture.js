// ---- DOM ----
const videoEl = document.getElementById('input-video');
const canvasEl = document.getElementById('overlay-canvas');
const ctx = canvasEl.getContext('2d');
const hintOverlay = document.getElementById('hint-overlay');
const startBtn = document.getElementById('start-btn');
const switchCamBtn = document.getElementById('switch-cam-btn');
const overlayToggle = document.getElementById('overlay-toggle');
const wsUrlInput = document.getElementById('ws-url');
const wsConnectBtn = document.getElementById('ws-connect-btn');
const wsStatusEl = document.getElementById('ws-status');
const eventLogEl = document.getElementById('event-log');
const threshPage = document.getElementById('thresh-page');
const threshUnderline = document.getElementById('thresh-underline');
const threshPinch = document.getElementById('thresh-pinch');

// ---- State ----
let currentFacing = 'environment';
let stream = null;
let hands = null;
let ws = null;
let running = false;

const COOLDOWN_MS = 800;
const HISTORY_MS = 700;

let landmarkHistory = []; // [{ t, lm }]
let pointingTrace = [];   // [{ t, x, y }] while in pointing pose
let pinchStart = null;    // { t, x, y }
let pinchFired = false;

let lastPageTurnAt = 0;
let lastUnderlineAt = 0;
let lastPinchAt = 0;

// ---- WebSocket ----
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
    startBtn.textContent = '카메라 켜짐';
    startBtn.disabled = true;
    running = true;
    requestAnimationFrame(frameLoop);
}

videoEl.addEventListener('loadedmetadata', () => {
    canvasEl.width = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;
    document.querySelector('.video-wrap').style.aspectRatio =
        `${videoEl.videoWidth} / ${videoEl.videoHeight}`;
});

startBtn.addEventListener('click', startCamera);

switchCamBtn.addEventListener('click', async () => {
    currentFacing = currentFacing === 'environment' ? 'user' : 'environment';
    if (stream) {
        stream.getTracks().forEach((t) => t.stop());
    }
    landmarkHistory = [];
    pointingTrace = [];
    pinchStart = null;
    await startCamera();
});

overlayToggle.addEventListener('change', () => {
    canvasEl.style.display = overlayToggle.checked ? 'block' : 'none';
});

// ---- MediaPipe Hands ----
hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});
hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 0,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
});
hands.onResults(onHandsResults);

async function frameLoop() {
    if (!running) return;
    if (videoEl.readyState >= 2) {
        await hands.send({ image: videoEl });
    }
    requestAnimationFrame(frameLoop);
}

function onHandsResults(results) {
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const lm = results.multiHandLandmarks[0];
        drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: '#00FF99', lineWidth: 2 });
        drawLandmarks(ctx, lm, { color: '#FF3366', radius: 3 });

        const now = performance.now();
        landmarkHistory.push({ t: now, lm });
        landmarkHistory = landmarkHistory.filter((e) => now - e.t <= HISTORY_MS);

        detectPageTurn(now);
        detectPinchFold(now, lm);
        detectUnderline(now, lm);
    } else {
        landmarkHistory = [];
        pointingTrace = [];
        pinchStart = null;
        pinchFired = false;
    }
}

// ---- Geometry helpers ----
function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function palmCenter(lm) {
    return { x: (lm[0].x + lm[9].x) / 2, y: (lm[0].y + lm[9].y) / 2 };
}

function isFingerExtended(lm, tipIdx, pipIdx) {
    return dist(lm[tipIdx], lm[0]) > dist(lm[pipIdx], lm[0]);
}

function isPointingPose(lm) {
    const indexExt = isFingerExtended(lm, 8, 6);
    const middleExt = isFingerExtended(lm, 12, 10);
    const ringExt = isFingerExtended(lm, 16, 14);
    const pinkyExt = isFingerExtended(lm, 20, 18);
    return indexExt && !middleExt && !ringExt && !pinkyExt;
}

function isOpenHand(lm) {
    const indexExt = isFingerExtended(lm, 8, 6);
    const middleExt = isFingerExtended(lm, 12, 10);
    const ringExt = isFingerExtended(lm, 16, 14);
    const pinkyExt = isFingerExtended(lm, 20, 18);
    return indexExt && middleExt && ringExt && pinkyExt;
}

// sensitivity: 1 (least sensitive) .. 10 (most sensitive)
function mapSensitivity(value, atLeastSensitive, atMostSensitive) {
    const t = (value - 1) / 9;
    return atLeastSensitive - t * (atLeastSensitive - atMostSensitive);
}

// ---- Gesture: page turn (open hand sweeps sideways) ----
function detectPageTurn(now) {
    if (now - lastPageTurnAt < COOLDOWN_MS) return;
    if (landmarkHistory.length < 2) return;

    const newest = landmarkHistory[landmarkHistory.length - 1];
    if (!isOpenHand(newest.lm)) return;

    const windowMs = 350;
    let oldest = newest;
    for (let i = landmarkHistory.length - 1; i >= 0; i--) {
        oldest = landmarkHistory[i];
        if (newest.t - oldest.t >= windowMs) break;
    }
    if (newest.t - oldest.t < windowMs * 0.6) return;

    const p0 = palmCenter(oldest.lm);
    const p1 = palmCenter(newest.lm);
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;

    const sensitivity = parseInt(threshPage.value, 10);
    const minDx = mapSensitivity(sensitivity, 0.45, 0.18);

    if (Math.abs(dx) > minDx && Math.abs(dy) < Math.abs(dx) * 0.6) {
        lastPageTurnAt = now;
        sendEvent('page_turn', { direction: dx > 0 ? 'right' : 'left' });
        landmarkHistory = [];
    }
}

// ---- Gesture: bookmark fold (thumb-index pinch held in place) ----
function detectPinchFold(now, lm) {
    const thumbTip = lm[4];
    const indexTip = lm[8];
    const handSize = dist(lm[0], lm[9]) || 1;
    const pinchDist = dist(thumbTip, indexTip) / handSize;

    const sensitivity = parseInt(threshPinch.value, 10);
    const pinchThreshold = mapSensitivity(sensitivity, 0.55, 0.25);
    const holdDuration = mapSensitivity(sensitivity, 700, 350);

    const mid = { x: (thumbTip.x + indexTip.x) / 2, y: (thumbTip.y + indexTip.y) / 2 };

    if (pinchDist < pinchThreshold) {
        if (!pinchStart) {
            pinchStart = { t: now, x: mid.x, y: mid.y };
            pinchFired = false;
            return;
        }

        const moved = dist(pinchStart, mid);
        if (
            !pinchFired &&
            moved < 0.06 &&
            now - pinchStart.t > holdDuration &&
            now - lastPinchAt > COOLDOWN_MS
        ) {
            pinchFired = true;
            lastPinchAt = now;
            sendEvent('bookmark_fold');
        }
    } else {
        pinchStart = null;
        pinchFired = false;
    }
}

// ---- Gesture: underline (pointing finger traces a straight horizontal line) ----
function detectUnderline(now, lm) {
    if (now - lastUnderlineAt < COOLDOWN_MS) {
        pointingTrace = [];
        return;
    }

    if (isPointingPose(lm)) {
        const tip = lm[8];
        pointingTrace.push({ t: now, x: tip.x, y: tip.y });
        const cutoff = now - 900;
        pointingTrace = pointingTrace.filter((p) => p.t >= cutoff);
    } else {
        pointingTrace = [];
        return;
    }

    evaluateUnderlineTrace(now);
}

function evaluateUnderlineTrace(now) {
    if (pointingTrace.length < 5) return;

    const first = pointingTrace[0];
    const last = pointingTrace[pointingTrace.length - 1];
    const dx = last.x - first.x;
    const dy = last.y - first.y;

    const sensitivity = parseInt(threshUnderline.value, 10);
    const minLen = mapSensitivity(sensitivity, 0.35, 0.12);

    if (Math.abs(dx) > minLen && Math.abs(dy) < Math.abs(dx) * 0.35) {
        lastUnderlineAt = now;
        sendEvent('underline', { direction: dx > 0 ? 'right' : 'left' });
        pointingTrace = [];
    }
}
