import { GAME_CONFIG } from "./config.js";
import { W } from "./constants.js";
import { state } from "./state.js";
import { ctx } from "./canvas.js";
import { PAL } from "./palette.js";
import { PX, pRing, pText, pDitherMask } from "./pixel.js";
import { FIELD_TOP, SKILL_Y } from "./layout.js";

const FRAME_MS = 1000 / 60;
const SHAKE_DURATION = 120;
const HURT_FRAMES = 16;

// 玩家受击反馈（红闪遮罩）
export function playerHurt() {
    state.hurtTimer = HURT_FRAMES;
}

// 受击反馈：血色网点带只画在游戏区的左右与下沿，避开顶栏与底栏的 HUD。
// 之前四边环绕会盖住技能槽和生命值——恰恰是受伤时玩家最需要看清的信息。
export function drawHurtOverlay() {
    if (state.hurtTimer <= 0) return;
    const t = state.hurtTimer / HURT_FRAMES;
    const top = FIELD_TOP;
    const bottom = SKILL_Y - PX * 2;
    const bands = 5;
    for (let i = 0; i < bands; i++) {
        const inset = i * PX * 3;
        const d = t * (1 - i / bands) * 0.8;
        if (d <= 0.02) continue;
        const bandT = PX * 3;
        // 左右两侧 + 游戏区下沿；不画上沿（那里是顶栏）
        pDitherMask(inset, top + inset, bandT, bottom - top - inset * 2, PAL.blood2, d);
        pDitherMask(W - inset - bandT, top + inset, bandT, bottom - top - inset * 2, PAL.blood2, d);
        pDitherMask(inset + bandT, bottom - inset - bandT, W - (inset + bandT) * 2, bandT, PAL.blood2, d);
    }
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
export function spawnFloatingText(x, y, text, color = PAL.gold2) {
    if (state.floatingTexts.length >= 20) return;
    state.floatingTexts.push({ x, y, text, color, life: 1, vy: -1.4 });
}

export function updateEffects() {
    if (state.shakeTime > 0) {
        state.shakeTime = Math.max(0, state.shakeTime - FRAME_MS * state.dt);
    }

    for (let i = state.rings.length - 1; i >= 0; i--) {
        const r = state.rings[i];
        r.r += 3 * state.dt;
        r.life -= 0.06 * state.dt;
        if (r.life <= 0) state.rings.splice(i, 1);
    }

    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
        const t = state.floatingTexts[i];
        t.y += t.vy;
        t.vy *= Math.pow(0.96, state.dt);
        t.life -= 0.02 * state.dt;
        if (t.life <= 0) state.floatingTexts.splice(i, 1);
    }

    if (state.paddle && state.paddle.flash > 0) {
        state.paddle.flash = Math.max(0, state.paddle.flash - 0.1 * state.dt);
    }
}

export function drawEffects() {
    // 冲击环：像素圆环，生命末期变细
    for (const r of state.rings) {
        ctx.globalAlpha = Math.max(0, r.life > 0.3 ? 1 : r.life / 0.3);
        pRing(r.x, r.y, r.r, r.color, r.life > 0.5 ? 2 : 1);
    }

    ctx.globalAlpha = 1;

    // 漂浮文字：像素描边，整数坐标
    for (const t of state.floatingTexts) {
        ctx.globalAlpha = Math.max(0, Math.min(1, t.life > 0.35 ? 1 : t.life / 0.35));
        pText(t.text, Math.round(t.x / PX) * PX, Math.round(t.y / PX) * PX, t.color, {
            size: 15,
            bold: true,
            align: "center",
        });
    }

    ctx.globalAlpha = 1;
}