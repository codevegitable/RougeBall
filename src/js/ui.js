import { W, H, COLORS, RARITY_META, MAX_SKILLS, STATE } from "./constants.js";
import { state } from "./state.js";
import { ctx } from "./canvas.js";
import { roundRect, wrapText } from "./utils.js";
import { REWARD_TYPE_NAME, REWARD_MAP, REWARDS } from "./rewards.js";
import { CURSES, HEAVY_CURSES, CURSES_MAP } from "./curses.js";
import { EVENTS } from "./events.js";
import { loadSaveData } from "./game.js";
import { getHighScore, skinDef, getUnlocks, isRewardUnlocked, setSkin, getSelectedSkin, SKIN_START_SKILLS } from "./unlocks.js";
import { loadSettings, saveSettings, applySettings } from "./settings.js";
import { GAME_CONFIG } from "./config.js";

// 图鉴状态
let codexTab = 0; // 0=奖励 1=诅咒 2=事件
let codexPage = 0;

export function setCodexTab(t) { codexTab = t; codexPage = 0; }
export function setCodexPage(d) { codexPage = Math.max(0, codexPage + d); }

// 界面按钮命中区域（每帧绘制时更新）
let startBtn = null;
let continueBtn = null;
let restartBtn = null;
let rewardCards = [];
let swapCards = [];
let swapCancelBtn = null;
let eventButtons = [];
let eventContinueBtn = null;
let bossClearBtn = null;
let pauseResumeBtn = null;
let pauseRestartBtn = null;
let pauseQuitBtn = null;
let penaltyCards = [];

export function hitStartButton(x, y) {
    return inRect(x, y, startBtn);
}

export function hitContinueButton(x, y) {
    return inRect(x, y, continueBtn);
}

export function hitRestartButton(x, y) {
    return inRect(x, y, restartBtn);
}

export function hitRewardCard(x, y) {
    for (const c of rewardCards) {
        if (inRect(x, y, c)) return c.def;
    }
    return null;
}

export function hitSwapCardIndex(x, y) {
    for (let i = 0; i < swapCards.length; i++) {
        if (inRect(x, y, swapCards[i])) return i;
    }
    return -1;
}

export function hitSwapCancel(x, y) {
    return inRect(x, y, swapCancelBtn);
}

export function hitEventChoiceIndex(x, y) {
    for (let i = 0; i < eventButtons.length; i++) {
        if (inRect(x, y, eventButtons[i])) return i;
    }
    return -1;
}

export function hitEventContinueButton(x, y) {
    return inRect(x, y, eventContinueBtn);
}

export function hitPauseResume(x, y) {
    return inRect(x, y, pauseResumeBtn);
}

export function hitPauseRestart(x, y) {
    return inRect(x, y, pauseRestartBtn);
}

export function hitPauseQuit(x, y) {
    return inRect(x, y, pauseQuitBtn);
}

export function hitPenaltyCard(x, y) {
    for (let i = 0; i < penaltyCards.length; i++) {
        if (inRect(x, y, penaltyCards[i])) return i;
    }
    return -1;
}

let menuCodexBtn = null, pauseCodexBtn = null, menuSkinBtn = null, menuSettingsBtn = null, gameOverExitBtn = null;
let codexTabBtns = [], codexNextBtn = null, codexPrevBtn = null;

export function hitMenuCodexButton(x, y) { return inRect(x, y, menuCodexBtn); }
export function hitMenuSkinButton(x, y) { return inRect(x, y, menuSkinBtn); }
export function hitMenuSettingsButton(x, y) { return inRect(x, y, menuSettingsBtn); }
export function hitPauseCodexButton(x, y) { return inRect(x, y, pauseCodexBtn); }
export function hitCodexTab(x, y) {
    for (let i = 0; i < codexTabBtns.length; i++) {
        if (inRect(x, y, codexTabBtns[i])) return i;
    }
    return -1;
}
export function hitCodexNext(x, y) { return inRect(x, y, codexNextBtn); }
export function hitCodexPrev(x, y) { return inRect(x, y, codexPrevBtn); }

export function hitBossClearButton(x, y) {
    return inRect(x, y, bossClearBtn);
}

export function hitGameOverExitButton(x, y) {
    return inRect(x, y, gameOverExitBtn);
}

export function hitSkipButton(x, y) {
    return inRect(x, y, state._skipBtn);
}

