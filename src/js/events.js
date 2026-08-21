import { RARITY, MAX_SKILLS } from "./constants.js";
import { state, addScore, loseLife } from "./state.js";
import { REWARDS, applyReward } from "./rewards.js";
import { spawnFloatingText } from "./fx.js";
import { playHeal, playEventGood, playEventBad } from "./sound.js";
import { rollCurse, applyCurseStack, rollHeavyCurse, applyHeavyCurse } from "./curses.js";

function filterPool(rarity) {
    const p = state.player;
    const pool = REWARDS.filter((r) => {
        if (r.bossOnly) return false; // Boss 专属不进事件池
        if (r.type === "skill") {
            if (p.skills.length >= MAX_SKILLS) return false;
            return !p.skills.some((s) => s.id === r.id);
        }
        return (r.maxStacks ?? 1) > (p.perks[r.id] || 0);
    });
    const filtered = rarity ? pool.filter((r) => r.rarity === rarity) : pool;
    return filtered.length > 0 ? filtered : pool;
}

function pickFrom(src) {
    return src.length > 0 ? src[Math.floor(Math.random() * src.length)] : null;
}

// 打包指定稀有度的单个随机奖励（null = 任意稀有度）
function rollBundle(rarity) {
    return pickFrom(filterPool(rarity));
}

// 不出技能，仅加成/能力
function rollBundleNoSkill(rarity) {
    return pickFrom(filterPool(rarity).filter((r) => r.type !== "skill"));
}

// 仅被动能力，至少罕见品质（罕见或稀有）
function rollBundleAbilityOnly() {
    const pool = filterPool(null).filter((r) => r.type === "ability" && r.rarity !== RARITY.COMMON);
    return pickFrom(pool);
}

// 立即获得一个随机奖励（供事件与限时挑战使用）
export function grantEventReward(rarity) {
    const def = rollBundle(rarity);
    if (def) applyReward(def);
    return def;
}

// 奖励的说明文本（图标 + 名称 + 效果）
export function describeReward(def) {
    if (!def) return "无";
    return `${def.icon} ${def.name}：${def.desc}`;
}

const LEAVE_TEXT = "你离开了事件房";

