// 诅咒系统逻辑：读取诅咒数据并绑定效果
import { CURSE_DATA, HEAVY_CURSE_DATA } from "./data/curses.js";

// 诅咒效果（按诅咒 id → 属性修改函数）
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
    accident(n, p) { p.curseEventBonus += n * 0.05; },
    slowfall(n, p) { p.curseFallDamage += n * 0.5; },
    // 重诅咒
    blood_oath(n, p) { p.curseFallDamage += 1; },
    seal(n, p) { p.curseSkillSlotPenalty = 1; },
    cataclysm(n, p) { p.curseBlockHpBonus += 2; p.curseDensityBonus += 0.10; },
    blind(n, p) { p.curseLuckPenalty += 1; p.curseRarePenalty += 15; },
    martyr(n, p) { p.curseBulletExtraDmg = 1; },
};

export const CURSES = CURSE_DATA.map((c) => ({ ...c, apply: CURSE_EFFECTS[c.id] }));
export const HEAVY_CURSES = HEAVY_CURSE_DATA.map((c) => ({ ...c, apply: CURSE_EFFECTS[c.id] }));

export const CURSES_MAP = Object.fromEntries([...CURSES, ...HEAVY_CURSES].map((c) => [c.id, c]));

// 从常规池随机选一个诅咒（可多次叠加同一诅咒，强度相加）
export function rollCurse() {
    const pool = CURSES.filter((c) => c.id !== "slowfall"); // 坠落太负面，只放事件
    return pool[Math.floor(Math.random() * pool.length)];
}

// 层级强度计算：每次获取诅咒时叠加
export function applyCurseStack(curseId, count, p) {
    const def = CURSES_MAP[curseId];
    if (!def) return;
    if (!p.curses) p.curses = [];
    const existing = p.curses.find((c) => c.id === curseId);
    if (existing) {
        existing.count += count;
    } else {
        p.curses.push({ id: curseId, count });
    }
    def.apply(count, p);
}

// 重诅咒直接应用
export function applyHeavyCurse(curseId, p) {
    const def = HEAVY_CURSES.find((c) => c.id === curseId);
    if (!def) return;
    if (!p.curses) p.curses = [];
    p.curses.push({ id: curseId, count: 1 });
    def.apply(1, p);
}

// 重诅咒随机
export function rollHeavyCurse() {
    return HEAVY_CURSES[Math.floor(Math.random() * HEAVY_CURSES.length)];
}