function inRect(x, y, r) {
    return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// ─── HUD ──────────────────────────────────────────────────
export function drawUI() {
    const p = state.player;

    // Top bar
    ctx.fillStyle = COLORS.topBar;
    ctx.fillRect(0, 0, W, 52);

    // Level
    ctx.fillStyle = COLORS.gold;
    ctx.font = "bold 16px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`第 ${p.level} 关`, 20, 33);

    // Lives（❤️ ×数字）
    const hearts = Math.floor(p.lives);
    const half = p.lives - hearts >= 0.5;
    ctx.fillStyle = COLORS.ui;
    ctx.fillText(`❤️ ×${hearts}${half ? ".5" : ""}`, 140, 33);

    // Score
    ctx.fillStyle = COLORS.ui;
    ctx.textAlign = "center";
    ctx.fillText(`分数: ${Math.floor(p.score / 10)}`, W / 2, 35);

    // ESC 提示
    ctx.fillStyle = COLORS.uiDim;
    ctx.font = "11px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("ESC 暂停", W - 12, 24);

    // Active effects indicator — 右上角
    let fxY = 56;
    if (state.challenge) {
        const c = state.challenge;
        const breakable = state.blocks.filter((b) => !b.indestructible).length;
        const broke = c.initialBreakable - breakable;
        ctx.fillStyle = "#ffa94d";
        ctx.font = "bold 11px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(`限时挑战：击破 ${Math.min(broke, c.target)}/${c.target} · 剩余 ${Math.ceil(c.limit / 60)} 秒`, W - 12, fxY);
        fxY += 16;
    }
    // 诅咒显示（中文 + 效果说明）— 右上角
    if (state.player.curses && state.player.curses.length > 0) {
        ctx.fillStyle = "#ff8080";
        ctx.font = "11px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.textAlign = "right";
        const cList = state.player.curses.slice(0, 3).map((c) => {
            const d = CURSES_MAP[c.id];
            return d ? `${d.icon}${d.name}(${typeof d.desc === "function" ? d.desc(c.count) : d.desc})` : c.id;
        }).join(" ");
        ctx.fillText(`诅咒: ${cList}`, W - 12, fxY);
        fxY += 16;
        if (state.player.curses.length > 3) {
            ctx.fillText(`...还有 ${state.player.curses.length - 3} 个诅咒`, W - 12, fxY);
            fxY += 16;
        }
    }
    const effects = [];
    if (p.ballDamage > 1) effects.push(`伤害+${p.ballDamage - 1}`);
    if (p.maxPiercing > 0) effects.push(`穿透×${p.maxPiercing}`);
    if (state.balls.length > 1) effects.push(`${state.balls.length}球在场`);
    if (p.ghostTimer > 0) effects.push("幽灵穿越中");
    if (p.strikeTimer > 0) effects.push("聚能一击");
    if (p.explosiveTimer > 0) effects.push("爆裂蓄力");
    if (p.freezeTimer > 0) effects.push("时间冻结");
    if (p.shieldTimer > 0) effects.push("护盾");
    for (const eff of effects) {
        ctx.fillStyle = "rgba(255,200,50,0.9)";
        ctx.font = "11px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(eff, W - 12, fxY);
        fxY += 16;
    }

    drawSkillSlots();

    // Launch hint
    if (state.balls.some((b) => !b.launched)) {
        const alpha = 0.5 + Math.sin(Date.now() / 800) * 0.3;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.font = "14px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("点击发射小球", W / 2, H - 65);
    }
}

function drawSkillSlots() {
    const p = state.player;
    const effectiveMax = MAX_SKILLS - (p.curseSkillSlotPenalty || 0);
    for (let i = 0; i < MAX_SKILLS; i++) {
        const sx = 8 + i * 58;
        const sy = 58;
        const sealed = i >= effectiveMax;
        const s = !sealed ? p.skills[i] : null;
        const def = s ? REWARD_MAP[s.id] : null;

        ctx.fillStyle = "rgba(20,20,50,0.9)";
        ctx.strokeStyle = sealed ? "#ff4444" : (def ? RARITY_META[def.rarity].color : "rgba(100,100,140,0.4)");
        ctx.lineWidth = 1.5;
        roundRect(sx, sy, 52, 52, 8);
        ctx.fill();
        ctx.stroke();

        if (sealed) {
            ctx.fillStyle = "#ff4444";
            ctx.font = "26px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("⛓️", sx + 26, sy + 38);
            ctx.fillStyle = "#ff4444";
            ctx.font = "12px sans-serif";
            ctx.fillText("封印", sx + 26, sy + 62);
        } else if (def) {
            ctx.font = "22px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(def.icon, sx + 26, sy + 32);
            if (s && s.cd > 0) {
                ctx.fillStyle = "rgba(0,0,0,0.65)";
                ctx.fillRect(sx, sy + 52 - 52 * (s.cd / (def.cooldown * 60 * Math.max(0.0001, p.skillCdMul))), 52, 52 * (s.cd / (def.cooldown * 60 * Math.max(0.0001, p.skillCdMul))));
                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 14px sans-serif";
                ctx.fillText(`${Math.ceil(s.cd / 60)}s`, sx + 26, sy + 34);
            }
        } else {
            ctx.fillStyle = "rgba(136,146,176,0.5)";
            ctx.font = "20px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("+", sx + 26, sy + 33);
        }
        ctx.fillStyle = COLORS.uiDim;
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(i + 1), sx + 26, sy + 64);
    }
}