// 事件房定义（apply 返回结果提示 {text, color}）
export const EVENTS = [
    {
        id: "merchant",
        name: "神秘商人",
        icon: "🧙",
        desc: "一位披着斗篷的商人向你展示了一件商品：\n花费 800 分，换取一个随机的罕见奖励。",
        skippable: true,
        choices: [
            {
                label: "购买（800 分）",
                need() { return state.player.score >= 800; },
                apply() {
                    state.player.score -= 800;
                    const def = grantEventReward(RARITY.UNCOMMON);
                    playEventGood();
                    return {
                        text: `交易完成！\n获得罕见奖励：${describeReward(def)}`,
                        color: "#5aa7ff",
                    };
                },
            },
            {
                label: "离开",
                apply() { playEventBad(); return { text: LEAVE_TEXT, color: "#8892b0" }; },
            },
        ],
    },
    {
        id: "challenge",
        name: "限时挑战",
        icon: "⏰",
        desc: "一位武僧向你发起考验：\n25 秒内击破 12 个方块即可获得罕见奖励，\n失败将损失半条生命。",
        skippable: true,
        choices: [
            {
                label: "接受挑战",
                apply() {
                    state.pendingChallenge = true;
                    playEventGood();
                    return { text: "挑战即将开始！点击继续进入战斗", color: "#ffa94d" };
                },
            },
            {
                label: "拒绝",
                apply() { playEventBad(); return { text: LEAVE_TEXT, color: "#8892b0" }; },
            },
        ],
    },
    {
        id: "gamble",
        name: "命运赌局",
        icon: "🎲",
        desc: "与命运对赌：\n50% 概率获得一个随机罕见奖励，50% 概率获得一个随机诅咒。",
        skippable: true,
        choices: [
            {
                label: "下注！",
                apply() {
                    if (Math.random() < 0.5) {
                        const def = grantEventReward(RARITY.UNCOMMON);
                        playEventGood();
                        return { text: `赢了！获得罕见奖励：\n${describeReward(def)}`, color: "#5aa7ff" };
                    }
                    const curse = rollCurse();
                    applyCurseStack(curse.id, 1, state.player);
                    playEventBad();
                    return { text: `输了……获得诅咒：${curse.icon} ${curse.name}`, color: "#ff8080" };
                },
            },
            {
                label: "不赌",
                apply() { playEventBad(); return { text: LEAVE_TEXT, color: "#8892b0" }; },
            },
        ],
    },
    {
        id: "spring",
        name: "生命之泉",
        icon: "⛲",
        desc: "清澈的泉水散发着治愈的力量。\n恢复 2 条生命。",
        skippable: false,
        choices: [
            {
                label: "畅饮泉水",
                apply() {
                    state.player.lives += 2;
                    playHeal();
                    return { text: "生命 +2，身体重新充满活力", color: "#7dff9b" };
                },
            },
        ],
    },
    {
        id: "altar",
        name: "暗影祭坛",
        icon: "🗡️",
        desc: "祭坛渴求鲜血：\n献祭 1 条生命，获得 2 个随机普通奖励。",
        skippable: true,
        choices: [
            {
                label: "献祭生命（-1 生命）",
                apply() {
                    if (state.player.lives <= 1) {
                        return { text: "生命不足，无法献祭", color: "#ff8080" };
                    }
                    loseLife(1);
                    const a = grantEventReward(RARITY.COMMON);
                    const b = grantEventReward(RARITY.COMMON);
                    playEventGood();
                    return {
                        text: `获得普通奖励：\n${describeReward(a)}\n${describeReward(b)}`,
                        color: "#b8c0cc",
                    };
                },
            },
            {
                label: "离开",
                apply() { playEventBad(); return { text: LEAVE_TEXT, color: "#8892b0" }; },
            },
        ],
    },
    {
        id: "void",
        name: "虚空裂缝",
        icon: "🕳️",
        desc: "裂缝中传来未知的低语：\n60% 概率获得随机奖励，40% 概率失去 150 分。",
        skippable: true,
        choices: [
            {
                label: "伸手一探",
                apply() {
                    if (Math.random() < 0.6) {
                        const def = grantEventReward(null);
                        playEventGood();
                        return { text: `获得神秘奖励：\n${describeReward(def)}`, color: "#ffcc33" };
                    }
                    state.player.score = Math.max(0, state.player.score - 150);
                    playEventBad();
                    return { text: "分数 -150（被裂缝吞噬）", color: "#ff8080" };
                },
            },
            {
                label: "离开",
                apply() { playEventBad(); return { text: LEAVE_TEXT, color: "#8892b0" }; },
            },
        ],
    },
    {
        id: "blessing",
        name: "圣光洗礼",
        icon: "🌟",
        desc: "圣光照亮前路：\n下一次选择奖励时，所有奖励至少为罕见品质。",
        skippable: false,
        choices: [
            {
                label: "接受洗礼",
                apply() {
                    state.player.rewardBoost = RARITY.UNCOMMON;
                    playEventGood();
                    return { text: "下次奖励至少为罕见品质！", color: "#5aa7ff" };
                },
            },
        ],
    },
    {
        id: "blackmarket",
        name: "黑市",
        icon: "💀",
        desc: "可疑的商人压低声音：\n用 1 条生命，换取一个随机的稀有奖励。",
        skippable: true,
        choices: [
            {
                label: "交易（-1 生命）",
                apply() {
                    if (state.player.lives <= 1) {
                        return { text: "生命不足，无法交易", color: "#ff8080" };
                    }
                    loseLife(1);
                    const def = grantEventReward(RARITY.RARE);
                    playEventGood();
                    return { text: `获得稀有奖励：\n${describeReward(def)}`, color: "#ffcc33" };
                },
            },
            {
                label: "离开",
                apply() { playEventBad(); return { text: LEAVE_TEXT, color: "#8892b0" }; },
            },
        ],
    },
    {
        id: "campfire",
        name: "篝火营地",
        icon: "🏕️",
        desc: "温暖的火光让人安心。\n获得 1000 分。",
        skippable: false,
        choices: [
            {
                label: "休息片刻",
                apply() {
                    addScore(1000);
                    playEventGood();
                    return { text: "分数 +1000，精神焕发", color: "#ffd700" };
                },
            },
        ],
    },
    {
        id: "workshop",
        name: "附魔工坊",
        icon: "🔮",
        desc: "工坊的附魔台嗡嗡作响：\n获得一个随机的罕见加成或能力（不含技能）。",
        skippable: false,
        choices: [
            {
                label: "开动附魔台",
                apply() {
                    const def = rollBundleNoSkill(RARITY.UNCOMMON);
                    if (def) applyReward(def);
                    playEventGood();
                    return {
                        text: `附魔完成！\n获得罕见奖励：${describeReward(def)}`,
                        color: "#6d97d8",
                    };
                },
            },
        ],
    },
    {
        id: "time_rift",
        name: "时光裂缝",
        icon: "⏳",
        desc: "一股时间乱流包裹了你：\n所有已装备的主动技能冷却时间减少 18 秒。",
        skippable: false,
        choices: [
            {
                label: "穿越裂缝",
                apply() {
                    const reduce = 18 * 60;
                    for (const s of state.player.skills) {
                        s.cd = Math.max(0, s.cd - reduce);
                    }
                    playEventGood();
                    const names = state.player.skills.map((s) => {
                        const def = REWARDS.find((r) => r.id === s.id);
                        return def ? def.name : "";
                    }).filter(Boolean).join(" · ");
                    return {
                        text: names ? `技能 CD -18s：${names}` : "当前没有装备技能，时光流逝……",
                        color: "#6d97d8",
                    };
                },
            },
        ],
    },
    {
        id: "wishing_well",
        name: "许愿井",
        icon: "🪙",
        desc: "一枚金币就能许一个愿，金额越大回报越丰厚——\n300 分 → 普通奖励\n600 分 → 罕见奖励\n1000 分 → 稀有奖励",
        skippable: true,
        choices: [
            {
                label: "投 300 分（普通）",
                need() { return state.player.score >= 300; },
                apply() {
                    state.player.score -= 300;
                    const def = rollBundleNoSkill(RARITY.COMMON);
                    if (def) applyReward(def);
                    playEventGood();
                    return { text: describeReward(def), color: "#9aa1ad" };
                },
            },
            {
                label: "投 600 分（罕见）",
                need() { return state.player.score >= 600; },
                apply() {
                    state.player.score -= 600;
                    const def = rollBundleNoSkill(RARITY.UNCOMMON);
                    if (def) applyReward(def);
                    playEventGood();
                    return { text: describeReward(def), color: "#6d97d8" };
                },
            },
            {
                label: "投 1000 分（稀有）",
                need() { return state.player.score >= 1000; },
                apply() {
                    state.player.score -= 1000;
                    const def = rollBundleNoSkill(RARITY.RARE);
                    if (def) applyReward(def);
                    playEventGood();
                    return { text: describeReward(def), color: "#e0b84f" };
                },
            },
            {
                label: "离开",
                apply() { playEventBad(); return { text: LEAVE_TEXT, color: "#8892b0" }; },
            },
        ],
    },
    {
        id: "library",
        name: "遗迹图书馆",
        icon: "📚",
        desc: "古老的藏书散发着微光：\n获得一个随机能力（仅被动能力），至少罕见品质。",
        skippable: false,
        choices: [
            {
                label: "研读古籍",
                apply() {
                    const def = rollBundleAbilityOnly();
                    if (def) applyReward(def);
                    playEventGood();
                    const c = def ? "#e0b84f" : "#8892b0";
                    return {
                        text: `领悟了新的能力：\n${describeReward(def)}`,
                        color: c,
                    };
                },
            },
        ],
    },
    {
        id: "sealed_room",
        name: "封印之间",
        icon: "🔐",
        desc: "密室中封存着危险的力量：\n获得一个稀有奖励，但也会得到一个随机重诅咒。\n（重诅咒不会随关卡推进解除）",
        skippable: true,
        choices: [
            {
                label: "打开封印",
                apply() {
                    const def = grantEventReward(RARITY.RARE);
                    const hc = rollHeavyCurse();
                    applyHeavyCurse(hc.id, state.player);
                    playEventGood();
                    return {
                        text: `获得稀有奖励：${describeReward(def)}\n获得重诅咒：${hc.icon} ${hc.name}：${hc.desc()}`,
                        color: "#e0b84f",
                    };
                },
            },
            {
                label: "离开",
                apply() { playEventBad(); return { text: LEAVE_TEXT, color: "#8892b0" }; },
            },
        ],
    },
];

export function pickEvent() {
    return EVENTS[Math.floor(Math.random() * EVENTS.length)];
}

// 执行选项，成功则记录结果面板内容
export function executeEventChoice(index) {
    const ev = state.currentEvent;
    if (!ev) return false;
    const choice = ev.choices[index];
    if (!choice) return false;
    if (choice.need && !choice.need()) {
        state.eventResult = { text: "条件不满足，无法选择", color: "#ff8080" };
        return false;
    }
    const res = choice.apply();
    state.eventResult = res || { text: "事件结束", color: "#8892b0" };
    return true;
}

export function clearEvent() {
    state.currentEvent = null;
    state.eventResult = null;
}