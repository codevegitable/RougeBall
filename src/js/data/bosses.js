// ═══ Boss 数据（纯数据） ═══
// bossType: executor近战导师 / mother腐化母体 / hive机械蜂巢 / priest诅咒司祭
// skills: 可用技能池（冲锋/跳砸/召唤/大招）
// patterns: 弹幕模式（辅助威胁）

export const BOSS_CANDIDATES = {
    15: [
        {
            name: "铁壁执行者", color: "#6a80d4", hp: 100, bulletSpeed: 1.8,
            bossType: "executor", tier: 0,
            skills: ["charge", "slam"],
            patterns: ["fan", "ring"],
            desc: "近战冲撞型，正面减伤，诱导撞墙后输出",
        },
        {
            name: "回旋机兵", color: "#63a563", hp: 105, bulletSpeed: 1.6,
            bossType: "executor", tier: 0,
            skills: ["charge", "slam"],
            patterns: ["spiral", "fan"],
            desc: "近战冲撞型，正面减伤，诱导撞墙后输出",
        },
    ],
    30: [
        {
            name: "腐化母体", color: "#cfa0e4", hp: 220, bulletSpeed: 2.0,
            bossType: "mother", tier: 1,
            skills: ["summon", "slam"],
            patterns: ["ring", "split"],
            desc: "召唤腐化植物，治疗花与毒花并存",
        },
        {
            name: "剧毒核心", color: "#cf4455", hp: 230, bulletSpeed: 1.9,
            bossType: "mother", tier: 1,
            skills: ["summon", "slam"],
            patterns: ["wave", "ring"],
            desc: "召唤腐化植物，治疗花与毒花并存",
        },
    ],
    45: [
        {
            name: "机械蜂巢", color: "#f07d84", hp: 460, bulletSpeed: 2.2,
            bossType: "hive", tier: 2,
            skills: ["summon", "slam", "charge"],
            patterns: ["fan", "split"],
            desc: "部署无人机：修复/护盾/自爆",
        },
        {
            name: "蜂群母舰", color: "#e0af38", hp: 480, bulletSpeed: 2.1,
            bossType: "hive", tier: 2,
            skills: ["summon", "slam", "charge"],
            patterns: ["spiral", "homing"],
            desc: "部署无人机：修复/护盾/自爆",
        },
    ],
    50: [
        {
            name: "诅咒司祭", color: "#cf4455", hp: 820, bulletSpeed: 2.4,
            bossType: "priest", tier: 3,
            skills: ["altar", "slam", "charge"],
            patterns: ["fan", "homing", "split"],
            desc: "召唤诅咒祭坛，摧毁祭坛解除诅咒",
        },
        {
            name: "虚空司祭", color: "#a464c4", hp: 860, bulletSpeed: 2.3,
            bossType: "priest", tier: 3,
            skills: ["altar", "slam", "charge"],
            patterns: ["spiral", "wave", "ring"],
            desc: "召唤诅咒祭坛，摧毁祭坛解除诅咒",
        },
    ],
};

export const BOSS_TIER_INDEX = [15, 30, 45, 50];