import { W, H, COLORS, RARITY_META, MAX_SKILLS } from "./constants.js";
import { state } from "./state.js";
import { ctx } from "./canvas.js";
import { roundRect, wrapText } from "./utils.js";
import { REWARD_TYPE_NAME, REWARD_MAP } from "./rewards.js";
import { loadSaveData } from "./game.js";

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

export function hitBossClearButton(x, y) {
    return inRect(x, y, bossClearBtn);
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

    // Lives（支持半条命显示）
    const hearts = Math.floor(p.lives);
    const half = p.lives - hearts >= 0.5;
    ctx.fillStyle = COLORS.ui;
    ctx.fillText("❤️ ".repeat(hearts) + (half ? "💗 " : ""), 140, 33);

    // Score
    ctx.fillStyle = COLORS.ui;
    ctx.textAlign = "center";
    ctx.fillText(`分数: ${p.score}`, W / 2, 35);

    // ESC 提示
    ctx.fillStyle = COLORS.uiDim;
    ctx.font = "11px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("ESC 暂停", W - 12, 24);

    // Active effects indicator
    let fxY = 62;
    if (state.challenge) {
        const c = state.challenge;
        const breakable = state.blocks.filter((b) => !b.indestructible).length;
        const broke = c.initialBreakable - breakable;
        ctx.fillStyle = "#ffa94d";
        ctx.font = "bold 13px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`限时挑战：击破 ${Math.min(broke, c.target)}/${c.target} · 剩余 ${Math.ceil(c.limit / 60)} 秒`, W / 2, fxY);
        fxY += 20;
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
        ctx.textAlign = "center";
        ctx.fillText(eff, W / 2, fxY);
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
    for (let i = 0; i < MAX_SKILLS; i++) {
        const sx = 8 + i * 58;
        const sy = 58;
        const s = p.skills[i];
        const def = s ? REWARD_MAP[s.id] : null;

        ctx.fillStyle = "rgba(20,20,50,0.9)";
        ctx.strokeStyle = def ? RARITY_META[def.rarity].color : "rgba(100,100,140,0.4)";
        ctx.lineWidth = 1.5;
        roundRect(sx, sy, 52, 52, 8);
        ctx.fill();
        ctx.stroke();

        if (def) {
            ctx.font = "22px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(def.icon, sx + 26, sy + 32);

            if (s.cd > 0) {
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

    if (save && save.level > 1) {
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
    ctx.fillText("技能数字键 1/2 释放 · ESC 暂停 · 按 M 键开关音效", W / 2, lastBtnY + btnH + 24);
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
        let count = state.player.perks[def.id] || 0;
        if (def.type === "skill") {
            count = state.player.skills.filter((s) => s.id === def.id).length;
        }
        if (def.type === "skill" && count === 0) {
            ctx.fillStyle = COLORS.uiDim;
            ctx.font = "11px 'PingFang SC','Microsoft YaHei',sans-serif";
            ctx.fillText("装备后按 1/2 键释放", cx + cardW / 2, cardY + cardH - 14);
        } else if (count > 0) {
            ctx.fillStyle = COLORS.gold;
            ctx.font = "11px 'PingFang SC','Microsoft YaHei',sans-serif";
            ctx.fillText(`已拥有 ×${count}`, cx + cardW / 2, cardY + cardH - 14);
        }

        rewardCards.push({ x: cx, y: cardY, w: cardW, h: cardH, def });
    }
}

// 技能替换界面
export function drawSkillSwap() {
    ctx.fillStyle = "rgba(5,5,20,0.82)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#ff9966";
    ctx.font = "bold 26px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("技能槽已满（2/2）", W / 2, H / 2 - 170);

    ctx.fillStyle = COLORS.ui;
    ctx.font = "15px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("装备新技能需要舍弃一个已装备的技能，点击要舍弃的技能", W / 2, H / 2 - 132);

    const cardW = 200;
    const cardH = 170;
    const gap = 40;
    const totalW = state.player.skills.length * cardW + (state.player.skills.length - 1) * gap;
    const startX = W / 2 - totalW / 2;
    const cardY = H / 2 - 90;

    swapCards = [];

    for (let i = 0; i < state.player.skills.length; i++) {
        const s = state.player.skills[i];
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
    ctx.fillText(`第 ${state.player.level} 关 · 分数 ${state.player.score} · 进度已自动保存`, W / 2, H / 2 - 82);

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
}

export function drawGameOver() {
    ctx.fillStyle = "rgba(5,5,20,0.75)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#ff5566";
    ctx.font = "bold 40px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("游戏结束", W / 2, H / 2 - 30);

    ctx.fillStyle = COLORS.ui;
    ctx.font = "18px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(`最终分数: ${state.player.score}  |  到达第 ${state.player.level} 关`, W / 2, H / 2 + 20);

    const btnW = 180;
    const btnH = 46;
    const btnX = W / 2 - btnW / 2;
    const btnY = H / 2 + 50;
    const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
    btnGrad.addColorStop(0, "#ff5566");
    btnGrad.addColorStop(1, "#ff7744");
    ctx.fillStyle = btnGrad;
    roundRect(btnX, btnY, btnW, btnH, 23);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("重新开始", W / 2, btnY + 31);

    restartBtn = { x: btnX, y: btnY, w: btnW, h: btnH };
}

export function drawVictory() {
    ctx.fillStyle = "rgba(5,5,20,0.75)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = COLORS.gold;
    ctx.font = "bold 40px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🎉 恭喜通关！", W / 2, H / 2 - 30);

    ctx.fillStyle = COLORS.ui;
    ctx.font = "18px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(`最终分数: ${state.player.score}  |  已通关 50 层`, W / 2, H / 2 + 20);

    const btnW = 180;
    const btnH = 46;
    const btnX = W / 2 - btnW / 2;
    const btnY = H / 2 + 50;
    const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
    btnGrad.addColorStop(0, COLORS.paddle1);
    btnGrad.addColorStop(1, COLORS.paddle2);
    ctx.fillStyle = btnGrad;
    roundRect(btnX, btnY, btnW, btnH, 23);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText("再来一局", W / 2, btnY + 31);

    restartBtn = { x: btnX, y: btnY, w: btnW, h: btnH };
}