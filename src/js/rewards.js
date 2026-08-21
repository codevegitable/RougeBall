import { RARITY, MAX_BALLS, BALL_BASE_SPEED, BALL_RADIUS, BALL_BLOCK_ACCEL, BALL_SPEED_CAP } from "./constants.js";
import { state, addScore } from "./state.js";
import { spawnFloatingText } from "./fx.js";
import { playSkillUse } from "./sound.js";
import { isRewardUnlocked } from "./unlocks.js";
import { CURSES_MAP } from "./curses.js";

export const REWARD_TYPE_NAME = { bonus: "加成", skill: "技能", ability: "能力" };

const R = RARITY;

export const REWARDS = [
    // ═══ 加成 ═══
    { id: "power_ball", name: "强化球体", icon: "⚡", rarity: R.COMMON, type: "bonus", maxStacks: 5, desc: "球伤害 +1" },
    { id: "slow_ball", name: "减速球", icon: "🐢", rarity: R.COMMON, type: "bonus", maxStacks: 3, desc: "球速度 -12%（更易控制）" },
    {
        id: "extra_life", name: "额外生命", icon: "❤️", rarity: R.COMMON, type: "bonus", maxStacks: 99, desc: "获得 1 条额外生命",
        apply() { state.player.lives += 1; },
    },
    {
        id: "score_boost", name: "分数加成", icon: "⭐", rarity: R.COMMON, type: "bonus", maxStacks: 99, desc: "立即获得 500 分",
        apply() { addScore(500); },
    },
    { id: "wider_paddle", name: "加宽挡板", icon: "↔️", rarity: R.COMMON, type: "bonus", maxStacks: 4, desc: "挡板宽度 +25%" },
    { id: "entry_gain", name: "初始收益", icon: "💰", rarity: R.COMMON, type: "bonus", maxStacks: 5, desc: "进入每关时额外获得 50 分" },
    // 替换 swift_ball → 火花核心
    { id: "spark_core", name: "火花核心", icon: "✨", rarity: R.COMMON, type: "ability", maxStacks: 3, desc: "击碎方块时额外获得 30 分" },
    { id: "mega_ball", name: "极限球体", icon: "⚡⚡", rarity: R.UNCOMMON, type: "bonus", maxStacks: 3, desc: "球伤害 +2" },
    {
        id: "big_life", name: "高级生命", icon: "💖", rarity: R.UNCOMMON, type: "bonus", maxStacks: 5, desc: "获得 2 条额外生命",
        apply() { state.player.lives += 2; },
    },
    { id: "giant_paddle", name: "巨型挡板", icon: "🛡️", rarity: R.UNCOMMON, type: "bonus", maxStacks: 2, desc: "挡板宽度 +50%" },
    { id: "cd_reduction", name: "急速冷却", icon: "⏱️", rarity: R.UNCOMMON, type: "bonus", maxStacks: 3, desc: "主动技能冷却时间 -20%" },
    { id: "annihil_ball", name: "湮灭球体", icon: "⚡⚡⚡", rarity: R.RARE, type: "bonus", maxStacks: 2, desc: "球伤害 +3" },
    {
        id: "life_crown", name: "生命之冠", icon: "👑", rarity: R.RARE, type: "bonus", maxStacks: 3, desc: "获得 3 条生命与 500 分",
        apply() { state.player.lives += 3; addScore(500); },
    },
    // ═══ 主动技能 ═══
    { id: "ghost", name: "幽灵穿越", icon: "👻", rarity: R.RARE, type: "skill", cooldown: 25, desc: "3 秒内球不会被方块弹回", use() { state.player.ghostTimer = 180; } },
    { id: "slow_time", name: "时间缓速", icon: "⏳", rarity: R.UNCOMMON, type: "skill", cooldown: 30, desc: "8 秒内所有球速度 -40%", use() { applyTimeScale(0.6, 480); } },
    { id: "energy_shield", name: "能量护盾", icon: "🌀", rarity: R.UNCOMMON, type: "skill", cooldown: 30, desc: "8 秒内挡板免疫一切弹幕伤害", use() { state.player.shieldTimer = 480; } },
    { id: "blast_charge", name: "爆裂蓄力", icon: "💥", rarity: R.UNCOMMON, type: "skill", cooldown: 25, desc: "接下来 5 秒内击碎方块时引发爆炸，波及周围方块", use() { state.player.explosiveTimer = 300; } },
    { id: "barrage", name: "弹幕爆发", icon: "🎇", rarity: R.UNCOMMON, type: "skill", cooldown: 35, desc: "立即额外发射 5 个球", use() { spawnExtraBalls(5); } },
    { id: "power_strike", name: "聚能一击", icon: "🔆", rarity: R.RARE, type: "skill", cooldown: 30, desc: "接下来 5 秒内球伤害 ×2", use() { state.player.strikeTimer = 300; } },
    { id: "time_freeze", name: "时间冻结", icon: "🧊", rarity: R.RARE, type: "skill", cooldown: 40, desc: "4 秒内所有方块与 Boss 停止移动和攻击", use() { state.player.freezeTimer = 240; } },
    // ═══ 解锁技能（逐层加入普通池） ═══
    { id: "jade_stars", name: "翡翠繁星", icon: "🟢", rarity: R.UNCOMMON, type: "skill", cooldown: 30, tierLock: 0, desc: "发射 3 个额外球", use() { spawnExtraBalls(3); } },
    { id: "jade_shield", name: "翡翠之盾", icon: "🛡️", rarity: R.UNCOMMON, type: "skill", cooldown: 35, tierLock: 0, desc: "6 秒内受击反弹 5 点伤害", use() { state.player.shieldTimer = 360; } },
    { id: "crimson_storm", name: "猩红风暴", icon: "🔴", rarity: R.UNCOMMON, type: "skill", cooldown: 30, tierLock: 1, desc: "5 秒内球分裂出 2 个额外球", use() { spawnExtraBalls(2); } },
    { id: "blood_siphon", name: "血之吸吮", icon: "🩸", rarity: R.UNCOMMON, type: "skill", cooldown: 40, tierLock: 1, desc: "8 秒内击碎方块回复 0.3 命", use() { state.player.siphonTimer = 480; } },
    { id: "golden_shield", name: "黄金之盾", icon: "🟡", rarity: R.RARE, type: "skill", cooldown: 40, tierLock: 2, desc: "6 秒内无敌", use() { state.player.shieldTimer = 360; } },
    { id: "wealth_rain", name: "财富之雨", icon: "💰", rarity: R.RARE, type: "skill", cooldown: 30, tierLock: 2, desc: "立即获得 2000 分", use() { addScore(2000); } },
    // ═══ 皮肤开场技能（不放普通池，仅用于 REWARD_MAP 查找） ═══
    { id: "jade_barrier", name: "翡翠屏障", icon: "🟢", rarity: R.UNCOMMON, type: "skill", cooldown: 35, skinOnly: true, desc: "5 秒内受击不扣血", use() { state.player.shieldTimer = 300; } },
    { id: "swift_blade", name: "迅捷之刃", icon: "🔴", rarity: R.UNCOMMON, type: "skill", cooldown: 30, skinOnly: true, desc: "5 秒内球伤害 ×1.5", use() { state.player.strikeTimer = 300; } },
    { id: "golden_blessing", name: "黄金祝福", icon: "🟡", rarity: R.UNCOMMON, type: "skill", cooldown: 35, skinOnly: true, desc: "立即获得 500 分，8 秒内分数 ×2", use() { addScore(500); state.player.scoreMul *= 2; state.player._wealthTimer = 480; } },
    // ═══ 被动能力 ═══
    { id: "piercing", name: "穿透", icon: "💠", rarity: R.UNCOMMON, type: "ability", maxStacks: 3, desc: "球击碎方块后可穿透 1 次" },
    { id: "dual_ball", name: "双球开局", icon: "🔵", rarity: R.COMMON, type: "ability", maxStacks: 3, desc: "每关开始时额外获得 1 个球" },
    { id: "giant_orb", name: "巨型球", icon: "🪐", rarity: R.COMMON, type: "ability", maxStacks: 2, desc: "球体积 +30%，更容易命中" },
    { id: "explosion_res", name: "爆炸共鸣", icon: "🧨", rarity: R.UNCOMMON, type: "ability", maxStacks: 2, desc: "击碎方块时有 25% 概率对相邻方块造成 1 点伤害" },
    { id: "echo_hit", name: "回音击", icon: "🔔", rarity: R.COMMON, type: "ability", maxStacks: 2, desc: "击碎方块时弹片对周围随机方块造成 1 点伤害" },
    { id: "split_ball", name: "分裂之球", icon: "🧬", rarity: R.RARE, type: "ability", maxStacks: 1, desc: "球每撞击 6 次方块便分裂出 1 个新球" },
    { id: "bouncy_combo", name: "弹射连击", icon: "🛸", rarity: R.RARE, type: "ability", maxStacks: 1, desc: "球击碎方块后不会反弹，直接继续飞行" },
    { id: "vampire", name: "死亡收割", icon: "🧛", rarity: R.RARE, type: "ability", maxStacks: 2, desc: "击碎方块时有 5% 概率恢复 1 条生命" },
    { id: "gold_soul", name: "黄金之魂", icon: "🏆", rarity: R.UNCOMMON, type: "ability", maxStacks: 2, desc: "所有来源的分数 ×2" },
    { id: "iron_will", name: "钢铁意志", icon: "🛐", rarity: R.RARE, type: "ability", maxStacks: 1, desc: "受到弹幕伤害时有 50% 概率格挡" },
    { id: "thorn_armor", name: "荆棘反甲", icon: "🌵", rarity: R.UNCOMMON, type: "ability", maxStacks: 2, desc: "挡板被弹幕命中时，反弹对 Boss 造成 5 点伤害" },
    { id: "lifebuoy", name: "救生圈", icon: "💺", rarity: R.UNCOMMON, type: "ability", maxStacks: 1, desc: "每关开始获得 1 次免费救球：球落地自动返回" },
    { id: "meteor", name: "末路追踪", icon: "☄️", rarity: R.RARE, type: "ability", maxStacks: 1, desc: "每击碎 8 个方块，自动对场上血量最高的方块造成 3 点伤害" },
    { id: "lucky", name: "幸运女神", icon: "🍀", rarity: R.RARE, type: "ability", maxStacks: 1, desc: "奖励选择数量 +1（局外收益）" },
    { id: "compass", name: "寻宝罗盘", icon: "🧭", rarity: R.UNCOMMON, type: "ability", maxStacks: 2, desc: "奖励稀有度概率提高 10%（局外收益）" },
    // ═══ 解锁奖励（6 个，按 tier 解锁后加入池） ═══
    { id: "guardian_core", name: "守护核心", icon: "🛡️", rarity: R.RARE, type: "ability", maxStacks: 1, desc: "每关开始获得 2 秒能量护盾", tierLock: 0 },
    { id: "greed_eye", name: "贪婪之眼", icon: "👁️", rarity: R.UNCOMMON, type: "ability", maxStacks: 2, desc: "击碎方块额外获得 +50% 分数", tierLock: 0 },
    { id: "vampiric_gem", name: "吸血宝石", icon: "💎", rarity: R.RARE, type: "ability", maxStacks: 1, desc: "击碎方块时 8% 概率恢复 1 生命", tierLock: 1 },
    { id: "rapid_cooling", name: "极速制冷", icon: "❄️", rarity: R.UNCOMMON, type: "bonus", maxStacks: 3, desc: "技能冷却额外 -15%", tierLock: 1 },
    { id: "titan_ball", name: "泰坦之球", icon: "🌍", rarity: R.RARE, type: "ability", maxStacks: 1, desc: "球体积 +60%，撞击方块伤害 +30%", tierLock: 2 },
    { id: "blessed_start", name: "祝福开局", icon: "✨", rarity: R.RARE, type: "bonus", maxStacks: 1, desc: "每关开始额外获得 2 个球", tierLock: 2 },
// ═══ Boss 专属奖励（仅击败 Boss 掉落，不入普通池） ═══
    { id: "titan_arm", name: "泰坦之臂", icon: "🦾", rarity: R.RARE, type: "bonus", maxStacks: 2, bossOnly: true, desc: "挡板宽度 +50%" },
    { id: "doom_blast", name: "灭世冲击", icon: "☄️", rarity: R.RARE, type: "bonus", maxStacks: 1, bossOnly: true, desc: "球伤害 +4" },
    { id: "time_weaver", name: "时间编织者", icon: "🕸️", rarity: R.RARE, type: "bonus", maxStacks: 2, bossOnly: true, desc: "技能冷却时间 -30%" },
    { id: "danmaku_lord", name: "弹幕领主", icon: "🎆", rarity: R.RARE, type: "ability", maxStacks: 1, bossOnly: true, desc: "释放主动技能时额外发射 3 个球" },
    {
        id: "treasury", name: "王之财宝", icon: "👑", rarity: R.RARE, type: "bonus", maxStacks: 2, bossOnly: true,
        desc: "立即获得 2000 分，所有分数获取 +20%",
        apply() { addScore(2000); },
    },
    { id: "godseed", name: "神速之星", icon: "🌠", rarity: R.RARE, type: "bonus", maxStacks: 2, bossOnly: true, desc: "球速度 -15%，球伤害 +1" },
];

