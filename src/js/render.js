import { W, H, COLORS, STATE, PADDLE_BASE_W } from "./constants.js";
import { state } from "./state.js";
import { ctx } from "./canvas.js";
import { roundRect, shadeColor } from "./utils.js";
import { skinDef, getSelectedSkin, DEFAULT_SKIN_COLORS } from "./unlocks.js";
import { drawStars } from "./stars.js";
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

export function drawPaddle() {
    if (!state.paddle) return;
    // 获取皮肤颜色
    const sk = skinDef(getSelectedSkin()) || DEFAULT_SKIN_COLORS;
    const p1 = sk.paddle1;
    const p2 = sk.paddle2;
    const glowColor = sk.glow || "rgba(192,96,160,0.55)";
    ctx.save();
    // 受击无敌闪烁
    if (state.invulnTimer > 0 && Math.floor(state.invulnTimer / 6) % 2 === 0) {
        ctx.globalAlpha = 0.45;
    }

    const grad = ctx.createLinearGradient(state.paddle.x, state.paddle.y, state.paddle.x, state.paddle.y + state.paddle.height);
    grad.addColorStop(0, p1);
    grad.addColorStop(1, p2);
    ctx.fillStyle = grad;
    roundRect(state.paddle.x, state.paddle.y, state.paddle.width, state.paddle.height, 7);
    ctx.fill();

    // Glow
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 15;
    roundRect(state.paddle.x, state.paddle.y, state.paddle.width, state.paddle.height, 7);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 受击区域（固定 PADDLE_BASE_W + 诅咒惩罚）强调发光
    const baseW = PADDLE_BASE_W * (1 + (state.player.curseHitPenalty || 0));
    const baseX = state.paddle.x + (state.paddle.width - baseW) / 2;
    ctx.shadowColor = "rgba(255,220,100,0.6)";
    ctx.shadowBlur = 10;
    ctx.strokeStyle = "rgba(255,220,100,0.5)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    roundRect(baseX, state.paddle.y, baseW, state.paddle.height, 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Hit flash
    if (state.paddle.flash > 0.02) {
        ctx.fillStyle = `rgba(255,255,255,${(state.paddle.flash * 0.7).toFixed(3)})`;
        roundRect(state.paddle.x, state.paddle.y, state.paddle.width, state.paddle.height, 7);
        ctx.fill();
    }

    // 受击红闪
    if (state.hurtTimer > 0) {
        ctx.strokeStyle = `rgba(255,70,70,${(state.hurtTimer / 16 * 0.8).toFixed(3)})`;
        ctx.lineWidth = 3;
        roundRect(state.paddle.x - 2, state.paddle.y - 2, state.paddle.width + 4, state.paddle.height + 4, 9);
        ctx.stroke();
    }
    ctx.restore();

    // 能量护盾
    if (state.player.shieldTimer > 0) {
        ctx.strokeStyle = `rgba(120,230,255,${0.35 + Math.sin(Date.now() / 120) * 0.25})`;
        ctx.lineWidth = 3;
        roundRect(state.paddle.x - 8, state.paddle.y - 8, state.paddle.width + 16, state.paddle.height + 16, 12);
        ctx.stroke();
    }
}

export function drawBalls() {
    for (let i = 0; i < state.balls.length; i++) {
        const b = state.balls[i];
        const isMain = i === 0;

        // Trail
        for (const t of b.trail) {
            const tc = isMain ? `rgba(255,220,140,${t.life * 0.25})` : `rgba(255,255,255,${t.life * 0.2})`;
            ctx.fillStyle = tc;
            ctx.beginPath();
            ctx.arc(t.x, t.y, b.radius * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }

        // Glow
        ctx.shadowColor = isMain ? "rgba(255,190,60,0.55)" : COLORS.ballGlow;
        ctx.shadowBlur = isMain ? 16 : 12;

        const grad = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, b.radius);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.6, isMain ? "#ffe8b0" : "#e8e0ff");
        grad.addColorStop(1, isMain ? "#e8a040" : "#a0a0d0");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

export function drawBlocks() {
    for (const bl of state.blocks) {
        // 不可击碎方块：深色金属
        if (bl.indestructible) {
            ctx.fillStyle = COLORS.unbreakable;
            ctx.strokeStyle = "rgba(140,150,190,0.6)";
            ctx.lineWidth = 2;
            roundRect(bl.x, bl.y, bl.w, bl.h, 4);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "rgba(255,255,255,0.25)";
            ctx.beginPath();
            ctx.arc(bl.x + bl.w / 2, bl.y + bl.h / 2, 4, 0, Math.PI * 2);
            ctx.fill();
            continue;
        }

        const ci = Math.min(bl.maxHp - 1, 3);
        const color = COLORS.blockColors[ci];

        ctx.shadowColor = COLORS.blockGlow[ci];
        ctx.shadowBlur = 6;

        const grad = ctx.createLinearGradient(bl.x, bl.y, bl.x, bl.y + bl.h);
        grad.addColorStop(0, color);
        grad.addColorStop(1, shadeColor(color, -30));
        ctx.fillStyle = grad;
        roundRect(bl.x, bl.y, bl.w, bl.h, 4);
        ctx.fill();

        ctx.shadowBlur = 0;

        // 射击中的方块：橙色炮口
        if (bl.shooter) {
            ctx.fillStyle = "#ffa94d";
            ctx.beginPath();
            ctx.arc(bl.x + bl.w / 2, bl.y + bl.h, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        // HP indicator
        if (bl.hp < bl.maxHp) {
            const ratio = bl.hp / bl.maxHp;
            ctx.fillStyle = "rgba(0,0,0,0.3)";
            roundRect(bl.x + 2, bl.y + 2, bl.w - 4, bl.h - 4, 3);
            ctx.fill();
            ctx.fillStyle = color;
            roundRect(bl.x + 2, bl.y + 2, (bl.w - 4) * ratio, bl.h - 4, 3);
            ctx.fill();
        }
    }
}

export function render() {
    // Clear
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    // 爱丽丝仙境装饰背景
    drawWonderlandDecor();

    // 震屏：整个世界轻微位移
    ctx.save();
    if (state.shakeTime > 0) {
        const s = state.shakePower * Math.min(1, state.shakeTime / 120);
        ctx.translate((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s);
    }

    drawStars();

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

    // 受击红色遮罩 + 暗角（震屏之外）
    drawHurtOverlay();
    drawVignette();
}

function drawVignette() {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.78);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(8,4,16,0.52)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
}

function drawWonderlandDecor() {
    ctx.save();
    ctx.globalAlpha = 0.04;
    const suits = ["♠", "♥", "♣", "♦"];
    for (let i = 0; i < 12; i++) {
        const x = (i % 4) * 200 + 40 + (i * 37) % 100;
        const y = (i * 77) % 600;
        ctx.font = `${22 + (i % 3) * 14}px serif`;
        ctx.fillStyle = i % 2 === 0 ? "#e8c84a" : "#c060a0";
        ctx.textAlign = "center";
        ctx.fillText(suits[i % 4], x, y);
    }
    ctx.restore();
}