// ─── 菜单 ─────────────────────────────────────────────────
export function drawMenu() {
    ctx.fillStyle = "rgba(5,5,20,0.7)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = COLORS.gold;
    ctx.font = "bold 48px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(200,170,60,0.5)";
    ctx.shadowBlur = 30;
    ctx.fillText("弹球 Roguelike", W / 2, H / 2 - 100);
    ctx.shadowBlur = 0;

    // 最高分
    const hs = getHighScore();
    if (hs > 0) {
        ctx.fillStyle = COLORS.gold;
        ctx.font = "14px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`🏆 最高分: ${Math.floor(hs / 10)}`, W / 2, H / 2 - 155);
    }

    ctx.fillStyle = COLORS.uiDim;
    ctx.font = "15px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("移动鼠标控制挡板 · 点击发射小球 · 击碎所有方块过关", W / 2, H / 2 - 46);
    ctx.fillText("每关后选择奖励 · 每 15 关迎战 Boss · 途中可能遭遇事件房", W / 2, H / 2 - 18);

    const save = loadSaveData();
    continueBtn = null;

    let lastBtnY = 0;
    const btnW = 200;
    const btnH = 50;
    const btnX = W / 2 - btnW / 2;

    if (save) {
        const y = H / 2 + 10;
        const grad = ctx.createLinearGradient(btnX, y, btnX, y + btnH);
        grad.addColorStop(0, "#2fa54f");
        grad.addColorStop(1, "#4fbf6b");
        ctx.fillStyle = grad;
        roundRect(btnX, y, btnW, btnH, 25);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 20px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.fillText(`继续冒险 · 第 ${save.level} 关`, W / 2, y + 33);
        continueBtn = { x: btnX, y, w: btnW, h: btnH };

        const y2 = y + btnH + 16;
        const grad2 = ctx.createLinearGradient(btnX, y2, btnX, y2 + btnH);
        grad2.addColorStop(0, "#4a6cf7");
        grad2.addColorStop(1, "#7b5ef7");
        ctx.fillStyle = grad2;
        roundRect(btnX, y2, btnW, btnH, 25);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 20px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.fillText("新的冒险", W / 2, y2 + 33);
        startBtn = { x: btnX, y: y2, w: btnW, h: btnH };
        lastBtnY = y2;
    } else {
        const y = H / 2 + 26;
        const grad = ctx.createLinearGradient(btnX, y, btnX, y + btnH);
        grad.addColorStop(0, "#4a6cf7");
        grad.addColorStop(1, "#7b5ef7");
        ctx.fillStyle = grad;
        roundRect(btnX, y, btnW, btnH, 25);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 20px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.fillText("开始游戏", W / 2, y + 33);
        startBtn = { x: btnX, y, w: btnW, h: btnH };
        lastBtnY = y;
    }

    ctx.fillStyle = COLORS.uiDim;
    ctx.font = "13px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("技能数字键 1/2 释放 · ESC 暂停 · 按 M 键开关音效", W / 2, lastBtnY + btnH + 20);

    // 图鉴按钮
    const cbw = 120;
    const cbh = 34;
    const cbx = W / 2 - cbw / 2;
    const cby = lastBtnY + btnH + 36;
    ctx.fillStyle = "rgba(60,50,90,0.8)";
    ctx.strokeStyle = "#9aa1ad";
    ctx.lineWidth = 1;
    roundRect(cbx, cby, cbw, cbh, 17);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.ui;
    ctx.font = "13px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("📖 图鉴", W / 2, cby + 23);
    menuCodexBtn = { x: cbx, y: cby, w: cbw, h: cbh };

    // 皮肤切换按钮
    const skw = 140;
    const skh = 34;
    const skx = W / 2 - skw / 2;
    const sky = cby + cbh + 10;
    const unlocks = getUnlocks();
    const curSkin = skinDef(getSelectedSkin());
    const hasSkin = unlocks.tiers.some(t => t);
    if (curSkin) {
        ctx.fillStyle = "rgba(60,50,90,0.8)";
        ctx.strokeStyle = curSkin.paddle1;
        ctx.lineWidth = 1;
        roundRect(skx, sky, skw, skh, 17);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = curSkin.paddle1;
        ctx.font = "13px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.fillText(`🎨 皮肤：${curSkin.name}`, W / 2, sky + 23);
        menuSkinBtn = { x: skx, y: sky, w: skw, h: skh };
    }

    // 设置按钮
    const stw = 120;
    const sth = 34;
    const stx = W / 2 - stw / 2;
    const sty = sky + skh + 10;
    ctx.fillStyle = "rgba(60,50,90,0.8)";
    ctx.strokeStyle = "#9aa1ad";
    ctx.lineWidth = 1;
    roundRect(stx, sty, stw, sth, 17);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.ui;
    ctx.font = "13px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("⚙️ 设置", W / 2, sty + 23);
    menuSettingsBtn = { x: stx, y: sty, w: stw, h: sth };
}

