import {
    RARITY,
    MAX_BALLS,
    BALL_BASE_SPEED,
} from "./constants.js";
import { state, addScore } from "./state.js";
import { spawnFloatingText } from "./fx.js";
import { playSkillUse } from "./sound.js";

export const REWARD_TYPE_NAME = {
    bonus: "加成",
    skill: "技能",
    ability: "能力",
};

// ─── 奖励定义（34 个效果） ─────────────────────────────────
// type: bonus = 数值加成 / skill = 主动技能（最多装备2个）/ ability = 被动能力（含局外收益）
const R = RARITY;

export const REWARDS = [
    // ═══ 加成（数值） ═══
    {
        id: "power_ball", name: "强化球体", icon: "⚡", rarity: R.COMMON, type: "bonus", maxStacks: 5,
        desc: "球伤害 +1",
    },
    {
        id: "swift_ball", name: "迅捷球", icon: "🚀", rarity: R.COMMON, type: "bonus", maxStacks: 3,
        desc: "球速度 +10%",
    },
    {
        id: "slow_ball", name: "减速球", icon: "🐢", rarity: R.COMMON, type: "bonus", maxStacks: 3,
        desc: "球速度 -12%（更易控制）",
    },
    {
        id: "extra_life", name: "额外生命", icon: "❤️", rarity: R.COMMON, type: "bonus", maxStacks: 99,
        desc: "获得 1 条额外生命",
        apply() { state.player.lives += 1; },
    },
    {
        id: "score_boost", name: "分数加成", icon: "⭐", rarity: R.COMMON, type: "bonus", maxStacks: 99,
        desc: "立即获得 500 分",
        apply() { addScore(500); },
    },
    {
        id: "wider_paddle", name: "加宽挡板", icon: "↔️", rarity: R.COMMON, type: "bonus", maxStacks: 4,
        desc: "挡板宽度 +25%",
    },
    {
        id: "entry_gain", name: "初始收益", icon: "💰", rarity: R.COMMON, type: "bonus", maxStacks: 5,
        desc: "进入每关时额外获得 50 分",
    },
    {
        id: "mega_ball", name: "极限球体", icon: "⚡⚡", rarity: R.UNCOMMON, type: "bonus", maxStacks: 3,
        desc: "球伤害 +2",
    },
    {
        id: "big_life", name: "高级生命", icon: "💖", rarity: R.UNCOMMON, type: "bonus", maxStacks: 5,
        desc: "获得 2 条额外生命",
        apply() { state.player.lives += 2; },
    },
    {
        id: "giant_paddle", name: "巨型挡板", icon: "🛡️", rarity: R.UNCOMMON, type: "bonus", maxStacks: 2,
        desc: "挡板宽度 +50%",
    },
    {
        id: "cd_reduction", name: "急速冷却", icon: "⏱️", rarity: R.UNCOMMON, type: "bonus", maxStacks: 3,
        desc: "主动技能冷却时间 -20%",
    },
    {
        id: "annihil_ball", name: "湮灭球体", icon: "⚡⚡⚡", rarity: R.RARE, type: "bonus", maxStacks: 2,
        desc: "球伤害 +3",
    },
    {
        id: "life_crown", name: "生命之冠", icon: "👑", rarity: R.RARE, type: "bonus", maxStacks: 3,
        desc: "获得 3 条生命与 500 分",
        apply() { state.player.lives += 3; addScore(500); },
    },

    // ═══ 主动技能（最多装备 2 个，数字键 1/2 释放） ═══
    {
        id: "ghost", name: "幽灵穿越", icon: "👻", rarity: R.RARE, type: "skill", cooldown: 25,
        desc: "3 秒内球不会被方块弹回（仍造成伤害）",
        use() { state.player.ghostTimer = 180; },
    },
    {
        id: "slow_time", name: "时间缓速", icon: "⏳", rarity: R.UNCOMMON, type: "skill", cooldown: 30,
        desc: "8 秒内所有球速度 -40%",
        use() { applyTimeScale(0.6, 480); },
    },
    {
        id: "energy_shield", name: "能量护盾", icon: "🌀", rarity: R.UNCOMMON, type: "skill", cooldown: 30,
        desc: "8 秒内挡板免疫一切弹幕伤害",
        use() { state.player.shieldTimer = 480; },
    },
    {
        id: "blast_charge", name: "爆裂蓄力", icon: "💥", rarity: R.UNCOMMON, type: "skill", cooldown: 25,
        desc: "接下来 5 秒内击碎方块时引发爆炸，波及周围方块",
        use() { state.player.explosiveTimer = 300; },
    },
    {
        id: "barrage", name: "弹幕爆发", icon: "🎇", rarity: R.UNCOMMON, type: "skill", cooldown: 35,
        desc: "立即额外发射 5 个球",
        use() { spawnExtraBalls(5); },
    },
    {
        id: "power_strike", name: "聚能一击", icon: "🔆", rarity: R.RARE, type: "skill", cooldown: 30,
        desc: "接下来 5 秒内球伤害 ×2",
        use() { state.player.strikeTimer = 300; },
    },
    {
        id: "time_freeze", name: "时间冻结", icon: "🧊", rarity: R.RARE, type: "skill", cooldown: 40,
        desc: "4 秒内所有方块与 Boss 停止移动和攻击",
        use() { state.player.freezeTimer = 240; },
    },

    // ═══ 被动能力（含局外收益） ═══
    {
        id: "piercing", name: "穿透", icon: "💠", rarity: R.UNCOMMON, type: "ability", maxStacks: 3,
        desc: "球击碎方块后可穿透 1 次（按层数+1）",
    },
    {
        id: "dual_ball", name: "双球开局", icon: "🔵", rarity: R.COMMON, type: "ability", maxStacks: 3,
        desc: "每关开始时额外获得 1 个球",
    },
    {
        id: "giant_orb", name: "巨型球", icon: "🪐", rarity: R.COMMON, type: "ability", maxStacks: 2,
        desc: "球体积 +30%，更容易命中",
    },
    {
        id: "explosion_res", name: "爆炸共鸣", icon: "🧨", rarity: R.UNCOMMON, type: "ability", maxStacks: 2,
        desc: "击碎方块时有 25% 概率对相邻方块造成 1 点伤害",
    },
    {
        id: "echo_hit", name: "回音击", icon: "🔔", rarity: R.COMMON, type: "ability", maxStacks: 2,
        desc: "击碎方块时弹片对周围随机方块造成 1 点伤害",
    },
    {
        id: "split_ball", name: "分裂之球", icon: "🧬", rarity: R.RARE, type: "ability", maxStacks: 1,
        desc: "球每撞击 6 次方块便分裂出 1 个新球",
    },
    {
        id: "bouncy_combo", name: "弹射连击", icon: "🛸", rarity: R.RARE, type: "ability", maxStacks: 1,
        desc: "球击碎方块后不会反弹，直接继续飞行",
    },
    {
        id: "vampire", name: "吸血之触", icon: "🧛", rarity: R.RARE, type: "ability", maxStacks: 2,
        desc: "击碎方块时有 5% 概率恢复 1 条生命",
    },
    {
        id: "gold_soul", name: "黄金之魂", icon: "🏆", rarity: R.UNCOMMON, type: "ability", maxStacks: 2,
        desc: "所有来源的分数 ×2",
    },
    {
        id: "iron_will", name: "钢铁意志", icon: "🛐", rarity: R.RARE, type: "ability", maxStacks: 1,
        desc: "受到弹幕伤害时有 50% 概率格挡",
    },
    {
        id: "thorn_armor", name: "荆棘反甲", icon: "🌵", rarity: R.UNCOMMON, type: "ability", maxStacks: 2,
        desc: "挡板被弹幕命中时，反弹对 Boss 造成 5 点伤害",
    },
    {
        id: "lifebuoy", name: "救生圈", icon: "💺", rarity: R.UNCOMMON, type: "ability", maxStacks: 1,
        desc: "每关开始获得 1 次免费救球：球落地自动返回",
    },
    {
        id: "meteor", name: "末路追踪", icon: "☄️", rarity: R.RARE, type: "ability", maxStacks: 1,
        desc: "每击碎 8 个方块，自动对场上血量最高的方块造成 3 点伤害",
    },
    {
        id: "lucky", name: "幸运女神", icon: "🍀", rarity: R.RARE, type: "ability", maxStacks: 1,
        desc: "奖励选择数量 +1（局外收益）",
    },
    {
        id: "compass", name: "寻宝罗盘", icon: "🧭", rarity: R.UNCOMMON, type: "ability", maxStacks: 2,
        desc: "奖励稀有度概率提高 10%（局外收益）",
    },
];

