// 视觉审计：把游戏驱动到各个界面，读取画布像素，验证三件事
//  1. HUD 不遮挡游戏区（方块顶部必须在顶栏之下）
//  2. 画面主色都落在受限调色板内（像素风一致性）
//  3. 每个界面都真的画出了内容（非空白）
//
// 运行：npm run audit

import { state } from "../src/js/state.js";
import { STATE, W, H } from "../src/js/constants.js";
import { PAL } from "../src/js/palette.js";
import { HUD_TOP_H, SKILL_Y, SKILL_X, SKILL_SLOT, SKILL_GAP, STATUS_Y } from "../src/js/layout.js";
import { ctx } from "../src/js/canvas.js";
import { render } from "../src/js/render.js";
import { initStars } from "../src/js/stars.js";
import { initPixelMode } from "../src/js/pixel.js";
import { resetPlayer, resetPaddle, resetBall, startGameRun, loadLevel } from "../src/js/game.js";
import { REWARDS } from "../src/js/rewards.js";
import { CURSES } from "../src/js/curses.js";
import { EVENTS } from "../src/js/events.js";
import { createBoss } from "../src/js/boss.js";
import {
    drawMenu, drawRewardScreen, drawPauseScreen, drawSettingsScreen, drawCodex,
    drawCurseScreen, drawEventScreen, drawGameOver,
    drawSkillSwap, drawPenaltyScreen, drawBossClear,
    hitSwapCardIndex, hitSwapCancel, hitPenaltyCard, hitBossClearButton,
    hitStartButton, hitMenuCodexButton, hitMenuSettingsButton,
    hitRewardCard, hitSkipButton, hitPauseResume, hitPauseQuit, hitPauseCodexButton,
    hitCodexTab, hitSettingsBackButton, hitCurseCard, hitEventChoiceIndex,
    hitRestartButton, hitGameOverExitButton, debugHitRects, debugLastModal,
} from "../src/js/ui.js";

const lines = [];
let failures = 0;
const log = (s) => lines.push(s);
const check = (name, ok) => {
    if (!ok) failures++;
    lines.push(`${ok ? "PASS" : "FAIL"}  ${name}`);
};

// 调色板允许集
const allowed = new Set();
for (const hex of Object.values(PAL)) {
    const n = parseInt(hex.slice(1), 16);
    allowed.add(`${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`);
}

const snapshot = () => ctx.getImageData(0, 0, W, H).data;

// "有内容"= 区域内颜色的多样性，而不是亮度。
// 面板本身是暗色（ink1/ink2），用亮度阈值会误判为空白。
function fillRatio(data, x0, y0, x1, y1) {
    const seen = new Set();
    let total = 0;
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y += 2) {
        for (let x = Math.max(0, x0); x < Math.min(W, x1); x += 2) {
            const o = (y * W + x) * 4;
            seen.add(`${data[o]},${data[o + 1]},${data[o + 2]}`);
            total++;
        }
    }
    // 归一化：颜色种类数 / 8，8 种以上视为内容充足
    return total ? Math.min(1, seen.size / 8) : 0;
}

// 区域内是否出现了指定颜色（用于验证强调色真的画出来了）
function hasColor(data, hex, x0, y0, x1, y1) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
        for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
            const o = (y * W + x) * 4;
            if (data[o] === r && data[o + 1] === g && data[o + 2] === b) return true;
        }
    }
    return false;
}

// 主色漂移检测：占比 >0.4% 的颜色必须在调色板内
function paletteDrift(data) {
    const seen = new Map();
    for (let y = 0; y < H; y += 3) {
        for (let x = 0; x < W; x += 3) {
            const o = (y * W + x) * 4;
            const k = `${data[o]},${data[o + 1]},${data[o + 2]}`;
            seen.set(k, (seen.get(k) || 0) + 1);
        }
    }
    const total = [...seen.values()].reduce((a, b) => a + b, 0);
    const off = [...seen.entries()]
        .filter(([, v]) => v / total > 0.004)
        .filter(([k]) => !allowed.has(k))
        .map(([k, v]) => `${k}=${(v / total * 100).toFixed(1)}%`);
    return off;
}

function setup() {
    initPixelMode();
    initStars();
    resetPlayer();
    resetPaddle();
    resetBall();
    Object.assign(state, {
        blocks: [], particles: [], rings: [], floatingTexts: [],
        bossBullets: [], enemyBullets: [], bossDangerZones: [],
        boss: null, mouseX: W / 2, challenge: null,
    });
}

