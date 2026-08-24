// ═══ Boss 数据（纯数据） ═══
// bossType: executor近战导师 / mother腐化母体 / hive机械蜂巢 / priest诅咒司祭
// skills: 可用技能池（冲锋/跳砸/召唤/大招）
// patterns: 弹幕模式（辅助威胁）

export const BOSS_CANDIDATES = {
    10: [
        {
            name: "铁壁执行者", color: "#5aa7ff", hp: 80, bulletSpeed: 1.35,
            bossType: "executor", tier: 0,
            skills: ["charge", "slam"],
            patterns: ["fan", "ring"],
            desc: "近战冲撞型，正面减伤，诱导撞墙后输出",
        },
        {
            name: "回旋机兵", color: "#57d39a", hp: 80, bulletSpeed: 1.30,
            bossType: "executor", tier: 0,
            skills: ["charge", "slam"],
            patterns: ["spiral", "fan"],
            desc: "近战冲撞型，正面减伤，诱导撞墙后输出",
        },
    ],
    20: [
        {
            name: "腐化母体", color: "#b26bff", hp: 125, bulletSpeed: 1.50,
            bossType: "mother", tier: 1,
            skills: ["summon", "slam"],
            patterns: ["ring", "split"],
            desc: "召唤腐化植物，治疗花与毒花并存",
        },
        {
            name: "剧毒核心", color: "#e05a5a", hp: 125, bulletSpeed: 1.45,
            bossType: "mother", tier: 1,
            skills: ["summon", "slam"],
            patterns: ["wave", "ring"],
            desc: "召唤腐化植物，治疗花与毒花并存",
        },
    ],
    30: [
        {
            name: "机械蜂巢", color: "#ff5a8c", hp: 280, bulletSpeed: 1.65,
            bossType: "hive", tier: 2,
            skills: ["summon"],
            patterns: ["fan", "homing", "split"],
            desc: "三阶段：纯弹幕 → 部署无人机 → 主炮激光",
        },
        {
            name: "蜂群母舰", color: "#e8a33d", hp: 280, bulletSpeed: 1.60,
            bossType: "hive", tier: 2,
            skills: ["summon"],
            patterns: ["spiral", "homing"],
            desc: "三阶段：纯弹幕 → 部署无人机 → 主炮激光",
        },
    ],
    40: [
        {
            name: "诅咒司祭", color: "#ff3333", hp: 415, bulletSpeed: 1.80,
            bossType: "priest", tier: 3,
            skills: ["altar", "slam", "charge"],
            patterns: ["fan", "homing", "split"],
            desc: "召唤诅咒祭坛，摧毁祭坛解除诅咒",
        },
        {
            name: "虚空司祭", color: "#8f5fe8", hp: 415, bulletSpeed: 1.75,
            bossType: "priest", tier: 3,
            skills: ["altar", "slam", "charge"],
            patterns: ["spiral", "wave", "ring"],
            desc: "召唤诅咒祭坛，摧毁祭坛解除诅咒",
        },
    ],
    // 待设计
    50: [
        {
            name: "终焉审判", color: "#ff2222", hp: 600, bulletSpeed: 2.00,
            bossType: "priest", tier: 4,
            skills: ["altar", "slam", "charge"],
            patterns: ["fan", "homing", "split", "ring"],
            desc: "最终审判：诅咒祭坛与密集弹幕的终局",
        },
        {
            name: "虚空领主", color: "#6a2be0", hp: 600, bulletSpeed: 1.95,
            bossType: "priest", tier: 4,
            skills: ["altar", "slam", "charge"],
            patterns: ["spiral", "homing", "wave", "ring"],
            desc: "最终审判：诅咒祭坛与密集弹幕的终局",
        },
    ],
};

export const BOSS_TIER_INDEX = [10, 20, 30, 40, 50];