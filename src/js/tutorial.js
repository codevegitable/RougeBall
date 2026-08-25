// ═══ 新手引导 ═══
// 每个游戏特性第一次出现时弹出一次性说明：弹出期间游戏暂停（update 不推进），
// 玩家点击任意位置（或按回车/空格/ESC）后关闭，再继续原流程。
// 已看过的引导记入 localStorage，跨存档、跨局生效；中途放弃的引导下次还会触发。

import { W, H } from "./constants.js";
import { state } from "./state.js";
import { PAL } from "./palette.js";
import { ctx } from "./canvas.js";
import {
    PX, snap, pPanel, pRect, pText, pTextShadow, pScrim, pChamferFill,
} from "./pixel.js";
import { drawIcon } from "./icons.js";
import { panelX, BTN_W, BTN_H } from "./layout.js";

const KEY = "bounceRoguelikeGuides";
// 引导至少停留这么久才响应关闭，防止触发引导的那次点击被"连点"误关
const MIN_SHOW_MS = 350;

let seen = loadSeen();

function loadSeen() {
    try {
        return new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
    } catch (e) {
        return new Set();
    }
}

function persistSeen() {
    try {
        localStorage.setItem(KEY, JSON.stringify([...seen]));
    } catch (e) { /* localStorage 不可用时忽略 */ }
}

