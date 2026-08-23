// ═══ 界面层 ═══
// 全部界面改为像素风：浮雕面板 + 切角边框 + 点阵图标 + 硬描边文字。
// HUD 拆到 ui_hud.js；本文件负责菜单与各类弹窗，以及所有按钮命中检测。

import { W, H, STATE, RARITY_META, MAX_SKILLS, TOTAL_LEVELS } from "./constants.js";
import { state } from "./state.js";
import { ctx } from "./canvas.js";
import { PAL, RARITY_PAL } from "./palette.js";
import {
    PX, snap, pRect, pPanel, pSlot, pText, pTextShadow, pWrap,
    pScrim, pBar, pChamferFill,
} from "./pixel.js";
import {
    panelX, CARD_W, CARD_H, CARD_GAP, cardRow, BTN_W, BTN_H, BTN_SM_W, BTN_SM_H,
} from "./layout.js";
import { drawIcon } from "./icons.js";
import { REWARD_TYPE_NAME, REWARD_MAP, REWARDS } from "./rewards.js";
import { CURSES, HEAVY_CURSES, CURSES_MAP } from "./curses.js";
import { EVENTS } from "./events.js";
import { loadSaveData } from "./game.js";
import { getHighScore, skinDef, getUnlocks, isRewardUnlocked, getSelectedSkin, SKIN_START_SKILLS } from "./unlocks.js";
import { loadSettings, saveSettings, applySettings } from "./settings.js";
import { GAME_CONFIG } from "./config.js";
import { BOSS_CANDIDATES } from "./data/bosses.js";
import { ARMORED } from "./data/levels.js";
import { getAllBosses } from "./boss.js";

export { drawUI } from "./ui_hud.js";

// ─── 图鉴状态 ─────────────────────────────────────────────
let codexTab = 0;
let codexPage = 0;
export function setCodexTab(t) { codexTab = t; codexPage = 0; }
export function setCodexPage(d) { codexPage = Math.max(0, codexPage + d); }

// ─── 命中区域 ─────────────────────────────────────────────
let startBtn = null, continueBtn = null, restartBtn = null;
let rewardCards = [], swapCards = [], swapCancelBtn = null;
let eventButtons = [], eventContinueBtn = null, bossClearBtn = null;
let pauseResumeBtn = null, pauseRestartBtn = null, pauseQuitBtn = null, pauseStatusBtn = null;
let penaltyCards = [], curseCards = [];
let menuCodexBtn = null, pauseCodexBtn = null, menuSkinBtn = null, menuSettingsBtn = null, gameOverExitBtn = null;
let codexTabBtns = [], codexNextBtn = null, codexPrevBtn = null;
let settingsToggleBtns = [], settingsBackBtn = null;
let statusTabBtns = [], statusBackBtn = null;
// 角色状态当前分页：0=数值 1=技能 2=能力 3=诅咒
let statusTab = 0;
// 列表页内的翻页游标与总页数（由 drawStatusList 回填）
let statusPage = 0;
let statusPages = 1;