function run() {
    setup();

    // 1. 菜单：标题金色 + 按钮必须出现
    state.gameState = STATE.MENU;
    render();
    let d0 = snapshot();
    check("菜单已绘制", fillRatio(d0, 0, 100, W, H - 60) > 0.5);
    check("菜单标题金色可见", hasColor(d0, PAL.gold2, 0, 100, W, 160));
    check("菜单按钮可见", hasColor(d0, PAL.gold1, 0, 260, W, 340));

    // 2. 游戏内 HUD + 布局
    startGameRun();
    state.player.level = 7;
    state.player.lives = 3;
    state.player.score = 12340;
    loadLevel(7, true);
    state.gameState = STATE.PLAYING;
    render();
    let d = snapshot();

    check("顶栏已绘制", fillRatio(d, 0, 0, W, HUD_TOP_H) > 0.5);
    check("顶栏金色分隔线", hasColor(d, PAL.gold1, 0, HUD_TOP_H - 4, W, HUD_TOP_H));
    check("生命心形可见", hasColor(d, PAL.blood2, W - 260, 8, W, 44));

    const minBlockY = Math.min(...state.blocks.map((b) => b.y));
    check(`方块顶部 y=${minBlockY} 不侵入顶栏 (>=${HUD_TOP_H})`, minBlockY >= HUD_TOP_H);

    const maxBlockY = Math.max(...state.blocks.map((b) => b.y + b.h));
    check(`方块底部 y=${maxBlockY} 不侵入技能槽区 (<=${SKILL_Y})`, maxBlockY <= SKILL_Y);

    check(`挡板 y=${state.paddle.y} 位于底栏`, state.paddle.y > H - 60);

    // 技能槽不与挡板通道重叠
    const slotRight = SKILL_X + 2 * (SKILL_SLOT + 6);
    check(`技能槽右缘 ${slotRight} 不进入挡板通道 (<150)`, slotRight < 150);

    const off = paletteDrift(d);
    check(`调色板一致${off.length ? " → 越界色: " + off.join(" ") : ""}`, off.length === 0);

    // ── HUD 可读性：这些区域不能被压暗遮罩盖住 ──
    // 判据：区域内"接近纯黑"(亮度<12)的像素占比。HUD 自身底色是 ink2(亮度23)，
    // 所以大面积近黑只可能来自叠加的暗角/边框。
    const nearBlackRatio = (data, x0, y0, x1, y1) => {
        let dark = 0, tot = 0;
        for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
            for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
                const o = (y * W + x) * 4;
                const L = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
                tot++;
                if (L < 12) dark++;
            }
        }
        return tot ? dark / tot : 0;
    };
    const hudZones = {
        "技能槽": [SKILL_X, SKILL_Y, SKILL_X + 2 * (SKILL_SLOT + SKILL_GAP), SKILL_Y + SKILL_SLOT],
        "生命值": [W - 150, 6, W - 40, 42],
        "层数": [10, 8, 110, 42],
        "分数": [W / 2 - 60, 8, W / 2 + 60, 42],
    };
    for (const [name, z] of Object.entries(hudZones)) {
        const r2 = nearBlackRatio(d, z[0], z[1], z[2], z[3]);
        check(`HUD 可读性-${name}：近黑占比 ${(r2 * 100).toFixed(0)}% < 35%`, r2 < 0.35);
    }

    // ── 挡板不能从 HUD 元素下方穿过 ──
    // 挡板可左移到 x=0，若与技能槽/状态徽章矩形相交就会互相遮挡。
    const padY0 = state.paddle.y, padY1 = state.paddle.y + state.paddle.height;
    const rectsVsPaddle = {
        "技能槽": [SKILL_X, SKILL_Y, SKILL_X + 2 * (SKILL_SLOT + SKILL_GAP), SKILL_Y + SKILL_SLOT],
        "状态徽章": [W - 200, STATUS_Y, W, STATUS_Y + SKILL_SLOT],
    };
    for (const [name, z] of Object.entries(rectsVsPaddle)) {
        const overlap = z[1] < padY1 && padY0 < z[3];
        check(`${name}不与挡板行相交 (挡板 ${padY0}-${padY1}, 区域 ${z[1]}-${z[3]})`, !overlap);
    }

    bulletChecks(nearBlackRatio);
    blockContrastChecks();

    // 3. 各弹窗
    state.levelChoices = REWARDS.slice(0, 3);
    state.rewardTitle = "获得奖励";
    state.gameState = STATE.LEVEL_REWARD;
    render();
    d = snapshot();
    check("奖励卡已绘制", fillRatio(d, 120, 160, W - 120, 440) > 0.6);
    check("奖励卡稀有度边框可见", hasColor(d, PAL.gold2, 100, 150, W - 100, 460) || hasColor(d, PAL.arc2, 100, 150, W - 100, 460) || hasColor(d, PAL.mist0, 100, 150, W - 100, 460));

    state.curseChoices = CURSES.slice(0, 3);
    state.curseStrength = 2;
    state.gameState = STATE.CURSE_SELECT;
    render();
    d = snapshot();
    check("诅咒卡已绘制", fillRatio(d, 120, 160, W - 120, 440) > 0.6);
    check("诅咒卡血红强调可见", hasColor(d, PAL.blood2, 100, 150, W - 100, 460));

    state.currentEvent = EVENTS[0];
    state.eventResult = null;
    state.gameState = STATE.EVENT;
    render();
    check("事件界面已绘制", fillRatio(snapshot(), 140, 120, W - 140, 500) > 0.5);

    for (const [name, st] of [["暂停", STATE.PAUSED], ["图鉴", STATE.CODEX], ["设置", STATE.SETTINGS]]) {
        state.gameState = st;
        render();
        check(`${name}界面已绘制`, fillRatio(snapshot(), 60, 60, W - 60, H - 60) > 0.5);
    }

    // 4. Boss 四种造型
    for (const lv of [15, 30, 45, 50]) {
        state.player.level = lv;
        createBoss(lv);
        state.boss.t = 40;
        state.gameState = STATE.PLAYING;
        render();
        d = snapshot();
        const b = state.boss;
        const f = fillRatio(d, b.x - b.r, b.y - b.r, b.x + b.r, b.y + b.r);
        check(`Boss B${lv} [${b.bossType}] 造型 fill=${f.toFixed(2)}`, f > 0.4);
        const bossOff = paletteDrift(d);
        check(`Boss B${lv} 配色一致${bossOff.length ? " → " + bossOff.join(" ") : ""}`, bossOff.length <= 1);
    }

    // 5. 结算
    state.boss = null;
    for (const [name, st] of [["失败", STATE.GAME_OVER], ["通关", STATE.VICTORY]]) {
        state.gameState = st;
        render();
        check(`${name}界面已绘制`, fillRatio(snapshot(), 180, 170, W - 180, H - 170) > 0.5);
    }

    // 6. 交互命中检测：按钮画在哪里，点击就必须在那里生效
    interactionChecks();

    log("");
    log(failures === 0 ? `ALL PASS (${lines.filter((l) => l.startsWith("PASS")).length})` : `${failures} FAILURES`);
}