// ─── 引导内容（按首次可能出现顺序排列） ───────────────────
// lines 可以是一个数组（静态文本）或一个返回数组的函数（动态生成，如 Boss 介绍）
const GUIDES = {
    startReward: {
        title: "开局奖励",
        icon: "star",
        lines: [
            "从三张奖励卡中任选一项作为开局加成。",
            "奖励分三类：加成、技能、能力。",
            "稀有度越高效果越强，之后每次过关都会再获得选卡机会。",
        ],
    },
    basic: {
        title: "基本操作",
        icon: "ball",
        lines: [
            "移动鼠标控制挡板，点击画面发射小球。",
            "击碎所有方块即可过关；小球落地会损失生命。",
            "按 ESC 暂停，按 M 开关音效。",
        ],
    },
    skill: {
        title: "主动技能",
        icon: "lightning",
        lines: [
            "你装备了主动技能，显示在左下角技能槽。",
            "按数字键 1 / 2 释放，有冷却时间。",
            "最多同时装备 2 个技能，拾取新技能时可以选择替换。",
        ],
    },
    unbreakable: {
        title: "不可击碎方块",
        icon: "sealed",
        lines: [
            "带警示斜纹的铁块无法被击碎。",
            "清光所有可击碎方块即可过关。",
        ],
    },
    moving: {
        title: "移动方块",
        icon: "arrowR",
        lines: [
            "部分方块会左右往返移动。",
            "把握节奏与提前量，再果断出手。",
        ],
    },
    armored: {
        title: "重甲方块",
        icon: "shield",
        lines: [
            "四角带铆钉的方块覆盖着一层装甲。",
            "装甲能完全抵挡一次攻击，击穿后才能伤及本体。",
        ],
    },
    event: {
        title: "事件房",
        icon: "scroll",
        lines: [
            "过关后有几率遭遇奇遇事件。",
            "不同选项有不同收益，也可能暗藏风险。",
            "可选择离开。",
        ],
    },
    curse: {
        title: "诅咒",
        icon: "curse",
        lines: [
            "必须从中承受一项诅咒，效果永久生效。",
            "诅咒强度随层数递增，谨慎选择代价。",
            "已有诅咒可在暂停菜单的角色状态中随时查看。",
        ],
    },
    challenge: {
        title: "限时挑战",
        icon: "timer",
        lines: [
            "在限定时间内击破足够数量的方块。",
            "成功可获得罕见奖励，失败则损失半条生命。",
        ],
    },
    // ── 特殊方块引导 ──
    explosive: {
        title: "爆炸方块",
        icon: "bomb",
        lines: [
            "击碎时会对上下左右相邻方块各造成 1 点伤害。",
            "连锁爆炸可引发连环反应，一次性清掉大片方块。",
        ],
    },
    heal: {
        title: "治疗方块",
        icon: "heart",
        lines: [
            "血量显著高于普通方块。",
            "击碎后恢复 0.5 条命，关键时刻能救你一命。",
        ],
    },
    bounce: {
        title: "弹射方块",
        icon: "arrowR",
        lines: [
            "击中时球会以极端角度竖直反弹。",
            "弹道难以预测，注意站位避免球直接落地。",
        ],
    },
    reward: {
        title: "奖励方块",
        icon: "coin",
        lines: [
            "金色菱形标记的稀有方块，30 秒后自动消失。",
            "击碎后必定获得一个稀有奖励，优先处理！",
        ],
    },
    chain: {
        title: "连锁方块",
        icon: "lightning",
        lines: [
            "击碎时释放闪电链，对周围方块造成连锁伤害。",
            "连锁最多传递 5 次，适合清理密集区域。",
        ],
    },
    power: {
        title: "强化方块",
        icon: "sword",
        lines: [
            "击碎后所有球变大，伤害 +1，持续 8 秒。",
            "效果可叠加，连续击碎能维持全程强化。",
        ],
    },
    spread: {
        title: "扩散方块",
        icon: "fire",
        lines: [
            "击碎时释放 3 圈冲击波，对周围方块造成扩散伤害。",
            "冲击波范围广，适合清理分散的方块。",
        ],
    },
    momentum: {
        title: "加速方块",
        icon: "hourglass",
        lines: [
            "击碎后所有球速度 +30%，持续 6 秒。",
            "每次击碎方块都会延长加速持续时间。",
        ],
    },
    impact: {
        title: "重击方块",
        icon: "star",
        lines: [
            "只有高速球（速度 ≥130%）才能造成双倍伤害。",
            "击碎后额外奖励金币，速度不足时无法造成伤害。",
        ],
    },
    splitter: {
        title: "分裂方块",
        icon: "ball",
        lines: [
            "击碎后根据方块血量分裂出 1-3 个青色小球。",
            "小球会向四周弹射，帮助清理剩余方块。",
        ],
    },
    // ── Boss 介绍（按 tier 分 4 条，动态生成当前 Boss 的机制说明） ──
    boss1: {
        title: "BOSS 来袭",
        icon: "skull",
        lines: () => {
            const b = state.boss;
            if (!b) return ["Boss 战开始！"];
            const isRound = b.name === "回旋机兵";
            return [
                `${b.name} 降临！`,
                "冲锋：锁定玩家位置直线冲撞，撞墙后进入易伤状态",
                "跳砸：跃起后砸向地面，冲击波覆盖大范围",
                isRound ? "弹幕：螺旋弹幕持续倾泻，配合扇形封锁走位" : "弹幕：扇形弹幕封锁正面，环形弹幕从四周包夹",
            ];
        },
    },
    boss2: {
        title: "BOSS 来袭",
        icon: "skull",
        lines: () => {
            const b = state.boss;
            if (!b) return ["Boss 战开始！"];
            const isCore = b.name === "剧毒核心";
            return [
                `${b.name} 降临！`,
                "召唤治疗花为 Boss 回血、腐化花在地面制造毒圈",
                "藤蔓靠近挡板时会减速，清除召唤物",
                isCore ? "弹幕：波浪弹幕轨迹飘忽，环形弹幕封堵走位" : "弹幕：环形弹幕封锁四周，分裂弹幕命中后一分为二",
                "跳砸会在落点留下红圈，接触会受伤",
                "击杀召唤物会对 Boss 造成反噬伤害",
            ];
        },
    },
    boss3: {
        title: "BOSS 来袭",
        icon: "skull",
        lines: () => {
            const b = state.boss;
            if (!b) return ["Boss 战开始！"];
            const isHive = b.name === "机械蜂巢";
            return [
                `${b.name} 降临！ — 三阶段形态`,
                "第一阶段：纯弹幕压制",
                "第二阶段：部署炮台、护盾、自爆无人机",
                "护盾在场时 Boss 减伤 50%，自爆无人机会追踪挡板",
                isHive ? "第三阶段：主炮激光，预警期间击打 Boss 可削减光束" : "第三阶段：追踪弹幕接替，配合螺旋弹幕封锁",
                "每阶段切换时 Boss 短暂易伤",
            ];
        },
    },
    boss4: {
        title: "最终 Boss",
        icon: "crown",
        lines: () => {
            const b = state.boss;
            if (!b) return ["Boss 战开始！"];
            const isPriest = b.name === "诅咒司祭";
            return [
                `${b.name} 降临！ — 咒术与弹幕的终局`,
                "召唤诅咒祭坛：减伤、加速、加 CD，三种诅咒持续生效",
                "攻击祭坛从上方飘落，触碰到挡板扣 1.5 条命",
                isPriest ? "弹幕：扇形与追踪弹幕封锁，分裂弹幕补刀" : "弹幕：螺旋与波浪弹幕交织，环形弹幕封路",
                "优先摧毁祭坛解除诅咒，然后与 Boss 周旋",
            ];
        },
    },
    boss5: {
        title: "最终 Boss",
        icon: "crown",
        lines: () => {
            const b = state.boss;
            if (!b) return ["Boss 战开始！"];
            return [
                `${b.name} 降临！ — 终局之战`,
                "诅咒祭坛与密集弹幕的终极考验",
                "弹幕：多种弹幕模式交织，全方位封锁",
                "优先摧毁祭坛解除诅咒，然后与 Boss 周旋",
            ];
        },
    },
};

