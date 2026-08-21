// 诅咒系统：每关获得一个负面效果，强度随层数递增
// 常规诅咒 20 种（事件内可给重诅咒）
export const CURSES = [
    {
        id: "swift", name: "轻风", icon: "💨", tier: "normal",
        desc: (n) => `球速度 +${n * 4}%`,
        apply(n, p) { p.curseSpeedMul *= (1 + n * 0.04); },
    },
    {
        id: "rust", name: "锈蚀", icon: "🦀", tier: "normal",
        desc: (n) => `球伤害 -${Math.min(n, 3)}`,
        apply(n, p) { p.curseDmgPenalty += Math.min(n, 3); },
    },
    {
        id: "barren", name: "贫瘠", icon: "🏜️", tier: "normal",
        desc: (n) => `分数获取 -${n * 6}%`,
        apply(n, p) { p.curseScoreMul *= (1 - n * 0.06); },
    },
    {
        id: "dim", name: "晦暗", icon: "🌑", tier: "normal",
        desc: (n) => `稀有奖励概率 -${n * 3}%`,
        apply(n, p) { p.curseRarePenalty += n * 3; },
    },
    {
        id: "fortify", name: "加固", icon: "🛡️", tier: "normal",
        desc: (n) => `方块血量 +${Math.floor(n / 2)}`,
        apply(n, p) { p.curseBlockHpBonus += Math.floor(n / 2); },
    },
    {
        id: "arm", name: "武装", icon: "🔫", tier: "normal",
        desc: (n) => `射击方块概率 +${n * 2}%`,
        apply(n, p) { p.curseShooterBonus += n * 0.02; },
    },
    {
        id: "bullet", name: "弹幕加速", icon: "💫", tier: "normal",
        desc: (n) => `敌弹速度 +${n * 4}%`,
        apply(n, p) { p.curseBulletSpeedMul *= (1 + n * 0.04); },
    },
    {
        id: "cd", name: "迟缓", icon: "🐌", tier: "normal",
        desc: (n) => `技能 CD +${n * 8}%`,
        apply(n, p) { p.curseCdMul *= (1 + n * 0.08); },
    },
    {
        id: "shrink", name: "收缩", icon: "📏", tier: "normal",
        desc: (n) => `挡板宽度 -${n * 4}%`,
        apply(n, p) { p.curseShrinkPaddle += n * 0.04; },
    },
    {
        id: "hitbox", name: "臃肿", icon: "🎯", tier: "normal",
        desc: (n) => `受击面积 +${n * 8}%`,
        apply(n, p) { p.curseHitPenalty += n * 0.08; },
    },
    {
        id: "dense", name: "密林", icon: "🌿", tier: "normal",
        desc: (n) => `方块密度 +${n * 3}%`,
        apply(n, p) { p.curseDensityBonus += n * 0.03; },
    },
    {
        id: "launch", name: "疾射", icon: "🏹", tier: "normal",
        desc: (n) => `发球速度 +${n * 6}%`,
        apply(n, p) { p.curseLaunchSpeedMul *= (1 + n * 0.06); },
    },
    {
        id: "sticky", name: "黏滞", icon: "🫧", tier: "normal",
        desc: (n) => `挡板响应 -${n * 10}%`,
        apply(n, p) { p.curseMoveResist += n * 0.10; },
    },
    {
        id: "heal", name: "碎心", icon: "🩸", tier: "normal",
        desc: (n) => `治疗效果 -${n * 25}%`,
        apply(n, p) { p.curseHealPenalty += n * 0.25; },
    },
    {
        id: "misfortune", name: "霉运", icon: "🍂", tier: "normal",
        desc: (n) => `奖励选卡 -${n}`,
        apply(n, p) { p.curseLuckPenalty += n; },
    },
    {
        id: "overcrowd", name: "拥堵", icon: "🚦", tier: "normal",
        desc: (n) => `多球上限 -${n}`,
        apply(n, p) { p.curseMaxBallsPenalty += n; },
    },
    {
        id: "ethereal", name: "虚体", icon: "👻", tier: "normal",
        desc: (n) => `穿透次数 -${n}（至少 0）`,
        apply(n, p) { p.cursePiercePenalty += n; },
    },
    {
        id: "blur", name: "迷眼", icon: "🌀", tier: "normal",
        desc: (n) => `球体积 -${n * 6}%`,
        apply(n, p) { p.curseBallSizeMul *= (1 - n * 0.06); },
    },
    {
        id: "accident", name: "事故", icon: "⚠️", tier: "normal",
        desc: (n) => `事件房概率 +${n * 5}%`,
        apply(n, p) { p.curseEventBonus += n * 0.05; },
    },
    {
        id: "slowfall", name: "坠落", icon: "💧", tier: "normal",
        desc: (n) => `球落地额外扣 ${n * 0.5} 命`,
        apply(n, p) { p.curseFallDamage += n * 0.5; },
    },
];

// 重诅咒（仅事件惩罚出现）
export const HEAVY_CURSES = [
    {
        id: "blood_oath", name: "血誓", icon: "🩸", tier: "heavy",
        desc: () => "球落地额外 -1 命",
        apply(n, p) { p.curseFallDamage += 1; },
    },
    {
        id: "seal", name: "封印", icon: "🔒", tier: "heavy",
        desc: () => "技能槽 -1，第 2 槽被封印不可用",
        apply(n, p) { p.curseSkillSlotPenalty = 1; },
    },
    {
        id: "cataclysm", name: "灾厄", icon: "🌋", tier: "heavy",
        desc: () => "所有方块血量 +2，密度 +10%",
        apply(n, p) { p.curseBlockHpBonus += 2; p.curseDensityBonus += 0.10; },
    },
    {
        id: "blind", name: "蒙蔽", icon: "🕶️", tier: "heavy",
        desc: () => "奖励选卡 -1，稀有概率 -15%",
        apply(n, p) { p.curseLuckPenalty += 1; p.curseRarePenalty += 15; },
    },
    {
        id: "martyr", name: "殉爆", icon: "💥", tier: "heavy",
        desc: () => "被弹幕击中额外 -1 命",
        apply(n, p) { p.curseBulletExtraDmg = 1; },
    },
];

export const CURSES_MAP = Object.fromEntries([...CURSES, ...HEAVY_CURSES].map((c) => [c.id, c]));

// 从常规池随机选一个诅咒（可多次叠加同一诅咒，强度相加）
export function rollCurse() {
    const pool = CURSES.filter((c) => c.id !== "slowfall"); // 坠落太负面，只放事件
    return pool[Math.floor(Math.random() * pool.length)];
}

// 层级强度计算：每关累计 +1，旧诅咒再叠加一次或随机新诅咒
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