// 用界面自己记录的命中矩形中心点做回归测试，确保绘制与命中一致
// ── 弹幕可读性 ──────────────────────────────────────────
// 三项判据，对应三个已修复的缺陷：
//  1. 亮部足够大：子弹太小看不清
//  2. 不以白色为主色：白弹在骨白文字/金球/亮地板前分辨不出
//  3. 有暗轮廓：任何背景上都能压出边界
function bulletChecks(nearBlackRatio) {
    // 统计一小块区域内某组颜色的像素数
    const countColors = (data, hexes, x0, y0, x1, y1) => {
        const want = new Set(hexes.map((h) => {
            const n = parseInt(h.slice(1), 16);
            return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
        }));
        let hit = 0;
        for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
            for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
                const o = (y * W + x) * 4;
                if (want.has(`${data[o]},${data[o + 1]},${data[o + 2]}`)) hit++;
            }
        }
        return hit;
    };

    const CX = 400, CY = 300, BOX = 60;
    const box = [CX - BOX, CY - BOX, CX + BOX, CY + BOX];

    // ① 方块子弹
    state.blocks = [];
    state.bossBullets = [];
    state.enemyBullets = [{ x: CX, y: CY, vx: 0, vy: 2.2, r: 5 }];
    render();
    let d = snapshot();
    let bright = countColors(d, [PAL.ember1, PAL.ember2, PAL.ember3], ...box);
    check(`方块子弹亮部 ${bright}px >= 150（修复前约 36px）`, bright >= 150);
    check("方块子弹有暗轮廓", countColors(d, [PAL.ink0], ...box) >= 40);

    // ② Boss 弹幕：四个弹种都要够大、够暗轮廓，且不以白色为主
    const kinds = [
        ["普通弹", { homing: false, splitAt: 0, wave: null }, [PAL.ember1, PAL.ember2, PAL.ember3]],
        ["追踪弹", { homing: true, splitAt: 0, wave: null }, [PAL.vio1, PAL.vio2, PAL.vio3]],
        ["分裂弹", { homing: false, splitAt: 46, wave: null }, [PAL.blood1, PAL.blood2, PAL.blood3]],
        ["波动弹", { homing: false, splitAt: 0, wave: { phase: 0, amp: 26, freq: 0.06, bx: CX, by: CY, dirX: 0, dirY: 1 } }, [PAL.arc1, PAL.arc2, PAL.arc3]],
    ];
    state.enemyBullets = [];
    for (const [name, props, colors] of kinds) {
        state.bossBullets = [{ x: CX, y: CY, vx: 0, vy: 2, r: 6, age: 12, ...props }];
        render();
        d = snapshot();
        const lit = countColors(d, colors, ...box);
        const white = countColors(d, [PAL.bone1, PAL.white], ...box);
        check(`${name}亮部 ${lit}px >= 200（修复前约 60px）`, lit >= 200);
        check(`${name}非白色主导 (白 ${white}px < 亮 ${lit}px 的 25%)`, white < lit * 0.25);
        check(`${name}有暗轮廓`, countColors(d, [PAL.ink0], ...box) >= 40);
    }

    // ③ 弹种可区分：任意两弹种的主色集合不得相同
    const sig = kinds.map(([, , c]) => c.join("|"));
    check("四个弹种配色互不相同", new Set(sig).size === 4);

    state.bossBullets = [];
    state.enemyBullets = [];
}

