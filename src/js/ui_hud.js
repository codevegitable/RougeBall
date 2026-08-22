// ═══ HUD：常驻游戏内界面 ═══
// 布局原则：只占用 layout.js 声明的顶栏与底栏，游戏区（方块/球/挡板）保持全净空。
// 顶栏 48px：左=层数、中=分数、右=生命 + ESC 提示
// 底栏：左=技能槽、右=状态徽章（限 4 条 + 溢出计数），中间为挡板通道，永不放东西。

import { W, H, MAX_SKILLS } from "./constants.js";
import { state } from "./state.js";
import { ctx } from "./canvas.js";
import { PAL, RARITY_PAL } from "./palette.js";
import {
    PX, snap, pRect, pStroke, pPanel, pSlot, pText, pTextShadow, pBar, pSprite,
    SPR_HEART, SPR_HALF_HEART, heartMap,
} from "./pixel.js";
import {
    HUD_TOP_H, SKILL_SLOT, SKILL_GAP, SKILL_Y, SKILL_X,
    STATUS_RIGHT, STATUS_Y, STATUS_MAX,
} from "./layout.js";
import { REWARD_MAP } from "./rewards.js";
import { CURSES_MAP } from "./curses.js";
import { drawIcon } from "./icons.js";

export function drawUI() {
    drawTopBar();
    drawSkillSlots();
    drawStatusChips();
    drawLaunchHint();
}

// ─── 顶栏 ─────────────────────────────────────────────────
function drawTopBar() {
    const p = state.player;

    // 底板：实心暗色 + 底部两像素高的金色分隔线，视觉上与游戏区彻底分开
    pRect(0, 0, W, HUD_TOP_H, PAL.ink0);
    pRect(0, 0, W, HUD_TOP_H - PX, PAL.ink2);
    pRect(0, PX, W, PX, PAL.ink3);
    pRect(0, HUD_TOP_H - PX, W, PX, PAL.gold1);

    // ── 左：层数 ──
    // 不再用浮雕面板（黑框+亮面+暗面三层会在 28px 高度里挤出一团黑），
    // 改为纯文字 + 一道金色底线，信息密度不变但视觉更轻。
    pText(`B${p.level}`, 14, 32, PAL.gold3, { size: 20, bold: true });
    const lvW = measure(`B${p.level}`, 20);
    pRect(14, 36, lvW, PX, PAL.gold1);
    pTextShadow("层", 14 + lvW + 6, 32, PAL.mist1, { size: 12 });

    // ── 中：分数 ──
    pText(`${Math.floor(p.score / 10)}`, W / 2, 31, PAL.bone1, { size: 20, bold: true, align: "center" });
    pTextShadow("分", W / 2 + measure(`${Math.floor(p.score / 10)}`, 20) / 2 + 10, 31, PAL.mist0, { size: 11 });

    // ── 右：生命 ──
    drawHearts(p.lives);

    // ESC 提示：最右侧，小字低对比，不抢注意力
    pTextShadow("ESC", W - 14, 40, PAL.stone3, { size: 10, align: "right" });
}

function measure(text, size) {
    ctx.save();
    ctx.font = `bold ${size}px monospace`;
    const w = ctx.measureText(text).width;
    ctx.restore();
    return w;
}

// 生命：单颗心形 + 数字。
// 用数字而不是排列多颗心：秘籍能给到 30 条命，逐颗铺开会横穿整个顶栏；
// 数字宽度恒定，读数也比数心快。半血用 .5 表示。
function drawHearts(lives) {
    const full = Math.floor(lives);
    const hasHalf = lives - full >= 0.5;
    const text = `${full}${hasHalf ? ".5" : ""}`;

    const s = 3;                     // 心形点阵放大倍数 → 21×18px
    const heartW = 7 * s;
    const y = 13;
    const right = W - 52;            // 给右侧 ESC 提示留位

    // 数字靠右，心形贴在数字左边
    pText(text, right, 33, PAL.bone1, { size: 19, bold: true, align: "right" });
    const numW = measure(text, 19);
    const hx = right - numW - heartW - 7;

    const map = heartMap(PAL.blood1, PAL.blood2, PAL.blood3);
    pSprite(hasHalf && full === 0 ? SPR_HALF_HEART : SPR_HEART, hx, y, map, s);

    // 残血警示：1 条命及以下时心形加一圈描边闪烁
    if (lives <= 1) {
        const on = Math.floor(Date.now() / 350) % 2 === 0;
        if (on) {
            pStroke(hx - PX, y - PX, heartW + PX * 2, 6 * s + PX * 2, PAL.blood3, 1);
        }
    }
}