// ─── 奖励选择（开局 / 过关 / Boss 掉落共用） ──────────────
export function drawRewardScreen() {
    ctx.fillStyle = "rgba(5,5,20,0.78)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = COLORS.gold;
    ctx.font = "bold 30px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(state.rewardTitle || "获得奖励", W / 2, H / 2 - 160);

    ctx.fillStyle = COLORS.ui;
    ctx.font = "16px 'PingFang SC','Microsoft YaHei',sans-serif";
    const sub = state.rareOnly ? "Boss 必定掉落稀有奖励：" : "选择一个奖励：";
    ctx.fillText(sub, W / 2, H / 2 - 112);

    const choices = state.levelChoices;
    const cardW = 168;
    const cardH = 232;
    const gap = 20;
    const totalW = choices.length * cardW + (choices.length - 1) * gap;
    const startX = W / 2 - totalW / 2;
    const cardY = H / 2 - 92;

    rewardCards = [];

    for (let i = 0; i < choices.length; i++) {
        const def = choices[i];
        const cx = startX + i * (cardW + gap);
        const meta = RARITY_META[def.rarity];

        // Card BG
        ctx.fillStyle = COLORS.cardBg;
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = meta.glow;
        ctx.shadowBlur = 12;
        roundRect(cx, cardY, cardW, cardH, 12);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Rarity badge
        ctx.fillStyle = meta.color;
        ctx.font = "bold 12px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(meta.name, cx + 10, cardY + 22);

        // Type badge
        ctx.textAlign = "right";
        ctx.fillStyle = COLORS.uiDim;
        ctx.font = "11px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.fillText(REWARD_TYPE_NAME[def.type], cx + cardW - 10, cardY + 22);

        // Icon
        ctx.font = "44px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(def.icon, cx + cardW / 2, cardY + 66);

        // Name
        ctx.fillStyle = "#fff";
        ctx.font = "bold 17px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.fillText(def.name, cx + cardW / 2, cardY + 96);

        // Description
        ctx.fillStyle = COLORS.uiDim;
        ctx.font = "12px 'PingFang SC','Microsoft YaHei',sans-serif";
        if (def.type === "skill") {
            ctx.textAlign = "center";
            wrapText(def.desc, cx + cardW / 2, cardY + 124, cardW - 24, 16);
            ctx.fillStyle = meta.color;
            ctx.font = "11px 'PingFang SC','Microsoft YaHei',sans-serif";
            ctx.fillText(`冷却 ${def.cooldown} 秒 · 按数字键释放`, cx + cardW / 2, cardY + 172);
        } else {
            ctx.textAlign = "center";
            wrapText(def.desc, cx + cardW / 2, cardY + 124, cardW - 24, 17);
        }

        // Stack / equip count
        let stackY = cardY + cardH - 14;
        if (def.bossOnly) {
            ctx.fillStyle = COLORS.gold;
            ctx.font = "bold 12px 'PingFang SC','Microsoft YaHei',sans-serif";
            ctx.fillText("★ Boss 专属", cx + cardW / 2, cardY + cardH - 32);
        }
        let count = state.player.perks[def.id] || 0;
        if (def.type === "skill") {
            count = state.player.skills.filter((s) => s.id === def.id).length;
        }
        if (def.type === "skill" && count === 0) {
            ctx.fillStyle = COLORS.uiDim;
            ctx.font = "11px 'PingFang SC','Microsoft YaHei',sans-serif";
            ctx.fillText("装备后按 1/2 键释放", cx + cardW / 2, stackY);
        } else if (count > 0) {
            ctx.fillStyle = COLORS.gold;
            ctx.font = "11px 'PingFang SC','Microsoft YaHei',sans-serif";
            ctx.fillText(`已拥有 ×${count}`, cx + cardW / 2, stackY);
        }

rewardCards.push({ x: cx, y: cardY, w: cardW, h: cardH, def });
    }

    // 跳过按钮
    const sw = 140;
    const sh = 38;
    const sx = W / 2 - sw / 2;
    const sy = cardY + cardH + 24;
    ctx.fillStyle = "rgba(40,35,60,0.8)";
    ctx.strokeStyle = COLORS.uiDim;
    ctx.lineWidth = 1;
    roundRect(sx, sy, sw, sh, 19);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.uiDim;
    ctx.font = "14px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("跳过奖励", W / 2, sy + 25);
    // 存储在 canvas 上供 hit 检测
    state._skipBtn = { x: sx, y: sy, w: sw, h: sh };
}

export function drawSkillSwap() {
    ctx.fillStyle = "rgba(5,5,20,0.82)";
    ctx.fillRect(0, 0, W, H);

    const p = state.player;
    const effectiveMax = MAX_SKILLS - (p.curseSkillSlotPenalty || 0);

    ctx.fillStyle = "#ff9966";
    ctx.font = "bold 26px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`技能槽已满（${effectiveMax}/${MAX_SKILLS}）`, W / 2, H / 2 - 170);

    ctx.fillStyle = COLORS.ui;
    ctx.font = "15px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("装备新技能需要舍弃一个已装备的技能，点击要舍弃的技能", W / 2, H / 2 - 132);

    const cardW = 200;
    const cardH = 170;
    const gap = 40;
    const activeSkills = p.skills.slice(0, effectiveMax);
    const totalW = Math.max(1, activeSkills.length) * cardW + (Math.max(1, activeSkills.length) - 1) * gap;
    const startX = W / 2 - totalW / 2;
    const cardY = H / 2 - 90;

    swapCards = [];

    for (let i = 0; i < activeSkills.length; i++) {
        const s = activeSkills[i];
        const def = REWARD_MAP[s.id];
        const cx = startX + i * (cardW + gap);
        const meta = RARITY_META[def.rarity];

        ctx.fillStyle = COLORS.cardBg;
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 2.5;
        roundRect(cx, cardY, cardW, cardH, 12);
        ctx.fill();
        ctx.stroke();

        ctx.font = "42px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(def.icon, cx + cardW / 2, cardY + 58);

        ctx.fillStyle = "#fff";
        ctx.font = "bold 18px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.fillText(def.name, cx + cardW / 2, cardY + 92);

        ctx.fillStyle = COLORS.uiDim;
        ctx.font = "12px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.fillText("点击舍弃", cx + cardW / 2, cardY + cardH - 16);

        swapCards.push({ x: cx, y: cardY, w: cardW, h: cardH });
    }

    const bw = 200;
    const bh = 44;
    const bx = W / 2 - bw / 2;
    const by = H / 2 + 110;
    ctx.fillStyle = "rgba(40,40,70,0.9)";
    roundRect(bx, by, bw, bh, 22);
    ctx.fill();
    ctx.fillStyle = COLORS.ui;
    ctx.font = "bold 15px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("取消（保留此次奖励卡片）", W / 2, by + 29);
    swapCancelBtn = { x: bx, y: by, w: bw, h: bh };
}

