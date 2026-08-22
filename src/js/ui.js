// ═══ 界面层 ═══
// 全部界面改为像素风：浮雕面板 + 切角边框 + 点阵图标 + 硬描边文字。
// HUD 拆到 ui_hud.js；本文件负责菜单与各类弹窗，以及所有按钮命中检测。

import { W, H, RARITY_META, MAX_SKILLS, TOTAL_LEVELS } from "./constants.js";
import { state } from "./state.js";
import { ctx } from "./canvas.js";
import { PAL, RARITY_PAL, rgba } from "./palette.js";
import {
    PX, snap, pRect, pPanel, pSlot, pText, pTextShadow, pWrap,
    pScrim, pBar, pChamferFill,
} from "./pixel.js";
import {
    panelX, CARD_W, CARD_H, CARD_GAP, cardRow, BTN_W, BTN_H, BTN_SM_W, BTN_SM_H,
} from "./layout.js";
import { drawIcon } from "./icons.js";
import { REWARD_TYPE_NAME, REWARD_MAP, REWARDS } from "./rewards.js";
import { CURSES, HEAVY_CURSES } from "./curses.js";
import { EVENTS } from "./events.js";
import { loadSaveData } from "./game.js";
import { getHighScore, skinDef, getUnlocks, isRewardUnlocked, getSelectedSkin, SKIN_START_SKILLS } from "./unlocks.js";
import { loadSettings, saveSettings, applySettings } from "./settings.js";
import { GAME_CONFIG } from "./config.js";

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
let pauseResumeBtn = null, pauseRestartBtn = null, pauseQuitBtn = null;
let penaltyCards = [], curseCards = [];
let menuCodexBtn = null, pauseCodexBtn = null, menuSkinBtn = null, menuSettingsBtn = null, gameOverExitBtn = null;
let codexTabBtns = [], codexNextBtn = null, codexPrevBtn = null;
let settingsToggleBtns = [], settingsBackBtn = null;

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

// 当前帧记录的所有命中矩形，供视觉审计校验"画在哪里就能点到哪里"。
// 只读快照，不参与游戏逻辑。
export function debugHitRects() {
    return {
        start: startBtn, continue: continueBtn, restart: restartBtn,
        menuCodex: menuCodexBtn, menuSkin: menuSkinBtn, menuSettings: menuSettingsBtn,
        pauseResume: pauseResumeBtn, pauseRestart: pauseRestartBtn, pauseQuit: pauseQuitBtn,
        pauseCodex: pauseCodexBtn, gameOverExit: gameOverExitBtn, bossClear: bossClearBtn,
        skip: state._skipBtn, settingsBack: settingsBackBtn,
        eventContinue: eventContinueBtn, swapCancel: swapCancelBtn,
        codexTabs: codexTabBtns, codexNext: codexNextBtn, codexPrev: codexPrevBtn,
        rewardCards, curseCards, penaltyCards, eventButtons, swapCards,
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
        footer = null, footerColor = null, tag = null, danger = false,
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

        drawCard(cx, cardY, CARD_W, CARD_H, {
            icon: def.icon,
            name: def.name,
            desc: def.desc,
            rarity: def.rarity,
            typeLabel: REWARD_TYPE_NAME[def.type],
            tag: def.bossOnly ? "★ BOSS 专属" : null,
            footer,
            footerColor,
        });
        rewardCards.push({ x: cx, y: cardY, w: CARD_W, h: CARD_H, def });
    }

    // 跳过按钮
    const sy = cardY + CARD_H + 14;
    state._skipBtn = pButton((W - BTN_SM_W) / 2, sy, BTN_SM_W, BTN_SM_H, "跳过", { kind: "secondary", size: 13 });
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
    pauseRestartBtn = pButton(bx, y, bw, BTN_H, "重新开始", { kind: "secondary" });
    y += BTN_H + 10;
    pauseQuitBtn = pButton(bx, y, bw, BTN_H, "保存并返回主菜单", { kind: "secondary", size: 14 });

    pTextShadow("ESC 继续", W / 2, m.y + 344 - PX * 3, PAL.mist0, { size: 11, align: "center" });
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
        drawCard(cx, cardY, cw, chh, {
            icon: c.icon,
            name: c.name,
            desc,
            danger: true,
            footer: `强度 ×${state.curseStrength} · 永久`,
            footerColor: PAL.blood3,
        });
        curseCards.push({ x: cx, y: cardY, w: cw, h: chh });
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

    // Tab
    const tabs = ["奖励", "诅咒", "事件", "皮肤"];
    const tw = 104, th = 32;
    const tsx = (W - (tabs.length * (tw + 6) - 6)) / 2;
    codexTabBtns = [];
    for (let i = 0; i < tabs.length; i++) {
        const tx = snap(tsx + i * (tw + 6));
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

    const datasets = [REWARDS, [...CURSES, ...HEAVY_CURSES], EVENTS, skinData];
    const data = datasets[codexTab] || [];
    const totalPages = Math.max(1, Math.ceil(data.length / perPage));
    if (codexPage >= totalPages) codexPage = totalPages - 1;
    const pageItems = data.slice(codexPage * perPage, codexPage * perPage + perPage);

    // 列表：每行一个浮雕条目
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
        }
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
