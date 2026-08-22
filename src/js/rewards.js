import { RARITY, MAX_BALLS, BALL_BASE_SPEED, BALL_RADIUS } from "./constants.js";
import { state, addScore } from "./state.js";
import { spawnFloatingText } from "./fx.js";
import { playSkillUse } from "./sound.js";
import { isRewardUnlocked } from "./unlocks.js";
import { CURSES_MAP } from "./curses.js";
import { REWARD_DATA, REWARD_TYPE_NAME } from "./data/rewards.js";
import { PAL } from "./palette.js";

// ─── 数据与行为绑定 ───────────────────────────────────────
// 奖励的即时生效效果（applyId → 函数）
const APPLY_EFFECTS = {
    lives1() { state.player.lives += 1; },
    lives2() { state.player.lives += 2; },
    score500() { addScore(500); },
    score2000() { addScore(2000); },
    crown() { state.player.lives += 3; addScore(500); },
};

// 主动技能的释放效果（按技能 id）
const USE_EFFECTS = {
    ghost() { state.player.ghostTimer = 180; },
    slow_time() { applyTimeScale(0.6, 480); },
    energy_shield() { state.player.shieldTimer = 480; },
    blast_charge() { state.player.explosiveTimer = 300; },
    barrage() { spawnExtraBalls(5); },
    power_strike() { state.player.strikeTimer = 300; },
    time_freeze() { state.player.freezeTimer = 240; },
    jade_stars() { spawnExtraBalls(3); },
    jade_shield() { state.player.shieldTimer = 360; },
    crimson_storm() { spawnExtraBalls(2); },
    blood_siphon() { state.player.siphonTimer = 480; },
    golden_shield() { state.player.shieldTimer = 360; },
    wealth_rain() { addScore(2000); },
    jade_barrier() { state.player.shieldTimer = 300; },
    swift_blade() { state.player.strikeTimer = 300; },
    golden_blessing() { addScore(500); state.player.scoreMul *= 2; state.player._wealthTimer = 480; },
};

export const REWARDS = REWARD_DATA.map((r) => ({
    ...r,
    apply: r.applyId ? (APPLY_EFFECTS[r.applyId] || null) : undefined,
    use: r.type === "skill" ? (USE_EFFECTS[r.id] || null) : undefined,
}));

export const REWARD_MAP = Object.fromEntries(REWARDS.map((r) => [r.id, r]));
const stackCount = (id) => (state.player ? (state.player.perks[id] || 0) : 0);

function isAvailable(r) {
    if (r.skinOnly) return false; // 皮肤开场技能不进池
    if (r.tierLock !== undefined && !isRewardUnlocked(r.id)) return false;
    if (r.type === "skill") return !state.player.skills.some((s) => s.id === r.id);
    return (r.maxStacks ?? 1) > stackCount(r.id);
}

