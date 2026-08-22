import { W, H, STATE, PADDLE_BASE_W } from "./constants.js";
import { state } from "./state.js";
import { ctx } from "./canvas.js";
import { skinDef, getSelectedSkin, DEFAULT_SKIN_COLORS } from "./unlocks.js";
import { PAL, BLOCK_TIERS, rgba } from "./palette.js";
import { PX, snap, pRect, pRectRaw, pStroke, pCircle, initPixelMode } from "./pixel.js";
import { FIELD_TOP, SKILL_Y } from "./layout.js";
import { drawDungeon } from "./stars.js";
import { drawParticles } from "./particles.js";
import { drawEffects, drawHurtOverlay } from "./fx.js";
import { drawBoss, drawBossBar, drawBossBullets, drawBossDangerZones, drawEnemyBullets } from "./boss.js";
import {
    drawUI,
    drawMenu,
    drawRewardScreen,
    drawSkillSwap,
    drawCurseScreen,
    drawEventScreen,
    drawBossClear,
    drawPauseScreen,
    drawSettingsScreen,
    drawCodex,
    drawGameOver,
    drawVictory,
} from "./ui.js";

// ─── 挡板：石质符文平台 ───────────────────────────────────
export function drawPaddle() {
    if (!state.paddle) return;
    const sk = skinDef(getSelectedSkin()) || DEFAULT_SKIN_COLORS;
    const light = sk.paddle2;
    const base = sk.paddle1;

    const p = state.paddle;
    const x = snap(p.x), y = snap(p.y), w = snap(p.width), h = snap(p.height);

    // 受击无敌闪烁：整体隐去一半帧
    if (state.invulnTimer > 0 && Math.floor(state.invulnTimer / 5) % 2 === 0) {
        ctx.globalAlpha = 0.4;
    }

    // 硬黑轮廓
    pRect(x - PX, y - PX, w + PX * 2, h + PX * 2, PAL.ink0);
    // 主体：上亮下暗的三段式，替代线性渐变
    pRect(x, y, w, h, base);
    pRect(x, y, w, PX, light);                    // 顶部高光
    pRect(x, y + h - PX, w, PX, PAL.ink1);        // 底部阴影
    pRect(x, y + PX, PX, h - PX * 2, light);      // 左侧亮边
    pRect(x + w - PX, y + PX, PX, h - PX * 2, PAL.ink1);

    // 中央符文槽：三个等距凹点，纯装饰但强化"平台"的实体感
    const runeCount = Math.max(3, Math.floor(w / (PX * 12)));
    for (let i = 0; i < runeCount; i++) {
        const rx = snap(x + (w / (runeCount + 1)) * (i + 1) - PX);
        pRect(rx, y + PX * 2, PX * 2, h - PX * 4, PAL.ink1);
    }

    // 核心受击区（PADDLE_BASE_W + 诅咒惩罚）：用金色端刻标记，不用虚线
    const baseW = PADDLE_BASE_W * (1 + (state.player.curseHitPenalty || 0));
    const bx = snap(p.x + (p.width - baseW) / 2);
    const bw = snap(baseW);
    pRect(bx, y - PX, PX, PX, PAL.gold2);
    pRect(bx + bw - PX, y - PX, PX, PX, PAL.gold2);
    pRect(bx, y - PX * 2, PX * 2, PX, PAL.gold3);
    pRect(bx + bw - PX * 2, y - PX * 2, PX * 2, PX, PAL.gold3);

    // 击球闪白
    if (p.flash > 0.02) {
        ctx.fillStyle = rgba(PAL.bone1, p.flash * 0.75);
        ctx.fillRect(x, y, w, h);
    }

    // 受击红框
    if (state.hurtTimer > 0) {
        pStroke(x - PX * 2, y - PX * 2, w + PX * 4, h + PX * 4, PAL.blood2, 1);
    }

    ctx.globalAlpha = 1;

    // 能量护盾：脉动像素框
    if (state.player.shieldTimer > 0) {
        const pulse = Math.floor(Date.now() / 120) % 2 === 0;
        pStroke(x - PX * 3, y - PX * 3, w + PX * 6, h + PX * 6, pulse ? PAL.arc3 : PAL.arc2, 1);
    }
}

// ─── 球：像素宝珠 ─────────────────────────────────────────
export function drawBalls() {
    for (let i = 0; i < state.balls.length; i++) {
        const b = state.balls[i];
        const isMain = i === 0;
        const core = isMain ? PAL.gold3 : PAL.arc3;
        const mid = isMain ? PAL.gold2 : PAL.arc2;
        const edge = isMain ? PAL.gold1 : PAL.arc1;

        // 拖尾：逐渐变小的像素方块
        for (let t = 0; t < b.trail.length; t++) {
            const tr = b.trail[t];
            if (tr.life <= 0.15) continue;
            const s = Math.max(PX, Math.round((b.radius * 0.7 * tr.life) / PX) * PX);
            ctx.fillStyle = rgba(tr.life > 0.6 ? mid : edge, tr.life * 0.5);
            ctx.fillRect(Math.round(tr.x - s / 2), Math.round(tr.y - s / 2), s, s);
        }

        // 球体：外圈 + 主体 + 左上高光
        pCircle(b.x, b.y, b.radius, edge);
        pCircle(b.x, b.y, b.radius - PX * 0.5, mid);
        pRectRaw(b.x - b.radius * 0.5, b.y - b.radius * 0.5, PX * 2, PX * 2, core);
    }
}