// ─── 队列与生命周期 ───────────────────────────────────────
export function hasSeenGuide(id) {
    return seen.has(id);
}

// 排队展示一条未看过的引导；若当前无引导在展示则立即激活队首。
// 同一条引导一生只弹一次（以关闭时刻为准，中途退出不算看过）。
export function queueGuideOnce(id) {
    if (!GUIDES[id] || seen.has(id)) return;
    if (state.guide && state.guide.id === id) return;
    if (state.guideQueue.includes(id)) return;
    state.guideQueue.push(id);
    activateNext();
}

function activateNext() {
    if (state.guide || state.guideQueue.length === 0) return;
    state.guide = { id: state.guideQueue.shift(), shownAt: Date.now() };
}

// 进入对局面时按场上要素补引导：基本操作 / 技能 / Boss / 方块机制。
// 多条同时满足时按队列逐条展示，点掉一条出现下一条。
export function checkPendingGuides() {
    if (!state.player) return;
    queueGuideOnce("basic");
    if (state.player.skills.length > 0) queueGuideOnce("skill");
    if (state.boss) {
        const tier = state.boss.tier;
        if (tier >= 0 && tier <= 4) queueGuideOnce("boss" + (tier + 1));
    }
    if (state.blocks.some((b) => b.indestructible)) queueGuideOnce("unbreakable");
    if (state.blocks.some((b) => b.moving)) queueGuideOnce("moving");
    if (state.blocks.some((b) => b.armored)) queueGuideOnce("armored");
    if (state.blocks.some((b) => b.explosive)) queueGuideOnce("explosive");
    if (state.blocks.some((b) => b.heal)) queueGuideOnce("heal");
    if (state.blocks.some((b) => b.bounce)) queueGuideOnce("bounce");
    if (state.blocks.some((b) => b.reward)) queueGuideOnce("reward");
    if (state.blocks.some((b) => b.chain)) queueGuideOnce("chain");
    if (state.blocks.some((b) => b.power)) queueGuideOnce("power");
    if (state.blocks.some((b) => b.spread)) queueGuideOnce("spread");
    if (state.blocks.some((b) => b.momentum)) queueGuideOnce("momentum");
    if (state.blocks.some((b) => b.impact)) queueGuideOnce("impact");
    if (state.blocks.some((b) => b.splitter)) queueGuideOnce("splitter");
}