// ── 障碍物与背景的区分度 ────────────────────────────────
// 缺陷根因：不可击碎方块原本用 stone1 主体 + stone0 暗面，而 11~40 层的地板
// 主题正好用这两色当砖面/砖缘（stars.js），于是方块与背景同色。
// 判据：逐主题渲染，方块内部与紧邻地板的平均亮度差必须够大。
function blockContrastChecks() {
    const meanL = (data, x0, y0, x1, y1) => {
        let sum = 0, n = 0;
        for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
            for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
                const o = (y * W + x) * 4;
                sum += 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
                n++;
            }
        }
        return n ? sum / n : 0;
    };

    const BX = 300, BY = 260, BW = 64, BH = 22;
    // 每 10 层换一次地板主题，逐主题验证
    for (const lv of [1, 11, 21, 31, 41]) {
        state.player.level = lv;
        state.bossBullets = [];
        state.enemyBullets = [];

        // 先只画地板，量出该主题下方块位置的地板亮度
        state.blocks = [];
        render();
        const floorL = meanL(snapshot(), BX, BY, BX + BW, BY + BH);

        // 再放一个不可击碎方块，量它的内部亮度
        state.blocks = [{ x: BX, y: BY, w: BW, h: BH, hp: 1, maxHp: 1, indestructible: true }];
        render();
        const d = snapshot();
        const innerL = meanL(d, BX + 4, BY + 4, BX + BW - 4, BY + BH - 4);
        let max = 0;
        for (let y = BY + 4; y < BY + BH - 4; y++) {
            for (let x = BX + 4; x < BX + BW - 4; x++) {
                const o = (y * W + x) * 4;
                const L = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
                if (L > max) max = L;
            }
        }
        // 判据是"能不能分辨"，不预设方块比地板更暗还是更亮：
        //  ① 内部平均亮度与地板拉开 >20（整体色块可区分）
        //  ② 内部存在明显亮于地板的高光（铆钉/亮边，提供形状线索）
        check(`B${lv} 障碍物内部 ${innerL.toFixed(0)} 与地板 ${floorL.toFixed(0)} 亮度差 ${Math.abs(innerL - floorL).toFixed(0)} > 20`,
            Math.abs(innerL - floorL) > 20);
        check(`B${lv} 障碍物高光 ${max.toFixed(0)} > 地板 ${floorL.toFixed(0)} + 25`, max > floorL + 25);
    }

    // 可击碎方块：四个血量档都要与地板拉开亮度
    state.player.level = 21;   // 最亮的地板主题（floor: stone0）
    for (let hp = 1; hp <= 4; hp++) {
        state.blocks = [];
        render();
        const floorL = meanL(snapshot(), BX, BY, BX + BW, BY + BH);
        state.blocks = [{ x: BX, y: BY, w: BW, h: BH, hp, maxHp: hp, indestructible: false }];
        render();
        const blockL = meanL(snapshot(), BX + 6, BY + 6, BX + BW - 6, BY + BH - 6);
        check(`${hp}HP 方块与地板亮度差 ${Math.abs(blockL - floorL).toFixed(0)} > 20`,
            Math.abs(blockL - floorL) > 20);
    }

    state.player.level = 1;
    state.blocks = [];
}