// ─── 方块：地牢石砖 ───────────────────────────────────────
export function drawBlocks() {
    for (const bl of state.blocks) {
        const x = snap(bl.x), y = snap(bl.y);
        const w = snap(bl.w), h = snap(bl.h);

        if (bl.indestructible) {
            drawMetalBlock(x, y, w, h);
            continue;
        }

        const tier = BLOCK_TIERS[Math.min(bl.maxHp - 1, 3)];

        // 落地阴影：所有方块统一在右下投一格暗影。
        // 地板砖本身有明暗变化，仅靠 1px 黑轮廓不足以把方块从背景里拎出来；
        // 一致方向的阴影能建立"方块浮在地板之上"的图底关系。
        pRect(x + PX, y + h, w - PX, PX, PAL.ink0);
        pRect(x + w, y + PX, PX, h - PX, PAL.ink0);

        // 轮廓
        pRect(x, y, w, h, PAL.ink0);
        // 主体
        pRect(x + PX, y + PX, w - PX * 2, h - PX * 2, tier.base);
        // 浮雕：上左亮，下右暗
        pRect(x + PX, y + PX, w - PX * 2, PX, tier.light);
        pRect(x + PX, y + PX, PX, h - PX * 2, tier.light);
        pRect(x + PX, y + h - PX * 2, w - PX * 2, PX, tier.shadow);
        pRect(x + w - PX * 2, y + PX, PX, h - PX * 2, tier.shadow);

        // 内部石纹：一条实色暗缝，让方块像砖块而非色块（用 shadow 档而非 alpha 混合）
        if (h >= PX * 5) {
            pRect(x + PX * 3, y + Math.round(h / 2 / PX) * PX, w - PX * 6, PX, tier.shadow);
        }

        // 受损裂纹：血量越低裂纹越多（替代原本的进度条）
        if (bl.hp < bl.maxHp) {
            drawCracks(x, y, w, h, bl.hp / bl.maxHp, tier.shadow);
        }

        // 射手方块：底部炮口
        if (bl.shooter) {
            const cx = snap(x + w / 2 - PX);
            pRect(cx, y + h - PX, PX * 2, PX * 2, PAL.ember2);
            pRect(cx, y + h, PX * 2, PX, PAL.ember3);
        }

        // 移动方块：两侧箭头刻痕
        if (bl.moving) {
            pRect(x + PX * 2, y + Math.round(h / 2 / PX) * PX - PX, PX, PX * 2, tier.light);
            pRect(x + w - PX * 3, y + Math.round(h / 2 / PX) * PX - PX, PX, PX * 2, tier.light);
        }
    }
}

// 不可击碎：铆钉铁块。
//
// 原实现主体用 stone1、暗面用 stone0——而地板主题在 11~40 层正好把这两色
// 当作砖面与砖缘（stars.js 的 floorAlt/edgeLight），于是障碍物和背景同色，
// 完全分不出来。现在改成"暗芯 + 亮金属边"的高对比配色：
//   芯 ink0/ink1 比任何地板砖都暗，边 stone3/mist0 比最亮的地板砖(stone1)都亮，
// 无论哪套主题，方块边界都有明暗落差。再加警示斜纹强化"打不破"的语义。
function drawMetalBlock(x, y, w, h) {
    // 落地阴影：把铁块从地板上"抬"起来，进一步拉开图底关系
    pRect(x + PX, y + h, w - PX, PX, PAL.ink0);

    pRect(x, y, w, h, PAL.ink0);                                   // 硬轮廓
    // 暗芯用 stone0：它比最亮的地板砖(stone1)暗、比最暗的主题地板(ink1/ink2)亮，
    // 因此在五套主题下都与地板存在亮度差。用 ink1 会与 41 层主题的砖面同色。
    pRect(x + PX, y + PX, w - PX * 2, h - PX * 2, PAL.stone0);     // 暗芯
    pRect(x + PX, y + PX, w - PX * 2, PX, PAL.mist0);              // 顶部亮边
    pRect(x + PX, y + PX, PX, h - PX * 2, PAL.stone3);             // 左侧亮边
    pRect(x + PX, y + h - PX * 2, w - PX * 2, PX, PAL.stone0);     // 底部暗边
    pRect(x + w - PX * 2, y + PX, PX, h - PX * 2, PAL.stone0);     // 右侧暗边

    // 警示斜纹：45° 交替，只画在中段，避免盖掉铆钉与边框
    const stripeTop = y + PX * 2;
    const stripeH = h - PX * 4;
    if (stripeH >= PX * 2) {
        for (let sx = PX * 3; sx < w - PX * 3; sx += PX * 4) {
            for (let sy = 0; sy < stripeH; sy += PX) {
                const off = sx + (sy / PX) * PX;
                if (off >= w - PX * 3) continue;
                pRect(x + off, stripeTop + sy, PX, PX, PAL.stone2);
            }
        }
    }

    // 四角铆钉：亮点，铁件质感
    const rv = [[PX * 2, PX * 2], [w - PX * 3, PX * 2], [PX * 2, h - PX * 3], [w - PX * 3, h - PX * 3]];
    for (const [dx, dy] of rv) {
        pRect(x + dx, y + dy, PX, PX, PAL.bone0);
    }
}