function inRect(x, y, r) {
    return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export const hitStartButton = (x, y) => inRect(x, y, startBtn);
export const hitContinueButton = (x, y) => inRect(x, y, continueBtn);
export const hitRestartButton = (x, y) => inRect(x, y, restartBtn);
export const hitSwapCancel = (x, y) => inRect(x, y, swapCancelBtn);
export const hitEventContinueButton = (x, y) => inRect(x, y, eventContinueBtn);
export const hitPauseResume = (x, y) => inRect(x, y, pauseResumeBtn);
export const hitPauseRestart = (x, y) => inRect(x, y, pauseRestartBtn);
export const hitPauseQuit = (x, y) => inRect(x, y, pauseQuitBtn);
export const hitMenuCodexButton = (x, y) => inRect(x, y, menuCodexBtn);
export const hitMenuSkinButton = (x, y) => inRect(x, y, menuSkinBtn);
export const hitMenuSettingsButton = (x, y) => inRect(x, y, menuSettingsBtn);
export const hitPauseCodexButton = (x, y) => inRect(x, y, pauseCodexBtn);
export const hitPauseStatusButton = (x, y) => inRect(x, y, pauseStatusBtn);
export const hitCodexNext = (x, y) => inRect(x, y, codexNextBtn);
export const hitCodexPrev = (x, y) => inRect(x, y, codexPrevBtn);
export const hitBossClearButton = (x, y) => inRect(x, y, bossClearBtn);
export const hitGameOverExitButton = (x, y) => inRect(x, y, gameOverExitBtn);
export const hitSkipButton = (x, y) => inRect(x, y, state._skipBtn);
export const hitSettingsBackButton = (x, y) => inRect(x, y, settingsBackBtn);

export function hitRewardCard(x, y) {
    for (const c of rewardCards) if (inRect(x, y, c)) return c.def;
    return null;
}
export function hitSwapCardIndex(x, y) {
    for (let i = 0; i < swapCards.length; i++) if (inRect(x, y, swapCards[i])) return i;
    return -1;
}
export function hitEventChoiceIndex(x, y) {
    for (let i = 0; i < eventButtons.length; i++) if (inRect(x, y, eventButtons[i])) return i;
    return -1;
}
export function hitPenaltyCard(x, y) {
    for (let i = 0; i < penaltyCards.length; i++) if (inRect(x, y, penaltyCards[i])) return i;
    return -1;
}
export function hitCurseCard(x, y) {
    for (let i = 0; i < curseCards.length; i++) if (inRect(x, y, curseCards[i])) return i;
    return -1;
}
export function hitCodexTab(x, y) {
    for (let i = 0; i < codexTabBtns.length; i++) if (inRect(x, y, codexTabBtns[i])) return i;
    return -1;
}

export function hitStatusTab(x, y) {
    for (let i = 0; i < statusTabBtns.length; i++) if (inRect(x, y, statusTabBtns[i])) return i;
    return -1;
}
export const hitStatusBack = (x, y) => inRect(x, y, statusBackBtn);
// 切换分页时归零页码：不同分页条数不同，沿用旧页码会停在空页上
export const setStatusTab = (i) => {
    statusTab = Math.max(0, Math.min(3, i));
    statusPage = 0;
};
export const getStatusTab = () => statusTab;
export const setStatusPage = (d) => {
    statusPage = Math.max(0, Math.min(statusPages - 1, statusPage + d));
};
export const getStatusPage = () => statusPage;

// 当前帧记录的所有命中矩形，供视觉审计校验"画在哪里就能点到哪里"。
// 只读快照，不参与游戏逻辑。
export function debugHitRects() {
    return {
        start: startBtn, continue: continueBtn, restart: restartBtn,
        menuCodex: menuCodexBtn, menuSkin: menuSkinBtn, menuSettings: menuSettingsBtn,
        pauseResume: pauseResumeBtn, pauseRestart: pauseRestartBtn, pauseQuit: pauseQuitBtn,
        pauseCodex: pauseCodexBtn, pauseStatus: pauseStatusBtn,
        gameOverExit: gameOverExitBtn, bossClear: bossClearBtn,
        skip: state._skipBtn, settingsBack: settingsBackBtn,
        eventContinue: eventContinueBtn, swapCancel: swapCancelBtn,
        codexTabs: codexTabBtns, codexNext: codexNextBtn, codexPrev: codexPrevBtn,
        statusTabs: statusTabBtns, statusBack: statusBackBtn,
        rewardCards, curseCards, penaltyCards, eventButtons, swapCards,
        codexItems: codexItemRects,
    };
}

// ═══ 共享控件 ═══════════════════════════════════════════

// 标准按钮：浮雕面板 + 顶部高光条，主/次两种强调级别
function pButton(x, y, w, h, label, opts = {}) {
    const { kind = "primary", disabled = false, icon = null, size = 15 } = opts;
    const theme = disabled
        ? { fill: PAL.stone0, light: PAL.stone1, text: PAL.mist0, edge: PAL.ink0 }
        : kind === "primary"
            ? { fill: PAL.gold1, light: PAL.gold2, text: PAL.ink0, edge: PAL.gold0 }
            : kind === "danger"
                ? { fill: PAL.blood1, light: PAL.blood2, text: PAL.bone1, edge: PAL.blood0 }
                : { fill: PAL.stone1, light: PAL.stone2, text: PAL.bone0, edge: PAL.ink0 };

    const X = snap(x), Y = snap(y), Wd = snap(w), Ht = snap(h);
    pChamferFill(X, Y, Wd, Ht, PAL.ink0, 2);
    pChamferFill(X + PX, Y + PX, Wd - PX * 2, Ht - PX * 2, theme.edge, 1);
    pChamferFill(X + PX, Y + PX, Wd - PX * 2, Ht - PX * 3, theme.fill, 1);
    pRect(X + PX * 2, Y + PX * 2, Wd - PX * 4, PX, theme.light);

    const tx = icon ? X + Wd / 2 + 10 : X + Wd / 2;
    if (icon) drawIcon(icon, X + Wd / 2 - measureText(label, size) / 2 - 6, Y + Ht / 2 - 1, 2, theme.text);
    pText(label, tx, Y + Ht / 2 + size / 2 - 1, theme.text, { size, bold: true, align: "center", outline: null });
    return { x: X, y: Y, w: Wd, h: Ht, disabled };
}

function measureText(t, size) {
    ctx.save();
    ctx.font = `bold ${size}px monospace`;
    const w = ctx.measureText(t).width;
    ctx.restore();
    return w;
}

// 最近一次绘制的弹窗几何，供视觉审计校验是否溢出画面
let lastModal = null;
export const debugLastModal = () => lastModal;

// 角色状态页最后一次绘制的内容边界，供审计校验是否溢出面板。
// 用几何而不是像素判断：画布底色就是 ink1，且 STATUS 画在 drawUI() 之后，
// 底下的 HUD 与游戏区会透过网点遮罩显出来，
// 所以"面板外是否出现某个颜色"永远为真，量不出溢出。
let statusBounds = null;
export const debugStatusBounds = () => statusBounds;

// 弹窗外框：暗化背景 + 居中浮雕面板 + 标题条
function pModal(w, h, title, opts = {}) {
    const { accent = PAL.gold2, icon = null, scrim = 0.8 } = opts;
    pScrim(scrim);
    const x = panelX(w);
    const y = snap((H - h) / 2);
    pPanel(x, y, w, h, { fill: PAL.ink2, light: PAL.stone1, dark: PAL.ink0, chamfer: 3 });
    // 标题条
    pRect(x + PX * 2, y + PX * 2, w - PX * 4, PX * 9, PAL.ink1);
    pRect(x + PX * 2, y + PX * 11 - PX, w - PX * 4, PX, accent);
    if (title) {
        const cx = x + w / 2;
        if (icon) drawIcon(icon, cx - measureText(title, 18) / 2 - 16, y + PX * 6, 2.5, accent);
        pText(title, cx, y + PX * 8, accent, { size: 18, bold: true, align: "center" });
    }
    lastModal = { x, y, w, h };
    return { x, y, w, h, bodyY: y + PX * 12 };
}

export { pButton, pModal, measureText };

// ═══ 主菜单 ═════════════════════════════════════════════
export function drawMenu() {
    pScrim(0.55);

    // 标题：像素砖体大字 + 双层阴影，模仿《以撒》标题的厚重感
    const cx = W / 2;
    const ty = 132;
    pText("弹球", cx - 76, ty, PAL.gold2, { size: 46, bold: true, align: "center", ow: PX });
    pText("ROGUELIKE", cx + 52, ty, PAL.bone1, { size: 30, bold: true, align: "center", ow: PX });
    // 标题下的分隔纹样
    pRect(cx - 180, ty + 14, 360, PX, PAL.gold1);
    pRect(cx - 120, ty + 14 + PX * 2, 240, PX, PAL.gold0);

    // 最高分
    const hs = getHighScore();
    if (hs > 0) {
        drawIcon("crown", cx - 62, ty + 40, 2, PAL.gold3);
        pText(`最高 ${Math.floor(hs / 10)}`, cx - 44, ty + 46, PAL.gold3, { size: 14, bold: true });
    }

    // 玩法说明：两行，低对比，居中
    pTextShadow("移动鼠标控制挡板 · 点击发射 · 击碎全部方块过关", cx, 214, PAL.mist1, { size: 13, align: "center" });
    pTextShadow(`每关选择奖励 · 每 15 关迎战 Boss · 共 ${TOTAL_LEVELS} 层`, cx, 236, PAL.mist0, { size: 12, align: "center" });

    const save = loadSaveData();
    continueBtn = null;
    const bx = (W - BTN_W) / 2;
    let y = 272;

    if (save) {
        continueBtn = pButton(bx, y, BTN_W, BTN_H, `继续 · 第 ${save.level} 层`, { kind: "primary", icon: "star" });
        y += BTN_H + 12;
        startBtn = pButton(bx, y, BTN_W, BTN_H, "新的冒险", { kind: "secondary" });
        y += BTN_H + 12;
    } else {
        startBtn = pButton(bx, y, BTN_W, BTN_H, "开始游戏", { kind: "primary" });
        y += BTN_H + 12;
    }

    // 次级按钮行：图鉴 / 皮肤 / 设置 横向排列，节省纵向空间
    const smW = 130, smH = BTN_SM_H, gap = 10;
    const unlocks = getUnlocks();
    const curSkin = skinDef(getSelectedSkin());
    const hasSkin = unlocks.tiers.some((t) => t);
    const row = hasSkin && curSkin ? 3 : 2;
    const totalW = row * smW + (row - 1) * gap;
    let rx = (W - totalW) / 2;

    menuCodexBtn = pButton(rx, y, smW, smH, "图鉴", { kind: "secondary", icon: "book", size: 13 });
    rx += smW + gap;
    if (row === 3) {
        menuSkinBtn = pButton(rx, y, smW, smH, curSkin.name, { kind: "secondary", icon: "palette", size: 12 });
        rx += smW + gap;
    } else {
        menuSkinBtn = null;
    }
    menuSettingsBtn = pButton(rx, y, smW, smH, "设置", { kind: "secondary", icon: "gear", size: 13 });

    // 底部按键提示
    pTextShadow("1/2 释放技能 · ESC 暂停 · M 静音", cx, H - 30, PAL.mist0, { size: 11, align: "center" });
}

// ═══ 奖励卡 ═════════════════════════════════════════════
// 卡面结构（自上而下）：稀有度顶条 → 图标龛位 → 名称 → 描述 → 底部信息条
function drawCard(x, y, w, h, opts) {
    const {
        icon, name, desc, rarity = "common", typeLabel = null,
        footer = null, footerColor = null, statLine = null, tag = null, danger = false,
    } = opts;
    const rp = danger
        ? { base: PAL.blood2, light: PAL.blood3, dark: PAL.blood1 }
        : RARITY_PAL[rarity] || RARITY_PAL.common;

    // 外框 + 卡面
    pChamferFill(x, y, w, h, PAL.ink0, 3);
    pChamferFill(x + PX, y + PX, w - PX * 2, h - PX * 2, rp.dark, 2);
    pChamferFill(x + PX * 2, y + PX * 2, w - PX * 4, h - PX * 4, danger ? PAL.ink1 : PAL.ink2, 2);

    // 稀有度顶条
    pRect(x + PX * 2, y + PX * 2, w - PX * 4, PX * 2, rp.base);
    pRect(x + PX * 2, y + PX * 2, w - PX * 4, PX, rp.light);

    // 顶部标签行
    const labelY = y + PX * 8 + 2;
    pText(danger ? "诅咒" : RARITY_META[rarity]?.name || "", x + PX * 4, labelY, rp.light, { size: 11, bold: true });
    if (typeLabel) {
        pTextShadow(typeLabel, x + w - PX * 4, labelY, PAL.mist0, { size: 10, align: "right" });
    }

    // 图标龛位：凹槽 + 居中图标，给图标一个"被镶嵌"的实体感
    const nicheS = 52;
    const nx = x + (w - nicheS) / 2;
    const ny = y + PX * 11;
    pSlot(nx, ny, nicheS, nicheS, PAL.ink0);
    drawIcon(icon, nx + nicheS / 2, ny + nicheS / 2, 4, rp.light, name);

    // 名称
    pText(name, x + w / 2, ny + nicheS + 24, PAL.bone1, { size: 16, bold: true, align: "center" });

    // 描述（自动换行）
    pWrap(desc, x + w / 2, ny + nicheS + 46, w - PX * 8, 17, PAL.mist1, { size: 12, align: "center" });

    // 角标（Boss 专属等）
    if (tag) {
        pRect(x + PX * 2, y + h - PX * 9, w - PX * 4, PX * 5, PAL.gold0);
        pText(tag, x + w / 2, y + h - PX * 5, PAL.gold3, { size: 11, bold: true, align: "center" });
    }

    // 底部信息
    if (footer) {
        pTextShadow(footer, x + w / 2, y + h - PX * 3, footerColor || PAL.mist0, { size: 11, align: "center" });
    }
    // 当前数值（在 footer 上方，避开角标区域）
    if (statLine) {
        pTextShadow(statLine, x + w / 2, y + h - (tag ? PX * 12 : PX * 7), PAL.mist0, { size: 10, align: "center" });
    }
}

// 当前数值映射：奖励 id → 当前玩家数值文字
function rewardStatLine(def, count) {
    const p = state.player;
    if (!p) return null;
    switch (def.id) {
        case "power_ball": case "mega_ball": case "annihil_ball": case "double_strike":
        case "doom_blast": case "init_weakpoint":
            return `当前伤害：${p.ballDamage}`;
        case "slow_ball":
            return `当前速度：${Math.round(p.ballSpeedMul * 100)}%`;
        case "godseed":
            return `速度 ${Math.round(p.ballSpeedMul * 100)}% · 伤害 ${p.ballDamage}`;
        case "extra_life": case "big_life": case "life_crown": case "init_regen": case "init_tenacity":
            return `当前生命：${Math.floor(p.lives)}`;
        case "wider_paddle": case "giant_paddle": case "titan_arm":
            return `当前挡板：${Math.round((1 + p.paddleBonus) * 100)}%`;
        case "score_boost": case "entry_gain": case "spark_core": case "gold_soul":
        case "greed_eye": case "treasury":
            return `当前倍率：×${p.scoreMul.toFixed(1)}`;
        case "cd_reduction": case "rapid_cooling": case "time_weaver":
            return `当前 CD：${Math.round(p.skillCdMul * 100)}%`;
        case "piercing":
            return `当前穿透：${p.maxPiercing}`;
        case "dual_ball": case "blessed_start":
            return `开局球数：${p.startBalls}`;
        case "giant_orb": case "titan_ball":
            return `当前体积：${Math.round(p.ballRadiusMul * 100)}%`;
        case "lucky":
            return `选卡数量：${3 + p.extraChoices}`;
        case "compass": case "lucky_charm":
            return `稀有概率：+${p.luckyBonus || 0}%`;
        case "init_shatter":
            return `触发概率：${Math.round((p.shatterChance || 0) * 100)}%`;
        case "init_deflect":
            return `减速范围：${p.deflectRadius || 0}px`;
        case "init_surge":
            return `累积：${p.surgeCounter || 0}/${p.surgeNeed || 5}`;
        case "split_ball":
            return `分裂间隔：${p.perks.split_ball ? 5 : 10} 个`;
        case "bouncy_combo":
            return p.perks.bouncy_combo ? "已激活" : null;
        default:
            if (def.type === "skill") return null;
            if (count > 0) return `已拥有 ×${count}`;
            return null;
    }
}

export function drawRewardScreen() {
    const choices = state.levelChoices;
    const rows = cardRow(choices.length, 0);
    const modalW = Math.min(W - 40, choices.length * CARD_W + (choices.length - 1) * CARD_GAP + 56);
    const modalH = CARD_H + 152;
    const m = pModal(modalW, modalH, state.rewardTitle || "获得奖励", { icon: "star" });

    const sub = state.rareOnly ? "Boss 掉落 · 必定稀有" : "选择一项奖励";
    pTextShadow(sub, W / 2, m.y + PX * 15, PAL.mist1, { size: 13, align: "center" });

    const cardY = m.y + PX * 19;
    rewardCards = [];

    for (let i = 0; i < choices.length; i++) {
        const def = choices[i];
        const cx = rows[i].x;
        let count = state.player.perks[def.id] || 0;
        if (def.type === "skill") count = state.player.skills.filter((s) => s.id === def.id).length;

        let footer = null, footerColor = null;
        if (def.type === "skill" && count === 0) {
            footer = `冷却 ${def.cooldown}s · 装备后按 1/2`;
            footerColor = RARITY_PAL[def.rarity].base;
        } else if (count > 0) {
            footer = `已拥有 ×${count}`;
            footerColor = PAL.gold3;
        } else if (def.type === "skill") {
            footer = `冷却 ${def.cooldown}s`;
        }

        // 当前数值
        const statLine = rewardStatLine(def, count);

        drawCard(cx, cardY, CARD_W, CARD_H, {
            icon: def.icon,
            name: def.name,
            desc: def.desc,
            rarity: def.rarity,
            typeLabel: REWARD_TYPE_NAME[def.type],
            tag: def.bossOnly ? "★ BOSS 专属" : null,
            footer,
            footerColor,
            statLine,
        });
        rewardCards.push({ x: cx, y: cardY, w: CARD_W, h: CARD_H, def });
    }

    // 跳过按钮（开局奖励不可跳过，必须选一张）
    const sy = cardY + CARD_H + 14;
    if (state.gameState !== STATE.START_REWARD) {
        state._skipBtn = pButton((W - BTN_SM_W) / 2, sy, BTN_SM_W, BTN_SM_H, "跳过", { kind: "secondary", size: 13 });
    } else {
        state._skipBtn = null;
    }
}

// ═══ 技能替换 ═══════════════════════════════════════════
export function drawSkillSwap() {
    const p = state.player;
    const effectiveMax = MAX_SKILLS - (p.curseSkillSlotPenalty || 0);
    const active = p.skills.slice(0, effectiveMax);

    const cw = 200, ch = 180, gap = 28;
    const modalW = Math.min(W - 40, Math.max(1, active.length) * cw + Math.max(0, active.length - 1) * gap + 56);
    const m = pModal(modalW, ch + 168, `技能槽已满 ${effectiveMax}/${MAX_SKILLS}`, { icon: "sealed", accent: PAL.ember2 });

    pTextShadow("点击要舍弃的技能，或取消本次装备", W / 2, m.y + PX * 15, PAL.mist1, { size: 13, align: "center" });

    const rows = cardRow(active.length, 0, cw, gap);
    const cardY = m.y + PX * 20;
    swapCards = [];

    for (let i = 0; i < active.length; i++) {
        const def = REWARD_MAP[active[i].id];
        const cx = rows[i].x;
        const rp = RARITY_PAL[def.rarity];

        pChamferFill(cx, cardY, cw, ch, PAL.ink0, 3);
        pChamferFill(cx + PX, cardY + PX, cw - PX * 2, ch - PX * 2, rp.dark, 2);
        pChamferFill(cx + PX * 2, cardY + PX * 2, cw - PX * 4, ch - PX * 4, PAL.ink2, 2);
        pRect(cx + PX * 2, cardY + PX * 2, cw - PX * 4, PX * 2, rp.base);

        pSlot(cx + (cw - 52) / 2, cardY + PX * 7, 52, 52, PAL.ink0);
        drawIcon(def.icon, cx + cw / 2, cardY + PX * 7 + 26, 4, rp.light, def.name);

        pText(def.name, cx + cw / 2, cardY + PX * 21, PAL.bone1, { size: 16, bold: true, align: "center" });
        pWrap(def.desc, cx + cw / 2, cardY + PX * 26, cw - PX * 8, 16, PAL.mist1, { size: 12, align: "center" });
        pTextShadow(`按 ${i + 1} 键位`, cx + cw / 2, cardY + ch - PX * 3, PAL.mist0, { size: 11, align: "center" });

        swapCards.push({ x: cx, y: cardY, w: cw, h: ch });
    }

    swapCancelBtn = pButton((W - BTN_SM_W) / 2, cardY + ch + 16, BTN_SM_W, BTN_SM_H, "取消", {
        kind: "secondary", size: 13,
    });
}

// ═══ 事件房 ═════════════════════════════════════════════
export function drawEventScreen() {
    // 结果面板
    if (state.eventResult) {
        const lines = String(state.eventResult.text).split("\n");
        const h = 168 + lines.length * 24;
        const m = pModal(520, h, "事件结果", { icon: "scroll", accent: state.eventResult.color || PAL.gold2 });
        let ly = m.y + PX * 18;
        for (const line of lines) {
            pTextShadow(line, W / 2, ly, PAL.bone0, { size: 14, align: "center" });
            ly += 24;
        }
        eventContinueBtn = pButton((W - BTN_W) / 2, m.y + h - BTN_H - PX * 5, BTN_W, BTN_H, "继续", { kind: "primary" });
        return;
    }

    const ev = state.currentEvent;
    if (!ev) return;

    const descLines = ev.desc.split("\n");
    // 选项多时自动压缩按钮高度，保证面板永远不超出画面
    const wanted = 190 + descLines.length * 22 + ev.choices.length * 52;
    const bh = wanted > H - 20
        ? Math.max(30, Math.floor((H - 20 - 190 - descLines.length * 22) / ev.choices.length) - 10)
        : 42;
    const bgap = 10;
    const h = Math.min(H - 20, 190 + descLines.length * 22 + ev.choices.length * (bh + bgap));
    const m = pModal(560, h, null, { scrim: 0.84 });

    // 事件图标龛位 + 标题
    const nicheS = 60;
    pSlot(W / 2 - nicheS / 2, m.y + PX * 5, nicheS, nicheS, PAL.ink0);
    drawIcon(ev.icon, W / 2, m.y + PX * 5 + nicheS / 2, 5, PAL.vio3, ev.name);

    pText(ev.name, W / 2, m.y + PX * 5 + nicheS + 26, PAL.vio3, { size: 22, bold: true, align: "center" });
    pRect(W / 2 - 120, m.y + PX * 5 + nicheS + 34, 240, PX, PAL.vio1);

    let ly = m.y + PX * 5 + nicheS + 58;
    for (const line of descLines) {
        pTextShadow(line, W / 2, ly, PAL.mist1, { size: 13, align: "center" });
        ly += 22;
    }

    // 选项按钮
    const bw = 400;
    let by = ly + 12;
    eventButtons = [];
    for (const choice of ev.choices) {
        const disabled = choice.need && !choice.need();
        const r = pButton((W - bw) / 2, by, bw, bh, choice.label, {
            kind: disabled ? "secondary" : "primary",
            disabled,
            size: 14,
        });
        eventButtons.push({ ...r, disabled });
        by += bh + bgap;
    }
}

// ═══ Boss 击破 ══════════════════════════════════════════
export function drawBossClear() {
    const m = pModal(480, 260, null, { scrim: 0.82 });
    drawIcon("skull", W / 2, m.y + PX * 12, 7, PAL.gold3);
    pText("BOSS 击破", W / 2, m.y + PX * 25, PAL.gold2, { size: 32, bold: true, align: "center", ow: PX });
    pTextShadow("掉落稀有战利品", W / 2, m.y + PX * 32, PAL.mist1, { size: 14, align: "center" });
    bossClearBtn = pButton((W - BTN_W) / 2, m.y + 260 - BTN_H - PX * 6, BTN_W, BTN_H, "领取奖励", {
        kind: "primary", icon: "star",
    });
}

// ═══ 暂停 ═══════════════════════════════════════════════
export function drawPauseScreen() {
    const m = pModal(420, 344, "已暂停", { icon: "hourglass", scrim: 0.74 });

    pTextShadow(
        `第 ${state.player.level} 层 · 分数 ${Math.floor(state.player.score / 10)}`,
        W / 2, m.y + PX * 15, PAL.mist1, { size: 13, align: "center" }
    );
    pTextShadow("进度已自动保存", W / 2, m.y + PX * 20, PAL.moss2, { size: 11, align: "center" });

    const bw = 260;
    const bx = (W - bw) / 2;
    let y = m.y + PX * 25;

    pauseResumeBtn = pButton(bx, y, bw, BTN_H, "继续游戏", { kind: "primary" });
    y += BTN_H + 10;
    pauseCodexBtn = pButton(bx, y, bw, BTN_H, "图鉴", { kind: "secondary", icon: "book" });
    y += BTN_H + 10;
    pauseStatusBtn = pButton(bx, y, bw, BTN_H, "角色状态", { kind: "secondary", icon: "user" });
    y += BTN_H + 10;
    pauseRestartBtn = pButton(bx, y, bw, BTN_H, "重新开始", { kind: "secondary" });
    y += BTN_H + 10;
    pauseQuitBtn = pButton(bx, y, bw, BTN_H, "保存并返回主菜单", { kind: "secondary", size: 14 });

    pTextShadow("ESC 继续", W / 2, m.y + 344 - PX * 3, PAL.mist0, { size: 11, align: "center" });
}

// ═══ 角色状态总览 ═════════════════════════════════════════
// ═══ 角色状态 ═══════════════════════════════════════════
// 四个分页各看一类状态，而不是把四段挤在同一面板里。
// 原实现把「数值 / 技能 / 能力 / 诅咒」四段顺序堆进 520px 高的面板，
// 而能力最多 24 条、诅咒最多 36 条：中期配置就要溢出 122px，满配溢出 682px，
// 文字直接叠在一起。分页后每页只需容纳自己那一类，且各页独立滚动上限。
// 图标只用 icons.js 里确实存在的字形：不存在的名字会被 resolveIcon
// 静默兜底成 star，四个 tab 就会有多个一样的图标。
const STATUS_TABS = [
    { label: "数值", icon: "scroll" },
    { label: "技能", icon: "lightning" },
    { label: "能力", icon: "star" },
    { label: "诅咒", icon: "curse" },
];

export function drawStatusScreen() {
    const modal = pModal(620, 500, "角色状态", { icon: "heart", scrim: 0.88 });

    // ── Tab 栏 ──
    const tw = 128, th = 30, gap = 6;
    const tsx = modal.x + (modal.w - (STATUS_TABS.length * (tw + gap) - gap)) / 2;
    const ty = modal.bodyY + PX;
    statusTabBtns = [];
    for (let i = 0; i < STATUS_TABS.length; i++) {
        const tx = snap(tsx + i * (tw + gap));
        const active = i === statusTab;
        const accent = i === 3 ? PAL.blood2 : PAL.gold1;
        const accentHi = i === 3 ? PAL.blood3 : PAL.gold3;
        pChamferFill(tx, ty, tw, th, PAL.ink0, 2);
        pChamferFill(tx + PX, ty + PX, tw - PX * 2, th - PX * 2, active ? accent : PAL.stone0, 1);
        if (active) pRect(tx + PX * 2, ty + PX, tw - PX * 4, PX, accentHi);
        drawIcon(STATUS_TABS[i].icon, tx + 22, ty + th / 2, 2, active ? PAL.ink0 : PAL.mist1);
        pText(STATUS_TABS[i].label, tx + tw / 2 + 12, ty + 20, active ? PAL.ink0 : PAL.mist1, {
            size: 13, bold: true, align: "center", outline: null,
        });
        statusTabBtns.push({ x: tx, y: ty, w: tw, h: th });
    }

    // ── 内容区 ──
    const bodyTop = ty + th + PX * 3;
    const bodyBottom = modal.y + modal.h - PX * 13;   // 给底部返回按钮留位
    const pad = PX * 5;
    const X0 = modal.x + pad;
    const X1 = modal.x + modal.w - pad;

    statusBounds = { limit: bodyBottom, maxY: bodyTop, tab: statusTab };
    if (statusTab === 0) drawStatusStats(X0, X1, bodyTop, bodyBottom);
    else if (statusTab === 1) drawStatusSkills(X0, X1, bodyTop, bodyBottom);
    else if (statusTab === 2) drawStatusPerks(X0, X1, bodyTop, bodyBottom);
    else drawStatusCurses(X0, X1, bodyTop, bodyBottom);

    // ── 返回按钮 ──
    statusBackBtn = pButton(
        snap(modal.x + (modal.w - BTN_SM_W) / 2), snap(modal.y + modal.h - PX * 11),
        BTN_SM_W, BTN_SM_H, "返回 (ESC)", { accent: PAL.stone2 },
    );
}

// ── 页1：数值 ──
// 两列并排，把 11 行压成 6 行，避免竖向拉长；数值右对齐便于纵向比对。
function drawStatusStats(X0, X1, top, bottom) {
    const p = state.player;
    const stats = [
        ["生命", `${Math.floor(p.lives)}`],
        ["分数", `${Math.floor(p.score / 10)}`],
        ["关卡", `${p.level}`],
        ["球伤害", `${p.ballDamage}`],
        ["球速倍率", `${(p.ballSpeedMul * 100).toFixed(0)}%`],
        ["挡板加成", `${((p.paddleBonus || 0) * 100).toFixed(0)}%`],
        ["分数倍率", `${(p.scoreMul * 100).toFixed(0)}%`],
        ["穿透次数", `${p.maxPiercing}`],
        ["技能 CD 倍率", `${(p.skillCdMul * 100).toFixed(0)}%`],
        ["开局球数", `${p.startBalls}`],
        ["球体积", `${(p.ballRadiusMul * 100).toFixed(0)}%`],
    ];
    // 两列布局：列宽均分，每列内部「名称左对齐 / 数值右对齐」
    const colW = (X1 - X0 - PX * 6) / 2;
    const rowH = 26;
    const rows = Math.ceil(stats.length / 2);
    for (let i = 0; i < stats.length; i++) {
        const col = i < rows ? 0 : 1;
        const row = i < rows ? i : i - rows;
        const cx = X0 + col * (colW + PX * 6);
        const cy = top + PX * 2 + row * rowH;
        if (cy + rowH > bottom) break;
        if (statusBounds) statusBounds.maxY = Math.max(statusBounds.maxY, cy + rowH - PX * 3);
        // 交替行底色：长列表里帮助横向对位
        if (row % 2 === 0) pRect(cx - PX, cy - PX * 3, colW + PX * 2, rowH - PX, PAL.ink1);
        pTextShadow(stats[i][0], cx, cy, PAL.mist1, { size: 12, align: "left" });
        pTextShadow(stats[i][1], cx + colW, cy, PAL.bone1, { size: 13, bold: true, align: "right" });
    }
}

// ── 页2：技能 ──
// 每条一行卡片：图标 + 名称 + 描述。描述单独一行，不再和名称抢同一行的左右两端。
function drawStatusSkills(X0, X1, top, bottom) {
    const p = state.player;
    const skills = p.skills || [];
    if (skills.length === 0) {
        emptyHint("尚未装备技能", X0, X1, top);
        return;
    }
    let y = top + PX;
    for (const s of skills) {
        const def = REWARD_MAP[s.id] || SKIN_START_SKILLS[s.id];
        if (!def) continue;
        if (y + SROW_H > bottom) break;
        const rp = RARITY_PAL[def.rarity] || RARITY_PAL.common;
        drawStatusRow(X0, X1, y, def.icon, def.name, def.desc, rp.light, rp.base);
        y += SROW_STEP;
    }
}

// 单行条目：左侧稀有度竖条 + 点阵图标 + 名称 + 描述
// 图标必须走 drawIcon：数据文件里 icon 存的是 emoji（"⚡"/"❤️"），
// 用 pTextShadow 直接打会在画布上渲染出抗锯齿的系统 emoji，
// 与像素风不符且各平台不一致；drawIcon 会经 EMOJI_MAP 映射成点阵字形。
//
// 行高与基线是量出来的，不要随手改：pText 给每个字形描 1px 黑边，
// 实际墨迹带比字号高 2px——名称(13号)占基线上方约 14px，描述(11号)占基线
// 上方约 12px。原本行体 40px、基线差 18px，两行墨迹之间只剩 1px，
// 这就是"文字挤在一起"的直接原因。
//
// 现在行体 44px、基线差 23px，行内留出 5~8px（随字形起伏），行间 8px。
// 步距固定 52px：再大就从每列 6 行掉到 5 行（诅咒 36 条要多翻一页），
// 而行内间距靠基线差解决，不必靠加高行体。
const SROW_H = 44;          // 行体高度
const SROW_STEP = 52;       // 行体 + 8px 行间空白
function drawStatusRow(X0, X1, y, icon, name, desc, iconColor, barColor, nameColor = PAL.bone1) {
    if (statusBounds) statusBounds.maxY = Math.max(statusBounds.maxY, y + SROW_H);
    const w = X1 - X0;
    pRect(X0, y, w, SROW_H, PAL.ink1);
    pRect(X0, y, PX, SROW_H, barColor);
    drawIcon(icon, X0 + PX * 7, y + SROW_H / 2, 2.5, iconColor, name);
    pText(name, X0 + PX * 13, y + 16, nameColor, { size: 13, bold: true });
    if (desc) {
        const d = String(desc);
        pTextShadow(d.length > 40 ? d.slice(0, 39) + "…" : d,
            X0 + PX * 13, y + 41, PAL.mist1, { size: 11 });
    }
}

function emptyHint(text, X0, X1, top) {
    pTextShadow(text, (X0 + X1) / 2, top + 40, PAL.mist0, { size: 13, align: "center" });
}

// ── 页3：能力 ──
// 能力型奖励共 24 种，单页放不下，超出部分显示计数提示而不是画到面板外。
function drawStatusPerks(X0, X1, top, bottom) {
    const p = state.player;
    const entries = Object.entries(p.perks || {}).filter(([id]) => {
        const def = REWARD_MAP[id];
        return def && def.type === "ability";
    });
    if (entries.length === 0) {
        emptyHint("尚未获得能力", X0, X1, top);
        return;
    }
    drawStatusList(X0, X1, top, bottom, entries.map(([id, count]) => {
        const def = REWARD_MAP[id];
        const rp = RARITY_PAL[def.rarity] || RARITY_PAL.common;
        return {
            icon: def.icon,
            name: count > 1 ? `${def.name} ×${count}` : def.name,
            desc: def.desc,
            iconColor: rp.light, barColor: rp.base,
        };
    }));
}

// ── 页4：诅咒 ──
function drawStatusCurses(X0, X1, top, bottom) {
    const curses = state.player.curses || [];
    if (curses.length === 0) {
        emptyHint("尚未承受诅咒", X0, X1, top);
        return;
    }
    drawStatusList(X0, X1, top, bottom, curses.map((c) => {
        const def = CURSES_MAP[c.id];
        if (!def) return null;
        const desc = typeof def.desc === "function" ? def.desc(c.count) : def.desc;
        return {
            icon: def.icon,
            name: c.count > 1 ? `${def.name} ×${c.count}` : def.name,
            desc,
            iconColor: PAL.blood3, barColor: PAL.blood1, nameColor: PAL.blood3,
        };
    }).filter(Boolean));
}

// 通用列表：两列排布 + 翻页。
// 一屏放得下 14 条，但能力最多 24 条、诅咒最多 36 条。只显示"还有 N 项"
// 等于让玩家看不到自己一半的构筑——状态页的意义就是看清构筑，所以分页，
// 保证每一条都能翻到。
function drawStatusList(X0, X1, top, bottom, items) {
    const colW = (X1 - X0 - PX * 4) / 2;
    const rowH = SROW_STEP;
    const maxRows = Math.max(1, Math.floor((bottom - top - PX * 4) / rowH));
    const perPage = maxRows * 2;
    const pages = Math.max(1, Math.ceil(items.length / perPage));
    // 页码夹到有效范围：切 tab 后条数变少时，原页码可能已越界
    const page = Math.min(statusPage, pages - 1);
    const shown = items.slice(page * perPage, page * perPage + perPage);

    for (let i = 0; i < shown.length; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const cx = X0 + col * (colW + PX * 4);
        const cy = top + PX + row * rowH;
        const it = shown[i];
        drawStatusRow(cx, cx + colW, cy, it.icon, it.name, it.desc,
            it.iconColor, it.barColor, it.nameColor || PAL.bone1);
    }

    statusPages = pages;
    if (pages > 1) {
        pTextShadow(`${page + 1} / ${pages}　共 ${items.length} 项　← → 翻页`,
            (X0 + X1) / 2, bottom + PX * 2, PAL.mist0, { size: 11, align: "center" });
    }
}


// ═══ 诅咒三选一 ═════════════════════════════════════════
export function drawCurseScreen() {
    const choices = state.curseChoices || [];
    const cw = 184, chh = 210, gap = 22;
    const modalW = Math.min(W - 40, choices.length * cw + (choices.length - 1) * gap + 56);
    const m = pModal(modalW, chh + 158, "承受诅咒", { icon: "curse", accent: PAL.blood2, scrim: 0.86 });

    pTextShadow(`诅咒强度 ×${state.curseStrength} · 永久生效`, W / 2, m.y + PX * 15, PAL.blood3, {
        size: 13, align: "center",
    });

    const rows = cardRow(choices.length, 0, cw, gap);
    const cardY = m.y + PX * 20;
    curseCards = [];

    for (let i = 0; i < choices.length; i++) {
        const c = choices[i];
        const cx = rows[i].x;
        const desc = typeof c.desc === "function" ? c.desc(state.curseStrength) : c.desc;
        const statLine = curseStatLine(c.id);
        drawCard(cx, cardY, cw, chh, {
            icon: c.icon,
            name: c.name,
            desc,
            danger: true,
            footer: `强度 ×${state.curseStrength} · 永久`,
            footerColor: PAL.blood3,
            statLine,
        });
        curseCards.push({ x: cx, y: cardY, w: cw, h: chh });
    }
}

// 诅咒当前数值映射
function curseStatLine(id) {
    const p = state.player;
    if (!p) return null;
    switch (id) {
        case "swift": return `当前速度：${Math.round(p.ballSpeedMul * 100)}%`;
        case "rust": return `当前伤害：${p.ballDamage}`;
        case "barren": return `当前倍率：×${p.scoreMul.toFixed(1)}`;
        case "dim": return `稀有概率：+${p.luckyBonus || 0}%`;
        case "fortify": return `方块血量 +${p.curseBlockHpBonus || 0}`;
        case "arm": return `重甲概率：+${Math.round((p.curseArmoredBonus || 0) * 100)}%`;
        case "bullet": return `敌弹速度：${Math.round((p.curseBulletSpeedMul || 1) * 100)}%`;
        case "cd": return `当前 CD：${Math.round(p.skillCdMul * 100)}%`;
        case "shrink": return `当前挡板：${Math.round((1 + p.paddleBonus) * 100)}%`;
        case "hitbox": return `受击面积：${Math.round((1 + (p.curseHitPenalty || 0)) * 100)}%`;
        case "dense": return `方块密度：+${Math.round((p.curseDensityBonus || 0) * 100)}%`;
        case "launch": return `发射速度：${Math.round((p.curseLaunchSpeedMul || 1) * 100)}%`;
        case "sticky": return `挡板响应：${Math.round((1 - (p.curseMoveResist || 0)) * 100)}%`;
        case "heal": return `治疗效果：${Math.round((p.healMul || 1) * 100)}%`;
        case "misfortune": return `选卡数量：${3 + p.extraChoices}`;
        case "overcrowd": return `多球上限：${10 - (p.curseMaxBallsPenalty || 0)}`;
        case "ethereal": return `当前穿透：${p.maxPiercing}`;
        case "blur": return `当前体积：${Math.round(p.ballRadiusMul * 100)}%`;
        case "accident": return `事件概率：${Math.round((0.3 - (p.curseEventReduce || 0)) * 100)}%`;
        case "slowfall": return `落地扣血：${1 + (p.curseFallDamage || 0)}`;
        case "weakness": return `当前伤害：${p.ballDamage}`;
        case "fog": return `迷雾强度：${Math.round((p.curseFog || 0) * 100)}%`;
        case "decay": return `击碎加速：+${((p.curseDecelPerLevel || 0) * 100).toFixed(1)}%`;
        case "echo": return `诅咒可选项：${3 - (p.curseChoicePenalty || 0)}`;
        case "thorn": return `受击扣血：${1 + (p.curseExtraHitDmg || 0)}`;
        case "void_mark": return `弹幕伤害：${1 + (p.curseBulletExtraDmg || 0)}`;
        case "chaos_grasp": return `当前速度：${Math.round(p.ballSpeedMul * 100)}%`;
        case "time_warp": return `当前 CD：${Math.round(p.skillCdMul * 100)}%`;
        case "shadow_clone": return `受击面积：${Math.round((1 + (p.curseHitPenalty || 0)) * 100)}%`;
        case "void_rift": return `落地扣血：${1 + (p.curseFallDamage || 0)}`;
        case "fate_seal": return `诅咒可选项：${3 - (p.curseChoicePenalty || 0)}`;
        case "blood_oath": return `落地扣血：${1 + (p.curseFallDamage || 0)}`;
        case "seal": return `技能槽：${2 - (p.curseSkillSlotPenalty || 0)}`;
        case "cataclysm": return `方块血量 +${p.curseBlockHpBonus || 0} · 密度 +${Math.round((p.curseDensityBonus || 0) * 100)}%`;
        case "blind": return `选卡：${3 + p.extraChoices} · 稀有：+${p.luckyBonus || 0}%`;
        case "martyr": return `弹幕伤害：${1 + (p.curseBulletExtraDmg || 0)}`;
        default: return null;
    }
}

// ═══ 惩罚选择 ═══════════════════════════════════════════
export function drawPenaltyScreen() {
    const choices = state.penaltyChoices || [];
    const cw = 184, chh = 210, gap = 22;
    const modalW = Math.min(W - 40, choices.length * cw + (choices.length - 1) * gap + 56);
    const m = pModal(modalW, chh + 158, "选择惩罚", { icon: "curse", accent: PAL.blood2, scrim: 0.86 });

    pTextShadow(`强度 ×${state.penaltyStrength} · 永久生效`, W / 2, m.y + PX * 15, PAL.blood3, {
        size: 13, align: "center",
    });

    const rows = cardRow(choices.length, 0, cw, gap);
    const cardY = m.y + PX * 20;
    penaltyCards = [];

    for (let i = 0; i < choices.length; i++) {
        const c = choices[i];
        const cx = rows[i].x;
        drawCard(cx, cardY, cw, chh, {
            icon: c.icon,
            name: c.name,
            desc: c.desc(state.penaltyStrength),
            danger: true,
            footer: `强度 ×${state.penaltyStrength}`,
            footerColor: PAL.blood3,
        });
        penaltyCards.push({ x: cx, y: cardY, w: cw, h: chh });
    }
}

// ═══ 图鉴 ═══════════════════════════════════════════════
export function drawCodex() {
    pScrim(0.94, PAL.ink0);

    // 页头
    pRect(0, 0, W, 56, PAL.ink2);
    pRect(0, 56 - PX, W, PX, PAL.gold1);
    drawIcon("book", 34, 28, 3, PAL.gold3);
    pText("图鉴", 56, 35, PAL.gold2, { size: 22, bold: true });

    // 如果正在查看详情，直接画详情页
    if (state.codexItem) {
        drawCodexItemDetail(state.codexItem);
        return;
    }

    // Tab
    const tabs = ["奖励", "诅咒", "事件", "皮肤", "敌人"];
    const tw = 104, th = 32, tgap = 6;
    const totalW = tabs.length * tw + (tabs.length - 1) * tgap;
    const tsx = (W - totalW) / 2;
    codexTabBtns = [];
    for (let i = 0; i < tabs.length; i++) {
        const tx = snap(tsx + i * (tw + tgap));
        const active = i === codexTab;
        const ty = 66;
        pChamferFill(tx, ty, tw, th, PAL.ink0, 2);
        pChamferFill(tx + PX, ty + PX, tw - PX * 2, th - PX * 2, active ? PAL.gold1 : PAL.stone0, 1);
        if (active) pRect(tx + PX * 2, ty + PX, tw - PX * 4, PX, PAL.gold3);
        pText(tabs[i], tx + tw / 2, ty + 21, active ? PAL.ink0 : PAL.mist1, {
            size: 13, bold: true, align: "center", outline: null,
        });
        codexTabBtns.push({ x: tx, y: ty, w: tw, h: th });
    }

    // 数据集
    const perPage = 7;
    const unlocks = getUnlocks();
    const skinData = [];
    for (let i = -1; i < 3; i++) {
        const sd = skinDef(i);
        if (!sd) continue;
        const unlocked = i < 0 || unlocks.tiers[i];
        skinData.push({
            icon: i < 0 ? "palette" : "shield",
            name: sd.name,
            desc: unlocked
                ? (sd.skill ? `开场技能：${SKIN_START_SKILLS[sd.skill]?.name || sd.skill}` : "无开场技能")
                : `需 ${[30000, 60000, 120000][i] || 0} 分解锁`,
            color: sd.paddle2,
            locked: !unlocked,
        });
    }

    const bossData = getAllBosses().map((b) => ({
        icon: "skull",
        name: b.encountered ? b.name : "???",
        desc: b.encountered ? `第 ${b.level} 层 · ${bossTypeLabel(b.bossType)}` : "未遭遇，无法查看详情",
        color: b.color,
        locked: !b.encountered,
        _boss: b,
    }));

    const datasets = [REWARDS, [...CURSES, ...HEAVY_CURSES], EVENTS, skinData, bossData];
    const data = datasets[codexTab] || [];
    const totalPages = Math.max(1, Math.ceil(data.length / perPage));
    if (codexPage >= totalPages) codexPage = totalPages - 1;
    const pageItems = data.slice(codexPage * perPage, codexPage * perPage + perPage);

    // 列表：每行一个浮雕条目
    codexItemRects = [];
    let ly = 112;
    const lh = 58;
    const rowW = W - 72;
    for (const item of pageItems) {
        const locked = item.locked || (item.tierLock !== undefined && !isRewardUnlocked(item.id));
        const accent = item.color
            || (item.rarity ? RARITY_PAL[item.rarity]?.base : null)
            || (codexTab === 1 ? PAL.blood2 : PAL.vio2);

        // 条目底板
        pRect(36, ly, rowW, lh - 6, PAL.ink0);
        pRect(36 + PX, ly + PX, rowW - PX * 2, lh - 6 - PX * 2, PAL.ink2);
        pRect(36 + PX, ly + PX, PX, lh - 6 - PX * 2, accent);

        // 图标龛
        pSlot(48, ly + 8, 36, 36, PAL.ink1);
        drawIcon(item.icon, 66, ly + 26, 3, locked ? PAL.stone2 : accent, item.name);

        // 名称
        pText(item.name || "", 96, ly + 24, locked ? PAL.mist0 : accent, { size: 14, bold: true });

        // 描述（单行截断）
        const desc = typeof item.desc === "function" ? item.desc(1) : (item.desc || "");
        const flat = desc.replace(/\n/g, " ");
        pTextShadow(flat.length > 46 ? flat.slice(0, 44) + "…" : flat, 96, ly + 42, PAL.mist1, { size: 11 });

        // 右侧标签
        if (locked) {
            drawIcon("lock", W - 52, ly + 26, 2, PAL.blood2);
        } else if (codexTab === 0 && item.type && REWARD_TYPE_NAME[item.type]) {
            pTextShadow(REWARD_TYPE_NAME[item.type], W - 48, ly + 30, PAL.mist0, { size: 10, align: "right" });
        } else if (codexTab === 4 && !locked) {
            pTextShadow("点击查看", W - 48, ly + 30, PAL.mist0, { size: 10, align: "right" });
        }
        codexItemRects.push({ x: 36, y: ly, w: rowW, h: lh - 6, item });
        ly += lh;
    }

    // 翻页
    const pby = H - 62;
    codexPrevBtn = codexPage > 0
        ? pButton(40, pby, 108, 32, "上一页", { kind: "secondary", size: 12 })
        : null;
    codexNextBtn = codexPage < totalPages - 1
        ? pButton(W - 148, pby, 108, 32, "下一页", { kind: "secondary", size: 12 })
        : null;

    pTextShadow(`${codexPage + 1} / ${totalPages} · ESC 返回 · ←→ 翻页`, W / 2, pby + 21, PAL.mist0, {
        size: 12, align: "center",
    });
}

function bossTypeLabel(type) {
    return { executor: "执行者", mother: "腐化体", hive: "机械蜂巢", priest: "司祭" }[type] || type;
}

// 图鉴条目点击命中
let codexItemRects = [];
export function hitCodexItem(x, y) {
    for (const r of codexItemRects) {
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.item;
    }
    return null;
}

// 图鉴详情页：Boss 信息
function drawCodexItemDetail(item) {
    const boss = item._boss;
    if (!boss) { state.codexItem = null; return; }

    const SKILL_DESC = {
        charge: "冲锋：锁定玩家位置直线冲撞，撞墙后进入易伤",
        slam: "跳砸：跃起砸向地面，冲击波覆盖大范围",
        summon: "召唤：召唤各类仆从助战，击杀会反噬 Boss",
        altar: "祭坛：部署诅咒祭坛，需要优先摧毁解除诅咒",
    };

    const PATTERN_DESC = {
        fan: "扇形弹幕：朝玩家方向扇形扩散",
        ring: "环形弹幕：从四周包夹的环形弹幕",
        split: "分裂弹幕：命中前一分为二，封锁走位",
        homing: "追踪弹幕：追踪玩家位置，转弯较慢可闪避",
        wave: "波浪弹幕：沿正弦轨迹飘忽前进",
        spiral: "螺旋弹幕：持续旋转倾泻，压制阵地",
    };

    const lines = [
        `第 ${boss.level} 层 · ${boss.bossType}`,
        "",
        "【技能】",
        ...(boss.skills || []).map((s) => `  ${SKILL_DESC[s] || s}`),
        "",
        "【弹幕】",
        ...(boss.patterns || []).map((p) => `  ${PATTERN_DESC[p] || p}`),
    ];

    const lineH = 22;
    const panelH = Math.min(H - 40, 200 + lines.length * lineH);
    const m = pModal(580, panelH, boss.name, { icon: "skull", accent: boss.color, scrim: 0.88 });

    let ly = m.bodyY + PX;
    for (const line of lines) {
        if (line === "") { ly += PX * 2; continue; }
        const isHeader = line.startsWith("【");
        pTextShadow(line, m.x + PX * 4, ly, isHeader ? PAL.gold3 : PAL.bone0, {
            size: isHeader ? 13 : 12, bold: isHeader, align: "left",
        });
        ly += lineH;
    }

    // 返回按钮
    const by = m.y + panelH - BTN_SM_H - PX * 4;
    pButton(snap((W - BTN_SM_W) / 2), by, BTN_SM_W, BTN_SM_H, "返回", { kind: "secondary", size: 13 });
}

export function hitCodexBackButton(x, y) {
    if (!state.codexItem) return false;
    const m = lastModal;
    if (!m) return false;
    const by = m.y + m.h - BTN_SM_H - PX * 4;
    const bx = snap((W - BTN_SM_W) / 2);
    return x >= bx && x <= bx + BTN_SM_W && y >= by && y <= by + BTN_SM_H;
}

// ═══ 设置 ═══════════════════════════════════════════════
export function drawSettingsScreen() {
    const s = loadSettings();
    const items = [
        { label: "音效", get: () => s.sound.enabled, set: (v) => { s.sound.enabled = v; saveSettings(s); } },
        { label: "音量", type: "slider", get: () => s.sound.volume, set: (v) => { s.sound.volume = v; saveSettings(s); } },
        { label: "震屏", get: () => s.screenShake, set: (v) => { s.screenShake = v; saveSettings(s); } },
        { label: "击中停顿", get: () => s.hitStop, set: (v) => { s.hitStop = v; saveSettings(s); } },
        { label: "事件概率", type: "slider", get: () => s.eventChance, set: (v) => { s.eventChance = v; saveSettings(s); } },
    ];

    const rowH = 40, gap = 8;
    const modalH = 150 + items.length * (rowH + gap);
    const m = pModal(460, modalH, "设置", { icon: "gear", scrim: 0.92 });

    settingsToggleBtns = [];
    const bw = 396;
    const bx = snap((W - bw) / 2);
    let by = m.y + PX * 14;

    for (const item of items) {
        // 行底板
        pRect(bx, by, bw, rowH, PAL.ink0);
        pRect(bx + PX, by + PX, bw - PX * 2, rowH - PX * 2, PAL.ink1);
        pText(item.label, bx + 14, by + 26, PAL.bone0, { size: 14, bold: true });

        if (item.type === "slider") {
            const val = item.get();
            const sw = 132;
            const sx = bx + bw - sw - 12;
            pBar(sx, by + 10, sw, 20, val, PAL.gold2, { bg: PAL.ink0, light: PAL.gold3 });
            pText(`${Math.round(val * 100)}%`, sx + sw / 2, by + 25, PAL.ink0, {
                size: 11, bold: true, align: "center", outline: null,
            });
            settingsToggleBtns.push({ x: sx, y: by, w: sw, h: rowH, type: "slider", item });
        } else {
            const val = item.get();
            const tw = 68;
            const tx = bx + bw - tw - 12;
            const on = !!val;
            pChamferFill(tx, by + 8, tw, 24, PAL.ink0, 1);
            pChamferFill(tx + PX, by + 8 + PX, tw - PX * 2, 24 - PX * 2, on ? PAL.moss1 : PAL.stone0, 1);
            pRect(tx + PX * 2, by + 8 + PX, tw - PX * 4, PX, on ? PAL.moss3 : PAL.stone2);
            // 开关滑块：像素方块贴在对应一侧
            const knobX = on ? tx + tw - PX * 5 : tx + PX * 2;
            pRect(knobX, by + 10, PX * 3, 20 - PX, on ? PAL.moss3 : PAL.mist0);
            pText(on ? "开" : "关", on ? tx + PX * 5 : tx + tw - PX * 5, by + 25, PAL.bone1, {
                size: 12, bold: true, align: "center",
            });
            settingsToggleBtns.push({ x: tx, y: by, w: tw, h: rowH, type: "toggle", item });
        }
        by += rowH + gap;
    }

    settingsBackBtn = pButton((W - BTN_SM_W) / 2, by + 12, BTN_SM_W, BTN_SM_H, "返回", {
        kind: "secondary", size: 13,
    });
}

export function handleSettingsClick(x, y) {
    const s = loadSettings();
    for (const btn of settingsToggleBtns) {
        if (!inRect(x, y, btn)) continue;
        if (btn.type === "toggle") {
            btn.item.set(!btn.item.get());
        } else if (btn.type === "slider") {
            const relX = (x - btn.x) / btn.w;
            btn.item.set(Math.max(0.05, Math.min(1, relX)));
        }
        applySettings(loadSettings(), GAME_CONFIG);
        return;
    }
}

// ═══ 结算 ═══════════════════════════════════════════════
function drawEndScreen(opts) {
    const { icon, title, titleColor, restartLabel, accent } = opts;
    const m = pModal(460, 300, null, { scrim: 0.8 });

    drawIcon(icon, W / 2, m.y + PX * 11, 7, titleColor);
    pText(title, W / 2, m.y + PX * 25, titleColor, { size: 32, bold: true, align: "center", ow: PX });
    pRect(W / 2 - 130, m.y + PX * 27, 260, PX, accent);

    // 成绩：两行数据，标签在上、数值在下
    const score = Math.floor(state.player.score / 10);
    const cols = [
        { label: "最终分数", value: `${score}` },
        { label: "到达层数", value: `B${state.player.level}` },
    ];
    const colW = 150;
    let cx = W / 2 - (cols.length * colW) / 2;
    for (const c of cols) {
        pTextShadow(c.label, cx + colW / 2, m.y + PX * 34, PAL.mist0, { size: 11, align: "center" });
        pText(c.value, cx + colW / 2, m.y + PX * 41, PAL.bone1, { size: 22, bold: true, align: "center" });
        cx += colW;
    }

    // 新纪录标记
    if (score > 0 && state.player.score >= getHighScore()) {
        pText("★ 新纪录 ★", W / 2, m.y + PX * 47, PAL.gold3, { size: 13, bold: true, align: "center" });
    }

    const bx = (W - BTN_W) / 2;
    const by = m.y + 300 - BTN_H * 2 - PX * 7;
    restartBtn = pButton(bx, by, BTN_W, BTN_H, restartLabel, { kind: "primary" });
    gameOverExitBtn = pButton(bx, by + BTN_H + 8, BTN_W, BTN_H - 6, "退出到主菜单", {
        kind: "secondary", size: 13,
    });
}

export function drawGameOver() {
    drawEndScreen({
        icon: "skull",
        title: "游戏结束",
        titleColor: PAL.blood2,
        accent: PAL.blood1,
        restartLabel: "重新开始",
    });
}

export function drawVictory() {
    drawEndScreen({
        icon: "crown",
        title: "通关",
        titleColor: PAL.gold2,
        accent: PAL.gold1,
        restartLabel: "再来一局",
    });
}

// ═══ 开发者模式 ─────────────────────────────────────────────
export function drawDevModeScreen() {
    const modal = pModal(700, 520, "开发者模式", { icon: "tool", scrim: 0.88 });
    const X0 = modal.x + PX * 3;
    let y = modal.bodyY + PX * 2;
    const L = 18;
    pTextShadow("ESC 退出 · 数据文件位于 src/js/data/", X0, y, PAL.mist1, { size: 12, align: "left" });
    y += L + 4;

    const entries = [
        ["Boss HP (15关)", String(BOSS_CANDIDATES[15]?.[0]?.hp), "铁壁执行者"],
        ["Boss弹速 (15关)", String(BOSS_CANDIDATES[15]?.[0]?.bulletSpeed), "铁壁执行者"],
        ["重甲概率上限", String(ARMORED.maxChance), "最大出现概率"],
        ["重甲血量加成", String(ARMORED.hpBonus), "额外血量"],
        ["诅咒强度系数", "lv×0.1", "每层诅咒强度增长"],
        ["事件概率", String(GAME_CONFIG.event.chance), "事件房出现概率"],
        ["音效音量", String(GAME_CONFIG.sound.volume), "主音量0~1"],
    ];

    for (const [label, value, desc] of entries) {
        pTextShadow(label, X0, y, PAL.gold3, { size: 12, bold: true, align: "left" });
        pTextShadow(value, X0 + 200, y, PAL.bone1, { size: 13, bold: true, align: "left" });
        pTextShadow(desc, X0 + 350, y, PAL.mist1, { size: 11, align: "left" });
        y += L + 2;
    }
}