// ─── 技能槽（底部左侧）───────────────────────────────────
function drawSkillSlots() {
    const p = state.player;
    const effectiveMax = MAX_SKILLS - (p.curseSkillSlotPenalty || 0);

    for (let i = 0; i < MAX_SKILLS; i++) {
        const sx = SKILL_X + i * (SKILL_SLOT + SKILL_GAP);
        const sy = SKILL_Y;
        const sealed = i >= effectiveMax;
        const s = !sealed ? p.skills[i] : null;
        const def = s ? REWARD_MAP[s.id] : null;

        // 槽位：单层 1px 边框 + 石色底。
        // 原先是 pSlot 的三层浮雕（黑框 + 亮面 + 暗面）再叠一圈稀有度边框，
        // 44px 的槽位光边框就吃掉 14px，视觉上就是一团黑块。
        const edge = sealed ? PAL.blood1 : def ? RARITY_PAL[def.rarity].base : PAL.stone2;
        pRect(sx, sy, SKILL_SLOT, SKILL_SLOT, PAL.ink2);
        pRect(sx, sy, SKILL_SLOT, PX, edge);
        pRect(sx, sy + SKILL_SLOT - PX, SKILL_SLOT, PX, edge);
        pRect(sx, sy, PX, SKILL_SLOT, edge);
        pRect(sx + SKILL_SLOT - PX, sy, PX, SKILL_SLOT, edge);

        if (sealed) {
            drawIcon("sealed", sx + SKILL_SLOT / 2, sy + SKILL_SLOT / 2 - 2, 2, PAL.blood2);
        } else if (def) {
            drawIcon(def.icon, sx + SKILL_SLOT / 2, sy + SKILL_SLOT / 2 - 2, 2.5, RARITY_PAL[def.rarity].light);
            // 冷却：自底部升起的暗色遮罩 + 剩余秒数
            if (s && s.cd > 0) {
                const total = def.cooldown * 60 * Math.max(0.0001, p.skillCdMul);
                const ratio = Math.max(0, Math.min(1, s.cd / total));
                const ch = Math.round((SKILL_SLOT - PX * 2) * ratio / PX) * PX;
                ctx.fillStyle = PAL.ink0;
                ctx.fillRect(sx + PX, sy + SKILL_SLOT - PX - ch, SKILL_SLOT - PX * 2, ch);
                pText(`${Math.ceil(s.cd / 60)}`, sx + SKILL_SLOT / 2, sy + SKILL_SLOT / 2 + 5, PAL.bone1, {
                    size: 14, bold: true, align: "center",
                });
            }
        } else {
            pText("+", sx + SKILL_SLOT / 2, sy + SKILL_SLOT / 2 + 6, PAL.stone2, {
                size: 18, bold: true, align: "center",
            });
        }

        // 按键提示移到槽位下方，不再用黑色方块盖住槽内图标
        pText(String(i + 1), sx + SKILL_SLOT / 2, sy + SKILL_SLOT + 11, PAL.gold2, {
            size: 11, bold: true, align: "center",
        });
    }
}

// ─── 状态徽章（底部右侧）─────────────────────────────────
// 收拢所有 buff / 诅咒 / 挑战信息到右下角紧凑徽章，避免原本沿右边缘
// 一路往下堆叠、盖住游戏区的问题。
function drawStatusChips() {
    const p = state.player;
    const chips = [];

    // 限时挑战优先级最高
    if (state.challenge) {
        const c = state.challenge;
        const breakable = state.blocks.filter((b) => !b.indestructible).length;
        const broke = c.initialBreakable - breakable;
        chips.push({
            label: `挑战 ${Math.min(broke, c.target)}/${c.target}·${Math.ceil(c.limit / 60)}s`,
            color: PAL.ember2, icon: "timer",
        });
    }

    if (p.ballDamage > 1) chips.push({ label: `伤害+${(p.ballDamage - 1).toFixed(0)}`, color: PAL.blood3, icon: "sword" });
    if (p.maxPiercing > 0) chips.push({ label: `穿透×${p.maxPiercing}`, color: PAL.arc3, icon: "pierce" });
    if (state.balls.length > 1) chips.push({ label: `${state.balls.length} 球`, color: PAL.gold3, icon: "ball" });
    if (p.shieldTimer > 0) chips.push({ label: "护盾", color: PAL.arc3, icon: "shield" });
    if (p.freezeTimer > 0) chips.push({ label: "冻结", color: PAL.teal2, icon: "freeze" });
    if (p.ghostTimer > 0) chips.push({ label: "幽灵", color: PAL.vio3, icon: "ghost" });
    if (p.strikeTimer > 0) chips.push({ label: "聚能", color: PAL.gold3, icon: "star" });
    if (p.explosiveTimer > 0) chips.push({ label: "爆裂", color: PAL.ember3, icon: "bomb" });

    const curseCount = p.curses?.length || 0;
    if (curseCount > 0) {
        chips.push({ label: `诅咒×${curseCount}`, color: PAL.blood3, icon: "curse" });
    }

    const shown = chips.slice(0, STATUS_MAX);
    const overflow = chips.length - shown.length;

    const chipH = 22;
    let y = STATUS_Y + SKILL_SLOT - chipH;

    if (overflow > 0) {
        drawChip(`+${overflow}`, PAL.mist1, null, STATUS_RIGHT, y, chipH);
        y -= chipH + 4;
    }
    for (let i = shown.length - 1; i >= 0; i--) {
        drawChip(shown[i].label, shown[i].color, shown[i].icon, STATUS_RIGHT, y, chipH);
        y -= chipH + 4;
    }
}

// 徽章：只用左侧一道彩色竖条标识类别，不加外框。
// 黑色外框在深色地板上等于给游戏区挖了个洞，反而更碍眼。
function drawChip(label, color, icon, right, y, h) {
    const padL = icon ? 24 : 8;
    const tw = measure(label, 11);
    const w = snap(padL + tw + 10);
    const x = snap(right - w);
    pRect(x, y, w, h, PAL.ink2);
    pRect(x, y, PX, h, color);
    if (icon) drawIcon(icon, x + 15, y + h / 2 - 1, 1.5, color);
    pTextShadow(label, x + padL, y + h - 7, PAL.bone0, { size: 11, bold: true });
}

// ─── 发射提示 ─────────────────────────────────────────────
function drawLaunchHint() {
    if (!state.balls.some((b) => !b.launched)) return;
    // 放在挡板正上方 46px，闪烁用离散帧而非平滑正弦，符合像素风
    const on = Math.floor(Date.now() / 400) % 2 === 0;
    if (!on) return;
    const y = H - 92;
    pText("点击发射", W / 2, y, PAL.bone1, { size: 14, bold: true, align: "center" });
}