// 关闭当前引导并记为已看；队列中还有未展示的接着弹
export function dismissGuide() {
    if (!state.guide) return;
    seen.add(state.guide.id);
    persistSeen();
    state.guide = null;
    activateNext();
}

// 丢弃全部引导（返回主菜单/重开等场景）；未看过的引导之后还会重新触发
export function clearGuides() {
    state.guide = null;
    state.guideQueue = [];
}

// 引导是否已展示足够久、可以响应关闭（防误触）
export function guideReadyToDismiss() {
    return !!state.guide && Date.now() - state.guide.shownAt >= MIN_SHOW_MS;
}

// ─── 绘制 ─────────────────────────────────────────────────
export function drawGuideOverlay() {
    const g = state.guide;
    if (!g) return;
    const def = GUIDES[g.id];
    if (!def) {
        state.guide = null;
        return;
    }

    const lines = typeof def.lines === "function" ? def.lines() : def.lines;
    if (!lines || lines.length === 0) {
        state.guide = null;
        return;
    }

    const lineH = 26;
    const w = 520;
    const h = 158 + lines.length * lineH;
    const x = panelX(w);
    const y = snap((H - h) / 2);
    const cx = W / 2;

    pScrim(0.84);

    pPanel(x, y, w, h, { fill: PAL.ink2, light: PAL.stone1, dark: PAL.ink0, chamfer: 3 });
    // 标题条（与 pModal 同构）
    pRect(x + PX * 2, y + PX * 2, w - PX * 4, PX * 9, PAL.ink1);
    pRect(x + PX * 2, y + PX * 10, w - PX * 4, PX, PAL.gold2);

    // 「新特性」徽标（右上角）
    pText("新特性", x + w - PX * 5, y + PX * 8, PAL.gold3, { size: 11, bold: true, align: "right" });
    // 图标 + 标题（居中，图标在标题左侧，同 pModal）
    const titleW = textWidth(def.title, 18);
    drawIcon(def.icon, cx - titleW / 2 - 18, y + PX * 6, 2.5, PAL.gold3);
    pText(def.title, cx, y + PX * 8, PAL.gold2, { size: 18, bold: true, align: "center" });

    // 正文
    let ly = y + PX * 19;
    for (const line of lines) {
        pTextShadow(line, cx, ly, PAL.bone0, { size: 14, align: "center" });
        ly += lineH;
    }

    // 继续按钮：金色主按钮，外观对齐 ui.js 的 pButton(primary)
    const bw = BTN_W, bh = BTN_H;
    const bx = snap((W - bw) / 2);
    const by = snap(y + h - bh - PX * 5);
    pChamferFill(bx, by, bw, bh, PAL.ink0, 2);
    pChamferFill(bx + PX, by + PX, bw - PX * 2, bh - PX * 2, PAL.gold0, 1);
    pChamferFill(bx + PX, by + PX, bw - PX * 2, bh - PX * 3, PAL.gold1, 1);
    pRect(bx + PX * 2, by + PX * 2, bw - PX * 4, PX, PAL.gold2);
    pText("知道了，继续", bx + bw / 2, by + bh / 2 + 7, PAL.ink0, {
        size: 15, bold: true, align: "center", outline: null,
    });

    pTextShadow("点击任意位置或按回车继续", cx, y + h - PX * 2, PAL.mist0, { size: 11, align: "center" });
}

// 与 ui.js 的 measureText 相同的近似测宽（等宽字体栈）
function textWidth(t, size) {
    ctx.save();
    ctx.font = `bold ${size}px monospace`;
    const w = ctx.measureText(t).width;
    ctx.restore();
    return w;
}