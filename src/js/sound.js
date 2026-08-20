import { GAME_CONFIG } from "./config.js";

// 所有音效均由 Web Audio 程序化合成，无需音频文件
let audioCtx = null;
let masterGain = null;

// 浏览器要求用户手势后才能播放声音：首次点击/触摸时调用
export function initAudio() {
    if (audioCtx) {
        if (audioCtx.state === "suspended") audioCtx.resume();
        return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = GAME_CONFIG.sound.volume;
    masterGain.connect(audioCtx.destination);
}

export function toggleSound() {
    GAME_CONFIG.sound.enabled = !GAME_CONFIG.sound.enabled;
    return GAME_CONFIG.sound.enabled;
}

export function isSoundEnabled() {
    return GAME_CONFIG.sound.enabled;
}

// ─── 合成器基础函数 ───────────────────────────────────────
function tone({ freq, endFreq = null, type = "sine", dur = 0.12, vol = 0.4, delay = 0 }) {
    if (!audioCtx || !GAME_CONFIG.sound.enabled) return;
    const t0 = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
}

function noiseBurst({ dur = 0.1, vol = 0.25, filterFreq = 1200, delay = 0 }) {
    if (!audioCtx || !GAME_CONFIG.sound.enabled) return;
    const t0 = audioCtx.currentTime + delay;
    const len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
    const buffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    src.start(t0);
}

// ─── 各事件音效 ───────────────────────────────────────────
export function playLaunch() {
    tone({ freq: 300, endFreq: 750, type: "sine", dur: 0.12, vol: 0.25 });
}

export function playPaddleHit() {
    tone({ freq: 200, endFreq: 150, type: "triangle", dur: 0.07, vol: 0.4 });
    noiseBurst({ dur: 0.04, vol: 0.12, filterFreq: 900 });
}

export function playWallHit() {
    tone({ freq: 950, endFreq: 650, type: "sine", dur: 0.05, vol: 0.12 });
}

export function playBlockHit() {
    tone({ freq: 230, endFreq: 170, type: "square", dur: 0.06, vol: 0.18 });
    noiseBurst({ dur: 0.05, vol: 0.14, filterFreq: 1400 });
}

export function playBlockBreak() {
    tone({ freq: 520, endFreq: 950, type: "square", dur: 0.11, vol: 0.22 });
    noiseBurst({ dur: 0.12, vol: 0.25, filterFreq: 2600 });
}

export function playBallLost() {
    tone({ freq: 420, endFreq: 90, type: "sawtooth", dur: 0.3, vol: 0.22 });
}

export function playSkillSelect() {
    [523.25, 659.25, 783.99].forEach((f, i) =>
        tone({ freq: f, type: "triangle", dur: 0.14, vol: 0.3, delay: i * 0.07 })
    );
}

export function playLevelComplete() {
    [392, 523.25, 659.25, 783.99].forEach((f, i) =>
        tone({ freq: f, type: "triangle", dur: 0.16, vol: 0.32, delay: i * 0.09 })
    );
}

export function playGameOver() {
    [392, 311.13, 246.94].forEach((f, i) =>
        tone({ freq: f, endFreq: f * 0.9, type: "triangle", dur: 0.28, vol: 0.3, delay: i * 0.16 })
    );
}

export function playVictory() {
    [523.25, 659.25, 783.99, 1046.5, 783.99].forEach((f, i) =>
        tone({ freq: f, type: "square", dur: 0.18, vol: 0.22, delay: i * 0.1 })
    );
}

// ─── 新系统音效 ───────────────────────────────────────────
export function playSkillUse() {
    tone({ freq: 400, endFreq: 1200, type: "sine", dur: 0.22, vol: 0.3 });
    tone({ freq: 800, endFreq: 1600, type: "sine", dur: 0.22, vol: 0.15, delay: 0.08 });
}

export function playBossHit() {
    tone({ freq: 160, endFreq: 90, type: "square", dur: 0.12, vol: 0.3 });
    noiseBurst({ dur: 0.08, vol: 0.2, filterFreq: 800 });
}

export function playBossShoot() {
    tone({ freq: 700, endFreq: 400, type: "sawtooth", dur: 0.08, vol: 0.1 });
}

export function playBossDeath() {
    tone({ freq: 300, endFreq: 50, type: "sawtooth", dur: 0.6, vol: 0.35 });
    noiseBurst({ dur: 0.5, vol: 0.3, filterFreq: 1500 });
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone({ freq: f, type: "triangle", dur: 0.2, vol: 0.28, delay: 0.3 + i * 0.11 })
    );
}

export function playPlayerHit() {
    tone({ freq: 220, endFreq: 60, type: "sawtooth", dur: 0.25, vol: 0.35 });
    noiseBurst({ dur: 0.15, vol: 0.3, filterFreq: 700 });
}

export function playHeal() {
    [523.25, 783.99].forEach((f, i) =>
        tone({ freq: f, type: "sine", dur: 0.18, vol: 0.25, delay: i * 0.09 })
    );
}

export function playEventOpen() {
    [293.66, 349.23, 440].forEach((f, i) =>
        tone({ freq: f, type: "triangle", dur: 0.2, vol: 0.24, delay: i * 0.1 })
    );
}

export function playEventGood() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone({ freq: f, type: "triangle", dur: 0.15, vol: 0.26, delay: i * 0.06 })
    );
}

export function playEventBad() {
    [400, 300, 200].forEach((f, i) =>
        tone({ freq: f, type: "square", dur: 0.2, vol: 0.2, delay: i * 0.12 })
    );
}