export const REWARD_MAP = Object.fromEntries(REWARDS.map((r) => [r.id, r]));
const stackCount = (id) => (state.player ? (state.player.perks[id] || 0) : 0);

function isAvailable(r) {
    if (r.tierLock !== undefined && !isRewardUnlocked(r.id)) return false;
    if (r.type === "skill") return !state.player.skills.some((s) => s.id === r.id);
    return (r.maxStacks ?? 1) > stackCount(r.id);
}

// ─── 选卡逻辑 ─────────────────────────────────────────────
function rollRarity() {
    const p = state.player;
    let commonW = 60;
    let uncommonW = 30;
    let rareW = 10 + (p ? stackCount("compass") * 10 : 0);
    rareW = Math.max(0, rareW - (p.curseRarePenalty || 0));
    if (p.rewardBoost === RARITY.UNCOMMON) { uncommonW += commonW; commonW = 0; }
    const total = commonW + uncommonW + rareW;
    if (total <= 0) return RARITY.COMMON;
    const roll = Math.random() * total;
    if (roll < rareW) return RARITY.RARE;
    if (roll < rareW + uncommonW) return RARITY.UNCOMMON;
    return RARITY.COMMON;
}

function pickOfRarity(rarity, excludeIds) {
    const candidates = REWARDS.filter((r) => {
        if (r.rarity !== rarity || excludeIds.has(r.id)) return false;
        if (r.bossOnly) return false; // Boss 专属不进普通池
        return isAvailable(r);
    });
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

// Boss 专属奖励选卡（全部为稀有品质）
export function getBossRewardChoices(count) {
    const pool = REWARDS.filter((r) => r.bossOnly && isAvailable(r));
    const src = pool.length > 0
        ? pool
        : REWARDS.filter((r) => r.rarity === RARITY.RARE && !r.bossOnly && isAvailable(r));
    const shuffled = [...src].sort(() => Math.random() - 0.5);
    const used = new Set();
    const picks = [];
    for (const r of shuffled) {
        if (used.has(r.id)) continue;
        used.add(r.id);
        picks.push(r);
    }
    return picks.slice(0, count);
}

export function getRewardChoices(count, rareOnly = false) {
    const used = new Set();
    const result = [];
    const p = state.player;
    // 霉运诅咒：选卡减少
    const penalty = p.curseLuckPenalty || 0;
    count = Math.max(1, count - penalty);
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
    p.ballSpeedMul = Math.pow(0.88, n("slow_ball"));
    p.paddleBonus = n("wider_paddle") * 0.25 + n("giant_paddle") * 0.5;
    p.scoreMul = Math.pow(2, n("gold_soul"));
    p.healChance = 0.05 * n("vampire") + 0.08 * n("vampiric_gem");
    p.bossResist = n("iron_will") > 0 ? 0.5 : 0;
    p.thorns = 5 * n("thorn_armor");
    p.maxPiercing = n("piercing");
    p.extraChoices = n("lucky");
    p.skillCdMul = Math.pow(0.8, n("cd_reduction")) * Math.pow(0.85, n("rapid_cooling"));
    p.startBalls = 1 + n("dual_ball") + n("blessed_start") * 2;
    p.ballRadiusMul = 1 + 0.3 * n("giant_orb") + 0.6 * n("titan_ball");
    p.lifesaverLeft = n("lifebuoy") > 0 ? 1 : 0;
    p.entryBonus = 50 * n("entry_gain");
    p.sparkScore = 30 * n("spark_core");
    p.greedScore = 0.5 * n("greed_eye");
    p.titanDmgMul = n("titan_ball") > 0 ? 1.3 : 1;
    // Boss 专属奖励
    p.paddleBonus += 0.5 * n("titan_arm");
    p.ballDamage += 4 * n("doom_blast");
    p.skillCdMul *= Math.pow(0.7, n("time_weaver"));
    p.ballSpeedMul *= Math.pow(0.85, n("godseed"));
    p.ballDamage += 1 * n("godseed");
    p.scoreMul *= Math.pow(1.2, n("treasury"));

    // 诅咒影响
    p.curseSpeedMul = 1;
    p.curseDmgPenalty = 0;
    p.curseScoreMul = 1;
    p.curseRarePenalty = 0;
    p.curseBlockHpBonus = 0;
    p.curseShooterBonus = 0;
    p.curseBulletSpeedMul = 1;
    p.curseCdMul = 1;
    p.curseShrinkPaddle = 0;
    p.curseHitPenalty = 0;
    p.curseDensityBonus = 0;
    p.curseLaunchSpeedMul = 1;
    p.curseMoveResist = 0;
    p.curseHealPenalty = 0;
    p.curseLuckPenalty = 0;
    p.curseMaxBallsPenalty = 0;
    p.cursePiercePenalty = 0;
    p.curseBallSizeMul = 1;
    p.curseEventBonus = 0;
    p.curseFallDamage = 0;
    p.curseSkillSlotPenalty = 0;
    p.curseBulletExtraDmg = 0;

    if (p.curses) {
        for (const c of p.curses) {
            const def = CURSES_MAP?.[c.id];
            if (def) def.apply(c.count, p);
        }
    }

    // 应用诅咒数值到最终属性
    p.ballSpeedMul *= p.curseSpeedMul;
    p.ballDamage = Math.max(1, p.ballDamage - p.curseDmgPenalty);
    p.scoreMul *= p.curseScoreMul;
    p.skillCdMul *= p.curseCdMul;
    p.paddleBonus = Math.max(-0.5, p.paddleBonus - p.curseShrinkPaddle);
    p.maxPiercing = Math.max(0, p.maxPiercing - p.cursePiercePenalty);
    p.ballRadiusMul *= p.curseBallSizeMul;
    p.extraChoices = Math.max(0, p.extraChoices - p.curseLuckPenalty);
    p.lifesaverLeft = Math.max(0, p.lifesaverLeft - p.curseLuckPenalty * 0.2);
    if (p.curseSkillSlotPenalty > 0) {
        while (p.skills.length > 1) p.skills.pop();
    }

    // 守卫核心：每关护盾
    if (n("guardian_core") > 0) p.shieldTimer = 120;
}

// ─── 主动技能 ─────────────────────────────────────────────
export function useSkillFromGame(index) {
    const s = state.player.skills[index];
    if (!s) return;
    const def = REWARD_MAP[s.id];
    if (s.cd > 0) {
        spawnFloatingText(400, 240, "技能冷却中", "#ff8080");
        return;
    }
    def.use();
    s.cd = Math.round(def.cooldown * 60 * state.player.skillCdMul);
    // 弹幕领主：释放技能时额外发射 3 个球
    if (state.player.perks.danmaku_lord) spawnExtraBalls(3);
    playSkillUse();
    spawnFloatingText(400, 240, `${def.name}！`, "#7dff9b");
}

// ─── 球与时间缩放 ─────────────────────────────────────────
export function spawnExtraBalls(count) {
    if (state.balls.length === 0) return;
    const maxAllowed = Math.max(0, MAX_BALLS - (state.player.curseMaxBallsPenalty || 0) - state.balls.length);
    const actual = Math.min(count, maxAllowed);
    if (actual <= 0) return;
    const baseSpeed = state.balls.length > 0 ? state.balls[0].speed : BALL_BASE_SPEED * state.player.ballSpeedMul;
    for (let i = 0; i < actual; i++) {
        const angle = ((Math.random() * 60 - 30 - 90) * Math.PI) / 180;
        state.balls.push({
            x: state.paddle.x + state.paddle.width / 2,
            y: state.paddle.y - 10,
            vx: Math.cos(angle) * baseSpeed,
            vy: Math.sin(angle) * baseSpeed,
            speed: baseSpeed,
            radius: BALL_RADIUS * state.player.ballRadiusMul,
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
    for (const b of state.balls) { b.speed *= factor; b.vx *= factor; b.vy *= factor; }
}

export function restoreTimeScale() {
    const p = state.player;
    if (!p.slowFactor || p.slowFactor === 1) return;
    const f = 1 / p.slowFactor;
    for (const b of state.balls) { b.speed *= f; b.vx *= f; b.vy *= f; }
    p.slowFactor = 1;
    p.slowTill = 0;
}

export function currentSpeedScale() {
    const p = state.player;
    return p.slowTill > state.time ? p.slowFactor : 1;
}