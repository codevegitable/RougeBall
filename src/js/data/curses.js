// ═══ 诅咒数据（纯数据，无逻辑） ═══
// tier: "normal" / "boss"（仅 Boss 掉落） / "heavy"（仅事件）
// effectId: 由 curses.js 解释执行

export const CURSE_DATA = [
    { id: "swift", name: "轻风", icon: "💨", tier: "normal", desc: (n) => `球速度 +${n * 4}%` },
    { id: "rust", name: "锈蚀", icon: "🦀", tier: "normal", desc: (n) => `球伤害 -${Math.min(n, 3)}` },
    { id: "dim", name: "晦暗", icon: "🌑", tier: "normal", desc: (n) => `稀有奖励概率 -${n * 3}%` },
    { id: "fortify", name: "加固", icon: "🛡️", tier: "normal", desc: (n) => `方块血量 +${Math.ceil(n / 2)}` },
    { id: "arm", name: "重甲", icon: "🛠️", tier: "normal", desc: (n) => `重甲方块概率 +${n * 3}%` },
    { id: "bullet", name: "弹幕加速", icon: "💫", tier: "normal", desc: (n) => `敌弹速度 +${n * 4}%` },
    { id: "cd", name: "迟缓", icon: "🐌", tier: "normal", desc: (n) => `技能 CD +${n * 8}%` },
    { id: "shrink", name: "收缩", icon: "📏", tier: "normal", desc: (n) => `挡板宽度 -${n * 4}%` },
    { id: "hitbox", name: "臃肿", icon: "🎯", tier: "normal", desc: (n) => `受击面积 +${n * 8}%` },
    { id: "dense", name: "密林", icon: "🌿", tier: "normal", desc: (n) => `方块密度 +${n * 3}%` },
    { id: "launch", name: "疾射", icon: "🏹", tier: "normal", desc: (n) => `发射时球初始速度 +${n * 6}%` },
    { id: "sticky", name: "黏滞", icon: "🫧", tier: "normal", desc: (n) => `挡板响应 -${n * 10}%` },
    { id: "heal", name: "碎心", icon: "🩸", tier: "normal", desc: (n) => `治疗效果 -${n * 25}%` },
    { id: "misfortune", name: "霉运", icon: "🍂", tier: "normal", desc: (n) => `奖励选卡 -${n}` },
    { id: "overcrowd", name: "拥堵", icon: "🚦", tier: "normal", desc: (n) => `多球上限 -${n}` },
    { id: "ethereal", name: "虚体", icon: "👻", tier: "normal", desc: (n) => `穿透次数 -${n}` },
    { id: "blur", name: "迷眼", icon: "🌀", tier: "normal", desc: (n) => `球体积 -${n * 6}%` },
    { id: "accident", name: "厄运", icon: "⚠️", tier: "normal", desc: (n) => `事件房概率 -${Math.min(n * 8, 8)}%` },
    { id: "slowfall", name: "坠落", icon: "💧", tier: "normal", desc: (n) => `球落地额外扣 ${n * 0.5} 命` },
    // ═══ 新增诅咒 ═══
    { id: "weakness", name: "虚弱", icon: "🦴", tier: "normal", desc: (n) => `球伤害额外 -${n}` },
    { id: "fog", name: "迷雾", icon: "🌫️", tier: "normal", desc: (n) => `暗角增强${n > 1 ? ` ×${n}` : ""}，视野缩小` },
    { id: "decay", name: "震荡", icon: "💢", tier: "normal", desc: (n) => `每次击碎方块球速 +${n * 1.5}%` },
    { id: "echo", name: "诅咒回响", icon: "🔊", tier: "normal", desc: (n) => `诅咒可选项 -${Math.min(n, 2)} 项` },
    { id: "thorn", name: "荆棘", icon: "🌵", tier: "normal", desc: (n) => `受击时额外扣 ${n * 0.5} 命` },
];

export const BOSS_CURSE_DATA = [
    { id: "void_mark", name: "虚空印记", icon: "☠️", tier: "boss", desc: () => "被弹幕击中额外 -1 命" },
    { id: "chaos_grasp", name: "混沌引力", icon: "🌀", tier: "boss", desc: () => "球速 +20%" },
    { id: "time_warp", name: "时间扭曲", icon: "⏰", tier: "boss", desc: () => "技能冷却 +30%" },
    { id: "shadow_clone", name: "暗影分身", icon: "👥", tier: "boss", desc: () => "受击面积 +30%" },
    { id: "void_rift", name: "虚空裂隙", icon: "🕳️", tier: "boss", desc: () => "球落地额外扣 0.5 命" },
    { id: "fate_seal", name: "命运封印", icon: "🔮", tier: "boss", desc: () => "诅咒选择时仅 1 项可选，且无法跳过" },
];

export const HEAVY_CURSE_DATA = [
    { id: "blood_oath", name: "血誓", icon: "🩸", tier: "heavy", desc: () => "球落地额外 -1 命" },
    { id: "seal", name: "封印", icon: "🔒", tier: "heavy", desc: () => "技能槽 -1，第 2 槽被封印不可用" },
    { id: "cataclysm", name: "灾厄", icon: "🌋", tier: "heavy", desc: () => "所有方块血量 +2，密度 +10%" },
    { id: "blind", name: "蒙蔽", icon: "🕶️", tier: "heavy", desc: () => "奖励选卡 -1，稀有概率 -15%" },
    { id: "martyr", name: "殉爆", icon: "💥", tier: "heavy", desc: () => "被弹幕击中额外 -1 命" },
];