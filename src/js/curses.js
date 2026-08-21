// 诅咒系统逻辑：读取诅咒数据并绑定效果
import { state } from "./state.js";
import { CURSE_DATA, BOSS_CURSE_DATA, HEAVY_CURSE_DATA } from "./data/curses.js";

const CURSE_EFFECTS = {
    swift(n, p) { p.curseSpeedMul *= (1 + n * 0.04); },
    rust(n, p) { p.curseDmgPenalty += Math.min(n, 3); },
    barren(n, p) { p.curseScoreMul *= (1 - n * 0.06); },
    dim(n, p) { p.curseRarePenalty += n * 3; },
    fortify(n, p) { p.curseBlockHpBonus += Math.floor(n / 2); },
    arm(n, p) { p.curseShooterBonus += n * 0.02; },
    bullet(n, p) { p.curseBulletSpeedMul *= (1 + n * 0.04); },
    cd(n, p) { p.curseCdMul *= (1 + n * 0.08); },
    shrink(n, p) { p.curseShrinkPaddle += n * 0.04; },
    hitbox(n, p) { p.curseHitPenalty += n * 0.08; },
    dense(n, p) { p.curseDensityBonus += n * 0.03; },
    launch(n, p) { p.curseLaunchSpeedMul *= (1 + n * 0.06); },
    sticky(n, p) { p.curseMoveResist += n * 0.10; },
    heal(n, p) { p.curseHealPenalty += n * 0.25; },
    misfortune(n, p) { p.curseLuckPenalty += n; },
    overcrowd(n, p) { p.curseMaxBallsPenalty += n; },
    ethereal(n, p) { p.cursePiercePenalty += n; },
    blur(n, p) { p.curseBallSizeMul *= (1 - n * 0.06); },
    accident(n, p) { p.curseEventReduce += Math.min(n * 0.08, 0.08); },
    slowfall(n, p) { p.curseFallDamage += n * 0.5; },
    // 新增诅咒
    weakness(n, p) { p.curseSecondDmgPenalty += n; },
    fog(n, p) { p.curseFog = Math.min(1, (p.curseFog || 0) + n * 0.15); },
    decay(n, p) { p.curseDecel += n * 0.02; },
    echo(n, p) { p.curseChoicePenalty += n; },
    thorn(n, p) { p.curseExtraHitDmg += n * 0.5; },
    // Boss 诅咒
    void_mark(n, p) { p.curseBulletExtraDmg += 1; },
    chaos_grasp(n, p) { p.curseSpeedMul *= 1.2; },
    time_warp(n, p) { p.curseCdMul *= 1.3; },
    shadow_clone(n, p) { p.curseHitPenalty += 0.3; },
    void_rift(n, p) { p.curseFallDamage += 0.5; },
    fate_seal(n, p) { /* 逻辑在 setupCurseSelect 中处理：强制只有 1 项可选 */ },
    // 重诅咒
    blood_oath(n, p) { p.curseFallDamage += 1; },
    seal(n, p) { p.curseSkillSlotPenalty = 1; },
    cataclysm(n, p) { p.curseBlockHpBonus += 2; p.curseDensityBonus += 0.10; },
    blind(n, p) { p.curseLuckPenalty += 1; p.curseRarePenalty += 15; },
    martyr(n, p) { p.curseBulletExtraDmg = 1; },
};

export const CURSES = CURSE_DATA.map((c) => ({ ...c, apply: CURSE_EFFECTS[c.id] }));
export const BOSS_CURSES = BOSS_CURSE_DATA.map((c) => ({ ...c, apply: CURSE_EFFECTS[c.id] }));
export const HEAVY_CURSES = HEAVY_CURSE_DATA.map((c) => ({ ...c, apply: CURSE_EFFECTS[c.id] }));

export const CURSES_MAP = Object.fromEntries([...CURSES, ...BOSS_CURSES, ...HEAVY_CURSES].map((c) => [c.id, c]));

export function rollCurse(level = 1) {
    const pool = rollCursePool(level);
    return pool[Math.floor(Math.random() * pool.length)];
}

// 根据关卡筛选合理的诅咒池（核心数值类诅咒更晚出现）
export function rollCursePool(level = 1) {
    const heavyIds = ["slowfall", "misfortune", "overcrowd", "ethereal"];
    const sensitiveAt = {
        rust: 30, fortify: 30, heal: 20, shrink: 12,
        hitbox: 15, bullet: 18, launch: 14, sticky: 16,
        dense: 18, arm: 20, accident: 22,
    };
    const p = state.player;
    // 防归零防护：某些诅咒在数值已低时降低概率，到1时不出
    const lowValueProtection = {
        misfortune: (p.extraChoices || 0) <= 0,    // 选卡已为0
        overcrowd: (p.curseMaxBallsPenalty || 0) >= 9, // 球上限已到最低
        ethereal: (p.maxPiercing || 0) <= 0,        // 穿透已为0
        shrink: (p.paddleBonus || 0) <= -0.5,       // 挡板已缩到最小
        rust: (p.ballDamage || 1) <= 1,             // 伤害已为1
    };
    return CURSES.filter((c) => {
        if (c.id === "slowfall") return false;
        if (level <= 15 && heavyIds.includes(c.id)) return false;
        if (sensitiveAt[c.id] && level < sensitiveAt[c.id]) return false;
        // 防归零：数值已到1时彻底不出，接近时概率降低
        if (lowValueProtection[c.id]) return false;
        if (c.id === "misfortune" && (p.extraChoices || 0) <= 1 && Math.random() < 0.6) return false;
        if (c.id === "overcrowd" && (10 - (p.curseMaxBallsPenalty || 0)) <= 3 && Math.random() < 0.5) return false;
        if (c.id === "rust" && (p.ballDamage || 1) <= 2 && Math.random() < 0.5) return false;
        return true;
    });
}

export function rollBossCurse() {
    return BOSS_CURSES[Math.floor(Math.random() * BOSS_CURSES.length)];
}

export function applyCurseStack(curseId, count, p) {
    const def = CURSES_MAP[curseId];
    if (!def) return;
    if (!p.curses) p.curses = [];
    const existing = p.curses.find((c) => c.id === curseId);
    if (existing) existing.count += count;
    else p.curses.push({ id: curseId, count });
    def.apply(count, p);
}

export function applyHeavyCurse(curseId, p) {
    const def = HEAVY_CURSES.find((c) => c.id === curseId);
    if (!def) return;
    if (!p.curses) p.curses = [];
    p.curses.push({ id: curseId, count: 1 });
    def.apply(1, p);
}

export function rollHeavyCurse() {
    return HEAVY_CURSES[Math.floor(Math.random() * HEAVY_CURSES.length)];
}