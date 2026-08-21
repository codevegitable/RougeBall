// ═══ Boss 数据（纯数据） ═══
// 每层 2 个候选，弹幕风格各异
// patterns: fan扇形 / ring环形 / split分裂 / wave波浪 / homing追踪 / spiral螺旋

export const BOSS_CANDIDATES = {
    15: [
        { name: "晶核守卫", color: "#5aa7ff", hp: 80, bulletSpeed: 1.6, patterns: ["fan", "ring"] },
        { name: "回旋机兵", color: "#57d39a", hp: 85, bulletSpeed: 1.4, patterns: ["spiral", "fan"] },
    ],
    30: [
        { name: "双生魔像", color: "#b26bff", hp: 180, bulletSpeed: 1.8, patterns: ["fan", "split", "ring"] },
        { name: "暗影追猎", color: "#e05a5a", hp: 190, bulletSpeed: 1.7, patterns: ["homing", "wave"] },
    ],
    45: [
        { name: "深渊领主", color: "#ff5a8c", hp: 380, bulletSpeed: 2.0, patterns: ["fan", "split", "wave"] },
        { name: "混沌核心", color: "#e8a33d", hp: 400, bulletSpeed: 1.9, patterns: ["spiral", "ring", "homing"] },
    ],
    50: [
        { name: "终焉之心", color: "#ff3333", hp: 680, bulletSpeed: 2.1, patterns: ["fan", "split", "homing"] },
        { name: "虚空主宰", color: "#8f5fe8", hp: 720, bulletSpeed: 2.0, patterns: ["spiral", "wave", "split"] },
    ],
};

export const BOSS_TIER_INDEX = [15, 30, 45, 50];