function centerHit(name, drawFn, hitFn, pick) {
    drawFn();
    const r = pick();
    if (!r) { check(`${name}：未记录命中区域`, false); return; }
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    check(`${name}：中心点可命中 (${Math.round(cx)},${Math.round(cy)})`, !!hitFn(cx, cy));
    // 区域外一点必须不命中，防止命中框过大
    check(`${name}：区域外不误触`, !hitFn(r.x - 20, r.y - 20));
}

function interactionChecks() {
    // 通用校验：取界面自己记录的矩形，验证中心点命中、外部不误触
    const probe = (label, rect, hitFn, expect = true) => {
        if (!rect) { check(`${label}：未记录命中矩形`, false); return; }
        const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
        const got = hitFn(cx, cy);
        check(`${label}：中心可命中`, expect ? !!got || got === 0 : !got);
        const out = hitFn(rect.x - 30, rect.y - 30);
        check(`${label}：外部不误触`, !out || out === -1);
    };

    // ── 菜单 ──
    state.gameState = STATE.MENU;
    drawMenu();
    let r = debugHitRects();
    probe("菜单-开始", r.start, hitStartButton);
    probe("菜单-图鉴", r.menuCodex, hitMenuCodexButton);
    probe("菜单-设置", r.menuSettings, hitMenuSettingsButton);
    // 三个次级按钮不能互相重叠
    const row = [r.menuCodex, r.menuSkin, r.menuSettings].filter(Boolean);
    let overlap = false;
    for (let i = 0; i < row.length; i++) {
        for (let j = i + 1; j < row.length; j++) {
            const a = row[i], b = row[j];
            if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlap = true;
        }
    }
    check("菜单-次级按钮无重叠", !overlap);

    // ── 奖励卡：每张卡命中的必须是对应的那一项 ──
    state.levelChoices = REWARDS.slice(0, 3);
    state.rewardTitle = "T";
    state.gameState = STATE.LEVEL_REWARD;
    drawRewardScreen();
    r = debugHitRects();
    let cardsOk = r.rewardCards.length === 3;
    for (let i = 0; i < r.rewardCards.length; i++) {
        const c = r.rewardCards[i];
        const got = hitRewardCard(c.x + c.w / 2, c.y + c.h / 2);
        if (!got || got.id !== state.levelChoices[i].id) cardsOk = false;
    }
    check("奖励卡：三张各自命中正确项", cardsOk);
    probe("奖励-跳过", r.skip, hitSkipButton);
    // 卡片之间必须有间隙（不粘连）
    if (r.rewardCards.length === 3) {
        const gap = r.rewardCards[1].x - (r.rewardCards[0].x + r.rewardCards[0].w);
        check(`奖励卡间距 ${gap}px > 0`, gap > 0);
    }

    // ── 暂停 ──
    state.gameState = STATE.PAUSED;
    drawPauseScreen();
    r = debugHitRects();
    probe("暂停-继续", r.pauseResume, hitPauseResume);
    probe("暂停-图鉴", r.pauseCodex, hitPauseCodexButton);
    probe("暂停-退出", r.pauseQuit, hitPauseQuit);
    // 暂停四个按钮纵向不重叠
    const pbs = [r.pauseResume, r.pauseCodex, r.pauseRestart, r.pauseQuit].filter(Boolean);
    let pOverlap = false;
    for (let i = 1; i < pbs.length; i++) {
        if (pbs[i].y < pbs[i - 1].y + pbs[i - 1].h) pOverlap = true;
    }
    check("暂停-按钮纵向不重叠", !pOverlap);

    // ── 图鉴 ──
    state.gameState = STATE.CODEX;
    drawCodex();
    r = debugHitRects();
    check(`图鉴-tab 数量 ${r.codexTabs.length}`, r.codexTabs.length === 4);
    let tabsOk = true;
    for (let i = 0; i < r.codexTabs.length; i++) {
        const tb = r.codexTabs[i];
        if (hitCodexTab(tb.x + tb.w / 2, tb.y + tb.h / 2) !== i) tabsOk = false;
    }
    check("图鉴-每个 tab 命中自身索引", tabsOk);

    // ── 设置 ──
    state.gameState = STATE.SETTINGS;
    drawSettingsScreen();
    r = debugHitRects();
    probe("设置-返回", r.settingsBack, hitSettingsBackButton);

    // ── 诅咒 ──
    state.curseChoices = CURSES.slice(0, 3);
    state.curseStrength = 1;
    state.gameState = STATE.CURSE_SELECT;
    drawCurseScreen();
    r = debugHitRects();
    let curseOk = r.curseCards.length === 3;
    for (let i = 0; i < r.curseCards.length; i++) {
        const c = r.curseCards[i];
        if (hitCurseCard(c.x + c.w / 2, c.y + c.h / 2) !== i) curseOk = false;
    }
    check("诅咒卡：三张各自命中正确索引", curseOk);

    // ── 事件 ──
    state.currentEvent = EVENTS[0];
    state.eventResult = null;
    state.gameState = STATE.EVENT;
    drawEventScreen();
    r = debugHitRects();
    let evOk = r.eventButtons.length === EVENTS[0].choices.length;
    for (let i = 0; i < r.eventButtons.length; i++) {
        const b = r.eventButtons[i];
        if (hitEventChoiceIndex(b.x + b.w / 2, b.y + b.h / 2) !== i) evOk = false;
    }
    check(`事件-${r.eventButtons.length} 个选项各自命中正确索引`, evOk);
    // 选项按钮不能超出画面
    const evInBounds = r.eventButtons.every((b) => b.y >= 0 && b.y + b.h <= H);
    check("事件-选项按钮都在画面内", evInBounds);

    // ── 弹窗必须完整落在画面内（含最长文案的极端情况）──
    const boundsCheck = (label, rects) => {
        const flat = rects.filter(Boolean).flat().filter(Boolean);
        const bad = flat.filter((b) => b.x < 0 || b.y < 0 || b.x + b.w > W || b.y + b.h > H);
        check(`${label}：所有控件在画面内${bad.length ? ` (越界 ${bad.length})` : ""}`, bad.length === 0);
    };

    // 用描述最长的事件与诅咒做压力测试
    const longestEvent = EVENTS.slice().sort((a, b) =>
        (b.desc.length + b.choices.length * 40) - (a.desc.length + a.choices.length * 40))[0];
    state.currentEvent = longestEvent;
    state.eventResult = null;
    state.gameState = STATE.EVENT;
    drawEventScreen();
    r = debugHitRects();
    boundsCheck(`事件[${longestEvent.name}] ${longestEvent.choices.length}选项`, [r.eventButtons]);

    // 选项最多的事件
    const mostChoices = EVENTS.slice().sort((a, b) => b.choices.length - a.choices.length)[0];
    state.currentEvent = mostChoices;
    drawEventScreen();
    r = debugHitRects();
    boundsCheck(`事件[${mostChoices.name}] ${mostChoices.choices.length}选项`, [r.eventButtons]);

    // 诅咒描述最长的三张
    const longCurses = CURSES.slice().sort((a, b) => {
        const dl = (c) => String(typeof c.desc === "function" ? c.desc(3) : c.desc).length;
        return dl(b) - dl(a);
    }).slice(0, 3);
    state.curseChoices = longCurses;
    state.curseStrength = 3;
    state.gameState = STATE.CURSE_SELECT;
    drawCurseScreen();
    r = debugHitRects();
    boundsCheck("诅咒(最长描述)", [r.curseCards]);

    // 奖励描述最长的三张
    const longRewards = REWARDS.slice().sort((a, b) =>
        String(b.desc).length - String(a.desc).length).slice(0, 3);
    state.levelChoices = longRewards;
    state.gameState = STATE.LEVEL_REWARD;
    drawRewardScreen();
    r = debugHitRects();
    boundsCheck("奖励(最长描述)", [r.rewardCards, [r.skip]]);

    // 面板本身不能超出画面（用合成的极端数据压测）
    const modalFits = (label) => {
        const mm = debugLastModal();
        if (!mm) { check(`${label}：无面板记录`, false); return; }
        const ok = mm.x >= 0 && mm.y >= 0 && mm.x + mm.w <= W && mm.y + mm.h <= H;
        check(`${label}：面板 ${mm.w}x${mm.h} @${mm.x},${mm.y} 在画面内`, ok);
    };

    // 合成一个 6 选项 + 5 行描述的极端事件，验证自适应压缩生效
    state.currentEvent = {
        icon: "scroll", name: "压力测试",
        desc: "第一行描述\n第二行描述\n第三行描述\n第四行描述\n第五行描述",
        choices: Array.from({ length: 6 }, (_, i) => ({ label: `选项 ${i + 1}`, need: null })),
    };
    state.eventResult = null;
    state.gameState = STATE.EVENT;
    drawEventScreen();
    modalFits("事件(6选项5行)");
    r = debugHitRects();
    boundsCheck("事件(6选项5行)", [r.eventButtons]);
    check("事件(6选项)：全部 6 个按钮都记录了",
        r.eventButtons.length === 6);

    // ── 生命值显示：数字+心，覆盖极端值 ──
    // 秘籍能给到 30 条命，半血用 .5 表示，都必须留在顶栏内且不压到分数
    const scoreRight = W / 2 + 60;
    for (const lv of [0.5, 1, 3.5, 12, 30]) {
        state.player.lives = lv;
        state.gameState = STATE.PLAYING;
        render();
        const dd = snapshot();
        // 找出顶栏右半区里血色与骨白像素的横向范围
        let hMin = 1e9, hMax = -1, tMin = 1e9;
        for (let y = 6; y < 44; y++) {
            for (let x = 480; x < W; x++) {
                const o = (y * W + x) * 4;
                const r0 = dd[o], g0 = dd[o + 1], b0 = dd[o + 2];
                const isBlood = (r0 === 140 && g0 === 46) || (r0 === 207 && g0 === 68) || (r0 === 240 && g0 === 125);
                const isBone = (r0 === 244 && g0 === 238) || (r0 === 222 && g0 === 211);
                if (isBlood) { hMin = Math.min(hMin, x); hMax = Math.max(hMax, x); }
                if (isBone) tMin = Math.min(tMin, x);
            }
        }
        const drawn = hMax > 0;
        check(`生命值 ${lv}：心形已绘制`, drawn);
        if (drawn) {
            check(`生命值 ${lv}：不越过分数区 (心左缘 ${hMin} > ${scoreRight})`, hMin > scoreRight);
            check(`生命值 ${lv}：整体在顶栏内 (右缘 ${Math.max(hMax, tMin)} < ${W})`, Math.max(hMax, tMin) < W);
        }
    }
    state.player.lives = 3;

    // ── 技能替换（技能槽满时）──
    const skillDefs = REWARDS.filter((x) => x.type === "skill").slice(0, 2);
    state.player.skills = skillDefs.map((s) => ({ id: s.id, cd: 0 }));
    state.player.curseSkillSlotPenalty = 0;
    state.gameState = STATE.SKILL_SWAP;
    drawSkillSwap();
    modalFits("技能替换");
    r = debugHitRects();
    check(`技能替换：${r.swapCards.length} 张卡已记录`, r.swapCards.length === skillDefs.length);
    let swapOk = r.swapCards.length > 0;
    for (let i = 0; i < r.swapCards.length; i++) {
        const c = r.swapCards[i];
        if (hitSwapCardIndex(c.x + c.w / 2, c.y + c.h / 2) !== i) swapOk = false;
    }
    check("技能替换：每张卡命中正确索引", swapOk);
    probe("技能替换-取消", r.swapCancel, hitSwapCancel);
    boundsCheck("技能替换", [r.swapCards, [r.swapCancel]]);

    // ── 惩罚选择（Boss 奖励后）──
    state.penaltyChoices = CURSES.slice(0, 3);
    state.penaltyStrength = 3;
    state.gameState = STATE.PENALTY;
    drawPenaltyScreen();
    modalFits("惩罚选择");
    r = debugHitRects();
    let penOk = r.penaltyCards.length === 3;
    for (let i = 0; i < r.penaltyCards.length; i++) {
        const c = r.penaltyCards[i];
        if (hitPenaltyCard(c.x + c.w / 2, c.y + c.h / 2) !== i) penOk = false;
    }
    check("惩罚卡：三张各自命中正确索引", penOk);
    boundsCheck("惩罚选择", [r.penaltyCards]);

    // ── Boss 击破结算 ──
    state.gameState = STATE.BOSS_CLEAR;
    drawBossClear();
    modalFits("Boss击破");
    r = debugHitRects();
    probe("Boss击破-领取", r.bossClear, hitBossClearButton);

    // ── 结算 ──
    state.gameState = STATE.GAME_OVER;
    drawGameOver();
    r = debugHitRects();
    probe("结算-重开", r.restart, hitRestartButton);
    probe("结算-退出", r.gameOverExit, hitGameOverExitButton);
    check("结算-两按钮不重叠",
        !!r.restart && !!r.gameOverExit && r.gameOverExit.y >= r.restart.y + r.restart.h);
}