// ─── 事件房 ───────────────────────────────────────────────
export function drawEventScreen() {
    // 结果面板模式
    if (state.eventResult) {
        ctx.fillStyle = "rgba(5,5,20,0.85)";
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = state.eventResult.color;
        ctx.font = "bold 26px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("事件结果", W / 2, H / 2 - 110);

        ctx.fillStyle = COLORS.ui;
        ctx.font = "16px 'PingFang SC','Microsoft YaHei',sans-serif";
        const lines = String(state.eventResult.text).split("\n");
        let ly = H / 2 - 50;
        for (const line of lines) {
            ctx.fillText(line, W / 2, ly);
            ly += 26;
        }

        const bw = 200;
        const bh = 46;
        const bx = W / 2 - bw / 2;
        const by = H / 2 + 60;
        const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
        grad.addColorStop(0, "#4a6cf7");
        grad.addColorStop(1, "#7b5ef7");
        ctx.fillStyle = grad;
        roundRect(bx, by, bw, bh, 23);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 16px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.fillText("继续", W / 2, by + 30);
        eventContinueBtn = { x: bx, y: by, w: bw, h: bh };
        return;
    }

    const ev = state.currentEvent;
    if (!ev) return;

    ctx.fillStyle = "rgba(5,5,20,0.85)";
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = "center";
    ctx.font = "56px sans-serif";
    ctx.fillText(ev.icon, W / 2, H / 2 - 175);

    ctx.fillStyle = "#e8d5ff";
    ctx.font = "bold 28px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(`事件：${ev.name}`, W / 2, H / 2 - 118);

    ctx.fillStyle = COLORS.ui;
    ctx.font = "15px 'PingFang SC','Microsoft YaHei',sans-serif";
    const lines = ev.desc.split("\n");
    let ly = H / 2 - 66;
    for (const line of lines) {
        ctx.fillText(line, W / 2, ly);
        ly += 24;
    }

    // 选项按钮
    const bw = 340;
    const bh = 46;
    const bx = W / 2 - bw / 2;
    let by = H / 2 + 20;
    eventButtons = [];
    for (let i = 0; i < ev.choices.length; i++) {
        const choice = ev.choices[i];
        const disabled = choice.need && !choice.need();
        const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
        if (disabled) {
            grad.addColorStop(0, "#3a3a52");
            grad.addColorStop(1, "#2e2e42");
        } else {
            grad.addColorStop(0, "#4a6cf7");
            grad.addColorStop(1, "#7b5ef7");
        }
        ctx.fillStyle = grad;
        roundRect(bx, by, bw, bh, 23);
        ctx.fill();

        ctx.fillStyle = disabled ? "#666677" : "#ffffff";
        ctx.font = "bold 15px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.fillText(choice.label, W / 2, by + 30);

        eventButtons.push({ x: bx, y: by, w: bw, h: bh, disabled });
        by += bh + 14;
    }
}

// ─── Boss 击破结算 ────────────────────────────────────────
export function drawBossClear() {
    ctx.fillStyle = "rgba(5,5,20,0.8)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = COLORS.gold;
    ctx.font = "bold 40px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("💀 Boss 击破！", W / 2, H / 2 - 50);

    ctx.fillStyle = COLORS.ui;
    ctx.font = "17px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("Boss 掉落了稀有的战利品", W / 2, H / 2 - 8);

    const btnW = 220;
    const btnH = 48;
    const btnX = W / 2 - btnW / 2;
    const btnY = H / 2 + 28;
    const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
    btnGrad.addColorStop(0, "#ffcc33");
    btnGrad.addColorStop(1, "#ff9933");
    ctx.fillStyle = btnGrad;
    roundRect(btnX, btnY, btnW, btnH, 24);
    ctx.fill();

    ctx.fillStyle = "#3a2a00";
    ctx.font = "bold 18px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("领取稀有奖励", W / 2, btnY + 32);

    bossClearBtn = { x: btnX, y: btnY, w: btnW, h: btnH };
}

// ─── 暂停界面 ─────────────────────────────────────────────
export function drawPauseScreen() {
    ctx.fillStyle = "rgba(5,5,20,0.72)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 36px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("已暂停", W / 2, H / 2 - 120);

    ctx.fillStyle = COLORS.uiDim;
    ctx.font = "15px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(`第 ${state.player.level} 关 · 分数 ${Math.floor(state.player.score / 10)} · 进度已自动保存`, W / 2, H / 2 - 82);

    const bw = 240;
    const bh = 46;
    const bx = W / 2 - bw / 2;

    const defs = [
        { y: H / 2 - 44, label: "继续游戏", cb: (r) => (pauseResumeBtn = r) },
        { y: H / 2 + 12, label: "重新开始", cb: (r) => (pauseRestartBtn = r) },
        { y: H / 2 + 68, label: "保存并返回主菜单", cb: (r) => (pauseQuitBtn = r) },
    ];

    for (const d of defs) {
        const grad = ctx.createLinearGradient(bx, d.y, bx, d.y + bh);
        grad.addColorStop(0, "#3c4a78");
        grad.addColorStop(1, "#4a5f9e");
        ctx.fillStyle = grad;
        roundRect(bx, d.y, bw, bh, 23);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 15px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.fillText(d.label, W / 2, d.y + 30);
        d.cb({ x: bx, y: d.y, w: bw, h: bh });
    }

    ctx.fillStyle = COLORS.uiDim;
    ctx.font = "12px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("按 ESC 继续游戏", W / 2, H / 2 + 140);

    // 图鉴按钮
    const cbw = 120;
    const cbh = 34;
    const cbx = W / 2 - cbw / 2;
    const cby = H / 2 + 158;
    ctx.fillStyle = "rgba(60,50,90,0.8)";
    ctx.strokeStyle = "#9aa1ad";
    ctx.lineWidth = 1;
    roundRect(cbx, cby, cbw, cbh, 17);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.ui;
    ctx.font = "13px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("📖 图鉴", W / 2, cby + 23);
    pauseCodexBtn = { x: cbx, y: cby, w: cbw, h: cbh };
}