export const REWARD_MAP = Object.fromEntries(REWARDS.map((r) => [r.id, r]));

const stackCount = (id) => (state.player ? (state.player.perks[id] || 0) : 0);

// ─── 选卡逻辑 ─────────────────────────────────────────────
function rollRarity() {
    const p = state.player;
    let commonW = 60;
    let uncommonW = 30;
    let rareW = 10 + (p ? stackCount("compass") * 10 : 0);
    // 圣光洗礼：罕见起步
    if (p && p.rewardBoost === RARITY.UNCOMMON) {
        uncommonW += commonW;
        commonW = 0;
    }
    const total = commonW + uncommonW + rareW;
    const roll = Math.random() * total;
    if (roll < rareW) return RARITY.RARE;
    if (roll < rareW + uncommonW) return RARITY.UNCOMMON;
    return RARITY.COMMON;
}

function pickOfRarity(rarity, excludeIds) {
    const candidates = REWARDS.filter((r) => {
        if (r.rarity !== rarity || excludeIds.has(r.id)) return false;
        if (r.type === "skill") return stackCount(r.id) === 0; // 技能不重复装备
        return (r.maxStacks ?? 1) > stackCount(r.id);
    });
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

export function getRewardChoices(count, rareOnly = false) {
    const used = new Set();
    const result = [];
    for (let i = 0; i < count; i++) {
        const rarity = rareOnly ? RARITY.RARE : rollRarity();
        let pick = pickOfRarity(rarity, used);
        if (!pick) pick = pickOfRarity(rareOnly ? RARITY.RARE : rollRarity(), used);
        if (!pick) continue;
        used.add(pick.id);
        result.push(pick);
    }
    return result;
}

// ─── 应用奖励 / 属性重算 ──────────────────────────────────
export function applyReward(def) {
    const p = state.player;
    if (def.type === "skill") {
        p.skills.push({ id: def.id, cd: 0 });
    } else {
        p.perks[def.id] = (p.perks[def.id] || 0) + 1;
        if (def.apply) def.apply();
    }
    recalcStats();
}

export function replaceSkill(oldIndex, newDef) {
    state.player.skills.splice(oldIndex, 1, { id: newDef.id, cd: 0 });
    recalcStats();
}

export function recalcStats() {
    const p = state.player;
    const n = (id) => p.perks[id] || 0;
    p.ballDamage = 1 + n("power_ball") + n("mega_ball") * 2 + n("annihil_ball") * 3;
    p.ballSpeedMul = Math.pow(1.1, n("swift_ball")) * Math.pow(0.88, n("slow_ball"));
    p.paddleBonus = n("wider_paddle") * 0.25 + n("giant_paddle") * 0.5;
    p.scoreMul = Math.pow(2, n("gold_soul"));
    p.healChance = 0.05 * n("vampire");
    p.bossResist = n("iron_will") > 0 ? 0.5 : 0;
    p.thorns = 5 * n("thorn_armor");
    p.maxPiercing = n("piercing");
    p.extraChoices = n("lucky");
    p.skillCdMul = Math.pow(0.8, n("cd_reduction"));
    p.startBalls = 1 + n("dual_ball");
    p.ballRadiusMul = 1 + 0.3 * n("giant_orb");
    p.lifesaverLeft = n("lifebuoy") > 0 ? 1 : 0;
    p.entryBonus = 50 * n("entry_gain");
}

// ─── 主动技能（由 game.js 调用） ──────────────────────────
export function useSkillFromGame(index) {
    const s = state.player.skills[index];
    if (!s) return;
    const def = REWARD_MAP[s.id];
    if (s.cd > 0) {
        spawnFloatingTextCenter("技能冷却中", "#ff8080");
        return;
    }
    def.use();
    s.cd = Math.round(def.cooldown * 60 * state.player.skillCdMul);
    playSkillUse();
    spawnFloatingTextCenter(`${def.name}！`, "#7dff9b");
}

function spawnFloatingTextCenter(text, color) {
    spawnFloatingText(400, 240, text, color);
}

// ─── 球与时间缩放 ─────────────────────────────────────────
export function spawnExtraBalls(count) {
    const actual = Math.min(count, MAX_BALLS - state.balls.length);
    const baseSpeed = state.balls.length > 0 ? state.balls[0].speed : BALL_BASE_SPEED * state.player.ballSpeedMul;
    for (let i = 0; i < actual; i++) {
        const angle = ((Math.random() * 60 - 30 - 90) * Math.PI) / 180;
        state.balls.push({
            x: state.paddle.x + state.paddle.width / 2,
            y: state.paddle.y - 10,
            vx: Math.cos(angle) * baseSpeed,
            vy: Math.sin(angle) * baseSpeed,
            speed: baseSpeed,
            radius: 8 * state.player.ballRadiusMul,
            launched: true,
            piercingLeft: state.player.maxPiercing,
            trail: [],
            blockHits: 0,
        });
    }
}

export function applyTimeScale(factor, frames) {
    const p = state.player;
    p.slowFactor = factor;
    p.slowTill = state.time + frames;
    for (const b of state.balls) {
        b.speed *= factor;
        b.vx *= factor;
        b.vy *= factor;
    }
}

export function restoreTimeScale() {
    const p = state.player;
    if (!p.slowFactor || p.slowFactor === 1) return;
    const f = 1 / p.slowFactor;
    for (const b of state.balls) {
        b.speed *= f;
        b.vx *= f;
        b.vy *= f;
    }
    p.slowFactor = 1;
    p.slowTill = 0;
}

// 慢速状态下新球的速度缩放
export function currentSpeedScale() {
    const p = state.player;
    return p.slowTill > state.time ? p.slowFactor : 1;
}