// 事件选项的 y 由描述行数决定，这里扫描出第一个能命中的 y
function findFirstEventBtnY() {
    for (let y = 300; y < H - 20; y += 2) {
        if (hitEventChoiceIndex(W / 2, y) === 0) return y;
    }
    return -1;
}

try {
    run();
} catch (err) {
    lines.push("AUDIT EXCEPTION: " + (err && err.stack ? err.stack : String(err)));
    failures = -1;
}
document.getElementById("out").textContent = lines.join("\n");
window.__AUDIT__ = { failures, lines };

// ── 导出各界面截图，便于人工目视检查 ──
// 每个界面渲染后把画布转成 dataURL，挂在页面上供抓取。
const SHOTS = [];
function shoot(name, setupFn) {
    try {
        setupFn();
        render();
        SHOTS.push({ name, url: document.getElementById("game").toDataURL("image/png") });
    } catch (e) {
        SHOTS.push({ name, error: String(e) });
    }
}

setup();
shoot("01-menu", () => { state.gameState = STATE.MENU; });
shoot("02-playing", () => {
    startGameRun();
    state.player.level = 7; state.player.lives = 3; state.player.score = 12340;
    loadLevel(7, true);
    state.player.skills = [{ id: REWARDS.find((r) => r.type === "skill").id, cd: 0 }];
    state.player.ballDamage = 3; state.player.maxPiercing = 2; state.player.shieldTimer = 120;
    state.gameState = STATE.PLAYING;
});
shoot("03-playing-late", () => {
    state.player.level = 34; state.player.lives = 5; state.player.score = 98765;
    loadLevel(34, true);
    state.gameState = STATE.PLAYING;
});
shoot("04-reward", () => {
    state.levelChoices = REWARDS.slice(0, 3); state.rewardTitle = "获得奖励";
    state.gameState = STATE.LEVEL_REWARD;
});
shoot("05-curse", () => {
    state.curseChoices = CURSES.slice(0, 3); state.curseStrength = 2;
    state.gameState = STATE.CURSE_SELECT;
});
shoot("06-event", () => {
    state.currentEvent = EVENTS[0]; state.eventResult = null; state.gameState = STATE.EVENT;
});
shoot("07-pause", () => { state.gameState = STATE.PAUSED; });
shoot("08-codex", () => { state.gameState = STATE.CODEX; });
shoot("09-settings", () => { state.gameState = STATE.SETTINGS; });
shoot("10-boss15", () => {
    state.player.level = 15; loadLevel(15, true); createBoss(15);
    state.boss.t = 40; state.gameState = STATE.PLAYING;
});
shoot("11-boss30", () => { createBoss(30); state.boss.t = 40; state.boss.phase = 1; });
shoot("12-boss45", () => { createBoss(45); state.boss.t = 40; });
shoot("13-boss50", () => { createBoss(50); state.boss.t = 40; });
shoot("14-gameover", () => { state.boss = null; state.gameState = STATE.GAME_OVER; });
shoot("15-victory", () => { state.gameState = STATE.VICTORY; });

window.__SHOTS__ = SHOTS;
const holder = document.createElement("div");
holder.id = "shots";
holder.textContent = JSON.stringify(SHOTS.map((s) => ({ name: s.name, len: (s.url || "").length, error: s.error })));
document.body.appendChild(holder);
for (const s of SHOTS) {
    if (!s.url) continue;
    const img = document.createElement("img");
    img.src = s.url;
    img.dataset.name = s.name;
    img.className = "shot";
    document.body.appendChild(img);
}