// ─── 图鉴界面 ─────────────────────────────────────────────
export function drawCodex() {
    ctx.fillStyle = "rgba(10,8,18,0.92)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = COLORS.gold;
    ctx.font = "bold 28px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("📖 图鉴", W / 2, 48);

    // Tab 栏
    const tabs = ["奖励", "诅咒", "事件", "皮肤"];
    const tw = 100;
    const th = 34;
    const tsx = W / 2 - (tabs.length * (tw + 8) - 8) / 2;
    codexTabBtns = [];
    for (let i = 0; i < tabs.length; i++) {
        const tx = tsx + i * (tw + 8);
        const active = i === codexTab;
        ctx.fillStyle = active ? "rgba(80,60,140,0.8)" : "rgba(30,25,50,0.7)";
        ctx.strokeStyle = active ? COLORS.gold : "#5a5570";
        ctx.lineWidth = active ? 2 : 1;
        roundRect(tx, 64, tw, th, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = active ? "#fff" : COLORS.uiDim;
        ctx.font = "bold 14px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(tabs[i], tx + tw / 2, 86);
        codexTabBtns.push({ x: tx, y: 64, w: tw, h: th });
    }

    // 分页 - 皮肤 tab 使用不同数据集
    const perPage = 8;
    const unlocks = getUnlocks();
    const skinData = [];
    for (let i = -1; i < 3; i++) {
        const sd = skinDef(i);
        if (!sd) continue;
        const unlocked = i < 0 || unlocks.tiers[i];
        skinData.push({
            icon: i < 0 ? "🎨" : ["🟢", "🔴", "🟡"][i] || "?",
            name: sd.name + (unlocked ? " ✅" : " 🔒"),
            desc: unlocked
                ? (sd.skill ? `开场技能：${SKIN_START_SKILLS[sd.skill]?.name || sd.skill}` : "无开场技能")
                : `需 ${[6000, 20000, 40000][i] || 0} 分解锁`,
            color: sd.paddle1,
        });
    }

    const datasets = [
        REWARDS,
        [...CURSES, ...HEAVY_CURSES],
        EVENTS,
        skinData,
    ];
    const data = datasets[codexTab] || [];
    const totalPages = Math.max(1, Math.ceil(data.length / perPage));
    if (codexPage >= totalPages) codexPage = totalPages - 1;
    const start = codexPage * perPage;
    const pageItems = data.slice(start, start + perPage);

    // 列表
    let ly = 112;
    const lh = 56;
    ctx.textAlign = "left";
    for (const item of pageItems) {
        const rarityColor = item.color || (item.rarity ? (RARITY_META[item.rarity]?.color || COLORS.ui) : COLORS.ui);
        ctx.fillStyle = "rgba(30,25,50,0.6)";
        ctx.fillRect(30, ly, W - 60, lh - 4);
        ctx.font = "22px sans-serif";
        ctx.fillText(item.icon || "?", 38, ly + 32);
        ctx.fillStyle = rarityColor;
        ctx.font = "bold 13px 'PingFang SC','Microsoft YaHei',sans-serif";
        // 锁定标记
        const locked = item.tierLock !== undefined && !isRewardUnlocked(item.id);
        const nameText = (locked ? "🔒 " : "") + (item.name || "");
        ctx.fillText(nameText, 72, ly + 20);
        // 奖励类型标签
        if (codexTab === 0 && item.type && REWARD_TYPE_NAME[item.type]) {
            ctx.fillStyle = COLORS.uiDim;
            ctx.font = "10px 'PingFang SC','Microsoft YaHei',sans-serif";
            ctx.textAlign = "right";
            ctx.fillText(REWARD_TYPE_NAME[item.type], W - 38, ly + 20);
        }
        ctx.fillStyle = COLORS.uiDim;
        ctx.font = "11px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.textAlign = "left";
        const desc = typeof item.desc === "function" ? item.desc(1) : (item.desc || "");
        ctx.fillText(desc.length > 40 ? desc.slice(0, 38) + "…" : desc, 72, ly + 40);
        // 锁定技能额外标记
        if (locked) {
            ctx.fillStyle = "#ff8080";
            ctx.font = "10px 'PingFang SC','Microsoft YaHei',sans-serif";
            ctx.textAlign = "right";
            ctx.fillText("未解锁", codexTab === 0 ? W - 38 : W - 38, codexTab === 0 ? ly + 40 : ly + 20);
        }
        ly += lh;
    }

    // 翻页按钮
    ctx.textAlign = "center";
    const pbw = 80;
    const pbh = 32;
    const pby = 488;
    if (codexPage > 0) {
        const px = 40;
        ctx.fillStyle = "rgba(60,50,90,0.8)";
        roundRect(px, pby, pbw, pbh, 16);
        ctx.fill();
        ctx.fillStyle = COLORS.ui;
        ctx.font = "13px sans-serif";
        ctx.fillText("← 上一页", px + pbw / 2, pby + 21);
        codexPrevBtn = { x: px, y: pby, w: pbw, h: pbh };
    } else codexPrevBtn = null;
    if (codexPage < totalPages - 1) {
        const px = 680;
        ctx.fillStyle = "rgba(60,50,90,0.8)";
        roundRect(px, pby, pbw, pbh, 16);
        ctx.fill();
        ctx.fillStyle = COLORS.ui;
        ctx.font = "13px sans-serif";
        ctx.fillText("下一页 →", px + pbw / 2, pby + 21);
        codexNextBtn = { x: px, y: pby, w: pbw, h: pbh };
    } else codexNextBtn = null;

    ctx.fillStyle = COLORS.uiDim;
    ctx.font = "12px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(`第 ${codexPage + 1}/${totalPages} 页 · ESC 返回 · ← → 翻页`, W / 2, 540);
}

// ─── 设置界面 ─────────────────────────────────────────────
let settingsToggleBtns = [];
export function drawSettingsScreen() {
    const s = loadSettings();
    ctx.fillStyle = "rgba(10,8,18,0.92)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = COLORS.gold;
    ctx.font = "bold 28px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⚙️ 设置", W / 2, 48);

    settingsToggleBtns = [];
    const items = [
        { label: "音效开关", get: () => s.sound.enabled, set: (v) => { s.sound.enabled = v; saveSettings(s); } },
        { label: "音量", type: "slider", get: () => s.sound.volume, set: (v) => { s.sound.volume = v; saveSettings(s); } },
        { label: "震屏", get: () => s.screenShake, set: (v) => { s.screenShake = v; saveSettings(s); } },
        { label: "击中停顿", get: () => s.hitStop, set: (v) => { s.hitStop = v; saveSettings(s); } },
        { label: "事件概率", type: "slider", get: () => s.eventChance, set: (v) => { s.eventChance = v; saveSettings(s); } },
    ];
    const bw = 400, bh = 36, gap = 8;
    const bx = W / 2 - bw / 2;
    let by = 100;
    for (const item of items) {
        ctx.fillStyle = "rgba(30,25,50,0.7)";
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = COLORS.ui;
        ctx.font = "bold 14px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(item.label, bx + 12, by + 24);
        if (item.type === "slider") {
            const val = item.get();
            const sw = 120;
            const sx = bx + bw - sw - 12;
            ctx.fillStyle = "rgba(80,60,100,0.8)";
            ctx.fillRect(sx, by + 8, sw, 20);
            ctx.fillStyle = COLORS.gold;
            ctx.fillRect(sx, by + 8, sw * val, 20);
            ctx.fillStyle = "#fff";
            ctx.font = "11px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(`${Math.round(val * 100)}%`, sx + sw / 2, by + 22);
            settingsToggleBtns.push({ x: sx, y: by, w: sw, h: bh, type: "slider", item });
        } else {
            const val = item.get();
            const tw = 60;
            const tx = bx + bw - tw - 12;
            ctx.fillStyle = val ? "rgba(60,180,80,0.8)" : "rgba(80,60,60,0.8)";
            ctx.fillRect(tx, by + 6, tw, 24);
            ctx.fillStyle = "#fff";
            ctx.font = "bold 12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(val ? "开" : "关", tx + tw / 2, by + 22);
            settingsToggleBtns.push({ x: tx, y: by, w: tw, h: bh, type: "toggle", item });
        }
        by += bh + gap;
    }

    // 返回按钮
    const bbw = 120, bbh = 34, bbx = W / 2 - bbw / 2, bby = by + 30;
    ctx.fillStyle = "rgba(60,50,90,0.8)";
    ctx.strokeStyle = "#9aa1ad";
    ctx.lineWidth = 1;
    roundRect(bbx, bby, bbw, bbh, 17);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.ui;
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("返回", bbx + bbw / 2, bby + 23);
    settingsBackBtn = { x: bbx, y: bby, w: bbw, h: bbh };
}

