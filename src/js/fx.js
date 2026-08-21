import { GAME_CONFIG } from "./config.js";
import { W, H } from "./constants.js";
import { state } from "./state.js";
import { ctx } from "./canvas.js";

const FRAME_MS = 1000 / 60;
const SHAKE_DURATION = 120;
const HURT_FRAMES = 16;

// 玩家受击反馈（红闪遮罩）
export function playerHurt() {
    state.hurtTimer = HURT_FRAMES;
}

export function drawHurtOverlay() {
    if (state.hurtTimer <= 0) return;
    const a = (state.hurtTimer / HURT_FRAMES) * 0.38;
    const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
    grad.addColorStop(0, "rgba(255,50,50,0)");
    grad.addColorStop(1, `rgba(255,40,40,${a.toFixed(3)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
}

// 震屏
export function screenShake(power = 5, duration = SHAKE_DURATION) {
    if (!GAME_CONFIG.screenShake) return;
    state.shakePower = Math.max(state.shakePower, power);
    state.shakeTime = Math.max(state.shakeTime, duration);
}

// 顿帧（击中停顿，单位：帧）
export function hitStop(frames = 2) {
    if (!GAME_CONFIG.hitStop) return;
    state.freeze = Math.max(state.freeze, frames);
}

export function flashPaddle() {
    if (state.paddle) state.paddle.flash = 1;
}

// 冲击波圆环
export function spawnRing(x, y, color) {
    if (state.rings.length >= 30) return;
    state.rings.push({ x, y, r: 6, life: 1, color });
}

// 漂浮文字（得分、提示等）
export function spawnFloatingText(x, y, text, color = "#ffd700") {
    if (state.floatingTexts.length >= 20) return;
    state.floatingTexts.push({ x, y, text, color, life: 1, vy: -1.4 });
}

export function updateEffects() {
    if (state.shakeTime > 0) {
        state.shakeTime = Math.max(0, state.shakeTime - FRAME_MS);
    }

    for (let i = state.rings.length - 1; i >= 0; i--) {
        const r = state.rings[i];
        r.r += 3;
        r.life -= 0.06;
        if (r.life <= 0) state.rings.splice(i, 1);
    }

    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
        const t = state.floatingTexts[i];
        t.y += t.vy;
        t.vy *= 0.96;
        t.life -= 0.02;
        if (t.life <= 0) state.floatingTexts.splice(i, 1);
    }

    if (state.paddle && state.paddle.flash > 0) {
        state.paddle.flash = Math.max(0, state.paddle.flash - 0.1);
    }
}

export function drawEffects() {
    for (const r of state.rings) {
        ctx.globalAlpha = Math.max(0, r.life);
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.globalAlpha = 1;

    for (const t of state.floatingTexts) {
        ctx.globalAlpha = Math.max(0, Math.min(1, t.life));
        ctx.fillStyle = t.color;
        ctx.font = "bold 16px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(t.text, t.x, t.y);
    }

    ctx.globalAlpha = 1;
}