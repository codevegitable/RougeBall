// ═══ Boss 数据（纯数据） ═══
// bossType: executor近战导师 / mother腐化母体 / hive机械蜂巢 / priest诅咒司祭
// skills: 可用技能池（冲锋/跳砸/召唤/大招）
// patterns: 弹幕模式（辅助威胁）

// HP 与弹速由难度曲线反解得出（见 data/levels.js 的 BOSS_DIFFICULTY）：
//   目标难度 = 普通关直线值 × 凸增倍数(1.15 / 1.34 / 1.75 / 2.35)
//   HP = 目标难度 ÷ (tier 威胁系数 × 弹速修正)
// 得到 HP 序列 115 → 245 → 420 → 535（倍数 2.18x / 1.72x / 1.26x，单调递增）。
// 调整前是 82.5 → 175 → 370 → 665，末段 HP 近乎翻倍且弹幕威胁同步猛涨，
// 使最终 Boss 达到直线的 5.25 倍，"每关难度增量"从 11 直接跳到 184。
export const BOSS_CANDIDATES = {
    15: [
        {
            name: "铁壁执行者", color: "#5aa7ff", hp: 90, bulletSpeed: 1.45,
            bossType: "executor", tier: 0,
            skills: ["charge", "slam"],
            patterns: ["fan", "ring"],
            desc: "近战冲撞型，正面减伤，诱导撞墙后输出",
        },
        {
            name: "回旋机兵", color: "#57d39a", hp: 90, bulletSpeed: 1.35,
            bossType: "executor", tier: 0,
            skills: ["charge", "slam"],
            patterns: ["spiral", "fan"],
            desc: "近战冲撞型，正面减伤，诱导撞墙后输出",
        },
    ],
    30: [
        {
            name: "腐化母体", color: "#b26bff", hp: 210, bulletSpeed: 1.60,
            bossType: "mother", tier: 1,
            skills: ["summon", "slam"],
            patterns: ["ring", "split"],
            desc: "召唤腐化植物，治疗花与毒花并存",
        },
        {
            name: "剧毒核心", color: "#e05a5a", hp: 210, bulletSpeed: 1.55,
            bossType: "mother", tier: 1,
            skills: ["summon", "slam"],
            patterns: ["wave", "ring"],
            desc: "召唤腐化植物，治疗花与毒花并存",
        },
    ],
    45: [
        {
            name: "机械蜂巢", color: "#ff5a8c", hp: 392, bulletSpeed: 1.75,
            bossType: "hive", tier: 2,
            skills: ["summon"],
            patterns: ["fan", "homing", "split"],
            desc: "三阶段：纯弹幕 → 部署无人机 → 主炮激光（有预警，可打断）",
        },
        {
            name: "蜂群母舰", color: "#e8a33d", hp: 390, bulletSpeed: 1.70,
            bossType: "hive", tier: 2,
            skills: ["summon"],
            patterns: ["spiral", "homing"],
            desc: "三阶段：纯弹幕 → 部署无人机 → 主炮激光（有预警，可打断）",
        },
    ],
    50: [
        {
            name: "诅咒司祭", color: "#ff3333", hp: 485, bulletSpeed: 1.90,
            bossType: "priest", tier: 3,
            skills: ["altar", "slam", "charge"],
            patterns: ["fan", "homing", "split"],
            desc: "召唤诅咒祭坛，摧毁祭坛解除诅咒",
        },
        {
            name: "虚空司祭", color: "#8f5fe8", hp: 508, bulletSpeed: 1.85,
            bossType: "priest", tier: 3,
            skills: ["altar", "slam", "charge"],
            patterns: ["spiral", "wave", "ring"],
            desc: "召唤诅咒祭坛，摧毁祭坛解除诅咒",
        },
    ],
};

export const BOSS_TIER_INDEX = [15, 30, 45, 50];