let settingsBackBtn = null;
export function hitSettingsBackButton(x, y) { return inRect(x, y, settingsBackBtn); }

export function handleSettingsClick(x, y) {
    const s = loadSettings();
    for (const btn of settingsToggleBtns) {
        if (!inRect(x, y, btn)) continue;
        if (btn.type === "toggle") {
            btn.item.set(!btn.item.get());
        } else if (btn.type === "slider") {
            const relX = (x - btn.x) / btn.w;
            const newVal = Math.max(0.05, Math.min(1, relX));
            btn.item.set(newVal);
        }
        // 应用设置到 GAME_CONFIG
        applySettings(s, GAME_CONFIG);
        return;
    }
}

// ─── 诅咒选择界面（三选一） ────────────────────────────────
export function drawCurseScreen() {
    ctx.fillStyle = "rgba(20,6,10,0.85)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#ff8080";
    ctx.font = "bold 30px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("选择一个诅咒", W / 2, H / 2 - 165);

    ctx.fillStyle = COLORS.uiDim;
    ctx.font = "14px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(`诅咒强度 ×${state.curseStrength} · 永久生效`, W / 2, H / 2 - 125);

    const choices = state.curseChoices;
    const cardW = 168;
    const cardH = 232;
    const gap = 20;
    const totalW = choices.length * cardW + (choices.length - 1) * gap;
    const startX = W / 2 - totalW / 2;
    const cardY = H / 2 - 95;

    curseCards = [];
    for (let i = 0; i < choices.length; i++) {
        const c = choices[i];
        const cx = startX + i * (cardW + gap);
        ctx.fillStyle = "rgba(40,12,20,0.95)";
        ctx.strokeStyle = "#ff8080";
        ctx.lineWidth = 2.5;
        ctx.shadowColor = "rgba(255,80,80,0.4)";
        ctx.shadowBlur = 12;
        roundRect(cx, cardY, cardW, cardH, 12);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = "#ff8080";
        ctx.font = "bold 12px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.textAlign = "right";
        ctx.fillText("诅咒", cx + cardW - 10, cardY + 24);

        ctx.font = "44px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(c.icon, cx + cardW / 2, cardY + 70);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 17px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.fillText(c.name, cx + cardW / 2, cardY + 100);

        ctx.fillStyle = "#d89090";
        ctx.font = "12px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.textAlign = "center";
        wrapText(typeof c.desc === "function" ? c.desc(state.curseStrength) : c.desc, cx + cardW / 2, cardY + 126, cardW - 24, 17);

        ctx.fillStyle = "#ff8080";
        ctx.font = "bold 12px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.fillText(`强度 ×${state.curseStrength} · 永久`, cx + cardW / 2, cardY + cardH - 14);

        curseCards.push({ x: cx, y: cardY, w: cardW, h: cardH });
    }
}