// ─── 选卡逻辑 ─────────────────────────────────────────────
function rollRarity(level = 1) {
    const p = state.player;
    // 随关卡提升降低稀有度
    const levelPenalty = Math.min(12, Math.floor((level - 1) / 2));
    // 随 Boss 击败次数降低奖励质量（最后一层约 1/3）
    const bossDefeated = p.bossDefeated || 0;
    const bossPenalty = bossDefeated * 8;
    let commonW = 60 + levelPenalty * 3 + bossPenalty;
    let uncommonW = 30 - levelPenalty - bossPenalty * 0.5;
    let rareW = 10 + (p ? stackCount("compass") * 10 : 0) + (p.luckyBonus || 0) - levelPenalty * 0.5 - bossPenalty * 0.5;
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
    const level = p.level || 1;
    const penalty = p.curseLuckPenalty || 0;
    count = Math.max(1, count - penalty);
    for (let i = 0; i < count; i++) {
        const rarity = rareOnly ? RARITY.RARE : rollRarity(level);
        let pick = pickOfRarity(rarity, used);
        if (!pick) pick = pickOfRarity(rareOnly ? RARITY.RARE : rollRarity(level), used);
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
    // 奖励缩放：随 Boss 击败次数降低效果（最后一层约 1/3）
    const bossDefeated = p.bossDefeated || 0;
    const rewardScale = Math.max(0.33, 1 - bossDefeated * 0.12);
    p.ballDamage = 1 + Math.round((n("power_ball") + n("mega_ball") * 2 + n("annihil_ball") * 3 + n("double_strike") * 2) * rewardScale);
    p.ballSpeedMul = Math.pow(0.88, n("slow_ball")) * Math.pow(1.05, n("double_strike"));
    p.paddleBonus = (n("wider_paddle") * 0.25 + n("giant_paddle") * 0.5) * rewardScale;
    p.scoreMul = Math.pow(2, n("gold_soul"));
    p.healChance = 0.025 * n("vampire") + 0.05 * n("vampiric_gem");
    p.bossResist = n("iron_will") > 0 ? 0.5 : 0;
    p.thorns = 5 * n("thorn_armor");
    p.maxPiercing = n("piercing");
    p.extraChoices = n("lucky");
    p.skillCdMul = Math.pow(0.8, n("cd_reduction")) * Math.pow(0.85, n("rapid_cooling"));
    // 新增奖励
    p.moveSpeedMul = 1 + 0.15 * n("swift_move");
    p.lifeSiphon = n("life_siphon") > 0 ? 0.1 : 0;
    p.luckyBonus = 5 * n("lucky_charm");
    p.bounceShield = n("bounce_shield") > 0 ? 0.15 : 0;
    p.startBalls = 1 + n("dual_ball") + n("blessed_start") * 2;
    p.ballRadiusMul = 1 + 0.3 * n("giant_orb") + 0.6 * n("titan_ball");
    p.lifesaverLeft = n("lifebuoy") > 0 ? 1 : 0;
    p.entryBonus = 50 * n("entry_gain");
    p.sparkScore = 30 * n("spark_core");
    p.greedScore = 0.5 * n("greed_eye");
    p.titanDmgMul = n("titan_ball") > 0 ? 1.3 : 1;
    // Boss 专属奖励（也受 rewardScale 影响）
    p.paddleBonus += 0.5 * n("titan_arm") * rewardScale;
    p.ballDamage += Math.round(4 * n("doom_blast") * rewardScale);
    p.skillCdMul *= Math.pow(0.7, n("time_weaver"));
    p.ballSpeedMul *= Math.pow(0.85, n("godseed"));
    p.ballDamage += Math.round(1 * n("godseed") * rewardScale);
    p.scoreMul *= Math.pow(1.2, n("treasury"));

    // 诅咒影响
    p.curseSpeedMul = 1;
    p.curseDmgPenalty = 0;
    p.curseScoreMul = 1;
    p.curseRarePenalty = 0;
    p.curseBlockHpBonus = 0;
    p.curseArmoredBonus = 0;
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
    p.curseEventReduce = 0;
    p.curseFallDamage = 0;
    p.curseSkillSlotPenalty = 0;
    p.curseBulletExtraDmg = 0;
    p.curseSecondDmgPenalty = 0;
    p.curseFog = 0;
    p.curseDecel = 0;
    p.curseChoicePenalty = 0;
    p.curseExtraHitDmg = 0;

    if (p.curses) {
        for (const c of p.curses) {
            const def = CURSES_MAP?.[c.id];
            if (def) def.apply(c.count, p);
        }
    }

    // 应用诅咒数值到最终属性
    p.ballSpeedMul *= p.curseSpeedMul;
    p.ballDamage = Math.max(1, p.ballDamage - p.curseDmgPenalty - p.curseSecondDmgPenalty);
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
        spawnFloatingText(400, 240, "技能冷却中", PAL.blood3);
        return;
    }
    def.use();
    s.cd = Math.round(def.cooldown * 60 * state.player.skillCdMul * (state.player.altarCdP || 1));
    // 弹幕领主：释放技能时额外发射 3 个球
    if (state.player.perks.danmaku_lord) spawnExtraBalls(3);
    playSkillUse();
    spawnFloatingText(400, 240, `${def.name}！`, PAL.moss3);
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
            poisonTimer: 0,
            poisonImmune: 0,
            isMain: false,
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

// 类型名称（re-export 保持原接口）
export { REWARD_TYPE_NAME };