// 裂纹：确定性伪随机，保证同一方块裂纹稳定不闪烁
function drawCracks(x, y, w, h, ratio, color) {
    const dmg = 1 - ratio;
    const seed = (x * 31 + y * 17) | 0;
    const cols = Math.floor(w / PX) - 2;
    const rows = Math.floor(h / PX) - 2;
    const count = Math.floor(cols * rows * dmg * 0.28);
    ctx.fillStyle = color;
    let s = seed;
    for (let i = 0; i < count; i++) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const cx = 1 + (s >> 8) % cols;
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const cy = 1 + (s >> 8) % rows;
        ctx.fillRect(x + cx * PX, y + cy * PX, PX, PX);
    }
}

// ─── 主渲染 ───────────────────────────────────────────────
export function render() {
    initPixelMode();

    // 底色
    ctx.fillStyle = PAL.ink1;
    ctx.fillRect(0, 0, W, H);

    // 震屏：整个世界按像素网格位移（保持像素对齐）
    ctx.save();
    if (state.shakeTime > 0) {
        const s = state.shakePower * Math.min(1, state.shakeTime / 120);
        const ox = Math.round(((Math.random() * 2 - 1) * s) / PX) * PX;
        const oy = Math.round(((Math.random() * 2 - 1) * s) / PX) * PX;
        ctx.translate(ox, oy);
    }

    drawDungeon();

    if (state.gameState === STATE.MENU) {
        drawMenu();
        drawEffects();
        ctx.restore();
        return;
    }

    drawBlocks();
    if (state.boss) drawBoss();
    drawPaddle();
    drawBalls();
    drawParticles();
    drawBossBullets();
    drawBossDangerZones();
    drawEnemyBullets();

    // 暗角在 HUD 之前绘制，且只覆盖游戏区：
    // 之前它画在最后且覆盖全屏，四角的网点会压掉 60~78% 的技能槽与生命值。
    drawFieldVignette();

    drawUI();
    if (state.boss) drawBossBar();

    if (state.gameState === STATE.START_REWARD || state.gameState === STATE.LEVEL_REWARD) {
        drawRewardScreen();
    }
    if (state.gameState === STATE.SKILL_SWAP) drawSkillSwap();
    if (state.gameState === STATE.EVENT) drawEventScreen();
    if (state.gameState === STATE.BOSS_CLEAR) drawBossClear();
    if (state.gameState === STATE.CURSE_SELECT) drawCurseScreen();
    if (state.gameState === STATE.PAUSED) drawPauseScreen();
    if (state.gameState === STATE.CODEX) drawCodex();
    if (state.gameState === STATE.SETTINGS) drawSettingsScreen();
    if (state.gameState === STATE.GAME_OVER) drawGameOver();
    if (state.gameState === STATE.VICTORY) drawVictory();

    drawEffects();

    ctx.restore();

    drawHurtOverlay();
}

// ─── 暗角 ─────────────────────────────────────────────────
// 只作用于游戏区（顶栏之下、底栏之上），并且只压左右两侧边缘。
// HUD 所在的四角完全不参与，保证技能槽/生命值/层数永远清晰可读。
let vignetteCache = null;
function drawFieldVignette() {
    const top = FIELD_TOP;
    const bottom = SKILL_Y - PX * 2;      // 底栏之上留空
    const height = bottom - top;
    if (height <= 0) return;

    if (!vignetteCache) {
        vignetteCache = document.createElement("canvas");
        vignetteCache.width = W;
        vignetteCache.height = height;
        const c = vignetteCache.getContext("2d");
        c.fillStyle = PAL.ink0;
        // 只按水平距离衰减：越靠左右边缘越暗，纵向保持均匀，
        // 这样不会在游戏区上下边界留下明显的暗弧。
        const cx = W / 2;
        for (let y = 0; y < height; y += PX) {
            for (let x = 0; x < W; x += PX) {
                const d = Math.abs(x + PX / 2 - cx) / cx;
                const density = Math.max(0, (d - 0.72) / 0.28) * 0.55;
                const th = (BAYER[(y / PX) & 3][(x / PX) & 3] + 0.5) / 16;
                if (density > th) c.fillRect(x, y, PX, PX);
            }
        }
    }
    ctx.drawImage(vignetteCache, 0, top);
}

const BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
];