let curseCards = [];
export function hitCurseCard(x, y) {
    for (let i = 0; i < curseCards.length; i++) {
        if (inRect(x, y, curseCards[i])) return i;
    }
    return -1;
}

export function drawPenaltyScreen() {
    ctx.fillStyle = "rgba(20,6,10,0.85)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#ff8080";
    ctx.font = "bold 30px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("选择一项惩罚", W / 2, H / 2 - 165);

    ctx.fillStyle = COLORS.uiDim;
    ctx.font = "14px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(`击败 Boss 的代价 · 诅咒永久生效（本次强度 ×${state.penaltyStrength}）`, W / 2, H / 2 - 125);

    const choices = state.penaltyChoices;
    const cardW = 168;
    const cardH = 232;
    const gap = 20;
    const totalW = choices.length * cardW + (choices.length - 1) * gap;
    const startX = W / 2 - totalW / 2;
    const cardY = H / 2 - 95;

    penaltyCards = [];

    for (let i = 0; i < choices.length; i++) {
        const c = choices[i];
        const cx = startX + i * (cardW + gap);

        ctx.fillStyle = "rgba(40,12,20,0.95)";
        ctx.strokeStyle = "#ff8080";
        ctx.lineWidth = 2.5;
        ctx.shadowColor = "rgba(255,80,80,0.4)";
        ctx.shadowBlur = 12;
        roundRect(cx, cardY, cardW, cardH, 12);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = "#ff8080";
        ctx.font = "bold 12px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.textAlign = "right";
        ctx.fillText("惩罚", cx + cardW - 10, cardY + 24);

        ctx.font = "44px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(c.icon, cx + cardW / 2, cardY + 70);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 17px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.fillText(c.name, cx + cardW / 2, cardY + 100);

        ctx.fillStyle = "#d89090";
        ctx.font = "12px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.textAlign = "center";
        wrapText(c.desc(state.penaltyStrength), cx + cardW / 2, cardY + 126, cardW - 24, 17);

        ctx.fillStyle = "#ff8080";
        ctx.font = "bold 12px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.fillText(`强度 ×${state.penaltyStrength} · 永久`, cx + cardW / 2, cardY + cardH - 14);

        penaltyCards.push({ x: cx, y: cardY, w: cardW, h: cardH });
    }
}

export function drawGameOver() {
    ctx.fillStyle = "rgba(5,5,20,0.75)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#ff5566";
    ctx.font = "bold 40px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("游戏结束", W / 2, H / 2 - 50);

    ctx.fillStyle = COLORS.ui;
    ctx.font = "18px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(`最终分数: ${Math.floor(state.player.score / 10)}  |  到达第 ${state.player.level} 关`, W / 2, H / 2 + 0);

    const btnW = 200;
    const btnH = 46;
    const btnX = W / 2 - btnW / 2;

    const y1 = H / 2 + 40;
    const grad1 = ctx.createLinearGradient(btnX, y1, btnX, y1 + btnH);
    grad1.addColorStop(0, "#ff5566");
    grad1.addColorStop(1, "#ff7744");
    ctx.fillStyle = grad1;
    roundRect(btnX, y1, btnW, btnH, 23);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("重新开始", W / 2, y1 + 31);
    restartBtn = { x: btnX, y: y1, w: btnW, h: btnH };

    const y2 = y1 + btnH + 14;
    ctx.fillStyle = "rgba(40,35,60,0.8)";
    ctx.strokeStyle = COLORS.uiDim;
    ctx.lineWidth = 1;
    roundRect(btnX, y2, btnW, btnH, 23);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.ui;
    ctx.font = "bold 15px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("退出到主菜单", W / 2, y2 + 30);
    gameOverExitBtn = { x: btnX, y: y2, w: btnW, h: btnH };
}

export function drawVictory() {
    ctx.fillStyle = "rgba(5,5,20,0.75)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = COLORS.gold;
    ctx.font = "bold 40px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🎉 恭喜通关！", W / 2, H / 2 - 50);

    ctx.fillStyle = COLORS.ui;
    ctx.font = "18px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(`最终分数: ${Math.floor(state.player.score / 10)}  |  已通关 50 层`, W / 2, H / 2 + 0);

    const btnW = 200;
    const btnH = 46;
    const btnX = W / 2 - btnW / 2;

    const y1 = H / 2 + 40;
    const grad1 = ctx.createLinearGradient(btnX, y1, btnX, y1 + btnH);
    grad1.addColorStop(0, COLORS.paddle1);
    grad1.addColorStop(1, COLORS.paddle2);
    ctx.fillStyle = grad1;
    roundRect(btnX, y1, btnW, btnH, 23);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("再来一局", W / 2, y1 + 31);
    restartBtn = { x: btnX, y: y1, w: btnW, h: btnH };

    const y2 = y1 + btnH + 14;
    ctx.fillStyle = "rgba(40,35,60,0.8)";
    ctx.strokeStyle = COLORS.uiDim;
    ctx.lineWidth = 1;
    roundRect(btnX, y2, btnW, btnH, 23);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.ui;
    ctx.font = "bold 15px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("退出到主菜单", W / 2, y2 + 30);
    gameOverExitBtn = { x: btnX, y: y2, w: btnW, h: btnH };
}